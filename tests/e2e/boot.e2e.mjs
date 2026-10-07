import { launch, openApp, reporter, shot } from "./lib.mjs";
const { browser, page, problems } = await launch();
const { check, done } = reporter();
try {
  await openApp(page);
  check("地図が開き、ステータスにセル数が出る", /セル/.test(await page.textContent("#status-map")));
  await shot(page, "01-opened");
  const box = await page.locator("#map-canvas").boundingBox();
  check("地図キャンバスが十分な大きさで描かれている", box.width > 400 && box.height > 300, JSON.stringify(box));
  // キャンバスに実際に色が塗られているか（空白でないか）
  const painted = await page.evaluate(() => { const c = document.getElementById("map-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n; });
  check("地図が実際に描画されている（塗られた画素がある）", painted > 500, String(painted));
  // ズーム・パン・色分け切替・キー操作
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400); await page.waitForTimeout(200);
  await shot(page, "02-zoomed");
  for (const k of ["2", "3", "4", "5", "1", "b", "f"]) { await page.keyboard.press(k); await page.waitForTimeout(80); }
  await shot(page, "03-after-keys");
} catch (e) { problems.push(`スクリプト例外: ${e.message}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
