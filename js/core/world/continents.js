// 大陸の計画（v6.11.0）。フィクションの地図のように、大きさがまちまちで、半島・内海・湾を持つ大陸を作る。
//   配置パターン 4 種（不均等分散型・群島クラスター型・超大陸型・分裂大陸型）。純粋ロジック（DOM 非依存）。乱数は worldSeed から段階別に作る。
//   正準座標（canonical）で大陸を定義し、地図の左右端（経度 ±180°）が海になる向きを選んで、そのぶん回してからセルに当てる。
import { makeRng } from "./noise.js";

export const LAYOUTS = Object.freeze({ uneven: "不均等分散型", cluster: "群島・クラスター型", super: "超大陸型", split: "分裂大陸型" });
export const LAYOUT_HINTS = Object.freeze({
  uneven: "大陸ごとに大きさと距離が異なる（標準）",
  cluster: "近接する大陸群と、広い海洋",
  super: "一つの巨大な陸塊と、複数の小大陸",
  split: "内海・海峡・半島が多い、複雑な地形",
});
const D2R = Math.PI / 180, TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const angle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));
/** z 軸まわりに a ラジアン回す */
export const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
const fromLatLon = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
const tangentFrame = (v) => { const a = Math.abs(v[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], t = unit(cross(a, v)); return [t, cross(v, t)]; };
/** v から、向き dir（tangent 内の角度）へ distance ラジアン進んだ点 */
const walk = (v, dirAngle, distance) => {
  const [t, b] = tangentFrame(v), d = [t[0] * Math.cos(dirAngle) + b[0] * Math.sin(dirAngle), t[1] * Math.cos(dirAngle) + b[1] * Math.sin(dirAngle), t[2] * Math.cos(dirAngle) + b[2] * Math.sin(dirAngle)];
  const cd = Math.cos(distance), sd = Math.sin(distance); return unit([v[0] * cd + d[0] * sd, v[1] * cd + d[1] * sd, v[2] * cd + d[2] * sd]);
};
const latOf = (v) => Math.asin(clamp(v[2], -1, 1));
const randomPoint = (rc, latLimDeg) => { const s = Math.sin(latLimDeg * D2R); const z = rc.range(-s, s), t = rc.range(0, TAU), r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; };

/** 楕円状の「ふくらみ」: 中心 v、半径 R（ラジアン）、向き（tangent 内の角度 theta）、縦横比 s（>1 で theta の向きに細長い） */
function makeBlob(v, R, theta, s, ragA = 0.5) {
  const [t0, b0] = tangentFrame(v), c = Math.cos(theta), sn = Math.sin(theta);
  const t = [t0[0] * c + b0[0] * sn, t0[1] * c + b0[1] * sn, t0[2] * c + b0[2] * sn], b = cross(v, t);
  const reach = R * (1 + ragA * 0.6) * Math.max(1, s) * 1.02;
  return { v, t, b, R, s, ragA, vx: v[0], vy: v[1], vz: v[2], tx: t[0], ty: t[1], tz: t[2], bx: b[0], by: b[1], bz: b[2], cosCut: Math.cos(Math.min(Math.PI, reach)) };
}
function blobValue(l, x, y, z, rag) {
  const dp = x * l.vx + y * l.vy + z * l.vz; if (dp < l.cosCut) return 0;
  const d = Math.acos(dp > 1 ? 1 : dp); let deff = d;
  if (l.s !== 1) { const pu = x * l.tx + y * l.ty + z * l.tz, pw = x * l.bx + y * l.by + z * l.bz, h = Math.hypot(pu, pw); if (h > 1e-9) { const cu = pu / h, sw = pw / h; deff = d * Math.hypot(cu / l.s, sw * l.s); } }
  return smooth01((1 - deff / (l.R * (1 + l.ragA * rag))) * 2.2);
}

/** 緯度による大陸の抑制: 緯度 58° までは 1、70° で 0.15、76° で 0.02、それより極側は 0（巨大大陸が極に伸びない。島・氷雪地域は、島として別に許す） */
export const polarDamp = (z) => { const a = Math.abs(z); if (a < 0.848) return 1; if (a < 0.9397) return 1 - 0.85 * smooth01((a - 0.848) / 0.0917); if (a < 0.9703) return 0.15 - 0.13 * smooth01((a - 0.9397) / 0.0306); return Math.max(0, 0.02 - 0.02 * smooth01((a - 0.9703) / 0.02)); };

/**
 * 大陸の計画を作る。戻り値: { layout, continents: [{ v, r, share, blobs, seas, plateSeeds }], islands }
 * spec: { landFraction, continentCountTarget, islandMode, layout }。islandCount: 島の数
 */
export function planContinents(spec, islandCount, salt = 0) {
  const seed = salt ? `${spec.worldSeed}#plan${salt}` : spec.worldSeed, K = spec.continentCountTarget, lf = spec.landFraction, layout = spec.layout in LAYOUTS ? spec.layout : "uneven";
  const rc = makeRng(seed, "continents"), rs = makeRng(seed, "continent-shape"), ri = makeRng(seed, "islands");
  // ---- 大きさ: 不均等（大きい順）----
  const raw = [];
  for (let i = 0; i < K; i++) raw.push(layout === "cluster" ? Math.exp(rc.range(-0.6, 0.5)) : layout === "split" ? Math.exp(rc.range(-0.5, 0.5)) : Math.exp(rc.range(-0.95, 0.75)));
  raw.sort((a, b) => b - a);
  if (layout === "super" && K > 1) { let rest = 0; for (let i = 1; i < K; i++) rest += raw[i]; raw[0] = rest * 1.15; } else if (layout === "super") raw[0] = 1;
  const sum = raw.reduce((s, x) => s + x, 0), share = raw.map((x) => x / sum);
  const radius = share.map((s) => clamp(Math.acos(clamp(1 - 2 * lf * s * 1.1, -1, 1)), 4 * D2R, 80 * D2R));
  // ---- 位置: 均等配置をやめる。ランダム性とクラスター ----
  const centers = [];
  const sepOk = (p, j, f) => centers.every((c, i) => angle(p, c) >= (radius[i] + radius[j]) * f);
  const place = (j, latLim, nearProb, f0) => {
    for (let tries = 0; tries < 900; tries++) {
      const f = Math.max(0.62, f0 - 0.4 * (tries / 900));
      let p; if (centers.length && rc() < nearProb) { const q = rc.int(0, centers.length - 1); p = walk(centers[q], rc.range(0, TAU), (radius[q] + radius[j]) * rc.range(f + 0.05, f + 0.55)); } else p = randomPoint(rc, latLim);
      if (Math.abs(latOf(p)) > latLim * D2R) continue;
      if (sepOk(p, j, f)) return p;
    }
    return randomPoint(rc, latLim);
  };
  if (layout === "cluster") {
    const nC = K <= 3 ? 1 : K <= 5 ? 2 : 3, cc = []; let bestSep = -1, bestSet = null;
    for (let trial = 0; trial < 800; trial++) { const pts = []; for (let i = 0; i < nC; i++) pts.push(randomPoint(rc, 38)); let sep = 9; for (let i = 0; i < nC; i++) for (let j = i + 1; j < nC; j++) sep = Math.min(sep, angle(pts[i], pts[j])); if (sep > bestSep) { bestSep = sep; bestSet = pts; } }
    for (const p of bestSet) cc.push(p);
    const groupOf = []; for (let j = 0; j < K; j++) groupOf.push(j % nC);
    for (let j = 0; j < K; j++) {
      const g = groupOf[j], mates = []; for (let i = 0; i < j; i++) if (groupOf[i] === g) mates.push(i);
      if (!mates.length) { centers.push(cc[g]); continue; }
      let p = null; for (let tries = 0; tries < 600 && !p; tries++) { const q = mates[rc.int(0, mates.length - 1)], f = Math.max(1.2, 1.55 - 0.3 * (tries / 600)); const c = walk(centers[q], rc.range(0, TAU), (radius[q] + radius[j]) * rc.range(f, f + 0.3)); if (Math.abs(latOf(c)) < 55 * D2R && sepOk(c, j, 1.2)) p = c; }
      centers.push(p ?? place(j, 55, 0.5, 0.9));
    }
  } else if (layout === "super") {
    centers.push(randomPoint(rc, 28));
    for (let j = 1; j < K; j++) { let p = null; for (let tries = 0; tries < 900 && !p; tries++) { const c = randomPoint(rc, 55), f = Math.max(0.7, 1.3 - 0.6 * (tries / 900)); if (angle(c, centers[0]) >= (radius[0] + radius[j]) * f && sepOk(c, j, 0.95)) p = c; } centers.push(p ?? randomPoint(rc, 55)); }
  } else if (layout === "split") {
    centers.push(randomPoint(rc, 35));
    for (let j = 1; j < K; j++) centers.push(place(j, 48, 0.92, 1.2));
  } else {
    for (let j = 0; j < K; j++) centers.push(place(j, 52, 0.33, 1.0));
  }
  // ---- 形: 円形に偏らず、半島・内海・湾・山地を持たせる ----
  const continents = [];
  for (let j = 0; j < K; j++) {
    const v = centers[j], r = radius[j], big = share[j] >= 0.7 / K, blobs = [], seas = [], plateSeeds = [v];
    const nLobes = layout === "split" ? rs.int(3, 5) : big ? rs.int(2, 4) : rs.int(1, 2);
    blobs.push(makeBlob(v, r * rs.range(0.72, 0.95), rs.range(0, TAU), rs.range(1, 1.7)));
    for (let i = 1; i < nLobes; i++) {
      const dist = r * rs.range(0.4, 0.95), c = walk(v, rs.range(0, TAU), dist);
      blobs.push(makeBlob(c, r * rs.range(0.38, 0.7), rs.range(0, TAU), rs.range(1, 2.5)));
      if (big && i <= 2 && share[j] > 0.2) plateSeeds.push(c);
    }
    const pSea = layout === "super" && j === 0 ? 1 : layout === "split" ? 0.9 : layout === "uneven" ? 0.55 : 0.45;
    const nSea = rs() < pSea && big ? (layout === "super" && j === 0 ? rs.int(2, 3) : layout === "split" ? rs.int(1, 2) : 1) : 0;
    for (let i = 0; i < nSea; i++) seas.push(makeBlob(walk(v, rs.range(0, TAU), r * rs.range(0.1, 0.36)), r * rs.range(0.13, 0.24), rs.range(0, TAU), rs.range(1, 2), 0.25)); // 内海
    const nGulf = big ? (layout === "split" ? rs.int(2, 4) : rs.int(0, 2)) : (layout === "split" ? rs.int(0, 1) : 0);
    for (let i = 0; i < nGulf; i++) { const a = rs.range(0, TAU), c = walk(v, a, r * rs.range(0.66, 0.95)); seas.push(makeBlob(c, r * rs.range(0.1, 0.17), a + Math.PI / 2 * 0 + rs.range(-0.4, 0.4), rs.range(2.6, 3.6), 0.2)); } // 湾・海峡（外から食い込む）
    continents.push({ v, r, share: share[j], blobs, seas, plateSeeds });
  }
  // ---- 島: 標準は少なめ〜普通。大陸の近く（大陸棚）・外洋・極域（氷の島）----
  const islands = [];
  for (let i = 0; i < islandCount; i++) {
    const kind = ri(), w = ri.range(0.5, 0.95); let v, rr = ri.range(1.2, 5.2) * D2R, polar = false;
    if (kind < 0.55) { let q = 0, pick = ri(); for (let k = 0; k < K; k++) { pick -= share[k]; if (pick <= 0) { q = k; break; } } v = walk(centers[q], ri.range(0, TAU), radius[q] * ri.range(1.0, 1.75)); if (Math.abs(latOf(v)) > 72 * D2R) v = randomPoint(ri, 60); }
    else if (kind < 0.82) { v = randomPoint(ri, 62); for (let t = 0; t < 40 && centers.some((c, k) => angle(v, c) < radius[k] * 1.15); t++) v = randomPoint(ri, 62); }
    else { const lat = ri.range(62, 82) * D2R * (ri() < 0.5 ? -1 : 1); v = fromLatLon(lat, ri.range(-Math.PI, Math.PI)); polar = true; rr = ri.range(1.8, 5.5) * D2R; }
    islands.push({ v, r: rr, w, polar, cosCut: Math.cos(rr * 1.5) - 1e-9 });
  }
  return { layout, continents, islands, share, radius };
}

/** 計画から、正準座標の場を作る。fieldAt(x,y,z,rag) = 大陸の場（0〜1）、islandAt(x,y,z) = 島の場 */
export function makeFields(plan) {
  const B = [], S = []; for (const c of plan.continents) { for (const b of c.blobs) B.push(b); for (const s of c.seas) S.push(s); }
  const I = plan.islands;
  const fieldAt = (x, y, z, rag) => {
    let f = 0; for (let i = 0; i < B.length; i++) { const t = blobValue(B[i], x, y, z, rag); if (t > f) f = t; }
    if (f > 0) { let carve = 0; for (let i = 0; i < S.length; i++) { const t = blobValue(S[i], x, y, z, rag); if (t > carve) carve = t; } f *= 1 - Math.min(1, carve * 1.25); f *= polarDamp(z); }
    return f;
  };
  const islandAt = (x, y, z) => {
    let f = 0; for (let i = 0; i < I.length; i++) { const o = I[i], dp = x * o.v[0] + y * o.v[1] + z * o.v[2]; if (dp < o.cosCut) continue; const d = Math.acos(dp > 1 ? 1 : dp); if (d < o.r * 1.5) { const t = clamp(1 - d / (o.r * 1.5), 0, 1); f = Math.max(f, o.w * t * t * (3 - 2 * t)); } }
    return f;
  };
  return { fieldAt, islandAt };
}

/**
 * 地図の左右端（経度 ±180°）が海になる向きを選ぶ。warpedSeam: セルの位置を歪めた後の、継ぎ目付近の標本点 [[x,y,z]...]（実座標）と rag。
 * 戻り値: psi（実座標を正準座標へ回す角。正準座標の経度 = 実経度 + psi）
 */
export function chooseSeam(fieldAt, samples) {
  let bestPsi = 0, bestCost = Infinity;
  for (let k = 0; k < 120; k++) {
    const psi = (k / 120) * TAU; let cost = 0;
    for (const s of samples) { const q = rotZ(s.p, psi), f = fieldAt(q[0], q[1], q[2], s.rag); if (f > 0.03) cost += s.weight * (0.4 + f); }
    if (cost < bestCost - 1e-9) { bestCost = cost; bestPsi = psi; }
  }
  return { psi: bestPsi, cost: bestCost };
}
/** 継ぎ目の標本点（実座標の経度 ±180° の帯。経度のずれと重み）を返す。緯度 ±72° まで */
export function seamSampleSpecs() {
  const out = []; for (let lat = -72; lat <= 72; lat += 3) for (const [dl, w] of [[-9, 1], [-4.5, 2], [0, 3], [4.5, 2], [9, 1]]) out.push({ lat: lat * D2R, lon: Math.PI + dl * D2R, weight: w });
  return out;
}
export { fromLatLon };
