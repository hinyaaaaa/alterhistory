// v6.12.0: 決断ウィンドウ。担当国が決めるべき場面（条約の申し出・宣戦・参戦要請・継承・反乱・前兆・会戦）で、時間が止まり、急使の報せとして選択肢が出る。
//   決断に答えるまで時間は進まない。会戦は 3 手番で、戦場を地図に映したまま構えを選ぶ（残りの手番・敵の構えの見立て・これまでの流れを見せる）。
import { h, btn, pct, n0, bar, face, FACTION_JA, FACTION_COL } from "./common.js";
import { S, act } from "./store.js";
import { notify } from "./notify.js";
import { pendingOf } from "../../core/wcde/decision-state.js";
import { newsOf } from "../../core/wcde/clock.js";
import { DECISION_JA } from "../../core/wcde/decisions.js";
import { battleScreen, stopBattle } from "./battle.js";
import { TRAITS } from "../../core/wcde/corps.js";
const $ = (s) => document.querySelector(s);
const GLYPH = { assault: "突", hold: "守", flank: "回", withdraw: "退" };
const SEAL = { treaty_offer: "約", peace_offer: "和", war_incoming: "戦", ally_call: "盟", succession: "継", rebellion: "乱", omen: "兆", battle: "陣", commander_death: "将" };

function resolve(d, option) {
  const r = act({ type: "decision.resolve", decisionId: d.id, option }); if (!r.ok) return;
  const res = r.result ?? {}; S.decFocus = null;
}
const optBtn = (d, o, extra = "") => h("button", { class: "decopt" + extra, "data-opt": o.id, disabled: !!o.disabled, title: o.disabled ?? o.hint ?? "", onclick: () => resolve(d, o.id) }, h("b", {}, o.ja), o.hint ? h("small", {}, o.disabled ? o.disabled : o.hint) : null);

function successionCards(d) {
  const st = S.w.civ.states[d.stateId];
  return h("div", { class: "cands" }, ...d.options.map((o) => { const pl = d.payload[o.id], c = pl?.cand, rg = pl?.regent; if (!c) return optBtn(d, o); const col = FACTION_COL[c.backer] ?? "#6fa8c9";
    return h("button", { class: "cand", "data-opt": o.id, onclick: () => resolve(d, o.id) }, face(c.name, st?.id ?? "x"), h("div", { class: "ci" }, h("b", {}, c.name), h("small", {}, `${c.relation}・${c.ageYears}歳${c.kin ? "" : "・王朝が代わる"}`),
      h("div", { class: "cb" }, h("span", {}, "能力"), bar(c.skill, "#6fa8c9"), h("span", {}, "正統性"), bar(c.legit, "#d8b45a")), h("small", { style: `color:${col}` }, `${FACTION_JA[c.backer] ?? c.backer}が支持`), rg ? h("small", { class: "rg" }, `摂政：${rg.relation} ${rg.name}（能力${Math.round(rg.skill * 100)}・${FACTION_JA[rg.backer] ?? rg.backer}）`) : null)); }));
}
function commanderCards(d) {
  const p = d.payload, st = S.w.civ.states[d.stateId];
  return h("div", { class: "cands" }, ...d.options.map((o) => { const c = p.cands[o.id], q = c?.p; if (!q) return optBtn(d, o); const col = FACTION_COL[q.backer] ?? "#6fa8c9";
    return h("button", { class: "cand", "data-opt": o.id, onclick: () => resolve(d, o.id) }, face(q.name, st?.id ?? "x"), h("div", { class: "ci" }, h("b", {}, q.name), h("small", {}, `${c.from}`), h("div", { class: "cb" }, h("span", {}, "能力"), bar(q.skill, "#6fa8c9")), h("div", { class: "chips" }, ...(q.traits ?? []).map((t) => h("span", { class: "chip" }, TRAIT_JA[t] ?? t))), h("small", { style: `color:${col}` }, `${FACTION_JA[q.backer] ?? q.backer}が支持`))); }));
}
const TRAIT_JA = new Proxy({}, { get: (_, k) => TRAITS[k]?.ja ?? k });

/** 決断ウィンドウを描く（未決の先頭 1 件）。重大ニュースの確認が先にあるときは、そちらを先に出す */
export function renderDecision() {
  const m = $("#decmodal"); if (!m) return; const civ = S.w?.civ, cs = civ?.wcde.control.stateId, q = cs ? pendingOf(civ) : [];
  if (!q.length || newsOf(civ).queue.length) { stopBattle(); m.hidden = true; m.replaceChildren(); m.classList.remove("battle"); return; }
  const d = q[0], battle = d.kind === "battle"; m.hidden = false; m.classList.toggle("battle", battle); if (!battle) stopBattle();
  if (battle && S.decFocus !== d.id) { S.decFocus = d.id; const g = civ.groups[d.payload.siteId]; if (g) S.hooks.focusCell?.(g.cell); }
  if (battle) { m.replaceChildren(battleScreen(d)); return; }
  const body = d.kind === "succession" ? successionCards(d) : d.kind === "commander_death" ? commanderCards(d) : h("div", { class: "decopts" }, ...d.options.map((o) => optBtn(d, o)));
  m.replaceChildren(h("div", { class: "decbox k-" + d.kind }, h("div", { class: "decseal" }, SEAL[d.kind] ?? "決"), h("div", { class: "code" }, `${DECISION_JA[d.kind] ?? "決断"}（未決 ${q.length} 件）`), h("div", { class: "n" }, `${d.date.year}年${d.date.month}月`), h("h2", {}, d.title), h("p", { class: "decbody" }, d.body), body));
}
void pct;
