// v6 M3: 軍事組織。国家の軍（v5 の st.army＝総兵力）を、部隊（種類・規模・装備・練度）に分け、装備は産業・財政・技術から決まり、
//   ドクトリン（共通 20＋政体固有 10）の取得が軍事能力に効く。能力は st.milBonus（攻防の倍率）として、既存の戦力計算（milMult・strength）に接続される。
//   上限: ドクトリンによる攻撃の増分は +25%、防御は +40% まで（極端な一強にならないように）。
import { byState } from "../../civ/spatial.js";
import { makeEvent } from "../../civ/events.js";
import { effective } from "./effective.js";
import { stateFx } from "../statefx.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const has = (st, k) => st.techAdopted?.[k] != null;
import { stateCan } from "../../civ/tech.js";
// v6.1.0 M3: 部隊の種類の解禁は、技術ツリーの caps（unit:*）から導く
// v6.13.0: 兵種（陸・海・空 26 種）と人数の配分は orbat.js が持つ。ここは、その窓口（互換の export）と、部隊の月次の更新・ドクトリンの取得だけ
import { UNIT_TYPES, unitName, unitTerm, rosterOf, serviceOf, validateTarget } from "../orbat.js";
export const UNIT_KINDS = UNIT_TYPES;     // 互換: { ja, need(st, ctx) } を持つ兵種の表
export { unitName, unitTerm };
/** 部隊を「第 n ○○」の編成に分けて表示するための分割（規模に応じて 1〜6 個。読み取り専用・状態は持たない） */
export function formationsOf(st, u) {
  const per = has(st, "tank") ? 24000 : has(st, "breech_loading") ? 14000 : has(st, "gunpowder") ? 6000 : has(st, "iron_weapons") ? 3000 : 1200, n = Math.max(1, Math.min(6, Math.round(u.size / per))), term = unitName(st, u.kind), ORD = ["第一", "第二", "第三", "第四", "第五", "第六"];
  return Array.from({ length: n }, (_, i) => ({ name: n === 1 ? term : `${ORD[i]}${term}`, size: Math.round((u.size / n) * 10) / 10 }));
}

// v6.1.0 M6: ドクトリンは doctrine.js（共通 5 系統 × 5 段 ＋ 国家固有 3 系統）。ここは取得の検証・適用・軍事能力の更新だけを持つ
import { COMMON_NODES, COMMON_BY_ID, CAP, FX_KEYS, SCHOOLS, SCHOOL_BY_ID, SERVICE_JA, LINES, LINE_BY_ID, TIERS, nodeOf, nodesOf, branchesOf, doctrineFx, doctrineInfo, lineOf, tierOf, bestLine, migrateDoctrine, serviceFx } from "./doctrine.js";
export { SCHOOLS, SCHOOL_BY_ID, SERVICE_JA, LINES, LINE_BY_ID, TIERS, lineOf, tierOf, bestLine, serviceFx };
export const DOCTRINES = COMMON_NODES;     // 互換: 共通ノードの一覧（国家固有のノードは国家ごとに st.military.special にある。nodesOf(st) で全体）
export const DOCTRINE = COMMON_BY_ID;
export const OFF_CAP = CAP.off, DEF_CAP = CAP.def;
export { nodesOf, nodeOf, branchesOf, doctrineFx };

export const initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, doc: { line: null, since: 0 }, confusion: 0, shares: null, orbat: { mode: "auto" }, school: { land: null, sea: null, air: null }, special: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, 0])), exp: { won: 0, lost: 0, defended: 0, sieges: 0, sea: 0, wars: 0 } });
/** 取れるか。理由つき（UI の表示条件と AI の候補・命令の検証は、この同じ関数を通る） */
export function canAdopt(st, id) {
  const d = nodeOf(st, id); if (!d) return { ok: false, reason: "そのドクトリンはありません" }; const M = st.military;
  if (M?.doctrine.taken[id] != null) return { ok: false, reason: "すでに取得済み" };
  const cur = M?.doc?.line ?? null; if (cur && cur !== d.branch) return { ok: false, reason: `いまの系統は「${LINE_BY_ID[cur]?.ja}」。系統は 1 つだけ（切り替えると、取得した段を失う）` };
  for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `前提のドクトリン「${nodeOf(st, p)?.ja ?? p}」が未取得` };
  for (const t of d.tech) if (!has(st, t)) return { ok: false, reason: `技術「${t}」が必要` };
  if (st.treasury < d.cost) return { ok: false, reason: `財政が足りない（${d.cost}）` };
  return { ok: true };
}
export function adoptDoctrine(ctx, st, id, { provenance = "simulation", decisionId = null } = {}) {
  const c = canAdopt(st, id); if (!c.ok) return c; const { civ, ids } = ctx, d = nodeOf(st, id); const M = (st.military ??= initMilitary());
  st.treasury -= d.cost; M.doctrine.taken[id] = civ.monthIndex; M.doc = { line: d.branch, since: M.doc?.since ?? civ.monthIndex };
  const ev = makeEvent(civ, ids, { kind: "doctrine_adopted", title: `${st.name}が「${d.ja}」を取り入れた`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId, why: "技術が進み、新しい戦いかたの系統が選べるようになった" });
  recompute(ctx, st); return { ok: true, eventId: ev?.eventId ?? null };
}
/** 系統の切り替え費用（いまの段が高いほど重い。まだ何も取っていなければ無料） */
export const switchCost = (st) => { const t = tierOf(st); return t ? 40 + 25 * t : 0; };
/** 系統を切り替える: 取得した段をすべて失い、約 1 年の混乱（効果が最大 6 割落ちる）。担当国・AI・創造主が同じ関数を通る */
export function switchLine(ctx, st, line, { provenance = "simulation", free = false } = {}) {
  const l = LINE_BY_ID[line]; if (!l) return { ok: false, reason: "その系統はありません" }; const M = (st.military ??= initMilitary());
  if (M.doc?.line === line) return { ok: false, reason: "すでにその系統です" };
  const cost = free ? 0 : switchCost(st); if (st.treasury < cost) return { ok: false, reason: `財政が足りない（${cost}）` };
  const from = M.doc?.line ? LINE_BY_ID[M.doc.line]?.ja : null, lost = tierOf(st); st.treasury -= cost; M.doctrine = { taken: {} }; M.doc = { line, since: ctx.civ.monthIndex }; if (from) M.confusion = 12;
  const ev = makeEvent(ctx.civ, ctx.ids, { kind: "doctrine_switched", title: from ? `${st.name}が戦い方を「${from}」から「${l.ja}」へ改めた` : `${st.name}が戦い方を「${l.ja}」と定めた`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "military.doc", before: M.doc?.line ?? null, after: line }], facts: { lostTiers: lost }, provenance });
  recompute(ctx, st); return { ok: true, cost, lost, eventId: ev?.eventId ?? null };
}
function recompute(ctx, st) {
  const M = st.military, ind = effective(ctx.civ, st, "perCapita"), wTech = (has(st, "bronze_weapons") ? 0.08 : 0) + (has(st, "iron_weapons") ? 0.12 : 0) + (has(st, "steel") ? 0.05 : 0) + (has(st, "gunpowder") ? 0.1 : 0);
  M.equipLevel = clamp(0.15 + 0.35 * clamp(ind / 1.6) + wTech + (st.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st.econ?.investment ?? 0), 0, 1);
  M.readiness = clamp(0.5 * effective(ctx.civ, st, "stability") + 0.3 * (st.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st.politics ? effective(ctx.civ, st, "fatigue") : 0)), 0, 1);
  const fx = doctrineFx(st), off = fx.off, def = fx.def; M.fx = fx;
  const eqE = effective(ctx.civ, st, "equipLevel"), rdE = effective(ctx.civ, st, "readiness"); // 介入があれば有効値（通常値＋補正）で軍事能力を決める
  const sfx = stateFx(st); st.milBonus = Math.round(clamp(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off + sfx.mil, -0.6, 0.6) * 1000) / 1000; st.milDef = Math.round(clamp(def + sfx.def, 0, 0.4) * 1000) / 1000; /* v6.13.0: ドクトリンの守りが増えたので、検証の範囲（0〜0.4）で止める */ // v6.12.0: 役職・国策のバフ
}
/** 月次（3か月ごと）: 総兵力を兵種ごとの人数に分け（自動／手動）、装備・練度・軍事能力を更新 */
export function stepMilitary(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 3 !== 0) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const M = (st.military ??= initMilitary()); M.orbat ??= { mode: "auto" }; if (!M.doc || M.special?.length || M.v6180 == null) { migrateDoctrine(st, M.doc?.line ? null : doctrineInfo(ctx, st)); M.v6180 = 1; } if (M.confusion > 0) M.confusion = Math.max(0, M.confusion - 3);
    if (!st.player && M.doc?.line && mi % 36 === 0 && tierOf(st) <= 3 && st.warIds.length === 0) { const b = bestLine(doctrineInfo(ctx, st), M.doc.line); if (b !== M.doc.line) switchLine(ctx, st, b, { free: true }); }
    recompute(ctx, st);
    if (M.shares) { M.shares = null; } // 旧版の配分（比率）は使わない
    if (M.orbat.mode === "manual") { const keep = Object.fromEntries(Object.entries(M.orbat.target ?? {}).filter(([k]) => UNIT_TYPES[k]?.need(st, ctx))); if (!Object.keys(keep).length) M.orbat = { mode: "auto" }; else M.orbat.target = keep; } // 使えなくなった兵種は、指定から外れる
    const roster = rosterOf(ctx, st), old = new Map(M.units.map((u) => [u.kind, u])), next = [];
    for (const [k, heads] of Object.entries(roster)) {
      if (!(heads > 0.05)) continue; const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: unitName(st, k), since: mi };
      u.name = unitName(st, k); u.service = serviceOf(k);
      u.size = Math.round(heads * 10) / 10; u.equip = Math.round(clamp(effective(ctx.civ, st, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : k === "armor" || k === "fighter" ? 0.06 : 0)) * 100) / 100; u.readiness = Math.round(effective(ctx.civ, st, "readiness") * 100) / 100; next.push(u);
    }
    M.units = next; M.armyBasis = st.army; // 部隊は、この時点の総兵力の配分（兵力はその後の月で変わる）
  }
}
/** 兵種ごとの人数の設定（プレイヤー・創造主の命令）。mode: "auto" なら自動。"manual" なら heads={兵種: 人数}。費用は、変わった人数の 0.1% */
export function setOrbat(ctx, st, { mode, heads }) {
  const M = (st.military ??= initMilitary());
  if (mode === "auto") { M.orbat = { mode: "auto" }; stepMilitaryNow(ctx, st); return { ok: true, cost: 0 }; }
  if (mode !== "manual") return { ok: false, reason: "mode は auto か manual" };
  const v = validateTarget(ctx, st, heads); if (!v.ok) return v;
  const cur = Object.fromEntries(M.units.map((u) => [u.kind, u.size])); let diff = 0; for (const k of new Set([...Object.keys(cur), ...Object.keys(v.target)])) diff += Math.abs((v.target[k] ?? 0) - (cur[k] ?? 0));
  const cost = Math.round(diff * 0.0005 * 10) / 10; if (st.treasury < cost) return { ok: false, reason: `再編の費用 ${cost} が足りない` };
  st.treasury -= cost; M.orbat = { mode: "manual", target: v.target }; stepMilitaryNow(ctx, st); return { ok: true, cost };
}
/** 旧版の命令（配分の比率）。人数へ換算して手動にする */
export function reorganize(ctx, st, shares) {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0); if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "配分の合計は 1" };
  for (const [k, v] of Object.entries(shares)) { if (!UNIT_KINDS[k]) return { ok: false, reason: `未知の部隊 ${k}` }; if (!(v >= 0)) return { ok: false, reason: "配分は 0 以上" }; if (v > 0 && !UNIT_KINDS[k].need(st, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}は今の技術・地理では編制できない` }; }
  const heads = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(st.army * v)]));
  return setOrbat(ctx, st, { mode: "manual", heads });
}
function stepMilitaryNow(ctx, st) { const mi = ctx.civ.monthIndex; const prev = ctx.civ.monthIndex; ctx.civ.monthIndex = mi - (mi % 3); try { const states = ctx.civ.states; const keep = Object.values(states).filter((s) => s !== st).map((s) => [s, s.alive]); for (const [s] of keep) s.alive = false; stepMilitary(ctx); for (const [s, a] of keep) s.alive = a; } finally { ctx.civ.monthIndex = prev; } }
