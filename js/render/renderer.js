// レンダラー：Canvas への描画のスケジューリング（DOM に触れる描画層）。
//
// 責務: DPR 対応 / リサイズ / requestAnimationFrame による間引き / 操作中のなめらかな表示
// 何を描くかは scene.js の責務。状態は変更しない。
//
// なめらかさの仕組み（Azgaar は SVG なので、ズーム・移動しても描き直さずに GPU が動かす。
// Canvas でも同じ体験にするため、次の3つを組み合わせる）:
//   1. 「余白つきタイル」: 画面より上下左右に40%ずつ広い範囲を、画面外のキャンバスに描いておく。
//      パン（移動）は、そのタイルをずらして貼るだけ。描き直しも、端の暗い空白も出ない。
//   2. ズーム中もタイルを拡大縮小して貼るだけ。止まって少ししたら、その位置で高精細に描き直す。
//   3. 描き直しは画面外のタイルに行い、できあがってから1回で貼り替える。
//      描いている途中の「暗転」や、リサイズ・編集のたびに画面が消える現象が起きない。
//
// 重い再描画は「データが変わったとき」と「ズーム・移動が止まって、タイルの範囲を出たとき」だけ。

import { drawScene } from "./scene.js";
import { createViewport } from "./viewport.js";

const SETTLE_MS = 120;
const OVERSCAN = 0.4;          // 画面の外側に、この割合だけ余分に描いておく
const MAX_TILE_PIXELS = 14e6;  // タイルの最大画素数（メモリの上限。超えるときは解像度を少し下げる）

export function createRenderer({ canvas, viewport, getMap, getOptions }) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let rafId = 0;
  let settleTimer = 0;
  let interacting = false;
  let needFull = true;
  let tile = null; // { canvas, x, y, k, mx, my, cssW, cssH }（描いたときの視点と大きさ）
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn());

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width === pw && canvas.height === ph && viewport.screenWidth === w && viewport.screenHeight === h) return; // 大きさが同じなら何もしない（消えない）
    canvas.width = pw; canvas.height = ph; // ここで画面が一度消えるので、すぐ後で同期的に描き直す
    viewport.resize(w, h);
    tile = null; interacting = false; needFull = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    frame();
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#2f4a72";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** 余白つきタイルを描き直す（画面外のキャンバスに描き、完成してから貼る） */
  function drawTile() {
    const map = getMap();
    if (!map?.geometry) { tile = null; clear(); return; }
    const mx = Math.round(viewport.screenWidth * OVERSCAN), my = Math.round(viewport.screenHeight * OVERSCAN);
    const cssW = viewport.screenWidth + mx * 2, cssH = viewport.screenHeight + my * 2;
    const tdpr = Math.min(dpr, Math.sqrt(MAX_TILE_PIXELS / (cssW * cssH)));
    const pw = Math.max(1, Math.round(cssW * tdpr)), ph = Math.max(1, Math.round(cssH * tdpr));
    const cv = tile?.canvas ?? document.createElement("canvas");
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    // タイル用の視点：画面の視点を、余白ぶんずらして広げたもの
    const tvp = createViewport(viewport.mapWidth, viewport.mapHeight);
    tvp.resize(cssW, cssH);
    tvp.k = viewport.k; tvp.fitK = viewport.fitK; tvp.minK = viewport.minK; tvp.maxK = viewport.maxK;
    tvp.x = viewport.x + mx; tvp.y = viewport.y + my;
    drawScene(cv.getContext("2d"), map, tvp, getOptions(), tdpr);
    tile = { canvas: cv, x: viewport.x, y: viewport.y, k: viewport.k, mx, my, cssW, cssH };
  }

  /** タイルを、いまの視点に合わせて画面へ貼る（拡大縮小・移動だけ。描き直さない） */
  function blit() {
    clear();
    if (!tile) return;
    const s = viewport.k / tile.k;
    const dx = viewport.x - (tile.x + tile.mx) * s;
    const dy = viewport.y - (tile.y + tile.my) * s;
    ctx.drawImage(tile.canvas, dx * dpr, dy * dpr, tile.cssW * s * dpr, tile.cssH * s * dpr);
  }

  /** いまの視点が、描いてあるタイルの範囲に収まっているか（収まっていなければ描き直す） */
  function tileCovers() {
    if (!tile) return false;
    const s = viewport.k / tile.k;
    const dx = viewport.x - (tile.x + tile.mx) * s, dy = viewport.y - (tile.y + tile.my) * s;
    return dx <= 0 && dy <= 0 && dx + tile.cssW * s >= viewport.screenWidth && dy + tile.cssH * s >= viewport.screenHeight;
  }

  function frame() {
    rafId = 0;
    if (needFull || !tile) { drawTile(); needFull = false; }
    blit();
    notify();
  }

  const schedule = () => { if (!rafId) rafId = requestAnimationFrame(frame); };

  /** データや表示設定が変わったとき。画面外で描き直し、できたら貼り替える */
  function requestRender() {
    needFull = true;
    interacting = false;
    clearTimeout(settleTimer);
    schedule();
  }

  /** パン・ズームのたびに呼ぶ。タイルを動かして貼るだけ。止まって、範囲を出ていたら描き直す */
  function interact() {
    interacting = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      interacting = false;
      // 拡大率が大きく変わった（ぼやける）か、タイルの範囲を出たときだけ描き直す。範囲内の移動は描き直さない
      const k = tile ? viewport.k / tile.k : 0;
      if (!tileCovers() || k > 1.25 || k < 0.8) { needFull = true; schedule(); }
    }, SETTLE_MS);
    schedule();
  }

  return {
    resize, requestRender, interact,
    /** 描画のたびに呼ばれるコールバック（ズーム表示の更新用）。解除関数を返す */
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { cancelAnimationFrame(rafId); clearTimeout(settleTimer); listeners.clear(); },
  };
}
