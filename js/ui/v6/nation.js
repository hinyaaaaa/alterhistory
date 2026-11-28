// v6.17.0: 国家ページ。上部は「旗・国名・政体・担当」とタブだけ。6 つのサブタブ＝情報／内政／軍事／外交／技術ツリー／軍事ドクトリン。
//   情報: 旗・国名・成立年・政体・指導者・主要指標・文化／宗教／言語の構成・支持勢力。国名・政体・指導者・国旗はいつでも変えられ、代償が出る（identity.js）。
import { h, lb, btn, pct, n0, r2, face, hemi, colorOf, FACTION_JA, FACTION_COL } from "./common.js";
import { S, run, act, creator, aliveStates, controlled } from "./store.js";
import { flag, icon, metric, ring, stackbar } from "./visual.js";
import { flagEl } from "./flagview.js";
import { confirmWar } from "./warconfirm.js";
import { officesBox } from "./views-a.js";
import { policyBox } from "./policy.js";
import { dieBtn } from "./wizard.js";
import { REGIMES, regimeJa, regimeOf } from "../../core/wcde/regimes.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { UNIT_KINDS, formationsOf, SCHOOL_BY_ID } from "../../core/wcde/domains/military.js";
import { SERVICES, SERVICE_KEYS, serviceOf, itemsOf } from "../../core/wcde/orbat.js";
import { taxMult } from "../../core/civ/techfx.js";
import { atWarWith, treatyBetween } from "../../core/civ/diplomacy.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { composeStateName } from "../../core/wcde/domains/naming.js";
import {
  changeCost,
  leaderCandidates,
  playerRegimeOptions,
  FINANCE,
  FINANCE_COOLDOWN,
  LEADER_MODES,
} from "../../core/wcde/identity.js";
import { shockLeft } from "../../core/wcde/shocks.js";
import { situationOf, METRIC_JA } from "../../core/wcde/transition.js";
import { LEADER_TRAITS } from "../../core/wcde/founding.js";
import {
  FLAG_FIELDS,
  FLAG_CHARGES,
  FLAG_COLORS,
  randomFlag,
  flagOfState,
  normalizeFlag,
  flagRuleOk,
  FLAG_BIAS_COUNT,
} from "../../core/names/flag.js";
import { ties } from "./diplo.js";
import { regimeOf as _r } from "../../core/wcde/regimes.js";

const civ = () => S.w.civ;
const KIND_COL = {
  infantry: "#9fbf8a",
  ranged: "#d8b45a",
  cavalry: "#c99a6f",
  navy: "#6fa8c9",
  garrison: "#8fb3b0",
  firearms: "#d0605a",
};
const KIND_ICON = {
  infantry: "shield",
  ranged: "bow",
  cavalry: "horse",
  navy: "ship",
  garrison: "tower",
  firearms: "gun",
};
const can$ = (st, mine) => st.alive && (mine || !controlled());
const doit = (mine, c) => (mine ? act(c) : creator(c));
const yearOf = (mi) => formatWorldDate(S.w, mi).split("年")[0] + "年";
const hashCol = (s, l = 58) => {
  let k = 7;
  for (const ch of String(s)) k = (k * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(k) % 360} 45% ${l}%)`;
};

/** 頭: 旗・国名・政体・担当ボタン。数値は情報タブへ */
export function nationHero(st, mine) {
  return h(
    "div",
    { class: "hero slim" },
    h(
      "div",
      { class: "hrow" },
      flag(st.id, 48),
      h(
        "div",
        { class: "hname" },
        h("h3", {}, st.name),
        h("div", { class: "sub" }, `${regimeJa(st)}${st.alive ? "" : "・滅亡"}`),
      ),
      mine
        ? btn(
            "担当を解除",
            () => {
              run({ type: "control.release" });
              S.hooks.render();
            },
            "p",
            { id: "release" },
          )
        : btn(
            "この国を担当する",
            () => {
              run({ type: "control.take", stateId: st.id });
              S.hooks.render();
            },
            "p",
            { id: "take", disabled: !st.alive },
          ),
    ),
  );
}

/* ---------- 情報 ---------- */
const pips = (n, max = 4, col = "#d0605a") =>
  h(
    "span",
    { class: "pips" },
    ...Array.from({ length: max }, (_, i) =>
      h("i", { class: i < n ? "on" : "", style: i < n ? `background:${col}` : "" }),
    ),
  );
/** 代償の見積りを、数字と点で見せる */
export const costChips = (cost) =>
  h(
    "div",
    { class: "costs" },
    cost.legit
      ? h(
          "span",
          { class: "cc", title: "正統性が下がる（時間とともに戻る）" },
          icon("crown", 16, "#a58bd0"),
          `−${Math.round(cost.legit * 100)}%`,
          h("small", {}, `${cost.years}年で戻る`),
        )
      : null,
    cost.stab
      ? h(
          "span",
          { class: "cc", title: "安定度が下がる" },
          icon("shield", 16, "#d0605a"),
          `−${Math.round(cost.stab * 100)}%`,
        )
      : null,
    cost.fac
      ? h(
          "span",
          { class: "cc", title: "勢力の支持が下がる" },
          icon("pop", 16, "#d8b45a"),
          `−${Math.round(cost.fac * 100)}%`,
        )
      : null,
    cost.count ? h("span", { class: "cc rep", title: "直近 60 年の同じ種類の変更" }, `${cost.count}回目`) : null,
  );
const edBtn = (st, kind, can, label) =>
  can
    ? h(
        "button",
        {
          class: "ed",
          title: label,
          "data-edit": kind,
          onclick: () => {
            S.edit = { id: st.id, kind, salt: 0 };
            S.hooks.panel();
          },
        },
        "✎",
      )
    : null;
function compOf(st) {
  const c = civ(),
    out = { culture: {}, religion: {}, language: {} };
  let tot = 0;
  for (const id in c.groups) {
    const g = c.groups[id];
    if (g.stateId !== st.id) continue;
    for (const co of g.cohorts ?? []) {
      const n = g.pop * co.share;
      tot += n;
      out.culture[co.cultureId] = (out.culture[co.cultureId] ?? 0) + n;
      const r = co.religionId ?? "none";
      out.religion[r] = (out.religion[r] ?? 0) + n;
      out.language[co.languageId] = (out.language[co.languageId] ?? 0) + n;
    }
  }
  return { out, tot: tot || 1 };
}
/** 構成: 上位 3 つは大きなカード（印と割合）、ほかは「その他」の小さなバッジ */
function compBlock(ic, ja, map, tot, nameOf) {
  const rows = Object.entries(map)
      .map(([id, n]) => ({ id, n, f: n / tot }))
      .sort((a, b) => b.n - a.n),
    top = rows.slice(0, 3),
    rest = rows.slice(3),
    small = rest.filter((x) => x.f >= 0.01).slice(0, 6),
    other = rest.reduce((a, x) => a + x.f, 0) - small.reduce((a, x) => a + x.f, 0);
  return h(
    "div",
    { class: "comp", "data-comp": ja },
    h("div", { class: "comph" }, icon(ic, 18), h("b", {}, ja)),
    h(
      "div",
      { class: "ccards" },
      ...top.map((x) =>
        h(
          "div",
          { class: "ccard", title: `${nameOf(x.id)} ${(x.f * 100).toFixed(1)}%`, style: `--c:${hashCol(x.id)}` },
          h("i", { class: "cfill", style: `height:${Math.max(6, x.f * 100)}%` }),
          h("b", {}, nameOf(x.id)),
          h("span", {}, Math.round(x.f * 100) + "%"),
        ),
      ),
    ),
    small.length || other > 0.005
      ? h(
          "div",
          { class: "cbadges" },
          ...small.map((x) =>
            h(
              "span",
              { class: "cbadge", title: `${nameOf(x.id)} ${(x.f * 100).toFixed(1)}%`, style: `--c:${hashCol(x.id)}` },
              nameOf(x.id),
            ),
          ),
          other > 0.005
            ? h("span", { class: "cbadge o", title: "その他" }, `その他 ${Math.round(other * 100)}%`)
            : null,
        )
      : null,
  );
}
const mood = (s, col, r) => {
  const mouth =
    s > 0.6
      ? `M${-r * 0.4} ${r * 0.25}Q0 ${r * 0.6} ${r * 0.4} ${r * 0.25}`
      : s < 0.35
        ? `M${-r * 0.4} ${r * 0.5}Q0 ${r * 0.1} ${r * 0.4} ${r * 0.5}`
        : `M${-r * 0.35} ${r * 0.38}H${r * 0.35}`;
  return `<circle r="${r}" fill="${col}" fill-opacity=".92" stroke="#0d1214" stroke-width="1.5"/><circle cx="${-r * 0.33}" cy="${-r * 0.22}" r="${r * 0.1}" fill="#14181d"/><circle cx="${r * 0.33}" cy="${-r * 0.22}" r="${r * 0.1}" fill="#14181d"/><path d="${mouth}" stroke="#14181d" stroke-width="${Math.max(1.2, r * 0.1)}" fill="none" stroke-linecap="round"/>`;
};
/** 円卓（君主制）: 中央が玉座、距離が忠誠、大きさが影響力、顔が機嫌 */
function roundtable(rows) {
  const n = rows.length || 1,
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 260 260");
  svg.setAttribute("class", "rtable");
  let g = `<circle cx="130" cy="130" r="112" fill="#141a20" stroke="#2c343d"/><circle cx="130" cy="130" r="70" fill="none" stroke="#2c343d" stroke-dasharray="3 5"/><circle cx="130" cy="130" r="30" fill="#2a2418" stroke="#d8b45a" stroke-width="2"/><g transform="translate(118 118) scale(1)" fill="none" stroke="#d8b45a" stroke-width="1.6" stroke-linejoin="round"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" transform="scale(.9)"/></g>`;
  rows.forEach(([k, v], i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2,
      d = 52 + (1 - v.support) * 52,
      r = 11 + Math.min(1, v.influence * 2.2) * 11,
      x = 130 + Math.cos(a) * d,
      y = 130 + Math.sin(a) * d;
    g += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${FACTION_JA[k] ?? k}　影響 ${Math.round(v.influence * 100)}%　支持 ${Math.round(v.support * 100)}%</title>${mood(v.support, FACTION_COL[k] ?? "#6fa8c9", r)}<text y="${r + 11}" text-anchor="middle" font-size="11" fill="#c9cfd6">${FACTION_JA[k] ?? k}</text></g>`;
  });
  svg.innerHTML = g;
  return svg;
}
function factionsView(st) {
  const P = st.politics;
  if (!P) return null;
  const rows = Object.entries(P.factions ?? {}),
    her = REGIMES[regimeOf(st)].heredity;
  const legend = h(
    "div",
    { class: "facs" },
    ...rows.map(([k, v]) =>
      h(
        "div",
        { class: "fac", title: `影響 ${pct(v.influence)}・支持 ${pct(v.support)}` },
        h("i", { style: `background:${FACTION_COL[k] ?? "#6fa8c9"}` }),
        h("span", {}, FACTION_JA[k] ?? k),
        h(
          "span",
          { class: "barv" },
          h("i", {
            style: `width:${v.support * 100}%;background:${v.support < 0.35 ? "#d0605a" : (FACTION_COL[k] ?? "#6fa8c9")}`,
          }),
        ),
      ),
    ),
  );
  const wrap = h("div", { class: "facview", id: "factions" }, lb("支持勢力", "FACTIONS"));
  if (her) wrap.append(h("div", { class: "rtw" }, roundtable(rows), legend));
  else {
    const hm = hemi(
      rows.map(([k, v]) => [k, v.influence]),
      rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"),
    );
    wrap.append(h("div", { class: "rtw" }, hm, legend));
  }
  return wrap;
}
export function tInfoV(st, mine) {
  const c = civ(),
    L = st.leader,
    P = st.politics,
    can = can$(st, mine),
    leg = P ? effective(c, st, "legitimacy") : 0,
    out = h("div", { class: "info" });
  if (S.edit?.id === st.id) openEditor(st, mine);
  const sh = shockLeft(st, c.monthIndex);
  out.append(
    h(
      "div",
      { class: "idcard" },
      h(
        "div",
        { class: "idflag" },
        can
          ? h(
              "button",
              {
                class: "flagbtn",
                "data-edit": "flag",
                title: "国旗を変える",
                onclick: () => {
                  S.edit = { id: st.id, kind: "flag", spec: normalizeFlag(flagOfState(st)) };
                  S.hooks.panel();
                },
              },
              flag(st.id, 120),
            )
          : flag(st.id, 120),
      ),
      h(
        "div",
        { class: "idtxt" },
        h("div", { class: "idn" }, h("h3", {}, st.name), edBtn(st, "name", can, "国名を変える")),
        h(
          "div",
          { class: "idr" },
          icon("crown", 16),
          h("b", {}, regimeJa(st)),
          edBtn(st, "regime", can, "政体を変える"),
        ),
        h("small", { class: "dim" }, `成立 ${yearOf(st.formedAt)}`),
      ),
      h(
        "div",
        { class: "idleader" },
        face(L?.name ?? "—", st.id, L?.look ?? null),
        h(
          "div",
          {},
          h("small", {}, L?.title ?? "為政者"),
          h("b", {}, L?.name ?? "—"),
          edBtn(st, "leader", can, "指導者を替える"),
        ),
      ),
    ),
  );
  if (sh.length)
    out.append(
      h(
        "div",
        { class: "shocks", title: "国名・政体・指導者・国旗の変更の代償" },
        icon("crown", 16, "#a58bd0"),
        ...sh.map((x) =>
          h("span", { class: "chip bad" }, `正統性 −${Math.max(1, Math.round(x.legit * 100))}%・あと${x.left}年`),
        ),
      ),
    );
  out.append(
    h(
      "div",
      { class: "metrics" },
      metric("pop", "人口", n0(st.pop)),
      metric("coin", "国庫", n0(st.treasury), { color: "#d8b45a" }),
      metric("gear", "産業力", n0(effective(c, st, "industry"))),
      metric("sword", "軍事力", n0(st.army), {
        color: "#d0605a",
        title: `軍事能力 ${(st.milBonus >= 0 ? "+" : "") + pct(st.milBonus ?? 0)}`,
      }),
      metric("shield", "安定度", pct(st.stability), {
        bar: st.stability,
        color: st.stability < 0.35 ? "#d0605a" : "#9fbf8a",
      }),
      metric("crown", "正統性", pct(leg), { bar: leg, color: "#a58bd0" }),
    ),
  );
  if (st.politics) out.append(situationBox(st));
  const { out: cp, tot } = compOf(st);
  out.append(
    h(
      "div",
      { class: "comps" },
      compBlock("book", "文化", cp.culture, tot, (id) => c.cultures[id]?.name ?? "—"),
      compBlock("temple", "宗教", cp.religion, tot, (id) =>
        id === "none" ? "無宗教" : (c.religions[id]?.name ?? "—"),
      ),
      compBlock("scroll", "言語", cp.language, tot, (id) => c.languages[id]?.name ?? "—"),
    ),
  );
  const fv = factionsView(st);
  if (fv) out.append(fv);
  return out;
}

/** 政情: 不満・改革の機運・軍の台頭と、進行中の政局（前兆・危機）。高いほど政体が揺らぐ */
function situationBox(st) {
  const sit = situationOf(st),
    col = (v, hot) => (v >= hot ? "#d0605a" : v >= hot * 0.75 ? "#d8b45a" : "#9fbf8a"),
    stage = { omen: "前兆", crisis: "山場" };
  return h(
    "div",
    { class: "metrics situation" },
    metric("pop", METRIC_JA.unrest, pct(sit.unrest), { bar: sit.unrest, color: col(sit.unrest, 0.55) }),
    metric("scroll", METRIC_JA.reformMood, pct(sit.reformMood), { bar: sit.reformMood, color: col(sit.reformMood, 0.45) }),
    metric("sword", METRIC_JA.militaryRise, pct(sit.militaryRise), { bar: sit.militaryRise, color: col(sit.militaryRise, 0.5) }),
    sit.arc
      ? h(
          "span",
          { class: "chip bad" },
          `${sit.arc.ja}の${stage[sit.arc.stage] ?? ""}${sit.arc.to ? `（${sit.arc.to}へ）` : ""}`,
        )
      : sit.ruling
        ? h("span", { class: "chip" }, `与党 ${sit.ruling}`)
        : null,
  );
}
/* ---------- 編集（全画面）: 国名・政体・指導者・国旗 ---------- */
function done(fn) {
  return (...a) => {
    const r = fn(...a);
    if (r?.ok !== false) {
      S.edit = null;
    }
    S.hooks.render();
    return r;
  };
}
function openEditor(st, mine) {
  const E = S.edit,
    ctx = S.w.sim.ctx,
    mi = civ().monthIndex,
    titles = { name: "国名を変える", regime: "政体を変える", leader: "指導者を替える", flag: "国旗を変える" };
  const build = () =>
    ({ name: nameEd, regime: regimeEd, leader: leaderEd, flag: flagEd })[E.kind](st, mine, ctx, mi, E);
  S.full = {
    key: "nedit",
    title: `${st.name} ・ ${titles[E.kind]}`,
    build,
    onClose: () => {
      S.edit = null;
    },
  };
}
const redo = () => S.hooks.panel();
function nameEd(st, mine, ctx, mi, E) {
  const cost = changeCost(st, mi, "name"),
    inp = h("input", {
      id: "ed-name",
      class: "bigin",
      value: E.name ?? st.name,
      maxlength: 30,
      oninput: (e) => {
        E.name = e.target.value;
      },
    });
  const roll = () => {
    const g = civ().groups[st.capitalGroupId] ?? Object.values(civ().groups)[0],
      core = REGIMES[regimeOf(st)].core;
    for (let k = 0; k < 14; k++) {
      try {
        const p = ctx.nameGen?.stateParts?.(civ(), g, "city_state", Math.random, core);
        if (p?.base) {
          const nm = composeStateName(p.base, core, "city_state", civ().date.year, p.sfx ?? "");
          if (nm !== st.name && !Object.values(civ().states).some((x) => x.alive && x.name === nm)) {
            E.name = nm;
            inp.value = nm;
            return;
          }
        }
      } catch {
        /* 次の候補 */
      }
    }
  };
  return h(
    "div",
    { class: "edpage" },
    h("div", { class: "dicefield big" }, inp, dieBtn(roll, { id: "ed-dice-name" })),
    costChips(cost),
    h(
      "div",
      { class: "rowb" },
      btn(
        "国名を改める",
        () => {
          const r = doit(mine, { type: "state.rename", stateId: st.id, name: (E.name ?? st.name).trim() });
          if (r.ok) {
            S.edit = null;
            S.full = null;
            S.hooks.render();
          }
        },
        "p",
        { id: "ed-go" },
      ),
    ),
  );
}
function regimeEd(st, mine, ctx, mi, E) {
  const opts = playerRegimeOptions(ctx, st).sort((a, b) => a.scale - b.scale);
  if (!opts.length) return h("div", { class: "edpage" }, h("small", { class: "dim" }, "いま移れる政体はありません"));
  const sel = opts.find((x) => x.id === E.to) ?? null,
    cost = sel ? changeCost(st, mi, "regime", { scale: sel.scale, crossFamily: sel.scale > 0.3 }) : null;
  return h(
    "div",
    { class: "edpage" },
    h(
      "div",
      { class: "rgrid" },
      ...opts.map((o) =>
        h(
          "button",
          {
            class: "rcard" + (sel?.id === o.id ? " on" : ""),
            "data-regime": o.id,
            onclick: () => {
              E.to = o.id;
              redo();
            },
          },
          h("b", {}, REGIMES[o.id].ja),
          pips(o.scale < 0.2 ? 1 : o.scale < 0.45 ? 2 : o.scale < 0.7 ? 3 : 4),
          h("small", {}, `元首 ${REGIMES[o.id].heredity ? "世襲" : "選出"}`),
        ),
      ),
    ),
    cost ? costChips(cost) : null,
    h(
      "div",
      { class: "rowb" },
      btn(
        "移行を始める",
        () => {
          const r = doit(mine, { type: "state.setRegime", stateId: st.id, regime: sel.id });
          if (r.ok) {
            S.edit = null;
            S.full = null;
            S.hooks.render();
          }
        },
        "p",
        { id: "ed-go", disabled: !sel },
      ),
    ),
  );
}
function leaderEd(st, mine, ctx, mi, E) {
  E.mode ??= "abdicate";
  const cands = leaderCandidates(ctx, st, 4, String(E.salt ?? 0)),
    cur = E.pick != null ? cands[E.pick] : null,
    cost = changeCost(st, mi, "leader", { mode: E.mode });
  return h(
    "div",
    { class: "edpage" },
    h(
      "div",
      { class: "modes" },
      ...["abdicate", "depose"].map((m) =>
        h(
          "button",
          {
            class: "mode" + (E.mode === m ? " on" : ""),
            "data-mode": m,
            onclick: () => {
              E.mode = m;
              redo();
            },
          },
          LEADER_MODES[m],
        ),
      ),
    ),
    h(
      "div",
      { class: "wcands" },
      ...cands.map((cd, i) =>
        h(
          "button",
          {
            class: "wcand" + (E.pick === i ? " on" : ""),
            "data-cand": i,
            onclick: () => {
              E.pick = i;
              redo();
            },
          },
          face(cd.name, st.id, cd.look),
          h("b", {}, cd.name),
          h("small", {}, `${cd.age}歳・${cd.origin}`),
          h("div", { class: "chips" }, ...cd.traits.map((k) => h("span", { class: "chip" }, LEADER_TRAITS[k] ?? k))),
        ),
      ),
      dieBtn(
        () => {
          E.salt = (E.salt ?? 0) + 1;
          E.pick = null;
          redo();
        },
        { id: "ed-dice-cands", class: "die big" },
      ),
    ),
    costChips(cost),
    h(
      "div",
      { class: "rowb" },
      btn(
        "替える",
        () => {
          const r = doit(mine, { type: "state.changeLeader", stateId: st.id, mode: E.mode, cand: cur });
          if (r.ok) {
            S.edit = null;
            S.full = null;
            S.hooks.render();
          }
        },
        "p",
        { id: "ed-go", disabled: !cur },
      ),
    ),
  );
}
const COLS = Object.keys(FLAG_COLORS);
function flagEd(st, mine, ctx, mi, E) {
  const spec = (E.spec = normalizeFlag(E.spec ?? flagOfState(st))),
    cost = changeCost(st, mi, "flag"),
    set = (fn) => {
      fn(spec);
      E.spec = normalizeFlag(spec);
      redo();
    };
  const sw = (cur, on, id) =>
    h(
      "div",
      { class: "swrow", id },
      ...COLS.map((k) =>
        h("button", {
          class: "sw2" + (cur === k ? " on" : ""),
          style: `background:${FLAG_COLORS[k]}`,
          title: k,
          onclick: () => on(k),
        }),
      ),
    );
  const kinds = h(
    "div",
    { class: "kgrid" },
    ...FLAG_FIELDS.map((f) =>
      h(
        "button",
        {
          class: "kc" + (spec.field.kind === f.kind ? " on" : ""),
          title: f.ja,
          onclick: () =>
            set((s) => {
              s.field = { kind: f.kind, c: s.field.c };
            }),
        },
        flagEl({ field: { kind: f.kind, c: ["blue", "white", "red"].slice(0, f.n) }, charge: null }, 54),
      ),
    ),
  );
  const charges = h(
    "div",
    { class: "kgrid" },
    ...FLAG_CHARGES.map((f) =>
      h(
        "button",
        {
          class: "kc" + ((spec.charge?.kind ?? "none") === f.kind ? " on" : ""),
          title: f.ja,
          onclick: () =>
            set((s) => {
              s.charge =
                f.kind === "none" ? null : { kind: f.kind, c: s.charge?.c ?? "white", size: s.charge?.size ?? 1 };
            }),
        },
        f.kind === "none"
          ? h("small", {}, "なし")
          : flagEl({ field: { kind: "plain", c: ["blue"] }, charge: { kind: f.kind, c: "white", size: 1 } }, 54),
      ),
    ),
  );
  return h(
    "div",
    { class: "edpage flagpage" },
    h(
      "div",
      { class: "fbig" },
      flagEl(spec, 360),
      dieBtn(
        () => {
          E.spec = normalizeFlag(randomFlag(Math.random, Math.floor(Math.random() * FLAG_BIAS_COUNT)));
          redo();
        },
        { id: "ed-dice-flag", class: "die big" },
      ),
    ),
    h(
      "div",
      { class: "fctl" },
      h("div", { class: "lb" }, "図形"),
      kinds,
      h("div", { class: "lb" }, "地の色"),
      ...spec.field.c.map((cl, i) =>
        sw(
          cl,
          (k) =>
            set((s) => {
              s.field.c[i] = k;
            }),
          "fc" + i,
        ),
      ),
      h("div", { class: "lb" }, "意匠"),
      charges,
      spec.charge
        ? h(
            "div",
            {},
            h("div", { class: "lb" }, "意匠の色"),
            sw(
              spec.charge.c,
              (k) =>
                set((s) => {
                  s.charge.c = k;
                }),
              "fcc",
            ),
            h("input", {
              type: "range",
              min: 0.6,
              max: 1.4,
              step: 0.05,
              value: spec.charge.size,
              oninput: (e) => {
                spec.charge.size = Number(e.target.value);
                E.spec = normalizeFlag(spec);
              },
              onchange: redo,
            }),
          )
        : null,
      flagRuleOk(spec) ? null : h("small", { class: "dim" }, "明暗が近く、見分けにくい配色"),
      costChips(cost),
      h(
        "div",
        { class: "rowb" },
        btn(
          "この国旗にする",
          () => {
            const r = doit(mine, { type: "state.setFlag", stateId: st.id, flag: spec });
            if (r.ok) {
              S.edit = null;
              S.full = null;
              S.hooks.render();
            }
          },
          "p",
          { id: "ed-go" },
        ),
      ),
    ),
  );
}

/* ---------- 内政: 財政・官職・政策 ---------- */
const LEVEL_COL = ["#6fa8c9", "#9fbf8a", "#d8b45a", "#d0605a"];
function financeRow(st, mine, key, ic) {
  const F = FINANCE[key],
    cur = st.policy[key],
    can = can$(st, mine),
    near = F.steps.reduce((b, v, i) => (Math.abs(v - cur) < Math.abs(F.steps[b] - cur) ? i : b), 0),
    set = (v) => {
      const r = doit(mine, { type: "state.setFinance", stateId: st.id, key, value: v });
      S.hooks.panel();
      return r;
    };
  const num = h("input", {
    type: "number",
    class: "num",
    id: "fin-" + key,
    min: Math.round(F.min * 100),
    max: Math.round(F.max * 100),
    step: Math.round(F.step * 100),
    value: Math.round(cur * 100),
    disabled: !can,
    onchange: (e) => set(Number(e.target.value) / 100),
  });
  const rng = h("input", {
    type: "range",
    class: "rng",
    min: F.min,
    max: F.max,
    step: F.step,
    value: cur,
    disabled: !can,
    oninput: (e) => {
      num.value = Math.round(e.target.value * 100);
    },
    onchange: (e) => set(Number(e.target.value)),
  });
  return h(
    "div",
    { class: "frow", "data-fin": key },
    h("div", { class: "fh" }, icon(ic, 20), h("b", {}, F.ja)),
    h(
      "div",
      { class: "lvls" },
      ...F.steps.map((v, i) =>
        h(
          "button",
          {
            class: "lvl" + (i === near && Math.abs(F.steps[near] - cur) < F.step * 1.01 ? " on" : ""),
            style: `--c:${LEVEL_COL[i]}`,
            disabled: !can,
            onclick: () => set(v),
            title: `${Math.round(v * 100)}%`,
          },
          pips(i + 1, 4, LEVEL_COL[i]),
        ),
      ),
    ),
    h("div", { class: "fnum" }, num, h("small", {}, "%")),
    rng,
  );
}
export function tDomesticV(st, mine) {
  const c = civ(),
    out = h("div", { class: "domestic" }),
    tax = st.pop * st.policy.tax * 0.0012 * taxMult(st),
    trade = effective(c, st, "tradeIncome"),
    tot = Math.max(1e-9, tax + trade);
  out.append(
    lb("財政", "FINANCE"),
    h(
      "div",
      { class: "revbar", title: `税収 ${n0(tax)}・交易 ${n0(trade)}` },
      h("i", { style: `width:${(tax / tot) * 100}%;background:#d8b45a` }),
      h("i", { style: `width:${(trade / tot) * 100}%;background:#6fa8c9` }),
    ),
    h(
      "div",
      { class: "fin" },
      financeRow(st, mine, "tax", "coin"),
      financeRow(st, mine, "mobilization", "sword"),
      financeRow(st, mine, "tolerance", "handshake"),
      financeRow(st, mine, "assimilation", "pop"),
      financeRow(st, mine, "autonomy", "flag"),
    ),
  );
  void FINANCE_COOLDOWN;
  out.append(officesBox(st, mine));
  if (st.alive && (mine || st.focus)) out.append(policyBox(st, mine));
  return out;
}
export const tPoliticsV = tDomesticV;

/** 軍事: 兵力・能力のリング、編成の帯と部隊カード、編成の編集（配分のスライダー）、宣戦 */
export function tMilitaryV(st, mine) {
  const c = civ(),
    M = st.military;
  if (!M) return h("p", { class: "n" }, "軍事のデータがありません。");
  const can = st.alive && (mine || !controlled()),
    units = M.units ?? [],
    tot = units.reduce((a, u) => a + u.size, 0) || 1,
    out = h("div", {}),
    ctx = S.w.sim.ctx,
    colOf = (k) => KIND_COL[k] ?? SERVICES[serviceOf(k)].color,
    manual = M.orbat?.mode === "manual";
  out.append(
    h(
      "div",
      { class: "rings" },
      ring(effective(c, st, "equipLevel"), "装備", "#d8b45a"),
      ring(effective(c, st, "readiness"), "練度", "#9fbf8a"),
      ring(Math.min(1, Math.max(0, 0.5 + st.milBonus)), "軍事能力", "#d0605a"),
      ring(Math.min(1, st.defense ?? 0), "要塞", "#8fb3b0"),
    ),
  );
  // v6.13.0: 陸・海・空の 3 軍。兵種ごとの人数（％ではなく人数）で見る
  const sch = M.school ?? {},
    schName = (s) => SCHOOL_BY_ID[sch[s]]?.ja ?? "未選択";
  out.append(
    lb("編成", "ORGANIZATION"),
    stackbar(
      units.map((u) => ({ label: u.name, value: u.size, color: colOf(u.kind) })),
      { height: 16 },
    ),
    h(
      "small",
      { class: "n" },
      `総兵力 ${n0(st.army)} 人・${manual ? "手動の編成" : "自動の編成（技術・地理・ドクトリンから決まる）"}　路線：陸 ${schName("land")}／海 ${schName("sea")}／空 ${schName("air")}`,
    ),
  );
  for (const svc of SERVICE_KEYS) {
    const us = units.filter((u) => serviceOf(u.kind) === svc);
    if (!us.length) continue;
    const sum = us.reduce((a, u) => a + u.size, 0);
    out.append(
      h(
        "div",
        { class: "uhead" },
        h("b", { style: `color:${SERVICES[svc].color}` }, SERVICES[svc].ja),
        h("small", {}, `${n0(sum)} 人（${pct(sum / tot)}）`),
      ),
    );
    out.append(
      h(
        "div",
        { class: "forms" },
        ...us.flatMap((u) => {
          const it = itemsOf(u.kind, u.size);
          return [
            h(
              "div",
              { class: "uhead" },
              h("span", { style: `color:${colOf(u.kind)}` }, icon(KIND_ICON[u.kind] ?? "flag", 16)),
              h("b", {}, u.name),
              h("small", {}, `${n0(u.size)} 人${it ? `（約 ${n0(it)} ${UNIT_KINDS[u.kind].item}）` : ""}`),
              h(
                "span",
                { class: "barv", title: `装備 ${pct(u.equip)}` },
                h("i", { style: `width:${u.equip * 100}%;background:#d8b45a` }),
              ),
              h(
                "span",
                { class: "barv", title: `練度 ${pct(u.readiness)}` },
                h("i", { style: `width:${u.readiness * 100}%;background:#9fbf8a` }),
              ),
            ),
            svc === "land"
              ? h(
                  "div",
                  { class: "fcards" },
                  ...formationsOf(st, u).map((f) =>
                    h(
                      "div",
                      { class: "fcard", style: `border-color:${colOf(u.kind)}` },
                      h("b", {}, f.name),
                      h("small", {}, n0(f.size)),
                    ),
                  ),
                )
              : null,
          ];
        }),
      ),
    );
  }
  if (can) {
    // 編成の編集: 兵種ごとの人数。自動／手動
    const avail = Object.entries(UNIT_KINDS).filter(([k, d]) => d.need(st, ctx)),
      cur = Object.fromEntries(avail.map(([k]) => [k, Math.round(units.find((u) => u.kind === k)?.size ?? 0)])),
      val = { ...cur },
      inp = {};
    const sum = () => Object.values(val).reduce((a, b) => a + b, 0),
      info = h("small", {}),
      paint = () => {
        const s = sum();
        info.textContent = `指定の合計 ${n0(s)} 人／総兵力 ${n0(st.army)} 人${s > st.army ? "（超えた分は比例して縮む）" : s < st.army ? `（足りない ${n0(st.army - s)} 人は予備役になる）` : ""}`;
        info.style.color = s > st.army ? "#d0605a" : "var(--dim)";
        for (const k in inp) inp[k].value = val[k];
      };
    const rows = SERVICE_KEYS.flatMap((svc) => {
      const list = avail.filter(([k, d]) => d.service === svc);
      if (!list.length) return [];
      return [
        h("div", { class: "uhead" }, h("b", { style: `color:${SERVICES[svc].color}` }, SERVICES[svc].ja)),
        ...list.map(([k, d]) => {
          const i = h("input", {
            type: "number",
            min: 0,
            step: 100,
            value: val[k],
            "data-kind": k,
            style: "width:110px",
            oninput: (e) => {
              val[k] = Math.max(0, Math.round(Number(e.target.value) || 0));
              info.textContent = "";
              paint1();
            },
          });
          inp[k] = i;
          return h(
            "div",
            { class: "slrow" },
            h("span", { style: `color:${colOf(k)}` }, icon(KIND_ICON[k] ?? "flag", 15)),
            h("span", { class: "nm", title: d.hint }, d.ja),
            i,
            h("small", {}, d.per ? `1${d.item}≒${d.per}人` : ""),
          );
        }),
      ];
    });
    const paint1 = () => {
      const s = sum();
      info.textContent = `指定の合計 ${n0(s)} 人／総兵力 ${n0(st.army)} 人${s > st.army ? "（超えた分は比例して縮む）" : s < st.army ? `（足りない ${n0(st.army - s)} 人は予備役になる）` : ""}`;
      info.style.color = s > st.army ? "#d0605a" : "var(--dim)";
    };
    out.append(
      h(
        "details",
        { class: "dt", id: "reorg-box" },
        h("summary", {}, "編成を編集する（兵種ごとの人数）"),
        h(
          "small",
          { class: "n" },
          "人数を指定すると手動の編成になります。総兵力は国の人口・経済で決まるので、指定の合計が多すぎれば比例して縮み、足りない分は予備役（徴集民兵）になります。",
        ),
        ...rows,
        h(
          "div",
          { class: "rowb" },
          info,
          btn("今の人数を入れ直す", () => {
            for (const k in cur) val[k] = cur[k];
            paint();
          }),
          btn(
            "この編成にする（手動）",
            () => {
              const hs = {};
              for (const k in val) if (val[k] > 0) hs[k] = val[k];
              (mine ? act : creator)({ type: "state.setOrbat", stateId: st.id, mode: "manual", heads: hs });
            },
            "p",
            { id: "reorg" },
          ),
          btn(
            "自動に戻す",
            () => (mine ? act : creator)({ type: "state.setOrbat", stateId: st.id, mode: "auto" }),
            "",
            { id: "reorg-auto" },
          ),
        ),
      ),
    );
    setTimeout(paint, 0);
  }
  // 宣戦: 宣戦できる国をすべて（件数の上限なし）。名前で検索して絞り込める。交戦中・同盟国・不可侵条約のある国は出さない（外交ページと同じ条件）
  const c0 = S.w.civ,
    foes = aliveStates()
      .filter(
        (x) =>
          x.id !== st.id &&
          !atWarWith(c0, st, x) &&
          !treatyBetween(c0, st, x, "alliance") &&
          !treatyBetween(c0, st, x, "nonaggression"),
      )
      .sort((a, b) => b.pop - a.pop);
  const sel = h("select", { id: "wl-target", size: 7, class: "wlsel" }),
    cnt = h("small", { id: "wl-count" }),
    find = h("input", { id: "wl-search", type: "search", placeholder: "国名で検索", autocomplete: "off" });
  const fill = () => {
    const q = find.value.trim(),
      keep = sel.value,
      list = q ? foes.filter((x) => x.name.includes(q)) : foes;
    sel.replaceChildren(...list.map((x) => h("option", { value: x.id }, x.name)));
    if (list.some((x) => x.id === keep)) sel.value = keep;
    else if (list.length) sel.value = list[0].id;
    cnt.textContent = `宣戦できる国 ${foes.length} 国${q ? `（${list.length} 国に絞り込み）` : ""}`;
    goBtn.disabled = !mine || !list.length;
  };
  const goBtn = btn(
    "宣戦する",
    () => {
      if (sel.value) confirmWar(st.id, sel.value, () => S.hooks.render());
    },
    "",
    { id: "declare", disabled: true, title: mine ? "" : "担当国のみ" },
  );
  find.addEventListener("input", fill);
  fill();
  out.append(lb("宣戦", "WAR"), h("div", { class: "wlbox" }, find, sel, cnt, h("div", { class: "rowb" }, goBtn)));
  void r2;
  void colorOf;
  return out;
}

/** 外交（国家ページのタブ）: 結びつきごとのくくり（宗主・属国・同盟国・不可侵条約締結国・通商条約締結国・敵対国）。国を押すと外交ページの当該の国へ */
export function tDiplomacyV(st, mine) {
  const c = civ(),
    sec = ties(c, st),
    go = (id) => {
      const me = controlled() ?? st.id;
      S.hub = "diplo";
      S.dtab = "rel";
      S.dip = { a: me, b: id === me ? st.id : id };
      S.prop = null;
      S.hooks.render();
    };
  const card = (id, tags, col) =>
    h(
      "div",
      {
        class: "fc",
        style: `border-color:${col}`,
        onmouseenter: () => {
          if (S.map) {
            S.map.hl = { type: "state", id };
            S.map.draw();
          }
        },
        onmouseleave: () => {
          if (S.map) {
            S.map.hl = null;
            S.map.draw();
          }
        },
        onclick: () => go(id),
      },
      flag(id, 40),
      h("b", {}, c.states[id].name),
      h("small", {}, tags.join("・")),
    );
  const group = (title, col, map) =>
    map.size
      ? [
          h("div", { class: "lb" }, title, h("em", {}, map.size)),
          h("div", { class: "fgrid" }, ...[...map].map(([id, tags]) => card(id, tags, col))),
        ]
      : [];
  const wars = st.warIds.map((i) => c.wars[i]).filter(Boolean),
    any = Object.values(sec).some((m) => m.size) || wars.length;
  const out = h(
    "div",
    { class: "dipl" },
    ...group("宗主", "#a58bd0", sec.over),
    ...group("属国・従う国", "#a58bd0", sec.subj),
    ...group("同盟国", "#6fa8c9", sec.ally),
    ...group("不可侵条約締結国", "#9fbf8a", sec.nap),
    ...group("通商条約締結国", "#d8b45a", sec.trade),
    ...group("その他の条約", "#8fb3b0", sec.other),
    ...group("敵対国", "#d0605a", sec.enemy),
  );
  if (wars.length)
    out.append(
      h("div", { class: "lb" }, "交戦中", h("em", {}, wars.length)),
      h(
        "div",
        { class: "flagrow" },
        ...wars.map((w) =>
          h(
            "span",
            {
              class: "fchip",
              onclick: () => {
                S.war = w.id;
                S.hub = "war";
                S.hooks.render();
              },
            },
            flag(w.aggressor === st.id ? w.defender : w.aggressor, 28),
            h("small", {}, w.name ?? "戦争"),
          ),
        ),
      ),
    );
  if (!any) out.append(h("small", { class: "dim" }, "結びつきのある国はありません"));
  const me = controlled();
  out.append(
    h(
      "div",
      { class: "rowb" },
      btn(
        "外交ページを開く",
        () => {
          S.hub = "diplo";
          S.dtab = "rel";
          S.dip = me && me !== st.id ? { a: me, b: st.id } : null;
          S.hooks.render();
        },
        "p",
        { id: "to-diplo" },
      ),
    ),
  );
  void mine;
  return out;
}
