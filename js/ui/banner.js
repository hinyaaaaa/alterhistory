// メッセージ表示：読み込みの失敗（赤）と警告（黄）、読み込み中の表示、空の状態の案内。
import { byId } from "./dom.js";

export function initBanner({ store, actions }) {
  const banner = byId("banner");
  const body = byId("banner-body");
  const loading = byId("loading");
  const loadingText = byId("loading-text");
  const empty = byId("empty-state");
  byId("banner-close").addEventListener("click", () => actions.dismissMessage());

  store.subscribe((s) => {
    empty.hidden = !!s.map;
    loading.hidden = !s.busy;
    if (s.busy) loadingText.textContent = s.busy;

    banner.classList.remove("info");
    if (s.error) {
      banner.hidden = false; banner.classList.remove("warn");
      body.textContent = s.error;
    } else if (s.warnings?.length) {
      banner.hidden = false; banner.classList.add("warn");
      const shown = s.warnings.slice(0, 5).map((w) => `・${w}`).join("\n");
      const more = s.warnings.length > 5 ? `\n…ほか ${s.warnings.length - 5} 件` : "";
      body.textContent = `読み込みは完了しましたが、注意があります（${s.warnings.length}件）\n${shown}${more}`;
    } else if (s.notice) {
      banner.hidden = false; banner.classList.remove("warn"); banner.classList.add("info");
      body.textContent = s.notice;
    } else {
      banner.hidden = true;
    }
  });
}
