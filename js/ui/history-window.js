// V5-M10: 歴史ビューア。国家・戦争・出来事・AI判断を、検索・並び替え・仮想スクロールで辿り、歴史地図・詳細・過去の月と連動させる。
//   ・一覧の選択 → 詳細パネル・歴史地図の強調が同時に変わる。地図をクリックすると、その領域の国家が選ばれる。
//   ・下の時間バーで過去の月へ移ると、一覧・詳細・地図が月次履歴から復元した状態に変わる。過去の間は読み取り専用（命令・時間送りは止まる）。
//   ・Ctrl/⌘+K で検索へ。
import { el } from "./kit.js";
import { downloadBlob } from "./download.js";
import { createVirtualList } from "./virtual-list.js";
import { guardRender } from "./safe-render.js";
import { cellRaster } from "../core/world/cell-raster.js";
import { colorOf } from "../app/history-actions.js";
import { POLITY, VIA } from "../core/civ/states.js";
import { GOAL_JA } from "../core/civ/ai.js";

const fmt = (n) => Math.round(n).toLocaleString("ja-JP"), ym = (mi) => `${Math.floor(mi / 12)}年${((mi % 12) + 12) % 12 + 1}月`;
const TABS = [["states", "国家"], ["wars", "戦争"], ["events", "出来事"], ["decisions", "AI判断"], ["search", "検索"]];
const OUTCOME = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", negotiated: "講和", stalemate: "膠着" };
const MAPW = 480, MAPH = 240;

export function initHistoryWindow({ store, wins, history, civActions }) {
  const body = el("div", "hv-body"), ui = { tab: "states", sel: null, query: "", sort: "pop", filter: "alive", kind: "", evQuery: "", evRows: [], evNext: null, decRows: [], decNext: null, search: "", msg: "" };
  let lists = {}, mapCanvas = null, detailBox = null, mapNote = null, header = null, slider = null, built = false, raf = 0;
  const say = (m) => { ui.msg = m; detail(); };

  function build() {
    body.replaceChildren(); built = true;
    header = el("div", "hv-head"); const date = el("strong", "hv-date"); date.dataset.role = "date"; const badge = el("span", "hv-badge", "過去の閲覧（読み取り専用）"); badge.dataset.role = "past"; const back = el("button", "primary", "現在へ戻る"); back.type = "button"; back.dataset.role = "back"; back.addEventListener("click", () => history.setView(null));
    slider = document.createElement("input"); slider.type = "range"; slider.className = "hv-slider"; slider.setAttribute("aria-label", "見る月"); slider.addEventListener("change", () => history.setView(Number(slider.value)));
    const sq = document.createElement("input"); sq.type = "search"; sq.className = "hv-q"; sq.placeholder = "検索（Ctrl+K）"; sq.dataset.role = "search"; sq.addEventListener("keydown", (e) => { if (e.key === "Enter") { ui.search = sq.value; ui.tab = "search"; sync(); } });
    header.append(date, badge, slider, back, sq); body.append(header);
    const ex = el("details", "hv-export"); ex.dataset.role = "export"; ex.append(el("summary", "", "Obsidian へ書き出す（Markdown の ZIP）")); const exBody = el("div", "hv-exbody"); ex.append(exBody); body.append(ex); ex.addEventListener("toggle", () => { if (ex.open) exportPanel(exBody); });
    const tabs = el("div", "hv-tabs"); tabs.setAttribute("role", "tablist"); for (const [k, t] of TABS) { const b = el("button", "hv-tab", t); b.type = "button"; b.dataset.tab = k; b.setAttribute("role", "tab"); b.addEventListener("click", () => { ui.tab = k; sync(); }); tabs.append(b); } body.append(tabs);
    const cols = el("div", "hv-cols"), left = el("div", "hv-left"), mid = el("div", "hv-mid"), right = el("div", "hv-right"); cols.append(left, mid, right); body.append(cols);
    left.append(el("div", "hv-controls")); left.firstChild.dataset.role = "controls"; const host = el("div", "hv-listhost"); host.dataset.role = "list"; left.append(host);
    mapCanvas = document.createElement("canvas"); mapCanvas.width = MAPW; mapCanvas.height = MAPH; mapCanvas.className = "hv-map"; mapCanvas.setAttribute("aria-label", "歴史地図（クリックで国家を選ぶ）"); mapNote = el("p", "muted hv-mapnote"); mid.append(mapCanvas, mapNote);
    mapCanvas.addEventListener("click", (e) => { const w = store.getState().map?.world; if (!w) return; const r = mapCanvas.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) / r.width) * MAPW), y = Math.floor(((e.clientY - r.top) / r.height) * MAPH), c = cellRaster(w, MAPW, MAPH)[y * MAPW + x], o = history.territory().owner.get(c); if (o) { ui.sel = { type: "state", id: o }; sync(); } });
    detailBox = el("div", "hv-detail"); detailBox.dataset.role = "detail"; right.append(detailBox);
  }
  async function exportPanel(box) {
    box.replaceChildren(); const civ = store.getState().map?.civ; if (!civ) return; const opt = { decisions: true, from: "", to: "" };
    const note = el("p", "muted"), btn = el("button", "primary", "ZIP を書き出す"); btn.type = "button"; btn.dataset.role = "export-go";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.addEventListener("change", () => { opt.decisions = cb.checked; est(); }); const lab = el("label", ""); lab.append(cb, " すべてのAI判断を個別ノートにする");
    const f = document.createElement("input"), t = document.createElement("input"); for (const [x, ph, k] of [[f, "開始年（空欄=最初）", "from"], [t, "終了年（空欄=現在）", "to"]]) { x.type = "number"; x.placeholder = ph; x.addEventListener("change", () => { opt[k] = x.value; est(); }); }
    const range = () => ({ decisionNotes: opt.decisions, fromMonth: opt.from === "" ? undefined : Number(opt.from) * 12, toMonth: opt.to === "" ? undefined : Number(opt.to) * 12 + 11 });
    const est = async () => { const { estimateVault } = await import("../io/obsidian.js"); const e = estimateVault(store.getState().map.world, civ, { ...range(), cellRaster }); note.textContent = `書き出す内容: ノート約 ${e.files.toLocaleString("ja-JP")} 件（出来事 ${e.events.toLocaleString("ja-JP")}・AI判断 ${e.decisions.toLocaleString("ja-JP")}・詳細ログ ${e.logs.toLocaleString("ja-JP")}）と地図画像 ${e.maps} 枚。歴史が長いほど大きく・時間がかかります（範囲を絞れます）。出力先は「世界名」フォルダの内側だけです。`; };
    btn.addEventListener("click", async () => { btn.disabled = true; note.textContent = "書き出し中…"; try { const { exportObsidianZip } = await import("../io/obsidian.js"), map = store.getState().map, name = map.meta?.name || "新世界より"; const R = await exportObsidianZip(map.world, map.civ, name, { ...range(), cellRaster, onProgress: async (n) => { note.textContent = `書き出し中… ${n.toLocaleString("ja-JP")} 件`; await new Promise((r) => setTimeout(r, 0)); } }); downloadBlob(new Blob([R.bytes], { type: "application/zip" }), `${R.root}_obsidian.zip`); note.textContent = `書き出しました: ${R.files.toLocaleString("ja-JP")} ファイル・${(R.bytes.length / 1e6).toFixed(1)}MB・リンク切れ ${R.unresolvedLinks} 件`; } catch (e) { note.textContent = `書き出せませんでした: ${e.message}`; } btn.disabled = false; });
    box.append(lab, el("div", "hv-exrange"), note, btn); box.querySelector(".hv-exrange").append(f, " 〜 ", t); est();
  }
  const sync = () => { if (!wins.isOpen("history") && !body.isConnected) { /* 窓が閉じていても状態は更新できる */ } refresh(); };

  function controls() {
    const c = body.querySelector("[data-role=controls]"); c.replaceChildren();
    if (ui.tab === "states") {
      const q = document.createElement("input"); q.type = "search"; q.placeholder = "国家名で絞り込み"; q.value = ui.query; q.addEventListener("change", () => { ui.query = q.value; lists.states?.el && lists.states.refresh(); });
      const so = select([["pop", "人口順"], ["formed", "成立の古い順"], ["name", "名前順"]], ui.sort, (v) => { ui.sort = v; lists.states.refresh(); }), fl = select([["alive", "存続中"], ["dead", "滅亡"], ["all", "すべて"]], ui.filter, (v) => { ui.filter = v; lists.states.refresh(); }); c.append(q, so, fl);
    } else if (ui.tab === "wars") { const q = document.createElement("input"); q.type = "search"; q.placeholder = "戦争を絞り込み"; q.value = ui.query; q.addEventListener("change", () => { ui.query = q.value; lists.wars.refresh(); }); c.append(q); }
    else if (ui.tab === "events") {
      const q = document.createElement("input"); q.type = "search"; q.placeholder = "タイトルで絞り込み"; q.value = ui.evQuery; q.addEventListener("change", () => { ui.evQuery = q.value; loadEvents(true); });
      const kinds = [["", "すべての種類"], ["war_declared", "宣戦"], ["war_ended", "終戦"], ["state_formed", "国家の成立"], ["state_dissolved", "国家の滅亡"], ["disaster_struck", "災害"], ["famine", "飢え"], ["tech_discovered", "技術の発見"], ["magic_gifted_found", "魔法の素質"], ["diplomacy_failed", "外交の不成立"]];
      c.append(q, select(kinds, ui.kind, (v) => { ui.kind = v; loadEvents(true); }));
      if (ui.sel?.type === "state") { const f = el("span", "muted", `${nameOf(ui.sel.id)}に関わるものだけ`); c.append(f); }
    } else if (ui.tab === "decisions") c.append(el("span", "muted", ui.sel?.type === "state" ? `${nameOf(ui.sel.id)}のAI判断` : "国家を選ぶと、その国家のAI判断が出ます"));
    else if (ui.tab === "search") { const q = document.createElement("input"); q.type = "search"; q.value = ui.search; q.placeholder = "国家・戦争・人物・出来事を検索"; q.dataset.role = "search2"; q.addEventListener("change", () => { ui.search = q.value; lists.search?.refresh(); }); c.append(q); }
  }
  function select(opts, val, on) { const s = document.createElement("select"); for (const [v, t] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = t; o.selected = v === val; s.append(o); } s.addEventListener("change", () => on(s.value)); return s; }
  const nameOf = (id) => store.getState().map?.civ?.states[id]?.name ?? id;

  function listArea() {
    const host = body.querySelector("[data-role=list]"); host.replaceChildren(); lists = {};
    if (ui.tab === "states") { lists.states = createVirtualList({ rowHeight: 34, height: 330, getRows: (o, n) => history.listStates({ query: ui.query, sort: ui.sort, filter: ui.filter, offset: o, limit: n }), renderRow: (r) => { const row = el("div", "hv-row"); const sw = el("i", "hv-sw"); sw.style.background = colorOf(r.id); row.append(sw, el("span", "hv-name", `${r.player ? "★ " : ""}${r.name}`), el("span", "muted", `${fmt(r.pop)}人`)); if (!r.alive) row.classList.add("dead"); return row; }, onSelect: (r) => { ui.sel = { type: "state", id: r.id }; refresh(false); } }); host.append(lists.states.el); lists.states.refresh(); }
    else if (ui.tab === "wars") { lists.wars = createVirtualList({ rowHeight: 34, height: 330, getRows: (o, n) => history.listWars({ query: ui.query, offset: o, limit: n }), renderRow: (f) => { const row = el("div", "hv-row"); row.append(el("span", "hv-name", f.title), el("span", "muted", `${ym(f.startedAt)}〜`)); return row; }, onSelect: (f) => { ui.sel = { type: "family", id: f.id, fam: f }; refresh(false); } }); host.append(lists.wars.el); lists.wars.refresh(); }
    else if (ui.tab === "search") { lists.search = createVirtualList({ rowHeight: 34, height: 330, getRows: (o) => { const r = history.search(ui.search, 60); return { total: r.length, rows: r.slice(o, o + 40) }; }, renderRow: (r) => { const row = el("div", "hv-row"); row.append(el("span", "hv-type", TYPE_JA[r.type] ?? r.type), el("span", "hv-name", r.name), el("span", "muted", r.extra)); return row; }, onSelect: (r) => { ui.sel = { type: r.type === "person" || r.type === "culture" || r.type === "religion" ? "state" : r.type, id: r.id }; if (r.type === "event") ui.tab = "events"; refresh(false); } }); host.append(lists.search.el); lists.search.refresh(); }
    else if (ui.tab === "events") { const box = el("div", "hv-pagelist"); box.dataset.role = "events"; host.append(box); loadEvents(true); }
    else if (ui.tab === "decisions") { const box = el("div", "hv-pagelist"); box.dataset.role = "decisions"; host.append(box); loadDecisions(true); }
  }
  const TYPE_JA = { state: "国家", war: "戦争", person: "人物", event: "出来事", culture: "文化", religion: "宗教" };
  function loadEvents(reset) {
    const box = body.querySelector("[data-role=events]"); if (!box) return; if (reset) { ui.evRows = []; ui.evNext = null; }
    const r = history.listEvents({ entityId: ui.sel?.type === "state" ? ui.sel.id : null, kind: ui.kind || null, query: ui.evQuery, before: reset ? null : ui.evNext, limit: 50 }); ui.evRows.push(...r.rows); ui.evNext = r.next; box.replaceChildren();
    for (const e of ui.evRows) { const row = el("div", "hv-row hv-ev", ""); row.append(el("span", "muted", `${e.date.year}年${e.date.month}月`), el("span", "hv-name", e.title)); row.addEventListener("click", () => { ui.sel = { type: "event", id: e.eventId }; refresh(false); }); box.append(row); }
    if (!ui.evRows.length) box.append(el("p", "muted", "該当する出来事はありません")); if (ui.evNext) { const more = el("button", "", "続きを読む"); more.type = "button"; more.addEventListener("click", () => loadEvents(false)); box.append(more); }
  }
  function loadDecisions(reset) {
    const box = body.querySelector("[data-role=decisions]"); if (!box) return; if (reset) { ui.decRows = []; ui.decNext = null; } if (ui.sel?.type !== "state") { box.replaceChildren(el("p", "muted", "国家を選ぶと、その国家のAI判断が新しい順に出ます")); return; }
    const r = history.listDecisions(ui.sel.id, { before: reset ? null : ui.decNext, limit: 30 }); ui.decRows.push(...r.rows); ui.decNext = r.next; box.replaceChildren();
    for (const d of ui.decRows) { const row = el("div", "hv-row"); row.append(el("span", "muted", `${d.date.year}年${d.date.month}月`), el("span", "hv-name", `${d.chosen.key ?? "何もしない"}`), el("span", "muted", d.result ? (d.result.ok ? "成功" : "失敗") : "")); row.addEventListener("click", () => { ui.sel = { type: "decision", id: d.decisionId, actor: ui.sel.id }; refresh(false); }); box.append(row); }
    if (ui.decNext != null) { const more = el("button", "", "続きを読む"); more.type = "button"; more.addEventListener("click", () => loadDecisions(false)); box.append(more); }
  }

  const link = (type, id, text) => { const b = el("button", "hv-link", text); b.type = "button"; b.addEventListener("click", () => { ui.sel = { type, id }; refresh(false); }); return b; };
  function detail() {
    const box = detailBox; if (!box) return; box.replaceChildren(); const civ = store.getState().map?.civ; if (!civ) return; const s = ui.sel; if (ui.msg) box.append(el("p", "hv-msg", ui.msg));
    if (!s) { const m = history.meta(); box.append(el("h4", "", "概要"), el("p", "", `${ym(history.viewMonth())}　国家 ${fmt(m.states)}・集団 ${fmt(m.groups)}・出来事 ${fmt(m.events)}・AI判断 ${fmt(m.decisions)}`), el("p", "muted", "左の一覧から国家・戦争・出来事を選ぶか、地図の領域をクリックしてください。Ctrl+K で検索できます。")); return; }
    if (s.type === "state") stateDetail(box, s.id); else if (s.type === "family") familyDetail(box, s.fam); else if (s.type === "war") warDetail(box, s.id); else if (s.type === "event") eventDetail(box, s.id); else if (s.type === "decision") decisionDetail(box, s.id);
  }
  function stateDetail(box, id) {
    const d = history.stateDetail(id); if (!d) { box.append(el("p", "muted", "この国家は存在しません")); return; } if (d.notYet) { box.append(el("h4", "", d.name), el("p", "muted", `この月（${ym(d.month)}）には、まだ成立していません（成立: ${ym(d.formedAt)}）`)); return; }
    box.append(el("h4", "", `${d.player ? "★ " : ""}${d.name}`), el("p", "muted", `${ym(d.month)}の状態${d.alive ? "" : "（滅亡後）"}　${POLITY[d.polity] ?? d.polity}・${VIA[d.via]?.ja ?? d.via}`));
    const kv = el("dl", "hv-kv"); for (const [k, v] of [["指導者", d.leader.name], ["人口", `${fmt(d.pop)}人`], ["安定度", `${Math.round(d.stability * 100)}`], ["財政", fmt(d.treasury)], ["兵力", fmt(d.army)], ["集落", d.settlements], ["方針", d.strategy ? GOAL_JA[d.strategy] ?? d.strategy : "—"], ["成立", ym(d.formedAt)], ...(d.dissolvedAt != null ? [["滅亡", ym(d.dissolvedAt)]] : []), ...(d.magicPower ? [["魔法の国力", d.magicPower]] : []), ...(d.resilience ? [["備蓄・治水", d.resilience]] : [])]) { kv.append(el("dt", "", k), el("dd", "", String(v))); } box.append(kv);
    if (d.predecessor) { const p = el("p", ""); p.append("前身: ", link("state", d.predecessor.id, d.predecessor.name)); box.append(p); }
    if (d.wars.length) { const p = el("p", ""); p.append("戦争: "); for (const w of d.wars) { p.append(link("war", w.id, w.name), " "); } box.append(p); }
    if (d.relations.length) { const p = el("p", ""); p.append("関係: "); for (const r of d.relations.slice(0, 6)) p.append(link("state", r.id, `${r.name} ${r.value}`), " "); box.append(p); }
    box.append(el("p", "muted", `採用技術 ${d.techs.length}${d.techs.length ? `（${d.techs.slice(-4).map((t) => t.name).join("・")}…）` : ""}`));
    const comp = d.composition; if (comp.total > 0) { const top = Object.entries(comp.species).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round((v / comp.total) * 100)}%`).join("、"); box.append(el("p", "muted", `人口構成（種族）: ${top}`)); }
    const evb = el("button", "", "この国家の出来事を見る"); evb.type = "button"; evb.addEventListener("click", () => { ui.tab = "events"; refresh(true); }); const dcb = el("button", "", "AI判断を見る"); dcb.type = "button"; dcb.addEventListener("click", () => { ui.tab = "decisions"; refresh(true); }); box.append(evb, dcb);
    if (d.player && !history.isPast() && civActions) { const po = civActions.playerStateOptions(); if (po) { const ok = po.options.filter((o) => o.eligible).slice(0, 12); box.append(el("h5", "", "あなたの行動")); for (const o of ok) { const b = el("button", "", o.label); b.type = "button"; b.addEventListener("click", () => { const r = civActions.stateAction(po.state.id, o.action, o.target, o.opt); say(r.ok ? `${o.label}を実行しました` : r.error); refresh(false); }); box.append(b); } } }
    if (d.player && history.isPast()) box.append(el("p", "muted", "過去を閲覧中は操作できません（読み取り専用）"));
  }
  function familyDetail(box, f) { box.append(el("h4", "", f.title), el("p", "muted", `${ym(f.startedAt)}〜${ym(f.endedAt)}　${f.wars.length}つの戦争`)); for (const w of f.wars) { const p = el("p", ""); p.append(link("war", w.id, w.name), ` ${ym(w.startedAt)}${w.endedAt != null ? `〜${ym(w.endedAt)}` : "〜継続中"}${w.outcome ? `（${OUTCOME[w.outcome] ?? w.outcome}）` : ""}`); box.append(p); } }
  function warDetail(box, id) { const w = history.warDetail(id); if (!w) return; box.append(el("h4", "", w.name), el("p", "muted", `${ym(w.startedAt)}〜${w.endedAt != null ? ym(w.endedAt) : "継続中"}　${w.outcome ? OUTCOME[w.outcome] ?? w.outcome : "戦闘中"}　戦況 ${Math.round(w.score)}・損耗 ${fmt(w.casualties)}`)); for (const [lab, arr] of [["攻撃側", w.sides.a], ["防衛側", w.sides.d]]) { const p = el("p", ""); p.append(`${lab}: `); for (const s of arr) p.append(link("state", s.id, s.name), " "); box.append(p); } box.append(el("h5", "", "経過")); for (const e of w.events.slice(-40).reverse()) { const p = el("p", "hv-evline"); p.append(`${e.date.year}年${e.date.month}月 `, link("event", e.eventId, e.title)); box.append(p); } }
  function eventDetail(box, id) {
    const d = history.eventDetail(id); if (!d) return; const e = d.event; box.append(el("h4", "", e.title), el("p", "muted", `${e.date.year}年${e.date.month}月　${e.kind}　${e.provenance ?? "world"}`));
    const p = el("p", ""); p.append("関与: "); for (const x of e.participants.slice(0, 8)) { const civ = store.getState().map.civ; if (civ.states[x.entityId]) p.append(link("state", x.entityId, civ.states[x.entityId].name), " "); else p.append(`${x.role} `); } box.append(p);
    box.append(el("h5", "", "原因")); if (!d.causes.length) box.append(el("p", "muted", "（記録された原因なし）")); for (const c of d.causes) { const q = el("p", "hv-evline"); q.append(`${c.relation}（${c.basis}${c.userEdited ? "・手動" : ""}）: `); if (c.event) q.append(link("event", c.event.eventId, c.event.title)); else q.append(c.targetId); box.append(q); }
    box.append(el("h5", "", "結果")); if (!d.consequences.length) box.append(el("p", "muted", "（なし）")); for (const c of d.consequences.slice(0, 20)) { const q = el("p", "hv-evline"); q.append(`${c.relation}（${c.basis}）: `, link("event", c.from, c.event?.title ?? c.from)); box.append(q); }
    if (d.decision) { const q = el("p", ""); q.append("判断: ", link("decision", d.decision.decisionId, d.decision.chosen.key ?? "何もしない")); box.append(q); }
    box.append(el("p", "muted", `因果の近傍 ${d.graph.nodes.length} 件${d.graph.truncated ? `（${d.graph.truncated}）` : ""}`));
  }
  function decisionDetail(box, id) { const x = history.decisionDetail(id); if (!x) return; box.append(el("h4", "", `判断 ${x.date.year}年${x.date.month}月`), el("p", "muted", `${x.layer}・${x.provenance}　選択: ${x.chosen.key ?? "何もしない"}　結果: ${x.result ? (x.result.ok ? "成功" : `失敗（${x.result.error}）`) : "—"}`)); const t = el("table", "hv-table"); t.append(el("tr", "", "")); for (const h of ["行動", "得点", "資格・理由"]) t.firstChild.append(el("th", "", h)); for (const c of x.candidates.slice(0, 30)) { const tr = el("tr", c.chosen ? "on" : ""); tr.append(el("td", "", c.key + (c.opt ? `（${c.opt}）` : "")), el("td", "", String(c.total)), el("td", "", c.eligible ? "可" : c.reason ?? "不可")); t.append(tr); } box.append(t); for (const e of x.result?.eventIds ?? []) { const p = el("p", ""); p.append("結果: ", link("event", e, "結果のイベント")); box.append(p); } }

  let rasterW = null;
  function paintMap() {
    raf = 0; const map = store.getState().map; if (!mapCanvas || !map?.world || !map.civ) return; const w = map.world, ctx = mapCanvas.getContext?.("2d"); if (!ctx) return;
    const t = history.territory(), cellAt = cellRaster(w, MAPW, MAPH), img = ctx.createImageData(MAPW, MAPH), c = w.cell, sel = ui.sel?.type === "state" ? ui.sel.id : null, cols = new Map(t.states.map((s) => [s.id, parseHsl(s.color)]));
    for (let i = 0; i < MAPW * MAPH; i++) { const ci = cellAt[i], water = c.landWater[ci] !== 1; let r = water ? 24 : 70, g = water ? 52 : 82, b = water ? 96 : 70; const o = t.owner.get(ci); if (o) { const k = cols.get(o); const a = o === sel ? 0.95 : sel ? 0.4 : 0.7; r = r * (1 - a) + k[0] * a; g = g * (1 - a) + k[1] * a; b = b * (1 - a) + k[2] * a; } img.data[4 * i] = r; img.data[4 * i + 1] = g; img.data[4 * i + 2] = b; img.data[4 * i + 3] = 255; }
    ctx.putImageData(img, 0, 0); if (mapNote) mapNote.textContent = `${ym(t.month)}の領域（${t.states.length}国）${history.isPast() ? "　※過去の月次履歴から復元" : ""}`;
  }
  function parseHsl(s) { const m = s.match(/hsl\((\d+) (\d+)% (\d+)%\)/); const h = +m[1], sa = +m[2] / 100, l = +m[3] / 100, a = sa * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }

  function refresh(rebuildLists = true) {
    if (!built) build(); const civ = store.getState().map?.civ, meta = history.meta();
    if (!civ || !meta || !history.has()) { body.replaceChildren(el("p", "muted", civ ? "月次履歴がまだありません。時計を進めてください" : "歴史がまだ始まっていません（「人口集団」から始めます）")); built = false; return; }
    const date = header.querySelector("[data-role=date]"); date.textContent = ym(history.viewMonth()); header.querySelector("[data-role=past]").hidden = !meta.past; header.querySelector("[data-role=back]").hidden = !meta.past; slider.min = String(meta.first); slider.max = String(meta.now); slider.value = String(history.viewMonth()); slider.disabled = meta.now <= meta.first;
    body.classList.toggle("past", meta.past);
    for (const b of body.querySelectorAll(".hv-tab")) { b.classList.toggle("on", b.dataset.tab === ui.tab); b.setAttribute("aria-selected", String(b.dataset.tab === ui.tab)); }
    if (rebuildLists) { controls(); listArea(); } else { for (const k in lists) lists[k].refresh?.(); }
    detail(); if (!raf) raf = (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 0)))(paintMap);
  }
  const safe = guardRender(body, () => refresh(false));
  history.subscribe(() => { if (wins.isOpen("history")) refresh(true); });
  store.subscribe(() => { if (wins.isOpen("history") && !history.isPast()) safe(); });
  wins.register("history", { title: "歴史ビューア", width: 1020, body, onOpen: () => { built = false; ui.msg = ""; refresh(true); } });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { if (!store.getState().map?.civ) return; e.preventDefault(); wins.open("history"); ui.tab = "search"; refresh(true); body.querySelector("[data-role=search2]")?.focus(); } });
  return { refresh, state: ui };
}
