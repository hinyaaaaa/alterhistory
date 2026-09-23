// 同盟タブ：3カ国以上の同盟を作成・編集・解消する。
import { byId } from "../dom.js";

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
    if (!list.length) { root.append(el("p", "muted", "同盟はまだありません")); return; }
    for (const a of list) root.append(allianceCard(map, states, a));
  }

  function stateName(map, id) { return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`; }

  function memberPicker(states, checkedIds = []) {
    const wrap = el("div", "member-picker");
    const boxes = [];
    for (const s of states) {
      const label = el("label", "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = s.i; cb.checked = checkedIds.includes(s.i);
      label.append(cb, document.createTextNode(s.name));
      wrap.append(label);
      boxes.push(cb);
    }
    return { wrap, boxes };
  }

  function createForm(map, states) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "新しい同盟"));
    const nameInput = document.createElement("input"); nameInput.placeholder = "同盟の名前";
    wrap.append(nameInput);
    const { wrap: picker, boxes } = memberPicker(states);
    wrap.append(picker);
    const go = el("button", "", "同盟を結成（2カ国以上を選択）");
    go.type = "button";
    go.addEventListener("click", () => {
      const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      if (ids.length < 2) { alert("2カ国以上を選んでください"); return; }
      simActions.createAlliance(nameInput.value, ids);
    });
    wrap.append(go);
    return wrap;
  }

  function allianceCard(map, states, a) {
    const card = el("div", "alliance-card");
    const head = el("div", "regiment-card-head");
    const nameInput = document.createElement("input");
    nameInput.value = a.name; nameInput.style.fontWeight = "600"; nameInput.style.background = "transparent"; nameInput.style.border = "0"; nameInput.style.flex = "1";
    nameInput.addEventListener("change", () => simActions.editAlliance(a.id, { name: nameInput.value }));
    const delBtn = el("button", "danger", "解消");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => { if (confirm(`「${a.name}」を解消しますか？`)) simActions.dissolveAlliance(a.id); });
    head.append(nameInput, delBtn);
    card.append(head);

    const chips = el("div", "member-chip-list");
    for (const id of a.members) chips.append(el("span", "member-chip", stateName(map, id)));
    card.append(chips);

    const { wrap: picker, boxes } = memberPicker(states, a.members);
    card.append(el("p", "muted", "加盟国の変更:"));
    card.append(picker);
    const update = el("button", "", "メンバーを更新");
    update.type = "button";
    update.addEventListener("click", () => {
      const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      if (ids.length < 2) { alert("2カ国以上が必要です"); return; }
      simActions.editAlliance(a.id, { members: ids });
    });
    card.append(update);
    return card;
  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return { render };
}
