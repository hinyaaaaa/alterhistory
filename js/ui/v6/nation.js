// v6.5.0: 国家ページ。HoI4 風に、旗・為政者の顔・主要指標のアイコンを頭に置き、本文はバー・円・アイコンで表す（説明文は最小限）。
import { h, lb, btn, pct, n0, r2, face, hemi, colorOf, FACTION_JA, FACTION_COL, donut } from "./common.js";
import { S, run, act, creator, aliveStates, controlled } from "./store.js";
import { flag, icon, metric, ring, stackbar } from "./visual.js";
import { confirmWar } from "./warconfirm.js";
import { officesBox, uprisingBox, creatorBox } from "./views-a.js";
import { policyBox } from "./policy.js";
import { regimeJa } from "../../core/wcde/regimes.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { ideasOf } from "../../core/wcde/domains/politics.js";
import { UNIT_KINDS, formationsOf } from "../../core/wcde/domains/military.js";
import { taxMult } from "../../core/civ/techfx.js";
import { atWarWith, treatyBetween } from "../../core/civ/diplomacy.js";
import { formatWorldDate } from "../../core/wcde/world.js";

const civ = () => S.w.civ;
const KIND_COL = { infantry: "#9fbf8a", ranged: "#d8b45a", cavalry: "#c99a6f", navy: "#6fa8c9", garrison: "#8fb3b0", firearms: "#d0605a" };
const KIND_ICON = { infantry: "shield", ranged: "bow", cavalry: "horse", navy: "ship", garrison: "tower", firearms: "gun" };

/** 頭: 旗・国名・政体・為政者の顔・主要指標 */
export function nationHero(st, mine) {
  const c = civ(), L = st.leader, P = st.politics, mil = st.military, leg = P ? effective(c, st, "legitimacy") : 0, fat = P ? effective(c, st, "fatigue") : 0;
  const date = formatWorldDate(S.w, st.formedAt).split("月")[0] + "月";
  return h("div", { class: "hero" },
    h("div", { class: "hrow" }, flag(st.id, 78), h("div", { class: "hname" }, h("h3", {}, st.name), h("div", { class: "sub" }, `${regimeJa(st)}${st.alive ? "" : "・滅亡"}・成立 ${date}`),
      h("div", { class: "rowb" }, mine ? btn("担当を解除", () => { run({ type: "control.release" }); S.hooks.render(); }, "p", { id: "release" }) : btn("この国を担当する", () => { run({ type: "control.take", stateId: st.id }); S.hooks.render(); }, "p", { id: "take", disabled: !st.alive }), mine ? h("small", { style: "color:var(--purple)" }, "担当中") : null)),
      h("div", { class: "hface" }, face(L?.name ?? "—", st.id, L?.look ?? null), h("small", {}, L?.title ?? "為政者"), h("b", {}, L?.name ?? "—"))),
    h("div", { class: "metrics" },
      metric("pop", "人口", n0(st.pop)), metric("coin", "国庫", n0(st.treasury), { color: "#d8b45a" }), metric("gear", "産業力", n0(effective(c, st, "industry"))), metric("sword", "兵力", n0(st.army), { color: "#d0605a" }),
      metric("shield", "安定度", pct(st.stability), { bar: st.stability, color: st.stability < 0.35 ? "#d0605a" : "#9fbf8a" }), metric("crown", "正統性", pct(leg), { bar: leg, color: "#a58bd0" }), metric("hourglass", "疲労", pct(fat), { bar: fat, color: fat > 0.5 ? "#d0605a" : "#6a6f78" }),
      mil ? metric("flag", "軍事能力", (st.milBonus >= 0 ? "+" : "") + pct(st.milBonus)) : null));
}

/** 内政: 支持勢力（積み上げ帯＋議会）・財政・官制・思想。説明文は置かない */
export function tPoliticsV(st, mine) {
  const c = civ(), P = st.politics, out = h("div", {});
  if (P) {
    const rows = Object.entries(P.factions ?? {});
    out.append(lb("支持勢力", "FACTIONS"), stackbar(rows.map(([k, v]) => ({ label: FACTION_JA[k] ?? k, value: v.influence, color: FACTION_COL[k] ?? "#6fa8c9" })), { height: 14 }),
      h("div", { class: "facs" }, ...rows.map(([k, v]) => h("div", { class: "fac", title: `影響力 ${pct(v.influence)}` }, h("i", { style: `background:${FACTION_COL[k] ?? "#6fa8c9"}` }), h("span", {}, FACTION_JA[k] ?? k), h("span", { class: "barv" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })), h("small", {}, pct(v.support))))),
      P.assembly ? h("div", {}, hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : null);
  }
  // 財政: 円と税率
  const tax = st.pop * st.policy.tax * 0.0012 * taxMult(st), trade = effective(c, st, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"];
  out.append(lb("財政", "FINANCE"), h("div", { class: "row" }, donut([["税収", tax], ["交易", trade]], cols), h("span", { class: "g" }, h("div", {}, h("i", { class: "dotc", style: `background:${cols[0]}` }), `税収 ${n0(tax)}`), h("div", {}, h("i", { class: "dotc", style: `background:${cols[1]}` }), `交易 ${n0(trade)}`), h("div", { class: "n" }, `税率 ${pct(st.policy.tax)}`)),
    h("div", { class: "rowb" }, btn("増税", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "担当国のみ" }), btn("減税", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine }))));
  out.append(officesBox(st, mine)); if (st.alive && (mine || st.focus)) out.append(policyBox(st, mine)); // v6.12.0: 国策（担当国は枠に入れられる）
  const ideas = ideasOf(st).slice(0, 6); if (ideas.length) out.append(lb("思想", "IDEAS"), h("div", { class: "chips" }, ...ideas.map((x) => h("span", { class: "chip", title: pct(x.v) }, x.ja, h("i", { style: `width:${x.v * 100}%` })))));
  if (mine && st.alive) out.append(uprisingBox(st));
  out.append(h("details", { class: "dt cbox" }, h("summary", {}, "創造主の編集・介入"), creatorBox(st)));
  return out;
}

/** 軍事: 兵力・能力のリング、編成の帯と部隊カード、編成の編集（配分のスライダー）、宣戦 */
export function tMilitaryV(st, mine) {
  const c = civ(), M = st.military; if (!M) return h("p", { class: "n" }, "軍事のデータがありません。");
  const can = st.alive && (mine || !controlled()), units = M.units ?? [], tot = units.reduce((a, u) => a + u.size, 0) || 1, out = h("div", {});
  out.append(h("div", { class: "rings" }, ring(effective(c, st, "equipLevel"), "装備", "#d8b45a"), ring(effective(c, st, "readiness"), "練度", "#9fbf8a"), ring(Math.min(1, Math.max(0, 0.5 + st.milBonus)), "軍事能力", "#d0605a"), ring(Math.min(1, st.defense ?? 0), "要塞", "#8fb3b0")));
  out.append(lb("編成", "ORGANIZATION"), stackbar(units.map((u) => ({ label: u.name, value: u.size, color: KIND_COL[u.kind] })), { height: 16 }));
  out.append(h("div", { class: "forms" }, ...units.flatMap((u) => [h("div", { class: "uhead" }, h("span", { style: `color:${KIND_COL[u.kind]}` }, icon(KIND_ICON[u.kind] ?? "flag", 16)), h("b", {}, u.name), h("small", {}, `${n0(u.size)}（${pct(u.size / tot)}）`), h("span", { class: "barv", title: `装備 ${pct(u.equip)}` }, h("i", { style: `width:${u.equip * 100}%;background:#d8b45a` })), h("span", { class: "barv", title: `練度 ${pct(u.readiness)}` }, h("i", { style: `width:${u.readiness * 100}%;background:#9fbf8a` }))),
    h("div", { class: "fcards" }, ...formationsOf(st, u).map((f) => h("div", { class: "fcard", style: `border-color:${KIND_COL[u.kind]}` }, h("b", {}, f.name), h("small", {}, n0(f.size)))))])));
  if (can) { // 編成の編集: 配分のスライダー。合計は自動で 100% に揃える
    const avail = Object.entries(UNIT_KINDS).filter(([k, d]) => d.need(st, S.w.sim.ctx)), cur = Object.fromEntries(avail.map(([k]) => [k, Math.round(((units.find((u) => u.kind === k)?.size ?? 0) / tot) * 100)])), val = { ...cur }, sl = {};
    const sum = () => Object.values(val).reduce((a, b) => a + b, 0), info = h("small", {}), paint = () => { info.textContent = `合計 ${sum()}%`; info.style.color = sum() === 100 ? "var(--dim)" : "#d0605a"; for (const k in sl) { sl[k].lab.textContent = `${val[k]}%`; sl[k].inp.value = val[k]; } };
    const rows = avail.map(([k, d]) => { const inp = h("input", { type: "range", min: 0, max: 100, step: 5, value: val[k], "data-kind": k, oninput: (e) => { val[k] = Number(e.target.value); paint(); } }), lab = h("small", {}, `${val[k]}%`); sl[k] = { inp, lab }; return h("div", { class: "slrow" }, h("span", { style: `color:${KIND_COL[k]}` }, icon(KIND_ICON[k] ?? "flag", 15)), h("span", { class: "nm" }, d.ja), inp, lab); });
    out.append(h("details", { class: "dt", id: "reorg-box" }, h("summary", {}, "編成を編集する"), ...rows, h("div", { class: "rowb" }, info, btn("均す", () => { const n = avail.length; avail.forEach(([k], i) => (val[k] = Math.floor(100 / n) + (i < 100 % n ? 1 : 0))); paint(); }), btn("この編成にする", () => { const s = {}; for (const k in val) s[k] = val[k] / 100; (mine ? act : creator)({ type: "state.reorganize", stateId: st.id, shares: s }); }, "p", { id: "reorg" }))));
    setTimeout(paint, 0);
  }
  // 宣戦: 宣戦できる国をすべて（件数の上限なし）。名前で検索して絞り込める。交戦中・同盟国・不可侵条約のある国は出さない（外交ページと同じ条件）
  const c0 = S.w.civ, foes = aliveStates().filter((x) => x.id !== st.id && !atWarWith(c0, st, x) && !treatyBetween(c0, st, x, "alliance") && !treatyBetween(c0, st, x, "nonaggression")).sort((a, b) => b.pop - a.pop);
  const sel = h("select", { id: "wl-target", size: 7, class: "wlsel" }), cnt = h("small", { id: "wl-count" }), find = h("input", { id: "wl-search", type: "search", placeholder: "国名で検索", autocomplete: "off" });
  const fill = () => { const q = find.value.trim(), keep = sel.value, list = q ? foes.filter((x) => x.name.includes(q)) : foes; sel.replaceChildren(...list.map((x) => h("option", { value: x.id }, x.name))); if (list.some((x) => x.id === keep)) sel.value = keep; else if (list.length) sel.value = list[0].id; cnt.textContent = `宣戦できる国 ${foes.length} 国${q ? `（${list.length} 国に絞り込み）` : ""}`; goBtn.disabled = !mine || !list.length; };
  const goBtn = btn("宣戦する", () => { if (sel.value) confirmWar(st.id, sel.value, () => S.hooks.render()); }, "", { id: "declare", disabled: true, title: mine ? "" : "担当国のみ" });
  find.addEventListener("input", fill); fill();
  out.append(lb("宣戦", "WAR"), h("div", { class: "wlbox" }, find, sel, cnt, h("div", { class: "rowb" }, goBtn)));
  void r2; void colorOf; return out;
}

/** 外交（国家ページのタブ）: 同盟・交戦・関係の良い国と悪い国・条約。操作は外交ページで行う（ここは概観と破棄だけ） */
export function tDiplomacyV(st, mine) {
  const c = civ(), tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st.id || t.b === st.id), other = (t) => (t.a === st.id ? t.b : t.a), TJ = { alliance: "同盟", nonaggression: "不可侵", trade: "通商" };
  const wars = st.warIds.map((i) => c.wars[i]).filter(Boolean), rel = aliveStates().filter((x) => x.id !== st.id).map((x) => ({ x, v: Math.round(st.relations[x.id] ?? 0) })).sort((a, b) => b.v - a.v);
  const chip = (id, txt) => h("span", { class: "fchip", onclick: () => S.hooks.select(id), title: c.states[id]?.name }, flag(id, 28), h("small", {}, txt ?? c.states[id]?.name ?? id));
  const out = h("div", {}, lb("同盟", "ALLIES"), h("div", { class: "flagrow" }, ...(tr.filter((t) => t.type === "alliance").map((t) => chip(other(t))) || []), tr.some((t) => t.type === "alliance") ? null : h("small", { class: "n" }, "なし")),
    lb("交戦中", "AT WAR"), h("div", { class: "flagrow" }, ...wars.map((w) => h("span", { class: "fchip", onclick: () => { S.war = w.id; S.hub = "war"; S.hooks.render(); } }, flag(w.aggressor === st.id ? w.defender : w.aggressor, 28), h("small", {}, w.name ?? "戦争"))), wars.length ? null : h("small", { class: "n" }, "なし")),
    lb("関係の良い国", "FRIENDS"), ...rel.slice(0, 4).map(({ x, v }) => h("div", { class: "drow static" }, flag(x.id, 26), h("span", { class: "nm" }, x.name), h("span", { class: "relbar" }, h("i", { style: `left:${50 + v / 2}%;background:#6fa8c9` })))),
    lb("関係の悪い国", "RIVALS"), ...rel.slice(-3).reverse().map(({ x, v }) => h("div", { class: "drow static" }, flag(x.id, 26), h("span", { class: "nm" }, x.name), h("span", { class: "relbar" }, h("i", { style: `left:${50 + v / 2}%;background:#d0605a` })))),
    lb("条約", "TREATIES"), ...(tr.length ? tr.map((t) => h("div", { class: "drow static" }, flag(other(t), 26), h("span", { class: "nm" }, `${TJ[t.type] ?? t.type}・${c.states[other(t)]?.name}`), btn("破棄", () => act({ type: "state.act", stateId: st.id, action: "break_treaty", target: t.id }), "", { disabled: !mine, title: mine ? "破棄すると相手との関係が悪化する" : "担当国のみ" }))) : [h("small", { class: "n" }, "なし")]));
  const me = controlled(); if (me && me !== st.id) out.append(h("div", { class: "rowb" }, btn("この国との外交を行う", () => { S.hub = "diplo"; S.dtab = "rel"; S.dip = { a: me, b: st.id }; S.hooks.render(); }, "p", { id: "to-diplo" })));
  return out;
}
