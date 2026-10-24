// 等距円筒図の各ピクセルが、どのセルに属するか（最近傍セルを、隣接をたどって探す）。地図画像・歴史ビューアの地図が共有する。純粋ロジック（DOM を使わない）。
import { unprojectViewToSphere } from "./sphere-mesh.js";
const cache = new WeakMap();
export function cellRaster(world, W, H) {
  const key = `${W}x${H}`; let m = cache.get(world); if (!m) cache.set(world, (m = new Map())); if (m.has(key)) return m.get(key);
  const mesh = world.mesh, cellAt = new Int32Array(W * H); let cur = 0; const dot = (c, x, y, z) => mesh.centerXYZ[3 * c] * x + mesh.centerXYZ[3 * c + 1] * y + mesh.centerXYZ[3 * c + 2] * z;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const [x, y, z] = unprojectViewToSphere((px + 0.5) / W, (py + 0.5) / H); for (;;) { let best = dot(cur, x, y, z), bj = -1; for (let k = mesh.neighborOffsets[cur]; k < mesh.neighborOffsets[cur + 1]; k++) { const d = dot(mesh.neighborIds[k], x, y, z); if (d > best) { best = d; bj = mesh.neighborIds[k]; } } if (bj < 0) break; cur = bj; } cellAt[py * W + px] = cur; }
  m.set(key, cellAt); return cellAt;
}
