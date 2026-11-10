// v6.8.0: 世界の較正（史実の規模に合わせる）。純粋ロジック（乱数・時刻・DOM 非依存）。
//   世界の年 0 を「国家形成の起点」（史実の紀元前 3000 年ごろ・約 1,400 万人）とし、年 5000 を現代（約 61 億人・現代技術がほぼ解放済み）に対応させる。
//   ・人口: 技術による収容力（techfx.densityMult）が本体。それが目標の曲線から大きく外れたときだけ、世界全体の係数 civ.popTrim を年に 1 度ゆっくり補正する（0.3〜3 倍）。
//   ・技術: 発見された技術の数が目標から外れると、発生率に掛ける係数 civ.techPace を年に 1 度補正する（0.15〜10 倍。tech.js の accel が掛ける）。
//   ・どちらも deadband（許容幅）の内側では何もしない。創造主の災厄などで大きく落ちたときの回復を、補正が不自然に早めすぎないようにする。
import { LAND_WATER } from "./world-consts.js";

const EARTH_LAND_KM2 = 149.8e6;
/** 史実の世界人口（McEvedy & Jones ほか）。[世界の年, 人口]。年 0=紀元前 3000 年、年 3000=紀元 0 年、年 5000=2000 年 */
export const POP_CURVE = Object.freeze([[0, 14e6], [1000, 27e6], [2000, 50e6], [2500, 100e6], [3000, 230e6], [3500, 235e6], [4000, 270e6], [4300, 400e6], [4500, 460e6], [4700, 600e6], [4800, 990e6], [4900, 1650e6], [4950, 2500e6], [5000, 6100e6]]);
/** 発見された技術の目標数（全 129 のうち）。年 5000 で 9 割以上（≥117） */
export const TECH_CURVE = Object.freeze([[0, 23], [1000, 33], [2000, 48], [3000, 62], [4000, 74], [4300, 82], [4600, 92], [4800, 102], [4900, 112], [4950, 118], [5000, 122]]);

const interp = (pts, y, logY) => {
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) { const [x1, v1] = pts[i], [x0, v0] = pts[i - 1]; if (y <= x1) { const t = (y - x0) / (x1 - x0); return logY ? Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0))) : v0 + t * (v1 - v0); } }
  const [xl, vl] = pts[pts.length - 1]; return logY ? vl * (1 + 0.3 * Math.min(1, (y - xl) / 5000)) : vl; // 年 5000 以降はゆっくり（+30% まで）
};
export const targetPop = (year) => interp(POP_CURVE, year, true);
export const targetTechCount = (year) => interp(TECH_CURVE, year, false);

const landCache = new WeakMap();
/** 世界の陸の面積（km²）。世界ごとに 1 度だけ計算する（派生データ） */
export function landKm2(world) { let v = landCache.get(world); if (v == null) { v = 0; const c = world.cell, n = world.mesh.cellCount; for (let i = 0; i < n; i++) if (c.landWater[i] === LAND_WATER.LAND) v += c.areaKm2[i]; landCache.set(world, v); } return v; }

/** 技術の列（col）ごとの、史実の時代に対応する目標の年（世界の年）。この年を過ぎても発見されていない技術は、発生率が上がる（遅れた分だけ。起点の技術が遅れると、その先の系統が丸ごと止まるため） */
export const COL_TARGET_YEAR = Object.freeze({ 0: 0, 1: 0, 2: 0, 3: 200, 4: 900, 5: 1800, 6: 2600, 7: 3200, 8: 3900, 9: 4300, 10: 4700, 11: 4850, 12: 4930, 13: 4970 });
/** 遅れの係数（1〜60）。目標の年から 150 年遅れるごとに加速が増す（二次）。先史（年 < 0）は 1 */
export const lateBoost = (year, col) => { const late = (year - (COL_TARGET_YEAR[col] ?? 5000)) / 150; return late <= 0 ? 1 : Math.min(60, 1 + late * late * 2); };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const POP_DEADBAND = [0.7, 1.4], TECH_DEADBAND = [0.85, 1.15];
/** 先史の終わり（年 0）に、世界の人口を史実の起点（約 1,400 万人 × 陸の面積比）へそろえる（v6.8.0）。
 *  先史の人口はシードと解像度で 100 万〜1,000 万人台にばらついた（解像度が違うと 7 倍の差）。各集団の人口と収容力の係数（popTrim）を同じ倍率で掛けるので、飢饉や急な増減は起きない。倍率は 0.25〜20 */
export function calibrateStart(world, civ) {
  let pop = 0; for (const id in civ.groups) pop += civ.groups[id].pop; if (pop <= 0) return 1;
  const f = clamp((targetPop(0) * (landKm2(world) / EARTH_LAND_KM2)) / pop, 0.25, 20);
  for (const id in civ.groups) civ.groups[id].pop *= f;
  civ.popTrim = Math.round(f * 1000) / 1000; return f;
}
/** 年 1 回（毎年 1 月）。世界の人口と発見数を目標へ寄せる。WCDE の世界だけ */
export function stepCalibration(ctx) {
  const { world, civ } = ctx; if (!civ.options?.wcde) return;
  const year = civ.date.year; if (year < 0) return;
  let pop = 0; for (const id in civ.groups) pop += civ.groups[id].pop;
  const target = targetPop(year) * (landKm2(world) / EARTH_LAND_KM2), r = pop / Math.max(1, target);
  let trim = civ.popTrim ?? 1;
  if (r < POP_DEADBAND[0] || r > POP_DEADBAND[1]) trim = clamp(trim * Math.pow(1 / Math.max(0.05, r), 0.1), 0.3, 20);
  civ.popTrim = Math.round(trim * 1000) / 1000;
  const have = Object.keys(civ.techWorld).length, want = targetTechCount(year), q = (want + 3) / (have + 3);
  let pace = civ.techPace ?? 1;
  const goal = q >= TECH_DEADBAND[0] && q <= TECH_DEADBAND[1] ? 1 : clamp(Math.pow(q, 3), 0.5, 10);
  pace = clamp(pace + (goal - pace) * 0.3, 0.5, 10);
  civ.techPace = Math.round(pace * 1000) / 1000;
}
