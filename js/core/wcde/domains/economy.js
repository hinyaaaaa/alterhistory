// v6 M3: 経済・産業・交易。国家ごとに 生産（産業力）・食料収支・交易を持ち、財政・技術の進み・安定・関係に実際に効く。
//   産業力は、人口 × 生業 × 技術 × 集落の段階 × 土地の肥沃度 × 投資 で決まる。数値は「有効値」accessor（effective）を通して読む
//   （M6 の創造主介入が後から重ねられる）。WCDE の世界（civ.options.wcde）でのみ動く。v5 の世界の数値は変えない。
import { byState } from "../../civ/spatial.js";
import { neighborStates, atWarWith, treatyBetween } from "../../civ/diplomacy.js";
import { makeEvent } from "../../civ/events.js";
import { effective } from "./effective.js";

const SUBS = { forage: 0.5, fishing: 0.85, pastoral: 0.8, agriculture: 1.0 }, STAGE = { village: 1, town: 1.4, city: 2 };
const TECH_PROD = [["irrigation", 0.12], ["plow", 0.15], ["crop_rotation", 0.15], ["bronze", 0.06], ["iron", 0.08], ["steel", 0.1], ["coinage", 0.08], ["banking", 0.1], ["industry", 0.5], ["electricity", 0.5]];
export const TRADE_K = 8e-5;     // 交易量 = TRADE_K × √(産業力 A × 産業力 B) × 開放度（3か月あたり。財政の増分は税収の2〜3割程度）
export const ECON_PERIOD = 3;

/** 有効値は effective.js（通常値＋介入補正）。経済・軍事・AI はこれを通して読む */
export { effective };
const adopted = (st, k) => st.techAdopted?.[k] != null;

/** 国家の生産・食料。集団ごとに積み上げる */
export function computeProduction(ctx, st, groups) {
  const { world, civ } = ctx, ce = world.cell; let pop = 0, output = 0, foodNum = 0, foodDen = 0;
  const techMult = 1 + TECH_PROD.reduce((s, [k, v]) => s + (adopted(st, k) ? v : 0), 0), invest = 1 + (st.econ?.investment ?? 0);
  for (const g of groups) {
    const stage = g.settlementId ? STAGE[civ.settlements[g.settlementId]?.stage] ?? 1 : 1;
    let fert = 0; const cells = g.cells ?? [g.cell]; for (const c of cells) fert += ce.fertility[c]; fert /= cells.length;
    const out = g.pop * (SUBS[g.subsistence] ?? 0.5) * stage * (0.7 + 0.6 * fert) * techMult * invest;
    pop += g.pop; output += out; foodNum += Math.min(1.3, 1 / Math.max(0.5, g.pressure ?? 1)) * g.pop; foodDen += g.pop;
  }
  return { pop, output, foodBalance: foodDen ? foodNum / foodDen : 1 };
}

/** 交易: 隣接し、戦争・制裁がなければ成立。交易条約で開放度が増え、航海で海辺同士も繋がる。収入は双方に入る */
export function stepEconomy(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % ECON_PERIOD !== 0) return;
  const by = byState(ctx), alive = Object.values(civ.states).filter((s) => s.alive);
  for (const st of alive) {
    const gs = by.get(st.id) ?? [], p = computeProduction(ctx, st, gs), e = (st.econ ??= { investment: 0, routes: {}, trade: {}, tradeIncome: 0, techBoost: 0 });
    e.output = p.output; e.industry = p.output; e.perCapita = p.pop ? p.output / p.pop : 0; e.foodBalance = p.foodBalance; e.investment *= 0.985; // 投資の効果は時間とともに薄れる
  }
  const gain = new Map(alive.map((s) => [s.id, 0])); const done = new Set();
  for (const a of alive) {
    const prevTrade = a.econ.trade; a.econ.trade = {};
    for (const bid of neighborStates(ctx, a)) {
      const b = civ.states[bid], key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id; if (done.has(key)) { a.econ.trade[bid] = b.econ?.trade?.[a.id] ?? 0; continue; } done.add(key);
      const war = atWarWith(civ, a, b), sanc = (a.sanctions[b.id] ?? 0) > mi || (b.sanctions[a.id] ?? 0) > mi;
      const treaty = !!treatyBetween(civ, a, b, "trade");
      const open = war || sanc ? 0 : 1 + (treaty ? 1 : 0) + (adopted(a, "seafaring") && adopted(b, "seafaring") ? 0.3 : 0) + (adopted(a, "coinage") && adopted(b, "coinage") ? 0.4 : 0);
      const v = open ? TRADE_K * Math.sqrt(Math.max(0, effective(civ, a, "industry") * effective(civ, b, "industry"))) * open : 0;
      a.econ.trade[bid] = v; b.econ.trade ??= {}; b.econ.trade[a.id] = v; gain.set(a.id, gain.get(a.id) + v); gain.set(b.id, gain.get(b.id) + v);
      const was = a.econ.routes[bid]; // 経路の開設・途絶（事実として残すのは、依存が大きいもの）
      if (v > 0.05 && !was) { a.econ.routes[bid] = { since: mi }; b.econ.routes[a.id] = { since: mi }; makeEvent(civ, ids, { kind: "trade_route_opened", title: `${a.name}と${b.name}の間で交易が盛んになった`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], effects: [{ targetId: a.id, property: "econ.tradeIncome", before: null, after: Math.round(v * 100) / 100 }], provenance: "simulation" }); }
      else if (v === 0 && was) { delete a.econ.routes[bid]; delete b.econ.routes[a.id]; const dep = Math.max(prevTrade?.[bid] ?? 0, 0); if (dep > 0.05) makeEvent(civ, ids, { kind: "trade_cut", title: `${a.name}と${b.name}の交易が途絶えた（${war ? "戦争" : "制裁"}）`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], provenance: "simulation" }); else { /* 小さな経路の途絶は記録しない */ } }
      if (v > 0) { const d = 0.4; a.relations[b.id] = Math.min(100, (a.relations[b.id] ?? 0) + d); b.relations[a.id] = Math.min(100, (b.relations[a.id] ?? 0) + d); }
    }
  }
  for (const st of alive) {
    const e = st.econ, inc = gain.get(st.id) ?? 0; e.tradeIncome = inc; st.treasury += effective(civ, st, "tradeIncome"); // 財政には有効値（通常値＋介入補正）が入る
    // 経済から技術へ: 交易・記録・行政のある国は、学びが速い（上限 +30%）。食料が足りなければ安定が下がる
    e.techBoost = Math.min(0.3, 0.05 * Math.log1p(effective(civ, st, "tradeIncome") * 4) + (adopted(st, "record_keeping") ? 0.04 : 0) + (adopted(st, "writing") ? 0.06 : 0) + (adopted(st, "administration") ? 0.05 : 0));
    if (e.foodBalance < 0.8) st.stability = Math.max(0, st.stability - (0.8 - e.foodBalance) * 0.05);
  }
}
