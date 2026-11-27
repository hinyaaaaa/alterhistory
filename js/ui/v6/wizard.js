// v6.15.0: 建国の流れ（全面表示）。担当して建国・創造主の建国・反乱で国家をつくる・革命の新体制 が、同じ部品を使う。
//   首都 → 国名 → 国旗 → 政体 → 役職 → 為政者 → 軍事ドクトリン → 確認。首都を最初に決める（文化・言語が決まり、命名がそこから始まる）。
//   各欄の右にサイコロ。振るたびに、その場所の言語から作った名前・国旗・候補が変わる。上の「すべて振る」で一括して決める。
//   mode: "player"（担当して建国）／"creator"（創造主が国家を作る）／"rebel"（反乱で国家をつくる。首都は反乱の中心地）／"reform"（革命・クーデターが成功したときの新体制）
import { POLITY_GROUPS } from "../../core/wcde/polity30.js";
import { h, btn, face, n0, sv } from "./common.js";
import { S, act, creator } from "./store.js";
import { MapView } from "./map.js";
import { flagEl } from "./flagview.js";
import {
  REGIMES,
  OFFICES,
  REGIME_IDS,
  OFFICE_DOMAIN_JA,
  regimeGate,
  defaultOffices,
  officeJa,
  MIN_OFFICES,
} from "../../core/wcde/regimes.js";
import { capitalSites, planCapital, planRealm, doctrineChoices, LEADER_TRAITS } from "../../core/wcde/founding.js";
import { composeStateName } from "../../core/wcde/domains/naming.js";
import { languageOfGroup, ensureProfile } from "../../core/wcde/domains/language.js";
import {
  randomFlag,
  FLAG_FIELDS,
  FLAG_CHARGES,
  FLAG_COLORS,
  FLAG_BIAS_COUNT,
  normalizeFlag,
  isMetal,
} from "../../core/names/flag.js";

const STEPS = {
  player: ["capital", "name", "flag", "regime", "offices", "leader", "doctrine", "confirm"],
  creator: ["capital", "name", "flag", "regime", "offices", "leader", "doctrine", "confirm"],
  rebel: ["name", "flag", "regime", "offices", "leader", "doctrine", "confirm"],
  reform: ["regime", "offices", "leader", "confirm"],
};
const STEP_JA = {
  capital: "首都",
  name: "国名",
  flag: "国旗",
  regime: "政体",
  offices: "役職",
  leader: "為政者",
  doctrine: "軍事",
  confirm: "確認",
};
const STEP_TITLE = {
  capital: "首都を選ぶ",
  name: "国の名",
  flag: "国の旗",
  regime: "国の形",
  offices: "役職を置く",
  leader: "為政者を立てる",
  doctrine: "軍の流儀",
  confirm: "この国で始める",
};
const LOOKS = 12,
  TRAIT_KEYS = Object.keys(LEADER_TRAITS);
const ORIGINS_HEREDITARY = ["王の子（嫡出）", "王の子（庶子）", "王の弟", "王の甥", "将軍", "宰相", "養子", "聖職者"],
  ORIGINS_OTHER = ["将軍", "長老", "商人", "書記官", "弁論家", "神官", "民会の推挙"];
const rnd = Math.random,
  pickOf = (a) => a[Math.floor(rnd() * a.length)];

/** サイコロの印（SVG）。欄の右に置く */
export function dieIcon() {
  const e = sv("svg", { viewBox: "0 0 24 24", width: 22, height: 22 });
  e.innerHTML =
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>';
  return e;
}
export const dieBtn = (onclick, props = {}) => {
  const b = h("button", { class: "die", type: "button", onclick, "aria-label": "サイコロ", ...props });
  b.append(dieIcon());
  return b;
};

/** opts: { mode, host?, rebel?: { stateId, kind, cell, plan }, reform?: { stateId, kind, cell }, onDone(result), onCancel() } */
export function openWizard(opts) {
  const { mode } = opts,
    w = S.w,
    civ = w.civ,
    steps = STEPS[mode],
    nameGen = w.sim.ctx.nameGen;
  const D = {
    name: "",
    nameAuto: false,
    nameParts: null,
    flag: null,
    regime: null,
    offices: [],
    leader: { name: "", look: 0, age: 30, traits: [], origin: "" },
    cands: [],
    capital: null,
    doctrine: null,
  };
  let i = 0,
    msg = "",
    map = null,
    capInfo = null;
  const root = h("div", { class: "wiz" }),
    body = h("div", { class: "wizbody" }),
    foot = h("div", { class: "wizfoot" }),
    head = h("div", { class: "wizhead" });
  root.append(head, body, foot);
  (opts.host ?? document.body).append(root);
  const close = () => {
    try {
      map?.destroy?.();
    } catch {
      /* 地図の後始末 */
    }
    root.remove();
  };
  const rb = opts.rebel,
    rf = opts.reform,
    center = rb ? civ.groups[rb.plan.center.groupId] : null;
  const sites = mode === "player" || mode === "creator" ? capitalSites(w, null, 400) : [];
  // 政体を選べるか: 首都（または反乱の中心地・革命の国の首都）の集団の技術で決める。選べない政体は表示しない
  const gateGroup = () =>
    rb
      ? center
      : rf
        ? civ.groups[civ.states[rf.stateId].capitalGroupId]
        : capInfo && !capInfo.error
          ? civ.groups[capInfo.gid]
          : null;
  const gate = (id) => {
    const g = gateGroup();
    return g ? regimeGate(civ, g, id) : null;
  };
  const regimeIds = () => REGIME_IDS.filter((id) => !gate(id));
  const langGroup = () => gateGroup() ?? civ.groups[sites[0]?.groupId] ?? Object.values(civ.groups)[0];
  const core = () => (D.regime ? REGIMES[D.regime].core : "kingdom");

  /* ---- サイコロ: 首都の言語から ---- */
  const rollName = () => {
    const g = langGroup();
    for (let k = 0; k < 12; k++) {
      try {
        const p = nameGen?.stateParts?.(civ, g, "city_state", rnd, core());
        if (p?.base) {
          const nm = composeStateName(p.base, core(), "city_state", civ.date.year, p.sfx ?? "");
          if (!Object.values(civ.states).some((x) => x.alive && x.name === nm)) {
            D.nameParts = { base: p.base, sfx: p.sfx ?? "" };
            D.name = nm;
            D.nameAuto = true;
            return;
          }
        }
      } catch {
        /* 作れなければ次の候補 */
      }
    }
  };
  const previewName = () =>
    D.nameAuto && D.nameParts
      ? composeStateName(D.nameParts.base, core(), "city_state", civ.date.year, D.nameParts.sfx)
      : D.name;
  const lang = () => {
    const g = langGroup(),
      l = g ? languageOfGroup(g) : null;
    if (l) ensureProfile(civ, l);
    return l ? civ.languages[l] : null;
  };
  const rollFlag = () => {
    const l = lang();
    D.flag = randomFlag(
      rnd,
      (l?.id ? [...String(l.id)].reduce((a, c) => a + c.charCodeAt(0), 0) : Math.floor(rnd() * 99)) % FLAG_BIAS_COUNT,
    );
  };
  const rollCands = () => {
    const g = langGroup(),
      her = D.regime ? REGIMES[D.regime].heredity : true,
      origins = her ? ORIGINS_HEREDITARY : ORIGINS_OTHER;
    D.cands = Array.from({ length: 5 }, () => {
      const tr = [];
      while (tr.length < 2) {
        const k = pickOf(TRAIT_KEYS);
        if (!tr.includes(k)) tr.push(k);
      }
      return {
        name: nameGen?.person?.(civ, g, rnd) ?? "名もなき人",
        look: Math.floor(rnd() * LOOKS),
        age: 18 + Math.floor(rnd() * 36),
        traits: tr,
        origin: pickOf(origins),
      };
    });
  };
  const takeCand = (c) => {
    D.leader = { name: c.name, look: c.look, age: c.age, traits: c.traits.slice(), origin: c.origin };
  };
  const rollCapital = () => {
    const ok = sites.filter((s) => !D.regime || !regimeGate(civ, civ.groups[s.groupId], D.regime)).slice(0, 60);
    const s = pickOf(ok.length ? ok : sites);
    if (s) {
      D.capital = { groupId: s.groupId };
      refreshCap();
    }
  };
  const rollAll = () => {
    if (!D.capital && !rb && !rf) rollCapital();
    const ids = regimeIds();
    if (!D.regime && ids.length) {
      D.regime = pickOf(ids);
      D.offices = defaultOffices(D.regime);
    }
    rollName();
    rollFlag();
    rollCands();
    takeCand(D.cands[0]);
  };

  const refreshCap = () => {
    if (!D.capital) {
      capInfo = null;
      return;
    }
    const p = planCapital(w, D.capital);
    if (!p.ok) {
      capInfo = { error: p.error };
      return;
    }
    const gid = p.groupId ?? p.parentId,
      g = civ.groups[gid],
      realm = planRealm(w, gid),
      why = D.regime ? regimeGate(civ, g, D.regime) : null;
    const dom = g.cohorts.reduce((b, c) => (c.share > b.share ? c : b));
    const lid = languageOfGroup(g);
    if (lid) ensureProfile(civ, lid);
    capInfo = {
      kind: p.kind,
      pop: p.pop,
      realm,
      gid,
      why,
      cell: p.cell,
      culture: civ.cultures[dom.cultureId]?.name,
      religion: civ.religions[dom.religionId]?.name,
      language: lid ? civ.languages[lid]?.name : null,
    };
  };

  /* ---- 各ステップ ---- */
  const diceField = (input, onRoll, id) => h("div", { class: "dicefield" }, input, dieBtn(onRoll, { id }));
  const stepName = () => {
    if (!D.name) rollName();
    const inp = h("input", {
      id: "wz-name",
      value: D.name,
      maxlength: 30,
      placeholder: "国の名",
      oninput: (e) => {
        D.name = e.target.value;
        D.nameAuto = false;
        D.nameParts = null;
        renderFoot();
        renderPreview();
      },
    });
    return h(
      "div",
      { class: "wstep" },
      diceField(
        inp,
        () => {
          rollName();
          inp.value = D.name;
          renderFoot();
          renderPreview();
        },
        "wz-dice-name",
      ),
      lang() ? h("div", { class: "wlang" }, lang().name) : null,
    );
  };
  const stepFlag = () => {
    if (!D.flag) rollFlag();
    const big = h("div", { class: "wflagbig" }),
      chips = h("div", { class: "wflagctl" });
    const paint = () => {
      D.flag = normalizeFlag(D.flag);
      const f = D.flag;
      big.replaceChildren(flagEl(f, 300));
      const swatch = (cur, on) =>
        h(
          "div",
          { class: "wsw" },
          ...Object.entries(FLAG_COLORS).map(([k, c]) =>
            h("button", {
              class: "sw" + (cur === k ? " on" : ""),
              style: `background:${c}`,
              title: k,
              onclick: () => on(k),
            }),
          ),
        );
      const fieldRow = h(
        "div",
        { class: "wchipsrow" },
        ...FLAG_FIELDS.map((x) =>
          h(
            "button",
            {
              class: "fchip" + (f.field.kind === x.kind ? " on" : ""),
              title: x.ja,
              onclick: () => {
                D.flag = { ...f, field: { kind: x.kind, c: f.field.c.slice() } };
                paint();
                renderPreview();
              },
            },
            flagEl(
              {
                field: { kind: x.kind, c: [f.field.c[0], f.field.c[1] ?? "white", f.field.c[2] ?? f.field.c[0]] },
                charge: null,
              },
              66,
            ),
          ),
        ),
      );
      const chRow = h(
        "div",
        { class: "wchipsrow" },
        ...FLAG_CHARGES.map((x) =>
          h(
            "button",
            {
              class: "fchip" + ((f.charge?.kind ?? "none") === x.kind ? " on" : ""),
              title: x.ja,
              onclick: () => {
                D.flag = {
                  ...f,
                  charge:
                    x.kind === "none"
                      ? null
                      : {
                          kind: x.kind,
                          c: f.charge?.c ?? (isMetal(f.field.c[1] ?? f.field.c[0]) ? "red" : "white"),
                          size: f.charge?.size ?? 1,
                        },
                };
                paint();
                renderPreview();
              },
            },
            x.kind === "none"
              ? h("span", { class: "nochg" }, "—")
              : flagEl(
                  {
                    field: { kind: "plain", c: [f.field.c[0]] },
                    charge: { kind: x.kind, c: f.field.c[0] === "white" ? "red" : "white", size: 1 },
                  },
                  66,
                ),
          ),
        ),
      );
      const slots = f.field.c.map((cur, idx) =>
        h(
          "div",
          { class: "wslot" },
          swatch(cur, (k) => {
            const c = f.field.c.slice();
            c[idx] = k;
            D.flag = { ...f, field: { ...f.field, c } };
            paint();
            renderPreview();
          }),
        ),
      );
      const chSlot = f.charge
        ? h(
            "div",
            { class: "wslot" },
            swatch(f.charge.c, (k) => {
              D.flag = { ...f, charge: { ...f.charge, c: k } };
              paint();
              renderPreview();
            }),
          )
        : null;
      chips.replaceChildren(fieldRow, chRow, h("div", { class: "wslots" }, ...slots, chSlot));
    };
    paint();
    return h(
      "div",
      { class: "wstep wflag" },
      h(
        "div",
        { class: "wflagleft" },
        big,
        dieBtn(
          () => {
            rollFlag();
            paint();
            renderPreview();
          },
          { id: "wz-dice-flag" },
        ),
      ),
      chips,
    );
  };
  const stepRegime = () =>
    h(
      "div",
      { class: "wstep" },
      h(
        "div",
        { class: "wgrid" },
        ...POLITY_GROUPS.flatMap((gp) => { // v7.1.0: 30 の政体を、6 つの系統に分けて並べる
          const ids = regimeIds().filter((id) => REGIMES[id].group === gp.id); if (!ids.length) return [];
          return [h("div", { class: "wgh" }, h("b", {}, gp.ja), h("small", {}, gp.note)), ...ids.map((id) => {
          const r = REGIMES[id],
            on = D.regime === id;
          return h(
            "button",
            {
              class: "wcard" + (on ? " on" : ""),
              "data-regime": id,
              onclick: () => {
                D.regime = id;
                D.offices = defaultOffices(id);
                render();
              },
            },
            h("b", {}, r.ja),
            h("small", {}, r.blurb),
            h("small", { class: "dim" }, `${r.center ? "統治の中心: " + r.center + "・" : ""}${officeJa(r.ruler)}${r.heredity ? "・世襲" : ""}`),
          );
        })];
        }),
      ),
    );
  const stepOffices = () => {
    const r = REGIMES[D.regime],
      set = new Set(D.offices);
    return h(
      "div",
      { class: "wstep" },
      h(
        "div",
        { class: "wgrid o" },
        ...r.offices.map((id) => {
          const dom = OFFICE_DOMAIN_JA[OFFICES[id]?.[1]] ?? "",
            ruler = id === r.ruler,
            on = set.has(id);
          return h(
            "button",
            {
              class: "wcard" + (on ? " on" : ""),
              "data-office": id,
              disabled: ruler,
              onclick: () => {
                on ? set.delete(id) : set.add(id);
                D.offices = r.offices.filter((x) => set.has(x));
                render();
              },
            },
            h("b", {}, officeJa(id)),
            h("small", { class: "dim" }, ruler ? "元首" : dom),
          );
        }),
      ),
      h("div", { class: "wcount" }, `${D.offices.length}`),
    );
  };
  const stepLeader = () => {
    if (!D.cands.length) {
      rollCands();
      if (!D.leader.name) takeCand(D.cands[0]);
    }
    const inp = h("input", {
      id: "wz-leader",
      value: D.leader.name,
      maxlength: 30,
      placeholder: "名",
      oninput: (e) => {
        D.leader.name = e.target.value;
        renderFoot();
      },
    });
    const card = (c) => {
      const on = D.leader.name === c.name && D.leader.look === c.look;
      return h(
        "button",
        {
          class: "wcand" + (on ? " on" : ""),
          "data-cand": c.name,
          onclick: () => {
            takeCand(c);
            render();
          },
        },
        face(c.name, "new", c.look),
        h("b", {}, c.name),
        h("small", {}, `${c.age} 歳・${c.origin}`),
        h("span", { class: "wtraits" }, ...c.traits.map((k) => h("i", {}, LEADER_TRAITS[k]))),
      );
    };
    return h(
      "div",
      { class: "wstep" },
      h(
        "div",
        { class: "wcands" },
        ...D.cands.map(card),
        dieBtn(
          () => {
            rollCands();
            render();
          },
          { id: "wz-dice-cands", class: "die big" },
        ),
      ),
      h("div", { class: "wlabel" }, "名"),
      diceField(
        inp,
        () => {
          D.leader.name = nameGen?.person?.(civ, langGroup(), rnd) ?? D.leader.name;
          inp.value = D.leader.name;
          renderFoot();
          renderPreview();
        },
        "wz-dice-leader",
      ),
      h(
        "div",
        { class: "wfaces" },
        ...Array.from({ length: LOOKS }, (_, k) =>
          h(
            "button",
            {
              class: "wface" + (D.leader.look === k ? " on" : ""),
              "data-look": k,
              onclick: () => {
                D.leader.look = k;
                render();
              },
            },
            face(D.leader.name || "—", "new", k),
          ),
        ),
      ),
    );
  };
  const stepCapital = () => {
    const host = h("div", { class: "wizmap" }),
      cv = h("canvas", { id: "wz-map" });
    host.append(
      cv,
      dieBtn(
        () => {
          rollCapital();
          pins();
          paint();
          map?.draw();
          renderFoot();
        },
        { id: "wz-dice-cap", class: "die overmap" },
      ),
    );
    const info = h("div", { class: "wcap", id: "wz-cap" });
    const capCell = () => capInfo?.cell;
    const pins = () => {
      if (!map) return;
      map.pins = [
        ...sites
          .filter((s) => !D.regime || !regimeGate(civ, civ.groups[s.groupId], D.regime))
          .map((s) => ({ cell: s.cell, color: "#f0c14d" })),
        ...(D.capital && capInfo && !capInfo.error ? [{ cell: capCell(), big: true, color: "#ff8a5c" }] : []),
      ];
    };
    const paint = () => {
      if (!capInfo) info.replaceChildren();
      else if (capInfo.error) info.replaceChildren(h("p", { class: "n err" }, capInfo.error));
      else
        info.replaceChildren(
          h(
            "div",
            { class: "wcapinfo" },
            h("div", { class: "wcapk" }, h("small", {}, "人口"), h("b", {}, n0(capInfo.pop))),
            h("div", { class: "wcapk" }, h("small", {}, "領域"), h("b", {}, `${capInfo.realm.groupIds.length}`)),
            capInfo.culture ? h("div", { class: "wcapk" }, h("small", {}, "文化"), h("b", {}, capInfo.culture)) : null,
            capInfo.language
              ? h("div", { class: "wcapk" }, h("small", {}, "言語"), h("b", {}, capInfo.language))
              : null,
            capInfo.religion
              ? h("div", { class: "wcapk" }, h("small", {}, "宗教"), h("b", {}, capInfo.religion))
              : null,
          ),
        );
    };
    queueMicrotask(() => {
      map = new MapView(cv, w);
      map.layers = new Set(["states", "relief", "rivers", "borders", "cities"]);
      map.onPick = (p) => {
        const free = p.settlement && civ.groups[p.settlement.groupId] && !civ.groups[p.settlement.groupId].stateId;
        D.capital = free ? { groupId: p.settlement.groupId } : { cell: p.cell };
        refreshCap();
        pins();
        paint();
        map.draw();
        renderFoot();
      };
      pins();
      map.draw();
      if (D.capital) {
        refreshCap();
        pins();
        paint();
        map.draw();
      }
    });
    paint();
    return h("div", { class: "wstep" }, host, info);
  };
  const stepDoctrine = () => {
    const dc = doctrineChoices(w, []);
    return h(
      "div",
      { class: "wstep" },
      h(
        "div",
        { class: "wgrid o" },
        h(
          "button",
          {
            class: "wcard" + (D.doctrine == null ? " on" : ""),
            onclick: () => {
              D.doctrine = null;
              render();
            },
          },
          h("b", {}, "選ばない"),
        ),
        ...dc.map((d) =>
          h(
            "button",
            {
              class: "wcard" + (D.doctrine === d.id ? " on" : ""),
              "data-doc": d.id,
              onclick: () => {
                D.doctrine = d.id;
                render();
              },
            },
            h("b", {}, d.ja),
          ),
        ),
      ),
    );
  };
  const spec = () => ({
    name: D.nameAuto ? "" : D.name.trim(),
    nameParts: D.nameAuto ? D.nameParts : null,
    flag: D.flag,
    regime: D.regime,
    offices: D.offices,
    leader: {
      name: D.leader.name.trim(),
      look: D.leader.look,
      age: D.leader.age,
      traits: D.leader.traits,
      origin: D.leader.origin,
    },
    techs: [],
    doctrine: D.doctrine,
  });
  const stepConfirm = () => {
    const r = REGIMES[D.regime];
    return h(
      "div",
      { class: "wstep" },
      h(
        "div",
        { class: "wsum" },
        mode !== "reform" ? flagEl(D.flag, 220) : null,
        h(
          "div",
          { class: "wsumtxt" },
          mode !== "reform" ? h("h2", {}, previewName()) : null,
          h(
            "div",
            { class: "wsumrow" },
            face(D.leader.name, "new", D.leader.look),
            h(
              "div",
              {},
              h("b", {}, D.leader.name),
              h("div", { class: "n" }, `${r.ja}・${officeJa(r.ruler)}`),
              h("span", { class: "wtraits" }, ...(D.leader.traits ?? []).map((k) => h("i", {}, LEADER_TRAITS[k]))),
            ),
          ),
        ),
      ),
      msg ? h("p", { class: "n err", id: "wz-err" }, msg) : null,
    );
  };
  const body$ = {
    name: stepName,
    flag: stepFlag,
    regime: stepRegime,
    offices: stepOffices,
    leader: stepLeader,
    capital: stepCapital,
    doctrine: stepDoctrine,
    confirm: stepConfirm,
  };
  const valid = (k) =>
    k === "name"
      ? D.name.trim().length > 0
      : k === "regime"
        ? !!D.regime
        : k === "offices"
          ? D.offices.length >= MIN_OFFICES
          : k === "leader"
            ? D.leader.name.trim().length > 0
            : k === "capital"
              ? !!capInfo && !capInfo.error && !capInfo.why
              : true;
  const submit = () => {
    let r;
    if (mode === "player") r = act({ type: "founding.found", ...spec(), capital: D.capital });
    else if (mode === "creator") r = creator({ type: "creator.found", ...spec(), capital: D.capital });
    else if (mode === "rebel")
      r = act({
        type: "uprising.start",
        stateId: rb.stateId,
        kind: rb.kind,
        cell: rb.cell,
        asState: true,
        found: spec(),
      });
    else
      r = act({
        type: "uprising.start",
        stateId: rf.stateId,
        kind: rf.kind,
        cell: rf.cell,
        reform: { regime: D.regime, offices: D.offices, leader: spec().leader },
      });
    const res = r.result ?? r;
    if (!r.ok || res.ok === false) {
      msg = res.error ?? r.error ?? "実行できませんでした";
      render();
      return;
    }
    close();
    opts.onDone?.(res);
  };
  const previewBox = h("div", { class: "wpreview" });
  function renderPreview() {
    previewBox.replaceChildren(
      D.flag && mode !== "reform" ? flagEl(D.flag, 54) : null,
      D.name && mode !== "reform" ? h("b", {}, previewName()) : null,
      D.leader.name ? h("small", {}, D.leader.name) : null,
    );
  }
  function renderFoot() {
    const k = steps[i],
      last = i === steps.length - 1;
    foot.replaceChildren(
      btn(
        "やめる",
        () => {
          close();
          opts.onCancel?.();
        },
        "",
        { id: "wz-cancel" },
      ),
      h("span", { style: "flex:1" }),
      i > 0
        ? btn(
            "戻る",
            () => {
              i--;
              msg = "";
              render();
            },
            "",
            { id: "wz-back" },
          )
        : null,
      last
        ? btn(
            mode === "player" || mode === "creator" ? "建国する" : mode === "reform" ? "決行する" : "反乱を起こす",
            submit,
            "p big",
            { id: "wz-go" },
          )
        : btn(
            "次へ",
            () => {
              if (steps[i] === "capital") refreshCap();
              if (steps[i + 1] === "name" && !D.name) rollName();
              i++;
              msg = "";
              render();
            },
            "p big",
            { id: "wz-next", disabled: !valid(k) },
          ),
    );
  }
  function render() {
    const k = steps[i];
    try {
      map?.destroy?.();
    } catch {
      /* */
    }
    if (k !== "capital") map = null;
    head.replaceChildren(
      h(
        "div",
        { class: "wizrow" },
        h("h1", {}, STEP_TITLE[k] ?? ""),
        previewBox,
        mode !== "reform"
          ? h(
              "button",
              {
                class: "b rollall",
                id: "wz-dice-all",
                onclick: () => {
                  rollAll();
                  i = steps.length - 1;
                  render();
                },
              },
              dieIcon(),
              h("span", {}, "すべて振る"),
            )
          : null,
      ),
      h(
        "div",
        { class: "wsteps" },
        ...steps.map((s, j) =>
          h(
            "span",
            { class: "wstp" + (j === i ? " on" : j < i ? " done" : "") },
            h("i", {}, String(j + 1)),
            h("em", {}, STEP_JA[s]),
          ),
        ),
      ),
    );
    renderPreview();
    body.replaceChildren(body$[k]());
    renderFoot();
  }
  root._test = { pick: (p) => map?.onPick?.(p), D }; // 試験用の入口（画面の操作と同じ経路）
  render();
  return { close };
}
