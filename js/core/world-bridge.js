// 生成した球面世界（World）→ 国家運営層の地図データ（MapData）への橋渡し（v5.0.0 V5-M0）。
// 依存の向き: この橋渡しだけが「国家運営層（core/model）」と「球面世界（core/world）」の両方を知る。core/world は国家運営層を知らない（一方向）。
//
// 目的: 世界生成を「別の作業画面」ではなく、国家・外交・戦争と同じ 1 つのアプリの機能にする。
//   地理の正本は World（球面）のまま。MapData の pack / geometry は、World から導出した「国家運営層から見える面」で、
//   Azgaar 形式の再構築（Delaunator・grid→pack）は一切通らない。
//
// 地図座標（sim）: 等距円筒（経度→x、緯度→y）。meta.width × meta.height を 2:1 にする。画面への表示は円筒図法（v5.2。core/world/projection.js と render/viewport.js）。
// 経度の継ぎ目（±180°）をまたぐセルは、継ぎ目の外へはみ出した位置に複製頂点を置いて 1 つの多角形として保つ
//   （反対側には対応する半セル分の隙間ができる。国境は継ぎ目をまたいで引かれない — 既知の制約）。
// 極を囲むセルは、極の緯度に 2 点を足して閉じる。
//
// 純粋ロジック（DOM 非依存）。旧モデルの createEmptyMap だけに依存する。
import { createEmptyMap } from "./model.js";
import { LAND_WATER, BIOMES } from "./world/worldgen.js";
import { cellViewPolygon } from "./world/sphere-mesh.js";
import { simFrame } from "./world/projection.js";

export const MAP_WIDTH = 2048, MAP_HEIGHT = 1024;
export const WORLD_SOURCE = "alterhistory-world";

/** 世界のバイオーム ID（BIOMES）をそのまま旧エディタのバイオーム表にする。0 = 水域（旧エディタの約束） */
export const WORLD_BIOMES_DATA = Object.freeze([
  { i: 0, name: "海", color: "#466eab", habitability: 0 },
  { i: 1, name: "氷雪", color: "#ebf0f5", habitability: 0 },
  { i: 2, name: "ツンドラ", color: "#a0af96", habitability: 8 },
  { i: 3, name: "タイガ", color: "#3c6950", habitability: 20 },
  { i: 4, name: "温帯林", color: "#3c8c46", habitability: 80 },
  { i: 5, name: "草原", color: "#96b450", habitability: 70 },
  { i: 6, name: "熱帯砂漠", color: "#e1c378", habitability: 6 },
  { i: 7, name: "寒冷砂漠", color: "#beb4a0", habitability: 8 },
  { i: 8, name: "サバンナ", color: "#beaf50", habitability: 55 },
  { i: 9, name: "熱帯季節林", color: "#5a9632", habitability: 65 },
  { i: 10, name: "熱帯雨林", color: "#146428", habitability: 60 },
  { i: 11, name: "高山", color: "#827878", habitability: 4 },
  { i: 12, name: "湿地", color: "#508278", habitability: 15 },
  { i: 13, name: "湖", color: "#4682c8", habitability: 0 },
]);

/** 標高（m）→ 旧エディタの高さ（0〜100。20 未満が水）。陸は war-engine の heightMeters（(h-18)^1.8）と整合する */
export function elevationToHeight(e, isLandCell) {
  if (!isLandCell) return e >= 0 ? 19 : Math.max(0, Math.min(19, Math.round(19 + e / 290)));
  return Math.max(20, Math.min(100, Math.round(18 + Math.pow(Math.max(e, 1), 1 / 1.8))));
}

/**
 * @param {object} world  generateWorld / decodeAhmap2 の結果
 * @param {{name?:string}} [opts]
 * @returns {object} MapData（geometry 取り付け済み。map.world に World を保持）
 */
export function worldToMap(world, opts = {}) {
  const mesh = world.mesh, cell = world.cell, N = mesh.cellCount, W = MAP_WIDTH, H = MAP_HEIGHT;
  const map = createEmptyMap();
  const kmPerUnit = (2 * Math.PI * world.spec.planet.radiusKm) / W;

  map.meta = { ...map.meta, source: WORLD_SOURCE, width: W, height: H, name: opts.name ?? world.spec.worldSeed, seed: world.spec.worldSeed, mapId: world.hash ?? "", lineCount: 0, extraHeader: [] };
  map.settings = { format: "json", raw: "", options: { seed: world.spec.worldSeed, graph: { width: W, height: H }, lore: { name: map.meta.name }, units: { distance: { unit: "km", scale: kmPerUnit }, area: { unit: "square" }, height: { unit: "m", exponent: 1.8 }, temperature: { unit: "°C" }, population: { scale: 1000, urbanization: { rate: 1, density: 10 } } } } };
  map.biomesData = WORLD_BIOMES_DATA.map((b) => ({ ...b }));
  map.world = world; // 地理の正本（実行時の参照。保存は World 側のチャンク）

  // ---- 属性（国家・文化・宗教などはまだ無い。国家は歴史の中で成立する） ----
  const isLand = new Uint8Array(N);
  const biome = new Array(N), h = new Array(N), t = new Array(N), f = new Array(N), zero = () => new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const land = cell.landWater[i] === LAND_WATER.LAND; isLand[i] = land ? 1 : 0;
    biome[i] = land ? cell.biome[i] : 0;
    h[i] = elevationToHeight(cell.elevation[i], land);
    // 海岸からの距離の符号つきコード（地形層が海の濃淡に使う）: 陸 1,2,…／水 -1,-2,…
    const d = Math.min(cell.coastDist[i], 5);
    t[i] = land ? 1 + d : -(1 + Math.min(d, 2));
    f[i] = land ? 2 : cell.landWater[i] === LAND_WATER.LAKE ? 3 : 1;
  }
  const features = [0, { i: 1, type: "ocean", land: false, border: true }, { i: 2, type: "island", land: true, border: false }, { i: 3, type: "lake", land: false, border: false }];
  map.pack.cells = { biome, burg: zero(), culture: zero(), pop: zero(), river: zero(), state: zero(), religion: zero(), province: zero() };
  map.pack.states = [{ i: 0, name: "Neutrals" }];
  map.pack.cultures = [{ i: 0, name: "Wildlands" }];
  map.pack.religions = [{ i: 0, name: "No religion" }];
  map.pack.provinces = [0]; map.pack.burgs = [0];
  map.pack.features = features;
  map.grid = { ...map.grid, spacing: W / Math.sqrt(N * 2), cellsX: 0, cellsY: 0, boundary: [], points: [], features, h: h.slice(), f, t, temp: Array.from(cell.temp, Math.round), prec: Array.from(cell.precip, Math.round) };

  // ---- 河川（流量のある連なりを 1 本の線にする。合流点までを 1 本とする） ----
  map.pack.rivers = buildRivers(world);
  for (const r of map.pack.rivers) for (const c of r.cells) if (cell.landWater[c] === LAND_WATER.LAND) map.pack.cells.river[c] = r.i;

  map.geometry = { gridVoronoi: null, pack: buildGeometry(mesh, h, W, H), overrideReport: { applied: 0, skipped: 0, unsupported: false } };
  map.geometry.pack.g = Array.from({ length: N }, (_, i) => i);
  map.geometry.cellArea = Float32Array.from(cell.areaKm2, (a) => a / (kmPerUnit * kmPerUnit)); // 世界の面積（km²）を地図の単位²に直した値
  map.rev = { terrain: 1, politics: 1, places: 1 };
  return map;
}

/** 世界の一部のセルが変わったあと、地図側の導出値（バイオーム・高さ・海岸コード・気候）をそのセルだけ作り直す */
export function refreshMapCells(map, cells) {
  const w = map.world, cell = w.cell, c = map.pack.cells, g = map.grid, gh = map.geometry.pack.h;
  for (const i of cells) {
    const land = cell.landWater[i] === LAND_WATER.LAND, d = Math.min(cell.coastDist[i], 5), h = elevationToHeight(cell.elevation[i], land);
    c.biome[i] = land ? cell.biome[i] : 0; gh[i] = h; g.h[i] = h;
    g.t[i] = land ? 1 + d : -(1 + Math.min(d, 2));
    g.f[i] = land ? 2 : cell.landWater[i] === LAND_WATER.LAKE ? 3 : 1;
    g.temp[i] = Math.round(cell.temp[i]); g.prec[i] = Math.round(cell.precip[i]);
  }
}
/** 河川の線を世界から作り直す（河川のセルが変わったとき） */
export function refreshRivers(map) {
  map.pack.rivers = buildRivers(map.world); const rv = map.pack.cells.river; rv.fill(0);
  for (const r of map.pack.rivers) for (const c of r.cells) if (map.world.cell.landWater[c] === LAND_WATER.LAND) rv[c] = r.i;
}

/** セルの多角形・隣接・頂点（等距円筒）。継ぎ目と極を処理する */
function buildGeometry(mesh, h, W, H) {
  const N = mesh.cellCount, V = mesh.vertexXYZ.length / 3, vx = mesh.vertexXYZ;
  const frame = simFrame(W); // 球面 → 地図座標（sim）の変換は projection.js の 1 か所だけ。表示用の円筒図法は視点側（render/viewport）が適用する
  const vp = new Array(V), vv = new Array(V), vc = new Array(V);
  for (let t = 0; t < V; t++) {
    const lon = Math.atan2(vx[3 * t + 1], vx[3 * t]), lat = Math.asin(Math.max(-1, Math.min(1, vx[3 * t + 2])));
    vp[t] = frame.toSim(lat, lon).map(r2); vv[t] = []; vc[t] = [];
  }
  const p = new Array(N), cv = new Array(N), cc = new Array(N), cb = new Array(N), alt = new Array(N).fill(null), dup = new Map();
  const addV = (a, b) => { if (!vv[a].includes(b)) vv[a].push(b); if (!vv[b].includes(a)) vv[b].push(a); };
  const shifted = (t, shift) => { // 継ぎ目の外へずらした複製頂点（shift 周分ずらす）
    if (shift === 0) return t;
    const key = t + ":" + shift; let id = dup.get(key);
    if (id == null) { id = vp.length; vp.push([r2(vp[t][0] + shift * W), vp[t][1]]); vv.push(vv[t].slice()); vc.push(vc[t].slice()); dup.set(key, id); }
    return id;
  };
  const off = mesh.neighborOffsets, nb = mesh.neighborIds;
  for (let c = 0; c < N; c++) {
    const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1];
    const lon0 = Math.atan2(mesh.centerXYZ[3 * c + 1], mesh.centerXYZ[3 * c]), lat0 = Math.asin(Math.max(-1, Math.min(1, mesh.centerXYZ[3 * c + 2])));
    p[c] = frame.toSim(lat0, lon0).map(r2);
    const poly = cellViewPolygon(mesh, c), ids = [], shifts = [];
    for (let k = 0; k < e - s; k++) {
      const t = mesh.cellVertexIds[s + k];
      const canon = Math.atan2(vx[3 * t + 1], vx[3 * t]);
      const shift = Math.round((poly.lon[k] - canon) / (2 * Math.PI)); // 継ぎ目をまたいだ分（-1 / 0 / +1）
      shifts.push(shift); ids.push(shifted(t, shift));
    }
    if (!poly.wrapsPole) { // 継ぎ目をまたぐセルは、反対側の端にも同じ形を描く（描画専用の複製）
      let hi = false, lo = false; for (const id of ids) { if (vp[id][0] > W) hi = true; if (vp[id][0] < 0) lo = true; }
      if (hi || lo) alt[c] = ids.map((id, k) => shifted(mesh.cellVertexIds[s + k], shifts[k] + (hi ? -1 : 1)));
    }
    if (poly.wrapsPole) { // 極を囲むセル: 左端・右端の極の緯度に 2 点足して閉じる
      const y = poly.poleSign > 0 ? 0 : H, xs = ids.map((id) => vp[id][0]);
      const a = vp.length; vp.push([r2(Math.min(...xs)), y], [r2(Math.max(...xs)), y]); vv.push([], []); vc.push([c], [c]);
      ids.sort((i1, i2) => vp[i1][0] - vp[i2][0]); ids.unshift(a); ids.push(a + 1);
    }
    cv[c] = ids;
    for (let k = 0; k < ids.length; k++) { const a = ids[k], b = ids[(k + 1) % ids.length]; if (!vc[a].includes(c)) vc[a].push(c); if (a !== b) addV(a, b); }
    const list = new Array(off[c + 1] - off[c]); for (let k = off[c]; k < off[c + 1]; k++) list[k - off[c]] = nb[k];
    cc[c] = list; cb[c] = Math.abs(lat0) > 1.45 ? 1 : 0;
  }
  return { p, g: null, h: h.slice(), cells: { v: cv, c: cc, b: cb, alt }, vertices: { p: vp, v: vv, c: vc } };
}

/** 河川の線。world.cell.riverTo を辿り、合流点（すでに通った河川セル）か海までを 1 本とする */
function buildRivers(world) {
  const c = world.cell, N = world.mesh.cellCount, out = [], seen = new Uint8Array(N), hasUp = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (c.river[i] && c.riverTo[i] >= 0 && c.river[c.riverTo[i]]) hasUp[c.riverTo[i]] = 1;
  const heads = []; for (let i = 0; i < N; i++) if (c.river[i] && !hasUp[i]) heads.push(i);
  heads.sort((a, b) => c.riverFlow[b] - c.riverFlow[a] || a - b); // 決定的な順序
  for (const head of heads) {
    let cells = [], cur = head, guard = 0;
    const flush = (mouth) => { if (cells.length >= 2) out.push({ i: out.length + 1, source: cells[0], mouth, cells, discharge: Math.max(...cells.map((x) => c.riverFlow[x] || 0)), length: cells.length, name: "", type: "River" }); };
    while (cur >= 0 && guard++ < N) {
      if (cells.length && Math.abs(c.lon[cur] - c.lon[cells[cells.length - 1]]) > Math.PI) { flush(cells[cells.length - 1]); cells = []; } // 継ぎ目をまたぐ所で線を切る
      cells.push(cur);
      if (seen[cur] && cur !== head) break; // 合流
      seen[cur] = 1;
      const nx = c.riverTo[cur];
      if (nx < 0) break;
      if (!c.river[nx]) { cells.push(nx); break; } // 河口（海・湖）
      cur = nx;
    }
    flush(cells[cells.length - 1]);
  }
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;
export { BIOMES, LAND_WATER };
