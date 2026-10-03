// 拡張データ（ALTERHISTORY 独自の情報）の入れ物を用意する。
// Azgaar 形式には無い情報（時代・同盟・戦争・旅・外交の記録など）は map.ext.data に保存する。
//
// 純粋ロジック層：DOM に依存しない。

export function ensureExt(map) {
  if (!map.ext) map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
  map.ext.data ??= {};
  return map.ext;
}
