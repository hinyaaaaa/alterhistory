// v5.3 UI: 「設定」領域。画面の表示・通知の設定だけ。バランス調整UIは廃止（指示書 5.3）。数値の調整はコード・検証用ツールで行う。
import { h } from "../dom.js";

export function renderSettingsView({ ui }) {
  const s = ui.get().settings;
  const row = (key, label, hint) => {
    const id = `v53-set-${key}`, cb = h("input", { type: "checkbox", id, checked: !!s[key] });
    cb.addEventListener("change", () => ui.set({ settings: { ...ui.get().settings, [key]: cb.checked } }));
    return h("label", { class: "v53-setting", for: id }, cb, h("span", null, h("b", { text: label }), h("small", { text: hint })));
  };
  return h("div", { class: "v53-settings" }, h("section", { class: "v53-sec" }, h("h3", { text: "通知" }),
    row("showToasts", "通常通知を表示する", "重大イベントは、この設定に関わらず必ず表示され、確認するまで時間が止まります。"),
    row("reduceMotion", "動きを抑える", "新聞演出やパネルの動きを最小限にします。")));
}
