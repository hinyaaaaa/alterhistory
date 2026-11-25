// v7 左パネルの共通処理: 旧画面（v6）の部品を v7 の入れ物へ載せるための取り出し、関係の判定、年表の分類。
import { h } from "../v6/common.js";
import { S, controlled } from "../v6/store.js";
import { TREATY, atWarWith } from "../../core/civ/diplomacy.js";
import { classifyEvent, newsContext } from "../../core/wcde/clock.js";

/** 旧画面の部品を載せる。先頭の英字見出し（.code）と h2 は v7 の見出しに置き換えるので外す */
export function legacy(el) {
  for (const x of [...el.children]) if (x.classList?.contains("code") || x.tagName === "H2") x.remove();
  el.classList.add("v-legacy");
  return el;
}
export const civ = () => S.w.civ;
export const me = () => (controlled() ? civ().states[controlled()] : null);

/** 2 国の関係: a 同盟／f 友好／n 不可侵／v 従属／h 敵対／- なし。条約と戦争から導く（点数は持たない） */
export function relOf(c, A, B) {
  if (atWarWith(c, A, B)) return { k: "h", ja: "戦争中" };
  let best = null;
  const rank = { a: 5, v: 4, f: 3, n: 2 };
  for (const i of c.activeTreatyIds ?? []) {
    const t = c.treaties[i];
    if (!t?.active || !((t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id))) continue;
    const T = TREATY[t.type];
    let k = "f";
    if (t.type === "alliance" || t.type === "defensive") k = "a";
    else if (T.cat === "dep") k = "v";
    else if (t.type === "nonaggression") k = "n";
    else if (T.cat === "eco" || T.cat === "dyn") k = "f";
    else if (T.cat === "mil") k = "n";
    else if (T.cat === "land") k = "f";
    if (!best || rank[k] > rank[best.k]) best = { k, ja: T.ja };
  }
  if (best) return best;
  if ((A.relations?.[B.id] ?? 0) <= -40) return { k: "h", ja: "険悪" };
  return { k: "-", ja: "" };
}
export const REL_NAME = { a: "同盟", f: "友好", n: "不可侵", h: "敵対", v: "従属", "-": "関係なし" };
export const REL_COL = { a: "#b8a06a", f: "#7fc29a", n: "#8a9ca5", h: "#e0806f", v: "#c49ad6", "-": "#556" };
export const REL_TAG = { a: "v-t-a", f: "v-t-f", n: "v-t-n", h: "v-t-h", v: "v-t-v" };

/** 年表の分類: 世界・内政・外交・軍事 */
const CAT_RE = [
  ["m", /war|battle|siege|conquest|invasion|mobil|army|corps|nuclear|raid|uprising|rebel|civil|surrender|annex/],
  ["d", /treaty|alliance|diplom|peace|vassal|sanction|embargo|marriage|envoy|pact|ally/],
  ["i", /state_action|policy|regime|office|succession|leader|ruler|reform|tax|tech|law|edict|heir|regency|constitution/],
];
export const CAT = { w: ["世界", "#9db4c0"], i: ["内政", "#7cc4e8"], d: ["外交", "#7fc29a"], m: ["軍事", "#e0806f"] };
export const catOf = (kind) => (CAT_RE.find(([, re]) => re.test(kind)) ?? ["w"])[0];
export function chronicle(limit, { cats, major = true } = {}) {
  const c = civ(), cx = newsContext(c), out = [];
  for (let i = c.events.length - 1; i >= 0 && out.length < limit; i--) {
    const ev = c.events[i], cl = classifyEvent(c, ev, cx), cat = catOf(ev.kind);
    if (major && cl.level === "normal") continue;
    if (cats && !cats[cat]) continue;
    out.push({ ev, cat, level: cl.level });
  }
  return out;
}
export { h };
