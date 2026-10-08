// 時間進行・軍事・外交UIの統合テスト（jsdom）。実際の index.html とビルド済み dist/app.js を動かす。
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = process.env.SAMPLES_DIR ?? "tests/.samples";
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } console.log(`  (待機タイムアウト: ${label})`); return false; }

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
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => [...window.document.querySelectorAll(sel)];

// alert()/confirm()/prompt() の代替として js/ui/dialogs.js が作る .confirm-dialog を、
// 開いたら自動でOKを押す（常に「はい」を選んだことにする）。テスト実行前に一度だけ仕込めばよい。
// prompt 相当（入力欄あり）に答える文字列は window.__nextPromptAnswer で指定できる（既定は「新しい村」）。
new window.MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === 1 && node.matches?.(".confirm-dialog")) {
        const input = node.querySelector(".confirm-dialog-input");
        if (input) input.value = window.__nextPromptAnswer ?? "新しい村";
        const buttons = [...node.querySelectorAll(".confirm-dialog-actions button")];
        const ok = buttons.at(-1); // buildDialog は cancel を先、OKを最後に追加する
        Promise.resolve().then(() => ok?.click());
      }
    }
  }
}).observe(window.document.body, { childList: true });

const ready = await waitFor(() => window.alterhistory, 8000, "アプリ起動");
check("アプリが起動する", ready);
if (!ready) process.exit(1);
const { store, viewport, timeActions, simActions } = window.alterhistory;
const errors = []; window.addEventListener("error", (e) => errors.push(e.message));

console.log("=== 地図を開く ===");
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([readFileSync(`${SAMPLES}/境界線の貴方.map`)], "境界線の貴方.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("読み込みが完了する", await waitFor(() => store.getState().map, 15000, "読み込み"));
viewport.fit();
const map = store.getState().map;

console.log("=== 時間バー ===");
check("初期の年月表示", $("world-date").textContent === "1年 1月");
check("開始ボタンが有効", $("btn-time-toggle").disabled === false);
$("btn-time-step").click();
check("+1ヶ月で月が進む", $("world-date").textContent === "1年 2月");
check("store.map.worldTimeも進む", store.getState().map.worldTime.month === 2);
for (let i = 0; i < 11; i++) $("btn-time-step").click();
check("年をまたぐと2年になる", store.getState().map.worldTime.year === 2 && store.getState().map.worldTime.month === 1, JSON.stringify(store.getState().map.worldTime));

console.log("=== 開始/停止 ===");
check("最初は停止表示", $("btn-time-toggle").textContent.includes("▶"));
$("btn-time-toggle").click();
check("開始すると表示が変わる", $("btn-time-toggle").textContent.includes("⏸") && timeActions.isRunning());
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
check("[Space]で停止する", !timeActions.isRunning() && $("btn-time-toggle").textContent.includes("▶"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
check("[Space]でもう一度開始する", timeActions.isRunning());
timeActions.stop();

console.log("=== 速度変更 ===");
$("sel-time-speed").value = "20000"; $("sel-time-speed").dispatchEvent(new window.Event("change"));
check("速度が変わる(1年20秒 = 1ヶ月約1.67秒)", Math.abs(timeActions.getSpeed() - 20000 / 12) < 1);

console.log("=== 国家タブを開く（地図のダブルクリック） ===");
function cellOfState(stateId) {
  for (let i = 0; i < map.pack.cells.state.length; i++) if (map.pack.cells.state[i] === stateId && !map.pack.cells.burg[i]) return i;
  return -1;
}
function openStateTab(stateId) {
  const cell = cellOfState(stateId);
  const [sx, sy] = viewport.toScreen(map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1]);
  $("map-canvas").dispatchEvent(new window.MouseEvent("dblclick", { clientX: sx, clientY: sy, button: 0, bubbles: true }));
}
const state1 = map.pack.states.find((s) => s && s.i && !s.removed);
openStateTab(state1.i);
check("国家タブが開く（選択ツールに切替済みであること）", !$("editor-panel").hidden);
function clickSubtab(label) { const b = qa(".dialog-tabs .tab-btn").find((x) => x.textContent.includes(label)); b?.click(); return b; }
// 国家の詳細画面のサブタブは「基本情報」と「属州」だけ（軍事・外交・戦争は専用ウィンドウへ移した）。
// 部隊編成・同盟・宣戦布告・戦闘記録は war-window / new-windows / war-flow の各テストで検証する。
{
  const labels = qa(".dialog-tabs .tab-btn").map((b) => b.textContent.trim());
  check("国家画面のサブタブに軍事・外交・戦争が残っていない", !labels.some((l) => /軍事|外交|戦争/.test(l)), labels.join(","));
}

console.log("=== 時間設定（年月の上書き・時代区分） ===");
$("world-date").click();
const tsd = q(".time-settings-dialog");
check("年月表示をクリックすると時間設定ダイアログが開く", !!tsd && tsd.hasAttribute("open"));
const numIns = [...tsd.querySelectorAll('.time-settings-row input[type="number"]')];
numIns[0].value = "1700"; numIns[1].value = "6";
[...tsd.querySelectorAll("button")].find((b) => b.textContent.includes("この年月に設定")).click();
const wt = store.getState().map.worldTime;
check("年月を直接上書きできる（1ヶ月ずつ進める以外の手段）", wt.year === 1700 && wt.month === 6, JSON.stringify(wt));
check("上部バーの表示にも反映される", $("world-date").textContent.includes("1700年 6月"), $("world-date").textContent);
$("btn-time-step").click();
check("上書きした年月から進行が続く", store.getState().map.worldTime.year === 1700 && store.getState().map.worldTime.month === 7);
tsd.querySelector('input[placeholder^="時代の名前"]').value = "江戸時代";
tsd.querySelector('input[placeholder="開始年"]').value = "1603";
[...tsd.querySelectorAll("button")].find((b) => b.textContent.includes("時代を追加")).click();
check("時代を追加すると一覧に出る", tsd.querySelector(".era-list").textContent.includes("江戸時代（1603年〜）"));
check("今の年が属する時代名が上部バーに併記される", !!q("#world-date .era-name") && q("#world-date .era-name").textContent === "江戸時代");
numIns[0].value = "1500";
[...tsd.querySelectorAll("button")].find((b) => b.textContent.includes("この年月に設定")).click();
check("時代の開始前の年では時代名が消える", !q("#world-date .era-name"));
[...tsd.querySelectorAll("button")].find((b) => b.textContent === "閉じる").click();
check("閉じるでダイアログが消える", !q(".time-settings-dialog"));

check("スクリプトエラーなし", errors.length === 0, errors.join("|"));
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
window.close();
process.exit(failed ? 1 : 0);
