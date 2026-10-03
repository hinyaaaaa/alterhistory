// 軍事：部隊(regiment)の作成・移動・削除・年次徴兵。
//
// データ構造は Azgaar 実データの state.military 配列を踏襲する（実ファイルで確認済み）:
//   { i, name, icon, cell, x, y, state, u: {兵科key: 数} }
// ただし u のキーは、実データではファイルごとに自由記述だったが、ここでは
// core/sim/units.js の UNIT_KEYS に統一する（部隊の互換性・戦闘計算のため）。
// 既存の自由記述キーを持つ部隊は、読み込み時に「不明部隊」として保持し、戦闘には使えるが
// 兵科別の内訳は表示のみ（別モジュールで正規化を提供）。
//
// 純粋ロジック層：DOM に依存しない。編集はコマンド(commands.js の部品)として返す。

import { setList, setProps, makeCommand } from "../edit/commands.js";
import { UNIT_KEYS, UNIT_BY_KEY, emptyForce, DOCTRINE_BY_KEY, DEFAULT_DOCTRINE, stateTypeMult } from "./units.js";
import { ensureEconomy } from "./economy.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 国家の military 配列を安全に取り出す（無ければ空配列で補う） */
export function regimentsOf(state) {
  return Array.isArray(state.military) ? state.military : [];
}

/** 次に振る部隊ID（国家内でユニーク。実データではstate内で0始まりの連番） */
function nextRegimentId(state) {
  const list = regimentsOf(state);
  return list.length ? Math.max(...list.map((r) => r.i)) + 1 : 0;
}

/** 部隊を新規作成する。セル位置に配置し、初期兵力は空（徴兵や編集で満たす） */
export function planCreateRegiment(map, stateId, cell, { name, icon = "🛡️" } = {}) {
  const state = map.pack.states[stateId];
  if (!isLive(state)) throw new Error("その国家は存在しません");
  if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("地図の外には配置できません");
  if (map.pack.cells.state[cell] !== stateId) throw new Error("部隊は自国の領土内にしか設置できません");
  const { p } = map.geometry.pack;
  const reg = {
    i: nextRegimentId(state), name: name || `${state.name}軍`, icon, state: stateId,
    cell, x: p[cell][0], y: p[cell][1], bx: p[cell][0], by: p[cell][1],
    u: emptyForce(),
  };
  const next = [...regimentsOf(state), reg];
  return { command: makeCommand("部隊を編成", ["places"], [setList((m) => m.pack.states[stateId].military, (m, v) => { m.pack.states[stateId].military = v; }, next)]), id: reg.i };
}

/** 部隊を移動する（セル単位） */
export function planMoveRegiment(map, stateId, regId, cell) {
  const state = map.pack.states[stateId];
  const reg = regimentsOf(state).find((r) => r.i === regId);
  if (!reg) throw new Error("その部隊は存在しません");
  if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("地図の外には移動できません");
  if (map.pack.cells.state[cell] !== stateId) throw new Error("部隊は自国の領土内にしか移動できません");
  if (reg.cell === cell) return null;
  const { p } = map.geometry.pack;
  return makeCommand("部隊を移動", ["places"], [setProps(reg, { cell, x: p[cell][0], y: p[cell][1] })]);
}

/** 部隊の兵力構成・名前を直接編集する（司令部での手動調整用。ドクトリンは国家単位のため、
    core/edit/military-doctrine.js の planSetDoctrine で変更する） */
export function planEditRegiment(map, stateId, regId, patch) {
  const state = map.pack.states[stateId];
  const reg = regimentsOf(state).find((r) => r.i === regId);
  if (!reg) throw new Error("その部隊は存在しません");
  const next = {};
  if (patch.name !== undefined && patch.name !== reg.name) next.name = patch.name;
  if (patch.icon !== undefined && patch.icon !== reg.icon) next.icon = patch.icon;
  if (patch.u) {
    const u = { ...reg.u };
    for (const k of UNIT_KEYS) if (patch.u[k] !== undefined) u[k] = Math.max(0, Math.round(patch.u[k]));
    if (JSON.stringify(u) !== JSON.stringify(reg.u)) next.u = u;
  }
  if (!Object.keys(next).length) return null;
  return makeCommand("部隊を編集", ["places"], [setProps(reg, next)]);
}

/** 部隊を解散する */
export function planDisbandRegiment(map, stateId, regId) {
  const state = map.pack.states[stateId];
  const list = regimentsOf(state);
  if (!list.some((r) => r.i === regId)) throw new Error("その部隊は存在しません");
  const next = list.filter((r) => r.i !== regId);
  return makeCommand("部隊を解散", ["places"], [setList((m) => m.pack.states[stateId].military, (m, v) => { m.pack.states[stateId].military = v; }, next)]);
}

/** その国が海に面しているか（領土のセルのどれかが水域のセルと隣り合う）。海軍を持てるかの判定に使う */
export function isCoastalState(map, stateId) {
  const c = map.pack.cells, nb = map.geometry?.pack?.cells?.c;
  if (!nb) return true; // 隣接情報が無いときは制限しない
  for (let i = 0; i < c.state.length; i++) {
    if (c.state[i] !== stateId) continue;
    for (const j of nb[i] ?? []) if (c.biome[j] === 0) return true;
  }
  return false;
}

// 兵科1ユニットあたりの人員（人）。目標の兵員規模を、兵科ごとのユニット数へ換算するのに使う
const CREW = { infantry: 1, artillery: 6, armor: 20, air: 25, navy: 150, special: 1, advanced: 30 };
// 平時に目標とする編成比（人員ベース）。装備の重い兵科ほど小さい
const BASE_SHARE = { infantry: 1, artillery: 0.14, armor: 0.1, air: 0.06, navy: 0.05, special: 0.02, advanced: 0.02 };

/**
 * 年次の兵力変動。現実の軍隊のように「いまの編成を土台に、少しずつ目標へ近づく」。
 *   ・目標の総兵員は人口の約0.6%（人口が増減すれば目標も動く）
 *   ・編成の目標は、技術水準・産業力・ドクトリン・国家タイプ・海に面するかで決まる
 *   ・各兵科は年に最大 +8% / −4% しか変わらない（急に増えたり消えたりしない）
 *   ・持っていない兵科は、条件（技術・産業・海岸）が揃っているときだけ、ごく少数から始まる
 *   ・条件を満たさなくなった兵科は年5%ずつ減る。核は年次では増減しない
 */
export function planAnnualConscription(map, stateId) {
  const state = map.pack.states[stateId];
  if (!isLive(state)) return null;
  ensureEconomy(state);
  const capital = map.pack.burgs[state.capital];
  if (!capital) return null;

  const pop = (state.rural ?? 0) + (state.urban ?? 0); // 千人
  const tech = state.techLevel ?? 3;
  const industry = state.industry ?? 0;
  const doctrine = DOCTRINE_BY_KEY[state.doctrine] ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE];
  const tmult = stateTypeMult(state.type);
  const coastal = isCoastalState(map, stateId);
  const list = regimentsOf(state);
  const home = list.find((r) => r.i === 0) ?? null;

  const cur = emptyForce();
  for (const r of list) for (const k of UNIT_KEYS) cur[k] += r.u?.[k] ?? 0;

  // 重い兵科は、産業力が足りないほど目標が小さくなる（産業 0 なら装備品はほぼ作れない）
  const industrial = Math.min(1, industry / 300);
  const shares = {};
  let sum = 0;
  for (const k of Object.keys(BASE_SHARE)) {
    const def = UNIT_BY_KEY[k];
    const allowed = tech >= (def.minTech ?? 1) && !(def.needsCoast && !coastal);
    let v = allowed ? BASE_SHARE[k] * (doctrine.mult[k] ?? 1) * (tmult[k] ?? 1) : 0;
    if (def.industryShare > 0) v *= 0.2 + 0.8 * industrial;
    shares[k] = v; sum += v;
  }
  const totalTarget = pop * 6; // 人口(千人)×6 ＝ 人口の0.6%
  const delta = emptyForce();
  let any = false;
  for (const k of Object.keys(BASE_SHARE)) {
    const target = sum > 0 ? (totalTarget * shares[k] / sum) / CREW[k] : 0;
    const have = cur[k];
    let d;
    if (shares[k] === 0) d = -Math.ceil(have * 0.05);                 // 条件を失った兵科は縮小
    else if (have === 0) d = target >= 1 ? Math.max(1, Math.round(target * 0.03)) : 0; // 新規はごく少数から
    else d = Math.max(-0.04 * have, Math.min(0.08 * have, (target - have) * 0.12));
    d = Math.round(d);
    if (d !== 0) { delta[k] = d; any = true; }
  }
  if (!any) return null;

  const parts = [];
  if (home) {
    const u = { ...home.u };
    for (const k of UNIT_KEYS) u[k] = Math.max(0, (u[k] ?? 0) + delta[k]);
    parts.push(setProps(home, { u }));
  } else {
    const { p } = map.geometry.pack;
    const cell = capital.cell;
    const u = emptyForce();
    for (const k of UNIT_KEYS) u[k] = Math.max(0, delta[k]);
    const reg = { i: 0, name: `${state.name}国防本隊`, icon: "🛡️", state: stateId, cell, x: p[cell][0], y: p[cell][1], bx: p[cell][0], by: p[cell][1], u };
    parts.push(setList((m) => m.pack.states[stateId].military, (m, v) => { m.pack.states[stateId].military = v; }, [reg, ...list]));
  }
  return makeCommand("年次の兵力変動", [], parts);
}
