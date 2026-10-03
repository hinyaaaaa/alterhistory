// 歴史ビルダーUIの統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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

check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store, viewport, editActions } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const app = $("app");
const mainEl = q("main"); // サイドバーの畳み状態は main に付く
const key = (k) => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));

console.log("=== Undo/Redo・未保存 ===");
check("初めは Undo/Redo とも押せない", $("btn-undo").disabled && $("btn-redo").disabled);
check("初めは未保存マークなし", $("btn-save").textContent === "保存");
const cells = []; const st = store.getState().map.pack.cells.state;
for (let i = 0; i < st.length && cells.length < 5; i++) if (st[i] === 1) cells.push(i);
editActions.paintCells("state", 2, cells);
check("編集すると Undo が押せる", !$("btn-undo").disabled);
check("編集すると「保存 ●」になる", $("btn-save").textContent === "保存 ●");
check("Undo のツールチップに操作名が出る", /元に戻す：/.test($("btn-undo").title), $("btn-undo").title);
$("btn-undo").click();
check("Undo ボタンで戻る（Redo が押せる）", $("btn-undo").disabled && !$("btn-redo").disabled);
$("btn-redo").click();
check("Redo ボタンでやり直せる", !$("btn-undo").disabled && $("btn-redo").disabled);

console.log("=== 上部・下部バー（隠せない）と、パネルの × ===");
check("上部バーを隠す設定（表示・設定メニュー）は無い", !q("#view-menu") && !q("[data-chrome]") && !$("btn-chrome-restore"));
key("h");
check("H キーで枠が隠れたりしない", !app.className.includes("hide-"));
check("初めは凡例パネルが開いていて、☰ は出ていない", !mainEl.classList.contains("side-collapsed") && $("btn-sidebar-toggle").hidden);
$("legend-close").click();
check("凡例の × でサイドバーが畳まれ、☰ が出る", mainEl.classList.contains("side-collapsed") && !$("btn-sidebar-toggle").hidden);
$("btn-sidebar-toggle").click();
check("☰ で元に戻り、☰ は消える", !mainEl.classList.contains("side-collapsed") && $("btn-sidebar-toggle").hidden);
$("legend-close").click();
window.alterhistory.editorPanel.openEntity?.("state", 1);
await sleep(50);
check("国家を開くと、畳んでいたサイドバーが自動で開く", !mainEl.classList.contains("side-collapsed"));
for (const [panel, close, tab, open] of [["builder-panel", "builder-close", "tab-builder-panel", "btn-builder"], ["edit-panel", "edit-panel-close", "tab-edit-panel", "btn-edit-mode"]]) {
  $(open).click();
  check(`${panel}: 開くと展開ボタンは出ない`, !$(panel).hidden && $(tab).hidden);
  $(close).click(); await sleep(20);
  check(`${panel}: × で閉じ、元の場所の展開ボタンが出る`, $(panel).hidden && !$(tab).hidden);
  $(tab).click(); await sleep(20);
  check(`${panel}: 展開ボタンで開き直せて、ボタンは消える`, !$(panel).hidden && $(tab).hidden);
  $(open).click(); await sleep(20);
  check(`${panel}: 上部バーのボタンで閉じたときは展開ボタンを出さない`, $(panel).hidden && $(tab).hidden);
}

console.log("=== 速度ラベル ===");
check("速度ラベルが年数で書かれている", [...$("sel-time-speed").options].every((o) => /^1年=/.test(o.textContent)));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
