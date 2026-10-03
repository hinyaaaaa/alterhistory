// 左のサイドバー（凡例・国家編集パネル）を、× で小さくし、元の場所（左上）の ☰ で開き直す。
//
// 凡例の見出しにある × を押すと、サイドバー全体が畳まれて、代わりに小さな ☰ ボタンが出る。
// 狭い画面（スマートフォン等）では、サイドバーは地図に重なる形で出し入れする。
// 既定は、広い画面では開いている／狭い画面では閉じている（地図を最優先で見せる）。
// 国家などを開いたときは、見たいものがそこにあるので自動で開く。
import { byId } from "./dom.js";

const isNarrow = () => typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;

export function initSidebarToggle({ store }) {
  const btn = byId("btn-sidebar-toggle");
  const main = document.querySelector("main");
  const sidebar = byId("sidebar");

  const set = (open) => {
    main.classList.toggle("side-collapsed", !open);
    btn.hidden = open;
    btn.setAttribute("aria-expanded", String(open));
    sidebar.inert = !open; // 畳んでいる間は、見えない中身にキー操作が届かないようにする
  };
  const isOpen = () => !main.classList.contains("side-collapsed");

  btn.addEventListener("click", () => set(true));
  byId("legend-close").addEventListener("click", () => set(false));

  // 狭い画面では、新しい地図を開いたら一旦閉じておく（前の地図で開いていた状態を引き継がない）
  store.subscribe((_s, change) => { if (change.type === "replace" && isNarrow()) set(false); });

  // 国家詳細パネルが開いたときは、それを見せるために自動で開く
  window.addEventListener("request-edit-panel-open", () => set(true));
  new MutationObserver(() => { if (!byId("editor-panel").hidden) set(true); })
    .observe(byId("editor-panel"), { attributes: true, attributeFilter: ["hidden"] });

  set(!isNarrow());
  return { open: () => set(true), close: () => set(false), isOpen };
}
