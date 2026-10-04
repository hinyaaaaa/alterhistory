// シミュレーション系アクション：部隊・戦闘・同盟・戦争/講和の操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/sim/*, core/edit/{alliances,wars}.js にあり、ここは配線と通知だけ。

import { planCreateRegiment, planMoveRegiment, planEditRegiment, planDisbandRegiment, regimentsOf } from "../core/sim/military.js";
import { planResolveBattle, planResolveMuster } from "../core/sim/battle.js";
import { planCreateAlliance, planEditAlliance, planDissolveAlliance, listAlliances, alliancesOf } from "../core/edit/alliances.js";
import { planDeclareAndResolveWar, planDeclareWar, planRecordBattle, planSetMuster, warNameTaken, suggestCessions, suggestCessionChunks, suggestTreaty, planWarPreview, planReevaluateWars, planSignPeace, planSignTreaty, treatyBudget, planAdvanceWars, planFinishWar, warsOngoing, planRenameWar, warsAwaitingTreaty, planPeaceVenue, peaceSides, estimatePeace, listWars, activeWars, warsOf } from "../core/edit/wars.js";
import { forcePower } from "../core/sim/units.js";
import { planAddMarker } from "../core/edit/markers.js";
import { createRandom } from "../core/random.js";
import { makeCommand } from "../core/edit/commands.js";
import { planSetCurrency, getCurrency, exchangeRate } from "../core/sim/currency.js";
import { planNextCollapse } from "../core/sim/collapse.js";
import { planMergeStates } from "../core/edit/sovereignty.js";
import { strikeEffects } from "../core/sim/nuclear.js";
import { planDraftNuclearOp, planCancelNuclearOp, planExecuteNuclearOp, listNuclearOps, nuclearStock } from "../core/sim/nuclear.js";

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

  /** 人口の大部分を失った国を崩壊させる（無くなるまで）。崩壊した国の説明文の配列を返す */
  const runCollapses = () => {
    const names = [];
    for (let guard = 0; guard < 8; guard++) {
      const c = planNextCollapse(store.getState().map, currentDate());
      if (!c) break;
      try { store.commit(c.command); names.push(c.annexer != null ? `${c.name}（${store.getState().map.pack.states[c.annexer]?.name}へ併合）` : `${c.name}（解体）`); } catch { break; }
    }
    return names;
  };

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
    createAlliance(name, memberIds, bond = "standard") {
      return withMap((map) => safeRun("同盟の結成", () => { const r = planCreateAlliance(map, name, memberIds, currentDate(), bond); commitOrThrow(r.command); return r.id; }));
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
    /** 戦争開始前の見積もり（招集した部隊でのバー用）。副作用なし */
    previewWar(attackers, defenders, muster, type) { return withMap((map) => planWarPreview(map, { attackers, defenders, muster, type })); },
    /** 「戦争開始」：招集した部隊で即判定し、戦闘の記録を自動生成する。結果 { id, name, result, joined, endsAt, battles, collapsed } */
    declareWarInstant(attackers, defenders, muster = null, type = "conventional") {
      return withMap((map) => {
        let out;
        safeRun("戦争開始", () => {
          const r = planDeclareAndResolveWar(map, { attackers, defenders, date: currentDate(), rnd, muster, type });
          store.beginBatch(r.command.label ?? "戦争開始");
          let collapsed = [];
          try {
            store.commit(r.command);
            putMarker("war", "⚔️", capitalCell(store.getState().map, attackers[0]), `${dateLabel()} ${r.name}`);
            collapsed = runCollapses(); // 人口の大部分を失った国は、ここで崩壊する
          } finally { store.endBatch(); }
          rerender();
          out = { id: r.id, name: r.name, result: r.result, joined: r.joined, endsAt: r.endsAt, battles: r.battles, collapsed };
        });
        return out;
      });
    },
    suggestTreaty(warId) { return withMap((map) => { const w = listWars(map).find((x) => x.id === warId); return w ? suggestTreaty(map, w) : null; }); },
    suggestCessionChunks(toIds, fromId, opts) { return withMap((map) => suggestCessionChunks(map, toIds, fromId, opts)) ?? []; },
    treatyBudget(warId, terms) { return withMap((map) => { const w = listWars(map).find((x) => x.id === warId); return w ? treatyBudget(map, w, terms) : []; }) ?? []; },
    warsOngoing() { return withMap((map) => warsOngoing(map)) ?? []; },
    /** 戦闘を最後まで進める */
    finishWar(warId) { withMap((map) => safeRun("戦闘を進める", () => { commitOrThrow(planFinishWar(map, warId)); runCollapses(); })); },
    /** 月が進むたびの、戦争の損害の展開（時間経過）。崩壊した国名を返す */
    advanceWars(date) { return withMap((map) => { const c = planAdvanceWars(map, date); if (c) store.commit(c); return c ? runCollapses() : []; }) ?? []; },
    runCollapses,
    // --- 核作戦（立案→実行。通常の戦争では使われない） ---
    nuclearOps() { return withMap((map) => listNuclearOps(map)) ?? []; },
    strikeEstimate(stateId, warheads) { return withMap((map) => strikeEffects(map.pack.states[stateId]?.techLevel ?? 3, warheads)); },
    nuclearStock(stateId) { return withMap((map) => nuclearStock(map.pack.states[stateId])) ?? 0; },
    draftNuclearOp(attackerId, targetId, warheads) { return withMap((map) => { let id; safeRun("核作戦の立案", () => { const r = planDraftNuclearOp(map, { attackerId, targetId, warheads }); commitOrThrow(r.command); id = r.id; }); return id; }); },
    cancelNuclearOp(id) { withMap((map) => safeRun("核作戦の取り消し", () => commitOrThrow(planCancelNuclearOp(map, id)))); },
    executeNuclearOp(id) {
      withMap((map) => safeRun("核作戦の実行", () => {
        const cmd = planExecuteNuclearOp(map, id, currentDate());
        store.beginBatch(cmd.label ?? "核作戦の実行");
        try {
          store.commit(cmd);
          const op = listNuclearOps(store.getState().map).find((o) => o.id === id);
          putMarker("nuclear", "☢️", capitalCell(store.getState().map, op.targetId), `${dateLabel()} ${op.name}`);
          // まだ講和していない戦争は、いまの戦力・士気で判定し直す（核の打撃が戦況・勝敗に反映される）
          const re = planReevaluateWars(store.getState().map, [op.targetId, op.attackerId], `☢ ${op.name}：${op.warheads}発が使用された`);
          if (re) store.commit(makeCommand("核作戦による戦況の変化", [], [re]));
          runCollapses();
        } finally { store.endBatch(); }
        rerender();
      }));
    },
    getCurrency(stateId) { return withMap((map) => getCurrency(map.pack.states[stateId])); },
    /** 1 from通貨 = ? to通貨 */
    exchangeRate(fromId, toId) { return withMap((map) => exchangeRate(map, fromId, toId)) ?? 1; },
    setCurrency(stateId, patch) { withMap((map) => safeRun("通貨の設定", () => { store.commit(planSetCurrency(map, stateId, patch)); rerender(); })); },
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
    renameWar(warId, name) { withMap((map) => safeRun("戦争名の変更", () => commitOrThrow(planRenameWar(map, warId, name)))); },
    warsAwaitingTreaty() { return withMap((map) => warsAwaitingTreaty(map)) ?? []; },
    peaceVenue(warId) { return withMap((map) => planPeaceVenue(map, warId, rnd)); },
    peaceSides(war) { return peaceSides(war); },
    estimatePeace(warId, args) { return withMap((map) => estimatePeace(map, warId, args)); },
    suggestCessions(attackerId, defenderId) { return withMap((map) => suggestCessions(map, attackerId, defenderId)) ?? []; },
    /** 講和条約を締結する。新しい形式 { kind, cessions, reparations, annex, treatyName, venue, notes } */
    signTreaty(warId, terms) {
      return withMap((map) => { let ok = false; safeRun("講和条約", () => {
        const war = listWars(map).find((w) => w.id === warId);
        const cmd = planSignTreaty(map, warId, terms, currentDate());
        store.beginBatch(cmd.label ?? "講和条約");
        try {
          store.commit(cmd);
          const to = terms.cessions?.[0]?.toStateId ?? terms.annex?.[0]?.toStateId ?? terms.reparations?.[0]?.toStateId ?? war?.attackers?.[0];
          putMarker("peace", "🕊️", capitalCell(store.getState().map, to), `${dateLabel()} ${war?.name ?? "戦争"}の講和`);
          for (const x of terms.annex ?? []) { try { store.commit(planMergeStates(store.getState().map, { from: x.fromStateId, to: x.toStateId, date: currentDate() })); } catch (e) { /* 併合できなければ通常の講和のまま */ } }
          runCollapses();
        } finally { store.endBatch(); }
        rerender(); ok = true;
      }); return ok; }) ?? false;
    },
    /** 旧形式（互換用）：1つの受取国・領域・賠償金 */
    signPeace(warId, terms) {
      withMap((map) => safeRun("講和条約", () => {
        const war = listWars(map).find((w) => w.id === warId);
        const cmd = planSignPeace(map, warId, terms, currentDate());
        store.beginBatch(cmd.label ?? "講和条約");
        try { store.commit(cmd); putMarker("peace", "🕊️", capitalCell(store.getState().map, terms.toStateId), `${dateLabel()} ${war?.name ?? "戦争"}の講和`); runCollapses(); } finally { store.endBatch(); }
        rerender();
      }));
    },
  };
}
