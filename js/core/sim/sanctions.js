// 貿易の封鎖。戦争中の2国は取引できない。さらに、拘束力が「標準」以上の同盟では、
// 同盟国が盟主側の敵国との取引を止める（同盟内の同調）。「緩やか」な同盟は封鎖に加わらない。
import { bondOf } from "./war-flow.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 取引できない国どうしの組（"小さいID-大きいID"）の集合 */
export function blockedPairs(map) {
  const set = new Set();
  const add = (x, y) => set.add(x < y ? `${x}-${y}` : `${y}-${x}`);
  const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
  const alliances = (map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt && bondOf(a) !== "loose");
  for (const w of wars) {
    for (const x of w.attackers) for (const y of w.defenders) add(x, y);
    for (const al of alliances) {
      const M = al.members.filter((m) => isLive(map.pack.states[m]));
      for (const [mine, theirs] of [[w.attackers, w.defenders], [w.defenders, w.attackers]]) {
        if (!M.some((m) => mine.includes(m))) continue;
        for (const m of M) if (!w.attackers.includes(m) && !w.defenders.includes(m)) for (const y of theirs) add(m, y);
      }
    }
  }
  return set;
}
export function isBlockaded(map, a, b, cache = null) {
  const set = cache ?? blockedPairs(map);
  return set.has(a < b ? `${a}-${b}` : `${b}-${a}`);
}
