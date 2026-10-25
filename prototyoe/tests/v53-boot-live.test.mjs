// v5.3 UI を、実際の本体部品（store / civ / history-actions / timeActions）につないで起動し、操作が本体へ届くかを確かめる。
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { createStore } from "../js/core/store.js";
import { createCivActions } from "../js/app/civ-actions.js";
import { createTimeActions } from "../js/app/time-actions.js";
import { createHistoryActions } from "../js/app/history-actions.js";
import { createGroupActions } from "../js/app/group-actions.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";

const dom = new JSDOM('<!doctype html><body><div id="v53-root"></div><div id="stage"><canvas id="map-canvas"></canvas></div></body>', { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "HTMLButtonElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent"]) globalThis[k] = dom.window[k];
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const { bootV53 } = await import("../js/ui/v53/boot-live.js");
let failed = 0; const check = async (l, fn) => { try { await fn(); console.log(`  OK   ${l}`); } catch (e) { failed++; console.log(`  FAIL ${l}: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)], click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })), tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

console.log("=== 本体に接続して起動（世界あり・歴史はまだ） ===");
const m = worldToMap(generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } })); m.worldTime = { year: 0, month: 1 }; m.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
const store = createStore({ map: m, fileName: "w.ahmap", view: {}, timeRunning: false, exportOpts: {}, groups: {} });
const renderer = { requestRender() {} }, civActions = createCivActions({ store }), timeActions = createTimeActions({ store, renderer, civActions }), history = createHistoryActions({ store, civActions });
const groupActions = createGroupActions({ store, rerender() {}, showNotice() {} });
const opened = []; const panels = { openEntity: (k, i) => opened.push([k, i]) };
const downloads = [];
const v = bootV53({ root: $("#v53-root"), store, civActions, history, timeActions, actions: { toggle() {}, fit() {}, newWorld: async () => ({ ok: true }) }, groupActions, stageEl: $("#stage"), panels, createCanvas: null, download: (b, n) => downloads.push(n), keyboard: false, pollMs: 1e9 });

await check("地図の入れ物(#stage)が中央にそのまま入り、世界はあるが歴史が始まっていないので開始フローが出る", () => { assert.ok($(".v53-map-slot #stage #map-canvas")); assert.ok($(".v53-start")); assert.equal($(".v53-start").dataset.phase, "group"); assert.ok($$(".v53-group").length > 0, "初期集団の候補が出る"); });
await check("初期集団を選ぶと本体の entities.start に確定し、歴史を始めると civ が作られて自動進行が始まる", async () => {
  const pick = $$(".v53-group")[0]; click(pick); assert.ok(m.world.entities.start, "本体に確定"); assert.equal(m.world.entities.start.groupId, Number(pick.dataset.id));
  click($('[data-act="begin"]')); await tick(10); assert.ok(store.getState().map.civ, "civ が作られた"); assert.equal($(".v53-start").dataset.phase, "running");
});
await check("自動進行を中断でき、本体の時間が進んだぶんだけ年が表示される（固定年数で止まらない）", async () => {
  await tick(300); const civ = store.getState().map.civ; assert.ok(civ.monthIndex > 0, `進んだ月 ${civ.monthIndex}`); click($('[data-act="abort"]')); await tick(80);
  const at = civ.monthIndex; await tick(80); assert.equal(civ.monthIndex, at, "中断後は進まない"); assert.ok($('[data-act="resume"]'));
});
await check("成立の提案（form_state）が本体に出ると停止点（国家成立）の画面になり、「国家を成立させる」は本体の受諾コマンドを通る。失敗したら理由を出す", async () => {
  // この世界・この初期集団では 1300 年進めても form_state が出ない（実測）。本体が出す提案と同じ形を直接つくって、受諾までの経路を確かめる
  const civ = store.getState().map.civ, g = Object.values(civ.groups).find((x) => x.player) ?? Object.values(civ.groups)[0]; assert.ok(g, "プレイヤーの集団");
  civ.proposals.push({ proposalId: "proposal_test_form", date: { ...civ.date }, groupId: g.id, kind: "form_state", payload: { via: "agri_union" }, resolved: false });
  click($('[data-act="resume"]')); await tick(60); assert.equal($(".v53-start").dataset.phase, "ready"); assert.match($(".v53-card h3").textContent, /農耕集落の統合/); assert.ok($$(".v53-checks li").length >= 2);
  const before = civ.proposals.find((p) => p.proposalId === "proposal_test_form").resolved; assert.equal(before, false);
  click($('[data-act="found"]')); await tick(20);
  const resolved = civ.proposals.find((p) => p.proposalId === "proposal_test_form").resolved;
  if (resolved) { assert.equal($(".v53-start"), null, "成立したらフローを閉じる"); console.log("       （本体が受諾した）"); }
  else { assert.ok($(".v53-error")?.textContent.length > 3, "本体が拒否したら理由が画面に出る"); console.log(`       （本体が拒否: ${$(".v53-error").textContent}）`); civ.proposals.find((p) => p.proposalId === "proposal_test_form").resolved = true; v.ui.set({ startFlow: false }); }
});
// 国家が育つまでの時間は、本体の歴史エンジンで直接進める（時計も合わせる）。開始フローの動作確認はここまでで終わり
{ const civ = store.getState().map.civ; createCivSim(m.world, civ).advanceMonths(12 * 750); m.worldTime = { year: Math.floor(civ.monthIndex / 12), month: (civ.monthIndex % 12) + 1 }; store.update?.(() => {}); }
await check("開始フローを終えると、国家の一覧に実際の国家が出て、詳細・過去の閲覧・出力まで本体のデータで動く", async () => {
  click($('[data-domain="state"]')); assert.ok($$(".v53-row").length >= 1); click($$(".v53-row")[0]); assert.ok($(".v53-stats")); const now = v.adapter.meta().now;
  v.adapter.setView(Math.max(v.adapter.meta().first, now - 24)); assert.equal($(".v53").dataset.past, "true"); v.adapter.setView(null);
  click($('[data-domain="export"]')); click($('[data-act="chronicle"]')); await tick(80); assert.match($('[data-status="chronicle"]').textContent, /書き出しました/); assert.ok(downloads.some((n) => /chronicle\.md$/.test(n)));
  click($('[data-act="ahmap"]')); for (let i = 0; i < 400 && !downloads.some((n) => /\.ahmap$/.test(n)); i++) await tick(50); assert.ok(downloads.some((n) => /\.ahmap$/.test(n)), $('[data-status="ahmap"]').textContent);
});
await check("1 か月進めると本体の時間が進み、地図の既存の選択（panels.openEntity）が新しい右ドックへ向く。dispose で元に戻る", () => {
  click($('[data-domain="world"]')); const before = store.getState().map.civ.monthIndex; v.adapter.time.step(); assert.equal(store.getState().map.civ.monthIndex, before + 1);
  const sid = Object.values(store.getState().map.civ.states)[0].id; panels.openEntity("state", sid); assert.deepEqual(v.ui.get().selection, { kind: "state", id: sid }); assert.equal(opened.length, 0, "旧パネルは開かない");
  v.dispose(); panels.openEntity("state", "x"); assert.equal(opened.length, 1, "dispose で元の挙動に戻る");
});
console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
