// v5.1 安定化: 保存→読み込み→再保存の往復・未知拡張の保持・文明の履歴の往復・繰り返しでのメモリの増え方。
import assert from "node:assert/strict";
import v8 from "node:v8";
import vm from "node:vm";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";
import { encodeCivChunks } from "../js/core/civ/civ-chunks.js";
import { saveMapBytes, loadMapBytes } from "../js/io/ahmap-file.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
v8.setFlagsFromString("--expose-gc"); const gc = vm.runInNewContext("gc");
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const eqBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const civ = createCivState(W, { startGroupId: 1, historySeed: 99 }); createCivSim(W, civ).advanceMonths(36);
const mk = () => { const m = worldToMap(W); m.civ = civ; return m; };
const UNKNOWN = "x.future-extension", payload = new Uint8Array([1, 2, 3, 250, 251, 252, 0, 7]);

console.log("=== 保存・読み込み・再保存の往復 ===");
const m0 = mk(); m0.fileExt = { extensions: { [UNKNOWN]: payload }, chunkCache: null };
const bytes1 = await saveMapBytes(m0, { appVersion: "t", savedAt: "2026-10-25" });
const r1 = await loadMapBytes(bytes1);
await check("未知の拡張チャンクが、読み込みで保持される", () => { const g = r1.map.fileExt.extensions[UNKNOWN]; assert.ok(g && eqBytes(g, payload)); });
const bytes2 = await saveMapBytes(r1.map, { appVersion: "t", savedAt: "2026-10-25" });
const r2 = await loadMapBytes(bytes2);
await check("再保存→再読み込みでも、未知の拡張チャンクが同じバイト列で残る", () => { assert.ok(eqBytes(r2.map.fileExt.extensions[UNKNOWN] ?? new Uint8Array(), payload)); });
await check("世界のハッシュが、往復しても変わらない", () => { assert.equal(r1.map.world.hash, W.hash); assert.equal(r2.map.world.hash, W.hash); });
await check("警告なしで読み込める（履歴の欠落を黙って許さない）", () => { assert.deepEqual(r1.warnings.filter((w) => /読めなかった|欠落/.test(w)), []); });
await check("文明の履歴（期間チャンク）が、往復してバイト単位で同じ", () => {
  const a = encodeCivChunks(civ), b = encodeCivChunks(r2.map.civ), ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  assert.deepEqual(kb, ka); for (const k of ka) assert.ok(eqBytes(a[k], b[k]), `チャンク ${k} が違う`);
});
const cnt = (x) => Array.isArray(x) ? x.length : x instanceof Map ? x.size : x && typeof x === "object" ? Object.keys(x).length : -1;
await check("文明の日付・集団・出来事・履歴の件数が、往復しても同じ（空でないことも確かめる）", () => {
  const c2 = r2.map.civ; assert.deepEqual(c2.date, civ.date);
  for (const [name, a, b] of [["集団", civ.groups, c2.groups], ["出来事", civ.events, c2.events], ["履歴の集団", civ.history.groups, c2.history.groups]]) {
    assert.ok(cnt(a) > 0, `${name}が空（検査が成り立たない）`); assert.equal(cnt(b), cnt(a), `${name}の件数`);
  }
  assert.equal(String(c2.history.last), String(civ.history.last));
});
const bytes3 = await saveMapBytes(r2.map, { appVersion: "t", savedAt: "2026-10-25" });
await check("2回目と3回目の保存は同じ大きさ（保存するたびに膨らまない）", () => assert.equal(bytes3.length, bytes2.length, `${bytes2.length} → ${bytes3.length}`));
await check("チャンクの再利用表は、保存を重ねても増えない", () => { assert.equal(r2.map.fileExt.chunkCache.size, r1.map.fileExt.chunkCache.size); });

console.log("=== 未対応のファイルを黙って読み込まない ===");
await check("壊れたバイト列は、読み込みに失敗する（空の世界を返さない）", async () => { const bad = bytes1.slice(); for (let i = 200; i < 260; i++) bad[i] ^= 0xff; await assert.rejects(() => loadMapBytes(bad)); });
await check("先頭が違う形式（Azgaar など）は、理由つきで拒否する", async () => { await assert.rejects(() => loadMapBytes(new Uint8Array([49, 46, 49, 53, 51, 124, 0, 0, 0, 0])), /読み込めません/); });
await check("途中で切れたファイルは、読み込みに失敗する", async () => { await assert.rejects(() => loadMapBytes(bytes1.slice(0, Math.floor(bytes1.length / 2)))); });

console.log("=== 繰り返しの保存・読み込みでメモリが増え続けない ===");
let cur = r2.map;
const cycle = async () => { const b = await saveMapBytes(cur, { appVersion: "t", savedAt: "2026-10-25" }); cur = (await loadMapBytes(b)).map; };
for (let i = 0; i < 4; i++) await cycle(); // ならし
const h0 = heap(); { const probe = await loadMapBytes(bytes2); void probe; } const oneMap = Math.max(1, heap() - h0 + 1); // 1 回分の地図が占める量の目安（解放後は0に近いので下限1）
const base = heap();
for (let i = 0; i < 25; i++) await cycle();
const grown = heap() - base, wBytes = Math.max(oneMap, 2e6);
console.log(`      25 往復後のヒープ増加 ${(grown / 1e6).toFixed(2)} MB（保存 ${(bytes2.length / 1e6).toFixed(2)} MB）`);
await check("25 往復して、ヒープの増加が地図 1 つ分程度に収まる（往復ごとに残るなら 25 倍になる）", () => assert.ok(grown < Math.max(wBytes, 4 * bytes2.length, 12e6), `増加 ${(grown / 1e6).toFixed(1)} MB`));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
