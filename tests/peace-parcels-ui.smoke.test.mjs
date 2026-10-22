// 講和の区画（自動生成・赤い強調・依存・傀儡国家の新設）の統合テスト（jsdom）。
// 実際の index.html とビルド済み dist/app.js（npm run build 後）を動かす。
import { loadLegacyInto } from "./helpers/load-legacy.mjs";
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
const { store, simActions, wins } = window.alterhistory;
const { text } = buildSyntheticMapText({ seed: 11 });
const input = $("file-input");
Object.defineProperty(input, "files", { value: [new File([text], "synth.map")], configurable: true });
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));
const M = () => store.getState().map, win = () => q('[data-win="war"]');
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
// 強い国と弱い国で戦争を起こし、勝敗を付ける
const [A, B] = live().map((s) => s.i);
M().pack.states[A].military = M().pack.states[A].military?.length ? M().pack.states[A].military : [];
const out = simActions.declareWarInstant([A], [B], null, "conventional");
check("戦争が始まる", !!out?.id);
const w0 = M().ext.data.wars.find((x) => x.id === out.id);
const winner = w0.result.winner === "attacker" ? w0.attackers[0] : w0.defenders[0], loser = winner === A ? B : A;
const terms0 = simActions.suggestTerms(out.id, { size: "s" });
check("自動案に、区画（依存・深さつき）が出る", terms0 && terms0.cessions.length > 0 && terms0.cessions.every((c) => Array.isArray(c.needs) && c.depth >= 0 && !c.regionCells.includes(M().pack.burgs[M().pack.states[loser].capital]?.cell)));
const parcels = terms0.cessions;
const front = parcels.find((c) => c.depth === 0);
check("国境に接する区画が最初にある", !!front);
// 傀儡国家を新設して、国境の区画を渡す
const n0 = live().length, cells0 = M().pack.states[loser].cells;
const c0 = { cells: front.regionCells, fromStateId: loser, toStateId: winner, name: front.name, puppetOf: winner };
const ok = simActions.signTreaty(out.id, { kind: "standard", cessions: [c0], reparations: [], treatyName: "傀儡新設の講和", notes: "" }, { enforceBudget: false, allowOngoing: true });
check("傀儡国家を新設する講和が締結できる", ok);
const after = live();
check("新しい国が1つ増える", after.length === n0 + 1);
const pup = after.at(-1);
check("新しい国は、勝者に従属する傀儡国家", pup.vassal?.overlord === winner && pup.vassal.kind === "puppet");
check("区画の土地が、新しい国のものになる（敗者から外れる）", front.regionCells.every((i) => M().pack.cells.state[i] === pup.i) && cells0 > 0);
check("傀儡国家に政体が付く", !!pup.regime && !!pup.formName);
check("元の国の首都は残る", M().pack.cells.state[M().pack.burgs[M().pack.states[loser].capital].cell] === loser);
store.undo();
check("Undo 1回で、国の新設も講和も戻る", live().length === n0 && !M().ext.data.wars.find((x) => x.id === out.id).endedAt);
// 首都を含む割譲は拒否される
const cap = M().pack.burgs[M().pack.states[loser].capital].cell;
check("首都を含む区画は割譲できない", !simActions.signTreaty(out.id, { kind: "standard", cessions: [{ cells: [cap], fromStateId: loser, toStateId: winner }], reparations: [], treatyName: "首都", notes: "" }, { enforceBudget: false, allowOngoing: true }));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
