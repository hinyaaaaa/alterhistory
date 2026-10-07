// バランス設定（⚖）を「地図」に持たせる。
//   同じ地図なら、どの端末で開いても同じ歴史になるように、既定値と違う項目だけを map.ext.data.balance に保存する。
//   ・アプリの既定値 = BALANCE_DEFAULTS
//   ・この地図の上書き値 = map.ext.data.balance（既定値と違うものだけ）
//   地図を開いたとき・Undo/Redo したときは applyMapBalance で BALANCE（実行時の値）を作り直す。
//   ※ Azgaar 互換形式で書き出すと、拡張データは含まれない（この上書き値も失われる）。
// 純粋ロジック層：DOM に依存しない。
import { BALANCE, BALANCE_DEFAULTS, setBalance, resetBalance, clampBalanceValue } from "../sim/balance.js";
import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";

/** この地図の上書き値（既定値と違う項目だけ） */
export const balanceOverrides = (map) => ({ ...(map?.ext?.data?.balance ?? {}) });

/** 実行時の BALANCE を「既定値＋この地図の上書き値」にそろえる。地図が無ければ既定値 */
export function applyMapBalance(map) {
  resetBalance();
  const o = map?.ext?.data?.balance;
  if (o && typeof o === "object") setBalance(o);
  return BALANCE;
}

const writeOverrides = (m, o) => { const ext = ensureExt(m); if (Object.keys(o).length) ext.data.balance = o; else delete ext.data.balance; };

/**
 * この地図のバランス設定を変える（Undo できる）。
 * @param patch { キー: 値 }。null を渡すとこの地図の上書きを全部消して既定値に戻す
 * @returns コマンド。変化が無ければ null
 */
export function planSetBalance(map, patch) {
  const prev = balanceOverrides(map);
  let next = {};
  if (patch !== null) {
    next = { ...prev };
    for (const [k, raw] of Object.entries(patch ?? {})) {
      const v = clampBalanceValue(k, raw); if (v === null) continue;
      if (v === BALANCE_DEFAULTS[k]) delete next[k]; else next[k] = v;
    }
  }
  if (JSON.stringify(next) === JSON.stringify(prev)) return null;
  return makeCommand("バランス設定の変更", [], [{
    apply: (m) => { writeOverrides(m, next); applyMapBalance(m); },
    revert: (m) => { writeOverrides(m, prev); applyMapBalance(m); },
  }]);
}
