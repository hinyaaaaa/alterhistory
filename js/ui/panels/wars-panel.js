// 戦争ウィンドウ：戦争の一覧（左）と、選んだ戦争の詳細（右）。
// 戦争に関わること（宣戦布告・召集する部隊・戦闘の記録・講和）は、すべてここに集める。
//   - 戦争名は重複できない（宣戦布告のときに検査する）
//   - 召集する部隊は、参戦国の全部隊を一覧して、チェックを付けたものがその戦争の戦力になる
import { formatWorldTime } from "../../core/sim/time.js";
import { forcePower } from "../../core/sim/units.js";
import { WAR_TYPES } from "../../core/sim/war-engine.js";
import { guardRender } from "../safe-render.js";
import { byId } from "../dom.js";
import { alertDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initWarsPanel({ store, simActions, getOutcome = () => null, getWins = () => null }) {
  const root = byId("tab-wars");
  let selected = null;   // 選択中の戦争ID（null のときは一覧だけ）
  let creating = false;  // 宣戦布告フォームを開いているか
  let draft = { name: "", attackers: new Set(), defenders: new Set(), muster: {}, type: "conventional" };

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

  // ---- 戦争の準備：陣営を選び、招集する部隊を決める。その下に制海権などのバー。「戦争開始」で判定 ----
  const fmt = (n) => Math.round(n).toLocaleString("ja-JP");
  function declareForm(map, states) {
    const wrap = el("div", "editor-section");
    wrap.append(el("h4", "", "戦争の準備"));
    wrap.append(el("p", "hint", "① 戦争の形態を選び、② 攻撃側・防御側の国と招集する部隊を選ぶと、③ 下のバーに戦力の比較が出ます。「戦争開始」を押すと、ドクトリンに基づく戦闘の記録が作られ、時間が進むにつれて損害が積み重なります。戦闘が終わると、講和条約を結べます。"));
    const go = el("button", "danger", "⚔ 戦争開始"); go.type = "button";
    const sideBox = (label, key, other) => {
      const box = el("div", "member-picker");
      box.append(el("span", "field-label", label));
      for (const s of states) {
        const l = el("label", ""); const cb = document.createElement("input"); cb.type = "checkbox";
        cb.checked = draft[key].has(s.i); cb.disabled = draft[other].has(s.i);
        cb.addEventListener("change", () => { if (cb.checked) draft[key].add(s.i); else draft[key].delete(s.i); draft.muster = {}; render(); });
        l.append(cb, document.createTextNode(s.fullName ?? s.name)); box.append(l);
      }
      return box;
    };
    // 戦争の形態：常に総力戦ではない。規模と性格を選ぶ
    const typeBox = el("div", "war-type-list");
    for (const T of Object.values(WAR_TYPES)) {
      const l = el("label", `doctrine-card${draft.type === T.key ? " on" : ""}`); const rb = document.createElement("input"); rb.type = "radio"; rb.name = "war-type"; rb.checked = draft.type === T.key;
      rb.addEventListener("change", () => { draft.type = T.key; render(); });
      const body = el("div", "doctrine-body"); body.append(el("strong", "", T.label), el("p", "hint", T.desc)); l.append(rb, body); typeBox.append(l);
    }
    wrap.append(el("h4", "", "戦争の形態"), typeBox);
    wrap.append(sideBox("攻撃側", "attackers", "defenders"), sideBox("防御側", "defenders", "attackers"));

    // 招集する部隊（参戦する国ごと。初めは全部隊にチェック）
    const ids = [...draft.attackers, ...draft.defenders];
    const musterBox = el("div", "muster-box");
    for (const id of ids) {
      const st = map.pack.states[id]; const regs = Array.isArray(st.military) ? st.military : [];
      if (!draft.muster[id]) draft.muster[id] = regs.map((r) => r.i);
      const row = el("div", "muster-state");
      row.append(el("strong", "", `${st.fullName ?? st.name}（${draft.attackers.has(id) ? "攻撃側" : "防御側"}）`));
      if (!regs.length) row.append(el("span", "muted", "　部隊がありません（戦力0）"));
      for (const r of regs) {
        const l = el("label", "muster-reg"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = draft.muster[id].includes(r.i);
        cb.addEventListener("change", () => { const set = new Set(draft.muster[id]); if (cb.checked) set.add(r.i); else set.delete(r.i); draft.muster[id] = [...set]; render(); });
        const men = Object.entries(r.u ?? {}).filter(([k]) => k !== "nuclear").reduce((n, [, v]) => n + (Number(v) || 0), 0);
        l.append(cb, document.createTextNode(` ${r.name}（兵力 ${fmt(men)}）`)); row.append(l);
      }
      musterBox.append(row);
    }
    if (ids.length) wrap.append(el("h4", "", "招集する部隊"), draft.type === "total" ? el("p", "hint", "総力戦では、参戦する国のすべての部隊が戦います。") : musterBox);

    // 制海権・制空権・陸軍力・士気のバー（招集した部隊の戦力）
    const preview = draft.attackers.size && draft.defenders.size ? simActions.previewWar([...draft.attackers], [...draft.defenders], draft.muster, draft.type) : null;
    if (preview) {
      const o = getOutcome();
      if (preview.joined?.length) wrap.append(el("p", "hint", `同盟の拘束により参戦: ${preview.joined.map((j) => `${stateName(map, j.id)}（${j.alliance}）`).join("、")}`));
      wrap.append(o?.bars(preview) ?? el("p", "muted", ""));
    }
    go.disabled = !draft.attackers.size || !draft.defenders.size;
    go.addEventListener("click", () => {
      const out = simActions.declareWarInstant([...draft.attackers], [...draft.defenders], draft.muster, draft.type);
      if (!out) return;
      selected = out.id; creating = false; draft = { name: "", attackers: new Set(), defenders: new Set(), muster: {}, type: "conventional" }; render();
      if (out.collapsed?.length) alertDialog?.(`人口の大部分を失い、国家が崩壊しました：${out.collapsed.join("、")}`);
      getWins()?.open("war"); // 戦闘の経過は戦争ウィンドウで見る。時間が進むと損害が積み重なり、終わると講和条約を結べる
    });
    wrap.append(go);
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
    const typeName = WAR_TYPES[w.type]?.label ?? "通常戦";
    box.append(el("p", "hint", `形態：${typeName}`));
    if (w.progress != null && !w.endedAt) {
      const bar = el("div", "wo-bar"); const f = el("div", "wo-bar-a"); f.style.width = `${Math.round(w.progress * 100)}%`; bar.append(f);
      box.append(el("label", "field-label", `戦闘の進行 ${Math.round(w.progress * 100)}%（時間が進むと損害が積み重なります）`), bar);
    }
    // 戦闘の記録は、日付が来たものから順に現れる（時間経過で展開）
    const now = map.worldTime ?? { year: 0, month: 0 };
    const reached = (d) => !d || (w.progress != null && w.progress >= 1) || w.endedAt || (d.year * 12 + d.month) <= (now.year * 12 + now.month);
    const shown = (w.battles ?? []).filter((b) => reached(b.date));
    if (shown.length) {
      box.append(el("h4", "", "戦闘の記録"));
      const log = el("ol", "battle-log");
      for (const b of shown) log.append(el("li", "", `${b.date ? `${b.date.year}年${b.date.month}月　` : ""}${b.name}　${b.text}`));
      box.append(log);
    }
    if (w.endedAt) {
      box.append(el("p", "muted", `この戦争は終結しました。${w.treatyName ? `講和条約：${w.treatyName}` : ""}`));
    } else if (w.progress != null && w.progress < 1) {
      const fin = el("button", "", "戦闘を最後まで進める"); fin.type = "button";
      fin.addEventListener("click", () => simActions.finishWar(w.id));
      box.append(fin);
    } else {
      const go = el("button", "primary", "講和条約を決める"); go.type = "button";
      go.addEventListener("click", () => getWins()?.open("treaty"));
      box.append(go);
    }
    return box;
  }



  const safeRender = guardRender(root, () => render());
  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender(); });
  return { render };
}
