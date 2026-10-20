// v4.0.0 / V4-M2: .ahmap v2 コンテナ。往復の一致・破損の検出・拡張チャンクの保持・チャンクの再利用。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { encodeAhmap2, decodeAhmap2, readAhmap2Manifest, Ahmap2Error, REQUIRED_CHUNKS, AHMAP2_MAGIC, crc32 } from "../js/core/world/ahmap2.js";

let failed = 0;
const acheck = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const rejects = async (bytes, re) => { try { await decodeAhmap2(bytes); } catch (e) { assert.ok(e instanceof Ahmap2Error, `Ahmap2Error ではない: ${e.name}: ${e.message}`); assert.match(e.message + " " + e.problems.join(" "), re); return; } assert.fail("読み込みが成功してしまった"); };
const world = () => generateWorld({ worldSeed: "ahmap-1", resolution: { targetCells: 6000 } });
const W = world();
const saved = await encodeAhmap2(W, { appVersion: "4.0.0-test", savedAt: "2026-10-20T00:00:00Z" });

console.log("=== 往復 ===");
await acheck("保存 → 読み込みで、地形・気候・水系・トポロジー・WorldSpec・初期集団・統計が一致する", async () => {
  const r = await decodeAhmap2(saved.bytes), w = r.world;
  assert.equal(w.hash, W.hash); assert.deepEqual(w.spec, W.spec); assert.deepEqual(w.entities.populations, W.entities.populations); assert.deepEqual(w.stats, W.stats);
  for (const k of Object.keys(W.cell)) assert.deepEqual(w.cell[k], W.cell[k], `cell.${k}`);
  for (const k of ["centerXYZ", "vertexXYZ", "neighborOffsets", "neighborIds", "cellVertexIds"]) assert.deepEqual(w.mesh[k], W.mesh[k], `mesh.${k}`);
});
await acheck("manifest: 形式版・スキーマ版・アプリ版・生成器の版・メッシュの版が別々に入る", async () => { const { manifest } = readAhmap2Manifest(saved.bytes); assert.equal(manifest.containerVersion, 1); assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.appVersion, "4.0.0-test"); assert.ok(manifest.generatorVersion.startsWith("4.")); assert.equal(manifest.meshVersion, "sphere-ico-1"); assert.equal(manifest.cellCount, W.mesh.cellCount); assert.equal(manifest.worldHash, W.hash); });
await acheck("必須チャンクがすべて manifest にあり、チャンクごとに型・要素数・圧縮・長さ・CRC を持つ", async () => { const { manifest } = readAhmap2Manifest(saved.bytes), names = new Set(manifest.chunks.map((c) => c.name)); for (const r of REQUIRED_CHUNKS) assert.ok(names.has(r), r); for (const c of manifest.chunks) { assert.ok(c.kind && c.codec && c.rawBytes >= 0 && c.storedBytes >= 0 && Number.isInteger(c.crc32), c.name); } });
await acheck("巨大な配列は JSON にせず型付き配列で持ち、gzip で小さくなる", async () => { const { manifest } = readAhmap2Manifest(saved.bytes), raw = manifest.chunks.reduce((s, c) => s + c.rawBytes, 0); assert.ok(saved.bytes.length < raw * 0.7, `${saved.bytes.length} / ${raw}`); assert.equal(manifest.chunks.find((c) => c.name === "cell.elevation").kind, "f32"); });
await acheck("読み込みは入力を書き換えない", async () => { const copy = saved.bytes.slice(); await decodeAhmap2(saved.bytes); assert.deepEqual(saved.bytes, copy); });
await acheck("同じ世界を保存し直すと、バイト列が一致する（決定的）", async () => assert.deepEqual((await encodeAhmap2(W, { appVersion: "4.0.0-test", savedAt: "2026-10-20T00:00:00Z" })).bytes, saved.bytes));

console.log("=== 破損の検出（黙って 0 に置き換えない）===");
await acheck("マジックが違う / 小さすぎる", async () => { const b = saved.bytes.slice(); b[0] = 0x58; await rejects(b, /マジック/); await rejects(new Uint8Array(4), /小さすぎ/); });
await acheck("途中で切れたファイル（保存中の中断）", async () => { await rejects(saved.bytes.slice(0, Math.floor(saved.bytes.length * 0.6)), /範囲外|破損|切れた/); await rejects(saved.bytes.slice(0, 40), /manifest|切れた/); });
await acheck("チャンク本体の 1 バイトの書き換えをチェックサムで検出する", async () => { const { manifest, payloadStart } = readAhmap2Manifest(saved.bytes), c = manifest.chunks.find((x) => x.name === "cell.elevation"), b = saved.bytes.slice(); b[payloadStart + c.offset + Math.floor(c.storedBytes / 2)] ^= 0xff; await rejects(b, /cell\.elevation/); });
await acheck("新しいコンテナ版のファイルは、読めない理由を示して拒否する", async () => { const b = saved.bytes.slice(); new DataView(b.buffer).setUint32(8, 99, true); await rejects(b, /新しいコンテナ版/); });
const retag = (bytes, edit) => { const { manifest, payloadStart } = readAhmap2Manifest(bytes); edit(manifest); const mb = new TextEncoder().encode(JSON.stringify(manifest)), out = new Uint8Array(16 + mb.length + (bytes.length - payloadStart)); out.set(bytes.subarray(0, 12)); new DataView(out.buffer).setUint32(12, mb.length, true); out.set(mb, 16); out.set(bytes.subarray(payloadStart), 16 + mb.length); return out; };
await acheck("必須チャンクの欠落を名前つきで報告する", async () => await rejects(retag(saved.bytes, (m) => { m.chunks = m.chunks.filter((c) => c.name !== "cell.biome"); }), /cell\.biome/));
await acheck("manifest のセル数が周波数と合わない", async () => await rejects(retag(saved.bytes, (m) => { m.cellCount += 1; }), /セル数/));
await acheck("値域の外（landWater=9）は、CRC が正しくても拒否する", async () => { const w = world(); w.cell.landWater[5] = 9; const s = await encodeAhmap2(w); await rejects(s.bytes, /landWater/); });
await acheck("参照が範囲外（riverTo）は拒否する", async () => { const w = world(); w.cell.riverTo[7] = w.mesh.cellCount + 5; const s = await encodeAhmap2(w); await rejects(s.bytes, /riverTo/); });
await acheck("内容が書き換わっていて世界のハッシュが合わない場合は拒否する", async () => { const w = world(); w.cell.elevation[100] += 500; const s = await encodeAhmap2(w); await rejects(s.bytes, /ハッシュ/); });
await acheck("トポロジーの破損（隣接の非対称）は拒否する", async () => { const w = world(); const a = w.mesh.neighborIds; const t = a[0]; a[0] = a[w.mesh.neighborOffsets[50]]; a[w.mesh.neighborOffsets[50]] = t; const { worldHash } = await import("../js/core/world/worldgen.js"); w.hash = worldHash(w); const s = await encodeAhmap2(w); await rejects(s.bytes, /トポロジー|隣接|整合/); });
await acheck("海に流れ込まない流路（行き止まり）は拒否する", async () => { const w = world(); let c = 0; while (w.cell.landWater[c] !== 1) c++; w.cell.riverTo[c] = -1; const { worldHash } = await import("../js/core/world/worldgen.js"); w.hash = worldHash(w); const s = await encodeAhmap2(w); await rejects(s.bytes, /流路|行き止まり|整合/); });

console.log("=== 拡張チャンクの保持・差分保存 ===");
await acheck("未知の拡張チャンクを保持し、再保存で戻す（v5 以降の追加情報を消さない）", async () => {
  const ext = { "extensions.future.history": Uint8Array.from([1, 2, 3, 4, 5]), "extensions.note": new TextEncoder().encode("メモ".repeat(200)) };
  const a = await encodeAhmap2(W, { extensions: ext, savedAt: "t" }), r = await decodeAhmap2(a.bytes);
  assert.deepEqual([...r.extensions.keys()].sort(), Object.keys(ext).sort()); for (const [k, v] of Object.entries(ext)) assert.deepEqual(r.extensions.get(k), v);
  const b = await encodeAhmap2(r.world, { extensions: Object.fromEntries(r.extensions), savedAt: "t" }); assert.deepEqual(b.bytes, a.bytes);
});
await acheck("更新していないチャンクは、前回の圧縮結果を再利用する（標高だけ変えると、他のチャンクは再圧縮しない）", async () => {
  const w2 = { ...W, cell: { ...W.cell, elevation: W.cell.elevation.map((v) => v) } }; w2.cell.elevation[3] += 1;
  const { worldHash } = await import("../js/core/world/worldgen.js"); w2.hash = worldHash(w2);
  const again = await encodeAhmap2(w2, { reuse: saved.chunkCache, savedAt: "2026-10-20T00:00:00Z", appVersion: "4.0.0-test" });
  assert.notEqual(again.chunkCache.get("cell.elevation").stored, saved.chunkCache.get("cell.elevation").stored);
  for (const n of ["cell.biome", "geom.neighborIds", "cell.riverTo"]) assert.equal(again.chunkCache.get(n).stored, saved.chunkCache.get(n).stored, n);
});
await acheck("crc32 の既知値（\"123456789\" → CBF43926）", async () => assert.equal(crc32(new TextEncoder().encode("123456789")).toString(16).toUpperCase(), "CBF43926"));

console.log("=== 標準規模（約 250,000 セル）===");
{
  const big = generateWorld({ worldSeed: "standard-world-1" });
  let t = performance.now(); const s = await encodeAhmap2(big, { appVersion: "4.0.0-test" }); const tSave = performance.now() - t;
  t = performance.now(); const r = await decodeAhmap2(s.bytes); const tLoad = performance.now() - t;
  const raw = s.manifest.chunks.reduce((a, c) => a + c.rawBytes, 0);
  console.log(`  情報  保存 ${tSave.toFixed(0)} ms／読み込み（展開＋全検証）${tLoad.toFixed(0)} ms／ファイル ${(s.bytes.length / 1e6).toFixed(1)} MB（非圧縮 ${(raw / 1e6).toFixed(1)} MB）／この端末（Surface Go 4 ではない）`);
  await acheck("標準規模の世界が、保存 → 読み込みで一致する", async () => { assert.equal(r.world.hash, big.hash); assert.deepEqual(r.world.cell.elevation, big.cell.elevation); assert.deepEqual(r.world.mesh.neighborIds, big.mesh.neighborIds); });
}

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
