// ツールバー：コントロールの操作 → actions。状態（store）が変わったら表示を同期する。
import { byId } from "./dom.js";
import { getScale } from "../render/layers/annotations.js";

const TOGGLE_IDS = { coast: "chk-coast", rivers: "chk-rivers", routes: "chk-routes", burgs: "chk-burgs", labels: "chk-labels" };

export function initToolbar({ store, actions, openFileDialog, openHelp }) {
  byId("btn-open").addEventListener("click", openFileDialog);
  byId("btn-open-empty").addEventListener("click", openFileDialog);
  byId("btn-fit").addEventListener("click", () => actions.fit());
  byId("btn-help").addEventListener("click", openHelp);

  const btnSave = byId("btn-save");
  const menu = byId("export-menu");
  btnSave.addEventListener("click", () => actions.saveNative());
  const exporters = { chronicle: () => actions.exportChronicle(), png: () => actions.exportPng(), svg: () => actions.exportSvg(), azgaar: () => actions.saveAzgaar() };
  menu.addEventListener("click", (e) => {
    const item = e.target instanceof HTMLElement ? e.target.closest("[data-export]") : null;
    if (!item) return;
    menu.open = false;              // 選んだらメニューを閉じる
    exporters[item.dataset.export]?.();
  });
  // メニューの外を押したとき / Esc で閉じる（書き出しメニュー）
  document.addEventListener("pointerdown", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
  });

  // 書き出し画像に入れるもの（題名・凡例・スケールバー）。メニューを開いたまま切り替えられる
  const annotBoxes = [...menu.querySelectorAll("[data-annot]")];
  for (const box of annotBoxes) box.addEventListener("change", () => actions.setExportOption(box.dataset.annot, box.checked));

  const selOverlay = byId("sel-overlay");
  const selBase = byId("sel-base");
  const selBurgLabels = byId("sel-burg-labels");
  selOverlay.addEventListener("change", () => actions.setOverlay(selOverlay.value));
  selBase.addEventListener("change", () => actions.setView({ base: selBase.value }));
  selBurgLabels.addEventListener("change", () => actions.setView({ burgLabels: selBurgLabels.value }));
  for (const [name, id] of Object.entries(TOGGLE_IDS)) {
    byId(id).addEventListener("change", (e) => actions.setView({ [name]: e.target.checked }));
  }

  // ショートカット等で状態が変わったときにも、コントロールの表示を合わせる
  const sync = (state) => {
    const v = state.view;
    if (selOverlay.value !== v.overlay) selOverlay.value = v.overlay;
    if (selBase.value !== v.base) selBase.value = v.base;
    if (v.burgLabels && selBurgLabels.value !== v.burgLabels) selBurgLabels.value = v.burgLabels;
    const hasMap = !!state.map;
    btnSave.disabled = !hasMap;
    menu.classList.toggle("disabled", !hasMap);
    if (!hasMap) menu.open = false;
    for (const [name, id] of Object.entries(TOGGLE_IDS)) {
      const el = byId(id);
      if (el.checked !== v[name]) el.checked = v[name];
    }
    // 書き出しの付属物: 凡例は色分け「なし」だと出せず、スケールバーは縮尺の無い地図だと出せない（理由を表示）
    const eo = state.exportOpts ?? {};
    for (const box of annotBoxes) {
      const name = box.dataset.annot;
      let reason = "";
      if (name === "legend" && v.overlay === "none") reason = "色分けが「なし」のため、凡例は出ません";
      if (name === "scaleBar" && hasMap && !getScale(state.map)) reason = "この地図には縮尺の情報がないため、スケールバーは出ません";
      box.disabled = !!reason;
      box.title = reason;
      box.parentElement.classList.toggle("is-disabled", !!reason);
      if (box.checked !== (eo[name] !== false)) box.checked = eo[name] !== false;
    }
  };
  store.subscribe(sync);
  sync(store.getState());
}
