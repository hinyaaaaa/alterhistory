import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseAzgaarBytes } from "../js/io/azgaar-reader.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { buildVoronoi, rebuildPack, SEA_LEVEL } from "../js/core/geometry.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map: m } = parseAzgaarBytes(readFileSync(SAMPLES + "/" + f));
  const g = m.grid;

  const t0 = performance.now();
  const gridV = buildVoronoi(g.points, g.boundary, Delaunator);
  const pack = rebuildPack(
    { points: g.points, boundary: g.boundary, spacing: g.spacing, features: g.features, h: g.h, f: g.f, t: g.t },
    gridV, Delaunator);
  const ms = (performance.now() - t0).toFixed(0);

  const nSaved = m.pack.cells.state.length;
  // 判定1: セル数が保存済み配列と一致
  check("再構築セル数 = 保存済みセル数", pack.p.length === nSaved, `再構築=${pack.p.length} 保存=${nSaved} (${ms}ms)`);

  // 判定2: 都市の座標が、burg.cell が指すセルの多角形の内側にあるか（点と多角形の内外判定）。
  //   ※ 都市はドラッグで動かせるため、セル中心との一致は前提にできない。
  //   ※ 添字の対応が誤っていれば、ほぼ全ての都市がここで外れる。
  const inside = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const burgs = m.pack.burgs.filter((b) => b && b.i && b.cell != null);
  let contained = 0, atCenter = 0;
  const outside = [];
  for (const b of burgs) {
    const poly = pack.cells.v[b.cell]?.map((v) => pack.vertices.p[v]);
    if (poly && inside([b.x, b.y], poly)) contained++; else outside.push(b.i);
    const pt = pack.p[b.cell];
    if (pt && Math.hypot(pt[0] - b.x, pt[1] - b.y) < 0.5) atCenter++;
  }
  check("都市が自セルの多角形の内側", contained / burgs.length > 0.98,
    `${contained}/${burgs.length}` + (outside.length ? `  外れ=${outside.slice(0, 6).join(",")}` : ""));
  const offBurgs = burgs.filter((b) => { const q = pack.p[b.cell]; return q && Math.hypot(q[0] - b.x, q[1] - b.y) >= 0.5; });
  const offPorts = offBurgs.filter((b) => b.port > 0).length;
  const allPorts = burgs.filter((b) => b.port > 0).length;
  console.log(`  情報: セル中心と一致 ${atCenter}/${burgs.length}。ずれた ${offBurgs.length} 都市のうち港 ${offPorts}（港の総数 ${allPorts}）`);

  // 判定3: 高さと海(biome 0)の整合
  const biome = m.pack.cells.biome;
  let agree = 0;
  for (let i = 0; i < nSaved; i++) if ((pack.h[i] < SEA_LEVEL) === (biome[i] === 0)) agree++;
  check("再構築の水/陸 = 保存バイオームの海/陸", agree / nSaved > 0.99, `${agree}/${nSaved} (${(100 * agree / nSaved).toFixed(2)}%)`);

  // 参考: セルの多角形が有効か
  let bad = 0;
  for (let i = 0; i < pack.p.length; i++) if (!pack.cells.v[i] || pack.cells.v[i].length < 3) bad++;
  check("全セルが多角形(頂点3以上)", bad === 0, `不正=${bad}`);
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
