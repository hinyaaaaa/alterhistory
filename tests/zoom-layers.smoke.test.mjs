// 歴史ビルダーUIの統合テスト（jsdom）。合成マップを使うので実サンプルは不要。
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
    window.HTMLCanvasElement.prototype.getContext = function () {
      if (!this.__ctx) { // 描画先は画面外のタイルにもなるので、どのキャンバスに描かれた文字も記録する
        const c = fakeCtx(); const o = c.fillText?.bind(c);
        c.fillText = (t, ...r) => { (globalThis.__drawn ??= []).push(t); return o ? o(t, ...r) : undefined; };
        this.__ctx = c;
      }
      return this.__ctx;
    };
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

check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store, viewport } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));

// 描画された文字を数える：ctx.fillText を差し替えて、何が描かれたかを記録する
const canvas = $("map-canvas"); const ctx = canvas.getContext("2d");
const drawn = (globalThis.__drawn ??= []); void ctx;
const render = async () => { drawn.length = 0; window.alterhistory.renderer.requestRender(); await sleep(80); return [...new Set(drawn)]; };
const map = () => store.getState().map;
const capitalNames = map().pack.burgs.filter((b) => b && b.i && !b.removed && b.capital).map((b) => b.name);
const townNames = map().pack.burgs.filter((b) => b && b.i && !b.removed && !b.capital).map((b) => b.name);
const provNames = map().pack.provinces.filter((p) => p && p.i && p.name).map((p) => p.name);

console.log("=== ズーム連動のラベル ===");
check("既定は「ズーム連動」", store.getState().view.burgLabels === "auto");
viewport.fit();
let t = await render();
check("全体表示：首都の名前は出る", capitalNames.every((n) => t.includes(n)));
check("全体表示：小さな都市の名前は出ない", townNames.every((n) => !t.includes(n) || capitalNames.includes(n)), `出た都市=${townNames.filter((n) => t.includes(n) && !capitalNames.includes(n)).length}`);
check("全体表示：属州名は出ない", provNames.every((n) => !t.includes(n)));
viewport.zoomAt(viewport.screenWidth / 2, viewport.screenHeight / 2, 2.6);
t = await render();
const mid = townNames.filter((n) => t.includes(n) && !capitalNames.includes(n)).length;
check("2.6倍：属州名が現れる", provNames.some((n) => t.includes(n)));
// 同じ画面のまま倍率の基準だけを変えて（fitK を小さくして）、倍率 z だけを上げたときの都市名の数を比べる
viewport.fit(); const fitK0 = viewport.fitK;
const counts = [];
for (const z of [1, 2.6, 4, 6.5]) {
  viewport.fitK = fitK0 / z;
  const tt = await render();
  counts.push(townNames.filter((n) => tt.includes(n) && !capitalNames.includes(n)).length);
}
viewport.fitK = fitK0;
check("倍率が上がるほど、現れる都市名が増える", counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts.at(-1) > counts[0], counts.join(" → "));
viewport.fit();
store.update((s) => { s.view.burgLabels = "all"; });
t = await render();
check("「全部」にすると全体表示でも都市名がたくさん出る", townNames.filter((n) => t.includes(n)).length > 3, String(townNames.filter((n) => t.includes(n)).length));
store.update((s) => { s.view.burgLabels = "capitals"; });
t = await render();
check("「首都のみ」では小さな都市の名前は出ない", townNames.every((n) => !t.includes(n) || capitalNames.includes(n)));
store.update((s) => { s.view.burgLabels = "none"; });
t = await render();
check("「都市名なし」では首都名も出ない（国名は出る）", capitalNames.every((n) => !t.includes(n)) && t.length > 0);
store.update((s) => { s.view.burgLabels = "auto"; });

console.log("=== レイヤーのポップアップ（Azgaar 方式） ===");
const layer = (k) => q(`[data-layer="${k}"]`);
check("レイヤーのボタンが14個ある", window.document.querySelectorAll("[data-layer]").length === 14);
layer("cultures").click();
check("文化をオンにしても国家は消えない（重ねられる）", store.getState().view.cultures === true && store.getState().view.states !== false);
check("オンのボタンは選択状態になる", layer("cultures").classList.contains("active") && layer("states").classList.contains("active"));
layer("cultures").click();
check("もう一度押すとオフ", store.getState().view.cultures === false && !layer("cultures").classList.contains("active"));
check("レイヤープリセットのボタンは廃止されている", !q("[data-preset]") && !q("#layer-presets"));
layer("zones").click();
check("ゾーンの表示を切り替えられる", store.getState().view.zones === false);
layer("zones").click();
const seg = (id, val) => q(`[data-seg-for="${id}"] [data-value="${val}"]`);
seg("sel-burg-labels", "capitals").click();
check("名前の表示は区切りボタンで切り替わる", store.getState().view.burgLabels === "capitals" && seg("sel-burg-labels", "capitals").classList.contains("active"));
seg("sel-burg-labels", "auto").click();
const menus = [...window.document.querySelectorAll("details.menu")];
menus[0].open = true; menus[0].dispatchEvent(new window.Event("toggle"));
menus[1].open = true; menus[1].dispatchEvent(new window.Event("toggle"));
check("メニューは同時に1つだけ開く", menus.filter((m) => m.open).length === 1);
check("地図編集パネルには色分け・下地のセレクトが残っていない", !$("edit-panel").querySelector("[data-layer], #layer-toggles"));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
