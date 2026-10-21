// 地形編集（v4.0.0 / V4-M8）。標高ブラシ → 影響範囲だけを局所再計算 → 差分で Undo/Redo。
//   ・変えるもの: 標高（ブラシ）。そこから 気温・水蒸気・降水・バイオーム・水系（流域ごと）・河川・湖・土壌・資源・肥沃度・人口の受け皿 を、
//     影響を受けるセルだけ再計算する。全体生成と同じ式（worldgen.js の tempAt / moistureStep / precipAt / computeHydrology / landUseAt）を使う。
//   ・降水の風下への波及は、風下側の一定の範囲（約 700 km）までの近似。範囲外は変えない（全体を作り直した結果とは完全には一致しない）。
//   ・初期人口集団の居住地が海・湖になる編集は、何も変えずに拒否する（理由を返す）。
//   ・陸と海が入れ替わらない編集では、海岸距離の再計算を省く。
//   純粋ロジック（DOM 非依存）。乱数・時刻を使わない（同じ編集列は同じ結果）。
import { cellsInRadius, dilateCells } from "./spatial-index.js";
import { tempAt, moistureStep, precipAt, biomeAt, computeHydrology, landUseAt, landUseNoise, recomputeStats, LAND_WATER, BIOMES } from "./worldgen.js";
import { worldHash } from "./worldgen.js";
import { hashString } from "./noise.js";

const TRACKED = ["elevation", "landWater", "temp", "precip", "biome", "soil", "fertility", "resource", "riverTo", "riverFlow", "river", "basin", "coastDist", "capacity", "moisture", "filled"];
export const BRUSH_MODES = Object.freeze({ raise: "隆起", lower: "沈降", smooth: "なだらかにする", flatten: "平らにする" });
const MAX_ELEV = 9000, MIN_ELEV = -11000, MAX_HISTORY = 60;

export function createWorldEditor(world) {
  const { mesh, cell } = world, V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, R = world.spec.planet.radiusKm;
  const spacingKm = Math.sqrt((4 * Math.PI * R * R) / V), seed = world.spec.worldSeed;
  const noise = landUseNoise(seed), undoStack = [], redoStack = [];
  const isSea = new Uint8Array(V); for (let c = 0; c < V; c++) isSea[c] = cell.elevation[c] <= 0 ? 1 : 0;
  const cx = { mesh, lat: cell.lat, lon: cell.lon, elevation: cell.elevation, isSea, moisture: cell.moisture, precipNoise: null, lapse: world.spec.climateModel.lapseRateCPerKm, decay: Math.exp(-spacingKm / world.spec.climateModel.windMoistureLengthKm) };
  // 降水ゆらぎのノイズ種は、生成時と同じ名前から作る（worldgen の nSeed("precip")）
  cx.precipNoise = hashSeed(seed, "precip");
  const hyd = { mesh, elevation: cell.elevation, isSea, precip: cell.precip, areaKm2: cell.areaKm2, parent: cell.riverTo, filled: cell.filled, flow: cell.riverFlow, basin: cell.basin, landWater: cell.landWater, biome: cell.biome };
  const lu = { mesh, isSea, landWater: cell.landWater, biome: cell.biome, elevation: cell.elevation, river: cell.river, volcanic: cell.volcanic, mountain: cell.mountain, coastDist: cell.coastDist, temp: cell.temp, precip: cell.precip, areaKm2: cell.areaKm2, resource: cell.resource, soil: cell.soil, fertility: cell.fertility, capacity: cell.capacity, ...noise };

  const snapshot = (idx) => { const s = {}; for (const k of TRACKED) { const a = cell[k], o = new a.constructor(idx.length); for (let i = 0; i < idx.length; i++) o[i] = a[idx[i]]; s[k] = o; } return s; };
  const restore = (idx, s) => { for (const k of TRACKED) { const a = cell[k], o = s[k]; for (let i = 0; i < idx.length; i++) a[idx[i]] = o[i]; } for (const c of idx) isSea[c] = cell.elevation[c] <= 0 ? 1 : 0; };
  const finish = () => { world.stats = recomputeStats(world); world.hash = worldHash(world); world.editVersion = (world.editVersion ?? 0) + 1; };

  /** ブラシを当てる。center: セル番号。radiusKm / deltaM（隆起・沈降の最大変化量 m）/ mode / target（flatten の目標標高） */
  function applyBrush({ center, radiusKm, deltaM = 300, mode = "raise", target = 0 }) {
    if (!(mode in BRUSH_MODES)) return { ok: false, reason: `ブラシの種類 ${mode} は未対応` };
    if (!(center >= 0 && center < V)) return { ok: false, reason: "セルの指定が範囲外" };
    if (!(radiusKm >= spacingKm * 0.5 && radiusKm <= 3000)) return { ok: false, reason: `半径は ${Math.ceil(spacingKm * 0.5)}〜3000 km` };
    const rr = radiusKm / R, reg = cellsInRadius(mesh, center, rr), rc = reg.cells;
    // 新しい標高
    const newElev = new Float32Array(rc.length); let any = false;
    for (let i = 0; i < rc.length; i++) {
      const c = rc[i], t = reg.dist[i] / rr, w = (1 - t * t) * (1 - t * t), e = cell.elevation[c]; let v = e;
      if (mode === "raise") v = e + deltaM * w; else if (mode === "lower") v = e - deltaM * w;
      else if (mode === "flatten") v = e + (target - e) * w * Math.min(1, Math.abs(deltaM) / 500);
      else { let s = 0, n = 0; for (let k = off[c]; k < off[c + 1]; k++) { s += cell.elevation[nb[k]]; n++; } v = e + (s / n - e) * w * Math.min(1, Math.abs(deltaM) / 500); }
      v = Math.max(MIN_ELEV, Math.min(MAX_ELEV, v)); if (Math.abs(v - e) > 1e-3) any = true; newElev[i] = v;
    }
    if (!any) return { ok: true, changed: 0, dirty: new Int32Array(0), unchanged: true };
    const pops = world.entities.populations;
    for (const p of pops) { const i = rc.indexOf(p.cell); if (i >= 0 && newElev[i] <= 0) return { ok: false, reason: `この編集は、初期集団 #${p.id} の居住地を海にします。先に集団を移すか、範囲を変えてください` }; }
    // 影響範囲
    const changedIdx = []; for (let i = 0; i < rc.length; i++) if (Math.abs(newElev[i] - cell.elevation[rc[i]]) > 1e-3) changedIdx.push(rc[i]);
    const changed = Int32Array.from(changedIdx).sort();
    const climateRings = Math.min(40, Math.ceil(700 / spacingKm) + 2);
    const D = dilateCells(mesh, changed, climateRings), ring1 = dilateCells(mesh, changed, 1);
    const basinIds = new Set(); for (const c of ring1) if (cell.basin[c] >= 0) basinIds.add(cell.basin[c]);
    const members = new Uint8Array(V); for (const c of ring1) members[c] = 1;
    for (let c = 0; c < V; c++) if (cell.basin[c] >= 0 && basinIds.has(cell.basin[c])) members[c] = 1; // 影響を受ける流域は、まるごと
    const memberList = []; for (let c = 0; c < V; c++) if (members[c]) memberList.push(c);
    // 陸と海が入れ替わるなら、新しい海岸距離を先に求め、変わるセルを範囲に入れる（旧値を保存できるように）
    const newIsSea = isSea.slice(); let seaChanged = false;
    for (let i = 0; i < rc.length; i++) { const s = newElev[i] <= 0 ? 1 : 0; if (s !== newIsSea[rc[i]]) { newIsSea[rc[i]] = s; seaChanged = true; } }
    let newCoast = null; const set = new Set(D); for (const c of memberList) set.add(c);
    if (seaChanged) {
      newCoast = new Uint16Array(V); const q = new Int32Array(V); let qh = 0, qt = 0; const seen = new Uint8Array(V);
      for (let c = 0; c < V; c++) if (newIsSea[c]) { seen[c] = 1; q[qt++] = c; }
      while (qh < qt) { const c = q[qh++]; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (!seen[j]) { seen[j] = 1; newCoast[j] = Math.min(65535, newCoast[c] + 1); q[qt++] = j; } } }
      for (let c = 0; c < V; c++) if (newCoast[c] !== cell.coastDist[c]) set.add(c);
    }
    for (const c of dilateCells(mesh, Array.from(set), 1)) set.add(c); // 起伏（隣との標高差）が変わるので、1 段広げる
    const S = Int32Array.from(set).sort(), before = snapshot(S), oldSea = isSea.slice();
    // 適用
    for (let i = 0; i < rc.length; i++) cell.elevation[rc[i]] = newElev[i];
    isSea.set(newIsSea); if (newCoast) cell.coastDist.set(newCoast);
    for (const c of changed) cell.temp[c] = tempAt(cell.lat[c], cell.elevation[c], cx.lapse);
    for (const c of D) if (isSea[c]) cell.moisture[c] = 1;
    for (let it = 0; it < climateRings + 2; it++) for (const c of D) { if (!isSea[c]) cell.moisture[c] = moistureStep(cx, c); }
    for (const c of D) cell.precip[c] = precipAt(cx, c);
    for (const c of S) cell.biome[c] = biomeAt(cell.temp[c], cell.precip[c], cell.elevation[c], isSea[c]);
    const hr = computeHydrology(hyd, members), thr = world.stats.riverFlowThreshold;
    const rollback = (reason) => { restore(S, before); isSea.set(oldSea); return { ok: false, reason }; };
    if (hr.unreached > 0) return rollback("水系の再計算に失敗しました（流域が海へつながりません）。範囲を変えてください");
    for (const c of memberList) cell.river[c] = cell.landWater[c] === LAND_WATER.LAND && cell.riverFlow[c] >= thr && cell.riverFlow[c] > 0 ? 1 : 0;
    for (const c of S) landUseAt(lu, c);
    for (const p of pops) if (cell.landWater[p.cell] !== LAND_WATER.LAND) return rollback(`この編集は、初期集団 #${p.id} の居住地を湖・海にします。範囲を変えてください`);
    // 差分: 実際に変わったセルだけを残す
    const after = snapshot(S), dIdx = [];
    for (let i = 0; i < S.length; i++) { for (const k of TRACKED) if (before[k][i] !== after[k][i]) { dIdx.push(i); break; } }
    const diff = { cells: Int32Array.from(dIdx.map((i) => S[i])), old: {}, now: {} };
    for (const k of TRACKED) { const o = new before[k].constructor(dIdx.length), n = new before[k].constructor(dIdx.length); dIdx.forEach((i, j) => { o[j] = before[k][i]; n[j] = after[k][i]; }); diff.old[k] = o; diff.now[k] = n; }
    finish(); undoStack.push(diff); if (undoStack.length > MAX_HISTORY) undoStack.shift(); redoStack.length = 0;
    return { ok: true, changed: changed.length, dirty: diff.cells, region: rc, affectedClimate: D.length, affectedBasinCells: memberList.length };
  }
  const applyDiff = (d, which) => { const src = which === "old" ? d.old : d.now; for (const k of TRACKED) { const a = cell[k], o = src[k]; for (let i = 0; i < d.cells.length; i++) a[d.cells[i]] = o[i]; } for (const c of d.cells) isSea[c] = cell.elevation[c] <= 0 ? 1 : 0; finish(); return { ok: true, dirty: d.cells }; };
  return {
    applyBrush, spacingKm,
    undo() { const d = undoStack.pop(); if (!d) return { ok: false, reason: "元に戻す操作がありません" }; redoStack.push(d); return applyDiff(d, "old"); },
    redo() { const d = redoStack.pop(); if (!d) return { ok: false, reason: "やり直す操作がありません" }; undoStack.push(d); return applyDiff(d, "now"); },
    get canUndo() { return undoStack.length > 0; }, get canRedo() { return redoStack.length > 0; }, get undoCount() { return undoStack.length; },
    clearHistory() { undoStack.length = 0; redoStack.length = 0; },
  };
}
function hashSeed(seed, name) { return hashString(`${seed}::noise::${name}`); } // worldgen.js の nSeed と同じ
