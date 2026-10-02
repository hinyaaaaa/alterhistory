// 名前の仮生成UIの統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
// 実際の index.html とビルド済み dist/app.js（npm run build 後）を動かす。
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } console.log(`  (待機タイムアウト: ${label})`); return false; }
const KANA = /^[ァ-ヴー]+$/;

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
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);

// ダイアログが開いたら内容を記録し、入力欄に window.__answer を入れて OK を押す
const seenDialogs = [];
new window.MutationObserver((mutations) => {
  for (const m of mutations) for (const node of m.addedNodes) {
    if (node.nodeType === 1 && node.matches?.(".confirm-dialog")) {
      seenDialogs.push({ hasSuggest: !!node.querySelector(".suggest-btn"), hasHint: !!node.querySelector("p.hint") });
      const input = node.querySelector(".confirm-dialog-input");
      if (input) input.value = window.__answer ?? "";
      const ok = [...node.querySelectorAll(".confirm-dialog-actions button")].at(-1);
      Promise.resolve().then(() => ok?.click());
    }
  }
}).observe(window.document.body, { childList: true });

check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store, viewport } = window.alterhistory;

const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
viewport.fit();
const map = store.getState().map;
const liveBurgs = () => store.getState().map.pack.burgs.filter((b) => b && b.i && !b.removed);

console.log("=== 空欄のまま都市を置く → 仮の名前 ===");
q('[data-tool="add:burg"]').click();
let cell = -1; for (let i = 0; i < map.pack.cells.biome.length; i++) if (map.pack.cells.biome[i] !== 0 && !map.pack.cells.burg[i] && map.pack.cells.state[i] > 0) { cell = i; break; }
const [sx, sy] = viewport.toScreen(map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1]);
const n0 = liveBurgs().length;
window.__answer = "";
const ev = (type) => $("map-canvas").dispatchEvent(new window.MouseEvent(type, { clientX: sx, clientY: sy, button: 0, bubbles: true }));
ev("pointerdown"); ev("click"); ev("pointerup");
await sleep(80);
check("名前入力ダイアログに🎲ボタンと説明がある", seenDialogs.at(-1)?.hasSuggest === true && seenDialogs.at(-1)?.hasHint === true);
check("都市が1つ増える", liveBurgs().length === n0 + 1);
const nb = liveBurgs().at(-1);
check("空欄でも名前が付く（カタカナ）", KANA.test(nb.name), nb.name);
const panel = $("editor-panel");
check("パネルに「仮の名前」と確定ボタンが出る", panel.textContent.includes("仮の名前です") && [...panel.querySelectorAll("button")].some((b) => b.textContent === "この名前で確定"));

console.log("=== 🎲 で再生成 → 確定 ===");
const before = liveBurgs().at(-1).name;
const dice = panel.querySelector(".name-row .suggest-mini");
check("名前欄の横に🎲がある", !!dice);
dice.click();
await sleep(30);
const after = liveBurgs().at(-1).name;
check("🎲で名前が変わり、入力欄にも反映", after !== before && KANA.test(after) && panel.querySelector(".name-row input").value === after, `${before}→${after}`);
check("生成した名前も仮のまま", store.getState().map.ext?.data?.provisionalNames?.[`burg:${nb.i}`] === 1);
[...panel.querySelectorAll("button")].find((b) => b.textContent === "この名前で確定").click();
await sleep(30);
check("確定すると仮の表示が消える", !panel.textContent.includes("仮の名前です") && !store.getState().map.ext?.data?.provisionalNames);
check("確定しても名前は残る", liveBurgs().at(-1).name === after);

console.log("=== 手で付けた名前は仮にならない ===");
const cell2 = map.pack.cells.biome.findIndex((b, i) => b !== 0 && !map.pack.cells.burg[i] && i !== cell && map.pack.cells.state[i] > 0);
const [tx, ty] = viewport.toScreen(map.geometry.pack.p[cell2][0], map.geometry.pack.p[cell2][1]);
window.__answer = "手書きの町";
const ev2 = (type) => $("map-canvas").dispatchEvent(new window.MouseEvent(type, { clientX: tx, clientY: ty, button: 0, bubbles: true }));
ev2("pointerdown"); ev2("click"); ev2("pointerup");
await sleep(80);
const handmade = liveBurgs().find((b) => b.name === "手書きの町");
check("手書きの名前で作られ、仮の印が付かない", !!handmade && !store.getState().map.ext?.data?.provisionalNames?.[`burg:${handmade.i}`]);

console.log("=== 文化の「名前の系統」選択 ===");
const cid = map.pack.cultures.find((c) => c && c.i > 0 && !c.removed).i;
window.alterhistory.editorPanel.openEntity("culture", cid);
await sleep(30);
const sel = panel.querySelector("select");
check("文化パネルに系統の選択がある", !!sel && [...sel.options].some((o) => o.value === "nordic"));
if (sel) { sel.value = "nordic"; sel.dispatchEvent(new window.Event("change")); await sleep(30); }
check("系統を選ぶと保存データに入る", store.getState().map.ext?.data?.nameStyles?.[`culture:${cid}`] === "nordic");

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
