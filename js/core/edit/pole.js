// 「極（pole）」：国家・属州の名前ラベルを置く位置。領土の内側で、境界から最も遠い点。
//
// 塗り替えで領土の形が変わったとき、極が領土の外に出てしまったら計算し直す。
// 公式は polylabel（多角形の内接円の中心）を使うが、ここではセル単位の近似を使う:
//   境界に接するセルからの、隣接セルをたどる距離が最大のセル ＝ 領土の「奥」のセル。
// 領土の内側に収まっていれば元の極を変えない（無編集の部分の値を勝手に動かさないため）。
//
// 純粋ロジック（DOM 非依存）。

/**
 * @param {object} map
 * @param {(cell:number)=>number} ownerOf  セルの持ち主ID（編集途中の状態を渡せるよう関数で受け取る）
 * @param {number} id  対象の実体ID
 * @returns {[number,number]|null}  領土が無ければ null
 */
export function computePole(map, ownerOf, id) {
  const { cells, p } = map.geometry.pack;
  const biome = map.pack.cells.biome;
  const n = cells.c.length;
  const member = new Uint8Array(n);
  let count = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    if (biome[i] !== 0 && ownerOf(i) === id) { member[i] = 1; count++; sx += p[i][0]; sy += p[i][1]; }
  }
  if (!count) return null;

  // 境界（メンバーでない隣接セル、または地図の端）に接するセルを距離0として、内側へ幅優先で距離を広げる
  const dist = new Int32Array(n).fill(-1);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (!member[i]) continue;
    if (cells.b[i] || cells.c[i].some((j) => !member[j])) { dist[i] = 0; queue.push(i); }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    for (const j of cells.c[i]) if (member[j] && dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
  }

  // 距離が最大のセル。同じなら重心に近いほう
  const cx = sx / count, cy = sy / count;
  let best = -1, bestD = -1, bestC = Infinity;
  for (let i = 0; i < n; i++) {
    if (!member[i]) continue;
    const d = dist[i] < 0 ? 0 : dist[i]; // 孤立して到達できなかったセルは0扱い
    const c = (p[i][0] - cx) ** 2 + (p[i][1] - cy) ** 2;
    if (d > bestD || (d === bestD && c < bestC)) { best = i; bestD = d; bestC = c; }
  }
  return [Math.round(p[best][0]), Math.round(p[best][1])];
}
