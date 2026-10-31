// v6 M0/M5: 命令の定義。どの権限で・どの段階で・何を変えられるか（権限の表）。すべて dispatch（contract.js）を通る。
import { AUTHORITY as A, defineCommand, safeAdvance } from "./contract.js";
import { foundAsPlayer, delegateToWorld, refreshCandidates } from "./founding.js";
import { takeControl, releaseControl, creatorEditState, creatorRename } from "./control.js";
import { reorganize, adoptDoctrine } from "./domains/military.js";
import { applyDisplayEdit } from "./calendar.js";
import { clockRun, ackNews, setSpeed, skipNews, timeOf } from "./clock.js";
import { createIntervention, cancelIntervention, planIntervention } from "./intervention.js";
import { negotiatePeace } from "./negotiation.js";

const ALL = ["prehistory", "founding", "running"];
let registered = false;
export function registerCommands() {
  if (registered) return; registered = true;
  // 建国（段階: founding）
  defineCommand("founding.found", { authorities: [A.PLAYER], phases: ["founding"], apply: (w, c) => foundAsPlayer(w, c) });
  defineCommand("founding.delegate", { authorities: [A.ADMIN], phases: ["founding"], apply: (w) => delegateToWorld(w) });
  defineCommand("founding.refresh", { authorities: [A.ADMIN], phases: ["founding"], apply: (w) => ({ ok: true, candidates: refreshCandidates(w) }) });
  // 担当（段階: running）。表示する国家は UI の状態で、ここでは扱わない
  defineCommand("control.take", { authorities: [A.ADMIN], apply: (w, c) => takeControl(w, c.stateId) });
  defineCommand("control.release", { authorities: [A.ADMIN], apply: (w) => releaseControl(w) });
  // 時間（チェックポイントは safeAdvance が持つので、命令の取り消し点は取らない）
  defineCommand("time.advance", { authorities: [A.ADMIN], checkpoint: false, validate: (w, c) => (timeOf(w.civ).hold ? { ok: false, error: "重大ニュースの確認待ちです（OK を押すまで時間は進みません）" } : (Number.isInteger(c.months) && c.months >= 1 && c.months <= 120000 ? null : { ok: false, error: "months は 1〜120000 の整数" })), apply: (w, c) => { const r = safeAdvance(w, c.months); skipNews(w.civ); return r.ok ? { ok: true, ...r } : { ok: false, error: `${r.error}（${r.haltedAt.year}年${r.haltedAt.month}月で停止）`, ...r }; } });
  // 再生（UI の時間制御）。重大ニュースの月で止まり、OK まで進まない。速度は停止前の値へ自動で戻る
  defineCommand("clock.run", { authorities: [A.ADMIN], checkpoint: false, validate: (w, c) => (Number.isInteger(c.months) && c.months >= 1 && c.months <= 240 ? null : { ok: false, error: "months は 1〜240 の整数" }), apply: (w, c) => { const r = clockRun(w, c.months); return r.ok ? r : { ...r, ok: false }; } });
  defineCommand("clock.setSpeed", { authorities: [A.ADMIN], mutates: false, phases: ALL, apply: (w, c) => setSpeed(w, c) });
  defineCommand("news.ack", { authorities: [A.ADMIN], mutates: false, phases: ALL, apply: (w, c) => ackNews(w, c) });
  // 過去の閲覧（世界を変えない）
  defineCommand("view.past", { authorities: [A.ADMIN], mutates: false, phases: ALL, validate: (w, c) => (c.month == null || (Number.isInteger(c.month) && c.month <= w.civ.monthIndex) ? null : { ok: false, error: "month は現在以前の整数、または null（現在へ戻る）" }), apply: (w, c) => { w.viewPast = c.month ?? null; return { ok: true }; } });
  // 担当国家の命令（player_order）。AI と同じ行動レジストリ・同じ検証
  defineCommand("state.act", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const r = w.sim.command({ type: "stateAction", stateId: c.stateId, action: c.action, target: c.target ?? null, opt: c.opt ?? null }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  // 講和は一般条約の行動ではなく、戦争ごとの専用の手続き（担当国だけが申し入れられる。受諾されたときだけ戦争が終わる）
  defineCommand("diplomacy.peace", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId], war = w.civ.wars[c.warId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; const r = negotiatePeace(w.sim.ctx, st, war, { terms: c.terms }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  defineCommand("state.reorganize", { authorities: [A.PLAYER, A.CREATOR], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; return reorganize(w.sim.ctx, st, c.shares); } });
  defineCommand("state.adoptDoctrine", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; const r = adoptDoctrine(w.sim.ctx, st, c.id, { provenance: "player" }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.reason }; } });
  // 創造主の直接編集（担当の有無に依らない）
  defineCommand("creator.editState", { authorities: [A.CREATOR], apply: (w, c) => creatorEditState(w, c) });
  defineCommand("creator.rename", { authorities: [A.CREATOR], phases: ["founding", "running"], apply: (w, c) => creatorRename(w, c) });
  // 創造主の介入（計算値への一時的な補正。AI・プレイヤーは呼べない）
  defineCommand("creator.intervene", { authorities: [A.CREATOR], validate: (w, c) => { const p = planIntervention(w, c); return p.ok ? null : p; }, apply: (w, c) => createIntervention(w, c) });
  defineCommand("creator.cancelIntervention", { authorities: [A.CREATOR], apply: (w, c) => cancelIntervention(w, c) });
  // 暦の表示設定（時代区分の名前・表示形式。日付・境界は変えない）
  defineCommand("calendar.edit", { authorities: [A.ADMIN, A.CREATOR], phases: ALL, apply: (w, c) => { const r = applyDisplayEdit(w.civ.wcde.config.calendar, c.edit ?? {}); if (r.errors.length) return { ok: false, error: r.errors.join(" / ") }; w.civ.wcde.config.calendar = r.calendar; return { ok: true }; } });
}
