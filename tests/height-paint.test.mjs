// 標高の調整（上げる・下げる・ならす）。水域は変わらない。陸は水域にならず、100を超えない。Undoで戻る。
import assert from "node:assert/strict";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { planHeightPaint, HEIGHT_MODES } from "../js/core/edit/paint.js";
let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const h = map.geometry.pack.h, all = [...h.keys()], land = all.filter((i) => h[i] >= 20), water = all.filter((i) => h[i] < 20);
const state = { map }; const snap = () => Uint8Array.from(h);
check("調整の種類は 上げる・下げる・ならす の3つ", () => assert.equal(Object.keys(HEIGHT_MODES).length, 3));
check("上げると陸の標高が増える。水域は変わらない", () => { const a = snap(); const { command, report } = planHeightPaint(map, { mode: 1, cells: all }); command.apply(state); assert.ok(land.some((i) => h[i] > a[i]) && water.every((i) => h[i] === a[i]) && report.skippedWater === water.length); command.revert(state); assert.deepEqual([...h], [...a]); });
check("何度下げても、陸は水域（標高20未満）にならない", () => { for (let k = 0; k < 30; k++) { const { command } = planHeightPaint(map, { mode: 2, cells: land }); command?.apply(state); } assert.ok(land.every((i) => h[i] >= 20)); });
check("何度上げても、標高は100を超えない", () => { for (let k = 0; k < 40; k++) { const { command } = planHeightPaint(map, { mode: 1, cells: land }); command?.apply(state); } assert.ok(land.every((i) => h[i] <= 100)); });
check("ならすと、標高の差が小さくなる", () => { const spread = () => { const v = land.map((i) => h[i]); return Math.max(...v) - Math.min(...v); }; const before = spread(); for (let k = 0; k < 6; k++) { const { command } = planHeightPaint(map, { mode: 3, cells: land }); command?.apply(state); } assert.ok(spread() <= before); });
check("変化が無ければ、コマンドを作らない（水域だけを塗るとき）", () => assert.equal(planHeightPaint(map, { mode: 1, cells: water }).command, null));
check("未知の種類は拒否される", () => assert.throws(() => planHeightPaint(map, { mode: 9, cells: land }), /選んでください/));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
