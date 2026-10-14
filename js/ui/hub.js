// 左ハブ（収縮式の縦レール）。ファイル・地図・各ウィンドウへの入口を、すべてここに集める。
//   ・収縮時は幅56pxのアイコンレール、展開時は約232pxでラベルと区分見出しが出る
//   ・窓を開いたら自動で収縮し、開いている窓に対応する項目を点灯させる
//   ・同じ操作の入口は、ここだけ（上部バーは廃止）
import { icon } from "./icons.js";
import { activeWars } from "../core/edit/wars.js";

// kind: win=ウィンドウを開く / el=既存の部品に配線済みのボタン（id を保つ）/ layers=レイヤー欄の開閉
export const HUB_SECTIONS = [
  { title: "ファイル", items: [
    { id: "btn-open", icon: "open", label: "開く", kind: "el", tip: "地図ファイルを開く (O)" },
    { id: "btn-save", icon: "save", label: "保存", kind: "el", tip: "ALTERHISTORY 形式（.ahmap）で保存 (Ctrl+S)" },
    { win: "export", icon: "export", label: "書き出し", tip: "画像・年表などに書き出す" },
  ] },
  { title: "地図", items: [
    { id: "btn-edit-mode", icon: "edit", label: "地図編集", kind: "el", tip: "地図編集 — 塗る・都市・目印" },
    { id: "hub-layers", icon: "layers", label: "レイヤー", kind: "layers", tip: "地図に何を重ねるか" },
    { id: "btn-fit", icon: "fit", label: "全体表示", kind: "el", tip: "地図全体を表示 (F)" },
  ] },
  { title: "国家と社会", items: [
    { win: "nation", icon: "state", label: "国家" },
    { win: "list-culture", icon: "culture", label: "文化" },
    { win: "list-religion", icon: "religion", label: "宗教" },
    { win: "economy", icon: "economy", label: "経済・交易", tip: "世界全体の交易（各国の税・財政は、国家タブの「内政・税」）" },
  ] },
  { title: "外交と戦争", items: [
    { win: "diplomacy", icon: "diplomacy", label: "外交" },
    { win: "war", icon: "war", label: "戦争", badge: "wars" },
  ] },
  { title: "記録と設定", items: [
    { win: "timeline", icon: "timeline", label: "年表" },
    { win: "settings", icon: "settings", label: "詳細設定" },
  ] },
];

export function initHub({ store, wins }) {
  const hub = document.getElementById("hub");
  if (!hub) throw new Error("#hub が見つかりません（index.html を確認してください）");
  const head = document.createElement("div"); head.className = "hub-head";
  head.innerHTML = '<span class="hub-mark">ALTER<i>HISTORY</i></span>';
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "hub-toggle"; toggle.id = "hub-toggle";
  toggle.title = "メニューの開閉"; toggle.setAttribute("aria-label", "メニューの開閉"); toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = icon("chevron", 22);
  head.append(toggle);
  const scroll = document.createElement("div"); scroll.className = "hub-scroll";
  hub.append(head, scroll);

  const winButtons = new Map(); // win id -> button
  let badgeEl = null;
  for (const sec of HUB_SECTIONS) {
    const box = document.createElement("div"); box.className = "hub-sec";
    const t = document.createElement("div"); t.className = "hub-sec-title"; t.textContent = sec.title;
    box.append(t);
    for (const it of sec.items) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "hub-item"; b.title = it.tip ?? it.label;
      if (it.id) b.id = it.id;
      if (it.win) { b.dataset.openWin = it.win; winButtons.set(it.win, b); }
      b.innerHTML = `${icon(it.icon, 22)}<span>${it.label}</span>`;
      if (it.badge) { badgeEl = document.createElement("em"); badgeEl.className = "badge"; badgeEl.hidden = true; b.append(badgeEl); }
      box.append(b);
      if (it.kind === "layers") {
        b.setAttribute("aria-expanded", "false");
        b.addEventListener("click", () => { setOpen(true); hub.classList.toggle("layers-open"); b.setAttribute("aria-expanded", String(hub.classList.contains("layers-open"))); b.classList.toggle("on", hub.classList.contains("layers-open")); });
        const pane = document.createElement("div"); pane.className = "hub-layers";
        pane.innerHTML = `<div id="layer-toggles" class="lp-toggles"></div>`;
        box.append(pane);
      }
    }
    scroll.append(box);
  }
  // 地図編集ツールの「塗る」ボタンなどが差し込む絵文字なしアイコン
  for (const e of document.querySelectorAll("[data-ico]")) e.innerHTML = icon(e.dataset.ico, 17);

  function setOpen(open) { hub.classList.toggle("open", open); toggle.setAttribute("aria-expanded", String(open)); if (!open) hub.classList.remove("layers-open"); }
  toggle.addEventListener("click", () => setOpen(!hub.classList.contains("open")));
  // 展開したまま地図を触ったら畳む（ハブは地図の上に重なるため）
  document.getElementById("stage")?.addEventListener("pointerdown", () => { if (hub.classList.contains("open")) setOpen(false); });
  hub.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("[data-open-win]") : null;
    if (!b) return;
    wins.open(b.dataset.openWin);
    setOpen(false); // 窓を開いたらハブは自動で収縮する
  });
  const syncOn = () => { const open = new Set(wins.openIds()); for (const [id, b] of winButtons) b.classList.toggle("on", open.has(id)); };
  wins.subscribe(syncOn); syncOn();

  // 戦争の件数バッジ
  const syncBadge = (state) => {
    if (!badgeEl) return;
    const n = state.map ? activeWars(state.map).length : 0;
    badgeEl.hidden = n === 0; badgeEl.textContent = String(n);
  };
  store.subscribe(syncBadge); syncBadge(store.getState());
  return { setOpen };
}
