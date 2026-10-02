// 旅の計算：移動手段（速度・1日の移動時間・通れる場所）と、セルの隣接を使った経路探索。
//
// Azgaar 本家の旅（Journeys）は、道路網・航路・標高を見て経路を求め、区間ごとに移動手段を持つ。
// ここでは同じ考え方を簡略化している:
//   ・陸: 陸セルだけを通る。道は速く（費用0.5）、小道はやや速く（0.7）、険しいバイオームは遅く（費用が大きい）。
//   ・水: 海・湖のセルだけを通る。出発・到着は「水に接した陸セル」（岸から乗る）でもよい。航路は優先。
//   ・空: 直線（制限なし）。 ・滞在: 移動せず、時間だけが過ぎる。
// 標高は使わない（バイオームだけで難しさを決める）。
//
// 純粋ロジック層：DOM に依存しない。map を変更しない。

import { getScale } from "../../render/layers/annotations.js";

/** 移動手段。speed: 距離単位/時、hoursPerDay: 1日に進める時間、domain: land|water|air|stay */
export const TRANSPORTS = Object.freeze([
  { id: "foot",     label: "徒歩（荷あり）", speed: 3.5, hoursPerDay: 8,  domain: "land", icon: "🚶" },
  { id: "march",    label: "行軍",           speed: 4.5, hoursPerDay: 8,  domain: "land", icon: "🪖" },
  { id: "caravan",  label: "隊商（荷車）",   speed: 3.0, hoursPerDay: 8,  domain: "land", icon: "🛒" },
  { id: "horse",    label: "騎馬",           speed: 8,   hoursPerDay: 8,  domain: "land", icon: "🐎" },
  { id: "galley",   label: "ガレー船",       speed: 5,   hoursPerDay: 12, domain: "water", icon: "🛶" },
  { id: "sail",     label: "帆船",           speed: 8,   hoursPerDay: 24, domain: "water", icon: "⛵" },
  { id: "air",      label: "飛行（魔法・竜）", speed: 40, hoursPerDay: 12, domain: "air", icon: "🐉" },
  { id: "stay",     label: "滞在",           speed: 0,   hoursPerDay: 24, domain: "stay", icon: "⛺" },
]);
export const TRANSPORT_BY_ID = Object.freeze(Object.fromEntries(TRANSPORTS.map((t) => [t.id, t])));

/** バイオームごとの陸の通りにくさ（1=平地）。id は Azgaar 標準 */
const LAND_COST = { 1: 1.7, 2: 1.5, 3: 1.0, 4: 1.0, 5: 1.2, 6: 1.2, 7: 1.8, 8: 1.4, 9: 1.3, 10: 1.5, 11: 3.0, 12: 2.2 };

/** 縮尺（無ければ標準の 1画素=3km）。usedDefault が true なら、画面に注記を出す */
export function travelScale(map) {
  const s = getScale(map);
  return s ? { ...s, usedDefault: false } : { unit: "km", perPixel: 3, usedDefault: true };
}

class MinHeap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function routeGroups(map) {
  const g = new Map();
  for (const r of map.routes ?? []) if (r && r.i != null) g.set(r.i, r.group);
  return g;
}

const isWater = (map, i) => map.pack.cells.biome[i] === 0;
const isShore = (map, i) => !isWater(map, i) && map.geometry.pack.cells.c[i].some((j) => isWater(map, j));

/** 手段の領域で、そのセルを端点にできるか。{ok, reason} */
export function canEndAt(map, cell, transport) {
  if (cell == null || cell < 0 || cell >= map.pack.cells.biome.length) return { ok: false, reason: "地図の外です" };
  if (transport.domain === "land") return isWater(map, cell) ? { ok: false, reason: `${transport.label}は水の上を進めません` } : { ok: true };
  if (transport.domain === "water") return isWater(map, cell) || isShore(map, cell) ? { ok: true } : { ok: false, reason: `${transport.label}は、水か、水に接した岸のセルからしか乗り降りできません` };
  return { ok: true };
}

/**
 * 経路を探す。
 * @returns {{ok:true, path:number[], distancePx:number} | {ok:false, reason:string}}
 */
export function findPath(map, from, to, transport) {
  const pa = map.geometry.pack.p;
  const ends = [canEndAt(map, from, transport), canEndAt(map, to, transport)];
  const bad = ends.find((e) => !e.ok);
  if (bad) return { ok: false, reason: bad.reason };
  if (transport.domain === "stay") return { ok: true, path: [from], distancePx: 0 };
  const px = (a, b) => Math.hypot(pa[a][0] - pa[b][0], pa[a][1] - pa[b][1]);
  if (transport.domain === "air") return { ok: true, path: from === to ? [from] : [from, to], distancePx: px(from, to) };
  if (from === to) return { ok: true, path: [from], distancePx: 0 };

  const adj = map.geometry.pack.cells.c, biome = map.pack.cells.biome;
  const groups = routeGroups(map), cr = map.cellRoutes ?? {};
  const water = transport.domain === "water";
  const allowed = (i) => (water ? isWater(map, i) || i === from || i === to : !isWater(map, i));
  const edgeFactor = (i, j) => {
    const rid = cr[i]?.[j];
    const grp = rid != null ? groups.get(rid) : null;
    if (water) return grp === "searoutes" ? 0.6 : 1;
    if (grp === "roads") return 0.5;
    if (grp === "trails") return 0.7;
    return LAND_COST[biome[j]] ?? 1.3;
  };

  const n = biome.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[from] = 0; heap.push(0, from);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    if (i === to) break;
    for (const j of adj[i]) {
      if (!allowed(j)) continue;
      const nd = d + px(i, j) * edgeFactor(i, j);
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  if (!Number.isFinite(dist[to])) {
    return { ok: false, reason: water ? "2点は同じ海でつながっていません（別の海・湖、または陸でさえぎられています）" : "2点は陸でつながっていません（海をはさんでいます）" };
  }
  const path = []; for (let c = to; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  let distancePx = 0; for (let k = 1; k < path.length; k++) distancePx += px(path[k - 1], path[k]);
  return { ok: true, path, distancePx };
}

/** 区間の所要。stay は hours を指定（既定 24）。 */
export function legStats(map, leg, transport) {
  const sc = travelScale(map);
  const distance = (leg.distancePx ?? 0) * sc.perPixel;
  const hours = transport.domain === "stay" ? (leg.stayHours ?? 24) : transport.speed > 0 ? distance / transport.speed : 0;
  return { distance, hours, days: hours / transport.hoursPerDay, unit: sc.unit };
}

/** 旅全体の合計 */
export function journeyTotals(map, journey) {
  let distance = 0, days = 0, hours = 0;
  for (const leg of journey.legs ?? []) {
    const t = TRANSPORT_BY_ID[leg.transport];
    if (!t) continue;
    const s = legStats(map, leg, t);
    distance += s.distance; hours += s.hours; days += s.days;
  }
  return { distance, hours, days, unit: travelScale(map).unit };
}

/** 日数を「3日と4時間」のような読みやすい文にする */
export function formatDuration(days) {
  if (days < 1 / 24) return "ほぼ即時";
  if (days < 1) return `${Math.round(days * 24)}時間`;
  const d = Math.floor(days + 1e-9), h = Math.round((days - d) * 24);
  return h > 0 && d < 30 ? `${d}日${h}時間` : `${Math.round(days)}日`;
}
