// v7.0.0 W0: 文明層（civ.wars）の戦争の統計。勝敗の偏り（攻撃側／防衛側）・終わり方・長さ・実力との相関を出す。
//   使い方: node tests/balance/war-civ-stats.mjs [--seeds=3] [--months=1200] [--cells=4000]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { totalPower } from "../../js/core/wcde/power.js";
const arg = (k, d) => { const m = process.argv.find((x) => x.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const SEEDS = Number(arg("seeds", 3)), MONTHS = Number(arg("months", 1200)), CELLS = Number(arg("cells", 4000));
const bucket = { weaker: { n: 0, aggWin: 0, defWin: 0 }, even: { n: 0, aggWin: 0, defWin: 0 }, stronger: { n: 0, aggWin: 0, defWin: 0 } };
const tot = { n: 0, outcome: {}, aggWin: 0, defWin: 0, strongWon: 0, weakWon: 0, decided: 0, len: [], capCapt: 0 };
const t0 = Date.now();
for (let s = 0; s < SEEDS; s++) {
  const { w } = createNewWorld({ worldSeed: `war-stats-${s}`, spec: { resolution: { targetCells: CELLS } }, magic: { enabled: false } });
  dispatch(w, { type: "founding.delegate", authority: A.ADMIN });
  const seen = new Map(); // 開戦時の戦力を控える
  for (let m = 0; m < MONTHS; m += 12) {
    for (const id of w.civ.activeWarIds) if (!seen.has(id)) { const x = w.civ.wars[id], P = (ids) => ids.map((i) => w.civ.states[i]).filter(Boolean).reduce((a, st) => a + totalPower(w.civ, st), 0); seen.set(id, { a: P(x.sides.a), d: P(x.sides.d) }); }
    const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 12 }); if (!r.ok) { console.log("halt", r.error); break; }
  }
  for (const x of Object.values(w.civ.wars)) { if (x.status !== "ended") continue; tot.n++; if (x.peace) tot.peace = (tot.peace ?? 0) + 1; if (Object.values(x.surrender ?? {}).some((r) => r.capitulated)) tot.cap = (tot.cap ?? 0) + 1; tot.outcome[x.outcome] = (tot.outcome[x.outcome] ?? 0) + 1; tot.len.push(x.endedAt - x.startedAt);
    const p = seen.get(x.id); if (x.outcome === "aggressor_victory") tot.aggWin++; if (x.outcome === "defender_victory") tot.defWin++;
    if (p) { const r = (p.a + 1) / (p.d + 1), b = bucket[r < 0.8 ? "weaker" : r > 1.25 ? "stronger" : "even"]; b.n++; if (x.outcome === "aggressor_victory") b.aggWin++; if (x.outcome === "defender_victory") b.defWin++; }
    if (p && (x.outcome === "aggressor_victory" || x.outcome === "defender_victory")) { tot.decided++; const strongA = p.a >= p.d; ((x.outcome === "aggressor_victory") === strongA ? (tot.strongWon++) : (tot.weakWon++)); } }
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log(JSON.stringify({ byAttackerPower: bucket, seeds: SEEDS, months: MONTHS, cells: CELLS, wars: tot.n, outcome: tot.outcome, aggressorWinRate: +(tot.aggWin / Math.max(1, tot.aggWin + tot.defWin)).toFixed(3), strongSideWinRate: +(tot.strongWon / Math.max(1, tot.decided)).toFixed(3), capitulatedWars: tot.cap ?? 0, withPeaceRecord: tot.peace ?? 0, avgMonths: Math.round(avg(tot.len)), secs: Math.round((Date.now() - t0) / 1000) }, null, 1));
