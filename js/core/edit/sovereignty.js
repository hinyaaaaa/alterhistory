// 属州の独立・国家の統合：Azgaarの「国家編集」にある独立・併合の操作をALTERHISTORY流に実装する。
//
// 独立（属州→新国家）:
//   属州の領土をまるごと切り離し、新しい国家として登録する。元の国家からはその分のセル・統計が
//   減る。属州の中心都市があれば、それを新国家の首都にする（無ければ無首都のまま）。
//   同盟・戦争など ext.data 側の関係は、独立した新国家を自動では組み込まない
//   （どの陣営に立つかはユーザーが外交タブで個別に設定する、という判断）。
//
// 統合（国家→国家）:
//   吸収される側(from)の全セルを、吸収する側(to)に一括で塗り替える。from は解散扱い（removed）にし、
//   首都だった都市は普通の都市に戻す。from の属州は to の属州として引き継ぐ（属州自体は消さない）。
//
// 統計（cells/area/rural/urban/burgs）は core/edit/paint.js と同じ考え方で、セル配列から
// 実測して差分更新する（保存値の絶対更新はしない。理由は paint.js のコメント参照）。
//
// どちらも、戦争・同盟と同様に ext.data.sovereigntyLog へ年月付きで記録する（年表用）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setIndexed, setProps, setList } from "./commands.js";
import { computePole } from "./pole.js";
import { cellAreas } from "../geometry.js";
import { ensureExt } from "./attributes.js";
import { defaultMarkerName } from "./markers.js";

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const isLiveState = (s) => isLive(s) && s.i > 0;
const liveBurg = (map, id) => { const b = id > 0 ? map.pack.burgs[id] : null; return isLive(b) && b.i ? b : null; };

function pickColor(existingCount, rnd) {
  const golden = 137.508;
  const hue = Math.round((existingCount * golden + (rnd ? rnd.float(0, 360) : 0)) % 360);
  const sat = 55 + (rnd ? Math.round(rnd.float(0, 15)) : 10);
  const light = 45 + (rnd ? Math.round(rnd.float(-10, 10)) : 0);
  const s = sat / 100, l = light / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function nearestCell(map, pole) {
  const { p } = map.geometry.pack;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < p.length; i++) {
    const d = (p[i][0] - pole[0]) ** 2 + (p[i][1] - pole[1]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** 年表用の構造化ログに1件追記するコマンド部品 */
function logEntry(map, entry) {
  const before = map.ext?.data?.sovereigntyLog ?? [];
  return {
    apply: (m) => { ensureExt(m).data.sovereigntyLog = [...before, entry]; },
    revert: (m) => { const ext = ensureExt(m); if (before.length) ext.data.sovereigntyLog = before; else delete ext.data.sovereigntyLog; },
  };
}

/** 出来事の目印として地図上にマーカーを立てるコマンド部品（独立・建国など） */
function addEventMarker(map, { cell, type, name }) {
  if (cell == null || cell < 0) return null;
  const { p } = map.geometry.pack;
  const id = Math.max(-1, ...map.markers.map((m) => m.i)) + 1;
  const icon = type === "founding" ? "👑" : "🏳️";
  const marker = { i: id, type, icon, x: p[cell][0], y: p[cell][1], cell, name: name || defaultMarkerName(type) };
  return setList((m) => m.markers, (m, v) => { m.markers = v; }, [...map.markers, marker]);
}

/** 年表用の構造化ログ（独立・統合）。新しい順ではなく記録順 */
export function listSovereigntyLog(map) {
  return map.ext?.data?.sovereigntyLog ?? [];
}

/**
 * 属州を独立させ、新しい国家として切り出す。
 * @param {object} map
 * @param {{provinceId:number, name:string, rnd?:object, date?:{year:number,month:number}}} opts
 * @returns {{command:object, id:number}} id は新しく作られた国家のID
 */
export function planDeclareIndependence(map, { provinceId, name, rnd, date }) {
  const province = map.pack.provinces[provinceId];
  if (!isLive(province) || !province.i) throw new Error("その属州は存在しません");
  const fromState = map.pack.states[province.state];
  if (!isLiveState(fromState)) throw new Error("属州の所属国家が存在しません");
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("新しい国家の名前を入力してください");

  const c = map.pack.cells;
  const cells = [];
  for (let i = 0; i < c.province.length; i++) if (c.province[i] === provinceId) cells.push(i);
  if (!cells.length) throw new Error("その属州にはセルがありません（独立させる領土がありません）");

  const areas = cellAreas(map.geometry);
  const newId = map.pack.states.length || 1;
  const liveCount = map.pack.states.filter(isLiveState).length;

  let rural = 0, area = 0, urban = 0;
  const burgIds = [];
  for (const i of cells) {
    rural += c.pop[i] ?? 0;
    area += areas[i];
    const b = liveBurg(map, c.burg[i]);
    if (b) { urban += b.population ?? 0; burgIds.push(b.i); }
  }

  const memberSet = new Set(cells);
  // 元の国家に領土が残らない独立は「独立」ではなく国家そのものの改名・統合になるので止める
  let remaining = 0;
  for (let i = 0; i < c.state.length; i++) if (c.state[i] === fromState.i && !memberSet.has(i)) remaining++;
  if (!remaining) throw new Error("この属州は国家の全領土なので独立させられません（国家名を変えるか、統合を使ってください）");

  // 新国家の首都: 属州の中心都市（属州内にあれば）、無ければ属州内で人口最大の都市。
  // 首都の無い国家は不正なデータになるため、都市が1つも無い属州は独立できない。
  const byPop = (a, b) => (b.population ?? 0) - (a.population ?? 0);
  const inProvince = burgIds.map((id) => map.pack.burgs[id]);
  const centerBurg = liveBurg(map, province.burg);
  const capitalBurg = (centerBurg && burgIds.includes(centerBurg.i)) ? centerBurg : inProvince.slice().sort(byPop)[0];
  if (!capitalBurg) throw new Error("この属州には都市が1つも無いため独立させられません。先に都市を置いてください");

  // 元の国家の首都が独立側に含まれる場合は、残る都市の中から新しい首都を選ぶ
  let newFromCapital = null;
  if (burgIds.includes(fromState.capital)) {
    newFromCapital = map.pack.burgs.filter((b) => liveBurg(map, b?.i) && b.state === fromState.i && !burgIds.includes(b.i)).sort(byPop)[0];
    if (!newFromCapital) throw new Error("独立させると元の国家に都市が1つも残らないため、独立させられません");
  }

  const newState = {
    i: newId, name: trimmed, fullName: trimmed, color: pickColor(liveCount, rnd),
    cells: cells.length, area: round6(area), rural: round6(rural), urban: round6(urban),
    burgs: burgIds.length, capital: capitalBurg.i, neighbors: [],
  };
  const statesList = map.pack.states.length ? map.pack.states.slice() : [null];
  statesList[newId] = newState;

  const parts = [
    setList((m) => m.pack.states, (m, v) => { m.pack.states = v; }, statesList),
    setIndexed((m) => m.pack.cells.state, cells.map((i) => [i, c.state[i], newId])),
    // 属州はそのまま新国家に付け替える（独立した属州は、新国家の中心的な属州として引き継ぐ）
    setProps(province, { state: newId }),
  ];
  // 都市は新国家の所属に。首都フラグは新首都だけに立てる（旧首都が独立側にあった場合の取り残しを防ぐ）
  for (const bid of burgIds) parts.push(setProps(map.pack.burgs[bid], { state: newId, capital: bid === capitalBurg.i ? 1 : 0 }));
  if (newFromCapital) parts.push(setProps(newFromCapital, { capital: 1 }));

  // 元の国家から、独立した分を差し引く
  const patch = {};
  if (typeof fromState.cells === "number") patch.cells = Math.max(0, fromState.cells - cells.length);
  if (typeof fromState.area === "number") patch.area = round6(Math.max(0, fromState.area - area));
  if (typeof fromState.rural === "number") patch.rural = round6(Math.max(0, fromState.rural - rural));
  if (typeof fromState.urban === "number") patch.urban = round6(Math.max(0, fromState.urban - urban));
  if (typeof fromState.burgs === "number") patch.burgs = Math.max(0, fromState.burgs - burgIds.length);
  else if (Array.isArray(fromState.burgs)) patch.burgs = fromState.burgs.filter((b) => !burgIds.includes(b));
  if (newFromCapital) patch.capital = newFromCapital.i;
  parts.push(setProps(fromState, patch));


  // 極（ラベル位置）を計算する
  const newPole = computePole(map, (cell) => (memberSet.has(cell) ? newId : -1), newId);
  if (newPole) parts.push(setProps(newState, { pole: newPole }));
  if (fromState.pole) {
    const poleCell = nearestCell(map, fromState.pole);
    const stillInside = c.state[poleCell] === fromState.i && !memberSet.has(poleCell);
    if (!stillInside) {
      const remainPole = computePole(map, (cell) => (c.state[cell] === fromState.i && !memberSet.has(cell) ? fromState.i : -1), fromState.i);
      if (remainPole) parts.push(setProps(fromState, { pole: remainPole }));
    }
  }

  if (date) {
    parts.push(logEntry(map, {
      type: "independence", year: date.year, month: date.month,
      fromState: fromState.i, newState: newId, provinceId, provinceName: province.fullName ?? province.name, name: trimmed,
    }));
  }
  // 独立を示すマーカーを、新国家の中心（首都があればそこ、無ければ切り出した領土の代表セル）に立てる
  const markerCell = capitalBurg.cell;
  const markerPart = addEventMarker(map, { cell: markerCell, type: "independence", name: `${trimmed}独立宣言${date ? `（${date.year}年${date.month}月）` : ""}` });
  if (markerPart) parts.push(markerPart);

  return { command: makeCommand(`属州「${province.fullName ?? province.name}」の独立`, ["politics"], parts), id: newId };
}

/**
 * 国家を統合する（from を to に併合し、from は解散する）。
 * @param {object} map
 * @param {{from:number, to:number, date?:{year:number,month:number}}} opts
 */
export function planMergeStates(map, { from, to, date }) {
  if (from === to) throw new Error("同じ国家は統合できません");
  const fromState = map.pack.states[from], toState = map.pack.states[to];
  if (!isLiveState(fromState)) throw new Error("統合元の国家が存在しません");
  if (!isLiveState(toState)) throw new Error("統合先の国家が存在しません");

  const c = map.pack.cells;
  const cells = [];
  for (let i = 0; i < c.state.length; i++) if (c.state[i] === from) cells.push(i);

  const parts = [];
  if (cells.length) {
    parts.push(setIndexed((m) => m.pack.cells.state, cells.map((i) => [i, from, to])));
  }
  // 都市: state を書き換える。旧首都は普通の都市に戻す
  const movedBurgIds = [];
  for (const b of map.pack.burgs) {
    if (!isLive(b) || !b.i || b.state !== from) continue;
    const patch = { state: to };
    if (b.capital) patch.capital = 0;
    parts.push(setProps(b, patch));
    movedBurgIds.push(b.i);
  }
  // 属州: from の属州は to の属州として引き継ぐ（属州自体は消さない。所属だけ変える）
  for (const pr of map.pack.provinces) {
    if (isLive(pr) && pr.i && pr.state === from) parts.push(setProps(pr, { state: to }));
  }

  // 統計を to に加算する
  const toPatch = {};
  if (typeof toState.cells === "number" && typeof fromState.cells === "number") toPatch.cells = toState.cells + fromState.cells;
  if (typeof toState.area === "number" && typeof fromState.area === "number") toPatch.area = round6(toState.area + fromState.area);
  if (typeof toState.rural === "number" && typeof fromState.rural === "number") toPatch.rural = round6(toState.rural + fromState.rural);
  if (typeof toState.urban === "number" && typeof fromState.urban === "number") toPatch.urban = round6(toState.urban + fromState.urban);
  if (typeof toState.burgs === "number") toPatch.burgs = toState.burgs + movedBurgIds.length;
  else if (Array.isArray(toState.burgs)) toPatch.burgs = [...toState.burgs, ...movedBurgIds];
  // 部隊も引き継ぐ（吸収した国の軍をそのまま編入する）
  if (Array.isArray(fromState.military) && fromState.military.length) {
    toPatch.military = [...(Array.isArray(toState.military) ? toState.military : []), ...fromState.military];
  }
  if (Object.keys(toPatch).length) parts.push(setProps(toState, toPatch));

  // from は解散する（削除フラグ。属していたセル・都市・属州は全て to に移した後なので、
  // 統計は0に揃えておく。neighbors 等は触らない＝そのまま残置される点に注意）
  parts.push(setProps(fromState, { removed: true, cells: 0, area: 0, rural: 0, urban: 0, burgs: 0, capital: 0, military: [] }));

  if (date) {
    parts.push(logEntry(map, {
      type: "merge", year: date.year, month: date.month,
      fromState: from, fromName: fromState.fullName ?? fromState.name, toState: to, toName: toState.fullName ?? toState.name,
    }));
  }
  // 統合を示すマーカーを、消滅する国の旧首都（無ければ最初のセル）に立てる
  const oldCapital = map.pack.burgs[fromState.capital];
  const markerCell = oldCapital ? oldCapital.cell : cells[0];
  const markerPart = addEventMarker(map, {
    cell: markerCell, type: "founding",
    name: `${fromState.fullName ?? fromState.name}が${toState.fullName ?? toState.name}に統合${date ? `（${date.year}年${date.month}月）` : ""}`,
  });
  if (markerPart) parts.push(markerPart);

  return makeCommand(`「${fromState.fullName ?? fromState.name}」を「${toState.fullName ?? toState.name}」に統合`, ["politics"], parts);
}
