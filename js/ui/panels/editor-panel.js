// エディタパネル：選ばれた対象（セル・都市・マーカー・国家など）の情報と編集フォームを表示する。
// 左サイドバーに差し込む1枚のパネル。DOMを直接組み立てる（フレームワーク不使用）。
// 国家（kind === "state"）はサブタブ化して、基本情報・外交・軍事・属州を1つのタブ内に集約する。

import { guardRender } from "../safe-render.js";
import { describeCell, statePopulation, stateMilitaryPower, stateHeadcount, stateRank } from "../../core/query.js";
import { htmlToEditable, editableToHtml } from "../../core/edit/notes.js";
import { simpleRelation, SIMPLE_LABEL } from "../../core/edit/diplomacy.js";
import { DEFAULT_MARKER_TYPES, defaultMarkerName } from "../../core/edit/markers.js";
import { byId } from "../dom.js";
import { appendEntityProfile } from "../profile-fields.js";
import { confirmDialog, promptDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0; // 0番（Neutrals＝無所属）は外交などの対象にしない
const STATE_SUBTABS = [
  { key: "info", label: "基本情報", icon: "⛭" },
  { key: "provinces", label: "属州", icon: "▦" },
];

export function initEditorPanel({ store, editActions, editMode, panels: initialPanels, openSetup, openRebellion }) {
  const root = byId("editor-panel");
  const sidebar = byId("sidebar");
  let current = null; // { kind: "cell"|"burg"|"marker"|"state"|..., id }
  let stateSubtab = "info"; // 国家タブが開いているときの、選ばれているサブタブ
  // panels（wars/alliances/military）は循環importを避けるため main.js から後付けで渡す
  let panels = initialPanels ?? null;

  function open(kind, id) { current = { kind, id }; if (kind === "state") stateSubtab = "info"; render(); }
  function close() {
    current = null;
    render();
  }

  function render() {
    root.replaceChildren();
    if (!current) { root.hidden = true; return; }
    root.hidden = false;
    const map = store.getState().map;
    if (!map) { close(); return; }

    const header = el("div", "editor-header");
    const title = el("h3");
    const closeBtn = el("button", "editor-close", "×");
    closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.addEventListener("click", close);
    header.append(title, closeBtn);
    root.append(header);

    if (current.kind === "cell") { const body = el("div", "editor-body"); root.append(body); renderCell(map, title, body); return; }
    if (current.kind === "burg") { const body = el("div", "editor-body"); root.append(body); renderBurg(map, title, body); return; }
    if (current.kind === "marker") { const body = el("div", "editor-body"); root.append(body); renderMarker(map, title, body); return; }
    if (current.kind === "state") { renderStateTabs(map, title, root); return; }
    const body = el("div", "editor-body"); root.append(body); renderEntity(map, current.kind, title, body);
  }

  /** 国家タブ本体：サブタブ切り替え（基本情報／外交／軍事／属州） */
  function renderStateTabs(map, title, root) {
    const e = map.pack.states[current.id];
    if (!isLive(e)) { close(); return; }
    title.textContent = `🏳 ${e.fullName ?? e.name}`;

    // 横タブは使わない：基本情報の下に、属州を折りたたみの欄として続ける
    const body = el("div", "editor-body");
    root.append(body);

    renderStateInfo(map, e, body);
    const prov = document.createElement("details"); prov.className = "state-prov-fold"; prov.open = stateSubtab === "provinces";
    prov.addEventListener("toggle", () => { stateSubtab = prov.open ? "provinces" : "info"; });
    prov.append(el("summary", "", "▦ 属州"));
    const provBody = el("div", "state-prov-body"); prov.append(provBody);
    renderStateProvinces(map, e, provBody);
    body.append(prov);
  }

  function renderStateInfo(map, e, body) {
    const form = el("div", "editor-form");
    form.append(basicStatsSection(map, e));
    form.append(textField("国家名", e.fullName ?? e.name, (v) => editActions.renameEntity("state", e.i, v), () => editActions.suggestName("state", { id: e.i })));
    form.append(...provisionalNote("state", e.i));
    if (e.parentState > 0) { const pr = map.pack.states[e.parentState]; if (pr) form.append(el("p", "hint", `分離元: ${pr.fullName ?? pr.name}（反乱・独立で成立）`)); }
    form.append(profileSection("state", e, map));
    form.append(techLevelSection(e.i));
    form.append(doctrineSection(e.i));
    form.append(noteField(map, "state", e.i));
    body.append(form);
  }

  /** 人口・軍事力・領土・都市数と各種ランキングをまとめて表示する */
  function basicStatsSection(map, e) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "国力"));
    const pop = statePopulation(e);
    const power = stateMilitaryPower(e);
    const headcount = stateHeadcount(e);
    const popRank = stateRank(map, e.i, "population");
    const powerRank = stateRank(map, e.i, "military");
    const cellsRank = stateRank(map, e.i, "cells");
    const burgCount = Array.isArray(e.burgs) ? e.burgs.length : (e.burgs ?? 0);
    const rows = [
      ["人口", `${pop.toFixed(2)}（千人）${popRank ? `　順位 ${popRank.rank}/${popRank.total}` : ""}`],
      ["軍事力", `${power.toFixed(0)}${powerRank ? `　順位 ${powerRank.rank}/${powerRank.total}` : ""}`],
      ["兵員数（基数）", headcount.toFixed(0)],
      ["領土（セル数）", `${e.cells ?? 0}${cellsRank ? `　順位 ${cellsRank.rank}/${cellsRank.total}` : ""}`],
      ["面積", e.area ?? 0],
      ["都市数", burgCount],
    ];
    wrap.append(table(rows));
    return wrap;
  }

  /** 外交ウィンドウ用：外交の一覧表と、国ごとの関係の設定（戦争・同盟は専用の場所にある） */
  function buildDiplomacy(map, focusId) {
    const form = el("div", "editor-form");
    form.append(diplomacyMatrix(map, focusId));
    return form;
  }

  /** 全国家×全国家の関係を一覧できるマトリクス表（Azgaarの外交表に相当）。
   *  現在選んでいる国家の行・列は強調する。セルをクリックすると関係を変更できる。 */
  function diplomacyMatrix(map, focusId) {
    const wrap = el("div", "editor-section diplomacy-matrix-wrap");
    wrap.append(el("h4", "", "外交一覧（全国家）"), el("p", "hint", "同盟を結ぶと「同盟」、戦争をすると「敵対」になり、講和すると中立に戻ります。ここでは設定しません。"));
    const states = map.pack.states.filter(isLive).sort((a, b) => a.i - b.i);
    if (states.length < 2) { wrap.append(el("p", "hint", "国家が2つ以上ないと表になりません。")); return wrap; }

    const table = document.createElement("table");
    table.className = "diplomacy-matrix";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(document.createElement("th"));
    for (const s of states) {
      const th = document.createElement("th");
      th.textContent = s.fullName ?? s.name;
      th.title = s.fullName ?? s.name;
      if (s.i === focusId) th.classList.add("focus");
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const rowState of states) {
      const tr = document.createElement("tr");
      const rowHead = document.createElement("th");
      rowHead.textContent = rowState.fullName ?? rowState.name;
      rowHead.scope = "row";
      if (rowState.i === focusId) rowHead.classList.add("focus");
      tr.append(rowHead);
      for (const colState of states) {
        const td = document.createElement("td");
        if (rowState.i === colState.i) { td.className = "self"; tr.append(td); continue; }
        // 関係は「同盟」「敵対」「中立」の3つだけ。同盟を結べば同盟、戦争をすれば敵対になり、手では設定しない
        const rel = simpleRelation(map, rowState.i, colState.i);
        td.className = `rel-${rel === "alliance" ? "Ally" : rel === "hostile" ? "Enemy" : "Neutral"}`;
        td.textContent = SIMPLE_LABEL[rel];
        td.title = `${rowState.fullName ?? rowState.name} と ${colState.fullName ?? colState.name}: ${SIMPLE_LABEL[rel]}`;
        if (rowState.i === focusId || colState.i === focusId) td.classList.add("focus-row-col");
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);

    const scroller = el("div", "diplomacy-matrix-scroll");
    scroller.append(table);
    wrap.append(scroller);
    return wrap;
  }


  function renderStateProvinces(map, e, body) {
    const form = el("div", "editor-form");
    form.append(newProvinceSection(e));
    const provinces = map.pack.provinces.filter((p) => isLive(p) && p.state === e.i);
    if (!provinces.length) {
      form.append(el("p", "muted", "この国家にはまだ属州がありません。上の「作る」で新規作成し、「塗る」ツールで地図上に領土を割り当てられます。"));
    } else {
      const list = el("div", "attr-list");
      for (const p of provinces) {
        const row = el("div", "diplomacy-row");
        row.append(el("span", "diplomacy-name", `${p.fullName ?? p.name}（${p.cells ?? 0}セル）`));
        const repaint = el("button", "", "この属州を塗り直す");
        repaint.type = "button";
        repaint.title = "地図編集パネルの「属州を塗る」ツールに切り替えて、この属州を対象にします";
        repaint.addEventListener("click", () => {
          editMode?.setTool?.("paint:province");
          window.dispatchEvent(new CustomEvent("request-edit-panel-open"));
          window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:province", target: p.i } }));
        });
        row.append(repaint);
        const independence = el("button", "", "反乱・独立…");
        independence.type = "button";
        independence.title = "この属州が離反して別の国になります（内戦にするか、平和的な独立かを選べます）";
        independence.addEventListener("click", () => {
          if (openRebellion) openRebellion({ stateId: e.i, provinceId: p.i });
          else promptDialog(`独立させて作る新国家の名前`, `${p.fullName ?? p.name}`, { suggest: () => editActions.suggestName("state", { stateId: e.i }) }).then((name) => { if (name != null) editActions.declareIndependence(p.i, name); });
        });
        row.append(independence);
        list.append(row);
      }
      form.append(list);
    }
    form.append(mergeSection(map, e));
    body.append(form);
  }

  /** 新しい属州を作る（この国家に属させる）。属州は国家の設定なので国家タブ側に置く。
   *  地図編集モード側には置かない（あちらは「どのセルをどの属州にするか」の塗り分け専用） */
  function newProvinceSection(e) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "新しい属州"));
    const row = el("div", "diplomacy-row");
    const btn = el("button", "", "＋ 属州を追加…");
    btn.type = "button";
    btn.title = "初期設定のウィンドウで、名前・色を入力して確定します";
    btn.addEventListener("click", async () => {
      const newId = openSetup ? await openSetup("province", { stateId: e.i }) : editActions.addProvince(e.i, "");
      if (newId != null) {
        // 作った直後、そのまま塗れるように地図編集パネルの「属州を塗る」に切り替える
        editMode?.setTool?.("paint:province");
        window.dispatchEvent(new CustomEvent("request-edit-panel-open"));
        window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:province", target: newId } }));
      }
    });
    row.append(btn);
    wrap.append(row);
    return wrap;
  }

  /** 国家統合：この国家を、選んだ他の国家に吸収させる（この国家は解散する） */
  function mergeSection(map, e) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "国家の統合"));
    const others = map.pack.states.filter((s) => isLive(s) && s.i !== e.i && s.i > 0);
    if (!others.length) {
      wrap.append(el("p", "hint", "統合できる他の国家がありません。"));
      return wrap;
    }
    const row = el("div", "diplomacy-row");
    const sel = document.createElement("select");
    for (const s of others) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; sel.append(o); }
    row.append(sel);
    const btn = el("button", "danger", "この国家を統合させる（解散）");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      const target = map.pack.states[Number(sel.value)];
      const ok = await confirmDialog(
        `「${e.fullName ?? e.name}」を「${target?.fullName ?? target?.name}」に統合します。「${e.fullName ?? e.name}」は解散し、消滅します。この操作は元に戻せます（Undo）が、よろしいですか？`,
        { danger: true, okLabel: "統合する" },
      );
      if (!ok) return;
      editActions.mergeStates(e.i, Number(sel.value));
    });
    row.append(btn);
    wrap.append(row);
    wrap.append(el("p", "hint", "この国家の全領土・都市・属州・部隊を選んだ国家に統合し、この国家自体は解散します。"));
    return wrap;
  }

  function renderCell(map, title, body) {
    const info = describeCell(map, current.id);
    title.textContent = `セル #${current.id}`;
    if (!info) { body.append(el("p", "muted", "情報がありません")); return; }
    const rows = [["地形", info.biome], ["標高", info.height], ["国家", info.state], ["文化", info.culture],
      ["宗教", info.religion], ["属州", info.province], ["都市", info.burg]];
    body.append(table(rows.filter(([, v]) => v != null)));
    if (info.burg) { const b = el("button", "link", `都市「${info.burg}」を開く`); b.addEventListener("click", () => open("burg", map.pack.cells.burg[current.id])); body.append(b); }
    const stateId = map.pack.cells.state[current.id];
    if (stateId) { const b = el("button", "link", `国家「${info.state}」を開く`); b.addEventListener("click", () => open("state", stateId)); body.append(b); }
  }

  function renderMarker(map, title, body) {
    const m = map.markers.find((x) => x.i === current.id);
    if (!m) { close(); return; }
    title.textContent = `${m.icon} ${m.name ?? defaultMarkerName(m.type)}`;
    const form = el("div", "editor-form");

    const typeRow = el("label", "field");
    typeRow.append(el("span", "field-label", "種類"));
    const sel = document.createElement("select");
    for (const t of DEFAULT_MARKER_TYPES) { const o = document.createElement("option"); o.value = t.type; o.textContent = `${t.icon} ${t.label}`; if (t.type === m.type) o.selected = true; sel.append(o); }
    if (!DEFAULT_MARKER_TYPES.some((t) => t.type === m.type)) { const o = document.createElement("option"); o.value = m.type; o.textContent = `${m.icon} ${m.type}`; o.selected = true; sel.append(o); }
    sel.addEventListener("change", () => { const t = DEFAULT_MARKER_TYPES.find((x) => x.type === sel.value); editActions.editMarker(m.i, { type: sel.value, icon: t?.icon ?? m.icon }); });
    typeRow.append(sel);
    form.append(typeRow);

    form.append(textField("名前", m.name ?? defaultMarkerName(m.type), (v) => editActions.editMarker(m.i, { name: v })));
    form.append(noteField(map, "marker", m.i));

    const del = el("button", "danger", "このマーカーを削除");
    del.type = "button";
    del.addEventListener("click", async () => { if (await confirmDialog("このマーカーを削除しますか？", { danger: true, okLabel: "削除" })) { editActions.removeMarker(m.i); close(); } });
    form.append(del);
    body.append(form);
  }

  function renderBurg(map, title, body) {
    const b = map.pack.burgs[current.id];
    if (!isLive(b)) { close(); return; }
    title.textContent = `${b.capital ? "🏰 " : "🏘️ "}${b.name}`;
    const form = el("div", "editor-form");
    form.append(table([
      ["国家", isLive(map.pack.states[b.state]) ? map.pack.states[b.state].name : "無所属"],
      ["文化", map.pack.cultures[b.culture]?.name ?? ""],
      ["人口(概算)", (b.population ?? 0).toFixed(2)],
    ]));
    form.append(textField("名前", b.name, (v) => editActions.renameBurg(b.i, v), () => editActions.suggestName("burg", { id: b.i })));
    form.append(...provisionalNote("burg", b.i));

    if (!b.capital) {
      const cap = el("button", "", "この都市を首都にする");
      cap.type = "button";
      cap.addEventListener("click", () => editActions.setCapital(b.state, b.i));
      form.append(cap);
    }
    form.append(noteField(map, "burg", b.i));

    const reason = editActions.whyCannotRemoveBurg(b.i);
    const del = el("button", "danger", "この都市を削除");
    del.type = "button";
    del.disabled = !!reason;
    if (reason) del.title = reason;
    del.addEventListener("click", async () => { if (await confirmDialog("この都市を削除しますか？", { danger: true, okLabel: "削除" })) { editActions.removeBurg(b.i); close(); } });
    form.append(del);
    if (reason) form.append(el("p", "hint", reason));
    body.append(form);
  }

  /** 文化・宗教・属州（単独）用。国家は renderStateTabs 側でサブタブ表示する */
  function renderEntity(map, kind, title, body) {
    const list = { culture: map.pack.cultures, religion: map.pack.religions, province: map.pack.provinces }[kind];
    const e = list?.[current.id];
    if (!isLive(e)) { close(); return; }
    const labelOf = { culture: "文化", religion: "宗教", province: "属州" }[kind];
    title.textContent = `${labelOf}「${e.fullName ?? e.name}」`;
    const form = el("div", "editor-form");
    const stats = [["セル数", e.cells], ["面積", e.area], ["都市数", Array.isArray(e.burgs) ? e.burgs.length : e.burgs]].filter(([, v]) => v != null);
    form.append(table(stats));
    form.append(textField("名前", e.fullName ?? e.name, (v) => editActions.renameEntity(kind, e.i, v), () => editActions.suggestName(kind, { id: e.i })));
    form.append(...provisionalNote(kind, e.i));
    if (kind === "culture") form.append(nameStyleSection(e.i));
    if (kind === "culture" || kind === "religion") form.append(profileSection(kind, e, map));
    form.append(noteField(map, kind, e.i));
    body.append(form);
  }

  /** 政体・種類・起源・最高神など、その対象の「性格」を決める欄 */
  function profileSection(kind, e, map) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", kind === "religion" ? "信仰" : kind === "culture" ? "文化の性格" : "政治"));
    const d = el("div", "b-details");
    appendEntityProfile(d, kind, e, { editActions, map, openEntity: (k, id) => open(k, id) });
    wrap.append(d);
    return wrap;
  }

  function techLevelSection(stateId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "技術水準"));
    const row = el("div", "tech-level-row");
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(editActions.TECH_MIN);
    slider.max = String(editActions.TECH_MAX);
    slider.step = "1";
    slider.value = String(editActions.getTechLevel(stateId) ?? 3);
    const value = el("span", "tech-level-value", slider.value);
    slider.addEventListener("input", () => { value.textContent = slider.value; });
    slider.addEventListener("change", () => editActions.setTechLevel(stateId, Number(slider.value)));
    row.append(slider, value);
    wrap.append(row);
    wrap.append(el("p", "hint", "1（低い）〜10（高い）。人口成長率・産業力の計算に使われます。"));
    return wrap;
  }

  /** 戦術ドクトリン：どれがどう違うかを、説明と効果（兵科ごとの倍率）で見せて選ばせる */
  const UNIT_LABEL = { infantry: "歩兵", artillery: "砲兵", armor: "機甲", air: "航空", navy: "海軍", special: "特殊部隊", advanced: "先端技術" };
  function doctrineEffects(d) {
    const out = [];
    for (const [k, label] of Object.entries(UNIT_LABEL)) {
      const m = d.mult?.[k] ?? 1;
      if (Math.abs(m - 1) > 0.001) out.push({ text: `${label} ×${m}`, up: m > 1 });
    }
    if (d.defenseBonus) out.push({ text: `守るとき戦力 +${Math.round(d.defenseBonus * 100)}%`, up: true });
    if (d.moraleLoss && d.moraleLoss < 1) out.push({ text: "士気が崩れにくい", up: true });
    if (d.moraleLoss && d.moraleLoss > 1) out.push({ text: "士気が崩れやすい", up: false });
    if (d.conscriptBonus) out.push({ text: `徴兵 +${Math.round(d.conscriptBonus * 100)}%`, up: true });
    return out;
  }
  function doctrineSection(stateId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "戦術ドクトリン"));
    wrap.append(el("p", "hint", "国全体の戦い方の方針（部隊ごとではなく国ごとに1つ）。得意な兵科が強くなる代わりに、別の兵科が少し弱くなります。"));
    const current = editActions.getDoctrine(stateId);
    const list = el("div", "doctrine-list");
    for (const d of editActions.DOCTRINES) {
      const card = el("label", `doctrine-card${d.key === current ? " on" : ""}`);
      const radio = document.createElement("input"); radio.type = "radio"; radio.name = `doctrine-${stateId}`; radio.checked = d.key === current;
      radio.addEventListener("change", () => editActions.setDoctrine(stateId, d.key));
      const body = el("div", "doctrine-body");
      body.append(el("strong", "", d.label), el("p", "hint", d.desc ?? ""), el("p", "doctrine-merit", `👍 良さ: ${d.merit ?? ""}`));
      const chips = el("div", "doctrine-chips");
      for (const e of doctrineEffects(d)) chips.append(el("span", `doctrine-chip ${e.up ? "up" : "down"}`, e.text));
      if (!chips.children.length) chips.append(el("span", "doctrine-chip", "効果の偏りなし"));
      body.append(chips); card.append(radio, body); list.append(card);
    }
    wrap.append(list);
    return wrap;
  }


  function noteField(map, type, id) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "文章"));
    const { text, rich } = htmlToEditable(editActions.getNote(type, id));
    if (rich) { wrap.append(el("p", "hint", "書式（HTML）を含む文章のため、書式を保ったまま次のとおり保存されます。プレーンテキストとして編集すると書式は失われます。")); }
    const ta = document.createElement("textarea");
    ta.className = "note-field"; ta.value = text; ta.rows = 4;
    ta.addEventListener("change", () => editActions.setNote(type, id, editableToHtml(ta.value, rich)));
    wrap.append(ta);
    return wrap;
  }

  /** suggest を渡すと、入力欄の横に「🎲」（仮の名前を生成して即反映）が付く */
  function textField(label, value, onChange, suggest) {
    const row = el("label", "field");
    row.append(el("span", "field-label", label));
    const input = document.createElement("input");
    input.value = value ?? "";
    input.addEventListener("change", () => onChange(input.value));
    if (!suggest) { row.append(input); return row; }
    const box = el("span", "name-row");
    const dice = el("button", "suggest-mini", "🎲");
    dice.type = "button";
    dice.title = "仮の名前を生成（押すたびに変わります。Undo で戻せます）";
    dice.addEventListener("click", (ev) => {
      ev.preventDefault();
      const v = suggest();
      if (v) { input.value = v; onChange(v); }
    });
    box.append(input, dice);
    row.append(box);
    return row;
  }

  /** 仮の名前なら、その旨と「この名前で確定」ボタンを返す（そうでなければ空配列） */
  function provisionalNote(kind, id) {
    return []; // 仮決定は廃止（名前はいつでも上書きできる）
    // eslint-disable-next-line no-unreachable
    if (!editActions.isProvisional(kind, id)) return [];
    const box = el("div", "provisional-note");
    box.append(el("span", "", "🎲 仮の名前です。"));
    const ok = el("button", "", "この名前で確定");
    ok.type = "button";
    ok.addEventListener("click", () => editActions.confirmName(kind, id));
    box.append(ok);
    return [box];
  }

  /** 文化の「名前の系統」。この文化の都市・属州・国家の仮名の雰囲気を決める */
  function nameStyleSection(cultureId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "名前の系統（仮生成用）"));
    const sel = document.createElement("select");
    const explicit = editActions.getNameStyle(cultureId);
    const auto = editActions.effectiveNameStyle(cultureId);
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = `自動（${editActions.NAME_STYLES[auto].label}）`;
    sel.append(o0);
    for (const k of editActions.STYLE_KEYS) {
      const o = document.createElement("option");
      o.value = k; o.textContent = editActions.NAME_STYLES[k].label;
      sel.append(o);
    }
    sel.value = explicit ?? "";
    sel.addEventListener("change", () => editActions.setNameStyle(cultureId, sel.value || null));
    wrap.append(sel);
    wrap.append(el("p", "hint", "この文化の領域に作る都市・属州の仮の名前が、この系統の響きになります。"));
    return wrap;
  }

  function table(rows) {
    const t = document.createElement("table"); t.className = "editor-table";
    for (const [k, v] of rows) { const tr = document.createElement("tr"); tr.append(el("th", "", k), el("td", "", String(v))); t.append(tr); }
    return t;
  }

  const safeRender = guardRender(root, () => render());
  // 時間が進むだけの更新（update）では描き直さない。入力中は保留する
  store.subscribe((state, change) => { if (current && (change.type === "replace")) close(); else if (current && change.type !== "update" && change.type !== "batch") safeRender(); });
  return {
    openCell: (id) => open("cell", id),
    openBurg: (id) => open("burg", id),
    openMarker: (id) => open("marker", id),
    openEntity: (kind, id) => open(kind, id),
    close,
    buildDiplomacy,
    promptBurgName(cb, cell) {
      promptDialog("新しい都市の名前", "", {
        suggest: () => editActions.suggestName("burg", { cell }),
        hint: "空欄のまま OK を押すと、その土地の文化に合わせた仮の名前が付きます",
      }).then(cb);
    },
    /** wars/alliances/military パネルを後から差し込む（main.js の組み立て順の都合） */
    setPanels(p) { panels = p; },
  };
}
