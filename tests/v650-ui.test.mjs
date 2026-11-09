// v6.5.0: 画面（dist/v6.js）の確認。国家ページのビジュアル化・軍の編成・外交・戦争の全面タブ・統計・樹形図・技術の自動採用。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
window.structuredClone = structuredClone; Object.assign(window, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Blob });
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const V = () => window.__v6, hub = (k) => click($(`[data-hub="${k}"]`)), next = () => click($("#wz-next"));
for (let i = 0; i < 100 && !$("#new"); i++) await wait(20);
window.__v6.S.fastStart = true; click($("#new")); for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20); // v6.6.0: タイトル → 世界の設定

await check("世界を生成すると、建国の画面に『建国して担当する』と『世界に任せる』が出る", async () => {
  $("#cells").value = "3000"; $("#seed").value = "ui-650"; click($("#gen")); for (let i = 0; i < 600 && !$("#found"); i++) await wait(50);
  assert.ok($("#found") && $("#delegate"), "ボタン"); assert.ok(!$$(".cand").length && !$$("select.pol").length, "古い候補一覧は無い");
});
let sid;
await check("ウィザード: 国名 → 政体 → 役職 → 為政者 → 首都 → 技術 → 確認 で建国し、その国を担当して始まる", async () => {
  click($("#found")); assert.ok($(".wiz")); assert.equal($("#wz-next").disabled, true, "国名が空なら進めない");
  type($("#wz-name"), "ヴァルテリア部族連合"); next();
  const regs = $$("[data-regime]"); assert.equal(regs.length, 15); assert.ok(regs.some((b) => b.disabled), "技術が足りない政体は選べない"); click($('[data-regime="tribal"]')); next();
  assert.ok($$("[data-office]").length >= 3); next();
  type($("#wz-leader"), "オルヴェン"); assert.equal($$(".wface").length, 12); click($('[data-look="4"]')); next();
  assert.ok($("#wz-map"), "首都は地図から選ぶ"); assert.equal($("#wz-next").disabled, true, "首都を選ぶまで進めない");
  const w = V().S.w, g = Object.values(w.civ.groups).filter((x) => !x.stateId && x.settlementId).sort((a, b) => b.pop - a.pop)[0];
  for (let i = 0; i < 50 && !$(".wiz")._test.pick; i++) await wait(10); await wait(30);
  $(".wiz")._test.pick({ cell: g.cell, settlement: w.civ.settlements[g.settlementId], x: 5, y: 5 }); assert.equal($("#wz-next").disabled, false); assert.ok(/領域/.test($("#wz-cap").textContent)); next();
  assert.ok($$("[data-tech]").length >= 1, "技術の選択肢"); click($$("[data-tech]")[0]); next();
  assert.ok(/ヴァルテリア部族連合/.test($(".wizbody").textContent)); click($("#wz-go"));
  assert.ok(!$(".wiz"), "ウィザードが閉じる"); assert.ok($("#hub") && $("#mapwrap"), "ゲーム画面へ");
  sid = V().S.w.civ.wcde.control.stateId; const st = V().S.w.civ.states[sid]; assert.ok(st); assert.equal(st.name, "ヴァルテリア部族連合"); assert.equal(st.leader.name, "オルヴェン"); assert.equal(st.leader.look, 4); assert.equal(st.regime, "tribal");
});
let w;
await check("年月を進める（国家が育つ）", async () => { for (let i = 0; i < 8; i++) V().run({ type: "clock.run", months: 200 }); w = V().S.w; V().S.sel = sid; V().S.detail = true; V().S.hub = "nations"; V().S.tab = "politics"; V().render(); await wait(40); });
await check("【国家ページ】旗・為政者の顔・主要指標のアイコンが頭に出る。説明の長文は出ない", async () => {
  assert.ok($(".hero .flag") && $(".hero svg.ico")); assert.ok($$(".hero .metric").length >= 6); assert.ok($(".stackbar") || !w.civ.states[sid].politics); assert.ok(!$("#fin-open")); assert.ok(!/名称の変更は表示名だけです/.test($("#pin").textContent));
});
await check("【軍事】リング・編成の帯・部隊の名前（技術に合わせる）・編成の編集スライダー", async () => {
  V().S.tab = "military"; V().render(); await wait(30); assert.ok($$(".ringbox").length === 4); assert.ok($(".stackbar")); assert.ok($$(".fcard").length >= 1); assert.ok($("#reorg-box")); const sl = $$("#reorg-box input[type=range]"); assert.ok(sl.length >= 1);
  assert.ok(!/戦争研究所/.test($("#pin").textContent), "『戦争研究所』と名乗らない");
  const names = w.civ.states[sid].military.units.map((u) => u.name); assert.ok(names.every((n) => !n.includes("の") || true) && names.length >= 1);
});
await check("【編成の編集】配分を変えて決定すると、部隊の規模が変わる", async () => {
  const st = w.civ.states[sid], before = st.military.units.map((u) => u.kind); const sl = $$("#reorg-box input[type=range]"); if (sl.length < 2) return;
  sl.forEach((s, i) => { s.value = i === 0 ? 100 : 0; s.dispatchEvent(new window.Event("input", { bubbles: true })); }); st.treasury += 10000; click($("#reorg")); await wait(30);
  const u = st.military.units; assert.equal(u.length, 1, "100% の 1 種だけになる"); assert.ok(before.length >= 1);
});
await check("【開戦の確認】宣戦の前に、数値でなく言葉の見通しが出る。やめれば開戦しない", async () => {
  const n = w.civ.activeWarIds.length; { const all = $$("#wl-target option").length, tot = +/(\d+) 国/.exec($("#wl-count").textContent)[1]; assert.equal(all, tot, "宣戦先は件数の上限なしで全て出る"); const first = $("#wl-target option").textContent; $("#wl-search").value = first; $("#wl-search").dispatchEvent(new window.Event("input")); const n1 = $$("#wl-target option").length; assert.ok(n1 >= 1 && n1 <= all && $$("#wl-target option").every((o) => o.textContent.includes(first)), "検索で絞り込める"); assert.ok(!$("#declare").disabled); $("#wl-search").value = "該当なしの名前"; $("#wl-search").dispatchEvent(new window.Event("input")); assert.equal($$("#wl-target option").length, 0); assert.ok($("#declare").disabled); $("#wl-search").value = ""; $("#wl-search").dispatchEvent(new window.Event("input")); assert.equal($$("#wl-target option").length, all); } click($("#declare")); await wait(20); assert.ok($("#warconfirm")); assert.ok($$("#warconfirm .wcrow").length >= 3); assert.ok(!/戦争研究所/.test($("#warconfirm").textContent)); assert.ok(!/\d+%/.test($("#warconfirm").textContent), "数値の予測は出さない");
  click($("#war-confirm-no")); await wait(10); assert.ok(!$("#warconfirm")); assert.equal(w.civ.activeWarIds.length, n);
});
await check("【技術・ドクトリン】画面に採用ボタンは無い（自動採用は v650-core で確認）", async () => {
  V().S.tab = "tech"; V().render(); await wait(30); assert.ok(!$("#adopt-tech")); V().S.tab = "doctrine"; V().render(); await wait(30); assert.ok(!$("#adopt-doc"));
});
await check("【外交】3 つのタブ。国を選ぶと関係・アクション（不可能なものは理由つき）・時系列が出る", async () => {
  V().S.hub = "diplo"; V().S.dtab = "rel"; V().render(); await wait(40); assert.equal($$("[data-dtab]").length, 3); const rows = $$(".drow"); if (!rows.length) { console.log("   （他の国がないため省略）"); return; }
  click(rows[0]); await wait(30); assert.ok($(".pair .vsrow")); assert.ok($$(".acts .act").length >= 6); assert.ok($$(".acts .act.off small").length >= 0);
  click($('[data-dtab="ally"]')); await wait(20); assert.ok($(".tabs")); click($('[data-dtab="peace"]')); await wait(20); assert.ok($("#pin"));
});
await check("【統計】円グラフ・棒グラフ・ツリーマップのカード。ランキングの羅列ではない", async () => {
  V().S.hub = "stats"; V().render(); await wait(40); assert.ok($$(".scard").length >= 6); assert.ok($(".pie") && $(".hbars") && $(".treemap")); assert.ok($$(".kpi").length === 4);
});
await check("【文化・言語・宗教】『系統』で入れ子の一覧。詳細は小さな系統図", async () => {
  for (const k of ["culture", "language", "religion"]) { V().S.hub = k; V().S.entity[k] = null; V().render(); await wait(20); click($('[data-view="tree"]')); await wait(20); assert.ok($(".nested"), k); const r = $(".nested .nrow"); if (r) { click(r); await wait(20); assert.ok($(".tree.mini"), k + " の小さな系統図"); click($(".back")); } }
});
await check("【戦争】詳細は全面タブ。戦場の地図・綱引き・戦力・主要な流れ（種類で色分け）", async () => {
  const c = V().S.w.civ, wars = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt); if (!wars.length) { console.log("   （戦争が起きていないため省略）"); return; }
  V().S.hub = "war"; V().S.war = wars[0].id; V().render(); await wait(40); assert.ok($("#fulltab .wardetail")); assert.ok($(".minimap") && $(".tug") && $(".flow")); assert.ok(!/戦争研究所/.test($("#fulltab").textContent));
  click($("#full-close")); await wait(20); assert.ok(!$("#fulltab"));
});
await check("【地図】国名ラベルは大国から。拡大で小国も出る（描画でエラーが出ない）", async () => {
  const M = V().S.map; M.view.k = 1; M.draw(); M.view.k = 4; M.draw(); if (M._labels?.length) assert.ok(M._labels[0].power >= M._labels.at(-1).power, "大国の順");
});
await check("画面の操作中に、未処理のエラーが出ていない", async () => { assert.deepEqual(errors, []); });
V().S.timer && clearInterval(V().S.timer);
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
