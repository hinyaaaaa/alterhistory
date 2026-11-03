// v6.1.0 M2: 生態系（動植物・野生生物・食物供給・生息域・環境容量）の集約モデル。仕様 §4.4。
//   ・個体は追わない。セルごとの 3 つの量（0〜1）で集約する: flora=食用植物・バイオマス、fauna=狩猟・漁獲の対象となる動物、deg=土地の劣化（地力の消耗・過放牧・森林の伐採）。
//   ・潜在量（その土地が気候・地形・水系から支えられる上限）は世界の配列から導く（保存しない）。実際の量は、気候の変化・人間の活動（狩猟・耕作・放牧）と相互作用して動く。
//   ・導入は段階的: 最初は採集・狩猟の圧力だけが効き、農耕・牧畜の技術を持つ集団が現れて初めて劣化・過放牧が起こる（最初から現代的な農業を置かない）。
//   ・人口への影響は ecoMult()（0.55〜1.15 の倍率）で収容力に掛かる。環境悪化・資源枯渇は、飢饉・移住・社会の不安定として人口・政治へ伝わる。
//   ・先史（粗い時間刻み）と月次（年に1回）は同じ stepEco() を、経過年数 dt で呼ぶ（dt に対して安定な指数緩和）。
import { BIOMES, LAND_WATER } from "../../civ/world-consts.js";

const FAUNA_BIOME = { [BIOMES.SAVANNA]: 1.0, [BIOMES.GRASSLAND]: 0.9, [BIOMES.TROPICAL_SEASONAL]: 0.85, [BIOMES.TEMPERATE_FOREST]: 0.75, [BIOMES.RAINFOREST]: 0.65, [BIOMES.WETLAND]: 0.8, [BIOMES.TAIGA]: 0.45, [BIOMES.TUNDRA]: 0.4, [BIOMES.ALPINE]: 0.3, [BIOMES.COLD_DESERT]: 0.2, [BIOMES.HOT_DESERT]: 0.12, [BIOMES.ICE]: 0.05 };
const FLORA_BIOME = { [BIOMES.RAINFOREST]: 1.0, [BIOMES.TROPICAL_SEASONAL]: 0.9, [BIOMES.TEMPERATE_FOREST]: 0.85, [BIOMES.SAVANNA]: 0.65, [BIOMES.GRASSLAND]: 0.7, [BIOMES.WETLAND]: 0.8, [BIOMES.TAIGA]: 0.5, [BIOMES.TUNDRA]: 0.25, [BIOMES.ALPINE]: 0.2, [BIOMES.COLD_DESERT]: 0.15, [BIOMES.HOT_DESERT]: 0.08, [BIOMES.ICE]: 0.02 };
const TAU = { flora: 6, fauna: 30, deg: 400 };       // 回復の時定数（年）。動物は増えるのが遅く、地力の回復はもっと遅い
const q3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/** 潜在量（気候・地形・水系から）。ice: 氷期の強さ 0〜1（高緯度ほど潜在量が落ちる）。保存しない派生値 */
export function potentialAt(world, c, laws, ice = 0) {
  const ce = world.cell, b = ce.biome[c]; if (ce.landWater[c] !== LAND_WATER.LAND) return { flora: 0, fauna: 0 };
  const lat = Math.abs(ce.lat[c]) * 180 / Math.PI, ik = 1 - ice * 0.65 * clamp((lat - 35) / 35), water = ce.river[c] || ce.coastDist[c] <= 2 ? 1.1 : 1, fert = 0.55 + 0.6 * ce.fertility[c];
  return { flora: clamp((FLORA_BIOME[b] ?? 0.3) * fert * ik * (laws?.fertilityScale ?? 1)), fauna: clamp((FAUNA_BIOME[b] ?? 0.3) * (0.6 + 0.5 * ce.fertility[c]) * water * ik * (laws?.faunaRichness ?? 1)) };
}
/** 生態系の初期状態: 潜在量そのもの（人の手の入っていない自然）。派生を除き保存する */
export function initEco(world, laws, ice = 0) {
  const N = world.mesh.cellCount, flora = new Array(N).fill(0), fauna = new Array(N).fill(0), deg = new Array(N).fill(0);
  for (let c = 0; c < N; c++) { const p = potentialAt(world, c, laws, ice); flora[c] = q3(p.flora); fauna[c] = q3(p.fauna); }
  return { v: 1, flora, fauna, deg, last: null, stats: { hunted: 0, tilled: 0 } };
}
/** 1 回の更新。groups: 人間の活動（集団の領域の圧力）。dt: 経過年数。ice: 氷期の強さ。rest: 回復の速さの倍率（ecoResilience） */
export function stepEco(world, civ, groups, dt, { ice = 0, laws = civ.wcde.config.laws, cellsOf = (g) => g.cells ?? [g.cell] } = {}) {
  const eco = (civ.eco ??= initEco(world, laws, ice)), N = world.mesh.cellCount, res = laws.ecoResilience ?? 1;
  const hunt = new Float32Array(N), till = new Float32Array(N), graze = new Float32Array(N);
  for (const g of groups) {
    const cells = cellsOf(g), n = Math.max(1, cells.length), p = clamp(g.pressure ?? 0, 0, 2) / n, k = g.knowledge ?? {};
    for (const c of cells) {
      if (g.subsistence === "agriculture" && (k.agriculture ?? 0) >= 1) till[c] += p; else if (g.subsistence === "pastoral" && (k.herding ?? 0) >= 1) graze[c] += p; else hunt[c] += p;
      if (g.subsistence !== "agriculture") hunt[c] += 0.25 * p; // 農耕民も狩猟・採集を補う
    }
  }
  const kf = 1 - Math.exp(-dt * res / TAU.flora), kn = 1 - Math.exp(-dt * res / TAU.fauna), kd = 1 - Math.exp(-dt * res / TAU.deg);
  let hs = 0, ts = 0;
  for (let c = 0; c < N; c++) {
    const pot = potentialAt(world, c, laws, ice); if (pot.flora === 0 && pot.fauna === 0) continue;
    // 劣化: 耕作と過放牧が地力を消耗させる（回復は遅い）。休めば戻る
    let d = eco.deg[c]; const dUp = (0.012 * till[c] + 0.02 * graze[c]) * dt; d = clamp(d + dUp - kd * d * (till[c] + graze[c] > 0.05 ? 0.15 : 1)); eco.deg[c] = q3(d); ts += till[c] + graze[c];
    // 植物: 潜在量 × 地力 × 放牧の食害へ緩和
    const tf = pot.flora * (1 - 0.7 * d) * (1 - 0.35 * clamp(graze[c])) * (1 - 0.15 * clamp(till[c])); eco.flora[c] = q3(clamp(eco.flora[c] + (tf - eco.flora[c]) * kf));
    // 動物: 植物に支えられる潜在量へ緩和。狩猟圧が高いと目標が下がる（乱獲）
    const tn = pot.fauna * Math.pow(Math.max(0.05, eco.flora[c] / Math.max(0.05, pot.flora)), 0.6) * (1 - 0.8 * clamp(hunt[c] * 1.4)); eco.fauna[c] = q3(clamp(eco.fauna[c] + (tn - eco.fauna[c]) * kn)); hs += hunt[c];
  }
  eco.last = civ.monthIndex; eco.stats.hunted = q3(hs); eco.stats.tilled = q3(ts); return eco;
}
const ecoCache = new WeakMap();
/** 集団の領域の「生態系の健全さ」（0〜1）。生業ごとに効く量が違う（採集は動植物の両方、農耕は地力、牧畜は植物、漁撈は動物） */
export function ecoHealth(world, civ, g, cellsOf = (x) => x.cells ?? [x.cell]) {
  const eco = civ.eco; if (!eco) return 1; const cells = cellsOf(g); let f = 0, a = 0, d = 0, n = 0;
  for (const c of cells) { const p = potentialAt(world, c, civ.wcde?.config?.laws); if (p.flora === 0 && p.fauna === 0) continue; n++; f += p.flora > 0 ? eco.flora[c] / p.flora : 1; a += p.fauna > 0 ? eco.fauna[c] / p.fauna : 1; d += eco.deg[c]; }
  if (!n) return 1; f = clamp(f / n); a = clamp(a / n); d /= n;
  switch (g.subsistence) { case "agriculture": return clamp(1 - d * 0.9); case "pastoral": return clamp(0.2 + 0.8 * f); case "fishing": return clamp(0.3 + 0.7 * a); default: return clamp(0.15 + 0.45 * f + 0.4 * a); }
}
/** 収容力への倍率（0.55〜1.15）。健全なら少し増え、荒廃すれば大きく減る */
export const ecoMult = (world, civ, g) => 0.55 + 0.6 * ecoHealth(world, civ, g);
/** 月次の tick（ecosystem フェーズ・年に1回）。人間の活動と気候から、資源量・劣化を更新する */
export function stepEcosystem(ctx) {
  const { world, civ } = ctx; if (!civ.options.wcde) return;
  const mi = civ.monthIndex, laws = civ.wcde.config.laws, cl = civ.climate?.index ?? 0, ice = clamp(-cl * 0.4); // 気候指数が負（寒冷化）のとき、氷期的な影響
  const groups = Object.values(civ.groups), before = civ.eco ? civ.eco.stats.hunted : 0;
  stepEco(world, civ, groups, 1, { ice, laws }); void before;
}
/** 診断・UI 用の集計（派生）。世界全体の資源量の平均と、荒廃したセルの割合 */
export function ecoSummary(world, civ) {
  const eco = civ.eco; if (!eco) return null; const N = world.mesh.cellCount; let n = 0, f = 0, a = 0, bad = 0;
  for (let c = 0; c < N; c++) { if (world.cell.landWater[c] !== LAND_WATER.LAND) continue; n++; f += eco.flora[c]; a += eco.fauna[c]; if (eco.deg[c] > 0.4) bad++; }
  return n ? { cells: n, flora: q3(f / n), fauna: q3(a / n), degraded: q3(bad / n) } : null;
}
/** 整合性: 値は有限で 0〜1、配列の長さはセル数と一致 */
export function checkEco(world, civ) {
  const errs = [], e = civ.eco; if (!e) return errs; const N = world.mesh.cellCount;
  for (const k of ["flora", "fauna", "deg"]) { if (!Array.isArray(e[k]) || e[k].length !== N) { errs.push(`eco.${k} の長さがセル数と合わない`); continue; } for (let i = 0; i < N; i++) { const v = e[k][i]; if (!(v >= 0 && v <= 1)) { errs.push(`eco.${k}[${i}] が 0〜1 でない: ${v}`); break; } } }
  return errs;
}
