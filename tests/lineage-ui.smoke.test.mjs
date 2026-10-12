// 君主交代・系譜・原因リンクの画面（国家詳細の「操作」）の統合テスト（jsdom）。
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
    window.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
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

const qa = (s) => [...window.document.querySelectorAll(s)];
const M = () => store.getState().map;
const A = M().pack.states.find((s) => s && s.i > 0 && !s.removed).i;
window.alterhistory.panels.openEntity("state", A);
await sleep(80);
const ed = q("#editor-panel");
check("国家詳細に「君主」「系譜」「操作（君主交代）」がある", ["君主", "系譜", "操作", "君主交代"].every((t) => ed.textContent.includes(t)));
const go = [...ed.querySelectorAll("button")].find((b) => b.textContent.includes("君主交代を記録する"));
const sels = go.parentElement.querySelectorAll("select");
sels[2].value = "chaos"; go.click(); await sleep(80);
check("確定すると君主が記録され、年表に残る", M().ext.data.monarchs[A].current.stability === "chaos" && M().ext.data.historyLog.at(-1).type === "succession");
check("「大きな混乱」なら、反乱・独立への入口が出る（自動では起こさない）", [...ed.querySelectorAll("button")].some((b) => b.textContent.includes("反乱・独立を起こす")) && M().ext.data.historyLog.at(-1).type === "succession");
check("現在の君主が詳細に出る", ed.textContent.includes("第1代王") || /王|皇帝/.test(ed.querySelector(".monarch-line").textContent));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
