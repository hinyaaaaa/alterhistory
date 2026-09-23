import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { planCreateAlliance, planEditAlliance, planDissolveAlliance, listAlliances, alliancesOf } from "../js/core/edit/alliances.js";
import { planDeclareWar, planRecordBattle, suggestCessions, planSignPeace, listWars, activeWars, warsOf } from "../js/core/edit/wars.js";
import { planCreateRegiment, planEditRegiment } from "../js/core/sim/military.js";
import { planResolveBattle } from "../js/core/sim/battle.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";
import { attachExtension } from "../js/io/native-format.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const isLiveState = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const baseline = snapshotBaseline(map);
  const states = map.pack.states.filter((s) => s && s.i && !s.removed);
  if (states.length < 3) { console.log("  (国家が3未満のためスキップ)"); continue; }
  const [s1, s2, s3] = states;

  console.log("--- 多国間同盟 ---");
  check("最初は同盟なし", listAlliances(map).length === 0);
  const { command: cA, id: allianceId } = planCreateAlliance(map, "北方同盟", [s1.i, s2.i, s3.i]);
  store.commit(cA);
  check("3カ国同盟が作られる", listAlliances(map).length === 1 && listAlliances(map)[0].members.length === 3);
  check("加盟国から検索できる", alliancesOf(map, s2.i).length === 1);
  check("2カ国未満は例外", (() => { try { planCreateAlliance(map, "x", [s1.i]); return false; } catch { return true; } })());
  check("存在しない国家は例外", (() => { try { planCreateAlliance(map, "x", [s1.i, 999999]); return false; } catch { return true; } })());

  store.commit(planEditAlliance(map, allianceId, { members: [s1.i, s2.i] }));
  check("メンバーを減らせる(2カ国は許容)", listAlliances(map)[0].members.length === 2);
  check("編集で1カ国にはできない", (() => { try { planEditAlliance(map, allianceId, { members: [s1.i] }); return false; } catch { return true; } })());
  check("変化なしの編集はnull", planEditAlliance(map, allianceId, { members: [s1.i, s2.i] }) === null);
  store.undo();
  check("Undoでメンバーが戻る", listAlliances(map)[0].members.length === 3);

  store.commit(planDissolveAlliance(map, allianceId));
  check("解消すると空になる", listAlliances(map).length === 0);
  check("ext.data.alliancesキー自体が消える", map.ext?.data?.alliances === undefined);
  store.undo();
  check("Undoで同盟が復活", listAlliances(map).length === 1);
  store.undo();

  console.log("--- ALTERHISTORY形式で保存・読み戻し ---");
  store.commit(planCreateAlliance(map, "テスト同盟", [s1.i, s2.i, s3.i]).command);
  const native = serializeAzgaar(map, { native: true, exportedAt: "x" });
  const back = parseAzgaarText(native);
  attachExtension(back.map);
  check("同盟が読み戻せる", listAlliances(back.map).length === 1 && listAlliances(back.map)[0].name === "テスト同盟");
  store.undo();

  console.log("--- 宣戦布告・戦闘記録・講和 ---");
  const date = { year: 10, month: 3 };
  check("最初は戦争なし", activeWars(map).length === 0);
  const { command: cW, id: warId } = planDeclareWar(map, { attackers: [s1.i], defenders: [s2.i], date });
  store.commit(cW);
  check("戦争が始まる", activeWars(map).length === 1);
  check("両陣営から検索できる", warsOf(map, s1.i).length === 1 && warsOf(map, s2.i).length === 1);
  check("攻撃側・防御側とも1カ国以上必要", (() => { try { planDeclareWar(map, { attackers: [], defenders: [s2.i], date }); return false; } catch { return true; } })());
  check("同じ国家が両陣営はできない", (() => { try { planDeclareWar(map, { attackers: [s1.i], defenders: [s1.i], date }); return false; } catch { return true; } })());

  // 部隊を作って戦闘し、記録する
  const cellA = map.pack.cells.state.findIndex((v, i) => v === s1.i && map.pack.cells.biome[i] !== 0);
  const cellB = map.pack.cells.state.findIndex((v, i) => v === s2.i && map.pack.cells.biome[i] !== 0);
  const rA = planCreateRegiment(map, s1.i, cellA); store.commit(rA.command);
  store.commit(planEditRegiment(map, s1.i, rA.id, { u: { infantry: 8000, armor: 300 } }));
  const rB = planCreateRegiment(map, s2.i, cellB); store.commit(rB.command);
  store.commit(planEditRegiment(map, s2.i, rB.id, { u: { infantry: 200 } }));

  const rnd = createRandom(7);
  const { command: cBattle, result } = planResolveBattle(map, { stateId: s1.i, regId: rA.id }, { stateId: s2.i, regId: rB.id }, rnd);
  store.commit(cBattle);
  store.commit(planRecordBattle(map, warId, { attackerState: s1.i, defenderState: s2.i, result, date }));
  const war = listWars(map).find((w) => w.id === warId);
  check("戦績が記録される", war.battles.length === 1 && war.battles[0].winner === result.winner);
  check("優勢度が更新される", war.advantage[s1.i] === (result.winner === "attacker" ? 1 : -1));
  check("国境は変わらない(講和前)", checkIntegrity(map, baseline, { skipEconomyChecks: true }).length === 0);

  console.log("--- 講和条約: 隣接する実在ペアで検証 ---");
  // s1/s2 が隣接しているとは限らないため、実際に隣接している国家ペアを地図全体から探す
  const c2 = map.pack.cells, geo2 = map.geometry.pack;
  let adjA = -1, adjB = -1;
  outer: for (let i = 0; i < c2.state.length; i++) {
    if (c2.biome[i] === 0) continue;
    for (const j of geo2.cells.c[i]) {
      if (c2.biome[j] === 0 || c2.state[i] === c2.state[j]) continue;
      const sa = map.pack.states[c2.state[i]], sb = map.pack.states[c2.state[j]];
      if (isLiveState(sa) && isLiveState(sb)) { adjA = sa.i; adjB = sb.i; break outer; }
    }
  }
  check("隣接する国家ペアが地図内に存在する", adjA !== -1 && adjB !== -1);
  const candidates = suggestCessions(map, adjA, adjB);
  check("割譲候補が1件以上返る（属州+未編入地域）", candidates.length > 0, `${candidates.length}件 内訳: 属州${candidates.filter(c=>c.type==="province").length} 地域${candidates.filter(c=>c.type==="region").length}`);
  check("候補のセル数はいずれも正の数", candidates.every((c) => c.cells > 0));

  // この隣接ペアで別の戦争を起こし、実際に割譲する
  const war2 = planDeclareWar(map, { attackers: [adjA], defenders: [adjB], date: { year: 20, month: 1 } });
  store.commit(war2.command);
  const cand = candidates[0];
  const beforeCellCount = map.pack.cells.state.filter((v) => v === adjA).length;
  const beforeOwnerCells = cand.type === "province"
    ? map.pack.cells.state.filter((v, i) => map.pack.cells.province[i] === cand.provinceId)
    : cand.regionCells.map((i) => map.pack.cells.state[i]);
  check("割譲対象は全て防御側の所有", beforeOwnerCells.every((v) => v === adjB));

  const terms = cand.type === "province" ? { provinceIds: [cand.provinceId], toStateId: adjA, reparations: 5 } : { regionCells: [cand.regionCells], toStateId: adjA, reparations: 5 };
  store.commit(planSignPeace(map, war2.id, terms, { year: 21, month: 1 }));
  check("戦争が終結する", listWars(map).find((w) => w.id === war2.id).endedAt !== null);
  const afterCellCount = map.pack.cells.state.filter((v) => v === adjA).length;
  check(`攻撃側の領土が増える(${cand.type})`, afterCellCount > beforeCellCount, `${beforeCellCount}→${afterCellCount}`);
  if (cand.type === "province") check("属州の所有国が変わる", map.pack.provinces[cand.provinceId].state === adjA);
  check("終結した戦争には記録できない", (() => { try { planRecordBattle(map, war2.id, { attackerState: adjA, defenderState: adjB, result: { winner: "attacker", aPower: 1, dPower: 1 }, date }); return false; } catch { return true; } })());
  check("終結した戦争に再度講和はできない", (() => { try { planSignPeace(map, war2.id, { provinceIds: [], toStateId: adjA }, date); return false; } catch { return true; } })());
  store.undo();
  check("Undoで割譲が取り消される", map.pack.cells.state.filter((v) => v === adjA).length === beforeCellCount);
  store.undo();

  console.log("--- 異常系 ---");
  check("存在しない戦争への記録は例外", (() => { try { planRecordBattle(map, 999999, { attackerState: s1.i, defenderState: s2.i, result, date }); return false; } catch { return true; } })());
  check("存在しない戦争の講和は例外", (() => { try { planSignPeace(map, 999999, { provinceIds: [], toStateId: s1.i }, date); return false; } catch { return true; } })());
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
