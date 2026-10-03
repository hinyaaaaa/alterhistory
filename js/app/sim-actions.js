// シミュレーション系アクション：部隊・戦闘・同盟・戦争/講和の操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/sim/*, core/edit/{alliances,wars}.js にあり、ここは配線と通知だけ。

import { planCreateRegiment, planMoveRegiment, planEditRegiment, planDisbandRegiment, regimentsOf } from "../core/sim/military.js";
import { planResolveBattle, planResolveMuster } from "../core/sim/battle.js";
import { planCreateAlliance, planEditAlliance, planDissolveAlliance, listAlliances, alliancesOf } from "../core/edit/alliances.js";
import { planDeclareWar, planRecordBattle, planSetMuster, warNameTaken, suggestCessions, planSignPeace, listWars, activeWars, warsOf } from "../core/edit/wars.js";
import { forcePower } from "../core/sim/units.js";
import { planAddMarker } from "../core/edit/markers.js";
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
  const dateLabel = () => { const d = currentDate(); return `${d.year}年${d.month}月`; };
  // 戦争・戦闘・講和の節目に、地図へ印（マーカー）を自動で置く。Undo は元の操作と一緒に1回で戻る。
  const capitalCell = (map, stateId) => { const b = map.pack.burgs[map.pack.states[stateId]?.capital]; return b && !b.removed ? b.cell : null; };
  const putMarker = (type, icon, cell, name) => {
    const map = store.getState().map;
    if (cell == null || !map || cell < 0 || cell >= map.pack.cells.biome.length) return;
    store.commit(planAddMarker(map, { cell, type, icon, name }).command);
  };
  const regimentCell = (map, ref) => (map.pack.states[ref.stateId]?.military ?? []).find((r) => r.i === (ref.regId ?? ref.regIds?.[0]))?.cell ?? null;
  const battleName = (map, a, b) => `${dateLabel()} ${map.pack.states[a.stateId].name}対${map.pack.states[b.stateId].name}の戦い`;

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
        const spot = regimentCell(map, b), title = battleName(map, a, b);
        store.beginBatch(`戦闘（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`);
        store.commit(command);
        if (warId != null) putMarker("battlefields", "⚔️", spot, title);
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
        const spot = regimentCell(map, b), title = battleName(map, a, b);
        store.beginBatch(`会戦（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`);
        store.commit(command);
        if (warId != null) putMarker("battlefields", "⚔️", spot, title);
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
      return withMap((map) => safeRun("同盟の結成", () => { const r = planCreateAlliance(map, name, memberIds, currentDate()); commitOrThrow(r.command); return r.id; }));
    },
    editAlliance(id, patch) { withMap((map) => safeRun("同盟の編集", () => commitOrThrow(planEditAlliance(map, id, patch)))); },
    dissolveAlliance(id) { withMap((map) => safeRun("同盟の解消", () => commitOrThrow(planDissolveAlliance(map, id, currentDate())))); },

    // --- 戦争・講和 ---
    listWars() { return withMap((map) => listWars(map)) ?? []; },
    activeWars() { return withMap((map) => activeWars(map)) ?? []; },
    warsOf(stateId) { return withMap((map) => warsOf(map, stateId)) ?? []; },
    declareWar(attackers, defenders, name) {
      return withMap((map) => safeRun("宣戦布告", () => {
        const r = planDeclareWar(map, { name, attackers, defenders, date: currentDate() });
        const war = r.command.label ?? "宣戦布告";
        store.beginBatch(war);
        try {
          store.commit(r.command);
          const m = store.getState().map;
          putMarker("war", "⚔️", capitalCell(m, attackers[0]), `${dateLabel()} ${listWars(m).find((w) => w.id === r.id)?.name ?? "開戦"}（開戦）`);
        } finally { store.endBatch(); }
        rerender();
        return r.id;
      }));
    },
    warNameTaken(name, exceptId) { return withMap((map) => warNameTaken(map, name, exceptId)) ?? false; },
    /** 召集する部隊（{ [国家ID]: [部隊ID...] }）を保存する */
    setMuster(warId, muster) { withMap((map) => safeRun("部隊の召集", () => { store.commit(planSetMuster(map, warId, muster)); rerender(); })); },
    /** ある国の、その戦争に召集された部隊の合計戦力 */
    musterPower(war, stateId) {
      return withMap((map) => {
        const ids = new Set(war.muster?.[stateId] ?? []);
        return Math.round(regimentsOf(map.pack.states[stateId] ?? {}).filter((r) => ids.has(r.i)).reduce((n, r) => n + forcePower(r.u), 0));
      }) ?? 0;
    },
    /** 戦闘を戦争に記録する（勝敗は利用者が決める。戦力は召集した部隊の合計を一緒に残す） */
    recordBattle(warId, { attackerState, defenderState, winner }) {
      withMap((map) => safeRun("戦闘の記録", () => {
        const war = listWars(map).find((w) => w.id === warId);
        const result = { winner, aPower: this.musterPower(war, attackerState), dPower: this.musterPower(war, defenderState) };
        store.commit(planRecordBattle(map, warId, { attackerState, defenderState, result, date: currentDate() }));
        rerender();
      }));
    },
    suggestCessions(attackerId, defenderId) { return withMap((map) => suggestCessions(map, attackerId, defenderId)) ?? []; },
    signPeace(warId, terms) {
      withMap((map) => safeRun("講和条約", () => {
        const war = listWars(map).find((w) => w.id === warId);
        const cmd = planSignPeace(map, warId, terms, currentDate());
        store.beginBatch(cmd.label ?? "講和条約");
        try {
          store.commit(cmd);
          putMarker("peace", "🕊️", capitalCell(store.getState().map, terms.toStateId), `${dateLabel()} ${war?.name ?? "戦争"}の講和`);
        } finally { store.endBatch(); }
        rerender();
      }));
    },
  };
}
