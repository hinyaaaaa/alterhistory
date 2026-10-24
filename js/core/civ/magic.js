// V5-M8: 魔法の基本モデル。魔法は希少な先天的素質（人物ごと）。誰もが使えるわけではない。
//   人物 civ.persons（person_…）: 素質の能力・強度・種族・集団・寿命。組織 civ.magic.orgs（org_…）。国家の魔法制度 st.magic（academy/military/temple）。
//   制約: 供給（国内の存命の素質者の数。6人で上限）・寛容度（弾圧する国には定着しない）・反動（制度があるほど暴発のリスク）・効果の上限（軍事+15%・技術+10%・安定+0.04）。
//   魔法が軍事・外交・医療・通信・産業・宗教へ与える具体的な影響は 5.x。ここでは、事件・組織・差別・権力争い・制度の入口と、効果の上限つきの基本結線。
import { makeEvent } from "./events.js";
import { makeNameJa } from "./culture.js";
import { speciesOf } from "./species.js";
import { dominant } from "./cohorts.js";
import { byState } from "./spatial.js";
import { hashSeed } from "./civ-state.js";
import { recentEventsFor, asCauses } from "./graph.js";

export const ABILITIES = Object.freeze({
  healing: { id: "healing", ja: "癒し", cost: "術者の体力", risk: 0.01, weight: 3 },
  flame: { id: "flame", ja: "炎術", cost: "術者の寿命", risk: 0.05, weight: 2 },
  ward: { id: "ward", ja: "結界", cost: "術者の集中（長時間）", risk: 0.015, weight: 2 },
  farsight: { id: "farsight", ja: "遠見", cost: "術者の正気", risk: 0.03, weight: 2 },
  beastbond: { id: "beastbond", ja: "獣使い", cost: "術者の体力", risk: 0.02, weight: 1.5 },
  storm: { id: "storm", ja: "天候の操作", cost: "術者の寿命", risk: 0.07, weight: 1 },
});
export const INSTITUTIONS = Object.freeze({ academy: { ja: "魔術学院", effect: "技術の進捗 最大+10%" }, military: { ja: "魔導兵団", effect: "軍事力 最大+15%" }, temple: { ja: "神殿", effect: "安定度の目標 最大+0.04" } });
export const CAPS = Object.freeze({ mil: 0.15, tech: 0.1, stab: 0.04, supplyFull: 6, instCost: 60, minPersons: 2 });
const BASE_RATE = 1.2e-9, ORG_MIN = 3;
export const emptyMagic = () => ({ orgs: {}, living: [] });
const living = (civ) => (civ.magic.living ??= Object.keys(civ.persons).filter((i) => civ.persons[i].diedAt == null)); // 存命の人物ID（死者は含めない。全人物を毎回走査しない）
const kill = (civ, p, mi) => { p.diedAt = mi; civ.magic.living = living(civ).filter((i) => i !== p.id); };

/** 国家内の存命の素質者（寛容度が低い国では定着しない＝数えない） */
export function supplyOf(civ, st, groups) {
  if (st.policy.tolerance < 0.2) return { n: 0, power: 0, ids: [] }; const gset = new Set(groups.map((g) => g.id)), ids = []; let sum = 0;
  for (const id of living(civ)) { const p = civ.persons[id]; if (gset.has(p.groupId)) { ids.push(id); sum += p.power; } }
  return { n: ids.length, power: ids.length ? Math.min(1, ids.length / CAPS.supplyFull) * (sum / ids.length) : 0, ids };
}
const pickAbility = (rng) => { const l = Object.values(ABILITIES), t = l.reduce((s, a) => s + a.weight, 0); let r = rng() * t; for (const a of l) { r -= a.weight; if (r <= 0) return a; } return l[0]; };

/** culture フェーズ（3か月ごと）: 素質者の誕生・事件・差別・組織・権力争い・制度の効果と反動、寿命 */
export function stepMagic(ctx) {
  const { civ, ids, rng } = ctx, mi = civ.monthIndex; if (mi % 3 !== 0) return; const rate = civ.options.magicRate ?? 1;
  for (const gid in civ.groups) { // 1) 先天的な素質者が現れる（ごく稀）
    const g = civ.groups[gid], d = dominant(g), sp = speciesOf(d.speciesId); if (rng() >= g.pop * 3 * BASE_RATE * (sp.magic / 0.002) * rate) continue;
    const ab = pickAbility(rng), pid = ids.next("person"), age = (14 + Math.floor(rng() * 16)) * 12, p = { id: pid, name: makeNameJa(rng), speciesId: sp.id, groupId: gid, bornAt: mi - age, diedAt: null, ability: ab.id, power: Math.round(Math.pow(rng(), 1.5) * 100) / 100 + 0.05, emergedAt: mi, orgId: null }; p.power = Math.min(1, p.power); civ.persons[pid] = p; living(civ).push(pid);
    const found = makeEvent(civ, ids, { kind: "magic_gifted_found", title: `${ab.ja}の素質を持つ者が現れた`, participants: [{ entityId: pid, role: "gifted" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, effects: [{ targetId: pid, property: "magic.power", before: null, after: p.power }] });
    const st = g.stateId ? civ.states[g.stateId] : null;
    if (rng() < 0.5) incident(ctx, g, p, ab, found);
    if (st && st.policy.tolerance < 0.35 && rng() < 0.4) { const was = d.tension; d.tension = Math.min(1, d.tension + 0.2); d.interest = "religious_freedom"; makeEvent(civ, ids, { kind: "magic_discrimination", title: `${ab.ja}の素質者が、${st.name}で迫害された`, participants: [{ entityId: pid, role: "victim" }, { entityId: st.id, role: "state" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "strong" }], effects: [{ targetId: gid, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(d.tension * 100) / 100 }] }); }
  }
  if (mi % 12 === 0) yearly(ctx); if (mi % 12 === 3) institutions(ctx);
}
function incident(ctx, g, p, ab, found) {
  const { civ, ids } = ctx, before = Math.round(g.pop); let delta = 0, title;
  if (ab.id === "healing") { delta = g.pop * 0.02; title = "癒し手が疫病を鎮めた"; } else if (ab.id === "flame") { delta = -g.pop * 0.01 * p.power; title = "炎術が暴走し、集落を焼いた"; } else if (ab.id === "storm") { delta = g.pop * 0.01; title = "雨乞いが成功し、収穫が持ち直した"; } else if (ab.id === "farsight") { title = "遠見の者が災いを予言した"; } else if (ab.id === "ward") { title = "結界が集落を守った"; } else { title = "獣使いが野獣を従えた"; }
  g.pop = Math.max(5, g.pop + delta);
  makeEvent(civ, ids, { kind: "magic_incident", title, participants: [{ entityId: p.id, role: "gifted" }, { entityId: g.id, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "direct" }], effects: delta ? [{ targetId: g.id, property: "pop", before, after: Math.round(g.pop) }] : [] });
}
function yearly(ctx) {
  const { civ, ids, rng } = ctx, mi = civ.monthIndex, groups = byState(ctx);
  for (const id of [...living(civ)]) { const p = civ.persons[id]; const life = speciesOf(p.speciesId).lifespan * (0.8 + 0.4 * ((hashSeed(id) % 100) / 100)); if (mi - p.bornAt > life) { kill(civ, p, mi); if (p.power > 0.8) makeEvent(civ, ids, { kind: "magic_gifted_died", title: `強大な${ABILITIES[p.ability].ja}の使い手が世を去った`, participants: [{ entityId: id, role: "gifted" }], location: null }); } }
  for (const sid in civ.states) { // 2) 組織の結成・権力争い
    const st = civ.states[sid]; if (!st.alive) continue; const sup = supplyOf(civ, st, groups.get(sid) ?? []);
    let org = Object.values(civ.magic.orgs).find((o) => o.stateId === sid && o.endedAt == null);
    if (!org && sup.n >= ORG_MIN) { const oid = ids.next("org"), kind = st.policy.tolerance < 0.4 ? "秘密結社" : st.techAdopted.writing != null ? "学び舎" : "術者の集い"; org = civ.magic.orgs[oid] = { id: oid, name: makeNameJa(rng) + (kind === "学び舎" ? "の学び舎" : kind === "秘密結社" ? "の結社" : "の集い"), kind, stateId: sid, foundedAt: mi, endedAt: null, members: sup.ids.slice() }; for (const m of sup.ids) civ.persons[m].orgId = oid; makeEvent(civ, ids, { kind: "magic_org_founded", title: `${org.name}（${kind}）が結ばれた`, participants: [{ entityId: oid, role: "organization" }, { entityId: sid, role: "state" }, ...sup.ids.slice(0, 3).map((m) => ({ entityId: m, role: "member" }))], location: null }); }
    else if (org) { org.members = sup.ids.slice(); for (const m of sup.ids) civ.persons[m].orgId = org.id; if (!sup.n) org.endedAt = mi; }
    if (org && org.endedAt == null && st.stability < 0.4 && !st.magic && rng() < 0.15) { st.stability = Math.max(0, st.stability - 0.03); makeEvent(civ, ids, { kind: "magic_power_struggle", title: `${org.name}が政治への発言力を求めた`, participants: [{ entityId: org.id, role: "organization" }, { entityId: sid, role: "state" }], location: null, causes: asCauses(recentEventsFor(civ, [sid], ["instability", "demand_raised"], 36, 1), "reaction_to", "plausible"), effects: [{ targetId: sid, property: "stability", before: null, after: Math.round(st.stability * 1000) / 1000 }] }); }
  }
}
function institutions(ctx) { // 3) 制度の効果（供給で頭打ち）と反動
  const { civ, ids, rng } = ctx, groups = byState(ctx);
  for (const sid in civ.states) { const st = civ.states[sid]; if (!st.alive || !st.magic) continue; const sup = supplyOf(civ, st, groups.get(sid) ?? []); st.magic.power = Math.round(sup.power * 1000) / 1000;
    const risk = sup.ids.reduce((s, i) => s + ABILITIES[civ.persons[i].ability].risk, 0) * 0.15 * (st.magic.kind === "military" ? 1.5 : 1);
    if (sup.n && rng() < Math.min(0.2, risk)) { const b = st.stability; st.stability = Math.max(0, st.stability - 0.05); const victim = civ.persons[sup.ids[Math.floor(rng() * sup.ids.length)]]; if (victim.power > 0.6) kill(civ, victim, civ.monthIndex); makeEvent(civ, ids, { kind: "magic_backlash", title: `${st.name}の${INSTITUTIONS[st.magic.kind].ja}で魔術が暴発した`, participants: [{ entityId: sid, role: "state" }, { entityId: victim.id, role: "gifted" }], location: null, effects: [{ targetId: sid, property: "stability", before: Math.round(b * 1000) / 1000, after: Math.round(st.stability * 1000) / 1000 }] }); }
  }
}
/** 行動 magic_institution（actions.js から使う）。候補: 国内に素質者が 2 人以上・財政が足りる・行政か文字・寛容度が最低限 */
export function institutionCandidates(ctx, st, e, cand, bad) {
  if (st.magic) return [bad("magic_institution", "すでに魔法制度がある")];
  const sup = supplyOf(ctx.civ, st, e.gs); if (sup.n < CAPS.minPersons) return [bad("magic_institution", `素質者が足りない（${CAPS.minPersons}人以上。現在${sup.n}人）`)];
  if (st.techAdopted.writing == null && st.techAdopted.administration == null) return [bad("magic_institution", "文字か行政の技術が必要")]; if (st.treasury < CAPS.instCost) return [bad("magic_institution", "財政が足りない")];
  return Object.keys(INSTITUTIONS).map((k) => cand("magic_institution", k === "academy" ? { tech: 0.5, prestige: 0.2 } : k === "military" ? { security: 0.45, expansion: 0.25, stability: -0.1 } : { stability: 0.4, culture: 0.3 }, { opt: k, label: INSTITUTIONS[k].ja }));
}
export function institutionExecute(ctx, st, c) {
  const k = c.opt; if (!INSTITUTIONS[k]) return { ok: false, error: "未知の制度" }; if (st.magic) return { ok: false, error: "すでに魔法制度がある" }; const sup = supplyOf(ctx.civ, st, byState(ctx).get(st.id) ?? []); if (sup.n < CAPS.minPersons) return { ok: false, error: "素質者が足りない" }; if (st.treasury < CAPS.instCost) return { ok: false, error: "財政が足りない" };
  st.treasury -= CAPS.instCost; const org = Object.values(ctx.civ.magic.orgs).find((o) => o.stateId === st.id && o.endedAt == null); st.magic = { kind: k, foundedAt: ctx.civ.monthIndex, orgId: org?.id ?? null, power: Math.round(sup.power * 1000) / 1000 };
  return { ok: true, effects: [{ targetId: st.id, property: "magic.institution", before: null, after: k }], title: `${INSTITUTIONS[k].ja}を創設`, targetId: org?.id ?? null };
}
/** 国家の魔法による効果量（上限つき） */
export const magicMil = (st) => (st.magic?.kind === "military" ? CAPS.mil * st.magic.power : 0);
export const magicTech = (st) => (st.magic?.kind === "academy" ? CAPS.tech * st.magic.power : 0);
export const magicStab = (st) => (st.magic?.kind === "temple" ? CAPS.stab * st.magic.power : 0);
