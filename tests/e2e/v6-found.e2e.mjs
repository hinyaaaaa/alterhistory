// v6.3.1: 「担当して建国」が「その候補はありません」で失敗しない（画面が候補 ID を持たなかった不具合の回帰テスト）。
import { launch, root } from "./lib.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path"; import assert from "node:assert/strict";
const { browser, page, problems } = await launch({ width: 1440, height: 860 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.waitForSelector("#new"); await page.evaluate(() => { window.__v6.S.fastStart = true; }); await page.click("#splash").catch(() => {}); await page.click("#new"); await page.waitForSelector("#gen");
await page.fill("#seed", "e2e-found"); await page.selectOption("#cells", "3000"); await page.click("#gen");
await page.waitForSelector("#delegate", { timeout: 120000 });
const n = await page.locator("button", { hasText: "担当して建国" }).count(); assert.ok(n > 0, "建国の候補が 1 つ以上ある: " + n);
await page.locator("button", { hasText: "担当して建国" }).first().click();
await page.waitForSelector("#map", { timeout: 60000 });
const ctl = await page.evaluate(() => window.__v6.S.w.civ.wcde.control.stateId); assert.ok(ctl, "建国した国家を担当している");
const phase = await page.evaluate(() => window.__v6.S.w.civ.wcde.phase); assert.equal(phase, "running");
assert.deepEqual(errs, [], errs.join("\n")); assert.deepEqual(problems, [], JSON.stringify(problems).slice(0, 300));
await browser.close(); console.log("v6-found.e2e OK");
