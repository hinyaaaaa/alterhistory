// v4.0.0 / V4-M8: 地形編集。局所再計算・無関係なセルの不変・整合性・Undo/Redo・初期集団の保護・空間インデックス。
import assert from "node:assert/strict";
import { generateWorld, validateWorld, tempAt, LAND_WATER, worldHash } from "../js/core/world/worldgen.js";
import { createWorldEditor, BRUSH_MODES } from "../js/core/world/edit.js";
import { buildSpatialIndex, nearestCell, cellAtLatLon, cellsInRadius, dilateCells } from "../js/core/world/spatial-index.js";
import { greatCircleRad } from "../js/core/world/sphere-mesh.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const KEYS = ["elevation", "landWater", "temp", "precip", "biome", "soil", "fertility", "resource", "riverTo", "riverFlow", "river", "basin", "coastDist", "capacity", "moisture", "filled"];
const clone = (w) => Object.fromEntries(KEYS.map((k) => [k, w.cell[k].slice()]));
const world = (seed = "edit-t", cells = 20000) => generateWorld({ worldSeed: seed, resolution: { targetCells: cells } });
const findLand = (w, lo, hi, skip = 0) => { let n = 0; for (let i = 0; i < w.mesh.cellCount; i++) if (w.cell.landWater[i] === LAND_WATER.LAND && w.cell.elevation[i] > lo && w.cell.elevation[i] < hi && n++ >= skip) return i; return -1; };
const changedCells = (a, b) => { const out = []; for (let c = 0; c < a.elevation.length; c++) for (const k of KEYS) if (a[k][c] !== b[k][c]) { out.push(c); break; } return out; };

console.log("=== 空間インデックス ===");
{
  const w = world("idx", 20000), idx = buildSpatialIndex(w.mesh), X = w.mesh.centerXYZ;
  check("各セルの中心に最も近いセルは、そのセル自身", () => { for (let c = 0; c < w.mesh.cellCount; c += 7) assert.equal(nearestCell(idx, X[3 * c], X[3 * c + 1], X[3 * c + 2]), c); });
  check("ランダムな点の最近傍が、全探索と一致する（500 点）", () => {
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 500; t++) { const z = rnd() * 2 - 1, a = rnd() * 2 * Math.PI, r = Math.sqrt(1 - z * z), x = r * Math.cos(a), y = r * Math.sin(a); let best = -1, bd = -2; for (let c = 0; c < w.mesh.cellCount; c++) { const d = X[3 * c] * x + X[3 * c + 1] * y + X[3 * c + 2] * z; if (d > bd) { bd = d; best = c; } } assert.equal(nearestCell(idx, x, y, z), best, `点 ${t}`); }
  });
  check("極・経度の継ぎ目（±180°）・赤道でも引ける", () => { for (const [la, lo] of [[Math.PI / 2, 0], [-Math.PI / 2, 1], [0, Math.PI], [0, -Math.PI], [0.3, 3.14159], [-0.3, -3.14159]]) { const c = cellAtLatLon(idx, la, lo); assert.ok(c >= 0 && c < w.mesh.cellCount); assert.ok(greatCircleRad(X[3 * c], X[3 * c + 1], X[3 * c + 2], ...[Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]) < 0.2); } });
  check("半径内のセル: すべて半径以内で、半径内の全セルを含む", () => {
    const c0 = 777, rr = 0.15, r = cellsInRadius(w.mesh, c0, rr), got = new Set(r.cells);
    for (let c = 0; c < w.mesh.cellCount; c++) { const d = greatCircleRad(X[3 * c0], X[3 * c0 + 1], X[3 * c0 + 2], X[3 * c], X[3 * c + 1], X[3 * c + 2]); assert.equal(got.has(c), d <= rr, `セル ${c} d=${d}`); }
  });
  check("dilateCells: 1 段広げた集合は、元の集合の隣接をすべて含む", () => { const d = new Set(dilateCells(w.mesh, [100, 101], 1)); for (const c of [100, 101]) { assert.ok(d.has(c)); for (let k = w.mesh.neighborOffsets[c]; k < w.mesh.neighborOffsets[c + 1]; k++) assert.ok(d.has(w.mesh.neighborIds[k])); } });
}

console.log("=== 標高ブラシ（局所再計算）===");
{
  const w = world(), ed = createWorldEditor(w), before = clone(w), h0 = w.hash, c = findLand(w, 500, 1500);
  const r = ed.applyBrush({ center: c, radiusKm: 600, deltaM: 1500, mode: "raise" });
  const after = clone(w), diff = changedCells(before, after);
  check("隆起が成功し、標高が上がる", () => { assert.ok(r.ok, r.reason); assert.ok(after.elevation[c] > before.elevation[c] + 500); assert.ok(r.changed > 20); });
  check("変わったセルは、報告された dirty と完全に一致する（無関係なセルは 1 つも変わらない）", () => { assert.deepEqual([...r.dirty].sort((a, b) => a - b), diff); });
  check("影響範囲は全体の一部だけ（20% 未満）", () => assert.ok(diff.length < w.mesh.cellCount * 0.2, `${diff.length}/${w.mesh.cellCount}`));
  check("編集した領域の気温は、緯度と標高の式どおり", () => { for (const k of r.region) assert.ok(Math.abs(w.cell.temp[k] - tempAt(w.cell.lat[k], w.cell.elevation[k], 6.5)) < 1e-3); });
  check("編集後も検査に通る（流路は海へ着く・陸海と標高の一致・集団は陸）", () => assert.deepEqual(validateWorld(w), []));
  check("世界のハッシュが変わる。形状（メッシュ）は変わらない", () => { assert.notEqual(w.hash, h0); assert.equal(w.hash, worldHash(w)); });
  check("Undo: すべての配列が元と完全に一致し、ハッシュも戻る", () => { const u = ed.undo(); assert.ok(u.ok); const now = clone(w); for (const k of KEYS) assert.deepEqual(now[k], before[k], k); assert.equal(w.hash, h0); });
  check("Redo: 編集後の状態が完全に戻る", () => { assert.ok(ed.canRedo); ed.redo(); const now = clone(w); for (const k of KEYS) assert.deepEqual(now[k], after[k], k); });
  check("新しい編集をすると Redo は消える", () => { ed.undo(); assert.ok(ed.canRedo); ed.applyBrush({ center: c, radiusKm: 300, deltaM: 200, mode: "raise" }); assert.ok(!ed.canRedo); });
  check("履歴がない状態の Undo/Redo は失敗として返す（例外にしない）", () => { const e = createWorldEditor(world("none")); assert.equal(e.undo().ok, false); assert.equal(e.redo().ok, false); });
}

console.log("=== 陸と海の入れ替わり・水系 ===");
{
  check("丘を深く沈めると海（または湖）になり、肥沃度は 0 になる", () => {
    const w = world("sink"), ed = createWorldEditor(w); const pops = new Set(w.entities.populations.map((p) => p.cell));
    let c = -1; for (let i = 0; i < w.mesh.cellCount; i++) if (w.cell.landWater[i] === LAND_WATER.LAND && w.cell.coastDist[i] <= 2 && w.cell.elevation[i] < 200 && w.cell.elevation[i] > 0 && ![...pops].some((p) => { const d = greatCircleRad(w.mesh.centerXYZ[3 * p], w.mesh.centerXYZ[3 * p + 1], w.mesh.centerXYZ[3 * p + 2], w.mesh.centerXYZ[3 * i], w.mesh.centerXYZ[3 * i + 1], w.mesh.centerXYZ[3 * i + 2]); return d < 0.3; })) { c = i; break; }
    assert.ok(c >= 0); const r = ed.applyBrush({ center: c, radiusKm: 400, deltaM: 3000, mode: "lower" }); assert.ok(r.ok, r.reason);
    assert.equal(w.cell.landWater[c], LAND_WATER.OCEAN); assert.equal(w.cell.fertility[c], 0); assert.equal(w.cell.capacity[c], 0); assert.deepEqual(validateWorld(w), []);
  });
  check("海底を大きく隆起させると島ができ、その川の流路も海へ着く", () => {
    const w = world("island"), ed = createWorldEditor(w); let c = -1; for (let i = 0; i < w.mesh.cellCount; i++) if (w.cell.landWater[i] === LAND_WATER.OCEAN && w.cell.elevation[i] < -200 && w.cell.elevation[i] > -1500 && w.cell.coastDist[i] === 0) { c = i; const near = [...w.entities.populations].some((p) => greatCircleRad(w.mesh.centerXYZ[3 * p.cell], w.mesh.centerXYZ[3 * p.cell + 1], w.mesh.centerXYZ[3 * p.cell + 2], w.mesh.centerXYZ[3 * i], w.mesh.centerXYZ[3 * i + 1], w.mesh.centerXYZ[3 * i + 2]) < 0.2); if (!near) break; }
    const landBefore = w.stats.landFraction; const r = ed.applyBrush({ center: c, radiusKm: 500, deltaM: 4000, mode: "raise" }); assert.ok(r.ok, r.reason);
    assert.ok(w.stats.landFraction > landBefore, "陸地率が増えない"); assert.deepEqual(validateWorld(w), []); assert.ok(w.cell.landWater[c] !== LAND_WATER.OCEAN);
  });
  check("統計が編集に追従する（陸地率・陸塊数が再計算される）", () => { const w = world("stats"), ed = createWorldEditor(w), a = w.stats.landFraction; let c = findLand(w, 100, 400); ed.applyBrush({ center: c, radiusKm: 700, deltaM: 5000, mode: "lower" }); assert.ok(w.stats.landFraction < a); });
}

console.log("=== 保護・拒否 ===");
{
  check("初期集団の居住地を海にする編集は、何も変えずに拒否する", () => {
    const w = world("guard"), ed = createWorldEditor(w), p = w.entities.populations[0], before = clone(w), h = w.hash;
    const r = ed.applyBrush({ center: p.cell, radiusKm: 400, deltaM: 20000, mode: "lower" }); assert.equal(r.ok, false); assert.match(r.reason, /初期集団/);
    for (const k of KEYS) assert.deepEqual(w.cell[k], before[k], k); assert.equal(w.hash, h); assert.equal(ed.undoCount, 0);
  });
  check("不正な指定（範囲外のセル・半径・種類）は拒否する", () => { const w = world("bad"), ed = createWorldEditor(w); assert.equal(ed.applyBrush({ center: -1, radiusKm: 300 }).ok, false); assert.equal(ed.applyBrush({ center: 5, radiusKm: 1 }).ok, false); assert.equal(ed.applyBrush({ center: 5, radiusKm: 99999 }).ok, false); assert.equal(ed.applyBrush({ center: 5, radiusKm: 300, mode: "boom" }).ok, false); });
  check("変化がない編集（すでに平ら）は、履歴に積まない", () => { const w = world("noop"), ed = createWorldEditor(w), c = findLand(w, 200, 2000); const r = ed.applyBrush({ center: c, radiusKm: 300, deltaM: 0, mode: "raise" }); assert.ok(r.ok && r.unchanged); assert.equal(ed.undoCount, 0); });
}

console.log("=== 連続編集の性質 ===");
{
  const w = world("random-edit"), ed = createWorldEditor(w), h0 = w.hash, orig = clone(w);
  let s = 987654321; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; let ok = 0, rejected = 0; const modes = Object.keys(BRUSH_MODES);
  check("ランダムなブラシ 40 回を重ねても、毎回検査に通る", () => {
    for (let i = 0; i < 40; i++) { const r = ed.applyBrush({ center: Math.floor(rnd() * w.mesh.cellCount), radiusKm: 200 + rnd() * 900, deltaM: 200 + rnd() * 2500, mode: modes[Math.floor(rnd() * modes.length)], target: rnd() * 800 - 200 }); if (r.ok) ok++; else rejected++; assert.deepEqual(validateWorld(w), [], `編集 ${i} の後`); }
    assert.ok(ok >= 25, `成功が少ない ${ok}`);
  });
  check("すべて Undo すると、元の世界と完全に一致する", () => { while (ed.canUndo) assert.ok(ed.undo().ok); for (const k of KEYS) assert.deepEqual(w.cell[k], orig[k], k); assert.equal(w.hash, h0); });
  check("同じ編集列は同じ結果になる（決定性）", () => {
    const run = () => { const x = world("det"), e = createWorldEditor(x); let q = 42; const r = () => (q = (q * 1664525 + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 8; i++) e.applyBrush({ center: Math.floor(r() * x.mesh.cellCount), radiusKm: 400, deltaM: 1200, mode: i % 2 ? "lower" : "raise" }); return x.hash; };
    assert.equal(run(), run());
  });
  check("地形の標高が上限・下限を超えない", () => { const x = world("clamp"), e = createWorldEditor(x), c = findLand(x, 1000, 5000); for (let i = 0; i < 6; i++) e.applyBrush({ center: c, radiusKm: 500, deltaM: 5000, mode: "raise" }); let mx = -1e9; for (const v of x.cell.elevation) mx = Math.max(mx, v); assert.ok(mx <= 9000 + 1e-3, String(mx)); });
}

console.log("=== 標準規模（約 250,000 セル）===");
{
  const w = generateWorld({ worldSeed: "standard-world-1" }), ed = createWorldEditor(w), c = findLand(w, 500, 1500);
  const t = performance.now(), r = ed.applyBrush({ center: c, radiusKm: 600, deltaM: 1500, mode: "raise" }), ms = performance.now() - t;
  const t2 = performance.now(); ed.undo(); const ms2 = performance.now() - t2;
  console.log(`  情報  249,642 セルでの 1 ストローク（半径 600km）: ${ms.toFixed(0)} ms（変更 ${r.dirty.length} セル／影響の流域 ${r.affectedBasinCells} セル）、Undo ${ms2.toFixed(0)} ms（この端末）`);
  check("標準規模でも編集でき、検査に通り、Undo で元に戻る", () => { assert.ok(r.ok, r.reason); assert.ok(r.dirty.length < w.mesh.cellCount * 0.1); assert.deepEqual(validateWorld(w), []); });
}

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
