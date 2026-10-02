// エディタパネル：選ばれた対象（セル・都市・マーカー・国家など）の情報と編集フォームを表示する。
// 左サイドバーに差し込む1枚のパネル。DOMを直接組み立てる（フレームワーク不使用）。
// 国家（kind === "state"）はサブタブ化して、基本情報・外交・軍事・属州を1つのタブ内に集約する。

import { describeCell, statePopulation, stateMilitaryPower, stateHeadcount, stateRank } from "../../core/query.js";
import { htmlToEditable, editableToHtml } from "../../core/edit/notes.js";
import { relationLabel, RELATIONS } from "../../core/edit/diplomacy.js";
import { DEFAULT_MARKER_TYPES, defaultMarkerName } from "../../core/edit/markers.js";
import { byId } from "../dom.js";
import { confirmDialog, promptDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const STATE_SUBTABS = [
  { key: "info", label: "基本情報", icon: "⛭" },
  { key: "diplomacy", label: "外交", icon: "⛨" },
  { key: "military", label: "軍事", icon: "⚔" },
  { key: "provinces", label: "属州", icon: "▦" },
];

export function initEditorPanel({ store, editActions, editMode, panels: initialPanels }) {
  const root = byId("editor-panel");
  const sidebar = byId("sidebar");
  let current = null; // { kind: "cell"|"burg"|"marker"|"state"|..., id }
  let stateSubtab = "info"; // 国家タブが開いているときの、選ばれているサブタブ
  // panels（wars/alliances/military）は循環importを避けるため main.js から後付けで渡す
  let panels = initialPanels ?? null;

  // 軍事・戦争・同盟の各パネルは、index.html の #panel-mounts に1つずつ実体がある。
  // 国家タブのサブタブを開くとこの実体を editor-panel の中へ「移動」して見せるが、render() は
  // 毎回 root の中身を丸ごと消すため、移動したままだと実体が文書から外れて二度と見つからなくなる。
  // そこで参照を起動時に握っておき、再描画の直前に必ず元の置き場へ戻す。
  const mountHome = byId("panel-mounts");
  const mounts = { regiments: byId("tab-regiments"), wars: byId("tab-wars"), alliances: byId("tab-alliances") };
  function reclaimMounts() {
    for (const m of Object.values(mounts)) { m.hidden = true; mountHome.append(m); }
  }

  function open(kind, id) { current = { kind, id }; if (kind === "state") stateSubtab = "info"; render(); }
  function close() {
    current = null;
    panels?.military?.unlock?.();
    render();
  }

  function render() {
    reclaimMounts(); // 中身を消す前に、持ち出していたパネルを元の置き場へ戻す
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

    // 選択中でないサブタブの持ち出しパネル（軍事・戦争・同盟）は、
    // DOMツリーから外れて孤立するだけで実害は無いが、hidden を戻して一貫させる
    if (stateSubtab !== "military") panels?.military?.unlock?.();

    const tabs = el("div", "dialog-tabs");
    tabs.setAttribute("role", "tablist");
    for (const t of STATE_SUBTABS) {
      const b = el("button", `tab-btn${stateSubtab === t.key ? " active" : ""}`);
      b.type = "button"; b.setAttribute("role", "tab");
      const icon = el("span", "tab-icon", t.icon);
      b.append(icon, document.createTextNode(t.label));
      b.addEventListener("click", () => { stateSubtab = t.key; render(); });
      tabs.append(b);
    }
    root.append(tabs);

    const body = el("div", "editor-body tab-panel");
    root.append(body);

    if (stateSubtab === "info") renderStateInfo(map, e, body);
    else if (stateSubtab === "diplomacy") renderStateDiplomacy(map, e, body);
    else if (stateSubtab === "military") renderStateMilitary(map, e, body);
    else if (stateSubtab === "provinces") renderStateProvinces(map, e, body);
  }

  function renderStateInfo(map, e, body) {
    const form = el("div", "editor-form");
    form.append(basicStatsSection(map, e));
    form.append(textField("国家名", e.fullName ?? e.name, (v) => editActions.renameEntity("state", e.i, v), () => editActions.suggestName("state", { id: e.i })));
    form.append(...provisionalNote("state", e.i));
    form.append(techLevelSection(e.i));
    form.append(doctrineSection(e.i));
    form.append(growthRateSection(e.i));
    form.append(attributesField("state", e.i));
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

  function renderStateDiplomacy(map, e, body) {
    const form = el("div", "editor-form");
    form.append(diplomacyMatrix(map, e.i));
    form.append(diplomacySection(map, e.i));
    body.append(form);

    // 戦争・同盟は国をまたぐ全体管理なので、外交サブタブの下に続けて表示する
    if (panels?.wars) {
      const warsWrap = el("div", "editor-section");
      warsWrap.append(el("h4", "", "戦争"));
      const warsMount = mounts.wars;
      warsWrap.append(warsMount);
      warsMount.hidden = false;
      body.append(warsWrap);
      panels.wars.render();
    }
    if (panels?.alliances) {
      const alliancesWrap = el("div", "editor-section");
      alliancesWrap.append(el("h4", "", "同盟"));
      const alliancesMount = mounts.alliances;
      alliancesWrap.append(alliancesMount);
      alliancesMount.hidden = false;
      body.append(alliancesWrap);
      panels.alliances.render();
    }
  }

  /** 全国家×全国家の関係を一覧できるマトリクス表（Azgaarの外交表に相当）。
   *  現在選んでいる国家の行・列は強調する。セルをクリックすると関係を変更できる。 */
  function diplomacyMatrix(map, focusId) {
    const wrap = el("div", "editor-section diplomacy-matrix-wrap");
    wrap.append(el("h4", "", "外交一覧（全国家）"));
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
        const rel = editActions.getRelation(map, rowState.i, colState.i) ?? "Neutral";
        td.className = `rel-${rel}`;
        td.textContent = relationLabel(rel);
        td.title = `${rowState.fullName ?? rowState.name} → ${colState.fullName ?? colState.name}: ${relationLabel(rel)}（クリックで変更）`;
        if (rowState.i === focusId || colState.i === focusId) td.classList.add("focus-row-col");
        td.addEventListener("click", () => openRelationPicker(td, rowState.i, colState.i, rel));
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

  /** マトリクスのセルをクリックしたときに出す、関係変更用の簡易インライン選択 */
  function openRelationPicker(td, a, b, current) {
    // 既に開いている選択を閉じる
    document.querySelector(".diplomacy-matrix select.rel-picker")?.blur();
    if (td.querySelector("select")) return;
    const text = td.textContent;
    td.replaceChildren();
    const sel = document.createElement("select");
    sel.className = "rel-picker";
    for (const r of RELATIONS) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.label; if (r.id === current) o.selected = true; sel.append(o); }
    const restore = () => { td.replaceChildren(); td.textContent = text; };
    sel.addEventListener("change", () => { editActions.setDiplomacy(a, b, sel.value); });
    sel.addEventListener("blur", restore);
    td.append(sel);
    sel.focus();
  }

  function renderStateMilitary(map, e, body) {
    if (!panels?.military) { body.append(el("p", "muted", "軍事パネルが利用できません")); return; }
    panels.military.lockToState(e.i);
    const mount = mounts.regiments;
    body.append(mount);
    mount.hidden = false;
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
        const independence = el("button", "", "独立させる");
        independence.type = "button";
        independence.title = "この属州の領土を切り離し、新しい独立国家にします";
        independence.addEventListener("click", async () => {
          const name = await promptDialog(`独立させて作る新国家の名前`, `${p.fullName ?? p.name}`, {
            suggest: () => editActions.suggestName("state", { stateId: e.i }),
            hint: "空欄にすると、仮の名前が自動で付きます",
          });
          if (name == null) return;
          if (!(await confirmDialog(`属州「${p.fullName ?? p.name}」を独立させ、新国家${name.trim() ? `「${name}」` : "（仮の名前）"}を作ります。よろしいですか？`))) return;
          editActions.declareIndependence(p.i, name);
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
    const input = document.createElement("input");
    input.placeholder = "属州の名前（空欄なら仮の名前）";
    row.append(input);
    const dice = el("button", "suggest-mini", "🎲");
    dice.type = "button";
    dice.title = "仮の名前を生成";
    dice.addEventListener("click", () => { input.value = editActions.suggestName("province", { stateId: e.i }); });
    row.append(dice);
    const btn = el("button", "", "作る");
    btn.type = "button";
    btn.addEventListener("click", () => {
      const newId = editActions.addProvince(e.i, input.value);
      input.value = "";
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

  function growthRateSection(stateId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "人口増加率"));
    const attrs = editActions.getAttributes("state", stateId);
    const existing = attrs.find(([k]) => k === "人口増加率");
    const row = el("label", "field");
    const input = document.createElement("input");
    input.type = "number"; input.step = "0.1"; input.value = existing ? existing[1] : "1.0";
    input.addEventListener("change", () => {
      const next = attrs.filter(([k]) => k !== "人口増加率");
      next.push(["人口増加率", input.value]);
      editActions.setAttributes("state", stateId, next);
    });
    row.append(el("span", "field-label", "年あたりの倍率（例：1.0＝現状維持）"), input);
    wrap.append(row);
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
    form.append(attributesField(kind, e.i));
    form.append(noteField(map, kind, e.i));
    body.append(form);
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

  function doctrineSection(stateId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "戦争ドクトリン"));
    const sel = document.createElement("select");
    const current = editActions.getDoctrine(stateId);
    for (const d of editActions.DOCTRINES) {
      const o = document.createElement("option");
      o.value = d.key; o.textContent = d.label;
      if (d.key === current) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => editActions.setDoctrine(stateId, sel.value));
    wrap.append(sel);
    wrap.append(el("p", "hint", "国全体の戦い方の方針。全部隊の戦闘力に一律で影響します（部隊ごとには設定しません）。"));
    return wrap;
  }

  function diplomacySection(map, stateId) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "外交関係"));
    const others = map.pack.states.filter((s) => isLive(s) && s.i !== stateId);
    for (const s of others) {
      const row = el("div", "diplomacy-row");
      row.append(el("span", "diplomacy-name", s.name));
      const sel = document.createElement("select");
      const current = editActions.getRelation(map, stateId, s.i) ?? "Neutral";
      for (const r of RELATIONS) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.label; if (r.id === current) o.selected = true; sel.append(o); }
      sel.addEventListener("change", () => editActions.setDiplomacy(stateId, s.i, sel.value));
      row.append(sel);
      wrap.append(row);
    }
    return wrap;
  }

  function attributesField(kind, id) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "追加の属性"));
    const list = el("div", "attr-list");
    const entries = editActions.getAttributes(kind, id);
    const rowsState = entries.length ? entries.slice() : [["", ""]];

    const renderRows = () => {
      list.replaceChildren();
      rowsState.forEach((pair, i) => {
        const row = el("div", "attr-row");
        const k = document.createElement("input"); k.placeholder = "項目名（例：技術水準）"; k.value = pair[0];
        const v = document.createElement("input"); v.placeholder = "値（例：中世）"; v.value = pair[1];
        const commit = () => { rowsState[i] = [k.value, v.value]; editActions.setAttributes(kind, id, rowsState.filter(([kk]) => kk.trim())); };
        k.addEventListener("change", commit); v.addEventListener("change", commit);
        const rm = el("button", "attr-remove", "−"); rm.type = "button";
        rm.addEventListener("click", () => { rowsState.splice(i, 1); editActions.setAttributes(kind, id, rowsState.filter(([kk]) => kk.trim())); renderRows(); });
        row.append(k, v, rm);
        list.append(row);
      });
    };
    renderRows();
    const add = el("button", "", "＋ 項目を追加"); add.type = "button";
    add.addEventListener("click", () => { rowsState.push(["", ""]); renderRows(); });
    wrap.append(list, add);
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

  store.subscribe((state, change) => { if (current && (change.type === "replace")) close(); else if (current) render(); });
  return {
    openCell: (id) => open("cell", id),
    openBurg: (id) => open("burg", id),
    openMarker: (id) => open("marker", id),
    openEntity: (kind, id) => open(kind, id),
    close,
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
