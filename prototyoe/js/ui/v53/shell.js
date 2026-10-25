// v5.3 UI: 画面の骨格。左レール | 中央の地図（上に時計・レイヤー・通知、下に履歴帯）| 右ドック。ウィンドウは重ねない（モック確定事項）。
//   ドックには、選択対象の詳細／領域の一覧／開始フロー のどれか 1 つだけが入る。
import { h } from "./dom.js";
import { createHubNav } from "./hub-nav.js";
import { createContextPanel } from "./context-panel.js";
import { createTimeline } from "./timeline.js";
import { createLayersBar } from "./layers-bar.js";
import { createStartFlow } from "./start-flow.js";
import { createNotificationView } from "./notification-view.js";

export function createShell({ adapter, ui, map, notifier, download }) {
  const rail = createHubNav({ ui, adapter });
  const panel = createContextPanel({ adapter, ui, download });
  const timeline = createTimeline({ adapter, ui });
  const layers = createLayersBar({ adapter });
  const notes = createNotificationView({ ui, notifier, adapter });
  const reopen = h("button", { type: "button", class: "v53-dock-open", "aria-label": "パネルを開く", title: "パネルを開く", text: "‹", onclick: () => ui.set({ panelOpen: true }) });
  const slot = h("div", { class: "v53-map-slot" }, map.el);
  const stage = h("main", { class: "v53-stage", "aria-label": "地図" }, slot, layers.el, timeline.clock, timeline.el, notes.toasts, reopen);
  const dock = h("div", { class: "v53-dock-host" });
  const el = h("div", { class: "v53 v53-root", dataset: { dock: "open", past: "false", reduce: "false" } }, rail.el, stage, dock, notes.major);

  let flow = null, mountedFlow = false;
  function syncDock() {
    const s = ui.get();
    el.dataset.dock = s.panelOpen || s.startFlow ? "open" : "closed";
    el.dataset.reduce = String(!!s.settings.reduceMotion);
    if (s.startFlow) {
      if (!flow) { flow = createStartFlow({ adapter, ui }); }
      if (!mountedFlow) { dock.replaceChildren(flow.el); mountedFlow = true; }
      flow.render();
    } else {
      if (flow) { flow.dispose(); flow = null; }
      if (mountedFlow || !dock.firstChild) { dock.replaceChildren(panel.el); mountedFlow = false; }
    }
  }
  function syncPast() { el.dataset.past = String(adapter.meta().past); }
  ui.subscribe(syncDock); adapter.subscribe(() => { syncPast(); if (flow && ui.get().startFlow) flow.render(); });
  syncDock(); syncPast();
  return {
    el, rail, panel, timeline, layers, notes,
    dispose() { flow?.dispose(); panel.dispose(); timeline.dispose(); layers.dispose(); notes.dispose(); },
  };
}
