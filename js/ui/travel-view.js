// 旅・ゾーンビュー。
//   旅: 名前をつけ、区間（出発→到着、移動手段）を足していく。距離と所要日数は縮尺と手段の速さから自動で出る。
//   ゾーン: 侵攻・疫病・災害など「ある範囲で起きていること」。地図をなぞって塗る／種の1点からおまかせで広げる。
// 「見る」が既定。細かい設定（色・種類・手段の変更）は、開いたカードの中だけに出す（段階的開示）。

import { el, btn, swatch } from "./kit.js";
import { TRANSPORTS, TRANSPORT_BY_ID, legStats, journeyTotals, formatDuration, travelScale } from "../core/sim/travel.js";
import { listJourneys } from "../core/edit/journeys.js";
import { ZONE_TYPES, zoneColor, zoneLabel } from "../core/edit/zones.js";
import { placeLabel } from "../core/query.js";

const fmt = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ja-JP");

export function createTravelView({ store, editActions, editMode, viewport, actions }) {
  let section = "journey";      // "journey" | "zone"
  let selJourney = null;        // 開いている旅のID
  let selZone = null;           // 開いているゾーンの添字
  let transport = "foot";       // 次に足す区間の移動手段
  let picking = null;           // 地図の選択待ち: { text }
  let paintingZone = null;      // 塗っているゾーンの添字
  let zoneSize = 24;
  let zoneType = "Invasion";
  let rerender = () => {};
  let renderOnce = () => {};

  const getMap = () => store.getState().map;
  const placeName = (map, cell) => placeLabel(map, cell);
  function setHighlight() { actions.setView({ journeySelected: selJourney, zoneSelected: selZone }); }

  // ---------- 旅 ----------
  function journeySection(map) {
    const sec = el("section", "b-sec");
    sec.append(btn("b-quick-btn b-wide", "＋ 旅をつくる", "空の旅を作る。そのあと区間を足す", () => {
      const id = editActions.addJourney({});
      if (id != null) { selJourney = id; setHighlight(); renderOnce(); }
    }));
    const sc = travelScale(map);
    if (sc.usedDefault) sec.append(el("p", "b-hint", "この地図には縮尺の情報がないため、標準（1画素＝3km）で計算します。"));
    const list = listJourneys(map);
    if (!list.length) sec.append(el("p", "b-hint", "まだ旅がありません。軍の遠征、商人の行き来、冒険者の道のりなどを記録できます。"));
    const cards = el("div", "b-cards");
    for (const j of list.slice().reverse()) cards.append(journeyCard(map, j));
    sec.append(cards);
    return sec;
  }

  function journeyCard(map, j) {
    const open = selJourney === j.id;
    const card = el("div", `b-card${open ? " active" : ""}`);
    const row = el("div", "b-row b-click");
    const sw = swatch(j.color);
    const main = el("div", "b-row-main");
    const tot = journeyTotals(map, j);
    main.append(el("div", "b-row-name", j.name),
      el("div", "b-row-meta", j.legs.length ? `${j.type}・${fmt(tot.distance)}${tot.unit}・${formatDuration(tot.days)}` : `${j.type}・区間なし`));
    row.append(sw, main, el("span", "b-chev", open ? "▴" : "▾"));
    row.addEventListener("click", () => { selJourney = open ? null : j.id; setHighlight(); renderOnce(); });
    card.append(row);
    if (open) card.append(journeyDetail(map, j));
    return card;
  }

  function journeyDetail(map, j) {
    const d = el("div", "b-details");

    const nameF = el("label", "b-field");
    nameF.append(el("span", "b-mini", "名前"));
    const input = document.createElement("input");
    input.value = j.name;
    input.addEventListener("change", () => { if (input.value.trim()) editActions.editJourney(j.id, { name: input.value }); });
    nameF.append(input);
    d.append(nameF);

    // 区間
    d.append(el("h5", "b-sub", "区間"));
    if (!j.legs.length) d.append(el("p", "b-hint", "まだ区間がありません。下で手段を選んで「区間を足す」を押し、地図で場所を選びます。"));
    j.legs.forEach((leg, idx) => {
      const t = TRANSPORT_BY_ID[leg.transport];
      const st = t ? legStats(map, leg, t) : { distance: 0, days: 0, unit: "" };
      const row = el("div", "b-leg");
      const head = el("div", "b-leg-head");
      head.append(el("span", "b-leg-ico", t?.icon ?? "?"),
        el("span", "b-leg-route", t?.domain === "stay" ? `${placeName(map, leg.from)}で滞在` : `${placeName(map, leg.from)} → ${placeName(map, leg.to)}`),
        btn("suggest-mini", "×", "この区間を削除", () => editActions.removeLeg(j.id, idx)));
      row.append(head);
      const meta = el("div", "b-row-meta", t?.domain === "stay" ? formatDuration(st.days) : `${fmt(st.distance)}${st.unit}・${formatDuration(st.days)}`);
      const sel = document.createElement("select");
      sel.title = "移動手段を変えると、経路を引き直します";
      for (const x of TRANSPORTS) sel.append(new Option(`${x.icon} ${x.label}`, x.id));
      sel.value = leg.transport;
      sel.addEventListener("change", () => editActions.changeLegTransport(j.id, idx, sel.value));
      row.append(meta, sel);
      d.append(row);
    });

    // 区間を足す
    const add = el("div", "b-addleg");
    const tsel = document.createElement("select");
    for (const x of TRANSPORTS) tsel.append(new Option(`${x.icon} ${x.label}`, x.id));
    tsel.value = transport;
    tsel.addEventListener("change", () => { transport = tsel.value; });
    add.append(tsel, btn("b-seg", picking ? "選択中…（Esc で取消）" : "＋ 区間を足す", "地図で場所を選ぶ", () => startPick(map, j)));
    d.append(add);
    if (picking) d.append(el("p", "b-status", picking.text));

    const tot = journeyTotals(map, j);
    if (j.legs.length) d.append(el("p", "b-hint", `合計 ${fmt(tot.distance)}${tot.unit}・${formatDuration(tot.days)}`));

    const foot = el("div", "b-actions");
    foot.append(btn("", "旅を削除", "この旅をすべて消す（Undoで戻せます）", () => { selJourney = null; editActions.removeJourney(j.id); setHighlight(); }));
    d.append(foot);
    return d;
  }

  /** 区間の追加: 最初の区間は出発点→到着点の2回、2つ目以降は到着点だけ選ぶ */
  function startPick(map, j) {
    if (picking) { editMode.cancelPick(); return; }
    const t = TRANSPORT_BY_ID[transport];
    const last = j.legs.at(-1);
    const finish = (from, to) => { editActions.addLeg(j.id, { transport, from, to }); picking = null; renderOnce(); };
    if (t.domain === "stay") { // 滞在は場所を選ばず、いまの終点で過ごす
      if (!last) { picking = { text: "最初の区間が「滞在」のときは、場所を選んでください" }; }
      else { finish(last.to, last.to); return; }
    }
    const askTo = (from) => {
      picking = { text: `${placeName(map, from)}から、どこへ行きますか？ 地図で目的地を選んでください` };
      editMode.pickCell((cell) => { if (cell == null) { picking = null; renderOnce(); return; } finish(from, cell); });
      renderOnce();
    };
    if (last) { askTo(last.to); return; }
    picking = { text: "出発点を、地図で選んでください" };
    editMode.pickCell((cell) => {
      if (cell == null) { picking = null; renderOnce(); return; }
      if (t.domain === "stay") { finish(cell, cell); return; }
      askTo(cell);
    });
    renderOnce();
  }

  // ---------- ゾーン ----------
  function zoneSection(map) {
    const sec = el("section", "b-sec");
    const row = el("div", "b-addleg");
    const tsel = document.createElement("select");
    for (const t of ZONE_TYPES) tsel.append(new Option(t.label, t.id));
    tsel.value = zoneType;
    tsel.addEventListener("change", () => { zoneType = tsel.value; });
    row.append(tsel);
    sec.append(row);

    const how = el("div", "b-how");
    how.append(
      btn("b-seg", "✋ 塗って作る", "空のゾーンを作り、地図をなぞって範囲を決める", () => {
        const idx = editActions.addZone({ type: zoneType });
        if (idx != null) { selZone = idx; startPaint(idx, "add"); }
      }),
      btn("b-seg", picking ? "選択中…" : "🎲 1点から広げる", "地図で中心を選ぶと、まわりに自動で広がる", () => {
        if (picking) { editMode.cancelPick(); return; }
        picking = { text: "ゾーンの中心を、地図で選んでください" };
        editMode.pickCell((cell) => {
          picking = null;
          if (cell != null) { const idx = editActions.addZoneAround(cell, { type: zoneType, size: zoneSize }); if (idx != null) { selZone = idx; setHighlight(); } }
          renderOnce();
        });
        renderOnce();
      }),
    );
    sec.append(how);
    if (picking) sec.append(el("p", "b-status", picking.text));
    const sizeRow = el("div", "b-sizes");
    sizeRow.append(el("span", "b-mini", "おまかせの広さ"));
    for (const [n, label] of [[10, "小"], [24, "中"], [60, "大"]]) sizeRow.append(btn(`b-chip${zoneSize === n ? " on" : ""}`, label, `${n}セル`, () => { zoneSize = n; renderOnce(); }));
    sec.append(sizeRow);

    const zones = (map.zones ?? []).map((z, index) => ({ z, index })).filter((x) => x.z && Array.isArray(x.z.cells));
    if (!zones.length) sec.append(el("p", "b-hint", "まだゾーンがありません。侵攻・反乱・疫病・災害などの範囲を記録できます。"));
    const cards = el("div", "b-cards");
    for (const { z, index } of zones.slice().reverse()) cards.append(zoneCard(map, z, index));
    sec.append(cards);
    return sec;
  }

  function startPaint(index, mode) {
    paintingZone = index;
    editMode.setZoneMode(mode);
    editMode.setTool("paint:zone");
    editMode.setTarget(index);
    window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:zone", target: index } }));
    setHighlight();
    renderOnce();
  }
  function endPaint() {
    if (paintingZone == null) return;
    paintingZone = null;
    editMode.setTool("select");
    window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "select" } }));
  }

  function zoneCard(map, z, index) {
    const open = selZone === index;
    const card = el("div", `b-card${open ? " active" : ""}`);
    const row = el("div", "b-row b-click");
    const main = el("div", "b-row-main");
    main.append(el("div", "b-row-name", z.name), el("div", "b-row-meta", `${zoneLabel(z)}・${z.cells.length}セル${z.hidden ? "・非表示" : ""}`));
    row.append(swatch(zoneColor(z)), main, el("span", "b-chev", open ? "▴" : "▾"));
    row.addEventListener("click", () => { if (open) endPaint(); selZone = open ? null : index; setHighlight(); renderOnce(); });
    card.append(row);
    if (open) {
      const d = el("div", "b-details");
      const nameF = el("label", "b-field");
      nameF.append(el("span", "b-mini", "名前"));
      const input = document.createElement("input");
      input.value = z.name;
      input.addEventListener("change", () => { if (input.value.trim()) editActions.editZone(index, { name: input.value }); });
      const nameRow = el("span", "name-row");
      nameRow.append(input, btn("suggest-mini", "🎲", "名前をランダムに決める（種類に合った名前になります）", (ev) => { ev.preventDefault(); const cell = z.cells?.[0]; editActions.editZone(index, { name: editActions.suggestLabel("zone", { type: z.type, cell }) }); }));
      nameF.append(nameRow);
      d.append(nameF);
      const tf = el("label", "b-field");
      tf.append(el("span", "b-mini", "種類"));
      const tsel = document.createElement("select");
      for (const t of ZONE_TYPES) tsel.append(new Option(t.label, t.id));
      if (!ZONE_TYPES.some((t) => t.id === z.type)) tsel.append(new Option(z.type, z.type));
      tsel.value = z.type;
      tsel.addEventListener("change", () => editActions.editZone(index, { type: tsel.value }));
      tf.append(tsel);
      d.append(tf);

      const ops = el("div", "b-how");
      const painting = paintingZone === index;
      ops.append(
        btn(`b-seg${painting ? " active" : ""}`, painting ? "✋ 塗っています（完了で終了）" : "✋ 塗り足す", "地図をなぞって範囲を広げる", () => (painting ? (endPaint(), renderOnce()) : startPaint(index, "add"))),
        btn("b-seg", "🧽 消す", "地図をなぞって範囲を減らす", () => startPaint(index, "erase")),
      );
      d.append(ops);
      const foot = el("div", "b-actions");
      foot.append(
        btn("", z.hidden ? "表示する" : "隠す", "地図に出すかどうか", () => editActions.editZone(index, { hidden: !z.hidden })),
        btn("", "削除", "このゾーンを消す（Undoで戻せます）", () => { endPaint(); selZone = null; editActions.removeZone(index); setHighlight(); }),
      );
      d.append(foot);
      card.append(d);
    }
    return card;
  }

  // ---------- 描画 ----------
  function render(container) {
    if (container) { render.container = container; renderOnce = () => render(); }
    const c = render.container;
    if (!c) return;
    c.replaceChildren();
    const map = getMap();
    if (!map) { c.append(el("p", "b-hint", "地図を開いてください。")); return; }
    c.append(el("p", "b-lead", "旅の道のりと、ゾーン（侵攻・疫病・災害など）を記録します。"));
    const tabs = el("div", "b-tabs");
    for (const [k, label] of [["journey", "旅"], ["zone", "ゾーン"]]) {
      tabs.append(btn(`b-tab${section === k ? " on" : ""}`, label, "", () => { if (section !== k) { endPaint(); section = k; renderOnce(); } }));
    }
    c.append(tabs);
    c.append(section === "journey" ? journeySection(map) : zoneSection(map));
  }

  return {
    render,
    leave() {
      editMode.cancelPick();
      picking = null;
      endPaint();
      selJourney = null; selZone = null;
      actions.setView({ journeySelected: null, zoneSelected: null });
    },
  };
}
