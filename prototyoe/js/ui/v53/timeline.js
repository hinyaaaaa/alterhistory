// v5.3 UI: 時間の操作。参考モックに合わせ、2 つの部品に分ける。
//   clock … 地図の上部中央に浮かぶ時計（年月・再生/停止・1か月・速さ ×1 ×2 ×4）
//   el    … 地図の下端の履歴帯（ニュース・年代記の入口・時間軸のスライダーと目印・「現在へ戻る」）
// 時間軸を操作すると、地図・パネル・一覧が選択した年月の状態に切り替わる（adapter.setView）。
//   ・過去を見ている間は読み取り専用: 再生・1か月進めるは無効、「現在へ戻る」を常に出す
//   ・重大イベントの確認待ちの間は、時間を再開できない
//   ・軸の上に、国家の成立・戦争・災害などの目印（adapter.band）を重ねる。件数が多いときは束ねて表示（履歴は削除しない）
import { h } from "./dom.js";
import { fmtMonth, fmtYear, clamp } from "./format.js";
import { categoryOf } from "./categories.js";

export const SPEEDS = [[120000, "×1"], [60000, "×2"], [30000, "×4"]];
export const PAST_REASON = "過去を閲覧中は時間を進められません。現在へ戻してください";
export const MAJOR_REASON = "重大イベントを確認するまで、時間は進められません";

export function createTimeline({ adapter, ui, maxBuckets = 160, scrubDebounceMs = 60 }) {
  // ---- 時計（地図上部中央） ----
  const date = h("output", { class: "v53-clock-date" });
  const era = h("span", { class: "v53-clock-sub" });
  const ro = h("span", { class: "v53-clock-ro", hidden: true, text: "過去（読み取り専用）" });
  const play = h("button", { type: "button", class: "v53-tlbtn", dataset: { act: "play" }, "aria-label": "再生", text: "▶" });
  const step = h("button", { type: "button", class: "v53-tlbtn wide", dataset: { act: "step" }, text: "+1か月" });
  const speedBtns = SPEEDS.map(([v, t]) => h("button", { type: "button", class: "v53-speed", dataset: { speed: v }, "aria-pressed": "false", text: t, onclick: () => adapter.time.setSpeedPerYear(v) }));
  const clock = h("div", { class: "v53-clock", role: "toolbar", "aria-label": "時間" }, date, era, ro, play, step, h("span", { class: "v53-speeds", role: "group", "aria-label": "進む速さ" }, speedBtns));

  // ---- 履歴帯（地図下端） ----
  const ticker = h("div", { class: "v53-ticker", "aria-label": "最近の出来事" });
  const news = h("button", { type: "button", class: "v53-ticker-open", text: "年代記", title: "歴史研究を開く", onclick: () => ui.set({ domain: "history", selection: null, trail: [], panelOpen: true, startFlow: false }) });
  const back = h("button", { type: "button", class: "v53-btn warn", dataset: { act: "return" }, text: "現在へ戻る", hidden: true, onclick: () => adapter.setView(null) });
  const scrub = h("input", { type: "range", class: "v53-tl-scrub", min: "0", max: "0", step: "1", value: "0", "aria-label": "表示する年月" });
  const ticks = h("div", { class: "v53-tl-ticks", "aria-hidden": "true" });
  const labels = h("div", { class: "v53-tl-labels", "aria-hidden": "true" }, h("span"), h("span"));
  const el = h("footer", { class: "v53-timeline", "aria-label": "履歴帯", dataset: { past: "false" } },
    h("div", { class: "v53-tl-top" }, h("b", { class: "v53-ticker-title", text: "ニュース" }), news, ticker, back),
    h("div", { class: "v53-tl-axis" }, ticks, scrub, labels));

  let markKey = "", newsKey = "", dragTimer = 0;
  const commit = (v) => { const m = adapter.meta(); adapter.setView(v >= m.now ? null : v); };

  function drawMarks(m) {
    const key = `${m.first}|${m.now}|${m.events}`; if (key === markKey) return; markKey = key;
    ticks.replaceChildren();
    if (!m.hasCiv || m.now <= m.first) return;
    const span = m.now - m.first, bands = adapter.band({ from: m.first, to: m.now, limit: 4000 });
    const n = Math.min(maxBuckets, span), bk = new Map();
    for (const e of bands) { const i = Math.min(n - 1, Math.floor(((e.month - m.first) / span) * n)); const b = bk.get(i) ?? { n: 0, tone: "muted", month: e.month, top: e }; b.n++; const c = categoryOf(e.kind); if (c.tone === "danger" || b.tone === "muted") b.tone = c.tone; bk.set(i, b); }
    for (const [i, b] of bk) {
      const t = h("button", { type: "button", class: `v53-tick tone-${b.tone}${b.n > 1 ? " multi" : ""}`, style: { left: `${(i / n) * 100}%` }, tabindex: -1, title: b.n > 1 ? `${fmtMonth(b.month)} ほか ${b.n - 1} 件` : `${fmtMonth(b.month)} ${b.top.title}` });
      t.addEventListener("click", () => commit(b.month)); ticks.append(t);
    }
  }
  function drawNews(m) {
    const key = `${m.view}|${m.now}|${m.events}`; if (key === newsKey) return; newsKey = key;
    ticker.replaceChildren();
    if (!m.hasCiv) return;
    for (const r of adapter.list("event", { limit: 3 }).rows) {
      ticker.append(h("button", { type: "button", class: "v53-news-item", title: r.title, onclick: () => ui.select({ kind: "event", id: r.id }) },
        h("i", { class: `v53-dot tone-${r.tone || "muted"}`, "aria-hidden": "true" }), h("span", { text: `${r.sub} ${r.title}` })));
    }
  }

  function sync() {
    const m = adapter.meta(), s = ui.get(), blocked = s.majorQueue.length > 0, v = m.view ?? m.now;
    el.dataset.past = String(m.past); clock.dataset.past = String(m.past);
    scrub.min = String(m.first); scrub.max = String(Math.max(m.first, m.now)); scrub.value = String(v); scrub.disabled = !m.hasCiv || m.now <= m.first;
    date.textContent = m.hasCiv ? fmtMonth(v) : "—";
    ro.hidden = !m.past; back.hidden = !m.past;
    labels.children[0].textContent = m.hasCiv ? fmtYear(m.first) : ""; labels.children[1].textContent = m.hasCiv ? fmtYear(m.now) : "";
    const running = adapter.time.isRunning(), off = !m.hasCiv || m.past || blocked;
    play.textContent = running ? "⏸" : "▶"; play.setAttribute("aria-label", running ? "停止" : "再生"); play.classList.toggle("running", running);
    const why = m.past ? PAST_REASON : blocked ? MAJOR_REASON : !m.hasCiv ? "歴史が始まってから使えます" : "";
    play.disabled = off && !running; step.disabled = off;
    play.title = play.disabled ? why : running ? "停止" : "再生"; step.title = step.disabled ? why : "1か月だけ進める";
    const sp = String(adapter.time.speedPerYear());
    for (const b of speedBtns) { const on = b.dataset.speed === sp; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); b.disabled = !m.hasCiv; }
    drawMarks(m); drawNews(m);
  }

  play.addEventListener("click", () => { if (adapter.time.isRunning()) adapter.time.stop(); else if (!ui.get().majorQueue.length) adapter.time.start(); sync(); });
  step.addEventListener("click", () => { if (!ui.get().majorQueue.length) adapter.time.step(); });
  scrub.addEventListener("input", () => { const v = Number(scrub.value); date.textContent = fmtMonth(v); clearTimeout(dragTimer); dragTimer = setTimeout(() => commit(v), scrubDebounceMs); });
  scrub.addEventListener("change", () => { clearTimeout(dragTimer); commit(Number(scrub.value)); });
  scrub.addEventListener("keydown", (e) => { if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return; e.preventDefault(); const d = e.key === "ArrowLeft" ? -12 : 12, m = adapter.meta(); commit(clamp((m.view ?? m.now) + d, m.first, m.now)); });

  const u1 = adapter.subscribe(sync), u2 = ui.subscribe((s, p) => { if (s.majorQueue !== p.majorQueue) sync(); });
  sync();
  return { el, clock, sync, dispose() { u1(); u2(); clearTimeout(dragTimer); } };
}
