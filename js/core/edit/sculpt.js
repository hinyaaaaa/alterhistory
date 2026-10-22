// 地形の編集（標高ブラシ）。地理の正本は球面世界なので、世界の編集器（気候・水系・土壌・資源を再計算する）を通し、
// その結果を地図側の導出値に反映する。Undo / Redo は、世界の編集器の履歴と対で動く（同じ順序の LIFO）。
//   ・陸が海になるセルの所属（国家・文化・宗教・属州・人口）は外す（Undo で戻る）。都市のあるセルは海にできない。
import { makeCommand } from "./commands.js";
import { refreshMapCells, refreshRivers, LAND_WATER } from "../world-bridge.js";

export const SCULPT_MODES = Object.freeze({ 1: "raise", 2: "lower", 3: "smooth" });
const OWN_KEYS = ["state", "culture", "religion", "province", "pop"];

/** @returns {{command:object|null, report:object}} 世界はこの時点で変わっている（command を commit すると地図側が追いつく） */
export function planSculpt(map, editor, { center, radiusKm, target, deltaM = 300 }) {
  const mode = SCULPT_MODES[target]; if (!mode) throw new Error("標高の調整の種類を選んでください");
  const world = map.world, c = map.pack.cells;
  const r = editor.applyBrush({ center, radiusKm, deltaM, mode });
  if (!r.ok) throw new Error(r.reason);
  if (!r.dirty?.length) return { command: null, report: { changed: 0 } };
  const dirty = Array.from(r.dirty), flooded = [];
  for (const i of dirty) if (c.biome[i] !== 0 && world.cell.landWater[i] !== LAND_WATER.LAND) {
    if (c.burg[i] > 0) { editor.undo(); throw new Error("都市のある土地は、海や湖にできません（先に都市を移してください）"); }
    if (OWN_KEYS.some((k) => c[k][i] > 0)) flooded.push([i, ...OWN_KEYS.map((k) => c[k][i])]);
  }
  let first = true;
  const sync = (m) => { refreshMapCells(m, dirty); refreshRivers(m); };
  const part = {
    apply(m) { if (first) first = false; else { const x = editor.redo(); if (!x.ok) throw new Error(x.reason); } sync(m); for (const [i] of flooded) for (const k of OWN_KEYS) m.pack.cells[k][i] = 0; },
    revert(m) { const x = editor.undo(); if (!x.ok) throw new Error(x.reason); sync(m); for (const [i, ...v] of flooded) OWN_KEYS.forEach((k, j) => { m.pack.cells[k][i] = v[j]; }); },
  };
  return { command: makeCommand("地形を編集", ["terrain", "politics"], [part]), report: { changed: dirty.length, flooded: flooded.length } };
}
