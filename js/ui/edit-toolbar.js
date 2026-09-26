// 編集ツールバー：ツールボタン・対象セレクト・ブラシ半径のUIと、editMode への橋渡し。
import { TOOLS } from "./edit-mode.js";
import { PAINT_KINDS } from "../core/edit/paint.js";
import { byId } from "./dom.js";

const TARGET_LIST = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;

export function initEditToolbar({ store, editMode }) {
  const buttons = [...document.querySelectorAll("#edit-toolbar [data-tool]")];
  const targetGroup = byId("tool-target-group");
  const targetSel = byId("tool-target");
  const radiusGroup = byId("tool-radius-group");
  const radiusInput = byId("tool-radius");
  const hint = byId("tool-hint");

  const HINTS = {
    [TOOLS.SELECT]: "クリックして中身を見る・編集する",
    [TOOLS.PAINT_STATE]: "ドラッグして国家を塗る（下の「対象」で塗る国家を選ぶ）",
    [TOOLS.PAINT_CULTURE]: "ドラッグして文化を塗る",
    [TOOLS.PAINT_RELIGION]: "ドラッグして宗教を塗る",
    [TOOLS.PAINT_PROVINCE]: "ドラッグして属州を塗る",
    [TOOLS.PAINT_BIOME]: "ドラッグして地形を塗る（水域は塗れません）",
    [TOOLS.ADD_BURG]: "地図をクリックして都市を置く",
    [TOOLS.ADD_MARKER]: "地図をクリックしてマーカーを置く",
  };

  function fillTargets(tool) {
    const map = store.getState().map;
    targetSel.replaceChildren();
    const kind = tool.startsWith("paint:") ? tool.slice(6) : null;
    if (!map || !kind) { targetGroup.hidden = true; return; }
    targetGroup.hidden = false;

    if (kind === "biome") {
      for (const b of map.biomesData) { if (!b || b.i === 0) continue; const o = document.createElement("option"); o.value = b.i; o.textContent = b.name; targetSel.append(o); }
      return;
    }
    const erase = document.createElement("option"); erase.value = "0"; erase.textContent = `（${PAINT_KINDS[kind].label}なしにする）`;
    targetSel.append(erase);
    const list = map.pack[TARGET_LIST[kind]].filter(isLive);
    for (const e of list) { const o = document.createElement("option"); o.value = e.i; o.textContent = e.fullName ?? e.name; targetSel.append(o); }
    if (list[0]) targetSel.value = String(list[0].i);
  }

  function sync() {
    const tool = editMode.tool;
    const hasMap = !!store.getState().map;
    for (const b of buttons) {
      b.classList.toggle("active", b.dataset.tool === tool);
      b.disabled = !hasMap;
    }
    hint.textContent = hasMap ? (HINTS[tool] ?? "") : "地図を開いてください";
    radiusGroup.hidden = !(tool.startsWith("paint:"));
  }

  for (const b of buttons) {
    b.addEventListener("click", () => {
      const map = store.getState().map;
      if (!map) return;
      editMode.setTool(b.dataset.tool);
      fillTargets(b.dataset.tool);
      sync();
    });
  }
  targetSel.addEventListener("change", () => editMode.setTarget(Number(targetSel.value)));
  radiusInput.addEventListener("input", () => editMode.setRadius(Number(radiusInput.value)));

  store.subscribe((state, change) => {
    if (change.type === "replace") { fillTargets(editMode.tool); sync(); }
  });
  sync();
  return { fillTargets, sync };
}
