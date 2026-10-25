// v5.3 UI: 画面を持たない部分（影響度・旧新対応表・Obsidian 分割・PNG 説明・Chronicle 文明史章・アダプター契約）。
import assert from "node:assert/strict";
import { evaluateImpact, tierOf, MAJOR_THRESHOLD } from "../js/ui/v53/impact.js";
import { DOMAINS, LEGACY_MIGRATION, domainById } from "../js/ui/v53/domains.js";
import { HUB_SECTIONS } from "../js/ui/hub.js";
import { splitIntoParts, verifyParts } from "../js/ui/v53/export/obsidian-split.js";
import { describePng, PNG_KINDS } from "../js/ui/v53/export/png-meta.js";
import { civChronicleChunks } from "../js/ui/v53/export/civ-chronicle.js";
import { validateAdapter } from "../js/ui/v53/adapters/contract.js";
import { createMockAdapter } from "../js/ui/v53/adapters/mock-adapter.js";
import { createUiState } from "../js/ui/v53/ui-state.js";
import { fmtMonth, fmtNum, monthOf } from "../js/ui/v53/format.js";
import { categoryOf } from "../js/ui/v53/categories.js";

let failed = 0; const check = async (l, fn) => { try { await fn(); console.log(`  OK   ${l}`); } catch (e) { failed++; console.log(`  FAIL ${l}: ${String(e.message).split("\n")[0]}`); } };

console.log("=== 影響度（重大イベント） ===");
await check("種類だけでは重大にならない（基本値は閾値未満）", () => { for (const k of ["state_formed", "state_dissolved", "war_declared", "war_ended", "disaster_struck", "tech_discovered"]) assert.equal(evaluateImpact({ kind: k }, { states: 10 }).major, false, k); });
await check("世界規模に対する割合で決まる: 同じ『1国の滅亡』でも、3国の世界では重大・200国の世界では軽微", () => {
  const small = evaluateImpact({ kind: "state_dissolved", impact: { actorPopShare: 0.33, actorCount: 1, territoryShare: 0.3 } }, { states: 3 });
  const big = evaluateImpact({ kind: "state_dissolved", impact: { actorPopShare: 0.002, actorCount: 1, territoryShare: 0.002 } }, { states: 200 });
  assert.equal(small.major, true); assert.equal(big.major, false); assert.equal(tierOf(small), "large"); assert.notEqual(tierOf(big), "large");
});
await check("人口の被害: 世界人口の 0.1% の災害は通知止まり、12% なら重大", () => { assert.equal(evaluateImpact({ kind: "disaster_struck", impact: { popLossShare: 0.001 } }).major, false); assert.equal(evaluateImpact({ kind: "disaster_struck", impact: { popLossShare: 0.12, ripple: 3 } }).major, true); });
await check("大国どうしの戦争の開始は重大・小国どうしは重大でない / プレイヤーが当事者だと加点", () => {
  const big = evaluateImpact({ kind: "war_declared", impact: { actorPopShare: 0.45, actorCount: 3, ripple: 3 } }, { states: 8 }), tiny = evaluateImpact({ kind: "war_declared", impact: { actorPopShare: 0.01, actorCount: 2 } }, { states: 40 });
  assert.equal(big.major, true); assert.equal(tiny.major, false);
  const a = evaluateImpact({ kind: "war_ended", impact: { actorPopShare: 0.2 } }), b = evaluateImpact({ kind: "war_ended", impact: { actorPopShare: 0.2, player: true } }); assert.ok(b.score > a.score);
});
await check("理由が内訳として返る（なぜ重大かを画面に出せる）・値は範囲外でも暴れない", () => { const r = evaluateImpact({ kind: "war_declared", impact: { actorPopShare: 9, popLossShare: -4, territoryShare: NaN } }, {}); assert.ok(r.reasons.length >= 1 && r.reasons.every((x) => x.label && x.value > 0)); assert.ok(Number.isFinite(r.score)); assert.ok(MAJOR_THRESHOLD > 0); });

console.log("=== 旧 → 新の機能対応表 ===");
await check("現行ハブ（js/ui/hub.js）の全項目が、対応表に載っている（移し忘れがない）", () => {
  const legacy = HUB_SECTIONS.flatMap((s) => s.items.map((i) => i.win ?? i.id)); const mapped = new Set(LEGACY_MIGRATION.map((x) => x.legacy));
  const missing = legacy.filter((k) => !mapped.has(k)); assert.deepEqual(missing, [], `未対応: ${missing.join(", ")}`);
});
await check("対応先は実在する領域。廃止は理由つき。領域の id は重複しない", () => {
  for (const m of LEGACY_MIGRATION) { if (m.disposition === "moved") assert.ok(domainById(m.to), `${m.legacy} → ${m.to}`); else { assert.equal(m.disposition, "retired"); assert.ok(m.note?.length > 5); } }
  assert.equal(new Set(DOMAINS.map((d) => d.id)).size, DOMAINS.length); assert.ok(DOMAINS.every((d) => d.glyph?.length === 1 && d.label && d.tip));
  for (const need of ["world", "state", "diplomacy", "war", "economy", "tech", "culture", "magic", "history", "export", "settings"]) assert.ok(domainById(need), need);
});

console.log("=== Obsidian の分割 ===");
const mkFiles = (n, size = 300) => Array.from({ length: n }, (_, i) => ({ path: `W/n/${String(i).padStart(5, "0")}.md`, data: "x".repeat(size + (i % 7)) }));
const fakeZip = async (files) => new TextEncoder().encode(files.map((f) => f.path).join("\n"));
const collect = async (it) => { const out = []; for await (const p of it) out.push(p); return out; };
await check("上限を超えると複数に分かれ、全ファイルが 1 回ずつ・順序どおりに入る", async () => {
  const parts = await collect(splitIntoParts(mkFiles(1000), { root: "W", zip: fakeZip, maxPartBytes: 50_000, maxPartFiles: 1e9 })); assert.ok(parts.length >= 5);
  assert.deepEqual(verifyParts(parts, { expectedFiles: 1000 }), []); assert.deepEqual(parts.flatMap((p) => p.entries.map((e) => e.path)), mkFiles(1000).map((f) => f.path));
  assert.deepEqual(parts.map((p) => p.index), parts.map((_, i) => i + 1)); assert.equal(parts.filter((p) => p.final).length, 1); assert.ok(parts.at(-1).final);
  for (const p of parts) assert.ok(p.rawBytes <= 50_000 || p.fileCount === 1);
});
await check("件数の上限でも分かれる・小さければ 1 つのまま", async () => { assert.equal((await collect(splitIntoParts(mkFiles(100), { root: "W", zip: fakeZip, maxPartFiles: 30 }))).length, 4); assert.equal((await collect(splitIntoParts(mkFiles(20), { root: "W", zip: fakeZip }))).length, 1); });
await check("各パートに連番マニフェスト、最後に全体の索引が入る", async () => {
  const seen = []; const zip = async (files) => { seen.push(files.map((f) => f.path)); return new Uint8Array(1); };
  const parts = await collect(splitIntoParts(mkFiles(50), { root: "W", zip, maxPartFiles: 20 })); assert.equal(seen.length, 3);
  seen.forEach((paths, i) => assert.ok(paths.includes(`W/_parts/part-${String(i + 1).padStart(3, "0")}.json`))); assert.ok(seen.at(-1).includes("W/_parts/index.json")); assert.ok(!seen[0].includes("W/_parts/index.json")); assert.equal(parts.length, 3);
});
await check("同じパスが 2 回来たら黙って上書きせずエラー・中断で止まる", async () => {
  await assert.rejects(() => collect(splitIntoParts([...mkFiles(3), mkFiles(1)[0]], { root: "W", zip: fakeZip })), /2 回/);
  const ac = new AbortController(); ac.abort(); await assert.rejects(() => collect(splitIntoParts(mkFiles(5), { root: "W", zip: fakeZip, signal: ac.signal })), (e) => e.name === "AbortError");
});
await check("検査は、欠番・重複・途中切れ・件数違いを見つける", async () => {
  const parts = await collect(splitIntoParts(mkFiles(100), { root: "W", zip: fakeZip, maxPartFiles: 30 }));
  assert.ok(verifyParts(parts.filter((p) => p.index !== 2)).some((x) => /連番/.test(x))); assert.ok(verifyParts(parts.slice(0, -1)).some((x) => /最終印|途中/.test(x)));
  const dup = parts.map((p) => ({ ...p, entries: p.entries.map((e) => ({ ...e })) })); dup[1].entries[0].path = dup[0].entries[0].path; assert.ok(verifyParts(dup).some((x) => /重複/.test(x)));
  assert.ok(verifyParts(parts, { expectedFiles: 99 }).some((x) => /件数/.test(x))); assert.deepEqual(verifyParts([]).length, 1);
});

console.log("=== PNG の説明・Chronicle・アダプター契約 ===");
await check("PNG: どの状態の画像かが、年月・レイヤー・投影つきで説明される", () => {
  const d = describePng({ kind: "territory", month: monthOf(312, 4), worldName: "テスト", layers: [{ label: "国家", on: true }], legendCount: 5 }); assert.match(d.captionLines.join("\n"), /312年4月/); assert.match(d.captionLines.join("\n"), /投影/); assert.match(d.summary, /5 国/);
  const c = describePng({ kind: "current", month: 0, layers: [{ label: "国家", on: true }, { label: "河川", on: false }] }); assert.match(c.summary, /国家/); assert.ok(!/河川/.test(c.summary)); assert.equal(PNG_KINDS.length, 2);
});
await check("Chronicle の文明史章: 国家・戦争・出来事（原因つき）・AI判断を、範囲指定でも間引かずに書く", () => {
  const civ = { states: { s1: { id: "s1", name: "甲国", formedAt: 100, alive: true, via: "city_state", player: true }, s2: { id: "s2", name: "乙国", formedAt: 120, dissolvedAt: 500, alive: false, via: "agri_union" } }, wars: { w1: { id: "w1", aggressor: "s1", defender: "s2", sides: { a: ["s1"], d: ["s2"] }, startedAt: 300, endedAt: 500, outcome: "aggressor_victory" } },
    events: [{ eventId: "event_1", date: { year: 25, month: 5 }, kind: "state_formed", title: "甲国が成立", participants: [{ entityId: "s1", role: "state" }], causes: [] }, { eventId: "event_2", date: { year: 25, month: 6 }, kind: "war_declared", title: "甲国が乙国に宣戦", participants: [{ entityId: "s1", role: "belligerent" }], causes: [{ targetId: "event_1", relation: "caused_by", basis: "direct" }] }],
    decisions: [{ decisionId: "dec_1", date: { year: 25, month: 6 }, actorId: "s1", type: "declare_war", chosen: { key: "declare_war", target: "s2" } }] };
  const all = civChronicleChunks(civ, { worldName: "W" }).join(""); for (const t of ["甲国", "乙国", "event_1", "event_2", "caused_by: event_1（direct）", "dec_1", "対象 乙国", "記録された先行事象なし"]) assert.ok(all.includes(t), t);
  const cut = civChronicleChunks(civ, { fromMonth: monthOf(25, 6), toMonth: monthOf(25, 6) }).join(""); assert.ok(cut.includes("event_2") && !cut.includes("event_1 ")); assert.ok(cut.includes("範囲外を含む総数"));
});
await check("モックはアダプター契約を満たし、ほかの形は不足として検出される", () => { assert.deepEqual(validateAdapter(createMockAdapter({ years: 5 })), []); assert.ok(validateAdapter({}).length >= 20); const a = createMockAdapter({ years: 5 }); delete a.exports.png; assert.deepEqual(validateAdapter(a), ["exports.png"]); });
await check("UI状態: 選択の履歴（戻る）・同じ対象は積まない・領域を指定して切り替える", () => {
  const ui = createUiState(); ui.select({ kind: "state", id: "a" }); ui.select({ kind: "state", id: "a" }); ui.select({ kind: "war", id: "w" }, { domain: "war" }); assert.equal(ui.get().trail.length, 1); assert.equal(ui.get().domain, "war");
  assert.equal(ui.back(), true); assert.equal(ui.get().selection.id, "a"); assert.equal(ui.back(), false);
});
await check("整形: 月・数値・分類", () => { assert.equal(fmtMonth(monthOf(312, 4)), "312年4月"); assert.equal(fmtMonth(monthOf(0, 1)), "0年1月"); assert.equal(fmtNum(412_0000), "412万"); assert.equal(fmtNum(12), "12"); assert.equal(categoryOf("war_declared").id, "war"); assert.equal(categoryOf("xxx").id, "record"); });
console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
