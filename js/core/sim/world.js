// 世界の年次更新：経済（人口・産業）と徴兵をまとめて1回のコマンドにする。
// 時間進行（advanceMonth で year が変わったタイミング）から呼ばれる想定。
//
// 純粋ロジック層：DOM に依存しない。

import { setProps, makeCommand } from "../edit/commands.js";
import { ensureEconomy, computeAnnualUpdate } from "./economy.js";
import { planAnnualConscription } from "./military.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/**
 * 全ての実在国家に対して、年次更新（人口・産業・徴兵）を1つのコマンドにまとめて返す。
 * 変化が無い国家（人口0など）はスキップされる。
 */
export function planAnnualUpdate(map) {
  const parts = [];
  for (const state of map.pack.states) {
    if (!isLive(state)) continue;
    ensureEconomy(state);
    const { rural, urban, industry } = computeAnnualUpdate(state);
    if (rural !== state.rural || urban !== state.urban || industry !== state.industry) {
      parts.push(setProps(state, { rural, urban, industry }));
    }
    const conscription = planAnnualConscription(map, state.i);
    if (conscription) parts.push(...conscription.parts);
  }
  if (!parts.length) return null;
  return makeCommand("年次更新（人口・産業・徴兵）", ["politics", "places"], parts);
}
