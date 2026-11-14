// セルの面積（地図の単位²）。球面世界から作った地図は、世界の面積（km²）を地図の単位に直した値が geometry.cellArea に入っている
// （等距円筒の多角形の面積は、極に近いほど実際より大きく出るため、多角形からは求めない）。入っていなければ多角形から求める。
export function cellAreas(geometry) {
  if (geometry.cellArea) return geometry.cellArea;
  const csr = geometry.pack.csr;
  if (csr) { // CSR: 多角形の面積（靴ひも公式）を型付き配列から直接求める
    const out = new Float32Array(csr.n);
    for (let i = 0; i < csr.n; i++) {
      const s = csr.polyOff[i], e = csr.polyOff[i + 1]; let a = 0;
      for (let k = s, j = e - 1; k < e; j = k++) { const tj = csr.polyIds[j], tk = csr.polyIds[k]; a += (csr.vx[tj] + csr.vx[tk]) * (csr.vy[tj] - csr.vy[tk]); }
      out[i] = Math.abs(a / 2);
    }
    geometry.cellArea = out;
    return out;
  }
  const { cells, vertices } = geometry.pack;
  const out = new Float32Array(cells.v.length);
  for (let i = 0; i < out.length; i++) {
    const pts = cells.v[i].map((v) => vertices.p[v]);
    let a = 0;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) a += (pts[j][0] + pts[k][0]) * (pts[j][1] - pts[k][1]);
    out[i] = Math.abs(a / 2);
  }
  geometry.cellArea = out;
  return out;
}
