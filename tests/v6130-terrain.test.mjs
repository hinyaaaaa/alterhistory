// v6.13.0: 地形の細部（勾配ノイズ・尾根ノイズ・山脈の平滑化・内陸への傾斜・河川侵食・地球の高度分布）。
//   大陸の計画・海陸比・海岸線の大枠は変えないこと、古い generatorVersion は従来と同じ結果で再現できることを確かめる。
import assert from "node:assert/strict";
import { gradNoise3, gfbm3, ridged3, fbm3 } from "../js/core/world/noise.js";
import { generateWorld, erodeRivers, blurField, hypsoAt, versionAtLeast, validateWorld, statsProblems, landmasses } from "../js/core/world/worldgen.js";
import { GENERATOR_VERSION } from "../js/core/world/spec.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const gen = (seed, extra = {}, n = 12000) => generateWorld({ worldSeed: seed, resolution: { targetCells: n }, ...extra });

console.log("=== ノイズ ===");
check("勾配ノイズ: 同じ入力は同じ値・平均が 0 付近・範囲はおおよそ ±1", () => {
  let sum = 0, mn = 9, mx = -9; const N = 20000;
  for (let i = 0; i < N; i++) { const x = (i * 0.37) % 41, y = (i * 0.91) % 37, z = (i * 0.53) % 29, v = gradNoise3(5, x, y, z); assert.equal(v, gradNoise3(5, x, y, z)); sum += v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  assert.ok(Math.abs(sum / N) < 0.03, `平均 ${sum / N}`); assert.ok(mn > -1.05 && mx < 1.05 && mn < -0.5 && mx > 0.5, `範囲 ${mn}〜${mx}`);
});
check("gfbm3 は fbm3 と同じ 0〜1（0.5 中心）で、標準偏差が近い（差し替えても海岸の乱れ方が変わらない）", () => {
  const sd = (f) => { let a = 0, b = 0; const N = 20000; for (let i = 0; i < N; i++) { const v = f((i * 0.37) % 41 + 0.1, (i * 0.91) % 37 + 0.2, (i * 0.53) % 29 + 0.3); assert.ok(v >= 0 && v <= 1); a += v; b += v * v; } const m = a / N; return { m, s: Math.sqrt(b / N - m * m) }; };
  const g = sd((x, y, z) => gfbm3(3, x, y, z, 4, 1)), f = sd((x, y, z) => fbm3(3, x, y, z, 4, 1));
  assert.ok(Math.abs(g.m - 0.5) < 0.03 && Math.abs(f.m - 0.5) < 0.03); assert.ok(Math.abs(g.s - f.s) / f.s < 0.2, `${g.s} vs ${f.s}`);
});
check("尾根ノイズは 0〜1 に収まり、決定的", () => { for (let i = 0; i < 3000; i++) { const x = i * 0.13, y = i * 0.29 % 17, z = i * 0.07 % 11, v = ridged3(9, x, y, z); assert.ok(v >= 0 && v <= 1); assert.equal(v, ridged3(9, x, y, z)); } });
check("versionAtLeast: 6.13.0 以上かどうかを数値で比べる（6.9.0 < 6.13.0）", () => { assert.ok(versionAtLeast("6.13.0", "6.13.0")); assert.ok(versionAtLeast("6.14.1", "6.13.0")); assert.ok(versionAtLeast("7.0.0", "6.13.0")); assert.ok(!versionAtLeast("6.12.9", "6.13.0")); assert.ok(!versionAtLeast("6.9.0", "6.13.0")); assert.ok(GENERATOR_VERSION === "6.13.0"); });
check("blurField: 平滑化すると隣との差が減り、合計はほぼ保たれる", () => {
  const w = gen("blur", {}, 3000), V = w.mesh.cellCount, f = new Float32Array(V); for (let c = 0; c < V; c++) f[c] = (c * 7919) % 13;
  const rough = (a) => { let s = 0, n = 0; for (let c = 0; c < V; c++) for (let k = w.mesh.neighborOffsets[c]; k < w.mesh.neighborOffsets[c + 1]; k++) { s += Math.abs(a[c] - a[w.mesh.neighborIds[k]]); n++; } return s / n; };
  const before = rough(f), sum0 = f.reduce((a, b) => a + b); blurField(f, w.mesh.neighborOffsets, w.mesh.neighborIds, 2, 0.5); assert.ok(rough(f) < before * 0.7); assert.ok(Math.abs(f.reduce((a, b) => a + b) - sum0) / sum0 < 0.05);
});

console.log("=== 河川侵食 ===");
const W = gen("erode-1", {}, 20000), V = W.mesh.cellCount;
check("侵食は陸の高さを下げるだけで、海のセルは動かさず、陸は 1 m 以上を保つ（海陸の形が変わらない）", () => {
  const e0 = Float32Array.from(W.cell.elevation), e = Float32Array.from(e0), r = erodeRivers(W.mesh, e, W.cell.areaKm2, { iterations: 6, kf: 0.2 });
  let lowered = 0; for (let c = 0; c < V; c++) { if (e0[c] <= 0) assert.equal(e[c], e0[c]); else { assert.ok(e[c] >= 1 && e[c] <= e0[c] + 1e-3, `セル ${c}: ${e0[c]} → ${e[c]}`); if (e[c] < e0[c] - 0.01) lowered++; } }
  assert.ok(lowered > 100 && r.total > 0 && r.maxDrop > 0);
});
check("侵食は決定的で、反復するほど（強いほど）下げ幅が増える", () => {
  const run = (it, kf) => { const e = Float32Array.from(W.cell.elevation); return erodeRivers(W.mesh, e, W.cell.areaKm2, { iterations: it, kf }).total; };
  assert.equal(run(4, 0.1), run(4, 0.1)); assert.ok(run(8, 0.1) > run(2, 0.1)); assert.ok(run(4, 0.3) > run(4, 0.05));
});
check("流量の大きい（本流の）セルほど、隣より深く削られる＝谷になる", () => {
  const e = Float32Array.from(W.cell.elevation), e0 = Float32Array.from(e); erodeRivers(W.mesh, e, W.cell.areaKm2, { iterations: 6, kf: 0.2 });
  const flow = W.cell.riverFlow, land = []; for (let c = 0; c < V; c++) if (e0[c] > 0) land.push(c); land.sort((a, b) => flow[b] - flow[a]);
  const top = land.slice(0, Math.floor(land.length * 0.05)), bottom = land.slice(Math.floor(land.length * 0.7));
  const mean = (list) => list.reduce((s, c) => s + (e0[c] - e[c]) / Math.max(30, e0[c]), 0) / list.length;
  assert.ok(mean(top) > mean(bottom) * 1.5, `${mean(top)} vs ${mean(bottom)}`);
});

console.log("=== 世界全体（v6.13.0）===");
const seeds = ["t-1", "t-2", "t-3"];
check("検証（流路が必ず海へ着く・数値が有限・海陸と標高が一致）と統計の許容帯に、いくつかのシードで通る", () => { for (const sd of seeds) { const w = gen(sd, {}, 20000); assert.deepEqual(validateWorld(w), [], sd); assert.deepEqual(statsProblems(w.stats, w.spec), [], sd); } });
check("陸地率は目標どおり（侵食・傾斜は陸の範囲を変えない）", () => { for (const sd of seeds) { const w = gen(sd, {}, 20000); assert.ok(Math.abs(w.stats.landFraction - w.spec.landFraction) < 0.005, `${sd}: ${w.stats.landFraction}`); } });
check("高さの分布が地球に近い: 陸の中央値 250〜550 m・上位 10% が 1,200〜3,000 m・最高峰 3,500 m 超（山脈がある）", () => {
  for (const sd of seeds) { const w = gen(sd, {}, 20000), el = []; for (let c = 0; c < w.mesh.cellCount; c++) if (w.cell.elevation[c] > 0) el.push(w.cell.elevation[c]); el.sort((a, b) => a - b);
    const med = el[el.length >> 1], p90 = el[Math.floor(el.length * 0.9)], top = el[el.length - 1]; assert.ok(med > 250 && med < 550, `${sd} 中央値 ${med}`); assert.ok(p90 > 1200 && p90 < 3000, `${sd} p90 ${p90}`); assert.ok(top > 3500 && top < 7600, `${sd} 最高 ${top}`); }
});
check("hypsoAt は単調増加で、端は 6〜6800 m", () => { let prev = -1; for (let i = 0; i <= 100; i++) { const v = hypsoAt(i / 100); assert.ok(v >= prev); prev = v; } assert.equal(hypsoAt(0), 6); assert.equal(hypsoAt(1), 6800); });
check("同じシードなら同じ世界（決定的）で、古い generatorVersion では別の世界になる（新旧が混ざらない）", () => {
  const a = gen("det-1", {}, 8000), b = gen("det-1", {}, 8000), old = gen("det-1", { generatorVersion: "6.12.0" }, 8000);
  assert.equal(a.hash, b.hash); assert.notEqual(a.hash, old.hash); assert.equal(a.spec.generatorVersion, "6.13.0"); assert.equal(old.spec.generatorVersion, "6.12.0");
  assert.equal(old.timings.G3_erode, undefined); assert.ok(a.timings.G3_erode >= 0);
});
check("大枠は新旧でほぼ同じ: 大陸級の陸塊の数の差が 1 以内、陸地率は同じ", () => {
  for (const sd of seeds) { const a = gen(sd, {}, 20000), o = gen(sd, { generatorVersion: "6.12.0" }, 20000); assert.ok(Math.abs(a.stats.continentCount - o.stats.continentCount) <= 1, `${sd}: ${a.stats.continentCount} vs ${o.stats.continentCount}`); assert.ok(Math.abs(a.stats.landFraction - o.stats.landFraction) < 0.005); }
});
check("人工的な丸い窪地の湖が減る（内陸への傾斜と侵食で、閉じた窪地が少なくなる）", () => { let nl = 0, ol = 0; for (const sd of seeds) { nl += gen(sd, {}, 20000).stats.lakeCells; ol += gen(sd, { generatorVersion: "6.12.0" }, 20000).stats.lakeCells; } assert.ok(nl < ol, `${nl} vs ${ol}`); });

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
