// V5-M2: 国家の形成（6つの経路）・拡大・安定度・分離・崩壊。国家は集団（civ.groups）の集まり。
// 経路: city_state（都市国家）/ agri_union（農耕集落の統合）/ nomad_confederation（遊牧連合）/ religious_polity（宗教共同体）/ defense_league（防衛連合）/ secession（分離）。
// プレイヤー集団は自動で国家に組み込まれない（形成は提案→命令。NPC 集団だけが自動で形成・吸収される）。
import { makeEvent } from "./events.js";
import { makeNameJa } from "./culture.js";
import { dominant } from "./cohorts.js";
import { neighborGroups, byState, spatialOf } from "./spatial.js";
import { reachable, addProposal } from "./population.js";
import { taxMult } from "./techfx.js";
import { hashSeed } from "./civ-state.js";
import { recentEventsFor, asCauses } from "./graph.js";
import { speciesOf, lifeScale } from "./species.js";

export const POLITY = Object.freeze({ tribal: "部族", chiefdom: "首長制", kingdom: "王国", empire: "帝国", republic: "共和制", theocracy: "神権制" });
export const VIA = Object.freeze({ city_state: { ja: "都市国家", suffix: "市国" }, agri_union: { ja: "農耕集落の統合", suffix: "連合" }, nomad_confederation: { ja: "遊牧連合", suffix: "部族連合" }, religious_polity: { ja: "宗教共同体", suffix: "教団国" }, defense_league: { ja: "防衛連合", suffix: "同盟" }, secession: { ja: "分離", suffix: "国" } });
const KM = 6371, CLUSTER_BUDGET = 8, CHECK_EVERY = 12;
export const distKm = (w, a, b) => { const c = w.cell; const x = Math.sin(c.lat[a]) * Math.sin(c.lat[b]) + Math.cos(c.lat[a]) * Math.cos(c.lat[b]) * Math.cos(c.lon[a] - c.lon[b]); return Math.acos(Math.max(-1, Math.min(1, x))) * KM; };

export function formState(ctx, { via, groupIds, predecessor = null, player = false, cause = null, threat = null }) {
  const { world, civ, ids, rng } = ctx, gs = groupIds.map((i) => civ.groups[i]).filter(Boolean);
  if (!gs.length) return null;
  const cap = gs.reduce((a, b) => (b.pop > a.pop ? b : a)), id = ids.next("state"), h = hashSeed(id);
  const st = { id, name: makeNameJa(rng) + VIA[via].suffix, via, formedAt: civ.monthIndex, capitalGroupId: cap.id, alive: true, player, dissolvedAt: null, predecessor, polity: via === "religious_polity" ? "theocracy" : via === "city_state" ? "chiefdom" : "tribal", stability: 0.7, pop: 0, settlements: 0, treasury: 50, army: 0,
    policy: { tax: 0.1, mobilization: 0, assimilation: 0, tolerance: 0.5, autonomy: 0 }, techAdopted: {}, strategy: null, campaign: null, defense: 0, boostUntil: -1, sanctions: {}, relations: {}, warIds: [], leader: { name: makeNameJa(rng), bornAt: civ.monthIndex - Math.round((300 + Math.floor(rng() * 200)) * lifeScale(civ, { capitalGroupId: cap.id })), heir: false }, lastCrisis: -999,
    personality: { security: 0.6 + (h % 100) / 125, prosperity: 0.6 + ((h >> 7) % 100) / 125, expansion: 0.6 + ((h >> 14) % 100) / 125, stability: 0.6 + ((h >> 21) % 100) / 125, culture: 0.6 + ((h >> 4) % 100) / 125, tech: 0.6 + ((h >> 11) % 100) / 125, prestige: 0.6 + ((h >> 18) % 100) / 125 } };
  civ.states[id] = st; for (const g of gs) g.stateId = id; if (gs.some((g) => g.player)) st.player = true;
  const causes = []; if (cause) causes.push({ targetId: cause, relation: "caused_by", basis: "plausible" }); if (threat) causes.push({ targetId: threat, relation: "reaction_to", basis: "strong" });
  if (predecessor) causes.push({ targetId: predecessor, relation: "succeeded_by", basis: "direct" });
  const ev = makeEvent(civ, ids, { kind: "state_formed", title: `${st.name}が成立（${VIA[via].ja}）`, participants: [{ entityId: id, role: "state" }, ...gs.map((g) => ({ entityId: g.id, role: g.id === cap.id ? "capital_group" : "member" }))], location: { cell: cap.cell }, causes, provenance: player ? "player" : "simulation" });
  st.formedEvent = ev.eventId; return st;
}

/** 形成の条件（6経路のうち、最初に満たしたもの）。cluster は到達圏内の「国家のない集団」 */
export function evaluateFormation(ctx, seed) {
  const { world, civ } = ctx, { home } = spatialOf(ctx), dist = reachable(world, seed.cell, CLUSTER_BUDGET, 0), free = [seed];
  for (const [c, d] of dist) { const gid = home.get(c); if (gid && gid !== seed.id) { const o = civ.groups[gid]; if (o && !o.stateId && !o.player) free.push(o); } }
  const st = (g) => (g.settlementId ? civ.settlements[g.settlementId] : null), sum = (a) => a.reduce((s, g) => s + g.pop, 0);
  const s0 = st(seed);
  if (s0 && (s0.stage === "town" || s0.stage === "city") && (world.cell.coastDist[seed.cell] <= 2 || world.cell.river[seed.cell])) return { via: "city_state", groupIds: free.filter((g) => dist.get(g.cell) <= 5).map((g) => g.id) };
  const ag = free.filter((g) => g.subsistence === "agriculture" && g.settlementId); if (ag.length >= 3 && sum(ag) >= 3000) return { via: "agri_union", groupIds: ag.map((g) => g.id) };
  const byRel = new Map(); for (const g of free) if (g.settlementId) { const r = dominant(g).religionId; if (r) (byRel.get(r) ?? byRel.set(r, []).get(r)).push(g); }
  for (const [r, a] of byRel) if (a.length >= 2 && sum(a) >= 1500 && a.some((g) => g.id === seed.id)) return { via: "religious_polity", groupIds: a.map((g) => g.id) };
  const no = free.filter((g) => g.subsistence === "pastoral"); if (no.length >= 3 && sum(no) >= 1500) return { via: "nomad_confederation", groupIds: no.map((g) => g.id) };
  const cult = new Set(free.filter((g) => g.pop >= 300).map((g) => dominant(g).cultureId));
  if (cult.size >= 2 && free.length >= 2) { for (const s of Object.values(civ.states)) { if (!s.alive || s.pop < sum(free) * 3) continue; const cg = civ.groups[s.capitalGroupId]; if (cg && dist.has(cg.cell)) return { via: "defense_league", groupIds: free.filter((g) => g.pop >= 300).map((g) => g.id), threat: s.formedEvent ?? s.id }; } }
  return null;
}

const dissolve = (ctx, st, why) => {
  const { civ, ids } = ctx; st.alive = false; st.dissolvedAt = civ.monthIndex; for (const gid in civ.groups) if (civ.groups[gid].stateId === st.id) civ.groups[gid].stateId = null;
  for (const wid of [...st.warIds]) ctx.endWarHook?.(ctx, civ.wars[wid], "state_dissolved");
  makeEvent(civ, ids, { kind: "state_dissolved", title: `${st.name}が${why}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: civ.groups[st.capitalGroupId]?.cell ?? null }, causes: [...(st.lastCrisisEvent ? [{ targetId: st.lastCrisisEvent, relation: "caused_by", basis: "plausible" }] : []), ...asCauses(recentEventsFor(civ, [st.id], ["war_ended"], 24, 1), "contributed_to", "plausible")] });
};
export const aliveStates = (civ) => Object.values(civ.states).filter((s) => s.alive);

/** 月次（conflict フェーズの前半）: 国家の形成・吸収・集計・安定度・分離・崩壊。重い処理は3か月ごと */
export function stepStates(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex; if (mi % 3 !== 0) return;
  const groupsByState = byState(ctx);
  // 1) 集計・安定度・分離・崩壊
  for (const id in civ.states) {
    const st = civ.states[id]; if (!st.alive) continue; const gs = groupsByState.get(id);
    if (!gs?.length) { dissolve(ctx, st, "消滅した"); continue; }
    let pop = 0, tens = 0, settle = 0, big = gs[0], mar = 0; for (const g of gs) { pop += g.pop; mar += g.pop * speciesOf(g.speciesId).martial; if (g.settlementId) settle++; if (g.pop > big.pop) big = g; let t = 0; for (const c of g.cohorts) if (c.tension > t) t = c.tension; tens += t * g.pop; }
    st.pop = pop; st.martial = pop ? Math.round((mar / pop) * 1000) / 1000 : 1; st.settlements = settle; if (!civ.groups[st.capitalGroupId] || civ.groups[st.capitalGroupId].stateId !== id) st.capitalGroupId = big.id;
    const cap = civ.groups[st.capitalGroupId]; let far = 0, mx = 0; const dists = []; for (const g of gs) { const d = distKm(world, cap.cell, g.cell); dists.push([d, g]); if (d > mx) mx = d; }
    const adm = st.techAdopted.bureaucracy != null ? 0.6 : st.techAdopted.administration != null ? 0.35 : 0;
    const target = 0.8 - 0.5 * (tens / pop) - Math.min(1, mx / 15000) * 0.3 * (1 - adm) - Math.max(0, st.policy.tax - 0.15) * 0.6 - (st.warIds.length ? 0.05 : 0) - (st.policy.mobilization * 0.3) + (st.leader.heir ? 0.03 : 0) + (st.magic?.kind === "temple" ? 0.04 * st.magic.power : 0) + ({ chiefdom: 0.02, kingdom: 0.05, empire: 0.08, republic: 0.06, theocracy: 0.05, tribal: 0 }[st.polity]);
    const before = st.stability; st.stability = Math.max(0, Math.min(1, st.stability + (target - st.stability) * 0.3));
    st.treasury += pop * st.policy.tax * 0.0012 * taxMult(st) * (1 - Math.min(0.5, Object.keys(st.sanctions).filter((k) => st.sanctions[k] > mi).length * 0.1)); st.army = pop * (0.005 + 0.12 * st.policy.mobilization) * (0.5 + st.stability);
    for (const k in st.sanctions) if (st.sanctions[k] <= mi) delete st.sanctions[k];
    // 指導者の継承
    const ls = lifeScale(civ, st), age = mi - st.leader.bornAt; if (age > 480 * ls && rng() < Math.min(0.2, (age - 480 * ls) / (4000 * ls))) { const heir = st.leader.heir; st.interpDirty = true; st.leader = { name: makeNameJa(rng), bornAt: mi - Math.round((300 + Math.floor(rng() * 100)) * ls), heir: false }; st.stability = Math.max(0, st.stability - (heir ? 0.03 : 0.12)); makeEvent(civ, ids, { kind: "leader_succession", title: `${st.name}の指導者が代わった${heir ? "（継承者が決まっていた）" : "（継承の混乱）"}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: cap.cell } }); }
    if (st.stability < 0.08 && before < 0.2) { dissolve(ctx, st, "崩壊した"); continue; }
    if (st.stability < 0.3 && gs.length >= 3 && mi - st.lastCrisis > 60) { // 分離: 首都から遠い半分が独立
      dists.sort((a, b) => b[0] - a[0]); const part = dists.slice(0, Math.max(1, Math.floor(gs.length / 2))).map((x) => x[1]).filter((g) => !g.player || st.player === false);
      if (part.length && part.length < gs.length) { st.lastCrisis = mi; const ev = makeEvent(civ, ids, { kind: "instability", title: `${st.name}で不満が高まる`, participants: [{ entityId: st.id, role: "state" }], location: { cell: cap.cell }, causes: [...asCauses(recentEventsFor(civ, [st.id, ...gs.map((g) => g.id)], ["famine", "disaster_struck", "demand_raised"], 48, 2), "contributed_to", "plausible"), ...asCauses(recentEventsFor(civ, [st.id], ["war_declared", "war_ended", "leader_succession"], 36, 2), "contributed_to", "strong")] }); st.lastCrisisEvent = ev.eventId; const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st.id, cause: ev.eventId }); if (ns) { ns.relations[st.id] = -40; st.relations[ns.id] = -40; st.stability = Math.min(1, st.stability + 0.1); } }
    }
  }
  // 2) 国家のない集団: 形成の評価と吸収（NPC は自動。プレイヤー集団は提案）
  for (const id in civ.groups) {
    const g = civ.groups[id]; if (g.stateId) continue;
    if (!(g.nextStateCheck <= mi) && g.nextStateCheck !== undefined) continue;
    g.nextStateCheck = mi + CHECK_EVERY + (hashSeed(id) % 6);
    if (g.pop < 300 || (g.subsistence === "forage")) continue;
    if (!g.player) {
      const ns = [...neighborGroups(ctx, g)].map((o) => civ.groups[o]).filter((o) => o?.stateId && civ.states[o.stateId].alive), best = ns.reduce((a, o) => (!a || civ.states[o.stateId].pop > civ.states[a.stateId].pop ? o : a), null);
      if (best && civ.states[best.stateId].pop >= g.pop * 2 && rng() < 0.4) { g.stateId = best.stateId; makeEvent(civ, ids, { kind: "group_joined_state", title: `${civ.states[best.stateId].name}に加わった`, participants: [{ entityId: g.id, role: "group" }, { entityId: best.stateId, role: "state" }], location: { cell: g.cell } }); continue; }
    }
    const f = evaluateFormation(ctx, g); if (!f) continue;
    if (g.player) addProposal(civ, ids, g, "form_state", f); else formState(ctx, f);
  }
}
