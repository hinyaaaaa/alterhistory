// v6.1.0 M9: 長期の測定（npm test には含めない）。委任（創造主モード）で始め、100 年ごとに状態・所要・メモリ・資料数・技術の出現年を記録する。
//   使い方: node --max-old-space-size=3500 tests/long/v6-long.mjs <年数> [セル数=3000] [シード=long-1] [出力JSON]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { delegateToWorld } from "../../js/core/wcde/founding.js";
import { checkWcdeIntegrity } from "../../js/core/wcde/integrity.js";
import { packSave, unpackSave } from "../../js/core/wcde/savefile.js";
import { readFileSync, existsSync } from "node:fs";
import { TECH } from "../../js/core/civ/tech.js";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const years = +(process.argv[2] ?? 500), cells = +(process.argv[3] ?? 3000), seed = process.argv[4] ?? "long-1", out = process.argv[5] ?? null;
// 再開: 状態ファイル（STATE=パス）があれば続きから。BUDGET=秒 を超えたら状態を保存して終わる（短い実行を繰り返して長い期間を測るため）
const STATE = process.env.STATE ?? null, BUDGET = +(process.env.BUDGET ?? 1e9), T0 = Date.now();
let w, rows0 = [];
if (STATE && existsSync(STATE)) { const d = JSON.parse(readFileSync(STATE, "utf8")); const u = unpackSave(d.save); if (!u.ok) throw new Error(u.errors.join("\n")); w = u.w; rows0 = d.rows; }
else { w = createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: cells } } }).w; delegateToWorld(w); }
const civ = w.civ, mb = () => Math.round(process.memoryUsage().heapUsed / 1048576), rss = () => Math.round(process.memoryUsage().rss / 1048576), rows = rows0;
const first = () => Object.fromEntries(Object.entries(civ.techWorld).filter(([k, r]) => !TECH[k]?.pre || true).map(([k, r]) => [k, Math.round(r.first / 12)]));
for (let y = Math.floor(civ.date.year / 100) * 100; y < years; y += 100) {
  if ((Date.now() - T0) / 1000 > BUDGET) { writeFileSync(STATE, JSON.stringify({ save: packSave(w).text, rows })); console.log("一時保存: 年", civ.date.year); process.exit(0); }
  const t = Date.now(), r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: Math.min(100, years - y) * 12, commandId: `adv-${y}` });
  if (!r.ok) { console.log("停止", JSON.stringify(r).slice(0, 300)); break; }
  if (global.gc) global.gc();
  const pop = Object.values(civ.groups).reduce((s, g) => s + g.pop, 0), row = { year: civ.date.year, ms: Date.now() - t, states: Object.values(civ.states).filter((s) => s.alive).length, pop: Math.round(pop), events: civ.events.length, archiveTotal: civ.archive?.total ?? null, heapMB: mb(), rssMB: rss(), errors: checkWcdeIntegrity(w.world, civ).length };
  rows.push(row); console.log(JSON.stringify(row));
}
const ps = packSave(w), res = { years, cells, seed, rows, techFirstYear: first(), saveRawMB: +(ps.bytes / 1e6).toFixed(2), saveGzMB: +(gzipSync(ps.text, { level: 1 }).length / 1e6).toFixed(2) };
console.log(JSON.stringify({ techFirstYear: res.techFirstYear, saveRawMB: res.saveRawMB, saveGzMB: res.saveGzMB })); if (out) writeFileSync(out, JSON.stringify(res, null, 1));
