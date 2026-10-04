// 核作戦。核兵器は通常の戦争（宣戦布告の自動判定）では使われない。
// 「立案 → 実行」の2段階で、ユーザーが明示的に行う。
//   立案: 使う国・標的の国・使う発数を決める（技術水準・保有数・交戦中であることを検査）
//   実行: 保有する核を消費し、標的国の人口・産業・士気に大きな打撃。記録は ext.data.nuclearOps に残る。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { regimentsOf } from "./military.js";
import { officialName } from "../names.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 技術水準から決まる、核1発の性能。威力(yield)が高いほど被害が大きく、精度(accuracy)が高いほど軍事目標・産業に当たり民間への被害が減る */
export function warheadSpec(tech) {
  const t = Math.max(1, Math.min(10, tech ?? 3));
  const yieldK = 0.06 + 0.012 * t;                              // 1発あたり、標的国の人口に与える被害の基準(6〜18%)
  const accuracy = Math.max(0.35, Math.min(0.95, 0.35 + 0.06 * t)); // 命中精度(0.41〜0.95)
  return {
    yieldK, accuracy,
    popLoss: yieldK * (1 - 0.5 * accuracy),          // 人口の被害（精度が高いほど民間に当たりにくい）
    industryLoss: Math.min(0.5, 0.08 + 0.15 * accuracy + yieldK * 0.5), // 産業の被害
    troopLoss: Math.min(0.5, 0.04 + 0.2 * accuracy),                  // 軍隊の被害
    moraleDrop: Math.round(8 + 40 * yieldK),                          // 士気の低下
  };
}
/** n発での被害（複利で重なる） */
export function strikeEffects(tech, warheads) {
  const w = warheadSpec(tech), f = (x) => 1 - Math.pow(1 - x, warheads);
  return { ...w, popLossShare: f(w.popLoss), industryLossShare: f(w.industryLoss), troopLossShare: f(w.troopLoss), moraleDropTotal: w.moraleDrop * warheads };
}

export const listNuclearOps = (map) => map.ext?.data?.nuclearOps ?? [];
const writeOps = (m, list) => { const ext = ensureExt(m); ext.data.nuclearOps = list; if (!list.length) delete ext.data.nuclearOps; };
const nextId = (map) => { const l = listNuclearOps(map); return l.length ? Math.max(...l.map((o) => o.id)) + 1 : 1; };

export function nuclearStock(state) { return regimentsOf(state).reduce((n, r) => n + (r.u?.nuclear ?? 0), 0); }

/** 作戦を立案する。核を保有していれば、相手が戦争中でなくても立案できる */
export function planDraftNuclearOp(map, { attackerId, targetId, warheads = 1 }) {
  const A = map.pack.states[attackerId], T = map.pack.states[targetId];
  if (!isLive(A) || !isLive(T)) throw new Error("存在しない国家です");
  if (attackerId === targetId) throw new Error("自国を標的にはできません");
  if (!Number.isInteger(warheads) || warheads < 1) throw new Error("発数は1以上の整数にしてください");
  if (nuclearStock(A) < warheads) throw new Error(`保有する核が足りません（保有 ${nuclearStock(A)} 発）`);
  const op = { id: nextId(map), attackerId, targetId, warheads, status: "planned", name: `${officialName(T)}攻撃作戦`, executedAt: null, result: null };
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

/**
 * 作戦を実行する。核を消費し、標的国の人口・産業・軍隊・士気に打撃。性能は使う国の技術水準で決まる。
 * 士気と軍隊は国の状態そのものを書き換えるので、以後の戦争の判定・バーにそのまま効く。
 */
export function planExecuteNuclearOp(map, opId, date) {
  const list = listNuclearOps(map), op = list.find((o) => o.id === opId);
  if (!op) throw new Error("その作戦は存在しません");
  if (op.status !== "planned") throw new Error("すでに実行された作戦です");
  const A = map.pack.states[op.attackerId], T = map.pack.states[op.targetId];
  if (!isLive(A) || !isLive(T)) throw new Error("関係する国家が存在しません");
  if (nuclearStock(A) < op.warheads) throw new Error("保有する核が足りません");
  const parts = [];
  let left = op.warheads; // 核の消費：部隊ごとに、持っている分から順に減らす
  for (const r of regimentsOf(A)) {
    if (left <= 0) break;
    const have = r.u?.nuclear ?? 0, use = Math.min(have, left);
    if (use > 0) { parts.push(setProps(r, { u: { ...r.u, nuclear: have - use } })); left -= use; }
  }
  const fx = strikeEffects(A.techLevel ?? 3, op.warheads);
  const pop0 = (T.rural ?? 0) + (T.urban ?? 0);
  // 標的国の軍隊の損害（核は消えない。標的国が核を持っていれば残る）
  let troopsLost = 0;
  for (const r of regimentsOf(T)) {
    const u = { ...r.u };
    for (const k of Object.keys(u)) if (k !== "nuclear") { const n = u[k] ?? 0, nn = Math.floor(n * (1 - fx.troopLossShare)); troopsLost += n - nn; u[k] = nn; }
    parts.push(setProps(r, { u }));
  }
  const result = {
    populationLoss: Math.round(pop0 * fx.popLossShare * 10) / 10, industryLossShare: Math.round(fx.industryLossShare * 100) / 100,
    troopLossShare: Math.round(fx.troopLossShare * 100) / 100, troopsLost, moraleDrop: fx.moraleDropTotal, accuracy: Math.round(fx.accuracy * 100) / 100,
  };
  parts.push(setProps(T, {
    popPeak: Math.max(T.popPeak ?? 0, pop0),
    rural: Math.round((T.rural ?? 0) * (1 - fx.popLossShare) * 10) / 10, urban: Math.round((T.urban ?? 0) * (1 - fx.popLossShare) * 10) / 10,
    industry: Math.round((T.industry ?? 0) * (1 - fx.industryLossShare) * 10) / 10,
    morale: Math.max(0, (T.morale ?? 70) - fx.moraleDropTotal),
  }));
  const after = list.map((o) => (o.id === opId ? { ...o, status: "executed", executedAt: date ?? null, result } : o));
  parts.push({ apply: (m) => writeOps(m, after), revert: (m) => writeOps(m, list) });
  return makeCommand(`核作戦を実行（${op.name}）`, ["places"], parts);
}
