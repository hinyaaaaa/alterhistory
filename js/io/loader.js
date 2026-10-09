// ローダー：File / バイト列から MapData を作る入口。
// 形式の判定（gzip・Azgaar・ALTERHISTORY）と展開だけを担当する。
// 実際の解釈は各 reader に任せる。ブラウザでも Node 22 でも動く（Blob / DecompressionStream を使用）。

import { parseAzgaarBytes } from "./azgaar-reader.js";
import { buildGeometry } from "../core/derive.js";
import { attachExtension } from "./native-format.js";
import { isNativeBytes, parseNativeJson } from "./native-map.js";
import { validateMap } from "../core/model.js";
import { checkIntegrity, checkHistoryRefs } from "../core/edit/integrity.js";
import { diplomacyMismatches } from "../core/edit/relations.js";

export class LoadError extends Error {
  constructor(message, cause) { super(message); this.name = "LoadError"; this.cause = cause; }
}

const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function gunzip(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new LoadError("このブラウザは .gz の展開に対応していません。展開してから開いてください");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Uint8Array} bytes
 * @param {Function} Delaunator  形状の構築に使う
 * @returns {Promise<{map:object, warnings:string[]}>}
 */
export async function loadFromBytes(bytes, Delaunator) {
  let data = bytes;
  if (isGzip(data)) data = await gunzip(data);
  if (data.length === 0) throw new LoadError("ファイルが空です");

  // ALTERHISTORY 形式（.ahmap）は { で始まる JSON。Azgaar の .map は数字（バージョン）で始まる
  const native = isNativeBytes(data);
  let parsed;
  try {
    parsed = native ? parseNativeJson(new TextDecoder().decode(data)) : parseAzgaarBytes(data);
  } catch (e) {
    throw new LoadError(`地図として読み込めませんでした: ${e.message}`, e);
  }
  try {
    buildGeometry(parsed.map, Delaunator);
  } catch (e) {
    throw new LoadError(`地図の形状を作れませんでした: ${e.message}`, e);
  }

  // 形状の手動編集は、適用できなかった分を黙って捨てず、画面に知らせる
  const ov = parsed.map.geometry.overrideReport;
  if (ov.skipped > 0) parsed.warnings.push(`セル形状の手動編集（頂点の移動）のうち ${ov.skipped} 件は、再構築した形状と一致しないため適用できませんでした。境界線の形が Azgaar の表示と少し異なる場合があります`);
  if (ov.unsupported) parsed.warnings.push("未対応の形状編集（グリッドやセルの上書き）が含まれています。この部分は反映されません");

  // 旧 ALTERHISTORY 形式（Azgaar の .map に拡張行を足したもの）は、末尾の拡張行から独自データを取り出す
  if (!native) parsed.warnings.push(...attachExtension(parsed.map));
  parsed.warnings.push(...inspectLoaded(parsed.map));
  return parsed;
}

/**
 * 開いた地図を検査し、問題は警告として返す（開けなくはしない）。
 * 手で編集された Azgaar の地図には、最初から小さな食い違いがあるので、件数は短くまとめて知らせる。
 */
export function inspectLoaded(map) {
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

/** @param {File|Blob} file */
export async function loadFromFile(file, Delaunator) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return loadFromBytes(bytes, Delaunator);
}
