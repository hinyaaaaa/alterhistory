// 外交ウィンドウ。国どうしの取り決めは、すべて「条約」として扱う。
//   ・3列: 左に国のリスト（バッジ）／中央に選んだ国の関係カード（同盟と、戦争した国=敵対。同盟の拘束力は弱・中・強）／右に条約の一覧。
//     条約の参加国は後から変えられる（チップの × で外し、＋ で足す）。外交の表は無い。宣戦布告は国家タブにある。
//   ・「条約を結ぶ」: 種類 → 当事国（複数可）→ 条項（種類ごとの最小限の入力。既定値は自動）→ 締結。
//     名称は自動で付け、上書きできる。確定するまで、何も作らず、年表にも残さない。
//   ・締結後に、条約の中身（重ねて開く詳細ウィンドウ）で、期限・改定・破棄ができる。破棄は違約の扱いを伴う。
//   ・条約の種類は 安全保障（参戦義務）/ 経済協力（貿易量）/ 共同宣言 / 不可侵・中立 の4つ。従属は国家タブ、講和は戦争の講和画面から。
//   横タブは使わず、縦に並べた節と、重ねて開く窓で扱う。
import { el, btn } from "./kit.js";
import { confirmDialog } from "./dialogs.js";
import {
  TREATY_KINDS, TREATY_BY_KEY, SIGNABLE_KINDS, BIND_LEVELS, TARIFFS, DECLARATIONS, PERIODS, STATUS_LABEL,
  listTreaties, treatyStatus, treatyText, autoName, partyIds, badgesOf, activeTreaties, NONAGG_MODES,
} from "../core/edit/treaties.js";
import { VASSAL_KINDS } from "../core/edit/vassals.js";
import { activeWars, listWars } from "../core/edit/wars.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const nm = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
const fmt = (d) => (d ? `${d.year}年${d.month}月` : "—");
const selectOf = (options, value) => { const s = document.createElement("select"); for (const [v, label] of options) s.append(new Option(label, String(v))); if (value != null) s.value = String(value); return s; };

export function initDiplomacyWindow({ store, wins, simActions, getWarsPanel }) {
  const body = el("div", "dip-body");
  let focus = null;           // 条約の一覧を見ている国
  let detailId = null;        // 詳細ウィンドウで開いている条約

  // ---- 条約の中身（重ねて開く詳細ウィンドウ） ----
  const detailHost = el("div", "treaty-detail");
  function renderDetail() {
    detailHost.replaceChildren();
    const map = store.getState().map; const t = map && listTreaties(map).find((x) => x.id === detailId);
    if (!t) { detailHost.append(el("p", "muted", "条約がありません")); return; }
    const status = treatyStatus(t, map.worldTime);
    const active = status === "active" && t.kind !== "peace";
    const head = el("div", "treaty-head");
    const name = el("input", "treaty-name"); name.value = t.name; name.disabled = !active; name.title = "条約の名前";
    head.append(name, el("span", `treaty-status ${status}`, STATUS_LABEL[status]));
    detailHost.append(head, el("p", "hint", `${TREATY_BY_KEY[t.kind].label} ／ 締結 ${fmt(t.signedAt)} ／ 期限 ${t.expiresAt ? fmt(t.expiresAt) : "無期限"}${t.endedAt ? ` ／ 終了 ${fmt(t.endedAt)}${t.brokenBy != null ? `（${nm(map, t.brokenBy)}が破棄）` : ""}` : ""}`));
    const parties = el("ul", "treaty-parties");
    for (const p of t.parties) parties.append(el("li", "", `${nm(map, p.state)}（${p.role}）`));
    detailHost.append(parties);
    const text = el("textarea", "treaty-text"); text.rows = 4; text.value = treatyText(map, t); text.disabled = !active;
    text.title = "条約の文面（自動で作った要約。書き換えは任意です）";
    detailHost.append(el("h4", "", "条文（要約）"), text);
    if (t.originWar != null) detailHost.append(el("p", "hint", "戦争から生まれた条約です。戦争の経過は年表で確かめられます。"));
    if (active) {
      const per = selectOf([["keep", "期限はそのまま"], ...PERIODS.map((p) => [p.months ?? 0, p.months ? `今から${p.label}` : "無期限にする"])], "keep");
      const row = el("div", "diplomacy-row"); row.append(el("span", "field-label", "期限"), per);
      detailHost.append(row);
      const save = btn("primary", "改定を保存する", "名前・期限・条文の変更を保存します", () => {
        const patch = { name: name.value };
        if (per.value !== "keep") patch.months = +per.value || null;
        const auto = treatyText(map, { ...t, text: null });
        if (text.value.trim() !== auto && text.value.trim() !== (t.text ?? "")) patch.text = text.value; // 自動の文面のままなら、本文は保存しない
        simActions.amendTreaty(t.id, patch); renderDetail(); render();
      });
      const by = selectOf([["", "双方の合意で終える（違約なし）"], ...t.parties.map((p) => [p.state, `${nm(map, p.state)}が一方的に破棄する（違約）`])], "");
      const brk = btn("danger", "破棄する", "条約を終わらせます。一方的な破棄は、民意と信用が下がります", async () => {
        const who = by.value === "" ? null : +by.value;
        if (!(await confirmDialog(`「${t.name}」を破棄します。${who != null ? `\n${nm(map, who)}の一方的な破棄は違約となり、民意と信用が下がります。` : ""}\n（元に戻せます）`, { danger: true, okLabel: "破棄する" }))) return;
        if (simActions.breakTreaty(t.id, who)) { renderDetail(); render(); }
      });
      const row2 = el("div", "diplomacy-row"); row2.append(by, brk);
      detailHost.append(save, el("h4", "", "破棄"), row2);
    }
  }
  wins.register("treaty-detail", { title: "条約の中身", width: 520, body: detailHost, onOpen: renderDetail });
  const openDetail = (id) => { detailId = id; wins.open("treaty-detail"); renderDetail(); };

  // ---- 条約を結ぶ（確定するまで何も作らない） ----
  const newHost = el("div", "treaty-new");
  const draft = { kind: "alliance", picked: new Set(), leader: null, bind: "medium", tariff: "mid", vassalKind: "vassal", declaration: "friendship", mode: "nonaggression", months: 0, name: "" };
  function renderNew() {
    newHost.replaceChildren();
    const map = store.getState().map; if (!map) { newHost.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    const def = TREATY_BY_KEY[draft.kind];
    const one = (n, title, node) => { const sec = el("section", "treaty-step"); sec.append(el("h4", "", `${n} ${title}`)); sec.append(node); newHost.append(sec); };
    // ① 種類
    const kindSel = selectOf(SIGNABLE_KINDS.map((k) => [k, TREATY_BY_KEY[k].label]), draft.kind);
    kindSel.addEventListener("change", () => { draft.kind = kindSel.value; draft.picked.clear(); draft.leader = null; renderNew(); });
    const k1 = el("div"); k1.append(kindSel, el("p", "hint", def.desc)); one("①", "条約の種類", k1);
    // ② 当事国
    const k2 = el("div", "treaty-states");
    if (draft.kind === "vassal") {
      const ov = selectOf([["", "宗主国を選ぶ"], ...states.map((s) => [s.i, nm(map, s.i)])], draft.leader ?? "");
      const vs = selectOf([["", "従属国を選ぶ"], ...states.map((s) => [s.i, nm(map, s.i)])], [...draft.picked][0] ?? "");
      ov.addEventListener("change", () => { draft.leader = ov.value === "" ? null : +ov.value; syncPreview(); });
      vs.addEventListener("change", () => { draft.picked = new Set(vs.value === "" ? [] : [+vs.value]); syncPreview(); });
      k2.append(ov, vs);
    } else {
      for (const s of states) {
        const lab = el("label", "chip-check"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = draft.picked.has(s.i); cb.value = String(s.i);
        cb.addEventListener("change", () => { if (cb.checked) draft.picked.add(s.i); else draft.picked.delete(s.i); if (!draft.picked.has(draft.leader)) draft.leader = null; renderNew(); });
        const chip = el("span", "chip"); chip.style.background = s.color ?? "#888";
        lab.append(cb, chip, document.createTextNode(` ${nm(map, s.i)}`)); k2.append(lab);
      }
    }
    one("②", draft.kind === "vassal" ? "宗主国と従属国" : "当事国（2か国以上）", k2);
    // ③ 条項
    const k3 = el("div", "treaty-terms");
    if (draft.kind === "alliance") {
      const picked = [...draft.picked];
      const lead = selectOf(picked.length ? picked.map((id) => [id, nm(map, id)]) : [["", "当事国を選ぶと決められます"]], draft.leader ?? picked[0] ?? "");
      lead.addEventListener("change", () => { draft.leader = +lead.value; syncPreview(); });
      const bind = selectOf(BIND_LEVELS.map((b) => [b.key, `${b.label} — ${b.desc}`]), draft.bind);
      bind.addEventListener("change", () => { draft.bind = bind.value; });
      k3.append(rowOf("盟主", lead), rowOf("拘束力", bind));
    } else if (draft.kind === "economic") {
      const t = selectOf(TARIFFS.map((x) => [x.key, `関税 ${x.label}`]), draft.tariff); t.addEventListener("change", () => { draft.tariff = t.value; });
      k3.append(rowOf("関税の水準", t));
    } else if (draft.kind === "vassal") {
      const v = selectOf(VASSAL_KINDS.map((x) => [x.key, `${x.label} — ${x.desc}`]), draft.vassalKind); v.addEventListener("change", () => { draft.vassalKind = v.value; });
      k3.append(rowOf("従属の種類", v));
    } else if (draft.kind === "declaration") {
      const d = selectOf(DECLARATIONS.map((x) => [x.key, x.label]), draft.declaration); d.addEventListener("change", () => { draft.declaration = d.value; });
      k3.append(rowOf("定型文", d));
    } else if (draft.kind === "nonaggression") {
      const m = selectOf(NONAGG_MODES.map((x) => [x.key, x.label]), draft.mode); m.addEventListener("change", () => { draft.mode = m.value; });
      k3.append(rowOf("型", m));
    } else k3.append(el("p", "hint", "この種類に、入力する条項はありません。"));
    if (draft.kind !== "vassal") {
      const per = selectOf(PERIODS.map((p) => [p.months ?? 0, p.label]), draft.months); per.addEventListener("change", () => { draft.months = +per.value; });
      k3.append(rowOf("期限", per));
    }
    one("③", "条項", k3);
    // ④ 名前（自動。上書きは任意）
    const nameIn = el("input"); nameIn.value = draft.name; nameIn.placeholder = "（自動で付けます）"; nameIn.addEventListener("input", () => { draft.name = nameIn.value; });
    const prev = el("p", "hint treaty-preview");
    function syncPreview() {
      const parties = partiesFromDraft();
      prev.textContent = parties.length >= def.min ? `名前の例: ${autoName(map, draft.kind, parties)}` : "";
      if (!draft.name) nameIn.placeholder = parties.length >= def.min ? autoName(map, draft.kind, parties) : "（自動で付けます）";
    }
    const k4 = el("div"); k4.append(nameIn, prev); one("④", "名称", k4);
    syncPreview();
    const go = btn("primary", "この内容で締結する", "確定するまで、地図にも年表にも何も残りません", () => {
      const id = simActions.concludeTreaty({
        kind: draft.kind, parties: partiesFromDraft(), name: draft.name,
        months: draft.kind === "vassal" ? null : draft.months || null,
        terms: { bind: draft.bind, tariff: draft.tariff, kind: draft.vassalKind, declaration: draft.declaration, mode: draft.mode },
      });
      if (id != null) { draft.picked.clear(); draft.leader = null; draft.name = ""; wins.close("treaty-new"); render(); openDetail(id); }
    });
    newHost.append(go);
  }
  function partiesFromDraft() {
    const ids = [...draft.picked];
    if (draft.kind === "vassal") return [...(draft.leader != null ? [{ state: draft.leader, role: "宗主国" }] : []), ...ids.filter((i) => i !== draft.leader).map((i) => ({ state: i, role: "属国" }))];
    const lead = draft.kind === "alliance" ? (draft.leader ?? ids[0]) : null;
    return ids.map((i) => ({ state: i, role: i === lead ? "盟主" : "加盟" }));
  }
  const rowOf = (label, node) => { const r = el("div", "diplomacy-row"); r.append(el("span", "field-label", label), node); return r; };
  wins.register("treaty-new", { title: "条約を結ぶ", width: 560, body: newHost, onOpen: renderNew });

  // ---- 3列: 左に国のリスト／中央に選んだ国の関係カード／右に条約の一覧（HoI4 風） ----
  function chipOf(s) { const c = el("span", "chip"); c.style.background = s?.color ?? "#888"; return c; }
  /** その国が戦ったことのある相手（敵対）。戦争中かどうかも返す */
  function enemiesOf(map, id) {
    const out = new Map();
    for (const w of listWars(map)) {
      const inA = w.attackers.includes(id), inD = w.defenders.includes(id); if (!inA && !inD) continue;
      for (const o of inA ? w.defenders : w.attackers) { const cur = out.get(o) ?? { id: o, ongoing: false, wars: [] }; cur.wars.push(w.id); if (!w.endedAt) cur.ongoing = true; out.set(o, cur); }
    }
    return [...out.values()];
  }
  function partyChips(map, t, active) {
    const row = el("div", "dip-chips");
    const ids = partyIds(t), canEdit = active && !["vassal", "peace", "support"].includes(t.kind);
    for (const id of ids) {
      const c = el("span", "dip-pchip"); c.append(chipOf(map.pack.states[id]), document.createTextNode(nm(map, id)));
      if (canEdit && ids.length > (TREATY_BY_KEY[t.kind].min ?? 2)) { const x = btn("dip-x", "×", `${nm(map, id)}を条約から外す`, () => { if (simActions.setTreatyParties(t.id, ids.filter((i) => i !== id))) render(); }); c.append(x); }
      row.append(c);
    }
    if (canEdit) {
      const free = map.pack.states.filter((s) => isLive(s) && !ids.includes(s.i));
      if (free.length) {
        const add = selectOf([["", "＋"], ...free.map((s) => [s.i, nm(map, s.i)])], ""); add.className = "dip-add"; add.title = "参加国を足す";
        add.addEventListener("change", () => { if (add.value !== "" && simActions.setTreatyParties(t.id, [...ids, +add.value])) render(); });
        row.append(add);
      }
    }
    return row;
  }
  function render() {
    body.replaceChildren();
    const map = store.getState().map;
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    if (focus == null || !states.some((s) => s.i === focus)) focus = states[0]?.i ?? null;
    const cols = el("div", "dip-cols");
    // 左: 国のリスト
    const left = el("div", "dip-left"), wars = activeWars(map);
    for (const s of states) {
      const row = el("button", `dip-row${s.i === focus ? " on" : ""}`); row.type = "button";
      const badges = el("span", "dip-badges");
      for (const b of badgesOf(map, s.i, wars)) badges.append(el("span", `dip-badge b-${b === "戦争中" ? "war" : "t"}`, b));
      row.append(chipOf(s), el("span", "dip-name", nm(map, s.i)), badges);
      row.addEventListener("click", () => { focus = s.i; render(); }); left.append(row);
    }
    // 中央: 関係カード（関係は「同盟」と「敵対（戦争した国）」だけ）
    const mid = el("div", "dip-mid");
    if (focus != null) {
      const f = map.pack.states[focus], now = map.worldTime;
      const head = el("div", "dip-card-head"); head.append(chipOf(f), el("strong", "", nm(map, focus))); mid.append(head);
      const ally = el("section", "dip-card"); ally.append(el("h4", "", "同盟"));
      const als = activeTreaties(map, now, "alliance").filter((t) => partyIds(t).includes(focus));
      if (!als.length) ally.append(el("p", "muted", "同盟国はありません"));
      for (const t of als) {
        const r = el("div", "dip-ally"); r.append(el("div", "dip-ally-n", t.name), partyChips(map, { ...t, parties: t.parties.filter((p) => p.state !== focus) }, false));
        const bind = selectOf(BIND_LEVELS.map((b) => [b.key, `拘束力 ${b.label}`]), t.terms?.bind ?? "medium"); bind.title = BIND_LEVELS.map((b) => `${b.label}: ${b.desc}`).join("\n");
        bind.addEventListener("change", () => { simActions.amendTreaty(t.id, { terms: { bind: bind.value } }); render(); });
        r.append(bind); ally.append(r);
      }
      mid.append(ally);
      const foe = el("section", "dip-card"); foe.append(el("h4", "", "敵対（戦争した国）"));
      const es = enemiesOf(map, focus);
      if (!es.length) foe.append(el("p", "muted", "戦争をした相手はいません"));
      for (const e of es) { const r = el("div", "dip-foe"); r.append(chipOf(map.pack.states[e.id]), el("span", "", nm(map, e.id)), el("span", `dip-badge ${e.ongoing ? "b-war" : "b-t"}`, e.ongoing ? "戦争中" : "過去に戦争")); foe.append(r); }
      mid.append(foe);
      const peace = el("section", "dip-card"); peace.append(el("h4", "", "講和"));
      const mine = wars.filter((w) => [...w.attackers, ...w.defenders].includes(focus));
      if (!mine.length) peace.append(el("p", "muted", "戦争中ではありません"));
      for (const w of mine) { const r = el("div", "dip-foe"); r.append(el("span", "", w.name), btn("", "講和を結ぶ", "戦争の講和の画面を開く", () => { getWarsPanel?.()?.select(w.id); wins.open("war"); })); peace.append(r); }
      mid.append(peace);
    }
    // 右: 条約の一覧
    const right = el("div", "dip-right");
    const top = el("div", "dip-top");
    top.append(el("h4", "", "条約"), btn("primary", "＋ 条約を結ぶ", "種類 → 当事国 → 条項 → 締結", () => { if (focus != null) { draft.picked = new Set([focus]); draft.leader = null; } wins.open("treaty-new"); renderNew(); }));
    right.append(top);
    const ts = focus == null ? [] : listTreaties(map).filter((t) => partyIds(t).includes(focus));
    if (!ts.length) right.append(el("p", "muted", "結んでいる条約はまだありません"));
    for (const t of ts.slice().reverse()) {
      const st = treatyStatus(t, map.worldTime), active = st === "active";
      const card = el("div", `treaty-card ${st}`);
      const h = el("button", "treaty-row"); h.type = "button";
      h.append(el("span", "treaty-kind", TREATY_BY_KEY[t.kind].short), el("span", "treaty-title", t.name), el("span", "treaty-meta", `${fmt(t.signedAt)} ・ ${STATUS_LABEL[st]}`));
      h.addEventListener("click", () => openDetail(t.id));
      card.append(h, partyChips(map, t, active)); right.append(card);
    }
    const set = el("section", "dip-settings"); set.append(el("h4", "", "条約の設定"));
    const lab = el("label", "chip-check"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "civil-calls-allies"; cb.checked = simActions.treatySettings().civilCallsAllies;
    cb.addEventListener("change", () => simActions.setTreatySettings({ civilCallsAllies: cb.checked }));
    lab.append(cb, document.createTextNode(" 内戦でも、同盟国を参戦に招集する（既定はしない）")); set.append(lab); right.append(set);
    cols.append(left, mid, right); body.append(cols);
  }
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type)) { if (wins.isOpen("diplomacy")) render(); if (wins.isOpen("treaty-detail")) renderDetail(); } });
  return { body, render };
}
