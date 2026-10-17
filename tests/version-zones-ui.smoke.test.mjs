// 版の表示・詳細設定・年表のゾーン操作（疫病・災害の一時表示）の統合テスト（jsdom）。
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

const qa = (sel) => [...window.document.querySelectorAll(sel)];
const wins = window.alterhistory.wins;
const M = () => store.getState().map;
const win = (id) => q(`[data-win="${id}"]`);
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const sOpt = M().pack.states.filter((s) => s && s.i > 0 && !s.removed);

console.log("=== 詳細設定と版の表示 ===");
wins.open("settings"); await sleep(50);
const sw = win("settings");
check("詳細設定に、バランス調整・時間と時代区分・このアプリについて がある（データ検査の窓は廃止）", ["バランス調整", "時間・時代区分", "このアプリについて"].every((t) => sw.textContent.includes(t)) && !sw.textContent.includes("検査を実行"));
check("「このアプリについて」に「v2.5.0 戦争と外交の再設計」と出る", sw.querySelector(".about-version").textContent === "v2.5.0 戦争と外交の再設計");
clickBtn(sw, "バランス調整を開く").click(); await sleep(30);
check("詳細設定からバランス調整の窓を開ける", wins.isOpen("balance"));
wins.close("balance"); wins.close("settings");

console.log("=== 年表に出来事を記録・書き足す欄は無い（v2.4.0 で廃止） ===");
wins.open("timeline"); await sleep(80);
const tl = win("timeline");
check("年表に、記録の欄・書き足す欄が無い", !tl.querySelector(".tl-rec") && !tl.querySelector(".tl-add"));
check("ゾーンの一覧・追加・編集の窓は無い", !win("zones") && !qa("[data-open-win]").some((b) => /zone|travel/.test(b.dataset.openWin)));
wins.close("timeline");
check("年表を閉じると、強調は消える", store.getState().view.zoneFocus == null);
check("旅の機能は画面に残っていない（旅の窓・ハブの項目・レイヤー）", !win("travel") && !q('[data-open-win="travel"]') && !q('[data-layer="journeys"]'));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
dom.window.close();
process.exit(failed ? 1 : 0);
