// v2.4.0 の月ごとの更新: 指導者の自動継承・軍隊の自動編成（技術に比例）・時代に合う出来事。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { rollSuccession, leaderRecord, ensureLeaders } from "../js/core/edit/leaders.js";
import { regimentsOf, planArmyUpkeep, echelonOf } from "../js/core/sim/military.js";
import { forceHeadcount } from "../js/core/sim/units.js";
import { MINOR_EVENTS, rollMinorEvents, planMinorEvent, eventFits } from "../js/core/sim/minor-events.js";
import { planSetTechDoctrine } from "../js/core/edit/doctrines.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const S = live()[0];

console.log("=== 指導者の自動継承 ===");
check("初代の指導者が置かれ、顔の元になる ID・性別・世代がある", () => { ensureLeaders(M()); const l = leaderRecord(M(), S.i).current; assert.ok(l.id > 0 && ["m", "f"].includes(l.gender) && l.gen === 1 && l.name.includes("・")); });
check("在任が短く若い指導者は、めったに交代しない", () => { const rnd = createRandom(3); let n = 0; for (let i = 0; i < 2000; i++) if (rollSuccession(M(), S.i, { year: M().worldTime.year, month: 3 }, rnd)) n++; assert.ok(n < 80, `${n}`); });
check("高齢になると、死去などで交代が増える", () => { const rec = leaderRecord(M(), S.i); const old = { ...rec.current, birthYear: M().worldTime.year - 90 }; M().ext.data.leaders[S.i] = { ...rec, current: old }; const rnd = createRandom(5); let n = 0; for (let i = 0; i < 4000; i++) if (rollSuccession(M(), S.i, { year: M().worldTime.year, month: 3 }, rnd)?.reason === "death") n++; assert.ok(n > 10 && n < 200, `${n}`); M().ext.data.leaders[S.i] = rec; });
check("月ごとの更新で、継承が起きると自動で世代交代し年表に残る", () => {
  const rec = leaderRecord(M(), S.i); M().ext.data.leaders[S.i] = { ...rec, current: { ...rec.current, birthYear: M().worldTime.year - 120 } };
  const before = rec.current.id, always = { ...createRandom(1), chance: () => true, next: () => 0, weighted: (a) => a[0] };
  sim.advanceMonthly({ year: M().worldTime.year, month: 6 }, always);
  const now = leaderRecord(M(), S.i);
  assert.ok(now.current.id !== before && now.history.length >= 1 && now.current.gen >= 2);
  assert.ok(M().ext.data.historyLog.some((e) => e.type === "succession" && e.states?.includes(S.i)));
});

console.log("=== 軍隊の自動編成（技術ドクトリンに比例） ===");
const T = live()[1];
check("部隊の無い国には、月ごとの更新で軍隊が生成される（初期編成は満たされる）", () => {
  T.military = []; assert.equal(regimentsOf(T).length, 0);
  sim.advanceMonthly({ year: 50, month: 1 }, createRandom(9));
  assert.ok(regimentsOf(T).length >= 1 && regimentsOf(T).reduce((n, r) => n + forceHeadcount(r.u), 0) > 0);
});
check("技術が低い間は「将軍の軍」、技術が進むと連隊 → 師団 → 軍団と呼び方が変わる", () => {
  assert.equal(echelonOf(1).label, "軍"); assert.ok(echelonOf(1).general);
  assert.equal(echelonOf(3).label, "連隊"); assert.equal(echelonOf(5).label, "師団"); assert.equal(echelonOf(7).label, "軍団");
  const names = (t) => { const m = M(); m.pack.states[T.i].techLevel = t; for (const r of regimentsOf(T)) r.echelon = 0; sim.advanceMonthly({ year: 51, month: 1 }, createRandom(2)); return regimentsOf(T).map((r) => r.name).join(); };
  assert.ok(/将軍の軍/.test(names(1)), "低技術");
  assert.ok(/連隊/.test(names(3)), "連隊");
  assert.ok(/師団/.test(names(5)), "師団");
  assert.ok(/軍団/.test(names(7)), "軍団");
});
check("Azgaar から取り込んだ部隊（段が未設定）は、名前がそのまま残る", () => {
  const U = live()[2]; U.military = [{ i: 0, name: "Azgaar のオリジナル部隊", icon: "⚔️", state: U.i, cell: M().pack.burgs[U.capital].cell, x: 0, y: 0, bx: 0, by: 0, u: { infantry: 40, cavalry: 10 } }];
  sim.advanceMonthly({ year: 53, month: 1 }, createRandom(6));
  assert.equal(regimentsOf(U)[0].name, "Azgaar のオリジナル部隊"); assert.ok(regimentsOf(U)[0].echelon > 0);
});
check("1か月に変わる部隊数は1つだけ（急な増減を避ける）", () => {
  const m = M(); m.pack.states[T.i].techLevel = 3; for (const r of regimentsOf(T)) r.echelon = echelonOf(3).level;
  let worst = 0; for (let k = 0; k < 40; k++) { const n0 = regimentsOf(T).length, cmd = planArmyUpkeep(M(), T.i, createRandom(k)); if (cmd) store.commit(cmd); worst = Math.max(worst, Math.abs(regimentsOf(T).length - n0)); }
  assert.ok(worst <= 1, `${worst}`);
});
check("兵員の総数は、月ごとの更新で急には変わらない（月に数%以内）", () => {
  const tot = () => regimentsOf(T).reduce((n, r) => n + forceHeadcount(r.u), 0); const a = tot(); sim.advanceMonthly({ year: 52, month: 1 }, createRandom(4)); const b = tot();
  assert.ok(a === 0 || Math.abs(b - a) / a < 0.2, `${a}→${b}`);
});

console.log("=== 出来事: 時代と政体に合うものだけ ===");
check("出来事の種類が20を超える", () => assert.ok(MINOR_EVENTS.length >= 20, `${MINOR_EVENTS.length}`));
check("技術が低い国に、鉄道・ストライキ・放送は出ない", () => {
  const s = { i: 1, techDoctrine: Object.fromEntries(["agri", "ind", "transport", "comms", "medicine", "energy"].map((k) => [k, 1])), form: "Monarchy", regime: "absolute" };
  for (const k of ["railway", "strike", "broadcast", "powergrid", "newspaper"]) assert.ok(!eventFits(MINOR_EVENTS.find((e) => e.key === k), s), k);
});
check("技術が高い国には、飢饉や古い流行病は出にくい（農業・医療が進むと出ない）", () => {
  const s = { i: 1, techDoctrine: Object.fromEntries(["agri", "ind", "transport", "comms", "medicine", "energy"].map((k) => [k, 9])), form: "Republic", regime: "democracy" };
  for (const k of ["famine", "drought", "epidemic"]) assert.ok(!eventFits(MINOR_EVENTS.find((e) => e.key === k), s), k);
  assert.ok(eventFits(MINOR_EVENTS.find((e) => e.key === "broadcast"), s));
});
check("政体に合う出来事（君主制は婚礼、民主制は選挙、軍事政権はクーデター未遂）", () => {
  const f = (key, regime) => eventFits(MINOR_EVENTS.find((e) => e.key === key), { i: 1, regime, form: "Monarchy", techDoctrine: {} }, { hasNeighbor: true });
  assert.ok(f("wedding", "absolute") && !f("wedding", "democracy") && f("election", "democracy") && !f("election", "absolute") && f("coup", "junta") && !f("coup", "democracy"));
});
check("頻度を高くすると、出来事が増える。オフなら出ない", () => {
  const w = M(), N = 600; const cnt = (cfg) => { const r = createRandom(8); let n = 0; for (let i = 0; i < N; i++) n += rollMinorEvents(w, r, cfg).length; return n; };
  const normal = cnt({ enabled: true, frequency: "normal" }), high = cnt({ enabled: true, frequency: "high" }), low = cnt({ enabled: true, frequency: "low" });
  assert.ok(low < normal && normal < high && cnt({ enabled: false, frequency: "high" }) === 0, `${low}/${normal}/${high}`);
});
check("起きた出来事は、年表に載り、Undo で元に戻る", () => {
  const ev = { key: "harvest", stateId: S.i }, before = S.support ?? 70, n0 = M().ext.data.historyLog.length;
  const cmd = planMinorEvent(M(), ev, { year: 60, month: 5 }); store.commit(cmd);
  assert.equal(M().ext.data.historyLog.length, n0 + 1); assert.ok((S.support ?? 70) >= before);
  store.undo(); assert.equal(M().ext.data.historyLog.length, n0);
});
check("月ごとの更新は、1か月分が1回の Undo で戻る", () => {
  const n0 = M().ext.data.historyLog.length; const rndAll = { ...createRandom(2), next: () => 0 };
  sim.advanceMonthly({ year: 61, month: 1 }, rndAll); const n1 = M().ext.data.historyLog.length;
  assert.ok(n1 > n0); store.undo(); assert.equal(M().ext.data.historyLog.length, n0);
});
check("月ごとの更新を重ねても、データの整合性は崩れない", () => {
  const base = snapshotBaseline(M()); const r = createRandom(77);
  for (let k = 1; k <= 60; k++) sim.advanceMonthly({ year: 70 + Math.floor(k / 12), month: (k % 12) + 1 }, r);
  const bad = checkIntegrity(M(), base).filter((x) => x.level === "error"); assert.equal(bad.length, 0, bad.map((b) => b.message ?? b.text).join(" / "));
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
