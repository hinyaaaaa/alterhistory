// v6.20.0: 履歴の外部保存による、メモリの差（同じ世界を、保存先なし／ありで進めて、GC 後のヒープ・常駐の資料・外部のバイト数を比べる）。
//   使い方: node --expose-gc --max-old-space-size=3500 tests/perf/v620-memory.mjs "100,300" [store|plain] [セル数] [出力JSON]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { HistoryStore, MemoryBackend, attachStore, flushAll, historyStatus } from "../../js/core/civ/history-store.js";
import { archiveStats } from "../../js/core/civ/archive.js";
import { writeFileSync } from "node:fs";
const marks = (process.argv[2] ?? "100,300").split(",").map(Number), mode = process.argv[3] ?? "plain", cells = +(process.argv[4] ?? 3000), out = process.argv[5] ?? null;
const { w } = createNewWorld({ worldSeed: "long-1", spec: { resolution: { targetCells: cells } } }); dispatch(w, { type: "founding.delegate", authority: A.ADMIN });
const civ = w.civ; if (mode === "store") attachStore(civ, new HistoryStore(new MemoryBackend()));
const rows = []; let step = civ.date.year;
for (const y of marks) {
  while (step < y) { const to = Math.min(y, step + 25), r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: (to - civ.date.year) * 12, commandId: `m-${to}` }); if (!r.ok) { console.log("停止", JSON.stringify(r).slice(0, 160)); process.exit(1); } step = to; if (mode === "store") await flushAll(civ); }
  global.gc?.(); await new Promise((r) => setTimeout(r, 20)); global.gc?.();
  const hs = historyStatus(civ), row = { mode, year: civ.date.year, heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), rssMB: Math.round(process.memoryUsage().rss / 1048576), liveEvents: civ.events.length, resident: hs.resident, externalRecords: hs.records, externalKB: Math.round(hs.bytes / 1024), archive: archiveStats(civ).records };
  rows.push(row); console.log(JSON.stringify(row));
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
