// 講和の「区画」：敗者の領土を、国境ができるだけ滑らかになるように、飛び地の無い区画に自動で分ける。
//   ・区画の境は、既存の州（属州）の境・川・険しい地形に沿いやすい（越えるのに費用がかかる距離で領域を分ける）
//   ・各区画は必ず連結している（飛び地なし）。境界は多数決でならす
//   ・首都を含む区画は、割譲の候補に出さない
//   ・勝者の領土に接する区画（depth 0）と、その先（depth 1〜2）。先の区画を選ぶには、間の区画も選ぶ必要がある（needs）
// 純粋ロジック層：DOM に依存しない。
const SIZE_K = { s: 12, m: 8, l: 5 }; // 敗者の領土をいくつの区画に分けるか

class Heap { // 最小ヒープ
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/**
 * @returns {{cells:number[], depth:number, contact:number, needs:number[]}[]} 割譲の候補になる区画（首都の区画を除く）。needs は返す配列の添字
 */
export function partitionParcels(map, fromId, winners, { size = "m", maxParcels = 10, capCell = -1 } = {}) {
  const nb = map.geometry?.pack?.cells?.c, pts = map.geometry?.pack?.p; if (!nb) return [];
  const C = map.pack.cells, st = C.state, H = map.geometry.pack.h ?? C.h ?? null, R = C.r ?? null;
  const mine = []; for (let i = 0; i < st.length; i++) if (st[i] === fromId && (C.biome?.[i] ?? 1) !== 0) mine.push(i);
  if (mine.length < 2) return [];
  const mineSet = new Set(mine);
  const dist = (i, j) => (pts ? Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) : 1) || 1;
  const step = (i, j) => dist(i, j) * (1 + ((C.province?.[i] ?? 0) !== (C.province?.[j] ?? 0) ? 1.4 : 0) + (R && R[j] > 0 ? 0.8 : 0) + (H ? Math.abs((H[i] ?? 0) - (H[j] ?? 0)) * 0.04 : 0));
  const win = new Set(winners);
  const front = mine.filter((i) => nb[i].some((j) => win.has(st[j])));
  const K = Math.max(2, Math.min(SIZE_K[size] ?? 8, Math.floor(mine.length / 2)));
  // 種の選び方: 首都（無ければ前線）から始め、いちばん遠い所へ次々に置く（遠点サンプリング）
  const first = mineSet.has(capCell) ? capCell : (front[0] ?? mine[0]);
  const seeds = [first]; const near = new Map(mine.map((i) => [i, dist(i, first)])); near.set(first, -1);
  while (seeds.length < K) {
    let best = -1, bd = -1; for (const i of mine) { const d = near.get(i); if (d > bd) { bd = d; best = i; } }
    if (best < 0 || bd <= 0) break; seeds.push(best); near.set(best, -1);
    for (const i of mine) if (near.get(i) >= 0) near.set(i, Math.min(near.get(i), dist(i, best)));
  }
  const label = new Int16Array(st.length).fill(-1);
  const grow = () => { // 費用つきの多点同時の広がり（ボロノイ分割）
    label.fill(-1); const cost = new Map(), h = new Heap();
    seeds.forEach((s, k) => { label[s] = k; cost.set(s, 0); h.push(0, s); });
    while (h.size) { const [c, i] = h.pop(); if (c > (cost.get(i) ?? Infinity)) continue; for (const j of nb[i]) { if (!mineSet.has(j)) continue; const nc = c + step(i, j); if (nc < (cost.get(j) ?? Infinity)) { cost.set(j, nc); label[j] = label[i]; h.push(nc, j); } } }
  };
  grow();
  for (let it = 0; it < 2; it++) { // 領域をならす: 重心に最も近いセルを新しい種にする（首都の種は動かさない）
    seeds.forEach((s, k) => {
      if (s === first && first === capCell) return;
      const m = mine.filter((i) => label[i] === k); if (!m.length || !pts) return;
      const cx = m.reduce((a, i) => a + pts[i][0], 0) / m.length, cy = m.reduce((a, i) => a + pts[i][1], 0) / m.length;
      let b = s, bd = Infinity; for (const i of m) { const d = Math.hypot(pts[i][0] - cx, pts[i][1] - cy); if (d < bd) { bd = d; b = i; } } seeds[k] = b;
    }); grow();
  }
  for (let pass = 0; pass < 6; pass++) { // 境界を多数決でなめらかにする
    const next = Int16Array.from(label);
    for (const i of mine) {
      if (seeds.includes(i)) continue;
      const cnt = new Map(); for (const j of nb[i]) if (mineSet.has(j) && label[j] >= 0) cnt.set(label[j], (cnt.get(label[j]) ?? 0) + 1);
      const own = cnt.get(label[i]) ?? 0; let b = label[i], bc = own; for (const [l, n] of cnt) if (n > bc) { b = l; bc = n; }
      if (b !== label[i]) next[i] = b;
    }
    label.set(next);
  }
  // 飛び地の除去: 各領域の最大の連結成分だけ残し、はぐれたセルは接している領域へ移す
  for (let guard = 0; guard < 6; guard++) {
    let moved = false;
    for (let k = 0; k < seeds.length; k++) {
      const cells = mine.filter((i) => label[i] === k); if (!cells.length) continue;
      const seen = new Set(), comps = [];
      for (const s of cells) { if (seen.has(s)) continue; const comp = [s]; seen.add(s); for (let q = 0; q < comp.length; q++) for (const j of nb[comp[q]]) if (label[j] === k && !seen.has(j)) { seen.add(j); comp.push(j); } comps.push(comp); }
      if (comps.length < 2) continue;
      comps.sort((a, b) => b.length - a.length);
      for (const comp of comps.slice(1)) for (const i of comp) {
        const cnt = new Map(); for (const j of nb[i]) if (mineSet.has(j) && label[j] !== k && label[j] >= 0) cnt.set(label[j], (cnt.get(label[j]) ?? 0) + 1);
        const b = [...cnt].sort((a, c) => c[1] - a[1])[0]?.[0]; if (b != null) { label[i] = b; moved = true; }
      }
    }
    if (!moved) break;
  }
  const groups = seeds.map((_, k) => mine.filter((i) => label[i] === k)).filter((g) => g.length);
  const lab = new Map(); groups.forEach((g, k) => g.forEach((i) => lab.set(i, k)));
  const capK = lab.get(capCell) ?? -1;
  // 区画どうしの隣り合い・勝者との接触・前線からの深さ
  const adj = groups.map(() => new Set()), contact = groups.map(() => 0);
  groups.forEach((g, k) => { for (const i of g) for (const j of nb[i]) { const l = lab.get(j); if (l != null && l !== k) adj[k].add(l); if (win.has(st[j])) contact[k]++; } });
  const depth = groups.map((_, k) => (contact[k] > 0 ? 0 : -1)), parent = groups.map(() => -1), queue = [];
  depth.forEach((d, k) => { if (d === 0) queue.push(k); });
  for (let q = 0; q < queue.length; q++) { const k = queue[q]; for (const l of adj[k]) if (depth[l] < 0) { depth[l] = depth[k] + 1; parent[l] = k; queue.push(l); } }
  const idx = groups.map((_, k) => k).filter((k) => k !== capK && depth[k] >= 0 && depth[k] <= 2).sort((a, b) => depth[a] - depth[b] || contact[b] - contact[a]).slice(0, maxParcels);
  const pos = new Map(idx.map((k, p) => [k, p]));
  return idx.map((k) => {
    const chain = []; for (let p = parent[k]; p >= 0; p = parent[p]) chain.push(p);
    // 国境（勝者との境）に近いセルから並べる。予算に合わせて縮めるときは、先頭から切る
    const g = groups[k].slice().sort((a, b) => Number(nb[b].some((j) => win.has(st[j]))) - Number(nb[a].some((j) => win.has(st[j]))));
    return { cells: g, depth: depth[k], contact: contact[k], needs: chain.filter((p) => pos.has(p) && p !== capK).map((p) => pos.get(p)) };
  });
}
