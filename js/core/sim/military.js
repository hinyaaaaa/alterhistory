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
import { UNIT_KEYS, UNIT_BY_KEY, emptyForce, DOCTRINE_BY_KEY, DEFAULT_DOCTRINE } from "./units.js";
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

/**
 * 年次徴兵：国家の人口・産業力の一部を、既存の本国部隊（最初の1つ、無ければ新設）に上乗せする。
 * 経済(economy.js)の年次更新と同時に呼ぶ想定。
 *
 * 方針：本国（首都のセル）に「国防本隊」を1つ想定し、そこに兵力を集約する。複数部隊への配分や
 * 前線への転送はユーザーの手動操作（planMoveRegiment）に委ねる（自動配置はしない）。
 */
export function planAnnualConscription(map, stateId) {
  const state = map.pack.states[stateId];
  if (!isLive(state)) return null;
  ensureEconomy(state);
  const capital = map.pack.burgs[state.capital];
  if (!capital) return null;

  const pop = (state.rural ?? 0) + (state.urban ?? 0);
  const industry = state.industry ?? 0;
  const doctrine = DOCTRINE_BY_KEY[state.doctrine] ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE];
  // 人海戦術ドクトリンの国は、同じ人口からより多くの歩兵・特殊部隊を徴兵できる（HOI4のMass Assaultに相当）
  const conscriptBonus = 1 + (doctrine.conscriptBonus ?? 0);
  let list = regimentsOf(state);
  let home = list.find((r) => r.i === 0) ?? null;

  const delta = emptyForce();
  let any = false;
  for (const key of UNIT_KEYS) {
    const def = UNIT_BY_KEY[key];
    if (def.minTech && (state.techLevel ?? 3) < def.minTech) continue;
    const manpowerBonus = (key === "infantry" || key === "special") ? conscriptBonus : 1;
    const fromPop = (pop / 1000) * (def.rural + def.urban) * 0.15 * manpowerBonus; // 年間の徴兵ペース（緩やか）
    const unitCost = (def.soft + def.hard) / 2; // 兵科1つあたりの相対コストの目安（火力の平均値）
    const fromIndustry = def.industryShare > 0 ? (industry * def.industryShare) / (unitCost / 4) : 0;
    const add = Math.round(fromPop + fromIndustry);
    if (add > 0) { delta[key] = add; any = true; }
  }
  if (!any) return null;

  const parts = [];
  if (home) {
    const u = { ...home.u };
    for (const k of UNIT_KEYS) u[k] = (u[k] ?? 0) + delta[k];
    parts.push(setProps(home, { u }));
  } else {
    const { p } = map.geometry.pack;
    const cell = capital.cell;
    const reg = { i: 0, name: `${state.name}国防本隊`, icon: "🛡️", state: stateId, cell, x: p[cell][0], y: p[cell][1], bx: p[cell][0], by: p[cell][1], u: delta };
    parts.push(setList((m) => m.pack.states[stateId].military, (m, v) => { m.pack.states[stateId].military = v; }, [reg, ...list]));
  }
  return makeCommand("年次徴兵", [], parts);
}
