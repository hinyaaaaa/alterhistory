// v5.2: 描画・視点・ヒットテストの投影連動。円筒図法・極域バンド・経度の継ぎ目（折り返し）・見える所だけ描く方式の一致。
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { drawScene } from "../js/render/scene.js";
import { createViewport } from "../js/render/viewport.js";
import { cellIndexOf } from "../js/core/spatial.js";
import { warpContext } from "../js/render/warp-ctx.js";
import { createProjection } from "../js/core/world/projection.js";
import { renderMapToSvg } from "../js/io/exporter.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const map = worldToMap(generateWorld({ worldSeed: "v520-render", resolution: { targetCells: 6000 } })), W = map.meta.width, H = map.meta.height;
const SW = 900, SH = 620, mk = () => { const v = createViewport(W, H); v.resize(SW, SH); v.fit(); return v; };
const opts = { terrain: "biome", fills: [], borders: false, coast: true, rivers: true, routes: false, burgs: false, labels: false };
const BG = [0x2f, 0x4a, 0x72];

console.log("=== 視点（円筒図法・折り返し）===");
await check("球面世界は円筒図法（proj あり）・そうでない地図は従来どおり平面（proj なし）", () => { assert.ok(mk().proj); const f = createViewport(1280, 774); assert.equal(f.proj, null); f.resize(800, 600); f.fit(); const [wx, wy] = f.toWorld(400, 300); assert.deepEqual(f.toScreen(wx, wy), [400, 300]); });
await check("画面 ⇄ ワールドの往復（全体表示・拡大・パン後）が 0.01 画素未満", () => {
  const v = mk(); let worst = 0;
  const probe = () => { for (let sx = 5; sx < SW; sx += 97) for (let sy = 30; sy < SH - 20; sy += 83) { const [wx, wy] = v.toWorld(sx, sy); if (wy < 0 || wy > H) continue; const [bx, by] = v.toScreen(wx, wy, true), span = v.mapWidth * v.k, ex = ((((bx - sx) % span) + span * 1.5) % span) - span / 2; /* 世界は span ごとに繰り返す（継ぎ目の反対側も同じ点） */ worst = Math.max(worst, Math.hypot(ex, by - sy)); } };
  probe(); v.zoomAt(300, 200, 7); probe(); v.pan(-123, 45); probe(); v.zoomAt(500, 300, 5); probe();
  assert.ok(worst < 0.01, `最大 ${worst}`);
});
await check("拡大すると a が 0.8 → 1 へ近づき、拡大の中心の点は動かない", () => {
  const v = mk(); assert.equal(v.proj.a, 0.8); const [wx, wy] = v.toWorld(400, 250); v.zoomAt(400, 250, 40);
  assert.equal(v.proj.a, 1); const [x, y] = v.toScreen(wx, wy, true); assert.ok(Math.hypot(x - 400, y - 250) < 1e-3, `動いた: (${x}, ${y})`);
  const [wx2, wy2] = v.toWorld(400, 250); assert.ok(Math.abs(wx2 - wx) < 1e-6 && Math.abs(wy2 - wy) < 1e-3);
});
await check("経度は継ぎ目で折り返してスクロールできる（x は常に [0,W)、景色は連続）", () => {
  const v = mk(); for (const d of [-9000, -2500, 700, 3100, 12000]) { v.pan(d, 0); const [wx] = v.toWorld(450, 300); assert.ok(wx >= 0 && wx < W); }
  const a = mk(), [bx] = a.toWorld(450, 300); a.pan(-50 * a.k, 0); const [x1] = a.toWorld(450, 300); assert.ok(Math.abs(x1 - (bx + 50)) < 1e-6 || Math.abs(x1 - (bx + 50 - W)) < 1e-6);
});
await check("継ぎ目をまたいで見るときは、世界の繰り返しが 2 つ以上になる（全体表示は余白ぶんで 3 つ）", () => { const v = mk(); assert.deepEqual(v.copyOffsets(), [-1, 0, 1]); v.zoomAt(450, 300, 4); v.centerOn(W - 5, H / 2); assert.ok(v.copyOffsets().length >= 2); });
await check("極域バンド: 北極の上端・南極の下端まで見え、その外は地図の外（範囲外）", () => {
  const v = mk(), top = v.toScreen(10, 0)[1], bot = v.toScreen(10, H)[1];
  assert.ok(top > 0 && bot < SH); const [, wyN] = v.toWorld(450, top + 1); assert.ok(wyN >= 0 && wyN < H * 0.02); const [, wyS] = v.toWorld(450, bot - 1); assert.ok(wyS <= H && wyS > H * 0.98);
  assert.equal(v.toWorld(450, top - 8)[1], -1); assert.equal(v.toWorld(450, bot + 8)[1], H + 1);
});
await check("縦は、画面の中心が極域バンドの外へ出ないようにスクロールが止まる", () => { const v = mk(); v.zoomAt(450, 310, 6); v.pan(0, 1e6); assert.ok(v.toWorld(450, 311)[1] >= 0, "北へ行き過ぎない"); v.pan(0, -2e6); assert.ok(v.toWorld(450, 309)[1] <= H, "南へ行き過ぎない"); });

console.log("=== ヒットテスト（継ぎ目・極）===");
await check("継ぎ目の両側（x ≈ 0 と x ≈ W）で、選ばれるセルは折り返しの距離でいちばん近い", () => {
  const idx = cellIndexOf(map), P = map.geometry.pack.p, d = (a, x, y) => { let dx = Math.abs(P[a][0] - x); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, P[a][1] - y); };
  for (const x of [0.2, 1.5, W - 1.5, W - 0.2]) for (const y of [100, 300, 511, 700, 900]) { const c = idx.find(x, y); let best = Infinity; for (let i = 0; i < P.length; i++) best = Math.min(best, d(i, x, y)); assert.ok(d(c, x, y) <= best + 1e-9, `x=${x} y=${y}`); }
});
await check("極域バンドをクリックすると、極に近いセルが選ばれる（北・南）", () => {
  const v = mk(), idx = cellIndexOf(map), P = map.geometry.pack.p, top = v.toScreen(10, 0)[1], bot = v.toScreen(10, H)[1];
  const [wx, wy] = v.toWorld(450, top + 3); assert.ok(wy >= 0 && wy < H * 0.05); assert.ok(P[idx.find(wx, wy)][1] < H * 0.1);
  const [sx, sy] = v.toWorld(450, bot - 3); assert.ok(sy <= H && sy > H * 0.95); assert.ok(P[idx.find(sx, sy)][1] > H * 0.9);
});

console.log("=== 描画 ===");
const render = (v, o = opts, w = SW, h = SH) => { const cv = createCanvas(w, h), g = cv.getContext("2d"); drawScene(g, map, v, o, 1); return g.getImageData(0, 0, w, h).data; };
const isBg = (d, i) => d[i] === BG[0] && d[i + 1] === BG[1] && d[i + 2] === BG[2];
await check("全体表示で、地図の範囲（極域バンドを含む）がほぼ全面描かれる", () => {
  const v = mk(), d = render(v); let bgPx = 0; for (let i = 0; i < d.length; i += 4) if (isBg(d, i)) bgPx++;
  const mapPx = (v.mapWidth * v.k) * (v.displayHeight() * v.k); assert.ok(SW * SH - bgPx > mapPx * 0.97, `描画 ${SW * SH - bgPx} / 地図 ${Math.round(mapPx)}`);
});
await check("極域バンドが塗られている（北端・南端の帯の内側が背景色でない）", () => {
  const v = mk(), d = render(v), top = Math.round(v.toScreen(10, 0)[1]), bot = Math.round(v.toScreen(10, H)[1]);
  for (const y of [top + 6, bot - 6]) for (const x of [100, 450, 800]) assert.ok(!isBg(d, 4 * (y * SW + x)), `(${x},${y})`);
});
await check("継ぎ目をまたぐ表示で、継ぎ目の左右に背景色の隙間が出ない", () => {
  const v = mk(); v.pan(-300, 0); const d = render(v), x0 = v.toScreen(0, 0, false)[0], seams = [x0, x0 + W * v.k, x0 - W * v.k].filter((x) => x > 6 && x < SW - 6); assert.ok(seams.length, "継ぎ目が画面内にある");
  for (const sx of seams) for (let y = 120; y < SH - 120; y += 11) for (const dx of [-2, -1, 0, 1, 2]) assert.ok(!isBg(d, 4 * (y * SW + Math.round(sx) + dx)), `隙間 x=${Math.round(sx) + dx} y=${y}`);
});
await check("見える所だけ描く方式が、全体を描いて切り取った絵と一致する（差は線の端の数画素）", () => {
  const v = mk(); v.zoomAt(450, 300, 3.2); assert.ok(v.cullable()); const a = render(v);
  const v2 = mk(); v2.zoomAt(450, 300, 3.2); v2.cullable = () => false; const b = render(v2);
  let diff = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) diff++;
  assert.ok(diff / (SW * SH) < 0.003, `差のある画素 ${(100 * diff / (SW * SH)).toFixed(3)}%`);
});
await check("SVG 書き出しは、円筒図法（極域バンドを含む縦横比）で出る", () => {
  const svg = renderMapToSvg(map, opts), m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg); assert.ok(m, "viewBox"); const ratio = +m[1] / +m[2], exp = W / createProjection({ mapWidth: W }).totalHeight; assert.ok(Math.abs(ratio - exp) < 0.01, `${ratio} vs ${exp}`);
});
await check("warpContext: 円・文字の大きさは変えず中心の y だけを変換する。投影が無い視点ではそのまま返す", () => {
  const calls = []; const fake = { arc: (...a) => calls.push(["arc", ...a]), fillText: (...a) => calls.push(["fillText", ...a]), fillRect: (...a) => calls.push(["fillRect", ...a]) }, v = mk(), wc = warpContext(fake, v), p = v.proj;
  wc.arc(100, 200, 5, 0, 6.28); wc.fillText("a", 10, 300); wc.fillRect(0, 100, 50, 40);
  assert.equal(calls[0][2], p.warp(200)); assert.equal(calls[0][3], 5); assert.equal(calls[1][3], p.warp(300)); assert.equal(calls[2][2], p.warp(100)); assert.ok(Math.abs(calls[2][4] - (p.warp(140) - p.warp(100))) < 1e-9);
  assert.equal(warpContext(fake, createViewport(1280, 774)), fake);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
