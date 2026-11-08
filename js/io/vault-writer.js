// v6.3.2: Obsidian 出力の書き出し。全体を 1 つの ZIP にしてメモリに持つと、大きな歴史ではダウンロードに至らなかったため、
//   ① フォルダへ直接書く（File System Access API。Edge・Chrome）— ファイルを 1 つずつ書くので、メモリは常に小さい
//   ② 使えない環境では、一定の大きさごとの複数の ZIP（連番）にして順に保存する。全部を同じフォルダへ展開すれば 1 つの vault になる
// 出来事は 1 件 1 ノートにせず、10 年ごとの年表ファイルにまとめる（eventNotes:false。全件・省略なし）。AI の判断のノートは作らない。
import { obsidianFiles } from "./obsidian.js";
import { zipFiles } from "./zip.js";

/** 軽量な既定。出来事は年表にまとめ、判断のノートと地図の画像は作らない */
export const LIGHT = Object.freeze({ eventNotes: false, decisionNotes: false, maps: false });
export const PART_BYTES = 12 * 1024 * 1024, PART_FILES = 3000;
const enc = new TextEncoder();
const rawOf = (d) => (typeof d === "string" ? enc.encode(d) : d);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** パスを <フォルダ…>/<ファイル> に分ける。".." や空の部分は受け付けない（出力先の外へ書かない） */
export function splitPath(path) {
  const parts = String(path).split("/"); if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) throw new Error(`書き出せないパス: ${path}`);
  return { dirs: parts.slice(0, -1), name: parts.at(-1) };
}

/** フォルダへ直接書く。dirHandle は showDirectoryPicker の戻り値（getDirectoryHandle / getFileHandle を持つもの）。戻り値: { files, bytes } */
export async function writeToDirectory(dirHandle, files, { onProgress = null, yieldEvery = 50, signal = null } = {}) {
  const cache = new Map([["", dirHandle]]); let n = 0, bytes = 0;
  const dirOf = async (dirs) => { let key = "", h = dirHandle; for (const d of dirs) { key += "/" + d; if (!cache.has(key)) cache.set(key, await h.getDirectoryHandle(d, { create: true })); h = cache.get(key); } return h; };
  for await (const f of files) {
    if (signal?.aborted) { const e = new Error("中断しました"); e.name = "AbortError"; throw e; }
    const { dirs, name } = splitPath(f.path), dir = await dirOf(dirs), fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(), raw = rawOf(f.data);
    await w.write(raw); await w.close(); n++; bytes += raw.length;
    if (n % yieldEvery === 0) { onProgress?.({ files: n, bytes }); await tick(); }
  }
  onProgress?.({ files: n, bytes }); return { files: n, bytes };
}

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

/** 書き出すファイルの列（軽量の既定）。opts で上書きできる */
export function vaultFiles(world, civ, name, opts = {}) { return obsidianFiles(world, civ, name, { ...LIGHT, ...opts }); }
