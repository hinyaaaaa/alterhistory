// 歴史ビルダーUIの統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));

const qa = (sel) => [...window.document.querySelectorAll(sel)];
const { simActions } = window.alterhistory;
const win = (id) => q(`[data-win="${id}"]`);
const menuBtn = (w) => q(`[data-open-win="${w}"]`) ?? { click: () => window.alterhistory.wins.open(w) };
const pick = (a, d) => { const boxes = () => [...window.document.querySelectorAll("#tab-wars .war-side")]; boxes()[0].querySelectorAll("input")[a].click(); boxes()[1].querySelectorAll("input")[d].click(); };

console.log("=== 設定メニューとウィンドウ ===");
check("ハブに国家・戦争・外交の入口があり、軍事は無い", !!q("#hub") && !!menuBtn("war") && !!menuBtn("diplomacy") && !!menuBtn("nation") && !q('[data-open-win="military"]'));
check("開く前、ウィンドウは見えない", ["war", "diplomacy", "nation"].every((w) => win(w).hidden));
menuBtn("war").click();
check("戦争ウィンドウが開く", !win("war").hidden && !!win("war").querySelector(".war-band"));
menuBtn("nation").click();
check("複数のウィンドウを同時に開ける", !win("war").hidden && !win("nation").hidden);
win("war").querySelector(".panel-close").click();
check("× で閉じる", win("war").hidden && !win("nation").hidden);

console.log("=== 戦争：宣戦布告と戦争名 ===");
menuBtn("war").click();
const newBtn = () => [...qa("#tab-wars .war-band button")].find((b) => b.textContent.includes("新しい戦争"));
const declare = () => [...qa("#tab-wars button")].find((b) => b.textContent.includes("戦争開始"));
newBtn().click(); pick(0, 1);
check("攻撃側・防御側を選ぶまでは宣戦布告できない/選べば押せる", !declare().disabled);
declare().click();
check("宣戦布告できる", simActions.listWars().length === 1);
newBtn().click(); pick(0, 1); declare().click();
const names = simActions.listWars().map((w) => w.name);
check("同じ国どうしの2回目も、自動で付く戦争名が重ならない", new Set(names).size === 2 && names.every((n) => n.length > 0), names.join(" / "));
check("宣戦布告の瞬間に結果が判定される", simActions.listWars().every((w) => w.result && ["attacker", "defender", "stalemate"].includes(w.result.winner)));
window.alterhistory.panels.diplomacy.openPeace(); // 講和条約は、外交ウィンドウの右の列（講和モード）に出る
check("外交の右の列に、講和待ちの戦争と条約の入力が出る", !!win("diplomacy").querySelector(".dip-right .war-prep") && win("diplomacy").textContent.includes("各国の消耗"));
check("独立の講和条約ウィンドウは無い", !win("treaty"));
check("講和条約名は講和地の地名から付く（◯◯条約）", [...win("diplomacy").querySelectorAll("input:not([type])")].some((i) => /条約$/.test(i.value)), [...win("diplomacy").querySelectorAll("input:not([type])")].map((i) => i.value).join(" / "));

console.log("=== 戦争ウィンドウ：戦況と講和の分離 ===");
[...qa("#tab-wars .war-band button")].find((b) => b.textContent.includes(names[0])).click();
check("戦況バー（陸軍・海軍・空軍・士気・民意）が戦争ウィンドウに出る", qa("#tab-wars .wo-bar-wrap").length === 5);
check("戦争の一覧は見出し帯（左の列ではない）", !!q("#tab-wars .war-band") && !q("#tab-wars .win-list"));
check("戦争ウィンドウは4つのタブ（概要・部隊・経過・講和）", [...qa("#tab-wars .war-tabs button")].map((b) => b.textContent).join("/") === "概要/部隊/経過/講和");
check("講和タブに戦争スコアの内訳が出る", q("#tab-wars .war-tab-pc")?.textContent.includes("戦争スコアの内訳"));
check("戦争名を変えられる入力欄がある", !!q("#tab-wars .war-name-input"));
check("講和条約の入力は戦争ウィンドウに無い（講和条約ウィンドウに分離）", !q("#tab-wars .wo-cess") && ![...qa("#tab-wars button")].some((b) => b.textContent.includes("この内容で講和する")));
check("終戦日が自動で決まっている", !!simActions.listWars().find((w) => w.name === names[0]).endsAt);

const st = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
for (const s of st.slice(0, 2)) { const cell = store.getState().map.pack.cells.state.findIndex((v) => v === s.i); simActions.createRegiment(s.i, cell, {}); simActions.createRegiment(s.i, cell, {}); }
console.log("=== 外交ウィンドウ ===");
window.alterhistory.panels.diplomacy.closePeace(); // 講和モードから、条約一覧へ戻す
menuBtn("diplomacy").click(); window.alterhistory.panels.diplomacy.render();
window.alterhistory.panels.diplomacy.closePeace(); win("diplomacy").querySelector(".dip-tabs button")?.click(); await sleep(40);
check("外交ウィンドウに3タブ・国の絞り込み・「条約を結ぶ」があり、外交の表は無い", win("diplomacy").querySelectorAll(".dip-tabs button").length === 3 && !!win("diplomacy").querySelector(".dip-focus") && win("diplomacy").textContent.includes("条約を結ぶ") && !win("diplomacy").querySelector(".diplomacy-matrix"));

console.log("=== 国家の詳細は国家タブに一本化されている（v2.4.1） ===");
window.alterhistory.panels.openEntity("state", 1);
await sleep(50);
check("国家を開く操作は、国家タブを開く", !!win("nation") && !win("nation").hidden && win("nation").style.display !== "none");
check("旧・国家詳細（サイドバー）は出ない", !q("#editor-panel .state-prov-fold") && qa("#editor-panel .tab-btn").length === 0);

console.log("=== ウィンドウの大きさ変更 ===");
{
  const stage = q("#stage"), w = win("nation");
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 });
  w.getBoundingClientRect = () => ({ left: 100, top: 50, width: parseFloat(w.style.width) || 400, height: parseFloat(w.style.height) || 300, right: 0, bottom: 0 });
  check("四辺と四隅に8個のつまみがある", w.querySelectorAll(".rs-handle").length === 8);
  const fire = (el, type, x, y) => { const e = new window.Event(type, { bubbles: true }); e.clientX = x; e.clientY = y; e.pointerId = 1; el.dispatchEvent(e); };
  const se = w.querySelector(".rs-se");
  fire(se, "pointerdown", 500, 350); fire(se, "pointermove", 700, 450); fire(se, "pointerup", 700, 450);
  check("右下をドラッグすると広がる（400×300 → 600×400）", w.style.width === "600px" && w.style.height === "400px", `${w.style.width}×${w.style.height}`);
  const nw = w.querySelector(".rs-nw");
  fire(nw, "pointerdown", 100, 50); fire(nw, "pointermove", 160, 90);
  check("左上をドラッグすると位置も動く", w.style.left === "160px" && w.style.top === "90px" && w.style.width === "540px", `${w.style.left},${w.style.top} ${w.style.width}`);
  fire(nw, "pointermove", 900, 600); fire(nw, "pointerup", 900, 600);
  check("小さくしすぎない（最小幅280・最小高さ160）", parseFloat(w.style.width) >= 280 && parseFloat(w.style.height) >= 160, `${w.style.width}×${w.style.height}`);
  const e2 = w.querySelector(".rs-e");
  fire(e2, "pointerdown", 0, 0); fire(e2, "pointermove", 5000, 0); fire(e2, "pointerup", 5000, 0);
  check("地図の表示領域の外へははみ出さない", parseFloat(w.style.left) + parseFloat(w.style.width) <= 1000, `${w.style.left}+${w.style.width}`);
  check("国家の詳細・地図編集パネルにもつまみがある", q("#sidebar .rs-handle") != null && q("#edit-panel .rs-handle") != null);
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
