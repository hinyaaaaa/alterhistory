// v7.1.0: 技術の画面。線の絡まった巨大な図をやめ、「系統 → 分野 → 時代ごとの段」の 3 段で見る。
//   ・全体: 系統ごとに分野のカード（採用の進み具合と、いちばん新しい技術）。
//   ・分野: 時代の段ごとに技術のチップを並べる。選ぶと、前提（↑）と後続（↓）が光り、下に詳細が出る。
//   ・探す: 名前の一部で、全分野から絞り込む。
import { h, n0 } from "../v6/common.js";
import { S } from "../v6/store.js";
import { civ } from "./panels-common.js";
import { TECHS, TECH, COND, ADOPT_COVER } from "../../core/civ/tech.js";
import { TREE, STAGES, LANES, FAMILIES } from "../../core/civ/techtree.js";
import { techStatus, CAP_JA, FX_JA } from "../v6/views-a.js";
import { formatDate } from "../../core/wcde/calendar.js";

const V = { fam: null, field: null, q: "" };
const MARK = { adopted: "■", available: "◆", known: "◇", lost: "✕", locked: "○" };
const LAB = { adopted: "採用済み", available: "採用できる", known: "一部が知る", lost: "失われた", locked: "未発見" };
const shown = (t) => !t.hidden;
const FIELD_OF = Object.fromEntries(LANES.map((l) => [l.id, l]));
const byField = (fid) => TREE.filter((t) => t.lane === fid && shown(t));
const famOf = (t) => t.fam ?? FIELD_OF[t.lane]?.fam ?? "phys";

export function techScreen(st, mine, rerender) {
  const status = techStatus(st), root = h("div", { class: "tv" });
  const adopted = (t) => st.techAdopted?.[t.id] != null;
  const done = (list) => list.filter(adopted).length;
  const all = TREE.filter(shown);
  const go = (patch) => { Object.assign(V, patch); rerender(); };
  // 上段: 系統・探す・進み具合
  const top = h("div", { class: "tv-top" },
    h("div", { class: "tv-prog" }, h("b", {}, `${done(all)}`), h("small", {}, ` / ${all.length} 採用`)),
    h("input", { type: "search", id: "tech-q", placeholder: "技術を探す", value: V.q, oninput: (e) => { V.q = e.target.value; clearTimeout(top._t); top._t = setTimeout(() => { rerender(); document.querySelector("#tech-q")?.focus(); }, 220); } }),
  );
  const famBar = h("div", { class: "tv-fam" }, ...[{ id: null, ja: "すべて" }, ...FAMILIES].map((f) => h("button", { class: V.fam === f.id ? "on" : "", onclick: () => go({ fam: f.id, field: null }) }, f.ja)));
  root.append(top, famBar);
  const q = V.q.trim();
  if (q) { // 探す
    const hits = all.filter((t) => t.ja.includes(q) || t.id.includes(q) || FIELD_OF[t.lane]?.ja.includes(q));
    root.append(h("div", { class: "tv-note" }, `${hits.length} 件`), chips(hits.slice(0, 80), status, adopted));
    return finish(root, st, status);
  }
  if (V.field) { // 分野
    const f = FIELD_OF[V.field], list = byField(V.field);
    root.append(h("div", { class: "tv-head" }, h("button", { class: "tv-back", onclick: () => go({ field: null }) }, "‹ 分野一覧"), h("b", {}, `${f.glyph} ${f.ja}`), h("small", {}, `${done(list)} / ${list.length}`)));
    const rows = new Map(); for (const t of list) { const k = Math.max(0, Math.min(12, t.stage)); (rows.get(k) ?? rows.set(k, []).get(k)).push(t); }
    const sel = TECH[S.tech] ? NODE_OF(S.tech) : null, pre = new Set(sel?.prereq ?? []), dep = new Set(sel ? TREE.filter((t) => t.prereq.includes(sel.id)).map((t) => t.id) : []);
    for (const k of [...rows.keys()].sort((a, b) => a - b)) root.append(h("div", { class: "tv-era" }, h("div", { class: "tv-eh" }, STAGES[k]), chips(rows.get(k), status, adopted, { sel: S.tech, pre, dep })));
    return finish(root, st, status);
  }
  // 全体: 系統ごとの分野カード
  const fams = FAMILIES.filter((f) => !V.fam || f.id === V.fam);
  for (const fam of fams) {
    const lanes = LANES.filter((l) => !l.hidden && (famOf({ lane: l.id, fam: l.fam }) === fam.id));
    if (!lanes.length) continue;
    root.append(h("div", { class: "tv-fh" }, h("b", {}, fam.ja), h("small", {}, fam.note)));
    root.append(h("div", { class: "tv-grid" }, ...lanes.map((l) => {
      const list = byField(l.id), n = done(list), best = list.filter(adopted).sort((a, b) => b.col - a.col)[0];
      return h("button", { class: "tv-card", "data-field": l.id, onclick: () => go({ field: l.id }) }, h("div", { class: "tv-ct" }, h("span", { class: "tv-g" }, l.glyph), h("b", {}, l.ja)), h("div", { class: "tv-bar" }, h("i", { style: `width:${Math.round((n / Math.max(1, list.length)) * 100)}%` })), h("small", {}, `${n} / ${list.length}${best ? "・最前線 " + best.ja : ""}`));
    })));
  }
  return finish(root, st, status);
}
const NODE_OF = (id) => TREE.find((t) => t.id === id);
function chips(list, status, adopted, hl = {}) {
  return h("div", { class: "tv-chips" }, ...list.map((t) => { const s = status(TECH[t.id] ?? { key: t.id }); return h("button", { class: `tv-chip ${s}${hl.sel === t.id ? " sel" : ""}${hl.pre?.has(t.id) ? " pre" : ""}${hl.dep?.has(t.id) ? " dep" : ""}`, "data-tech": t.id, title: LAB[s], onclick: () => { S.tech = t.id; if (!V.field && !V.q) V.field = t.lane; S.hooks.panel(); } }, `${MARK[s]} ${t.ja}`); }));
}
function finish(root, st, status) {
  const t = S.tech && NODE_OF(S.tech), c = civ();
  if (!t) { root.append(h("div", { class: "tv-note" }, "技術を選ぶと、前提・後続・効果が出ます。技術の採用は、世界の仕組みが自動で行います。")); return root; }
  const T = TECH[t.id], s = status(T), cov = Math.round(status.cov(t.id) * 100), w = c.techWorld[t.id];
  const link = (id) => { const x = NODE_OF(id); return x ? h("button", { class: `tv-chip ${status(TECH[id])}`, onclick: () => { S.tech = id; V.field = x.lane; V.q = ""; S.hooks.panel(); } }, `${MARK[status(TECH[id])]} ${x.ja}`) : null; };
  const deps = TREE.filter((x) => x.prereq.includes(t.id) && shown(x));
  const unl = t.caps.map((x) => CAP_JA[x] ?? x), fx = Object.entries(t.fx).map(([k, v]) => `${FX_JA[k] ?? k} +${Math.round(v * 1000) / 10}%`);
  const cond = [t.pop ? `集団の規模 ${n0(t.pop)} 人以上` : null, t.s ? "定住" : null, T?.condKey ? (COND[T.condKey]?.ja ?? T.condKey) : null].filter(Boolean);
  root.append(h("div", { class: "tv-detail" },
    h("div", { class: "tv-dt" }, h("b", {}, t.ja), h("small", {}, `${FIELD_OF[t.lane]?.ja}・${STAGES[Math.min(12, t.stage)]}`), h("span", { class: `tv-st ${s}` }, `${MARK[s]} ${LAB[s]}`)),
    h("div", { class: "tv-row" }, h("small", {}, "国内の普及"), h("b", {}, `${cov}%`), h("small", {}, `（採用は ${Math.round(ADOPT_COVER * 100)}% 以上、または首都が知っているとき）`)),
    t.prereq.length ? h("div", { class: "tv-row" }, h("small", {}, "前提 ↑"), ...t.prereq.map(link)) : null,
    deps.length ? h("div", { class: "tv-row" }, h("small", {}, "後続 ↓"), ...deps.slice(0, 12).map((x) => link(x.id))) : null,
    unl.length ? h("div", { class: "tv-row" }, h("small", {}, "解禁"), h("span", {}, unl.join("・"))) : null,
    fx.length ? h("div", { class: "tv-row" }, h("small", {}, "効果"), h("span", {}, fx.join("・"))) : null,
    cond.length ? h("div", { class: "tv-row" }, h("small", {}, "成立の条件"), h("span", {}, cond.join("・"))) : null,
    t.desc ? h("div", { class: "tv-row" }, h("span", {}, t.desc)) : null,
    h("div", { class: "tv-row" }, h("small", {}, "世界"), h("span", {}, w ? `${w.first != null ? formatDate(c.wcde.config.calendar, w.first) + "に初出・" : ""}独立 ${w.independent ?? 0} 回・伝播 ${w.spread ?? 0} 件` : "まだ誰も発見していない")),
  ));
  return root;
}
void TECHS;
