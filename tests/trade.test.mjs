// 経済・交易の検査（合成マップ）。産物・需要・取引・税・年次の税収。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { GOODS, computeProduction, computeDemand, computeTrade, getFinance, annualRevenue, tradePartners, stateAdjacency, TAX_BASE } from "../js/core/sim/trade.js";
import { planSetFinance } from "../js/core/edit/finance.js";
import { planAnnualUpdate } from "../js/core/sim/world.js";
import { planDeclareWar } from "../js/core/edit/wars.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const load = async () => (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const map = await load();
const live = map.pack.states.filter((s) => s && s.i && !s.removed);
const state = { map };           // store.commit が渡す形
const run = (cmd) => cmd.apply(state);
const undo = (cmd) => cmd.revert(state);

console.log("=== 産物と需要 ===");
const prod = computeProduction(map);
check("全ての国に産物がある", live.every((s) => prod.has(s.i)));
check("産物は 0 以上", [...prod.values()].every((p) => GOODS.every((g) => p[g.id] >= 0)));
check("穀物は人口のある国で作られる", live.some((s) => prod.get(s.i).grain > 0));
const total = (id) => [...prod.values()].reduce((a, p) => a + p[id], 0);
check("9種の産物のうち、複数が実際に作られる", GOODS.filter((g) => total(g.id) > 0).length >= 5, GOODS.filter((g) => total(g.id) > 0).map((g) => g.label).join("・"));
const s1 = live[0];
const d1 = computeDemand(s1), pop1 = s1.rural + s1.urban;
check("需要は人口に比例（穀物）", Math.abs(d1.grain - pop1 * 0.55) < 0.02, `${d1.grain} vs ${(pop1 * 0.55).toFixed(2)}`);
const hi = computeDemand({ ...s1, techLevel: 9 }), lo = computeDemand({ ...s1, techLevel: 1 });
check("技術水準が高いほど工芸品の需要が増す", hi.crafts > lo.crafts);
// 農村人口が増えれば、産物も増える（セル人口は変わらなくても）
{
  const m2 = await load(); const st = m2.pack.states[1];
  const before = computeProduction(m2).get(1).grain; st.rural *= 2;
  const after = computeProduction(m2).get(1).grain;
  check("農村人口が2倍なら穀物産量も2倍", Math.abs(after / before - 2) < 0.02, `${before} → ${after}`);
}

console.log("=== 取引 ===");
const trade = computeTrade(map);
check("取引が成立する", trade.deals.length > 0, `${trade.deals.length}件`);
let ok = true;
for (const g of GOODS) {
  const sold = trade.deals.filter((d) => d.good === g.id).reduce((a, d) => a + d.units, 0);
  const exp = [...trade.states.values()].reduce((a, v) => a, 0);
  const byFrom = new Map(); for (const d of trade.deals.filter((x) => x.good === g.id)) byFrom.set(d.from, (byFrom.get(d.from) ?? 0) + d.units);
  for (const [sid, units] of byFrom) if (units > trade.states.get(sid).net[g.id] + 0.05) ok = false; // 余剰以上は売れない
}
check("輸出は余剰を超えない", ok);
check("自国どうしの取引は無い", trade.deals.every((d) => d.from !== d.to));
check("売った量 = 買った量", Math.abs([...trade.states.values()].reduce((a, v) => a + v.exports, 0) - [...trade.states.values()].reduce((a, v) => a + v.imports, 0)) < 0.05);
check("取引額 = 数量 × 単価", trade.deals.every((d) => Math.abs(d.value - d.units * d.price) < 0.05));
check("売上税 = 取引額 × 輸出国の税率", trade.deals.every((d) => Math.abs(d.tax - d.value * getFinance(map.pack.states[d.from]).salesTax) < 0.05));
const adj = stateAdjacency(map);
check("隣接する国の組が求まる（state.neighbors が空でも）", adj.size > 0, `${adj.size}組`);

console.log("=== 戦争・関係・税の影響 ===");
const a = trade.deals[0].from, b = trade.deals[0].to;
const between = (t) => t.deals.filter((d) => (d.from === a && d.to === b) || (d.from === b && d.to === a)).reduce((x, d) => x + d.value, 0);
const before = between(trade);
const warCmd = planDeclareWar(map, { name: "検査戦争", attackers: [a], defenders: [b], date: "1-1" }).command;
run(warCmd);
const atWar = computeTrade(map);
check("戦争中の2国は取引しない", between(atWar) === 0, `${before.toFixed(1)} → ${between(atWar)}`);
undo(warCmd);
check("戦争が終われば戻る", Math.abs(between(computeTrade(map)) - before) < 0.01);
{
  const m3 = await load();
  const sellers = [...new Set(computeTrade(m3).deals.map((d) => d.from))];
  const seller = sellers[0];
  const v0 = computeTrade(m3).states.get(seller).exportValue;
  m3.pack.states[seller].salesTax = 0.9;
  const v1 = computeTrade(m3).states.get(seller).exportValue;
  check("売上税が高いと、その国は輸出しにくくなる", v1 <= v0, `${v0} → ${v1}`);
}

console.log("=== 税率・国庫（編集とUndo） ===");
const st = map.pack.states[1];
const f0 = getFinance(st);
check("未設定でも政体から税率が補われる", f0.salesTax === (TAX_BASE[st.form]?.salesTax ?? 0.15) && f0.pollTax >= 0);
check("既定と同じ値を指定しても変更なし", planSetFinance(map, 1, { salesTax: f0.salesTax }) === null);
const cmd = planSetFinance(map, 1, { salesTax: 0.3, pollTax: 1.5, treasury: -5 });
run(cmd);
const f1 = getFinance(st);
check("税率は 0〜1 に丸める", f1.salesTax === 0.3 && f1.pollTax === 1);
check("国庫は 0 未満にならない", f1.treasury === 0);
undo(cmd);
check("Undo で元に戻る（キーも消える）", !("salesTax" in st) && !("pollTax" in st) && !("treasury" in st));
let threw = false; try { planSetFinance(map, 999, { salesTax: 0.1 }); } catch { threw = true; }
check("存在しない国は例外", threw);
threw = false; try { planSetFinance(map, 1, { treasury: "abc" }); } catch { threw = true; }
check("国庫が数値でなければ例外", threw);

console.log("=== 年次の税収 ===");
const t0 = Object.fromEntries(live.map((s) => [s.i, getFinance(s).treasury]));
const rev = computeTrade(map);
const upd = planAnnualUpdate(map);
check("年次更新に税収が含まれる", upd.label.includes("税収"));
run(upd);
const gained = live.every((s) => getFinance(s).treasury >= t0[s.i]);
check("全ての国で国庫が減らない", gained);
const s2 = live.find((s) => annualRevenue(rev.states.get(s.i)) > 0);
check("税収のある国は国庫が増える", getFinance(s2).treasury > t0[s2.i], `${t0[s2.i]} → ${getFinance(s2).treasury}`);
check("増えた額は 人頭税+輸出の売上税", Math.abs(getFinance(s2).treasury - t0[s2.i] - annualRevenue(rev.states.get(s2.i))) < 0.05);
undo(upd);
check("Undo で国庫も元に戻る", live.every((s) => getFinance(s).treasury === t0[s.i]));
// 税率0なら税収は0
{
  const m4 = await load(); for (const s of m4.pack.states) if (s && s.i) { s.salesTax = 0; s.pollTax = 0; }
  const t = computeTrade(m4); check("税率 0 なら税収 0", [...t.states.values()].every((v) => annualRevenue(v) === 0));
}
const partners = tradePartners(trade, a);
check("貿易相手が取引額の大きい順に出る", partners.length > 0 && partners.every((p, i) => i === 0 || p.exportValue + p.importValue <= partners[i - 1].exportValue + partners[i - 1].importValue));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
