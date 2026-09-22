// ローダー：File / バイト列から MapData を作る入口。
// 形式の判定（gzip・Azgaar・ALTERHISTORY）と展開だけを担当する。
// 実際の解釈は各 reader に任せる。ブラウザでも Node 22 でも動く（Blob / DecompressionStream を使用）。

import { parseAzgaarBytes } from "./azgaar-reader.js";
import { buildGeometry } from "../core/derive.js";
import { attachExtension } from "./native-format.js";

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

  let parsed;
  try {
    parsed = parseAzgaarBytes(data);
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

  // ALTERHISTORY 形式は Azgaar 形式の上位互換。ヘッダーの目印と末尾の拡張行で見分ける
  parsed.warnings.push(...attachExtension(parsed.map));
  return parsed;
}

/** @param {File|Blob} file */
export async function loadFromFile(file, Delaunator) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return loadFromBytes(bytes, Delaunator);
}
