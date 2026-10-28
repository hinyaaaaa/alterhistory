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
import { createRenderProfile } from "./profile.js";

const SETTLE_MS = 120;
export const OVERSCAN = 0.4;          // 画面の外側に、この割合だけ余分に描いておく
export const MAX_TILE_PIXELS = 14e6;  // タイルの最大画素数（メモリの上限。超えるときは解像度を少し下げる）

export function createRenderer({ canvas, viewport, getMap, getOptions }) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let rafId = 0;
  let settleTimer = 0;
  let interacting = false;
  let needFull = true;
  let tile = null; // { canvas, x, y, k, mx, my, cssW, cssH }（描いたときの視点と大きさ）
  const listeners = new Set();
  // v5.3.1: 描画要求の完了を追う。requestRender() は要求番号つきの約束（Promise）を返し、
  //   その要求より後に描いたタイル（drawTile）を貼り終えたとき（frame の終わり）に解決する。
  //   単なる予約時刻や、データを採用した時刻を「描画完了」とは扱わない。連続した要求は、まとめて1回の描画で満たされる（番号で区別する）。
  let reqSeq = 0;
  let waiters = [];   // { id, resolve, reject }
  let lastRender = null; // 直近のタイル描画の結果（timings）

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

  /** 余白つきタイルを描き直す（画面外のキャンバスに描き、完成してから貼る）。段階ごとの時間（ms）を返す（地図が無ければ null） */
  function drawTile() {
    const map = getMap();
    if (!map?.geometry) { tile = null; clear(); return null; }
    const t0 = performance.now();
    const mx = Math.round(viewport.screenWidth * OVERSCAN), my = Math.round(viewport.screenHeight * OVERSCAN);
    const cssW = viewport.screenWidth + mx * 2, cssH = viewport.screenHeight + my * 2;
    const tdpr = Math.min(dpr, Math.sqrt(MAX_TILE_PIXELS / (cssW * cssH)));
    const pw = Math.max(1, Math.round(cssW * tdpr)), ph = Math.max(1, Math.round(cssH * tdpr));
    const cv = tile?.canvas ?? document.createElement("canvas");
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    // タイル用の視点：画面の視点を、余白ぶんずらして広げたもの（投影の実体も共有する）
    const tvp = viewport.cloneFor(cssW, cssH, mx, my);
    const profile = createRenderProfile(); // 通常は合計だけを集める（キャンバスの読み出しはしない）
    const t1 = performance.now();
    drawScene(cv.getContext("2d"), map, tvp, { ...getOptions(), profile }, tdpr);
    const t2 = performance.now();
    tile = { canvas: cv, x: viewport.x, y: viewport.y, k: viewport.k, mx, my, cssW, cssH };
    return { setupMs: t1 - t0, sceneMs: t2 - t1, tileMs: t2 - t0, tilePixels: pw * ph, profile: profile.snapshot() };
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

  function settle(served, result, err) {
    const done = waiters.filter((w) => w.id <= served);
    if (!done.length) return;
    waiters = waiters.filter((w) => w.id > served);
    for (const w of done) { if (err) w.reject(err); else w.resolve({ ...result, id: w.id }); }
  }

  function frame() {
    rafId = 0;
    const served = reqSeq; // この描画で満たす要求（これより後の要求は次の描画で満たす）
    let timings = null, blitMs = 0;
    try {
      if (needFull || !tile) { timings = drawTile(); needFull = false; }
      const b0 = performance.now();
      blit();
      blitMs = performance.now() - b0;
      notify();
    } catch (e) {
      needFull = true; // 失敗した描画を成功扱いにしない。次の要求でやり直す
      settle(served, null, e); // 待っている側へ失敗を伝える
      throw e;                  // 例外は握りつぶさない（従来どおり画面の例外として残る）
    }
    if (timings || waiters.length) {
      lastRender = { ...(timings ?? {}), blitMs };
      if (waiters.some((w) => w.id <= served)) {
        // 「描画完了」= タイルを描いて貼り終えた時点。画面に出た（次のフレームが表示された）までの時間は、少し遅れて分かる
        const t = performance.now(), result = { ...lastRender };
        result.presented = new Promise((resolve) => {
          if (typeof requestAnimationFrame !== "function") { resolve(null); return; }
          requestAnimationFrame(() => requestAnimationFrame(() => { const ms = performance.now() - t; lastRender.presentMs = ms; resolve(ms); }));
        });
        settle(served, result);
      }
    }
  }

  const schedule = () => { if (!rafId) rafId = requestAnimationFrame(frame); };

  /** データや表示設定が変わったとき。画面外で描き直し、できたら貼り替える */
  function requestRender() {
    needFull = true;
    interacting = false;
    clearTimeout(settleTimer);
    const id = ++reqSeq;
    const done = new Promise((resolve, reject) => waiters.push({ id, resolve, reject }));
    done.catch(() => {}); // 結果を待たない呼び出し（ほとんど）では、失敗を未処理の拒否として二重に出さない（例外は frame から投げる）
    schedule();
    return done;
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
    /** 直近のタイル描画の内訳（setupMs・sceneMs・tileMs・blitMs・presentMs・層ごとの時間と件数）。まだ描いていなければ null */
    get lastRender() { return lastRender; },
    /** 描画のたびに呼ばれるコールバック（ズーム表示の更新用）。解除関数を返す */
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { cancelAnimationFrame(rafId); clearTimeout(settleTimer); listeners.clear(); const w = waiters; waiters = []; for (const x of w) x.reject(new Error("レンダラーが破棄されました")); },
  };
}
