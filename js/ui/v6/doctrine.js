// v6.18.0: 軍事ドクトリン（陸海空宇宙で共通の 5 系統 × 15 段）。系統は 1 つだけ選ぶ。系統のカードを並べ、選んだ系統の 15 段を一本の道として見せる。
//   各段は SVG のバッジ（取得済み・取れる・技術待ち）。説明文は出さず、効果は記号とゲージで示す。切り替えは長押し（段を失い、約 1 年の混乱）。
import { h, sv, btn, holdBtn, pct, n0, bar } from "./common.js";
import { S, act } from "./store.js";
import { TECH } from "../../core/civ/tech.js";
import {
  LINES,
  LINE_BY_ID,
  TIERS,
  FX_JA,
  CAP,
  lineOf,
  tierOf,
  COMMON_BY_ID,
} from "../../core/wcde/domains/doctrine.js";
import { canAdopt, switchCost, serviceFx } from "../../core/wcde/domains/military.js";
import { SERVICES, SERVICE_KEYS } from "../../core/wcde/orbat.js";

const FXG = {
  off: "攻",
  def: "守",
  logi: "給",
  attr: "損",
  naval: "海",
  siege: "城",
  adapt: "適",
  coh: "気",
  landing: "陸",
  armor: "甲",
  air: "空",
  subs: "潜",
  strike: "撃",
  mob: "動",
  covert: "隠",
  space: "宙",
};
const SHAPE = "M32 4l24 14v28L32 60 8 46V18z";
export function lineBadge(l, { size = 56, on = false, glyph = null } = {}) {
  const s = sv(
    "svg",
    { viewBox: "0 0 64 64", width: size, height: size, class: "pbadge" + (on ? " on" : "") },
    sv("path", {
      d: SHAPE,
      fill: l.color,
      "fill-opacity": on ? 0.5 : 0.22,
      stroke: l.color,
      "stroke-width": on ? 3 : 2,
    }),
    sv(
      "text",
      { x: 32, y: 42, "text-anchor": "middle", "font-size": 26, "font-weight": 700, fill: "#f2ecdc" },
      glyph ?? l.glyph,
    ),
  );
  return s;
}
function tierBadge(l, n, state, size = 46) {
  const col = state === "locked" ? "#3a424c" : l.color;
  return sv(
    "svg",
    { viewBox: "0 0 64 64", width: size, height: size, class: "tbadge " + state },
    sv("circle", {
      cx: 32,
      cy: 32,
      r: 28,
      fill: col,
      "fill-opacity": state === "taken" ? 0.6 : state === "ready" ? 0.28 : 0.08,
      stroke: col,
      "stroke-width": state === "ready" ? 4 : 2.5,
      "stroke-dasharray": state === "locked" ? "5 5" : null,
    }),
    sv(
      "text",
      {
        x: 32,
        y: 42,
        "text-anchor": "middle",
        "font-size": 28,
        "font-weight": 700,
        fill: state === "locked" ? "#6c7682" : "#f2ecdc",
      },
      String(n),
    ),
  );
}
const fxChips = (fx) =>
  h(
    "div",
    { class: "chips fxs" },
    ...Object.entries(fx)
      .filter(([, v]) => Math.abs(v) >= 0.0005)
      .map(([k, v]) =>
        h(
          "span",
          { class: "chip" + (v < 0 ? " bad" : " good"), title: FX_JA[k] },
          `${FXG[k] ?? k} ${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`,
        ),
      ),
  );

export function doctrineBoard(st, mine) {
  const M = st.military,
    cur = lineOf(st),
    picked = S.docLine && LINE_BY_ID[S.docLine] ? S.docLine : (cur ?? LINES[0].id),
    L = LINE_BY_ID[picked],
    t = tierOf(st),
    conf = M?.confusion ?? 0,
    can = mine && st.alive;
  const out = h("div", { class: "docb" });
  // 系統のカード（5 つ）
  out.append(
    h(
      "div",
      { class: "doclines" },
      ...LINES.map((l) =>
        h(
          "button",
          {
            class: "dline" + (l.id === picked ? " sel" : "") + (l.id === cur ? " cur" : ""),
            "data-line": l.id,
            style: `--c:${l.color}`,
            onclick: () => {
              S.docLine = l.id;
              S.docTier = null;
              S.hooks.panel();
            },
          },
          lineBadge(l, { on: l.id === cur }),
          h("b", {}, l.ja),
          h("small", {}, l.en),
        ),
      ),
    ),
  );
  if (conf > 0)
    out.append(
      h(
        "div",
        { class: "docconf" },
        "混乱",
        h("span", { class: "barv" }, h("i", { style: `width:${Math.min(1, conf / 12) * 100}%;background:#d0605a` })),
        h("small", {}, `あと ${conf} か月`),
      ),
    );
  // 軍ごとの現れ方
  out.append(
    h(
      "div",
      { class: "docsvc" },
      ...SERVICE_KEYS.map((k) =>
        h(
          "div",
          { class: "ds", style: `border-color:${SERVICES[k].color}` },
          h("b", { style: `color:${SERVICES[k].color}` }, SERVICES[k].ja),
          h("small", {}, L.svc[k]),
          cur === picked ? h("em", {}, `×${serviceFx(st, k).power.toFixed(2)}`) : null,
        ),
      ),
    ),
  );
  // 切り替え（長押し）
  if (can && picked !== cur) {
    const cost = switchCost(st);
    out.append(
      h(
        "div",
        { class: "docsw" },
        h(
          "div",
          {},
          cur ? h("small", {}, `失う ${t} 段・費用 ${cost}・混乱 12 か月`) : h("small", {}, "最初の選択は無料"),
        ),
        holdBtn(
          cur ? "この系統へ切り替える" : "この系統にする",
          () => act({ type: "doctrine.switch", stateId: st.id, line: picked }),
          "p",
          { id: "doc-switch" },
          1100,
        ),
      ),
    );
  }
  // 15 段の道
  const taken = M?.doctrine?.taken ?? {},
    sel = S.docTier ?? Math.min(TIERS, Math.max(1, t + 1)),
    nodes = L.tiers.map((_, i) => COMMON_BY_ID[`${L.id}:${i + 1}`]);
  const stateOf = (n) =>
    cur === L.id && taken[n.id] != null
      ? "taken"
      : cur && cur !== L.id
        ? "locked"
        : canAdopt(st, n.id).ok
          ? "ready"
          : "locked";
  out.append(
    h(
      "div",
      { class: "docpath" },
      ...nodes.map((n) =>
        h(
          "button",
          {
            class: "dnode " + stateOf(n) + (n.tier === sel ? " sel" : ""),
            "data-tier": n.tier,
            onclick: () => {
              S.docTier = n.tier;
              S.hooks.panel();
            },
          },
          tierBadge(L, n.tier, stateOf(n)),
          h("small", {}, n.ja),
        ),
      ),
    ),
  );
  const n = nodes[sel - 1],
    ca = n ? canAdopt(st, n.id) : { ok: false, reason: "" },
    techs = n.tech.map((k) => TECH[k]?.name ?? k);
  out.append(
    h(
      "div",
      { class: "docdet" },
      h(
        "div",
        { class: "dh" },
        tierBadge(L, n.tier, stateOf(n), 40),
        h("b", {}, n.ja),
        h("small", {}, `費用 ${n0(n.cost)}`),
      ),
      fxChips(n.fx),
      techs.length
        ? h(
            "div",
            { class: "dtech" },
            ...techs.map((x) =>
              h("span", { class: "chip" + (st.techAdopted?.[n.tech[techs.indexOf(x)]] != null ? " good" : "") }, x),
            ),
          )
        : null,
      can && cur === L.id && taken[n.id] == null
        ? btn(
            ca.ok ? "取り入れる" : ca.reason,
            () => act({ type: "state.adoptDoctrine", stateId: st.id, id: n.id }),
            ca.ok ? "p" : "",
            { id: "doc-adopt", disabled: !ca.ok },
          )
        : null,
    ),
  );
  // いまの効果
  const fx = M?.fx ?? {},
    now = Object.entries(fx).filter(([, v]) => Math.abs(v) >= 0.001);
  out.append(
    h(
      "div",
      { class: "docnow" },
      ...now.map(([k, v]) =>
        h(
          "div",
          { class: "dn" },
          h("small", {}, FX_JA[k]),
          bar(Math.abs(v) / (CAP[k] ?? 0.3), v < 0 ? "#d0605a" : "#9fbf8a"),
          h("b", {}, `${v > 0 ? "+" : ""}${pct(v)}`),
        ),
      ),
    ),
  );
  void pct;
  return out;
}
