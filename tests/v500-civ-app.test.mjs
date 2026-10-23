// v5.0.0 V5-M1 のアプリ統合: 歴史の開始・月送りとの同期・保存/読み込み往復・プレイヤー命令・一覧のページ送り。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { createStore } from "../js/core/store.js";
import { saveMapBytes, loadMapBytes } from "../js/io/ahmap-file.js";
import { createCivActions } from "../js/app/civ-actions.js";
import { createTimeActions } from "../js/app/time-actions.js";
import { monthIndex } from "../js/core/civ/tick.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";

globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const env = (seed = "civ-app", start = true) => {
  const m = worldToMap(generateWorld({ worldSeed: seed, resolution: { targetCells: 5000 } })); m.worldTime = { year: -3000, month: 11 }; m.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
  if (start) { const p = m.world.entities.populations[0]; m.world.entities.start = { groupId: p.id, cell: p.cell, lat: p.lat, lon: p.lon, population: p.size, subsistence: p.subsistence, species: p.species }; }
  const store = createStore({ map: m }); const civActions = createCivActions({ store }); let renders = 0;
  const timeActions = createTimeActions({ store, renderer: { requestRender: () => renders++ }, civActions });
  return { m, store, civActions, timeActions };
};
// time-actions の tick は非公開なので、1か月進める操作は公開API経由（stepMonth があればそれ）か、タイマーで進める
const stepMonths = async (e, n) => { const sp = e.timeActions.getSpeed(); e.timeActions.setSpeedPerYear(2400); e.timeActions.start(); await new Promise((r) => setTimeout(r, 200 * n + 60)); e.timeActions.stop(); return sp; };

console.log("=== 歴史の開始 ===");
await check("初期集団を選ぶまでは始められない。選ぶと始まり、集団は世界の初期集団と同数", () => { const e = env("civ-app", false); assert.equal(e.civActions.canStart(), false); assert.equal(e.civActions.start().ok, false); const e2 = env(); assert.equal(e2.civActions.canStart(), true); assert.ok(e2.civActions.start().ok); assert.equal(e2.civActions.summary().groups, e2.m.world.entities.populations.length); assert.equal(e2.civActions.start().ok, false, "二重開始は拒否"); });
await check("開始時の年月は世界時計から（紀元前でも）", () => { const e = env(); e.civActions.start(); assert.deepEqual(e.m.civ.date, { year: -3000, month: 11 }); });

console.log("=== 月送りとの同期 ===");
await check("時計を進めると、文明も同じ月数だけ進む（世界時計が正）", async () => { const e = env(); e.civActions.start(); const w0 = monthIndex(e.m.worldTime.year, e.m.worldTime.month); await stepMonths(e, 3); const w1 = monthIndex(e.store.getState().map.worldTime.year, e.store.getState().map.worldTime.month); assert.ok(w1 - w0 >= 1, `進んだ月 ${w1 - w0}`); assert.equal(e.m.civ.monthIndex, w1, `文明 ${e.m.civ.monthIndex} と世界 ${w1} が一致`); });
await check("歴史を始めていない世界でも、月送りは壊れない", async () => { const e = env(); const w0 = e.m.worldTime.month; await stepMonths(e, 2); assert.equal(e.m.civ, undefined); assert.notEqual(`${e.store.getState().map.worldTime.year}-${e.store.getState().map.worldTime.month}`, `-3000-${w0}`); });

console.log("=== 保存・読み込み ===");
await check("文明状態は .ahmap に保存され、読み込みで戻り、続きの歴史が同じ", async () => { const e = env(); e.civActions.start(); createCivSim(e.m.world, e.m.civ).advanceMonths(240); const bytes = await saveMapBytes(e.m, { appVersion: "t", savedAt: "x" }); const { map: r, warnings } = await loadMapBytes(bytes); assert.deepEqual(JSON.parse(JSON.stringify(r.civ)), JSON.parse(JSON.stringify(e.m.civ))); assert.ok(!warnings.some((w) => /人口集団/.test(w)), warnings.join("/")); const a = createCivSim(e.m.world, e.m.civ), b = createCivSim(r.world, r.civ); a.advanceMonths(120); b.advanceMonths(120); assert.deepEqual(JSON.parse(JSON.stringify(r.civ)), JSON.parse(JSON.stringify(e.m.civ))); });
await check("歴史を始めていない世界を保存しても、文明チャンクは入らない", async () => { const e = env(); const { map: r } = await loadMapBytes(await saveMapBytes(e.m)); assert.equal(r.civ, undefined); });
await check("文明チャンクが壊れていても、世界は開ける（警告を出す）", async () => { const e = env(); e.civActions.start(); const bytes = await saveMapBytes(e.m); const { encodeAhmap2, decodeAhmap2 } = await import("../js/core/world/ahmap2.js"); const d = await decodeAhmap2(bytes); const ext = Object.fromEntries(d.extensions); ext["civ.state"] = new TextEncoder().encode("{壊れた"); const r0 = await encodeAhmap2(d.world, { extensions: ext }); const { map, warnings } = await loadMapBytes(r0.bytes); assert.equal(map.civ, undefined); assert.ok(warnings.some((w) => /人口集団/.test(w))); });

console.log("=== プレイヤー命令と一覧 ===");
await check("プレイヤーの移住先の候補が出て、移動命令が通る。NPCは操作できない", () => { const e = env(); e.civActions.start(); const o = e.civActions.playerOptions(); assert.ok(o.targets.length > 0); const r = e.civActions.command({ type: "moveGroup", groupId: o.group.id, to: o.targets[0].cell }); assert.ok(r.ok, r.error); const npc = Object.values(e.m.civ.groups).find((g) => !g.player); assert.equal(e.civActions.command({ type: "moveGroup", groupId: npc.id, to: npc.cell }).ok, false); });
await check("一覧は固定サイズ（ページ送り・並び替え・絞り込み）。1万集団でも1ページ分しか作らない", () => { const e = env(); e.civActions.start(); const g0 = Object.values(e.m.civ.groups)[0]; for (let i = 0; i < 10000; i++) { const id = `pop_x${String(i).padStart(5, "0")}`; e.m.civ.groups[id] = { ...g0, id, player: false, pop: 100 + (i % 977), settlementId: null }; } const L = e.civActions.listGroups({ pageSize: 40 }); assert.equal(L.rows.length, 40); assert.ok(L.pages >= 250); assert.ok(L.rows[0].pop >= L.rows[39].pop); assert.equal(e.civActions.listGroups({ query: "x00007" }).total, 1); const last = e.civActions.listGroups({ page: 9999 }); assert.equal(last.page, last.pages - 1); });

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
