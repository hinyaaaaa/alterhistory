// v6 UI の共通部品。DOM の組み立て、表示用の整形、顔・円グラフ・議会の図（モックの意匠を、実データから描くように作り直したもの）。
const SVG = "http://www.w3.org/2000/svg";
export const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props ?? {})) { if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ""); else if (v !== false && v != null) el.setAttribute(k, v); } for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
export const sv = (tag, props = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(props ?? {})) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v); } for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
export const pct = (x) => Math.round(x * 100) + "%", n0 = (x) => Math.round(x).toLocaleString("ja-JP"), r2 = (x) => Math.round(x * 100) / 100;
export const hash = (s) => { let x = 2166136261; for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };
/* 色の割り当て: 国家・文化・言語・宗教に、見分けやすい色を 1 つずつ。隣り合うものは色相・明るさが離れた色を選び、一度決めた色は変えない。
   登録の無い id（過去の閲覧で出てくる資料の失われた国家など）は、従来どおり id から決まる色にする。 */
export const PALETTE = [[6, 64, 62], [176, 46, 48], [46, 78, 60], [268, 44, 66], [100, 42, 52], [212, 58, 62], [330, 52, 64], [28, 70, 58], [148, 40, 46], [240, 44, 70], [62, 56, 52], [290, 36, 60], [190, 52, 56], [14, 42, 48], [130, 34, 62], [52, 62, 70], [224, 40, 50], [350, 54, 54], [82, 50, 62], [258, 38, 56], [36, 46, 66], [168, 36, 62], [306, 44, 70], [200, 44, 40]];
const REG = new Map(), USE = new Array(PALETTE.length).fill(0);
const pdist = (a, b) => { const A = PALETTE[a], B = PALETTE[b], dh = Math.abs(A[0] - B[0]), h = Math.min(dh, 360 - dh) / 180; return h + (0.6 * Math.abs(A[2] - B[2])) / 30 + (0.3 * Math.abs(A[1] - B[1])) / 40; };
export const hasColor = (id) => REG.has(id);
export function resetColors() { REG.clear(); USE.fill(0); }
/** ids: 新しく色が要るかもしれない id（安定した順）／ adj: id → 隣り合う id の集合 */
export function assignColors(ids, adj) {
  for (const id of ids) {
    if (REG.has(id)) continue; const near = [...(adj.get(id) ?? [])].map((n) => REG.get(n)).filter((x) => x != null); let best = 0, bs = -1e9;
    for (let i = 0; i < PALETTE.length; i++) { const sep = near.length ? Math.min(...near.map((j) => pdist(i, j))) : 9, sc = Math.min(sep, 1.2) * 10 - USE[i] * 1.5; if (sc > bs + 1e-9) { bs = sc; best = i; } }
    REG.set(id, best); USE[best]++;
  }
}
export const colorOf = (id, l) => { const i = REG.get(id); if (i != null) { const p = PALETTE[i]; return `hsl(${p[0]} ${p[1]}% ${l ?? p[2]}%)`; } return `hsl(${hash(id) % 360} 48% ${l ?? 56}%)`; };
export const POLITY_JA = { tribal: "部族連合", chiefdom: "首長制", city_state: "都市国家", kingdom: "王国", empire: "帝国", republic: "共和制", theocracy: "神権制", federation: "連邦制", confederation: "連合" };
export const polityJa = (p) => POLITY_JA[p] ?? p ?? "—";
export const lb = (ja, en) => h("div", { class: "lb" }, ja, en ? h("em", {}, en) : null);
export const stat = (label, value, unit = "") => h("div", {}, h("small", {}, label), h("b", {}, value), unit ? h("i", {}, unit) : null);
export const bar = (v, col = "var(--blue)") => h("span", { class: "barv" }, h("i", { style: `width:${Math.max(0, Math.min(1, v)) * 100}%;background:${col}` }));
export const btn = (label, onclick, cls = "", props = {}) => h("button", { class: "b " + cls, onclick, ...props }, label);
export const table = (head, rows, cls = "") => h("table", { class: "tb " + cls, style: "width:100%;border-collapse:collapse;font-size:12px" }, h("thead", {}, h("tr", {}, ...head.map((x) => h("th", { style: "text-align:left;font-weight:400;color:var(--dim);border-bottom:1px solid var(--line);padding:3px 4px" }, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { style: "border-bottom:1px solid #262a31;padding:3px 4px" }, c))))));
/** 為政者の顔: 名前・国の ID から決まる（実在データを変えない読み取り専用の肖像。モックの顔の描き方を踏襲） */
export function face(name, stateId, look = null) {
  const k = look != null ? hash("look" + look) : hash(name + stateId), /* v6.4.0: 建国で選んだ顔（look）があれば、それで決める */ sk = ["#e0b79a", "#c99a76", "#a87654", "#f0cfb5"][k % 4], hr = ["#2a2420", "#6b4a2f", "#9a9a9a", "#4a3020"][(k >> 3) % 4], st = (k >> 6) % 4, c = colorOf(stateId, 45);
  let g = `<rect width="64" height="64" fill="#1b1f26"/><path d="M6 64Q8 46 32 44Q56 46 58 64Z" fill="${c}" fill-opacity=".8"/><rect x="28" y="38" width="8" height="8" fill="${sk}"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="${sk}"/>`;
  if (st === 1) g += `<path d="M18 30Q14 10 32 10Q50 10 46 30L46 44L42 44L42 24Q32 14 22 24L22 44L18 44Z" fill="${hr}"/>`; else { g += `<path d="M19 26Q18 11 32 11Q46 11 45 26Q41 18 32 18Q23 18 19 26Z" fill="${hr}"/>`; if (st === 2) g += `<path d="M21 31Q32 48 43 31Q43 40 32 42Q21 40 21 31Z" fill="${hr}"/>`; if (st === 3) g += `<path d="M20 13L24 6L28 12L32 5L36 12L40 6L44 13Z" fill="#b59a74"/>`; }
  g += `<circle cx="27" cy="27" r="1.4" fill="#222"/><circle cx="37" cy="27" r="1.4" fill="#222"/><path d="M28 34Q32 36 36 34" stroke="#7a4a3a" fill="none"/>`;
  const e = sv("svg", { viewBox: "0 0 64 64", width: 64, height: 64 }); e.innerHTML = g; return e;
}
export function donut(items, cols) { const tot = items.reduce((a, x) => a + x[1], 0) || 1, r = 36, C = 2 * Math.PI * r; let o = 0; const e = sv("svg", { viewBox: "0 0 120 120", width: 116, height: 116 }); items.forEach((v, i) => { const l = (v[1] / tot) * C; e.append(sv("circle", { cx: 60, cy: 60, r, fill: "none", stroke: cols[i % cols.length], "stroke-width": 20, "stroke-dasharray": `${l} ${C - l}`, "stroke-dashoffset": -o, transform: "rotate(-90 60 60)" })); o += l; }); e.append(sv("text", { x: 60, y: 65, "text-anchor": "middle", "font-size": 14, fill: "#d9d6cc" }, n0(tot))); return e; }
/** 議会の半円。議席は勢力の影響力に比例（議会がある国のみ） */
export function hemi(factions, cols) { const rows = [8, 12, 16, 20, 24, 20], pts = []; rows.forEach((c, i) => { const r = 36 + i * 12; for (let k = 0; k < c; k++) { const a = Math.PI * (1 - (k + 0.5) / c); pts.push([a, 100 + r * Math.cos(a), 100 - r * Math.sin(a)]); } }); pts.sort((a, b) => b[0] - a[0]); const tot = factions.reduce((a, f) => a + f[1], 0) || 1, e = sv("svg", { viewBox: "0 0 200 108", width: "100%" }); let idx = 0; factions.forEach((f, fi) => { const n = Math.round((f[1] / tot) * pts.length); for (let k = 0; k < n && idx < pts.length; k++) { const p = pts[idx++]; e.append(sv("circle", { cx: p[1].toFixed(1), cy: p[2].toFixed(1), r: 3.6, fill: cols[fi % cols.length] })); } }); return e; }
export const FACTION_JA = { nobility: "貴族", clergy: "聖職者", merchants: "商人", military: "軍", commoners: "民衆", bureaucrats: "官僚", artisans: "職人", clans: "遊牧氏族" };
export const FACTION_COL = { nobility: "#a58bd0", clergy: "#d8b45a", merchants: "#6fa8c9", military: "#d0605a", commoners: "#9fbf8a", bureaucrats: "#8fb3b0", artisans: "#c99a6f", clans: "#b0a070" };
/** 仮想スクロールの一覧（描画するのは見える範囲だけ） */
export function vlist(rows, rowH, renderRow) { const box = h("div", { class: "vlist" }), spacer = h("div", { style: `height:${rows.length * rowH}px` }), win = h("div", { style: "position:absolute;left:0;right:0;top:0" }); box.append(spacer, win); const paint = () => { const a = Math.max(0, Math.floor(box.scrollTop / rowH) - 4), b = Math.min(rows.length, a + Math.ceil(box.clientHeight / rowH || 40) + 10); win.style.top = a * rowH + "px"; win.replaceChildren(...rows.slice(a, b).map((r, i) => { const el = renderRow(r, a + i); el.style.height = rowH + "px"; return el; })); }; box.addEventListener("scroll", paint); setTimeout(paint, 0); box.__paint = paint; return box; }
