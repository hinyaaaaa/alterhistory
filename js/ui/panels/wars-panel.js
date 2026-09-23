// 戦争タブ：宣戦布告、戦績の閲覧、講和条約の締結。
import { formatWorldTime } from "../../core/sim/time.js";
import { byId } from "../dom.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initWarsPanel({ store, simActions }) {
  const root = byId("tab-wars");

  function render() {
    root.replaceChildren();
    const map = store.getState().map;
    if (!map) { root.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);

    root.append(declareForm(map, states));
    const wars = simActions.listWars().slice().reverse();
    if (!wars.length) { root.append(el("p", "muted", "戦争の記録はまだありません")); return; }
    for (const w of wars) root.append(warCard(map, states, w));
  }

  function stateName(map, id) { return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`; }

  function declareForm(map, states) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "宣戦布告"));
    const row = el("div", "member-picker");
    const aSel = document.createElement("select"); const bSel = document.createElement("select");
    for (const s of states) { const o1 = document.createElement("option"); o1.value = s.i; o1.textContent = s.name; aSel.append(o1); }
    for (const s of states) { const o2 = document.createElement("option"); o2.value = s.i; o2.textContent = s.name; bSel.append(o2); }
    if (states[1]) bSel.value = String(states[1].i);
    const nameInput = document.createElement("input"); nameInput.placeholder = "戦争の名前（省略可）";
    const go = el("button", "danger", "宣戦布告する");
    go.type = "button";
    go.addEventListener("click", () => {
      if (aSel.value === bSel.value) { alert("同じ国家どうしでは戦争できません"); return; }
      simActions.declareWar([Number(aSel.value)], [Number(bSel.value)], nameInput.value || undefined);
    });
    row.append(el("span", "", "攻撃側"), aSel, el("span", "", "防御側"), bSel);
    wrap.append(row, nameInput, go);
    return wrap;
  }

  function warCard(map, states, w) {
    const card = el("div", `war-card${w.endedAt ? " ended" : ""}`);
    card.append(el("div", "war-title", w.name));
    const aNames = w.attackers.map((id) => stateName(map, id)).join("・");
    const dNames = w.defenders.map((id) => stateName(map, id)).join("・");
    card.append(el("div", "war-meta", `${aNames} 対 ${dNames}　開戦: ${formatWorldTime(w.startedAt)}${w.endedAt ? `　終結: ${formatWorldTime(w.endedAt)}` : ""}`));

    const log = el("div", "battle-log");
    if (w.battles.length) {
      for (const b of w.battles.slice(-8).reverse()) {
        log.append(el("div", "", `${b.year}年${b.month}月 ${stateName(map, b.attackerState)} vs ${stateName(map, b.defenderState)} → ${b.winner === "attacker" ? "攻撃側" : "防御側"}の勝利`));
      }
    } else log.append(el("div", "", "まだ戦闘の記録がありません"));
    card.append(log);

    if (!w.endedAt) {
      const adv = w.advantage[w.attackers[0]] ?? 0;
      card.append(el("p", "muted", `優勢度（攻撃側基準）: ${adv > 0 ? "+" : ""}${adv}`));
      card.append(peaceForm(map, states, w));
    } else {
      card.append(el("p", "muted", "この戦争は終結しました"));
    }
    return card;
  }

  function peaceForm(map, states, w) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "講和条約"));
    const dirRow = el("div", "member-picker");
    const aTo = el("button", "", `${stateName(map, w.attackers[0])}に割譲`);
    const dTo = el("button", "", `${stateName(map, w.defenders[0])}に割譲`);
    let direction = "attacker";
    const syncDir = () => { aTo.classList.toggle("active", direction === "attacker"); dTo.classList.toggle("active", direction === "defender"); refreshList(); };
    aTo.type = "button"; dTo.type = "button";
    aTo.addEventListener("click", () => { direction = "attacker"; syncDir(); });
    dTo.addEventListener("click", () => { direction = "defender"; syncDir(); });
    dirRow.append(aTo, dTo);
    wrap.append(dirRow);

    const listEl = el("div", "cession-list");
    wrap.append(listEl);
    const checks = [];
    function refreshList() {
      listEl.replaceChildren(); checks.length = 0;
      const from = direction === "attacker" ? w.defenders[0] : w.attackers[0];
      const to = direction === "attacker" ? w.attackers[0] : w.defenders[0];
      const candidates = simActions.suggestCessions(to, from);
      if (!candidates.length) { listEl.append(el("p", "muted", "割譲できそうな地域が見つかりませんでした（国境が接していない可能性があります）")); return; }
      for (const c of candidates) {
        const row = el("label", "cession-item");
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.dataset.type = c.type;
        if (c.type === "province") cb.dataset.provinceId = c.provinceId; else cb.__regionCells = c.regionCells;
        row.append(cb, el("span", "", `${c.name}（${c.cells}セル）`));
        listEl.append(row);
        checks.push(cb);
      }
    }
    refreshList();

    const repRow = el("label", "field");
    repRow.append(el("span", "field-label", "賠償金（相手の産業力から差し引く・任意）"));
    const repInput = document.createElement("input"); repInput.type = "number"; repInput.min = "0"; repInput.value = "0";
    repRow.append(repInput);
    wrap.append(repRow);

    const signBtn = el("button", "danger", "この内容で講和する");
    signBtn.type = "button";
    signBtn.addEventListener("click", () => {
      const provinceIds = checks.filter((c) => c.checked && c.dataset.type === "province").map((c) => Number(c.dataset.provinceId));
      const regionCells = checks.filter((c) => c.checked && c.dataset.type === "region").map((c) => c.__regionCells);
      const toStateId = direction === "attacker" ? w.attackers[0] : w.defenders[0];
      simActions.signPeace(w.id, { provinceIds, regionCells, toStateId, reparations: Number(repInput.value) || 0 });
    });
    wrap.append(signBtn);
    return wrap;
  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return { render };
}
