// v5 M0/M1: 文明層の状態（人口集団・集落・イベント・提案）。.ahmap v2 の拡張チャンク `civ.state`（JSON）に保存する。
// 依存: 球面世界（core/world）の配列を読むだけ。旧エディタ（core/model）は知らない。
import { createIdGen } from "./ids.js";
import { monthIndex, fromMonthIndex } from "./tick.js";
import { makeNameJa, createCulture, createLanguage } from "./culture.js";
export const CIV_STATE_VERSION = 2; // 2: 国家・文化・技術・戦争・AI判断記録を追加（1 から自動移行）
export const CIV_CHUNK = "civ.state";

/** 歴史の乱数（地理の決定性とは別。historySeed を保存すれば再現できるが、既定は新しい乱数） */
export function hashSeed(...parts) { let h = 2166136261 >>> 0; for (const p of parts) { const s = String(p); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 0xff; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * 世界の初期集団（entities.populations）から文明状態を作る。選んだ開始集団だけがプレイヤー（player: true）。
 * 他の初期集団は NPC として自律的に動く。国家はまだ無い（国家は歴史の中で成立する。M2）。
 */
export function createCivState(world, { startGroupId, historySeed = null, year = 0, month = 1 } = {}) {
  const civ = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(world.spec.worldSeed, "history", Date.now(), Math.random()), seq: {}, date: { year, month }, monthIndex: monthIndex(year, month), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
  const ids = createIdGen(civ.seq), nameRng = rngOf(hashSeed(civ.historySeed, "names"));
  for (const p of world.entities.populations) {
    const id = ids.next("pop");
    civ.groups[id] = newGroup(id, { cell: p.cell, pop: p.size, subsistence: p.subsistence ?? "forage", species: p.species ?? "human", origin: p.id, bornAt: civ.monthIndex });
    const cu = createCulture(civ, ids, nameRng, { cell: p.cell }), lg = createLanguage(civ, ids, nameRng, { cultureId: cu });
    civ.groups[id].cohorts = [{ cultureId: cu, languageId: lg, religionId: null, speciesId: p.species ?? "human", share: 1, tension: 0, interest: null }];
    for (const k of ["stone_tools"]) civ.groups[id].tech.known[k] = civ.monthIndex; // 最初から持つ技術
    if (p.id === startGroupId) { civ.groups[id].player = true; civ.player.groupId = id; }
  }
  if (startGroupId != null && !civ.player.groupId) throw new Error(`開始集団 ${startGroupId} は世界に存在しない`);
  return civ;
}
/** v2 の層（国家・文化・技術・戦争・外交・AI判断）。v1 から読むときもこの形で補う */
export function emptyLayers() { return { states: {}, cultures: {}, languages: {}, religions: {}, contacts: {}, techWorld: {}, wars: {}, treaties: {}, activeWarIds: [], activeTreatyIds: [], decisions: [], dict: { reasons: [] }, options: { aiInterval: 6 } }; }
export function newGroup(id, { cell, pop, subsistence = "forage", species = "human", origin = null, bornAt = 0, knowledge = null, parent = null }) {
  return { id, speciesId: species, cell, pop, subsistence, player: false, origin, parent, bornAt, settledMonths: 0, lastBudAt: bornAt, famineAt: -999, stateId: null, pressure: 0, cohorts: [], tech: { known: {}, prog: {}, lost: {} }, knowledge: knowledge ? { ...knowledge } : { agriculture: 0, seafaring: 0, herding: 0 }, order: null, settlementId: null, cells: null };
}
export const setDate = (civ, mi) => { civ.monthIndex = mi; civ.date = fromMonthIndex(mi); };
export const sortedGroupIds = (civ) => Object.keys(civ.groups).sort();

export const encodeCiv = (civ) => new TextEncoder().encode(JSON.stringify(civ));
export function decodeCiv(bytes) {
  const civ = JSON.parse(new TextDecoder().decode(bytes));
  if (!civ || typeof civ.version !== "number") throw new Error("文明状態が壊れています");
  if (civ.version > CIV_STATE_VERSION) throw new Error(`新しすぎる文明状態の版です（${civ.version}）`);
  return migrateCiv(civ);
}

/** 古い版の文明状態を現行の形へ（情報は消さず、足りない層を空で補う）。v1 の集団は文化・言語を新しく与える */
export function migrateCiv(civ) {
  if (civ.version >= CIV_STATE_VERSION) return civ;
  const ids = createIdGen(civ.seq), rng = rngOf(hashSeed(civ.historySeed, "migrate-v1"));
  for (const k of Object.keys(emptyLayers())) if (civ[k] === undefined) civ[k] = emptyLayers()[k];
  for (const id of Object.keys(civ.groups).sort()) {
    const g = civ.groups[id]; g.stateId ??= null; g.pressure ??= 0; g.tech ??= { known: { stone_tools: civ.monthIndex }, prog: {}, lost: {} };
    if (g.knowledge.agriculture >= 1) g.tech.known.agriculture ??= civ.monthIndex; if (g.knowledge.herding >= 1) g.tech.known.pastoralism ??= civ.monthIndex; if (g.knowledge.seafaring >= 1) g.tech.known.seafaring ??= civ.monthIndex;
    if (!g.cohorts?.length) { const cu = createCulture(civ, ids, rng, { cell: g.cell }), lg = createLanguage(civ, ids, rng, { cultureId: cu }); g.cohorts = [{ cultureId: cu, languageId: lg, religionId: null, speciesId: g.speciesId, share: 1, tension: 0, interest: null }]; }
  }
  civ.version = CIV_STATE_VERSION; return civ;
}
export { makeNameJa };
