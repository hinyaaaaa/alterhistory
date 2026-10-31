// AlterHistory v6 UI。モック（alterhistory-v6-ui-mock.html）の意匠と構成（左ハブ・開閉パネル・地図・コールアウト・右のニュースと時間）に、実データと実コマンドを接続したもの。
//   ・左: ハブ 11 項目（地理・国家・戦争・外交・文化・言語・宗教・年表・統計・検索・世界設定）／中央: 地図／右: ニュースと時間のみ。
//   ・UI は WorldState を直接変えない。成功した Command の結果を、読み取りモデルへ反映するだけ。
//   ・パネルの開閉・切替で、地図の位置・拡大・選択・検索条件をリセットしない。
import { createNewWorld, formatWorldDate } from "../../core/wcde/world.js";
import { listCandidates } from "../../core/wcde/founding.js";
import { SPEEDS, timeOf, newsOf, newsFeed, isRunning } from "../../core/wcde/clock.js";
import { h, btn, polityJa, n0, pct, colorOf, face } from "./common.js";
import { S, run, act, stateName, aliveStates, controlled } from "./store.js";
import { MapView } from "./map.js";
import { pGeo, pNations, link } from "./views-a.js";
import { pWar, pDiplo, pEntity, pChron, pStats, pSearch, pSettings, fileLoader } from "./views-b.js";
export { h };
const $ = (s) => document.querySelector(s), root = () => $("#v6-root");
const HUB = [["geo", "地理", "GEO"], ["nations", "国家", "NATION"], ["war", "戦争", "WAR"], ["diplo", "外交", "DIPLO"], ["culture", "文化", "CULT"], ["language", "言語", "LANG"], ["religion", "宗教", "RELIG"], ["chron", "年表", "CHRON"], ["stats", "統計", "STATS"], ["search", "検索", "FIND"], ["settings", "世界設定", "CONFIG"]];
const PANELS = { geo: pGeo, nations: pNations, war: pWar, diplo: pDiplo, culture: () => pEntity("culture"), language: () => pEntity("language"), religion: () => pEntity("religion"), chron: pChron, stats: pStats, search: pSearch, settings: pSettings };

/* ---------- 起動: 世界の設定 → 生成 → 建国 ---------- */
function setup() {
  const seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3000, 6000, 20000].map((n) => h("option", { value: n, selected: n === 6000 }, n + " セル"))), magic = h("input", { type: "checkbox", id: "magic" }), msg = h("p", { class: "n", id: "setup-msg" });
  const go = () => { msg.textContent = "生成中…（先史の計算に数秒かかります）"; setTimeout(() => { const r = createNewWorld({ worldSeed: seed.value, spec: { resolution: { targetCells: +cells.value } }, magic: { enabled: magic.checked } }); if (!r.ok) { msg.textContent = r.errors.join(" / "); return; } S.w = r.w; founding(); }, 30); };
  root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "ALTERHISTORY v6"), h("h1", {}, "世界を作る"), h("p", { class: "n" }, "約50万年の先史から、国家が生まれる時代へ。"), h("label", {}, "世界の種 ", seed), h("label", {}, "解像度 ", cells), h("label", {}, magic, " 魔法を有効にする"), h("div", { class: "rowb" }, btn("世界を生成", go, "p", { id: "gen" }), fileLoader((w, warn) => { S.w = w; S.fileWarn = warn; start(); })), msg));
}
function founding() {
  const c = listCandidates(S.w), msg = h("p", { class: "n" }, c.length ? "国家になる候補です。担当する国を選ぶか、世界に任せて見守ります。" : "まだ国家の候補がありません。世界に任せて進めます。"), list = h("div", {});
  for (const x of c.slice(0, 20)) list.append(h("div", { class: "row" }, h("span", { class: "g" }, h("b", {}, x.viaJa), h("br"), h("small", {}, `人口 ${n0(x.pop)}・集団 ${x.groupIds.length}`)), btn("担当して建国", () => { const r = act({ type: "founding.found", candidateId: x.id }); r.ok ? start() : (msg.textContent = S.notice); })));
  root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "FOUNDING"), h("h1", {}, "建国"), msg, list, btn("世界に任せて始める（担当国なし）", () => { run({ type: "founding.delegate" }); start(); }, "", { id: "delegate" })));
}

/* ---------- 画面の骨格（モックと同じ構成） ---------- */
function start() { S.hub = null; S.sel = controlled() ?? null; S.hooks = { render, panel: renderPanel, mapOnly: () => { S.map.draw(); renderLegend(); }, select, focusCell, loaded: (w, warn) => { S.w = w; S.fileWarn = warn; start(); } }; shell(); render(); clearInterval(S.timer); S.timer = setInterval(tick, 250); }
function shell() {
  const cv = h("canvas", { id: "map", "aria-label": "世界地図" });
  root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }, h("div", { id: "pin" })), h("main", { id: "mapwrap" }, cv, h("div", { id: "hint" }, "ドラッグで移動・ホイールで拡大縮小・クリックで国家を選択"), h("div", { id: "leg" }), h("div", { id: "callout" }), h("div", { id: "pops" })), h("aside", { id: "right", class: "open" }, h("div", { id: "rin" }, h("div", { id: "clock" }), h("h2", {}, "ニュース"), h("div", { id: "feed" })))), h("div", { id: "newsmodal", hidden: true }));
  S.map = new MapView(cv, S.w); S.map.sel = S.sel; S.map.onPick = callout; requestAnimationFrame(() => { S.map.draw(); renderLegend(); }); window.addEventListener("resize", () => S.map?.draw());
}
function render() { if (!$("#hub")) return; renderHub(); renderPanel(); renderRight(); renderNews(); S.map.sel = S.sel; S.map.draw(); renderLegend(); const w = S.w; $("#hint").textContent = w.viewPast != null ? "過去を閲覧中。世界を変える操作と時間進行は止まっています。" + (S.notice ? " " + S.notice : "") : S.notice || "ドラッグで移動・ホイールで拡大縮小・クリックで国家を選択"; $("#hint").style.color = S.notice || w.viewPast != null ? "var(--yellow)" : ""; }
function renderHub() { $("#hub").replaceChildren(...HUB.map(([k, ja, code]) => h("button", { class: S.hub === k ? "on" : "", "data-hub": k, onclick: () => { S.hub = S.hub === k ? null : k; render(); setTimeout(() => S.map?.draw(), 220); } }, ja, h("small", {}, code)))); }
function renderPanel() { const p = $("#panel"); if (!S.hub) { p.classList.remove("open"); return; } p.classList.add("open"); const keep = $("#pin").scrollTop; $("#pin").replaceChildren(PANELS[S.hub]()); $("#pin").scrollTop = keep; }
function renderLegend() { const M = S.map; if (!M) return; const L = M.legend(M.fillLayer); $("#leg").replaceChildren(h("b", {}, "凡例 "), ...L.slice(0, 6).map((x) => h("span", { style: "margin-right:10px" }, x.c ? h("i", { style: `display:inline-block;width:10px;height:10px;background:${x.c};margin-right:4px` }) : "", x.t))); $("#leg").style.display = L.length ? "block" : "none"; }
function select(id) { S.sel = id; S.hub = "nations"; if (!S.tab) S.tab = "politics"; render(); $("#callout").classList.remove("on"); }
function focusCell(cell) { const M = S.map, g = M.geo, W = M.cv.width, H = M.cv.height, [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W, H); M.view.k = 4; M.view.x = W / 2 - x * 4; M.view.y = H / 2 - y * 4; M.clamp(); M.draw(); }
/** 地図上の選択: コールアウトが基本の情報提示。詳細パネルや他領域への入口も置く */
function callout(p) {
  const c = $("#callout"), civ = S.w.civ, st = p.stateId ? civ.states[p.stateId] : null, ce = S.w.world.cell, mine = st && controlled() === st.id;
  const body = st ? [h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st.id)};display:inline-block;margin-right:6px` }), st.name), h("div", { class: "sub" }, `${polityJa(st.polity)}・人口 ${n0(st.pop)}・安定度 ${pct(st.stability)}`), h("div", { class: "sub" }, `為政者: ${st.leader?.name ?? "—"}`), p.settlement ? h("div", { class: "sub" }, `都市: ${p.settlement.name ?? "—"}（人口 ${n0(p.settlement.pop)}）`) : null, h("div", { class: "bt" }, btn("詳細", () => select(st.id)), btn("外交", () => { S.tab = "diplomacy"; select(st.id); }), mine ? null : btn("担当する", () => { run({ type: "control.take", stateId: st.id }); S.sel = st.id; render(); }, "p"))] : [h("h3", {}, p.settlement?.name ?? "未所属の地"), h("div", { class: "sub" }, `区画 ${p.cell}・標高 ${Math.round(ce.elevation[p.cell] * 100) / 100}・気温 ${Math.round(ce.temp[p.cell])}`), p.settlement ? h("div", { class: "sub" }, `人口 ${n0(p.settlement.pop)}`) : h("div", { class: "sub" }, "国家に属していません")];
  c.replaceChildren(...body); const W = $("#mapwrap").clientWidth; c.style.left = Math.min(Math.max(8, p.x + 10), W - 280) + "px"; c.style.top = Math.max(8, p.y + 10) + "px"; c.classList.add("on"); if (st) { S.sel = st.id; S.map.sel = st.id; S.map.draw(); }
}

/* ---------- 右: ニュースと時間のみ ---------- */
function renderRight() {
  const w = S.w, T = timeOf(w.civ), feed = newsFeed(w.civ, { limit: 30, minLevel: "major" }), cs = controlled();
  $("#clock").replaceChildren(h("div", { class: "d", id: "date" }, formatWorldDate(w)), h("div", { class: "n" }, cs ? `担当: ${stateName(cs)}` : "担当国なし（見守り）"), h("div", { class: "c" }, ...SPEEDS.map((s) => h("button", { class: (T.hold ? T.resumeSpeed : T.speed) === s.id ? "on" : "", "data-speed": s.id, onclick: () => { run({ type: "clock.setSpeed", speed: s.id }); render(); } }, s.label))), h("div", { class: "n", id: "runstate" }, T.hold ? "重大ニュースの確認待ち（OKで再開）" : T.speed ? "進行中" : "停止中"));
  $("#feed").replaceChildren(...feed.map((n) => h("div", { class: "ev" + (n.level === "critical" ? " y" : "") }, h("time", {}, `${n.date.year}年${n.date.month}月`), n.title, " ", ...n.entityIds.filter((i) => w.civ.states[i]).slice(0, 2).map((i) => [link(i), " "]))));
}
function renderNews() {
  const m = $("#newsmodal"), q = newsOf(S.w.civ).queue; if (!q.length) { m.hidden = true; m.replaceChildren(); return; } const n = q[0];
  m.hidden = false; m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "code", style: "justify-content:center" }, `重大ニュース（残り ${q.length} 件）`), h("div", { class: "n" }, `${n.date.year}年${n.date.month}月`), h("h2", {}, n.title), h("div", {}, ...n.entityIds.filter((i) => S.w.civ.states[i]).map((i) => [link(i), " "])), h("div", { class: "rowb", style: "justify-content:center;margin-top:16px" }, btn("OK", () => { run({ type: "news.ack", id: n.id }); render(); }, "p", { id: "ack" }))));
}
let liveN = 0;
function tick() { const w = S.w; if (!w || w.viewPast != null || !isRunning(w.civ)) return; const T = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T.speed)?.mps ?? 0, r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) }); if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 }); live(); }
/** 再生中の更新: 時計・ニュース・地図は毎回。左のパネルは、入力中でなければ 2 秒ごと（入力・選択・スクロールを壊さない） */
function live() { if (!$("#hub")) return; renderRight(); renderNews(); S.map.draw(); const a = document.activeElement; if (++liveN % 8 === 0 && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && ["nations", "war", "diplo", "stats"].includes(S.hub)) renderPanel(); if (S.notice) $("#hint").textContent = S.notice; }
export function boot() { if (!document.getElementById("v6-root")) return; setup(); }
if (typeof window !== "undefined") { window.__v6 = { S, run, act, render: () => S.hooks.render?.(), start }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot(); }
