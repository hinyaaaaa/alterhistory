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
const pick = (a, d) => { const boxes = () => [...window.document.querySelectorAll("#tab-wars .member-picker")]; boxes()[0].querySelectorAll("input")[a].click(); boxes()[1].querySelectorAll("input")[d].click(); };

const open = (w) => { menuBtn(w).click(); return win(w); };
console.log("=== 一覧ウィンドウ（国家・文化・宗教・属州） ===");
for (const k of ["state", "culture", "religion", "province"]) {
  const w = open(`list-${k}`);
  check(`${k}一覧が開く`, !!w && !w.hidden && !!w.querySelector(".ent-body"));
}
const stRows = win("list-state").querySelectorAll(".ent-row");
check("国家一覧に行があり、🔍・統合・🗑 がある", stRows.length > 0 && [...stRows[0].querySelectorAll("button")].map((b) => b.textContent).join("|").includes("統合") && stRows[0].textContent.includes("🗑"));
check("一覧にランダム設定のボタンは無い", !win("list-state").textContent.includes("🎲"));

console.log("=== 削除（確認ダイアログ→削除→Undo） ===");
window.confirm = () => true;
const relBefore = store.getState().map.pack.religions.filter((r) => r && r.i > 0 && !r.removed).length;
const relRows = win("list-religion").querySelectorAll(".ent-row");
if (relRows.length) {
  relRows[0].querySelector(".ent-btn.danger").click();
  const relAfter = store.getState().map.pack.religions.filter((r) => r && r.i > 0 && !r.removed).length;
  check("宗教を削除できる", relAfter === relBefore - 1, `${relBefore}→${relAfter}`);
  store.undo();
  check("削除はUndoで戻る", store.getState().map.pack.religions.filter((r) => r && r.i > 0 && !r.removed).length === relBefore);
}

console.log("=== 系譜図 ===");
const g = open("genealogy-religion");
check("宗教の系譜図が描かれる（ノードと線）", g.querySelectorAll(".gen-node").length > 1 && g.querySelectorAll("svg path").length > 0);
const node = g.querySelectorAll(".gen-node")[1]; node.dispatchEvent(new window.Event("click", { bubbles: true }));
check("ノードを選ぶと編集欄（親を複数選べるチェック・名前・削除）が出る", !!win("genealogy-religion").querySelector(".gen-edit .gen-parent input[type=checkbox]") || !!win("genealogy-religion").querySelector(".gen-edit button"));

console.log("=== 通貨・為替 ===");
const cw = open("currency");
check("相場表に全国家の行がある", cw.querySelectorAll(".cur-board tr").length > 1 && cw.querySelector(".cur-code") && cw.querySelector(".cur-chg"));
check("両替の計算機がある", !!cw.querySelector(".cur-conv"));

console.log("=== 核作戦 ===");
const nw = open("nuclear");
check("核作戦ウィンドウが開く（核の保有国が無ければ案内）", !nw.hidden && nw.textContent.includes("核"));

console.log("=== 講和条約・戦争・外交 ===");
check("戦争がまだ無いときは案内が出る", open("treaty").textContent.includes("まだありません"));
const ids = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
const out = simActions.declareWarInstant([ids[0]], [ids[1]], null, "conventional");
check("宣戦布告で即判定され、名前と終戦日が付く", !!out && !!out.name && !!out.endsAt);
check("戦闘中の戦争は、講和ではなく「戦闘を進める」案内になる", open("treaty").textContent.includes("戦闘が続いています"));
simActions.finishWar(out.id); // 時間経過のかわりに最後まで進める
const tw = open("treaty");
check("講和条約ウィンドウに戦争・条約名・渡る量の表が出る", !!tw.querySelector(".treaty-form") && (!!tw.querySelector(".wo-impact table") || tw.textContent.includes("各国の消耗")));
const ww = open("war");
[...ww.querySelectorAll(".win-list button")].find((b) => b.textContent.includes(out.name))?.click(); // 戦争を選ぶと詳細（戦況）が出る
check("戦争ウィンドウに戦況バーがある", ww.querySelectorAll(".wo-bar-wrap").length === 5);
const dw = open("diplomacy");
check("外交一覧は同盟・敵対・中立だけで、Neutrals は出ない", !dw.textContent.includes("Neutrals") && dw.textContent.includes("敵対"));
check("同盟の拘束力を選べる", !!dw.querySelector(".bond-picker select"));

console.log("=== 廃止したもの ===");
check("レイヤープリセットは無い", !q("#layer-presets") && !q("[data-preset]"));
check("サイドバーの開閉ボタンは非表示", $("btn-sidebar-toggle").hidden === true || $("btn-sidebar-toggle").style.display === "none");

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
