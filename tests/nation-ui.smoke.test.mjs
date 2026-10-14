// 国家タブ（一覧・新規作成・詳細の6サブタブ・反乱ボタン）の統合テスト（jsdom）。
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
const { store, editActions, simActions } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const M = () => store.getState().map, win = () => q('[data-win="nation"]');
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const btnOf = (root, t) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(t));

console.log("=== 一覧（最初の画面） ===");
q('[data-open-win="nation"]').click(); await sleep(60);
check("国家を押すと、最初に国家一覧が開く", !win().hidden && !!win().querySelector(".nation-list") && !win().querySelector(".nation-detail"));
check("一覧に「新規作成」「統合」があり、削除は無い", !!btnOf(win(), "新規作成") && !!btnOf(win(), "統合") && ![...win().querySelectorAll("button")].some((b) => /削除/.test(b.textContent)));
check("国の行がある（政体・指導者・人口）", win().querySelectorAll(".nation-row.b-click").length === live().length);
check("指導者のいない国には、開いたとき初代が置かれる", live().every((s) => M().ext.data.leaders?.[s.i]?.current));

console.log("=== 詳細 ===");
win().querySelector(".nation-row.b-click").click(); await sleep(60);
const A = live()[0].i;
check("国を選ぶと同じ窓で詳細に切り替わり、「◀ 国家一覧」で戻れる", !!win().querySelector(".nation-detail") && !!btnOf(win(), "◀ 国家一覧"));
check("左上に指導者の顔、国家情報（人口・支持・安定度・国庫）、政体がある", !!win().querySelector(".nation-leader .face-svg") && ["人口", "支持", "安定度", "国庫", "政体"].every((t) => win().querySelector(".nation-info").textContent.includes(t)));
check("サブタブは 概要/軍事/技術ドクトリン/傀儡・属州/内政・税/工作", ["概要", "軍事", "技術ドクトリン", "傀儡・属州", "内政・税", "工作"].every((t) => !!btnOf(win().querySelector(".nation-tabs"), t)) && !btnOf(win().querySelector(".nation-tabs"), "外交"));
check("概要に宣戦布告と反乱がある", win().textContent.includes("宣戦布告") && win().textContent.includes("反乱を起こす"));

console.log("=== 政体 ===");
const regSel = win().querySelector(".nation-regime select");
check("政体は1つのリストから選ぶ（政体名の別項目は無い）", regSel.options.length >= 12 && !win().textContent.includes("政体名"));
regSel.value = "party"; regSel.dispatchEvent(new window.Event("change")); await sleep(60);
check("政体を変えると、form と表示名も同時に変わる", M().pack.states[A].regime === "party" && M().pack.states[A].formName === "党独裁（社会主義）" && M().pack.states[A].form === "Republic");

console.log("=== 軍事ドクトリン・技術ドクトリン ===");
btnOf(win().querySelector(".nation-tabs"), "軍事").click(); await sleep(40);
check("軍事に、軍の編成（表示のみ）と、陸・海・空のドクトリンの木がある", win().textContent.includes("表示のみ") && win().querySelectorAll(".np-node").length >= 54 / 3 * 3 + 3);
const node = win().querySelector(".np-cell .np-node"); node.click(); await sleep(60);
check("ドクトリンは解禁条件なしで選べる", M().pack.states[A].doctrineNodes?.length === 1);
btnOf(win().querySelector(".nation-tabs"), "技術ドクトリン").click(); await sleep(40);
check("技術ドクトリンに6分野の木がある", win().querySelectorAll(".np-track").length === 6);
const step10 = [...win().querySelectorAll(".np-track")][1].querySelectorAll(".np-step")[9]; step10.click(); await sleep(60);
check("段を選ぶと、技術水準が導かれて変わる（自動進行は無い）", editActions.getTechDoctrine(A).ind === 10 && editActions.getTechLevel(A) >= 3);

console.log("=== 傀儡・属州 / 内政・税 / 工作 ===");
for (const t of ["傀儡・属州", "内政・税", "工作"]) { btnOf(win().querySelector(".nation-tabs"), t).click(); await sleep(60); check(`${t}が開く`, !win().querySelector(".nation-pane").textContent.includes("エラー") && win().querySelector(".nation-pane").children.length > 0); }
check("工作では、標的の国を選べる（外交経由ではない）", win().textContent.includes("標的の国"));

console.log("=== 新規作成（領土 → 指導者 → 政体 → ドクトリン → 技術ドクトリン） ===");
btnOf(win(), "◀ 国家一覧").click(); await sleep(40);
const n0 = live().length;
btnOf(win(), "新規作成").click(); await sleep(40);
check("ステップが5つ並ぶ", win().querySelectorAll(".np-crumb").length === 5);
const nameInput = win().querySelector(".np-pane input");
check("国名はランダム生成が初期値", nameInput.value.length > 0);
btnOf(win(), "次へ").click(); await sleep(30);
btnOf(win(), "女性").click(); await sleep(30);
check("指導者の性別を選べ、女性なら名前が作り直される", win().querySelector(".np-pane input").value.includes("・") && !!win().querySelector(".np-face .face-svg"));
btnOf(win(), "次へ").click(); await sleep(30);
win().querySelectorAll(".np-regime")[7].click(); await sleep(30);
btnOf(win(), "次へ").click(); await sleep(30);
btnOf(win(), "次へ").click(); await sleep(30);
btnOf(win(), "建国する").click(); await sleep(150);
check("建国すると国が1つ増える", live().length === n0 + 1);
const N = live().at(-1), rec = M().ext.data.leaders[N.i].current;
check("指導者は女性で、称号と名前が揃う", rec.gender === "f" && /女|母/.test(rec.title));
check("選んだ政体（大統領制）が入る", N.regime === "presidential" && N.formName === "大統領制共和国");
check("作成後は、その国の詳細が開く", !!win().querySelector(".nation-detail"));

console.log("=== 反乱ボタン ===");
const withProv = live().find((s) => M().pack.provinces.filter((p) => p && !p.removed && p.i > 0 && p.state === s.i).length >= 2);
if (withProv) {
  window.alterhistory.panels.openEntity("state", withProv.i); await sleep(60);
  btnOf(win(), "大").click(); await sleep(30); btnOf(win(), "政体転覆").click(); await sleep(30);
  const b = btnOf(win(), "反乱を起こす"); b.click(); await sleep(30);
  check("1回目の押下では起こらず、確認に変わる", !!btnOf(win(), "本当に反乱を起こす") && !M().ext?.data?.wars?.some((w) => w.type === "civil"));
  const wars0 = (M().ext?.data?.wars ?? []).length;
  btnOf(win(), "本当に反乱を起こす").click(); await sleep(150);
  const w = (M().ext?.data?.wars ?? []).at(-1);
  check("反乱で内戦（戦争）が始まる", (M().ext?.data?.wars ?? []).length === wars0 + 1 && w.type === "civil" && w.defenders[0] === withProv.i);
  const rebel = M().pack.states[w.attackers[0]];
  check("政体転覆の反乱側は、元の国と違う政体を持ち、目的が記録される", rebel.rebelGoal === "overthrow" && rebel.regime !== M().pack.states[withProv.i].regime);
  check("反乱側は連結した複数の属州を持ち、元の国にも領土が残る", rebel.cells > 0 && M().pack.states[withProv.i].cells > 0);
} else check("（属州が2つ以上ある国が無いので、反乱の検査は省略）", true);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
