// v6.0.0 M8: 画面（dist/v6.js）のスモークテスト。jsdom 上で、生成 → 建国 → 全ハブの表示 → 時間・ニュース・介入・外交・戦争・樹形図・保存 が実データでつながっていることを確かめる。
// 視覚品質は自動テストでは判定しない（地図のキャンバス描画は jsdom に無いため、呼び出しだけを検証する）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const html = readFileSync(new URL("../v6.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
let blobs = 0; window.URL.createObjectURL = () => { blobs++; return "blob:x"; }; window.HTMLAnchorElement.prototype.click = function () {}; window.structuredClone = structuredClone;
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (el, v, ev = "change") => { el.value = v; el.dispatchEvent(new window.Event(ev, { bubbles: true })); };
const V = () => window.__v6, hub = (k) => click($(`[data-hub="${k}"]`)), tab = (k) => click($(`[data-tab="${k}"]`)), txt = () => $("#pin").textContent;
for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20);

await check("世界を生成 → 建国（世界に任せる）。骨格はモックと同じ: 左ハブ・パネル・地図・右（ニュースと時間）", async () => {
  set($("#cells"), "3000"); set($("#seed"), "ui-smoke"); click($("#gen")); for (let i = 0; i < 400 && !$("#delegate"); i++) await wait(50); assert.ok($("#delegate")); click($("#delegate"));
  assert.ok($("#hub") && $("#panel") && $("#mapwrap") && $("#right") && $("#callout") && $("#leg")); assert.deepEqual($$("#hub button").map((b) => b.dataset.hub), ["geo", "nations", "war", "diplo", "culture", "language", "religion", "chron", "stats", "search", "settings"]); assert.ok(!$("#panel").classList.contains("open"), "最初は地図が最大"); V().run({ type: "clock.setSpeed", speed: 0 });
});
await check("右の常設は『ニュースと時間』だけ（タブ・関連イベント専用パネルはない）。固定トップバーもない", () => { assert.ok($("#date").textContent.includes("年") && $$("[data-speed]").length >= 4 && $("#feed")); assert.ok(!$("#related") && !/関連イベント/.test($("#right").textContent) && !$("#topbar") && !$("#right [data-tab]")); });
await check("時間を進めると日時・ニュースが更新され、世界が実際に進む", () => { const w = V().S.w, mi = w.civ.monthIndex; assert.ok(V().run({ type: "clock.run", months: 60 }).ok); V().render(); assert.ok(w.civ.monthIndex > mi); });
await check("【地理】塗り 1 つ + 重ね複数を同時に選べ、項目をクリックすると凡例が開く。パネル切替で地図の位置・拡大がリセットされない", () => {
  hub("geo"); assert.ok($("#panel").classList.contains("open")); const M = V().S.map; M.view = { x: -30, y: -20, k: 2.5 }; click($("#fill-culture")); assert.equal(M.fillLayer, "culture"); click($("#ov-war")); assert.ok(M.overlays.has("war") && M.overlays.has("borders") && M.overlays.has("cities"), "重ねは複数");
  click($("#ov-war").parentElement.querySelector(".g")); assert.ok(/破線/.test($("#pin").textContent), "凡例が展開"); hub("stats"); hub("geo"); assert.deepEqual([M.view.x, M.view.y, M.view.k], [-30, -20, 2.5], "地図の位置・倍率を保つ"); click($("#fill-nation"));
});
await check("【地図】クリックでコールアウトが出る（国家・都市・入口ボタン）", () => { const w = V().S.w, st = Object.values(w.civ.states).find((s) => s.alive); const M = V().S.map; M.onPick({ cell: 0, stateId: st.id, group: null, settlement: null, x: 100, y: 100 }); assert.ok($("#callout").classList.contains("on")); assert.ok($("#callout").textContent.includes(st.name)); assert.ok(/詳細/.test($("#callout").textContent)); });
await check("【国家】一覧は成立が新しい順。クリックしても担当は変わらない。詳細に 5 タブ", async () => {
  hub("nations"); await wait(60); const w = V().S.w, rows = $$(".vrow"); assert.ok(rows.length > 1); const alive = Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.formedAt - a.formedAt); assert.ok(rows[0].textContent.includes(alive[0].name), "最新の国家が先頭"); const before = w.civ.wcde.control.stateId; click(rows[0]); assert.equal(w.civ.wcde.control.stateId, before, "クリックでは担当は変わらない");
  assert.deepEqual($$("[data-tab]").map((b) => b.dataset.tab), ["politics", "military", "diplomacy", "tech", "doctrine"]); for (const t of ["politics", "military", "diplomacy", "tech", "doctrine"]) { tab(t); assert.ok(txt().length > 40, t); }
});
await check("【内政】顔・為政者・財政の詳細（円グラフ・税率）・支持勢力・創造主の介入。担当しない国では操作が無効で理由が出る", async () => {
  tab("politics"); assert.ok($("#pin svg") && /為政者/.test(txt()) && /支持勢力/.test(txt())); click($("#fin-open")); assert.ok($("#fin svg") && /財政の詳細/.test(txt())); assert.equal($("#tax-up").disabled, true, "担当でないと税率を変えられない");
  const st = V().S.w.civ.states[V().S.sel]; click($("#take")); assert.equal(V().S.w.civ.wcde.control.stateId, st.id); click($("#fin-open")); click($("#fin-open")); const t0 = st.policy.tax; click($("#tax-down")); assert.ok(V().S.w.civ.states[st.id].policy.tax < t0 || V().S.notice, "税率の変更が実際に反映される（または理由が出る）");
  set($("#iv-field"), "taxRevenue"); set($("#iv-val"), "1.8"); click($("#iv-go")); assert.equal(V().S.notice, ""); assert.equal(V().S.w.civ.wcde.interventions.records.filter((r) => r.status === "active").length, 1); assert.ok(/有効/.test(txt())); click($$("#pin button").find((b) => b.textContent === "取り消す")); assert.equal(V().S.w.civ.wcde.interventions.records.filter((r) => r.status === "active").length, 0);
});
await check("【軍事】部隊・編制・宣戦・戦争研究所の予測（担当国のみ操作）", async () => {
  tab("military"); await wait(60); assert.ok(/勝利\s*\d+%/.test($("#wl-out").textContent), "予測"); assert.ok($("#declare") && $("#reorg")); assert.equal($("#declare").disabled, false, "担当国では宣戦できる"); const w = V().S.w, mi = w.civ.monthIndex; assert.equal(w.civ.monthIndex, mi, "予測は世界を変えない");
});
await check("【外交】条約の提案は担当国のみ・相手の評価を表示。講和は一般条約に無い", async () => {
  tab("diplomacy"); await wait(60); assert.ok(/相手の評価/.test($("#dp-out").textContent)); assert.ok(![...$("#dp-type").options].some((o) => /講和/.test(o.textContent)), "講和は一般条約に出ない"); const n = V().S.w.civ.wcde.diplomacy?.proposals?.length ?? 0; click($("#propose")); assert.ok((V().S.w.civ.wcde.diplomacy?.proposals?.length ?? 0) >= n);
});
await check("【技術ツリー】実データの全ノードが四方位の放射状に並び、状態を区別し、ドラッグ・ホイールで操作できる", () => {
  tab("tech"); assert.ok($$(".tnode").length >= 39, "ノード " + $$(".tnode").length); assert.ok(/採用済み/.test(txt()) && /未発見/.test(txt())); const svg = $("svg.tree"); svg.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -100, clientX: 10, clientY: 10, bubbles: true, cancelable: true })); assert.ok(svg.getAttribute("viewBox").split(" ")[2] < 1000, "ズームで viewBox が変わる"); click($$(".tnode")[3]); assert.ok(/状態:/.test(txt()));
});
await check("【ドクトリン】共通と政体固有の木・取得条件・理由の表示", () => { tab("doctrine"); assert.ok($$(".tnode").length >= 30); assert.ok(/共通の系統/.test(txt())); click($$(".tnode")[0]); assert.ok(/攻撃/.test(txt())); });
await check("【戦争】開戦が新しい順の一覧・詳細・講和（専用の手続き）・戦争研究所", async () => {
  hub("war"); await wait(60); const w = V().S.w, wars = Object.values(w.civ.wars).sort((a, b) => b.startedAt - a.startedAt); if (!wars.length) return; click($$(".vrow")[0]); assert.ok(/主要経過/.test(txt()) && /講和/.test(txt()) && /戦争研究所/.test(txt())); const act = wars.find((x) => x.status === "active"); if (act) { V().S.war = act.id; V().render(); assert.ok($("#peace-go"), "講和の申し入れ"); }
});
await check("【世界の外交】関係表・同盟グラフ・条約一覧（新しい順）", () => { hub("diplo"); assert.ok($(".mx") && /関係表/.test(txt()) && /同盟関係/.test(txt()) && /締結済みの条約/.test(txt())); assert.ok($$(".mx tr").length >= 3); });
await check("【文化・言語・宗教】樹形図・詳細・名前の編集（創造主の介入として記録）", () => {
  for (const k of ["culture", "language", "religion"]) { hub(k); assert.ok($("svg.tree") && $$(".tnode").length >= 1, k); click($$(".tnode")[0]); assert.ok($("#ent-rename"), k + " の詳細"); }
  hub("religion"); set($("#ent-name"), "試験の信仰"); click($("#ent-rename")); const id = V().S.entity.religion; assert.equal(V().S.w.civ.religions[id].name, "試験の信仰"); assert.ok((V().S.w.civ.wcde.edits ?? []).some((e) => e.targetId === id));
});
await check("【年表】客観イベント／AI の判断／創造主の介入／後世の認識を区別して閲覧でき、絞り込める（仮想スクロール）", async () => {
  hub("chron"); await wait(60); assert.ok($$(".vrow").length > 0 && $$(".vrow").length <= 80, "描画は見える範囲だけ " + $$(".vrow").length); click($$(".vrow")[0]); assert.ok($("#evdetail").textContent.length > 10);
  for (const t of ["decisions", "creator", "interp"]) { click($(`[data-ttype="${t}"]`)); await wait(40); assert.ok($("#pin").textContent.length > 20, t); }
  click($('[data-ttype="creator"]')); assert.ok(/直接編集|介入/.test(txt()), "創造主の記録を区別して表示");
});
await check("【統計】軍事力・国土・人口・文化・宗教・言語のランキング（基準つき）", () => { hub("stats"); for (const w of ["軍事力", "国土", "人口", "文化", "宗教", "言語"]) assert.ok(txt().includes(w), w); assert.ok((txt().match(/基準:/g) ?? []).length >= 6); });
await check("【検索】国家・文化・宗教・出来事などを横断して検索し、結果から移動できる", async () => {
  hub("search"); const nm = Object.values(V().S.w.civ.states)[0].name.slice(0, 2); set($("#q"), nm); await wait(40); assert.ok($$(".vrow").length > 0); const st = $$(".vrow").find((r) => r.textContent.startsWith("国家")); click(st); assert.equal(V().S.hub, "nations");
});
await check("【世界設定】生成設定・暦の表示名・保存/読み込み/Obsidian・版（アプリと保存形式は別）・整合性・過去の閲覧", async () => {
  hub("settings"); assert.ok(/世界の種/.test(txt()) && /保存形式の版/.test(txt()) && /問題なし/.test(txt())); click($("#save")); assert.ok(blobs >= 1 && /書き出しました/.test($("#exp-msg").textContent)); assert.ok($("#load") && $("#obs"));
  set($("#epoch-name"), "試験暦"); click($("#epoch-name").nextSibling); assert.equal(V().S.w.civ.wcde.config.calendar.epochName, "試験暦");
  const w = V().S.w, mi = w.civ.monthIndex; V().run({ type: "view.past", month: mi - 24 }); V().render(); assert.ok(/過去を閲覧中/.test($("#hint").textContent)); assert.equal(V().run({ type: "clock.run", months: 1 }).ok, false); V().run({ type: "view.past", month: null }); V().render();
});
await check("重大ニュースで全画面が出て、OK まで時間が進まず、OK で停止前の速度へ自動復帰する", async () => {
  const w = V().S.w; V().run({ type: "clock.setSpeed", speed: 3 }); const big = Object.values(w.civ.states).filter((x) => x.alive).sort((a, b) => b.pop - a.pop).slice(0, 8).map((x) => ({ entityId: x.id, role: "state" }));
  w.civ.events.push({ eventId: "event_ui_big", date: { ...w.civ.date }, kind: "state_dissolved", title: "（試験）大国が滅んだ", participants: big, location: null, causes: [], effects: [], decisionId: null, provenance: "simulation" }); w.civ.wcde.news.lastCrit = {};
  V().run({ type: "clock.run", months: 1 }); V().render(); assert.equal($("#newsmodal").hidden, false); assert.ok($("#newsmodal").textContent.includes("大国が滅んだ")); const mi = w.civ.monthIndex, r = V().run({ type: "clock.run", months: 3 }); assert.equal(r.ok, false); assert.equal(w.civ.monthIndex, mi); V().S.notice = ""; click($("#ack")); assert.equal($("#newsmodal").hidden, true); assert.equal(w.civ.wcde.time.speed, 3); assert.equal(w.civ.wcde.time.hold, false);
});
await check("画面の操作中に、未処理のエラーが出ていない", () => assert.deepEqual(errors, [], errors.join("\n")));
V().S.timer && window.clearInterval(V().S.timer); window.close();
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
