// v6.12.0: 決断（プレイヤーが決める場面）。担当国家について、次の 7 種類は勝手に決まらず、時間を止めて選択肢を出す。
//   treaty_offer 条約の申し出（相手の国から）／peace_offer 講和の申し出／war_incoming 宣戦布告を受けたとき／ally_call 同盟国の参戦要請
//   succession 王位継承（候補者の一覧から選ぶ。幼い継承者なら摂政も）／rebellion 反乱・分離（鎮圧か譲歩か）／omen 反乱の前兆（偵察で見える）／battle 大会戦（corps-battle.js が登録）
// 決断が出るのは「人間が時間を進めている間（clockRun）」だけ。試験や一括の進行（live でない）では、旧来どおり自動で処理される（条約は評価どおり、継承・反乱は従来の確率）。
// 変更の経路: 決断の解決は命令 decision.resolve（player_order）を通る。出す側は tick の中（ctx.decisions のフック）。
import { signTreaty, TREATY, treatyBetween, atWarWith, declareWar, adjustRel } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { hashSeed } from "../civ/civ-state.js";
import { byState } from "../civ/spatial.js";
import { lifeScale } from "../civ/species.js";
import { leaderName, leaderRng } from "./domains/naming.js";
import { enthrone, runSecession, formState } from "../civ/states.js";
import { treatyFeasible, recordProposal, negotiatePeace } from "./negotiation.js";
import { OFFICES } from "./regimes.js";
import { successionList, lawJa, queueEvent } from "./succession.js";
import { fieldEngage, navalEngage, placeName, warHelpers } from "./warfare.js";
import { corpsById, serviceLoss, leadCorps, installCommander, ensureCorps } from "./corps.js";
import { landShare, navyShare } from "./power.js";
import { headsOf } from "./orbat.js";
import { createField, fieldOutcome, DOMAINS } from "./battlefield.js";
import { stateFx } from "./statefx.js";
import { timeOf, newsOf, DEFAULT_SPEED } from "./clock.js";
import { decisionsOf, pendingOf, isLive, coolUntil, setCool } from "./decision-state.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r3 = (x) => Math.round(x * 1000) / 1000;
const U = (civ, ...p) => hashSeed(civ.historySeed, "dec", ...p) / 4294967296;
const HANDLERS = {}; export const registerDecision = (kind, fn) => { HANDLERS[kind] = fn; };
export const DECISION_JA = Object.freeze({ treaty_offer: "条約の申し出", peace_offer: "講和の申し出", war_incoming: "宣戦布告", ally_call: "同盟国の参戦要請", succession: "王位の継承", rebellion: "反乱・分離", omen: "不穏の前兆", battle: "会戦", commander_death: "指揮官の戦死", pact_invite: "盟約への誘い", pact_merge: "統合の提案", event: "出来事" });

// ---- 出す・止める・解く
function hold(civ) { const T = timeOf(civ); if (!T.hold) { T.hold = true; T.resumeSpeed = T.speed; } }
function release(civ) { const T = timeOf(civ); if (T.hold && !newsOf(civ).queue.length && !pendingOf(civ).length) { T.hold = false; T.speed = T.resumeSpeed ?? DEFAULT_SPEED; T.resumeSpeed = null; } }
const openKey = (civ, key) => pendingOf(civ).some((d) => d.key === key);
/** 決断を出す。live でなければ null（呼び出し側が旧来の自動処理を行う） */
export function raise(ctx, spec) {
  const { civ } = ctx; if (!isLive(civ)) return null; const D = decisionsOf(civ);
  const d = { id: `dec_${++D.seq}`, status: "open", at: civ.monthIndex, date: { ...civ.date }, kind: spec.kind, key: spec.key ?? null, stateId: spec.stateId, title: spec.title, body: spec.body ?? "", options: spec.options, payload: spec.payload ?? {}, fresh: true };
  D.queue.push(d); hold(civ); return d;
}
/** 決断を解く（命令 decision.resolve の本体）。option は選択肢の id */
export function resolveDecision(w, { id, option, extra = null }) {
  const { civ } = w, D = decisionsOf(civ), d = D.queue.find((x) => x.id === id); if (!d) return { ok: false, error: "その決断は、すでに解決済みか存在しません" };
  const opt = d.options.find((o) => o.id === option); if (!opt) return { ok: false, error: "その選択肢はありません" }; if (opt.disabled) return { ok: false, error: opt.disabled };
  const fn = HANDLERS[d.kind]; if (!fn) return { ok: false, error: `未対応の決断: ${d.kind}` };
  const r = fn(w.sim.ctx, d, option, extra); if (!r || r.ok === false) return { ok: false, error: r?.error ?? "決断を実行できませんでした" };
  if (r.keep) return { ok: true, result: { id, step: r.step ?? null, decision: d } }; // 会戦のように、1 つの決断が複数の手番にわたるもの（解決はしない）
  D.queue = D.queue.filter((x) => x.id !== id); D.done.push({ id: d.id, kind: d.kind, stateId: d.stateId, at: d.at, resolvedAt: civ.monthIndex, title: d.title, chosen: opt.ja, note: r.note ?? null }); if (D.done.length > 60) D.done.splice(0, D.done.length - 60);
  release(civ); return { ok: true, result: { id, chosen: opt.ja, note: r.note ?? null, remaining: D.queue.length } };
}
/** 保存・読み込み・担当の切替で残った決断を整える（担当国家が変わったら、古い決断は捨てる） */
export function dropStaleDecisions(civ) {
  const D = civ.wcde?.decisions; if (!D) return; const cs = civ.wcde.control?.stateId; const keep = D.queue.filter((d) => d.stateId === cs && civ.states[d.stateId]?.alive); if (keep.length !== D.queue.length) { for (const d of D.queue) if (!keep.includes(d) && d.kind === "battle") { const c = civ.wars[d.payload.warId]?.ops?.campaigns?.[d.payload.campId]; if (c) c.waiting = null; } D.queue = keep; release(civ); }
}

// ---- 偵察能力（前兆の見え方・戦場の霧が使う）
export function scoutLevel(civ, st) {
  let intel = 0; for (const o of st.offices ?? []) if (OFFICES[o.id]?.[1] === "intel" || o.domain === "intel") intel++;
  const a = (k) => (st.techAdopted?.[k] != null ? 1 : 0);
  return clamp(0.3 + 0.12 * Math.min(3, intel) + 0.1 * a("writing") + 0.1 * a("administration") + (st.scoutBonus ?? 0) + stateFx(st).scout + (Object.values(st.intel ?? {}).some((t) => t > civ.monthIndex) ? 0.15 : 0), 0.2, 0.92);
}

// ---- 条約の申し出（アルゴリズム国家 → 担当国）
function offerTreaty(ctx, from, to, type) {
  const { civ } = ctx; if (!isLive(civ) || !to.player || from.player) return null; if (treatyFeasible(civ, from, to, type) || treatyBetween(civ, from, to, type)) return null;
  const key = `t|${from.id}|${to.id}|${type}`, pend = { ok: true, silent: true, pending: true, targetId: to.id };
  if (openKey(civ, key) || coolUntil(civ, key) > civ.monthIndex) return pend;
  const options = [{ id: "accept", ja: `${TREATY[type].ja}を結ぶ`, hint: `${TREATY[type].merit}。ただし${TREATY[type].cost}` }, { id: "decline", ja: "断る", hint: "関係がわずかに悪化" }];
  if (type === "alliance") options.splice(1, 0, { id: "counter_na", ja: "不可侵条約なら結ぶ", hint: "同盟の代わりの提案", disabled: treatyFeasible(civ, from, to, "nonaggression") || (treatyBetween(civ, from, to, "nonaggression") ? "すでに結んでいる" : null) });
  raise(ctx, { kind: "treaty_offer", key, stateId: to.id, title: TREATY[type].cat === "dep" ? `${from.name}が${TREATY[type].ja}を求めている（あなたの国が従う側）` : `${from.name}が${TREATY[type].ja}を申し出た`, body: `関係値 ${Math.round(to.relations[from.id] ?? 0)}。${TREATY[type].ja}（${Math.round(TREATY[type].months / 12)}年）。`, options, payload: { type, from: from.id, to: to.id } });
  setCool(civ, key, civ.monthIndex + 60); return pend;
}
registerDecision("treaty_offer", (ctx, d, opt) => {
  const { civ } = ctx, p = d.payload, from = civ.states[p.from], to = civ.states[p.to]; if (!from?.alive || !to?.alive) return { ok: true, note: "相手の国が消えていた" };
  if (opt === "decline") { recordProposal(ctx, { kind: "treaty", type: p.type, from: p.from, to: p.to, status: "rejected", counter: null }); adjustRel(from, to, -3); return { ok: true, note: "申し出を断った" }; }
  const type = opt === "counter_na" ? "nonaggression" : p.type; if (treatyFeasible(civ, from, to, type) || treatyBetween(civ, from, to, type) || atWarWith(civ, from, to)) return { ok: true, note: "状況が変わり、成立しなかった" };
  signTreaty(ctx, type, from, to, { provenance: "player" }); recordProposal(ctx, { kind: "treaty", type, from: p.from, to: p.to, status: "accepted", counter: null }); return { ok: true, note: `${TREATY[type].ja}を結んだ` };
});

// ---- 講和の申し出（アルゴリズム国家 → 担当国）
function offerPeace(ctx, proposer, war, other, terms) {
  const { civ } = ctx; if (!isLive(civ) || !other.player || proposer.player) return null; const key = `p|${war.id}|${proposer.id}`, pend = { ok: true, effects: [], silent: true, targetId: war.id, pending: true };
  if (openKey(civ, key) || coolUntil(civ, key) > civ.monthIndex) return pend;
  const kind = terms.kind === "reparations" ? `賠償（${Math.round(terms.amount ?? 0)}）` : terms.kind === "cession" ? "占領地の割譲（現状の保持）" : "白紙講和";
  raise(ctx, { kind: "peace_offer", key, stateId: other.id, title: `${proposer.name}が講和を申し入れた`, body: `条件: ${kind}。戦況 ${Math.round(war.sides.a.includes(other.id) ? war.score : -war.score)}（自国から見て）。`, options: [{ id: "accept", ja: "受け入れる", hint: "戦争が終わる" }, { id: "reject", ja: "拒む", hint: "戦争は続く" }], payload: { warId: war.id, from: proposer.id, to: other.id, terms } });
  setCool(civ, key, civ.monthIndex + 12); return pend;
}
registerDecision("peace_offer", (ctx, d, opt) => {
  const { civ } = ctx, p = d.payload, war = civ.wars[p.warId], from = civ.states[p.from]; if (!war || war.status !== "active" || !from?.alive) return { ok: true, note: "戦争はすでに終わっていた" };
  if (opt === "reject") { recordProposal(ctx, { kind: "peace", warId: war.id, from: p.from, to: p.to, terms: p.terms, separate: false, status: "rejected" }); return { ok: true, note: "講和を拒んだ" }; }
  const r = negotiatePeace(ctx, from, war, { terms: p.terms, withId: p.to, forceAccept: true }); return r.ok ? { ok: true, note: "講和した" } : { ok: true, note: r.error ?? "講和は成立しなかった" };
});

// ---- 宣戦布告を受けたとき（アルゴリズム国家 → 担当国）
function warIncoming(ctx, atk, def, c) {
  const { civ } = ctx; if (!isLive(civ) || !def.player || atk.player) return null; const key = `w|${atk.id}|${def.id}`, pend = { ok: true, silent: true, pending: true, targetId: def.id };
  if (atk.campaign?.target === def.id) atk.campaign.stage = "ultimatum"; // 計画は「回答待ち」で止める（アルゴリズム国家は待つ。期限切れでは断念しない）
  if (openKey(civ, key)) return pend;
  const tribute = Math.round(Math.max(0, def.treasury) * 0.25), relNow = Math.round(def.relations[atk.id] ?? 0);
  raise(ctx, { kind: "war_incoming", key, stateId: def.id, title: `${atk.name}が宣戦しようとしている`, body: `${atk.name}は、${def.name}への宣戦を通告した。回答しだいで戦争になる。関係値 ${relNow}。`, options: [{ id: "stand", ja: "受けて立つ", hint: "戦争が始まる" }, { id: "yield", ja: `要求をのむ（貢納 ${tribute}）`, hint: "戦争は避けるが、国の威信と安定が下がる", disabled: null }, { id: "plead", ja: "使節を送り和解を試みる（費用 15）", hint: "関係が良いほど成功しやすい", disabled: def.treasury >= 15 ? null : "財政が足りない" }], payload: { atk: atk.id, def: def.id, reason: c?.reason ?? "conquest", tribute } });
  return pend;
}
function startWar(ctx, atk, def, d) {
  const { civ } = ctx; if (!atk?.alive || !def?.alive || atWarWith(civ, atk, def)) return null;
  const w = declareWar(ctx, atk, def, { reason: d.payload.reason === "conquest" ? "conquest" : d.payload.reason, provenance: "simulation" }); if (atk.campaign?.target === def.id) { atk.campaign.stage = "war"; atk.campaign.warId = w.id; } return w;
}
registerDecision("war_incoming", (ctx, d, opt) => {
  const { civ } = ctx, p = d.payload, atk = civ.states[p.atk], def = civ.states[p.def]; if (!atk?.alive || !def?.alive) return { ok: true, note: "相手の国が消えていた" };
  const stand = () => { startWar(ctx, atk, def, d); return { ok: true, note: "受けて立った。戦争が始まる" }; };
  if (opt === "stand") return stand();
  if (opt === "plead") { def.treasury -= 15; const chance = clamp(0.2 + 0.5 * ((def.relations[atk.id] ?? 0) + 40) / 140, 0.1, 0.8); if (U(civ, d.id, "plead") < chance) { if (atk.campaign?.target === def.id) atk.campaign = null; atk.lastWarWith = { ...(atk.lastWarWith ?? {}), [def.id]: civ.monthIndex }; adjustRel(atk, def, 10); return { ok: true, note: "使節の説得が実り、戦争は避けられた" }; } const r = stand(); return { ...r, note: "説得は実らず、戦争が始まった" }; }
  const pay = Math.min(Math.max(0, def.treasury), p.tribute); def.treasury -= pay; atk.treasury += pay; def.stability = clamp(def.stability - 0.06); adjustRel(atk, def, 15);
  if (atk.campaign?.target === def.id) atk.campaign = null; atk.lastWarWith = { ...(atk.lastWarWith ?? {}), [def.id]: civ.monthIndex }; atk.lastWarEnd = civ.monthIndex;
  makeEvent(civ, ctx.ids, { kind: "state_action", title: `${def.name}が${atk.name}の要求をのみ、貢納した`, participants: [{ entityId: def.id, role: "actor" }, { entityId: atk.id, role: "target" }], location: null, effects: [{ targetId: def.id, property: "treasury", before: null, after: Math.round(def.treasury) }], provenance: "player" });
  return { ok: true, note: `要求をのんだ（貢納 ${Math.round(pay)}）` };
});

// ---- 同盟国の参戦要請（同盟国が攻められた／同盟国が攻めたとき）
function allyCall(ctx, w, side, host, foe, ally) {
  const { civ } = ctx; if (!isLive(civ) || !ally.player || host.player) return false; const key = `a|${w.id}|${ally.id}`; if (openKey(civ, key)) return true;
  raise(ctx, { kind: "ally_call", key, stateId: ally.id, title: `同盟国${host.name}が参戦を求めている`, body: `${host.name}と${foe.name}の戦争。同盟の約束に従い、${host.name}側で参戦するか。`, options: [{ id: "join", ja: `${host.name}側で参戦する`, hint: `${foe.name}との関係が悪化する` }, { id: "refuse", ja: "参戦を断る", hint: `${host.name}との関係が大きく悪化` }], payload: { warId: w.id, side, host: host.id, foe: foe.id, ally: ally.id } });
  return true;
}
registerDecision("ally_call", (ctx, d, opt) => {
  const { civ } = ctx, p = d.payload, w = civ.wars[p.warId], host = civ.states[p.host], foe = civ.states[p.foe], ally = civ.states[p.ally]; if (!w || w.status !== "active" || !ally?.alive) return { ok: true, note: "戦争はすでに終わっていた" };
  if (opt === "refuse") { adjustRel(ally, host, -25); return { ok: true, note: "参戦を断った" }; }
  if (w.sides.a.includes(ally.id) || w.sides.d.includes(ally.id)) return { ok: true, note: "すでに参戦している" };
  w.sides[p.side].push(ally.id); ally.warIds.push(w.id); adjustRel(ally, foe, -25); w.ops && ctx.warOps?.monthly; makeEvent(civ, ctx.ids, { kind: "ally_joined", title: `${ally.name}が${host.name}側で参戦した`, participants: [{ entityId: ally.id, role: "ally" }, { entityId: host.id, role: "host" }, { entityId: w.id, role: "war" }], location: null, provenance: "player" });
  return { ok: true, note: "参戦した" };
});

// ---- 王位の継承（候補者の一覧から選ぶ。幼い継承者なら摂政も）
const FACT_JA = { nobility: "貴族", military: "軍", clergy: "聖職者", merchants: "商人", commoners: "民衆", bureaucrats: "官僚", artisans: "職人", clans: "氏族" };
function successionOptions(ctx, st) {
  const { civ } = ctx, mi = civ.monthIndex, ls = lifeScale(civ, st), person = (k) => ctx.nameGen?.person(civ, civ.groups[st.capitalGroupId], leaderRng(civ, st, `sc${k}${mi}`)) ?? `${st.name}の人${k}`, u = (k) => U(civ, st.id, mi, "sc", k);
  const fkeys = Object.keys(st.politics?.factions ?? {}), has = (k) => fkeys.includes(k), { law, lawJa: lj, partition, list } = successionList(ctx, st), opts = []; // v6.19.0: 継承法と候補は succession.js
  const lawNote = (c) => `${c.risk >= 0.3 ? "／争いの火種" : ""}`;
  for (const c of list) {
    if (c.minor) for (const [rid, rel, bk, k] of [["queen", "母后", "nobility", 5], ["vizier", "宰相", has("bureaucrats") ? "bureaucrats" : "nobility", 6], ["general", "将軍", "military", 7]]) { const reg = { name: person(k), skill: r3(0.35 + 0.5 * u(`r${rid}`)), backer: bk, relation: rel }; opts.push({ id: `${c.id}:${rid}`, ja: `${c.name}（${c.ageYears}歳）を立て、${rel}${reg.name}が摂政`, hint: `能力${Math.round(reg.skill * 100)}・${FACT_JA[bk]}が支持／正統性 高`, payload: { cand: c, regent: reg } }); }
    else opts.push({ id: c.id, ja: `${c.relation}：${c.name}（${c.ageYears}歳）`, hint: `能力${Math.round(c.skill * 100)}・正統性${Math.round(c.legit * 100)}・${FACT_JA[c.backer]}が支持${c.kin ? "" : "／王朝が代わる"}${lawNote(c)}`, payload: { cand: c } });
  }
  const adult = list.find((c) => !c.minor && c.kin);
  if (partition && adult && (byState(ctx).get(st.id)?.length ?? 0) >= 4) opts.push({ id: "partition", ja: `領土を子らで分ける（${adult.name}が本国を継ぐ）`, hint: "分割相続。新しい国ができる（戦争にはならない）／本国は弱くなる", payload: { cand: adult, partition: true } });
  opts.law = { law, ja: lj }; return opts;
}
function succession(ctx, st) {
  const { civ } = ctx; if (!isLive(civ) || !st.player) return false; const key = `s|${st.id}`; if (openKey(civ, key)) return true;
  const opts = successionOptions(ctx, st); const payload = {}; const options = opts.map((o) => { payload[o.id] = o.payload; return { id: o.id, ja: o.ja, hint: o.hint }; });
  raise(ctx, { kind: "succession", key, stateId: st.id, title: `${st.leader.name}の跡を継ぐ者を決める`, body: `継承法: ${opts.law?.ja ?? lawJa(civ, st)}。候補者の中から選ぶ。`, options, payload });
  return true;
}
registerDecision("succession", (ctx, d, opt) => {
  const { civ } = ctx, st = civ.states[d.stateId]; if (!st?.alive) return { ok: true, note: "国がすでにない" }; const pl = d.payload[opt]; if (!pl) return { ok: false, error: "その候補はいません" }; const c = pl.cand, reg = pl.regent ?? null;
  if (pl.partition) { const gs = (byState(ctx).get(st.id) ?? []).filter((g) => g.id !== st.capitalGroupId).sort((a, b) => (a.id < b.id ? -1 : 1)), part = gs.filter((_, i) => i % 2 === 1); if (part.length && part.length < gs.length + 1) { const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st.id }); if (ns) { ns.relations[st.id] = 20; st.relations[ns.id] = 20; makeEvent(civ, ctx.ids, { kind: "state_action", title: `${st.name}の領土が、${c.name}の継承にともない子らで分けられ、${ns.name}が成立した`, participants: [{ entityId: st.id, role: "actor" }, { entityId: ns.id, role: "target" }], location: null, provenance: "player" }); } } }
  const hit = 0.02 + 0.1 * (1 - (reg ? Math.max(c.legit, 0.8) : c.legit));
  enthrone(ctx, st, { name: c.name, bornAt: c.bornAt, kin: c.kin, hit, how: reg ? `摂政${reg.name}のもと、${c.name}が立った` : `${c.relation}の${c.name}が立った` });
  st.leader.skill = c.skill; st.leader.backer = c.backer; if (reg) st.leader.regent = { name: reg.name, skill: reg.skill, backer: reg.backer, relation: reg.relation, until: civ.monthIndex + Math.max(12, Math.round((16 - c.ageYears) * 12 * lifeScale(civ, st))) };
  const F = st.politics?.factions; if (F) { const bump = (k, v) => { if (F[k]) F[k].support = clamp(F[k].support + v); }; bump(c.backer, 0.1); if (reg) bump(reg.backer, 0.06); for (const k of Object.keys(F)) if (k !== c.backer && k !== reg?.backer && (k === "nobility" || k === "military") && c.kin === false) bump(k, -0.04); }
  if (c.risk && U(civ, st.id, civ.monthIndex, "sdispute") < c.risk * (reg ? 0.6 : 1)) queueEvent(st, c.id === "usurper" || c.id === "general" ? "succ_coup_after" : "succ_dispute", 3 + Math.floor(9 * U(civ, st.id, "sdd")), civ.monthIndex); // 選ばれなかった者の不満: 継承争いの出来事が後で起きる（v6.19.0）
  return { ok: true, note: reg ? `摂政を置き、${c.name}が即位した` : `${c.name}が即位した` };
});

// ---- 反乱・分離（鎮圧か譲歩か。放置すれば分離して内戦になる）／前兆
function rebellion(ctx, st, groupIds) {
  const { civ } = ctx; if (!isLive(civ) || !st.player) return false; const key = `r|${st.id}`; if (openKey(civ, key)) return true; st.lastCrisis = civ.monthIndex; // 決断のあいだ・直後は、同じ不満を繰り返さない
  const cost = Math.round(20 + st.pop * 0.0003), n = groupIds.length;
  raise(ctx, { kind: "rebellion", key, stateId: st.id, title: `${st.name}で反乱の機運が高まっている`, body: `不満が限界に近づき、${n}の地域が独立を求めて蜂起しようとしている。安定度 ${Math.round(st.stability * 100)}。`, options: [{ id: "suppress", ja: `武力で鎮圧する（費用 ${cost}）`, hint: "安定は戻るが、民衆の支持が下がる", disabled: st.treasury >= cost ? null : "財政が足りない" }, { id: "concede", ja: "譲歩する（自治を認め、減税）", hint: "安定が戻り、貴族の支持が下がる" }, { id: "allow", ja: "分離を認める／放置する", hint: "新しい国が成立し、内戦になる" }], payload: { groupIds, cost } });
  return true;
}
registerDecision("rebellion", (ctx, d, opt) => {
  const { civ } = ctx, st = civ.states[d.stateId]; if (!st?.alive) return { ok: true, note: "国がすでにない" }; const gs = byState(ctx).get(st.id) ?? [], F = st.politics?.factions, bump = (k, v) => { if (F?.[k]) F[k].support = clamp(F[k].support + v); };
  const calm = (f) => { for (const g of gs) for (const co of g.cohorts) co.tension *= f; };
  if (opt === "suppress") { st.treasury -= d.payload.cost; calm(0.7); st.stability = clamp(st.stability + 0.06); bump("commoners", -0.06); bump("military", 0.04); st.lastCrisis = civ.monthIndex + 60; return { ok: true, note: "反乱を鎮圧した" }; }
  if (opt === "concede") { st.policy.autonomy = r3(clamp(st.policy.autonomy + 0.2)); st.policy.tax = r3(clamp(st.policy.tax - 0.03, 0.02, 0.4)); calm(0.85); st.stability = clamp(st.stability + 0.05); bump("nobility", -0.04); st.lastCrisis = civ.monthIndex; return { ok: true, note: "譲歩して反乱を収めた" }; }
  const part = d.payload.groupIds.map((i) => civ.groups[i]).filter((g) => g?.stateId === st.id); if (!part.length || part.length >= gs.length) return { ok: true, note: "分離は起きなかった" }; runSecession(ctx, st, part); return { ok: true, note: "分離が起き、内戦になった" };
});
function omen(ctx, st) {
  const { civ } = ctx, mi = civ.monthIndex; if (!isLive(civ) || !st.player || st.stability >= 0.45 || mi - (st.lastCrisis ?? -999) <= 60 || mi - (st.omenAt ?? -999) <= 36) return; const gs = byState(ctx).get(st.id) ?? []; if (gs.length < 3) return;
  st.omenAt = mi; if (U(civ, st.id, mi, "omen") >= scoutLevel(civ, st)) return; // 偵察が行き届かなければ、前兆は見えない（予告なしに起きる）
  const key = `o|${st.id}`; if (openKey(civ, key)) return; const cost = 15;
  raise(ctx, { kind: "omen", key, stateId: st.id, title: "諜報が不穏の兆しをつかんだ", body: `各地で不満が高まり、反乱の火種が見える（安定度 ${Math.round(st.stability * 100)}）。今なら手が打てる。`, options: [{ id: "act", ja: `宥和策を講じる（費用 ${cost}）`, hint: "不満が和らぐ", disabled: st.treasury >= cost ? null : "財政が足りない" }, { id: "ignore", ja: "静観する", hint: "何もしない" }], payload: { cost } });
}
registerDecision("omen", (ctx, d, opt) => { const st = ctx.civ.states[d.stateId]; if (!st?.alive) return { ok: true }; if (opt === "act") { st.treasury -= d.payload.cost; for (const g of byState(ctx).get(st.id) ?? []) for (const co of g.cohorts) co.tension *= 0.88; st.stability = clamp(st.stability + 0.04); return { ok: true, note: "宥和策を講じた" }; } return { ok: true, note: "静観した" }; });

/** 反乱の自動の内戦: 分離でできた国と、元の国は、自動で内戦になる（担当国の決断のあとも、アルゴリズム国家どうしでも同じ） */
/** 反乱の国の軍団と指揮官（v6.19.0）: 元の国の軍人が寝返った者か、反乱のなかから現れた新しい人物か。戦争と同じ軍団・指揮官の仕組みで戦う */
export function tagRebelCommanders(ctx, ns) {
  const { civ } = ctx; if (!ns?.alive) return; const S = ensureCorps(ctx, ns); if (!S) return;
  for (const cp of S.list ?? []) if (cp.commander && !cp.commander.origin) cp.commander.origin = cp.defected || U(civ, ns.id, cp.id, "orig") < 0.5 ? "元の国の軍人" : "反乱で頭角を現した新人物";
}
export function autoCivilWar(ctx, ns, st) { const { civ } = ctx; if (!ns?.alive || !st?.alive || atWarWith(civ, ns, st)) return null; const w = declareWar(ctx, ns, st, { reason: "independence", provenance: "simulation" }); tagRebelCommanders(ctx, ns); return w; }


// ---- 会戦（大きな戦い）: 担当国の部隊が関わる大きな戦いは、専用の戦場（battlefield.js）で、日ごとにリアルタイムで進める。
//   決断が開いている間、戦場の画面が tick（命令 battle.tick）で日を進め、翼ごとの命令・予備の投入・自動を受けつける。一時停止できる。解決（戦いを終える）で結果が戦争へ反映される。
//   陸・海・空・宇宙は同じ作り。空・宇宙の戦いは独立した戦場で、結果は制空・制宙（ops.dom）として以後の戦闘に効く。
const scoutK = (civ, mine, key) => { const sc = scoutLevel(civ, mine); return { exact: sc >= 0.85, k: 1 + (U(civ, key, "fogs") - 0.5) * 2 * (1 - sc) * 0.4 }; };
function isMajor(ctx, w, { camp, A, D, g, domain = "land" }) {
  const { civ } = ctx, ops = w.ops, mi = civ.monthIndex, sA = civ.states[A.stateId], sD = civ.states[D.stateId], me = sA.player ? A : sD.player ? D : null; if (!me?.corpsId || !isLive(civ)) return false; if ((ops.lastBattleDecision ?? -99) > mi - 2) return false;
  const mine = civ.states[me.stateId], share = domain === "sea" ? navyShare(mine) : landShare(mine), land = Math.max(1, mine.army * share), stage = warHelpers.stageOf(civ, g), cap = civ.states[g.stateId]?.capitalGroupId === g.id;
  return (A.size + D.size >= 600 && Math.min(A.size, D.size) >= 0.25 * land) || (domain === "land" && (stage === "city" || cap)) || Math.abs(w.score) >= 50 || ops.broken.a > 0 || ops.broken.d > 0;
}
function battle(ctx, w, { camp, A, D, g, site, domain = "land" }) {
  const { civ } = ctx; if (!w.ops || !isMajor(ctx, w, { camp, A, D, g, domain })) return null; const sA = civ.states[A.stateId], sD = civ.states[D.stateId], mine = sA.player ? sA : sD, side = sA.player ? "A" : "D", me = side === "A" ? A : D, foe = side === "A" ? D : A, foeSt = civ.states[foe.stateId];
  const key = `b|${w.id}|${camp.id}`; if (openKey(civ, key)) return pendingOf(civ).find((x) => x.key === key).id;
  const stage = warHelpers.stageOf(civ, g), fort = domain === "sea" ? 1 : 1 + ((civ.states[D.stateId].defense ?? 0) + (stage === "city" ? 0.3 : stage === "town" ? 0.15 : 0.05) * (stage ? 1 : 0));
  const field = createField(ctx, { domain, place: placeName(ctx, site), seed: `${key}|${civ.monthIndex}`, terr: domain === "sea" ? 0 : warHelpers.terrainBonus(ctx.world, site.cell), fort, meDefends: side === "D", long: domain === "land" && stage === "city" ? 1 : 0,
    me: { st: mine, size: me.size, corps: corpsById(mine, me.corpsId), morale: me.morale, supply: me.supply }, foe: { st: foeSt, size: foe.size, corps: corpsById(foeSt, foe.corpsId ?? foe.lead), morale: foe.morale, supply: foe.supply, label: foeSt.name } });
  field.fog = scoutK(civ, mine, key); field.war = w.name ?? "戦争";
  const d = raise(ctx, { kind: "battle", key, stateId: mine.id, title: `${field.place}の${DOMAINS[domain].ja}`, body: "", options: [{ id: "end", ja: "戦いを終える" }], payload: { warId: w.id, campId: camp.id, forceA: A.id, forceD: D.id, gid: g.id, siteId: site.id, side, domain, field } }); if (!d) return null; w.ops.lastBattleDecision = civ.monthIndex; return d.id;
}
/** 空・宇宙の独立した戦い（担当国が両軍とも持つとき、数か月に 1 度）。陸海の戦いとは別の戦場で、結果は制空・制宙として効く */
function skirmish(ctx, w, domain) {
  const { civ } = ctx, ops = w.ops; if (!ops || !isLive(civ)) return null; const me = [...w.sides.a, ...w.sides.d].map((i) => civ.states[i]).find((x) => x?.player); if (!me) return null;
  const mySide = w.sides.a.includes(me.id) ? "a" : "d", foes = w.sides[mySide === "a" ? "d" : "a"].map((i) => civ.states[i]).filter((x) => x?.alive).sort((x, y) => headsOf(y, domain) - headsOf(x, domain)), foeSt = foes[0]; if (!foeSt) return null;
  const mh = headsOf(me, domain), fh = headsOf(foeSt, domain); if (mh < 30 || fh < 20) return null; const key = `s|${w.id}|${domain}`; if (openKey(civ, key) || (ops.lastSkirm?.[domain] ?? -99) > civ.monthIndex - 5) return null;
  const commit = Math.min(1, 0.7), field = createField(ctx, { domain, place: DOMAINS[domain].ja === "空戦" ? "戦域の空" : "軌道上", seed: `${key}|${civ.monthIndex}`, terr: 0, fort: 1, meDefends: false, me: { st: me, size: mh * commit, corps: leadCorps(me, domain), morale: 0.85, supply: 1 }, foe: { st: foeSt, size: fh * commit, corps: leadCorps(foeSt, domain), morale: 0.8, supply: 1, label: foeSt.name } }); field.fog = scoutK(civ, me, key); field.war = w.name ?? "戦争";
  (ops.lastSkirm ??= {})[domain] = civ.monthIndex; const d = raise(ctx, { kind: "battle", key, stateId: me.id, title: `${field.place}の${DOMAINS[domain].ja}`, body: "", options: [{ id: "end", ja: "戦いを終える" }], payload: { warId: w.id, domain, skirmish: true, mySide, foeId: foeSt.id, field } }); return d?.id ?? null;
}
registerDecision("battle", (ctx, d, opt) => {
  const { civ } = ctx, p = d.payload, w = civ.wars[p.warId], ops = w?.ops;
  if (p.skirmish) { if (!w || w.status !== "active" || ops?.ended) return { ok: true, note: "戦況が変わり、戦いは起きなかった" }; const me = civ.states[d.stateId], foe = civ.states[p.foeId], o = fieldOutcome(p.field, true), dom = (ops.dom ??= { air: 0, space: 0, nuke: 0 }), sg = p.mySide === "a" ? 1 : -1;
    for (const [st, heads, lm] of [[me, headsOf(me, p.domain), o.lossMine], [foe, headsOf(foe, p.domain), o.lossFoe]]) if (st?.alive) { const dead = Math.min(st.army, heads * 0.1 * lm * 0.7); st.army = Math.max(0, st.army - dead); serviceLoss(st, p.domain, dead); w.casualties += dead; ops.stats.dead[st.id] = (ops.stats.dead[st.id] ?? 0) + dead; }
    dom[p.domain] = clamp((dom[p.domain] ?? 0) + sg * (o.win ? 1 : -1) * 0.6, -1, 1); (ops.battles ??= []).push({ id: `b${++ops.seq}`, at: civ.monthIndex, kind: p.domain, name: `${p.field.place}の${DOMAINS[p.domain].ja}`, cell: civ.groups[civ.states[d.stateId].capitalGroupId]?.cell ?? 0, a: me.id, d: foe.id, winner: o.win ? me.id : foe.id, deadA: o.result.lossMe, deadD: o.result.lossFoe, win: o.win ? "A" : "D", notable: true, domain: p.domain });
    return { ok: true, note: `${DOMAINS[p.domain].ja}: ${o.win ? "勝利" : "敗北"}（${p.domain === "air" ? "制空" : "制宙"}に響く）` }; }
  const A = ops?.forces?.[p.forceA], D = ops?.forces?.[p.forceD], camp = ops?.campaigns?.[p.campId], g = civ.groups[p.gid], site = civ.groups[p.siteId];
  if (!w || w.status !== "active" || ops?.ended || !A || !D || !camp || !g || !site) { if (camp) camp.waiting = null; return { ok: true, note: "戦況が変わり、会戦は起きなかった" }; }
  const o = fieldOutcome(p.field, p.side === "A"), lossA = p.side === "A" ? o.lossMine : o.lossFoe, lossD = p.side === "A" ? o.lossFoe : o.lossMine; ops.lastBattleDecision = civ.monthIndex; camp.waiting = null;
  const force = o.winA ? "A" : "D", r = p.domain === "sea" ? navalEngage(ctx, w, camp, A, D, g, { site, bias: o.bias, lossA, lossD, force }) : fieldEngage(ctx, w, camp, A, D, g, { site, bias: o.bias, lossA, lossD, force });
  return { ok: true, note: `${r.rec.name}: ${o.win ? "勝利" : "敗北"}（${o.result.days} 日）` };
});

// ---- 指揮官の戦死（後任を選ぶ）
function commanderDeath(ctx, st, cp, cands, cause) {
  const key = `cd|${cp.id}|${ctx.civ.monthIndex}`; if (openKey(ctx.civ, key)) return null; const old = cp.commander;
  const d = raise(ctx, { kind: "commander_death", key, stateId: st.id, title: `${cp.name}の指揮官 ${old.name} が${cause}`, body: "", options: cands.map((c) => ({ id: c.p.id, ja: c.p.name, hint: `${c.from}・能力 ${Math.round(c.p.skill * 100)}` })), payload: { corpsId: cp.id, fallen: { name: old.name, skill: old.skill, traits: old.traits ?? [] }, cause, cands: Object.fromEntries(cands.map((c) => [c.p.id, { p: JSON.parse(JSON.stringify(c.p)), from: c.from, slot: c.slot ?? null, fresh: !!c.fresh }])) } }); return d?.id ?? null;
}
registerDecision("commander_death", (ctx, d, opt) => {
  const st = ctx.civ.states[d.stateId], cp = st ? corpsById(st, d.payload.corpsId) : null, c = d.payload.cands[opt]; if (!cp || !c) return { ok: true, note: "軍団がすでにない" };
  installCommander(st, cp, c.p, c.slot); return { ok: true, note: `${c.p.name}が後任に就いた` };
});

/** 構造の検査: 未決の決断は、担当国家のもので、選択肢を持ち、重複しない */
export function checkDecisions(civ) {
  const errs = [], D = civ.wcde?.decisions; if (!D) return errs; const seen = new Set(), cs = civ.wcde.control?.stateId;
  for (const d of D.queue) { if (seen.has(d.id)) errs.push(`決断 ${d.id} が重複`); seen.add(d.id); if (d.stateId !== cs) errs.push(`決断 ${d.id} が担当国家のものでない`); if (!Array.isArray(d.options) || !d.options.length) errs.push(`決断 ${d.id} に選択肢がない`); if (!HANDLERS[d.kind]) errs.push(`決断 ${d.id} の種類 ${d.kind} が未対応`); }
  return errs;
}
export const DECISION_HOOKS = Object.freeze({ offerTreaty, offerPeace, warIncoming, allyCall, succession, rebellion, omen, battle, skirmish, commanderDeath, raise, scoutLevel });
void enthrone; void leaderName;
