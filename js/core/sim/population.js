// 人口の独立システム（v2.7.0）。人口・移住・都市化を、経済から切り離して月ごとに動かす。
//   ・自然増加は、これまでどおり年次（economy.js のロジスティック成長）。ただし食料・疫病・戦争で増え方が変わる（growthMods）
//   ・月次: 飢え・疫病による超過死亡 / 農村→都市の都市化（産業・交通・食料の余裕で速まり、飢えや戦争で逆流する）/ 国どうしの移住（難民・移民）
//   ・国をまたぐ移住は、国の人口の合計を動かす（セルの人口は変えない。経済更新と同じく、集計のずれは織り込み済み）
//   ・保存先: ext.data.migrationAcc = { "元>先": 千人 }（まとまった移住を年表に載せるための積算）
// 純粋ロジック層：DOM に依存しない。乱数は注入する。
import { makeCommand, setProps } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { withEvent } from "../edit/history-log.js";
import { carryingCapacity } from "./economy.js";
import { getIndicators, dominantCause } from "./pressure.js";
import { neighborsOfStates } from "./tech-momentum.js";
import { BALANCE } from "./balance.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;
const nm = (s) => s?.fullName ?? s?.name ?? "?";

/** 人口の自然増加の倍率（年次）。食料が足りない・疫病・戦争で鈍る。釣り合っていれば 1 */
export function growthMods(ind) {
  if (!ind) return { growthMult: 1 };
  const strength = BALANCE.causalStrength ?? 1;
  const f = clamp(0.3 + 0.7 * ind.food, 0.2, 1.25), h = 1 - 0.4 * clamp(ind.stress.health, 0, 1.5), w = 1 - 0.3 * ind.war;
  const mult = clamp(f * h * w, 0.1, 1.3);
  return { growthMult: 1 + (mult - 1) * strength };
}

/** 技術で決まる都市化率の上限（産業と交通が進むほど高い） */
export function maxUrbanShare(lv) {
  return clamp(0.1 + 0.045 * ((lv?.ind ?? 3) - 1) + 0.035 * ((lv?.transport ?? 3) - 1), 0.12, 0.85);
}

/** 人が移り住みたくなる度合い（0〜1くらい）。民意・食料・平和・治安 */
export function attraction(ind) {
  if (!ind) return 0.5;
  return 0.45 * clamp(ind.support, 0, 100) / 100 + 0.35 * clamp(ind.food, 0, 1.5) / 1.5 + 0.2 * (1 - ind.war) - 0.25 * clamp(ind.stress.order, 0, 1);
}

export const migrationAcc = (map) => map?.ext?.data?.migrationAcc ?? {};
const writeAcc = (m, t) => { const x = ensureExt(m); if (Object.keys(t).length) x.data.migrationAcc = t; else delete x.data.migrationAcc; };
const warPairs = (map) => {
  const set = new Set();
  for (const w of map.ext?.data?.wars ?? []) { if (!w || w.endedAt) continue; for (const a of w.attackers ?? []) for (const d of w.defenders ?? []) { set.add(`${a}>${d}`); set.add(`${d}>${a}`); } }
  return set;
};

/**
 * 1か月ぶんの人口の動きを作る。変化が無ければ null。
 * @returns {{command:object, moves:{from:number,to:number,amount:number,cause:string|null}[]}|null}
 */
export function planPopulationMonth(map, date) {
  const inds = getIndicators(map, date), live = map.pack.states.filter(isLive);
  if (!live.length) return null;
  const nb = neighborsOfStates(map), wars = warPairs(map);
  const delta = new Map(live.map((s) => [s.i, { r: 0, u: 0 }]));
  const migr = BALANCE.migrationRate ?? 1, urbz = BALANCE.urbanizeRate ?? 1, strength = BALANCE.causalStrength ?? 1;
  const accBefore = migrationAcc(map), acc = { ...accBefore }, moves = [];

  for (const s of live) {
    const ind = inds.get(s.i), d = delta.get(s.i), rural = s.rural ?? 0, urban = s.urban ?? 0, pop = rural + urban;
    if (!(pop > 0) || !ind) continue;
    // (1) 飢えと疫病による超過死亡（通常の増減は年次の自然増加が担う）
    let m = Math.max(0, 0.9 - ind.food) * 0.0025 + Math.max(0, ind.stress.health) * 0.0012;
    m = clamp(m, 0, 0.008) * Math.max(0.4, 1 - 0.05 * (ind.lv.medicine - 1)) * strength;
    d.r -= rural * m; d.u -= urban * m * 1.2;
    // (2) 都市化。産業・交通が進み、食料に余裕があるほど速い。飢えや戦争では都市から農村へ逆流する
    const share = urban / pop, maxU = maxUrbanShare(ind.lv);
    const pull = (0.5 + 0.1 * ind.lv.ind + 0.05 * ind.lv.transport) * clamp(ind.food - 0.4, 0, 1);
    let moved = share < maxU ? rural * 0.0008 * pull * clamp((maxU - share) / maxU, 0, 1) * urbz : share > maxU + 0.02 ? -urban * 0.002 : 0;
    if (ind.food < 0.8) moved -= urban * (0.8 - ind.food) * 0.003;
    moved -= urban * ind.war * 0.0008;
    d.r -= moved; d.u += moved;
    // (3) 国どうしの移住。より暮らしやすい隣国へ。飢え・戦争・治安の悪化が押し出す。交戦中の相手へは行かない
    if (migr <= 0) continue;
    const here = attraction(ind), push = clamp(ind.war + Math.max(0, 1 - ind.food) + clamp(ind.stress.order, 0, 1), 0, 2);
    const cands = [...(nb.get(s.i) ?? [])].filter((o) => inds.has(o) && !wars.has(`${s.i}>${o}`));
    for (const o of cands) {
      const diff = attraction(inds.get(o)) - here; if (diff <= 0.05) continue;
      const to = map.pack.states[o], toPop = (to.rural ?? 0) + (to.urban ?? 0);
      if (toPop >= carryingCapacity(to) * 0.98) continue;
      const flow = Math.min(pop * 0.003, pop * 0.0005 * migr * diff * (1 + 3 * push) / Math.max(1, cands.length * 0.5));
      if (!(flow > 0.005)) continue;
      d.r -= flow * (rural / pop); d.u -= flow * (urban / pop);
      const dt = delta.get(o); dt.u += flow * 0.6; dt.r += flow * 0.4;
      const key = `${s.i}>${o}`; acc[key] = r2((acc[key] ?? 0) + flow);
      if (acc[key] >= Math.max(5, pop * 0.02)) { moves.push({ from: s.i, to: o, amount: Math.round(acc[key]), cause: dominantCause(map, "refugees", s.i, date) }); delete acc[key]; }
    }
  }

  const parts = [];
  for (const s of live) {
    const d = delta.get(s.i); if (Math.abs(d.r) + Math.abs(d.u) < 0.01) continue;
    parts.push(setProps(s, { rural: Math.max(0, r2((s.rural ?? 0) + d.r)), urban: Math.max(0, r2((s.urban ?? 0) + d.u)) }));
  }
  if (!parts.length && JSON.stringify(acc) === JSON.stringify(accBefore)) return null;
  parts.push({ apply: (m) => writeAcc(m, acc), revert: (m) => writeAcc(m, accBefore) });
  return { command: makeCommand("人口の変動（月）", [], parts), moves };
}

/** まとまった移住を年表に残す（人口は動かさない。記録だけ） */
export function planMigrationEvent(map, { from, to, amount, cause = null }, date) {
  const a = map.pack.states[from], b = map.pack.states[to]; if (!isLive(a) || !isLive(b)) return null;
  const cmd = makeCommand("移住の記録", [], []);
  return withEvent(map, cmd, { type: "migration", title: `${nm(a)}から${nm(b)}へ、多くの人々が移り住んだ`, detail: `約${amount.toLocaleString("ja-JP")}千人`, date, states: [from, to], data: { amount }, ...(cause ? { cause } : {}) });
}
