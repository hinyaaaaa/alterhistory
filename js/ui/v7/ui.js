// v7 の小部品（docs/UI_RULES.md §3 の 6 部品＋小部品の DOM 組み立て）。画面側はここの関数だけで見た目を作り、CSS クラスを直書きしない。
import { h, sv, n0, pct } from "../v6/common.js";
export { h, sv, n0, pct };
export const H2 = (ix, text, ...extra) => h("h2", { class: "v-h2" }, h("span", { class: "v-ix" }, ix), text, ...extra);
export const H3 = (text, small = null) => h("h3", { class: "v-h3" }, text, small ? h("small", {}, small) : null);
/** kind: "" 主（真鍮）| "g" 弱（枠線）| "d" 危険（赤）。size: "s" 小 */
export const Btn = (label, onclick, kind = "", { size = "", wide = false, id = null, disabled = false, title = null } = {}) =>
  h("button", { class: ["v-btn", kind, size, wide ? "w" : ""].filter(Boolean).join(" "), onclick, id, disabled, title }, label);
export const Card = (...kids) => h("div", { class: "v-card" }, ...kids);
/** 1 行。color は左の縁の色。tag は右の札（{t, c}）。sub は小さな 2 行目 */
export const Row = ({ color = null, title, sub = null, tag = null, small = null, onclick = null, on = false, id = null, onenter = null, onleave = null, lead = null }) =>
  h(
    onclick ? "button" : "div",
    { class: "v-row" + (on ? " on" : "") + (onclick ? "" : " static"), style: color ? `--c:${color}` : null, onclick, id, onmouseenter: onenter, onmouseleave: onleave },
    lead,
    h("div", { class: "v-grow" }, h("b", {}, title), sub ? h("span", { class: "u" }, sub) : null),
    tag ? h("span", { class: "v-tag " + (tag.c ?? ""), style: "margin-left:0" }, tag.t) : null,
    small != null ? h("small", {}, small) : null,
  );
export const Tag = (text, cls = "") => h("span", { class: "v-tag " + cls }, text);
export const Chips = (items, cur, onpick) => h("div", {}, ...items.map(([k, ja]) => h("span", { class: "v-chip" + (k === cur ? " on" : ""), onclick: () => onpick(k) }, ja)));
export const Tabs = (items, cur, onpick) => h("div", { class: "v-tabs" }, ...items.map(([k, ja]) => h("button", { class: k === cur ? "on" : "", "data-tab": k, onclick: () => onpick(k) }, ja)));
export const Mut = (t) => h("p", { class: "v-mut", style: "margin:6px 0" }, t);
/** 滑り棒 1 本。値は min..max。onchange は離したときだけ呼ぶ（oninput は表示だけ更新する） */
export function Slider({ label, min, max, step, value, fmt = (v) => String(v), onchange, hint = null, disabled = false, id = null }) {
  const out = h("output", {}, fmt(value)),
    inp = h("input", { type: "range", min, max, step, value, disabled, id });
  const paint = () => inp.style.setProperty("--p", ((inp.value - min) / (max - min || 1)) * 100 + "%");
  paint();
  inp.addEventListener("input", () => {
    out.textContent = fmt(Number(inp.value));
    paint();
  });
  inp.addEventListener("change", () => onchange?.(Number(inp.value)));
  return h("div", { class: "v-sl" }, h("div", {}, h("span", {}, label), out), inp, hint ? h("small", {}, hint) : null);
}
/** 小さな折れ線 */
export function Spark(vals, { w = 96, h: ht = 26, color = "#9db4c0" } = {}) {
  const s = sv("svg", { class: "v-spk", viewBox: `0 0 ${w} ${ht}`, width: w, height: ht });
  if (vals.length < 2) return s;
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  s.append(sv("polyline", { points: vals.map((v, i) => `${(i / (vals.length - 1)) * (w - 2) + 1},${ht - 2 - ((v - lo) / sp) * (ht - 4)}`).join(" "), fill: "none", stroke: color, "stroke-width": 1.5 }));
  return s;
}
/** 斜めの目盛り（10 段）。value は 0..1 */
export const Gauge = (value, color, steps = 10) => h("div", { class: "v-gg", style: `--c:${color}` }, ...Array.from({ length: steps }, (_, i) => h("i", { class: i < Math.round(value * steps) ? "on" : "" })));
/** 総合を示す輪（0..1）。中央に数字 */
export function Ring(value, label, color = "#b8a06a") {
  const R = 38, C = 2 * Math.PI * R;
  const s = sv("svg", { class: "v-dn-ring", viewBox: "0 0 92 92" });
  s.append(sv("circle", { cx: 46, cy: 46, r: R, fill: "none", stroke: "rgba(255,255,255,.08)", "stroke-width": 7 }), sv("circle", { cx: 46, cy: 46, r: R, fill: "none", stroke: color, "stroke-width": 7, "stroke-dasharray": `${C * value} ${C}`, transform: "rotate(-90 46 46)" }), sv("text", { x: 46, y: 50, style: "font-size:20px" }, Math.round(value * 100) + "%"), sv("text", { x: 46, y: 64, style: "font-size:9px;fill:#8a9ca5" }, label));
  return s;
}
/** 増減の表示（符号つき）。good=true で増加が緑 */
export const Delta = (d, { digits = 0, good = true, unit = "" } = {}) => {
  if (d == null || !Number.isFinite(d)) return h("em", { class: "v-mut" }, "—");
  const r = Math.abs(d) < 10 ** -digits / 2 ? 0 : d;
  const up = r > 0, cls = r === 0 ? "" : up === good ? "v-up" : "v-dw";
  return h("em", { class: cls }, r === 0 ? "±0" : (up ? "▲" : "▼") + Math.abs(r).toFixed(digits) + unit);
};
/** 並べ替えのできる表。cols: [{k, ja, get(row), fmt?, left?}]。rows のクリックで onrow */
export function Table(cols, rows, { sort, dir = -1, onsort, onrow, selected = null, rowKey = (r) => r.id } = {}) {
  const sorted = [...rows].sort((a, b) => {
    const c = cols.find((x) => x.k === sort);
    if (!c) return 0;
    const x = c.get(a), y = c.get(b);
    return (typeof x === "string" ? x.localeCompare(y, "ja") : x - y) * dir;
  });
  return h(
    "table",
    { class: "v-tbl" },
    h("thead", {}, h("tr", {}, ...cols.map((c) => h("th", { class: c.k === sort ? "s" : "", onclick: () => onsort?.(c.k) }, c.ja + (c.k === sort ? (dir < 0 ? " ▼" : " ▲") : ""))))),
    h("tbody", {}, ...sorted.map((r) => h("tr", { class: "r" + (selected === rowKey(r) ? " on" : ""), onclick: () => onrow?.(r), onmouseenter: () => r.__enter?.(), onmouseleave: () => r.__leave?.() }, ...cols.map((c) => h("td", {}, c.render ? c.render(r) : c.fmt ? c.fmt(c.get(r)) : c.get(r)))))),
  );
}
