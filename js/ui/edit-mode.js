// 編集モード：地図上でのツール操作（塗り・都市/マーカーの配置・選択）。
// map-view.js のポインタイベントに割り込み、編集ツールが選ばれている間だけ動作する。

import { pickAt } from "./tools/selection.js";
import { createBrushController } from "./tools/brush.js";
import { PAINT_KINDS } from "../core/edit/paint.js";
import { byId } from "./dom.js";

export const TOOLS = Object.freeze({
  SELECT: "select",
  PAINT_STATE: "paint:state", PAINT_CULTURE: "paint:culture",
  PAINT_RELIGION: "paint:religion", PAINT_PROVINCE: "paint:province",
  PAINT_BIOME: "paint:biome",
  ADD_BURG: "add:burg", ADD_MARKER: "add:marker",
});

const PAINT_TOOL_KIND = {
  [TOOLS.PAINT_STATE]: "state", [TOOLS.PAINT_CULTURE]: "culture",
  [TOOLS.PAINT_RELIGION]: "religion", [TOOLS.PAINT_PROVINCE]: "province",
};

export function initEditMode({ store, viewport, editActions, panels }) {
  const canvas = byId("map-canvas");
  let tool = TOOLS.SELECT;
  let target = 0;          // 塗る先の実体ID（0=消す）。パネルで選ぶ
  let radius = 40;         // ブラシ半径（ワールド座標）
  let markerType = { type: "marker", icon: "📍" };

  const localPos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toWorld = (e) => { const [sx, sy] = localPos(e); return viewport.toWorld(sx, sy); };
  const inMap = (map, wx, wy) => wx >= 0 && wy >= 0 && wx <= map.meta.width && wy <= map.meta.height;

  const brush = createBrushController({
    getRadius: () => radius,
    onStroke(cell, r, painted) {
      const map = store.getState().map;
      const [wx, wy] = [map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1]];
      const cells = editActions.cellsWithin(wx, wy, r).filter((c) => !painted.has(c));
      if (!cells.length) return;
      cells.forEach((c) => painted.add(c));
      if (tool === TOOLS.PAINT_BIOME) editActions.paintBiome(target, cells);
      else editActions.paintCells(PAINT_TOOL_KIND[tool], target, cells);
    },
  });

  function setTool(next) {
    tool = next;
    store.update((s) => { s.editTool = tool; });
    canvas.classList.toggle("tool-paint", tool.startsWith("paint:"));
    canvas.classList.toggle("tool-place", tool.startsWith("add:"));
  }
  function setTarget(id) { target = id; }
  function setRadius(r) { radius = Math.max(6, Math.min(300, r)); store.update((s) => { s.brushRadius = radius; }); }
  function setMarkerType(t) { markerType = t; }

  canvas.addEventListener("pointerdown", (e) => {
    const map = store.getState().map;
    if (!map || e.button !== 0 || tool === TOOLS.SELECT) return;
    const [wx, wy] = toWorld(e);
    if (!inMap(map, wx, wy)) return;
    const cell = editActions.findCell(wx, wy);
    if (cell < 0) return;

    if (tool === TOOLS.ADD_BURG) {
      panels.promptBurgName((name) => { if (name) { const id = editActions.addBurg(cell, name); if (id != null) panels.openBurg(id); } });
      return;
    }
    if (tool === TOOLS.ADD_MARKER) {
      const id = editActions.addMarker(cell, markerType);
      if (id != null) panels.openMarker(id);
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    store.beginBatch(`${PAINT_KINDS[PAINT_TOOL_KIND[tool]]?.label ?? "地形"}を塗る`);
    brush.begin(cell, radius);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!brush.isPainting) return;
    const map = store.getState().map;
    const [wx, wy] = toWorld(e);
    if (!inMap(map, wx, wy)) return;
    const cell = editActions.findCell(wx, wy);
    if (cell >= 0) brush.continue(cell, radius);
  });

  const endStroke = () => { if (brush.isPainting) { brush.end(); store.endBatch(); } };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  // 選択ツール: クリックで対象を選び、パネルを開く
  canvas.addEventListener("click", (e) => {
    const map = store.getState().map;
    if (!map || tool !== TOOLS.SELECT) return;
    const [wx, wy] = toWorld(e);
    if (!inMap(map, wx, wy)) return;
    const cell = editActions.findCell(wx, wy);
    const picked = pickAt(map, cell, wx, wy, 6 / viewport.k);
    if (!picked) return;
    if (picked.type === "burg") panels.openBurg(picked.id);
    else if (picked.type === "marker") panels.openMarker(picked.id);
    else panels.openCell(picked.id);
  });


  return { setTool, setTarget, setRadius, setMarkerType, get tool() { return tool; }, get target() { return target; } };
}
