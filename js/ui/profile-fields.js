// 「詳しく」の中身（政治・文化の深さ）。国・文化・宗教の種類/政体/起源と、都市の設備。
// history-builder.js から呼ぶ。見るだけなら畳んだまま、触りたい人だけが開く。

import { el, btn } from "./kit.js";
import { CULTURE_TYPES, RELIGION_TYPES, STATE_FORMS, BURG_GROUPS, BURG_FEATURES } from "../core/edit/profile.js";

const LIST_KEY = { state: "states", culture: "cultures", religion: "religions" };
const live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

function selectField(label, options, value, onChange, hint) {
  const f = el("label", "b-field");
  f.append(el("span", "b-mini", label));
  const sel = document.createElement("select");
  for (const o of options) sel.append(new Option(o.label, String(o.id)));
  if (!options.some((o) => String(o.id) === String(value))) sel.append(new Option(String(value ?? "（未設定）"), String(value ?? "")));
  sel.value = String(value ?? "");
  sel.addEventListener("change", () => onChange(sel.value));
  f.append(sel);
  if (hint) f.title = hint;
  return f;
}
function textField(label, value, onChange) {
  const f = el("label", "b-field");
  f.append(el("span", "b-mini", label));
  const inp = document.createElement("input");
  inp.value = value ?? "";
  inp.addEventListener("change", () => { if (inp.value.trim()) onChange(inp.value); });
  f.append(inp);
  return f;
}

/** 国・文化・宗教の詳細に足す欄 */
export function appendEntityProfile(d, kind, e, { editActions, map, openEntity }) {
  if (kind === "state") {
    d.append(
      selectField("政体", STATE_FORMS, e.form, (v) => editActions.setEntityProfile("state", e.i, { form: v }), "政体を変えると、国の基準の税率の目安も変わります（税率そのものは経済タブで調整）"),
      textField("政体名（国名につく語）", e.formName, (v) => editActions.setEntityProfile("state", e.i, { formName: v })),
      selectField("国の種類", CULTURE_TYPES, e.type, (v) => editActions.setEntityProfile("state", e.i, { type: v })),
    );
    return;
  }
  d.append(selectField(kind === "religion" ? "宗教の種類" : "文化の種類", kind === "religion" ? RELIGION_TYPES : CULTURE_TYPES, e.type, (v) => editActions.setEntityProfile(kind, e.i, { type: v })));
  if (kind === "religion") d.append(textField("神・信仰の対象", e.deity, (v) => editActions.setEntityProfile("religion", e.i, { deity: v })));

  // 起源（系統）: 親を選ぶ。自分と子孫は選べない（選択肢から外す）
  const banned = new Set([e.i, ...editActions.descendantsOf(kind, e.i)]);
  const opts = [{ id: 0, label: kind === "religion" ? "なし（共通の祖・原始信仰）" : "なし（共通の祖）" }];
  for (const x of map.pack[LIST_KEY[kind]]) if (live(x) && !banned.has(x.i)) opts.push({ id: x.i, label: x.name });
  d.append(selectField("起源（どこから分かれたか）", opts, editActions.originOf(kind, e.i), (v) => editActions.setOrigin(kind, e.i, Number(v))));
  const kids = editActions.descendantsOf(kind, e.i).map((i) => map.pack[LIST_KEY[kind]][i]).filter(live);
  if (kids.length) {
    const row = el("div", "b-kids");
    row.append(el("span", "b-mini", "ここから分かれた"));
    for (const k of kids.slice(0, 8)) row.append(btn("b-chip", k.name, "この項目を開く", () => openEntity?.(kind, k.i)));
    if (kids.length > 8) row.append(el("span", "b-mini", `ほか${kids.length - 8}`));
    d.append(row);
  }
}

/** 都市の詳細（設備のチェック・区分・人口） */
export function burgDetails(b, { editActions, map }) {
  const d = el("div", "b-details");
  const pop = el("label", "b-field");
  pop.append(el("span", "b-mini", "人口（千人。国の都市人口にも反映）"));
  const inp = document.createElement("input");
  inp.type = "number"; inp.min = "0"; inp.step = "0.1"; inp.value = String(Math.round((b.population ?? 0) * 100) / 100);
  inp.addEventListener("change", () => editActions.setBurgProfile(b.i, { population: inp.value }));
  pop.append(inp);
  d.append(pop);

  d.append(selectField("区分", BURG_GROUPS, b.group, (v) => editActions.setBurgProfile(b.i, { group: v }), b.capital ? "首都の区分は変えられません" : ""));
  d.querySelector("select:last-of-type")?.toggleAttribute("disabled", !!b.capital);
  d.append(selectField("種類", CULTURE_TYPES, b.type ?? "Generic", (v) => editActions.setBurgProfile(b.i, { type: v })));

  const feats = el("div", "b-feats");
  feats.append(el("span", "b-mini", "設備"));
  for (const f of BURG_FEATURES) {
    const lab = el("label", "b-feat");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!b[f.id];
    cb.addEventListener("change", () => editActions.setBurgProfile(b.i, { [f.id]: cb.checked }));
    lab.append(cb, el("span", "", `${f.icon} ${f.label}`));
    feats.append(lab);
  }
  d.append(feats);
  if (b.port) d.append(el("p", "b-hint", "⚓ 港があります（港の有無は、ここでは変えられません）"));

  const foot = el("div", "b-actions");
  const st = map.pack.states[b.state];
  if (!b.capital && st && st.i) foot.append(btn("", "首都にする", `${st.name}の首都をこの都市にする`, () => editActions.setCapital(b.state, b.i)));
  d.append(foot);
  return d;
}

/** 都市カードの1行ぶんの表示用: 設備の絵文字 */
export const featureIcons = (b) => BURG_FEATURES.filter((f) => b[f.id]).map((f) => f.icon).join("") + (b.port ? "⚓" : "");
