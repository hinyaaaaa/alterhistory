// v6 UI: 地理・国家（一覧と 5 タブの詳細）。すべて Query で読み、Command で変える。
import { h, lb, stat, bar, btn, table, pct, n0, r2, face, donut, hemi, colorOf, polityJa, POLITY_JA, FACTION_JA, FACTION_COL, vlist } from "./common.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { FILLS, OVERLAYS } from "./map.js";
import { techTree, doctrineTree } from "./trees.js";
import { TECHS, TECH, available } from "../../core/civ/tech.js";
import { taxMult } from "../../core/civ/techfx.js";
import { DOCTRINES, canAdopt, UNIT_KINDS } from "../../core/wcde/domains/military.js";
import { FIELDS, effective, nominalOf } from "../../core/wcde/domains/effective.js";
import { interventionsOf } from "../../core/wcde/intervention.js";
import { predictWar } from "../../core/wcde/warlab.js";
import { evaluateTreaty, proposalsOf } from "../../core/wcde/negotiation.js";
import { TREATY } from "../../core/civ/diplomacy.js";
import { formatWorldDate } from "../../core/wcde/world.js";
const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi);
export const link = (id) => (civ().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.hooks.select(id); } }, stateName(id)) : String(id));
const note = (t) => h("p", { class: "n" }, t), why = (t) => h("p", { class: "n err", id: "why" }, t);

/* ---------- 地理: レイヤー（塗り 1 つ + 重ね複数）。項目をクリックすると凡例が開く ---------- */
export function pGeo() {
  const M = S.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "地理"), note("塗りは 1 つ、重ねは複数を同時に表示できます。項目名をクリックすると凡例が開きます。地図はドラッグで移動、ホイールで拡大縮小。"), lb("塗り", "FILL"));
  const legend = (key) => S.layerOpen === key ? h("div", { class: "lg", style: "flex-direction:column;gap:3px;margin:2px 0 8px 22px" }, ...M.legend(key).map((x) => h("span", {}, x.c ? h("i", { style: `background:${x.c}` }) : x.dot ? h("i", { style: `background:${x.dot};border-radius:50%` }) : h("i", { style: `border-top:2px ${x.dash ? "dashed" : "solid"} ${x.dash ?? x.line};height:0` }), x.t))) : null;
  for (const [k, ja] of FILLS) { box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "radio", name: "fill", id: "fill-" + k, checked: M.fillLayer === k, onchange: () => { M.fillLayer = k; S.hooks.mapOnly(); } }), h("span", { class: "g", onclick: () => { S.layerOpen = S.layerOpen === k ? null : k; S.hooks.panel(); } }, ja)), legend(k))); }
  box.append(lb("重ね", "OVERLAY")); for (const [k, ja] of OVERLAYS) { box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ov-" + k, checked: M.overlays.has(k), onchange: (e) => { e.target.checked ? M.overlays.add(k) : M.overlays.delete(k); S.hooks.mapOnly(); } }), h("span", { class: "g", onclick: () => { S.layerOpen = S.layerOpen === k ? null : k; S.hooks.panel(); } }, ja)), legend(k))); }
  return box.append(note("生成後の地形・気候・資源を手で編集する機能は設けていません。"), h("div", { class: "rowb" }, btn("表示を初期位置へ", () => { M.view = { x: 0, y: 0, k: 1 }; M.draw(); }))) || box;
}

/* ---------- 国家: 一覧（成立が新しい順）と詳細 ---------- */
export function pNations() {
  const c = civ(), all = Object.values(c.states).filter((s) => (S.showDead ? true : s.alive)), list = all.sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "国家"));
  if (S.sel && c.states[S.sel]) box.append(stateDetail(c.states[S.sel]));
  box.append(lb("国家一覧", "新しい順"), h("div", { class: "rowb" }, h("label", {}, h("input", { type: "checkbox", id: "show-dead", checked: !!S.showDead, onchange: (e) => { S.showDead = e.target.checked; S.hooks.panel(); } }), " 滅亡した国家も表示")), note(`${list.length} 件。クリックで詳細を開きます（クリックだけでは担当は変わりません）。`));
  box.append(vlist(list, 26, (s) => h("div", { class: "vrow" + (S.sel === s.id ? " on" : ""), onclick: () => S.hooks.select(s.id) }, h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", { style: "color:var(--dim)" }, ` ${s.alive ? "人口 " + n0(s.pop) : "滅亡"}・成立 ${date(s.formedAt).split("月")[0]}月`))));
  return box;
}
function stateDetail(st) {
  const c = civ(), mine = controlled() === st.id, tabs = [["politics", "内政"], ["military", "軍事"], ["diplomacy", "外交"], ["tech", "技術ツリー"], ["doctrine", "軍事ドクトリン"]];
  const body = { politics: tPolitics, military: tMilitary, diplomacy: tDiplomacy, tech: tTech, doctrine: tDoctrine }[S.tab](st, mine);
  return h("div", { class: "rs" }, h("div", { class: "card br" }, h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st.id)}` }), st.name), h("div", { class: "sub" }, `${polityJa(st.polity)}${st.alive ? "" : "・滅亡"}・成立 ${date(st.formedAt)}`), h("div", { class: "rowb" }, mine ? btn("担当を解除する", () => { run({ type: "control.release" }); S.hooks.render(); }, "p", { id: "release" }) : btn("この国を担当する", () => { run({ type: "control.take", stateId: st.id }); S.hooks.render(); }, "p", { id: "take", disabled: !st.alive }), mine ? h("small", { style: "color:var(--purple)" }, "担当中（操作は担当国のみ）") : h("small", { style: "color:var(--dim)" }, "閲覧中（担当ではありません）"))),
    h("div", { class: "tabs" }, ...tabs.map(([k, ja]) => h("b", { class: S.tab === k ? "on" : "", "data-tab": k, onclick: () => { S.tab = k; S.hooks.panel(); } }, ja))), S.notice ? why(S.notice) : null, body);
}
const factionRows = (st) => Object.entries(st.politics?.factions ?? {});
function tPolitics(st, mine) {
  const c = civ(), P = st.politics, L = st.leader, leg = P ? effective(c, st, "legitimacy") : 0, fat = P ? effective(c, st, "fatigue") : 0;
  const finBtn = stat("財政（詳細を開く）", n0(st.treasury)); finBtn.id = "fin-open"; finBtn.style.cursor = "pointer"; finBtn.addEventListener("click", () => { S.fin = !S.fin; S.hooks.panel(); });
  const out = h("div", {}, h("div", { class: "st", style: "grid-template-columns:repeat(3,1fr)" }, stat("人口", n0(st.pop)), finBtn, stat("安定度", pct(st.stability)), stat("疲労度", pct(fat)), stat("産業力", n0(effective(c, st, "industry"))), stat("正統性", pct(leg))));
  if (S.fin) out.append(finance(st, mine));
  out.append(lb("為政者", "RULER"), h("div", { class: "row" }, face(L?.name ?? "—", st.id), h("span", { class: "g" }, h("b", {}, L?.name ?? "—"), h("br"), h("small", {}, `${polityJa(st.polity)}・${L?.heir ? "継承者を指名済み" : "継承者は未指名"}`))));
  const rl = h("div", { class: "rowb" }, btn("継承者を指名", () => act({ type: "state.act", stateId: st.id, action: "designate_heir" }), "", { disabled: !mine || !!L?.heir, title: mine ? "" : "担当国のみ" }));
  const nm = h("input", { id: "leader-name", placeholder: "為政者の名前（創造主の編集）", value: L?.name ?? "" }); rl.append(nm, btn("名前を変更", () => creator({ type: "creator.editState", stateId: st.id, changes: { "leader.name": nm.value } }))); out.append(rl, note("為政者の交代は、継承・政変などの出来事として起きます。任意の人物への差し替え命令は、成立条件の検証がドメインに無いため設けていません（指名と名前の編集のみ）。"));
  const sn = h("input", { id: "state-name", value: st.name }), pol = h("select", { id: "polity-sel" }, ...Object.entries(POLITY_JA).map(([k, ja]) => h("option", { value: k, selected: k === st.polity }, ja)));
  out.append(lb("名称・政体", "IDENTITY"), h("div", { class: "rowb" }, sn, btn("国名を変更", () => creator({ type: "creator.editState", stateId: st.id, changes: { name: sn.value } }))), h("div", { class: "rowb" }, pol, btn("政体を変更（創造主）", () => creator({ type: "creator.editState", stateId: st.id, changes: { polity: pol.value } })), btn("政体変更（行動）", () => act({ type: "state.act", stateId: st.id, action: "change_polity", opt: pol.value }), "", { disabled: !mine })), note("名称の変更は表示名だけを変えます。国家の分裂・継承などの実体の変更とは別です。"));
  if (P) { const rows = factionRows(st); out.append(lb("支持勢力", "FACTIONS"), ...rows.map(([k, v]) => h("div", { class: "fr" }, h("div", { class: "t" }, h("span", {}, FACTION_JA[k] ?? k), h("span", {}, `支持 ${pct(v.support)}・影響力 ${pct(v.influence)}`)), h("div", { class: "bar" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })))), P.assembly ? h("div", {}, h("small", {}, "議会（議席は影響力に比例）"), hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : note("この政体には議会がありません。")); }
  out.append(creatorBox(st)); return out;
}
function finance(st, mine) {
  const c = civ(), tax = st.pop * st.policy.tax * 0.0012 * taxMult(st), trade = effective(c, st, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"], items = [["税収（年の目安）", tax], ["交易収入（直近の期）", trade]];
  return h("div", { class: "card", id: "fin" }, h("b", {}, "財政の詳細"), h("div", { class: "row" }, donut(items, cols), h("span", { class: "g" }, ...items.map((x, i) => h("div", {}, h("i", { style: `display:inline-block;width:10px;height:10px;background:${cols[i]};margin-right:5px` }), `${x[0]} ${n0(x[1])}`)), h("div", { class: "n" }, `税率 ${pct(st.policy.tax)}（上限 ${pct(st.politics?.taxCeiling ?? 0.4)}）・国庫 ${n0(st.treasury)}`))), h("div", { class: "rowb" }, btn("増税（+5%）", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "担当国のみ" }), btn("減税（−5%）", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine })), note("税率の変更は、次の税収の計算にそのまま反映されます。内訳は、実際の計算式（人口×税率×技術の倍率）から求めています。"));
}
/** 創造主の介入（計算値への一時的な補正）。入力だけで画面が変わる偽装はしない: すべて有効値として下流に効く */
function creatorBox(st) {
  const c = civ(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, f.ja))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "半減期(月)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "理由の注釈" }), info = h("p", { class: "n", id: "iv-info" });
  const upd = () => { const k = field.value, nm = nominalOf(c, st, k); info.textContent = nm == null ? "まだ算出されていません" : `通常計算値 ${r2(nm)}・有効値 ${r2(effective(c, st, k))}・範囲 ${FIELDS[k].min}〜${FIELDS[k].max}・既定の半減期 ${FIELDS[k].half}か月`; }; field.addEventListener("change", upd); setTimeout(upd, 0);
  const mineIv = interventionsOf(c).filter((r) => r.targetId === st.id).slice(-6).reverse();
  return h("div", {}, lb("創造主の介入", "INTERVENTION"), note("計算される値に一時的な補正を入れます。補正は時間とともに通常値へ戻りますが、介入中に起きた結果は戻りません。"), h("div", { class: "rowb" }, field, val, half), rsn, h("div", { class: "rowb" }, btn("介入する", () => creator({ type: "creator.intervene", stateId: st.id, field: field.value, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })), info,
    ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field} → ${r2(r.target)}`, h("br"), h("small", {}, `${{ active: "有効（残り " + r2(r.residual) + "）", converged: "収束", superseded: "置き換え", cancelled: "取り消し", target_gone: "対象消滅" }[r.status]}・${date(r.startMonth)}${r.reason ? "・" + r.reason : ""}`)), r.status === "active" ? btn("取り消す", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null)));
}

function tMilitary(st, mine) {
  const c = civ(), M = st.military; if (!M) return note("軍事のデータがありません。");
  const foes = aliveStates().filter((x) => x.id !== st.id).sort((a, b) => b.pop - a.pop), sel = h("select", { id: "wl-target" }, ...foes.slice(0, 40).map((x) => h("option", { value: x.id }, x.name))), out = h("div", { id: "wl-out" });
  const show = () => { const p = predictWar(c, st.id, sel.value, S.w.sim.ctx); out.replaceChildren(p ? warlabView(p) : "予測できません"); }; sel.addEventListener("change", show); setTimeout(() => sel.isConnected && show(), 0);
  const shares = M.shares ?? {}, inputs = Object.entries(UNIT_KINDS).map(([k, u]) => [k, h("input", { type: "number", step: "0.05", min: 0, max: 1, value: r2(shares[k] ?? 0), style: "width:62px", "data-kind": k })]);
  return h("div", {}, h("div", { class: "st", style: "grid-template-columns:repeat(2,1fr)" }, stat("兵力", n0(st.army)), stat("軍事能力", (st.milBonus >= 0 ? "+" : "") + pct(st.milBonus)), stat("装備水準（有効値）", pct(effective(c, st, "equipLevel"))), stat("練度（有効値）", pct(effective(c, st, "readiness")))),
    lb("部隊", "UNITS"), table(["部隊", "規模", "装備", "練度"], M.units.map((u) => [u.name, n0(u.size), pct(u.equip), pct(u.readiness)])), note(`充足は産業力・装備条件から算出され、介入があれば有効値を使います（産業力 ${n0(effective(c, st, "industry"))}）。`),
    lb("編制", "ORGANIZATION"), h("div", { class: "rowb" }, ...inputs.map(([k, el]) => h("label", {}, UNIT_KINDS[k].ja + " ", el))), h("div", { class: "rowb" }, btn("編制を変更", () => { const s = {}; for (const [k, el] of inputs) s[k] = Number(el.value) || 0; const r = (mine ? act : creator)({ type: "state.reorganize", stateId: st.id, shares: s }); }, "", { id: "reorg" })), note("合計は 1。条件（技術・地理）と費用を満たさない編制は理由つきで拒否されます。担当国または創造主が変更できます。"),
    lb("宣戦", "WAR"), h("div", { class: "rowb" }, btn("選んだ国へ宣戦する", () => act({ type: "state.act", stateId: st.id, action: "declare_war", target: sel.value }), "", { id: "declare", disabled: !mine, title: mine ? "" : "担当国のみ" }), !mine ? h("small", { style: "color:var(--dim)" }, "担当国のみ実行できます") : null), sel,
    lb("戦争研究所（予測）", "WAR LAB"), note("この国が攻める場合の見通しです。確定した未来ではなく、世界の状態は変えません。"), out);
}
export function warlabView(p) { return h("div", {}, h("div", {}, `勝利 ${pct(p.pAWin)}（${pct(p.pAWinRange[0])}〜${pct(p.pAWinRange[1])}）・引き分け ${pct(p.pStalemate)}・敗北 ${pct(p.pBWin)}`), h("div", { class: "bar" }, h("i", { style: `width:${p.pAWin * 100}%;background:var(--blue)` }), h("i", { style: `width:${p.pStalemate * 100}%;background:#6a6f78` }), h("i", { style: `width:${p.pBWin * 100}%;background:var(--red)` })), h("div", { class: "n" }, `見込みの損耗: 自軍 ${pct(p.lossA)} / 相手 ${pct(p.lossB)}・長引く目安 ${p.months}か月・不確実性 ${pct(p.uncertainty)}`), table(["要因", stateName(p.aId), stateName(p.bId)], p.factors.map((x) => [x.ja, x.a, x.b]))); }

function tDiplomacy(st, mine) {
  const c = civ(), others = aliveStates().filter((x) => x.id !== st.id).sort((a, b) => (st.relations[b.id] ?? 0) - (st.relations[a.id] ?? 0)), sel = h("select", { id: "dp-target" }, ...others.slice(0, 40).map((x) => h("option", { value: x.id }, `${x.name}（関係 ${Math.round(st.relations[x.id] ?? 0)}）`))), type = h("select", { id: "dp-type" }, ...Object.entries(TREATY).map(([k, v]) => h("option", { value: k }, v.ja))), out = h("div", { id: "dp-out" });
  const prev = () => { const to = c.states[sel.value]; if (!to) return; const e = evaluateTreaty(c, st, to, type.value); out.replaceChildren(h("div", {}, `相手の評価: ${e.accept ? "受け入れそう" : "断られそう"}（${e.score}）${e.counter ? "・別条件: " + TREATY[e.counter.type].ja : ""}`), ...e.factors.map((f) => h("small", { style: "display:block;color:var(--dim)" }, `${f.ja} ${f.v}`))); }; sel.addEventListener("change", prev); type.addEventListener("change", prev); setTimeout(() => sel.isConnected && prev(), 0);
  const tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st.id || t.b === st.id), wars = st.warIds.map((i) => c.wars[i]).filter(Boolean), hist = proposalsOf(c).filter((p) => p.from === st.id || p.to === st.id).slice(-8).reverse();
  return h("div", {}, lb("関係の良い国", "RELATIONS"), table(["国", "関係"], others.slice(0, 6).map((x) => [link(x.id), Math.round(st.relations[x.id] ?? 0)])), lb("締結済みの条約", "TREATIES"), tr.length ? table(["種類", "相手", "締結"], tr.map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a === st.id ? t.b : t.a), date(t.signedAt ?? t.at ?? 0)])) : note("なし"), lb("交戦中", "AT WAR"), wars.length ? h("div", {}, ...wars.map((x) => h("div", { class: "row" }, link(x.aggressor === st.id ? x.defender : x.aggressor), h("span", { class: "g" }), btn("戦争の詳細へ", () => { S.war = x.id; S.hub = "war"; S.hooks.render(); })))) : note("なし。講和は一般条約ではなく、戦争の詳細から行います。"),
    lb("条約を提案する（講和を除く）", "PROPOSE"), h("div", { class: "rowb" }, sel, type), h("div", { class: "rowb" }, btn("提案する", () => act({ type: "state.act", stateId: st.id, action: "sign_treaty", target: sel.value, opt: type.value }), "p", { id: "propose", disabled: !mine, title: mine ? "" : "担当国のみ" })), out, note("条約は、相手国の評価（受諾・拒否・別条件）と、直前の条件の再検証を経て成立します。"),
    lb("交渉の記録", "NEGOTIATIONS"), ...hist.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "講和" : TREATY[p.type]?.ja} ${stateName(p.from)}→${stateName(p.to)}`, h("br"), h("small", {}, date(p.at))), h("small", {}, { accepted: "成立", rejected: "拒否", countered: "別条件", failed_recheck: "不成立" }[p.status]))));
}
function techStatus(st) { const groups = Object.values(civ().groups).filter((g) => g.stateId === st.id), known = new Set(groups.flatMap((g) => Object.keys(g.tech?.known ?? {}))); return (t) => (st.techAdopted?.[t.key] != null ? "adopted" : t.prereq.every((p) => st.techAdopted?.[p] != null) && known.has(t.key) ? "available" : known.has(t.key) ? "known" : "locked"); }
function tTech(st, mine) {
  const status = techStatus(st), sel = TECH[S.tech] ?? null, { svg, COL } = techTree({ techs: TECHS, status, selected: S.tech, onPick: (t) => { S.tech = t.key; S.hooks.panel(); } }), s = sel && status(sel), lab = { adopted: "採用済み", available: "採用できる", known: "発見済み（前提が未採用で、まだ使えない）", locked: "未発見" };
  return h("div", {}, note(`実データの技術 ${TECHS.length} 件を、系統ごとに四方位へ、階層が外へ広がる形で表示します。ドラッグで移動、ホイールで拡大縮小。`), svg, h("div", { class: "rowb" }, btn("全体を表示", () => { svg.setAttribute("viewBox", "0 0 1000 1000"); }), btn("中心へ戻る", () => { svg.setAttribute("viewBox", "270 270 460 460"); })), h("div", { class: "lg" }, ...Object.entries({ adopted: "採用済み", available: "採用できる", known: "発見済み・未採用", locked: "未発見" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px solid ${COL[k][0]}` }), t))),
    sel ? h("div", { class: "dt" }, h("b", {}, sel.name), ` （${sel.field}・階層 ${sel.tier}）`, h("br"), `状態: ${lab[s]}`, h("br"), `前提: ${sel.prereq.length ? sel.prereq.map((p) => TECH[p]?.name ?? p).join("・") : "なし"}・必要人口 ${n0(sel.minPop)}・採用費用 ${sel.tier * 15}`, h("div", { class: "rowb" }, btn("採用する", () => act({ type: "state.act", stateId: st.id, action: "adopt_tech", opt: sel.key }), "p", { id: "adopt-tech", disabled: !mine || s !== "available", title: mine ? (s === "available" ? "" : "今は採用できません") : "担当国のみ" }))) : note("ノードを選ぶと、前提・状態・採用の可否が表示されます。"));
}
function tDoctrine(st, mine) {
  const M = st.military, taken = M?.doctrine?.taken ?? {}, status = (d) => (taken[d.id] != null ? "taken" : canAdopt(st, d.id).ok ? "available" : "blocked"), sel = DOCTRINES.find((d) => d.id === S.doc) ?? null, { svg, COL } = doctrineTree({ list: DOCTRINES, status, selected: S.doc, onPick: (d) => { S.doc = d.id; S.hooks.panel(); } });
  return h("div", {}, note(`軍事ドクトリン ${DOCTRINES.length} 件（共通 ${DOCTRINES.filter((d) => !d.polity).length}・政体固有 ${DOCTRINES.filter((d) => d.polity).length}）。取得は軍事能力・戦争研究所の予測・実戦に影響します。`), svg, h("div", { class: "lg" }, ...Object.entries({ taken: "取得済み", available: "取得できる", blocked: "取得できない" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px solid ${COL[k][0]}` }), t))),
    sel ? (() => { const ca = canAdopt(st, sel.id); return h("div", { class: "dt" }, h("b", {}, sel.ja), `（階層 ${sel.tier}${sel.polity ? "・" + polityJa(sel.polity) + "固有" : "・共通"}）`, h("br"), `攻撃 +${pct(sel.off)}・防御 +${pct(sel.def)}・費用 ${sel.cost}`, h("br"), `前提: ${sel.prereq.length ? sel.prereq.map((p) => DOCTRINES.find((x) => x.id === p)?.ja ?? p).join("・") : "なし"}${sel.tech.length ? "／技術: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("・") : ""}`, h("br"), taken[sel.id] != null ? "取得済み" : ca.ok ? "取得できます" : `取得できない理由: ${ca.reason}`, h("div", { class: "rowb" }, btn("取得する", () => act({ type: "state.adoptDoctrine", stateId: st.id, doctrineId: sel.id }), "p", { id: "adopt-doc", disabled: !mine || !ca.ok, title: mine ? "" : "担当国のみ" }))); })() : note("ノードを選ぶと、効果・前提・取得の可否が表示されます。"));
}
