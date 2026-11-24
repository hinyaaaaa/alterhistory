// v7.0.0 W6: 負荷。多数の戦争を同時に抱えた世界の月次の費用を測る（戦争なしの世界との比較）。決定的。
//   使い方: node tests/balance/war-load.mjs [--wars=300] [--months=36]
import { createNewWorld, serializeWorld, deserializeWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { declareWar, atWarWith } from "../../js/core/civ/diplomacy.js";
const arg = (k, d) => { const m = process.argv.find((x) => x.startsWith(`--${k}=`)); return m ? Number(m.slice(k.length + 3)) : d; };
const WARS = arg("wars", 300), MONTHS = arg("months", 36);
const { w: w0 } = createNewWorld({ worldSeed: "war-load", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } });
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 300 });
const BASE = serializeWorld(w0);
const run = (n) => { const w = deserializeWorld(BASE), ctx = w.sim.ctx, S = Object.values(w.civ.states).filter((s) => s.alive); let made = 0;
  for (let r = 0; made < n && r < n * 4; r++) { const a = S[r % S.length], d = S[(r * 7 + 3) % S.length]; if (a === d) continue; declareWar(ctx, a, d, { reason: "conquest" }); made++; }
  const t0 = process.hrtime.bigint(); let ok = true; for (let m = 0; m < MONTHS; m++) { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }); if (!r.ok) { ok = false; break; } }
  return { made, active: w.civ.activeWarIds.length, ms: Number(process.hrtime.bigint() - t0) / 1e6, ok }; };
const none = run(0), many = run(WARS);
console.log(JSON.stringify({ wars: many.made, activeAfter: many.active, ok: many.ok, msPerMonthNoWars: +(none.ms / MONTHS).toFixed(1), msPerMonthWithWars: +(many.ms / MONTHS).toFixed(1), extraMsPerWarMonth: +((many.ms - none.ms) / MONTHS / Math.max(1, many.made)).toFixed(3) }));
