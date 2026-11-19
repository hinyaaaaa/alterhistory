// v6.20.0 M0: 現行性能の基準測定。clock.run（取り消し点つき）と time.advance の両方を測り、取り消し点の内訳（キー別の複製時間）を出す。
//   使い方: node --max-old-space-size=3500 tests/perf/v620-baseline.mjs "100,300" [セル数=3000] [出力JSON]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { delegateToWorld } from "../../js/core/wcde/founding.js";
import { writeFileSync } from "node:fs";
const marks = (process.argv[2] ?? "100,300").split(",").map(Number), cells = +(process.argv[3] ?? 3000), out = process.argv[4] ?? null;
const { w } = createNewWorld({ worldSeed: "long-1", spec: { resolution: { targetCells: cells } } }); delegateToWorld(w);
const civ = w.civ, mb = () => Math.round(process.memoryUsage().heapUsed / 1048576), rows = [];
const perKey = () => { const o = {}; for (const k of Object.keys(civ)) { if (k === "events" || k === "works") continue; const t = performance.now(); try { structuredClone(civ[k]); } catch { continue; } o[k] = +(performance.now() - t).toFixed(2); } return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6)); };
for (const y of marks) {
  const m = (y - civ.date.year) * 12; if (m > 0) { const t = performance.now(); const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: m, commandId: `adv-${y}` }); if (!r.ok) { console.log("停止", JSON.stringify(r).slice(0, 200)); break; } console.log(`advance → ${y}年 ${Math.round(performance.now() - t)}ms`); }
  if (global.gc) global.gc();
  const t0n = performance.now(); { const naive = {}; for (const k of Object.keys(civ)) if (k !== "events" && k !== "works") naive[k] = structuredClone(civ[k]); } const naiveMs = performance.now() - t0n; // v6.19.0 の取り消し点（全体の複製）
  const t1 = performance.now(); const { takeCheckpoint } = await import("../../js/core/sim/month-transaction.js"); const cp = takeCheckpoint(civ); const ckMs = performance.now() - t1; // v6.20.0（差分型）
  const t2 = performance.now(); const hb = process.memoryUsage().heapUsed; w.sim.advanceMonth(); const monthMs = performance.now() - t2;
  rows.push({ year: civ.date.year, heapMB: mb(), naiveCheckpointMs: +naiveMs.toFixed(1), checkpointMs: +ckMs.toFixed(1), shared: cp.stats.shared, cloned: cp.stats.cloned, oneMonthMs: +monthMs.toFixed(1), events: civ.events.length, archiveRecords: civ.archive?.total ?? 0, figures: Object.keys(civ.figures ?? {}).length, wars: Object.keys(civ.wars ?? {}).length, groups: Object.keys(civ.groups).length, states: Object.values(civ.states).filter((s) => s.alive).length, heavyKeysMs: perKey() });
  console.log(JSON.stringify(rows.at(-1)));
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
