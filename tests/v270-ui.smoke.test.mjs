// v2.7.0 の画面: 国家タブの「国勢」・技術の進捗・文化の言語（jsdom）。ビルド済み dist/app.js を動かす。
import { loadLegacyInto } from "./helpers/load-legacy.mjs";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { planMinorEvent } from "../js/core/sim/minor-events.js";

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
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const M = () => store.getState().map, win = () => q('[data-win="nation"]');
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const btnOf = (r, t) => [...r.querySelectorAll("button")].find((b) => b.textContent.includes(t));

console.log("=== 国勢（国家タブ） ===");
q('[data-open-win="nation"]').click(); await sleep(60);
win().querySelector(".nation-row.b-click").click(); await sleep(60);
const A = live()[0].i;
check("サブタブに「国勢」がある（概要の次）", [...win().querySelectorAll(".nation-tabs button")].map((b) => b.textContent).slice(0, 2).join(",") === "概要,国勢");
btnOf(win().querySelector(".nation-tabs"), "国勢").click(); await sleep(60);
check("国の状態・制約・余波・思潮の4つの欄が出る", ["cond-state", "cond-constraints", "cond-shocks", "cond-ideas"].every((f) => !!win().querySelector(`[data-field="${f}"]`)));
check("状態の棒が5本（食料・都市化・産業力・財政の余力・民意）", win().querySelectorAll('[data-field="cond-state"] .cond-row').length === 5);
check("制約に、理由の文が出る（食料・産業力・財政・三位一体）", win().querySelectorAll('[data-field="cond-constraints"] .cond-con').length === 4 && win().querySelector('[data-field="cond-constraints"]').textContent.includes("三位一体"));
check("思潮の棒が6本", win().querySelectorAll('[data-field="cond-ideas"] .cond-row').length === 6);
check("余波が無いときは、そう表示する", win().querySelector('[data-field="cond-shocks"]').textContent.includes("目立った余波はありません"));
store.commit(planMinorEvent(M(), { key: "famine", stateId: A }, { year: M().worldTime.year, month: M().worldTime.month }));
btnOf(win().querySelector(".nation-tabs"), "概要").click(); await sleep(30); btnOf(win().querySelector(".nation-tabs"), "国勢").click(); await sleep(60);
check("飢饉のあとは、余波が元の出来事つきで出る", win().querySelector('[data-field="cond-shocks"]').textContent.includes("食料: 悪化") && win().querySelector('[data-field="cond-shocks"]').textContent.includes("飢饉"));
check("食料の制約が「不足」側に動く（理由つき）", /食料/.test(win().querySelector('[data-field="cond-constraints"]').textContent));

console.log("=== 技術の進捗 ===");
btnOf(win().querySelector(".nation-tabs"), "技術ドクトリン").click(); await sleep(60);
check("技術タブに「進捗（次の段まで）」がある（6分野）", !!win().querySelector('[data-field="tech-progress"]') && win().querySelectorAll('[data-field="tech-progress"] .cond-row').length === 6);
check("段は自動では上がらないと明記されている", win().textContent.includes("押したときだけ"));

console.log("=== 月送りで新しい仕組みが動く ===");
{
  const lvs = () => JSON.stringify(live().map((s) => editActions.getTechLevel(s.i))), lv0 = lvs();
  let ok = true; try { for (let i = 0; i < 24; i++) simActions.advanceMonthly({ year: M().worldTime.year + Math.floor(i / 12), month: (i % 12) + 1 }); } catch { ok = false; }
  check("24か月進めても落ちない", ok);
  check("思潮・言語が保存される", !!M().ext.data.ideas && !!M().ext.data.languages);
  check("技術の進捗がたまり、段は変わらない", live().some((s) => s.techProgress && Object.values(s.techProgress).some((v) => v > 0)) && lvs() === lv0);
}

console.log("=== 文化の言語（編集パネル） ===");
{
  const cid = M().pack.cultures.find((c) => c && c.i > 0 && !c.removed).i;
  window.alterhistory.panels.openEntity("culture", cid); await sleep(80);
  const sec = q('[data-field="language"]');
  check("文化の詳細に「言語」の欄がある", !!sec);
  sec.open = true; sec.dispatchEvent(new window.Event("toggle")); await sleep(40);
  check("言語の欄に、音・語順・地名の例・語根辞書が出る", sec.textContent.includes("音:") && sec.textContent.includes("語順") && sec.textContent.includes("地名の例") && sec.querySelectorAll(".lang-row").length >= 50);
  const inp = sec.querySelector('[data-field="lang-river"]');
  inp.value = "ネーヴァ"; inp.dispatchEvent(new window.Event("change")); await sleep(40);
  check("語を直すと保存され、辞書にも反映される（手で直した印つき。欄は開いたまま）", editActions.languageView(cid).rows.find((r) => r.key === "river").word === "ネーヴァ" && !!q('[data-field="language"][open]') && !!q('[data-field="lang-river"]')?.classList.contains("edited"));
  inp.value = "ひらがな"; inp.dispatchEvent(new window.Event("change")); await sleep(40);
  check("不正な語は断られ、語は変わらない", editActions.languageView(cid).rows.find((r) => r.key === "river").word === "ネーヴァ");
  check("言語の見出し（見出し語の数）が60語", editActions.languageView(cid).rows.length === 60);
}

if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
process.exit(0);
