// v3.0.0: 国家の自律的行動（ルールベース）。プレイヤー国以外が判断して、宣戦・条約・講和・技術の採用を行う。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { getAi, planSetAi, planSetPlayer, isAutonomous, TEMPOS } from "../js/core/sim/ai-settings.js";
import { planAutonomy, makeContext, candidatesOf, pickDecision, characterOf, KIND_LABEL, aiView } from "../js/core/sim/ai.js";
import { paceOf, paceMultiplier, PACE_MIN, PACE_MAX } from "../js/core/sim/ai-pace.js";
import { progressRates } from "../js/core/sim/tech-progress.js";
import { planConcludeTreaty } from "../js/core/edit/treaties.js";
import { planDeclareAndResolveWar, listWars, planAdvanceWars } from "../js/core/edit/wars.js";
import { planTechMomentum, pendingFields } from "../js/core/sim/tech-momentum.js";
import { getTechDoctrine } from "../js/core/edit/doctrines.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { setProps } from "../js/core/edit/commands.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
async function world() {
  const { map } = await buildHistoricalWorld();
  map.ext.data.wars = []; map.ext.data.treaties = []; delete map.ext.data.alliances; for (const s of map.pack.states) if (s && s.alliance) s.alliance = 0;
  const L = map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
  L.forEach((s, k) => { s.neighbors = [L[(k + 1) % L.length].i, L[(k + L.length - 1) % L.length].i, L[(k + 2) % L.length].i]; });
  const store = createStore({ map }), sim = createSimActions({ store, renderer: { requestRender() {} } });
  return { store, sim, M: () => store.getState().map, L: () => L, ids: L.map((s) => s.i) };
}
const run = (w, years, rnd, { advanceWars = true } = {}) => {
  const y0 = w.M().worldTime.year;
  for (let m = 0; m < years * 12; m++) {
    const date = { year: y0 + Math.floor(m / 12), month: (m % 12) + 1 }; w.M().worldTime = date;
    if (advanceWars) { const a = planAdvanceWars(w.M(), date, rnd); if (a) w.store.commit(a); }
    w.sim.advanceMonthly(date, rnd);
  }
};
const date0 = (w) => ({ ...w.M().worldTime });

console.log("=== 設定 ===");
{
  const w = await world(), P = w.ids[0];
  check("既定: 有効・ふつう・プレイヤー国なし（自律は動かない）", () => { const a = getAi(w.M()); assert.ok(a.enabled && a.tempo === "normal" && a.players.length === 0 && a.targetPlayers); assert.equal(planAutonomy(w.M(), date0(w), createRandom(1)).length, 0); });
  check("プレイヤー国を決めると、それ以外が自律する", () => {
    w.store.commit(planSetPlayer(w.M(), P, true));
    assert.ok(!isAutonomous(w.M(), P)); assert.ok(w.ids.slice(1).every((i) => isAutonomous(w.M(), i)));
  });
  check("無効にすると、誰も自律しない", () => { w.store.commit(planSetAi(w.M(), { enabled: false })); assert.ok(w.ids.every((i) => !isAutonomous(w.M(), i))); w.store.undo(); });
  check("設定は Undo で戻り、既定に戻れば保存から消える", () => { w.store.undo(); assert.equal(w.M().ext.data.ai, undefined); });
  check("判断の速さは 慎重・ふつう・積極 だけ", () => { assert.throws(() => planSetAi(w.M(), { tempo: "wild" }), /慎重/); assert.deepEqual(Object.keys(TEMPOS), ["cautious", "normal", "active"]); });
  check("存在しない国はプレイヤー国にできない", () => assert.throws(() => planSetPlayer(w.M(), 999, true), /ありません/));
}

console.log("=== 判断のルール ===");
{
  const w = await world(), [P, A, B] = w.ids;
  w.store.commit(planSetPlayer(w.M(), P, true));
  const sa = () => w.M().pack.states[A], date = date0(w);
  const budget = { warsLeft: 1, ongoing: 0, maxOngoing: 9 };
  // A が B に対して圧倒的に強い状況を作る（部隊の兵力は previewWar が読むので、その比較を固定する）
  const only = (ctx, from, to) => { ctx.share = (a, b) => (a === from ? (b === to ? 0.95 : 0.3) : b === from ? 0.7 : 0.5); return ctx; }; // from が to にだけ圧倒的に強い
  const strongA = (ctx) => only(ctx, A, B);
  const warOn = (ctx, id = A) => candidatesOf(strongA(ctx), w.M().pack.states[id], budget).major.find((c) => c.kind === "war" && c.targetId === B);
  check("優位・平時・安定していれば、宣戦の候補になる（理由つき）", () => {
    sa().support = 80; sa().ideas; w.M().ext.data.ideas = { [A]: { enlight: 0.2, liberal: 0.1, nation: 0.9, equal: 0.2, tradition: 0.3, faith: 0.2 } };
    const c = warOn(makeContext(w.M(), date)); assert.ok(c, "候補が出る"); assert.ok(c.u > 0 && /宣戦した/.test(c.reason) && c.reason.includes("優位"));
  });
  check("同盟国には宣戦しない", () => {
    w.store.commit(planConcludeTreaty(w.M(), { kind: "alliance", parties: [{ state: A, role: "盟主" }, { state: B }], terms: { bind: "medium" }, months: 120, date }).command);
    assert.ok(!warOn(makeContext(w.M(), date))); w.store.undo();
  });
  check("不可侵条約の相手には宣戦しない", () => {
    w.store.commit(planConcludeTreaty(w.M(), { kind: "nonaggression", parties: [{ state: A }, { state: B }], terms: { mode: "nonaggression" }, months: 120, date }).command);
    assert.ok(!warOn(makeContext(w.M(), date))); w.store.undo();
  });
  check("民意が低い・戦争中の国は、新しい戦争を始めない", () => {
    sa().support = 30; assert.ok(!warOn(makeContext(w.M(), date))); sa().support = 80;
    const r = planDeclareAndResolveWar(w.M(), { attackers: [A], defenders: [w.ids[3]], date, rnd: createRandom(1) }); w.store.commit(r.command);
    assert.ok(!warOn(makeContext(w.M(), date))); w.store.undo();
  });
  check("直前に戦った相手とは、すぐには戦わない（再戦の間隔）", () => {
    const r = planDeclareAndResolveWar(w.M(), { attackers: [A], defenders: [B], date: { year: date.year - 5, month: 1 }, rnd: createRandom(1) }); w.store.commit(r.command);
    const l = listWars(w.M()).find((x) => x.id === r.id); l.endedAt = { year: date.year - 4, month: 1 };
    assert.ok(!warOn(makeContext(w.M(), date))); w.store.undo();
  });
  check("宣戦の技術的な条件: 同時進行・年間の上限（budget）が 0 なら出ない", () => {
    const c = candidatesOf(strongA(makeContext(w.M(), date)), sa(), { warsLeft: 0, ongoing: 0, maxOngoing: 9 }); assert.ok(!c.major.some((x) => x.kind === "war"));
  });
  check("宣戦の種類をオフにすると、宣戦の候補は出ない", () => {
    w.store.commit(planSetAi(w.M(), { verbs: { war: false } })); assert.ok(!warOn(makeContext(w.M(), date))); w.store.undo();
  });
  check("プレイヤー国に宣戦しない設定なら、プレイヤー国は目標にならない（します設定なら、重みが下がる）", () => {
    const pw = (ctx) => candidatesOf(only(ctx, A, P), sa(), budget).major.find((c) => c.kind === "war" && c.targetId === P);
    sa().neighbors = [P, B]; w.M().pack.states[P].neighbors = [A];
    w.store.commit(planSetAi(w.M(), { targetPlayers: false })); assert.ok(!pw(makeContext(w.M(), date))); w.store.undo();
    assert.ok(pw(makeContext(w.M(), date)), "既定は、プレイヤー国にも宣戦する");
  });
  check("国の性格: 民族主義・食料不足・政体で、拡張の意欲が変わる", () => {
    const base = { food: 1, war: 0, stress: { food: 0, health: 0, order: 0, fiscal: 0 }, urbanShare: 0.2, lv: { comms: 3, medicine: 3, ind: 3 } }, st = { regime: "absolute" };
    const calm = characterOf(w.M(), st, base, { nation: 0.1, liberal: 0.2, enlight: 0.2 }), hot = characterOf(w.M(), st, { ...base, food: 0.3 }, { nation: 0.9, liberal: 0.2, enlight: 0.2 });
    assert.ok(hot.expansion > calm.expansion + 0.3); assert.ok(Object.values(hot).every((v) => v >= 0 && v <= 1));
  });
  check("重み付き選択: 候補が無ければ何もしない。何もしない重みもある", () => {
    assert.equal(pickDecision([], createRandom(1)), null);
    const only = [{ u: 0.01, kind: "x" }]; let n = 0; for (let i = 0; i < 200; i++) if (pickDecision(only, createRandom(i + 1))) n++; assert.ok(n < 20);
    assert.equal(pickDecision([{ u: 5, kind: "y" }], { next: () => 0 }).kind, "y");
  });
}

console.log("=== 判断の速さ（ゲーム内の月で数える） ===");
{
  const w = await world(), [P, A] = w.ids; w.store.commit(planSetPlayer(w.M(), P, true));
  const sure = { ...createRandom(1), next: () => 0, chance: () => true };
  const thinks = (tempo) => {
    w.store.commit(planSetAi(w.M(), { tempo, verbs: { war: false, treaty: false, peace: false } }));
    const pend = (id) => { w.M().ext.data.techMomentum = { [id]: { agri: { target: getTechDoctrine(w.M().pack.states[id]).agri + 1, via: "year" } } }; };
    let n = 0; for (let m = 0; m < 12; m++) { pend(A); if (planAutonomy(w.M(), { year: 60 + 0, month: (m % 12) + 1 }, sure).some((d) => d.kind === "tech" && d.stateId === A)) n++; }
    w.store.undo(); return n;
  };
  check("1か国が考えるのは、慎重で年1回・ふつうで年2回・積極で年4回", () => assert.deepEqual([thinks("cautious"), thinks("normal"), thinks("active")], [1, 2, 4]));
  check("時計の速さに依存しない: 同じ月なら、何度求めても同じ国が考える", () => {
    const d = { year: 61, month: 3 }; const a = planAutonomy(w.M(), d, { ...sure }).map((x) => x.stateId + x.kind), b = planAutonomy(w.M(), d, { ...sure }).map((x) => x.stateId + x.kind); assert.deepEqual(a, b);
  });
}

console.log("=== 発展のペース ===");
{
  const w = await world(), [P, A] = w.ids; w.store.commit(planSetPlayer(w.M(), P, true));
  const date = date0(w);
  check("プレイヤー国は 1.0、補正は 0.6〜1.6 に収まる", () => {
    const p = paceOf(w.M(), date); assert.ok(Math.abs(p.get(P).mult - 1) < 0.6 && p.get(P).index === 1 || p.get(P).index > 0);
    for (const v of p.values()) assert.ok(v.mult >= PACE_MIN - 1e-9 && v.mult <= PACE_MAX + 1e-9, String(v.mult));
  });
  check("進みすぎた国は鈍り、遅れた国は速まる", () => {
    const sA = w.M().pack.states[A]; const keep = { ...sA.techDoctrine };
    w.store.commit(setProps(sA, { techDoctrine: Object.fromEntries(Object.keys(keep).map((k) => [k, 9])), techLevel: 9 }));
    const hi = paceOf(w.M(), { year: date.year + 3, month: 1 }).get(A).mult; w.store.undo();
    w.store.commit(setProps(sA, { techDoctrine: Object.fromEntries(Object.keys(keep).map((k) => [k, 1])), techLevel: 1 }));
    const lo = paceOf(w.M(), { year: date.year + 6, month: 1 }).get(A).mult; w.store.undo();
    assert.ok(hi < 1 && lo > 1, `進みすぎ ${hi.toFixed(2)} / 遅れ ${lo.toFixed(2)}`);
  });
  check("補正は自律する国だけ。プレイヤー国・プレイヤー国なしでは 1", () => {
    assert.equal(paceMultiplier(w.M(), P, date), 1);
    w.store.commit(planSetPlayer(w.M(), P, false)); assert.equal(paceMultiplier(w.M(), A, { year: date.year + 9, month: 1 }), 1); w.store.undo();
  });
  check("技術の進捗の速さに反映される（自律する国だけ）", () => {
    const sA = w.M().pack.states[A], later = { year: date.year + 12, month: 1 };
    w.store.commit(setProps(sA, { techDoctrine: Object.fromEntries(Object.keys(sA.techDoctrine).map((k) => [k, 9])), techLevel: 9 }));
    const withPace = progressRates(w.M(), A, later).rates.agri; w.store.commit(planSetPlayer(w.M(), A, true));
    const asPlayer = progressRates(w.M(), A, { year: date.year + 15, month: 1 }).rates.agri;
    assert.ok(asPlayer > 0 && withPace < asPlayer, `${withPace} < ${asPlayer}`); w.store.undo(); w.store.undo();
  });
}

console.log("=== 実行（既存の操作と同じ。理由つきで年表に残る） ===");
{
  const w = await world(), [P, A] = w.ids; w.store.commit(planSetPlayer(w.M(), P, true));
  check("技術の採用: 自律する国は、実った機運を採用する。プレイヤー国は採用しない", () => {
    const lv = (id) => JSON.stringify(getTechDoctrine(w.M().pack.states[id]));
    for (const id of [P, A]) w.M().ext.data.techMomentum = { ...(w.M().ext.data.techMomentum ?? {}), [id]: { agri: { target: getTechDoctrine(w.M().pack.states[id]).agri + 1, via: "year" } } };
    const a0 = lv(A), p0 = lv(P); run(w, 12, createRandom(9), { advanceWars: false });
    assert.notEqual(lv(A), a0, "自律国は採用した"); assert.equal(lv(P), p0, "プレイヤー国は変わらない");
  });
  check("年表に、理由つきの「国家の判断」が残る（プレイヤー国は主体にならない）", () => {
    const notes = listHistory(w.M()).filter((h) => h.type === "ai"); assert.ok(notes.length >= 1);
    for (const h of notes) { assert.ok(h.title.length > 8 && h.data?.ai && Object.values(KIND_LABEL).includes(h.detail)); assert.notEqual(h.states[0], P); }
  });
  check("Undo で、採用も年表の理由も、1回で戻る", () => {
    const lvA = () => JSON.stringify(getTechDoctrine(w.M().pack.states[A])), n = () => listHistory(w.M()).filter((h) => h.type === "ai").length;
    w.M().ext.data.techMomentum = { [A]: { ind: { target: getTechDoctrine(w.M().pack.states[A]).ind + 1, via: "year" } } };
    const a0 = lvA(), n0 = n(), rnd = { ...createRandom(2), next: () => 0, chance: () => true };
    let hit = 0; for (let m = 1; m <= 12 && !hit; m++) { w.M().worldTime = { year: 90, month: m }; w.sim.advanceMonthly({ year: 90, month: m }, rnd); if (lvA() !== a0) hit = m; }
    assert.ok(hit && n() > n0, "採用と理由が残った");
    // 月の更新のほかの変更（思潮・技術の進捗など）が後ろにあるので、採用が戻るまで Undo する。その同じ1回で、理由も消える（一体のまま）
    let steps = 0; while (lvA() !== a0 && steps++ < 30) { const before = n(); w.store.undo(); if (lvA() === a0) { assert.ok(n() < before, "採用と同じ1回で、理由も戻る"); break; } }
    assert.equal(lvA(), a0);
  });
}

console.log("=== 長期の振る舞い ===");
{
  const w = await world(), P = w.ids[0]; w.store.commit(planSetPlayer(w.M(), P, true));
  run(w, 100, createRandom(3));
  const wars = listWars(w.M()), notes = listHistory(w.M()).filter((h) => h.type === "ai");
  check("100年で、宣戦・条約・技術の採用が起き、戦争の数は人が動かすのと同じ程度（数戦〜20戦）", () => {
    const kinds = new Set(notes.map((n) => n.detail)); assert.ok(kinds.has("宣戦") && kinds.has("技術の採用") && (kinds.has("不可侵条約") || kinds.has("経済協力")), [...kinds].join());
    assert.ok(wars.length >= 2 && wars.length <= 20, `戦争 ${wars.length}`);
  });
  check("自律国どうしの戦争は、講和条約で終わる（終わらない戦争はプレイヤー国が加わるものだけ）", () => {
    const open = wars.filter((x) => !x.endedAt), ended = wars.filter((x) => x.endedAt);
    assert.ok(ended.length >= 1); assert.ok(open.every((x) => [...x.attackers, ...x.defenders].includes(P)), "未講和の戦争は、プレイヤー国が加わるものだけ");
    assert.ok(listHistory(w.M()).some((h) => /treaty|peace/.test(h.type) && /講和|和約|条約/.test(h.title)));
  });
  check("プレイヤー国の技術・条約は、自律では動かない", () => {
    assert.ok(!(w.M().ext.data.treaties ?? []).some((t) => t.parties.some((p) => p.state === P) && t.kind !== "peace"), "プレイヤー国が結ぶ条約は無い");
  });
  check("国家タブ用の表示データ（自律国は性格・ペース・次の判断。プレイヤー国は自律しない）", () => {
    const v = aiView(w.M(), w.ids[2]); assert.ok(v.autonomous && v.character && v.pace && v.nextThinkMonths >= 1 && v.recent.length >= 0);
    const p = aiView(w.M(), P); assert.ok(p.player && !p.autonomous);
  });
}

if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
