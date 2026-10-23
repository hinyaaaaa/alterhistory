// v5 M1: 人口集団・生業・集落・移住（月次）。純粋ロジック（DOM・時刻・Math.random 非依存。乱数は ctx.rng）。
// 方針: 月次で全セル（25万）を走査しない。集団（数十〜数千）とその領域（自セル＋隣接）だけを評価する。
// プレイヤーの集団は自動で移住・定住・生業転換をしない。条件が整うと「提案」（civ.proposals）を出し、命令で実行する。
import { newGroup, sortedGroupIds } from "./civ-state.js";
import { makeEvent } from "./events.js";
import { densityMult } from "./techfx.js";
import { TECH, TECHS as TECHS_ORDER, refreshCand } from "./tech.js";
import { LAND_WATER, BIOMES } from "./world-consts.js";

export const SUBSISTENCE = Object.freeze({ forage: "採集狩猟", pastoral: "牧畜", agriculture: "農耕", fishing: "漁撈" });
export const POP = Object.freeze({
  growthPerMonth: 0.0012, minBudPop: 160, budShare: 0.35, budCooldown: 24, budPressure: 0.85,
  settleMinPop: 250, settleMinMonths: 24, villageMin: 100, townMin: 1500, cityMin: 10000, settledShare: 0.7,
  moveRange: { forage: 9, pastoral: 14, agriculture: 7, fishing: 9 }, waterCost: 6, famineRatio: 1.3, famineGap: 60, overshootDeath: 0.002,
  noTargetBackoff: 60, territoryKm2: 14000, agriTerritoryKm2: 6000, // 集団が使う領域の広さ（km²）。セルの大きさ（世界の解像度）に依存させない
});

const cacheOf = new WeakMap();
const terrain = (world) => { // セルごとの移動コストの下地（遅延計算・世界ごとに保持）
  let t = cacheOf.get(world); if (t) return t;
  const N = world.mesh.cellCount; t = { move: new Float32Array(N).fill(-1) }; cacheOf.set(world, t); return t;
};
/** 1セル進むコスト。陸: 1＋起伏・気候の重み。水: 航海が無ければ通れない（null）。 */
export function stepCost(world, c, seafaring) {
  const w = world.cell.landWater[c];
  if (w !== LAND_WATER.LAND) return seafaring >= 1 ? POP.waterCost : null;
  const t = terrain(world); if (t.move[c] >= 0) return t.move[c];
  const cell = world.cell, b = cell.biome[c]; let k = 1;
  if (cell.mountain[c] > 0.5 || b === BIOMES.ALPINE) k += 2.5; else if (cell.mountain[c] > 0.25) k += 1;
  if (b === BIOMES.HOT_DESERT || b === BIOMES.ICE) k += 2; else if (b === BIOMES.COLD_DESERT || b === BIOMES.TUNDRA || b === BIOMES.RAINFOREST) k += 0.8;
  if (cell.river[c]) k += 0.3;
  t.move[c] = k; return k;
}

/** 生業ごとに集団が使う面積（km²）。解像度（セルの大きさ）に依存しない */
export const budgetKm2 = (subsistence) => (subsistence === "agriculture" ? POP.agriTerritoryKm2 : POP.territoryKm2);
/** セル1つの人口密度（人/km²）。生業と知識で変わる。 */
export function cellDensity(world, c, subsistence, knowledge) {
  const cell = world.cell; if (cell.landWater[c] !== LAND_WATER.LAND) return 0;
  const fert = cell.fertility[c], b = cell.biome[c], forage = 0.04 * (0.3 + fert);
  switch (subsistence) {
    case "agriculture": return Math.max(forage, (cell.capacity[c] ?? 0) / cell.areaKm2[c] * 0.6 * Math.min(1, 0.4 + 0.6 * (knowledge?.agriculture ?? 1)));
    case "fishing": return (cell.coastDist[c] <= 1 || cell.river[c]) ? 0.1 * (0.4 + 0.6 * fert) : forage * 0.5;
    case "pastoral": return (b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.COLD_DESERT || b === BIOMES.TUNDRA) ? 0.1 * (0.5 + fert) : forage * 0.6;
    default: return forage;
  }
}
/** セル1つを単独で領域にしたときの収容力（人）。移住先の採点に使う */
export const cellCapacity = (world, c, subsistence, knowledge) => cellDensity(world, c, subsistence, knowledge) * Math.min(world.cell.areaKm2[c], budgetKm2(subsistence));
/** 集団の領域: 自セルから、隣接する陸セルを足して面積が territoryKm2 に届くまで（粗い世界では自セルだけ、細かい世界では数セル） */
export function territoryOf(world, c) {
  const m = world.mesh, out = [c]; let area = world.cell.areaKm2[c];
  for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1] && area < POP.territoryKm2; k++) { const n = m.neighborIds[k]; if (world.cell.landWater[n] === LAND_WATER.LAND) { out.push(n); area += world.cell.areaKm2[n]; } }
  return out;
}
const ensureCells = (world, g) => g.cells ?? (g.cells = territoryOf(world, g.cell));
function occupancy(world, civ) { const occ = new Map(); for (const id in civ.groups) for (const c of ensureCells(world, civ.groups[id])) occ.set(c, (occ.get(c) ?? 0) + 1); return occ; }
export function groupCapacity(world, g, occ) { // 領域のセルを、面積予算が尽きるまで密度×面積で積算（ほかの集団と重なるセルは按分）
  let k = 0, left = budgetKm2(g.subsistence); const tm = densityMult(g);
  for (const c of ensureCells(world, g)) { if (left <= 0) break; const a = Math.min(world.cell.areaKm2[c], left); k += cellDensity(world, c, g.subsistence, g.knowledge) * a / (occ.get(c) ?? 1); left -= a; }
  return k;
}

/** 起点から予算内で届く陸（航海があれば水も）の最短コスト。二分ヒープの Dijkstra（予算で範囲が限られる） */
export function reachable(world, from, budget, seafaring = 0) {
  const m = world.mesh, dist = new Map([[from, 0]]), hd = [0], hc = [from]; // 最小ヒープ（距離・セル）
  const push = (d, c) => { let i = hd.length; hd.push(d); hc.push(c); while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hd[i] = hd[p]; hc[i] = hc[p]; i = p; } hd[i] = d; hc[i] = c; };
  const pop = () => { const d0 = hd[0], c0 = hc[0], ld = hd.pop(), lc = hc.pop(), n = hd.length; if (n) { let i = 0; for (;;) { let k = 2 * i + 1; if (k >= n) break; if (k + 1 < n && hd[k + 1] < hd[k]) k++; if (hd[k] >= ld) break; hd[i] = hd[k]; hc[i] = hc[k]; i = k; } hd[i] = ld; hc[i] = lc; } return [d0, c0]; };
  while (hd.length) {
    const [d, c] = pop(); if (d > dist.get(c)) continue;
    for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
      const n = m.neighborIds[k], s = stepCost(world, n, seafaring); if (s == null) continue;
      const nd = d + s; if (nd <= budget && nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); push(nd, n); }
    }
  }
  return dist;
}
/** 分派・移住先の候補（空いている陸セルを、収容力と距離で採点。上位 limit 件） */
export function bestTargets(world, civ, g, occ, limit = 3) {
  const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] ?? 9, g.knowledge.seafaring), out = [];
  for (const [c, d] of dist) {
    if (c === g.cell || world.cell.landWater[c] !== LAND_WATER.LAND || occ.has(c)) continue;
    const cap = cellCapacity(world, c, g.subsistence, g.knowledge); if (cap <= 0) continue;
    out.push({ cell: c, cost: d, score: cap / (1 + d * 0.35) });
  }
  out.sort((a, b) => b.score - a.score || a.cell - b.cell); return out.slice(0, limit);
}
const stageOf = (p) => (p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village");
const STAGE_JA = { village: "村", town: "町", city: "都市" };

/** 新しい集団を作る（分派・移住）。IDは ids から発行 */
/** 小さな集団が持ち出せる技術: 人口が必要規模の半分以上で、前提もすべて持ち出せるもの（創始者効果。前提の欠けた上位技術は持たない） */
function inheritTech(known, pop) { const out = {}; for (const t of TECHS_ORDER) if (known[t.key] != null && t.minPop * 0.5 <= pop && t.prereq.every((p) => out[p] != null)) out[t.key] = known[t.key]; return out; }
export function spawnGroup(civ, ids, parent, cell, pop) {
  const id = ids.next("pop"); const g = newGroup(id, { cell, pop, subsistence: parent.subsistence, species: parent.speciesId, bornAt: civ.monthIndex, knowledge: parent.knowledge, parent: parent.id });
  g.stateId = parent.stateId; g.cohorts = parent.cohorts.map((c) => ({ ...c, tension: 0 })); g.tech = { known: inheritTech(parent.tech.known, pop), prog: {}, lost: {} }; refreshCand(g); // 小さな集団は、人口が足りない技術を持ち出せない（創始者効果）
  for (const [k, v] of Object.entries({ agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" })) g.knowledge[v] = g.tech.known[k] != null ? 1 : 0;
  civ.groups[id] = g; return g;
}
export function foundSettlement(world, civ, ids, g, cause = null) {
  let best = g.cell, bs = -1; for (const c of ensureCells(world, g)) { const s = world.cell.fertility[c] + (world.cell.river[c] ? 0.4 : 0) + (world.cell.coastDist[c] <= 1 ? 0.2 : 0); if (s > bs) { bs = s; best = c; } }
  const id = ids.next("settle"), s = { id, groupId: g.id, cell: best, foundedAt: civ.monthIndex, pop: Math.round(g.pop * POP.settledShare), stage: "village" };
  civ.settlements[id] = s; g.settlementId = id;
  makeEvent(civ, ids, { kind: "settlement_founded", title: "集落の成立", participants: [{ entityId: g.id, role: "founder" }, { entityId: id, role: "settlement" }], location: { cell: best }, causes: cause ? [{ targetId: cause, relation: "caused_by", basis: "direct" }] : [] });
  return s;
}

/**
 * 月次の人口更新（tick の economy_pop フェーズ）。ctx: { world, civ, ids, rng, growthMult?: (cell)=>number }
 * 返り値は無い。変更は civ（集団・集落・イベント・提案）へ直接書く。
 */
export function stepPopulation(ctx) {
  const { world, civ, ids, rng } = ctx, occ = occupancy(world, civ), mi = civ.monthIndex;
  for (const id of sortedGroupIds(civ)) {
    const g = civ.groups[id]; if (!g) continue;
    const K = Math.max(1, groupCapacity(world, g, occ)), pressure = g.pop / K, gm = (ctx.growthMult ? ctx.growthMult(g.cell) : 1) * (ctx.stateMult ? ctx.stateMult(g) : 1);
    // 1) 人口（ロジスティック。収容力を超えると減る）。乱数は ±20%
    const noise = 0.8 + 0.4 * rng(); g.pop = Math.max(0, g.pop + g.pop * POP.growthPerMonth * (1 - pressure) * noise * gm - (pressure > 1 ? g.pop * POP.overshootDeath * (pressure - 1) : 0)); // 収容力を超えた分は、飢えで早く減る
    if (pressure > POP.famineRatio && mi - g.famineAt >= POP.famineGap) { g.famineAt = mi; makeEvent(civ, ids, { kind: "famine", title: "飢え", participants: [{ entityId: g.id, role: "sufferer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "pop", before: Math.round(g.pop), after: Math.round(g.pop) }] }); }
    if (g.pop < 5) { delete civ.groups[id]; if (g.settlementId) delete civ.settlements[g.settlementId]; makeEvent(civ, ids, { kind: "group_extinct", title: "集団の消滅", participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell } }); continue; }
    g.settledMonths = g.order ? 0 : g.settledMonths + 1;
    // 2) 命令の進行（移動）
    if (g.order?.type === "move" && mi >= g.order.arriveAt) { g.cell = g.order.to; g.cells = null; g.order = null; g.settledMonths = 0; g.settlementId = null; makeEvent(civ, ids, { kind: "group_moved", title: "集団の移動完了", participants: [{ entityId: g.id, role: "mover" }], location: { cell: g.cell } }); }
    g.pressure = pressure; // 技術（tech.js）の条件で使う
    const c = g.cell, ce = world.cell;
    // 4) 生業の転換: 知識が満ちたら（NPC は実行、プレイヤーは提案）
    const want = g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 ? "agriculture" : g.subsistence === "forage" && g.knowledge.herding >= 1 ? "pastoral" : null;
    if (want) { if (g.player) addProposal(civ, ids, g, "change_subsistence", { subsistence: want }); else { const before = g.subsistence; g.subsistence = want; makeEvent(civ, ids, { kind: "subsistence_changed", title: `生業の転換（${SUBSISTENCE[before]}→${SUBSISTENCE[want]}）`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: want }] }); } }
    // 5) 定住（集落の成立）
    if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop && g.settledMonths >= POP.settleMinMonths) { if (g.player) addProposal(civ, ids, g, "found_settlement", {}); else foundSettlement(world, civ, ids, g); }
    const st = g.settlementId ? civ.settlements[g.settlementId] : null;
    if (st) { st.pop = Math.round(g.pop * POP.settledShare); const ns = stageOf(st.pop); if (ns !== st.stage) { const old = st.stage; st.stage = ns; makeEvent(civ, ids, { kind: "settlement_stage", title: `${STAGE_JA[old]}から${STAGE_JA[ns]}へ`, participants: [{ entityId: st.id, role: "settlement" }], location: { cell: st.cell } }); } }
    // 6) 分派（人口圧が高いとき）。移住は海・山・気候のコストで制限される
    if (pressure > POP.budPressure && g.pop >= POP.minBudPop * 2 && mi - g.lastBudAt >= POP.budCooldown && !g.order) {
      const targets = bestTargets(world, civ, g, occ, 3);
      if (targets.length) {
        if (g.player) addProposal(civ, ids, g, "split", { targets });
        else { const t = targets[0], moved = Math.round(g.pop * POP.budShare); g.pop -= moved; g.lastBudAt = mi; const child = spawnGroup(civ, ids, g, t.cell, moved); occ.set(t.cell, 1); for (const x of ensureCells(world, child)) occ.set(x, (occ.get(x) ?? 0) + 1); makeEvent(civ, ids, { kind: "group_split", title: "集団の分派", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t.cell } }); }
      } else g.lastBudAt = mi - POP.budCooldown + POP.noTargetBackoff; // 行き先が無いなら一定期間あとに再評価（空きが無い世界での無駄な探索を避ける）
    }
  }
}
/** 提案（プレイヤー集団用）。同じ集団・同じ種類の未処理の提案は重ねない */
export function addProposal(civ, ids, g, kind, payload) {
  if (civ.proposals.some((p) => p.groupId === g.id && p.kind === kind && !p.resolved)) return;
  civ.proposals.push({ proposalId: ids.next("proposal"), date: { ...civ.date }, groupId: g.id, kind, payload, resolved: false });
}
