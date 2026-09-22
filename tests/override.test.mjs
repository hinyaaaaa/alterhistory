// 形状の手動編集（graphOverride）の検証。
// 注意: 実ファイル2件の L51 は空(または行なし)。中身のあるファイルは手元に無いため、
//       ここでは実ファイルを元に「公式の仕様どおりの中身」を合成して検証する（実ファイルでの検証ではない）。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { applyVertexOverrides } from "../js/core/geometry.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const enc = (s) => new TextEncoder().encode(s);

console.log("=== 純粋関数 applyVertexOverrides ===");
{
  const v = { p: [[1, 2], [3, 4], [5, 6]] };
  const r = applyVertexOverrides(v, { pack: { vertices: { p: { 0: [[1, 2], [10, 20]], 1: [[9, 9], [30, 40]], 2: [[5, 6], [50, 60]] } } } });
  check("元の座標が一致する頂点だけ移動する", JSON.stringify(v.p) === "[[10,20],[3,4],[50,60]]", JSON.stringify(v.p));
  check("適用2件・不一致1件と報告", r.applied === 2 && r.skipped === 1 && r.unsupported === false);
  const v2 = { p: [[1, 2]] };
  const r2 = applyVertexOverrides(v2, { pack: { vertices: { p: { 7: [[1, 2], [3, 4]], 0: [[1, 2], ["x", 4]], 0.5: null } } } });
  check("存在しない頂点・不正な値は適用せず数える", v2.p[0].join() === "1,2" && r2.skipped === 3 && r2.applied === 0, JSON.stringify(r2));
  check("空・未指定は何もしない", applyVertexOverrides({ p: [[0, 0]] }, {}).applied === 0 && applyVertexOverrides({ p: [] }, undefined).skipped === 0);
  check("grid/セルの上書きは未対応として検出", applyVertexOverrides({ p: [] }, { grid: { cells: { h: { 1: [1, 2] } } } }).unsupported === true
    && applyVertexOverrides({ p: [] }, { pack: { cells: { h: { 1: [1, 2] } } } }).unsupported === true);
}

console.log("=== 実ファイルを元にした合成テスト ===");
const src = readFileSync(SAMPLES + "/境界線の貴方.map", "utf-8").split("\r\n");
const base = (await loadFromBytes(enc(src.join("\r\n")), Delaunator));
check("元ファイル(L51={})は移動0件・警告なし", base.map.geometry.overrideReport.applied === 0 && !base.warnings.some((w) => w.includes("手動編集")));

// 陸の中の頂点を1つ選び、公式と同じ形式の上書きを作る
const vid = base.map.geometry.pack.cells.v[base.map.pack.burgs[1].cell][0];
const from = base.map.geometry.pack.vertices.p[vid];
const to = [from[0] + 2.5, from[1] - 1.5];
const withOv = src.slice(); withOv[51] = JSON.stringify({ pack: { vertices: { p: { [vid]: [from, to] } } } });
const text = withOv.join("\r\n");
const r = await loadFromBytes(enc(text), Delaunator);
check("上書きされた頂点が移動後の座標になる", JSON.stringify(r.map.geometry.pack.vertices.p[vid]) === JSON.stringify(to));
check("1件適用・0件不一致・警告なし", r.map.geometry.overrideReport.applied === 1 && r.map.geometry.overrideReport.skipped === 0 && r.warnings.length === 0, JSON.stringify(r.map.geometry.overrideReport));
check("他の頂点は変わらない", r.map.geometry.pack.vertices.p.every((p, i) => i === vid || (p[0] === base.map.geometry.pack.vertices.p[i][0] && p[1] === base.map.geometry.pack.vertices.p[i][1])));
check("セル数・属性配列は変わらない", r.map.geometry.pack.p.length === base.map.geometry.pack.p.length);

// その頂点を持つセルの多角形が実際に変形している
const cell = r.map.geometry.pack.cells.c.findIndex((_, i) => r.map.geometry.pack.cells.v[i].includes(vid));
const polyBefore = base.map.geometry.pack.cells.v[cell].map((v) => base.map.geometry.pack.vertices.p[v]).join(";");
const polyAfter = r.map.geometry.pack.cells.v[cell].map((v) => r.map.geometry.pack.vertices.p[v]).join(";");
check("その頂点を含むセルの形が変わる", polyBefore !== polyAfter);

// 元の座標が合わない（別の地図の上書きを持ってきた等）→ 適用せず警告
const stale = src.slice(); stale[51] = JSON.stringify({ pack: { vertices: { p: { [vid]: [[from[0] + 1, from[1]], to] } } } });
const rs = await loadFromBytes(enc(stale.join("\r\n")), Delaunator);
check("元の座標が合わなければ適用しない", JSON.stringify(rs.map.geometry.pack.vertices.p[vid]) === JSON.stringify(from));
check("適用できなかった件数を警告で知らせる", rs.warnings.some((w) => w.includes("1 件") && w.includes("適用できませんでした")), rs.warnings[0]?.slice(0, 50));

// 未対応の編集
const uns = src.slice(); uns[51] = JSON.stringify({ grid: { cells: { h: { 3: [10, 20] } } } });
const ru = await loadFromBytes(enc(uns.join("\r\n")), Delaunator);
check("未対応の編集は警告する", ru.warnings.some((w) => w.includes("未対応の形状編集")));

// 書き戻しで、上書きの行が1文字も変わらない
const out = serializeAzgaar(parseAzgaarText(text).map).split("\r\n");
check("書き出しで L51 が元の原文のまま", out[51] === withOv[51]);
check("ファイル全体が元と一致", out.join("\r\n") === text);

// 旧版（L51 が無い）
const old = await loadFromBytes(enc(readFileSync(SAMPLES + "/新世界より.map", "utf-8")), Delaunator);
check("L51 が無い旧版でも読める（既定値）", old.map.graphOverride && Object.keys(old.map.graphOverride).length === 0 && old.map.geometry.overrideReport.applied === 0);
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
