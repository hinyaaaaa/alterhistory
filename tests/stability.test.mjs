// v2.4.1 A5: 国の安定度（民意・戦争・継承・直近の出来事 → 安定 / 不安 / 危機）。しきい値は docs/HANDOFF.md と同じ。
import assert from "node:assert/strict";
import { nationStability, STABILITY_LEVELS } from "../js/core/edit/stability.js";

const mkMap = (support, { wars = [], log = [], leader = null, now = { year: 10, month: 6 } } = {}) => ({
  worldTime: now,
  pack: { states: [{ i: 0 }, { i: 1, name: "A", support }, { i: 2, name: "B" }] },
  ext: { data: { wars, historyLog: log, leaders: leader ? { 1: { current: { stability: leader }, history: [] } } : undefined } },
});
const st = (m) => nationStability(m, m.pack.states[1]);
const war = (over = {}) => ({ id: 1, attackers: [1], defenders: [2], type: "conventional", startedAt: { year: 10, month: 1 }, ...over });

assert.deepEqual(STABILITY_LEVELS.map((l) => [l.key, l.min]), [["stable", 55], ["uneasy", 35], ["crisis", -Infinity]], "段階のしきい値");
assert.equal(st(mkMap(undefined)).score, 70, "民意が値なしなら既定の70");
assert.equal(st(mkMap(70)).key, "stable");
assert.equal(st(mkMap(55)).key, "stable", "55点ちょうどは安定"); assert.equal(st(mkMap(54)).key, "uneasy", "54点は不安");
assert.equal(st(mkMap(35)).key, "uneasy", "35点ちょうどは不安"); assert.equal(st(mkMap(34)).key, "crisis", "34点は危機");
// 戦争: 1件ごとに −10、内戦は −20、合計の下限は −30。終わった戦争は数えない
assert.equal(st(mkMap(70, { wars: [war()] })).score, 60);
assert.equal(st(mkMap(70, { wars: [war({ type: "civil" })] })).score, 50);
assert.equal(st(mkMap(70, { wars: [war(), war({ id: 2 }), war({ id: 3 }), war({ id: 4 })] })).score, 40, "下限 −30");
assert.equal(st(mkMap(70, { wars: [war({ endedAt: { year: 10, month: 3 } })] })).score, 70, "終わった戦争は数えない");
assert.equal(st(mkMap(70, { wars: [war({ attackers: [2], defenders: [3] })] })).score, 70, "加わっていない戦争は数えない");
// 直近の出来事: 12か月以内・この国に関わるものだけ。1件 −6、下限 −18
const ev = (type, year, month, states = [1]) => ({ type, year, month, title: "x", states });
assert.equal(st(mkMap(70, { log: [ev("rebellion", 10, 1)] })).score, 64);
assert.equal(st(mkMap(70, { log: [ev("rebellion", 9, 6)] })).score, 64, "ちょうど12か月前は含む");
assert.equal(st(mkMap(70, { log: [ev("rebellion", 9, 5)] })).score, 70, "13か月前は含まない");
assert.equal(st(mkMap(70, { log: [ev("rebellion", 10, 1, [2])] })).score, 70, "別の国の出来事は含まない");
assert.equal(st(mkMap(70, { log: [ev("founding", 10, 1)] })).score, 70, "安定を損なわない種類は含まない");
assert.equal(st(mkMap(70, { log: [1, 2, 3, 4, 5].map((k) => ev("exhaustion", 10, k)) })).score, 52, "下限 −18");
assert.equal(st(mkMap(70, { log: [ev("rebellion", 11, 1)] })).score, 70, "未来の日付は含まない");
// 指導者の継承: 争いあり −10、大きな混乱 −25、安定は引かない
assert.equal(st(mkMap(70, { leader: "dispute" })).score, 60); assert.equal(st(mkMap(70, { leader: "chaos" })).score, 45); assert.equal(st(mkMap(70, { leader: "stable" })).score, 70);
assert.equal(st(mkMap(70, { leader: "chaos" })).key, "uneasy"); assert.equal(st(mkMap(70, { leader: "chaos", wars: [war()] })).score, 35, "70−25−10＝35点ちょうど"); assert.equal(st(mkMap(60, { leader: "chaos", wars: [war()] })).key, "crisis", "支持60＋混乱＋戦争＝25点で危機");
// 要因が内訳に並ぶ
const r = st(mkMap(70, { wars: [war()], log: [ev("schism", 10, 2)] }));
assert.equal(r.score, 54); assert.equal(r.key, "uneasy");
assert.deepEqual(r.factors.map((f) => f.label), ["民意", "戦争1件", "直近の出来事1件"]);
console.log("国の安定度: OK");
