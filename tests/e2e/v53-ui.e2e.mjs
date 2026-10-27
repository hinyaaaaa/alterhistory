// v5.3 UI を実ブラウザ（Chromium）で確かめる。模擬世界に単体でつなぐ（本体の index.html には触れない）。
//   使い方: node tests/e2e/v53-ui.e2e.mjs    画面は /tmp/e2e-shots/v53-*.png
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { launch, root, SHOTS } from "./lib.mjs";

const out = "/tmp/v53-e2e"; mkdirSync(out, { recursive: true });
await build({ entryPoints: [path.join(root, "js/ui/v53/preview.js")], bundle: true, format: "iife", outfile: path.join(out, "preview.js"), logLevel: "silent" });
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${pathToFileURL(path.join(root, "css/v53.css")).href}"><style>html,body{height:100%;margin:0;background:#0d1214}</style></head><body><div id="v53-root" style="height:100%"></div><script src="./preview.js"></script></body></html>`;
writeFileSync(path.join(out, "index.html"), html);
const URL_ = (q = "") => pathToFileURL(path.join(out, "index.html")).href + q;

let failed = 0; const check = (l, ok, extra = "") => { if (!ok) failed++; console.log(`  ${ok ? "OK  " : "FAIL"} ${l}${extra ? ` — ${extra}` : ""}`); };
const { browser, page, problems } = await launch({ width: 1280, height: 853 });
const box = async (sel) => page.locator(sel).first().boundingBox();
// 実際の再生中に重大イベントが届くことがある（正しい動作）。画面遷移の前に確認し終える
const clearMajors = async () => { for (let i = 0; i < 10 && await page.locator(".v53-major:not([hidden])").count(); i++) { await page.click('[data-act="confirm"]'); await page.waitForTimeout(50); } };
const shot = async (n) => { await page.waitForTimeout(350); return page.screenshot({ path: path.join(SHOTS, `v53-${n}.png`) }); };

console.log("=== 1280×853（モックと同じ寸法） ===");
await page.goto(URL_()); await page.waitForSelector(".v53-ri");
let rail = await box(".v53-rail"), stage = await box(".v53-stage"), dock = await box(".v53-dock"), clock = await box(".v53-clock"), band = await box(".v53-timeline");
check("レール 56px・ドック 400px・地図 824px 以上（モックの確定寸法）", Math.round(rail.width) === 56 && Math.round(dock.width) === 400 && stage.width >= 824, `rail ${rail.width} / map ${stage.width} / dock ${dock.width}`);
check("時計は地図の上部中央、履歴帯は地図の下端、ウィンドウは重ならない", Math.abs(clock.x + clock.width / 2 - (stage.x + stage.width / 2)) < 4 && clock.y < 40 && Math.abs(band.y + band.height - (stage.y + stage.height)) < 24 && band.x >= stage.x && band.x + band.width <= stage.x + stage.width);
check("横スクロールが出ない", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const ph = await page.evaluate(() => ({ play: document.querySelector('[data-act="play"]').getBoundingClientRect().height, ri: document.querySelector(".v53-ri").getBoundingClientRect().height, btn: document.querySelector(".v53-actions .v53-btn")?.getBoundingClientRect().height ?? 44 }));
check("主要ボタンの高さが 36px 以上（タッチでも押せる）", ph.play >= 36 && ph.ri >= 40 && ph.btn >= 36, JSON.stringify(ph));
await shot("1-overview");

await clearMajors(); await page.click('[data-domain="state"]'); await page.waitForSelector(".v53-row");
await page.locator(".v53-row").first().click(); await page.waitForSelector(".v53-stats");
check("国家の詳細: 概要・状態・操作が出る", (await page.locator(".v53-sec h3").allTextContents()).includes("状態"));
await shot("2-state-detail");

await page.click('[data-act="step"]');
await page.evaluate(() => { const s = document.querySelector(".v53-tl-scrub"); s.value = String(Number(s.max) - 600); s.dispatchEvent(new Event("change", { bubbles: true })); });
await page.waitForSelector('.v53[data-past="true"]');
check("過去の閲覧: 読み取り専用の表示・操作の無効・現在へ戻る", (await page.locator('[data-act="play"]').isDisabled()) && (await page.locator(".v53-clock-ro").isVisible()) && (await page.locator('[data-act="return"]').isVisible()));
await shot("3-past");
await page.click('[data-act="return"]');

await page.evaluate(() => window.__v53.app.notifier.ingest([{ id: "demo1", month: 4800, kind: "state_dissolved", title: "コルナ帝国、国境を越える", detail: "北辺の関税紛争が武力衝突へ発展した。", causeText: "長い戦争による疲弊を受けて", actors: [], impact: { actorPopShare: 0.4, territoryShare: 0.3, actorCount: 1, ripple: 3, player: true } }]));
await page.waitForSelector(".v53-paper");
const paper = await box(".v53-paper"); check("重大イベント: 新聞が画面の中に収まり、確認ボタンが押せる", paper.x >= 0 && paper.y >= 0 && paper.x + paper.width <= 1280 && paper.y + paper.height <= 853 && await page.locator('[data-act="confirm"]').isVisible());
await shot("4-major"); await page.click('[data-act="confirm"]');
await page.evaluate(() => window.__v53.app.notifier.ingest([{ id: "t1", month: 4800, kind: "war_declared", title: "アルカディア戦争が始まる", causeText: "国境の緊張を受けて", impact: { actorPopShare: 0.1, actorCount: 2 } }]));
await shot("5-toast");

await clearMajors(); await page.click('[data-domain="export"]'); await page.waitForSelector(".v53-card");
check("出力: 4 項目のカード", (await page.locator(".v53-card").count()) === 4); await shot("6-export");
await clearMajors(); await page.click('[data-domain="war"]'); await page.waitForSelector(".v53-row"); await page.locator(".v53-row").first().click(); await page.waitForSelector(".v53-progress-steps"); await shot("7-war");

console.log("=== 開始フロー（世界が無い状態から） ===");
await page.goto(URL_("?phase=empty")); await page.waitForSelector(".v53-start");
check("開始フローがドックの中に出る（地図の上に重ならない）", (await box(".v53-start")).x >= (await box(".v53-stage")).x + (await box(".v53-stage")).width - 2); await shot("8-start-world");
await page.click('[data-act="generate"]'); await page.waitForSelector(".v53-group"); await page.locator(".v53-group").nth(1).click(); await shot("9-start-group");
await page.click('[data-act="begin"]'); await page.waitForSelector('[data-phase="ready"]', { timeout: 20000 }); await shot("10-start-ready");
await page.click('[data-act="found"]'); await page.waitForSelector(".v53-list");
check("国家成立後はドックが国家の一覧になる", true);

console.log("=== 狭い画面 ===");
await page.setViewportSize({ width: 900, height: 700 }); await page.goto(URL_()); await page.waitForSelector(".v53-ri");
const s2 = await box(".v53-stage"), d2 = await box(".v53-dock-host");
check("1100px 未満ではドックが地図に重なり、地図は全幅のまま使える", s2.width >= 900 - 56 - 2 && d2.x + d2.width <= 900 + 1, `map ${s2.width}`); await shot("11-narrow");
check("コンソールエラー・例外がない", problems.length === 0, problems.slice(0, 3).join(" | "));
await browser.close(); console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
