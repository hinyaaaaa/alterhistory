// 凡例：色分けに使っている実体（国家・文化・宗教・属州）の一覧。項目を選ぶとその場所へ移動する。
import { listEntities, ENTITY_KINDS } from "../core/query.js";
import { isProvisional } from "../core/edit/naming.js";
import { byId } from "./dom.js";

export function initLegend({ store, actions, panels }) {
  const title = byId("legend-title");
  const list = byId("legend-list");
  const wrap = byId("legend");
  let lastKey = null;
  let rev = 0; // 編集のたびに増やす。国家などを作った・塗った後も凡例の一覧と数を最新にするため

  function render(state, change) {
    if (change && ["commit", "undo", "redo", "replace"].includes(change.type)) rev++;
    const { map, view } = state;
    // サイドバーは editor-panel（選択中の対象）が開いている間だけでなく、
    // 凡例を表示できる状態（地図が読み込まれている）でも幅を確保する（CSS側で判定）。
    wrap.classList.toggle("has-map", !!map);
    const key = map ? `${map.geometry?.pack.p.length}:${view.overlay}:${state.fileName}:${rev}` : "none";
    if (key === lastKey) return; // 表示に関係ない更新（ホバー等）では作り直さない
    lastKey = key;

    list.replaceChildren();
    if (!map || view.overlay === "none") {
      title.textContent = "凡例";
      list.append(message(map ? "色分けを選ぶと、ここに一覧が表示されます" : "地図を開くと表示されます"));
      return;
    }
    const items = listEntities(map, view.overlay);
    title.textContent = `凡例：${ENTITY_KINDS[view.overlay].label}（${items.length}）`;
    if (items.length === 0) { list.append(message("該当するものがありません")); return; }

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = `${it.name}（${it.cells}セル）— クリックで移動、右クリックで編集`;
      const chip = document.createElement("span"); chip.className = "chip"; chip.style.background = it.color;
      const name = document.createElement("span"); name.className = "legend-name"; name.textContent = it.name;
      const count = document.createElement("span"); count.className = "legend-count"; count.textContent = String(it.cells);
      btn.append(chip, name);
      if (isProvisional(map, view.overlay, it.id)) { const tag = document.createElement("span"); tag.className = "legend-prov"; tag.textContent = "仮"; tag.title = "仮の名前（編集パネルで確定できます）"; btn.append(tag); }
      btn.append(count);
      btn.addEventListener("click", () => actions.locate(it));
      btn.addEventListener("contextmenu", (e) => { e.preventDefault(); panels?.openEntity(view.overlay, it.id); });
      li.append(btn);
      frag.append(li);
    }
    list.append(frag);
  }

  function message(text) {
    const li = document.createElement("li");
    li.className = "legend-empty";
    li.textContent = text;
    return li;
  }

  store.subscribe(render);
  render(store.getState());
}
