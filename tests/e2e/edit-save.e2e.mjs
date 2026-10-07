import { launch, openApp, reporter, shot, root } from "./lib.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { statSync, readFileSync } from "node:fs";
const { browser, ctx, page: page0, problems } = await launch();
let page = page0;
// 読み込み直しは「前のタブを閉じて新しいタブで開く」。同じタブでの再読込はテスト環境で不安定だったため
async function freshPage(file) {
  await page.close({ runBeforeUnload: false });
  page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => problems.push(`例外: ${e.message}`));
  await page.goto(pathToFileURL(path.join(root, "index.html")).href); await page.bringToFront();
  await page.setInputFiles("#file-input", file);
  await page.waitForFunction(() => /セル/.test(document.getElementById("status-map")?.textContent ?? ""), null, { timeout: 30000, polling: 100 });
}
const { check, done } = reporter();
const menu = async (sel) => { await page.click("#settings-menu > summary"); await page.click(`#settings-menu ${sel}`); await page.waitForTimeout(150); };
const mapBox = async () => page.locator("#map-canvas").boundingBox();
page.on("dialog", (d) => d.accept()); // 未保存の変更がある状態での再読込（beforeunload）を許可する
try {
  await openApp(page);
  console.log("=== 編集：塗る・都市を置く・Undo ===");
  await menu('[data-click="btn-edit-mode"]');
  check("編集パネルが開く", await page.locator("#edit-panel").isVisible());
  const undoDisabled = () => page.locator("#btn-undo").isDisabled();
  check("編集前は Undo できない", await undoDisabled());
  await page.locator('#edit-panel [data-tool="paint:state"]').click();
  const b = await mapBox();
  const px = () => page.evaluate(() => { const c = document.getElementById("map-canvas"); return [...c.getContext("2d").getImageData(Math.round(0.33 * c.width), Math.round(0.5 * c.height), 1, 1).data].join(","); });
  const px0 = await px();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.5, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
  check("塗ると Undo できる", !(await undoDisabled()));
  await shot(page, "31-painted");
  const pxPainted = await px();
  check("塗った場所の色が変わる", pxPainted !== px0, `${px0} → ${pxPainted}`);
  await page.click("#btn-undo"); await page.waitForTimeout(250);
  check("Undo で元に戻る", await undoDisabled());
  check("Undo で地図の見た目も元に戻る（再描画される）", (await px()) === px0, `${await px()} vs ${px0}`);
  await page.click("#btn-redo"); await page.waitForTimeout(250);
  check("Redo でやり直せる（見た目も）", !(await undoDisabled()) && (await px()) === pxPainted);
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  check("Ctrl+Z でも見た目が戻る", (await px()) === px0);
  await page.locator('#edit-panel [data-tool="select"]').click();
  await page.mouse.dblclick(b.x + b.width * 0.3, b.y + b.height * 0.45); // 単クリックは何もしない仕様。ダブルクリックで国家を開く
  await page.waitForTimeout(300);
  await shot(page, "32-select-state");
  check("選択ツールで国をダブルクリックすると詳細ウィンドウが出る", await page.locator("#sidebar").isVisible());

  console.log("=== 確認ダイアログ（実物の <dialog>）===");
  await page.keyboard.press("Escape");
  await menu('[data-open-win="list-religion"]');
  const rows = page.locator('.float-win[data-win="list-religion"] .ent-row');
  const n0 = await rows.count();
  if (n0 > 0) {
    await rows.first().locator(".ent-btn.danger").click();
    await page.waitForTimeout(150);
    const dlg = page.locator("dialog.confirm-dialog[open]");
    check("削除を押すと確認ダイアログが開く", await dlg.isVisible());
    await shot(page, "33-confirm");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    check("Esc で取り消すと削除されない", (await rows.count()) === n0 && !(await dlg.count()));
    check("Esc で取り消しても、背後の窓は開いたまま", await page.locator('.float-win[data-win="list-religion"]').isVisible());
    await rows.first().locator(".ent-btn.danger").click(); await page.waitForTimeout(150);
    await page.locator("dialog.confirm-dialog[open] .danger").click(); await page.waitForTimeout(250);
    check("確認すると1件減る", (await rows.count()) === n0 - 1, `${n0}→${await rows.count()}`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
    await menu('[data-open-win="list-religion"]');
    check("Undo で復活する", (await rows.count()) === n0, `${await rows.count()}`);
    await page.keyboard.press("Escape");
  }

  console.log("=== 戦争を作って保存 → 開き直し ===");
  await menu('[data-open-win="war"]');
  const nb = page.locator("#tab-wars .war-band button", { hasText: "新しい戦争" });
  if (await nb.count()) await nb.click();
  await page.locator("#tab-wars .war-side").nth(0).locator(".war-chip").nth(0).click();
  await page.locator("#tab-wars .war-side").nth(1).locator(".war-chip").nth(1).click();
  await page.locator("#tab-wars button", { hasText: "戦争開始" }).click(); await page.waitForTimeout(250);
  for (let i = 0; i < 6; i++) { await page.click("#btn-time-step"); await page.waitForTimeout(30); }
  const warName = await page.locator("#tab-wars .war-band button").nth(1).textContent();
  const dateBefore = await page.textContent("#world-date");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-save")]);
  const savePath = "/tmp/e2e-saved.map"; await dl.saveAs(savePath);
  check("保存ファイルができる（空でない）", statSync(savePath).size > 10000, String(statSync(savePath).size));
  await freshPage(savePath); // 前のタブを閉じて、新しいタブで保存ファイルを開く
  check("開き直しても同じ年月", (await page.textContent("#world-date")) === dateBefore, `${dateBefore} → ${await page.textContent("#world-date")}`);
  await menu('[data-open-win="war"]');
  await shot(page, "42-after-reload");
  check("開き直しても戦争が残っている", (await page.locator("#tab-wars .war-band").textContent()).includes("戦争"), warName);
  check("開き直しても戦況が出る（経過が復元される）", (await page.locator("#tab-wars .war-tab-ov").textContent()).includes("降伏まであと"));

  console.log("=== 書き出し ===");
  for (const [kind, min, head] of [["png", 5000, "PNG"], ["svg", 2000, "<svg"], ["azgaar", 10000, null], ["chronicle", 200, null]]) {
    await page.click("#export-menu > summary");
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click(`#export-menu [data-export="${kind}"]`)]);
    const pth = `/tmp/e2e-export.${kind}`; await d.saveAs(pth);
    const buf = readFileSync(pth);
    check(`${kind} を書き出せる`, buf.length > min && (!head || buf.slice(0, 200).toString("latin1").includes(head)), `${buf.length}`);
    await page.waitForTimeout(100);
  }

  console.log("=== バランス調整の保存（再読込後も残る）===");
  await freshPage("/tmp/e2e-map-11.map");
  await menu('[data-open-win="balance"]');
  const noise = page.locator('.float-win[data-win="balance"] input').nth(2);
  await noise.fill("0.05"); await noise.dispatchEvent("change");
  await freshPage("/tmp/e2e-map-11.map");
  await menu('[data-open-win="balance"]');
  check("再読込後もバランス設定が残る", (await page.locator('.float-win[data-win="balance"] input').nth(2).inputValue()) === "0.05");
  await shot(page, "34-balance");
} catch (e) { problems.push(`スクリプト例外: ${e.message.split("\n")[0]} @ ${(e.stack.match(/edit-save[^\n)]*/) ?? [""])[0]}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
