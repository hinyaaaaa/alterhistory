// 部隊の編成：国家を選び、その国の部隊一覧・兵力編集・移動を行う（軍事ウィンドウの中身）。
// 戦闘は戦争ウィンドウで、召集した部隊をもとに記録する（ここからは攻撃しない）。
import { UNIT_TYPES, forcePower, forceHeadcount } from "../../core/sim/units.js";
import { byId } from "../dom.js";
import { confirmDialog, alertDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initMilitaryPanel({ store, simActions, editActions }) {
  const root = byId("tab-regiments");
  let selectedState = null;
  let lockedToState = false; // true の間は国家セレクタを表示しない（国家タブのサブタブとして開いた時）
  const cardCache = new Map(); // regId -> { el, reg, stateId } 直前の描画内容
  let pending = null; // { type: "place"|"move", stateId, regId? } 「地図をクリックして配置/移動」の待ち受け

  /** 部隊が属する国家のドクトリンキー（戦争ドクトリンは部隊ではなく国家に紐づく） */
  function doctrineOf(stateId) { return editActions.getDoctrine(stateId); }
  function doctrineLabelOf(stateId) {
    const key = doctrineOf(stateId);
    return editActions.DOCTRINES.find((d) => d.key === key)?.label ?? key;
  }

  /** root 内の要素がフォーカスされていて、かつ card の子孫であれば true */
  function hasFocusWithin(card) {
    const a = document.activeElement;
    return !!a && card.contains(a);
  }

  function render() {
    const map = store.getState().map;
    if (!map) { root.replaceChildren(); root.append(el("p", "muted", "地図を開いてください")); cardCache.clear(); return; }
    const states = map.pack.states.filter(isLive);
    if (selectedState == null || !states.some((s) => s.i === selectedState)) selectedState = states[0]?.i ?? null;

    root.replaceChildren();

    const picker = el("div", "state-picker");
    if (!lockedToState) {
      picker.append(el("span", "field-label", "国家"));
      const sel = document.createElement("select");
      for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; if (s.i === selectedState) o.selected = true; sel.append(o); }
      sel.addEventListener("change", () => { selectedState = Number(sel.value); cardCache.clear(); render(); });
      picker.append(sel);
    }

    const addBtn = el("button", pending?.type === "place" ? "primary" : "", pending?.type === "place" ? "地図をクリックして配置…（クリックで取消）" : "＋ 新しい部隊を編成（地図をクリックして配置）");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      if (pending?.type === "place") { pending = null; store.update((s) => { s.hint = null; }); render(); return; }
      pending = { type: "place", stateId: selectedState };
      store.update((s) => { s.hint = "地図をクリックして部隊を配置する場所を選んでください"; });
      render();
    });
    picker.append(addBtn);

    root.append(picker);

    if (!states.length) { root.append(el("p", "muted", "国家がありません")); cardCache.clear(); return; }
    const list = el("div", "regiment-list");
    const regs = simActions.regimentsOf(selectedState);
    if (!regs.length) list.append(el("p", "muted", "この国にはまだ部隊がありません"));

    const liveIds = new Set(regs.map((r) => r.i));
    for (const id of [...cardCache.keys()]) if (!liveIds.has(id)) cardCache.delete(id); // 解散済み等は捨てる

    for (const r of regs) list.append(getOrBuildCard(map, selectedState, r));
    root.append(list);

  }

  /**
   * 部隊カードをキャッシュから再利用するか、新しく作るかを決める。
   * 「カード内の入力欄にフォーカスがある」場合は、そのカードを作り直さず、
   * 値だけを（フォーカス中の入力欄を除いて）更新する。これにより、
   * 1つの部隊の兵力を続けて何回も編集しても、他の部隊のカードや
   * 自分のカード内の他の入力欄のフォーカスが失われない。
   */
  function getOrBuildCard(map, stateId, reg) {
    const cached = cardCache.get(reg.i);
    if (cached && cached.stateId === stateId && hasFocusWithin(cached.el)) {
      patchRegimentCard(map, stateId, reg, cached);
      cached.reg = reg;
      return cached.el;
    }
    const built = buildRegimentCard(map, stateId, reg);
    cardCache.set(reg.i, { el: built, reg, stateId });
    return built;
  }


  function buildRegimentCard(map, stateId, reg) {
    const card = el("div", "regiment-card");
    const head = el("div", "regiment-card-head");


    const nameInput = document.createElement("input");
    nameInput.value = reg.name; nameInput.style.fontWeight = "600"; nameInput.style.background = "transparent"; nameInput.style.border = "0"; nameInput.style.width = "auto"; nameInput.style.flex = "1";
    nameInput.dataset.field = "name";
    nameInput.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { name: nameInput.value }));
    const disbandBtn = el("button", "danger", "解散");
    disbandBtn.type = "button";
    disbandBtn.addEventListener("click", async () => { if (await confirmDialog(`「${reg.name}」を解散しますか？`, { danger: true, okLabel: "解散" })) simActions.disbandRegiment(stateId, reg.i); });
    head.append(nameInput, disbandBtn);
    card.append(head);

    const cellInfo = el("p", "muted", `配置: セル#${reg.cell}`);
    cellInfo.dataset.field = "cell";
    card.append(cellInfo);

    const doctrineRow = el("p", "muted regiment-doctrine", `戦争ドクトリン: ${doctrineLabelOf(stateId)}（国家パネルで変更）`);
    doctrineRow.dataset.field = "doctrine-label";
    card.append(doctrineRow);

    const units = el("div", "regiment-units");
    for (const u of UNIT_TYPES) {
      const field = el("div", "unit-field");
      field.append(el("span", "", `${u.icon} ${u.label}`));
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.value = reg.u?.[u.key] ?? 0;
      input.dataset.field = `unit:${u.key}`;
      input.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { u: { [u.key]: Number(input.value) || 0 } }));
      field.append(input);
      units.append(field);
    }
    card.append(units);

    const power = el("p", "regiment-power", `総戦力: ${Math.round(forcePower(reg.u, doctrineOf(stateId))).toLocaleString()}　総兵員/機数: ${forceHeadcount(reg.u).toLocaleString()}`);
    power.dataset.field = "power";
    card.append(power);

    const actions = el("div", "regiment-actions");
    const isMovePicking = pending && pending.type === "move" && pending.stateId === stateId && pending.regId === reg.i;
    const moveBtn = el("button", "", isMovePicking ? "地図をクリックして移動先へ…" : "移動（地図をクリック）");
    moveBtn.dataset.field = "move-btn";
    moveBtn.type = "button";
    moveBtn.addEventListener("click", () => {
      pending = { type: "move", stateId, regId: reg.i };
      store.update((s) => { s.hint = "地図をクリックして移動先を選んでください"; });
      render();
    });
    actions.append(moveBtn);
    card.append(actions);

    return card;
  }

  /**
   * 既存カードの値だけを更新する。フォーカス中のフィールドは触らない
   * （フォーカスがあるのは基本1つの入力欄だけなので、他のフィールドは自由に更新してよい）。
   */
  function patchRegimentCard(map, stateId, reg, cached) {
    const card = cached.el;
    const active = document.activeElement;
    const isActive = (elm) => elm === active;

    const nameInput = card.querySelector('[data-field="name"]');
    if (nameInput && !isActive(nameInput)) nameInput.value = reg.name;

    const cellInfo = card.querySelector('[data-field="cell"]');
    if (cellInfo) cellInfo.textContent = `配置: セル#${reg.cell}`;

    const doctrineLabel = card.querySelector('[data-field="doctrine-label"]');
    if (doctrineLabel) doctrineLabel.textContent = `戦争ドクトリン: ${doctrineLabelOf(stateId)}（国家パネルで変更）`;

    for (const u of UNIT_TYPES) {
      const input = card.querySelector(`[data-field="unit:${u.key}"]`);
      if (input && !isActive(input)) input.value = reg.u?.[u.key] ?? 0;
    }

    const power = card.querySelector('[data-field="power"]');
    if (power) power.textContent = `総戦力: ${Math.round(forcePower(reg.u, doctrineOf(stateId))).toLocaleString()}　総兵員/機数: ${forceHeadcount(reg.u).toLocaleString()}`;


    const isMovePicking = pending && pending.type === "move" && pending.stateId === stateId && pending.regId === reg.i;
    const moveBtn = card.querySelector('[data-field="move-btn"]');
    if (moveBtn) moveBtn.textContent = isMovePicking ? "地図をクリックして移動先へ…" : "移動（地図をクリック）";

  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return {
    render,
    selectState(id) { selectedState = id; cardCache.clear(); render(); },
    /** 国家タブのサブタブとして開くとき: その国家に固定し、国家セレクタを隠す */
    lockToState(id) { lockedToState = true; selectedState = id; cardCache.clear(); render(); },
    unlock() { lockedToState = false; root.hidden = true; },
    get selectedState() { return selectedState; },
    /** 地図クリックで部隊の配置/移動を待っているか（edit-mode.js から参照） */
    regimentPending() { return pending != null; },
    /** edit-mode.js から: クリックされたセルを、待ち受け中の配置/移動に使う */
    consumeRegimentPlacement(cell) {
      if (!pending) return false;
      if (pending.type === "place") {
        const id = simActions.createRegiment(pending.stateId, cell, {});
        if (id != null) { pending = null; store.update((s) => { s.hint = null; }); render(); }
      } else if (pending.type === "move") {
        simActions.moveRegiment(pending.stateId, pending.regId, cell);
        pending = null; store.update((s) => { s.hint = null; }); render();
      }
      return true;
    },
    cancelPending() { if (pending) { pending = null; store.update((s) => { s.hint = null; }); render(); } },
  };
}
