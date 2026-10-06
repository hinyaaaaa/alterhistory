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

const qa = (sel) => [...window.document.querySelectorAll(sel)];
const { simActions } = window.alterhistory;
const win = (id) => q(`[data-win="${id}"]`);
const menuBtn = (w) => q(`[data-open-win="${w}"]`);
const pick = (a, d) => { const boxes = () => [...window.document.querySelectorAll("#tab-wars .war-side")]; boxes()[0].querySelectorAll("input")[a].click(); boxes()[1].querySelectorAll("input")[d].click(); };

console.log("=== 設定メニューとウィンドウ ===");
check("上部バーに「設定」メニューがある", !!q("#settings-menu summary") && !!menuBtn("war") && !!menuBtn("diplomacy") && !!menuBtn("military"));
check("開く前、ウィンドウは見えない", ["war", "diplomacy", "military"].every((w) => win(w).hidden));
menuBtn("war").click();
check("戦争ウィンドウが開く", !win("war").hidden && !!win("war").querySelector(".war-band"));
menuBtn("military").click();
check("複数のウィンドウを同時に開ける", !win("war").hidden && !win("military").hidden);
win("war").querySelector(".panel-close").click();
check("× で閉じる", win("war").hidden && !win("military").hidden);

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
menuBtn("treaty").click();
check("講和条約ウィンドウに、講和待ちの戦争と条約の入力が出る", !!win("treaty").querySelector(".war-prep") && win("treaty").textContent.includes("各国の消耗"));
check("講和条約名は講和地の地名から付く（◯◯条約）", [...win("treaty").querySelectorAll("input:not([type])")].some((i) => /条約$/.test(i.value)), [...win("treaty").querySelectorAll("input:not([type])")].map((i) => i.value).join(" / "));

console.log("=== 戦争ウィンドウ：戦況と講和の分離 ===");
[...qa("#tab-wars .war-band button")].find((b) => b.textContent.includes(names[0])).click();
check("戦況バー（陸軍・海軍・空軍・士気・民意）が戦争ウィンドウに出る", qa("#tab-wars .wo-bar-wrap").length === 5);
check("戦争の一覧は見出し帯（左の列ではない）", !!q("#tab-wars .war-band") && !q("#tab-wars .win-list"));
check("戦争ウィンドウは左右2列（設定／戦況）", !!q("#tab-wars .war-prep .war-prep-right"));
check("戦争名を変えられる入力欄がある", !!q("#tab-wars .war-name-input"));
check("講和条約の入力は戦争ウィンドウに無い（講和条約ウィンドウに分離）", !q("#tab-wars .wo-cess") && ![...qa("#tab-wars button")].some((b) => b.textContent.includes("この内容で講和する")));
check("終戦日が自動で決まっている", !!simActions.listWars().find((w) => w.name === names[0]).endsAt);

const st = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
for (const s of st.slice(0, 2)) { const cell = store.getState().map.pack.cells.state.findIndex((v) => v === s.i); simActions.createRegiment(s.i, cell, {}); simActions.createRegiment(s.i, cell, {}); }
console.log("=== 外交・軍事ウィンドウ ===");
menuBtn("diplomacy").click();
check("外交ウィンドウに関係の表と同盟がある", !!win("diplomacy").querySelector(".diplomacy-matrix") && !!win("diplomacy").querySelector("#tab-alliances"));
menuBtn("military").click();
check("軍事ウィンドウに国ごとの比較表がある（国家の行数 + 見出し）", win("military").querySelectorAll(".win-table tr").length === st.length + 1);
check("軍事の表に部隊数が出る", [...win("military").querySelectorAll(".win-table tr")][1].textContent.includes("2"));
check("軍事ウィンドウに「攻撃」の操作は無い", !win("military").textContent.includes("攻撃"));

console.log("=== 国家の詳細画面 ===");
window.alterhistory.editorPanel.openEntity("state", 1);
await sleep(50);
check("横タブは廃止（国家の詳細にタブボタンは無い）", qa("#editor-panel .tab-btn").length === 0);
check("属州は基本情報の下に折りたたみで続く", !!q("#editor-panel .state-prov-fold"));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
