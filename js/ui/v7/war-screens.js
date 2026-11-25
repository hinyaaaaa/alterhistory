// v7 全面画面（戦争）: 宣戦（目的・見通し・出す部隊と指揮）／講和（白紙・要求の交渉）／講和会議（戦争スコアで要求を買う）。
//   世界を変えるのは war.declare / war.mobilize / peace.propose / conference.* だけ（docs/WAR_API.md）。開いている画面は S.screen が持つ。
import { H3, Btn, Card, Row, Mut, Chips, Tabs, Slider, h, n0, pct } from "./ui.js";
import { S, act, run, stateName } from "../v6/store.js";
import { colorOf } from "../v6/common.js";
import { stateFlagEl } from "../v6/flagview.js";
import { civ } from "./panels-common.js";
import { notify } from "../v6/notify.js";
import { GOAL_KINDS, DEMAND_KINDS } from "../../core/wcde/war-core.js";
import { ORDER_KINDS } from "../../core/wcde/corps.js";
import { lightOutlook } from "../v6/warconfirm.js";
import { dispatch, AUTHORITY as A } from "../../core/wcde/contract.js";

const D = () => (S.decl ??= { goals: [], corps: null, cmd: {}, pred: null, key: "" });
const SVC = { land: "陸軍", sea: "海軍", air: "空軍", space: "宇宙軍" };
const flagBox = (st) => h("div", { class: "v-flagbox", style: "width:52px;height:35px;border:1px solid var(--lh);overflow:hidden" }, stateFlagEl(st, 52));
const predict = (ctx) => {
  const d = D(), key = ctx.target + "|" + d.goals.join(",");
  if (d.key === key) return d.pred;
  d.key = key;
  const r = dispatch(S.w, { type: "war.predict", authority: A.ADMIN, stateId: ctx.id, target: ctx.target, goals: d.goals.map((kind) => ({ kind })) });
  return (d.pred = r.ok ? (r.result ?? r) : { error: r.error });
};
export function openDeclare(attackerId, targetId) {
  S.decl = { goals: [], corps: null, cmd: {}, pred: null, key: "" };
  S.screen = { key: "declare", id: attackerId, target: targetId };
  S.hooks.panel();
}
/** 宣戦の画面 */
export function declareSpec(sc) {
  const c = civ(), A_ = c.states[sc.id], B = c.states[sc.target];
  if (!A_?.alive || !B?.alive) return null;
  return { key: "declare", title: "宣戦", build: () => declareBody(sc, A_, B), footer: () => [Btn("やめる", () => { S.screen = null; S.decl = null; S.hooks.panel(); }, "g"), Btn("開戦する", () => doDeclare(sc), "d", { id: "declare-go" })], onClose: () => { S.screen = null; S.decl = null; } };
}
function declareBody(sc, A_, B) {
  const d = D(), c = civ(), corps = (A_.corps?.list ?? []).filter((x) => x.service !== "air" && x.size > 0.5);
  d.corps ??= new Set(corps.map((x) => x.id));
  const pr = predict(sc);
  const kinds = Object.entries(GOAL_KINDS);
  const root = h("div", { class: "v-two", style: "grid-template-columns:340px 1fr" });
  const left = h("div", {}, H3("戦争目的", "最大 4 つ。講和で取れる範囲を決める"), h("div", {}, ...kinds.map(([k, g]) => h("span", { class: "v-chip" + (d.goals.includes(k) ? " on" : ""), title: g.note, "data-goal": k, onclick: () => { d.goals = d.goals.includes(k) ? d.goals.filter((x) => x !== k) : d.goals.length < 4 ? [...d.goals, k] : d.goals; S.hooks.panel(); } }, g.ja))), Mut(d.goals.length ? d.goals.map((k) => GOAL_KINDS[k].note).join("。") : "目的を選ばない宣戦もできます（領土の征服として扱われます）。"));
  left.append(H3("見通し"), ...lightOutlook(A_.id, B.id).map(([k, v, tone]) => Row({ color: tone === "good" ? "var(--ok)" : tone === "bad" ? "var(--dn)" : "var(--ac)", title: v, sub: k })));
  left.append(H3("見立て"));
  if (pr?.error) left.append(Mut(pr.error));
  else if (pr) {
    left.append(h("div", { class: "v-g3" }, h("div", {}, h("b", {}, pr.favored === "a" ? "攻める側" : pr.favored === "d" ? "守る側" : "—"), h("span", {}, "有利な側")), h("div", {}, h("b", {}, pr.expectedMonths != null ? Math.round(pr.expectedMonths) + "か月" : "—"), h("span", {}, "想定の期間")), h("div", {}, h("b", {}, pr.supportChange != null ? (pr.supportChange > 0 ? "+" : "") + Math.round(pr.supportChange) : "—"), h("span", {}, "民意の変化"))));
    if (pr.power) left.append(Mut(`軍事力 ${n0(pr.power.a)} 対 ${n0(pr.power.d)}${pr.legitimacyChange != null ? `　正統性の変化 ${Math.round(pr.legitimacyChange * 100)}` : ""}`));
    if (pr.joins?.length) left.append(H3("参戦しそうな国"), ...pr.joins.slice(0, 6).map((j) => Row({ color: j.side === "a" ? "var(--bl)" : "var(--dn)", title: j.name ?? stateName(j.stateId), sub: j.why, small: Math.round(j.pct) + "%" })));
  }
  const right = h("div", {}, H3("出す部隊", "チェックした部隊が、この戦争の戦力になる"));
  if (!corps.length) right.append(Mut("出せる部隊がありません。軍と戦争の画面で軍団を編成してください。"));
  for (const cp of corps) {
    const on = d.corps.has(cp.id), cmd = d.cmd[cp.id] ?? "auto";
    right.append(h("div", { class: "v-card", style: "margin-bottom:6px;display:flex;gap:10px;align-items:center" }, h("input", { type: "checkbox", checked: on, "data-corps": cp.id, onchange: (e) => { e.target.checked ? d.corps.add(cp.id) : d.corps.delete(cp.id); S.hooks.panel(); } }), h("div", { style: "flex:1;min-width:0" }, h("b", {}, cp.name), h("div", { class: "v-mut" }, `${SVC[cp.service] ?? cp.service}・${n0(cp.size)}人${cp.commander ? "・" + cp.commander.name : ""}`)), on ? h("select", { class: "v-in", style: "width:170px", "data-cmd": cp.id, onchange: (e) => { d.cmd[cp.id] = e.target.value; } }, ...[["auto", "お任せ（AI が戦う）"], ["march", "自分で指揮: 首都へ進軍"], ["siege", "自分で指揮: 首都を包囲"], ["defend", "自分で指揮: 守備"], ["hold", "自分で指揮: 待機"]].filter(([k]) => cp.service === "land" || ["auto", "hold", "defend"].includes(k)).map(([k, ja]) => h("option", { value: k, selected: k === cmd }, ja))) : null));
  }
  right.append(Mut("「お任せ」の部隊は、目標・戦略・ドクトリン・補給を見て AI が自動で戦います。"));
  root.append(left, right);
  return h("div", {}, h("div", { style: "display:flex;align-items:center;gap:22px;margin-bottom:8px" }, h("div", { style: "display:flex;gap:12px;align-items:center" }, flagBox(A_), h("b", { style: "font:700 20px var(--mi)" }, A_.name)), h("span", { class: "v-mut" }, "→"), h("div", { style: "display:flex;gap:12px;align-items:center" }, flagBox(B), h("b", { style: "font:700 20px var(--mi)" }, B.name))), root);
}
function doDeclare(sc) {
  const d = D(), r = act({ type: "war.declare", stateId: sc.id, target: sc.target, goals: d.goals.map((kind) => ({ kind })) });
  if (!r.ok) return;
  const warId = (r.result ?? r).warId, ids = [...(d.corps ?? [])];
  if (warId && ids.length) {
    const orders = Object.entries(d.cmd).filter(([id, k]) => ids.includes(id) && k !== "auto").map(([corpsId, kind]) => ({ corpsId, kind, targetGroupId: ["march", "siege"].includes(kind) ? civ().states[sc.target].capitalGroupId : null }));
    act({ type: "war.mobilize", stateId: sc.id, warId, corpsIds: ids, orders });
  }
  S.screen = null; S.decl = null; S.war = warId ?? null; S.hub = "war";
  S.hooks.render();
}

/* ---------- 講和 ---------- */
export function openPeace(warId) {
  S.peace = { kind: "white", demands: [], withId: null };
  S.screen = { key: "peace", id: civ().wcde.control.stateId, warId };
  S.hooks.panel();
}
export function peaceSpec(sc) {
  const w = civ().wars[sc.warId], me = civ().states[sc.id];
  if (!w || !me) return null;
  return { key: "peace", title: w.phase === "conference" ? "講和会議" : "講和", build: () => (w.phase === "conference" ? conferenceBody(sc, w, me) : peaceBody(sc, w, me)), onClose: () => { S.screen = null; S.peace = null; } };
}
const foeOf = (w, me) => (w.sides.a.includes(me.id) ? w.sides.d : w.sides.a);
function peaceBody(sc, w, me) {
  const P = (S.peace ??= { kind: "white", demands: [], withId: null }), foes = foeOf(w, me), foeId = P.withId ?? foes[0];
  const terms = P.kind === "white" ? { kind: "white" } : { demands: P.demands };
  const pr = dispatch(S.w, { type: "peace.predict", authority: A.ADMIN, stateId: me.id, warId: w.id, withId: foeId, terms });
  const R = pr.ok ? (pr.result ?? pr) : null;
  const root = h("div", {}, Tabs([["white", "白紙講和"], ["demand", "要求つき"]], P.kind, (k) => { P.kind = k; S.hooks.panel(); }));
  if (foes.length > 1) root.append(h("div", { class: "v-fd" }, h("span", {}, "相手"), h("select", { onchange: (e) => { P.withId = e.target.value; S.hooks.panel(); } }, ...foes.map((id) => h("option", { value: id, selected: id === foeId }, stateName(id))))));
  if (P.kind === "demand") {
    const have = (w.goals ?? []).filter((g) => g.by === me.id).map((g) => g.kind);
    root.append(H3("要求", have.length ? "戦争目的の範囲" : "戦争目的がないため、小さな要求だけ"));
    const opts = Object.entries(DEMAND_KINDS).filter(([k]) => ["annex", "vassalize", "reparations", "regime", "dmz", "amnesty"].includes(k));
    root.append(h("div", {}, ...opts.map(([k, g]) => h("span", { class: "v-chip" + (P.demands.some((x) => x.kind === k) ? " on" : ""), onclick: () => { P.demands = P.demands.some((x) => x.kind === k) ? P.demands.filter((x) => x.kind !== k) : [...P.demands, { kind: k }]; S.hooks.panel(); } }, g.ja ?? k))));
  } else root.append(Mut("要求を付けない講和です。受け入れられれば、領土は動かずに戦争が終わります。"));
  root.append(H3("相手が受け入れる見込み"));
  if (!R) root.append(Mut(pr.error ?? "見込みを出せません"));
  else {
    root.append(h("div", { class: "v-g3" }, h("div", {}, h("b", {}, Math.round(R.acceptPct) + "%"), h("span", {}, "受諾の見込み")), h("div", {}, h("b", {}, R.accept ? "受け入れる" : "拒む"), h("span", {}, "今の見立て"))));
    if (R.invalid) root.append(Mut("この要求は出せません: " + R.invalid));
    for (const x of (R.reasons ?? []).slice(0, 4)) root.append(Row({ color: "var(--ac)", title: typeof x === "string" ? x : (x.text ?? x.ja ?? JSON.stringify(x)) }));
  }
  root.append(h("div", { style: "display:flex;justify-content:flex-end;gap:10px;margin-top:22px" }, Btn("やめる", () => { S.screen = null; S.peace = null; S.hooks.panel(); }, "g"), Btn("この条件で申し込む", () => { const r = act({ type: "peace.propose", stateId: me.id, warId: w.id, withId: foeId, terms }); if (r.ok) { S.screen = null; S.peace = null; S.hooks.render(); } }, "", { id: "peace-go" })));
  return root;
}
/** 講和会議: 戦争スコア（持ち点）で要求を買い、締結する */
function conferenceBody(sc, w, me) {
  const v = dispatch(S.w, { type: "war.view", authority: A.ADMIN, warId: w.id }), V = v.ok ? (v.result ?? v) : null, cf = V?.conference;
  const root = h("div", {});
  if (!cf) return Mut("会議の情報がありません。");
  const left = cf.scores?.[me.id] ?? 0, spent = cf.spent?.[me.id] ?? 0, win = cf.winnerSide;
  root.append(h("div", { class: "v-g3" }, h("div", {}, h("b", {}, Math.round(left)), h("span", {}, "持ち点")), h("div", {}, h("b", {}, Math.round(spent)), h("span", {}, "使用済み")), h("div", {}, h("b", {}, (w.sides[win] ?? []).includes(me.id) ? "勝者側" : "敗者側"), h("span", {}, "立場"))));
  root.append(H3("入札した要求"));
  const mine = (cf.bids ?? []).filter((b) => b.by === me.id);
  if (!mine.length) root.append(Mut("まだ要求がありません。"));
  for (const b of mine) root.append(Row({ color: "var(--br)", title: DEMAND_KINDS[b.kind]?.ja ?? b.kind, sub: b.target ? stateName(b.target) : "", small: `${Math.round(b.cost)}点`, onclick: () => { act({ type: "conference.retract", stateId: me.id, warId: w.id, seq: b.seq }); S.hooks.panel(); } }));
  if ((w.sides[win] ?? []).includes(me.id)) {
    root.append(H3("要求を足す", "押すと入札（持ち点を使う）"));
    const loserId = (w.sides[cf.loserSide] ?? [])[0];
    root.append(h("div", {}, ...["annex", "vassalize", "reparations", "regime", "dmz", "amnesty"].map((k) => h("span", { class: "v-chip", "data-bid": k, onclick: () => { act({ type: "conference.bid", stateId: me.id, warId: w.id, demand: { kind: k, target: loserId } }); S.hooks.panel(); } }, DEMAND_KINDS[k]?.ja ?? k))));
  }
  root.append(h("div", { style: "display:flex;justify-content:flex-end;gap:10px;margin-top:22px" }, Btn("締結する", () => { const r = act({ type: "conference.finish", stateId: me.id, warId: w.id }); if (r.ok) { S.screen = null; S.hooks.render(); } }, "", { id: "conf-finish" })));
  return root;
}

/* ---------- 動員と戦略（進行中の戦争で、出す部隊と指揮を決め直す） ---------- */
export function openMobilize(warId) {
  S.mob = null;
  S.screen = { key: "mobilize", id: civ().wcde.control.stateId, warId };
  S.hooks.panel();
}
export function mobilizeSpec(sc) {
  const w = civ().wars[sc.warId], me = civ().states[sc.id];
  if (!w || !me || w.status !== "active") return null;
  return { key: "mobilize", title: "動員と戦略", build: () => mobilizeBody(sc, w, me), footer: () => [Btn("閉じる", () => { S.screen = null; S.mob = null; S.hooks.panel(); }, "g"), Btn("この内容で決める", () => applyMobilize(sc, w, me), "", { id: "mob-go" })], onClose: () => { S.screen = null; S.mob = null; } };
}
function mobilizeBody(sc, w, me) {
  const corps = (me.corps?.list ?? []).filter((x) => x.service !== "air" && x.size > 0.5);
  const M = (S.mob ??= { on: new Set(corps.filter((x) => x.warId === w.id).map((x) => x.id)), cmd: Object.fromEntries(corps.filter((x) => x.warId === w.id && x.order?.kind && x.order.kind !== "auto").map((x) => [x.id, x.order.kind])), posture: w.posture?.[me.id]?.posture ?? "balanced" });
  const foe = (w.sides.a.includes(me.id) ? w.sides.d : w.sides.a)[0];
  const root = h("div", {}, H3("方針"), h("div", {}, ...[["offensive", "攻勢"], ["balanced", "均衡"], ["defensive", "守勢"]].map(([k, ja]) => h("span", { class: "v-chip" + (M.posture === k ? " on" : ""), "data-posture": k, onclick: () => { M.posture = k; S.hooks.panel(); } }, ja))), H3("出す部隊", "指揮する部隊を選ばなければ、すべて AI が自動で戦う"));
  for (const cp of corps) {
    const on = M.on.has(cp.id), cmd = M.cmd[cp.id] ?? "auto";
    root.append(h("div", { class: "v-card", style: "margin-bottom:6px;display:flex;gap:10px;align-items:center" }, h("input", { type: "checkbox", checked: on, onchange: (e) => { e.target.checked ? M.on.add(cp.id) : M.on.delete(cp.id); S.hooks.panel(); } }), h("div", { style: "flex:1;min-width:0" }, h("b", {}, cp.name), h("div", { class: "v-mut" }, `${SVC[cp.service] ?? cp.service}・${n0(cp.size)}人・現在 ${ORDER_KINDS[cp.order?.kind] ?? "—"}`)), on ? h("select", { class: "v-in", style: "width:190px", onchange: (e) => { M.cmd[cp.id] = e.target.value; } }, ...[["auto", "お任せ（AI が戦う）"], ["march", "自分で指揮: 敵の首都へ進軍"], ["siege", "自分で指揮: 敵の首都を包囲"], ["defend", "自分で指揮: 守備"], ["hold", "自分で指揮: 待機"]].filter(([k]) => cp.service === "land" || ["auto", "hold", "defend"].includes(k)).map(([k, ja]) => h("option", { value: k, selected: k === cmd }, ja))) : null));
  }
  void foe;
  return root;
}
function applyMobilize(sc, w, me) {
  const M = S.mob, ids = [...M.on], foe = (w.sides.a.includes(me.id) ? w.sides.d : w.sides.a)[0];
  const orders = Object.entries(M.cmd).filter(([id, k]) => ids.includes(id) && k !== "auto").map(([corpsId, kind]) => ({ corpsId, kind, targetGroupId: ["march", "siege"].includes(kind) ? civ().states[foe]?.capitalGroupId : null }));
  const r = act({ type: "war.mobilize", stateId: me.id, warId: w.id, corpsIds: ids, posture: M.posture, orders });
  if (r.ok) { notify("ok", "動員と戦略を決めました"); S.screen = null; S.mob = null; S.hooks.render(); }
}
