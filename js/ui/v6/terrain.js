// v6 地図の「見た目」の部品。Azgaar のように自然に見せるための工夫を、軽い処理だけで作る。
//   ・区画（球面の六角形）の辺を、頂点のゆらぎと再帰的な折れ曲がりで不規則にする。海岸線も国境も、同じ辺から作るので隙間もずれも出ない。
//   ・色は連続した階調（標高・水深・気温・降水・人口）と、バイオームの固定色から作る。
//   ・陰影（光源は北西）と山・丘の記号は、世界ごとに 1 回だけ計算する。
// 純粋な計算と Path2D の組み立てだけで、DOM には触れない（Node の @napi-rs/canvas でも動く）。
const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------- 色の階調 ---------- */
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
/** stops: [[値, "#rrggbb"], ...]（値の昇順）。値に応じて色を補間する関数を返す */
export function ramp(stops) {
  const S = stops.map(([t, c]) => [t, hex(c)]);
  return (t) => {
    if (!(t > S[0][0])) return css(S[0][1]);
    for (let i = 1; i < S.length; i++) if (t <= S[i][0]) { const [t0, a] = S[i - 1], [t1, b] = S[i], f = (t - t0) / (t1 - t0 || 1); return css([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); }
    return css(S[S.length - 1][1]);
  };
}
export const RAMPS = {
  // 陸の標高（m）: 低地の緑 → 黄 → 茶 → 灰 → 雪
  land: ramp([[0, "#5a9a52"], [120, "#78a853"], [400, "#a9b95e"], [800, "#d3c46f"], [1400, "#cba867"], [2200, "#a98260"], [3300, "#8d7d72"], [4600, "#c7c4c0"], [6500, "#f7f6f3"]]),
  // 水深（m, 正の値）: 浅い青緑 → 深い藍
  sea: ramp([[0, "#6fbfd0"], [150, "#58a5c4"], [800, "#3f82b0"], [2200, "#2c5f93"], [4200, "#204878"], [6200, "#173560"]]),
  temp: ramp([[-30, "#6a4aa6"], [-15, "#4f7fcf"], [-3, "#86c9ea"], [7, "#93d6b0"], [15, "#d8e68e"], [22, "#f4d06c"], [28, "#ef9a4d"], [35, "#d4503d"]]),
  precip: ramp([[0, "#f4e8b8"], [250, "#e6d68c"], [700, "#a6d19b"], [1500, "#52a9a6"], [2500, "#3b82b8"], [4000, "#2c509c"]]),
  pop: ramp([[0, "#fff1bf"], [0.22, "#ffd878"], [0.5, "#f7a84c"], [0.78, "#e2653b"], [1, "#a22f3b"]]),
};
/** バイオーム（BIOMES の値の順）。0 海 / 1 氷雪 / 2 ツンドラ / 3 タイガ / 4 温帯林 / 5 草原 / 6 熱帯砂漠 / 7 寒冷砂漠 / 8 サバンナ / 9 熱帯季節林 / 10 熱帯雨林 / 11 高山 / 12 湿地 / 13 湖 */
export const BIOME_COLORS = ["#3f82b0", "#e9f2f5", "#aebb9f", "#4f7f5a", "#62ab5c", "#bcd67f", "#ebd291", "#c9c3a3", "#d6c670", "#8fc352", "#2f9c56", "#aaa69f", "#4ea594", "#5aa9c6"];
export const BIOME_JA = ["海", "氷雪", "ツンドラ", "タイガ", "温帯林", "草原", "熱帯砂漠", "寒冷砂漠", "サバンナ", "熱帯季節林", "熱帯雨林", "高山", "湿地", "湖"];
export const LAND_BASE = "#c9c3a6", LAKE_COLOR = "#5aa9c6";

/* ---------- 決定的な乱数（頂点・辺の id から） ---------- */
export function hash01(a, b = 0, c = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35) ^ Math.imul((c + 0x165667b1) | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/* ---------- 幾何: 頂点・辺・区画の Path2D ---------- */
const LEVELS = 3, JITTER = 0.17, FRACT = 0.24;
export class Geo {
  constructor(mesh) {
    this.mesh = mesh; const N = mesh.cellCount, T = mesh.vertexXYZ.length / 3; this.N = N; this.T = T;
    const X = mesh.vertexXYZ, vlon = new Float32Array(T), vlat = new Float32Array(T);
    for (let v = 0; v < T; v++) { vlon[v] = Math.atan2(X[3 * v + 1], X[3 * v]); vlat[v] = Math.asin(clamp(X[3 * v + 2], -1, 1)); }
    this.vlon = vlon; this.vlat = vlat;
    const C = mesh.centerXYZ, cen = new Float32Array(N * 2);
    for (let c = 0; c < N; c++) { cen[2 * c] = Math.atan2(C[3 * c + 1], C[3 * c]); cen[2 * c + 1] = Math.asin(clamp(C[3 * c + 2], -1, 1)); }
    this.cen = cen; this.W = 0; this.H = 0;
    // 隣接の各スロット（neighborIds の添字）が共有する 2 頂点
    const off = mesh.neighborOffsets, nb = mesh.neighborIds, vo = mesh.cellVertexOffsets, vi = mesh.cellVertexIds, sv = new Int32Array(2 * nb.length).fill(-1);
    for (let c = 0; c < N; c++) for (let k = off[c]; k < off[c + 1]; k++) {
      const n = nb[k]; let f = 0;
      for (let a = vo[c]; a < vo[c + 1] && f < 2; a++) { const v = vi[a]; for (let b = vo[n]; b < vo[n + 1]; b++) if (vi[b] === v) { sv[2 * k + f++] = v; break; } }
    }
    this.slotVerts = sv;
  }
  /** 幅 W（高さは W/2）の画面に合わせて、頂点の位置と辺・区画の形を作り直す */
  build(W, H) {
    if (this.W === W && this.H === H) return; this.W = W; this.H = H; this.ec = new Map(); this.cp = null; this.land = null;
    const T = this.T, VX = new Float32Array(T), VY = new Float32Array(T), cellPx = Math.sqrt((W * H) / this.N);
    for (let v = 0; v < T; v++) {
      const a = hash01(v, 1) * TAU, r = JITTER * cellPx * (0.4 + 0.6 * hash01(v, 2));
      VX[v] = ((this.vlon[v] + Math.PI) / TAU) * W + Math.cos(a) * r; VY[v] = ((Math.PI / 2 - this.vlat[v]) / Math.PI) * H + Math.sin(a) * r;
    }
    this.VX = VX; this.VY = VY; this.cellPx = cellPx;
  }
  proj(lon, lat) { return [((lon + Math.PI) / TAU) * this.W, ((Math.PI / 2 - lat) / Math.PI) * this.H]; }
  /** 辺 a→b の折れ線 [x0,y0,x1,y1,…]。x は a の位置を基準に、b を ±W だけずらしてつなげたもの */
  edge(a, b) {
    const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * this.T + hi; let p = this.ec.get(key);
    if (!p) { p = this._mk(lo, hi); this.ec.set(key, p); }
    if (a === lo) return p;
    const n = p.length / 2, q = new Float32Array(p.length); for (let i = 0; i < n; i++) { q[2 * i] = p[2 * (n - 1 - i)]; q[2 * i + 1] = p[2 * (n - 1 - i) + 1]; } return q;
  }
  _mk(lo, hi) {
    const W = this.W, n = 1 << LEVELS, pts = new Float32Array((n + 1) * 2), x1 = this.VX[lo], y1 = this.VY[lo]; let x2 = this.VX[hi]; const y2 = this.VY[hi]; x2 += W * Math.round((x1 - x2) / W);
    pts[0] = x1; pts[1] = y1; pts[2 * n] = x2; pts[2 * n + 1] = y2;
    const sub = (i0, i1, lvl, node) => {
      if (lvl === LEVELS) return; const im = (i0 + i1) >> 1, ax = pts[2 * i0], ay = pts[2 * i0 + 1], bx = pts[2 * i1], by = pts[2 * i1 + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, r = (hash01(lo, hi, node) - 0.5) * 2 * FRACT * len;
      pts[2 * im] = (ax + bx) / 2 - (dy / len) * r; pts[2 * im + 1] = (ay + by) / 2 + (dx / len) * r; sub(i0, im, lvl + 1, node * 2); sub(im, i1, lvl + 1, node * 2 + 1);
    };
    sub(0, n, 0, 1); return pts;
  }
  /** 折れ線 pts（x,y の並び）を path に加える。画面の左右端をまたぐものは ±W の写しも加える。close=true で閉じる */
  addPoly(path, pts, close) {
    const W = this.W, n = pts.length / 2; let lo = 1e9, hi = -1e9; for (let i = 0; i < n; i++) { const x = pts[2 * i]; if (x < lo) lo = x; if (x > hi) hi = x; }
    for (const dx of [0, W, -W]) { if (hi + dx < 0 || lo + dx > W) continue; path.moveTo(pts[0] + dx, pts[1]); for (let i = 1; i < n; i++) path.lineTo(pts[2 * i] + dx, pts[2 * i + 1]); if (close) path.closePath(); }
  }
  /** 区画 c の輪郭（共有する辺を使うので、隣と必ず一致する）。極を囲む区画は、画面の上端・下端まで伸ばして閉じる */
  ring(c) {
    const m = this.mesh, vo = m.cellVertexOffsets, vi = m.cellVertexIds, a0 = vo[c], cnt = vo[c + 1] - a0, W = this.W, H = this.H, out = [];
    let lastX = 0, lastY = 0, firstX = 0, latSum = 0;
    for (let i = 0; i < cnt; i++) {
      const va = vi[a0 + i], vb = vi[a0 + ((i + 1) % cnt)], e = this.edge(va, vb), n = e.length / 2; latSum += this.vlat[va];
      const shift = i === 0 ? 0 : Math.round((lastX - e[0]) / W) * W;
      for (let j = i === 0 ? 0 : 1; j < n; j++) out.push(e[2 * j] + shift, e[2 * j + 1]);
      lastX = e[2 * (n - 1)] + shift; lastY = e[2 * (n - 1) + 1]; if (i === 0) firstX = e[0];
    }
    const wraps = Math.round((lastX - firstX) / W);
    if (wraps !== 0) { const yEdge = latSum > 0 ? -2 : H + 2; out.push(lastX, yEdge, firstX, yEdge); }
    return out;
  }
  /** 全区画の Path2D（初回に作り、W が変わるまで使い回す）と、陸（海でない区画）をまとめた Path2D */
  paths(isSea) {
    if (this.cp && this.cpSea === isSea) return this.cp; const N = this.N, cp = new Array(N), land = new Path2D();
    for (let c = 0; c < N; c++) { const p = new Path2D(), pts = this.ring(c); this.addPoly(p, pts, true); cp[c] = p; if (!isSea[c]) this.addPoly(land, pts, true); }
    this.cp = cp; this.cpSea = isSea; this.land = land; return cp;
  }
  /** 隣接スロット k の辺を path に加える（c 側から見た向き） */
  addSlot(path, k) { const v = this.slotVerts; if (v[2 * k] < 0 || v[2 * k + 1] < 0) return; this.addPoly(path, this.edge(v[2 * k], v[2 * k + 1]), false); }
  /** 条件 pred(c, n) を満たす隣接ペア（c の側から見る）の境界線を 1 つの Path2D にまとめる。cells: 見る区画（省略で全部） */
  edgesWhere(pred, cells) {
    const m = this.mesh, off = m.neighborOffsets, nb = m.neighborIds, p = new Path2D(), it = cells ?? { [Symbol.iterator]: function* () { for (let c = 0; c < m.cellCount; c++) yield c; } };
    for (const c of it) for (let k = off[c]; k < off[c + 1]; k++) if (pred(c, nb[k])) this.addSlot(p, k);
    return p;
  }
}

/* ---------- 地形の派生データ（世界ごとに 1 回） ---------- */
/** 陰影（-1〜1）。光源は北西。標高の勾配を隣接から求め、隣どうしでならして六角形の継ぎ目を目立たなくする */
export function hillshade(geo, elevation, isSea) {
  const m = geo.mesh, N = geo.N, off = m.neighborOffsets, nb = m.neighborIds, cen = geo.cen, sh = new Float32Array(N), spacing = Math.sqrt((4 * Math.PI) / N);
  const Lx = -0.52, Ly = 0.52, Lz = 0.68;
  for (let c = 0; c < N; c++) {
    if (isSea[c]) continue; const e = elevation[c], cl = Math.cos(cen[2 * c + 1]); let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (let k = off[c]; k < off[c + 1]; k++) {
      const j = nb[k]; let dl = cen[2 * j] - cen[2 * c]; if (dl > Math.PI) dl -= TAU; else if (dl < -Math.PI) dl += TAU;
      const dx = (dl * cl) / spacing, dy = (cen[2 * j + 1] - cen[2 * c + 1]) / spacing, dz = ((isSea[j] ? Math.min(0, elevation[j]) * 0.3 : elevation[j]) - e) / 1000;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
    }
    const det = sxx * syy - sxy * sxy || 1, gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det, nx = -gx * 1.25, ny = -gy * 1.25, len = Math.hypot(nx, ny, 1);
    sh[c] = clamp((nx * Lx + ny * Ly + Lz) / len - Lz, -1, 1);
  }
  const out = new Float32Array(N);
  for (let c = 0; c < N; c++) { if (isSea[c]) continue; let s = sh[c] * 2, n = 2; for (let k = off[c]; k < off[c + 1]; k++) if (!isSea[nb[k]]) { s += sh[nb[k]]; n++; } out[c] = s / n; }
  return out;
}

/** 山・丘の記号の配置（区画ごとに 1 個。山は標高が高い区画、丘はその次）。[x, y, 種類, 大きさ] の配列を、y の昇順で返す */
export function reliefMarks(geo, cell, isSea) {
  const { elevation, landWater } = cell, N = geo.N, marks = [], cp = geo.cellPx;
  for (let c = 0; c < N; c++) {
    if (isSea[c] || landWater[c] === 2) continue; const e = elevation[c]; if (e < 700) continue;
    const [px, py] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]), jx = (hash01(c, 7) - 0.5) * cp * 0.45, jy = (hash01(c, 8) - 0.5) * cp * 0.35;
    if (e >= 2200) marks.push([px + jx, py + jy, 1, cp * (0.5 + 0.28 * clamp((e - 2200) / 3200, 0, 1))]); else marks.push([px + jx, py + jy, 0, cp * (0.3 + 0.16 * clamp((e - 700) / 1500, 0, 1))]);
  }
  return marks.sort((a, b) => a[1] - b[1]);
}
export function drawMarks(ctx, marks, k) {
  const s = 1 / Math.pow(k, 0.3); ctx.lineJoin = "round";
  for (const [x, y, kind, size] of marks) {
    const w = size * s;
    if (kind === 1) { // 山: 明るい面（左）と暗い面（右）
      const h = w * 0.95; ctx.beginPath(); ctx.moveTo(x - w * 0.55, y + h * 0.4); ctx.lineTo(x - w * 0.02, y - h * 0.6); ctx.lineTo(x + w * 0.1, y + h * 0.4); ctx.closePath(); ctx.fillStyle = "rgba(255,252,240,.62)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - w * 0.02, y - h * 0.6); ctx.lineTo(x + w * 0.58, y + h * 0.4); ctx.lineTo(x + w * 0.1, y + h * 0.4); ctx.closePath(); ctx.fillStyle = "rgba(40,34,30,.5)"; ctx.fill();
    } else { ctx.beginPath(); ctx.moveTo(x - w * 0.5, y + w * 0.22); ctx.quadraticCurveTo(x, y - w * 0.46, x + w * 0.5, y + w * 0.22); ctx.lineWidth = Math.max(0.5, w * 0.12); ctx.strokeStyle = "rgba(70,56,40,.55)"; ctx.stroke(); }
  }
}

/** 河川の Path2D を、流量の段階ごとに作る。区画の中心どうしを、少しだけ蛇行させた曲線でつなぐ（細い川は拡大したときだけ描く） */
export function riverPaths(geo, cell, isSea) {
  const { riverTo, riverFlow, river, landWater } = cell; if (!riverTo) return [];
  const N = geo.N, W = geo.W, buckets = [new Path2D(), new Path2D(), new Path2D()], cen = geo.cen, fl = [];
  for (let c = 0; c < N; c++) if (riverTo[c] >= 0 && landWater[c] === 1 && (river?.[c] > 0 || riverFlow?.[c] > 0)) fl.push(riverFlow?.[c] ?? 0);
  fl.sort((a, b) => a - b); const q = (p) => fl[Math.floor(fl.length * p)] ?? 0, t1 = q(0.55), t2 = q(0.88);
  for (let c = 0; c < N; c++) {
    const to = riverTo[c]; if (to < 0 || landWater[c] !== 1 || !(river?.[c] > 0 || riverFlow?.[c] > 0)) continue; const f = riverFlow?.[c] ?? 0, b = f >= t2 ? 2 : f >= t1 ? 1 : 0, [x1, y1] = geo.proj(cen[2 * c], cen[2 * c + 1]); let [x2, y2] = geo.proj(cen[2 * to], cen[2 * to + 1]); x2 += W * Math.round((x1 - x2) / W);
    if (isSea[to]) { x2 = (x1 + x2) / 2; y2 = (y1 + y2) / 2; } // 海へ入る川は海岸で止める
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, r = (hash01(c, to, 3) - 0.5) * 0.7 * len, cx = mx - (dy / len) * r, cy = my + (dx / len) * r;
    for (const o of [0, W, -W]) { if (Math.max(x1, x2) + o < 0 || Math.min(x1, x2) + o > W) continue; buckets[b].moveTo(x1 + o, y1); buckets[b].quadraticCurveTo(cx + o, cy, x2 + o, y2); }
  }
  return buckets;
}

/** 紙のような細かい濃淡の模様（陸にだけ薄く重ねる）。決定的に作る */
export function textureTile(createCanvas, size = 96) {
  const cv = createCanvas(size, size), ctx = cv.getContext("2d"); if (!ctx) return null; const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = hash01(x, y, 11) * 0.6 + hash01(x >> 2, y >> 2, 12) * 0.4, i = 4 * (y * size + x), dark = v < 0.5; d[i] = dark ? 40 : 255; d[i + 1] = dark ? 34 : 250; d[i + 2] = dark ? 28 : 240; d[i + 3] = Math.round(Math.abs(v - 0.5) * 70); }
  ctx.putImageData(img, 0, 0); return cv;
}
