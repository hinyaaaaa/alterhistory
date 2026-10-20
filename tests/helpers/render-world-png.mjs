// 生成した世界を、矩形投影の PNG にする（目視確認用）。使い方: node tests/helpers/render-world-png.mjs <seed> <cells> <out.png> [layer=biome|elevation|temp|precip|fertility]
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { generateWorld, BIOMES } from "../../js/core/world/worldgen.js";
import { unprojectViewToSphere } from "../../js/core/world/sphere-mesh.js";
const [seed = "demo", cells = "20000", out = "/tmp/world.png", layer = "biome"] = process.argv.slice(2);
const w = generateWorld({ worldSeed: seed, resolution: { targetCells: Number(cells) } }), m = w.mesh, c = w.cell;
const W = 1200, H = 600, cv = createCanvas(W, H), g = cv.getContext("2d"), img = g.createImageData(W, H);
const BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
let cur = 0; const dot = (cc, x, y, z) => m.centerXYZ[3 * cc] * x + m.centerXYZ[3 * cc + 1] * y + m.centerXYZ[3 * cc + 2] * z;
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  const [x, y, z] = unprojectViewToSphere((px + 0.5) / W, (py + 0.5) / H);
  for (;;) { let best = dot(cur, x, y, z), bj = -1; for (let k = m.neighborOffsets[cur]; k < m.neighborOffsets[cur + 1]; k++) { const d = dot(m.neighborIds[k], x, y, z); if (d > best) { best = d; bj = m.neighborIds[k]; } } if (bj < 0) break; cur = bj; }
  let col; const e = c.elevation[cur];
  if (layer === "elevation") { col = e <= 0 ? [20, 40 + 40 * (1 + e / 5500), 110 + 60 * (1 + e / 5500)] : [60 + 160 * (e / 7000), 120 + 90 * (e / 7000), 60 + 140 * (e / 7000)]; }
  else if (layer === "temp") { const t = (c.temp[cur] + 25) / 60; col = [255 * t, 80, 255 * (1 - t)]; }
  else if (layer === "precip") { const t = Math.min(1, c.precip[cur] / 3000); col = [230 - 200 * t, 230 - 120 * t, 200 + 50 * t]; }
  else if (layer === "fertility") { const t = c.fertility[cur]; col = c.landWater[cur] === 0 ? [20, 50, 110] : [230 - 200 * t, 220 - 40 * t, 120 - 80 * t]; }
  else { col = BC[c.biome[cur]].slice(); if (c.biome[cur] !== 0 && c.biome[cur] !== 13) { const s = 0.75 + 0.25 * Math.min(1, e / 4000); col = col.map((v) => v * s); } else if (c.biome[cur] === 0) { const d = 0.55 + 0.45 * (1 + e / 5500); col = col.map((v) => v * d); } }
  if (c.river[cur] && layer === "biome") col = [40, 90, 220];
  const i = 4 * (py * W + px); img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
}
g.putImageData(img, 0, 0); writeFileSync(out, cv.toBuffer("image/png")); console.log("wrote", out, JSON.stringify({ ms: w.timings.total, cont: w.stats.continentCount, isl: w.stats.islandCount }));
