// v6.18.0: 戦場の画面（会戦）。陸・海・空・宇宙で同じ見た目。3 つの翼ごとに前線と両軍の兵力・士気を図で見せ、翼ごとに命令（前進・待機・側面機動・後退）、予備の投入、自動、速度、一時停止ができる。
//   進行は日ごとのリアルタイム（battle.tick を速度に合わせて呼ぶ）。最初は一時停止で始まる。説明文は出さず、記号と図で伝える。
import { h, sv, btn, holdBtn, n0, bar, face, colorOf } from "./common.js";
import { S, act } from "./store.js";
import { dispatch, AUTHORITY as A } from "../../core/wcde/contract.js";
import { fieldStats, ORDERS, DOMAINS } from "../../core/wcde/battlefield.js";

const GLYPH = { land: "⚔", sea: "⚓", air: "✈", space: "✦" },
  OG = { advance: "▶", hold: "■", flank: "⤴", retreat: "◀" },
  OCOL = { advance: "#d8b45a", hold: "#8fb3b0", flank: "#a58bd0", retreat: "#d0605a" };
const SPEED = [900, 450, 200];
const BF = { id: null, timer: null, speed: 1, run: false, root: null, d: null };
export function stopBattle() {
  if (BF.timer) clearInterval(BF.timer);
  BF.timer = null;
  BF.run = false;
  BF.id = null;
  BF.root = null;
}
const bcmd = (c) => dispatch(S.w, { authority: A.PLAYER, ...c });
function setRun(on) {
  BF.run = on;
  if (BF.timer) {
    clearInterval(BF.timer);
    BF.timer = null;
  }
  if (on)
    BF.timer = setInterval(
      () => {
        const f = BF.d?.payload.field;
        if (!f || f.done) {
          setRun(false);
          draw();
          return;
        }
        bcmd({ type: "battle.tick", decisionId: BF.d.id, days: 1 });
        if (f.done) setRun(false);
        draw();
      },
      SPEED[BF.speed - 1],
    );
}

function lane(f, i) {
  const me = f.me.wings[i],
    foe = f.foe.wings[i],
    k = f.fog?.k ?? 1,
    exact = f.fog?.exact !== false,
    x = Math.max(4, Math.min(96, f.front[i])) * 10;
  const mc = colorOf(f.me.stateId, 52),
    fc = colorOf(f.foe.stateId, 52),
    chip = (w, side, x0, col, mult, ex) => {
      const w0 = 200,
        lx = side === "me" ? x0 : x0 - w0,
        sz = Math.round(w.size * mult),
        pct0 = Math.max(0, Math.min(1, w.size / Math.max(1, w.size0)));
      return sv(
        "g",
        { opacity: w.size <= 0 ? 0.35 : 1 },
        sv("rect", {
          x: lx,
          y: 8,
          width: w0,
          height: 68,
          rx: 8,
          fill: "#0e1217",
          "fill-opacity": 0.82,
          stroke: col,
          "stroke-width": w.routed ? 1 : 2,
          "stroke-dasharray": w.routed ? "5 4" : null,
        }),
        sv(
          "text",
          { x: lx + 12, y: 34, fill: "#e8e2d4", "font-size": 22, "font-weight": 700 },
          `${ex ? "" : "約"}${n0(sz)}`,
        ),
        sv("text", { x: lx + w0 - 12, y: 32, "text-anchor": "end", fill: OCOL[w.order], "font-size": 24 }, OG[w.order]),
        sv("rect", { x: lx + 12, y: 46, width: w0 - 24, height: 7, rx: 3, fill: "#222a33" }),
        sv("rect", { x: lx + 12, y: 46, width: (w0 - 24) * pct0, height: 7, rx: 3, fill: col }),
        sv("rect", { x: lx + 12, y: 60, width: w0 - 24, height: 6, rx: 3, fill: "#222a33" }),
        sv("rect", {
          x: lx + 12,
          y: 60,
          width: (w0 - 24) * w.morale,
          height: 6,
          rx: 3,
          fill: w.morale < 0.3 ? "#d0605a" : "#9fbf8a",
        }),
      );
    };
  return sv(
    "svg",
    { viewBox: "0 0 1000 84", class: "bflane", preserveAspectRatio: "none" },
    sv("rect", { x: 0, y: 4, width: x, height: 76, fill: mc, "fill-opacity": 0.2 }),
    sv("rect", { x, y: 4, width: 1000 - x, height: 76, fill: fc, "fill-opacity": 0.2 }),
    sv("line", { x1: x, x2: x, y1: 0, y2: 84, stroke: "#e8e2d4", "stroke-width": 3, "stroke-dasharray": "8 5" }),
    sv(
      "text",
      {
        x: x + (me.order === "retreat" ? 12 : -12),
        y: 48,
        "text-anchor": me.order === "retreat" ? "start" : "end",
        fill: OCOL[me.order],
        "font-size": 30,
        "font-weight": 700,
      },
      f.terr > 0.08 && i === 1 ? "△" : "",
    ),
    chip(me, "me", 8, mc, 1, true),
    chip(foe, "foe", 992, fc, k, exact),
  );
}
function controls(f, i, d) {
  const w = f.me.wings[i],
    row = h("div", { class: "bfctl" }, h("b", { class: "wn" }, w.name, w.lead ? h("small", {}, w.lead) : null));
  for (const [o] of Object.entries(ORDERS))
    row.append(
      h(
        "button",
        {
          class: "ob" + (w.order === o ? " on" : ""),
          style: `--c:${OCOL[o]}`,
          title: ORDERS[o],
          disabled: f.done || w.routed,
          onclick: () => {
            bcmd({ type: "battle.order", decisionId: d.id, lane: i, order: o });
            draw();
          },
        },
        OG[o],
      ),
    );
  row.append(
    h(
      "button",
      {
        class: "ob res",
        title: "予備を送る",
        disabled: f.done || f.me.reserve < 1,
        onclick: () => {
          bcmd({ type: "battle.reinforce", decisionId: d.id, lane: i });
          draw();
        },
      },
      "＋",
    ),
  );
  return row;
}
function draw() {
  const d = BF.d,
    f = d?.payload.field,
    root = BF.root;
  if (!f || !root) return;
  const st = fieldStats(f),
    dom = DOMAINS[f.domain],
    me = S.w.civ.states[f.me.stateId],
    k = f.fog?.k ?? 1;
  const side = (s, who, mult) =>
    h(
      "div",
      { class: "bfside " + who },
      face(s.cmd?.name ?? s.name, s.stateId),
      h("div", { class: "bfsn" }, h("b", {}, s.cmd?.name ?? s.name), h("small", {}, s.label)),
    );
  const total = (s0, now, ex, mult) =>
    h(
      "div",
      { class: "bfsum" },
      h("b", {}, `${ex ? "" : "約"}${n0(now * mult)}`),
      bar(now / Math.max(1, s0), "var(--blue)"),
    );
  const head = h(
    "div",
    { class: "bfhead" },
    h("span", { class: "bfg" }, GLYPH[f.domain]),
    h("div", { class: "bft" }, h("b", {}, f.place), h("small", {}, `${dom.ja}・${f.war ?? ""}`)),
    h(
      "div",
      { class: "bfday" },
      h("b", {}, `${f.day} / ${f.maxDay}`),
      h("span", { class: "barv" }, h("i", { style: `width:${(f.day / f.maxDay) * 100}%;background:#d8b45a` })),
    ),
  );
  const sides = h(
    "div",
    { class: "bfsides" },
    h(
      "div",
      {},
      side(f.me, "me", 1),
      total(f.me.size0, st.me.size + f.me.reserve, true, 1),
      h("small", {}, `士気`),
      bar(st.me.morale, "#9fbf8a"),
      h("small", {}, `予備 ${n0(f.me.reserve)}`),
    ),
    h(
      "div",
      { class: "bfvs" },
      h("b", {}, "対"),
      h("small", {}, `${Math.round(f.front.reduce((a, b) => a + b, 0) / 3)}`),
    ),
    h(
      "div",
      {},
      side(f.foe, "foe", k),
      total(f.foe.size0, st.foe.size + f.foe.reserve, f.fog?.exact !== false, k),
      h("small", {}, `士気`),
      bar(st.foe.morale, "#d0605a"),
    ),
  );
  const lanes = h(
    "div",
    { class: "bflanes" },
    ...[0, 1, 2].map((i) => h("div", { class: "bfrow" }, controls(f, i, d), lane(f, i))),
  );
  const log = h(
    "div",
    { class: "bflog" },
    ...f.log.slice(-3).map((l) => h("div", { class: l.kind }, h("em", {}, `${l.day}日`), l.text)),
  );
  const bar2 = h(
    "div",
    { class: "bfbar" },
    f.done
      ? null
      : btn(
          BF.run ? "⏸" : "▶",
          () => {
            setRun(!BF.run);
            draw();
          },
          "p big",
          { id: "bf-run", title: BF.run ? "一時停止" : "進める" },
        ),
    ...(f.done
      ? []
      : [1, 2, 3].map((n) =>
          h(
            "button",
            {
              class: "b sp" + (BF.speed === n ? " on" : ""),
              onclick: () => {
                BF.speed = n;
                if (BF.run) setRun(true);
                draw();
              },
            },
            "▸".repeat(n),
          ),
        )),
    f.done
      ? null
      : h(
          "button",
          {
            class: "b" + (f.auto ? " on" : ""),
            id: "bf-auto",
            title: "お任せ",
            onclick: () => {
              bcmd({ type: "battle.auto", decisionId: d.id, on: !f.auto });
              draw();
            },
          },
          "自動",
        ),
    f.done
      ? null
      : holdBtn(
          "全軍後退",
          () => {
            bcmd({ type: "battle.order", decisionId: d.id, lane: "all", order: "retreat" });
            draw();
          },
          "",
          { id: "bf-retreat" },
          900,
        ),
    h("span", { class: "grow" }),
    btn(
      "地図で見る",
      () => {
        const g = S.w.civ.groups[d.payload.siteId];
        if (g) S.hooks.focusCell?.(g.cell);
      },
      "",
      { id: "dec-map" },
    ),
    btn(
      f.done ? "戦いを終える" : "一気に決着",
      () => {
        setRun(false);
        const r = act({ type: "decision.resolve", decisionId: d.id, option: "end" });
        if (r.ok) stopBattle();
      },
      f.done ? "p" : "",
      { id: "bf-end", "data-opt": "end" },
    ),
  );
  const res = f.done
    ? h(
        "div",
        { class: "bfres " + (f.result.winner === "me" ? "win" : "lose") },
        h("b", {}, f.result.winner === "me" ? "勝利" : f.result.withdrew ? "退却" : "敗北"),
        h("small", {}, `${f.result.days} 日・損害 ${n0(f.result.lossMe)} ／ 敵 ${n0(f.result.lossFoe * k)}`),
      )
    : null;
  root.replaceChildren(head, sides, lanes, res, log, bar2);
  void me;
}
/** 戦場の画面（決断 kind=battle の本体）。同じ決断の間は同じ要素を使い回し、進行の間も再描画で速度・一時停止を保つ */
export function battleScreen(d) {
  if (BF.id !== d.id) {
    stopBattle();
    BF.id = d.id;
    BF.root = h("div", { class: "bf" });
    BF.speed = 1;
  }
  BF.d = d;
  draw();
  return BF.root;
}
