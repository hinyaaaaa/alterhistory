// 反乱・独立ウィンドウ（v2.6.1）：州に縛られない、自由な反乱。
//   ・反乱の種類（歴史上の5つの型）と規模（小・中・大）、形（内戦／平和的な分離）、名前・色を決めて「確定」を押したときだけ起こる
//   ・領域は、型に合った起点から、規模に応じて連結して広がる（属州の単位ではない。属州の一部だけを含むときは、反乱側に新しい属州を切り出す）
//   ・内戦なら、軍が割れて元の国との戦争が始まる。補給や物資のような細かい設定は無い
// 確定するまで地図にも年表にも何も残らず、キャンセル／×なら何も起きなかったことになる。

import { el, btn } from "./kit.js";
import { alertDialog } from "./dialogs.js";
import { REBEL_TYPES, REBEL_TYPE_BY_KEY, REBEL_SCALES, canRebel } from "../core/edit/rebellion.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

/**
 * @param {{wins:object, store:object, simActions:object, setupActions:object}} deps
 */
export function initRebellionWindow({ wins, store, simActions, setupActions }) {
  const body = el("div", "setup-body");
  wins.register("rebellion", { title: "反乱・独立", width: 460, body });

  function render({ stateId }) {
    body.replaceChildren();
    const map = store.getState().map;
    const st = map?.pack.states[stateId];
    if (!isLive(st)) { body.append(el("p", "muted", "国家が見つかりません。")); return; }
    const stName = st.fullName ?? st.name;
    body.append(el("p", "hint", `${stName}で、反乱が起こります。州には縛られず、種類と規模に応じた領域が離反します。確定するまで、何も起きません。`));
    if (!canRebel(map, stateId)) { body.append(el("p", "muted", "反乱の拠点になる都市（首都のほか）のある領土がありません。")); return; }

    const typeSel = document.createElement("select"); typeSel.dataset.field = "rebel-type";
    for (const t of REBEL_TYPES) typeSel.append(new Option(`${t.label}（${t.goal === "overthrow" ? "政体転覆" : "分離独立"}）`, t.key));
    const typeHint = el("p", "hint"); const showHint = () => { const t = REBEL_TYPE_BY_KEY[typeSel.value]; typeHint.textContent = `${t.desc}（歴史上の例: ${t.examples}）`; }; typeSel.addEventListener("change", showHint); showHint();
    const typeField = el("label", "b-field"); typeField.append(el("span", "b-mini", "反乱の種類"), typeSel);
    const scaleSel = document.createElement("select"); scaleSel.dataset.field = "rebel-scale";
    for (const sc of REBEL_SCALES) scaleSel.append(new Option(`${sc.label}（領土の${Math.round(sc.share * 100)}%ほど）`, sc.key, false, sc.key === "medium"));
    const scaleField = el("label", "b-field"); scaleField.append(el("span", "b-mini", "規模"), scaleSel);
    body.append(typeField, typeHint, scaleField);

    const nameIn = document.createElement("input"); nameIn.placeholder = "空欄なら、おまかせで決めます";
    const dice = btn("suggest-mini", "@dice", "名前をランダムに決める", (ev) => { ev.preventDefault(); const g = setupActions.suggest("state", { stateId }); if (g) nameIn.value = g.name; });
    const row = el("span", "name-row"); row.append(nameIn, dice);
    const nameField = el("label", "b-field"); nameField.append(el("span", "b-mini", "新しい国の名前"), row);
    const color = document.createElement("input"); color.type = "color"; color.value = setupActions.suggestColor("state");
    const colorField = el("label", "b-field"); colorField.append(el("span", "b-mini", "色"), color);
    body.append(nameField, colorField);

    const kind = document.createElement("select"); kind.dataset.field = "rebel-kind";
    kind.append(new Option("内戦（軍が割れて、元の国と戦争になる）", "civil"), new Option("平和的な分離（戦争にならない）", "peaceful"));
    const kindField = el("label", "b-field"); kindField.append(el("span", "b-mini", "形"), kind);
    body.append(kindField);

    const msg = el("p", "hint");
    const ok = btn("danger", "反乱を起こす", "この内容で、反乱が起こります", () => {
      msg.textContent = "";
      try {
        const r = simActions.startRebellion(stateId, { type: typeSel.value, scale: scaleSel.value, civil: kind.value === "civil", name: nameIn.value, color: color.value });
        wins.close("rebellion");
        alertDialog(r.warId != null ? `${r.typeLabel}：「${r.name}」が ${stName} から離反し、内戦が始まりました。` : `「${r.name}」が ${stName} から分離しました。`);
      } catch (e) { msg.textContent = `起こせませんでした: ${e.message}`; }
    });
    const cancel = btn("", "キャンセル", "何も起こさずに閉じる", () => wins.close("rebellion"));
    const actions = el("div", "b-actions"); actions.append(ok, cancel);
    body.append(msg, actions);
  }

  return { open(opts) { render(opts ?? {}); wins.open("rebellion"); } };
}
