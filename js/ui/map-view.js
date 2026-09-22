// 地図キャンバスの操作：ホイールでズーム、ドラッグで移動、ホバーでセル情報。
// UI 層：DOM イベント → actions の呼び出しだけを行う。

import { cellIndexOf } from "../core/spatial.js";
import { describeCell } from "../core/query.js";
import { byId } from "./dom.js";

const DRAG_THRESHOLD = 3; // px。これ未満の動きはクリック扱い

export function initMapView({ store, viewport, actions }) {
  const canvas = byId("map-canvas");

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  let drag = null;

  canvas.addEventListener("wheel", (e) => {
    if (!store.getState().map) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // 行/ページ単位のホイールにも対応
    const [sx, sy] = localPos(e);
    actions.zoomAt(sx, sy, Math.exp(-e.deltaY * unit * 0.0016));
  }, { passive: false });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.focus();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag.moved) canvas.classList.add("dragging");
      drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      actions.pan(dx, dy);
      return;
    }
    updateHover(e);
  });

  const endDrag = (e) => {
    if (!drag) return;
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => { if (!drag) actions.setHover(null); });

  canvas.addEventListener("dblclick", (e) => {
    if (!store.getState().map) return;
    const [sx, sy] = localPos(e);
    actions.zoomAt(sx, sy, 2);
  });

  // ホバーはフレームごとに1回に間引く（イベントが大量に来ても重くならないように）
  let hoverEvent = null, hoverRaf = 0;
  function updateHover(e) {
    hoverEvent = e;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const map = store.getState().map;
      if (!map || !hoverEvent) return;
      const [sx, sy] = localPos(hoverEvent);
      const [wx, wy] = viewport.toWorld(sx, sy);
      const inside = wx >= 0 && wy >= 0 && wx <= viewport.mapWidth && wy <= viewport.mapHeight;
      if (!inside) { actions.setHover(null); return; }
      const cell = cellIndexOf(map).find(wx, wy);
      const prev = store.getState().hover;
      if (prev && prev.cell === cell) return; // 同じセルなら更新しない
      actions.setHover(describeCell(map, cell));
    });
  }
}
