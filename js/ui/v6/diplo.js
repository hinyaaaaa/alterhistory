// v6.5.0: 外交ページの再設計。左（上）で国を選ぶと、その国との関係・条約・行える外交アクションが出る。文字を減らし、色つきの帯と大きなボタンで操作する。
//   タブ: 関係 / 同盟 / 講和条約。講和条約は戦争の流れからリンクで飛んでくる（S.dtab = "peace"、S.peaceSel）。
import { h, btn, colorOf, n0, vlist } from "./common.js";
import { S, act, stateName, aliveStates, controlled } from "./store.js";
import { flag, icon, timeband } from "./visual.js";
import { allianceDiagram } from "./alliance.js";
import { TREATY, atWarWith, treatyBetween } from "../../core/civ/diplomacy.js";
import { treatyFeasible, evaluateTreaty, proposalsOf } from "../../core/wcde/negotiation.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { confirmWar } from "./warconfirm.js";

const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi), yr = (mi) => date(mi).split("月")[0] + "月";
const TCOL = { alliance: "#6fa8c9", nonaggression: "#9fbf8a", trade: "#d8b45a", war: "#d0605a", sanctions: "#a58bd0" };
const TJA = { alliance: "同盟", nonaggression: "不可侵", trade: "通商", war: "戦争", sanctions: "制裁" };
const relCol = (v) => (v >= 40 ? "#6fa8c9" : v >= 10 ? "#9fbf8a" : v > -10 ? "#6a6f78" : v > -40 ? "#d8b45a" : "#d0605a");
export const peaceKey = (p) => `${p.warId}|${p.at}|${p.from}`;
export const peacesOf = () => proposalsOf(civ()).filter((p) => p.kind === "peace" && p.status === "accepted").sort((x, y) => y.at - x.at);
export const peaceName = (p) => p.name ?? "講和条約";
const tabs = () => [["rel", "関係"], ["ally", "同盟"], ["peace", "講和条約"]];

export function pDiplo() {
  const tab = S.dtab ?? "rel", box = h("div", {}, h("div", { class: "code" }, "DIPLOMACY"), h("h2", {}, "外交"), h("div", { class: "tabs" }, ...tabs().map(([k, ja]) => h("b", { class: tab === k ? "on" : "", "data-dtab": k, onclick: () => { S.dtab = k; S.dip = null; S.peaceSel = null; S.hooks.panel(); } }, ja))));
  box.append(tab === "ally" ? allyTab() : tab === "peace" ? peaceTab() : relTab()); return box;
}

/* ---------- 関係: 国の一覧 → その国との関係（担当国があれば担当国との関係） ---------- */
function relTab() {
  const c = civ(), me = controlled(), pick = S.dip?.b;
  if (pick && c.states[pick]) return pairView(me ?? S.dip.a ?? aliveStates().sort((a, b) => b.pop - a.pop)[0]?.id, pick);
  const base = c.states[me] ?? aliveStates().sort((a, b) => b.pop - a.pop)[0]; if (!base) return h("p", { class: "n" }, "国家がありません");
  const rows = aliveStates().filter((s) => s.id !== base.id).map((s) => ({ s, v: Math.round(base.relations[s.id] ?? 0), war: atWarWith(c, base, s), ally: !!treatyBetween(c, base, s, "alliance") })).sort((a, b) => (b.war - a.war) || (b.ally - a.ally) || b.s.pop - a.s.pop);
  return h("div", {}, h("div", { class: "pairhd" }, flag(base.id, 44), h("b", {}, base.name), h("small", {}, me ? "あなたの国" : "（見守り中: 国を選ぶと関係が見える）")),
    vlist(rows, 40, (r) => h("div", { class: "drow", onmouseenter: () => { S.map.hl = { type: "states", id: r.s.id }; S.map.draw(); }, onmouseleave: () => { S.map.hl = null; S.map.draw(); }, onclick: () => { S.dip = { a: base.id, b: r.s.id }; S.hooks.panel(); } },
      flag(r.s.id, 34), h("span", { class: "nm" }, r.s.name), r.war ? h("span", { class: "tag war", title: "交戦中" }, icon("sword", 13)) : null, r.ally ? h("span", { class: "tag ally", title: "同盟" }, icon("link", 13)) : null,
      h("span", { class: "relbar", title: `関係 ${r.v}` }, h("i", { style: `left:${50 + r.v / 2}%;background:${relCol(r.v)}` })))));
}

/** 2 国の関係の詳細: 関係の帯・状態・行えるアクション・時系列 */
function pairView(aId, bId) {
  const c = civ(), A = c.states[aId], B = c.states[bId], me = controlled() === aId, v = Math.round(A.relations[bId] ?? 0), war = atWarWith(c, A, B), tr = (t) => treatyBetween(c, A, B, t), mi = c.monthIndex;
  const out = h("div", { class: "pair" }, h("div", { class: "back", onclick: () => { S.dip = null; S.map.hl = null; S.hooks.panel(); } }, "← 国の一覧"),
    h("div", { class: "vsrow" }, h("div", { class: "side" }, flag(A.id, 56), h("b", {}, A.name)), h("div", { class: "mid" }, h("span", { class: "relbar big" }, h("i", { style: `left:${50 + v / 2}%;background:${relCol(v)}` })), h("small", {}, `関係 ${v}`)), h("div", { class: "side" }, flag(B.id, 56), h("b", { onclick: () => S.hooks.select(B.id), style: "cursor:pointer" }, B.name))),
    h("div", { class: "chips" }, ...["alliance", "nonaggression", "trade"].filter((t) => tr(t)).map((t) => h("span", { class: "chip", style: `border-color:${TCOL[t]}` }, TJA[t])), war ? h("span", { class: "chip", style: `border-color:${TCOL.war}` }, "交戦中") : null, (B.sanctions?.[A.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${TCOL.sanctions}` }, "制裁を受けている") : null, (A.sanctions?.[B.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${TCOL.sanctions}` }, "制裁中") : null));
  // 行えるアクション: いま可能なものは大きなボタン、不可能なものは理由つきで灰色
  const mk = (key, label, ic, reason, go, id) => h("div", { class: "act" + (reason ? " off" : "") }, h("button", { class: "b abtn", id, disabled: !!reason, onclick: go }, icon(ic, 20), h("span", {}, label)), reason ? h("small", {}, reason) : null);
  const none = !me ? (controlled() ? "担当国以外には行えません" : "担当国がありません（見守り中）") : null;
  const treat = (type, label, ic) => { const have = tr(type); const why = none ?? (have ? "すでに結んでいる" : treatyFeasible(c, A, B, type)); let ev = null; if (!why) ev = evaluateTreaty(c, A, B, type); return mk(type, label + (ev ? (ev.accept ? "（受け入れそう）" : "（断られそう）") : ""), ic, why, () => act({ type: "state.act", stateId: A.id, action: "sign_treaty", target: B.id, opt: type }), "dp-" + type); };
  const acts = h("div", { class: "acts" }, treat("alliance", "同盟を結ぶ", "link"), treat("nonaggression", "不可侵条約を結ぶ", "handshake"), treat("trade", "通商協定を結ぶ", "coin"),
    mk("reconcile", "和解の使節を送る", "handshake", none ?? (war ? "交戦中" : v >= -20 ? "関係は悪くない（−20 未満のとき）" : A.treasury < 15 ? "財政が足りない" : null), () => act({ type: "state.act", stateId: A.id, action: "reconcile", target: B.id }), "dp-reconcile"),
    mk("sanction", "経済制裁を科す", "shield", none ?? (war ? "交戦中" : (B.sanctions?.[A.id] ?? 0) > mi ? "すでに制裁中" : v >= -10 ? "関係が悪化していない" : null), () => act({ type: "state.act", stateId: A.id, action: "impose_sanctions", target: B.id }), "dp-sanction"),
    mk("war", "宣戦する", "sword", none ?? (war ? "すでに交戦中" : tr("nonaggression") ? "不可侵条約がある" : tr("alliance") ? "同盟国には宣戦できない" : null), () => confirmWar(A.id, B.id, () => S.hooks.render()), "dp-war"));
  out.append(acts);
  // 時系列: 条約・戦争の期間を色つきの帯で
  const segs = [], ts = Object.values(c.treaties).filter((t) => (t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id));
  for (const t of ts) segs.push({ from: t.signedAt, to: t.endedAt ?? mi, color: TCOL[t.type], label: `${TJA[t.type]} ${yr(t.signedAt)}〜${t.endedAt != null ? yr(t.endedAt) : "現在"}` });
  const ws = Object.values(c.wars).filter((w) => (w.sides.a.includes(A.id) && w.sides.d.includes(B.id)) || (w.sides.a.includes(B.id) && w.sides.d.includes(A.id)));
  for (const w of ws) segs.push({ from: w.startedAt, to: w.endedAt ?? mi, color: TCOL.war, label: `${w.name ?? "戦争"} ${yr(w.startedAt)}〜${w.endedAt != null ? yr(w.endedAt) : "現在"}` });
  if (segs.length) { const t0 = Math.min(...segs.map((s) => s.from)); out.append(h("div", { class: "lb" }, "これまでの関係"), timeband(segs, t0, mi, { height: 18 }), h("div", { class: "lg" }, ...Object.keys(TCOL).filter((k) => k !== "sanctions").map((k) => h("span", {}, h("i", { style: `background:${TCOL[k]}` }), TJA[k])), h("small", {}, `${yr(t0)} 〜 現在`))); }
  else out.append(h("p", { class: "n" }, "これまで、条約も戦争もありません。"));
  const peaces = ws.map((w) => peacesOf().find((p) => p.warId === w.id)).filter(Boolean);
  if (peaces.length) out.append(h("div", { class: "lb" }, "結ばれた講和条約"), ...peaces.map((p) => h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.dtab = "peace"; S.dip = null; S.peaceSel = peaceKey(p); S.hooks.panel(); } }, peaceName(p), " ")));
  return out;
}

/* ---------- 同盟: 陣営の図と、存続中・破棄された同盟 ---------- */
function allyTab() {
  const c = civ(), all = Object.values(c.treaties).filter((t) => t.type === "alliance"), live = all.filter((t) => t.active).sort((a, b) => b.signedAt - a.signedAt), dead = all.filter((t) => !t.active).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const row = (t) => h("div", { class: "drow static" + (t.active ? "" : " dead") }, flag(t.a, 28), flag(t.b, 28), h("span", { class: "nm" }, `${stateName(t.a)}・${stateName(t.b)}`), h("small", {}, t.active ? `${yr(t.signedAt)}〜` : `${yr(t.signedAt)}〜${yr(t.endedAt ?? 0)}`));
  return h("div", {}, allianceDiagram(c, (id) => S.hooks.select(id)), h("div", { class: "lb" }, `存在する同盟（${live.length}）`), ...live.slice(0, 40).map(row), h("div", { class: "lb" }, `破棄された同盟（${dead.length}）`), ...dead.slice(0, 40).map(row));
}

/* ---------- 講和条約: 一覧と詳細（戦争ページのリンクの行き先） ---------- */
function peaceTab() {
  const c = civ(), list = peacesOf(), sel = list.find((p) => peaceKey(p) === S.peaceSel);
  if (sel) {
    const w = c.wars[sel.warId], terms = sel.terms?.kind === "reparations" ? `賠償金 ${n0(sel.terms.paid ?? sel.terms.amount)}` : sel.terms?.kind === "cession" ? "占領地の割譲" : "白紙講和（互いに領土は動かない）";
    return h("div", { class: "peace" }, h("div", { class: "back", onclick: () => { S.peaceSel = null; S.hooks.panel(); } }, "← 講和条約の一覧"), h("h3", {}, peaceName(sel)), h("div", { class: "sub" }, yr(sel.at)),
      h("div", { class: "vsrow" }, h("div", { class: "side" }, flag(sel.from, 52), h("b", {}, stateName(sel.from))), h("div", { class: "mid" }, icon("handshake", 26)), h("div", { class: "side" }, flag(sel.to, 52), h("b", {}, stateName(sel.to)))),
      h("div", { class: "kv" }, h("small", {}, "戦争"), w ? h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.hub = "war"; S.war = w.id; S.hooks.render(); } }, w.name ?? "この戦争") : "—", h("small", {}, "条件"), h("b", {}, terms), h("small", {}, "種類"), h("b", {}, sel.separate ? "単独講和" : "戦争全体の講和")));
  }
  return h("div", {}, h("p", { class: "n" }, `${list.length} 件`), vlist(list, 42, (p) => h("div", { class: "drow", onclick: () => { S.peaceSel = peaceKey(p); S.hooks.panel(); } }, icon("scroll", 18), h("span", { class: "nm" }, peaceName(p)), h("small", {}, yr(p.at)))));
}
void colorOf;
