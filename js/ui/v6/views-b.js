// v6 UI: 戦争・世界の外交・文化/言語/宗教・年表・統計・検索・世界設定。
import { h, lb, stat, btn, table, pct, n0, r2, colorOf, polityJa, vlist, sv } from "./common.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { lineageTree } from "./trees.js";
import { link, warlabView } from "./views-a.js";
import { predictWar } from "../../core/wcde/warlab.js";
import { proposalsOf } from "../../core/wcde/negotiation.js";
import { TREATY, strength } from "../../core/civ/diplomacy.js";
import { interventionsOf } from "../../core/wcde/intervention.js";
import { FIELDS } from "../../core/wcde/domains/effective.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { packSave, unpackSave, SAVE_SCHEMA } from "../../core/wcde/savefile.js";
import { checkWcdeIntegrity } from "../../core/wcde/integrity.js";
import { timeOf, SPEEDS } from "../../core/wcde/clock.js";
import { exportObsidianZip } from "../../io/obsidian.js";
import { APP_VERSION_FOR_SAVE } from "../../core/wcde/save-meta.js";
const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi), note = (t) => h("p", { class: "n" }, t), head = (code, ja) => [h("div", { class: "code" }, code), h("h2", {}, ja)];
const OUT = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", stalemate: "決着つかず", negotiated: "講和", state_dissolved: "国家の消滅" };

/* ---------- 戦争: 開戦が新しい順。事実の経過と、予測は分けて表示 ---------- */
export function pWar() {
  const c = civ(), all = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, ...head("WAR", "戦争"));
  const sel = c.wars[S.war]; if (sel) box.append(warDetail(sel));
  box.append(lb("戦争一覧", "新しい順"), note(`進行中 ${c.activeWarIds.length}・全体 ${all.length} 件`), vlist(all, 28, (x) => h("div", { class: "vrow", onclick: () => { S.war = x.id; S.hooks.panel(); } }, h("small", { style: "color:var(--dim)" }, x.status === "active" ? "進行中 " : "終結 "), `${stateName(x.aggressor)} 対 ${stateName(x.defender)}`, h("small", { style: "color:var(--dim)" }, ` ${date(x.startedAt).split("月")[0]}月〜`))));
  return box;
}
function warDetail(x) {
  const c = civ(), mine = controlled(), side = [...x.sides.a, ...x.sides.d].includes(mine), key = (e) => e.participants.some((p) => p.entityId === x.id), ev = c.events.filter((e) => key(e)).slice(-12), peace = proposalsOf(c).filter((p) => p.kind === "peace" && p.warId === x.id).slice(-4).reverse();
  const kind = h("select", { id: "peace-kind" }, h("option", { value: "white" }, "白紙講和"), h("option", { value: "reparations" }, "賠償つき")), amt = h("input", { id: "peace-amt", type: "number", placeholder: "賠償額", style: "width:90px" });
  return h("div", { class: "rs" }, h("div", { class: "card br" }, h("h3", {}, `${stateName(x.aggressor)} 対 ${stateName(x.defender)}`), h("div", { class: "sub" }, `${x.status === "active" ? "進行中" : "終結（" + (OUT[x.outcome] ?? x.outcome) + "）"}・開戦 ${date(x.startedAt)}${x.endedAt != null ? "・終戦 " + date(x.endedAt) : ""}・戦況 ${x.score > 0 ? "攻撃側が優勢" : x.score < 0 ? "防御側が優勢" : "拮抗"}（${r2(x.score)}）・占領 ${x.occupied.length} 区画`)),
    lb("主要経過（事実）", "FACTS"), ...(ev.length ? ev.map((e) => h("div", { class: "ev" }, h("time", {}, `${e.date.year}年${e.date.month}月`), e.title)) : [note("記録された出来事はまだありません")]),
    lb("講和", "PEACE"), ...(peace.length ? peace.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${stateName(p.from)}の申し入れ（${p.terms.kind === "reparations" ? "賠償 " + n0(p.terms.paid ?? p.terms.amount) : "白紙講和"}）`, h("br"), h("small", {}, date(p.at))), h("small", {}, { accepted: "成立", rejected: "拒否", failed_recheck: "不成立" }[p.status]))) : [note(x.status === "active" ? "まだ申し入れはありません" : "講和の記録はありません")]),
    x.status === "active" ? h("div", {}, h("div", { class: "rowb" }, kind, amt), h("div", { class: "rowb" }, btn("講和を申し入れる", () => { const st = [...x.sides.a, ...x.sides.d].includes(mine) ? mine : null; act({ type: "diplomacy.peace", stateId: st, warId: x.id, terms: { kind: kind.value, amount: Number(amt.value) || 0 } }); }, "p", { id: "peace-go", disabled: !side, title: side ? "" : "担当国が参戦している戦争のみ" })), note("講和は、相手の戦況・疲労・国庫・長期化の評価を経て、受諾されたときだけ戦争が終わります。")) : null,
    lb("戦争研究所（予測。事実とは別）", "WAR LAB"), (() => { const p = x.status === "active" ? predictWar(c, x.aggressor, x.defender, S.w.sim.ctx) : null; return p ? warlabView(p) : note("終結した戦争の予測はありません"); })());
}

/* ---------- 世界の外交: 関係表・同盟グラフ・条約一覧（新しい順） ---------- */
export function pDiplo() {
  const c = civ(), top = aliveStates().sort((a, b) => b.pop - a.pop).slice(0, 10), at = (a, b) => c.activeWarIds.some((i) => { const w = c.wars[i]; return (w.sides.a.includes(a.id) && w.sides.d.includes(b.id)) || (w.sides.a.includes(b.id) && w.sides.d.includes(a.id)); }), ally = (a, b) => c.activeTreatyIds.some((i) => { const t = c.treaties[i]; return t.type === "alliance" && ((t.a === a.id && t.b === b.id) || (t.a === b.id && t.b === a.id)); });
  const relCol = (v) => (v >= 40 ? "#6fa8c9" : v >= 10 ? "#9fbf8a" : v > -10 ? "#6a6f78" : v > -40 ? "#d8b45a" : "#d0605a");
  const mx = h("table", { class: "mx" }, h("tr", {}, h("th", { class: "rh" }), ...top.map((s) => h("th", {}, s.name.slice(0, 3)))), ...top.map((a) => h("tr", {}, h("th", { class: "rh", onclick: () => S.hooks.select(a.id) }, h("span", { class: "dot", style: `background:${colorOf(a.id)};display:inline-block` }), a.name.slice(0, 3)), ...top.map((b) => { if (a === b) return h("td", { class: "dg" }, "—"); const v = Math.round(a.relations[b.id] ?? 0), w = at(a, b), al = ally(a, b); return h("td", { class: "rc" + (w ? " war" : ""), style: `background-color:${relCol(v)}33`, title: `${a.name}→${b.name}: 関係 ${v}${w ? "・交戦中" : ""}${al ? "・同盟" : ""}` }, w ? "戦" : al ? "盟" : v); }))));
  const nodes = [...new Set(c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.type === "alliance").flatMap((t) => [t.a, t.b]))].filter((i) => c.states[i]?.alive).slice(0, 16), P = new Map(nodes.map((id, i) => [id, [250 + 120 * Math.cos((Math.PI * 2 * i) / nodes.length - Math.PI / 2), 150 + 105 * Math.sin((Math.PI * 2 * i) / nodes.length - Math.PI / 2)]]));
  const g = sv("svg", { viewBox: "0 0 500 310", width: "100%", class: "gr" }); for (const i of c.activeTreatyIds) { const t = c.treaties[i]; if (t.type !== "alliance" || !P.has(t.a) || !P.has(t.b)) continue; g.append(sv("line", { x1: P.get(t.a)[0], y1: P.get(t.a)[1], x2: P.get(t.b)[0], y2: P.get(t.b)[1], stroke: "#6fa8c9", "stroke-width": 3 })); } for (const [id, [x, y]] of P) g.append(sv("g", { class: "fn", onclick: () => S.hooks.select(id) }, sv("circle", { cx: x, cy: y, r: 14, fill: colorOf(id), stroke: "#14161a", "stroke-width": 2 }), sv("text", { x, y: y + 30, "text-anchor": "middle", "font-size": 11, fill: "#d9d6cc" }, stateName(id).slice(0, 5))));
  const tr = c.activeTreatyIds.map((i) => c.treaties[i]).sort((a, b) => b.signedAt - a.signedAt), recent = proposalsOf(c).slice(-12).reverse();
  return h("div", {}, ...head("DIPLOMACY", "世界の外交"), lb("関係表（人口上位 10 か国）", "RELATIONS"), note("行が主体、列が相手。数値は関係値、「戦」は交戦中、「盟」は同盟。色は関係の良し悪し（数値と記号も併記）。"), mx, lb("同盟関係", "ALLIANCES"), nodes.length ? g : note("同盟はありません"), lb("締結済みの条約（新しい順）", "TREATIES"), note(`${tr.length} 件`), vlist(tr, 26, (t) => h("div", { class: "vrow" }, h("small", { style: "color:var(--dim)" }, `${date(t.signedAt).split("月")[0]}月 `), `${TREATY[t.type]?.ja ?? t.type}: ${stateName(t.a)}・${stateName(t.b)}`)), lb("最近の交渉", "NEGOTIATIONS"), ...recent.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "講和" : TREATY[p.type]?.ja} ${stateName(p.from)}→${stateName(p.to)}`), h("small", {}, { accepted: "成立", rejected: "拒否", countered: "別条件", failed_recheck: "不成立" }[p.status]))));
}

/* ---------- 文化・言語・宗教: 系統図・詳細・（創造主の）編集 ---------- */
const KINDS = { culture: ["cultures", "文化", "CULTURE"], language: ["languages", "言語", "LANGUAGE"], religion: ["religions", "宗教", "RELIGION"] };
export function pEntity(kind) {
  const [key, ja, code] = KINDS[kind], c = civ(), items = Object.values(c[key]), cur = c[key][S.entity[kind]], box = h("div", {}, ...head(code, ja));
  const use = new Map(), idk = kind + "Id"; for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) if (co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"]) { const id = co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"]; use.set(id, (use.get(id) ?? 0) + g.pop * co.share); }
  box.append(note(`${items.length} 件。樹形図はドラッグで移動・ホイールで拡大縮小。ノードをクリックすると詳細を開きます。`), lineageTree(items, { selected: cur?.id, onPick: (x) => { S.entity[kind] = x.id; S.hooks.panel(); } }));
  if (cur) box.append(entityDetail(kind, cur, use));
  box.append(lb("人口の多い順", "BY POPULATION"), vlist([...items].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)), 26, (x) => h("div", { class: "vrow", onclick: () => { S.entity[kind] = x.id; S.hooks.panel(); } }, h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), x.name, h("small", { style: "color:var(--dim)" }, ` ${n0(use.get(x.id) ?? 0)}人`))));
  return box;
}
function entityDetail(kind, x, use) {
  const c = civ(), nm = h("input", { id: "ent-name", value: x.name }), par = x.parent ? c[KINDS[kind][0]][x.parent]?.name : "（起源）", kids = Object.values(c[KINDS[kind][0]]).filter((y) => y.parent === x.id), rows = [["名前", x.name], ["系統（親）", par], ["派生した先", kids.length ? kids.map((k) => k.name).join("・") : "なし"], ["成立", date(Math.max(0, x.bornAt))], ["現在の人口", n0(use.get(x.id) ?? 0)]];
  if (kind === "religion") rows.push(["最高神", x.deity ?? "—"], ["信仰形態", x.kind ?? "—"], ["聖地", x.holyCell != null ? `区画 ${x.holyCell}` : "—"], ["創始者", x.founderId ? (c.figures?.[x.founderId]?.name ?? x.founderId) : "—"]);
  if (kind === "language" && x.phon) rows.push(["子音", x.phon.c.join(" ")], ["母音", x.phon.v.join(" ")], ["音節末の子音", x.phon.coda ? "あり" : "なし"], ["促音", x.phon.geminate ? "あり" : "なし"], ["音の変化", `${x.phon.changes.length} 件`]);
  if (kind === "culture") rows.push(["発祥の区画", x.cell != null ? `区画 ${x.cell}` : "—"], ["名前の固定", x.nameFixed ? "固定（創造主の編集）" : "自動"]);
  return h("div", { class: "dt rs" }, h("b", {}, x.name), table(["項目", "内容"], rows), h("div", { class: "rowb" }, nm, btn("名前を編集（創造主）", () => creator({ type: "creator.rename", kind, id: x.id, name: nm.value }), "", { id: "ent-rename" })), note("定義の編集は創造主の介入として記録され、過去の客観イベントは書き換えません。定義と、集団で実際に使われている状態は別です。"));
}

/* ---------- 年表: 事実イベント／AI の判断／創造主の介入／後世の認識を区別して閲覧 ---------- */
export function pChron() {
  const c = civ(), F = S.tl, types = [["events", "客観イベント"], ["decisions", "AI の判断"], ["creator", "創造主の介入"], ["interp", "後世の歴史認識"]], box = h("div", {}, ...head("CHRONICLE", "年表"), h("div", { class: "tabs" }, ...types.map(([k, ja]) => h("b", { class: F.type === k ? "on" : "", "data-ttype": k, onclick: () => { F.type = k; S.hooks.panel(); } }, ja))));
  const kinds = [...new Set(c.events.slice(-4000).map((e) => e.kind))].sort(), ks = h("select", { id: "tl-kind", onchange: (e) => { F.kind = e.target.value; S.hooks.panel(); } }, h("option", { value: "" }, "すべての種別"), ...kinds.map((k) => h("option", { value: k, selected: F.kind === k }, k))), tx = h("input", { id: "tl-text", value: F.text, placeholder: "語で絞る", onchange: (e) => { F.text = e.target.value; S.hooks.panel(); } }), y0 = h("input", { id: "tl-from", type: "number", placeholder: "年から", value: F.from, style: "width:78px", onchange: (e) => { F.from = e.target.value; S.hooks.panel(); } }), y1 = h("input", { id: "tl-to", type: "number", placeholder: "年まで", value: F.to, style: "width:78px", onchange: (e) => { F.to = e.target.value; S.hooks.panel(); } });
  box.append(h("div", { class: "rowb" }, F.type === "events" ? ks : null, tx, y0, y1), F.entity ? h("div", { class: "rowb" }, `絞り込み: ${stateName(F.entity)}`, btn("解除", () => { F.entity = ""; S.hooks.panel(); })) : null);
  const inRange = (d) => (F.from === "" || d.year >= +F.from) && (F.to === "" || d.year <= +F.to), has = (s) => !F.text || String(s).includes(F.text); let rows = [], render;
  if (F.type === "events") { for (let i = c.events.length - 1; i >= 0 && rows.length < 20000; i--) { const e = c.events[i]; if ((F.kind && e.kind !== F.kind) || !has(e.title) || !inRange(e.date) || (F.entity && !e.participants.some((p) => p.entityId === F.entity))) continue; rows.push(e); } render = (e) => h("div", { class: "vrow", onclick: () => showEvent(e) }, h("small", { style: "color:var(--dim)" }, `${e.date.year}年${e.date.month}月 `), e.title); }
  else if (F.type === "decisions") { for (let i = c.decisions.length - 1; i >= 0 && rows.length < 20000; i--) { const d = c.decisions[i]; if (!inRange(d.date) || (F.entity && d.actorId !== F.entity) || !has(stateName(d.actorId) + d.type)) continue; rows.push(d); } render = (d) => h("div", { class: "vrow", onclick: () => showDecision(d) }, h("small", { style: "color:var(--dim)" }, `${d.date.year}年${d.date.month}月 `), `${stateName(d.actorId)}: ${d.type}（${d.provenance === "ai" ? "AI" : d.provenance}）`); }
  else if (F.type === "creator") { const ivs = interventionsOf(c).map((r) => ({ at: r.startMonth, t: `介入: ${stateName(r.targetId)} の${FIELDS[r.field]?.ja ?? r.field} → ${r2(r.target)}（${{ active: "有効", converged: "収束", superseded: "置き換え", cancelled: "取り消し", target_gone: "対象消滅" }[r.status]}）${r.reason ? "・" + r.reason : ""}` })), eds = (c.wcde.edits ?? []).map((e) => ({ at: e.at, t: `直接編集: ${e.targetId} の ${e.property}（${String(e.before).slice(0, 16)} → ${String(e.after).slice(0, 16)}）` })); rows = [...ivs, ...eds].filter((r) => has(r.t)).sort((a, b) => b.at - a.at); render = (r) => h("div", { class: "vrow" }, h("small", { style: "color:var(--purple)" }, `${date(r.at)} `), r.t); }
  else { for (let i = c.interpretations.length - 1; i >= 0 && rows.length < 20000; i--) { const r = c.interpretations[i]; if ((F.entity && r.ownerId !== F.entity) || !has(stateName(r.ownerId) + r.stance)) continue; rows.push(r); } render = (r) => { const ev = c.events.find((e) => e.eventId === r.eventId); return h("div", { class: "vrow" }, h("small", { style: "color:var(--dim)" }, `${date(r.since)} `), `${stateName(r.ownerId)}の認識「${r.stance}」: ${ev?.title ?? r.eventId}`); }; }
  box.append(note(`${rows.length.toLocaleString("ja-JP")} 件（新しい順。見える範囲だけ描画）`), vlist(rows, 26, render), h("div", { id: "evdetail", class: "dt" }, "項目を選ぶと、原因・結果・関係する実体を表示します。"));
  return box;
}
function showEvent(e) { const c = civ(), d = document.getElementById("evdetail"); if (!d) return; d.replaceChildren(h("b", {}, e.title), h("div", {}, `${e.date.year}年${e.date.month}月・種別 ${e.kind}・出典 ${e.provenance}`), h("div", {}, "関係する実体: ", ...e.participants.filter((p) => c.states[p.entityId]).map((p) => [h("a", { class: "lk", href: "#", onclick: (ev) => { ev.preventDefault(); S.hooks.select(p.entityId); } }, stateName(p.entityId)), " ", h("a", { class: "lk", href: "#", title: "この国で絞り込む", onclick: (ev) => { ev.preventDefault(); S.tl.entity = p.entityId; S.hooks.panel(); } }, "（絞込）"), " "]), ...e.participants.filter((p) => c.wars[p.entityId]).map((p) => btn("戦争の詳細", () => { S.war = p.entityId; S.hub = "war"; S.hooks.render(); }))), h("div", {}, "原因: ", ...(e.causes.length ? e.causes.map((x) => { const t = c.events.find((y) => y.eventId === x.targetId); return h("small", { style: "display:block;color:var(--dim)" }, `${x.relation}（${x.basis}）${t ? t.title : x.targetId}`); }) : ["特定できていない"])), h("div", {}, "結果: ", ...(e.effects.length ? e.effects.slice(0, 5).map((x) => h("small", { style: "display:block;color:var(--dim)" }, `${x.property}: ${x.before} → ${x.after}`)) : ["—"]))); }
function showDecision(x) { const d = document.getElementById("evdetail"); if (!d) return; d.replaceChildren(h("b", {}, `${stateName(x.actorId)} の判断: ${x.type}`), h("div", {}, `戦略 ${x.strategy ?? "—"}・${x.date.year}年${x.date.month}月・階層 ${x.layer}`), h("div", { class: "n" }, "判断時の観測: " + Object.entries(x.observations ?? {}).map(([k, v]) => `${k}=${typeof v === "number" ? r2(v) : v}`).join("・")), h("div", { class: "n" }, `候補 ${x.candidates?.length ?? 0} 件から選択（判断の記録であり、世界の事実のイベントとは別です）`)); }

/* ---------- 統計: 軍事力・国土・人口・文化・宗教・言語のランキング（実データ・基準を明記） ---------- */
export function pStats() {
  const c = civ(), A = aliveStates(), cells = new Map(); for (const g of Object.values(c.groups)) if (g.stateId) cells.set(g.stateId, (cells.get(g.stateId) ?? 0) + (g.cells?.length || 1));
  const area = (id) => { let k = 0; for (const g of Object.values(c.groups)) if (g.stateId === id) for (const ce of g.cells?.length ? g.cells : [g.cell]) k += S.w.world.cell.areaKm2[ce] ?? 0; return k; };
  const rank = (title, code, items, fmt, crit) => h("div", {}, lb(title, code), h("p", { class: "n" }, "基準: " + crit), ...items.slice(0, 10).map((x, i) => h("div", { class: "row" }, h("small", { style: "width:18px" }, i + 1), x.link ?? x.name, h("span", { class: "g" }), h("small", {}, fmt(x.v)))));
  const pop = (key) => { const m = new Map(); for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) { const id = co[key]; if (id) m.set(id, (m.get(id) ?? 0) + g.pop * co.share); } return m; };
  const named = (m, tab) => [...m].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ name: tab[id]?.name ?? id, v }));
  return h("div", {}, ...head("STATISTICS", "統計"), note(`現在 ${formatWorldDate(S.w)}。すべて世界の状態から計算します。`), rank("軍事力", "MILITARY", A.map((s) => ({ link: link(s.id), v: strength(c, s) })).sort((a, b) => b.v - a.v), n0, "兵力 × 軍事能力（有効値）× 防御の倍率（AI・戦争研究所と同じ戦力）"), rank("国土", "TERRITORY", A.map((s) => ({ link: link(s.id), v: area(s.id) })).sort((a, b) => b.v - a.v), (v) => n0(v) + " km²", "国家に属する集団の区画の面積の合計"), rank("人口", "POPULATION", A.map((s) => ({ link: link(s.id), v: s.pop })).sort((a, b) => b.v - a.v), n0, "国家に属する集団の人口の合計"), rank("文化", "CULTURE", named(pop("cultureId"), c.cultures), n0, "集団の人口 × その文化の構成比の合計（世界全体）"), rank("宗教", "RELIGION", named(pop("religionId"), c.religions), n0, "集団の人口 × その宗教の構成比の合計（世界全体）"), rank("言語", "LANGUAGE", named(pop("languageId"), c.languages), n0, "集団の人口 × その言語の構成比の合計（世界全体）"));
}

/* ---------- 検索: 索引を増分で育て、毎回は全件を走査しない ---------- */
const IDX = new WeakMap();
function index(c) {
  let I = IDX.get(c); if (!I) IDX.set(c, (I = { n: 0, ent: [], ev: [] })); const ent = [], put = (kind, id, name, go) => name && ent.push({ kind, id, name, k: String(name), go });
  for (const s of Object.values(c.states)) put("国家", s.id, s.name, () => S.hooks.select(s.id)); for (const f of Object.values(c.figures ?? {})) put("人物", f.id, f.name, () => (f.stateId && c.states[f.stateId] ? S.hooks.select(f.stateId) : null)); for (const s of Object.values(c.settlements)) put("都市", s.id, s.name, () => S.hooks.focusCell(s.cell));
  for (const [k, ja] of [["cultures", "文化"], ["languages", "言語"], ["religions", "宗教"]]) for (const x of Object.values(c[k])) put(ja, x.id, x.name, () => { const kind = k === "cultures" ? "culture" : k === "languages" ? "language" : "religion"; S.entity[kind] = x.id; S.hub = kind; S.hooks.render(); });
  import("../../core/civ/tech.js").then((m) => { for (const t of m.TECHS) put("技術", t.key, t.name, () => { S.tech = t.key; S.tab = "tech"; S.hub = "nations"; S.hooks.render(); }); });
  for (const w of Object.values(c.wars)) put("戦争", w.id, `${stateName(w.aggressor)}対${stateName(w.defender)}`, () => { S.war = w.id; S.hub = "war"; S.hooks.render(); }); for (const t of Object.values(c.treaties)) put("条約", t.id, `${TREATY[t.type]?.ja}:${stateName(t.a)}・${stateName(t.b)}`, () => { S.hub = "diplo"; S.hooks.render(); });
  I.ent = ent; for (; I.n < c.events.length; I.n++) I.ev.push(c.events[I.n].title); return I;
}
export function pSearch() {
  const c = civ(), I = index(c), q = S.q, inp = h("input", { id: "q", value: q, placeholder: "国家・人物・都市・文化・言語・宗教・技術・戦争・条約・出来事", style: "width:100%", onchange: (e) => { S.q = e.target.value; S.hooks.panel(); } }), res = [];
  if (q) { for (const e of I.ent) if (e.k.includes(q)) res.push([e.kind, e.name, e.go]); for (let i = I.ev.length - 1; i >= 0 && res.length < 400; i--) if (I.ev[i].includes(q)) res.push(["出来事", I.ev[i], () => { S.tl = { ...S.tl, type: "events", text: q, kind: "", entity: "" }; S.hub = "chron"; S.hooks.render(); }]); }
  return h("div", {}, ...head("SEARCH", "検索"), inp, note(q ? `${res.length}${res.length >= 400 ? "+" : ""} 件（名前が変わっても、安定した ID でたどれます）` : "語を入力して Enter。"), vlist(res, 26, (r) => h("div", { class: "vrow", onclick: r[2] }, h("small", { style: "color:var(--dim);width:42px;flex:none" }, r[0]), r[1])));
}

/* ---------- 世界設定・出力・バージョン ---------- */
export function pSettings() {
  const c = civ(), cf = c.wcde.config, T = timeOf(c), errs = checkWcdeIntegrity(S.w.world, c), msg = h("p", { class: "n", id: "exp-msg" }), cal = cf.calendar;
  const dl = (blob, name) => { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); };
  const save = () => { const p = packSave(S.w); dl(new Blob([p.text], { type: "application/json" }), `alterhistory-${cf.worldSeed}-${c.date.year}.ahw`); msg.textContent = `保存ファイルを書き出しました（${(p.bytes / 1048576).toFixed(1)} MB）`; };
  const obs = async () => { msg.textContent = "Obsidian 用の ZIP を作っています…"; try { const r = await exportObsidianZip(S.w.world, c, cf.name || cf.worldSeed); dl(new Blob([r.bytes], { type: "application/zip" }), `${r.root}.zip`); msg.textContent = `ZIP を書き出しました（${r.files} ファイル）`; } catch (e) { msg.textContent = "書き出せませんでした: " + e.message; } };
  const en = h("input", { id: "epoch-name", value: cal.epochName ?? "", style: "width:120px" });
  const past = h("input", { id: "past-year", type: "number", placeholder: "年", style: "width:90px" });
  return h("div", {}, ...head("SETTINGS", "世界設定・出力"), table(["項目", "値"], [["世界の種", cf.worldSeed], ["解像度（セル）", S.w.world.mesh.cellCount], ["魔法", cf.magic?.enabled ? "あり" : "なし"], ["種族", (cf.species ?? []).map((s) => s.name ?? s.id ?? s).join("・") || "—"], ["先史の長さ", `${n0(cf.prehistory?.years ?? 0)} 年`], ["現在", formatWorldDate(S.w)], ["暦の起点名", cal.epochName], ["時代区分", (cal.eras ?? []).map((e) => e.name).join(" → ")]]),
    lb("暦の表示名（表示用のみ）", "CALENDAR"), h("div", { class: "rowb" }, en, btn("変更", () => { const r = run({ type: "calendar.edit", edit: { epochName: en.value } }); S.hooks.render(); })), note("生成後に変えられるのは表示用の名称・区分だけです。過去の日付・発生順・客観的事実は変わりません。"),
    lb("保存・読み込み・出力", "SAVE / EXPORT"), h("div", { class: "rowb" }, btn("保存ファイルを書き出す", save, "p", { id: "save" }), fileLoader(), btn("Obsidian 用 Markdown ZIP", obs, "", { id: "obs" })), msg, ...S.fileWarn.map((x) => h("p", { class: "warn" }, x)),
    lb("バージョン情報", "VERSION"), table(["項目", "値"], [["アプリの版", APP_VERSION_FOR_SAVE], ["保存形式の版（アプリの版とは別）", SAVE_SCHEMA], ["整合性の検査", errs.length ? `${errs.length} 件の問題` : "問題なし"], ["時間の速度", SPEEDS.find((s) => s.id === T.speed)?.label]]),
    lb("過去の閲覧", "PAST VIEW"), note("過去の国家の状態を読み取り専用で見ます。閲覧中は、世界を変える操作と時間進行が止まります。"), h("div", { class: "rowb" }, past, btn("その年を見る", () => { const y = Number(past.value); if (Number.isFinite(y)) { run({ type: "view.past", month: Math.max(0, Math.min(c.monthIndex, c.monthIndex - (c.date.year - y) * 12)) }); S.hooks.render(); } }), btn("現在へ戻る", () => { run({ type: "view.past", month: null }); S.hooks.render(); })));
}
export function fileLoader(done) {
  const inp = h("input", { type: "file", accept: ".ahw,.json,application/json", id: "loadfile", hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; const r = unpackSave(await f.text()); if (!r.ok) { alert("読み込めません:\n" + r.errors.join("\n")); return; } (done ?? S.hooks.loaded)(r.w, r.warnings); } });
  return h("span", {}, inp, btn("保存ファイルを読み込む", () => inp.click(), "", { id: "load" }));
}
