// キーボードショートカット。ヘルプ（index.html の #help-dialog）の内容と一致させること。
import { byId } from "./dom.js";
import { TOOLS } from "./edit-mode.js";

const PAN_STEP = 80;
const OVERLAY_KEYS = { 1: "none", 2: "state", 3: "culture", 4: "religion", 5: "province" };
const TOGGLE_KEYS = { c: "coast", r: "rivers", t: "routes", u: "burgs", l: "labels" };
const TOOL_KEYS = { 1: TOOLS.PAINT_STATE, 2: TOOLS.PAINT_CULTURE, 3: TOOLS.PAINT_RELIGION, 4: TOOLS.PAINT_PROVINCE, 5: TOOLS.PAINT_BIOME, 6: TOOLS.ADD_BURG, 7: TOOLS.ADD_MARKER };

export function initShortcuts({ store, actions, openFileDialog, openHelp, editMode, editToolbar }) {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); }
        else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); store.redo(); }
        else if (k === "s" && !e.shiftKey && store.getState().map) { e.preventDefault(); actions.saveNative(); } // 地図が無いときはブラウザの既定動作のまま
      }
      return;
    }
    // 入力欄・選択欄・ダイアログ操作中は、地図のショートカットを効かせない
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest("select, input, textarea, dialog[open]") || t.isContentEditable)) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const hasMap = !!store.getState().map;

    if (key === "o") { e.preventDefault(); openFileDialog(); return; }
    if (key === "?" ) { e.preventDefault(); openHelp(); return; }
    if (!hasMap) return; // 以降は地図が読み込まれているときだけ

    if (key === "v") { editMode?.setTool(TOOLS.SELECT); editToolbar?.sync(); return; }
    if (key === "[" || key === "]") { const cur = Number(byId("tool-radius").value); const next = cur + (key === "]" ? 10 : -10); editMode?.setRadius(next); byId("tool-radius").value = String(Math.max(10, Math.min(200, next))); return; }
    // 選択ツール中の 1〜5 は色分けの切替、それ以外のツール中の 1〜7 は工具の切替
    if (editMode && editMode.tool !== TOOLS.SELECT && key in TOOL_KEYS) { editMode.setTool(TOOL_KEYS[key]); editToolbar?.fillTargets(TOOL_KEYS[key]); editToolbar?.sync(); return; }
    if (editMode && editMode.tool === TOOLS.SELECT && (key === "6" || key === "7")) { editMode.setTool(TOOL_KEYS[key]); editToolbar?.fillTargets(TOOL_KEYS[key]); editToolbar?.sync(); return; }
    if (key === "f" || key === "0") actions.fit();
    else if (key === "+" || key === "=") actions.zoomBy(1.25);
    else if (key === "-" || key === "_") actions.zoomBy(1 / 1.25);
    else if (key === "ArrowLeft") { e.preventDefault(); actions.pan(PAN_STEP, 0); }
    else if (key === "ArrowRight") { e.preventDefault(); actions.pan(-PAN_STEP, 0); }
    else if (key === "ArrowUp") { e.preventDefault(); actions.pan(0, PAN_STEP); }
    else if (key === "ArrowDown") { e.preventDefault(); actions.pan(0, -PAN_STEP); }
    else if (key in OVERLAY_KEYS) actions.setOverlay(OVERLAY_KEYS[key]);
    else if (key === "b") actions.toggleBase();
    else if (key in TOGGLE_KEYS) actions.toggle(TOGGLE_KEYS[key]);
  });
}

export function initHelpDialog() {
  const dialog = byId("help-dialog");
  return { open: () => { if (!dialog.open) dialog.showModal(); } };
}
