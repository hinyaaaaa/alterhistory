// 反乱・独立ウィンドウ（属州の「反乱・独立…」→ 属州を選ぶ → 確定）の統合テスト（jsdom）。
import { loadLegacyInto } from "./helpers/load-legacy.mjs";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { canRebel } from "../js/core/edit/rebellion.js";
import { listWars } from "../js/core/edit/wars.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } console.log(`  (待機タイムアウト: ${label})`); return false; }
function fakeCtx() { const props = {}; return new Proxy({}, { get(_, k) { if (k in props) return props[k]; if (k === "measureText") return (t) => ({ width: String(t).length * 8 }); return () => {}; }, set(_, k, v) { props[k] = v; return true; } }); }
const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  beforeParse(window) {
    window.devicePixelRatio = 1;
    window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = function () { return (this.__ctx ??= fakeCtx()); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {}; window.Element.prototype.releasePointerCapture = () => {}; window.Element.prototype.hasPointerCapture = () => false;
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));
// 通知ダイアログは、開いたら内容を記録して OK を押す
const alerts = [];
new window.MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.(".confirm-dialog")) { alerts.push(n.textContent); Promise.resolve().then(() => [...n.querySelectorAll(".confirm-dialog-actions button")].at(-1)?.click()); } }).observe(window.document.body, { childList: true });

check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);

// 反乱を起こせる国（首都のほかに、拠点になる都市のある国）
const parent = live().find((s) => canRebel(M(), s.i));
check("反乱を起こせる国がある", !!parent);
if (parent) {
  const n0 = live().length, w0 = listWars(M()).length;
  const win = () => q('[data-win="rebellion"]');

  console.log("=== ウィンドウを開く（州を選ぶ欄は無い。種類と規模を選ぶ） ===");
  window.alterhistory.openRebellion({ stateId: parent.i });
  check("ウィンドウが開く", await waitFor(() => win() && !win().hidden, 2000, "開く"));
  check("反乱の種類が5つあり、規模を選べる。属州のチェックは無い", win().querySelectorAll('[data-field="rebel-type"] option').length === 5 && win().querySelectorAll('[data-field="rebel-scale"] option').length === 3 && win().querySelectorAll('input[type="checkbox"]').length === 0);
  check("開いただけでは何も起きない", live().length === n0 && listWars(M()).length === w0);

  console.log("=== キャンセルすると何も起きない ===");
  clickBtn(win(), "キャンセル").click();
  check("キャンセルで閉じ、何も起きない", win().hidden && live().length === n0 && listWars(M()).length === w0);

  console.log("=== 内戦で分離する ===");
  window.alterhistory.openRebellion({ stateId: parent.i });
  await waitFor(() => win() && !win().hidden, 2000, "再び開く");
  const ts = win().querySelector('[data-field="rebel-type"]'); ts.value = "independence"; ts.dispatchEvent(new window.Event("change"));
  win().querySelector(".name-row input").value = "離反共和国";
  clickBtn(win(), "反乱を起こす").click();
  check("新しい国が増え、内戦が始まる", await waitFor(() => live().length === n0 + 1 && listWars(M()).length === w0 + 1, 3000, "反乱"));
  const born = live().at(-1);
  check("名前・分離元が入り、ウィンドウは閉じる", born.fullName === "離反共和国" && born.parentState === parent.i && born.rebelType === "independence" && win().hidden);
  check("内戦（戦争）として記録され、名前は型に合う史実風（〇〇独立戦争）", listWars(M()).at(-1).type === "civil" && listWars(M()).at(-1).attackers.includes(born.i) && /独立戦争$/.test(listWars(M()).at(-1).name));
  check("結果が通知される", await waitFor(() => alerts.some((t) => t.includes("離反共和国") && t.includes("内戦")), 2000, "通知"));
  store.undo();
  check("Undo 1回で全部戻る", live().length === n0 && listWars(M()).length === w0);
}
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
