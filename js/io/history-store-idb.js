// v6.20.0 M2: IndexedDB の保存先。HistoryStore の backend（get/put/delete/keys/usage）。ブラウザ専用。
//   IndexedDB は非同期で構造化複製を保存できる。容量不足（QuotaExceededError）は、書き込みの例外として HistoryStore が検出して外部保存を止める。
import { HistoryStore } from "../core/civ/history-store.js";
const DB = "alterhistory-history", VER = 1, STORES = ["chunks", "index", "meta"];
const req = (r) => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
const done = (tx) => new Promise((ok, ng) => { tx.oncomplete = () => ok(); tx.onerror = () => ng(tx.error); tx.onabort = () => ng(tx.error ?? new Error("transaction aborted")); });
export class IdbBackend {
  constructor(db) { this.db = db; }
  static async open(name = DB) { const r = indexedDB.open(name, VER); r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); }; return new IdbBackend(await req(r)); }
  async get(st, k) { const v = await req(this.db.transaction(st).objectStore(st).get(k)); return v ?? null; }
  async put(st, k, v) { const tx = this.db.transaction(st, "readwrite"); tx.objectStore(st).put(v, k); await done(tx); }
  async delete(st, k) { const tx = this.db.transaction(st, "readwrite"); tx.objectStore(st).delete(k); await done(tx); }
  async keys(st, prefix = "") { const all = await req(this.db.transaction(st).objectStore(st).getAllKeys()); return all.filter((k) => String(k).startsWith(prefix)); }
  async usage() { const e = await globalThis.navigator?.storage?.estimate?.(); return { bytes: e?.usage ?? 0 }; }
  close() { this.db.close(); }
}
/** ブラウザの HistoryStore を開く。IndexedDB が無い・開けない環境では null（そのときは従来どおりメモリ上に持つ）。永続化も要求する */
export async function openHistoryStore({ codec, onStatus, cacheChunks = 4 } = {}) {
  try { if (typeof indexedDB === "undefined") return null; const s = new HistoryStore(await IdbBackend.open(), { codec, onStatus, cacheChunks }); s.requestPersist(); return s; } catch { return null; }
}
