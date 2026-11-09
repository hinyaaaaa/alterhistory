// v6.5.0: 戦争ページ。一覧は左のパネル、詳細は全面タブ（地図を覆う）。HoI4 風に、戦場の小さな地図・戦線の綱引き・両陣営の戦力バー・士気を出す。
//   経過は「主要な流れ」だけを種類ごとに色分け（外交・同盟・戦闘・占領・講和）。講和条約は名前のリンクで外交の講和条約ページへ飛ぶ。
import { h, btn, pct, n0, colorOf } from "./common.js";
import { S, act, stateName, controlled } from "./store.js";
import { listRow, sectioned, clearHl } from "./views-a.js";
import { flag, icon } from "./visual.js";
import { peaceKey, peaceName, peacesOf } from "./diplo.js";
import { POSTURES, postureOf, placeName } from "../../core/wcde/warfare.js";
import { formatWorldDate } from "../../core/wcde/world.js";

const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi), ym = (e) => `${e.date.year}年${e.date.month}月`;
const OUT = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", stalemate: "決着つかず", negotiated: "講和", state_dissolved: "国家の消滅" };
const KIND = { diplomacy: ["外交", "#a58bd0"], ally: ["同盟", "#6fa8c9"], battle: ["戦闘", "#d0605a"], occupy: ["占領", "#d8b45a"], peace: ["講和", "#9fbf8a"] };
export const warTitle = (x) => { const s = `${stateName(x.aggressor)} 対 ${stateName(x.defender)}`; return x.name ? `${x.name}（${s}）` : s; };

/** 一覧: 担当国の戦争 → 進行中 → 終結。行を押すと全面タブで詳細 */
export function pWar() {
  const c = civ(), mine = controlled(), all = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "WAR"), h("h2", {}, "戦争"));
  const sel = c.wars[S.war]; if (sel) S.full = { key: "war", title: sel.name ?? "戦争", build: () => warDetail(sel), onClose: () => { S.war = null; clearHl(); } };
  const inW = (x) => mine && [...x.sides.a, ...x.sides.d].includes(mine), live = all.filter((x) => x.status === "active");
  box.append(h("p", { class: "n" }, `進行中 ${live.length}・全体 ${all.length} 件`), sectioned([{ title: "あなたの国の戦争", rows: live.filter(inW) }, { title: "進行中の戦争", rows: live.filter((x) => !inW(x)) }, { title: "終結した戦争", rows: all.filter((x) => x.status !== "active"), fold: "endedWars" }], 40, (x) => listRow({ type: "war", id: x.id }, [flag(x.aggressor, 26), flag(x.defender, 26), h("span", { class: "g" }, x.name ?? `${stateName(x.aggressor)} 対 ${stateName(x.defender)}`), h("small", {}, x.status === "active" ? `開戦 ${date(x.startedAt).split("月")[0]}月` : OUT[x.outcome] ?? x.outcome)], () => { S.war = x.id; S.hooks.render(); }, inW(x) ? "mine" : x.status === "active" ? "" : "dead")));
  return box;
}

/** 戦場の小さな地図: 両陣営の領土（青＝攻撃側・赤＝防衛側）と、占領された区画（黄） */
function miniMap(x) {
  const c = civ(), M = S.map, W = 320, H = 170, pts = [], side = (id) => (x.sides.a.includes(id) ? "a" : x.sides.d.includes(id) ? "d" : null), occ = new Set(x.occupied ?? []);
  for (const g of Object.values(c.groups)) { const s = g.stateId && side(g.stateId); if (!s && !occ.has(g.id)) continue; const cells = g.cells?.length ? g.cells : [g.cell], step = Math.max(1, Math.ceil(cells.length / 30)); for (let i = 0; i < cells.length; i += step) { const [px, py] = M.proj(M.geo.cen[cells[i] * 2], M.geo.cen[cells[i] * 2 + 1], M.cv.width, M.cv.height); pts.push([px, py, s, occ.has(g.id)]); } }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "minimap"); svg.setAttribute("width", "100%");
  if (!pts.length) return svg;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.min((W - 24) / Math.max(1, x1 - x0), (H - 24) / Math.max(1, y1 - y0), 6), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  svg.innerHTML = `<rect width="${W}" height="${H}" fill="#12161c"/>` + pts.map(([px, py, s, o]) => `<circle cx="${(ox + (px - x0) * k).toFixed(1)}" cy="${(oy + (py - y0) * k).toFixed(1)}" r="${o ? 3.2 : 2.2}" fill="${o ? "#d8b45a" : s === "a" ? "#6fa8c9" : "#d0605a"}" fill-opacity="${o ? 0.95 : 0.7}"/>`).join("");
  return svg;
}
/** 綱引き: 戦況スコア（-100〜100）。左が攻撃側 */
const tug = (score) => h("div", { class: "tug", title: `戦況 ${Math.round(score)}` }, h("i", { class: "a", style: `width:${50 + score / 2}%` }), h("i", { class: "d", style: `width:${50 - score / 2}%` }), h("b", { style: `left:${50 + score / 2}%` }));

function sideBox(x, s) {
  const c = civ(), ids = x.sides[s], fs = Object.values(x.ops?.forces ?? {}).filter((f) => f.side === s), size = fs.reduce((a, f) => a + f.size, 0), mor = fs.length ? fs.reduce((a, f) => a + f.morale * f.size, 0) / Math.max(1, size) : 0, sup = fs.length ? fs.reduce((a, f) => a + f.supply * f.size, 0) / Math.max(1, size) : 0;
  return { size, el: h("div", { class: "wside " + s }, h("div", { class: "flags" }, ...ids.slice(0, 5).map((i) => h("span", { title: stateName(i) }, flag(i, 36)))), h("small", {}, ids.map(stateName).join("・")), h("div", { class: "wm" }, icon("sword", 14), h("b", { class: "sz" }, n0(size))), h("div", { class: "wm", title: `士気 ${pct(mor)}` }, h("small", {}, "士気"), h("span", { class: "barv" }, h("i", { style: `width:${mor * 100}%;background:#9fbf8a` }))), h("div", { class: "wm", title: `補給 ${pct(sup)}` }, h("small", {}, "補給"), h("span", { class: "barv" }, h("i", { style: `width:${sup * 100}%;background:#d8b45a` })))) };
  void c;
}

/** 主要な流れ: 開戦・同盟の参戦・名のある戦い・占領・講和。種類ごとに色分け。講和条約は名前のリンク */
function flowOf(x) {
  const c = civ(), items = [], ctx = S.w.sim.ctx;
  for (const e of c.events) { if (!e.participants.some((p) => p.entityId === x.id)) continue; const k = e.kind, t = k === "war_declared" ? "diplomacy" : k === "ally_joined" ? "ally" : k === "territory_occupied" || k === "cession" ? "occupy" : k === "war_ended" ? "peace" : null; if (t) items.push({ at: e.date.year * 12 + e.date.month, label: ym(e), text: e.title, t }); }
  for (const b of x.ops?.battles ?? []) if (b.notable || b.kind === "siege" || b.kind === "naval") items.push({ mi: b.at, text: `${b.name}（${stateName(b.winner)}が制した）`, t: "battle" });
  const peaces = peacesOf().filter((p) => p.warId === x.id); for (const p of peaces) items.push({ mi: p.at, text: "", t: "peace", peace: p });
  for (const p of (S.w.civ.wcde.diplomacy?.proposals ?? []).filter((q) => q.kind === "peace" && q.warId === x.id && q.status === "rejected").slice(-3)) items.push({ mi: p.at, text: `${stateName(p.from)}が講和を申し入れたが、受け入れられなかった`, t: "diplomacy" });
  const key = (mi) => c.date.year * 12 + c.date.month + (mi - c.monthIndex);
  for (const it of items) if (it.mi != null) { it.label = date(it.mi).split("月")[0] + "月"; it.at = key(it.mi); }
  items.sort((a, b) => a.at - b.at); const shown = items.length > 18 ? [...items.slice(0, 3), ...items.slice(-15)] : items; void ctx;
  return h("div", { class: "flow" }, ...(shown.length ? shown.map((it) => h("div", { class: "fl", style: `border-color:${KIND[it.t][1]}` }, h("small", { class: "ft", style: `color:${KIND[it.t][1]}` }, KIND[it.t][0]), h("time", {}, it.label), it.peace ? h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.hub = "diplo"; S.dtab = "peace"; S.dip = null; S.peaceSel = peaceKey(it.peace); S.full = null; S.war = null; S.hooks.render(); } }, peaceName(it.peace)) : h("span", {}, it.text))) : [h("p", { class: "n" }, "記録された出来事はまだありません")]));
}

/** 詳細（全面タブの中身） */
export function warDetail(x) {
  const c = civ(), mine = controlled(), inWar = [...x.sides.a, ...x.sides.d].includes(mine), A = sideBox(x, "a"), D = sideBox(x, "d"), live = x.status === "active", th = Object.values(x.ops?.theaters ?? {});
  const out = h("div", { class: "wardetail" }, h("div", { class: "whead" }, h("h2", {}, x.name ?? warTitle(x)), h("div", { class: "sub" }, `${live ? "進行中" : "終結（" + (OUT[x.outcome] ?? x.outcome) + "）"}・開戦 ${date(x.startedAt)}${x.endedAt != null ? "・終戦 " + date(x.endedAt) : ""}`)),
    h("div", { class: "wgrid" }, A.el, h("div", { class: "wmid" }, miniMap(x), tug(x.score), h("small", { class: "tugl" }, h("span", {}, "攻撃側"), h("span", {}, x.score > 8 ? "攻撃側が優勢" : x.score < -8 ? "防衛側が優勢" : "拮抗"), h("span", {}, "防衛側")), h("div", { class: "lg" }, h("span", {}, h("i", { style: "background:#6fa8c9" }), "攻撃側"), h("span", {}, h("i", { style: "background:#d0605a" }), "防衛側"), h("span", {}, h("i", { style: "background:#d8b45a" }), `占領 ${x.occupied?.length ?? 0}`))), D.el));
  const tot = A.size + D.size || 1; out.append(h("div", { class: "pwr", title: "兵力の比" }, h("i", { class: "a", style: `width:${(A.size / tot) * 100}%` }), h("i", { class: "d", style: `width:${(D.size / tot) * 100}%` })));
  if (th.length) out.append(h("div", { class: "lb" }, "戦線"), ...th.map((t) => h("div", { class: "front" }, h("span", { class: "nm" }, t.name), h("span", { class: "tug sm" }, h("i", { class: "a", style: `width:${50 + (t.control ?? 0) * 50}%` }), h("i", { class: "d", style: `width:${50 - (t.control ?? 0) * 50}%` })), h("small", {}, t.kind === "sea" ? "海" : "陸"))));
  out.append(h("div", { class: "lb" }, "主要な流れ"), h("div", { class: "lg" }, ...Object.values(KIND).map(([ja, col]) => h("span", {}, h("i", { style: `background:${col}` }), ja))), flowOf(x));
  if (live && inWar) { // 方針の指示と講和（担当国が参戦しているときだけ）
    const o = x.ops, d = o?.direction?.[mine] ?? {}, cur = d.posture ?? postureOf(S.w.sim.ctx, x, c.states[mine]), post = h("select", { id: "war-posture" }, ...Object.entries(POSTURES).map(([k, ja]) => h("option", { value: k, selected: k === cur }, ja))), com = h("input", { id: "war-commit", type: "range", min: 0.3, max: 1, step: 0.05, value: d.commit ?? 0.75 }), foc = h("select", { id: "war-focus" }, h("option", { value: "" }, "重点: 自動"), ...th.map((t) => h("option", { value: t.id, selected: d.focus === t.id }, t.name)));
    out.append(h("div", { class: "lb" }, "方針"), h("div", { class: "rowb" }, post, foc, h("small", {}, "投入"), com, btn("伝える", () => act({ type: "war.direct", stateId: mine, warId: x.id, posture: post.value, commit: Number(com.value), focus: foc.value || null }), "p", { id: "war-direct" })));
    const kind = h("select", { id: "peace-kind" }, h("option", { value: "white" }, "白紙講和"), h("option", { value: "reparations" }, "賠償つき")), amt = h("input", { id: "peace-amt", type: "number", placeholder: "賠償額", style: "width:90px" });
    out.append(h("div", { class: "lb" }, "講和"), h("div", { class: "rowb" }, kind, amt, btn("講和を申し入れる", () => act({ type: "diplomacy.peace", stateId: mine, warId: x.id, terms: { kind: kind.value, amount: Number(amt.value) || 0 } }), "p", { id: "peace-go" })));
  }
  void colorOf; void placeName; return out;
}
