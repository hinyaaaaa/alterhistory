// MapData → Azgaar 形式 (.map) のテキスト。
// 行の順序は公式ソース save.ts (v1.153.1) の mapData 配列と同じ。docs/MAP_FORMAT_SPEC.md 参照。
//
// 方針:
//   ・読み込んだ地図を編集せずに書き戻したとき、元のファイルと1文字も違わないこと（テストで検証）
//   ・元のファイルに無かった行は足さない（旧版のファイルを新しい版に「見せかけ」ない）
//   ・バージョン表記と設定行の形式は元のまま保つ
//       理由: 設定行の新旧は「バージョン < 1.152.0 かつ '{' で始まらない」で判定される。
//             バージョンだけ新しくして旧形式の設定行を残すと、公式版が読み込めなくなる。
//
// 純粋ロジック層：DOM に依存しない。

import { LINE } from "./azgaar-reader.js";
import { NATIVE_MARKER, MIN_EXT_INDEX, createExtension } from "./native-format.js";

const CRLF = "\r\n";
const json = (v) => JSON.stringify(v);
const nums = (arr) => Array.from(arr).join(",");

/**
 * @param {object} map
 * @param {object} [opts]
 * @param {boolean} [opts.native=false]  true なら ALTERHISTORY の目印と拡張行を付ける
 * @param {string}  [opts.exportedAt]    ヘッダーの日付。省略時は元の値のまま
 * @returns {string}
 */
export function serializeAzgaar(map, { native = false, exportedAt } = {}) {
  const m = map.meta;
  const limit = m.lineCount; // 元のファイルの行数。これ以降の行は空にする
  const isLegacy = map.settings.format === "legacy";
  const g = map.grid, p = map.pack, c = p.cells;
  const pt = (i) => map.passthrough[i] ?? "";

  const header = [m.version, m.description, exportedAt ?? m.exportedAt, m.seed, m.width, m.height, m.mapId];
  let extra = m.extraHeader.slice();
  if (native) extra[0] = NATIVE_MARKER;
  else if ((extra[0] ?? "").startsWith("ALTERHISTORY")) extra = extra.slice(1); // 目印だけを外す
  header.push(...extra);

  const gridGeneral = {
    spacing: g.spacing, cellsX: g.cellsX, cellsY: g.cellsY,
    boundary: g.boundary, points: g.points, features: g.features,
  };
  if (g.cellsDesired !== undefined) gridGeneral.cellsDesired = g.cellsDesired;

  // 行の内容を、行番号をキーに組み立てる
  const L = new Map();
  L.set(LINE.PARAMS, header.join("|"));
  L.set(LINE.SETTINGS, isLegacy ? map.settings.raw : json(map.settings.options));
  L.set(LINE.COORDINATES, isLegacy ? json(map.coordinates) : "");
  L.set(LINE.BIOMES, json(map.biomesData));
  L.set(LINE.NOTES, isLegacy ? json(map.notes) : "");
  L.set(LINE.SVG, map.rawLines[LINE.SVG] ?? "");
  L.set(LINE.GRID, json(gridGeneral));
  L.set(LINE.GRID_H, nums(g.h));
  L.set(LINE.GRID_PREC, nums(g.prec));
  L.set(LINE.GRID_F, nums(g.f));
  L.set(LINE.GRID_T, nums(g.t));
  L.set(LINE.GRID_TEMP, nums(g.temp));
  L.set(LINE.FEATURES, json(p.features));
  L.set(LINE.CULTURES, json(p.cultures));
  L.set(LINE.STATES, json(p.states));
  L.set(LINE.BURGS, json(p.burgs));
  L.set(LINE.CELL_BIOME, nums(c.biome));
  L.set(LINE.CELL_BURG, nums(c.burg));
  L.set(LINE.CELL_CULTURE, nums(c.culture));
  L.set(LINE.CELL_POP, nums(c.pop));
  L.set(LINE.CELL_RIVER, nums(c.river));
  L.set(LINE.CELL_STATE, nums(c.state));
  L.set(LINE.CELL_RELIGION, nums(c.religion));
  L.set(LINE.CELL_PROVINCE, nums(c.province));
  L.set(LINE.RELIGIONS, json(p.religions));
  L.set(LINE.PROVINCES, json(p.provinces));
  L.set(LINE.NAMESBASE, serializeNamesbase(map.namesbase));
  L.set(LINE.RIVERS, json(p.rivers));
  L.set(LINE.MARKERS, json(map.markers));
  L.set(LINE.CELL_ROUTES, json(map.cellRoutes));
  L.set(LINE.ROUTES, json(map.routes));
  L.set(LINE.ZONES, json(map.zones));
  L.set(LINE.ICE, json(map.ice));
  L.set(LINE.GOODS, json(map.goods));
  L.set(LINE.MARKETS, json(map.markets));
  L.set(LINE.DEALS, json(map.deals));
  L.set(LINE.MEASURERS, json(map.measurers));
  L.set(LINE.RELIEF, json(map.relief));

  // 全行の並びを作る
  const ext = native ? createExtension() : null;
  const known = LINE.JOURNEYS + 1; // 53
  // 中身のある行だけを数える（ALTERHISTORY が置いた空のパディング行は数えない）
  const nonEmptyMax = Math.max(-1, ...Object.entries(map.passthrough).filter(([, v]) => v !== "").map(([k]) => Number(k)));
  const bodyCount = Math.max(limit, nonEmptyMax + 1); // 元のファイルより行を増やさない
  const lines = new Array(bodyCount);
  for (let i = 0; i < bodyCount; i++) {
    if (i >= limit && !map.passthrough[i] && !L.has(i)) { lines[i] = ""; continue; }
    // 元のファイルに無かった行（旧版の末尾）は、内容があっても空で出す
    if (i >= limit && i < known) { lines[i] = ""; continue; }
    lines[i] = L.has(i) ? L.get(i) : pt(i);
  }
  if (ext) {
    ext.savedAt = exportedAt ?? m.exportedAt;
    ext.data = map.ext?.data ?? {};
    ext.lineCount = bodyCount;
    const extIndex = Math.max(MIN_EXT_INDEX, bodyCount);
    while (lines.length < extIndex) lines.push("");
    lines.push(json(ext));
  }
  return lines.join(CRLF);
}

/** 名前ベース: 名前|最小|最大|重複文字|複数語確率|語彙  を "/" でつなぐ */
export function serializeNamesbase(list) {
  return list.map((b) => `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${b.words.join(",")}`).join("/");
}
