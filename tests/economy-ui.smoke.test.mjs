// 経済・旅・ゾーン・政治の深さ UI の統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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



const S = () => store.getState();
const M = () => S().map;
const ea = window.alterhistory.editActions;
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const openWin = (name) => q(`[data-open-win="${name}"]`).click();
const closeWin = (name) => q(`.float-win[data-win="${name}"] .panel-close`).click();

check("「歴史をつくる」は無く、経済はハブから開く", !$("btn-builder") && !!q('[data-open-win="economy"]'));

console.log("=== 経済・交易 ===");
openWin("economy");
await waitFor(() => q(".b-eco-sum"), 1500, "経済");
check("概要（取引・取引額・国の数）", window.document.querySelectorAll(".b-stat").length === 3);
const rows = window.document.querySelectorAll(".b-modebody .b-card");
check("国ごとのカードが並ぶ", rows.length === M().pack.states.filter((s) => s && s.i && !s.removed).length, `${rows.length}国`);
rows[0].querySelector(".b-row").click();
await waitFor(() => q(".b-tax"), 1000, "詳細");
check("開くと税率スライダー2本・国庫・産物の表", window.document.querySelectorAll(".b-tax input[type=range]").length === 2 && !!q(".b-goods") && !!q(".b-details input[type=number]"));
check("貿易線が地図に出る", (S().view.tradeLines ?? []).length > 0);
const firstId = M().pack.states.filter((s) => s && s.i && !s.removed).sort((a, b) => 0)[0].i;
const shownName = q(".b-card.active .b-row-name").textContent;
const target = M().pack.states.find((s) => s && s.i && (s.fullName ?? s.name) === shownName);
const r = q(".b-tax input[type=range]"); r.value = "0.4"; r.dispatchEvent(new window.Event("change"));
check("売上税を変えると国に保存される（Undo可能）", Math.abs(ea.getFinance(target.i).salesTax - 0.4) < 1e-9 && S().history?.undo?.length !== 0);
store.undo();
check("Undo で税率が戻る", !("salesTax" in target));
const tr = q(".b-details input[type=number]"); tr.value = "123"; tr.dispatchEvent(new window.Event("change"));
check("国庫を直接書き換えられる", ea.getFinance(target.i).treasury === 123);
store.undo();
closeWin("economy");
check("経済ウィンドウを閉じると貿易線が消える", S().view.tradeLines == null);

console.log("=== 政治・文化の深さ（詳細ウィンドウ） ===");
const ep = window.alterhistory.editorPanel;
let scope = '[data-win="nation"]'; // 国は国家タブの「基本設定」、文化・宗教は従来の詳細パネル（v2.4.1）
const labelsOf = () => [...window.document.querySelectorAll(`${scope} .b-mini`)].map((x) => x.textContent);
const fieldOf = (label) => [...window.document.querySelectorAll(`${scope} .b-field`)].find((f) => f.querySelector(".b-mini")?.textContent === label);
const shownState = M().pack.states.find((x) => x && x.i && !x.removed);
window.alterhistory.panels.openEntity("state", shownState.i);
check("国家タブの基本設定に「国の種類」が出る（政体は専用のリストが担当するので、政体名の欄は無い）", labelsOf().includes("国の種類") && !labelsOf().includes("政体名（国名につく語）"), labelsOf().join("|"));
const typeSel = fieldOf("国の種類").querySelector("select");
const typeBefore = shownState.type, typeAfter = [...typeSel.options].map((o) => o.value).find((v) => v !== typeSel.value);
typeSel.value = typeAfter; typeSel.dispatchEvent(new window.Event("change"));
check("国の種類を変えられる", shownState.type === typeAfter && typeAfter !== typeBefore, `${typeBefore} → ${shownState.type}`);
check("国の種類の変更が歴史ログに残る", (M().ext?.data?.historyLog ?? []).some((h) => h.type === "profile-state"));
store.undo();
check("Undo で歴史ログも戻る", !(M().ext?.data?.historyLog ?? []).some((h) => h.type === "profile-state"));
scope = "#editor-panel";
const rel = M().pack.religions.find((x) => x && x.i && !x.removed);
ep.openEntity("religion", rel.i);
check("宗教の詳細に「最高神」の欄がある", labelsOf().includes("最高神"));
const deityInput = fieldOf("最高神").querySelector("input");
deityInput.value = "テスト大神"; deityInput.dispatchEvent(new window.Event("change"));
check("最高神を手で書き換えられる", rel.deity === "テスト大神");
const before = rel.deity;
fieldOf("最高神").querySelector(".suggest-mini").click();
check("🎲で最高神がランダムに決まる", !!rel.deity && rel.deity !== before, rel.deity);
check("最高神の変更が歴史ログに残る", (M().ext?.data?.historyLog ?? []).filter((h) => h.type === "profile-religion").length === 2);
ep.openEntity("culture", M().pack.cultures.find((x) => x && x.i && !x.removed).i);
check("文化の詳細に、種類・起源が出る", labelsOf().includes("文化の種類") && labelsOf().includes("起源（どこから分かれたか）"));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
