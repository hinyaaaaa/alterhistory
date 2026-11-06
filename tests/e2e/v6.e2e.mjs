// v6 の画面（index.html）の実ブラウザーでの確認: 生成 → 建国 → 地図が見える（パネルを開いても画面内に収まる）→ 各ハブ → 国家詳細 → 時間・ニュース → 保存の書き出し。コンソールエラー・未処理例外が無い。
import { launch, root } from "./lib.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path"; import assert from "node:assert/strict";
const { browser, page, problems } = await launch({ width: 1440, height: 860 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.waitForSelector("#gen");
await page.fill("#seed", "e2e-v6"); await page.selectOption("#cells", "3000"); await page.click("#gen"); await page.waitForSelector("#delegate", { timeout: 120000 }); await page.click("#delegate"); await page.waitForSelector("#map");
await page.evaluate(() => { window.__v6.run({ type: "time.advance", months: 480 }); window.__v6.run({ type: "clock.setSpeed", speed: 0 }); window.__v6.render(); });
const visible = async () => page.evaluate(() => { const r = document.getElementById("map").getBoundingClientRect(), c = document.getElementById("map"), px = c.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return { inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.width > 300, drawn: px[3] > 0 && px[0] + px[1] + px[2] > 0, scroll: document.documentElement.scrollHeight <= innerHeight + 1 }; });
let v = await visible(); assert.ok(v.inView && v.drawn && v.scroll, "地図（パネルなし）: " + JSON.stringify(v));
for (const hub of ["geo", "nations", "war", "diplo", "culture", "language", "religion", "chron", "stats", "search", "settings"]) { await page.click(`[data-hub="${hub}"]`); await page.waitForTimeout(250); v = await visible(); assert.ok(v.inView && v.drawn && v.scroll, `${hub} を開いても地図が画面内に見える: ` + JSON.stringify(v)); assert.ok((await page.textContent("#pin")).length > 20, hub + " が空"); }
await page.click('[data-hub="nations"]'); await page.waitForTimeout(150); await page.click(".vrow >> nth=0"); for (const t of ["politics", "military", "diplomacy", "tech", "doctrine"]) { await page.click(`[data-tab="${t}"]`); await page.waitForTimeout(150); assert.ok((await page.textContent("#pin")).length > 60, t); }
await page.click('[data-tab="tech"]'); assert.ok((await page.locator(".tnode").count()) >= 39, "技術ノード");
await page.click('[data-speed="3"]'); await page.waitForTimeout(1500); const d = await page.textContent("#date");
for (let i = 0; i < 12; i++) { if (await page.isVisible("#newsmodal")) await page.click("#ack"); try { await page.click('[data-speed="0"]', { timeout: 1500 }); break; } catch { /* 重大ニュースの全画面が出た。OK を押して、もう一度停止する（OK まで他の操作はできない仕様） */ } }
assert.ok(/年/.test(d));
assert.deepEqual(errs, [], errs.join("\n")); assert.deepEqual(problems, [], JSON.stringify(problems).slice(0, 300));
await browser.close(); console.log("v6.e2e OK");
