// v5.3 UI: 仮想スクロール一覧が、数百万行でも (1) 一定数の行だけを出し (2) 先頭から末尾まで届く（ブラウザの高さ上限を超えない）。
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "Event"]) globalThis[k] = dom.window[k];
const { createVList, MAX_PX } = await import("../js/ui/v53/virtual-list.js");
let failed = 0; const check = (l, f) => { try { f(); console.log(`  OK   ${l}`); } catch (e) { failed++; console.log(`  FAIL ${l}: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const mk = (total, vh = 520, rowHeight = 52) => {
  const vl = createVList({ rowHeight, getPage: (o, n) => ({ total, rows: Array.from({ length: Math.max(0, Math.min(n, total - o)) }, (_, i) => ({ id: o + i })) }), renderRow: (r) => { const d = document.createElement("div"); d.textContent = String(r.id); return d; } });
  Object.defineProperty(vl.el, "clientHeight", { value: vh }); document.body.append(vl.el); vl.refresh(); return vl;
};
const firstId = (vl) => Number(vl.el.querySelector(".v53-vlist-rows").firstChild.dataset.index), lastId = (vl) => Number(vl.el.querySelector(".v53-vlist-rows").lastChild.dataset.index);
console.log("=== 仮想スクロール（高さの打ち切り） ===");
check("件数が少ないときは従来どおり（打ち切りなし・行の位置は行番号×行高）", () => { const vl = mk(1000); assert.equal(vl.scaled(), false); vl.el.scrollTop = 5200; vl.refresh(); assert.ok(Math.abs(firstId(vl) - (100 - 6)) <= 1); assert.ok(vl.renderedCount() <= 30); });
for (const total of [600_000, 5_000_000, 200_000_000]) {
  check(`${total.toLocaleString("ja-JP")} 行: 仮想の高さは上限以下で、DOM の行は一定数、先頭・中ほど・末尾に届く`, () => {
    const vl = mk(total); assert.equal(vl.scaled(), true);
    const spacer = vl.el.querySelector(".v53-vlist-spacer"); assert.ok(parseFloat(spacer.style.height) <= MAX_PX);
    assert.ok(vl.renderedCount() <= 30, `行数 ${vl.renderedCount()}`); assert.equal(firstId(vl), 0);
    const maxScroll = parseFloat(spacer.style.height) - 520;
    vl.el.scrollTop = maxScroll; vl.refresh(); assert.equal(lastId(vl), total - 1, "末尾の行が出る"); assert.ok(vl.renderedCount() <= 30);
    vl.el.scrollTop = maxScroll / 2; vl.refresh(); const mid = firstId(vl); assert.ok(Math.abs(mid - total / 2) < total * 0.01, `中ほど ${mid}`);
    // 少しずつ動かしても、行が飛ばず単調に進む
    let prev = -1; for (let f = 0; f <= 1; f += 0.05) { vl.el.scrollTop = maxScroll * f; vl.refresh(); const x = firstId(vl); assert.ok(x >= prev, `${f}`); prev = x; }
  });
}
check("scrollToIndex / scrollToFraction で、離れた行へ移れる", () => { const vl = mk(5_000_000); vl.scrollToFraction(0.25); const f = firstId(vl); assert.ok(Math.abs(f - 1_250_000) < 50_000, `${f}`); vl.scrollToIndex(4_000_000); vl.refresh(); const g = firstId(vl); assert.ok(Math.abs(g - 4_000_000) < 200, `${g}`); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
