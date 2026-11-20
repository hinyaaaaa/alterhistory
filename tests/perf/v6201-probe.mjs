// v6.20.1: 歴史の記録を実際に作って集計する。使い方: node --max-old-space-size=4000 tests/perf/v6201-probe.mjs 年数 [seed] [出力JSON] [刻み年=100]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { delegateToWorld } from "../../js/core/wcde/founding.js";
import { writeFileSync } from "node:fs";
import { borderMetrics, cultureMetrics, eventMetrics } from "./v6201-metrics.mjs";
const years = +(process.argv[2] ?? 300), seed = process.argv[3] ?? "alter-8466", out = process.argv[4] ?? null, mark = +(process.argv[5] ?? 100);
const { w } = createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: 3000 } } }); delegateToWorld(w);
const civ = w.civ, num = (id) => parseInt(String(id).split("_")[1], 36), seen = []; let last = -1;
const grab = () => { for (const e of civ.events) { const n = num(e.eventId); if (n > last) { seen.push({ kind: e.kind, title: e.kind === "diplomacy_failed" ? e.title : "", causes: e.causes, why: e.why }); last = n; } } };
const rows = []; let y = 0; const t0 = Date.now();
while (y < years) {
  const step = Math.min(2, years - y); const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: step * 12, commandId: `p-${y}` }); if (!r.ok) { console.log("停止", JSON.stringify(r).slice(0, 200)); break; } y += step; grab();
  if (y % mark === 0 || y === years) {
    const alive = Object.values(civ.states).filter((s) => s.alive), wars = Object.values(civ.wars), signed = Object.values(civ.treaties);
    const row = { detail: borderMetrics(w).detail, year: civ.date.year, sec: Math.round((Date.now() - t0) / 1000), aliveStates: alive.length, activeWars: civ.activeWarIds.length, totalWars: wars.length, totalTreaties: signed.length, ...cultureMetrics(w), border: (({ detail, ...x }) => x)(borderMetrics(w)), events: eventMetrics(seen) };
    rows.push(row); console.log(JSON.stringify({ ...row, events: { ...row.events, top: row.events.top.slice(0, 8) } }));
    if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
  }
}
