// 経済の制約のうち、軍の編成（military.js）が使う2つ。capacity.js（国家タブの表示）とは、読み込みの循環を避けるために分けてある。
// 純粋ロジック層：DOM に依存しない。
import { getIndicators } from "./pressure.js";
import { getTechDoctrine } from "../edit/doctrines.js";
import { BALANCE } from "./balance.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 重い兵科にかける産業力の係数（0〜1）。産業が300あれば満額。工業が進んでいるほど同じ産業で多く作れる */
export function industrialFactor(state) {
  const ind = getTechDoctrine(state).ind;
  return Math.min(1, ((state.industry ?? 0) / 300) * clamp(0.75 + 0.05 * ind, 0.8, 1.25));
}

/** 徴兵の目標にかける、食料の係数。釣り合っていれば 1。足りなければ最大で 0.6 まで下がる */
export function foodConscriptionFactor(map, stateId) {
  const k = BALANCE.causalStrength ?? 1; if (!(k > 0)) return 1;
  let ind = null; try { ind = getIndicators(map).get(stateId); } catch { return 1; }
  if (!ind || ind.food >= 1) return 1;
  return 1 - (1 - clamp(0.55 + 0.45 * ind.food, 0.6, 1)) * k;
}
