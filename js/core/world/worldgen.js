// 球面世界の地理生成（v4.0.0）。G0〜G8。純粋ロジック（DOM 非依存）、乱数は WorldSpec の worldSeed から段階別に作る。
//   G1 球面メッシュ → G2 プレート・大陸 → G3 標高・海岸・島 → G4 気候・バイオーム → G5 水系
//   → G6 土壌・肥沃度・資源 → G7 初期人口集団 → G8 統計検証
//   歴史（月次シミュレーション）は走らせない。地理だけを作る。
import { buildSphereMesh, frequencyForCells, cellArea, greatCircleRad, meshHash } from "./sphere-mesh.js";
import { normalizeWorldSpec, GENERATOR_VERSION, ISLAND_MODES } from "./spec.js";
import { makeRng, hashString, fbm3 } from "./noise.js";

export const LAND_WATER = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
export const BIOMES = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
export const BIOME_NAMES = Object.freeze(["海", "氷雪", "ツンドラ", "タイガ", "温帯林", "草原", "熱帯砂漠", "寒冷砂漠", "サバンナ", "熱帯季節林", "熱帯雨林", "高山", "湿地", "湖"]);
export const SOILS = Object.freeze({ NONE: 0, ROCK: 1, SAND: 2, LOAM: 3, CLAY: 4, VOLCANIC: 5, PERMAFROST: 6, ALLUVIAL: 7, PODZOL: 8, BLACK_EARTH: 9 });
export const RES = Object.freeze({ IRON: 1, COPPER: 2, TIN: 4, GOLD: 8, COAL: 16, SALT: 32, TIMBER: 64, FISH: 128, STONE: 256, CLAY: 512, GEMS: 1024 });
export const RES_NAMES = Object.freeze({ 1: "鉄", 2: "銅", 4: "錫", 8: "金", 16: "石炭", 32: "塩", 64: "木材", 128: "漁場", 256: "石材", 512: "粘土", 1024: "宝石" });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

/** 二分ヒープ（優先度つきキュー、Float64 キー）。水系の流向計算で使う */
class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], key = k[--this.n], val = v[this.n]; let i = 0; const n = this.n;
    while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= key) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = key; v[i] = val; return top;
  }
}

class Cancelled extends Error {}
const makeStager = (onProgress, signal, timings) => (name, label, fn) => {
  if (signal?.aborted) throw new Cancelled("キャンセルされました");
  onProgress?.({ stage: name, label, fraction: 0 });
  const t = performance.now(), r = fn(); timings[name] = Math.round(performance.now() - t);
  onProgress?.({ stage: name, label, fraction: 1, ms: timings[name] });
  return r;
};

/**
 * 地理を生成する。戻り値: { spec, mesh, cell, entities, stats, timings, hash }
 * options: { onProgress, signal }
 */
export function generateWorld(specInput, options = {}) {
  const { spec, errors } = normalizeWorldSpec(specInput);
  if (errors.length) throw new Error("WorldSpec が不正: " + errors.join(" / "));
  const timings = {}, stage = makeStager(options.onProgress, options.signal, timings), seed = spec.worldSeed, tAll = performance.now();

  // ---- G1: 球面メッシュ ----
  const n = frequencyForCells(spec.resolution.targetCells);
  const mesh = stage("G1_mesh", "球面メッシュ", () => buildSphereMesh(n));
  const V = mesh.cellCount, X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds, R = spec.planet.radiusKm;
  const lat = new Float32Array(V), lon = new Float32Array(V), areaKm2 = new Float32Array(V);
  stage("G1_derive", "緯度経度・面積", () => {
    for (let c = 0; c < V; c++) { lat[c] = Math.asin(clamp(X[3 * c + 2], -1, 1)); lon[c] = Math.atan2(X[3 * c + 1], X[3 * c]); areaKm2[c] = cellArea(mesh, c) * R * R; }
  });
  const spacingKm = Math.sqrt((4 * Math.PI * R * R) / V), spacingRad = spacingKm / R;
  const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
  const nSeed = (name) => hashString(`${seed}::noise::${name}`);

  // ---- G2: プレートと大陸の概形 ----
  const plate = new Uint8Array(V), mountain = new Float32Array(V), rift = new Float32Array(V), continent = new Float32Array(V);
  const volcanic = new Float32Array(V);
  stage("G2_plates", "プレート・大陸の概形", () => {
    const warpSeed = [nSeed("warpx"), nSeed("warpy"), nSeed("warpz")];
    const wx = new Float32Array(V), wy = new Float32Array(V), wz = new Float32Array(V);
    for (let c = 0; c < V; c++) {
      const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
      const w = (i) => (fbm3(warpSeed[i], x, y, z, 3, 1.5) - 0.5) * 0.32 + (fbm3(warpSeed[i] + 7, x, y, z, 3, 5.5) - 0.5) * 0.3;
      const ax = w(0), ay = w(1), az = w(2);
      const px = x + ax, py = y + ay, pz = z + az, l = Math.hypot(px, py, pz); wx[c] = px / l; wy[c] = py / l; wz[c] = pz / l;
    }
    // プレート: 種の点と、オイラー極（回転軸）。位置 x での速度 = ω × x
    const rp = makeRng(seed, "plates"), P = spec.plateCount, seeds = [], omega = [];
    for (let p = 0; p < P; p++) { seeds.push(rp.unitVec()); const w = rp.unitVec(), sp = rp.range(0.4, 1.6); omega.push([w[0] * sp, w[1] * sp, w[2] * sp]); }
    for (let c = 0; c < V; c++) { let best = -2, bp = 0; for (let p = 0; p < P; p++) { const d = wx[c] * seeds[p][0] + wy[c] * seeds[p][1] + wz[c] * seeds[p][2]; if (d > best) { best = d; bp = p; } } plate[c] = bp; }
    const vel = (p, c) => { const w = omega[p], x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2]; return [w[1] * z - w[2] * y, w[2] * x - w[0] * z, w[0] * y - w[1] * x]; };
    // 境界の収束度（正: 衝突 → 山脈・島弧、負: 発散 → 地溝・海嶺）
    const srcStrength = new Float32Array(V), isSrc = new Uint8Array(V);
    for (let c = 0; c < V; c++) {
      let best = 0, bestAbs = 0; const vc = vel(plate[c], c);
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k]; if (plate[j] === plate[c]) continue;
        const vj = vel(plate[j], c); let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2]; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        const conv = (vc[0] - vj[0]) * dx + (vc[1] - vj[1]) * dy + (vc[2] - vj[2]) * dz;
        if (Math.abs(conv) > bestAbs) { bestAbs = Math.abs(conv); best = conv; }
      }
      if (bestAbs > 0) { isSrc[c] = 1; srcStrength[c] = best; }
    }
    // 境界からの距離（多源 BFS）。山脈の幅は角度で決める（解像度に依存しない）
    const widthCells = Math.max(2, (5 * D2R) / spacingRad), maxD = Math.ceil(widthCells * 3);
    const dist = new Int16Array(V).fill(-1), from = new Int32Array(V).fill(-1), q = new Int32Array(V); let qh = 0, qt = 0;
    for (let c = 0; c < V; c++) if (isSrc[c]) { dist[c] = 0; from[c] = c; q[qt++] = c; }
    while (qh < qt) { const c = q[qh++]; if (dist[c] >= maxD) continue; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (dist[j] < 0) { dist[j] = dist[c] + 1; from[j] = from[c]; q[qt++] = j; } } }
    const nm = nSeed("ridge");
    for (let c = 0; c < V; c++) {
      if (dist[c] < 0) continue;
      const s = srcStrength[from[c]], f = Math.exp(-((dist[c] / widthCells) ** 2));
      const mod = 0.55 + 0.9 * fbm3(nm, X[3 * c] * 3, X[3 * c + 1] * 3, X[3 * c + 2] * 3, 3, 1.4); // 稜線の途切れ・ばらつき
      if (s > 0) { mountain[c] = clamp(s / 1.2, 0, 1.3) * f * mod; volcanic[c] = mountain[c] > 0.7 ? 0.5 : 0; } else rift[c] = clamp(-s / 1.2, 0, 1) * f;
    }
    // 大陸: 互いに離れた種から、ゆがめた距離で広がる場。島の種は小さく、重みがまちまち
    const rc = makeRng(seed, "continents"), K = spec.continentCountTarget;
    const thetaLand = Math.acos(clamp(1 - (2 * spec.landFraction) / K, -1, 1));
    // 大陸の種: ランダムな配置を多数作り、種どうしの最小距離がいちばん大きい配置を選ぶ（固定テンプレートではなく、同じ種なら同じ配置）
    let bestSet = null, bestSep = -1;
    for (let trial = 0; trial < 3000; trial++) {
      const pts = []; for (let i = 0; i < K; i++) pts.push(rc.unitVec());
      let sep = 9; for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) sep = Math.min(sep, Math.acos(clamp(pts[i][0] * pts[j][0] + pts[i][1] * pts[j][1] + pts[i][2] * pts[j][2], -1, 1)));
      if (sep > bestSep) { bestSep = sep; bestSet = pts; }
    }
    const cs = bestSet.map((v) => ({ v, r: thetaLand * rc.range(0.8, 0.95) }));
    const isl = []; const NI = ISLAND_MODES[spec.islandMode];
    for (let i = 0; i < NI; i++) isl.push({ v: rc.unitVec(), r: rc.range(1.2, 5.5) * D2R, w: rc.range(0.45, 0.95) });
    const dotp = (c, v) => wx[c] * v[0] + wy[c] * v[1] + wz[c] * v[2];
    for (let c = 0; c < V; c++) {
      let f = 0;
      for (const o of cs) { const d = Math.acos(clamp(dotp(c, o.v), -1, 1)), t = clamp((1 - d / (o.r * 1.1)) * 2.2, 0, 1); f = Math.max(f, t * t * (3 - 2 * t)); }
      for (const o of isl) { const d = Math.acos(clamp(dotp(c, o.v), -1, 1)); if (d < o.r * 1.5) { const t = clamp(1 - d / (o.r * 1.5), 0, 1); f = Math.max(f, o.w * t * t * (3 - 2 * t)); } }
      continent[c] = f;
    }
    // ホットスポット: 火山島列（海の上でも島になる）
    const rh = makeRng(seed, "hotspots");
    for (let h = 0; h < 6; h++) {
      const start = rh.unitVec(), dirv = rh.unitVec(), count = rh.int(6, 14), step = rh.range(1.2, 2.2) * D2R;
      // start から dirv に沿って（大円上に）火山を並べる
      const dot = start[0] * dirv[0] + start[1] * dirv[1] + start[2] * dirv[2]; let t = [dirv[0] - dot * start[0], dirv[1] - dot * start[1], dirv[2] - dot * start[2]]; const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
      for (let i = 0; i < count; i++) {
        const a = i * step, p = [start[0] * Math.cos(a) + t[0] * Math.sin(a), start[1] * Math.cos(a) + t[1] * Math.sin(a), start[2] * Math.cos(a) + t[2] * Math.sin(a)], rad = rh.range(0.7, 1.6) * D2R * (1 - i / (count * 1.6)), amp = 0.9 * (1 - i / (count * 1.4));
        for (let c = 0; c < V; c++) { const d = Math.acos(clamp(X[3 * c] * p[0] + X[3 * c + 1] * p[1] + X[3 * c + 2] * p[2], -1, 1)); if (d < rad * 2) { const g = Math.exp(-((d / rad) ** 2)); continent[c] = Math.max(continent[c], amp * g * 0.9); volcanic[c] = Math.max(volcanic[c], g); } }
      }
    }
  });

  // ---- G3: 標高・海岸・島 ----
  const elevation = new Float32Array(V); let seaLevelRaw = 0;
  stage("G3_elevation", "標高・海岸・島", () => {
    const s1 = nSeed("hills"), s2 = nSeed("detail"), s3 = nSeed("micro"), raw = new Float32Array(V);
    for (let c = 0; c < V; c++) {
      const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], cf = continent[c];
      const land = smooth((cf - 0.25) / 0.45);
      raw[c] = cf * 0.8 + (fbm3(s1, x, y, z, 5, 2.2) - 0.5) * (0.12 + 0.6 * land) + (fbm3(s2, x, y, z, 4, 9) - 0.5) * (0.06 + 0.16 * land) + (fbm3(s3, x, y, z, 3, 38) - 0.5) * (0.02 + 0.07 * land)
        + mountain[c] * (0.03 + 0.97 * land) * 1.5 - rift[c] * 0.22;
    }
    // 海面の高さ = 陸地率の分位点（陸地率を目標に合わせる）
    const sorted = Float32Array.from(raw).sort(); seaLevelRaw = sorted[Math.min(V - 1, Math.max(0, Math.floor(V * (1 - spec.landFraction))))];
    const hi = sorted[Math.min(V - 1, Math.floor(V * 0.998))], lo = sorted[0];
    for (let c = 0; c < V; c++) {
      const e = raw[c] - seaLevelRaw;
      elevation[c] = e >= 0 ? Math.pow(Math.min(1.35, e / Math.max(1e-6, hi - seaLevelRaw)), 1.2) * 6500 : (e / Math.max(1e-6, seaLevelRaw - lo)) * 5500;
    }
  });
  const isSea = new Uint8Array(V); for (let c = 0; c < V; c++) isSea[c] = elevation[c] <= 0 ? 1 : 0;

  // 海岸からの距離（陸のセルの、海までのセル数）
  const coastDist = new Uint16Array(V);
  stage("G3_coast", "海岸からの距離", () => {
    const q = new Int32Array(V); let qh = 0, qt = 0; const seen = new Uint8Array(V);
    for (let c = 0; c < V; c++) if (isSea[c]) { seen[c] = 1; q[qt++] = c; }
    while (qh < qt) { const c = q[qh++]; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (!seen[j]) { seen[j] = 1; coastDist[j] = Math.min(65535, coastDist[c] + 1); q[qt++] = j; } } }
  });

  // ---- G4: 気候・バイオーム ----
  const temp = new Float32Array(V), precip = new Float32Array(V), biome = new Uint8Array(V);
  stage("G4_climate", "気候", () => {
    const lapse = spec.climateModel.lapseRateCPerKm, Lkm = spec.climateModel.windMoistureLengthKm;
    for (let c = 0; c < V; c++) {
      const a = Math.abs(lat[c]) / (Math.PI / 2), h = Math.max(0, elevation[c]) / 1000;
      temp[c] = 27.5 - 45 * Math.pow(a, 1.6) - lapse * h;
    }
    // 風向き: 貿易風（東から）・偏西風・極東風。風上のセルを、緯度の風から決める
    const up = new Int32Array(V).fill(-1);
    for (let c = 0; c < V; c++) {
      const la = Math.abs(lat[c]) / D2R, east = la < 30 ? -1 : la < 60 ? 1 : -1; // 東向きの風なら +1（西から吹く）
      const ex = -Math.sin(lon[c]), ey = Math.cos(lon[c]); // 東向きの単位ベクトル（xy 平面）
      const wx = -east * ex, wy = -east * ey; // 風上へ向かう向き
      let best = -2, bj = -1;
      for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2]; const dl = Math.hypot(dx, dy, dz) || 1; const s = (dx * wx + dy * wy) / dl; if (s > best) { best = s; bj = j; } }
      up[c] = bj;
    }
    const pn = nSeed("precip"), decay = Math.exp(-spacingKm / Lkm), m = new Float32Array(V).fill(0.5), lift = new Float32Array(V);
    for (let c = 0; c < V; c++) if (isSea[c]) m[c] = 1;
    const passes = Math.min(200, Math.ceil(4000 / spacingKm) + 4);
    for (let it = 0; it < passes; it++) for (let c = 0; c < V; c++) {
      if (isSea[c]) continue;
      const u = up[c], l = Math.max(0, elevation[c] - Math.max(0, elevation[u])) / 1000; // 風上より高い分だけ持ち上がる（km）
      lift[c] = l; m[c] = clamp(m[u] * decay - 0.3 * l, 0.42, 1);
    }
    for (let c = 0; c < V; c++) {
      const la = Math.abs(lat[c]) / D2R, zonal = 250 + 1900 * Math.exp(-((la / 9) ** 2)) + 800 * Math.exp(-(((la - 55) / 12) ** 2));
      let p = zonal * (0.35 + 0.85 * m[c]) * (0.7 + 0.6 * fbm3(pn, X[3 * c], X[3 * c + 1], X[3 * c + 2], 3, 2.5)) + 900 * lift[c] * m[c] * (isSea[c] ? 0 : 1);
      if (!isSea[c] && elevation[c] > 3500) p *= 0.6; // 高所は降水が減る
      precip[c] = clamp(p, 0, 6000);
    }
  });
  stage("G4_biome", "バイオーム", () => { for (let c = 0; c < V; c++) biome[c] = isSea[c] ? BIOMES.OCEAN : biomeOf(temp[c], precip[c], elevation[c]); });

  // ---- G5: 水系（優先度つき洪水法: すべての流路が海か湖へ到達する）----
  const parent = new Int32Array(V).fill(-1), filled = new Float32Array(V), flow = new Float32Array(V), basin = new Int32Array(V).fill(-1), landWater = new Uint8Array(V);
  let lakeCount = 0;
  stage("G5_rivers", "水系", () => {
    const heap = new MinHeap(V + 16), done = new Uint8Array(V), order = new Int32Array(V); let on = 0; const EPS = 0.05;
    for (let c = 0; c < V; c++) filled[c] = elevation[c];
    for (let c = 0; c < V; c++) {
      if (!isSea[c]) continue; done[c] = 1; // 海: 内側は処理しない。陸に接する海だけをキューへ
      for (let k = off[c]; k < off[c + 1]; k++) if (!isSea[nb[k]]) { heap.push(filled[c], c); break; }
    }
    while (heap.n > 0) {
      const c = heap.pop(); order[on++] = c;
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k]; if (done[j]) continue; done[j] = 1; parent[j] = c;
        filled[j] = Math.max(elevation[j], filled[c] + EPS); heap.push(filled[j], j);
      }
    }
    // 流量: 降水 × 面積 × 流出係数（m³/s の目安）を、上流から下流へ足し合わせる
    for (let c = 0; c < V; c++) flow[c] = isSea[c] ? 0 : precip[c] * areaKm2[c] * 9.5e-6;
    for (let i = on - 1; i >= 0; i--) { const c = order[i], p = parent[c]; if (p >= 0 && !isSea[c]) flow[p] += isSea[p] ? 0 : flow[c]; }
    for (let i = 0; i < on; i++) { const c = order[i]; if (isSea[c]) continue; const p = parent[c]; basin[c] = isSea[p] ? c : basin[p]; }
    // 湖: くぼ地を埋めた深さが十分あるセル（かつ海岸ではない）
    for (let c = 0; c < V; c++) { if (isSea[c]) landWater[c] = LAND_WATER.OCEAN; else if (filled[c] - elevation[c] >= 40) { landWater[c] = LAND_WATER.LAKE; lakeCount++; } else landWater[c] = LAND_WATER.LAND; }
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAKE) biome[c] = BIOMES.LAKE;
  });
  // 河川: 流量が上位のセル。閾値は陸のセルの分位点（解像度に依存しない）
  let riverThreshold = 0; const river = new Uint8Array(V);
  stage("G5_riverset", "河川の選定", () => {
    const f = []; for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND) f.push(flow[c]);
    f.sort((a, b) => a - b); riverThreshold = f.length ? f[Math.floor(f.length * 0.93)] : 0;
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && flow[c] >= riverThreshold && flow[c] > 0) river[c] = 1;
  });

  // ---- G6: 土壌・肥沃度・資源・人口の受け皿 ----
  const soil = new Uint8Array(V), fertility = new Float32Array(V), resource = new Uint16Array(V), capacity = new Float32Array(V);
  stage("G6_soil", "土壌・肥沃度・資源", () => {
    const rs = ["iron", "copper", "tin", "gold", "coal", "gems"].map(nSeed), sSalt = nSeed("salt");
    // 起伏（隣との標高差の平均）
    for (let c = 0; c < V; c++) {
      const sea = isSea[c], land = !sea && landWater[c] === LAND_WATER.LAND, b = biome[c], e = elevation[c];
      let relief = 0, kn = 0; for (let k = off[c]; k < off[c + 1]; k++) { relief += Math.abs(elevation[nb[k]] - e); kn++; } relief /= Math.max(1, kn);
      const nearRiver = river[c] === 1;
      let res = 0;
      if (sea) { if (e > -300 && coastDistSea(c) <= 6) res |= RES.FISH; }
      else {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], q = (i, f) => fbm3(rs[i], x, y, z, 3, f);
        if (land) {
          if (q(0, 7) > 0.6 && e > 300) res |= RES.IRON;
          if (q(1, 8) > 0.66 && (e > 500 || volcanic[c] > 0.3)) res |= RES.COPPER;
          if (q(2, 9) > 0.72 && e > 800) res |= RES.TIN;
          if (q(3, 10) > 0.74 && (nearRiver || mountain[c] > 0.4)) res |= RES.GOLD;
          if (q(4, 6) > 0.62 && e < 1500 && (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.WETLAND || b === BIOMES.TROPICAL_SEASONAL)) res |= RES.COAL;
          if (q(5, 11) > 0.78 && mountain[c] > 0.5) res |= RES.GEMS;
          if (e > 200 && relief > 120) res |= RES.STONE;
          if ((b === BIOMES.HOT_DESERT || b === BIOMES.COLD_DESERT) && e < 600 && fbm3(sSalt, x, y, z, 3, 8) > 0.6) res |= RES.SALT;
          if (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.TROPICAL_SEASONAL || b === BIOMES.RAINFOREST) res |= RES.TIMBER;
          if (relief < 80 && (nearRiver || coastDist[c] <= 2) && b !== BIOMES.HOT_DESERT) res |= RES.CLAY;
          if (nearRiver) res |= RES.FISH;
        } else if (landWater[c] === LAND_WATER.LAKE) res |= RES.FISH;
      }
      resource[c] = res;
      // 土壌
      let sl = SOILS.NONE;
      if (!sea) {
        if (landWater[c] === LAND_WATER.LAKE) sl = SOILS.NONE;
        else if (b === BIOMES.ICE || b === BIOMES.TUNDRA) sl = SOILS.PERMAFROST;
        else if (e > 3500 || b === BIOMES.ALPINE) sl = SOILS.ROCK;
        else if (volcanic[c] > 0.3) sl = SOILS.VOLCANIC;
        else if (b === BIOMES.HOT_DESERT) sl = SOILS.SAND;
        else if (nearRiver && relief < 150 && elevation[c] < 800) sl = SOILS.ALLUVIAL;
        else if (b === BIOMES.TAIGA) sl = SOILS.PODZOL;
        else if (b === BIOMES.GRASSLAND) sl = SOILS.BLACK_EARTH;
        else if (b === BIOMES.WETLAND) sl = SOILS.CLAY;
        else sl = SOILS.LOAM;
      }
      soil[c] = sl;
      // 肥沃度 0〜1（気候の適合 × 土壌 × 地形）
      if (!sea && landWater[c] === LAND_WATER.LAND) {
        const t = temp[c], p = precip[c];
        const tf = t < -2 ? 0 : t < 8 ? (t + 2) / 10 * 0.6 : t <= 26 ? 1 : clamp(1 - (t - 26) / 12, 0.2, 1);
        const pf = p < 150 ? p / 150 * 0.15 : p < 600 ? 0.15 + (p - 150) / 450 * 0.85 : p <= 2200 ? 1 : clamp(1 - (p - 2200) / 3500, 0.5, 1);
        const sf = { [SOILS.NONE]: 0, [SOILS.ROCK]: 0.05, [SOILS.SAND]: 0.1, [SOILS.LOAM]: 0.85, [SOILS.CLAY]: 0.55, [SOILS.VOLCANIC]: 1.05, [SOILS.PERMAFROST]: 0.1, [SOILS.ALLUVIAL]: 1.2, [SOILS.PODZOL]: 0.5, [SOILS.BLACK_EARTH]: 1.15 }[sl];
        const slope = 1 - clamp(relief / 700, 0, 0.9), alt = 1 - clamp(Math.max(0, e - 1500) / 3000, 0, 1);
        fertility[c] = clamp(tf * pf * sf * slope * alt, 0, 1);
        // 人口の受け皿（農耕を想定した、1 セルあたりの人数の目安）。海辺・河川・湖畔は有利
        const density = fertility[c] * 12 * (1 + (nearRiver ? 0.5 : 0) + (coastDist[c] <= 1 ? 0.3 : 0)); // 人/km²
        capacity[c] = density * areaKm2[c];
      }
    }
    function coastDistSea(c) { // 海のセルから、最も近い陸までのセル数（6 まで）
      let fr = [c], seen = new Set([c]);
      for (let d = 0; d <= 6; d++) { const nx = []; for (const u of fr) for (let k = off[u]; k < off[u + 1]; k++) { const j = nb[k]; if (!isSea[j]) return d + 1; if (!seen.has(j)) { seen.add(j); nx.push(j); } } fr = nx; if (!fr.length) break; }
      return 99;
    }
  });

  // ---- G7: 初期人口集団の配置 ----
  const populations = stage("G7_groups", "初期人口集団", () => {
    const rg = makeRng(seed, "groups"), cand = [];
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && fertility[c] > 0.35 && temp[c] > 4 && temp[c] < 30) cand.push({ c, s: fertility[c] * (1 + (river[c] ? 0.3 : 0) + (coastDist[c] <= 2 ? 0.2 : 0)) * (0.7 + 0.6 * rg()) });
    cand.sort((a, b) => b.s - a.s || a.c - b.c);
    const out = [], minSep = Math.min(0.25 * Math.PI, (2000 / R)) * 1.0;
    for (const { c } of cand) { if (out.length >= spec.initialGroups) break; if (out.every((o) => ang(o.cell, c) >= minSep)) out.push({ id: out.length + 1, cell: c, lat: lat[c] / D2R, lon: lon[c] / D2R, size: Math.round(rg.range(150, 600)), subsistence: "forage", species: "human" }); }
    return out;
  });

  // ---- G8: 統計と検証 ----
  const stats = stage("G8_stats", "統計", () => computeStats({ V, off, nb, landWater, isSea, elevation, temp, precip, biome, flow, riverThreshold, river, lakeCount, parent, lat, areaKm2, populations, spec }));
  const world = {
    spec: { ...spec, generatorVersion: GENERATOR_VERSION }, mesh,
    cell: { elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo: parent, riverFlow: flow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain },
    entities: { populations }, stats, timings,
  };
  timings.total = Math.round(performance.now() - tAll);
  world.hash = worldHash(world);
  return world;
}

function biomeOf(T, P, e) {
  if (e > 4500 || (e > 3500 && T < 0)) return BIOMES.ALPINE;
  if (T < -8) return BIOMES.ICE;
  if (T < 0) return BIOMES.TUNDRA;
  if (T < 5) return P > 300 ? BIOMES.TAIGA : BIOMES.COLD_DESERT;
  if (T < 18) return P < 200 ? BIOMES.COLD_DESERT : P < 600 ? BIOMES.GRASSLAND : P > 2600 ? BIOMES.WETLAND : BIOMES.TEMPERATE_FOREST;
  if (P < 250) return BIOMES.HOT_DESERT;
  if (P < 900) return BIOMES.SAVANNA;
  if (P < 1800) return BIOMES.TROPICAL_SEASONAL;
  return BIOMES.RAINFOREST;
}

/** 陸塊（海で区切られた連結成分）を数える。大陸級 = 陸の 3% 以上 */
export function landmasses(V, off, nb, isSea) {
  const comp = new Int32Array(V).fill(-1), sizes = []; const q = new Int32Array(V);
  for (let s = 0; s < V; s++) {
    if (isSea[s] || comp[s] >= 0) continue; let qh = 0, qt = 0; q[qt++] = s; comp[s] = sizes.length; let cnt = 0;
    while (qh < qt) { const c = q[qh++]; cnt++; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (!isSea[j] && comp[j] < 0) { comp[j] = comp[s]; q[qt++] = j; } } }
    sizes.push(cnt);
  }
  return { comp, sizes };
}

function computeStats(a) {
  const { V, off, nb, isSea, landWater, elevation, temp, biome, lat, riverThreshold, river, lakeCount, parent, populations } = a;
  let mouthCount = 0; for (let c = 0; c < V; c++) if (river[c] && parent[c] >= 0 && isSea[parent[c]]) mouthCount++;
  let sea = 0, lake = 0, mount = 0, rivers = 0, cold = 0;
  for (let c = 0; c < V; c++) { if (isSea[c]) sea++; else { if (landWater[c] === LAND_WATER.LAKE) lake++; if (elevation[c] > 2500) mount++; if (river[c]) rivers++; } }
  const landCells = V - sea, { sizes } = landmasses(V, off, nb, isSea), total = sizes.reduce((s, x) => s + x, 0);
  const continents = sizes.filter((s) => s >= total * 0.03), islands = sizes.filter((s) => s < total * 0.03);
  const biomeCounts = new Array(14).fill(0); for (let c = 0; c < V; c++) biomeCounts[biome[c]]++;
  // 気温の健全性: 低緯度の平均 > 高緯度の平均
  let tl = 0, nl = 0, th = 0, nh = 0; for (let c = 0; c < V; c++) { if (isSea[c]) continue; const la = Math.abs(lat[c]) / D2R; if (la < 20) { tl += temp[c]; nl++; } else if (la > 60) { th += temp[c]; nh++; } }
  return {
    cells: V, landFraction: landCells / V, lakeFraction: lake / V, mountainFraction: mount / Math.max(1, landCells), riverCells: rivers, riverFlowThreshold: riverThreshold, riverMouths: mouthCount, lakeCells: lakeCount,
    continentCount: continents.length, continentShares: continents.map((s) => +(s / total).toFixed(3)).sort((x, y) => y - x), islandCount: islands.length, largestIslandCells: islands.length ? Math.max(...islands) : 0,
    meanTempLow: nl ? tl / nl : null, meanTempHigh: nh ? th / nh : null, biomeCounts, initialGroups: populations.length,
  };
}

/** 構造・参照の整合を検査する（失敗の一覧。空なら健全） */
export function validateWorld(world) {
  const errs = [], { cell, mesh } = world, V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds;
  for (const k of ["elevation", "temp", "precip", "riverFlow", "fertility", "capacity"]) for (let c = 0; c < V; c++) if (!Number.isFinite(cell[k][c])) { errs.push(`${k}[${c}] が有限でない`); break; }
  // 川の流路: すべての陸のセルが、行き止まりなく海へ到達する
  const state = new Uint8Array(V); // 0 未訪問, 1 訪問中, 2 海へ到達
  const stack = [];
  for (let s = 0; s < V; s++) {
    if (state[s]) continue; let c = s; stack.length = 0;
    while (true) {
      if (cell.landWater[c] === LAND_WATER.OCEAN) { state[c] = 2; break; }
      if (state[c] === 2) break; if (state[c] === 1) { errs.push(`流路に循環: ${c}`); break; }
      state[c] = 1; stack.push(c); const p = cell.riverTo[c];
      if (p < 0) { errs.push(`行き止まりの流路: ${c}`); break; }
      let adj = false; for (let k = off[c]; k < off[c + 1]; k++) if (nb[k] === p) { adj = true; break; }
      if (!adj) { errs.push(`流路が隣接していない: ${c}→${p}`); break; }
      c = p;
    }
    const ok = state[c] === 2; for (const u of stack) state[u] = ok ? 2 : state[u];
    if (errs.length > 20) break;
  }
  for (let c = 0; c < V; c++) { if ((cell.elevation[c] <= 0) !== (cell.landWater[c] === LAND_WATER.OCEAN)) { errs.push(`海陸と標高が不一致: ${c}`); break; } }
  for (const p of world.entities.populations) { if (cell.landWater[p.cell] !== LAND_WATER.LAND) errs.push(`初期集団 ${p.id} が陸にいない`); }
  return errs;
}

/** 決定性の確認用ハッシュ（地理の主要配列） */
export function worldHash(world) {
  let h = 0x811c9dc5; const { cell } = world;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619); };
  for (let i = 0; i < cell.elevation.length; i++) mix(Math.round(cell.elevation[i]) | 0);
  for (let i = 0; i < cell.landWater.length; i++) mix(cell.landWater[i] | (cell.biome[i] << 8) | (cell.soil[i] << 16));
  for (let i = 0; i < cell.riverTo.length; i++) mix(cell.riverTo[i] | 0);
  for (let i = 0; i < cell.resource.length; i++) mix(cell.resource[i]);
  mix(meshHash(world.mesh).length);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * 統計の許容帯に入るまで、シードを変えて再生成する。破棄したシードと理由は必ず返す（隠さない）。
 * 戻り値: { world, rejected: [{seed, reasons}], attempts }
 */
export function generateWorldChecked(specInput, options = {}, maxAttempts = 6) {
  const rejected = []; const base = normalizeWorldSpec(specInput).spec;
  for (let a = 0; a < maxAttempts; a++) {
    const seedUsed = a === 0 ? base.worldSeed : `${base.worldSeed}#r${a}`;
    const world = generateWorld({ ...base, worldSeed: seedUsed }, options), reasons = statsProblems(world.stats, base);
    reasons.push(...validateWorld(world).slice(0, 5));
    if (!reasons.length) return { world, rejected, attempts: a + 1, seedUsed };
    rejected.push({ seed: seedUsed, reasons });
  }
  throw new Error(`許容帯に入る世界を作れなかった（${maxAttempts} 回）: ` + JSON.stringify(rejected));
}

/** 統計の許容帯（M0 で見た目を確認してから固定する。暫定値） */
export function statsProblems(st, spec) {
  const r = [];
  if (Math.abs(st.landFraction - spec.landFraction) > 0.04) r.push(`陸地率 ${st.landFraction.toFixed(3)} が目標 ${spec.landFraction} から外れている`);
  const K = spec.continentCountTarget; if (st.continentCount < Math.max(1, K - 2) || st.continentCount > K + 3) r.push(`大陸級の陸塊が ${st.continentCount} 個（目標 ${K}）`);
  if (spec.islandMode === "many" && st.islandCount < 20) r.push(`島が少ない（${st.islandCount}）`);
  if (st.continentShares[0] > 0.45) r.push(`最大の陸塊が陸の ${(st.continentShares[0] * 100).toFixed(0)}%（偏りすぎ）`);
  if (st.meanTempLow != null && st.meanTempHigh != null && st.meanTempLow <= st.meanTempHigh + 10) r.push("低緯度が高緯度より十分に暖かくない");
  return r;
}
