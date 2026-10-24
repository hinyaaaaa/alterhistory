// V5-M10: 歴史ビューア。問い合わせ（一覧・カーソル・検索・戦争ファミリー・過去の月）と、画面（仮想スクロール・選択の連動・過去の閲覧・Ctrl+K）。
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { createStore } from "../js/core/store.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";
import { createCivActions } from "../js/app/civ-actions.js";
import { createTimeActions } from "../js/app/time-actions.js";
import { createHistoryActions } from "../js/app/history-actions.js";
import { statesAt, stateAt } from "../js/core/civ/history.js";
import { eventsOfEntity, evMonth } from "../js/core/civ/graph.js";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true }); for (const k of ["window", "document", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent"]) globalThis[k] = dom.window[k]; globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
let ctxPaints = 0; dom.window.HTMLCanvasElement.prototype.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => { ctxPaints++; } });
const { createVirtualList } = await import("../js/ui/virtual-list.js"); const { initHistoryWindow } = await import("../js/ui/history-window.js");
let failed = 0; const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } }; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const m = worldToMap(generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } })); m.worldTime = { year: 0, month: 1 }; m.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
const civ = createCivState(m.world, { startGroupId: 1, historySeed: 99 }); const sim = createCivSim(m.world, civ); sim.advanceMonths(800 * 12); m.civ = civ; m.worldTime = { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 };
const store = createStore({ map: m }), civActions = createCivActions({ store }), timeActions = createTimeActions({ store, renderer: { requestRender() {} }, civActions }), history = createHistoryActions({ store, civActions });
console.log(`  (800年: 国家 ${Object.keys(civ.states).length}・戦争 ${Object.keys(civ.wars).length}・イベント ${civ.events.length})`);

console.log("=== M10: 問い合わせ ===");
await check("国家の一覧: ページを変えても全件が重複なく並ぶ。並び替え・絞り込み（存続/滅亡）が効く", () => {
  const all = history.listStates({ filter: "all", limit: 1e6 }), alive = history.listStates({ limit: 1e6 }); assert.equal(all.total, Object.keys(civ.states).length); assert.equal(alive.total, Object.values(civ.states).filter((s) => s.alive).length);
  const pages = []; for (let o = 0; o < all.total; o += 7) pages.push(...history.listStates({ filter: "all", offset: o, limit: 7 }).rows.map((r) => r.id)); assert.deepEqual(pages, all.rows.map((r) => r.id)); assert.equal(new Set(pages).size, pages.length);
  const pop = history.listStates({ limit: 1e6 }).rows.map((r) => r.pop); assert.deepEqual(pop, [...pop].sort((a, b) => b - a)); const nm = history.listStates({ sort: "name", limit: 1e6 }).rows.map((r) => r.name); assert.deepEqual(nm, [...nm].sort((a, b) => a.localeCompare(b, "ja")));
  assert.ok(history.listStates({ filter: "dead", limit: 1e6 }).rows.every((r) => !r.alive)); const q = alive.rows[0].name.slice(0, 2); assert.ok(history.listStates({ query: q }).rows.every((r) => r.name.includes(q)));
});
await check("出来事: 新しい順のカーソルで、重複・欠落なく最後まで読める。種類・実体・文字で絞れる", () => {
  let cur = null, n = 0, prev = Infinity; const seen = new Set(); for (;;) { const r = history.listEvents({ before: cur, limit: 997 }); for (const e of r.rows) { assert.ok(!seen.has(e.eventId)); seen.add(e.eventId); assert.ok(evMonth(e) <= prev); prev = evMonth(e); n++; } if (!r.next) break; cur = r.next; } assert.equal(n, civ.events.length);
  const sid = Object.keys(civ.states)[0], byE = history.listEvents({ entityId: sid, limit: 1e6 }).rows.map((e) => e.eventId); assert.deepEqual(byE, eventsOfEntity(civ, sid, { limit: 1e6 }).map((e) => e.eventId));
  assert.ok(history.listEvents({ kind: "war_declared", limit: 1e6 }).rows.every((e) => e.kind === "war_declared")); assert.ok(history.listEvents({ query: "国家", limit: 100 }).rows.every((e) => e.title.includes("国家")));
});
await check("戦争ファミリー: 全ての戦争がちょうど1つのファミリーに入り、同じファミリーの戦争は国家を共有する", () => {
  const fams = history.warFamilies(), ids = fams.flatMap((f) => f.wars.map((w) => w.id)); assert.equal(ids.length, Object.keys(civ.wars).length); assert.equal(new Set(ids).size, ids.length);
  for (const f of fams.filter((x) => x.wars.length > 1)) for (const w of f.wars.slice(1)) { const ps = new Set([...civ.wars[w.id].sides.a, ...civ.wars[w.id].sides.d]); assert.ok(f.wars.some((o) => o.id !== w.id && [...civ.wars[o.id].sides.a, ...civ.wars[o.id].sides.d].some((s) => ps.has(s)))); }
  assert.ok(history.listWars({ limit: 5 }).rows.length <= 5);
});
await check("検索: 前方一致が先。国家・戦争・出来事・人物を横断し、件数に上限がある", () => {
  const s = Object.values(civ.states)[0], r = history.search(s.name.slice(0, 3), 30); assert.ok(r.length >= 1 && r.length <= 30); assert.ok(r.some((x) => x.type === "state" && x.id === s.id)); const sc = r.map((x) => x.score); assert.deepEqual(sc, [...sc].sort((a, b) => a - b));
  assert.ok(history.search("が", 40).some((x) => x.type === "event")); assert.deepEqual(history.search("   "), []);
});
await check("詳細: イベントの原因・結果が因果グラフと一致。判断は全候補つきで展開できる", () => {
  const e = civ.events.find((x) => x.causes.some((c) => /^event_/.test(c.targetId))), d = history.eventDetail(e.eventId); assert.ok(d.causes.length >= 1 && d.graph.nodes.length >= 2); assert.ok(d.causes.every((c) => c.event === null || c.event.eventId === c.targetId));
  const dec = civ.decisions.find((x) => x.chosen.key), x = history.decisionDetail(dec.decisionId); assert.ok(x.candidates.length >= 1 && x.chosen.key === dec.chosen.key);
});
await check("歴史地図: 現在と過去で持ち主が違い、国家のセルが取れる。見ている月より後の出来事は出ない", () => {
  const now = history.territory(); assert.ok(now.owner.size > 0 && now.states.length >= 1); const past = 400 * 12; history.setView(past); const t = history.territory(); assert.equal(t.month, past); assert.notDeepEqual([...t.owner].sort(), [...now.owner].sort());
  const sid = t.states[0].id; assert.ok(history.stateCells(sid).length >= 1); assert.ok(history.listEvents({ limit: 1e6 }).rows.every((e) => evMonth(e) <= past)); assert.ok(history.band({ from: 0, to: past, limit: 500 }).every((e) => evMonth(e) <= past)); history.setView(null);
});
console.log("=== M10: 過去の閲覧（読み取り専用） ===");
await check("過去の月の一覧・詳細は、月次履歴から復元した値と一致。成立前の国家は『まだ成立していない』", () => {
  const past = 500 * 12; history.setView(past); const rows = history.listStates({ filter: "all", limit: 1e6 }).rows, snap = statesAt(civ, past); assert.equal(rows.length, snap.length); for (const r of rows.slice(0, 30)) assert.equal(r.pop, stateAt(civ, r.id, past).pop);
  const s = rows.find((r) => r.alive); assert.equal(history.stateDetail(s.id).pop, stateAt(civ, s.id, past).pop); const late = Object.values(civ.states).find((x) => x.formedAt > past); if (late) assert.equal(history.stateDetail(late.id).notYet, true); assert.equal(history.meta().past, true); history.setView(null); assert.equal(history.meta().past, false);
});
await check("過去を見ている間は、命令も時間送りも止まる（世界時計も文明も進まない）。現在へ戻すと再開できる", async () => {
  const w0 = { ...m.worldTime }, mi0 = civ.monthIndex; history.setView(300 * 12); const c = civActions.command({ type: "stateAction", stateId: Object.keys(civ.states)[0], action: "set_tax", opt: "up" }); assert.equal(c.ok, false); assert.match(c.error, /過去|読み取り/); assert.equal(civActions.advance().ok, false);
  timeActions.setSpeedPerYear(2400); timeActions.start(); await sleep(250); timeActions.stop(); assert.deepEqual(m.worldTime, w0); assert.equal(civ.monthIndex, mi0);
  history.setView(null); const c2 = civActions.command({ type: "stateAction", stateId: Object.keys(civ.states)[0], action: "set_tax", opt: "up" }); assert.doesNotMatch(String(c2.error ?? ""), /過去|読み取り/);
});
console.log("=== M10: 画面 ===");
await check("仮想スクロール: 10万行でも DOM は見えている分だけ。スクロールで中身が入れ替わり、矢印キーで選べる", () => {
  const got = []; const vl = createVirtualList({ rowHeight: 30, height: 300, getRows: (o, n) => ({ total: 100000, rows: Array.from({ length: Math.min(n, 100000 - o) }, (_, k) => o + k) }), renderRow: (r) => { const e = document.createElement("div"); e.textContent = `行${r}`; return e; }, onSelect: (r) => got.push(r) }); document.body.append(vl.el); vl.refresh();
  assert.ok(vl.el.querySelectorAll("[role=option]").length < 40); assert.equal(vl.total(), 100000); vl.el.scrollTop = 30 * 50000; vl.el.dispatchEvent(new dom.window.Event("scroll")); const first = vl.el.querySelector("[role=option]"); assert.ok(Number(first.dataset.index) >= 49990 && Number(first.dataset.index) <= 50000); assert.ok(vl.el.querySelectorAll("[role=option]").length < 40);
  vl.el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown" })); assert.equal(got.length, 1); vl.el.remove();
});
const wins = { reg: new Map(), openSet: new Set(), register(id, def) { this.reg.set(id, def); }, open(id) { this.openSet.add(id); this.reg.get(id).onOpen?.(); }, isOpen(id) { return this.openSet.has(id); } };
const hv = initHistoryWindow({ store, wins, history, civActions }); const def = wins.reg.get("history"); document.body.append(def.body); wins.open("history"); await sleep(20);
const $ = (s) => def.body.querySelector(s), $$ = (s) => [...def.body.querySelectorAll(s)];
await check("窓: 国家の一覧（仮想）・歴史地図・詳細が出る。行の数は全国家数より少なくてよい（見えている分だけ）", () => { assert.ok($$(".hv-tab").length === 5); assert.ok($$("[data-role=list] [role=option]").length >= 1); assert.ok($(".hv-map")); assert.match($(".hv-mapnote").textContent, /領域/); assert.ok(ctxPaints >= 1); assert.match($("[data-role=detail]").textContent, /概要/); });
await check("国家を選ぶと、詳細・地図の強調・出来事の絞り込みが同じ国家に連動する", async () => {
  const r0 = $("[data-role=list] [role=option]"); r0.click(); await sleep(10); const id = hv.state.sel.id, name = civ.states[id].name; assert.equal(hv.state.sel.type, "state"); assert.ok($("[data-role=detail]").textContent.includes(name)); const paints = ctxPaints;
  $$(".hv-tab").find((b) => b.dataset.tab === "events").click(); await sleep(10); const evs = $$("[data-role=events] .hv-ev"); assert.ok(evs.length >= 1); assert.match($("[data-role=controls]").textContent, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  evs[0].click(); await sleep(10); assert.match($("[data-role=detail]").textContent, /原因/); assert.ok(ctxPaints >= paints);
});
await check("詳細の名前から別の国家・戦争・出来事へ辿れる（リンク）", async () => { const b = $$("[data-role=detail] .hv-link"); assert.ok(b.length >= 1); const before = JSON.stringify(hv.state.sel); b[0].click(); await sleep(10); assert.notEqual(JSON.stringify(hv.state.sel), before); });
await check("地図をクリックすると、その領域の国家が選ばれる", async () => {
  const t = history.territory(), sid = t.states[0].id, cells = history.stateCells(sid), { cellRaster } = await import("../js/core/world/cell-raster.js"), cr = cellRaster(m.world, 480, 240); let px = -1; for (let i = 0; i < cr.length; i++) if (cells.includes(cr[i])) { px = i; break; } assert.ok(px >= 0);
  const cv = $(".hv-map"); cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 240 }); cv.dispatchEvent(new dom.window.MouseEvent("click", { clientX: px % 480 + 0.5, clientY: Math.floor(px / 480) + 0.5, bubbles: true })); await sleep(10); assert.equal(hv.state.sel.id, sid);
});
await check("過去の月へ動かすと、『過去の閲覧』の表示・現在へ戻る・読み取り専用になり、戻すと元へ", async () => {
  const sl = $(".hv-slider"); assert.equal($("[data-role=past]").hidden, true); sl.value = String(300 * 12); sl.dispatchEvent(new dom.window.Event("change")); await sleep(20); assert.equal($("[data-role=past]").hidden, false); assert.ok(def.body.classList.contains("past")); assert.match($("[data-role=date]").textContent, /^300年/); assert.equal($("[data-role=back]").hidden, false); assert.match($(".hv-mapnote").textContent, /月次履歴から復元/);
  $("[data-role=back]").click(); await sleep(20); assert.equal($("[data-role=past]").hidden, true); assert.ok(!def.body.classList.contains("past")); assert.equal(history.isPast(), false);
});
await check("Ctrl+K で検索へ。検索結果から選べる", async () => {
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); await sleep(20); assert.equal(hv.state.tab, "search"); const q = $("[data-role=search2]"); assert.ok(q); q.value = Object.values(civ.states)[0].name.slice(0, 2); q.dispatchEvent(new dom.window.Event("change")); await sleep(20); const rows = $$("[data-role=list] [role=option]"); assert.ok(rows.length >= 1); rows[0].click(); await sleep(10); assert.ok(hv.state.sel);
});
await check("書き出しパネル: 件数の見積もりが出て、ボタンで ZIP が作られ、ダウンロードされる（範囲指定も反映）", async () => {
  let blob = null, name = null; dom.window.URL.createObjectURL = (b) => { blob = b; return "blob:x"; }; globalThis.URL.createObjectURL = dom.window.URL.createObjectURL; dom.window.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  const d = $("[data-role=export]"); d.open = true; d.dispatchEvent(new dom.window.Event("toggle")); await sleep(300); assert.match($(".hv-exbody").textContent, /ノート約 [\d,]+ 件/);
  const inputs = $$(".hv-exrange input"); inputs[0].value = "400"; inputs[0].dispatchEvent(new dom.window.Event("change")); inputs[1].value = "450"; inputs[1].dispatchEvent(new dom.window.Event("change")); await sleep(300); const small = Number($(".hv-exbody p").textContent.match(/ノート約 ([\d,]+)/)[1].replace(/,/g, ""));
  const cb = $(".hv-exbody input[type=checkbox]"); cb.checked = false; cb.dispatchEvent(new dom.window.Event("change")); await sleep(300); const smaller = Number($(".hv-exbody p").textContent.match(/ノート約 ([\d,]+)/)[1].replace(/,/g, "")); assert.ok(smaller < small && small < civ.events.length + civ.decisions.length);
  $("[data-role=export-go]").click(); for (let i = 0; i < 100 && !blob; i++) await sleep(300); assert.ok(blob, "ZIP がダウンロードされていない"); assert.match(name, /_obsidian\.zip$/); for (let i = 0; i < 20 && !/書き出しました/.test($(".hv-exbody p").textContent); i++) await sleep(100); console.log("MSG", $(".hv-exbody p").textContent); assert.match($(".hv-exbody p").textContent, /書き出しました.*リンク切れ 0 件/);
});
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else { console.log("\n全て成功"); process.exit(0); }
