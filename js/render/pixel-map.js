// 画素 → セルの対応表（ラスタ描画の土台）。矩形投影の各画素に、最も近いセルの番号を割り当てる。
//   行ごとに、前の画素のセルから隣接をたどって極大点へ登る（近い画素は近いセルなので、数手で済む）。
//   時間分割して、重いときも画面を止めない（rowsPerSlice 行ごとに譲る）。
import { unprojectViewToSphere } from "../core/world/sphere-mesh.js";

export async function buildPixelMap(mesh, W, H, { rowsPerSlice = 24, yieldFn = () => new Promise((r) => setTimeout(r, 0)), onProgress = null, signal = null } = {}) {
  const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds, map = new Int32Array(W * H); let cur = 0, rowStartCell = 0;
  for (let py = 0; py < H; py++) {
    if (py % rowsPerSlice === 0) { if (signal?.aborted) throw new Error("キャンセルされました"); onProgress?.(py / H); await yieldFn(); }
    cur = rowStartCell;
    for (let px = 0; px < W; px++) {
      const [x, y, z] = unprojectViewToSphere((px + 0.5) / W, (py + 0.5) / H);
      let best = X[3 * cur] * x + X[3 * cur + 1] * y + X[3 * cur + 2] * z;
      for (;;) { let bj = -1; for (let k = off[cur]; k < off[cur + 1]; k++) { const j = nb[k], d = X[3 * j] * x + X[3 * j + 1] * y + X[3 * j + 2] * z; if (d > best) { best = d; bj = j; } } if (bj < 0) break; cur = bj; }
      map[py * W + px] = cur; if (px === 0) rowStartCell = cur;
    }
  }
  onProgress?.(1);
  return map;
}
/** 世界のセル数に合わせた、ラスタの大きさ（2:1）。大きい世界ほど細かくする */
export function textureSizeFor(cellCount) { const w = Math.max(1024, Math.min(4096, 2 ** Math.ceil(Math.log2(Math.sqrt(cellCount) * 2.6)))); return { W: w, H: w / 2 }; }
