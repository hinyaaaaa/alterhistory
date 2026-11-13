// v6.12.0: 国策（分野ごとの枠）と、役職の効果の要約。担当国は、枠に国策を入れて国の方針を決める（費用がかかり、同じ枠は 24 か月は替えられない）。
import { h, btn, pct, n0, lb } from "./common.js";
import { S, act } from "./store.js";
import { POLICIES, POLICY_CATS, focusOf, policyCost, policyGate, SLOT_COOLDOWN } from "../../core/wcde/policies.js";
import { officeEffects, officeUpkeep, officeInfo, DEBUFF_JA } from "../../core/wcde/regimes.js";
import { stateFx } from "../../core/wcde/statefx.js";

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

/** 国策の枠 */
export function policyBox(st, mine) {
  const F = focusOf(st), c = S.w.civ, mi = c.monthIndex, box = h("div", { id: "policybox" }, lb("国策", "NATIONAL FOCUS"), h("p", { class: "n" }, `分野ごとの枠に、国の方針を入れます。枠は時代（制度化した技術）で増えます。取り入れると費用がかかり、同じ枠は ${SLOT_COOLDOWN} か月は替えられません。`));
  const fx = stateFx(st); if (fx.policy?.count || fx.office?.count) box.append(h("div", { class: "chips" }, ...fxChips({ tax: fx.tax, mil: fx.mil, def: fx.def, stab: fx.stab, dipl: fx.dipl, scout: fx.scout, tech: fx.tech }, fx.fac)));
  for (const [cat, ja] of Object.entries(POLICY_CATS)) {
    box.append(h("div", { class: "pcat" }, h("b", {}, ja), ...F[cat].map((slot, i) => { const cur = slot ? POLICIES[slot.id] : null, left = slot ? Math.max(0, SLOT_COOLDOWN - (mi - slot.since)) : 0;
      const opts = Object.entries(POLICIES).filter(([, p]) => p.cat === cat).map(([id, p]) => { const why = policyGate(st, id, cat), taken = F[cat].some((x, j) => j !== i && x?.id === id) || Object.values(F).some((a) => a.some((x) => x?.id === id && x !== slot)); return h("option", { value: id, selected: slot?.id === id, disabled: !!why || taken }, `${p.ja}（費用 ${policyCost(st, id)}）${why ? "・" + why : taken ? "・取り入れ済み" : ""}`); });
      const sel = h("select", { "data-cat": cat, "data-slot": i, disabled: !mine || (slot && left > 0), title: slot && left > 0 ? `あと ${left} か月は替えられない` : "" }, h("option", { value: "" }, cur ? "（取り下げる）" : "（空き）"), ...opts);
      return h("div", { class: "pslot" }, sel, btn("決める", () => act({ type: "focus.set", stateId: st.id, category: cat, slot: i, policyId: sel.value || null }), "", { disabled: !mine, "data-set": cat + i }), cur ? h("div", { class: "pdesc" }, h("small", {}, cur.desc), h("div", { class: "chips" }, ...fxChips(cur.fx, cur.fac))) : h("small", { class: "dim" }, "空いている枠"));
    })));
  }
  void pct; return box;
}
