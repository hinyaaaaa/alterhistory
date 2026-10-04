// 歴史ビルダー：「楽に作る」と「好きに決める」を1つのパネルで両立させる。
//
// 設計の考え方（段階的開示）:
//   1. かんたん作成 … ボタン1つで、仮の名前つきで作られる。おまかせ領土＋首都まで押すだけで済む。
//   2. 作業中カード … 作った直後だけ出る。名前の引き直し・領土の決め方（ドラッグ or おまかせ）だけを見せる。
//   3. つくった歴史   … 普通は1行。「詳しく」を開いた人にだけ、技術水準・ドクトリン・首都などを見せる。
//   4. 仮の名前トレイ … 仮の名前を数えて、まとめて確定できる。気に入らなければ個別に🎲。
// 細かい設定は消さずに畳む。全部おまかせでも、1つだけ手で決めても、途中で混ぜてもよい。

import { guardRender } from "./safe-render.js";
import { byId } from "./dom.js";
import { NAME_STYLES, STYLE_KEYS } from "../core/names/katakana.js";
import { listEntities } from "../core/query.js";
import { appendEntityProfile, burgDetails, featureIcons } from "./profile-fields.js";

const LIST_KEY = { state: "states", culture: "cultures", religion: "religions" };
const ICON = { state: "🏳", religion: "☨", culture: "☖" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(cls, text, title, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

export function initHistoryBuilder({ store, viewport, renderer, editActions, builderActions, editMode, panels, views = {} }) {
  const panel = byId("builder-panel");
  const fab = byId("btn-builder");
  const body = byId("builder-body");
  const editFab = byId("btn-edit-mode");

  let task = null;            // { kind, id, size, autoCapital, status }
  let tab = "state";          // 一覧のタブ
  let nameStyle = "";         // 名前の雰囲気（"" = おまかせ）
  const openCards = new Set(); // 「詳しく」を開いているカード（"kind:id"）
  let scheduled = false;
  let mode = "build";         // "build"（つくる）| "economy"（経済・交易）| "travel"（旅・ゾーン）
  let cellCounts = new Map(); // 一覧に出している種類の「実際のセル数」

  const getMap = () => store.getState().map;
  const ent = (kind, id) => getMap()?.pack[LIST_KEY[kind]]?.[id];
  const nameOf = (e) => e.fullName ?? e.name;
  const styleOpt = () => (nameStyle ? { style: nameStyle } : {});

  const MODES = [["build", "つくる"], ["economy", "経済・交易"], ["travel", "旅・ゾーン"]];
  function setMode(next) {
    if (next === mode) return;
    views[mode]?.leave?.();            // 離れる画面の後始末（貿易線を消す・描き途中を終える など）
    if (mode === "build" && task) finishTask();
    mode = next;
    render();
  }
  function modeTabs() {
    const bar = el("div", "b-modes");
    for (const [key, label] of MODES) {
      if (key !== "build" && !views[key]) continue;
      bar.append(btn(`b-mode${mode === key ? " on" : ""}`, label, "", () => setMode(key)));
    }
    return bar;
  }

  // ---------- 開閉 ----------
  function isOpen() { return !panel.hidden; }
  // パネルの開閉で地図の表示幅が変わる。「全体表示」の状態だったときだけ、見える範囲に合わせ直す
  // （拡大して作業中の人の視点は動かさない）。レイアウトが確定してから行うので2フレーム待つ。
  function refitIfWasFit(wasFit) {
    if (!wasFit) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { renderer.resize(); viewport.fit(); renderer.requestRender(); }));
  }
  const isFit = () => Math.abs(viewport.k - viewport.fitK) < 1e-6;
  function open() {
    // 地図編集パネルと右側で重なるので、どちらか一方だけ開く
    if (editFab.getAttribute("aria-expanded") === "true") editFab.click();
    const wasFit = isFit();
    panel.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    render();
    refitIfWasFit(wasFit);
  }
  function close() {
    views[mode]?.leave?.();
    mode = "build";
    const wasFit = isFit();
    panel.hidden = true; fab.setAttribute("aria-expanded", "false");
    refitIfWasFit(wasFit);
  }
  fab.addEventListener("click", () => (isOpen() ? close() : open()));
  byId("builder-close").addEventListener("click", close);
  editFab.addEventListener("click", () => { if (isOpen() && editFab.getAttribute("aria-expanded") !== "true") close(); }, true);

  // ---------- 部品 ----------
  function swatch(e) { const s = el("span", "b-swatch"); s.style.background = e.color ?? "#888"; return s; }

  // 仮決定の仕組みは廃止：名前はいつでも上書きでき、「仮」の印や確定ボタンは出さない
  function provBadge() { return null; }

  function startPaint(kind, id) {
    task = { kind, id, size: task?.size ?? "m", autoCapital: task?.autoCapital ?? true, status: "地図をドラッグして、領土を塗ってください" };
    builderActions.beginPaint(kind, id);
    render();
  }

  function runAuto(kind, id, size) {
    const r = builderActions.autoClaim(kind, id, size);
    if (!task || task.id !== id) task = { kind, id, size, autoCapital: true, status: "" };
    task.size = size;
    task.mode = r.ok ? "auto" : "drag";
    if (r.ok) task.status = `おまかせで ${r.count} セルを領土にしました（Ctrl+Z で取り消し）`;
    else if (r.reason === "no-adjacent-free-land") task.status = "隣り合う空き地がありません。地図をドラッグして塗り足してください";
    else if (r.reason === "no-free-land") task.status = "空き地がありません。地図をドラッグして塗ってください";
    else task.status = "領土を決められませんでした";
    if (!r.ok) builderActions.beginPaint(kind, id); // 失敗したら手で塗れるようにしておく
    render();
  }

  function finishTask() {
    if (!task) return;
    const { kind, id, autoCapital } = task;
    if (kind === "state" && autoCapital) builderActions.autoCapital(id);
    builderActions.endPaint();
    task = null;
    render();
  }

  function cancelFresh() {
    store.undo();
    builderActions.endPaint();
    task = null;
    render();
  }

  // ---------- かんたん作成 ----------
  function quickSection() {
    const sec = el("section", "b-sec");
    sec.append(el("h4", "b-title", "かんたん作成"));
    const grid = el("div", "b-quick");
    const defs = [
      ["state", "国を建てる", "仮の名前で国を作り、領土を決める"],
      ["religion", "宗教を興す", "仮の名前で宗教を作り、信者の土地を決める"],
      ["culture", "文化を加える", "仮の名前で文化を作り、その土地を決める"],
    ];
    for (const [kind, label, tip] of defs) {
      const b = el("button", "b-quick-btn");
      b.type = "button"; b.title = tip;
      b.append(el("span", "b-quick-icon", ICON[kind]), el("span", "b-quick-label", label));
      b.addEventListener("click", () => {
        const id = builderActions.create(kind, styleOpt());
        if (id == null) return;
        tab = kind;
        startPaint(kind, id);
      });
      grid.append(b);
    }
    sec.append(grid);

    // 任意のこだわり：名前の雰囲気。畳んでおく
    const more = el("details", "b-more");
    if (nameStyle) more.open = true;
    more.append(el("summary", "", nameStyle ? `名前の雰囲気：${NAME_STYLES[nameStyle].label}` : "名前の雰囲気を指定する（任意）"));
    const sel = document.createElement("select");
    sel.append(new Option("おまかせ（毎回ばらばら）", ""));
    for (const k of STYLE_KEYS) sel.append(new Option(NAME_STYLES[k].label, k));
    sel.value = nameStyle;
    sel.addEventListener("change", () => { nameStyle = sel.value; render(); });
    more.append(sel, el("p", "b-hint", "指定すると、これから作る名前と🎲がその雰囲気になります。"));
    sec.append(more);
    return sec;
  }

  // ---------- 作業中カード ----------
  function taskSection() {
    if (!task) return null;
    const e = ent(task.kind, task.id);
    if (!isLive(e)) { task = null; return null; }
    const label = builderActions.KIND_LABEL[task.kind];
    const sec = el("section", "b-task");
    const head = el("div", "b-task-head");
    head.append(swatch(e), el("span", "b-task-kind", `${label}を作成中`));
    sec.append(head);

    const nameRow = el("div", "b-namerow");
    const input = document.createElement("input");
    input.value = nameOf(e);
    input.setAttribute("aria-label", `${label}の名前`);
    input.addEventListener("change", () => { if (input.value.trim()) editActions.renameEntity(task.kind, task.id, input.value); });
    nameRow.append(input, btn("suggest-mini", "🎲", "名前を引き直す", () => { builderActions.rerollName(task.kind, task.id, styleOpt()); }));
    const badge = provBadge(task.kind, task.id);
    if (badge) nameRow.append(badge);
    sec.append(nameRow);

    sec.append(el("p", "b-status", task.status));

    // 領土の決め方：ドラッグ（既定）／おまかせ
    const free = builderActions.freeLand(task.kind);
    const how = el("div", "b-how");
    const drag = btn(`b-seg${task.mode === "auto" ? "" : " active"}`, "✋ ドラッグで塗る", "地図をなぞって領土を決める", () => { task.mode = "drag"; task.status = "地図をドラッグして、領土を塗ってください"; builderActions.beginPaint(task.kind, task.id); render(); });
    const auto = btn(`b-seg${task.mode === "auto" ? " active" : ""}`, "🎲 おまかせで決める", free ? `空き地（${free}セル）から自動で決める` : "空き地がありません", () => runAuto(task.kind, task.id, task.size));
    auto.disabled = !free;
    how.append(drag, auto);
    sec.append(how);

    const sizeRow = el("div", "b-sizes");
    sizeRow.append(el("span", "b-mini", "おまかせの大きさ"));
    for (const [k, v] of Object.entries(builderActions.TERRITORY_SIZES)) {
      sizeRow.append(btn(`b-chip${task.size === k ? " on" : ""}`, v.label, "", () => { task.size = k; render(); }));
    }
    sec.append(sizeRow);

    const brush = el("label", "b-brush");
    brush.append(el("span", "b-mini", "ブラシ"));
    const rng = document.createElement("input");
    rng.type = "range"; rng.min = "10"; rng.max = "200"; rng.value = String(store.getState().brushRadius ?? 40);
    rng.addEventListener("input", () => editMode.setRadius(Number(rng.value)));
    brush.append(rng);
    sec.append(brush);

    if (task.kind === "state") {
      const lab = el("label", "b-check");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = task.autoCapital;
      cb.addEventListener("change", () => { task.autoCapital = cb.checked; });
      lab.append(cb, el("span", "", "完了したら首都を自動で置く（仮の名前）"));
      sec.append(lab);
    }

    const actions = el("div", "b-actions");
    const fresh = e.cells === 0 && store.peekUndoLabel() === `${label}を新規作成`;
    if (fresh) actions.append(btn("", "やめる", "作成を取り消す", cancelFresh));
    actions.append(btn("primary", "完了", "この内容で確定して、ツールを終える", finishTask));
    sec.append(actions);
    return sec;
  }

  // ---------- つくった歴史（カード一覧） ----------
  function listSection() {
    const map = getMap();
    const sec = el("section", "b-sec");
    sec.append(el("h4", "b-title", "つくった歴史"));

    // 横タブは使わず、種類をプルダウンで選ぶ
    const kindSel = document.createElement("select"); kindSel.className = "b-kind-select";
    for (const k of ["state", "religion", "culture"]) {
      const n = map.pack[LIST_KEY[k]].filter(isLive).length;
      const o = document.createElement("option"); o.value = k; o.textContent = `${builderActions.KIND_LABEL[k]}（${n}）`; kindSel.append(o);
    }
    const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed);
    { const o = document.createElement("option"); o.value = "burg"; o.textContent = `都市（${burgs.length}）`; kindSel.append(o); }
    kindSel.value = tab;
    kindSel.addEventListener("change", () => { tab = kindSel.value; render(); });
    sec.append(kindSel);
    if (tab === "burg") {
      const list = el("div", "b-cards");
      for (const b of burgs.sort((a, c) => (c.population ?? 0) - (a.population ?? 0)).slice(0, 80)) list.append(burgCard(b));
      if (!burgs.length) sec.append(el("p", "b-hint", "まだ都市がありません。地図編集の「都市」で置けます。"));
      sec.append(list);
      if (burgs.length > 80) sec.append(el("p", "b-hint", `人口の多い80件を表示しています（全${burgs.length}件）。`));
      return sec;
    }

    // セル数は保存された統計値ではなく、実際のセルから数える（凡例と同じ集計。保存値は古いことがある）
    cellCounts = new Map(listEntities(map, tab).map((x) => [x.id, x.cells]));
    const items = map.pack[LIST_KEY[tab]].filter(isLive).sort((a, b) => b.i - a.i);
    if (!items.length) sec.append(el("p", "b-hint", "まだありません。上のボタンで作れます。"));
    const list = el("div", "b-cards");
    for (const e of items) list.append(card(tab, e));
    sec.append(list);
    return sec;
  }

  function burgCard(b) {
    const key = `burg:${b.i}`;
    const wrap = el("div", "b-card");
    const row = el("div", "b-row b-click");
    const st = getMap().pack.states[b.state];
    row.append(swatch({ color: st?.color ?? "#888" }));
    const main = el("div", "b-row-main");
    const nm = el("div", "b-row-name");
    nm.append(el("span", "", `${b.capital ? "🏰 " : ""}${b.name}`));
    const badge = provBadge("burg", b.i);
    if (badge) nm.append(badge);
    main.append(nm, el("div", "b-row-meta", `${st?.name ?? "無所属"}・人口 ${Math.round((b.population ?? 0) * 10) / 10}${featureIcons(b) ? "・" + featureIcons(b) : ""}`));
    const open = openCards.has(key);
    row.append(main, el("span", "b-chev", open ? "▴" : "▾"));
    row.addEventListener("click", () => { if (open) openCards.delete(key); else openCards.add(key); render(); });
    wrap.append(row);
    if (open) wrap.append(burgDetails(b, { editActions, map: getMap() }));
    return wrap;
  }

  function card(kind, e) {
    const key = `${kind}:${e.i}`;
    const wrap = el("div", "b-card");
    const active = task && task.kind === kind && task.id === e.i;
    if (active) wrap.classList.add("active");

    const row = el("div", "b-row");
    row.append(swatch(e));
    const main = el("div", "b-row-main");
    const nm = el("div", "b-row-name");
    nm.append(el("span", "", nameOf(e)));
    const badge = provBadge(kind, e.i);
    if (badge) nm.append(badge);
    main.append(nm, el("div", "b-row-meta", metaText(kind, e)));
    row.append(main);

    const ops = el("div", "b-row-ops");
    if (badge) ops.append(btn("suggest-mini", "✓", "この名前で確定", () => editActions.confirmName(kind, e.i)));
    const isOpenCard = openCards.has(key);
    ops.append(btn("suggest-mini b-more-btn", isOpenCard ? "▴" : "▾", "詳しく設定", () => {
      if (openCards.has(key)) openCards.delete(key); else openCards.add(key);
      render();
    }));
    row.append(ops);
    wrap.append(row);

    if (isOpenCard) wrap.append(details(kind, e));
    return wrap;
  }

  function metaText(kind, e) {
    const parts = [`${cellCounts.get(e.i) ?? 0}セル`];
    if (kind === "state") {
      const cap = getMap().pack.burgs[e.capital];
      parts.push(cap && cap.i && !cap.removed ? `首都 ${cap.name}` : "首都なし");
    }
    return parts.join("・");
  }

  function details(kind, e) {
    const d = el("div", "b-details");

    const nameF = el("label", "b-field");
    nameF.append(el("span", "b-mini", "名前"));
    const input = document.createElement("input");
    input.value = nameOf(e);
    input.addEventListener("change", () => { if (input.value.trim()) editActions.renameEntity(kind, e.i, input.value); });
    nameF.append(input);
    d.append(nameF);

    if (kind === "state") {
      const tech = el("label", "b-field");
      const val = el("span", "b-mini", `技術水準 ${editActions.getTechLevel(e.i) ?? 3}`);
      const r = document.createElement("input");
      r.type = "range"; r.min = String(editActions.TECH_MIN); r.max = String(editActions.TECH_MAX);
      r.value = String(editActions.getTechLevel(e.i) ?? 3);
      r.addEventListener("input", () => { val.textContent = `技術水準 ${r.value}`; });
      r.addEventListener("change", () => editActions.setTechLevel(e.i, Number(r.value)));
      tech.append(val, r);
      d.append(tech);

      const doc = el("label", "b-field");
      doc.append(el("span", "b-mini", "戦争ドクトリン"));
      const sel = document.createElement("select");
      for (const x of editActions.DOCTRINES) sel.append(new Option(x.label, x.key));
      sel.value = editActions.getDoctrine(e.i);
      sel.addEventListener("change", () => editActions.setDoctrine(e.i, sel.value));
      doc.append(sel);
      d.append(doc);

      const burgs = getMap().pack.burgs.filter((b) => b && b.i && !b.removed && b.state === e.i);
      if (burgs.length) {
        const cap = el("label", "b-field");
        cap.append(el("span", "b-mini", "首都"));
        const cs = document.createElement("select");
        for (const b of burgs) cs.append(new Option(b.name, String(b.i)));
        cs.value = String(e.capital);
        cs.addEventListener("change", () => editActions.setCapital(e.i, Number(cs.value)));
        cap.append(cs);
        d.append(cap);
      }
    }

    if (kind === "culture") {
      const f = el("label", "b-field");
      f.append(el("span", "b-mini", "名前の系統（この文化の地名の雰囲気）"));
      const sel = document.createElement("select");
      for (const k of STYLE_KEYS) sel.append(new Option(NAME_STYLES[k].label, k));
      sel.value = editActions.effectiveNameStyle(e.i);
      sel.addEventListener("change", () => editActions.setNameStyle(e.i, sel.value));
      f.append(sel);
      d.append(f);
    }

    appendEntityProfile(d, kind, e, { editActions, map: getMap(), openEntity: (k, i) => { tab = k; openCards.add(`${k}:${i}`); render(); } });

    const terr = el("div", "b-how");
    terr.append(btn("b-seg", "✋ 塗り足す", "この土地を地図でドラッグして広げる・直す", () => startPaint(kind, e.i)));
    d.append(terr);
    // ランダムに決める操作は、一覧の行ではなくここ（詳細の中）にまとめる。誤って押しにくい
    const rnd = document.createElement("details"); rnd.className = "b-random";
    rnd.append(el("summary", "", "🎲 ランダム設定"));
    const rndRow = el("div", "b-how");
    rndRow.append(
      btn("b-seg", "🎲 名前を引き直す", "名前を新しくランダムに決める（今の名前は置き換わります）", () => builderActions.rerollName(kind, e.i, styleOpt())),
      btn("b-seg", "🎲 隣の空き地へ広げる", "この土地に接した空き地へ、地形に沿って自動で広げる", () => runAuto(kind, e.i, task?.size ?? "m")),
    );
    rnd.append(rndRow); d.append(rnd);

    const foot = el("div", "b-actions");
    foot.append(btn("", "全設定を開く ↗", "文章・外交など、すべての設定を左のパネルで開く", () => panels.openEntity(kind, e.i)));
    d.append(foot);
    return d;
  }

  // ---------- 仮の名前トレイ ----------
  const PROV_KINDS = { state: ["states", "国家"], culture: ["cultures", "文化"], religion: ["religions", "宗教"], province: ["provinces", "属州"], burg: ["burgs", "都市"] };
  let provOpen = false;
  function provisionalSection() {
    return null; // 仮決定は廃止
    // eslint-disable-next-line no-unreachable
    const list = builderActions.provisional();
    if (!list.length) return null;
    const box = el("section", "b-tray b-tray-col");
    const head = el("div", "b-tray-head");
    head.append(el("span", "b-tray-text", `🎲 仮の名前が ${list.length} 件あります`));
    head.append(btn("", provOpen ? "一覧を閉じる" : "一覧を見る", "どれが仮の名前か確認する", () => { provOpen = !provOpen; schedule(); }));
    head.append(btn("primary", "すべて確定", "名前はそのまま、「仮」の印だけ外す（Undo 1回で戻せます）", () => { builderActions.confirmAll(); }));
    box.append(head);
    if (provOpen) {
      const map = getMap();
      const ul = el("ul", "b-prov-list");
      for (const { kind, id } of list) {
        const [key, label] = PROV_KINDS[kind] ?? [null, kind];
        const name = (key && map?.pack?.[key]?.[id]?.name) || `#${id}`;
        const li = el("li", "b-prov-item");
        li.append(el("span", "b-prov-kind", label), el("span", "b-prov-name", name));
        li.append(btn("", "✓ 確定", `${name} の「仮」の印を外す`, () => { editActions.confirmName(kind, id); }));
        ul.append(li);
      }
      box.append(ul);
    }
    return box;
  }

  // ---------- 描画 ----------
  function render() {
    scheduled = false;
    if (!isOpen()) return;
    const map = getMap();
    const scrollTop = panel.scrollTop;
    body.replaceChildren();
    if (!map) { body.append(el("p", "b-hint", "地図を開いてください。")); return; }
    body.append(modeTabs());
    if (mode !== "build" && views[mode]) {
      const c = el("div", "b-modebody");
      body.append(c);
      views[mode].render(c);
      panel.scrollTop = scrollTop;
      return;
    }
    body.append(el("p", "b-lead", "ボタン1つで、まず形になります。名前・領土・設定は、いつでも自由に直せます。"));
    body.append(quickSection());
    const t = taskSection(); if (t) body.append(t);
    body.append(listSection());
    const p = provisionalSection(); if (p) body.append(p);
    panel.scrollTop = scrollTop;
  }
  const safeBuilderRender = guardRender(panel, () => render());
  function schedule() { if (scheduled || !isOpen()) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; safeBuilderRender(); }); }

  store.subscribe((_s, change) => {
    if (change.type === "replace") { task = null; openCards.clear(); for (const v of Object.values(views)) v.leave?.(); mode = "build"; }
    // ブラシで塗っている最中(batch)は軽く保つため、終わってから(commit)描き直す。
    // update はツール切替・ブラシ幅など表示に関係しない変更なので無視する（スライダー操作中に
    // パネルを作り直すと、つまみを掴んだまま離されてしまう）。
    if (change.type === "batch" || change.type === "update") return;
    schedule();
  });

  return { open, close, toggle: () => (isOpen() ? close() : open()), get isOpen() { return isOpen(); }, _state: () => ({ task, tab, nameStyle }) };
}
