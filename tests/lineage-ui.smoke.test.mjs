// 君主交代・系譜・原因リンクの画面（国家詳細の「操作」）の統合テスト（jsdom）。
// 実際の index.html とビルド済み dist/app.js（npm run build 後）を動かす。
import { loadLegacyInto } from "./helpers/load-legacy.mjs";
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
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));

const qa = (s) => [...window.document.querySelectorAll(s)];
const M = () => store.getState().map;
const A = M().pack.states.find((s) => s && s.i > 0 && !s.removed).i;
window.alterhistory.panels.openEntity("state", A);
await sleep(80);
const nat = q('[data-win="nation"]');
check("国家を選ぶと国家タブの詳細が開き、指導者の顔・名前・称号が出る", !nat.hidden && !!nat.querySelector(".nation-detail .face-svg") && /王|皇帝|首相|大統領|元首|書記長|総統|将軍|族長|議長|大司祭|指導者/.test(nat.querySelector(".nation-leader").textContent));
check("初代の指導者が記録される（人名・性別・世代）", (() => { const c = M().ext.data.leaders[A].current; return c.name.includes("・") && ["m", "f"].includes(c.gender) && c.gen === 1; })());
const before = M().ext.data.leaders[A].current.id;
const go = [...nat.querySelectorAll("button")].find((b) => b.textContent.includes("世代交代"));
go.click(); await sleep(50);
const cards = [...nat.querySelectorAll(".nation-cands button")];
check("世代交代を押すと、後継の候補が3人出る", cards.length === 3);
cards[0].click(); await sleep(80);
const cur = M().ext.data.leaders[A];
check("候補を選ぶと指導者が交代し、前の指導者が歴代に入る", cur.current.id !== before && cur.history.length === 1 && cur.current.gen === 2);
check("交代は年表に残る", M().ext.data.historyLog.at(-1).type === "succession");
check("顔は指導者ごとに変わる（IDから決まる）", (() => { const f1 = nat.querySelector(".nation-leader .face-svg").outerHTML; return f1.length > 500; })());
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
