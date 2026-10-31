// v6 UI: 地図（実データの描画）。地理の正本（world.mesh / world.cell）と国家の領域（集団の位置）を、キャンバスに描く。
//   ・UI は WorldState の正本を持たない。描画のたびに w.civ を読むだけ。地形は一度だけ作って使い回す。
//   ・レイヤー: 地形 / 国家 / 文化 / 戦争。クリックでその位置の国家を選ぶ。
const TAU = Math.PI * 2;
const hue = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 360; };
export const colorOf = (id, l = 55) => `hsl(${hue(String(id))} 50% ${l}%)`;
export function buildGeometry(world) {
  const m = world.mesh, N = m.cellCount, polys = new Array(N), cen = new Float32Array(N * 2);
  for (let c = 0; c < N; c++) {
    const a = m.cellVertexOffsets[c], b = m.cellVertexOffsets[c + 1], pts = []; let lo = 9, hi = -9;
    for (let k = a; k < b; k++) { const v = m.cellVertexIds[k] * 3, x = m.vertexXYZ[v], y = m.vertexXYZ[v + 1], z = m.vertexXYZ[v + 2], lon = Math.atan2(y, x), lat = Math.asin(Math.max(-1, Math.min(1, z))); pts.push([lon, lat]); if (lon < lo) lo = lon; if (lon > hi) hi = lon; }
    if (hi - lo > Math.PI) for (const p of pts) if (p[0] < 0) p[0] += TAU; // 日付変更線をまたぐ多角形
    polys[c] = pts; const x = m.centerXYZ[c * 3], y = m.centerXYZ[c * 3 + 1], z = m.centerXYZ[c * 3 + 2]; cen[c * 2] = Math.atan2(y, x); cen[c * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, z)));
  }
  return { polys, cen, N };
}
export class MapView {
  constructor(canvas, w) { this.cv = canvas; this.w = w; this.geo = buildGeometry(w.world); this.layer = "nation"; this.onPick = null; this.sel = null; this.base = null; canvas.addEventListener("click", (e) => this.click(e)); }
  size() { const r = this.cv.getBoundingClientRect(); const W = Math.max(320, Math.floor(r.width || 800)), H = Math.floor(W / 2); if (this.cv.width !== W) { this.cv.width = W; this.cv.height = H; this.base = null; } return [W, H]; }
  px(lon, lat, W, H) { return [((lon + Math.PI) / TAU) * W, ((Math.PI / 2 - lat) / Math.PI) * H]; }
  path(ctx, c, W, H, dx = 0) { const p = this.geo.polys[c]; ctx.beginPath(); for (let i = 0; i < p.length; i++) { const [x, y] = this.px(p[i][0], p[i][1], W, H); i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y); } ctx.closePath(); }
  fill(ctx, c, col, W, H) { ctx.fillStyle = col; this.path(ctx, c, W, H); ctx.fill(); if (this.geo.polys[c].some((q) => q[0] > Math.PI)) { this.path(ctx, c, W, H, -W); ctx.fill(); } }
  terrain(W, H) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d"); if (!ctx) return null; const ce = this.w.world.cell; let emax = 1e-6; for (let c = 0; c < this.geo.N; c++) if (ce.elevation[c] > emax) emax = ce.elevation[c]; ctx.fillStyle = "#0f1114"; ctx.fillRect(0, 0, W, H);
    for (let c = 0; c < this.geo.N; c++) { const land = ce.landWater[c] === 1 || ce.elevation[c] > 0; const e = ce.elevation[c], t = Math.max(0, Math.min(1, e / emax)); this.fill(ctx, c, land ? `hsl(${Math.round(105 - 75 * t)} 24% ${24 + Math.round(20 * t)}%)` : `hsl(210 38% 14%)`, W, H); }
    return cv;
  }
  owner() { const civ = this.w.civ, o = new Map(); for (const g of Object.values(civ.groups)) { const cells = g.cells?.length ? g.cells : [g.cell]; for (const c of cells) o.set(c, g); } return o; }
  draw() {
    const ctx = this.cv.getContext("2d"); if (!ctx) return; const [W, H] = this.size(); this.base ??= this.terrain(W, H); if (this.base) ctx.drawImage(this.base, 0, 0); const civ = this.w.civ, own = this.owner(), warring = new Set();
    for (const id of civ.activeWarIds) { const x = civ.wars[id]; for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s); }
    for (const [c, g] of own) {
      let col = null; if (this.layer === "nation" || this.layer === "war") { if (g.stateId) col = this.layer === "war" && warring.has(g.stateId) ? "rgba(208,96,90,.75)" : colorOf(g.stateId); } else if (this.layer === "culture") { const co = g.cohorts?.reduce?.((b, x) => (x.share > b.share ? x : b), { share: -1 }); if (co?.cultureId) col = colorOf(co.cultureId); }
      if (col) { ctx.globalAlpha = this.layer === "war" && !col.startsWith("rgba") ? 0.35 : 0.8; this.fill(ctx, c, col, W, H); ctx.globalAlpha = 1; }
    }
    if (this.sel) for (const [c, g] of own) if (g.stateId === this.sel) { ctx.strokeStyle = "#d8b45a"; ctx.lineWidth = 1.5; this.path(ctx, c, W, H); ctx.stroke(); }
  }
  click(e) {
    const r = this.cv.getBoundingClientRect(), [W, H] = [this.cv.width, this.cv.height], x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H, lon = (x / W) * TAU - Math.PI, lat = Math.PI / 2 - (y / H) * Math.PI; let best = -1, bd = 9;
    for (let c = 0; c < this.geo.N; c++) { let dl = Math.abs(this.geo.cen[c * 2] - lon); if (dl > Math.PI) dl = TAU - dl; const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat); if (d < bd) { bd = d; best = c; } }
    const g = this.owner().get(best); this.onPick?.({ cell: best, stateId: g?.stateId ?? null });
  }
}
