// v6.13.0: セル形状の CSR 化（型付き配列）。旧形式の再現・遅延ゲッター・描画/境界線/空間索引の読み出し・メモリの上限を検証する。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap, MAP_WIDTH, MAP_HEIGHT } from "../js/core/world-bridge.js";
import { cellCountOf, centerOf, centersOf, hasAlt, ringLength, polygonIds } from "../js/core/geometry-csr.js";
import { buildBoundarySegments } from "../js/render/edges.js";
import { addCellPath, drawTerrain } from "../js/render/layers/terrain.js";
import { drawPolitics } from "../js/render/layers/politics.js";
import { drawRivers } from "../js/render/layers/lines.js";
import { createCellIndex, cellIndexOf } from "../js/core/spatial.js";
import { cellAreas } from "../js/core/cell-areas.js";
import { validateMap } from "../js/core/model.js";
import { buildGeometryReference } from "./helpers/legacy-geometry-ref.mjs";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "v6130-csr", landFraction: 0.4, resolution: { targetCells: 6000 } });
const N = W.mesh.cellCount;
const lazy = (o, k) => !!Object.getOwnPropertyDescriptor(o, k)?.get; // まだ作られていない遅延プロパティか
const fresh = () => worldToMap(W);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("=== CSR は旧実装と同じ内容を再現する ===");
const hArr = (m) => m.geometry.pack.h.slice();
const ref = buildGeometryReference(W.mesh, hArr(fresh()), MAP_WIDTH, MAP_HEIGHT);
check("セル中心 p・多角形 cells.v・隣接 cells.c・極の印 cells.b・継ぎ目の複製 cells.alt が 1 つも違わない", () => {
  const g = fresh().geometry.pack;
  assert.ok(same(g.p, ref.p), "p"); assert.ok(same(g.cells.v, ref.cells.v), "v"); assert.ok(same(g.cells.c, ref.cells.c), "c");
  assert.ok(same(g.cells.b, ref.cells.b), "b"); assert.ok(same(g.cells.alt, ref.cells.alt), "alt");
});
check("頂点の座標 vertices.p（継ぎ目の複製頂点・極の追加点を含む）が 1 つも違わない", () => { assert.ok(same(fresh().geometry.pack.vertices.p, ref.vertices.p)); });
check("頂点の隣接 vertices.v・c は、もとの頂点では旧実装と同じ（順序は問わない）", () => {
  const g = fresh().geometry.pack, n0 = W.mesh.vertexXYZ.length / 3, s = (a) => [...a].sort((x, y) => x - y);
  for (let t = 0; t < n0; t++) { assert.deepEqual(s(g.vertices.v[t]), s(ref.vertices.v[t])); assert.deepEqual(s(g.vertices.c[t]), s(ref.vertices.c[t])); }
});
check("高さ h と、セル数・継ぎ目の複製（alt）の個数が参照と一致", () => { const g = fresh().geometry.pack; assert.deepEqual(g.h, ref.h); assert.equal(cellCountOf(fresh().geometry), N); assert.ok(g.cells.alt.filter(Boolean).length > 0); });

console.log("=== 描画・境界線・空間索引は、旧形式を作らずに読む ===");
const ctx = new Proxy({}, { get: (_, k) => (k === "canvas" ? {} : () => {}), set: () => true });
globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
const vpFar = { k: 1, fitK: 1, proj: null, cullable: () => false, visibleBounds: () => ({ x0: 0, y0: 0, x1: MAP_WIDTH, y1: MAP_HEIGHT }) }, vpNear = { ...vpFar, k: 9, cullable: () => true };
check("地形（遠景・近景）・河川・国家の塗り・境界線・面積・空間索引を通しても、旧形式（p / cells.v・c・alt / vertices.p）は作られない", () => {
  const m = fresh(), pk = m.geometry.pack;
  drawTerrain(ctx, m, vpFar, "biome"); drawTerrain(ctx, m, vpFar, "both"); drawTerrain(ctx, m, vpNear, "height"); drawRivers(ctx, m, vpFar);
  drawPolitics(ctx, m, vpFar, "state"); buildBoundarySegments(m.geometry, m.pack.cells.biome, () => true); cellAreas(m.geometry);
  cellIndexOf(m).find(500, 300); validateMap(m); centerOf(m.geometry, 5); centersOf(m.geometry);
  for (const [o, k] of [[pk, "p"], [pk.cells, "v"], [pk.cells, "c"], [pk.cells, "alt"], [pk.cells, "b"], [pk.vertices, "p"], [pk.vertices, "v"], [pk.vertices, "c"]]) assert.ok(lazy(o, k), `${k} が作られてしまった`);
});
check("旧形式を読むと、そのとき初めて作られ、以後は同じ配列を返す（未移行のコードがそのまま動く）", () => {
  const pk = fresh().geometry.pack; assert.ok(lazy(pk.cells, "c")); const a = pk.cells.c; assert.ok(!lazy(pk.cells, "c")); assert.equal(pk.cells.c, a); assert.equal(a.length, N); assert.deepEqual(a[0], ref.cells.c[0]);
});
check("遅延プロパティは列挙されない（地図の複製・JSON 化で旧形式を作らない）", () => { const pk = fresh().geometry.pack; assert.ok(!Object.keys(pk).includes("p")); assert.ok(!Object.keys(pk.cells).includes("v")); assert.ok(!JSON.stringify(pk.cells).includes("[[")); });
check("境界線の線分は、旧形式の経路と同じ座標・同じ順序", () => {
  const m = fresh(), vals = m.pack.cells.biome, csrSegs = buildBoundarySegments(m.geometry, vals, () => true);
  const legacyGeo = { pack: { cells: { v: ref.cells.v, c: ref.cells.c }, vertices: { p: ref.vertices.p } } }; // csr を持たない旧形式の形
  const oldSegs = buildBoundarySegments(legacyGeo, vals, () => true);
  assert.equal(csrSegs.length, oldSegs.length); assert.ok(csrSegs.length > 400); for (let i = 0; i < oldSegs.length; i++) assert.equal(csrSegs[i], Math.fround(oldSegs[i]), `線分 ${i}`);
});
check("セルの輪郭パスは、旧形式と同じ命令列（moveTo / lineTo の座標と順序）。継ぎ目の複製も含む", () => {
  const m = fresh(), cells = m.geometry.pack.csr, rec = () => { const o = []; return { o, moveTo: (x, y) => o.push(["M", x, y]), lineTo: (x, y) => o.push(["L", x, y]) }; };
  const legacyCells = { v: ref.cells.v, alt: ref.cells.alt }, legacyVerts = { p: ref.vertices.p }, csrCells = m.geometry.pack.cells, csrVerts = m.geometry.pack.vertices;
  for (let i = 0; i < N; i++) { const a = rec(), b = rec(); addCellPath(a, csrCells, csrVerts, i); addCellPath(b, legacyCells, legacyVerts, i); assert.deepEqual(a.o, b.o, `セル ${i}`); }
  assert.ok(cells.altIds.length > 0);
});
check("空間索引は、型付き配列の中心と、旧形式の [x, y] の配列で同じ答えを返す（継ぎ目の折り返しも）", () => {
  const m = fresh(), a = createCellIndex(centersOf(m.geometry), 16, MAP_WIDTH), b = createCellIndex(ref.p, 16, MAP_WIDTH);
  for (const [x, y] of [[10, 10], [2040, 500], [1024, 512], [3, 900], [1500, 20]]) { assert.equal(a.find(x, y), b.find(x, y)); assert.deepEqual(a.findWithin(x, y, 40).sort((p, q) => p - q), b.findWithin(x, y, 40).sort((p, q) => p - q)); }
});
check("補助関数: ringLength・hasAlt・polygonIds・centerOf が CSR と旧形式で同じ値。範囲外の中心は undefined", () => {
  const m = fresh(), cells = m.geometry.pack.cells;
  for (let i = 0; i < N; i += 7) { assert.equal(ringLength(cells, i), ref.cells.v[i].length); assert.equal(hasAlt(cells, i), !!ref.cells.alt[i]); assert.deepEqual([...polygonIds(cells, i)], ref.cells.v[i]); assert.deepEqual(centerOf(m.geometry, i), ref.p[i]); }
  assert.equal(centerOf(m.geometry, -1), undefined); assert.equal(centerOf(m.geometry, N), undefined);
});

console.log("=== メモリ（型付き配列だけで持つ大きさ）===");
check("CSR の合計は、セルあたり 150 バイト未満（旧形式は 1,300 バイト以上）", () => {
  const c = fresh().geometry.pack.csr; let bytes = 0; for (const k of ["cx", "cy", "polyOff", "polyIds", "altOff", "altIds", "border", "vx", "vy"]) bytes += c[k].byteLength;
  assert.ok(bytes / N < 150, `セルあたり ${(bytes / N).toFixed(0)} バイト`); assert.equal(c.nbIds, W.mesh.neighborIds); assert.equal(c.nbOff, W.mesh.neighborOffsets); // 隣接は球面メッシュの表を共有（コピーしない）
});

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
