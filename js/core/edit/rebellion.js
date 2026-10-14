// 反乱・分離：HoI4 のように、属州が離反して別の国家になり、軍も割れて内戦になる。
// 補給・物資のような細かい設定は持たない（領土・都市・属州・軍の割れ方と、内戦という1つの戦争だけで表す）。
//
//   ・分離する属州の選び方（首都の属州は含めない・元の国に属州と都市を残す）
//   ・軍の分け方：反乱側の領土にいる部隊はそのまま移り、残りの部隊からは領土の割合に応じた兵力が反乱軍に回る
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setList, setProps } from "./commands.js";
import { regimentsOf } from "../sim/military.js";
import { forceHeadcount } from "../sim/units.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 分離できる属州を、首都から遠い順に並べる（首都を含む属州・都市の無い属州・領土の無い属州は除く）。
 * @returns {{provinceId:number, dist:number, cells:number}[]}
 */
export function breakawayCandidates(map, stateId) {
  const st = map.pack.states[stateId]; if (!isLive(st)) return [];
  const provs = map.pack.provinces.filter((p) => isLive(p) && p.state === stateId);
  if (provs.length < 2) return [];
  const c = map.pack.cells, cap = map.pack.burgs[st.capital], P = map.geometry?.pack?.p;
  const capPt = cap && P ? P[cap.cell] : null;
  const cellsOf = new Map(provs.map((p) => [p.i, []]));
  for (let i = 0; i < c.province.length; i++) if (cellsOf.has(c.province[i]) && c.state[i] === stateId) cellsOf.get(c.province[i]).push(i);
  const out = [];
  for (const p of provs) {
    const cells = cellsOf.get(p.i); if (!cells.length) continue;
    if (cap && cells.includes(cap.cell)) continue;
    if (!cells.some((i) => { const b = map.pack.burgs[c.burg[i]]; return b && !b.removed && b.i > 0; })) continue;
    const mid = P ? P[cells[Math.floor(cells.length / 2)]] : [0, 0];
    out.push({ provinceId: p.i, dist: capPt ? Math.hypot(mid[0] - capPt[0], mid[1] - capPt[1]) : 0, cells: cells.length });
  }
  return out.sort((a, b) => b.dist - a.dist);
}

/**
 * 反乱で分離する属州を選ぶ（自然発生用）。遠い属州から、国の属州の2〜4割ほどを選ぶ。元の国には必ず属州が残る。
 * @returns {number[]} 属州IDの配列（空なら分離できない）
 */
export function pickBreakawayProvinces(map, stateId, rnd) {
  const cands = breakawayCandidates(map, stateId); if (!cands.length) return [];
  const total = map.pack.provinces.filter((p) => isLive(p) && p.state === stateId).length;
  const k = clamp(Math.round(total * (0.2 + 0.2 * (rnd ? rnd.next() : 0.5))), 1, cands.length);
  return cands.slice(0, k).map((x) => x.provinceId);
}

/**
 * 分離した直後の地図で、軍を割る。fromId の部隊の一部が toId（反乱側）に移る。
 *   ・反乱側の領土にいる部隊は、そのまま移る
 *   ・残りの部隊からは、領土の割合（1〜4.5割）に応じた兵力を取り、首都に置く1つの「反乱軍」にまとめる
 * 兵力の合計は変わらない（割るだけで、増やしも減らしもしない）。
 * @returns {{command:object|null, moved:number, taken:number}} moved: そのまま移った部隊数 / taken: 反乱軍に回った兵力（人数）
 */
export function planSplitArmy(map, fromId, toId) {
  const from = map.pack.states[fromId], to = map.pack.states[toId];
  if (!isLive(from) || !isLive(to)) throw new Error("存在しない国家です");
  const c = map.pack.cells;
  let mine = 0, rebel = 0;
  for (let i = 0; i < c.state.length; i++) { if (c.state[i] === fromId) mine++; else if (c.state[i] === toId) rebel++; }
  const share = clamp(rebel / Math.max(1, rebel + mine), 0.1, 0.45);

  const regs = regimentsOf(from), toRegs = regimentsOf(to);
  const keep = [], moving = [], parts = [], pool = {};
  for (const r of regs) {
    if (c.state[r.cell] === toId) { moving.push(r); continue; }
    keep.push(r);
    const next = { ...(r.u ?? {}) }; let changed = false;
    for (const [k, v] of Object.entries(r.u ?? {})) {
      if (typeof v !== "number" || !(v > 0)) continue;
      const take = Math.floor(v * share);
      if (take > 0) { pool[k] = (pool[k] ?? 0) + take; next[k] = v - take; changed = true; }
    }
    if (changed) parts.push(setProps(r, { u: next }));
  }
  const taken = forceHeadcount(pool);

  let nextId = toRegs.length ? Math.max(...toRegs.map((r) => r.i)) + 1 : 0;
  const added = moving.map((r) => ({ ...r, i: nextId++, state: toId }));
  const cap = map.pack.burgs[to.capital];
  if (taken > 0 && cap && !cap.removed) {
    const { p } = map.geometry.pack;
    added.push({ i: nextId++, name: `${to.name}反乱軍`, icon: "🏴", state: toId, cell: cap.cell, x: p[cap.cell][0], y: p[cap.cell][1], bx: p[cap.cell][0], by: p[cap.cell][1], u: pool });
  }
  if (!added.length && !parts.length) return { command: null, moved: 0, taken: 0 };

  if (moving.length) parts.push(setList((m) => m.pack.states[fromId].military, (m, v) => { m.pack.states[fromId].military = v; }, keep));
  parts.push(setList((m) => m.pack.states[toId].military, (m, v) => { m.pack.states[toId].military = v; }, [...toRegs, ...added]));
  return { command: makeCommand("反乱による軍の分割", ["places"], parts), moved: moving.length, taken };
}

export const REBEL_GOALS = Object.freeze([
  { key: "secession", label: "分離独立", desc: "領土の一部が、独立した国になる。" },
  { key: "overthrow", label: "政体転覆", desc: "政体の違う反乱側が、国の統治そのものを奪おうとする。反乱側が勝つと、元の国の政体が変わる。" },
]);
export const REBEL_SCALES = Object.freeze([
  { key: "small", label: "小", share: 0.15 }, { key: "medium", label: "中", share: 0.3 }, { key: "large", label: "大", share: 0.5 },
]);

/**
 * 反乱の規模に応じて、反乱する属州を選ぶ（互いに連結した領域。首都の属州は含めない）。
 * 首都から遠い属州を起点に、隣り合う属州へ広げ、国の領土（セル数）の share 割に届いたら止める。
 * @returns {number[]} 属州IDの配列。選べなければ空
 */
export function pickRebelProvinces(map, stateId, scaleKey, rnd) {
  const sc = REBEL_SCALES.find((s) => s.key === scaleKey); if (!sc) throw new Error("反乱の規模を選んでください");
  const cands = breakawayCandidates(map, stateId); if (!cands.length) return [];
  const c = map.pack.cells, geom = map.geometry?.pack?.cells;
  const size = new Map(), adj = new Map();
  for (let i = 0; i < c.province.length; i++) {
    const p = c.province[i]; if (!(p > 0) || c.state[i] !== stateId) continue;
    size.set(p, (size.get(p) ?? 0) + 1);
    if (!geom?.c) continue;
    for (const j of geom.c[i]) { const q = c.province[j]; if (q > 0 && q !== p && c.state[j] === stateId) { if (!adj.has(p)) adj.set(p, new Set()); adj.get(p).add(q); } }
  }
  const allowed = new Set(cands.map((x) => x.provinceId));
  const total = [...size.values()].reduce((a, b) => a + b, 0), target = Math.max(1, total * sc.share);
  const startPool = cands.slice(0, Math.max(1, Math.ceil(cands.length / 2)));
  const start = (rnd ? rnd.pick(startPool) : startPool[0]).provinceId;
  const chosen = [start]; let got = size.get(start) ?? 0;
  const frontier = () => [...new Set(chosen.flatMap((p) => [...(adj.get(p) ?? [])]))].filter((q) => allowed.has(q) && !chosen.includes(q));
  while (got < target) {
    const f = frontier(); if (!f.length) break;
    const q = rnd ? rnd.pick(f) : f[0];
    if (got + (size.get(q) ?? 0) > total * 0.7) break; // 元の国には、必ず領土を残す
    chosen.push(q); got += size.get(q) ?? 0;
  }
  return chosen;
}
