// 合成マップに「歴史」を積む。実際の編集コマンドを使うので、保存される ext.data の形は本物と同じ。
import { createRequire } from "node:module";
import { buildSyntheticMapText } from "./synth-map.mjs";
import { loadFromBytes } from "../../js/io/loader.js";
import { createStore } from "../../js/core/store.js";
import { createRandom } from "../../js/core/random.js";
import { planSetEra } from "../../js/core/edit/eras.js";
import { planSetDiplomacy } from "../../js/core/edit/diplomacy.js";
import { planCreateAlliance, planDissolveAlliance } from "../../js/core/edit/alliances.js";
import { planDeclareWar, planRecordBattle, planSignPeace, suggestCessions } from "../../js/core/edit/wars.js";
import { planSetNote } from "../../js/core/edit/notes.js";
import { planSetTechLevel } from "../../js/core/edit/economy.js";
import { planSetDoctrine } from "../../js/core/edit/military-doctrine.js";
import { planCreateRegiment, planEditRegiment } from "../../js/core/sim/military.js";
import { planDeclareIndependence, planMergeStates } from "../../js/core/edit/sovereignty.js";
import { planAddBurg } from "../../js/core/edit/burgs.js";
import { planAddMarker } from "../../js/core/edit/markers.js";
import { planResolveBattle } from "../../js/core/sim/battle.js";
import { computeAnnualUpdate } from "../../js/core/sim/economy.js";

const Delaunator = createRequire(import.meta.url)("../../js/vendor/delaunator.min.js");

export async function buildHistoricalWorld() {
  const { text } = buildSyntheticMapText();
  const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
  const store = createStore({ map });
  const rnd = createRandom(3);
  const c = (cmd) => { if (cmd) store.commit(cmd.command ?? cmd); return cmd; };
  const log = [];
  const step = (label, fn) => { try { fn(); log.push("OK   " + label); } catch (e) { log.push("FAIL " + label + " : " + e.message); } };

  step("時代", () => { c(planSetEra(map, { name: "建国期", fromYear: 1 })); c(planSetEra(map, { name: "戦乱の時代", fromYear: 30 })); c(planSetEra(map, { name: "近代", fromYear: 80 })); });
  step("技術・ドクトリン", () => { for (const s of [1, 2, 3, 4]) c(planSetTechLevel(map, s, 3 + s)); c(planSetDoctrine(map, 1, "mobile")); c(planSetDoctrine(map, 2, "battleplan")); });
  step("ノート", () => { c(planSetNote(map, "state", 2, "<p>北の公国。<br>鉱山が豊富。</p>")); c(planSetNote(map, "religion", 1, "<p>太陽神アマルを祀る。</p>")); });
  step("外交", () => { c(planSetDiplomacy(map, 1, 2, "Ally", { year: 5, month: 3 })); c(planSetDiplomacy(map, 1, 3, "Rival", { year: 12, month: 7 })); c(planSetDiplomacy(map, 2, 4, "Enemy", { year: 31, month: 1 })); c(planSetDiplomacy(map, 5, 6, "Vassal", { year: 40, month: 6 })); });
  step("同盟", () => { const a = c(planCreateAlliance(map, "北方同盟", [1, 2, 5], { year: 6, month: 1 })); const b = c(planCreateAlliance(map, "東方協商", [3, 4, 6], { year: 20, month: 4 })); c(planDissolveAlliance(map, b.id, { year: 55, month: 9 })); });
  step("部隊", () => {
    for (const [s, name] of [[1, "第一近衛軍"], [2, "北方軍団"], [3, "東方遠征軍"], [4, "国境警備隊"]]) {
      const cell = map.pack.burgs[map.pack.states[s].capital].cell;
      const r = c(planCreateRegiment(map, s, cell, { name }));
      c(planEditRegiment(map, s, r.id, { u: { infantry: 8000 + s * 500, armor: 120 * s, air: 30 * s, navy: s === 1 ? 12 : 0, special: 200 } }));
    }
  });
  step("戦争と戦闘", () => {
    const w = c(planDeclareWar(map, { name: "赤の平原戦争", attackers: [2], defenders: [4], date: { year: 31, month: 2 } }));
    // 実UI(sim-actions.attack)と同じ呼び方: planResolveBattle(map, a, b, rnd) → {command, result}
    for (const [y, m] of [[31, 5], [32, 2], [32, 11]]) {
      const rA = map.pack.states[2].military[0], rD = map.pack.states[4].military[0];
      const { command, result } = planResolveBattle(map, { stateId: 2, regId: rA.i }, { stateId: 4, regId: rD.i }, rnd);
      store.commit(command);
      c(planRecordBattle(map, w.id, { attackerState: 2, defenderState: 4, result, date: { year: y, month: m } }));
    }
    const cands = suggestCessions(map, 2, 4);
    c(planSignPeace(map, w.id, { provinceIds: cands.filter((x) => x.type === "province").slice(0, 1).map((x) => x.provinceId), regionCells: [], toStateId: 2, reparations: 1 }, { year: 33, month: 8 }));
    // 継続中の戦争も1つ残す（AI が「進行中」を区別できるか見るため）
    c(planDeclareWar(map, { name: "東方国境紛争", attackers: [3], defenders: [1, 5], date: { year: 58, month: 11 } }));
  });
  step("独立", () => {
    // 都市を2つ以上持つ国の、非首都都市を含む属州を選ぶ
    for (const prov of map.pack.provinces.filter((p) => p && p.i)) {
      try { c(planDeclareIndependence(map, { provinceId: prov.i, name: "新生ノヴァ共和国", rnd, date: { year: 45, month: 5 } })); return; } catch { /* 次の属州を試す */ }
    }
    throw new Error("独立できる属州が見つからない");
  });
  step("マーカー・都市", () => { c(planAddMarker(map, { cell: map.pack.burgs[1].cell + 1, type: "battlefields", icon: "⚔️", name: "第二次会戦跡" })); });
  step("経済年次更新", () => { for (const s of [1, 2, 3]) { const st = map.pack.states[s]; const u = computeAnnualUpdate(st); st.rural = u.rural; st.urban = u.urban; st.industry = u.industry; } });
  map.worldTime = { year: 60, month: 4 };
  return { map, store, log };
}
