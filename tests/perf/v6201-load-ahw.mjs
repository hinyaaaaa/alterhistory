// v6.20.1: 保存された世界（.ahw）を読み込んで、国境（面のまとまり）を測る。使い方: node --max-old-space-size=6000 tests/perf/v6201-load-ahw.mjs path.ahw
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { unpackSave } from "../../js/core/wcde/savefile.js";
const buf = readFileSync(process.argv[2]); const text = gunzipSync(buf).toString("utf8");
const t = performance.now(); const r = unpackSave(text, { allowChecksumMismatch: true });
console.log("load", Math.round(performance.now() - t) + "ms", Object.keys(r), r.error ?? "");
const w = r.w ?? r.world ?? r; globalThis.__w = w;
console.log("year", w.civ.date, "cells", w.world.mesh.cellCount ?? "?");
import { borderMetrics, cultureMetrics, eventMetrics } from "./v6201-metrics.mjs";
const alive = Object.values(w.civ.states).filter((s) => s.alive).length; console.log("alive states", alive, "of", Object.keys(w.civ.states).length);
console.log(JSON.stringify(cultureMetrics(w)));
console.log(JSON.stringify(eventMetrics(w.civ.events), null, 1));
console.log(JSON.stringify(borderMetrics(w), null, 1));
