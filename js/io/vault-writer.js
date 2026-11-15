// Obsidian 出力の書き出し。v6.14.0: フォルダへの直接書き込みをやめ、常に ZIP（.md の束）として出力する。
//   ・創作向けの軽量モード（lean）が既定。人口集団・集落・技術の個別ノート・詳細ログなど、歴史を作る人に要らないものは出さない。
//   ・ZIP は 1 つにまとめる（展開して vault として開くだけ）。非常に大きい歴史（生データ 1GB 超）のときだけ、連番の複数 ZIP に分ける（全部を同じフォルダへ展開すれば 1 つの vault）。
// 出来事は 1 件 1 ノートにせず、10 年ごとの年表ファイルにまとめる（eventNotes:false）。AI の判断のノートは作らない。
import { obsidianFiles } from "./obsidian.js";
import { zipFiles } from "./zip.js";

/** 軽量な既定。出来事は年表にまとめ、判断のノートと地図の画像は作らない */
export const LIGHT = Object.freeze({ eventNotes: false, decisionNotes: false, maps: false, lean: true });
export const SINGLE_ZIP_MAX_BYTES = 1024 * 1024 * 1024;
export const PART_BYTES = 12 * 1024 * 1024, PART_FILES = 3000;
const enc = new TextEncoder();
const rawOf = (d) => (typeof d === "string" ? enc.encode(d) : d);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** 複数の ZIP に分ける。各パートは maxBytes / maxFiles に達したところで閉じる。パスは分割で変えない。戻り値は非同期の反復: { index, name, bytes(Uint8Array), fileCount, final } */
export async function* zipParts(files, { root = "世界", maxBytes = PART_BYTES, maxFiles = PART_FILES, compress = true, onProgress = null, signal = null } = {}) {
  let cur = [], curBytes = 0, index = 0, total = 0, totalBytes = 0; const pad = (n) => String(n).padStart(3, "0");
  const flush = async (final) => { index++; const bytes = await zipFiles(cur, { compress }); const part = { index, name: `${root}_${pad(index)}.zip`, bytes, fileCount: cur.length, final }; cur = []; curBytes = 0; return part; };
  let held = null; // 最後のパートに final を付けるため、1 つ遅らせて渡す
  for await (const f of files) {
    if (signal?.aborted) { const e = new Error("中断しました"); e.name = "AbortError"; throw e; }
    const raw = rawOf(f.data); if (cur.length && (curBytes + raw.length > maxBytes || cur.length >= maxFiles)) { if (held) yield held; held = await flush(false); await tick(); }
    cur.push({ path: f.path, data: raw }); curBytes += raw.length; total++; totalBytes += raw.length;
    if (total % 200 === 0) { onProgress?.({ files: total, bytes: totalBytes, parts: index }); await tick(); }
  }
  if (held) yield held; yield await flush(true); // 最後のパート（ファイルが 1 つも無いときは空の ZIP）
  onProgress?.({ files: total, bytes: totalBytes, parts: index });
}

/** 1 つの ZIP にして返す。生データが SINGLE_ZIP_MAX_BYTES を超えたら、連番の複数 ZIP に切り替える。戻り値: { root, parts: [{ name, bytes, fileCount }], files, rawBytes } */
export async function exportVaultZip(world, civ, name, { onProgress = null, signal = null, maxSingleBytes = SINGLE_ZIP_MAX_BYTES, partBytes = PART_BYTES, ...opts } = {}) {
  const root = rootName(name); let files = 0, rawBytes = 0, tooBig = false;
  async function* gen() { for await (const f of vaultFiles(world, civ, name, opts)) { if (signal?.aborted) { const e = new Error("中断しました"); e.name = "AbortError"; throw e; } const raw = rawOf(f.data); rawBytes += raw.length; files++; if (rawBytes > maxSingleBytes) { tooBig = true; return; } if (files % 100 === 0) { onProgress?.({ files, bytes: rawBytes }); await tick(); } yield { path: f.path, data: raw }; } }
  const bytes = await zipFiles(gen(), { compress: true });
  if (!tooBig) { onProgress?.({ files, bytes: rawBytes }); return { root, parts: [{ name: `${root}.zip`, bytes, fileCount: files }], files, rawBytes }; }
  const parts = []; let total = 0; for await (const p of zipParts(vaultFiles(world, civ, name, opts), { root, maxBytes: partBytes, onProgress, signal })) { parts.push({ name: p.name, bytes: p.bytes, fileCount: p.fileCount }); total += p.fileCount; }
  return { root, parts, files: total, rawBytes };
}
/** ZIP の最上位フォルダ名（世界名から、使えない文字を除いたもの） */
export const rootName = (name) => String(name ?? "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").trim().slice(0, 48) || "世界";

/** 書き出すファイルの列（軽量の既定）。opts で上書きできる */
export function vaultFiles(world, civ, name, opts = {}) { return obsidianFiles(world, civ, name, { ...LIGHT, ...opts }); }
