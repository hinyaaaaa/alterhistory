// 国の「安定度」（v2.4.1）: 民意・戦争・直近の出来事・指導者の継承を合わせた、3段階の表示。
//   国家タブの国家情報に出す。表示専用で、シミュレーションの計算には使わない（純粋ロジック層）。
//
//   点数 = 民意（0〜100。値なしは既定の70）
//          − 戦争（参戦中の戦争1件ごとに −10。内戦は −20。合計の下限は −30）
//          − 指導者の継承（「争いあり」−10、「大きな混乱」−25）
//          − 直近12か月の出来事（反乱・消耗・分離独立・宗教の分裂などが、この国に関わるごとに −6。合計の下限は −18）
//   段階: 55点以上 = 安定 / 35〜54点 = 不安 / 34点以下 = 危機
import { supportOf } from "../sim/war-engine.js";
import { warsOf } from "./wars.js";
import { leaderRecord } from "./leaders.js";
import { listHistory } from "./history-log.js";

export const STABILITY_LEVELS = Object.freeze([
  { key: "stable", label: "安定", min: 55 },
  { key: "uneasy", label: "不安", min: 35 },
  { key: "crisis", label: "危機", min: -Infinity },
]);
export const WAR_PENALTY = 10, CIVIL_WAR_PENALTY = 20, WAR_PENALTY_MAX = 30;
export const LEADER_PENALTY = Object.freeze({ dispute: 10, chaos: 25 });
export const EVENT_PENALTY = 6, EVENT_PENALTY_MAX = 18, EVENT_WINDOW_MONTHS = 12;
export const UNSETTLING_EVENTS = Object.freeze(["rebellion", "exhaustion", "independence", "schism", "withdrawal"]);

/** @returns {{key:string,label:string,score:number,factors:{label:string,delta:number}[]}} */
export function nationStability(map, state) {
  const factors = [{ label: "民意", delta: Math.round(supportOf(state)) }];
  const wars = warsOf(map, state.i).filter((w) => !w.endedAt);
  if (wars.length) {
    const pen = Math.min(WAR_PENALTY_MAX, wars.reduce((n, w) => n + (w.type === "civil" ? CIVIL_WAR_PENALTY : WAR_PENALTY), 0));
    factors.push({ label: `戦争${wars.length}件`, delta: -pen });
  }
  const stab = leaderRecord(map, state.i)?.current?.stability;
  if (LEADER_PENALTY[stab]) factors.push({ label: stab === "chaos" ? "継承の大きな混乱" : "継承の争い", delta: -LEADER_PENALTY[stab] });
  const now = (map.worldTime?.year ?? 0) * 12 + (map.worldTime?.month ?? 1);
  const recent = listHistory(map).filter((h) => UNSETTLING_EVENTS.includes(h.type) && (h.states ?? []).includes(state.i) && h.year != null && now - (h.year * 12 + (h.month ?? 1)) <= EVENT_WINDOW_MONTHS && now >= h.year * 12 + (h.month ?? 1));
  if (recent.length) factors.push({ label: `直近の出来事${recent.length}件`, delta: -Math.min(EVENT_PENALTY_MAX, recent.length * EVENT_PENALTY) });
  const score = factors.reduce((n, f) => n + f.delta, 0);
  const level = STABILITY_LEVELS.find((l) => score >= l.min);
  return { key: level.key, label: level.label, score, factors };
}
