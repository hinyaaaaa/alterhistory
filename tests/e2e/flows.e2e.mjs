import { launch, openApp, reporter, shot } from "./lib.mjs";
const { browser, page, problems } = await launch();
const { check, done } = reporter();
const vis = (sel) => page.locator(sel).first().isVisible();
try {
  await openApp(page);
  console.log("=== 画面の基本構成 ===");
  check("起動直後は地図が画面いっぱい（サイドバー・凡例は出ない設計）", !(await vis("#sidebar")) && (await page.locator("#stage").boundingBox()).width > 1200);
  console.log("=== 設定メニューの全ウィンドウ ===");
  const wins = await page.$$eval("#settings-menu [data-open-win]", (bs) => bs.map((b) => [b.dataset.openWin, b.textContent.trim()]));
  for (const [id, label] of wins) {
    await page.click("#settings-menu > summary");
    await page.click(`#settings-menu [data-open-win="${id}"]`);
    await page.waitForTimeout(150);
    const w = page.locator(`.float-win[data-win="${id}"]`);
    const ok = await w.isVisible();
    const r = ok ? await w.boundingBox() : null;
    const inView = ok && r.x >= -1 && r.y >= -1 && r.x + r.width <= 1281 && r.y + r.height <= 854;
    check(`${label} が開いて画面内に収まる`, ok && inView, JSON.stringify(r));
    if (id === "war" || id === "balance") await shot(page, `10-win-${id}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    check(`${label} はEscで閉じる`, !(await w.isVisible()));
  }

  console.log("=== 戦争：宣戦布告 → タブ → 時間経過 ===");
  const openWin = async (id) => { await page.click("#settings-menu > summary"); await page.click(`#settings-menu [data-open-win="${id}"]`); await page.waitForTimeout(120); };
  await openWin("war");
  const newBtn = page.locator("#tab-wars .war-band button", { hasText: "新しい戦争" });
  if (await newBtn.count()) await newBtn.click();
  await page.locator("#tab-wars .war-side").nth(0).locator(".war-chip").nth(0).click();
  await page.locator("#tab-wars .war-side").nth(1).locator(".war-chip").nth(1).click();
  await shot(page, "20-war-declare");
  check("戦力の比較が出る", (await page.locator("#tab-wars .wo-bar-wrap").count()) >= 4);
  await page.locator("#tab-wars button", { hasText: "戦争開始" }).click();
  await page.waitForTimeout(300);
  const tabs = await page.locator("#tab-wars .war-tabs button").allTextContents();
  check("宣戦後、4タブ（概要・部隊・経過・講和）が出る", tabs.join("/") === "概要/部隊/経過/講和", tabs.join("/"));
  for (const t of tabs) { await page.locator("#tab-wars .war-tabs button", { hasText: t }).click(); await page.waitForTimeout(60); await shot(page, `21-war-tab-${t}`); }
  check("講和タブにスコア内訳がある", (await page.locator("#tab-wars .war-tab-pc").textContent()).includes("戦争スコアの内訳"));
  await page.locator("#tab-wars .war-tabs button", { hasText: "概要" }).click();
  await page.locator("#tab-wars .war-tabs button", { hasText: "講和" }).click();
  const pcText = await page.locator("#tab-wars .war-tab-pc").textContent();
  check("講和タブの優勢度が0%ではない（逆算が効いている）", !/優勢度\)?0%/.test(pcText.replace(/\s/g, "")) && !pcText.replace(/\s/g, "").includes("戦力差(優勢度)0%") && !pcText.replace(/\s/g, "").includes("戦力差（優勢度）0%"), pcText.slice(0, 80));
  await page.locator("#tab-wars .war-tabs button", { hasText: "概要" }).click();
  check("概要に降伏までの民意が出る", (await page.locator("#tab-wars .war-tab-ov").textContent()).includes("降伏まであと"));
  await page.locator("#tab-wars .war-tabs button", { hasText: "経過" }).click();
  for (let i = 0; i < 18; i++) { await page.click("#btn-time-step"); await page.waitForTimeout(40); }
  check("月を18回進めても、開いているタブ（経過）が保たれる", await page.locator("#tab-wars .war-tabs button.active").textContent() === "経過");
  await shot(page, "22-war-after-time");
  console.log("=== 講和条約ウィンドウ ===");
  await openWin("treaty");
  await shot(page, "23-treaty");
  check("講和条約の入力が出る", (await page.locator('.float-win[data-win="treaty"]').textContent()).includes("講和"));
} catch (e) { problems.push(`スクリプト例外: ${e.message}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
