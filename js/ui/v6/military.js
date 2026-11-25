// v6.12.0: 軍。担当国の軍団（名前のある部隊）を一覧し、指揮官・副官の人事、部隊の編成（改名・分割・統合・兵の移動・再訓練）、作戦の命令（進軍・包囲・守備・撤退・待機）を出す。
//   軍団の位置と行軍ルートは地図に出る。命令は担当国だけ。実際の移動と戦闘は戦争エンジンが毎月進める。
import { h, btn, holdBtn, pct, n0, lb, bar, face, FACTION_JA } from "./common.js";
import { notify } from "./notify.js";
import { covertChance, COVERT, NUKE, canNuke } from "../../core/wcde/special-ops.js";
import { LINE_BY_ID } from "../../core/wcde/domains/doctrine.js";
import { S, act, controlled } from "./store.js";
import { colorOf } from "./common.js";
import { corpsView, ORDER_KINDS, OFFICER_SLOTS, TRAITS, marchSteps, rankOf } from "../../core/wcde/corps.js";
import { SERVICES, SERVICE_KEYS, serviceOf, itemsOf } from "../../core/wcde/orbat.js";
import { UNIT_KINDS } from "../../core/wcde/domains/military.js";
import { distKm } from "../../core/civ/states.js";

const civ = () => S.w.civ,
  ctx = () => S.w.sim.ctx,
  n = (t) => h("p", { class: "n" }, t);
const sgn = (x) => (x >= 0 ? "+" : "") + Math.round(x * 100) + "%";
const placeOf = (gid) => {
  const g = civ().groups[gid];
  if (!g) return "—";
  const s = civ().settlements[g.settlementId];
  return s?.name ?? `${civ().states[g.stateId]?.name ?? "無主"}の地`;
};
const traitChips = (p) =>
  (p.traits ?? []).map((t) => {
    const T = TRAITS[t];
    if (!T) return null;
    const fx = ["off", "def", "siege", "logi", "coh"]
      .map((k) => (T[k] ? `${{ off: "攻", def: "守", siege: "包囲", logi: "補給", coh: "士気" }[k]}${sgn(T[k])}` : ""))
      .filter(Boolean)
      .join(" ");
    const bad = Object.values(T).some((v) => typeof v === "number" && v < 0);
    return h("span", { class: "chip trait" + (bad ? " bad" : ""), title: fx }, T.ja);
  });
const personLine = (p) =>
  `${rankOf(p)} ${p.name}（能力 ${Math.round(p.skill * 100)}・${(p.traits ?? []).map((t) => TRAITS[t]?.ja ?? t).join("・") || "特性なし"}・${FACTION_JA[p.backer] ?? p.backer}）`;
const orderText = (cp) => {
  const o = cp.order,
    k = ORDER_KINDS[o.kind] ?? o.kind;
  if (!o.targetGroupId) return k;
  const left = o.route?.length ?? 0;
  return `${k}：${placeOf(o.targetGroupId)}${left ? `（あと ${left} 区画・約 ${Math.max(1, Math.ceil(left / marchSteps(ctx(), civ().states[S.w.civ.wcde.control.stateId])))} か月）` : "（到着）"}`;
};
const myWars = (st) => st.warIds.map((i) => civ().wars[i]).filter((w) => w?.status === "active");
const sideOf = (w, id) => (w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null);

/** 命令の目標の候補: 進軍・包囲は敵の土地、守備・撤退は味方の土地（今いる場所に近い順に 40） */
function targets(st, cp, kind, war) {
  const c = civ(),
    here = c.groups[cp.at],
    out = [],
    foe = war ? new Set(war.sides[sideOf(war, st.id) === "a" ? "d" : "a"]) : new Set(),
    mine = new Set(war ? war.sides[sideOf(war, st.id)] : [st.id]);
  for (const g of Object.values(c.groups)) {
    if (!g.stateId) continue;
    const ok = kind === "march" || kind === "siege" ? foe.has(g.stateId) : mine.has(g.stateId);
    if (ok)
      out.push({
        id: g.id,
        d: here ? distKm(S.w.world, here.cell, g.cell) : 0,
        label: `${placeOf(g.id)}（${c.states[g.stateId]?.name ?? ""}）`,
      });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, 40);
}

function personBox(cp, slot, st, pool) {
  pool = pool.filter((q) => (q.service ?? "land") === (cp.service ?? "land")); // v6.13.0: その軍の人物だけが候補
  const p = slot === "commander" ? cp.commander : cp.officers[slot],
    title = slot === "commander" ? `${SERVICES[cp.service ?? "land"].formation}の最高指揮官` : OFFICER_SLOTS[slot];
  const sel = h(
    "select",
    { "data-slot": slot },
    h("option", { value: "" }, pool.length ? "候補から任命…" : "候補はいません"),
    ...pool.map((q) => h("option", { value: q.id }, personLine(q))),
  );
  return h(
    "div",
    { class: "pbox" },
    h("small", {}, title),
    p
      ? h(
          "div",
          { class: "prow" },
          face(p.name, st.id),
          h(
            "div",
            {},
            h("b", {}, p.name),
            h("div", { class: "bar2" }, "能力", bar(p.skill, "#6fa8c9"), h("small", {}, `経験 ${p.xp ?? 0}`)),
            h(
              "div",
              { class: "chips" },
              ...traitChips(p),
              h("span", { class: "chip" }, `${FACTION_JA[p.backer] ?? p.backer}が支持`),
            ),
          ),
        )
      : n("（空き）"),
    h(
      "div",
      { class: "rowb" },
      sel,
      btn(
        "任命",
        () => {
          if (sel.value) act({ type: "corps.appoint", stateId: st.id, corpsId: cp.id, slot, personId: sel.value });
        },
        "",
        { "data-appoint": slot },
      ),
      slot !== "commander" && p
        ? btn("解任", () => act({ type: "corps.dismiss", stateId: st.id, corpsId: cp.id, slot }), "")
        : null,
    ),
  );
}

/** 軍団の詳細（全面タブ） */
function corpsDetail(cp, view, st) {
  const c = civ(),
    wars = myWars(st),
    war = c.wars[cp.warId] ?? wars[0] ?? null,
    out = h("div", { class: "corpsdetail" });
  const nm = h("input", { id: "cp-name", value: cp.name, maxlength: 20 });
  out.append(
    h(
      "div",
      { class: "whead" },
      h("h2", {}, cp.name),
      h("div", { class: "sub" }, `兵力 ${n0(cp.size)}・現在地 ${placeOf(cp.at)}・${orderText(cp)}`),
    ),
    h(
      "div",
      { class: "rowb" },
      nm,
      btn("改名", () => act({ type: "corps.rename", stateId: st.id, corpsId: cp.id, name: nm.value }), "", {
        id: "cp-rename",
      }),
    ),
  );
  out.append(
    h(
      "div",
      { class: "sub" },
      `${SERVICES[cp.service ?? "land"].ja}・${cp.commander ? rankOf(cp.commander) : ""}・${cp.comp === "manual" ? "手動の構成" : "自動の構成"}`,
    ),
  );
  const fx = cp.fx;
  out.append(
    h(
      "div",
      { class: "chips fxs" },
      ...[
        ["攻め", fx.off + fx.skill],
        ["守り", fx.def + fx.skill],
        ["包囲", fx.siege],
        ["補給", fx.logi],
        ["士気", fx.coh],
      ].map(([k, v]) => h("span", { class: "chip" + (v < 0 ? " bad" : v > 0 ? " good" : "") }, `${k} ${sgn(v)}`)),
    ),
  );
  out.append(
    lb("指揮官と副官", "COMMAND"),
    personBox(cp, "commander", st, view.pool),
    ...Object.keys(OFFICER_SLOTS).map((s) => personBox(cp, s, st, view.pool)),
  );
  // 作戦の命令
  const kind = h(
      "select",
      { id: "cp-kind" },
      ...Object.entries(ORDER_KINDS)
        .filter(([k]) =>
          cp.service === "air"
            ? ["auto", "hold", "reserve"].includes(k)
            : cp.service === "sea"
              ? ["auto", "hold", "reserve", "defend"].includes(k)
              : true,
        )
        .map(([k, ja]) => h("option", { value: k, selected: cp.order.kind === k }, ja)),
    ),
    tgt = h("select", { id: "cp-target" }),
    wsel = h(
      "select",
      { id: "cp-war" },
      ...wars.map((x) => h("option", { value: x.id, selected: x.id === war?.id }, x.name ?? x.id)),
    );
  const fill = () => {
    const k = kind.value;
    tgt.replaceChildren();
    tgt.disabled = !["march", "siege", "defend", "retreat"].includes(k);
    if (tgt.disabled) return;
    const w2 = c.wars[wsel.value] ?? war;
    const list = targets(st, cp, k, w2);
    tgt.append(
      h("option", { value: "" }, list.length ? "目標を選ぶ…" : "目標にできる土地がありません"),
      ...list.map((t) =>
        h("option", { value: t.id, selected: cp.order.targetGroupId === t.id }, `${t.label}・約 ${n0(t.d)} km`),
      ),
    );
  };
  kind.addEventListener("change", fill);
  wsel.addEventListener("change", fill);
  fill();
  out.append(
    lb("作戦の命令", "ORDERS"),
    n(
      "進軍は敵の土地へ。着くと作戦が始まる。包囲は城や都市を攻め、複数の軍団で同じ目標を包囲すると速く落とせる。守備は味方の土地で迎え撃つ。撤退は戦わず退く。お任せは従来どおり自動で動く。",
    ),
    h(
      "div",
      { class: "rowb" },
      kind,
      tgt,
      wars.length ? wsel : null,
      btn(
        "命令する",
        () =>
          act({
            type: "corps.order",
            stateId: st.id,
            corpsId: cp.id,
            kind: kind.value,
            targetGroupId: tgt.disabled ? null : tgt.value || null,
            warId: wars.length ? wsel.value : null,
          }),
        "p",
        { id: "cp-order" },
      ),
    ),
  );
  // 部隊
  const others = view.list.filter((x) => x.id !== cp.id && x.at === cp.at && x.service === cp.service);
  out.append(
    lb("部隊", "UNITS"),
    ...cp.units.map((u) => {
      const inp = h("input", { value: u.name, maxlength: 20, "data-unit": u.id }),
        kinds = Object.entries(UNIT_KINDS).filter(([k, K]) => K.service === cp.service && K.need(st, ctx())),
        ks = h(
          "select",
          {},
          h("option", { value: "" }, "兵種を変える…"),
          ...kinds.map(([k, K]) => h("option", { value: k }, K.ja)),
        ),
        to = h(
          "select",
          {},
          h("option", { value: "" }, others.length ? "移す先の軍団…" : "同じ場所に他の軍団がない"),
          ...others.map((x) => h("option", { value: x.id }, x.name)),
        ),
        sz = h("input", {
          type: "number",
          min: 1,
          max: Math.floor(u.size),
          value: Math.max(1, Math.floor(u.size / 2)),
          style: "width:80px",
        });
      return h(
        "div",
        { class: "unit" },
        h(
          "div",
          { class: "rowb" },
          inp,
          h("b", {}, `${UNIT_KINDS[u.kind]?.ja ?? u.kind} ${n0(u.size)}`),
          btn("改名", () =>
            act({ type: "corps.renameUnit", stateId: st.id, corpsId: cp.id, unitId: u.id, name: inp.value }),
          ),
        ),
        h(
          "div",
          { class: "rowb" },
          ks,
          btn("再訓練", () => {
            if (ks.value)
              act({ type: "corps.convert", stateId: st.id, corpsId: cp.id, unitId: u.id, toKind: ks.value });
          }),
          to,
          sz,
          btn("兵を移す", () => {
            if (to.value)
              act({
                type: "corps.transfer",
                stateId: st.id,
                from: cp.id,
                to: to.value,
                unitId: u.id,
                size: Number(sz.value),
              });
          }),
        ),
      );
    }),
  );
  // v6.13.0: 部隊の構成（兵種ごとの人数）。自動なら国家の人数を重みで分ける。手動なら人数を指定する
  {
    const avail = Object.entries(UNIT_KINDS).filter(([k, K]) => K.service === cp.service && K.need(st, ctx())),
      val = Object.fromEntries(avail.map(([k]) => [k, Math.round(cp.units.find((u) => u.kind === k)?.size ?? 0)])),
      inps = {},
      wt = h("input", {
        id: "cp-weight",
        type: "number",
        min: 0.2,
        max: 5,
        step: 0.1,
        value: cp.weight ?? 1,
        style: "width:70px",
      });
    out.append(
      lb("構成（兵種ごとの人数）", "COMPOSITION"),
      n(
        cp.comp === "manual"
          ? "手動です。国家の人数（軍制）を超える兵種は、比例して縮みます。"
          : "自動です。国家の人数を、この軍の自動の部隊に重みで分けています。",
      ),
      ...avail.map(([k, K]) => {
        const i = h("input", {
          type: "number",
          min: 0,
          step: 50,
          value: val[k],
          "data-comp": k,
          style: "width:100px",
          oninput: (e) => {
            val[k] = Math.max(0, Math.round(Number(e.target.value) || 0));
          },
        });
        inps[k] = i;
        const it = itemsOf(k, val[k]);
        return h(
          "div",
          { class: "slrow" },
          h("span", { class: "nm", title: K.hint }, K.ja),
          i,
          h("small", {}, K.per ? `1${K.item}≒${K.per}人${it ? `・今 約${it}${K.item}` : ""}` : ""),
        );
      }),
      h(
        "div",
        { class: "rowb" },
        btn(
          "この構成にする（手動）",
          () => {
            const hs = {};
            for (const k in val) if (val[k] > 0) hs[k] = val[k];
            act({ type: "corps.setComposition", stateId: st.id, corpsId: cp.id, mode: "manual", heads: hs });
          },
          "p",
          { id: "cp-comp" },
        ),
        btn(
          "自動に戻す",
          () => act({ type: "corps.setComposition", stateId: st.id, corpsId: cp.id, mode: "auto" }),
          "",
          { id: "cp-comp-auto" },
        ),
        h("small", {}, "自動のときの重み"),
        wt,
        btn(
          "重みを変える",
          () =>
            act({
              type: "corps.setComposition",
              stateId: st.id,
              corpsId: cp.id,
              mode: cp.comp === "manual" ? "manual" : "auto",
              heads: cp.comp === "manual" ? cp.manual : undefined,
              weight: Number(wt.value),
            }),
          "",
          { id: "cp-weight-set" },
        ),
      ),
    );
  }
  // 分割・統合
  const sname = h("input", { id: "cp-split-name", placeholder: "新しい部隊の名前", maxlength: 20 }),
    frac = h("input", { id: "cp-split-frac", type: "range", min: 0.1, max: 0.9, step: 0.05, value: 0.4 }),
    pc = h(
      "select",
      { id: "cp-split-cmd" },
      h("option", { value: "" }, "指揮官の候補…"),
      ...view.pool
        .filter((q) => (q.service ?? "land") === (cp.service ?? "land"))
        .map((q) => h("option", { value: q.id }, personLine(q))),
    ),
    into = h(
      "select",
      { id: "cp-merge-into" },
      h("option", { value: "" }, others.length ? "統合先の軍団…" : "同じ場所に他の軍団がない"),
      ...others.map((x) => h("option", { value: x.id }, x.name)),
    );
  out.append(
    lb("編成", "ORGANIZE"),
    n(`軍団は ${view.max} まで。分けるときは、新しい軍団の指揮官を候補から選ぶ（費用：兵力の 0.1% × 割合）。`),
    h(
      "div",
      { class: "rowb" },
      sname,
      h("small", {}, "割合"),
      frac,
      pc,
      btn(
        "軍団を分ける",
        () =>
          act({
            type: "corps.split",
            stateId: st.id,
            corpsId: cp.id,
            name: sname.value,
            fraction: Number(frac.value),
            commanderId: pc.value,
          }),
        "",
        { id: "cp-split" },
      ),
    ),
    h(
      "div",
      { class: "rowb" },
      into,
      btn(
        "この軍団を統合する",
        () => {
          if (into.value) {
            S.corpsSel = into.value;
            act({ type: "corps.merge", stateId: st.id, from: cp.id, into: into.value });
          }
        },
        "",
        { id: "cp-merge" },
      ),
    ),
  );
  return out;
}

/** 左のパネル: 軍の概要と軍団の一覧。行を押すと全面タブで詳細 */
export function pMilitary() {
  const c = civ(),
    cs = controlled(),
    box = h("div", {}, h("div", { class: "code" }, "MILITARY"), h("h2", {}, "軍"));
  if (!cs) {
    box.append(n("担当国家がありません。国家を担当すると、軍団を率いて戦えます。"));
    return box;
  }
  const st = c.states[cs];
  const view = corpsView(ctx(), st);
  if (!view) {
    box.append(n("軍団を編成しています…"));
    setTimeout(() => {
      if (controlled() === cs && !c.states[cs].corps) act({ type: "corps.refresh", stateId: cs });
    }, 0);
    return box;
  }
  const sel = view.list.find((x) => x.id === S.corpsSel);
  if (sel)
    S.full = {
      key: "corps",
      title: sel.name,
      build: () => corpsDetail(sel, corpsView(ctx(), c.states[cs]), c.states[cs]),
      onClose: () => {
        S.corpsSel = null;
        S.map?.draw();
      },
    };
  const wars = myWars(st),
    H = view.heads;
  const dl = LINE_BY_ID[st.military?.doc?.line];
  box.append(
    h(
      "div",
      { class: "milhead" },
      ...["land", "sea", "air", "space"]
        .filter((k) => view.usable[k])
        .map((k) =>
          h(
            "div",
            { class: "mh", style: `border-color:${SERVICES[k].color}` },
            h("small", {}, SERVICES[k].ja),
            h("b", {}, n0(H[k] ?? 0)),
          ),
        ),
      dl
        ? h("div", { class: "mh", style: `border-color:${dl.color}` }, h("small", {}, "系統"), h("b", {}, dl.ja))
        : null,
    ),
    btn(
      "＋ 新しい軍団を編成する",
      () => {
        S.corpsNew ??= { svc: "land", name: "", cmd: null }; /* 画面を開いている状態は S.corpsNew が持つ（パネルを描き直すたびに S.full は作り直される） */
        S.hooks.panel();
      },
      "p",
      { id: "cp-new" },
    ),
  );
  // 総司令官（各軍に 1 人）
  if (S.corpsNew)
    S.full = {
      key: "corpsnew",
      title: "軍団の編成",
      build: () => newCorpsForm(st, view),
      onClose: () => {
        S.corpsNew = null;
      },
    };
  box.append(
    lb("総司令官", ""),
    ...SERVICE_KEYS.filter((k) => view.usable[k]).map((k) => {
      const ch = view.chiefs[k],
        pool = view.pool.filter((q) => (q.service ?? "land") === k),
        sel = h(
          "select",
          { "data-chief": k },
          h("option", { value: "" }, pool.length ? "候補から任命…" : "候補はいません"),
          ...pool.map((q) => h("option", { value: q.id }, personLine(q))),
        );
      return h(
        "div",
        { class: "pbox" },
        h("small", { style: `color:${SERVICES[k].color}` }, SERVICES[k].chief),
        ch
          ? h(
              "div",
              {},
              h("b", {}, `${ch.rank} ${ch.name}`),
              h(
                "div",
                { class: "chips" },
                ...traitChips(ch),
                h("span", { class: "chip" }, `能力 ${Math.round(ch.skill * 100)}`),
              ),
            )
          : n("（空き）　総司令官は、その軍の全部隊に小さく効きます。"),
        h(
          "div",
          { class: "rowb" },
          sel,
          btn(
            "任命",
            () => {
              if (sel.value) act({ type: "corps.appointChief", stateId: st.id, service: k, personId: sel.value });
            },
            "",
            { "data-appoint-chief": k },
          ),
          ch ? btn("解任", () => act({ type: "corps.dismissChief", stateId: st.id, service: k }), "") : null,
        ),
      );
    }),
  );
  for (const svc of SERVICE_KEYS) {
    const fl = view.list.filter((x) => x.service === svc);
    if (!fl.length) continue;
    box.append(
      lb(SERVICES[svc].ja, SERVICES[svc].formation.toUpperCase()),
      h(
        "div",
        { class: "corpslist" },
        ...fl.map((cp) =>
          h(
            "button",
            {
              class: "corpsrow" + (S.corpsSel === cp.id ? " on" : ""),
              "data-corps": cp.id,
              onclick: () => {
                S.corpsSel = cp.id;
                S.hooks.panel();
                S.hooks.mapOnly?.();
                const g = c.groups[cp.at];
                if (g) S.hooks.focusCell?.(g.cell);
              },
            },
            face(cp.commander.name, st.id),
            h(
              "div",
              { class: "crb" },
              h("div", { class: "cr1" }, h("b", {}, cp.name), h("span", {}, `${n0(cp.size)} 人`)),
              h(
                "div",
                { class: "cr2" },
                `${cp.rank ?? ""} ${cp.commander.name}${cp.commander.dead ? "（戦死）" : ""}・${placeOf(cp.at)}`,
              ),
              h(
                "div",
                { class: "bar2" },
                bar(cp.commander.skill, "#6fa8c9"),
                h(
                  "span",
                  { class: "chip" },
                  cp.order.kind === "auto" ? "自動" : (ORDER_KINDS[cp.order.kind] ?? cp.order.kind),
                ),
              ),
              h("div", { class: "chips" }, ...traitChips(cp.commander)),
            ),
          ),
        ),
      ),
    );
  }
  box.append(lb("特殊な作戦", "OPERATIONS"), opsBox(st));
  void pct;
  return box;
}

/** 地図の軍団の印（担当国の軍団。選んだ軍団は行軍ルートつき） */
export function corpsMarkers() {
  const cs = controlled();
  if (!cs) return [];
  const st = civ().states[cs],
    view = st ? corpsView(ctx(), st) : null;
  if (!view) return [];
  const col = colorOf(cs, 60);
  return view.list
    .map((cp, i) => {
      const g = civ().groups[cp.at];
      if (!g) return null;
      const sel = S.corpsSel === cp.id;
      return {
        cell: g.cell,
        label: String(i + 1),
        color: col,
        sel,
        route: sel ? (cp.order.route ?? []).map((id) => civ().groups[id]?.cell).filter((x) => x != null) : [],
        target: sel && cp.order.targetGroupId ? civ().groups[cp.order.targetGroupId]?.cell : null,
      };
    })
    .filter(Boolean);
}

/** v6.18.0: 新しい軍団の編成（軍・名前・指揮官を選ぶ。顔つきの候補から選ぶ） */
function newCorpsForm(st, view) {
  const F = (S.corpsNew ??= { svc: "land", name: "", cmd: null }),
    out = h("div", { class: "corpsdetail" }),
    svcs = ["land", "sea", "air", "space"].filter((k) => view.usable[k]);
  const pool = view.pool.filter((q) => (q.service ?? "land") === F.svc),
    nm = h("input", {
      id: "cn-name",
      value: F.name,
      maxlength: 20,
      placeholder: "名前（空なら自動）",
      oninput: (e) => {
        F.name = e.target.value;
      },
    });
  out.append(
    h("div", { class: "whead" }, h("h2", {}, "軍団の編成")),
    h(
      "div",
      { class: "rowb" },
      ...svcs.map((k) =>
        h(
          "button",
          {
            class: "b" + (F.svc === k ? " on" : ""),
            style: `border-color:${SERVICES[k].color}`,
            onclick: () => {
              F.svc = k;
              F.cmd = null;
              S.hooks.panel();
            },
          },
          SERVICES[k].ja,
        ),
      ),
    ),
    h("div", { class: "rowb" }, nm),
    h(
      "div",
      { class: "cands" },
      ...pool.map((q) =>
        h(
          "button",
          {
            class: "cand" + (F.cmd === q.id ? " sel" : ""),
            "data-cand": q.id,
            onclick: () => {
              F.cmd = q.id;
              S.hooks.panel();
            },
          },
          face(q.name, st.id),
          h(
            "div",
            { class: "ci" },
            h("b", {}, q.name),
            h("small", {}, q.rank),
            h("div", { class: "cb" }, bar(q.skill, "#6fa8c9")),
            h("div", { class: "chips" }, ...traitChips(q)),
          ),
        ),
      ),
    ),
    pool.length ? null : n("候補はいません"),
    h(
      "div",
      { class: "rowb" },
      btn(
        "編成する（25）",
        () => {
          const r = act({ type: "corps.create", stateId: st.id, service: F.svc, name: F.name, commanderId: F.cmd });
          if (r.ok) {
            S.corpsSel = r.result?.corpsId ?? null;
            S.corpsNew = null;
            S.full = null;
            S.hooks.panel();
          }
        },
        "p",
        { id: "cn-go", disabled: !F.cmd },
      ),
    ),
  );
  return out;
}
/** 核作戦・隠密作戦。使うかどうかはプレイヤーが決める。核は長押し、結果は通知と戦争の記録（地図の印）に残る */
function opsBox(st) {
  const c = civ(),
    O = (S.ops ??= { foe: null, scale: "tactical" }),
    foes = Object.values(c.states)
      .filter((x) => x.alive && x.id !== st.id)
      .sort((a, b) => (st.relations?.[a.id] ?? 0) - (st.relations?.[b.id] ?? 0))
      .slice(0, 14),
    atWar = (x) => myWars(st).some((w) => w.sides.a.includes(x.id) || w.sides.d.includes(x.id));
  if (!O.foe || !c.states[O.foe]?.alive) O.foe = (foes.find(atWar) ?? foes[0])?.id ?? null;
  const foe = c.states[O.foe],
    box = h("div", { class: "opsb" });
  const sel = h(
    "select",
    {
      id: "ops-foe",
      onchange: (e) => {
        O.foe = e.target.value;
        S.hooks.panel();
      },
    },
    ...foes.map((x) =>
      h("option", { value: x.id, selected: x.id === O.foe }, `${x.name}${atWar(x) ? "（交戦中）" : ""}`),
    ),
  );
  box.append(h("div", { class: "rowb" }, sel));
  if (foe)
    box.append(
      h(
        "div",
        { class: "opsk" },
        ...Object.entries(COVERT).map(([k, K]) => {
          const p = covertChance(ctx(), st, foe, k),
            dis = k === "rescue" && !atWar(foe);
          return h(
            "button",
            {
              class: "opk",
              "data-covert": k,
              disabled: dis,
              title: K.hint,
              onclick: () => {
                const r = act({ type: "ops.covert", stateId: st.id, kind: k, target: foe.id });
                if (r.ok) notifyOp(r.result ?? r);
              },
            },
            h("b", {}, K.ja),
            h("small", {}, `成功 ${Math.round(p * 100)}%・費用 ${K.cost}`),
          );
        }),
      ),
    );
  if (foe && canNuke(st) && atWar(foe)) {
    const N = NUKE[O.scale];
    box.append(
      h(
        "div",
        { class: "nuke" },
        h(
          "div",
          { class: "rowb" },
          ...Object.entries(NUKE).map(([k, v]) =>
            h(
              "button",
              {
                class: "b" + (O.scale === k ? " on" : ""),
                onclick: () => {
                  O.scale = k;
                  S.hooks.panel();
                },
              },
              v.ja,
            ),
          ),
        ),
        holdBtn(
          `${N.ja}を使う（${N.cost}）`,
          () => {
            const r = act({ type: "ops.nuclear", stateId: st.id, target: foe.id, scale: O.scale });
            if (r.ok) notifyOp(r.result ?? r);
          },
          "danger",
          { id: "ops-nuke" },
          1800,
        ),
      ),
    );
  }
  return box;
}
function notifyOp(r) {
  let t2 =
    r.text ??
    (r.dead != null
      ? `${r.where}で ${n0(r.dead)} 人が失われた${r.retaliation ? `。報復: ${r.retaliation.where}で ${n0(r.retaliation.dead)} 人` : ""}`
      : "");
  if (r.note) t2 += `（${r.note}）`;
  notify(r.success === false ? "warn" : "ok", t2);
}
