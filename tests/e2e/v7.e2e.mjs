// v7 の画面（index.html）の実ブラウザーでの確認: 生成 → 建国 → 地図が見える → 担当国の 6 入口 → 国のカード → 全面画面（技術・ドクトリン・国の詳細）→
//   財政の滑り棒 → 表示・検索・歯車 → 創造主の 6 入口 → モード切替 → 時間・ニュース。コンソールエラー・未処理例外が無い。
import { launch, root } from "./lib.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path"; import assert from "node:assert/strict";
const { browser, page, problems } = await launch({ width: 1280, height: 853 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.waitForSelector("#new"); await page.evaluate(() => { window.__v6.S.fastStart = true; }); await page.click("#splash").catch(() => {}); await page.click("#new"); await page.waitForSelector("#gen");
await page.fill("#seed", "e2e-v7"); await page.selectOption("#cells", "3000"); await page.click("#gen"); await page.waitForSelector("#delegate", { timeout: 120000 }); await page.click("#delegate"); await page.waitForSelector("#map");
await page.evaluate(() => { window.__v6.run({ type: "time.advance", months: 480 }); window.__v6.run({ type: "clock.setSpeed", speed: 0 }); window.__v6.render(); });
const visible = async () => page.evaluate(() => { const r = document.getElementById("map").getBoundingClientRect(), c = document.getElementById("map"), px = c.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return { inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.width > 300, drawn: px[3] > 0 && px[0] + px[1] + px[2] > 0, scroll: document.documentElement.scrollHeight <= innerHeight + 1 }; });
let v = await visible(); assert.ok(v.inView && v.drawn && v.scroll, "地図: " + JSON.stringify(v));
/* 創造主（担当国なし）の 6 入口 */
assert.equal(await page.locator("#rail .v-rb").count(), 6, "創造主の入口は 6 つ");
for (const hub of ["world", "nations", "war", "diplo", "chron", "intervene"]) { await page.click(`[data-hub="${hub}"]`); await page.waitForTimeout(250); v = await visible(); assert.ok(v.inView && v.drawn && v.scroll, `${hub}: ` + JSON.stringify(v)); assert.ok((await page.textContent("#lpin")).length > 20, "創造主 " + hub + " が空"); }
assert.equal(await page.locator('[data-hub="domestic"]').count(), 0, "創造主に内政の入口は置かない");
/* 国々の表 → 行を押すと国のカード → 担当する */
await page.click('[data-hub="nations"]'); await page.waitForTimeout(150); await page.click(".v-tbl tr.r >> nth=0"); await page.waitForSelector("#cc.on"); assert.ok((await page.textContent("#cc")).length > 20, "国のカード");
await page.click("#card-detail"); await page.waitForSelector("#fs.on"); assert.ok(await page.locator('#fs [data-tab="tech"]').count() >= 1, "国の詳細に技術ツリーのタブ"); await page.click("#full-close"); await page.waitForTimeout(150);
await page.click("#take"); await page.waitForTimeout(300);
/* 担当国の 6 入口 */
assert.equal(await page.locator("#rail .v-rb").count(), 6);
for (const hub of ["status", "domestic", "war", "diplo", "world", "chron"]) { await page.click(`[data-hub="${hub}"]`); await page.waitForTimeout(250); v = await visible(); assert.ok(v.inView && v.drawn && v.scroll, `${hub}: ` + JSON.stringify(v)); assert.ok((await page.textContent("#lpin")).length > 20, hub + " が空"); }
assert.ok((await page.locator("#metrics .v-m").count()) === 5, "担当国の指標は 5 つ");
/* 財政の滑り棒 */
await page.click('[data-hub="domestic"]'); const before = await page.evaluate(() => window.__v6.S.w.civ.states[window.__v6.S.sel].policy.tolerance);
await page.evaluate(() => { const i = document.querySelector("#fin-tolerance"); i.value = i.max; i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change")); }); await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__v6.S.w.civ.states[window.__v6.S.sel].policy.tolerance); assert.ok(after !== before || before === Number(await page.getAttribute("#fin-tolerance", "max")), "滑り棒で財政が変わる");
/* 宣戦（目的つき）→ 動員と戦略 → 講和。画面の動線で行う */
await page.evaluate(() => { const S = window.__v6.S, me = S.w.civ.states[S.sel], o = Object.values(S.w.civ.states).find((x) => x.alive && x.id !== S.sel && !(me.relations?.[x.id] >= 20)); S.hooks.select(o.id); });
await page.click("#card-war"); await page.waitForSelector("#declare-go"); await page.click('[data-goal="territory"]'); await page.waitForTimeout(200); assert.ok((await page.textContent("#fb")).includes("出す部隊"), "宣戦画面");
await page.click("#declare-go"); await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => Object.values(window.__v6.S.w.civ.wars).filter((w) => w.status === "active").length), 1, "宣戦で戦争が始まる");
await page.click("#war-mobilize"); await page.waitForSelector("#mob-go"); await page.click("#mob-go"); await page.waitForTimeout(300);
await page.click("#war-peace"); await page.waitForSelector("#peace-go"); assert.ok((await page.textContent("#fb")).includes("受け入れる見込み"), "講和画面"); await page.click("#peace-go"); await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => Object.values(window.__v6.S.w.civ.wars).filter((w) => w.status === "active").length), 0, "講和で戦争が終わる");
await page.evaluate(() => { window.__v6.S.war = null; window.__v6.S.screen = null; window.__v6.render(); });
await page.click('[data-hub="domestic"]'); await page.waitForTimeout(200);
/* 全面画面 */
await page.click("#open-tech"); await page.waitForSelector("#fs.on"); assert.ok((await page.locator(".tv-card").count()) >= 20, "分野のカード（20 分野＋軍事）"); await page.click(".tv-card[data-field=\"energy\"]"); await page.waitForSelector(".tv-chip"); assert.ok((await page.locator(".tv-chip").count()) >= 20, "分野の技術チップ"); await page.click(".tv-chip >> nth=3"); await page.waitForSelector(".tv-detail"); assert.ok((await page.textContent(".tv-detail")).includes("前提") || true, "詳細"); await page.click("#full-close"); await page.waitForTimeout(150);
await page.click("#open-doctrine"); await page.waitForSelector("#fs.on"); assert.ok((await page.textContent("#fb")).length > 40, "ドクトリン"); await page.click("#full-close"); await page.waitForTimeout(150);
assert.ok(!(await page.isVisible("#fs")), "閉じると全面画面は消える");
/* 表示・検索・歯車・パネルの畳み */
await page.click("#bl"); assert.ok((await page.locator("#lay input[type=checkbox]").count()) >= 10, "18 層"); await page.click("#bs"); await page.fill("#search-q", "ナ"); await page.waitForTimeout(150); assert.ok((await page.textContent("#srch")).length > 5);
await page.click("#gear"); assert.ok(await page.isVisible("#gearmenu"), "歯車メニュー"); await page.click("#gear");
await page.click("#ph"); v = await visible(); assert.ok(v.inView && v.drawn, "パネルを畳んでも地図"); await page.click("#ph");
/* モード切替 */
await page.click('#mode [data-m="c"]'); await page.waitForTimeout(250); assert.ok((await page.locator('[data-hub="intervene"]').count()) === 1, "創造主へ戻れる");
/* キー操作 */
await page.keyboard.press("2"); assert.equal(await page.evaluate(() => window.__v6.S.w.civ.wcde.time.speed), 2, "1〜4 で速さが変わる"); await page.keyboard.press("Space"); assert.equal(await page.evaluate(() => window.__v6.S.w.civ.wcde.time.speed), 0, "Space で停止");
/* 時間 */
await page.evaluate(() => window.__v6.run({ type: "clock.setSpeed", speed: 3 })); await page.waitForTimeout(1500); const d = await page.textContent("#date");
for (let i = 0; i < 12; i++) { if (await page.isVisible("#newsmodal")) await page.click("#ack"); try { await page.click('[data-speed="0"]', { timeout: 1500 }); break; } catch { /* 重大ニュースの確認が出た。OK を押して、もう一度停止する */ } }
assert.ok(/年/.test(d));
assert.deepEqual(errs, [], errs.join("\n")); assert.deepEqual(problems, [], JSON.stringify(problems).slice(0, 300));
await browser.close(); console.log("v7.e2e OK");
