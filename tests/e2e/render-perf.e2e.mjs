// v5.3.1: 25万セルの新規世界で、地図が実際に描き終わるまでの時間と、処理中の表示を、実ブラウザ（Chromium）で確かめる。
//   v5.3.0 では、1本のパスに輪郭を積みながら closePath を呼ぶ構築が輪郭数の二乗で遅くなり、この初回描画だけで約 230 秒かかった。
//   ここでは「描き終えるまで」の時間（命令を並べる側）に、直す前なら届かない上限を置く。画面に出るまでの塗りの時間は、機材と描画方式（GPU/CPU）で変わるので、
//   合否には使わず、数値だけ出す（実機の Edge での確認項目。docs/V5_3_1_RENDER_PERF.md）。
import { launch, root, TMP } from "./lib.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const CELLS = Number(process.env.PERF_CELLS ?? 250000);
const LIMIT_TILE_MS = Number(process.env.PERF_LIMIT_TILE_MS ?? 15000); // 直した後は約 1 秒（ヘッドレス・1コア）。直す前は約 224 秒
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

const { browser, page, problems } = await launch({ width: 1280, height: 853 });
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.bringToFront();
await page.waitForFunction(() => !!globalThis.alterhistory, null, { timeout: 30000 });
const r = await page.evaluate(async ({ cells }) => {
  const { store, actions, renderer } = globalThis.alterhistory;
  const busy = []; store.subscribe(() => { const b = store.getState().busy; if (busy[busy.length - 1] !== b) busy.push(b); });
  const t0 = performance.now();
  const res = await actions.newWorld({ worldSeed: "perf-v531", resolution: { targetCells: cells } });
  const total = performance.now() - t0;
  const lr = renderer.lastRender;
  return { ok: res.ok, total, busy, last: lr && { tileMs: lr.tileMs, sceneMs: lr.sceneMs, blitMs: lr.blitMs, setupMs: lr.setupMs, ms: lr.profile?.ms, counts: lr.profile?.counts }, endBusy: store.getState().busy, error: store.getState().error, build: globalThis.alterhistory.build };
}, { cells: CELLS });
await page.waitForTimeout(500);
const presented = await page.evaluate(() => globalThis.alterhistory.renderer.lastRender?.presentMs ?? null);

console.log(`  セル ${CELLS}・ビルド ${JSON.stringify(r.build)}`);
console.log(`  合計 ${Math.round(r.total)} ms／タイル描画 ${Math.round(r.last?.tileMs)} ms（シーン ${Math.round(r.last?.sceneMs)}・貼り付け ${Math.round(r.last?.blitMs)}）／貼り付け後に画面へ ${presented == null ? "?" : Math.round(presented)} ms`);
console.log(`  層別（js ms）: ${JSON.stringify(r.last?.ms)}`);
check("新規世界が作れる", r.ok && !r.error, r.error ?? "");
check(`タイル描画が ${LIMIT_TILE_MS} ms 以内（直す前は約 224,000 ms）`, r.last?.tileMs < LIMIT_TILE_MS, `${Math.round(r.last?.tileMs)} ms`);
check("「地図を描画中…」を経て、描画が終わってから処理中が消える", r.busy.includes("地図を描画中…") && r.endBusy === null, JSON.stringify(r.busy));
check("地形のパスを作った（キャッシュに入れた）", r.last?.counts?.["terrain.pathCache.miss"] >= 1 || r.last?.counts?.["terrain.near.cells"] > 0);
check("ページ内の例外・console.error が無い", problems.length === 0, problems.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
