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

export const SAVE_FORMAT = "alterhistory-save", SAVE_SCHEMA = 1, MIN_SCHEMA = 1;
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
  const { civ } = w, civText = JSON.stringify(civ), meta = { name: name ?? civ.wcde.config.name ?? null, monthIndex: civ.monthIndex, date: { ...civ.date }, states: Object.values(civ.states).filter((s) => s.alive).length, events: civ.events.length, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ.wcde.config.worldSeed };
  const head = JSON.stringify({ format: SAVE_FORMAT, schema: SAVE_SCHEMA, appVersion, wcdeVersion: WCDE_VERSION, meta, checksum: checksum(civText), civBytes: civText.length });
  const text = head.slice(0, -1) + ',"civ":' + civText + "}"; return { text, bytes: text.length, meta };
}

/** 保存データの読み込み。決して例外を投げず、{ ok:true, w, warnings, repairs } か { ok:false, errors } を返す。入力は変更しない */
export function unpackSave(text, { generate = defaultGenerate, allowChecksumMismatch = false } = {}) {
  const refuse = (...errors) => ({ ok: false, errors }), warnings = [], repairs = [];
  if (typeof text !== "string" || !text.length) return refuse("ファイルが空、または文字列ではありません");
  let d; try { d = JSON.parse(text); } catch (e) { return refuse("ファイルが壊れています（JSON として読めません）: " + String(e.message).slice(0, 120)); }
  if (!d || typeof d !== "object" || Array.isArray(d)) return refuse("保存ファイルの形式ではありません");
  if (d.format !== SAVE_FORMAT) return refuse(d.format === "alterhistory-wcde" ? "これは開発中の旧形式（alterhistory-wcde）です。v6.0.0 の保存ファイルを選んでください" : "AlterHistory の保存ファイルではありません（旧 .ahmap・他アプリの地図は読み込めません）");
  if (!Number.isInteger(d.schema)) return refuse("保存形式の版がありません");
  if (d.schema > SAVE_SCHEMA) return refuse(`このファイルは新しい保存形式（版 ${d.schema}）です。アプリを更新してください（このアプリは版 ${SAVE_SCHEMA} まで）`);
  if (d.schema < MIN_SCHEMA) return refuse(`古すぎる保存形式（版 ${d.schema}）です`);
  const civ = d.civ; if (!civ || typeof civ !== "object") return refuse("世界の状態（civ）がありません");
  // チェックサム: civ 部分の文字列を、書いたときと同じ形で作り直して比べる（JSON は同じ値から同じ文字列になる）
  const sum = checksum(JSON.stringify(civ));
  if (d.checksum !== sum) { if (!allowChecksumMismatch) return refuse("チェックサムが一致しません（保存後に内容が変わったか、ファイルが壊れています）。読み込みを中止しました"); warnings.push("チェックサムが一致しませんでしたが、利用者の指示で、検証を通る場合に限って読み込みました"); }
  // 必須項目・値域・配列の構造
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
