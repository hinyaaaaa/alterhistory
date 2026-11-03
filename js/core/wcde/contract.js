// v6 M0/M5 → v6.1.0 M1: 命令の契約（WorldState を変える経路の整理）。
//   WorldState の正本はひとつ（civ）。変える経路は、次の 4 つだけで、それぞれ入口・権限・原子性が違う（domains/registry.js の ENTRY_PATHS と同じ内容）。
//     1. 外部命令（Command API）= dispatch(w, cmd): UI・プレイヤー・創造主・管理操作の入口。権限（authority）・段階（phase）・過去閲覧中の禁止・冪等性（commandId）・検証・
//        取り消し点 → 適用 → 例外なら全体を戻す、までを一箇所で保証する。外部の経路で WorldState を直接書き換えない。
//     2. AI 行動（AI action API）= civ/actions.runAction: tick の ai_plan で計画し、apply で「共通の行動レジストリ」を通して実行する（プレイヤー命令も同じ候補生成・同じ実行）。
//        判断の過程（観測・候補・採点・理由）は保存しない。結果だけが歴史資料（civ/archive）になる。
//     3. 創造主の介入 = wcde/intervention: 通常計算値とは別の補正レイヤー（有効値 = 通常値 + 残存補正）。AI・プレイヤーの権限では呼べない。介入の台帳は歴史の事実と混ぜない。
//     4. 月次 tick のトランザクション = safeAdvance: 内部の tick は、WCDE が管理する領域（registry.js）が「自分の所有する正本だけ」を決まった順序で更新する。
//        dispatch は外部の入口であり、tick の内部更新は dispatch を通らない（毎月の全更新に命令検証を挟まない）が、領域の所有と順序は台帳と PHASES で固定する。
//        tick が例外になったときは、その月の直前の取り消し点まで戻して決定的に再現し、半端な状態を残さない（歴史の乱数は historySeed と月から導く）。
//   権限: player_order（担当国家の命令）／creator_intervention（創造主）／ai_action（国家AI）／simulation_transition（tick）／administrative（時間を進める・担当を決める・表示設定）。
//   原子性: 命令は途中で失敗したら、WorldState・乱数の入力・ID連番を命令前に戻す。tick は safeAdvance が 120 か月ごとの取り消し点から決定的に戻す。
//   冪等性: commandId が同じ命令は二度実行しない（保存・再送のときの二重適用を防ぐ）。
//   歴史資料のコミット: 月ごとに積んだ結果（civ.events）を、歴史資料（civ.archive）へ移して整理するのは、安全な境界（safeAdvance の各チャンクが成功したあと）だけ。取り消し点を跨がない。
import { createCivSim } from "../civ/civ-sim.js";
import { wcdeExtension } from "./domains/index.js";

export const AUTHORITY = Object.freeze({ PLAYER: "player_order", CREATOR: "creator_intervention", AI: "ai_action", SIM: "simulation_transition", ADMIN: "administrative" });
const A = AUTHORITY;
const SNAP_KEYS = ["techOverrides", "states", "groups", "settlements", "figures", "houses", "cultures", "languages", "religions", "treaties", "wars", "activeWarIds", "activeTreatyIds", "proposals", "persons", "orgs", "seq", "wcde", "options", "player", "techWorld", "species", "speciesDefs", "monthIndex", "date", "adoptCache"];
const LOG_MAX = 500, ID_MAX = 2000;

/** WorldState の入口。sim は復元のたびに作り直すので、外から sim を保持せず w.sim を使う */
export function createWcde(world, civ) {
  const w = { world, civ, viewPast: null, sim: null };
  w.rebuild = () => { w.sim = createCivSim(world, civ, { extensions: [wcdeExtension] }); return w.sim; };
  w.rebuild(); return w;
}

/** 命令の定義。phases: 実行できる段階。mutates: false なら過去閲覧中でも可。control: 担当国家が必要 */
export const COMMANDS = {};
/** 命令が属する領域（台帳の ID）。接頭辞で決める。台帳にない領域へ変更を書く命令は定義できない（M1 の契約テスト用） */
const COMMAND_DOMAIN = { founding: "states", control: "states", time: "clock", clock: "clock", news: "integrity", view: "integrity", state: "states", diplomacy: "war_diplomacy", creator: "interventions", calendar: "clock", tech: "tech" };
export const domainOfCommand = (type) => COMMAND_DOMAIN[String(type).split(".")[0]] ?? null;
export function defineCommand(type, spec) { COMMANDS[type] = { mutates: true, phases: ["running"], control: false, checkpoint: true, domain: domainOfCommand(type), ...spec, type }; }
/** 命令の一覧（権限・段階・領域・変更の有無）。文書・テスト・UI の突き合わせ用 */
export const commandTable = () => Object.values(COMMANDS).map((c) => ({ type: c.type, authorities: [...c.authorities], phases: [...c.phases], domain: c.domain, mutates: c.mutates, control: c.control }));

const clonePart = (civ) => { const o = {}; for (const k of SNAP_KEYS) if (k in civ) o[k] = structuredClone(civ[k]); return o; };
/** 命令用の軽い取り消し点（国家・集団・人物など）。events / decisions / history は追記のみなので、長さで戻す */
function checkpoint(civ) { return { part: clonePart(civ), ev: civ.events.length }; }
/** 取り消し。civ の最上位の入れ物（states・groups など）は同じオブジェクトのまま中身を戻す（外から持っている参照が切れない）。入れ物の中の国家などは作り直される */
function rollback(w, cp) {
  const { civ } = w;
  for (const k of SNAP_KEYS) {
    if (!(k in cp.part)) { delete civ[k]; continue; } const src = structuredClone(cp.part[k]), cur = civ[k];
    if (Array.isArray(cur) && Array.isArray(src)) { cur.length = 0; cur.push(...src); } else if (cur && src && typeof cur === "object" && typeof src === "object" && !Array.isArray(cur)) { for (const x of Object.keys(cur)) delete cur[x]; Object.assign(cur, src); } else civ[k] = src;
  }
  civ.events.length = cp.ev; w.rebuild();
}
/** 追記専用の記録（実測: 既存の要素は一度も書き換わらない）。取り消し点では、複製せず長さだけを覚える（長期の世界で、毎回、全体を複製しないため） */
const APPEND_ONLY = ["events", "works"];
export const checkpointFull = (civ) => { const part = {}, lens = {}, order = Object.keys(civ); for (const k of order) if (APPEND_ONLY.includes(k) && Array.isArray(civ[k])) lens[k] = civ[k].length; else part[k] = structuredClone(civ[k]); return { order, part, lens }; };
/** 取り消し点へ戻す。追記専用の記録は、長さを戻す（同じ配列のまま）。キーの順序も、取り消し点のとおりに戻す */
export function restoreInto(w, snap) { const { civ } = w, keep = {}; for (const k of Object.keys(snap.lens)) { civ[k].length = snap.lens[k]; keep[k] = civ[k]; } for (const k of Object.keys(civ)) delete civ[k]; for (const k of snap.order) civ[k] = k in keep ? keep[k] : structuredClone(snap.part[k]); w.rebuild(); }

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
