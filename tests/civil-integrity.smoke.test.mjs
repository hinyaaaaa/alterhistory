// 内戦の決着・外国の支援・整合性検査の拡張（v2.3.0）の統合テスト（jsdom）。
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
    Object.assign(window, { TextDecoder, Blob, Response, CompressionStream, DecompressionStream });
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
await loadLegacyInto(window, $("file-input").files[0]);
check("地図が読み込める", await waitFor(() => store.getState().map, 15000, "読み込み"));

const wins = window.alterhistory.wins; const M = () => store.getState().map;
const { simActions } = window.alterhistory;
const cnt = {}; for (const p of M().pack.provinces) if (p && p.i > 0 && !p.removed) cnt[p.state] = (cnt[p.state] ?? 0) + 1;
const prov = M().pack.provinces.find((p) => p && p.i > 0 && !p.removed && cnt[p.state] >= 2);
const parent = prov.state;
console.log("=== 内戦の決着（選択だけで自動処理） ===");
const r = simActions.rebel({ provinceIds: [prov.i], name: "反乱国", civil: true });
const warId = r.warId;
check("反乱で内戦が始まる", warId != null && M().ext.data.wars.find((w) => w.id === warId).type === "civil");
wins.open("war"); await sleep(60);
const ww0 = q('[data-win="war"]');
check("戦争の窓に「内戦の決着」欄・「作戦」欄は無く、内戦そのものは戦争タブに出る（v2.5.0）", !q(".war-civil") && !q(".war-ops") && !ww0.textContent.includes("進行中の内戦はありません") && ww0.textContent.includes("反乱国"));
const other = M().pack.states.find((s) => s && s.i > 0 && !s.removed && s.i !== r.id && s.i !== parent).i;
check("外国の支援を、国の選択だけで記録できる（条約の一種）", simActions.recordCivilSupport(warId, other, "rebel") != null && M().ext.data.treaties.some((t) => t.kind === "support" && t.originWar === warId && t.parties[1].state === r.id));
const provCells = () => M().pack.cells.province.filter((p) => p === prov.i).length;
simActions.resolveCivilWar(warId, "suppress"); await sleep(50);
const w = M().ext.data.wars.find((x) => x.id === warId);
check("鎮圧: 戦争が終わり、反乱側の国が解体され、属州が元の国に戻る", !!w.endedAt && M().pack.states[r.id].removed === true && M().pack.provinces[prov.i].state === parent);
check("鎮圧の講和が条約として残る", M().ext.data.treaties.some((t) => t.kind === "peace" && t.originWar === warId && t.name.includes("鎮圧")));
console.log("=== 独立の承認 ===");
const r2 = simActions.rebel({ provinceIds: [prov.i], name: "第二反乱国", civil: true });
const w2 = r2.warId;
check("独立を承認すると、戦争が終わり、反乱側は独立国のまま残る", simActions.resolveCivilWar(w2, "independence") && !!M().ext.data.wars.find((x) => x.id === w2).endedAt && !M().pack.states[r2.id].removed);
check("決着済みの内戦は、もう一度は決着できない", simActions.resolveCivilWar(w2, "suppress") === false);
check("通常の戦争は、この操作の対象外", simActions.resolveCivilWar(99999, "suppress") === false);
console.log("=== 整合性検査の拡張 ===");
const { checkIntegrity } = await import("../js/core/edit/integrity.js");
const base = checkIntegrity(M());
check("正常な地図では、矛盾は出ない", !base.some((p) => /君主|原因|循環|条約/.test(p)), base.join(" / "));
const d = M().ext.data, A = parent;
d.leaders = { [A]: { current: { name: "C", title: "王", since: { year: 20, month: 1 }, stability: "stable" }, history: [{ name: "A", title: "王", since: { year: 1, month: 1 }, until: { year: 10, month: 1 } }, { name: "B", title: "王", since: { year: 8, month: 1 }, until: { year: 15, month: 1 } }] } };
d.leaders[999] = { current: null, history: [] };
d.historyLog.push({ year: 3, month: 1, type: "x", title: "結果", states: [888], cause: "y|9-1|原因" });
M().pack.states[A].parentState = r2.id; M().pack.states[r2.id].parentState = A;
d.treaties = [{ id: 90, kind: "economic", name: "期限切れ協定", parties: [{ state: A }, { state: r2.id }], status: "active", expiresAt: { year: 1, month: 1 }, terms: {} }, { id: 91, kind: "alliance", name: "消えた同盟", parties: [{ state: A }, { state: r.id }], status: "active", expiresAt: null, terms: {} }, { id: 92, kind: "declaration", name: "幻の宣言", parties: [{ state: A }, { state: 777 }], status: "active", terms: {} }];
M().worldTime = { year: 30, month: 1 };
const probs = checkIntegrity(M()).join("\n");
check("君主の在位の重なりを検出", probs.includes("在位が重なって"));
check("君主の在位のすき間を検出", probs.includes("在位にすき間"));
check("存在しない国への参照を検出（君主・年表・条約）", probs.includes("存在しない国家#999") && probs.includes("存在しない国家#888") && probs.includes("存在しない国家#777"));
check("年代が逆転した原因リンクを検出", probs.includes("原因が、結果より後"));
check("前身・後継の循環を検出", probs.includes("循環"));
check("当事国が消えた条約を検出", probs.includes("当事国が消えています"));
check("期限切れなのに有効のままの条約を検出", probs.includes("期限切れなのに、有効のまま"));
wins.open("settings"); await sleep(30);
check("詳細設定にデータ検査の窓は無い（v2.4.0 で廃止）", ![...q('[data-win="settings"]').querySelectorAll("button")].some((b) => b.textContent.includes("検査を実行")) && !q(".settings-check"));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); dom.window.close(); process.exit(failed ? 1 : 0);
