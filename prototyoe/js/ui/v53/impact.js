// v5.3 UI: 重大イベントの影響度評価（指示書 5.4 / 7.2）。
//   score = 種類の基本値 + 世界規模に対する相対値の加点。種類だけでは止めない。
//   「人口」「領土」「関与国」は、世界全体に対する割合で評価する（小さい世界と大きい世界で同じ絶対値にならない）。
//   重みと閾値は仮の値。複数シードの長期統計で調整する（IMPACT_WEIGHTS / MAJOR_THRESHOLD を差し替えるだけでよい）。
import { clamp } from "./format.js";

// 入力が NaN・undefined・文字列でも、評価全体を壊さない（壊れると重大判定が黙って外れる）
const num = (x) => (Number.isFinite(x) ? x : 0);

export const MAJOR_THRESHOLD = 1.0;
export const NOTABLE_THRESHOLD = 0.45; // 通常通知として「目立たせる」下限（これ未満は軽微）

// 種類ごとの基本値（これだけで MAJOR_THRESHOLD に届く種類は無い）
export const BASE_SCORE = Object.freeze({
  state_formed: 0.35, state_dissolved: 0.45, war_declared: 0.3, war_ended: 0.3,
  disaster_struck: 0.15, famine: 0.1, climate_shift: 0.2, conquest: 0.25, territory_occupied: 0.15,
  tech_discovered: 0.1, tech_transferred: 0.05, tech_lost: 0.2, religion_founded: 0.15, magic_org_founded: 0.2, magic_incident: 0.2,
  treaty_signed: 0.1, leader_succession: 0.05,
});
export const IMPACT_WEIGHTS = Object.freeze({
  popLoss: 6,        // 世界人口に対する被害割合（5% で +0.3）
  territory: 3,      // 世界の陸地に対する、領土が動いた割合
  actorPop: 2.5,     // 関与主体の人口が世界人口に占める割合
  actorCount: 1.0,   // 関与国数 / 存続国数（上限 1 で打ち切り）
  ripple: 0.08,      // 後続への波及（直接の結果の件数。5 件で打ち切り）
  player: 0.45,      // プレイヤー国家が当事者
});

/**
 * @param ev     { kind, impact?: { popLossShare, territoryShare, actorPopShare, actorCount, ripple, player } }
 * @param scale  { states: 存続国数 } 世界規模（割合の分母は ev.impact 側で済ませてある。国数だけ必要）
 * @returns { score, major, notable, reasons: [{ key, label, value }] }
 */
export function evaluateImpact(ev, scale = {}, { threshold = MAJOR_THRESHOLD, weights = IMPACT_WEIGHTS, base = BASE_SCORE } = {}) {
  const imp = ev?.impact ?? {}, reasons = [];
  const add = (key, label, value) => { if (value > 0.0005) reasons.push({ key, label, value: Math.round(value * 1000) / 1000 }); return value; };
  let score = add("kind", "出来事の種類", base[ev?.kind] ?? 0.05);
  score += add("popLoss", "人口の被害", weights.popLoss * clamp(num(imp.popLossShare), 0, 1));
  score += add("territory", "領土の変動", weights.territory * clamp(num(imp.territoryShare), 0, 1));
  score += add("actorPop", "関与した国の規模", weights.actorPop * clamp(num(imp.actorPopShare), 0, 1));
  const states = Math.max(1, num(scale.states) || 1);
  score += add("actorCount", "関与国の数", weights.actorCount * clamp(num(imp.actorCount) / states, 0, 1));
  score += add("ripple", "後続への波及", weights.ripple * clamp(num(imp.ripple), 0, 5));
  score += add("player", "プレイヤー国家が当事者", imp.player ? weights.player : 0);
  score = Math.round(score * 1000) / 1000;
  return { score, major: score >= threshold, notable: score >= NOTABLE_THRESHOLD, reasons };
}

/** 一覧・通知の目印の大きさ（モック: 大=9px 金 / 中=7px 青灰 / 小=5px 灰）。重大 → 大、目立つ → 中、それ以外 → 小 */
export const tierOf = (r) => (r?.major ? "large" : r?.notable ? "mid" : "small");
export const TIER_LABEL = Object.freeze({ large: "大", mid: "中", small: "小" });
