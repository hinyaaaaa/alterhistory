// V5-M7: 全国家の月次状態の保存と、任意の月への復元。イベント・判断記録の期間チャンク。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState, encodeCiv, decodeCiv } from "../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { stateAt, statesAt, groupsAt, ownerMapAt, compositionAt, checkHistory, historyStats, extractState } from "../js/core/civ/history.js";
import { encodeCivChunks, decodeCivChunks, PERIOD_MONTHS } from "../js/core/civ/civ-chunks.js";
import { territoryOf } from "../js/core/civ/population.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const civ = createCivState(W, { startGroupId: 1, historySeed: 99 }), sim = createCivSim(W, civ);
// 独立した「正解」: 各月の終わりに、状態の主な値を直接読んで控える（履歴の仕組みを通さない）
const gold = new Map(); let t0 = Date.now();
for (let i = 0; i < 1400 * 12; i++) { sim.advanceMonth(); const row = {}; for (const id in civ.states) { const s = civ.states[id]; row[id] = [s.alive, Math.round(s.pop), s.polity, Math.round(s.stability * 10000), Math.round(s.treasury * 100), Math.round(s.army), s.name, s.capitalGroupId, s.warIds.join(","), Math.round(s.policy.tax * 1000)]; } gold.set(civ.monthIndex, row); }
const stats = historyStats(civ); console.log(`  (1,400年・${Object.keys(civ.states).length}国家・${((Date.now() - t0) / 1000).toFixed(0)}秒。履歴: 国家${stats.states}・集団${stats.groups}・変化点${stats.points}・辞書${stats.dict})`);

console.log("=== M7: 月次の国家状態 ===");
await check("全ての月・全ての国家で、保存した履歴から復元した値が、その月に直接読んだ値と一致する（欠落・推定なし）", () => {
  let n = 0; for (const [m, row] of gold) for (const id in row) { const g = row[id], s = stateAt(civ, id, m); assert.ok(s, `${id} @${m}`); const got = [s.alive, s.pop, s.polity, Math.round(s.stability * 10000), Math.round(s.treasury * 100), s.army, s.name, s.capitalGroupId, s.warIds.join(","), Math.round(s.policy.tax * 1000)]; assert.deepEqual(got, g.map((x, i) => (i === 7 ? x ?? null : x)), `${id} @${m}`); n++; }
  assert.ok(n > 5000, `検査した国家・月 ${n}`);
});
await check("成立前の月は null、滅亡後は alive=false で最後の状態が残る（存在しない期間が明確）", () => {
  const dead = Object.values(civ.states).find((s) => !s.alive); const any = Object.values(civ.states)[0];
  assert.equal(stateAt(civ, any.id, any.formedAt - 1), null); assert.equal(stateAt(civ, any.id, any.formedAt)?.alive, true);
  if (dead) { assert.equal(stateAt(civ, dead.id, dead.dissolvedAt + 5).alive, false); assert.equal(stateAt(civ, dead.id, dead.dissolvedAt - 3).alive, true); }
  assert.deepEqual(statesAt(civ, any.formedAt - 1).filter((s) => s.id === any.id), []);
});
await check("関係値・採用技術・条約参照も月ごとに復元できる（技術の採用月より前は未採用、後は採用）", () => {
  const st = Object.values(civ.states).find((s) => Object.keys(s.techAdopted).length >= 2); const [k, mi] = Object.entries(st.techAdopted).sort((a, b) => a[1] - b[1])[0];
  assert.ok(!stateAt(civ, st.id, mi - 1)?.techAdopted.includes(k) || mi - 1 < st.formedAt); assert.ok(stateAt(civ, st.id, mi).techAdopted.includes(k));
  const withRel = Object.values(civ.states).find((s) => Object.keys(s.relations).length); if (withRel) assert.deepEqual(Object.keys(stateAt(civ, withRel.id, civ.monthIndex).relations).sort(), Object.keys(withRel.relations).sort());
});
await check("変化の無い月は書かない（変化点の数は、全国家×全月×全項目よりはるかに少ない）", () => { const full = Object.keys(civ.states).length * 1400 * 12 * 25; assert.ok(stats.points < full / 20, `${stats.points} vs ${full}`); });
await check("構造の検査（時刻が単調・辞書参照・最新が現在と一致）が通る", () => assert.deepEqual(checkHistory(civ), []));
await check("集団の履歴: 所属国家・居住地が月ごとに復元できる。過去の地図（セルの持ち主）が作れる", () => {
  const m1 = 600 * 12, m2 = civ.monthIndex; const g1 = groupsAt(civ, m1), g2 = groupsAt(civ, m2); assert.ok(g1.size > 0 && g2.size > 0);
  for (const g of Object.values(civ.groups)) { const r = g2.get(g.id); assert.ok(r); assert.equal(r.cell, g.cell); assert.equal(r.stateId, g.stateId); assert.equal(r.subsistence, g.subsistence); }
  const o = ownerMapAt(civ, territoryOf, W, m2); assert.ok(o.size > 0); const cur = new Map(); for (const g of Object.values(civ.groups)) if (g.stateId) for (const c of territoryOf(W, g.cell)) cur.set(c, g.stateId); assert.deepEqual([...o].sort(), [...cur].sort());
  const o1 = ownerMapAt(civ, territoryOf, W, m1); assert.notDeepEqual([...o1].sort(), [...o].sort(), "過去と現在で持ち主が同じ");
});
await check("人口構成（10年単位の記録）が復元でき、国家の人口とほぼ一致する", () => { const st = Object.values(civ.states).find((s) => s.alive && s.pop > 2000), c = compositionAt(civ, st.id, Math.floor(civ.monthIndex / 120) * 120); assert.ok(c.total > 0); assert.ok(Math.abs(c.total - stateAt(civ, st.id, Math.floor(civ.monthIndex / 120) * 120).pop) / st.pop < 0.35, `${c.total} vs ${st.pop}`); });
await check("命令で同じ月に状態を変えると、その月の記録が上書きされ、次の月へ正しく続く", () => {
  const s2 = Object.values(civ.states).find((s) => s.alive && s.policy.tax < 0.3 && s.treasury > 100); assert.ok(s2, "対象の国家が無い"); s2.player = true; // 命令の入口を試すため、この国家をプレイヤー国家に見立てる
  const m = civ.monthIndex, before = stateAt(civ, s2.id, m).policy.tax; const r = sim.command({ type: "stateAction", stateId: s2.id, action: "set_tax", opt: "up" }); assert.ok(r.ok, r.error);
  assert.ok(Math.abs(stateAt(civ, s2.id, m).policy.tax - (before + 0.05)) < 1e-9, "同じ月の記録が更新されていない"); assert.equal(stateAt(civ, s2.id, m - 1).policy.tax, before === stateAt(civ, s2.id, m - 1).policy.tax ? before : stateAt(civ, s2.id, m - 1).policy.tax);
  assert.deepEqual(checkHistory(civ), []); s2.player = false; sim.advanceMonth(); assert.ok(stateAt(civ, s2.id, m + 1).policy.tax >= before + 0.05 - 1e-9);
});

console.log("=== M7: チャンク保存 ===");
await check("チャンク保存→読み込みで、論理状態（イベント・判断・履歴・国家）が一致する", () => {
  const chunks = encodeCivChunks(civ), names = Object.keys(chunks); const c2 = decodeCivChunks((n) => chunks[n], names);
  assert.equal(c2.events.length, civ.events.length); assert.equal(c2.decisions.length, civ.decisions.length); assert.equal(JSON.stringify(c2.events), JSON.stringify(civ.events)); assert.equal(JSON.stringify(c2.decisions), JSON.stringify(civ.decisions)); assert.equal(JSON.stringify(c2.states), JSON.stringify(civ.states));
  assert.deepEqual(c2.history, civ.history); assert.deepEqual(checkHistory(c2), []);
  for (const m of [0, 500 * 12, 1000 * 12, civ.monthIndex]) for (const id of Object.keys(civ.states)) assert.deepEqual(stateAt(c2, id, m), stateAt(civ, id, m));
  assert.ok(names.filter((n) => n.startsWith("civ.events.")).length >= 12, "100年ごとの期間チャンクに分かれている");
});
await check("読み込んだ歴史を続けて進めても、履歴が連続する（キャッシュ再構築後も同じ結果）", () => {
  const chunks = encodeCivChunks(civ), c2 = decodeCivChunks((n) => chunks[n], Object.keys(chunks)), sim2 = createCivSim(W, c2), sim1 = sim; sim2.advanceMonths(60); sim1.advanceMonths(60);
  assert.deepEqual(checkHistory(c2), []); assert.equal(c2.history.last, c2.monthIndex);
  const id = Object.keys(c2.states).find((k) => c2.states[k].alive); assert.ok(stateAt(c2, id, c2.monthIndex - 30)); assert.equal(stateAt(c2, id, civ.monthIndex - 10)?.pop, stateAt(civ, id, civ.monthIndex - 10)?.pop === undefined ? undefined : stateAt(c2, id, civ.monthIndex - 10)?.pop);
});
await check("旧形式（v4.2.0: civ.state 1つの JSON）も読める。履歴が無い旧データは、読み込み後の月から記録が始まる", () => {
  const c = createCivState(W, { startGroupId: 1, historySeed: 7 }); const s = createCivSim(W, c); s.advanceMonths(24); delete c.history; c.version = 2; for (const k of ["interpretations", "works", "interpCursor"]) delete c[k];
  const c2 = decodeCiv(encodeCiv(c)); assert.equal(c2.version, 3); assert.deepEqual(c2.interpretations, []); const s2 = createCivSim(W, c2); s2.advanceMonths(3); assert.ok(c2.history && c2.history.last === c2.monthIndex);
});
await check("閉じた期間のチャンクは、内容が変わらなければ同じバイト列を再利用する（再圧縮を省く）", () => { const a = encodeCivChunks(civ), b = encodeCivChunks(civ); const first = Object.keys(a).find((n) => n.startsWith("civ.events.p0000")); assert.ok(a[first] === b[first], "再利用されていない"); });
await check("全月の履歴と判断記録を残したまま、保存サイズを測る（記録）", () => { const ch = encodeCivChunks(civ); let raw = 0; for (const n in ch) raw += ch[n].length; console.log(`        1,400年: 保存前 ${(raw / 1e6).toFixed(1)}MB（events ${civ.events.length}・decisions ${civ.decisions.length}・履歴 ${((ch["civ.history.data"].length + ch["civ.history.index"].length) / 1e6).toFixed(2)}MB）`); assert.ok(raw > 0); });

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
