// v6.5.0: 外交ページの再設計。左（上）で国を選ぶと、その国との関係・条約・行える外交アクションが出る。文字を減らし、色つきの帯と大きなボタンで操作する。
//   v6.16.0: 関係の一覧を「同盟国・不可侵条約締結国・通商条約締結国・属国／宗主・敵対国」にくくる。条約の提案は専用の画面（候補の件数制限なし）。盟約（3 か国以上）の結成・加盟。
//   タブ: 関係 / 盟約 / 講和条約。講和条約は戦争の流れからリンクで飛んでくる（S.dtab = "peace"、S.peaceSel）。
import { h, btn, holdBtn, colorOf, n0, vlist } from "./common.js";
import { S, act, stateName, aliveStates, controlled } from "./store.js";
import { flag, icon, timeband } from "./visual.js";
import { allianceDiagram } from "./alliance.js";
import { TREATY, TREATY_CATS, atWarWith, treatyBetween } from "../../core/civ/diplomacy.js";
import { treatyFeasible, evaluateTreaty, proposalsOf, temperOf } from "../../core/wcde/negotiation.js";
import { listPacts, PACT_PURPOSES } from "../../core/wcde/pacts.js";
import { DEP_KINDS, dependentsOf } from "../../core/wcde/dependency.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { confirmWar } from "./warconfirm.js";

const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi), yr = (mi) => date(mi).split("月")[0] + "月";
const CATC = { mil: "#6fa8c9", dep: "#a58bd0", eco: "#d8b45a", land: "#7fc4b0", dyn: "#d68fa8" }, WARC = "#d0605a", SANC = "#a58bd0";
const tcol = (type) => CATC[TREATY[type]?.cat] ?? "#9fbf8a", tja = (type) => TREATY[type]?.ja ?? type;
const relCol = (v) => (v >= 40 ? "#6fa8c9" : v >= 10 ? "#9fbf8a" : v > -10 ? "#6a6f78" : v > -40 ? "#d8b45a" : "#d0605a");
export const peaceKey = (p) => `${p.warId}|${p.at}|${p.from}`;
export const peacesOf = () => proposalsOf(civ()).filter((p) => p.kind === "peace" && p.status === "accepted").sort((x, y) => y.at - x.at);
export const peaceName = (p) => p.name ?? "講和条約";
const tabs = () => [["rel", "関係"], ["pact", "盟約"], ["peace", "講和条約"]];
const hov = (id) => ({ onmouseenter: () => { S.map.hl = { type: "states", id }; S.map.draw(); }, onmouseleave: () => { S.map.hl = null; S.map.draw(); } });

export function pDiplo() {
  const tab = S.dtab ?? "rel", box = h("div", {}, h("div", { class: "code" }, "DIPLOMACY"), h("h2", {}, "外交"), h("div", { class: "tabs" }, ...tabs().map(([k, ja]) => h("b", { class: tab === k ? "on" : "", "data-dtab": k, onclick: () => { S.dtab = k; S.dip = null; S.peaceSel = null; S.prop = null; S.hooks.panel(); } }, ja))));
  box.append(tab === "pact" ? pactTab() : tab === "peace" ? peaceTab() : relTab()); return box;
}

/* ---------- 関係: 結びつきごとの国のくくり → その国との関係 ---------- */
function ties(c, base) {
  const sec = { over: new Map(), subj: new Map(), ally: new Map(), nap: new Map(), trade: new Map(), other: new Map(), enemy: new Map() }, put = (k, id, ja) => { const m = sec[k]; (m.get(id) ?? m.set(id, []).get(id)).push(ja); };
  for (const t of Object.values(c.treaties)) {
    if (!t.active || (t.a !== base.id && t.b !== base.id)) continue; const o = t.a === base.id ? t.b : t.a, T = TREATY[t.type]; if (!c.states[o]?.alive) continue;
    if (T.cat === "dep" && t.type !== "union") put(t.a === base.id ? "subj" : "over", o, `${DEP_KINDS[T.dep].ja}`); else if (t.type === "union") put(t.a === base.id ? "subj" : "over", o, "同君連合");
    else if (t.type === "alliance" || t.type === "defensive") put("ally", o, T.ja); else if (t.type === "nonaggression") put("nap", o, T.ja); else if (t.type === "trade" || t.type === "tariff" || t.type === "unequal") put("trade", o, T.ja); else put("other", o, T.ja);
  }
  for (const s of aliveStates()) if (s.id !== base.id && (atWarWith(c, base, s) || (base.relations[s.id] ?? 0) <= -40)) put("enemy", s.id, atWarWith(c, base, s) ? "交戦中" : "険悪");
  return sec;
}
function relTab() {
  const c = civ(), me = controlled(), pick = S.dip?.b;
  if (pick && c.states[pick]) return pairView(me ?? S.dip.a ?? aliveStates().sort((a, b) => b.pop - a.pop)[0]?.id, pick);
  const base = c.states[me] ?? aliveStates().sort((a, b) => b.pop - a.pop)[0]; if (!base) return h("p", { class: "n" }, "国家がありません");
  const sec = ties(c, base), go = (id) => { S.dip = { a: base.id, b: id }; S.prop = null; S.hooks.panel(); };
  const card = (id, tags, col) => h("div", { class: "fc", style: `border-color:${col}`, ...hov(id), onclick: () => go(id) }, flag(id, 40), h("b", {}, c.states[id].name), h("small", {}, tags.join("・")));
  const group = (title, col, map) => (map.size ? [h("div", { class: "lb" }, title, h("em", {}, map.size)), h("div", { class: "fgrid" }, ...[...map].map(([id, tags]) => card(id, tags, col)))] : []);
  const dep = base.dependency && c.states[base.dependency.overlord]?.alive ? base.dependency : null;
  const known = new Set(Object.values(sec).flatMap((m) => [...m.keys()])), rows = aliveStates().filter((s) => s.id !== base.id && !known.has(s.id)).map((s) => ({ s, v: Math.round(base.relations[s.id] ?? 0) })).sort((a, b) => b.s.pop - a.s.pop);
  return h("div", {}, h("div", { class: "pairhd" }, flag(base.id, 44), h("b", {}, base.name), dep ? h("small", {}, `${stateName(dep.overlord)}の${DEP_KINDS[dep.kind].ja}`) : null),
    ...group("宗主", "#a58bd0", sec.over), ...group("属国・従う国", "#a58bd0", sec.subj), ...group("同盟国", "#6fa8c9", sec.ally), ...group("不可侵条約締結国", "#9fbf8a", sec.nap), ...group("通商条約締結国", "#d8b45a", sec.trade), ...group("そのほかの協定", "#7fc4b0", sec.other), ...group("敵対国", WARC, sec.enemy),
    h("div", { class: "lb" }, "ほかの国", h("em", {}, rows.length)),
    vlist(rows, 40, (r) => h("div", { class: "drow", ...hov(r.s.id), onclick: () => go(r.s.id) }, flag(r.s.id, 34), h("span", { class: "nm" }, r.s.name), h("span", { class: "relbar", title: `関係 ${r.v}` }, h("i", { style: `left:${50 + r.v / 2}%;background:${relCol(r.v)}` })))));
}

/** 条約の提案（専用の画面）: 分類 → 種類 → 提案。件数の制限はなく、どの国にも出せる */
function proposeBox(A, B, c, none) {
  const P = S.prop?.b === B.id ? S.prop : (S.prop = { b: B.id, cat: "mil", reverse: false }), box = h("div", { class: "prop" });
  const dep = P.cat === "dep" || P.cat === "dyn";
  box.append(h("div", { class: "lb" }, "条約を提案する"), h("div", { class: "chips" }, ...Object.entries(TREATY_CATS).map(([k, ja]) => h("b", { class: P.cat === k ? "on" : "", style: P.cat === k ? `background:${CATC[k]};border-color:${CATC[k]}` : `border-color:${CATC[k]}66`, "data-pcat": k, onclick: () => { P.cat = k; S.hooks.panel(); } }, ja))));
  if (dep) box.append(h("div", { class: "chips" }, h("b", { class: !P.reverse ? "on" : "", onclick: () => { P.reverse = false; S.hooks.panel(); } }, "こちらが上に立つ"), h("b", { class: P.reverse ? "on" : "", onclick: () => { P.reverse = true; S.hooks.panel(); } }, "こちらが従う")));
  const tp = temperOf(B); box.append(h("small", { class: "tp" }, `${B.name}の君主: ${tp.ja}`));
  for (const [type, T] of Object.entries(TREATY).filter(([, x]) => x.cat === P.cat)) {
    const rev = P.reverse && T.dep != null, have = treatyBetween(c, A, B, type), why = none ?? (have ? "すでに結んでいる" : treatyFeasible(c, A, B, type, { reverse: rev })), land = ["purchase", "cession", "exchange"].includes(type);
    const ev = !why && !land ? evaluateTreaty(c, A, B, type, { reverse: rev }) : null, st = why ? h("span", { class: "tst off" }, why) : ev ? h("span", { class: "tst " + (ev.accept ? "ok" : "ng") }, ev.accept ? "受け入れそう" : "断られそう") : h("span", { class: "tst" }, "交渉次第");
    box.append(h("div", { class: "tcard" + (why ? " off" : ""), style: `border-left-color:${CATC[T.cat]}` }, h("div", { class: "th" }, h("b", {}, T.ja), st), h("div", { class: "pl" }, "＋ ", T.merit), h("div", { class: "mi" }, "－ ", T.cost),
      btn("提案する", () => act({ type: "diplomacy.propose", stateId: A.id, target: B.id, treaty: type, reverse: rev }), "abtn", { disabled: !!why, id: "tp-" + type })));
  }
  if (S.notice) box.append(h("p", { class: "n" }, S.notice)); return box;
}

/** 2 国の関係の詳細: 関係の帯・状態・提案・行えるアクション・時系列 */
function pairView(aId, bId) {
  const c = civ(), A = c.states[aId], B = c.states[bId], me = controlled() === aId, v = Math.round(A.relations[bId] ?? 0), war = atWarWith(c, A, B), mi = c.monthIndex;
  const act0 = Object.values(c.treaties).filter((t) => t.active && ((t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id)));
  const out = h("div", { class: "pair" }, h("div", { class: "back", onclick: () => { S.dip = null; S.prop = null; S.map.hl = null; S.hooks.panel(); } }, "← 国の一覧"),
    h("div", { class: "vsrow" }, h("div", { class: "side" }, flag(A.id, 56), h("b", {}, A.name)), h("div", { class: "mid" }, h("span", { class: "relbar big" }, h("i", { style: `left:${50 + v / 2}%;background:${relCol(v)}` })), h("small", {}, `関係 ${v}`)), h("div", { class: "side" }, flag(B.id, 56), h("b", { onclick: () => S.hooks.select(B.id), style: "cursor:pointer" }, B.name))),
    h("div", { class: "chips" }, ...act0.map((t) => h("span", { class: "chip", style: `border-color:${tcol(t.type)}` }, t.type !== "union" && TREATY[t.type].dep ? (t.a === A.id ? `${DEP_KINDS[TREATY[t.type].dep].ja}（${B.name}）` : `${tja(t.type)}（宗主）`) : tja(t.type))), war ? h("span", { class: "chip", style: `border-color:${WARC}` }, "交戦中") : null, (B.sanctions?.[A.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${SANC}` }, "制裁を受けている") : null, (A.sanctions?.[B.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${SANC}` }, "制裁中") : null));
  const none = !me ? (controlled() ? "担当国以外には行えません" : "担当国がありません（見守り中）") : null;
  const mk = (key, label, ic, reason, go, id) => h("div", { class: "act" + (reason ? " off" : "") }, h("button", { class: "b abtn", id, disabled: !!reason, onclick: go }, icon(ic, 20), h("span", {}, label)), reason ? h("small", {}, reason) : null);
  out.append(h("div", { class: "acts" },
    mk("reconcile", "和解の使節を送る", "handshake", none ?? (war ? "交戦中" : v >= -20 ? "関係は悪くない（−20 未満のとき）" : A.treasury < 15 ? "財政が足りない" : null), () => act({ type: "state.act", stateId: A.id, action: "reconcile", target: B.id }), "dp-reconcile"),
    mk("sanction", "経済制裁を科す", "shield", none ?? (war ? "交戦中" : (B.sanctions?.[A.id] ?? 0) > mi ? "すでに制裁中" : v >= -10 ? "関係が悪化していない" : null), () => act({ type: "state.act", stateId: A.id, action: "impose_sanctions", target: B.id }), "dp-sanction"),
    mk("war", "宣戦する", "sword", none ?? (war ? "すでに交戦中" : act0.some((t) => t.type === "nonaggression") ? "不可侵条約がある" : act0.some((t) => t.type === "alliance" || t.type === "defensive") ? "同盟国には宣戦できない" : act0.some((t) => TREATY[t.type].cat === "dep") ? "従属の結びつきがある" : null), () => confirmWar(A.id, B.id, () => S.hooks.render()), "dp-war")));
  if (me) { // 従属の解消・独立（長押しで実行）
    if (B.dependency?.overlord === A.id) out.append(h("div", { class: "rowb" }, holdBtn(`${B.name}を独立させる`, () => act({ type: "diplomacy.dependency", stateId: A.id, target: B.id, mode: "release" }), "", { id: "dp-release" })));
    if (A.dependency?.overlord === B.id) out.append(h("div", { class: "rowb" }, holdBtn("独立を宣言する", () => act({ type: "diplomacy.dependency", stateId: A.id, mode: "independence" }), "", { id: "dp-indep" })));
  }
  if (!war) out.append(proposeBox(A, B, c, none));
  // 時系列: 条約・戦争の期間を色つきの帯で
  const segs = [], ts = Object.values(c.treaties).filter((t) => (t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id));
  for (const t of ts) segs.push({ from: t.signedAt, to: t.endedAt ?? mi, color: tcol(t.type), label: `${tja(t.type)} ${yr(t.signedAt)}〜${t.endedAt != null ? yr(t.endedAt) : "現在"}` });
  const ws = Object.values(c.wars).filter((w) => (w.sides.a.includes(A.id) && w.sides.d.includes(B.id)) || (w.sides.a.includes(B.id) && w.sides.d.includes(A.id)));
  for (const w of ws) segs.push({ from: w.startedAt, to: w.endedAt ?? mi, color: WARC, label: `${w.name ?? "戦争"} ${yr(w.startedAt)}〜${w.endedAt != null ? yr(w.endedAt) : "現在"}` });
  if (segs.length) { const t0 = Math.min(...segs.map((s) => s.from)); out.append(h("div", { class: "lb" }, "これまでの関係"), timeband(segs, t0, mi, { height: 18 }), h("div", { class: "lg" }, ...[...Object.entries(TREATY_CATS).map(([k, ja]) => [CATC[k], ja]), [WARC, "戦争"]].map(([col, ja]) => h("span", {}, h("i", { style: `background:${col}` }), ja)), h("small", {}, `${yr(t0)} 〜 現在`))); }
  else out.append(h("p", { class: "n" }, "これまで、条約も戦争もありません。"));
  const peaces = ws.map((w) => peacesOf().find((p) => p.warId === w.id)).filter(Boolean);
  if (peaces.length) out.append(h("div", { class: "lb" }, "結ばれた講和条約"), ...peaces.map((p) => h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.dtab = "peace"; S.dip = null; S.peaceSel = peaceKey(p); S.hooks.panel(); } }, peaceName(p), " ")));
  return out;
}

/* ---------- 盟約: 3 か国以上の同盟・連合。結成と加盟、陣営の図 ---------- */
function pactTab() {
  const c = civ(), me = controlled(), list = listPacts(c).sort((a, b) => b.members.length - a.members.length), root = h("div", {});
  const S2 = (S.pact ??= { purpose: "defense", members: [], target: "" });
  if (me && c.states[me]) {
    const base = c.states[me], cand = aliveStates().filter((s) => s.id !== me).sort((a, b) => (base.relations[b.id] ?? 0) - (base.relations[a.id] ?? 0)).slice(0, 36);
    root.append(h("div", { class: "lb" }, "盟約を結ぶ"), h("div", { class: "pcards" }, ...Object.entries(PACT_PURPOSES).map(([k, P]) => h("div", { class: "tcard sel" + (S2.purpose === k ? " on" : ""), "data-purpose": k, onclick: () => { S2.purpose = k; S.hooks.panel(); } }, h("div", { class: "th" }, h("b", {}, P.ja)), h("div", { class: "pl" }, "＋ ", P.merit), h("div", { class: "mi" }, "－ ", P.cost)))),
      h("small", { class: "tp" }, "誘う国を選ぶ"), h("div", { class: "fgrid" }, ...cand.map((s) => h("div", { class: "fc" + (S2.members.includes(s.id) ? " on" : ""), "data-pm": s.id, ...hov(s.id), onclick: () => { S2.members = S2.members.includes(s.id) ? S2.members.filter((x) => x !== s.id) : [...S2.members, s.id]; S.hooks.panel(); } }, flag(s.id, 34), h("b", {}, s.name), h("small", {}, `関係 ${Math.round(base.relations[s.id] ?? 0)}`)))));
    if (S2.purpose === "counter") root.append(h("div", { class: "rowb" }, h("small", { class: "tp" }, "対抗する国"), h("select", { id: "pact-target", onchange: (e) => { S2.target = e.target.value; } }, h("option", { value: "" }, "—"), ...aliveStates().filter((s) => s.id !== me).sort((a, b) => b.pop - a.pop).slice(0, 40).map((s) => h("option", { value: s.id, selected: S2.target === s.id }, s.name)))));
    root.append(h("div", { class: "rowb" }, btn(`結成する（${S2.members.length + 1}か国）`, () => { const r = act({ type: "diplomacy.pactCreate", stateId: me, purpose: S2.purpose, members: S2.members, target: S2.purpose === "counter" ? S2.target : null }); if (r.ok) S.pact = null; }, "abtn", { id: "pact-create", disabled: S2.members.length < 2 })), S.notice ? h("p", { class: "n" }, S.notice) : null);
  }
  root.append(h("div", { class: "lb" }, "存在する盟約", h("em", {}, list.length)));
  for (const p of list.slice(0, 40)) {
    const P = PACT_PURPOSES[p.purpose], mine = me && p.members.includes(me);
    root.append(h("div", { class: "pc" + (mine ? " mine" : "") }, h("div", { class: "th" }, h("b", {}, p.name), h("span", { class: "tst ok" }, P.ja), h("small", {}, `${yr(p.formedAt)}〜`)),
      h("div", { class: "fgrid tight" }, ...p.members.map((id) => h("div", { class: "fm", title: stateName(id), ...hov(id), onclick: () => S.hooks.select(id) }, flag(id, 30), id === p.leaderId ? icon("crown", 13) : null))), p.target ? h("small", { class: "tp" }, `対抗: ${stateName(p.target)}`) : null,
      me ? (mine ? holdBtn("脱退する", () => act({ type: "diplomacy.pactLeave", stateId: me, pactId: p.id }), "", { "data-leave": p.id }) : btn("加盟を申し込む", () => act({ type: "diplomacy.pactJoin", stateId: me, pactId: p.id }), "", { "data-join": p.id })) : null));
  }
  root.append(h("div", { class: "lb" }, "同盟の図"), allianceDiagram(c, (id) => S.hooks.select(id))); return root;
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

void colorOf;
void n0;
void dependentsOf;
