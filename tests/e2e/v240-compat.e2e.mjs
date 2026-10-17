// v2.4.1 A8: v2.4.0 で保存した .ahmap を、ブラウザで開き、主要な窓を一通り開いても、例外もレイアウトの崩れも出ない。
//   使い方: npm run build && node tests/e2e/v240-compat.e2e.mjs
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { launch, reporter, root } from "./lib.mjs";
import { checkLayout } from "./layout-check.mjs";

const FIXTURE = path.join(root, "tests/fixtures/v2.4.0-world.ahmap"), DIR = path.join(root, "tests/e2e/shots");
mkdirSync(DIR, { recursive: true });
const { check, done } = reporter();
const all = [];
for (const [label, width, height] of [["pc", 1280, 853], ["phone", 390, 844]]) {
  console.log(`=== ${label} (${width}x${height}) ===`);
  const { browser, page, problems } = await launch({ width, height, touch: true });
  try {
    page.on("dialog", (d) => d.accept());
    await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "domcontentloaded" }); await page.bringToFront();
    await page.setInputFiles("#file-input", FIXTURE);
    await page.waitForFunction(() => /セル/.test(document.getElementById("status-map")?.textContent ?? ""), null, { timeout: 30000, polling: 100 });
    check("v2.4.0 の保存データが開ける", true);
    const open = async (id) => { await page.evaluate(() => { const w = window.alterhistory.wins; for (const i of w.openIds()) w.close(i); }); await page.evaluate((i) => window.alterhistory.wins.open(i), id); await page.waitForTimeout(300); };
    const snap = async (name) => { await page.screenshot({ path: path.join(DIR, `v240-${label}-${name}.png`), timeout: 10000 }).catch(() => {}); const issues = await checkLayout(page, { touch: true }); check(`${name}: 崩れなし`, issues.length === 0, "\n      " + issues.slice(0, 6).join("\n      ")); };
    for (const id of ["nation", "diplomacy", "war", "timeline", "economy", "settings"]) { await open(id); await snap(`window-${id}`); }
    // 国家タブの詳細（安定度・基本設定・軍事・傀儡）と、進行中の戦争の概要
    await open("nation");
    await page.evaluate(() => document.querySelector('[data-win="nation"] .nation-row.b-click')?.click()); await page.waitForTimeout(250);
    const stab = await page.evaluate(() => [...document.querySelectorAll('[data-win="nation"] .b-stat')].find((d) => d.textContent.includes("安定度"))?.firstChild.textContent);
    check("安定度が表示される（安定・不安・危機）", ["安定", "不安", "危機"].includes(stab), String(stab));
    for (const t of ["軍事", "技術ドクトリン", "傀儡・属州", "内政・税", "概要"]) { await page.evaluate((t) => [...document.querySelectorAll('[data-win="nation"] .nation-tabs button')].find((b) => b.textContent.includes(t))?.click(), t); await page.waitForTimeout(200); await snap(`nation-${t}`); }
    // 月を進める（旧データの戦争に負荷が積まれる）→ 戦争の概要に表に出る
    await page.evaluate(() => { const { simActions } = window.alterhistory; for (let m = 9; m <= 12; m++) simActions.advanceWars({ year: 40, month: m }); });
    await open("war");
    await page.evaluate(() => [...document.querySelectorAll('[data-win="war"] button')].find((b) => b.textContent.includes("第一次世界大戦"))?.click()); await page.waitForTimeout(250);
    const hasBurden = await page.evaluate(() => !!document.querySelector('[data-win="war"] [data-field="war-burden"]'));
    check("旧データの総力戦に、国ごとの負荷の表が出る", hasBurden);
    await snap("war-burden");
  } catch (e) { problems.push(`スクリプト例外: ${e.message.split("\n")[0]}`); }
  all.push(...problems.map((p) => `[${label}] ${p}`));
  await browser.close();
}
const fail = done(all);
process.exit(fail ? 1 : 0);
