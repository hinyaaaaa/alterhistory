// 自動検査（v2.4.0）。データ検査の窓は無い。問題があるときだけ、右下にエラーを出す。
//   ・操作時・入力時: 地図を直したあと、少し待ってから（連続操作の途中は見ない）検査する。読み込み直後の問題は、ここでは出さない（読み込みの警告が出している）
//   ・5年ごと: 年が5の倍数になったとき、自動で検査する。問題があるときだけ通知する
//   ・無所属の土地は、検査の対象外（国が成立していないだけ）
//   ・同じ問題は、直るまで繰り返し出さない
import { checkIntegrity, snapshotBaseline } from "../core/edit/integrity.js";

export const AUTO_CHECK_YEARS = 5;
const DEBOUNCE_MS = 450;

export function createAutoCheck({ store, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let baseline = null, baseMap = null, timer = 0, lastKey = "";
  const report = (problems, where) => {
    const key = problems.join("|");
    if (!problems.length) { lastKey = ""; return false; }
    if (key === lastKey) return false;
    lastKey = key;
    const shown = problems.slice(0, 3).map((p) => `・${p}`).join("\n"), more = problems.length > 3 ? `\n…ほか ${problems.length - 3} 件` : "";
    store.update((s) => { s.error = `${where}データに問題があります（${problems.length}件）\n${shown}${more}`; });
    return true;
  };
  /** 検査を1回走らせる。問題があれば右下に出して true */
  function run(where = "") {
    const map = store.getState().map; if (!map) return false;
    if (map !== baseMap) { baseMap = map; baseline = snapshotBaseline(map); } // 読み込んだ時点の問題は、基準として覚える
    let problems = [];
    try { problems = checkIntegrity(map, baseline, { skipEconomyChecks: true }); } catch (e) { problems = [`検査に失敗しました: ${e.message}`]; }
    return report(problems, where);
  }
  function schedule() { clearTimer(timer); timer = setTimer(() => run("操作後に、"), DEBOUNCE_MS); }
  store.subscribe((_s, ch) => {
    if (ch?.type === "replace") { baseMap = null; lastKey = ""; clearTimer(timer); return; }
    if (["commit", "undo", "redo"].includes(ch?.type)) schedule();
  });
  return {
    run,
    /** 年が変わったときに呼ぶ。5年ごとに検査し、問題があるときだけ知らせる */
    onYear(year) { if (Number.isFinite(year) && year % AUTO_CHECK_YEARS === 0) return run(`${year}年の自動検査で、`); return false; },
  };
}
