// V5-M3: 技術（独立発明・伝播・喪失・再発見・国家の採用）。
// 保有者は「集団」。国家は、集団が知っている技術のうち採用したものだけを使う（採用は AI/命令。actions.js の adopt_tech）。
// 発見・伝播・喪失・再発見は、すべて記録イベント。世界で誰かが発見しても、他者が自動で持つことはない。
import { makeEvent } from "./events.js";
import { dominant } from "./cohorts.js";
import { neighborGroups } from "./spatial.js";
import { BIOMES } from "./world-consts.js";
import { recentEventsFor, asCauses } from "./graph.js";
import { speciesOf } from "./species.js";
import { magicTech } from "./magic.js";

const T = (key, name, field, cost, prereq = [], extra = {}) => ({ key, name, field, cost, prereq, minPop: extra.minPop ?? 0, settled: !!extra.settled, cond: extra.cond ?? null, tier: cost < 600 ? 1 : cost < 1500 ? 2 : cost < 3000 ? 3 : cost < 6000 ? 4 : 5 });
const nearWater = (w, g) => w.cell.coastDist[g.cell] <= 2 || w.cell.river[g.cell];
export const TECHS = Object.freeze([
  T("stone_tools", "石器", "道具", 0), // 最初から持つ
  T("agriculture", "農耕", "農業", 360, ["stone_tools"], { cond: (w, g) => w.cell.fertility[g.cell] > 0.45 && nearWater(w, g) && g.pressure > 0.6 }),
  T("pastoralism", "牧畜", "牧畜", 480, ["stone_tools"], { cond: (w, g) => (w.cell.biome[g.cell] === BIOMES.GRASSLAND || w.cell.biome[g.cell] === BIOMES.SAVANNA) && g.pressure > 0.7 }),
  T("seafaring", "航海", "航海", 480, ["stone_tools"], { minPop: 300, cond: (w, g) => w.cell.coastDist[g.cell] <= 1 }),
  T("pottery", "土器", "道具", 300, ["stone_tools"]), T("weaving", "織物", "道具", 420, ["stone_tools"]), T("herbalism", "薬草", "医療", 600, ["stone_tools"]),
  T("construction", "建築", "道具", 800, ["stone_tools"], { minPop: 300 }), T("irrigation", "灌漑", "農業", 900, ["agriculture", "construction"], { settled: true }),
  T("plow", "犂", "農業", 1500, ["irrigation"], { settled: true }), T("crop_rotation", "輪作", "農業", 2400, ["plow"], { settled: true }),
  T("horse_riding", "騎乗", "牧畜", 1200, ["pastoralism"]), T("bronze", "青銅", "金属", 1200, ["construction", "pottery"], { minPop: 400 }),
  T("iron", "鉄", "金属", 1800, ["bronze"], { minPop: 800 }), T("steel", "鋼", "金属", 3000, ["iron"], { minPop: 2000 }),
  T("record_keeping", "記録", "文字", 900, ["pottery"], { minPop: 800, settled: true }), T("writing", "文字", "文字", 1500, ["record_keeping"], { minPop: 1000, settled: true }),
  T("papermaking", "紙", "文字", 2400, ["writing"], { minPop: 3000 }), T("printing", "印刷", "文字", 3000, ["papermaking"], { minPop: 5000 }),
  T("calendar", "暦", "測量", 1000, ["record_keeping"], { settled: true }), T("mathematics", "数学", "測量", 1800, ["writing"]), T("astronomy", "天文", "測量", 2400, ["calendar", "mathematics"]),
  T("shipbuilding", "造船", "航海", 1500, ["seafaring", "construction"]), T("navigation", "航法", "航海", 2400, ["astronomy", "shipbuilding"]),
  T("administration", "行政", "統治", 1800, ["writing"], { minPop: 1500 }), T("law", "法", "統治", 2400, ["administration"]), T("bureaucracy", "官僚制", "統治", 3600, ["law"], { minPop: 8000 }),
  T("coinage", "貨幣", "経済", 1800, ["bronze", "administration"]), T("banking", "金融", "経済", 3600, ["coinage", "mathematics"], { minPop: 8000 }),
  T("medicine", "医学", "医療", 2400, ["herbalism", "writing"]), T("sanitation", "衛生", "医療", 3600, ["medicine", "construction"], { minPop: 5000 }),
  T("bronze_weapons", "青銅武器", "軍事", 900, ["bronze"]), T("iron_weapons", "鉄武器", "軍事", 1800, ["iron", "bronze_weapons"]), T("fortification", "城壁", "軍事", 1200, ["construction"], { minPop: 500 }),
  T("cavalry", "騎兵", "軍事", 1800, ["horse_riding", "bronze_weapons"]), T("gunpowder", "火薬", "軍事", 4800, ["steel", "mathematics"], { minPop: 8000 }),
  T("industry", "機械工業", "産業", 7200, ["steel", "mathematics", "banking"], { minPop: 20000 }), T("electricity", "電気", "エネルギー", 9600, ["industry"], { minPop: 40000 }),
  T("nuclear", "核", "エネルギー", 18000, ["electricity", "mathematics"], { minPop: 100000 }),
]);
export const TECH = Object.freeze(Object.fromEntries(TECHS.map((t) => [t.key, t])));
const BASE_KNOWLEDGE = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" }; // M1 の knowledge への写し
const REDISCOVER = 0.3;

/** 次に学べる技術（前提がそろい、まだ知らないもの）。知識が変わったときだけ作り直す（毎月 全技術を調べない） */
export const refreshCand = (g) => (g.tech.cand = TECHS.filter((t) => g.tech.known[t.key] == null && t.prereq.every((p) => g.tech.known[p] != null)).map((t) => t.key));
const learn = (g, key, mi) => { g.tech.known[key] = mi; refreshCand(g); delete g.tech.prog[key]; if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 1; };
const forget = (g, key) => { delete g.tech.known[key]; refreshCand(g); g.tech.lost[key] = true; if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 0; };
export const available = (w, g, t) => g.tech.known[t.key] == null && t.prereq.every((p) => g.tech.known[p] != null) && g.pop >= t.minPop && (!t.settled || g.settlementId) && (!t.cond || t.cond(w, g));

/** 月次（tech フェーズ）。進捗は候補すべてに並行して積む。発見は独立でも起こり、世界の記録（techWorld）に積まれる */
export function stepTech(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex;
  for (const id in civ.groups) {
    const g = civ.groups[id], k = g.tech.known, d = dominant(g);
    // 1) 進捗と発見
    const rate = (0.6 + 0.4 * Math.log10(Math.max(10, g.pop)) / 3) * (g.settlementId ? 1.3 : 1) * (g.stateId ? 1.2 : 1) * speciesOf(g.speciesId, civ).techRate * (g.stateId && civ.states[g.stateId] ? (1 + magicTech(civ.states[g.stateId])) * (1 + (civ.states[g.stateId].econ?.techBoost ?? 0)) : 1);
    if (!g.tech.cand) refreshCand(g);
    for (const key of [...g.tech.cand]) {
      const t = TECH[key]; if (g.pop < t.minPop || (t.settled && !g.settlementId) || (t.cond && !t.cond(world, g))) continue;
      const cost = t.cost * (g.tech.lost[t.key] ? REDISCOVER : 1), p = (g.tech.prog[t.key] ?? 0) + rate;
      if (p < cost) { g.tech.prog[t.key] = p; continue; }
      const rediscovered = !!g.tech.lost[t.key], prior = civ.techWorld[t.key]; learn(g, t.key, mi); delete g.tech.lost[t.key];
      const ev = makeEvent(civ, ids, { kind: rediscovered ? "tech_rediscovered" : "tech_discovered", title: `${t.name}を${rediscovered ? "再発見" : prior ? "独自に発見" : "初めて発見"}`, participants: [{ entityId: g.id, role: "discoverer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
      (civ.techWorld[t.key] ??= { discoveries: [] }).discoveries.push({ eventId: ev.eventId, groupId: g.id, month: mi, independent: !!prior });
    }
    // 2) 伝播（近隣から。同じ文化・同じ国家は伝わりやすい）
    if (rng() < 0.03) {
      const ns = [...neighborGroups(ctx, g)]; if (ns.length) {
        const o = civ.groups[ns[Math.floor(rng() * ns.length)]], cand = TECHS.filter((t) => o.tech.known[t.key] != null && k[t.key] == null && t.prereq.every((p) => k[p] != null) && g.pop >= t.minPop && (!t.settled || g.settlementId) && (t.key !== "seafaring" || world.cell.coastDist[g.cell] <= 1));
        if (cand.length) { const t = cand[Math.floor(rng() * cand.length)], same = (dominant(o).cultureId === d.cultureId ? 0.15 : 0) + (o.stateId && o.stateId === g.stateId ? 0.2 : 0);
          if (rng() < 0.25 + same) { learn(g, t.key, mi); const wasLost = !!g.tech.lost[t.key]; delete g.tech.lost[t.key]; makeEvent(civ, ids, { kind: "tech_transferred", title: `${t.name}が伝わった${wasLost ? "（失われていた知識の回復）" : ""}`, participants: [{ entityId: g.id, role: "receiver" }, { entityId: o.id, role: "source" }], location: { cell: g.cell }, causes: asCauses(recentEventsFor(civ, [o.id], ["tech_discovered", "tech_rediscovered", "tech_transferred"], 1e9, 12).filter((e) => e.effects.some((x) => x.property === `tech.${t.key}`)).slice(0, 1), "enabled_by", "strong"), effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] }); } }
      }
    }
    // 3) 喪失（人口が必要規模の半分を割ると、知識が途切れることがある）
    if (rng() < 0.001) for (const t of TECHS) if (k[t.key] != null && t.minPop > 0 && g.pop < t.minPop * 0.5) {
      const dependants = TECHS.some((u) => k[u.key] != null && u.prereq.includes(t.key) && u.tier >= t.tier); if (dependants) continue; // 上位技術の土台は、上位が先に失われる
      forget(g, t.key); makeEvent(civ, ids, { kind: "tech_lost", title: `${t.name}の知識が失われた`, participants: [{ entityId: g.id, role: "holder" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: mi, after: null }] }); break;
    }
  }
}
/** 国家が採用できる技術（所属集団の人口の3割以上が知っていて、まだ採用していないもの） */
export function adoptable(ctx, state, groups) {
  let total = 0; const have = {}; for (const g of groups) { total += g.pop; for (const key in g.tech.known) have[key] = (have[key] ?? 0) + g.pop; }
  return TECHS.filter((t) => t.cost > 0 && state.techAdopted[t.key] == null && (have[t.key] ?? 0) >= total * 0.3).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1));
}
