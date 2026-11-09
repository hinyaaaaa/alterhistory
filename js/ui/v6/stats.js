// v6.5.0: 統計。ランキングの羅列をやめ、円グラフ・棒グラフ・ツリーマップのダッシュボードにする（実データ・基準は各カードのタイトル横に短く）。
import { h, n0, colorOf } from "./common.js";
import { S, aliveStates, controlled } from "./store.js";
import { pie, hbars, treemap, icon } from "./visual.js";
import { strength } from "../../core/civ/diplomacy.js";
import { formatWorldDate } from "../../core/wcde/world.js";

const card = (title, sub, body) => h("div", { class: "scard" }, h("div", { class: "sct" }, h("b", {}, title), h("small", {}, sub)), body);
export function pStats() {
  const c = S.w.civ, A = aliveStates(), mine = controlled(), cs = c.states, hl = (id) => { if (S.map) { S.map.hl = id ? { type: "states", id } : null; S.map.draw(); } }, pick = (id) => S.hooks.select(id);
  const area = new Map(); for (const g of Object.values(c.groups)) if (g.stateId) { let k = 0; for (const ce of g.cells?.length ? g.cells : [g.cell]) k += S.w.world.cell.areaKm2[ce] ?? 0; area.set(g.stateId, (area.get(g.stateId) ?? 0) + k); }
  const totPop = A.reduce((a, s) => a + s.pop, 0), totArmy = A.reduce((a, s) => a + s.army, 0), wars = c.activeWarIds.length;
  const head = h("div", { class: "kpis" }, ...[["pop", "世界の人口（国家）", n0(totPop)], ["flag", "存続する国家", n0(A.length)], ["sword", "世界の兵力", n0(totArmy)], ["globe", "進行中の戦争", n0(wars)]].map(([ic, l, v]) => h("div", { class: "kpi" }, icon(ic, 18), h("small", {}, l), h("b", {}, v))));
  const sItems = (f) => A.map((s) => ({ id: s.id, label: s.name, value: f(s), color: colorOf(s.id), mine: s.id === mine }));
  const dist = (key, tab) => { const m = new Map(); for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) { const id = co[key]; if (id) m.set(id, (m.get(id) ?? 0) + g.pop * co.share); } return [...m].map(([id, v]) => ({ label: tab[id]?.name ?? id, value: v, color: colorOf(id) })); };
  return h("div", { class: "stats" }, h("div", { class: "code" }, "STATISTICS"), h("h2", {}, "統計"), h("small", { class: "n" }, formatWorldDate(S.w)), head,
    card("人口", "国家ごとの割合", pie(sItems((s) => s.pop), { size: 140, center: n0(totPop), onPick: pick })),
    card("軍事力", "兵力 × 軍事能力 × 防御", hbars(sItems((s) => strength(c, s)), { onPick: pick, onHover: hl })),
    card("国土", "面積（km²）", treemap(sItems((s) => area.get(s.id) ?? 0), { onPick: pick, fmt: (v) => n0(v) + " km²" })),
    card("文化", "世界の人口の構成", pie(dist("cultureId", c.cultures), { size: 120 })),
    card("宗教", "世界の人口の構成", pie(dist("religionId", c.religions), { size: 120 })),
    card("言語", "世界の人口の構成", pie(dist("languageId", c.languages), { size: 120 })));
  void cs;
}
