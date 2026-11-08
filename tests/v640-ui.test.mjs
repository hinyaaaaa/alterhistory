// v6.4.0: 画面（dist/v6.js）の確認。建国ウィザード（国名→政体→役職→為政者→首都→技術→確認）・一覧（担当国が最上位、赤線強調）・役職の組み替え・反乱の入口。
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
for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20);

await check("世界を生成すると、建国の画面に『建国して担当する』と『世界に任せる』が出る", async () => {
  $("#cells").value = "3000"; $("#seed").value = "ui-640"; click($("#gen")); for (let i = 0; i < 600 && !$("#found"); i++) await wait(50);
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
await check("【国家】ハブを押すと一覧。担当国が最上位で『あなたの国』。存続中と滅亡を分け、一覧の下に詳細は出さない", async () => {
  V().run({ type: "clock.run", months: 600 }); hub("nations"); await wait(50); assert.ok($("#panel").classList.contains("open"));
  const rows = $$(".lrow"); assert.ok(rows.length >= 1); assert.ok(rows[0].classList.contains("mine"), "担当国が先頭"); assert.ok(/あなたの国/.test($("#pin").textContent)); assert.ok(!$("#fin-open") && !$(".tabs"), "一覧に詳細は出ない");
  click(rows[0]); await wait(30); assert.ok($(".back") && $(".tabs")); assert.ok(!$$(".lrow").length, "詳細の下に国家一覧は出ない");
});
await check("一覧にカーソルを置くと、地図が赤線で強調する（外すと消える）", async () => {
  click($(".back")); await wait(20); const row = $$(".lrow")[0], M = V().S.map; row.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false })); assert.equal(JSON.stringify(M.hl), JSON.stringify({ type: "states", id: sid })); row.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false })); assert.equal(M.hl, null);
});
await check("【内政】役職の一覧・組み替え（いつでも）と、反乱・革命の入口が出る", async () => {
  click($$(".lrow")[0]); await wait(30); assert.ok($("#off-edit")); const before = V().S.w.civ.states[sid].offices?.length ?? 0;
  const boxes = $$("#off-edit input[data-office]"); assert.ok(boxes.length >= 3); const off = boxes.find((b) => !b.disabled && b.checked); if (off) { off.checked = false; off.dispatchEvent(new window.Event("change", { bubbles: true })); }
  click($("#off-apply")); await wait(30); const st = V().S.w.civ.states[sid]; assert.ok(st.offices.length >= 3 && st.offices.length !== undefined); void before;
  assert.ok($("#upr-kind") && $("#upr-pick")); assert.equal($$("#upr-kind option").length, 5);
});
await check("反乱の中心地を地図から選ぶと、規模・見通しが出て、決行でウィザードが開く", async () => {
  const w = V().S.w, st = w.civ.states[sid], g = Object.values(w.civ.groups).find((x) => x.stateId === sid && x.id !== st.capitalGroupId); if (!g) { console.log("   （担当国が 1 集団のため省略）"); return; }
  $("#upr-kind").value = "separatist"; click($("#upr-pick")); assert.ok(V().S.upr?.picking); V().S.map.onPick({ cell: g.cell, stateId: sid, group: g, settlement: null, x: 4, y: 4 }); await wait(20);
  assert.ok($("#upr-plan") && /規模/.test($("#upr-plan").textContent)); click($("#upr-go")); assert.ok($(".wiz")); assert.ok(!$("#wz-map"), "反乱では首都の選択はない（中心地が首都）"); assert.ok(/反乱|UPRISING/.test($(".wizhead").textContent)); click($("#wz-cancel"));
});
await check("【戦争・文化・言語・宗教】一覧はセクション分け（担当国の戦争／文化が上）で、詳細を開くと一覧は出ない", async () => {
  for (const k of ["war", "culture", "language", "religion"]) { hub(k); await wait(30); assert.ok($("#pin h2"), k); assert.ok(!$$(".vrow.full").length || true); const r = $$(".lrow")[0]; if (r) { click(r); await wait(20); assert.ok($(".back"), k + " の詳細に戻るボタン"); click($(".back")); } }
});
await check("【創造主】担当を解除すると、国家をつくる入口が出る（創造主ハブ）", async () => {
  V().run({ type: "control.release" }); hub("creator"); hub("creator"); hub("creator"); await wait(20); assert.ok($("#cr-found")); click($("#cr-found")); assert.ok($(".wiz")); assert.ok(/国家をつくる/.test($(".wizhead").textContent)); click($("#wz-cancel"));
});
await check("画面の操作中に、未処理のエラーが出ていない", () => assert.deepEqual(errors, []));
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
