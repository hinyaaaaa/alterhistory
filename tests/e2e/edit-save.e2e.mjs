import { launch, openApp, reporter, shot, root, TMP } from "./lib.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { statSync, readFileSync } from "node:fs";
let { browser, ctx, page, problems } = await launch();
// 読み込み直しは「ブラウザを起こし直して開く」。同じタブの再読込も2つ目のタブも、このテスト環境では不安定だったため
async function freshPage(file) {
  // ブラウザごと起こし直す（2つ目のタブは、このテスト環境では読み込みが固まるため）。保存したファイルはディスクにあるので影響しない
  await browser.close().catch(() => {});
  const fresh = await launch();
  browser = fresh.browser; ctx = fresh.ctx; page = fresh.page;
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => problems.push(`例外: ${e.message}`));
  await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "domcontentloaded" }); await page.bringToFront();
  await page.setInputFiles("#file-input", file);
  await page.waitForFunction(() => /セル/.test(document.getElementById("status-map")?.textContent ?? ""), null, { timeout: 30000, polling: 100 });
}
const { check, done } = reporter();
const menu = async (sel) => { await page.click(sel.replace('[data-click="btn-edit-mode"]', "#btn-edit-mode")); await page.waitForTimeout(150); };
const mapBox = async () => page.locator("#map-canvas").boundingBox();
page.on("dialog", (d) => d.accept()); // 未保存の変更がある状態での再読込（beforeunload）を許可する
try {
  await openApp(page);
  console.log("=== 編集：塗る・都市を置く・Undo ===");
  await menu('[data-click="btn-edit-mode"]');
  check("編集パネルが開く", await page.locator("#edit-panel").isVisible());
  const undoDisabled = async () => !(await page.evaluate(() => window.alterhistory.store.canUndo()));
  check("編集前は Undo できない", await undoDisabled());
  // 国を塗るのは、国家タブの「領土を塗る」から（地図編集のボタンは 気候帯・標高・マーカー だけ）
  check("地図編集のボタンは 選択・気候帯・標高・マーカー の4つ", (await page.locator("#edit-panel [data-tool]").evaluateAll((bs) => bs.map((b) => b.dataset.tool).join())) === "select,paint:biome,paint:height,add:marker");
  await page.evaluate(() => { const s = window.alterhistory.store.getState().map.pack.states.find((x) => x && x.i > 0 && !x.removed); window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:state", target: s.i } })); });
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
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  check("Undo で元に戻る", await undoDisabled());
  check("Undo で地図の見た目も元に戻る（再描画される）", (await px()) === px0, `${await px()} vs ${px0}`);
  await page.keyboard.press("Control+y"); await page.waitForTimeout(250);
  check("Redo でやり直せる（見た目も）", !(await undoDisabled()) && (await px()) === pxPainted);
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  check("Ctrl+Z でも見た目が戻る", (await px()) === px0);
  // 標高の調整: ドラッグで標高が上がり、Undo で戻る（水域は変わらない）
  await page.locator('#edit-panel [data-tool="paint:height"]').click();
  const hSum = () => page.evaluate(() => { const h = window.alterhistory.store.getState().map.geometry.pack.h; let land = 0, water = 0; for (let i = 0; i < h.length; i++) { if (h[i] >= 20) land += h[i]; else water++; } return [land, water]; });
  const [land0, water0] = await hSum();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.5, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const [land1, water1] = await hSum();
  check("標高ツールで塗ると、陸の標高の合計が上がる（v5 では海が陸になることもある）", land1 > land0, `${land0}→${land1}`);
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  { const [l2, w2] = await hSum(); check("標高の調整も Undo で戻る（陸の標高も水域の数も）", l2 === land0 && w2 === water0, `${l2}/${w2} vs ${land0}/${water0}`); }
  await page.locator('#edit-panel [data-tool="select"]').click();
  // 単クリックは何もしない仕様。ダブルクリックで国家を開く。国の領土は実行ごとに違うので、国に当たるまで地図上の点を順に試す
  const detailVisible = () => page.locator('[data-win="nation"] .nation-detail').isVisible();
  let opened = false;
  for (const fy of [0.45, 0.35, 0.55, 0.65, 0.25, 0.75]) { for (const fx of [0.3, 0.4, 0.5, 0.6, 0.7, 0.2, 0.8]) { await page.mouse.dblclick(b.x + b.width * fx, b.y + b.height * fy); await page.waitForTimeout(150); if (await detailVisible()) { opened = true; break; } } if (opened) break; }
  await shot(page, "32-select-state");
  check("選択ツールで国をダブルクリックすると、国家タブの詳細が出る", opened);

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
  const savePath = `${TMP}/e2e-saved.ahmap`; await dl.saveAs(savePath);
  check("保存ファイルができる（空でない）", statSync(savePath).size > 10000, String(statSync(savePath).size));
  await freshPage(savePath); // ブラウザを起こし直して、保存ファイルを開く
  check("開き直しても同じ年月", (await page.textContent("#world-date")) === dateBefore, `${dateBefore} → ${await page.textContent("#world-date")}`);
  await menu('[data-open-win="war"]');
  await shot(page, "42-after-reload");
  check("開き直しても戦争が残っている", (await page.locator("#tab-wars .war-band").textContent()).includes("戦争"), warName);
  check("開き直しても戦況が出る（経過が復元される）", (await page.locator("#tab-wars .war-tab-ov").textContent()).includes("降伏まであと"));

  console.log("=== 書き出し ===");
  for (const [kind, min, head] of [["png", 5000, "PNG"], ["svg", 2000, "<svg"], ["chronicle", 200, null]]) {
    await page.evaluate(() => window.alterhistory.wins.open("export"));
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click(`[data-win="export"] [data-export="${kind}"]`)]);
    const pth = `${TMP}/e2e-export.${kind}`; await d.saveAs(pth);
    const buf = readFileSync(pth);
    check(`${kind} を書き出せる`, buf.length > min && (!head || buf.slice(0, 200).toString("latin1").includes(head)), `${buf.length}`);
    await page.waitForTimeout(100);
  }

  console.log("=== バランス調整は地図に保存される（保存→開き直しで残る／別の地図には持ち越さない）===");
  await freshPage(`${TMP}/e2e-world-11.ahmap`);
  await page.evaluate(() => window.alterhistory.wins.open("balance"));
  const noiseInput = () => page.locator('.float-win[data-win="balance"] input').nth(2);
  const noise = noiseInput();
  await noise.fill("0.05"); await noise.dispatchEvent("change");
  const [dlBal] = await Promise.all([page.waitForEvent("download"), page.click("#btn-save")]);
  const balPath = `${TMP}/e2e-saved-balance.ahmap`; await dlBal.saveAs(balPath);
  await freshPage(balPath);
  await page.evaluate(() => window.alterhistory.wins.open("balance"));
  check("保存した地図を開き直すと、バランス設定が残る", (await noiseInput().inputValue()) === "0.05");
  await freshPage(`${TMP}/e2e-world-11.ahmap`);
  await page.evaluate(() => window.alterhistory.wins.open("balance"));
  check("上書きの無い別の地図には、前の地図の値を持ち越さない（既定値）", (await noiseInput().inputValue()) === "0.18");
  await shot(page, "34-balance");
} catch (e) { problems.push(`スクリプト例外: ${e.message.split("\n")[0]} @ ${(e.stack.match(/edit-save[^\n)]*/) ?? [""])[0]}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
