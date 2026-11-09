// v6 UI: 樹形図・ツリー。技術ツリー（四方位へ広がる）・軍事ドクトリン・文化／言語／宗教の系統図。すべて実データから描く。
//   ・パン（ドラッグ）とズーム（ホイール）で、ノードが増えても操作できる。
//   ・技術は「採用済み」「採用できる（前提を満たす）」「発見済みだが採用できない」「未発見」を区別する。
import { h, sv, colorOf, n0 } from "./common.js";
import { layoutGrid, LANES } from "../../core/civ/tech.js";
import { STAGES, TREE } from "../../core/civ/techtree.js";
const NODESTAGE = Object.fromEntries(TREE.map((t) => [t.id, t.stage])); // 列の見出し: その列のノードの「宣言した時代」の中央値

/** SVG にパン・ズームを付ける（viewBox を操作） */
export function panZoom(svg, W, H, { onChange = null } = {}) {
  let vb = { x: 0, y: 0, w: W, h: H }; const apply = () => { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); onChange?.({ ...vb }); }; apply(); let drag = null, moved = false;
  svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved = false; });
  svg.addEventListener("pointermove", (e) => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = ((e.clientX - drag.x) * vb.w) / r.width, dy = ((e.clientY - drag.y) * vb.h) / r.height; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; vb.x = drag.vx - dx; vb.y = drag.vy - dy; apply(); });
  const up = () => { drag = null; }; svg.addEventListener("pointerup", up); svg.addEventListener("pointerleave", up);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), k = e.deltaY < 0 ? 0.85 : 1 / 0.85, mx = vb.x + ((e.clientX - r.left) / r.width) * vb.w, my = vb.y + ((e.clientY - r.top) / r.height) * vb.h; vb = { x: mx - (mx - vb.x) * k, y: my - (my - vb.y) * k, w: vb.w * k, h: vb.h * k }; apply(); }, { passive: false });
  return { set: (v) => { vb = { ...v }; apply(); }, reset: () => { vb = { x: 0, y: 0, w: W, h: H }; apply(); }, get moved() { return moved; }, get vb() { return vb; } };
}

/** 親子の系統図（文化・言語・宗教）。items: [{id,name,parent,bornAt}]。左から右へ世代が進む */
export function lineageTree(items, { selected, onPick, label = (x) => x.name, colorFn = (x) => colorOf(x.id) }) {
  const by = new Map(items.map((x) => [x.id, x])), kids = new Map(); for (const x of items) { const p = x.parent && by.has(x.parent) ? x.parent : null; (kids.get(p) ?? kids.set(p, []).get(p)).push(x); }
  for (const l of kids.values()) l.sort((a, b) => a.bornAt - b.bornAt || (a.id < b.id ? -1 : 1));
  const pos = new Map(); let row = 0; const place = (x, d) => { const c = kids.get(x.id) ?? []; if (!c.length) { pos.set(x.id, { d, y: row++ }); return; } c.forEach((k) => place(k, d + 1)); pos.set(x.id, { d, y: (pos.get(c[0].id).y + pos.get(c.at(-1).id).y) / 2 }); };
  for (const r of kids.get(null) ?? []) place(r, 0);
  const DX = 150, DY = 26, maxD = Math.max(0, ...[...pos.values()].map((p) => p.d)), W = 40 + (maxD + 1) * DX, H = Math.max(120, 30 + row * DY), svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMinYMin meet", style: "height:" + Math.min(380, Math.max(160, H)) + "px" });
  for (const x of items) { const p = pos.get(x.id), q = x.parent && pos.get(x.parent); if (p && q) svg.append(sv("path", { d: `M${20 + q.d * DX + 120} ${20 + q.y * DY}C${20 + q.d * DX + 135} ${20 + q.y * DY} ${20 + p.d * DX - 15} ${20 + p.y * DY} ${20 + p.d * DX} ${20 + p.y * DY}`, fill: "none", stroke: "#4a515c", "stroke-width": 1.2 })); }
  const pz = panZoom(svg, W, H);
  for (const x of items) { const p = pos.get(x.id); if (!p) continue; const g = sv("g", { class: "tnode", onclick: () => { if (!pz.moved) onPick(x); } }, sv("rect", { x: 20 + p.d * DX, y: 20 + p.y * DY - 10, width: 120, height: 20, fill: "#1a1d23", stroke: selected === x.id ? "#d8b45a" : colorFn(x), "stroke-width": selected === x.id ? 2.4 : 1.4 }), sv("text", { x: 26 + p.d * DX, y: 20 + p.y * DY + 4, "font-size": 11, fill: "#d9d6cc" }, label(x).slice(0, 10))); svg.append(g); }
  return svg;
}

/** 技術ツリー（v6.1.0 M3）: 分野レーン（縦）× 時代の列（左→右）の規則的なグリッド。前提から後続へ、直交する線で結ぶ。
 *  位置は (lane, col, slot) から決まり、状態では動かない。状態は色だけでなく、枠線の種類・記号でも区別する（色覚に依らない）。
 *  status(t): adopted=制度化 / available=採用できる / known=保有（まだ採用できない） / lost=失われた / locked=未発見 */
export function techTree({ techs, status, onPick, selected, lane = null, hit = null, vb0 = null, onView = null }) {
  const g = layoutGrid(), NW = 128, NH = 24, CW = 196, RH = 34, X0 = 120, Y0 = 34, W = X0 + g.cols * CW + 20, H = Y0 + g.totalRows * RH + 20, byKey = new Map(techs.map((t) => [t.key, t]));
  const svg = sv("svg", { class: "tree techgrid", viewBox: `0 0 ${W} ${H}`, style: "height:460px;touch-action:none" }), P = (t) => ({ x: X0 + g.pos[t.key].col * CW, y: Y0 + g.pos[t.key].row * RH });
  const COL = { adopted: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], known: ["#a58bd0", "#201a2e"], lost: ["#c97a6f", "#2a1614"], locked: ["#4a515c", "#14161a"] }, SYM = { adopted: "■", available: "◆", known: "◇", lost: "✕", locked: "○" };
  // 列の見出し（時代）と、レーンの帯・見出し
  const eraOfCol = (c) => { const st = techs.filter((t) => t.col === c).map((t) => t.tier); return null; void st; };
  const stageOf = new Map(); for (const t of techs) { const a = stageOf.get(t.col) ?? []; a.push(NODESTAGE[t.key] ?? 0); stageOf.set(t.col, a); }
  for (let c = 0; c < g.cols; c++) { const a = (stageOf.get(c) ?? []).sort((x, y) => x - y), m = a.length ? a[a.length >> 1] : 0; svg.append(sv("text", { x: X0 + c * CW + NW / 2, y: 18, "text-anchor": "middle", "font-size": 11, fill: "#838995" }, STAGES[m] ?? "")); }
  LANES.forEach((l, i) => { const y = Y0 + g.y0[l.id] * RH - 6, hgt = g.rows[l.id] * RH; svg.append(sv("rect", { x: 0, y, width: W, height: hgt, fill: i % 2 ? "#15181d" : "#12151a", opacity: lane && lane !== l.id ? 0.4 : 1 }), sv("text", { x: 8, y: y + hgt / 2 + 4, "font-size": 12, fill: lane === l.id ? "#d8b45a" : "#a1a6b0" }, `${l.glyph} ${l.ja}`.slice(0, 9))); });
  // 前提の線: 前提の右端 → 後続の左手前の縦の通路 → 後続の左端（直交）。通路は後続の列の手前に、線ごとに少しずらして置く
  const ek = new Map();
  for (const t of techs) { const q = P(t); t.prereq.forEach((pk, i) => { const pt = byKey.get(pk); if (!pt) return; const a = P(pt), dim = (lane && t.lane !== lane && pt.lane !== lane) || status(t) === "locked", lane2 = ek.get(t.col) ?? 0; ek.set(t.col, lane2 + 1); const bx = q.x - 26 + ((i * 7) % 20) - 6, ay = a.y + NH / 2, by = q.y + NH / 2;
    svg.append(sv("path", { d: `M${a.x + NW} ${ay}H${bx}V${by}H${q.x}`, fill: "none", stroke: dim ? "#2b3038" : status(pt) === "locked" ? "#3a414b" : "#6fa8c9", "stroke-width": selected && (selected === t.key || selected === pk) ? 2.2 : 1, opacity: dim ? 0.5 : 0.85 })); }); }
  const pz = panZoom(svg, W, H, { onChange: onView });
  for (const t of techs) { const p = P(t), s = status(t), [stroke, fill] = COL[s], dim = (lane && t.lane !== lane) || (hit && !hit.has(t.key));
    svg.append(sv("g", { class: "tnode", opacity: dim ? 0.3 : 1, onclick: () => { if (!pz.moved) onPick(t); } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === t.key ? "#fff" : stroke, "stroke-width": s === "adopted" ? 2.6 : selected === t.key ? 2.4 : 1.4, "stroke-dasharray": s === "locked" ? "4 3" : s === "lost" ? "2 2" : null }), sv("text", { x: p.x + 7, y: p.y + 16, "font-size": 12, fill: s === "locked" ? "#838995" : "#d9d6cc" }, `${SYM[s]} ${t.name}`.slice(0, 11)))); }
  const frontier = Math.max(0, ...techs.filter((t) => status(t) === "adopted" || status(t) === "known" || status(t) === "available").map((t) => g.pos[t.key].col));
  const view = (col, w = 640) => pz.set({ x: Math.max(0, X0 + col * CW - 160), y: 0, w, h: Math.min(H, (w * 460) / 380) });
  if (vb0) pz.set(vb0); else view(Math.max(0, frontier - 3));
  const focus = (key) => { const t = byKey.get(key); if (!t) return; const p = P(t), w = 560, h = Math.min(H, (w * 460) / 380); pz.set({ x: Math.max(0, p.x - w / 2 + NW / 2), y: Math.max(0, Math.min(H - h, p.y - h / 2)), w, h }); };
  return { svg, COL, SYM, fit: () => pz.set({ x: 0, y: 0, w: W, h: H }), left: () => view(0), frontier: () => view(Math.max(0, frontier - 3)), focus };
}

/** ドクトリンの木（v6.1.0 M8）: 画面の上端に根（軍事ドクトリン）を置き、そこから枝が上から下へ垂れ下がる。
 *  左の「共通 5 系統」と右の「国家固有 3 系統 ★」を、同じ寸法・同じ段の規則で整列する（国家ごとに固有の中身が変わっても配置のルールは同じ）。
 *  線は直線と直角だけ。位置は (系統, 段) から決まり、状態・選択では動かない（ランダム・力学的配置は使わない）。
 *  状態は色に加えて枠線と記号（■取得済み／◆取得できる／○条件が足りない）で区別する。 */
export function doctrineTree({ nodes, branches, status, onPick, selected, vb0 = null, onView = null }) {
  const CW = 136, NW = 124, NH = 28, RH = 46, GAP = 28, X0 = 14, ROOT_Y = 8, BUS_Y = 52, HEAD_Y = 66, HEAD_H = 22, Y1 = 108;
  const common = branches.filter((b) => !b.special), special = branches.filter((b) => b.special), order = [...common, ...special], tiers = Math.max(1, ...nodes.map((d) => d.tier));
  const colX = new Map(); order.forEach((b, i) => colX.set(b.id, X0 + i * CW + (i >= common.length ? GAP : 0)));
  const W = X0 * 2 + order.length * CW + (special.length ? GAP : 0), H = Y1 + tiers * RH + 10, pos = new Map(), cx = (b) => colX.get(b.id) + NW / 2;
  const svg = sv("svg", { class: "tree doctree", viewBox: `0 0 ${W} ${H}`, style: "height:" + Math.min(480, H + 20) + "px;touch-action:none" });
  const midX = W / 2, line = (d, o = {}) => svg.append(sv("path", { d, fill: "none", stroke: "#4a515c", "stroke-width": 1.2, ...o }));
  // 根 → 母線 → 各系統の見出し（直線と直角）
  svg.append(sv("rect", { x: midX - 70, y: ROOT_Y, width: 140, height: 28, rx: 3, fill: "#1a1d23", stroke: "#d8b45a", "stroke-width": 1.8 }), sv("text", { x: midX, y: ROOT_Y + 19, "text-anchor": "middle", "font-size": 12, fill: "#d9d6cc" }, "◆ 軍事ドクトリン"));
  if (order.length) { line(`M${midX} ${ROOT_Y + 28}V${BUS_Y}`); line(`M${cx(order[0])} ${BUS_Y}H${cx(order.at(-1))}`); }
  const grp = (list, label, col) => { if (!list.length) return; const a = colX.get(list[0].id), b = colX.get(list.at(-1).id) + NW; svg.append(sv("rect", { x: a - 6, y: BUS_Y + 4, width: b - a + 12, height: H - BUS_Y - 8, fill: col, opacity: 0.07 }), sv("text", { x: a, y: BUS_Y - 4, "font-size": 10, fill: "#838995" }, label)); };
  grp(common, "共通 5 系統", "#6fa8c9"); grp(special, "国家固有 3 系統 ★（政体・支持勢力・地形・戦争の経験で決まる）", "#a58bd0");
  for (const b of order) { line(`M${cx(b)} ${BUS_Y}V${HEAD_Y}`); svg.append(sv("rect", { x: colX.get(b.id), y: HEAD_Y, width: NW, height: HEAD_H, rx: 3, fill: "#14161a", stroke: b.special ? "#a58bd0" : "#6a7280", "stroke-width": 1.2 }), sv("text", { x: cx(b), y: HEAD_Y + 15, "text-anchor": "middle", "font-size": 11, fill: b.special ? "#c9b6e8" : "#c8c5bb" }, (b.special ? "★ " : "") + b.ja.slice(0, 9))); line(`M${cx(b)} ${HEAD_Y + HEAD_H}V${Y1}`, { stroke: "#2f353e" }); }
  for (const d of nodes) { const x = colX.get(d.branch); if (x != null) pos.set(d.id, { x, y: Y1 + (d.tier - 1) * RH }); }
  // 前提の線: 同じ系統は真下へ、ほかの系統は「前提の下 → 横の通路 → 後続の上」の直角で結ぶ
  for (const d of nodes) for (const p of d.prereq) { const a = pos.get(p), q = pos.get(d.id); if (!a || !q) continue; const ax = a.x + NW / 2, qx = q.x + NW / 2, my = q.y - 10 - ((d.tier + p.length) % 3) * 2; line(ax === qx ? `M${ax} ${a.y + NH}V${q.y}` : `M${ax} ${a.y + NH}V${my}H${qx}V${q.y}`, { stroke: "#5a626e" }); }
  const pz = panZoom(svg, W, H, { onChange: onView }), COL = { taken: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], blocked: ["#4a515c", "#14161a"] }, SY = { taken: "■", available: "◆", blocked: "○" };
  for (const d of nodes) { const p = pos.get(d.id); if (!p) continue; const s = status(d), [stroke, fill] = COL[s]; svg.append(sv("g", { class: "tnode", "data-doc": d.id, onclick: () => { if (!pz.moved) onPick(d); } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === d.id ? "#fff" : stroke, "stroke-width": s === "taken" ? 2.6 : selected === d.id ? 2.4 : 1.4, "stroke-dasharray": s === "blocked" ? "4 3" : null }), sv("text", { x: p.x + 6, y: p.y + 18, "font-size": 11, fill: s === "blocked" ? "#838995" : "#d9d6cc" }, `${SY[s]} ${d.ja}`.slice(0, 11)))); }
  if (vb0) pz.set(vb0);
  const focus = (id) => { const p = pos.get(id); if (!p) return; const w = Math.min(W, 520), h = Math.min(H, (w * 3) / 4); pz.set({ x: Math.max(0, Math.min(W - w, p.x + NW / 2 - w / 2)), y: Math.max(0, Math.min(H - h, p.y - h / 3)), w, h }); };
  return { svg, COL, SYM: SY, fit: () => pz.set({ x: 0, y: 0, w: W, h: H }), focus, pos };
}

/** v6.5.0: 入れ子の一覧（語族・大分類から順に開く）。items: [{id,name,parent,bornAt}]。pop(id): 現在の人口。選んだものまでの道は開いておく */
export function nestedLineage(items, { selected = null, onPick, onHover = null, pop = () => 0 }) {
  const by = new Map(items.map((x) => [x.id, x])), kids = new Map(); for (const x of items) { const p = x.parent && by.has(x.parent) ? x.parent : null; (kids.get(p) ?? kids.set(p, []).get(p)).push(x); }
  const total = new Map(), tot = (x) => { if (total.has(x.id)) return total.get(x.id); let s = pop(x.id); for (const k of kids.get(x.id) ?? []) s += tot(k); total.set(x.id, s); return s; };
  for (const l of kids.values()) l.sort((a, b) => tot(b) - tot(a) || a.bornAt - b.bornAt || (a.id < b.id ? -1 : 1));
  const open = new Set(); for (let x = by.get(selected); x; x = by.get(x.parent)) open.add(x.id);
  const row = (x, depth) => h("div", { class: "nrow" + (x.id === selected ? " sel" : "") + (pop(x.id) > 0.5 ? "" : " dead"), style: `padding-left:${depth * 14}px`, onmouseenter: () => onHover?.(x.id), onmouseleave: () => onHover?.(null), onclick: (e) => { e.preventDefault(); onPick(x); } }, h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), h("span", { class: "nm" }, x.name), h("small", {}, pop(x.id) > 0.5 ? n0(pop(x.id)) : "消滅"));
  const node = (x, depth) => { const ks = kids.get(x.id) ?? []; if (!ks.length) return row(x, depth); const d = h("details", { class: "ntree", open: open.has(x.id) || (depth === 0 && ks.length <= 6) }, h("summary", {}, row(x, depth), h("small", { class: "cnt" }, `${ks.length}`)), ...ks.map((k) => node(k, depth + 1))); return d; };
  return h("div", { class: "nested" }, ...(kids.get(null) ?? []).map((r) => node(r, 0)));
}
/** v6.5.0: 小さな系統図。選んだものの先祖（左）と子（右）だけを出す */
export function miniLineage(items, id, { onPick }) {
  const by = new Map(items.map((x) => [x.id, x])), cur = by.get(id); if (!cur) return sv("svg", {});
  const anc = []; for (let x = by.get(cur.parent); x && anc.length < 4; x = by.get(x.parent)) anc.unshift(x);
  const kids = items.filter((x) => x.parent === id).sort((a, b) => a.bornAt - b.bornAt).slice(0, 6), more = items.filter((x) => x.parent === id).length - kids.length;
  const NW = 92, NH = 20, GX = 22, cols = anc.length + 1 + (kids.length ? 1 : 0), W = cols * (NW + GX), H = Math.max(40, kids.length * 26 + 14), midY = H / 2, svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "tree mini", style: `max-height:${H * 1.4}px` });
  const node = (x, cx, cy, sel) => svg.append(sv("g", { class: "tnode", onclick: () => !sel && onPick(x) }, sv("rect", { x: cx, y: cy - NH / 2, width: NW, height: NH, rx: 3, fill: "#1a1d23", stroke: sel ? "#d8b45a" : colorOf(x.id), "stroke-width": sel ? 2.2 : 1.3 }), sv("text", { x: cx + 5, y: cy + 4, "font-size": 11, fill: "#d9d6cc" }, x.name.slice(0, 7))));
  const link = (x1, y1, x2, y2) => svg.append(sv("path", { d: `M${x1} ${y1}C${x1 + 12} ${y1} ${x2 - 12} ${y2} ${x2} ${y2}`, fill: "none", stroke: "#4a515c", "stroke-width": 1.2 }));
  anc.forEach((x, i) => { node(x, i * (NW + GX), midY, false); link(i * (NW + GX) + NW, midY, (i + 1) * (NW + GX), midY); });
  const cx = anc.length * (NW + GX); node(cur, cx, midY, true);
  kids.forEach((k, i) => { const y = 7 + 13 + i * 26 + (H - 14 - kids.length * 26) / 2; node(k, cx + NW + GX, y, false); link(cx + NW, midY, cx + NW + GX, y); });
  if (more > 0) svg.append(sv("text", { x: cx + NW + GX, y: H - 1, "font-size": 10, fill: "#838995" }, `ほか ${more}`));
  return svg;
}
