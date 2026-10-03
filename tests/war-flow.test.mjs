import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planCreateAlliance } from "../js/core/edit/alliances.js";
import { planDeclareAndResolveWar, planSignPeace, planRenameWar, warsAwaitingTreaty, planPeaceVenue, listWars } from "../js/core/edit/wars.js";
import { simpleRelation } from "../js/core/edit/diplomacy.js";
import { blockedPairs } from "../js/core/sim/sanctions.js";
import { planAnnualConscription } from "../js/core/sim/military.js";
import { planRemoveEntity } from "../js/core/edit/entities.js";

const reg = (i, inf) => [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }];
const st = (i, name, inf, extra = {}) => ({ i, name, techLevel: 5, industry: 200, rural: 800, urban: 200, cells: 1, capital: i, military: reg(i, inf), diplomacy: [], ...extra });
const N = 8;
const map = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 },
  meta: { width: 100, height: 100 },
  pack: {
    states: [{ i: 0, name: "Neutrals", diplomacy: [] }, st(1, "ア", 5000), st(2, "イ", 800), st(3, "ウ", 800), st(4, "エ", 800), st(5, "オ", 800)],
    burgs: [null, ...[1, 2, 3, 4, 5].map((i) => ({ i, name: `都${i}`, cell: i, state: i }))],
    provinces: [0], cultures: [null, { i: 1, name: "文1", color: "#111", cells: 0 }], religions: [null, { i: 1, name: "宗1", color: "#222", cells: 0, origins: [0] }, { i: 2, name: "宗2", color: "#333", cells: 0, origins: [1] }],
    cells: { state: new Uint16Array([0, 1, 2, 3, 4, 5, 5, 5]), province: new Uint16Array(N), biome: new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]), culture: new Uint16Array(N), religion: new Uint16Array(N) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [Math.max(0, i - 1), Math.min(N - 1, i + 1)]) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});

const store = createStore({ map: map() });
const rnd = createRandom(3);
const date = { year: 1, month: 1 };
const run = (cmd) => store.commit(cmd);

// --- 同盟の拘束力 ---
run(planCreateAlliance(store.getState().map, "防衛同盟", [2, 3], date, "standard").command);
run(planCreateAlliance(store.getState().map, "強固同盟", [4, 5], date, "strict").command);
assert.equal(simpleRelation(store.getState().map, 2, 3), "alliance");
assert.throws(() => planCreateAlliance(store.getState().map, "x", [1, 2], date, "mushy"), /拘束力/);

// 標準: 攻められた側(2)の同盟国(3)は防衛参戦
let r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date, rnd });
assert.ok(r.joined.some((j) => j.id === 3 && j.side === "defender"), "標準同盟は防衛参戦する");
run(r.command);
const w1 = listWars(store.getState().map)[0];
assert.ok(w1.endsAt && w1.durationMonths >= 1 && w1.endsAt.year * 12 + w1.endsAt.month > 1 * 12 + 1, "終戦日が自動で決まる");
assert.equal(simpleRelation(store.getState().map, 1, 2), "hostile");
// 同盟国の貿易封鎖（標準以上）：参戦しない立場でも盟主の敵国と取引しない
assert.ok(blockedPairs(store.getState().map).has("1-2") && blockedPairs(store.getState().map).has("1-3"));

// 強固: 攻める側の同盟国も参戦
const s2 = createStore({ map: map() }); const m2 = s2.getState().map;
s2.commit(planCreateAlliance(m2, "強固", [4, 5], date, "strict").command);
const r2 = planDeclareAndResolveWar(s2.getState().map, { attackers: [4], defenders: [1], date, rnd });
assert.ok(r2.joined.some((j) => j.id === 5 && j.side === "attacker"), "強固同盟は攻める戦争にも参戦");
// 緩やか: 何も起きない
const s3 = createStore({ map: map() });
s3.commit(planCreateAlliance(s3.getState().map, "緩", [2, 3], date, "loose").command);
const r3 = planDeclareAndResolveWar(s3.getState().map, { attackers: [1], defenders: [2], date, rnd });
assert.equal(r3.joined.length, 0);
assert.ok(!blockedPairs(s3.getState().map).has("1-3"));

// --- 講和：戦争名変更・講和地・条約名 ---
const m = store.getState().map;
assert.equal(warsAwaitingTreaty(m).length, 1);
run(planRenameWar(m, w1.id, "テスト大戦"));
assert.equal(listWars(store.getState().map)[0].name, "テスト大戦");
assert.throws(() => planRenameWar(store.getState().map, w1.id, ""), /入力/);
const v = planPeaceVenue(store.getState().map, w1.id, rnd);
assert.ok(v && v.treatyName === `${v.place}条約`);
assert.ok(v.neutral === (v.stateId === 4 || v.stateId === 5), "中立国(4,5=同盟外・戦争外)の都市が選ばれる");
run(planSignPeace(store.getState().map, w1.id, { toStateId: 1, treatyName: v.treatyName }, date));
const done = listWars(store.getState().map)[0];
assert.deepEqual(done.endedAt, w1.endsAt, "終戦日は自動算出された日付になる");
assert.equal(simpleRelation(store.getState().map, 1, 2), "none", "講和後は中立に戻る");
assert.equal(blockedPairs(store.getState().map).size, 0);

// --- 年次の兵力変動：突拍子もない増加をしない ---
const s4 = createStore({ map: map() });
let prev = null;
for (let y = 0; y < 30; y++) {
  const c = planAnnualConscription(s4.getState().map, 1);
  if (c) s4.commit(c);
  const u = s4.getState().map.pack.states[1].military[0].u;
  if (prev) for (const k of Object.keys(u)) {
    if (k === "nuclear") assert.equal(u[k], 0, "核は年次で増えない");
    else if (prev[k] >= 50) assert.ok(u[k] <= prev[k] * 1.081 + 1 && u[k] >= prev[k] * 0.959 - 1, `${k} 急変 ${prev[k]}→${u[k]}`);
    else assert.ok(u[k] - prev[k] <= Math.max(5, prev[k] * 0.1 + 2), `${k} 小規模での急増 ${prev[k]}→${u[k]}`);
  }
  prev = { ...u };
}
assert.ok(prev.navy >= 1 && prev.navy <= 5, `海に面する国は海軍を少数だけ持てる（${prev.navy}）`);

// 内陸国（ウ=セル3は水域に隣接しない）は海軍を持てない
const s5 = createStore({ map: map() });
for (let y = 0; y < 30; y++) { const c = planAnnualConscription(s5.getState().map, 3); if (c) s5.commit(c); }
assert.equal(s5.getState().map.pack.states[3].military[0].u.navy, 0, "内陸国に海軍は生まれない");
// 初期に過剰な海軍がいても、条件を満たさなければ縮小していく
s5.getState().map.pack.states[3].military[0].u.navy = 40;
for (let y = 0; y < 10; y++) { const c = planAnnualConscription(s5.getState().map, 3); if (c) s5.commit(c); }
assert.ok(s5.getState().map.pack.states[3].military[0].u.navy < 40, "内陸国の海軍は年々減る");

// --- 削除 ---
const s6 = createStore({ map: map() });
s6.getState().map.pack.cells.religion[2] = 1;
s6.commit(planRemoveEntity(s6.getState().map, "religion", 1));
assert.ok(s6.getState().map.pack.religions[1].removed && s6.getState().map.pack.cells.religion[2] === 0, "宗教を削除すると信者の土地は無所属になる");
s6.undo();
assert.ok(!s6.getState().map.pack.religions[1].removed && s6.getState().map.pack.cells.religion[2] === 1, "削除は Undo で戻る");
// 戦争中の国家は消せない
const s7 = createStore({ map: map() });
const rr = planDeclareAndResolveWar(s7.getState().map, { attackers: [1], defenders: [2], date, rnd }); s7.commit(rr.command);
assert.throws(() => planRemoveEntity(s7.getState().map, "state", 2), /戦争中/);
console.log("war-flow OK");
