// 保存ファイルに書くアプリの版（情報として。保存形式の版 SAVE_SCHEMA とは独立）
// v6.20.1: アプリの版（js/version.js）と同じにする。以前は "6.13.0" に固定されていて、新しい版で保存しても古い版と書かれていた
export { APP_VERSION as APP_VERSION_FOR_SAVE } from "../../version.js";
