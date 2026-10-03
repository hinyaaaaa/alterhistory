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

check("アプリが起動する", await waitFor(() => window.alterhistory, 8000, "起動"));
const { store, simActions } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const map = () => store.getState().map;
const live = map().pack.states.filter((s) => s && s.i && !s.removed);
const [A, B] = live;
const cellOf = (st) => { const c = map().pack.cells.state; for (let i = 0; i < c.length; i++) if (c[i] === st.i && map().pack.cells.biome[i] !== 0) return i; };
const nMarkers = () => map().markers.length;

console.log("=== 開戦・戦闘・講和の自動マーカー ===");
const m0 = nMarkers();
const warId = simActions.declareWar([A.i], [B.i], "テスト戦争");
check("宣戦布告で「開戦」マーカーが1つ置かれる", nMarkers() === m0 + 1 && map().markers.at(-1).type === "war", map().markers.at(-1)?.name);
const ra = simActions.createRegiment(A.i, cellOf(A)), rb = simActions.createRegiment(B.i, cellOf(B));
simActions.editRegiment(A.i, ra, { u: { infantry: 500 } }); simActions.editRegiment(B.i, rb, { u: { infantry: 400 } });
const m1 = nMarkers();
simActions.attack({ stateId: A.i, regId: ra }, { stateId: B.i, regId: rb }, warId);
check("戦争中の戦闘で「古戦場」マーカーが置かれる", nMarkers() === m1 + 1 && map().markers.at(-1).type === "battlefields", map().markers.at(-1)?.name);
store.undo();
check("戦闘を Undo するとマーカーも一緒に消える", nMarkers() === m1);
simActions.attack({ stateId: A.i, regId: ra }, { stateId: B.i, regId: rb }, null);
check("戦争に紐づかない戦闘ではマーカーを置かない", nMarkers() === m1);
const m2 = nMarkers();
simActions.signPeace(warId, { toStateId: A.i, provinceIds: [], regionCells: [] });
check("講和で「講和」マーカーが置かれる", nMarkers() === m2 + 1 && map().markers.at(-1).type === "peace", map().markers.at(-1)?.name);
store.undo();
check("講和を Undo すると戦争も再開しマーカーも消える", nMarkers() === m2 && !map().ext.data.wars.find((w) => w.id === warId).endedAt);

console.log("=== 軍の維持費 ===");
const { militaryBurden } = await import(path.join(root, "js/core/sim/world.js"));
check("兵力が無ければ維持費は0", militaryBurden({ rural: 100000, urban: 20000, military: [] }) === 0);
const small = militaryBurden({ rural: 100000, urban: 0, military: [{ u: { infantry: 100 } }] });
const big = militaryBurden({ rural: 100000, urban: 0, military: [{ u: { infantry: 100, armor: 100, air: 50 } }] });
check("装備が重いほど維持費は増える", big > small && small > 0, `${small.toFixed(3)} < ${big.toFixed(3)}`);
check("維持費は税収の80%で頭打ち", militaryBurden({ rural: 1000, urban: 0, military: [{ u: { nuclear: 99999 } }] }) === 0.8);

console.log("=== 英語名の都市をカタカナに ===");
const { actions } = window.alterhistory;
const ids = []; map().pack.burgs.forEach((b, i) => { if (i && b && !b.removed && ids.length < 5) ids.push(i); });
const eng = ["Newbury", "Oxford", "Ashton", "Hartley", "Wilton"];
ids.forEach((id, k) => { map().pack.burgs[id].name = eng[k]; });
const n = actions.katakanaBurgs("test");
const names = ids.map((id) => map().pack.burgs[id].name);
check("英語名の都市が全部カタカナ側に付け替わる", n === 5 && names.every((x) => !/[A-Za-z]/.test(x)), names.join(","));
check("付け替えた名前どうしは被らない", new Set(names).size === names.length);
check("2回目は対象が無く 0 件", actions.katakanaBurgs("test") === 0);
store.undo();
check("Undo 1回で元の英語名に戻る", ids.every((id, k) => map().pack.burgs[id].name === eng[k]));
check("ページ題名に「作戦司令室」が入っていない", !window.document.title.includes("作戦"), window.document.title);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
