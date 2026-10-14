import { APP_VERSION_LABEL } from "../version.js";
import { byId } from "./dom.js";
import { initWindows } from "./windows.js";
import { UNIT_TYPES, forcePower, forceHeadcount } from "../core/sim/units.js";
import { regimentsOf } from "../core/sim/military.js";
import { FILL_KEY } from "../app/layers.js";
import { BALANCE, BALANCE_META, BALANCE_DEFAULTS } from "../core/sim/balance.js";
import { planSetBalance } from "../core/edit/balance-setting.js";
import { el } from "./kit.js";
import { initDiplomacyWindow } from "./diplomacy-window.js";
import { createCivilSection } from "./civil-section.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
export function initSettingsWindows({ store, panels, editorPanel, editActions, actions, warOutcome }) {
  const wins = initWindows();
  const noMap = () => el("p", "muted", "地図を開いてください");
  // 戦争: 準備→開始→経過→講和。「作戦」欄に核作戦を置く（核の保有・技術は軍事の窓で持つ）。経過は年表へのリンクを主にする
  const warBody = el("div", "war-win-body");
  const warOps = el("section", "war-ops"); warOps.append(el("h4", "", "作戦"));
  warOps.append(el("p", "hint", "核を保有する国だけが実行できます。戦争の士気・民意・戦況に影響します。保有数は、国家タブの「軍事」で設定します。"));
  const nb = el("button", "", "@nuclear 核作戦を立案・実行する"); nb.type = "button"; nb.addEventListener("click", () => wins.open("nuclear"));
  const tb = el("button", "", "@timeline 戦争の経過を年表で見る"); tb.type = "button"; tb.addEventListener("click", () => { wins.open("timeline"); window.dispatchEvent(new CustomEvent("timeline-filter", { detail: { kind: "war" } })); });
  const opsRow = el("div", "diplomacy-row"); opsRow.append(nb, tb); warOps.append(opsRow);
  const civil = createCivilSection({ store, simActions: panels.simActions });
  warBody.append(byId("tab-wars"), warOps, civil.box);
  wins.register("war", { title: "戦争", width: 820, body: warBody, onOpen: () => { panels.wars.render(); civil.render(); } });
  // 外交: 同盟・不可侵・協力・従属・講和は、すべて「条約」。条約の窓は ui/diplomacy-window.js
  const dip = initDiplomacyWindow({ store, wins, simActions: panels.simActions, getWarsPanel: () => panels.wars });
  wins.register("diplomacy", { title: "外交", width: 980, body: dip.body, onOpen: () => dip.render() });
  const milBody = el("div", "mil-body");
  const overview = el("div", "mil-overview");
  milBody.append(overview, byId("tab-regiments"));
  function renderMil() {
    overview.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      overview.append(noMap());
      return;
    }
    const states = map.pack.states.filter(isLive);
    const t = el("table", "win-table");
    const head = el("tr");
    head.append(el("th", "", "国家"), el("th", "", "部隊"));
    for (const u of UNIT_TYPES) head.append(el("th", "", `${u.icon} ${u.label}`));
    head.append(el("th", "", "総兵員"), el("th", "", "総戦力"));
    t.append(head);
    for (const s of states) {
      const regs = regimentsOf(s), doc = editActions.getDoctrine(s.i);
      const tr = el("tr", `clickable${panels.military.selectedState === s.i ? " active" : ""}`);
      tr.title = "押すと、この国の部隊を下で編成できます";
      tr.append(el("td", "", s.fullName ?? s.name), el("td", "", String(regs.length)));
      let head2 = 0, power = 0;
      for (const u of UNIT_TYPES) tr.append(el("td", "", regs.reduce((n, r) => n + (r.u?.[u.key] ?? 0), 0).toLocaleString()));
      for (const r of regs) {
        head2 += forceHeadcount(r.u);
        power += forcePower(r.u, doc);
      }
      tr.append(el("td", "", Math.round(head2).toLocaleString()), el("td", "", Math.round(power).toLocaleString()));
      tr.addEventListener("click", () => {
        panels.military.selectState(s.i);
        renderMil();
      });
      t.append(tr);
    }
    overview.append(t);
  }
  // 軍事の窓は廃止（v2.4.0）。軍の編成は国家タブの「軍事」に、表示のみで載る。
  // ⚖ バランス調整: 経済・戦争の数値をコードを直さずに変える。値は「この地図」に保存される（地図ファイルに入る）ので、
  // どの端末で開いても同じ歴史になる。アプリの既定値と違う項目だけが地図に記録される。
  const balBody = el("div", "balance-body");
  function renderBalance() {
    const map = store.getState().map;
    if (!map) { balBody.replaceChildren(noMap()); return; }
    const overrides = map.ext?.data?.balance ?? {};
    balBody.replaceChildren(el("p", "hint", "経済・戦争の数値を調整します。変えるとすぐ反映され、この地図に保存されます（地図ファイルに入るので、別の端末で開いても同じ結果になります）。"));
    const t = el("table", "win-table");
    for (const m of BALANCE_META) {
      const tr = el("tr");
      const th = el("th", "", m.label);
      th.title = m.desc;
      const input = document.createElement("input");
      input.type = "number"; input.min = m.min; input.max = m.max; input.step = m.step; input.value = BALANCE[m.key];
      input.addEventListener("change", () => {
        const cmd = planSetBalance(store.getState().map, { [m.key]: input.value });
        if (cmd) store.commit(cmd);
        input.value = BALANCE[m.key];
        renderBalance();
      });
      const td = el("td"); td.append(input);
      tr.append(th, td, el("td", "muted", m.key in overrides ? `既定 ${BALANCE_DEFAULTS[m.key]}（この地図で変更）` : `既定 ${BALANCE_DEFAULTS[m.key]}`), el("td", "hint", m.desc));
      t.append(tr);
    }
    const reset = el("button", "", "すべて既定値に戻す");
    reset.type = "button";
    reset.addEventListener("click", () => { const cmd = planSetBalance(store.getState().map, null); if (cmd) store.commit(cmd); renderBalance(); });
    balBody.append(t, reset);
  }
  wins.register("balance", { title: "バランス調整", width: 860, body: balBody, onOpen: renderBalance });
  if (warOutcome) wins.register("treaty", { title: "講和条約", width: 920, body: warOutcome.treatyBody, onOpen: () => warOutcome.renderTreaty(), onClose: () => warOutcome.clearHighlight() });
  store.subscribe((_s, change) => {
    if (!["replace", "commit", "undo", "redo"].includes(change.type)) return;
  });
  // 詳細設定: バランス調整・時間と時代区分・このアプリについて（横タブは使わず、縦に並べた節）
  const setBody = el("div", "settings-body");
  const sect = (title, hint, buttonLabel, onClick) => {
    const box = el("section", "settings-sec");
    box.append(el("h4", "", title), el("p", "hint", hint));
    const b = el("button", "", buttonLabel); b.type = "button"; b.addEventListener("click", onClick); box.append(b);
    return box;
  };
  setBody.append(
    sect("バランス調整", "経済・戦争の数値を、コードを直さずに変えます。値は「この地図」に保存されます。", "バランス調整を開く", () => wins.open("balance")),
    sect("時間・時代区分", "いまの年月を指定し、時代の名前と区切りを設定します。", "年月と時代を設定する", () => byId("world-date").click()),
  );
  const about = el("section", "settings-sec");
  about.append(el("h4", "", "このアプリについて"), el("p", "about-version", APP_VERSION_LABEL), el("p", "hint", "ALTERHISTORY — 日本語で使える架空世界地図ジェネレーター"));
  setBody.append(about);
  wins.register("settings", { title: "詳細設定", width: 520, body: setBody });
  return wins;
}
