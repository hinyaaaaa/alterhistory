// v6.16.0: 従属（宗主と従う国）。条約（封建契約・朝貢・保護条約・同君連合）で結ばれ、国家に st.dependency = { kind, overlord, since, treaty } が付く。
//   種類: vassal 封臣（軍役と貢納）／tributary 朝貢国（名目の服属）／protectorate 保護国（外交権を失い、宗主が守る）／union 同君連合（一体で動く）。
//   ・宗主の戦争: 封臣・同君連合は必ず従う。保護国は守りの戦争だけ。朝貢国は従わない。従う側が攻められると、宗主が助ける。
//   ・貢納は年 1 回、従う側の国庫から宗主へ。独立の動き（国力・安定度・宗主の弱体化）は年 1 回の判定で、戦争（独立戦争）か、穏やかな解消になる。
//   ・称号: 公国は封臣・独立した小君主国のときだけ（naming.js が st.dependency.kind を読む）。従属が変わると国号を組み直す。
import { TREATY, adjustRel, atWarWith, declareWar, signTreaty, endTreaty } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { byState, neighborGroups } from "../civ/spatial.js";
import { hashSeed } from "../civ/civ-state.js";
import { retitle } from "./domains/naming.js";
import { regimeOf, REGIMES } from "./regimes.js";

export const DEP_KINDS = Object.freeze({
  vassal: { ja: "封臣", tribute: 0.10, joinsOffense: true, joinsDefense: true },
  tributary: { ja: "朝貢国", tribute: 0.04, joinsOffense: false, joinsDefense: false },
  protectorate: { ja: "保護国", tribute: 0.06, joinsOffense: false, joinsDefense: true },
  union: { ja: "同君連合の一員", tribute: 0, joinsOffense: true, joinsDefense: true },
});
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const depOf = (civ, st) => (st?.dependency && civ.states[st.dependency.overlord]?.alive ? st.dependency : null);
export const dependentsOf = (civ, id) => Object.values(civ.states).filter((s) => s.alive && s.dependency?.overlord === id);
/** 従属の条約を持てる組み合わせか。理由があれば文字列 */
export function depFeasible(civ, over, sub) {
  if (over.dependency) return "宗主になる国がすでに従属している"; if (sub.dependency) return "すでに別の国に従属している"; if (dependentsOf(civ, sub.id).length) return "従う側の国が、すでに従属国を持っている";
  for (const t of civ.activeTreatyIds.map((i) => civ.treaties[i])) if (t.active && (t.a === over.id || t.b === over.id) && (t.a === sub.id || t.b === sub.id) && (TREATY[t.type].cat === "dep" || t.type === "alliance")) return "すでに結びつきがある";
  return null;
}
function retitleState(ctx, st) { const rt = retitle(st, st.polity, ctx.civ.date.year); if (rt && rt.name !== st.name) { st.name = rt.name; st.nameBase = rt.base; st.titleYear = rt.year; } st.interpDirty = true; }
/** 国境で接している、渡せる集団（首都は渡さない・小さいものから）。giver から receiver へ */
export function pickBorderGroup(ctx, giver, receiver) {
  const gs = byState(ctx).get(giver.id) ?? [], rs = new Set((byState(ctx).get(receiver.id) ?? []).map((g) => g.id)); if (gs.length < 2) return null;
  const c = gs.filter((g) => g.id !== giver.capitalGroupId && [...neighborGroups(ctx, g)].some((o) => rs.has(o))).sort((x, y) => x.pop - y.pop || (x.id < y.id ? -1 : 1)); return c[0] ?? null;
}
export function onTreatySigned(ctx, t, a, b) {
  const { civ } = ctx, T = TREATY[t.type], mi = civ.monthIndex;
  if (T.dep) { b.dependency = { kind: T.dep, overlord: a.id, since: mi, treaty: t.id }; retitleState(ctx, b); }
  const mv = (gid, to) => { const g = civ.groups[gid]; if (g) g.stateId = to.id; };
  if (t.type === "purchase" && t.terms) { mv(t.terms.groupId, a); const pay = Math.min(t.terms.price ?? 0, Math.max(0, a.treasury)); a.treasury -= pay; b.treasury += pay; }
  if (t.type === "cession" && t.terms) mv(t.terms.groupId, b);
  if (t.type === "exchange" && t.terms) { mv(t.terms.groupId, a); mv(t.terms.groupId2, b); }
  if (t.terms?.groupId) { a.interpDirty = b.interpDirty = true; if (t.type !== "exchange") b.stability = clamp(b.stability - (t.type === "cession" ? 0 : 0.02)); }
}
export function onTreatyEnded(ctx, t) {
  const b = ctx.civ.states[t.b]; if (b?.dependency?.treaty === t.id) { b.dependency = null; if (b.alive) retitleState(ctx, b); }
}
function join(ctx, w, side, d, host, foe, ev) {
  const { civ, ids } = ctx; w.sides[side].push(d.id); d.warIds.push(w.id); adjustRel(d, foe, -25);
  makeEvent(civ, ids, { kind: "ally_joined", title: `${d.name}が${host.name}側で参戦した（${d.dependency?.overlord === host.id ? DEP_KINDS[d.dependency.kind].ja : "宗主への助け"}）`, participants: [{ entityId: d.id, role: "ally" }, { entityId: w.id, role: "war" }], location: null, causes: ev ? [{ targetId: ev, relation: "reaction_to", basis: "strong" }] : [] });
}
/** 開戦時: 従属国の参戦と、宗主の助け */
export function callDependents(ctx, w, atk, def) {
  const { civ, rng } = ctx, inWar = (id) => w.sides.a.includes(id) || w.sides.d.includes(id);
  for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) {
    for (const d of dependentsOf(civ, host.id)) {
      const K = DEP_KINDS[d.dependency.kind]; if (inWar(d.id) || d.id === foe.id || !(side === "a" ? K.joinsOffense : K.joinsDefense)) continue;
      if (d.player && ctx.decisions?.allyCall(ctx, w, side, host, foe, d)) continue; join(ctx, w, side, d, host, foe, w.declaredEvent);
    }
    const dep = depOf(civ, host); if (dep && side === "d") { const o = civ.states[dep.overlord]; if (o && !inWar(o.id) && o.id !== foe.id && (dep.kind !== "tributary" || rng() < 0.5)) { if (o.player && ctx.decisions?.allyCall(ctx, w, side, host, foe, o)) continue; join(ctx, w, side, o, host, foe, w.declaredEvent); } }
  }
}
/** 終戦時: 攻撃側が勝ち、国力で大きく上回るとき、敗戦国が従属することがある（担当国は勝手に従属させない） */
export function submitAfterWar(ctx, w, outcome) {
  const { civ } = ctx; if (outcome !== "aggressor_victory") return; const atk = civ.states[w.aggressor], def = civ.states[w.defender];
  if (!atk?.alive || !def?.alive || atk.player || def.player || depFeasible(civ, atk, def) || atk.pop < def.pop * 1.5 || (hashSeed(w.id, civ.monthIndex, "submit") % 100) >= 30) return;
  const yr = civ.date.year, kind = regimeOf(atk) === "feudal" || REGIMES[regimeOf(atk)]?.core === "kingdom" && yr < 4000 ? "feudal" : yr < 4300 ? "tribute" : yr >= 4600 && atk.techAdopted?.railway != null ? "protectorate" : "feudal";
  if (TREATY[kind].needs?.some((k) => atk.techAdopted?.[k] == null)) return; signTreaty(ctx, kind, atk, def, { provenance: "simulation" });
}
/** 年 1 回（3 月）: 宗主の消滅・貢納・独立の動き */
export function stepDependencies(ctx) {
  const { civ } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 12 !== 3) return;
  for (const d of Object.values(civ.states)) {
    if (!d.alive || !d.dependency) continue; const o = civ.states[d.dependency.overlord];
    if (!o?.alive) { d.dependency = null; retitleState(ctx, d); continue; }
    const K = DEP_KINDS[d.dependency.kind], pay = Math.max(0, d.treasury) * K.tribute; if (pay > 0) { d.treasury -= pay; o.treasury += pay; }
    if (d.player || atWarWith(civ, d, o)) continue;
    const score = (1 - d.stability) * 0.5 + o.warIds.length * 0.1 + (o.stability < 0.4 ? 0.2 : 0) + clamp(Math.log((d.pop + 1) / (o.pop + 1)) * 0.15, -0.2, 0.3) + (d.dependency.kind === "vassal" ? 0.05 : 0) + (d.dependency.kind === "protectorate" ? -0.05 : 0), p = 0.01 + 0.15 * Math.max(0, score - 0.4);
    if ((hashSeed(d.id, mi, "indep") % 100000) / 100000 >= p) continue; const t = civ.treaties[d.dependency.treaty]; if (t?.active) endTreaty(ctx, t, score > 0.7 ? "従う側が破棄した" : "解消された", score > 0.7 ? d.id : null); else { d.dependency = null; retitleState(ctx, d); }
    if (score > 0.7 && !o.player) declareWar(ctx, d, o, { reason: "independence" }); else if (score > 0.7) declareWar(ctx, d, o, { reason: "independence" });
  }
}
