// v5.3 UI: 積もった世界（数千国家・数万戦争・百万件の出来事）でも、実アダプターの一覧・詳細・年表・月送りが一定時間で返る。
//   実際の文明を 300 年進めたものを土台に、出来事・国家・戦争を水増しする（時間の閾値は CPU を取り合う開発環境のもの。緩めない）。
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
import { validateAdapter } from "../js/ui/v53/adapters/contract.js";
import { verifyParts } from "../js/ui/v53/export/obsidian-split.js";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "Event"]) globalThis[k] = dom.window[k];
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const { createLiveAdapter } = await import("../js/ui/v53/adapters/live-adapter.js");
let failed = 0; const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); } };

const m = worldToMap(generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } })); m.worldTime = { year: 0, month: 1 }; m.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
const civ = createCivState(m.world, { startGroupId: 1, historySeed: 99 }); const sim = createCivSim(m.world, civ); sim.advanceMonths(300 * 12); m.civ = civ; m.worldTime = { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 };
const store = createStore({ map: m, fileName: "v53.ahmap", view: {}, timeRunning: false, exportOpts: {} });
const civActions = createCivActions({ store }), renderer = { requestRender() {} };
const timeActions = createTimeActions({ store, renderer, civActions }), history = createHistoryActions({ store, civActions });
let toggled = []; const actions = { toggle: (k) => toggled.push(k), fit() {}, newWorld: async () => ({ ok: true }) };
const A = createLiveAdapter({ store, civActions, history, timeActions, actions, createCanvas: null, eventChunk: 500, now: () => Date.now() });

// ---- 水増し: 出来事（実イベントを年をずらして複製）・国家・戦争 ----
const baseEvents = civ.events.slice(), baseYears = Math.floor(civ.monthIndex / 12) + 1, REPS = Math.ceil(1_000_000 / baseEvents.length);
const bigEvents = [...baseEvents];
for (let k = 1; k < REPS; k++) for (const e of baseEvents) bigEvents.push({ ...e, eventId: `${e.eventId}_r${k}`, date: { ...e.date, year: e.date.year + baseYears * k } });
civ.events = bigEvents; civ.monthIndex += baseYears * 12 * (REPS - 1);
const ids = Object.keys(civ.states);
for (let i = 0; i < 4000; i++) civ.states[`state_fake_${i}`] = { ...civ.states[ids[i % ids.length]], id: `state_fake_${i}`, name: `仮の国${i}`, alive: i % 5 === 0, player: false, pop: 1000 + i };
const ws = Object.values(civ.wars)[0];
for (let i = 0; i < 30000; i++) { const s0 = Math.max(0, civ.monthIndex - 1 - i * 3); civ.wars[`war_fake_${i}`] = { ...ws, id: `war_fake_${i}`, startedAt: s0, endedAt: i < 5 ? null : s0 + 30, aggressor: ids[i % ids.length], defender: ids[(i + 1) % ids.length], sides: { a: [ids[i % ids.length]], d: [ids[(i + 1) % ids.length]] }, events: [] }; }
civ.activeWarIds = [...civ.activeWarIds, ...Array.from({ length: 5 }, (_, i) => `war_fake_${i}`)];
console.log(`  （水増し後: ${Math.floor(civ.monthIndex / 12).toLocaleString("ja-JP")} 年・国家 ${Object.keys(civ.states).length.toLocaleString("ja-JP")}・戦争 ${Object.keys(civ.wars).length.toLocaleString("ja-JP")}・出来事 ${civ.events.length.toLocaleString("ja-JP")}）`);
const ms = (f, n = 15) => { f(); const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(i); return Number(process.hrtime.bigint() - t) / 1e6 / n; };
const tickMonth = () => { civ.events.push({ ...baseEvents[baseEvents.length - 1], eventId: `tick_${civ.events.length}`, date: { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 } }); civ.monthIndex++; store.update(() => {}); };

console.log("=== 積もった世界の一覧・詳細・年表 ===");
await check("契約を満たし、meta が返る", () => { assert.deepEqual(validateAdapter(A), []); A.meta(); assert.ok(A.meta().events > 900000); });
await check("出来事の一覧（全件・分類・期間・国家で絞る）: 1 回 5 ms 未満。最後の行まで届く", () => {
  const t = A.list("event", { limit: 1 }).total; assert.equal(t, civ.events.length);
  for (const [name, o] of [["全件", {}], ["分類", { filter: "war" }], ["期間", { range: "100" }], ["国家", { entity: ids[0] }]]) { const v = ms((i) => A.list("event", { ...o, offset: (i ?? 0) * 5000, limit: 50 })); console.log(`       出来事 ${name}: ${v.toFixed(2)} ms`); assert.ok(v < 5, `${name} ${v}`); }
  assert.equal(A.list("event", { offset: t - 1, limit: 5 }).rows.length, 1);
  assert.ok(A.list("event", { range: "10", limit: 1 }).total < t / 10);
});
await check("戦争の一覧（継続中・全件・期間・国家で絞る・検索）: 月が進んだ直後の初回でも 120 ms 未満、保持後は 5 ms 未満", () => {
  tickMonth(); const t0 = process.hrtime.bigint(); const first = A.list("war", { filter: "active", limit: 50 }); const f = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`       戦争 月の直後の初回: ${f.toFixed(1)} ms`); assert.ok(f < 120, `${f}`); assert.ok(first.total >= 5 && first.total <= 40);
  for (const [name, o] of [["継続中", { filter: "active" }], ["全件", {}], ["期間", { range: "10" }], ["国家", { entity: ids[1] }], ["検索", { query: "戦" }]]) { const v = ms((i) => A.list("war", { ...o, offset: (i ?? 0) * 100, limit: 50 })); console.log(`       戦争 ${name}: ${v.toFixed(2)} ms`); assert.ok(v < 5, `${name} ${v}`); }
  assert.equal(A.list("war", { limit: 1 }).total, Object.keys(civ.wars).length);
});
await check("国家の一覧（存続中・滅亡・検索）と国家の詳細（関連戦争・出来事の入口つき）", () => {
  for (const o of [{}, { filter: "dead" }, { query: "仮の国1" }]) { const v = ms((i) => A.list("state", { ...o, offset: (i ?? 0) * 40, limit: 40 })); console.log(`       国家 ${JSON.stringify(o)}: ${v.toFixed(2)} ms`); assert.ok(v < 30, `${v}`); }
  const d0 = process.hrtime.bigint(); const d = A.detail("state", ids[0]); const dv = Number(process.hrtime.bigint() - d0) / 1e6; console.log(`       国家の詳細: ${dv.toFixed(1)} ms`); assert.ok(dv < 80, `${dv}`);
  assert.ok(d.browse.some((b) => b.domain === "war") && d.browse.some((b) => b.domain === "history")); assert.ok(d.related.length >= 0);
  const nw = d.browse.find((b) => b.domain === "war").count; assert.equal(A.list("war", { entity: ids[0], limit: 1 }).total, nw);
});
await check("年表の目印: 全期間・直近 100 年・直近 10 年が、どれも 20 ms 未満で、件数の合計が一致する", () => {
  const m = A.meta(); for (const span of [m.now - m.first, 1200, 120]) { const v = ms(() => A.bandBuckets({ from: m.now - span, to: m.now, buckets: 160 })); const b = A.bandBuckets({ from: m.now - span, to: m.now, buckets: 160 }); console.log(`       目印 ${Math.round(span / 12)}年: ${v.toFixed(2)} ms（${b.length} 区間）`); assert.ok(v < 20, `${v}`); assert.ok(b.length <= 160 && b.every((x) => x.n >= 1)); }
});
await check("月が進むたびの作業（meta・新着・ニュース 3 件）は、出来事が 100 万件あっても 15 ms 未満", () => {
  const v = ms(() => { tickMonth(); A.meta(); A.newEvents(); A.list("event", { limit: 3 }); }, 20); console.log(`       月送り 1 回: ${v.toFixed(2)} ms`); assert.ok(v < 15, `${v}`);
});
await check("過去の月を見ても（setView）、一覧が壊れず件数が減る。現在へ戻せる", () => {
  const m = A.meta(), all = A.list("event", { limit: 1 }).total; A.setView(m.now - 600); const past = A.list("event", { limit: 1 }).total; assert.ok(past < all); assert.ok(A.list("war", { limit: 1 }).total <= Object.keys(civ.wars).length); A.setView(null); assert.equal(A.list("event", { limit: 1 }).total, all);
});
await check("横断検索: 国家・戦争・出来事が種類ごとに上位だけ返り、出来事の検索は途中なら pending で続きが進む", () => {
  let r, g = 0; do { r = A.search("仮の国12"); g++; } while (r.pending && g < 5000); assert.ok(!r.pending); assert.ok(r.groups.find((x) => x.kind === "state")?.rows.length <= 6); assert.ok(r.groups.find((x) => x.kind === "state").total >= 1);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
