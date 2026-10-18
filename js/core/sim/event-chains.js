// 出来事の連鎖（v2.6.0 B4）。月ごとの出来事に「後続の出来事」を持たせ、数か月後に起こす。
//   飢饉 → 物価の高騰・難民の流入（→ 暴動） / 流行病・疫病 → 復興 / クーデター未遂 → 粛清 / 選挙の敗北 → 政権交代（指導者の交代）
//   ・後続は ext.data.pendingEvents = [{ key, stateId, due:{year,month}, depth, from }] に予約し、期日が来たら起こす
//   ・州が勝手に反乱を起こすことはしない（v2.4.0 の決定）。民意が低くなったら、「反乱の火種」として国家タブに出すだけ
//   ・連鎖の長さ・確率は、バランス調整（chainDepth・chainRate）から変えられる
// 純粋ロジック層：DOM に依存しない。乱数は注入する。
import { makeCommand } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { planChangeLeader } from "../edit/leaders.js";
import { BALANCE } from "./balance.js";
import { MINOR_EVENTS, planMinorEvent } from "./minor-events.js";
import { listHistory } from "../edit/history-log.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const mk = (d) => (d?.year ?? 0) * 12 + ((d?.month ?? 1) - 1);
const dateOf = (n) => ({ year: Math.floor(n / 12), month: (n % 12) + 1 });

/** 先立つ出来事 → 後続。months: 何か月後か [最短, 最長] / p: 起きる確率（chainRate の倍率がかかる） / when: 条件（省略可） */
export const CHAINS = Object.freeze({
  famine: [{ key: "pricespike", months: [2, 4], p: 0.6 }, { key: "refugees", months: [3, 6], p: 0.4 }],
  drought: [{ key: "pricespike", months: [3, 5], p: 0.3 }],
  epidemic: [{ key: "recovery", months: [6, 12], p: 0.7 }],
  pricespike: [{ key: "riot", months: [2, 5], p: 0.35 }],
  coup: [{ key: "purge", months: [1, 3], p: 0.7 }],
  election: [{ key: "turnover", months: [1, 2], p: 1, when: (ev) => (ev.swing ?? 0) < 0 }],
  plague: [{ key: "recovery", months: [8, 18], p: 0.8 }],
});
export const FOLLOW_KEYS = Object.freeze(MINOR_EVENTS.filter((e) => e.follow).map((e) => e.key));

export const listPending = (map) => map?.ext?.data?.pendingEvents ?? [];
const writePending = (m, list) => { const x = ensureExt(m); if (list.length) x.data.pendingEvents = list; else delete x.data.pendingEvents; };
const pendingCmd = (map, next, label) => { const before = listPending(map); return makeCommand(label, [], [{ apply: (m) => writePending(m, next), revert: (m) => writePending(m, before) }]); };

/**
 * 出来事 key が起きたあと、後続を予約するコマンド（予約が無ければ null）。depth: いまの出来事の段（最初=0）。
 * 後続の段は depth+1。BALANCE.chainDepth を超える後続は予約しない。
 */
export function planScheduleChain(map, { key, stateId, swing = 0 }, date, rnd, depth = 0) {
  const defs = CHAINS[key]; if (!defs || !isLive(map.pack.states[stateId])) return null;
  if (depth + 1 > (BALANCE.chainDepth ?? 2)) return null;
  const rate = BALANCE.chainRate ?? 1; if (!(rate > 0)) return null;
  const add = [];
  for (const d of defs) {
    if (d.when && !d.when({ key, stateId, swing })) continue;
    if (!rnd.chance(Math.min(1, d.p * rate))) continue;
    add.push({ key: d.key, stateId, due: dateOf(mk(date) + rnd.int(d.months[0], d.months[1])), depth: depth + 1, from: key });
  }
  return add.length ? pendingCmd(map, [...listPending(map), ...add], "出来事の連鎖（予約）") : null;
}

/** 期日が来た予約（地図は変更しない） */
export const duePending = (map, date) => listPending(map).filter((p) => mk(p.due) <= mk(date));

/**
 * 予約を1件起こす。返すのはコマンドの配列（出来事 → 予約の取り下げ → さらに後続の予約）。国が無くなっていたら、予約だけ取り下げる。
 * 政権交代は、指導者の交代につなげる（理由: 選出・継承は安定）。
 */
export function planRunPending(map, p, date, rnd) {
  const out = [], rest = listPending(map).filter((x) => x !== p && !(x.key === p.key && x.stateId === p.stateId && mk(x.due) === mk(p.due) && x.from === p.from));
  const st = map.pack.states[p.stateId], ev = MINOR_EVENTS.find((e) => e.key === p.key);
  if (isLive(st) && ev) {
    const c = planMinorEvent(map, { key: p.key, stateId: p.stateId }, date); if (c) out.push(c);
  }
  out.push(pendingCmd(map, rest, "出来事の連鎖（取り下げ）"));
  return { commands: out, after: () => (isLive(st) && ev ? { key: p.key, stateId: p.stateId, depth: p.depth ?? 1, leaderChange: !!ev.leaderChange } : null) };
}

/** 政権交代の指導者交代を作る（できなければ null） */
export function planTurnoverLeader(map, stateId, date, rnd) {
  const st = map.pack.states[stateId]; if (!isLive(st)) return null;
  try { return planChangeLeader(map, stateId, { reason: "election", stability: "stable", date, rnd }); } catch { return null; }
}

/** 反乱の火種（国家タブに表示するだけ。反乱は、ユーザーがボタンで起こす）。民意が低く、最近の連鎖の出来事が重なっているほど強い */
export function rebellionSpark(map, stateId, date = null) {
  const s = map.pack.states[stateId]; if (!isLive(s)) return null;
  const support = typeof s.support === "number" ? s.support : 70;
  if (support >= 30) return null;
  const now = date ?? map.worldTime ?? { year: 1, month: 1 };
  const recent = listHistory(map).filter((h) => FOLLOW_KEYS.some((k) => h.type === `natural-${k}`) && (h.states ?? []).includes(stateId) && mk(now) - mk(h) <= 36 && mk(now) >= mk(h));
  return { support, level: support < 15 ? "強い" : "くすぶっている", causes: recent.map((h) => h.title).slice(-3) };
}
