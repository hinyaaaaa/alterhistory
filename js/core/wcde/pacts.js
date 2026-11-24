// v6.16.0: 盟約（3 か国以上の同盟・連合）。二国間の条約を束ねたもの（デロス同盟・ハンザ同盟・神聖ローマ帝国型）。civ.wcde.pacts に持つ。
//   目的ごとに、利点と欠点が違う。
//     defense 防衛同盟: 加盟国が攻められると、ほかの加盟国が助ける（利点）。加盟国どうしの戦争は禁じられ、破ると脱退と正統性の低下（欠点）。
//     trade 通商連合: 加盟国の国庫に交易の配当が入る（利点）。加盟国どうしの戦争は禁じられる。参戦の義務はない。
//     religion 宗教連盟: 同じ宗教の国の安定度が上がる（利点）。宗教の戦争に加盟国が呼ばれる（欠点）。
//     counter 対抗連合: 特定の国に対して、加盟国が共同で当たる（利点）。対象との関係が悪化し、戦時体制で安定度が少し下がる（欠点）。
//   ・長く続き、文化や宗教が近く、共通の敵や目的があれば、一つの国にまとまる提案が出る（盟主・国名・首都は盟約の側が決める）。担当国は断れる。
import { adjustRel, atWarWith, neighborStates, strength } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { dominant } from "../civ/cohorts.js";
import { hashSeed } from "../civ/civ-state.js";
import { raise, registerDecision } from "./decisions.js";
import { regimeOf } from "./regimes.js";
import { registerWarDecisions } from "./war-decisions.js";

export const PACT_PURPOSES = Object.freeze({
  defense: { ja: "防衛同盟", suffix: "同盟", merit: "攻められたとき助けが来る", cost: "加盟国どうしで戦えない" },
  trade: { ja: "通商連合", suffix: "連合", merit: "交易の配当が入る", cost: "加盟国どうしで戦えない" },
  religion: { ja: "宗教連盟", suffix: "連盟", merit: "同じ信仰の国が安定する", cost: "宗教の戦争に呼ばれる" },
  counter: { ja: "対抗連合", suffix: "連合", merit: "強国に共同で当たれる", cost: "対象との関係が悪化する" },
});
const MAX_MEMBERS = 8, clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const pactsOf = (civ) => ((civ.wcde ??= {}).pacts ??= { items: {}, seq: 0 });
export const listPacts = (civ, all = false) => Object.values(pactsOf(civ).items).filter((p) => all || p.active);
export const pactsOfState = (civ, id) => listPacts(civ).filter((p) => p.members.includes(id));
const alive = (civ, id) => !!civ.states[id]?.alive;
const baseName = (st) => st.nameBase ?? st.name;

export function createPact(ctx, { purpose, leaderId, memberIds, target = null, name = null }) {
  const { civ, ids } = ctx, P = PACT_PURPOSES[purpose], L = civ.states[leaderId]; if (!P || !L?.alive) return null; const members = [...new Set([leaderId, ...memberIds])].filter((i) => alive(civ, i)); if (members.length < 3) return null;
  const S = pactsOf(civ), id = `pact_${++S.seq}`, nm = name ?? `${baseName(L)}${P.suffix}`; const pact = { id, name: nm, purpose, leaderId, members, target, formedAt: civ.monthIndex, active: true, joined: Object.fromEntries(members.map((m) => [m, civ.monthIndex])) }; S.items[id] = pact;
  for (const a of members) for (const b of members) if (a < b) adjustRel(civ.states[a], civ.states[b], 8);
  makeEvent(civ, ids, { kind: "pact_formed", title: `${members.map((m) => civ.states[m].name).slice(0, 4).join("・")}${members.length > 4 ? "ほか" : ""}が${nm}（${P.ja}）を結んだ`, participants: members.map((m) => ({ entityId: m, role: m === leaderId ? "leader" : "member" })), location: null, facts: { pactId: id, purpose, members: members.length }, provenance: "simulation" }); return pact;
}
export function leavePact(ctx, pact, st, why = "脱退した", penalty = true) {
  const { civ, ids } = ctx; if (!pact.active || !pact.members.includes(st.id)) return; pact.members = pact.members.filter((m) => m !== st.id);
  if (penalty) { st.stability = clamp(st.stability - 0.02); for (const m of pact.members) if (alive(civ, m)) adjustRel(st, civ.states[m], -6); }
  makeEvent(civ, ids, { kind: "pact_left", title: `${st.name}が${pact.name}を${why}`, participants: [{ entityId: st.id, role: "state" }], location: null, facts: { pactId: pact.id }, provenance: "simulation" });
  if (pact.members.length < 2) dissolvePact(ctx, pact, "加盟国が足りなくなり解散した"); else if (pact.leaderId === st.id) pact.leaderId = [...pact.members].sort((a, b) => civ.states[b].pop - civ.states[a].pop)[0];
}
export function joinPact(ctx, pact, st) { if (!pact.active || pact.members.includes(st.id) || pact.members.length >= MAX_MEMBERS) return false; pact.members.push(st.id); pact.joined[st.id] = ctx.civ.monthIndex; for (const m of pact.members) if (m !== st.id && alive(ctx.civ, m)) adjustRel(st, ctx.civ.states[m], 6); makeEvent(ctx.civ, ctx.ids, { kind: "pact_joined", title: `${st.name}が${pact.name}に加わった`, participants: [{ entityId: st.id, role: "state" }], location: null, facts: { pactId: pact.id }, provenance: "simulation" }); return true; }
function dissolvePact(ctx, pact, why) { pact.active = false; pact.endedAt = ctx.civ.monthIndex; makeEvent(ctx.civ, ctx.ids, { kind: "pact_ended", title: `${pact.name}が${why}`, participants: pact.members.filter((m) => alive(ctx.civ, m)).map((m) => ({ entityId: m, role: "member" })), location: null, facts: { pactId: pact.id }, provenance: "simulation" }); }
/** 盟約に加わるかを相手（アルゴリズム国家）が評価する。{ ok, why } */
export function pactAccepts(ctx, st, leader, purpose, target = null) {
  const civ = ctx.civ, rel = st.relations[leader.id] ?? 0; if (st.dependency || leader.dependency) return { ok: false, why: "従属している" }; if (atWarWith(civ, st, leader)) return { ok: false, why: "交戦中" };
  if (purpose === "counter") { if (!target || st.id === target || (st.relations[target] ?? 0) > 20) return { ok: false, why: "対象と親しい" }; return { ok: rel >= 0 && (st.relations[target] ?? 0) <= 10, why: rel >= 0 ? "対象への備えが要らない" : "盟主を信用していない" }; }
  if (purpose === "religion") { const a = civ.groups[st.capitalGroupId], b = civ.groups[leader.capitalGroupId]; if (!a || !b || dominant(a).religionId !== dominant(b).religionId) return { ok: false, why: "信仰が違う" }; }
  return { ok: rel >= (purpose === "defense" ? 10 : 0), why: "関係が足りない" };
}
/** 開戦時: 盟約の参戦（防衛同盟・対抗連合・宗教連盟） */
export function callPacts(ctx, w, atk, def) {
  const { civ, ids, rng } = ctx, inWar = (id) => w.sides.a.includes(id) || w.sides.d.includes(id);
  for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) for (const p of pactsOfState(civ, host.id)) {
    if (p.members.includes(foe.id)) continue; const chance = p.purpose === "defense" ? (side === "d" ? 0.85 : 0) : p.purpose === "counter" ? (foe.id === p.target ? 0.8 : 0) : p.purpose === "religion" ? (w.reason === "religion" ? 0.5 : 0) : 0; if (!chance) continue;
    for (const m of p.members) { const s = civ.states[m]; if (m === host.id || !s?.alive || inWar(m) || s.dependency?.overlord === foe.id) continue; if (s.player && ctx.decisions?.allyCall(ctx, w, side, host, foe, s)) continue; if (rng() >= chance) continue; w.sides[side].push(m); s.warIds.push(w.id); adjustRel(s, foe, -20);
      makeEvent(civ, ids, { kind: "ally_joined", title: `${s.name}が${p.name}の盟約に従い、${host.name}側で参戦した`, participants: [{ entityId: m, role: "ally" }, { entityId: w.id, role: "war" }], location: null, causes: [{ targetId: w.declaredEvent, relation: "reaction_to", basis: "strong" }] }); }
  }
}
function commonEnemy(civ, members) { const c = {}; for (const m of members) for (const [k, v] of Object.entries(civ.states[m].relations)) if (v <= -30 && alive(civ, k) && !members.includes(k)) c[k] = (c[k] ?? 0) + 1; const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best && best[1] >= members.length - 1 ? best[0] : null; }
const sameCulture = (civ, ms) => { const k = ms.map((m) => civ.groups[civ.states[m].capitalGroupId]).filter(Boolean).map((g) => dominant(g)); return k.length === ms.length && (k.every((x) => x.cultureId === k[0].cultureId) || k.every((x) => x.religionId === k[0].religionId)); };

/** 統合: 盟主の国が、ほかの加盟国をまとめる。国名は盟主のもの（政体は変えない）。首都は盟主の首都 */
export function mergePact(ctx, pact) {
  const { civ, ids } = ctx, L = civ.states[pact.leaderId]; if (!L?.alive) return false; const absorbed = [];
  for (const m of pact.members) { if (m === L.id) continue; const A = civ.states[m]; if (!A?.alive || A.warIds.length) continue; for (const gid in civ.groups) if (civ.groups[gid].stateId === A.id) civ.groups[gid].stateId = L.id; A.alive = false; A.corps = null; A.dissolvedAt = civ.monthIndex; A.mergedInto = L.id; absorbed.push(A); }
  if (!absorbed.length) return false; L.interpDirty = true; L.stability = clamp(L.stability - 0.03); pact.active = false; pact.endedAt = civ.monthIndex; pact.mergedInto = L.id;
  makeEvent(civ, ids, { kind: "state_merged", title: `${pact.name}の加盟国が一つにまとまり、${L.name}となった（${absorbed.map((a) => a.name).join("・")}）`, participants: [{ entityId: L.id, role: "state" }, ...absorbed.map((a) => ({ entityId: a.id, role: "absorbed" }))], location: civ.groups[L.capitalGroupId] ? { cell: civ.groups[L.capitalGroupId].cell } : null, facts: { stateId: L.id, pactId: pact.id, absorbed: absorbed.map((a) => a.id) }, provenance: "simulation" }); return true;
}
/** 年 1 回（10 月）: 整理・規律・配当・AI の結成と加入・統合の提案 */
export function stepPacts(ctx) {
  const { civ } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 12 !== 10) return; const S = pactsOf(civ);
  for (const p of listPacts(civ)) {
    for (const m of [...p.members]) if (!alive(civ, m)) p.members = p.members.filter((x) => x !== m);
    if (p.members.length < 2) { dissolvePact(ctx, p, "加盟国が足りなくなり解散した"); continue; } if (!alive(civ, p.leaderId)) p.leaderId = [...p.members].sort((a, b) => civ.states[b].pop - civ.states[a].pop)[0];
    if (p.purpose === "defense" || p.purpose === "trade") for (const a of [...p.members]) for (const b of p.members) if (a < b && atWarWith(civ, civ.states[a], civ.states[b])) { const w = Object.values(civ.wars).find((x) => x.status === "active" && ((x.sides.a.includes(a) && x.sides.d.includes(b)) || (x.sides.a.includes(b) && x.sides.d.includes(a)))), culprit = civ.states[w && w.aggressor === b ? b : a]; if (culprit.alive && p.members.includes(culprit.id)) { culprit.legitimacyHit = (culprit.legitimacyHit ?? 0) + 1; leavePact(ctx, p, culprit, "盟約を破って脱退した"); } }
    if (!p.active) continue;
    for (const a of p.members) { const A = civ.states[a]; for (const b of p.members) if (a < b) adjustRel(A, civ.states[b], 2); if (p.purpose === "trade") A.treasury += Math.max(0, A.treasury) * 0.01; if (p.purpose === "religion") A.stability = clamp(A.stability + 0.01); if (p.purpose === "counter" && alive(civ, p.target)) { A.stability = clamp(A.stability - 0.005); adjustRel(A, civ.states[p.target], -2); } }
  }
  // AI の結成: 近隣で関係の良い国どうしが、共通の敵・宗教・交易でまとまる
  const all = Object.values(civ.states).filter((s) => s.alive && !s.player && !s.dependency && s.techAdopted?.diplomacy != null);
  for (const A of all) {
    if (pactsOfState(civ, A.id).length >= 2 || (hashSeed(A.id, mi, "pact") % 1000) / 1000 >= 0.025) continue;
    const N = neighborStates(ctx, A).map((i) => civ.states[i]).filter((s) => s.alive && !s.dependency && (A.relations[s.id] ?? 0) >= 15 && !atWarWith(civ, A, s)).sort((x, y) => y.pop - x.pop).slice(0, 4); if (N.length < 2) continue;
    const members = [A, ...N].filter((s) => s.id === A.id || !s.player); if (members.length < 3) continue; const ms = members.map((s) => s.id); if (listPacts(civ).some((p) => ms.filter((m) => p.members.includes(m)).length >= 2)) continue;
    const enemy = commonEnemy(civ, ms), purpose = enemy ? "counter" : sameCulture(civ, ms) && (hashSeed(A.id, mi, "rel") % 3 === 0) ? "religion" : members.every((s) => Object.values(civ.treaties).some((t) => t.active && t.type === "trade" && (t.a === s.id || t.b === s.id))) ? "trade" : "defense";
    const leader = [...members].sort((x, y) => strength(civ, y) - strength(civ, x))[0], ok = members.filter((s) => s.id === leader.id || pactAccepts(ctx, s, leader, purpose, enemy).ok); if (ok.length >= 3) createPact(ctx, { purpose, leaderId: leader.id, memberIds: ok.map((s) => s.id), target: enemy });
  }
  // 加入: 盟主と親しい近隣国が加わる。担当国には誘いが届く
  for (const p of listPacts(civ)) { if (p.members.length >= MAX_MEMBERS) continue; const L = civ.states[p.leaderId]; for (const n of neighborStates(ctx, L)) { const s = civ.states[n]; if (!s?.alive || p.members.includes(n) || (L.relations[n] ?? 0) < 25 || (hashSeed(n, mi, p.id) % 100) >= 6) continue; if (s.player) { raise(ctx, { kind: "pact_invite", key: `pi|${p.id}|${n}`, stateId: n, title: `${p.name}が加盟を誘っている`, body: `${PACT_PURPOSES[p.purpose].ja}。加盟国 ${p.members.length}。`, options: [{ id: "join", ja: "加盟する", hint: PACT_PURPOSES[p.purpose].merit }, { id: "decline", ja: "断る", hint: "関係がわずかに悪化" }], payload: { pactId: p.id, state: n } }); } else if (!s.dependency && pactAccepts(ctx, s, L, p.purpose, p.target).ok) joinPact(ctx, p, s); break; } }
  // 統合の提案
  for (const p of listPacts(civ)) {
    if (mi - p.formedAt < 360 || (p.mergeCool ?? 0) > mi || p.members.length < 2 || p.members.some((m) => civ.states[m].warIds.length || civ.states[m].dependency)) continue; if (!sameCulture(civ, p.members) || !(commonEnemy(civ, p.members) || p.purpose === "defense" || p.purpose === "counter")) continue;
    if ((hashSeed(p.id, mi, "merge") % 1000) / 1000 >= Math.min(0.2, 0.04 + (mi - p.formedAt) / 12 / 1500)) continue;
    const pl = p.members.find((m) => civ.states[m].player); if (pl) { const L = civ.states[p.leaderId]; raise(ctx, { kind: "pact_merge", key: `pm|${p.id}`, stateId: pl, title: `${p.name}が一つの国へのまとまりを提案した`, body: `盟主は${L.name}。長い協力の末、一つの国として歩む提案。`, options: [{ id: "accept", ja: "一つにまとまる", hint: pl === p.leaderId ? "国力は合算される。ほかの国の民が加わる" : "あなたの国は盟主の国に統合される" }, { id: "decline", ja: "断る", hint: "盟約は続く。しばらく提案は来ない" }], payload: { pactId: p.id, state: pl } }); p.mergeCool = mi + 120; }
    else mergePact(ctx, p);
  }
  void S;
}
/** 担当国への誘い・提案の決断（拡張の登録時に 1 回だけ呼ぶ） */
export function registerPactDecisions() {
  registerWarDecisions(); // v7.0.0: 降伏の打診・講和会議・講和条件の決断
  registerDecision("pact_invite", (ctx, d, opt) => { const { civ } = ctx, p = pactsOf(civ).items[d.payload.pactId], st = civ.states[d.payload.state]; if (!p?.active || !st?.alive) return { ok: true, note: "盟約はすでに無かった" }; if (opt === "decline") { adjustRel(st, civ.states[p.leaderId], -2); return { ok: true, note: "誘いを断った" }; } return joinPact(ctx, p, st) ? { ok: true, note: `${p.name}に加わった` } : { ok: true, note: "加われなかった" }; });
  registerDecision("pact_merge", (ctx, d, opt) => { const { civ } = ctx, p = pactsOf(civ).items[d.payload.pactId]; if (!p?.active) return { ok: true, note: "盟約はすでに無かった" }; if (opt === "decline") { p.mergeCool = civ.monthIndex + 480; return { ok: true, note: "提案を断った" }; } return mergePact(ctx, p) ? { ok: true, note: "一つの国にまとまった" } : { ok: true, note: "まとまれなかった" }; });
}
export { regimeOf };
