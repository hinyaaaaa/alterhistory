// 国家の崩壊。人口の大部分が失われた国は、国家として成り立たなくなる（HoI4 の降伏・消滅にあたる）。
//   ・人口が過去最大(popPeak)の25%を下回ったら崩壊
//   ・戦っていた敵国があれば、その中で最も強い国に領土ごと吸収される（併合）
//   ・敵が無ければ、国家は解体されて土地は無所属になる
// 純粋ロジック層：DOM に依存しない。1回に1国ずつ返すので、呼ぶ側は無くなるまで繰り返す。
import { planMergeStates } from "../edit/sovereignty.js";
import { planRemoveEntity } from "../edit/entities.js";
import { regimentsOf } from "./military.js";
import { forceHeadcount } from "./units.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
export const COLLAPSE_RATIO = 0.25;
const popOf = (s) => (s.rural ?? 0) + (s.urban ?? 0);

/** 崩壊する国（無ければ null）と、吸収する国 */
export function findCollapse(map) {
  for (const s of map.pack.states) {
    if (!isLive(s)) continue;
    const peak = s.popPeak ?? 0;
    if (peak > 0 && popOf(s) < peak * COLLAPSE_RATIO) {
      const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt && (w.attackers.includes(s.i) || w.defenders.includes(s.i)));
      const enemies = new Set();
      for (const w of wars) for (const e of (w.attackers.includes(s.i) ? w.defenders : w.attackers)) if (isLive(map.pack.states[e])) enemies.add(e);
      const strength = (id) => regimentsOf(map.pack.states[id]).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0);
      const annexer = [...enemies].sort((a, b) => strength(b) - strength(a))[0] ?? null;
      return { stateId: s.i, annexer };
    }
  }
  return null;
}

/** 次の崩壊を1つ起こすコマンド。無ければ null */
export function planNextCollapse(map, date) {
  const c = findCollapse(map); if (!c) return null;
  const st = map.pack.states[c.stateId];
  const command = c.annexer != null ? planMergeStates(map, { from: c.stateId, to: c.annexer, date }) : planRemoveEntity(map, "state", c.stateId, { force: true });
  return { command, stateId: c.stateId, annexer: c.annexer, name: st.fullName ?? st.name };
}
