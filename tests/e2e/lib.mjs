// 実ブラウザ（Chromium）で index.html を動かすための共通部品。
//   使い方: node tests/e2e/xxx.e2e.mjs   （事前に npm run build。Chromium は @sparticuz/chromium が同梱）
//   画面は /tmp/e2e-shots/ に保存する。コンソールエラーとページ内例外は集めて、最後に失敗として数える。
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSyntheticMapText } from "../helpers/synth-map.mjs";
const require = createRequire(import.meta.url);
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SHOTS = process.env.SHOTS_DIR ?? "/tmp/e2e-shots";
mkdirSync(SHOTS, { recursive: true });

export async function launch({ width = 1280, height = 853, touch = false } = {}) {
  const chromium = require("@sparticuz/chromium").default ?? require("@sparticuz/chromium");
  const { chromium: pw } = require("playwright-core");
  const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), headless: true }); // single-process は不安定でクリックが固まることがある
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, acceptDownloads: true });
  // 外部ネットワーク（Googleフォント等）は遮断。ローカルのファイルだけ通す
  await ctx.route((u) => !u.toString().startsWith("file:"), (r) => r.abort());
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`例外: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  return { browser, ctx, page, problems };
}

export async function openApp(page, { seed = 11 } = {}) {
  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  await page.bringToFront();
  const { text } = buildSyntheticMapText({ seed });
  const file = `/tmp/e2e-map-${seed}.map`;
  writeFileSync(file, text);
  await page.setInputFiles("#file-input", file);
  await page.waitForFunction(() => /セル/.test(document.getElementById("status-map")?.textContent ?? ""), null, { timeout: 30000, polling: 100 });
}

export function reporter() {
  let fail = 0;
  const check = (name, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : "  " + extra}`); if (!ok) fail++; };
  const done = (problems = []) => {
    for (const p of problems) { console.log(`  FAIL ${p}`); fail++; }
    console.log(fail ? `${fail} 件失敗` : "全て成功");
    return fail;
  };
  return { check, done };
}
// 画面の保存はあくまで確認用。撮れなくてもテストは失敗にしない
export const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 8000 }).catch(() => {});
