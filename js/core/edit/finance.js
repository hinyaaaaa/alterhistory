// 国家の財政（売上税・人頭税・国庫）の編集。値の意味・計算は core/sim/trade.js。
// 項目名は Azgaar 本家と同じ（state.salesTax / state.pollTax / state.treasury）なので、.map に書き出しても互換。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";
import { getFinance, clampRate } from "../sim/trade.js";

export { getFinance };

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/**
 * 税率・国庫を変更する。patch: { salesTax?, pollTax?, treasury? }。変化が無ければ null。
 * 税率は 0〜1 に丸める。国庫は 0 以上の数。
 */
export function planSetFinance(map, stateId, patch) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) throw new Error("存在しない国家です");
  const before = getFinance(s);
  const after = {};
  if (patch.salesTax !== undefined) after.salesTax = Math.round(clampRate(patch.salesTax) * 100) / 100;
  if (patch.pollTax !== undefined) after.pollTax = Math.round(clampRate(patch.pollTax) * 100) / 100;
  if (patch.treasury !== undefined) {
    const t = Number(patch.treasury);
    if (!Number.isFinite(t)) throw new Error("国庫は数値で指定してください");
    after.treasury = Math.max(0, Math.round(t * 100) / 100);
  }
  const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== before[k] || typeof s[k] !== "number"));
  // 未設定の項目に「政体の既定値と同じ値」を明示するだけの変更は、変更として扱わない
  const real = Object.fromEntries(Object.entries(changed).filter(([k, v]) => v !== before[k]));
  if (!Object.keys(real).length) return null;
  return makeCommand(`財政の変更（${s.name}）`, [], [setProps(s, real)]);
}
