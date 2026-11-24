// v7.0.0 命令（追加）。commands.js の末尾の別ブロックから registerWarCommands を呼ぶ。docs/WAR_API.md の契約どおり。
//   war.declare／war.setStance／war.setPlan／war.predict／war.view／peace.propose／peace.accept／peace.reject／peace.predict／conference.bid／conference.retract／conference.finish
//   surrender.accept／surrender.resist／surrender.counter／alliance.create／invite／leave／expel／transferLead／setObligation／respondCall／capital.move
import { treatyBetween, atWarWith, declareWar } from "../civ/diplomacy.js";
import { negotiatePeace } from "./negotiation.js";
import { resolveDecision } from "./decisions.js";
import { directWar } from "./warfare.js";
import { setOrder } from "./corps.js";
import { moveCapitalTo } from "../civ/settlements.js";
import { validateGoals, warView, ensureWarV7, capitulate, surrenderRec, otherSide, sideOf, GOAL_KINDS } from "./war-core.js";
import { bid, retract, finishConference, predictPeace, predictWar, conferenceView } from "./war-peace.js";
import { createAlliance, inviteMember, leaveAlliance, transferLead, setObligation, alliancesOf, allianceAccepts, pendingCall, ALLIANCE_KINDS } from "./war-alliance.js";

const REASON_OF = { annex: "unification", territory: "conquest", subjugate: "subjugation", liberate: "independence", throne: "succession", religion: "religion", reparations: "revenge" };
const pendingOf = (civ, kind, pred) => (civ.wcde?.decisions?.queue ?? []).find((d) => d.kind === kind && pred(d)) ?? null;
const who = (w, c) => c.stateId ?? w.civ.wcde.control?.stateId ?? null;

export function registerWarCommands(defineCommand, A) {
  const P = [A.PLAYER], PQ = [A.PLAYER, A.ADMIN, A.CREATOR];
  // ---- 戦争
  defineCommand("war.declare", { authorities: P, control: true, apply: (w, c) => { const { civ } = w, ctx = w.sim.ctx, atk = civ.states[c.stateId], def = civ.states[c.target];
    if (!atk?.alive || !def?.alive || atk.id === def.id) return { ok: false, error: "宣戦する相手が見つかりません" }; if (atWarWith(civ, atk, def)) return { ok: false, error: "すでに交戦中です" };
    if (treatyBetween(civ, atk, def, "nonaggression")) return { ok: false, error: "不可侵条約があります（破棄してから宣戦してください）" }; if (treatyBetween(civ, atk, def, "alliance") || treatyBetween(civ, atk, def, "defensive")) return { ok: false, error: "同盟国には宣戦できません" };
    const g = validateGoals(civ, atk, def, c.goals ?? []); if (!g.ok) return g; const reason = g.goals[0] ? REASON_OF[g.goals[0].kind] : "conquest";
    const war = declareWar(ctx, atk, def, { reason, goals: g.goals, provenance: "player" }); return { ok: true, result: { warId: war.id, goals: war.goals } }; } });
  defineCommand("war.setStance", { authorities: P, control: true, apply: (w, c) => { const st = w.civ.states[c.stateId], war = w.civ.wars[c.warId]; if (!st?.alive || !war) return { ok: false, error: "戦争がありません" }; const r = directWar(w.sim.ctx, st, war, { posture: c.posture ?? null, commit: c.commit ?? null, focus: c.focus }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  // 戦域（軍集団）ごとの司令官と方針、戦線と矢印。矢印の from → to の命令は、その戦線の軍団への行軍の命令になる
  defineCommand("war.setPlan", { authorities: P, control: true, apply: (w, c) => { const { civ } = w, ctx = w.sim.ctx, st = civ.states[c.stateId], war = civ.wars[c.warId]; if (!st?.alive || !war || war.status !== "active") return { ok: false, error: "進行中の戦争がありません" }; ensureWarV7(war);
    if (!sideOf(war, st.id)) return { ok: false, error: "参戦していません" }; const plan = c.plan ?? {}, stance = plan.stance ?? "balanced"; if (!["offensive", "balanced", "defensive"].includes(stance)) return { ok: false, error: "方針は offensive / balanced / defensive" };
    const armies = [...new Set(c.armies ?? [])], corps = st.corps?.list ?? st.corps?.items ?? null; const have = (id) => (Array.isArray(st.corps?.units) ? st.corps.units : Object.values(st.corps ?? {}).flat?.() ?? []).some?.((x) => x?.id === id); void corps; void have;
    const arrows = (plan.arrows ?? []).map((a) => ({ from: a.from ?? null, to: a.to, kind: a.kind ?? "march" })).filter((a) => civ.groups[a.to]), line = (plan.line ?? []).filter((g) => civ.groups[g]);
    const f = { theater: c.theater ?? "main", stateId: st.id, armies, commander: c.commander ?? null, plan: { stance, line, arrows } }; const i = war.fronts.findIndex((x) => x.theater === f.theater && x.stateId === st.id); if (i >= 0) war.fronts[i] = f; else war.fronts.push(f);
    let ordered = 0; for (const a of arrows) for (const id of armies) { const r = setOrder(ctx, st, { corpsId: id, kind: a.kind === "siege" ? "siege" : "march", targetGroupId: a.to, warId: war.id }); if (r?.ok) ordered++; }
    if (c.posture !== undefined || stance) directWar(ctx, st, war, { posture: stance, commit: null, focus: c.focus }); return { ok: true, result: { front: f, ordered } }; } });
  defineCommand("war.predict", { authorities: PQ, mutates: false, phases: ["running"], apply: (w, c) => { const r = predictWar(w.sim.ctx, who(w, c), c.target, c.goals ?? []); return r.ok ? { ok: true, result: r } : r; } });
  defineCommand("war.view", { authorities: PQ, mutates: false, phases: ["running"], apply: (w, c) => { const war = w.civ.wars[c.warId]; if (!war) return { ok: false, error: "戦争がありません" }; const v = warView(w.civ, war); v.conference = conferenceView(w.sim.ctx, war); return { ok: true, result: v }; } });
  // ---- 講和
  defineCommand("peace.propose", { authorities: P, control: true, apply: (w, c) => { const st = w.civ.states[c.stateId], war = w.civ.wars[c.warId]; if (!st?.alive || !war) return { ok: false, error: "戦争がありません" }; const r = negotiatePeace(w.sim.ctx, st, war, { terms: c.terms ?? { kind: "white" }, withId: c.withId }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  const answerPeace = (opt) => (w, c) => { const d = pendingOf(w.civ, "peace_offer", (x) => x.payload.warId === c.warId && x.stateId === c.stateId); if (!d) return { ok: false, error: "答える講和の申し出がありません" }; const r = resolveDecision(w, { id: d.id, option: opt }); return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error }; };
  defineCommand("peace.accept", { authorities: P, control: true, apply: answerPeace("accept") }); defineCommand("peace.reject", { authorities: P, control: true, apply: answerPeace("reject") });
  defineCommand("peace.predict", { authorities: PQ, mutates: false, phases: ["running"], apply: (w, c) => { const r = predictPeace(w.sim.ctx, c.warId, who(w, c), c.terms ?? {}); return r.ok ? { ok: true, result: r } : r; } });
  // ---- 講和会議
  defineCommand("conference.bid", { authorities: P, control: true, apply: (w, c) => { const war = w.civ.wars[c.warId]; if (!war) return { ok: false, error: "戦争がありません" }; const r = bid(w.sim.ctx, war, c.stateId, c.demand ?? {}); return r.ok ? { ok: true, result: r } : r; } });
  defineCommand("conference.retract", { authorities: P, control: true, apply: (w, c) => { const war = w.civ.wars[c.warId]; if (!war) return { ok: false, error: "戦争がありません" }; const r = retract(w.sim.ctx, war, c.stateId, c.seq); return r.ok ? { ok: true, result: r } : r; } });
  defineCommand("conference.finish", { authorities: P, control: true, apply: (w, c) => { const war = w.civ.wars[c.warId]; if (!war || war.phase !== "conference") return { ok: false, error: "いま講和会議は開かれていません" }; const d = pendingOf(w.civ, "conference", (x) => x.payload.warId === war.id && x.stateId === c.stateId); if (d) { const r = resolveDecision(w, { id: d.id, option: "finish" }); return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error }; } finishConference(w.sim.ctx, war); return { ok: true, result: {} }; } });
  // ---- 降伏（担当国）。打診の決断に答える。打診がなければ、自発的な降伏（accept）だけできる
  const surr = (opt) => (w, c) => { const { civ } = w, ctx = w.sim.ctx, war = civ.wars[c.warId], st = civ.states[c.stateId]; if (!war || war.status !== "active" || !st?.alive || !sideOf(war, st.id)) return { ok: false, error: "進行中の戦争の参戦国ではありません" };
    const d = pendingOf(civ, "surrender_call", (x) => x.payload.warId === war.id && x.stateId === st.id); if (d) { const r = resolveDecision(w, { id: d.id, option: opt }); return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error }; }
    if (opt === "accept") { if (surrenderRec(war, st.id).capitulated) return { ok: false, error: "すでに降伏しています" }; capitulate(ctx, war, st); return { ok: true, result: {} }; }
    if (opt === "counter") { const r = negotiatePeace(ctx, st, war, { terms: { kind: "white" } }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } return { ok: false, error: "降伏の打診は来ていません" }; };
  defineCommand("surrender.accept", { authorities: P, control: true, apply: surr("accept") }); defineCommand("surrender.resist", { authorities: P, control: true, apply: surr("resist") }); defineCommand("surrender.counter", { authorities: P, control: true, apply: surr("counter") });
  // ---- 同盟
  const me = (w, c) => { const st = w.civ.states[c.stateId]; return st?.alive && st.player ? st : null; };
  const al = (w, c) => { const a = alliancesOf(w.civ).items[c.allianceId]; return a?.active ? a : null; };
  defineCommand("alliance.create", { authorities: P, control: true, apply: (w, c) => { const ctx = w.sim.ctx, civ = w.civ, st = me(w, c); if (!st) return { ok: false, error: "担当国ではありません" }; if (!ALLIANCE_KINDS[c.kind]) return { ok: false, error: "同盟の種類が不明です" };
    const probe = { kind: c.kind, enemy: c.enemy ?? null, leaderId: st.id, members: [st.id] }, asked = [...new Set(c.members ?? [])].filter((i) => i !== st.id && civ.states[i]?.alive && i !== c.enemy), res = asked.map((i) => ({ id: i, ...allianceAccepts(ctx, civ.states[i], probe, st) })), ok = res.filter((r) => r.ok).map((r) => r.id);
    if (!ok.length) return { ok: false, error: `応じた国がありません（${res.map((r) => `${civ.states[r.id].name}は${r.why}`).slice(0, 3).join("、") || "—"}）` };
    const r = createAlliance(ctx, { kind: c.kind, leaderId: st.id, memberIds: ok, name: c.name ?? null, obligation: c.obligation ?? null, enemy: c.enemy ?? null, provenance: "player" }); return r.ok ? { ok: true, result: { allianceId: r.alliance.id, members: r.alliance.members } } : r; } });
  defineCommand("alliance.invite", { authorities: P, control: true, apply: (w, c) => { const a = al(w, c), st = me(w, c), t = w.civ.states[c.target]; if (!a || !st || a.leaderId !== st.id) return { ok: false, error: "盟主の同盟が見つかりません" }; if (!t?.alive) return { ok: false, error: "相手が見つかりません" }; const r = inviteMember(w.sim.ctx, a, t, { by: st.id }); return r.ok ? { ok: true, result: {} } : r; } });
  defineCommand("alliance.leave", { authorities: P, control: true, apply: (w, c) => { const a = al(w, c), st = me(w, c); if (!a || !st) return { ok: false, error: "同盟が見つかりません" }; const r = leaveAlliance(w.sim.ctx, a, st); return r.ok ? { ok: true, result: r } : r; } });
  defineCommand("alliance.expel", { authorities: P, control: true, apply: (w, c) => { const a = al(w, c), st = me(w, c), t = w.civ.states[c.target]; if (!a || !st || a.leaderId !== st.id) return { ok: false, error: "盟主の同盟が見つかりません" }; if (!t || t.id === st.id) return { ok: false, error: "除名できない相手です" }; const r = leaveAlliance(w.sim.ctx, a, t, { why: "除名された", expelledBy: st.id }); return r.ok ? { ok: true, result: r } : r; } });
  defineCommand("alliance.transferLead", { authorities: P, control: true, apply: (w, c) => { const a = al(w, c), st = me(w, c); if (!a || !st || a.leaderId !== st.id) return { ok: false, error: "盟主の同盟が見つかりません" }; const r = transferLead(w.sim.ctx, a, c.target); return r.ok ? { ok: true, result: {} } : r; } });
  defineCommand("alliance.setObligation", { authorities: P, control: true, apply: (w, c) => { const a = al(w, c), st = me(w, c); if (!a || !st) return { ok: false, error: "同盟が見つかりません" }; if (c.memberId ? c.memberId !== st.id && a.leaderId !== st.id : a.leaderId !== st.id) return { ok: false, error: "義務の強さを決められるのは、盟主（全体）か本人（自国の分）だけです" }; const r = setObligation(w.sim.ctx, a, c.obligation, c.memberId ?? null); return r.ok ? { ok: true, result: {} } : r; } });
  defineCommand("alliance.respondCall", { authorities: P, control: true, apply: (w, c) => { const d = pendingCall(w.civ, c.warId, c.stateId); if (!d) return { ok: false, error: "答える参戦要請がありません" }; if (!["join", "decline", "mediate"].includes(c.choice)) return { ok: false, error: "choice は join / decline / mediate" }; const r = resolveDecision(w, { id: d.id, option: c.choice === "decline" ? "refuse" : c.choice }); return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error }; } });
  // ---- 遷都（都市生成の settlement と state.capitalSettlementId を使う）
  defineCommand("capital.move", { authorities: [A.PLAYER, A.CREATOR], control: true, apply: (w, c) => { const { civ } = w, st = civ.states[c.stateId], s = civ.settlements[c.settlementId]; if (!st?.alive) return { ok: false, error: "国が存在しません" }; if (!s) return { ok: false, error: "その集落はありません" }; const g = civ.groups[s.groupId]; if (!g || g.stateId !== st.id) return { ok: false, error: "自国の領土の集落でなければ遷都できません" }; if (Object.values(civ.wars).some((x) => x.status === "active" && x.phase === "active" && (x.occupied ?? []).includes(g.id))) return { ok: false, error: "占領されている土地へは遷都できません" };
    if (st.capitalSettlementId === s.id) return { ok: false, error: "すでに首都です" }; st.capitalGroupId = g.id; st.capitalSettlementId = s.id; st.stability = Math.max(0, st.stability - 0.04); st.interpDirty = true; const r = moveCapitalTo(w.sim.ctx, st, g); st.capitalSettlementId = s.id; void r; return { ok: true, result: { capitalSettlementId: s.id } }; } });
  void GOAL_KINDS; void otherSide;
}
