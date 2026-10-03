// 「おまかせ領土」：ユーザーが地図をドラッグしなくても、新しい国家などの領土を自動で決める。
// 空き地（どの国家にも属さない陸）から、種になるセルを選んで、まとまった形に広げる。
//
// 方針:
//   ・既存の国家の土地は奪わない（空き地だけを使う）。空き地が無ければ「無い」と返し、
//     呼び出し側（UI）が「ドラッグで塗ってください」と案内する。
//   ・広げ方は「種からの距離 × 乱数」が小さい順。円に近い、やや有機的な形になる。
//   ・純粋ロジック層：DOM に依存しない。map は書き換えない。
//
// 首都の位置（pickCapitalCell）も同じ層に置く。

export const TERRITORY_SIZES = Object.freeze({
  s: { label: "小", ratio: 0.04 },
  m: { label: "中", ratio: 0.10 },
  l: { label: "大", ratio: 0.20 },
});
const MIN_CELLS = 6;

const isLand = (map, i) => map.pack.cells.biome[i] !== 0;

const KINDS = ["state", "culture", "religion"];

/** 空き地（陸で、その種類の持ち主が無いセル）の数。kind: "state"|"culture"|"religion" */
export function countFreeLand(map, kind = "state") {
  const owner = map.pack.cells[kind], { biome } = map.pack.cells;
  let n = 0;
  for (let i = 0; i < owner.length; i++) if (biome[i] !== 0 && owner[i] === 0) n++;
  return n;
}

/**
 * 空き地から領土を決める。
 * @param {object} map
 * @param {{kind?:"state"|"culture"|"religion", size?:"s"|"m"|"l", rnd:{next:()=>number}, seedCell?:number}} opts
 *   kind: 何の領土か（既定は国家）。持ち主がまだ無いセルだけを使う。
 *   seedCell を渡すと、そのセルから広げる（空き地でなければ無視して自動選択）
 * @returns {{cells:number[], seed:number, reason?:"no-free-land"}}
 */
export function pickAutoTerritory(map, { kind = "state", size = "m", rnd, seedCell = -1, ownCells = null }) {
  if (!KINDS.includes(kind)) throw new Error(`おまかせ領土に未対応の種類です: ${kind}`);
  const owner = map.pack.cells[kind], { biome } = map.pack.cells;
  const { cells: geom, p } = map.geometry.pack;
  const n = owner.length;
  const free = (i) => biome[i] !== 0 && owner[i] === 0;

  let freeCount = 0, landCount = 0;
  for (let i = 0; i < n; i++) { if (biome[i] !== 0) landCount++; if (free(i)) freeCount++; }
  if (!freeCount) return { cells: [], seed: -1, reason: "no-free-land" };

  // 種: 指定があればそれ。無ければ「十分に広い空き地」の中からランダムに選ぶ。
  // 空き地は飛び地に分かれていることがある。小さな飛び地に当たると、大きさを指定しても
  // 広げられないので、つながった空き地ごとの広さを数えて、目標に届く（無ければ最大の）ものだけを候補にする。
  const ratio = (TERRITORY_SIZES[size] ?? TERRITORY_SIZES.m).ratio;
  const want = Math.max(MIN_CELLS, Math.round(landCount * ratio));
  let seed = seedCell >= 0 && free(seedCell) ? seedCell : -1;
  let want_override = 0;
  if (seed < 0 && !(Array.isArray(ownCells) && ownCells.length)) {
    const comp = new Int32Array(n).fill(-1);
    const sizes = [];
    for (let i = 0; i < n; i++) {
      if (!free(i) || comp[i] >= 0) continue;
      const id = sizes.length; let count = 0;
      const stack = [i]; comp[i] = id;
      while (stack.length) {
        const k = stack.pop(); count++;
        for (const j of geom.c[k]) if (free(j) && comp[j] < 0) { comp[j] = id; stack.push(j); }
      }
      sizes.push(count);
    }
    const biggest = Math.max(...sizes);
    const threshold = Math.min(want, biggest);
    const candidates = [];
    for (let i = 0; i < n; i++) if (free(i) && sizes[comp[i]] >= threshold) candidates.push(i);
    let bestScore = -1;
    for (let t = 0; t < 8; t++) {
      const cand = candidates[Math.floor(rnd.next() * candidates.length)];
      const score = geom.c[cand].filter(free).length; // 周りに空き地が多い（内側寄り）ほど良い
      if (score > bestScore) { bestScore = score; seed = cand; }
    }
  }

  // ---- 広げ方：地形のコスト付きで、まとまりよく広げる ----
  //   ・山（高い所）は越えにくく、平地・低地へ先に広がる（実際の国の広がりに近い）
  //   ・すでに自分の土地に囲まれたセルを優先し、飛び地や虫食いのギザギザを作らない
  //   ・既存の領土を広げるとき（ownCells）は、必ずその領土に接した空き地から始める（離れた所に飛ばない）
  const H = map.geometry.pack.h;
  const stepCost = (j) => 1 + (H ? Math.max(0, H[j] - 45) / 25 : 0);
  const expanding = Array.isArray(ownCells) && ownCells.length > 0;
  const inSet = new Uint8Array(n);
  const cells = [];
  const dist = new Map();           // 空き地セル → 起点からの累積コスト
  const frontier = new Set();
  const offer = (from, fromDist) => {
    for (const j of geom.c[from]) {
      if (!free(j) || inSet[j]) continue;
      const d = fromDist + stepCost(j);
      if (!dist.has(j) || d < dist.get(j)) dist.set(j, d);
      frontier.add(j);
    }
  };
  if (expanding) {
    const mine = new Uint8Array(n);
    for (const i of ownCells) mine[i] = 1;
    for (const i of ownCells) offer(i, 0);
    if (!frontier.size) return { cells: [], seed: -1, reason: "no-adjacent-free-land" };
    seed = ownCells[0];
    // 領土の何割を足すか。小さい国はそれなりに、大きい国は割合で。最低 MIN_CELLS
    const grow = Math.max(MIN_CELLS, Math.round(Math.max(ownCells.length * ratio * 2, landCount * ratio * 0.5)));
    want_override = grow;
  } else {
    inSet[seed] = 1; cells.push(seed); dist.set(seed, 0); offer(seed, 0);
  }
  const target = expanding ? want_override : want;
  const near = (j) => { let c = 0; for (const k of geom.c[j]) if (inSet[k] || (expanding && ownMask(k))) c++; return c; };
  const ownSet = expanding ? new Set(ownCells) : null;
  const ownMask = (k) => ownSet.has(k);
  while (cells.length < target && frontier.size) {
    let best = -1, bestKey = Infinity;
    for (const j of frontier) {
      const compact = 1 - 0.07 * Math.min(4, Math.max(0, near(j) - 1)); // 周りを囲まれているほど先に埋める
      const key = (dist.get(j) ?? 1) * (0.85 + 0.3 * rnd.next()) * compact;
      if (key < bestKey) { bestKey = key; best = j; }
    }
    frontier.delete(best);
    if (inSet[best]) continue;
    inSet[best] = 1; cells.push(best);
    offer(best, dist.get(best) ?? 0);
  }
  return { cells, seed };
}

/**
 * 国家の首都を置くのにふさわしいセル。領土の重心に最も近い、都市の無い陸セル。
 * 領土が無い・空いているセルが無ければ -1。
 */
export function pickCapitalCell(map, stateId) {
  const { state, burg } = map.pack.cells;
  const { p } = map.geometry.pack;
  const members = [];
  let sx = 0, sy = 0;
  for (let i = 0; i < state.length; i++) {
    if (state[i] === stateId && isLand(map, i)) { members.push(i); sx += p[i][0]; sy += p[i][1]; }
  }
  if (!members.length) return -1;
  const cx = sx / members.length, cy = sy / members.length;
  let best = -1, bestD = Infinity;
  for (const i of members) {
    if (burg[i]) continue;
    const d = Math.hypot(p[i][0] - cx, p[i][1] - cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
