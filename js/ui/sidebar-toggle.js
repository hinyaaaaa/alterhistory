// 狭い画面（スマートフォン等）向け：サイドバー（凡例・国家編集パネル）の開閉ボタン。
// デスクトップ幅では .sidebar-fab 自体を CSS で隠しているので、ここは常に配線してよい
// （見えない環境では押されようがない）。
//
// 既定は「閉じている」＝地図を最優先で見せる。地図を読み込んだ直後や、凡例をクリックして
// 国家詳細を開いたときは、ユーザーの意図（情報を見たい）に沿って自動で開く。
import { byId } from "./dom.js";

export function initSidebarToggle({ store }) {
  const btn = byId("btn-sidebar-toggle");
  const sidebar = byId("sidebar");

  const set = (open) => {
    sidebar.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  };

  btn.addEventListener("click", () => set(!sidebar.classList.contains("open")));

  // 新しい地図を開いたら一旦閉じておく（前の地図で開いていた状態を引き継がない）
  store.subscribe((_s, change) => { if (change.type === "replace") set(false); });

  // 国家詳細パネルが開いたときは、それを見せるために自動で開く
  window.addEventListener("request-edit-panel-open", () => set(true));
  const obs = new MutationObserver(() => { if (!byId("editor-panel").hidden) set(true); });
  obs.observe(byId("editor-panel"), { attributes: true, attributeFilter: ["hidden"] });

  return { open: () => set(true), close: () => set(false) };
}
