// AlterHistory v6 UI。地図を中心に、左ハブ・サイドパネル・右の「ニュースと時間」。すべて WorldState を Query で読み、Command で変える（画面だけの部品は置かない）。
import { createNewWorld, formatWorldDate } from "../../core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../core/wcde/contract.js";
import { listCandidates } from "../../core/wcde/founding.js";
import { SPEEDS, timeOf, newsOf, newsFeed, isRunning } from "../../core/wcde/clock.js";
import { FIELDS, effective, nominalOf } from "../../core/wcde/domains/effective.js";
import { interventionsOf } from "../../core/wcde/intervention.js";
import { predictWar } from "../../core/wcde/warlab.js";
import { evaluateTreaty, evaluatePeace, proposalsOf, TREATY_THRESHOLD } from "../../core/wcde/negotiation.js";
import { packSave, unpackSave, SAVE_SCHEMA } from "../../core/wcde/savefile.js";
import { DOCTRINES, canAdopt } from "../../core/wcde/domains/military.js";
import { checkWcdeIntegrity } from "../../core/wcde/integrity.js";
import { exportObsidianZip } from "../../io/obsidian.js";
import { TREATY } from "../../core/civ/diplomacy.js";
import { MapView, colorOf } from "./map.js";
import { APP_VERSION_FOR_SAVE } from "../../core/wcde/save-meta.js";

export const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props ?? {})) { if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ""); else if (v !== false && v != null) el.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
const pct = (x) => Math.round(x * 100) + "%", n0 = (x) => Math.round(x).toLocaleString("ja-JP"), r2 = (x) => Math.round(x * 100) / 100;
const HUB = [["states", "国家"], ["wars", "戦争"], ["diplo", "世界外交"], ["culture", "文化"], ["language", "言語"], ["religion", "宗教"], ["timeline", "年表"], ["stats", "統計"], ["search", "検索"], ["creator", "創造主"], ["settings", "世界設定・出力"]];
const S = { w: null, hub: "states", sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", tl: { kind: "", text: "", entity: "" }, fileWarn: [] };
const $ = (s) => document.querySelector(s), root = () => $("#v6-root");
const run = (c) => { const r = dispatch(S.w, { authority: A.ADMIN, ...c }); if (!r.ok) S.notice = r.error ?? "失敗"; else S.notice = ""; return r; };
const stateName = (id) => S.w.civ.states[id]?.name ?? id;
const link = (id) => (S.w.civ.states[id] ? h("a", { href: "#", class: "lk", onclick: (e) => { e.preventDefault(); select(id); } }, stateName(id)) : String(id));
function select(id) { S.sel = id; S.hub = "states"; S.tab = S.tab || "politics"; if (S.map) S.map.sel = id; render(); }

/* ---------- 起動画面: 世界の設定 → 生成 → 建国 ---------- */
function setup() {
  const seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999), "aria-label": "世界の種" }), cells = h("select", { id: "cells" }, ...[3000, 6000, 20000].map((n) => h("option", { value: n, selected: n === 6000 }, n + " セル"))), magic = h("input", { type: "checkbox", id: "magic" }), msg = h("div", { id: "setup-msg", class: "dim" });
  const go = () => { msg.textContent = "生成中…（先史の計算に数秒かかります）"; setTimeout(() => { const r = createNewWorld({ worldSeed: seed.value, spec: { resolution: { targetCells: +cells.value } }, magic: { enabled: magic.checked } }); if (!r.ok) { msg.textContent = r.errors.join(" / "); return; } S.w = r.w; founding(); }, 30); };
  const load = fileLoader((w, warn) => { S.w = w; S.fileWarn = warn; start(); });
  root().replaceChildren(h("div", { class: "center" }, h("h1", {}, "AlterHistory v6"), h("p", { class: "dim" }, "世界を作り、約50万年の先史から、国家が生まれる時代へ。"), h("label", {}, "世界の種 ", seed), h("label", {}, "解像度 ", cells), h("label", {}, magic, " 魔法を有効にする"), h("div", {}, h("button", { id: "gen", onclick: go }, "世界を生成"), " ", load), msg));
}
function founding() {
  const c = listCandidates(S.w), list = h("div", { class: "cands" }), msg = h("div", { class: "dim" }, c.length ? "国家になる候補です。担当する国を選ぶか、世界に任せて見守ります。" : "まだ国家の候補がありません。世界に任せて進めます。");
  for (const x of c.slice(0, 20)) list.append(h("div", { class: "row" }, h("b", {}, x.viaJa), ` 人口 ${n0(x.pop)}・集団 ${x.groupIds.length}`, " ", h("button", { onclick: () => { const r = run({ type: "founding.found", authority: A.PLAYER, candidateId: x.id }); r.ok ? start() : (msg.textContent = S.notice); } }, "この国を担当して建国")));
  root().replaceChildren(h("div", { class: "center" }, h("h2", {}, "建国"), msg, list, h("button", { id: "delegate", onclick: () => { run({ type: "founding.delegate" }); start(); } }, "世界に任せて始める（担当国なし）")));
}

/* ---------- 画面の骨格 ---------- */
function start() { S.hub = "states"; S.sel = S.w.civ.wcde.control.stateId ?? null; shell(); render(); clearInterval(S.timer); S.timer = setInterval(tick, 250); }
function shell() {
  const cv = h("canvas", { id: "map", "aria-label": "世界地図" }), layers = h("div", { class: "layers" }, ...[["terrain", "地形"], ["nation", "国家"], ["culture", "文化"], ["war", "戦争"]].map(([k, ja]) => h("button", { "data-layer": k, onclick: () => { S.map.layer = k; S.map.draw(); } }, ja)));
  root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }), h("main", { id: "mapwrap" }, layers, cv, h("div", { id: "banner" })), h("aside", { id: "clock" }), h("div", { id: "newsmodal", hidden: true })));
  S.map = new MapView(cv, S.w); S.map.sel = S.sel; S.map.onPick = (p) => { if (p.stateId) select(p.stateId); }; requestAnimationFrame(() => S.map.draw());
}
function render() { if (!$("#hub")) return; renderHub(); renderPanel(); renderClock(); renderNews(); S.map?.draw(); const w = S.w; $("#banner").textContent = (w.viewPast != null ? `過去を閲覧中（${formatWorldDate(w, w.viewPast)}）。世界を変える操作と時間進行は止まっています。` : "") + (S.notice ? " " + S.notice : ""); }
function renderHub() { $("#hub").replaceChildren(...HUB.map(([k, ja]) => h("button", { class: S.hub === k ? "on" : "", "data-hub": k, onclick: () => { S.hub = k; render(); } }, ja))); }

/* ---------- 右: ニュースと時間（右の常設は、これだけ） ---------- */
function renderClock() {
  const w = S.w, T = timeOf(w.civ), feed = newsFeed(w.civ, { limit: 30, minLevel: "major" }), cs = w.civ.wcde.control.stateId;
  $("#clock").replaceChildren(h("div", { class: "date", id: "date" }, formatWorldDate(w)), h("div", { class: "dim" }, cs ? `担当: ${stateName(cs)}` : "担当国なし（見守り）"),
    h("div", { class: "speeds" }, ...SPEEDS.map((s) => h("button", { class: (T.hold ? T.resumeSpeed : T.speed) === s.id ? "on" : "", "data-speed": s.id, onclick: () => { run({ type: "clock.setSpeed", speed: s.id }); render(); } }, s.label))),
    h("div", { class: "dim", id: "runstate" }, T.hold ? "重大ニュースの確認待ち（OKで再開）" : T.speed ? "進行中" : "停止中"),
    h("h3", {}, "ニュース"), h("div", { class: "feed", id: "feed" }, ...feed.map((n) => h("div", { class: "news" }, h("span", { class: "dim" }, `${n.date.year}年${n.date.month}月 `), n.title, " ", ...n.entityIds.filter((i) => w.civ.states[i]).slice(0, 2).map((i) => [link(i), " "])))));
}
function renderNews() {
  const m = $("#newsmodal"), q = newsOf(S.w.civ).queue; if (!q.length) { m.hidden = true; m.replaceChildren(); return; } const n = q[0];
  m.hidden = false; m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "dim" }, `重大ニュース（残り ${q.length} 件）　${n.date.year}年${n.date.month}月`), h("h2", {}, n.title), h("div", {}, ...n.entityIds.filter((i) => S.w.civ.states[i]).map((i) => [link(i), " "])), h("button", { id: "ack", onclick: () => { run({ type: "news.ack", id: n.id }); render(); } }, "OK")));
}
function tick() { const w = S.w; if (!w || w.viewPast != null || !isRunning(w.civ)) return; const T = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T.speed)?.mps ?? 0; const r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) }); if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 }); live(); }
/** 再生中の更新: 時計・ニュース・地図は毎回。左のパネルは、入力中でなければ 2 秒ごと（入力・選択・スクロールを壊さない） */
let liveN = 0;
function live() { if (!$("#hub")) return; renderClock(); renderNews(); S.map?.draw(); const a = document.activeElement; if (++liveN % 8 === 0 && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && ["states", "wars", "diplo", "stats"].includes(S.hub)) renderPanel(); const w = S.w; $("#banner").textContent = (w.viewPast != null ? "過去を閲覧中。" : "") + (S.notice ? " " + S.notice : ""); }

/* ---------- 左ハブのパネル ---------- */
const table = (head, rows) => h("table", {}, h("thead", {}, h("tr", {}, ...head.map((x) => h("th", {}, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", {}, c))))));
const bar = (v, col = "#6fa8c9") => h("span", { class: "bar" }, h("i", { style: `width:${Math.max(0, Math.min(1, v)) * 100}%;background:${col}` }));
const aliveStates = () => Object.values(S.w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
function renderPanel() {
  const P = $("#panel"), f = { states: pStates, wars: pWars, diplo: pDiplo, culture: () => pNamed("cultures", "文化"), language: () => pNamed("languages", "言語"), religion: () => pNamed("religions", "宗教"), timeline: pTimeline, stats: pStats, search: pSearch, creator: pCreator, settings: pSettings }[S.hub];
  const keep = P.scrollTop; P.replaceChildren(f()); P.scrollTop = keep;
}
function pStates() {
  const w = S.w, civ = w.civ, list = (w.viewPast != null ? Object.values(civ.states).filter((s) => s.formedAt <= w.viewPast && (s.dissolvedAt == null || s.dissolvedAt > w.viewPast)) : aliveStates()), box = h("div", {}, h("h3", {}, `国家一覧（${list.length}）`), h("div", { class: "list" }, ...list.slice(0, 200).map((s) => h("div", { class: "item" + (S.sel === s.id ? " on" : ""), onclick: () => select(s.id) }, h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("span", { class: "dim" }, ` 人口 ${n0(s.pop)}`)))));
  if (S.sel && civ.states[S.sel]) box.prepend(stateDetail(civ.states[S.sel])); /* 詳細を一覧の上に（長い一覧で隠れない） */ return box;
}
function stateDetail(st) {
  const civ = S.w.civ, tabs = [["politics", "内政"], ["military", "軍事"], ["diplomacy", "外交"], ["tech", "技術"], ["doctrine", "ドクトリン"]], body = { politics: tPolitics, military: tMilitary, diplomacy: tDiplomacy, tech: tTech, doctrine: tDoctrine }[S.tab](st);
  return h("div", { class: "detail" }, h("h3", {}, st.name, civ.wcde.control.stateId === st.id ? " （担当）" : ""), h("div", { class: "dim" }, `${st.polity ?? ""}・人口 ${n0(st.pop)}・国庫 ${n0(st.treasury)}・安定度 ${pct(st.stability)}${st.alive ? "" : "・滅亡"}`),
    civ.wcde.control.stateId === st.id ? h("button", { onclick: () => { run({ type: "control.release" }); render(); } }, "担当を外す") : h("button", { onclick: () => { run({ type: "control.take", stateId: st.id }); render(); } }, "この国を担当する"),
    h("div", { class: "tabs" }, ...tabs.map(([k, ja]) => h("button", { class: S.tab === k ? "on" : "", "data-tab": k, onclick: () => { S.tab = k; render(); } }, ja))), body);
}
function tPolitics(st) {
  const P = st.politics, leg = effective(S.w.civ, st, "legitimacy"), fat = effective(S.w.civ, st, "fatigue"), L = st.leader;
  if (!P) return h("div", { class: "dim" }, "内政のデータがありません");
  return h("div", {}, h("div", {}, `指導者: ${L?.name ?? S.w.civ.figures?.[st.leaderFigureId]?.name ?? "—"}　議会: ${P.assembly || "なし"}`), h("div", {}, "正統性 ", bar(leg), ` ${pct(leg)}　疲労度 `, bar(fat, "#d0605a"), ` ${pct(fat)}　税の上限 ${pct(P.taxCeiling ?? 0)}`),
    table(["勢力", "支持", "影響力"], Object.entries(P.factions).map(([k, v]) => [{ nobility: "貴族", clergy: "聖職者", merchants: "商人", military: "軍", commoners: "民衆" }[k] ?? k, bar(v.support), pct(v.influence)])),
    h("div", { class: "dim" }, `産業力 ${n0(effective(S.w.civ, st, "industry"))}・一人あたり ${r2(effective(S.w.civ, st, "perCapita"))}・食料の需給 ${r2(effective(S.w.civ, st, "foodBalance"))}・交易収入 ${r2(effective(S.w.civ, st, "tradeIncome"))}`));
}
function tMilitary(st) {
  const M = st.military; if (!M) return h("div", { class: "dim" }, "軍事のデータがありません");
  const foes = aliveStates().filter((x) => x.id !== st.id).slice(0, 8), sel = h("select", { id: "wl-target" }, ...foes.map((x) => h("option", { value: x.id }, x.name))), out = h("div", { id: "wl-out" });
  const show = () => { const p = predictWar(S.w.civ, st.id, sel.value, S.w.sim.ctx); out.replaceChildren(p ? warlab(p) : "予測できません"); }; sel.addEventListener("change", show);
  setTimeout(() => $("#wl-target") && show(), 0);
  return h("div", {}, h("div", {}, `兵力 ${n0(st.army)}・装備 ${pct(effective(S.w.civ, st, "equipLevel"))}・練度 ${pct(effective(S.w.civ, st, "readiness"))}・軍事能力 ${st.milBonus >= 0 ? "+" : ""}${pct(st.milBonus)}`), table(["部隊", "規模", "装備", "練度"], M.units.map((u) => [u.name, n0(u.size), pct(u.equip), pct(u.readiness)])),
    h("h4", {}, "戦争研究所（予測）"), h("div", { class: "dim" }, "この国が攻める場合の見通し。予測は確定した未来ではありません。"), sel, out);
}
function warlab(p) { return h("div", { class: "wl" }, h("div", {}, `勝利 ${pct(p.pAWin)}（${pct(p.pAWinRange[0])}〜${pct(p.pAWinRange[1])}）・引き分け ${pct(p.pStalemate)}・敗北 ${pct(p.pBWin)}`), h("div", {}, "勝つ ", bar(p.pAWin, "#6fa8c9"), " 負ける ", bar(p.pBWin, "#d0605a")), h("div", {}, `見込みの損耗: 自軍 ${pct(p.lossA)} / 相手 ${pct(p.lossB)}・長引く目安 ${p.months}か月・不確実性 ${pct(p.uncertainty)}`), table(["要因", stateName(p.aId), stateName(p.bId)], p.factors.map((x) => [x.ja, x.a, x.b]))); }
function tDiplomacy(st) {
  const civ = S.w.civ, mine = civ.wcde.control.stateId === st.id, others = aliveStates().filter((x) => x.id !== st.id).slice(0, 12), sel = h("select", { id: "dp-target" }, ...others.map((x) => h("option", { value: x.id }, x.name))), type = h("select", { id: "dp-type" }, ...Object.entries(TREATY).map(([k, v]) => h("option", { value: k }, v.ja))), out = h("div", { id: "dp-out" });
  const prev = () => { const to = civ.states[sel.value]; if (!to) return; const e = evaluateTreaty(civ, st, to, type.value); out.replaceChildren(h("div", {}, `相手の評価: ${e.accept ? "受け入れそう" : "断られそう"}（${e.score}）${e.counter ? "・別条件: " + TREATY[e.counter.type].ja : ""}`), ...e.factors.map((f) => h("div", { class: "dim" }, `${f.ja} ${f.v}`))); }; sel.addEventListener("change", prev); type.addEventListener("change", prev); setTimeout(() => $("#dp-target") && prev(), 0);
  const act = mine ? h("button", { onclick: () => { run({ type: "state.act", authority: A.PLAYER, action: "sign_treaty", target: sel.value, opt: type.value }); render(); } }, "条約を提案する") : h("div", { class: "dim" }, "条約の提案は、担当する国だけが行えます（評価の確認はできます）。");
  const wars = st.warIds.map((i) => civ.wars[i]).filter(Boolean), tr = civ.activeTreatyIds.map((i) => civ.treaties[i]).filter((t) => t.a === st.id || t.b === st.id), hist = proposalsOf(civ).filter((p) => p.from === st.id || p.to === st.id).slice(-8).reverse();
  return h("div", {}, h("h4", {}, "条約"), tr.length ? table(["種類", "相手"], tr.map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a === st.id ? t.b : t.a)])) : h("div", { class: "dim" }, "なし"), h("h4", {}, "交戦中"), wars.length ? h("div", {}, ...wars.map((x) => h("div", {}, link(x.aggressor === st.id ? x.defender : x.aggressor), mine ? h("button", { onclick: () => { run({ type: "state.act", authority: A.PLAYER, action: "sue_for_peace", target: x.id }); render(); } }, "講和を申し入れる") : null))) : h("div", { class: "dim" }, "なし"),
    h("h4", {}, "条約を提案する"), sel, type, act, out, h("h4", {}, "提案の記録"), ...hist.map((p) => h("div", { class: "dim" }, `${formatWorldDate(S.w, p.at)} ${p.kind === "peace" ? "講和" : TREATY[p.type]?.ja} ${stateName(p.from)}→${stateName(p.to)}: ${{ accepted: "成立", rejected: "拒否", countered: "別条件", failed_recheck: "再検証で不成立" }[p.status]}`)));
}
function tTech(st) { const names = Object.keys(st.techAdopted ?? {}); return h("div", {}, h("div", { class: "dim" }, `採用した技術 ${names.length} 件`), h("div", { class: "chips" }, ...names.map((k) => h("span", { class: "chip" }, k)))); }
function tDoctrine(st) {
  const M = st.military, taken = Object.keys(M?.doctrine?.taken ?? {}), mine = S.w.civ.wcde.control.stateId === st.id; if (!M) return h("div", {}, "なし");
  return h("div", {}, h("div", { class: "dim" }, `採用済み ${taken.length} 件`), ...Object.values(DOCTRINES).slice(0, 60).map((d) => { const ok = !taken.includes(d.id) && (typeof canAdopt === "function" ? canAdopt(S.w.civ, st, d.id)?.ok !== false : true); return h("div", { class: "row" }, taken.includes(d.id) ? "✔ " : "", d.ja, h("span", { class: "dim" }, ` ${d.desc ?? ""}`), mine && ok ? h("button", { onclick: () => { run({ type: "state.adoptDoctrine", authority: A.PLAYER, doctrineId: d.id }); render(); } }, "採用") : null); }));
}
function pWars() {
  const civ = S.w.civ, act = civ.activeWarIds.map((i) => civ.wars[i]), past = Object.values(civ.wars).filter((x) => x.status !== "active").slice(-30).reverse();
  return h("div", {}, h("h3", {}, `進行中の戦争（${act.length}）`), table(["攻撃側", "防御側", "戦況", "開始"], act.map((x) => [link(x.aggressor), link(x.defender), x.score > 0 ? "攻撃側優勢" : x.score < 0 ? "防御側優勢" : "拮抗", formatWorldDate(S.w, x.startedAt)])), h("h3", {}, "終結した戦争（直近）"), table(["攻撃側", "防御側", "結果"], past.map((x) => [link(x.aggressor), link(x.defender), { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", stalemate: "決着つかず", negotiated: "講和", state_dissolved: "国家の消滅" }[x.outcome] ?? x.outcome])));
}
function pDiplo() {
  const civ = S.w.civ, tr = civ.activeTreatyIds.map((i) => civ.treaties[i]), recent = proposalsOf(civ).slice(-40).reverse();
  return h("div", {}, h("h3", {}, `有効な条約（${tr.length}）`), table(["種類", "国", "国"], tr.slice(0, 150).map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a), link(t.b)])), h("h3", {}, "最近の外交交渉"), table(["時期", "内容", "結果"], recent.map((p) => [formatWorldDate(S.w, p.at), `${p.kind === "peace" ? "講和" : TREATY[p.type]?.ja} ${stateName(p.from)}→${stateName(p.to)}`, { accepted: "成立", rejected: "拒否", countered: "別条件", failed_recheck: "不成立" }[p.status]])));
}
function pNamed(key, ja) {
  const civ = S.w.civ, items = Object.values(civ[key]), use = new Map(); for (const g of Object.values(civ.groups)) for (const c of g.cohorts ?? []) { const id = key === "cultures" ? c.cultureId : key === "languages" ? c.languageId : c.religionId; if (id) use.set(id, (use.get(id) ?? 0) + g.pop * c.share); }
  items.sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)); return h("div", {}, h("h3", {}, `${ja}（${items.length}）`), table(["名前", "人口", "派生元", "成立"], items.slice(0, 200).map((x) => [x.name, n0(use.get(x.id) ?? 0), x.parent ? civ[key][x.parent]?.name ?? x.parent : "—", formatWorldDate(S.w, Math.max(0, x.bornAt))])));
}
function pTimeline() {
  const civ = S.w.civ, F = S.tl, kinds = [...new Set(civ.events.slice(-3000).map((e) => e.kind))].sort(), kindSel = h("select", { id: "tl-kind", onchange: (e) => { F.kind = e.target.value; render(); } }, h("option", { value: "" }, "すべての種類"), ...kinds.map((k) => h("option", { value: k, selected: F.kind === k }, k))), txt = h("input", { id: "tl-text", value: F.text, placeholder: "題名で絞る", onchange: (e) => { F.text = e.target.value; render(); } });
  const rows = []; for (let i = civ.events.length - 1; i >= 0 && rows.length < 4000; i--) { const e = civ.events[i]; if (F.kind && e.kind !== F.kind) continue; if (F.text && !e.title.includes(F.text)) continue; if (F.entity && !e.participants.some((p) => p.entityId === F.entity)) continue; rows.push(e); }
  const H = 26, box = h("div", { class: "vlist", id: "vlist", style: "height:60vh;overflow:auto;position:relative" }), spacer = h("div", { style: `height:${rows.length * H}px` }), win = h("div", { style: "position:absolute;left:0;right:0;top:0" }); box.append(spacer, win);
  const paint = () => { const top = box.scrollTop, a = Math.max(0, Math.floor(top / H) - 5), b = Math.min(rows.length, a + 40); win.style.top = a * H + "px"; win.replaceChildren(...rows.slice(a, b).map((e) => h("div", { class: "ev", style: `height:${H}px`, onclick: () => showEvent(e) }, h("span", { class: "dim" }, `${e.date.year}年${e.date.month}月 `), e.title))); }; box.addEventListener("scroll", paint); setTimeout(paint, 0);
  return h("div", {}, h("h3", {}, `年表（${rows.length}${rows.length >= 4000 ? "+" : ""} 件）`), h("div", {}, kindSel, txt), F.entity ? h("div", {}, `絞り込み: ${stateName(F.entity)} `, h("button", { onclick: () => { F.entity = ""; render(); } }, "解除")) : null, box, h("div", { id: "evdetail", class: "dim" }));
}
function showEvent(e) { const civ = S.w.civ, d = $("#evdetail"); if (!d) return; const byId = new Map(); d.replaceChildren(h("b", {}, e.title), h("div", {}, `種類 ${e.kind}・出典 ${e.provenance}`), h("div", {}, "関係: ", ...e.participants.filter((p) => civ.states[p.entityId]).map((p) => [h("a", { href: "#", class: "lk", onclick: (ev) => { ev.preventDefault(); S.tl.entity = p.entityId; render(); } }, stateName(p.entityId)), " "])), h("div", {}, "原因: ", ...(e.causes.length ? e.causes.map((c) => { const t = civ.events.find((x) => x.eventId === c.targetId); return h("div", { class: "dim" }, `${c.relation}（${c.basis}）${t ? t.title : c.targetId}`); }) : ["特定できていない"])), h("div", {}, "結果: ", ...(e.effects.length ? e.effects.slice(0, 5).map((c) => h("div", { class: "dim" }, `${c.property}: ${c.before} → ${c.after}`)) : ["—"]))); }
function pStats() {
  const civ = S.w.civ, a = aliveStates(), tot = a.reduce((x, s) => x + s.pop, 0), mx = a[0]?.pop || 1;
  return h("div", {}, h("h3", {}, "世界の統計"), table(["項目", "値"], [["現在", formatWorldDate(S.w)], ["国家（存続）", a.length], ["総人口（国家の下）", n0(tot)], ["進行中の戦争", civ.activeWarIds.length], ["有効な条約", civ.activeTreatyIds.length], ["事実イベント", civ.events.length.toLocaleString("ja-JP")], ["AIの判断記録", (civ.decisions?.length ?? 0).toLocaleString("ja-JP")], ["介入の記録", interventionsOf(civ).length], ["外交交渉の記録", proposalsOf(civ).length]]), h("h4", {}, "人口の上位"), ...a.slice(0, 12).map((s) => h("div", { class: "row" }, link(s.id), " ", bar(s.pop / mx, colorOf(s.id)), ` ${n0(s.pop)}`)));
}
function pSearch() {
  const civ = S.w.civ, q = S.q, inp = h("input", { id: "q", value: q, placeholder: "国家・人物・文化・言語・宗教・出来事を検索", onchange: (e) => { S.q = e.target.value; render(); } }), res = [];
  if (q) { for (const s of Object.values(civ.states)) if (s.name.includes(q)) res.push(["国家", s.name, () => select(s.id)]); for (const f of Object.values(civ.figures ?? {})) if (f.name?.includes(q)) res.push(["人物", f.name, () => (f.stateId && civ.states[f.stateId] ? select(f.stateId) : null)]); for (const [k, ja] of [["cultures", "文化"], ["languages", "言語"], ["religions", "宗教"]]) for (const x of Object.values(civ[k])) if (x.name.includes(q)) res.push([ja, x.name, () => { S.hub = k === "cultures" ? "culture" : k === "languages" ? "language" : "religion"; render(); }]); for (let i = civ.events.length - 1; i >= 0 && res.length < 80; i--) if (civ.events[i].title.includes(q)) res.push(["出来事", civ.events[i].title, () => { S.hub = "timeline"; S.tl = { kind: "", text: q, entity: "" }; render(); }]); }
  return h("div", {}, h("h3", {}, "検索"), inp, h("div", { class: "dim" }, q ? `${res.length} 件` : ""), ...res.slice(0, 80).map(([k, t, fn]) => h("div", { class: "item", onclick: fn }, h("span", { class: "dim" }, k + " "), t)));
}
function pCreator() {
  const civ = S.w.civ, st = S.sel && civ.states[S.sel]?.alive ? civ.states[S.sel] : aliveStates()[0]; if (!st) return h("div", {}, "国家がありません");
  const sel = h("select", { id: "iv-state" }, ...aliveStates().map((s) => h("option", { value: s.id, selected: s.id === st.id }, s.name))), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, f.ja))), val = h("input", { id: "iv-val", type: "number", step: "any" }), half = h("input", { id: "iv-half", type: "number", placeholder: "半減期（月）既定" }), why = h("input", { id: "iv-why", placeholder: "理由の注釈（任意）" }), info = h("div", { class: "dim", id: "iv-info" });
  const upd = () => { const s = civ.states[sel.value], k = field.value, nm = nominalOf(civ, s, k); info.textContent = nm == null ? "まだ算出されていません" : `通常計算値 ${r2(nm)}・有効値 ${r2(effective(civ, s, k))}・範囲 ${FIELDS[k].min}〜${FIELDS[k].max}・既定の半減期 ${FIELDS[k].half}か月`; }; sel.addEventListener("change", upd); field.addEventListener("change", upd); setTimeout(upd, 0);
  const go = () => { const r = run({ type: "creator.intervene", authority: A.CREATOR, stateId: sel.value, field: field.value, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: why.value }); render(); if (r.ok) S.notice = ""; };
  return h("div", {}, h("h3", {}, "創造主の介入"), h("div", { class: "dim" }, "計算される値に一時的な補正を入れます。補正は時間とともに通常値へ戻りますが、介入中に起きた結果は戻りません。"), sel, field, val, half, why, h("button", { id: "iv-go", onclick: go }, "介入する"), info,
    h("h4", {}, "介入の記録"), table(["国", "項目", "指定値", "残りの補正", "状態", ""], interventionsOf(civ).slice().reverse().slice(0, 40).map((r) => [stateName(r.targetId), FIELDS[r.field]?.ja ?? r.field, r2(r.target), r2(r.residual), { active: "有効", converged: "収束", superseded: "置き換え", cancelled: "取り消し", target_gone: "対象消滅" }[r.status], r.status === "active" ? h("button", { onclick: () => { run({ type: "creator.cancelIntervention", authority: A.CREATOR, id: r.id }); render(); } }, "取り消す") : ""])));
}
function fileLoader(done) {
  const inp = h("input", { type: "file", accept: ".ahw,.json,application/json", id: "loadfile", hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; const r = unpackSave(await f.text()); if (!r.ok) { alert("読み込めません:\n" + r.errors.join("\n")); return; } done(r.w, r.warnings); } });
  return h("span", {}, inp, h("button", { onclick: () => inp.click() }, "保存ファイルを読み込む"));
}
function pSettings() {
  const civ = S.w.civ, c = civ.wcde.config, T = timeOf(civ), errs = checkWcdeIntegrity(S.w.world, civ), msg = h("div", { class: "dim", id: "exp-msg" });
  const save = () => { const p = packSave(S.w), a = h("a", { href: URL.createObjectURL(new Blob([p.text], { type: "application/json" })), download: `alterhistory-${c.worldSeed}-${civ.date.year}.ahw` }); document.body.append(a); a.click(); a.remove(); msg.textContent = `保存ファイルを書き出しました（${(p.bytes / 1048576).toFixed(1)} MB）`; };
  const obs = async () => { msg.textContent = "Obsidian 用の ZIP を作っています…"; try { const r = await exportObsidianZip(S.w.world, civ, c.name || c.worldSeed); const a = h("a", { href: URL.createObjectURL(new Blob([r.bytes], { type: "application/zip" })), download: `${r.root}.zip` }); document.body.append(a); a.click(); a.remove(); msg.textContent = `ZIP を書き出しました（${r.files} ファイル・未解決リンク ${r.unresolvedLinks ?? 0}）`; } catch (e) { msg.textContent = "書き出せませんでした: " + e.message; } };
  const past = h("input", { id: "past-month", type: "number", placeholder: "年（過去）" });
  return h("div", {}, h("h3", {}, "世界設定・出力・バージョン"), table(["項目", "値"], [["世界の種", c.worldSeed], ["解像度（セル）", S.w.world.mesh.cellCount], ["魔法", c.magic?.enabled ? "あり" : "なし"], ["現在", formatWorldDate(S.w)], ["アプリの版", APP_VERSION_FOR_SAVE], ["保存形式の版", SAVE_SCHEMA], ["整合性の検査", errs.length ? `${errs.length} 件の問題` : "問題なし"], ["時間の速度", SPEEDS.find((s) => s.id === T.speed)?.label]]),
    h("div", {}, h("button", { id: "save", onclick: save }, "保存ファイルを書き出す"), " ", fileLoader((w, warn) => { S.w = w; S.fileWarn = warn; start(); }), " ", h("button", { id: "obs", onclick: obs }, "Obsidian 用 Markdown ZIP")), msg, ...S.fileWarn.map((x) => h("div", { class: "warn" }, x)),
    h("h4", {}, "過去の閲覧"), h("div", { class: "dim" }, "過去の国家の状態を読み取り専用で見ます（地図と世界の操作は現在のまま止まります）。"), past, h("button", { onclick: () => { const y = Number(past.value); const mi = Number.isFinite(y) ? Math.max(0, Math.min(civ.monthIndex, civ.monthIndex - (civ.date.year - y) * 12)) : null; run({ type: "view.past", month: mi }); render(); } }, "その年を見る"), h("button", { onclick: () => { run({ type: "view.past", month: null }); render(); } }, "現在へ戻る"));
}
export function boot() { if (!document.getElementById("v6-root")) return; setup(); }
if (typeof window !== "undefined") { window.__v6 = { S, run, render, start }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot(); }
