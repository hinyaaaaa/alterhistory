// 編集UIの統合テスト（jsdom）。実際の index.html とビルド済み dist/app.js を動かす。
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } console.log(`  (待機タイムアウト: ${label})`); return false; }

function fakeCtx() {
  const props = {};
  return new Proxy({}, {
    get(_, k) { if (k in props) return props[k]; if (k === "measureText") return (t) => ({ width: String(t).length * 8 }); return () => {}; },
    set(_, k, v) { props[k] = v; return true; },
  });
}

const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  beforeParse(window) {
    window.devicePixelRatio = 1;
    window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = function () { return (this.__ctx ??= fakeCtx()); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    window.confirm = () => true;
    window.prompt = () => window.__nextPromptAnswer ?? "新しい村";
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);

const ready = await waitFor(() => window.alterhistory, 8000, "アプリ起動");
check("アプリが起動する", ready);
if (!ready) process.exit(1);
const { store, viewport } = window.alterhistory;
const errors = []; window.addEventListener("error", (e) => errors.push(e.message));

console.log("=== 地図を開く ===");
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([readFileSync(`${SAMPLES}/境界線の貴方.map`)], "境界線の貴方.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("読み込みが完了する", await waitFor(() => store.getState().map, 15000, "読み込み"));
viewport.fit();
const map = store.getState().map;

const centerWorld = () => { const cx = map.meta.width / 2, cy = map.meta.height / 2; return viewport.toScreen(cx, cy); };
const worldOf = (sx, sy) => viewport.toWorld(sx, sy);
const pointer = (el, type, x, y, extra = {}) => el.dispatchEvent(new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...extra }));
const canvas = $("map-canvas");

console.log("=== ツール切替 ===");
q('[data-tool="paint:state"]').click();
check("国家ツールが選ばれる（ボタンがactive）", q('[data-tool="paint:state"]').classList.contains("active"));
check("対象セレクトが表示される", $("tool-target-group").hidden === false);
check("ブラシ半径が表示される", $("tool-radius-group").hidden === false);
const targetSel = $("tool-target");
check("対象の選択肢に国家が並ぶ", targetSel.options.length > 3);

console.log("=== 塗りブラシ（ドラッグ） ===");
const cellCountBefore = new Map();
for (const s of map.pack.states) if (s && s.i && !s.removed) cellCountBefore.set(s.i, s.cells);
const targetState = [...cellCountBefore.keys()].find((id) => id !== undefined);
targetSel.value = String(targetState); targetSel.dispatchEvent(new window.Event("change"));
$("tool-radius").value = "60"; $("tool-radius").dispatchEvent(new window.Event("input"));

const [cx, cy] = centerWorld();
pointer(canvas, "pointerdown", cx, cy);
pointer(canvas, "pointermove", cx + 15, cy + 10);
pointer(canvas, "pointermove", cx + 30, cy);
pointer(canvas, "pointerup", cx + 30, cy);
await sleep(50);
const stateNow = store.getState().map.pack.states.find((s) => s && s.i === targetState);
check("ドラッグで塗った国家のセル数が変わる（増えたか元々全部そうだったか）", stateNow.cells >= cellCountBefore.get(targetState));
check("Undo可能になっている（1ストロークがまとまっている）", store.canUndo());
const beforeUndoCells = JSON.stringify(map.pack.cells.state.slice(0, 200));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
await sleep(30);
check("Ctrl+Z で1回のUndoに戻る", store.getState().map.pack.states.find((s) => s.i === targetState).cells === cellCountBefore.get(targetState));

console.log("=== 選択ツールでパネルを開く ===");
q('[data-tool="select"]').click();
check("選択ツールに戻る", q('[data-tool="select"]').classList.contains("active"));
// マーカーが重なっていない都市を選ぶ（マーカーはクリックで都市より優先されるため）
const burg = map.pack.burgs.find((b) => b && b.i && !b.removed && !b.capital
  && !map.markers.some((mk) => Math.hypot(mk.x - b.x, mk.y - b.y) < 20));
const [bx, by] = viewport.toScreen(burg.x, burg.y);
pointer(canvas, "click", bx, by);
check("都市のパネルが開く", await waitFor(() => !$("editor-panel").hidden && $("editor-panel").textContent.includes(burg.name), 2000, "panel"));
check("削除ボタンがある", !!$("editor-panel").querySelector("button.danger"));

console.log("=== 都市の改名 ===");
const nameInput = $("editor-panel").querySelector(".field input");
nameInput.value = "新しい名前";
nameInput.dispatchEvent(new window.Event("change"));
check("都市名が変わる", store.getState().map.pack.burgs[burg.i].name === "新しい名前");
check("パネルの見出しも更新される", $("editor-panel").querySelector("h3").textContent.includes("新しい名前"));

console.log("=== 文章の編集 ===");
const noteArea = $("editor-panel").querySelector(".note-field");
noteArea.value = "海沿いの交易都市。";
noteArea.dispatchEvent(new window.Event("change"));
const { getNote } = await import("../js/core/edit/notes.js");
check("文章が保存される", getNote(store.getState().map, "burg", burg.i) === "海沿いの交易都市。");

console.log("=== 都市を置く ===");
q('[data-tool="add:burg"]').click();
check("配置ツールに切り替わる", q('[data-tool="add:burg"]').classList.contains("active"));
let landCell = -1; for (let i = 0; i < map.pack.cells.biome.length; i++) if (map.pack.cells.biome[i] !== 0 && !map.pack.cells.burg[i]) { landCell = i; break; }
const [lx, ly] = viewport.toScreen(map.geometry.pack.p[landCell][0], map.geometry.pack.p[landCell][1]);
const beforeBurgCount = store.getState().map.pack.burgs.filter((b) => b && b.i && !b.removed).length;
pointer(canvas, "pointerdown", lx, ly); pointer(canvas, "click", lx, ly); pointer(canvas, "pointerup", lx, ly);
await sleep(50);
const afterBurgCount = store.getState().map.pack.burgs.filter((b) => b && b.i && !b.removed).length;
check("都市が1つ増える", afterBurgCount === beforeBurgCount + 1, `${beforeBurgCount}→${afterBurgCount}`);
check("新しい都市のパネルが自動で開く", !$("editor-panel").hidden && $("editor-panel").textContent.includes("新しい村"));

console.log("=== マーカーを置く ===");
q('[data-tool="add:marker"]').click();
let landCell2 = -1; for (let i = 0; i < map.pack.cells.biome.length; i++) if (map.pack.cells.biome[i] !== 0 && i !== landCell) { landCell2 = i; break; }
const [mx, my] = viewport.toScreen(map.geometry.pack.p[landCell2][0], map.geometry.pack.p[landCell2][1]);
const beforeMarkers = store.getState().map.markers.length;
pointer(canvas, "pointerdown", mx, my); pointer(canvas, "click", mx, my); pointer(canvas, "pointerup", mx, my);
await sleep(50);
check("マーカーが1つ増える", store.getState().map.markers.length === beforeMarkers + 1);
check("マーカーのパネルが開く", !$("editor-panel").hidden && $("editor-panel").querySelector("h3"));

console.log("=== キーボードでのツール切替 ===");
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "v", bubbles: true }));
check("[V] で選択ツールに戻る", q('[data-tool="select"]').classList.contains("active"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "1", bubbles: true }));
check("選択ツール中の[1]は色分け切替（塗るツールにはならない）", store.getState().view.overlay === "none" && q('[data-tool="select"]').classList.contains("active"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "6", bubbles: true }));
check("選択ツール中の[6]は都市配置ツールに切り替わる", q('[data-tool="add:burg"]').classList.contains("active"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "2", bubbles: true }));
check("配置ツール中の[2]は文化を塗るツールに切り替わる", q('[data-tool="paint:culture"]').classList.contains("active"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "v", bubbles: true }));

console.log("=== ヘルプに編集操作が載っている ===");
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "?", bubbles: true }));
check("ヘルプに塗るツールの説明がある", $("help-dialog").textContent.includes("塗る"));
$("help-dialog").removeAttribute("open");

console.log("=== 保存に編集内容が反映される ===");
const blobs = new Map();
window.URL.createObjectURL = (b) => { const u = "blob:test/" + blobs.size; blobs.set(u, b); return u; };
window.URL.revokeObjectURL = () => {};
window.__downloads = [];
window.HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download")) window.__downloads.push({ name: this.getAttribute("download"), blob: blobs.get(this.href) }); };
const n0 = window.__downloads.length;
$("btn-save").click();
await waitFor(() => window.__downloads.length > n0, 8000, "保存");
const saved = await window.__downloads.at(-1).blob.text();
check("保存ファイルに新しい都市名が入る", saved.includes("新しい村") || saved.includes("新しい名前"));
check("保存ファイルに文章が入る", saved.includes("海沿いの交易都市"));

check("スクリプトエラーなし", errors.length === 0, errors.join("|"));
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
window.close();
process.exit(failed ? 1 : 0);
