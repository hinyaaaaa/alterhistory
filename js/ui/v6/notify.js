// v6 UI の通常通知。v5 の js/ui/banner.js（約 5 秒で自動消去・種別の色分け）をそのまま使い、v6 の画面の上部中央に一時表示する。
//   重大ニュース（v6 の clock.js のキュー → 中央の確認画面）とは別系統。通知を履歴として保存せず、右側に通知欄・タブも作らない。
//   長いエラーは、閉じるまで画面内に残る（banner.js の persistLongError）。
import { initBanner } from "../banner.js";
const subs = [], st = { error: null, warnings: [], notice: null, busy: null, map: true };
const emit = () => subs.forEach((f) => f(st));
let ready = false;
export function initNotify() {
  if (ready || typeof document === "undefined" || !document.getElementById("banner")) return; ready = true;
  initBanner({ store: { subscribe: (f) => { subs.push(f); f(st); } }, actions: { dismissMessage: () => { st.error = null; st.warnings = []; st.notice = null; emit(); } }, persistLongError: true });
}
/** kind: "error"（赤）| "warn"（黄）| "ok"（青のお知らせ）。メッセージは短く具体的に（何の操作がどうなったか） */
export function notify(kind, message) {
  st.error = null; st.warnings = []; st.notice = null;
  if (kind === "error") st.error = String(message); else st.notice = (kind === "warn" ? "注意: " : "") + String(message);
  emit();
}
