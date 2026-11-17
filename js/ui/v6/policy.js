// v6.12.0: 国策（分野ごとの枠）と、役職の効果の要約。担当国は、枠に国策を入れて国の方針を決める（費用がかかり、同じ枠は 24 か月は替えられない）。
import { h, btn, pct, n0, lb } from "./common.js";
import { S, act } from "./store.js";
import { POLICIES, POLICY_CATS, focusOf, policyCost, policyGate, SLOT_COOLDOWN } from "../../core/wcde/policies.js";
import { officeEffects, officeUpkeep, officeInfo, DEBUFF_JA } from "../../core/wcde/regimes.js";
import { stateFx } from "../../core/wcde/statefx.js";
import { policyBadge, CAT_STYLE } from "./badges.js";

const sg = (x, d = 1) => (x >= 0 ? "+" : "") + (Math.round(x * 100 * 10 ** (d - 1)) / 10 ** (d - 1)).toFixed(d - 1 > 0 ? d - 1 : 0) + "%";
const KEYS = { tax: "税収", mil: "軍事", def: "防衛", stab: "安定", dipl: "外交", scout: "偵察", tech: "技術", cult: "文化" };
export const fxChips = (fx = {}, fac = {}) => [...Object.entries(KEYS).filter(([k]) => fx[k]).map(([k, ja]) => h("span", { class: "chip" + (fx[k] < 0 ? " bad" : " good") }, `${ja} ${sg(fx[k])}`)), ...Object.entries(fac).filter(([, v]) => v).map(([k, v]) => h("span", { class: "chip" + (v < 0 ? " bad" : " good"), title: "勢力の支持の目標" }, `${FJ[k] ?? k}の支持 ${sg(v)}`))];
const FJ = { nobility: "貴族", clergy: "聖職者", merchants: "商人", military: "軍", commoners: "民衆", bureaucrats: "官僚", artisans: "職人", clans: "氏族" };

/** 役職の効果の要約: 置いた数・維持費・官僚肥大・合計の効果 */
export function officeSummary(st) {
  const e = officeEffects(st, S.w.civ.monthIndex); if (!e.count) return null; const up = officeUpkeep(st) * 3, tax = st.pop * st.policy.tax * 0.0012 * 3;
  return h("div", { class: "offsum" }, h("small", {}, `役職 ${e.count} 件（快適な数は約 ${e.comfort} 件）・維持費 ${n0(up)} / 3か月（税収の約 ${tax > 0 ? Math.round((up / tax) * 100) : 0}%）${e.extra ? `・官僚肥大 ${e.extra} 件分（安定と民衆の支持が下がる）` : ""}`), h("div", { class: "chips" }, ...fxChips({ tax: e.tax, mil: e.mil, stab: e.stab, dipl: e.dipl, scout: e.scout, tech: e.tech, cult: e.cult }, e.fac)));
}
export const officeChips = (id) => { const i = officeInfo(id); if (!i) return []; return [...fxChips(i.fx, i.fac), i.debuff ? h("span", { class: "chip bad", title: "欠点" }, DEBUFF_JA[i.debuff]) : null, h("span", { class: "chip", title: "維持費の重さ" }, "維持" + "●".repeat(Math.min(4, i.tier)))].filter(Boolean); };

/** 国策の枠（v6.17.0: バッジ）。分野ごとに、取り入れた国策のバッジが枠にはまる。空きの枠を押すと、いま取り入れられるバッジだけが並ぶ */
export function policyBox(st, mine) {
  const F = focusOf(st), c = S.w.civ, mi = c.monthIndex, box = h("div", { id: "policybox", class: "pbox" }, lb("政策", "POLICY"));
  const fx = stateFx(st); if (fx.policy?.count || fx.office?.count) box.append(h("div", { class: "chips" }, ...fxChips({ tax: fx.tax, mil: fx.mil, def: fx.def, stab: fx.stab, dipl: fx.dipl, scout: fx.scout, tech: fx.tech }, fx.fac)));
  const open = S.polPick?.id === st.id ? S.polPick : null, tip = (id, p) => `${p.ja}\n${p.desc}\n費用 ${policyCost(st, id)}`;
  for (const [cat, ja] of Object.entries(POLICY_CATS)) {
    const row = h("div", { class: "pcat prow", "data-cat": cat }, h("b", { class: "pcn", style: `color:${CAT_STYLE[cat][0]}` }, ja), h("div", { class: "pslots" }, ...F[cat].map((slot, i) => {
      const cur = slot ? POLICIES[slot.id] : null, left = slot ? Math.max(0, SLOT_COOLDOWN - (mi - slot.since)) : 0, isOpen = open && open.cat === cat && open.slot === i;
      const b = h("button", { class: "pslot" + (cur ? " has" : "") + (isOpen ? " sel" : ""), "data-set": cat + i, title: cur ? `${tip(slot.id, cur)}${left ? `\nあと ${left} か月は替えられない` : "\n押すと取り下げる"}` : "取り入れる", disabled: !mine || (cur && left > 0), onclick: () => { if (cur) act({ type: "focus.set", stateId: st.id, category: cat, slot: i, policyId: null }); else { S.polPick = isOpen ? null : { id: st.id, cat, slot: i }; S.hooks.panel(); } } }, policyBadge(slot?.id ?? "", cat, { on: !!cur, empty: !cur, size: 58 }), cur && left ? h("i", { class: "lock" }, left) : null);
      return b;
    })));
    box.append(row);
    if (open && open.cat === cat) {
      const cands = Object.entries(POLICIES).filter(([id, p]) => p.cat === cat && !policyGate(st, id, cat) && !Object.values(F).some((a) => a.some((x) => x?.id === id)));
      box.append(h("div", { class: "ppick" }, ...(cands.length ? cands.map(([id, p]) => h("button", { class: "pcand", "data-pol": id, title: tip(id, p), onclick: () => { const r = act({ type: "focus.set", stateId: st.id, category: cat, slot: open.slot, policyId: id }); if (r.ok) S.polPick = null; S.hooks.panel(); } }, policyBadge(id, cat, { size: 52 }), h("small", {}, `${policyCost(st, id)}`), h("div", { class: "chips" }, ...fxChips(p.fx, p.fac).slice(0, 3)))) : [h("small", { class: "dim" }, "いま取り入れられる政策はありません")])));
    }
  }
  void pct; return box;
}
