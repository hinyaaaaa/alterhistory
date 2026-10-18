// 国家タブ（一覧・新規作成・詳細の6サブタブ・反乱ボタン）の統合テスト（jsdom）。
// 実際の index.html とビルド済み dist/app.js（npm run build 後）を動かす。
import { JSDOM } from "jsdom";
import { canRebel } from "../js/core/edit/rebellion.js";
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

console.log("=== 基本設定（旧・国家詳細から移した：国名・特色・文章・核の保有数） ===");
{
  const sA = () => M().pack.states[A];
  const basic = () => win().querySelector('details[data-field="basic"]');
  check("概要に「基本設定」がある（政体名の欄は無い）", !!basic() && !basic().textContent.includes("政体名（国名につく語）"));
  const nm = basic().querySelector('input[data-field="state-name"]');
  nm.value = "テスト改名国"; nm.dispatchEvent(new window.Event("change")); await sleep(60);
  check("国名を変えられる", (sA().fullName ?? sA().name).includes("テスト改名国") || sA().name === "テスト改名国", `${sA().fullName}|${sA().name}`);
  store.undo(); await sleep(60);
  check("Undo で国名が戻る", !(sA().fullName ?? sA().name).includes("テスト改名国"));
  const tagBox = basic().querySelector('.tl-rec-provs input[type="checkbox"]'); const tagsBefore = [...(sA().tags ?? [])];
  tagBox.checked = !tagBox.checked; tagBox.dispatchEvent(new window.Event("change")); await sleep(60);
  check("特色（タグ）を切り替えられる", JSON.stringify(sA().tags ?? []) !== JSON.stringify(tagsBefore));
  const note = win().querySelector('textarea[data-field="state-note"]');
  note.value = "テスト用の文章"; note.dispatchEvent(new window.Event("change")); await sleep(60);
  check("文章を書ける", editActions.getNote("state", A).includes("テスト用の文章"));
  btnOf(win(), "軍事")?.click(); await sleep(60);
  const nuke = win().querySelector('input[data-field="nuclear-stock"]');
  check("軍事に核の保有数の欄がある", !!nuke);
  nuke.value = "6"; nuke.dispatchEvent(new window.Event("change")); await sleep(80);
  check("核の保有数を設定でき、核作戦が読む値（simActions.nuclearStock）に反映される", simActions.nuclearStock(A) === 6, String(simActions.nuclearStock(A)));
  btnOf(win(), "概要")?.click(); await sleep(60);
}

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
const withProv = live().find((s) => canRebel(M(), s.i));
if (withProv) {
  window.alterhistory.panels.openEntity("state", withProv.i); await sleep(60);
  btnOf(win(), "大").click(); await sleep(30); btnOf(win(), "民衆蜂起・革命").click(); await sleep(30);
  const b = btnOf(win(), "反乱を起こす"); b.click(); await sleep(30);
  check("1回目の押下では起こらず、確認に変わる", !!btnOf(win(), "本当に反乱を起こす") && !M().ext?.data?.wars?.some((w) => w.type === "civil"));
  const wars0 = (M().ext?.data?.wars ?? []).length;
  btnOf(win(), "本当に反乱を起こす").click(); await sleep(150);
  const w = (M().ext?.data?.wars ?? []).at(-1);
  check("反乱で内戦（戦争）が始まる", (M().ext?.data?.wars ?? []).length === wars0 + 1 && w.type === "civil" && w.defenders[0] === withProv.i);
  const rebel = M().pack.states[w.attackers[0]];
  check("政体転覆の反乱側は、元の国と違う政体を持ち、目的が記録される", rebel.rebelGoal === "overthrow" && rebel.regime !== M().pack.states[withProv.i].regime);
  check("反乱側は領土を持ち、元の国にも領土が残る（州に縛られない）", rebel.cells > 0 && M().pack.states[withProv.i].cells > 0);
  store.undo(); await sleep(60); // 以降の検査（安定度など）に、内戦を持ち越さない
} else check("（反乱を起こせる国が無いので、反乱の検査は省略）", true);
console.log("=== A5: 支持・安定度・傀儡の種類・並べ替え・反乱の理由・Esc・強調の解除 ===");
{
  const open = (id) => { window.alterhistory.panels.openEntity("state", id); };
  const stat = (k) => [...win().querySelectorAll(".b-stat")].find((d) => d.textContent.includes(k))?.firstChild.textContent;
  const reshow = async () => { btnOf(win(), "傀儡・属州")?.click(); btnOf(win(), "概要")?.click(); await sleep(40); };
  const C = live()[0].i; open(C); await sleep(60);
  delete M().pack.states[C].support; await reshow();
  check("支持が値なしでも、既定値（70%）が出る（「—」にならない）", stat("支持") === "70%", String(stat("支持")));
  check("支持70・戦争なし・継承が安定なら「安定」", stat("安定度") === "安定", String(stat("安定度")));
  check("安定度の内訳（点数と要因）が見える", /安定度の内訳（\d+点）.*民意 70/.test(win().querySelector('[data-field="stability-why"]')?.textContent ?? ""));
  M().pack.states[C].support = 45; await reshow(); check("支持45なら「不安」", stat("安定度") === "不安", String(stat("安定度")));
  M().pack.states[C].support = 20; await reshow(); check("支持20なら「危機」", stat("安定度") === "危機", String(stat("安定度")));
  M().pack.states[C].support = 70;
  // 傀儡の種類を、あとから変えられる
  const B = live().find((x) => x.i !== C && !x.vassal)?.i;
  simActions.setVassal(B, C, "puppet"); await sleep(40); btnOf(win(), "傀儡・属州").click(); await sleep(60);
  const ks = win().querySelector('select[data-field="vassal-kind"]');
  check("従える国の行に、種類を選ぶ欄がある", !!ks && ks.value === "puppet");
  ks.value = "protectorate"; ks.dispatchEvent(new window.Event("change")); await sleep(60);
  check("種類を変えると、宗主はそのまま種類だけが変わる", M().pack.states[B].vassal?.kind === "protectorate" && M().pack.states[B].vassal?.overlord === C);
  store.undo(); await sleep(40); check("Undo で種類が戻る", M().pack.states[B].vassal?.kind === "puppet");
  // 国家一覧の並べ替え
  btnOf(win(), "◀ 国家一覧").click(); await sleep(60);
  const names = () => [...win().querySelectorAll(".nation-row.b-click .nn")].map((x) => x.textContent);
  const sortSel = win().querySelector('select[data-field="nation-sort"]');
  check("並べ替えの欄がある（登録順・名前・人口・政体）", !!sortSel && [...sortSel.options].map((o) => o.textContent).join() === "登録順,名前,人口,政体");
  sortSel.value = "name"; sortSel.dispatchEvent(new window.Event("change")); await sleep(40);
  const asc = names(); check("名前順に並ぶ", JSON.stringify(asc) === JSON.stringify([...asc].sort((a, b) => a.localeCompare(b, "ja"))), asc.join("|"));
  btnOf(win(), "▲ 昇順").click(); await sleep(40);
  check("降順に切り替えられる", JSON.stringify(names()) === JSON.stringify([...asc].reverse()));
  win().querySelector('select[data-field="nation-sort"]').value = "pop"; win().querySelector('select[data-field="nation-sort"]').dispatchEvent(new window.Event("change")); await sleep(40);
  const pops = [...win().querySelectorAll(".nation-row.b-click")].map((r) => Number(r.querySelector(".num").textContent.replace(/,/g, ""))); // いまは降順
  check("人口順（降順）に並ぶ", pops.length > 1 && pops.every((v, i) => i === 0 || pops[i - 1] >= v), pops.join(","));
  // 反乱ボタン: 州に縛られない。属州が0でも（拠点になる都市があれば）押せて、理由は出ない
  for (const p of M().pack.provinces) if (p && p.i && p.state === C && !p.removed) p.removed = true; // 属州を0に
  open(C); await sleep(60);
  check("属州が無くても、反乱は起こせる（理由が出ず、ボタンが押せる）", !win().querySelector('[data-field="rebel-why"]') && btnOf(win(), "反乱を起こす").disabled !== true);
  // Esc: 入力中はまず入力欄を抜け、もう一度で窓が閉じる。閉じたら強調も消える
  let cleared = 0; const hl = window.alterhistory.highlight; const origClear = hl.clear.bind(hl); hl.clear = () => { cleared++; origClear(); };
  btnOf(win(), "概要")?.click(); await sleep(30);
  const nameInput = win().querySelector('input[data-field="state-name"]'); win().querySelector('details[data-field="basic"]').open = true; nameInput.focus();
  check("（準備）入力欄にフォーカスがある", dom.window.document.activeElement === nameInput);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(30);
  check("入力中のEscは、窓を閉じず入力欄を抜ける", !win().hidden && dom.window.document.activeElement !== nameInput);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(30);
  check("もう一度Escを押すと、国家タブが閉じる", win().hidden === true);
  check("閉じると、地図の領土の強調が必ず解除される", cleared >= 1, String(cleared));
}

console.log("=== A7: ドクトリンの「上限に達している」表示 ===");
{
  const { TREE_NODES } = await import("../js/core/edit/doctrines.js");
  const T = live().find((x) => !x.removed)?.i ?? A; window.alterhistory.panels.openEntity("state", T); await sleep(60);
  btnOf(win(), "軍事")?.click(); await sleep(60);
  check("節が少ないうちは「上限に達している」と出ない", !win().querySelector(".np-capped-note") && !win().querySelector(".np-node.capped"));
  editActions.setMilitaryDoctrine(T, { nodes: TREE_NODES.map((n) => n.key) }); await sleep(60);
  btnOf(win(), "技術ドクトリン")?.click(); btnOf(win(), "軍事")?.click(); await sleep(60);
  const note = win().querySelector('[data-field="doctrine-capped"]');
  check("選べる節を全部選ぶと、上限に達している効果が画面に出る", !!note && note.textContent.includes("上限に達している") && /守り|歩兵|砲兵|機甲|攻め/.test(note.textContent), note?.textContent);
  check("上限に達した効果に関わる選択中の節が、点線（capped）で示される", win().querySelectorAll(".np-node.on.capped").length > 0);
  editActions.setMilitaryDoctrine(T, { nodes: [] }); await sleep(40);
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
