// v6 M7: 保存ファイルの形式・検証・復元。仕様 §14。
//   ・保存形式のバージョン（SAVE_SCHEMA）は、アプリのリリース番号から独立している。旧 .ahmap・Azgaar 由来の地図は読まない。
//   ・正式な保存・復元は、ファイルのダウンロード → ユーザーが選択して読み込む方式。クラウドへは送らない。ブラウザー内の自動保存は復旧用バックアップで、正式ファイルとは別の名前で扱う（backupLabel）。
//   ・読み込み前に、形式・版・チェックサム・必須項目・値域・ID参照・世界のトポロジー（地図の格子の数）・整合性を検証する。
//   ・安全に直せる軽微な不備（派生データの欠落など）だけ直し、直した内容を警告と診断記録（civ.wcde.diagnostics）に残す。直せなければ理由つきで拒否し、空の世界や新しい世界へ黙って置き換えない。元の文字列は一切変更しない。
//   ・過去の客観イベントは、復旧でも書き換えない。
//   ・保存しないもの: 派生の索引・予測のキャッシュ（復元時に正本から再構築される）。
import { defaultGenerate } from "./world.js";
import { createWcde } from "./contract.js";
import { registerCommands } from "./commands.js";
import { WCDE_VERSION } from "./config.js";
import { checkWcdeIntegrity } from "./integrity.js";
import { rebuildAdjust } from "./intervention.js";
import { timeOf, newsOf } from "./clock.js";
import { APP_VERSION_FOR_SAVE } from "./save-meta.js";
import { storeOf, attachStore, flushAll, hasExternal } from "../civ/history-store.js";
import { CHUNK_YEARS } from "../civ/archive.js";

export const SAVE_FORMAT = "alterhistory-save", SAVE_SCHEMA = 2, MIN_SCHEMA = 2; // v6.1.0: schema 2（資料アーカイブ・統合技術ツリー・判断を保存しない世界）。v6.0.0 の schema 1 は読まない
export const backupLabel = (name) => `【自動バックアップ】${name}`; // 復旧用。正式な保存ファイルと取り違えない
/** 64 ビット相当の高速な検証値（cyrb53 の変種）。改ざん対策ではなく、破損の検出用 */
export function checksum(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
const fin = (x) => typeof x === "number" && Number.isFinite(x);

/** 保存データを作る。{ text, bytes, meta }。civ を JSON にし、その文字列のチェックサムを添える */
export function packSave(w, { appVersion = APP_VERSION_FOR_SAVE, name = null } = {}) {
  if (hasExternal(w.civ)) throw new Error("履歴が外部保存されています。packSaveAsync / packSaveGzAsync を使ってください（外部の履歴を含めて書き出します）");
  const { civ } = w, civText = JSON.stringify(civ), meta = { name: name ?? civ.wcde.config.name ?? null, monthIndex: civ.monthIndex, date: { ...civ.date }, states: Object.values(civ.states).filter((s) => s.alive).length, events: civ.events.length, records: civ.archive?.total ?? 0, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ.wcde.config.worldSeed };
  const head = JSON.stringify({ format: SAVE_FORMAT, schema: SAVE_SCHEMA, appVersion, wcdeVersion: WCDE_VERSION, meta, checksum: checksum(civText), civBytes: civText.length });
  const text = head.slice(0, -1) + ',"civ":' + civText + "}"; return { text, bytes: text.length, meta };
}

/** 保存データの読み込み。決して例外を投げず、{ ok:true, w, warnings, repairs } か { ok:false, errors } を返す。入力は変更しない */
export function unpackSave(text, { generate = defaultGenerate, allowChecksumMismatch = false } = {}) {
  const refuse = (...errors) => ({ ok: false, errors }), warnings = [], repairs = [];
  if (typeof text !== "string" || !text.length) return refuse("ファイルが空、または文字列ではありません");
  let d; try { d = JSON.parse(text); } catch (e) { return refuse("ファイルが壊れています（JSON として読めません）: " + String(e.message).slice(0, 120)); }
  if (!d || typeof d !== "object" || Array.isArray(d)) return refuse("保存ファイルの形式ではありません");
  // 旧世代のデータは移行も互換読み込みもしない（仕様 §14）。理由を伝えて拒否する。元のファイルは削除・変更しない
  if (d.format !== SAVE_FORMAT && (d.ahmap != null || d.format === "ahmap" || d.format === "alterhistory-map" || d.map != null || d.pack != null || d.info?.version != null || d.settings != null)) return refuse("v5 以前の地図データ（.ahmap）や Azgaar の地図は、v6.1.0 では読み込めません。新しい世界を作ってください（元のファイルは削除されません）");
  if (d.format !== SAVE_FORMAT) return refuse(d.format === "alterhistory-wcde" ? "これは開発中の旧形式（alterhistory-wcde）です。v6.1.0 の保存ファイルを選んでください" : "AlterHistory の保存ファイルではありません（旧 .ahmap・他アプリの地図は読み込めません）");
  if (!Number.isInteger(d.schema)) return refuse("保存形式の版がありません");
  if (d.schema > SAVE_SCHEMA) return refuse(`このファイルは新しい保存形式（版 ${d.schema}）です。アプリを更新してください（このアプリは版 ${SAVE_SCHEMA} まで）`);
  if (d.schema < MIN_SCHEMA) return refuse(d.schema === 1 ? "v6.0.0 の保存ファイル（schema 1）は、v6.1.0 では読み込めません。新しい世界を作ってください（元のファイルは削除されません）" : `古すぎる保存形式（版 ${d.schema}）です`);
  const civ = d.civ; if (!civ || typeof civ !== "object") return refuse("世界の状態（civ）がありません");
  // チェックサム: civ 部分の文字列を、書いたときと同じ形で作り直して比べる（JSON は同じ値から同じ文字列になる）
  const sum = checksum(JSON.stringify(civ));
  if (d.checksum !== sum) { if (!allowChecksumMismatch) return refuse("チェックサムが一致しません（保存後に内容が変わったか、ファイルが壊れています）。読み込みを中止しました"); warnings.push("チェックサムが一致しませんでしたが、利用者の指示で、検証を通る場合に限って読み込みました"); }
  // 必須項目・値域・配列の構造
  if (civ.decisions != null && (!Array.isArray(civ.decisions) || civ.decisions.length)) return refuse("AI の判断記録を含む保存ファイルは、v6.1.0 では読み込めません（判断は保存しない仕様です）");
  const need = [["monthIndex", fin], ["date", (x) => x && typeof x === "object"], ["states", (x) => x && typeof x === "object" && !Array.isArray(x)], ["groups", (x) => x && typeof x === "object"], ["events", Array.isArray], ["wcde", (x) => x && typeof x === "object"], ["seq", (x) => x && typeof x === "object"], ["options", (x) => x && typeof x === "object"]];
  for (const [k, ok] of need) if (!ok(civ[k])) return refuse(`必須項目「${k}」がないか、型が違います`);
  if (!Number.isInteger(civ.monthIndex) || civ.monthIndex < 0) return refuse("月の番号（monthIndex）が不正です");
  if (!civ.wcde.config?.spec || !civ.wcde.config?.worldSeed) return refuse("世界生成の設定（config.spec / worldSeed）がありません");
  if (!["founding", "running"].includes(civ.wcde.phase)) return refuse("段階（phase）が不正です");
  for (const [id, s] of Object.entries(civ.states)) { if (s.id !== id) return refuse(`国家 ${id} の ID が一致しません`); for (const k of ["pop", "treasury", "stability", "army"]) if (!fin(s[k])) return refuse(`国家 ${id}.${k} が有限の数ではありません`); }
  // ID 参照（存在しない国家・戦争を指す記録は、世界を壊すので拒否）
  for (const g of Object.values(civ.groups)) if (g.stateId != null && !civ.states[g.stateId]) return refuse(`集団 ${g.id} が存在しない国家 ${g.stateId} に属しています`);
  for (const t of Object.values(civ.treaties ?? {})) for (const k of ["a", "b"]) if (!civ.states[t[k]]) return refuse(`条約 ${t.id} が存在しない国家 ${t[k]} を指しています`);
  for (const x of Object.values(civ.wars ?? {})) for (const k of ["aggressor", "defender"]) if (!civ.states[x[k]]) return refuse(`戦争 ${x.id} が存在しない国家 ${x[k]} を指しています`);
  if (!Array.isArray(civ.activeWarIds) || civ.activeWarIds.some((i) => !civ.wars[i])) return refuse("進行中の戦争の一覧が戦争の記録と合いません");
  // 安全に直せる不備（派生データ・復旧用の既定値）
  const fix = (kind, before, after, reason, apply) => { apply(); repairs.push({ kind, before, after, reason }); warnings.push(`修復: ${reason}`); };
  if (civ.wcde.adjust == null) fix("adjust", null, {}, "介入補正の表が無かったため、介入記録から作り直しました", () => { civ.wcde.adjust = {}; });
  if (civ.wcde.diagnostics == null) fix("diagnostics", null, [], "診断記録が無かったため、空で作りました", () => { civ.wcde.diagnostics = []; });
  if (civ.adoptCache == null) civ.adoptCache = {}; // 派生のキャッシュ（無くても決定的に作り直される）
  // 世界のトポロジー: 設定から地理を再生成し、格子の数が保存時と一致するか確かめる
  let world; try { world = generate(civ.wcde.config.spec); } catch (e) { return refuse("世界の地理を再生成できません: " + String(e.message).slice(0, 120)); }
  const cells = world.mesh?.cellCount ?? null; if (d.meta?.cells != null && cells != null && d.meta.cells !== cells) return refuse(`地図の格子の数が保存時（${d.meta.cells}）と一致しません（${cells}）。生成の版が違う可能性があります`);
  registerCommands(); let w; try { w = createWcde(world, civ); } catch (e) { return refuse("世界を組み立てられません: " + String(e.message).slice(0, 120)); }
  // 派生データを正本から作り直し、整合性を検査（因果の不整合は許容し、構造の破損だけ見る）
  try { const before = JSON.stringify(civ.wcde.adjust); rebuildAdjust(civ); if (JSON.stringify(civ.wcde.adjust) !== before) fix("adjust", before.slice(0, 80), "再構築", "介入補正の表が介入記録と食い違っていたため、記録から作り直しました", () => {}); timeOf(civ); newsOf(civ); } catch (e) { return refuse("派生データを作り直せません: " + String(e.message).slice(0, 120)); }
  const errs = checkWcdeIntegrity(world, civ); if (errs.length) return refuse(`整合性の検査に失敗しました（${errs.length} 件）`, ...errs.slice(0, 12));
  if (repairs.length) for (const r of repairs) civ.wcde.diagnostics.push({ at: civ.monthIndex, repair: r.kind, reason: r.reason });
  return { ok: true, w, warnings, repairs, meta: d.meta ?? null, schema: d.schema };
}

/* ---------- 圧縮（長期の保存ファイルが非常に大きくなるため）。gzip。ブラウザーにも Node にもある CompressionStream を使う ---------- */
const pipe = async (input, stream) => {
  const w = stream.writable.getWriter(), wr = (async () => { await w.write(input); await w.close(); })(); wr.catch(() => {}); // 書き込み側の失敗は、読む側の例外として扱う（未処理の拒否にしない）
  const chunks = [], r = stream.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  await wr; let n = 0; for (const c of chunks) n += c.length; const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
};
export const isGzip = (u8) => u8 instanceof Uint8Array && u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
/** 保存データを gzip 圧縮した Uint8Array にする（拡張子 .ahw.gz）。中身は packSave と同じ文字列 */
export async function packSaveGz(w, opts) { const p = packSave(w, opts); return { bytes: await pipe(new TextEncoder().encode(p.text), new CompressionStream("gzip")), rawBytes: p.bytes, meta: p.meta }; }
/** 圧縮・非圧縮どちらの保存ファイル（Uint8Array か文字列）も読む。unpackSave と同じ結果を返す（壊れた gzip も、理由つきで拒否） */
export async function unpackSaveAny(input, opts) {
  try { const text = typeof input === "string" ? input : isGzip(input) ? new TextDecoder().decode(await pipe(input, new DecompressionStream("gzip"))) : new TextDecoder().decode(input); return unpackSave(text, opts); } catch (e) { return { ok: false, errors: ["圧縮を展開できません（ファイルが壊れています）: " + String(e.message ?? e).slice(0, 100)] }; }
}

/* ---------- v6.20.0: 非同期の保存・復元（外部保存の履歴を含めて、単体で復元できる .ahw を作る）----------
 *  .ahw は、別の PC・別のブラウザでも、履歴を完全に復元できる必要がある。外部保存（IndexedDB）への参照だけを書いてはいけない。
 *  形式は schema 2 のまま: 外部の履歴を、世紀ごとのチャンクへ戻して書く（storeId・ext の要約は書かない）。チャンクは 1 世紀ずつ読んで文字列にするので、全履歴を一度にメモリへ載せない。
 */
const PH = "\u0000ARCH\u0000", PHC = "\u0000CHUNK\u0000";
const stringifyOnly = (v, ph) => { const t = JSON.stringify(v), [a, b] = t.split(JSON.stringify(ph)); return [a, b]; };
/** civ の JSON を、文字列の断片として順に出す（外部の履歴を、元の位置へ戻した形で） */
export async function* civParts(civ) {
  const a = civ.archive, store = storeOf(civ);
  if (!store || !hasExternal(civ)) { yield JSON.stringify(civ); return; }
  const [pre, post] = stringifyOnly({ ...civ, archive: PH }, PH); yield pre;
  const [apre, apost] = stringifyOnly({ ...a, ext: undefined, storeId: undefined, chunks: PHC }, PHC); yield apre + "{";
  const ext = a.ext, sid = a.storeId, years = store.years, keys = Object.keys(a.chunks); let first = true;
  for (const k of keys) {
    const c = a.chunks[k], pks = Object.keys(ext).map(Number).filter((pk) => Math.floor((pk * years) / CHUNK_YEARS) === Number(k)).sort((x, y) => x - y);
    const [cpre, cpost] = c.rec ? stringifyOnly({ ...c, rec: PHC }, PHC) : [null, null]; yield (first ? "" : ",") + JSON.stringify(k) + ":"; first = false;
    if (!c.rec) { yield JSON.stringify(c); continue; }
    yield cpre + "["; let n = 0; for (const pk of pks) { for (const r of await store.getChunk(sid, pk)) yield (n++ ? "," : "") + JSON.stringify(r); } for (const r of c.rec) yield (n++ ? "," : "") + JSON.stringify(r); yield "]" + cpost;
  }
  yield "}" + apost + post;
}
const Sum = () => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57, n = 0; return { add(t) { n += t.length; for (let i = 0; i < t.length; i++) { const ch = t.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } }, get n() { return n; }, done() { let a = h1, b = h2; a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return (b >>> 0).toString(16).padStart(8, "0") + (a >>> 0).toString(16).padStart(8, "0"); } }; };
async function headOf(w, { appVersion, name }, sum) {
  const { civ } = w, meta = { name: name ?? civ.wcde.config.name ?? null, monthIndex: civ.monthIndex, date: { ...civ.date }, states: Object.values(civ.states).filter((s) => s.alive).length, events: civ.events.length, records: civ.archive?.total ?? 0, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ.wcde.config.worldSeed };
  return { meta, head: JSON.stringify({ format: SAVE_FORMAT, schema: SAVE_SCHEMA, appVersion, wcdeVersion: WCDE_VERSION, meta, checksum: sum.done(), civBytes: sum.n }) };
}
/** 断片の列（文字列の配列）。1 回目で検証値を求め、2 回目で書き出す。Blob にそのまま渡せる */
export async function packSaveParts(w, { appVersion = APP_VERSION_FOR_SAVE, name = null } = {}) {
  const sum = Sum(); for await (const p of civParts(w.civ)) sum.add(p); const { meta, head } = await headOf(w, { appVersion, name }, sum), parts = [head.slice(0, -1) + ',"civ":'];
  for await (const p of civParts(w.civ)) parts.push(p); parts.push("}"); return { parts, meta, bytes: parts.reduce((n, x) => n + x.length, 0) };
}
/** 外部保存つきでも使える packSave。{ text, bytes, meta }（text は 1 本の文字列。巨大な履歴では packSaveGzAsync を使う） */
export async function packSaveAsync(w, opts) { if (!hasExternal(w.civ)) return packSave(w, opts); const p = await packSaveParts(w, opts); const text = p.parts.join(""); return { text, bytes: text.length, meta: p.meta }; }
/** gzip 圧縮した Uint8Array。断片を順に圧縮器へ流す（全文字列を作らない） */
export async function packSaveGzAsync(w, opts) {
  if (!hasExternal(w.civ) || typeof CompressionStream !== "function") { const p = await packSaveAsync(w, opts); return { bytes: await pipe(new TextEncoder().encode(p.text), new CompressionStream("gzip")), rawBytes: p.bytes, meta: p.meta }; }
  const sum = Sum(); for await (const p of civParts(w.civ)) sum.add(p); const { meta, head } = await headOf(w, opts ?? {}, sum), cs = new CompressionStream("gzip"), wr = cs.writable.getWriter(), enc = new TextEncoder(), out = [];
  const reader = (async () => { const r = cs.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; out.push(value); } })();
  let raw = 0; const put = async (t) => { raw += t.length; await wr.write(enc.encode(t)); };
  await put(head.slice(0, -1) + ',"civ":'); for await (const p of civParts(w.civ)) await put(p); await put("}"); await wr.close(); await reader;
  let n = 0; for (const c of out) n += c.length; const bytes = new Uint8Array(n); let o = 0; for (const c of out) { bytes.set(c, o); o += c.length; } return { bytes, rawBytes: raw, meta };
}
/** 読み込み（圧縮・非圧縮どちらも）。保存先（store）を渡すと、読み込んだ世界へつなぎ、閉じた期間の履歴を外部保存へ移す（schema 2 の保存データからの移行もこれ） */
export async function unpackSaveAsync(input, opts = {}, { store = null } = {}) {
  const r = await unpackSaveAny(input, opts); if (!r.ok || !store) return r; const civ = r.w.civ; delete civ.archive?.ext; delete civ.archive?.storeId; attachStore(civ, store);
  const f = await flushAll(civ); if (f.error) r.warnings = [...(r.warnings ?? []), "履歴の外部保存へ移せませんでした（メモリ上に残します）: " + f.error]; return r;
}
