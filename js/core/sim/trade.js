// 経済・交易の簡易モデル：国ごとの「産物」「需要」から、国家間の取引（deals）と税収を計算する。
//
// 位置づけ:
//   ・Azgaar 本家の経済（市場・生産チェーン・交易品150種ほど）は「地図生成時に1回」まとめて計算する大がかりな仕組み。
//     ここでは意図的に簡略化し、「歴史を動かす側」に必要な量（誰が何を売り、誰が不足し、誰が税で潤うか）だけを出す。
//   ・産物は地図の既存データ（バイオーム・人口・海岸・都市人口）から毎回計算する。保存しない。
//     保存するのは国家の税率と国庫（salesTax / pollTax / treasury）だけ。これは Azgaar 本家と同じ項目名。
//   ・戦争中の国どうしは取引しない。同盟・友好は有利、不信・敵対は不利。輸出国の売上税は取引を割高にする。
//
// 純粋ロジック層：DOM に依存しない。map を変更しない。

import { getRelation } from "../edit/diplomacy.js";
import { activeWars } from "../edit/wars.js";

// ---------- 産物（ALTERHISTORY 独自の小さなカタログ） ----------
// out: バイオームid → 人口1あたりの年産量。coast: 海岸セルの人口1あたりの追加産量。
// need: 人口1あたりの年需要。craft: 都市人口あたりの産出（技術水準で増える）
// バイオームid は Azgaar の標準: 0海 1熱帯砂漠 2寒冷砂漠 3サバンナ 4草原 5熱帯季節林 6温帯落葉樹林 7熱帯雨林 8温帯雨林 9タイガ 10ツンドラ 11氷河 12湿地
export const GOODS = Object.freeze([
  { id: "grain",     label: "穀物",       icon: "🌾", value: 1.0, need: 0.55, out: { 4: 0.9, 6: 0.8, 5: 0.6, 3: 0.5, 7: 0.4, 8: 0.1, 12: 0.2 } },
  { id: "livestock", label: "家畜・肉",   icon: "🐑", value: 1.4, need: 0.25, out: { 4: 0.5, 3: 0.8, 2: 0.2, 10: 0.2, 1: 0.1, 6: 0.2 } },
  { id: "fish",      label: "魚",         icon: "🐟", value: 1.1, need: 0.12, out: { 12: 0.3 }, coast: 0.8 },
  { id: "timber",    label: "木材",       icon: "🪵", value: 1.2, need: 0.20, out: { 9: 0.8, 6: 0.7, 7: 0.9, 8: 0.9, 5: 0.5 } },
  { id: "fur",       label: "毛皮",       icon: "🦊", value: 3.0, need: 0.05, out: { 9: 0.5, 10: 0.6, 11: 0.1 } },
  { id: "salt",      label: "塩",         icon: "🧂", value: 1.6, need: 0.07, out: { 1: 0.5, 2: 0.3 }, coast: 0.4 },
  { id: "metal",     label: "鉱産物",     icon: "⛏", value: 2.5, need: 0.10, out: { 1: 0.15, 2: 0.25, 10: 0.2, 9: 0.15, 11: 0.2 } },
  { id: "spice",     label: "香辛料・果実", icon: "🌶", value: 4.0, need: 0.03, out: { 5: 0.4, 7: 0.5, 3: 0.1 } },
  { id: "crafts",    label: "工芸品",     icon: "🏺", value: 4.0, need: 0.13, craft: true, out: {} },
]);
export const GOOD_BY_ID = Object.freeze(Object.fromEntries(GOODS.map((g) => [g.id, g])));

// ---------- 税 ----------
// 政体ごとの基準税率（Azgaar 本家 docs/domain/taxes.md の値）。国ごとにゆらぎは付けない（再現性のため）。
export const TAX_BASE = Object.freeze({
  Monarchy: { salesTax: 0.15, pollTax: 0.20 },
  Theocracy: { salesTax: 0.25, pollTax: 0.10 },
  Union: { salesTax: 0.07, pollTax: 0.13 },
  Republic: { salesTax: 0.05, pollTax: 0.15 },
  Anarchy: { salesTax: 0, pollTax: 0 },
});
const FALLBACK_TAX = TAX_BASE.Monarchy;

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const round2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0));

/** 国の税率と国庫。未設定なら政体から補う（mapは変更しない）。 */
export function getFinance(state) {
  const base = TAX_BASE[state.form] ?? FALLBACK_TAX;
  return {
    salesTax: typeof state.salesTax === "number" ? clamp01(state.salesTax) : base.salesTax,
    pollTax: typeof state.pollTax === "number" ? clamp01(state.pollTax) : base.pollTax,
    treasury: typeof state.treasury === "number" ? state.treasury : 0,
  };
}
export const clampRate = clamp01;

// ---------- 産物・需要 ----------
/** 国ごとの「海岸セル」の判定用: 隣に海セルがあるか */
function coastalTest(map) {
  const { biome } = map.pack.cells;
  const adj = map.geometry.pack.cells.c;
  return (i) => { for (const j of adj[i]) if (biome[j] === 0) return true; return false; };
}

/**
 * 全国の産物（年産量）を返す。Map<stateId, {goodId: 量}>。
 * 人口が年次更新で変わっていても反映するため、セル人口の合計を「今の農村人口」に合わせて拡縮する。
 */
export function computeProduction(map) {
  const { biome, state, pop } = map.pack.cells;
  const isCoast = coastalTest(map);
  const sums = new Map(), prod = new Map();
  for (const s of map.pack.states) if (isLive(s)) { prod.set(s.i, Object.fromEntries(GOODS.map((g) => [g.id, 0]))); sums.set(s.i, 0); }
  for (let i = 0; i < state.length; i++) {
    const sid = state[i];
    if (!prod.has(sid) || biome[i] === 0) continue;
    const p = pop[i] ?? 0;
    if (p <= 0) continue;
    sums.set(sid, sums.get(sid) + p);
    const out = prod.get(sid);
    const coast = isCoast(i);
    for (const g of GOODS) {
      const per = (g.out[biome[i]] ?? 0) + (coast && g.coast ? g.coast : 0);
      if (per) out[g.id] += per * p;
    }
  }
  for (const s of map.pack.states) {
    if (!prod.has(s.i)) continue;
    const out = prod.get(s.i);
    const cellPop = sums.get(s.i);
    const k = cellPop > 0 && typeof s.rural === "number" ? s.rural / cellPop : 1; // 農村人口の増減を反映
    for (const g of GOODS) out[g.id] = round2(out[g.id] * k);
    // 工芸品: 都市人口 × 技術水準で増える
    const tech = typeof s.techLevel === "number" ? s.techLevel : 3;
    out.crafts = round2((s.urban ?? 0) * (0.3 + 0.08 * (tech - 1)));
  }
  return prod;
}

/** 国の年需要（人口 × 1人あたり需要。技術水準が高いほど工芸品・鉱産物の需要が増す） */
export function computeDemand(state) {
  const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
  const tech = typeof state.techLevel === "number" ? state.techLevel : 3;
  const d = {};
  for (const g of GOODS) {
    let per = g.need;
    if (g.id === "crafts" || g.id === "metal") per *= 1 + (tech - 3) * 0.12;
    d[g.id] = round2(pop * Math.max(0, per));
  }
  return d;
}

// ---------- 国家間の関係（取引のしやすさ） ----------
const RELATION_FACTOR = { Ally: 1.25, Friendly: 1.1, Neutral: 1, Unknown: 0.8, Suspicion: 0.65, Rival: 0.45, Enemy: 0.15, Vassal: 1.2, Suzerain: 1.2 };

/** 隣り合う国の組（セルの隣接から。state.neighbors が空の地図でも動くように自前で求める） */
export function stateAdjacency(map) {
  const { state, biome } = map.pack.cells;
  const adj = map.geometry.pack.cells.c;
  const pairs = new Set();
  for (let i = 0; i < state.length; i++) {
    if (biome[i] === 0 || !state[i]) continue;
    for (const j of adj[i]) {
      if (biome[j] === 0 || !state[j] || state[j] === state[i]) continue;
      pairs.add(state[i] < state[j] ? `${state[i]}:${state[j]}` : `${state[j]}:${state[i]}`);
    }
  }
  return pairs;
}

function atWar(wars, a, b) {
  return wars.some((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
}

/** 取引のしやすさ 0〜1.3。戦争中は 0。隣国は高く、遠いほど低い */
export function tradeAffinity(map, a, b, ctx) {
  if (atWar(ctx.wars, a, b)) return 0;
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const near = ctx.adjacent.has(key);
  const pa = map.pack.states[a].pole ?? [0, 0], pb = map.pack.states[b].pole ?? [0, 0];
  const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  const base = near ? 1 : 0.2 + 0.5 * Math.exp(-dist / (0.3 * ctx.diag));
  const rel = RELATION_FACTOR[getRelation(map, a, b)] ?? 1;
  return Math.min(1.3, base * rel);
}

// ---------- 交易の計算 ----------
/**
 * 国家間の取引を計算する。
 * @returns {{
 *   states: Map<number, {production:object, demand:object, net:object, exports:number, imports:number,
 *                        exportValue:number, importValue:number, salesTaxRevenue:number, pollTaxRevenue:number}>,
 *   deals: {from:number,to:number,good:string,units:number,price:number,value:number,tax:number}[]
 * }}
 */
export function computeTrade(map) {
  const wars = activeWars(map);
  const adjacent = stateAdjacency(map);
  const diag = Math.hypot(map.meta.width || 1280, map.meta.height || 774);
  const ctx = { wars, adjacent, diag };
  const live = map.pack.states.filter(isLive);
  const production = computeProduction(map);

  const info = new Map();
  for (const s of live) {
    const demand = computeDemand(s);
    const prod = production.get(s.i);
    const net = Object.fromEntries(GOODS.map((g) => [g.id, round2(prod[g.id] - demand[g.id])]));
    info.set(s.i, { production: prod, demand, net, exports: 0, imports: 0, exportValue: 0, importValue: 0, salesTaxRevenue: 0, pollTaxRevenue: 0 });
  }

  const deals = [];
  for (const g of GOODS) {
    const remaining = new Map(live.filter((s) => info.get(s.i).net[g.id] > 0.01).map((s) => [s.i, info.get(s.i).net[g.id]]));
    const importers = live.filter((s) => info.get(s.i).net[g.id] < -0.01).sort((a, b) => info.get(a.i).net[g.id] - info.get(b.i).net[g.id]);
    for (const imp of importers) {
      let need = -info.get(imp.i).net[g.id];
      const cands = [...remaining.keys()]
        .map((e) => ({ e, aff: tradeAffinity(map, imp.i, e, ctx), tax: getFinance(map.pack.states[e]).salesTax }))
        .filter((c) => c.aff > 0.05)
        .map((c) => ({ ...c, score: c.aff * (1 - 0.8 * c.tax) }))
        .sort((a, b) => b.score - a.score);
      for (const c of cands) {
        if (need < 0.01) break;
        const left = remaining.get(c.e);
        if (left < 0.01) continue;
        // 取引のしやすさが低いほど、まかなえる割合が下がる（距離・関係・関税の摩擦）
        const units = round2(Math.min(left, need * Math.min(1, c.score * 1.1)));
        if (units < 0.01) continue;
        const price = round2(g.value * (1 + 0.15 * (1 - Math.min(1, c.aff)))); // 疎遠なほど割高
        const value = round2(units * price);
        const tax = round2(value * c.tax);
        deals.push({ from: c.e, to: imp.i, good: g.id, units, price, value, tax });
        remaining.set(c.e, round2(left - units));
        need = round2(need - units);
      }
    }
  }

  for (const d of deals) {
    const a = info.get(d.from), b = info.get(d.to);
    a.exports += d.units; a.exportValue = round2(a.exportValue + d.value); a.salesTaxRevenue = round2(a.salesTaxRevenue + d.tax);
    b.imports += d.units; b.importValue = round2(b.importValue + d.value);
  }
  for (const s of live) {
    const f = getFinance(s);
    info.get(s.i).pollTaxRevenue = round2(f.pollTax * ((s.rural ?? 0) + (s.urban ?? 0)));
  }
  return { states: info, deals };
}

/** 1年ぶんの税収（人頭税 + 輸出にかかる売上税）。国庫に足す額 */
export function annualRevenue(tradeInfo) {
  return round2(tradeInfo.pollTaxRevenue + tradeInfo.salesTaxRevenue);
}

/** 国の貿易相手（取引額の大きい順）。{ partner, exportValue, importValue, goods:[goodId...] } */
export function tradePartners(trade, stateId) {
  const by = new Map();
  for (const d of trade.deals) {
    if (d.from !== stateId && d.to !== stateId) continue;
    const p = d.from === stateId ? d.to : d.from;
    const e = by.get(p) ?? { partner: p, exportValue: 0, importValue: 0, goods: new Set() };
    if (d.from === stateId) e.exportValue = round2(e.exportValue + d.value); else e.importValue = round2(e.importValue + d.value);
    e.goods.add(d.good);
    by.set(p, e);
  }
  return [...by.values()].map((e) => ({ ...e, goods: [...e.goods] }))
    .sort((a, b) => (b.exportValue + b.importValue) - (a.exportValue + a.importValue));
}
