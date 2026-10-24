// 固定行高の仮想スクロール。行が何万件あっても、DOM は見えている行＋余白だけ。
// getRows(offset, limit) → { total, rows } を呼び、renderRow(row, index) が行の要素を返す。
export function createVirtualList({ rowHeight = 30, height = 360, overscan = 6, getRows, renderRow, onSelect = null }) {
  const root = document.createElement("div"); root.className = "vlist"; root.style.cssText = `height:${height}px;overflow-y:auto;position:relative`; root.tabIndex = 0; root.setAttribute("role", "listbox");
  const spacer = document.createElement("div"); spacer.style.cssText = "position:relative;width:100%"; const rowsBox = document.createElement("div"); rowsBox.style.cssText = "position:absolute;left:0;right:0;top:0"; spacer.append(rowsBox); root.append(spacer);
  let total = 0, sel = -1, shown = 0;
  function render() {
    const top = root.scrollTop, vh = root.clientHeight || height, first = Math.max(0, Math.floor(top / rowHeight) - overscan), count = Math.ceil(vh / rowHeight) + overscan * 2;
    const res = getRows(first, count); total = res.total; spacer.style.height = `${total * rowHeight}px`; rowsBox.style.top = `${first * rowHeight}px`; rowsBox.replaceChildren();
    res.rows.forEach((r, k) => { const idx = first + k, e = renderRow(r, idx); e.style.height = `${rowHeight}px`; e.style.boxSizing = "border-box"; e.dataset.index = String(idx); e.setAttribute("role", "option"); if (idx === sel) { e.classList.add("on"); e.setAttribute("aria-selected", "true"); } if (onSelect) { e.style.cursor = "pointer"; e.addEventListener("click", () => { sel = idx; onSelect(r, idx); render(); }); } rowsBox.append(e); }); shown = res.rows.length;
  }
  root.addEventListener("scroll", render);
  root.addEventListener("keydown", (e) => { if (!onSelect || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return; e.preventDefault(); const n = Math.max(0, Math.min(total - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); sel = n; const r = getRows(n, 1).rows[0]; if (r !== undefined) onSelect(r, n); if (n * rowHeight < root.scrollTop) root.scrollTop = n * rowHeight; else if ((n + 1) * rowHeight > root.scrollTop + root.clientHeight) root.scrollTop = (n + 1) * rowHeight - root.clientHeight; render(); });
  return { el: root, refresh: render, total: () => total, shown: () => shown, select(i) { sel = i; render(); }, scrollToIndex(i) { root.scrollTop = i * rowHeight; render(); } };
}
