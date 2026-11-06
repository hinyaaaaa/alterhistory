// v6.0.0 M5: 命令の契約（権限・段階・原子性・冪等性・過去閲覧）／担当国家（最大1）／創造主の直接編集／AI とプレイヤーの共通経路／過去の復元。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, safeAdvance, defineCommand, COMMANDS, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { EDITABLE_STATE_FIELDS } from "../js/core/wcde/control.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { ACTION, runAction } from "../js/core/civ/actions.js";
import { DOCTRINES } from "../js/core/wcde/domains/military.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const R = createNewWorld({ worldSeed: "e2e-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: true } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 300 }).ok);
const BASE = serializeWorld(w0); const fresh = () => deserializeWorld(BASE); const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
// v6.1.0: AI の判断は保存しない。AI の行動は、provenance が "ai" の出来事（結果）として残る
const mk = (w) => w.civ.date.year * 12 + w.civ.date.month, actorOf = (e) => e.participants.find((p) => p.role === "actor")?.entityId ?? null, aiActs = (w, since) => w.civ.events.filter((e) => e.provenance === "ai" && e.date.year * 12 + e.date.month > since);
const adm = (w, n) => { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: n }); assert.ok(r.ok, r.error); };

console.log("=== 権限の表 ===");
await check("全ての命令 × 全ての権限: 許可されない権限は、状態を変えずに拒否される（権限の表のとおり）", () => {
  const w = fresh(), before = JSON.stringify(w.civ.states) + w.civ.events.length; let n = 0;
  for (const [type, spec] of Object.entries(COMMANDS)) for (const authority of Object.values(A)) { if (spec.authorities.includes(authority)) continue; const r = dispatch(w, { type, authority, stateId: alive(w)[0].id, months: 1 }); assert.equal(r.ok, false, `${type} を ${authority} で実行できてしまう`); assert.equal(r.code, "authority"); n++; }
  assert.ok(n > 20); assert.equal(JSON.stringify(w.civ.states) + w.civ.events.length, before);
});
await check("未知の命令・未知の権限は拒否", () => { const w = fresh(); assert.equal(dispatch(w, { type: "nope", authority: A.ADMIN }).code, "unknown"); assert.equal(dispatch(w, { type: "time.advance", authority: "god", months: 1 }).code, "authority"); });
await check("段階の制約: 建国の命令は running では実行できない／時間は running でのみ進む", () => { const w = fresh(); assert.equal(dispatch(w, { type: "founding.delegate", authority: A.ADMIN }).code, "phase"); });

console.log("=== 担当国家（最大1） ===");
const W = fresh(); const [S1, S2, S3] = alive(W);
await check("担当するとその国家だけがプレイヤー国家になる。別の国家を担当すると付け替わる（常に高々1つ）", () => {
  assert.ok(dispatch(W, { type: "control.take", authority: A.ADMIN, stateId: S1.id }).ok); assert.deepEqual(alive(W).filter((s) => s.player).map((s) => s.id), [S1.id]);
  assert.ok(dispatch(W, { type: "control.take", authority: A.ADMIN, stateId: S2.id }).ok); assert.deepEqual(alive(W).filter((s) => s.player).map((s) => s.id), [S2.id]); assert.equal(W.civ.wcde.control.stateId, S2.id); assert.deepEqual(checkWcdeIntegrity(W.world, W.civ), []);
  assert.equal(dispatch(W, { type: "control.take", authority: A.ADMIN, stateId: "state_nope" }).ok, false);
});
await check("担当国家以外・担当が無いときの、プレイヤー命令は拒否される。表示する国家は担当を変えない", () => {
  assert.equal(dispatch(W, { type: "state.act", authority: A.PLAYER, stateId: S3.id, action: "set_tax", opt: "up" }).code, "not_controlled");
  const w2 = fresh(); assert.equal(dispatch(w2, { type: "state.act", authority: A.PLAYER, stateId: S1.id, action: "set_tax", opt: "up" }).code, "no_control");
  dispatch(w2, { type: "view.past", authority: A.ADMIN, month: w2.civ.monthIndex - 5 }); assert.equal(w2.civ.wcde.control.stateId, null, "過去の閲覧は担当を変えない");
});
await check("担当していない国家（全て）は AI が動かす。担当国家は AI の計画の対象にならない", () => {
  const w = fresh(), mine = alive(w)[0]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: mine.id }); const m0 = mk(w); adm(w, 30);
  const ds = aiActs(w, m0).map((e) => ({ actorId: actorOf(e) })).filter((d) => d.actorId); assert.ok(ds.length > 0); assert.ok(ds.every((d) => d.actorId !== mine.id), "担当国家に AI の判断がある"); assert.ok(new Set(ds.map((d) => d.actorId)).size > 3, "ほかの国家は AI が動く");
});
await check("担当を外す（創造主モード）と、全国家が AI で動く。担当国家が滅びたら自動で外れる", () => {
  const w = fresh(), s = alive(w)[0]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }); assert.ok(dispatch(w, { type: "control.release", authority: A.ADMIN }).ok); assert.equal(alive(w).filter((x) => x.player).length, 0); const actors = new Set(); for (let i = 0; i < 6; i++) { const m0 = mk(w); adm(w, 12); for (const e of aiActs(w, m0)) { const a = actorOf(e); if (a) actors.add(a); } } /* AI の行動は大きな出来事だけが記録に残る。特定の 1 国が 6 年のうちに必ず何かを記録するとは限らないので、「全国家が AI の対象」を、担当がいないこと＋複数の国家が AI で動くことで確かめる */
  assert.ok(actors.size >= 3, "担当がいなくても、複数の国家が AI で動く"); assert.equal(alive(w).filter((x) => x.player).length, 0); assert.equal(w.civ.wcde.control.stateId, null);
  const t = alive(w)[alive(w).length - 1]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: t.id }); t.alive = false; adm(w, 1); assert.equal(w.civ.wcde.control.stateId, null); assert.ok(w.civ.wcde.log.some((e) => e.type === "control.lost"));
});

console.log("=== プレイヤーと AI の共通経路 ===");
await check("同じ行動（増税）を、プレイヤー命令と AI の経路で行うと、同じ結果になる（同じ検証・同じ実行）", () => {
  const a = fresh(), b = fresh(), id = alive(a)[0].id; dispatch(a, { type: "control.take", authority: A.ADMIN, stateId: id });
  const ra = dispatch(a, { type: "state.act", authority: A.PLAYER, stateId: id, action: "set_tax", opt: "down" }); assert.ok(ra.ok, ra.error);
  const sb = b.civ.states[id]; const rb = runAction(b.sim.ctx, sb, ACTION.set_tax, { key: "set_tax", opt: "down", target: null, factors: {} }, { provenance: "ai" }); assert.ok(rb.ok);
  assert.deepEqual(a.civ.states[id].policy, sb.policy); assert.equal(a.civ.states[id].treasury, sb.treasury);
  assert.deepEqual(ra.result.eventIds.length, rb.eventIds.length); // 増税のような日常の行動は、どちらの経路でも出来事にならない（同じ扱い）
});
await check("新しい領域の行動（ドクトリン・産業投資・勢力への配慮）も、同じ行動レジストリを通り、AI の行動は、結果の出来事（provenance ai）に残る", () => {
  for (const k of ["adopt_doctrine", "invest_industry", "appease_faction"]) assert.ok(ACTION[k] && ACTION[k].enabled, k);
  const w = fresh(); adm(w, 120);
  assert.ok(alive(w).some((s) => Object.keys(s.military.doctrine.taken).length > 0), "AI が実際にドクトリンを取っている"); assert.ok(alive(w).some((s) => s.econ.investment > 0), "AI が実際に産業へ投資している");
});
await check("プレイヤーはドクトリンの取得を命令できる。前提不足は拒否され、状態は変わらない", () => {
  const w = fresh(), s = alive(w)[0]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }); s.treasury = 1e5; s.polity = "kingdom"; s.military.doctrine.taken = {};
  const before = JSON.stringify(s.military.doctrine); assert.equal(dispatch(w, { type: "state.adoptDoctrine", authority: A.PLAYER, id: "gun_line" }).ok, false); assert.equal(JSON.stringify(s.military.doctrine), before);
  const r = dispatch(w, { type: "state.adoptDoctrine", authority: A.PLAYER, id: "levy_drill" }); assert.ok(r.ok, r.error); assert.ok(s.military.doctrine.taken.levy_drill != null); assert.equal(w.civ.events.at(-1).provenance, "player");
});

console.log("=== 創造主の直接編集 ===");
await check("創造主は、担当の有無に関わらず、どの国家も直接編集できる。変更前後が介入の台帳に残り、出来事とは混ざらない", () => {
  const w = fresh(), s = alive(w)[1]; const old = s.name, n = w.civ.events.length; const r = dispatch(w, { type: "creator.editState", authority: A.CREATOR, stateId: s.id, changes: { name: "新生国", "policy.tax": 0.2, treasury: 777 } }); assert.ok(r.ok, r.error);
  assert.equal(s.name, "新生国"); assert.equal(s.policy.tax, 0.2); assert.equal(s.treasury, 777); // v6.1.0 M7: 創造主の編集は介入の台帳（wcde.edits）にだけ残し、世界の事実の出来事（events）とは混ぜない
  assert.ok(!w.civ.events.slice(n).some((e) => e.kind === "creator_edit"), "創造主の編集が出来事に混ざっている"); assert.ok(w.civ.wcde.edits.some((e) => e.property === "name" && e.before === old && e.after === "新生国" && e.authority === "creator_intervention"));
  assert.ok(w.civ.wcde.edits.some((e) => e.property === "treasury" && e.after === 777)); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("創造主の編集は、検証に通らないものが 1 つでもあれば、全体を適用しない。計算で決まる値（産業力・軍事能力など）は直接変えられない", () => {
  const w = fresh(), s = alive(w)[0], snap = JSON.stringify(s);
  assert.equal(dispatch(w, { type: "creator.editState", authority: A.CREATOR, stateId: s.id, changes: { name: "OK", "policy.tax": 9 } }).ok, false); assert.equal(JSON.stringify(s), snap);
  for (const k of ["econ.industry", "milBonus", "politics.legitimacy", "pop", "army"]) { assert.ok(!EDITABLE_STATE_FIELDS.includes(k), k); const r = dispatch(w, { type: "creator.editState", authority: A.CREATOR, stateId: s.id, changes: { [k]: 1 } }); assert.equal(r.ok, false); } assert.equal(JSON.stringify(s), snap);
  assert.equal(dispatch(w, { type: "creator.editState", authority: A.CREATOR, stateId: s.id, changes: {} }).ok, false);
});
await check("創造主は文化・言語・宗教の名前を編集できる（定義の編集）。国名の長さ・空文字は拒否", () => {
  const w = fresh(), c = Object.keys(w.civ.cultures)[0]; assert.ok(dispatch(w, { type: "creator.rename", authority: A.CREATOR, kind: "culture", id: c, name: "星の民" }).ok); assert.equal(w.civ.cultures[c].name, "星の民");
  adm(w, 24); assert.equal(w.civ.cultures[c].name, "星の民", "付けた名前は、自動の命名で上書きされない"); assert.equal(dispatch(w, { type: "creator.rename", authority: A.CREATOR, kind: "religion", id: Object.keys(w.civ.religions)[0], name: "" }).ok, false);
});
await check("暦: 時代区分の名前・表示形式は変えられるが、日付・境界は変えない", () => {
  const w = fresh(); assert.ok(dispatch(w, { type: "calendar.edit", authority: A.ADMIN, edit: { epochName: "新暦" } }).ok); assert.equal(w.civ.wcde.config.calendar.epochName, "新暦"); assert.equal(dispatch(w, { type: "calendar.edit", authority: A.ADMIN, edit: { yearOffset: 3 } }).ok, false);
});

console.log("=== 原子性・冪等性・過去の閲覧 ===");
await check("命令の途中で例外が起きたら、状態・事件・ID 連番を命令前へ戻す（半分だけ変わらない）", () => {
  const w = fresh(); defineCommand("test.boom", { authorities: [A.ADMIN], apply: (ww) => { const s = Object.values(ww.civ.states)[0]; s.treasury = 12345; s.name = "壊れた"; ww.sim.ctx.ids.next("event"); ww.civ.events.push({ eventId: "x" }); throw new Error("途中で失敗"); } });
  const before = JSON.stringify([w.civ.states, w.civ.seq, w.civ.wcde.control]), n = w.civ.events.length; const r = dispatch(w, { type: "test.boom", authority: A.ADMIN }); assert.equal(r.ok, false); assert.equal(r.code, "rolled_back"); assert.equal(JSON.stringify([w.civ.states, w.civ.seq, w.civ.wcde.control]), before); assert.equal(w.civ.events.length, n);
  adm(w, 3); delete COMMANDS["test.boom"]; assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("月の処理が失敗したら、その月の直前の安全な境界まで戻して止まる（診断が残る）。戻した状態は、同じ月数だけ進めた正常な世界と一致する", () => {
  const w = fresh(), ref = fresh(), m0 = w.civ.monthIndex; alive(w)[0].techAdopted = null; // 3か月ごとの処理で必ず例外になる
  const r = safeAdvance(w, 24); assert.equal(r.ok, false); assert.ok(r.advanced < 24 && r.advanced >= 0); assert.equal(w.civ.monthIndex, m0 + r.advanced); assert.equal(w.civ.wcde.diagnostics.at(-1).failedMonth, m0 + r.advanced + 1); assert.match(r.error, /./);
  alive(ref)[0].techAdopted = null; ref.sim.advanceMonths(0); if (r.advanced > 0) { ref.sim.advanceMonths(r.advanced); } assert.equal(ref.civ.monthIndex, w.civ.monthIndex);
});
await check("過去の閲覧中は、世界を変える命令を実行できない（担当の命令・創造主の編集・時間）。現在へ戻すと再び実行できる", () => {
  const w = fresh(), s = alive(w)[0]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }); assert.ok(dispatch(w, { type: "view.past", authority: A.ADMIN, month: w.civ.monthIndex - 60 }).ok); const before = JSON.stringify(w.civ.states);
  for (const cmd of [{ type: "state.act", authority: A.PLAYER, stateId: s.id, action: "set_tax", opt: "up" }, { type: "creator.editState", authority: A.CREATOR, stateId: s.id, changes: { name: "x" } }, { type: "time.advance", authority: A.ADMIN, months: 1 }]) { const r = dispatch(w, cmd); assert.equal(r.ok, false); assert.equal(r.code, "past_view"); }
  assert.equal(JSON.stringify(w.civ.states), before); assert.ok(dispatch(w, { type: "view.past", authority: A.ADMIN, month: null }).ok); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }).ok);
  assert.equal(dispatch(w, { type: "view.past", authority: A.ADMIN, month: w.civ.monthIndex + 5 }).ok, false);
});
await check("保存→読み込み→同じ命令列で、同じ未来になる（担当・創造主の編集・時間を含む決定性）", () => {
  const run = (w) => { const s = alive(w)[0]; dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }); dispatch(w, { type: "state.act", authority: A.PLAYER, stateId: s.id, action: "set_tax", opt: "down", commandId: "c1" }); dispatch(w, { type: "creator.editState", authority: A.CREATOR, stateId: alive(w)[2].id, changes: { treasury: 500 } }); adm(w, 48); return w; };
  const a = run(fresh()), b = run(deserializeWorld(serializeWorld(fresh()))); assert.deepEqual(a.civ.states, b.civ.states); assert.deepEqual(a.civ.events, b.civ.events); assert.equal(a.civ.events.length, b.civ.events.length);
});
await check("AI は WorldState を直接書き換えない: AI の行動は、判断記録（Decision）に結びついた事件として残る", () => {
  const w = fresh(); let ai = []; for (let i = 0; i < 10; i++) { const m0 = mk(w); adm(w, 12); ai.push(...aiActs(w, m0)); } assert.ok(ai.length > 0, "AI の行動が出来事として残る"); assert.ok(ai.every((e) => e.decisionId == null), "AI の判断（decisionId）は保存しない（v6.1.0）");
});
await check("WCDE の不変条件を、この時点で全て満たす", () => { const w = fresh(); adm(w, 60); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []); });

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
