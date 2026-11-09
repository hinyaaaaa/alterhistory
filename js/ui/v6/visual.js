// v6.5.0: ビジュアルの共通部品。文字を減らし、旗・アイコン・リング・円グラフ・棒グラフ・ツリーマップで状況をひと目で伝える。
//   すべて読み取り専用（世界の状態は変えない）。色は国家・文化などの色（colorOf）をそのまま使い、数値と記号も併記する（色覚に依らない）。
import { h, sv, hash, colorOf, n0, pct } from "./common.js";

/* ---------- アイコン（24×24 の線画。意味ごとに 1 つ） ---------- */
const ICON = {
  pop: "M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6",
  coin: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7v10M9.2 9.6c0-1 1.2-1.7 2.8-1.7s2.8.7 2.8 1.7-1.2 1.5-2.8 1.8-2.8.8-2.8 1.8 1.2 1.7 2.8 1.7 2.8-.7 2.8-1.7",
  shield: "M12 3.2 19 6v5.6c0 4.2-2.9 7.3-7 9.2-4.1-1.9-7-5-7-9.2V6l7-2.8Z",
  gear: "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9",
  sword: "M5 19l9-9M14 10l5-5V3h-2l-5 5M4 20l2.4-.8-1.6-1.6L4 20ZM9 15l2 2",
  crown: "M4 17.5 3.2 8l4.6 3.6L12 5l4.2 6.6L20.8 8 20 17.5H4ZM4 20.5h16",
  hourglass: "M7 3.5h10M7 20.5h10M8 3.5c0 4 4 4.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 4.5-4 8.5s4 4.5 4 8.5",
  ship: "M3 15.5h18l-2.4 4H5.4L3 15.5ZM12 3.5v12M12 4.5 18 12h-6",
  horse: "M5 20v-6l3-5 3-1 1-3 3 2 3 4v9M9 20v-4M15 20v-4",
  gun: "M3 10h13l2 2h3v3h-3l-1.5 3H11l-1 -3H3v-5Z",
  bow: "M6 4c8 2 12 6 12 8s-4 6-12 8M6 12h13M16 9.5 19 12l-3 2.5",
  tower: "M6 20V9l2-1V5h2v2h4V5h2v3l2 1v11H6ZM10 20v-5h4v5",
  flag: "M6 21V4M6 5h11l-2 3.5 2 3.5H6",
  book: "M5 4.5h8a3 3 0 0 1 3 3V20a3 3 0 0 0-3-3H5V4.5ZM19 4.5h-3v13",
  scroll: "M7 4h11v13a3 3 0 0 1-3 3H6M7 4a2.5 2.5 0 0 0-2.5 2.5V7H7M10 9h5M10 12h5M10 15h3",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM3.8 12h16.4M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.6 8.7 8.6 12s1 6.1 3.4 8.5",
  handshake: "M3 12l4-4 4 2 3-2 4 3 3-1M3 12l5 6 3-1 2 2 3-2 4-5M9 13l2 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};
export const icon = (name, size = 16, color = "currentColor") => sv("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: color, "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round", class: "ico" }, sv("path", { d: ICON[name] ?? ICON.flag }));

/* ---------- 旗: 国家の id から決まる（国の色を地にした 7 つの型）。同じ国は、いつでも同じ旗 ---------- */
export function flag(stateId, w = 66) {
  const k = hash("flag" + stateId), base = colorOf(stateId, 46), alt = colorOf(stateId, 78), dark = colorOf(stateId, 24), pale = "#efe7d2", type = k % 7, W = 66, H = 44;
  const el = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: w, height: Math.round((w * H) / W), class: "flag" });
  const r = (x, y, ww, hh, f) => el.append(sv("rect", { x, y, width: ww, height: hh, fill: f }));
  if (type === 0) { r(0, 0, W, H, base); r(0, H / 3, W, H / 3, pale); }
  else if (type === 1) { r(0, 0, W / 3, H, base); r(W / 3, 0, W / 3, H, pale); r((2 * W) / 3, 0, W / 3, H, alt); }
  else if (type === 2) { r(0, 0, W, H, base); r(W * 0.3, 0, W * 0.14, H, pale); r(0, H * 0.43, W, H * 0.14, pale); }
  else if (type === 3) { r(0, 0, W, H, base); r(0, 0, W * 0.42, H * 0.55, dark); el.append(sv("circle", { cx: W * 0.21, cy: H * 0.27, r: 6, fill: pale })); }
  else if (type === 4) { r(0, 0, W, H, base); el.append(sv("polygon", { points: `0,0 ${W},0 0,${H}`, fill: dark })); }
  else if (type === 5) { r(0, 0, W, H, pale); el.append(sv("circle", { cx: W / 2, cy: H / 2, r: H * 0.3, fill: base })); }
  else { r(0, 0, W, H, dark); r(0, H * 0.18, W, H * 0.12, alt); r(0, H * 0.7, W, H * 0.12, alt); el.append(sv("circle", { cx: W / 2, cy: H / 2, r: 6, fill: pale })); }
  el.append(sv("rect", { x: 0.5, y: 0.5, width: W - 1, height: H - 1, fill: "none", stroke: "rgba(255,255,255,.28)" }));
  return el;
}

/* ---------- 指標: アイコン＋数値（＋バー） ---------- */
export function metric(ic, label, value, { bar = null, color = "var(--blue)", title = "" } = {}) {
  return h("div", { class: "metric", title: title || label }, icon(ic, 18), h("div", { class: "mt" }, h("small", {}, label), h("b", {}, value), bar != null ? h("span", { class: "barv" }, h("i", { style: `width:${Math.max(0, Math.min(1, bar)) * 100}%;background:${color}` })) : null));
}
/** リング型のゲージ（0〜1）。中央に割合 */
export function ring(v, label, color = "var(--blue)", size = 62) {
  const r = 24, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v)) * C, el = sv("svg", { viewBox: "0 0 64 64", width: size, height: size }, sv("circle", { cx: 32, cy: 32, r, fill: "none", stroke: "#2a2f38", "stroke-width": 7 }), sv("circle", { cx: 32, cy: 32, r, fill: "none", stroke: color, "stroke-width": 7, "stroke-dasharray": `${f} ${C - f}`, transform: "rotate(-90 32 32)", "stroke-linecap": "butt" }), sv("text", { x: 32, y: 36, "text-anchor": "middle", "font-size": 13, fill: "#e8e4d6" }, Math.round(v * 100)));
  return h("div", { class: "ringbox", title: `${label} ${pct(v)}` }, el, h("small", {}, label));
}

/* ---------- 円グラフ（ドーナツ）。items: [{ label, value, color, id? }]。凡例つき・行にカーソルで強調 ---------- */
export function pie(items, { size = 150, center = null, fmt = n0, onPick = null, max = 8, otherLabel = "その他" } = {}) {
  const sorted = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value), head = sorted.slice(0, max), rest = sorted.slice(max).reduce((a, x) => a + x.value, 0), all = rest > 0 ? [...head, { label: otherLabel, value: rest, color: "#5b616c" }] : head, tot = all.reduce((a, x) => a + x.value, 0) || 1;
  const R = 46, r = 26, svg = sv("svg", { viewBox: "0 0 120 120", width: size, height: size, class: "pie" }); let a0 = -Math.PI / 2;
  const arcs = all.map((x) => {
    const frac = x.value / tot, a1 = a0 + frac * Math.PI * 2 - (all.length > 1 ? 0.012 : 0), big = frac > 0.5 ? 1 : 0, P = (rad, a) => `${60 + rad * Math.cos(a)} ${60 + rad * Math.sin(a)}`;
    const d = frac >= 0.9999 ? `M60 ${60 - R}A${R} ${R} 0 1 1 59.99 ${60 - R}ZM60 ${60 - r}A${r} ${r} 0 1 0 60.01 ${60 - r}Z` : `M${P(R, a0)}A${R} ${R} 0 ${big} 1 ${P(R, a1)}L${P(r, a1)}A${r} ${r} 0 ${big} 0 ${P(r, a0)}Z`; a0 += frac * Math.PI * 2;
    const p = sv("path", { d, fill: x.color, "fill-rule": "evenodd", class: "slice", onclick: () => x.id && onPick?.(x.id) }, sv("title", {}, `${x.label} ${fmt(x.value)}（${pct(x.value / tot)}）`)); svg.append(p); return p;
  });
  if (center != null) svg.append(sv("text", { x: 60, y: 64, "text-anchor": "middle", "font-size": 12, fill: "#e8e4d6" }, center));
  const legend = h("div", { class: "pielg" }, ...all.map((x, i) => h("div", { class: "lgrow" + (x.id && onPick ? " pick" : ""), onmouseenter: () => arcs[i].classList.add("hot"), onmouseleave: () => arcs[i].classList.remove("hot"), onclick: () => x.id && onPick?.(x.id) }, h("i", { style: `background:${x.color}` }), h("span", { class: "nm" }, x.label), h("small", {}, pct(x.value / tot)))));
  return h("div", { class: "piebox" }, svg, legend);
}

/* ---------- 横棒グラフ。items: [{ label, value, color, id?, mine? }]。最大値を満点に、順位・名前・値を 1 行に ---------- */
export function hbars(items, { fmt = n0, onPick = null, top = 8, onHover = null } = {}) {
  const list = [...items].sort((a, b) => b.value - a.value).slice(0, top), mx = Math.max(1e-9, ...list.map((x) => x.value));
  return h("div", { class: "hbars" }, ...list.map((x, i) => h("div", { class: "hb" + (x.mine ? " mine" : "") + (onPick ? " pick" : ""), onclick: () => x.id && onPick?.(x.id), onmouseenter: () => x.id && onHover?.(x.id), onmouseleave: () => onHover?.(null) }, h("small", { class: "rk" }, i + 1), h("span", { class: "nm" }, x.label), h("span", { class: "tr" }, h("i", { style: `width:${Math.max(2, (x.value / mx) * 100)}%;background:${x.color}` })), h("small", { class: "vl" }, fmt(x.value)))));
}

/* ---------- ツリーマップ（面積で比べる）。単純な分割: 大きい順に、短い辺に沿って並べる ---------- */
export function treemap(items, { w = 300, hgt = 150, onPick = null, fmt = n0 } = {}) {
  const list = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 18), el = sv("svg", { viewBox: `0 0 ${w} ${hgt}`, width: "100%", class: "treemap" });
  const lay = (arr, x, y, ww, hh) => {
    if (!arr.length) return; if (arr.length === 1) return put(arr[0], x, y, ww, hh);
    const tot = arr.reduce((a, b) => a + b.value, 0); let acc = 0, i = 0; while (i < arr.length - 1 && acc + arr[i].value <= tot / 2) acc += arr[i++].value; if (i === 0) { acc = arr[0].value; i = 1; }
    const A = arr.slice(0, i), B = arr.slice(i), fa = acc / tot;
    if (ww >= hh) { lay(A, x, y, ww * fa, hh); lay(B, x + ww * fa, y, ww * (1 - fa), hh); } else { lay(A, x, y, ww, hh * fa); lay(B, x, y + hh * fa, ww, hh * (1 - fa)); }
  };
  const put = (it, x, y, ww, hh) => {
    const g = sv("g", { class: "tm" + (onPick && it.id ? " pick" : ""), onclick: () => it.id && onPick?.(it.id) }, sv("rect", { x: x + 0.6, y: y + 0.6, width: Math.max(0, ww - 1.2), height: Math.max(0, hh - 1.2), fill: it.color }), sv("title", {}, `${it.label} ${fmt(it.value)}`));
    if (ww > 44 && hh > 16) g.append(sv("text", { x: x + 4, y: y + 12, "font-size": Math.min(11, Math.max(8, ww / 9)), fill: "#10131a", "font-weight": 600 }, it.label.slice(0, Math.max(2, Math.floor(ww / 11)))));
    el.append(g);
  };
  lay(list, 0, 0, w, hgt); return el;
}

/* ---------- 積み上げ帯（割合を 1 本で）。items: [{ label, value, color }] ---------- */
export function stackbar(items, { height = 12 } = {}) {
  const tot = items.reduce((a, x) => a + x.value, 0) || 1;
  return h("div", { class: "stackbar", style: `height:${height}px` }, ...items.filter((x) => x.value > 0).map((x) => h("i", { style: `width:${(x.value / tot) * 100}%;background:${x.color}`, title: `${x.label} ${pct(x.value / tot)}` })));
}

/* ---------- 時系列の色つき帯（外交・戦争の流れ）。segs: [{ from, to, color, label }] ---------- */
export function timeband(segs, t0, t1, { height = 16 } = {}) {
  const span = Math.max(1, t1 - t0), el = h("div", { class: "timeband", style: `height:${height}px` });
  for (const s of segs) { const a = Math.max(0, (s.from - t0) / span), b = Math.min(1, ((s.to ?? t1) - t0) / span); if (b <= a) continue; el.append(h("i", { style: `left:${a * 100}%;width:${Math.max(0.8, (b - a) * 100)}%;background:${s.color}`, title: s.label ?? "" })); }
  return el;
}
export const spark = (vals, { w = 120, hgt = 28, color = "#6fa8c9" } = {}) => { const mx = Math.max(1e-9, ...vals), mn = Math.min(0, ...vals); return sv("svg", { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt }, sv("polyline", { points: vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${hgt - 2 - ((v - mn) / (mx - mn || 1)) * (hgt - 4)}`).join(" "), fill: "none", stroke: color, "stroke-width": 1.6 })); };
