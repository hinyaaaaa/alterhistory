// 国家運営層の状態（国家・文化・宗教・都市・歴史ログなど）を、.ahmap v2 の拡張チャンクに入れる形にする（v5.0.0 V5-M0）。
//
// 地理（球面世界）は .ahmap v2 の正本チャンクが持つ。ここで扱うのは、その上に積み上がる「歴史の側」の状態だけ。
//   ・セルごとの所属（国家・文化・宗教・属州・都市・人口）は RLE（[値, 連続数, …]）
//   ・国家などの一覧・目印・ゾーン・交易・ALTERHISTORY 独自データはそのまま JSON
// 河川と地形は、世界から導出する（worldToMap）ので保存しない。バイオームは地図編集で塗り替えられるので保存する。
// 純粋ロジック（DOM 非依存）。
import { createExtension, EXT_FORMAT } from "./native-format.js";
import { SAVE_FORMAT } from "../core/edit/treaties.js";

export const MAP_STATE_CHUNK = "app.map-state";
export const MAP_STATE_VERSION = 1;
const CELL_KEYS = ["biome", "burg", "culture", "pop", "state", "religion", "province"];
const LIST_KEYS = ["states", "cultures", "religions", "provinces", "burgs"];
const MAP_KEYS = ["markers", "zones", "routes", "relief", "ice", "measurers", "goods", "markets", "deals", "namesbase", "notes"];

export function rle(arr) { const out = []; for (let i = 0; i < arr.length;) { let j = i + 1; while (j < arr.length && arr[j] === arr[i]) j++; out.push(arr[i], j - i); i = j; } return out; }
export function unrle(flat, n) { const out = new Array(n); let k = 0; for (let i = 0; i + 1 < flat.length; i += 2) for (let r = 0; r < flat[i + 1]; r++) { if (k < n) out[k] = flat[i]; k++; } return k === n ? out : null; }

/** MapData → 保存用オブジェクト */
export function serializeMapState(map, { savedAt = "" } = {}) {
  const p = map.pack;
  return {
    stateVersion: MAP_STATE_VERSION, savedAt,
    meta: { name: map.meta.name ?? "" },
    time: { ...map.worldTime },
    cells: Object.fromEntries(CELL_KEYS.map((k) => [k, rle(p.cells[k] ?? [])])),
    pack: Object.fromEntries(LIST_KEYS.map((k) => [k, p[k]])),
    ...Object.fromEntries(MAP_KEYS.map((k) => [k, map[k]])),
    cellRoutes: map.cellRoutes ?? {},
    data: { ...(map.ext?.data ?? {}), saveFormat: SAVE_FORMAT },
  };
}

/** 保存用オブジェクトを、worldToMap で作った地図に重ねる。読めない部分は警告にして、世界から導いた値のまま残す */
export function applyMapState(map, st, warnings = []) {
  if (!st || typeof st !== "object") { warnings.push("国家運営の状態を読めなかったため、世界だけを開きました"); return map; }
  if (typeof st.stateVersion === "number" && st.stateVersion > MAP_STATE_VERSION) warnings.push(`このファイルは、より新しい版の ALTERHISTORY（状態の形式 ${st.stateVersion}。このアプリは ${MAP_STATE_VERSION} まで）で保存されています。読めない項目は無視され、このまま保存すると失われる可能性があります`);
  const N = map.pack.cells.biome.length;
  for (const k of CELL_KEYS) {
    const a = st.cells?.[k]; if (!a) continue;
    const v = unrle(a, N);
    if (!v) { warnings.push(`セルの属性 ${k} の数が世界のセル数（${N}）と合いません。この属性は世界から作り直しました`); continue; }
    map.pack.cells[k] = v;
  }
  for (const k of LIST_KEYS) if (Array.isArray(st.pack?.[k])) map.pack[k] = st.pack[k];
  for (const k of MAP_KEYS) if (st[k] !== undefined) map[k] = st[k];
  map.cellRoutes = st.cellRoutes ?? {};
  if (st.meta?.name) map.meta.name = st.meta.name;
  if (Number.isInteger(st.time?.year) && Number.isInteger(st.time?.month)) map.worldTime = { year: st.time.year, month: st.time.month };
  map.ext = { ...createExtension(), format: EXT_FORMAT, savedAt: st.savedAt ?? "", data: st.data ?? {} };
  delete map.ext.data.journeys; // 旅の機能は v2.0.0 で廃止
  return map;
}
