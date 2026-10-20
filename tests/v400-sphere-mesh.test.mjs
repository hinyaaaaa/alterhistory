// v4.0.0 / V4-M0: 球面メッシュ。構造の健全性・決定性・面積・経度の継ぎ目・極・投影の往復。
import assert from "node:assert/strict";
import * as M from "../js/core/world/sphere-mesh.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };

console.log("=== 球面メッシュ（周波数の関係）===");
check("セル数 = 10n²+2。n=158 で 249,642", () => { assert.equal(M.cellCountForFrequency(158), 249642); assert.equal(M.cellCountForFrequency(1), 12); });
check("目標 250,000 に最も近い周波数は 158", () => assert.equal(M.frequencyForCells(250000), 158));

for (const n of [1, 2, 3, 7, 24]) {
  console.log(`=== 周波数 ${n}（${M.cellCountForFrequency(n)} セル）===`);
  const m = M.buildSphereMesh(n);
  check("構造の検査に通る（隣接の対称・五角形は 12 個）", () => assert.deepEqual(M.validateSphereMesh(m), []));
  check("セル中心は単位ベクトル", () => { for (let c = 0; c < m.cellCount; c++) { const l = Math.hypot(m.centerXYZ[3 * c], m.centerXYZ[3 * c + 1], m.centerXYZ[3 * c + 2]); assert.ok(Math.abs(l - 1) < 1e-6, `セル ${c}: ${l}`); } });
  check("全セルの面積の和が球の表面積（4π）に一致する", () => { let a = 0; for (let c = 0; c < m.cellCount; c++) a += M.cellArea(m, c); assert.ok(Math.abs(a / (4 * Math.PI) - 1) < 1e-5, String(a / (4 * Math.PI))); });
  check("同じ n で作り直すとハッシュが一致する（決定性）", () => assert.equal(M.meshHash(M.buildSphereMesh(n)), M.meshHash(m)));
  check("隣接は反時計回り: 隣り合う隣接どうしも互いに隣接する", () => {
    const off = m.neighborOffsets, nb = m.neighborIds, has = (a, b) => { for (let k = off[a]; k < off[a + 1]; k++) if (nb[k] === b) return true; return false; };
    for (let u = 0; u < m.cellCount; u++) { const s = off[u], d = off[u + 1] - s; if (n === 1 && d === 5) { /* 12 面体の小さなメッシュでも成り立つ */ } for (let k = 0; k < d; k++) assert.ok(has(nb[s + k], nb[s + (k + 1) % d]), `セル ${u}`); }
  });
}

console.log("=== 経度の継ぎ目・極 ===");
{
  const m = M.buildSphereMesh(24);
  check("極を囲むセルは、ちょうど 2 つ（北極・南極）", () => { let k = 0, s = 0; for (let c = 0; c < m.cellCount; c++) { const p = M.cellViewPolygon(m, c); if (p.wrapsPole) { k++; s += p.poleSign; } } assert.equal(k, 2); assert.equal(s, 0); });
  check("継ぎ目をまたぐセルも、境界が連続（隣り合う頂点の経度差が π 未満）で、極のセル以外は一周しない", () => {
    let crossing = 0;
    for (let c = 0; c < m.cellCount; c++) {
      const p = M.cellViewPolygon(m, c); if (p.wrapsPole) continue;
      assert.ok(Math.abs(p.turn) < 1e-6, `セル ${c} が一周している: ${p.turn}`);
      for (let k = 0; k < p.lon.length; k++) assert.ok(Math.abs(p.lon[(k + 1) % p.lon.length] - p.lon[k]) < Math.PI, `セル ${c} に長い誤線`);
      let lo = 1e9, hi = -1e9; for (const v of p.lon) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (lo < -Math.PI || hi > Math.PI) crossing++;
    }
    assert.ok(crossing > 0, "継ぎ目をまたぐセルが見つからない（検査の対象外になっている）");
  });
  check("極に近いセルの面積が、赤道付近と極端には違わない（最大/最小 < 3）", () => { let mn = 9, mx = 0; for (let c = 0; c < m.cellCount; c++) { const a = M.cellArea(m, c); mn = Math.min(mn, a); mx = Math.max(mx, a); } assert.ok(mx / mn < 3, String(mx / mn)); });
}

console.log("=== 投影と距離 ===");
check("投影の往復（球面→矩形→球面）で元の点に戻る", () => {
  for (const [lat, lon] of [[0, 0], [0.5, 2], [-1.2, -3], [1.5, 3.1]]) { const [x, y, z] = M.latLonToXYZ(lat, lon), { u, v } = M.projectSphereToView(x, y, z), q = M.unprojectViewToSphere(u, v); assert.ok(Math.hypot(q[0] - x, q[1] - y, q[2] - z) < 1e-9); }
});
check("大円距離: 赤道上の経度 90° は π/2 ラジアン。地球半径なら約 10,007 km", () => {
  const r = M.greatCircleRad(1, 0, 0, 0, 1, 0); assert.ok(Math.abs(r - Math.PI / 2) < 1e-12); assert.ok(Math.abs(M.greatCircleKm(r) - 10007.5) < 1);
});
check("距離は投影上の平面距離ではない: 高緯度で経度差が同じでも、赤道より大円距離が短い", () => {
  const a = M.latLonToXYZ(0, 0), b = M.latLonToXYZ(0, 1), c = M.latLonToXYZ(1.3, 0), d = M.latLonToXYZ(1.3, 1);
  assert.ok(M.greatCircleRad(...c, ...d) < M.greatCircleRad(...a, ...b) * 0.5);
});
check("不正な周波数は拒否する", () => { assert.throws(() => M.buildSphereMesh(0)); assert.throws(() => M.buildSphereMesh(1.5)); });

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
