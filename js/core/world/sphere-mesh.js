// 球面メッシュ（v4.0.0 / V4-M0）。正二十面体を周波数 n で分割し、各頂点を球面ボロノイ型のセルとして扱う。
//   セル数 = 10n²+2（n=158 で 249,642）。五角形のセルは 12 個、残りは六角形。
//   ・正本は球面上の座標と隣接（CSR）。矩形投影は表示の都合で、ここでは「境界の変換」だけを提供する。
//   ・隣接・セル頂点は反時計回り（外から見て）に並ぶ。
//   ・純粋ロジック：DOM に依存しない。乱数を使わないので、同じ n なら出力はいつも同じ（決定性）。
//   ・極は正二十面体の頂点（z 軸）。極のセルは五角形で、投影すると極を囲む（cellViewPolygon が処理する）。

export const MESH_VERSION = "sphere-ico-1";
export const cellCountForFrequency = (n) => 10 * n * n + 2;
/** 目標セル数に最も近い周波数 */
export const frequencyForCells = (target) => Math.max(1, Math.round(Math.sqrt((target - 2) / 10)));

const PHI = (1 + Math.sqrt(5)) / 2;
// z 軸が頂点を通る向きに、正二十面体を置く
function baseIcosahedron() {
  const raw = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  // 頂点0 (-1,φ,0) を +z に回す：2回の回転ではなく、基底を作って射影する
  const a = norm(raw[0]);
  let u = cross([0, 0, 1], a), s = Math.hypot(...u);
  const verts = raw.map(norm);
  if (s > 1e-12) {
    u = u.map((v) => v / s);
    const ang = Math.acos(Math.min(1, Math.max(-1, a[2]))), c = Math.cos(ang), sn = Math.sin(ang);
    for (let i = 0; i < verts.length; i++) { // ロドリゲスの回転（a を z に写す。軸 = a×z の逆向き）
      const v = verts[i], k = cross(u, v), d = dot(u, v);
      verts[i] = [v[0] * c + k[0] * sn * -1 + u[0] * d * (1 - c), v[1] * c + k[1] * sn * -1 + u[1] * d * (1 - c), v[2] * c + k[2] * sn * -1 + u[2] * d * (1 - c)];
    }
  }
  const fixed = faces.map(([p, q, r]) => { // 外向きの反時計回りに揃える
    const A = verts[p], B = verts[q], C = verts[r];
    return dot(cross(sub(B, A), sub(C, A)), A) >= 0 ? [p, q, r] : [p, r, q];
  });
  return { verts, faces: fixed };
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

/**
 * 球面メッシュを作る。
 * 戻り値:
 *   n, cellCount, triangleCount, meshVersion
 *   centerXYZ  Float32Array(3*cellCount)  セル中心（単位球面）
 *   neighborOffsets Uint32Array(cellCount+1), neighborIds Uint32Array  隣接（CSR、反時計回り）
 *   vertexXYZ  Float32Array(3*triangleCount)  セルの頂点（三角形の重心を球面へ射影したもの）
 *   cellVertexOffsets, cellVertexIds  セル境界の頂点（CSR、反時計回り。neighborIds[k] と cellVertexIds[k] は同じ向きに並ぶ）
 */
export function buildSphereMesh(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("周波数 n は 1 以上の整数");
  const { verts: bv, faces } = baseIcosahedron();
  const V = cellCountForFrequency(n), T = 20 * n * n;
  const centerXYZ = new Float32Array(3 * V);
  for (let i = 0; i < 12; i++) { centerXYZ[3 * i] = bv[i][0]; centerXYZ[3 * i + 1] = bv[i][1]; centerXYZ[3 * i + 2] = bv[i][2]; }
  // 辺の内部の頂点（各辺に n-1 個）と、面の内部の頂点（各面に (n-1)(n-2)/2 個）の番号
  const edgeBase = new Map(); let nextEdge = 12;
  const interiorPerFace = (n - 1) * (n - 2) / 2, faceBase0 = 12 + 30 * (n - 1);
  const rowStart = new Int32Array(n + 1); // 面の内部: i 行の先頭
  for (let i = 1, acc = 0; i <= n - 2; i++) { rowStart[i] = acc; acc += n - 1 - i; }
  const tmp = [0, 0, 0];
  const place = (id, a, b, c, wa, wb, wc) => {
    tmp[0] = a[0] * wa + b[0] * wb + c[0] * wc; tmp[1] = a[1] * wa + b[1] * wb + c[1] * wc; tmp[2] = a[2] * wa + b[2] * wb + c[2] * wc;
    const l = Math.hypot(tmp[0], tmp[1], tmp[2]);
    centerXYZ[3 * id] = tmp[0] / l; centerXYZ[3 * id + 1] = tmp[1] / l; centerXYZ[3 * id + 2] = tmp[2] / l;
  };
  const tri = new Uint32Array(3 * T); let tp = 0;
  const gid = new Int32Array((n + 1) * (n + 1));
  for (let f = 0; f < 20; f++) {
    const [fa, fb, fc] = faces[f], A = bv[fa], B = bv[fb], C = bv[fc], ids = [fa, fb, fc];
    for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
      const k = n - i - j, w = [k, i, j]; let id;
      const zeros = (k === 0 ? 1 : 0) + (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0);
      if (zeros === 2) id = ids[k === n ? 0 : i === n ? 1 : 2];
      else if (zeros === 1) {
        const slots = [0, 1, 2].filter((s) => w[s] > 0), u = ids[slots[0]], v = ids[slots[1]];
        const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 12 + hi;
        let base = edgeBase.get(key);
        if (base === undefined) { base = nextEdge; nextEdge += n - 1; edgeBase.set(key, base); }
        const wLo = u === lo ? w[slots[0]] : w[slots[1]];
        id = base + (wLo - 1);
        if (!(centerXYZ[3 * id] || centerXYZ[3 * id + 1] || centerXYZ[3 * id + 2])) place(id, A, B, C, k, i, j);
      } else { id = faceBase0 + f * interiorPerFace + rowStart[i] + (j - 1); place(id, A, B, C, k, i, j); }
      gid[i * (n + 1) + j] = id;
    }
    for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
      const p = gid[i * (n + 1) + j], q = gid[(i + 1) * (n + 1) + j], r = gid[i * (n + 1) + j + 1];
      tri[tp++] = p; tri[tp++] = q; tri[tp++] = r;
      if (i + j < n - 1) { const s = gid[(i + 1) * (n + 1) + j + 1]; tri[tp++] = q; tri[tp++] = s; tri[tp++] = r; }
    }
  }
  if (tp !== 3 * T) throw new Error(`三角形の数が合わない: ${tp / 3} != ${T}`);
  // 三角形の向き: 基底の面が外向きなので、格子の (i,j) 順の向きが面の向きと一致するか確かめて、逆なら全体を反転する
  {
    const a = tri[0] * 3, b = tri[1] * 3, c = tri[2] * 3, P = [centerXYZ[a], centerXYZ[a + 1], centerXYZ[a + 2]];
    const Q = [centerXYZ[b], centerXYZ[b + 1], centerXYZ[b + 2]], R = [centerXYZ[c], centerXYZ[c + 1], centerXYZ[c + 2]];
    if (dot(cross(sub(Q, P), sub(R, P)), P) < 0) for (let t = 0; t < T; t++) { const x = tri[3 * t + 1]; tri[3 * t + 1] = tri[3 * t + 2]; tri[3 * t + 2] = x; }
  }
  // 各頂点に接する三角形（回転して、その頂点が先頭になるようにした (u,v,w)）を集める
  const deg = new Uint32Array(V + 1);
  for (let t = 0; t < 3 * T; t++) deg[tri[t] + 1]++;
  const offs = new Uint32Array(V + 1); for (let i = 0; i < V; i++) offs[i + 1] = offs[i] + deg[i + 1];
  const fill = new Uint32Array(V), sV = new Uint32Array(3 * T), sW = new Uint32Array(3 * T), sT = new Uint32Array(3 * T);
  for (let t = 0; t < T; t++) for (let r = 0; r < 3; r++) {
    const u = tri[3 * t + r], v = tri[3 * t + (r + 1) % 3], w = tri[3 * t + (r + 2) % 3], s = offs[u] + fill[u]++;
    sV[s] = v; sW[s] = w; sT[s] = t;
  }
  // 反時計回りに並べ直す: 三角形 (u,v,w) の次は、辺 u→w を先頭の辺に持つ三角形
  const neighborIds = new Uint32Array(3 * T), cellVertexIds = new Uint32Array(3 * T);
  for (let u = 0; u < V; u++) {
    const s0 = offs[u], e0 = offs[u + 1], d = e0 - s0; let cur = s0;
    for (let k = 0; k < d; k++) {
      neighborIds[s0 + k] = sV[cur]; cellVertexIds[s0 + k] = sT[cur];
      const want = sW[cur]; let nx = -1;
      for (let s = s0; s < e0; s++) if (sV[s] === want) { nx = s; break; }
      if (nx < 0) throw new Error(`頂点 ${u} の周りが閉じていない`);
      cur = nx;
    }
  }
  const vertexXYZ = new Float32Array(3 * T);
  for (let t = 0; t < T; t++) {
    const a = tri[3 * t] * 3, b = tri[3 * t + 1] * 3, c = tri[3 * t + 2] * 3;
    const x = centerXYZ[a] + centerXYZ[b] + centerXYZ[c], y = centerXYZ[a + 1] + centerXYZ[b + 1] + centerXYZ[c + 1], z = centerXYZ[a + 2] + centerXYZ[b + 2] + centerXYZ[c + 2], l = Math.hypot(x, y, z);
    vertexXYZ[3 * t] = x / l; vertexXYZ[3 * t + 1] = y / l; vertexXYZ[3 * t + 2] = z / l;
  }
  return { meshVersion: MESH_VERSION, n, cellCount: V, triangleCount: T, centerXYZ, neighborOffsets: offs, neighborIds, vertexXYZ, cellVertexOffsets: offs, cellVertexIds };
}

// ---- 投影の境界（地理計算は球面で行い、画面への変換だけをここに置く）----
/** 単位ベクトル → 緯度経度（ラジアン）。経度は -π〜π */
export function xyzToLatLon(x, y, z) { return { lat: Math.asin(Math.max(-1, Math.min(1, z))), lon: Math.atan2(y, x) }; }
export function latLonToXYZ(lat, lon) { const c = Math.cos(lat); return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)]; }
/** 等距円筒: 画面座標（0〜1）。x = 経度、y = 北が 0 */
export function projectSphereToView(x, y, z) { const { lat, lon } = xyzToLatLon(x, y, z); return { u: (lon + Math.PI) / (2 * Math.PI), v: (Math.PI / 2 - lat) / Math.PI }; }
export function unprojectViewToSphere(u, v) { return latLonToXYZ(Math.PI / 2 - v * Math.PI, u * 2 * Math.PI - Math.PI); }

/** 大円距離（ラジアン）。2点とも単位ベクトル */
export function greatCircleRad(ax, ay, az, bx, by, bz) {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
}
export const greatCircleKm = (rad, radiusKm = 6371) => rad * radiusKm;

/**
 * セルの境界を、矩形投影で描ける多角形にする（経度の継ぎ目と極を処理）。
 * 経度は、セル中心の経度を基準に連続になるよう広げる（-π〜π をはみ出してよい。描画側が ±2π ずらして重ねて描く）。
 * 極を囲むセルは、極の緯度に 2 点を足して閉じる（wrapsPole = true）。
 */
export function cellViewPolygon(mesh, c) {
  const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1], d = e - s;
  const cx = mesh.centerXYZ[3 * c], cy = mesh.centerXYZ[3 * c + 1], cz = mesh.centerXYZ[3 * c + 2];
  const lon0 = Math.atan2(cy, cx), lon = new Float64Array(d), lat = new Float64Array(d);
  let prev = 0, sum = 0;
  for (let k = 0; k < d; k++) {
    const t = mesh.cellVertexIds[s + k], x = mesh.vertexXYZ[3 * t], y = mesh.vertexXYZ[3 * t + 1], z = mesh.vertexXYZ[3 * t + 2];
    let dl = Math.atan2(y, x) - lon0; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI;
    if (k > 0) { let st = dl - prev; while (st > Math.PI) st -= 2 * Math.PI; while (st < -Math.PI) st += 2 * Math.PI; sum += st; dl = prev + st; }
    lon[k] = lon0 + dl; lat[k] = Math.asin(Math.max(-1, Math.min(1, z))); prev = dl;
  }
  let closing = 0; { let st = (Math.atan2(mesh.vertexXYZ[3 * mesh.cellVertexIds[s] + 1], mesh.vertexXYZ[3 * mesh.cellVertexIds[s]]) - lon0) - prev; while (st > Math.PI) st -= 2 * Math.PI; while (st < -Math.PI) st += 2 * Math.PI; closing = st; }
  const turn = sum + closing, wrapsPole = Math.abs(turn) > Math.PI;
  return { lon, lat, wrapsPole, poleSign: wrapsPole ? Math.sign(cz) || 1 : 0, turn };
}

/** 球面三角形の面積（単位球。Van Oosterom–Strakhov） */
export function sphericalTriangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const triple = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
  return 2 * Math.atan2(Math.abs(triple), den);
}
/** セルの面積（単位球。中心と境界頂点の三角形の和） */
export function cellArea(mesh, c) {
  const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1], cx = mesh.centerXYZ[3 * c], cy = mesh.centerXYZ[3 * c + 1], cz = mesh.centerXYZ[3 * c + 2];
  let a = 0;
  for (let k = s; k < e; k++) {
    const p = mesh.cellVertexIds[k], q = mesh.cellVertexIds[k + 1 < e ? k + 1 : s];
    a += sphericalTriangleArea(cx, cy, cz, mesh.vertexXYZ[3 * p], mesh.vertexXYZ[3 * p + 1], mesh.vertexXYZ[3 * p + 2], mesh.vertexXYZ[3 * q], mesh.vertexXYZ[3 * q + 1], mesh.vertexXYZ[3 * q + 2]);
  }
  return a;
}

/** 構造の検査。失敗した項目の一覧を返す（空なら健全） */
export function validateSphereMesh(mesh) {
  const errs = [], { cellCount: V, neighborOffsets: off, neighborIds: nb } = mesh;
  let pent = 0;
  for (let u = 0; u < V; u++) {
    const d = off[u + 1] - off[u];
    if (d === 5) pent++; else if (d !== 6) errs.push(`セル ${u} の隣接数が ${d}`);
    for (let k = off[u]; k < off[u + 1]; k++) {
      const v = nb[k]; if (v === u) errs.push(`セル ${u} が自分と隣接`);
      let back = false; for (let m = off[v]; m < off[v + 1]; m++) if (nb[m] === u) { back = true; break; }
      if (!back) { errs.push(`隣接が非対称: ${u}→${v}`); if (errs.length > 20) return errs; }
    }
    if (errs.length > 20) return errs;
  }
  if (pent !== 12) errs.push(`五角形のセルが ${pent} 個（12 個のはず）`);
  return errs;
}

/** 決定性の確認用ハッシュ（FNV-1a、座標をミリ単位の整数にして混ぜる） */
export function meshHash(mesh) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619); };
  for (let i = 0; i < mesh.centerXYZ.length; i++) mix(Math.round(mesh.centerXYZ[i] * 1e6) | 0);
  for (let i = 0; i < mesh.neighborIds.length; i++) mix(mesh.neighborIds[i]);
  return (h >>> 0).toString(16).padStart(8, "0");
}
