// 国家の戦争ドクトリン（doctrine）の編集。
// HOI4に倣い、ドクトリンは部隊ごとではなく国家が1つだけ選ぶ恒久的な国是として扱う
// （実際の戦力計算は core/sim/units.js の attackDamage、適用は core/sim/battle.js）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";
import { DOCTRINES, DOCTRINE_BY_KEY, DEFAULT_DOCTRINE } from "../sim/units.js";

export { DOCTRINES, DEFAULT_DOCTRINE };

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 国家の現在のドクトリン（未設定なら既定値を補って返す。mapは書き換えない） */
export function getDoctrine(map, stateId) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) return null;
  return DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
}

/** @returns {object|null} 変更が無ければ null */
export function planSetDoctrine(map, stateId, doctrineKey) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) throw new Error("存在しない国家です");
  if (!DOCTRINE_BY_KEY[doctrineKey]) throw new Error("不明なドクトリンです");
  const before = DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
  if (before === doctrineKey) return null;
  const label = DOCTRINE_BY_KEY[doctrineKey].label;
  return makeCommand(`戦争ドクトリンの変更（${s.name}: ${label}）`, [], [setProps(s, { doctrine: doctrineKey })]);
}
