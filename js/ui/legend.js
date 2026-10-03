// 凡例：色分けに使っている実体（国家・文化・宗教・属州）の一覧。
//   - 項目を押すと、その場所へ移動し、境界線を赤く光らせる（しばらくして消える）
//   - 右クリックで編集パネルを開く
//   - 色分けのレイヤーを2つ以上重ねているときは、見出しの下のタブで、どれの一覧を出すか選ぶ
import { listEntities, ENTITY_KINDS } from "../core/query.js";
import { isProvisional } from "../core/edit/naming.js";
import { activeFills, legendKindOf, FILL_LABEL } from "../app/layers.js";
import { byId } from "./dom.js";

export function initLegend({ store, actions, panels, highlight }) {
  const title = byId("legend-title");
  const list = byId("legend-list");
  const wrap = byId("legend");
  const tabs = byId("legend-tabs");
  let lastKey = null;
  let rev = 0; // 編集のたびに増やす。国家などを作った・塗った後も凡例の一覧と数を最新にするため

  function render(state, change) {
    if (change && ["commit", "undo", "redo", "replace"].includes(change.type)) rev++;
    const { map, view } = state;
    // サイドバーは editor-panel（選択中の対象）が開いている間だけでなく、
    // 凡例を表示できる状態（地図が読み込まれている）でも幅を確保する（CSS側で判定）。
    wrap.classList.toggle("has-map", !!map);
    const kind = legendKindOf(view);
    const fills = activeFills(view);
    const key = map ? `${map.geometry?.pack.p.length}:${kind}:${fills.join(",")}:${state.fileName}:${rev}` : "none";
    if (key === lastKey) return; // 表示に関係ない更新（ホバー等）では作り直さない
    lastKey = key;

    list.replaceChildren();
    renderTabs(fills, kind);
    if (!map || !kind) {
      title.textContent = "凡例";
      list.append(message(map ? "色分けのレイヤー（国家・文化・宗教・属州）をオンにすると、ここに一覧が表示されます" : "地図を開くと表示されます"));
      return;
    }
    const items = listEntities(map, kind);
    title.textContent = `凡例：${ENTITY_KINDS[kind].label}（${items.length}）`;
    if (items.length === 0) { list.append(message("該当するものがありません")); return; }

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = `${it.name}（${it.cells}セル）— クリックで移動して境界線を光らせる、右クリックで編集`;
      const chip = document.createElement("span"); chip.className = "chip"; chip.style.background = it.color;
      const name = document.createElement("span"); name.className = "legend-name"; name.textContent = it.name;
      const count = document.createElement("span"); count.className = "legend-count"; count.textContent = String(it.cells);
      btn.append(chip, name);
      if (isProvisional(map, kind, it.id)) { const tag = document.createElement("span"); tag.className = "legend-prov"; tag.textContent = "仮"; tag.title = "仮の名前（編集パネルで確定できます）"; btn.append(tag); }
      btn.append(count);
      btn.addEventListener("click", () => { actions.focusEntity(kind, it); highlight?.show(kind, it.id); });
      btn.addEventListener("contextmenu", (e) => { e.preventDefault(); panels?.openEntity(kind, it.id); });
      li.append(btn);
      frag.append(li);
    }
    list.append(frag);
  }

  /** 色分けが2つ以上オンのときだけ、種類を選ぶタブを出す */
  function renderTabs(fills, current) {
    tabs.replaceChildren();
    tabs.hidden = fills.length < 2;
    if (tabs.hidden) return;
    for (const k of fills) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.kind = k; b.textContent = FILL_LABEL[k];
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(k === current));
      b.classList.toggle("active", k === current);
      b.addEventListener("click", () => actions.setLegendKind(k));
      tabs.append(b);
    }
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
