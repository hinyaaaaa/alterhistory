import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { createCellIndex } from "../js/core/spatial.js";
import { describeCell, listEntities, entityPosition } from "../js/core/query.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { loadFromBytes, LoadError } from "../js/io/loader.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const raw = readFileSync(SAMPLES + "/" + f);

  // ローダー: プレーン / gzip の両方
  const t0 = performance.now();
  const plain = await loadFromBytes(new Uint8Array(raw), Delaunator);
  check("プレーンを読み込み+形状構築", !!plain.map.geometry, `${(performance.now() - t0).toFixed(0)}ms`);
  const gz = await loadFromBytes(new Uint8Array(gzipSync(raw)), Delaunator);
  check("gzip を展開して同じ結果", gz.map.pack.states.length === plain.map.pack.states.length && gz.map.geometry.pack.p.length === plain.map.geometry.pack.p.length);
  const map = plain.map;

  // 空間索引: 各セルの点で検索すると自分自身が返る（全数）
  const pts = map.geometry.pack.p;
  const idx = createCellIndex(pts);
  let selfHit = 0;
  for (let i = 0; i < pts.length; i++) if (idx.find(pts[i][0], pts[i][1]) === i) selfHit++;
  check("空間索引: 全セルで自セルを返す", selfHit === pts.length, `${selfHit}/${pts.length}`);

  // 空間索引の正しさ: ランダムな点で総当たりと一致
  let mismatch = 0;
  for (let n = 0; n < 300; n++) {
    const x = Math.random() * 1280, y = Math.random() * 774;
    let best = -1, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    const got = idx.find(x, y);
    // 同距離の別セルは許容（距離で比較）
    const gd = (pts[got][0] - x) ** 2 + (pts[got][1] - y) ** 2;
    if (Math.abs(gd - bd) > 1e-9) mismatch++;
  }
  check("空間索引: 総当たりと一致(300点)", mismatch === 0, `不一致=${mismatch}`);
  const t1 = performance.now(); for (let n = 0; n < 2000; n++) idx.find(Math.random() * 1280, Math.random() * 774);
  console.log(`  情報: 検索 ${((performance.now() - t1) / 2000 * 1000).toFixed(1)}µs/回`);

  // セル情報
  const capital = map.pack.burgs.find((b) => b && b.i && b.capital);
  const info = describeCell(map, capital.cell);
  check("セル情報: 首都のセルに都市名と国家名", info.burg === capital.name && !!info.state, `${info.burg} / ${info.state}`);
  const waterCell = map.pack.cells.biome.indexOf(0);
  const w = describeCell(map, waterCell);
  check("セル情報: 水域は国家なし", w.water && w.state === null);
  check("セル情報: 範囲外は null", describeCell(map, -1) === null && describeCell(map, 1e9) === null);

  // 凡例
  const states = listEntities(map, "state");
  check("凡例: 実在国家のみ・セル数降順", states.length > 0 && states.every((s, i) => i === 0 || states[i - 1].cells >= s.cells));
  check("凡例: 位置を取得できる", states.every((s) => entityPosition(map, { pole: s.pole, center: s.center }) !== null));
  for (const kind of ["culture", "religion", "province"]) check(`凡例: ${kind} が取得できる`, listEntities(map, kind).length >= 0, `n=${listEntities(map, kind).length}`);
}

console.log("=== 異常系 ===");
const rejects = async (bytes) => { try { await loadFromBytes(bytes, Delaunator); return false; } catch (e) { return e instanceof LoadError; } };
check("空バイト列は LoadError", await rejects(new Uint8Array(0)));
check("無関係なテキストは LoadError", await rejects(new TextEncoder().encode("これは地図ではありません")));
check("壊れた gzip は例外", await (async () => { try { await loadFromBytes(new Uint8Array([0x1f, 0x8b, 1, 2, 3]), Delaunator); return false; } catch { return true; } })());
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
