// v6.20.0 M2/M3: 履歴の外部保存（HistoryStore）と遅延読み込み。仕様 §3・§4。
//   構成: Live（civ.events: 直近 36 か月）→ 保存待ち（資料のまま常駐。書き込みが検証されるまで正本）→ 外部保存（IndexedDB。1〜10 年の物理チャンク・圧縮）→ LRU キャッシュ（最近読んだ数チャンク）。
//   書き込みの手順: チャンクを圧縮 → 書く → 読み戻して検証 → 成功したときだけ、メモリ上の記録を解放 → 索引・マニフェストを更新。失敗したらメモリの元データを残す（履歴を消さない）。
//   IndexedDB だけを唯一の保存場所にしない: 容量の確認・永続化の要求・容量不足の検出・書き込みの一時停止・完全な書き出し（packSaveAsync）を備える。
//   シミュレーションは外部保存を直接参照しない（同期の getLiveEvent）。過去の閲覧だけが非同期 API（getHistoricalEvent / getHistoryRange / getEntityHistory）で読む。
import { archiveOf, iterRecords, survives, policyOf, LIVE_MONTHS, CHUNK_YEARS, setStoreOf, storeOf, residentRecords, replaceResident, pastReduce, PAST_TYPES, checkRecords } from "./archive.js";
import { buildIndex, bloomOf, bloomHas, idN } from "./history-index.js";
export { storeOf };
export const PHYS_YEARS = 5;
export const pkOf = (t, years = PHYS_YEARS) => Math.floor(t / 12 / years);
const sum32 = (u8) => { let a = 1, b = 0; for (let i = 0; i < u8.length; i++) { a = (a + u8[i]) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; };
const enc = new TextEncoder(), dec = new TextDecoder();

async function pipe(input, stream) { const w = stream.writable.getWriter(), wr = (async () => { await w.write(input); await w.close(); })(); wr.catch(() => {}); const parts = [], r = stream.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); } await wr; let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
/** 圧縮・展開（同じスレッド）。Worker 版は workers/history-worker.js の WorkerCodec */
export const InlineCodec = { async encode(recs) { const raw = enc.encode(JSON.stringify(recs)); return typeof CompressionStream === "function" ? pipe(raw, new CompressionStream("gzip")) : raw; }, async decode(bytes) { const raw = bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === "function" ? await pipe(bytes, new DecompressionStream("gzip")) : bytes; return JSON.parse(dec.decode(raw)); } };

/** 非同期の保存先の共通形（get/put/delete/keys）。メモリ版（試験・IndexedDB が無い環境）。圧縮したバイト列を持つので、オブジェクトのまま持つよりずっと小さい */
export class MemoryBackend {
  constructor() { this.s = { chunks: new Map(), index: new Map(), meta: new Map() }; this.failNext = null; }
  async get(st, k) { return this.s[st].get(k) ?? null; }
  async put(st, k, v) { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } this.s[st].set(k, v); }
  async delete(st, k) { this.s[st].delete(k); }
  async keys(st, prefix = "") { return [...this.s[st].keys()].filter((k) => k.startsWith(prefix)); }
  async usage() { let n = 0; for (const m of Object.values(this.s)) for (const v of m.values()) n += v?.length ?? JSON.stringify(v).length; return { bytes: n }; }
}

export class HistoryStore {
  constructor(backend = new MemoryBackend(), { cacheChunks = 4, physYears = PHYS_YEARS, codec = InlineCodec, onStatus = null } = {}) {
    this.b = backend; this.cap = cacheChunks; this.years = physYears; this.codec = codec; this.cache = new Map(); this.icache = new Map(); this.onStatus = onStatus; this.blocked = null; this.stats = { writes: 0, reads: 0, hits: 0, failures: 0, bytes: 0 };
  }
  key(sid, pk) { return `${sid}:${pk}`; }
  setBlocked(reason) { this.blocked = reason; this.onStatus?.({ blocked: reason }); }
  /** 容量の確認（navigator.storage.estimate）と永続化の要求（persist）。使えない環境では null */
  async quota() { try { const s = globalThis.navigator?.storage; if (!s?.estimate) return null; const e = await s.estimate(); return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: s.persisted ? await s.persisted() : null }; } catch { return null; } }
  async requestPersist() { try { return (await globalThis.navigator?.storage?.persist?.()) ?? null; } catch { return null; } }
  /** 1 チャンクを書く。書き込み → 読み戻して検証 → 索引。戻り値は、civ.archive.ext に載せる要約（ID 範囲・件数・Bloom） */
  async putChunk(sid, pk, recs) {
    if (this.blocked) throw new Error("履歴の外部保存は停止中です: " + this.blocked);
    try {
      const bytes = await this.codec.encode(recs), idx = buildIndex(recs), k = this.key(sid, pk), ck = sum32(bytes);
      await this.b.put("chunks", k, bytes); const back = await this.b.get("chunks", k);
      if (!back || back.length !== bytes.length || sum32(back) !== ck) throw new Error("書き込みの検証に失敗しました（読み戻した内容が一致しません）");
      await this.b.put("index", k, idx); this.stats.writes++; this.stats.bytes += bytes.length; this.icache.set(k, idx);
      const ids = new Set(); for (const r of recs) for (const p of r.participants ?? []) ids.add(p.entityId);
      return { n: recs.length, bytes: bytes.length, ck, minN: idx.minN, maxN: idx.maxN, tmin: idx.tmin, tmax: idx.tmax, kinds: idx.kinds, bloom: bloomOf(ids) };
    } catch (e) { this.stats.failures++; if (e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message))) this.setBlocked("ブラウザの保存容量が足りません。履歴を書き出す（.ahw）か、容量を空けてください"); throw e; }
  }
  peek(sid, pk) { return this.cache.get(this.key(sid, pk)) ?? null; }
  async getChunk(sid, pk) {
    const k = this.key(sid, pk), hit = this.cache.get(k); if (hit) { this.cache.delete(k); this.cache.set(k, hit); this.stats.hits++; return hit; }
    const bytes = await this.b.get("chunks", k); if (!bytes) throw new Error(`履歴チャンク ${pk} が保存先にありません`); const recs = await this.codec.decode(bytes); this.stats.reads++;
    this.cache.set(k, recs); while (this.cache.size > this.cap) this.cache.delete(this.cache.keys().next().value); return recs; // LRU
  }
  async getIndex(sid, pk) { const k = this.key(sid, pk); let ix = this.icache.get(k); if (!ix) { ix = await this.b.get("index", k); if (ix) { this.icache.set(k, ix); while (this.icache.size > 32) this.icache.delete(this.icache.keys().next().value); } } return ix; }
  evict() { this.cache.clear(); this.icache.clear(); }
  async dropNamespace(sid) { for (const st of ["chunks", "index"]) for (const k of await this.b.keys(st, sid + ":")) await this.b.delete(st, k); this.evict(); }
  cachedChunks() { return this.cache.size; }
  /** 世界ごとの保存領域（namespace）の最終利用を記録する。複数のタブ・過去の世界が同じ保存先を共有するので、使われなくなった世界だけを掃除する */
  async touch(sid) { try { await this.b.put("meta", "ns:" + sid, { at: Date.now() }); } catch { /* 記録できなくても履歴の保存は続ける */ } }
  async prune(keepSid, ttlMs = 30 * 864e5) {
    const sids = new Set(); for (const k of await this.b.keys("chunks")) sids.add(String(k).split(":")[0]); let dropped = 0;
    for (const sid of sids) { if (sid === keepSid) continue; const m = await this.b.get("meta", "ns:" + sid); if (m && Date.now() - m.at < ttlMs) continue; await this.dropNamespace(sid); await this.b.delete("meta", "ns:" + sid); dropped++; }
    return dropped;
  }
}

const arch = (civ) => archiveOf(civ), exts = (civ) => (arch(civ).ext ??= {});
const sidOf = (civ) => { const a = arch(civ); return (a.storeId ??= `w${(civ.historySeed ?? 0)}_${Math.floor(Math.random() * 1e9).toString(36)}_${Date.now().toString(36)}`); };
/** civ に保存先をつなぐ（実行時だけ。保存されるのは storeId と ext の要約だけ） */
export function attachStore(civ, store) { setStoreOf(civ, store); sidOf(civ); return store; }
export const hasExternal = (civ) => Object.keys(arch(civ).ext ?? {}).length > 0;

let flushing = new WeakSet();
/** 閉じた期間の記録を、外部保存へ移す。成功した分だけ、メモリ上の記録を解放する。最大 maxChunks 個。保存待ちの間も記録は常駐のまま（正本）。再入しない */
export async function flushHistory(civ, { maxChunks = 8, force = false } = {}) {
  const store = storeOf(civ); if (!store || store.blocked || flushing.has(civ)) return { flushed: 0, skipped: true }; flushing.add(civ);
  let flushed = 0, failed = null;
  try {
    const a = arch(civ), sid = sidOf(civ), edge = civ.monthIndex - LIVE_MONTHS - 12; // 36 か月の作業バッファ＋12 か月より古い期間だけ（これ以降は同じ期間に記録が増えない）
    const groups = new Map(); for (const r of residentRecords(civ)) { const pk = pkOf(r.t, store.years); if (!force && (pk + 1) * store.years * 12 > edge) continue; (groups.get(pk) ?? groups.set(pk, []).get(pk)).push(r); }
    for (const pk of [...groups.keys()].sort((x, y) => x - y)) {
      if (flushed >= maxChunks) break; const recs = groups.get(pk).sort((x, y) => x.t - y.t || (x.eventId < y.eventId ? -1 : 1)), prev = a.ext?.[pk];
      let all = recs; if (prev) { const old = await store.getChunk(sid, pk); const seen = new Set(old.map((r) => r.eventId)); all = old.concat(recs.filter((r) => !seen.has(r.eventId))); } // 既にある期間へ後から増えた分は、まとめて書き直す
      const bad = checkRecords(recs); if (bad.length) (civ.wcde?.diagnostics ?? []).push({ at: civ.monthIndex, chunk: pk, message: "確定するチャンクの検査: " + bad.slice(0, 3).join(" / ") }); // 過去のイベント: チャンク確定時に検査
      let meta; try { meta = await store.putChunk(sid, pk, all); } catch (e) { failed = e; break; } // 失敗したら、メモリの元データを残す
      const written = new Set(recs); replaceResident(civ, (r) => !written.has(r)); // 検証できたあとに、同期的に解放（await をはさまない）
      exts(civ)[pk] = meta; if (prev) store.cache.delete(store.key(sid, pk)); a.rev++; flushed++;
    }
    if (flushed) store.touch(sid);
  } finally { flushing.delete(civ); }
  return { flushed, error: failed ? String(failed.message ?? failed) : null };
}
/** 閉じた期間をすべて外部保存へ（既存の保存データの移行・読み込み直後など）。止まるまで繰り返す */
export async function flushAll(civ, opts = {}) { let total = 0; for (;;) { const r = await flushHistory(civ, { maxChunks: 64, ...opts }); total += r.flushed; if (r.error || !r.flushed) return { flushed: total, error: r.error ?? null }; } }

// ---- 非同期 API（過去の閲覧用）
const inKinds = (r, o) => !(o.kinds && !o.kinds.includes(r.kind)) && !(o.types && !o.types.includes(r.ty));
/** シミュレーション用: 直近の作業バッファと常駐・キャッシュ済みの資料だけ（同期。外部保存は読まない） */
export function getLiveEvent(civ, id) { const e = civ.events.find((x) => x.eventId === id); if (e) return e; const store = storeOf(civ); for (const pk in exts(civ)) { const m = exts(civ)[pk], n = idN(id); if (n != null && m.minN != null && n >= m.minN && n <= m.maxN) { const c = store?.peek(sidOf(civ), pk); return c?.find((r) => r.eventId === id) ?? null; } } return null; }
/** 過去の閲覧用: ID から 1 件（作業バッファ → 常駐 → 外部保存） */
export async function getHistoricalEvent(civ, id) {
  const live = getLiveEvent(civ, id); if (live) return live; const n = idN(id), store = storeOf(civ);
  for (const r of residentRecords(civ)) if (r.eventId === id) return survives(civ, r) ? r : null;
  if (!store || n == null) return null; for (const pk in exts(civ)) { const m = exts(civ)[pk]; if (m.minN != null && n >= m.minN && n <= m.maxN) { const r = (await store.getChunk(sidOf(civ), pk)).find((x) => x.eventId === id); return r && survives(civ, r) ? r : null; } }
  return null;
}
/** 期間（月の通番 from〜to）の資料。外部保存のチャンクは、期間にかかるものだけを 1 つずつ読む */
export async function getHistoryRange(civ, from, to, o = {}) {
  const store = storeOf(civ), out = [], now = civ.monthIndex;
  if (store) for (const pk of Object.keys(exts(civ)).map(Number).sort((x, y) => x - y)) { const m = exts(civ)[pk]; if (m.tmax < from || m.tmin > to) continue; for (const r of await store.getChunk(sidOf(civ), pk)) if (r.t >= from && r.t <= to && inKinds(r, o) && (o.includeLost || survives(civ, r, now))) out.push(r); }
  for (const r of iterRecords(civ, { from, to, ...o })) out.push(r); out.sort((x, y) => x.t - y.t || (x.eventId < y.eventId ? -1 : 1)); return o.limit ? out.slice(0, o.limit) : out;
}
/** 国家・人物・集団の歴史（新しい順）。Bloom フィルタで「無いチャンク」を読まずに飛ばし、索引で位置だけを引く */
export async function getEntityHistory(civ, entityId, { limit = 50, includeLost = false } = {}) {
  const store = storeOf(civ), now = civ.monthIndex, out = []; for (const r of iterRecords(civ, { includeLost })) if (r.participants.some((p) => p.entityId === entityId)) out.push(r);
  if (store) for (const pk of Object.keys(exts(civ)).map(Number).sort((x, y) => y - x)) { if (out.length >= limit * 2) break; const m = exts(civ)[pk]; if (!bloomHas(m.bloom, entityId)) continue; const ix = await store.getIndex(sidOf(civ), pk), pos = ix?.ent?.[entityId]; if (!pos) continue; const recs = await store.getChunk(sidOf(civ), pk); for (const i of pos) { const r = recs[i]; if (r && (includeLost || survives(civ, r, now))) out.push(r); } }
  out.sort((x, y) => y.t - x.t || (x.eventId < y.eventId ? 1 : -1)); return out.slice(0, limit);
}
/** 外部保存を含む全資料を、時間順に 1 チャンクずつ流す（書き出し・過去の再構成用。全件をメモリに載せない） */
export async function* iterRecordsAsync(civ, o = {}) {
  const store = storeOf(civ), now = civ.monthIndex;
  if (store) for (const pk of Object.keys(exts(civ)).map(Number).sort((x, y) => x - y)) { const m = exts(civ)[pk]; if (o.to != null && m.tmin > o.to) continue; if (o.from != null && m.tmax < o.from) continue; for (const r of await store.getChunk(sidOf(civ), pk)) { if (o.from != null && r.t < o.from) continue; if (o.to != null && r.t > o.to) continue; if (!inKinds(r, o)) continue; if (!o.includeLost && !survives(civ, r, now)) continue; yield r; } }
  yield* iterRecords(civ, o);
}
export const historyStatus = (civ) => { const store = storeOf(civ), e = exts(civ); return { attached: !!store, chunks: Object.keys(e).length, records: Object.values(e).reduce((s, m) => s + m.n, 0), bytes: Object.values(e).reduce((s, m) => s + m.bytes, 0), cached: store?.cachedChunks() ?? 0, blocked: store?.blocked ?? null, resident: residentRecords(civ).length }; };
void policyOf; void CHUNK_YEARS;
/** 過去の再構成（外部保存を含む）。必要な種類の資料だけを時間順に集めて組み立てる */
export async function pastViewAsync(civ, month) { const recs = []; for await (const r of iterRecordsAsync(civ, { to: month, types: PAST_TYPES })) recs.push(r); recs.sort((x, y) => x.t - y.t); return pastReduce(civ, month, recs); }
/** Worker 経由の圧縮・展開（画面のスレッドを止めない）。worker は workers/history-worker.js（dist/history-worker.js）。作れなければ InlineCodec */
export function workerCodec(url) {
  let w; try { w = new Worker(url); } catch { return InlineCodec; }
  let seq = 0; const pend = new Map(); w.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.ok ? p.ok(e.data.data) : p.ng(new Error(e.data.error)); }; w.onerror = () => { for (const p of pend.values()) p.ng(new Error("history worker error")); pend.clear(); };
  const call = (op, data) => new Promise((ok, ng) => { const id = ++seq; pend.set(id, { ok, ng }); w.postMessage({ id, op, data }); });
  return { encode: (recs) => call("encode", recs), decode: (bytes) => call("decode", bytes), terminate: () => w.terminate() };
}
/** 外部保存を含む、残存している全資料（出力用。全件がメモリに載る。軽量な出力では使わない） */
export async function collectRecords(civ, o = {}) { const out = []; for await (const r of iterRecordsAsync(civ, o)) out.push(r); out.sort((x, y) => x.t - y.t || (x.eventId < y.eventId ? -1 : 1)); return out; }
