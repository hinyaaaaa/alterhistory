// セル境界の辺を求める。国境・海岸線・河川の描画で使う。
// 純粋ロジック（DOM 非依存）。

/** 2つのセルが共有する頂点（隣接セルなら通常2個）を返す */
export function sharedVertices(v, i, j) {
  const a = v[i], b = v[j], out = [];
  for (let x = 0; x < a.length; x++) if (b.includes(a[x])) out.push(a[x]);
  return out;
}

/**
 * 隣り合うセルの値が異なる辺を、線分の平坦な配列 [x1,y1,x2,y2, ...] で返す。
 *
 * @param {object} geometry  { pack: { cells, vertices } }
 * @param {ArrayLike<number>} values  セルごとの値（国家ID など）
 * @param {(i:number)=>boolean} [include]  この関数が false を返すセルは対象外（水域を除く等）
 * @param {(a:number,b:number)=>boolean} [differs]  既定は a !== b
 */
export function buildBoundarySegments(geometry, values, include = () => true, differs = (a, b) => a !== b) {
  const { cells, vertices } = geometry.pack;
  const out = [];
  for (let i = 0; i < cells.c.length; i++) {
    if (!include(i)) continue;
    for (const j of cells.c[i]) {
      if (j < i || !include(j)) continue; // 各辺を1回だけ
      if (!differs(values[i], values[j])) continue;
      const sv = sharedVertices(cells.v, i, j);
      if (sv.length < 2) continue;
      const p = vertices.p[sv[0]], q = vertices.p[sv[1]];
      out.push(p[0], p[1], q[0], q[1]);
    }
  }
  return Float32Array.from(out);
}

/** 線分の配列を1本のパスとして描く（呼び出し側が線の色・太さを設定する） */
export function strokeSegments(ctx, segs) {
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    ctx.moveTo(segs[i], segs[i + 1]);
    ctx.lineTo(segs[i + 2], segs[i + 3]);
  }
  ctx.stroke();
}
