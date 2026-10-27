// v5.3 出力: Obsidian の書き出しを、巨大になったら複数の ZIP に自動分割する。
//   ・全体を一度にメモリへ構築しない。ファイルを順に受け取り、上限に達したら 1 パートを ZIP 化して渡す
//   ・欠落・重複を検査できるよう、各パートに連番つきのマニフェスト（_parts/part-NN.json）を入れ、最後のパートに全体の索引を入れる
//   ・全パートを同じフォルダへ展開すれば、1 つの vault として元どおりにリンクが解決する（パス自体は分割で変えない）
//
//   files: Iterable | AsyncIterable of { path, data: string | Uint8Array }
//   zip:   async (files) => Uint8Array     （本体では io/zip.js の zipFiles を渡す）
export const DEFAULT_PART_BYTES = 64 * 1024 * 1024;
export const DEFAULT_PART_FILES = 20000;
const enc = new TextEncoder();
const rawBytes = (d) => (typeof d === "string" ? enc.encode(d) : d);
const pad = (n, w = 3) => String(n).padStart(w, "0");

export async function* splitIntoParts(files, { root = "世界", zip, maxPartBytes = DEFAULT_PART_BYTES, maxPartFiles = DEFAULT_PART_FILES, hash = null, signal = null, onProgress = null } = {}) {
  if (typeof zip !== "function") throw new Error("splitIntoParts: zip が必要です");
  if (maxPartBytes < 1024 || maxPartFiles < 1) throw new Error("splitIntoParts: 上限が小さすぎます");
  const parts = []; // 完了したパートの要約（最後の索引に入れる）
  const seen = new Set();
  let cur = [], curBytes = 0, entries = [], total = 0, totalBytes = 0, index = 0;

  const flush = async (isLast, extraFiles = []) => {
    index++;
    const n = pad(index);
    const summary = { index, name: `${root}_obsidian_${n}.zip`, fileCount: entries.length, rawBytes: curBytes, first: entries[0]?.path ?? null, last: entries.at(-1)?.path ?? null };
    const partManifest = { format: "alterhistory-obsidian-part", part: index, final: isLast, fileCount: entries.length, rawBytes: curBytes, first: summary.first, last: summary.last, files: entries };
    const out = [...cur, ...extraFiles, { path: `${root}/_parts/part-${n}.json`, data: JSON.stringify(partManifest) }];
    if (isLast) {
      const idx = { format: "alterhistory-obsidian-index", parts: parts.length + 1, fileCount: total, rawBytes: totalBytes, partSummaries: [...parts, summary] };
      out.push({ path: `${root}/_parts/index.json`, data: JSON.stringify(idx, null, 1) });
    }
    const bytes = await zip(out);
    parts.push(summary);
    const part = { ...summary, bytes, zipBytes: bytes.length, final: isLast, entries };
    cur = []; curBytes = 0; entries = [];
    return part;
  };

  for await (const f of files) {
    if (signal?.aborted) { const e = new Error("中断しました"); e.name = "AbortError"; throw e; }
    if (seen.has(f.path)) throw new Error(`同じパスが 2 回出ました: ${f.path}`); // 重複は書き出し側の不具合。黙って上書きしない
    seen.add(f.path);
    const raw = rawBytes(f.data);
    const entry = { path: f.path, bytes: raw.length, sha256: hash ? await hash(raw) : null };
    if (cur.length && (curBytes + raw.length > maxPartBytes || cur.length >= maxPartFiles)) yield await flush(false);
    cur.push({ path: f.path, data: raw }); entries.push(entry); curBytes += raw.length; total++; totalBytes += raw.length;
    onProgress?.({ files: total, parts: index, bytes: totalBytes });
  }
  yield await flush(true);
}

/** 分割結果の検査: 連番・重複・件数・最終パートの索引との一致。問題の文字列の配列を返す（空なら正常） */
export function verifyParts(parts, { expectedFiles = null } = {}) {
  const problems = [];
  if (!parts.length) return ["パートがありません"];
  parts.forEach((p, i) => { if (p.index !== i + 1) problems.push(`連番が飛んでいます: ${i + 1} 番目のパートが ${p.index} 番`); });
  if (!parts.at(-1).final) problems.push("最後のパートに最終印がありません（途中で切れた可能性）");
  if (parts.slice(0, -1).some((p) => p.final)) problems.push("最後以外のパートに最終印があります");
  const seen = new Map();
  let total = 0;
  for (const p of parts) {
    if (!p.entries) { total += p.fileCount; continue; } // 画面側はメモリ節約のため明細を持たない。重複は splitIntoParts が書き出し中に検査済み
    if (p.fileCount !== p.entries.length) problems.push(`パート ${p.index}: 件数と明細が一致しません`);
    for (const e of p.entries) { if (seen.has(e.path)) problems.push(`重複: ${e.path}（パート ${seen.get(e.path)} と ${p.index}）`); else seen.set(e.path, p.index); total++; }
  }
  if (expectedFiles != null && total !== expectedFiles) problems.push(`件数が合いません: 期待 ${expectedFiles} 件・実際 ${total} 件`);
  return problems.slice(0, 30);
}
