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
const can = (ctx, st, cap) => stateCan(ctx.civ, st, cap);
export const UNIT_KINDS = Object.freeze({
  infantry: { ja: "歩兵", need: () => true }, ranged: { ja: "弓・投射兵", need: (st, ctx) => can(ctx, st, "unit:ranged") }, cavalry: { ja: "騎兵", need: (st, ctx) => can(ctx, st, "unit:cavalry") },
  navy: { ja: "水軍", need: (st, ctx) => can(ctx, st, "unit:navy") && coastal(ctx, st) }, garrison: { ja: "守備兵", need: (st, ctx) => can(ctx, st, "unit:garrison") }, firearms: { ja: "銃兵", need: (st, ctx) => can(ctx, st, "unit:firearms") },
});
/** v6.5.0: 部隊の名前。技術（武器・火薬・海戦術）とドクトリン（攻め・守りの傾き）から決まる（編成を変えても、技術が進むと名前が改まる） */
const TERMS = {
  infantry: [["gunpowder", "線列歩兵団"], ["steel", "精鋭歩兵団"], ["iron_weapons", "重装歩兵団"], ["bronze_weapons", "槍兵団"], [null, "戦士団"]],
  ranged: [["steel", "弩兵団"], ["bronze_weapons", "弓兵団"], [null, "投射兵団"]],
  cavalry: [["gunpowder", "胸甲騎兵団"], ["iron_weapons", "重騎兵団"], [null, "騎馬隊"]],
  navy: [["gunpowder", "大艦隊"], ["war:naval", "艦隊"], [null, "舟軍"]],
  garrison: [["fortification", "城塞守備軍"], [null, "守備隊"]],
  firearms: [["steel", "近衛銃兵団"], [null, "銃兵団"]],
};
export function unitTerm(st, kind) { for (const [k, t] of TERMS[kind] ?? []) if (k == null || has(st, k) || (k === "war:naval" && st.techAdopted?.naval_warfare != null)) return t; return UNIT_KINDS[kind]?.ja ?? kind; }
export function unitName(st, kind) {
  const fx = st.military?.fx ?? {}, tag = (fx.off ?? 0) >= 0.06 && (fx.off ?? 0) >= (fx.def ?? 0) ? "突撃" : (fx.def ?? 0) >= 0.08 ? "堅陣" : ""; return `${tag}${unitTerm(st, kind)}`;
}
/** 部隊を「第 n ○○」の編成に分けて表示するための分割（規模に応じて 1〜6 個。読み取り専用・状態は持たない） */
export function formationsOf(st, u) {
  const per = has(st, "gunpowder") ? 6000 : has(st, "iron_weapons") ? 3000 : 1200, n = Math.max(1, Math.min(6, Math.round(u.size / per))), term = unitName(st, u.kind), ORD = ["第一", "第二", "第三", "第四", "第五", "第六"];
  return Array.from({ length: n }, (_, i) => ({ name: n === 1 ? term : `${ORD[i]}${term}`, size: Math.round((u.size / n) * 10) / 10 }));
}
const coastal = (ctx, st) => (byState(ctx).get(st.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);
const shareOf = (ctx, st) => {
  const gs = byState(ctx).get(st.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, w = {};
  for (const [k, def] of Object.entries(UNIT_KINDS)) if (def.need(st, ctx)) w[k] = k === "infantry" ? 1 : k === "ranged" ? 0.25 : k === "cavalry" ? 0.2 + 0.5 * pastoral : k === "navy" ? 0.15 : k === "garrison" ? 0.1 : 0.4;
  if (w.firearms) { delete w.ranged; } const tot = Object.values(w).reduce((a, b) => a + b, 0); for (const k in w) w[k] /= tot; return w;
};

// v6.1.0 M6: ドクトリンは doctrine.js（共通 5 系統 × 5 段 ＋ 国家固有 3 系統）。ここは取得の検証・適用・軍事能力の更新だけを持つ
import { COMMON_NODES, COMMON_BY_ID, CAP, FX_KEYS, nodeOf, nodesOf, branchesOf, doctrineFx, doctrineInfo, chooseSpecial } from "./doctrine.js";
export const DOCTRINES = COMMON_NODES;     // 互換: 共通ノードの一覧（国家固有のノードは国家ごとに st.military.special にある。nodesOf(st) で全体）
export const DOCTRINE = COMMON_BY_ID;
export const OFF_CAP = CAP.off, DEF_CAP = CAP.def;
export { nodesOf, nodeOf, branchesOf, doctrineFx };

export const initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, shares: null, special: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, 0])), exp: { won: 0, lost: 0, defended: 0, sieges: 0, sea: 0, wars: 0 } });
/** 取れるか。理由つき（UI の表示条件と AI の候補・命令の検証は、この同じ関数を通る） */
export function canAdopt(st, id) {
  const d = nodeOf(st, id); if (!d) return { ok: false, reason: "そのドクトリンはありません" }; const M = st.military;
  if (M?.doctrine.taken[id] != null) return { ok: false, reason: "すでに取得済み" };
  if (d.special && !(M?.special ?? []).some((b) => `sp:${b.key}` === d.branch)) return { ok: false, reason: `${d.ja}は、今のこの国の固有の系統ではない` };
  for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `前提のドクトリン「${nodeOf(st, p)?.ja ?? p}」が未取得` };
  for (const t of d.tech) if (!has(st, t)) return { ok: false, reason: `技術「${t}」が必要` };
  if (st.treasury < d.cost) return { ok: false, reason: `財政が足りない（${d.cost}）` };
  return { ok: true };
}
export function adoptDoctrine(ctx, st, id, { provenance = "simulation", decisionId = null } = {}) {
  const c = canAdopt(st, id); if (!c.ok) return c; const { civ, ids } = ctx, d = nodeOf(st, id); const M = (st.military ??= initMilitary());
  st.treasury -= d.cost; M.doctrine.taken[id] = civ.monthIndex;
  const ev = makeEvent(civ, ids, { kind: "doctrine_adopted", title: `${st.name}が「${d.ja}」を取り入れた`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId });
  recompute(ctx, st); return { ok: true, eventId: ev?.eventId ?? null };
}
/** 固有の系統の見直し（年 1 回）。得点の高い 3 本。系統が変わると、前の系統のノードは休眠する（取得の記録は残る） */
export function refreshSpecial(ctx, st) {
  const M = st.military, next = chooseSpecial(doctrineInfo(ctx, st), M.special); const same = M.special.length === 3 && next.every((b, i) => M.special.some((o) => o.key === b.key));
  if (!same) M.special = next;
}
function recompute(ctx, st) {
  const M = st.military, ind = effective(ctx.civ, st, "perCapita"), wTech = (has(st, "bronze_weapons") ? 0.08 : 0) + (has(st, "iron_weapons") ? 0.12 : 0) + (has(st, "steel") ? 0.05 : 0) + (has(st, "gunpowder") ? 0.1 : 0);
  M.equipLevel = clamp(0.15 + 0.35 * clamp(ind / 1.6) + wTech + (st.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st.econ?.investment ?? 0), 0, 1);
  M.readiness = clamp(0.5 * effective(ctx.civ, st, "stability") + 0.3 * (st.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st.politics ? effective(ctx.civ, st, "fatigue") : 0)), 0, 1);
  const fx = doctrineFx(st), off = fx.off, def = fx.def; M.fx = fx;
  const eqE = effective(ctx.civ, st, "equipLevel"), rdE = effective(ctx.civ, st, "readiness"); // 介入があれば有効値（通常値＋補正）で軍事能力を決める
  const sfx = stateFx(st); st.milBonus = Math.round(clamp(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off + sfx.mil, -0.6, 0.6) * 1000) / 1000; st.milDef = Math.round((def + sfx.def) * 1000) / 1000; // v6.12.0: 役職・国策のバフ
}
/** 月次（3か月ごと）: 総兵力を部隊に分け、装備・練度・軍事能力を更新 */
export function stepMilitary(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 3 !== 0) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const M = (st.military ??= initMilitary()); if (!M.special?.length || mi % 12 === 0) refreshSpecial(ctx, st); recompute(ctx, st);
    const shares = M.shares && Object.keys(M.shares).every((k) => UNIT_KINDS[k]?.need(st, ctx)) ? M.shares : shareOf(ctx, st); if (M.shares && shares !== M.shares) M.shares = null; // 使えなくなった編制は自動の配分へ戻る
    const old = new Map(M.units.map((u) => [u.kind, u])), next = [];
    for (const [k, sh] of Object.entries(shares)) {
      const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: unitName(st, k), since: mi };
      u.name = unitName(st, k); /* v6.5.0: 技術・ドクトリンに合わせて名前が改まる */
      u.size = Math.round(st.army * sh * 10) / 10; u.equip = Math.round(clamp(effective(ctx.civ, st, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : 0)) * 100) / 100; u.readiness = Math.round(effective(ctx.civ, st, "readiness") * 100) / 100; next.push(u);
    }
    M.units = next; M.armyBasis = st.army; // 部隊は、この時点の総兵力の配分（兵力はその後の月で変わる）
  }
}
/** 部隊編制の変更（プレイヤー・創造主の命令）。使える種類だけ・配分の合計が1・費用を払える */
export function reorganize(ctx, st, shares) {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0); if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "配分の合計は 1" };
  for (const [k, v] of Object.entries(shares)) { if (!UNIT_KINDS[k]) return { ok: false, reason: `未知の部隊 ${k}` }; if (!(v >= 0)) return { ok: false, reason: "配分は 0 以上" }; if (v > 0 && !UNIT_KINDS[k].need(st, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}は今の技術・地理では編制できない` }; }
  const cost = Math.round(st.army * 0.002 * 10) / 10; if (st.treasury < cost) return { ok: false, reason: `再編の費用 ${cost} が足りない` };
  st.treasury -= cost; (st.military ??= initMilitary()).shares = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0)); stepMilitaryNow(ctx, st); return { ok: true, cost };
}
function stepMilitaryNow(ctx, st) { const mi = ctx.civ.monthIndex; const prev = ctx.civ.monthIndex; ctx.civ.monthIndex = mi - (mi % 3); const only = (s) => s; try { const states = ctx.civ.states; const keep = Object.values(states).filter((s) => s !== st).map((s) => [s, s.alive]); for (const [s] of keep) s.alive = false; stepMilitary(ctx); for (const [s, a] of keep) s.alive = a; } finally { ctx.civ.monthIndex = prev; } }

