// v6 UI: 地図（実データの描画）。レイヤーは「塗り（地形・国家・文化・言語・宗教・人口・気候）」を 1 つと、「重ね（国境線・戦争・都市）」を複数、同時に表示できる。
//   ・地図の描画用データは WorldState から都度導出する。正本は持たない。
//   ・色相だけに頼らない: 国境線（実線）・交戦国（赤の破線の縁取り）・都市（点）を重ねる。凡例は選んだ層の実データから作る。
import { colorOf, polityJa } from "./common.js";
const TAU = Math.PI * 2;
export const FILLS = [["none", "地形のみ"], ["nation", "国家"], ["culture", "文化"], ["language", "言語"], ["religion", "宗教"], ["population", "人口"], ["climate", "気候（気温）"]];
export const OVERLAYS = [["borders", "国境線"], ["war", "戦争"], ["cities", "都市"]];
export function buildGeometry(world) {
  const m = world.mesh, N = m.cellCount, polys = new Array(N), cen = new Float32Array(N * 2);
  for (let c = 0; c < N; c++) {
    const a = m.cellVertexOffsets[c], b = m.cellVertexOffsets[c + 1], pts = []; let lo = 9, hi = -9;
    for (let k = a; k < b; k++) { const v = m.cellVertexIds[k] * 3, x = m.vertexXYZ[v], y = m.vertexXYZ[v + 1], z = m.vertexXYZ[v + 2], lon = Math.atan2(y, x), lat = Math.asin(Math.max(-1, Math.min(1, z))); pts.push([lon, lat, m.cellVertexIds[k]]); if (lon < lo) lo = lon; if (lon > hi) hi = lon; }
    if (hi - lo > Math.PI) for (const p of pts) if (p[0] < 0) p[0] += TAU;
    polys[c] = pts; const x = m.centerXYZ[c * 3], y = m.centerXYZ[c * 3 + 1], z = m.centerXYZ[c * 3 + 2]; cen[c * 2] = Math.atan2(y, x); cen[c * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, z)));
  }
  return { polys, cen, N };
}
const dominant = (g, key) => g.cohorts?.reduce?.((b, x) => (x.share > b.share ? x : b), { share: -1 })?.[key] ?? null;
export class MapView {
  constructor(canvas, w) { this.cv = canvas; this.w = w; this.geo = buildGeometry(w.world); this.fillLayer = "nation"; this.overlays = new Set(["borders", "cities"]); this.onPick = null; this.sel = null; this.base = null; this.view = { x: 0, y: 0, k: 1 }; this._own = null; this._ownAt = -1; canvas.addEventListener("click", (e) => { if (!this.moved) this.click(e); }); this.pan(); if (typeof ResizeObserver !== "undefined" && canvas.parentElement) new ResizeObserver(() => this.draw()).observe(canvas.parentElement); }
  pan() {
    const cv = this.cv; let drag = null; this.moved = false;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.moved = false; });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true; if (this.moved) { this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; this.clamp(); this.draw(); } });
    const up = () => { drag = null; setTimeout(() => (this.moved = false), 0); }; cv.addEventListener("pointerup", up); cv.addEventListener("pointerleave", up);
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = this.view.k, k1 = Math.max(1, Math.min(12, k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.view.x = mx - ((mx - this.view.x) / k0) * k1; this.view.y = my - ((my - this.view.y) / k0) * k1; this.view.k = k1; this.clamp(); this.draw(); }, { passive: false });
  }
  clamp() { const v = this.view, W = this.cv.width, H = this.cv.height; v.x = Math.min(0, Math.max(W - W * v.k, v.x)); v.y = Math.min(0, Math.max(H - H * v.k, v.y)); }
  size() { const host = this.cv.parentElement, W = Math.max(480, Math.floor(host?.clientWidth || this.cv.getBoundingClientRect().width || 900)), H = Math.floor(W / 2); if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.base = null; this.clamp(); } return [W, H]; }
  proj(lon, lat, W, H) { return [((lon + Math.PI) / TAU) * W, ((Math.PI / 2 - lat) / Math.PI) * H]; }
  path(ctx, c, W, H, dx = 0) { const p = this.geo.polys[c]; ctx.beginPath(); for (let i = 0; i < p.length; i++) { const [x, y] = this.proj(p[i][0], p[i][1], W, H); i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y); } ctx.closePath(); }
  fill(ctx, c, col, W, H) { ctx.fillStyle = col; this.path(ctx, c, W, H); ctx.fill(); if (this.geo.polys[c].some((q) => q[0] > Math.PI)) { this.path(ctx, c, W, H, -W); ctx.fill(); } }
  terrain(W, H) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d"); if (!ctx) return null; const ce = this.w.world.cell; let emax = 1e-6; for (let c = 0; c < this.geo.N; c++) if (ce.elevation[c] > emax) emax = ce.elevation[c]; ctx.fillStyle = "#0f1114"; ctx.fillRect(0, 0, W, H);
    for (let c = 0; c < this.geo.N; c++) { const land = ce.landWater[c] === 1 || ce.elevation[c] > 0, t = Math.max(0, Math.min(1, ce.elevation[c] / emax)); this.fill(ctx, c, land ? `hsl(${Math.round(105 - 75 * t)} 24% ${24 + Math.round(20 * t)}%)` : "hsl(210 38% 14%)", W, H); }
    return cv;
  }
  owner() { const civ = this.w.civ; if (this._own && this._ownAt === civ.monthIndex) return this._own; const o = new Map(); for (const g of Object.values(civ.groups)) { const cells = g.cells?.length ? g.cells : [g.cell]; for (const c of cells) o.set(c, g); } this._own = o; this._ownAt = civ.monthIndex; return o; }
  fillColor(g, maxPop) {
    const civ = this.w.civ, L = this.fillLayer;
    if (L === "nation") return g.stateId ? colorOf(g.stateId) : null; if (L === "culture") { const id = dominant(g, "cultureId"); return id ? colorOf(id) : null; } if (L === "language") { const id = dominant(g, "languageId"); return id ? colorOf(id, 52) : null; } if (L === "religion") { const id = dominant(g, "religionId"); return id ? colorOf(id, 60) : null; }
    if (L === "population") { const t = Math.min(1, Math.log1p(g.pop) / Math.log1p(maxPop)); return `hsl(${Math.round(210 - 190 * t)} 55% ${28 + Math.round(26 * t)}%)`; } return null;
  }
  /** 凡例: 選んだ層の実データから（上位のみ） */
  legend(key) {
    const civ = this.w.civ, own = this.owner(), cnt = new Map(), add = (id, n) => id && cnt.set(id, (cnt.get(id) ?? 0) + n);
    if (key === "nation") for (const g of own.values()) add(g.stateId, 1); else if (key === "culture") for (const g of own.values()) add(dominant(g, "cultureId"), 1); else if (key === "language") for (const g of own.values()) add(dominant(g, "languageId"), 1); else if (key === "religion") for (const g of own.values()) add(dominant(g, "religionId"), 1);
    if (["nation", "culture", "language", "religion"].includes(key)) { const tab = { nation: civ.states, culture: civ.cultures, language: civ.languages, religion: civ.religions }[key]; return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ c: colorOf(id, key === "language" ? 52 : key === "religion" ? 60 : 56), t: `${tab[id]?.name ?? id}（${n} 区画）` })); }
    if (key === "population") return [{ c: "hsl(210 55% 30%)", t: "少ない" }, { c: "hsl(115 55% 42%)", t: "中程度" }, { c: "hsl(20 55% 54%)", t: "多い（対数の階調）" }];
    if (key === "borders") return [{ line: "#e8e2d0", t: "国境（実線）" }]; if (key === "war") return [{ dash: "#d0605a", t: "交戦国の縁取り（赤の破線）" }]; if (key === "cities") return [{ dot: "#f2d27a", t: "都市・集落（点）" }];
    if (key === "none") return [{ c: "hsl(105 24% 24%)", t: "低地" }, { c: "hsl(30 24% 44%)", t: "高地" }, { c: "hsl(210 38% 14%)", t: "海" }]; if (key === "climate") return [{ c: "hsl(220 60% 45%)", t: "寒冷" }, { c: "hsl(120 50% 40%)", t: "温暖" }, { c: "hsl(10 65% 50%)", t: "高温" }]; return [];
  }
  draw() {
    const ctx = this.cv.getContext("2d"); if (!ctx) return; const [W, H] = this.size(); this.base ??= this.terrain(W, H); const v = this.view; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y); if (this.base) ctx.drawImage(this.base, 0, 0);
    const civ = this.w.civ, own = this.owner(), ce = this.w.world.cell; let maxPop = 1; for (const g of own.values()) if (g.pop > maxPop) maxPop = g.pop;
    if (this.fillLayer === "climate") { let lo = 1e9, hi = -1e9; for (let c = 0; c < this.geo.N; c++) { const t = ce.temp[c]; if (t < lo) lo = t; if (t > hi) hi = t; } ctx.globalAlpha = 0.6; for (let c = 0; c < this.geo.N; c++) if (ce.landWater[c] === 1 || ce.elevation[c] > 0) { const t = (ce.temp[c] - lo) / (hi - lo || 1); this.fill(ctx, c, `hsl(${Math.round(220 - 220 * t)} 55% 45%)`, W, H); } ctx.globalAlpha = 1; }
    else if (this.fillLayer !== "none") { ctx.globalAlpha = 0.8; for (const [c, g] of own) { const col = this.fillColor(g, maxPop); if (col) this.fill(ctx, c, col, W, H); } ctx.globalAlpha = 1; }
    const warring = new Set(); for (const id of civ.activeWarIds) { const x = civ.wars[id]; for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s); }
    const nb = this.w.world.mesh; ctx.lineJoin = "round";
    if (this.overlays.has("borders") || this.overlays.has("war")) {
      ctx.strokeStyle = "#e8e2d0"; ctx.lineWidth = 1.4 / v.k; const edge = (c, n) => { const a = this.geo.polys[c], b = new Set(this.geo.polys[n].map((p) => p[2])), sh = a.filter((p) => b.has(p[2])); if (sh.length < 2) return; const [x1, y1] = this.proj(sh[0][0], sh[0][1], W, H), [x2, y2] = this.proj(sh[1][0], sh[1][1], W, H); if (Math.abs(x1 - x2) > W / 2) return; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      if (this.overlays.has("borders")) for (const [c, g] of own) for (let k = nb.neighborOffsets[c]; k < nb.neighborOffsets[c + 1]; k++) { const n = nb.neighborIds[k], o = own.get(n); if (g.stateId && (!o || o.stateId !== g.stateId) && c < n + 1e9) edge(c, n); }
      if (this.overlays.has("war")) { ctx.strokeStyle = "#d0605a"; ctx.lineWidth = 2.2 / v.k; ctx.setLineDash([5 / v.k, 3 / v.k]); for (const [c, g] of own) if (g.stateId && warring.has(g.stateId)) for (let k = nb.neighborOffsets[c]; k < nb.neighborOffsets[c + 1]; k++) { const n = nb.neighborIds[k], o = own.get(n); if (!o || o.stateId !== g.stateId) edge(c, n); } ctx.setLineDash([]); }
    }
    if (this.overlays.has("cities")) { ctx.fillStyle = "#f2d27a"; ctx.strokeStyle = "#14161a"; ctx.lineWidth = 1 / v.k; for (const s of Object.values(civ.settlements)) { if (s.pop < 800) continue; const [x, y] = this.proj(this.geo.cen[s.cell * 2], this.geo.cen[s.cell * 2 + 1], W, H); ctx.beginPath(); ctx.arc(x, y, (s.stage === "city" ? 3.2 : 2) / Math.sqrt(v.k), 0, TAU); ctx.fill(); ctx.stroke(); } }
    if (this.sel) { ctx.strokeStyle = "#d8b45a"; ctx.lineWidth = 2 / v.k; for (const [c, g] of own) if (g.stateId === this.sel) { this.path(ctx, c, W, H); ctx.stroke(); } }
  }
  click(e) {
    const r = this.cv.getBoundingClientRect(), v = this.view, x = (((e.clientX - r.left) * (this.cv.width / r.width)) - v.x) / v.k, y = (((e.clientY - r.top) * (this.cv.height / r.height)) - v.y) / v.k, W = this.cv.width, H = this.cv.height, lon = (x / W) * TAU - Math.PI, lat = Math.PI / 2 - (y / H) * Math.PI; let best = -1, bd = 9;
    for (let c = 0; c < this.geo.N; c++) { let dl = Math.abs(this.geo.cen[c * 2] - lon); if (dl > Math.PI) dl = TAU - dl; const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat); if (d < bd) { bd = d; best = c; } }
    const g = this.owner().get(best), st = Object.values(this.w.civ.settlements).find((s) => s.cell === best); this.onPick?.({ cell: best, stateId: g?.stateId ?? null, group: g ?? null, settlement: st ?? null, x: e.clientX - r.left, y: e.clientY - r.top });
  }
}
export { polityJa };
