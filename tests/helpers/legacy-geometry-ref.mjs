// v6.13.0 の回帰検証用: CSR 化する前（v6.12.0）の buildGeometry を、そのまま凍結して置いた参照実装。
//   新しい実装（js/core/world-bridge.js の buildGeometry + js/core/geometry-csr.js の遅延ゲッター）が、旧形式を 1 要素も違わずに再現することを
//   tests/v6130-geometry-csr.test.mjs で確かめるために使う。本番コードからは読まない。変更しないこと。
import { cellViewPolygon } from "../../js/core/world/sphere-mesh.js";
import { simFrame } from "../../js/core/world/projection.js";
const r2 = (v) => Math.round(v * 100) / 100;

/** セルの多角形・隣接・頂点（等距円筒）。継ぎ目と極を処理する */
export function buildGeometryReference(mesh, h, W, H) {
  const N = mesh.cellCount, V = mesh.vertexXYZ.length / 3, vx = mesh.vertexXYZ;
  const frame = simFrame(W); // 球面 → 地図座標（sim）の変換は projection.js の 1 か所だけ。表示用の円筒図法は視点側（render/viewport）が適用する
  const vp = new Array(V), vv = new Array(V), vc = new Array(V);
  for (let t = 0; t < V; t++) {
    const lon = Math.atan2(vx[3 * t + 1], vx[3 * t]), lat = Math.asin(Math.max(-1, Math.min(1, vx[3 * t + 2])));
    vp[t] = frame.toSim(lat, lon).map(r2); vv[t] = []; vc[t] = [];
  }
  const p = new Array(N), cv = new Array(N), cc = new Array(N), cb = new Array(N), alt = new Array(N).fill(null), dup = new Map();
  const addV = (a, b) => { if (!vv[a].includes(b)) vv[a].push(b); if (!vv[b].includes(a)) vv[b].push(a); };
  const shifted = (t, shift) => { // 継ぎ目の外へずらした複製頂点（shift 周分ずらす）
    if (shift === 0) return t;
    const key = t + ":" + shift; let id = dup.get(key);
    if (id == null) { id = vp.length; vp.push([r2(vp[t][0] + shift * W), vp[t][1]]); vv.push(vv[t].slice()); vc.push(vc[t].slice()); dup.set(key, id); }
    return id;
  };
  const off = mesh.neighborOffsets, nb = mesh.neighborIds;
  for (let c = 0; c < N; c++) {
    const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1];
    const lon0 = Math.atan2(mesh.centerXYZ[3 * c + 1], mesh.centerXYZ[3 * c]), lat0 = Math.asin(Math.max(-1, Math.min(1, mesh.centerXYZ[3 * c + 2])));
    p[c] = frame.toSim(lat0, lon0).map(r2);
    const poly = cellViewPolygon(mesh, c), ids = [], shifts = [];
    for (let k = 0; k < e - s; k++) {
      const t = mesh.cellVertexIds[s + k];
      const canon = Math.atan2(vx[3 * t + 1], vx[3 * t]);
      const shift = Math.round((poly.lon[k] - canon) / (2 * Math.PI)); // 継ぎ目をまたいだ分（-1 / 0 / +1）
      shifts.push(shift); ids.push(shifted(t, shift));
    }
    if (!poly.wrapsPole) { // 継ぎ目をまたぐセルは、反対側の端にも同じ形を描く（描画専用の複製）
      let hi = false, lo = false; for (const id of ids) { if (vp[id][0] > W) hi = true; if (vp[id][0] < 0) lo = true; }
      if (hi || lo) alt[c] = ids.map((id, k) => shifted(mesh.cellVertexIds[s + k], shifts[k] + (hi ? -1 : 1)));
    }
    if (poly.wrapsPole) { // 極を囲むセル: 左端・右端の極の緯度に 2 点足して閉じる
      const y = poly.poleSign > 0 ? 0 : H, xs = ids.map((id) => vp[id][0]);
      const a = vp.length; vp.push([r2(Math.min(...xs)), y], [r2(Math.max(...xs)), y]); vv.push([], []); vc.push([c], [c]);
      ids.sort((i1, i2) => vp[i1][0] - vp[i2][0]); ids.unshift(a); ids.push(a + 1);
    }
    cv[c] = ids;
    for (let k = 0; k < ids.length; k++) { const a = ids[k], b = ids[(k + 1) % ids.length]; if (!vc[a].includes(c)) vc[a].push(c); if (a !== b) addV(a, b); }
    const list = new Array(off[c + 1] - off[c]); for (let k = off[c]; k < off[c + 1]; k++) list[k - off[c]] = nb[k];
    cc[c] = list; cb[c] = Math.abs(lat0) > 1.45 ? 1 : 0;
  }
  return { p, g: null, h: h.slice(), cells: { v: cv, c: cc, b: cb, alt }, vertices: { p: vp, v: vv, c: vc } };
}

