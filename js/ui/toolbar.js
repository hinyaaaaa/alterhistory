// ツールバー：コントロールの操作 → actions。状態（store）が変わったら表示を同期する。
import { byId } from "./dom.js";
import { getScale } from "../render/layers/annotations.js";
import { LAYERS, isLayerOn, legendKindOf } from "../app/layers.js";

const GROUP_TITLE = { base: "下地", fill: "色分け", line: "線", mark: "記号・文字" };

export function initToolbar({ store, actions, openFileDialog, wins }) {
  byId("btn-open").addEventListener("click", openFileDialog);
  byId("btn-open-empty").addEventListener("click", openFileDialog);
  byId("btn-fit").addEventListener("click", () => actions.fit());

  const btnSave = byId("btn-save");
  btnSave.addEventListener("click", () => actions.saveNative());

  // ---- 書き出し: ハブの「書き出し」から開くウィンドウ ----
  const exportBody = document.createElement("div"); exportBody.className = "export-body";
  const exporters = { chronicle: () => actions.exportChronicle(), png: () => actions.exportPng(), svg: () => actions.exportSvg() };
  const EXPORTS = [
    ["chronicle", "クロニクル（.md）", "年表（すべての操作を年月順に）・国家・宗教・戦争などを丁寧に書いた .md 1ファイル。Claude 等の AI に渡して歴史を読ませられます"],
    ["png", "PNG 画像（2倍の解像度）", "地図を画像として書き出す"],
    ["svg", "SVG 画像（拡大しても劣化しない）", "拡大しても劣化しない画像"],
  ];
  for (const [key, label, tip] of EXPORTS) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.export = key; b.textContent = label; b.title = tip; exportBody.append(b);
  }
  const opts = document.createElement("div"); opts.className = "menu-opts"; opts.setAttribute("role", "group"); opts.setAttribute("aria-label", "画像に入れるもの");
  opts.innerHTML = `<span class="menu-opts-title">PNG・SVG に入れるもの</span>
    <label><input type="checkbox" data-annot="title" checked> 題名・年月</label>
    <label><input type="checkbox" data-annot="legend" checked> 凡例</label>
    <label><input type="checkbox" data-annot="scaleBar" checked> スケールバー</label>`;
  exportBody.append(opts);
  wins.register("export", { title: "書き出し", width: 420, body: exportBody });
  exportBody.addEventListener("click", (e) => {
    const item = e.target instanceof Element ? e.target.closest("[data-export]") : null;
    if (!item) return;
    wins.close("export");
    exporters[item.dataset.export]?.();
  });
  // 書き出し画像に入れるもの（題名・凡例・スケールバー）
  const annotBoxes = [...exportBody.querySelectorAll("[data-annot]")];
  for (const box of annotBoxes) box.addEventListener("change", () => actions.setExportOption(box.dataset.annot, box.checked));
  const exportHubBtn = document.querySelector('[data-open-win="export"]');
  const layersHubBtn = document.getElementById("hub-layers");

  // ---- レイヤー（Azgaar 方式）：独立したオン/オフのボタン。複数を同時に重ねられる ----
  const toggleBox = byId("layer-toggles");
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
      const b = e.target instanceof Element ? e.target.closest("button[data-value]") : null;
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
    if (exportHubBtn) exportHubBtn.disabled = !hasMap;
    if (layersHubBtn) layersHubBtn.disabled = !hasMap;
    if (!hasMap && wins.isOpen("export")) wins.close("export");
    for (const [key, btn] of layerBtns) {
      const on = isLayerOn(v, key);
      btn.classList.toggle("active", on); btn.setAttribute("aria-pressed", String(on));
    }
    for (const seg of segs) {
      const cur = byId(seg.dataset.segFor).value;
      for (const b of seg.querySelectorAll("button[data-value]")) { const on = b.dataset.value === cur; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
    }
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
