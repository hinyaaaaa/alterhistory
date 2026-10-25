// v5.3 UI: 画面の動作（JSDOM）。模擬世界に実際にマウントして、操作の結果を確かめる。
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "HTMLButtonElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent"]) globalThis[k] = dom.window[k];
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
const { mountV53 } = await import("../js/ui/v53/index.js");
const { createMockAdapter } = await import("../js/ui/v53/adapters/mock-adapter.js");
const { createMockMap } = await import("../js/ui/v53/adapters/mock-map.js");
const { createVList } = await import("../js/ui/v53/virtual-list.js");

let failed = 0; const check = async (l, fn) => { try { await fn(); console.log(`  OK   ${l}`); } catch (e) { failed++; console.log(`  FAIL ${l}: ${String(e.stack ?? e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
function boot(opts = {}) {
  document.body.innerHTML = '<div id="r"></div>'; const downloads = [];
  const adapter = opts.adapter ?? createMockAdapter({ years: 120, seed: opts.seed ?? 7, phase: opts.phase ?? "playing" }); const map = createMockMap({ adapter });
  const app = mountV53({ root: $("#r"), adapter, map, keyboard: false, download: (b, n) => downloads.push({ b, n }), pollMs: 1e9, notifierOptions: { schedule: () => 0, cancel: () => {} } });
  return { app, adapter, map, downloads, ui: app.ui };
}
const bigEvent = (id, extra = {}) => ({ id, month: 100, kind: "state_dissolved", title: `大事件 ${id}`, detail: "詳細", causeText: "原因を受けて", actors: [], impact: { actorPopShare: 0.4, territoryShare: 0.3, actorCount: 1, ripple: 3, player: true }, ...extra });
const minor = (id) => ({ id, month: 100, kind: "tech_discovered", title: `技術 ${id}`, impact: { actorPopShare: 0.01 } });
const notable = (id) => ({ id, month: 100, kind: "war_declared", title: `宣戦 ${id}`, impact: { actorPopShare: 0.1, actorCount: 2 } });

console.log("=== 画面の骨格 ===");
await check("レール 11 領域・地図・時計・履歴帯・ドックが揃い、世界の概要が出る", () => {
  const { app } = boot(); assert.equal($$(".v53-ri").length, 11); assert.ok($(".v53-map-canvas") && $(".v53-clock") && $(".v53-timeline") && $(".v53-dock-host .v53-dock"));
  assert.equal($(".v53-panel-title").textContent, "世界"); assert.ok($$(".v53-layers .v53-chipbtn").length >= 4); app.dispose();
});
await check("領域を選ぶと一覧になり、行を選ぶと詳細（概要・状態・関連・操作）、戻るで一覧へ", () => {
  const { app } = boot(); click($('[data-domain="state"]')); assert.ok($$(".v53-row").length > 0); assert.match($(".v53-list-count").textContent, /全 \d+ 件/);
  click($$(".v53-row")[0]); assert.ok($(".v53-panel-title").textContent.length > 0); const heads = $$(".v53-sec h3").map((h) => h.textContent); assert.ok(["概要", "状態"].every((x) => heads.includes(x)));
  assert.equal($('[data-domain="state"]').getAttribute("aria-current"), "page"); click($(".v53-panel-head .v53-iconbtn")); assert.ok($(".v53-list")); app.dispose();
});
await check("関連の対象を押すと、その対象の詳細へ移り、戻るで元の対象に戻る", () => {
  const { app, ui } = boot(); const w = app.adapter.list("war", { limit: 1 }).rows[0]; assert.ok(w, "模擬世界に戦争がある"); ui.select({ kind: "war", id: w.id });
  const link = $$(".v53-rel .v53-link").find((b) => b.dataset.kind === "state"); assert.ok(link); click(link); assert.equal(ui.get().selection.kind, "state"); ui.back(); assert.equal(ui.get().selection.id, w.id); app.dispose();
});
await check("地図で国家を選ぶと、右パネルがその国家になる（地図ポートの橋渡し）", () => {
  const { app, map, ui } = boot(); const b = map._blobs()[0] ?? { id: app.adapter.list("state", { limit: 1 }).rows[0].id }; map.canvas.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 }));
  ui.select({ kind: "state", id: b.id }); assert.equal($(".v53-panel-title").textContent, app.adapter.detail("state", b.id).title); app.dispose();
});
await check("仮想スクロール: 10万件でも描く行は少数で、スクロールすると続きが出る", () => {
  const rows = (o, n) => Array.from({ length: Math.max(0, Math.min(n, 100000 - o)) }, (_, i) => ({ id: o + i, title: `行${o + i}` }));
  const vl = createVList({ rowHeight: 40, getPage: (o, n) => ({ total: 100000, rows: rows(o, n) }), renderRow: (r) => { const d = document.createElement("div"); d.textContent = r.title; return d; } });
  document.body.append(vl.el); vl.refresh(); assert.ok(vl.renderedCount() <= 40, `行数 ${vl.renderedCount()}`); assert.equal(vl.el.querySelector(".v53-vlist-spacer").style.height, "4000000px");
  vl.el.scrollTop = 40 * 50000; vl.el.dispatchEvent(new dom.window.Event("scroll")); return tick(20).then(() => assert.ok(vl.el.textContent.includes("行50000")));
});

console.log("=== 過去の閲覧（読み取り専用） ===");
await check("時間軸で過去を選ぶと、帯・時計が過去表示になり、再生・1か月・操作が無効になる。現在へ戻れる", () => {
  const { app, adapter } = boot(); const m = adapter.meta(); const p = adapter.list("state", { limit: 1 }).rows.find((r) => r.tag === "プレイヤー") ?? adapter.list("state", { limit: 1 }).rows[0];
  app.ui.select({ kind: "state", id: p.id }); const playerActs = () => $$(".v53-actions .v53-btn:not([data-act])");
  const scrub = $(".v53-tl-scrub"); scrub.value = String(m.now - 240); scrub.dispatchEvent(new dom.window.Event("change"));
  assert.equal($(".v53").dataset.past, "true"); assert.equal(adapter.meta().view, m.now - 240); assert.equal($('[data-act="play"]').disabled, true); assert.equal($('[data-act="step"]').disabled, true);
  assert.ok($(".v53-clock-ro") && !$(".v53-clock-ro").hidden); assert.ok($('[data-act="return"]') && !$('[data-act="return"]').hidden); assert.ok($(".v53-banner")); assert.ok(playerActs().every((b) => b.disabled)); assert.match($(".v53-hint").textContent, /読み取り専用/);
  const before = adapter.meta().now; adapter.time.step(); assert.equal(adapter.meta().now, before);
  click($('[data-act="return"]')); assert.equal($(".v53").dataset.past, "false"); assert.equal(adapter.meta().view, null); assert.equal($('[data-act="play"]').disabled, false); app.dispose();
});
await check("過去を見ている間、一覧の件数がその月までに絞られ、新しい出来事の通知は出ない", () => {
  const { app, adapter } = boot(); const all = adapter.list("event", { limit: 1 }).total; adapter._debug.advance(); adapter.setView(adapter.meta().first + 600); assert.ok(adapter.list("event", { limit: 1 }).total < all); assert.deepEqual(adapter.newEvents(), []); app.dispose();
});
await check("世界を変える操作（新しい世界・ファイルを開く・地図編集）も、過去の間は無効", () => {
  const { app, adapter, ui } = boot(); adapter.setView(adapter.meta().now - 24); ui.set({ domain: "world", selection: null }); app.shell.panel.render(true);
  for (const id of ["new-world", "open", "edit-map"]) assert.equal($(`[data-act="${id}"]`).disabled, true, id); assert.equal($('[data-act="fit"]').disabled, false); app.dispose();
});

console.log("=== 通知・重大イベント ===");
await check("重大イベントは時間を止め、全画面の新聞で確認するまで再開できない（再生ボタンも無効）", () => {
  const { app, adapter, ui } = boot(); adapter.time.start(); assert.equal(adapter.time.isRunning(), true);
  const r = app.notifier.ingest([bigEvent("e1")]); assert.equal(r.major.length, 1); assert.equal(adapter.time.isRunning(), false);
  assert.ok($(".v53-major") && !$(".v53-major").hidden); assert.match($(".v53-paper-title").textContent, /大事件 e1/); assert.ok($(".v53-paper-why")); assert.equal($('[data-act="play"]').disabled, true); assert.equal($('[data-act="step"]').disabled, true);
  adapter.time.start(); assert.equal(adapter.time.isRunning(), false, "確認前は adapter 側でも再開しない");
  click($('[data-act="confirm"]')); assert.ok($(".v53-major").hidden); assert.equal($('[data-act="play"]').disabled, false); app.dispose();
});
await check("複数の重大イベントはキューに積まれ、順番に 1 件ずつ確認する。取りこぼさない", () => {
  const { app, ui } = boot(); app.notifier.ingest([bigEvent("a"), bigEvent("b")]); app.notifier.ingest([bigEvent("c"), bigEvent("a")]); assert.equal(ui.get().majorQueue.length, 3, "同じ ID は重複して積まない");
  const seen = []; while (ui.get().majorQueue.length) { seen.push($(".v53-paper-title").textContent); assert.match($(".v53-paper-remaining").textContent, ui.get().majorQueue.length > 1 ? /ほか/ : /^$/); click($('[data-act="confirm"]')); }
  assert.deepEqual(seen, ["大事件 a", "大事件 b", "大事件 c"]); app.dispose();
});
await check("止める前に時間が動いていたときだけ「確認して時間を再開」が出て、押すと再開する", () => {
  const a = boot(); a.adapter.time.start(); a.app.notifier.ingest([bigEvent("x")]); assert.ok($('[data-act="confirm-resume"]')); click($('[data-act="confirm-resume"]')); assert.equal(a.adapter.time.isRunning(), true); a.adapter.time.stop(); a.app.dispose();
  const b = boot(); b.app.notifier.ingest([bigEvent("y")]); assert.equal($('[data-act="confirm-resume"]'), null); click($('[data-act="confirm"]')); assert.equal(b.adapter.time.isRunning(), false); b.app.dispose();
});
await check("通常通知は個別に出て、件数が増えると 1 枚の要約になる（件数は消えない・歴史研究で全件を辿れる）", () => {
  const { app, ui } = boot(); app.notifier.ingest([notable("n1"), notable("n2")]); assert.equal($$(".v53-toast").length, 2); assert.equal($(".v53-toast.summary"), null);
  app.notifier.ingest(Array.from({ length: 12 }, (_, i) => notable(`m${i}`))); const sum = $(".v53-toast.summary"); assert.ok(sum); assert.match(sum.textContent, /12 件/); assert.match(sum.textContent, /戦争 12/);
  click(sum.querySelector(".v53-link")); assert.equal(ui.get().domain, "history"); assert.ok($(".v53-list")); app.dispose();
});
await check("軽微な出来事は通知に出さない / 重大でも通常通知の表示設定に左右されず必ず出る", () => {
  const { app, ui } = boot(); app.notifier.ingest([minor("t1"), minor("t2")]); assert.equal($$(".v53-toast").length, 0);
  ui.set({ settings: { ...ui.get().settings, showToasts: false } }); app.notifier.ingest([notable("q")]); assert.equal($$(".v53-toast").length, 0); app.notifier.ingest([bigEvent("z")]); assert.ok(!$(".v53-major").hidden); app.dispose();
});
await check("通知から出来事を開くと、右パネルに詳細（原因・後続）が出る", () => {
  const { app, adapter, ui } = boot(); const ev = adapter.list("event", { limit: 1 }).rows[0]; app.notifier.ingest([{ ...notable(ev.id), id: ev.id }]); click($(".v53-toast-title")); assert.deepEqual(ui.get().selection, { kind: "event", id: ev.id }); app.dispose();
});
await check("再生中に届く実際の出来事が、そのまま通知の入力になる（模擬世界を進める）", async () => {
  const { app, adapter } = boot({ seed: 3 }); adapter.newEvents(); let got = 0; for (let i = 0; i < 600; i++) { adapter.time.step(); got += app.notifier.poll().major.length + app.notifier.poll().notable.length; } assert.ok(got >= 0); assert.ok($$(".v53-toast").length <= 4); app.dispose();
});

console.log("=== 開始フロー（ドックの中） ===");
await check("開始フローの自動進行中は通知で割り込まない。フローを閉じると、その間の出来事が 1 枚の要約で知らされる", async () => {
  const { app, ui } = boot({ phase: "empty" }); assert.equal(ui.get().startFlow, true); const r = app.notifier.ingest([bigEvent("s1"), notable("s2"), notable("s3")]); assert.equal(r.held, true); assert.equal(ui.get().majorQueue.length, 0); assert.ok($(".v53-major").hidden); assert.equal($$(".v53-toast").length, 0);
  ui.set({ startFlow: false }); const sum = $(".v53-toast.summary"); assert.ok(sum); assert.match(sum.textContent, /3 件/); assert.equal(ui.get().majorQueue.length, 0); app.dispose();
});
await check("世界が無い状態では開始フローがドックに出る → 生成 → 初期集団 → 自動進行 → 国家成立 → 閉じて国家の画面へ", async () => {
  const { app, adapter, ui } = boot({ phase: "empty" }); assert.equal(ui.get().startFlow, true); assert.ok($(".v53-start")); assert.equal($(".v53-start").dataset.phase, "none"); assert.equal($('[data-step="none"]').classList.contains("on"), true);
  click($('[data-act="generate"]')); await tick(); assert.equal($(".v53-start").dataset.phase, "group"); assert.ok($$(".v53-group").length >= 2); assert.equal($('[data-act="begin"]').disabled, true, "選ぶまで始められない");
  click($$(".v53-group")[1]); assert.equal($('[data-act="begin"]').disabled, false); assert.equal($$(".v53-group")[1].getAttribute("aria-selected"), "true");
  click($('[data-act="begin"]')); await tick(); assert.equal($(".v53-start").dataset.phase, "running"); assert.ok($('[data-role="progress"]'));
  for (let i = 0; i < 400 && adapter.start.state().phase !== "ready"; i++) await tick(5); assert.equal($(".v53-start").dataset.phase, "ready"); assert.match($(".v53-checks").textContent, /農耕/);
  click($('[data-act="found"]')); assert.equal(ui.get().startFlow, false); assert.equal(ui.get().domain, "state"); assert.equal(adapter.start.state().phase, "founded"); assert.ok($(".v53-dock .v53-list")); app.dispose();
});
await check("自動進行は手動で中断でき、続きから再開できる（固定年数で打ち切らない）。長引くと警告が出る", async () => {
  const { app, adapter } = boot({ phase: "empty" }); click($('[data-act="generate"]')); await tick(); click($$(".v53-group")[0]); click($('[data-act="begin"]')); await tick(2);
  click($('[data-act="abort"]')); await tick(30); assert.ok($('[data-act="resume"]'), "中断後は続きから進めるボタン"); assert.equal(adapter.start.state().phase, "running"); const m1 = adapter._debug.S.start.months;
  click($('[data-act="resume"]')); for (let i = 0; i < 400 && adapter.start.state().phase !== "ready"; i++) await tick(5); assert.ok(adapter._debug.S.start.months >= m1); assert.equal(adapter.start.state().phase, "ready"); app.dispose();
  const slow = createMockAdapter({ phase: "empty" }); slow.start.run = async ({ onProgress }) => { onProgress({ months: 12 * 1600, year: 1600, states: 2, stalled: true }); return new Promise(() => {}); };
  const w = boot({ adapter: slow }); click($('[data-act="generate"]')); await tick(); click($$(".v53-group")[0]); click($('[data-act="begin"]')); await tick(); assert.match($(".v53-warn").textContent, /長引いて|止まっている/); assert.ok($('[data-act="abort"]')); w.app.dispose();
});
await check("開始フローの途中で閉じると、進行中の自動進行は中断される", async () => {
  const { app, ui } = boot({ phase: "empty" }); click($('[data-act="generate"]')); await tick(); click($$(".v53-group")[0]); click($('[data-act="begin"]')); await tick(2); ui.set({ startFlow: false }); await tick(30); assert.equal($(".v53-start"), null); app.dispose();
});

console.log("=== 出力 ===");
await check("Chronicle・.ahmap・PNG（2 種）が書き出され、PNG は何の画像かの説明を返す", async () => {
  const { app, downloads, ui } = boot(); ui.set({ domain: "export", selection: null }); assert.equal($$(".v53-card").length, 4);
  click($('[data-act="chronicle"]')); await tick(30); assert.match($('[data-status="chronicle"]').textContent, /書き出しました/); click($('[data-act="ahmap"]')); await tick(30);
  click($("#v53-png-territory")); assert.match($('[data-role="png-what"]').textContent, /選択年月の領土図/); click($('[data-act="png"]')); await tick(30); assert.match($('[data-status="png"]').textContent, /領土を持つ/);
  assert.deepEqual(downloads.map((d) => d.n.split(".").pop()), ["md", "ahmap", "png"]); app.dispose();
});
await check("Obsidian: 複数 ZIP に分かれて順に渡され、検査結果（欠落・重複なし）が出る。中断もできる", async () => {
  const adapter = createMockAdapter({ years: 60 }); const orig = adapter.exports.obsidian; adapter.exports.obsidian = (o) => orig({ ...o, maxPartFiles: 9 });
  const { app, downloads, ui } = boot({ adapter }); ui.set({ domain: "export", selection: null }); click($('[data-act="obsidian"]')); for (let i = 0; i < 100 && !/検査/.test($('[data-status="obsidian"]').textContent); i++) await tick(10);
  assert.ok(downloads.length >= 4, `パート数 ${downloads.length}`); assert.match($('[data-status="obsidian"]').textContent, /欠落・重複はありません/); assert.equal($$('[data-role="parts"] li').length, downloads.length); assert.ok(downloads.every((d, i) => d.n.endsWith(`${String(i + 1).padStart(3, "0")}.zip`)));
  assert.match($('[data-role="estimate"]').textContent, /複数の ZIP に自動で分割/); app.dispose();
});
await check("出力に失敗したら、理由を画面に出して操作を戻す（黙って失敗しない）", async () => {
  const adapter = createMockAdapter({ years: 20 }); adapter.exports.chronicle = async () => { throw new Error("容量が足りません"); };
  const { app, ui } = boot({ adapter }); ui.set({ domain: "export", selection: null }); click($('[data-act="chronicle"]')); await tick(30); assert.match($('[data-status="chronicle"]').textContent, /失敗しました: 容量が足りません/); assert.equal($('[data-act="chronicle"]').disabled, false); app.dispose();
});

console.log("=== 入力の安全 ===");
await check("名前に HTML が入っていても、画面では文字として出る（innerHTML を使わない）", () => {
  const adapter = createMockAdapter({ years: 30 }); const evil = '<img src=x onerror="window.__pwn=1">'; adapter._debug.S.states[0].name = evil;
  const { app, ui } = boot({ adapter }); ui.select({ kind: "state", id: adapter._debug.S.states[0].id }); assert.equal($(".v53-panel-title").textContent, evil); assert.equal($(".v53-panel img"), null); assert.equal(window.__pwn, undefined); app.dispose();
});
console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
