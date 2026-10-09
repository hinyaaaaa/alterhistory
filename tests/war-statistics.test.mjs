// 戦争を何百回も自動で回し、勝率や講和までの長さに偏りが無いかを確かめる。
// 乱数は固定しない（実際の遊びと同じく毎回違う）。許容幅は、標準誤差の4倍以上を見込んで決めてある。
// 失敗したときは、再現のため seed を表示する。
import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { planDeclareAndResolveWar } from "../js/core/edit/wars.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };

const reg = (i, inf) => [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }];
const st = (i, inf) => ({ i, name: `国${i}`, techLevel: 5, industry: 200, rural: 800, urban: 200, cells: 1, capital: i, military: reg(i, inf), diplomacy: [] });
const N = 8;
const world = (ia, id) => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 100, height: 100 },
  pack: { states: [{ i: 0, name: "N", diplomacy: [] }, st(1, ia), st(2, id)], burgs: [null, { i: 1, name: "都1", cell: 1, state: 1 }, { i: 2, name: "都2", cell: 2, state: 2 }], provinces: [0], cultures: [null], religions: [null],
    cells: { state: new Uint16Array([0, 1, 2, 2, 2, 2, 2, 2]), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1), culture: new Uint16Array(N), religion: new Uint16Array(N) } },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [Math.max(0, i - 1), Math.min(N - 1, i + 1)]) }, p: Array.from({ length: N }, () => [0, 0]) } },
  markers: [], ext: { data: {} },
});
const seed = Date.now() >>> 0;
const RUNS = 500;
const run = (ia, id) => {
  const rnd = createRandom(seed ^ (ia * 31 + id));
  let att = 0, def = 0, stale = 0; const months = [];
  for (let k = 0; k < RUNS; k++) {
    const r = planDeclareAndResolveWar(world(ia, id), { attackers: [1], defenders: [2], date: { year: 1, month: 1 }, rnd });
    if (r.result.winner === "attacker") att++; else if (r.result.winner === "defender") def++; else stale++;
    months.push((r.endsAt.year - 1) * 12 + (r.endsAt.month - 1));
  }
  months.sort((a, b) => a - b);
  const pct = (x) => (100 * x) / RUNS;
  return { median: months[Math.floor(RUNS / 2)], att: pct(att), def: pct(def), stale: pct(stale), mean: months.reduce((a, b) => a + b, 0) / RUNS, p10: months[Math.floor(RUNS * 0.1)], p90: months[Math.floor(RUNS * 0.9)], max: months.at(-1), min: months[0] };
};
const equal = run(800, 800), strong = run(1600, 800), weak = run(800, 1600), crush = run(3200, 800);
console.log(`seed=${seed}  ${RUNS}回ずつ`);
for (const [n, r] of [["互角(1:1)", equal], ["攻撃側2倍", strong], ["防御側2倍", weak], ["攻撃側4倍", crush]]) console.log(`  ${n}: 攻撃側勝${r.att.toFixed(1)}% 防御側勝${r.def.toFixed(1)}% 引分${r.stale.toFixed(1)}%  経過の目安 平均${r.mean.toFixed(1)}か月（10%点${r.p10}〜90%点${r.p90}）`);

console.log("=== 勝率 ===");
check("互角なら、攻撃側と防御側の勝率の差が15ポイント以内", () => assert.ok(Math.abs(equal.att - equal.def) <= 15, `攻${equal.att} 防${equal.def}`));
check("強い側ほど勝つ（攻撃側2倍 > 互角 > 防御側2倍 の攻撃側勝率）", () => assert.ok(strong.att > equal.att + 10 && equal.att > weak.att + 10, `${strong.att} / ${equal.att} / ${weak.att}`));
check("4倍の戦力差なら、強い側が9割以上勝つ", () => assert.ok(crush.att >= 90, `${crush.att}`));
check("2倍の戦力差でも、弱い側が勝つことは3割未満", () => assert.ok(strong.def < 30 && weak.att < 30, `${strong.def} / ${weak.att}`));
check("引き分け（決着つかず）が、どの条件でも35%以下", () => assert.ok([equal, strong, weak, crush].every((r) => r.stale <= 35), JSON.stringify([equal, strong, weak, crush].map((r) => r.stale))));
check("防御側有利に偏りすぎていない（互角の防御側勝率が60%未満）", () => assert.ok(equal.def < 60, `${equal.def}`));

console.log("=== 講和までの長さ（経過の目安） ===");
check("目安は、どの条件でも平均6か月〜60か月の範囲", () => assert.ok([equal, strong, weak, crush].every((r) => r.mean >= 6 && r.mean <= 60), JSON.stringify([equal, strong, weak, crush].map((r) => r.mean))));
check("圧倒的な勝利ほど、短く終わる（4倍の平均 < 互角の平均）", () => assert.ok(crush.mean < equal.mean, `${crush.mean} vs ${equal.mean}`));
check("1か月未満・240か月（20年）超えの極端な戦争は出ない", () => assert.ok([equal, strong, weak, crush].every((r) => r.min >= 1 && r.max <= 240), JSON.stringify([equal, strong, weak, crush].map((r) => [r.min, r.max]))));
check("互角の戦争の長さに、はっきりしたばらつきがある（90%点が10%点の1.8倍以上）", () => assert.ok(equal.p90 >= equal.p10 * 1.8, `${equal.p10}〜${equal.p90}`));
check("互角の戦争の長さの中央値は、1年〜3年に収まる（これまでの手触りを保つ）", () => assert.ok(equal.median >= 12 && equal.median <= 36, `${equal.median}`));
check("圧勝（4倍）は、互角より平均で1割以上短い", () => assert.ok(crush.mean <= equal.mean * 0.9, `${crush.mean.toFixed(1)} vs ${equal.mean.toFixed(1)}`));

console.log(failed ? `\n${failed} 件失敗（seed=${seed}）` : "\n全て成功");
process.exit(failed ? 1 : 0);
