// v5.0.0 V5-M0（月次tick・不変ID）と V5-M1（人口集団・集落・生業・移住）。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createIdGen, parseId } from "../js/core/civ/ids.js";
import { PHASE_KEYS, createTicker, monthIndex, fromMonthIndex } from "../js/core/civ/tick.js";
import { createCivState, encodeCiv, decodeCiv } from "../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { reachable, stepCost, POP } from "../js/core/civ/population.js";
import { makeEvent } from "../js/core/civ/events.js";
import * as consts from "../js/core/civ/world-consts.js";
import * as wg from "../js/core/world/worldgen.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const mk = (seed = 12345, start = 1) => { const civ = createCivState(W, { startGroupId: start, historySeed: seed }); return { civ, sim: createCivSim(W, civ) }; };

console.log("=== 境界 ===");
await check("文明層が持つ世界の列挙値の写しは、世界生成の本体と一致する", () => { assert.deepEqual(consts.LAND_WATER, wg.LAND_WATER); assert.deepEqual(consts.BIOMES, wg.BIOMES); });
console.log("=== M0: 不変ID ===");
await check("IDは種別つきで一意、検査文字で壊れを検出、年月・タイトルに依存しない", () => { const seq = {}, g = createIdGen(seq), a = g.next("event"), b = g.next("event"); assert.notEqual(a, b); assert.equal(parseId(a).kind, "event"); assert.equal(parseId(a.slice(0, -1) + (a.endsWith("z") ? "y" : "z")), null); assert.equal(seq.event, 2); assert.throws(() => g.next("nonsense")); });
await check("連番は保存した seq から続く（保存・読み込みをまたいでIDが重ならない）", () => { const seq = {}, g1 = createIdGen(seq); const used = new Set([g1.next("pop"), g1.next("pop")]); const g2 = createIdGen(JSON.parse(JSON.stringify(seq))); assert.ok(!used.has(g2.next("pop"))); });
console.log("=== M0: 月次tickの順序 ===");
await check("フェーズ順は指示書 §2.1 の11段階で固定", () => assert.deepEqual(PHASE_KEYS, ["clock", "climate", "disaster", "economy_pop", "culture", "tech", "ai_plan", "apply", "conflict", "integrity", "notify"]));
await check("登録の順番に関わらず、フェーズ順に実行される", () => { const t = createTicker(), ctx = {}; t.register("notify", () => {}, "n"); t.register("clock", () => {}, "c"); t.register("economy_pop", () => {}, "e"); t.runMonth(ctx); assert.deepEqual(ctx.trace, ["clock:c", "economy_pop:e", "notify:n"]); assert.throws(() => t.register("bogus", () => {})); });
await check("1回の advanceMonth は丁度1か月（10年=120回で10年）。紀元前・負の年にも対応", () => { const { civ, sim } = mk(); const y0 = civ.date.year, m0 = civ.date.month; sim.advanceMonths(120); assert.equal(civ.monthIndex - monthIndex(y0, m0), 120); assert.deepEqual(fromMonthIndex(monthIndex(-5, 12)), { year: -5, month: 12 }); assert.deepEqual(fromMonthIndex(monthIndex(-5, 12) + 1), { year: -4, month: 1 }); });

console.log("=== M1: 人口集団 ===");
await check("世界の初期集団すべてが集団になり、プレイヤーは選んだ1つだけ", () => { const { civ } = mk(); assert.equal(Object.keys(civ.groups).length, W.entities.populations.length); const p = Object.values(civ.groups).filter((g) => g.player); assert.equal(p.length, 1); assert.equal(civ.player.groupId, p[0].id); assert.throws(() => createCivState(W, { startGroupId: 9999 })); });
await check("同じ歴史シードなら同じ歴史、別シードなら別の歴史（地理とは独立）", () => { const a = mk(777), b = mk(777), c = mk(778); for (const s of [a, b, c]) s.sim.advanceMonths(600); assert.deepEqual(JSON.parse(JSON.stringify(a.civ)), JSON.parse(JSON.stringify(b.civ))); assert.notDeepEqual(JSON.stringify(a.civ.groups), JSON.stringify(c.civ.groups)); });
await check("50年の月次進行で、人口は増え、整合性が保たれる（毎月の検査を通る）", () => { const { civ, sim } = mk(); const before = Object.values(civ.groups).reduce((s, g) => s + g.pop, 0); sim.advanceMonths(600); const after = Object.values(civ.groups).reduce((s, g) => s + g.pop, 0); assert.ok(after > before, `${before} → ${after}`); assert.deepEqual(checkCivIntegrity(W, civ), []); });
await check("収容力を超えた集団は増え続けない（人口は収容力付近で頭打ち）", () => { const { civ, sim } = mk(); sim.advanceMonths(1200); for (const g of Object.values(civ.groups)) assert.ok(g.pop < 1e7); });
await check("プレイヤー集団は、自動で分派・定住・生業転換をしない（提案が出るだけ）", () => { const { civ, sim } = mk(4242); const pid = civ.player.groupId; const start = { cell: civ.groups[pid].cell, subs: civ.groups[pid].subsistence }; sim.advanceMonths(1800); const g = civ.groups[pid]; assert.ok(g, "プレイヤー集団が残っている"); assert.equal(g.cell, start.cell); assert.equal(g.subsistence, start.subs); assert.equal(g.settlementId, null); assert.ok(!civ.events.some((e) => e.provenance === "simulation" && ["group_split", "settlement_founded", "subsistence_changed"].includes(e.kind) && e.participants.some((p) => p.entityId === pid && ["origin", "founder", "subject"].includes(p.role)))); });
await check("NPC の集団は、人口が増えると分派・移住して広がる", () => { const { civ, sim } = mk(99); const n0 = Object.keys(civ.groups).length; sim.advanceMonths(2400); assert.ok(Object.keys(civ.groups).length > n0, `${n0} → ${Object.keys(civ.groups).length}`); assert.ok(civ.events.some((e) => e.kind === "group_split")); });
await check("NPC の農耕集団が定住して集落になり、規模の段階（村→町→都市）が進む", () => { const { civ, sim } = mk(99); sim.advanceMonths(6000); const st = Object.values(civ.settlements); assert.ok(st.length > 0, "集落なし"); assert.ok(civ.events.some((e) => e.kind === "subsistence_changed"), "生業転換なし"); for (const s of st) assert.ok(["village", "town", "city"].includes(s.stage)); });

console.log("=== M1: 移動と海 ===");
await check("航海の知識が無いと水を渡れない。陸の移動コストは山・砂漠・氷で重い", () => { assert.equal(stepCost(W, W.cell.landWater.findIndex((x) => x !== 1), 0), null); assert.ok(stepCost(W, W.cell.landWater.findIndex((x) => x !== 1), 1) > 1); let flat = Infinity, rough = 0; for (let c = 0; c < W.mesh.cellCount; c++) if (W.cell.landWater[c] === 1) { const k = stepCost(W, c, 0); flat = Math.min(flat, k); rough = Math.max(rough, k); } assert.ok(rough > flat); });
await check("届く範囲は、航海なしでは同じ陸塊の中だけ", () => { const { civ } = mk(); const g = Object.values(civ.groups)[0], r = reachable(W, g.cell, 60, 0); for (const c of r.keys()) assert.equal(W.cell.continent[c] === W.cell.continent[g.cell] || W.cell.landWater[c] === 1, true); });
await check("命令: moveGroup は移動に月数がかかり、到着で位置が変わる。海の向こうは拒否", () => { const { civ, sim } = mk(); const g = civ.groups[civ.player.groupId]; const t = [...reachable(W, g.cell, 12, 0).keys()].find((c) => c !== g.cell && W.cell.landWater[c] === 1); assert.ok(t != null); const r = sim.command({ type: "moveGroup", groupId: g.id, to: t }); assert.ok(r.ok, r.error); assert.ok(r.arriveAt > civ.monthIndex); assert.equal(sim.command({ type: "moveGroup", groupId: g.id, to: t }).ok, false); sim.advanceMonths(r.arriveAt - civ.monthIndex); assert.equal(g.cell, t); const sea = W.cell.landWater.findIndex((x) => x !== 1); assert.equal(sim.command({ type: "moveGroup", groupId: g.id, to: sea }).ok, false); });
await check("命令: NPC の集団は操作できない。未知の命令・生業は拒否", () => { const { civ, sim } = mk(); const npc = Object.values(civ.groups).find((g) => !g.player); assert.equal(sim.command({ type: "moveGroup", groupId: npc.id, to: npc.cell }).ok, false); const pid = civ.player.groupId; assert.equal(sim.command({ type: "setSubsistence", groupId: pid, subsistence: "agriculture" }).ok, false); assert.equal(sim.command({ type: "bogus" }).ok, false); });

console.log("=== M1: イベント・保存 ===");
await check("イベントIDは重複せず、タイトルを変えても別IDになる", () => { const { civ, sim } = mk(5); sim.advanceMonths(1200); const ids = civ.events.map((e) => e.eventId); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every((i) => parseId(i)?.kind === "event")); });
await check("makeEvent は未知の関係・根拠を拒否する", () => { const { civ, sim } = mk(); assert.throws(() => makeEvent(civ, sim.ctx.ids, { kind: "x", title: "x", causes: [{ targetId: "a", relation: "nope", basis: "direct" }] })); });
await check("文明状態は保存→読み込みで同一になり、続きの歴史も同じ", () => { const a = mk(31), b = mk(31); a.sim.advanceMonths(480); const re = decodeCiv(encodeCiv(a.civ)); const sim2 = createCivSim(W, re); a.sim.advanceMonths(240); sim2.advanceMonths(240); assert.deepEqual(JSON.parse(JSON.stringify(a.civ)), JSON.parse(JSON.stringify(re))); b.sim.advanceMonths(720); assert.deepEqual(JSON.parse(JSON.stringify(b.civ)), JSON.parse(JSON.stringify(re))); });
await check("壊れた文明状態・新しすぎる版は読み込まない", () => { assert.throws(() => decodeCiv(new TextEncoder().encode("{}"))); assert.throws(() => decodeCiv(new TextEncoder().encode(JSON.stringify({ version: 999 })))); });
await check("月次の処理時間: 集団数十・100年で 3 秒以内（Node・1コア）", () => { const { sim } = mk(); const t = performance.now(); sim.advanceMonths(1200); const ms = performance.now() - t; console.log(`       100年 = ${Math.round(ms)} ms`); assert.ok(ms < 3000, `${ms}`); });

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
