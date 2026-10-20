// 発展のペースの調整（v3.0.0）。アルゴリズム国家の進みが、プレイヤー国と比べて極端に遅い・早いことを防ぐ。
//   発展の度合い = 技術水準（細かい値）・産業力・人口の大きさの合成。基準 = プレイヤー国の中央値（いなければ全国の中央値）。
//   指標 index = 自分 ÷ 基準。1 に近いほど、プレイヤー国と同じくらいのペース。
//   補正 mult = index の平方根の逆数（0.6〜1.6）。進みすぎた国は鈍り（mult < 1）、遅れた国は速まる（mult > 1）。
//   効く先: 技術の進捗の速さ（tech-progress.js）と、宣戦の意欲（ai.js）。数値を直接いじるのではなく、速さの倍率だけを変える。
// 純粋ロジック層：DOM に依存しない。
import { techLevelFine } from "../edit/doctrines.js";
import { getIndicators } from "./pressure.js";
import { getAi, isAutonomous } from "./ai-settings.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const median = (a) => { if (!a.length) return 1; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const PACE_MIN = 0.6, PACE_MAX = 1.6;

/** 発展の度合い（0〜1くらい）。popMedian は全国の人口の中央値 */
export function developmentScore(s, ind, popMedian) {
  const pop = (s.rural ?? 0) + (s.urban ?? 0);
  return 0.45 * (techLevelFine(s) / 10) + 0.3 * Math.min(1, (ind?.industryRatio ?? 1) / 1.5) + 0.25 * (clamp(pop / Math.max(1, popMedian), 0, 3) / 3);
}

const cache = new WeakMap();
/** 全国の発展のペース。月ごとに覚える。@returns {Map<number,{score,ref,index,mult}>} */
export function paceOf(map, date = map.worldTime ?? { year: 1, month: 1 }) {
  const sig = `${date.year * 12 + date.month}:${map.pack.states.length}:${getAi(map).players.join(",")}`;
  const hit = cache.get(map); if (hit && hit.sig === sig) return hit.out;
  const inds = getIndicators(map, date), live = map.pack.states.filter(isLive), popMedian = median(live.map((s) => (s.rural ?? 0) + (s.urban ?? 0)));
  const scores = new Map(live.map((s) => [s.i, developmentScore(s, inds.get(s.i), popMedian)]));
  const players = getAi(map).players.filter((id) => scores.has(id));
  // 基準はプレイヤー国の中央値。ただし、プレイヤー国が崩れていたり、ほとんど動かしていなくても、全国の中央値の半分を下回らない（全体が不当に鈍らないように）
  const all = median([...scores.values()]);
  const ref = Math.max(0.05, 0.5 * all, median((players.length ? players : [...scores.keys()]).map((id) => scores.get(id))));
  const out = new Map();
  for (const [id, score] of scores) { const index = score / ref; out.set(id, { score, ref, index, mult: clamp(Math.pow(1 / Math.max(0.05, index), 0.5), PACE_MIN, PACE_MAX) }); }
  cache.set(map, { sig, out });
  return out;
}

/** 技術の進捗にかける倍率。アルゴリズム国家だけ補正する（プレイヤー国・自律が無効のときは 1） */
export function paceMultiplier(map, stateId, date) {
  if (!isAutonomous(map, stateId)) return 1;
  try { return paceOf(map, date).get(stateId)?.mult ?? 1; } catch { return 1; }
}
