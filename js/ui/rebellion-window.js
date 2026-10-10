// 反乱・独立ウィンドウ：属州が離反して別の国家になる（HoI4 のように）。
//   ・分離する属州を選び、名前・色・形（内戦／平和的な独立）を決めて「確定」を押したときだけ起こる
//   ・内戦なら、軍が割れて元の国との戦争が始まる。平和的な独立なら、戦争にはならない
//   ・補給や物資のような細かい設定は無い
// 確定するまで地図にも年表にも何も残らず、キャンセル／×なら何も起きなかったことになる。

import { el, btn } from "./kit.js";
import { alertDialog } from "./dialogs.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

/**
 * @param {{wins:object, store:object, simActions:object, setupActions:object}} deps
 */
export function initRebellionWindow({ wins, store, simActions, setupActions }) {
  const body = el("div", "setup-body");
  wins.register("rebellion", { title: "🏴 反乱・独立", width: 440, body });

  function render({ stateId, provinceId }) {
    body.replaceChildren();
    const map = store.getState().map;
    const st = map?.pack.states[stateId];
    if (!isLive(st)) { body.append(el("p", "muted", "国家が見つかりません。")); return; }
    // 属州ごとのセル数は、保存値ではなくセルの実データから数える（保存値が無い・古い地図でも正しく出る）
    const count = new Map(); const pc = map.pack.cells;
    for (let i = 0; i < pc.province.length; i++) if (pc.state[i] === stateId && pc.province[i] > 0) count.set(pc.province[i], (count.get(pc.province[i]) ?? 0) + 1);
    const provs = map.pack.provinces.filter((p) => isLive(p) && p.state === stateId && (count.get(p.i) ?? 0) > 0);
    const stName = st.fullName ?? st.name;
    body.append(el("p", "hint", `${stName}から、属州が離反して別の国になります。確定するまで、何も起きません。`));
    if (provs.length < 1) { body.append(el("p", "muted", "分離できる属州がありません（領土のある属州が必要です）。")); return; }

    // 分離する属州
    const group = el("div", "b-field"); group.append(el("span", "b-mini", "分離する属州（複数選べます）"));
    const boxes = [];
    for (const p of provs) {
      const lab = el("label", "b-feat"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = String(p.i); cb.checked = p.i === provinceId;
      lab.append(cb, el("span", "", `${p.fullName ?? p.name}（${count.get(p.i)}セル）`)); group.append(lab); boxes.push(cb);
    }
    body.append(group);

    // 名前・色
    const nameIn = document.createElement("input"); nameIn.placeholder = "空欄なら、おまかせで決めます";
    const dice = btn("suggest-mini", "🎲", "名前をランダムに決める", (ev) => { ev.preventDefault(); const g = setupActions.suggest("state", { stateId }); if (g) nameIn.value = g.name; });
    const row = el("span", "name-row"); row.append(nameIn, dice);
    const nameField = el("label", "b-field"); nameField.append(el("span", "b-mini", "新しい国の名前"), row);
    const color = document.createElement("input"); color.type = "color"; color.value = setupActions.suggestColor("state");
    const colorField = el("label", "b-field"); colorField.append(el("span", "b-mini", "色"), color);
    body.append(nameField, colorField);

    // 形
    const kind = document.createElement("select");
    kind.append(new Option("内戦（軍が割れて、元の国と戦争になる）", "civil"), new Option("平和的な独立（戦争にならない）", "peaceful"));
    const kindField = el("label", "b-field"); kindField.append(el("span", "b-mini", "形"), kind);
    body.append(kindField);

    const msg = el("p", "hint");
    const ok = btn("danger", "反乱を起こす", "この内容で、新しい国が分離します", () => {
      msg.textContent = "";
      const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      if (!ids.length) { msg.textContent = "分離する属州を1つ以上選んでください。"; return; }
      try {
        const r = simActions.rebel({ provinceIds: ids, name: nameIn.value, color: color.value, civil: kind.value === "civil" });
        wins.close("rebellion");
        alertDialog(r.warId != null ? `「${r.name}」が ${stName} から分離し、内戦が始まりました。` : `「${r.name}」が ${stName} から平和的に独立しました。`);
      } catch (e) { msg.textContent = `起こせませんでした: ${e.message}`; }
    });
    const cancel = btn("", "キャンセル", "何も起こさずに閉じる", () => wins.close("rebellion"));
    const actions = el("div", "b-actions"); actions.append(ok, cancel);
    body.append(msg, actions);
  }

  return { open(opts) { render(opts ?? {}); wins.open("rebellion"); } };
}
