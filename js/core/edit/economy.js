// 国家の技術水準（techLevel）の編集。値そのものの意味・成長率換算は core/sim/economy.js。
// ここは「UIから技術水準を変更してUndoできるようにする」ための配線だけを持つ。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";
import { TECH_MIN, TECH_MAX, clampTech } from "../sim/economy.js";

export { TECH_MIN, TECH_MAX };

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 国家の現在の技術水準（未設定なら既定の3を補って返す。mapは書き換えない） */
export function getTechLevel(map, stateId) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) return null;
  return typeof s.techLevel === "number" ? clampTech(s.techLevel) : 3;
}

/** @returns {object|null} 変更が無ければ null */
export function planSetTechLevel(map, stateId, value) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) throw new Error("存在しない国家です");
  const after = clampTech(value);
  const before = typeof s.techLevel === "number" ? clampTech(s.techLevel) : 3;
  if (before === after) return null;
  return makeCommand(`技術水準の変更（${s.name}）`, [], [setProps(s, { techLevel: after })]);
}
