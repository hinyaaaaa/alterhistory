// 球面世界の色分け（レイヤー）。セルごとの色を Uint8ClampedArray(V*4) に作る。ラスタ・ベクタの描画が共有する。
import { BIOMES, BIOME_NAMES, SOILS, RES, RES_NAMES, LAND_WATER } from "../core/world/worldgen.js";

export const WORLD_LAYERS = Object.freeze([
  { key: "biome", label: "バイオーム" }, { key: "elevation", label: "標高" }, { key: "temp", label: "気温" }, { key: "precip", label: "降水" },
  { key: "fertility", label: "肥沃度" }, { key: "soil", label: "土壌" }, { key: "resource", label: "資源" }, { key: "plate", label: "プレート" }, { key: "basin", label: "流域" },
]);
const BIOME_RGB = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
const SOIL_RGB = [[40, 60, 90], [120, 115, 110], [226, 204, 140], [150, 110, 70], [140, 100, 90], [90, 60, 60], [200, 220, 230], [110, 150, 80], [100, 90, 70], [50, 45, 40]];
export const SOIL_NAMES = ["なし", "岩", "砂", "ローム", "粘土", "火山灰土", "永久凍土", "沖積土", "ポドゾル", "黒土"];
const mix = (a, b, t) => a + (b - a) * t;
const hsv = (h, s, v) => { const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6), p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i]; return [r * 255, g * 255, b * 255]; };
const hash = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** 1 セルの色（RGB を out[0..2] に書く）。opt: { resource: ビット or 0 } */
export function writeCellColor(world, layer, c, opt, out) {
  const cell = world.cell, e = cell.elevation[c], sea = cell.landWater[c] === LAND_WATER.OCEAN;
  let col;
  switch (layer) {
    case "elevation": col = sea ? [20, 40 + 40 * Math.max(0, 1 + e / 5500), 110 + 60 * Math.max(0, 1 + e / 5500)] : [60 + 160 * Math.min(1, e / 7000), 120 + 90 * Math.min(1, e / 7000), 60 + 140 * Math.min(1, e / 7000)]; break;
    case "temp": { const t = Math.max(0, Math.min(1, (cell.temp[c] + 25) / 60)); col = [255 * t, 80 + 60 * (1 - Math.abs(t - 0.5) * 2), 255 * (1 - t)]; break; }
    case "precip": { const t = Math.min(1, cell.precip[c] / 3000); col = [230 - 200 * t, 230 - 120 * t, 200 + 50 * t]; break; }
    case "fertility": { const t = cell.fertility[c]; col = cell.landWater[c] !== LAND_WATER.LAND ? (sea ? [20, 50, 110] : [70, 130, 200]) : [230 - 200 * t, 220 - 40 * t, 120 - 80 * t]; break; }
    case "soil": col = sea ? [20, 50, 110] : SOIL_RGB[cell.soil[c]] ?? [128, 128, 128]; break;
    case "resource": {
      const bit = opt?.resource | 0, r = cell.resource[c];
      if (sea) col = bit && (r & bit) ? [250, 210, 60] : [20, 50, 110];
      else if (bit) col = (r & bit) ? [250, 210, 60] : [70 + 30 * Math.min(1, e / 3000), 80 + 30 * Math.min(1, e / 3000), 80];
      else { let n = 0; for (let b = 1; b <= 1024; b <<= 1) if (r & b && b !== RES.TIMBER && b !== RES.FISH && b !== RES.STONE) n++; col = [60 + 45 * n, 70 + 35 * n, 70]; }
      break;
    }
    case "plate": col = hsv(((cell.plate[c] * 0.61803) % 1), 0.45, sea ? 0.55 : 0.9); break;
    case "basin": { const b = cell.basin[c]; col = sea ? [20, 50, 110] : hsv(hash(b + 7), 0.5, 0.85); break; }
    default: { // biome（陸は標高で少し陰影）
      const b = cell.biome[c]; col = BIOME_RGB[b].slice();
      if (b === BIOMES.OCEAN) { const d = 0.55 + 0.45 * Math.max(0, 1 + e / 5500); col = col.map((v) => v * d); } else if (b !== BIOMES.LAKE) { const s = 0.75 + 0.25 * Math.min(1, e / 4000); col = col.map((v) => v * s); }
    }
  }
  out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
}

/** 全セルの色（RGBA）。dirty（セル番号の配列）を渡すと、その分だけ書き換える（colors は前回のものを渡す） */
export function colorizeCells(world, layer, opt = {}, colors = null, dirty = null) {
  const V = world.mesh.cellCount, out = colors ?? new Uint8ClampedArray(V * 4), tmp = [0, 0, 0];
  const put = (c) => { writeCellColor(world, layer, c, opt, tmp); out[4 * c] = tmp[0]; out[4 * c + 1] = tmp[1]; out[4 * c + 2] = tmp[2]; out[4 * c + 3] = 255; };
  if (dirty) for (const c of dirty) put(c); else for (let c = 0; c < V; c++) put(c);
  return out;
}

/** 凡例（色と名前） */
export function layerLegend(layer, opt = {}) {
  const rgb = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
  switch (layer) {
    case "biome": return BIOME_NAMES.map((n, i) => ({ color: rgb(BIOME_RGB[i]), label: n }));
    case "soil": return SOIL_NAMES.slice(1).map((n, i) => ({ color: rgb(SOIL_RGB[i + 1]), label: n }));
    case "elevation": return [{ color: "rgb(20,60,140)", label: "深海（−5500 m）" }, { color: "rgb(60,120,60)", label: "低地" }, { color: "rgb(150,170,110)", label: "高地" }, { color: "rgb(220,210,200)", label: "高山（7000 m）" }];
    case "temp": return [{ color: "rgb(0,80,255)", label: "−25℃" }, { color: "rgb(130,100,130)", label: "5℃" }, { color: "rgb(255,80,0)", label: "35℃" }];
    case "precip": return [{ color: "rgb(230,230,200)", label: "乾燥（0 mm）" }, { color: "rgb(30,110,250)", label: "多雨（3000 mm 以上）" }];
    case "fertility": return [{ color: "rgb(230,220,120)", label: "低い（0）" }, { color: "rgb(30,180,40)", label: "高い（1）" }];
    case "resource": return opt.resource ? [{ color: "rgb(250,210,60)", label: `${RES_NAMES[opt.resource]}がある` }] : [{ color: "rgb(105,105,70)", label: "鉱物の種類が多いほど明るい" }];
    case "plate": return [{ color: "rgb(150,200,160)", label: "プレートごとに別の色" }];
    case "basin": return [{ color: "rgb(150,200,160)", label: "流域ごとに別の色（海へ注ぐ川ごと）" }];
    default: return [];
  }
}
export { BIOME_NAMES, RES_NAMES, SOILS, RES };
