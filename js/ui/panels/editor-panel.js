import { BURG_KINDS, PROVINCE_TITLES, RESOURCES } from "../../core/edit/world-info.js";
// エディタパネル：選ばれた対象（セル・都市・マーカー・国家など）の情報と編集フォームを表示する。
// 左サイドバーに差し込む1枚のパネル。DOMを直接組み立てる（フレームワーク不使用）。
// 国家の詳細は、国家タブ（ui/nation-window.js）に一本化した。ここでは、セル・都市・マーカー・文化・宗教・属州だけを扱う（v2.4.1）。

import { guardRender } from "../safe-render.js";
import { describeCell } from "../../core/query.js";
import { htmlToEditable, editableToHtml } from "../../core/edit/notes.js";
import { DEFAULT_MARKER_TYPES, defaultMarkerName } from "../../core/edit/markers.js";
import { byId } from "../dom.js";
import { appendEntityProfile } from "../profile-fields.js";
import { confirmDialog, promptDialog } from "../dialogs.js";
import { el } from "../kit.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0; // 0番（Neutrals＝無所属）は外交などの対象にしない

export function initEditorPanel({ store, editActions, editMode, panels: initialPanels }) {
  const root = byId("editor-panel");
  const sidebar = byId("sidebar");
  let current = null; // { kind: "cell"|"burg"|"marker"|"state"|..., id }
  // panels（wars/alliances/military）は循環importを避けるため main.js から後付けで渡す
  let panels = initialPanels ?? null;

  function open(kind, id) { current = { kind, id }; render(); }
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
    const body = el("div", "editor-body"); root.append(body); renderEntity(map, current.kind, title, body);
  }


  const sel = (opts, v) => { const s = el("select"); for (const [k, l] of opts) s.append(new Option(l, k)); if (v) s.value = v; return s; };
  /** 世界情報（選択式）: 国の特色・都市の種類・属州の称号・資源。数値にはつながず、表示と文のテンプレートに使う */
  function worldInfoSection(kind, e) {
    const box = el("div", "editor-section world-info"); if (!e) return box;
    box.append(el("h4", "", "情報"));
    const chips = (list, key, on) => { const w = el("div", "tl-rec-provs"); for (const o of list) { const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.checked = (e[key] ?? []).includes(o.key); cb.addEventListener("change", () => { const cur = new Set(e[key] ?? []); if (cb.checked) cur.add(o.key); else cur.delete(o.key); editActions.setWorldInfo(kind, e.i, { [key]: [...cur] }); }); lab.append(cb, document.createTextNode(" " + o.label)); w.append(lab); } return w; };
    if (kind === "burg") { const s = sel(BURG_KINDS.map((x) => [x.key, x.label]), e.kind ?? ""); s.addEventListener("change", () => editActions.setWorldInfo("burg", e.i, { kind: s.value })); box.append(el("span", "field-label", "都市の種類"), s); }
    if (kind === "province") { const s = sel(PROVINCE_TITLES.map((x) => [x.key, x.label]), e.title ?? ""); s.addEventListener("change", () => editActions.setWorldInfo("province", e.i, { title: s.value })); box.append(el("span", "field-label", "称号"), s); }
    { box.append(el("span", "field-label", "資源・特産")); box.append(chips(RESOURCES, "resources")); }
    return box;
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
    if (stateId) { const b = el("button", "link", `国家「${info.state}」を開く`); b.addEventListener("click", () => panels?.openEntity?.("state", stateId)); body.append(b); }
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
    body.append(worldInfoSection("burg", map.pack.burgs[current.id]));
    const b = map.pack.burgs[current.id];
    if (!isLive(b)) { close(); return; }
    title.textContent = `${b.capital ? "首都 ・ " : ""}${b.name}`;
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
    if (kind === "province") body.append(worldInfoSection("province", map.pack.provinces[current.id]));
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
    const dice = el("button", "suggest-mini", "@dice");
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
    box.append(el("span", "", "仮の名前です。"));
    const ok = el("button", "", "この名前で確定");
    ok.type = "button";
    ok.addEventListener("click", () => editActions.confirmName(kind, id));
    box.append(ok);
    return [box];
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
