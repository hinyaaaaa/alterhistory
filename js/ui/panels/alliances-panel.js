// 同盟タブ：3カ国以上の同盟を作成・編集・解消する。
import { formatWorldTime } from "../../core/sim/time.js";
import { BONDS, BOND_BY_KEY, bondOf } from "../../core/sim/war-flow.js";
import { leaderOf } from "../../core/edit/alliances.js";
import { VASSAL_KINDS, VASSAL_BY_KEY } from "../../core/edit/vassals.js";
import { guardRender } from "../safe-render.js";
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

    root.append(vassalSection(map, states));
    if (dissolved.length) {
      root.append(el("h4", "", "解消済みの同盟（履歴）"));
      for (const a of dissolved) root.append(allianceCard(map, states, a));
    }
  }

  /** 従属関係（傀儡・保護国・属国）。戦争の講和でも作れるが、ここで直接設定することもできる */
  function vassalSection(map, states) {
    const box = el("div", "editor-section");
    box.append(el("h4", "", "従属関係（傀儡・保護国・属国）"));
    box.append(el("p", "hint", VASSAL_KINDS.map((k) => `${k.label}: ${k.desc}`).join(" ／ ")));
    const rows = states.filter((s) => simActions.vassalInfo(s.i));
    if (!rows.length) box.append(el("p", "muted", "従属している国はありません"));
    for (const s of rows) {
      const v = simActions.vassalInfo(s.i); const row = el("div", "ent-row");
      row.append(el("span", "ent-main", `${stateName(map, s.i)} は ${stateName(map, v.overlord)} の${VASSAL_BY_KEY[v.kind].label}（貢納 ${Math.round(VASSAL_BY_KEY[v.kind].tribute * 100)}%/年）`));
      const rel = el("button", "ent-btn", "独立させる"); rel.type = "button"; rel.addEventListener("click", () => simActions.releaseVassal(s.i));
      row.append(rel); box.append(row);
    }
    const add = el("div", "member-picker");
    const mk = (cur) => { const sel = document.createElement("select"); for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = stateName(map, s.i); sel.append(o); } if (cur != null) sel.value = cur; return sel; };
    const a = mk(), b = mk(states[1]?.i), kind = document.createElement("select");
    for (const k of VASSAL_KINDS) { const o = document.createElement("option"); o.value = k.key; o.textContent = k.label; kind.append(o); }
    const go = el("button", "", "従属させる"); go.type = "button";
    go.addEventListener("click", () => { if (a.value !== b.value) simActions.setVassal(Number(a.value), Number(b.value), kind.value); });
    add.append(a, el("span", "", "を"), b, el("span", "", "の"), kind, go);
    box.append(add);
    return box;
  }

  function stateName(map, id) { return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`; }

  function memberPicker(states, checkedIds = []) {
    const wrap = el("div", "member-picker");
    const boxes = [];
    for (const s of states) {
      const label = el("label", "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = s.i; cb.checked = checkedIds.includes(s.i);
      label.append(cb, document.createTextNode(s.fullName ?? s.name));
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
    const nameInput = document.createElement("input"); nameInput.placeholder = "同盟の名前（空欄ならおまかせ）";
    const nameRow = el("span", "name-row");
    const dice = el("button", "suggest-mini", "🎲"); dice.type = "button"; dice.title = "名前をランダムに決める（押すたびに変わります）";
    dice.addEventListener("click", () => { const chosen = boxes.find((b) => b.checked); nameInput.value = simActions.suggestAllianceName(chosen ? Number(chosen.value) : undefined); });
    nameRow.append(nameInput, dice);
    wrap.append(nameRow);
    const { wrap: picker, boxes } = memberPicker(states);
    wrap.append(picker);
    const bp = bondPicker("standard", () => {});
    wrap.append(bp.wrap);
    // 盟主：同盟を主導し、講和では取り分が多くなる（結成時に選ぶ。あとから変えられる）
    const leaderSel = document.createElement("select");
    const syncLeader = () => { const chosen = boxes.filter((b) => b.checked).map((b) => Number(b.value)); const cur = leaderSel.value; leaderSel.replaceChildren(); for (const id of chosen) { const o = document.createElement("option"); o.value = id; o.textContent = stateName(map, id); o.selected = String(id) === cur; leaderSel.append(o); } };
    for (const b of boxes) b.addEventListener("change", syncLeader);
    wrap.append(el("label", "field-label", "盟主（選んだ加盟国から）"), leaderSel);
    const go = el("button", "", "同盟を結成（2カ国以上を選択）");
    go.type = "button";
    go.addEventListener("click", async () => {
      const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
      if (ids.length < 2) { await alertDialog("2カ国以上を選んでください"); return; }
      simActions.createAlliance(nameInput.value, ids, bp.value, leaderSel.value ? Number(leaderSel.value) : ids[0]);
      nameInput.value = "";
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
    nameInput.addEventListener("change", () => { if (nameInput.value.trim()) simActions.editAlliance(a.id, { name: nameInput.value }); });
    head.append(nameInput);
    if (!dissolved) {
      const re = el("button", "suggest-mini", "🎲"); re.type = "button"; re.title = "名前をランダムに決め直す";
      re.addEventListener("click", () => simActions.editAlliance(a.id, { name: simActions.suggestAllianceName(simActions.allianceLeader(a)) }));
      head.append(re);
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
    if (!dissolved) {
      const ls = document.createElement("select");
      for (const id of a.members) { const o = document.createElement("option"); o.value = id; o.textContent = stateName(map, id); o.selected = id === leaderOf(a); ls.append(o); }
      ls.addEventListener("change", () => simActions.editAlliance(a.id, { leader: Number(ls.value) }));
      card.append(el("label", "field-label", "盟主（講和を主導し、取り分が多い）"), ls);
    } else card.append(el("p", "hint", `盟主：${stateName(map, leaderOf(a))}`));
    const chips = el("div", "member-chip-list");
    for (const id of a.members) chips.append(el("span", "member-chip", `${id === leaderOf(a) ? "★ " : ""}${stateName(map, id)}`));
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

  const safeRender = guardRender(root, () => render());
  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender(); });
  return { render };
}
