// 最小の PNG エンコーダ（RGBA→PNG。依存なし）。画像チャンクは zlib 形式（CompressionStream("deflate")）。
import { crc32 } from "./crc32.js";
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type, data) { const t = new TextEncoder().encode(type), body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length); return [...be32(data.length), ...body, ...be32(crc32(body))]; }
export async function encodePng(rgba, w, h) {
  const raw = new Uint8Array(h * (w * 4 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", Uint8Array.from([...be32(w), ...be32(h), 8, 6, 0, 0, 0])), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))]);
}
