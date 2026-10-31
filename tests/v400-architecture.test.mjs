// v4.0.0 / V4-M1・M7: 球面世界の境界（import の向き・DOM 非依存）と、Worker の通信規約・生成サービス（中断・フォールバック）。
// v5.0.0: 世界生成を国家運営層と同じアプリの 1 機能にしたため、「別の画面として隔離」は廃止。一方向の依存（world → なし）と入口の限定は維持する。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const acheck = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const importsOf = (file) => [...readFileSync(file, "utf8").matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const rel = (f) => path.relative(root, f).replaceAll("\\", "/");

console.log("=== 旧モデルとの隔離 ===");
const coreWorld = walk(path.join(root, "js/core/world")).filter((f) => f.endsWith(".js"));
await acheck("js/core/world は、js/core/world の中だけを import する（旧モデル・DOM・UI・入出力に依存しない）", () => {
  for (const f of coreWorld) for (const imp of importsOf(f)) { assert.ok(imp.startsWith("./"), `${rel(f)} が ${imp} を import している`); assert.ok(coreWorld.some((g) => path.resolve(path.dirname(f), imp) === g), `${rel(f)} の import ${imp} が js/core/world の外`); }
});
await acheck("js/core/world は、DOM・window・localStorage・Math.random・Date.now を使わない（決定的な純粋ロジック）", () => {
  for (const f of coreWorld) { const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); for (const bad of [/\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/]) assert.ok(!bad.test(src), `${rel(f)} に ${bad}`); }
});
await acheck("[v5.0.0 の決定] 球面世界（core/world）は国家運営層を知らない（一方向）。国家運営層から球面世界への入口は、橋渡し（core/world-bridge.js）と、.ahmap v2 の保存（io/ahmap-file.js）だけ", () => {
  const legacy = [...walk(path.join(root, "js/core")), ...walk(path.join(root, "js/io"))].filter((f) => f.endsWith(".js") && !f.includes("/core/world/"));
  const gate = new Set(["js/core/world-bridge.js", "js/io/ahmap-file.js", "js/core/wcde/config.js", "js/core/wcde/world.js" /* v6: WCDE は球面世界と文明層の上に立つ層。世界設定の検証と生成の入口だけが球面世界を import する */]);
  for (const f of legacy) if (!gate.has(rel(f))) for (const imp of importsOf(f)) assert.ok(!/(^|\/)world\//.test(imp) && !/world-(actions|service|workspace)/.test(imp), `${rel(f)} が ${imp} を直接 import`);
  const allowed = new Set(["js/main.js", "js/render/viewport.js" /* v5.2: 投影ヘルパー（純粋）だけを使う */, "js/ui/v53/adapters/live-adapter.js" /* v5.3: セルのラスタ化（純粋なヘルパー）だけを使う */, "js/core/world-bridge.js", "js/io/ahmap-file.js", "js/app/actions.js", "js/app/world-service.js", "js/ui/world-new-dialog.js", "js/app/describe-cell.js", "js/app/group-actions.js", "js/app/edit-actions.js", "js/ui/history-window.js", "js/render/sphere-view.js", "js/render/world-colors.js", "js/render/pixel-map.js", "js/tools/worldgen-preview.js", "js/workers/worldgen.worker.js", "js/core/wcde/config.js" /* v6: 世界生成設定は WorldSpec を検証する */, "js/core/wcde/world.js" /* v6: 世界の作成（地理の生成）の入口 */]);
  for (const f of walk(path.join(root, "js")).filter((x) => x.endsWith(".js") && !x.includes("/core/world/"))) for (const imp of importsOf(f)) if (/core\/world\//.test(imp)) assert.ok(allowed.has(rel(f)), `${rel(f)} が球面世界の core を import`);
});
await acheck("球面世界の描画（js/render/sphere-view.js 等）は、国家運営層（core/model・edit・sim）を import しない", () => {
  for (const f of ["js/render/sphere-view.js", "js/render/world-colors.js", "js/render/pixel-map.js", "js/app/world-service.js"]) for (const imp of importsOf(path.join(root, f))) assert.ok(!/core\/(model|derive|edit|sim|chronicle)|\/map-render|\/azgaar/.test(imp), `${f} が ${imp}`);
});

console.log("=== Worker の通信規約 ===");
const msgs = []; let handler = null;
globalThis.self = { postMessage: (m, t) => { msgs.push({ m, t }); fake.onmessage?.({ data: m }); }, set onmessage(f) { handler = f; }, get onmessage() { return handler; } };
const fake = { onmessage: null, onerror: null, terminated: false, postMessage(d) { setTimeout(() => handler({ data: d }), 0); }, terminate() { this.terminated = true; } };
await import(pathToFileURL(path.join(root, "js/workers/worldgen.worker.js")).href);
const { createWorldService } = await import("../js/app/world-service.js");
const spec = { worldSeed: "worker-1", resolution: { targetCells: 4000 } };
await acheck("generate → progress（段階）→ done（世界＋転送する配列）の順に返す", async () => {
  const svc = createWorldService({ createWorker: () => { msgs.length = 0; fake.terminated = false; fake.onmessage = null; return fake; } }), prog = [];
  const w = await svc.generate(spec, { onProgress: (p) => prog.push(p.stage) });
  assert.equal(svc.lastMode, "worker"); assert.ok(prog.includes("G1_mesh") && prog.includes("G8_stats")); assert.ok(w.mesh.cellCount > 3000 && w.hash && w.generation.seedUsed);
  const done = msgs.filter((x) => x.m.type === "done"); assert.equal(done.length, 1); const t = done[0].t; assert.ok(t.length >= 20, `転送する配列が少ない ${t.length}`); assert.equal(new Set(t).size, t.length, "同じバッファが重複している");
  assert.ok(fake.terminated, "完了後に Worker を止める");
});
await acheck("不正な設定は、error メッセージで返り、Promise が拒否される", async () => {
  const svc = createWorldService({ createWorker: () => { fake.terminated = false; fake.onmessage = null; return fake; } });
  await assert.rejects(svc.generate({ worldSeed: "", resolution: { targetCells: 4000 } }), /WorldSpec/);
});
await acheck("中断: Cancelled で拒否され、Worker を止める", async () => {
  const svc = createWorldService({ createWorker: () => { fake.terminated = false; fake.onmessage = null; return { ...fake, postMessage() {}, terminate() { fake.terminated = true; } }; } });
  const p = svc.generate(spec); svc.cancel(); await assert.rejects(p, (e) => e.name === "Cancelled"); assert.ok(fake.terminated);
});
await acheck("Worker を作れない・起動に失敗する環境では、その場の生成にもどり、進捗で知らせる", async () => {
  const a = createWorldService({ createWorker: () => null }); const w1 = await a.generate(spec); assert.equal(a.lastMode, "inline"); assert.ok(w1.hash);
  const b = createWorldService({ createWorker: () => ({ postMessage() { setTimeout(() => this.onerror({ message: "blocked" }), 0); }, terminate() {} }) }), seen = []; const w2 = await b.generate(spec, { onProgress: (p) => seen.push(p.stage) });
  assert.ok(seen.includes("fallback") && w2.hash); assert.equal(w1.hash, w2.hash, "Worker と同期生成で同じ世界になる");
});
await acheck("同じ設定なら Worker 経由でも直接生成と同じ世界（ハッシュ一致）", async () => {
  const { generateWorldChecked } = await import("../js/core/world/worldgen.js"); const svc = createWorldService({ createWorker: () => { fake.terminated = false; fake.onmessage = null; return fake; } });
  const w = await svc.generate(spec), d = generateWorldChecked(spec).world; assert.equal(w.hash, d.hash);
});
await acheck("同梱の Worker 本体（js/generated/worldgen-worker.txt）が、ソースから作り直したものと一致する", async () => {
  const { buildSync } = await import("esbuild"); const out = buildSync({ entryPoints: [path.join(root, "js/workers/worldgen.worker.js")], bundle: true, format: "iife", target: "es2020", write: false }).outputFiles[0].text;
  assert.equal(readFileSync(path.join(root, "js/generated/worldgen-worker.txt"), "utf8"), out, "npm run build で作り直してください");
});

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log("\n全て成功");
