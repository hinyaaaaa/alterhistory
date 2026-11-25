// v7 外枠: 上部バー・レール・左パネル・地図の道具・国のカード・通知・全面画面・ダイアログ・歯車メニューの DOM と開閉。
//   中身（パネルの内容・全面画面の内容）は panels.js / screens.js が作る。ここは入れ物だけを持つ（docs/UI_RULES.md §2）。
import { h } from "../v6/common.js";
import { iconSvg, logoSvg } from "./icons.js";
const $ = (s) => document.querySelector(s);

/** 外枠を作る。canvas は地図（MapView が使う）。戻り値は主要な要素 */
export function buildFrame(root, cv) {
  document.body.classList.add("v7b");
  const el = h(
    "div",
    { id: "v7", class: "v7" },
    h("header", { id: "top" }),
    h("nav", { id: "rail", "aria-label": "入口" }),
    h("aside", { id: "lp", class: "v-scroll" }, h("button", { class: "v-btn g s v-stale", id: "prefresh", title: "世界が進んだので、このページの内容は古くなっています" }, "↻ 最新の状態に更新"), h("div", { id: "lpin" })),
    h("button", { id: "ph", title: "パネルを畳む／開く", "aria-label": "パネルを畳む／開く" }, chevron()),
    h("main", { id: "stage" }, cv, h("div", { id: "callout" }), h("div", { id: "newscall" })),
    h("div", { class: "v-fl", id: "tools" }, h("button", { class: "v-btn g s", id: "bl" }, "表示"), h("button", { class: "v-btn g s", id: "bs" }, "検索")),
    h("div", { class: "v-fl", id: "lay" }),
    h("div", { class: "v-fl", id: "srch" }),
    h("div", { class: "v-fl", id: "cc" }),
    h("div", { id: "gearmenu" }),
    h("div", { id: "toasts" }),
    h("section", { id: "fs" }, h("header", {}, h("h2", { id: "ft" }), h("button", { class: "v-btn g s", id: "full-close" }, "閉じる")), h("div", { id: "fb" }), h("footer", { id: "ff" })),
    h("div", { id: "dg" }, h("div", { class: "v-dc" }, h("div", { class: "v-dh" }, h("h2", { id: "dgt" }), h("button", { class: "v-btn g s", id: "dg-close" }, "×")), h("div", { class: "v-db v-scroll", id: "dgb" }), h("div", { class: "v-df", id: "dgf" }))),
    h("div", { id: "newsmodal", hidden: true }),
    h("div", { id: "decmodal", hidden: true }),
  );
  root.replaceChildren(el);
  return el;
}
function chevron() {
  const s = iconSvg("chev", 12);
  s.setAttribute("viewBox", "0 0 12 20");
  return s;
}
export { logoSvg };

/* ---------- 全面画面 ---------- */
let curKey = null;
/** 全面画面を開く（または同じ key なら中身だけ作り直す。スクロール位置は保つ）。side=true は左側だけを覆う（地図を見て選ぶ作業）。bare=true は余白なし（ツリーなど） */
export function openFull({ key = null, title, build, side = false, bare = false, footer = [] }) {
  const fs = $("#fs"), fb = $("#fb"), keep = key && key === curKey && fs.classList.contains("on") ? fb.scrollTop : 0;
  curKey = key;
  $("#ft").textContent = title;
  fs.classList.toggle("side", side);
  fb.classList.toggle("full", bare);
  fb.replaceChildren(build());
  fb.scrollTop = keep;
  $("#ff").replaceChildren(...footer);
  fs.classList.add("on");
  document.body.classList.toggle("fso", footer.length > 0);
}
export function closeFull() {
  const fs = $("#fs");
  curKey = null;
  if (!fs?.classList.contains("on")) return;
  fs.classList.remove("on", "side");
  $("#fb").replaceChildren();
  $("#ff").replaceChildren();
  document.body.classList.remove("fso");
}
export const fullOpen = () => !!$("#fs")?.classList.contains("on");

/* ---------- ダイアログ（1 回の決定の確認カード） ---------- */
export function openDialog({ title, build, footer = [], wide = false }) {
  $("#dgt").textContent = title;
  $("#dg").classList.toggle("wide", wide);
  $("#dgb").replaceChildren(build());
  $("#dgf").replaceChildren(...footer);
  $("#dg").classList.add("on");
}
export const closeDialog = () => $("#dg")?.classList.remove("on");
export const dialogOpen = () => !!$("#dg")?.classList.contains("on");

/* ---------- 通知（下端の右に最大 3 枚）。sev: "k" 重大（縁が赤く光り、確認するまで残る）／"n" 通常／"ok" お知らせ ---------- */
const MAX_TOASTS = 3;
export function toast({ sev = "n", head = "通知", title, body = "", ms = 6000, onConfirm = null, confirm = "確認" }) {
  const box = $("#toasts");
  if (!box) return null;
  const t = h("div", { class: "v-ts " + (sev === "k" ? "k" : sev === "ok" ? "ok" : ""), role: sev === "k" ? "alert" : "status" }, h("div", {}, h("small", {}, head), h("b", {}, title), body ? h("p", {}, body) : null), h("button", { class: "v-btn g s", onclick: () => off() }, confirm));
  const off = () => {
    clearTimeout(t.__t);
    t.remove();
    onConfirm?.();
  };
  box.append(t);
  while (box.children.length > MAX_TOASTS) box.firstElementChild.remove();
  if (sev !== "k" && ms) t.__t = setTimeout(() => t.remove(), ms);
  return t;
}
