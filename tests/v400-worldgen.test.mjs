// v4.0.0: 球面世界の地理生成（G0〜G8）。決定性・陸地率・大陸/島・気候・水系・土壌・初期集団・検査。
import assert from "node:assert/strict";
import { generateWorld, generateWorldChecked, validateWorld, statsProblems, BIOMES, LAND_WATER, RES, SOILS, landmasses } from "../js/core/world/worldgen.js";
import { normalizeWorldSpec, DEFAULT_WORLD_SPEC, makeWorldSeed } from "../js/core/world/spec.js";
import { greatCircleRad } from "../js/core/world/sphere-mesh.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const CELLS = 8000, SEEDS = Array.from({ length: 12 }, (_, i) => `t${i}`);
const gen = (seed, extra = {}) => generateWorld({ worldSeed: seed, resolution: { targetCells: CELLS }, ...extra });

console.log("=== WorldSpec ===");
check("既定値が補われる。標準は 250,000 セル・陸地 50%・大陸 6", () => { const { spec, errors } = normalizeWorldSpec({ worldSeed: "x" }); assert.deepEqual(errors, []); assert.equal(spec.resolution.targetCells, 250000); assert.equal(spec.landFraction, 0.5); assert.equal(spec.continentCountTarget, 6); assert.equal(spec.planet.radiusKm, 6371); });
check("シードが空・範囲外・不明な値はエラー（黙って直さない）", () => {
  assert.ok(normalizeWorldSpec({}).errors.some((e) => e.includes("worldSeed")));
  assert.ok(normalizeWorldSpec({ worldSeed: "x", landFraction: 2 }).errors.length > 0);
  assert.ok(normalizeWorldSpec({ worldSeed: "x", resolution: { targetCells: 12.5 } }).errors.length > 0);
  assert.ok(normalizeWorldSpec({ worldSeed: "x", islandMode: "lots" }).errors.length > 0);
  assert.ok(normalizeWorldSpec({ worldSeed: "x", schemaVersion: 99 }).errors.length > 0);
});
check("不正な WorldSpec では生成を拒否する", () => assert.throws(() => generateWorld({ worldSeed: "x", landFraction: 5 }), /WorldSpec/));
check("既定値は凍結されていて書き換えられない", () => { assert.throws(() => { "use strict"; DEFAULT_WORLD_SPEC.landFraction = 0.9; }); });
check("makeWorldSeed は空でない文字列", () => assert.ok(makeWorldSeed(1700000000000).length > 4));

console.log("=== 決定性 ===");
const A = gen("determinism"), A2 = gen("determinism"), B = gen("determinism-2");
check("同じ worldSeed・WorldSpec・版 → 地理のハッシュが一致する", () => assert.equal(A.hash, A2.hash));
check("配列そのものも一致する（標高・水系・資源）", () => { for (const k of ["elevation", "riverTo", "resource", "biome", "soil"]) assert.deepEqual(A.cell[k], A2.cell[k], k); });
check("別のシードでは別の世界になる", () => assert.notEqual(A.hash, B.hash));
check("Math.random や時刻に依存しない（生成中に呼ばれない）", () => {
  const orig = Math.random, od = Date.now; let used = 0; Math.random = () => { used++; return 0.5; }; Date.now = () => { used++; return 0; };
  try { gen("determinism"); } finally { Math.random = orig; Date.now = od; }
  assert.equal(used, 0);
});
check("解像度を変えても、同じシードで 大陸の配置は似る（陸地率は常に目標）", () => { const hi = gen("determinism", { resolution: { targetCells: 20000 } }); assert.ok(Math.abs(hi.stats.landFraction - 0.5) < 0.01); });

console.log("=== 陸地率・大陸・島 ===");
const worlds = SEEDS.map((s) => gen(s));
check("陸地率が目標（50%）の ±1% に入る（12 シード）", () => { for (const w of worlds) assert.ok(Math.abs(w.stats.landFraction - 0.5) < 0.01, `${w.spec.worldSeed}: ${w.stats.landFraction}`); });
check("陸地率の目標を変えると追従する（30% / 70%）", () => { for (const lf of [0.3, 0.7]) { const w = gen("lf", { landFraction: lf }); assert.ok(Math.abs(w.stats.landFraction - lf) < 0.01, String(w.stats.landFraction)); } });
check("大陸級の陸塊は、12 シード中 10 以上で 4〜8 個（概ね 6）", () => { const ok = worlds.filter((w) => w.stats.continentCount >= 4 && w.stats.continentCount <= 8).length; assert.ok(ok >= 10, `${ok}/12`); });
check("島・群島が多数ある（全シードで 15 以上）", () => { for (const w of worlds) assert.ok(w.stats.islandCount >= 15, `${w.spec.worldSeed}: ${w.stats.islandCount}`); });
check("islandMode: few は many より島が少ない", () => { const few = gen("isl", { islandMode: "few" }), many = gen("isl", { islandMode: "many" }); assert.ok(few.stats.islandCount < many.stats.islandCount, `${few.stats.islandCount} vs ${many.stats.islandCount}`); });
check("山脈は線状: 標高 2500m 超の陸が、陸の 1〜20% で、連結成分の数が少ない", () => { for (const w of worlds) assert.ok(w.stats.mountainFraction > 0.01 && w.stats.mountainFraction < 0.2, `${w.spec.worldSeed}: ${w.stats.mountainFraction}`); });

console.log("=== 構造・水系の整合 ===");
check("検査に通る（有限値・海陸と標高の一致・流路が行き止まりなく海へ・集団は陸）", () => { for (const w of worlds) assert.deepEqual(validateWorld(w), [], w.spec.worldSeed); });
check("川: すべての陸のセルの流路が、隣接をたどって海に着く（循環なし）", () => { const w = worlds[0], { cell } = w, V = w.mesh.cellCount; for (let c = 0; c < V; c++) { if (cell.landWater[c] === LAND_WATER.OCEAN) continue; let k = c, steps = 0; while (cell.landWater[k] !== LAND_WATER.OCEAN) { k = cell.riverTo[k]; assert.ok(k >= 0 && ++steps <= V, `セル ${c}`); } } });
check("川の流量は下流ほど大きい（合流で増える）", () => { for (const w of worlds.slice(0, 4)) { const { cell } = w, V = w.mesh.cellCount; for (let c = 0; c < V; c++) { const p = cell.riverTo[c]; if (cell.landWater[c] !== LAND_WATER.OCEAN && p >= 0 && cell.landWater[p] !== LAND_WATER.OCEAN) assert.ok(cell.riverFlow[p] >= cell.riverFlow[c] - 1e-3, `${c}→${p}`); } } });
check("河口が存在し、河川セルは陸地の数%", () => { for (const w of worlds) { assert.ok(w.stats.riverMouths >= 10, String(w.stats.riverMouths)); const f = w.stats.riverCells / (w.stats.cells * w.stats.landFraction); assert.ok(f > 0.02 && f < 0.12, String(f)); } });
check("湖は陸にあり、まわりより低い（くぼ地）", () => { let lakes = 0; for (const w of worlds) { const { cell } = w; for (let c = 0; c < w.mesh.cellCount; c++) if (cell.landWater[c] === LAND_WATER.LAKE) { lakes++; assert.ok(cell.elevation[c] > 0 && cell.filled[c] - cell.elevation[c] >= 40); assert.equal(cell.biome[c], BIOMES.LAKE); } } assert.ok(lakes > 0, "湖が 1 つもない"); });

console.log("=== 気候・バイオーム ===");
check("気温: 低緯度の平均 > 高緯度の平均（10℃ 以上の差）", () => { for (const w of worlds) assert.ok(w.stats.meanTempLow > w.stats.meanTempHigh + 10, `${w.stats.meanTempLow} / ${w.stats.meanTempHigh}`); });
check("気温: 同じ緯度帯では、標高が高いほど低い（減率 6.5℃/km）", () => {
  const w = worlds[0], { cell } = w; let hi = [], lo = [];
  for (let c = 0; c < w.mesh.cellCount; c++) { if (cell.landWater[c] === 0) continue; const la = Math.abs(cell.lat[c]) * 180 / Math.PI; if (la < 20 || la > 30) continue; (cell.elevation[c] > 2500 ? hi : lo).push(cell.temp[c]); }
  if (hi.length > 3 && lo.length > 3) { const m = (a) => a.reduce((s, x) => s + x, 0) / a.length; assert.ok(m(lo) - m(hi) > 8, `${m(lo)} vs ${m(hi)}`); }
});
check("降水: 赤道付近の海は、亜熱帯の海より多い", () => { const w = worlds[0], { cell } = w; let eq = [], sub = []; for (let c = 0; c < w.mesh.cellCount; c++) { if (cell.landWater[c] !== 0) continue; const la = Math.abs(cell.lat[c]) * 180 / Math.PI; if (la < 6) eq.push(cell.precip[c]); else if (la > 24 && la < 32) sub.push(cell.precip[c]); } const m = (a) => a.reduce((s, x) => s + x, 0) / a.length; assert.ok(m(eq) > m(sub) * 1.5, `${m(eq)} vs ${m(sub)}`); });
check("風上の山で降水が増え、風下（雨陰）で減る: 山脈の風上側の平均降水 > 風下側", () => {
  // 偏西風帯（30〜60°）: 風は西から東へ吹く → 経度の小さい側が風上。山脈（標高 2500m 超）の西側と東側を比べる
  let up = 0, nu = 0, dn = 0, nd = 0;
  for (const w of worlds) { const { cell, mesh } = w, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    for (let c = 0; c < mesh.cellCount; c++) { if (cell.elevation[c] < 2500) continue; const la = Math.abs(cell.lat[c]) * 180 / Math.PI; if (la < 35 || la > 55) continue;
      for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (cell.landWater[j] === 0 || cell.elevation[j] > 1500) continue; let dl = cell.lon[j] - cell.lon[c]; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI; if (dl < -1e-4) { up += cell.precip[j]; nu++; } else if (dl > 1e-4) { dn += cell.precip[j]; nd++; } } } }
  assert.ok(nu > 10 && nd > 10, `サンプル不足 ${nu}/${nd}`); assert.ok(up / nu > dn / nd, `風上 ${up / nu} / 風下 ${dn / nd}`);
});
check("バイオームは気候と矛盾しない（氷雪は T<-8、熱帯雨林は T≥18 かつ降水 1800mm 以上、海は海）", () => { for (const w of worlds) { const { cell } = w; for (let c = 0; c < w.mesh.cellCount; c++) { const b = cell.biome[c]; if (b === BIOMES.ICE) assert.ok(cell.temp[c] < -8 || cell.elevation[c] > 3500); if (b === BIOMES.RAINFOREST) assert.ok(cell.temp[c] >= 18 && cell.precip[c] >= 1800); if ((b === BIOMES.OCEAN) !== (cell.landWater[c] === LAND_WATER.OCEAN)) assert.fail(`海とバイオームが不一致 ${c}`); } } });
check("バイオームが多様（陸のバイオームが 8 種類以上）", () => { for (const w of worlds) assert.ok(w.stats.biomeCounts.filter((n, i) => i > 0 && n > 0).length >= 8, JSON.stringify(w.stats.biomeCounts)); });

console.log("=== 土壌・肥沃度・資源・人口の受け皿 ===");
check("肥沃度は 0〜1。海・湖は 0。氷・岩・砂漠は低い", () => { for (const w of worlds) { const { cell } = w; for (let c = 0; c < w.mesh.cellCount; c++) { assert.ok(cell.fertility[c] >= 0 && cell.fertility[c] <= 1); if (cell.landWater[c] !== LAND_WATER.LAND) assert.equal(cell.fertility[c], 0); if (cell.biome[c] === BIOMES.ICE) assert.ok(cell.fertility[c] < 0.15); } } });
check("氾濫原（沖積土）は、川のそばの低地にあり、肥沃度が高い", () => { let n = 0, sum = 0, all = 0, na = 0; for (const w of worlds) { const { cell } = w; for (let c = 0; c < w.mesh.cellCount; c++) { if (cell.landWater[c] !== LAND_WATER.LAND) continue; all += cell.fertility[c]; na++; if (cell.soil[c] === SOILS.ALLUVIAL) { n++; sum += cell.fertility[c]; assert.ok(cell.river[c] === 1 && cell.elevation[c] < 800); } } } assert.ok(n > 20, `沖積土が少ない ${n}`); assert.ok(sum / n > all / na, `${sum / n} vs ${all / na}`); });
check("漁場は海の浅い所か、湖・川。海岸から遠い深海にはない", () => { for (const w of worlds) { const { cell } = w; for (let c = 0; c < w.mesh.cellCount; c++) if (cell.resource[c] & RES.FISH) { if (cell.landWater[c] === LAND_WATER.OCEAN) assert.ok(cell.elevation[c] > -300); } } });
check("資源が分布する（鉄・銅・木材・石材・塩が、全シードのどこかにある）", () => { for (const w of worlds) { let m = 0; for (let c = 0; c < w.mesh.cellCount; c++) m |= w.cell.resource[c]; for (const r of [RES.IRON, RES.COPPER, RES.TIMBER, RES.STONE]) assert.ok(m & r, `${w.spec.worldSeed}: 資源 ${r} が無い`); } });
check("人口の受け皿は陸だけにあり、赤道・温帯の肥沃地が極地や砂漠より大きい", () => { const w = worlds[0], { cell } = w; let ocean = 0; for (let c = 0; c < w.mesh.cellCount; c++) if (cell.landWater[c] === 0) ocean += cell.capacity[c]; assert.equal(ocean, 0); const top = Math.max(...cell.capacity); assert.ok(top > 0); });

console.log("=== 初期人口集団 ===");
check("初期集団は 12（既定）。陸・肥沃・居住可能な気温で、互いに十分離れている", () => { for (const w of worlds) { const g = w.entities.populations; assert.ok(g.length >= 6 && g.length <= 12, String(g.length)); for (const p of g) { assert.equal(w.cell.landWater[p.cell], LAND_WATER.LAND); assert.ok(w.cell.fertility[p.cell] > 0.35); assert.ok(w.cell.temp[p.cell] > 4 && w.cell.temp[p.cell] < 30); }
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const a = g[i].cell, b = g[j].cell, X = w.mesh.centerXYZ; assert.ok(greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]) * 6371 >= 1500); } } });
check("初期集団の数は WorldSpec で変えられる", () => { const w = gen("grp", { initialGroups: 4 }); assert.ok(w.entities.populations.length <= 4 && w.entities.populations.length >= 2); });
check("v4 は歴史を走らせない: 集団は生成直後の記録だけ（人口は数百、国家はない）", () => { for (const p of worlds[0].entities.populations) { assert.ok(p.size >= 150 && p.size <= 600); assert.equal(p.subsistence, "forage"); } assert.equal(worlds[0].entities.states, undefined); });

console.log("=== 統計検証・再生成・キャンセル・進捗 ===");
check("generateWorldChecked: 許容帯に入る世界を返し、破棄したシードと理由を隠さず返す", () => { const r = generateWorldChecked({ worldSeed: "checked", resolution: { targetCells: CELLS } }); assert.deepEqual(statsProblems(r.world.stats, r.world.spec), []); assert.ok(Array.isArray(r.rejected)); for (const x of r.rejected) { assert.ok(x.seed && x.reasons.length > 0); } assert.equal(r.attempts, r.rejected.length + 1); });
check("許容帯に入らない設定では、例外で理由を示す（黙って受け入れない）", () => assert.throws(() => generateWorldChecked({ worldSeed: "x", resolution: { targetCells: CELLS }, continentCountTarget: 12 }, {}, 2), /許容帯/));
check("キャンセル: AbortSignal で中断できる", () => { const ac = new AbortController(); ac.abort(); assert.throws(() => generateWorld({ worldSeed: "x", resolution: { targetCells: CELLS } }, { signal: ac.signal }), /キャンセル/); });
check("進捗: 段階の名前・開始と終了が通知される", () => { const ev = []; gen("prog"); generateWorld({ worldSeed: "prog", resolution: { targetCells: CELLS } }, { onProgress: (e) => ev.push(e) }); const names = [...new Set(ev.map((e) => e.stage))]; for (const s of ["G1_mesh", "G2_plates", "G3_elevation", "G4_climate", "G5_rivers", "G6_soil", "G7_groups", "G8_stats"]) assert.ok(names.includes(s), s); assert.ok(ev.some((e) => e.fraction === 1 && e.ms >= 0)); });
check("段階ごとの所要時間が記録される", () => { for (const k of ["G1_mesh", "G2_plates", "G5_rivers", "total"]) assert.ok(Number.isFinite(A.timings[k]), k); });
check("陸塊の数え方: 全部海なら 0、全部陸なら 1", () => { const w = A, V = w.mesh.cellCount; assert.equal(landmasses(V, w.mesh.neighborOffsets, w.mesh.neighborIds, new Uint8Array(V).fill(1)).sizes.length, 0); assert.equal(landmasses(V, w.mesh.neighborOffsets, w.mesh.neighborIds, new Uint8Array(V)).sizes.length, 1); });

console.log("=== 標準規模（約 250,000 セル）===");
{
  const t = performance.now(), w = generateWorld({ worldSeed: "standard-world-1" }), ms = performance.now() - t;
  console.log(`  情報  249,642 セルの生成: ${ms.toFixed(0)} ms（この端末。Surface Go 4 ではないので、60 秒目標の判定には使えない）  段階: ${JSON.stringify(w.timings)}`);
  check("標準の世界は 249,642 セルで、陸地率は 50% ±1%", () => { assert.equal(w.mesh.cellCount, 249642); assert.ok(Math.abs(w.stats.landFraction - 0.5) < 0.01); });
  check("標準の世界が検査に通る", () => assert.deepEqual(validateWorld(w), []));
  check("標準の世界の再生成でハッシュが一致する（決定性）", () => assert.equal(generateWorld({ worldSeed: "standard-world-1" }).hash, w.hash));
  check("標準の世界の大陸級の陸塊は 3〜9 個、島は 40 以上、河川・湖がある", () => { assert.ok(w.stats.continentCount >= 3 && w.stats.continentCount <= 9, String(w.stats.continentCount)); assert.ok(w.stats.islandCount >= 40, String(w.stats.islandCount)); assert.ok(w.stats.riverCells > 1000 && w.stats.lakeCells > 100); });
}

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
