// V5-M6: 因果グラフ（双方向索引・根拠・ユーザー編集）・判断記録・失敗した外交・歴史認識と表現物（事実との分離）。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState, encodeCiv, decodeCiv } from "../js/core/civ/civ-state.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";
import { graphIndex, getEvent, causesOf, consequencesOf, eventsOfEntity, decisionsOfActor, neighborhood, renameEvent, editCause, checkGraph } from "../js/core/civ/graph.js";
import { stepInterpretation, grievance, interpretationsOf, STANCE } from "../js/core/civ/interpret.js";
import { expandDecision } from "../js/core/civ/ai.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const civ = createCivState(W, { startGroupId: 1, historySeed: 99 }), sim = createCivSim(W, civ);
sim.advanceMonths(1300 * 12);
console.log(`  (1,300年: イベント ${civ.events.length}・判断 ${civ.decisions.length}・国家 ${Object.keys(civ.states).length}・認識 ${civ.interpretations.length}・表現物 ${civ.works.length})`);

console.log("=== M6: 因果グラフ ===");
await check("参照切れが0（原因・判断・判断結果のイベントID）", () => assert.deepEqual(checkGraph(civ), []));
await check("原因と結果を双方向から取得できる（全イベントで、原因→結果の逆引きが一致する）", () => {
  let n = 0; for (const ev of civ.events) for (const c of ev.causes) { if (!/^event_/.test(c.targetId)) continue; n++; assert.ok(causesOf(civ, ev.eventId).some((x) => x.targetId === c.targetId), "原因側"); assert.ok(consequencesOf(civ, c.targetId).some((x) => x.from === ev.eventId), "結果側"); }
  assert.ok(n >= 500, `因果のつながりが少ない ${n}`);
});
await check("因果には関係と根拠（direct/strong/plausible…）がある。校正されていない数値の「確率」は持たない", () => {
  const bases = new Set(); for (const ev of civ.events) for (const c of ev.causes) { bases.add(c.basis); assert.equal(c.probability, undefined); assert.equal(c.confidence, undefined); }
  assert.ok(bases.size >= 3, [...bases].join());
});
await check("原因は複数ありうる（不安定は飢え・要求・戦争・継承などを同時に寄与要因にできる）かつ「関連のみ」と区別された関係種別を使う", () => {
  const rel = new Set(); for (const ev of civ.events) for (const c of ev.causes) rel.add(c.relation);
  assert.ok(["reaction_to", "part_of", "contributed_to", "enabled_by"].filter((r) => rel.has(r)).length >= 3, [...rel].join());
});
await check("改名しても参照が切れない（IDは不変。名称の履歴が残る）", () => {
  const ev = civ.events.find((e) => consequencesOf(civ, e.eventId).length > 0), cons = consequencesOf(civ, ev.eventId).map((x) => x.from), before = ev.eventId;
  renameEvent(civ, ev.eventId, "改名されたイベント"); assert.equal(getEvent(civ, before).title, "改名されたイベント"); assert.ok(getEvent(civ, before).titleHistory.length === 1);
  assert.deepEqual(consequencesOf(civ, before).map((x) => x.from), cons); assert.deepEqual(checkGraph(civ), []);
});
await check("ユーザーが編集した因果は userEdited として区別され、シミュレーションが生成した因果は消せない", () => {
  const a = civ.events[civ.events.length - 1], b = civ.events[civ.events.length - 5];
  editCause(civ, a.eventId, "add", { targetId: b.eventId, relation: "influenced_by", basis: "contested" });
  assert.ok(a.causes.some((c) => c.targetId === b.eventId && c.userEdited === true));
  assert.ok(consequencesOf(civ, b.eventId).some((x) => x.from === a.eventId && x.userEdited));
  const sc = civ.events.find((e) => e.causes.some((c) => !c.userEdited && /^event_/.test(c.targetId))), c0 = sc.causes.find((c) => !c.userEdited);
  assert.throws(() => editCause(civ, sc.eventId, "remove", { targetId: c0.targetId, relation: c0.relation }), /削除できません/);
  editCause(civ, a.eventId, "remove", { targetId: b.eventId, relation: "influenced_by" }); assert.ok(!a.causes.some((c) => c.userEdited));
});
await check("局所グラフ: 深さ2・ノード上限があり、切り捨てたら理由を返す（黙って切らない）", () => {
  const hub = civ.events.reduce((m, e) => (consequencesOf(civ, e.eventId).length > m.n ? { e, n: consequencesOf(civ, e.eventId).length } : m), { e: null, n: 0 });
  const g = neighborhood(civ, hub.e.eventId, { depth: 2, maxNodes: 60 }); assert.ok(g.nodes.length <= 60 && g.nodes.length >= 2);
  const small = neighborhood(civ, hub.e.eventId, { depth: 2, maxNodes: 3 }); assert.ok(small.nodes.length <= 3); if (hub.n >= 3) assert.match(small.truncated ?? "", /上限/);
});
await check("実体別・判断記録の索引: カーソルで続きを読め、全走査せずに件数が合う", () => {
  const sid = Object.keys(civ.states)[0], all = eventsOfEntity(civ, sid, { limit: 1e9 }); assert.ok(all.length >= 1);
  const p1 = eventsOfEntity(civ, sid, { limit: 2 }), p2 = eventsOfEntity(civ, sid, { limit: 2, before: p1.at(-1).eventId }); assert.deepEqual([...p1, ...p2].map((e) => e.eventId), all.slice(0, p1.length + p2.length).map((e) => e.eventId));
  const aid = civ.decisions[civ.decisions.length - 1].actorId, ds = decisionsOfActor(civ, aid, { limit: 1e9 }); assert.equal(ds.length, civ.decisions.filter((d) => d.actorId === aid).length);
});
await check("失敗した外交（不成立・発覚）は判断記録の結果と、個別のイベント（diplomacy_failed）の両方に残る", () => {
  const f = civ.decisions.filter((d) => d.result && !d.result.ok && d.result.eventIds.length); assert.ok(f.length >= 1, "失敗した外交が一度も起きていない");
  for (const d of f) { const ev = getEvent(civ, d.result.eventIds[0]); assert.equal(ev.kind, "diplomacy_failed"); assert.equal(ev.decisionId, d.decisionId); }
  const x = expandDecision(civ, f[0]); assert.ok(x.candidates.length >= 1 && x.chosen.key);
});
await check("保存→読み込みで索引を作り直しても、同じ原因・結果が引ける（索引は保存しない正本ではない）", () => {
  const c2 = decodeCiv(encodeCiv(civ)); const ev = civ.events.find((e) => e.causes.length), a = causesOf(civ, ev.eventId).map((x) => x.targetId), b = causesOf(c2, ev.eventId).map((x) => x.targetId);
  assert.deepEqual(a, b); assert.deepEqual(checkGraph(c2), []); assert.equal(c2.interpretations.length, civ.interpretations.length);
});

console.log("=== M6: 歴史認識・表現物（事実と分離） ===");
await check("戦争の終結から、勝者は「勝利」、敗者は「屈辱」の認識を持つ。認識は国家ごとの別の層", () => {
  assert.ok(civ.interpretations.length >= 10); const st = new Set(civ.interpretations.map((x) => x.stance)); assert.ok(st.has("victory") && st.has("humiliation") && st.has("founding"), [...st].join());
  for (const x of civ.interpretations) { assert.ok(STANCE[x.stance]); assert.ok(getEvent(civ, x.eventId), "事実のイベントを指す"); assert.ok(civ.states[x.ownerId]); }
});
await check("政体・指導者が変わると、認識だけが変わる（置き換え）。事実のイベント列は一字も変わらない", () => {
  const st = Object.values(civ.states).find((s) => s.alive && (s.interp ?? []).some((i) => civ.interpretations.find((x) => x.interpId === i && x.valence < 0)));
  if (!st) return; // 恨みを持つ国が生きていなければ検証対象なし（下の合成で検証）
  const facts = JSON.stringify(civ.events), n0 = civ.interpretations.length; st.polity = "republic"; st.interpDirty = true; stepInterpretation(sim.ctx);
  assert.equal(JSON.stringify(civ.events), facts, "事実が書き換わった"); assert.ok(civ.interpretations.length > n0, "新しい認識ができていない"); assert.ok(civ.interpretations.slice(n0).every((x) => x.supersedes && civ.interpretations.find((o) => o.interpId === x.supersedes).until != null));
});
await check("合成: 敗戦の恨みが、共和制への移行で弱まり、事実は変わらない。恨みは征服計画の評価へ入る", () => {
  const A = Object.values(civ.states)[0], B = Object.values(civ.states)[1], ev = civ.events[0]; A.interp = []; const n0 = civ.interpretations.length;
  civ.interpretations.push({ interpId: "interp_zz1", ownerId: A.id, eventId: ev.eventId, stance: "humiliation", valence: -0.8, about: [B.id], since: 0, until: null, supersedes: null, basis: "rule" }); A.interp.push("interp_zz1");
  const g0 = grievance(civ, A, B.id); assert.ok(g0 >= 0.79); const facts = JSON.stringify(civ.events); A.alive = true; A.polity = "republic"; A.interpDirty = true; stepInterpretation(sim.ctx);
  assert.ok(grievance(civ, A, B.id) < g0 * 0.5, `${grievance(civ, A, B.id)}`); assert.equal(JSON.stringify(civ.events), facts);
  assert.equal(interpretationsOf(civ, A.id).filter((x) => x.supersedes === "interp_zz1").length, 1);
});
await check("年代記（表現物）は著者・日時・対象事件・立場を持ち、事実との差（claims）を構造で残す。誤った記述でも事実のイベントは変えない", () => {
  assert.ok(civ.works.length >= 5); const d = civ.works.filter((w) => w.fidelity === "distorted"); assert.ok(d.length >= 1, "事実と異なる年代記が1つも無い");
  for (const w of civ.works) { assert.ok(getEvent(civ, w.targetEventId)); assert.ok(civ.states[w.authorId]); assert.ok(w.text.length > 5); for (const c of w.claims) assert.ok("claimed" in c && "actual" in c); }
  const w = d[0], war = w.claims.find((c) => c.property === "war.outcome"); if (war) assert.notEqual(war.claimed, war.actual === undefined ? null : undefined);
});

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
