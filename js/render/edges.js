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
  if (geometry.pack.csr) return boundarySegmentsCsr(geometry.pack.csr, values, include, differs);
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

/** buildBoundarySegments の CSR 版（型付き配列を直接読む。旧形式と同じ線分を同じ順序で返す）。共有頂点は、セル i の多角形の頂点のうち j の多角形にも含まれる最初の 2 つ */
function boundarySegmentsCsr(csr, values, include, differs) {
  const { n, nbOff, nbIds, polyOff, polyIds, vx, vy } = csr;
  let out = new Float32Array(4096), len = 0;
  for (let i = 0; i < n; i++) {
    if (!include(i)) continue;
    const ia = polyOff[i], ib = polyOff[i + 1];
    for (let k = nbOff[i]; k < nbOff[i + 1]; k++) {
      const j = nbIds[k];
      if (j < i || !include(j) || !differs(values[i], values[j])) continue;
      const ja = polyOff[j], jb = polyOff[j + 1];
      let s0 = -1, s1 = -1, cnt = 0;
      for (let a = ia; a < ib && cnt < 2; a++) {
        const t = polyIds[a];
        for (let b = ja; b < jb; b++) if (polyIds[b] === t) { if (cnt === 0) s0 = t; else s1 = t; cnt++; break; }
      }
      if (cnt < 2) continue;
      if (len + 4 > out.length) { const bigger = new Float32Array(out.length * 2); bigger.set(out); out = bigger; }
      out[len++] = vx[s0]; out[len++] = vy[s0]; out[len++] = vx[s1]; out[len++] = vy[s1];
    }
  }
  return out.slice(0, len);
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
