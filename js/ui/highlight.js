// 凡例の項目（国家・文化・宗教・属州）を押したとき、その境界線を赤く光らせて、しばらくして消す。
//
// 地図本体の描画（renderer）とは別の、透明なキャンバスに重ねて描く。
//   - 光らせている間も、地図は描き直さない（軽い）
//   - ドラッグやズームで地図が動いても、線は地図に付いてくる（renderer の描画のたびに描き直す）
//   - 書き出し画像（PNG/SVG）には入らない
import { byId } from "./dom.js";
import { ENTITY_KINDS } from "../core/query.js";
import { entityOutlineSegments, strokeSegments } from "../render/edges.js";

export const HIGHLIGHT_MS = 2600;
const FADE_MS = 800;       // 最後にすっと消える時間
const PULSE_MS = 650;      // 明るさの脈打ちの周期
const COLOR = "255, 38, 38";

/** 経過時間 → 明るさ(0..1)。出だしはすぐ明るく、脈打ちながら、最後は消える。純粋関数 */
export function highlightAlpha(elapsed, total = HIGHLIGHT_MS) {
  if (elapsed >= total) return 0;
  if (elapsed < 0) elapsed = 0; // 描画の時刻が押した時刻よりわずかに前になることがある。消さずに出だしとして扱う
  const rise = Math.min(1, elapsed / 120);
  const fade = Math.min(1, (total - elapsed) / FADE_MS);
  const pulse = 0.8 + 0.2 * Math.cos((elapsed / PULSE_MS) * Math.PI * 2);
  return rise * fade * pulse;
}

export function initHighlight({ store, viewport, renderer }) {
  const canvas = byId("highlight-canvas");
  const mapCanvas = byId("map-canvas");
  const ctx = canvas.getContext("2d");
  let segs = null, t0 = 0, raf = 0;

  function syncSize() {
    if (canvas.width !== mapCanvas.width) canvas.width = mapCanvas.width;
    if (canvas.height !== mapCanvas.height) canvas.height = mapCanvas.height;
  }
  const dprNow = () => window.devicePixelRatio || 1; // renderer.resize と同じ値

  function draw(now = performance.now()) {
    syncSize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!segs) return false;
    if (now - t0 >= HIGHLIGHT_MS) { segs = null; return false; }
    const a = highlightAlpha(now - t0);
    const dpr = dprNow();
    ctx.save();
    viewport.apply(ctx, dpr);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // 外側のにじみ（太く薄く）→ 芯の線（細く濃く）。太さは画面上の px で決め、拡大しても変わらない
    ctx.shadowColor = `rgba(${COLOR}, ${0.9 * a})`; ctx.shadowBlur = 14 * dpr;
    ctx.strokeStyle = `rgba(${COLOR}, ${0.35 * a})`; ctx.lineWidth = 8 / viewport.k;
    strokeSegments(ctx, segs);
    ctx.shadowBlur = 6 * dpr;
    ctx.strokeStyle = `rgba(255, 70, 60, ${a})`; ctx.lineWidth = 3 / viewport.k;
    strokeSegments(ctx, segs);
    ctx.restore();
    return true;
  }

  function tick() {
    raf = 0;
    if (draw()) raf = requestAnimationFrame(tick); // 時刻は performance.now() で統一（rAF の時刻とずれるため）
  }

  function clear() {
    segs = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    draw();
  }

  /** 実体 { kind, id } の境界線を光らせる。同じ実体をもう一度押すと、最初から光り直す */
  function show(kind, id) {
    const map = store.getState().map;
    const def = ENTITY_KINDS[kind];
    if (!map?.geometry || !def) return false;
    const s = entityOutlineSegments(map.geometry, def.cells(map), id, map.pack.cells.biome);
    if (!s.length) return false;
    segs = s; t0 = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
    return true;
  }

  // 地図が動いた（パン・ズーム・リサイズ）ときは、線も一緒に動かす
  renderer.onFrame(() => { if (segs) draw(); });
  // 別の地図を開いたら消す
  store.subscribe((_s, change) => { if (change.type === "replace") clear(); });

  return { show, clear, isActive: () => !!segs };
}
