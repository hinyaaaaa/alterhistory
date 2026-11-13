// V5-M5: 戦争・条約・関係値（文明層の簡易モデル）。国家の軍事力は 人口×動員×技術。戦争は月ごとに戦況が動き、占領・講和で終わる。
// 旧エディタの戦争モデル（simulation）との統合は後続。ここでは AI 行動が一貫して使える最小の戦争・外交を持つ。
import { makeEvent } from "./events.js";
import { byState, neighborGroups } from "./spatial.js";
import { dominant } from "./cohorts.js";
import { hashSeed } from "./civ-state.js";
import { milMult } from "./techfx.js";
import { distKm } from "./states.js";
import { recentEventsFor, asCauses, getEvent } from "./graph.js";

/** 戦争の理由の表示名（v6.9.0）。旧版は AI の戦争がすべて「conquest」だった */
export const WAR_REASON_JA = Object.freeze({ conquest: "領土の征服", succession: "王位継承をめぐる争い", religion: "宗教的な対立", trade_route: "交易路・資源をめぐる争い", revenge: "報復・失地の回復", independence: "独立・自治を求める戦争", civil_war: "内戦・反乱", alliance: "同盟に基づく参戦", defense: "防衛" });
/** 同じ 2 国の再戦までの冷却（月）。古代ほど長く、近代は短い（疲弊・同盟の再編を挟む）。世界の年は 0=紀元前 3000 年ごろ */
export const rematchCooldown = (year) => (year < 3000 ? 480 : year < 4500 ? 300 : year < 4850 ? 180 : 120);
/** 戦争の最長（月）。古代 50 年・中世 25 年・近世 10 年・近代 6 年。参戦国が多い大戦（近代）は 20 年まで */
export const warMaxMonths = (year, nStates = 2) => (year < 3000 ? 600 : year < 4500 ? 300 : year < 4850 ? 120 : nStates >= 6 ? 240 : 72);
export const TREATY = Object.freeze({ nonaggression: { ja: "不可侵条約", months: 240 }, alliance: { ja: "同盟", months: 480 }, trade: { ja: "通商協定", months: 240 } });
export const adjustRel = (a, b, d) => { const c = (v) => Math.max(-100, Math.min(100, v)); a.relations[b.id] = c((a.relations[b.id] ?? 0) + d); b.relations[a.id] = c((b.relations[a.id] ?? 0) + d); };
export const treatyBetween = (civ, a, b, type) => civ.activeTreatyIds.map((i) => civ.treaties[i]).find((t) => t.active && (!type || t.type === type) && ((t.a === a.id && t.b === b.id) || (t.a === b.id && t.b === a.id)));
export const atWarWith = (civ, a, b) => a.warIds.map((i) => civ.wars[i]).some((w) => w.sides.a.includes(b.id) || w.sides.d.includes(b.id));
export const strength = (civ, st) => st.army * milMult(st) * (1 + (st.defense + (st.milDef ?? 0)) * 0.5);
/** 隣接する国家（領域が接している）。月ごと・国家ごとに1回計算して使い回す */
export function neighborStates(ctx, st) {
  const cache = ctx._nbr && ctx._nbrMonth === ctx.civ.monthIndex ? ctx._nbr : (ctx._nbr = new Map(), ctx._nbrMonth = ctx.civ.monthIndex, ctx._nbr);
  if (cache.has(st.id)) return cache.get(st.id);
  const out = new Set(); for (const g of byState(ctx).get(st.id) ?? []) for (const o of neighborGroups(ctx, g)) { const s = ctx.civ.groups[o]?.stateId; if (s && s !== st.id && ctx.civ.states[s].alive) out.add(s); }
  const r = [...out].sort(); cache.set(st.id, r); return r;
}
export function signTreaty(ctx, type, a, b, { decisionId = null, provenance = "simulation" } = {}) {
  const { civ, ids } = ctx, id = ids.next("treaty"), t = { id, type, a: a.id, b: b.id, signedAt: civ.monthIndex, expiresAt: civ.monthIndex + TREATY[type].months, active: true };
  civ.treaties[id] = t; civ.activeTreatyIds.push(id); adjustRel(a, b, type === "alliance" ? 25 : 15);
  makeEvent(civ, ids, { kind: "treaty_signed", title: `${a.name}と${b.name}が${TREATY[type].ja}を結んだ`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }, { entityId: id, role: "treaty" }], location: null, facts: { type, a: a.id, b: b.id }, provenance }); return t;
}
export function endTreaty(ctx, t, why, byId = null) {
  const { civ, ids } = ctx; t.active = false; t.endedAt = civ.monthIndex; if (t.type === "nonaggression") for (const x of [t.a, t.b]) if (civ.states[x]) civ.states[x].lastNapEnd = civ.monthIndex; civ.activeTreatyIds = civ.activeTreatyIds.filter((i) => i !== t.id);
  makeEvent(civ, ids, { kind: "treaty_ended", title: `${TREATY[t.type].ja}が${why}`, participants: [{ entityId: t.id, role: "treaty" }, { entityId: t.a, role: byId === t.a ? "breaker" : "party" }, { entityId: t.b, role: byId === t.b ? "breaker" : "party" }], location: null, effects: byId ? [{ targetId: t.id, property: "broken_by", before: null, after: byId }] : [] });
}
/** 過去の同じ相手との戦争が、今回の宣戦の理由になっていれば「反応」として結ぶ（負けた側が仕掛けるなら根拠は strong） */
function revengeCauses(civ, atk, def) {
  const out = []; for (const ev of recentEventsFor(civ, [atk.id], ["war_ended"], 1200, 6)) { if (!ev.participants.some((p) => p.entityId === def.id)) continue; const w = civ.wars[ev.participants.find((p) => p.role === "war")?.entityId]; const lost = w && ((w.sides.a.includes(atk.id) && w.outcome === "defender_victory") || (w.sides.d.includes(atk.id) && w.outcome === "aggressor_victory")); out.push({ targetId: ev.eventId, relation: "reaction_to", basis: lost ? "strong" : "plausible" }); if (out.length >= 2) break; }
  return out;
}
export function warReasonFor(ctx, atk, def) { // v6.9.0: 状況から理由を選ぶ（決定的）
  const { civ } = ctx, h = hashSeed(atk.id, def.id, civ.monthIndex >> 3) % 100, mi = civ.monthIndex;
  if (atk.lastWarWith?.[def.id] != null && mi - atk.lastWarWith[def.id] < 1200) return "revenge";
  const cA = civ.groups[atk.capitalGroupId], cB = civ.groups[def.capitalGroupId];
  if (def.dynastyChangedAt != null && mi - def.dynastyChangedAt < 240 && h < 70) return "succession"; // 王朝が代わって間もない国への介入
  if (cA && cB && dominant(cA).religionId && dominant(cB).religionId && dominant(cA).religionId !== dominant(cB).religionId && h < 45) return "religion";
  if (cA && cB && h >= 45 && h < 75 && (atk.econ?.trade || def.econ?.trade)) return "trade_route";
  return "conquest";
}
export function declareWar(ctx, atk, def, { reason = "conquest", decisionId = null, provenance = "simulation" } = {}) {
  const { civ, ids, rng } = ctx; if (reason === "conquest") reason = warReasonFor(ctx, atk, def);
  const id = ids.next("war"), w = { id, aggressor: atk.id, defender: def.id, sides: { a: [atk.id], d: [def.id] }, startedAt: civ.monthIndex, status: "active", reason, score: 0, occupied: [], outcome: null, endedAt: null, casualties: 0 };
  civ.wars[id] = w; civ.activeWarIds.push(id); atk.warIds.push(id); def.warIds.push(id); adjustRel(atk, def, -40);
  const ev = makeEvent(civ, ids, { kind: "war_declared", title: `${atk.name}が${def.name}に宣戦した`, participants: [{ entityId: atk.id, role: "aggressor" }, { entityId: def.id, role: "defender" }, { entityId: id, role: "war" }], location: civ.groups[def.capitalGroupId] ? { cell: civ.groups[def.capitalGroupId].cell } : null, causes: revengeCauses(civ, atk, def), facts: { warId: id, aggressor: atk.id, defender: def.id }, provenance });
  w.declaredEvent = ev.eventId;
  for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) for (const t of civ.activeTreatyIds.map((i) => civ.treaties[i])) {
    if (t.type !== "alliance" || (t.a !== host.id && t.b !== host.id)) continue; const ally = civ.states[t.a === host.id ? t.b : t.a]; if (!ally?.alive || ally.id === foe.id || w.sides.a.includes(ally.id) || w.sides.d.includes(ally.id)) continue;
    if (ally.player && ctx.decisions?.allyCall(ctx, w, side, host, foe, ally)) continue; // v6.12.0: 担当国の参戦は、自動で決まらず決断する
    if (rng() < 0.6) { w.sides[side].push(ally.id); ally.warIds.push(id); adjustRel(ally, foe, -25); makeEvent(civ, ids, { kind: "ally_joined", title: `${ally.name}が${host.name}側で参戦した`, participants: [{ entityId: ally.id, role: "ally" }, { entityId: id, role: "war" }], location: null, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] }); }
  }
  ctx.warOps?.init(ctx, w); // v6.1.0 M6: WCDE の世界では、戦域・部隊・作戦を持つ戦争の記録にする
  return w;
}
export function endWar(ctx, w, outcome, terms = null) {
  const { civ, ids } = ctx; if (w.status !== "active") return; w.status = "ended"; w.outcome = outcome; w.endedAt = civ.monthIndex; civ.activeWarIds = civ.activeWarIds.filter((i) => i !== w.id);
  const all = [...w.sides.a, ...w.sides.d].map((i) => civ.states[i]); for (const s of all) s.warIds = s.warIds.filter((i) => i !== w.id);
  const atk = civ.states[w.aggressor], def = civ.states[w.defender]; const lead = outcome === "aggressor_victory" || (outcome === "negotiated" && w.score > 0);
  const gained = [], moved = []; const settled = ctx.warOps?.settle ? ctx.warOps.settle(ctx, w, outcome, terms) : null; // v6.1.0 M7: WCDE の世界では、占領した国家ごとに領土を移す
  if (settled) for (const x of settled) { gained.push(x.gid); moved.push(x); } else if (lead && atk?.alive) for (const gid of w.occupied) { const g = civ.groups[gid]; if (g && g.stateId === w.defender) { g.stateId = atk.id; gained.push(gid); } }
  for (const x of w.sides.a) for (const y of w.sides.d) { const X = civ.states[x], Y = civ.states[y]; if (X && Y) { (X.lastWarWith ??= {})[y] = civ.monthIndex; (Y.lastWarWith ??= {})[x] = civ.monthIndex; } } // v6.9.0: 同じ 2 国の再戦を抑える
  for (const s of all) { s.lastWarEnd = civ.monthIndex; s.stability = Math.max(0, s.stability - 0.04); if (s.campaign?.warId === w.id) s.campaign = null; }
  if (atk && def) adjustRel(atk, def, -10);
  makeEvent(civ, ids, { kind: "war_ended", title: `${atk?.name ?? "?"}と${def?.name ?? "?"}の戦争が終わった（${{ aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", stalemate: "決着つかず", negotiated: terms?.kind === "cession" ? "講和（占領地の割譲）" : "講和", state_dissolved: "国家の消滅" }[outcome] ?? outcome}）`, participants: [{ entityId: w.id, role: "war" }, ...all.map((s) => ({ entityId: s.id, role: "belligerent" }))], location: null, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: gained.map((gid) => { const m = moved.find((x) => x.gid === gid); return { targetId: gid, property: "stateId", before: m?.from ?? w.defender, after: m?.to ?? atk.id }; }), facts: { warId: w.id, outcome, terms: terms?.kind ?? null, stateId: gained.length ? (moved[0]?.to ?? atk?.id ?? null) : null, cells: gained.slice(0, 24).map((gid) => civ.groups[gid]?.cell).filter(Number.isFinite) } });
  ctx.warOps?.finalize(ctx, w, outcome); // 作戦・部隊・戦域を片付け、代表的な戦いだけを資料に残す（領土の移転のあと）
}

/** 月次（conflict フェーズ）: 条約の期限・戦況・占領・講和。国家が滅びた戦争は終える */
export function stepWars(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex;
  if (mi % 12 === 0) { for (const i of [...civ.activeTreatyIds]) { const t = civ.treaties[i]; if (t.expiresAt <= mi || !civ.states[t.a]?.alive || !civ.states[t.b]?.alive) endTreaty(ctx, t, "期限を迎えた"); } for (const id in civ.states) { const s = civ.states[id]; if (s.alive) for (const k in s.relations) { s.relations[k] = Math.round(s.relations[k] * 0.9 * 10) / 10; if (Math.abs(s.relations[k]) < 1) delete s.relations[k]; } } }
  const groups = byState(ctx); ctx.warOps?.monthly(ctx);
  for (const wid of [...civ.activeWarIds]) {
    const w = civ.wars[wid], A = w.sides.a.map((i) => civ.states[i]).filter((s) => s.alive), D = w.sides.d.map((i) => civ.states[i]).filter((s) => s.alive);
    if (!civ.states[w.aggressor].alive || !civ.states[w.defender].alive || !A.length || !D.length) { endWar(ctx, w, "state_dissolved"); continue; }
    if (ctx.warOps) { ctx.warOps.step(ctx, w); continue; } // v6.1.0 M6: 作戦・会戦の戦争モデル（WCDE の世界）。v5 の世界は下の簡易モデル
    const sA = A.reduce((s, x) => s + strength(civ, x), 0), sD = D.reduce((s, x) => s + strength(civ, x), 0);
    w.score = Math.max(-100, Math.min(100, w.score + ((sA - sD) / (sA + sD + 1)) * 6 + (rng() - 0.5) * 3));
    const lossA = 0.0025 * (sD / (sA + sD + 1)), lossD = 0.0025 * (sA / (sA + sD + 1)); let dead = 0;
    for (const [side, loss] of [[A, lossA], [D, lossD]]) for (const s of side) { const gs = groups.get(s.id); if (!gs?.length) continue; const g = gs[Math.floor(rng() * gs.length)], l = g.pop * loss * 4; g.pop -= l; dead += l; }
    w.casualties += dead;
    if (mi % 3 === 0 && rng() < 0.4) makeEvent(civ, ids, { kind: "battle_fought", title: `${civ.states[w.aggressor].name}と${civ.states[w.defender].name}の戦闘`, participants: [{ entityId: w.id, role: "war" }, { entityId: w.aggressor, role: "aggressor" }, { entityId: w.defender, role: "defender" }], location: { cell: civ.groups[civ.states[w.defender].capitalGroupId]?.cell ?? null }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }] });
    if (w.score >= 35 && w.occupied.length < 3 && rng() < 0.08) { // 占領: 防衛側のうち、攻撃側の首都に最も近い集団
      const cap = civ.groups[civ.states[w.aggressor].capitalGroupId]; const cand = D.flatMap((s) => groups.get(s.id) ?? []).filter((g) => !w.occupied.includes(g.id)); if (cap && cand.length) { cand.sort((a, b) => distKm(world, cap.cell, a.cell) - distKm(world, cap.cell, b.cell)); const g = cand[0]; w.occupied.push(g.id); makeEvent(civ, ids, { kind: "territory_occupied", title: "領土が占領された", participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }], location: { cell: g.cell }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] }); }
    }
    const age = mi - w.startedAt;
    if (w.score >= 80) endWar(ctx, w, "aggressor_victory"); else if (w.score <= -80) endWar(ctx, w, "defender_victory"); else if (age > 120) endWar(ctx, w, "stalemate");
  }
}
