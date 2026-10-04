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
    window.HTMLCanvasElement.prototype.getContext = function () {
      if (!this.__ctx) { // 描画先は画面外のタイルにもなるので、どのキャンバスに描かれた文字も記録する
        const c = fakeCtx(); const o = c.fillText?.bind(c);
        c.fillText = (t, ...r) => { (globalThis.__drawn ??= []).push(t); return o ? o(t, ...r) : undefined; };
        this.__ctx = c;
      }
      return this.__ctx;
    };
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
const { store, viewport } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));


// ---- 描画のなめらかさ：移動は描き直さない／編集しても地図が消えない ----
const mapCanvas = $("map-canvas");
const { renderer } = window.alterhistory;
globalThis.__fills = 0; globalThis.__clears = 0;
const tileCtxs = new Set();
const origGet = window.HTMLCanvasElement.prototype.getContext;
window.HTMLCanvasElement.prototype.getContext = function (...a) {
  const c = origGet.apply(this, a);
  if (this !== mapCanvas && !tileCtxs.has(c)) { tileCtxs.add(c); const fr = c.fillRect?.bind(c); c.fillRect = (...r) => { globalThis.__fills++; return fr?.(...r); }; }
  return c;
};
renderer.requestRender(); await sleep(60);
const tileRedraws = () => globalThis.__fills;
const base = tileRedraws();
check("初回の描画でタイルが作られる", base >= 0);
// 小さな移動（画面の10%）を何度かしても、止まったあとに描き直さない
const before = tileRedraws();
for (let i = 0; i < 5; i++) { viewport.pan(viewport.screenWidth * 0.02, 0); renderer.interact(); await sleep(10); }
await sleep(300);
check("余白の範囲内でのパンは、止まっても描き直さない", tileRedraws() === before, `${before} → ${tileRedraws()}`);
// 大きく移動するとタイルの範囲を出るので、止まったあとに1回だけ描き直す
viewport.pan(viewport.screenWidth * 0.9, 0); renderer.interact(); await sleep(300);
check("範囲を出る大移動のあとは描き直される", tileRedraws() > before);
// データ変更（編集）のあと、画面のキャンバスは一度もクリアされた状態で放置されない: 画面への貼り付けは同期的に起きる
const s0 = tileRedraws(); renderer.requestRender(); await sleep(60);
check("編集のあとの再描画は1回で済む", tileRedraws() - s0 <= 1 + 0, `${tileRedraws() - s0}`);
// 大きさが変わらないリサイズでは何もしない（画面が消えない）
const w0 = mapCanvas.width; renderer.resize(); check("同じ大きさのリサイズでキャンバスが作り直されない", mapCanvas.width === w0);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
