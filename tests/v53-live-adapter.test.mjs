// v5.3 UI: 実アダプター（本体の store / civ / history-actions に接続）。実際の文明を 400 年進め、契約・一覧・詳細・通知・開始フロー・出力が成り立つか。
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
const civ = createCivState(m.world, { startGroupId: 1, historySeed: 99 }); const sim = createCivSim(m.world, civ); sim.advanceMonths(800 * 12); m.civ = civ; m.worldTime = { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 };
const store = createStore({ map: m, fileName: "v53.ahmap", view: {}, timeRunning: false, exportOpts: {} });
const civActions = createCivActions({ store }), renderer = { requestRender() {} };
const timeActions = createTimeActions({ store, renderer, civActions }), history = createHistoryActions({ store, civActions });
let toggled = []; const actions = { toggle: (k) => toggled.push(k), fit() {}, newWorld: async () => ({ ok: true }) };
const A = createLiveAdapter({ store, civActions, history, timeActions, actions, createCanvas: null, eventChunk: 500, now: () => Date.now() });
console.log(`  (800年: 国家 ${Object.keys(civ.states).length}・戦争 ${Object.keys(civ.wars).length}・イベント ${civ.events.length})`);

console.log("=== 実アダプター ===");
await check("契約を満たす（不足するメンバーがない）", () => assert.deepEqual(validateAdapter(A), []));
await check("meta: 世界・文明・件数・過去かどうか", () => { const x = A.meta(); assert.ok(x.hasWorld && x.hasCiv); assert.equal(x.now, civ.monthIndex); assert.equal(x.events, civ.events.length); assert.equal(x.past, false); assert.ok(x.states >= 1 && x.cells > 1000); });
await check("国家の一覧: 全件が重複なく読め、検索・並び替えが効く", () => {
  const all = A.list("state", { limit: 1e6 }); assert.equal(all.total, Object.values(civ.states).filter((s) => s.alive).length); assert.equal(new Set(all.rows.map((r) => r.id)).size, all.rows.length);
  const pg = []; for (let o = 0; o < all.total; o += 3) pg.push(...A.list("state", { offset: o, limit: 3 }).rows.map((r) => r.id)); assert.deepEqual(pg, all.rows.map((r) => r.id));
  const q = all.rows[0].title.slice(0, 2); assert.ok(A.list("state", { query: q }).rows.every((r) => r.title.includes(q)));
});
await check("戦争の一覧: 家族に束ねず、個別の戦争がすべて出る（件数 = 戦争の総数）", () => {
  const r = A.list("war", { limit: 1e6 }); assert.equal(r.total, Object.keys(civ.wars).length); assert.equal(new Set(r.rows.map((x) => x.id)).size, r.total);
  assert.equal(A.list("war", { filter: "active", limit: 1e6 }).total, civ.activeWarIds.length);
});
await check("出来事の一覧: 仮想スクロールの位置指定で、新しい順に重複・欠落なく最後まで読める", () => {
  const total = A.list("event", { limit: 1 }).total; assert.equal(total, civ.events.length);
  const ids = []; for (let o = 0; o < total; o += 777) ids.push(...A.list("event", { offset: o, limit: 777 }).rows.map((r) => r.id));
  assert.equal(ids.length, total); assert.equal(new Set(ids).size, total); assert.equal(ids[0], civ.events.at(-1).eventId); assert.equal(ids.at(-1), civ.events[0].eventId);
  for (const o of [499, 500, 1499, 1500, 2300]) assert.deepEqual(A.list("event", { offset: o, limit: 5 }).rows.map((r) => r.id), ids.slice(o, o + 5), `offset ${o}`); // chunk（500件）の境界をまたぐ位置
  assert.deepEqual(A.list("event", { offset: total + 10, limit: 5 }).rows, []);
});
await check("出来事の分類で絞ると、その分類だけが出る", () => { const tag = A.list("event", { limit: 1 }).rows[0].tag, id = { 国家: "state", 戦争: "war", 外交: "diplomacy", 災害: "disaster", 技術: "tech", "文化・宗教": "culture", 魔法: "magic", 社会: "society" }[tag]; const r = A.list("event", { filter: id, limit: 50 }); assert.ok(r.total > 0); assert.ok(r.rows.every((x) => x.tag === tag)); });
await check("詳細: 国家・戦争・出来事が、概要/状態/関連の形に正規化される。原因が無い出来事は、虚偽の原因を作らない", () => {
  const sid = A.list("state", { limit: 1 }).rows[0].id, s = A.detail("state", sid); assert.equal(s.kind, "state"); assert.ok(s.stats.length >= 5 && s.summary);
  const wid = Object.keys(civ.wars)[0], w = A.detail("war", wid); assert.ok(w.related.some((r) => r.kind === "state") && w.progress.length === 3);
  const noCause = civ.events.find((e) => !e.causes.length), d = A.detail("event", noCause.eventId); assert.match(d.summary, /先行事象はありません/); assert.ok(!d.related.some((r) => /^原因/.test(r.relation)));
  const withCause = civ.events.find((e) => e.causes.some((c) => /^event_/.test(c.targetId))); const d2 = A.detail("event", withCause.eventId); assert.ok(d2.related.some((r) => /^原因/.test(r.relation)));
  const dec = civ.decisions.find((x) => x.chosen.key); assert.ok(A.detail("decision", dec.decisionId).stats.length >= 1);
});
await check("帯の目印と、通知用の新しい出来事（影響度の入力つき・重複なく1回だけ）", () => {
  const first = A.meta().first, b = A.band({ from: first, to: civ.monthIndex, limit: 100 }); assert.ok(b.length > 0 && b.length <= 100);
  assert.deepEqual(A.newEvents(), []); // 初回は現在位置から数える
  for (let i = 0; i < 36; i++) A.time.step(); const ev = A.newEvents(); assert.ok(ev.length > 0 && ev.every((e) => e.id && e.impact && typeof e.impact.actorPopShare === "number")); assert.deepEqual(A.newEvents(), []);
  assert.ok(ev.every((e) => e.impact.actorPopShare >= 0 && e.impact.actorPopShare <= 1.0001));
});
await check("過去の閲覧: 月を選ぶと一覧・詳細がその月の状態になり、操作と時間送りは止まる。現在へ戻れる", () => {
  const now = A.meta().now, past = now - 12 * 120; A.setView(past); const x = A.meta(); assert.equal(x.past, true); assert.equal(x.view, past);
  assert.ok(A.list("event", { limit: 1 }).rows.length === 1); const latest = civ.events.findLast((e) => e.date.year * 12 + e.date.month - 1 <= past); assert.equal(A.list("event", { limit: 1 }).rows[0].id, latest.eventId);
  const sid = A.list("state", { limit: 1 }).rows[0]?.id; if (sid) { const d = A.detail("state", sid); assert.match(d.notice, /読み取り専用/); assert.deepEqual(A.actions("state", sid).filter((a) => a.enabled), []); assert.equal(A.runAction("state", sid, "x").ok, false); }
  const before = civ.monthIndex; A.time.step(); assert.equal(civ.monthIndex, before); A.time.start(); assert.equal(A.time.isRunning(), false);
  assert.equal(A.newEvents().length, 0); A.setView(null); assert.equal(A.meta().past, false);
});
await check("時間: 1か月進めると文明が進む。重大イベントの確認待ち（実行ガード）の間は進まない", () => {
  const before = civ.monthIndex; assert.equal(A.time.step(), true); assert.equal(civ.monthIndex, before + 1);
  A.setRunGuard(() => false); assert.equal(A.time.step(), false); A.time.start(); assert.equal(A.time.isRunning(), false); assert.equal(civ.monthIndex, before + 1); A.setRunGuard(() => true);
});
await check("プレイヤー国家の操作: 資格のある行動だけ有効、実行は本体の stateAction を通る", () => {
  const p = Object.values(civ.states).find((s) => s.alive && s.player); if (!p) return; const acts = A.actions("state", p.id); assert.ok(acts.length > 0);
  const ok = acts.find((a) => a.enabled); if (ok) { const r = A.runAction("state", p.id, ok.id); assert.equal(typeof r.ok, "boolean"); }
  const other = Object.values(civ.states).find((s) => s.alive && !s.player); if (other) assert.deepEqual(A.actions("state", other.id), []);
});
await check("レイヤー: 本体の LAYERS の一部を出し、切替は本体の actions.toggle に渡る", () => { const l = A.layers(); assert.ok(l.length >= 5 && l.every((x) => x.key && x.label)); A.toggleLayer("borders"); assert.deepEqual(toggled, ["borders"]); });
await check("開始フローの状態: 文明が進行中で、プレイヤー国家が無ければ running、成立の提案があれば ready", () => {
  const s = A.start.state(); assert.ok(["running", "founded", "ready"].includes(s.phase)); const r = A.start.readiness(); assert.equal(typeof r.ready, "boolean");
});
await check("出力: Chronicle が文明史（国家・戦争・出来事・AI判断）を含む", async () => {
  const r = await A.exports.chronicle(); const t = await r.blob.text(); assert.match(r.name, /\.chronicle\.md$/); assert.match(t, /# 文明史/); assert.match(t, /## 国家/); assert.match(t, /## 戦争/); assert.match(t, /## 出来事/); assert.match(t, /## AI判断/);
  const s = Object.values(civ.states)[0]; assert.ok(t.includes(s.name)); assert.ok(t.includes(civ.events[0].eventId)); assert.ok(t.includes(civ.decisions[0].decisionId));
});
await check("出力: .ahmap は保存でき、読み込み直せる（往復）", async () => { const { loadMapBytes } = await import("../js/io/ahmap-file.js"); const r = await A.exports.ahmap(); assert.match(r.name, /\.ahmap$/); const back = await loadMapBytes(new Uint8Array(await r.blob.arrayBuffer())); const bm = back.map ?? back; assert.equal((bm.civ ?? back.civ).events.length, civ.events.length); });
await check("出力: Obsidian は小さい上限で複数の ZIP に分割され、欠落・重複がなく、全ファイルが元の出力と一致する", async () => {
  const { obsidianFiles } = await import("../js/io/obsidian.js"); const { cellRaster } = await import("../js/core/world/cell-raster.js"); const { unzipFiles } = await import("../js/io/zip.js");
  const parts = []; const all = new Map();
  for await (const p of A.exports.obsidian({ maxPartBytes: 1.5 * 1024 * 1024, maxPartFiles: 400 })) { const { bytes, ...sum } = p; parts.push(sum); for (const [path, data] of await unzipFiles(bytes)) { assert.ok(!all.has(path), `重複 ${path}`); all.set(path, data); } }
  assert.ok(parts.length >= 2, `分割されること（${parts.length}）`); assert.deepEqual(verifyParts(parts), []);
  let ref = 0, refNames = new Set(); for await (const f of obsidianFiles(m.world, civ, A.meta().name || "世界", { cellRaster })) { if (f.kind === "manifest") continue; ref++; refNames.add(f.path); }
  const real = [...all.keys()].filter((k) => !/\/_parts\//.test(k) && !/\/manifest\.json$/.test(k)); assert.equal(real.length, ref); for (const k of real) assert.ok(refNames.has(k));
  assert.ok([...all.keys()].some((k) => /\/manifest\.json$/.test(k))); assert.ok([...all.keys()].some((k) => /_parts\/index\.json$/.test(k)));
});
await check("出力: PNG は 2 種（現在の地図・選択年月の領土図）とも実際に描かれ、画像の下に『何の画像か』の帯が付く", async () => {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas"); const B = createLiveAdapter({ store, civActions, history, timeActions, actions, createCanvas, eventChunk: 500 });
  const t = await B.exports.png({ kind: "territory" }); const ti = await loadImage(Buffer.from(await t.blob.arrayBuffer())); assert.equal(ti.width, 2048); assert.ok(ti.height > 1024 && ti.height < 1024 + 200, `帯つき ${ti.height}`); assert.match(t.name, /_territory_\d+\.png$/); assert.match(t.meta.summary, /投影/); assert.match(t.meta.captionLines[0], /領土図/);
  const c = await B.exports.png({ kind: "current" }); const ci = await loadImage(Buffer.from(await c.blob.arrayBuffer())); assert.ok(ci.width > 1000 && ci.height > 500); assert.equal(c.meta.kind, "current"); assert.match(c.meta.summary, /表示レイヤー/);
  B.setView(B.meta().now - 12 * 100); const past = await B.exports.png({ kind: "territory" }); assert.match(past.meta.captionLines[0], new RegExp(`${Math.floor((B.meta().now - 1200) / 12)}年`)); B.setView(null);
  await assert.rejects(() => A.exports.png({ kind: "current" }), /描画機能/);
});
console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
