// v2.4.1 A4: 主要な画面を2サイズ（1280×853 タッチあり／390×844 スマホ）で開いて撮影し、そのたびにレイアウトを自動検査する。
//   画像は tests/e2e/shots/ へ（Git には入れない）。画面の確認が必要なときは、この画像を直接見る。
//   使い方: npm run build && node tests/e2e/shots.e2e.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import { launch, openApp, reporter, root } from "./lib.mjs";
import { checkLayout } from "./layout-check.mjs";
const DIR = path.join(root, "tests/e2e/shots");
mkdirSync(DIR, { recursive: true });
const { check, done } = reporter();
const allProblems = [];
const SIZES = [["pc", 1280, 853, true], ["phone", 390, 844, true]];
const only = process.env.ONLY; // 例: ONLY=war で、名前に war を含む画面だけ

for (const [label, width, height, touch] of SIZES) {
  console.log(`=== ${label} (${width}x${height}) ===`);
  const { browser, page, problems } = await launch({ width, height, touch });
  const snap = async (name, note = "") => {
    if (only && !name.includes(only)) return;
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(DIR, `${label}-${name}.png`), timeout: 10000 }).catch(() => {});
    const issues = await checkLayout(page, { touch });
    check(`${name}${note ? "（" + note + "）" : ""}: 崩れなし`, issues.length === 0, "\n      " + issues.slice(0, 8).join("\n      ") + (issues.length > 8 ? `\n      …ほか ${issues.length - 8} 件` : ""));
  };
  const clickText = async (scope, text) => { const ok = await page.evaluate(([scope, text]) => { const b = [...document.querySelectorAll(`${scope} button`)].find((x) => x.textContent.trim().includes(text) && x.offsetParent); if (!b) return false; b.click(); return true; }, [scope, text]); await page.waitForTimeout(150); return ok; };
  const closeAll = () => page.evaluate(() => { const w = window.alterhistory.wins; for (const id of w.openIds()) w.close(id); });
  const openWin = async (id) => { await closeAll(); await page.evaluate((i) => window.alterhistory.wins.open(i), id); await page.waitForTimeout(250); };
  try {
    await openApp(page);
    // --- 国家 ---
    await openWin("nation"); await snap("nation-list");
    await clickText('[data-win="nation"]', "新規作成");
    for (let i = 1; i <= 5; i++) { await snap(`nation-create-${i}`); if (i < 5) await clickText('[data-win="nation"]', "次へ"); }
    await openWin("nation");
    await clickText('[data-win="nation"]', "国家一覧");
    await page.evaluate(() => document.querySelector('[data-win="nation"] .nation-row.b-click')?.click()); await page.waitForTimeout(200);
    for (const [k, t] of [["overview", "概要"], ["military", "軍事"], ["tech", "技術ドクトリン"], ["vassal", "傀儡・属州"], ["finance", "内政・税"], ["covert", "工作"]]) { await clickText('[data-win="nation"] .nation-tabs', t); await snap(`nation-detail-${k}`); }
    await clickText('[data-win="nation"] .nation-tabs', "概要");
    await page.evaluate(() => { const d = document.querySelector('[data-win="nation"] details[data-field="basic"]'); if (d) d.open = true; }); await snap("nation-detail-basic-open");
    await page.evaluate(() => { const d = document.querySelector('[data-win="nation"] details[data-field="basic"]'); if (d) d.open = false; });
    // --- 外交（3列）---
    await openWin("diplomacy"); await snap("diplomacy");
    // --- 戦争：準備（戦争なし）→ 進行中 → 講和 ---
    await openWin("war"); await snap("war-prep");
    await page.evaluate(() => { const { simActions, store } = window.alterhistory; const ids = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i); simActions.declareWarInstant([ids[0]], [ids[3]], null, "conventional"); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const { simActions } = window.alterhistory; for (let m = 2; m <= 7; m++) simActions.advanceWars({ year: 1, month: m }); }); // 6か月進める（国ごとの負荷が記録される）
    await openWin("war");
    for (const [k, t] of [["overview", "概要"], ["units", "部隊"], ["log", "経過"], ["peace", "講和"]]) { await clickText('[data-win="war"]', t); await snap(`war-${k}`); }
    await clickText('[data-win="war"]', "概要"); await page.evaluate(() => document.querySelector("#tab-wars .war-go")?.click()); await snap("war-treaty-form"); // 戦争タブから、外交ウィンドウの講和モードを開く
    await page.evaluate(() => window.alterhistory.panels.diplomacy.closePeace()); await openWin("diplomacy"); await snap("diplomacy-with-war");
    // --- 年表・詳細設定 ---
    await openWin("timeline"); await snap("timeline");
    await openWin("settings"); await snap("settings");
    // --- エラー表示と戦争状況が同時に出た状態 ---
    await closeAll();
    await page.evaluate(() => window.alterhistory.store.update((s) => { s.error = "テスト用のエラー表示です。長い文章でも戦争状況と重ならないことを確かめます。"; }));
    await snap("banner-with-war-status");
  } catch (e) { problems.push(`スクリプト例外: ${e.message.split("\n")[0]}`); }
  allProblems.push(...problems.map((p) => `[${label}] ${p}`));
  await browser.close();
}
const fail = done(allProblems);
process.exit(fail ? 1 : 0);
