// v7.2.0: 政体の「局面」（前兆→危機の決断→決着）・選挙・新しい 3 つの数値。旧版の年 1 回の確率判定をやめたことの検査。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { igniteArc, stepTransitions, arcOptions, metricsOf, situationOf, BLOCS } from "../js/core/wcde/transition.js";
import { regimeOf } from "../js/core/wcde/regimes.js";
import { pendingOf, decisionsOf } from "../js/core/wcde/decision-state.js";
import { stepRegimeEvolution } from "../js/core/wcde/regime-evolution.js";
import { DECISION_HOOKS } from "../js/core/wcde/decisions.js";
import { lawOf } from "../js/core/wcde/succession.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const { w: w0 } = createNewWorld({ worldSeed: "v720-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } });
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 600 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const toQuarter = (civ) => { civ.monthIndex += (3 - (civ.monthIndex % 3)) % 3; };
const kinds = (civ, k) => civ.events.filter((e) => e.kind === k);

console.log("=== 数値 ===");
await check("3 つの数値（不満・改革の機運・軍の台頭）が、すべての国で 0〜1 に収まる", () => {
  const w = fresh(), ctx = w.sim.ctx; assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 24 }).ok);
  let n = 0; for (const st of alive(w)) { const M = metricsOf(st); for (const k of ["unrest", "reformMood", "militaryRise"]) { assert.ok(M[k] >= 0 && M[k] <= 1, `${st.name} ${k}=${M[k]}`); } n++; } assert.ok(n >= 3); void ctx;
});
await check("旧い年 1 回の政体判定は止まっている（呼んでも何も起きない）", () => { const w = fresh(), ctx = w.sim.ctx, before = JSON.stringify(alive(w).map((s) => regimeOf(s))); stepRegimeEvolution(ctx); assert.equal(JSON.stringify(alive(w).map((s) => regimeOf(s))), before); });

console.log("=== 局面（アルゴリズム国家）===");
await check("前兆 → 危機 → 決着の順に、原因つきで残る。前兆の出来事が政体変更の原因になる", () => {
  const w = fresh(), ctx = w.sim.ctx, civ = w.civ, st = alive(w).find((s) => regimeOf(s) === "elder_council" || regimeOf(s) === "chiefs_league") ?? alive(w)[0], from = regimeOf(st);
  const to = from === "elder_council" ? "chiefs_league" : "elder_council"; st.politics.unrest = 0.9; st.politics.factions.commoners.support = 0.1;
  const a = igniteArc(ctx, st, { kind: "revolution", to, delay: 3 }); assert.ok(a && st.arc.stage === "omen"); assert.equal(kinds(civ, "regime_omen").length >= 1, true);
  civ.monthIndex = a.crisisAt; toQuarter(civ); stepTransitions(ctx); // 危機（AI は自動で選ぶ）
  assert.equal(st.arc, null, "決着している"); const res = [...kinds(civ, "regime_arc_result"), ...kinds(civ, "regime_change")].filter((e) => e.causes?.length);
  assert.ok(res.length >= 1, "決着の出来事は、前兆（または直前の出来事）を原因に持つ");
});
await check("前兆のあと条件が消えれば、局面は自然に消える（何も変わらない）", () => {
  const w = fresh(), ctx = w.sim.ctx, civ = w.civ, st = alive(w)[0], from = regimeOf(st); st.politics.unrest = 0.9; st.politics.factions.commoners.support = 0.1;
  const a = igniteArc(ctx, st, { kind: "revolution", to: from === "elder_council" ? "chiefs_league" : "elder_council", delay: 30 }); assert.ok(a);
  st.politics.unrest = 0.1; for (const f of Object.values(st.politics.factions)) f.support = 0.9; st.stability = 0.9; st.treasury = 1e6; st.warIds = []; st.politics.fatigue = 0;
  civ.monthIndex = a.startAt + 6; toQuarter(civ); stepTransitions(ctx); assert.equal(st.arc, null); assert.equal(regimeOf(st), from); assert.ok(kinds(civ, "regime_arc_result").some((e) => e.facts?.defused));
});

console.log("=== 局面（担当国の誘導）===");
await check("担当国が政体を変えようとしても、その場では変わらない（局面が始まる）。続けて始めることもできない", () => {
  const w = fresh(), civ = w.civ, st = alive(w)[0]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: st.id }).ok);
  const ctx = w.sim.ctx, from = regimeOf(st), opts = (ctx.civ && null); void opts;
  const to = from === "elder_council" ? "chiefs_league" : from === "chiefs_league" ? "elder_council" : null; if (!to) return;
  const r = dispatch(w, { type: "state.setRegime", authority: A.PLAYER, regime: to }); if (!r.ok) return; assert.equal(regimeOf(st), from, "その場では変わらない"); assert.ok(st.arc && st.arc.by === "player");
  const r2 = dispatch(w, { type: "state.setRegime", authority: A.PLAYER, regime: to }); assert.equal(r2.ok, false);
});
await check("危機で決断が出る。選択肢は成功の見込みつきで、失敗もある（同じ選択でも結果が分かれる）", () => {
  let win = 0, lose = 0, shown = 0;
  for (let t = 0; t < 60; t++) {
    const w = fresh(), civ = w.civ, ctx = w.sim.ctx, st = alive(w)[0]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: st.id }).ok); decisionsOf(civ).live = true;
    const from = regimeOf(st), to = from === "elder_council" ? "chiefs_league" : "elder_council"; civ.monthIndex += t; const a = igniteArc(ctx, st, { kind: "reform", to, by: "player", delay: 1 }); if (!a) continue; a.id += t * 7;
    civ.monthIndex = a.crisisAt; toQuarter(civ); stepTransitions(ctx); const d = pendingOf(civ).find((x) => x.kind === "transition"); assert.ok(d, "決断が出る"); shown++;
    assert.deepEqual(d.options.map((o) => o.id), ["legal", "mobilize", "force", "withdraw"]); assert.ok(d.options.every((o) => o.hint && o.hint.length > 4));
    const r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option: "mobilize" }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(st.arc, null);
    if (regimeOf(st) === to) win++; else lose++;
  }
  assert.ok(shown >= 30 && win > 0 && lose > 0, `勝ち ${win} 負け ${lose}（どちらも起きる）`);
});

console.log("=== 選挙（どの勢力が勝つか誘導する）===");
await check("選挙: 後押しした勢力は勝ちやすくなるが、必ず勝つわけではない。結果は年表に残り、勝者が国の「与党」と思想になる", () => {
  const w = fresh(), civ = w.civ, ctx = w.sim.ctx, st = alive(w)[0]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: st.id }).ok); decisionsOf(civ).live = true;
  st.polity = "republic"; st.regime = "parliamentary_republic"; assert.equal(regimeOf(st), "parliamentary_republic");
  const P0 = JSON.parse(JSON.stringify(st.politics)); for (const k of Object.keys(P0.factions)) { P0.factions[k].support = 0.5; P0.factions[k].influence = 1 / Object.keys(P0.factions).length; } P0.unrest = 0.2;
  const run = (backWeakest, t) => {
    st.politics = JSON.parse(JSON.stringify(P0)); st.treasury = 1e7; st.stability = 0.6; st.arc = null; st.shocks = []; civ.wcde.decisions.queue = [];
    const a = igniteArc(ctx, st, { kind: "election", delay: 1 }); a.id = 1000 + t; civ.monthIndex += 3; a.crisisAt = civ.monthIndex; toQuarter(civ); stepTransitions(ctx);
    const d = pendingOf(civ).find((x) => x.kind === "transition"); assert.ok(d, "決断が出る"); const weakest = d.options.filter((o) => o.id.startsWith("back_")).map((o) => o.id).sort()[0];
    // 最も不利な勢力（勢いが最小）を探す: 選択肢の hint は文字なので、arcOptions の p で比べる
    const opts = arcOptions(ctx, st).filter((o) => o.bloc).sort((x, y) => x.p - y.p), target = opts[0];
    const r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option: backWeakest ? "back_" + target.bloc : "neutral" }); assert.ok(r.ok, JSON.stringify(r)); void weakest;
    return st.politics.ruling === target.bloc;
  };
  let back = 0, neutral = 0, N = 160; for (let t = 0; t < N; t++) { if (run(true, t)) back++; if (run(false, t + 5000)) neutral++; }
  assert.ok(back > neutral, `後押し ${back} 中立 ${neutral}`); assert.ok(back < N, "必ず勝つわけではない"); assert.ok(kinds(civ, "election_held").length >= 2 * N - 5);
  assert.ok(st.stateIdeology && Object.values(BLOCS).some((b) => b.ide === st.stateIdeology));
  console.log("      後押し勝率", (back / N).toFixed(2), "中立時", (neutral / N).toFixed(2));
});

console.log("=== 王の選出（選挙君主制で、推す候補が選ばれるよう誘導する）===");
await check("選挙・合議の継承では、推した候補が選ばれることも、別の候補が選ばれることもある。見込みが示される", () => {
  let hit = 0, miss = 0, hinted = 0, N = 50;
  for (let t = 0; t < N; t++) {
    const w = fresh(), civ = w.civ, ctx = w.sim.ctx, st = alive(w)[0]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: st.id }).ok); decisionsOf(civ).live = true;
    st.polity = "kingdom"; st.regime = "elective_monarchy"; st.succLaw = null; assert.equal(lawOf(civ, st), "elective"); civ.monthIndex += t;
    assert.ok(DECISION_HOOKS.succession(ctx, st, "die")); const d = pendingOf(civ).find((x) => x.kind === "succession"); assert.ok(d);
    if (d.options.some((o) => /見込み/.test(o.hint))) hinted++; const o = d.options.find((x) => d.payload[x.id]?.cand && !d.payload[x.id].partition); assert.ok(o);
    const name = d.payload[o.id].cand.name, r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option: o.id }); assert.ok(r.ok, JSON.stringify(r));
    if (st.leader.name.includes(name) || /選ばれ、即位/.test(r.result?.note ?? "")) hit++; else miss++;
  }
  assert.ok(hinted === N, `見込み表示 ${hinted}/${N}`); assert.ok(hit > 0 && miss > 0, `推した候補が選ばれた ${hit}／別の候補 ${miss}`);
  console.log("      推した候補が選ばれた", hit, "／選ばれなかった", miss);
});

console.log("=== 創造主の介入 ===");
await check("創造主が介入で「民衆の不満」を上げ、正統性を下げると、その国で革命の局面が起きやすくなる。介入なしの対照では起きにくい", () => {
  const run = (push) => { let hit = 0; for (let t = 0; t < 12; t++) { const w = fresh(), civ = w.civ, ctx = w.sim.ctx, st = alive(w)[0]; civ.monthIndex += t; st.arc = null; st.politics.arcEnd = -9999; st.politics.lastRegimeChange = -9999;
    if (push) { assert.ok(dispatch(w, { type: "creator.intervene", authority: A.CREATOR, stateId: st.id, field: "unrest", value: 0.95, halfLifeMonths: 60 }).ok); assert.ok(dispatch(w, { type: "creator.intervene", authority: A.CREATOR, stateId: st.id, field: "legitimacy", value: 0.15, halfLifeMonths: 60 }).ok); st.stability = 0.3; assert.ok(metricsOf(st, civ).unrest > 0.9); }
    for (let q = 0; q < 16 && !st.arc; q++) { civ.monthIndex += 3 - (civ.monthIndex % 3 || 3) + 3; stepTransitions(ctx); } if (st.arc && st.arc.kind === "revolution") hit++; } return hit; };
  const a = run(true), b = run(false); console.log("      介入あり 革命の前兆", a + "/12", "なし", b + "/12"); assert.ok(a >= 6 && a > b);
});

console.log("=== 経路の一本化 ===");
await check("長く走らせても、政体の変更はすべて「前兆」を経ている（突然の変更が 0）", () => {
  const w = fresh(); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1200 }).ok); const civ = w.civ;
  const omen = new Set(kinds(civ, "regime_omen").map((e) => e.eventId)), rc = kinds(civ, "regime_change");
  const viaArc = rc.filter((e) => (e.causes ?? []).some((c) => omen.has(c.targetId) || civ.events.some((x) => x.eventId === c.targetId && (x.kind === "regime_omen" || x.kind === "regime_arc_result"))));
  console.log(`      政体変更 ${rc.length} 件のうち前兆つき ${viaArc.length} 件／前兆 ${omen.size}／選挙 ${kinds(civ, "election_held").length}／消えた前兆 ${kinds(civ, "regime_arc_result").filter((e) => e.facts?.defused).length}`);
  assert.equal(rc.length, viaArc.length, "前兆のない政体変更がある");
});
console.log(failed ? `\n${failed} 件失敗` : "\n全部合格"); process.exit(failed ? 1 : 0);
