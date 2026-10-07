import { formatWorldTime } from "../../core/sim/time.js";
import { forcePower } from "../../core/sim/units.js";
import { BALANCE } from "../../core/sim/balance.js";
import { WAR_TYPES } from "../../core/sim/war-engine.js";
import { guardRender, keepScroll } from "../safe-render.js";
import { byId } from "../dom.js";
import { alertDialog, confirmDialog } from "../dialogs.js";

const el = (tag, cls, text2) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text2 != null) e.textContent = text2;
  return e;
};
const fmt4 = (n) => Math.round(n).toLocaleString("ja-JP");
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
export function initWarsPanel({ store, simActions, getOutcome = () => null, getWins = () => null }) {
  const root = byId("tab-wars");
  let selected = null;
  let creating = false;
  let wTab = "ov"; // 戦争ウィンドウで開いているタブ（概要・部隊・経過・講和）
  let draft = { name: "", attackers: /* @__PURE__ */ new Set(), defenders: /* @__PURE__ */ new Set(), muster: {}, type: "conventional" };
  const stateName = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
  const monthIdx = (d) => d.year * 12 + d.month;
  const fmtDate3 = (d) => d ? `${d.year}年${d.month}月` : "";
  function render() { keepScroll(root, renderBody); } // 月が進んでも、クリックで描き直しても、スクロール位置（経過の記録など）は先頭に戻さない
  function renderBody() {
    root.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      root.append(el("p", "muted", "地図を開いてください"));
      return;
    }
    const states = map.pack.states.filter(isLive);
    const wars = simActions.listWars().slice().reverse();
    if (selected != null && !wars.some((w) => w.id === selected)) selected = null;
    if (!creating && selected == null && wars.length) selected = (wars.find((w) => !w.endedAt) ?? wars[0]).id;
    const band = el("div", "war-band");
    const add2 = el("button", creating ? "primary" : "", "＋ 新しい戦争");
    add2.type = "button";
    add2.addEventListener("click", () => {
      creating = true;
      selected = null;
      render();
    });
    band.append(add2);
    for (const w of wars) {
      const b = el("button", `${w.id === selected && !creating ? "active" : ""}${w.endedAt ? " ended" : ""}`, `${w.endedAt ? "🕊 " : "⚔ "}${w.name}`);
      b.type = "button";
      b.addEventListener("click", () => {
        selected = w.id;
        creating = false;
        render();
      });
      band.append(b);
    }
    root.append(band);
    if (creating || !wars.length) root.append(declareForm(map, states));
    else root.append(warDetail(map, states, wars.find((w) => w.id === selected)));
  }
  function declareForm(map, states) {
    const grid = el("div", "war-prep");
    const left = el("div", "war-prep-left"), right = el("div", "war-prep-right");
    const go = el("button", "danger war-go", "⚔ 戦争開始");
    go.type = "button";
    const typeSel = document.createElement("select");
    for (const T of Object.values(WAR_TYPES)) {
      const o = document.createElement("option");
      o.value = T.key;
      o.textContent = T.label;
      o.selected = draft.type === T.key;
      typeSel.append(o);
    }
    typeSel.addEventListener("change", () => {
      draft.type = typeSel.value;
      render();
    });
    left.append(el("h4", "", "① 戦争の形態"), typeSel, el("p", "hint", WAR_TYPES[draft.type].desc));
    const sideBox = (label, key, other) => {
      const box = el("div", "war-side");
      box.append(el("strong", "", label));
      const chips = el("div", "war-chips");
      for (const s of states) {
        const l = el("label", `war-chip${draft[key].has(s.i) ? " on" : ""}${draft[other].has(s.i) ? " off" : ""}`);
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = draft[key].has(s.i);
        cb.disabled = draft[other].has(s.i);
        cb.addEventListener("change", () => {
          if (cb.checked) draft[key].add(s.i);
          else draft[key].delete(s.i);
          draft.muster = {};
          render();
        });
        l.append(cb, document.createTextNode(s.fullName ?? s.name));
        chips.append(l);
      }
      box.append(chips);
      return box;
    };
    left.append(el("h4", "", "② 陣営"), sideBox("攻撃側", "attackers", "defenders"), sideBox("防御側", "defenders", "attackers"));
    const ids2 = [...draft.attackers, ...draft.defenders];
    if (ids2.length) {
      left.append(el("h4", "", "③ 招集する部隊"));
      if (draft.type === "total") left.append(el("p", "hint", "総力戦では、参戦する国のすべての部隊が戦います。"));
      else for (const id of ids2) {
        const st = map.pack.states[id];
        const regs = Array.isArray(st.military) ? st.military : [];
        if (!draft.muster[id]) draft.muster[id] = regs.map((r) => r.i);
        const row = el("div", "muster-state");
        row.append(el("strong", "", `${st.fullName ?? st.name}（${draft.attackers.has(id) ? "攻撃側" : "防御側"}）`));
        if (!regs.length) row.append(el("span", "muted", "　部隊がありません（戦力0）"));
        for (const r of regs) {
          const l = el("label", "muster-reg");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = draft.muster[id].includes(r.i);
          cb.addEventListener("change", () => {
            const set = new Set(draft.muster[id]);
            if (cb.checked) set.add(r.i);
            else set.delete(r.i);
            draft.muster[id] = [...set];
            render();
          });
          const men = Object.entries(r.u ?? {}).filter(([k]) => k !== "nuclear").reduce((n, [, v]) => n + (Number(v) || 0), 0);
          l.append(cb, document.createTextNode(` ${r.name}（${fmt4(men)}）`));
          row.append(l);
        }
        left.append(row);
      }
    }
    right.append(el("h4", "", "戦力の比較"));
    const preview = draft.attackers.size && draft.defenders.size ? simActions.previewWar([...draft.attackers], [...draft.defenders], draft.muster, draft.type) : null;
    if (preview) {
      if (preview.joined?.length) right.append(el("p", "hint", `同盟・従属の拘束により参戦: ${preview.joined.map((j) => `${stateName(map, j.id)}（${j.alliance}）`).join("、")}`));
      right.append(getOutcome()?.bars(preview) ?? el("p", "muted", ""));
    } else right.append(el("p", "muted", "攻撃側と防御側の国を選ぶと、ここに戦力の比較が出ます。"));
    right.append(el("p", "hint", "「戦争開始」で戦闘が始まり、時間とともに損害・ハプニングが積み重なります。終わりは決まっていません。いつでも講和条約を結べます（結んだ月が終戦の月です）。"));
    go.disabled = !draft.attackers.size || !draft.defenders.size;
    go.addEventListener("click", () => {
      const out = simActions.declareWarInstant([...draft.attackers], [...draft.defenders], draft.muster, draft.type);
      if (!out) return;
      selected = out.id;
      creating = false;
      draft = { name: "", attackers: /* @__PURE__ */ new Set(), defenders: /* @__PURE__ */ new Set(), muster: {}, type: "conventional" };
      render();
      if (out.collapsed?.length) alertDialog?.(`人口の大部分を失い、国家が崩壊しました：${out.collapsed.join("、")}`);
    });
    right.append(go);
    grid.append(left, right);
    return grid;
  }
  function warDetail(map, states, w) {
    const ov = el("div", "war-tab-ov"), mu = el("div", "war-tab-mu"), lg = el("div", "war-tab-lg"), pc = el("div", "war-tab-pc");

    const nameIn = document.createElement("input");
    nameIn.value = w.name;
    nameIn.className = "war-name-input";
    nameIn.addEventListener("change", () => simActions.renameWar(w.id, nameIn.value));
    const typeName = WAR_TYPES[w.type]?.label ?? "通常戦";
    const now = map.worldTime ?? { year: w.startedAt.year, month: w.startedAt.month };
    const elapsed = Math.max(0, monthIdx(w.endedAt ?? now) - monthIdx(w.startedAt));
    ov.append(el("label", "field-label", `戦争の名前（${typeName}）`), nameIn);
    ov.append(el("p", "hint", w.endedAt ? `開戦 ${fmtDate3(w.startedAt)} ／ 終戦 ${fmtDate3(w.endedAt)}（${w.lastedMonths ?? elapsed}か月）${w.treatyName ? ` ／ 講和条約：${w.treatyName}` : ""}` : `開戦 ${fmtDate3(w.startedAt)} ／ 経過 ${elapsed}か月（目安は約${w.durationMonths ?? "?"}か月。終わりは決まっておらず、講和条約を結んだ月が終戦になります）`));
    if (!w.endedAt) {
      mu.append(el("h4", "", "参戦国の部隊（チェックを外すと戦線から引き上げます）"));
      for (const id of [...w.attackers, ...w.defenders]) {
        const st = map.pack.states[id];
        if (!isLive(st)) continue;
        const regs = Array.isArray(st.military) ? st.military : [];
        const onFront = new Set(w.muster?.[id] ?? regs.map((r) => r.i));
        const row = el("div", "muster-state");
        row.append(el("strong", "", `${stateName(map, id)}（${w.attackers.includes(id) ? "攻撃側" : "防御側"}）${w.withdrawn?.[id] ? "　撤退済み" : ""}`));
        for (const r of regs) {
          const l = el("label", "muster-reg");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = onFront.has(r.i);
          cb.addEventListener("change", () => {
            const set = new Set(onFront);
            if (cb.checked) set.add(r.i);
            else set.delete(r.i);
            simActions.withdrawFromWar(w.id, id, [...set]);
          });
          l.append(cb, document.createTextNode(` ${r.name}`));
          row.append(l);
        }
        const all = el("button", "ent-btn", "全軍撤退");
        all.type = "button";
        all.disabled = !onFront.size;
        all.addEventListener("click", async () => {
          if (await confirmDialog(`${stateName(map, id)}は全軍を引き上げます。陣営の全員が撤退すると、その陣営の敗北で決着します。よろしいですか？`, { okLabel: "撤退する", danger: true })) simActions.withdrawFromWar(w.id, id, []);
        });
        row.append(all);
        mu.append(row);
      }
    }
    const events = [...(w.battles ?? []).map((b) => ({ date: b.date, tag: "戦闘", text: `${b.name}　${b.text}` })), ...(w.events ?? []).map((e) => ({ date: e.date, tag: { event: "出来事", omen: "兆し", "omen-fulfilled": "的中", "omen-faded": "杞憂", withdraw: "撤退" }[e.kind] ?? "出来事", text: e.text, kind: e.kind }))];
    const reached = (d) => !d || w.endedAt || monthIdx(d) <= monthIdx(now);
    const shown = events.filter((e) => reached(e.date)).sort((x, y) => (x.date ? monthIdx(x.date) : 0) - (y.date ? monthIdx(y.date) : 0));
    lg.append(el("h4", "", "経過の記録"));
    if (!shown.length) lg.append(el("p", "muted", "まだ記録はありません。時間が進むと、戦闘や出来事が記録されます。"));
    const log = el("ol", "battle-log");
    for (const e of shown) {
      const li = el("li", e.kind ? `ev-${e.kind}` : "");
      li.append(el("span", "ev-tag", e.tag), document.createTextNode(`${e.date ? `${fmtDate3(e.date)}　` : ""}${e.text}`));
      log.append(li);
    }
    lg.append(log);
    ov.append(el("h4", "", "戦況"));
    const sit = getOutcome()?.situation(map, w);
    if (sit) ov.append(sit);
    if (w.mediator != null) ov.append(el("p", "hint", `${stateName(map, w.mediator)}が調停に動いています。講和の好機かもしれません。`));
    if (!w.endedAt) {
      const go = el("button", "primary war-go", "📜 講和条約を結ぶ");
      go.type = "button";
      go.addEventListener("click", () => getWins()?.open("treaty"));
      ov.append(go);
      const fin = el("button", "", "経過を目安の終わりまで進める");
      fin.type = "button";
      fin.title = "時間を待たずに、目安の期間ぶんの損害とできごとを反映します";
      fin.addEventListener("click", () => simActions.finishWar(w.id));
      ov.append(fin);
    } else ov.append(el("p", "muted", "この戦争は終結しました。条約の中身は「講和条約」ウィンドウで確認できます。"));


    if (w.endedAt) mu.append(el("p", "muted", "この戦争は終結しています。部隊の招集は戦争中だけ変えられます。"));
    if (w.result) {
      const cur = simActions.currentWarScore(w), r = w.result, T = WAR_TYPES[w.type] ?? WAR_TYPES.conventional;
      const dur = Math.max(1, w.durationMonths ?? 12), done = w.monthsDone ?? Math.round((w.progress ?? 0) * dur), over = Math.max(0, done - dur);
      pc.append(el("h4", "", "戦争スコアの内訳"));
      const tb = el("table", "win-table");
      const row = (k, v) => { const tr = el("tr"); tr.append(el("th", "", k), el("td", "", v)); tb.append(tr); };
      // 開戦時の記録には優勢度そのものが保存されていないので、最大スコアの式から逆算する
      const domRaw = r.dominance ?? (r.warScore ? ((r.warScore / (100 * T.scoreScale)) - BALANCE.scoreBase) / (1 - BALANCE.scoreBase) : 0);
      row("戦力差（優勢度）", `${Math.round(Math.min(1, Math.max(0, domRaw)) * 100)}%`);
      row("戦争の形態", `${typeName}（係数 ${T.scoreScale}）`);
      row("最大スコア", `${r.warScore ?? 0}　＝ 100 ×（0.15 ＋ 0.85 × 優勢度）× 係数`);
      row("経過", `${done} / 目安 ${dur}か月${over ? `（超過 ${over}か月ぶんの占領進行を含む）` : ""}`);
      row("現在のスコア", `${cur}${r.victory?.collapse ? "（民意の崩壊で降伏したため満額）" : ""}`);
      tb.append((() => { const tr = el("tr"); tr.append(el("th", "", "要求できるもの"), el("td", "", cur >= BALANCE.annexMinScore ? "全面降伏（併合）まで" : `割譲・賠償・従属化（併合は${BALANCE.annexMinScore}以上）`)); return tr; })());
      pc.append(tb);
      pc.append(el("p", "hint", "スコアは目安の期間まで上がり、超過後も戦争が続けば毎月上がります。割譲の費用は講和条約の窓で確認できます。"));
      const open = el("button", w.endedAt ? "" : "primary war-go", w.endedAt ? "📜 条約の中身を見る" : "📜 講和条約を結ぶ");
      open.type = "button";
      open.addEventListener("click", () => getWins()?.open("treaty"));
      pc.append(open);
    }
    const TABS = [["ov", "概要", ov], ["mu", "部隊", mu], ["lg", "経過", lg], ["pc", "講和", pc]];
    if (!TABS.some(([k]) => k === wTab)) wTab = "ov";
    const wrap = el("div", "war-tabs-wrap"), bar = el("div", "war-tabs");
    for (const [k, label, pane] of TABS) {
      const b = el("button", k === wTab ? "active" : "", label);
      b.type = "button";
      pane.hidden = k !== wTab;
      b.addEventListener("click", () => { wTab = k; render(); });
      bar.append(b);
    }
    wrap.append(bar, ov, mu, lg, pc);
    return wrap;
  }
  const safeRender = guardRender(root, () => render());
  store.subscribe((_s, change) => {
    if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender();
  });
  return { render };
}
