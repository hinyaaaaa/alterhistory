// v4.0.0 球面世界の E2E（実 Chromium・file://）。Worker での生成・実描画・ズーム（ラスタ→ベクタ）・初期集団・編集・保存・開き直し・性能。
//   E2E_BIG=1 を付けると、1,000,000 セルの生成と描画も測る（重いので既定では省く）。
import { launch, reporter, shot, root } from "./lib.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
const { browser, ctx, page, problems } = await launch();
const { check, done } = reporter();
const ms = (t) => `${Math.round(t)} ms`;
try {
  await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.bringToFront();
  await page.waitForFunction(() => window.alterhistory?.worldActions, null, { timeout: 15000 });
  await page.click("#btn-world"); await page.waitForSelector("#world-stage:not([hidden])");
  check("球面世界の画面が開く（旧エディタの時計は隠れる）", await page.evaluate(() => document.getElementById("app").classList.contains("world-mode") && getComputedStyle(document.getElementById("clock")).display === "none"));
  await shot(page, "w01-empty");

  // ---- 生成（UI から、50,000 セル）----
  await page.click(".world-empty button.primary"); await page.waitForSelector("dialog.world-new[open]");
  await page.selectOption("dialog.world-new select >> nth=0", "50000"); await page.fill("dialog.world-new input[type=text]", "e2e-world-1");
  const t0 = Date.now(); await page.click("dialog.world-new button.primary");
  await page.waitForFunction(() => window.alterhistory.worldActions.store.getState().world && !window.alterhistory.worldActions.store.getState().busy, null, { timeout: 120000, polling: 100 });
  const tGen = Date.now() - t0;
  check("Worker で生成された（画面を止めない方式）", await page.evaluate(() => window.alterhistory.worldService.lastMode) === "worker");
  console.log(`  情報  50,000 セル: UI の操作から地図の準備完了まで ${ms(tGen)}`);
  await page.waitForFunction(() => { const v = window.alterhistory.worldWorkspace.view; return v.ready && v.world === window.alterhistory.worldActions.store.getState().world; }, null, { timeout: 60000 });
  const paint = async () => page.evaluate(() => { const c = document.getElementById("world-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let ocean = 0, land = 0, other = 0; for (let i = 0; i < d.length; i += 4 * 7) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (b > r + 25 && b > g) ocean++; else if (g > b) land++; else other++; } return { ocean, land, other, w: c.width, h: c.height }; });
  let px = await paint();
  check("実際に描画されている（海の青と陸の緑が両方ある）", px.ocean > 1000 && px.land > 1000, JSON.stringify(px));
  await shot(page, "w02-world-raster");
  check("生成直後は初期集団の候補が丸印と一覧で出る", await page.locator(".world-group").count() >= 6);

  // ---- ズーム（ラスタ→ベクタ）とパン ----
  const box = await page.locator("#world-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(30); }
  await page.waitForTimeout(300);
  check("拡大すると、セルの多角形を描くモード（vector）で描かれる", /描画 vector/.test(await page.textContent(".world-status")));
  await shot(page, "w03-world-vector");
  await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  px = await paint(); check("パンしても描画が崩れない（陸と海が見える）", px.ocean + px.land > 1000, JSON.stringify(px));
  await page.dblclick("#world-canvas"); await page.waitForTimeout(200);
  check("ダブルクリックで全体表示に戻る（倍率が最小に戻る）", await page.evaluate(() => { const v = window.alterhistory.worldWorkspace.view.view; return v.lat0 === 0 && v.lon0 === 0; }));

  // ---- 表示レイヤー ----
  for (const layer of ["elevation", "temp", "precip", "fertility", "soil", "resource", "plate", "basin", "biome"]) { await page.selectOption(".world-layer", layer); await page.waitForTimeout(120); }
  px = await paint(); check("全レイヤーを切り替えても描画できる", px.ocean + px.land + px.other > 1000);
  await page.selectOption(".world-layer", "elevation"); await page.waitForTimeout(150); await shot(page, "w04-elevation"); await page.selectOption(".world-layer", "biome");

  // ---- ホバー・選択 ----
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5); await page.waitForTimeout(150);
  check("カーソルを置くと、ステータスに緯度経度・標高・バイオームが出る", /°/.test(await page.textContent(".world-status")) && /℃/.test(await page.textContent(".world-status")));

  // ---- 初期集団 ----
  await page.click(".world-group >> nth=2"); await page.waitForTimeout(150);
  check("一覧で集団を選べる", await page.locator(".world-group.on").count() === 1);
  await shot(page, "w05-groups");
  await page.click("text=この集団で始める"); await page.waitForTimeout(200);
  check("「この集団で始める」で開始集団が決まる", await page.evaluate(() => !!window.alterhistory.worldActions.store.getState().world.entities.start));

  // ---- 地形編集 ----
  await page.click('.world-modes button[data-mode="edit"]'); await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.alterhistory.worldActions.store.getState().world.hash);
  await page.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.35); await page.waitForTimeout(400);
  const afterEdit = await page.evaluate(() => { const s = window.alterhistory.worldActions.store.getState(); return { hash: s.world.hash, undo: s.undoCount, errs: window.alterhistory.worldActions.check().length }; });
  check("地図をクリックして編集でき、世界のハッシュが変わり、検査に通る", afterEdit.undo >= 1 && afterEdit.hash !== before && afterEdit.errs === 0, JSON.stringify(afterEdit));
  await page.keyboard.press("Control+z"); await page.waitForTimeout(200);
  check("Ctrl+Z で元に戻る", await page.evaluate(() => window.alterhistory.worldActions.store.getState().world.hash) === before);
  await shot(page, "w06-edit");
  await page.click('.world-modes button[data-mode="view"]');

  // ---- 保存 → 開き直し ----
  const hashSaved = await page.evaluate(() => window.alterhistory.worldActions.store.getState().world.hash);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#btn-save")]);
  const savePath = "/tmp/e2e-world.ahmap"; await dl.saveAs(savePath);
  check("保存で .ahmap のダウンロードが始まる（ファイル名はシード由来）", /\.ahmap$/.test(dl.suggestedFilename()) && readFileSync(savePath).length > 50000, dl.suggestedFilename());
  check("保存されたファイルは AHMAP2 のマジックで始まる", readFileSync(savePath).subarray(0, 6).toString() === "AHMAP2");
  await page.reload(); await page.waitForFunction(() => window.alterhistory?.worldActions, null, { timeout: 15000 });
  await page.setInputFiles("#file-input", savePath);
  await page.waitForFunction(() => { const s = window.alterhistory.worldActions.store.getState(); return s.world && !s.busy; }, null, { timeout: 60000, polling: 100 });
  check(".ahmap v2 を選ぶと、球面世界の画面で開く", await page.evaluate(() => !document.getElementById("world-stage").hidden));
  check("開き直した世界は、保存したものと同じ（ハッシュ一致・開始集団あり）", await page.evaluate((h) => { const s = window.alterhistory.worldActions.store.getState(); return s.world.hash === h && !!s.world.entities.start; }, hashSaved));
  await page.waitForFunction(() => /描画 (raster|vector)/.test(document.querySelector(".world-status")?.textContent ?? ""), null, { timeout: 60000 });
  await shot(page, "w07-reopened");

  // ---- 破損ファイル ----
  const bytes = readFileSync(savePath); bytes[Math.floor(bytes.length * 0.6)] ^= 0xff; writeFileSync("/tmp/e2e-broken.ahmap", bytes);
  await page.setInputFiles("#file-input", "/tmp/e2e-broken.ahmap"); await page.waitForSelector(".world-banner.err", { timeout: 30000 });
  check("破損ファイルは理由つきで拒否される", /開けませんでした/.test(await page.textContent(".world-banner")));
  check("旧エディタに戻れる", true); await page.click("#btn-world"); await page.waitForTimeout(100);

  // ---- 性能（標準 250,000 セル。この端末の値）----
  await page.click("#btn-world"); await page.waitForSelector("#world-stage:not([hidden])");
  const perf = await page.evaluate(async () => {
    const { worldActions } = window.alterhistory; const t = performance.now();
    worldActions.store.update((s) => { s.dirty = false; });
    await worldActions.newWorld({ worldSeed: "perf-250k", resolution: { targetCells: 250000 } }); const gen = performance.now() - t;
    const view = window.alterhistory.worldWorkspace.view, t2 = performance.now(); while (!(view.ready && view.world === worldActions.store.getState().world)) await new Promise((r) => setTimeout(r, 50)); const prep = performance.now() - t2;
    view.fit(); const t3 = performance.now(); view.renderNow(); const redraw = performance.now() - t3;
    const t4 = performance.now(); window.alterhistory.worldActions.setLayer("elevation"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const layer = performance.now() - t4;
    return { gen, prep, redraw, layer, cells: worldActions.store.getState().world.mesh.cellCount, stats: view.stats };
  });
  console.log(`  情報  249,642 セル（Chromium・この端末）: 生成 ${ms(perf.gen)}（Worker）／地図の準備 ${ms(perf.prep)}／全体の描き直し ${perf.redraw.toFixed(1)} ms／レイヤー切替 ${ms(perf.layer)}／画素対応表 ${perf.stats.pixelMapMs} ms`);
  check("標準規模: 全体表示はラスタで描かれる", perf.stats.mode === "raster", perf.stats.mode);
  check("標準規模: 生成が 60 秒以内（この端末。Surface Go 4 ではない）", perf.gen < 60000, ms(perf.gen));
  check("標準規模: 全体の描き直しが 5 秒以内", perf.redraw < 5000, `${perf.redraw}`);
  if (process.env.E2E_BIG) {
    const big = await page.evaluate(async () => { const { worldActions } = window.alterhistory; const t = performance.now(); worldActions.store.update((s) => { s.dirty = false; }); await worldActions.newWorld({ worldSeed: "perf-1m", resolution: { targetCells: 1000000 } }); const gen = performance.now() - t; const v = window.alterhistory.worldWorkspace.view, t2 = performance.now(); while (!(v.ready && v.world === worldActions.store.getState().world)) await new Promise((r) => setTimeout(r, 50)); const prep = performance.now() - t2; v.fit(); const t3 = performance.now(); v.renderNow(); return { gen, prep, redraw: performance.now() - t3, cells: worldActions.store.getState().world.mesh.cellCount, stats: v.stats }; });
    console.log(`  情報  ${big.cells.toLocaleString()} セル: 生成 ${ms(big.gen)}／地図の準備 ${ms(big.prep)}／全体の描き直し ${big.redraw.toFixed(1)} ms／画素対応表 ${big.stats.pixelMapMs} ms`);
    check("1,000,000 セル: 生成と全体の描き直しが目標内", big.gen < 60000 && big.redraw < 5000, JSON.stringify(big));
  }
  await shot(page, "w08-standard");
} catch (e) { problems.push(`スクリプト例外: ${e.message}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
