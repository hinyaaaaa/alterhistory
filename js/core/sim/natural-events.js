// 自然発生イベント：年が進むと、独立・疫病・反乱・宗教の分派が、確率で起きる。
//   ・オン／オフと頻度（まれ・ふつう・多い）は、地図に保存する（ext.data.naturalEvents）。
//   ・乱数は固定しない。呼び出し側が渡す rnd（遊ぶたびに違う）をそのまま使う。
//   ・起きたことは、必ず年表に載る（疫病・反乱・分派は歴史ログ、独立は主権の記録）。
// このファイルは「何が起きるか」を決める部分と、疫病・反乱の変化の計画。独立と分派（複数の編集を順に行う）は
// app/sim-actions.js が、transaction（全部成功か全部取り消し）の中で行う。
//
// 純粋ロジック層：DOM に依存しない。

import { pickBreakawayProvinces } from "../edit/rebellion.js";
import { makeCommand, setProps, setIndexed } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { withEvent } from "../edit/history-log.js";

export const FREQUENCIES = Object.freeze({
  low: { label: "まれ", factor: 0.5 },
  normal: { label: "ふつう", factor: 1 },
  high: { label: "多い", factor: 2 },
});
export const DEFAULT_NATURAL = Object.freeze({ enabled: true, frequency: "normal" });

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;

export function getNaturalSettings(map) {
  const d = map.ext?.data?.naturalEvents ?? {};
  return { enabled: d.enabled !== false, frequency: FREQUENCIES[d.frequency] ? d.frequency : DEFAULT_NATURAL.frequency };
}

export function planSetNaturalSettings(map, patch) {
  const cur = getNaturalSettings(map);
  const next = { enabled: patch.enabled ?? cur.enabled, frequency: patch.frequency ?? cur.frequency };
  if (!FREQUENCIES[next.frequency]) throw new Error("頻度は まれ・ふつう・多い から選んでください");
  if (next.enabled === cur.enabled && next.frequency === cur.frequency && map.ext?.data?.naturalEvents) return null;
  const before = map.ext?.data?.naturalEvents;
  return makeCommand(`自然発生イベント: ${next.enabled ? `オン（${FREQUENCIES[next.frequency].label}）` : "オフ"}`, [], [{
    apply: (m) => { ensureExt(m).data.naturalEvents = { enabled: !!next.enabled, frequency: next.frequency }; },
    revert: (m) => { const ext = ensureExt(m); if (before) ext.data.naturalEvents = before; else delete ext.data.naturalEvents; },
  }]);
}

/** 国ごとの1年あたりの基本確率（頻度「ふつう」のとき）。頻度の倍率は factor で掛ける */
export const BASE_RATE = Object.freeze({ plague: 0.012, rebellion: 0.025, independence: 0.012, schism: 0.008 });
/** 民意が低いときの反乱の上乗せの上限（これが無いと、民意が0に近い国で毎年のように反乱が起きる） */
export const REBELLION_BOOST_MAX = 2.5;

const supportOf = (s) => (typeof s.support === "number" ? s.support : 70);
const popOf = (s) => (s.rural ?? 0) + (s.urban ?? 0);

function provincesOf(map, stateId) { return map.pack.provinces.filter((p) => isLive(p) && p.state === stateId); }

/** 独立できる属州（首都を含まない・都市がある・元の国に領土が残る）。最も首都から遠いものを選ぶ */
export function independenceCandidate(map, stateId) {
  const st = map.pack.states[stateId]; if (!isLive(st)) return null;
  const provs = provincesOf(map, stateId); if (provs.length < 2) return null;
  const c = map.pack.cells, cap = map.pack.burgs[st.capital], P = map.geometry?.pack?.p;
  const capPt = cap && P ? P[cap.cell] : null;
  const cellsOf = new Map(provs.map((p) => [p.i, []]));
  for (let i = 0; i < c.province.length; i++) if (cellsOf.has(c.province[i]) && c.state[i] === stateId) cellsOf.get(c.province[i]).push(i);
  let best = null;
  for (const p of provs) {
    const cells = cellsOf.get(p.i); if (!cells.length) continue;
    if (cap && cells.includes(cap.cell)) continue;
    const hasBurg = cells.some((i) => { const b = map.pack.burgs[c.burg[i]]; return b && !b.removed && b.i > 0; });
    if (!hasBurg) continue;
    const mid = P ? P[cells[Math.floor(cells.length / 2)]] : [0, 0];
    const dist = capPt ? Math.hypot(mid[0] - capPt[0], mid[1] - capPt[1]) : 0;
    if (!best || dist > best.dist) best = { provinceId: p.i, dist };
  }
  return best;
}

/** 分派する宗教の領土：その宗教が最も広がっている属州の、その宗教のセル（3セル以上・元に1セル以上残る） */
export function schismCandidate(map, religionId) {
  const c = map.pack.cells, byProv = new Map(); let total = 0;
  for (let i = 0; i < c.religion.length; i++) if (c.religion[i] === religionId && c.biome[i] !== 0) { total++; const p = c.province[i]; if (p > 0) { if (!byProv.has(p)) byProv.set(p, []); byProv.get(p).push(i); } }
  let best = null;
  for (const [p, cells] of byProv) if (isLive(map.pack.provinces[p]) && (!best || cells.length > best.cells.length)) best = { provinceId: p, stateId: map.pack.provinces[p].state, cells };
  return best && best.cells.length >= 3 && total - best.cells.length >= 1 ? best : null;
}

/**
 * この年に起きる出来事を決める。地図は変更しない。
 * @returns {{kind:"plague"|"rebellion"|"independence"|"schism", ...}[]}
 */
export function rollNaturalEvents(map, rnd, settings = null) {
  const cfg = settings ?? getNaturalSettings(map);
  if (!cfg.enabled) return [];
  const f = FREQUENCIES[cfg.frequency]?.factor ?? 1;
  const out = [];
  const states = map.pack.states.filter(isLive);
  const totalPop = states.reduce((n, s) => n + popOf(s), 0) || 1;
  for (const s of states) {
    const sup = supportOf(s);
    // 疫病：人口が多い国ほど、また都市が大きい国ほど、広がりやすい
    const urbanShare = popOf(s) ? (s.urban ?? 0) / popOf(s) : 0;
    const pPlague = BASE_RATE.plague * f * (0.5 + 1.5 * (popOf(s) / totalPop) * states.length / Math.max(1, states.length)) * (0.7 + urbanShare);
    if (rnd.next() < pPlague) out.push({ kind: "plague", stateId: s.i, ruralLoss: r1(0.03 + rnd.next() * 0.07), urbanLoss: r1(0.05 + rnd.next() * 0.09) });
    // 反乱：民意が低い国で起きる
    if (sup < 45 && rnd.next() < BASE_RATE.rebellion * f * Math.min(REBELLION_BOOST_MAX, 1 + (45 - sup) / 15)) out.push({ kind: "rebellion", stateId: s.i, supportDrop: Math.round(6 + rnd.next() * 8) });
    // 独立：民意が低く、属州が複数ある国で、遠い属州が独立する
    // 民意が低いほど、話し合いではなく武力で割れる（内戦になる）ことが多い。分かれるのは、首都から遠い属州をいくつか
    if (sup < 55 && rnd.next() < BASE_RATE.independence * f * (1 + (55 - sup) / 20)) {
      const provs = pickBreakawayProvinces(map, s.i, rnd);
      if (provs.length) out.push({ kind: "independence", stateId: s.i, provinceId: provs[0], provinceIds: provs, civil: rnd.next() < Math.min(0.9, 0.55 + (55 - sup) / 100) });
    }
  }
  for (const r of map.pack.religions) {
    if (!isLive(r)) continue;
    if (rnd.next() < BASE_RATE.schism * f) { const cand = schismCandidate(map, r.i); if (cand) out.push({ kind: "schism", religionId: r.i, provinceId: cand.provinceId, stateId: cand.stateId, cells: cand.cells }); }
  }
  return out;
}

const nameOf = (e) => e?.fullName ?? e?.name ?? "";
const capitalCell = (map, st) => { const b = map.pack.burgs[st.capital]; return b && !b.removed ? b.cell : undefined; };

/**
 * 疫病：国の農村・都市の人口が減る。
 * セルごとの人口（pop）と都市の人口も同じ割合で減らし、国・属州・宗教の集計（rural/urban）も合わせて減らす。
 * こうしておくと、整合性の検査（集計とセル合計の一致）が崩れない。
 */
export function planPlague(map, { stateId, ruralLoss, urbanLoss }, date) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const c = map.pack.cells, r3 = (v) => Math.round(v * 1000) / 1000;
  const cut = { province: new Map(), religion: new Map() }; // 属州・宗教ごとの減った人口 { rural, urban }
  const addCut = (kind, id, field, d) => { if (!id || !(d > 0)) return; const m = cut[kind]; const e = m.get(id) ?? { rural: 0, urban: 0 }; e[field] += d; m.set(id, e); };

  const popChanges = [];
  for (let i = 0; i < c.state.length; i++) {
    if (c.state[i] !== stateId || !(c.pop[i] > 0)) continue;
    const after = r3(c.pop[i] * (1 - ruralLoss)), d = c.pop[i] - after;
    popChanges.push([i, c.pop[i], after]);
    addCut("province", c.province[i], "rural", d); addCut("religion", c.religion[i], "rural", d);
  }
  const parts = [setIndexed((m) => m.pack.cells.pop, popChanges)];
  parts.push(setProps(st, { rural: r3((st.rural ?? 0) * (1 - ruralLoss)), urban: r3((st.urban ?? 0) * (1 - urbanLoss)), support: clamp(supportOf(st) - 4, 0, 100) }));
  for (const b of map.pack.burgs) {
    if (!b || b.removed || !(b.i > 0) || b.state !== stateId || typeof b.population !== "number") continue;
    const after = r3(b.population * (1 - urbanLoss)), d = b.population - after;
    parts.push(setProps(b, { population: after }));
    addCut("province", c.province[b.cell], "urban", d); addCut("religion", c.religion[b.cell], "urban", d);
  }
  for (const [kind, list] of [["province", map.pack.provinces], ["religion", map.pack.religions]]) {
    for (const [id, d] of cut[kind]) {
      const e = list[id]; if (!isLive(e)) continue;
      const patch = {};
      if (typeof e.rural === "number" && d.rural) patch.rural = r3(Math.max(0, e.rural - d.rural));
      if (typeof e.urban === "number" && d.urban) patch.urban = r3(Math.max(0, e.urban - d.urban));
      if (Object.keys(patch).length) parts.push(setProps(e, patch));
    }
  }
  const cmd = makeCommand(`疫病（${nameOf(st)}）`, ["politics"], parts);
  return withEvent(map, cmd, { type: "plague", title: `疫病が${nameOf(st)}で流行した`, detail: `農村人口 −${Math.round(ruralLoss * 100)}% / 都市人口 −${Math.round(urbanLoss * 100)}%`, date, states: [stateId], cell: capitalCell(map, st) });
}

/** 反乱：国の民意が下がり、軍の士気も落ちる */
export function planRebellion(map, { stateId, supportDrop }, date) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const before = supportOf(st), after = clamp(before - supportDrop, 0, 100);
  const cmd = makeCommand(`反乱（${nameOf(st)}）`, ["politics"], [setProps(st, { support: after, morale: clamp((typeof st.morale === "number" ? st.morale : 70) - supportDrop, 0, 100) })]);
  return withEvent(map, cmd, { type: "rebellion", title: `${nameOf(st)}で反乱が起きた`, detail: `民意 ${Math.round(before)} → ${Math.round(after)}`, date, states: [stateId], cell: capitalCell(map, st) });
}
