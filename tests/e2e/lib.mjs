// 実ブラウザ（Chromium）で index.html を動かすための共通部品。
//   使い方: node tests/e2e/xxx.e2e.mjs   （事前に npm run build。Chromium は @sparticuz/chromium が同梱）
//   画面は /tmp/e2e-shots/ に保存する。コンソールエラーとページ内例外は集めて、最後に失敗として数える。
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateWorld } from "../../js/core/world/worldgen.js";
import { worldToMap } from "../../js/core/world-bridge.js";
import { saveMapBytes } from "../../js/io/ahmap-file.js";
const require = createRequire(import.meta.url);
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SHOTS = process.env.SHOTS_DIR ?? "/tmp/e2e-shots";
mkdirSync(SHOTS, { recursive: true });
// 一時ファイル（生成した世界・保存ファイル・書き出し）は、実行ごとの専用フォルダに置く（前回の残りを読み込む取り違えを防ぐ）
export const TMP = process.env.E2E_TMP ?? mkdtempSync(path.join(os.tmpdir(), "ah-e2e-"));

export async function launch({ width = 1280, height = 853, touch = false } = {}) {
  const chromium = require("@sparticuz/chromium").default ?? require("@sparticuz/chromium");
  const { chromium: pw } = require("playwright-core");
  const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), headless: true }); // single-process は不安定でクリックが固まることがある
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, acceptDownloads: true });
  // 外部ネットワーク（Googleフォント等）は遮断。ローカルのファイルだけ通す
  await ctx.route((u) => !u.toString().startsWith("file:"), (r) => r.abort());
  const page = await ctx.newPage();
  // v5.3: 従来のハブ（#btn-*・[data-open-win]）は画面外へ退けてあるが、部品は生きている（従来のウィンドウ・保存・編集モードの入口）。
  //   従来のハブを操作するテストは、見えない部品を DOM のクリックで押す。v5.3 の画面は v53-live.e2e.mjs が、見える操作で確かめる
  const rawClick = page.click.bind(page);
  page.click = async (sel, opts) => {
    if (typeof sel === "string" && /^#btn-|\[data-open-win=|\[data-click=/.test(sel)) {
      const ok = await page.evaluate((q) => { const e = document.querySelector(q); if (!e) return false; e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; }, sel);
      if (!ok) throw new Error(`従来のハブの部品が見つかりません: ${sel}`); return;
    }
    return rawClick(sel, opts);
  };
  const problems = [];
  page.on("pageerror", (e) => problems.push(`例外: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  return { browser, ctx, page, problems };
}

// v5: 本番が開けるのは .ahmap（v2）だけ。世界を Node で生成して .ahmap にし、ページに「ファイルを開く」で渡す。
// 国家は本番と同じ経路（setupActions.create）でページ内に作る（E2E が操作する国・都市・戦争の土台）。
export async function makeWorldFile(seed = 11, cells = 1500) {
  let lastErr;
  for (let k = 0; k < 8; k++) { // 小さい世界は統計の許容帯に入らず生成に失敗することがある。シードをずらして最初に成功したものを使う
    try {
      const map = worldToMap(generateWorld({ worldSeed: `e2e-${seed}-${k}`, resolution: { targetCells: cells } }));
      const file = path.join(TMP, `e2e-world-${seed}.ahmap`);
      writeFileSync(file, await saveMapBytes(map, { appVersion: "e2e", savedAt: "2026-10-25" }));
      return file;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`E2E 用の世界を生成できませんでした: ${lastErr?.message}`);
}

export async function openApp(page, { seed = 11, cells = 1500, states = 4 } = {}) {
  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  await page.bringToFront();
  await page.setInputFiles("#file-input", await makeWorldFile(seed, cells));
  await page.waitForFunction(() => /セル/.test(document.getElementById("status-map")?.textContent ?? ""), null, { timeout: 30000, polling: 100 });
  if (states > 0) {
    const made = await page.evaluate((n) => {
      const { setupActions } = window.alterhistory; const ids = [];
      for (let i = 0; i < n; i++) { try { const r = setupActions.create("state", { territory: "m", capital: true }); if (r?.id) ids.push(r.id); } catch (e) { return { error: e.message, ids }; } }
      return { ids };
    }, states);
    if (made.error || made.ids.length < Math.min(2, states)) throw new Error(`E2E 用の国家を作れませんでした: ${made.error ?? made.ids.length + " か国"}`);
    // 国家を作った操作は Undo 履歴に残るので、保存→開き直しで「編集前」の状態にする（本物の保存・読み込みの経路でもある）
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.evaluate(() => window.alterhistory.actions.saveNative())]);
    const seeded = path.join(TMP, `e2e-seeded-${seed}.ahmap`); await dl.saveAs(seeded);
    await page.setInputFiles("#file-input", seeded);
    await page.waitForFunction(() => window.alterhistory.store.getState().fileName?.endsWith(".ahmap") && !window.alterhistory.store.canUndo() && window.alterhistory.store.getState().map.pack.states.length > 1, null, { timeout: 30000, polling: 100 });
  }
}

export function reporter() {
  let fail = 0;
  const check = (name, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : "  " + extra}`); if (!ok) fail++; };
  const done = (problems = []) => {
    for (const p of problems) { console.log(`  FAIL ${p}`); fail++; }
    console.log(fail ? `${fail} 件失敗` : "全て成功");
    return fail;
  };
  return { check, done };
}
// 画面の保存はあくまで確認用。撮れなくてもテストは失敗にしない
export const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 8000 }).catch(() => {});
