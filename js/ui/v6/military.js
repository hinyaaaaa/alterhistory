// v6.12.0: 軍。担当国の軍団（名前のある部隊）を一覧し、指揮官・副官の人事、部隊の編成（改名・分割・統合・兵の移動・再訓練）、作戦の命令（進軍・包囲・守備・撤退・待機）を出す。
//   軍団の位置と行軍ルートは地図に出る。命令は担当国だけ。実際の移動と戦闘は戦争エンジンが毎月進める。
import { h, btn, pct, n0, lb, bar, face, FACTION_JA } from "./common.js";
import { S, act, controlled } from "./store.js";
import { colorOf } from "./common.js";
import { corpsView, ORDER_KINDS, OFFICER_SLOTS, TRAITS, marchSteps } from "../../core/wcde/corps.js";
import { UNIT_KINDS } from "../../core/wcde/domains/military.js";
import { landShare } from "../../core/wcde/power.js";
import { distKm } from "../../core/civ/states.js";

const civ = () => S.w.civ, ctx = () => S.w.sim.ctx, n = (t) => h("p", { class: "n" }, t);
const sgn = (x) => (x >= 0 ? "+" : "") + Math.round(x * 100) + "%";
const placeOf = (gid) => { const g = civ().groups[gid]; if (!g) return "—"; const s = civ().settlements[g.settlementId]; return s?.name ?? `${civ().states[g.stateId]?.name ?? "無主"}の地`; };
const traitChips = (p) => (p.traits ?? []).map((t) => { const T = TRAITS[t]; if (!T) return null; const fx = ["off", "def", "siege", "logi", "coh"].map((k) => (T[k] ? `${{ off: "攻", def: "守", siege: "包囲", logi: "補給", coh: "士気" }[k]}${sgn(T[k])}` : "")).filter(Boolean).join(" "); const bad = Object.values(T).some((v) => typeof v === "number" && v < 0); return h("span", { class: "chip trait" + (bad ? " bad" : ""), title: fx }, T.ja); });
const personLine = (p) => `${p.name}（能力 ${Math.round(p.skill * 100)}・${(p.traits ?? []).map((t) => TRAITS[t]?.ja ?? t).join("・") || "特性なし"}・${FACTION_JA[p.backer] ?? p.backer}）`;
const orderText = (cp) => { const o = cp.order, k = ORDER_KINDS[o.kind] ?? o.kind; if (!o.targetGroupId) return k; const left = o.route?.length ?? 0; return `${k}：${placeOf(o.targetGroupId)}${left ? `（あと ${left} 区画・約 ${Math.max(1, Math.ceil(left / marchSteps(ctx(), civ().states[S.w.civ.wcde.control.stateId])))} か月）` : "（到着）"}`; };
const myWars = (st) => st.warIds.map((i) => civ().wars[i]).filter((w) => w?.status === "active");
const sideOf = (w, id) => (w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null);

/** 命令の目標の候補: 進軍・包囲は敵の土地、守備・撤退は味方の土地（今いる場所に近い順に 40） */
function targets(st, cp, kind, war) {
  const c = civ(), here = c.groups[cp.at], out = [], foe = war ? new Set(war.sides[sideOf(war, st.id) === "a" ? "d" : "a"]) : new Set(), mine = new Set(war ? war.sides[sideOf(war, st.id)] : [st.id]);
  for (const g of Object.values(c.groups)) { if (!g.stateId) continue; const ok = kind === "march" || kind === "siege" ? foe.has(g.stateId) : mine.has(g.stateId); if (ok) out.push({ id: g.id, d: here ? distKm(S.w.world, here.cell, g.cell) : 0, label: `${placeOf(g.id)}（${c.states[g.stateId]?.name ?? ""}）` }); }
  return out.sort((a, b) => a.d - b.d).slice(0, 40);
}

function personBox(cp, slot, st, pool) {
  const p = slot === "commander" ? cp.commander : cp.officers[slot], title = slot === "commander" ? "最高指揮官" : OFFICER_SLOTS[slot];
  const sel = h("select", { "data-slot": slot }, h("option", { value: "" }, pool.length ? "候補から任命…" : "候補はいません"), ...pool.map((q) => h("option", { value: q.id }, personLine(q))));
  return h("div", { class: "pbox" }, h("small", {}, title), p ? h("div", { class: "prow" }, face(p.name, st.id), h("div", {}, h("b", {}, p.name), h("div", { class: "bar2" }, "能力", bar(p.skill, "#6fa8c9"), h("small", {}, `経験 ${p.xp ?? 0}`)), h("div", { class: "chips" }, ...traitChips(p), h("span", { class: "chip" }, `${FACTION_JA[p.backer] ?? p.backer}が支持`)))) : n("（空き）"),
    h("div", { class: "rowb" }, sel, btn("任命", () => { if (sel.value) act({ type: "corps.appoint", stateId: st.id, corpsId: cp.id, slot, personId: sel.value }); }, "", { "data-appoint": slot }), slot !== "commander" && p ? btn("解任", () => act({ type: "corps.dismiss", stateId: st.id, corpsId: cp.id, slot }), "") : null));
}

/** 軍団の詳細（全面タブ） */
function corpsDetail(cp, view, st) {
  const c = civ(), wars = myWars(st), war = c.wars[cp.warId] ?? wars[0] ?? null, out = h("div", { class: "corpsdetail" });
  const nm = h("input", { id: "cp-name", value: cp.name, maxlength: 20 });
  out.append(h("div", { class: "whead" }, h("h2", {}, cp.name), h("div", { class: "sub" }, `兵力 ${n0(cp.size)}・現在地 ${placeOf(cp.at)}・${orderText(cp)}`)), h("div", { class: "rowb" }, nm, btn("改名", () => act({ type: "corps.rename", stateId: st.id, corpsId: cp.id, name: nm.value }), "", { id: "cp-rename" })));
  const fx = cp.fx; out.append(h("div", { class: "chips fxs" }, ...[["攻め", fx.off + fx.skill], ["守り", fx.def + fx.skill], ["包囲", fx.siege], ["補給", fx.logi], ["士気", fx.coh]].map(([k, v]) => h("span", { class: "chip" + (v < 0 ? " bad" : v > 0 ? " good" : "") }, `${k} ${sgn(v)}`))));
  out.append(lb("指揮官と副官", "COMMAND"), personBox(cp, "commander", st, view.pool), ...Object.keys(OFFICER_SLOTS).map((s) => personBox(cp, s, st, view.pool)));
  // 作戦の命令
  const kind = h("select", { id: "cp-kind" }, ...Object.entries(ORDER_KINDS).map(([k, ja]) => h("option", { value: k, selected: cp.order.kind === k }, ja))), tgt = h("select", { id: "cp-target" }), wsel = h("select", { id: "cp-war" }, ...wars.map((x) => h("option", { value: x.id, selected: x.id === war?.id }, x.name ?? x.id)));
  const fill = () => { const k = kind.value; tgt.replaceChildren(); tgt.disabled = !["march", "siege", "defend", "retreat"].includes(k); if (tgt.disabled) return; const w2 = c.wars[wsel.value] ?? war; const list = targets(st, cp, k, w2); tgt.append(h("option", { value: "" }, list.length ? "目標を選ぶ…" : "目標にできる土地がありません"), ...list.map((t) => h("option", { value: t.id, selected: cp.order.targetGroupId === t.id }, `${t.label}・約 ${n0(t.d)} km`))); };
  kind.addEventListener("change", fill); wsel.addEventListener("change", fill); fill();
  out.append(lb("作戦の命令", "ORDERS"), n("進軍は敵の土地へ。着くと作戦が始まる。包囲は城や都市を攻め、複数の軍団で同じ目標を包囲すると速く落とせる。守備は味方の土地で迎え撃つ。撤退は戦わず退く。お任せは従来どおり自動で動く。"),
    h("div", { class: "rowb" }, kind, tgt, wars.length ? wsel : null, btn("命令する", () => act({ type: "corps.order", stateId: st.id, corpsId: cp.id, kind: kind.value, targetGroupId: tgt.disabled ? null : tgt.value || null, warId: wars.length ? wsel.value : null }), "p", { id: "cp-order" })));
  // 部隊
  const others = view.list.filter((x) => x.id !== cp.id && x.at === cp.at);
  out.append(lb("部隊", "UNITS"), ...cp.units.map((u) => { const inp = h("input", { value: u.name, maxlength: 20, "data-unit": u.id }), kinds = Object.entries(UNIT_KINDS).filter(([k, K]) => k !== "navy" && K.need(st, ctx())), ks = h("select", {}, h("option", { value: "" }, "兵種を変える…"), ...kinds.map(([k, K]) => h("option", { value: k }, K.ja))), to = h("select", {}, h("option", { value: "" }, others.length ? "移す先の軍団…" : "同じ場所に他の軍団がない"), ...others.map((x) => h("option", { value: x.id }, x.name))), sz = h("input", { type: "number", min: 1, max: Math.floor(u.size), value: Math.max(1, Math.floor(u.size / 2)), style: "width:80px" });
    return h("div", { class: "unit" }, h("div", { class: "rowb" }, inp, h("b", {}, `${UNIT_KINDS[u.kind]?.ja ?? u.kind} ${n0(u.size)}`), btn("改名", () => act({ type: "corps.renameUnit", stateId: st.id, corpsId: cp.id, unitId: u.id, name: inp.value }))), h("div", { class: "rowb" }, ks, btn("再訓練", () => { if (ks.value) act({ type: "corps.convert", stateId: st.id, corpsId: cp.id, unitId: u.id, toKind: ks.value }); }), to, sz, btn("兵を移す", () => { if (to.value) act({ type: "corps.transfer", stateId: st.id, from: cp.id, to: to.value, unitId: u.id, size: Number(sz.value) }); }))); }));
  // 分割・統合
  const sname = h("input", { id: "cp-split-name", placeholder: "新しい軍団の名前", maxlength: 20 }), frac = h("input", { id: "cp-split-frac", type: "range", min: 0.1, max: 0.9, step: 0.05, value: 0.4 }), pc = h("select", { id: "cp-split-cmd" }, h("option", { value: "" }, "指揮官の候補…"), ...view.pool.map((q) => h("option", { value: q.id }, personLine(q)))), into = h("select", { id: "cp-merge-into" }, h("option", { value: "" }, others.length ? "統合先の軍団…" : "同じ場所に他の軍団がない"), ...others.map((x) => h("option", { value: x.id }, x.name)));
  out.append(lb("編成", "ORGANIZE"), n(`軍団は ${view.max} まで。分けるときは、新しい軍団の指揮官を候補から選ぶ（費用：兵力の 0.1% × 割合）。`), h("div", { class: "rowb" }, sname, h("small", {}, "割合"), frac, pc, btn("軍団を分ける", () => act({ type: "corps.split", stateId: st.id, corpsId: cp.id, name: sname.value, fraction: Number(frac.value), commanderId: pc.value }), "", { id: "cp-split" })),
    h("div", { class: "rowb" }, into, btn("この軍団を統合する", () => { if (into.value) { S.corpsSel = into.value; act({ type: "corps.merge", stateId: st.id, from: cp.id, into: into.value }); } }, "", { id: "cp-merge" })));
  return out;
}

/** 左のパネル: 軍の概要と軍団の一覧。行を押すと全面タブで詳細 */
export function pMilitary() {
  const c = civ(), cs = controlled(), box = h("div", {}, h("div", { class: "code" }, "MILITARY"), h("h2", {}, "軍")); if (!cs) { box.append(n("担当国家がありません。国家を担当すると、軍団を率いて戦えます。")); return box; }
  const st = c.states[cs]; const view = corpsView(ctx(), st); if (!view) { box.append(n("軍団を編成しています…")); setTimeout(() => { if (controlled() === cs && !c.states[cs].corps) act({ type: "corps.refresh", stateId: cs }); }, 0); return box; }
  const sel = view.list.find((x) => x.id === S.corpsSel); if (sel) S.full = { key: "corps", title: sel.name, build: () => corpsDetail(sel, corpsView(ctx(), c.states[cs]), c.states[cs]), onClose: () => { S.corpsSel = null; S.map?.draw(); } };
  const land = st.army * landShare(st), wars = myWars(st);
  box.append(n(`陸軍 ${n0(land)} 人・軍団 ${view.list.length} / ${view.max}・戦争中 ${wars.length} 件`), n("軍団を選ぶと、指揮官の人事・部隊の編成・作戦の命令ができます。命令がなければ、軍団は従来どおり自動で動きます。"));
  box.append(h("div", { class: "corpslist" }, ...view.list.map((cp) => h("button", { class: "corpsrow" + (S.corpsSel === cp.id ? " on" : ""), "data-corps": cp.id, onclick: () => { S.corpsSel = cp.id; S.hooks.panel(); S.hooks.mapOnly?.(); const g = c.groups[cp.at]; if (g) S.hooks.focusCell?.(g.cell); } },
    h("div", { class: "cr1" }, h("b", {}, cp.name), h("span", {}, `${n0(cp.size)} 人`)), h("div", { class: "cr2" }, `${cp.commander.name}（能力${Math.round(cp.commander.skill * 100)}）・${placeOf(cp.at)}`), h("div", { class: "cr3" }, orderText(cp)), h("div", { class: "chips" }, ...traitChips(cp.commander))))));
  void pct; return box;
}

/** 地図の軍団の印（担当国の軍団。選んだ軍団は行軍ルートつき） */
export function corpsMarkers() {
  const cs = controlled(); if (!cs) return []; const st = civ().states[cs], view = st ? corpsView(ctx(), st) : null; if (!view) return []; const col = colorOf(cs, 60);
  return view.list.map((cp, i) => { const g = civ().groups[cp.at]; if (!g) return null; const sel = S.corpsSel === cp.id; return { cell: g.cell, label: String(i + 1), color: col, sel, route: sel ? (cp.order.route ?? []).map((id) => civ().groups[id]?.cell).filter((x) => x != null) : [], target: sel && cp.order.targetGroupId ? civ().groups[cp.order.targetGroupId]?.cell : null }; }).filter(Boolean);
}
