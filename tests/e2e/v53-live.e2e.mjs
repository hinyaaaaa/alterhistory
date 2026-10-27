// v5.3.0: 本体の index.html（dist/app.js）に組み込んだ v5.3 UI を実ブラウザで確かめる。
//   世界を開く → 開始フロー（初期集団→自動進行→国家成立）→ 歴史を進める → 一覧・詳細・時間軸・過去の閲覧・従来画面への橋渡し。
//   使い方: npm run build && node tests/e2e/v53-live.e2e.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { launch, openApp, reporter, shot, TMP } from "./lib.mjs";
import { generateWorld } from "../../js/core/world/worldgen.js";
import { worldToMap } from "../../js/core/world-bridge.js";
import { createCivState } from "../../js/core/civ/civ-state.js";
import { createCivSim } from "../../js/core/civ/civ-sim.js";
import { saveMapBytes } from "../../js/io/ahmap-file.js";
async function makeCivFile() {
  const m = worldToMap(generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } })); m.worldTime = { year: 0, month: 1 }; m.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
  const civ = createCivState(m.world, { startGroupId: 1, historySeed: 99 }); createCivSim(m.world, civ).advanceMonths(300 * 12); m.civ = civ; m.worldTime = { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 };
  const f = path.join(TMP, "e2e-civ.ahmap"); writeFileSync(f, await saveMapBytes(m, { appVersion: "e2e", savedAt: "2026-10-26" })); return f;
}
const { browser, page, problems } = await launch({ width: 1280, height: 853 });
const { check, done } = reporter();
try {
  await openApp(page, { states: 0 });
  check("v5.3 の骨格が出て、従来の外枠（ハブ・時計）は見えない", await page.evaluate(() => !!document.querySelector(".v53-root .v53-rail") && !!document.querySelector(".v53-dock") && getComputedStyle(document.getElementById("hub")).visibility !== "visible" || document.getElementById("app").getBoundingClientRect().left < -1000));
  check("地図（#stage）が中央のスロットに入り、十分な大きさで描かれる", await page.evaluate(() => { const s = document.getElementById("stage"), r = s.getBoundingClientRect(); return !!s.closest(".v53-map-slot") && r.width > 500 && r.height > 400; }));
  const painted = await page.evaluate(() => { const c = document.getElementById("map-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n; });
  check("地図が実際に描画されている", painted > 500, String(painted));
  check("歴史の開始前は、右ドックに開始フローが出る", await page.evaluate(() => window.alterhistory.v53.ui.get().startFlow === true));
  await shot(page, "v53-live-01-start");
  // 開始フロー: 初期集団を選んで始めるところまで（自動進行は重いので単体テスト側で確かめる）
  const r = await page.evaluate(() => { const A = window.alterhistory.v53.adapter, g = A.start.initialGroups(); if (!g.length) return { error: "初期集団がありません" }; const c = A.start.chooseGroup(g[0].id); if (!c.ok) return { error: c.error }; const b = A.start.begin(); return b.ok ? { ok: true } : { error: b.error }; });
  check("開始フロー: 初期集団を選んで、歴史を始められる", !!r.ok, JSON.stringify(r));
  // 国家が成立済みの世界（Node で 300 年進めて保存したもの）を開く
  const rich = await makeCivFile(); await page.setInputFiles("#file-input", rich);
  await page.waitForFunction(() => window.alterhistory.v53.adapter.meta().hasCiv && window.alterhistory.v53.adapter.meta().states >= 1, null, { timeout: 60000, polling: 200 });
  await page.evaluate(() => window.alterhistory.v53.ui.set({ startFlow: false })); await page.waitForTimeout(300);
  const adv = await page.evaluate(() => { const m = window.alterhistory.v53.adapter.meta(); return { hasCiv: m.hasCiv, states: m.states, events: m.events }; });
  check("国家と出来事が積もった世界を開ける", adv.hasCiv && adv.events > 100, JSON.stringify(adv));
  // 国家の一覧 → 詳細
  await page.evaluate(() => window.alterhistory.v53.ui.set({ domain: "state", selection: null })); await page.waitForTimeout(300);
  check("国家の一覧に行が出る（仮想スクロール）", await page.locator(".v53-vlist .v53-row").count() >= 1);
  await page.locator(".v53-vlist .v53-row").first().click(); await page.waitForTimeout(300);
  check("国家を選ぶと詳細が出て、「一覧で見る」の入口がある（件数が多い関連は一覧へ）", (await page.locator('[data-browse="history"]').count()) === 1);
  check("詳細に、空になる従来ウィンドウへの誤った入口は出ない", (await page.locator('[data-legacy="state"]').count()) === 0);
  await page.click('[data-browse="history"]'); await page.waitForTimeout(400);
  check("「この国に関わる出来事」で、歴史研究の一覧が国家で絞り込まれる（解除できる）", (await page.locator(".v53-entity-chip:not([hidden])").count()) === 1 && (await page.evaluate(() => window.alterhistory.v53.ui.get().domain)) === "history");
  await page.click(".v53-entity-chip button"); await page.waitForTimeout(300);
  check("絞り込みを解除すると、チップが消える", (await page.locator(".v53-entity-chip:not([hidden])").count()) === 0);
  await shot(page, "v53-live-02-state");
  // 従来画面への橋渡し（世界の入口）
  await page.evaluate(() => window.alterhistory.v53.ui.set({ domain: "world", selection: null })); await page.waitForTimeout(300);
  await page.click('[data-legacy-win="nation"]'); await page.waitForTimeout(400);
  check("世界の入口から、従来のウィンドウが地図の上に開く（機能を失わない）", await page.evaluate(() => window.alterhistory.wins.isOpen("nation")));
  await shot(page, "v53-live-03-legacy");
  await page.evaluate(() => { for (const id of window.alterhistory.wins.openIds()) window.alterhistory.wins.close(id); });
  // 出来事の一覧・期間・時間軸の範囲・過去の閲覧
  await page.evaluate(() => { window.alterhistory.wins.open && 0; window.alterhistory.v53.ui.set({ domain: "history", selection: null }); }); await page.waitForTimeout(300);
  check("歴史研究: 出来事の一覧に、期間の選択がある", (await page.locator('.v53-list select[aria-label="期間"]').count()) === 1);
  check("時間軸に目印が出て、範囲（全期間／直近 N 年）を切り替えられる", (await page.locator(".v53-tl-ticks .v53-tick").count()) >= 1 && (await page.locator(".v53-tl-span").count()) === 1);
  await page.selectOption(".v53-tl-span", "100"); await page.waitForTimeout(300);
  check("範囲を「直近100年」にしても時間軸が壊れない", await page.evaluate(() => { const s = document.querySelector(".v53-tl-scrub"); return Number(s.max) >= Number(s.min); }));
  const past = await page.evaluate(() => { const A = window.alterhistory.v53.adapter, m = A.meta(); A.setView(Math.max(m.first, m.now - 240)); const p = A.meta().past; A.setView(null); return { p, back: !A.meta().past }; });
  check("過去の月を見て、現在へ戻せる", past.p && past.back, JSON.stringify(past));
  await shot(page, "v53-live-04-history");
  // 再生・停止（Space は v5.3 経由）
  await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press(" "); await page.waitForTimeout(250);
  const running1 = await page.evaluate(() => window.alterhistory.timeActions.isRunning()); await page.keyboard.press(" "); await page.waitForTimeout(250);
  const running2 = await page.evaluate(() => window.alterhistory.timeActions.isRunning());
  check("Space で時間が再生・停止する（二重に切り替わらない）", running1 === true && running2 === false, `${running1}/${running2}`);
} catch (e) { problems.push(`スクリプト例外: ${e.stack ?? e.message}`); }
const fail = done(problems);
await browser.close();
process.exit(fail ? 1 : 0);
