// 球面世界の描画（矩形投影）。パン・ズーム・経度の継ぎ目の繰り返し・極。
//   遠景: 画素→セルの対応表で作ったラスタ（レイヤーの切り替えは色表の更新だけ）
//   近景: 見えているセルの多角形を描く（セルが十分大きく見えるとき）
//   重ね描き: 河川・初期集団・選択・ホバー・ブラシ・経緯線
//   純粋な描画ロジック（キャンバスを受け取る。DOM のイベントは持たない）。
import { cellViewPolygon, latLonToXYZ } from "../core/world/sphere-mesh.js";
import { buildSpatialIndex, nearestCell } from "../core/world/spatial-index.js";
import { colorizeCells } from "./world-colors.js";
import { buildPixelMap, textureSizeFor } from "./pixel-map.js";

const TAU = 2 * Math.PI, HALF_PI = Math.PI / 2;
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function createSphereView({ canvas, createCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }, schedule = (fn) => requestAnimationFrame(fn), onRender = null }) {
  const ctx = canvas.getContext("2d");
  let world = null, index = null, colors = null, layer = "biome", layerOpt = {}, pixelMap = null, tex = null, texCtx = null, TW = 0, TH = 0, prepared = false;
  const view = { lon0: 0, lat0: 0, scale: 1 }; // 画面中心の経緯度（ラジアン）と、1 ラジアンあたりの画素数
  const overlay = { hoverCell: -1, selectedCell: -1, groups: [], brush: null, rivers: true, graticule: false, groupsVisible: true };
  const stats = { mode: "none", lastRenderMs: 0, visibleCells: 0, pixelMapMs: 0, colorMs: 0, texSize: "" };
  let raf = 0, abort = null;

  const W = () => canvas.width, H = () => canvas.height;
  const fitScale = () => Math.min(W() / TAU, H() / Math.PI);
  const spacingRad = () => (world ? Math.sqrt((4 * Math.PI) / world.mesh.cellCount) : 0.01);
  const maxScale = () => Math.max(fitScale() * 4, 90 / spacingRad());
  const sx = (lon) => W() / 2 + wrapPi(lon - view.lon0) * view.scale;
  const sy = (lat) => H() / 2 - (lat - view.lat0) * view.scale;
  function clampView() {
    view.scale = Math.max(fitScale(), Math.min(maxScale(), view.scale));
    view.lon0 = wrapPi(view.lon0);
    const halfLat = H() / 2 / view.scale, lim = Math.max(0, HALF_PI - halfLat);
    view.lat0 = Math.max(-lim, Math.min(lim, view.lat0));
    if (HALF_PI * 2 * view.scale <= H()) view.lat0 = 0;
  }
  const request = () => { if (raf) return; raf = schedule(() => { raf = 0; render(); }); };

  function textureFromColors() {
    if (!pixelMap || !colors) return;
    const img = texCtx.createImageData(TW, TH), d = img.data, n = TW * TH;
    for (let i = 0; i < n; i++) { const c = pixelMap[i] * 4; d[4 * i] = colors[c]; d[4 * i + 1] = colors[c + 1]; d[4 * i + 2] = colors[c + 2]; d[4 * i + 3] = 255; }
    texCtx.putImageData(img, 0, 0);
  }

  async function setWorld(w, { onProgress } = {}) {
    abort?.abort(); abort = typeof AbortController !== "undefined" ? new AbortController() : null;
    world = w; prepared = false; pixelMap = null; index = null; colors = null; overlay.hoverCell = -1; overlay.selectedCell = -1; overlay.groups = [];
    if (!w) { stats.mode = "none"; request(); return; }
    let t = performance.now(); index = buildSpatialIndex(w.mesh); stats.indexMs = Math.round(performance.now() - t);
    t = performance.now(); colors = colorizeCells(w, layer, layerOpt); stats.colorMs = Math.round(performance.now() - t);
    const { W: tw, H: th } = textureSizeFor(w.mesh.cellCount); TW = tw; TH = th; tex = createCanvas(TW, TH); texCtx = tex.getContext("2d"); stats.texSize = `${TW}×${TH}`;
    view.lon0 = 0; view.lat0 = 0; view.scale = fitScale(); clampView();
    t = performance.now();
    const myAbort = abort;
    pixelMap = await buildPixelMap(w.mesh, TW, TH, { onProgress, signal: myAbort?.signal });
    if (world !== w) return; // 途中で別の世界に替わった
    stats.pixelMapMs = Math.round(performance.now() - t); textureFromColors(); prepared = true; request();
  }
  function setLayer(l, opt = {}) {
    layer = l; layerOpt = opt; if (!world) return;
    const t = performance.now(); colors = colorizeCells(world, layer, layerOpt, colors); textureFromColors(); stats.colorMs = Math.round(performance.now() - t); request();
  }
  /** 編集後の更新: dirty（セル番号）の色だけ作り直す */
  function refresh(dirty) { if (!world) return; colorizeCells(world, layer, layerOpt, colors, dirty); textureFromColors(); request(); }

  // ---- 画面座標 ⇄ 世界 ----
  function latLonAt(px, py) { return { lat: Math.max(-HALF_PI, Math.min(HALF_PI, view.lat0 - (py - H() / 2) / view.scale)), lon: wrapPi(view.lon0 + (px - W() / 2) / view.scale) }; }
  function cellAt(px, py) { if (!world || !index) return -1; const { lat, lon } = latLonAt(px, py); if (Math.abs(view.lat0 - (py - H() / 2) / view.scale) > HALF_PI) return -1; const [x, y, z] = latLonToXYZ(lat, lon); return nearestCell(index, x, y, z); }
  function screenOfCell(c) { const lat = world.cell.lat[c], lon = world.cell.lon[c]; return { x: sx(lon), y: sy(lat) }; }

  // ---- 操作 ----
  function zoomAt(px, py, factor) { const before = latLonAt(px, py); view.scale *= factor; clampView(); const after = latLonAt(px, py); view.lon0 = wrapPi(view.lon0 + (before.lon - after.lon)); view.lat0 += before.lat - after.lat; clampView(); request(); }
  function panBy(dx, dy) { view.lon0 -= dx / view.scale; view.lat0 += dy / view.scale; clampView(); request(); }
  function fit() { view.lon0 = 0; view.lat0 = 0; view.scale = fitScale(); clampView(); request(); }
  function centerOn(lat, lon, scale) { view.lat0 = lat; view.lon0 = lon; if (scale) view.scale = scale; clampView(); request(); }
  function resize() { clampView(); request(); }

  // ---- 描画 ----
  // セルが十分大きく見え（6 画素以上）、かつ見えるセルが多すぎない（約 4.5 万以下）ときだけ、多角形で描く
  const vectorWanted = () => { if (!world || view.scale * spacingRad() < 6) return false; const areaRad2 = (W() / view.scale) * (H() / view.scale); return areaRad2 / (4 * Math.PI / world.mesh.cellCount) <= 45000; };
  function drawRaster() {
    ctx.imageSmoothingEnabled = view.scale < fitScale() * 6;
    const w = TAU * view.scale, h = Math.PI * view.scale, y0 = H() / 2 - (HALF_PI - view.lat0) * view.scale;
    for (let k = -1; k <= 1; k++) { const x0 = W() / 2 + (-Math.PI - view.lon0 + k * TAU) * view.scale; if (x0 > W() || x0 + w < 0) continue; ctx.drawImage(tex, x0, y0, w, h); }
  }
  function visibleCells() {
    const cell = world.cell, V = world.mesh.cellCount, sp = spacingRad() * 2, latSpan = H() / 2 / view.scale + sp, lonSpan = W() / 2 / view.scale, out = [];
    for (let c = 0; c < V; c++) {
      if (Math.abs(cell.lat[c] - view.lat0) > latSpan) continue;
      const cl = Math.max(0.05, Math.cos(cell.lat[c])), lim = lonSpan + sp / cl;
      if (lim < Math.PI && Math.abs(wrapPi(cell.lon[c] - view.lon0)) > lim) continue;
      out.push(c);
    }
    return out;
  }
  function polyPath(c, k) {
    const p = cellViewPolygon(world.mesh, c), n = p.lon.length, off = k * TAU;
    ctx.moveTo(W() / 2 + (p.lon[0] - view.lon0 + off) * view.scale, sy(p.lat[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(W() / 2 + (p.lon[i] - view.lon0 + off) * view.scale, sy(p.lat[i]));
    if (p.wrapsPole) { const pl = p.poleSign > 0 ? HALF_PI : -HALF_PI; ctx.lineTo(W() / 2 + (p.lon[n - 1] - view.lon0 + off) * view.scale, sy(pl)); ctx.lineTo(W() / 2 + (p.lon[0] - view.lon0 + off) * view.scale, sy(pl)); }
    ctx.closePath();
  }
  function drawVector() {
    const list = visibleCells(); stats.visibleCells = list.length;
    // 継ぎ目の両側で描く（経度を 0・+2π・−2π ずらした 3 通りのうち、画面にかかるもの）
    for (const c of list) {
      const r = colors[4 * c], g = colors[4 * c + 1], b = colors[4 * c + 2], p = cellViewPolygon(world.mesh, c);
      let lo = 1e9, hi = -1e9; for (let i = 0; i < p.lon.length; i++) { lo = Math.min(lo, p.lon[i]); hi = Math.max(hi, p.lon[i]); }
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.strokeStyle = ctx.fillStyle;
      for (let k = -1; k <= 1; k++) { const xl = W() / 2 + (lo - view.lon0 + k * TAU) * view.scale, xh = W() / 2 + (hi - view.lon0 + k * TAU) * view.scale; if (xh < 0 || xl > W()) continue; ctx.beginPath(); polyPath(c, k); ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke(); }
    }
  }
  function drawRivers() {
    const cell = world.cell, V = world.mesh.cellCount, lat = cell.lat, lon = cell.lon, sp = spacingRad() * 2, latSpan = H() / 2 / view.scale + sp, lonSpan = W() / 2 / view.scale + sp * 3;
    ctx.beginPath(); let n = 0;
    for (let c = 0; c < V; c++) {
      if (!cell.river[c]) continue; const p = cell.riverTo[c]; if (p < 0) continue;
      if (Math.abs(lat[c] - view.lat0) > latSpan) continue;
      const dl = wrapPi(lon[c] - view.lon0); if (lonSpan < Math.PI && Math.abs(dl) > lonSpan) continue;
      const dl2 = wrapPi(lon[p] - lon[c]); const x1 = W() / 2 + dl * view.scale, y1 = sy(lat[c]), x2 = x1 + dl2 * view.scale, y2 = sy(lat[p]);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); n++;
    }
    const flow = Math.min(2.4, Math.max(0.8, view.scale * spacingRad() * 0.18));
    ctx.strokeStyle = "rgba(40,100,230,0.95)"; ctx.lineWidth = flow; ctx.lineCap = "round"; ctx.stroke(); stats.riverSegments = n;
  }
  function drawGraticule() {
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let la = -60; la <= 60; la += 30) { const y = sy(la * Math.PI / 180); ctx.moveTo(0, y); ctx.lineTo(W(), y); }
    for (let lo = -180; lo < 180; lo += 30) for (let k = -1; k <= 1; k++) { const x = W() / 2 + (lo * Math.PI / 180 - view.lon0 + k * TAU) * view.scale; if (x < 0 || x > W()) continue; ctx.moveTo(x, 0); ctx.lineTo(x, H()); }
    ctx.stroke();
  }
  function drawCellOutline(c, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    for (let k = -1; k <= 1; k++) { const p = screenOfCell(c), x = p.x + k * TAU * view.scale; if (x < -50 || x > W() + 50) continue; ctx.beginPath(); polyPath(c, k); ctx.stroke(); }
  }
  function drawBrush(b) {
    // 中心から半径 r km の円（大円上の距離）。各方位の点を球面上で求めて投影する
    const R = world.spec.planet.radiusKm, rr = b.radiusKm / R, lat = world.cell.lat[b.center], lon = world.cell.lon[b.center]; ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU, la = Math.asin(Math.sin(lat) * Math.cos(rr) + Math.cos(lat) * Math.sin(rr) * Math.cos(a)), lo = lon + Math.atan2(Math.sin(a) * Math.sin(rr) * Math.cos(lat), Math.cos(rr) - Math.sin(lat) * Math.sin(la));
      const x = sx(lo), y = sy(la); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = b.color ?? "rgba(255,255,255,0.95)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke(); ctx.setLineDash([]);
  }
  function drawGroups() {
    ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const g of overlay.groups) {
      const p = screenOfCell(g.cell); for (let k = -1; k <= 1; k++) {
        const x = p.x + k * TAU * view.scale, y = p.y; if (x < -20 || x > W() + 20 || y < -20 || y > H() + 20) continue;
        ctx.beginPath(); ctx.arc(x, y, g.selected ? 12 : 9, 0, TAU); ctx.fillStyle = g.selected ? "#ffd24a" : "rgba(20,30,40,0.85)"; ctx.fill(); ctx.lineWidth = g.selected ? 3 : 2; ctx.strokeStyle = g.selected ? "#ffffff" : "#ffd24a"; ctx.stroke();
        ctx.fillStyle = g.selected ? "#1b1b1b" : "#ffd24a"; ctx.fillText(String(g.id), x, y + 0.5);
      }
    }
  }
  function render() {
    const t0 = performance.now(); ctx.fillStyle = "#0a1a33"; ctx.fillRect(0, 0, W(), H());
    if (!world) { stats.mode = "none"; return; }
    if (vectorWanted()) { stats.mode = "vector"; drawVector(); } else if (prepared) { stats.mode = "raster"; drawRaster(); stats.visibleCells = 0; } else { stats.mode = "preparing"; }
    if (overlay.graticule) drawGraticule();
    if (overlay.rivers && prepared && world.cell.river) drawRivers();
    if (overlay.selectedCell >= 0) drawCellOutline(overlay.selectedCell, "#ffffff", 2);
    if (overlay.hoverCell >= 0) drawCellOutline(overlay.hoverCell, "rgba(255,255,255,0.8)", 1.5);
    if (overlay.brush) drawBrush(overlay.brush);
    if (overlay.groupsVisible && overlay.groups.length) drawGroups();
    stats.lastRenderMs = Math.round((performance.now() - t0) * 10) / 10;
    onRender?.(stats);
  }

  return {
    setWorld, setLayer, refresh, resize, fit, zoomAt, panBy, centerOn, cellAt, latLonAt, screenOfCell, render, request,
    setOverlay(patch) { Object.assign(overlay, patch); request(); },
    get view() { return { ...view }; }, get stats() { return { ...stats }; }, get world() { return world; }, get ready() { return prepared; }, get layer() { return layer; },
    renderNow() { raf = 0; render(); },
    dispose() { abort?.abort(); world = null; },
  };
}
