// V5-M2: 国家の形成（6つの経路）・拡大・安定度・分離・崩壊。国家は集団（civ.groups）の集まり。
// 経路: city_state（都市国家）/ agri_union（農耕集落の統合）/ nomad_confederation（遊牧連合）/ religious_polity（宗教共同体）/ defense_league（防衛連合）/ secession（分離）。
// プレイヤー集団は自動で国家に組み込まれない（形成は提案→命令。NPC 集団だけが自動で形成・吸収される）。
import { makeEvent } from "./events.js";
import { makeNameJa } from "./culture.js";
import { leaderName, leaderRng } from "../wcde/domains/naming.js";
import { dominant } from "./cohorts.js";
import { neighborGroups, byState, spatialOf } from "./spatial.js";
import { reachable, addProposal } from "./population.js";
import { taxMult } from "./techfx.js";
import { stateCan, groupCaps, POLITY_CAP } from "./tech.js";
/** 建国時の政体は、成立する集団が知っている技術（解禁 polity:*）で選べるものだけ。足りなければ部族 */
export const gatedPolity = (civ, cap, p) => (!POLITY_CAP[p] || groupCaps(civ, cap).has(POLITY_CAP[p]) ? p : "tribal");
import { hashSeed } from "./civ-state.js";
import { recentEventsFor, asCauses } from "./graph.js";
import { speciesOf, lifeScale } from "./species.js";
import { REGIMES as REG15, regimeOf as regimeOf15 } from "../wcde/regimes.js";
import { stateStability as officeStability } from "../wcde/statefx.js"; // v6.12.0: 役職と国策の効果
const OFFICE_RULER = (st) => REG15[regimeOf15(st)].ruler;

export const POLITY = Object.freeze({ tribal: "部族", chiefdom: "首長制", kingdom: "王国", empire: "帝国", republic: "共和制", theocracy: "神権制" });
export const VIA = Object.freeze({ city_state: { ja: "都市国家", suffix: "公国" }, agri_union: { ja: "農耕集落の統合", suffix: "連邦" }, nomad_confederation: { ja: "遊牧連合", suffix: "汗国" }, religious_polity: { ja: "宗教共同体", suffix: "教国" }, defense_league: { ja: "防衛連合", suffix: "連盟" }, secession: { ja: "分離", suffix: "公国" } });
const KM = 6371, CLUSTER_BUDGET = 8, CHECK_EVERY = 12;
export const distKm = (w, a, b) => { const c = w.cell; const x = Math.sin(c.lat[a]) * Math.sin(c.lat[b]) + Math.cos(c.lat[a]) * Math.cos(c.lat[b]) * Math.cos(c.lon[a] - c.lon[b]); return Math.acos(Math.max(-1, Math.min(1, x))) * KM; };

export function formState(ctx, { via, groupIds, predecessor = null, player = false, cause = null, threat = null, name = null, polity = null, capitalGroupId = null }) {
  const { world, civ, ids, rng } = ctx, gs = groupIds.map((i) => civ.groups[i]).filter(Boolean);
  if (!gs.length) return null;
  const cap = (capitalGroupId && gs.find((g) => g.id === capitalGroupId)) || gs.reduce((a, b) => (b.pop > a.pop ? b : a)), id = ids.next("state"), h = hashSeed(id);
  const pol = gatedPolity(civ, cap, polity ?? (via === "religious_polity" ? "theocracy" : via === "city_state" ? "chiefdom" : "tribal")), np = name ? null : ctx.nameGen?.stateParts?.(civ, cap, via, rng, pol) ?? null;
  const st = { id, name: name ?? np?.name ?? ctx.nameGen?.state(civ, cap, via, rng) ?? makeNameJa(rng) + VIA[via].suffix, nameBase: np?.base ?? null, titleYear: np?.year ?? null, via, formedAt: civ.monthIndex, capitalGroupId: cap.id, nameLang: name ? null : (ctx.nameLangOf?.(cap) ?? null), /* 国名の由来の言語（建国時。首都はのちに変わるので、現在の首都の言語とは別に残す） */ alive: true, player, dissolvedAt: null, predecessor, polity: pol, stability: 0.7, pop: 0, settlements: 0, treasury: 50, army: 0,
    policy: { tax: 0.1, mobilization: 0, assimilation: 0, tolerance: 0.5, autonomy: 0 }, techAdopted: {}, strategy: null, campaign: null, defense: 0, boostUntil: -1, sanctions: {}, relations: {}, warIds: [], leader: { name: ctx.nameGen?.person(civ, cap, rng) ?? makeNameJa(rng), bornAt: civ.monthIndex - Math.round((300 + Math.floor(rng() * 200)) * lifeScale(civ, { capitalGroupId: cap.id })), heir: false }, lastCrisis: -999,
    personality: { security: 0.6 + (h % 100) / 125, prosperity: 0.6 + ((h >> 7) % 100) / 125, expansion: 0.6 + ((h >> 14) % 100) / 125, stability: 0.6 + ((h >> 21) % 100) / 125, culture: 0.6 + ((h >> 4) % 100) / 125, tech: 0.6 + ((h >> 11) % 100) / 125, prestige: 0.6 + ((h >> 18) % 100) / 125 } };
  st.leader.name = leaderName(st, st.leader.name, leaderRng(civ, st, "found")); // 君主は「〇〇1世」
  civ.states[id] = st; for (const g of gs) g.stateId = id; if (gs.some((g) => g.player)) st.player = true;
  const causes = []; if (cause) causes.push({ targetId: cause, relation: "caused_by", basis: "plausible" }); if (threat) causes.push({ targetId: threat, relation: "reaction_to", basis: "strong" });
  if (predecessor) causes.push({ targetId: predecessor, relation: "succeeded_by", basis: "direct" });
  const ev = makeEvent(civ, ids, { kind: "state_formed", title: `${st.name}が成立（${VIA[via].ja}）`, participants: [{ entityId: id, role: "state" }, ...gs.map((g) => ({ entityId: g.id, role: g.id === cap.id ? "capital_group" : "member" }))], location: { cell: cap.cell }, causes, facts: { stateId: id, name: st.name, polity: st.polity, capitalCell: cap.cell, cells: gs.slice(0, 24).map((g) => g.cell), nGroups: gs.length }, provenance: player ? "player" : "simulation" });
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
  for (const [r, a] of byRel) if (a.length >= 3 && sum(a) >= 4000 && a.some((g) => g.id === seed.id) && (hashSeed(seed.id, ctx.civ.monthIndex >> 5) % 100) < 25) return { via: "religious_polity", groupIds: a.map((g) => g.id) };
  const no = free.filter((g) => g.subsistence === "pastoral"); if (no.length >= 3 && sum(no) >= 1500) return { via: "nomad_confederation", groupIds: no.map((g) => g.id) };
  const cult = new Set(free.filter((g) => g.pop >= 300).map((g) => dominant(g).cultureId));
  if (cult.size >= 2 && free.length >= 2) { for (const s of Object.values(civ.states)) { if (!s.alive || s.pop < sum(free) * 3) continue; const cg = civ.groups[s.capitalGroupId]; if (cg && dist.has(cg.cell)) return { via: "defense_league", groupIds: free.filter((g) => g.pop >= 300).map((g) => g.id), threat: s.formedEvent ?? s.id }; } }
  return null;
}

const dissolve = (ctx, st, why) => {
  const { civ, ids } = ctx; st.alive = false; st.dissolvedAt = civ.monthIndex; for (const gid in civ.groups) if (civ.groups[gid].stateId === st.id) civ.groups[gid].stateId = null;
  for (const wid of [...st.warIds]) ctx.endWarHook?.(ctx, civ.wars[wid], "state_dissolved");
  makeEvent(civ, ids, { kind: "state_dissolved", title: `${st.name}が${why}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: civ.groups[st.capitalGroupId]?.cell ?? null }, facts: { stateId: st.id }, causes: [...(st.lastCrisisEvent ? [{ targetId: st.lastCrisisEvent, relation: "caused_by", basis: "plausible" }] : []), ...asCauses(recentEventsFor(civ, [st.id], ["war_ended"], 24, 1), "contributed_to", "plausible")] });
};
export const aliveStates = (civ) => Object.values(civ.states).filter((s) => s.alive);

/** 世界に同時に存在できる国家の数の目安（v6.8.0）。起点の直後は最大 10、時代とともに増え、約 200 に近づく（史実: 初期の国家は少数で、時代とともに増える）。上限に届いたら新しい国家は生まれにくい（分離・自然形成とも） */
export const stateCap = (civ) => 10 + 190 * (1 - Math.exp(-Math.max(0, civ.date.year - 100) / 1500));
/** 国家の年あたりの崩壊の確率（v6.9.0）。年齢 a 年。120 年を超えると徐々に上がる（a=250: 0.12%, 500: 0.28%, 1000: 0.64%）。生存は 1000 年で約 6%、500 年で約 35%（他の崩壊・征服は別） */
export const lifespanHazard = (age) => 0.0012 * Math.pow(Math.max(0, age) / 250, 1.2);
/** 統合（v6.8.0）。大きな国が、小さな近隣の国を吸収する（征服以外の統合・併合の経路。文化が同じ・相手が不安定だと起きやすい）。年 1 回。プレイヤーの国は吸収しない */
const lmCache = new WeakMap();
/** 各セルの陸塊（海で区切られた連結成分）の番号。世界ごとに 1 回だけ作る（v6.11.0: 大陸ごとの覇権に使う） */
const landmassOf = (world) => { // 連結成分は幅優先で数える（球面世界の層は直接 import しない）
  let v = lmCache.get(world); if (v) return v;
  const V = world.mesh.cellCount, off = world.mesh.neighborOffsets, nb = world.mesh.neighborIds, el = world.cell.elevation; v = new Int32Array(V).fill(-1); const q = new Int32Array(V); let n = 0;
  for (let s0 = 0; s0 < V; s0++) { if (v[s0] >= 0 || el[s0] <= 0) continue; let h = 0, t = 0; q[t++] = s0; v[s0] = n; while (h < t) { const c = q[h++]; for (let k = off[c]; k < off[c + 1]; k++) { const j = nb[k]; if (v[j] < 0 && el[j] > 0) { v[j] = n; q[t++] = j; } } } n++; }
  lmCache.set(world, v); return v;
};
/** 大陸ごとの覇権（v6.11.0）。各陸塊で最大の国は、近隣の小国を吸収しやすい（大きな帝国は、大陸ごとに育つ。崩壊は国家の寿命・不安定が受け持つので、興亡をくり返す）。起点から約 500 年後（青銅器時代）から */
export const HEGEMON = Object.freeze({ fromYear: 500, ratio: 2.0, boost: 1.6, perYear: 1, maxShare: 0.6, crowded: 0.5 }); // 国の数が目安の半分を下回るほど減ったら、これ以上は統合を促さない（数の目標と両立）
export function stepUnification(ctx, groupsByState) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex, alive = aliveStates(civ).sort((a, b) => b.pop - a.pop);
  const merged = new Set(), absorbers = new Set(); let done = 0, doneLead = 0;
  const lm = landmassOf(world), lmOfState = (s) => { const g = civ.groups[s.capitalGroupId]; return g ? lm[g.cell] : -1; }, leaderOf = new Map();
  const lmGroups = new Map(); for (const id in civ.groups) { const g = civ.groups[id]; const k = lm[g.cell]; lmGroups.set(k, (lmGroups.get(k) ?? 0) + 1); }
  if (civ.date.year >= HEGEMON.fromYear && alive.length >= HEGEMON.crowded * stateCap(civ)) for (const s of alive) { const k = lmOfState(s); if (k >= 0 && !leaderOf.has(k) && (lmGroups.get(k) ?? 0) >= 12) leaderOf.set(k, s.id); } // alive は人口の多い順。小さな島の覇者は作らない
  groupsByState = new Map(); for (const id in civ.groups) { const g = civ.groups[id]; if (g.stateId) (groupsByState.get(g.stateId) ?? groupsByState.set(g.stateId, []).get(g.stateId)).push(g); } // 古い一覧を使わない（同じ回に分離・崩壊した国の集団を取りこぼさない）
  for (const B of alive) {
    const lead = leaderOf.get(lmOfState(B)) === B.id && (groupsByState.get(B.id)?.length ?? 0) < HEGEMON.maxShare * (lmGroups.get(lmOfState(B)) ?? 1); if (merged.has(B.id) || !B.alive || (lead ? doneLead >= HEGEMON.perYear : done >= 2)) continue;
    const gsB = groupsByState.get(B.id); if (!gsB?.length || B.stability < 0.45) continue;
    const nbr = new Map(); for (const g of gsB) for (const o of neighborGroups(ctx, g)) { const og = civ.groups[o]; if (og?.stateId && og.stateId !== B.id) nbr.set(og.stateId, (nbr.get(og.stateId) ?? 0) + 1); }
    for (const [aid] of [...nbr].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))) {
      const A = civ.states[aid]; if (!A?.alive || A.player || merged.has(aid) || absorbers.has(aid) || A.pop * (lead ? HEGEMON.ratio : 2.5) > B.pop || A.warIds.length || B.warIds.some((w) => civ.wars[w]?.sides.a.includes(aid) || civ.wars[w]?.sides.d.includes(aid))) continue;
      const cA = civ.groups[A.capitalGroupId], cB = civ.groups[B.capitalGroupId], same = cA && cB && dominant(cA).cultureId === dominant(cB).cultureId;
      const adm = stateCan(civ, B, "polity:empire") ? 1.5 : stateCan(civ, B, "polity:kingdom") ? 1.2 : 0.7;
      const p = 0.03 * (lead ? HEGEMON.boost : 1) * adm * (same ? 1 : lead ? 0.6 : 0.35) * (A.stability < 0.45 ? 1.8 : 1) * Math.min(1.5, B.stability + 0.3);
      if (rng() >= p) continue;
      const gsA = groupsByState.get(aid) ?? []; for (const g of gsA) g.stateId = B.id; gsB.push(...gsA); groupsByState.delete(aid); absorbers.add(B.id);
      A.alive = false; A.dissolvedAt = mi; A.mergedInto = B.id; merged.add(aid); if (lead) doneLead++; else done++;
      makeEvent(civ, ids, { kind: "state_merged", title: `${A.name}が${B.name}に統合された`, participants: [{ entityId: aid, role: "absorbed" }, { entityId: B.id, role: "state" }], location: cB ? { cell: cB.cell } : null, facts: { stateId: B.id, absorbed: aid, same: !!same }, causes: A.lastCrisisEvent ? [{ targetId: A.lastCrisisEvent, relation: "contributed_to", basis: "plausible" }] : [] });
      B.interpDirty = true; break;
    }
  }
}


/** 指導者が代わる（継承）。o を渡すと、その人物で立つ（担当国の決断）。渡さなければ従来どおり乱数で決まる */
export function enthrone(ctx, st, o = {}) {
  const { civ, ids, rng } = ctx, mi = civ.monthIndex, ls = lifeScale(civ, st), cap = civ.groups[st.capitalGroupId], heir = st.leader.heir; st.interpDirty = true;
  const nm = o.name ?? (ctx.nameGen?.person(civ, cap, rng) ?? makeNameJa(rng));
  st.leader = { name: leaderName(st, nm, leaderRng(civ, st, "succ")), bornAt: o.bornAt ?? mi - Math.round((300 + Math.floor(rng() * 100)) * ls), heir: false, kin: o.kin ?? (heir || rng() < 0.8), ...(st.leader.title ? { title: st.leader.title } : {}) }; /* v6.9.0: 継承者がいなくても、多くは同じ家系の親族が立つ（王朝交代は少数） */
  if (st.offices) { const ro = st.offices.find((x) => x.id === OFFICE_RULER(st)); if (ro) ro.holder = { name: st.leader.name, look: null }; /* v6.4.0: 元首の役職の担当者は為政者と同じ人 */ }
  st.stability = Math.max(0, st.stability - (o.hit ?? (heir ? 0.03 : 0.12)));
  makeEvent(civ, ids, { kind: "leader_succession", title: `${st.name}の指導者が代わった${o.how ? `（${o.how}）` : heir ? "（継承者が決まっていた）" : "（継承の混乱）"}`, participants: [{ entityId: st.id, role: "state" }], location: cap ? { cell: cap.cell } : null, ...(o.how ? { provenance: "player" } : {}) });
}
/** 分離（不満が限界を超えた）: 首都から遠い地域が独立した国になる。担当国の分離は、自動で内戦になる（v6.12.0）。アルゴリズム国家どうしは従来どおり */
export function runSecession(ctx, st, part) {
  const { civ, ids } = ctx, mi = civ.monthIndex, cap = civ.groups[st.capitalGroupId], gs = byState(ctx).get(st.id) ?? [];
  st.lastCrisis = mi; const ev = makeEvent(civ, ids, { kind: "instability", title: `${st.name}で不満が高まる`, participants: [{ entityId: st.id, role: "state" }], location: cap ? { cell: cap.cell } : null, causes: [...asCauses(recentEventsFor(civ, [st.id, ...gs.map((g) => g.id)], ["famine", "disaster_struck", "demand_raised"], 48, 2), "contributed_to", "plausible"), ...asCauses(recentEventsFor(civ, [st.id], ["war_declared", "war_ended", "leader_succession"], 36, 2), "contributed_to", "strong")] }); st.lastCrisisEvent = ev.eventId;
  const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st.id, cause: ev.eventId });
  if (ns) { ns.relations[st.id] = -40; st.relations[ns.id] = -40; st.stability = Math.min(1, st.stability + 0.1); if (st.player) { ctx.corpsDefect?.(ns, st, part.map((g) => g.id)); /* v6.12.0: 忠誠度に応じて軍団が寝返る（内戦の前に） */ ctx.autoCivilWar?.(ns, st); } }
  return ns;
}

/** 月次（conflict フェーズの前半）: 国家の形成・吸収・集計・安定度・分離・崩壊。重い処理は3か月ごと */
export function stepStates(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex; if (mi % 3 !== 0) return;
  const groupsByState = byState(ctx);
  // 1) 集計・安定度・分離・崩壊
  for (const id in civ.states) {
    const st = civ.states[id]; if (!st.alive) continue; const gs = groupsByState.get(id);
    if (!gs?.length) { dissolve(ctx, st, "消滅した"); continue; }
    let pop = 0, tens = 0, settle = 0, big = gs[0], mar = 0; for (const g of gs) { pop += g.pop; mar += g.pop * speciesOf(g.speciesId, civ).martial; if (g.settlementId) settle++; if (g.pop > big.pop) big = g; let t = 0; for (const c of g.cohorts) if (c.tension > t) t = c.tension; tens += t * g.pop; }
    st.pop = pop; st.martial = pop ? Math.round((mar / pop) * 1000) / 1000 : 1; st.settlements = settle; if (!civ.groups[st.capitalGroupId] || civ.groups[st.capitalGroupId].stateId !== id) st.capitalGroupId = big.id;
    const cap = civ.groups[st.capitalGroupId]; let far = 0, mx = 0; const dists = []; for (const g of gs) { const d = distKm(world, cap.cell, g.cell); dists.push([d, g]); if (d > mx) mx = d; }
    const adm = stateCan(civ, st, "polity:empire") ? 0.6 : stateCan(civ, st, "polity:kingdom") ? 0.35 : 0;
    const target = 0.8 - 0.5 * (tens / pop) - Math.min(1, mx / 15000) * 0.3 * (1 - adm) - Math.max(0, st.policy.tax - 0.15) * 0.6 - (st.warIds.length ? 0.05 : 0) - (st.policy.mobilization * 0.3) + (st.leader.heir ? 0.03 : 0) + (st.magic?.kind === "temple" ? 0.04 * st.magic.power : 0) + ({ chiefdom: 0.02, kingdom: 0.05, empire: 0.08, republic: 0.06, theocracy: 0.05, tribal: 0 }[st.polity]) + (st.offices?.length ? officeStability(st) : 0); /* v6.4.0: 役職の分野が揃うほど安定度が少し上がる（上限 +0.04） */
    const before = st.stability; st.stability = Math.max(0, Math.min(1, st.stability + (target - st.stability) * 0.3));
    st.treasury += pop * st.policy.tax * 0.0012 * taxMult(st) * (ctx.taxFactor?.(st) ?? 1) * (1 - Math.min(0.5, Object.keys(st.sanctions).filter((k) => st.sanctions[k] > mi).length * 0.1)); st.army = pop * (0.005 + 0.12 * st.policy.mobilization) * (0.5 + st.stability) * (1 - (st.warLoss ?? 0));
    for (const k in st.sanctions) if (st.sanctions[k] <= mi) delete st.sanctions[k];
    // 指導者の継承
    const ls = lifeScale(civ, st), age = mi - st.leader.bornAt; if (age > 480 * ls && rng() < Math.min(0.2, (age - 480 * ls) / (4000 * ls))) { if (st.player && ctx.decisions?.succession(ctx, st)) { /* v6.12.0: 担当国の継承は、時間を止めて候補者から選ぶ（決断） */ } else enthrone(ctx, st); }
    if (st.stability < 0.08 && before < 0.2) { dissolve(ctx, st, "崩壊した"); continue; }
    if (civ.options?.wcde && !st.player && mi % 12 === 0) { const age = (mi - st.formedAt) / 12; if (age > 120 && rng() < lifespanHazard(age)) { dissolve(ctx, st, "王朝の衰えとともに崩壊した"); continue; } } // v6.9.0: 国家の寿命は史実のように偏る（1000 年を超えるのは 1 割に満たない）
    if (st.stability < 0.3 && gs.length >= 3 && mi - st.lastCrisis > 60 && !(civ.options?.wcde && aliveStates(civ).length >= stateCap(civ))) { // 分離: 首都から遠い半分が独立
      dists.sort((a, b) => b[0] - a[0]); const part = dists.slice(0, Math.max(1, Math.floor(gs.length / 2))).map((x) => x[1]).filter((g) => !g.player || st.player === false);
      if (part.length && part.length < gs.length) { if (st.player && ctx.decisions?.rebellion(ctx, st, part.map((g) => g.id))) { /* v6.12.0: 担当国の反乱は、鎮圧か譲歩かを決断する */ } else runSecession(ctx, st, part); }
    }
    if (st.player) ctx.decisions?.omen(ctx, st); // v6.12.0: 反乱の前兆（偵察が行き届いていれば見える）
  }
  if (mi % 12 === 0 && civ.options?.wcde) stepUnification(ctx, byState(ctx));
  // 2) 国家のない集団: 形成の評価と吸収（NPC は自動。プレイヤー集団は提案）
  for (const id in civ.groups) {
    const g = civ.groups[id]; if (g.stateId) continue;
    if (!(g.nextStateCheck <= mi) && g.nextStateCheck !== undefined) continue;
    g.nextStateCheck = mi + CHECK_EVERY + (hashSeed(id) % 6);
    if (g.pop < 300 || (g.subsistence === "forage")) continue;
    const capFull = !g.player && civ.options?.wcde && aliveStates(civ).length >= stateCap(civ); // v6.8.0: 同時に存在できる国家の数の目安を超えたら、自然には国家が生まれない（周囲の国への加入は続く）
    if (!g.player) {
      const ns = [...neighborGroups(ctx, g)].map((o) => civ.groups[o]).filter((o) => o?.stateId && civ.states[o.stateId].alive), best = ns.reduce((a, o) => (!a || civ.states[o.stateId].pop > civ.states[a.stateId].pop ? o : a), null);
      if (best && civ.states[best.stateId].pop >= g.pop * 2 && rng() < 0.4) { g.stateId = best.stateId; makeEvent(civ, ids, { kind: "group_joined_state", title: `${civ.states[best.stateId].name}に加わった`, participants: [{ entityId: g.id, role: "group" }, { entityId: best.stateId, role: "state" }], location: { cell: g.cell }, facts: { stateId: best.stateId, cell: g.cell } }); continue; }
    }
    if (capFull) continue;
    const f = evaluateFormation(ctx, g); if (!f) continue;
    if (g.player) addProposal(civ, ids, g, "form_state", f); else formState(ctx, f);
  }
}
