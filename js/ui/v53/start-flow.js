// v5.3 UI: 開始フロー（指示書 5.2）。
//   ① 世界を生成 → ② 初期集団を選ぶ → ③ 国家成立の直前まで自動進行 → ④ プレイヤーが国家を成立させる
//   ・自動進行は固定年数で打ち切らない。長引いたら警告し、いつでも手動で中断できる（中断しても続きから再開できる）
//   ・停止点（国家成立の直前）の判定は adapter.start.readiness()。成立経路は複数あり、満たした経路をそのまま見せる
import { h } from "./dom.js";
import { fmtNum } from "./format.js";

export const CELL_PRESETS = [[50000, "50,000（軽い）"], [100000, "100,000"], [250000, "250,000（標準）"], [500000, "500,000"]];
export const WARN_AFTER_MONTHS = 12 * 1500;

const STEPS = [["none", "世界"], ["group", "初期集団"], ["running", "自動進行"], ["ready", "国家成立"]];
const stepIndex = (phase) => (phase === "founded" ? 4 : Math.max(0, STEPS.findIndex(([p]) => p === phase)));

export function createStartFlow({ adapter, ui, warnAfterMonths = WARN_AFTER_MONTHS, now = () => Date.now() }) {
  const el = h("section", { class: "v53-start", role: "region", "aria-label": "歴史の始まり" });
  const body = h("div", { class: "v53-start-body" });
  const steps = h("ol", { class: "v53-steps", "aria-label": "手順" }, STEPS.map(([p, t], i) => h("li", { dataset: { step: p } }, h("span", { class: "n", text: String(i + 1) }), h("span", { text: t }))));
  const close = h("button", { type: "button", class: "v53-iconbtn", "aria-label": "閉じる", title: "閉じる", text: "×", onclick: () => ui.set({ startFlow: false }) });
  el.append(h("header", { class: "v53-start-head" }, h("h2", { text: "歴史を始める" }), close), steps, body);

  let abort = null, progress = null, runError = "", startedAt = 0, genBusy = "", genError = "";

  function setSteps(phase) {
    const idx = stepIndex(phase);
    [...steps.children].forEach((li, i) => { li.classList.toggle("done", i < idx); li.classList.toggle("on", i === idx); if (i === idx) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current"); });
  }

  // ---- ① 世界 ----
  function viewWorld() {
    const seed = h("input", { type: "text", class: "v53-input", value: `world-${Date.now().toString(36)}`, "aria-label": "シード" });
    const cells = h("select", { class: "v53-select", "aria-label": "セル数" }, CELL_PRESETS.map(([v, t]) => h("option", { value: v, selected: v === 250000 }, t)));
    const land = h("input", { type: "range", min: "20", max: "80", value: "50", "aria-label": "陸地の割合" });
    const landV = h("span", { class: "v53-hint", text: "50%" }); land.addEventListener("input", () => { landV.textContent = `${land.value}%`; });
    const go = h("button", { type: "button", class: "v53-btn primary large", dataset: { act: "generate" }, text: genBusy ? "生成中…" : "世界を生成する" }); go.disabled = !!genBusy;
    go.addEventListener("click", async () => {
      abort = new AbortController(); genBusy = "世界を生成中…"; genError = ""; render();
      const r = await adapter.world.newWorld({ worldSeed: seed.value.trim(), resolution: { targetCells: Number(cells.value) }, landFraction: Number(land.value) / 100 }, { signal: abort.signal, onProgress: (p) => { genBusy = `世界を生成中: ${p?.label ?? p?.stage ?? ""}`; } });
      abort = null; genBusy = ""; if (!r?.ok && !r?.cancelled) genError = r?.error ?? "世界の生成に失敗しました"; render();
    });
    return [h("p", { class: "v53-lead", text: "大陸・気候・川・資源を持つ球面の世界を作ります。同じシードと設定なら、同じ地形になります。" }),
      h("div", { class: "v53-form grid" }, label("シード", seed), label("セル数", cells), label("陸地の割合", h("span", { class: "v53-inline" }, land, landV))),
      genBusy ? h("p", { class: "v53-hint", role: "status", text: genBusy }) : null, genError ? h("p", { class: "v53-error", role: "alert", text: genError }) : null,
      h("div", { class: "v53-actions" }, go, h("button", { type: "button", class: "v53-btn", dataset: { act: "open" }, text: "ファイルを開く", onclick: () => adapter.world.openFile() }))];
  }

  // ---- ② 初期集団 ----
  function viewGroup() {
    const groups = adapter.start.initialGroups(), sel = groups.find((g) => g.selected);
    const list = h("div", { class: "v53-groups", role: "listbox", "aria-label": "初期集団の候補" }, groups.map((g) => {
      const b = h("button", { type: "button", class: `v53-group${g.selected ? " on" : ""}`, role: "option", "aria-selected": String(!!g.selected), dataset: { id: g.id } },
        h("b", { text: g.title }), h("span", { text: g.sub ?? "" }), h("small", { text: (g.stats ?? []).map((s) => `${s.label} ${s.value}`).join("・") }));
      b.addEventListener("click", () => { adapter.start.chooseGroup(g.id); render(); });
      return b;
    }));
    const go = h("button", { type: "button", class: "v53-btn primary large", dataset: { act: "begin" }, text: "この集団で歴史を始める", onclick: () => { const r = adapter.start.begin(); if (!r.ok) runError = r.error ?? ""; else { runError = ""; startRun(); } render(); } });
    go.disabled = !sel;
    return [h("p", { class: "v53-lead", text: "歴史を始める人口集団を選びます。国家は、ここから時間とともに成立していきます。" }), list, runError ? h("p", { class: "v53-error", role: "alert", text: runError }) : null, h("div", { class: "v53-actions" }, go)];
  }

  // ---- ③ 自動進行 ----
  function startRun() {
    if (abort) return;
    abort = new AbortController(); runError = ""; startedAt = now(); progress = { months: 0, year: 0, states: 0 };
    adapter.start.run({ signal: abort.signal, onProgress: (p) => { progress = p; renderProgress(); } })
      .then((res) => { abort = null; if (res?.stopped === "error") runError = res.error ?? "自動進行でエラーが起きました"; render(); })
      .catch((e) => { abort = null; runError = e?.message ?? String(e); render(); });
  }
  const bar = h("div", { class: "v53-progress", dataset: { role: "progress" } });
  function renderProgress() {
    const p = progress ?? { months: 0 }, secs = Math.round((now() - startedAt) / 1000), long = p.months >= warnAfterMonths;
    bar.replaceChildren(
      h("p", { class: "v53-progress-line" }, h("b", { text: `${Math.floor(p.months / 12).toLocaleString("ja-JP")} 年経過` }), h("span", { text: `　世界の年: ${fmtNum(p.year ?? 0)}年　国家 ${p.states ?? 0}　${secs}秒` })),
      long ? h("p", { class: "v53-warn", role: "status", text: "国家の成立まで長引いています。このまま続けることも、いったん中断することもできます（進行は止まりません。打ち切りもしません）。" }) : null,
      p.stalled ? h("p", { class: "v53-warn", role: "status", text: "人口や集落にほとんど変化がありません。進行が止まっている可能性があります。" }) : null,
      p.warning ? h("p", { class: "v53-warn", role: "status", text: p.warning }) : null);
  }
  function viewRunning() {
    const running = !!abort; renderProgress();
    const stop = h("button", { type: "button", class: "v53-btn", dataset: { act: "abort" }, text: "中断する", onclick: () => abort?.abort() });
    const resume = h("button", { type: "button", class: "v53-btn primary", dataset: { act: "resume" }, text: "続きから進める", onclick: () => { startRun(); render(); } });
    return [h("p", { class: "v53-lead", text: "国家が成立する直前まで、世界を自動で進めています。他の国家も通常どおり成立・発展します。" }), bar,
      runError ? h("p", { class: "v53-error", role: "alert", text: runError }) : null, h("div", { class: "v53-actions" }, running ? stop : resume)];
  }

  // ---- ④ 国家成立 ----
  function viewReady() {
    const r = adapter.start.readiness();
    const found = h("button", { type: "button", class: "v53-btn primary large", dataset: { act: "found" }, text: "国家を成立させる" });
    found.addEventListener("click", () => { const res = adapter.start.found(r.proposalId); if (res.ok) { ui.set({ startFlow: false, domain: "state", selection: null, trail: [] }); } else { runError = res.error ?? ""; render(); } });
    return [h("p", { class: "v53-lead", text: "国家の成立条件が整いました。ここから先は、あなたが操作を引き継ぎます。" }),
      h("div", { class: "v53-card" }, h("h3", { text: `成立の経路: ${r.label ?? r.via}` }), h("ul", { class: "v53-checks" }, (r.conditions ?? []).map((c) => h("li", { class: c.met ? "met" : "", text: `${c.met ? "✓" : "・"} ${c.label}` })))),
      runError ? h("p", { class: "v53-error", role: "alert", text: runError }) : null, h("div", { class: "v53-actions" }, found)];
  }
  function viewFounded() {
    return [h("p", { class: "v53-lead", text: "歴史は進行中です。" }), h("div", { class: "v53-actions" }, h("button", { type: "button", class: "v53-btn primary", text: "閉じる", onclick: () => ui.set({ startFlow: false }) }))];
  }

  function render() {
    const st = adapter.start.state(); let phase = st.phase;
    if (genBusy) phase = "none";
    setSteps(phase); el.dataset.phase = phase; body.replaceChildren();
    const view = phase === "none" ? viewWorld : phase === "group" ? viewGroup : phase === "running" ? viewRunning : phase === "ready" ? viewReady : viewFounded;
    body.append(...view().filter(Boolean));
  }
  render();
  return { el, render, isRunning: () => !!abort, dispose() { abort?.abort(); } };
}
const label = (t, c) => h("label", { class: "v53-field" }, h("span", { text: t }), c);
