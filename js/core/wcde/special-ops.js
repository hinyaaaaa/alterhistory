// v6.18.0: 核作戦と隠密作戦。どちらも「戦争の一部」として扱い、戦争中なら戦いの記録（地図の印）に残る。使うかどうかはプレイヤーが決める（AI は使わない）。
//   核: 戦略ロケット軍と核の技術が要る。目標の集落の人口を失わせ、放射能（長期の人口減）・自国の安定度と信用の低下・各国の関係悪化が起きる。目標が戦略戦力を持てば報復がある（抑止）。
//   隠密: 暗殺・破壊工作・情報収集・救出。成功率は系統（特殊作戦）・技術・相手の警戒で決まる。発覚すれば外交の代償（関係の悪化、戦争の口実）。
import { makeEvent } from "../civ/events.js";
import { hashSeed } from "../civ/civ-state.js";
import { adjustRel, atWarWith, declareWar } from "../civ/diplomacy.js";
import { lifeScale } from "../civ/species.js";
import { byState } from "../civ/spatial.js";
import { addShock } from "./shocks.js";
import { deterrence } from "./power.js";
import { headsOf } from "./orbat.js";
import { placeName } from "./warfare.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), fail = (error) => ({ ok: false, error });
const U = (civ, ...p) => hashSeed(civ.historySeed, "sop", ...p) / 4294967296, has = (st, k) => st.techAdopted?.[k] != null;
export const COVERT = Object.freeze({
  assassinate: { ja: "暗殺", cost: 60, base: 0.2, hint: "指導者を狙う。成功すれば相手は大きく揺れるが、露見すれば戦争の口実になる" },
  sabotage: { ja: "破壊工作", cost: 40, base: 0.36, hint: "倉庫・橋・工房を壊す。相手の国庫と兵力を削る" },
  recon: { ja: "情報収集", cost: 20, base: 0.6, hint: "相手の軍の動きが 3 年間よく見える（会戦の偵察）" },
  rescue: { ja: "救出", cost: 50, base: 0.32, hint: "戦争中に、捕らわれた将や人質を取り戻す。自軍の士気が上がる" },
});
export const covertChance = (ctx, st, foe, kind) => { const fx = st.military?.fx ?? {}, K = COVERT[kind]; return clamp(K.base + 0.7 * (fx.covert ?? 0) + (has(st, "special_forces") ? 0.12 : 0) + (has(st, "cyber_warfare") ? 0.08 : 0) - 0.2 * (foe.stability ?? 0.5) - (has(foe, "cyber_warfare") ? 0.06 : 0), 0.05, 0.9); };
const warBetween = (civ, a, b) => a.warIds.map((i) => civ.wars[i]).find((w) => w?.status === "active" && w.ops && !w.ops.ended && (w.sides.a.includes(b.id) || w.sides.d.includes(b.id))) ?? null;
const logWar = (ctx, w, st, foe, kind, name, win, dead = 0, civDead = 0, cell = null) => {
  if (!w) return; const ops = w.ops, aSide = w.sides.a.includes(st.id) ? "a" : "d"; (ops.battles ??= []).push({ id: `b${++ops.seq}`, at: ctx.civ.monthIndex, kind, name, cell: cell ?? ctx.civ.groups[foe.capitalGroupId]?.cell ?? 0, a: st.id, d: foe.id, winner: win ? st.id : foe.id, deadA: 0, deadD: Math.round(dead), win: win ? "A" : "D", notable: true, domain: "special", civ: Math.round(civDead) }); if (ops.battles.length > 60) ops.battles.shift();
  ops.stats.dead[foe.id] = (ops.stats.dead[foe.id] ?? 0) + dead; w.casualties += dead; if (civDead) { const fs = w.sides.a.includes(foe.id) ? "a" : "d"; (ops.civ ??= { a: 0, d: 0 })[fs] += civDead; } void aSide;
};
export function covertOp(ctx, st, { kind, target }) {
  const { civ } = ctx, mi = civ.monthIndex, K = COVERT[kind], foe = civ.states[target]; if (!K) return fail("未知の作戦です"); if (!foe?.alive || foe.id === st.id) return fail("相手の国が見つかりません");
  const w = warBetween(civ, st, foe); if (kind === "rescue" && !w) return fail("救出は、戦争中の相手にだけ行えます"); if (st.treasury < K.cost) return fail(`費用 ${K.cost} が足りない`);
  const last = st.covertLast?.[foe.id]; if (last != null && mi - last < 6) return fail(`あと ${6 - (mi - last)} か月は、同じ相手に続けられません`); (st.covertLast ??= {})[foe.id] = mi; st.treasury -= K.cost;
  const p = covertChance(ctx, st, foe, kind), ok = U(civ, st.id, foe.id, kind, mi, "r") < p, fxc = st.military?.fx?.covert ?? 0, exposed = U(civ, st.id, foe.id, kind, mi, "x") < (ok ? 0.2 * (1 - fxc) : 0.65), cap = civ.groups[foe.capitalGroupId], where = cap ? placeName(ctx, cap) : foe.name; let text = "";
  if (ok) {
    if (kind === "assassinate") { const L = foe.leader; if (L) { const old = L.name; L.bornAt = mi - Math.round(95 * 12 * lifeScale(civ, foe)); foe.stability = clamp(foe.stability - 0.15); if (foe.politics) foe.politics.legitimacy = clamp((foe.politics.legitimacy ?? 0.5) - 0.1); addShock(foe, mi, "leader", 0.1, 8); text = `${old}を暗殺した`; makeEvent(civ, ctx.ids, { kind: "leader_assassinated", title: `${foe.name}の${old}が暗殺された`, participants: [{ entityId: foe.id, role: "state" }], location: { cell: cap?.cell }, facts: { stateId: foe.id, by: exposed ? st.id : null }, provenance: "player" }); } }
    else if (kind === "sabotage") { const t = Math.max(0, foe.treasury) * 0.08, a = foe.army * 0.02; foe.treasury -= t; foe.army = Math.max(0, foe.army - a); foe.stability = clamp(foe.stability - 0.03); text = `${where}の施設を破壊した`; logWar(ctx, w, st, foe, "covert", `${where}の破壊工作`, true, a); }
    else if (kind === "recon") { (st.intel ??= {})[foe.id] = mi + 36; text = `${foe.name}の動きが見えるようになった（3 年）`; }
    else { for (const f of Object.values(w.ops.forces)) if (f.stateId === st.id) f.morale = clamp(f.morale + 0.1); st.stability = clamp(st.stability + 0.02); text = "捕らわれた者を救い出した"; }
    if (kind === "assassinate") logWar(ctx, w, st, foe, "covert", `${where}の暗殺`, true, 1);
  } else { text = "作戦は失敗した"; if (kind !== "recon") logWar(ctx, w, st, foe, "covert", `${where}の${K.ja}（失敗）`, false, 0); }
  let cost = "";
  if (exposed) { adjustRel(st, foe, kind === "assassinate" ? -45 : -30); addShock(st, mi, "scandal", 0.04, 6); cost = "発覚した。関係が悪化した"; if (!w && foe.army >= st.army * 0.8 && U(civ, st.id, foe.id, mi, "war") < (kind === "assassinate" ? 0.35 : 0.12)) { const r = declareWar(ctx, foe, st, { reason: "revenge", provenance: "simulation" }); if (r?.ok !== false) cost += "。相手が宣戦した"; } }
  return { ok: true, success: ok, exposed, text, cost: K.cost, chance: p, note: cost };
}

export const NUKE = Object.freeze({ tactical: { ja: "戦術核", pop: 0.35, groups: 1, cost: 150 }, strategic: { ja: "戦略核", pop: 0.55, groups: 4, cost: 400 } });
export const canNuke = (st) => has(st, "nuclear_arsenal") && headsOf(st, "air") > 0 && (st.military?.units ?? []).some((u) => u.kind === "strategic" && u.size > 0);
/** 目標の候補（戦争中の相手の、人口の大きい集落）。プレビュー: 失われる人口の見積もり */
export function nukeTargets(ctx, st, foeId, scale = "tactical") { const foe = ctx.civ.states[foeId], N = NUKE[scale]; if (!foe?.alive) return []; return (byState(ctx).get(foe.id) ?? []).slice().sort((a, b) => b.pop - a.pop).slice(0, 12).map((g) => ({ id: g.id, name: placeName(ctx, g), pop: Math.round(g.pop), loss: Math.round(g.pop * N.pop), capital: foe.capitalGroupId === g.id })); }
export function nuclearStrike(ctx, st, { target, group = null, scale = "tactical" }) {
  const { civ } = ctx, mi = civ.monthIndex, N = NUKE[scale], foe = civ.states[target]; if (!N) return fail("核の規模が不正です"); if (!foe?.alive || foe.id === st.id) return fail("相手の国が見つかりません"); if (!canNuke(st)) return fail("核戦力がありません（核兵器の技術と戦略ロケット軍が要ります）");
  const w = warBetween(civ, st, foe); if (!w) return fail("核は、戦争中の相手にだけ使えます"); if (st.treasury < N.cost) return fail(`費用 ${N.cost} が足りない`); if (st.nukeAt != null && mi - st.nukeAt < 12) return fail("続けては使えません（1 年あける）");
  const gs = (byState(ctx).get(foe.id) ?? []).slice().sort((a, b) => b.pop - a.pop), first = group ? gs.find((g) => g.id === group) : gs[0]; if (!first) return fail("目標がありません"); const hit = [first, ...gs.filter((g) => g !== first)].slice(0, N.groups);
  st.treasury -= N.cost; st.nukeAt = mi; let dead = 0; for (const g of hit) { const d = g.pop * N.pop; g.pop = Math.max(1, g.pop - d); g.fallout = mi + 240; dead += d; }
  foe.stability = clamp(foe.stability - 0.25); foe.army = Math.max(0, foe.army * 0.9); const where = placeName(ctx, first); logWar(ctx, w, st, foe, "nuclear", `${where}への${N.ja}攻撃`, true, dead * 0.15, dead * 0.85, first.cell);
  st.stability = clamp(st.stability - 0.12); addShock(st, mi, "nuclear", 0.15, 30); for (const o of Object.values(civ.states)) if (o.alive && o.id !== st.id) adjustRel(st, o, -25);
  makeEvent(civ, ctx.ids, { kind: "nuclear_strike", title: `${st.name}が${where}に${N.ja}を使用した（${Math.round(dead)} 人が失われた）`, participants: [{ entityId: st.id, role: "state" }, { entityId: foe.id, role: "target" }, { entityId: w.id, role: "war" }], location: { cell: first.cell }, facts: { stateId: st.id, targetId: foe.id, dead: Math.round(dead), scale }, provenance: "player" });
  let retaliation = null; const ret = clamp(deterrence(foe) * 4.5, 0, 0.9); if (ret > 0 && U(civ, st.id, foe.id, mi, "ret") < ret) { const cg = civ.groups[st.capitalGroupId]; if (cg) { const d = cg.pop * 0.45; cg.pop = Math.max(1, cg.pop - d); cg.fallout = mi + 240; st.stability = clamp(st.stability - 0.2); retaliation = { where: placeName(ctx, cg), dead: Math.round(d) }; logWar(ctx, w, foe, st, "nuclear", `${retaliation.where}への報復核`, true, d * 0.15, d * 0.85, cg.cell); makeEvent(civ, ctx.ids, { kind: "nuclear_retaliation", title: `${foe.name}が報復し、${retaliation.where}が核攻撃を受けた`, participants: [{ entityId: foe.id, role: "state" }, { entityId: st.id, role: "target" }], location: { cell: cg.cell }, facts: { dead: retaliation.dead }, provenance: "simulation" }); } }
  return { ok: true, dead: Math.round(dead), where, retaliation };
}
/** 放射能（月次）: 被曝した集落の人口が、20 年かけて少しずつ減る */
export function stepFallout(ctx) { const { civ } = ctx, mi = civ.monthIndex; if (mi % 12 !== 0) return; for (const g of Object.values(civ.groups)) if (g.fallout != null) { if (g.fallout <= mi) delete g.fallout; else g.pop = Math.max(1, g.pop * 0.985); } }
