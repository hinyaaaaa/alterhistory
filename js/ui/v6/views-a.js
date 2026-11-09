// v6 UI: 地理・国家（一覧と 5 タブの詳細）。すべて Query で読み、Command で変える。
import { h, lb, stat, bar, btn, table, pct, n0, r2, face, donut, hemi, colorOf, polityJa, POLITY_JA, FACTION_JA, FACTION_COL, vlist } from "./common.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { LAYERS, GROUPS, FILL_IDS } from "./map.js";
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
import { UPRISING_KINDS } from "../../core/wcde/uprising.js";
import { openWizard } from "./wizard.js";
import { notify } from "./notify.js";
import { regimeJa, regimeOf, REGIMES, OFFICES, OFFICE_DOMAIN_JA, officeJa, defaultOffices, MIN_OFFICES, MAX_OFFICES } from "../../core/wcde/regimes.js";
import { pastView } from "../../core/civ/archive.js";
import { tPoliticsV, tMilitaryV, tDiplomacyV, nationHero } from "./nation.js";
import { confirmWar } from "./warconfirm.js";
const DOMAIN_JA = { economy: "経済", military: "軍事", politics: "政治", states: "国家", population: "人口", war_diplomacy: "外交" };
const TREATY_EFFECT = { nonaggression: "効果: 互いに宣戦できない。軍の支持がやや下がる。", alliance: "効果: 食料不足の安定低下を和らげ、貴族の支持が上がる。一方が戦うと、他方が参戦することがある。", trade: "効果: 隣接する国の間で交易が成立し、開放度に応じて産業・交易収入・商人の支持が上がる。封鎖・制裁中は成立しない。" };
const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi);
export const link = (id) => (civ().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => { e.preventDefault(); S.hooks.select(id); } }, stateName(id)) : String(id));
const note = (t) => h("p", { class: "n" }, t), why = (t) => h("p", { class: "n err", id: "why" }, t);

/* ---------- 地理: レイヤー（Azgaar 方式。各層を独立に ON/OFF。上の層ほど手前。プリセットで一括切替） ---------- */
export function pGeo() {
  const M = S.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "地理"), note("各レイヤーを自由に重ねられます。塗りの層は不透明度も変えられます。"));
  const done = () => { S.hooks.mapOnly(); S.hooks.panel(); };
  for (const [gid, ja, en] of GROUPS) {
    box.append(lb(ja, en));
    for (const [id, name] of LAYERS.filter((l) => l[2] === gid).reverse()) { // 上の層（手前）を先に
      const fill = FILL_IDS.includes(id), on = M.isOn(id);
      box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ly-" + id, checked: on, onchange: () => { M.toggle(id); done(); } }), h("span", { class: "g" }, name), fill && on ? h("input", { type: "range", class: "opa", min: 20, max: 100, value: Math.round(M.alpha[id] * 100), title: "不透明度", oninput: (e) => { M.alpha[id] = e.target.value / 100; M.interact(); } }) : null)));
    }
  }
  return box.append(note("地形・気候・資源を生成後に手で編集する機能は設けていません。"), h("div", { class: "rowb" }, btn("表示を初期位置へ", () => { M.view = { x: 0, y: 0, k: 1 }; M.draw(); }))) || box;
}

/* ---------- 一覧の共通部品（v6.4.0）: プレイヤー（担当）を最上位、存続中と滅亡を区別。カーソルを置くと地図で赤線強調 ---------- */
/** 一覧の 1 行。hl: 地図で強調する対象 { type, id } */
export function listRow(hl, kids, onclick, cls = "") {
  return h("div", { class: "lrow " + cls, onmouseenter: () => { if (S.map && hl) { S.map.hl = hl; S.map.draw(); } }, onmouseleave: () => { if (S.map) { S.map.hl = null; S.map.draw(); } }, onclick }, ...kids);
}
/** セクション見出しつきの仮想一覧。sections: [{ title, rows: [...] , collapsed? }] */
export function sectioned(sections, rowH, renderRow) {
  const rows = []; for (const sec of sections) { if (!sec.rows.length) continue; rows.push({ hdr: `${sec.title}（${sec.rows.length}）` }); if (!sec.fold || !S.fold?.[sec.fold]) for (const r of sec.rows) rows.push(r); }
  return vlist(rows, rowH, (r) => (r.hdr ? h("div", { class: "grp", style: "cursor:default" }, r.hdr) : renderRow(r)));
}
export const clearHl = () => { if (S.map) { S.map.hl = null; } };
const back = (label, on) => h("div", { class: "back", onclick: () => { clearHl(); on(); } }, "← " + label);

/* ---------- 国家: 一覧（担当国が最上位・存続中／滅亡）と詳細（一覧は詳細の下には出さない） ---------- */
export function pNations() {
  const c = civ(), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "国家"));
  if (S.detail && S.sel && c.states[S.sel]) { box.append(back("国家一覧", () => { S.detail = false; S.hooks.panel(); }), stateDetail(c.states[S.sel])); return box; }
  const mine = controlled(), all = Object.values(c.states).sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), me = all.filter((s) => s.id === mine), alive = all.filter((s) => s.alive && s.id !== mine), dead = all.filter((s) => !s.alive);
  box.append(h("p", { class: "n" }, `存続中 ${alive.length + me.length}・滅亡 ${dead.length}`), sectioned([{ title: "あなたの国", rows: me }, { title: "存続中の国家", rows: alive }, { title: "滅亡した国家", rows: dead, fold: "deadStates" }], 34, (s) => listRow({ type: "states", id: s.id }, [h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", {}, s.alive ? `人口 ${n0(s.pop)}・${regimeJa(s)}` : `滅亡・成立 ${date(s.formedAt).split("月")[0]}月`)], () => S.hooks.select(s.id), (s.id === mine ? "mine " : "") + (s.alive ? "" : "dead"))));
  return box;
}
function stateDetail(st) {
  const c = civ(), mine = controlled() === st.id, tabs = [["politics", "内政"], ["military", "軍事"], ["diplomacy", "外交"], ["tech", "技術ツリー"], ["doctrine", "軍事ドクトリン"]];
  const body = { politics: tPoliticsV, military: tMilitaryV, diplomacy: tDiplomacyV, tech: tTech, doctrine: tDoctrine }[S.tab](st, mine);
  return h("div", { class: "rs" }, nationHero(c.states[st.id], mine),
    h("div", { class: "tabs" }, ...tabs.map(([k, ja]) => h("b", { class: S.tab === k ? "on" : "", "data-tab": k, onclick: () => { S.tab = k; S.hooks.panel(); } }, ja))), S.notice ? why(S.notice) : null, body);
}
/* ---------- 官制・役職（v6.4.0）: 担当国（と創造主）は、いつでも組み替えられる ---------- */
export function officesBox(st, mine) {
  const rg = regimeOf(st), R = REGIMES[rg], offs = st.offices ?? [], can = st.alive && (mine || !controlled()), box = h("div", {}, lb("官制・役職", "OFFICES"), note(`${R.ja}・元首は${officeJa(R.ruler)}`));
  box.append(offs.length ? h("div", { class: "offs" }, ...offs.map((o) => h("div", { class: "off" }, face(o.holder.name, st.id, o.holder.look), h("div", {}, h("b", {}, officeJa(o.id)), h("small", {}, o.holder.name))))) : note("役職はまだ定められていません（標準の役職を置けます）。"));
  if (!can) return box;
  const cur = new Set(offs.length ? offs.map((o) => o.id) : defaultOffices(rg)), set = S.offEdit?.id === st.id ? S.offEdit.set : cur; S.offEdit = { id: st.id, set };
  box.append(h("details", { class: "dt", id: "off-edit" }, h("summary", {}, "役職を組み替える（いつでも・費用なし）"), h("div", { class: "wchips" }, ...R.offices.map((id) => h("label", { class: "b", style: "display:flex;gap:4px;align-items:center" }, h("input", { type: "checkbox", "data-office": id, checked: set.has(id), disabled: id === R.ruler, onchange: (e) => { e.target.checked ? set.add(id) : set.delete(id); } }), `${officeJa(id)}（${OFFICE_DOMAIN_JA[OFFICES[id][1]]}）`))), btn("この役職に改める", () => { const list = R.offices.filter((x) => set.has(x)); if (list.length < MIN_OFFICES || list.length > MAX_OFFICES) { S.notice = `役職は ${MIN_OFFICES}〜${MAX_OFFICES} 件にしてください`; S.hooks.panel(); return; } if (mine) act({ type: "state.setOffices", offices: list }); else creator({ type: "state.setOffices", stateId: st.id, offices: list }); S.offEdit = null; S.hooks.render(); }, "p", { id: "off-apply" })));
  return box;
}
/* ---------- 反乱・革命（v6.4.0）: 型を選び、中心地を地図で選ぶ。規模は WCDE が決める ---------- */
export function uprisingBox(st) {
  return h("div", {}, lb("反乱・革命", "UPRISING"), h("div", { class: "rowb" }, btn("反乱・革命を起こす", () => { S.upr = { stateId: st.id, kind: S.upr?.kind ?? Object.keys(UPRISING_KINDS)[0], open: true }; S.hooks.panel(); }, "", { id: "upr-open" })));
}
/** 反乱の作成（全面タブ）: 型を選び、中心地を地図で選び、規模・見通しを見て決行する。規模は WCDE が決める */
export function uprisingFull(st) {
  const U = S.upr, box = h("div", { class: "uprfull" }), sel = h("select", { id: "upr-kind", onchange: (e) => { U.kind = e.target.value; U.plan = null; S.hooks.panel(); } }, ...Object.entries(UPRISING_KINDS).map(([k, K]) => h("option", { value: k, selected: U.kind === k }, K.ja)));
  box.append(h("div", { class: "kcards" }, ...Object.entries(UPRISING_KINDS).map(([k, K]) => h("div", { class: "kcard" + (U.kind === k ? " on" : ""), onclick: () => { U.kind = k; U.plan = null; S.hooks.panel(); } }, h("b", {}, K.ja), h("small", {}, K.blurb)))), h("div", { class: "rowb" }, sel, btn("中心地を地図から選ぶ", () => { U.kind = sel.value; U.picking = true; U.open = false; S.map.pins = null; notify("ok", "地図で、反乱の中心地をクリックしてください（首都以外）"); S.hooks.panel(); }, "p", { id: "upr-pick" })));
  if (U.plan) {
    const p = U.plan, K = UPRISING_KINDS[p.kind], opt = K.state === "optional", st$ = K.state === "required" || (opt && U.asState);
    box.append(h("div", { class: "card", id: "upr-plan" }, h("b", {}, K.ja), h("div", { class: "pcols" }, h("div", {}, h("small", {}, "規模"), h("b", {}, p.scaleLabel), h("small", {}, `反乱側 ${n0(p.rebelPop)}（国の ${Math.round(p.share * 100)}%）`)), h("div", {}, h("small", {}, "見通し"), h("b", {}, p.oddsLabel))), opt ? h("label", { class: "n" }, h("input", { type: "checkbox", id: "upr-state", checked: !!U.asState, onchange: (e) => { U.asState = e.target.checked; S.hooks.panel(); } }), " 独立した国をつくる") : null,
      h("div", { class: "rowb" }, btn(st$ ? "国名・政体を決めて決行する" : "新しい体制を決めて決行する", () => openWizard({ mode: st$ ? "rebel" : "reform", rebel: st$ ? { stateId: st.id, kind: p.kind, cell: p.center.cell, plan: p } : null, reform: st$ ? null : { stateId: st.id, kind: p.kind, cell: p.center.cell }, onDone: (r) => { S.upr = null; if (S.map) S.map.pins = null; notify("ok", r.outcome === "new_state" ? "新しい国が独立を宣言し、戦争になりました" : r.outcome === "success" ? "革命が成功し、新しい体制になりました" : "反乱は鎮圧されました"); S.hooks.render(); } }), "p", { id: "upr-go" }))));
  }
  return box;
}
/** 創造主の介入（計算値への一時的な補正）。入力だけで画面が変わる偽装はしない: すべて有効値として下流に効く */
export function creatorBox(st) {
  const c = civ(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, `${DOMAIN_JA[f.domain ?? ({ industry: "economy", perCapita: "economy", tradeIncome: "economy", foodBalance: "economy", taxRevenue: "economy", equipLevel: "military", readiness: "military", legitimacy: "politics", fatigue: "politics" })[k]] ?? ""}・${f.ja}`))), other = h("select", { id: "iv-other", style: "display:none" }, ...aliveStates().filter((x) => x.id !== st.id).sort((a, b) => b.pop - a.pop).slice(0, 60).map((x) => h("option", { value: x.id }, x.name))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "半減期(月)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "理由の注釈" }), info = h("p", { class: "n", id: "iv-info" });
  const upd = () => { const k = field.value, pair = !!FIELDS[k].pair; other.style.display = pair ? "" : "none"; const o = pair ? other.value : null, nm = nominalOf(c, st, k, o); info.textContent = nm == null ? "まだ算出されていません" : `通常計算値 ${r2(nm)}・有効値 ${r2(effective(c, st, k, o))}・範囲 ${FIELDS[k].min}〜${FIELDS[k].max}・既定の半減期 ${FIELDS[k].half}か月`; }; field.addEventListener("change", upd); other.addEventListener("change", upd); setTimeout(upd, 0);
  const mineIv = interventionsOf(c).filter((r) => r.targetId === st.id).slice(-6).reverse();
  return h("div", {}, lb("創造主の介入", "INTERVENTION"), note("計算される値に一時的な補正を入れます。補正は時間とともに通常値へ戻りますが、介入中に起きた結果は戻りません。"), h("div", { class: "rowb" }, field, other, val, half), rsn, h("div", { class: "rowb" }, btn("介入する", () => creator({ type: "creator.intervene", stateId: st.id, field: field.value, otherId: FIELDS[field.value].pair ? other.value : null, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })), info,
    ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field}${r.otherId ? "（→" + stateName(r.otherId) + "）" : ""} → ${r2(r.target)}`, h("br"), h("small", {}, `${{ active: "有効（残り " + r2(r.residual) + "）", converged: "収束", superseded: "置き換え", cancelled: "取り消し", target_gone: "対象消滅" }[r.status]}・${date(r.startMonth)}${r.reason ? "・" + r.reason : ""}`)), r.status === "active" ? btn("取り消す", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null)));
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
      h("small", { style: "color:var(--dim)" }, "技術の採用は、世界の仕組みが自動で行います"));
  }
  // 拡大表示: 画面いっぱいに広げ、右に詳細を出す（パネルの外＝body に置く。パネルを描き直しても、拡大の状態は保つ）
  document.querySelectorAll(".techwrap.full").forEach((e) => e.remove());
  const wrap = h("div", { class: "techwrap" + (TECH_FULL ? " full" : "") }), big = btn(TECH_FULL ? "閉じる" : "拡大表示", () => { TECH_FULL = !TECH_FULL; S.hooks.panel(); });
  wrap.append(svg, h("div", { class: "rowb" }, big, btn("全体", tree.fit), btn("左端", tree.left), btn("最前線", tree.frontier), btn("選んだ技術へ", () => S.tech && tree.focus(S.tech), "", { id: "tech-goto", disabled: !S.tech }), q && hit?.size ? btn(`検索結果へ（${hit.size} 件）`, () => tree.focus([...hit][0]), "", { id: "tech-goto-hit" }) : null), detail);
  if (TECH_FULL) { document.body.append(wrap); tree.frontier(); }
  return h("div", {}, search, h("div", { class: "rowb", style: "flex-wrap:wrap" }, ...laneBtns), TECH_FULL ? note("拡大表示中です（画面いっぱい）。右の「閉じる」で戻れます。") : wrap,
    h("div", { class: "lg" }, ...Object.entries({ adopted: "制度化", available: "採用できる", known: "保有", lost: "失われた", locked: "未発見" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "locked" ? "dashed" : "solid"} ${COL[k][0]}` }), `${SYM[k]} ${t}`))));
}
const COND_JA = (k) => COND[k]?.ja ?? k;
function tDoctrine(st, mine) {
  const M = st.military, taken = M?.doctrine?.taken ?? {}, nodes = nodesOf(st), branches = branchesOf(st), status = (d) => (taken[d.id] != null ? "taken" : canAdopt(st, d.id).ok ? "available" : "blocked"), sel = nodeOf(st, S.doc) ?? null, dt = doctrineTree({ nodes, branches, status, selected: S.doc, vb0: DOC_VB, onView: (v) => { DOC_VB = v; }, onPick: (d) => { S.doc = d.id; S.hooks.panel(); } }), { svg, COL } = dt;
  const fxText = (d) => Object.entries(d.fx).map(([k, v]) => `${DOC_FX_JA[k] ?? k} +${pct(v)}`).join("・");
  const fx = M?.fx ?? {}, now = Object.entries(fx).filter(([, v]) => v > 0).map(([k, v]) => `${DOC_FX_JA[k] ?? k} +${pct(v)}`).join("・") || "なし";
  return h("div", {}, h("div", { class: "dt" }, `いまの効果: ${now}`), h("div", { class: "docwrap" }, svg, h("div", { class: "rowb" }, btn("全体", dt.fit, "", { id: "doc-fit" }), btn("選んだ方針へ", () => S.doc && dt.focus(S.doc), "", { id: "doc-goto", disabled: !S.doc }))),
    h("div", { class: "lg" }, ...Object.entries({ taken: "■ 取得済み", available: "◆ 取得できる", blocked: "○ 条件が足りない（点線）" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "blocked" ? "dashed" : "solid"} ${COL[k][0]}` }), t))),
    sel ? (() => { const ca = canAdopt(st, sel.id), br = branches.find((b) => b.id === sel.branch); return h("div", { class: "dt" }, h("b", {}, sel.ja), `（${br?.ja ?? ""}・段階 ${sel.tier}${sel.special ? "・固有" : "・共通"}）`, h("br"), `効果: ${fxText(sel)}・費用 ${sel.cost}`, h("br"), `前提: ${sel.prereq.length ? sel.prereq.map((p) => nodeOf(st, p)?.ja ?? p).join("、") : "なし"}${sel.tech.length ? "　技術: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("、") : ""}`, h("br"), taken[sel.id] != null ? "取得済み" : ca.ok ? "取得できます" : `取得できない理由: ${ca.reason}`, h("small", { style: "color:var(--dim)" }, "取得は、世界の仕組みが自動で行います")); })() : note("木のノードを選ぶと、効果と前提が出ます。"));
}
