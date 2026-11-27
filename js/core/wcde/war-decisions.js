// v7.0.0 W1/W3: 戦争の決断（担当国に回す）。降伏の打診・講和会議・講和条件の確認・停戦の申し出。
//   決断は既存の決断キュー（decisions.js の raise／resolveDecision）に載り、時間は回答まで止まる。命令 decision.resolve で答える（surrender.* ／ conference.* の命令も同じ処理を呼ぶ）。
import { registerDecision } from "./decisions.js";
import { hashSeed } from "../civ/civ-state.js";
import { negotiatePeace, peaceWorthProposing } from "./negotiation.js";
import { capitulate, surrenderRec, leaderOf, otherSide, wlog } from "./war-core.js";
import { finishConference, autoDemands } from "./war-peace.js";
import { registerAllianceDecisions } from "./war-alliance.js";


/** 担当国が絡む戦争で、AI の主たる交戦国が「停戦したい」と評価するとき、停戦の申し出（peace_offer の決断）を担当国へ出す（半年に 1 度まで） */
export function offerCeasefires(ctx, w) {
  const civ = ctx.civ, mi = civ.monthIndex; if (mi - w.startedAt < 12 || mi % 6 !== hashSeed(w.id, "cf") % 6) return;
  for (const side of ["a", "d"]) for (const id of w.sides[side]) {
    const P = civ.states[id]; if (!P?.alive || !P.player) continue; const foe = civ.states[leaderOf(w, otherSide(side))]; if (!foe?.alive || foe.player || !foe.warIds.includes(w.id)) continue;
    if (peaceWorthProposing(civ, foe, w)) negotiatePeace(ctx, foe, w, { terms: { kind: "white" }, withId: P.id });
  }
}

export function registerWarDecisions() {
  registerAllianceDecisions();
  registerDecision("surrender_call", (ctx, d, opt) => {
    const { civ } = ctx, p = d.payload, w = civ.wars[p.warId], st = civ.states[p.state]; if (!w || w.status !== "active" || !st?.alive) return { ok: true, note: "戦争はすでに終わっていた" }; const rec = surrenderRec(w, st.id);
    if (opt === "accept") { capitulate(ctx, w, st, rec); return { ok: true, note: "降伏を受け入れた。講和会議が開かれる" }; }
    if (opt === "resist") { rec.resist = 1; rec.pending = null; rec.askedAt = civ.monthIndex; wlog(ctx, w, "resist", `${st.name}は抗戦を選んだ（民意と兵力が削られる）`); return { ok: true, note: "抗戦する（降伏までの進みは保たれ、民意と兵力が毎月削られる）" }; }
    rec.pending = null; rec.askedAt = civ.monthIndex; const r = negotiatePeace(ctx, st, w, { terms: { kind: "white" } }); return { ok: true, note: r.ok ? "逆提案が受け入れられ、戦争が終わった" : `逆提案は拒まれた（${r.error ?? "—"}）。3 か月後に再び降伏を迫られる` };
  });
  registerDecision("conference", (ctx, d, opt) => {
    const { civ } = ctx, p = d.payload, w = civ.wars[p.warId]; if (!w || w.phase !== "conference" || !w.conf) return { ok: true, note: "会議はすでに終わっていた" }; const C = w.conf;
    if (opt === "manual") return { ok: true, keep: true, step: "manual" };
    if (opt === "auto") { const mine = C.bids.filter((b) => b.by === p.state); if (!mine.length) for (const x of autoDemands(ctx, w, p.state, C.scores[p.state] ?? 0, C.loserSide)) C.bids.push({ ...x, seq: ++C.seq }); }
    finishConference(ctx, w); return { ok: true, note: "講和が結ばれた" };
  });
  registerDecision("peace_terms", (ctx, d) => { const { civ } = ctx, w = civ.wars[d.payload.warId]; if (w && w.phase === "conference") finishConference(ctx, w); return { ok: true, note: "条件をのみ、講和が結ばれた" }; });
}
