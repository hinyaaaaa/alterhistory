// ZIP 書き出し（依存なし）。各ファイルを deflate-raw で圧縮（CompressionStream）、または無圧縮（store）で格納する。UTF-8 のファイル名（フラグ bit11）。
// files は同期・非同期どちらの反復でもよい（大きな書き出しで全文字列を保持しない）。戻り値: Uint8Array。ZIP64 は未対応（4GB・65535 件超は明示エラー）。
import { crc32 } from "./crc32.js";
const enc = new TextEncoder();
async function deflateRaw(bytes) { const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer(); return new Uint8Array(out); }
const u16 = (n) => [n & 255, (n >>> 8) & 255], u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
function dosTime(d) { return [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff]; }
/** @param {AsyncIterable|Iterable<{path:string, data:string|Uint8Array}>} files */
export async function zipFiles(files, { compress = true, date = new Date(), onProgress = null } = {}) {
  const parts = [], central = [], [dt, dd] = dosTime(date); let offset = 0, n = 0; const names = new Set();
  for await (const f of files) {
    if (names.has(f.path)) throw new Error(`ZIP のパスが重複: ${f.path}`); names.add(f.path);
    const raw = typeof f.data === "string" ? enc.encode(f.data) : f.data, name = enc.encode(f.path), crc = crc32(raw);
    let method = 0, body = raw; if (compress && raw.length > 128) { const z = await deflateRaw(raw); if (z.length < raw.length) { method = 8; body = z; } }
    const head = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0)]);
    if (offset + head.length + name.length + body.length > 0xfffffff0) throw new Error("ZIP が 4GB を超えます（分割して書き出してください）");
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    parts.push(head, name, body); offset += head.length + name.length + body.length; n++;
    if (onProgress && n % 500 === 0) await onProgress(n);
  }
  let csize = 0; for (const c of central) csize += c.length;
  const big = n > 0xfffe, tail = []; // 65535 件以上は ZIP64 の終端レコードを付ける（各ファイルのサイズ・位置は 4GB 未満のまま）
  if (big) { const u64 = (x) => [...u32(x >>> 0), ...u32(Math.floor(x / 4294967296))]; tail.push(Uint8Array.from([0x50, 0x4b, 6, 6, ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0), ...u64(n), ...u64(n), ...u64(csize), ...u64(offset)]), Uint8Array.from([0x50, 0x4b, 6, 7, ...u32(0), ...u64(offset + csize), ...u32(1)])); }
  tail.push(Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(big ? 0xffff : n), ...u16(big ? 0xffff : n), ...u32(csize), ...u32(offset), 0, 0]));
  let total = offset + csize; for (const t of tail) total += t.length; const out = new Uint8Array(total); let o = 0; for (const p of [...parts, ...central, ...tail]) { out.set(p, o); o += p.length; } return out;
}
/** ZIP の中身を読む（検証用。store / deflate-raw のみ）。戻り値: Map(パス → Uint8Array) */
export async function unzipFiles(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Map(); let e = bytes.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error("ZIP の終端が見つかりません");
  let n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true); const dec = new TextDecoder(); if (n === 0xffff && e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50) { const z = dv.getUint32(e - 20 + 8, true) + dv.getUint32(e - 20 + 12, true) * 4294967296; n = dv.getUint32(z + 32, true) + dv.getUint32(z + 36, true) * 4294967296; p = dv.getUint32(z + 48, true); }
  for (let i = 0; i < n; i++) { const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true), name = dec.decode(bytes.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), body = bytes.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csz); let raw = body; if (method === 8) raw = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); if (crc32(raw) !== crc) throw new Error(`CRC が一致しません: ${name}`); out.set(name, raw); }
  return out;
}
