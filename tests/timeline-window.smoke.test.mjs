// 年表ウィンドウの統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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
viewport.fit();
const ea = window.alterhistory.editActions;
const { buildTimeline } = await import("../js/io/chronicle.js");
const { filterTimeline, visibleRange, kindOfType } = await import("../js/ui/timeline-window.js");
const count = () => q(".tl-count")?.textContent ?? "";
const rows = () => [...window.document.querySelectorAll(".tl-row")];
const total = () => store.getState().map && buildTimeline(store.getState().map).length;

console.log("=== 年表ウィンドウを開く ===");
check("設定メニューに年表がある", !!q('#settings-menu [data-open-win="timeline"]'));
// 年表に出来事を作っておく
const ids = [...store.getState().map.pack.states].filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
ea.addHistoryEvent({ title: "手書きの出来事A", detail: "説明A", date: { year: 3, month: 4 }, states: [ids[0]] });
ea.addHistoryEvent({ title: "手書きの出来事B", date: { year: 9, month: 1 } });
q('#settings-menu [data-open-win="timeline"]').click();
await waitFor(() => rows().length > 0, 3000, "行");
check("年表に件数が出る", count().includes(`${total()} 件`), count());
check("手書きの出来事が年表にある", buildTimeline(store.getState().map).some((e) => e.title === "手書きの出来事A" && e.year === 3 && e.month === 4));

console.log("=== 絞り込み ===");
const kindSel = q(".tl-filters select"); kindSel.value = "note"; kindSel.dispatchEvent(new window.Event("change"));
check("種類で絞れる（記録・手書き）", count().startsWith(`${filterTimeline(buildTimeline(store.getState().map), { kind: "note" }).length} 件`), count());
check("絞り込んだ行は、手書きの出来事だけ", rows().length > 0 && rows().every((r) => r.className.includes("tl-note")));
q(".tl-filters button").click();
check("絞り込みを外すと全件に戻る", count().startsWith(`${total()} 件`), count());
const [fromIn, toIn] = window.document.querySelectorAll(".tl-filters input[type=number]");
fromIn.value = "9"; fromIn.dispatchEvent(new window.Event("change")); toIn.value = "9"; toIn.dispatchEvent(new window.Event("change"));
check("年で絞れる", rows().length >= 1 && rows().every((r) => r.querySelector(".tl-date-col").textContent.startsWith("9年")), count());
q(".tl-filters button").click();
const stateSel = window.document.querySelectorAll(".tl-filters select")[1]; stateSel.value = String(ids[0]); stateSel.dispatchEvent(new window.Event("change"));
check("国で絞れる", count().startsWith(`${filterTimeline(buildTimeline(store.getState().map), { stateId: ids[0] }).length} 件`) && rows().some((r) => r.textContent.includes("手書きの出来事A")), count());
q(".tl-filters button").click();

console.log("=== 項目を押すと地図が移る ===");
const withCell = buildTimeline(store.getState().map).find((e) => e.cell != null);
check("場所のある出来事がある", !!withCell);
viewport.centerOn(0, 0, viewport.k);
const rowForCell = rows().find((r) => r.textContent.includes(withCell.title.slice(0, 8)) && !r.className.includes("tl-nowhere")) ?? rows().find((r) => !r.className.includes("tl-nowhere"));
const before = [viewport.x, viewport.y];
rowForCell.click();
check("押すと表示位置が動く", viewport.x !== before[0] || viewport.y !== before[1]);

console.log("=== 手書きの出来事を足す ===");
const n0 = total();
const add = q(".tl-add"); add.open = true;
const inputs = add.querySelectorAll("input");
inputs[0].value = "画面から足した出来事"; inputs[1].value = "テスト"; 
add.querySelector("button.primary").click();
check("年表が1件増える", total() === n0 + 1);
check("画面にも反映される", count().startsWith(`${n0 + 1} 件`), count());
store.undo();
check("Undo で出来事も消える", total() === n0);

console.log("=== マーカー・ノートも年表に載る ===");
const t0 = total();
const mid = ea.addMarker(ea.addMarker ? 10 : 10, { type: "events", icon: "⚑", name: "テストの印" });
check("マーカーの設置が年表に載る", buildTimeline(store.getState().map).some((e) => e.type === "marker-added" && e.title.includes("テストの印")));
ea.setNote("state", ids[0], "<p>テストのノート</p>");
check("ノートの書き換えが年表に載る", buildTimeline(store.getState().map).some((e) => e.type === "note"));
check("載った出来事に、地図上の場所がある（マーカー）", buildTimeline(store.getState().map).find((e) => e.type === "marker-added")?.cell === 10);

console.log("=== 件数が多くても全件を数え、描画は見える行だけ ===");
for (let i = 0; i < 1500; i++) ea.addHistoryEvent({ title: `大量の出来事${i}`, date: { year: 20 + (i % 50), month: 1 + (i % 12) } });
const T = total();
q(".tl-filters button").click();
await waitFor(() => count().startsWith(`${T} 件`), 4000, "大量");
check("全件の件数が出る（削らない）", count().startsWith(`${T} 件`) && T >= 1500, count());
check("描画する行は見える範囲だけ（全件を並べない）", rows().length > 0 && rows().length < 200, `${rows().length}行`);
check("見える範囲の計算（先頭）", JSON.stringify(visibleRange(0, 400, 10000)) === JSON.stringify([0, Math.ceil(400 / 58) + 8]));
check("見える範囲の計算（末尾でも件数を超えない）", visibleRange(58 * 9990, 400, 10000)[1] === 10000);
check("種類の判定", kindOfType("battle") === "war" && kindOfType("alliance-formed") === "diplomacy" && kindOfType("manual") === "note");

console.log("=== 外交表の食い違いを直す入口（外交・同盟ウィンドウ） ===");
{
  const m = store.getState().map;
  m.ext.data.alliances = [...(m.ext.data.alliances ?? []), { id: 901, name: "食い違い同盟", members: [ids[0], ids[1]], formedAt: { year: 1, month: 1 }, dissolvedAt: null }];
  m.pack.states[ids[0]].diplomacy = []; m.pack.states[ids[1]].diplomacy = [];
  check("食い違いが数えられる", ea.diplomacyMismatchCount() >= 1);
  q('#settings-menu [data-open-win="diplomacy"]').click();
  await waitFor(() => q(".dip-mismatch button"), 2000, "直すボタン");
  check("食い違いがあるときだけ、「直す」が出る", !!q(".dip-mismatch button"));
  q(".dip-mismatch button").click();
  check("押すと食い違いが無くなり、表示も消える", ea.diplomacyMismatchCount() === 0 && !q(".dip-mismatch"));
  store.undo();
  check("Undo で元に戻る（食い違いが再び出る）", ea.diplomacyMismatchCount() >= 1);
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
