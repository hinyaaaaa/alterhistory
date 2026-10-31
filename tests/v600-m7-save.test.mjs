// v6.0.0 M7: 保存形式・検証・復元（破損の拒否と安全な修復、往復、乱数・介入・ニュースの再現）。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { packSave, unpackSave, checksum, SAVE_FORMAT, SAVE_SCHEMA, backupLabel } from "../js/core/wcde/savefile.js";
import { interventionsOf } from "../js/core/wcde/intervention.js";
import { newsOf, timeOf, scanNews } from "../js/core/wcde/clock.js";
import { makeEvent } from "../js/core/civ/events.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "m7s-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w = R.w;
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 240 }).ok);
const top = Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop)[0];
assert.ok(dispatch(w, { type: "creator.intervene", authority: A.CREATOR, stateId: top.id, field: "taxRevenue", value: 1.7, halfLifeMonths: 60, reason: "保存テスト" }).ok);
dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 3 }); assert.ok(dispatch(w, { type: "clock.run", authority: A.ADMIN, months: 3 }).ok);
// 未確認ニュースがある状態を確実に作る（大国どうしの滅亡という事実イベントを 1 件起こし、確定後の走査にかける）
makeEvent(w.civ, w.sim.ctx.ids, { kind: "state_dissolved", title: "（試験）最大の国が滅んだ", participants: Object.values(w.civ.states).filter((x) => x.alive).sort((a, b) => b.pop - a.pop).slice(0, 6).map((x) => ({ entityId: x.id, role: "state" })) }); assert.ok(scanNews(w.civ) >= 1); assert.ok(timeOf(w.civ).hold);
const P = packSave(w), TEXT = P.text;
const load = (t, o) => unpackSave(t, o);
const tamper = (fn) => { const d = JSON.parse(TEXT); fn(d); return JSON.stringify(d); };

console.log("=== 形式と往復 ===");
await check("保存形式の版はアプリの版から独立し、形式名・版・チェックサム・メタ情報を持つ", () => { const d = JSON.parse(TEXT); assert.equal(d.format, SAVE_FORMAT); assert.equal(d.schema, SAVE_SCHEMA); assert.ok(d.appVersion); assert.equal(d.checksum, checksum(JSON.stringify(d.civ))); assert.equal(d.meta.monthIndex, w.civ.monthIndex); assert.ok(d.meta.states > 0 && d.meta.cells > 0); assert.notEqual(String(d.schema), d.appVersion); });
await check("往復（保存 → 読み込み → 再保存）で、WorldState・介入・乱数・ID採番・ニュースキュー・停止前の速度が失われない", () => {
  const r = load(TEXT); assert.ok(r.ok, JSON.stringify(r.errors)); const c = r.w; assert.equal(c.civ.monthIndex, w.civ.monthIndex); assert.equal(JSON.stringify(c.civ.states), JSON.stringify(w.civ.states)); assert.deepEqual(interventionsOf(c.civ), interventionsOf(w.civ)); assert.deepEqual(c.civ.wcde.adjust, w.civ.wcde.adjust);
  assert.deepEqual(c.civ.seq, w.civ.seq); assert.equal(JSON.stringify(newsOf(c.civ)), JSON.stringify(newsOf(w.civ))); assert.equal(JSON.stringify(timeOf(c.civ)), JSON.stringify(timeOf(w.civ))); assert.ok(newsOf(c.civ).queue.length >= 1, "未確認ニュースがある状態で保存した"); assert.equal(c.civ.events.length, w.civ.events.length);
  assert.equal(packSave(c).text, TEXT, "再保存しても同じ内容（情報が増減しない）"); assert.deepEqual(checkWcdeIntegrity(c.world, c.civ), []);
});
await check("復元した世界は、保存時と同じ入力から同じ未来になる（乱数・介入の減衰・ニュース確認）", () => {
  const a = load(TEXT).w, b = load(TEXT).w; for (const x of [a, b]) { while (newsOf(x.civ).queue.length) assert.ok(dispatch(x, { type: "news.ack", authority: A.ADMIN }).ok); assert.ok(dispatch(x, { type: "time.advance", authority: A.ADMIN, months: 60 }).ok); }
  assert.equal(JSON.stringify(a.civ.states), JSON.stringify(b.civ.states)); assert.equal(a.civ.events.length, b.civ.events.length); assert.deepEqual(interventionsOf(a.civ), interventionsOf(b.civ));
});
await check("自動バックアップは正式な保存ファイルと取り違えない名前で扱う", () => { assert.ok(backupLabel("A").startsWith("【自動バックアップ】")); assert.notEqual(backupLabel("A"), "A"); });

console.log("=== 破損・不正の拒否（元のデータは変えない・空の世界に置き換えない） ===");
const refused = (t, re, o) => { const r = load(t, o); assert.equal(r.ok, false); assert.ok(r.errors.length && !r.w, "世界を返さない（空の世界へ置き換えない）"); if (re) assert.ok(re.test(r.errors.join("|")), r.errors.join("|")); return r; };
await check("空・JSON でない・途中で切れたファイル・別形式・旧形式・新しすぎる版を、理由つきで拒否する", () => {
  refused("", /空/); refused("{not json", /JSON/); refused(TEXT.slice(0, TEXT.length >> 1), /JSON/); refused("[]", /形式/); refused(JSON.stringify({ format: "x" }), /保存ファイルではありません/); refused(JSON.stringify({ format: "alterhistory-wcde", civ: {} }), /旧形式/);
  refused(tamper((d) => { d.schema = SAVE_SCHEMA + 1; }), /新しい保存形式/); refused(tamper((d) => { d.schema = "1"; }), /版/); refused(tamper((d) => { delete d.civ; }), /civ/);
});
await check("チェックサムの不一致（1文字の改変）を検出して拒否する。利用者が明示した場合だけ、検証を通れば読める", () => {
  const t = tamper((d) => { d.civ.states[top.id].treasury += 1; }); refused(t, /チェックサム/); const r = load(t, { allowChecksumMismatch: true }); assert.ok(r.ok); assert.ok(r.warnings.some((x) => /チェックサム/.test(x)));
});
await check("必須項目の欠落・型の違い・NaN 相当（有限でない数）・ID の食い違いを拒否する", () => {
  const fixsum = (d) => { d.checksum = checksum(JSON.stringify(d.civ)); return JSON.stringify(d); };
  for (const [fn, re] of [[(d) => { delete d.civ.states; }, /states/], [(d) => { d.civ.monthIndex = -3; }, /monthIndex|月の番号/], [(d) => { d.civ.events = {}; }, /events/], [(d) => { d.civ.states[top.id].pop = null; }, /有限/], [(d) => { d.civ.states[top.id].id = "state_x"; }, /ID/], [(d) => { delete d.civ.wcde.config.spec; }, /設定/], [(d) => { d.civ.wcde.phase = "?"; }, /phase|段階/]]) { const d = JSON.parse(TEXT); fn(d); refused(fixsum(d), re); }
});
await check("地図の格子の数が合わない（生成の版違い）は拒否。ID 参照切れ・介入の構造破損は整合性検査で拒否", () => {
  const fixsum = (d) => { d.checksum = checksum(JSON.stringify(d.civ)); return JSON.stringify(d); };
  let d = JSON.parse(TEXT); d.meta.cells += 1; refused(fixsum(d), /格子/);
  d = JSON.parse(TEXT); d.civ.wcde.interventions.records[0].residual = "x"; refused(fixsum(d), /整合性/);
  d = JSON.parse(TEXT); const gid = Object.keys(d.civ.groups)[0]; d.civ.groups[gid].stateId = "state_missing"; const r = load(fixsum(d)); assert.equal(r.ok, false);
});
await check("確認待ちニュースの破損（元イベントなし・hold と キューの食い違い）は拒否する", () => {
  const fixsum = (d) => { d.checksum = checksum(JSON.stringify(d.civ)); return JSON.stringify(d); };
  let d = JSON.parse(TEXT); d.civ.wcde.news.queue[0].eventId = "event_none"; refused(fixsum(d), /整合性/); d = JSON.parse(TEXT); d.civ.wcde.time.hold = false; refused(fixsum(d), /整合性/);
});
await check("安全に直せる不備だけ直し、直した内容を警告と診断記録に残す（介入補正の表の欠落）。過去の客観イベントは変えない", () => {
  const d = JSON.parse(TEXT); d.civ.wcde.adjust = {}; d.checksum = checksum(JSON.stringify(d.civ)); const r = load(JSON.stringify(d)); assert.ok(r.ok, JSON.stringify(r.errors)); assert.ok(r.warnings.length >= 1 && r.repairs.length >= 1); assert.deepEqual(r.w.civ.wcde.adjust, w.civ.wcde.adjust, "記録から作り直された");
  assert.ok(r.w.civ.wcde.diagnostics.some((x) => x.repair)); assert.equal(JSON.stringify(r.w.civ.events), JSON.stringify(w.civ.events), "事実イベントは無改変");
});
await check("読み込みは入力の文字列を変えず、例外も投げない（どんな入力でも ok:false で返る）", () => { const copy = TEXT.slice(); for (const junk of [null, undefined, 42, {}, "null", "123", '{"format":"alterhistory-save"}']) { const r = load(junk); assert.equal(r.ok, false); } assert.equal(TEXT, copy); });
console.log("     保存サイズ:", (P.bytes / 1048576).toFixed(2), "MB（", w.civ.date.year, "年・イベント", w.civ.events.length, "件）");
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
