import { byId } from "./dom.js";
import { ENTITY_KINDS } from "../core/query.js";
import { entityOutlineSegments, strokeSegments } from "../render/edges.js";
import { addCellPath } from "../render/layers/terrain.js";

export const HIGHLIGHT_MS = 2600;
const FADE_MS = 800;
const PULSE_MS = 650;
const COLOR = "255, 38, 38";
export function highlightAlpha(elapsed, total = HIGHLIGHT_MS) {
  if (elapsed >= total) return 0;
  if (elapsed < 0) elapsed = 0;
  const rise = Math.min(1, elapsed / 120);
  const fade = Math.min(1, (total - elapsed) / FADE_MS);
  const pulse = 0.8 + 0.2 * Math.cos(elapsed / PULSE_MS * Math.PI * 2);
  return rise * fade * pulse;
}
export function initHighlight({ store, viewport, renderer }) {
  const canvas = byId("highlight-canvas");
  const mapCanvas = byId("map-canvas");
  const ctx = canvas.getContext("2d");
  let segs = null, t0 = 0, raf = 0;
  let overlay = null;
  function syncSize() {
    if (canvas.width !== mapCanvas.width) canvas.width = mapCanvas.width;
    if (canvas.height !== mapCanvas.height) canvas.height = mapCanvas.height;
  }
  const dprNow = () => window.devicePixelRatio || 1;
  function drawOverlay(now) {
    const map = store.getState().map;
    if (!overlay || !map?.geometry) return;
    const { cells, vertices } = map.geometry.pack, dpr = dprNow();
    ctx.save();
    viewport.apply(ctx, dpr);
    const pulse = 0.5 + 0.5 * Math.cos(now / PULSE_MS * Math.PI * 2);
    for (const it of overlay.items) {
      ctx.fillStyle = `rgba(${COLOR}, ${it.strong ? 0.38 + 0.2 * pulse : 0.24})`;
      ctx.beginPath();
      for (const i of it.cells) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const it of overlay.items) {
      ctx.shadowColor = `rgba(${COLOR}, 0.9)`;
      ctx.shadowBlur = (it.strong ? 14 : 8) * dpr;
      ctx.strokeStyle = `rgba(255, 70, 60, ${it.strong ? 1 : 0.8})`;
      ctx.lineWidth = (it.strong ? 3.5 : 2.2) / viewport.k;
      strokeSegments(ctx, it.segs);
    }
    ctx.restore();
  }
  const overlayAnimated = () => !!overlay?.items.some((it) => it.strong);
  function draw(now = performance.now()) {
    syncSize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (overlay) drawOverlay(now);
    if (!segs) return overlayAnimated();
    if (now - t0 >= HIGHLIGHT_MS) {
      segs = null;
      return overlayAnimated();
    }
    const a = highlightAlpha(now - t0);
    const dpr = dprNow();
    ctx.save();
    viewport.apply(ctx, dpr);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = `rgba(${COLOR}, ${0.9 * a})`;
    ctx.shadowBlur = 14 * dpr;
    ctx.strokeStyle = `rgba(${COLOR}, ${0.35 * a})`;
    ctx.lineWidth = 8 / viewport.k;
    strokeSegments(ctx, segs);
    ctx.shadowBlur = 6 * dpr;
    ctx.strokeStyle = `rgba(255, 70, 60, ${a})`;
    ctx.lineWidth = 3 / viewport.k;
    strokeSegments(ctx, segs);
    ctx.restore();
    return true;
  }
  function tick() {
    raf = 0;
    if (draw()) raf = requestAnimationFrame(tick);
  }
  function clear() {
    segs = null;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    draw();
  }
  function showCells(groups) {
    const map = store.getState().map;
    if (!groups?.length || !map?.geometry) {
      clearCells();
      return;
    }
    const n = map.pack.cells.biome.length;
    overlay = { items: groups.filter((g) => g.cells?.length).map((g) => {
      const mark = new Uint8Array(n);
      for (const i of g.cells) mark[i] = 1;
      return { cells: g.cells, strong: !!g.strong, segs: entityOutlineSegments(map.geometry, mark, 1, map.pack.cells.biome) };
    }) };
    if (!overlay.items.length) overlay = null;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function clearCells() {
    overlay = null;
    if (!segs && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    draw();
  }
  function show(kind, id) {
    const map = store.getState().map;
    const def = ENTITY_KINDS[kind];
    if (!map?.geometry || !def) return false;
    const s = entityOutlineSegments(map.geometry, def.cells(map), id, map.pack.cells.biome);
    if (!s.length) return false;
    segs = s;
    t0 = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
    return true;
  }
  renderer.onFrame(() => {
    if (segs || overlay) draw();
  });
  store.subscribe((_s, change) => {
    if (change.type === "replace") {
      clear();
      overlay = null;
    }
  });
  return { show, clear, showCells, clearCells, isActive: () => !!segs || !!overlay };
}
