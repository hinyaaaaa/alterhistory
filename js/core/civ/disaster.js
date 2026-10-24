// V5-M11: 気候と自然災害。災害 → 食料（収容力）・人口 → 集団の緊張・国家の安定 → 国家AIの対応（救済・備蓄）→ 記憶として残り、後の政策に影響する。
//   気候 civ.climate: 長周期の振動（寒冷期・平常・温暖期）。phase が変わると climate_shift（事実のイベント）。地形そのものは変えない（火山の降灰は一時的な収容力の低下として表す）。
//   災害 civ.disasters[disaster_…]: 干ばつ（長い）・洪水（短い）・噴火（即時の被害＋降灰）。地理（川・海岸・乾燥した生態系・火山）に応じて場所が決まる。
//   記憶 st.memory.disaster: 国家が受けた災害の重み（半減期 120 年）。AI の備蓄・救済の評価に入る（actions.js）。
import { makeEvent } from "./events.js";
import { hashSeed } from "./civ-state.js";
import { spatialOf } from "./spatial.js";
import { territoryOf, bestTargets, spawnGroup, addProposal, POP } from "./population.js";
import { BIOMES, LAND_WATER } from "./world-consts.js";
import { recentEventsFor, asCauses } from "./graph.js";

export const KIND_JA = Object.freeze({ drought: "干ばつ", flood: "洪水", volcano: "噴火" });
export const CLIMATE_JA = Object.freeze({ cool: "寒冷期", normal: "平常", warm: "温暖期" });
const HALF_LIFE = 1440, RATE = 0.02;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const r3 = (x) => Math.round(x * 1000) / 1000;
/** 気候指数（-1〜1）。historySeed と月だけで決まる（保存不要）。長周期（約300年）と超長周期（約900年）の重ね合わせ */
export function climateIndex(civ, mi) { const h = hashSeed(civ.historySeed, "climate"), a = ((h % 1000) / 1000) * 2 * Math.PI; return 0.62 * Math.sin((2 * Math.PI * mi) / 3600 + a) + 0.38 * Math.sin((2 * Math.PI * mi) / 11000 + 2 * a); }
const phaseOf = (i) => (i > 0.35 ? "warm" : i < -0.35 ? "cool" : "normal");
/** 気候の成長への影響（寒冷期は食料が減る） */
export const climateGrowth = (civ) => (civ.climate.phase === "cool" ? 0.97 : civ.climate.phase === "warm" ? 1.01 : 1);

/** climate フェーズ */
export function stepClimate(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex, idx = climateIndex(civ, mi), ph = phaseOf(idx); civ.climate.index = r3(idx);
  if (ph !== civ.climate.phase) { const old = civ.climate.phase; civ.climate.phase = ph; civ.climate.since = mi; if (mi > 12) makeEvent(civ, ids, { kind: "climate_shift", title: `気候が${CLIMATE_JA[old]}から${CLIMATE_JA[ph]}へ移った`, participants: [], location: null, effects: [{ targetId: "world", property: "climate.phase", before: old, after: ph }] }); }
}
/** 国家の災害の記憶（0〜）。半減期 120 年で薄れる */
export function disasterMemory(civ, st) { const m = st.memory?.disaster; if (!m) return 0; let s = 0; for (const k in m) s += m[k].w * Math.pow(0.5, (civ.monthIndex - m[k].at) / HALF_LIFE); return s; }
function remember(civ, st, kind, sev) { const m = ((st.memory ??= {}).disaster ??= {}), cur = m[kind] ? m[kind].w * Math.pow(0.5, (civ.monthIndex - m[kind].at) / HALF_LIFE) : 0; m[kind] = { w: r3(cur + sev), at: civ.monthIndex }; }
const WEIGHT = {
  flood: (w, c) => (w.cell.river[c] ? 2 : w.cell.coastDist[c] <= 1 ? 1 : 0.15),
  drought: (w, c, ph) => { const b = w.cell.biome[c]; return ((b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.TROPICAL_SEASONAL || b === BIOMES.COLD_DESERT) ? 2 : 0.7) * (ph === "warm" ? 1.5 : ph === "cool" ? 0.8 : 1); },
  volcano: (w, c) => { const m = w.mesh; let v = w.cell.volcanic[c] > 0.3 ? 3 : 0; if (!v) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (w.cell.volcanic[m.neighborIds[k]] > 0.3) { v = 1; break; } return v; },
};
const pickKind = (w, c, ph, rng) => { const ws = Object.keys(WEIGHT).map((k) => [k, WEIGHT[k](w, c, ph)]), t = ws.reduce((s, x) => s + x[1], 0); if (t <= 0) return null; let r = rng() * t; for (const [k, x] of ws) { r -= x; if (r <= 0) return k; } return ws[0][0]; };
const resist = (civ, g) => { const st = g.stateId ? civ.states[g.stateId] : null; return 1 - 0.6 * (st?.resilience ?? 0); }; // 備蓄の国は被害が小さい

/** disaster フェーズ: 災害の発生（月に1回、集団の位置を無作為に選び、その土地の地理で種類を決める）と、継続中の災害の効果・終了 */
export function stepDisaster(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex, rate = (civ.options.disasterRate ?? 1) * RATE;
  if (rng() < rate) { const gl = Object.keys(civ.groups); if (gl.length) { const g = civ.groups[gl[Math.floor(rng() * gl.length)]], kind = pickKind(world, g.cell, civ.climate.phase, rng); if (kind) strike(ctx, g, kind); } }
  for (const id in civ.disasters) { const d = civ.disasters[id]; if (d.ended) continue;
    if (d.kind === "drought" && mi > d.startedAt) for (const gid of d.groupIds) { const g = civ.groups[gid]; if (g) g.pop = Math.max(5, g.pop * (1 - 0.003 * d.severity * resist(civ, g))); }
    if (mi >= d.endsAt) { d.ended = true; makeEvent(civ, ids, { kind: "disaster_ended", title: `${KIND_JA[d.kind]}が収まった`, participants: [{ entityId: id, role: "disaster" }], location: { cell: d.center }, causes: [{ targetId: d.eventId, relation: "part_of", basis: "direct" }] }); }
  }
  if (mi % 120 === 0) for (const id in civ.disasters) if (civ.disasters[id].ended && mi - civ.disasters[id].endsAt > 1200 && !civ.disasters[id].archived) civ.disasters[id].archived = true; // 古い災害は「歴史」へ（記録は残る）
}
export const strikeDisaster = (ctx, g, kind) => strike(ctx, g, kind);
function strike(ctx, g0, kind) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex, sev = r3(0.3 + 0.7 * rng()), { terr } = spatialOf(ctx);
  const cells = new Set(territoryOf(world, g0.cell)); if (kind === "drought") { const m = world.mesh; for (const c of [...cells]) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (world.cell.landWater[m.neighborIds[k]] === LAND_WATER.LAND) cells.add(m.neighborIds[k]); }
  const hit = new Set(); for (const c of cells) for (const gid of terr.get(c) ?? []) hit.add(gid); hit.add(g0.id);
  const months = kind === "drought" ? 12 + Math.floor(rng() * 36) : kind === "volcano" ? 12 + Math.floor(rng() * 24) : 1 + Math.floor(rng() * 2), id = ids.next("disaster");
  const d = civ.disasters[id] = { id, kind, startedAt: mi, endsAt: mi + months, center: g0.cell, cells: [...cells].slice(0, 12), severity: sev, groupIds: [...hit].sort(), eventId: null, ended: false, deaths: 0 };
  const effects = [], states = new Set(); let dead = 0;
  for (const gid of d.groupIds) { const g = civ.groups[gid]; if (!g) continue; const res = resist(civ, g), before = Math.round(g.pop);
    if (kind === "flood") g.pop = Math.max(5, g.pop * (1 - 0.08 * sev * res)); else if (kind === "volcano") g.pop = Math.max(5, g.pop * (1 - 0.15 * sev * res));
    if (kind !== "flood") { g.capMult = r3(clamp(1 - (kind === "drought" ? 0.45 : 0.35) * sev * res, 0.3, 1)); g.capUntil = mi + months + (kind === "volcano" ? 12 : 6); } // 食料（収容力）の低下。ここから飢え・不満・分派が因果として連なる
    dead += Math.max(0, before - g.pop); { const dc = g.cohorts.reduce((b, c) => (c.share > b.share ? c : b)); dc.tension = clamp(dc.tension + 0.05 * sev * res); }
    effects.push({ targetId: gid, property: "pop", before, after: Math.round(g.pop) }); if (g.stateId) states.add(g.stateId);
  }
  d.deaths = Math.round(dead);
  for (const sid of states) { const st = civ.states[sid]; if (!st?.alive) continue; const b = st.stability; st.stability = Math.max(0, st.stability - 0.03 * sev * (1 - 0.6 * (st.resilience ?? 0))); remember(civ, st, kind, sev); effects.push({ targetId: sid, property: "stability", before: r3(b), after: r3(st.stability) }); }
  const ev = makeEvent(civ, ids, { kind: "disaster_struck", title: `${KIND_JA[kind]}（規模 ${Math.round(sev * 100)}）が起きた`, participants: [{ entityId: id, role: "disaster" }, ...d.groupIds.slice(0, 8).map((x) => ({ entityId: x, role: "affected" })), ...[...states].slice(0, 4).map((x) => ({ entityId: x, role: "state" }))], location: { cell: g0.cell }, causes: [{ targetId: "world", relation: "enabled_by", basis: "plausible" }].filter(() => false).concat(civ.climate.phase !== "normal" ? [] : []), effects });
  d.eventId = ev.eventId;
  // 避難・移住: 規模の大きい災害で、最も人口の多い NPC 集団が1つだけ分かれることがある（プレイヤー集団は『提案』。連鎖的な増殖を避けるため上限1）
  if (sev >= 0.6) { const occ = spatialOf(ctx).terr, g = d.groupIds.map((x) => civ.groups[x]).filter((x) => x && !x.order && x.pop >= POP.minBudPop * 3).sort((a, b) => b.pop - a.pop)[0]; if (g) { const t = bestTargets(world, civ, g, occ, 3); if (t.length) { if (g.player) addProposal(civ, ids, g, "split", { targets: t }); else if (rng() < 0.3) { const moved = Math.round(g.pop * POP.budShare); g.pop -= moved; g.lastBudAt = mi; const child = spawnGroup(civ, ids, g, t[0].cell, moved); occ.set(t[0].cell, [child.id]); makeEvent(civ, ids, { kind: "group_split", title: "災害を逃れて集団が分かれた", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t[0].cell }, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] }); } } } }
  return d;
}
/** 国家が直近 months か月に受けた災害（救済・備蓄の評価に使う） */
export function recentDisasterLoad(civ, st, months = 24) { let s = 0; for (const id in civ.disasters) { const d = civ.disasters[id]; if (civ.monthIndex - d.endsAt > months) continue; for (const gid of d.groupIds) if (civ.groups[gid]?.stateId === st.id) { s += d.severity; break; } } return Math.min(1, s); }
