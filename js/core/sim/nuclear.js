// 核作戦。核兵器は通常の戦争（宣戦布告の自動判定）では使われない。
// 「立案 → 実行」の2段階で、ユーザーが明示的に行う。
//   立案: 使う国・標的の国・使う発数を決める（技術水準・保有数・交戦中であることを検査）
//   実行: 保有する核を消費し、標的国の人口・産業・士気に大きな打撃。記録は ext.data.nuclearOps に残る。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { regimentsOf } from "./military.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
export const NUCLEAR_MIN_TECH = 9;

export const listNuclearOps = (map) => map.ext?.data?.nuclearOps ?? [];
const writeOps = (m, list) => { const ext = ensureExt(m); ext.data.nuclearOps = list; if (!list.length) delete ext.data.nuclearOps; };
const nextId = (map) => { const l = listNuclearOps(map); return l.length ? Math.max(...l.map((o) => o.id)) + 1 : 1; };

export function nuclearStock(state) { return regimentsOf(state).reduce((n, r) => n + (r.u?.nuclear ?? 0), 0); }

function atWar(map, a, b) {
  return (map.ext?.data?.wars ?? []).some((w) => !w.endedAt && ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))));
}

/** 作戦を立案する。条件を満たさなければ理由つきで例外 */
export function planDraftNuclearOp(map, { attackerId, targetId, warheads = 1 }) {
  const A = map.pack.states[attackerId], T = map.pack.states[targetId];
  if (!isLive(A) || !isLive(T)) throw new Error("存在しない国家です");
  if (attackerId === targetId) throw new Error("自国を標的にはできません");
  if ((A.techLevel ?? 3) < NUCLEAR_MIN_TECH) throw new Error(`核を運用できるのは技術水準${NUCLEAR_MIN_TECH}以上の国だけです`);
  if (!Number.isInteger(warheads) || warheads < 1) throw new Error("発数は1以上の整数にしてください");
  if (nuclearStock(A) < warheads) throw new Error(`保有する核が足りません（保有 ${nuclearStock(A)} 発）`);
  if (!atWar(map, attackerId, targetId)) throw new Error("核作戦は、交戦中の相手にだけ立案できます");
  const op = { id: nextId(map), attackerId, targetId, warheads, status: "planned", name: `${T.name}攻撃作戦`, executedAt: null, result: null };
  const before = listNuclearOps(map);
  return { command: makeCommand(`核作戦を立案（${op.name}）`, [], [{ apply: (m) => writeOps(m, [...before, op]), revert: (m) => writeOps(m, before) }]), id: op.id };
}

/** 立案済みの作戦を取り消す */
export function planCancelNuclearOp(map, opId) {
  const list = listNuclearOps(map), op = list.find((o) => o.id === opId);
  if (!op) throw new Error("その作戦は存在しません");
  if (op.status !== "planned") throw new Error("実行済みの作戦は取り消せません");
  return makeCommand("核作戦を取り消し", [], [{ apply: (m) => writeOps(m, list.filter((o) => o.id !== opId)), revert: (m) => writeOps(m, list) }]);
}

/** 作戦を実行する。核を消費し、標的国に壊滅的な打撃（1発あたり人口12%・産業20%・士気-15、複利で重なる） */
export function planExecuteNuclearOp(map, opId, date) {
  const list = listNuclearOps(map), op = list.find((o) => o.id === opId);
  if (!op) throw new Error("その作戦は存在しません");
  if (op.status !== "planned") throw new Error("すでに実行された作戦です");
  const A = map.pack.states[op.attackerId], T = map.pack.states[op.targetId];
  if (!isLive(A) || !isLive(T)) throw new Error("関係する国家が存在しません");
  if (nuclearStock(A) < op.warheads) throw new Error("保有する核が足りません");
  if (!atWar(map, op.attackerId, op.targetId)) throw new Error("相手との戦争が終わっているため実行できません");
  const parts = [];
  // 核の消費：部隊ごとに、持っている分から順に減らす
  let left = op.warheads;
  for (const r of regimentsOf(A)) {
    if (left <= 0) break;
    const have = r.u?.nuclear ?? 0, use = Math.min(have, left);
    if (use > 0) { parts.push(setProps(r, { u: { ...r.u, nuclear: have - use } })); left -= use; }
  }
  const surv = (f) => Math.pow(1 - f, op.warheads);
  const pop0 = (T.rural ?? 0) + (T.urban ?? 0);
  const result = { populationLoss: Math.round(pop0 * (1 - surv(0.12)) * 10) / 10, industryLossShare: Math.round((1 - surv(0.2)) * 100) / 100, moraleDrop: 15 * op.warheads };
  parts.push(setProps(T, { rural: Math.round((T.rural ?? 0) * surv(0.12) * 10) / 10, urban: Math.round((T.urban ?? 0) * surv(0.12) * 10) / 10, industry: Math.round((T.industry ?? 0) * surv(0.2) * 10) / 10, morale: Math.max(0, (T.morale ?? 70) - result.moraleDrop) }));
  const after = list.map((o) => (o.id === opId ? { ...o, status: "executed", executedAt: date ?? null, result } : o));
  parts.push({ apply: (m) => writeOps(m, after), revert: (m) => writeOps(m, list) });
  return makeCommand(`核作戦を実行（${op.name}）`, ["places"], parts);
}
