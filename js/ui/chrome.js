// 保存の「未保存」表示と、ページを離れるときの確認。
//   元に戻す／やり直すは画面から廃止した。内部の履歴（store）は残し、Ctrl+Z / Ctrl+Y だけ画面に出さず残す。
import { byId } from "./dom.js";

export function initChrome({ store }) {
  const save = byId("btn-save");
  function sync() {
    const dirty = !!store.getState().map && store.isDirty();
    save.classList.toggle("dirty", dirty);
    save.title = dirty ? "未保存の変更があります — ALTERHISTORY 形式で保存 (Ctrl+S)" : "ALTERHISTORY 形式で保存 (Ctrl+S)";
  }
  store.subscribe(sync); sync();
  window.addEventListener("beforeunload", (e) => {
    if (store.getState().map && store.isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });
}
