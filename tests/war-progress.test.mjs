import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planAdvanceWars, planFinishWar, planSignTreaty, planPeaceVenue, suggestTreaty, treatyBudget, winnerShares, listWars, warsAwaitingTreaty, warsOngoing, planRenameWar } from "../js/core/edit/wars.js";
import { planRenameEntity } from "../js/core/edit/entities.js";
import { forceHeadcount } from "../js/core/sim/units.js";
import { officialName } from "../js/core/names.js";

const reg = (id, i, inf, ex = {}) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0, ...ex } });
const st = (i, name, full, regs, o = {}) => ({ i, name, fullName: full, techLevel: 6, industry: 300, rural: 900, urban: 100, cells: 4, capital: i, morale: 70, doctrine: "balanced", military: regs, diplomacy: [], treasury: 1000, ...o });
const N = 16;
// 一列の地図: [ア][ア][ア][ア] [イ][イ][イ][イ] [ウ][ウ][ウ][ウ] [中立][中立][中立][中立]
const mk = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 10, height: 10 }, markers: [], notes: [],
  pack: {
    states: [{ i: 0, name: "N", diplomacy: [] }, st(1, "アルダ", "アルダ王国", [reg(1, 0, 6000)], { capital: 1 }), st(2, "ボルク", "ボルク公国", [reg(2, 0, 1500)], { capital: 3 }), st(3, "シグ", "シグ共和国", [reg(3, 0, 1500)], { capital: 6 }), st(4, "ネウ", "ネウ連邦", [reg(4, 0, 500)], { capital: 8 })],
    burgs: [null, ...[[0, 1], [1, 1], [4, 2], [5, 2], [6, 2], [8, 3], [9, 3], [12, 4], [13, 4]].map(([cell, state], k) => ({ i: k + 1, name: `都${k + 1}`, cell, state }))],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: Uint16Array.from([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});
const date = { year: 1, month: 1 };
const men = (s) => s.military.reduce((n, r) => n + forceHeadcount(r.u), 0);

// --- 時間経過で損害が積み重なる ---
const store = createStore({ map: mk() });
const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(4), type: "conventional" });
store.commit(r.command);
let m = store.getState().map; const w = listWars(m)[0];
assert.equal(men(m.pack.states[2]), 1500, "宣戦布告の時点ではまだ損害が出ていない");
assert.equal(w.progress, 0); assert.ok(warsOngoing(m).length === 1 && warsAwaitingTreaty(m).length === 0, "戦闘中は講和待ちに入らない");
const mid = { year: 1 + Math.floor((w.durationMonths / 2 + 0) / 12), month: 1 + (Math.floor(w.durationMonths / 2) % 12) };
const c1 = planAdvanceWars(m, mid); assert.ok(c1, "月が進むと損害が出る"); store.commit(c1);
m = store.getState().map; const half = men(m.pack.states[2]);
assert.ok(half < 1500, "途中まで損害が出る"); assert.ok(listWars(m)[0].progress > 0 && listWars(m)[0].progress < 1);
store.commit(planFinishWar(m, w.id)); m = store.getState().map;
assert.ok(men(m.pack.states[2]) <= half, "最後まで進めると損害がさらに増える");
assert.equal(listWars(m)[0].progress, 1); assert.equal(warsAwaitingTreaty(m).length, 1);
assert.equal(planAdvanceWars(m, { year: 99, month: 1 }), null, "戦闘が終わった戦争はもう進まない");
// 戦闘中の講和は拒否される
const s2 = createStore({ map: mk() }); const r2 = planDeclareAndResolveWar(s2.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(4) }); s2.commit(r2.command);
assert.throws(() => planSignTreaty(s2.getState().map, r2.id, { kind: "white" }, date), /戦闘がまだ続いて/);

// --- 戦争の形態 ---
const lim = planDeclareAndResolveWar(mk(), { attackers: [1], defenders: [2], date, rnd: createRandom(4), type: "limited" });
const tot = planDeclareAndResolveWar(mk(), { attackers: [1], defenders: [2], date, rnd: createRandom(4), type: "total" });
const con = planDeclareAndResolveWar(mk(), { attackers: [1], defenders: [2], date, rnd: createRandom(4), type: "conventional" });
assert.ok(lim.endsAt.year * 12 + lim.endsAt.month <= con.endsAt.year * 12 + con.endsAt.month && con.endsAt.year * 12 + con.endsAt.month <= tot.endsAt.year * 12 + tot.endsAt.month, "限定戦＜通常戦＜総力戦の順に長い");
assert.ok(lim.result.warScore < con.result.warScore && con.result.warScore <= tot.result.warScore, "要求できる大きさも同じ順");
// 非対称戦：1回の乱数ではなく、多数の試行の平均で性質を確かめる
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const trial = (type) => { const rows = []; for (let k = 1; k <= 40; k++) { const q = planDeclareAndResolveWar(mk(), { attackers: [1], defenders: [4], date, rnd: createRandom(k), type }); rows.push({ months: (q.endsAt.year - 1) * 12 + q.endsAt.month - 1, dec: q.result.decisiveness, mor: q.result.moraleDelta[1], win: q.result.winner }); } return rows; };
const A = trial("asymmetric"), C = trial("conventional");
assert.ok(avg(A.map((x) => x.months)) > avg(C.map((x) => x.months)) * 1.5, "非対称戦は通常戦より大幅に長引く");
assert.ok(avg(A.map((x) => x.dec)) < avg(C.map((x) => x.dec)), "非対称戦は決着がつきにくい（弱い側が戦力差を縮める）");
assert.ok(avg(A.map((x) => x.mor)) < avg(C.map((x) => x.mor)), "非対称戦では強い側の士気も削られる");
assert.ok(C.filter((x) => x.win === "attacker").length > A.filter((x) => x.win === "attacker").length, "同じ戦力差でも、非対称戦のほうが強い側は勝ちにくい");

// --- 戦争名は実際の戦場（都市）から ---
const places = new Set(listWars(m)[0].battles.map((b) => b.place));
const burgNames = new Set(m.pack.burgs.filter(Boolean).map((b) => b.name));
assert.ok([...places].every((p) => burgNames.has(p)), "戦闘の場所は実在する都市");
assert.ok(listWars(m)[0].battles.every((b) => m.pack.burgs[b.burgId]?.state === 2 || m.pack.burgs[b.burgId]?.state === 1), "戦場は交戦国の都市");
assert.ok([...burgNames].some((n) => listWars(m)[0].name.includes(n)) || /世界大戦/.test(listWars(m)[0].name), `戦争名は戦場の地名から: ${listWars(m)[0].name}`);
const front = listWars(m)[0].battles.map((b) => m.pack.burgs[b.burgId]).filter((b) => b && b.state === 2);
assert.ok(front.length === 0 || front.every((b) => b.cell <= 6), "攻められた側(ボルク)の国境に近い都市から戦場になる");

// --- 講和地：勝者の都市（膠着なら中立国の都市） ---
const venue = planPeaceVenue(m, w.id, createRandom(1));
const winner = listWars(m)[0].result.winner;
if (winner === "stalemate") assert.ok(venue.role === "mediator" && [3, 4].includes(venue.stateId), "膠着は仲介する中立国");
else assert.ok(venue.role === "winner" && venue.stateId === (winner === "attacker" ? 1 : 2), "勝敗がついたら戦勝国の都市");
const stale = JSON.parse(JSON.stringify({ x: 1 })); void stale;
{ const ms = mk(); const rr = planDeclareAndResolveWar(ms, { attackers: [1], defenders: [2], date, rnd: createRandom(1) }); const sm = createStore({ map: ms }); sm.commit(rr.command);
  const ww = listWars(sm.getState().map)[0]; ww.result.winner = "stalemate"; // 膠着にして検証
  const v2 = planPeaceVenue(sm.getState().map, ww.id, createRandom(3)); assert.ok(v2.role === "mediator" && v2.neutral && [3, 4].includes(v2.stateId), "膠着なら仲介国（交戦国と無関係な国）の都市"); }

// --- 複数国が戦う講和：戦争スコア・複数の勝者へ賠償・記録 ---
const s3 = createStore({ map: mk() });
const r3 = planDeclareAndResolveWar(s3.getState().map, { attackers: [1, 3], defenders: [2], date, rnd: createRandom(2), type: "total" });
s3.commit(r3.command); s3.commit(planFinishWar(s3.getState().map, r3.id));
const m3 = s3.getState().map, w3 = listWars(m3)[0];
assert.equal(w3.result.winner, "attacker", "2国連合が勝つ前提の検証");
if (w3.result.winner === "attacker") {
  const shares = winnerShares(m3, w3); assert.ok(Math.abs(shares[1] + shares[3] - 1) < 1e-9 && shares[1] > shares[3], "勝者の取り分は戦力への貢献で決まる");
  const sg = suggestTreaty(m3, w3);
  assert.ok(sg.reparations.every((x) => x.fromStateId === 2 && [1, 3].includes(x.toStateId)), "賠償金は複数の勝者へそれぞれ渡る");
  assert.ok(new Set(sg.reparations.map((x) => x.toStateId)).size === 2, "2カ国の勝者の両方に賠償金が渡る");
  const before1 = m3.pack.states[1].treasury, before3 = m3.pack.states[3].treasury, beforeP = m3.pack.states[2].treasury;
  const terms = { kind: "standard", treatyName: "テスト条約", venue: { place: "都1", stateId: 1 }, notes: "駐留なし", cessions: [{ cells: [5], fromStateId: 2, toStateId: 1, name: "A" }, { cells: [7], fromStateId: 2, toStateId: 3, name: "B" }], reparations: sg.reparations };
  assert.throws(() => planSignTreaty(m3, w3.id, { ...terms, cessions: [{ cells: [4], fromStateId: 2, toStateId: 1 }] }, date), /首都/, "首都は割譲できない");
  const rows = treatyBudget(m3, w3, terms); assert.ok(rows.length === 2 && rows.every((x) => x.budget > 0));
  assert.throws(() => planSignTreaty(m3, w3.id, { kind: "standard", treatyName: "x", reparations: [{ fromStateId: 2, toStateId: 1, amount: 999999 }] }, date), /戦争スコア/, "要求は戦争スコアの範囲まで");
  s3.commit(planSignTreaty(m3, w3.id, terms, date));
  const after = s3.getState().map, rec = listWars(after)[0];
  assert.ok(rec.endedAt && rec.terms.cessions.length === 2 && rec.terms.reparations.length >= 2 && rec.terms.notes === "駐留なし", "締結した中身が記録され、あとから確認できる");
  assert.equal(after.pack.cells.state[5], 1); assert.equal(after.pack.cells.state[7], 3);
  assert.ok(after.pack.states[1].treasury > before1 && after.pack.states[3].treasury > before3 && after.pack.states[2].treasury < beforeP, "複数の勝者が賠償金を受け取る");
}

// --- 正式名称と略称の連動 ---
const s4 = createStore({ map: mk() });
s4.commit(planRenameEntity(s4.getState().map, "state", 1, "新アルダ帝国"));
const a4 = s4.getState().map.pack.states[1];
assert.equal(a4.fullName, "新アルダ帝国"); assert.equal(a4.name, "新アルダ", "略称は正式名称から形態の語を外した名前に連動する");
assert.equal(officialName(a4), "新アルダ帝国");
const r4 = planDeclareAndResolveWar(s4.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(6) });
assert.ok(r4.battles.every((b) => !b.text.includes("新アルダ軍")) && r4.battles.some((b) => b.text.includes("新アルダ帝国軍") || b.text.includes("ボルク公国軍")), "戦闘の記録は正式名称");
// --- 賠償金の自動案は、国庫が空でも0にならない（経済の大きさから見積もる） ---
{ const ms = mk(); for (const x of ms.pack.states.slice(1)) x.treasury = 0;
  const sm = createStore({ map: ms }); const rr = planDeclareAndResolveWar(sm.getState().map, { attackers: [1, 3], defenders: [2], date, rnd: createRandom(2), type: "total" }); sm.commit(rr.command); sm.commit(planFinishWar(sm.getState().map, rr.id));
  const ww = listWars(sm.getState().map)[0]; assert.equal(ww.result.winner, "attacker");
  const sg = suggestTreaty(sm.getState().map, ww);
  assert.ok(sg.reparations.length >= 2 && sg.reparations.every((x) => x.amount > 0), "国庫が0でも賠償金の自動案が出る");
  const rows = treatyBudget(sm.getState().map, ww, { reparations: sg.reparations });
  assert.ok(rows.every((x) => x.spent <= x.budget + 0.05), "自動案は戦争スコアの範囲に収まる"); }
console.log("war-progress OK");
