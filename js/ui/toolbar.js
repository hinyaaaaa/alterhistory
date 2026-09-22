// ツールバー：コントロールの操作 → actions。状態（store）が変わったら表示を同期する。
import { byId } from "./dom.js";

const TOGGLE_IDS = { coast: "chk-coast", rivers: "chk-rivers", routes: "chk-routes", burgs: "chk-burgs", labels: "chk-labels" };

export function initToolbar({ store, actions, openFileDialog, openHelp }) {
  byId("btn-open").addEventListener("click", openFileDialog);
  byId("btn-open-empty").addEventListener("click", openFileDialog);
  byId("btn-fit").addEventListener("click", () => actions.fit());
  byId("btn-help").addEventListener("click", openHelp);

  const btnSave = byId("btn-save");
  const menu = byId("export-menu");
  btnSave.addEventListener("click", () => actions.saveNative());
  const exporters = { png: () => actions.exportPng(), svg: () => actions.exportSvg(), azgaar: () => actions.saveAzgaar() };
  menu.addEventListener("click", (e) => {
    const item = e.target instanceof HTMLElement ? e.target.closest("[data-export]") : null;
    if (!item) return;
    menu.open = false;              // 選んだらメニューを閉じる
    exporters[item.dataset.export]?.();
  });
  // メニューの外を押したとき / Esc で閉じる
  document.addEventListener("pointerdown", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });

  const selOverlay = byId("sel-overlay");
  const selBase = byId("sel-base");
  selOverlay.addEventListener("change", () => actions.setOverlay(selOverlay.value));
  selBase.addEventListener("change", () => actions.setView({ base: selBase.value }));
  for (const [name, id] of Object.entries(TOGGLE_IDS)) {
    byId(id).addEventListener("change", (e) => actions.setView({ [name]: e.target.checked }));
  }

  // ショートカット等で状態が変わったときにも、コントロールの表示を合わせる
  const sync = (state) => {
    const v = state.view;
    if (selOverlay.value !== v.overlay) selOverlay.value = v.overlay;
    if (selBase.value !== v.base) selBase.value = v.base;
    const hasMap = !!state.map;
    btnSave.disabled = !hasMap;
    menu.classList.toggle("disabled", !hasMap);
    if (!hasMap) menu.open = false;
    for (const [name, id] of Object.entries(TOGGLE_IDS)) {
      const el = byId(id);
      if (el.checked !== v[name]) el.checked = v[name];
    }
  };
  store.subscribe(sync);
  sync(store.getState());
}
