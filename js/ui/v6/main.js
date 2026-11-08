// AlterHistory v6 UI。モック（alterhistory-v6-ui-mock.html）の意匠と構成（左ハブ・開閉パネル・地図・コールアウト・右のニュースと時間）に、実データと実コマンドを接続したもの。
//   ・左: ハブ（地理・国家・戦争・外交・文化・言語・宗教・統計・創造主・世界設定）／中央: 地図（上部中央に時計）。ニュースはコールアウトとトーストで出す（v6.3.0 で右のニュース欄・年表・検索・凡例を廃止）。
//   ・UI は WorldState を直接変えない。成功した Command の結果を、読み取りモデルへ反映するだけ。
//   ・パネルの開閉・切替で、地図の位置・拡大・選択・検索条件をリセットしない。
import { createNewWorld, formatWorldDate } from "../../core/wcde/world.js";
import { SPEEDS, timeOf, newsOf, newsFeed, isRunning } from "../../core/wcde/clock.js";
import { h, btn, polityJa, n0, pct, colorOf, face, sv } from "./common.js";
import { TECH } from "../../core/civ/tech.js";
import { ecoSummary } from "../../core/wcde/domains/ecosystem.js";
import { S, run, act, stateName, aliveStates, controlled } from "./store.js";
import { MapView } from "./map.js";
import { openWizard } from "./wizard.js";
import { initNotify, notify } from "./notify.js";
import { pGeo, pNations, link } from "./views-a.js";
import { pWar, pDiplo, pEntity, pStats, pSettings, pCreator, fileLoader } from "./views-b.js";
export { h };
const $ = (s) => document.querySelector(s), root = () => $("#v6-root");
const HUB = [["geo", "地理", "GEO"], ["nations", "国家", "NATION"], ["war", "戦争", "WAR"], ["diplo", "外交", "DIPLO"], ["culture", "文化", "CULT"], ["language", "言語", "LANG"], ["religion", "宗教", "RELIG"], ["stats", "統計", "STATS"], ["creator", "創造主", "CREATOR"], ["settings", "世界設定", "CONFIG"]];
const PANELS = { geo: pGeo, nations: pNations, war: pWar, diplo: pDiplo, culture: () => pEntity("culture"), language: () => pEntity("language"), religion: () => pEntity("religion"), stats: pStats, creator: pCreator, settings: pSettings };

/* ---------- 起動: 世界の設定 → 生成 → 建国 ---------- */
function setup() {
  const seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3000, 6000].map((n) => h("option", { value: n, selected: n === 3000 }, n === 3000 ? "3,000 セル（標準）" : "6,000 セル（細かい・遅い）"))), msg = h("p", { class: "n", id: "setup-msg" });
  const go = () => { msg.textContent = "生成中…（先史の計算に数秒かかります）"; setTimeout(() => { const r = createNewWorld({ worldSeed: seed.value, spec: { resolution: { targetCells: +cells.value } } }); if (!r.ok) { msg.textContent = r.errors.join(" / "); return; } S.w = r.w; founding(); }, 30); };
  root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "ALTERHISTORY v6"), h("h1", {}, "世界を作る"), h("p", { class: "n" }, "約50万年の先史から、国家が生まれる時代へ。"), h("label", {}, "世界の種 ", seed), h("label", {}, "解像度 ", cells), h("div", { class: "rowb" }, btn("世界を生成", go, "p", { id: "gen" }), fileLoader((w, warn) => { S.w = w; S.fileWarn = warn; start(); })), msg));
}
function founding() {
  const c = run({ type: "founding.refresh" }).candidates ?? S.w.civ.wcde.candidates ?? [], civ = S.w.civ, pre = civ.wcde.prehistory ?? {}, ce = S.w.world.cell, ja = new Proxy({}, { get: (_, k) => polityJa(k) });
  const msg = h("p", { class: "n" }, "国を建てて担当するか、世界に任せて見守ります。国名・政体・役職・為政者・首都・技術を、順に決めます。"), list = h("div", {}); void list; void c;
  const yrsAgo = (m) => Math.round(((civ.wcde.foundedAt ?? civ.monthIndex) - m) / 12);
  const fmtYears = (y) => (y >= 10000 ? `約 ${Math.round(y / 1000) / 10} 万年前` : `約 ${n0(y)} 年前`);
  // 先史の観察: 系統の移行・技術の出現・人口の推移（読み取り専用）
  const techTl = Object.entries(pre.firstTech ?? {}).sort((x, y) => x[1] - y[1]).map(([k, m]) => `${fmtYears(yrsAgo(m))}　${TECH[k]?.name ?? k}`);
  const ep = pre.epochs ?? [], mx = Math.max(1, ...ep.map((e) => Math.log10(Math.max(10, e.pop)))), spark = sv("svg", { viewBox: "0 0 300 60", style: "width:100%;height:60px" }, sv("polyline", { points: ep.map((e, i) => `${(i / Math.max(1, ep.length - 1)) * 300},${58 - (Math.log10(Math.max(10, e.pop)) / mx) * 54}`).join(" "), fill: "none", stroke: "#6fa8c9", "stroke-width": 1.6 }), sv("polyline", { points: ep.map((e, i) => `${(i / Math.max(1, ep.length - 1)) * 300},${58 - (e.ice ?? 0) * 54}`).join(" "), fill: "none", stroke: "#c97a6f", "stroke-width": 1, "stroke-dasharray": "3 3" }));
  const eco = ecoSummary(S.w.world, civ), sp = pre.species ?? {};
  const obs = h("details", { class: "dt" }, h("summary", {}, "先史の観察（読み取り専用）"),
    sp.archaic ? `古代型人類の集団が現れる: ${fmtYears(yrsAgo(sp.archaic.at))}` : "", h("br"), sp.human ? `現生人類が現れる: ${fmtYears(yrsAgo(sp.human.at))}（置き換わり・混血: ${n0(pre.assimilated ?? 0)} 集団）` : "", h("br"),
    `集団 ${n0(pre.groups ?? Object.keys(civ.groups).length)}・人口 ${n0(Math.round(Object.values(civ.groups).reduce((a, g) => a + g.pop, 0)))}・定住 ${n0(pre.settlements ?? 0)}・氷期の最大 ${Math.round((pre.glacialMax ?? 0) * 100)}%・海を渡った ${n0(pre.seaCrossings ?? 0)} 回`, h("br"),
    eco ? `生態系: 植物 ${Math.round(eco.flora * 100)}%・動物 ${Math.round(eco.fauna * 100)}%・荒廃した土地 ${Math.round(eco.degraded * 100)}%` : "", h("br"), "人口（青・対数）と氷期（赤の破線）の推移", spark, h("b", {}, "技術の出現"), h("br"), ...techTl.flatMap((t) => [t, h("br")]));
  const found = btn("建国して、その国を担当する", () => openWizard({ mode: "player", onDone: () => start(), onCancel: () => {} }), "p", { id: "found" });
  root().replaceChildren(h("div", { class: "center", style: "max-width:760px" }, h("div", { class: "code" }, "FOUNDING"), h("h1", {}, "建国"), msg, h("div", { class: "rowb" }, found, btn("世界に任せて始める（担当国なし・創造主）", () => { run({ type: "founding.delegate" }); start(); }, "", { id: "delegate" })), obs)); // v6.4.0: 国名→政体→役職→為政者→首都→技術・ドクトリンの流れ（ウィザード）
}

/* ---------- 画面の骨格（モックと同じ構成） ---------- */
function start() { S.newsSeen = null; S.hub = null; S.sel = controlled() ?? null; S.hooks = { render, panel: renderPanel, mapOnly: () => { S.map.draw(); }, select, focusCell, loaded: (w, warn) => { S.w = w; S.fileWarn = warn; start(); } }; shell(); render(); clearInterval(S.timer); S.timer = setInterval(tick, 250); }
function shell() {
  const cv = h("canvas", { id: "map", "aria-label": "世界地図" });
  root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }, h("button", { id: "prefresh", title: "世界が進んだので、このページの内容は古くなっています", onclick: () => renderPanel() }, "↻ 最新の状態に更新"), h("div", { id: "pin" })), h("main", { id: "mapwrap" }, cv, h("div", { id: "clock" }), h("div", { id: "callout" }), h("div", { id: "newscall" }), h("div", { id: "pops" }))), h("div", { id: "newsmodal", hidden: true }));
  S.map = new MapView(cv, S.w); S.map.sel = S.sel; S.map.onPick = callout; requestAnimationFrame(() => { S.map.draw(); }); window.addEventListener("resize", () => S.map?.draw());
}
function render() { if (!$("#hub")) return; renderHub(); renderPanel(); renderRight(); renderNews(); S.map.sel = S.sel; S.map.draw(); }
function renderHub() { $("#hub").replaceChildren(...HUB.map(([k, ja, code]) => h("button", { class: S.hub === k ? "on" : "", "data-hub": k, onclick: () => { S.hub = S.hub === k ? null : k; S.detail = false; S.war = null; S.entity = { culture: null, language: null, religion: null }; if (S.map) S.map.hl = null; render(); setTimeout(() => S.map?.draw(), 220); } }, ja, h("small", {}, code)))); }
function renderPanel() { const p = $("#panel"); S.paintedMonth = S.w?.civ.monthIndex ?? null; $("#prefresh")?.classList.remove("stale"); if (!S.hub) { p.classList.remove("open"); return; } p.classList.add("open"); const wide = S.hub === "nations" && (S.tab === "tech" || S.tab === "doctrine") && S.sel; /* 技術ツリー・ドクトリンは大きく見せる */ p.style.setProperty("--pw", wide ? "min(760px, 62vw)" : ""); const keep = $("#pin").scrollTop; $("#pin").replaceChildren(PANELS[S.hub]()); $("#pin").scrollTop = keep; }
function select(id) { S.sel = id; S.detail = true; S.hub = "nations"; if (!S.tab) S.tab = "politics"; render(); $("#callout").classList.remove("on"); }
function focusCell(cell) { const M = S.map, g = M.geo, W = M.cv.width, H = M.cv.height, [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W, H); M.view.k = 4; M.view.x = W / 2 - x * 4; M.view.y = H / 2 - y * 4; M.clamp(); M.draw(); }
/** 地図上の選択: コールアウトが基本の情報提示。詳細パネルや他領域への入口も置く */
function callout(p) {
  if (S.upr?.picking) { // v6.4.0: 反乱の中心地を地図から選ぶ
    const r = run({ type: "uprising.plan", authority: "player_order", stateId: S.upr.stateId, kind: S.upr.kind, cell: p.cell }), res = r.result ?? r;
    if (!r.ok || res.ok === false) { notify("error", res.error ?? r.error ?? "その場所は選べません"); return; }
    S.upr.plan = res; S.upr.picking = false; S.map.pins = [{ cell: res.center.cell, big: true, color: "#ff8a5c" }]; S.map.draw(); renderPanel(); return;
  }
  const c = $("#callout"), civ = S.w.civ, st = p.stateId ? civ.states[p.stateId] : null, ce = S.w.world.cell, mine = st && controlled() === st.id;
  const body = st ? [h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st.id)};display:inline-block;margin-right:6px` }), st.name), h("div", { class: "sub" }, `${polityJa(st.polity)}・人口 ${n0(st.pop)}・安定度 ${pct(st.stability)}`), h("div", { class: "sub" }, `為政者: ${st.leader?.name ?? "—"}`), p.settlement ? h("div", { class: "sub" }, `都市: ${p.settlement.name ?? "—"}（人口 ${n0(p.settlement.pop)}）`) : null, h("div", { class: "bt" }, btn("詳細", () => select(st.id)), btn("外交", () => { S.tab = "diplomacy"; select(st.id); }), mine ? null : btn("担当する", () => { run({ type: "control.take", stateId: st.id }); S.sel = st.id; render(); }, "p"))] : [h("h3", {}, p.settlement?.name ?? "未所属の地"), h("div", { class: "sub" }, `区画 ${p.cell}・標高 ${Math.round(ce.elevation[p.cell] * 100) / 100}・気温 ${Math.round(ce.temp[p.cell])}`), p.settlement ? h("div", { class: "sub" }, `人口 ${n0(p.settlement.pop)}`) : h("div", { class: "sub" }, "国家に属していません")];
  c.replaceChildren(...body); const W = $("#mapwrap").clientWidth; c.style.left = Math.min(Math.max(8, p.x + 10), W - 280) + "px"; c.style.top = Math.max(8, p.y + 10) + "px"; c.classList.add("on"); if (st) { S.sel = st.id; S.map.sel = st.id; S.map.draw(); }
}

/* ---------- 右: ニュースと時間のみ ---------- */
function renderRight() {
  const w = S.w, T = timeOf(w.civ), cs = controlled();
  $("#clock").replaceChildren(h("div", { class: "d", id: "date" }, formatWorldDate(w)), h("div", { class: "c" }, ...SPEEDS.map((s) => h("button", { class: (T.hold ? T.resumeSpeed : T.speed) === s.id ? "on" : "", "data-speed": s.id, title: s.id ? `${s.mps} か月／秒` : "停止", onclick: () => { run({ type: "clock.setSpeed", speed: s.id }); renderRight(); } }, s.label))), h("div", { class: "n", id: "runstate" }, cs ? `担当: ${stateName(cs)}` : "担当国なし（見守り）", T.hold ? "・ニュースの確認待ち" : T.speed ? "" : "・停止中"));
  announce();
}
/** v6.3.0: 右のニュース欄は廃止。重大でない大きな出来事は、地図のコールアウトとトースト通知で知らせる（重大ニュースは中央の確認画面） */
function announce() {
  const c = S.w.civ, key = (n) => n.eventId ?? n.id, feed = newsFeed(c, { limit: 16, minLevel: "major" });
  if (!S.newsSeen) { S.newsSeen = new Set(feed.map(key)); return; }
  const fresh = feed.filter((n) => n.level !== "critical" && !S.newsSeen.has(key(n))).reverse(); feed.forEach((n) => S.newsSeen.add(key(n)));
  if (!fresh.length) return; const shown = fresh.slice(-3);
  for (const n of shown) notify("ok", `${n.date.year}年${n.date.month}月　${n.title}`);
  const last = shown[shown.length - 1], sid = (last.entityIds ?? []).find((i) => c.states[i]), g = sid ? c.groups[c.states[sid].capitalGroupId] : null, el = $("#newscall"), M = S.map;
  if (!g || !el || !M) return;
  const [x, y] = M.proj(M.geo.cen[g.cell * 2], M.geo.cen[g.cell * 2 + 1], M.cv.width, M.cv.height), r = M.cv.clientWidth / (M.cv.width || 1), px = (x * M.view.k + M.view.x) * r, py = (y * M.view.k + M.view.y) * r;
  el.replaceChildren(h("b", {}, c.states[sid].name), h("div", {}, last.title)); el.style.left = Math.min(Math.max(8, px + 12), M.cv.clientWidth - 260) + "px"; el.style.top = Math.min(Math.max(48, py + 12), M.cv.clientHeight - 80) + "px"; el.classList.add("on");
  clearTimeout(S.newsT); S.newsT = setTimeout(() => el.classList.remove("on"), 6000);
}
function renderNews() {
  const m = $("#newsmodal"), q = newsOf(S.w.civ).queue; if (!q.length) { m.hidden = true; m.replaceChildren(); return; } const n = q[0];
  m.hidden = false; m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "code", style: "justify-content:center" }, `重大ニュース（残り ${q.length} 件）`), h("div", { class: "n" }, `${n.date.year}年${n.date.month}月`), h("h2", {}, n.title), h("div", {}, ...n.entityIds.filter((i) => S.w.civ.states[i]).map((i) => [link(i), " "])), h("div", { class: "rowb", style: "justify-content:center;margin-top:16px" }, btn("OK", () => { run({ type: "news.ack", id: n.id }); renderRight(); renderNews(); S.map.draw(); }, "p", { id: "ack" }))));
}
function tick() { const w = S.w; if (!w || w.viewPast != null || !isRunning(w.civ)) return; const T = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T.speed)?.mps ?? 0, r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) }); if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 }); live(); }
/** 再生中の更新: 時計・ニュース・地図だけを毎回更新する。左のパネルは勝手に描き直さない（読んでいる最中・入力中・スクロール中の内容が変わらないように）。
 *  世界が進んでパネルの内容が古くなったときは、パネルの右上に「最新の状態に更新」を出し、押したときだけ描き直す */
function live() { if (!$("#hub")) return; renderRight(); renderNews(); S.map.draw(); if (S.hub && S.w.civ.monthIndex !== S.paintedMonth) $("#prefresh")?.classList.add("stale");}
/** 起動画面: 毎回表示。初期化が済んでいれば演出（約 0.9 秒）だけで世界生成の画面へ移る。動きを減らす設定では待たずに切り替える */
function dismissSplash() {
  const el = document.getElementById("splash"); if (!el) return; const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, since = performance.now() - (window.__splashAt ?? 0), wait = reduce ? 0 : Math.max(0, 900 - since);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), reduce ? 0 : 340); }, wait);
}
export function boot() { if (!document.getElementById("v6-root")) return; initNotify(); setup(); dismissSplash(); }
if (typeof window !== "undefined") { window.__v6 = { S, run, act, render: () => S.hooks.render?.(), start }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot(); }
