// v5.2: 履歴の遅延読み込み（読み取り専用）。必要な期間だけ読み、全件を読んだ場合と同じ結果になること。月次復元・往復の検査。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";
import { encodeCivChunks, decodeCivChunks, PERIOD_MONTHS } from "../js/core/civ/civ-chunks.js";
import { openCivChunks, historyView } from "../js/core/civ/civ-lazy.js";
import { stateAt, groupsAt, compositionAt, checkHistory } from "../js/core/civ/history.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "v520-lazy", resolution: { targetCells: 6000 } });
const civ = createCivState(W, { startGroupId: 1, historySeed: 7 }), sim = createCivSim(W, civ);
sim.advanceMonths(450 * 12); // 5,400 か月 = 期間チャンク 5 つ（100 年ごと）
const ch = encodeCivChunks(civ), names = Object.keys(ch), get = (n) => ch[n];
console.log(`  (450年・イベント${civ.events.length}・判断${civ.decisions.length}・期間チャンク${names.filter((n) => /events\./.test(n)).length}つ)`);

console.log("=== 遅延読み込み ===");
await check("開いた時点では、イベント・判断の期間チャンクを 1 つも読まない（核と索引だけ）", () => {
  const lz = openCivChunks(get, names); assert.equal(lz.stats().parsedChunks, 0); assert.equal(lz.core.events.length, 0);
  assert.equal(lz.counts.events, civ.events.length); assert.equal(lz.counts.decisions, civ.decisions.length);
});
await check("範囲を指定したイベント・判断は、全件を読んだ場合と同じ（順序も含めて一致）", () => {
  const eager = decodeCivChunks(get, names), lz = openCivChunks(get, names);
  for (const [m0, m1] of [[0, 11], [PERIOD_MONTHS - 5, PERIOD_MONTHS + 5], [2400, 3700], [0, civ.monthIndex], [civ.monthIndex - 3, civ.monthIndex]]) {
    const inR = (x) => { const m = x.date.year * 12 + x.date.month - 1; return m >= m0 && m <= m1; };
    assert.deepEqual(lz.eventsBetween(m0, m1), eager.events.filter(inR), `イベント ${m0}-${m1}`);
    assert.deepEqual(lz.decisionsBetween(m0, m1), eager.decisions.filter(inR), `判断 ${m0}-${m1}`);
  }
});
await check("1 つの期間の中だけを調べるときは、その期間のチャンクしか読まない（イベント 1・判断 1）", () => {
  const lz = openCivChunks(get, names); lz.eventsBetween(1300, 1400); lz.decisionsBetween(1300, 1400);
  assert.equal(lz.stats().parsedChunks, 2);
});
await check("キャッシュは最近のものだけ（上限を超えたら古い期間を捨てる）・同じ範囲の再要求は読み直さない", () => {
  const lz = openCivChunks(get, names, { cachePeriods: 2 });
  lz.eventsBetween(0, 100); lz.eventsBetween(0, 100); assert.equal(lz.stats().parsedChunks, 1); assert.equal(lz.stats().cacheHits, 1);
  lz.eventsBetween(1300, 1400); lz.eventsBetween(2500, 2600); lz.eventsBetween(3700, 3800); assert.ok(lz.stats().cachedPeriods <= 2);
  lz.evict(); assert.equal(lz.stats().cachedPeriods, 0);
});
await check("件数の検査: 全期間を 1 つずつ読んで数えた件数が、保存時の件数と一致する", () => { const v = openCivChunks(get, names).verifyCounts(); assert.ok(v.ok, JSON.stringify(v)); assert.equal(v.events, civ.events.length); });
await check("期間の一覧が、保存されたチャンクと 1 対 1（イベント・判断とも欠落なし）", () => {
  const p = openCivChunks(get, names).periods(); assert.equal(p.filter((x) => x.kind === "events").length, names.filter((n) => /^civ\.events\./.test(n)).length); assert.equal(p.filter((x) => x.kind === "decisions").length, names.filter((n) => /^civ\.decisions\./.test(n)).length);
  assert.ok(p.every((x) => x.bytes > 0 && x.toMonth - x.fromMonth === PERIOD_MONTHS - 1));
});

console.log("=== 月次履歴の読み取り専用ビュー ===");
const view = openCivChunks(get, names).history(), vciv = { history: view }, eager = decodeCivChunks(get, names);
await check("系列はコピーなしの Float64Array（読み取り専用）で、構造の検査（時刻の単調・辞書の範囲）に通る", () => {
  assert.equal(view.readOnly, true); const any = Object.values(view.states)[0]; assert.ok(Object.values(any.f).every((a) => a instanceof Float64Array));
  assert.deepEqual(checkHistory({ history: view, monthIndex: -1, states: {} }), []);
});
await check("任意の月・全国家の復元が、元の履歴・全件読みの履歴と一致する（開始・中間・終端を含む 3,000 点）", () => {
  const ids = Object.keys(civ.states); let n = 0;
  for (let i = 0; i < 3000; i++) { const id = ids[(i * 7919) % ids.length], m = i < 3 ? [0, Math.floor(civ.monthIndex / 2), civ.monthIndex][i] : (i * 104729) % (civ.monthIndex + 1); const a = JSON.stringify(stateAt(civ, id, m)); assert.equal(JSON.stringify(stateAt(vciv, id, m)), a, `${id}@${m}`); assert.equal(JSON.stringify(stateAt(eager, id, m)), a); n++; }
  assert.equal(n, 3000);
});
await check("集団の復元・国家の人口構成も、ビューで元と一致する", () => {
  for (const m of [0, 600, 2400, civ.monthIndex]) { assert.deepEqual([...groupsAt(vciv, m)], [...groupsAt(civ, m)], `groups@${m}`); for (const id of Object.keys(civ.states).slice(0, 5)) assert.deepEqual(compositionAt(vciv, id, m), compositionAt(civ, id, m), `comp ${id}@${m}`); }
});
await check("索引と領域の長さが合わない・壊れたデータは、黙って読まず例外にする", () => {
  assert.throws(() => historyView(ch["civ.history.index"], ch["civ.history.data"].subarray(0, 800)), /長さ/);
  const bad = { ...ch }; delete bad["civ.history.data"]; assert.throws(() => openCivChunks((n) => bad[n], Object.keys(bad)).history(), /見つかりません/);
});
await check("旧形式（チャンクなし）は遅延読み込みせず、理由を返す", () => { const old = { "civ.state": new TextEncoder().encode(JSON.stringify({ version: 1 })) }; assert.throws(() => openCivChunks((n) => old[n], Object.keys(old)), /旧形式/); });

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
