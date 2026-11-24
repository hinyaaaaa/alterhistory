// v7.0.0 W5: 同盟の統一。二国間の同盟条約（alliance / defensive）と盟約（pacts）を、ひとつの「同盟」として扱う。
//   同盟 = { id, name, kind, leaderId, members[], obligation, memberObl{}, enemy, formedAt, active, history[], legacy:{treatyId|pactId} }
//     kind: defense 防衛 ／ offense_defense 攻守 ／ trade 通商 ／ religion 宗教 ／ counter 対抗
//     obligation（義務の強さ）: must 必ず ／ optional 任意 ／ defense_only 防衛のみ。加盟国ごとに上書きできる（memberObl）。
//     enemy: 共通の敵（その国との戦争には、義務にかかわらず加盟国が呼ばれる）。
//   既存の条約・盟約は読み込み後の最初の呼び出しで同盟へ移す（legacy に結びつけ、重複しない）。条約・盟約の実体は互換のため残し、同盟の操作（結成・加入・脱退・除名）と同期する。
//   同盟国が攻められたら、参戦の呼びかけ（callAlliances）。担当国には決断（alliance_call: 応じる／断る＝信用の低下／調停）。AI は義務・関係・戦力で決まる（決定的・ctx.rng を使わない）。
//   信用（st.credibility 0〜1）: 約束を果たすと上がり、必ず参戦の義務を断ると下がる。低いと、同盟に誘われにくい。
import { adjustRel, atWarWith, signTreaty, endTreaty, treatyBetween } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { hashSeed } from "../civ/civ-state.js";
import { dominant } from "../civ/cohorts.js";
import { createPact, joinPact, leavePact, pactAccepts, pactsOf, PACT_PURPOSES } from "./pacts.js";
import { registerDecision, resolveDecision } from "./decisions.js";
import { depFeasible } from "./dependency.js";
import { wlog } from "./war-core.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const ALLIANCE_KINDS = Object.freeze({ defense: { ja: "防衛同盟", merit: "攻められたとき助けが来る", cost: "守りの戦争にだけ参戦する" }, offense_defense: { ja: "攻守同盟", merit: "戦争で互いに助け合う", cost: "相手の戦争に巻き込まれる" }, trade: { ja: "通商同盟", merit: "交易の配当が入る", cost: "加盟国どうしで戦えない" }, religion: { ja: "宗教同盟", merit: "同じ信仰の国が安定する", cost: "宗教の戦争に呼ばれる" }, counter: { ja: "対抗同盟", merit: "強国に共同で当たれる", cost: "対象との関係が悪化する" } });
export const OBLIGATIONS = Object.freeze({ must: "必ず", optional: "任意", defense_only: "防衛のみ" });
const PACT_OF = { defense: "defense", offense_defense: "defense", trade: "trade", religion: "religion", counter: "counter" };
const KIND_OF_PACT = { defense: "defense", trade: "trade", religion: "religion", counter: "counter" };
const nm = (civ, id) => civ.states[id]?.name ?? "？";
const alive = (civ, id) => !!civ.states[id]?.alive;

export const alliancesOf = (civ) => ((civ.wcde ??= {}).alliances ??= { items: {}, seq: 0 });
export const listAlliances = (civ, all = false) => Object.values(alliancesOf(civ).items).filter((a) => all || a.active);
export const alliancesOfState = (civ, id) => listAlliances(civ).filter((a) => a.members.includes(id));
const hist = (civ, a, type, stateId, text) => { a.history.push({ at: civ.monthIndex, type, stateId: stateId ?? null, text }); if (a.history.length > 40) a.history.splice(0, a.history.length - 40); };
const credit = (st) => (st.credibility ?? 0.7);
const addCredit = (st, d) => { st.credibility = Math.round(clamp(credit(st) + d) * 100) / 100; };

function mk(ctx, o) {
  const civ = ctx.civ, S = alliancesOf(civ), id = `al_${++S.seq}`, L = civ.states[o.leaderId], K = ALLIANCE_KINDS[o.kind];
  const a = { id, name: o.name ?? `${L.nameBase ?? L.name}${o.members.length > 2 ? "同盟" : "との同盟"}`, kind: o.kind, leaderId: o.leaderId, members: [...new Set(o.members)], obligation: o.obligation ?? (o.kind === "offense_defense" ? "optional" : o.kind === "trade" ? "optional" : "defense_only"), memberObl: {}, enemy: o.enemy ?? null, formedAt: civ.monthIndex, active: true, history: [], legacy: o.legacy ?? {} };
  S.items[id] = a; hist(civ, a, "formed", o.leaderId, `${a.members.map((m) => nm(civ, m)).join("・")}が${K.ja}を結んだ`);
  if (!o.silent) makeEvent(civ, ctx.ids, { kind: "alliance_formed", title: `${a.members.map((m) => nm(civ, m)).slice(0, 4).join("・")}${a.members.length > 4 ? "ほか" : ""}が${a.name}（${K.ja}）を結んだ`, participants: a.members.map((m) => ({ entityId: m, role: m === a.leaderId ? "leader" : "member" })), location: null, facts: { allianceId: id, kind: a.kind, members: a.members.length, obligation: a.obligation }, provenance: o.provenance ?? "simulation", why: o.why ?? "条約・盟約の約束に基づく" });
  return a;
}
/** 既存の条約・盟約を同盟へ移す（重複しない）。結びつきが切れた同盟は解散する */
export function ensureAlliances(ctx) {
  const civ = ctx.civ, S = alliancesOf(civ), linkedT = new Set(), linkedP = new Set(); for (const a of Object.values(S.items)) { if (a.legacy?.treatyId) linkedT.add(a.legacy.treatyId); if (a.legacy?.pactId) linkedP.add(a.legacy.pactId); }
  for (const tid of civ.activeTreatyIds) { const t = civ.treaties[tid]; if (!t?.active || (t.type !== "alliance" && t.type !== "defensive") || linkedT.has(tid)) continue; mk(ctx, { kind: t.type === "alliance" ? "offense_defense" : "defense", leaderId: t.a, members: [t.a, t.b], legacy: { treatyId: tid }, silent: true, obligation: t.type === "alliance" ? "optional" : "defense_only" }); }
  for (const p of Object.values(pactsOf(civ).items)) { if (!p.active || linkedP.has(p.id)) continue; mk(ctx, { kind: KIND_OF_PACT[p.purpose] ?? "defense", leaderId: p.leaderId, members: p.members, enemy: p.target ?? null, name: p.name, legacy: { pactId: p.id }, silent: true, obligation: p.purpose === "counter" ? "must" : p.purpose === "defense" ? "defense_only" : "optional" }); }
  for (const a of Object.values(S.items)) { if (!a.active) continue; const t = a.legacy?.treatyId ? civ.treaties[a.legacy.treatyId] : null, p = a.legacy?.pactId ? pactsOf(civ).items[a.legacy.pactId] : null;
    if (a.legacy?.treatyId && !t?.active) dissolve(ctx, a, "条約の期限が来て解散した"); else if (a.legacy?.pactId && !p?.active) dissolve(ctx, a, "盟約が解けて解散した"); else if (p) { for (const m of [...a.members]) if (!p.members.includes(m)) a.members = a.members.filter((x) => x !== m); for (const m of p.members) if (!a.members.includes(m)) a.members.push(m); a.leaderId = p.leaderId; if (a.members.length < 2) dissolve(ctx, a, "加盟国が足りなくなり解散した"); } }
  return S;
}
function dissolve(ctx, a, why) { const civ = ctx.civ; if (!a.active) return; a.active = false; a.endedAt = civ.monthIndex; hist(civ, a, "dissolved", null, why); makeEvent(civ, ctx.ids, { kind: "alliance_dissolved", title: `${a.name}が${why}`, participants: a.members.filter((m) => alive(civ, m)).map((m) => ({ entityId: m, role: "member" })), location: null, facts: { allianceId: a.id }, provenance: "simulation" }); }

// ---- 加入の判定（AI）
/** 国 st が、同盟 a（盟主）に加わるか。{ ok, why } */
export function allianceAccepts(ctx, st, a, leader = null) {
  const civ = ctx.civ, L = leader ?? civ.states[a.leaderId]; if (!alive(civ, st.id) || !L?.alive) return { ok: false, why: "国が存在しない" }; if (a.members.includes(st.id)) return { ok: false, why: "すでに加盟している" };
  if (st.dependency || L.dependency) return { ok: false, why: "従属している" }; if (atWarWith(civ, st, L)) return { ok: false, why: "交戦中" }; if (credit(L) < 0.25) return { ok: false, why: "盟主の信用が低い" };
  const rel = st.relations[L.id] ?? 0; if (a.kind === "counter") { if (!a.enemy || st.id === a.enemy || (st.relations[a.enemy] ?? 0) > 20) return { ok: false, why: "対象と親しい" }; return { ok: rel >= 0, why: rel >= 0 ? "対象への備え" : "盟主を信用していない" }; }
  if (a.kind === "religion") { const x = civ.groups[st.capitalGroupId], y = civ.groups[L.capitalGroupId]; if (!x || !y || dominant(x).religionId !== dominant(y).religionId) return { ok: false, why: "信仰が違う" }; }
  if (a.members.some((m) => atWarWith(civ, st, civ.states[m]))) return { ok: false, why: "加盟国と交戦中" };
  return { ok: rel >= (a.kind === "trade" ? 0 : 10), why: "関係が足りない" };
}
/** 同盟の入れ物を、条約か盟約と同期させて作る（2 国 → 条約、3 国以上 → 盟約）。結成の入口 */
export function createAlliance(ctx, { kind, leaderId, memberIds, name = null, obligation = null, enemy = null, provenance = "simulation" }) {
  const civ = ctx.civ; ensureAlliances(ctx); const K = ALLIANCE_KINDS[kind], L = civ.states[leaderId]; if (!K) return { ok: false, error: "同盟の種類が不明" }; if (!L?.alive) return { ok: false, error: "盟主の国が存在しない" };
  const members = [...new Set([leaderId, ...memberIds])].filter((i) => alive(civ, i)); if (members.length < 2) return { ok: false, error: "2 か国以上が必要（応じた国がない）" }; if (kind === "counter" && !alive(civ, enemy)) return { ok: false, error: "対抗する国を選ぶ必要がある" };
  if (members.length === 2 && !["defense", "offense_defense"].includes(kind)) return { ok: false, error: `${K.ja}は 3 か国以上で結ぶ` };
  let legacy = {}; if (members.length === 2) { const [x, y] = [civ.states[members[0]], civ.states[members[1]]], type = kind === "defense" ? "defensive" : "alliance"; if (treatyBetween(civ, x, y, type) || treatyBetween(civ, x, y, type === "alliance" ? "defensive" : "alliance")) return { ok: false, error: "すでに同盟の条約がある" }; const w = depFeasible(civ, x, y); if (w && !/結びつき/.test(w)) return { ok: false, error: w }; const t = signTreaty(ctx, type, x, y, { provenance }); legacy = { treatyId: t.id }; }
  else { const p = createPact(ctx, { purpose: PACT_OF[kind], leaderId, memberIds: members, target: kind === "counter" ? enemy : null, name }); if (!p) return { ok: false, error: "結成できなかった" }; legacy = { pactId: p.id }; }
  const a = mk(ctx, { kind, leaderId, members, name: name ?? (legacy.pactId ? pactsOf(civ).items[legacy.pactId].name : null), obligation, enemy: kind === "counter" ? enemy : enemy, legacy, provenance, why: provenance === "player" ? "担当国が呼びかけ、加盟国が応じた" : undefined }); return { ok: true, alliance: a };
}
export function inviteMember(ctx, a, st, { by = null } = {}) {
  const civ = ctx.civ; if (!a.active) return { ok: false, error: "その同盟はすでにない" }; const r = allianceAccepts(ctx, st, a); if (!r.ok) return { ok: false, error: `${st.name}に断られた（${r.why}）` };
  if (a.legacy.pactId) { const p = pactsOf(civ).items[a.legacy.pactId]; if (!joinPact(ctx, p, st)) return { ok: false, error: "加盟できなかった（上限）" }; }
  else if (a.legacy.treatyId) { // 2 国の条約型 → 盟約型へ（条約を畳み、盟約を結び直す）
    const t = civ.treaties[a.legacy.treatyId]; const mem = [...a.members, st.id]; if (mem.length < 3) return { ok: false, error: "加盟できなかった" }; endTreaty(ctx, t, "盟約に組み替えられた"); const p = createPact(ctx, { purpose: PACT_OF[a.kind], leaderId: a.leaderId, memberIds: mem, target: a.kind === "counter" ? a.enemy : null, name: a.name }); if (!p) return { ok: false, error: "組み替えできなかった" }; a.legacy = { pactId: p.id }; }
  a.members.push(st.id); hist(civ, a, "joined", st.id, `${st.name}が加わった`); adjustRel(st, civ.states[a.leaderId], 6);
  makeEvent(civ, ctx.ids, { kind: "alliance_formed", title: `${st.name}が${a.name}に加わった`, participants: [{ entityId: st.id, role: "joined" }, { entityId: a.leaderId, role: "leader" }], location: null, facts: { allianceId: a.id, joined: st.id }, provenance: by ? "player" : "simulation", why: "盟主の誘いに応じた" }); return { ok: true };
}
export function leaveAlliance(ctx, a, st, { why = "脱退した", penalty = true, expelledBy = null } = {}) {
  const civ = ctx.civ; if (!a.active || !a.members.includes(st.id)) return { ok: false, error: "その同盟の加盟国ではない" };
  a.members = a.members.filter((m) => m !== st.id); delete a.memberObl[st.id]; if (a.legacy.pactId) { const p = pactsOf(civ).items[a.legacy.pactId]; if (p?.active) leavePact(ctx, p, st, why, false); }
  if (penalty) { addCredit(st, expelledBy ? -0.02 : -0.05); st.stability = clamp(st.stability - 0.01); for (const m of a.members) if (alive(civ, m)) adjustRel(st, civ.states[m], expelledBy ? -10 : -6); }
  hist(civ, a, expelledBy ? "expelled" : "left", st.id, `${st.name}が${why}`);
  makeEvent(civ, ctx.ids, { kind: "alliance_left", title: `${st.name}が${a.name}を${why}`, participants: [{ entityId: st.id, role: "state" }, ...(expelledBy ? [{ entityId: expelledBy, role: "expeller" }] : [])], location: null, facts: { allianceId: a.id, by: expelledBy }, provenance: "simulation" });
  if (a.members.length < 2) { if (a.legacy.treatyId && civ.treaties[a.legacy.treatyId]?.active) endTreaty(ctx, civ.treaties[a.legacy.treatyId], why, st.id); dissolve(ctx, a, "加盟国が足りなくなり解散した"); return { ok: true, dissolved: true }; }
  if (a.leaderId === st.id) { const nl = [...a.members].sort((x, y) => civ.states[y].pop - civ.states[x].pop)[0]; a.leaderId = nl; if (a.legacy.pactId) { const p = pactsOf(civ).items[a.legacy.pactId]; if (p) p.leaderId = nl; } hist(civ, a, "lead", nl, `盟主が${nm(civ, nl)}に替わった`); }
  if (a.legacy.treatyId && a.members.length === 2 && civ.treaties[a.legacy.treatyId]?.active) { const t = civ.treaties[a.legacy.treatyId]; if (!a.members.every((m) => m === t.a || m === t.b)) { endTreaty(ctx, t, "加盟国が替わった"); dissolve(ctx, a, "加盟国が替わり解散した"); } }
  return { ok: true };
}
export function transferLead(ctx, a, toId) { const civ = ctx.civ; if (!a.members.includes(toId)) return { ok: false, error: "加盟国ではない" }; a.leaderId = toId; if (a.legacy.pactId) { const p = pactsOf(civ).items[a.legacy.pactId]; if (p) p.leaderId = toId; } hist(civ, a, "lead", toId, `盟主が${nm(civ, toId)}に替わった`); return { ok: true }; }
export function setObligation(ctx, a, obligation, memberId = null) { if (!OBLIGATIONS[obligation]) return { ok: false, error: "義務の強さが不明" }; if (memberId) { if (!a.members.includes(memberId)) return { ok: false, error: "加盟国ではない" }; a.memberObl[memberId] = obligation; } else a.obligation = obligation; return { ok: true }; }

// ---- 参戦の呼びかけ
/** 加盟国 m の、この同盟での義務の強さ */
const oblOf = (a, m) => a.memberObl?.[m] ?? a.obligation;
/** AI の加盟国が参戦するか（決定的）。must は必ず（従属で呼べない場合を除く）。optional は関係・戦力から。defense_only は守りの戦争だけ */
function aiJoins(ctx, a, w, m, host, foe, side) {
  const civ = ctx.civ, M = civ.states[m], ob = foe.id === a.enemy ? "must" : oblOf(a, m), u = (hashSeed(w.id, m, a.id, "call") % 1000) / 1000; if (a.kind === "trade") return false;
  if (a.kind === "religion" && w.reason !== "religion") return false; if (a.kind === "counter" && foe.id !== a.enemy) return false;
  if (ob === "must") return true; if (ob === "defense_only") return side === "d" && u < 0.9; if (a.kind === "defense" && side === "a") return false;
  const rel = (M.relations[host.id] ?? 0) - (M.relations[foe.id] ?? 0) * 0.3; return u < clamp(0.3 + rel / 200 + (M.army > foe.army ? 0.1 : -0.1), 0.1, 0.85);
}
function joinWar(ctx, a, w, m, host, foe, side, ev, how) {
  const civ = ctx.civ, M = civ.states[m]; w.sides[side].push(m); M.warIds.push(w.id); adjustRel(M, foe, -25); addCredit(M, 0.02);
  makeEvent(civ, ctx.ids, { kind: "ally_joined", title: `${M.name}が${a.name}の約束に従い、${host.name}側で参戦した`, participants: [{ entityId: m, role: "ally" }, { entityId: w.id, role: "war" }], location: null, causes: ev ? [{ targetId: ev, relation: "reaction_to", basis: "strong" }] : [], facts: { allianceId: a.id, obligation: oblOf(a, m), how } });
  makeEvent(civ, ctx.ids, { kind: "call_answered", title: `${M.name}が${host.name}の参戦要請に応じた`, participants: [{ entityId: m, role: "answerer" }, { entityId: host.id, role: "caller" }, { entityId: w.id, role: "war" }], location: null, facts: { allianceId: a.id, answer: "join" }, provenance: M.player ? "player" : "simulation" });
}
/** 開戦時: 同盟の参戦要請。declareWar から。ev は開戦の出来事 id */
export function callAlliances(ctx, w, atk, def) {
  const civ = ctx.civ; ensureAlliances(ctx); const inWar = (id) => w.sides.a.includes(id) || w.sides.d.includes(id), ev = w.declaredEvent;
  for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) for (const a of alliancesOfState(civ, host.id)) {
    if (a.members.includes(foe.id)) { if (side === "a") { addCredit(host, -0.1); leaveAlliance(ctx, a, host, { why: "同盟国を攻めたため脱退した" }); } continue; }
    for (const m of [...a.members]) { const M = civ.states[m]; if (m === host.id || !M?.alive || inWar(m) || M.dependency?.overlord === foe.id || alliancesOfState(civ, m).some((b) => b.members.includes(foe.id))) continue;
      if (a.kind === "trade") continue; const ob = foe.id === a.enemy ? "must" : oblOf(a, m);
      if (M.player && ctx.decisions?.raise) { if (a.kind === "religion" && w.reason !== "religion") continue; if (a.kind === "counter" && foe.id !== a.enemy) continue; if (ob === "defense_only" && side !== "d") continue;
        const d = ctx.decisions.raise(ctx, { kind: "ally_call", key: `a|${w.id}|${m}`, stateId: m, title: `同盟国${host.name}が参戦を求めている`, body: `${a.name}（${ALLIANCE_KINDS[a.kind].ja}）。${host.name}と${foe.name}の戦争。義務の強さ: ${OBLIGATIONS[ob]}。`, options: [{ id: "join", ja: `${host.name}側で参戦する`, hint: `${foe.name}との関係が悪化。信用が少し上がる` }, { id: "refuse", ja: "参戦を断る", hint: ob === "must" ? "約束を破ることになり、信用が大きく下がる" : `${host.name}との関係が悪化。信用が少し下がる` }, { id: "mediate", ja: "調停に回る", hint: "双方に停戦を促す。どちらの側にも立たない" }], payload: { warId: w.id, side, host: host.id, foe: foe.id, allianceId: a.id, ally: m, obligation: ob } }); if (d) continue; }
      if (aiJoins(ctx, a, w, m, host, foe, side)) joinWar(ctx, a, w, m, host, foe, side, ev, "ai"); else if (ob === "must") { addCredit(M, -0.05); }
    }
  }
}
/** 同盟国の参戦要請への答え（決断 alliance_call の本体）。join／decline／mediate */
export function answerCall(ctx, d, opt) {
  const civ = ctx.civ, p = d.payload, w = civ.wars[p.warId], a = alliancesOf(civ).items[p.allianceId], M = civ.states[p.ally], host = civ.states[p.host], foe = civ.states[p.foe]; if (!w || w.status !== "active" || !M?.alive || !host?.alive) return { ok: true, note: "戦争はすでに終わっていた" };
  if (w.sides.a.includes(M.id) || w.sides.d.includes(M.id)) return { ok: true, note: "すでに参戦している" };
  if (opt === "join") { joinWar(ctx, a ?? { name: "同盟", id: "?", memberObl: {}, obligation: p.obligation }, w, M.id, host, foe, p.side, w.declaredEvent, "player"); wlog(ctx, w, "ally_joined", `${M.name}が${host.name}側で参戦した`); return { ok: true, note: `${host.name}側で参戦した` }; }
  if (opt === "refuse" || opt === "decline") { const must = p.obligation === "must"; addCredit(M, must ? -0.15 : -0.05); adjustRel(M, host, must ? -25 : -10); M.stability = clamp(M.stability - (must ? 0.02 : 0)); makeEvent(civ, ctx.ids, { kind: "call_answered", title: `${M.name}が${host.name}の参戦要請を断った`, participants: [{ entityId: M.id, role: "answerer" }, { entityId: host.id, role: "caller" }, { entityId: w.id, role: "war" }], location: null, facts: { allianceId: p.allianceId, answer: "decline", obligation: p.obligation }, provenance: "player", why: must ? "必ず参戦の義務を断り、信用が下がった" : "任意の参戦を断った" }); return { ok: true, note: must ? "約束を破り、信用が大きく下がった" : "参戦を断った" }; }
  adjustRel(M, host, -3); adjustRel(M, foe, 3); addCredit(M, -0.02); w.mediated = { by: M.id, at: civ.monthIndex }; for (const id of [w.aggressor, w.defender]) { const s = civ.states[id]; if (s?.politics) s.politics.fatigue = clamp((s.politics.fatigue ?? 0) + 0.05); }
  makeEvent(civ, ctx.ids, { kind: "call_answered", title: `${M.name}が調停に回り、停戦を促した`, participants: [{ entityId: M.id, role: "mediator" }, { entityId: host.id, role: "caller" }, { entityId: w.id, role: "war" }], location: null, facts: { allianceId: p.allianceId, answer: "mediate" }, provenance: "player" }); return { ok: true, note: "調停に回った（双方の疲労が増し、停戦が受け入れられやすくなる）" };
}
/** 参戦要請の決断。従来の ally_call（従属国の呼びかけなど）と同じ種類のまま、義務の強さと調停の選択肢を足した（決断の本体を差し替える） */
export function registerAllianceDecisions() { registerDecision("ally_call", (ctx, d, opt) => answerCall(ctx, d, opt)); }
export function pendingCall(civ, warId, stateId) { return (civ.wcde?.decisions?.queue ?? []).find((d) => d.kind === "ally_call" && d.payload.warId === warId && d.stateId === stateId) ?? null; }
export { resolveDecision, PACT_PURPOSES, pactAccepts };
