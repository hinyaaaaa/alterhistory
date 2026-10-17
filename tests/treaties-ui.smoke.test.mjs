// 条約と外交の統合テスト（jsdom）: 条約を結ぶ → 宣戦 → 違約の警告 → 参戦招集 → 年表、までが一連で動く。
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
const { simActions } = window.alterhistory;
const wins = window.alterhistory.wins;
const M = () => store.getState().map;
const win = (id) => q(`[data-win="${id}"]`);
const ids = M().pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
const [A, B, C, D] = ids;
const clickBtn = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const histTypes = () => (M().ext?.data?.historyLog ?? []).map((h) => h.type);

console.log("=== 外交ウィンドウ: 条約を結ぶ（確定するまで何も残さない） ===");
wins.open("diplomacy"); await sleep(50);
check("関係一覧に国ごとの行がある", qa('[data-win="diplomacy"] .dip-row').length === ids.length);
clickBtn(win("diplomacy"), "条約を結ぶ").click(); await sleep(50);
const tw = win("treaty-new");
check("条約を結ぶ窓: 種類→当事国→条項→名称の4段階", !tw.hidden && tw.querySelectorAll(".treaty-step").length === 4);
const n0 = (M().ext?.data?.treaties ?? []).length, h0 = histTypes().length;
// 当事国を選ばずに締結しようとすると、何も作られない
clickBtn(tw, "この内容で締結する").click(); await sleep(30);
check("当事国が足りないと失敗し、条約も年表も増えない", (M().ext?.data?.treaties ?? []).length === n0 && histTypes().length === h0 && !!store.getState().error);
store.update((s) => { s.error = null; });

console.log("=== 不可侵条約 → 宣戦 → 違約 ===");
const sel = tw.querySelector("select"); sel.value = "nonaggression"; sel.dispatchEvent(new window.Event("change")); await sleep(30);
for (const id of [A, B]) { const cb = [...win("treaty-new").querySelectorAll('input[type=checkbox]')].find((c) => c.value === String(id)); cb.checked = true; cb.dispatchEvent(new window.Event("change")); await sleep(10); }
clickBtn(win("treaty-new"), "この内容で締結する").click(); await sleep(80);
let tr = M().ext.data.treaties.find((t) => t.kind === "nonaggression");
check("締結すると条約ができ、名前が自動で付く", !!tr && /不可侵条約$/.test(tr.name) && tr.status === "active" && tr.parties.length === 2, tr?.name);
check("年表に1件残る", histTypes().filter((t) => t === "treaty-signed").length === 1);
check("締結の窓が閉じ、条約の中身が開く", win("treaty-new").hidden && !win("treaty-detail").hidden);
const warns = simActions.treatyWarnings([A], [B]);
check("宣戦前に、違約の警告が出る", warns.length === 1 && warns[0].treaty === tr.name);
check("無関係な国への宣戦に、警告は出ない", simActions.treatyWarnings([A], [C]).length === 0);
const supA = M().pack.states[A].support ?? 70, credA = M().pack.states[A].credibility ?? 70;
const out = simActions.declareWarInstant([A], [B], null, "conventional");
check("宣戦は実行できる", !!out && !!out.id);
tr = M().ext.data.treaties.find((t) => t.id === tr.id);
check("違約: 条約は破棄され、破棄した国が記録される", tr.status === "broken" && tr.brokenBy === A && !!tr.endedAt);
check("違約: 攻めた国の民意と信用が下がる", (M().pack.states[A].support ?? 70) < supA && (M().pack.states[A].credibility ?? 70) < credA);
check("違約が年表に残る", histTypes().includes("treaty-breach"));
store.undo();
check("宣戦と違約は、Undo 1回でまとめて戻る", M().ext.data.treaties.find((t) => t.id === tr.id).status === "active" && !histTypes().includes("treaty-breach") && simActions.listWars().length === 0);

console.log("=== 軍事同盟 → 参戦招集（内戦は対象外が既定） ===");
const aid = simActions.concludeTreaty({ kind: "alliance", parties: [{ state: B, role: "盟主" }, { state: C, role: "加盟" }], terms: { bind: "medium" } });
const al = M().ext.data.treaties.find((t) => t.id === aid);
check("同盟は条約として結ばれ、既存の同盟（拘束力・盟主）とつながる", al.kind === "alliance" && M().ext.data.alliances.some((a) => a.id === al.ref.allianceId && a.bond === "standard" && a.leader === B));
const prev = simActions.previewWar([D], [B], null, "conventional");
check("同盟国が攻められると、同盟国が防衛に招集される", prev.defenders.includes(C), JSON.stringify(prev.defenders));
check("内戦の参戦招集は、既定では行わない設定", simActions.treatySettings().civilCallsAllies === false);
const { planDeclareAndResolveWar } = await import("../js/core/edit/wars.js");
const { createRandom } = await import("../js/core/random.js");
const civil = planDeclareAndResolveWar(M(), { attackers: [D], defenders: [B], date: { year: 1, month: 1 }, rnd: createRandom(1), type: "civil" });
check("内戦では、同盟国は招集されない（既定）", civil.joined.length === 0);
simActions.setTreatySettings({ civilCallsAllies: true });
const civil2 = planDeclareAndResolveWar(M(), { attackers: [D], defenders: [B], date: { year: 1, month: 1 }, rnd: createRandom(1), type: "civil" });
check("トグルを入れると、内戦でも招集される", civil2.joined.some((j) => j.id === C));
simActions.setTreatySettings({ civilCallsAllies: false });

console.log("=== 破棄・改定 ===");
check("条約を改定できる（名前）", simActions.amendTreaty(aid, { name: "テスト同盟条約" }) && M().ext.data.treaties.find((t) => t.id === aid).name === "テスト同盟条約");
const sup2 = M().pack.states[B].support ?? 70;
check("一方的な破棄に成功する", simActions.breakTreaty(aid, B));
check("同盟も解消され、破棄した国の民意が下がる", M().ext.data.alliances.find((a) => a.id === al.ref.allianceId).dissolvedAt != null && (M().pack.states[B].support ?? 70) < sup2);
check("破棄した条約は、破棄のまま残る（履歴）", M().ext.data.treaties.find((t) => t.id === aid).status === "broken");

console.log("=== 経済協力・従属・共同宣言 ===");
const { computeTrade } = await import("../js/core/sim/trade.js");
const sumRev = (m) => { const tr2 = computeTrade(m); let s = 0; for (const v of tr2.states.values()) s += v.salesTaxRevenue; return s; };
const rev0 = sumRev(M());
const eid = simActions.concludeTreaty({ kind: "economic", parties: ids.map((i) => ({ state: i, role: "加盟" })), terms: { tariff: "low" } });
check("経済協力が結べる", eid != null);
check("経済協力で、貿易による税収が増える（または同じ）", sumRev(M()) >= rev0);
const vid = simActions.concludeTreaty({ kind: "vassal", parties: [{ state: A, role: "宗主国" }, { state: D, role: "属国" }], terms: { kind: "protectorate" } });
check("従属条約で、従属関係ができる", vid != null && simActions.vassalInfo(D)?.overlord === A && simActions.vassalInfo(D)?.kind === "protectorate");
simActions.breakTreaty(vid, null);
check("従属条約を終えると、独立に戻る", simActions.vassalInfo(D) == null);
const did = simActions.concludeTreaty({ kind: "declaration", parties: [{ state: A, role: "加盟" }, { state: C, role: "加盟" }], terms: { declaration: "friendship" } });
check("共同宣言は、記録と年表のみ（定型文）", did != null && M().ext.data.treaties.find((t) => t.id === did).kind === "declaration" && histTypes().includes("treaty-signed"));

console.log("=== 講和は条約として外交の一覧に入る ===");
const w = simActions.declareWarInstant([C], [D], null, "conventional");
const ok = simActions.signTreaty(w.id, { kind: "white", treatyName: "テスト講和条約", cessions: [], reparations: [], notes: "" });
const peace = M().ext.data.treaties.find((t) => t.kind === "peace");
check("講和の締結で、条約（種類=講和）が一覧に入る", ok && !!peace && peace.name === "テスト講和条約" && peace.originWar === w.id);

console.log("=== 画面: 国をクリックすると条約の一覧と履歴 ===");
wins.open("diplomacy"); await sleep(50);
const rowA = qa('[data-win="diplomacy"] .dip-row').find((r) => r.textContent.includes(M().pack.states[A].name));
rowA.click(); await sleep(50);
check("国の条約の一覧が開く（履歴も含む）", qa('[data-win="diplomacy"] .treaty-row').length >= 2 && !!q('[data-win="diplomacy"] .treaty-card.broken'));
check("関係一覧の国に、条約のバッジ（同盟・協力・戦争中など）が出る", qa('[data-win="diplomacy"] .dip-badge').length >= 1);
check("外交に工作の欄は無い（工作は国家タブへ集約）", !win("diplomacy").textContent.includes("隠密工作"));
check("内戦の参戦招集のトグルがある", !!win("diplomacy").querySelector("#civil-calls-allies"));

console.log("=== A6: 外交タブの小さな改善（条約の絞り込み・敵対から戦争へ・拘束力の説明） ===");
{
  const { BIND_LEVELS } = await import("../js/core/edit/treaties.js");
  wins.open("diplomacy"); await sleep(50);
  const dwin = () => win("diplomacy");
  const rows = () => qa('[data-win="diplomacy"] .dip-row');
  const label = (t) => [...dwin().querySelectorAll(".dip-filter button")].find((b) => b.textContent.startsWith(t));
  const n = (t) => Number(label(t)?.textContent.match(/\d+/)?.[0] ?? -1);
  let picked = false;
  for (let i = 0; i < rows().length && !picked; i++) { rows()[i].click(); await sleep(40); if (n("破棄") > 0 && n("有効") > 0) picked = true; }
  check("条約一覧に、状態の絞り込み（すべて・有効・失効・破棄）がある", ["すべて", "有効", "失効", "破棄"].every((t) => !!label(t)));
  check("（準備）有効と破棄の両方を持つ国を選べた", picked);
  check("件数の合計が「すべて」と一致する", n("有効") + n("失効") + n("破棄") === n("すべて"), `${n("有効")}+${n("失効")}+${n("破棄")} vs ${n("すべて")}`);
  const cards = () => qa('[data-win="diplomacy"] .dip-right .treaty-card');
  const total = n("すべて"), nBroken = n("破棄"), nActive = n("有効");
  label("破棄").click(); await sleep(40);
  check("「破棄」で、破棄された条約だけが並ぶ", cards().length === nBroken && cards().every((c) => c.classList.contains("broken")), `${cards().length}/${nBroken}`);
  check("押した絞り込みが選択状態になる", label("破棄").classList.contains("on") && !label("すべて").classList.contains("on"));
  label("有効").click(); await sleep(40);
  check("「有効」で、有効な条約だけが並ぶ", cards().length === nActive && cards().every((c) => c.classList.contains("active")), `${cards().length}/${nActive}`);
  label("すべて").click(); await sleep(40);
  check("「すべて」で、全部に戻る", cards().length === total);
  // 敵対の各行から、その戦争へ飛べる
  let jump = null;
  for (let i = 0; i < rows().length && !jump; i++) { rows()[i].click(); await sleep(40); jump = dwin().querySelector(".dip-foe .dip-foe-wars button"); }
  check("敵対の行に、その戦争へ飛ぶボタンがある", !!jump);
  if (jump) { wins.close("war"); jump.click(); await sleep(60); check("押すと、戦争ウィンドウが開く", !win("war").hidden); }
  // 同盟の拘束力: 選ぶ欄のその場に説明が出て、選び直すと説明も変わる
  wins.open("treaty-new"); await sleep(40);
  const kindSel = win("treaty-new").querySelector("select"); kindSel.value = "alliance"; kindSel.dispatchEvent(new window.Event("change")); await sleep(40);
  const bd = () => win("treaty-new").querySelector('[data-field="bind-desc"]');
  const bsel = [...win("treaty-new").querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "strong"));
  check("同盟の条項に、拘束力の説明がその場に出る", !!bd() && bd().textContent === BIND_LEVELS.find((b) => b.key === bsel.value).desc, bd()?.textContent);
  const other = BIND_LEVELS.find((b) => b.key !== bsel.value); bsel.value = other.key; bsel.dispatchEvent(new window.Event("change")); await sleep(30);
  check("拘束力を選び直すと、説明も変わる", bd().textContent === other.desc, bd().textContent);
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
dom.window.close();
process.exit(failed ? 1 : 0);
