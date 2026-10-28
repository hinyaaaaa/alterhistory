// v5.3.1: 描画性能の障害（25万セルの世界の初回表示が数分かかる）の修正を確かめる。
//   (1) セルの多角形パスに closePath を使わない（Chromium では 1本のパスの輪郭が増えるほど closePath が遅くなる）。見た目は変わらない
//   (2) 描画要求の完了を追える（実際にタイルを描いて貼り終えたときに解決する。失敗は失敗として伝わる）
//   (3) 地図を採用しても、初回の描画が終わるまで「処理中」を消さない。描画の失敗は成功扱いにしない
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { addCellPath } from "../js/render/layers/terrain.js";
import { createViewport } from "../js/render/viewport.js";
import { createRenderer } from "../js/render/renderer.js";
import { createStore } from "../js/core/store.js";
import { createActions } from "../js/app/actions.js";
import { createWorldService } from "../js/app/world-service.js";

let failed = 0;
const acheck = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const map = worldToMap(generateWorld({ worldSeed: "v531", resolution: { targetCells: 3000 } }));

console.log("=== (1) セルのパスは closePath を使わず、見た目は同じ ===");
await acheck("addCellPath は closePath を呼ばず、輪郭ごとに moveTo 1回・残りは lineTo", () => {
  const calls = { moveTo: 0, lineTo: 0, closePath: 0 };
  const spy = { moveTo() { calls.moveTo++; }, lineTo() { calls.lineTo++; }, closePath() { calls.closePath++; } };
  const cells = { v: [[0, 1, 2], [2, 3, 4]], alt: [null, [0, 1, 2]] };
  const vertices = { p: [[0, 0], [1, 0], [1, 1], [0, 1], [2, 2]] };
  addCellPath(spy, cells, vertices, 0); addCellPath(spy, cells, vertices, 1);
  assert.equal(calls.closePath, 0);
  assert.ok(calls.moveTo >= 2 && calls.moveTo + calls.lineTo >= 9, JSON.stringify(calls));
});
await acheck("実際の地図の500セルを塗った結果が、closePath ありの旧方式と1画素も違わない", () => {
  const { cells, vertices } = map.geometry.pack, W = 1024, H = 512;
  const draw = (fn) => {
    const cv = createCanvas(W, H), c = cv.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); c.scale(W / map.meta.width, H / map.meta.height);
    c.fillStyle = "#3a7"; c.globalAlpha = 0.8; c.beginPath(); fn(c); c.fill();
    return c.getImageData(0, 0, W, H).data;
  };
  const n = Math.min(500, cells.v.length);
  const oldWay = draw((c) => { for (let i = 0; i < n; i++) { for (const ring of [cells.v[i], cells.alt?.[i]]) { if (!ring) continue; ring.forEach((v, k) => { const p = vertices.p[v]; k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.closePath(); } } });
  const newWay = draw((c) => { for (let i = 0; i < n; i++) addCellPath(c, cells, vertices, i); });
  assert.equal(Buffer.compare(Buffer.from(oldWay), Buffer.from(newWay)), 0);
});

console.log("\n=== (2) 描画要求の完了を追える ===");
const uncaught = [];
function rendererEnv({ getMap = () => map } = {}) {
  const canvas = createCanvas(400, 300);
  canvas.getBoundingClientRect = () => ({ width: 400, height: 300 });
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = { createElement: () => createCanvas(1, 1) };
  globalThis.requestAnimationFrame = (f) => setTimeout(() => { try { f(); } catch (e) { uncaught.push(e); } }, 0); // ブラウザは例外を「未処理の例外」として報告する
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  const viewport = createViewport(map.meta.width, map.meta.height);
  const renderer = createRenderer({ canvas, viewport, getMap, getOptions: () => ({ terrain: "biome", fills: [], borders: false, coast: true, rivers: false, routes: false, burgs: false, labels: false }) });
  renderer.resize(); viewport.fit();
  return { renderer };
}
await acheck("requestRender は約束を返し、描き終えるまで解決しない。解決時に段階別の時間が分かる", async () => {
  const { renderer } = rendererEnv();
  let done = false; const p = renderer.requestRender(); p.then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false, "予約しただけで完了扱いにしていない");
  const r = await p;
  assert.ok(r.tileMs > 0 && r.sceneMs > 0 && r.blitMs >= 0 && r.tileMs >= r.sceneMs, JSON.stringify({ t: r.tileMs, s: r.sceneMs }));
  assert.ok("layer.terrain" in r.profile.ms && r.profile.counts["terrain.cells"] > 0, "層別の時間と件数が付く");
  assert.equal(renderer.lastRender.tileMs, r.tileMs);
  assert.equal(typeof (await r.presented), "number");
});
await acheck("連続した要求は、それぞれ別の番号で、まとめて1回の描画で満たされる", async () => {
  const { renderer } = rendererEnv();
  const a = renderer.requestRender(), b = renderer.requestRender();
  const [ra, rb] = await Promise.all([a, b]);
  assert.ok(ra.id < rb.id && ra.tileMs === rb.tileMs);
});
await acheck("描画が失敗したら、待っている側へ失敗が伝わり、例外も握りつぶさない。次の要求で描き直す", async () => {
  let broken = false;
  const bad = { ...map, geometry: { get pack() { if (broken) throw new Error("壊れた地図"); return map.geometry.pack; } } };
  const { renderer } = rendererEnv({ getMap: () => bad });
  broken = true;
  await assert.rejects(renderer.requestRender(), /壊れた地図/);
  assert.ok(uncaught.some((e) => /壊れた地図/.test(e.message)), "例外は画面の例外としても残る");
  broken = false;
  const r = await renderer.requestRender(); assert.ok(r.tileMs > 0);
});
await acheck("地図が無いときの要求は、描くものが無いまま完了する", async () => {
  const { renderer } = rendererEnv({ getMap: () => null });
  const r = await renderer.requestRender(); assert.ok(r.id >= 1);
});

console.log("\n=== (3) 地図の採用と処理中の表示 ===");
function actionsEnv(requestRender) {
  const store = createStore({ map: null, fileName: "", warnings: [], error: null, notice: null, busy: null, hover: null, view: {}, groups: null });
  const viewport = createViewport(1280, 774);
  const actions = createActions({ store, viewport, renderer: { requestRender }, worldService: createWorldService({ createWorker: () => null }), download() {}, createCanvas() {} });
  return { store, actions };
}
await acheck("描画が終わるまで「地図を描画中…」が残り、終わると消える", async () => {
  let release; const { store, actions } = actionsEnv(() => new Promise((r) => { release = r; }));
  const p = actions.adoptMap(map, "a.ahmap", []);
  assert.equal(store.getState().busy, "地図を描画中…"); assert.ok(store.getState().map);
  release({ tileMs: 5, sceneMs: 4, blitMs: 1 });
  const r = await p; assert.ok(r.ok && r.tileMs === 5); assert.equal(store.getState().busy, null);
});
await acheck("描画が失敗したら成功扱いにせず、処理中を消して error を出す", async () => {
  const { store, actions } = actionsEnv(() => Promise.reject(new Error("描けない")));
  const r = await actions.adoptMap(map, "a.ahmap", []);
  assert.ok(!r.ok); assert.equal(store.getState().busy, null); assert.match(store.getState().error, /地図の描画に失敗しました: 描けない/);
});
await acheck("続けて別の地図を採用したら、前の地図の描画完了で処理中を消さない", async () => {
  const rel = []; const { store, actions } = actionsEnv(() => new Promise((r) => rel.push(r)));
  const p1 = actions.adoptMap(map, "1.ahmap", []), p2 = actions.adoptMap(map, "2.ahmap", []);
  rel[0]({}); await p1; assert.equal(store.getState().busy, "地図を描画中…", "後の地図はまだ描いている");
  rel[1]({}); await p2; assert.equal(store.getState().busy, null);
});
await acheck("完了を追えない描画器（テスト用の代役）では、従来どおりすぐ処理中を消す", async () => {
  const { store, actions } = actionsEnv(() => {});
  await actions.adoptMap(map, "a.ahmap", []); assert.equal(store.getState().busy, null);
});
await acheck("newWorld: 世界を作り、初回の描画が終わってから完了する（通知に描画の時間が出る）", async () => {
  let releaseNow; const gate = new Promise((r) => { releaseNow = r; });
  const { store, actions } = actionsEnv(() => gate);
  const p = actions.newWorld({ worldSeed: "v531-nw", resolution: { targetCells: 3000 } });
  let settled = false; p.then(() => { settled = true; });
  await sleep(600); // 生成が終わり、描画待ちになるはず
  assert.equal(settled, false, "描画が終わるまでは完了しない"); assert.equal(store.getState().busy, "地図を描画中…");
  releaseNow({ tileMs: 1200, sceneMs: 1100, blitMs: 10, setupMs: 5, profile: { ms: {}, counts: {} } });
  const r = await p; assert.ok(r.ok); assert.equal(store.getState().busy, null);
  assert.match(String(store.getState().notice), /描画 1\.2）/, "notice=" + JSON.stringify(store.getState().notice));
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
