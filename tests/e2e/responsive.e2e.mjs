import { launch, openApp, reporter, shot } from "./lib.mjs";
const { check, done } = reporter();
const allProblems = [];
for (const [label, width, height, touch] of [["Surface Go 4 相当(1280x853)", 1280, 853, false], ["小さめノート(1024x700)", 1024, 700, false], ["タブレット縦(768x1024)", 768, 1024, true], ["スマホ(390x844)", 390, 844, true]]) {
  console.log(`=== ${label} ===`);
  const { browser, page, problems } = await launch({ width, height, touch });
  try {
    await openApp(page);
    const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("ページ全体が横にはみ出さない", (await overflowX()) <= 1, String(await overflowX()));
    const barBtns = await page.$$eval("header button, header summary, #topbar button, .topbar button", (els) => els.filter((e) => e.offsetParent && (e.tagName === "SUMMARY" || !e.closest("details:not([open])"))).map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, (e.id || e.textContent.trim().slice(0, 8)), r.width]; }));
    const off = barBtns.filter(([l, r]) => l < -1 || r > width + 1);
    check("上部バーのボタンが画面外に出ない", off.length === 0, JSON.stringify(off));
    await shot(page, `60-${width}-top`);
    const wins = await page.$$eval("#settings-menu [data-open-win]", (bs) => bs.map((b) => [b.dataset.openWin, b.textContent.trim()]));
    const bad = [];
    for (const [id, name] of wins) {
      await page.click("#settings-menu > summary");
      await page.click(`#settings-menu [data-open-win="${id}"]`);
      await page.waitForTimeout(120);
      const r = await page.locator(`.float-win[data-win="${id}"]`).boundingBox();
      if (!r || r.x < -1 || r.y < -1 || r.x + r.width > width + 1 || r.y + r.height > height + 1) bad.push(`${name}${r ? `(${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)})` : "(開かない)"}`);
      if (id === "war" || id === "military") await shot(page, `61-${width}-${id}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);
    }
    check("全ウィンドウが画面内に収まる", bad.length === 0, bad.join(" / "));
    check("窓を開いたあともページが横にはみ出さない", (await overflowX()) <= 1);
    if (touch) {
      const small = await page.$$eval("#settings-menu summary, .time-btn, #btn-undo, #btn-redo", (els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.className || e.tagName, Math.min(r.width, r.height)]; }).filter(([, m]) => m < 32));
      check("タッチ向け：主要ボタンの短辺が32px以上", small.length === 0, JSON.stringify(small));
    }
  } catch (e) { problems.push(`スクリプト例外: ${e.message.split("\n")[0]}`); }
  allProblems.push(...problems.map((p) => `[${label}] ${p}`));
  await browser.close();
}
const fail = done(allProblems);
process.exit(fail ? 1 : 0);
