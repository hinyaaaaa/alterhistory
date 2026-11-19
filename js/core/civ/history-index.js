// v6.20.0 M3: 履歴の分割インデックス。物理チャンク（5 年）ごとに、イベントIDの範囲・種別ごとの件数・国家/集団/人物ごとの参照位置を持つ。
//   本体（チャンク）とは別に保存し、必要な索引だけを読む。メモリに常駐するのは、チャンクごとの小さな要約（ID範囲・件数・Bloom フィルタ）だけ。
import { parseId } from "./ids.js";
const M = 2048, K = 3;
const fnv = (s, seed) => { let h = (2166136261 ^ seed) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const bits = (id) => [fnv(id, 1) % M, fnv(id, 7) % M, fnv(id, 13) % M];
const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** 実体IDの集合から Bloom フィルタ（256 バイト・base64）を作る。「このチャンクにその実体は無い」を確実に言える（あるかもしれない、は誤検出がありうる） */
export function bloomOf(ids) { const u = new Uint8Array(M / 8); for (const id of ids) for (const b of bits(id)) u[b >> 3] |= 1 << (b & 7); return b64(u); }
const bcache = new Map();
export function bloomHas(b, id) { if (!b) return true; let u = bcache.get(b); if (!u) { u = unb64(b); if (bcache.size > 256) bcache.clear(); bcache.set(b, u); } return bits(id).every((x) => u[x >> 3] & (1 << (x & 7))); }
export const idN = (id) => parseId(id)?.n ?? null;
/** チャンクの記録から索引を作る。ent: 実体ID → 記録の位置の配列 */
export function buildIndex(recs) {
  const kinds = {}, ent = {}; let minN = Infinity, maxN = -Infinity, tmin = Infinity, tmax = -Infinity;
  recs.forEach((r, i) => { kinds[r.kind] = (kinds[r.kind] ?? 0) + 1; const n = idN(r.eventId); if (n != null) { if (n < minN) minN = n; if (n > maxN) maxN = n; } if (r.t < tmin) tmin = r.t; if (r.t > tmax) tmax = r.t; const seen = new Set(); for (const p of r.participants ?? []) if (!seen.has(p.entityId)) { seen.add(p.entityId); (ent[p.entityId] ??= []).push(i); } });
  return { n: recs.length, kinds, ent, minN: minN === Infinity ? null : minN, maxN: maxN === -Infinity ? null : maxN, tmin, tmax };
}
