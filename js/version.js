// アプリの版。package.json の version と同じにする（tests/version.test.mjs が確認する）。
//   メジャー: 見た目の全面刷新・保存形式が変わる大きな変更／マイナー: 機能の追加／パッチ: 不具合の修正
export const APP_VERSION = "5.3.1";
export const APP_VERSION_NAME = "描画性能の修正（25万セルの初回表示）";
export const APP_VERSION_LABEL = `v${APP_VERSION} ${APP_VERSION_NAME}`;
// ビルド識別子。scripts/build.mjs が、js/ のソースの内容から決めた値を埋め込む（dist/build-info.json と同じ）。ソースを直接読む実行（テスト等）では "dev"。
export const APP_BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
