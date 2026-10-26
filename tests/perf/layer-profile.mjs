// 層ごとの描画時間（全体表示・サンプル数は引数）。使い方: node tests/perf/layer-profile.mjs [cells=250000]
import { createCanvas } from "@napi-rs/canvas";
import { generateWorld } from "../../js/core/world/worldgen.js";
import { worldToMap } from "../../js/core/world-bridge.js";
import { drawScene } from "../../js/render/scene.js";
import { createViewport } from "../../js/render/viewport.js";
const cells = Number(process.argv[2] ?? 250000), map = worldToMap(generateWorld({ worldSeed: "bench52", resolution: { targetCells: cells } }));
const SW = 1280, SH = 853, cv = createCanvas(SW, SH), ctx = cv.getContext("2d"), vp = createViewport(map.meta.width, map.meta.height); vp.resize(SW, SH); vp.fit();
const base = { terrain: "none", fills: [], borders: false, coast: false, rivers: false, routes: false, burgs: false, labels: false };
const cases = { "背景のみ": {}, "地形（バイオーム）": { terrain: "biome" }, "海岸線": { coast: true }, "河川": { rivers: true }, "集落": { burgs: true }, "ラベル": { labels: { states: true, burgs: "auto" } } };
for (const [name, o] of Object.entries(cases)) { drawScene(ctx, map, vp, { ...base, ...o }, 1); const t = performance.now(); for (let i = 0; i < 3; i++) drawScene(ctx, map, vp, { ...base, ...o }, 1); console.log(name.padEnd(14), Math.round((performance.now() - t) / 3), "ms"); }
