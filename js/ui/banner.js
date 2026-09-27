// メッセージ表示：読み込みの失敗（赤）と警告（黄）、読み込み中の表示、空の状態の案内。
// 通知（エラー・警告・お知らせ全て）は表示から一定時間で自動的に消える。
import { byId } from "./dom.js";

const AUTO_DISMISS_MS = 5000;

export function initBanner({ store, actions }) {
  const banner = byId("banner");
  const body = byId("banner-body");
  const loading = byId("loading");
  const loadingText = byId("loading-text");
  const empty = byId("empty-state");
  byId("banner-close").addEventListener("click", () => actions.dismissMessage());

  let dismissTimer = 0;
  let lastKey = null;

  store.subscribe((s) => {
    empty.hidden = !!s.map;
    loading.hidden = !s.busy;
    if (s.busy) loadingText.textContent = s.busy;

    banner.classList.remove("info");
    let key = null;
    if (s.error) {
      banner.hidden = false; banner.classList.remove("warn");
      body.textContent = s.error;
      key = `error:${s.error}`;
    } else if (s.warnings?.length) {
      banner.hidden = false; banner.classList.add("warn");
      const shown = s.warnings.slice(0, 5).map((w) => `・${w}`).join("\n");
      const more = s.warnings.length > 5 ? `\n…ほか ${s.warnings.length - 5} 件` : "";
      body.textContent = `読み込みは完了しましたが、注意があります（${s.warnings.length}件）\n${shown}${more}`;
      key = `warn:${s.warnings.length}`;
    } else if (s.notice) {
      banner.hidden = false; banner.classList.remove("warn"); banner.classList.add("info");
      body.textContent = s.notice;
      key = `notice:${s.notice}`;
    } else {
      banner.hidden = true;
    }

    // 表示内容が変わった時だけタイマーを張り直す（連続更新のたびに5秒延長されるのを防ぐ）
    if (key !== lastKey) {
      lastKey = key;
      clearTimeout(dismissTimer);
      if (key) dismissTimer = setTimeout(() => actions.dismissMessage(), AUTO_DISMISS_MS);
    }
  });
}
