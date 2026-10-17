// シミュレーション系アクション：部隊・戦闘・同盟・戦争/講和の操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/sim/*, core/edit/{alliances,wars}.js にあり、ここは配線と通知だけ。

import { planCreateRegiment, planMoveRegiment, planEditRegiment, planDisbandRegiment, regimentsOf } from "../core/sim/military.js";
import { planResolveBattle, planResolveMuster } from "../core/sim/battle.js";
import { planCreateAlliance, planEditAlliance, planDissolveAlliance, listAlliances, alliancesOf } from "../core/edit/alliances.js";
import { planDeclareAndResolveWar, planSetWarType, planDeclareWar, planRecordBattle, planSetMuster, warNameTaken, suggestCessions, suggestCessionChunks, suggestTreaty, suggestTerms, planWarPreview, planReevaluateWars, planSignPeace, planSignTreaty, treatyBudget, planAdvanceWars, planFinishWar, planWithdraw, currentWarScore, warsOngoing, planRenameWar, warsAwaitingTreaty, planPeaceVenue, peaceSides, estimatePeace, listWars, activeWars, warsOf } from "../core/edit/wars.js";
import { forcePower } from "../core/sim/units.js";
import { planAddMarker } from "../core/edit/markers.js";
import { createRandom } from "../core/random.js";
import { suggestLabel } from "../core/edit/naming.js";
import { withEvent } from "../core/edit/history-log.js";
import { makeCommand, setProps } from "../core/edit/commands.js";
import { planSplitArmy, pickRebelProvinces, REBEL_GOALS } from "../core/edit/rebellion.js";
import { REGIMES, REGIME_BY_KEY, planSetRegime } from "../core/edit/regimes.js";
import { rollSuccession, ensureLeaders, planChangeLeader } from "../core/edit/leaders.js";
import { planArmyUpkeep, planAnnualConscription } from "../core/sim/military.js";
import { rollMinorEvents, planMinorEvent } from "../core/sim/minor-events.js";
import { planSetCurrency, getCurrency, exchangeRate } from "../core/sim/currency.js";
import { planNextCollapse } from "../core/sim/collapse.js";
import { leaderOf } from "../core/edit/alliances.js";
import { planCovertOp, covertOdds, listCovertOps, COVERT_KINDS } from "../core/sim/covert.js";
import { planSetVassal, planReleaseVassal, vassalInfo } from "../core/edit/vassals.js";
import { planConcludeTreaty, planBreakTreaty, planAmendTreaty, planSetTreatyParties, planWarBreach, findWarViolations, joinCommands, listTreaties, planSetTreatySettings, getTreatySettings, planExpireWarSupport, BIND_LEVELS } from "../core/edit/treaties.js";
import { planMergeStates, planDeclareIndependence } from "../core/edit/sovereignty.js";
import { rollNaturalEvents, planPlague, planRebellion, getNaturalSettings, planSetNaturalSettings } from "../core/sim/natural-events.js";
import { planAddEntity } from "../core/edit/entities.js";
import { planPaint } from "../core/edit/paint.js";
import { planSetOrigins } from "../core/edit/profile.js";
import { suggestName as planSuggestName, withProvisional } from "../core/edit/naming.js";
import { strikeEffects } from "../core/sim/nuclear.js";
import { planDraftNuclearOp, planSetNuclearStock, planCancelNuclearOp, planExecuteNuclearOp, listNuclearOps, nuclearStock } from "../core/sim/nuclear.js";

export function createSimActions({ store, renderer }) {
  const rnd = createRandom(Date.now());
  const rerender = () => renderer.requestRender();
  const withMap = (fn) => { const m = store.getState().map; return m ? fn(m) : undefined; };
  const commitOrThrow = (plan) => { if (plan) { store.commit(plan); rerender(); } };
  const safeRun = (label, fn) => {
    try { return fn(); }
    catch (e) { store.update((s) => { s.error = `${label}: ${e.message}`; }); return undefined; }
  };
  /** 複数の変更を「全部成功か、全部取り消し」で行う。途中で失敗したら画面も元に戻して例外を投げ直す */
  const atomic = (label, fn) => {
    try { return store.transaction(label, fn); }
    catch (e) { rerender(); throw e; }
  };
  /**
   * 講和で割譲する区画の受取先を「傀儡国家を新設」にした分（cession.puppetOf = 宗主国になる勝者）。
   * 宗主国ごとに1つ、新しい国を作って従属させ、区画の受取国をその国に書き換えた条項を返す。首都は区画に含まれないので、
   * 新しい国の首都は、区画の中でいちばん人口の多い都市（無ければ都市なし）。
   */
  const buildPuppets = (map, warId, terms) => {
    const groups = new Map();
    for (const c of terms.cessions ?? []) if (c.puppetOf != null) groups.set(c.puppetOf, [...(groups.get(c.puppetOf) ?? []), c]);
    if (!groups.size) return terms;
    const made = new Map();
    for (const [overlord, list] of groups) {
      const nm = (terms.puppetNames ?? {})[overlord] || planSuggestName(map, { kind: "state", rnd }).name;
      const add = planAddEntity(map, { kind: "state", name: nm, rnd }); store.commit(add.command);
      const m2 = store.getState().map, ns = m2.pack.states[add.id];
      const reg = REGIME_BY_KEY[m2.pack.states[overlord]?.regime] ?? REGIMES[0];
      const cells = new Set(list.flatMap((c) => c.cells));
      const burgs = m2.pack.burgs.filter((b) => b && b.i && !b.removed && cells.has(b.cell)).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
      store.commit(makeCommand("傀儡国家の設定", ["politics"], [setProps(ns, { regime: reg.key, form: reg.form, formName: reg.label, vassal: { overlord, kind: "puppet", since: currentDate() }, ...(burgs[0] ? { capital: burgs[0].i } : {}) })]));
      made.set(overlord, add.id);
    }
    return { ...terms, cessions: terms.cessions.map((c) => (c.puppetOf != null ? { ...c, toStateId: made.get(c.puppetOf), puppetOf: undefined } : c)) };
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

  /** 状況が動いた戦争を、いまの戦力・士気・民意で判定し直す（ハプニング・隠密作戦・撤退・核の使用のあと） */
  const reevaluateWarIds = (ids) => {
    const map = store.getState().map; if (!map || !ids.length) return;
    const stateIds = new Set(); for (const w of listWars(map)) if (ids.includes(w.id)) for (const x of [...w.attackers, ...w.defenders]) stateIds.add(x);
    const re = planReevaluateWars(map, [...stateIds], null); if (re) store.commit(makeCommand("戦況の再判定", [], [re]));
  };
  const reevaluateTouched = (cmd) => { if (cmd?.touchedWars?.length) reevaluateWarIds(cmd.touchedWars); };
  const reevaluateStates = (stateIds) => { const map = store.getState().map; const re = map ? planReevaluateWars(map, stateIds, null) : null; if (re) store.commit(makeCommand("戦況の再判定", [], [re])); };

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

  /**
   * 反乱・独立：属州（複数可）を新しい国家として切り離す。「全部成功か全部取り消し」。
   *   civil: true なら HoI4 のように、軍が割れて、元の国との内戦（戦争）が始まる。false なら話し合いによる平和的な独立
   * 失敗したら例外を投げる（何も変わらない）。
   * @returns {{id:number, name:string, provinceNames:string[], warId:number|null, fromId:number}}
   */
  function breakaway({ provinceIds, name, color, civil, provisional = false, date, rng = rnd }) {
    const first = store.getState().map; if (!first) throw new Error("地図を開いてください");
    const fromId = first.pack.provinces[provinceIds?.[0]]?.state;
    if (!(fromId > 0)) throw new Error("属州が存在しません");
    const nm = (name ?? "").trim() || planSuggestName(first, { kind: "state", rnd: rng, stateId: fromId }).name;
    const out = atomic(civil ? "反乱（内戦）" : "属州の独立", () => {
      const map = store.getState().map;
      const r = planDeclareIndependence(map, { provinceIds, name: nm, rnd: rng, date, cause: civil ? "rebellion" : "peaceful" });
      store.commit(provisional ? withProvisional(map, r.command, "state", r.id, true) : r.command);
      if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) store.commit(makeCommand("国の色", ["politics"], [setProps(store.getState().map.pack.states[r.id], { color: color.toLowerCase() })]));
      let warId = null;
      if (civil) {
        const split = planSplitArmy(store.getState().map, fromId, r.id); if (split.command) store.commit(split.command);
        const w = planDeclareAndResolveWar(store.getState().map, { attackers: [r.id], defenders: [fromId], date, rnd: rng, type: "civil" });
        store.commit(w.command); warId = w.id;
        const m2 = store.getState().map, fromName = m2.pack.states[fromId].fullName ?? m2.pack.states[fromId].name;
        let wn = `${fromName}内戦`; if (warNameTaken(m2, wn, warId)) wn = `${date.year}年の${fromName}内戦`;
        if (!warNameTaken(m2, wn, warId)) { const rn = planRenameWar(m2, warId, wn); if (rn) store.commit(rn); }
        putMarker("war", "⚔️", capitalCell(store.getState().map, r.id), `${date.year}年${date.month}月 ${wn}`);
        runCollapses();
      }
      return { id: r.id, name: nm, provinceNames: r.provinceNames, warId, fromId };
    });
    rerender();
    return out;
  }

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
        // 戦闘そのもの・マーカー・戦績の記録は、全部成功か全部取り消し
        atomic(`戦闘（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`, () => {
          store.commit(command);
          if (warId != null) putMarker("battlefields", "⚔️", spot, title);
          if (warId != null) {
            const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
            if (recCmd) store.commit(recCmd);
          }
        });
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
        // 戦闘そのもの・マーカー・戦績の記録は、全部成功か全部取り消し
        atomic(`会戦（${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}）`, () => {
          store.commit(command);
          if (warId != null) putMarker("battlefields", "⚔️", spot, title);
          if (warId != null) {
            const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
            if (recCmd) store.commit(recCmd);
          }
        });
        rerender();
        return result;
      }));
    },

    // --- 同盟 ---
    listAlliances() { return withMap((map) => listAlliances(map)) ?? []; },
    alliancesOf(stateId) { return withMap((map) => alliancesOf(map, stateId)) ?? []; },
    createAlliance(name, memberIds, bond = "standard", leader = null) {
      // 同盟は条約の一種。名前が空なら、盟主の文化に合わせたランダムな名前を付ける
      return withMap((map) => safeRun("同盟の結成", () => {
        const given = (name ?? "").trim();
        const label = given || suggestLabel(map, { kind: "alliance", rnd, stateId: leader ?? memberIds[0] });
        const bind = BIND_LEVELS.find((b) => b.bond === bond)?.key ?? "medium";
        const lead = leader ?? memberIds[0];
        const r = planConcludeTreaty(map, { kind: "alliance", name: label, parties: memberIds.map((id) => ({ state: id, role: id === lead ? "盟主" : "加盟" })), terms: { bind }, date: currentDate() });
        commitOrThrow(r.command); return r.treaty.ref.allianceId;
      }));
    },
    // --- 条約（同盟・不可侵・経済協力・従属・国境・共同宣言・講和）。確定するまで何も残さない ---
    listTreaties() { return withMap((map) => listTreaties(map)) ?? []; },
    /** 条約を結ぶ。成功なら条約の id、失敗なら null（理由は画面に出る） */
    concludeTreaty(opts) { return withMap((map) => { let id = null; safeRun("条約の締結", () => { const r = planConcludeTreaty(map, { ...opts, date: currentDate() }); commitOrThrow(r.command); id = r.id; rerender(); }); return id; }) ?? null; },
    breakTreaty(id, by = null) { return withMap((map) => { let ok = false; safeRun("条約の破棄", () => { commitOrThrow(planBreakTreaty(map, id, { by, date: currentDate() })); ok = true; rerender(); }); return ok; }) ?? false; },
    setTreatyParties(id, stateIds) { return withMap((map) => { let ok = false; safeRun("条約の参加国の変更", () => { const c = planSetTreatyParties(map, id, stateIds); if (c) commitOrThrow(c); ok = true; rerender(); }); return ok; }) ?? false; },
    amendTreaty(id, patch) { return withMap((map) => { let ok = false; safeRun("条約の改定", () => { const c = planAmendTreaty(map, id, patch); if (c) commitOrThrow(c); ok = true; }); return ok; }) ?? false; },
    /** 宣戦が、有効な不可侵条約に反するか（画面の警告用。副作用なし） */
    treatyWarnings(attackers, defenders) { return withMap((map) => findWarViolations(map, attackers, defenders).map((v) => ({ treaty: v.treaty.name, aggressor: v.aggressor, target: v.target }))) ?? []; },
    treatySettings() { return withMap((map) => getTreatySettings(map)) ?? { civilCallsAllies: false }; },
    setTreatySettings(patch) { withMap((map) => safeRun("条約の設定", () => { const c = planSetTreatySettings(map, patch); if (c) commitOrThrow(c); })); },
    /** 同盟の名前をランダムに作る（盟主・加盟国の文化に合わせる） */
    suggestAllianceName(stateId) { return withMap((map) => suggestLabel(map, { kind: "alliance", rnd, stateId })) ?? ""; },
    editAlliance(id, patch) {
      withMap((map) => safeRun("同盟の編集", () => {
        const a = listAlliances(map).find((x) => x.id === id);
        const plan = planEditAlliance(map, id, patch);
        const renamed = a && patch.name !== undefined && (patch.name ?? "") !== a.name;
        commitOrThrow(plan && renamed ? withEvent(map, plan, { type: "rename-alliance", title: `同盟の改称: 「${a.name}」→「${patch.name}」` }) : plan);
      }));
    },
    dissolveAlliance(id) {
      withMap((map) => safeRun("同盟の解消", () => {
        const t = listTreaties(map).find((x) => x.kind === "alliance" && x.ref?.allianceId === id && x.status !== "broken");
        commitOrThrow(t ? planBreakTreaty(map, t.id, { date: currentDate() }) : planDissolveAlliance(map, id, currentDate()));
      }));
    },

    // --- 戦争・講和 ---
    listWars() { return withMap((map) => listWars(map)) ?? []; },
    activeWars() { return withMap((map) => activeWars(map)) ?? []; },
    warsOf(stateId) { return withMap((map) => warsOf(map, stateId)) ?? []; },
    declareWar(attackers, defenders, name) {
      return withMap((map) => safeRun("宣戦布告", () => {
        const r = planDeclareWar(map, { name, attackers, defenders, date: currentDate() });
        const war = r.command.label ?? "宣戦布告";
        const cmd = joinCommands(r.command, planWarBreach(map, attackers, defenders, currentDate())); // 不可侵条約への違約（あれば）を同じ操作にまとめる
        atomic(war, () => {
          store.commit(cmd);
          const m = store.getState().map;
          putMarker("war", "⚔️", capitalCell(m, attackers[0]), `${dateLabel()} ${listWars(m).find((w) => w.id === r.id)?.name ?? "開戦"}（開戦）`);
        });
        rerender();
        return r.id;
      }));
    },
    /** 進行中の戦争で、ある国の戦争形態を変える（上げると負荷が増す） */
    setWarType(warId, stateId, key) { return withMap((map) => { let ok = false; safeRun("戦争形態の変更", () => { const c = planSetWarType(map, warId, stateId, key, currentDate()); if (c) commitOrThrow(c); ok = true; rerender(); }); return ok; }) ?? false; },
    /** 戦争開始前の見積もり（招集した部隊でのバー用）。副作用なし */
    previewWar(attackers, defenders, muster, type) { return withMap((map) => planWarPreview(map, { attackers, defenders, muster, type })); },
    /** 「戦争開始」：招集した部隊で即判定し、戦闘の記録を自動生成する。結果 { id, name, result, joined, endsAt, battles, collapsed } */
    declareWarInstant(attackers, defenders, muster = null, type = "conventional", types = null, name = "") {
      return withMap((map) => {
        let out;
        safeRun("戦争開始", () => {
          const r = planDeclareAndResolveWar(map, { attackers, defenders, date: currentDate(), rnd, muster, type, types, name });
          let collapsed = [];
          const cmd = joinCommands(r.command, planWarBreach(map, attackers, defenders, currentDate())); // 不可侵条約への違約（あれば）
          atomic(r.command.label ?? "戦争開始", () => {
            store.commit(cmd);
            putMarker("war", "⚔️", capitalCell(store.getState().map, attackers[0]), `${dateLabel()} ${r.name}`);
            collapsed = runCollapses(); // 人口の大部分を失った国は、ここで崩壊する
          });
          rerender();
          out = { id: r.id, name: r.name, result: r.result, joined: r.joined, endsAt: r.endsAt, battles: r.battles, collapsed };
        });
        return out;
      });
    },
    suggestTreaty(warId) { return withMap((map) => { const w = listWars(map).find((x) => x.id === warId); return w ? suggestTreaty(map, w) : null; }); },
    suggestTerms(warId, opts) { return withMap((map) => { const w = listWars(map).find((x) => x.id === warId); return w ? suggestTerms(map, w, opts) : null; }); },
    suggestCessionChunks(toIds, fromId, opts) { return withMap((map) => suggestCessionChunks(map, toIds, fromId, opts)) ?? []; },
    treatyBudget(warId, terms) { return withMap((map) => { const w = listWars(map).find((x) => x.id === warId); return w ? treatyBudget(map, w, terms) : []; }) ?? []; },
    warsOngoing() { return withMap((map) => warsOngoing(map)) ?? []; },
    /** 戦闘を最後まで進める */
    /** 経過を、目安の期間の終わりまで進める（時間を待たずに確かめたいとき） */
    finishWar(warId) { withMap((map) => safeRun("経過を進める", () => { const c = planFinishWar(map, warId, rnd); if (c) { atomic("経過を進める", () => { store.commit(c); reevaluateTouched(c); runCollapses(); }); rerender(); } })); },
    /** 月が進むたびの、戦争の損害とハプニングの展開（時間経過）。崩壊した国名を返す */
    /** 反乱・独立（手動）。失敗したら例外。ウィンドウ側でメッセージを出す */
    rebel(opts) { return breakaway({ ...opts, date: currentDate() }); },
    /** 「反乱を起こす」ボタン。目的（分離独立 / 政体転覆）と規模（小・中・大）から、連結した領域を自動で選び、軍を割って内戦を始める */
    startRebellion(stateId, { goal = "secession", scale = "medium" } = {}) {
      const map = store.getState().map; if (!map) throw new Error("地図を開いてください");
      if (!REBEL_GOALS.some((g) => g.key === goal)) throw new Error("反乱の目的を選んでください");
      const provinceIds = pickRebelProvinces(map, stateId, scale, rnd);
      if (!provinceIds.length) throw new Error("反乱を起こせる属州がありません（属州が2つ以上、必要です）");
      const out = breakaway({ provinceIds, civil: true, date: currentDate() });
      const m2 = store.getState().map, rebel = m2.pack.states[out.id];
      const parent = m2.pack.states[stateId];
      const others = REGIMES.filter((r) => r.key !== (parent.regime ?? ""));
      const reg = goal === "overthrow" ? others[Math.floor(rnd.next() * others.length)] : REGIME_BY_KEY[parent.regime] ?? others[0];
      store.commit(makeCommand("反乱側の目的・政体", ["politics"], [setProps(rebel, { rebelGoal: goal, regime: reg.key, form: reg.form, formName: reg.label })]));
      rerender();
      return { ...out, goal, scale, regime: reg.label };
    },
    /** 自然発生イベントの設定（オン／オフ・頻度） */
    getNaturalEvents() { const m = store.getState().map; return m ? getNaturalSettings(m) : null; },
    setNaturalEvents(patch) { safeRun("自然発生イベントの設定", () => { const m = store.getState().map; const c = m && planSetNaturalSettings(m, patch); if (c) store.commit(c); }); },

    /**
     * 年が変わったときに呼ぶ。独立・疫病・反乱・宗教の分派が、確率で起きる（乱数は固定しない）。
     * 1つの出来事は「全部成功か全部取り消し」。ひとつが失敗しても、ほかの出来事は続ける。
     * @returns {{kind:string, title:string}[]} 実際に起きた出来事
     */
    /**
     * 月が変わるたびに呼ぶ（v2.4.0）。1か月分を1回のトランザクションにまとめる（Undo の履歴を増やしすぎない）。
     *   ・指導者: 指導者のいない国に初代を置き、在任年数・年齢などから、継承が起きれば自動で世代交代する
     *   ・軍隊: 部隊の無い国に生成し、技術ドクトリンに合わせて編成（連隊 → 師団 → 軍団 …）と兵科を毎月少しずつ更新する
     *   ・出来事: 豊作・飢饉・災害・好況・ストライキ・選挙など（技術ドクトリンと政体に合うものだけ）
     * @returns {{leaders:number, army:number, events:number}} 起きた件数
     */
    /** 国家ができたとき、軍隊を自動で生成する（技術ドクトリンに合う編成で、初期の兵力を満たす）。すでに部隊があれば何もしない */
    autoArmy(stateId, rng = rnd) {
      return withMap((map) => {
        const st = map.pack.states[stateId]; if (!st || (st.military ?? []).length) return false;
        let made = false;
        safeRun("軍隊の自動編成", () => atomic("軍隊の自動編成", () => {
          const up = planArmyUpkeep(map, stateId, rng); if (!up) return;
          store.commit(up); const f = planAnnualConscription(map, stateId, { fill: true }); if (f) store.commit(f); made = true;
        }));
        if (made) rerender();
        return made;
      }) ?? false;
    },
    advanceMonthly(date, rng = rnd) {
      const stat = { leaders: 0, army: 0, events: 0 };
      if (!store.getState().map) return stat;
      try {
        atomic("月ごとの更新", () => {
          const map = store.getState().map;
          ensureLeaders(map, date);
          for (const st of map.pack.states.filter((x) => x && x.i > 0 && !x.removed)) {
            const hit = rollSuccession(map, st.i, date, rng);
            if (hit) { store.commit(planChangeLeader(map, st.i, { reason: hit.reason, stability: hit.stability, date, rnd: rng })); stat.leaders++; }
            const up = planArmyUpkeep(map, st.i, rng);
            if (up) { const fresh = !(st.military ?? []).length; store.commit(up); if (fresh) { const f = planAnnualConscription(map, st.i, { fill: true }); if (f) store.commit(f); } stat.army++; }
            else { const c = planAnnualConscription(map, st.i, { rate: 1 / 12, rnd: rng }); if (c) store.commit(c); }
          }
          for (const ev of rollMinorEvents(map, rng)) { const c = planMinorEvent(map, ev, date); if (c) { store.commit(c); stat.events++; } }
        });
      } catch { /* 月ごとの更新が失敗しても、時間は進める */ }
      return stat;
    },

    applyNaturalEvents(date, rng = rnd) {
      const done = [];
      const first = store.getState().map; if (!first) return done;
      for (const ev of rollNaturalEvents(first, rng)) {
        try {
          const title = atomic(`自然発生イベント（${ev.kind}）`, () => {
            const map = store.getState().map;
            if (ev.kind === "plague") { store.commit(planPlague(map, ev, date)); return "疫病"; }
            if (ev.kind === "independence") {
              breakaway({ provinceIds: ev.provinceIds ?? [ev.provinceId], civil: !!ev.civil, provisional: true, date, rng });
              return ev.civil ? "反乱（内戦）" : "属州の独立";
            }
            if (ev.kind === "schism") {
              const parent = map.pack.religions[ev.religionId];
              const nm = planSuggestName(map, { kind: "religion", rnd: rng, id: ev.religionId });
              const add = planAddEntity(map, { kind: "religion", name: nm.name, rnd: rng, extra: nm.extra });
              const entry = { type: "schism", title: `宗教「${parent.fullName ?? parent.name}」から「${nm.name}」が分かれた`, detail: `${ev.cells.length}セルの信徒が新しい宗派に移った`, date, states: [ev.stateId], cell: ev.cells[0], ref: { kind: "religion", id: add.id } };
              store.commit(withProvisional(map, withEvent(map, add.command, entry), "religion", add.id, true));
              const paint = planPaint(store.getState().map, { kind: "religion", target: add.id, cells: ev.cells });
              if (!paint.command) throw new Error("分派の領土を塗れませんでした");
              store.commit(paint.command);
              const org = planSetOrigins(store.getState().map, "religion", add.id, [ev.religionId]);
              if (org) store.commit(org);
              return "宗教の分派";
            }
            return null;
          });
          if (title) done.push({ kind: ev.kind, title });
        } catch { /* この出来事は取り消された（世界は元のまま）。ほかの出来事は続ける */ }
      }
      if (done.length) rerender();
      return done;
    },

    advanceWars(date) {
      return withMap((map) => {
        const c = planAdvanceWars(map, date, rnd); if (!c) return [];
        return atomic("戦争の経過", () => { store.commit(c); reevaluateTouched(c); return runCollapses(); });
      }) ?? [];
    },
    /** 軍を引き上げる。regIds は戦線に残す部隊（空なら全軍撤退） */
    withdrawFromWar(warId, stateId, regIds) {
      return withMap((map) => { let ok = false; safeRun("軍の引き上げ", () => {
        const c = planWithdraw(map, warId, stateId, regIds, currentDate()); if (!c) return;
        atomic("軍の引き上げ", () => { store.commit(c); reevaluateWarIds([warId]); }); rerender(); ok = true;
      }); return ok; }) ?? false;
    },
    currentWarScore(war) { return currentWarScore(war); },
    // --- 隠密作戦（サイバー攻撃など） ---
    covertKinds() { return COVERT_KINDS; },
    covertOps() { return withMap((map) => listCovertOps(map)) ?? []; },
    covertOdds(attackerId, targetId, kind) { return withMap((map) => covertOdds(map, attackerId, targetId, kind)); },
    runCovertOp(attackerId, targetId, kind) {
      return withMap((map) => { let op = null; safeRun("隠密作戦", () => {
        const r = planCovertOp(map, { attackerId, targetId, kind, date: currentDate(), rnd });
        atomic(r.command.label ?? "隠密作戦", () => { store.commit(r.command); reevaluateStates([attackerId, targetId]); runCollapses(); });
        rerender(); op = r.op;
      }); return op; }) ?? null;
    },
    runCollapses,
    allianceLeader(a) { return leaderOf(a); },
    // --- 従属関係（傀儡・保護国・属国） ---
    vassalInfo(stateId) { return withMap((map) => vassalInfo(map, stateId)) ?? null; },
    setVassal(vassalId, overlordId, kind) { withMap((map) => safeRun("従属関係", () => commitOrThrow(planSetVassal(map, vassalId, overlordId, kind, currentDate())))); },
    releaseVassal(vassalId) { withMap((map) => safeRun("独立", () => commitOrThrow(planReleaseVassal(map, vassalId)))); },
    // --- 核作戦（立案→実行。通常の戦争では使われない） ---
    nuclearOps() { return withMap((map) => listNuclearOps(map)) ?? []; },
    strikeEstimate(stateId, warheads) { return withMap((map) => strikeEffects(map.pack.states[stateId]?.techLevel ?? 3, warheads)); },
    setNuclearStock(stateId, count) { withMap((map) => safeRun("核の保有数の設定", () => { const c = planSetNuclearStock(map, stateId, count); if (c) commitOrThrow(c); })); },
    nuclearStock(stateId) { return withMap((map) => nuclearStock(map.pack.states[stateId])) ?? 0; },
    draftNuclearOp(attackerId, targetId, warheads) { return withMap((map) => { let id; safeRun("核作戦の立案", () => { const r = planDraftNuclearOp(map, { attackerId, targetId, warheads }); commitOrThrow(r.command); id = r.id; }); return id; }); },
    cancelNuclearOp(id) { withMap((map) => safeRun("核作戦の取り消し", () => commitOrThrow(planCancelNuclearOp(map, id)))); },
    executeNuclearOp(id) {
      withMap((map) => safeRun("核作戦の実行", () => {
        const cmd = planExecuteNuclearOp(map, id, currentDate());
        atomic(cmd.label ?? "核作戦の実行", () => {
          store.commit(cmd);
          const op = listNuclearOps(store.getState().map).find((o) => o.id === id);
          putMarker("nuclear", "☢️", capitalCell(store.getState().map, op.targetId), `${dateLabel()} ${op.name}`);
          // まだ講和していない戦争は、いまの戦力・士気で判定し直す（核の打撃が戦況・勝敗に反映される）
          const re = planReevaluateWars(store.getState().map, [op.targetId, op.attackerId], `☢ ${op.name}：${op.warheads}発が使用された`, currentDate());
          if (re) store.commit(makeCommand("核作戦による戦況の変化", [], [re]));
          runCollapses();
        });
        rerender();
      }));
    },
    getCurrency(stateId) { return withMap((map) => getCurrency(map.pack.states[stateId])); },
    /** 1 from通貨 = ? to通貨 */
    exchangeRate(fromId, toId) { return withMap((map) => exchangeRate(map, fromId, toId)) ?? 1; },
    setCurrency(stateId, patch) { withMap((map) => safeRun("通貨の設定", () => { store.commit(planSetCurrency(map, stateId, patch)); rerender(); })); },
    warNameTaken(name, exceptId) { return withMap((map) => warNameTaken(map, name, exceptId)) ?? false; },
    /** 召集する部隊（{ [国家ID]: [部隊ID...] }）を保存する */
    setMuster(warId, muster) { withMap((map) => safeRun("部隊の召集", () => { atomic("部隊の召集", () => { store.commit(planSetMuster(map, warId, muster)); reevaluateWarIds([warId]); }); rerender(); })); },
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
    /** 内戦の決着を、選択だけで自動処理する。outcome: "suppress"（鎮圧: 反乱側の国を解体して属州を取り戻す）/ "independence"（独立を承認） */
    resolveCivilWar(warId, outcome) {
      const _w = store.getState().map && listWars(store.getState().map).find((w) => w.id === warId);
      const map = store.getState().map; const war = map && listWars(map).find((w) => w.id === warId);
      if (!war || war.type !== "civil" || war.endedAt) return false;
      const rebel = war.attackers[0], parent = war.defenders[0];
      const terms = outcome === "suppress"
        ? { kind: "annex", treatyName: `${war.name}の終結（鎮圧）`, annex: [{ fromStateId: rebel, toStateId: parent }], notes: "反乱側の国を解体し、属州を取り戻した" }
        : { kind: "white", treatyName: `${war.name}の終結（独立承認）`, notes: "元の国は、反乱側の独立を承認した" };
      const ok = !!this.signTreaty(warId, terms, { enforceBudget: false, allowOngoing: true });
      if (ok && outcome !== "suppress" && _w) { const m3 = store.getState().map, rb = m3.pack.states[_w.attackers[0]]; if (rb?.rebelGoal === "overthrow" && rb.regime) { const rc = planSetRegime(m3, _w.defenders[0], rb.regime); if (rc) store.commit(rc); } } // 政体転覆が成功した：元の国の政体が変わる
      if (ok) { const c = planExpireWarSupport(store.getState().map, warId, currentDate()); if (c) { store.commit(c); rerender(); } } // 戦争が終われば、外国の支援は失効する
      return ok;
    },
    /** 外国の支援（内戦）を、国の選択だけで記録する（条約の一種） */
    recordCivilSupport(warId, supporterId, side) {
      const map = store.getState().map; const war = map && listWars(map).find((w) => w.id === warId);
      if (!war || war.type !== "civil") return null;
      const target = side === "rebel" ? war.attackers[0] : war.defenders[0];
      return this.concludeTreaty({ kind: "support", parties: [{ state: supporterId, role: "支援国" }, { state: target, role: side === "rebel" ? "反乱側" : "元の国側" }], terms: { side, warId }, originWar: warId });
    },
    signTreaty(warId, terms, opts = {}) {
      return withMap((map) => { let ok = false; safeRun("講和条約", () => {
        const war = listWars(map).find((w) => w.id === warId);
        // 講和の記録・マーカー・併合・崩壊は、全部成功か全部取り消し。
        // 併合だけが失敗して講和だけ成立する（記録と実際の状態がずれる）ことを防ぐ。
        atomic("講和条約", () => {
          terms = buildPuppets(map, warId, terms); // 「傀儡国家を新設」を選んだ区画があれば、先に国を作る（失敗したら全部取り消し）
          const cmd = planSignTreaty(map, warId, terms, currentDate(), opts);
          store.commit(cmd);
          const to = terms.cessions?.[0]?.toStateId ?? terms.annex?.[0]?.toStateId ?? terms.reparations?.[0]?.toStateId ?? war?.attackers?.[0];
          putMarker("peace", "🕊️", capitalCell(store.getState().map, to), `${dateLabel()} ${war?.name ?? "戦争"}の講和`);
          // 講和は条約の一種として、外交の条約一覧に入る（年表の記録は講和の側にあるので、重ねて記録しない）
          const m2 = store.getState().map, w2 = listWars(m2).find((x) => x.id === warId);
          if (w2?.terms?.treatyName) {
            const all = [...new Set([...(w2.attackers ?? []), ...(w2.defenders ?? [])])];
            store.commit(planConcludeTreaty(m2, { kind: "peace", name: w2.terms.treatyName, parties: all.map((id) => ({ state: id, role: (w2.attackers ?? []).includes(id) ? "攻撃側" : "防御側" })), terms: { kind: w2.terms.kind ?? "standard", notes: w2.terms.notes ?? "" }, originWar: warId, date: currentDate() }, { logEvent: false }).command);
          }
          for (const x of terms.annex ?? []) store.commit(planMergeStates(store.getState().map, { from: x.fromStateId, to: x.toStateId, date: currentDate() }));
          runCollapses();
        });
        rerender(); ok = true;
      }); return ok; }) ?? false;
    },
    /** 旧形式（互換用）：1つの受取国・領域・賠償金 */
    signPeace(warId, terms) {
      withMap((map) => safeRun("講和条約", () => {
        const war = listWars(map).find((w) => w.id === warId);
        const cmd = planSignPeace(map, warId, terms, currentDate());
        atomic(cmd.label ?? "講和条約", () => { store.commit(cmd); putMarker("peace", "🕊️", capitalCell(store.getState().map, terms.toStateId), `${dateLabel()} ${war?.name ?? "戦争"}の講和`); runCollapses(); });
        rerender();
      }));
    },
  };
}
