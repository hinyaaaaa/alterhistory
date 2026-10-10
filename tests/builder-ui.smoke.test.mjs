// 作成導線（設定メニュー → 一覧ウィンドウの「＋ 追加」→ 共通の初期設定ウィンドウで入力して確定）の統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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

const ba = window.alterhistory.builderActions;
const ea = window.alterhistory.editActions;
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const openList = (kind) => { q(`#settings-menu [data-open-win="list-${kind}"]`)?.click(); };

console.log("=== 一覧ウィンドウを開く ===");
check("設定メニューに国家一覧がある", !!q('#settings-menu [data-open-win="list-state"]'));
openList("state");
await waitFor(() => q(".ent-addbar"), 2000, "追加バー");
check("追加バーには「追加」だけが出る（作成は共通の初期設定ウィンドウで行う）", !!clickBtn(window.document, "国家を追加") && !clickBtn(window.document, "おまかせ領土つき"));
check("「歴史をつくる」ボタンは無い", !$("btn-builder") && !$("builder-panel"));

console.log("=== 初期設定ウィンドウ：キャンセルすると何も作られない ===");
const setupWin = () => q('[data-win="setup"]');
const histLen = () => (store.getState().map.ext?.data?.historyLog ?? []).length;
const selOf = (root, text) => [...root.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent.includes(text)));
const before = states().length, log0 = histLen();
clickBtn(window.document, "国家を追加").click();
check("初期設定ウィンドウが開く", await waitFor(() => setupWin() && !setupWin().hidden, 2000, "開く"));
check("開いただけでは国は増えず、年表にも載らない", states().length === before && histLen() === log0);
setupWin().querySelector(".name-row input").value = "キャンセル王国";
clickBtn(setupWin(), "キャンセル").click();
check("キャンセルで閉じ、国も年表の記録も増えない", setupWin().hidden && states().length === before && histLen() === log0);
clickBtn(window.document, "国家を追加").click();
setupWin().querySelector(".name-row input").value = "ばつ王国";
setupWin().querySelector(".panel-close").click();
check("× で閉じても、何も作られない", setupWin().hidden && states().length === before && histLen() === log0);

console.log("=== 国を建てる（初期設定で入力 → 確定。おまかせ領土・首都つき） ===");
clickBtn(window.document, "国家を追加").click();
await waitFor(() => setupWin() && !setupWin().hidden, 2000, "開く");
const terr = selOf(setupWin(), "おまかせ（中）"); terr.value = "m";
check("項目がそろっている（名前・色・政体・領土）", !!setupWin().querySelector(".name-row input") && !!setupWin().querySelector('input[type="color"]') && !!selOf(setupWin(), "君主制") && !!selOf(setupWin(), "あとで地図に塗る"));
setupWin().querySelector('input[type="color"]').value = "#3366cc";
clickBtn(setupWin(), "確定して作成").click(); // 名前は空欄 → おまかせの名前
await waitFor(() => states().length === before + 1, 2000, "国が増える");
check("確定すると国が1つ増え、ウィンドウは閉じる", states().length === before + 1 && setupWin().hidden);
const made = states().at(-1);
check("名前はカタカナ（おまかせ）で、「仮」の印は付かない", /[ァ-ヴー]/.test(made.fullName ?? made.name) && !ea.isProvisional("state", made.i));
check("指定した色になる", store.getState().map.pack.states[made.i].color === "#3366cc");
check("セルが塗られる", store.getState().map.pack.states[made.i].cells > 0, `${store.getState().map.pack.states[made.i].cells}セル`);
const done = store.getState().map.pack.states[made.i];
check("首都が置かれる", done.capital > 0 && !ea.isProvisional("burg", done.capital));
check("年表には「建国」が1件だけ増える", histLen() === log0 + 1 && store.getState().map.ext.data.historyLog.at(-1).type === "created-state");

console.log("=== 凡例が最新になる ===");
check("凡例に新しい国が出る", [...window.document.querySelectorAll(".legend-name")].some((n) => n.textContent === (made.fullName ?? made.name)));

console.log("=== 技術水準を変えられる ===");
ea.setTechLevel?.(made.i, 7);
check("技術水準を変えられる", ea.getTechLevel(made.i) === 7);

console.log("=== 手で塗る方式（領土は「あとで地図に塗る」） ===");
const n0 = states().length;
clickBtn(window.document, "国家を追加").click();
await waitFor(() => setupWin() && !setupWin().hidden, 2000, "開く");
check("領土の既定は「あとで地図に塗る」", selOf(setupWin(), "あとで地図に塗る").value === "later");
clickBtn(setupWin(), "確定して作成").click();
await waitFor(() => states().length === n0 + 1, 2000, "追加");
check("国がもう1つ増える", states().length === n0 + 1);
await waitFor(() => store.getState().editTool === "paint:state", 2000, "塗るツール");
check("塗るツールに切り替わり、塗り先が新しい国", store.getState().editTool === "paint:state");
ba.endPaint();
check("ツールが選択に戻る", store.getState().editTool === "select");

console.log("=== 取り消し（Undo） ===");
store.undo();
check("Undo で作成前に戻る", states().length === n0);

console.log("=== 宗教（名前の雰囲気を指定） ===");
const rid = ba.create("religion", { style: "yamato" });
check("宗教が作られる", rid != null);
{
  const rel = store.getState().map.pack.religions[rid];
  check("指定した雰囲気（和風）の名前になる", /^[ァ-ヴー]+/.test(rel.name), rel.name + "/" + (rel.deity ?? ""));
}
ba.beginPaint("religion", rid);
check("塗っている間は宗教の色分けに切り替わる", (({ religions, states, cultures, provinces }) => religions === true && !states && !cultures && !provinces)(store.getState().view));
ba.endPaint();
check("終わると元の色分け（国家）に戻る", (({ religions, states }) => states === true && !religions)(store.getState().view));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
