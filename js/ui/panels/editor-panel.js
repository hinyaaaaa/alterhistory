// エディタパネル：選ばれた対象（セル・都市・マーカー・国家など）の情報と編集フォームを表示する。
// サイドバーの凡例の下に差し込む1枚のパネル。DOMを直接組み立てる（フレームワーク不使用）。

import { describeCell } from "../../core/query.js";
import { htmlToEditable, editableToHtml } from "../../core/edit/notes.js";
import { relationLabel, RELATIONS } from "../../core/edit/diplomacy.js";
import { DEFAULT_MARKER_TYPES, defaultMarkerName } from "../../core/edit/markers.js";
import { byId } from "../dom.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;

export function initEditorPanel({ store, editActions }) {
  const root = byId("editor-panel");
  let current = null; // { kind: "cell"|"burg"|"marker"|"state"|..., id }

  function open(kind, id) { current = { kind, id }; render(); }
  function close() { current = null; render(); }

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

    const body = el("div", "editor-body");
    root.append(body);

    if (current.kind === "cell") renderCell(map, title, body);
    else if (current.kind === "burg") renderBurg(map, title, body);
    else if (current.kind === "marker") renderMarker(map, title, body);
    else renderEntity(map, current.kind, title, body);
  }

  function renderCell(map, title, body) {
    const info = describeCell(map, current.id);
    title.textContent = `セル #${current.id}`;
    if (!info) { body.append(el("p", "muted", "情報がありません")); return; }
    const rows = [["地形", info.biome], ["標高", info.height], ["国家", info.state], ["文化", info.culture],
      ["宗教", info.religion], ["属州", info.province], ["都市", info.burg]];
    body.append(table(rows.filter(([, v]) => v != null)));
    if (info.burg) { const b = el("button", "link", `都市「${info.burg}」を開く`); b.addEventListener("click", () => open("burg", map.pack.cells.burg[current.id])); body.append(b); }
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
    del.addEventListener("click", () => { if (confirm("このマーカーを削除しますか？")) { editActions.removeMarker(m.i); close(); } });
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
    form.append(textField("名前", b.name, (v) => editActions.renameBurg(b.i, v)));

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
    del.addEventListener("click", () => { if (confirm("この都市を削除しますか？")) { editActions.removeBurg(b.i); close(); } });
    form.append(del);
    if (reason) form.append(el("p", "hint", reason));
    body.append(form);
  }

  function renderEntity(map, kind, title, body) {
    const list = { state: map.pack.states, culture: map.pack.cultures, religion: map.pack.religions, province: map.pack.provinces }[kind];
    const e = list?.[current.id];
    if (!isLive(e)) { close(); return; }
    const labelOf = { state: "国家", culture: "文化", religion: "宗教", province: "属州" }[kind];
    title.textContent = `${labelOf}「${e.fullName ?? e.name}」`;
    const form = el("div", "editor-form");
    const stats = [["セル数", e.cells], ["面積", e.area], ["都市数", Array.isArray(e.burgs) ? e.burgs.length : e.burgs]].filter(([, v]) => v != null);
    form.append(table(stats));
    form.append(attributesField(kind, e.i));
    form.append(noteField(map, kind, e.i));
    if (kind === "state") form.append(diplomacySection(map, e.i));
    body.append(form);
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

  function textField(label, value, onChange) {
    const row = el("label", "field");
    row.append(el("span", "field-label", label));
    const input = document.createElement("input");
    input.value = value ?? "";
    input.addEventListener("change", () => onChange(input.value));
    row.append(input);
    return row;
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
    promptBurgName(cb) { const name = prompt("新しい都市の名前"); cb(name); },
  };
}
