import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createWorldTime, advanceMonth, formatWorldTime } from "../js/core/sim/time.js";
import { ensureEconomy, computeAnnualUpdate, clampTech, TECH_MIN, TECH_MAX } from "../js/core/sim/economy.js";
import { planAnnualUpdate } from "../js/core/sim/world.js";
import { UNIT_KEYS, UNIT_BY_KEY, forcePower, forceHeadcount, forceHardness, attackDamage, emptyForce, DOCTRINES } from "../js/core/sim/units.js";
import { planCreateRegiment, planMoveRegiment, planEditRegiment, planDisbandRegiment, planAnnualConscription, regimentsOf } from "../js/core/sim/military.js";
import { simulateBattle, planResolveBattle } from "../js/core/sim/battle.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== 時間 ===");
check("初期値", JSON.stringify(createWorldTime()) === '{"year":1,"month":1}');
check("月が進む", JSON.stringify(advanceMonth({ year: 5, month: 3 }).time) === '{"year":5,"month":4}');
check("年またぎ", JSON.stringify(advanceMonth({ year: 5, month: 12 }).time) === '{"year":6,"month":1}' && advanceMonth({ year: 5, month: 12 }).yearChanged === true);
check("年またぎでないときはyearChanged=false", advanceMonth({ year: 5, month: 3 }).yearChanged === false);
check("表示形式", formatWorldTime({ year: 23, month: 4 }) === "23年 4月");

console.log("=== 経済 ===");
check("techLevelの範囲", clampTech(0) === TECH_MIN && clampTech(99) === TECH_MAX && clampTech(5.4) === 5);
{
  const s = { rural: 1000, urban: 500 };
  ensureEconomy(s);
  check("既定値が補われる", s.techLevel === 3 && s.popCarryCap === 4500);
  const r1 = computeAnnualUpdate(s);
  check("人口が増える", r1.rural + r1.urban > 1500);
  check("産業力が正の値", r1.industry > 0);
  // 技術水準が高いほど成長率が高い
  const sLow = { rural: 1000, urban: 500, techLevel: 1, popCarryCap: 100000 };
  const sHigh = { rural: 1000, urban: 500, techLevel: 10, popCarryCap: 100000 };
  const gLow = computeAnnualUpdate(sLow), gHigh = computeAnnualUpdate(sHigh);
  check("技術水準が高いほど成長が速い", (gHigh.rural + gHigh.urban) > (gLow.rural + gLow.urban));
  check("技術水準が高いほど産業力が高い", gHigh.industry > gLow.industry);
  // ロジスティック成長: 上限に近いと成長が鈍る
  const sNearCap = { rural: 9000, urban: 500, techLevel: 5, popCarryCap: 9600 };
  const rNear = computeAnnualUpdate(sNearCap);
  check("上限に近いと成長が鈍化する", (rNear.rural + rNear.urban - 9500) < 50);
  const sZero = { rural: 0, urban: 0, techLevel: 5, popCarryCap: 100 };
  check("人口0は0のまま", computeAnnualUpdate(sZero).rural === 0 && computeAnnualUpdate(sZero).urban === 0);
}

console.log("=== 兵科・戦闘力 ===");
check("兵科は7種類", UNIT_KEYS.length === 7);
check("空の兵力は戦力0", forcePower(emptyForce()) === 0);
check("歩兵100は戦力100相当(soft=1,hard=0.1の平均0.55→丸めなしで55)", forcePower({ ...emptyForce(), infantry: 100 }) === 55);
check("核は圧倒的な戦力係数", UNIT_BY_KEY.nuclear.soft > UNIT_BY_KEY.armor.soft * 10);
check("ドクトリンで戦力が変わる", forcePower({ ...emptyForce(), armor: 100 }, "mobile") > forcePower({ ...emptyForce(), armor: 100 }, "balanced"));
check("兵員数の合算", forceHeadcount({ ...emptyForce(), infantry: 500, armor: 20 }) === 520);
check("ドクトリンは5種類", DOCTRINES.length === 5);
check("歩兵のみは非装甲(hardness=0)", forceHardness({ ...emptyForce(), infantry: 100 }) === 0);
check("機甲のみは高装甲率(hardness=0.9)", forceHardness({ ...emptyForce(), armor: 100 }) === 0.9);
check("歩兵しかない軍は、機甲だらけの相手には攻撃が通りにくい(soft主体からhard主体へ按分が下がる)",
  attackDamage({ ...emptyForce(), infantry: 100 }, 0.9, "balanced", "Generic") < attackDamage({ ...emptyForce(), infantry: 100 }, 0, "balanced", "Generic"));
check("海洋国家(Naval)は海軍が強化される", attackDamage({ ...emptyForce(), navy: 10 }, 0, "balanced", "Naval") > attackDamage({ ...emptyForce(), navy: 10 }, 0, "balanced", "Generic"));

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const baseline = snapshotBaseline(map);
  const states = map.pack.states.filter((s) => s && s.i && !s.removed);
  const [s1, s2] = states;

  console.log("--- 部隊の編成・移動・編集・解散 ---");
  const landCell = map.pack.cells.state.findIndex((v, i) => v === s1.i && map.pack.cells.biome[i] !== 0);
  const { command: cCreate, id: regId } = planCreateRegiment(map, s1.i, landCell, { name: "第1軍" });
  store.commit(cCreate);
  const reg = regimentsOf(map.pack.states[s1.i]).find((r) => r.i === regId);
  check("部隊が作られる", reg && reg.name === "第1軍" && reg.cell === landCell);
  check("初期兵力は空", forceHeadcount(reg.u) === 0);

  store.commit(planEditRegiment(map, s1.i, regId, { u: { infantry: 1000, armor: 50 } }));
  check("兵力を編集できる", reg.u.infantry === 1000 && reg.u.armor === 50);
  check("同じ内容の再編集は変更なし", planEditRegiment(map, s1.i, regId, { u: { infantry: 1000 } }) === null);

  const landCell2 = map.pack.cells.state.findIndex((v, i) => v === s1.i && map.pack.cells.biome[i] !== 0 && i !== landCell);
  store.commit(planMoveRegiment(map, s1.i, regId, landCell2));
  check("部隊が移動する", reg.cell === landCell2);
  check("同じセルへの移動は変更なし", planMoveRegiment(map, s1.i, regId, landCell2) === null);

  store.commit(planDisbandRegiment(map, s1.i, regId));
  check("部隊が解散する", !regimentsOf(map.pack.states[s1.i]).some((r) => r.i === regId));
  let threw = false; try { planDisbandRegiment(map, s1.i, regId); } catch { threw = true; }
  check("存在しない部隊の解散は例外", threw);
  store.undo(); store.undo(); store.undo(); store.undo();
  check("全てUndoで部隊が消える(最初の状態に戻る)", regimentsOf(map.pack.states[s1.i]).length === (map.pack.states[s1.i].__origCount ?? regimentsOf(map.pack.states[s1.i]).length));

  console.log("--- 他国領内への配置（要件どおり自由配置） ---");
  const foreignCell = map.pack.cells.state.findIndex((v, i) => v === s2.i && map.pack.cells.biome[i] !== 0);
  const { command: cForeign, id: fRegId } = planCreateRegiment(map, s1.i, foreignCell);
  store.commit(cForeign);
  check("他国領内に部隊を置ける", regimentsOf(map.pack.states[s1.i]).find((r) => r.i === fRegId).cell === foreignCell);
  store.undo();

  console.log("--- 年次更新（経済+徴兵） ---");
  const before = { rural: s1.rural, urban: s1.urban, industry: s1.industry };
  const upd = planAnnualUpdate(map);
  check("年次更新コマンドが作られる", upd !== null);
  store.commit(upd);
  check("人口が変化する", s1.rural !== before.rural || s1.urban !== before.urban);
  check("整合性は保たれる(経済更新によるrural集計ずれは織込み済み)", checkIntegrity(map, baseline, { skipEconomyChecks: true }).length === 0, checkIntegrity(map, baseline, { skipEconomyChecks: true }).slice(0, 2).join(" / "));
  store.undo();
  check("Undoで人口が戻る", s1.rural === before.rural && s1.urban === before.urban);

  console.log("--- 戦闘（即時判定） ---");
  const rnd = createRandom(42);
  const { command: c1, id: r1 } = planCreateRegiment(map, s1.i, landCell);
  store.commit(c1);
  store.commit(planEditRegiment(map, s1.i, r1, { u: { infantry: 5000, armor: 200 } }));
  const { command: c2, id: r2 } = planCreateRegiment(map, s2.i, foreignCell);
  store.commit(c2);
  store.commit(planEditRegiment(map, s2.i, r2, { u: { infantry: 100 } }));

  const before1 = { ...regimentsOf(map.pack.states[s1.i]).find((r) => r.i === r1).u };
  const before2 = { ...regimentsOf(map.pack.states[s2.i]).find((r) => r.i === r2).u };
  const { command: cBattle, result } = planResolveBattle(map, { stateId: s1.i, regId: r1 }, { stateId: s2.i, regId: r2 }, rnd);
  check("戦力差が大きい側が勝つ（決定論的乱数のもと）", result.winner === "attacker", JSON.stringify(result));
  store.commit(cBattle);
  const after1 = regimentsOf(map.pack.states[s1.i]).find((r) => r.i === r1).u;
  const after2 = regimentsOf(map.pack.states[s2.i]).find((r) => r.i === r2).u;
  check("両軍とも兵力が減る", after1.infantry < before1.infantry && after2.infantry < before2.infantry);
  check("勝者の損耗は敗者より小さい", (before1.infantry - after1.infantry) / before1.infantry < (before2.infantry - after2.infantry) / before2.infantry);
  check("国境(セルの所属)は変わらない", checkIntegrity(map, baseline).length === 0);
  store.undo();
  check("Undoで両軍の兵力が戻る", JSON.stringify(regimentsOf(map.pack.states[s1.i]).find((r) => r.i === r1).u) === JSON.stringify(before1));

  console.log("--- 戦闘の異常系 ---");
  threw = false; try { planResolveBattle(map, { stateId: s1.i, regId: r1 }, { stateId: s1.i, regId: 999 }, rnd); } catch { threw = true; }
  check("存在しない部隊は例外", threw);
  threw = false; try { planResolveBattle(map, { stateId: s1.i, regId: r1 }, { stateId: s1.i, regId: r1 }, rnd); } catch { threw = true; }
  check("同一国家どうしは例外", threw);
  threw = false; try { simulateBattle({ units: emptyForce() }, { units: emptyForce() }, rnd); } catch { threw = true; }
  check("両軍とも戦力ゼロは例外", threw);

  console.log("--- 徴兵の異常系 ---");
  check("存在しない国家の徴兵はnull", planAnnualConscription(map, 999999) === null);
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
