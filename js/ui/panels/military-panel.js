// 部隊タブ：国家を選び、その国の部隊一覧・兵力編集・攻撃指示を行う。
import { UNIT_TYPES, DOCTRINES, forcePower, forceHeadcount } from "../../core/sim/units.js";
import { byId } from "../dom.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initMilitaryPanel({ store, simActions, editActions }) {
  const root = byId("tab-regiments");
  let selectedState = null;
  let attackPick = null; // { stateId, regId } 攻撃を仕掛ける対象を選ぶモード

  function render() {
    root.replaceChildren();
    const map = store.getState().map;
    if (!map) { root.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    if (selectedState == null || !states.some((s) => s.i === selectedState)) selectedState = states[0]?.i ?? null;

    const picker = el("div", "state-picker");
    picker.append(el("span", "field-label", "国家"));
    const sel = document.createElement("select");
    for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; if (s.i === selectedState) o.selected = true; sel.append(o); }
    sel.addEventListener("change", () => { selectedState = Number(sel.value); render(); });
    picker.append(sel);

    const addBtn = el("button", "", "＋ 新しい部隊を編成（地図をクリックして配置）");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => { root.dispatchEvent(new CustomEvent("request-place-regiment", { detail: { stateId: selectedState }, bubbles: true })); });
    picker.append(addBtn);
    root.append(picker);

    if (!states.length) { root.append(el("p", "muted", "国家がありません")); return; }
    const list = el("div", "regiment-list");
    const regs = simActions.regimentsOf(selectedState);
    if (!regs.length) list.append(el("p", "muted", "この国にはまだ部隊がありません"));
    for (const r of regs) list.append(regimentCard(map, selectedState, r));
    root.append(list);
  }

  function regimentCard(map, stateId, reg) {
    const card = el("div", "regiment-card");
    const head = el("div", "regiment-card-head");
    const nameInput = document.createElement("input");
    nameInput.value = reg.name; nameInput.style.fontWeight = "600"; nameInput.style.background = "transparent"; nameInput.style.border = "0"; nameInput.style.width = "auto"; nameInput.style.flex = "1";
    nameInput.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { name: nameInput.value }));
    const disbandBtn = el("button", "danger", "解散");
    disbandBtn.type = "button";
    disbandBtn.addEventListener("click", () => { if (confirm(`「${reg.name}」を解散しますか？`)) simActions.disbandRegiment(stateId, reg.i); });
    head.append(nameInput, disbandBtn);
    card.append(head);

    const cellInfo = el("p", "muted", `配置: セル#${reg.cell}`);
    card.append(cellInfo);

    const doctrineRow = el("label", "field");
    doctrineRow.append(el("span", "field-label", "ドクトリン"));
    const dsel = document.createElement("select");
    for (const d of DOCTRINES) { const o = document.createElement("option"); o.value = d.key; o.textContent = d.label; if (d.key === (reg.doctrine ?? "balanced")) o.selected = true; dsel.append(o); }
    dsel.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { doctrine: dsel.value }));
    doctrineRow.append(dsel);
    card.append(doctrineRow);

    const units = el("div", "regiment-units");
    for (const u of UNIT_TYPES) {
      const field = el("div", "unit-field");
      field.append(el("span", "", `${u.icon} ${u.label}`));
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.value = reg.u?.[u.key] ?? 0;
      input.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { u: { [u.key]: Number(input.value) || 0 } }));
      field.append(input);
      units.append(field);
    }
    card.append(units);

    card.append(el("p", "regiment-power", `総戦力: ${Math.round(forcePower(reg.u, reg.doctrine)).toLocaleString()}　総兵員/機数: ${forceHeadcount(reg.u).toLocaleString()}`));

    const actions = el("div", "regiment-actions");
    const moveBtn = el("button", "", "移動（地図をクリック）");
    moveBtn.type = "button";
    moveBtn.addEventListener("click", () => root.dispatchEvent(new CustomEvent("request-move-regiment", { detail: { stateId, regId: reg.i }, bubbles: true })));
    const attackBtn = el("button", "", attackPick && attackPick.stateId === stateId && attackPick.regId === reg.i ? "対象を選択中…" : "攻撃する");
    attackBtn.type = "button";
    attackBtn.addEventListener("click", () => { attackPick = { stateId, regId: reg.i }; render(); });
    actions.append(moveBtn, attackBtn);
    card.append(actions);

    if (attackPick && !(attackPick.stateId === stateId)) {
      const row = el("div", "attack-target");
      row.append(el("span", "", `${attackPick.regId != null ? "攻撃対象として" : ""} 「${reg.name}」を選択:`));
      const go = el("button", "danger", "この部隊を攻撃");
      go.type = "button";
      go.addEventListener("click", () => {
        const result = simActions.attack(attackPick, { stateId, regId: reg.i });
        attackPick = null;
        if (result) alert(formatBattleResult(map, result));
        render();
      });
      row.append(go);
      card.append(row);
    }
    return card;
  }

  function formatBattleResult(map, r) {
    const winLabel = r.winner === "attacker" ? "攻撃側の勝利" : "防御側の勝利";
    return `${winLabel}\n攻撃側 戦力${r.aPower} 被害${(r.attackerLossFraction * 100).toFixed(0)}%（${r.attackerCasualties}）\n防御側 戦力${r.dPower} 被害${(r.defenderLossFraction * 100).toFixed(0)}%（${r.defenderCasualties}）`;
  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return {
    render,
    selectState(id) { selectedState = id; render(); },
    get selectedState() { return selectedState; },
    cancelAttackPick() { attackPick = null; render(); },
  };
}
