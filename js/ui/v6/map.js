// v6 UI: 地図（実データの描画）。レイヤーは Azgaar 方式: 各レイヤーを独立に ON/OFF でき、決まった重なり順で積み重なる。よく使う組み合わせはプリセットで切り替える。
//   ・地図の描画用データは WorldState から都度導出する。正本は持たない。
//   ・色相だけに頼らない: 国境線（実線）・交戦国（赤の破線の縁取り）・都市（点）・陰影を重ねる。凡例は選んだ層の実データから作る。
//   ・軽さ: 地形・気候の層と陰影は、見ている範囲が変わったときだけ描き直して画像として持つ。ドラッグ・ズームの最中は画像を動かすだけにして、止まってから描き直す。
import { colorOf, polityJa, assignColors, resetColors, hasColor } from "./common.js";
import { pastView } from "../../core/civ/archive.js";
import { Geo, RAMPS, BIOME_COLORS, BIOME_JA, LAND_BASE, LAKE_COLOR, hillshade, reliefMarks, drawMarks, riverPaths, textureTile, clamp } from "./terrain.js";
const TAU = Math.PI * 2;

/** レイヤー: [id, 表示名, 区分]。配列の順が重なり順（下から上）。 */
export const LAYERS = [
  ["heightmap", "標高", "ground"], ["biomes", "バイオーム", "ground"], ["temperature", "気温", "ground"], ["precipitation", "降水", "ground"],
  ["population", "人口", "social"], ["religions", "宗教", "social"], ["cultures", "文化", "social"], ["languages", "言語", "social"], ["states", "国家", "social"],
  ["relief", "陰影・山岳", "mark"], ["rivers", "河川", "line"], ["borders", "国境線", "line"], ["routes", "交易路", "line"], ["war", "戦争（交戦国の縁）", "line"], ["fronts", "戦線・占領", "line"],
  ["cities", "都市", "mark"], ["labels", "国名", "mark"], ["grid", "経緯線", "line"], ["cells", "区画線", "line"],
];
export const GROUPS = [["ground", "地形・気候", "GROUND"], ["social", "社会", "SOCIETY"], ["mark", "記号・文字", "MARK"], ["line", "線", "LINE"]];
export const FILL_IDS = LAYERS.filter(([, , g]) => g === "ground" || g === "social").map(([id]) => id);
/** プリセット: [id, 表示名, レイヤー] */
/** 初期に表示する層（v6.3.0 でプリセットは廃止。層は個別に切り替える） */
export const DEFAULT_LAYERS = ["states", "relief", "rivers", "borders", "cities", "labels"];
export const DEFAULT_ALPHA = { heightmap: 1, biomes: 1, temperature: 0.8, precipitation: 0.8, population: 0.85, religions: 0.66, cultures: 0.66, languages: 0.66, states: 0.66 };
const SEA_DEEP = RAMPS.sea(5200), mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

export function buildGeometry(world) { // 互換用（形状の読み取り専用）。描画は Geo を使う
  const g = new Geo(world.mesh); return { cen: g.cen, N: g.N, geo: g };
}
const dominant = (g, key) => g.cohorts?.reduce?.((b, x) => (x.share > b.share ? x : b), { share: -1 })?.[key] ?? null;
const idOf = { states: (g) => g.stateId ?? null, cultures: (g) => dominant(g, "cultureId"), languages: (g) => dominant(g, "languageId"), religions: (g) => dominant(g, "religionId") };

export class MapView {
  constructor(canvas, w) {
    this.cv = canvas; this.w = w; this.geo = new Geo(w.world.mesh); this.layers = new Set(DEFAULT_LAYERS); this.alpha = { ...DEFAULT_ALPHA }; this.onPick = null; this.sel = null;
    this.view = { x: 0, y: 0, k: 1 }; this._own = null; this._ownAt = -1; this._idc = {}; this.gc = null; this.rc = null; this.frame = null; this.frameView = null; this.T = null; this.wKey = 0; resetColors();
    canvas.addEventListener("click", (e) => { if (!this.moved) this.click(e); }); this.pan();
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
  }
  /* ---------- レイヤーの操作 ---------- */
  isOn(id) { return this.layers.has(id); }
  toggle(id) { this.layers.has(id) ? this.layers.delete(id) : this.layers.add(id); }
  /** 凡例に出す層: 塗りのうち、いちばん上にあるもの（なければ陸地の凡例） */

  /* ---------- 操作（ドラッグ・ズーム）: 動かす間は画像を動かすだけ。止まったら描き直す ---------- */
  pan() {
    const cv = this.cv; let drag = null; this.moved = false;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.moved = false; });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true; if (this.moved) { this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; this.clamp(); this.interact(); } });
    const up = () => { drag = null; setTimeout(() => (this.moved = false), 0); }; cv.addEventListener("pointerup", up); cv.addEventListener("pointerleave", up);
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = this.view.k, k1 = clamp(k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 16); this.view.x = mx - ((mx - this.view.x) / k0) * k1; this.view.y = my - ((my - this.view.y) / k0) * k1; this.view.k = k1; this.clamp(); this.interact(); }, { passive: false });
  }
  clamp() { const v = this.view, W = this.cv.width, H = this.cv.height; v.x = Math.min(0, Math.max(W - W * v.k, v.x)); v.y = Math.min(0, Math.max(H - H * v.k, v.y)); }
  interact() { if (!this.fastDraw()) { this.draw(); return; } clearTimeout(this._it); this._it = setTimeout(() => this.draw(), 110); }
  fastDraw() {
    const ctx = this.cv.getContext("2d"); if (!ctx || !this.frame || !this.frameView) return false; const v = this.view, f = this.frameView, r = v.k / f.k, W = this.cv.width, H = this.cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = SEA_DEEP; ctx.fillRect(0, 0, W, H); ctx.setTransform(r, 0, 0, r, v.x - f.x * r, v.y - f.y * r); ctx.drawImage(this.frame, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0); return true;
  }
  size() { const host = this.cv.parentElement, W = Math.max(480, Math.floor(host?.clientWidth || this.cv.getBoundingClientRect().width || 900)), H = Math.max(300, Math.floor(host?.clientHeight || W / 2)); /* v6.3.1: 上下の黒帯をなくすため、地図を画面の高さいっぱいに引き伸ばす（球面の等距円筒図。ズームの下限は 1 のまま） */ if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.clamp(); } return [W, H]; }
  proj(lon, lat, W, H) { return [((lon + Math.PI) / TAU) * W, ((Math.PI / 2 - lat) / Math.PI) * H]; }

  /* ---------- 世界の地形から 1 回だけ作るもの ---------- */
  terr() {
    if (this.T) return this.T; const ce = this.w.world.cell, N = this.geo.N, m = this.geo.mesh, off = m.neighborOffsets, nb = m.neighborIds, isSea = new Uint8Array(N), el = ce.elevation;
    for (let c = 0; c < N; c++) isSea[c] = ce.landWater[c] === 0 || el[c] <= 0 ? 1 : 0;
    const smooth = (want) => { const o = new Float32Array(N); for (let c = 0; c < N; c++) { if (!!isSea[c] !== want) continue; let s = el[c] * 2, n = 2; for (let k = off[c]; k < off[c + 1]; k++) if (!!isSea[nb[k]] === want) { s += el[nb[k]]; n++; } o[c] = s / n; } return o; };
    let seaS = smooth(true); for (let i = 0; i < 3; i++) { const prev = seaS; seaS = new Float32Array(N); for (let c = 0; c < N; c++) { if (!isSea[c]) continue; let s = prev[c] * 2, n = 2; for (let k = off[c]; k < off[c + 1]; k++) if (isSea[nb[k]]) { s += prev[nb[k]]; n++; } seaS[c] = s / n; } }
    this.T = { isSea, elS: smooth(false), seaS, shade: hillshade(this.geo, el, isSea), col: {} }; return this.T;
  }
  /** 画面の幅が変わったときだけ、形状まわりのキャッシュを作り直す */
  ensureGeo(W, H) {
    const T = this.terr(); if (this.wKey === W) return; this.wKey = W; this.geo.build(W, H); this.cp = this.geo.paths(T.isSea); T.marks = reliefMarks(this.geo, this.w.world.cell, T.isSea);
    const ce = this.w.world.cell, g = this.geo; T.coast = g.edgesWhere((c, n) => !T.isSea[c] && T.isSea[n]); T.lakeEdge = g.edgesWhere((c, n) => ce.landWater[c] !== 2 && !T.isSea[c] && ce.landWater[n] === 2);
    T.cellsP = null; T.rivers = riverPaths(g, ce, T.isSea); T.grid = null; this.gc = this.rc = this.frame = null; this._labelsAt = -1;
    T.tex = null; try { const t = textureTile(mkCanvas); T.tex = t && this.cv.getContext("2d")?.createPattern(t, "repeat"); } catch { T.tex = null; }
  }
  cellColors(id) {
    const T = this.T, ce = this.w.world.cell, N = this.geo.N; if (T.col[id]) return T.col[id]; const a = new Array(N).fill(null);
    for (let c = 0; c < N; c++) {
      if (T.isSea[c]) continue; if (ce.landWater[c] === 2) { a[c] = LAKE_COLOR; continue; }
      if (id === "heightmap") a[c] = RAMPS.land(T.elS[c]); else if (id === "biomes") a[c] = BIOME_COLORS[ce.biome[c]] ?? LAND_BASE; else if (id === "temperature") a[c] = RAMPS.temp(ce.temp[c]); else if (id === "precipitation") a[c] = RAMPS.precip(ce.precip[c]);
    }
    return (T.col[id] = a);
  }

  /* ---------- 所有・色 ---------- */
  owner() {
    const civ = this.w.civ, pv = this.w.viewPast, key = pv ?? civ.monthIndex; if (this._own && this._ownAt === key) return this._own; const o = new Map();
    if (pv != null) { /* 過去の閲覧: 残っている歴史資料から再構成した領域だけを描く（資料の無い土地は塗らない。読み取り専用） */ for (const [cell, stateId] of pastView(civ, pv).owner) o.set(cell, { cell, cells: [cell], stateId, pop: 1, cohorts: [] }); }
    else for (const g of Object.values(civ.groups)) { const cells = g.cells?.length ? g.cells : [g.cell]; for (const c of cells) o.set(c, g); }
    this._own = o; this._ownAt = key; this._idc = {}; this._labelsAt = -1; this.assign(o); return o;
  }
  /** id（国家・文化・言語・宗教）の色を、隣り合うものが似ないように割り当てる（決めた色は変えない） */
  assign(own) {
    const civ = this.w.civ, tabs = { states: civ.states, cultures: civ.cultures, languages: civ.languages, religions: civ.religions}, nb = this.geo.mesh;
    for (const [type, tab] of Object.entries(tabs)) {
      const ids = Object.keys(tab ?? {}).filter((i) => !hasColor(i)); if (!ids.length) continue; const adj = new Map(), f = idOf[type], off = nb.neighborOffsets, ni = nb.neighborIds;
      for (const [c, g] of own) { const a = f(g); if (!a) continue; for (let k = off[c]; k < off[c + 1]; k++) { const o = own.get(ni[k]), b = o && f(o); if (b && b !== a) { let s = adj.get(a); if (!s) adj.set(a, (s = new Set())); s.add(b); } } }
      assignColors(ids, adj);
    }
  }
  idColor(type, g, maxDen) {
    if (type === "population") { const n = g.cells?.length || 1, d = g.pop / n, t = clamp(Math.log1p(d) / Math.log1p(maxDen), 0, 1); return RAMPS.pop(t); }
    const id = idOf[type](g); return id ? colorOf(id) : null;
  }

  /* ---------- 描画 ---------- */
  /** layerPass: alpha が 1 未満の層は、別の紙に不透明で塗ってから重ねる（区画の継ぎ目が濃く出ないように） */
  pass(target, W, H, alpha, paint) {
    const v = this.view; if (alpha >= 0.995) { target.lineWidth = 0.9 / v.k; paint(target); return; }
    this.tmp ??= mkCanvas(W, H); if (this.tmp.width !== W || this.tmp.height !== H) { this.tmp.width = W; this.tmp.height = H; }
    const t = this.tmp.getContext("2d"); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, W, H); t.setTransform(v.k, 0, 0, v.k, v.x, v.y); t.lineJoin = "round"; t.lineWidth = 0.9 / v.k; paint(t);
    target.save(); target.setTransform(1, 0, 0, 1, 0, 0); target.globalAlpha = alpha; target.drawImage(this.tmp, 0, 0); target.restore();
  }
  paintCells(g, cells, colorAt) { const cp = this.cp; for (const c of cells) { const col = colorAt(c); if (!col) continue; g.fillStyle = col; g.strokeStyle = col; g.fill(cp[c]); g.stroke(cp[c]); } }
  /** 地形・気候（静的）: 海の深さ・海岸・陸・標高/バイオーム/気温/降水 */
  renderGround(g, W, H) {
    const T = this.T, geo = this.geo, v = this.view, cp = this.cp, N = geo.N, cpx = geo.cellPx, seaIds = [], landIds = [];
    for (let c = 0; c < N; c++) (T.isSea[c] ? seaIds : landIds).push(c);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = SEA_DEEP; g.fillRect(0, 0, W, H); g.setTransform(v.k, 0, 0, v.k, v.x, v.y); g.lineJoin = "round"; g.lineWidth = 0.9 / v.k;
    if (!T.seaCol) T.seaCol = Array.from({ length: N }, (_, c) => (T.isSea[c] ? RAMPS.sea(-T.seaS[c]) : null));
    this.paintCells(g, seaIds, (c) => T.seaCol[c]);
    g.lineCap = "round"; for (const [w, a] of [[0.95, 0.09], [0.6, 0.12], [0.3, 0.17]]) { g.lineWidth = cpx * w; g.strokeStyle = `rgba(200,238,246,${a})`; g.stroke(T.coast); } g.lineWidth = 0.9 / v.k;
    g.fillStyle = LAND_BASE; g.fill(geo.land);
    for (const id of ["heightmap", "biomes", "temperature", "precipitation"]) if (this.layers.has(id)) { const col = this.cellColors(id); this.pass(g, W, H, this.alpha[id], (t) => this.paintCells(t, landIds, (c) => col[c])); }
    if (!T.lakes) { const ce = this.w.world.cell; T.lakes = landIds.filter((c) => ce.landWater[c] === 2); } this.paintCells(g, T.lakes, () => LAKE_COLOR);
    g.strokeStyle = "rgba(24,38,52,.7)"; g.lineWidth = Math.max(0.5, 1.1 / Math.sqrt(v.k)); g.stroke(T.coast); g.strokeStyle = "rgba(24,38,52,.45)"; g.stroke(T.lakeEdge);
  }
  /** 陰影・山岳・紙の模様（静的）。透明な紙に描き、塗りの上に重ねる */
  renderRelief(g, W, H) {
    const T = this.T, v = this.view, cp = this.cp, N = this.geo.N; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
    for (let c = 0; c < N; c++) { if (T.isSea[c]) continue; const s = T.shade[c]; if (s < -0.035) g.fillStyle = `rgba(22,18,40,${Math.min(0.28, -s * 0.8).toFixed(3)})`; else if (s > 0.035) g.fillStyle = `rgba(255,252,240,${Math.min(0.2, s * 0.65).toFixed(3)})`; else continue; g.fill(cp[c]); }
    if (T.tex) { g.globalAlpha = 0.55; g.fillStyle = T.tex; g.fill(this.geo.land); g.globalAlpha = 1; }
    drawMarks(g, T.marks, v.k);
  }
  cached(slot, key, W, H, fn) {
    const c = this[slot]; if (c && c.key === key) return c.cv; const cv = c?.cv && c.cv.width === W && c.cv.height === H ? c.cv : mkCanvas(W, H), g = cv.getContext("2d"); fn(g, W, H); this[slot] = { key, cv }; return cv;
  }
  draw() {
    const ctx = this.cv.getContext("2d"); if (!ctx) return; const [W, H] = this.size(); this.ensureGeo(W, H); const T = this.T, geo = this.geo, v = this.view, civ = this.w.civ, own = this.owner(), cell = this.w.world.cell;
    const vk = `${W}|${v.k.toFixed(4)}|${v.x.toFixed(1)}|${v.y.toFixed(1)}`, gsig = vk + FILL_IDS.slice(0, 4).map((i) => (this.layers.has(i) ? i + this.alpha[i] : "")).join(",");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); ctx.drawImage(this.cached("gc", gsig, W, H, (g) => this.renderGround(g, W, H)), 0, 0);
    // 社会の塗り（人口・宗教・文化・言語・国家）: 月ごとに変わるので毎回描く
    ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y); ctx.lineJoin = "round"; let maxDen = 1; if (this.layers.has("population")) for (const g of own.values()) { const d = g.pop / (g.cells?.length || 1); if (d > maxDen) maxDen = d; }
    for (const [id, , grp] of LAYERS) if (grp === "social" && this.layers.has(id)) this.pass(ctx, W, H, this.alpha[id], (t) => { const cp = this.cp; for (const [c, g] of own) { if (cell.landWater[c] === 2) continue; const col = this.idColor(id, g, maxDen); if (!col) continue; t.fillStyle = col; t.strokeStyle = col; t.fill(cp[c]); t.stroke(cp[c]); } });
    if (this.layers.has("relief")) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.cached("rc", vk, W, H, (g) => this.renderRelief(g, W, H)), 0, 0); }
    ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y); ctx.lineJoin = "round"; ctx.lineCap = "round"; this.lines(ctx, own, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    this.frame ??= mkCanvas(W, H); if (this.frame.width !== W || this.frame.height !== H) { this.frame.width = W; this.frame.height = H; } const fx = this.frame.getContext("2d"); fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, W, H); fx.drawImage(this.cv, 0, 0); this.frameView = { x: v.x, y: v.y, k: v.k }; void civ; void geo;
  }
  /** 線・記号・文字（月ごとに変わるものを含む。毎回描く） */
  lines(ctx, own, W, H) {
    const T = this.T, geo = this.geo, v = this.view, civ = this.w.civ, L = this.layers, k = v.k, sk = Math.sqrt(k), cen = geo.cen, ln = (a, b, p) => { const [x1, y1] = geo.proj(cen[2 * a], cen[2 * a + 1]); let [x2, y2] = geo.proj(cen[2 * b], cen[2 * b + 1]); x2 += W * Math.round((x1 - x2) / W); p.moveTo(x1, y1); p.lineTo(x2, y2); };
    if (L.has("grid")) { if (!T.grid) { const p = new Path2D(); for (let lo = -150; lo <= 180; lo += 30) { const [x] = geo.proj((lo * Math.PI) / 180, 0); p.moveTo(x, 0); p.lineTo(x, H); } for (let la = -60; la <= 60; la += 30) { const [, y] = geo.proj(0, (la * Math.PI) / 180); p.moveTo(0, y); p.lineTo(W, y); } T.grid = p; } ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 0.8 / k; ctx.setLineDash([4 / k, 4 / k]); ctx.stroke(T.grid); ctx.setLineDash([]); }
    if (L.has("cells")) { T.cellsP ??= geo.edgesWhere((c, n) => c < n); ctx.strokeStyle = "rgba(20,24,30,.28)"; ctx.lineWidth = 0.6 / k; ctx.stroke(T.cellsP); }
    if (L.has("rivers") && T.rivers.length) { ctx.strokeStyle = "#4f97d4"; [[0, 0.5, 3], [1, 0.75, 1.4], [2, 1.15, 0]].forEach(([b, w, kmin]) => { if (k < kmin) return; ctx.lineWidth = (w * geo.cellPx * 0.11) / Math.pow(k, 0.55); ctx.globalAlpha = 0.95; ctx.stroke(T.rivers[b]); }); ctx.globalAlpha = 1; }
    const stateOf = (c) => own.get(c)?.stateId ?? null;
    if (L.has("borders")) { const p = geo.edgesWhere((c, n) => { const a = stateOf(c), b = stateOf(n); return a && a !== b && !T.isSea[n] && (b ? c < n : true); }, own.keys()); ctx.strokeStyle = "rgba(24,22,30,.45)"; ctx.lineWidth = 3.2 / sk; ctx.stroke(p); ctx.strokeStyle = "#f6f1e2"; ctx.lineWidth = 1.5 / sk; ctx.stroke(p); }
    if (L.has("war")) { const warring = new Set(); for (const id of civ.activeWarIds) { const x = civ.wars[id]; for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s); } const p = geo.edgesWhere((c, n) => { const a = stateOf(c); return a && warring.has(a) && stateOf(n) !== a && !T.isSea[n]; }, own.keys()); ctx.strokeStyle = "#e0463c"; ctx.lineWidth = 2.4 / sk; ctx.setLineDash([5 / sk, 3 / sk]); ctx.stroke(p); ctx.setLineDash([]); }
    if (L.has("routes")) { ctx.strokeStyle = "#e8b64a"; ctx.globalAlpha = 0.85; ctx.setLineDash([6 / sk, 4 / sk]); const seen = new Set(); for (const s of Object.values(civ.states)) { if (!s.alive) continue; const a = civ.groups[s.capitalGroupId]; for (const [oid, amt] of Object.entries(s.econ?.trade ?? {})) { const o = civ.states[oid], key = s.id < oid ? s.id + oid : oid + s.id; if (!o?.alive || !(amt > 0) || seen.has(key)) continue; seen.add(key); const b = civ.groups[o.capitalGroupId]; if (!a || !b) continue; ctx.lineWidth = Math.min(3, 0.8 + amt * 0.02) / sk; const p = new Path2D(); ln(a.cell, b.cell, p); ctx.stroke(p); } } ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (L.has("fronts")) {
      ctx.strokeStyle = "#e0463c"; for (const wid of civ.activeWarIds ?? []) {
        const wr = civ.wars[wid]; for (const gid of wr?.occupied ?? []) { const g = civ.groups[gid]; if (!g) continue; const [x, y] = geo.proj(cen[2 * g.cell], cen[2 * g.cell + 1]), r = 3.4 / sk; ctx.lineWidth = 1.6 / sk; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); }
        ctx.setLineDash([3 / sk, 3 / sk]); ctx.lineWidth = 1.4 / sk; for (const f of Object.values(wr?.ops?.forces ?? {})) { const tg = f.target, g = civ.groups[f.groupId ?? f.at]; if (tg == null || !g || typeof tg !== "number") continue; const p = new Path2D(); ln(g.cell, tg, p); ctx.stroke(p); } ctx.setLineDash([]);
      }
    }
    if (L.has("cities")) { ctx.lineWidth = 1.2 / sk; for (const s of Object.values(civ.settlements)) { if (s.pop < 800) continue; const [x, y] = geo.proj(cen[2 * s.cell], cen[2 * s.cell + 1]), big = s.stage === "city", r = (big ? 3.4 : 2.1) / sk; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = "#fff4cf"; ctx.fill(); ctx.strokeStyle = "#2a2018"; ctx.stroke(); if (big) { ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, TAU); ctx.fillStyle = "#2a2018"; ctx.fill(); } } }
    if (this.sel) { const p = geo.edgesWhere((c, n) => stateOf(n) !== this.sel, [...own].filter(([, g]) => g.stateId === this.sel).map(([c]) => c)); ctx.strokeStyle = "rgba(20,16,8,.6)"; ctx.lineWidth = 4.2 / sk; ctx.stroke(p); ctx.strokeStyle = "#f0c14d"; ctx.lineWidth = 2.4 / sk; ctx.stroke(p); }
    if (L.has("labels")) this.drawLabels(ctx, own, W);
  }
  drawLabels(ctx, own, W) {
    const geo = this.geo, civ = this.w.civ, k = this.view.k; if (this._labelsAt !== this._ownAt || this._labelsW !== W) {
      const m = new Map(); for (const [c, g] of own) { const id = g.stateId; if (!id) continue; const [x, y] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]); let e = m.get(id); if (!e) m.set(id, (e = { x0: x, sx: 0, sy: 0, n: 0 })); let dx = x - e.x0; dx -= W * Math.round(dx / W); e.sx += dx; e.sy += y; e.n++; }
      this._labels = [...m].map(([id, e]) => ({ id, x: e.x0 + e.sx / e.n, y: e.sy / e.n, n: e.n })).sort((a, b) => b.n - a.n); this._labelsAt = this._ownAt; this._labelsW = W;
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round"; let shown = 0;
    for (const e of this._labels) {
      const name = civ.states[e.id]?.name; if (!name || (e.n < 2 && k < 3) || shown > 90) continue; shown++; const fs = clamp(8 + 2.6 * Math.sqrt(e.n), 9, 28) / Math.pow(k, 0.55);
      ctx.font = `600 ${fs}px "Shippori Mincho","Noto Serif JP","Yu Mincho",serif`; ctx.lineWidth = fs * 0.24; ctx.strokeStyle = "rgba(16,18,24,.78)"; ctx.fillStyle = "#f7f2e4"; for (const o of [0, W, -W]) { if (e.x + o < -40 || e.x + o > W + 40) continue; ctx.strokeText(name, e.x + o, e.y); ctx.fillText(name, e.x + o, e.y); }
    }
  }

  click(e) {
    const r = this.cv.getBoundingClientRect(), v = this.view, x = (((e.clientX - r.left) * (this.cv.width / r.width)) - v.x) / v.k, y = (((e.clientY - r.top) * (this.cv.height / r.height)) - v.y) / v.k, W = this.cv.width, H = this.cv.height, lon = (x / W) * TAU - Math.PI, lat = Math.PI / 2 - (y / H) * Math.PI; let best = -1, bd = 9;
    for (let c = 0; c < this.geo.N; c++) { let dl = Math.abs(this.geo.cen[c * 2] - lon); if (dl > Math.PI) dl = TAU - dl; const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat); if (d < bd) { bd = d; best = c; } }
    const g = this.owner().get(best), st = Object.values(this.w.civ.settlements).find((s) => s.cell === best); this.onPick?.({ cell: best, stateId: g?.stateId ?? null, group: g ?? null, settlement: st ?? null, x: e.clientX - r.left, y: e.clientY - r.top });
  }
}
export { polityJa };
