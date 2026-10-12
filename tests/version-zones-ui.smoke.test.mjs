// 版の表示・詳細設定・年表のゾーン操作（疫病・災害の一時表示）の統合テスト（jsdom）。
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
const { store, viewport, editActions } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));

const qa = (sel) => [...window.document.querySelectorAll(sel)];
const wins = window.alterhistory.wins;
const M = () => store.getState().map;
const win = (id) => q(`[data-win="${id}"]`);
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const sOpt = M().pack.states.filter((s) => s && s.i > 0 && !s.removed);

console.log("=== 詳細設定と版の表示 ===");
wins.open("settings"); await sleep(50);
const sw = win("settings");
check("詳細設定に、バランス調整・時間と時代区分・データ検査・このアプリについて がある", ["バランス調整", "時間・時代区分", "データ検査", "このアプリについて"].every((t) => sw.textContent.includes(t)));
check("「このアプリについて」に「v2.3.0 内戦と検査」と出る", sw.querySelector(".about-version").textContent === "v2.3.0 内戦と検査");
clickBtn(sw, "検査を実行する").click(); await sleep(30);
check("データ検査を実行できる", !sw.querySelector(".settings-check").hidden && sw.querySelector(".settings-check").textContent.length > 0);
clickBtn(sw, "バランス調整を開く").click(); await sleep(30);
check("詳細設定からバランス調整の窓を開ける", wins.isOpen("balance"));
wins.close("balance"); wins.close("settings");

console.log("=== 年表の「＋ 出来事を記録」: 疫病・災害のゾーン ===");
wins.open("timeline"); await sleep(80);
const tl = win("timeline");
const rec = tl.querySelector(".tl-rec"); rec.open = true;
const [rType, rScope, rState, rPeriod] = rec.querySelectorAll("select");
check("種類は8つ（疫病・地震・洪水・飢饉・干ばつ・火山・大火・嵐）", rType.options.length === 8 && ["疫病", "地震", "洪水", "飢饉", "干ばつ", "火山", "大火", "嵐"].every((l) => [...rType.options].some((o) => o.textContent === l)));
check("範囲は「国全体」「属州を選ぶ」、期間は5択", [...rScope.options].map((o) => o.textContent).join() === "国全体,属州を選ぶ" && [...rPeriod.options].map((o) => o.textContent).join() === "3か月,半年,1年,2年,5年");
const z0 = (M().zones ?? []).length, h0 = (M().ext?.data?.historyLog ?? []).length;
check("確定するまで、何も残らない（ゾーンも年表も増えない）", z0 === (M().zones ?? []).length && h0 === (M().ext?.data?.historyLog ?? []).length);
rType.value = "Disease"; rState.value = String(sOpt[0].i); rPeriod.value = "6";
clickBtn(rec, "記録する").click(); await sleep(80);
const zone = M().zones.at(-1);
check("確定すると、ゾーンが期間つきでできる", M().zones.length === z0 + 1 && zone.type === "Disease" && zone.endAt && !!zone.zid);
const logLast = M().ext.data.historyLog.at(-1);
check("年表に1件（「〇〇で疫病が発生」）が残る", M().ext.data.historyLog.length === h0 + 1 && logLast.title.endsWith("で疫病が発生") && logLast.zoneId === zone.zid);
await sleep(50);
const row = qa('[data-win="timeline"] .tl-row').find((r) => r.textContent.includes("で疫病が発生"));
check("年表に、ゾーンつきの項目が出る", !!row && row.classList.contains("tl-zone"));
row.click(); await sleep(50);
check("項目をクリックすると、そのゾーンの輪郭が強調される（地図がその範囲へ移る）", store.getState().view.zoneFocus === zone.zid);
check("ゾーンの一覧・追加・編集の窓は無い", !win("zones") && !qa("[data-open-win]").some((b) => /zone|travel/.test(b.dataset.openWin)));
wins.close("timeline");
check("年表を閉じると、強調は消える", store.getState().view.zoneFocus == null);
check("旅の機能は画面に残っていない（旅の窓・ハブの項目・レイヤー）", !win("travel") && !q('[data-open-win="travel"]') && !q('[data-layer="journeys"]'));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
dom.window.close();
process.exit(failed ? 1 : 0);
