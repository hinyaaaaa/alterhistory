// v5.3 UI: 「世界」領域。世界の概要・新しい世界／ファイルを開く／全体表示／地図編集の入口。
import { h } from "../dom.js";
import { fmtMonth, fmtNum } from "../format.js";
import { PAST_REASON } from "./detail-view.js";

export function renderWorldView({ adapter, ui }) {
  const m = adapter.meta(), past = m.past;
  const root = h("div", { class: "v53-world" });
  root.append(h("section", { class: "v53-sec" }, h("h3", { text: "世界" }),
    h("dl", { class: "v53-stats" },
      stat("名前", m.name || "—"), stat("現在", m.hasCiv ? fmtMonth(m.now) : "歴史はまだ始まっていません"),
      stat("セル数", m.cells ? fmtNum(m.cells) : "—"), stat("国家", m.hasCiv ? String(m.states) : "—"),
      stat("戦争", m.hasCiv ? String(m.wars) : "—", m.wars ? "danger" : ""), stat("記録された出来事", m.hasCiv ? fmtNum(m.events) : "—"))));
  const mk = (label, fn, { writes = false, primary = false, id } = {}) => { const b = h("button", { type: "button", class: `v53-btn${primary ? " primary" : ""}`, dataset: { act: id }, text: label, title: writes && past ? PAST_REASON : "", onclick: fn }); b.disabled = writes && past; return b; };
  root.append(h("section", { class: "v53-sec" }, h("h3", { text: "操作" }), h("div", { class: "v53-actions" },
    mk(m.hasWorld ? "新しい世界を作る" : "世界を作る", () => ui.set({ startFlow: true }), { writes: true, primary: !m.hasCiv, id: "new-world" }),
    mk("ファイルを開く", () => adapter.world.openFile(), { writes: true, id: "open" }),
    mk("全体表示", () => adapter.world.fitView(), { id: "fit" }),
    mk("地図を編集", () => adapter.world.editMap(), { writes: true, id: "edit-map" }))));
  return root;
}
const stat = (label, value, tone = "") => h("div", { class: `v53-stat${tone ? " tone-" + tone : ""}` }, h("dt", { text: label }), h("dd", { text: value }));
