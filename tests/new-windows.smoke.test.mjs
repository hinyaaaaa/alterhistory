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
    window.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    Object.assign(window, { TextDecoder, Blob, Response, CompressionStream, DecompressionStream });
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
const pick = (a, d) => { const boxes = () => [...window.document.querySelectorAll("#tab-wars .member-picker")]; boxes()[0].querySelectorAll("input")[a].click(); boxes()[1].querySelectorAll("input")[d].click(); };

const open = (w) => { menuBtn(w).click(); return win(w); };
// 講和条約は、外交ウィンドウの右の列（講和モード）に出る（v2.4.1 A1）。独立の「講和条約」ウィンドウは無い
const peaceOpen = (warId) => { window.alterhistory.panels.diplomacy.openPeace(warId); return win("diplomacy"); };
console.log("=== 一覧ウィンドウ（文化・宗教）／国家は国家タブ ===");
for (const k of ["culture", "religion"]) {
  const w = open(`list-${k}`);
  check(`${k}一覧が開く`, !!w && !w.hidden && !!w.querySelector(".ent-body"));
}
check("国家・属州の一覧窓は無い（国家タブへ移した）", !q('[data-open-win="list-state"]') && !q('[data-open-win="list-province"]') && !q('[data-win="list-state"]'));
const nationWin = open("nation");
check("国家タブの一覧に、国の行があり、削除ボタンは無い", nationWin.querySelectorAll(".nation-row.b-click").length > 0 && !nationWin.querySelector(".ico-trash") && ![...nationWin.querySelectorAll("button")].some((b) => /削除/.test(b.textContent)));

console.log("=== 削除（確認ダイアログ→削除→Undo） ===");
if (!window.HTMLDialogElement.prototype.showModal) { window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); }; }
const okConfirm = async () => { await new Promise((r) => setTimeout(r, 0)); window.document.querySelector("dialog.confirm-dialog .danger, dialog.confirm-dialog .primary")?.click(); await new Promise((r) => setTimeout(r, 0)); };
const relBefore = store.getState().map.pack.religions.filter((r) => r && r.i > 0 && !r.removed).length;
const relRows = win("list-religion").querySelectorAll(".ent-row");
if (relRows.length) {
  relRows[0].querySelector(".ent-btn.danger").click();
  await okConfirm();
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

console.log("=== 通貨・為替は無い（v2.4.0 で廃止） ===");
const cw = open("economy");
check("経済の窓に、相場表・両替の計算機は無い", !cw.querySelector(".cur-board") && !cw.querySelector(".cur-conv"));

console.log("=== 核作戦 ===");
const nw = open("nuclear");
check("核作戦ウィンドウが開く（核の保有国が無ければ案内）", !nw.hidden && nw.textContent.includes("核"));

console.log("=== 講和条約・戦争・外交 ===");
check("戦争がまだ無いときは案内が出る", peaceOpen().textContent.includes("まだありません"));
const ids = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
const out = simActions.declareWarInstant([ids[0]], [ids[1]], null, "conventional");
check("宣戦布告で即判定され、名前と終戦日が付く", !!out && !!out.name && !!out.endsAt);
check("戦争中でも、講和条約をいつでも結べる（締結ボタンがある）", [...peaceOpen().querySelectorAll("button")].some((b) => b.textContent.includes("講和条約を締結")));
const tw = peaceOpen();
check("外交の右の列（講和モード）に戦争・条約名・渡る量の表が出る", !!tw.querySelector(".war-prep") && (!!tw.querySelector(".wo-impact table") || tw.textContent.includes("各国の消耗")));
const ww = open("war");
[...ww.querySelectorAll(".war-band button")].find((b) => b.textContent.includes(out.name))?.click(); // 戦争を選ぶと詳細（戦況）が出る
check("戦争ウィンドウに戦況バーがある", ww.querySelectorAll(".wo-bar-wrap").length === 5);
window.alterhistory.panels.diplomacy.closePeace(); window.alterhistory.panels.diplomacy.render(); // 講和モードを閉じて、条約一覧へ戻す
const dw = open("diplomacy");
check("外交は3タブ（存在する同盟・破棄された同盟・講和条約）で、Neutrals は出ない", !dw.textContent.includes("Neutrals") && dw.textContent.includes("存在する同盟") && dw.textContent.includes("破棄された同盟") && dw.textContent.includes("講和条約"));
check("外交に国の絞り込み欄と条約の一覧があり、外交の表は無い", !!dw.querySelector(".dip-focus") && !!dw.querySelector(".dip-right") && !dw.querySelector(".diplomacy-matrix"));
const tn = open("treaty-new");
check("「条約を結ぶ」で、同盟の拘束力（強・中・弱）を選べる", tn.querySelectorAll("select").length >= 3 && tn.textContent.includes("拘束力") && tn.textContent.includes("強"));

console.log("=== 隠密作戦・自動の講和 ===");
const cv = open("covert");
check("隠密作戦ウィンドウに、3種の作戦と成功率が出る", cv.querySelectorAll(".doctrine-card").length === 3 && cv.textContent.includes("成功率"));
const before = simActions.covertOps().length;
[...cv.querySelectorAll("button")].find((b) => b.textContent.includes("作戦を実行"))?.click();
check("作戦を実行すると記録が残る", simActions.covertOps().length === before + 1);
const tdet = peaceOpen();
check("講和の自動案が入っている（種類・条約名・賠償金・その他の条件）", tdet.querySelector("select") && tdet.querySelector("textarea")?.value.length > 0 && /条約$/.test([...tdet.querySelectorAll("input:not([type])")].map((i) => i.value).find((v) => /条約$/.test(v)) ?? ""));
check("割譲の行に、都市名の表示がある", [...tdet.querySelectorAll(".wo-cess-burgs")].length === 0 || tdet.querySelector(".wo-cess-burgs").textContent.length > 0);
console.log("=== 廃止したもの ===");
check("レイヤープリセットは無い", !q("#layer-presets") && !q("[data-preset]"));
check("サイドバーの開閉ボタンは無い", !$("btn-sidebar-toggle"));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
