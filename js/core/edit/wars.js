// 戦争：宣戦布告から、戦闘の勝敗記録の蓄積、講和条約（割譲・賠償金）までを扱う。
//
// データ構造（ALTERHISTORY拡張データに保存。Azgaar形式には無い概念）:
//   ext.data.wars = [{
//     id, name, attackers:[stateId], defenders:[stateId],
//     startedAt: {year, month}, endedAt: {year, month}|null,
//     battles: [{ year, month, attackerState, defenderState, winner, ... }],  // 戦績の記録
//     advantage: { [stateId]: number },  // 講和候補の算出に使う「優勢度」の累積
//   }]
//
// 講和の割譲候補: 「防御側の領土のうち、攻撃側と隣接するセルを含む属州」を機械的に提示する
// （実際の占領地ではなく、あくまで候補の提示。最終的にユーザーが選ぶ）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setIndexed, setProps } from "./commands.js";
import { ensureExt } from "./attributes.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

export function listWars(map) {
  return map.ext?.data?.wars ?? [];
}
function nextWarId(map) {
  const list = listWars(map);
  return list.length ? Math.max(...list.map((w) => w.id)) + 1 : 1;
}
function writeWars(m, list) { const ext = ensureExt(m); ext.data.wars = list; if (!list.length) delete ext.data.wars; }

export function activeWars(map) {
  return listWars(map).filter((w) => !w.endedAt);
}
export function warsOf(map, stateId) {
  return listWars(map).filter((w) => w.attackers.includes(stateId) || w.defenders.includes(stateId));
}

/** 宣戦布告。attackers/defenders はそれぞれ1カ国以上 */
export function planDeclareWar(map, { name, attackers, defenders, date }) {
  const a = [...new Set(attackers)], d = [...new Set(defenders)];
  if (!a.length || !d.length) throw new Error("攻撃側・防御側とも1カ国以上必要です");
  for (const id of [...a, ...d]) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  if (a.some((id) => d.includes(id))) throw new Error("同じ国家が両陣営に入っています");
  const aNames = a.map((id) => map.pack.states[id].name), dNames = d.map((id) => map.pack.states[id].name);
  const war = {
    id: nextWarId(map), name: name || `${aNames[0]}対${dNames[0]}戦争`,
    attackers: a, defenders: d, startedAt: date, endedAt: null, battles: [], advantage: {},
  };
  const before = listWars(map);
  return { command: makeCommand(`宣戦布告（${war.name}）`, [], [{ apply: (m) => writeWars(m, [...before, war]), revert: (m) => writeWars(m, before) }]), id: war.id };
}

/** 戦闘結果を戦争記録に追記する（battle.js の planResolveBattle と組み合わせて呼ぶ） */
export function planRecordBattle(map, warId, { attackerState, defenderState, result, date }) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("終結した戦争には記録できません");
  const entry = { year: date.year, month: date.month, attackerState, defenderState, winner: result.winner, aPower: result.aPower, dPower: result.dPower };
  const advGain = result.winner === "attacker" ? 1 : -1;
  const before = list;
  const after = list.map((w) => w.id !== warId ? w : {
    ...w, battles: [...w.battles, entry],
    advantage: { ...w.advantage, [attackerState]: (w.advantage[attackerState] ?? 0) + advGain, [defenderState]: (w.advantage[defenderState] ?? 0) - advGain },
  });
  return makeCommand("戦績を記録", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) }]);
}

/**
 * 講和の割譲候補を機械的に算出する。
 * defenderId の領土のうち attackerId と隣接するセルを起点に、以下2種類の候補を作る:
 *   1. 属州単位: 前線セルが属する属州（属州は実データでは領土の一部にしか存在しないため）
 *   2. 未所属の前線: 属州の無い前線セルを、隣接する同条件のセルどうしでまとめた「地域」
 *      （フラッドフィルで連結成分を作る。深すぎる内陸までは広げず、前線から一定深さに留める）
 * どちらも「候補の提示」であり、実際に割譲するかはユーザーが選ぶ（planSignPeace）。
 */
export function suggestCessions(map, attackerId, defenderId, { maxDepth = 3 } = {}) {
  const c = map.pack.cells;
  const { cells: geomCells } = map.geometry.pack;
  const n = c.state.length;

  // 前線セル（防御側の領土で、攻撃側と直接隣接する）を起点に、maxDepth まで幅優先で広げる
  const depth = new Int16Array(n).fill(-1);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (c.state[i] !== defenderId || c.biome[i] === 0) continue;
    if (geomCells.c[i].some((j) => c.state[j] === attackerId)) { depth[i] = 0; queue.push(i); }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (depth[i] >= maxDepth) continue;
    for (const j of geomCells.c[i]) {
      if (c.state[j] === defenderId && c.biome[j] !== 0 && depth[j] < 0) { depth[j] = depth[i] + 1; queue.push(j); }
    }
  }
  const frontierCells = queue; // depth>=0 のセル全て

  // 1) 属州単位の候補
  const provinceCandidates = new Map();
  for (const i of frontierCells) {
    const pid = c.province[i];
    if (pid > 0) provinceCandidates.set(pid, (provinceCandidates.get(pid) ?? 0) + 1);
  }
  const byProvince = [...provinceCandidates.keys()].map((pid) => {
    const p = map.pack.provinces[pid];
    return { type: "province", provinceId: pid, name: p?.fullName ?? p?.name ?? `属州#${pid}`, cells: p?.cells ?? provinceCandidates.get(pid) };
  });

  // 2) 属州の無い前線セルを、連結成分ごとに「地域」としてまとめる
  const noProvince = new Set(frontierCells.filter((i) => c.province[i] === 0));
  const regions = [];
  const visited = new Set();
  for (const start of noProvince) {
    if (visited.has(start)) continue;
    const comp = [start]; visited.add(start);
    for (let h = 0; h < comp.length; h++) {
      for (const j of geomCells.c[comp[h]]) {
        if (noProvince.has(j) && !visited.has(j)) { visited.add(j); comp.push(j); }
      }
    }
    regions.push(comp);
  }
  const byRegion = regions.map((cells, idx) => ({ type: "region", regionCells: cells, name: `未編入地域${idx + 1}（${cells.length}セル）`, cells: cells.length }));

  return [...byProvince, ...byRegion].sort((a, b) => b.cells - a.cells);
}

/**
 * 講和条約を締結する。戦争を終結させ、選ばれた地域を攻撃側の代表国へ割譲し、賠償金（任意）を記録する。
 *
 * @param {{provinceIds?:number[], regionCells?:number[][], toStateId:number, reparations?:number}} terms
 *   provinceIds: suggestCessions の type="province" 候補（provinceId の配列）
 *   regionCells: suggestCessions の type="region" 候補（各候補の regionCells をそのまま渡す。配列の配列）
 */
export function planSignPeace(map, warId, terms, date) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("既に終結しています");
  if (!isLive(map.pack.states[terms.toStateId])) throw new Error("割譲先の国家が存在しません");

  const parts = [];
  const c = map.pack.cells;
  const moveCells = (cells) => {
    if (!cells.length) return;
    const changes = cells.map((i) => [i, c.state[i], terms.toStateId]);
    parts.push(setIndexed((m) => m.pack.cells.state, changes));
    for (const b of map.pack.burgs) {
      if (b && b.i && !b.removed && cells.includes(b.cell)) parts.push(setProps(b, { state: terms.toStateId }));
    }
  };
  for (const pid of terms.provinceIds ?? []) {
    // 属州は分割せず丸ごと移す（前線の一部だけが接している場合でも、属州全体が割譲対象になる）
    const cells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i);
    moveCells(cells);
    const province = map.pack.provinces[pid];
    if (province) parts.push(setProps(province, { state: terms.toStateId }));
  }
  for (const cells of terms.regionCells ?? []) moveCells(cells);
  if (terms.reparations) {
    // 賠償金は簡易的に産業力(industry)の一時的な移転として記録する（貨幣単位は持たないため）
    const from = map.pack.states[war.defenders.includes(terms.toStateId) ? war.attackers[0] : war.defenders[0]];
    if (from && typeof from.industry === "number") parts.push(setProps(from, { industry: Math.max(0, from.industry - terms.reparations) }));
  }
  const before = list;
  const after = list.map((w) => w.id !== warId ? w : { ...w, endedAt: date, terms });
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) });

  return makeCommand(`講和条約（${war.name}）`, ["politics"], parts);
}
