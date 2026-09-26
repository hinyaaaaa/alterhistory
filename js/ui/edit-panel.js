// 地図編集パネル：右上の「地図編集」ボタンで開閉する、レイヤー/ツール類のスライドパネル。
// 中身（ツールボタン・レイヤー設定）は index.html に静的に存在し、edit-toolbar.js / toolbar.js が
// それぞれ配線する。ここは開閉状態の管理だけを担当する。
import { byId } from "./dom.js";

export function initEditPanel() {
  const panel = byId("edit-panel");
  const openBtn = byId("btn-edit-mode");

  function isOpen() { return !panel.hidden; }
  function open() { panel.hidden = false; openBtn.setAttribute("aria-expanded", "true"); }
  function close() { panel.hidden = true; openBtn.setAttribute("aria-expanded", "false"); }
  function toggle() { if (isOpen()) close(); else open(); }

  openBtn.addEventListener("click", toggle);
  byId("edit-panel-close").addEventListener("click", close);

  return { open, close, toggle, get isOpen() { return isOpen(); } };
}
