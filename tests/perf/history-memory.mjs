// v5.2: 履歴の保存形式と読み込み方ごとのメモリ・時間の計測（npm test には含めない）。
//   使い方: node --expose-gc --max-old-space-size=3072 tests/perf/history-memory.mjs [年数=600] [セル数=6000] [出力JSON]
//   測るもの: 生の履歴（実行中の civ）／チャンクの大きさ／全件読み（decodeCivChunks）／遅延読み（openCivChunks + 1 期間 + 履歴ビュー）の、ヒープと時間。
import { generateWorld } from "../../js/core/world/worldgen.js";
import { createCivState } from "../../js/core/civ/civ-state.js";
import { createCivSim } from "../../js/core/civ/civ-sim.js";
import { encodeCivChunks, decodeCivChunks } from "../../js/core/civ/civ-chunks.js";
import { openCivChunks } from "../../js/core/civ/civ-lazy.js";
import { historyStats, stateAt } from "../../js/core/civ/history.js";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import os from "node:os";
const years = Number(process.argv[2] ?? 600), cells = Number(process.argv[3] ?? 6000), out = process.argv[4];
const heap = () => { global.gc(); global.gc(); return Math.round(process.memoryUsage().heapUsed / 104857.6) / 10; };
const W = generateWorld({ worldSeed: "long-run", resolution: { targetCells: cells } });
let civ = createCivState(W, { startGroupId: 1, historySeed: 99 }); const sim = createCivSim(W, civ);
const h0 = heap(); let t = Date.now(); sim.advanceMonths(years * 12); const simMs = Date.now() - t;
const live = heap() - h0;
const stats = historyStats(civ), counts = { events: civ.events.length, decisions: civ.decisions.length, groups: Object.keys(civ.groups).length };
t = Date.now(); const ch = encodeCivChunks(civ); const encMs = Date.now() - t;
const sizes = { events: 0, decisions: 0, history: 0, core: 0 }; let gz = 0;
for (const n in ch) { const k = /\.events\./.test(n) ? "events" : /\.decisions\./.test(n) ? "decisions" : /history/.test(n) ? "history" : "core"; sizes[k] += ch[n].length; gz += gzipSync(ch[n], { level: 1 }).length; }
const mid = Math.floor(civ.monthIndex / 2), ids = Object.keys(civ.states), ref = ids.map((id) => JSON.stringify(stateAt(civ, id, mid)));
civ = null; const base = heap();
t = Date.now(); const eager = decodeCivChunks((n) => ch[n], Object.keys(ch)); const eagerMs = Date.now() - t; const eagerMB = heap() - base;
const eagerOk = ids.every((id, i) => JSON.stringify(stateAt(eager, id, mid)) === ref[i]);
let lazyMB, lazyMs, lazyOk; { const b2 = heap(); t = Date.now(); const lz = openCivChunks((n) => ch[n], Object.keys(ch)); const view = lz.history(); lz.eventsBetween(mid, mid + 11); lz.decisionsBetween(mid, mid + 11); lazyMs = Date.now() - t; lazyMB = heap() - b2 - 0; lazyOk = ids.every((id, i) => JSON.stringify(stateAt({ history: view }, id, mid)) === ref[i]); }
const res = { env: { cpu: os.cpus()[0].model, cores: os.cpus().length, ramMB: Math.round(os.totalmem() / 1048576), node: process.version }, years, cells, simSeconds: Math.round(simMs / 1000), counts, historyPoints: stats.points, liveHeapMB: live, storedMB: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])), gzipMB: +(gz / 1e6).toFixed(2), encodeMs: encMs, eager: { ms: eagerMs, heapMB: eagerMB, restoreOk: eagerOk }, lazy: { ms: lazyMs, heapMB: lazyMB, restoreOk: lazyOk, note: "索引＋履歴ビュー＋1 期間のイベント・判断" } };
console.log(JSON.stringify(res, null, 1)); if (out) writeFileSync(out, JSON.stringify(res, null, 1));
