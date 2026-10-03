// 右のパネル（地図編集・歴史をつくる）を、パネルの × で小さくし、元の場所（地図の右端）の
// 小さなボタンで開き直せるようにする。
//
// 「小さくした」ときだけボタンが出る（上部バーのボタンで開閉したときは出さない）。
// 開いたら（どの方法でも）ボタンは消える。
import { byId } from "./dom.js";

/**
 * @param {Array<{panel:string, close:string, tab:string, open:string}>} defs
 *   panel: パネルの id / close: パネルの × の id / tab: 展開ボタンの id / open: 上部バーの開くボタンの id
 */
export function initPanelDock(defs) {
  for (const d of defs) {
    const panel = byId(d.panel), tab = byId(d.tab);
    let minimized = false;
    const sync = () => { tab.hidden = !(minimized && panel.hidden); };

    byId(d.close).addEventListener("click", () => { minimized = true; sync(); });
    // 上部バーのボタンで閉じたときは「小さくした」ではないので、展開ボタンは出さない
    byId(d.open).addEventListener("click", () => { minimized = false; sync(); }, true);
    // どんな方法で開いても、展開ボタンは消す
    new MutationObserver(() => { if (!panel.hidden) minimized = false; sync(); })
      .observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    // 展開ボタン = 上部バーのボタンを押したのと同じ
    tab.addEventListener("click", () => { minimized = false; sync(); byId(d.open).click(); });
    sync();
  }
}
