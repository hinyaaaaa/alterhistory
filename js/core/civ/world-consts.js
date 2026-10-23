// 球面世界の列挙値の写し。文明層は世界の「コード」を import せず、世界の「データ配列」だけを読む（v5.0.0 の決定。tests/v400-architecture.test.mjs）。
// 本体（core/world/worldgen.js）と一致していることは tests/v500-civ-m0-m1.test.mjs が検査する。
export const LAND_WATER = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
export const BIOMES = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
