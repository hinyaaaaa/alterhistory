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
const modeBtn = (label) => [...window.document.querySelectorAll(".b-mode")].find((b) => b.textContent === label);

$("btn-builder").click();
check("モードの切替タブが3つ", window.document.querySelectorAll(".b-mode").length === 3);

console.log("=== 経済・交易 ===");
modeBtn("経済・交易").click();
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
modeBtn("つくる").click();
check("他のモードへ移ると貿易線が消える", S().view.tradeLines == null);

console.log("=== 旅 ===");
modeBtn("旅・ゾーン").click();
await waitFor(() => q(".b-wide"), 1000, "旅");
q(".b-wide").click();
await waitFor(() => q(".b-leg, .b-addleg"), 1000, "旅カード");
check("旅が作られ、カードが開く", (M().ext?.data?.journeys ?? []).length === 1 && !!q(".b-addleg"));
// 地図でのセル選択を模擬: editMode.pickCell の待ちに、直接セルを渡す
const c = M().pack.cells, land = []; for (let i = 0; i < c.biome.length; i++) if (c.biome[i] !== 0 && c.state[i] === 1) land.push(i);
const A = land[0], B = land[land.length - 1];
clickBtn(q(".b-addleg"), "＋ 区間を足す").click();
check("出発点の選択待ちになる", S().pickingCell === true);
const canvas = $("map-canvas");
const clickCell = (cell) => {
  const p = M().geometry.pack.p[cell]; const v = window.alterhistory.viewport; const [sx, sy] = v.toScreen(p[0], p[1]);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 });
  canvas.dispatchEvent(new window.MouseEvent("click", { clientX: sx, clientY: sy, bubbles: true }));
};
clickCell(A);
await waitFor(() => S().pickingCell === true && q(".b-status"), 1000, "目的地待ち");
check("次は目的地の選択待ち", /どこへ/.test(q(".b-status").textContent));
clickCell(B);
await waitFor(() => (M().ext.data.journeys[0].legs.length === 1), 1500, "区間");
const leg = M().ext.data.journeys[0].legs[0];
check("区間が追加され、経路が保存される", leg.path.length > 1 && S().pickingCell === false);
check("カードに距離と所要日数が出る", /km/.test(q(".b-leg .b-row-meta").textContent) && /日|時間/.test(q(".b-leg .b-row-meta").textContent), q(".b-leg .b-row-meta").textContent);
const sel = q(".b-leg select"); sel.value = "horse"; sel.dispatchEvent(new window.Event("change"));
check("区間の移動手段を変えられる", M().ext.data.journeys[0].legs[0].transport === "horse");
clickBtn(q(".b-addleg"), "＋ 区間を足す").click();
const w = []; for (let i = 0; i < c.biome.length; i++) if (c.biome[i] === 0) w.push(i);
clickCell(w[0]);
await waitFor(() => S().error, 1000, "エラー");
check("行けない場所を選ぶと、理由が出て区間は増えない", /水の上/.test(S().error) && M().ext.data.journeys[0].legs.length === 1, S().error);
store.update((s) => { s.error = null; });

console.log("=== ゾーン ===");
clickBtn(window.document.querySelector(".b-tabs"), "ゾーン").click();
await waitFor(() => window.document.querySelector(".b-how"), 1000, "ゾーン");
const zsel = q(".b-addleg select"); zsel.value = "Disease"; zsel.dispatchEvent(new window.Event("change"));
clickBtn(q(".b-how"), "🎲 1点から広げる").click();
check("中心の選択待ちになる", S().pickingCell === true);
clickCell(land[5]);
await waitFor(() => (M().zones ?? []).length === 1, 1500, "ゾーン");
check("1点から広がったゾーンができる（疫病・24セル）", M().zones[0].type === "Disease" && M().zones[0].cells.length === 24, `${M().zones[0].cells.length}`);
check("カードが開き、種類・塗り足し・削除が使える", !!q(".b-card.active select") && !!clickBtn(q(".b-card.active"), "✋ 塗り足す") && !!clickBtn(q(".b-card.active"), "削除"));
clickBtn(q(".b-card.active"), "✋ 塗り足す").click();
check("塗り足しを押すと、ゾーンを塗るツールになる", S().editTool === "paint:zone");
modeBtn("つくる").click();
check("他のモードへ移るとツールが選択に戻る", S().editTool === "select");
modeBtn("旅・ゾーン").click();
await waitFor(() => window.document.querySelector(".b-tabs"), 1000, "戻る");
clickBtn(window.document.querySelector(".b-tabs"), "ゾーン").click();
await waitFor(() => window.document.querySelector(".b-card"), 1000, "カード");
window.document.querySelector(".b-card .b-row").click();
await waitFor(() => clickBtn(q(".b-card.active"), "削除"), 1000, "削除");
clickBtn(q(".b-card.active"), "削除").click();
check("削除できる", (M().zones ?? []).length === 0);
store.undo();
check("Undo で戻る", M().zones.length === 1);

console.log("=== 政治・文化の深さ（つくる→詳しく） ===");
modeBtn("つくる").click();
await waitFor(() => window.document.querySelector(".b-tabs .b-tab"), 1000, "つくる");
const tabBtn = (label) => [...window.document.querySelectorAll(".b-tabs .b-tab")].find((b) => b.textContent.startsWith(label));
check("都市タブがある", !!tabBtn("都市"));
tabBtn("国家").click();
await waitFor(() => q(".b-card .b-more-btn"), 1000, "国家");
q(".b-card .b-more-btn").click();
await waitFor(() => q(".b-details"), 1000, "詳細");
const labelsOf = () => [...q(".b-details").querySelectorAll(".b-mini")].map((x) => x.textContent);
check("国の詳細に、政体・政体名・国の種類が出る", ["政体", "政体名（国名につく語）", "国の種類"].every((t) => labelsOf().includes(t)), labelsOf().join("|"));
const formSel = [...q(".b-details").querySelectorAll(".b-field")].find((f) => f.querySelector(".b-mini")?.textContent === "政体").querySelector("select");
const shownState = M().pack.states.filter((s) => s && s.i && !s.removed).find((s) => (s.fullName ?? s.name) === q(".b-card .b-row-name").textContent);
formSel.value = "Republic"; formSel.dispatchEvent(new window.Event("change"));
check("政体を変えられる", shownState.form === "Republic");
store.undo();
tabBtn("文化").click();
await waitFor(() => q(".b-card .b-more-btn"), 1000, "文化");
q(".b-card .b-more-btn").click();
await waitFor(() => q(".b-details"), 1000, "文化詳細");
check("文化の詳細に、種類・起源が出る", labelsOf().includes("文化の種類") && labelsOf().includes("起源（どこから分かれたか）"));
tabBtn("都市").click();
await waitFor(() => q(".b-card .b-row"), 1000, "都市");
q(".b-card .b-row").click();
await waitFor(() => q(".b-feats"), 1000, "都市詳細");
check("都市の詳細に、人口・区分・設備のチェックが出る", window.document.querySelectorAll(".b-feat").length === 5 && !!q(".b-details input[type=number]"));
const burgName = q(".b-card .b-row-name").textContent.replace("🏰 ", "");
const burg = M().pack.burgs.find((b) => b && b.i && b.name === burgName);
const wall = [...window.document.querySelectorAll(".b-feat input")][1]; wall.checked = true; wall.dispatchEvent(new window.Event("change"));
check("設備（城壁）を付けられる", burg.walls === 1);

$("builder-close").click();
check("閉じられる", $("builder-panel").hidden);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
