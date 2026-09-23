// ALTERHISTORY 形式：Azgaar 形式の上位互換。
//
// 構造:
//   ・ファイルの 0〜52 行目は Azgaar 形式そのまま（Azgaar 公式でも開ける）
//   ・ヘッダー行（0行目）の7番目の項目に目印 "ALTERHISTORY/1" を入れる
//   ・ALTERHISTORY 固有のデータは、ファイルの「最後の行」に JSON で1行追加する
//
// 最後の行に置く理由: 将来 Azgaar が行を追加しても、その行と衝突しないため。
// 既存の Azgaar 版は未知の行を読み飛ばすので、追加行があっても影響しない（公式のソースで確認）。
//
// 純粋ロジック層：DOM に依存しない。

export const NATIVE_MARKER = "ALTERHISTORY/1";
export const APP_NAME = "ALTERHISTORY";
export const EXT_FORMAT = 1;
/** 拡張行を置く最小の行番号（Azgaar 現行の最終行 52 の次） */
export const MIN_EXT_INDEX = 53;

export function createExtension() {
  return {
    app: APP_NAME,
    format: EXT_FORMAT,
    savedAt: "",
    // Azgaar 形式部分の行数（拡張行と、それを置くための空行パディングを含まない）。
    // 読み込み時に元の行数を復元し、再保存で行が増えないようにする。
    lineCount: 0,
    // ALTERHISTORY 独自データの置き場（世界設定・ノート等。機能ごとに追加していく）
    data: {},
  };
}

export const isNativeHeader = (extraHeader) => (extraHeader?.[0] ?? "").startsWith("ALTERHISTORY");

/**
 * 読み込み済みの MapData から拡張行を取り出し、map.ext に取り付ける。
 * 拡張行は passthrough から取り除く（書き出し時に二重にならないように）。
 * @returns {string[]} 警告
 */
export function attachExtension(map) {
  const warnings = [];
  map.ext = createExtension();
  if (!isNativeHeader(map.meta.extraHeader)) return warnings;
  // worldTime は Azgaar形式読み込み時点では既定値のまま。ALTERHISTORY拡張から後で復元する

  map.meta.source = "alterhistory";
  const indexes = Object.keys(map.passthrough).map(Number).filter((i) => i >= MIN_EXT_INDEX);
  if (indexes.length === 0) {
    warnings.push("ALTERHISTORY の拡張データが見つかりません（Azgaar 形式として読み込みました）");
    return warnings;
  }
  const last = Math.max(...indexes);
  try {
    const ext = JSON.parse(map.passthrough[last]);
    if (ext?.app !== APP_NAME) throw new Error("app が ALTERHISTORY ではありません");
    if (typeof ext.format === "number" && ext.format > EXT_FORMAT) {
      warnings.push(`このファイルは新しい版の ALTERHISTORY (形式${ext.format}) で保存されています。一部の情報が失われる可能性があります`);
    }
    map.ext = { ...createExtension(), ...ext, data: ext.data ?? {} };
    delete map.passthrough[last];
    if (map.ext.data.worldTime && Number.isInteger(map.ext.data.worldTime.year) && Number.isInteger(map.ext.data.worldTime.month)) {
      map.worldTime = { year: map.ext.data.worldTime.year, month: map.ext.data.worldTime.month };
    }
    // 元の行数を復元する。記録が無い・不正なときは、拡張行の直前までを元の範囲とみなす
    const n = ext.lineCount;
    map.meta.lineCount = Number.isInteger(n) && n > 0 && n <= last ? n : last;
  } catch (e) {
    warnings.push(`ALTERHISTORY の拡張データが壊れているため無視しました: ${e.message}`);
  }
  return warnings;
}
