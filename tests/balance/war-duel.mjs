// v7.0.0: 攻撃側有利の偏りの測定。AI は自分より強い相手だけを攻めるので、通常の統計では偏りが見えない。
//   国どうしの戦力（totalPower）を揃えた 1 対 1 の戦争を、攻め手と守り手を入れ替えて繰り返し、攻撃側の勝率を見る。互角なら 50% 前後が正しい。
//   使い方: node tests/balance/war-duel.mjs [--pairs=12] [--ratio=1.0] [--seed=duel]
import { createNewWorld, serializeWorld, deserializeWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { declareWar } from "../../js/core/civ/diplomacy.js";
import { totalPower } from "../../js/core/wcde/power.js";
const arg = (k, d) => { const m = process.argv.find((x) => x.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const PAIRS = Number(arg("pairs", 12)), RATIO = Number(arg("ratio", 1)), SEED = arg("seed", "duel");
const { w: w0 } = createNewWorld({ worldSeed: SEED, spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } });
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 400 });
const BASE = serializeWorld(w0); const states = Object.values(w0.civ.states).filter((s) => s.alive && !s.dependency).map((s) => s.id);
const tally = { n: 0, agg: 0, def: 0, none: 0, months: [], cap: 0 };
let k = 0;
for (let i = 0; i < states.length && k < PAIRS; i++) for (let j = 0; j < states.length && k < PAIRS; j++) {
  if (i === j) continue; const w = deserializeWorld(BASE), civ = w.civ, ctx = w.sim.ctx, a = civ.states[states[i]], d = civ.states[states[j]]; if (!a?.alive || !d?.alive || (a.warIds?.length || d.warIds?.length)) continue;
  // a の戦力を d の RATIO 倍に揃える（army を二分探索）
  const goal = totalPower(civ, d) * RATIO; let lo = 0, hi = Math.max(1, a.army) * 50; for (let t = 0; t < 40; t++) { const mid = (lo + hi) / 2; a.army = mid; if (totalPower(civ, a) < goal) lo = mid; else hi = mid; } a.army = hi;
  const war = declareWar(ctx, a, d, { reason: "conquest" }); k++; let m = 0; for (; m < 240 && war.status === "active"; m++) { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }); if (!r.ok) break; }
  tally.n++; tally.months.push(m); if (Object.values(war.surrender ?? {}).some((r) => r.capitulated)) tally.cap++; if (war.status !== "ended") tally.none++; else if (war.outcome === "aggressor_victory") tally.agg++; else if (war.outcome === "defender_victory") tally.def++; else tally.none++;
}
const avg = tally.months.reduce((x, y) => x + y, 0) / Math.max(1, tally.months.length);
console.log(JSON.stringify({ pairs: tally.n, ratio: RATIO, attackerWins: tally.agg, defenderWins: tally.def, undecided: tally.none, attackerWinRate: +(tally.agg / Math.max(1, tally.agg + tally.def)).toFixed(3), avgMonths: Math.round(avg), capitulatedWars: tally.cap }));
