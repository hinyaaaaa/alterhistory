// ツールバー：コントロールの操作 → actions。状態（store）が変わったら表示を同期する。
import { byId } from "./dom.js";
import { getScale } from "../render/layers/annotations.js";
import { LAYERS, PRESETS, isLayerOn, presetMatches, legendKindOf } from "../app/layers.js";

const GROUP_TITLE = { base: "下地", fill: "色分け", line: "線", mark: "記号・文字" };

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

  // ---- レイヤー（Azgaar 方式）：独立したオン/オフのボタン。複数を同時に重ねられる ----
  const presetBox = byId("layer-presets");
  const toggleBox = byId("layer-toggles");
  const presetBtns = new Map();
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p.label; b.title = p.title; b.dataset.preset = p.id;
    b.addEventListener("click", () => actions.applyPreset(p.id));
    presetBox.append(b); presetBtns.set(p.id, b);
  }
  const layerBtns = new Map();
  let lastGroup = null;
  for (const l of LAYERS) {
    if (l.group !== lastGroup) {
      const t = document.createElement("span"); t.className = "lp-group"; t.textContent = GROUP_TITLE[l.group];
      toggleBox.append(t); lastGroup = l.group;
    }
    const b = document.createElement("button");
    b.type = "button"; b.className = "layer-btn"; b.dataset.layer = l.key; b.textContent = l.label;
    b.title = l.title ?? `${l.label}の表示を切り替える`;
    b.addEventListener("click", () => actions.toggle(l.key));
    toggleBox.append(b); layerBtns.set(l.key, b);
  }

  const selBurgLabels = byId("sel-burg-labels");
  selBurgLabels.addEventListener("change", () => actions.setView({ burgLabels: selBurgLabels.value }));

  // 区切りボタン（セレクトの代わりに見せる）
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

  // ショートカット等で状態が変わったときにも、コントロールの表示を合わせる
  const sync = (state) => {
    const v = state.view;
    if (v.burgLabels && selBurgLabels.value !== v.burgLabels) selBurgLabels.value = v.burgLabels;
    const hasMap = !!state.map;
    btnSave.disabled = !hasMap;
    menu.classList.toggle("disabled", !hasMap);
    if (!hasMap) menu.open = false;
    for (const [key, btn] of layerBtns) {
      const on = isLayerOn(v, key);
      btn.classList.toggle("active", on); btn.setAttribute("aria-pressed", String(on));
    }
    for (const seg of segs) {
      const cur = byId(seg.dataset.segFor).value;
      for (const b of seg.querySelectorAll("button[data-value]")) { const on = b.dataset.value === cur; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
    }
    for (const p of PRESETS) {
      const on = presetMatches(v, p), btn = presetBtns.get(p.id);
      btn.classList.toggle("active", on); btn.setAttribute("aria-pressed", String(on));
    }
    byId("layers-menu").classList.toggle("disabled", !hasMap);
    // 書き出しの付属物: 凡例は色分け「なし」だと出せず、スケールバーは縮尺の無い地図だと出せない（理由を表示）
    const eo = state.exportOpts ?? {};
    for (const box of annotBoxes) {
      const name = box.dataset.annot;
      let reason = "";
      if (name === "legend" && !legendKindOf(v)) reason = "色分けのレイヤーがすべてオフのため、凡例は出ません";
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
