// v7 左パネル（担当国のモード）: 状況・内政・軍と戦争・外交・世界・年表。値を変えるだけの操作はここ（滑り棒）。
//   1 回の決定は確認カード、集中して作る作業は全面画面（screens.js）。docs/UI_RULES.md §4。
import { H2, H3, Btn, Card, Row, Chips, Tabs, Mut, Slider, Spark, Gauge, Ring, Delta, h, n0, pct } from "./ui.js";
import { S, act, creator, stateName, aliveStates, controlled } from "../v6/store.js";
import { colorOf, polityJa, FACTION_JA, FACTION_COL } from "../v6/common.js";
import { civ, me, legacy, relOf, REL_NAME, REL_COL, REL_TAG, CAT, chronicle } from "./panels-common.js";
import { sample, prevOf } from "./series.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { FINANCE } from "../../core/wcde/identity.js";
import { regimeJa } from "../../core/wcde/regimes.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { atWarWith } from "../../core/civ/diplomacy.js";
import { pendingOf } from "../../core/wcde/decision-state.js";
import { officesBox } from "../v6/views-a.js";
import { policyBox } from "../v6/policy.js";
import { pMilitary } from "../v6/military.js";
import { pWar } from "../v6/war.js";
import { pDiplo } from "../v6/diplo.js";
import { allianceBlocs, blocName } from "../v6/alliance.js";
import { pStats } from "../v6/stats.js";
import { pEntity } from "../v6/views-b.js";
import { openNationFull, openTech, openDoctrine, openInfoEdit } from "./screens.js";
import { stateFlagEl } from "../v6/flagview.js";

/* ---------- 状況 ---------- */
/** 対応が必要なこと（レールの数字にも使う）。実際の状態から導く */
export function alertsOf(st) {
  const c = civ(), out = [];
  if (!st) return out;
  for (const wid of st.warIds ?? []) {
    const w = c.wars[wid];
    if (!w || w.status !== "active") continue;
    const foe = [...w.sides.a, ...w.sides.d].filter((x) => x !== st.id)[0];
    out.push({ c: "var(--dn)", t: `${w.name ?? stateName(foe) + "との戦争"}が続いている`, s: "戦争", go: () => { S.hub = "war"; S.war = w.id; S.hooks.render(); } });
  }
  if (st.stability < 0.35) out.push({ c: "var(--dn)", t: `安定度が低い（${Math.round(st.stability * 100)}）`, s: "内政", go: () => { S.hub = "domestic"; S.hooks.render(); } });
  if (st.treasury < 0) out.push({ c: "var(--dn)", t: "国庫が赤字", s: "内政", go: () => { S.hub = "domestic"; S.hooks.render(); } });
  const leg = st.politics ? effective(c, st, "legitimacy") : 1;
  if (leg < 0.35) out.push({ c: "var(--wa)", t: `正統性が低い（${Math.round(leg * 100)}）`, s: "内政", go: () => { S.hub = "domestic"; S.hooks.render(); } });
  const pend = pendingOf(c).length;
  if (pend) out.push({ c: "var(--wa)", t: `決断が${pend}件、待っている`, s: "決断", go: () => S.hooks.render() });
  return out;
}
const chg = (label, value, d, prev, series, parts, color) =>
  h("div", { class: "v-card v-chg" }, h("div", { class: "v-ch1" }, h("span", {}, label), Spark(series, { color })), h("div", { class: "v-ch2" }, h("b", {}, value), d, h("small", {}, prev)), parts.length ? h("div", { class: "v-parts" }, ...parts.map(([k, v]) => h("span", {}, h("i", {}, k), v))) : null);
const totalSupport = (P) => {
  const rows = Object.values(P?.factions ?? {}), w = rows.reduce((a, x) => a + x.influence, 0) || 1;
  return rows.reduce((a, x) => a + x.support * x.influence, 0) / w;
};
export function pStatus() {
  const st = me(), c = civ(), box = h("div", {}, H2("01", "状況"));
  if (!st) return box;
  const a = sample(c, st), cur = a.at(-1), pv = prevOf(a), al = alertsOf(st);
  box.append(H3("対応が必要", al.length ? `${al.length}件` : null));
  if (!al.length) box.append(Mut("いま対応が必要なことはありません。"));
  for (const x of al.slice(0, 5)) box.append(Row({ color: x.c, title: x.t, small: x.s, onclick: x.go }));
  box.append(H3("先月の変化", pv ? "前月との差" : "月が進むと差が出ます"));
  const dd = (k) => (pv ? cur[k] - pv[k] : null), ser = (k) => a.map((x) => x[k]);
  const money = cur.tax + cur.trade;
  box.append(
    chg("税収（月額）", n0(money), Delta(pv ? money - (pv.tax + pv.trade) : null, { digits: 0 }), pv ? `前月 ${n0(pv.tax + pv.trade)}` : "", a.map((x) => x.tax + x.trade), [["税", "+" + n0(cur.tax)], ["交易", "+" + n0(cur.trade)]], "#7fc29a"),
    chg("安定度", Math.round(cur.stability * 100), Delta(pv ? dd("stability") * 100 : null, { digits: 0 }), pv ? `前月 ${Math.round(pv.stability * 100)}` : "", ser("stability"), [], "#e0806f"),
    chg("国庫", n0(cur.treasury), Delta(dd("treasury"), { digits: 0 }), pv ? `前月 ${n0(pv.treasury)}` : "", ser("treasury"), [], "#9db4c0"),
  );
  const P = st.politics;
  if (P) {
    const tot = totalSupport(P), rows = Object.entries(P.factions ?? {}).sort((x, y) => y[1].influence - x[1].influence), inf = rows.reduce((q, [, v]) => q + v.influence, 0) || 1;
    box.append(
      H3("支持層"),
      h("div", { class: "v-card v-sup" }, Ring(tot, "総合支持"), h("div", { style: "flex:1;min-width:0" }, ...rows.slice(0, 6).map(([k, v]) => h("div", { class: "v-sr", title: `影響 ${pct(v.influence)}・支持 ${pct(v.support)}` }, h("span", {}, `${FACTION_JA[k] ?? k} ${Math.round((v.influence / inf) * 100)}%`), Gauge(v.support, FACTION_COL[k] ?? "#9db4c0"), h("em", {}, Math.round(v.support * 100)))))),
    );
  }
  box.append(H3("国の情報"), h("div", { class: "v-acts", style: "margin-top:0" }, Btn("国名・政体・指導者・国旗", () => openInfoEdit(st.id), "g", { size: "s" }), Btn("国の詳細", () => openNationFull(st.id), "g", { size: "s" })));
  return box;
}

/* ---------- 内政 ---------- */
export function pDomestic() {
  const st = me(), c = civ(), box = h("div", {}, H2("02", "内政"));
  if (!st) return box;
  const sample_ = sample(c, st).at(-1), money = sample_.tax + sample_.trade;
  box.append(H3("財政", "割合を滑り棒で決める"));
  for (const key of ["tax", "mobilization", "tolerance", "assimilation", "autonomy"]) {
    const F = FINANCE[key];
    box.append(Slider({ label: F.ja, min: F.min, max: F.max, step: F.step, value: st.policy[key], fmt: (v) => Math.round(v * 100) + "%", id: "fin-" + key, onchange: (v) => { act({ type: "state.setFinance", stateId: st.id, key, value: v }); S.hooks.panel(); } }));
  }
  box.append(h("div", { class: "v-card", style: "display:flex;justify-content:space-between;align-items:baseline" }, h("span", { class: "v-mut" }, "月の収入（税＋交易）"), h("b", { class: "v-num", style: "font-size:22px;color:var(--ok)" }, "+" + n0(money))));
  box.append(H3("技術と軍事ドクトリン"), h("div", { class: "v-acts", style: "margin-top:0" }, Btn("技術ツリー", () => openTech(st.id), "g", { size: "s", id: "open-tech" }), Btn("軍事ドクトリン", () => openDoctrine(st.id), "g", { size: "s", id: "open-doctrine" })));
  box.append(H3("役職・政策"), legacy(h("div", {}, officesBox(st, true), st.alive ? policyBox(st, true) : null)));
  return box;
}

/* ---------- 軍と戦争 ---------- */
export function pWarP() {
  const box = h("div", {}, H2("03", "軍と戦争"));
  box.append(H3("戦争"), legacy(pWar()), H3("軍団・兵科"), legacy(pMilitary()));
  return box;
}

/* ---------- 外交 ---------- */
/** 関係表（行と列に国。自国を先頭に、関係のある国・大きい国の順で最大 11 か国） */
export function relationMatrix(baseId, cap = 11) {
  const c = civ(), base = c.states[baseId], all = aliveStates();
  const rel = new Map(all.map((s) => [s.id, s === base ? { k: "x" } : relOf(c, base, s)]));
  const list = [base, ...all.filter((s) => s !== base).sort((x, y) => (rel.get(y.id).k !== "-") - (rel.get(x.id).k !== "-") || y.pop - x.pop).slice(0, cap)];
  const cell = (A, B) => {
    if (A === B) return h("i", { class: "v-mc d" });
    const r = relOf(c, A, B);
    return h("i", { class: "v-mc x" + r.k, title: `${A.name} と ${B.name}: ${REL_NAME[r.k]}${r.ja ? "（" + r.ja + "）" : ""}` }, "");
  };
  const g = h("div", { class: "v-mx", style: `grid-template-columns:128px repeat(${list.length},1fr)` }, h("span"));
  for (const s of list) g.append(h("span", { class: "v-mh", style: `--c:${colorOf(s.id)}`, title: s.name }, s.name));
  for (const A of list) {
    g.append(h("span", { class: "v-ml" + (A === base ? " me" : ""), onclick: () => S.hooks.select(A.id), title: A.name }, A.name));
    for (const B of list) g.append(cell(A, B));
  }
  const leg = h("div", { class: "v-leg" }, ...["a", "f", "n", "v", "h"].map((k) => h("span", {}, h("i", { class: "v-mc x" + k }), REL_NAME[k])));
  return h("div", {}, g, leg);
}
export function pDiploP() {
  const st = me(), c = civ(), box = h("div", {}, H2("04", "外交"));
  if (!st) return box;
  box.append(H3("関係の一覧", "条約と戦争から導く"), relationMatrix(st.id));
  const blocs = allianceBlocs(c);
  if (blocs.length) {
    box.append(H3("陣営"));
    for (const b of blocs.slice(0, 6)) {
      const warring = b.members.some((id) => c.states[id].warIds?.some((w) => c.wars[w]?.status === "active"));
      box.append(h("div", { class: "v-card", style: "margin-bottom:8px" }, h("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px" }, h("b", { style: "font:700 14px var(--mi)" }, blocName(c, b)), warring ? h("span", { class: "v-tag v-t-h" }, "交戦中") : null, h("small", { class: "v-mut", style: "margin-left:auto" }, `${b.members.length}か国`)), ...b.members.slice(0, 8).map((id) => h("div", { class: "v-bm", onclick: () => S.hooks.select(id) }, h("i", { class: "v-dt", style: `--c:${colorOf(id)}` }), stateName(id), id === b.leader ? h("small", { class: "v-t-a" }, "盟主") : null))));
    }
  }
  box.append(H3("条約・使節・制裁"), legacy(pDiplo()));
  return box;
}

/* ---------- 世界 ---------- */
export function pWorldP() {
  const box = h("div", {}, H2("05", "世界")), tab = S.worldTab ?? "stats";
  box.append(Tabs([["stats", "統計"], ["culture", "文化"], ["language", "言語"], ["religion", "宗教"]], tab, (k) => { S.worldTab = k; S.hooks.panel(); }));
  box.append(legacy(tab === "stats" ? pStats() : pEntity(tab)));
  return box;
}

/* ---------- 年表 ---------- */
export function pChron() {
  const box = h("div", {}, H2("06", "年表")), f = (S.chronF ??= { w: 1, i: 1, d: 1, m: 1 }), n = (S.chronN ??= 40), all = S.chronAll ?? false;
  box.append(h("div", {}, ...Object.entries(CAT).map(([k, [ja]]) => h("span", { class: "v-chip" + (f[k] ? " on" : ""), onclick: () => { f[k] = f[k] ? 0 : 1; S.hooks.panel(); } }, ja)), h("span", { class: "v-chip" + (all ? " on" : ""), onclick: () => { S.chronAll = !all; S.hooks.panel(); } }, "細かい出来事も")));
  const list = chronicle(n, { cats: f, major: !all });
  if (!list.length) box.append(Mut("条件に合う出来事はありません。"));
  for (const { ev, cat } of list) {
    const col = CAT[cat][1], who = (ev.participants ?? []).map((p) => p.entityId).filter((id) => civ().states[id]);
    box.append(h("div", { class: "v-ev", style: `--c:${col}` }, h("div", { class: "yr" }, String(ev.date.year), h("small", {}, `${ev.date.month}月`)), h("div", { class: "rl" }, h("i")), h("div", { class: "bd" }, h("b", {}, ev.title ?? ev.kind), ev.why ? h("p", { class: "why" }, "因: " + ev.why) : null, who.length ? h("p", {}, ...who.slice(0, 4).map((id) => h("a", { class: "lk", href: "#", style: "margin-right:8px", onclick: (e) => { e.preventDefault(); S.hooks.select(id); } }, stateName(id)))) : null)));
  }
  if (list.length >= n) box.append(Btn("さらに表示", () => { S.chronN = n + 60; S.hooks.panel(); }, "g", { wide: true }));
  return box;
}
