// V5-M8: 種族（非人間の国家・種族差）と魔法（希少な先天的素質・組織・差別・制度・制約・反動）。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { SPECIES, speciesOf, lifeScale } from "../js/core/civ/species.js";
import { ABILITIES, INSTITUTIONS, CAPS, supplyOf, magicMil } from "../js/core/civ/magic.js";
import { formState } from "../js/core/civ/states.js";
import { composition } from "../js/core/civ/cohorts.js";
import { milMult } from "../js/core/civ/techfx.js";
import { stateAt } from "../js/core/civ/history.js";
import { encodeCivChunks, decodeCivChunks } from "../js/core/civ/civ-chunks.js";
import { byState } from "../js/core/civ/spatial.js";
import { getEvent, checkGraph } from "../js/core/civ/graph.js";
import { ACTION, observe } from "../js/core/civ/actions.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const mk = (seed, o = {}) => { const civ = createCivState(W, { startGroupId: 1, historySeed: seed, ...o }); return { civ, sim: createCivSim(W, civ) }; };

console.log("=== M8: 種族 ===");
await check("種族は寿命・成長・技術・軍事・魔法素質の属性を持つ。非人間は生息環境に合う集団に割り当たり、開始集団は変わらない", () => {
  const { civ } = mk(5); for (const s of Object.values(SPECIES)) { assert.ok(s.lifespan > 0 && s.growth > 0 && s.techRate > 0 && s.martial > 0 && s.magic > 0 && s.ja); }
  assert.ok(SPECIES.elf.lifespan > SPECIES.human.lifespan * 3 && SPECIES.elf.growth < 1 && SPECIES.beastfolk.growth > 1 && SPECIES.dwarf.martial > 1);
  const non = Object.values(civ.groups).filter((g) => g.speciesId !== "human"); assert.ok(non.length >= 1, "非人間の集団が無い");
  for (const g of non) { assert.ok(SPECIES[g.speciesId].env.includes(W.cell.biome[g.cell]), "生息環境が合わない"); assert.equal(g.cohorts[0].speciesId, g.speciesId); }
  assert.equal(civ.groups[civ.player.groupId].speciesId, W.entities.populations.find((p) => p.id === 1).species ?? "human");
  assert.equal(createCivState(W, { startGroupId: 1, historySeed: 5, species: "human" }).groups[civ.player.groupId].speciesId, "human"); assert.ok(Object.values(createCivState(W, { startGroupId: 1, historySeed: 5, species: "human" }).groups).every((g) => g.speciesId === "human" || g.player));
});
await check("成長の差が人口に出る（同じ世界・同じ種で、全集団をエルフにすると 200 年で人間より少ない）", () => {
  const run = (sp) => { const { civ, sim } = mk(11, { species: "human" }); for (const g of Object.values(civ.groups)) { g.speciesId = sp; for (const c of g.cohorts) c.speciesId = sp; } sim.advanceMonths(200 * 12); return Object.values(civ.groups).reduce((s, g) => s + g.pop, 0); };
  const h = run("human"), e = run("elf"), b = run("beastfolk"); assert.ok(e < h, `エルフ ${e} 人間 ${h}`); assert.ok(b >= h * 0.95, `獣人 ${b} 人間 ${h}`);
});
await check("非人間のみの国家を作れる（人口構成が全て同じ非人間種族）。寿命の長い種族は指導者の世代交代が遅い", () => {
  const { civ, sim } = mk(5); const gs = Object.values(civ.groups).filter((g) => !g.player).slice(0, 2); for (const g of gs) { g.speciesId = "elf"; for (const c of g.cohorts) c.speciesId = "elf"; g.pop = Math.max(g.pop, 400); }
  const st = formState(sim.ctx, { via: "agri_union", groupIds: gs.map((g) => g.id) }); const c = composition(civ, st); assert.deepEqual(Object.keys(c.species), ["elf"]); assert.equal(lifeScale(civ, st), 5);
  assert.ok(st.leader.bornAt <= civ.monthIndex - 1000, "エルフの指導者の年齢が人間と同じ"); sim.advanceMonths(24); assert.deepEqual(checkCivIntegrity(W, civ), []);
  const hs = { ...st, capitalGroupId: civ.player.groupId }; assert.equal(lifeScale(civ, hs), 1);
});
await check("国家の軍事適性は構成種族の人口加重（ドワーフの国は強く、エルフの国は弱い）", () => {
  const { civ, sim } = mk(6); const g = Object.values(civ.groups).find((x) => !x.player); g.speciesId = "dwarf"; g.cohorts[0].speciesId = "dwarf"; const st = formState(sim.ctx, { via: "city_state", groupIds: [g.id] }); sim.advanceMonths(3);
  assert.ok(st.martial > 1.1, `${st.martial}`); const base = milMult({ techAdopted: {}, martial: 1 }); assert.ok(milMult(st) > base);
});

console.log("=== M8: 魔法 ===");
const R = mk(21); R.civ.options.magicRate = 40; R.sim.advanceMonths(800 * 12); const { civ, sim } = R;
console.log(`  (800年: 素質者 ${Object.keys(civ.persons).length}・組織 ${Object.keys(civ.magic.orgs).length}・魔法制度の国 ${Object.values(civ.states).filter((s) => s.magic).length}・国家 ${Object.keys(civ.states).length})`);
await check("素質は希少: 既定の頻度では、存命の素質者は人口のごく一部（0.01%未満）", () => {
  const { civ: c, sim: s } = mk(22); s.advanceMonths(500 * 12); const pop = Object.values(c.groups).reduce((a, g) => a + g.pop, 0), n = c.magic.living.length; assert.ok(pop > 1e4); assert.ok(n / pop < 1e-4, `${n}/${pop}`);
});
await check("素質者は人物（person_…）で、能力・強度・種族・集団を持ち、出現は事件の入口（見つかった事件→出来事）になる", () => {
  assert.ok(Object.keys(civ.persons).length >= 20); for (const p of Object.values(civ.persons)) { assert.match(p.id, /^person_/); assert.ok(ABILITIES[p.ability]); assert.ok(p.power > 0 && p.power <= 1); assert.ok(SPECIES[p.speciesId]); }
  const inc = civ.events.filter((e) => e.kind === "magic_incident"); assert.ok(inc.length >= 5); for (const e of inc.slice(0, 50)) { const c = e.causes[0]; assert.equal(getEvent(civ, c.targetId).kind, "magic_gifted_found"); assert.equal(c.basis, "direct"); }
});
await check("魔法を巡る組織・差別・権力争いが発生し、差別は寛容度の低い国で起き、緊張が上がる", () => {
  const k = new Set(civ.events.filter((e) => e.kind.startsWith("magic")).map((e) => e.kind)); for (const need of ["magic_org_founded", "magic_discrimination"]) assert.ok(k.has(need), `${need} が無い（${[...k]}）`);
  for (const e of civ.events.filter((x) => x.kind === "magic_discrimination").slice(0, 30)) { assert.ok(e.effects[0].after > e.effects[0].before); assert.equal(getEvent(civ, e.causes[0].targetId).kind, "magic_gifted_found"); }
  for (const o of Object.values(civ.magic.orgs)) { assert.ok(civ.states[o.stateId]); assert.ok(o.members.every((m) => civ.persons[m])); }
});
await check("寛容度の高い国では差別が起きない（合成: 全国家の寛容度を最大にして AI を止め、素質者を大量に出す）", () => {
  const { civ: c, sim: s } = mk(23); c.options.magicRate = 400; c.options.aiInterval = 1e9; s.advanceMonths(400 * 12); for (const st of Object.values(c.states)) st.policy.tolerance = 1; const n0 = c.events.length; s.advanceMonths(20 * 12);
  assert.equal(c.events.slice(n0).filter((e) => e.kind === "magic_discrimination").length, 0);
});
await check("魔法制度: 素質者2人以上・財政・技術の条件を満たさないと設立できず、理由が返る。満たせば設立でき、効果は上限つき", () => {
  const { civ: c, sim: s } = mk(24); const gs = Object.values(c.groups).filter((g) => !g.player).slice(0, 2); const st = formState(s.ctx, { via: "agri_union", groupIds: gs.map((g) => g.id) }); st.player = true; st.treasury = 500; st.techAdopted.writing = 0; const e = observe(s.ctx, st);
  const cands = ACTION.magic_institution.candidates(s.ctx, st, e); assert.ok(cands.every((x) => !x.eligible) && /素質者が足りない/.test(cands[0].reason));
  const mkp = (id, gid, power) => { c.persons[id] = { id, name: "t", speciesId: "human", groupId: gid, bornAt: c.monthIndex - 300, diedAt: null, ability: "healing", power, emergedAt: 0, orgId: null }; c.magic.living.push(id); };
  mkp("person_t1", gs[0].id, 0.9); assert.ok(!ACTION.magic_institution.candidates(s.ctx, st, e)[0].eligible); const one = supplyOf(c, st, gs).power;
  for (let i = 2; i <= 8; i++) mkp(`person_t${i}`, gs[i % 2].id, 0.9); const many = supplyOf(c, st, gs).power; assert.ok(one < many && many <= 1, `${one} ${many}`); assert.ok(many <= 0.9 + 1e-9, "供給が足りても素質の強さを超えない");
  st.treasury = 10; assert.equal(s.command({ type: "stateAction", stateId: st.id, action: "magic_institution", opt: "military" }).ok, false); st.treasury = 500;
  const m0 = milMult(st); const r = s.command({ type: "stateAction", stateId: st.id, action: "magic_institution", opt: "military" }); assert.ok(r.ok, r.error); assert.equal(st.magic.kind, "military"); assert.equal(st.treasury, 500 - CAPS.instCost);
  s.advanceMonths(12); const m1 = milMult(st) / (st.martial ?? 1) - m0 / 1; assert.ok(st.magic.power > 0 && magicMil(st) <= CAPS.mil + 1e-9, `${magicMil(st)}`); assert.ok(milMult(st) <= (st.martial ?? 1) * (1 + 0.2 + 0.35 + 0.3 + 0.1 + 0.8 + CAPS.mil) + 1e-9);
  assert.equal(s.command({ type: "stateAction", stateId: st.id, action: "magic_institution", opt: "academy" }).ok, false, "二重に設立できてしまう");
});
await check("寛容度が最低限を下回る国には素質者が定着しない（供給0）", () => { const { civ: c, sim: s } = mk(25); const gs = Object.values(c.groups).slice(0, 2); const st = formState(s.ctx, { via: "agri_union", groupIds: gs.map((g) => g.id) }); c.persons.person_x = { id: "person_x", groupId: gs[0].id, diedAt: null, power: 1, ability: "flame", speciesId: "human", bornAt: 0 }; c.magic.living.push("person_x"); st.policy.tolerance = 0.5; assert.equal(supplyOf(c, st, gs).n, 1); st.policy.tolerance = 0.1; assert.equal(supplyOf(c, st, gs).n, 0); });
await check("AI の国家が魔法制度を設立する（判断記録に候補・得点・結果が残る）。反動（暴発）も起き、制度の国で安定度が下がる", () => {
  const d = civ.decisions.filter((x) => x.chosen.key === "magic_institution" && x.provenance === "ai"); assert.ok(d.length >= 1, "AI が魔法制度を選んだことが無い"); assert.ok(d.some((x) => x.result?.ok)); assert.ok(d[0].candidates.length >= 1);
  const back = civ.events.filter((e) => e.kind === "magic_backlash"); assert.ok(back.length >= 1, "反動が一度も起きていない"); for (const e of back) assert.ok(e.effects[0].after < e.effects[0].before);
});
await check("プレイヤー国家は魔法制度も自動では作られない（AI の判断記録は NPC 国家のみ）", () => { const players = new Set(Object.values(civ.states).filter((s) => s.player).map((s) => s.id)); for (const d of civ.decisions) if (players.has(d.actorId)) assert.equal(d.provenance, "player"); });
await check("魔法の国力は月次履歴に残り、過去の月に復元できる。保存→読み込みで人物・組織・生存リストが一致する", () => {
  const st = Object.values(civ.states).find((s) => s.magic); assert.ok(st); assert.equal(stateAt(civ, st.id, civ.monthIndex).magicPower, st.magic.power);
  const ch = encodeCivChunks(civ), c2 = decodeCivChunks((n) => ch[n], Object.keys(ch)); assert.deepEqual(c2.persons, civ.persons); assert.deepEqual(c2.magic, civ.magic); assert.deepEqual(checkGraph(c2), []);
  assert.deepEqual([...c2.magic.living].sort(), Object.keys(civ.persons).filter((i) => civ.persons[i].diedAt == null).sort());
});
await check("整合性: 全期間を通して文明状態の検査が通る（人物の集団・組織の国家が実在）", () => assert.deepEqual(checkCivIntegrity(W, civ), []));

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
