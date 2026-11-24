// v7.0.0 (担当A): 街道と航路。都市（集落）どうしを、地形コスト最小の経路で結び、civ.roads に保存する。
//   road = { id, a, b, kind:"road"|"sea", cost, cells:[cellId…] }   a・b は集落ID（a < b）。cells は a の立地から b の立地まで。
//   ・陸の街道: 坂（標高差）・山・川を渡る所を高く、既存の街道の上を安くする（→ 幹線ができ、合流点・河口・峠が結節点になる）。
//   ・航路: 港（海に面した集落）どうしを、海のセルだけで結ぶ。
//   ・つなぎ方: 序列が同じか上の近い集落へ（村は一番近い町以上へ）。大都市・都市は互いにも結ぶ。
//   ・決定的: 乱数を使わない。集落ID順に処理し、同じ費用なら小さいセルIDを選ぶ。
//   ・保存: 経路のセル列まで保存する（描画・移動の計算が速いほうを優先）。新しい集落ができたら足し、集落が消えたら外す（updateRoads）。
export const ROAD = Object.freeze({ landMaxCost: 60, seaMaxCost: 80, villageMaxCost: 25, riverCross: 1.2, mountainK: 3, slopeM: 450, discount: 0.35 });

class Heap { // 最小ヒープ（費用, セル）
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] < k[i] || (k[p] === k[i] && v[p] <= v[i])) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } }
  pop() { const k = this.k, v = this.v, rk = k[0], rv = v[0], lk = k.pop(), lv = v.pop(); if (k.length) { k[0] = lk; v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < k.length && (k[l] < k[m] || (k[l] === k[m] && v[l] < v[m]))) m = l; if (r < k.length && (k[r] < k[m] || (k[r] === k[m] && v[r] < v[m]))) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } } return [rk, rv]; }
}

/** 世界ごとの作業領域（世界のたびに 1 回だけ確保） */
function work(world) { return world._roadWork ?? (Object.defineProperty(world, "_roadWork", { value: { dist: new Float64Array(world.mesh.cellCount).fill(Infinity), prev: new Int32Array(world.mesh.cellCount).fill(-1), mask: null, maskAt: -1, maskLen: -1 }, enumerable: false, writable: true }), world._roadWork); }
/** 既存の街道が通っているセル（安くする）。civ.roads が変わったら作り直す */
function roadMask(world, civ) {
  const W = work(world), roads = civ.roads ?? []; let n = 0; for (const r of roads) n += r.cells.length;
  if (W.mask && W.maskLen === roads.length && W.maskAt === n) return W.mask;
  const m = new Uint8Array(world.mesh.cellCount); for (const r of roads) if (r.kind === "road") for (const c of r.cells) m[c] = 1; W.mask = m; W.maskLen = roads.length; W.maskAt = n; return m;
}
const stepCost = (ce, mask, i, j) => {
  let c = 1 + Math.abs(ce.elevation[j] - ce.elevation[i]) / ROAD.slopeM + (ce.mountain ? Math.max(0, ce.mountain[j]) * ROAD.mountainK : 0);
  if (ce.river[j] && !ce.river[i]) c += ROAD.riverCross; // 川を渡る
  if (mask[j]) c *= ROAD.discount; // 既存の街道の上
  return c;
};

/**
 * from から、targets（Set<セル>）のうち近い順に最大 want 個へ、最小費用の経路を探す。
 * sea=true は海のセルだけ。戻り値: [{ cell, cost, path:[from…cell] }]（近い順）
 */
export function leastCostPaths(world, civ, from, targets, { sea = false, maxCost, want = 3 } = {}) {
  const { mesh, cell: ce } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds, W = work(world), dist = W.dist, prev = W.prev, touched = [], mask = sea ? null : roadMask(world, civ), out = [];
  const ok = sea ? (c) => ce.elevation[c] <= 0 : (c) => ce.elevation[c] > 0, heap = new Heap(); dist[from] = 0; prev[from] = -1; touched.push(from); heap.push(0, from);
  while (heap.size && out.length < want) {
    const [d, i] = heap.pop(); if (d > dist[i]) continue; if (d > maxCost) break;
    if (i !== from && targets.has(i)) { const path = []; for (let x = i; x !== -1; x = prev[x]) path.push(x); path.reverse(); out.push({ cell: i, cost: d, path }); }
    if (sea && i !== from && !ok(i)) continue; // 航路は、別の港の陸のセルを通り抜けない（そこが終点）
    for (let k = off[i]; k < off[i + 1]; k++) {
      const j = nb[k]; if (!ok(j) && !(targets.has(j))) continue; // 港の集落は陸にあるので、航路の目標だけは例外
      const nd = d + (sea ? 1 + (ce.coastDist[j] <= 1 ? 0.15 : 0) : stepCost(ce, mask, i, j));
      if (nd < dist[j]) { if (dist[j] === Infinity) touched.push(j); dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  for (const c of touched) { dist[c] = Infinity; prev[c] = -1; }
  return out;
}

const isPort = (world, s) => { const { mesh, cell: ce } = world, off = mesh.neighborOffsets, nb = mesh.neighborIds; for (let k = off[s.cell]; k < off[s.cell + 1]; k++) if (ce.elevation[nb[k]] <= 0) return true; return false; };
const edgeKey = (a, b, kind) => (a < b ? `${kind}|${a}|${b}` : `${kind}|${b}|${a}`);

/** 集落 s から、まだ無い街道・航路を足す。added を返す */
function connectOne(world, civ, s, byCell, keys, nextId) {
  const added = [], rank = s.rank ?? 4;
  // 陸: 序列が同じか上の集落（近い順に最大 2〜3）。村は一番近い町以上へ
  const want = rank <= 2 ? 3 : rank === 3 ? 2 : 1, maxCost = rank === 4 ? ROAD.villageMaxCost : ROAD.landMaxCost;
  const tg = new Set(); for (const [c, o] of byCell) if (o.id !== s.id && (o.rank ?? 4) <= (rank === 4 ? 3 : rank)) tg.add(c);
  for (const hit of leastCostPaths(world, civ, s.cell, tg, { maxCost, want })) {
    const o = byCell.get(hit.cell), key = edgeKey(s.id, o.id, "road"); if (keys.has(key)) continue; keys.add(key);
    added.push({ id: nextId(), a: s.id < o.id ? s.id : o.id, b: s.id < o.id ? o.id : s.id, kind: "road", cost: Math.round(hit.cost * 10) / 10, cells: s.id < o.id ? hit.path : [...hit.path].reverse() });
  }
  // 海: 港どうし（序列 3 以上の港。近い 2 つまで）
  if (rank <= 3 && isPort(world, s)) {
    const pt = new Set(); for (const [c, o] of byCell) if (o.id !== s.id && (o.rank ?? 4) <= 3 && isPort(world, o)) pt.add(c);
    for (const hit of leastCostPaths(world, civ, s.cell, pt, { sea: true, maxCost: ROAD.seaMaxCost, want: 2 })) {
      const o = byCell.get(hit.cell), key = edgeKey(s.id, o.id, "sea"); if (keys.has(key)) continue; keys.add(key);
      added.push({ id: nextId(), a: s.id < o.id ? s.id : o.id, b: s.id < o.id ? o.id : s.id, kind: "sea", cost: Math.round(hit.cost * 10) / 10, cells: s.id < o.id ? hit.path : [...hit.path].reverse() });
    }
  }
  return added;
}

/** 街道・航路を、まだつながっていない集落について足す。新しい集落・旧セーブ・先史の終わりが使う（集落ID順＝決定的）。戻り値: 足した数 */
export function updateRoads(world, civ) {
  const roads = civ.roads ?? (civ.roads = []), sorted = Object.values(civ.settlements).sort((a, b) => (a.id < b.id ? -1 : 1));
  const byCell = new Map(sorted.map((s) => [s.cell, s])), keys = new Set(roads.map((r) => edgeKey(r.a, r.b, r.kind)));
  let seq = roads.reduce((m, r) => Math.max(m, Number(String(r.id).replace(/\D/g, "")) || 0), 0); const nextId = () => `road${++seq}`;
  // 序列の高い（大きな）集落から。大きな所の幹線が先にでき、小さな所はそこへ寄る（既存の街道が安くなる）
  const todo = sorted.filter((s) => !s.roadsDone).sort((a, b) => (a.rank ?? 4) - (b.rank ?? 4) || (a.id < b.id ? -1 : 1));
  let n = 0; for (const s of todo) { const add = connectOne(world, civ, s, byCell, keys, nextId); s.roadsDone = true; for (const r of add) { roads.push(r); n++; } }
  if (n) { const W = work(world); W.maskLen = -1; }
  return n;
}
/** 集落が消えたときに、つながる街道を外す */
export function removeRoadsOf(civ, settlementId) { if (Array.isArray(civ.roads)) civ.roads = civ.roads.filter((r) => r.a !== settlementId && r.b !== settlementId); }

/** 結節点: 3 本以上の街道が通るセル（河口・合流・峠・分岐）。集落のセルは除く。{cell, degree} の配列 */
export function roadJunctions(civ) {
  const cnt = new Map(); for (const r of civ.roads ?? []) if (r.kind === "road") for (const c of new Set(r.cells)) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const sc = new Set(Object.values(civ.settlements).map((s) => s.cell)), out = []; for (const [cell, degree] of cnt) if (degree >= 3 && !sc.has(cell)) out.push({ cell, degree }); return out.sort((a, b) => a.cell - b.cell);
}
/** 2 つの集落の間の道（あれば）。描画・移動用 */
export function roadBetween(civ, a, b) { return (civ.roads ?? []).find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null; }
