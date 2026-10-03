// 地図の上に重ねる、動かせるウィンドウ（Azgaar の「Overview」画面に相当）。
// 戦争・外交・軍事など、国をまたぐ設定を、横タブに詰め込まずに広く使えるようにする。
//   - 上部バーの「設定」メニューから開く。タイトルバーのドラッグで動かせる。× で閉じる
//   - 同じウィンドウを2度開かない。開き直すと最前面に出す。中身は閉じても保持する
import { byId } from "./dom.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function initWindows() {
  const stage = byId("stage");
  const wins = new Map(); // id → { root, def }
  let z = 20;

  function front(w) { w.root.style.zIndex = String(++z); }

  function build(id, def) {
    const root = el("section", "float-win");
    root.dataset.win = id; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", def.title);
    const bar = el("header", "float-win-bar");
    const title = el("h3", "", def.title);
    const close = el("button", "panel-close", "×");
    close.type = "button"; close.setAttribute("aria-label", `${def.title}を閉じる`);
    bar.append(title, close);
    const body = el("div", "float-win-body");
    body.append(def.body);
    root.append(bar, body);
    stage.append(root);
    const w = { root, def };
    close.addEventListener("click", () => closeWin(id));
    root.addEventListener("pointerdown", () => front(w));
    // タイトルバーのドラッグで動かす（地図の外へ出てしまわないよう、地図の範囲に収める）
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === close) return;
      const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      bar.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx - sr.left), Math.max(0, sr.width - 80));
        const y = Math.min(Math.max(0, ev.clientY - dy - sr.top), Math.max(0, sr.height - 40));
        root.style.left = `${x}px`; root.style.top = `${y}px`;
      };
      const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); };
      bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up);
    });
    return w;
  }

  /** def: { title, body: HTMLElement, onOpen?: () => void, width?: number } */
  function register(id, def) { wins.set(id, build(id, def)); wins.get(id).root.style.width = `min(${def.width ?? 760}px, calc(100% - 24px))`; }

  function open(id) {
    const w = wins.get(id); if (!w) return;
    if (w.root.hidden) {
      w.root.hidden = false;
      if (!w.root.style.left) { const n = [...wins.keys()].indexOf(id); w.root.style.left = `${24 + n * 22}px`; w.root.style.top = `${16 + n * 22}px`; }
    }
    w.def.onOpen?.();
    front(w);
  }
  function closeWin(id) { const w = wins.get(id); if (w) w.root.hidden = true; }
  const isOpen = (id) => !!wins.get(id) && !wins.get(id).root.hidden;

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const top = [...wins.values()].filter((w) => !w.root.hidden).sort((a, b) => Number(b.root.style.zIndex) - Number(a.root.style.zIndex))[0];
    if (top && !(document.activeElement instanceof HTMLInputElement) && !document.querySelector("details.menu[open]")) top.root.hidden = true;
  });

  return { register, open, close: closeWin, isOpen };
}
