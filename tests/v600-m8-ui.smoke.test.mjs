// v6.0.0 M8: 画面（dist/v6.js）のスモークテスト。jsdom 上で、生成 → 建国 → 全ハブの表示 → 時間・ニュース・介入・外交・保存 が実データでつながっていることを確かめる。
// （視覚品質は自動テストでは判定しない。地図の描画はキャンバスが無いため、この環境では呼び出しだけを検証する）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const html = readFileSync(new URL("../v6.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
let blobs = 0; window.URL.createObjectURL = () => { blobs++; return "blob:x"; }; window.HTMLAnchorElement.prototype.click = function () {};
window.structuredClone = structuredClone; // jsdom には無い（実ブラウザーにはある）
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (el, v, ev = "change") => { el.value = v; el.dispatchEvent(new window.Event(ev, { bubbles: true })); };
const V = () => window.__v6; for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20); // DOMContentLoaded を待つ

await check("起動画面から世界を生成でき、建国の画面で『世界に任せて始める』を選べる", async () => {
  assert.ok($("#gen"), "生成ボタン"); set($("#cells"), "3000"); set($("#seed"), "ui-smoke"); click($("#gen")); for (let i = 0; i < 400 && !$("#delegate"); i++) await wait(50); assert.ok($("#delegate"), "建国の画面");
  click($("#delegate")); assert.ok($("#hub") && $("#panel") && $("#mapwrap") && $("#clock"), "骨格"); assert.equal($$("#hub button").length, 11, "左ハブは 11 項目"); assert.ok($("#map"), "地図");
});
await check("右の常設は『ニュースと時間』だけ（日時・停止/再開・速度・ニュース）。関連イベントのパネルはない", () => {
  assert.ok($("#date").textContent.includes("年")); assert.ok($$("[data-speed]").length >= 4); assert.ok($("#feed")); assert.ok(!$("#related") && !/関連イベント/.test($("#clock").textContent));
});
await check("時間を進める（clock.run）と日時とニュース欄が更新され、世界が実際に進む", async () => {
  const w = V().S.w, mi = w.civ.monthIndex; const r = V().run({ type: "clock.run", months: 24 }); assert.ok(r.ok, JSON.stringify(r)); V().render(); assert.ok(w.civ.monthIndex > mi); assert.ok($("#date").textContent.includes("年"));
});
await check("全ての左ハブの項目が、エラーなく実データを表示する", () => {
  for (const b of $$("#hub button")) { click(b); assert.ok($("#panel").textContent.length > 1 || b.dataset.hub === "search", b.dataset.hub + " が空"); }
  assert.deepEqual(errors, [], errors.join("\n"));
});
await check("国家一覧 → 国家詳細（内政・軍事・外交・技術・ドクトリン）が実データで開く。軍事タブに戦争研究所の予測が出る", async () => {
  V().run({ type: "clock.setSpeed", speed: 0 }); click($('[data-hub="states"]')); const it = $$(".item")[0]; assert.ok(it, "国家の行"); click(it);
  for (const t of ["politics", "military", "diplomacy", "tech", "doctrine"]) { click($(`[data-tab="${t}"]`)); assert.ok($(".detail").textContent.length > 20, t); }
  click($('[data-tab="military"]')); await wait(60); assert.ok(/勝利\s*\d+%/.test($("#wl-out").textContent), "戦争研究所の予測: " + $("#wl-out").textContent.slice(0, 80));
  click($('[data-tab="diplomacy"]')); await wait(20); assert.ok(/相手の評価/.test($("#dp-out").textContent), "条約の評価");
});
await check("創造主の介入を画面から行える（有効値に反映され、記録に出て、取り消せる）", async () => {
  click($('[data-hub="creator"]')); const w = V().S.w; await wait(20); set($("#iv-field"), "taxRevenue"); set($("#iv-val"), "1.8"); click($("#iv-go")); await wait(10);
  assert.equal(V().S.notice, "", V().S.notice); assert.equal(Object.values(w.civ.wcde.interventions.records).filter((r) => r.status === "active").length, 1); assert.ok(/有効/.test($("#panel").textContent));
  click($$("#panel button").find((b) => b.textContent === "取り消す")); assert.equal(w.civ.wcde.interventions.records.filter((r) => r.status === "active").length, 0);
});
await check("重大ニュースで全画面が出て、OK まで時間が進まず、OK で自動再開する", async () => {
  const w = V().S.w; V().run({ type: "clock.setSpeed", speed: 3 }); const big = Object.values(w.civ.states).filter((x) => x.alive).sort((a, b) => b.pop - a.pop).slice(0, 8).map((x) => ({ entityId: x.id, role: "state" }));
  w.civ.events.push({ eventId: "event_ui_big", date: { ...w.civ.date }, kind: "state_dissolved", title: "（試験）大国が滅んだ", participants: big, location: null, causes: [], effects: [], decisionId: null, provenance: "simulation" });
  V().run({ type: "clock.run", months: 1 }); V().render(); assert.equal($("#newsmodal").hidden, false, "全画面ニュース"); assert.ok($("#newsmodal").textContent.includes("大国が滅んだ"));
  const mi = w.civ.monthIndex, r = V().run({ type: "clock.run", months: 3 }); assert.equal(r.ok, false); assert.equal(w.civ.monthIndex, mi, "OK まで進まない"); V().S.notice = "";
  click($("#ack")); assert.equal($("#newsmodal").hidden, true); assert.equal(w.civ.wcde.time.speed, 3, "停止前の速度へ自動復帰"); assert.equal(w.civ.wcde.time.hold, false);
});
await check("年表（仮想スクロール）・検索・統計・世界設定が動き、保存ファイルを書き出せる", async () => {
  click($('[data-hub="timeline"]')); await wait(60); assert.ok($$(".ev").length > 0 && $$(".ev").length <= 60, "表示範囲だけを描く: " + $$(".ev").length); click($$(".ev")[0]); assert.ok($("#evdetail").textContent.length > 5);
  click($('[data-hub="search"]')); const first = Object.values(V().S.w.civ.states)[0].name.slice(0, 2); set($("#q"), first); assert.ok($$(".item").length > 0, "検索結果");
  click($('[data-hub="settings"]')); assert.ok(/問題なし/.test($("#panel").textContent), "整合性"); click($("#save")); assert.ok(blobs >= 1); assert.ok(/書き出しました/.test($("#exp-msg").textContent));
});
await check("過去の閲覧中は、世界を変える操作と時間進行が止まる（現在へ戻すと再開）", async () => {
  const w = V().S.w, mi = w.civ.monthIndex; V().run({ type: "view.past", month: mi - 12 }); V().render(); assert.ok(/過去を閲覧中/.test($("#banner").textContent)); const r = V().run({ type: "clock.run", months: 1 }); assert.equal(r.ok, false); assert.equal(w.civ.monthIndex, mi); V().run({ type: "view.past", month: null }); V().render(); assert.ok(V().run({ type: "clock.run", months: 1 }).ok);
});
await check("画面の操作中に、未処理のエラーが出ていない", () => assert.deepEqual(errors, [], errors.join("\n")));
V().S.timer && window.clearInterval(V().S.timer); window.close();
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
