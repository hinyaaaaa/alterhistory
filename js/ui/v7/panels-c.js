// v7 左パネル（創造主のモード）: 世界・国々・軍と戦争・外交・年表・介入。「内政」は置かない。国は担当国を先頭にせず、すべて同じ扱いで並べる。
import { H2, H3, Btn, Card, Row, Tabs, Mut, Table, h, n0, pct } from "./ui.js";
import { S, run, creator, stateName, aliveStates } from "../v6/store.js";
import { colorOf, polityJa } from "../v6/common.js";
import { civ, legacy } from "./panels-common.js";
import { relationMatrix, pChron } from "./panels-p.js";
import { totalPower } from "../../core/wcde/power.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { regimeJa } from "../../core/wcde/regimes.js";
import { pWar } from "../v6/war.js";
import { pDiplo } from "../v6/diplo.js";
import { pStats } from "../v6/stats.js";
import { pEntity, catastropheBox } from "../v6/views-b.js";
import { creatorBox, uprisingBox } from "../v6/views-a.js";
import { allianceBlocs } from "../v6/alliance.js";
import { openWizard } from "../v6/wizard.js";
import { notify } from "../v6/notify.js";
import { clearHl } from "../v6/views-a.js";

/** 世界の概況 */
export function pWorldC() {
  const c = civ(), box = h("div", {}, H2("01", "世界")), al = aliveStates(), pop = al.reduce((a, s) => a + s.pop, 0) || 1;
  const wars = Object.values(c.wars).filter((x) => x.status === "active");
  box.append(h("div", { class: "v-g3" }, h("div", {}, h("b", {}, n0(pop)), h("span", {}, "世界の人口")), h("div", {}, h("b", {}, al.length), h("span", {}, "存続する国")), h("div", {}, h("b", {}, wars.length), h("span", {}, "進行中の戦争"))));
  const top = [...al].sort((x, y) => y.pop - x.pop).slice(0, 8), rest = pop - top.reduce((a, s) => a + s.pop, 0);
  box.append(H3("人口の比"), h("div", { style: "display:flex;height:12px;gap:1px;margin-bottom:8px" }, ...top.map((s) => h("i", { style: `flex:${s.pop};background:${colorOf(s.id)}`, title: `${s.name} ${pct(s.pop / pop)}` })), rest > 0 ? h("i", { style: `flex:${rest};background:#445` }) : null));
  for (const s of top.slice(0, 5)) box.append(Row({ color: colorOf(s.id), title: s.name, small: pct(s.pop / pop), onclick: () => S.hooks.select(s.id) }));
  const tab = S.worldTab ?? "stats";
  box.append(H3("統計・文化・言語・宗教"), Tabs([["stats", "統計"], ["culture", "文化"], ["language", "言語"], ["religion", "宗教"]], tab, (k) => { S.worldTab = k; S.hooks.panel(); }), legacy(tab === "stats" ? pStats() : pEntity(tab)));
  return box;
}

/** 国々: 全国を同じ扱いで並べる表（見出しを押して並べ替え）。担当国を先頭に置かない */
export function pNationsC() {
  const c = civ(), box = h("div", {}, H2("02", "国々")), al = aliveStates();
  const rows = al.map((s) => ({ id: s.id, s, name: s.name, pop: s.pop, treasury: s.treasury, stab: s.stability * 100, power: (() => { try { return totalPower(c, s); } catch { return 0; } })(), leg: s.politics ? effective(c, s, "legitimacy") * 100 : 0, __enter: () => { if (S.map) { S.map.hl = { type: "states", id: s.id }; S.map.draw(); } }, __leave: () => { if (S.map) { S.map.hl = null; S.map.draw(); } } }));
  const sort = (S.natSort ??= { k: "pop", d: -1 });
  const cols = [
    { k: "name", ja: "国", get: (r) => r.name, render: (r) => h("span", {}, h("i", { class: "v-dt", style: `--c:${colorOf(r.id)}` }), r.name) },
    { k: "pop", ja: "人口", get: (r) => r.pop, fmt: (v) => n0(v / 10000) + "万" },
    { k: "treasury", ja: "国庫", get: (r) => r.treasury, fmt: n0 },
    { k: "stab", ja: "安定", get: (r) => r.stab, fmt: (v) => Math.round(v) },
    { k: "power", ja: "軍事力", get: (r) => r.power, fmt: n0 },
    { k: "leg", ja: "正統", get: (r) => r.leg, fmt: (v) => Math.round(v) },
  ];
  box.append(Table(cols, rows, { sort: sort.k, dir: sort.d, onsort: (k) => { S.natSort = { k, d: sort.k === k ? -sort.d : -1 }; S.hooks.panel(); }, onrow: (r) => S.hooks.select(r.id), selected: S.sel }));
  const dead = Object.values(c.states).filter((s) => !s.alive);
  box.append(Mut(`存続 ${al.length}・滅亡 ${dead.length}`), h("div", { class: "v-acts" }, Btn("国をつくる", () => openWizard({ mode: "creator", onDone: (r) => { S.sel = r.stateId; notify("ok", "新しい国が生まれました"); S.hooks.render(); } }), "", { id: "cr-found", size: "s" })));
  if (dead.length) {
    box.append(H3("滅亡した国", `${dead.length}`));
    for (const s of dead.sort((x, y) => (y.dissolvedAt ?? 0) - (x.dissolvedAt ?? 0)).slice(0, 30)) box.append(Row({ color: "#556", title: s.name, small: "滅亡", onclick: () => S.hooks.select(s.id) }));
  }
  return box;
}
export function pWarC() {
  const box = h("div", {}, H2("03", "軍と戦争"));
  box.append(H3("戦争"), legacy(pWar()));
  return box;
}
export function pDiploC() {
  const c = civ(), box = h("div", {}, H2("04", "外交")), al = aliveStates().sort((x, y) => y.pop - x.pop);
  if (al.length) box.append(H3("全国の関係", "大きい国から12か国"), relationMatrix(al[0].id, 11));
  box.append(H3("条約・使節・制裁"), legacy(pDiplo()));
  return box;
}
export { pChron as pChronC };
/** 介入: 国への介入・反乱・革命、国をつくる、災厄、時代の追加など */
export function pIntervene() {
  const c = civ(), box = h("div", {}, H2("06", "介入")), al = aliveStates().sort((x, y) => y.pop - x.pop);
  const pick = h("select", { id: "cr-state", class: "v-in", onchange: (e) => { S.crSel = e.target.value; S.hooks.panel(); } }, ...al.slice(0, 160).map((s) => h("option", { value: s.id, selected: s.id === (S.crSel ?? S.sel) }, s.name)));
  const st = c.states[S.crSel ?? pick.value];
  box.append(H3("国への介入・反乱・革命"), h("div", { class: "v-fd" }, pick), h("div", { class: "v-acts", style: "margin-top:0;margin-bottom:10px" }, Btn("その国を開く", () => pick.value && S.hooks.select(pick.value), "g", { size: "s" }), Btn("担当する", () => { if (pick.value) { run({ type: "control.take", stateId: pick.value }); S.sel = pick.value; S.hooks.render(); } }, "g", { size: "s", id: "take-pick" })));
  if (st?.alive) box.append(legacy(h("div", { class: "crtarget" }, creatorBox(st), uprisingBox(st))));
  box.append(H3("国をつくる"), Btn("国をつくる", () => openWizard({ mode: "creator", onDone: (r) => { S.sel = r.stateId; notify("ok", "新しい国が生まれました"); S.hooks.render(); } }), "", { wide: true, id: "cr-found2" }), H3("災厄・時代・暦"), legacy(catastropheBox()));
  return box;
}
