// 「新しい世界」ダイアログ。地図づくりは、国家・外交・戦争と同じ、このアプリの 1 つの機能（別の画面ではない）。
import { el, btn } from "./kit.js";
import { confirmDialog } from "./dialogs.js";
import { ISLAND_MODES, makeWorldSeed, DEFAULT_WORLD_SPEC } from "../core/world/spec.js";

const PRESETS = [[50000, "50,000（軽い）"], [100000, "100,000"], [250000, "250,000（標準）"], [500000, "500,000"], [1000000, "1,000,000（重い）"]];

/** 現在の地図に未保存の変更があれば、破棄してよいか確かめる */
export async function confirmDiscard(store) {
  const s = store.getState(); if (!s.map || !store.isDirty?.()) return true;
  return confirmDialog("保存していない変更があります。破棄して新しい世界を作りますか？", { okLabel: "破棄して続ける", danger: true });
}

export async function openNewWorldDialog({ actions, store }) {
  if (!(await confirmDiscard(store))) return;
  const dlg = document.createElement("dialog"); dlg.className = "confirm-dialog world-new"; dlg.append(el("h2", null, "新しい世界"));
  const form = el("div", "world-form"); dlg.append(form);
  const row = (label, ctl, hint) => { const r = el("label", "world-row"); r.append(el("span", "world-row-l", label), ctl); if (hint) r.append(el("span", "world-row-h", hint)); form.append(r); return ctl; };
  const seed = document.createElement("input"); seed.type = "text"; seed.value = makeWorldSeed(Date.now()); seed.setAttribute("aria-label", "シード");
  const seedBox = el("span", "world-seedbox"); seedBox.append(seed, btn("", "ランダム", "新しいシードにする", () => { seed.value = makeWorldSeed(Date.now()); }));
  row("シード", seedBox, "同じシードと設定なら、同じ地形になります");
  const preset = document.createElement("select"); for (const [v, t] of PRESETS) { const o = document.createElement("option"); o.value = String(v); o.textContent = t; if (v === DEFAULT_WORLD_SPEC.resolution.targetCells) o.selected = true; preset.append(o); }
  row("セル数", preset, "大きいほど細かい世界になります（端末により生成に数秒〜数十秒）");
  const land = document.createElement("input"); land.type = "range"; land.min = "20"; land.max = "80"; land.value = "50"; const landV = el("span", "world-row-v", "50%"); land.addEventListener("input", () => { landV.textContent = `${land.value}%`; });
  const landBox = el("span", "world-seedbox"); landBox.append(land, landV); row("陸地の割合", landBox);
  const cont = document.createElement("input"); cont.type = "number"; cont.min = "1"; cont.max = "12"; cont.value = "6"; row("大陸の数（目安）", cont);
  const isl = document.createElement("select"); for (const [k, t] of [["few", "少ない"], ["normal", "ふつう"], ["many", "多い"]]) { const o = document.createElement("option"); o.value = k; o.textContent = `${t}（約${ISLAND_MODES[k]}）`; if (k === "many") o.selected = true; isl.append(o); } row("島の多さ", isl);
  const groups = document.createElement("input"); groups.type = "number"; groups.min = "1"; groups.max = "64"; groups.value = "12"; row("初期集団の候補数", groups);
  dlg.append(el("p", "hint", "世界を作ったあと、歴史を始める初期集団を選びます。国家はそこから、時間とともに成立していきます。"));
  const acts = el("div", "confirm-dialog-actions"), cancel = btn("", "キャンセル", "", () => { dlg.close(); dlg.remove(); }), ok = btn("primary", "生成する", "", () => {
    const spec = { worldSeed: seed.value.trim(), resolution: { targetCells: Number(preset.value) }, landFraction: Number(land.value) / 100, continentCountTarget: Number(cont.value), islandMode: isl.value, initialGroups: Number(groups.value) };
    dlg.close(); dlg.remove(); actions.newWorld(spec);
  });
  acts.append(cancel, ok); dlg.append(acts); dlg.addEventListener("cancel", () => dlg.remove()); document.body.append(dlg); dlg.showModal(); seed.focus();
}
