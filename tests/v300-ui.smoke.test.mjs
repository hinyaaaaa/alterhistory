// v3.0.0 の画面: 国家タブ「国勢」の自律行動（プレイヤー国の設定）・設定ダイアログ（jsdom）。ビルド済み dist/app.js を動かす。
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } console.log(`  (待機タイムアウト: ${label})`); return false; }
function fakeCtx() { const props = {}; return new Proxy({}, { get(_, k) { if (k in props) return props[k]; if (k === "measureText") return (t) => ({ width: String(t).length * 8 }); return () => {}; }, set(_, k, v) { props[k] = v; return true; } }); }
const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  beforeParse(window) {
    window.devicePixelRatio = 1; window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = function () { return (this.__ctx ??= fakeCtx()); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    window.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {}; window.Element.prototype.releasePointerCapture = () => {}; window.Element.prototype.hasPointerCapture = () => false;
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);
check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store, editActions, simActions } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
Object.defineProperty($("file-input"), "files", { value: [new File([text], "synth.map")], configurable: true });
$("file-input").dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const M = () => store.getState().map, win = () => q('[data-win="nation"]');
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const btnOf = (r, t) => [...r.querySelectorAll("button")].find((b) => b.textContent.includes(t));

console.log("=== 国勢タブの「自律行動」 ===");
{ const L = live(); L.forEach((s, k) => { s.neighbors = [L[(k + 1) % L.length].i, L[(k + L.length - 1) % L.length].i]; }); } // 合成マップには国の隣接が無いので、輪にして与える
q('[data-open-win="nation"]').click(); await sleep(60);
const rows = () => win().querySelectorAll(".nation-row.b-click");
rows()[0].click(); await sleep(60);
const S0 = live()[0].i, S1 = live()[1].i;
btnOf(win().querySelector(".nation-tabs"), "国勢").click(); await sleep(60);
const sec = () => win().querySelector('[data-field="cond-ai"]');
const openState = async (i) => { const back = btnOf(win(), "国家一覧"); if (back) { back.click(); await sleep(30); } rows()[i].click(); await sleep(40); btnOf(win().querySelector(".nation-tabs"), "国勢").click(); await sleep(40); };
check("「自律行動」の欄がある", !!sec());
check("プレイヤー国が無いときは、自律が動かないことを説明する", sec().textContent.includes("自律行動は動いていません"));
const cb = () => win().querySelector("#ai-player-toggle");
cb().checked = true; cb().dispatchEvent(new window.Event("change")); await sleep(80);
check("★ を付けると、その国がプレイヤー国になる（保存される）", simActions.getAutonomy().players.includes(S0) && M().ext.data.ai?.players?.includes(S0));
check("プレイヤー国は、自分で動かすと表示される", sec().textContent.includes("自分で動かします"));
for (let i = 0; i < live().length; i++) { await openState(i); if (sec()?.textContent.includes("自律して動きます")) break; }
check("ほかの国は自律する（性格4つ・ペース・次の判断・直近の判断の欄）", sec().textContent.includes("自律して動きます") && sec().querySelectorAll(".cond-row").length === 5 && sec().textContent.includes("次の判断") && sec().textContent.includes("直近の判断"));
check("発展のペースが、プレイヤー国との比で出る", sec().textContent.includes("プレイヤー国の"));
check("月送りで判断が起き、「直近の判断」に理由が出る", (() => { for (let i = 0; i < 120; i++) simActions.advanceMonthly({ year: M().worldTime.year + Math.floor(i / 12), month: (i % 12) + 1 }); return listAi().length > 0; })());
function listAi() { return (M().ext.data.historyLog ?? []).filter((h) => h.type === "ai"); }
let shown = false;
for (let i = 0; i < live().length && !shown; i++) { await openState(i); shown = /\d+年\d+月/.test(sec()?.textContent ?? ""); }
check("判断した国の「直近の判断」に、年月と理由の文が出る", shown);

console.log("=== 設定（国家の自律行動） ===");
$("world-date").click(); await sleep(60);
check("設定ダイアログに、自律行動の欄がある（有効・速さ・行動の種類・プレイヤー国への宣戦）", !!q("#ai-on") && !!q("#ai-tempo") && ["tech", "treaty", "war", "peace"].every((k) => !!q(`#ai-verb-${k}`)) && !!q("#ai-target-players"));
check("初期値は、有効・ふつう・すべて有効", q("#ai-on").checked && q("#ai-tempo").value === "normal" && q("#ai-verb-war").checked && q("#ai-target-players").checked);
q("#ai-tempo").value = "active"; q("#ai-tempo").dispatchEvent(new window.Event("change")); await sleep(40);
check("判断の速さを変えられる（保存される）", simActions.getAutonomy().tempo === "active");
q("#ai-verb-war").checked = false; q("#ai-verb-war").dispatchEvent(new window.Event("change")); await sleep(40);
check("行動の種類を切り替えられる", simActions.getAutonomy().verbs.war === false && simActions.getAutonomy().verbs.tech === true);
q("#ai-on").checked = false; q("#ai-on").dispatchEvent(new window.Event("change")); await sleep(40);
check("無効にすると、ほかの項目も無効になる", simActions.getAutonomy().enabled === false && q("#ai-tempo").disabled && q("#ai-verb-war").disabled);

if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
process.exit(0);
