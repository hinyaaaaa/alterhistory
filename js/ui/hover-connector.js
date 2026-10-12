// ホバー連動型コネクターライン。地図上の都市・国家にカーソルを合わせると（タッチは長押し）、
// 対象に小さな輪を付け、細い折れ線で概要カードにつなぐ。
//   ・カードは、対象を隠さない位置に自動で置く（画面端や、ニュース・戦争状況・時計・ハブ・窓との重なりを避ける）
//   ・中身は対象で変える。都市: 名前・所属・人口・文化・宗教・状態 / 国家: 首都・人口・戦争中か・主な条約・特色
//   ・地図の操作は妨げない（pointer-events: none）。クリックの挙動（詳細を開く）は、従来のまま
import { cellIndexOf } from "../core/spatial.js";
import { activeWars, warsOf } from "../core/edit/wars.js";
import { activeTreaties, partyIds, TREATY_BY_KEY } from "../core/edit/treaties.js";
import { statePopulation } from "../core/query.js";
import { byId } from "./dom.js";
import { tagLabels, burgKindLabel, resourceLabels, provinceTitleLabel } from "../core/edit/world-info.js";

const SVGNS = "http://www.w3.org/2000/svg";
const CARD_W = 224, GAP = 56;
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const nm = (e) => e?.fullName ?? e?.name ?? "—";
const fmtPop = (k) => `${Math.round((k ?? 0) * 1000).toLocaleString("ja-JP")}`;

/** 対象（都市・国家）の概要。表示は rows: [ラベル, 値, 数字か] */
export function describeTarget(map, cell, { shift = false } = {}) {
  const c = map.pack.cells;
  if (!map.geometry || cell < 0 || cell >= c.biome.length || c.biome[cell] === 0) return null;
  const sid = c.state[cell]; const st = isLive(map.pack.states[sid]) ? map.pack.states[sid] : null;
  const burg = c.burg[cell] ? map.pack.burgs[c.burg[cell]] : null;
  const pos = (b) => [b.x, b.y];
  const wars = st ? warsOf(map, st.i).filter((w) => !w.endedAt) : [];
  const culture = (id) => nm(map.pack.cultures[id]), religion = (id) => nm(map.pack.religions[id]);
  if (burg && !burg.removed && burg.i > 0) {
    const state = isLive(map.pack.states[burg.state]) ? map.pack.states[burg.state] : null;
    const atWar = state ? warsOf(map, state.i).some((w) => !w.endedAt) : false;
    return { kind: "burg", kick: burg.capital ? "都市・首都" : "都市", name: burg.name, at: pos(burg), rows: [
      ["所属", state ? nm(state) : "無所属"], ["人口", fmtPop(burg.population), true], ["文化", culture(burg.culture ?? c.culture[cell])], ["宗教", religion(c.religion[cell])], ["状態", atWar ? "戦争中" : "平時"],
      ...(burgKindLabel(burg) ? [["種類", burgKindLabel(burg)]] : []), ...(resourceLabels(burg).length ? [["特産", resourceLabels(burg).join("・")]] : []),
    ] };
  }
  if (shift && c.province[cell] > 0 && map.pack.provinces[c.province[cell]] && !map.pack.provinces[c.province[cell]].removed) {
    const p = map.pack.provinces[c.province[cell]];
    const n = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === p.i) n.push(i);
    return { kind: "province", kick: "属州", name: nm(p), at: map.geometry.pack.p[cell], rows: [["所属", st ? nm(st) : "無所属"], ["セル数", String(n.length), true], ...(provinceTitleLabel(p) ? [["称号", provinceTitleLabel(p)]] : []), ...(resourceLabels(p).length ? [["特産", resourceLabels(p).join("・")]] : [])] };
  }
  if (!st) return null;
  const cap = st.capital ? map.pack.burgs[st.capital] : null;
  const treaties = activeTreaties(map, map.worldTime).filter((t) => partyIds(t).includes(st.i) && t.kind !== "peace" && t.kind !== "declaration");
  const rows = [["首都", cap ? cap.name : "—"], ["人口", fmtPop(statePopulation(st)), true], ["戦争", wars.length ? `${wars.length}件 進行中` : "なし"]];
  if (treaties.length) rows.push(["条約", treaties.slice(0, 2).map((t) => TREATY_BY_KEY[t.kind].short).join("・") + (treaties.length > 2 ? ` ほか${treaties.length - 2}` : "")]);
  if (tagLabels(st).length) rows.push(["特色", tagLabels(st).join("・")]);
  return { kind: "state", kick: "国家", name: nm(st), at: cap ? pos(cap) : map.geometry.pack.p[cell], rows };
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function initHoverConnector({ store, viewport }) {
  const app = byId("app") ?? document.body;
  const canvas = byId("map-canvas");
  const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "conn"); svg.hidden = true;
  const path = document.createElementNS(SVGNS, "path"), ring = document.createElementNS(SVGNS, "circle"), core = document.createElementNS(SVGNS, "circle");
  ring.setAttribute("class", "dot"); ring.setAttribute("r", "9"); core.setAttribute("class", "core"); core.setAttribute("r", "2.4");
  svg.append(path, ring, core);
  const card = document.createElement("div"); card.className = "conn-card"; card.hidden = true;
  app.append(svg, card);

  let timer = 0, key = "", press = null;
  const hide = () => { clearTimeout(timer); timer = 0; key = ""; svg.hidden = true; card.hidden = true; };

  // 避ける領域: ハブ・時計・ニュース・戦争状況・開いている窓
  const obstacles = () => [...document.querySelectorAll("#hub, #clock, #news, #war-status:not([hidden]), .float-win:not([hidden]), #sidebar:not([hidden])")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);

  function place(sx, sy, h) {
    const vw = window.innerWidth, vh = window.innerHeight, ch = card.offsetHeight || 140;
    const obs = obstacles();
    const cands = [
      [sx + GAP, sy - ch - 10], [sx + GAP, sy + 10], [sx - GAP - CARD_W, sy - ch - 10], [sx - GAP - CARD_W, sy + 10],
      [sx - CARD_W / 2, sy - ch - GAP], [sx - CARD_W / 2, sy + GAP],
    ];
    const fits = ([x, y]) => x >= 8 && y >= 8 && x + CARD_W <= vw - 8 && y + ch <= vh - 8;
    const rect = ([x, y]) => ({ left: x, top: y, right: x + CARD_W, bottom: y + ch });
    const pick = cands.find((c) => fits(c) && !obs.some((o) => overlaps(rect(c), o))) ?? cands.find(fits) ?? cands[0];
    card.style.left = `${Math.round(pick[0])}px`; card.style.top = `${Math.round(pick[1])}px`;
    // 水平から斜めへ折れる線: カードの横辺の中ほどから、対象へ
    const right = pick[0] + CARD_W / 2 < sx; // カードが対象の左側にあるか
    const ax = right ? pick[0] + CARD_W : pick[0], ay = pick[1] + Math.min(ch, 40);
    const mx = ax + (right ? 28 : -28);
    path.setAttribute("d", `M${ax},${ay} H${mx} L${sx},${sy}`);
    ring.setAttribute("cx", sx); ring.setAttribute("cy", sy); core.setAttribute("cx", sx); core.setAttribute("cy", sy);
  }

  function show(e, shift) {
    const map = store.getState().map; if (!map || !canvas) return hide();
    const r = canvas.getBoundingClientRect();
    const sx0 = e.clientX - r.left, sy0 = e.clientY - r.top;
    const [wx, wy] = viewport.toWorld(sx0, sy0);
    if (wx < 0 || wy < 0 || wx > viewport.mapWidth || wy > viewport.mapHeight) return hide();
    const cell = cellIndexOf(map).find(wx, wy);
    const t = describeTarget(map, cell, { shift });
    if (!t) return hide();
    const k = `${t.kind}:${t.name}:${map.rev?.politics ?? 0}`;
    const [tx, ty] = viewport.toScreen(t.at[0], t.at[1]);
    const sx = r.left + tx, sy = r.top + ty;
    if (k !== key) {
      key = k;
      const dl = t.rows.map(([a, b, n]) => `<dt></dt><dd${n ? ' class="n"' : ""}></dd>`).join("");
      card.innerHTML = `<div class="kick"></div><h5></h5><dl>${dl}</dl>`;
      card.querySelector(".kick").textContent = t.kick; card.querySelector("h5").textContent = t.name;
      const dts = card.querySelectorAll("dt"), dds = card.querySelectorAll("dd");
      t.rows.forEach(([a, b], i) => { dts[i].textContent = a; dds[i].textContent = b; });
    }
    card.hidden = false; svg.hidden = false; place(sx, sy, t);
  }

  // マウス: 少し止まったら出す（ちらつかせない）。ドラッグ中・ボタンを押している間は出さない
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    if (e.buttons) return hide();
    clearTimeout(timer);
    const shift = e.shiftKey, ev = { clientX: e.clientX, clientY: e.clientY };
    timer = setTimeout(() => show(ev, shift), 140);
  });
  canvas.addEventListener("pointerleave", hide);
  canvas.addEventListener("wheel", hide, { passive: true });
  // タッチ: 長押しで出す（動かしたら取り消し）
  canvas.addEventListener("pointerdown", (e) => {
    hide();
    if (e.pointerType !== "touch") return;
    press = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { if (press) show({ clientX: press.x, clientY: press.y }, false); }, 480);
  });
  const endPress = () => { press = null; clearTimeout(timer); };
  canvas.addEventListener("pointermove", (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) endPress(); });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") { endPress(); setTimeout(hide, 2200); } });
  canvas.addEventListener("pointercancel", endPress);
  store.subscribe((s, ch) => { if (!s.map || ch.type === "replace") hide(); });
  return { hide, show };
}
