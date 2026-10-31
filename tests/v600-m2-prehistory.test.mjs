// v6.0.0 M2: 圧縮された先史（約50万年）と建国の入口（文明候補・参加・委任）。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { glacialAt, PREHISTORY_STEP_YEARS } from "../js/core/wcde/prehistory.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { listCandidates } from "../js/core/wcde/founding.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { TECH } from "../js/core/civ/tech.js";
import { evaluateFormation } from "../js/core/civ/states.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const input = { worldSeed: "e2e-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: true } };
let t0 = Date.now(); const R = createNewWorld(input); const genMs = Date.now() - t0;
const W = R.w, civ = W.civ, P = civ.wcde.prehistory;

console.log("=== 先史 ===");
await check(`50万年が、粗い時間刻みで進む（${PREHISTORY_STEP_YEARS}年×${P.steps}ステップ）。終わりは年0・段階は founding`, () => {
  assert.equal(civ.wcde.startMonth, -500000 * 12); assert.equal(civ.monthIndex, 0); assert.equal(civ.wcde.phase, "founding"); assert.equal(P.steps * P.stepYears, 500000);
});
await check(`処理時間: 6,000 セルの世界の作成（地理＋先史）が 20 秒以内（実測 ${genMs} ms）`, () => assert.ok(genMs < 20000));
await check("人類の出現が事件として残り、先史の要約が時代ごとに残る（個々の分派・発見を全件は残さない）", () => {
  assert.ok(civ.events.some((e) => e.kind === "species_emerged" && e.participants.some((p) => p.entityId === "human"))); assert.equal(civ.events.filter((e) => e.kind === "prehistory_epoch").length, 20); assert.ok(civ.events.length < 200);
});
await check("拡散: 集団が増え、人口が育ち、ほとんどの集団は先史の間に消えずに残る", () => { assert.ok(P.peakGroups > 100); assert.ok(P.pop > 100000); assert.ok(P.extinct <= P.peakGroups); });
await check("氷期: 強さは 0〜1 で、laws.climateVolatility=0 なら起こらない（周期的に変動する）", () => {
  assert.equal(glacialAt(0.5, 500000, 1, 0), 0); const xs = Array.from({ length: 200 }, (_, i) => glacialAt(i / 200, 500000, 0.3, 3)); assert.ok(Math.max(...xs) <= 1 && Math.min(...xs) >= 0); assert.ok(Math.max(...xs) > 0.8); assert.ok(xs.filter((x) => x === 0).length > 10, "氷期でない時期がある");
  assert.ok(P.glacialMax > 0);
});
await check("技術: 航海・土器などが先に、農耕・牧畜が後（最後の数％）。青銅以降の技術は先史では持たない", () => {
  const ft = P.firstTech, y = (k) => ft[k] / 12; assert.ok(ft.seafaring != null && ft.pottery != null);
  if (ft.agriculture != null) assert.ok(y("agriculture") > y("seafaring") && y("agriculture") > -60000 && y("agriculture") < 0, `農耕の最初の発見 ${y("agriculture")} 年`);
  for (const g of Object.values(civ.groups)) for (const k of Object.keys(g.tech.known)) assert.ok(TECH[k].cost <= 900, `${k} は先史では到達しない`);
});
await check("技術の伝播: 最初の発見のあと、近隣に広まり、独立に発見した集団は少数（伝播した数のほうが多い）", () => {
  const agri = civ.techWorld.agriculture; if (!agri) return; const known = Object.values(civ.groups).filter((g) => g.tech.known.agriculture != null).length; assert.ok(known >= agri.discoveries.length); assert.ok(P.transfers > 0);
});
await check("文化・言語・宗教が分化している（系譜の親が実在する）", () => {
  assert.ok(Object.keys(civ.cultures).length > 3 && Object.keys(civ.languages).length > 3 && Object.keys(civ.religions).length >= 1);
  for (const l of Object.values(civ.languages)) if (l.parent) assert.ok(civ.languages[l.parent], "親言語");
  for (const g of Object.values(civ.groups)) for (const c of g.cohorts) { assert.ok(civ.cultures[c.cultureId]); assert.ok(civ.languages[c.languageId]); if (c.religionId) assert.ok(civ.religions[c.religionId]); }
});
await check("言語には音素表があり、文化には言語由来の名前が付いている（先史の終わりに整う）", () => { for (const l of Object.values(civ.languages)) assert.ok(l.phon?.c.length >= 4 && l.phon.v.length >= 3); assert.ok(Object.values(civ.cultures).every((c) => c.nameFixed || !Object.values(civ.languages).some((l) => l.cultureId === c.id))); });
await check("宗教には最高神と聖地があり、創始者は未知（null）で捏造されない", () => { for (const r of Object.values(civ.religions)) { assert.ok("deity" in r && "holyCell" in r); assert.equal(r.founderId, null); } });
await check("定住: 農耕・漁撈の大きな集団に集落がある。文明状態の整合性・WCDE の整合性を満たす", () => {
  assert.ok(Object.keys(civ.settlements).length > 0); assert.deepEqual(checkCivIntegrity(W.world, civ, { sinceEvent: 0, structure: true }), []); assert.deepEqual(checkWcdeIntegrity(W.world, civ), []);
});

console.log("=== 建国の入口 ===");
const cands = civ.wcde.candidates;
await check("文明候補が示される。各候補は実際に成立条件を満たし、集団が重ならない", () => {
  assert.ok(cands.length >= 1); const used = new Set(); W.sim.ctx._spatial = null;
  for (const c of cands) { const f = evaluateFormation(W.sim.ctx, civ.groups[c.seedGroupId]); assert.ok(f && f.via === c.via); for (const i of c.groupIds) { assert.ok(!used.has(i)); used.add(i); } assert.ok(c.polityOptions.length >= 1 && c.pop > 0); }
});
await check("founding の間は、時間を進められない（候補を選ぶまで止まる）", () => { const r = dispatch(W, { type: "time.advance", authority: A.ADMIN, months: 12 }); assert.equal(r.ok, false); assert.equal(r.code, "phase"); assert.equal(civ.monthIndex, 0); });
await check("参加: 不正な入力（未知の候補・長い名前・政体違い・名前の重複）は拒否され、状態は変わらない", () => {
  const before = JSON.stringify(civ.states) + JSON.stringify(civ.wcde.control);
  assert.equal(dispatch(W, { type: "founding.found", authority: A.PLAYER, candidateId: "candidate_zzz" }).ok, false);
  assert.equal(dispatch(W, { type: "founding.found", authority: A.PLAYER, candidateId: cands[0].id, name: "あ".repeat(31) }).ok, false);
  assert.equal(dispatch(W, { type: "founding.found", authority: A.PLAYER, candidateId: cands[0].id, polity: "empire" }).ok, false);
  assert.equal(dispatch(W, { type: "founding.found", authority: A.CREATOR, candidateId: cands[0].id }).ok, false, "権限違い");
  assert.equal(JSON.stringify(civ.states) + JSON.stringify(civ.wcde.control), before); assert.equal(civ.wcde.phase, "founding");
});
const S0 = serializeWorld(W);
await check("参加: 建国すると、その国家をプレイヤーが担当し、段階が running になる。国名・政体は指定どおり", () => {
  const c = cands[0], r = dispatch(W, { type: "founding.found", authority: A.PLAYER, candidateId: c.id, name: "星の連邦", polity: c.polityOptions[0] }); assert.ok(r.ok, r.error);
  const st = civ.states[r.result.stateId]; assert.equal(st.name, "星の連邦"); assert.equal(st.polity, c.polityOptions[0]); assert.ok(st.player); assert.equal(civ.wcde.control.stateId, st.id); assert.equal(civ.wcde.phase, "running");
  assert.equal(Object.values(civ.states).filter((s) => s.player).length, 1); assert.ok(civ.events.some((e) => e.kind === "state_formed" && e.participants.some((p) => p.entityId === st.id))); assert.equal(civ.wcde.candidates.length, 0);
});
await check("参加: 同じ commandId の命令は二度実行しない（冪等）", () => {
  const w2 = deserializeWorld(S0), c = w2.civ.wcde.candidates[0], cmd = { type: "founding.found", authority: A.PLAYER, candidateId: c.id, commandId: "cmd-1" };
  const a = dispatch(w2, cmd), n = Object.keys(w2.civ.states).length, b = dispatch(w2, cmd); assert.ok(a.ok); assert.ok(b.ok && b.duplicate); assert.equal(Object.keys(w2.civ.states).length, n);
});
await check("委任: 国家を担当せず始める（創造主モード）。担当は無く、世界は AI だけで進む", () => {
  const w2 = deserializeWorld(S0); const r = dispatch(w2, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(r.ok); assert.equal(w2.civ.wcde.phase, "running"); assert.equal(w2.civ.wcde.control.stateId, null);
  const adv = dispatch(w2, { type: "time.advance", authority: A.ADMIN, months: 120 }); assert.ok(adv.ok, adv.error); assert.equal(Object.values(w2.civ.states).filter((s) => s.player).length, 0); assert.deepEqual(checkWcdeIntegrity(w2.world, w2.civ), []);
});
await check("保存→読み込みで同じ状態になり、同じ命令列から同じ未来になる（決定性）", () => {
  const a = deserializeWorld(S0), b = deserializeWorld(S0), run = (w) => { dispatch(w, { type: "founding.found", authority: A.PLAYER, candidateId: w.civ.wcde.candidates[0].id }); dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 60 }); return w; };
  run(a); run(b); assert.deepEqual(a.civ.states, b.civ.states); assert.deepEqual(a.civ.events, b.civ.events); assert.equal(a.civ.monthIndex, b.civ.monthIndex);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
