// v6.11.0: 大陸の生成（配置パターン 4 種・不均等な大きさ・左右端は海・極域の抑制・島の多さ）と、国号の時代の区別。
import assert from "node:assert/strict";
import { generateWorld, generateWorldChecked, validateWorld, statsProblems, landmasses } from "../js/core/world/worldgen.js";
import { LAYOUTS, polarDamp } from "../js/core/world/continents.js";
import { normalizeWorldSpec } from "../js/core/world/spec.js";
import { stateForm, composeStateName } from "../js/core/wcde/domains/naming.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const CELLS = 8000, SEEDS = ["k0", "k1", "k2", "k3", "k4", "k5"];
const gen = (seed, extra = {}) => generateWorldChecked({ worldSeed: seed, resolution: { targetCells: CELLS }, ...extra }, {}, 6).world;
const byLayout = Object.fromEntries(Object.keys(LAYOUTS).map((l) => [l, SEEDS.map((s) => gen(s, { layout: l }))]));

check("配置パターンは 4 種で、標準は不均等分散型。不正な値は検証で止まる", () => {
  assert.deepEqual(Object.keys(LAYOUTS), ["uneven", "cluster", "super", "split"]);
  assert.equal(normalizeWorldSpec({ worldSeed: "x" }).spec.layout, "uneven");
  assert.ok(normalizeWorldSpec({ worldSeed: "x", layout: "ring" }).errors.length > 0);
});
check("4 種のどの配置でも、整合の検査に通り、陸地率は目標どおり", () => {
  for (const [l, ws] of Object.entries(byLayout)) for (const w of ws) { assert.deepEqual(validateWorld(w), [], `${l}/${w.spec.worldSeed}`); assert.ok(Math.abs(w.stats.landFraction - 0.36) < 0.01, `${l}: ${w.stats.landFraction}`); assert.equal(w.spec.layout, l); }
});
check("地図の左右端（経度 ±180°）に大陸は映らない（両側 5° の陸は 2% 未満）", () => {
  for (const [l, ws] of Object.entries(byLayout)) for (const w of ws) assert.ok(w.stats.seamLandFraction < 0.02, `${l}/${w.spec.worldSeed}: ${w.stats.seamLandFraction}`);
});
check("大陸の大きさは不均等（最大 ÷ 最小 が 1.5 以上の世界が、不均等分散型の過半）", () => {
  let n = 0; for (const w of byLayout.uneven) { const s = w.stats.continentShares; if (s.length >= 2 && s[0] / s[s.length - 1] >= 1.5) n++; } assert.ok(n > byLayout.uneven.length / 2, `${n}/${byLayout.uneven.length}`);
});
check("超大陸型: 最大の陸塊が陸の 35% 以上。群島・分裂型は 55% 以下", () => {
  for (const w of byLayout.super) assert.ok(w.stats.continentShares[0] >= 0.35 && w.stats.continentShares[0] <= 0.75, String(w.stats.continentShares[0]));
  for (const l of ["cluster", "split", "uneven"]) for (const w of byLayout[l]) assert.ok(w.stats.continentShares[0] <= 0.55, `${l}: ${w.stats.continentShares[0]}`);
});
check("大陸の数は、目標 6 の前後（不均等 4〜9、ほかは 3〜9）", () => {
  for (const [l, ws] of Object.entries(byLayout)) for (const w of ws) { const n = w.stats.continentCount; assert.ok(n >= (l === "uneven" ? 4 : 3) && n <= 9, `${l}: ${n}`); }
});
check("極域: 最大の陸塊が緯度 84° 以上に伸びない（島・氷雪地域は許す）", () => {
  for (const ws of Object.values(byLayout)) for (const w of ws) { const V = w.mesh.cellCount, off = w.mesh.neighborOffsets, nb = w.mesh.neighborIds, isSea = new Uint8Array(V); for (let c = 0; c < V; c++) isSea[c] = w.cell.elevation[c] <= 0 ? 1 : 0; const { comp, sizes } = landmasses(V, off, nb, isSea); let big = 0; for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i; for (let c = 0; c < V; c++) if (comp[c] === big) assert.ok(Math.abs(w.cell.lat[c]) < (84 * Math.PI) / 180, `緯度 ${(w.cell.lat[c] * 180 / Math.PI).toFixed(0)}°`); }
  assert.ok(polarDamp(0.99) < 0.2 && polarDamp(0.3) === 1);
});
check("島の多さ: 「多い」は「少ない」の 1.5 倍以上", () => {
  const isl = (m) => SEEDS.slice(0, 3).reduce((s, sd) => s + gen(sd, { islandMode: m }).stats.islandCount, 0);
  const f = isl("few"), n = isl("normal"), m = isl("many"); assert.ok(m >= f * 1.5 && m > n, `${f}/${n}/${m}`); // 小さな陸塊は、海岸のゆらぎでも数えられる（few と normal の差は小さい）
});
check("同じシード・同じ設定なら同じ世界。配置を変えれば別の世界", () => {
  assert.equal(generateWorld({ worldSeed: "d1", layout: "split", resolution: { targetCells: 4000 } }).hash, generateWorld({ worldSeed: "d1", layout: "split", resolution: { targetCells: 4000 } }).hash);
  assert.notEqual(generateWorld({ worldSeed: "d1", layout: "split", resolution: { targetCells: 4000 } }).hash, generateWorld({ worldSeed: "d1", layout: "cluster", resolution: { targetCells: 4000 } }).hash);
});
check("山脈（プレート境界の隆起）のある陸は、陸の平均より高い（地質と地形の連動。全世界の合計で比べる）", () => {
  let n = 0, sum = 0, nm = 0, sm = 0;
  for (const ws of Object.values(byLayout)) for (const w of ws) { const V = w.mesh.cellCount; for (let c = 0; c < V; c++) { if (w.cell.elevation[c] <= 0) continue; n++; sum += w.cell.elevation[c]; if (w.cell.mountain[c] > 0.4) { nm++; sm += w.cell.elevation[c]; } } }
  assert.ok(nm > 200 && sm / nm > (sum / n) * 1.1, `${(sm / nm).toFixed(0)} vs ${(sum / n).toFixed(0)}`);
});
check("国号は時代に合う: 初期は共和国・連邦・汗国にならず、後の時代に現れる（年 0 は紀元前 3100 年ごろ）", () => {
  for (const [p, via] of [["republic", null], ["federation", null], ["tribal", "nomad_confederation"], ["tribal", "defense_league"], ["tribal", "agri_union"]]) { const early = stateForm(p, via, "アカロ", 100); assert.ok(!/共和国|連邦|汗国|連盟|連合王国/.test(early), `${p}/${via}: ${early}`); }
  assert.equal(stateForm("republic", null, "x", 100), "同盟"); assert.equal(stateForm("republic", null, "x", 3000), "共和国"); assert.equal(stateForm("federation", null, "x", 3000), "同盟"); assert.equal(stateForm("federation", null, "x", 4800), "連邦");
  assert.equal(stateForm("tribal", "nomad_confederation", "x", 1800), "部族連合"); assert.equal(stateForm("tribal", "nomad_confederation", "x", 3500), "汗国");
  assert.equal(composeStateName("アカロ", "kingdom", null, 50).endsWith("国") || composeStateName("アカロ", "kingdom", null, 50).endsWith("朝"), true);
  assert.equal(stateForm("republic", null, "x"), "共和国"); // 年を渡さなければ現代の称号
});
check("統計の許容: 配置ごとに大陸の数・最大陸塊を判定する", () => {
  const w = byLayout.super[0]; assert.deepEqual(statsProblems(w.stats, w.spec).filter((r) => /偏りすぎ/.test(r)), []);
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
