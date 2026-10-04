// 同盟タブ：3カ国以上の同盟を作成・編集・解消する。
import { formatWorldTime } from "../../core/sim/time.js";
import { BONDS, BOND_BY_KEY, bondOf } from "../../core/sim/war-flow.js";
import { byId } from "../dom.js";
import { confirmDialog, alertDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initAlliancesPanel({ store, simActions }) {
  const root = byId("tab-alliances");

  function render() {
    root.replaceChildren();
    const map = store.getState().map;
    if (!map) { root.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);

    root.append(createForm(map, states));
    const list = simActions.listAlliances();
    const active = list.filter((a) => !a.dissolvedAt);
    const dissolved = list.filter((a) => a.dissolvedAt);
    if (!active.length) root.append(el("p", "muted", "同盟はまだありません"));
    else for (const a of active) root.append(allianceCard(map, states, a));

    if (dissolved.length) {
      root.append(el("h4", "", "解消済みの同盟（履歴）"));
      for (const a of dissolved) root.append(allianceCard(map, states, a));
    }
  }

  function stateName(map, id) { return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`; }

  function memberPicker(states, checkedIds = []) {
    const wrap = el("div", "member-picker");
    const boxes = [];
    for (const s of states) {
      const label = el("label", "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = s.i; cb.checked = checkedIds.includes(s.i);
      label.append(cb, document.createTextNode(stateName(map, s.i));
      wrap.append(label);
      boxes.push(cb);
    }
    return { wrap, boxes };
  }

  /** 同盟の拘束力を選ぶ（戦争への参戦と貿易封鎖の同調に連動する）。説明を見ながら選べる */
  function bondPicker(current, onChange) {
    const wrap = el("div", "bond-picker");
    wrap.append(el("label", "field-label", "同盟の拘束力"));
    const desc = el("p", "hint", BOND_BY_KEY[current].desc);
    const sel = document.createElement("select");
    for (const b of BONDS) { const o = document.createElement("option"); o.value = b.key; o.textContent = b.label; o.selected = b.key === current; sel.append(o); }
    sel.addEventListener("change", () => { desc.textContent = BOND_BY_KEY[sel.value].desc; onChange(sel.value); });
    wrap.append(sel, desc);
    return { wrap, get value() { return sel.value; } };
  }

  function createForm(map, states) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "新しい同盟"));
    const nameInput = document.createElement("input"); nameInput.placeholder = "同盟の名前";
    wrap.append(nameInput);
    const { wrap: picker, boxes } = memberPicker(states);
    wrap.append(picker);
    const bp = bondPicker("standard", () => {});
    wrap.append(bp.wrap);
    const go = el("button", "", "同盟を結成（2カ国以上を選択）");
    go.type = "button";
    go.addEventListener("click", async () => {
      const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      if (ids.length < 2) { await alertDialog("2カ国以上を選んでください"); return; }
      simActions.createAlliance(nameInput.value, ids, bp.value);
    });
    wrap.append(go);
    return wrap;
  }

  function allianceCard(map, states, a) {
    const dissolved = !!a.dissolvedAt;
    const card = el("div", `alliance-card${dissolved ? " dissolved" : ""}`);
    const head = el("div", "regiment-card-head");
    const nameInput = document.createElement("input");
    nameInput.value = a.name; nameInput.style.fontWeight = "600"; nameInput.style.background = "transparent"; nameInput.style.border = "0"; nameInput.style.flex = "1";
    nameInput.disabled = dissolved;
    nameInput.addEventListener("change", () => simActions.editAlliance(a.id, { name: nameInput.value }));
    head.append(nameInput);
    if (!dissolved) {
      const delBtn = el("button", "danger", "解消");
      delBtn.type = "button";
      delBtn.addEventListener("click", async () => { if (await confirmDialog(`「${a.name}」を解消しますか？`, { danger: true, okLabel: "解消" })) simActions.dissolveAlliance(a.id); });
      head.append(delBtn);
    }
    card.append(head);

    const dateLine = a.formedAt
      ? `結成: ${formatWorldTime(a.formedAt)}${dissolved ? `　解消: ${formatWorldTime(a.dissolvedAt)}` : ""}`
      : (dissolved ? "解消済み" : "");
    if (dateLine) card.append(el("p", "hint", dateLine));

    if (!dissolved) card.append(bondPicker(bondOf(a), (v) => simActions.editAlliance(a.id, { bond: v })).wrap);
    else card.append(el("p", "hint", `拘束力：${BOND_BY_KEY[bondOf(a)].label}`));
    const chips = el("div", "member-chip-list");
    for (const id of a.members) chips.append(el("span", "member-chip", stateName(map, id)));
    card.append(chips);

    if (!dissolved) {
      const { wrap: picker, boxes } = memberPicker(states, a.members);
      card.append(el("p", "muted", "加盟国の変更:"));
      card.append(picker);
      const update = el("button", "", "メンバーを更新");
      update.type = "button";
      update.addEventListener("click", async () => {
        const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
        if (ids.length < 2) { await alertDialog("2カ国以上が必要です"); return; }
        simActions.editAlliance(a.id, { members: ids });
      });
      card.append(update);
    }
    return card;
  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return { render };
}
