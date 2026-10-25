// v5.3 UI: 固定行高の仮想スクロール一覧。DOM に出す行は、見えている範囲＋余白だけ（件数が何万でも一定）。
// 表示件数の制限であって、データの削除・要約ではない（指示書 5.1）。
//   getPage(offset, limit) → { total, rows }   renderRow(row, index) → Element
export function createVList({ rowHeight = 48, overscan = 6, getPage, renderRow, onPick = null, label = "一覧", empty = "該当するものがありません" }) {
  const root = document.createElement("div");
  root.className = "v53-vlist"; root.tabIndex = 0; root.setAttribute("role", "listbox"); root.setAttribute("aria-label", label);
  const spacer = document.createElement("div"); spacer.className = "v53-vlist-spacer";
  const box = document.createElement("div"); box.className = "v53-vlist-rows";
  const emptyEl = document.createElement("p"); emptyEl.className = "v53-empty"; emptyEl.textContent = empty; emptyEl.hidden = true;
  spacer.append(box); root.append(spacer, emptyEl);
  let total = 0, selectedId = null, lastFirst = 0, raf = 0, rows = [];

  function render() {
    raf = 0;
    const vh = root.clientHeight || 400;
    const first = Math.max(0, Math.floor(root.scrollTop / rowHeight) - overscan);
    const count = Math.ceil(vh / rowHeight) + overscan * 2;
    const page = getPage(first, count);
    total = page.total; rows = page.rows; lastFirst = first;
    spacer.style.height = `${total * rowHeight}px`;
    box.style.transform = `translateY(${first * rowHeight}px)`;
    emptyEl.hidden = total > 0;
    box.replaceChildren();
    page.rows.forEach((r, k) => {
      const el = renderRow(r, first + k);
      el.style.height = `${rowHeight}px`;
      el.dataset.index = String(first + k); el.setAttribute("role", "option");
      const on = r.id != null && String(r.id) === String(selectedId);
      el.classList.toggle("on", on); el.setAttribute("aria-selected", String(on));
      if (onPick) el.addEventListener("click", () => { selectedId = r.id; onPick(r, first + k); render(); });
      box.append(el);
    });
  }
  const schedule = () => { if (raf) return; if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(render); else render(); };
  root.addEventListener("scroll", schedule);
  root.addEventListener("keydown", (e) => {
    if (!onPick || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const idx = rows.findIndex((r) => String(r.id) === String(selectedId));
    const n = Math.max(0, Math.min(total - 1, (idx < 0 ? lastFirst : lastFirst + idx) + (e.key === "ArrowDown" ? 1 : -1)));
    const r = getPage(n, 1).rows[0]; if (!r) return;
    selectedId = r.id; onPick(r, n);
    if (n * rowHeight < root.scrollTop) root.scrollTop = n * rowHeight;
    else if ((n + 1) * rowHeight > root.scrollTop + root.clientHeight) root.scrollTop = (n + 1) * rowHeight - root.clientHeight;
    render();
  });
  return {
    el: root,
    refresh: render,
    reset() { root.scrollTop = 0; render(); },
    setSelected(id) { selectedId = id; render(); },
    total: () => total,
    renderedCount: () => box.children.length,
  };
}
