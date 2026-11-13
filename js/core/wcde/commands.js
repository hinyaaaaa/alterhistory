// v6 M0/M5: 命令の定義。どの権限で・どの段階で・何を変えられるか（権限の表）。すべて dispatch（contract.js）を通る。
import { AUTHORITY as A, defineCommand, safeAdvance } from "./contract.js";
import { foundAsPlayer, foundAsCreator, delegateToWorld, refreshCandidates, foundingOptions } from "./founding.js";
import { planUprising, startUprising, setOffices } from "./uprising.js";
import { takeControl, releaseControl, creatorEditState, creatorRename } from "./control.js";
import { reorganize, adoptDoctrine } from "./domains/military.js";
import { applyDisplayEdit } from "./calendar.js";
import { clockRun, ackNews, setSpeed, skipNews, timeOf } from "./clock.js";
import { createCatastrophe, planCatastrophe } from "./catastrophe.js";
import { createIntervention, cancelIntervention, planIntervention } from "./intervention.js";
import { negotiatePeace } from "./negotiation.js";
import { directWar } from "./warfare.js";
import { resolveDecision } from "./decisions.js";
import { setPolicy } from "./policies.js";
import { ensureCorps, renameCorps, renameUnit, splitCorps, mergeCorps, transferUnits, convertUnit, appoint, dismiss, setOrder, commitWar } from "./corps.js";
import { planTechEdit, techEdit, techEditReset, techGrant } from "./techedit.js";

const ALL = ["prehistory", "founding", "running"];
let registered = false;
export function registerCommands() {
  if (registered) return; registered = true;
  // 建国（段階: founding）
  defineCommand("founding.found", { authorities: [A.PLAYER], phases: ["founding"], apply: (w, c) => foundAsPlayer(w, c) });
  defineCommand("founding.delegate", { authorities: [A.ADMIN], phases: ["founding"], apply: (w) => delegateToWorld(w) });
  defineCommand("founding.options", { authorities: [A.ADMIN], mutates: false, phases: ["founding", "running"], apply: (w, c) => foundingOptions(w, { regime: c.regime ?? null, capital: c.capital ?? null, techs: c.techs ?? [] }) }); // v6.4.0: 建国の各段階の選択肢（何も変えない）
  defineCommand("creator.found", { authorities: [A.CREATOR], phases: ["running"], apply: (w, c) => foundAsCreator(w, c) }); // v6.4.0: 創造主が新しい国家を作る（担当しない。建国と同じ流れ）
  defineCommand("founding.refresh", { authorities: [A.ADMIN], phases: ["founding"], apply: (w) => ({ ok: true, candidates: refreshCandidates(w) }) });
  // v6.4.0: 担当国内の反乱・革命、役職の組み替え
  defineCommand("uprising.plan", { authorities: [A.PLAYER], control: true, mutates: false, apply: (w, c) => planUprising(w, c) });
  defineCommand("uprising.start", { authorities: [A.PLAYER], control: true, apply: (w, c) => startUprising(w, c) });
  defineCommand("state.setOffices", { authorities: [A.PLAYER, A.CREATOR], control: true, apply: (w, c) => setOffices(w, c) });
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
  // v6.12.0: 決断（条約の申し出・宣戦・継承・反乱・会戦）。担当国だけが答えられる。時間は、すべての決断に答えるまで止まったまま
  defineCommand("decision.resolve", { authorities: [A.PLAYER], control: true, checkpoint: true, validate: (w, c) => (typeof c.decisionId === "string" && typeof c.option === "string" ? null : { ok: false, error: "decisionId と option が必要です" }), apply: (w, c) => resolveDecision(w, { id: c.decisionId, option: c.option, extra: c.extra ?? null }) });
  // v6.12.0: 軍団（名前・兵力・指揮官を持つ部隊）の編成・人事・作戦命令。担当国家だけ。検証は corps.js（失敗したら何も変えない）
  const cs = (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return null; ensureCorps(w.sim.ctx, st); return st; };
  const corpsCmd = (type, fn) => defineCommand(type, { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = cs(w, c); if (!st) return { ok: false, error: "その国家は存在しません" }; const r = fn(w.sim.ctx, st, c); if (r?.ok === false) return { ok: false, error: r.error ?? r.reason }; w.sim.ctx._byState = null; return { ok: true, result: r }; } });
  corpsCmd("corps.refresh", () => ({ ok: true })); // 担当国の軍団を、まだ作っていなければ作る（画面が最初に開いたとき）
  corpsCmd("corps.rename", (ctx, st, c) => renameCorps(st, c));
  corpsCmd("corps.renameUnit", (ctx, st, c) => renameUnit(st, c));
  corpsCmd("corps.split", (ctx, st, c) => splitCorps(ctx, st, c));
  corpsCmd("corps.merge", (ctx, st, c) => mergeCorps(st, c));
  corpsCmd("corps.transfer", (ctx, st, c) => transferUnits(st, c));
  corpsCmd("corps.convert", (ctx, st, c) => convertUnit(ctx, st, c));
  corpsCmd("corps.appoint", (ctx, st, c) => appoint(ctx, st, c));
  corpsCmd("corps.dismiss", (ctx, st, c) => dismiss(st, c));
  corpsCmd("corps.order", (ctx, st, c) => setOrder(ctx, st, c));
  corpsCmd("corps.commit", (ctx, st, c) => commitWar(ctx, st, c));
  // v6.12.0: 国策（分野ごとの枠に入れる）。担当国家だけ
  defineCommand("focus.set", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; const r = setPolicy(w.sim.ctx, st, { category: c.category, slot: c.slot, policyId: c.policyId ?? null }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  // 戦争の高位の方針（posture 攻勢/均衡/守勢・投入割合・重点の戦域）。作戦の立案と実行は AI と同じ経路（プレイヤーは個々の作戦を直接動かさない）
  defineCommand("war.direct", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId], war = w.civ.wars[c.warId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; if (!war) return { ok: false, error: "その戦争はありません" }; const r = directWar(w.sim.ctx, st, war, { posture: c.posture ?? null, commit: c.commit ?? null, focus: c.focus }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.error }; } });
  defineCommand("state.reorganize", { authorities: [A.PLAYER, A.CREATOR], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; return reorganize(w.sim.ctx, st, c.shares); } });
  defineCommand("state.adoptDoctrine", { authorities: [A.PLAYER], control: true, apply: (w, c) => { const st = w.civ.states[c.stateId]; if (!st?.alive) return { ok: false, error: "その国家は存在しません" }; const r = adoptDoctrine(w.sim.ctx, st, c.doctrineId ?? c.id, { provenance: "player" }); return r.ok ? { ok: true, result: r } : { ok: false, error: r.reason }; } });
  // 創造主の直接編集（担当の有無に依らない）
  defineCommand("creator.editState", { authorities: [A.CREATOR], apply: (w, c) => creatorEditState(w, c) });
  defineCommand("creator.rename", { authorities: [A.CREATOR], phases: ["founding", "running"], apply: (w, c) => creatorRename(w, c) });
  // 創造主の介入（計算値への一時的な補正。AI・プレイヤーは呼べない）
  defineCommand("creator.intervene", { authorities: [A.CREATOR], validate: (w, c) => { const p = planIntervention(w, c); return p.ok ? null : p; }, apply: (w, c) => createIntervention(w, c) });
  defineCommand("tech.preview", { authorities: [A.CREATOR], mutates: false, phases: ALL, apply: (w, c) => planTechEdit(w, c) });               // 影響の確認だけ（何も変えない）
  defineCommand("creator.techEdit", { authorities: [A.CREATOR], apply: (w, c) => techEdit(w, c) });                                  // 技術ツリーの前提・効果・解禁を重ね書き
  defineCommand("creator.techEditReset", { authorities: [A.CREATOR], apply: (w, c) => techEditReset(w, c) });
  defineCommand("creator.techGrant", { authorities: [A.CREATOR], apply: (w, c) => techGrant(w, c) });                               // 集団・国家への付与／剥奪
  defineCommand("creator.catastrophe", { authorities: [A.CREATOR], validate: (w, c) => { const p = planCatastrophe(w, c); return p.ok ? null : p; }, apply: (w, c) => createCatastrophe(w, c) }); // 世界規模・地域規模の災厄（最大 95%）。介入台帳に記録し、事実の結果は別に残す
  defineCommand("creator.cancelIntervention", { authorities: [A.CREATOR], apply: (w, c) => cancelIntervention(w, c) });
  // 暦の表示設定（時代区分の名前・表示形式。日付・境界は変えない）
  defineCommand("calendar.edit", { authorities: [A.ADMIN, A.CREATOR], phases: ALL, apply: (w, c) => { const r = applyDisplayEdit(w.civ.wcde.config.calendar, c.edit ?? {}); if (r.errors.length) return { ok: false, error: r.errors.join(" / ") }; w.civ.wcde.config.calendar = r.calendar; return { ok: true }; } });
}
