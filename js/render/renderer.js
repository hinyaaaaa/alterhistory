// レンダラー：Canvas への描画のスケジューリング（DOM に触れる描画層）。
//
// 責務: DPR 対応 / リサイズ / requestAnimationFrame による間引き /
//       操作中の高速表示（直前の画像を拡大縮小して表示 → 止まったら高精細に再描画）
// 何を描くかは scene.js の責務。状態は変更しない。
//
// 操作中の高速表示について:
//   数千セルを毎フレーム描き直すと、非力な端末（Surface Go 4 等）で操作が重くなる。
//   そこで、パン・ズーム中は直前のフレームの画像を移動・拡大縮小して見せ、
//   操作が止まって少ししたら、正しい解像度で描き直す。

import { drawScene } from "./scene.js";

const SETTLE_MS = 140;

export function createRenderer({ canvas, viewport, getMap, getOptions }) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let rafId = 0;
  let settleTimer = 0;
  let interacting = false;
  let snapshot = null;   // 操作開始時の画像
  let snapView = null;   // そのときの { x, y, k }
  let needFull = true;
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn());

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    viewport.resize(w, h);
    snapshot = null; interacting = false;
    requestRender();
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#2f4a72";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawFull() {
    const map = getMap();
    if (!map?.geometry) { clear(); return; }
    drawScene(ctx, map, viewport, getOptions(), dpr);
  }

  function drawInteracting() {
    clear();
    if (!snapshot) return;
    const s = viewport.k / snapView.k;
    const dx = viewport.x - snapView.x * s;
    const dy = viewport.y - snapView.y * s;
    ctx.drawImage(snapshot, dx * dpr, dy * dpr, snapshot.width * s, snapshot.height * s);
  }

  function frame() {
    rafId = 0;
    if (interacting && snapshot && !needFull) drawInteracting(); else { drawFull(); needFull = false; }
    notify();
  }

  const schedule = () => { if (!rafId) rafId = requestAnimationFrame(frame); };

  /** データや表示設定が変わったとき。すぐ高精細に描き直す */
  function requestRender() {
    needFull = true;
    interacting = false;
    snapshot = null;
    clearTimeout(settleTimer);
    schedule();
  }

  /** パン・ズームのたびに呼ぶ。操作中は画像の移動で済ませ、止まったら描き直す */
  function interact() {
    if (!interacting) {
      // 現在の画面を控えとして保存
      snapshot = document.createElement("canvas");
      snapshot.width = canvas.width; snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
      snapView = { x: viewport.x, y: viewport.y, k: viewport.k };
      interacting = true;
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(requestRender, SETTLE_MS);
    schedule();
  }

  return {
    resize, requestRender, interact,
    /** 描画のたびに呼ばれるコールバック（ズーム表示の更新用）。解除関数を返す */
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { cancelAnimationFrame(rafId); clearTimeout(settleTimer); listeners.clear(); },
  };
}
