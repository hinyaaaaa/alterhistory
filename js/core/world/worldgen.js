// 球面世界の地理生成（v4.0.0）。G0〜G8。純粋ロジック（DOM 非依存）、乱数は WorldSpec の worldSeed から段階別に作る。
//   G1 球面メッシュ → G2 プレート・大陸 → G3 標高・海岸・島 → G4 気候・バイオーム → G5 水系
//   → G6 土壌・肥沃度・資源 → G7 初期人口集団 → G8 統計検証
//   歴史（月次シミュレーション）は走らせない。地理だけを作る。
import { buildSphereMesh, frequencyForCells, cellArea, greatCircleRad, meshHash } from "./sphere-mesh.js";
import { normalizeWorldSpec, ISLAND_MODES } from "./spec.js";
import { siteScore, pickSite, planSettlements, planSites } from "./sites.js";
import { activePlugin } from "./plugins.js";
import { makeRng, hashString, fbm3, makeFbm3, gradNoise3, gfbm3, ridged3 } from "./noise.js";
import { planContinents, makeFields, chooseSeam, seamSampleSpecs, rotZ } from "./continents.js";

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

/** バージョン文字列 "6.13.0" の大小比較（a >= b なら true） */
export function versionAtLeast(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0), pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0); }
  return true;
}
/** 隣接セルとの平均に寄せる平滑化（passes 回。w=1 で完全に平均）。f をその場で書き換える */
export function blurField(f, off, nb, passes, w) {
  const V = f.length, t = new Float32Array(V);
  for (let it = 0; it < passes; it++) {
    for (let c = 0; c < V; c++) { let s = 0; const d = off[c + 1] - off[c]; for (let k = off[c]; k < off[c + 1]; k++) s += f[nb[k]]; t[c] = f[c] * (1 - w) + (d ? s / d : f[c]) * w; }
    f.set(t);
  }
}
/**
 * 河川侵食（v6.13.0）。陸のセルの高さだけを下げる。海のセル・海陸の境（陸は 1 m 以上を保つ）は動かさない → 海陸比・大陸の数は変わらない。
 *   1. 優先度つき洪水法で、窪地を埋めた高さと流下先を求める（すべての流路が海へ着く）。
 *   2. 上流の面積 A（km²）を流下先へ足し合わせる。
 *   3. 流下先から上流へ向かって、陰解法の stream power 侵食: r = (f + F·r_下流) / (1 + F)。F = kf·√(A / 10⁵km²)。
 *      流量の大きいセルほど下流との高低差が縮む → 本流の谷が深くなり、尾根と谷の対比が生まれる。陰解法なので F が大きくても安定する。
 *   F は上流面積（物理量）だけで決まり、セルの大きさ（解像度）には依らない。
 * 戻り値: 下げた高さの合計（m）と、最大の下げ幅（m）
 */
export function erodeRivers(mesh, elevation, areaKm2, { iterations = 6, kf = 0.085 } = {}) {
  const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, EPS = 0.05;
  const isSea = new Uint8Array(V); for (let c = 0; c < V; c++) isSea[c] = elevation[c] <= 0 ? 1 : 0;
  const heap = new MinHeap(V + 16), done = new Uint8Array(V), order = new Int32Array(V), parent = new Int32Array(V), f = new Float32Array(V), r = new Float32Array(V), A = new Float32Array(V);
  let total = 0, maxDrop = 0;
  for (let it = 0; it < iterations; it++) {
    done.fill(0); parent.fill(-1); heap.n = 0; let on = 0;
    for (let c = 0; c < V; c++) { f[c] = elevation[c]; if (isSea[c]) { done[c] = 1; for (let k = off[c]; k < off[c + 1]; k++) if (!isSea[nb[k]]) { heap.push(f[c], c); break; } } }
    while (heap.n > 0) {
      const c = heap.pop(); order[on++] = c;
      for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (done[j]) continue; done[j] = 1; parent[j] = c; f[j] = Math.max(elevation[j], f[c] + EPS); heap.push(f[j], j); }
    }
    for (let c = 0; c < V; c++) A[c] = isSea[c] ? 0 : areaKm2[c];
    for (let i = on - 1; i >= 0; i--) { const c = order[i], p = parent[c]; if (p >= 0 && !isSea[c] && !isSea[p]) A[p] += A[c]; }
    for (let i = 0; i < on; i++) {
      const c = order[i]; if (isSea[c]) continue;
      const p = parent[c], rp = p < 0 || isSea[p] ? 0 : r[p], F = Math.min(0.9, kf * Math.sqrt(A[c] / 1e5));
      r[c] = (f[c] + F * rp) / (1 + F);
    }
    for (let c = 0; c < V; c++) {
      if (isSea[c]) continue;
      const e = Math.max(1, Math.min(elevation[c], r[c])), d = elevation[c] - e;
      if (d > 0) { elevation[c] = e; total += d; if (d > maxDrop) maxDrop = d; }
    }
  }
  return { total, maxDrop };
}

/** 地球の陸の高度分布（ハイプソメトリック曲線）: [陸のセルの低い方からの割合, 標高 m]。中央値 約 370 m・平均 約 800 m・上位 2% が 4,000 m 超 */
const HYPSO = [[0, 6], [0.1, 40], [0.2, 90], [0.3, 160], [0.4, 250], [0.5, 370], [0.6, 520], [0.7, 740], [0.8, 1100], [0.88, 1700], [0.94, 2600], [0.98, 4000], [0.995, 5400], [1, 6800]];
export function hypsoAt(q) {
  if (q <= 0) return HYPSO[0][1]; if (q >= 1) return HYPSO[HYPSO.length - 1][1];
  let k = 1; while (HYPSO[k][0] < q) k++;
  const [q0, e0] = HYPSO[k - 1], [q1, e1] = HYPSO[k]; return e0 + (e1 - e0) * ((q - q0) / (q1 - q0));
}

let coarseCache = null; const coarseMesh = () => (coarseCache ??= buildSphereMesh(frequencyForCells(2400))); // 大陸の計画の試し作り用（粗いメッシュ）
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
  const D2 = versionAtLeast(spec.generatorVersion, "6.13.0"); // v6.13.0 の地形の細部（尾根ノイズ・内陸への傾斜・河川侵食・山脈の平滑化）。それ以前の generatorVersion の世界は、従来と同じ結果で再現する

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
  let seamInfo = { psi: 0, cost: 0 }; const X3 = (c) => X[3 * c], Y3 = (c) => X[3 * c + 1];
  const modeLevel = spec.islandMode === "many" ? 2 : spec.islandMode === "normal" ? 1 : 0; // 火山島列・島弧の多さ
  stage("G2_plates", "プレート・大陸の概形", () => {
    const warpSeed = [nSeed("warpx"), nSeed("warpy"), nSeed("warpz")];
    const wx = new Float32Array(V), wy = new Float32Array(V), wz = new Float32Array(V);
    const wlo = warpSeed.map((sd) => makeFbm3(sd, 3, 1.5)), whi = warpSeed.map((sd) => makeFbm3(sd + 7, 3, 5.5));
    const warpPt = (x, y, z) => { // 位置の歪め（海岸線を円形から外す）。全セルと、継ぎ目の標本点で同じ式を使う
      const ax = (wlo[0](x, y, z) - 0.5) * 0.32 + (whi[0](x, y, z) - 0.5) * 0.3, ay = (wlo[1](x, y, z) - 0.5) * 0.32 + (whi[1](x, y, z) - 0.5) * 0.3, az = (wlo[2](x, y, z) - 0.5) * 0.32 + (whi[2](x, y, z) - 0.5) * 0.3;
      const px = x + ax, py = y + ay, pz = z + az, l = Math.hypot(px, py, pz); return [px / l, py / l, pz / l];
    };
    for (let c = 0; c < V; c++) { const w = warpPt(X[3 * c], X[3 * c + 1], X[3 * c + 2]); wx[c] = w[0]; wy[c] = w[1]; wz[c] = w[2]; }
    const ragF = makeFbm3(nSeed("coast"), 3, 2.2), ragAt = (x, y, z) => (ragF(x, y, z) - 0.5) * 2; // 海岸線のゆらぎ（半島・湾）
    // ---- 大陸の計画（配置パターン・不均等な大きさ・形）と、地図の左右端が海になる向き ----
    const samples = seamSampleSpecs().map((s) => { const p0 = [Math.cos(s.lat) * Math.cos(s.lon), Math.cos(s.lat) * Math.sin(s.lon), Math.sin(s.lat)], w = warpPt(p0[0], p0[1], p0[2]); return { p: w, rag: ragAt(w[0], w[1], w[2]), weight: s.weight }; });
    // 粗いメッシュで試し作りして、大陸が合体しすぎない・数が合う計画を選ぶ（だめなら計画を作り直す。同じシードなら同じ結果）
    const coarse = coarseMesh(), CV = coarse.cellCount, CX = coarse.centerXYZ, cw = new Float32Array(3 * CV), crag = new Float32Array(CV);
    for (let c = 0; c < CV; c++) { const w = warpPt(CX[3 * c], CX[3 * c + 1], CX[3 * c + 2]); cw[3 * c] = w[0]; cw[3 * c + 1] = w[1]; cw[3 * c + 2] = w[2]; crag[c] = ragAt(w[0], w[1], w[2]); }
    const judge = (pl, si) => { // 戻り値: 問題の大きさ（0 なら合格）
      const { fieldAt } = makeFields(pl), ca = Math.cos(si.psi), sa = Math.sin(si.psi), raw = new Float32Array(CV);
      for (let c = 0; c < CV; c++) raw[c] = fieldAt(cw[3 * c] * ca - cw[3 * c + 1] * sa, cw[3 * c] * sa + cw[3 * c + 1] * ca, cw[3 * c + 2], crag[c]);
      const sorted = Float32Array.from(raw).sort(), lvl = sorted[Math.min(CV - 1, Math.floor(CV * (1 - spec.landFraction)))], isS = new Uint8Array(CV); for (let c = 0; c < CV; c++) isS[c] = raw[c] > lvl ? 0 : 1;
      const { sizes } = landmasses(CV, coarse.neighborOffsets, coarse.neighborIds, isS), total = sizes.reduce((a, b) => a + b, 0) || 1, big = sizes.filter((n) => n >= total * 0.03).sort((a, b) => b - a);
      const K = spec.continentCountTarget, lo = spec.layout === "uneven" ? Math.max(1, K - 2) : spec.layout === "super" ? Math.max(1, K - 3) : Math.max(1, Math.ceil(K / 2)), maxShare = spec.layout === "super" ? 0.72 : K === 1 ? 1 : 0.5;
      let bad = 0; if (big.length < lo) bad += (lo - big.length) * 2; if (big.length > K + 2) bad += big.length - K - 2; if (big[0] / total > maxShare) bad += (big[0] / total - maxShare) * 10;
      return bad + si.cost * 0.02;
    };
    let plan = null, bestBad = Infinity, bestSeam = null;
    for (let salt = 0; salt < 14 && bestBad > 0.2; salt++) { const pl = planContinents(spec, ISLAND_MODES[spec.islandMode], salt), si = chooseSeam(makeFields(pl).fieldAt, samples), bad = judge(pl, si); if (bad < bestBad) { bestBad = bad; plan = pl; bestSeam = si; } }
    seamInfo = bestSeam;
    const psi = seamInfo.psi;
    plan.islands = plan.islands.filter((o) => { const a = rotZ(o.v, -psi), lon = Math.atan2(a[1], a[0]); return Math.abs(Math.PI - Math.abs(lon)) > (o.r * 1.6 + 5 * D2R); }); // 島も、左右端にはかけない
    const { fieldAt, islandAt } = makeFields(plan);
    // ---- プレート: 種の点と、オイラー極（回転軸）。大陸ごとに大陸プレートを置き、大陸地殻と連動させる ----
    const rp = makeRng(seed, "plates"), P = spec.plateCount, seeds = [], omega = [];
    const contSeeds = []; for (const ct of plan.continents) for (const v of ct.plateSeeds) contSeeds.push(rotZ(v, -psi));
    const nCont = Math.min(contSeeds.length, Math.max(1, P - 3)), isContPlate = new Uint8Array(P);
    for (let p = 0; p < P; p++) { const rnd = rp.unitVec(); seeds.push(p < nCont ? contSeeds[p] : rnd); if (p < nCont) isContPlate[p] = 1; const w = rp.unitVec(), sp = rp.range(0.4, 1.6); omega.push([w[0] * sp, w[1] * sp, w[2] * sp]); }
    for (let c = 0; c < V; c++) { let best = -2, bp = 0; for (let p = 0; p < P; p++) { const d = wx[c] * seeds[p][0] + wy[c] * seeds[p][1] + wz[c] * seeds[p][2]; if (d > best) { best = d; bp = p; } } plate[c] = bp; }
    const vel = (p, c) => { const w = omega[p], x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2]; return [w[1] * z - w[2] * y, w[2] * x - w[0] * z, w[0] * y - w[1] * x]; };
    // 境界の収束度（正: 衝突 → 山脈・島弧、負: 発散 → 地溝・海嶺）。大陸プレートどうしの衝突は高い山脈、海洋どうしは島弧
    const srcStrength = new Float32Array(V), isSrc = new Uint8Array(V), srcCrust = new Float32Array(V);
    for (let c = 0; c < V; c++) {
      let best = 0, bestAbs = 0, crust = 0.55; const vc = vel(plate[c], c);
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k]; if (plate[j] === plate[c]) continue;
        const vj = vel(plate[j], c); let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2]; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        const conv = (vc[0] - vj[0]) * dx + (vc[1] - vj[1]) * dy + (vc[2] - vj[2]) * dz;
        if (Math.abs(conv) > bestAbs) { bestAbs = Math.abs(conv); best = conv; const a = isContPlate[plate[c]], b = isContPlate[plate[j]]; crust = a && b ? 1.15 : a || b ? 0.95 : 0.55; }
      }
      if (bestAbs > 0) { isSrc[c] = 1; srcStrength[c] = best; srcCrust[c] = crust; }
    }
    if (D2) { // v6.13.0: 境界の強さ・地殻の種類を、境界に沿って平均する（最も近い境界セルの値をそのまま使うと、山の高さが階段状の縞になる）
      const t1 = new Float32Array(V), t2 = new Float32Array(V);
      for (let it = 0; it < 3; it++) {
        for (let c = 0; c < V; c++) { if (!isSrc[c]) continue; let a = srcStrength[c], b = srcCrust[c], n = 1; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (isSrc[j]) { a += srcStrength[j]; b += srcCrust[j]; n++; } } t1[c] = a / n; t2[c] = b / n; }
        for (let c = 0; c < V; c++) if (isSrc[c]) { srcStrength[c] = t1[c]; srcCrust[c] = t2[c]; }
      }
    }
    // 境界からの距離（多源 BFS）。山脈の幅は角度で決める（解像度に依存しない）
    const widthCells = Math.max(2, (5 * D2R) / spacingRad), maxD = Math.ceil(widthCells * 3);
    const dist = new Int16Array(V).fill(-1), from = new Int32Array(V).fill(-1), q = new Int32Array(V); let qh = 0, qt = 0;
    for (let c = 0; c < V; c++) if (isSrc[c]) { dist[c] = 0; from[c] = c; q[qt++] = c; }
    while (qh < qt) { const c = q[qh++]; if (dist[c] >= maxD) continue; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (dist[j] < 0) { dist[j] = dist[c] + 1; from[j] = from[c]; q[qt++] = j; } } }
    const ridgeF = makeFbm3(nSeed("ridge"), 3, 1.4), arcF = makeFbm3(nSeed("arc"), 3, 6);
    for (let c = 0; c < V; c++) {
      if (dist[c] < 0) continue;
      const s = srcStrength[from[c]], f = Math.exp(-((dist[c] / widthCells) ** 2));
      const mod = 0.55 + 0.9 * ridgeF(X[3 * c] * 3, X[3 * c + 1] * 3, X[3 * c + 2] * 3); // 稜線の途切れ・ばらつき
      if (s > 0) { mountain[c] = clamp(s / 1.2, 0, 1.3) * f * mod * srcCrust[from[c]]; volcanic[c] = mountain[c] > 0.7 ? 0.5 : 0; } else rift[c] = clamp(-s / 1.2, 0, 1) * f;
    }
    if (D2) { blurField(mountain, off, nb, 2, 0.5); blurField(rift, off, nb, 1, 0.5); } // v6.13.0: 稜線の途切れ方を自然にし、セルの継ぎ目の段差をなだらかにする（高さは次の段階で尾根ノイズが付ける）
    // ---- 大陸の場: 正準座標に回してから、計画の場を当てる ----
    for (let c = 0; c < V; c++) {
      const ca = Math.cos(psi), sa = Math.sin(psi), x = wx[c] * ca - wy[c] * sa, y = wx[c] * sa + wy[c] * ca, z = wz[c];
      const g = fieldAt(x, y, z, ragAt(wx[c], wy[c], wz[c])), i = islandAt(x, y, z);
      continent[c] = Math.max(g, i);
    }
    // 地図の左右端（経度 ±180°）は必ず海にする: 継ぎ目から 4° までは 0、12° で元の値（継ぎ目の向き選びで足りない分の仕上げ）
    for (let c = 0; c < V; c++) { const dseam = Math.PI - Math.abs(Math.atan2(Y3(c), X3(c))); if (dseam < 12 * D2R) continent[c] *= smooth((dseam - 4 * D2R) / (8 * D2R)); }
    // 島弧: 海洋プレートどうしの衝突帯に、ところどころ島が並ぶ
    if (modeLevel > 1) for (let c = 0; c < V; c++) { if (continent[c] > 0.2 || !(mountain[c] > 0.62) || isContPlate[plate[c]]) continue; const n = arcF(X[3 * c] * 5, X[3 * c + 1] * 5, X[3 * c + 2] * 5), th = 0.64; if (n > th) { continent[c] = Math.max(continent[c], 0.5 + 0.35 * (n - th) / 0.2); volcanic[c] = Math.max(volcanic[c], 0.6); } }
    // ホットスポット: 火山島列（海の上でも島になる。地図の左右端にはかけない）
    const rh = makeRng(seed, "hotspots");
    for (let h = 0; h < [1, 2, 5][modeLevel]; h++) {
      const start = rh.unitVec(), dirv = rh.unitVec(), count = rh.int(6, 14), step = rh.range(1.2, 2.2) * D2R;
      // start から dirv に沿って（大円上に）火山を並べる
      const dot = start[0] * dirv[0] + start[1] * dirv[1] + start[2] * dirv[2]; let t = [dirv[0] - dot * start[0], dirv[1] - dot * start[1], dirv[2] - dot * start[2]]; const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
      for (let i = 0; i < count; i++) {
        const a = i * step, p = [start[0] * Math.cos(a) + t[0] * Math.sin(a), start[1] * Math.cos(a) + t[1] * Math.sin(a), start[2] * Math.cos(a) + t[2] * Math.sin(a)], rad = rh.range(0.7, 1.6) * D2R * (1 - i / (count * 1.6)), amp = 0.9 * (1 - i / (count * 1.4));
        if (Math.abs(Math.PI - Math.abs(Math.atan2(p[1], p[0]))) < 5 * D2R || Math.abs(p[2]) > 0.94) continue; // 左右端と極（緯度 70° 超）には島列をかけない
        for (let c = 0; c < V; c++) { const d = Math.acos(clamp(X[3 * c] * p[0] + X[3 * c + 1] * p[1] + X[3 * c + 2] * p[2], -1, 1)); if (d < rad * 2) { const g = Math.exp(-((d / rad) ** 2)); continent[c] = Math.max(continent[c], amp * g * 0.9); volcanic[c] = Math.max(volcanic[c], g); } }
      }
    }
  });

  // ---- G3: 標高・海岸・島 ----
  const elevation = new Float32Array(V); let seaLevelRaw = 0;
  stage("G3_elevation", "標高・海岸・島", () => {
    const s1 = nSeed("hills"), s2 = nSeed("detail"), s3 = nSeed("micro"), raw = new Float32Array(V);
    // v6.13.0: 細部は勾配ノイズ（格子の向きの癖が出にくい）。位置を低周波ノイズでゆがめて（ドメインワープ）、一様な「ぼてっとした丘」をほぐす。尾根ノイズで稜線と谷の筋を付ける
    const wsd = [nSeed("dwx"), nSeed("dwy"), nSeed("dwz")], rdM = nSeed("ridgeM"), rdH = nSeed("ridgeH"), nz3 = D2 ? gfbm3 : fbm3;
    for (let c = 0; c < V; c++) {
      const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], cf = continent[c];
      const land = smooth((cf - 0.25) / 0.45), nz = 0.2 + 0.8 * smooth(cf / 0.3); // v6.11.0: 大陸の場が 0 に近い海では、ノイズで小さな陸が散らばらないよう弱める
      let qx = x, qy = y, qz = z;
      if (D2) { qx += 0.1 * gradNoise3(wsd[0], x * 2.2, y * 2.2, z * 2.2); qy += 0.1 * gradNoise3(wsd[1], x * 2.2, y * 2.2, z * 2.2); qz += 0.1 * gradNoise3(wsd[2], x * 2.2, y * 2.2, z * 2.2); }
      raw[c] = cf * 0.8 + (nz3(s1, qx, qy, qz, 5, 2.2) - 0.5) * (0.12 + 0.6 * land) * nz + (nz3(s2, qx, qy, qz, 4, 9) - 0.5) * (0.06 + 0.16 * land) * nz + (nz3(s3, x, y, z, 3, 38) - 0.5) * (0.02 + 0.07 * land) * nz
        + mountain[c] * (0.03 + 0.97 * land) * 1.5 * (0.15 + 0.85 * smooth(cf / 0.3)) - rift[c] * 0.22; // v6.11.0: 大陸の場の外（海）では、山脈が単独で陸を持ち上げない（極などに細長い陸が生えるのを防ぐ。島弧は別に作る）
      if (D2 && land > 0) { // 山脈には鋭い稜線と谷を、低地にもゆるい尾根筋を（陸の内側だけ。海岸線の大枠は変えない）
        const mm = Math.min(1.3, mountain[c]), rm = ridged3(rdM, qx, qy, qz, 5, 5), rh = ridged3(rdH, qx, qy, qz, 4, 13);
        raw[c] += land * (mm * 0.5 * (rm - 0.62) + 0.07 * smooth(cf / 0.6) * (rh - 0.62));
      }
      { const pl = (Math.abs(lat[c]) - 72 * D2R) / (12 * D2R); if (pl > 0) raw[c] -= 0.22 * smooth(pl); } // 極域は陸になりにくい（巨大大陸を抑える。島・氷雪地域は残る）
      { const dseam = Math.PI - Math.abs(Math.atan2(y, x)); if (dseam < 12 * D2R) { const m = smooth((dseam - 4 * D2R) / (8 * D2R)); raw[c] = raw[c] * m - 0.25 * (1 - m); } } // 地図の左右端は、山脈やノイズでも陸にならないよう海側へ寄せる
    }
    // 海面の高さ = 陸地率の分位点（陸地率を目標に合わせる）
    const sorted = Float32Array.from(raw).sort(); seaLevelRaw = sorted[Math.min(V - 1, Math.max(0, Math.floor(V * (1 - spec.landFraction))))];
    const hi = sorted[Math.min(V - 1, Math.floor(V * 0.998))], lo = sorted[0];
    for (let c = 0; c < V; c++) {
      const e = raw[c] - seaLevelRaw;
      elevation[c] = e >= 0 ? Math.pow(Math.min(1.35, e / Math.max(1e-6, hi - seaLevelRaw)), 1.2) * 6500 : (e / Math.max(1e-6, seaLevelRaw - lo)) * 5500;
    }
    if (D2) { // v6.13.0: 陸は、高さの順位だけを保って、地球の高度分布に写し直す（大陸の内側が高原になる癖をなくし、平野・丘陵・山脈の割合を史実に近づける。順位が同じなので稜線・谷・海岸線は変わらない）
      const idx = []; for (let c = 0; c < V; c++) if (raw[c] > seaLevelRaw) idx.push(c);
      idx.sort((a, b) => raw[a] - raw[b] || a - b);
      const L = idx.length; for (let r = 0; r < L; r++) elevation[idx[r]] = hypsoAt((r + 0.5) / L);
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

  // v6.13.0: 内陸へ緩やかに登る傾斜（平野の川が最寄りの海へ向かう）→ 河川侵食（本流の谷を刻む）。陸は 1 m 以上を保つので、海陸の形は変わらない
  if (D2) stage("G3_erode", "河川侵食", () => {
    const perCell = 0.035 * spacingKm; // 海岸から 1 セル内陸へ入るごとに上がる高さ（m）。0.035 m/km ≒ 大河の下流平野の勾配
    for (let c = 0; c < V; c++) if (!isSea[c]) elevation[c] = Math.max(1, elevation[c] + Math.min(coastDist[c], 40) * perCell);
    erodeRivers(mesh, elevation, areaKm2, { iterations: 6, kf: 0.085 });
  });

  // ---- G4: 気候・バイオーム ----
  const temp = new Float32Array(V), precip = new Float32Array(V), biome = new Uint8Array(V), moisture = new Float32Array(V);
  const cx = { mesh, lat, lon, elevation, isSea, moisture, precipNoise: nSeed("precip"), lapse: spec.climateModel.lapseRateCPerKm, decay: Math.exp(-spacingKm / spec.climateModel.windMoistureLengthKm) };
  stage("G4_climate", "気候", () => {
    for (let c = 0; c < V; c++) temp[c] = tempAt(lat[c], elevation[c], cx.lapse);
    cx.up = new Int32Array(V); for (let c = 0; c < V; c++) cx.up[c] = upwindOf(mesh, lat, lon, c);
    for (let c = 0; c < V; c++) moisture[c] = isSea[c] ? 1 : 0.5;
    const passes = Math.min(200, Math.ceil(4000 / spacingKm) + 4);
    for (let it = 0; it < passes; it++) for (let c = 0; c < V; c++) { if (!isSea[c]) moisture[c] = moistureStep(cx, c); }
    for (let c = 0; c < V; c++) precip[c] = precipAt(cx, c);
  });
  stage("G4_biome", "バイオーム", () => { for (let c = 0; c < V; c++) biome[c] = isSea[c] ? BIOMES.OCEAN : biomeOf(temp[c], precip[c], elevation[c]); });

  // ---- G5: 水系（優先度つき洪水法: すべての流路が海か湖へ到達する）----
  const parent = new Int32Array(V).fill(-1), filled = new Float32Array(V), flow = new Float32Array(V), basin = new Int32Array(V).fill(-1), landWater = new Uint8Array(V);
  let lakeCount = 0;
  const hyd = { mesh, elevation, isSea, precip, areaKm2, parent, filled, flow, basin, landWater, biome };
  stage("G5_rivers", "水系", () => { lakeCount = computeHydrology(hyd, null).lakeCount; });
  // 河川: 流量が上位のセル。閾値は陸のセルの分位点（解像度に依存しない）
  let riverThreshold = 0; const river = new Uint8Array(V);
  stage("G5_riverset", "河川の選定", () => {
    const f = []; for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND) f.push(flow[c]);
    f.sort((a, b) => a - b); riverThreshold = f.length ? f[Math.floor(f.length * 0.93)] : 0;
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && flow[c] >= riverThreshold && flow[c] > 0) river[c] = 1;
  });

  // ---- G6: 土壌・肥沃度・資源・人口の受け皿 ----
  const soil = new Uint8Array(V), fertility = new Float32Array(V), resource = new Uint16Array(V), capacity = new Float32Array(V);
  const lu = { mesh, isSea, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, ...landUseNoise(seed) };
  stage("G6_soil", "土壌・肥沃度・資源", () => { lu.seaDist = seaDistances(mesh, isSea); for (let c = 0; c < V; c++) landUseAt(lu, c); delete lu.seaDist; });

  // ---- G7: 初期人口集団の配置 ----
  const gctx = { mesh, landWater, fertility, temp, river, coastDist, lat, lon };
  if (D2) { const sw = { mesh, cell: { elevation, landWater, river, riverTo: parent, fertility, temp, areaKm2 } }; gctx.site = (c) => siteScore(sw, c); } // v6.13.0: 初期の人口集団も、適地スコアで置く
  const populations = stage("G7_groups", "初期人口集団", () => placeInitialGroups(gctx, spec, 0));

  // ---- G8: 統計と検証 ----
  const stats = stage("G8_stats", "統計", () => computeStats({ lon, V, off, nb, landWater, isSea, elevation, temp, precip, biome, flow, riverThreshold, river, lakeCount, parent, lat, areaKm2, populations, spec }));
  const world = {
    spec: { ...spec }, mesh, // generatorVersion は、実際に使った版（指定がなければ現行版）をそのまま記録する。古い版を指定して作った世界を、あとで同じ結果で再現できる
    cell: { elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo: parent, riverFlow: flow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain, moisture },
    entities: { populations }, stats, timings,
  };
  timings.total = Math.round(performance.now() - tAll);
  world.hash = worldHash(world);
  Object.defineProperty(world, "siteTools", { value: { pickSite, planSettlements, planSites, siteScore }, enumerable: false, writable: true, configurable: true }); // 集落の選定の道具。国家運営層（civ）は world/ を直接 import できないので、世界に持たせて渡す（保存・複製・ハッシュに入らない）
  return world;
}

// ---------------------------------------------------------------------------
// 再利用できる部品（地形編集の局所再計算も、これを使う。全体生成と同じ式を 1 か所に置く）
// ---------------------------------------------------------------------------
/** 年平均気温（℃）: 緯度による低下と、標高による低下 */
export function tempAt(latRad, elevation, lapse) {
  const a = Math.abs(latRad) / (Math.PI / 2), h = Math.max(0, elevation) / 1000;
  return 27.5 - 45 * Math.pow(a, 1.6) - lapse * h;
}
/** 風上の隣接セル。貿易風（東から）・偏西風・極東風を緯度から決める */
export function upwindOf(mesh, lat, lon, c) {
  const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
  const la = Math.abs(lat[c]) / D2R, east = la < 30 ? -1 : la < 60 ? 1 : -1; // 東向きの風なら +1（西から吹く）
  const ex = -Math.sin(lon[c]), ey = Math.cos(lon[c]); // 東向きの単位ベクトル（xy 平面）
  const wx = -east * ex, wy = -east * ey; // 風上へ向かう向き
  let best = -2, bj = -1;
  for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k], dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2], dl = Math.hypot(dx, dy, dz) || 1, s = (dx * wx + dy * wy) / dl; if (s > best) { best = s; bj = j; } }
  return bj;
}
const upOf = (cx, c) => (cx.up ? cx.up[c] : upwindOf(cx.mesh, cx.lat, cx.lon, c)); // 全体生成では事前計算した風上表を使う（同じ値）
function liftRaw(cx, c) { const u = upOf(cx, c); return Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1000; } // 風上より高い分だけ持ち上がる（km）
/** 水蒸気量の 1 ステップ（陸のセル）: 風上の値を減衰させ、山で持ち上がった分を失う */
export function moistureStep(cx, c) { const u = upOf(cx, c); return clamp(cx.moisture[u] * cx.decay - 0.3 * (Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1000), 0.42, 1); }
/** 年降水量（mm）: 緯度帯の基準 × 水蒸気量 × ゆらぎ ＋ 地形性降雨 */
export function precipAt(cx, c) {
  const X = cx.mesh.centerXYZ, sea = cx.isSea[c], la = Math.abs(cx.lat[c]) / D2R, zonal = 250 + 1900 * Math.exp(-((la / 9) ** 2)) + 800 * Math.exp(-(((la - 55) / 12) ** 2));
  const lift = sea ? 0 : Math.fround(liftRaw(cx, c)), m = cx.moisture[c];
  let p = zonal * (0.35 + 0.85 * m) * (0.7 + 0.6 * fbm3(cx.precipNoise, X[3 * c], X[3 * c + 1], X[3 * c + 2], 3, 2.5)) + 900 * lift * m * (sea ? 0 : 1);
  if (!sea && cx.elevation[c] > 3500) p *= 0.6; // 高所は降水が減る
  return clamp(p, 0, 6000);
}
export function biomeAt(T, P, e, sea) { return sea ? BIOMES.OCEAN : biomeOf(T, P, e); }

/**
 * 水系（優先度つき洪水法）。members（Uint8Array）を渡すと、そのセルだけを再計算する（局所再計算）。null なら全体。
 * 海に接する海セルを種にして、低い方から陸へ広げる。親が流下先になるので、すべての流路が海へ着く。
 * 戻り値: { lakeCount, unreached }（unreached: 海に着けなかった陸セルの数。0 でなければ呼び出し側が全体を再計算する）
 */
export function computeHydrology(h, members = null) {
  const { mesh, elevation, isSea, precip, areaKm2, parent, filled, flow, basin, landWater, biome } = h;
  const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, EPS = 0.05;
  const heap = new MinHeap(V + 16), done = new Uint8Array(V), order = new Int32Array(V); let on = 0;
  for (let c = 0; c < V; c++) { if (members && !members[c]) continue; filled[c] = elevation[c]; parent[c] = -1; basin[c] = -1; }
  for (let c = 0; c < V; c++) {
    if (isSea[c]) { done[c] = 1; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (!isSea[j] && (!members || members[j])) { heap.push(filled[c], c); break; } } } // 海: 内側は処理しない。陸に接する海だけをキューへ
    else if (members && !members[c]) done[c] = 1; // 対象外の陸は広げない
  }
  while (heap.n > 0) {
    const c = heap.pop(); order[on++] = c;
    for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (done[j]) continue; done[j] = 1; parent[j] = c; filled[j] = Math.max(elevation[j], filled[c] + EPS); heap.push(filled[j], j); }
  }
  // 流量: 降水 × 面積 × 流出係数（m³/s の目安）を、上流から下流へ足し合わせる
  for (let c = 0; c < V; c++) { if (members && !members[c]) continue; flow[c] = isSea[c] ? 0 : precip[c] * areaKm2[c] * 9.5e-6; }
  for (let i = on - 1; i >= 0; i--) { const c = order[i], p = parent[c]; if (p >= 0 && !isSea[c]) flow[p] += isSea[p] ? 0 : flow[c]; }
  for (let i = 0; i < on; i++) { const c = order[i]; if (isSea[c]) continue; const p = parent[c]; basin[c] = isSea[p] ? c : basin[p]; }
  // 湖: くぼ地を埋めた深さが十分あるセル
  let lakeCount = 0, unreached = 0;
  for (let c = 0; c < V; c++) {
    if (members && !members[c]) continue;
    if (isSea[c]) landWater[c] = LAND_WATER.OCEAN;
    else { if (parent[c] < 0) unreached++; if (filled[c] - elevation[c] >= 40) { landWater[c] = LAND_WATER.LAKE; lakeCount++; biome[c] = BIOMES.LAKE; } else landWater[c] = LAND_WATER.LAND; }
  }
  return { lakeCount, unreached };
}

/** 土壌・資源・肥沃度のノイズ種（シードから決まる） */
export function landUseNoise(seed) { const ns = (name) => hashString(`${seed}::noise::${name}`); return { rs: ["iron", "copper", "tin", "gold", "coal", "gems"].map(ns), sSalt: ns("salt") }; }
const SOIL_FERT = { [SOILS.NONE]: 0, [SOILS.ROCK]: 0.05, [SOILS.SAND]: 0.1, [SOILS.LOAM]: 0.85, [SOILS.CLAY]: 0.55, [SOILS.VOLCANIC]: 1.05, [SOILS.PERMAFROST]: 0.1, [SOILS.ALLUVIAL]: 1.2, [SOILS.PODZOL]: 0.5, [SOILS.BLACK_EARTH]: 1.15 };
/** 全セルについて、海のセルから最も近い陸（水域でない所）までのセル数（多源 BFS。7 を超える所と陸は 99）。seaToLand をセルごとに呼ぶのと同じ値 */
export function seaDistances(mesh, isSea) {
  const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, d = new Uint8Array(V).fill(99), q = new Int32Array(V); let qh = 0, qt = 0;
  for (let c = 0; c < V; c++) if (!isSea[c]) { d[c] = 0; q[qt++] = c; }
  while (qh < qt) { const c = q[qh++]; if (d[c] >= 7) continue; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (d[j] === 99) { d[j] = d[c] + 1; q[qt++] = j; } } }
  for (let c = 0; c < V; c++) if (!isSea[c]) d[c] = 99;
  return d;
}
/** 海のセルから、最も近い陸までのセル数（6 まで見る。見つからなければ 99）。局所再計算（編集）用 */
function seaToLand(mesh, isSea, c) {
  const off = mesh.neighborOffsets, nb = mesh.neighborIds; let fr = [c]; const seen = new Set([c]);
  for (let d = 0; d <= 6; d++) { const nx = []; for (const u of fr) for (let k = off[u]; k < off[u + 1]; k++) { const j = nb[k]; if (!isSea[j]) return d + 1; if (!seen.has(j)) { seen.add(j); nx.push(j); } } fr = nx; if (!fr.length) break; }
  return 99;
}
/** 1 セルの土壌・資源・肥沃度・人口の受け皿を決める（全体生成と局所再計算で共通） */
export function landUseAt(g, c) {
  const { mesh, isSea, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, rs, sSalt, seaDist } = g;
  const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
  const sea = isSea[c], land = !sea && landWater[c] === LAND_WATER.LAND, b = biome[c], e = elevation[c];
  let relief = 0, kn = 0; for (let k = off[c]; k < off[c + 1]; k++) { relief += Math.abs(elevation[nb[k]] - e); kn++; } relief /= Math.max(1, kn); // 起伏（隣との標高差の平均）
  const nearRiver = river[c] === 1; let res = 0;
  if (sea) { if (e > -300 && (seaDist ? seaDist[c] : seaToLand(mesh, isSea, c)) <= 6) res |= RES.FISH; } // seaDist: 全体生成で一括計算した距離（無ければ 1 セルずつ探す）
  else {
    const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], q = (i, f) => fbm3(rs[i], x, y, z, 3, f);
    if (land) {
      // v6.13.0: ノイズ（高価）は、安い条件を先に判定してから評価する（結果は同じ。全体生成の G6 が約 7 倍速い）
      if (e > 300 && q(0, 7) > 0.6) res |= RES.IRON;
      if ((e > 500 || volcanic[c] > 0.3) && q(1, 8) > 0.66) res |= RES.COPPER;
      if (e > 800 && q(2, 9) > 0.72) res |= RES.TIN;
      if ((nearRiver || mountain[c] > 0.4) && q(3, 10) > 0.74) res |= RES.GOLD;
      if (e < 1500 && (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.WETLAND || b === BIOMES.TROPICAL_SEASONAL) && q(4, 6) > 0.62) res |= RES.COAL;
      if (mountain[c] > 0.5 && q(5, 11) > 0.78) res |= RES.GEMS;
      if (e > 200 && relief > 120) res |= RES.STONE;
      if ((b === BIOMES.HOT_DESERT || b === BIOMES.COLD_DESERT) && e < 600 && fbm3(sSalt, x, y, z, 3, 8) > 0.6) res |= RES.SALT;
      if (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.TROPICAL_SEASONAL || b === BIOMES.RAINFOREST) res |= RES.TIMBER;
      if (relief < 80 && (nearRiver || coastDist[c] <= 2) && b !== BIOMES.HOT_DESERT) res |= RES.CLAY;
      if (nearRiver) res |= RES.FISH;
    } else if (landWater[c] === LAND_WATER.LAKE) res |= RES.FISH;
  }
  resource[c] = res;
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
  if (land) { // 肥沃度 0〜1（気候の適合 × 土壌 × 地形）
    const t = temp[c], p = precip[c];
    const tf = t < -2 ? 0 : t < 8 ? (t + 2) / 10 * 0.6 : t <= 26 ? 1 : clamp(1 - (t - 26) / 12, 0.2, 1);
    const pf = p < 150 ? p / 150 * 0.15 : p < 600 ? 0.15 + (p - 150) / 450 * 0.85 : p <= 2200 ? 1 : clamp(1 - (p - 2200) / 3500, 0.5, 1);
    const slope = 1 - clamp(relief / 700, 0, 0.9), alt = 1 - clamp(Math.max(0, e - 1500) / 3000, 0, 1);
    fertility[c] = clamp(tf * pf * SOIL_FERT[sl] * slope * alt, 0, 1);
    capacity[c] = fertility[c] * 12 * (1 + (nearRiver ? 0.5 : 0) + (coastDist[c] <= 1 ? 0.3 : 0)) * areaKm2[c]; // 人口の受け皿（農耕を想定。海辺・河川・湖畔は有利）
  } else { fertility[c] = 0; capacity[c] = 0; }
}

/**
 * 初期人口集団の候補を置く。variant を変えると別の候補になる（0 が生成時の既定）。
 * g: { mesh, landWater, fertility, temp, river, coastDist, lat, lon }
 */
export function placeInitialGroups(g, spec, variant = 0) {
  { const P = activePlugin("city"); if (typeof P?.initialGroups === "function") { try { const alt = P.initialGroups(g, spec, variant); if (Array.isArray(alt) && alt.length && alt.every((o) => Number.isInteger(o.cell) && g.landWater[o.cell] === LAND_WATER.LAND)) return alt.slice(0, spec.initialGroups).map((o, i) => ({ id: i + 1, subsistence: "forage", species: "human", size: 300, ...o, lat: g.lat[o.cell] / D2R, lon: g.lon[o.cell] / D2R })); } catch { /* プラグインの失敗は標準へ */ } } } // v6.13.0: 都市プラグイン
  const { mesh, landWater, fertility, temp, river, coastDist, lat, lon } = g, V = mesh.cellCount, X = mesh.centerXYZ, R = spec.planet.radiusKm;
  const rg = makeRng(spec.worldSeed, variant ? `groups#${variant}` : "groups"), cand = [];
  for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && fertility[c] > 0.35 && temp[c] > 4 && temp[c] < 30) cand.push({ c, s: (g.site ? Math.max(0.05, g.site(c)) : fertility[c] * (1 + (river[c] ? 0.3 : 0) + (coastDist[c] <= 2 ? 0.2 : 0))) * (0.7 + 0.6 * rg()) });
  cand.sort((a, b) => b.s - a.s || a.c - b.c);
  const out = [], minSep = Math.min(0.25 * Math.PI, 2000 / R);
  const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
  for (const { c } of cand) { if (out.length >= spec.initialGroups) break; if (out.every((o) => ang(o.cell, c) >= minSep)) out.push({ id: out.length + 1, cell: c, lat: lat[c] / D2R, lon: lon[c] / D2R, size: Math.round(rg.range(150, 600)), subsistence: "forage", species: "human" }); }
  return out;
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

/** 編集後などに、統計を作り直す（生成時と同じ計算） */
export function recomputeStats(world) {
  const { mesh, cell } = world, V = mesh.cellCount, isSea = new Uint8Array(V); let lakes = 0;
  for (let c = 0; c < V; c++) { isSea[c] = cell.elevation[c] <= 0 ? 1 : 0; if (cell.landWater[c] === LAND_WATER.LAKE) lakes++; }
  return computeStats({ V, off: mesh.neighborOffsets, nb: mesh.neighborIds, isSea, landWater: cell.landWater, elevation: cell.elevation, temp: cell.temp, biome: cell.biome, lat: cell.lat, riverThreshold: world.stats.riverFlowThreshold, river: cell.river, lakeCount: lakes, parent: cell.riverTo, populations: world.entities.populations });
}

function computeStats(a) {
  const { V, off, nb, isSea, landWater, elevation, temp, biome, lat, riverThreshold, river, lakeCount, parent, populations } = a;
  let mouthCount = 0; for (let c = 0; c < V; c++) if (river[c] && parent[c] >= 0 && isSea[parent[c]]) mouthCount++;
  let sea = 0, lake = 0, mount = 0, rivers = 0, cold = 0;
  for (let c = 0; c < V; c++) { if (isSea[c]) sea++; else { if (landWater[c] === LAND_WATER.LAKE) lake++; if (elevation[c] > 2500) mount++; if (river[c]) rivers++; } }
  const landCells = V - sea, { sizes } = landmasses(V, off, nb, isSea), total = sizes.reduce((s, x) => s + x, 0);
  const continents = sizes.filter((s) => s >= total * 0.03), islands = sizes.filter((s) => s < total * 0.03);
  let seamN = 0, seamLand = 0; if (a.lon) for (let c = 0; c < V; c++) if (Math.abs(a.lon[c]) > 175 * D2R) { seamN++; if (!isSea[c]) seamLand++; } // 地図の左右端（経度 ±180° の両側 5°）の陸の割合
  const biomeCounts = new Array(14).fill(0); for (let c = 0; c < V; c++) biomeCounts[biome[c]]++;
  // 気温の健全性: 低緯度の平均 > 高緯度の平均
  let tl = 0, nl = 0, th = 0, nh = 0; for (let c = 0; c < V; c++) { if (isSea[c]) continue; const la = Math.abs(lat[c]) / D2R; if (la < 20) { tl += temp[c]; nl++; } else if (la > 60) { th += temp[c]; nh++; } }
  return {
    seamLandFraction: seamN ? seamLand / seamN : 0, layout: a.spec?.layout ?? null,
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
  const K = spec.continentCountTarget, lay = spec.layout ?? "uneven"; // v6.11.0: 配置パターンごとに、大陸の数と最大陸塊の許容を変える（群島・分裂は大陸どうしが近く、数は目標より減りうる。超大陸は 1 つが大きい）
  const lo = lay === "uneven" ? Math.max(1, K - 2) : lay === "super" ? Math.max(1, K - 3) : Math.max(1, Math.ceil(K / 2)); if (st.continentCount < lo || st.continentCount > K + 3) r.push(`大陸級の陸塊が ${st.continentCount} 個（目標 ${K}）`);
  if (spec.islandMode === "many" && st.islandCount < 20) r.push(`島が少ない（${st.islandCount}）`);
  const maxShare = lay === "super" ? 0.75 : K === 1 ? 1 : 0.55; if (st.continentShares[0] > maxShare) r.push(`最大の陸塊が陸の ${(st.continentShares[0] * 100).toFixed(0)}%（偏りすぎ）`);
  if (st.seamLandFraction > 0.08) r.push(`地図の左右端に陸が多い（${(st.seamLandFraction * 100).toFixed(0)}%）`);
  if (st.meanTempLow != null && st.meanTempHigh != null && st.meanTempLow <= st.meanTempHigh + 10) r.push("低緯度が高緯度より十分に暖かくない");
  return r;
}
