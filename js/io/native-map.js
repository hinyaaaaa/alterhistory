// ALTERHISTORY 形式（.ahmap）：このアプリ専用の保存形式。
//
// Azgaar の .map は「1行1項目・数字の羅列」で、人にも他のツールにも読みにくい。そこで保存形式は
// ALTERHISTORY 向けの構造に作り直した。Azgaar の地図は「読み込み」だけでき、保存はこの形式になる。
//
// 構造（gzip 圧縮した JSON。展開すれば普通のテキストエディタで読める）:
//   format / formatVersion / savedAt
//   world      … 名前・説明・サイズ・世界の現在時刻（年月）
//   settings   … 地図の設定（単位・気候・ラベルなど）
//   grid       … 地形生成用の格子（点・標高・降水など）。セルごとの配列は RLE（[値,連続数,…]）で小さくする
//   cells      … セルごとの属性（地形・都市・文化・人口・河川・国家・宗教・属州）。同じく RLE
//   pack       … 国家・文化・宗教・属州・都市・河川などの一覧（名前つきのオブジェクト）
//   markers / zones / routes / … 地図上の要素
//   data       … ALTERHISTORY 独自データ（歴史ログ・戦争・同盟・外交・時代・ノート・バランス設定など）
//
// 純粋ロジック層（gzip だけは標準の CompressionStream を使う。ブラウザでも Node 22 でも動く）。

import { createEmptyMap } from "../core/model.js";
import { createExtension, APP_NAME, EXT_FORMAT } from "./native-format.js";

export const NATIVE_FORMAT = "alterhistory-map";
export const NATIVE_VERSION = 1;
export const NATIVE_EXT = "ahmap";

const CELL_KEYS = ["biome", "burg", "culture", "pop", "river", "state", "religion", "province"];
const GRID_KEYS = ["h", "prec", "f", "t", "temp"];

/** ランレングス圧縮。[値, 連続数, 値, 連続数, …] */
export function rleFlat(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i + 1;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push(arr[i], j - i);
    i = j;
  }
  return out;
}
export function unrleFlat(flat) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) for (let k = 0; k < flat[i + 1]; k++) out.push(flat[i]);
  return out;
}

/** MapData → ALTERHISTORY 形式の JSON 文字列 */
export function serializeNativeJson(map, { savedAt = "" } = {}) {
  const g = map.grid, p = map.pack;
  const { source: _s, extraHeader: _e, lineCount: _l, biomesLegacy: _b, ...meta } = map.meta;
  const doc = {
    format: NATIVE_FORMAT,
    formatVersion: NATIVE_VERSION,
    app: APP_NAME,
    savedAt,
    world: { ...meta, time: { ...map.worldTime } },
    settings: map.settings.options ?? null,
    coordinates: map.coordinates ?? null,
    biomes: map.biomesData,
    notes: map.notes ?? [],
    grid: {
      spacing: g.spacing, cellsX: g.cellsX, cellsY: g.cellsY, boundary: g.boundary, points: g.points, features: g.features,
      ...(g.cellsDesired !== undefined ? { cellsDesired: g.cellsDesired } : {}),
      ...Object.fromEntries(GRID_KEYS.map((k) => [k, rleFlat(g[k] ?? [])])),
    },
    cells: Object.fromEntries(CELL_KEYS.map((k) => [k, rleFlat(p.cells[k] ?? [])])),
    pack: {
      features: p.features, states: p.states, cultures: p.cultures, religions: p.religions, provinces: p.provinces, burgs: p.burgs, rivers: p.rivers,
    },
    markers: map.markers, zones: map.zones, routes: map.routes, cellRoutes: map.cellRoutes, relief: map.relief, ice: map.ice,
    measurers: map.measurers, goods: map.goods, markets: map.markets, deals: map.deals,
    namesbase: map.namesbase, graphOverride: map.graphOverride ?? {},
    data: map.ext?.data ?? {},
  };
  return JSON.stringify(doc);
}

/** gzip 圧縮（CompressionStream） */
export async function gzip(text) {
  if (typeof CompressionStream === "undefined") return new TextEncoder().encode(text);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 保存用のバイト列（gzip 済み） */
export async function serializeNative(map, opts) {
  return gzip(serializeNativeJson(map, opts));
}

/** 展開済みのバイト列が ALTERHISTORY 形式か（Azgaar の .map は数字から始まり、こちらは { から始まる） */
export function isNativeBytes(bytes) {
  for (let i = 0; i < Math.min(bytes.length, 16); i++) {
    const c = bytes[i];
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0xef || c === 0xbb || c === 0xbf) continue;
    return c === 0x7b;
  }
  return false;
}

/** ALTERHISTORY 形式の JSON 文字列 → MapData（形状 geometry は呼び出し側で作る） */
export function parseNativeJson(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`ALTERHISTORY ファイルの JSON が壊れています: ${e.message}`); }
  if (doc?.format !== NATIVE_FORMAT) throw new Error("ALTERHISTORY 形式ではありません");
  const warnings = [];
  if (typeof doc.formatVersion === "number" && doc.formatVersion > NATIVE_VERSION) {
    warnings.push(`このファイルは新しい版の ALTERHISTORY (形式${doc.formatVersion}) で保存されています。一部の情報が失われる可能性があります`);
  }
  const map = createEmptyMap();
  const { time, ...meta } = doc.world ?? {};
  Object.assign(map.meta, meta, { source: "alterhistory", extraHeader: [], lineCount: 53 });
  map.settings = { format: "json", raw: "", options: doc.settings ?? null };
  map.coordinates = doc.coordinates ?? null;
  map.biomesData = doc.biomes ?? [];
  map.notes = doc.notes ?? [];
  const g = doc.grid ?? {};
  Object.assign(map.grid, {
    spacing: g.spacing ?? 0, cellsX: g.cellsX ?? 0, cellsY: g.cellsY ?? 0, boundary: g.boundary ?? [], points: g.points ?? [], features: g.features ?? [],
    cellsDesired: g.cellsDesired,
  });
  for (const k of GRID_KEYS) map.grid[k] = unrleFlat(g[k] ?? []);
  const pk = doc.pack ?? {};
  for (const k of ["features", "states", "cultures", "religions", "provinces", "burgs", "rivers"]) map.pack[k] = pk[k] ?? [];
  for (const k of CELL_KEYS) map.pack.cells[k] = unrleFlat(doc.cells?.[k] ?? []);
  for (const k of ["markers", "zones", "routes", "relief", "ice", "measurers", "goods", "markets", "deals", "namesbase"]) map[k] = doc[k] ?? [];
  map.cellRoutes = doc.cellRoutes ?? {};
  map.graphOverride = doc.graphOverride ?? {};
  map.ext = { ...createExtension(), format: EXT_FORMAT, savedAt: doc.savedAt ?? "", data: doc.data ?? {} };
  if (Number.isInteger(time?.year) && Number.isInteger(time?.month)) map.worldTime = { year: time.year, month: time.month };
  return { map, warnings };
}
