// v6 M0/M5: 命令の契約（WorldState を変える唯一の経路）。権限の種別・許される命令・原子性・冪等性・過去閲覧中の禁止をここで保証する。
//   権限: player_order（担当国家の命令）／creator_intervention（創造主）／ai_action（国家AI。tick の中で共通の行動レジストリを通る）／
//         simulation_transition（tick）／administrative（時間を進める・担当を決める・表示設定）。
//   原子性: 命令は途中で失敗したら、WorldState・乱数の入力・ID連番を命令前に戻す。tick は月単位で戻す（safeAdvance）。
//   冪等性: commandId が同じ命令は二度実行しない（保存・再送のときの二重適用を防ぐ）。
//   乱数: 歴史の乱数は historySeed と月から導く（状態を持たない）ので、保存すれば同じ入力列から同じ未来になる。
import { createCivSim } from "../civ/civ-sim.js";
import { wcdeExtension } from "./domains/index.js";

export const AUTHORITY = Object.freeze({ PLAYER: "player_order", CREATOR: "creator_intervention", AI: "ai_action", SIM: "simulation_transition", ADMIN: "administrative" });
const A = AUTHORITY;
const SNAP_KEYS = ["states", "groups", "settlements", "figures", "houses", "cultures", "languages", "religions", "treaties", "wars", "activeWarIds", "activeTreatyIds", "proposals", "persons", "orgs", "seq", "wcde", "options", "player", "techWorld", "species", "speciesDefs", "monthIndex", "date", "adoptCache"];
const LOG_MAX = 500, ID_MAX = 2000;

/** WorldState の入口。sim は復元のたびに作り直すので、外から sim を保持せず w.sim を使う */
export function createWcde(world, civ) {
  const w = { world, civ, viewPast: null, sim: null };
  w.rebuild = () => { w.sim = createCivSim(world, civ, { extensions: [wcdeExtension] }); return w.sim; };
  w.rebuild(); return w;
}

/** 命令の定義。phases: 実行できる段階。mutates: false なら過去閲覧中でも可。control: 担当国家が必要 */
export const COMMANDS = {};
export function defineCommand(type, spec) { COMMANDS[type] = { mutates: true, phases: ["running"], control: false, checkpoint: true, ...spec, type }; }

const clonePart = (civ) => { const o = {}; for (const k of SNAP_KEYS) if (k in civ) o[k] = structuredClone(civ[k]); return o; };
/** 命令用の軽い取り消し点（国家・集団・人物など）。events / decisions / history は追記のみなので、長さで戻す */
function checkpoint(civ) { return { part: clonePart(civ), ev: civ.events.length, dec: civ.decisions?.length ?? 0 }; }
/** 取り消し。civ の最上位の入れ物（states・groups など）は同じオブジェクトのまま中身を戻す（外から持っている参照が切れない）。入れ物の中の国家などは作り直される */
function rollback(w, cp) {
  const { civ } = w;
  for (const k of SNAP_KEYS) {
    if (!(k in cp.part)) { delete civ[k]; continue; } const src = structuredClone(cp.part[k]), cur = civ[k];
    if (Array.isArray(cur) && Array.isArray(src)) { cur.length = 0; cur.push(...src); } else if (cur && src && typeof cur === "object" && typeof src === "object" && !Array.isArray(cur)) { for (const x of Object.keys(cur)) delete cur[x]; Object.assign(cur, src); } else civ[k] = src;
  }
  civ.events.length = cp.ev; if (civ.decisions) civ.decisions.length = cp.dec; w.rebuild();
}
export const checkpointFull = (civ) => structuredClone(civ);
/** 全体の復元（civ オブジェクトの同一性は保つ。他が参照しているため） */
export function restoreInto(w, snap) { const { civ } = w; for (const k of Object.keys(civ)) delete civ[k]; Object.assign(civ, structuredClone(snap)); w.rebuild(); }

function log(civ, entry) { const L = (civ.wcde.log ??= []); L.push(entry); if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX); }

/** 命令を実行する。{ ok, error?, result?, duplicate? }。失敗した命令は状態を変えない */
export function dispatch(w, cmd) {
  const { civ } = w, W = civ.wcde, spec = COMMANDS[cmd?.type];
  const fail = (error, code = "rejected") => { log(civ, { at: civ.monthIndex, type: cmd?.type, authority: cmd?.authority, ok: false, error, code }); return { ok: false, error, code }; };
  if (!spec) return fail(`未知の命令: ${cmd?.type}`, "unknown");
  if (!Object.values(AUTHORITY).includes(cmd.authority)) return fail(`未知の権限: ${cmd.authority}`, "authority");
  if (!spec.authorities.includes(cmd.authority)) return fail(`この命令は ${cmd.authority} では実行できません（許可: ${spec.authorities.join("・")}）`, "authority");
  if (cmd.commandId != null && W.cmdIds.includes(cmd.commandId)) return { ok: true, duplicate: true };
  if (spec.mutates && w.viewPast != null) return fail("過去の閲覧中は、世界を変える命令を実行できません（現在へ戻してください）", "past_view");
  if (!spec.phases.includes(W.phase)) return fail(`この命令は段階「${spec.phases.join("・")}」でのみ実行できます（現在: ${W.phase}）`, "phase");
  if (spec.control && cmd.authority === A.PLAYER) { const cs = W.control.stateId; if (!cs) return fail("担当国家がありません（国家を担当してから命令してください）", "no_control"); if (cmd.stateId == null) cmd = { ...cmd, stateId: cs }; if (cmd.stateId !== cs) return fail("担当国家以外には命令できません", "not_controlled"); }
  const v = spec.validate?.(w, cmd); if (v && v.ok === false) return fail(v.error);
  const cp = spec.mutates && spec.checkpoint !== false ? checkpoint(civ) : null; let r;
  try { r = spec.apply(w, cmd); } catch (err) { if (cp) rollback(w, cp); log(civ, { at: civ.monthIndex, type: cmd.type, authority: cmd.authority, ok: false, error: String(err?.message ?? err), code: "exception" }); return { ok: false, error: `命令の途中で失敗したため、すべて取り消しました: ${err?.message ?? err}`, code: "rolled_back" }; }
  // apply が { ok:false } を返したときは、何も変えていない契約（検証を先に済ませてから変える）。例外のときだけ全体を戻す（外の参照を切らないため）
  if (!r || r.ok === false) return fail(r?.error ?? "失敗", "rejected");
  if (cmd.commandId != null) { W.cmdIds.push(cmd.commandId); if (W.cmdIds.length > ID_MAX) W.cmdIds.splice(0, W.cmdIds.length - ID_MAX); }
  log(civ, { at: civ.monthIndex, type: cmd.type, authority: cmd.authority, ok: true, commandId: cmd.commandId ?? null });
  return { ok: true, result: r.result ?? r };
}

/** 時間を進める。120か月ごとに取り消し点を取り、月の処理が例外になったら、その月の直前（安全な境界）まで戻して止める */
export function safeAdvance(w, months, { chunk = 120, onProgress = null } = {}) {
  const { civ } = w; let done = 0;
  while (done < months) {
    const n = Math.min(chunk, months - done), snap = checkpointFull(civ);
    try { w.sim.advanceMonths(n); done += n; if (onProgress) onProgress(done, months); continue; } catch (err) {
      // 失敗した月を探す: 取り消し点から決定的にやり直し、最後に成功した月まで進める
      restoreInto(w, snap); let ok = 0, msg = String(err?.message ?? err);
      try { for (; ok < n; ok++) w.sim.advanceMonth(); } catch (e2) { msg = String(e2?.message ?? e2); }
      restoreInto(w, snap); if (ok > 0) w.sim.advanceMonths(ok);
      civ.wcde.diagnostics.push({ at: civ.monthIndex, failedMonth: civ.monthIndex + 1, message: msg }); if (civ.wcde.diagnostics.length > 50) civ.wcde.diagnostics.shift();
      return { ok: false, advanced: done + ok, error: msg, haltedAt: { ...civ.date } };
    }
  }
  return { ok: true, advanced: done, date: { ...civ.date } };
}
