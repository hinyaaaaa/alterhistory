// 上部バーの Undo/Redo・未保存表示と、メニュー（書き出し・レイヤー）の開閉。
//
// 上部バーと下の状態バーは常に表示する（隠せない）。パネルの出し入れは、各パネルの × と、
// 元の場所に出る小さな展開ボタンで行う（sidebar-toggle.js / panel-dock.js）。
import { byId } from "./dom.js";

export function initChrome({ store }) {
  // どのメニューも、外を押したとき・別のメニューを開いたとき・Esc で閉じる
  const menus = [...document.querySelectorAll("details.menu")];
  document.addEventListener("pointerdown", (e) => { for (const m of menus) if (m.open && !m.contains(e.target)) m.open = false; });
  for (const m of menus) m.addEventListener("toggle", () => { if (m.open) for (const o of menus) if (o !== m) o.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") for (const m of menus) m.open = false; });

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
}
