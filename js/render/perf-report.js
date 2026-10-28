// 実機の描画性能の計測（v5.3.1）。いま開いている地図を、画面と同じ大きさ・同じ条件の「余白つきタイル」に描き、
//   命令を並べた時間（js）と、実際に塗り終えるまでの時間（raster）を分けて測る。アプリの状態・画面は変えない。
//   Chromium の Canvas 2D は命令を記録するだけで、塗りつぶしは後でまとめて行う。そのため、描画後にキャンバスを読み出して塗り終わりを待つ。
//   キャンバスの種類を2つ比べる: 「既定」（GPU が使える環境では GPU で描く）と「CPU」（willReadFrequently: ソフトウェア描画）。
//   使い方（ブラウザの開発者ツールのコンソール）: await alterhistory.perf()   ※ブレークポイントで止めずに実行する
import { drawScene } from "./scene.js";
import { createRenderProfile } from "./profile.js";
import { OVERSCAN, MAX_TILE_PIXELS } from "./renderer.js";

export async function runRenderBenchmark({ map, viewport, getOptions, repeats = 3 }) {
  if (!map?.geometry) throw new Error("地図がありません");
  const dpr = window.devicePixelRatio || 1;
  const mx = Math.round(viewport.screenWidth * OVERSCAN), my = Math.round(viewport.screenHeight * OVERSCAN);
  const cssW = viewport.screenWidth + mx * 2, cssH = viewport.screenHeight + my * 2;
  const tdpr = Math.min(dpr, Math.sqrt(MAX_TILE_PIXELS / (cssW * cssH)));
  const pw = Math.max(1, Math.round(cssW * tdpr)), ph = Math.max(1, Math.round(cssH * tdpr));
  const tvp = viewport.cloneFor(cssW, cssH, mx, my);
  const rows = [];
  for (const [mode, ctxOpts] of [["既定（GPUが使えればGPU）", undefined], ["CPU（ソフトウェア描画）", { willReadFrequently: true }]]) {
    const cv = document.createElement("canvas"); cv.width = pw; cv.height = ph;
    const ctx = cv.getContext("2d", ctxOpts);
    for (let n = 1; n <= repeats; n++) {
      await new Promise((r) => setTimeout(r, 0)); // 前の回の後始末（GC など）を挟む
      const profile = createRenderProfile();
      const a = performance.now();
      drawScene(ctx, map, tvp, { ...getOptions(), profile }, tdpr);
      const b = performance.now();
      ctx.getImageData(0, 0, 1, 1); // 塗り終わるまで待つ
      const c = performance.now();
      rows.push({ キャンバス: mode, 回: n, "js(ms)": Math.round(b - a), "塗り終わりまで(ms)": Math.round(c - b), "合計(ms)": Math.round(c - a), タイル: `${pw}x${ph}`, コピー: tvp.copyOffsets().join(","), 層別js: profile.snapshot().ms });
    }
  }
  console.info(`[描画ベンチ] セル ${map.geometry.pack.cells.v.length}・画面 ${viewport.screenWidth}x${viewport.screenHeight}・DPR ${dpr}（タイル ${pw}x${ph}）`);
  console.table(rows.map(({ 層別js, ...r }) => r));
  return rows;
}
