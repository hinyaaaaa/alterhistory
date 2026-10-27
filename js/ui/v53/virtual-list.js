// v5.3 UI: 固定行高の仮想スクロール一覧。DOM に出す行は、見えている範囲＋余白だけ（件数が何万・何百万でも一定）。
// 表示件数の制限であって、データの削除・要約ではない（指示書 5.1）。
//   getPage(offset, limit) → { total, rows }   renderRow(row, index) → Element
//
// 件数が多いとき: ブラウザは要素の高さに上限がある（Chrome 約 3,300 万 px、Firefox 約 1,790 万 px）。
//   行高 52px × 60 万件で上限を超え、末尾に届かなくなる。そこでスクロールバーの長さ（仮想の高さ）を MAX_PX で打ち切り、
//   スクロール位置の割合（0〜1）を「先頭から何番目の行を一番上に出すか」へ比例で対応づける。
//   ・全件に到達できる（割合 1 で最後の行が一番下）／行の位置は端数まで合わせるので、ゆっくりスクロールしても飛ばない
//   ・件数が多いほど 1 ノッチで動く行数は粗くなる。細かく探すには検索・絞り込み・期間を使う
export const MAX_PX = 6_000_000;

export function createVList({ rowHeight = 48, overscan = 6, maxPx = MAX_PX, getPage, renderRow, onPick = null, label = "一覧", empty = "該当するものがありません" }) {
  const root = document.createElement("div");
  root.className = "v53-vlist"; root.tabIndex = 0; root.setAttribute("role", "listbox"); root.setAttribute("aria-label", label);
  const spacer = document.createElement("div"); spacer.className = "v53-vlist-spacer";
  const box = document.createElement("div"); box.className = "v53-vlist-rows";
  const emptyEl = document.createElement("p"); emptyEl.className = "v53-empty"; emptyEl.textContent = empty; emptyEl.hidden = true;
  spacer.append(box); root.append(spacer, emptyEl);
  let total = 0, selectedId = null, lastFirst = 0, raf = 0, rows = [], isScaled = false;
  const vHeight = () => Math.min(total * rowHeight, maxPx);

  /** 現在のスクロール位置から、一番上に出す行（端数つき） */
  function topIndex(vh) {
    if (!isScaled) return root.scrollTop / rowHeight;
    const visible = Math.ceil(vh / rowHeight), maxScroll = Math.max(1, vHeight() - vh);
    return Math.min(1, Math.max(0, root.scrollTop / maxScroll)) * Math.max(0, total - visible);
  }

  function render() {
    raf = 0;
    const vh = root.clientHeight || 400, count = Math.ceil(vh / rowHeight) + overscan * 2;
    isScaled = total * rowHeight > maxPx;
    let top = topIndex(vh), first = Math.max(0, Math.floor(top) - overscan), page = getPage(first, count);
    if (page.total !== total) { // 件数が変わった（検索の完了・月の進行）。新しい件数で 1 回だけやり直す
      total = page.total; isScaled = total * rowHeight > maxPx;
      top = Math.min(topIndex(vh), Math.max(0, total - 1)); first = Math.max(0, Math.floor(top) - overscan); page = getPage(first, count);
    }
    total = page.total; rows = page.rows; lastFirst = first;
    spacer.style.height = `${vHeight()}px`;
    // 打ち切り時は、一番上に出す行（端数つき）が表示領域の上端に来るよう並びの位置を合わせる
    box.style.transform = `translateY(${isScaled ? root.scrollTop + (first - top) * rowHeight : first * rowHeight}px)`;
    emptyEl.hidden = total > 0;
    box.replaceChildren();
    page.rows.forEach((r, k) => {
      const el = renderRow(r, first + k);
      el.style.height = `${rowHeight}px`; el.dataset.index = String(first + k); el.setAttribute("role", "option");
      const on = r.id != null && String(r.id) === String(selectedId);
      el.classList.toggle("on", on); el.setAttribute("aria-selected", String(on));
      if (onPick) el.addEventListener("click", () => { selectedId = r.id; onPick(r, first + k); render(); });
      box.append(el);
    });
  }
  const schedule = () => { if (raf) return; if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(render); else render(); };
  root.addEventListener("scroll", schedule);

  /** 行 n が見える位置へスクロールする（打ち切り時は比例の逆変換） */
  function scrollToIndex(n) {
    const vh = root.clientHeight || 400, visible = Math.ceil(vh / rowHeight);
    if (!isScaled) {
      if (n * rowHeight < root.scrollTop) root.scrollTop = n * rowHeight;
      else if ((n + 1) * rowHeight > root.scrollTop + vh) root.scrollTop = (n + 1) * rowHeight - vh;
      return;
    }
    const top = topIndex(vh); if (n >= top && n + 1 <= top + visible) return;
    const want = Math.min(Math.max(0, n - Math.floor(visible / 2)), Math.max(0, total - visible));
    root.scrollTop = (want / Math.max(1, total - visible)) * Math.max(1, vHeight() - vh);
  }
  root.addEventListener("keydown", (e) => {
    if (!onPick || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const idx = rows.findIndex((r) => String(r.id) === String(selectedId));
    const n = Math.max(0, Math.min(total - 1, (idx < 0 ? lastFirst : lastFirst + idx) + (e.key === "ArrowDown" ? 1 : -1)));
    const r = getPage(n, 1).rows[0]; if (!r) return;
    selectedId = r.id; onPick(r, n); scrollToIndex(n); render();
  });
  return {
    el: root, refresh: render,
    reset() { root.scrollTop = 0; render(); },
    setSelected(id) { selectedId = id; render(); },
    total: () => total, renderedCount: () => box.children.length, scaled: () => isScaled, scrollToIndex,
    /** 全体の割合（0〜1）の位置へ移る。打ち切り時のおおまかなジャンプ用 */
    scrollToFraction(f) { const vh = root.clientHeight || 400; root.scrollTop = Math.min(1, Math.max(0, f)) * Math.max(0, vHeight() - vh); render(); },
  };
}
