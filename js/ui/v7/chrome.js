// v7 の外枠の中身: 上部バー（指標・時計・モード）・レール・地図の道具（表示・検索）・国のカード・歯車メニュー。
//   世界を変えるのは run / act / creator だけ。ここは表示と、操作の入口。docs/UI_RULES.md §2。
import { h, Btn, Row, H3, Mut, n0, pct, Delta } from "./ui.js";
import { iconSvg, speedSvg, logoSvg } from "./icons.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "../v6/store.js";
import { colorOf, polityJa } from "../v6/common.js";
import { stateFlagEl } from "../v6/flagview.js";
import { SPEEDS, timeOf } from "../../core/wcde/clock.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { eraLabel, eraOf } from "../../core/wcde/calendar.js";
import { totalPower } from "../../core/wcde/power.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { LAYERS, GROUPS, FILL_IDS } from "../v6/map.js";
import { civ, me } from "./panels-common.js";
import { sample, prevOf } from "./series.js";
import { alertsOf } from "./panels-p.js";
import { openNationFull, openInfoEdit } from "./screens.js";
import { openDialog, closeDialog } from "./frame.js";
import { confirmWar } from "../v6/warconfirm.js";
const $ = (s) => document.querySelector(s);

/** 入口。key は S.hub の値 */
export const ENTRIES = {
  p: [["status", "状況", "status"], ["domestic", "内政", "domestic"], ["war", "軍と戦争", "war"], ["diplo", "外交", "diplo"], ["world", "世界", "world"], ["chron", "年表", "chron"]],
  c: [["world", "世界", "world"], ["nations", "国々", "nations"], ["war", "軍と戦争", "war"], ["diplo", "外交", "diplo"], ["chron", "年表", "chron"], ["intervene", "介入", "intervene"]],
};
export const modeOf = () => (controlled() ? "p" : "c");
export const entryOf = () => {
  const list = ENTRIES[modeOf()];
  return list.some(([k]) => k === S.hub) ? S.hub : list[0][0];
};

/* ---------- 上部バー ---------- */
const metric = (label, value, unit, d) => h("div", { class: "v-m" }, h("span", {}, label), h("b", {}, value, unit ? h("small", {}, unit) : null, d));
export function renderTop() {
  const w = S.w, c = w.civ, st = me(), T = timeOf(c), top = $("#top");
  if (!top) return;
  let left;
  if (st) {
    const a = sample(c, st), cur = a.at(-1), pv = prevOf(a), dd = (k, s = 1) => (pv ? (cur[k] - pv[k]) * s : null);
    const pctDelta = pv && pv.pop ? ((cur.pop - pv.pop) / pv.pop) * 100 : null;
    left = [
      h("div", { class: "v-me" }, h("div", { class: "v-flagbox" }, stateFlagEl(st, 34)), h("div", {}, h("b", {}, st.name), h("small", {}, `${polityJa(st.polity)} ・ ${st.leader?.name ?? "—"}`))),
      h("div", { class: "v-sep", style: "margin:0 8px" }),
      h("div", { class: "v-mt", id: "metrics" },
        metric("人口", n0(Math.round(st.pop / 10000)), "万", Delta(pctDelta, { digits: 1, unit: "%" })),
        metric("国庫", n0(st.treasury), "", Delta(dd("treasury"), { digits: 0 })),
        metric("安定度", Math.round(st.stability * 100), "", Delta(dd("stability", 100), { digits: 0 })),
        metric("軍事力", n0(cur.power), "", Delta(dd("power"), { digits: 0 })),
        metric("正統性", Math.round(cur.legit * 100), "", Delta(dd("legit", 100), { digits: 0 }))),
    ];
  } else {
    const al = aliveStates(), pop = al.reduce((x, s) => x + s.pop, 0), wars = Object.values(c.wars).filter((x) => x.status === "active").length, avg = al.length ? al.reduce((x, s) => x + s.stability, 0) / al.length : 0;
    left = [
      h("div", { class: "v-me" }, h("div", {}, h("b", {}, c.wcde.config.name || "名もなき世界"), h("small", {}, "担当国なし（見守り）"))),
      h("div", { class: "v-sep", style: "margin:0 8px" }),
      h("div", { class: "v-mt", id: "metrics" }, metric("世界の人口", n0(Math.round(pop / 10000)), "万"), metric("国数", al.length, ""), metric("進行中の戦争", wars, ""), metric("平均安定度", Math.round(avg * 100), "")),
    ];
  }
  const era = eraLabel(c.wcde.config.calendar, c.monthIndex), speed = T.hold ? T.resumeSpeed : T.speed;
  top.replaceChildren(
    h("div", { class: "v-logo" }, logoSvg(), h("div", { class: "v-wm" }, h("b", {}, "ALTER", h("i", {}, "HISTORY")), h("small", {}, "改変歴史"))),
    h("div", { class: "v-sep" }),
    h("div", { id: "tl", style: "display:flex;align-items:center;min-width:0" }, ...left),
    h("div", { class: "v-sp" }),
    h("div", { id: "vclock" },
      h("div", { id: "date", title: c.wcde.config.name ?? "" }, ...dateParts(w), era && !eraOf(c.wcde.config.calendar, c.monthIndex)?.restart ? h("small", { id: "era" }, era) : null),
      h("div", { class: "v-seg", id: "spd" }, ...SPEEDS.map((s) => h("button", { class: speed === s.id ? "on" : "", "data-speed": s.id, title: s.id ? `${s.mps} か月／秒` : "停止", onclick: () => { run({ type: "clock.setSpeed", speed: s.id }); S.hooks.clock?.(); } }, speedSvg(s.id))))),
    h("div", { class: "v-sep" }),
    h("div", { id: "mode", class: st ? "" : "c" }, h("button", { class: st ? "on" : "", "data-m": "p", onclick: () => toPlayer() }, "担当国"), h("button", { class: st ? "" : "on", "data-m": "c", onclick: () => toCreator() }, "創造主")),
    h("button", { class: "v-ib", id: "gear", title: "設定", onclick: () => toggleGear() }, iconSvg("gear", 18)),
  );
}
/** 日付を「102年 7月」の形に（年と月を分けて大きさを変える） */
function dateParts(w) {
  const t = formatWorldDate(w), m = /^(.*?年)\s*(\d+月)?/.exec(t);
  if (!m) return [t];
  return [h("b", {}, m[1].replace("年", "")), "年", m[2] ? " " : "", m[2] ? h("b", { style: "font-size:17px" }, m[2].replace("月", "")) : "", m[2] ? "月" : ""];
}
export function toCreator() {
  if (!controlled()) return;
  run({ type: "control.release" });
  S.hub = "world";
  S.hooks.render();
}
/** 担当国のモードへ。担当国がなければ、担当する国を選ぶ */
export function toPlayer() {
  if (controlled()) return;
  const list = aliveStates().sort((a, b) => b.pop - a.pop);
  let pick = S.crSel && civ().states[S.crSel]?.alive ? S.crSel : list[0]?.id;
  openDialog({
    title: "担当する国を選ぶ",
    build: () => h("div", { class: "v-scroll" }, ...list.slice(0, 80).map((s) => Row({ color: colorOf(s.id), title: s.name, sub: polityJa(s.polity), small: `人口 ${n0(s.pop / 10000)}万`, onclick: () => { closeDialog(); run({ type: "control.take", stateId: s.id }); S.sel = s.id; S.hub = "status"; S.hooks.render(); } }))),
  });
}

/* ---------- レール ---------- */
export function renderRail() {
  const mode = modeOf(), cur = entryOf(), st = me(), n = st ? alertsOf(st).length : 0;
  $("#rail").replaceChildren(
    ...ENTRIES[mode].map(([k, ja, ic]) =>
      h("button", { class: "v-rb" + (cur === k ? " on" : ""), "data-hub": k, title: ja, onclick: () => { S.hub = k; S.detail = false; S.war = null; S.upr = null; S.dip = null; S.screen = null; S.corpsNew = null; S.corpsSel = null; S.edit = null; S.entity = { culture: null, language: null, religion: null }; if (S.map) S.map.hl = null; S.hooks.render(); } }, iconSvg(ic), ja, k === "status" && n ? h("u", {}, n) : null),
    ),
  );
}

/* ---------- 表示（18 層）と検索 ---------- */
export function renderLayers() {
  const M = S.map, box = $("#lay");
  if (!M || !box) return;
  box.replaceChildren(
    ...GROUPS.flatMap(([gid, ja]) => [
      h("h3", { class: "v-h3" }, ja),
      ...LAYERS.filter((l) => l[2] === gid).reverse().map(([id, name]) => {
        const fill = FILL_IDS.includes(id), on = M.isOn(id);
        return h("label", {}, h("input", { type: "checkbox", id: "ly-" + id, checked: on, onchange: () => { M.toggle(id); S.hooks.mapOnly(); renderLayers(); } }), name, fill && on ? h("input", { type: "range", class: "opa", min: 20, max: 100, value: Math.round(M.alpha[id] * 100), title: "不透明度", style: "flex:1;margin-left:6px", oninput: (e) => { M.alpha[id] = e.target.value / 100; M.interact(); } }) : null);
      }),
    ]),
    h("div", { style: "margin-top:12px" }, Btn("表示を初期位置へ", () => { M.view = { x: 0, y: 0, k: 1 }; M.draw(); }, "g", { size: "s", wide: true })),
  );
}
export function renderSearch() {
  const box = $("#srch"), c = civ(), q = (S.q ?? "").trim();
  if (!box) return;
  const inp = h("input", { type: "text", class: "v-in", id: "search-q", placeholder: "国・都市の名前", value: S.q ?? "", oninput: (e) => { S.q = e.target.value; fill(); } });
  const res = h("div", { style: "margin-top:10px" });
  const fill = () => {
    const t = (S.q ?? "").trim();
    res.replaceChildren();
    if (!t) return res.append(Mut("名前の一部を入れてください。"));
    const sts = Object.values(c.states).filter((s) => s.name.includes(t)).slice(0, 8), sets = Object.values(c.settlements).filter((s) => s.name && s.name.includes(t)).slice(0, 8);
    for (const s of sts) res.append(Row({ color: colorOf(s.id), title: s.name, small: s.alive ? "国" : "滅亡", onclick: () => { S.hooks.select(s.id); } }));
    for (const s of sets) res.append(Row({ color: "#9db4c0", title: s.name, small: "都市", onclick: () => S.hooks.focusCell(s.cell) }));
    if (!sts.length && !sets.length) res.append(Mut("見つかりませんでした。"));
  };
  box.replaceChildren(inp, res);
  fill();
}
export function wireTools() {
  const tog = (id, other, fn) => () => { const el = $(id), was = el.classList.contains("on"); $(other).classList.remove("on"); $("#cc").classList.remove("on"); el.classList.toggle("on", !was); if (!was) fn(); };
  $("#bl").onclick = tog("#lay", "#srch", renderLayers);
  $("#bs").onclick = tog("#srch", "#lay", () => { renderSearch(); $("#search-q")?.focus(); });
  $("#ph").onclick = () => { document.body.classList.toggle("min"); setTimeout(() => S.map?.draw(), 300); };
}

/* ---------- 国のカード（地図の国をクリックすると右上に開く） ---------- */
export function showCard(id) {
  const box = $("#cc"), c = civ(), st = c.states[id];
  if (!st) { box.classList.remove("on"); return; }
  $("#lay").classList.remove("on");
  $("#srch").classList.remove("on");
  const mine = controlled() === st.id, cm = me(), creatorMode = !cm;
  const leg = st.politics ? effective(c, st, "legitimacy") : 0;
  let pw = 0;
  try { pw = totalPower(c, st); } catch { /* */ }
  const bar = (k, v, txt) => h("div", {}, h("span", {}, k), h("i", {}, h("b", { style: `width:${Math.max(2, Math.min(100, v * 100))}%` })), h("em", {}, txt));
  const rel = cm && !mine ? relText(cm, st) : null;
  box.replaceChildren(
    h("button", { class: "x", onclick: () => { box.classList.remove("on"); S.cardId = null; }, title: "閉じる", "aria-label": "閉じる" }, iconSvg("close", 14)),
    h("div", { class: "v-fg" }, h("div", { class: "v-flagbox" }, stateFlagEl(st, 52)), h("div", {}, h("h4", {}, st.name), h("small", { class: "v-mut" }, `${polityJa(st.polity)}${st.alive ? "" : "・滅亡"}${rel ? " ・ " + rel : ""}`))),
    h("div", { class: "v-mut", style: "margin-bottom:8px" }, `為政者 ${st.leader?.name ?? "—"}`),
    h("div", { class: "v-bars", style: `--c:${colorOf(st.id)}` }, bar("人口", Math.min(1, st.pop / 2e7), n0(Math.round(st.pop / 10000)) + "万"), bar("安定", st.stability, Math.round(st.stability * 100)), bar("軍事", Math.min(1, pw / 2000), n0(pw)), bar("正統", leg, Math.round(leg * 100))),
    h("div", { class: "v-acts" },
      Btn("詳細", () => openNationFull(st.id), "g", { size: "s", id: "card-detail" }),
      mine ? Btn("国の情報を編集", () => openInfoEdit(st.id), "g", { size: "s" }) : Btn("外交", () => { S.hub = "diplo"; S.hooks.render(); }, "g", { size: "s" }),
      !mine && cm && st.alive ? Btn("宣戦", () => confirmWar(cm.id, st.id, () => S.hooks.render()), "d", { size: "s", id: "card-war" }) : null,
      !mine && st.alive ? Btn(creatorMode ? "担当する" : "担当を移す", () => { run({ type: "control.take", stateId: st.id }); S.sel = st.id; S.hub = "status"; S.hooks.render(); }, "", { size: "s", id: "take" }) : null,
      mine ? Btn("担当を解除", () => toCreator(), "g", { size: "s", id: "release" }) : null),
  );
  box.classList.add("on");
  S.cardId = id;
}
const relText = (A, B) => {
  const c = civ();
  for (const w of Object.values(c.wars)) if (w.status === "active" && [...w.sides.a, ...w.sides.d].includes(A.id) && [...w.sides.a, ...w.sides.d].includes(B.id)) return "戦争中";
  return A.relations?.[B.id] != null ? (A.relations[B.id] >= 20 ? "友好的" : A.relations[B.id] <= -40 ? "険悪" : "") : "";
};

/* ---------- 歯車メニュー ---------- */
export function toggleGear() {
  const g = $("#gearmenu");
  if (g.classList.contains("on")) return g.classList.remove("on");
  g.replaceChildren(
    ...[["settings", "世界の設定"], ["save", "保存・読み込み・書き出し"], ["shortcut", "ショートカット"], ["about", "版の情報"]].map(([k, ja]) => Row({ title: ja, onclick: () => { g.classList.remove("on"); S.hooks.gear?.(k); } })),
  );
  g.classList.add("on");
}
