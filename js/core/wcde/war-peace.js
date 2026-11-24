// v7.0.0 W2/W3: 講和の条項・AI の受諾判定（理由つき）・講和会議（戦争スコアで要求を買う）・要求の実行。
//   ・交渉による講和（negotiated）: いつでも提案できる。受諾は「戦争支持・達成できそうな戦争目的・戦況」などの理由つきで決まる（evaluateDemandPeace）。
//   ・講和会議（conference）: 片側が崩れる（降伏）と始まる。勝者は貢献度に応じた戦争スコアで要求を買う。競合する要求は費用が上がる。
//       戦争スコア = 敵国の価値 100 × 1.35 × 貢献度（占領した勝利点の割合が 7 割、参加の下限が 3 割）。降伏していない敵国は価値が 6 割。
//       要求は、戦争目的の枠の中だけ買える（小さな要求 dmz・resource・fleet・hostage・amnesty は枠の外）。目的に沿う要求は 2 割安い。同じ対象への 2 つ目以降の入札は 1.2 倍ずつ高い。
//   ・プレイヤーが勝者の会議は、決断（conference）で「提案どおり／自分で選ぶ／締結」。プレイヤーが敗者のときは、条件の確認（peace_terms）の決断を出す。AI どうしは同じ規則で自動処理し、歴史に記録する。
//   要求の形: { kind, by: 勝者の国 id, target: 相手の国 id, groups?: [集団 id], amount?: 賠償額, seq } ／ kind は war-core.js の DEMAND_KINDS。
import { makeEvent } from "../civ/events.js";
import { byState } from "../civ/spatial.js";
import { hashSeed } from "../civ/civ-state.js";
import { formState } from "../civ/states.js";
import { enthrone } from "../civ/states.js";
import { adjustRel, endWar, signTreaty, endTreaty, warMaxMonths } from "../civ/diplomacy.js";
import { depFeasible } from "./dependency.js";
import { evaluatePeace, recordProposal } from "./negotiation.js";
import { placeName } from "./warfare.js";
import { totalPower } from "./power.js";
import { GOAL_KINDS, DEMAND_KINDS, sideOf, otherSide, leaderOf, wlog, ensureWarV7, goalsOf, demandAllowed, vpWeight, surrenderRec, measure, isCapitulated } from "./war-core.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const alive = (civ, id) => !!civ.states[id]?.alive;
const nm = (civ, id) => civ.states[id]?.name ?? "？";
const pct = (s) => Math.round(100 / (1 + Math.exp(-3 * s)));

// ---- 費用（戦争スコア）
/** 国の勝利点の合計（会議用。記録があればそれ、なければ数える） */
function targetTotal(ctx, w, st) { const rec = surrenderRec(w, st.id); if (!(rec.tot > 0)) measure(ctx, w, st); return surrenderRec(w, st.id).tot ?? 1; }
const groupsVp = (civ, gids) => gids.reduce((a, gid) => a + vpWeight(civ, civ.groups[gid]), 0);
/** 要求 1 つの基準の費用（競合・目的の割引の前）。何も変えない */
export function demandBaseCost(ctx, w, d) {
  const civ = ctx.civ, K = DEMAND_KINDS[d.kind]; if (!K) return Infinity; const t = civ.states[d.target];
  if (d.kind === "cede" || d.kind === "liberate") { const frac = t ? groupsVp(civ, d.groups ?? []) / targetTotal(ctx, w, t) : 0; return d.kind === "cede" ? Math.max(8, 110 * frac) : 40 + 60 * frac; }
  return K.cost;
}
const overlaps = (a, b) => a.target === b.target && (a.kind === b.kind && ["annex", "vassalize", "regime", "fleet", "dmz"].includes(a.kind) || ((a.kind === "annex" || b.kind === "annex") && ["annex", "cede", "liberate"].includes(a.kind) && ["annex", "cede", "liberate"].includes(b.kind)) || ((a.groups ?? []).some((g) => (b.groups ?? []).includes(g))));
/** 入札の並びから、要求ごとの実際の費用を数える（先に入れた要求と重なるほど高い）。{ costs: [], total: {id: 国ごとの合計} } */
export function priceBids(ctx, w, bids) {
  const costs = [], per = {};
  bids.forEach((d, i) => { let c = demandBaseCost(ctx, w, d); const earlier = bids.slice(0, i).filter((e) => !e.dropped && overlaps(d, e)).length; c *= Math.pow(1.2, earlier); if (goalsOf(w, d.by).some((g) => GOAL_KINDS[g.kind].unlocks.includes(d.kind) && g.target === d.target)) c *= 0.8; c = r1(c); costs.push(c); per[d.by] = (per[d.by] ?? 0) + c; });
  return { costs, per };
}

// ---- 要求の確認
/** 要求を確かめる（枠・対象・集団の持ち主）。理由があれば文字列 */
export function checkDemand(ctx, w, d, { strict = true } = {}) {
  const civ = ctx.civ; if (!DEMAND_KINDS[d?.kind]) return "未知の要求"; if (!alive(civ, d.by) || !alive(civ, d.target)) return "対象の国が存在しない";
  const bs = sideOf(w, d.by), ts = sideOf(w, d.target); if (!bs || !ts || bs === ts) return "この戦争の敵国が対象でなければならない";
  if (strict && !demandAllowed(w, d.by, d.kind, d.target)) return `戦争目的に「${DEMAND_KINDS[d.kind].ja}」が含まれていない（講和で取れる範囲の外）`;
  if (d.kind === "cede" || d.kind === "liberate") { if (!d.groups?.length) return "土地を選ぶ必要がある"; const t = civ.states[d.target]; for (const gid of d.groups) { const g = civ.groups[gid]; if (!g || g.stateId !== d.target) return "その土地は相手の国のものではない"; if (gid === t.capitalGroupId) return "首都は割譲できない（国ごとの併合で取る）"; } if ((byState(ctx).get(d.target) ?? []).length <= d.groups.length) return "国の土地をすべて割譲することはできない（併合を使う）"; }
  if (d.kind === "vassalize") { const o = civ.states[d.by], s = civ.states[d.target]; if (o.dependency || s.dependency) return "すでに従属関係がある国は従属化できない"; }
  if (d.kind === "annex" && civ.states[d.target].player && !isCapitulated(w, d.target)) return "降伏していない担当国は併合できない";
  return null;
}
/** 既定の要求の組み立て（AI の入札・担当国への提案）。by の国が、戦争目的に従って、予算の範囲で要求を選ぶ。決定的 */
export function autoDemands(ctx, w, by, budget, loserSide) {
  const civ = ctx.civ, out = [], goals = goalsOf(w, by).filter((g) => sideOf(w, g.target) === loserSide || g.kind === "liberate");
  let left = budget; const taken = new Set(); const occBy = w.ops?.occBy ?? {};
  const mk = (d) => { const probe = { ...d, by }, price = demandBaseCost(ctx, w, probe) * 0.8; if (price <= left && !checkDemand(ctx, w, probe, { strict: false })) { out.push(probe); left -= price; return true; } return false; };
  const groupsOfTarget = (tid, prefer) => (byState(ctx).get(tid) ?? []).filter((g) => g.id !== civ.states[tid].capitalGroupId && !taken.has(g.id)).sort((a, b) => (prefer(b) - prefer(a)) || (a.id < b.id ? -1 : 1));
  for (const g of goals) {
    const t = civ.states[g.target]; if (!t?.alive) continue;
    if (g.kind === "annex") { if (mk({ kind: "annex", target: t.id })) { for (const x of byState(ctx).get(t.id) ?? []) taken.add(x.id); continue; } }
    if (g.kind === "annex" || g.kind === "territory") { const pool = groupsOfTarget(t.id, (x) => (occBy[x.id] === by ? 100 : 0) + vpWeight(civ, x)), pick = []; for (const x of pool) { const probe = { kind: "cede", target: t.id, groups: [...pick, x.id], by }; if (demandBaseCost(ctx, w, probe) * 0.8 <= left && pick.length < Math.max(1, pool.length - 1)) pick.push(x.id); } if (pick.length) { mk({ kind: "cede", target: t.id, groups: pick }); for (const id of pick) taken.add(id); } }
    else if (g.kind === "subjugate") mk({ kind: "vassalize", target: t.id });
    else if (g.kind === "throne" || g.kind === "religion") mk({ kind: "regime", target: t.id });
    else if (g.kind === "reparations") mk({ kind: "reparations", target: t.id, amount: Math.max(0, Math.round(t.treasury * 0.4)) });
    else if (g.kind === "liberate") { const from = loserSide && w.sides[loserSide].map((i) => civ.states[i]).find((s) => s?.alive); if (!from) continue; const pool = groupsOfTarget(from.id, (x) => (occBy[x.id] === by ? 100 : 0)).filter((x) => occBy[x.id] === by).slice(0, 3); if (pool.length && (byState(ctx).get(from.id) ?? []).length > pool.length) mk({ kind: "liberate", target: from.id, groups: pool.map((x) => x.id) }); }
  }
  if (!out.length && !goals.length) { const lead = w.sides[loserSide].map((i) => civ.states[i]).find((s) => s?.alive); if (lead) mk({ kind: "reparations", target: lead.id, amount: Math.max(0, Math.round(lead.treasury * 0.3)) }); }
  return out;
}

// ---- 受諾の判定（理由つき）
const BURDEN = { annex: 3, vassalize: 2.2, cede: 1, liberate: 1.4, regime: 1.2, reparations: 1.2, dmz: 0.4, resource: 0.5, fleet: 0.5, hostage: 0.3, amnesty: 0 };
/** 要求つきの講和を、other が受け入れるか。何も変えない。{ accept, score, pct, factors, reasons, hard } */
export function evaluateDemandPeace(ctx, w, proposer, other, demands = []) {
  const civ = ctx.civ; ensureWarV7(w); const base = evaluatePeace(civ, w, proposer, other, { kind: "white" });
  const f = base.factors.map((x) => ({ ...x })); let s = base.score; const add = (ja, v) => { f.push({ ja, v: r2(v) }); s += v; };
  const rec = measure(ctx, w, other), cap = rec.capitulated, mine = demands.filter((d) => d.target === other.id || (sideOf(w, d.target) === sideOf(w, other.id))), gift = demands.filter((d) => d.target === proposer.id);
  const hard = (ja) => ({ accept: false, score: -9, pct: 1, factors: [...f, { ja, v: -9 }], reasons: [ja], hard: true });
  for (const d of mine) {
    if ((d.kind === "annex" || d.kind === "vassalize") && !cap && rec.vpPct < 30) return hard(`まだ戦える（占領された勝利点 ${rec.vpPct}%）のに、国を失う条件は呑めない`);
    let b = BURDEN[d.kind] ?? 1; if (d.kind === "cede" || d.kind === "liberate") { const t = civ.states[d.target]; b *= 1 + 3 * groupsVp(civ, d.groups ?? []) / targetTotal(ctx, w, t); } if (d.kind === "reparations") { const t = civ.states[d.target]; b *= clamp((d.amount ?? 0) / (Math.max(0, t.treasury) + 1), 0, 2); }
    add(`要求「${DEMAND_KINDS[d.kind].ja}」の重さ`, -b);
  }
  for (const d of gift) add(`こちらが譲る「${DEMAND_KINDS[d.kind].ja}」`, 0.3);
  if (cap) { const inFrame = mine.every((d) => demandAllowed(w, d.by, d.kind, d.target)); add(inFrame ? "降伏した国は、相手の戦争目的の範囲なら受け入れる" : "降伏していても、戦争目的の外の要求は拒みたい", inFrame ? 2.5 : -1.5); }
  const reasons = [...f].filter((x) => x.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4).map((x) => `${x.ja}（${x.v > 0 ? "受け入れに傾く" : "拒みたい"}）`);
  return { accept: s >= 0, score: r2(s), pct: pct(s), factors: f, reasons, hard: false };
}
/** 外部向け: 講和の提案の予測。受諾の見込み（%）と理由 */
export function predictPeace(ctx, warId, proposerId, terms = {}) {
  const civ = ctx.civ, w = civ.wars[warId], proposer = civ.states[proposerId]; if (!w || !proposer?.alive) return { ok: false, error: "戦争か国が見つからない" };
  const mySide = sideOf(w, proposerId); if (!mySide) return { ok: false, error: "参戦国ではない" }; const foeId = terms.withId && sideOf(w, terms.withId) === otherSide(mySide) ? terms.withId : leaderOf(w, otherSide(mySide)), other = civ.states[foeId];
  const demands = (terms.demands ?? []).map((d) => ({ ...d, by: proposerId, target: d.target ?? foeId })); const bad = demands.map((d) => checkDemand(ctx, w, d)).find(Boolean); const ev = evaluateDemandPeace(ctx, w, proposer, other, demands);
  return { ok: true, acceptPct: ev.pct, accept: ev.accept, reasons: ev.reasons, factors: ev.factors, invalid: bad ?? null, withId: foeId };
}
/** 外部向け: 宣戦の予測（何も変えない）。同盟・盟約・従属国の参戦見込み（%）、民意と正統性の変化、想定される期間 */
export function predictWar(ctx, atkId, defId, goals = []) {
  const civ = ctx.civ, atk = civ.states[atkId], def = civ.states[defId]; if (!atk?.alive || !def?.alive) return { ok: false, error: "国が見つからない" };
  const joins = []; const seen = new Set([atkId, defId]);
  const add = (st, side, p, why) => { if (!st?.alive || seen.has(st.id) && !joins.some((j) => j.stateId === st.id)) return; const j = joins.find((x) => x.stateId === st.id); if (j) { j.pct = Math.max(j.pct, p); return; } seen.add(st.id); joins.push({ stateId: st.id, name: st.name, side, pct: p, why }); };
  for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) {
    for (const t of civ.activeTreatyIds.map((i) => civ.treaties[i])) { if (!t.active || (t.a !== host.id && t.b !== host.id)) continue; const ally = civ.states[t.a === host.id ? t.b : t.a]; if (!ally?.alive || ally.id === foe.id) continue; if (t.type === "alliance") add(ally, side, 60, "攻守同盟"); else if (t.type === "defensive" && side === "d") add(ally, side, 60, "防衛同盟"); }
    for (const st of Object.values(civ.states)) if (st.alive && st.dependency?.overlord === host.id) add(st, side, st.dependency.kind === "vassal" || st.dependency.kind === "union" ? 95 : side === "d" && st.dependency.kind === "protectorate" ? 90 : 5, "従属国");
    if (host.dependency && side === "d") add(civ.states[host.dependency.overlord], side, host.dependency.kind === "tributary" ? 50 : 100, "宗主");
  }
  const A = totalPower(civ, atk) + 1, D = totalPower(civ, def) + 1, ratio = Math.log(A / D), cost = (goals ?? []).reduce((a, g) => a + (g.kind === "annex" ? 3 : g.kind === "subjugate" ? 2 : g.kind === "territory" ? 1 : 0.5), 0);
  const months = Math.max(6, Math.round(warMaxMonths(civ.date.year, 2 + joins.length) * clamp(0.35 / (0.4 + Math.abs(ratio)), 0.08, 0.5)));
  return { ok: true, joins, supportChange: -Math.round(4 + 3 * cost), legitimacyChange: -r2(0.01 + 0.01 * cost), expectedMonths: months, favored: ratio >= 0 ? "a" : "d", power: { a: Math.round(A), d: Math.round(D) } };
}

// ---- 要求の実行
const treatyNames = (civ) => ((civ.wcde ??= {}).warx ??= { seq: 0 }).names ??= {};
/** 条約の名前: 講和の地（勝者の首都の地名）から。同じ名前があれば年を添える */
export function peaceName(ctx, w, winnerId) {
  const civ = ctx.civ, cap = civ.groups[civ.states[winnerId]?.capitalGroupId], place = cap ? placeName(ctx, cap) : "名もなき地", used = treatyNames(civ); let n = `${place}条約`; if (used[n]) n = `${place}条約（${civ.date.year}年）`; used[n] = 1; return n;
}
const sev = (civ, id, to, v) => { const s = civ.states[id]; if (!s) return; const G = (s.grudges ??= {}); G[to] = r2(clamp((G[to] ?? 0) + v, 0, 2)); };
function moveGroups(ctx, gids, to, fromId) { const civ = ctx.civ, mi = civ.monthIndex, track = (civ.wcde.warx.hold ??= {}); for (const gid of gids) { const g = civ.groups[gid]; if (!g) continue; g.stateId = to.id; track[gid] = { from: fromId, to: to.id, at: mi, compliance: 0.3 }; } if (civ.states[fromId]) civ.states[fromId].interpDirty = true; to.interpDirty = true; }
/** 要求を 1 つ実行する。{ ok, note, event? }。実行できなければ ok:false（何も変えない）。 */
export function applyDemand(ctx, w, d) {
  const { civ, ids } = ctx, mi = civ.monthIndex, by = civ.states[d.by], t = civ.states[d.target]; (civ.wcde.warx ??= { seq: 0 }); if (!by?.alive || !t?.alive) return { ok: false, note: "国が消えていた" };
  const part = [{ entityId: by.id, role: "winner" }, { entityId: t.id, role: "loser" }, { entityId: w.id, role: "war" }], causes = w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [];
  switch (d.kind) {
    case "annex": { const gs = (byState(ctx).get(t.id) ?? []).map((g) => g.id); if (!gs.length) return { ok: false, note: "土地がなかった" }; moveGroups(ctx, gs, by, t.id); t.alive = false; t.corps = null; t.dissolvedAt = mi; t.mergedInto = by.id; sev(civ, t.id, by.id, 0.8); by.stability = clamp(by.stability - 0.03);
      makeEvent(civ, ids, { kind: "annexed", title: `${t.name}が${by.name}に併合された`, participants: part, location: civ.groups[t.capitalGroupId] ? { cell: civ.groups[t.capitalGroupId].cell } : null, causes, facts: { warId: w.id, stateId: by.id, annexed: t.id, cells: gs.slice(0, 24).map((g) => civ.groups[g]?.cell).filter(Number.isFinite) }, provenance: "simulation", why: "講和会議で、戦争目的（併合）に基づく要求が通った" }); return { ok: true, note: `${t.name}を併合した` }; }
    case "cede": { moveGroups(ctx, d.groups, by, t.id); sev(civ, t.id, by.id, 0.2 + 0.6 * groupsVp(civ, d.groups) / targetTotal(ctx, w, t));
      makeEvent(civ, ids, { kind: "conquest", title: `${t.name}が${by.name}に土地を割譲した（${d.groups.length}区画）`, participants: part, location: { cell: civ.groups[d.groups[0]]?.cell ?? null }, causes, facts: { warId: w.id, stateId: by.id, cells: d.groups.map((g) => civ.groups[g]?.cell).filter(Number.isFinite).slice(0, 24) }, provenance: "simulation", why: "講和の要求（領土）が通った" }); return { ok: true, note: `${t.name}から${d.groups.length}区画を割譲させた` }; }
    case "vassalize": { for (const tt of civ.activeTreatyIds.map((i) => civ.treaties[i])) if (tt.active && ((tt.a === by.id && tt.b === t.id) || (tt.a === t.id && tt.b === by.id))) endTreaty(ctx, tt, "講和により解消された");
      if (depFeasible(civ, by, t)) return { ok: false, note: "従属化できなかった（すでに結びつきがある）" }; const yr = civ.date.year, kind = yr < 4300 ? "tribute" : yr >= 4600 && by.techAdopted?.railway != null ? "protectorate" : "feudal";
      const tr = signTreaty(ctx, kind, by, t, { provenance: "simulation" }); t.dependency.autonomy = 0.3; t.dependency.byWar = w.id; sev(civ, t.id, by.id, 0.4);
      makeEvent(civ, ids, { kind: "vassalized", title: `${t.name}が${by.name}の${{ feudal: "封臣", tribute: "朝貢国", protectorate: "保護国" }[kind]}となった（講和）`, participants: part, location: null, causes, facts: { warId: w.id, stateId: by.id, vassal: t.id, treaty: tr.id, kind }, provenance: "simulation", why: "講和会議で従属化の要求が通った" }); return { ok: true, note: `${t.name}を従属国にした` }; }
    case "liberate": { const gs = d.groups.filter((gid) => civ.groups[gid]?.stateId === t.id); if (!gs.length) return { ok: false, note: "解放する土地がなかった" }; const ns = formState(ctx, { via: "secession", groupIds: gs, predecessor: t.id, cause: w.declaredEvent ?? null }); if (!ns) return { ok: false, note: "解放国を建てられなかった" };
      ns.liberatedBy = by.id; ns.liberatedAt = mi; adjustRel(ns, by, 30); sev(civ, t.id, by.id, 0.3); t.interpDirty = true; (civ.wcde.warx.hold ??= {}); for (const gid of gs) civ.wcde.warx.hold[gid] = { from: t.id, to: ns.id, at: mi, compliance: 1 };
      makeEvent(civ, ids, { kind: "liberated", title: `${ns.name}が解放され、独立国となった（${t.name}から）`, participants: [...part, { entityId: ns.id, role: "liberated_state" }], location: { cell: civ.groups[ns.capitalGroupId]?.cell ?? null }, causes, facts: { warId: w.id, stateId: ns.id, from: t.id, by: by.id }, provenance: "simulation", why: "講和会議で、占領されていた土地の解放が認められた" }); return { ok: true, note: `${ns.name}を解放した` }; }
    case "regime": { enthrone(ctx, t, { how: "講和による君主の交代", hit: 0.1 }); t.dynastyChangedAt = mi; sev(civ, t.id, by.id, 0.3); adjustRel(t, by, -10); return { ok: true, note: `${t.name}の君主を替えさせた` }; }
    case "reparations": { const want = Math.max(0, d.amount ?? t.treasury * 0.4), pay = Math.min(want, Math.max(0, t.treasury)); t.treasury -= pay; by.treasury += pay; sev(civ, t.id, by.id, 0.15 * clamp(pay / (want + 1), 0, 1) + 0.05); d.paid = Math.round(pay); return { ok: true, note: `賠償 ${Math.round(pay)}` }; }
    case "dmz": { t.army = Math.max(0, (t.army ?? 0) * 0.9); (t.restrict ??= {}).dmz = { by: by.id, until: mi + 240 }; return { ok: true, note: "非武装地帯を置いた" }; }
    case "resource": { (t.resourceRights ??= {})[by.id] = { until: mi + 240, share: 0.03 }; return { ok: true, note: "資源権を得た" }; }
    case "fleet": { const take = (t.army ?? 0) * 0.08; t.army = Math.max(0, t.army - take); by.army = (by.army ?? 0) + take * 0.5; sev(civ, t.id, by.id, 0.1); return { ok: true, note: "艦隊を接収した" }; }
    case "hostage": { (t.hostages ??= {})[by.id] = { until: mi + 240 }; adjustRel(t, by, 5); return { ok: true, note: "人質を取った" }; }
    case "amnesty": { for (const x of [t, by]) { for (const y of [t, by]) if (x !== y && x.grudges?.[y.id]) x.grudges[y.id] = r2(x.grudges[y.id] * 0.4); } adjustRel(t, by, 8); return { ok: true, note: "恩赦を与えた" }; }
  }
  return { ok: false, note: "未対応の要求" };
}
/** 要求の並びを実行する（併合 → 割譲 → 解放 → 従属化 → その他の順。同じ集団が二重に動かないよう、実行時に再検査する）。実行できたものを返す */
export function applyDemands(ctx, w, demands) {
  const order = ["annex", "cede", "liberate", "vassalize", "regime", "reparations", "dmz", "resource", "fleet", "hostage", "amnesty"], done = [];
  for (const d of [...demands].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.seq ?? 0) - (b.seq ?? 0))) { const bad = checkDemand(ctx, w, d, { strict: false }); if (bad && !(d.kind === "annex" && !alive(ctx.civ, d.target))) { wlog(ctx, w, "demand_failed", `要求「${DEMAND_KINDS[d.kind].ja}」は実行できなかった（${bad}）`); continue; } const r = applyDemand(ctx, w, d); if (r.ok) done.push({ ...d, note: r.note }); else wlog(ctx, w, "demand_failed", `要求「${DEMAND_KINDS[d.kind].ja}」は実行できなかった（${r.note}）`); }
  return done;
}
/** 講和の締結（歴史に残す）。conference: 会議か交渉か。戦争を終える */
function sign(ctx, w, winnerSide, done, why, kind) {
  const { civ, ids } = ctx, win = winnerSide, wl = leaderOf(w, win), name = peaceName(ctx, w, wl), all = [...w.sides.a, ...w.sides.d];
  w.peace = { name, at: civ.monthIndex, kind, winnerSide: win, demands: done.map((d) => ({ kind: d.kind, by: d.by, target: d.target, groups: d.groups?.length ?? 0, amount: d.paid ?? d.amount ?? null, note: d.note })) };
  const ev = makeEvent(civ, ids, { kind: "peace_signed", title: `${name}が結ばれた（${nm(civ, w.aggressor)}と${nm(civ, w.defender)}の戦争）`, participants: [{ entityId: w.id, role: "war" }, ...all.map((i) => ({ entityId: i, role: w.sides[win].includes(i) ? "winner" : "loser" }))], location: civ.groups[civ.states[wl]?.capitalGroupId] ? { cell: civ.groups[civ.states[wl].capitalGroupId].cell } : null, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, name, kind, demands: w.peace.demands.length }, provenance: "simulation", why });
  w.peaceEvent = ev.eventId; wlog(ctx, w, "peace", `${name}（${kind === "conference" ? "講和会議" : "交渉"}）: 要求 ${done.length} 件が実行された`);
}

// ---- 講和会議
const confOf = (w) => w.conf ?? null;
/** 会議の戦争スコア（勝者ごと）。敵国の価値 × 1.35 × 貢献度 */
export function conferenceScores(ctx, w, winnerSide) {
  const civ = ctx.civ, loserSide = otherSide(winnerSide), ops = w.ops ?? {}, wins = w.sides[winnerSide].filter((i) => alive(civ, i) && !isCapitulated(w, i)), occW = {}; let tot = 0;
  for (const gid of w.occupied ?? []) { const g = civ.groups[gid], by = ops.occBy?.[gid]; if (!g || !by || !wins.includes(by) || sideOf(w, g.stateId) !== loserSide) continue; const v = vpWeight(civ, g); occW[by] = (occW[by] ?? 0) + v; tot += v; }
  const pool = w.sides[loserSide].filter((i) => alive(civ, i)).reduce((a, i) => a + (isCapitulated(w, i) ? 100 : 60), 0), score = {};
  for (const id of wins) { const share = wins.length ? 0.3 / wins.length + 0.7 * (tot > 0 ? (occW[id] ?? 0) / tot : 1 / wins.length) : 0; score[id] = r1(pool * 1.35 * share); }
  return score;
}
/** 会議を始める（片側が崩れたとき）。勝者に戦争スコアが配られ、AI は要求を入れる。担当国が絡むなら決断を出して待つ。そうでなければ同じ月に締結する */
export function beginConference(ctx, w, loserSide) {
  const { civ } = ctx; if (w.phase === "conference") return; ensureWarV7(w); const win = otherSide(loserSide);
  w.phase = "conference"; w.conf = { loserSide, winnerSide: win, openedAt: civ.monthIndex, scores: conferenceScores(ctx, w, win), bids: [], seq: 0, wait: null };
  for (const id of [...w.sides.a, ...w.sides.d]) { const st = civ.states[id]; if (st) { const rec = surrenderRec(w, id); if (!rec.capitulated && w.sides[loserSide].includes(id)) { rec.capitulated = true; rec.since = civ.monthIndex; } } }
  wlog(ctx, w, "conference", `${nm(civ, leaderOf(w, loserSide))}側が崩れ、講和会議が始まった（勝者: ${w.sides[win].map((i) => nm(civ, i)).join("・")}）`);
  makeEvent(civ, ctx.ids, { kind: "conference_opened", title: `${nm(civ, w.aggressor)}と${nm(civ, w.defender)}の戦争で講和会議が開かれた`, participants: [{ entityId: w.id, role: "war" }, ...[...w.sides.a, ...w.sides.d].map((i) => ({ entityId: i, role: w.sides[win].includes(i) ? "winner" : "loser" }))], location: null, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id }, provenance: "simulation", why: "片側の主たる交戦国が降伏した" });
  const C = w.conf, players = w.sides[win].filter((i) => civ.states[i]?.player && alive(civ, i)), pl = w.sides[loserSide].filter((i) => civ.states[i]?.player && alive(civ, i));
  for (const id of w.sides[win].filter((i) => alive(civ, i) && !civ.states[i]?.player).sort((a, b) => (C.scores[b] ?? 0) - (C.scores[a] ?? 0) || (a < b ? -1 : 1))) for (const d of autoDemands(ctx, w, id, C.scores[id] ?? 0, loserSide)) C.bids.push({ ...d, seq: ++C.seq, ai: true });
  const raise = ctx.decisions?.raise;
  if (players.length && raise) { const id = players[0], d = raise(ctx, { kind: "conference", key: `cf|${w.id}|${id}`, stateId: id, title: `講和会議: ${nm(civ, leaderOf(w, loserSide))}側が降伏した`, body: `戦争スコア ${C.scores[id] ?? 0}。戦争目的の枠の中で、要求を買える。競合する要求は費用が上がる。`, options: [{ id: "auto", ja: "戦争目的に沿った要求で締結する", hint: "予算の範囲で、目的に沿う要求を自動で選ぶ" }, { id: "manual", ja: "要求を自分で選ぶ（会議を開く）", hint: "conference.bid で要求を入れ、conference.finish で締結する" }, { id: "finish", ja: "いまの要求で締結する", hint: "入札済みの要求だけで終える（なければ白紙に近い講和）" }], payload: { warId: w.id, state: id } }); if (d) { C.wait = d.id; C.player = id; return; } }
  if (pl.length && raise) { const id = pl[0], terms = previewDemands(ctx, w); const d = raise(ctx, { kind: "peace_terms", key: `pt|${w.id}|${id}`, stateId: id, title: `講和の条件が示された（${nm(civ, leaderOf(w, win))}側）`, body: terms.length ? terms.map((x) => `${nm(civ, x.by)}: ${DEMAND_KINDS[x.kind].ja}（${nm(civ, x.target)}）`).join(" ／ ") : "大きな要求はない。", options: [{ id: "accept", ja: "条件をのむ", hint: "講和が結ばれ、戦争が終わる" }], payload: { warId: w.id, state: id } }); if (d) { C.wait = d.id; C.player = id; return; } }
  finishConference(ctx, w);
}
const previewDemands = (ctx, w) => { const C = w.conf; const { costs } = priceBids(ctx, w, C.bids); return C.bids.filter((_, i) => costs[i] != null); };
/** 入札（担当国）。{ ok, cost, error } */
export function bid(ctx, w, byId, demand) {
  const C = confOf(w); if (!C || w.phase !== "conference") return { ok: false, error: "いま講和会議は開かれていない" }; if (!C.winnerSide || !w.sides[C.winnerSide].includes(byId)) return { ok: false, error: "勝者の側の国だけが要求できる" };
  const d = { ...demand, by: byId, seq: ++C.seq }; const bad = checkDemand(ctx, w, d); if (bad) return { ok: false, error: bad };
  const trial = [...C.bids, d], { costs, per } = priceBids(ctx, w, trial); if ((per[byId] ?? 0) > (C.scores[byId] ?? 0) + 1e-9) return { ok: false, error: `戦争スコアが足りない（必要 ${r1(per[byId])} / 持ち点 ${C.scores[byId] ?? 0}）` };
  C.bids.push(d); return { ok: true, cost: costs[costs.length - 1], seq: d.seq, left: r1((C.scores[byId] ?? 0) - (per[byId] ?? 0)) };
}
export function retract(ctx, w, byId, seq) { const C = confOf(w); if (!C) return { ok: false, error: "いま講和会議は開かれていない" }; const i = C.bids.findIndex((b) => b.seq === seq && b.by === byId); if (i < 0) return { ok: false, error: "その要求は見つからない" }; C.bids.splice(i, 1); return { ok: true }; }
/** 会議の現在の状況（画面用）: 持ち点・入札と費用 */
export function conferenceView(ctx, w) { const C = confOf(w); if (!C) return null; const { costs, per } = priceBids(ctx, w, C.bids); return { loserSide: C.loserSide, winnerSide: C.winnerSide, scores: { ...C.scores }, spent: per, bids: C.bids.map((b, i) => ({ ...b, cost: costs[i] })) }; }
/** 会議を締結する。予算を超える入札は後ろのものから落とす。要求を実行して戦争を終える */
export function finishConference(ctx, w) {
  const { civ } = ctx, C = confOf(w); if (!C || w.phase !== "conference") return; const kept = [], spent = {};
  for (const b of [...C.bids].sort((x, y) => x.seq - y.seq)) { const trial = [...kept, b], { per } = priceBids(ctx, w, trial); if ((per[b.by] ?? 0) <= (C.scores[b.by] ?? 0) + 1e-9) kept.push(b); else wlog(ctx, w, "bid_dropped", `${nm(civ, b.by)}の要求「${DEMAND_KINDS[b.kind].ja}」は戦争スコアが足りず落ちた`); void spent; }
  const done = applyDemands(ctx, w, kept); sign(ctx, w, C.winnerSide, done, "講和会議で、戦争スコアに応じた要求が通った", "conference");
  w.victor = C.winnerSide; w.phase = "ended"; const outcome = C.winnerSide === "a" ? "aggressor_victory" : "defender_victory";
  endWar(ctx, w, outcome, { kind: "conference" }); delete w.conf;
}
/** 会議の月次: 決断を待っていれば待つ。決断が消えていれば、そのまま締結する */
export function stepConference(ctx, w) {
  const C = confOf(w); if (!C) return;
  if (C.wait) { const open = (ctx.civ.wcde?.decisions?.queue ?? []).some((d) => d.id === C.wait); if (open) return; C.wait = null; }
  finishConference(ctx, w);
}

// ---- 交渉による講和（要求つき）
/** 要求つきの講和の提案。proposer が principal なら戦争全体を終える。成立すれば要求を実行して終戦。{ ok, accepted, reasons, pct } */
export function proposeWithDemands(ctx, proposer, w, terms = {}) {
  const civ = ctx.civ; ensureWarV7(w); const mySide = sideOf(w, proposer.id); if (!mySide || w.status !== "active" || w.phase !== "active") return { ok: false, error: "講和の提案はできない（戦争が進行中の局面ではない）" };
  const foeId = terms.withId && sideOf(w, terms.withId) === otherSide(mySide) ? terms.withId : leaderOf(w, otherSide(mySide)), other = civ.states[foeId]; if (!other?.alive) return { ok: false, error: "相手が存在しない" };
  const demands = (terms.demands ?? []).map((d, i) => ({ ...d, by: proposer.id, target: d.target ?? foeId, seq: i + 1 })); for (const d of demands) { const bad = checkDemand(ctx, w, d); if (bad) return { ok: false, error: bad }; }
  const ev = evaluateDemandPeace(ctx, w, proposer, other, demands); const principal = proposer.id === w.aggressor || proposer.id === w.defender;
  if (!principal && demands.length) return { ok: false, error: "同盟側の参戦国の単独講和では、要求は出せない（白紙講和だけ）" };
  if (!ev.accept) { recordProposal(ctx, { kind: "peace", warId: w.id, from: proposer.id, to: foeId, terms: { kind: "demands", n: demands.length }, status: "rejected" }); return { ok: true, accepted: false, pct: ev.pct, reasons: ev.reasons }; }
  return { ok: true, accepted: true, pct: ev.pct, reasons: ev.reasons, demands, mySide, principal };
}
/** 受け入れられた要求つき講和を実行する */
export function concludeWithDemands(ctx, w, mySide, demands, reasonsText = "") {
  const done = applyDemands(ctx, w, demands); sign(ctx, w, mySide, done, `交渉で講和が成った${reasonsText ? `（${reasonsText}）` : ""}`, "negotiated");
  w.victor = demands.length ? mySide : null; w.phase = "ended"; endWar(ctx, w, "negotiated", { kind: "demands" });
}

// ---- 国どうしだけの戦争（AI）の自動終結: 理由つき
/** AI どうしの戦争の自動終結の判定（3 か月ごと）。両者が白紙講和を受け入れる（疲弊）か、最大期間を超えれば、理由つきで終える。担当国が関わる戦争は、ここでは終えない */
export function stepAutoPeace(ctx, w) {
  const { civ } = ctx, mi = civ.monthIndex; if (mi % 3 !== (hashSeed(w.id) % 3)) return false;
  const all = [...w.sides.a, ...w.sides.d]; if (all.some((i) => civ.states[i]?.player)) return false;
  const A = civ.states[w.aggressor], D = civ.states[w.defender]; if (!A?.alive || !D?.alive) return false;
  const eA = evaluatePeace(civ, w, D, A, { kind: "white" }), eD = evaluatePeace(civ, w, A, D, { kind: "white" }), age = mi - w.startedAt;
  if (eA.accept && eD.accept && age >= 6) { const why = [...eA.factors, ...eD.factors].filter((x) => x.v > 0.4).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.ja).join("・"); sign(ctx, w, w.score >= 0 ? "a" : "d", [], `双方が疲弊し、白紙講和を受け入れた（${why || "戦況の膠着"}）`, "negotiated"); w.phase = "ended"; endWar(ctx, w, "negotiated", { kind: "white" }); return true; }
  if (age > warMaxMonths(civ.date.year, all.length)) { sign(ctx, w, w.score >= 0 ? "a" : "d", [], "最大期間に達し、どちらも決め手を欠いた（長期化による疲弊）", "negotiated"); w.phase = "ended"; endWar(ctx, w, "stalemate", { kind: "white" }); return true; }
  return false;
}
