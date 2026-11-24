// アプリの版。package.json の version と同じにする（tests/version.test.mjs が確認する）。
//   メジャー: 見た目の全面刷新・保存形式が変わる大きな変更／マイナー: 機能の追加／パッチ: 不具合の修正
export const APP_VERSION = "7.0.0-rc.1";
export const APP_VERSION_NAME = "都市と戦争の作り直し（集落・街道・降伏と講和会議・同盟・動員。UI 作り直し前の統合版）";
export const APP_VERSION_LABEL = `v${APP_VERSION} ${APP_VERSION_NAME}`;
// ビルド識別子。scripts/build.mjs が、js/ のソースの内容から決めた値を埋め込む（dist/build-info.json と同じ）。ソースを直接読む実行（テスト等）では "dev"。
export const APP_BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
