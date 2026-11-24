// v6.14.0: DOM の挿入メソッドに null・undefined・false を渡しても、文字の「null」を表示しない。
//   （append / replaceChildren は、null を文字列に変えて挿入する。h() は飛ばすが、直接呼んだ箇所で「null」が出ていた）
if (typeof Element !== "undefined" && !Element.prototype.__domsafe) {
  const keep = (a) => a.filter((x) => x != null && x !== false);
  const wrap = (proto, names) => {
    for (const k of names) {
      const o = proto[k];
      if (typeof o !== "function") continue;
      proto[k] = function (...a) {
        return o.apply(this, keep(a));
      };
    }
  };
  wrap(Element.prototype, ["append", "prepend", "replaceChildren", "before", "after", "replaceWith"]);
  if (typeof DocumentFragment !== "undefined")
    wrap(DocumentFragment.prototype, ["append", "prepend", "replaceChildren"]);
  Object.defineProperty(Element.prototype, "__domsafe", { value: true });
}
