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
 * @param {{alpha?:number}} opts
 */
export function drawPolitics(ctx, map, vp, kind, { alpha = 0.55 } = {}) {
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
  ctx.globalAlpha = alpha;
  for (const [id, list] of groups) {
    ctx.fillStyle = entities[id].color ?? NEUTRAL_COLOR;
    ctx.beginPath();
    for (const i of list) addCellPath(ctx, cells, vertices, i);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

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
