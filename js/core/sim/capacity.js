// 経済を「数値」から「制約」へ（v2.7.0）。国庫や産業の数値そのものより、「何ができて、何ができないか」を決める。
//   ・食料の需給   → 人口の増え方・飢饉の起きやすさ・徴兵できる数（食料が足りないと、兵を養えない）
//   ・産業力       → 機甲・航空・海軍など重い兵科を、どこまで増やせるか
//   ・財政の余力   → 軍事費に食われた残りが、技術の進みを支える
// ここは、制約を求める関数と、国家タブに出す「いまの制約と、その理由」を作る。
// 純粋ロジック層：DOM に依存しない。
import { getIndicators } from "./pressure.js";
import { industrialFactor } from "./limits.js";
import { BALANCE } from "./balance.js";
import { militaryBurden } from "./world.js";
import { trinityOf } from "./tech-progress.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 国家タブ用: いまの制約。{ key, label, level: "ok"|"warn"|"bad", value, text }[]
 */
export function constraintReport(map, stateId, date = map.worldTime ?? { year: 1, month: 1 }) {
  const s = map.pack.states[stateId]; if (!s) return [];
  const ind = getIndicators(map, date).get(stateId); if (!ind) return [];
  const out = [], pct = (v) => `${Math.round(v * 100)}%`;
  const lvl = (v, warn, bad) => (v < bad ? "bad" : v < warn ? "warn" : "ok");
  out.push({ key: "food", label: "食料", level: lvl(ind.food, 0.95, 0.75), value: ind.food, text: ind.food >= 0.95 ? `食料は足りている（需給 ${ind.food.toFixed(2)}）` : `食料が不足（需給 ${ind.food.toFixed(2)}）→ 人口の増加が鈍り、飢饉が起きやすく、徴兵も減る` });
  const f = industrialFactor(s);
  out.push({ key: "industry", label: "産業力", level: lvl(f, 0.8, 0.4), value: f, text: f >= 0.95 ? "重装備（機甲・航空・海軍）を十分に作れる産業がある" : `産業力が足りない → 重装備の増強目標は ${pct(0.2 + 0.8 * f)} に抑えられる` });
  const burden = militaryBurden(s), slack = clamp(ind.fiscalSlack - 0.6 * burden, 0.15, 1.2);
  out.push({ key: "fiscal", label: "財政の余力", level: lvl(slack, 0.7, 0.4), value: slack, text: slack >= 0.7 ? `財政に余力がある（軍事費 ${pct(burden)}）` : `軍事費・余波・戦争で財政が苦しい（軍事費 ${pct(burden)}）→ 技術の進みが遅れる` });
  const tri = trinityOf(map, stateId, date);
  if (tri) out.push({ key: "trinity", label: "三位一体", level: lvl(tri.trinity, 0.8, 0.5), value: tri.trinity, text: `産業力 ${tri.I.toFixed(2)} × 経済力 ${tri.E.toFixed(2)} × 技術力 ${tri.T.toFixed(2)}（どれか1つが欠けると技術の進みが鈍る）` });
  return out;
}
