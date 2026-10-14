// キーボードショートカット（一覧の画面は廃止。必要最小限だけ残す）。
import { byId } from "./dom.js";
import { TOOLS } from "./edit-mode.js";

const PAN_STEP = 80;
// 選択ツール中の数字・文字キーは、レイヤーのオン/オフ（独立なので重ねられる）
const LAYER_KEYS = { 1: "states", 2: "cultures", 3: "religions", 4: "provinces", 5: "heights", b: "biomes", c: "coast", r: "rivers", t: "routes", u: "burgs" };
// 地図編集でできることは、気候帯・標高・マーカーだけ（v2.4.0）。国・属州・都市は国家タブから、文化・宗教は一覧から
const TOOL_KEYS = { 6: TOOLS.PAINT_BIOME, 7: TOOLS.PAINT_HEIGHT, 8: TOOLS.ADD_MARKER };

export function initShortcuts({ store, actions, openFileDialog, editMode, editToolbar, timeActions, panels }) {
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
    // （ただし Space による時間制御は、ダイアログを開いたまま押しても効くようにする）
    const t = e.target;
    const inFormField = t instanceof HTMLElement && (t.closest("select, input, textarea") || t.isContentEditable);
    const inDialog = t instanceof HTMLElement && t.closest("dialog[open]");
    if (inFormField) return;
    if (inDialog && e.key !== " " && e.key !== "Spacebar" && e.key !== "Escape") return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const hasMap = !!store.getState().map;

    if (key === "o") { e.preventDefault(); openFileDialog(); return; }
    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      if (!hasMap || !timeActions) return;
      if (timeActions.isRunning()) timeActions.stop(); else timeActions.start();
      return;
    }
    if (key === "Escape") { panels?.military?.cancelPending(); }
    if (!hasMap) return; // 以降は地図が読み込まれているときだけ

    if (key === "v") { editMode?.setTool(TOOLS.SELECT); editToolbar?.sync(); return; }
    if (key === "[" || key === "]") { const cur = Number(byId("tool-radius").value); const next = cur + (key === "]" ? 10 : -10); editMode?.setRadius(next); byId("tool-radius").value = String(Math.max(10, Math.min(200, next))); return; }
    // 選択ツール中の 1〜5 はレイヤーの切替、6〜8 は工具の切替（気候帯・標高・マーカー）。それ以外のツール中も 6〜8 で切り替わる
    if (editMode && editMode.tool !== TOOLS.SELECT && key in TOOL_KEYS) { editMode.setTool(TOOL_KEYS[key]); editToolbar?.fillTargets(TOOL_KEYS[key]); editToolbar?.sync(); return; }
    if (editMode && editMode.tool === TOOLS.SELECT && (key === "6" || key === "7" || key === "8")) { editMode.setTool(TOOL_KEYS[key]); editToolbar?.fillTargets(TOOL_KEYS[key]); editToolbar?.sync(); return; }
    if (key === "f" || key === "0") actions.fit();
    else if (key === "+" || key === "=") actions.zoomBy(1.25);
    else if (key === "-" || key === "_") actions.zoomBy(1 / 1.25);
    else if (key === "ArrowLeft") { e.preventDefault(); actions.pan(PAN_STEP, 0); }
    else if (key === "ArrowRight") { e.preventDefault(); actions.pan(-PAN_STEP, 0); }
    else if (key === "ArrowUp") { e.preventDefault(); actions.pan(0, PAN_STEP); }
    else if (key === "ArrowDown") { e.preventDefault(); actions.pan(0, -PAN_STEP); }
    else if (key in LAYER_KEYS) actions.toggle(LAYER_KEYS[key]);
  });
}
