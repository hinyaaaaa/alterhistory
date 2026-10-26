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
export function strokeSegments(ctx, segs, bounds = null) {
  // bounds: { x0, y0, x1, y1 }（ワールド座標）。与えると、その外にある線分は描かない（拡大して見ているとき用）
  const raw = ctx.rawCtx, wy = ctx.warpY; // warpContext 経由のとき（記録用の模擬 ctx など、どちらも持たないものは通常の経路）: 代理を通さず、y だけ変換して直接描く
  if (raw && typeof raw.beginPath === "function" && typeof wy === "function") {
    raw.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      if (bounds && ((segs[i] < bounds.x0 && segs[i + 2] < bounds.x0) || (segs[i] > bounds.x1 && segs[i + 2] > bounds.x1) || (segs[i + 1] < bounds.y0 && segs[i + 3] < bounds.y0) || (segs[i + 1] > bounds.y1 && segs[i + 3] > bounds.y1))) continue;
      raw.moveTo(segs[i], wy(segs[i + 1])); raw.lineTo(segs[i + 2], wy(segs[i + 3]));
    }
    raw.stroke(); return;
  }
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    if (bounds && ((segs[i] < bounds.x0 && segs[i + 2] < bounds.x0) || (segs[i] > bounds.x1 && segs[i + 2] > bounds.x1) || (segs[i + 1] < bounds.y0 && segs[i + 3] < bounds.y0) || (segs[i + 1] > bounds.y1 && segs[i + 3] > bounds.y1))) continue;
    ctx.moveTo(segs[i], segs[i + 1]);
    ctx.lineTo(segs[i + 2], segs[i + 3]);
  }
  ctx.stroke();
}

/**
 * ある実体（国家・文化・宗教・属州の1つ）の外周の線分。海・湖との境も、他の実体との境も含む。
 * 凡例の項目を押したときの強調表示に使う。実体のセルが無ければ空。
 *
 * @param {object} geometry
 * @param {ArrayLike<number>} ids  セルごとの実体ID
 * @param {number} id              強調したい実体のID
 * @param {ArrayLike<number>} [biome]  セルごとのバイオーム。0 = 水域。水域のセルは実体に含めない
 */
export function entityOutlineSegments(geometry, ids, id, biome) {
  const inside = new Uint8Array(ids.length);
  let any = false;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === id && (!biome || biome[i] !== 0)) { inside[i] = 1; any = true; }
  }
  if (!any) return new Float32Array(0);
  return buildBoundarySegments(geometry, inside);
}

/** 線分の配列 [x1,y1,x2,y2,...] を囲む長方形。線分が無ければ null */
export function segmentsBounds(segs) {
  if (!segs || segs.length < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < segs.length; i += 2) {
    const x = segs[i], y = segs[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}
