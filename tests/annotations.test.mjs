// 書き出しの付属物（題名・凡例・スケールバー）の検査。合成マップ＋SVG記録コンテキストで文字を確認する。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { renderMapToSvg, renderMapToCanvas } from "../js/io/exporter.js";
import { niceDistance, getScale, drawAnnotations } from "../js/render/layers/annotations.js";
import { viewToRenderOptions } from "../js/render/options.js";
import { createCanvas } from "@napi-rs/canvas";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const { text } = buildSyntheticMapText({ seed: 7 });
const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
const view = { biomes: true, heights: false, states: true, cultures: false, religions: false, provinces: false, legendKind: "state", coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "all" };
const opts = viewToRenderOptions(view);

console.log("=== 縮尺 ===");
check("縮尺を読める（合成マップ）", !!getScale(map) || getScale(map) === null, JSON.stringify(getScale(map)));
{
  const n = niceDistance(3, 160);
  check("きりの良い長さ（1/2/5×10^n）", [1, 2, 5].includes(n.distance / Math.pow(10, Math.floor(Math.log10(n.distance)))), JSON.stringify(n));
  check("画素 = 距離 ÷ 縮尺", Math.abs(n.px - n.distance / 3) < 1e-9);
  const small = niceDistance(0.05, 160), big = niceDistance(40, 160);
  check("縮尺が違えば長さも変わる", small.distance < n.distance && n.distance < big.distance, `${small.distance} < ${n.distance} < ${big.distance}`);
}

console.log("=== SVG ===");
map.settings.options ??= {}; map.settings.options.units = { distance: { unit: "km", scale: 3 } };
map.meta.name = "検査の世界"; map.worldTime = { year: 120, month: 4 };
const svg = renderMapToSvg(map, opts);
const has = (s, t) => s.includes(t);
check("題名が入る", has(svg, "検査の世界") && has(svg, "120年4月"));
check("凡例が入る（国家名）", has(svg, "凡例：国家") && has(svg, "アルビオン王国"));
check("スケールバーが入る（単位つき）", /\d+ km/.test(svg));
const off = renderMapToSvg(map, opts, { annotations: { title: false, legend: false, scaleBar: false } });
check("全て切ると何も入らない", !has(off, "検査の世界") && !has(off, "凡例：") && !/\d+ km/.test(off));
check("付属物ぶんだけ SVG が大きい", svg.length > off.length);
const only = renderMapToSvg(map, opts, { annotations: { title: false, legend: true, scaleBar: false } });
check("凡例だけ入れられる", has(only, "凡例：国家") && !has(only, "検査の世界"));
const none = renderMapToSvg(map, viewToRenderOptions({ ...view, states: false }));
check("色分けなしなら凡例は出ない", !has(none, "凡例："));
const culture = renderMapToSvg(map, viewToRenderOptions({ ...view, states: false, cultures: true, legendKind: "culture" }));
check("色分けに合わせて凡例が変わる", has(culture, "凡例：文化"));
const both = renderMapToSvg(map, viewToRenderOptions({ ...view, cultures: true, legendKind: "culture" }));
check("色分けを重ねても、選んだ種類の凡例が出る", has(both, "凡例：文化") && !has(both, "凡例：国家"));

console.log("=== 縮尺が無い地図 ===");
const saved = map.settings.options.units; delete map.settings.options.units;
const noscale = renderMapToSvg(map, opts);
check("スケールバーは描かない（例外にもならない）", !/\d+ km/.test(noscale) && has(noscale, "凡例：国家"));
map.settings.options.units = saved;

console.log("=== 凡例の件数制限 ===");
{
  const real = map.pack.states.length;
  const r = drawAnnotations({ ...Object.fromEntries(["save","restore","setTransform","fillRect","fillText","measureText"].map((k) => [k, k === "measureText" ? (t) => ({ width: String(t).length * 8 }) : () => {}])) }, map, { w: 1280, h: 774, overlay: "state" });
  check("描いた付属物の位置が返る", !!r.legend && r.legend.w > 0 && r.legend.y + r.legend.h <= 774, `states=${real}`);
  check("凡例は左下、スケールバーは右下", r.legend.x < 640 && (!r.scaleBar || r.scaleBar.x > 640));
}

console.log("=== PNG（実際に描く） ===");
const png = renderMapToCanvas(map, opts, { scale: 2, createCanvas });
check("画像サイズは2倍", png.width === 2560 && png.height === 1548, `${png.width}x${png.height}`);
const buf = png.toBuffer("image/png");
check("PNG として書き出せる", buf.length > 10000 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, `${(buf.length / 1024).toFixed(0)}KB`);
const plain = renderMapToCanvas(map, opts, { scale: 2, createCanvas, annotations: { title: false, legend: false, scaleBar: false } });
const a = png.getContext("2d").getImageData(0, 1548 - 200, 400, 180).data;
const b = plain.getContext("2d").getImageData(0, 1548 - 200, 400, 180).data;
let diff = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) diff++;
check("左下（凡例の位置）の画素が、付属物なしと異なる", diff > 2000, `${diff}画素`);
const c = png.getContext("2d").getImageData(1280, 0, 1280, 40).data, d = plain.getContext("2d").getImageData(1280, 0, 1280, 40).data;
let same = true; for (let i = 0; i < c.length; i++) if (c[i] !== d[i]) { same = false; break; }
check("右上（付属物の無い所）は変わらない", same);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
