// v2.6.1: 州に縛られない自由な反乱（5つの型・規模・属州の切り出し）と、史実風の戦争名・戦闘名
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { REBEL_TYPES, REBEL_SCALES, pickRebelRegion, rebelRegimeKey, rebelWarName } from "../js/core/edit/rebellion.js";
import { listWars, planDeclareWar } from "../js/core/edit/wars.js";
import { seriesWarName, warRootOf } from "../js/core/edit/wars.js";
import { variantBattleName, battleNameFor } from "../js/core/sim/war-engine.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const fresh = async () => { const { map } = await buildHistoricalWorld(); const store = createStore({ map }); const sim = createSimActions({ store, renderer: { requestRender() {} } }); return { store, sim, M: () => store.getState().map, live: () => store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed) }; };

console.log("=== 反乱の型・規模・領域 ===");
check("反乱の型は5つ。目的（政体転覆／分離独立）・歴史上の例・説明を持つ", () => { assert.equal(REBEL_TYPES.length, 5); for (const t of REBEL_TYPES) assert.ok(["overthrow", "secession"].includes(t.goal) && t.examples && t.desc); });
{
  const w = await fresh(); const S = w.live().find((s) => pickRebelRegion(w.M(), s.i, "uprising", "small", null));
  check("領域は規模に応じて広がり、首都を含まず、都市を含み、元の国に領土が残る", () => {
    const sizes = REBEL_SCALES.map((sc) => pickRebelRegion(w.M(), S.i, "uprising", sc.key, createRandom(3))).filter(Boolean);
    assert.ok(sizes.length >= 2); assert.ok(sizes.every((r, i) => i === 0 || r.cells.length >= sizes[i - 1].cells.length));
    const cap = w.M().pack.burgs[S.capital].cell, total = w.M().pack.cells.state.filter((x) => x === S.i).length;
    for (const r of sizes) { assert.ok(!r.cells.includes(cap) && r.burgs.length >= 1 && total - r.cells.length >= 1); }
  });
  check("政体転覆の型は、元の国と違う政体にする。noble は元の国と同じ", () => { const rnd = createRandom(1); for (let i = 0; i < 30; i++) assert.notEqual(rebelRegimeKey("uprising", "democracy", rnd), "democracy"); assert.equal(rebelRegimeKey("noble", "absolute", rnd), "absolute"); assert.equal(rebelRegimeKey("religious", "absolute", rnd), "theocracy"); });
}
console.log("=== 起こすと、内戦になる（型ごと） ===");
for (const t of REBEL_TYPES) {
  const w = await fresh(); const S = w.live().find((s) => pickRebelRegion(w.M(), s.i, t.key, "medium", null));
  if (!S) { console.log(`  --   ${t.label}: この合成世界では起こせる国が無い（スキップ）`); continue; }
  const n0 = w.live().length, base = snapshotBaseline?.(w.M());
  let r; check(`${t.label}: 属州が1つでも起こせて、新国家と内戦ができる`, () => {
    r = w.sim.startRebellion(S.i, { type: t.key, scale: "medium" });
    assert.equal(w.live().length, n0 + 1); const war = listWars(w.M()).at(-1); assert.equal(war.type, "civil"); assert.ok(war.attackers.includes(r.id) && war.defenders.includes(S.i));
    const born = w.M().pack.states[r.id]; assert.equal(born.rebelType, t.key); assert.equal(born.rebelGoal, t.goal); assert.equal(born.parentState, S.i);
  });
  check(`${t.label}: 内戦の名前は型に合う史実風`, () => { const nm = listWars(w.M()).at(-1).name; assert.ok(({ uprising: /の乱$/, independence: /独立戦争$/, religious: /戦争$/, coup: /内戦$/, noble: /継承戦争$/ })[t.key].test(nm), nm); });
  check(`${t.label}: 整合性が保たれる（新国家に都市と首都がある・元の国に首都が残る）`, () => {
    const m = w.M(), born = m.pack.states[r.id], parent = m.pack.states[S.i];
    assert.ok(m.pack.burgs[born.capital] && m.pack.burgs[born.capital].state === born.i && m.pack.burgs[parent.capital].state === parent.i);
    const cells = m.pack.cells; for (let i = 0; i < cells.state.length; i++) if (cells.state[i] === born.i && cells.province[i] > 0) assert.equal(m.pack.provinces[cells.province[i]].state, born.i, `セル${i}の属州の所属`);
  });
  check(`${t.label}: Undo 1回で全部戻る`, () => { w.store.undo(); assert.equal(w.live().length, n0); });
}
{
  const w = await fresh(); const S = w.live().find((s) => pickRebelRegion(w.M(), s.i, "uprising", "small", null));
  check("平和的な分離（civil:false）は、戦争にならない", () => { const nw = listWars(w.M()).length; w.sim.startRebellion(S.i, { type: "independence", scale: "small", civil: false }); assert.equal(listWars(w.M()).length, nw); });
}

console.log("=== 戦争名の連番（直近100年に同じ国が戦ったら、第〇次〇〇戦争） ===");
{
  const w = await fresh(); const [A, B, C] = w.live(); const M = w.M();
  const date = { year: 60, month: 1 };
  const mk = (name, a, d, ended) => { const id = (M.ext.data.wars ?? []).length + 100; (M.ext.data.wars = M.ext.data.wars ?? []).push({ id, name, attackers: [a], defenders: [d], startedAt: { year: ended.year - 3, month: 1 }, endedAt: ended, battles: [], names: {} }); return id; };
  M.ext.data.wars = [];
  mk("ロレーヌ戦争", A.i, B.i, { year: 40, month: 1 });
  check("同じ国どうしが100年以内なら、「第二次ロレーヌ戦争」", () => assert.equal(seriesWarName(M, "別の名前戦争", [A.i], [B.i], date), "第二次ロレーヌ戦争"));
  check("攻守が入れ替わっても同じ（国どうしで決まる）", () => assert.equal(seriesWarName(M, "別の名前戦争", [B.i], [A.i], date), "第二次ロレーヌ戦争"));
  check("100年より前なら、連続しない（名前が違えばそのまま）", () => assert.equal(seriesWarName(M, "別の名前戦争", [A.i], [B.i], { year: 200, month: 1 }), "別の名前戦争"));
  check("別の国どうしなら、そのまま", () => assert.equal(seriesWarName(M, "新しい戦争", [A.i], [C.i], date), "新しい戦争"));
  mk("第二次ロレーヌ戦争", A.i, B.i, { year: 55, month: 1 });
  check("続けば、第三次…と数が増える（「（2）」のような機械的な印は付けない）", () => { const n = seriesWarName(M, "x戦争", [A.i], [B.i], date); assert.equal(n, "第三次ロレーヌ戦争"); assert.ok(!/（\d+）/.test(n)); });
  check("同名の戦争があるなら、国が違っても連番で区別する", () => assert.equal(seriesWarName(M, "ロレーヌ戦争", [C.i], [B.i], { year: 400, month: 1 }), "第三次ロレーヌ戦争"));
  check("語幹は連番を外した名前", () => assert.equal(warRootOf("第十二次ロレーヌ戦争"), "ロレーヌ戦争"));
  check("宣戦布告の既定名にも連番が働く", () => { M.worldTime = date; const r = planDeclareWar(M, { attackers: [A.i], defenders: [B.i], date }); w.store.commit(r.command); assert.ok(/^第.+次/.test(listWars(w.M()).at(-1).name)); });
}
console.log("=== 戦闘名: 「第20次〇〇の戦い」にならない ===");
{
  const w = await fresh(); const M = w.M(); const burg = M.pack.burgs.find((b) => b && b.i && !b.removed);
  const used = []; const rnd = createRandom(11);
  for (let i = 0; i < 40; i++) used.push(battleNameFor(M, burg, { rnd, used, year: 60 }));
  check("同じ都市で40回戦っても、名前は重ならない", () => assert.equal(new Set(used).size, used.length));
  check("「第四次」以降や、2桁の連番は出ない（第二次・第三次まで）", () => assert.ok(used.every((n) => !/第[四五六七八九十\d]+次/.test(n)), used.join(" / ")));
  check("まずは別の言い方（会戦・攻防戦・近郊の戦い…）に変わる", () => assert.ok(used.slice(0, 5).every((n) => !/^第.次/.test(n))));
}
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
