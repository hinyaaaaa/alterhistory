// v6 UI: 樹形図・ツリー。技術ツリー（四方位へ広がる）・軍事ドクトリン・文化／言語／宗教の系統図。すべて実データから描く。
//   ・パン（ドラッグ）とズーム（ホイール）で、ノードが増えても操作できる。
//   ・技術は「採用済み」「採用できる（前提を満たす）」「発見済みだが採用できない」「未発見」を区別する。
import { h, sv, colorOf } from "./common.js";

/** SVG にパン・ズームを付ける（viewBox を操作） */
export function panZoom(svg, W, H) {
  let vb = { x: 0, y: 0, w: W, h: H }; const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); apply(); let drag = null, moved = false;
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

/** 技術ツリー: 系統（field）ごとに四方位へ、中心から階層（tier）が外へ広がる放射状。通信の有無・前提・採用を区別する */
export function techTree({ techs, status, onPick, selected }) {
  const fields = [...new Set(techs.map((t) => t.field))], quad = (f) => fields.indexOf(f) % 4, ang = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], R = 90, W = 1000, H = 1000, svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, style: "height:420px" });
  const byField = new Map(); for (const t of techs) (byField.get(t.field) ?? byField.set(t.field, []).get(t.field)).push(t); const pos = new Map();
  fields.forEach((f, fi) => { const list = byField.get(f).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1)), q = quad(f), sub = Math.floor(fi / 4), base = ang[q] + (sub % 2 ? 0.33 : -0.33) * (sub ? 1 : 0), tiers = new Map(); for (const t of list) (tiers.get(t.tier) ?? tiers.set(t.tier, []).get(t.tier)).push(t); for (const [tier, arr] of tiers) arr.forEach((t, i) => { const a = base + (i - (arr.length - 1) / 2) * 0.17, r = R + tier * 105; pos.set(t.key, { x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) }); }); });
  svg.append(sv("circle", { cx: 500, cy: 500, r: 38, fill: "#1a1d23", stroke: "#d8b45a" }), sv("text", { x: 500, y: 504, "text-anchor": "middle", "font-size": 12, fill: "#d9d6cc" }, "技術"));
  for (const t of techs) for (const p of t.prereq) { const a = pos.get(p), b = pos.get(t.key); if (a && b) svg.append(sv("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: status(t) === "locked" ? "#2f353e" : "#6fa8c9", "stroke-width": 1.2, opacity: 0.7 })); else if (b) svg.append(sv("line", { x1: 500, y1: 500, x2: b.x, y2: b.y, stroke: "#2f353e", opacity: 0.4 })); }
  const pz = panZoom(svg, W, H); pz.set({ x: 500 - 230, y: 500 - 230, w: 460, h: 460 }); const COL = { adopted: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], known: ["#a58bd0", "#201a2e"], locked: ["#4a515c", "#14161a"] };
  for (const t of techs) { const p = pos.get(t.key), s = status(t), [stroke, fill] = COL[s]; svg.append(sv("g", { class: "tnode", onclick: () => { if (!pz.moved) onPick(t); } }, sv("rect", { x: p.x - 42, y: p.y - 12, width: 84, height: 24, fill, stroke: selected === t.key ? "#fff" : stroke, "stroke-width": s === "adopted" ? 2.6 : 1.4, "stroke-dasharray": s === "locked" ? "4 3" : null }), sv("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", "font-size": 12, fill: s === "locked" ? "#838995" : "#d9d6cc" }, t.name.slice(0, 7)))); }
  return { svg, fields, COL };
}

/** ドクトリンの木: 階層を左から右へ。共通と政体固有を上下に分ける。前提の線を結ぶ */
export function doctrineTree({ list, status, onPick, selected }) {
  const groups = [list.filter((d) => !d.polity), list.filter((d) => d.polity)], tiers = Math.max(...list.map((d) => d.tier)), pos = new Map(), DX = 150, DY = 30; let yOff = 20;
  for (const g of groups) { const cnt = new Map(); g.sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1)).forEach((d) => { const i = cnt.get(d.tier) ?? 0; cnt.set(d.tier, i + 1); pos.set(d.id, { x: 20 + (d.tier - 1) * DX, y: yOff + i * DY }); }); yOff += Math.max(0, ...cnt.values()) * DY + 28; }
  const W = 40 + tiers * DX, H = yOff, svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, style: "height:" + Math.min(420, H) + "px" });
  for (const d of list) for (const p of d.prereq) { const a = pos.get(p), b = pos.get(d.id); if (a && b) svg.append(sv("path", { d: `M${a.x + 124} ${a.y + 10}L${b.x} ${b.y + 10}`, stroke: "#4a515c", fill: "none" })); }
  const pz = panZoom(svg, W, H), COL = { taken: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], blocked: ["#4a515c", "#14161a"] };
  svg.append(sv("text", { x: 20, y: 12, "font-size": 11, fill: "#a1a6b0" }, "共通の系統")); if (groups[1].length) svg.append(sv("text", { x: 20, y: pos.get(groups[1][0].id).y - 8, "font-size": 11, fill: "#a58bd0" }, "政体固有の系統"));
  for (const d of list) { const p = pos.get(d.id), s = status(d), [stroke, fill] = COL[s]; svg.append(sv("g", { class: "tnode", onclick: () => { if (!pz.moved) onPick(d); } }, sv("rect", { x: p.x, y: p.y, width: 124, height: 22, fill, stroke: selected === d.id ? "#fff" : stroke, "stroke-width": s === "taken" ? 2.4 : 1.2, "stroke-dasharray": s === "blocked" ? "4 3" : null }), sv("text", { x: p.x + 6, y: p.y + 15, "font-size": 11, fill: s === "blocked" ? "#838995" : "#d9d6cc" }, d.ja.slice(0, 9)))); }
  return { svg, COL };
}
