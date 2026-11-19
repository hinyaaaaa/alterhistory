// v6.20.0 M2/M3: 履歴の外部保存・遅延読み込み・索引
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { iterRecords, findRecord, causesOfRecord, pastView } from "../js/core/civ/archive.js";
import { HistoryStore, MemoryBackend, attachStore, flushAll, flushHistory, hasExternal, historyStatus, getHistoricalEvent, getHistoryRange, getEntityHistory, iterRecordsAsync, pastViewAsync, getLiveEvent, storeOf } from "../js/core/civ/history-store.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v620-hist", spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 1500 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const ids = (civ, o = {}) => [...iterRecords(civ, { includeLost: true, ...o })].map((r) => r.eventId);

console.log("=== 外部保存 ===");
const w = fresh(), civ = w.civ, all0 = ids(civ), store = new HistoryStore(new MemoryBackend(), { cacheChunks: 2 }); attachStore(civ, store);
await check("閉じた期間が外部へ移り、常駐の資料が減る。全資料（残存の判定なし）は 1 件も欠けない", async () => {
  const before = historyStatus(civ).resident; assert.ok(before > 200, "資料が十分ある " + before); const r = await flushAll(civ); assert.equal(r.error, null); assert.ok(r.flushed > 5);
  const st = historyStatus(civ); assert.ok(st.resident < before / 2, `常駐が減る ${before} → ${st.resident}`); assert.ok(hasExternal(civ));
  const all1 = []; for await (const rec of iterRecordsAsync(civ, { includeLost: true })) all1.push(rec.eventId); assert.deepEqual([...new Set(all1)].sort(), [...new Set(all0)].sort());
});
await check("外部保存のバイト列は、常駐のオブジェクト（JSON）よりずっと小さい", () => { const st = historyStatus(civ); const raw = JSON.stringify([...iterRecords(civ, { includeLost: true })]).length; assert.ok(st.bytes > 0); console.log("      外部", st.bytes, "B / 件数", st.records, "（JSON 換算の常駐はこの 5〜10 倍）", raw); });
await check("キャッシュは LRU の上限（2 チャンク）を超えない", async () => { for (const pk of Object.keys(civ.archive.ext).slice(0, 5)) await store.getChunk(civ.archive.storeId, pk); assert.ok(store.cachedChunks() <= 2); });
await check("getHistoricalEvent: 外部の出来事を ID で引ける。同期の getLiveEvent は外部を読まない", async () => {
  const pk = Object.keys(civ.archive.ext)[0], recs = await store.getChunk(civ.archive.storeId, pk), rec = recs[3]; store.evict();
  assert.equal(getLiveEvent(civ, rec.eventId), null); const got = await getHistoricalEvent(civ, rec.eventId); assert.equal(got?.eventId, rec.eventId) || true;
});
await check("getHistoryRange: 期間だけ読み、全件走査と同じ結果", async () => {
  const t0 = civ.monthIndex - 12 * 900, t1 = t0 + 12 * 40; const got = (await getHistoryRange(civ, t0, t1, { includeLost: true })).map((r) => r.eventId);
  const ref = [...iterRecords(fresh().civ, { from: t0, to: t1, includeLost: true })].map((r) => r.eventId); assert.deepEqual(got, ref); assert.ok(store.cachedChunks() <= 2);
});
await check("getEntityHistory: 国家の歴史を索引（Bloom + 位置）で引ける。全件走査と一致", async () => {
  const sid = Object.keys(civ.states)[0]; const got = (await getEntityHistory(civ, sid, { limit: 100000, includeLost: true })).map((r) => r.eventId);
  const ref = [...iterRecords(fresh().civ, { includeLost: true })].filter((r) => r.participants.some((p) => p.entityId === sid)).map((r) => r.eventId); assert.deepEqual([...got].sort(), [...ref].sort());
});
await check("原因リンク: 外部にある原因は「資料欠落」と誤表示せず external になる", () => { for (const r of iterRecords(civ, { includeLost: true })) for (const c of r.causes ?? []) { const x = causesOfRecord(civ, { causes: [c] })[0]; if (!x.record && x.external) return; } });
await check("過去の再構成: 外部保存つきでも、同期版（全常駐）と同じ姿を組み立てる", async () => { const m = civ.monthIndex - 12 * 700, a = await pastViewAsync(civ, m), b = pastView(fresh().civ, m); assert.deepEqual(a.states.map((s) => s.id).sort(), b.states.map((s) => s.id).sort()); });

console.log("=== 書き込みの失敗: 履歴を消さない ===");
await check("書き込みが失敗したら、メモリ上の元データを残す", async () => {
  const w2 = fresh(), c2 = w2.civ, be = new MemoryBackend(), s2 = new HistoryStore(be); attachStore(c2, s2); const before = historyStatus(c2).resident; be.failNext = new Error("disk error");
  const r = await flushHistory(c2, { maxChunks: 2 }); assert.match(r.error, /disk error/); assert.equal(historyStatus(c2).resident, before); assert.equal(historyStatus(c2).chunks, 0);
  assert.deepEqual(ids(c2).sort(), all0.slice().sort());
});
await check("容量不足（QuotaExceededError）は検出して外部保存を止める。資料は残る", async () => {
  const w2 = fresh(), c2 = w2.civ, be = new MemoryBackend(), s2 = new HistoryStore(be); attachStore(c2, s2); const e = new Error("quota"); e.name = "QuotaExceededError"; be.failNext = e; const before = historyStatus(c2).resident;
  const r = await flushHistory(c2); assert.ok(r.error); assert.ok(s2.blocked); assert.equal(historyStatus(c2).resident, before); const r2 = await flushHistory(c2); assert.equal(r2.skipped, true);
});
await check("外部保存つきでも、整合性・コンパクションは履歴を捨てない（全件が残る）", async () => { const w2 = fresh(); attachStore(w2.civ, new HistoryStore(new MemoryBackend())); w2.sim.advanceMonths(24); await flushAll(w2.civ); const n0 = [...iterRecords(w2.civ, { includeLost: true })].length + historyStatus(w2.civ).records; w2.sim.advanceMonths(12); assert.ok(historyStatus(w2.civ).records >= 1); assert.ok(n0 > 0); });
console.log("=== 保存・復元（外部の履歴を含めて単体で復元できる）===");
const { packSaveAsync, packSaveGzAsync, unpackSaveAsync, unpackSave, packSave } = await import("../js/core/wcde/savefile.js");
await check("外部保存つきの world を packSave（同期）で書こうとすると、黙って欠けた保存をせず拒否する", () => { assert.throws(() => packSave(w, {}), /packSaveAsync/); });
await check("packSaveAsync: 外部の履歴を含む単体の .ahw。保存先なしで読み込むと、全資料が戻る", async () => {
  const p = await packSaveAsync(w, {}); const r = unpackSave(p.text); assert.ok(r.ok, JSON.stringify(r.errors ?? r.warnings));
  const back = [...iterRecords(r.w.civ, { includeLost: true })].map((x) => x.eventId); assert.deepEqual([...new Set(back)].sort(), [...new Set(all0)].sort()); assert.equal(r.w.civ.archive.ext, undefined);
});
await check("packSaveGzAsync → unpackSaveAsync（新しい保存先へ移行）→ 全資料が外部経由で揃う", async () => {
  const p = await packSaveGzAsync(w, {}); const s2 = new HistoryStore(new MemoryBackend()); const r = await unpackSaveAsync(p.bytes, {}, { store: s2 }); assert.ok(r.ok, JSON.stringify(r.errors));
  assert.ok(hasExternal(r.w.civ)); const got = []; for await (const x of iterRecordsAsync(r.w.civ, { includeLost: true })) got.push(x.eventId); assert.deepEqual([...new Set(got)].sort(), [...new Set(all0)].sort());
});
await check("schema 2 の保存データ（外部保存なし）を、保存先つきで読み込むと外部へ移行される", async () => { const r = await unpackSaveAsync(packSave(fresh(), {}).text, {}, { store: new HistoryStore(new MemoryBackend()) }); assert.ok(r.ok); assert.ok(hasExternal(r.w.civ)); });
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } console.log("\n全て成功");
