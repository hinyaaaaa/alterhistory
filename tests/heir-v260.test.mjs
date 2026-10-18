// v2.6.0 B5: 世襲の後継者・王朝名（姓）・摂政。顔は ID と世代から決まる設計を変えない
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { ensureHeirs, ensureLeaders, leaderRecord, heirOf, familyOf, planChangeLeader, leaderCandidates, rollRegencyEnd, MAJORITY, faceOf } from "../js/core/edit/leaders.js";
import { regimeOf, REGIMES, planSetRegime } from "../js/core/edit/regimes.js";
import { setProps, makeCommand } from "../js/core/edit/commands.js";
import { buildChronicle, chronicleToMarkdown } from "../js/io/chronicle.js";
import { listHistory } from "../js/core/edit/history-log.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const setRegime = (id, key) => { const r = REGIMES.find((x) => x.key === key); store.commit(makeCommand("t", [], [setProps(M().pack.states[id], { regime: key, form: r.form, formName: r.label })])); };
const [K, R] = live();
setRegime(K.i, "absolute"); setRegime(R.i, "democracy");
ensureLeaders(M());
const date = () => ({ year: M().worldTime.year, month: 3 });

check("世襲の国には後継者がいて、共和国にはいない", () => { assert.ok(heirOf(M(), K.i)?.name); assert.equal(heirOf(M(), R.i), null); });
check("後継者の姓は、いまの王朝と同じ", () => assert.equal(heirOf(M(), K.i).family, familyOf(leaderRecord(M(), K.i).current)));
check("継承が安定なら、後継者がそのまま即位し、王朝名（姓）は変わらない", () => {
  const fam = familyOf(leaderRecord(M(), K.i).current), h = heirOf(M(), K.i);
  store.commit(planChangeLeader(M(), K.i, { reason: "death", stability: "stable", date: date(), rnd: createRandom(3) }));
  const now = leaderRecord(M(), K.i).current;
  if (h.birthYear + MAJORITY > date().year) assert.ok(now.regentFor); else { assert.equal(now.name, h.name); assert.equal(familyOf(now), fam); }
  assert.ok(heirOf(M(), K.i) === null || heirOf(M(), K.i).name !== h.name);
});
check("簒奪では、新しい王朝（姓が替わる）", () => {
  setRegime(K.i, "absolute");
  const fam = familyOf(leaderRecord(M(), K.i).current);
  store.commit(planChangeLeader(M(), K.i, { reason: "usurpation", stability: "dispute", date: date(), rnd: createRandom(8) }));
  assert.notEqual(familyOf(leaderRecord(M(), K.i).current), fam);
});
check("世襲の候補は、後継者が先頭で、ほかは同じ王朝", () => {
  const c = leaderCandidates(M(), K.i, { n: 3, seed: 5 }); const fam = familyOf(leaderRecord(M(), K.i).current), h = heirOf(M(), K.i);
  if (h) assert.ok(c[0].heir && c[0].name === h.name);
  assert.ok(c.slice(h ? 1 : 0).every((x) => x.name.endsWith(`・${fam}`)));
});
console.log("=== 摂政 ===");
check("後継者が幼いと、摂政が政務をとる（称号「摂政」・年表に残る）", () => {
  const y = date().year; ensureHeirs(M(), date()); const h = heirOf(M(), K.i) ?? (() => { throw new Error("後継者が置けない"); })();
  M().ext.data.heirs[K.i] = { ...h, birthYear: y - 5 }; // 5歳
  store.commit(planChangeLeader(M(), K.i, { reason: "death", stability: "stable", date: date(), rnd: createRandom(4) }));
  const l = leaderRecord(M(), K.i).current;
  assert.ok(/摂政/.test(l.title) && l.regentFor?.name === h.name && l.regentFor.birthYear === y - 5);
  assert.equal(heirOf(M(), K.i), null);
  assert.ok(listHistory(M()).some((e) => e.type === "succession" && /幼い/.test(e.title)));
  assert.ok(typeof faceOf(l, date()) === "object");
});
check("摂政が倒れても、幼い君主の摂政が引き継ぐ", () => {
  const child = leaderRecord(M(), K.i).current.regentFor;
  store.commit(planChangeLeader(M(), K.i, { reason: "death", stability: "stable", date: date(), rnd: createRandom(9) }));
  const l = leaderRecord(M(), K.i).current; assert.ok(/摂政/.test(l.title) && l.regentFor.name === child.name);
});
check("成人する年の1月に、摂政が退き、君主が親政を始める", () => {
  const child = leaderRecord(M(), K.i).current.regentFor, y = child.birthYear + MAJORITY;
  assert.equal(rollRegencyEnd(M(), K.i, { year: y - 1, month: 1 }), null);
  assert.equal(rollRegencyEnd(M(), K.i, { year: y, month: 2 }), null);
  assert.ok(rollRegencyEnd(M(), K.i, { year: y, month: 1 }));
  sim.advanceMonthly({ year: y, month: 1 }, { ...createRandom(2), chance: () => false, next: () => 0.99 });
  const l = leaderRecord(M(), K.i).current; assert.ok(!l.regentFor && l.name === child.name && /親政/.test(listHistory(M()).at(-1).title + listHistory(M()).map((e) => e.title).join("")));
});
check("Undo で後継者も指導者も戻る", () => {
  const h = heirOf(M(), K.i), l = leaderRecord(M(), K.i).current.id;
  store.commit(planChangeLeader(M(), K.i, { reason: "death", stability: "stable", date: date(), rnd: createRandom(12) })); store.undo();
  assert.equal(leaderRecord(M(), K.i).current.id, l); assert.deepEqual(heirOf(M(), K.i), h);
});
check("クロニクルに後継者・王朝・摂政が書かれ、undefined が出ない", () => {
  const md = chronicleToMarkdown(buildChronicle(M(), { includeCells: false }));
  assert.ok(md.includes("次の指導者（後継者）") || leaderRecord(M(), K.i).current.regentFor); assert.ok(md.includes("王朝:")); assert.ok(!/undefined|NaN/.test(md));
});
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
