// パネル用の小さな部品（要素の作成・ボタン・色見本・スライダー付き入力）。
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function btn(cls, text, title, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
export function swatch(color, tall = true) {
  const s = el("span", "b-swatch");
  s.style.background = color ?? "#888";
  if (!tall) s.style.height = "14px";
  return s;
}
/**
 * ラベル付きスライダー。つまみを動かす間は表示だけ更新し、離したとき(change)に onCommit を呼ぶ。
 * @param {{label:string, min:number, max:number, step:number, value:number, format:(v:number)=>string, onCommit:(v:number)=>void}} o
 */
export function slider({ label, min, max, step, value, format, onCommit }) {
  const wrap = el("label", "b-field");
  const val = el("span", "b-mini", `${label} ${format(value)}`);
  const r = document.createElement("input");
  r.type = "range"; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
  r.addEventListener("input", () => { val.textContent = `${label} ${format(Number(r.value))}`; });
  r.addEventListener("change", () => onCommit(Number(r.value)));
  wrap.append(val, r);
  return wrap;
}
export const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
