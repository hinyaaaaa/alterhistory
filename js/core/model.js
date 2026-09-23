// MapData：全層が共有するデータ構造。
// 実ファイル(.map v1.139 / v1.151)で検証した構造に基づく。
// 純粋ロジック層：DOM・ファイルI/Oに依存しない。

export const FORMAT_VERSION = "1.151.1";

/**
 * セル単位の配列（長さ = セル数）。
 * 各配列の意味は実データの突き合わせで確定したもの（docs/MAP_FORMAT_SPEC.md 参照）。
 */
export const CELL_ARRAYS = Object.freeze({
  biome: "biome",       // L16: バイオームID (0-12)
  burg: "burg",         // L17: 都市ID (0=なし)
  culture: "culture",   // L19: 文化ID
  pop: "pop",           // L21: 人口（小数）
  river: "river",       // L22: 河川ID (0=なし)
  state: "state",       // L25: 国家ID
  religion: "religion", // L26: 宗教ID
  province: "province", // L27: 属州ID
});

/** 空の MapData を作る。フィールドは全て既定値を持つ（欠損に強くするため） */
export function createEmptyMap() {
  return {
    meta: {
      version: FORMAT_VERSION,
      description: "",
      exportedAt: "",
      seed: "",
      width: 0,
      height: 0,
      mapId: "",
      // ヘッダー行の7番目以降の項目（ALTERHISTORY の目印など）。書き戻し時にそのまま戻す
      extraHeader: [],
      // 読み込んだファイルの行数。書き出し時に「元に無かった行を勝手に足さない」ための基準。
      // 新規作成の地図は、現行の全行を持つ 53 行構成として扱う。
      lineCount: 53,
      name: "",
      source: "alterhistory", // "azgaar" | "alterhistory"
    },
    // settings.format: "json"(v1.152.0以降) | "legacy"(パイプ区切り)。raw は元の行の原文。
    // options は新旧どちらから読んでも同じ形（公式の options.map と同じ構造）に正規化する。
    settings: { format: "json", raw: "", options: null },
    coordinates: null,
    biomesData: [],
    notes: [],
    grid: {
      spacing: 0, cellsX: 0, cellsY: 0, boundary: [], points: [],
      features: [], cellsDesired: undefined, // 旧版のみ保存される項目。無い場合は undefined のまま扱う
      // grid側セル配列
      h: [], prec: [], f: [], t: [], temp: [],
    },
    pack: {
      features: [],
      cultures: [],
      states: [],
      burgs: [],
      religions: [],
      provinces: [],
      rivers: [],
      // pack.cells：確定した配列のみ
      cells: {
        biome: [], burg: [], culture: [], pop: [],
        river: [], state: [], religion: [], province: [],
      },
    },
    namesbase: [],
    routes: [],
    cellRoutes: {},
    zones: [],
    ice: [],
    goods: [],
    markets: [],
    deals: [],        // 交易（L43）
    markers: [],      // マーカー（L35）。文章（ノート）の付与先
    relief: [],       // 地形アイコン（L49）
    measurers: [],    // 計測線（L46）
    // 今回のアプリで解釈しない行。位置をキーに原文を保持し、書き出し時にそのまま戻す
    // （情報を失わないための仕組み）。詳細は docs/MAP_FORMAT_SPEC.md
    passthrough: {},
    // SVG等、読み込みをスキップした巨大な行の原文
    rawLines: {},
    // ALTERHISTORY 固有の拡張データ（io/native-format.js）。Azgaar 形式で読んだ場合は空の既定値
    ext: null,
    // セル形状の手動編集（頂点の移動）。L51 の読み取り専用コピー。書き出しでは passthrough の原文を戻す
    graphOverride: {},
    // 世界の時刻（年月）。core/sim/time.js が扱う。ファイルには保存せず、
    // ALTERHISTORY拡張データ(ext.data.worldTime)に保存する（io層で読み書き）。
    worldTime: { year: 1, month: 1 },
    // 実行時のみ使う「版数」。編集のたびに、影響する層の数字を進める。
    // 描画の層キャッシュや凡例が「作り直す必要があるか」を判断するために使う（ファイルには保存しない）。
    //   terrain: 地形（バイオーム・水陸）/ politics: 国家・文化・宗教・属州 / places: 都市・マーカー等
    rev: { terrain: 0, politics: 0, places: 0 },
    // 実行時のみ使う派生データ（セル形状）。ファイルには保存しない。
    // { gridVoronoi, pack:{p,g,h,cells,vertices} } — core/derive.js の buildGeometry で作る
    geometry: null,
  };
}

/** セル数を返す。grid が空なら pack.cells から推定 */
export function cellCount(map) {
  return map.pack.cells.biome.length || map.grid.h.length || 0;
}

/**
 * MapData の整合性を検証し、問題点のリストを返す（空なら健全）。
 * 読み込み直後・保存前に呼び、壊れたデータをUIに渡さない。
 */
export function validateMap(map) {
  const problems = [];
  const n = cellCount(map);
  if (n === 0) problems.push("セルが1つもありません");

  for (const [key, arr] of Object.entries(map.pack.cells)) {
    if (arr.length !== n) {
      problems.push(`pack.cells.${key} の長さ(${arr.length})がセル数(${n})と一致しません`);
    }
  }

  const refCheck = (label, arr, limit) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < 0 || arr[i] >= limit) {
        problems.push(`${label} のセル${i}が範囲外の値(${arr[i]})を参照しています`);
        return; // 最初の1件だけ報告（大量出力を避ける）
      }
    }
  };
  refCheck("state", map.pack.cells.state, map.pack.states.length);
  refCheck("culture", map.pack.cells.culture, map.pack.cultures.length);
  refCheck("burg", map.pack.cells.burg, map.pack.burgs.length);
  refCheck("province", map.pack.cells.province, map.pack.provinces.length);

  // 形状が作られている場合は、属性配列と形状のセル数が一致していること
  if (map.geometry && map.geometry.pack.p.length !== n) {
    problems.push(`形状のセル数(${map.geometry.pack.p.length})が属性配列のセル数(${n})と一致しません`);
  }
  return problems;
}
