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


// 国の1つを空き地にしておく（おまかせ領土の検査用）
{
  const m = store.getState().map; const cells = [];
  for (let i = 0; i < m.pack.cells.state.length; i++) if (m.pack.cells.state[i] === 6) cells.push(i);
  window.alterhistory.editActions.paintCells("state", 0, cells);
}
const states = () => store.getState().map.pack.states.filter((s) => s && s.i && !s.removed);

console.log("=== 開く ===");
check("初めはビルダーが閉じている", $("builder-panel").hidden);
$("btn-builder").click();
check("ボタンで開く", !$("builder-panel").hidden);
check("かんたん作成の3ボタン", window.document.querySelectorAll(".b-quick-btn").length === 3);
check("詳しい設定は初期状態で畳まれている", window.document.querySelectorAll(".b-details").length === 0);

console.log("=== 国を建てる（1クリック） ===");
const before = states().length;
q(".b-quick-btn").click();
await waitFor(() => q(".b-task"), 2000, "作業カード");
check("国が1つ増える", states().length === before + 1);
const made = states().at(-1);
check("名前はカタカナの仮の名前", /[ァ-ヴー]/.test(made.fullName ?? made.name));
check("「仮」の印が付く", window.alterhistory.editActions.isProvisional("state", made.i));
check("作業カードが出る", !!q(".b-task"));
check("塗るツールに切り替わり、塗り先が新しい国", store.getState().editTool === "paint:state");

console.log("=== おまかせで領土 ===");
q(".b-how .b-seg:nth-child(2)").click();
await waitFor(() => (store.getState().map.pack.states[made.i].cells ?? 0) > 0, 2000, "領土");
check("セルが塗られる", store.getState().map.pack.states[made.i].cells > 0, `${store.getState().map.pack.states[made.i].cells}セル`);

console.log("=== 完了（首都を自動で置く） ===");
q(".b-actions .primary").click();
await waitFor(() => !q(".b-task"), 2000, "完了");
const done = store.getState().map.pack.states[made.i];
check("作業カードが消える", !q(".b-task"));
check("ツールが選択に戻る", store.getState().editTool === "select");
check("首都が置かれ、仮の名前", done.capital > 0 && window.alterhistory.editActions.isProvisional("burg", done.capital));

console.log("=== 凡例が最新になる ===");
check("凡例に新しい国が出る", [...window.document.querySelectorAll(".legend-name")].some((n) => n.textContent === (made.fullName ?? made.name)));

console.log("=== 詳しく（任意） ===");
const card = q(".b-card");
card.querySelector(".b-more-btn").click();
await waitFor(() => q(".b-details"), 1000, "詳細");
check("開くと技術水準・ドクトリン・首都が出る", !!q(".b-details input[type=range]") && q(".b-details").querySelectorAll("select").length >= 2);
const tech = q(".b-details input[type=range]"); tech.value = "7"; tech.dispatchEvent(new window.Event("change"));
check("技術水準を変えられる（これまでUIが無かった）", window.alterhistory.editActions.getTechLevel(made.i) === 7);

console.log("=== 仮決定は廃止 ===");
check("仮の名前トレイは出ない", !q(".b-tray"));
check("「仮」の印も確定ボタンも出ない", !q(".b-badge") && !q(".b-tray .primary"));

console.log("=== やめる ===");
const n0 = states().length;
q(".b-quick-btn").click();
await waitFor(() => q(".b-task"), 1500, "作業カード2");
check("国がもう1つ増える", states().length === n0 + 1);
[...window.document.querySelectorAll(".b-actions button")].find((b) => b.textContent === "やめる").click();
await waitFor(() => !q(".b-task"), 1500, "やめる");
check("やめると作成前に戻る", states().length === n0);

console.log("=== 名前の雰囲気を指定 ===");
const det = q(".b-more"); det.open = true;
const sel = det.querySelector("select"); sel.value = "yamato"; sel.dispatchEvent(new window.Event("change"));
check("雰囲気を選べる", sel.value === "yamato");
q(".b-quick-btn:nth-child(2)").click();
await waitFor(() => q(".b-task"), 1500, "宗教");
check("宗教が作られる", q(".b-task-kind").textContent.includes("宗教"));
check("塗っている間は宗教の色分けに切り替わる", (({ religions, states, cultures, provinces }) => religions === true && !states && !cultures && !provinces)(store.getState().view));
{
  const rel = store.getState().map.pack.religions.filter((r) => r && r.i && !r.removed).at(-1);
  check("指定した雰囲気（和風）の名前になる", /^[ァ-ヴー]+/.test(rel.name) && ["ヤマ","カワ","ミズ","タケ","シラ","クロ","アオ","ハナ","トヨ","アサ","ナラ","ミナ","サク","ホタ","イズ","ツキ"].some((h) => (rel.name + (rel.deity ?? "")).includes(h)), rel.name + "/" + (rel.deity ?? ""));
}

[...window.document.querySelectorAll(".b-actions button")].find((b) => b.textContent === "完了").click();
await waitFor(() => !q(".b-task"), 1500, "宗教の完了");
check("終わると元の色分け（国家）に戻る", (({ religions, states }) => states === true && !religions)(store.getState().view));

$("builder-close").click();
check("閉じられる", $("builder-panel").hidden);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
