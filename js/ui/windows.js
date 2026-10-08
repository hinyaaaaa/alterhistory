import { byId } from "./dom.js";

const el = (tag, cls, text2) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text2 != null) e.textContent = text2;
  return e;
};
export function makeDraggable(root, handle, stage, only = null) {
  handle.style.cursor = "move";
  handle.style.touchAction = "none";
  handle.addEventListener("pointerdown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("button, input, select, textarea")) return;
    if (only && !(e.target instanceof HTMLElement && e.target.closest(only))) return;
    const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    root.style.right = "auto";
    root.style.bottom = "auto";
    handle.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      root.style.left = `${Math.min(Math.max(0, ev.clientX - dx - sr.left), Math.max(0, sr.width - 80))}px`;
      root.style.top = `${Math.min(Math.max(0, ev.clientY - dy - sr.top), Math.max(0, sr.height - 40))}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

/**
 * ウィンドウの大きさを変えられるようにする。四辺と四隅につまみを付け、ドラッグで広げ縮めできる。
 * 大きさは地図の表示領域(stage)の中に収める。min は小さくしすぎて操作できなくなるのを防ぐ。
 */
export function makeResizable(root, stage, { minW = 280, minH = 160 } = {}) {
  if (root.dataset.resizable) return;
  root.dataset.resizable = "1";
  for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const h = document.createElement("div");
    h.className = `rs-handle rs-${dir}`;
    h.dataset.dir = dir;
    h.setAttribute("aria-hidden", "true");
    h.style.touchAction = "none";
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height };
      // 位置は左上基準に固定し、大きさは px で持つ（right/bottom/maxHeight による自動調整をやめる）
      root.style.right = "auto"; root.style.bottom = "auto";
      root.style.maxHeight = "none"; root.style.maxWidth = "none";
      root.style.left = `${start.l}px`; root.style.top = `${start.t}px`;
      root.style.width = `${start.w}px`; root.style.height = `${start.h}px`;
      root.classList.add("resized");
      h.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        let l = start.l, t = start.t, w = start.w, hh = start.h;
        if (dir.includes("e")) w = start.w + dx;
        if (dir.includes("s")) hh = start.h + dy;
        if (dir.includes("w")) { w = start.w - dx; l = start.l + dx; }
        if (dir.includes("n")) { hh = start.h - dy; t = start.t + dy; }
        if (w < minW) { if (dir.includes("w")) l -= minW - w; w = minW; }
        if (hh < minH) { if (dir.includes("n")) t -= minH - hh; hh = minH; }
        // stage の外にはみ出さない
        if (l < 0) { if (dir.includes("w")) w += l; l = 0; }
        if (t < 0) { if (dir.includes("n")) hh += t; t = 0; }
        if (l + w > sr.width) w = Math.max(minW, sr.width - l);
        if (t + hh > sr.height) hh = Math.max(minH, sr.height - t);
        root.style.left = `${l}px`; root.style.top = `${t}px`;
        root.style.width = `${w}px`; root.style.height = `${hh}px`;
      };
      const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
      h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
    root.append(h);
  }
}
export function initWindows() {
  const stage = byId("stage");
  const wins = /* @__PURE__ */ new Map();
  let z = 20;
  function front(w) {
    w.root.style.zIndex = String(++z);
  }
  function build(id, def) {
    const root = el("section", "float-win");
    root.dataset.win = id;
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", def.title);
    const bar = el("header", "float-win-bar");
    const title = el("h3", "", def.title);
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", `${def.title}を閉じる`);
    bar.append(title, close);
    const body = el("div", "float-win-body");
    body.append(def.body);
    root.append(bar, body);
    stage.append(root);
    makeResizable(root, stage);
    const w = { root, def };
    close.addEventListener("click", () => closeWin(id));
    root.addEventListener("pointerdown", () => front(w));
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === close) return;
      const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      bar.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx - sr.left), Math.max(0, sr.width - 80));
        const y = Math.min(Math.max(0, ev.clientY - dy - sr.top), Math.max(0, sr.height - 40));
        root.style.left = `${x}px`;
        root.style.top = `${y}px`;
        fit(root);
      };
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
    return w;
  }
  function fit(root) {
    const parent = root.offsetParent ?? root.parentElement;
    if (!parent) return;
    if (root.classList.contains("resized")) return; // ユーザーが大きさを決めたウィンドウは、自動では縮めない
    const top = parseFloat(root.style.top) || 0;
    root.style.maxHeight = `${Math.max(240, parent.clientHeight - top - 12)}px`;
  }
  window.addEventListener("resize", () => {
    for (const w of wins.values()) if (!w.root.hidden) fit(w.root);
  });
  function register(id, def) {
    wins.set(id, build(id, def));
    wins.get(id).root.style.width = `min(${def.width ?? 760}px, calc(100% - 24px))`;
  }
  function open(id) {
    const w = wins.get(id);
    if (!w) return;
    if (w.root.hidden) {
      w.root.hidden = false;
      if (!w.root.style.left) {
        const n = [...wins.values()].filter((x) => x !== w && !x.root.hidden).length % 5;
        w.root.style.left = `${24 + n * 28}px`;
        w.root.style.top = `${16 + n * 28}px`;
      }
      fit(w.root);
    }
    w.def.onOpen?.();
    front(w);
  }
  function closeWin(id) {
    const w = wins.get(id);
    if (w) {
      w.root.hidden = true;
      w.def.onClose?.();
    }
  }
  const isOpen = (id) => !!wins.get(id) && !wins.get(id).root.hidden;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (e.defaultPrevented || document.querySelector("dialog[open]")) return; // 確認ダイアログのEscは、そのダイアログだけを閉じる（背後の窓は閉じない）
    const top = [...wins.values()].filter((w) => !w.root.hidden).sort((a, b) => Number(b.root.style.zIndex) - Number(a.root.style.zIndex))[0];
    if (top && !(document.activeElement instanceof HTMLInputElement) && !document.querySelector("details.menu[open]")) closeWin([...wins.entries()].find(([, w]) => w === top)[0]);
  });
  return { register, open, close: closeWin, isOpen };
}
