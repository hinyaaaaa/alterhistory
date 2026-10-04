// 入力中の画面を、勝手に作り直さない。
//   年が変わるときの自動更新や、月ごとの時間経過で、パネルが描き直される。そのとき文字を入力している最中だと、
//   入力欄が作り直されて、書いていた内容が消えてしまう。入力欄にカーソルがある間は描き直しを保留し、
//   カーソルが外れたあとに、最新の状態で1回だけ描き直す。
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const isTyping = (el) => !!el && TYPING.has(el.tagName) && !["checkbox", "radio", "button", "range"].includes(el.type);

/** root の中で入力中なら描き直しを保留する関数を返す */
export function guardRender(root, renderFn) {
  let pending = false;
  root.addEventListener("focusout", () => {
    if (!pending) return;
    setTimeout(() => { if (!pending) return; /* すでに描き直し済み */ if (!isTyping(document.activeElement) || !root.contains(document.activeElement)) { pending = false; renderFn(); } }, 0);
  });
  return function safeRender(...args) {
    const a = document.activeElement;
    if (isTyping(a) && root.contains(a)) { pending = true; return; }
    pending = false;
    renderFn(...args);
  };
}
