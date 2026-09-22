import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { loadFromBytes } from "../js/io/loader.js";
import { renderMapToCanvas, renderMapToSvg, exportFileName, sanitizeFileName, todayString } from "../js/io/exporter.js";
import { parseColor, createSvgContext } from "../js/render/svg-context.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { viewToRenderOptions } from "../js/render/options.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
/** SVG を指定ピクセルで画像化する。viewBox は保つので、拡大しても再描画される（引き伸ばしではない） */
async function rasterizeSvg(svg, w, h) {
  const sized = svg.replace(/<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${w}" height="${h}"`);
  if (sized === svg) throw new Error("テストの前提が崩れています: <svg> の width/height を書き換えられません");
  const img = await loadImage(Buffer.from(sized));
  const c = createCanvas(w, h); c.getContext("2d").drawImage(img, 0, 0);
  return c;
}
const opts = viewToRenderOptions({ overlay: "state", base: "biome", coast: true, rivers: true, routes: true, burgs: true, labels: true });

console.log("=== 色・ファイル名 ===");
check("rgba → 色 + 不透明度", JSON.stringify(parseColor("rgba(45,50,60,0.85)")) === '{"color":"#2d323c","alpha":0.85}');
check("#rgb 展開", parseColor("#abc").color === "#aabbcc");
let threw = false; try { parseColor("red"); } catch { threw = true; }
check("未対応の色は例外（黙って黒にしない）", threw);
check("ファイル名: 禁止文字を除く（/ : は各1、* ? \" < > | は計6 → _ が6個）", sanitizeFileName('a/b:c*?"<>|d') === "a_b_c______d");
check("ファイル名: 制御文字・先頭のドット・長さ", sanitizeFileName("..\u0001x") === "_x" && sanitizeFileName("あ".repeat(200)).length === 80);
check("ファイル名: 拡張子と .gz を除いて付け直す", exportFileName({ meta: { name: "" } }, "新世界より.map.gz", "svg") === "新世界より.svg");
check("ファイル名: 地図の名前を優先", exportFileName({ meta: { name: "アルテ大陸" } }, "x.map", "png") === "アルテ大陸.png");
check("ファイル名: 何も無ければ map", exportFileName(null, "", "png") === "map.png");
check("日付形式 (YYYY-M-D)", todayString(new Date(2026, 8, 21)) === "2026-9-21");

console.log("=== SVG コンテキストの異常系 ===");
{
  const c = createSvgContext(10, 10);
  let e1 = false; try { c.arc(0, 0, 5, 0, 1); } catch { e1 = true; }
  check("円以外の円弧は例外", e1);
  let e2 = false; try { c.drawImage(); } catch { e2 = true; }
  check("drawImage は例外", e2);
  c.font = "bold 12px Meiryo, sans-serif"; c.textAlign = "center"; c.fillStyle = "#123456"; c.fillText("A<&>\"", 5, 5);
  const s = c.toString();
  check("文字は XML エスケープされる", s.includes("A&lt;&amp;&gt;&quot;") && s.includes('font-weight="bold"') && s.includes('text-anchor="middle"'));
  check("測定: 全角は半角より広い", c.measureText("あ").width > c.measureText("a").width);
}

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(SAMPLES + "/" + f)), Delaunator);
  const W = map.meta.width, H = map.meta.height;

  // PNG
  const t0 = performance.now();
  const canvas = renderMapToCanvas(map, opts, { scale: 2, createCanvas });
  const png = canvas.toBuffer("image/png");
  check("PNG: 署名が正しい", png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${(png.length / 1024).toFixed(0)}KB ${(performance.now() - t0).toFixed(0)}ms`);
  check("PNG: 寸法が 地図×倍率", canvas.width === W * 2 && canvas.height === H * 2, `${canvas.width}x${canvas.height}`);
  // 画素の確認: 全面が単色でない・四隅が背景色でなく地図が描かれている・色数が十分ある
  const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set(); for (let i = 0; i < px.length; i += 4 * 97) colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  check("PNG: 描画内容がある（色数が多い）", colors.size > 50, `標本の色数=${colors.size}`);
  const at = (x, y) => { const i = (y * canvas.width + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const bg = [0x2f, 0x4a, 0x72];
  const nonBgCenter = at(canvas.width >> 1, canvas.height >> 1).some((v, i) => Math.abs(v - bg[i]) > 6);
  check("PNG: 中央が背景色ではない（地図が描かれている）", nonBgCenter);

  // SVG
  const t1 = performance.now();
  const svg = renderMapToSvg(map, opts);
  check("SVG: 生成", svg.length > 10000, `${(svg.length / 1024).toFixed(0)}KB ${(performance.now() - t1).toFixed(0)}ms`);
  const doc = new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;
  check("SVG: XML として正しい（整形式）", doc.documentElement.tagName === "svg" && !doc.querySelector("parsererror"));
  check("SVG: 寸法と viewBox", doc.documentElement.getAttribute("viewBox") === `0 0 ${W} ${H}` && doc.documentElement.getAttribute("width") === String(W));
  const paths = doc.querySelectorAll("path").length, texts = doc.querySelectorAll("text").length;
  check("SVG: パスと文字がある", paths > 100 && texts > 20, `path=${paths} text=${texts}`);
  check("SVG: 国名などの日本語が含まれる", /[\u3040-\u30ff\u4e00-\u9fff]/.test(doc.querySelector("text")?.textContent + [...doc.querySelectorAll("text")].map((t) => t.textContent).join("")));
  check("SVG: rgba() が残っていない（互換性のため）", !/rgba?\(/.test(svg));
  check("SVG: NaN / undefined が混入していない", !/NaN|undefined|Infinity/.test(svg));

  // ---- 土台の地図（ラベルなし）を、SVG と Canvas で画素比較する ----
  // ラベルを除く理由: 日本語の文字は、SVG を画像化する側のフォント解決に依存し、
  // この検査環境では正しく比較できない（フォント一覧の解決が Canvas と異なることを実測で確認済み）。
  const baseOpts = { ...opts, labels: false };
  const cBase = renderMapToCanvas(map, baseOpts, { scale: 2, createCanvas });
  const svgBase = renderMapToSvg(map, baseOpts);
  const c2 = await rasterizeSvg(svgBase, W * 2, H * 2); const g2 = c2.getContext("2d");
  const pa = cBase.getContext("2d").getImageData(0, 0, W * 2, H * 2).data;
  const pb = g2.getImageData(0, 0, W * 2, H * 2).data;
  let sum = 0, n = 0, big = 0;
  for (let i = 0; i < pa.length; i += 4 * 7) {
    const d = (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])) / 3;
    sum += d; n++; if (d > 40) big++;
  }
  const mean = sum / n, bigPct = (100 * big) / n;
  check("土台の地図: SVG と PNG の平均色差 < 0.6（実測 0.1〜0.3）", mean < 0.6, `平均色差=${mean.toFixed(3)}`);
  check("土台の地図: 大きく違う画素 < 0.1%（実測 0.00〜0.02%）", bigPct < 0.1, `${bigPct.toFixed(3)}%`);

  // ---- ラベルの構造検査 ----
  // Canvas 側に実際に描かれた文字を記録するため、getContext を包んで fillText を数える
  const recorded = [];
  const spyCanvas = createCanvas(W * 2, H * 2);
  const realCtx = spyCanvas.getContext("2d");
  const spyCtx = new Proxy(realCtx, {
    get(t, k) { const v = t[k]; return typeof v === "function" ? (...a) => { if (k === "fillText") recorded.push(a[0]); return v.apply(t, a); } : v; },
    set(t, k, v) { t[k] = v; return true; },
  });
  const { drawScene } = await import("../js/render/scene.js");
  const { createViewport } = await import("../js/render/viewport.js");
  const vpL = createViewport(W, H); vpL.resize(W, H); vpL.fit(0);
  drawScene(spyCtx, map, vpL, opts, 2);
  const svgFillTexts = [...doc.querySelectorAll("text")].filter((t) => t.getAttribute("fill") !== "none").map((t) => t.textContent);
  const diff = Math.abs(recorded.length - svgFillTexts.length);
  check("ラベル: SVG と Canvas で表示数がほぼ同じ（差 5% 以内）", diff <= Math.ceil(recorded.length * 0.05), `Canvas=${recorded.length} SVG=${svgFillTexts.length} 差=${diff}`);
  const inSvg = new Set(svgFillTexts);
  const common = recorded.filter((t) => inSvg.has(t)).length;
  check("ラベル: Canvas のラベルの 90% 以上が SVG にもある", common >= recorded.length * 0.9, `${common}/${recorded.length}`);
  const halo = [...doc.querySelectorAll("text")].filter((t) => t.getAttribute("fill") === "none").length;
  check("ラベル: 白縁取り（halo）が文字と同数ある", halo === svgFillTexts.length, `halo=${halo} 文字=${svgFillTexts.length}`);
  if (process.env.DEBUG_OUT && f.startsWith("境界")) {   // 目視確認用。DEBUG_OUT=出力先フォルダ
    const fs = await import("node:fs");
    fs.writeFileSync(`${process.env.DEBUG_OUT}/export_png.png`, png);
    fs.writeFileSync(`${process.env.DEBUG_OUT}/export_svg_base_raster.png`, c2.toBuffer("image/png"));
  }
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
