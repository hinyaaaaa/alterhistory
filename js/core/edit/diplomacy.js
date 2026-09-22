// 外交関係：国家どうしの関係（同盟・敵対など）。
//
// 公式 diplomacy-editor.ts の規則:
//   ・関係は「A から見た B」と「B から見た A」の対で持つ。逆の関係は、宗主国⇔従属国のみ入れ替わり、他は同じ。
//   ・各国家の diplomacy は、国家ID を添字とする配列（自国と削除済みの国家は "x"）。
//   ・国家0（無所属）の diplomacy は関係ではなく、外交の記録（[題, 本文] の配列）。変更のたびに追記する。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";

export const RELATIONS = Object.freeze([
  { id: "Ally", label: "同盟" },
  { id: "Friendly", label: "友好" },
  { id: "Neutral", label: "中立" },
  { id: "Suspicion", label: "不信" },
  { id: "Rival", label: "対抗" },
  { id: "Enemy", label: "敵対（戦争）" },
  { id: "Unknown", label: "不明" },
  { id: "Vassal", label: "従属国" },
  { id: "Suzerain", label: "宗主国" },
]);
const LABEL = Object.fromEntries(RELATIONS.map((r) => [r.id, r.label]));
const INVERSE = { Vassal: "Suzerain", Suzerain: "Vassal" };
export const inverseRelation = (r) => INVERSE[r] ?? r;
export const relationLabel = (r) => LABEL[r] ?? r ?? "";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** A から見た B の関係（未設定・自国は null） */
export function getRelation(map, a, b) {
  const r = map.pack.states[a]?.diplomacy?.[b];
  return typeof r === "string" && r !== "x" ? r : null;
}

/** @returns {object|null} 変更が無ければ null */
export function planSetDiplomacy(map, a, b, relation) {
  const states = map.pack.states;
  const A = states[a], B = states[b];
  if (a === b) throw new Error("同じ国家どうしの関係は設定できません");
  if (!isLive(A) || !isLive(B)) throw new Error("存在しない国家です");
  if (!LABEL[relation]) throw new Error(`未対応の関係です: ${relation}`);
  const old = getRelation(map, a, b);
  if (old === relation && getRelation(map, b, a) === inverseRelation(relation)) return null;

  const rowA = (A.diplomacy ?? []).slice();
  const rowB = (B.diplomacy ?? []).slice();
  while (rowA.length <= b) rowA.push("x");
  while (rowB.length <= a) rowB.push("x");
  rowA[b] = relation;
  rowB[a] = inverseRelation(relation);
  const parts = [setProps(A, { diplomacy: rowA }), setProps(B, { diplomacy: rowB })];

  const log = states[0]?.diplomacy;
  if (Array.isArray(log)) {
    const from = old ? relationLabel(old) : "未設定";
    parts.push(setProps(states[0], { diplomacy: [...log, [`関係の変更：${relationLabel(relation)}`, `${A.name}と${B.name}の関係が「${from}」から「${relationLabel(relation)}」に変わった`]] }));
  }
  return makeCommand(`外交関係の変更（${A.name}と${B.name}）`, [], parts);
}
