// v4.0.0 地理生成のプレビュー（開発用の単独ページ）。アプリ本体とはまだつながっていない（V4-M3 で本体の描画に組み込む）。
// 目的: 実機（Surface Go 4 など）で「生成時間」「再描画時間」を測り、見た目を確かめる。
import { generateWorld, validateWorld, statsProblems, BIOME_NAMES, RES_NAMES } from "../core/world/worldgen.js";
import { makeWorldSeed } from "../core/world/spec.js";
import { unprojectViewToSphere } from "../core/world/sphere-mesh.js";

const $ = (id) => document.getElementById(id);
const BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
let world = null, pixelCell = null, PW = 0, PH = 0;

function buildPixelMap(w, W, H) {
  const m = w.mesh, X = m.centerXYZ, off = m.neighborOffsets, nb = m.neighborIds, map = new Int32Array(W * H); let cur = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const [x, y, z] = unprojectViewToSphere((px + 0.5) / W, (py + 0.5) / H);
    let best = X[3 * cur] * x + X[3 * cur + 1] * y + X[3 * cur + 2] * z;
    for (;;) { let bj = -1; for (let k = off[cur]; k < off[cur + 1]; k++) { const j = nb[k], d = X[3 * j] * x + X[3 * j + 1] * y + X[3 * j + 2] * z; if (d > best) { best = d; bj = j; } } if (bj < 0) break; cur = bj; }
    map[py * W + px] = cur;
  }
  return map;
}
function colorOf(c, layer, cell) {
  const e = cell.elevation[c];
  if (layer === "elevation") return e <= 0 ? [20, 40 + 40 * (1 + e / 5500), 110 + 60 * (1 + e / 5500)] : [60 + 160 * (e / 7000), 120 + 90 * (e / 7000), 60 + 140 * (e / 7000)];
  if (layer === "temp") { const t = Math.max(0, Math.min(1, (cell.temp[c] + 25) / 60)); return [255 * t, 80, 255 * (1 - t)]; }
  if (layer === "precip") { const t = Math.min(1, cell.precip[c] / 3000); return [230 - 200 * t, 230 - 120 * t, 200 + 50 * t]; }
  if (layer === "fertility") { const t = cell.fertility[c]; return cell.landWater[c] === 0 ? [20, 50, 110] : [230 - 200 * t, 220 - 40 * t, 120 - 80 * t]; }
  let col = BC[cell.biome[c]].slice();
  if (cell.biome[c] === 0) { const d = 0.55 + 0.45 * (1 + e / 5500); col = col.map((v) => v * d); } else if (cell.biome[c] !== 13) { const s = 0.75 + 0.25 * Math.min(1, e / 4000); col = col.map((v) => v * s); }
  if (cell.river[c] && layer === "biome") col = [40, 90, 220];
  return col;
}
function draw() {
  if (!world) return;
  const cv = $("map"), g = cv.getContext("2d"), t0 = performance.now(), layer = $("layer").value, W = cv.width, H = cv.height;
  if (!pixelCell || PW !== W || PH !== H) { pixelCell = buildPixelMap(world, W, H); PW = W; PH = H; }
  const img = g.createImageData(W, H), cell = world.cell;
  for (let i = 0; i < W * H; i++) { const col = colorOf(pixelCell[i], layer, cell); img.data[4 * i] = col[0]; img.data[4 * i + 1] = col[1]; img.data[4 * i + 2] = col[2]; img.data[4 * i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $("redraw").textContent = `${(performance.now() - t0).toFixed(0)} ms（${W}×${H} を全部描き直した時間。本物のレンダラーではない）`;
}
function run() {
  const seed = $("seed").value.trim() || makeWorldSeed(), cells = Number($("cells").value) || 250000;
  $("seed").value = seed; $("status").textContent = "生成中…（この間、画面は止まります）";
  setTimeout(() => {
    try {
      const t0 = performance.now(); world = generateWorld({ worldSeed: seed, resolution: { targetCells: cells } }); const ms = performance.now() - t0;
      pixelCell = null; const errs = validateWorld(world), prob = statsProblems(world.stats, world.spec), st = world.stats;
      $("status").textContent = `完了: ${world.mesh.cellCount.toLocaleString()} セル / 生成 ${ms.toFixed(0)} ms / 検査 ${errs.length ? "NG " + errs.slice(0, 3).join(", ") : "OK"}`;
      $("timings").textContent = Object.entries(world.timings).map(([k, v]) => `${k}: ${v} ms`).join("\n");
      $("stats").textContent = [`端末: ${navigator.userAgent}`, `陸地率 ${(st.landFraction * 100).toFixed(1)}%`, `大陸級 ${st.continentCount}（${st.continentShares.join(", ")}）／島 ${st.islandCount}`, `河川セル ${st.riverCells}／河口 ${st.riverMouths}／湖 ${st.lakeCells}`, `初期集団 ${st.initialGroups}`, `ハッシュ ${world.hash}`, prob.length ? "許容帯の外: " + prob.join(" / ") : "統計は許容帯の内"].join("\n");
      draw();
    } catch (e) { $("status").textContent = "失敗: " + e.message; }
  }, 30);
}
$("gen").addEventListener("click", run); $("layer").addEventListener("change", draw); $("rand").addEventListener("click", () => { $("seed").value = makeWorldSeed(); });
$("map").addEventListener("mousemove", (ev) => {
  if (!world || !pixelCell) return; const r = ev.target.getBoundingClientRect(), px = Math.floor((ev.clientX - r.left) / r.width * PW), py = Math.floor((ev.clientY - r.top) / r.height * PH), c = pixelCell[py * PW + px], cell = world.cell;
  const res = Object.entries(RES_NAMES).filter(([b]) => cell.resource[c] & Number(b)).map(([, n]) => n).join("・") || "なし";
  $("hover").textContent = `セル ${c}｜緯度 ${(cell.lat[c] * 57.2958).toFixed(1)}° 経度 ${(cell.lon[c] * 57.2958).toFixed(1)}°｜標高 ${cell.elevation[c].toFixed(0)} m｜${BIOME_NAMES[cell.biome[c]]}｜${cell.temp[c].toFixed(1)}℃｜降水 ${cell.precip[c].toFixed(0)} mm｜肥沃度 ${cell.fertility[c].toFixed(2)}｜資源 ${res}`;
});
