// v5.3.1: 実ブラウザ（Chromium）での描画ベンチ。dist/app.js（npm run build 後）を、実際のアプリのまま動かして測る。
//   node tests/perf/browser-render-bench.mjs [セル数=250000] [出力JSON]
// 測るもの（初回とキャッシュ後を分け、同じ条件で REPEATS 回。最良値だけを載せない）:
//   - 新規世界: 世界生成・地図変換・描画完了を分離（旧ログの「採用と描画」とは比べない）
//   - 全体表示のタイル描画 ×N、16倍拡大の初回と ×N
//   - 描画中の long task（主スレッドが 50ms 以上塞がった回数・最大・合計）
//   - 実際に塗り終わるまでの時間（キャンバスを読み出して待つ）: 既定キャンバスと CPU キャンバス（alterhistory.perf と同じ）
// 注意: 実行環境（CPU・GPU・描画方式）で値が大きく変わる。Edge 実機の値として流用しない。ブレークポイントで止めない。
import { launch, root } from "../e2e/lib.mjs";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";

const CELLS = Number(process.argv[2] ?? 250000), OUT = process.argv[3] ?? null, REPEATS = Number(process.env.REPEATS ?? 3);
const { browser, page, problems } = await launch({ width: 1280, height: 853 });
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.bringToFront();
await page.waitForFunction(() => !!globalThis.alterhistory, null, { timeout: 30000 });
const res = await page.evaluate(async ({ cells, repeats }) => {
  const { store, actions, renderer, viewport } = globalThis.alterhistory;
  const long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] });
  const r = (x) => Math.round(x);
  const out = { cells, build: globalThis.alterhistory.build, ua: navigator.userAgent, dpr: devicePixelRatio, screen: [viewport.screenWidth, viewport.screenHeight] };
  const t0 = performance.now();
  const w = await actions.newWorld({ worldSeed: "bench-v531", resolution: { targetCells: cells } });
  out.newWorld = { ok: w.ok, totalMs: r(performance.now() - t0) };
  const first = renderer.lastRender;
  out.fullFirst = { tileMs: r(first.tileMs), sceneMs: r(first.sceneMs), blitMs: r(first.blitMs), layerMs: first.profile.ms, counts: first.profile.counts };
  const again = async (n) => { const a = []; for (let i = 0; i < n; i++) { const x = await renderer.requestRender(); a.push(r(x.tileMs)); } return a; };
  out.fullCachedTileMs = await again(repeats);
  viewport.zoomAt(viewport.screenWidth / 2, viewport.screenHeight / 2, 16);
  const z1 = await renderer.requestRender();
  out.zoom16First = { tileMs: r(z1.tileMs), copies: z1.profile.counts };
  out.zoom16CachedTileMs = await again(repeats);
  viewport.fit(); await renderer.requestRender();
  out.longTasksMs = long;
  // 実際に塗り終わるまで（既定キャンバス／CPU キャンバス）
  const rows = await globalThis.alterhistory.perf({ repeats });
  out.rasterTable = rows.map(({ 層別js, ...x }) => x);
  return out;
}, { cells: CELLS, repeats: REPEATS });
res.problems = problems;
const txt = JSON.stringify(res, null, 1);
if (OUT) writeFileSync(OUT, txt + "\n");
console.log(txt);
await browser.close();
