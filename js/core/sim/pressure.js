// 因果の土台（v2.7.0）。「Aの後にBが起きた」と表示するだけでなく、Aによる状態変化が、実際にBの起きやすさと影響を変える。
//
//   ・指標（indicators）: 国の「いまの状態」を、地図から毎回導く（保存しない）。食料の需給・都市化・産業力・財政の余力・戦争の負担・民意など。
//   ・余波（shocks）  : 出来事が残す、時間とともに薄れる状態変化。保存先 ext.data.shocks = [{ s, k, a, y, m, h, from }]
//        s=国 / k=種類（food・health・order・fiscal）/ a=強さ（＋は悪化、−は好転）/ y,m=起きた年月 / h=半減期（月）/ from=元の出来事のキー
//   ・出来事の確率（w）と影響（impact）は、指標・余波・思潮から決まる。起きたときは、いちばん効いた余波の元の出来事を cause に記録する。
//
// 純粋ロジック層：DOM に依存しない。
import { makeCommand } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { getTechDoctrine } from "../edit/doctrines.js";
import { computeProduction, computeDemand } from "./trade.js";
import { expectedIndustry } from "./economy.js";
import { BALANCE } from "./balance.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mkOf = (d) => d.year * 12 + (d.month - 1);

export const SHOCK_KINDS = Object.freeze({ food: "食料", health: "疫病・衛生", order: "治安・民心", fiscal: "財政" });
export const FOOD_GOODS = Object.freeze(["grain", "livestock", "fish"]);

/** 出来事 → 残す余波。a: ＋は悪化、−は好転。h: 半減期（月） */
export const EVENT_SHOCKS = Object.freeze({
  famine: [{ k: "food", a: 0.7, h: 8 }, { k: "order", a: 0.25, h: 6 }],
  drought: [{ k: "food", a: 0.4, h: 6 }],
  flood: [{ k: "food", a: 0.2, h: 4 }, { k: "fiscal", a: 0.3, h: 8 }],
  earthquake: [{ k: "fiscal", a: 0.35, h: 10 }, { k: "order", a: 0.1, h: 6 }],
  epidemic: [{ k: "health", a: 0.6, h: 6 }, { k: "order", a: 0.15, h: 5 }],
  plague: [{ k: "health", a: 0.9, h: 10 }, { k: "order", a: 0.3, h: 8 }, { k: "food", a: 0.2, h: 6 }],
  harvest: [{ k: "food", a: -0.35, h: 6 }],
  tradeboom: [{ k: "fiscal", a: -0.3, h: 8 }],
  taxrevolt: [{ k: "order", a: 0.3, h: 6 }],
  pricespike: [{ k: "order", a: 0.2, h: 5 }, { k: "fiscal", a: 0.1, h: 5 }],
  refugees: [{ k: "food", a: 0.15, h: 5 }, { k: "order", a: 0.15, h: 5 }],
  riot: [{ k: "order", a: 0.3, h: 5 }],
  strike: [{ k: "fiscal", a: 0.1, h: 4 }, { k: "order", a: 0.15, h: 4 }],
  coup: [{ k: "order", a: 0.4, h: 8 }],
  recovery: [{ k: "health", a: -0.4, h: 6 }, { k: "food", a: -0.2, h: 6 }, { k: "order", a: -0.2, h: 6 }],
  festival: [{ k: "order", a: -0.2, h: 4 }],
});

// ---------- 余波 ----------
export const listShocks = (map) => map?.ext?.data?.shocks ?? [];
const writeShocks = (m, list) => { const x = ensureExt(m); if (list.length) x.data.shocks = list; else delete x.data.shocks; };

/** いまの強さ（半減期で薄れる） */
export const shockNow = (sh, date) => sh.a * Math.pow(0.5, Math.max(0, mkOf(date) - (sh.y * 12 + (sh.m - 1))) / Math.max(1, sh.h));

/** 国の、種類ごとの余波の合計（＋は悪化）。0〜の範囲に収める */
export function stressOf(map, stateId, date = map.worldTime ?? { year: 1, month: 1 }) {
  const out = { food: 0, health: 0, order: 0, fiscal: 0 };
  for (const sh of listShocks(map)) if (sh.s === stateId && out[sh.k] != null) out[sh.k] += shockNow(sh, date);
  for (const k of Object.keys(out)) out[k] = clamp(out[k], -1, 1.5);
  return out;
}

/** その国で、いま効いている余波（弱いものは除く）。強い順 */
export function activeShocks(map, stateId, date = map.worldTime ?? { year: 1, month: 1 }) {
  return listShocks(map).filter((sh) => sh.s === stateId).map((sh) => ({ ...sh, now: shockNow(sh, date) })).filter((sh) => Math.abs(sh.now) >= 0.05).sort((a, b) => Math.abs(b.now) - Math.abs(a.now));
}

/** 出来事が残す余波を足す部品（出来事のコマンドに足す）。薄れて消えた余波は、ここで捨てる */
export function shockPart(map, key, stateId, date, from = null, scale = 1) {
  const defs = EVENT_SHOCKS[key]; if (!defs) return null;
  const before = listShocks(map);
  const alive = before.filter((sh) => Math.abs(shockNow(sh, date)) >= 0.03);
  const add = defs.map((d) => ({ s: stateId, k: d.k, a: Math.round(d.a * scale * 100) / 100, y: date.year, m: date.month, h: d.h, ev: key, ...(from ? { from } : {}) }));
  const after = [...alive, ...add];
  return { apply: (m) => writeShocks(m, after), revert: (m) => writeShocks(m, before) };
}

/** 余波だけを足すコマンド（テスト・外部から） */
export function planAddShock(map, key, stateId, date, from = null) {
  const part = shockPart(map, key, stateId, date, from);
  return part ? makeCommand(`余波（${key}）`, [], [part]) : null;
}

// ---------- 指標 ----------
const cache = new WeakMap();

/** 食料の需給（国ごとの 供給÷需要）。地図の形が足りなければ 1 を返す */
function foodBalance(map) {
  const out = new Map();
  try {
    const prod = computeProduction(map);
    for (const s of map.pack.states) {
      if (!isLive(s)) continue;
      const mine = prod.get(s.i) ?? {}, dem = computeDemand(s);
      let sup = 0, need = 0;
      for (const g of FOOD_GOODS) { sup += mine[g] ?? 0; need += dem[g] ?? 0; }
      out.set(s.i, need > 0 ? sup / need / Math.max(0.01, BALANCE.foodBase ?? 1) : 1); // foodBase: 釣り合う需給比（地図ごとの生産規模の違いを吸収）
    }
  } catch { /* 地図の形が足りない: 食料は釣り合っているとみなす */ }
  return out;
}

/** 戦争の負担（0〜1）。いま関わっている戦争の数と種類から */
function warStrainOf(map, stateId) {
  let n = 0;
  for (const w of map.ext?.data?.wars ?? []) {
    if (!w || w.endedAt || w.ended || w.status === "ended") continue;
    const inv = [...(w.attackers ?? []), ...(w.defenders ?? [])];
    if (inv.includes(stateId)) n += w.civil ? 1.5 : 1;
  }
  return clamp(n * 0.35, 0, 1);
}

/** 国1つの指標。base は 食料の需給（月に1回だけ求める） */
function indicatorOf(map, s, date, foodRatio) {
  const lv = getTechDoctrine(s), st = stressOf(map, s.i, date);
  const pop = (s.rural ?? 0) + (s.urban ?? 0);
  const urbanShare = pop > 0 ? (s.urban ?? 0) / pop : 0.2;
  // 農業・交通が進むほど、同じ土地・同じ備蓄でしのげる（食料の不足がやわらぐ）
  let food = foodRatio * (1 + 0.07 * (lv.agri - 3)) * (1 - 0.5 * clamp(st.food, 0, 1));
  if (food < 1) food += 0.03 * (lv.transport - 1);
  food = clamp(food, 0, 2.5);
  const expected = expectedIndustry(s);
  const industryRatio = expected > 0 && typeof s.industry === "number" ? clamp(s.industry / expected, 0, 2) : 1;
  const support = typeof s.support === "number" ? s.support : 70;
  const war = warStrainOf(map, s.i);
  const fiscalSlack = clamp(1 - 0.4 * clamp(st.fiscal, 0, 1) - 0.3 * war, 0.1, 1.2);
  return { stateId: s.i, lv, food, foodRaw: foodRatio, urbanShare, industryRatio, support, war, fiscalSlack, stress: st, pop };
}

/**
 * 全国の指標（月に1回ぶんだけ求めて覚えておく。余波や国の数が変わったら求め直す）
 * @returns {Map<number, object>}
 */
export function getIndicators(map, date = map.worldTime ?? { year: 1, month: 1 }) {
  const sig = `${mkOf(date)}:${listShocks(map).length}:${map.pack.states.length}:${(map.ext?.data?.wars ?? []).length}`;
  const hit = cache.get(map); if (hit && hit.sig === sig) return hit.out;
  const fb = foodBalance(map), out = new Map();
  for (const s of map.pack.states) if (isLive(s)) out.set(s.i, indicatorOf(map, s, date, fb.get(s.i) ?? 1));
  cache.set(map, { sig, out });
  return out;
}
export const indicatorsOf = (map, stateId, date) => getIndicators(map, date).get(stateId) ?? null;

// ---------- 出来事の確率と影響 ----------
/** 思潮（0〜1）。ideas.js が無い・未初期化のときは中立 */
const idea = (ideas, k) => (ideas?.[k] ?? 0.2);

/**
 * 出来事 key の「起きやすさの倍率 w」と「影響の倍率 impact」。
 *   w: 基本の重みにかける。impact: 民意・国庫の増減（悪い出来事なら被害）にかける。
 */
export function eventFactors(key, ind, ideas = null) {
  if (!ind) return { w: 1, impact: 1 };
  const st = ind.stress, lv = ind.lv, urb = ind.urbanShare;
  let w = 1, impact = 1;
  switch (key) {
    case "famine": w = ind.food < 1 ? 1 + (1 - ind.food) * 4 : Math.max(0.3, 1 - (ind.food - 1) * 0.6); impact = 1 + Math.max(0, 1 - ind.food) - 0.05 * (lv.transport - 1); break;
    case "drought": w = 1 + clamp(st.food, 0, 1); impact = 1 + Math.max(0, 1 - ind.food) * 0.8; break;
    case "harvest": w = ind.food > 1 ? 1 + (ind.food - 1) : Math.max(0.5, ind.food); break;
    case "flood": impact = 1 - 0.04 * (lv.agri - 1); break;
    case "epidemic": case "plague": w = 1 + clamp(st.health, 0, 1.5) * 1.5 + urb * 1.2; impact = Math.max(0.4, 1 - 0.07 * (lv.medicine - 1)) * (1 + clamp(st.food, 0, 1) * 0.5); break;
    case "pricespike": w = 1 + clamp(st.food, 0, 1.5) * 2 + clamp(st.fiscal, 0, 1) * 0.8; break;
    case "riot": w = 1 + clamp(st.order, 0, 1.5) * 2 + clamp(st.food, 0, 1.5) * 1.5; impact = 1 + idea(ideas, "equal"); break;
    case "taxrevolt": w = 1 + clamp(st.fiscal, 0, 1.5) + clamp(st.order, 0, 1.5) + ind.war * 0.8; break;
    case "strike": w = (1 + urb * 1.5) * (1 + idea(ideas, "equal") * 2) * (1 + clamp(st.fiscal, 0, 1)); break;
    case "coup": w = 1 + clamp(st.order, 0, 1.5) * 2 + ind.war + (ind.support < 40 ? 1 : 0); break;
    case "refugees": w = 1 + ind.war * 2 + clamp(st.food, 0, 1.5) * 1.5; break;
    case "border": w = 1 + idea(ideas, "nation") * 2.5; break;
    case "election": case "turnover": w = 1 + idea(ideas, "liberal") * 1.5; break;
    case "revival": w = 1 + idea(ideas, "faith") * 2.5; break;
    case "tradeboom": w = clamp(ind.fiscalSlack, 0.3, 1.5) * (1 + urb); break;
    default: break;
  }
  return { w: clamp(w, 0.1, 8), impact: clamp(impact, 0.3, 3) };
}

/** 余波が強いと、何かが起きる確率そのものが上がる（荒れた国ほど、事が起きる） */
export const restlessness = (ind) => (ind ? 1 + 0.5 * clamp(Math.max(ind.stress.food, 0) + Math.max(ind.stress.order, 0) + Math.max(ind.stress.health, 0), 0, 2) + 0.4 * ind.war : 1);

/**
 * 後続の出来事が、余波だけで起きる重み（連鎖の表を待たずに起きる）。0 なら起きない。
 * 例: 食料の余波が強い国では、飢饉の予約が無くても物価の高騰が起きうる
 */
export function drivenWeight(key, ind) {
  if (!ind) return 0;
  const st = ind.stress;
  switch (key) {
    case "pricespike": return st.food > 0.35 ? 3 * st.food : 0;
    case "riot": return st.order + st.food > 0.8 ? 2.5 * (st.order + st.food - 0.7) : 0;
    case "refugees": return ind.war > 0.3 && st.order > 0.2 ? 2 * ind.war : 0;
    case "recovery": return st.food < -0.15 && st.health < 0.1 ? 1 : 0;
    default: return 0;
  }
}

/** この出来事にもっとも効いた余波の「元の出来事」のキー（無ければ null）。年表の cause に使う */
export function dominantCause(map, key, stateId, date) {
  const rel = { famine: ["food"], pricespike: ["food", "fiscal"], riot: ["order", "food"], coup: ["order"], taxrevolt: ["fiscal", "order"], epidemic: ["health"], plague: ["health"], refugees: ["order", "food"], strike: ["fiscal"], recovery: ["food", "health", "order"] }[key];
  if (!rel) return null;
  const best = activeShocks(map, stateId, date).filter((sh) => sh.from && rel.includes(sh.k) && sh.now > 0).sort((a, b) => b.now - a.now)[0];
  return best?.from ?? null;
}
