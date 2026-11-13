// v6.5.0: 内政・軍事・外交・戦争・世界の外交・統計の確認は、画面を作り替えたため tests/v650-ui.test.mjs へ移した。
// v6.0.0 M8: 画面（dist/v6.js）のスモークテスト。jsdom 上で、生成 → 建国 → 全ハブの表示 → 時間・ニュース・介入・外交・戦争・樹形図・保存 が実データでつながっていることを確かめる。
// 視覚品質は自動テストでは判定しない（地図のキャンバス描画は jsdom に無いため、呼び出しだけを検証する）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
let blobs = 0; window.URL.createObjectURL = () => { blobs++; return "blob:x"; }; window.HTMLAnchorElement.prototype.click = function () {}; window.structuredClone = structuredClone; Object.assign(window, { CompressionStream, DecompressionStream, TextEncoder, TextDecoder }); // jsdom には無い（実ブラウザーにはある）
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (el, v, ev = "change") => { el.value = v; el.dispatchEvent(new window.Event(ev, { bubbles: true })); };
const V = () => window.__v6, hub = (k) => click($(`[data-hub="${k}"]`)), tab = (k) => click($(`[data-tab="${k}"]`)), txt = () => $("#pin").textContent;
for (let i = 0; i < 100 && !$("#new"); i++) await wait(20);
window.__v6.S.fastStart = true; click($("#new")); for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20); // v6.6.0: タイトル → 世界の設定

await check("世界を生成 → 建国（世界に任せる）。骨格: 左ハブ・パネル・地図・コールアウト・時計（右のニュース欄・凡例は無い）", async () => {
  set($("#cells"), "3000"); set($("#seed"), "ui-smoke"); click($("#gen")); for (let i = 0; i < 400 && !$("#delegate"); i++) await wait(50); assert.ok($("#delegate")); click($("#delegate"));
  assert.ok($("#hub") && $("#panel") && $("#mapwrap") && $("#callout") && $("#newscall") && $("#clock")); assert.ok(!$("#right") && !$("#leg"), "右のニュース欄・凡例は廃止"); assert.deepEqual($$("#hub button").map((b) => b.dataset.hub), ["geo", "nations", "war", "mil", "diplo", "culture", "language", "religion", "stats", "creator", "settings"]); assert.ok(!$("#panel").classList.contains("open"), "最初は地図が最大"); V().run({ type: "clock.setSpeed", speed: 0 });
});
await check("日時と速度の操作がある。右のニュース欄・関連イベント・固定トップバーはない", () => { assert.ok($("#date").textContent.includes("年") && $$("[data-speed]").length >= 4); assert.ok(!$("#related") && !$("#topbar") && !$("#right") && !$("#feed")); });
await check("時間を進めると日時・ニュースが更新され、世界が実際に進む", () => { const w = V().S.w, mi = w.civ.monthIndex; assert.ok(V().run({ type: "clock.run", months: 60 }).ok); V().render(); assert.ok(w.civ.monthIndex > mi); });
await check("【地理】レイヤーを自由に重ねられる（塗り・記号・線）。プリセット・凡例は無い。パネル切替で地図の位置・拡大がリセットされない", () => {
  hub("geo"); assert.ok($("#panel").classList.contains("open")); const M = V().S.map; M.view = { x: -30, y: -20, k: 2.5 }; click($("#ly-cultures")); assert.ok(M.isOn("cultures"), "塗りを選べる"); click($("#ly-war")); assert.ok(M.isOn("war") && M.isOn("cultures"), "重ねは複数");
  assert.ok($$("[data-preset]").length === 0 && !$("#leg"), "プリセットと凡例は廃止"); hub("stats"); hub("geo"); assert.deepEqual([M.view.x, M.view.y, M.view.k], [-30, -20, 2.5], "地図の位置・倍率を保つ");
});
await check("【地図】クリックでコールアウトが出る（国家・都市・入口ボタン）", () => { const w = V().S.w, st = Object.values(w.civ.states).find((s) => s.alive); const M = V().S.map; M.onPick({ cell: 0, stateId: st.id, group: null, settlement: null, x: 100, y: 100 }); assert.ok($("#callout").classList.contains("on")); assert.ok($("#callout").textContent.includes(st.name)); assert.ok(/詳細/.test($("#callout").textContent)); });
await check("【国家】一覧は成立が新しい順。クリックしても担当は変わらない。詳細に 5 タブ", async () => {
  hub("nations"); await wait(60); const w = V().S.w, rows = $$(".lrow"); assert.ok(rows.length > 1); const alive = Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.formedAt - a.formedAt); assert.ok(rows[0].textContent.includes(alive[0].name), "最新の国家が先頭"); const before = w.civ.wcde.control.stateId; click(rows[0]); assert.equal(w.civ.wcde.control.stateId, before, "クリックでは担当は変わらない");
  assert.deepEqual($$("[data-tab]").map((b) => b.dataset.tab), ["politics", "military", "diplomacy", "tech", "doctrine"]); for (const t of ["politics", "military", "diplomacy", "tech", "doctrine"]) { tab(t); assert.ok(txt().length > 40, t); }
});
await check("【技術ツリー】実データの全ノードが四方位の放射状に並び、状態を区別し、ドラッグ・ホイールで操作できる", () => {
  tab("tech"); assert.ok($$(".tnode").length >= 39, "ノード " + $$(".tnode").length); assert.ok(/制度化/.test(txt()) && /未発見/.test(txt())); const svg = $("svg.tree"); svg.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -100, clientX: 10, clientY: 10, bubbles: true, cancelable: true })); assert.ok(svg.getAttribute("viewBox").split(" ")[2] < 1000, "ズームで viewBox が変わる"); click($$(".tnode")[3]); assert.ok(/国内の普及/.test(txt()));
});
await check("【ドクトリン】共通と政体固有の木・取得条件・理由の表示", () => { tab("doctrine"); assert.ok($$(".tnode").length >= 30); assert.ok(/共通 5 系統/.test(txt())); click($$(".tnode")[0]); assert.ok(/攻撃/.test(txt())); });
await check("再生中、左のパネルを勝手に描き直さない（読んでいる最中・入力中の内容が変わらない）。世界が進んで古くなると「最新の状態に更新」が出て、押すと描き直す", async () => {
  hub("nations"); await wait(60); if (V().S.hub !== "nations") hub("nations"); const pin = $("#pin"), mark = doc.createElement("i"); mark.id = "keep-mark"; pin.firstChild.append(mark); assert.ok(!$("#prefresh").classList.contains("stale"));
  const mi = V().S.w.civ.monthIndex; V().run({ type: "clock.setSpeed", speed: 3 }); await wait(2600); /* 2 秒ごとの旧い自動更新の周期を超えて待つ */ V().run({ type: "clock.setSpeed", speed: 0 });
  assert.ok(V().S.w.civ.monthIndex > mi, "世界は進んだ"); assert.ok($("#keep-mark"), "パネルは勝手に描き直されていない"); assert.ok($("#prefresh").classList.contains("stale"), "古くなったので更新ボタンが出る");
  click($("#prefresh")); assert.ok(!$("#keep-mark"), "押すと描き直される"); assert.ok(!$("#prefresh").classList.contains("stale"), "更新したので消える");
  V().S.w.civ.wcde.news.queue.length = 0; V().S.w.civ.wcde.time.hold = false;
});
await check("【文化・言語・宗教】樹形図・詳細・名前の編集（創造主の介入として記録）", async () => {
  for (const k of ["culture", "language", "religion"]) { hub(k); await wait(40); if (!$$(".lrow").length) { hub(k); await wait(40); } assert.ok($$(".lrow").length >= 1, k + " は一覧が先"); click($$(".lrow")[0]); assert.ok($("svg.tree") && $$(".tnode").length >= 1, k); assert.ok($("#ent-rename"), k + " の詳細"); }
  set($("#ent-name"), "試験の信仰"); click($("#ent-rename")); const id = V().S.entity.religion; assert.equal(V().S.w.civ.religions[id].name, "試験の信仰"); assert.ok((V().S.w.civ.wcde.edits ?? []).some((e) => e.targetId === id));
});
await check("【年表】【検索】のハブは無い（v6.3.0 で廃止。歴史は国家・戦争などの個別ページと Obsidian 用 Markdown で読む）", () => { assert.ok(!$('[data-hub="chron"]') && !$('[data-hub="search"]') && !$("#feed")); });
await check("【世界設定】生成設定・暦の表示名・保存/読み込み/Obsidian・版（アプリと保存形式は別）・整合性", async () => {
  hub("settings"); assert.ok(/世界の種/.test(txt()) && /保存形式の版/.test(txt()) && /問題なし/.test(txt())); click($("#save")); for (let i = 0; i < 100 && !/書き出しました/.test($("#exp-msg").textContent); i++) await wait(100); assert.ok(blobs >= 1 && /書き出しました/.test($("#exp-msg").textContent)); assert.ok($("#load") && $("#obs"));
  set($("#epoch-name"), "試験暦"); click($("#epoch-name").nextSibling); assert.equal(V().S.w.civ.wcde.config.calendar.epochName, "試験暦");
});
await check("重大ニュースで全画面が出て、OK まで時間が進まず、OK で停止前の速度へ自動復帰する", async () => {
  const w = V().S.w; w.civ.wcde.news.queue.length = 0; w.civ.wcde.time.hold = false; V().run({ type: "clock.setSpeed", speed: 3 }); const mine = Object.values(w.civ.states).filter((x) => x.alive).sort((a, b) => b.pop - a.pop)[0]; assert.ok(V().run({ type: "control.take", stateId: mine.id }).ok); /* 重大ニュースは、自国（担当国）に関する重大な出来事と世界大戦だけ */ const big = [{ entityId: mine.id, role: "state" }];
  w.civ.events.push({ eventId: "event_ui_big", date: { ...w.civ.date }, kind: "state_dissolved", title: "（試験）自国の大事件", participants: big, location: null, causes: [], effects: [], decisionId: null, provenance: "simulation" }); w.civ.wcde.news.lastCrit = {}; w.civ.wcde.news.queue.length = 0; w.civ.wcde.time.hold = false; /* ここまでの経過で溜まった別のニュースが先頭に来ないよう、空にしてから確かめる */
  V().run({ type: "clock.run", months: 1 }); V().render(); assert.equal($("#newsmodal").hidden, false); assert.ok($("#newsmodal").textContent.includes("自国の大事件")); const mi = w.civ.monthIndex, r = V().run({ type: "clock.run", months: 3 }); assert.equal(r.ok, false); assert.equal(w.civ.monthIndex, mi); V().S.notice = ""; click($("#ack")); assert.equal($("#newsmodal").hidden, true); assert.equal(w.civ.wcde.time.speed, 3); assert.equal(w.civ.wcde.time.hold, false);
});
await check("画面の操作中に、未処理のエラーが出ていない", () => assert.deepEqual(errors, [], errors.join("\n")));
V().S.timer && window.clearInterval(V().S.timer); window.close();
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
