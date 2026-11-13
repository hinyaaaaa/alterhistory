// v6.12.0: 画面（dist/v6.js）— 決断ウィンドウ・軍（軍団の一覧と命令）・国策・役職の要約。jsdom 上で、実データと実コマンドでつながっていることを確かめる。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { decisionsOf } from "../js/core/wcde/decision-state.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
window.URL.createObjectURL = () => "blob:x"; window.HTMLAnchorElement.prototype.click = function () {}; window.structuredClone = structuredClone; Object.assign(window, { CompressionStream, DecompressionStream, TextEncoder, TextDecoder });
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (el, v, ev = "change") => { el.value = v; el.dispatchEvent(new window.Event(ev, { bubbles: true })); };
const V = () => window.__v6, hub = (k) => click($(`[data-hub="${k}"]`)), txt = () => $("#pin").textContent;
for (let i = 0; i < 100 && !$("#new"); i++) await wait(20);
window.__v6.S.fastStart = true; click($("#new")); for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20);
set($("#cells"), "3000"); set($("#seed"), "ui-612"); click($("#gen")); for (let i = 0; i < 400 && !$("#delegate"); i++) await wait(50); click($("#delegate"));
{ const w = V().S.w; assert.ok(V().run({ type: "time.advance", months: 400 }).ok); }
const w = V().S.w, alive = () => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const meId = alive()[0].id; assert.ok(V().run({ type: "control.take", stateId: meId }).ok); const ME = () => w.civ.states[meId]; w.civ.wcde.news.queue.length = 0; w.civ.wcde.time.hold = false; V().run({ type: "clock.setSpeed", speed: 0 }); /* 試験の途中で世界が勝手に進まないように止める */ V().render();
const live = () => { decisionsOf(w.civ).live = true; };

await check("左ハブに「軍」がある（地理・国家・戦争・軍・外交…）", () => { const ks = $$("#hub button").map((b) => b.dataset.hub); assert.ok(ks.includes("mil")); assert.equal(ks.indexOf("mil"), ks.indexOf("war") + 1); });
await check("【軍】軍団の一覧（名前・指揮官・兵力・現在地・命令）。選ぶと全面タブで指揮官・部隊・作戦の命令・編成が出る。地図に軍団の印が出る", async () => {
  hub("mil"); await wait(40); if (!$$(".corpsrow").length) { await wait(80); hub("mil"); hub("mil"); await wait(40); } assert.ok(ME().corps, "軍団が作られる"); V().render(); const rows = $$(".corpsrow"); assert.ok(rows.length >= 1 && rows.length <= 6); assert.ok(/軍団/.test(rows[0].textContent) && /能力/.test(rows[0].textContent));
  assert.ok(V().S.map.corps.length === rows.length, "地図の印"); click(rows[0]); await wait(20); assert.equal(V().S.corpsSel, ME().corps.list[0].id); const full = $("#fulltab"); assert.ok(full, "全面タブ"); assert.ok(full.querySelector("#cp-order") && full.querySelector("#cp-rename") && full.querySelector("#cp-split") && /最高指揮官/.test(full.textContent) && /作戦の命令/.test(full.textContent));
  set(full.querySelector("#cp-name"), "黒鷲軍"); click(full.querySelector("#cp-rename")); assert.equal(ME().corps.list[0].name, "黒鷲軍");
  set($("#fulltab #cp-kind"), "hold"); click($("#fulltab #cp-order")); assert.equal(ME().corps.list[0].order.kind, "hold");
  const cand = $$("#fulltab [data-slot='commander'] option")[1]; if (cand) { const sel = $("#fulltab select[data-slot='commander']"), old = ME().corps.list[0].commander.name; set(sel, cand.value); click($("#fulltab [data-appoint='commander']")); assert.notEqual(ME().corps.list[0].commander.name, old); }
  click($("#fulltab .fthead button")); assert.equal(V().S.corpsSel, null);
});
await check("【国策】国家の画面に国策の枠（5 分野）と役職の効果の要約が出る。枠に入れると国策が取り入れられ、費用が引かれる", async () => {
  V().S.hub = "nations"; V().S.sel = meId; V().S.detail = true; V().S.tab = "politics"; ME().techAdopted = { ...ME().techAdopted, agriculture: 1 }; ME().treasury = 5000; V().render(); await wait(20);
  const box = $("#policybox"); assert.ok(box, "国策の箱"); assert.equal(box.querySelectorAll(".pcat").length, 5); const sel = box.querySelector("select[data-cat='econ'][data-slot='0']"); assert.ok(sel); set(sel, "agrarian"); click(box.querySelector("[data-set='econ0']")); assert.equal(ME().focus.econ[0]?.id, "agrarian"); assert.ok(ME().treasury < 5000); V().render(); assert.ok(/重農政策/.test($("#policybox").textContent));
  assert.ok($(".offsum") || !(ME().offices?.length), "役職の要約");
});
await check("【決断】決断が出ると中央にウィンドウが出て、選択肢を選ぶと解決し、時間の停止が解ける。重大ニュースがあるときは先にニュース", async () => {
  live(); const ctx = w.sim.ctx, from = alive().find((s) => s.id !== meId); ME().leader.skill = 0.5; ctx.decisions.succession(ctx, ME()); V().render(); const m = $("#decmodal"); assert.equal(m.hidden, false); assert.ok(/継承|跡を継ぐ/.test(m.textContent)); assert.ok(m.querySelectorAll(".cand").length >= 3); assert.equal(w.civ.wcde.time.hold, true);
  w.civ.wcde.news.queue.push({ id: "n1", eventId: "e1", date: { ...w.civ.date }, title: "（試験）ニュース", entityIds: [], level: "critical" }); V().render(); assert.equal($("#decmodal").hidden, true, "ニュースが先"); w.civ.wcde.news.queue.length = 0; V().render(); assert.equal($("#decmodal").hidden, false);
  const old = ME().leader.name; click(m.querySelectorAll(".cand")[0]); assert.notEqual(ME().leader.name, old); assert.equal($("#decmodal").hidden, true); assert.equal(decisionsOf(w.civ).queue.length, 0); assert.equal(w.civ.wcde.time.hold, false); void from;
});
await check("【会戦】会戦の決断は 3 手番の構えを選ぶ（突撃・堅守・包囲機動・退却）。戦場を地図に映し、これまでの流れが出る", async () => {
  live(); const ctx = w.sim.ctx, foe = alive().find((s) => s.id !== meId && !s.warIds.length); let war = null, A, D, camp; const tries = []; for (const cand of alive().filter((x) => x.id !== meId).sort((a, b) => b.army - a.army)) { const r0 = V().act({ type: "state.act", stateId: meId, action: "declare_war", target: cand.id }); tries.push(`${cand.name}:${r0.ok ? "ok" : r0.error}`); if (!r0.ok) continue; w.civ.wcde.news.queue.length = 0; w.civ.wcde.time.hold = false; decisionsOf(w.civ).queue.length = 0; for (let i = 0; i < 8 && !war; i++) { w.sim.advanceMonth(); const wr = w.civ.wars[ME().warIds[ME().warIds.length - 1]]; if (wr?.status !== "active") break; const ops = wr.ops; camp = Object.values(ops.campaigns).find((x) => ops.forces[x.forceId]?.stateId === meId && ops.forces[x.forceId]?.corpsId && ops.forces[x.forceId].size > 10); A = camp && ops.forces[camp.forceId]; D = Object.values(ops.forces).find((f) => f.stateId !== meId && f.kind === "army" && f.size > 1); tries.push(`m${i}:A=${A ? Math.round(A.size) : "-"} D=${D ? Math.round(D.size) : "-"} camp=${!!camp} st=${wr.status}`); if (A && D && camp) war = wr; } if (war) break; }
  if (decisionsOf(w.civ).queue.length && war) { for (const d of decisionsOf(w.civ).queue) { const c0 = war.ops?.campaigns?.[d.payload?.campId]; if (c0) c0.waiting = null; } decisionsOf(w.civ).queue.length = 0; w.civ.wcde.time.hold = false; } assert.ok(war, "会戦を起こせる戦争: " + tries.slice(0, 14).join(" / ") + " pend=" + decisionsOf(w.civ).queue.map((d) => d.kind).join(",")); const ops = war.ops; const g = w.civ.groups[camp.targetGroupId]; war.score = 60; ops.lastBattleDecision = -99;
  const id = ctx.decisions.battle(ctx, war, { camp, A, D, g, site: g }); camp.waiting = id; V().render(); const m = $("#decmodal"); assert.ok(m.classList.contains("battle")); assert.equal(m.querySelectorAll(".stance").length, 4); assert.ok(/兵力/.test(m.textContent) && /戦況/.test(m.textContent));
  click(m.querySelector(".st-assault")); assert.equal(decisionsOf(w.civ).queue[0].payload.round, 1); assert.ok($("#decmodal .blog"), "これまでの流れ"); click($("#decmodal .st-hold")); click($("#decmodal .st-flank")); assert.equal(decisionsOf(w.civ).queue.length, 0); assert.equal($("#decmodal").hidden, true);
});
await check("画面の操作中に、未処理のエラーが出ていない", () => assert.deepEqual(errors, [], errors.join("\n")));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
