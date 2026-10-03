// ツールバー：コントロールの操作 → actions。状態（store）が変わったら表示を同期する。
import { byId } from "./dom.js";
import { getScale } from "../render/layers/annotations.js";

const TOGGLE_IDS = { coast: "chk-coast", rivers: "chk-rivers", routes: "chk-routes", burgs: "chk-burgs", labels: "chk-labels", zones: "chk-zones", journeys: "chk-journeys" };
// 値がまだ決まっていない（= 既定でオン）項目
const DEFAULT_ON = new Set(["zones", "journeys"]);
const PRESETS = {
  politics: { overlay: "state", base: "biome", coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "auto" },
  terrain: { overlay: "none", base: "biome", coast: true, rivers: true, routes: false, burgs: true, labels: true, burgLabels: "capitals" },
  height: { overlay: "none", base: "height", coast: true, rivers: true, routes: false, burgs: false, labels: false },
};

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

  // 区切りボタン（セレクトの代わりに見せる）と、まとめて切り替えるボタン
  const segs = [...document.querySelectorAll("[data-seg-for]")];
  for (const seg of segs) {
    seg.addEventListener("click", (e) => {
      const b = e.target instanceof HTMLElement ? e.target.closest("button[data-value]") : null;
      if (!b) return;
      const sel = byId(seg.dataset.segFor);
      sel.value = b.dataset.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const b of document.querySelectorAll("[data-preset]")) b.addEventListener("click", () => actions.setView({ ...PRESETS[b.dataset.preset] }));

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
      const want = v[name] ?? DEFAULT_ON.has(name);
      if (el.checked !== want) el.checked = want;
    }
    for (const seg of segs) {
      const cur = byId(seg.dataset.segFor).value;
      for (const b of seg.querySelectorAll("button[data-value]")) { const on = b.dataset.value === cur; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
    }
    for (const b of document.querySelectorAll("[data-preset]")) {
      const p = PRESETS[b.dataset.preset];
      const on = Object.entries(p).every(([k, val]) => (v[k] ?? DEFAULT_ON.has(k)) === val);
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
    }
    byId("layers-menu").classList.toggle("disabled", !hasMap);
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
