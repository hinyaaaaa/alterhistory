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

export function initWarsPanel({ store, simActions }) {
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
    const nameInput = document.createElement("input");
    nameInput.placeholder = "戦争の名前（省略すると自動で付きます）"; nameInput.value = draft.name;
    const warn = el("p", "muted", "");
    const go = el("button", "danger", "宣戦布告する"); go.type = "button";
    const sideBox = (label, key, other) => {
      const box = el("div", "member-picker");
      box.append(el("span", "field-label", label));
      for (const s of states) {
        const l = el("label", ""); const cb = document.createElement("input"); cb.type = "checkbox";
        cb.checked = draft[key].has(s.i); cb.disabled = draft[other].has(s.i);
        cb.addEventListener("change", () => { if (cb.checked) draft[key].add(s.i); else draft[key].delete(s.i); draft.name = nameInput.value; render(); });
        l.append(cb, document.createTextNode(s.name)); box.append(l);
      }
      return box;
    };
    const sync = () => {
      const taken = nameInput.value.trim() && simActions.warNameTaken(nameInput.value);
      warn.textContent = taken ? `「${nameInput.value.trim()}」という戦争名は既に使われています` : "";
      go.disabled = !!taken || !draft.attackers.size || !draft.defenders.size;
    };
    nameInput.addEventListener("input", () => { draft.name = nameInput.value; sync(); });
    go.addEventListener("click", async () => {
      if (simActions.warNameTaken(nameInput.value)) { await alertDialog("その戦争名は既に使われています"); return; }
      const id = simActions.declareWar([...draft.attackers], [...draft.defenders], nameInput.value.trim() || undefined);
      if (id != null) { selected = id; creating = false; draft = { name: "", attackers: new Set(), defenders: new Set() }; render(); }
    });
    wrap.append(nameInput, warn, sideBox("攻撃側", "attackers", "defenders"), sideBox("防御側", "defenders", "attackers"), go);
    sync();
    return wrap;
  }

  // ---- 戦争の詳細 ----
  function warDetail(map, states, w) {
    const box = el("div", `war-card${w.endedAt ? " ended" : ""}`);
    box.append(el("div", "war-title", w.name));
    const aNames = w.attackers.map((id) => stateName(map, id)).join("・");
    const dNames = w.defenders.map((id) => stateName(map, id)).join("・");
    box.append(el("div", "war-meta", `${aNames} 対 ${dNames}　開戦: ${formatWorldTime(w.startedAt)}${w.endedAt ? `　終結: ${formatWorldTime(w.endedAt)}` : ""}`));
    if (!w.endedAt) { box.append(musterSection(map, w)); box.append(battleForm(map, w)); }
    box.append(battleLog(map, w));
    if (!w.endedAt) {
      const adv = w.advantage[w.attackers[0]] ?? 0;
      box.append(el("p", "muted", `優勢度（攻撃側基準）: ${adv > 0 ? "+" : ""}${adv}`));
      box.append(peaceForm(map, states, w));
    } else box.append(el("p", "muted", "この戦争は終結しました"));
    return box;
  }

  /** 召集する部隊：参戦国ごとに全部隊を一覧し、チェックを付けた部隊がこの戦争の戦力になる */
  function musterSection(map, w) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "召集する部隊"));
    const current = w.muster ?? {};
    const save = (sid, ids) => simActions.setMuster(w.id, { ...current, [sid]: ids });
    for (const [label, ids] of [["攻撃側", w.attackers], ["防御側", w.defenders]]) {
      for (const sid of ids) {
        const regs = simActions.regimentsOf(sid);
        const picked = new Set(current[sid] ?? []);
        const sec = el("div", "muster-state");
        sec.append(el("h5", "", `${label}：${stateName(map, sid)}　召集中の戦力 ${simActions.musterPower(w, sid).toLocaleString()}`));
        if (!regs.length) sec.append(el("p", "muted", "部隊がありません（軍事ウィンドウで編成できます）"));
        for (const r of regs) {
          const row = el("label", "muster-row");
          const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = picked.has(r.i);
          cb.addEventListener("change", () => { const n = new Set(picked); if (cb.checked) n.add(r.i); else n.delete(r.i); save(sid, [...n]); });
          row.append(cb, document.createTextNode(`${r.icon ?? "🛡️"} ${r.name ?? `部隊${r.i}`}`), el("span", "muted", `戦力 ${Math.round(forcePower(r.u)).toLocaleString()}`));
          sec.append(row);
        }
        wrap.append(sec);
      }
    }
    return wrap;
  }

  /** 戦闘を記録する：どの国どうしの戦闘で、どちらが勝ったか（召集した部隊の戦力を目安に出す） */
  function battleForm(map, w) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "戦闘を記録する"));
    const mk = (ids) => { const s = document.createElement("select"); for (const id of ids) { const o = document.createElement("option"); o.value = id; o.textContent = stateName(map, id); s.append(o); } return s; };
    const aSel = mk(w.attackers), dSel = mk(w.defenders);
    const win = document.createElement("select");
    for (const [v, t] of [["attacker", "攻撃側の勝利"], ["defender", "防御側の勝利"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; win.append(o); }
    const info = el("p", "muted", "");
    const sync = () => {
      const ap = simActions.musterPower(w, Number(aSel.value)), dp = simActions.musterPower(w, Number(dSel.value));
      info.textContent = `召集した戦力：${ap.toLocaleString()} 対 ${dp.toLocaleString()}（勝敗は自由に決められます）`;
    };
    aSel.addEventListener("change", sync); dSel.addEventListener("change", sync); sync();
    const go = el("button", "primary", "記録する"); go.type = "button";
    go.addEventListener("click", () => simActions.recordBattle(w.id, { attackerState: Number(aSel.value), defenderState: Number(dSel.value), winner: win.value }));
    const row = el("div", "member-picker");
    row.append(el("span", "", "攻撃側"), aSel, el("span", "", "防御側"), dSel, win);
    wrap.append(row, info, go);
    return wrap;
  }

  function battleLog(map, w) {
    const log = el("div", "battle-log");
    if (w.battles.length) {
      for (const b of w.battles.slice(-12).reverse()) {
        log.append(el("div", "", `${b.year}年${b.month}月 ${stateName(map, b.attackerState)} vs ${stateName(map, b.defenderState)} → ${b.winner === "attacker" ? "攻撃側" : "防御側"}の勝利`));
      }
    } else log.append(el("div", "", "まだ戦闘の記録がありません"));
    return log;
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
