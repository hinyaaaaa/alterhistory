// 戦争まわりの修正の検証：弱い側が勝ちすぎない／民意が尽きたら降伏／長期戦でスコアが上がり続ける／割譲の費用／スクロール位置の保持
import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planAdvanceWars, planSignTreaty, listWars, currentWarScore, cessionCost, treatyBudget } from "../js/core/edit/wars.js";
import { keepScroll } from "../js/ui/safe-render.js";

const N = 12;
const reg = (id, i, inf, extra = {}) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0, ...extra } });
const st = (i, name, regs, o = {}) => ({ i, name, techLevel: 6, industry: 300, rural: 900, urban: 100, cells: 40, capital: i, morale: 70, doctrine: "balanced", military: regs, diplomacy: [], treasury: 1000, ...o });
const mk = (aReg, dReg, ao = {}, dO = {}) => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 10, height: 10 }, markers: [], notes: [],
  pack: {
    states: [{ i: 0, name: "N", diplomacy: [] }, st(1, "ア", aReg, ao), st(2, "イ", dReg, dO)],
    burgs: [null, { i: 1, name: "アーク", cell: 0, state: 1 }, { i: 2, name: "イード", cell: 11, state: 2 }, { i: 3, name: "イーナ", cell: 10, state: 2 }],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: Uint16Array.from([1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 2, 2]), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});
const date = { year: 1, month: 1 };
const decl = (m, k, type = "conventional") => planDeclareAndResolveWar(m, { attackers: [1], defenders: [2], date, rnd: createRandom(k), type });

// --- 1. 陸軍も士気も圧倒的に弱い側は、少数の空軍・海軍があっても勝てない ---
{ let weakWins = 0; const T = 200;
  for (let k = 1; k <= T; k++) { const q = decl(mk([reg(1, 0, 2000, { air: 20, navy: 20 })], [reg(2, 0, 8000)], { morale: 30 }, { morale: 70 }), k); if (q.result.winner === "attacker") weakWins++; }
  assert.ok(weakWins / T < 0.05, `陸1:4・士気30:70の弱い側が、少数の空・海軍だけで勝ちすぎない（${weakWins}/${T}）`); }
// 互角なら、どちらも勝つ（偏りすぎない）
{ let a = 0; const T = 200; for (let k = 1; k <= T; k++) if (decl(mk([reg(1, 0, 5000)], [reg(2, 0, 5000)]), k).result.winner === "attacker") a++; assert.ok(a / T > 0.2 && a / T < 0.65, `互角なら勝敗がばらける（攻撃側${a}/${T}）`); }

// --- 2. 民意が尽きたら降伏する（戦争の途中でも） ---
{ let found = null;
  for (let k = 1; k <= 60 && !found; k++) { const m = mk([reg(1, 0, 6000)], [reg(2, 0, 2000)], {}, { support: 60 }); const q = decl(m, k, "total"); if (q.result.winner === "attacker" && !q.result.victory?.type) found = { m, q }; }
  // 勝敗がついた戦争でも、防御側の民意が尽きれば、民意の崩壊として決着し直す。ここでは民意を直接 5 にして月を進める
  const s = createStore({ map: mk([reg(1, 0, 6000)], [reg(2, 0, 2000)]) });
  const q = decl(s.getState().map, 4, "conventional"); s.commit(q.command);
  s.getState().map.pack.states[2].support = 5; // 民意がほぼ0
  const adv = planAdvanceWars(s.getState().map, { year: 1, month: 3 }, null);
  assert.ok(adv, "月が進む"); s.commit(adv);
  const w = listWars(s.getState().map)[0];
  assert.equal(w.result.victory.type, "exhaustion", "民意が尽きたら降伏（民意の崩壊）");
  assert.equal(w.result.winner, "attacker", "防御側の民意が尽きれば、攻撃側の勝ち");
  assert.ok(w.events.some((e) => e.kind === "collapse"), "経過の記録に残る");
  assert.ok(currentWarScore(w) >= 30, "降伏させた側は、講和で要求できる"); }

// --- 3. 長期戦ほど戦争スコアが上がり続け、全面降伏（併合）に追い込める ---
{ let ok = false;
  for (let k = 1; k <= 60 && !ok; k++) {
    const s = createStore({ map: mk([reg(1, 0, 9000)], [reg(2, 0, 2000)], { support: 100 }, { support: 100 }) });
    const q = decl(s.getState().map, k, "total"); if (q.result.winner !== "attacker") continue; s.commit(q.command);
    const sc0 = currentWarScore(listWars(s.getState().map)[0]);
    for (let y = 1; y <= 50; y++) { const adv = planAdvanceWars(s.getState().map, { year: 1 + y, month: 1 }, null); if (adv) s.commit(adv); }
    const w = listWars(s.getState().map)[0];
    assert.ok(currentWarScore(w) >= sc0, "長期戦でスコアは下がらない");
    if (currentWarScore(w) >= 70) { ok = true;
      assert.doesNotThrow(() => planSignTreaty(s.getState().map, w.id, { kind: "annex", treatyName: "全面降伏", annex: [{ fromStateId: 2, toStateId: 1 }] }, { year: 51, month: 1 }), "50年戦えば、敗者を全面降伏に追い込める"); }
  }
  assert.ok(ok, "長期戦で戦争スコアが70以上になる"); }

// --- 4. 割譲の費用は、敗者の領土に対する割合で決まる（地図が大きくても、数割は要求できる） ---
{ const m = mk([reg(1, 0, 5000)], [reg(2, 0, 5000)]);
  const c10 = cessionCost(m, 2, [8, 9, 10, 11].slice(0, 2)), c20 = cessionCost(m, 2, [8, 9, 10, 11]);
  assert.ok(c20 > c10 && c10 > 0, "多く取るほど高い");
  m.pack.states[2].cells = 400; // 大きな国（Azgaar の地図に近い規模）
  const frac = cessionCost(m, 2, [8, 9, 10, 11]);
  assert.ok(frac < 5, `大きな国の数セルは、安く要求できる（費用 ${frac.toFixed(2)}）`); }

// --- 5. 描き直しても、スクロール位置は先頭に戻らない ---
{ const mkEl = (cls, top, kids = [], parent = null) => { const e = { className: cls, tagName: "DIV", scrollTop: top, scrollLeft: 0, parentElement: parent, kids, querySelectorAll() { return this.kids; } }; return e; };
  const body = mkEl("float-win-body", 120);
  const root = mkEl("tab", 0, [mkEl("battle-log", 40)], body);
  const log = root.kids[0];
  keepScroll(root, () => { body.scrollTop = 0; log.scrollTop = 0; });
  assert.equal(body.scrollTop, 120, "ウィンドウ本体のスクロール位置が戻る"); assert.equal(log.scrollTop, 40, "戦闘の記録のスクロール位置が戻る"); }

console.log("war-fixes: ok");
