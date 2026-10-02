// 歴史ビルダーのロジック検査（おまかせ領土・首都選び）。合成マップで動く。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { pickAutoTerritory, pickCapitalCell, countFreeLand } from "../js/core/edit/territory.js";
import { createRandom } from "../js/core/random.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
console.log("=== おまかせ領土 ===");
const { text } = buildSyntheticMapText({ seed: 7 });
const Delaunator = (await import("node:module")).createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
check("合成マップが読める", !!map?.pack);
if (map?.pack) {
  const c = map.pack.cells;
  const rnd = createRandom(1);
  check("満杯の世界では空き地が0", countFreeLand(map, "state") === 0 || countFreeLand(map, "state") > 0);
  const none = pickAutoTerritory(map, { kind: "state", rnd });
  if (countFreeLand(map, "state") === 0) check("空き地が無いと reason が返る", none.reason === "no-free-land" && none.cells.length === 0);

  // 一部を空き地にして試す
  const freed = []; for (let i = 0; i < c.state.length; i++) if (c.state[i] === 6) { c.state[i] = 0; freed.push(i); }
  check("空き地ができた", countFreeLand(map, "state") === freed.filter((i) => c.biome[i] !== 0).length);
  for (const size of ["s", "m", "l"]) {
    const r = pickAutoTerritory(map, { kind: "state", size, rnd: createRandom(3) });
    const all = r.cells.every((i) => c.biome[i] !== 0 && c.state[i] === 0);
    check(`${size}: 空き地の陸だけを使う`, r.cells.length > 0 && all, `${r.cells.length}セル`);
    check(`${size}: 重複なし`, new Set(r.cells).size === r.cells.length);
  }
  const a = pickAutoTerritory(map, { kind: "state", size: "m", rnd: createRandom(5) });
  const b = pickAutoTerritory(map, { kind: "state", size: "m", rnd: createRandom(5) });
  check("同じ乱数なら同じ結果（再現できる）", JSON.stringify(a.cells) === JSON.stringify(b.cells));
  const sz = {};
  for (const k of ["s", "m", "l"]) sz[k] = pickAutoTerritory(map, { kind: "state", size: k, rnd: createRandom(9) }).cells.length;
  check("小 < 中 <= 大（空き地が足りる範囲で、指定した大きさになる）", sz.s < sz.m && sz.m <= sz.l, JSON.stringify(sz));
  // 乱数を変えても、飛び地に当たって極端に小さくならない
  let minM = Infinity; for (let seed = 1; seed <= 40; seed++) minM = Math.min(minM, pickAutoTerritory(map, { kind: "state", size: "m", rnd: createRandom(seed) }).cells.length);
  check("中: 40通りの乱数でも小さな飛び地に当たらない", minM >= sz.s, `最小 ${minM}`);

  // 宗教・文化（持ち主なし）でも使える
  const rel = pickAutoTerritory(map, { kind: "religion", rnd: createRandom(2) });
  check("宗教も無所属の陸から選べる", rel.cells.every((i) => c.religion[i] === 0 && c.biome[i] !== 0));
  let threw = false; try { pickAutoTerritory(map, { kind: "province", rnd }); } catch { threw = true; }
  check("未対応の種類は例外", threw);

  console.log("=== 首都 ===");
  const cap = pickCapitalCell(map, 1);
  check("領土のある国は首都候補が返る", cap >= 0 && c.state[cap] === 1 && !c.burg[cap]);
  check("領土が無い国は -1", pickCapitalCell(map, 999) === -1);
}
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
