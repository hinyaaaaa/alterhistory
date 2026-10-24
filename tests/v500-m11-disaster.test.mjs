// V5-M11: 気候と自然災害。災害→食料・人口→緊張・安定→AIの対応→記憶→後の政策、の因果と制約。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { climateIndex, climateGrowth, disasterMemory, strikeDisaster, KIND_JA } from "../js/core/civ/disaster.js";
import { formState } from "../js/core/civ/states.js";
import { ACTION, observe } from "../js/core/civ/actions.js";
import { getEvent, consequencesOf, neighborhood, checkGraph } from "../js/core/civ/graph.js";
import { encodeCivChunks, decodeCivChunks } from "../js/core/civ/civ-chunks.js";
import { stateAt } from "../js/core/civ/history.js";
import { rngOf } from "../js/core/civ/civ-state.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const mk = (seed) => { const civ = createCivState(W, { startGroupId: 1, historySeed: seed }); return { civ, sim: createCivSim(W, civ) }; };
const { civ, sim } = mk(99); sim.advanceMonths(900 * 12);
const ev = (k) => civ.events.filter((e) => e.kind === k);
console.log(`  (900年: 災害 ${Object.keys(civ.disasters).length}・気候の変化 ${ev("climate_shift").length}・飢え ${ev("famine").length})`);

console.log("=== M11: 気候 ===");
await check("気候指数は seed と月だけで決まり（保存不要）、寒冷期・平常・温暖期を行き来する。変化は事実のイベントとして残る", () => {
  assert.equal(climateIndex(civ, 1234), climateIndex(civ, 1234)); const ph = new Set(); for (let m = 0; m < 900 * 12; m += 60) { const i = climateIndex(civ, m); assert.ok(Math.abs(i) <= 1); ph.add(i > 0.35 ? "warm" : i < -0.35 ? "cool" : "normal"); } assert.equal(ph.size, 3);
  const cs = ev("climate_shift"); assert.ok(cs.length >= 4); for (const e of cs) assert.ok(e.effects[0].before !== e.effects[0].after);
  const c2 = { climate: { phase: "cool" } }, c3 = { climate: { phase: "normal" } }; assert.ok(climateGrowth(c2) < climateGrowth(c3));
});
console.log("=== M11: 災害 ===");
await check("災害は種類ごとに地理で決まる（洪水は川か海岸、噴火は火山の近く）。記録は規模・範囲・被害・期間を持つ", () => {
  const ds = Object.values(civ.disasters); assert.ok(ds.length >= 50, `${ds.length}`); const kinds = new Set(ds.map((d) => d.kind)); assert.ok(kinds.has("drought") && kinds.has("flood"), [...kinds].join());
  const fl = ds.filter((d) => d.kind === "flood"); assert.ok(fl.filter((d) => W.cell.river[d.center] || W.cell.coastDist[d.center] <= 1).length / fl.length > 0.8, "洪水が川・海岸から離れている");
  for (const d of ds.filter((x) => x.kind === "volcano")) { const m = W.mesh; let near = W.cell.volcanic[d.center] > 0.3; for (let k = m.neighborOffsets[d.center]; k < m.neighborOffsets[d.center + 1]; k++) if (W.cell.volcanic[m.neighborIds[k]] > 0.3) near = true; assert.ok(near, "火山の無い所で噴火"); }
  for (const d of ds) { assert.ok(d.severity >= 0.3 && d.severity <= 1 && d.endsAt > d.startedAt && d.groupIds.length >= 1 && KIND_JA[d.kind]); assert.ok(getEvent(civ, d.eventId)); }
  assert.ok(ds.filter((d) => d.kind === "drought").every((d) => d.endsAt - d.startedAt >= 12) && ds.filter((d) => d.kind === "flood").every((d) => d.endsAt - d.startedAt <= 3), "継続期間");
});
await check("被害: 洪水・噴火は人口を減らし、国家の安定度を下げる（効果は before/after で記録）", () => {
  const hit = ev("disaster_struck").filter((e) => e.effects.some((x) => x.property === "pop" && x.after < x.before)); assert.ok(hit.length >= 10); const stab = ev("disaster_struck").flatMap((e) => e.effects.filter((x) => x.property === "stability")); assert.ok(stab.length >= 1 && stab.every((x) => x.after <= x.before));
});
await check("因果の連鎖: 災害 →（食料の低下）→ 飢え →（不満）→ 要求・不安定 が、因果グラフで辿れる。終了は発生の一部", () => {
  const dis = ev("disaster_struck"), withFamine = dis.filter((d) => consequencesOf(civ, d.eventId).some((c) => c.event.kind === "famine")); assert.ok(withFamine.length >= 3, `飢えにつながった災害 ${withFamine.length}`);
  for (const d of withFamine.slice(0, 30)) for (const c of consequencesOf(civ, d.eventId).filter((x) => x.event.kind === "famine")) { assert.equal(c.relation, "caused_by"); assert.equal(c.basis, "strong"); }
  const chain = withFamine.filter((d) => neighborhood(civ, d.eventId, { depth: 3, maxNodes: 80 }).nodes.some((n) => n.kind === "demand_raised" || n.kind === "instability")); assert.ok(chain.length >= 1, "不満・不安定まで連なる例が無い");
  for (const e of ev("disaster_ended")) assert.equal(e.causes[0].relation, "part_of");
  const mig = ev("group_split").filter((e) => e.causes.some((c) => getEvent(civ, c.targetId)?.kind === "disaster_struck")); assert.ok(mig.length >= 1, "災害を逃れた分派が無い");
});
await check("備蓄（resilience）のある国は被害が小さい（同じ災害・同じ乱数で、死者が減る）", () => {
  const run = (res) => { const { civ: c, sim: s } = mk(7); s.advanceMonths(60); const g = Object.values(c.groups).find((x) => !x.player && x.pop > 300) ?? Object.values(c.groups)[0]; g.pop = 2000; const st = formState(s.ctx, { via: "agri_union", groupIds: [g.id] }); st.resilience = res; s.ctx.rng = rngOf(12345); return strikeDisaster(s.ctx, g, "flood").deaths; };
  const a = run(0), b = run(0.5); assert.ok(b < a, `${b} < ${a}`);
});
console.log("=== M11: 記憶と政策 ===");
await check("災害を受けた国家には記憶が残り、時間とともに薄れる（半減期 120 年）", () => {
  const st = Object.values(civ.states).find((s) => s.memory?.disaster); assert.ok(st, "記憶を持つ国が無い"); const m0 = disasterMemory(civ, st); assert.ok(m0 > 0); const keep = civ.monthIndex; civ.monthIndex += 1440; const m1 = disasterMemory(civ, st); civ.monthIndex = keep; assert.ok(Math.abs(m1 / m0 - 0.5) < 0.02, `${m1 / m0}`);
});
await check("記憶の強い国ほど備蓄・治水を整える（記憶ゼロなら動機が無い）。災害の最中は救済を選ぶ", () => {
  const { civ: c, sim: s } = mk(8); const g = Object.values(c.groups).filter((x) => !x.player).slice(0, 2); const st = formState(s.ctx, { via: "agri_union", groupIds: g.map((x) => x.id) }); st.treasury = 300; const e = observe(s.ctx, st);
  const sum = (cs) => cs.filter((x) => x.eligible).reduce((t, x) => t + Object.values(x.factors).reduce((a, b) => a + Math.max(0, b), 0), 0);
  const none = sum(ACTION.build_granary.candidates(s.ctx, st, e)); st.memory = { disaster: { flood: { w: 1, at: c.monthIndex } } }; const some = sum(ACTION.build_granary.candidates(s.ctx, st, e)); assert.ok(none === 0 && some > 0.5, `${none} ${some}`);
  assert.deepEqual(ACTION.disaster_relief.candidates(s.ctx, st, e), []); strikeDisaster(s.ctx, g[0], "drought"); assert.ok(ACTION.disaster_relief.candidates(s.ctx, st, e).some((x) => x.eligible));
  const gran = civ.decisions.filter((d) => d.chosen.key === "build_granary" && d.result?.ok); assert.ok(gran.length >= 1, "備蓄を選んだ判断が無い"); for (const d of gran) assert.ok(civ.states[d.actorId].memory?.disaster, "記憶が無いのに備蓄");
  assert.ok(civ.decisions.some((d) => d.chosen.key === "disaster_relief" && d.result?.ok));
});
await check("プレイヤー国家は災害にも自動で対処されない（判断記録は NPC のみ。プレイヤー集団の避難は『提案』）", () => { const pl = new Set(Object.values(civ.states).filter((s) => s.player).map((s) => s.id)); for (const d of civ.decisions) if (pl.has(d.actorId)) assert.equal(d.provenance, "player"); });
await check("保存→読み込み、履歴（備蓄）、整合性、参照切れ", () => {
  const ch = encodeCivChunks(civ), c2 = decodeCivChunks((n) => ch[n], Object.keys(ch)); assert.deepEqual(c2.disasters, civ.disasters); assert.deepEqual(c2.climate, civ.climate); assert.deepEqual(checkGraph(c2), []);
  const st = Object.values(civ.states).find((s) => s.resilience > 0); if (st) assert.equal(stateAt(civ, st.id, civ.monthIndex).resilience, st.resilience); assert.deepEqual(checkCivIntegrity(W, civ), []);
});
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
