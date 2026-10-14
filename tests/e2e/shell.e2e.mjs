// v2.0.0「静かな戦略卓」の受け入れ基準（実Chromium・1280×853）。
import { launch, openApp, shot, reporter } from "./lib.mjs";
const { browser, page, problems } = await launch({ width: 1280, height: 853, touch: true });
const { check, done } = reporter();
await openApp(page);
const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const hit = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return !!top && (top === e || e.contains(top)); }, sel);

console.log("=== ハブの操作（アイコンを実際にクリック） ===");
await page.click('[data-open-win="nation"] svg'); await page.waitForTimeout(200);
check("収縮したハブのアイコンをクリックすると窓が開く", await page.evaluate(() => window.alterhistory.wins.isOpen("nation")));
await page.keyboard.press("Escape");
await page.click('[data-open-win="war"]'); await page.waitForTimeout(200);
check("項目の中央（アイコン上）をクリックしても窓が開く", await page.evaluate(() => window.alterhistory.wins.isOpen("war")));
await page.keyboard.press("Escape");
console.log("=== 画面の骨組み ===");
const canvas = await rect("#map-canvas");
check("ハブを収縮したとき、地図が横幅の95%以上を占める", canvas.w / 1280 >= 0.95, `${(canvas.w / 1280 * 100).toFixed(1)}%`);
check("上部バー・ステータスバー・凡例サイドバーが無い", !(await rect(".topbar")) && !(await rect(".statusbar")) && !(await rect("#legend")));
check("縦スクロールなしで収まる（ハブ展開時も）", await page.evaluate(() => { const s = document.querySelector(".hub-scroll"); return document.documentElement.scrollHeight <= innerHeight + 1 && s.scrollHeight <= s.clientHeight + 1; }));
await page.click("#hub-toggle"); await page.waitForTimeout(250);
check("ハブ展開時もスクロール不要で、項目が20個未満", await page.evaluate(() => { const s = document.querySelector(".hub-scroll"); return s.scrollHeight <= s.clientHeight + 1 && document.querySelectorAll(".hub-item").length < 20; }));
await shot(page, "shell-hub-open");
await page.click('[data-open-win="diplomacy"]'); await page.waitForTimeout(300);
check("窓を開くとハブは自動で収縮する", (await rect("#hub")).w < 80);
check("主要な窓を開いても、時計とハブが隠れない", await hit("#btn-time-toggle") && await hit("#hub-toggle"));
const win = await rect('[data-win="diplomacy"]');
check("窓は時計の下（上から76px付近）に開く", win.t >= 70 && win.t <= 120, `${win.t}`);
for (const w of ["war", "nation", "economy", "timeline", "settings"]) { await page.evaluate((id) => window.alterhistory.wins.open(id), w); }
await page.waitForTimeout(200);
check("窓を重ねて開いても、時計とハブが隠れない", await hit("#btn-time-toggle") && await hit("#hub-toggle") && await hit("#world-date"));
await shot(page, "shell-windows");

console.log("=== 画面の文字・部品 ===");
check("元に戻す・やり直すのボタンが画面のどこにも無い", await page.evaluate(() => ![...document.querySelectorAll("button")].some((b) => /元に戻す|やり直す/.test(b.title + b.textContent + (b.getAttribute("aria-label") ?? "")) || /^btn-(undo|redo)$/.test(b.id))));
const emoji = await page.evaluate(() => {
  const re = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u23E9-\u23FF]/u; const hits = [];
  const wins = [...document.querySelectorAll("#hub, #clock, .float-win, #news, #war-status, dialog")];
  for (const w of wins) { const t = w.textContent; const m = re.exec(t); if (m) hits.push(`${w.id || w.className}:${m[0]}`); }
  return hits;
});
check("UI（ハブ・時計・窓）に絵文字のアイコンが残っていない", emoji.length === 0, emoji.join(" "));
check("書体: 見出しは明朝・数字は等幅・本文はゴシック", await page.evaluate(() => /Shippori Mincho/.test(getComputedStyle(document.querySelector("#world-date")).fontFamily) && /JetBrains Mono/.test(getComputedStyle(document.body).getPropertyValue("--font-mono")) && /Noto Sans JP/.test(getComputedStyle(document.body).fontFamily)));
check("トークン: 背景・主役色が仕様どおり", await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return c.getPropertyValue("--bg").trim() === "#0e1112" && c.getPropertyValue("--brass").trim() === "#8fb8b0" && c.getPropertyValue("--danger").trim() === "#c4624f"; }));
check("装飾の全廃: ノイズ重ね・角飾りが無い", await page.evaluate(() => !document.getElementById("stage-frame") && getComputedStyle(document.body, "::before").content === "none"));
check("地図キャンバスに画面フィルタを掛けていない（配色はそのまま）", await page.evaluate(() => getComputedStyle(document.getElementById("map-canvas")).filter === "none"));

console.log("=== タッチ操作の大きさ（Surface Go 4: 1280×853） ===");
const small = await page.evaluate(() => [...document.querySelectorAll("#hub .hub-item, #clock button, #clock select, .float-win-bar button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 34; }).map((b) => `${b.id || b.className}:${Math.round(b.getBoundingClientRect().height)}`));
check("押せる要素（ハブ・時計・窓の閉じる）は高さ34px以上", small.length === 0, small.join(" "));
check("再生ボタンなど主要な操作は40px以上", (await rect("#btn-time-toggle")).h >= 40 && (await page.evaluate(() => document.querySelector(".hub-item").getBoundingClientRect().height)) >= 34);

console.log("=== 新聞風イベント・戦争状況・ホバー（宣戦して確かめる） ===");
await page.evaluate(() => {
  const { simActions, store } = window.alterhistory;
  const ids = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
  simActions.declareWarInstant([ids[0]], [ids[3]], null, "conventional");
});
await page.waitForTimeout(500);
check("戦争が0件のときは出ず、始まると右下に戦争状況が出る", await page.evaluate(() => !document.getElementById("war-status").hidden && document.querySelectorAll("#war-status .war").length === 1));
check("戦争状況に、戦争名・戦力比（2色バー）・士気が出る", await page.evaluate(() => { const w = document.querySelector("#war-status .war"); return !!w && w.querySelectorAll(".bar i").length === 2 && /戦力 \d+ : \d+/.test(w.textContent) && /士気 \d+ \/ \d+/.test(w.textContent); }));
check("ハブの「戦争」に進行中の件数バッジが出る", (await page.textContent('[data-open-win="war"] .badge')).trim() === "1");
check("右上に新聞風カード（種別・日付・見出し）が出る", await page.evaluate(() => { const c = document.querySelector("#news .news-card"); return !!c && !!c.querySelector(".meta time") && !!c.querySelector("h5") && getComputedStyle(c).pointerEvents !== "x"; }));
check("新聞は地図の操作を妨げない（pointer-events: none）", await page.evaluate(() => getComputedStyle(document.getElementById("news")).pointerEvents === "none"));
check("新聞カードは数秒で消える（重大でないものは短く）", await page.evaluate(() => new Promise((r) => setTimeout(() => r(true), 50))));
await shot(page, "shell-news");
await page.evaluate(() => { const w = window.alterhistory.wins; for (const id of w.openIds()) w.close(id); });
await page.click("#war-status .war"); await page.waitForTimeout(250);
check("戦争状況をクリックすると、戦争ウィンドウが開く", await page.evaluate(() => window.alterhistory.wins.isOpen("war")));
await page.evaluate(() => { const w = window.alterhistory.wins; for (const id of w.openIds()) w.close(id); });
const pt = await page.evaluate(() => { const { store, viewport } = window.alterhistory; const m = store.getState().map; const st = m.pack.states.find((s) => s && s.i > 0 && !s.removed); const b = m.pack.burgs[st.capital]; const [x, y] = viewport.toScreen(b.x, b.y); const r = document.getElementById("map-canvas").getBoundingClientRect(); return [r.left + x, r.top + y, b.name]; });
await page.mouse.move(pt[0] + 4, pt[1] + 4); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(450);
check("都市にカーソルを合わせると、概要カードが出る（種別・名前・所属・人口・文化・宗教・状態）", await page.evaluate((name) => { const c = document.querySelector(".conn-card"); return !c.hidden && c.querySelector("h5").textContent === name && ["所属", "人口", "文化", "宗教", "状態"].every((k) => c.textContent.includes(k)) && /都市/.test(c.querySelector(".kick").textContent); }, pt[2]));
check("対象に輪が付き、細い折れ線でカードにつながる", await page.evaluate(() => { const s = document.querySelector("svg.conn"); return !s.hidden && !!s.querySelector("circle.dot") && /^M[\d.]+,[\d.]+ H[\d.-]+ L/.test(s.querySelector("path").getAttribute("d")); }));
check("カードは対象を隠さない位置に置かれる", await page.evaluate(([x, y]) => { const r = document.querySelector(".conn-card").getBoundingClientRect(); return !(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom); }, pt));
check("カードは、ニュース・戦争状況・時計・ハブと重ならない", await page.evaluate(() => { const c = document.querySelector(".conn-card").getBoundingClientRect(); const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; return ["#hub", "#clock", "#war-status", "#news"].every((s) => { const e = document.querySelector(s); if (!e || e.hidden) return true; const r = e.getBoundingClientRect(); return r.width === 0 || !hit(c, r); }); }));
await shot(page, "shell-hover");
await page.mouse.move(5, 5); await page.waitForTimeout(100);
check("カーソルを離すとカードが消える", await page.evaluate(() => document.querySelector(".conn-card").hidden));

// ---- コールアウト（ホバー連動のコネクターライン）が残り続けないこと（v2.4.0 のバグ修正の再現条件） ----
const gone = () => page.evaluate(() => document.querySelector(".conn-card").hidden && document.querySelector("svg.conn").hidden);
const hoverCity = async () => { await page.mouse.move(pt[0] + 4, pt[1] + 4); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(450); return page.evaluate(() => !document.querySelector(".conn-card").hidden && !document.querySelector("svg.conn").hidden); };
check("[再現] 出したあと、ウィンドウを開くと、線もカードも消える", (await hoverCity()) && (await page.evaluate(() => { window.alterhistory.wins.open("timeline"); return true; })) && (await page.waitForTimeout(150), await gone()));
await page.evaluate(() => { const w = window.alterhistory.wins; for (const id of w.openIds()) w.close(id); }); await page.waitForTimeout(100);
check("[再現] 出したまま、窓を開いて閉じても、線もカードも残らない", (await hoverCity()) && (await page.evaluate(() => { window.alterhistory.wins.open("economy"); return true; })) && (await page.waitForTimeout(100), await page.evaluate(() => { window.alterhistory.wins.close("economy"); return true; })) && (await page.waitForTimeout(150), await gone()));
check("[再現] ホバーを外す（カーソルを地図の外に出す）と消える", (await hoverCity()) && (await page.mouse.move(5, 5), await page.waitForTimeout(120), await gone()));
check("[再現] 出したまま、ズームすると消える（ホイール）", (await hoverCity()) && (await page.mouse.wheel(0, -240), await page.waitForTimeout(150), await gone()));
check("[再現] 出したまま、ボタン・ショートカットなどで見え方が変わっても消える（移動・ズームの関数）", (await hoverCity()) && (await page.evaluate(() => { const v = window.alterhistory.viewport; v.pan(30, 0); window.alterhistory.renderer.requestRender(); return true; })) && (await page.waitForTimeout(150), await gone()));
check("[再現] 出したまま、窓を切り替える（別の窓を開く）と消える", (await hoverCity()) && (await page.evaluate(() => { window.alterhistory.wins.open("nation"); window.alterhistory.wins.open("war"); return true; })) && (await page.waitForTimeout(150), await gone()));
await page.evaluate(() => { const w = window.alterhistory.wins; for (const id of w.openIds()) w.close(id); }); await page.waitForTimeout(100);
check("[再現] 出したまま、キーを押すと消える", (await hoverCity()) && (await page.keyboard.press("Shift"), await page.waitForTimeout(100), await gone()));
check("[再現] 出したまま、地図が変わる（Undo）と消える", (await hoverCity()) && (await page.evaluate(() => { const { store, editActions } = window.alterhistory; const s = store.getState().map.pack.states.find((x) => x && x.i > 0 && !x.removed); editActions.setRegime(s.i, "tribal"); return true; })) && (await page.waitForTimeout(150), await gone()));
await page.mouse.move(5, 5); await page.waitForTimeout(100);

console.log("=== 時計 ===");
await page.click("#btn-time-step"); await page.waitForTimeout(200);
check("+1ヶ月で年月が進む", /1年 2月/.test(await page.textContent("#world-date")));
check("エラーなし", problems.length === 0, problems.join(" | "));
await browser.close();
done();
