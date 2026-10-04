// 戦争ウィンドウ：戦争の一覧（左）と、選んだ戦争の詳細（右）。
// 戦争に関わること（宣戦布告・召集する部隊・戦闘の記録・講和）は、すべてここに集める。
//   - 戦争名は重複できない（宣戦布告のときに検査する）
//   - 召集する部隊は、参戦国の全部隊を一覧して、チェックを付けたものがその戦争の戦力になる
import { formatWorldTime } from "../../core/sim/time.js";
import { forcePower } from "../../core/sim/units.js";
import { byId } from "../dom.js";
import { alertDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initWarsPanel({ store, simActions, getOutcome = () => null, getWins = () => null }) {
  const root = byId("tab-wars");
  let selected = null;   // 選択中の戦争ID（null のときは一覧だけ）
  let creating = false;  // 宣戦布告フォームを開いているか
  let draft = { name: "", attackers: new Set(), defenders: new Set() };

  const stateName = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;

  function render() {
    root.replaceChildren();
    const map = store.getState().map;
    if (!map) { root.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    const wars = simActions.listWars().slice().reverse();
    if (selected != null && !wars.some((w) => w.id === selected)) selected = null;

    const split = el("div", "win-split");
    const list = el("div", "win-list");
    const add = el("button", creating ? "primary" : "", "＋ 新しい戦争（宣戦布告）");
    add.type = "button";
    add.addEventListener("click", () => { creating = true; selected = null; render(); });
    list.append(add);
    for (const w of wars) {
      const b = el("button", `${w.id === selected ? "active" : ""}${w.endedAt ? " ended" : ""}`, `${w.endedAt ? "🕊 " : "⚔ "}${w.name}`);
      b.type = "button";
      b.addEventListener("click", () => { selected = w.id; creating = false; render(); });
      list.append(b);
    }
    if (!wars.length) list.append(el("p", "muted", "戦争の記録はまだありません"));

    const detail = el("div", "win-detail");
    if (creating) detail.append(declareForm(map, states));
    else if (selected != null) detail.append(warDetail(map, states, wars.find((w) => w.id === selected)));
    else detail.append(el("p", "muted", "左の一覧から戦争を選ぶか、「新しい戦争」で宣戦布告してください。"));
    split.append(list, detail);
    root.append(split);
  }

  // ---- 宣戦布告 ----
  function declareForm(map, states) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "宣戦布告"));
    const warn = el("p", "muted", "宣戦布告すると、その場で戦争の勝敗が判定されます。戦争の名前は自動で付きます。");
    const go = el("button", "danger", "宣戦布告する"); go.type = "button";
    const sideBox = (label, key, other) => {
      const box = el("div", "member-picker");
      box.append(el("span", "field-label", label));
      for (const s of states) {
        const l = el("label", ""); const cb = document.createElement("input"); cb.type = "checkbox";
        cb.checked = draft[key].has(s.i); cb.disabled = draft[other].has(s.i);
        cb.addEventListener("change", () => { if (cb.checked) draft[key].add(s.i); else draft[key].delete(s.i); render(); });
        l.append(cb, document.createTextNode(stateName(map, s.i)); box.append(l);
      }
      return box;
    };
    const sync = () => { go.disabled = !draft.attackers.size || !draft.defenders.size; };
    go.addEventListener("click", () => {
      const out = simActions.declareWarInstant([...draft.attackers], [...draft.defenders]);
      if (out) { selected = out.id; creating = false; draft = { name: "", attackers: new Set(), defenders: new Set() }; render(); }
    });
    wrap.append(warn, sideBox("攻撃側", "attackers", "defenders"), sideBox("防御側", "defenders", "attackers"), go);
    sync();
    return wrap;
  }

  // ---- 戦争の詳細（戦況・名前の変更。講和は「講和条約」ウィンドウで決める） ----
  function warDetail(map, states, w) {
    const box = el("div", `war-card${w.endedAt ? " ended" : ""}`);
    const nameIn = document.createElement("input"); nameIn.value = w.name; nameIn.className = "war-name-input";
    nameIn.addEventListener("change", () => simActions.renameWar(w.id, nameIn.value));
    box.append(el("label", "field-label", "戦争の名前"), nameIn);
    const sit = getOutcome()?.situation(map, w);
    if (sit) box.append(sit);
    if (w.endedAt) {
      box.append(el("p", "muted", `この戦争は終結しました。${w.treatyName ? `講和条約：${w.treatyName}` : ""}`));
    } else {
      const go = el("button", "primary", "講和条約を決める"); go.type = "button";
      go.addEventListener("click", () => getWins()?.open("treaty"));
      box.append(go);
    }
    return box;
  }



  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return { render };
}
