// 外交ウィンドウ（v2.5.0: 「存在する同盟」「破棄された同盟」「講和条約」の3タブが基調）。国どうしの取り決めは、すべて「条約」として扱う。
//   ・3列: 左に国のリスト（バッジ）／中央に選んだ国の関係カード（同盟と、戦争した国=敵対。同盟の拘束力は弱・中・強）／右に条約の一覧。
//     条約の参加国は後から変えられる（チップの × で外し、＋ で足す）。外交の表は無い。宣戦布告は国家タブにある。
//   ・「条約を結ぶ」: 種類 → 当事国（複数可）→ 条項（種類ごとの最小限の入力。既定値は自動）→ 締結。
//     名称は自動で付け、上書きできる。確定するまで、何も作らず、年表にも残さない。
//   ・締結後に、条約の中身（重ねて開く詳細ウィンドウ）で、期限・改定・破棄ができる。破棄は違約の扱いを伴う。
//   ・条約の種類は 安全保障（参戦義務）/ 経済協力（貿易量）/ 共同宣言 / 不可侵・中立 の4つ。従属は国家タブ、講和は戦争の講和画面から。
//   横タブは使わず、縦に並べた節と、重ねて開く窓で扱う。
import { el, btn } from "./kit.js";
import { diplomacyHistory, typeJp } from "../io/chronicle.js";
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

export function initDiplomacyWindow({ store, wins, simActions, getWarsPanel, getWarOutcome = () => null }) {
  const body = el("div", "dip-body");
  let focus = null;           // 条約の一覧を見ている国
  let detailId = null;        // 詳細ウィンドウで開いている条約
  let statusFilter = "all";   // 条約一覧の絞り込み（all / active / expired / broken）
  let dipTab = "alliances";   // 存在する同盟 / 破棄された同盟 / 講和条約
  let peace = false;          // 右の列を、講和条約の入力（戦争の講和）にしている間は true
  function openPeace(warId) { const o = getWarOutcome(); if (!o) return; if (warId != null) o.select(warId); peace = true; dipTab = "peace"; wins.open("diplomacy"); render(); }
  function closePeace() { if (!peace) return; peace = false; getWarOutcome()?.clearHighlight(); }

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
      const bdesc = el("p", "hint dip-bind-desc", BIND_LEVELS.find((b) => b.key === draft.bind)?.desc ?? ""); bdesc.dataset.field = "bind-desc";
      bind.addEventListener("change", () => { draft.bind = bind.value; bdesc.textContent = BIND_LEVELS.find((b) => b.key === bind.value)?.desc ?? ""; });
      k3.append(rowOf("盟主", lead), rowOf("拘束力", bind), bdesc);
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
  // ---- 3つのタブ: 存在する同盟／破棄された同盟／講和条約（v2.5.0） ----
  const TABS = [["alliances", "存在する同盟"], ["dissolved", "破棄された同盟"], ["peace", "講和条約"]];
  const isAlliance = (t) => t.kind === "alliance";
  const isOther = (t) => !["alliance", "peace", "support"].includes(t.kind);
  function treatyCard(map, t, active) {
    const st = treatyStatus(t, map.worldTime), card = el("div", `treaty-card ${st}`);
    const h = el("button", "treaty-row"); h.type = "button";
    h.append(el("span", "treaty-kind", TREATY_BY_KEY[t.kind].short), el("span", "treaty-title", t.name), el("span", "treaty-meta", `${fmt(t.signedAt)}${t.endedAt ? ` → ${fmt(t.endedAt)}` : ""} ・ ${STATUS_LABEL[st]}${t.brokenBy != null ? `（${nm(map, t.brokenBy)}が破棄）` : ""}`));
    h.addEventListener("click", () => openDetail(t.id));
    card.append(h, partyChips(map, t, active));
    return card;
  }
  function renderAlliances(map, right, dissolved) {
    const all = listTreaties(map).filter((t) => (focus == null || partyIds(t).includes(focus)) && t.kind !== "peace" && t.kind !== "support");
    const stOf = (t) => treatyStatus(t, map.worldTime);
    const mine = all.filter((t) => isAlliance(t) && (dissolved ? stOf(t) !== "active" : stOf(t) === "active"));
    const top = el("div", "dip-top"); top.append(el("h4", "", dissolved ? "破棄された同盟（失効を含む）" : "存在する同盟"));
    if (!dissolved) top.append(btn("primary", "＋ 同盟を結ぶ", "当事国 → 拘束力 → 締結", () => { draft.kind = "alliance"; draft.picked = new Set(focus != null ? [focus] : []); draft.leader = null; wins.open("treaty-new"); renderNew(); }));
    right.append(top);
    if (!mine.length) right.append(el("p", "muted", dissolved ? "破棄された同盟はありません" : "存在する同盟はありません"));
    for (const t of mine.slice().reverse()) {
      const card = treatyCard(map, t, !dissolved); right.append(card);
      if (!dissolved) {
        const bind = selectOf(BIND_LEVELS.map((b) => [b.key, `拘束力 ${b.label}`]), t.terms?.bind ?? "medium"); bind.title = BIND_LEVELS.map((b) => `${b.label}: ${b.desc}`).join("\n");
        bind.addEventListener("change", () => { simActions.amendTreaty(t.id, { terms: { bind: bind.value } }); render(); });
        const bdesc = el("p", "hint dip-bind-desc", BIND_LEVELS.find((b) => b.key === (t.terms?.bind ?? "medium"))?.desc ?? ""); bdesc.dataset.field = "bind-desc";
        card.append(bind, bdesc);
      }
    }
    // 同盟以外の条約（経済協力・不可侵・共同宣言・従属）は、下にまとめる
    const others = all.filter((t) => isOther(t) && (dissolved ? stOf(t) !== "active" : stOf(t) === "active"));
    const sec = el("section", "dip-others"); const oh = el("div", "dip-top"); oh.append(el("h4", "", dissolved ? "その他の終了した条約" : "その他の条約"));
    if (!dissolved) oh.append(btn("", "＋ 条約を結ぶ", "経済協力・不可侵・共同宣言・従属", () => { if (draft.kind === "alliance") draft.kind = "economic"; draft.picked = new Set(focus != null ? [focus] : []); draft.leader = null; wins.open("treaty-new"); renderNew(); }));
    sec.append(oh);
    if (!others.length) sec.append(el("p", "muted", "ありません"));
    for (const t of others.slice().reverse()) sec.append(treatyCard(map, t, !dissolved));
    right.append(sec);
  }
  function renderPeaceTab(map, right) {
    right.append(el("h4", "", "講和条約"));
    const ongoing = activeWars(map).filter((w) => focus == null || [...w.attackers, ...w.defenders].includes(focus));
    const sec = el("section", "dip-card"); sec.append(el("h4", "", "戦争中（講和を結べます）"));
    if (!ongoing.length) sec.append(el("p", "muted", "戦争中ではありません"));
    for (const w of ongoing) { const r = el("div", "dip-foe"); r.append(el("span", "", w.name), btn("primary", "講和を結ぶ", "この戦争の講和条約を入力します", () => openPeace(w.id)), btn("", "戦争を見る", "戦争ウィンドウで、この戦争を開く", () => { getWarsPanel?.()?.select(w.id); wins.open("war"); })); sec.append(r); }
    right.append(sec);
    const peaces = listTreaties(map).filter((t) => t.kind === "peace" && (focus == null || partyIds(t).includes(focus)));
    const done = el("section", "dip-card"); done.append(el("h4", "", "結ばれた講和条約"));
    if (!peaces.length) done.append(el("p", "muted", "講和条約はまだありません"));
    for (const t of peaces.slice().reverse()) done.append(treatyCard(map, t, false));
    right.append(done);
  }
  function render() {
    body.replaceChildren();
    const map = store.getState().map;
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    if (focus != null && !states.some((s) => s.i === focus)) focus = null;
    if (!TABS.some(([k]) => k === dipTab)) dipTab = "alliances";
    const stOf = (t) => treatyStatus(t, map.worldTime);
    const allT = listTreaties(map);
    const counts = { alliances: allT.filter((t) => isAlliance(t) && stOf(t) === "active").length, dissolved: allT.filter((t) => isAlliance(t) && stOf(t) !== "active").length, peace: allT.filter((t) => t.kind === "peace").length };
    const bar = el("div", "np-seg dip-tabs"); bar.dataset.field = "dip-tabs";
    for (const [k, label] of TABS) bar.append(btn(dipTab === k ? "on" : "", `${label} ${counts[k]}`, label, () => { if (peace) closePeace(); dipTab = k; render(); }));
    const who = selectOf([["", "すべての国"], ...states.map((s) => [s.i, nm(map, s.i)])], focus ?? ""); who.className = "dip-focus"; who.dataset.field = "dip-focus"; who.title = "国で絞り込む";
    who.addEventListener("change", () => { focus = who.value === "" ? null : +who.value; render(); });
    const head = el("div", "dip-head"); head.append(bar, who); body.append(head);
    const right = el("div", "dip-right dip-wide");
    if (dipTab === "peace" && peace && getWarOutcome()) {
      const pt = el("div", "dip-top"); pt.append(el("h4", "", "講和条約"), btn("", "◀ 講和条約の一覧", "講和の入力を閉じて、一覧に戻る", () => { closePeace(); render(); }));
      right.append(pt, getWarOutcome().treatyBody); body.append(right);
      getWarOutcome().renderTreaty();
      return;
    }
    if (dipTab === "peace") renderPeaceTab(map, right); else renderAlliances(map, right, dipTab === "dissolved");
    // 選んだ国の外交の履歴（年表から絞る。条約の締結・破棄・参加国の変更・更新・戦争・講和）
    if (focus != null) {
      const hs = el("section", "dip-card dip-history"); hs.dataset.field = "dip-history"; hs.append(el("h4", "", `${nm(map, focus)}の外交の履歴`));
      const rows = diplomacyHistory(map, focus);
      if (!rows.length) hs.append(el("p", "muted", "外交の記録はまだありません"));
      for (const t of rows) hs.append(el("div", "dip-hist-row", `${t.date}　[${typeJp(t.type)}] ${t.title}${t.detail ? ` — ${String(t.detail).split("\n")[0]}` : ""}`));
      right.append(hs);
    }
    body.append(right);
  }
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type)) { if (wins.isOpen("diplomacy")) render(); if (wins.isOpen("treaty-detail")) renderDetail(); } });
  return { body, render, openPeace, closePeace };
}
