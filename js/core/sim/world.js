// 世界の年次更新：経済（人口・産業）と徴兵をまとめて1回のコマンドにする。
// 時間進行（advanceMonth で year が変わったタイミング）から呼ばれる想定。
//
// 純粋ロジック層：DOM に依存しない。

import { setProps, makeCommand } from "../edit/commands.js";
import { ensureEconomy, computeAnnualUpdate } from "./economy.js";
import { ratesParts } from "./currency.js";
import { planAnnualConscription, regimentsOf } from "./military.js";
import { UNIT_BY_KEY } from "./units.js";
import { computeTrade, annualRevenue, getFinance } from "./trade.js";

/** 兵科ごとの維持費の重み（歩兵=1 を基準。機甲・航空・海軍ほど高い）。仮置きの値 */
const UPKEEP_WEIGHT = { infantry: 1, armor: 8, air: 15, navy: 25, special: 3, advanced: 6, nuclear: 100 };
const UPKEEP_FACTOR = 0.2;   // 重み付き兵力が人口(千人)あたり1.0のとき、税収の20%を軍事費にする
const UPKEEP_MAX = 0.8;      // 軍事費は税収の80%まで（それ以上は借金にせず、ここで頭打ち）

/** 軍の維持費が税収に占める割合 0〜0.8。兵力が無ければ 0。 */
export function militaryBurden(state) {
  let weighted = 0;
  for (const reg of regimentsOf(state)) for (const [k, n] of Object.entries(reg.u ?? {})) if (UNIT_BY_KEY[k] && n > 0) weighted += n * (UPKEEP_WEIGHT[k] ?? 1);
  if (!weighted) return 0;
  const popK = Math.max(1, ((state.rural ?? 0) + (state.urban ?? 0)) / 1000);
  return Math.min(UPKEEP_MAX, (weighted / popK) * UPKEEP_FACTOR);
}

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/**
 * 全ての実在国家に対して、年次更新（人口・産業・徴兵）を1つのコマンドにまとめて返す。
 * 変化が無い国家（人口0など）はスキップされる。
 */
export function planAnnualUpdate(map, rnd = null) {
  const parts = [];
  // 税収: 今年の人口・取引で計算し、軍の維持費を引いて国庫に足す（Azgaar 本家は毎回リセットするが、ここは年々ためる）
  const trade = computeTrade(map);
  for (const state of map.pack.states) {
    if (!isLive(state)) continue;
    ensureEconomy(state);
    const revenue = annualRevenue(trade.states.get(state.i));
    if (revenue > 0) {
      const net = revenue * (1 - militaryBurden(state)); // 軍の維持費を引いた分が国庫に入る
      parts.push(setProps(state, { treasury: Math.round((getFinance(state).treasury + net) * 100) / 100 }));
    }
    const { rural, urban, industry } = computeAnnualUpdate(state);
    const peak = Math.max(state.popPeak ?? 0, rural + urban); // 過去最大の人口（崩壊の判定に使う）
    // 士気は年ごとに平時の水準(70)へ近づく（戦争や核の打撃からの立ち直り）
    const morale = state.morale == null ? null : Math.max(0, Math.min(100, state.morale + Math.max(-5, Math.min(5, 70 - state.morale))));
    if (rural !== state.rural || urban !== state.urban || industry !== state.industry || peak !== state.popPeak || (morale != null && morale !== state.morale)) {
      parts.push(setProps(state, { rural, urban, industry, popPeak: peak, ...(morale != null ? { morale } : {}) }));
    }
    const conscription = planAnnualConscription(map, state.i);
    if (conscription) parts.push(...conscription.parts);
  }
  if (rnd) parts.push(...ratesParts(map, rnd)); // 為替レートも年ごとに動く
  if (!parts.length) return null;
  return makeCommand("年次更新（人口・産業・徴兵・税収・為替）", ["politics", "places"], parts);
}
