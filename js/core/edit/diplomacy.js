// 外交関係：国家どうしの関係（同盟・敵対など）。
//
// 公式 diplomacy-editor.ts の規則:
//   ・関係は「A から見た B」と「B から見た A」の対で持つ。逆の関係は、宗主国⇔従属国のみ入れ替わり、他は同じ。
//   ・各国家の diplomacy は、国家ID を添字とする配列（自国と削除済みの国家は "x"）。
//   ・国家0（無所属）の diplomacy は関係ではなく、外交の記録（[題, 本文] の配列）。変更のたびに追記する。
//
// 変更履歴: ALTERHISTORY拡張データ ext.data.diplomacyLog = [{ year, month, a, b, from, to }] に、
// 「いつ・どの国とどの国が・どう変わったか」を記録する（Azgaar形式には無い概念）。
// 一覧表示・年表づくりに使う。既存の states[0].diplomacy のテキストログとは別に持つ
// （あちらは自由文でAzgaar互換、こちらは構造化データで検索・集計しやすくするため）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";
import { ensureExt } from "./ext.js";

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

/** 関係変更の構造化ログ（年表用）。新しい順 */
export function listDiplomacyLog(map) {
  return map.ext?.data?.diplomacyLog ?? [];
}

/** @returns {object|null} 変更が無ければ null */
export function planSetDiplomacy(map, a, b, relation, date) {
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

  // 構造化ログにも年月付きで記録する（同盟・戦争と同様、年表に使うため）
  if (date) {
    const before = listDiplomacyLog(map);
    const entry = { year: date.year, month: date.month, a, b, aName: A.fullName ?? A.name, bName: B.fullName ?? B.name, from: old, to: relation };
    parts.push({
      apply: (m) => { ensureExt(m).data.diplomacyLog = [...before, entry]; },
      revert: (m) => { const ext = ensureExt(m); if (before.length) ext.data.diplomacyLog = before; else delete ext.data.diplomacyLog; },
    });
  }

  return makeCommand(`外交関係の変更（${A.name}と${B.name}）`, [], parts);
}

// ---- 二分化した関係：同盟 / 敵対 / どちらでもない（中立） ----
// 友好・不仲のような細かい関係は設定しない。同盟を結べば「同盟」、戦争をすれば「敵対」になり、
// 講和すれば中立に戻る。保存形式は Azgaar 互換（Ally / Enemy / Neutral）のまま。

/** 複数の国の組に、同じ関係を一括で設定する部品を返す（同じ国の行を何度も書き換えても食い違わない） */
export function diplomacyParts(map, pairs, relation) {
  const rows = new Map();
  const rowOf = (id) => { if (!rows.has(id)) rows.set(id, (map.pack.states[id].diplomacy ?? []).slice()); return rows.get(id); };
  for (const [a, b] of pairs) {
    if (a === b || !isLive(map.pack.states[a]) || !isLive(map.pack.states[b])) continue;
    const ra = rowOf(a), rb = rowOf(b);
    while (ra.length <= b) ra.push("x");
    while (rb.length <= a) rb.push("x");
    ra[b] = relation; rb[a] = relation;
  }
  return [...rows].map(([id, row]) => setProps(map.pack.states[id], { diplomacy: row }));
}

/** 国の組どうしの全組み合わせ */
export function crossPairs(listA, listB) { const out = []; for (const a of listA) for (const b of listB) out.push([a, b]); return out; }

/** 表示用の関係。"alliance" | "hostile" | "none"。保存値ではなく、同盟と戦争の状況から導く */
export function simpleRelation(map, a, b) {
  const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
  if (wars.some((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)))) return "hostile";
  const va = map.pack.states[a]?.vassal, vb = map.pack.states[b]?.vassal;
  if (va && va.overlord === b && map.pack.states[a] && !map.pack.states[a].removed) return "vassal";   // a は b に従属している
  if (vb && vb.overlord === a && map.pack.states[b] && !map.pack.states[b].removed) return "overlord"; // a は b の宗主国
  if ((map.ext?.data?.alliances ?? []).some((al) => !al.dissolvedAt && al.members.includes(a) && al.members.includes(b))) return "alliance";
  return "none";
}
export const SIMPLE_LABEL = Object.freeze({ alliance: "同盟", hostile: "敵対", none: "中立", vassal: "従属", overlord: "宗主" });
