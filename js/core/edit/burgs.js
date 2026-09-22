// 都市：追加・移動・削除・首都の変更。
//
// 公式 generators/burgs-generator.ts の Burgs.add を参考にしたが、そのままは移植していない。
// 公式の人口計算は「居住適性(cells.s)」「道路の連結度」など生成システム全体に依存する値を使い、
// それらは今回パースしていない(docs/MAP_FORMAT_SPEC.md の「原文保持」対象)。
// そのため人口は「近隣の都市」からの単純な推定値とし、その旨をUIで示す（見積もりであり確定値ではない）。
//
// 削除の規則（公式 controllers/burg-editor.ts の removeSelectedBurg と同じ）:
//   ・首都は削除できない（先に他の都市を首都にする）
//   ・市場の中心都市は削除できない（今回は市場の編集は未対応なので、常にこのチェックのみ適用）
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setList, setProps, setIndexed } from "./commands.js";
import { removeLegacyNotesPart } from "./notes.js";
import { removeAttributesPart } from "./attributes.js";
import { cellIndexOf } from "../spatial.js";

const isLive = (b) => !!b && typeof b === "object" && !b.removed && b.i > 0;
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const liveList = (arr) => arr.filter(isLive);

/** 新しい都市の人口の見積もり（近隣の都市の人口の中央値に、ばらつきを掛けた値） */
export function estimatePopulation(map, cell, rnd) {
  const idx = cellIndexOf(map);
  const near = idx.findWithin(map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1], map.grid.spacing * 6)
    .map((i) => map.pack.cells.burg[i]).filter((id) => id > 0).map((id) => map.pack.burgs[id]).filter(isLive);
  const base = near.length
    ? near.map((b) => b.population).sort((a, b) => a - b)[near.length >> 1]
    : Math.max(0.05, (map.pack.cells.pop[cell] ?? 1) * 0.25);
  const jitter = rnd ? rnd.float(0.6, 1.4) : 1;
  return Math.max(0.01, Math.round(base * jitter * 1000) / 1000);
}

/**
 * 都市を追加する。
 * @param {{cell:number, name:string, capital?:boolean, port?:boolean, rnd?:object}} opts
 */
export function planAddBurg(map, { cell, name, capital = false, rnd }) {
  const c = map.pack.cells;
  if (cell < 0 || cell >= c.biome.length) throw new Error("地図の外には都市を置けません");
  if (c.biome[cell] === 0) throw new Error("水域には都市を置けません");
  if (c.burg[cell]) throw new Error("このセルには既に都市があります");
  if (!name || !name.trim()) throw new Error("都市の名前を入力してください");

  const { p } = map.geometry.pack;
  const id = map.pack.burgs.length || 1; // 0番は「都市なし」のための空要素
  const state = c.state[cell], culture = c.culture[cell];
  const burg = {
    cell, x: p[cell][0], y: p[cell][1], i: id, state, culture, name: name.trim(),
    feature: c.biome[cell] === 0 ? 0 : map.grid.f[map.geometry.pack.g[cell]],
    capital: 0, population: estimatePopulation(map, cell, rnd),
    type: "Generic", group: "town",
  };
  const burgs = map.pack.burgs.length ? map.pack.burgs.slice() : [null];
  burgs[id] = burg;

  const parts = [
    setList((m) => m.pack.burgs, (m, v) => { m.pack.burgs = v; }, burgs),
    setIndexed((m) => m.pack.cells.burg, [[cell, 0, id]]),
  ];
  const state1 = map.pack.states[state];
  if (state1) {
    const patch = {};
    if (typeof state1.burgs === "number") patch.burgs = state1.burgs + 1;
    if (typeof state1.urban === "number") patch.urban = round6(state1.urban + burg.population);
    if (Object.keys(patch).length) parts.push(setProps(state1, patch));
  }
  const province1 = map.pack.provinces[c.province[cell]];
  if (province1 && typeof province1.urban === "number" && Array.isArray(province1.burgs)) {
    parts.push(setProps(province1, { urban: round6(province1.urban + burg.population), burgs: [...province1.burgs, id] }));
  }
  const religion1 = map.pack.religions[c.religion[cell]];
  if (religion1 && typeof religion1.urban === "number") parts.push(setProps(religion1, { urban: round6(religion1.urban + burg.population) }));

  if (capital && state1) {
    const oldCapital = map.pack.burgs[state1.capital];
    if (isLive(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
    parts.push({ apply: (m) => { m.pack.burgs[id].capital = 1; }, revert: (m) => { m.pack.burgs[id].capital = 0; } });
    parts.push(setProps(state1, { capital: id, center: cell }));
  }
  return { command: makeCommand("都市を追加", ["places"], parts), id };
}

/** 都市を移動する（別のセルへ。国家・文化はそのセルのものに更新される） */
export function planMoveBurg(map, id, cell) {
  const burg = map.pack.burgs[id];
  if (!isLive(burg)) throw new Error("その都市は存在しません");
  const c = map.pack.cells;
  if (burg.cell === cell) return null;
  if (cell < 0 || cell >= c.biome.length) throw new Error("地図の外には移動できません");
  if (c.biome[cell] === 0) throw new Error("水域には移動できません");
  if (c.burg[cell]) throw new Error("移動先には既に都市があります");
  // 首都は、移動先が自国の土地でなければ動かせない（他国へ連れ去られてしまうため）
  const state0 = map.pack.states[burg.state];
  if (burg.capital && state0 && c.state[cell] !== burg.state) throw new Error("首都は自国の土地の中でのみ移動できます");

  const { p } = map.geometry.pack;
  const fromState = map.pack.states[burg.state], toState = map.pack.states[c.state[cell]];
  const fromProvince = map.pack.provinces[c.province[burg.cell]], toProvince = map.pack.provinces[c.province[cell]];
  const fromReligion = map.pack.religions[c.religion[burg.cell]], toReligion = map.pack.religions[c.religion[cell]];
  const parts = [
    setIndexed((m) => m.pack.cells.burg, [[burg.cell, id, 0], [cell, 0, id]]),
    setProps(burg, { cell, x: p[cell][0], y: p[cell][1], state: c.state[cell], culture: c.culture[cell] }),
  ];
  if (fromState !== toState) {
    if (fromState) {
      const patch = {};
      if (typeof fromState.burgs === "number") patch.burgs = Math.max(0, fromState.burgs - 1);
      if (typeof fromState.urban === "number") patch.urban = round6(Math.max(0, fromState.urban - burg.population));
      if (Object.keys(patch).length) parts.push(setProps(fromState, patch));
    }
    if (toState) {
      const patch = {};
      if (typeof toState.burgs === "number") patch.burgs = toState.burgs + 1;
      if (typeof toState.urban === "number") patch.urban = round6(toState.urban + burg.population);
      if (Object.keys(patch).length) parts.push(setProps(toState, patch));
    }
  }
  if (fromProvince !== toProvince) {
    if (fromProvince && typeof fromProvince.urban === "number") parts.push(setProps(fromProvince, { urban: round6(Math.max(0, fromProvince.urban - burg.population)), ...(Array.isArray(fromProvince.burgs) ? { burgs: fromProvince.burgs.filter((b) => b !== id) } : {}) }));
    if (toProvince && typeof toProvince.urban === "number") parts.push(setProps(toProvince, { urban: round6(toProvince.urban + burg.population), ...(Array.isArray(toProvince.burgs) ? { burgs: [...toProvince.burgs, id] } : {}) }));
  }
  if (fromReligion !== toReligion) {
    if (fromReligion && typeof fromReligion.urban === "number") parts.push(setProps(fromReligion, { urban: round6(Math.max(0, fromReligion.urban - burg.population)) }));
    if (toReligion && typeof toReligion.urban === "number") parts.push(setProps(toReligion, { urban: round6(toReligion.urban + burg.population) }));
  }
  // 首都を動かした場合、国家の中心セルも一緒に動かす（公式の「首都=国の中心」の前提を保つ）
  const state = map.pack.states[burg.state];
  if (burg.capital && state && state.capital === id) parts.push(setProps(state, { center: cell }));
  return makeCommand("都市を移動", ["places"], parts);
}

/** 都市の名前を変える */
export function planRenameBurg(map, id, name) {
  const burg = map.pack.burgs[id];
  if (!isLive(burg)) throw new Error("その都市は存在しません");
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("都市の名前を入力してください");
  if (trimmed === burg.name) return null;
  return makeCommand("都市の名前を変更", ["places"], [setProps(burg, { name: trimmed })]);
}

/** 都市を削除できない理由。削除できるなら null */
export function whyCannotRemoveBurg(map, id) {
  const burg = map.pack.burgs[id];
  if (!isLive(burg)) return "その都市は存在しません";
  if (burg.capital) return "首都は削除できません。先に別の都市を首都にしてください";
  if (map.markets?.some((m) => m.centerBurgId === id)) return "市場の中心都市は削除できません";
  return null;
}

export function planRemoveBurg(map, id) {
  const reason = whyCannotRemoveBurg(map, id);
  if (reason) throw new Error(reason);
  const burg = map.pack.burgs[id];
  const c = map.pack.cells;
  const parts = [setIndexed((m) => m.pack.cells.burg, [[burg.cell, id, 0]]), setProps(burg, { removed: true })];
  const state = map.pack.states[burg.state];
  if (state) {
    const patch = {};
    if (typeof state.burgs === "number") patch.burgs = Math.max(0, state.burgs - 1);
    if (typeof state.urban === "number") patch.urban = round6(Math.max(0, state.urban - burg.population));
    if (Object.keys(patch).length) parts.push(setProps(state, patch));
  }
  const province = map.pack.provinces[c.province[burg.cell]];
  if (province && typeof province.urban === "number") {
    parts.push(setProps(province, { urban: round6(Math.max(0, province.urban - burg.population)),
      ...(Array.isArray(province.burgs) ? { burgs: province.burgs.filter((b) => b !== id) } : {}) }));
  }
  const religion = map.pack.religions[c.religion[burg.cell]];
  if (religion && typeof religion.urban === "number") parts.push(setProps(religion, { urban: round6(Math.max(0, religion.urban - burg.population)) }));
  const notePart = removeLegacyNotesPart(map, "burg", id);
  if (notePart) parts.push(notePart);
  const attrPart = removeAttributesPart(map, "burg", id);
  if (attrPart) parts.push(attrPart);
  return makeCommand("都市を削除", ["places"], parts);
}

/** 首都を変更する。元の首都は普通の都市に戻る */
export function planSetCapital(map, stateId, burgId) {
  const state = map.pack.states[stateId];
  if (!state || !state.i) throw new Error("その国家は存在しません");
  const burg = map.pack.burgs[burgId];
  if (!isLive(burg)) throw new Error("その都市は存在しません");
  if (burg.state !== stateId) throw new Error("首都は自国内の都市にしてください");
  if (state.capital === burgId) return null;

  const parts = [];
  const oldCapital = map.pack.burgs[state.capital];
  if (isLive(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
  parts.push(setProps(burg, { capital: 1 }), setProps(state, { capital: burgId, center: burg.cell }));
  return makeCommand("首都を変更", ["places"], parts);
}

export { liveList as liveBurgs };
