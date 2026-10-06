// 入力中の画面を、勝手に作り直さない。
//   年が変わるときの自動更新や、月ごとの時間経過で、パネルが描き直される。そのとき文字を入力している最中だと、
//   入力欄が作り直されて、書いていた内容が消えてしまう。入力欄にカーソルがある間は描き直しを保留し、
//   カーソルが外れたあとに、最新の状態で1回だけ描き直す。
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const isTyping = (el) => !!el && TYPING.has(el.tagName) && !["checkbox", "radio", "button", "range"].includes(el.type);

/**
 * 描き直しても、スクロール位置を元に戻す。
 *   月が進むたびにパネルが作り直されると、スクロールしていた一覧・記録（戦闘の記録など）が先頭に戻ってしまう。
 *   描き直す前に、root を包むスクロール領域と、root の中のスクロール領域の位置を覚え、描き直したあとで戻す。
 *   中の領域は、クラス名と「同じクラスの何番目か」で見つける。
 */
export function keepScroll(root, renderFn) {
  const saved = [];
  for (let a = root; a; a = a.parentElement) if (a.scrollTop > 0 || a.scrollLeft > 0) saved.push({ el: a, top: a.scrollTop, left: a.scrollLeft });
  const keyOf = (e) => { const cls = e.className && typeof e.className === "string" ? e.className.trim().split(/\s+/)[0] : ""; return { cls, tag: e.tagName }; };
  const inner = [];
  const nth = new Map();
  for (const e of root.querySelectorAll("*")) {
    const k = keyOf(e), id = `${k.tag}.${k.cls}`, n = nth.get(id) ?? 0; nth.set(id, n + 1);
    if (e.scrollTop > 0) inner.push({ id, n, top: e.scrollTop });
  }
  const result = renderFn();
  const restore = () => {
    for (const x of saved) { x.el.scrollTop = x.top; x.el.scrollLeft = x.left; }
    if (!inner.length) return;
    const cnt = new Map();
    for (const e of root.querySelectorAll("*")) {
      const k = keyOf(e), id = `${k.tag}.${k.cls}`, n = cnt.get(id) ?? 0; cnt.set(id, n + 1);
      const hit = inner.find((x) => x.id === id && x.n === n); if (hit) e.scrollTop = hit.top;
    }
  };
  restore();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore); // レイアウトが確定したあとに、もう一度
  return result;
}

/** root の中で入力中なら描き直しを保留する関数を返す。描き直してもスクロール位置は保つ */
export function guardRender(root, renderFn) {
  let pending = false;
  root.addEventListener("focusout", () => {
    if (!pending) return;
    setTimeout(() => { if (!pending) return; /* すでに描き直し済み */ if (!isTyping(document.activeElement) || !root.contains(document.activeElement)) { pending = false; keepScroll(root, () => renderFn()); } }, 0);
  });
  return function safeRender(...args) {
    const a = document.activeElement;
    if (isTyping(a) && root.contains(a)) { pending = true; return; }
    pending = false;
    keepScroll(root, () => renderFn(...args));
  };
}
