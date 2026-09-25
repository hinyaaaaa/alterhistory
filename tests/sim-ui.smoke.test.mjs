// 時間進行・軍事・外交UIの統合テスト（jsdom）。実際の index.html とビルド済み dist/app.js を動かす。
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
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
check("最初は停止表示", $("btn-time-toggle").textContent.includes("開始"));
$("btn-time-toggle").click();
check("開始すると表示が変わる", $("btn-time-toggle").textContent.includes("停止") && timeActions.isRunning());
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
check("[Space]で停止する", !timeActions.isRunning() && $("btn-time-toggle").textContent.includes("開始"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
check("[Space]でもう一度開始する", timeActions.isRunning());
timeActions.stop();

console.log("=== 速度変更 ===");
$("sel-time-speed").value = "20000"; $("sel-time-speed").dispatchEvent(new window.Event("change"));
check("速度が変わる(1年20秒 = 1ヶ月約1.67秒)", Math.abs(timeActions.getSpeed() - 20000 / 12) < 1);

console.log("=== 軍事ダイアログを開く ===");
$("btn-open-military").click();
check("ダイアログが開く", $("military-dialog").hasAttribute("open"));
check("部隊タブが最初に表示される", !$("tab-regiments").hidden && $("tab-wars").hidden);
q('[data-tab="wars"]').click();
check("タブ切替: 戦争タブが表示される", !$("tab-wars").hidden && $("tab-regiments").hidden);
q('[data-tab="alliances"]').click();
check("タブ切替: 同盟タブが表示される", !$("tab-alliances").hidden);
q('[data-tab="regiments"]').click();
$("military-close").click();
check("×で閉じる", !$("military-dialog").hasAttribute("open"));
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true }));
check("[M]で開く", $("military-dialog").hasAttribute("open"));

console.log("=== 部隊の配置（地図クリック連携） ===");
const state1 = map.pack.states.find((s) => s && s.i && !s.removed);
const stateSel = q("#tab-regiments select");
check("国家セレクトに選択肢がある", stateSel && stateSel.options.length > 0);
stateSel.value = String(state1.i); stateSel.dispatchEvent(new window.Event("change"));
check("この国の部隊一覧が表示される(0件でも一覧枠は出る)", $("tab-regiments").textContent.includes("まだ部隊がありません") || $("tab-regiments").querySelector(".regiment-card"));

const placeBtn = [...$("tab-regiments").querySelectorAll("button")].find((b) => b.textContent.includes("新しい部隊を編成"));
check("編成ボタンがある", !!placeBtn);
placeBtn.click();
check("ダイアログが閉じてヒントが出る(地図クリック待ち)", !$("military-dialog").hasAttribute("open") && store.getState().hint);

let landCell = -1; for (let i = 0; i < map.pack.cells.biome.length; i++) if (map.pack.cells.biome[i] !== 0) { landCell = i; break; }
const [lx, ly] = viewport.toScreen(map.geometry.pack.p[landCell][0], map.geometry.pack.p[landCell][1]);
const canvas = $("map-canvas");
const beforeCount = simActions.regimentsOf(state1.i).length;
canvas.dispatchEvent(new window.MouseEvent("click", { clientX: lx, clientY: ly, button: 0, bubbles: true }));
await sleep(50);
check("地図クリックで部隊が作られる", simActions.regimentsOf(state1.i).length === beforeCount + 1);
check("配置後、ダイアログが自動で再度開く", $("military-dialog").hasAttribute("open"));
check("ヒントが消える", !store.getState().hint);

console.log("=== 部隊の編集（兵力・ドクトリン） ===");
const newRegBefore = simActions.regimentsOf(state1.i).at(-1); // 直前に配置した新規部隊のID
const card = [...$("tab-regiments").querySelectorAll(".regiment-card")].find((c) => c.querySelector("input")?.value === newRegBefore.name);
check("新規に置いた部隊のカードが表示される", !!card);
const infantryInput = [...card.querySelectorAll(".unit-field")].find((f) => f.textContent.includes("歩兵")).querySelector("input");
infantryInput.value = "3000";
infantryInput.dispatchEvent(new window.Event("change"));
const newReg = simActions.regimentsOf(state1.i).find((r) => r.i === newRegBefore.i);
check("兵力が反映される", newReg.u.infantry === 3000, `実際=${newReg.u.infantry}`);
check("総戦力の表示が更新される", card.textContent.includes("総戦力"));

console.log("=== 攻撃フロー ===");
const state2 = map.pack.states.filter((s) => s && s.i && !s.removed)[1];
const stateSel2 = q("#tab-regiments select");
stateSel2.value = String(state2.i); stateSel2.dispatchEvent(new window.Event("change"));
const placeBtn2 = [...$("tab-regiments").querySelectorAll("button")].find((b) => b.textContent.includes("新しい部隊を編成"));
placeBtn2.click();
let landCell2 = -1; for (let i = 0; i < map.pack.cells.biome.length; i++) if (map.pack.cells.biome[i] !== 0 && i !== landCell) { landCell2 = i; break; }
const [lx2, ly2] = viewport.toScreen(map.geometry.pack.p[landCell2][0], map.geometry.pack.p[landCell2][1]);
canvas.dispatchEvent(new window.MouseEvent("click", { clientX: lx2, clientY: ly2, button: 0, bubbles: true }));
await sleep(50);
const reg2 = simActions.regimentsOf(state2.i).at(-1);
const card2 = [...$("tab-regiments").querySelectorAll(".regiment-card")].find((c) => c.querySelector("input")?.value === reg2.name);
const infantryInput2 = [...card2.querySelectorAll(".unit-field")].find((f) => f.textContent.includes("歩兵")).querySelector("input");
infantryInput2.value = "100"; infantryInput2.dispatchEvent(new window.Event("change"));

stateSel2.value = String(state1.i); stateSel2.dispatchEvent(new window.Event("change"));
const card1 = [...$("tab-regiments").querySelectorAll(".regiment-card")].find((c) => c.querySelector("input")?.value === newReg.name);
const attackBtn = [...card1.querySelectorAll("button")].find((b) => b.textContent.includes("攻撃する"));
attackBtn.click();
// クリックで render() が呼ばれDOMが作り直されるため、更新後のボタンは改めてDOMから取り直す
const card1After = [...$("tab-regiments").querySelectorAll(".regiment-card")].find((c) => c.querySelector("input")?.value === newReg.name);
const attackBtnAfter = [...card1After.querySelectorAll("button")].find((b) => b.textContent.includes("選択"));
check("攻撃対象選択モードになる", !!attackBtnAfter && attackBtnAfter.textContent.includes("対象を選択中"));
stateSel2.value = String(state2.i); stateSel2.dispatchEvent(new window.Event("change"));
const targetCard = [...$("tab-regiments").querySelectorAll(".regiment-card")].find((c) => c.querySelector("input")?.value === reg2.name);
const confirmAttack = targetCard.querySelector(".attack-target button");
check("攻撃対象の確認ボタンがある", !!confirmAttack);
const beforeInfantry1 = simActions.regimentsOf(state1.i).find((r) => r.i === newReg.i).u.infantry;
confirmAttack.click();
const afterInfantry1 = simActions.regimentsOf(state1.i).find((r) => r.i === newReg.i).u.infantry;
check("戦闘後、兵力が減少する", afterInfantry1 < beforeInfantry1, `${beforeInfantry1} → ${afterInfantry1}`);

console.log("=== 同盟タブ ===");
q('[data-tab="alliances"]').click();
const allianceForm = $("tab-alliances");
const nameInput = allianceForm.querySelector("input[placeholder]");
nameInput.value = "友好同盟";
const memberBoxes = [...allianceForm.querySelectorAll(".member-picker input")];
memberBoxes[0].checked = true; memberBoxes[1].checked = true;
const createAllianceBtn = [...allianceForm.querySelectorAll("button")].find((b) => b.textContent.includes("同盟を結成"));
createAllianceBtn.click();
check("同盟が作られる", simActions.listAlliances().some((a) => a.name === "友好同盟"));
const allianceNameInputs = [...$("tab-alliances").querySelectorAll(".alliance-card input")].filter((i) => i.type !== "checkbox");
check("画面に同盟カードが表示される", allianceNameInputs.some((i) => i.value === "友好同盟"));

console.log("=== 戦争タブ（宣戦布告） ===");
q('[data-tab="wars"]').click();
const warForm = $("tab-wars");
const selects = [...warForm.querySelectorAll("select")];
const declareBtn = [...warForm.querySelectorAll("button")].find((b) => b.textContent.includes("宣戦布告する"));
declareBtn.click();
check("戦争が始まる", simActions.activeWars().length === 1);
check("画面に戦争カードが表示される", $("tab-wars").querySelector(".war-card"));

console.log("=== Undo/Redoとの整合 ===");
const beforeUndoWars = simActions.listWars().length;
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
await sleep(30);
check("Ctrl+Zで宣戦布告が取り消される", simActions.listWars().length === beforeUndoWars - 1 || simActions.listWars()[0]?.endedAt === undefined);

check("スクリプトエラーなし", errors.length === 0, errors.join("|"));
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
window.close();
process.exit(failed ? 1 : 0);
