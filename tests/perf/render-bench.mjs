// v5.2 描画・保存の計測（npm test には含めない）。使い方: node --max-old-space-size=3072 tests/perf/render-bench.mjs [cells=250000] [seed=bench52]
// 測定: 世界生成／地図化（worldToMap）／全体描画／パン／ズーム／ヒットテスト／保存／読込。環境（CPU・RAM・Node）も出力に含める。
import { createCanvas } from "@napi-rs/canvas";
import os from "node:os";
import { generateWorld } from "../../js/core/world/worldgen.js";
import { worldToMap } from "../../js/core/world-bridge.js";
import { drawScene } from "../../js/render/scene.js";
import { createViewport } from "../../js/render/viewport.js";
import { cellIndexOf } from "../../js/core/spatial.js";
import { saveMapBytes, loadMapBytes } from "../../js/io/ahmap-file.js";
import { writeFileSync } from "node:fs";

const cells = Number(process.argv[2] ?? 250000), seed = process.argv[3] ?? "bench52";
const heap = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const rss = () => Math.round(process.memoryUsage().rss / 1048576);
const ms = (t) => Math.round(performance.now() - t);
const out = { env: { cpu: os.cpus()[0].model, cores: os.cpus().length, ramMB: Math.round(os.totalmem() / 1048576), node: process.version }, cells, seed, steps: {} };
const step = (name, v) => { out.steps[name] = v; console.log(name.padEnd(22), JSON.stringify(v)); };

let t = performance.now();
const world = generateWorld({ worldSeed: seed, resolution: { targetCells: cells } });
step("generate", { ms: ms(t), cells: world.mesh.cellCount, heapMB: heap() });
t = performance.now(); const map = worldToMap(world, { name: "bench" }); step("worldToMap", { ms: ms(t), heapMB: heap(), mapW: map.meta.width, mapH: map.meta.height });

const SW = 1280, SH = 853, cv = createCanvas(SW, SH), ctx = cv.getContext("2d");
const vp = createViewport(map.meta.width, map.meta.height); vp.resize(SW, SH); vp.fit();
const opts = { terrain: "biome", fills: ["state"], borders: true, coast: true, rivers: true, routes: false, burgs: true, labels: { states: true, burgs: "auto" } };
t = performance.now(); drawScene(ctx, map, vp, opts, 1); step("draw_full_first", { ms: ms(t), heapMB: heap() });
t = performance.now(); drawScene(ctx, map, vp, opts, 1); step("draw_full_cached", { ms: ms(t) });
t = performance.now(); vp.pan(-300, 0); drawScene(ctx, map, vp, opts, 1); step("draw_seam_cross", { ms: ms(t), copies: vp.copyOffsets().length }); vp.fit();
for (const z of [4, 16, 64]) { vp.fit(); vp.zoomAt(SW / 2, SH / 2, z); drawScene(ctx, map, vp, opts, 1); t = performance.now(); drawScene(ctx, map, vp, opts, 1); step(`draw_zoom${z}x`, { ms: ms(t), a: vp.proj.a }); }
vp.fit(); vp.zoomAt(SW / 2, SH / 2, 16);
t = performance.now(); for (let i = 0; i < 5; i++) { vp.pan(37, 21); drawScene(ctx, map, vp, opts, 1); } step("draw_pan_x5_zoom16", { msTotal: ms(t) });
vp.fit();
t = performance.now(); const idx = cellIndexOf(map); step("hit_index_build", { ms: ms(t) });
t = performance.now(); let n = 0; for (let i = 0; i < 2000; i++) { const [wx, wy] = vp.toWorld((i * 97) % SW, (i * 53) % SH); if (wy >= 0 && wy <= map.meta.height && idx.find(wx, wy) >= 0) n++; } step("hit_test_x2000", { ms: ms(t), hits: n });

const bytes = await saveMapBytes(map, { appVersion: "bench" }); step("save", { ms: ms(t), bytesMB: +(bytes.length / 1048576).toFixed(1), heapMB: heap(), rssMB: rss() });
t = performance.now(); const back = await loadMapBytes(bytes); step("load", { ms: ms(t), cells: back.map.world.mesh.cellCount, warnings: back.warnings.length, heapMB: heap(), rssMB: rss() });
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
