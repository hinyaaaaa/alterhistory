// V5-M12: 長期検証スクリプト（npm test には含めない。時間がかかる）。
//   使い方: node --max-old-space-size=6144 tests/long/long-run.mjs <年数> [セル数=6000] [シード=99] [出力JSON]
//   進行しながら 100 年ごとに、(1) 月次の整合性は tick が毎月検査 (2) 500 年ごとに全件の検査・因果の参照切れ・履歴の構造・メモリ・所要時間・決定性ハッシュ を記録する。
//   最後に: 保存（チャンク）→読み込み往復、任意月の復元の抜き取り、Obsidian 書き出し（件数のみ）、サイズと所要時間。
import { generateWorld } from "../../js/core/world/worldgen.js";
import { createCivState } from "../../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../../js/core/civ/civ-sim.js";
import { encodeCivChunks, decodeCivChunks } from "../../js/core/civ/civ-chunks.js";
import { checkHistory, historyStats, stateAt } from "../../js/core/civ/history.js";
import { checkGraph } from "../../js/core/civ/graph.js";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const years = Number(process.argv[2] ?? 1000), cells = Number(process.argv[3] ?? 6000), seed = Number(process.argv[4] ?? 99), outFile = process.argv[5] ?? null;
const W = generateWorld({ worldSeed: "long-run", resolution: { targetCells: cells } });
const civ = createCivState(W, { startGroupId: 1, historySeed: seed }), sim = createCivSim(W, civ);
const rows = [], t0 = Date.now(), mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const digest = () => { const h = createHash("sha256"); h.update(JSON.stringify([civ.monthIndex, civ.events.length, civ.decisions.length, Object.keys(civ.groups).length, Object.keys(civ.states).length, Object.values(civ.states).map((s) => [s.id, Math.round(s.pop), s.polity, s.alive])])); return h.digest("hex").slice(0, 16); };
console.log(`長期検証: ${years}年・${cells}セル・シード${seed}`);
for (let y = 0; y < years; y += 100) {
  const step = Math.min(100, years - y), t = Date.now(); sim.advanceMonths(step * 12);
  const row = { year: y + step, ms: Date.now() - t, groups: Object.keys(civ.groups).length, states: Object.values(civ.states).filter((s) => s.alive).length, statesTotal: Object.keys(civ.states).length, wars: Object.keys(civ.wars).length, events: civ.events.length, decisions: civ.decisions.length, persons: Object.keys(civ.persons).length, disasters: Object.keys(civ.disasters).length, heapMB: mb(), hash: digest() };
  if ((y + step) % 500 === 0 || y + step === years) { const e1 = checkCivIntegrity(W, civ), e2 = checkGraph(civ), e3 = checkHistory(civ); row.errors = e1.length + e2.length + e3.length; row.errorSample = [...e1, ...e2, ...e3].slice(0, 3); }
  rows.push(row); console.log(JSON.stringify(row)); if (outFile) writeFileSync(outFile, JSON.stringify({ rows, partial: true }, null, 1));
}
const total = (Date.now() - t0) / 1000;
let t = Date.now(); const ch = encodeCivChunks(civ); const encMs = Date.now() - t; let raw = 0, gz = 0; for (const n in ch) { raw += ch[n].length; gz += gzipSync(ch[n], { level: 1 }).length; }
t = Date.now(); const back = decodeCivChunks((n) => ch[n], Object.keys(ch)); const decMs = Date.now() - t;
const same = back.events.length === civ.events.length && back.decisions.length === civ.decisions.length && JSON.stringify(back.states) === JSON.stringify(civ.states);
let restore = 0, restoreBad = 0; const ids = Object.keys(civ.states); for (let i = 0; i < 2000 && ids.length; i++) { const id = ids[(i * 7919) % ids.length], m = Math.floor(((i * 104729) % (civ.monthIndex + 1))), a = stateAt(civ, id, m), b = stateAt(back, id, m); restore++; if (JSON.stringify(a) !== JSON.stringify(b)) restoreBad++; }
const out = { years, cells, seed, totalSeconds: Math.round(total), perYearMs: Math.round((total * 1000) / years), final: rows.at(-1), storage: { rawMB: +(raw / 1e6).toFixed(1), gzipMB: +(gz / 1e6).toFixed(1), encodeMs: encMs, decodeMs: decMs, roundTripSame: same, restoreChecked: restore, restoreMismatch: restoreBad, history: historyStats(civ), chunkCount: Object.keys(ch).length }, rows };
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1)); if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1));
