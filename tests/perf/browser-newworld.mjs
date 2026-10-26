// 実ブラウザ（Chromium = Edge と同じエンジン）で「新しい世界」を作り、段階ごとの時間を測る。
//   使い方: npm run build && node tests/perf/browser-newworld.mjs [セル数=250000] [シード=t1]
import { launch } from "../e2e/lib.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { root } from "../e2e/lib.mjs";
const cells = Number(process.argv[2] ?? 250000), seed = process.argv[3] ?? "t1";
const { browser, page, problems } = await launch();
page.on("console", (m) => { if (m.type() === "log" && m.text().startsWith("[T]")) console.log(m.text()); });
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.bringToFront();
await page.waitForFunction(() => !!globalThis.alterhistory, null, { timeout: 30000 });
const res = await page.evaluate(async ({ cells, seed }) => {
  const { store, actions } = globalThis.alterhistory, marks = [], t0 = performance.now(); let last = null;
  const lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] }); } catch {}
  store.subscribe((s) => { if (s.busy !== last) { last = s.busy; marks.push([Math.round(performance.now() - t0), s.busy ?? "(完了)"]); } });
  const r = await actions.newWorld({ worldSeed: seed, resolution: { targetCells: cells } });
  const total = Math.round(performance.now() - t0), s = store.getState();
  return { ok: r.ok, error: r.error, total, marks, longTasks: lt.sort((a, b) => b - a).slice(0, 6), cellCount: s.map?.pack?.cells?.v?.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
}, { cells, seed });
console.log(JSON.stringify(res, null, 1)); if (problems.length) console.log("問題:", problems.slice(0, 5));
await browser.close();
