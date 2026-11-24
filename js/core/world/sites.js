// v6.13.0: 集落（都市）の適地スコア。史実の都市が立つ場所の傾向を、セルの地理から数値にする。
//   肥沃さ + 淡水（川・湖畔）+ 川の合流点 + 河口 + 良港（湾・岬の入り江）+ 防御性（周りより少し高い所）+ 平坦さ − 高山・極端な気候。
//   集落が生まれる場所の選び方（先史の終わり）と、初期の人口集団の置き場所が使う。順位規模則・街道は、まだ入れていない。
const LAKE = 2;

/** セル c の適地スコア（大きいほど都市が立ちやすい。おおよそ 0〜3）。world は generateWorld の出力 */
export function siteScore(world, c) {
  const { mesh, cell } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds, e = cell.elevation;
  let seaN = 0, lakeN = 0, inflow = 0, n = 0, eSum = 0, higher = 0;
  for (let k = off[c]; k < off[c + 1]; k++) {
    const j = nb[k]; n++;
    if (e[j] <= 0) seaN++; else { eSum += e[j]; if (e[j] > e[c]) higher++; }
    if (cell.landWater[j] === LAKE) lakeN++;
    if (cell.river[j] && cell.riverTo[j] === c) inflow++;
  }
  const land = Math.max(1, n - seaN), mean = eSum / land, rel = e[c] - mean, T = cell.temp[c];
  let s = cell.fertility[c];
  if (cell.river[c]) s += 0.35; else if (lakeN) s += 0.25; // 淡水
  if (inflow >= 2) s += 0.3 + 0.1 * Math.min(3, inflow - 2); // 合流点（水運・水利・交通の結節）
  if (cell.river[c] && cell.riverTo[c] >= 0 && e[cell.riverTo[c]] <= 0) s += 0.4; // 河口（外洋と内陸の乗り換え）
  if (seaN > 0) s += seaN <= 3 ? 0.3 : 0.1; // 良港: 海に 1〜3 面だけ接する（湾・入り江）。四方が海の岬や小島は風波が強い
  if (rel > 15 && rel < 160 && higher <= 2) s += 0.12; // 防御性: 周りより少し高い（丘・段丘）
  const slope = Math.abs(rel) / (cell.areaKm2 ? Math.sqrt(cell.areaKm2[c]) : 70); s += slope < 3 ? 0.1 : 0; // 平坦
  if (e[c] > 1500) s -= 0.4 + (e[c] - 1500) / 2500; // 高地は住みにくい
  if (T < 2) s -= (2 - T) * 0.05; else if (T > 30) s -= (T - 30) * 0.05;
  return s;
}

/** セルごとに決まる擬似乱数 0〜1（同じ世界・同じセルなら同じ値。出力が決定的になる） */
export function cellRand(seed, c, salt = 0) { let h = (seed ^ Math.imul(c + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }

/**
 * 先史の終わりに、どの集団がどのセルに集落を持つかを決める（適地スコアの高い順）。
 *   各集団の領域（と近隣 2 セル）の中で最も適地スコアの高いセルを選び、スコアの高い集団から確定する。
 *   確定した集落の周り 0〜2 セル（セルごとの乱数）は他の集落を置けない → 間隔がまちまちになり、全セルが集落で埋まる格子状の並びにならない。
 *   置けなかった集団は、集落を持たない村落として始まる（のちに人口が増えて定住すると、foundSettlement が既存の集落を避けて立てる）。
 * 戻り値: Map(groupId → cell)
 */
export function planSettlements(world, groups, seed, score = null) {
  const { mesh } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds, V = mesh.cellCount, plan = [];
  for (const g of groups) {
    let best = -1, bs = -Infinity;
    for (const c of g.cells) { if (world.cell.elevation[c] <= 0) continue; const s = (score ? score(world, c, siteScore(world, c), g) : siteScore(world, c)) + (cellRand(seed, c, 1) - 0.5) * 0.3; if (s > bs) { bs = s; best = c; } }
    if (best >= 0) plan.push({ g, c: best, s: bs });
  }
  plan.sort((a, b) => b.s - a.s || a.c - b.c);
  const blocked = new Uint8Array(V), q = new Int32Array(V), depth = new Uint8Array(V), seen = new Int32Array(V).fill(-1), out = new Map();
  plan.forEach(({ g, c }, idx) => {
    if (blocked[c]) return;
    out.set(g.id, c);
    const r = Math.floor(cellRand(seed, c, 2) * 3); // 0〜2 セル（0 = そのセルだけ）
    let qh = 0, qt = 0; q[qt++] = c; depth[c] = 0; seen[c] = idx; blocked[c] = 1;
    while (qh < qt) { const x = q[qh++]; if (depth[x] >= r) continue; for (let k = off[x]; k < off[x + 1]; k++) { const j = nb[k]; if (seen[j] !== idx) { seen[j] = idx; depth[j] = depth[x] + 1; blocked[j] = 1; q[qt++] = j; } } }
  });
  return out;
}

/** 集落を新しく立てるセル: 領域内で適地スコアが最大。ただし既存の集落（occ）に近いほど減点する（隣接 −0.6・2 セル先 −0.25・同じセルは不可） */
export function pickSite(world, cells, occ, score = null) {
  const { mesh } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds; let best = -1, bs = -Infinity;
  for (const c of cells) {
    if (world.cell.elevation[c] <= 0 || occ.has(c)) continue;
    let s = score ? score(world, c, siteScore(world, c)) : siteScore(world, c); // score(world, cell, base): 都市プラグインが得点を差し替える口
    for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (occ.has(j)) { s -= 0.6; continue; } for (let m = off[j]; m < off[j + 1]; m++) if (occ.has(nb[m])) { s -= 0.25; break; } }
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

/**
 * v7.0.0: 先史の終わりの集落の配置（複数拠点・順位規模則）。planSettlements（集団ごとに 1 つ）の後継。
 *   ・集団の周り 2 セル以内の陸から、適地スコア＋ゆらぎで選ぶ。集団ごとに 1 つに限らない（大きな集団ほど多い）。
 *   ・1 巡目: 各集団の「中心の集落」を、得点の高い順に置く。置いたあと周り 0〜2 セルは中心を置けない（間隔がまちまち）。
 *   ・2 巡目: 人口の大きい集団から、追加の集落を置く（既存の集落の隣は減点。置けるだけ。確率で途中でやめる）。→ 少数の大都市＋多数の小集落。
 *   ・各集団の集落の重みは 1/k（k は得点順）にゆらぎを掛けたもの＝順位規模則の種。
 * groups: [{ id, cell, pop, cells? }]。maxSites(pop): 集団ごとの上限（civ 層の maxSitesFor を渡す。world/ は civ を import しない）。
 * 戻り値: Map(groupId → [{ cell, score, weight }])（先頭が中心の集落）
 */
export function planSites(world, groups, seed, score = null, maxSites = () => 1) {
  const { mesh, cell } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds, V = mesh.cellCount, out = new Map();
  const cands = new Map(), sc = (g, c) => (score ? score(world, c, siteScore(world, c), g) : siteScore(world, c)) + (cellRand(seed, c, 1) - 0.5) * 0.3;
  for (const g of groups) {
    const seen = new Set([g.cell]), q = [g.cell], depth = new Map([[g.cell, 0]]), list = [];
    for (let h = 0; h < q.length; h++) { const x = q[h]; if (cell.elevation[x] > 0) list.push({ c: x, s: sc(g, x) }); if (depth.get(x) >= 2) continue; for (let k = off[x]; k < off[x + 1]; k++) { const j = nb[k]; if (!seen.has(j)) { seen.add(j); depth.set(j, depth.get(x) + 1); q.push(j); } } }
    list.sort((a, b) => b.s - a.s || a.c - b.c); if (list.length) cands.set(g.id, list);
  }
  const blocked = new Uint8Array(V), taken = new Uint8Array(V), spread = (c, r) => { const seenL = new Set([c]); let fr = [c]; for (let d = 0; d < r; d++) { const nx = []; for (const x of fr) for (let k = off[x]; k < off[x + 1]; k++) { const j = nb[k]; if (!seenL.has(j)) { seenL.add(j); blocked[j] = 1; nx.push(j); } } fr = nx; } };
  const order = groups.filter((g) => cands.has(g.id)).map((g) => ({ g, s: cands.get(g.id)[0].s })).sort((a, b) => b.s - a.s || (a.g.id < b.g.id ? -1 : 1));
  const pops = order.map((o) => o.g.pop).sort((x, y) => x - y), q75 = pops[Math.floor(pops.length * 0.7)] ?? Infinity;
  for (const { g } of order) { // 1 巡目: 中心の集落
    const pick = cands.get(g.id).find((x) => !blocked[x.c] && !taken[x.c]); if (!pick) continue;
    out.set(g.id, [{ cell: pick.c, score: pick.s, weight: 1 }]); taken[pick.c] = 1; blocked[pick.c] = 1; spread(pick.c, g.pop >= q75 ? 4 + Math.floor(cellRand(seed, pick.c, 2) * 2) : Math.floor(cellRand(seed, pick.c, 2) * 2)); /* 大きな集団の中心は周りを広く空ける（孤立した大都市）。小さな集団は密に並ぶ（集まった小集落） */
  }
  const big = [...out.keys()].map((id) => groups.find((g) => g.id === id)).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1));
  for (const g of big) { // 2 巡目: 追加の集落
    const m = maxSites(g.pop), want = cellRand(seed, g.cell, 6) < 0.4 ? 1 + Math.floor((m - 1) * Math.pow(cellRand(seed, g.cell, 5), 1.2) + 0.5) : 1, mine = out.get(g.id); let k = 1; /* 集団ごとに集落の数がばらつく（1 つだけの孤立した集落も多い） */
    while (mine.length < want) {
      let best = null, bs = -Infinity;
      for (const x of cands.get(g.id)) { if (taken[x.c]) continue; let s = x.s; for (let m = off[x.c]; m < off[x.c + 1]; m++) if (taken[nb[m]]) { s = cellRand(seed, x.c, 7) < 0.75 ? -Infinity : s - 0.3; break; } /* 隣に置くかどうかもばらつく */ if (s > bs) { bs = s; best = x; } }
      if (!best || bs < -0.3 || cellRand(seed, best.c, 3) < 0.12) break; // 適地が尽きた・確率で打ち切り（ばらつき）
      k++; mine.push({ cell: best.c, score: best.s, weight: Math.pow(1 / k, 1.2) * (0.7 + 0.6 * cellRand(seed, best.c, 4)) }); taken[best.c] = 1;
    }
  }
  return out;
}
