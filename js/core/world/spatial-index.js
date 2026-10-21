// 球面メッシュの空間インデックス（v4.0.0）。座標 → セル、半径内のセル、を高速に引く。
//   ・緯度経度の格子（約 2 セル/ビン）に、セル中心を入れておく。クリック・ホバー・ブラシの起点に使う。
//   ・最近傍は、近くのビンの候補から始めて、隣接をたどって極大点まで登る（ボロノイ型のセルでは極大点が最近傍）。
//   純粋ロジック（DOM 非依存）。
import { greatCircleRad } from "./sphere-mesh.js";

export function buildSpatialIndex(mesh) {
  const V = mesh.cellCount, X = mesh.centerXYZ, rows = Math.max(8, Math.min(2048, Math.round(Math.sqrt(V / 2)))), cols = rows * 2;
  const binOf = (lat, lon) => { const r = Math.min(rows - 1, Math.max(0, Math.floor((Math.PI / 2 - lat) / Math.PI * rows))), c = Math.min(cols - 1, Math.max(0, Math.floor((lon + Math.PI) / (2 * Math.PI) * cols))); return r * cols + c; };
  const count = new Uint32Array(rows * cols + 1), bin = new Uint32Array(V);
  for (let c = 0; c < V; c++) { const b = binOf(Math.asin(Math.max(-1, Math.min(1, X[3 * c + 2]))), Math.atan2(X[3 * c + 1], X[3 * c])); bin[c] = b; count[b + 1]++; }
  for (let i = 0; i < rows * cols; i++) count[i + 1] += count[i];
  const fill = new Uint32Array(rows * cols), ids = new Uint32Array(V);
  for (let c = 0; c < V; c++) { const b = bin[c]; ids[count[b] + fill[b]++] = c; }
  return { mesh, rows, cols, binStart: count, binCells: ids, binOf };
}

/** 単位ベクトル (x,y,z) に最も近いセル */
export function nearestCell(index, x, y, z) {
  const { mesh, rows, cols, binStart, binCells } = index, X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
  const lat = Math.asin(Math.max(-1, Math.min(1, z))), lon = Math.atan2(y, x);
  const r0 = Math.min(rows - 1, Math.max(0, Math.floor((Math.PI / 2 - lat) / Math.PI * rows))), c0 = Math.min(cols - 1, Math.max(0, Math.floor((lon + Math.PI) / (2 * Math.PI) * cols)));
  let best = -1, bd = -2;
  for (let ring = 0; ring <= Math.max(rows, 4) && (best < 0 || ring <= 1); ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      const r = r0 + dr; if (r < 0 || r >= rows) continue;
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const cc = ((c0 + dc) % cols + cols) % cols, b = r * cols + cc;
        for (let i = binStart[b]; i < binStart[b + 1]; i++) { const c = binCells[i], d = X[3 * c] * x + X[3 * c + 1] * y + X[3 * c + 2] * z; if (d > bd) { bd = d; best = c; } }
      }
    }
  }
  for (;;) { let bj = -1; for (let k = off[best]; k < off[best + 1]; k++) { const j = nb[k], d = X[3 * j] * x + X[3 * j + 1] * y + X[3 * j + 2] * z; if (d > bd) { bd = d; bj = j; } } if (bj < 0) break; best = bj; }
  return best;
}
export function cellAtLatLon(index, latRad, lonRad) { const c = Math.cos(latRad); return nearestCell(index, c * Math.cos(lonRad), c * Math.sin(lonRad), Math.sin(latRad)); }

/** 中心セルから大円距離 radiusRad 以内のセル（隣接をたどる）。戻り値: { cells: Int32Array, dist: Float32Array（ラジアン） } */
export function cellsInRadius(mesh, center, radiusRad) {
  const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds, seen = new Set([center]), cells = [center], dist = [0];
  for (let q = 0; q < cells.length; q++) {
    const c = cells[q];
    for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (seen.has(j)) continue; seen.add(j); const d = greatCircleRad(X[3 * center], X[3 * center + 1], X[3 * center + 2], X[3 * j], X[3 * j + 1], X[3 * j + 2]); if (d <= radiusRad) { cells.push(j); dist.push(d); } }
  }
  return { cells: Int32Array.from(cells), dist: Float32Array.from(dist) };
}
/** 集合を、隣接をたどって rings 段だけ広げる。戻り値: 昇順の Int32Array */
export function dilateCells(mesh, cells, rings) {
  const off = mesh.neighborOffsets, nb = mesh.neighborIds, seen = new Set(cells); let frontier = Array.from(cells);
  for (let r = 0; r < rings; r++) { const next = []; for (const c of frontier) for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (!seen.has(j)) { seen.add(j); next.push(j); } } frontier = next; }
  return Int32Array.from(seen).sort();
}
