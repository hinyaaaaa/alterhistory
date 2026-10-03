// 画面の枠（上部バー・左パネル・右パネル・状態バー）の表示切替と、Undo/Redo・未保存表示。
// 地図をできるだけ広く見せるため、どの枠も個別に、または H キーで一括して隠せる。
// 隠している間も、右下の小さな ⛶ ボタンと H キーでいつでも戻せる。
import { byId } from "./dom.js";
import { katakanaOnLoad, setKatakanaOnLoad } from "../app/actions.js";

const REGIONS = ["top", "left", "right", "bottom"];

export function initChrome({ store, viewport, renderer, actions }) {
  const app = byId("app");
  const boxes = Object.fromEntries([...document.querySelectorAll("[data-chrome]")].map((b) => [b.dataset.chrome, b]));
  const restore = byId("btn-chrome-restore");
  const allBtn = byId("btn-chrome-all");
  const menu = byId("view-menu");
  const hidden = new Set();

  const isFit = () => Math.abs(viewport.k - viewport.fitK) < 1e-6;
  function refit(wasFit) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      renderer.resize();
      if (wasFit) viewport.fit();
      renderer.requestRender();
    }));
  }

  function apply() {
    for (const r of REGIONS) {
      app.classList.toggle(`hide-${r}`, hidden.has(r));
      if (boxes[r]) boxes[r].checked = !hidden.has(r);
    }
    restore.hidden = hidden.size === 0;

  }
  function setHidden(region, value) {
    const wasFit = isFit();
    if (value) hidden.add(region); else hidden.delete(region);
    if (region === "right" && value) {
      // 右パネルは開いたまま隠すと状態が分からなくなるので、閉じてから隠す
      for (const id of ["edit-panel-close", "builder-close"]) { const b = byId(id); if (!b.closest("[hidden]")) b.click(); }
    }
    apply(); refit(wasFit);
  }
  function setAll(value) {
    const wasFit = isFit();
    if (value) for (const r of REGIONS) setHidden(r, true); else { hidden.clear(); apply(); }
    refit(wasFit);
  }
  const toggleAll = () => setAll(hidden.size < REGIONS.length);

  for (const r of REGIONS) boxes[r]?.addEventListener("change", () => setHidden(r, !boxes[r].checked));
  allBtn.addEventListener("click", () => { menu.open = false; setAll(true); });
  restore.addEventListener("click", () => setAll(false)); // 何か隠れているときだけ見えるボタン。押すと全部戻す

  // どのメニューも、外を押したとき・別のメニューを開いたとき・Esc で閉じる
  const menus = [...document.querySelectorAll("details.menu")];
  document.addEventListener("pointerdown", (e) => { for (const m of menus) if (m.open && !m.contains(e.target)) m.open = false; });
  for (const m of menus) m.addEventListener("toggle", () => { if (m.open) for (const o of menus) if (o !== m) o.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") for (const m of menus) m.open = false; });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "h") return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest("select, input, textarea") || t.isContentEditable || t.closest("dialog[open]"))) return;
    e.preventDefault(); toggleAll();
  });
  // 国家などを開いたら左パネルを見せる（隠れたままだと「開かない」ように見えるため）
  new MutationObserver(() => { if (!byId("editor-panel").hidden && hidden.has("left")) setHidden("left", false); })
    .observe(byId("editor-panel"), { attributes: true, attributeFilter: ["hidden"] });

  // ---- Undo / Redo / 未保存 ----
  const undo = byId("btn-undo"), redo = byId("btn-redo"), save = byId("btn-save");
  undo.addEventListener("click", () => store.undo());
  redo.addEventListener("click", () => store.redo());
  function sync() {
    const u = store.peekUndoLabel(), r = store.peekRedoLabel();
    undo.disabled = !store.canUndo(); redo.disabled = !store.canRedo();
    undo.title = u ? `元に戻す：${u} (Ctrl+Z)` : "元に戻す (Ctrl+Z)";
    redo.title = r ? `やり直す：${r} (Ctrl+Y)` : "やり直す (Ctrl+Y)";
    const dirty = !!store.getState().map && store.isDirty();
    save.textContent = dirty ? "保存 ●" : "保存";
    save.title = dirty ? "未保存の変更があります — ALTERHISTORY 形式で保存 (Ctrl+S)" : "ALTERHISTORY 形式で保存 (Ctrl+S)";
  }
  store.subscribe(sync); sync();
  window.addEventListener("beforeunload", (e) => {
    if (store.getState().map && store.isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });
  // ---- 地図を開く前の案内 ／ 英語名の都市のカタカナ化 ----
  const kana = byId("opt-katakana");
  kana.checked = katakanaOnLoad();
  kana.addEventListener("change", () => setKatakanaOnLoad(kana.checked));
  byId("btn-katakana").addEventListener("click", () => {
    menu.open = false;
    const n = actions.katakanaBurgs();
    store.update((st) => { st.notice = n ? `英語名の都市 ${n} 件をカタカナにしました（「元に戻す」で戻せます）` : "カタカナにする対象の都市はありません"; });
  });
  const syncEmpty = () => { byId("btn-katakana").disabled = !store.getState().map; };
  store.subscribe(syncEmpty); syncEmpty();
  apply();
  return { setHidden, setAll, toggleAll, hidden: () => [...hidden] };
}
