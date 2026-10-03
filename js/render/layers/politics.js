// 政治層：国家・文化・宗教・属州による色分けと、その境界線。
import { NEUTRAL_COLOR } from "../palette.js";
import { buildBoundarySegments, strokeSegments } from "../edges.js";
import { addCellPath } from "./terrain.js";

const SOURCES = {
  state:    { cells: (m) => m.pack.cells.state,    entities: (m) => m.pack.states },
  culture:  { cells: (m) => m.pack.cells.culture,  entities: (m) => m.pack.cultures },
  religion: { cells: (m) => m.pack.cells.religion, entities: (m) => m.pack.religions },
  province: { cells: (m) => m.pack.cells.province, entities: (m) => m.pack.provinces },
};

/** "#rrggbb" / "rgb(r,g,b)" / "hsl(h,s%,l%)" を [r,g,b] に。読めなければ null */
function parseColor(c) {
  if (typeof c !== "string") return null;
  let m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(c.trim());
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16));
  m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(c);
  if (m) { const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100, q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
  return null;
}
/** 国の色を、明るさだけ少しずらした同系色にする（Azgaar の州表示：国と同じ色味で、州ごとに濃淡を変える） */
export function shadeOf(color, step) {
  const rgb = parseColor(color); if (!rgb) return color;
  const k = [0, 0.14, -0.14, 0.26, -0.24, 0.07, -0.07][step % 7];
  const mix = k >= 0 ? 255 : 0, a = Math.abs(k);
  return `rgb(${rgb.map((v) => Math.round(v + (mix - v) * a)).join(",")})`;
}

/** 境界線の計算結果のキャッシュ。配列の同一性が変わらない限り再計算しない */
const edgeCache = new WeakMap();
export function cachedBoundary(geometry, values, include, tag) {
  let byTag = edgeCache.get(values);
  if (!byTag) { byTag = new Map(); edgeCache.set(values, byTag); }
  // geometry が作り直されたら無効化する
  const hit = byTag.get(tag);
  if (hit && hit.geometry === geometry) return hit.segs;
  const segs = buildBoundarySegments(geometry, values, include);
  byTag.set(tag, { geometry, segs });
  return segs;
}

/**
 * @param {"state"|"culture"|"religion"|"province"} kind
 * @param {{alpha?:number, fill?:boolean, lines?:boolean}} opts  fill: 色を塗る / lines: 境界線を引く
 */
export function drawPolitics(ctx, map, vp, kind, { alpha = 0.55, fill = true, lines = true } = {}) {
  const src = SOURCES[kind];
  if (!src) return;
  const { cells, vertices } = map.geometry.pack;
  const ids = src.cells(map);
  const entities = src.entities(map);
  const biome = map.pack.cells.biome;
  const isLand = (i) => biome[i] !== 0;

  // エンティティごとに複合パスへまとめ、1回だけ塗る（継ぎ目・二重塗りを防ぐ）
  const groups = new Map();
  for (let i = 0; i < cells.v.length; i++) {
    if (!isLand(i)) continue;
    const id = ids[i];
    const e = entities[id];
    if (!id || !e || e.removed) continue; // 0番(中立)や削除済みは塗らない
    let list = groups.get(id);
    if (!list) { list = []; groups.set(id, list); }
    list.push(i);
  }
  // 国家レイヤーでは、属州（州）も国と同じ系統の色で、濃淡を変えて塗る
  const provOf = kind === "state" ? map.pack.cells.province : null;
  const provinces = kind === "state" ? map.pack.provinces : null;
  const shadeGroups = new Map();
  if (provOf) {
    for (const [id, list] of groups) {
      for (const i of list) {
        const pid = provOf[i], p = provinces?.[pid];
        if (!pid || !p || p.removed || p.state !== id) continue;
        const key = `${id}:${pid}`;
        let g = shadeGroups.get(key); if (!g) { g = { id, pid, list: [] }; shadeGroups.set(key, g); }
        g.list.push(i);
      }
    }
  }
  if (fill) {
    ctx.globalAlpha = alpha;
    for (const [id, list] of groups) {
      ctx.fillStyle = entities[id].color ?? NEUTRAL_COLOR;
      ctx.beginPath();
      for (const i of list) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
    }
    // 州の濃淡（国の色の上に重ねる。州が無い国は国の色だけ）
    const byState = new Map();
    for (const g of shadeGroups.values()) { const n = byState.get(g.id) ?? 0; byState.set(g.id, n + 1); g.step = n + 1; }
    for (const g of shadeGroups.values()) {
      if ((byState.get(g.id) ?? 0) < 1) continue;
      ctx.fillStyle = shadeOf(entities[g.id].color ?? NEUTRAL_COLOR, g.step);
      ctx.beginPath();
      for (const i of g.list) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (!lines) return;
  // 同じ国の中の州境は細い点線で（国境は下で太く引く）
  if (provOf && shadeGroups.size) {
    const psegs = cachedBoundary(map.geometry, provOf, isLand, "land:province"); // 州の配列だけで決まるのでキャッシュが効く
    ctx.strokeStyle = "rgba(40,30,20,0.35)"; ctx.lineWidth = 0.6 / vp.k; ctx.lineCap = "round";
    ctx.setLineDash([2 / vp.k, 2 / vp.k]); strokeSegments(ctx, psegs); ctx.setLineDash([]);
  }

  // 境界線（陸どうしの間のみ）
  const segs = cachedBoundary(map.geometry, ids, isLand, "land:" + kind);
  ctx.strokeStyle = "rgba(40,30,20,0.75)";
  ctx.lineWidth = (kind === "state" ? 1.4 : 0.9) / vp.k;
  ctx.lineCap = "round";
  if (kind !== "state") ctx.setLineDash([3 / vp.k, 2 / vp.k]);
  strokeSegments(ctx, segs);
  ctx.setLineDash([]);
}

/** 海岸線 */
export function drawCoast(ctx, map, vp) {
  const isWater = Uint8Array.from(map.pack.cells.biome, (b) => (b === 0 ? 1 : 0));
  const segs = cachedBoundary(map.geometry, isWater, () => true, "coast");
  ctx.strokeStyle = "rgba(45,50,60,0.85)";
  ctx.lineWidth = 0.9 / vp.k;
  ctx.lineCap = "round";
  strokeSegments(ctx, segs);
}
