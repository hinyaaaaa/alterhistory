// 幾何：ボロノイ図の構築と、grid から pack（実際に使うセル群）への再構築。
//
// なぜ必要か:
//   .map ファイルには pack のセル座標が保存されていない。保存されているのは grid の点と、
//   pack のセルごとの属性（国家・文化・宗教など）だけである。
//   Azgaar 自身も、読み込みのたびに grid から pack の形状を再計算している
//   （Grid.rebuildGraph → Pack.generate）。同じ手順を再現すれば、保存された属性配列の
//   添字とセルの位置が完全に対応する。
//
// 参照元: Azgaar/Fantasy-Map-Generator (MIT License)
//   src/generators/voronoi.ts, src/generators/pack-generator.ts
//   点群が同じなら同じ結果になる決定論的処理なので、処理順序も元の実装に合わせてある。
//   （近傍セルの並び順が変わるとセルの追加順が変わり、添字が食い違うため）
//
// 純粋ロジック層：DOM に依存しない。Delaunator は引数で受け取る（依存性注入）。

/** 海面の高さ。これ未満は水（Azgaar の SEA_LEVEL と同値） */
export const SEA_LEVEL = 20;

const rn = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

const nextHalfedge = (e) => (e % 3 === 2 ? e - 2 : e + 1);
const triangleOfEdge = (e) => Math.floor(e / 3);

function circumcenter(a, b, c) {
  const [ax, ay] = a, [bx, by] = b, [cx, cy] = c;
  const ad = ax * ax + ay * ay;
  const bd = bx * bx + by * by;
  const cd = cx * cx + cy * cy;
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  return [
    (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
    (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax)),
  ];
}

/**
 * 点群からボロノイ図を作る。
 * 境界の擬似点(boundary)は外周セルを閉じるために使い、自分自身のセルは持たない。
 *
 * @param {Array<[number, number]>} points    セルの点
 * @param {Array<[number, number]>} boundary  外周の擬似点
 * @param {Function} Delaunator               Delaunator のコンストラクタ
 * @returns {{cells:{v:number[][],c:number[][],b:number[]}, vertices:{p:number[][],v:number[][],c:number[][]}}}
 *   cells.v = セルの頂点ID / cells.c = 隣接セルID / cells.b = 外周付近なら 1
 *   vertices.p = 頂点座標 / vertices.v = 隣接頂点 / vertices.c = 接するセル
 */
export function buildVoronoi(points, boundary, Delaunator) {
  const pointsN = points.length;
  const allPoints = points.concat(boundary);
  const { triangles, halfedges } = Delaunator.from(allPoints);

  const cells = { v: [], c: [], b: [] };
  const vertices = { p: [], v: [], c: [] };

  const edgesAroundPoint = (start) => {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = nextHalfedge(incoming);
      incoming = halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result;
  };

  const pointsOfTriangle = (t) => [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];

  for (let e = 0; e < triangles.length; e++) {
    const p = triangles[nextHalfedge(e)];
    if (p < pointsN && !cells.c[p]) {
      const edges = edgesAroundPoint(e);
      cells.v[p] = edges.map(triangleOfEdge);
      cells.c[p] = edges.map((x) => triangles[x]).filter((c) => c < pointsN);
      cells.b[p] = edges.length > cells.c[p].length ? 1 : 0;
    }

    const t = triangleOfEdge(e);
    if (!vertices.p[t]) {
      const pts = pointsOfTriangle(t);
      vertices.p[t] = circumcenter(allPoints[pts[0]], allPoints[pts[1]], allPoints[pts[2]]);
      vertices.v[t] = [0, 1, 2].map((k) => triangleOfEdge(halfedges[3 * t + k]));
      vertices.c[t] = pts;
    }
  }
  return { cells, vertices };
}

/**
 * grid（.map に保存された粗い格子）から、pack のセル形状を再構築する。
 *
 * 手順（元の実装と同じ）:
 *   1. 深い海の点は捨てる
 *   2. 岸に接しない湖の点は間引く
 *   3. 海岸のセルは、隣の同種セルとの中点を追加して分割（解像度を上げる）
 *   4. 残った点群で新しくボロノイ図を作る
 *
 * @param {object} grid  { points, boundary, spacing, features, h, f, t } と、
 *                       gridVoronoi（grid の点で作った buildVoronoi の結果）
 * @returns {{p:number[][], g:number[], h:number[], cells:object, vertices:object}}
 *   p = 各セルの座標 / g = 親となる grid セルのID / h = 高さ
 */
export function rebuildPack(grid, gridVoronoi, Delaunator) {
  const { points, boundary, spacing, features, h, f, t } = grid;
  const { c: gridC, b: gridB } = gridVoronoi.cells;
  const spacing2 = spacing ** 2;

  const p = [], g = [], height = [];
  const add = (gridId, x, y, hh) => { p.push([x, y]); g.push(gridId); height.push(hh); };

  for (let i = 0; i < points.length; i++) {
    const hi = h[i];
    const ti = t[i];

    if (hi < SEA_LEVEL && ti !== -1 && ti !== -2) continue; // 深い海
    if (ti === -2 && (i % 4 === 0 || features[f[i]]?.type === "lake")) continue; // 岸に接しない湖

    const [x, y] = points[i];
    add(i, x, y, hi);

    // 海岸沿いのセルに点を追加
    if (ti === 1 || ti === -1) {
      if (gridB[i]) continue; // 外周付近は対象外
      for (const e of gridC[i]) {
        if (i > e) continue;
        if (t[e] !== ti) continue;
        const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
        if (dist2 < spacing2) continue; // 近すぎる
        add(i, rn((x + points[e][0]) / 2, 1), rn((y + points[e][1]) / 2, 1), hi);
      }
    }
  }

  const { cells, vertices } = buildVoronoi(p, boundary, Delaunator);
  return { p, g, h: height, cells, vertices };
}

/**
 * ユーザーが手で動かした頂点（頂点ブラシ等）を、再構築した形状に重ねる。
 * 公式 GraphOverride.restore と同じ規則:
 *   「頂点ID → [元の座標, 移動後の座標]」の表で、再構築した頂点の現在位置が「元の座標」と
 *   一致する場合だけ適用する。一致しなければ、別の点を指している可能性があるので捨てる。
 *
 * 対応範囲: pack.vertices.p のみ（公式も現状はこれだけ）。grid や pack.cells の上書きは未対応。
 * 頂点座標 vertices.p を直接書き換える。
 *
 * @param {{p:number[][]}} vertices  pack の頂点
 * @param {object} state            .map の graphOverride 行を JSON として読んだもの
 * @returns {{applied:number, skipped:number, unsupported:boolean}}
 */
export function applyVertexOverrides(vertices, state) {
  let applied = 0, skipped = 0;
  for (const [id, pair] of Object.entries(state?.pack?.vertices?.p ?? {})) {
    const [from, to] = Array.isArray(pair) ? pair : [];
    const current = vertices.p[Number(id)];
    const valid = current && Array.isArray(from) && Array.isArray(to) && to.length === 2 && to.every(Number.isFinite);
    if (!valid || String(current) !== String(from)) { skipped++; continue; }
    vertices.p[Number(id)] = to;
    applied++;
  }
  const has = (o) => !!o && Object.keys(o).length > 0;
  const unsupported = has(state?.grid) || has(state?.pack?.cells) ||
    Object.keys(state?.pack?.vertices ?? {}).some((k) => k !== "p");
  return { applied, skipped, unsupported };
}

/**
 * 各セルの面積（頂点の多角形の面積を整数に丸めたもの。公式の cells.area と同じ方式）。
 * 形状ごとに1回だけ計算して保持する。
 *
 * 注意: 公式が保存している国家などの area とは約0.5%ずれる（実データで確認）。
 *       そのため編集では、面積を「保存値 ± この面積」の差分で更新し、絶対値としては使わない。
 */
export function cellAreas(geometry) {
  if (geometry.cellArea) return geometry.cellArea;
  const { cells, vertices } = geometry.pack;
  const out = new Uint16Array(cells.v.length);
  for (let i = 0; i < out.length; i++) {
    const pts = cells.v[i].map((v) => vertices.p[v]);
    let a = 0;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) a += (pts[j][0] + pts[k][0]) * (pts[j][1] - pts[k][1]);
    out[i] = Math.min(Math.round(Math.abs(a / 2)), 65535);
  }
  geometry.cellArea = out;
  return out;
}

/** セルの多角形（頂点座標の配列）を返す */
export function cellPolygon(cellId, cells, vertices) {
  return cells.v[cellId].map((vid) => vertices.p[vid]);
}
