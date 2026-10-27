// v5.3 UI 共通: 最小の DOM ヘルパー。文字は必ず textContent / 属性で入れる（innerHTML は使わない）。
export function h(tag, props = null, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.length > 2 && k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export const clear = (el) => { el.replaceChildren(); return el; };
export const setDisabled = (el, disabled, reason = "") => {
  el.disabled = !!disabled;
  if (disabled && reason) el.title = reason;
  else if (!disabled && el.dataset.tip) el.title = el.dataset.tip;
  return el;
};
