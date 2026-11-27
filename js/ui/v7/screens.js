// v7 全面画面: 集中して作る作業（国の詳細・技術ツリー・軍事ドクトリン・国の情報の編集）。後ろに地図を透かす。
//   開いている画面は S.screen = { key, id } に持つ。左パネルを描き直すたびに、main.js が screenSpec() から S.full を作り直す
//   （戦争・講和・軍団の編成・反乱は、既存の部品が S.full を直接作る。どちらも同じ入れ物 #fs に出る）。docs/UI_RULES.md §4。
import { h } from "../v6/common.js";
import { S, controlled } from "../v6/store.js";
import { stateDetail, tDoctrine } from "../v6/views-a.js";
import { techScreen } from "./tech-view.js";
import { tInfoV } from "../v6/nation.js";
import { civ, legacy } from "./panels-common.js";
import { declareSpec, peaceSpec, mobilizeSpec } from "./war-screens.js";
import { pSettings } from "../v6/views-b.js";
import { Btn, H3, Row, Mut } from "./ui.js";
import { APP_VERSION_LABEL } from "../../version.js";

const stateOf = (id) => civ().states[id];
const close = () => { S.screen = null; };
/** 開いている全面画面の定義。なければ null */
export function screenSpec(sc = S.screen) {
  if (sc?.key === "declare") return declareSpec(sc);
  if (sc?.key === "peace") return peaceSpec(sc);
  if (sc?.key === "mobilize") return mobilizeSpec(sc);
  if (sc && ["settings", "shortcut", "about"].includes(sc.key)) return specOf(sc, null);
  const st = sc && stateOf(sc.id);
  if (!st) return null;
  return specOf(sc, st);
}
function specOf(sc, st) {
  const mine = st && controlled() === st.id;
  switch (sc.key) {
    case "settings": return { key: "settings", title: "世界の設定・保存", build: () => legacy(h("div", {}, pSettings())), onClose: close };
    case "shortcut": return { key: "shortcut", title: "ショートカット", build: () => shortcuts(), onClose: close };
    case "about": return { key: "about", title: "版の情報", build: () => h("div", {}, H3("AlterHistory"), Mut(APP_VERSION_LABEL)), onClose: close };
    case "nation": return { key: "nation", title: st.name, build: () => legacy(h("div", { class: "v-nation" }, stateDetail(stateOf(sc.id)))), onClose: () => { close(); S.detail = false; } };
    case "info": return { key: "info", title: `${st.name} の情報`, build: () => legacy(h("div", {}, tInfoV(stateOf(sc.id), mine))), onClose: close };
    case "tech": return { key: "tech", title: "技術", build: () => techScreen(stateOf(sc.id), mine, () => S.hooks.panel()), onClose: close };
    case "doctrine": return { key: "doctrine", title: "軍事ドクトリン", build: () => legacy(h("div", {}, tDoctrine(stateOf(sc.id), mine))), onClose: close };
  }
  return null;
}
const open = (key) => (id) => {
  if (!stateOf(id)) return;
  S.sel = id;
  S.screen = { key, id };
  if (key === "nation") S.detail = true;
  S.hooks.panel();
};
export const openNationFull = open("nation"), openInfoEdit = open("info"), openTech = open("tech"), openDoctrine = open("doctrine");

export const openGear = (k) => {
  S.screen = { key: k === "save" ? "settings" : k };
  S.hooks.panel();
};
const KEYS = [["Space", "一時停止／再開"], ["1〜4", "速さを変える（月・3月・年・5年）"], ["Esc", "全面画面・確認を閉じる／カードを閉じる"], ["Ctrl+K", "検索を開く"], ["[ ]", "左パネルを畳む／開く"]];
function shortcuts() {
  return h("div", { class: "v-shortcuts" }, ...KEYS.map(([k, d]) => Row({ title: d, small: k })));
}
