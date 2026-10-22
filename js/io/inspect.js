// 開いた地図の検査。問題は警告として返す（開けなくはしない）。件数は短くまとめて知らせる。
import { validateMap } from "../core/model.js";
import { checkIntegrity, checkHistoryRefs } from "../core/edit/integrity.js";
import { diplomacyMismatches } from "../core/edit/relations.js";

export function inspectMap(map) {
  const run = (label, fn) => { try { return fn(); } catch (e) { return [`${label}の検査中にエラーが起きました: ${e.message}`]; } };
  const groups = [
    ["構造", run("構造", () => validateMap(map))],
    ["整合性", run("整合性", () => checkIntegrity(map, null, { skipEconomyChecks: true }))],
    ["歴史の記録", run("歴史の記録", () => checkHistoryRefs(map))],
    ["外交表", run("外交表", () => diplomacyMismatches(map).map((x) => `国家#${x.a}と#${x.b}は、外交表では「${x.table ?? "未設定"}」だが、同盟・従属・戦争からは「${x.truth}」になる`))],
  ];
  const out = [];
  for (const [label, list] of groups) {
    if (!list.length) continue;
    out.push(`${label}の検査で ${list.length} 件の問題が見つかりました（地図は開けます）: ${list[0]}${list.length > 1 ? ` ほか${list.length - 1}件` : ""}`);
  }
  return out;
}

