// v5.3 UI: 大規模な歴史の増分インデックス。10,000 年・数百万件の合成データで、正しさ（素朴な全走査との一致）と応答時間を確かめる。
//   時間の閾値は開発環境のもの（Surface Go 4 の実測ではない）。緩めない。超えたら索引の設計を直す。
import assert from "node:assert/strict";
import { createEventIndex, lowerBound } from "../js/ui/v53/scale-index.js";
import { categoryOf } from "../js/ui/v53/categories.js";

let failed = 0; const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const KEY = new Set(["state_formed", "state_dissolved", "war_declared", "war_ended", "disaster_struck", "climate_shift", "tech_discovered", "magic_org_founded", "religion_founded"]);
const KINDS = ["state_formed", "war_declared", "war_ended", "treaty_signed", "disaster_struck", "tech_discovered", "culture_split", "magic_incident", "group_migrated", "leader_succession", "settlement_grown", "state_dissolved"];

// 乱数（再現性のため固定）
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function synth(years, perMonth) {
  const events = [], decisions = []; let id = 0;
  for (let m = 0; m < years * 12; m++) {
    const k = perMonth;
    for (let j = 0; j < k; j++) {
      const kind = KINDS[Math.floor(rnd() * KINDS.length)];
      events.push({ eventId: `event_${id}`, date: { year: Math.floor(m / 12), month: (m % 12) + 1 }, kind, title: `${kind}#${id++}${rnd() < 0.01 ? "・東方" : ""}`, participants: [{ entityId: `state_${Math.floor(rnd() * 1200)}`, role: "actor" }], causes: [] });
    }
  }
  return { events, decisions };
}
const mk = () => createEventIndex({ classify: categoryOf, isKey: (k) => KEY.has(k), sliceMs: 1e9 });
const naive = (civ, { cat = "", query = "", view = null, since = null, entityId = null } = {}) => civ.events.filter((e) => (view == null || e.date.year * 12 + e.date.month - 1 <= view) && (since == null || e.date.year * 12 + e.date.month - 1 >= since) && (!cat || categoryOf(e.kind).id === cat) && (!query || e.title.includes(query)) && (!entityId || e.participants.some((p) => p.entityId === entityId))).reverse();

console.log("=== 増分インデックス: 正しさ（素朴な全走査と一致） ===");
const small = synth(300, 6);
const ix = mk();
check("分類・検索・期間・見ている月・関与者のどの組み合わせでも、素朴な全走査と同じ並び（新しい順）・同じ件数", () => {
  for (const opts of [{}, { cat: "war" }, { query: "東方" }, { cat: "state", query: "formed" }, { view: 1500 }, { since: 2000 }, { cat: "disaster", view: 2400, since: 600 }, { entityId: "state_17" }, { entityId: "state_17", cat: "war" }, { query: "存在しない語" }]) {
    const want = naive(small, opts), got = ix.page(small, { ...opts, offset: 0, limit: 1e7 });
    assert.equal(got.total, want.length, JSON.stringify(opts)); assert.deepEqual(got.rows.map((e) => e.eventId), want.map((e) => e.eventId), JSON.stringify(opts));
    if (want.length > 7) assert.deepEqual(ix.page(small, { ...opts, offset: 5, limit: 2 }).rows.map((e) => e.eventId), want.slice(5, 7).map((e) => e.eventId));
  }
});
check("末尾に増えた分だけ取り込み（作り直さない）、増えた後も一致する。縮んだら作り直す", () => {
  const before = ix.counts().events; assert.equal(before, small.events.length);
  const base = small.events.length; for (let i = 0; i < 50; i++) small.events.push({ eventId: `event_x${i}`, date: { year: 300, month: 1 + (i % 12) }, kind: "war_declared", title: `追加${i}`, participants: [], causes: [] });
  const r = ix.page(small, { cat: "war", limit: 3 }); assert.equal(r.rows[0].eventId, `event_x49`); assert.equal(ix.total(), base + 50);
  assert.equal(ix.page(small, { cat: "war", limit: 1e7 }).total, naive(small, { cat: "war" }).length);
  small.events.length = base; assert.equal(ix.page(small, { limit: 1 }).total, base); assert.equal(ix.total(), base);
});
check("見ている月（過去）は、その月までの出来事だけを数え、月が単調でなくても壊れない（異常データの保険）", () => {
  const c = { events: [{ eventId: "a", date: { year: 5, month: 1 }, kind: "war_declared", title: "a", participants: [], causes: [] }, { eventId: "b", date: { year: 3, month: 1 }, kind: "war_declared", title: "b", participants: [], causes: [] }, { eventId: "c", date: { year: 9, month: 1 }, kind: "war_declared", title: "c", participants: [], causes: [] }], decisions: [] };
  const x = mk(); assert.equal(x.page(c, { limit: 9 }).total, 3); assert.equal(x.isMonotone(), false); assert.equal(x.page(c, { view: 5 * 12 + 11, limit: 9 }).total, 2);
});
check("検索が時間切れで途中になっても、続けて呼べば必ず最後まで進み、最終結果は全走査と一致する", () => {
  const x = createEventIndex({ classify: categoryOf, isKey: (k) => KEY.has(k), sliceMs: 0 }); let r, guard = 0;
  do { r = x.page(small, { query: "東方", limit: 1e7 }); guard++; } while (r.pending && guard < 10000);
  assert.ok(!r.pending); assert.deepEqual(r.rows.map((e) => e.eventId), naive(small, { query: "東方" }).map((e) => e.eventId)); assert.ok(guard > 1, "分割して進んだ");
});
check("年表の目印: 広い範囲でも狭い範囲でも、区間ごとの件数の合計が元の目印の数と一致する", () => {
  const x = mk(); const wantAll = small.events.filter((e) => KEY.has(e.kind)).length;
  const wide = x.bandBuckets(small, { from: 0, to: 300 * 12, buckets: 120 }); assert.ok(wide.length <= 120); assert.equal(wide.reduce((a, b) => a + b.n, 0), wantAll);
  const narrow = x.bandBuckets(small, { from: 100 * 12, to: 130 * 12, buckets: 90 }); const wantN = small.events.filter((e) => KEY.has(e.kind) && e.date.year >= 100 && e.date.year < 131 && e.date.year * 12 + e.date.month - 1 <= 130 * 12).length;
  assert.equal(narrow.reduce((a, b) => a + b.n, 0), wantN); assert.ok(narrow.every((b, i, a) => i === 0 || a[i - 1].index < b.index));
});
check("lowerBound: 境界値", () => { const a = [1, 3, 3, 5]; assert.equal(lowerBound(a, 0), 0); assert.equal(lowerBound(a, 3), 1); assert.equal(lowerBound(a, 4), 3); assert.equal(lowerBound(a, 9), 4); });

console.log("=== 大規模: 10,000 年・約 300 万件 ===");
const t0 = Date.now(); const big = synth(10000, 25); const tGen = Date.now() - t0;
console.log(`  （合成: ${big.events.length.toLocaleString("ja-JP")} 件 / ${tGen} ms）`);
const bx = mk();
let tBuild = 0;
check("初回の取り込み（300 万件）が数秒以内。以後の増分は件数に比例しない", () => {
  const t = Date.now(); bx.sync(big); tBuild = Date.now() - t; console.log(`       取り込み ${tBuild} ms`); assert.ok(tBuild < 8000, `${tBuild}ms`);
  const t2 = Date.now(); for (let i = 0; i < 100; i++) big.events.push({ eventId: `event_n${i}`, date: { year: 10000, month: 1 }, kind: "war_declared", title: "n", participants: [], causes: [] }); bx.sync(big); assert.ok(Date.now() - t2 < 50);
});
const time = (f, n = 20) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(i); return Number(process.hrtime.bigint() - t) / 1e6 / n; };
check("一覧のページ取得（全件・分類別・期間・過去の月）は、件数に関係なく 1 ms 未満（平均）", () => {
  const rows = [["全件", (i) => bx.page(big, { offset: i * 100000, limit: 60 })], ["分類", (i) => bx.page(big, { cat: "war", offset: i * 30000, limit: 60 })], ["期間", (i) => bx.page(big, { since: 9000 * 12, offset: i * 1000, limit: 60 })], ["過去", (i) => bx.page(big, { view: 5000 * 12, offset: i * 1000, limit: 60 })]];
  for (const [name, f] of rows) { const ms = time(f); console.log(`       ${name}: ${ms.toFixed(3)} ms`); assert.ok(ms < 1, `${name} ${ms}`); }
  assert.equal(bx.page(big, {}).total, big.events.length);
});
check("年表の目印: 10,000 年の全体でも 5 ms 未満。件数の合計は一致する", () => {
  const ms = time(() => bx.bandBuckets(big, { from: 0, to: 10000 * 12, buckets: 160 }), 10); console.log(`       目印: ${ms.toFixed(2)} ms`); assert.ok(ms < 5, `${ms}`);
  const b = bx.bandBuckets(big, { from: 0, to: 10000 * 12, buckets: 160 }), want = big.events.filter((e) => KEY.has(e.kind) && e.date.year < 10000).length; assert.ok(b.reduce((a, c) => a + c.n, 0) >= want);
});
check("検索（300 万件のタイトル）は、時間を区切って進み、完了後は結果が即座に引ける。件数は全走査と一致する", () => {
  const x = createEventIndex({ classify: categoryOf, isKey: (k) => KEY.has(k), sliceMs: 6 }); x.sync(big);
  let calls = 0, r; const t = Date.now(), durs = [];
  do { const a = process.hrtime.bigint(); r = x.page(big, { query: "東方", limit: 40 }); durs.push(Number(process.hrtime.bigint() - a) / 1e6); calls++; } while (r.pending && calls < 100000);
  durs.sort((a, b) => a - b); const p50 = durs[Math.floor(durs.length / 2)], p95 = durs[Math.floor(durs.length * 0.95)], worst = durs.at(-1);
  console.log(`       検索 完了まで ${Date.now() - t} ms・${calls} 回・p50 ${p50.toFixed(1)} ms・p95 ${p95.toFixed(1)} ms・最大 ${worst.toFixed(1)} ms（最大は 300 万件のオブジェクトを抱えた GC を含む）`);
  assert.ok(!r.pending); assert.equal(r.total, big.events.filter((e) => e.title.includes("東方")).length); assert.ok(p50 < 25, `p50 ${p50}ms`); assert.ok(p95 < 60, `p95 ${p95}ms`); assert.ok(worst < 150, `最大 ${worst}ms`);
  assert.ok(time(() => x.page(big, { query: "東方", offset: 100, limit: 40 }), 50) < 1);
});
check("国家ごとの出来事（関与者）は、全件を走査せずに引ける", () => {
  bx.page(big, { entityId: "state_0", limit: 1 }); // 関与者の索引（本体の graphIndex）は初回に 1 度だけ作られ、以後は増分で保たれる
  const ms = time((i) => bx.page(big, { entityId: `state_${i % 1200}`, limit: 20 }), 40); console.log(`       関与者: ${ms.toFixed(3)} ms`); assert.ok(ms < 2, `${ms}`);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
