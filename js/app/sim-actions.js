// シミュレーション系アクション：部隊・戦闘・同盟・戦争/講和の操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/sim/*, core/edit/{alliances,wars}.js にあり、ここは配線と通知だけ。

import { planCreateRegiment, planMoveRegiment, planEditRegiment, planDisbandRegiment, regimentsOf } from "../core/sim/military.js";
import { planResolveBattle, planResolveMuster } from "../core/sim/battle.js";
import { planCreateAlliance, planEditAlliance, planDissolveAlliance, listAlliances, alliancesOf } from "../core/edit/alliances.js";
import { planDeclareWar, planRecordBattle, suggestCessions, planSignPeace, listWars, activeWars, warsOf } from "../core/edit/wars.js";
import { createRandom } from "../core/random.js";

export function createSimActions({ store, renderer }) {
  const rnd = createRandom(Date.now());
  const rerender = () => renderer.requestRender();
  const withMap = (fn) => { const m = store.getState().map; return m ? fn(m) : undefined; };
  const commitOrThrow = (plan) => { if (plan) { store.commit(plan); rerender(); } };
  const safeRun = (label, fn) => {
    try { return fn(); }
    catch (e) { store.update((s) => { s.error = `${label}: ${e.message}`; }); return undefined; }
  };
  const currentDate = () => store.getState().map?.worldTime ?? { year: 1, month: 1 };

  return {
    // --- 部隊 ---
    createRegiment(stateId, cell, opts) {
      return withMap((map) => safeRun("部隊の編成", () => { const r = planCreateRegiment(map, stateId, cell, opts); commitOrThrow(r.command); return r.id; }));
    },
    moveRegiment(stateId, regId, cell) { withMap((map) => safeRun("部隊の移動", () => commitOrThrow(planMoveRegiment(map, stateId, regId, cell)))); },
    editRegiment(stateId, regId, patch) { withMap((map) => safeRun("部隊の編集", () => commitOrThrow(planEditRegiment(map, stateId, regId, patch)))); },
    disbandRegiment(stateId, regId) { withMap((map) => safeRun("部隊の解散", () => commitOrThrow(planDisbandRegiment(map, stateId, regId)))); },
    regimentsOf(stateId) { return withMap((map) => regimentsOf(map.pack.states[stateId] ?? {})) ?? []; },

    // --- 戦闘 ---
    /** 攻撃を実行し、関連する戦争があれば戦績も記録する。戻り値は戦闘結果（表示用） */
    attack(a, b, warId) {
      return withMap((map) => safeRun("戦闘", () => {
        const { command, result } = planResolveBattle(map, a, b, rnd);
        store.beginBatch(`戦闘（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`);
        store.commit(command);
        if (warId != null) {
          const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
          if (recCmd) store.commit(recCmd);
        }
        store.endBatch();
        rerender();
        return result;
      }));
    },

    /**
     * 動員会戦：同じ場所にいる複数部隊をまとめて攻撃側として動員し、
     * 狙った部隊がいる場所の防御側全部隊と合算戦力で戦う。
     * @param {{stateId:number, regIds:number[]}} a 動員する自国部隊のID一覧
     * @param {{stateId:number, regId:number}} b 攻撃対象の部隊
     */
    musterAttack(a, b, warId) {
      return withMap((map) => safeRun("会戦", () => {
        const { command, result } = planResolveMuster(map, a, b, rnd);
        store.beginBatch(`会戦（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`);
        store.commit(command);
        if (warId != null) {
          const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
          if (recCmd) store.commit(recCmd);
        }
        store.endBatch();
        rerender();
        return result;
      }));
    },

    // --- 同盟 ---
    listAlliances() { return withMap((map) => listAlliances(map)) ?? []; },
    alliancesOf(stateId) { return withMap((map) => alliancesOf(map, stateId)) ?? []; },
    createAlliance(name, memberIds) {
      return withMap((map) => safeRun("同盟の結成", () => { const r = planCreateAlliance(map, name, memberIds); commitOrThrow(r.command); return r.id; }));
    },
    editAlliance(id, patch) { withMap((map) => safeRun("同盟の編集", () => commitOrThrow(planEditAlliance(map, id, patch)))); },
    dissolveAlliance(id) { withMap((map) => safeRun("同盟の解消", () => commitOrThrow(planDissolveAlliance(map, id)))); },

    // --- 戦争・講和 ---
    listWars() { return withMap((map) => listWars(map)) ?? []; },
    activeWars() { return withMap((map) => activeWars(map)) ?? []; },
    warsOf(stateId) { return withMap((map) => warsOf(map, stateId)) ?? []; },
    declareWar(attackers, defenders, name) {
      return withMap((map) => safeRun("宣戦布告", () => { const r = planDeclareWar(map, { name, attackers, defenders, date: currentDate() }); commitOrThrow(r.command); return r.id; }));
    },
    suggestCessions(attackerId, defenderId) { return withMap((map) => suggestCessions(map, attackerId, defenderId)) ?? []; },
    signPeace(warId, terms) { withMap((map) => safeRun("講和条約", () => commitOrThrow(planSignPeace(map, warId, terms, currentDate())))); },
  };
}
