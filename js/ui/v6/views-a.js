// v6 UI: 地理・国家（一覧と 5 タブの詳細）。すべて Query で読み、Command で変える。
import { h, lb, stat, bar, btn, table, pct, n0, r2, face, donut, hemi, colorOf, polityJa, POLITY_JA, FACTION_JA, FACTION_COL, vlist } from "./common.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { LAYERS, GROUPS, PRESETS, FILL_IDS } from "./map.js";
import { techTree, doctrineTree } from "./trees.js";
import { TECHS, TECH, LANES, COND, available } from "../../core/civ/tech.js";
import { formatDate } from "../../core/wcde/calendar.js";
import { actionGate } from "../../core/civ/actions.js";
import { taxMult } from "../../core/civ/techfx.js";
import { canAdopt, UNIT_KINDS, nodesOf, nodeOf, branchesOf } from "../../core/wcde/domains/military.js";
import { ideasOf } from "../../core/wcde/domains/politics.js";
import { FX_JA as DOC_FX_JA } from "../../core/wcde/domains/doctrine.js";
import { FIELDS, effective, nominalOf } from "../../core/wcde/domains/effective.js";
import { interventionsOf } from "../../core/wcde/intervention.js";
import { predictWar } from "../../core/wcde/warlab.js";
import { evaluateTreaty, proposalsOf, treatyFeasible } from "../../core/wcde/negotiation.js";
import { TREATY } from "../../core/civ/diplomacy.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { pastView } from "../../core/civ/archive.js";
const DOMAIN_JA = { economy: "経済", military: "軍事", politics: "政治", states: "国家", population: "人口", war_diplomacy: "外交" };
const TREATY_EFFECT = { nonaggression: "効果: 互いに宣戦できない。軍の支持がやや下がる。", alliance: "効果: 食料不足の安定低下を和らげ、貴族の支持が上がる。一方が戦うと、他方が参戦することがある。", trade: "効果: 隣接する国の間で交易が成立し、開放度に応じて産業・交易収入・商人の支持が上がる。封鎖・制裁中は成立しない。" };
const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi);
export const link = (id) => (civ().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.hooks.select(id); } }, stateName(id)) : String(id));
const note = (t) => h("p", { class: "n" }, t), why = (t) => h("p", { class: "n err", id: "why" }, t);

/* ---------- 地理: レイヤー（Azgaar 方式。各層を独立に ON/OFF。上の層ほど手前。プリセットで一括切替） ---------- */
export function pGeo() {
  const M = S.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "地理"), note("各レイヤーを自由に重ねられます。よく使う組み合わせはプリセットから。項目名をクリックすると凡例、塗りの層は不透明度も変えられます。"), lb("プリセット", "PRESET"));
  const done = () => { S.hooks.mapOnly(); S.hooks.panel(); };
  box.append(h("div", { class: "chips" }, ...PRESETS.map(([id, ja]) => h("b", { class: M.preset === id ? "on" : "", "data-preset": id, onclick: () => { M.setPreset(id); done(); } }, ja))));
  const legend = (key) => S.layerOpen === key ? h("div", { class: "lg", style: "flex-direction:column;gap:3px;margin:2px 0 8px 22px" }, ...M.legend(key).map((x) => h("span", {}, x.c ? h("i", { style: `background:${x.c}` }) : x.dot ? h("i", { style: `background:${x.dot};border-radius:50%` }) : h("i", { style: `border-top:2px ${x.dash ? "dashed" : "solid"} ${x.dash ?? x.line};height:0` }), x.t))) : null;
  for (const [gid, ja, en] of GROUPS) {
    box.append(lb(ja, en));
    for (const [id, name] of LAYERS.filter((l) => l[2] === gid).reverse()) { // 上の層（手前）を先に
      const fill = FILL_IDS.includes(id), on = M.isOn(id);
      box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ly-" + id, checked: on, onchange: () => { M.toggle(id); done(); } }), h("span", { class: "g", onclick: () => { S.layerOpen = S.layerOpen === id ? null : id; S.hooks.panel(); } }, name), fill && on ? h("input", { type: "range", class: "opa", min: 20, max: 100, value: Math.round(M.alpha[id] * 100), title: "不透明度", oninput: (e) => { M.alpha[id] = e.target.value / 100; M.interact(); } }) : null), legend(id)));
    }
  }
  return box.append(note("地形・気候・資源を生成後に手で編集する機能は設けていません。"), h("div", { class: "rowb" }, btn("表示を初期位置へ", () => { M.view = { x: 0, y: 0, k: 1 }; M.draw(); }))) || box;
}

/* ---------- 国家: 一覧（成立が新しい順）と詳細 ---------- */
export function pNations() {
  const c = civ(), pv = S.w.viewPast, all = pv != null ? pastView(c, pv).states.map((x) => ({ id: x.id, name: x.name ?? "（名前の資料が失われた国家）", polity: x.polity, formedAt: x.formedAt ?? -Infinity, alive: true, partial: x.partial })) : Object.values(c.states).filter((s) => (S.showDead ? true : s.alive)), list = all.sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "国家"), pv != null ? h("p", { class: "n err" }, `過去（${date(pv)}）の国家を、残っている歴史資料から再構成して表示しています（読み取り専用）。資料が失われた部分は不明で、何も無かったという意味ではありません。`) : null);
  if (pv == null && S.sel && c.states[S.sel]) box.append(stateDetail(c.states[S.sel]));
  box.append(lb("国家一覧", "新しい順"), h("div", { class: "rowb" }, h("label", {}, h("input", { type: "checkbox", id: "show-dead", checked: !!S.showDead, onchange: (e) => { S.showDead = e.target.checked; S.hooks.panel(); } }), " 滅亡した国家も表示")), note(`${list.length} 件。クリックで詳細を開きます（クリックだけでは担当は変わりません）。`));
  box.append(vlist(list, 40, (s) => h("div", { class: "vrow full" + (S.sel === s.id ? " on" : ""), onclick: () => S.hooks.select(s.id) }, h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", { style: "color:var(--dim)" }, ` ${s.alive ? "人口 " + n0(s.pop) : "滅亡"}・成立 ${date(s.formedAt).split("月")[0]}月`))));
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
  const finBtn = stat("財政 ▸", n0(st.treasury)); finBtn.id = "fin-open"; finBtn.title = "クリックで財政の詳細"; finBtn.style.cursor = "pointer"; finBtn.addEventListener("click", () => { S.fin = !S.fin; S.hooks.panel(); });
  const out = h("div", {}, h("div", { class: "st", style: "grid-template-columns:repeat(3,1fr)" }, stat("人口", n0(st.pop)), finBtn, stat("安定度", pct(st.stability)), stat("疲労度", pct(fat)), stat("産業力", n0(effective(c, st, "industry"))), stat("正統性", pct(leg))));
  if (S.fin) out.append(finance(st, mine));
  out.append(lb("為政者", "RULER"), h("div", { class: "row" }, face(L?.name ?? "—", st.id), h("span", { class: "g" }, h("b", {}, L?.name ?? "—"), h("br"), h("small", {}, `${polityJa(st.polity)}・${L?.heir ? "継承者を指名済み" : "継承者は未指名"}`))));
  const rl = h("div", { class: "rowb" }, btn("継承者を指名", () => act({ type: "state.act", stateId: st.id, action: "designate_heir" }), "", { disabled: !mine || !!L?.heir, title: mine ? "" : "担当国のみ" }));
  const nm = h("input", { id: "leader-name", placeholder: "為政者の名前（創造主の編集）", value: L?.name ?? "" }); rl.append(nm, btn("別の家系の為政者に交代させる（創造主）", () => creator({ type: "creator.editState", stateId: st.id, changes: { "leader.name": nm.value } }), "", { id: "leader-replace" })); out.append(rl, note("名前を入れて交代させると、「王朝の交代」として記録され、前の為政者は退位します。"));
  const sn = h("input", { id: "state-name", value: st.name }), pol = h("select", { id: "polity-sel" }, ...Object.entries(POLITY_JA).map(([k, ja]) => h("option", { value: k, selected: k === st.polity }, ja)));
  out.append(lb("名称・政体", "IDENTITY"), h("div", { class: "rowb" }, sn, btn("国名を変更", () => creator({ type: "creator.editState", stateId: st.id, changes: { name: sn.value } }))), h("div", { class: "rowb" }, pol, btn("政体を変更（創造主）", () => creator({ type: "creator.editState", stateId: st.id, changes: { polity: pol.value } })), btn("政体変更（行動）", () => act({ type: "state.act", stateId: st.id, action: "change_polity", opt: pol.value }), "", { disabled: !mine })), note("名称の変更は表示名だけです。"));
  if (P) { const rows = factionRows(st); out.append(lb("支持勢力", "FACTIONS"), ...rows.map(([k, v]) => h("div", { class: "fr" }, h("div", { class: "t" }, h("span", {}, FACTION_JA[k] ?? k), h("span", {}, `支持 ${pct(v.support)}・影響力 ${pct(v.influence)}`)), h("div", { class: "bar" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })))), P.assembly ? h("div", {}, h("small", {}, "議会（議席は影響力に比例）"), hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : note("この政体には議会がありません。")); }
  const ideas = ideasOf(st); if (ideas.length) out.append(lb("思想", "IDEAS"), table(["思想", "広がり"], ideas.slice(0, 6).map((x) => [x.ja, pct(x.v)])), note("思想は条件から自然に生まれ、接する国・交易・同盟を通じて広がります。禁止はできません。"));
  out.append(creatorBox(st)); return out;
}
function finance(st, mine) {
  const c = civ(), tax = st.pop * st.policy.tax * 0.0012 * taxMult(st), trade = effective(c, st, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"], items = [["税収（年の目安）", tax], ["交易収入（直近の期）", trade]];
  return h("div", { class: "card", id: "fin" }, h("b", {}, "財政の詳細"), h("div", { class: "row" }, donut(items, cols), h("span", { class: "g" }, ...items.map((x, i) => h("div", {}, h("i", { style: `display:inline-block;width:10px;height:10px;background:${cols[i]};margin-right:5px` }), `${x[0]} ${n0(x[1])}`)), h("div", { class: "n" }, `税率 ${pct(st.policy.tax)}（上限 ${pct(st.politics?.taxCeiling ?? 0.4)}）・国庫 ${n0(st.treasury)}`))), h("div", { class: "rowb" }, btn("増税（+5%）", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "担当国のみ" }), btn("減税（−5%）", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine })), note("税率の変更は、次の税収の計算にそのまま反映されます。内訳は、実際の計算式（人口×税率×技術の倍率）から求めています。"));
}
/** 創造主の介入（計算値への一時的な補正）。入力だけで画面が変わる偽装はしない: すべて有効値として下流に効く */
function creatorBox(st) {
  const c = civ(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, `${DOMAIN_JA[f.domain ?? ({ industry: "economy", perCapita: "economy", tradeIncome: "economy", foodBalance: "economy", taxRevenue: "economy", equipLevel: "military", readiness: "military", legitimacy: "politics", fatigue: "politics" })[k]] ?? ""}・${f.ja}`))), other = h("select", { id: "iv-other", style: "display:none" }, ...aliveStates().filter((x) => x.id !== st.id).sort((a, b) => b.pop - a.pop).slice(0, 60).map((x) => h("option", { value: x.id }, x.name))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "半減期(月)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "理由の注釈" }), info = h("p", { class: "n", id: "iv-info" });
  const upd = () => { const k = field.value, pair = !!FIELDS[k].pair; other.style.display = pair ? "" : "none"; const o = pair ? other.value : null, nm = nominalOf(c, st, k, o); info.textContent = nm == null ? "まだ算出されていません" : `通常計算値 ${r2(nm)}・有効値 ${r2(effective(c, st, k, o))}・範囲 ${FIELDS[k].min}〜${FIELDS[k].max}・既定の半減期 ${FIELDS[k].half}か月`; }; field.addEventListener("change", upd); other.addEventListener("change", upd); setTimeout(upd, 0);
  const mineIv = interventionsOf(c).filter((r) => r.targetId === st.id).slice(-6).reverse();
  return h("div", {}, lb("創造主の介入", "INTERVENTION"), note("計算される値に一時的な補正を入れます。補正は時間とともに通常値へ戻りますが、介入中に起きた結果は戻りません。"), h("div", { class: "rowb" }, field, other, val, half), rsn, h("div", { class: "rowb" }, btn("介入する", () => creator({ type: "creator.intervene", stateId: st.id, field: field.value, otherId: FIELDS[field.value].pair ? other.value : null, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })), info,
    ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field}${r.otherId ? "（→" + stateName(r.otherId) + "）" : ""} → ${r2(r.target)}`, h("br"), h("small", {}, `${{ active: "有効（残り " + r2(r.residual) + "）", converged: "収束", superseded: "置き換え", cancelled: "取り消し", target_gone: "対象消滅" }[r.status]}・${date(r.startMonth)}${r.reason ? "・" + r.reason : ""}`)), r.status === "active" ? btn("取り消す", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null)));
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
  const prev = () => { const to = c.states[sel.value]; if (!to) return; const fe = treatyFeasible(c, st, to, type.value), e = evaluateTreaty(c, st, to, type.value); out.replaceChildren(fe ? h("div", { class: "n err", id: "dp-infeasible" }, `締結できない状況: ${fe}`) : null, h("div", { class: "n" }, TREATY_EFFECT[type.value] ?? ""), h("div", {}, `相手の評価: ${e.accept ? "受け入れそう" : "断られそう"}（${e.score}）${e.counter ? "・別条件: " + TREATY[e.counter.type].ja : ""}`), ...e.factors.map((f) => h("small", { style: "display:block;color:var(--dim)" }, `${f.ja} ${f.v}`))); }; sel.addEventListener("change", prev); type.addEventListener("change", prev); setTimeout(() => sel.isConnected && prev(), 0);
  const tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st.id || t.b === st.id), wars = st.warIds.map((i) => c.wars[i]).filter(Boolean), hist = proposalsOf(c).filter((p) => p.from === st.id || p.to === st.id).slice(-8).reverse();
  return h("div", {}, lb("関係の良い国", "RELATIONS"), table(["国", "関係"], others.slice(0, 6).map((x) => [link(x.id), Math.round(st.relations[x.id] ?? 0)])), lb("締結済みの条約", "TREATIES"), tr.length ? table(["種類", "相手", "締結", ""], tr.map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a === st.id ? t.b : t.a), date(t.signedAt ?? t.at ?? 0), btn("破棄", () => act({ type: "state.act", stateId: st.id, action: "break_treaty", target: t.id }), "", { class: "b brk", disabled: !mine, title: mine ? "破棄すると相手との関係が悪化する" : "担当国のみ" })])) : note("なし"), lb("交戦中", "AT WAR"), wars.length ? h("div", {}, ...wars.map((x) => h("div", { class: "row" }, link(x.aggressor === st.id ? x.defender : x.aggressor), h("span", { class: "g" }), btn("戦争の詳細へ", () => { S.war = x.id; S.hub = "war"; S.hooks.render(); })))) : note("なし。講和は一般条約ではなく、戦争の詳細から行います。"),
    lb("条約を提案する（講和を除く）", "PROPOSE"), h("div", { class: "rowb" }, sel, type), h("div", { class: "rowb" }, btn("提案する", () => act({ type: "state.act", stateId: st.id, action: "sign_treaty", target: sel.value, opt: type.value }), "p", { id: "propose", disabled: !mine, title: mine ? "" : "担当国のみ" })), out, h("div", { class: "rowb" }, btn("制裁を科す", () => act({ type: "state.act", stateId: st.id, action: "impose_sanctions", target: sel.value }), "", { id: "sanction", disabled: !mine }), btn("和解の使節", () => act({ type: "state.act", stateId: st.id, action: "reconcile", target: sel.value }), "", { id: "reconcile", disabled: !mine })), note("条約は、相手国が受け入れたときだけ成立します。条件を満たさない提案は、理由つきで断られます。"),
    lb("交渉の記録", "NEGOTIATIONS"), ...hist.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "講和" : TREATY[p.type]?.ja} ${stateName(p.from)}→${stateName(p.to)}`, h("br"), h("small", {}, date(p.at))), h("small", {}, { accepted: "成立", rejected: "拒否", countered: "別条件", failed_recheck: "不成立" }[p.status]))));
}
// ---- 技術タブ（v6.1.0 M3）。状態は 5 つ: 制度化（国が採用）／採用できる（国内の 3 割以上が知っている）／保有（一部の集団だけが知る）／失われた／未発見
function techStatus(st) {
  const c = civ(), groups = Object.values(c.groups).filter((g) => g.stateId === st.id), total = groups.reduce((a, g) => a + g.pop, 0) || 1, have = {}, lostHere = new Set();
  for (const g of groups) { for (const k in g.tech?.known ?? {}) have[k] = (have[k] ?? 0) + g.pop; for (const k in g.tech?.lost ?? {}) lostHere.add(k); }
  const cov = (k) => (have[k] ?? 0) / total, f = (t) => (st.techAdopted?.[t.key] != null ? "adopted" : cov(t.key) >= 0.3 ? "available" : cov(t.key) > 0 ? "known" : lostHere.has(t.key) ? "lost" : "locked");
  f.cov = cov; return f;
}
const CAP_JA = { "polity:chiefdom": "首長制へ", "polity:kingdom": "王国へ", "polity:republic": "共和政へ", "polity:empire": "帝国へ", "action:found_city": "都市を建設できる", "action:build_fortification": "要塞を整備できる", "action:covert_op": "秘密工作", "action:impose_sanctions": "経済制裁", "action:nuclear_program": "核計画", "treaty:nonaggression": "不可侵条約", "treaty:alliance": "同盟", "treaty:trade": "交易条約", "unit:ranged": "弓・投射兵", "unit:cavalry": "騎兵", "unit:navy": "水軍", "unit:garrison": "守備兵", "unit:firearms": "銃兵", "unit:armor": "機甲", "unit:air": "航空", "econ:coinage": "貨幣経済", "econ:credit": "信用・金融", "subsist:agriculture": "農耕", "subsist:pastoral": "牧畜", "subsist:fishing": "漁撈", "move:sea": "海を渡る", "move:ocean": "外洋航海", "trade:land_long": "陸の遠距離交易", "trade:sea_long": "海の遠距離交易", "trade:rail": "鉄道輸送", "admin:records": "記録", "admin:officials": "官職", "admin:courier": "公の通信網", "admin:land_survey": "土地の測量", "war:far": "遠征の補給", "war:naval": "海戦", "pop:cold": "寒冷地に住める", "pop:steppe": "草原で生きる", "storage:pottery": "貯蔵", "policy:tax_high": "高い税率", "policy:parliament": "議会制" };
const FX_JA = { cap: "収容力", tax: "税収", trade: "交易", ind: "産業力", off: "攻撃", def: "防御", health: "衛生", learn: "学習・伝播" };
let TECH_LANE = null, TECH_Q = "", TECH_FULL = false, TECH_VB = null, DOC_VB = null, DOC_FULL = false;
function tTech(st, mine) {
  const c = civ(), status = techStatus(st), sel = TECH[S.tech] ?? null, q = TECH_Q.trim(), hit = q ? new Set(TECHS.filter((t) => t.name.includes(q) || t.key.includes(q) || t.field.includes(q)).map((t) => t.key)) : null;
  const tree = techTree({ techs: TECHS, status, selected: S.tech, lane: TECH_LANE, hit, vb0: TECH_VB, onView: (v) => { TECH_VB = v; }, onPick: (t) => { S.tech = t.key; S.hooks.panel(); } }), { svg, COL, SYM } = tree, s = sel && status(sel);
  const lab = { adopted: "制度化済み（この国が採用）", available: "採用できる（国内の人口の 3 割以上が知っている）", known: "保有（一部の集団だけが知る。国としてはまだ採用できない）", lost: "失われた（かつて知っていたが、今は誰も知らない）", locked: "未発見" };
  const laneBtns = [btn("すべて", () => { TECH_LANE = null; S.hooks.panel(); }, TECH_LANE ? "" : "p"), ...LANES.map((l) => btn(l.ja.slice(0, 5), () => { TECH_LANE = l.id; S.hooks.panel(); }, TECH_LANE === l.id ? "p" : ""))];
  const search = h("input", { type: "search", placeholder: "技術名・分野で探す", value: TECH_Q, style: "width:100%", oninput: (e) => { TECH_Q = e.target.value; clearTimeout(search._t); search._t = setTimeout(() => { S.hooks.panel(); document.querySelector("#tech-q")?.focus(); }, 250); }, id: "tech-q" });
  let detail = note("ノードを選ぶと、前提・成立の条件・解禁されること・効果・世界での広がりが出ます。");
  if (sel) {
    const gs = Object.values(c.groups).filter((g) => g.stateId === st.id), cov = Math.round(status.cov(sel.key) * 100), w = c.techWorld[sel.key], deps = TECHS.filter((t) => t.prereq.includes(sel.key)), gate = actionGate(c, st, "adopt_tech");
    const needs = sel.prereq.map((p) => { const t = TECH[p]; return `${st.techAdopted?.[p] != null ? "■" : status.cov(p) > 0 ? "◇" : "○"} ${t?.name ?? p}`; }).join("　");
    const unl = sel.caps.map((x) => CAP_JA[x] ?? x), fx = Object.entries(sel.fx).map(([k, v]) => `${FX_JA[k] ?? k} +${Math.round(v * 100)}%`);
    detail = h("div", { class: "dt" }, h("b", {}, sel.name), `　${sel.field}`, h("br"), `${SYM[s]} ${lab[s]}`, h("br"), `国内の普及 ${cov}%（採用には 30% 以上）`, h("br"), `前提: ${needs || "なし"}`, h("br"),
      sel.minPop || sel.settled || sel.condKey ? `成立の条件: ${[sel.minPop ? `集団の規模 ${n0(sel.minPop)} 人以上` : null, sel.settled ? "定住" : null, sel.condKey ? COND_JA(sel.condKey) : null].filter(Boolean).join("・")}` : "成立の条件: 特になし", h("br"),
      sel.why ? `背景: ${sel.why}` : "", sel.why ? h("br") : "", unl.length ? `解禁: ${unl.join("・")}` : "", unl.length ? h("br") : "", fx.length ? `効果: ${fx.join("・")}` : "", fx.length ? h("br") : "", `説明: ${sel.desc}`, h("br"),
      w ? `世界: ${w.first != null ? formatDate(civ().wcde.config.calendar, w.first) + "に初出" : ""}・独立の発見 ${w.independent ?? 0} 回・伝播 ${w.spread ?? 0} 件${Object.keys(w.byChannel ?? {}).length ? "（" + Object.entries(w.byChannel).map(([k, v]) => `${{ contact: "接触", trade: "交易", teaching: "教育", conquest: "併合" }[k] ?? k} ${v}`).join("・") + "）" : ""}` : "世界: まだ誰も発見していない", h("br"),
      deps.length ? `この技術を前提とする: ${deps.map((t) => t.name).join("・")}` : "後続の技術はない", h("br"),
      h("div", { class: "rowb" }, btn("制度化する", () => act({ type: "state.act", stateId: st.id, action: "adopt_tech", opt: sel.key }), "p", { id: "adopt-tech", disabled: !mine || s !== "available" || !gate.ok, title: mine ? (s === "available" ? "" : "今は採用できません") : "担当国のみ" })), `制度化の費用 ${sel.tier * 15}`);
  }
  // 拡大表示: 画面いっぱいに広げ、右に詳細を出す（パネルの外＝body に置く。パネルを描き直しても、拡大の状態は保つ）
  document.querySelectorAll(".techwrap.full").forEach((e) => e.remove());
  const wrap = h("div", { class: "techwrap" + (TECH_FULL ? " full" : "") }), big = btn(TECH_FULL ? "閉じる" : "拡大表示", () => { TECH_FULL = !TECH_FULL; S.hooks.panel(); });
  wrap.append(svg, h("div", { class: "rowb" }, big, btn("全体", tree.fit), btn("左端", tree.left), btn("最前線", tree.frontier), btn("選んだ技術へ", () => S.tech && tree.focus(S.tech), "", { id: "tech-goto", disabled: !S.tech }), q && hit?.size ? btn(`検索結果へ（${hit.size} 件）`, () => tree.focus([...hit][0]), "", { id: "tech-goto-hit" }) : null), detail);
  if (TECH_FULL) { document.body.append(wrap); tree.frontier(); }
  return h("div", {}, note(`技術 ${TECHS.length} 件。左から右へ時代が進み、行は分野。ドラッグで移動、ホイールで拡大縮小。`), search, h("div", { class: "rowb", style: "flex-wrap:wrap" }, ...laneBtns), TECH_FULL ? note("拡大表示中です（画面いっぱい）。右の「閉じる」で戻れます。") : wrap,
    h("div", { class: "lg" }, ...Object.entries({ adopted: "制度化", available: "採用できる", known: "保有", lost: "失われた", locked: "未発見" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "locked" ? "dashed" : "solid"} ${COL[k][0]}` }), `${SYM[k]} ${t}`))));
}
const COND_JA = (k) => COND[k]?.ja ?? k;
function tDoctrine(st, mine) {
  const M = st.military, taken = M?.doctrine?.taken ?? {}, nodes = nodesOf(st), branches = branchesOf(st), status = (d) => (taken[d.id] != null ? "taken" : canAdopt(st, d.id).ok ? "available" : "blocked"), sel = nodeOf(st, S.doc) ?? null, dt = doctrineTree({ nodes, branches, status, selected: S.doc, vb0: DOC_VB, onView: (v) => { DOC_VB = v; }, onPick: (d) => { S.doc = d.id; S.hooks.panel(); } }), { svg, COL } = dt;
  const fxText = (d) => Object.entries(d.fx).map(([k, v]) => `${DOC_FX_JA[k] ?? k} +${pct(v)}`).join("・");
  const fx = M?.fx ?? {}, now = Object.entries(fx).filter(([, v]) => v > 0).map(([k, v]) => `${DOC_FX_JA[k] ?? k} +${pct(v)}`).join("・") || "なし";
  return h("div", {}, note(`ドクトリン ${nodes.length} 件。共通 5 系統と、この国固有の 3 系統 ★（年 1 回見直し）。取得は戦争の結果に効きます。`), h("div", { class: "dt" }, `いまの効果: ${now}`), h("div", { class: "docwrap" }, svg, h("div", { class: "rowb" }, btn("全体", dt.fit, "", { id: "doc-fit" }), btn("選んだ方針へ", () => S.doc && dt.focus(S.doc), "", { id: "doc-goto", disabled: !S.doc }))),
    h("div", { class: "lg" }, ...Object.entries({ taken: "■ 取得済み", available: "◆ 取得できる", blocked: "○ 条件が足りない（点線）" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "blocked" ? "dashed" : "solid"} ${COL[k][0]}` }), t))),
    sel ? (() => { const ca = canAdopt(st, sel.id), br = branches.find((b) => b.id === sel.branch); return h("div", { class: "dt" }, h("b", {}, sel.ja), `（${br?.ja ?? ""}・段階 ${sel.tier}${sel.special ? "・固有" : "・共通"}）`, h("br"), `効果: ${fxText(sel)}・費用 ${sel.cost}`, h("br"), `前提: ${sel.prereq.length ? sel.prereq.map((p) => nodeOf(st, p)?.ja ?? p).join("、") : "なし"}${sel.tech.length ? "　技術: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("、") : ""}`, h("br"), taken[sel.id] != null ? "取得済み" : ca.ok ? "取得できます" : `取得できない理由: ${ca.reason}`, h("div", { class: "rowb" }, btn("取り入れる", () => act({ type: "state.adoptDoctrine", stateId: st.id, doctrineId: sel.id }), "p", { id: "adopt-doc", disabled: !mine || !ca.ok, title: mine ? "" : "担当国家のみ" }))); })() : note("木のノードを選ぶと、効果と前提が出ます。"));
}
