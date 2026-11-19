// v6.20.0 M1: 月次トランザクション（差分型の取り消し点・Write Journal・巻き戻し）
import assert from "node:assert/strict";
import { WriteJournal, takeCheckpoint, restoreCheckpoint, beginMonth, setTxGuard, COLD } from "../js/core/sim/month-transaction.js";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A, COMMANDS, defineCommand } from "../js/core/wcde/contract.js";
import { clockRun } from "../js/core/wcde/clock.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const J = (x) => JSON.stringify(x);

console.log("=== Write Journal ===");
await check("set / delete / push / splice を逆順に戻す。値は最初の 1 回だけ記録する", () => {
  const o = { a: 1, b: { c: 2 }, arr: [1, 2, 3] }, j = new WriteJournal(), before = J(o);
  j.set(o, "a", 10); j.set(o, "a", 20); j.set(o, "z", 5); j.delete(o, "b"); j.push(o.arr, 4, 5); j.splice(o.arr, 0, 2); j.set(o.arr, 0, 99);
  assert.notEqual(J(o), before); j.rollback(); assert.equal(J(o), before);
});
await check("削除して戻したキーの順序が元どおり（Object.keys の順序に決定性が依存する）", () => {
  const o = { k1: 1, k2: 2, k3: 3, k4: 4 }, j = new WriteJournal(); j.delete(o, "k2"); j.set(o, "k9", 9); j.delete(o, "k1"); j.rollback();
  assert.deepEqual(Object.keys(o), ["k1", "k2", "k3", "k4"]);
});
await check("commit は記録を捨てる（以後の rollback は何も戻さない）", () => { const o = { a: 1 }, j = new WriteJournal(); j.set(o, "a", 2); j.commit(); j.rollback(); assert.equal(o.a, 2); assert.equal(j.size, 0); });

console.log("=== 差分型の取り消し点（休眠した記録は複製しない）===");
const fakeCiv = () => ({
  events: [{ id: 1 }], works: [], seq: { a: 1 }, monthIndex: 5,
  states: { s1: { id: "s1", alive: true, pop: 10, hot: [1, 2] }, s2: { id: "s2", alive: false, compacted: true, big: { x: [1, 2, 3] } }, s3: { id: "s3", alive: false, compacted: false, pop: 3 } },
  figures: { f1: { id: "f1", diedAt: 3, compacted: true, children: ["f2"] }, f2: { id: "f2", diedAt: null, children: [] } }, wars: { w1: { id: "w1", status: "ended", ops: null }, w2: { id: "w2", status: "active", ops: { forces: {} } } }, treaties: { t1: { id: "t1", active: false }, t2: { id: "t2", active: true } },
  archive: { chunks: { 0: { rec: [1, 2, 3] } }, rev: 1 }, groups: { g1: { pop: 5 } },
});
await check("休眠した要素は参照を共有し、動いている要素だけ複製する", () => {
  const civ = fakeCiv(), cp = takeCheckpoint(civ); assert.ok(cp.stats.shared >= 4, "休眠: s2・f1・w1・t1");
  assert.strictEqual(cp.coll.states.cold.s2, civ.states.s2); assert.notStrictEqual(cp.coll.states.hot.s1, civ.states.s1); assert.strictEqual(cp.shared.archive, civ.archive);
  assert.equal(cp.coll.states.cold.s3, undefined, "compacted でない死んだ国家は動いている扱い（まだ書かれうる）");
});
await check("取り消し: 動いている要素・追記・追加されたキー・キーの順序が元に戻る。休眠要素は同じ参照のまま", () => {
  const civ = fakeCiv(), s2 = civ.states.s2, before = J(civ), cp = takeCheckpoint(civ);
  civ.states.s1.pop = 99; civ.states.s1.hot.push(3); delete civ.states.s3; civ.states.s4 = { id: "s4", alive: true }; civ.events.push({ id: 2 }); civ.works.push(1); civ.groups.g1.pop = 0; civ.newKey = 1; civ.monthIndex = 6;
  restoreCheckpoint(civ, cp); assert.equal(J(civ), before); assert.strictEqual(civ.states.s2, s2); assert.deepEqual(Object.keys(civ.states), ["s1", "s2", "s3"]);
  restoreCheckpoint(civ, cp); assert.equal(J(civ), before, "同じ取り消し点へ何度でも戻せる");
});
await check("休眠要素への journal 経由の書き込み（コンパクション）も戻る。journal を通さない書き込みは guard が検出する", () => {
  setTxGuard(true); try {
    const civ = fakeCiv(), w = { civ, sim: null, rebuild() {} }, tx = beginMonth(w), before = J(civ);
    tx.journal.set(civ.figures.f1, "children", []); tx.journal.delete(civ.figures, "f1"); tx.journal.delete(civ.treaties, "t1"); tx.rollback(); assert.equal(J(civ), before);
    const tx2 = beginMonth(w); civ.states.s2.big = null; assert.throws(() => tx2.rollback(), /休眠した要素 states\.s2/);
  } finally { setTxGuard(false); }
});

console.log("=== 実世界: 失敗した月の途中状態が一切残らない ===");
const R = createNewWorld({ worldSeed: "v620-tx", spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 240 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const KEYS = ["states", "groups", "settlements", "figures", "wars", "treaties", "languages", "cultures", "religions", "events", "archive", "seq", "monthIndex", "date", "houses"];
const fingerprint = (civ) => J(Object.fromEntries(KEYS.map((k) => [k, civ[k]])));
const diffKeys = (a, b) => KEYS.filter((k) => J(a[k]) !== J(b[k]));
await check("月の処理が途中で例外になると、その月の変更はすべて戻り、手前の月までが確定する（決定的）", () => {
  const w = fresh(), ctl = fresh(), mi = w.civ.monthIndex;
  w.sim.ticker.register("integrity", (ctx) => { if (ctx.civ.monthIndex === mi + 5) throw new Error("注入した失敗"); }, "inject");
  const r = clockRun(w, 12); assert.equal(r.ok, false); assert.equal(r.advanced, 4); assert.equal(w.civ.monthIndex, mi + 4);
  const c = clockRun(ctl, 4); assert.ok(c.ok); assert.deepEqual(diffKeys(w.civ, ctl.civ), [], "失敗した月の途中状態が残っていない（4 か月進めた世界と同じ）");
  assert.ok(w.civ.wcde.diagnostics.some((d) => /注入した失敗/.test(d.message)));
});
await check("guard モード: 各月を「進める → 巻き戻す」と、世界が完全に元に戻る（休眠要素・資料への未記録の書き込みがない）", () => {
  setTxGuard(true); try {
    const w = fresh(); for (let i = 0; i < 24; i++) { const f0 = fingerprint(w.civ), tx = beginMonth(w); w.sim.advanceMonth(); tx.rollback(); assert.equal(fingerprint(w.civ), f0, `${i} か月目`); w.sim.advanceMonth(); }
  } finally { setTxGuard(false); }
});
await check("成功した月のあと、取り消し点は残らない（civ 全体の複製を持ち続けない）", () => { const w = fresh(), tx = beginMonth(w); w.sim.advanceMonth(); tx.commit(); assert.equal(tx.cp, null); assert.equal(w.sim.ctx.tx, null); });
await check("命令（dispatch）の途中失敗も、差分型の取り消し点で全体が戻る", () => {
  const w = fresh(), before = fingerprint(w.civ);
  defineCommand("test.boom", { authorities: [A.ADMIN], apply: (ww) => { const s = Object.values(ww.civ.states).find((x) => x.alive); s.pop = -1; delete ww.civ.treaties[Object.keys(ww.civ.treaties)[0] ?? "x"]; ww.civ.events.push({ eventId: "x" }); throw new Error("boom"); } });
  const r = dispatch(w, { type: "test.boom", authority: A.ADMIN }); assert.equal(r.ok, false); assert.equal(fingerprint(w.civ), before); delete COMMANDS["test.boom"];
});

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } console.log("\n全て成功");
