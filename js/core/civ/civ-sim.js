// v5 M0/M1: 文明シミュレーションの組み立て。月次 tick に各システムを登録し、命令を受け付ける。
import { createTicker, monthIndex } from "./tick.js";
import { createIdGen } from "./ids.js";
import { rngOf, hashSeed, setDate, sortedGroupIds } from "./civ-state.js";
import { stepPopulation } from "./population.js";
import { stepCulture } from "./culture.js";
import { stepCohorts } from "./cohorts.js";
import { stepTech } from "./tech.js";
import { stepStates } from "./states.js";
import { stepWars, endWar } from "./diplomacy.js";
import { stepAIPlan, stepAIApply } from "./ai.js";
import { applyCommand } from "./commands.js";

export function createCivSim(world, civ) {
  const ids = createIdGen(civ.seq), ticker = createTicker();
  ticker.register("clock", (ctx) => { setDate(ctx.civ, ctx.civ.monthIndex + 1); ctx.rng = rngOf(hashSeed(ctx.civ.historySeed, ctx.civ.monthIndex)); }, "advanceClock");
  ticker.register("economy_pop", stepPopulation, "stepPopulation");
  ticker.register("culture", stepCulture, "stepCulture");
  ticker.register("culture", stepCohorts, "stepCohorts");
  ticker.register("tech", stepTech, "stepTech");
  ticker.register("ai_plan", stepAIPlan, "stepAIPlan");
  ticker.register("apply", stepAIApply, "stepAIApply");
  ticker.register("conflict", stepStates, "stepStates");
  ticker.register("conflict", stepWars, "stepWars");
  // 毎月は軽い検査（今月増えたイベントと集団）。全件の検査は10年ごと（全イベントの走査を毎月しない）
  ticker.register("integrity", (ctx) => { const full = ctx.civ.monthIndex % 120 === 0, errs = checkCivIntegrity(ctx.world, ctx.civ, { sinceEvent: full ? 0 : ctx.eventsChecked ?? 0, structure: full || ctx.civ.monthIndex % 12 === 0 }); ctx.eventsChecked = ctx.civ.events.length; if (errs.length) throw new Error("文明状態の整合性違反: " + errs.slice(0, 3).join(" / ")); }, "checkIntegrity");
  const ctx = { world, civ, ids, rng: rngOf(hashSeed(civ.historySeed, civ.monthIndex)), trace: [], eventsChecked: civ.events.length, plans: [], endWarHook: endWar,
    stateMult: (g) => { const st = g.stateId ? civ.states[g.stateId] : null; return st ? (st.boostUntil > civ.monthIndex ? 1.2 : 1) * (1 - 0.4 * st.policy.mobilization) : 1; } };
  return {
    ctx, ticker,
    advanceMonth() { ticker.runMonth(ctx); return civ.date; },
    advanceMonths(n, onProgress) { for (let i = 0; i < n; i++) { ticker.runMonth(ctx); if (onProgress && i % 120 === 119) onProgress(i + 1, n); } return civ.date; },
    command: (cmd) => applyCommand(ctx, cmd),
  };
}

/** 不変条件: 参照IDの存在・集団の位置が陸・集落の相互参照・プレイヤー集団は高々1つ・数値が有限 */
export function checkCivIntegrity(world, civ, { sinceEvent = 0, structure = true } = {}) {
  const errs = [], N = world.mesh.cellCount; let players = 0;
  if (structure) for (const id of sortedGroupIds(civ)) {
    const g = civ.groups[id];
    if (g.id !== id) errs.push(`集団IDの不一致 ${id}`);
    if (!Number.isFinite(g.pop) || g.pop < 0) errs.push(`人口が不正 ${id}`);
    if (!(g.cell >= 0 && g.cell < N) || world.cell.landWater[g.cell] !== 1) errs.push(`集団 ${id} が陸にいない`);
    if (g.player) players++;
    if (g.settlementId && civ.settlements[g.settlementId]?.groupId !== id) errs.push(`集落の相互参照が壊れている ${id}`);
  }
  if (players > 1) errs.push("プレイヤー集団が複数ある");
  let ps = 0; for (const id in civ.states) { const st = civ.states[id]; if (!st.alive) continue; if (st.player) ps++; if (!civ.groups[st.capitalGroupId] && civ.monthIndex % 3 !== 1) errs.push(`国家 ${id} の首都集団が無い`); for (const w of st.warIds) if (civ.wars[w]?.status !== "active") errs.push(`国家 ${id} の戦争参照が不正 ${w}`); }
  if (ps > 1) errs.push("プレイヤー国家が複数ある");
  if (structure) for (const id of sortedGroupIds(civ)) { const g = civ.groups[id]; if (g.stateId && !civ.states[g.stateId]?.alive) errs.push(`集団 ${id} が存在しない国家 ${g.stateId} に属している`); let sh = 0; for (const c of g.cohorts) sh += c.share; if (Math.abs(sh - 1) > 1e-6) errs.push(`集団 ${id} のコホート割合の合計が1でない`); }
  for (const wid of civ.activeWarIds) { const w = civ.wars[wid]; if (!w || w.status !== "active") errs.push(`進行中の戦争の記録が不正 ${wid}`); }
  for (const s of Object.values(civ.settlements)) if (!civ.groups[s.groupId]) errs.push(`集落 ${s.id} の集団が無い`);
  if (sinceEvent === 0) { // 全件検査: イベントID重複・親の集団が履歴にある
    const seen = new Set(), known = new Set(); for (const e of civ.events) { if (seen.has(e.eventId)) errs.push(`イベントID重複 ${e.eventId}`); seen.add(e.eventId); for (const p of e.participants) known.add(p.entityId); }
    for (const g of Object.values(civ.groups)) if (g.parent && !civ.groups[g.parent] && !known.has(g.parent)) errs.push(`親の集団 ${g.parent} が履歴にない`);
  } else { const last = civ.events.length > 0 ? civ.events[civ.events.length - 1].eventId : null; if (last && civ.events.slice(sinceEvent).some((e, i, a) => a.findIndex((x) => x.eventId === e.eventId) !== i)) errs.push("今月のイベントID重複"); }
  return errs;
}
export { monthIndex };
