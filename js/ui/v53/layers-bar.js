// v5.3 UI: 地図左上のレイヤー列。レイヤー切替の入口はここ 1 か所（旧ハブの「レイヤー」の移管先）。
import { h } from "./dom.js";

export function createLayersBar({ adapter }) {
  const el = h("div", { class: "v53-layers", role: "group", "aria-label": "地図のレイヤー" });
  let key = "";
  function sync() {
    const ls = adapter.layers(), k = ls.map((l) => `${l.key}:${l.on}`).join("|");
    if (k === key) return; key = k;
    el.replaceChildren(...ls.map((l) => h("button", { type: "button", class: `v53-chipbtn${l.on ? " on" : ""}`, "aria-pressed": String(l.on), dataset: { layer: l.key }, text: l.label, onclick: () => adapter.toggleLayer(l.key) })));
  }
  const u = adapter.subscribe(sync); sync();
  return { el, sync, dispose: u };
}
