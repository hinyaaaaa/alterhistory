// 塗り替え：国家・文化・宗教・属州の持ち主を、セル単位で書き換える計画を作る。
//
// 「計画」は map を変更せず、コマンド（Undo 可能）と結果の報告を返す。
//
// 守る決まり（実データ2件で成り立つことを確認したもの）:
//   ・水域のセルは塗らない（実データでは水域の国家・文化・属州は常に0）
//   ・都市の state は、そのセルの国家と一致させる（state を塗ったら都市も動かす）
//   ・都市の culture も、そのセルの文化と一致させる
//   ・属州は、その属州の国家のセルにだけ存在する（国家を塗ったら、他国になる属州は外す）
//   ・首都のセルと、属州の中心都市のセルは、別の国へ塗り替えさせない（保護。force で解除）
//
// 統計値の更新（実データで完全一致を確認できたものだけ）:
//   cells（セル数）/ rural（農村人口＝セルの人口の合計）/ burgs（都市数）/ urban（都市人口の合計）
//   area（面積）は約0.5%ずれるため、保存値に対する「差分」で更新する。
//   neighbors（隣接国）は生成時点の記録で再計算できないため、触らない。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setIndexed, setProps } from "./commands.js";
import { computePole } from "./pole.js";
import { cellAreas } from "../geometry.js";
import { cellIndexOf } from "../spatial.js";

export const PAINT_KINDS = Object.freeze({
  state:    { list: "states",    label: "国家" },
  culture:  { list: "cultures",  label: "文化" },
  religion: { list: "religions", label: "宗教" },
  province: { list: "provinces", label: "属州" },
});

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const liveBurg = (map, id) => { const b = id > 0 ? map.pack.burgs[id] : null; return isLive(b) && b.i ? b : null; };

/** 保護するセル: 首都のセル（国家用）と、属州の中心都市のセル（国家・属州用） */
export function protectedCells(map) {
  const capital = new Set(), provinceCenter = new Set();
  for (const s of map.pack.states) {
    if (!isLive(s) || !s.i) continue;
    const b = liveBurg(map, s.capital);
    if (b) capital.add(b.cell);
  }
  for (const pr of map.pack.provinces) {
    if (!isLive(pr) || !pr.i) continue;
    const b = liveBurg(map, pr.burg);
    if (b) provinceCenter.add(b.cell);
  }
  return { capital, provinceCenter };
}

/** 実体ごとの統計の増減を集める */
function createTally() {
  const t = new Map();
  const get = (kind, id) => {
    const key = `${kind}:${id}`;
    let e = t.get(key);
    if (!e) { e = { kind, id, cells: 0, rural: 0, area: 0, urban: 0, burgs: 0, burgAdd: [], burgRemove: [] }; t.set(key, e); }
    return e;
  };
  return { get, all: () => [...t.values()] };
}

/**
 * @param {object} map
 * @param {{kind:string, target:number, cells:number[], force?:boolean}} opts
 *   target: 塗る先の実体ID。0 は「消す（無所属にする）」
 * @returns {{command:object|null, report:object}}
 */
export function planPaint(map, { kind, target, cells, force = false }) {
  const def = PAINT_KINDS[kind];
  if (!def) throw new Error(`未対応の種類です: ${kind}`);
  const list = map.pack[def.list];
  const entity = target > 0 ? list[target] : null;
  if (target > 0 && !isLive(entity)) throw new Error(`${def.label}#${target} は存在しないか、削除されています`);

  const c = map.pack.cells;
  const arr = c[kind];
  const burgs = map.pack.burgs;
  const areas = cellAreas(map.geometry);
  const { capital, provinceCenter } = force ? { capital: new Set(), provinceCenter: new Set() } : protectedCells(map);
  const report = { requested: 0, changed: 0, skippedWater: 0, skippedProtected: 0, skippedForeign: 0 };

  const changes = [];          // 塗る種類の配列の変更
  const provinceChanges = [];  // 国家を塗るときに外れる属州
  const burgPatches = [];      // 都市の state / culture の更新
  const tally = createTally();
  const seen = new Set();

  const move = (k, from, to, cell, pop, area, burg) => {
    const a = tally.get(k, from), b = tally.get(k, to);
    a.cells--; b.cells++; a.rural -= pop; b.rural += pop; a.area -= area; b.area += area;
    if (burg) {
      a.urban -= burg.population; b.urban += burg.population;
      a.burgs--; b.burgs++; a.burgRemove.push(burg.i); b.burgAdd.push(burg.i);
    }
  };

  for (const cell of cells) {
    if (seen.has(cell)) continue;
    seen.add(cell);
    report.requested++;
    if (cell < 0 || cell >= arr.length) continue;
    if (c.biome[cell] === 0) { report.skippedWater++; continue; }
    const old = arr[cell];
    if (old === target) continue;
    if (kind === "province" && target > 0 && c.state[cell] !== entity.state) { report.skippedForeign++; continue; }
    if (!force && ((kind === "state" && capital.has(cell)) || ((kind === "state" || kind === "province") && provinceCenter.has(cell)))) {
      report.skippedProtected++; continue;
    }

    const pop = c.pop[cell], area = areas[cell];
    const burg = liveBurg(map, c.burg[cell]);
    // 実データでは、無所属(0)の土地に都市は存在しない。都市は必ずどこかの国に属させる
    if (!force && kind === "state" && target === 0 && burg) { report.skippedProtected++; continue; }
    changes.push([cell, old, target]);
    move(kind, old, target, cell, pop, area, burg && (kind === "state" || kind === "religion" || kind === "province") ? burg : null);

    if (burg && kind === "state") burgPatches.push([burg, { state: target }]);
    if (burg && kind === "culture") burgPatches.push([burg, { culture: target }]);

    // 国家が変わると、その属州は他国のものになる → 属州から外す
    if (kind === "state") {
      const p = c.province[cell];
      if (p > 0 && map.pack.provinces[p]?.state !== target) {
        provinceChanges.push([cell, p, 0]);
        move("province", p, 0, cell, pop, area, burg);
      }
    }
    report.changed++;
  }
  if (!changes.length) return { command: null, report };

  // ---- 部品を組み立てる ----
  const parts = [setIndexed((m) => m.pack.cells[kind], changes)];
  if (provinceChanges.length) parts.push(setIndexed((m) => m.pack.cells.province, provinceChanges));
  for (const [burg, patch] of burgPatches) parts.push(setProps(burg, patch));

  // 統計（数値として持っている項目だけ更新する）
  const entityOf = (k, id) => { const e = map.pack[PAINT_KINDS[k].list][id]; return e && typeof e === "object" ? e : null; };
  for (const d of tally.all()) {
    if (d.id === 0 && d.kind !== "state" && d.kind !== "religion") continue;
    const e = entityOf(d.kind, d.id);
    if (!e) continue;
    const patch = {};
    for (const f of ["cells", "rural", "area", "urban"]) if (typeof e[f] === "number" && d[f] !== 0) patch[f] = round6(e[f] + d[f]);
    if (typeof e.burgs === "number" && d.burgs !== 0) patch.burgs = e.burgs + d.burgs;
    else if (Array.isArray(e.burgs) && (d.burgAdd.length || d.burgRemove.length)) {
      const rm = new Set(d.burgRemove);
      patch.burgs = e.burgs.filter((b) => !rm.has(b)).concat(d.burgAdd.filter((b) => !e.burgs.includes(b)));
    }
    if (Object.keys(patch).length) parts.push(setProps(e, patch));
  }

  // 極（ラベル位置）: 領土の外に出てしまった場合だけ計算し直す
  const after = new Map(changes.map(([i, , to]) => [i, to]));
  const ownerAfter = (cell) => (after.has(cell) ? after.get(cell) : arr[cell]);
  const provAfter = new Map(provinceChanges.map(([i, , to]) => [i, to]));
  const provOwnerAfter = (cell) => (provAfter.has(cell) ? provAfter.get(cell) : c.province[cell]);
  const index = cellIndexOf(map);
  const fixPole = (k, id, owner) => {
    const e = entityOf(k, id);
    if (!e || !id || !Array.isArray(e.pole)) return;
    const at = index.find(e.pole[0], e.pole[1]);
    if (at >= 0 && owner(at) === id && c.biome[at] !== 0) return; // まだ領土の中
    const pole = computePole(map, owner, id);
    if (pole) parts.push(setProps(e, { pole }));
  };
  for (const d of tally.all()) {
    if (d.kind === kind && d.cells !== 0) fixPole(kind, d.id, ownerAfter);
    if (d.kind === "province" && kind === "state" && d.cells !== 0) fixPole("province", d.id, provOwnerAfter);
  }

  const label = target > 0 ? `${def.label}を塗る` : `${def.label}を消す`;
  return { command: makeCommand(label, ["politics"], parts), report };
}

/** 地形（バイオーム）を塗る。水域は塗らず、海（0番）にもしない */
export function planBiomePaint(map, { target, cells }) {
  const b = map.biomesData[target];
  if (!b || target === 0) throw new Error("塗れない地形です（海にはできません）");
  const arr = map.pack.cells.biome;
  const report = { requested: 0, changed: 0, skippedWater: 0 };
  const changes = [];
  const seen = new Set();
  for (const cell of cells) {
    if (seen.has(cell)) continue;
    seen.add(cell);
    report.requested++;
    if (cell < 0 || cell >= arr.length) continue;
    if (arr[cell] === 0) { report.skippedWater++; continue; }
    if (arr[cell] === target) continue;
    changes.push([cell, arr[cell], target]);
    report.changed++;
  }
  if (!changes.length) return { command: null, report };
  return { command: makeCommand("地形を塗る", ["terrain"], [setIndexed((m) => m.pack.cells.biome, changes)]), report };
}
