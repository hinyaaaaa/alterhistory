// Azgaar 形式 (.map) → MapData の変換。
// 入力は「文字列」または「バイト列」。DOM・ファイルAPIに依存しないので Node.js でもテストできる。
//
// 行の割り当ては公式ソース(save.ts, v1.153.1)と実ファイル2件で確定したもの。
// 詳細は docs/MAP_FORMAT_SPEC.md を参照。
//
// 読み込みの絶対条件:
//   1. 行区切りは CRLF のみ（SVG行の内部に単独の LF があるため LF 分割は不可）
//   2. バイナリで読み、デコードしてから CRLF で分割する
//   3. 新バージョンは末尾に行を足すだけ。存在しない行は既定値で読む
//   4. バージョン間でフィールドが変わるため、全項目を任意扱いにする

import { createEmptyMap } from "../core/model.js";

/** 行番号（save.ts の mapData 配列の順序） */
export const LINE = Object.freeze({
  PARAMS: 0, SETTINGS: 1, COORDINATES: 2, BIOMES: 3, NOTES: 4, SVG: 5,
  GRID: 6, GRID_H: 7, GRID_PREC: 8, GRID_F: 9, GRID_T: 10, GRID_TEMP: 11,
  FEATURES: 12, CULTURES: 13, STATES: 14, BURGS: 15,
  CELL_BIOME: 16, CELL_BURG: 17, CELL_CONF: 18, CELL_CULTURE: 19, CELL_FL: 20,
  CELL_POP: 21, CELL_RIVER: 22, CELL_ROAD_DEPRECATED: 23, CELL_SUITABILITY: 24,
  CELL_STATE: 25, CELL_RELIGION: 26, CELL_PROVINCE: 27, CELL_CROSSROAD_DEPRECATED: 28,
  RELIGIONS: 29, PROVINCES: 30, NAMESBASE: 31, RIVERS: 32, RULERS_DEPRECATED: 33,
  FONTS: 34, MARKERS: 35, CELL_ROUTES: 36, ROUTES: 37, ZONES: 38, ICE: 39,
  CELL_GOOD: 40, GOODS: 41, MARKETS: 42, DEALS: 43, CELL_MARKET: 44,
  CUSTOM_GOOD_ICONS: 45, MEASURERS: 46, LABELS: 47, STYLE: 48, RELIEF: 49,
  LAYERS: 50, GRAPH_OVERRIDE: 51, JOURNEYS: 52,
});

/** ここまでの行が無いと地形・国家が読めない */
const REQUIRED_MIN_LINES = LINE.RIVERS + 1;
const CRLF = "\r\n";

/** 解釈せず原文のまま保持する行（書き出し時に元の位置へ戻す） */
const PASSTHROUGH_LINES = [
  LINE.CELL_CONF, LINE.CELL_FL, LINE.CELL_ROAD_DEPRECATED, LINE.CELL_SUITABILITY,
  LINE.CELL_CROSSROAD_DEPRECATED, LINE.RULERS_DEPRECATED, LINE.FONTS,
  LINE.CELL_GOOD, LINE.CELL_MARKET, LINE.CUSTOM_GOOD_ICONS, LINE.LABELS,
  LINE.STYLE, LINE.LAYERS, LINE.GRAPH_OVERRIDE, LINE.JOURNEYS,
];
const KNOWN_LINE_COUNT = LINE.JOURNEYS + 1;

export class MapParseError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "MapParseError";
    this.detail = detail;
  }
}

/**
 * @param {string} text  デコード済みの .map 全文
 * @returns {{map: object, warnings: string[]}}
 */
export function parseAzgaarText(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new MapParseError("ファイルが空です");
  }
  const lines = text.split(CRLF);
  if (lines.length < REQUIRED_MIN_LINES) {
    const hint = lines.length === 1 && text.includes("\n")
      ? "（改行が LF のみです。エディタ等で保存し直されたファイルかもしれません）" : "";
    throw new MapParseError(
      `Azgaar形式として読めません: 行数が${lines.length}行しかありません${hint}`, { lines: lines.length });
  }

  // 警告は呼び出しごとに独立して集める（グローバルに溜めない）
  const warnings = [];
  const json = (line, fallback, label) => tryJson(line, fallback, label, warnings);

  const map = createEmptyMap();
  map.meta.source = "azgaar";
  map.meta.lineCount = lines.length;

  parseParams(lines[LINE.PARAMS], map);
  parseSettings(lines, map, warnings);
  map.biomesData = json(lines[LINE.BIOMES], [], "バイオーム");
  // 旧形式のみ。新形式では各エンティティが note を持つ
  map.notes = json(lines[LINE.NOTES], [], "ノート");
  // SVG は描画済みの画像。読み込みには不要で巨大なので、原文のまま保持する
  map.rawLines[LINE.SVG] = lines[LINE.SVG] ?? "";

  parseGrid(lines, map, json);

  const p = map.pack;
  p.features = json(lines[LINE.FEATURES], [], "地形フィーチャ");
  p.cultures = json(lines[LINE.CULTURES], [], "文化");
  p.states = json(lines[LINE.STATES], [], "国家");
  p.burgs = json(lines[LINE.BURGS], [], "都市");
  p.religions = json(lines[LINE.RELIGIONS], [], "宗教");
  p.provinces = json(lines[LINE.PROVINCES], [], "属州");
  p.rivers = json(lines[LINE.RIVERS], [], "河川");

  const c = p.cells;
  c.biome = parseNumbers(lines[LINE.CELL_BIOME]);
  c.burg = parseNumbers(lines[LINE.CELL_BURG]);
  c.culture = parseNumbers(lines[LINE.CELL_CULTURE]);
  c.pop = parseNumbers(lines[LINE.CELL_POP], true);
  c.river = parseNumbers(lines[LINE.CELL_RIVER]);
  c.state = parseNumbers(lines[LINE.CELL_STATE]);
  // 古い版では宗教・属州の行が空のことがある（公式も同様に空配列で補う）
  const n = c.biome.length;
  c.religion = lines[LINE.CELL_RELIGION] ? parseNumbers(lines[LINE.CELL_RELIGION]) : new Array(n).fill(0);
  c.province = lines[LINE.CELL_PROVINCE] ? parseNumbers(lines[LINE.CELL_PROVINCE]) : new Array(n).fill(0);

  map.namesbase = parseNamesbase(lines[LINE.NAMESBASE]);
  map.markers = json(lines[LINE.MARKERS], [], "マーカー");
  map.cellRoutes = json(lines[LINE.CELL_ROUTES], {}, "セル別ルート");
  map.routes = json(lines[LINE.ROUTES], [], "ルート");
  map.zones = json(lines[LINE.ZONES], [], "ゾーン");
  map.ice = json(lines[LINE.ICE], [], "氷");
  map.goods = json(lines[LINE.GOODS], [], "交易品");
  map.markets = json(lines[LINE.MARKETS], [], "市場");
  map.deals = json(lines[LINE.DEALS], [], "交易");
  map.measurers = json(lines[LINE.MEASURERS], [], "計測線");
  map.relief = json(lines[LINE.RELIEF], [], "地形アイコン");
  // 頂点の手動移動。形状の再構築に必要なので解釈する（原文は passthrough にも残す）
  map.graphOverride = json(lines[LINE.GRAPH_OVERRIDE], {}, "形状の手動編集");

  for (const i of PASSTHROUGH_LINES) if (i < lines.length) map.passthrough[i] = lines[i];
  // 既知の範囲より後ろの行（将来の版で追加された行）も失わない
  for (let i = KNOWN_LINE_COUNT; i < lines.length; i++) map.passthrough[i] = lines[i];

  return { map, warnings };
}

/**
 * バイト列を読む（gzip展開は呼び出し側 io/loader.js の責務）。
 * 必ずバイナリからデコードすること。テキストモードは CRLF を LF に変換して行分割を壊す。
 */
export function parseAzgaarBytes(bytes) {
  return parseAzgaarText(new TextDecoder("utf-8").decode(bytes));
}

// ---------- 個別パーサー ----------

function parseParams(line, map) {
  const f = (line ?? "").split("|");
  map.meta.version = f[0] || "";
  map.meta.description = f[1] || "";
  map.meta.exportedAt = f[2] || "";
  map.meta.seed = f[3] || "";
  map.meta.width = toInt(f[4]);
  map.meta.height = toInt(f[5]);
  map.meta.mapId = f[6] || "";
  map.meta.extraHeader = f.slice(7);
}

/** バージョン文字列 "1.151.1" を比較。a < b なら負 */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 設定行の新旧判定（公式 migrateLegacySettings と同じ条件）:
 *   バージョン < 1.152.0 かつ 行が "{" で始まらない → 旧形式
 */
export function isLegacySettings(version, line) {
  return compareVersions(version, "1.152.0") < 0 && !(line ?? "").trimStart().startsWith("{");
}

function parseSettings(lines, map, warnings) {
  const line = lines[LINE.SETTINGS] ?? "";
  map.settings.raw = line;

  if (!isLegacySettings(map.meta.version, line)) {
    map.settings.format = "json";
    const o = tryJson(line, null, "設定", warnings);
    map.settings.options = o;
    if (o) {
      map.meta.name = o.lore?.name ?? "";
      map.coordinates = o.geography?.coordinates ?? null;
    }
    return;
  }

  // 旧形式: 公式 migrateLegacySettings（auto-update.ts）と同じ対応関係
  map.settings.format = "legacy";
  const f = line.split("|");
  const num = (v, d) => (v !== undefined && v !== "" && !Number.isNaN(+v) ? +v : d);
  const legacyOptions = tryJson(f[19], null, "旧オプション", warnings, true);
  const opt = Array.isArray(legacyOptions) ? {} : legacyOptions ?? {};

  map.coordinates = tryJson(lines[LINE.COORDINATES], null, "座標", warnings);
  map.meta.name = f[20] || "";
  map.settings.options = {
    seed: map.meta.seed,
    graph: { width: map.meta.width || 1280, height: map.meta.height || 800 },
    geography: {
      mapSize: num(f[14], 100), latitude: num(f[15], 50), longitude: num(f[25], 50),
      coordinates: map.coordinates,
    },
    climate: {
      temperature: { equator: num(f[16], 27), northPole: num(f[17], -30), southPole: num(f[17], -15) },
      precipitation: num(f[18], 100),
      winds: Array.isArray(legacyOptions) ? legacyOptions : opt.winds ?? [225, 45, 225, 315, 135, 315],
    },
    lore: { name: map.meta.name },
    units: {
      distance: { unit: f[0] || "km", scale: num(f[1], 3) },
      area: { unit: f[2] || "square" },
      height: { unit: f[3] || "m", exponent: num(f[4], 2) },
      temperature: { unit: f[5] || "°C" },
      population: { scale: num(f[12], 1000), urbanization: { rate: num(f[13], 1), density: num(f[24], 10) } },
    },
    labels: opt.labels, military: opt.military, transports: opt.transports,
    coastline: opt.coastline, burgs: opt.burgs,
  };
}

function parseGrid(lines, map, json) {
  const g = json(lines[LINE.GRID], {}, "グリッド");
  map.grid.spacing = g.spacing ?? 0;
  map.grid.cellsX = g.cellsX ?? 0;
  map.grid.cellsY = g.cellsY ?? 0;
  map.grid.boundary = g.boundary ?? [];
  map.grid.points = g.points ?? [];
  map.grid.features = g.features ?? [];
  map.grid.cellsDesired = g.cellsDesired; // 無ければ undefined（書き出し時に項目ごと省く）
  map.grid.h = parseNumbers(lines[LINE.GRID_H]);
  map.grid.prec = parseNumbers(lines[LINE.GRID_PREC]);
  map.grid.f = parseNumbers(lines[LINE.GRID_F]);
  map.grid.t = parseNumbers(lines[LINE.GRID_T]);
  map.grid.temp = parseNumbers(lines[LINE.GRID_TEMP]);
}

/**
 * namesbase: "/" 区切りで各ベース、"|" 区切りで
 * [名前, 最小文字数, 最大文字数, 重複可能な文字, 複数語確率, 語彙(カンマ区切り)]
 * 語彙が空のベースは「既定の語彙を使う」の意味（公式は既定と同じなら空で保存する）。
 */
export function parseNamesbase(line) {
  if (!line) return [];
  return line.split("/").map((seg) => {
    const f = seg.split("|");
    return {
      name: f[0] ?? "", min: toInt(f[1]), max: toInt(f[2]), d: f[3] ?? "", m: Number(f[4]) || 0,
      words: (f[5] ?? "").split(",").filter((w) => w.length > 0),
    };
  });
}

// ---------- 共通ヘルパー ----------

/** カンマ区切りの数値列 → 配列。空文字は空配列 */
export function parseNumbers(line, allowFloat = false) {
  const s = (line ?? "").trim();
  if (!s) return [];
  const parts = s.split(",");
  const out = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]);
    out[i] = Number.isNaN(v) ? 0 : allowFloat ? v : Math.trunc(v);
  }
  return out;
}

/**
 * JSON を安全に読む。壊れた行があっても全体の読み込みは止めず既定値を返すが、
 * 黙って失敗させず warnings に積む（UI から見えるようにするため）。
 */
function tryJson(line, fallback, label, warnings, silent = false) {
  if (line === undefined || line === "") return fallback;
  try {
    return JSON.parse(line);
  } catch (e) {
    if (!silent) warnings.push(`${label}の読み込みに失敗しました: ${e.message}`);
    return fallback;
  }
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}
