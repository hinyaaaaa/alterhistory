// 部隊タブ：国家を選び、その国の部隊一覧・兵力編集・攻撃指示を行う。
import { UNIT_TYPES, forcePower, forceHeadcount } from "../../core/sim/units.js";
import { byId } from "../dom.js";
import { confirmDialog, alertDialog } from "../dialogs.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initMilitaryPanel({ store, simActions, editActions }) {
  const root = byId("tab-regiments");
  let selectedState = null;
  let attackPick = null; // { stateId, regIds: number[] } 動員して攻撃対象を選ぶモード（regIdsが1件なら従来の1対1攻撃と同じ）
  let musterMode = false; // true の間、同じセルの部隊カードに動員チェックボックスを出す
  const musterSelection = new Set(); // 動員モードでチェックされた regId
  const cardCache = new Map(); // regId -> { el, reg, stateId } 直前の描画内容

  /** 部隊が属する国家のドクトリンキー（戦争ドクトリンは部隊ではなく国家に紐づく） */
  function doctrineOf(stateId) { return editActions.getDoctrine(stateId); }
  function doctrineLabelOf(stateId) {
    const key = doctrineOf(stateId);
    return editActions.DOCTRINES.find((d) => d.key === key)?.label ?? key;
  }

  /** 二国間で現在進行中の戦争を1つ探す（無ければ null）。複数あれば最初の1件 */
  function findActiveWar(stateA, stateB) {
    const wars = simActions.warsOf(stateA);
    return wars.find((w) => !w.endedAt &&
      ((w.attackers.includes(stateA) && w.defenders.includes(stateB)) ||
       (w.defenders.includes(stateA) && w.attackers.includes(stateB)))) ?? null;
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
    picker.append(el("span", "field-label", "国家"));
    const sel = document.createElement("select");
    for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; if (s.i === selectedState) o.selected = true; sel.append(o); }
    sel.addEventListener("change", () => { selectedState = Number(sel.value); cardCache.clear(); musterSelection.clear(); musterMode = false; render(); });
    picker.append(sel);

    const addBtn = el("button", "", "＋ 新しい部隊を編成（地図をクリックして配置）");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => { root.dispatchEvent(new CustomEvent("request-place-regiment", { detail: { stateId: selectedState }, bubbles: true })); });
    picker.append(addBtn);

    const musterBtn = el("button", musterMode ? "primary" : "", musterMode ? "動員モードを終了" : "部隊を動員して攻撃…");
    musterBtn.type = "button";
    musterBtn.addEventListener("click", () => {
      musterMode = !musterMode;
      musterSelection.clear();
      cardCache.clear();
      render();
    });
    picker.append(musterBtn);
    root.append(picker);

    if (musterMode) {
      const hint = el("p", "hint", "同じ場所（セル）にいる部隊にチェックを入れて選び、まとめて1つの軍として攻撃を仕掛けられます。行軍で部隊を集結させてから選んでください。");
      root.append(hint);
    }

    if (!states.length) { root.append(el("p", "muted", "国家がありません")); cardCache.clear(); return; }
    const list = el("div", "regiment-list");
    const regs = simActions.regimentsOf(selectedState);
    if (!regs.length) list.append(el("p", "muted", "この国にはまだ部隊がありません"));

    const liveIds = new Set(regs.map((r) => r.i));
    for (const id of [...cardCache.keys()]) if (!liveIds.has(id)) cardCache.delete(id); // 解散済み等は捨てる

    for (const r of regs) list.append(getOrBuildCard(map, selectedState, r));
    root.append(list);

    if (musterMode && musterSelection.size > 0) {
      const bar = el("div", "muster-bar");
      const selectedRegs = regs.filter((r) => musterSelection.has(r.i));
      const cell = selectedRegs[0]?.cell;
      const sameCell = selectedRegs.every((r) => r.cell === cell);
      if (!sameCell) {
        bar.append(el("p", "muted", "選んだ部隊が同じ場所にいません。同じ場所の部隊だけを選んでください。"));
      } else {
        const total = Math.round(selectedRegs.reduce((sum, r) => sum + forcePower(r.u, doctrineOf(selectedState)), 0));
        bar.append(el("span", "", `動員: ${selectedRegs.length}部隊（合算戦力 ${total.toLocaleString()}）`));
        const go = el("button", "primary", "攻撃対象を選ぶ →");
        go.type = "button";
        go.addEventListener("click", () => { attackPick = { stateId: selectedState, regIds: [...musterSelection] }; musterMode = false; render(); });
        bar.append(go);
      }
      root.append(bar);
    }
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

    if (musterMode) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.dataset.field = "muster-check";
      check.checked = musterSelection.has(reg.i);
      check.addEventListener("change", () => {
        if (check.checked) musterSelection.add(reg.i); else musterSelection.delete(reg.i);
        render();
      });
      head.append(check);
    }

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
    const moveBtn = el("button", "", "移動（地図をクリック）");
    moveBtn.type = "button";
    moveBtn.addEventListener("click", () => root.dispatchEvent(new CustomEvent("request-move-regiment", { detail: { stateId, regId: reg.i }, bubbles: true })));
    const isPicking = attackPick && attackPick.stateId === stateId && attackPick.regIds.length === 1 && attackPick.regIds[0] === reg.i;
    const attackBtn = el("button", "", isPicking ? "対象を選択中…" : "単独で攻撃する");
    attackBtn.dataset.field = "attack-btn";
    attackBtn.type = "button";
    attackBtn.addEventListener("click", () => { attackPick = { stateId, regIds: [reg.i] }; render(); });
    actions.append(moveBtn, attackBtn);
    card.append(actions);

    const targetSlot = el("div", "attack-target-slot");
    targetSlot.dataset.field = "attack-target-slot";
    card.append(targetSlot);
    fillAttackTarget(map, stateId, reg, targetSlot);
    return card;
  }

  /** 攻撃対象選択中なら「この部隊（がいる場所）を攻撃」行を差し込む。対象外なら空にする */
  function fillAttackTarget(map, stateId, reg, slot) {
    slot.replaceChildren();
    if (!(attackPick && attackPick.stateId !== stateId)) return;
    const isMuster = attackPick.regIds.length > 1;
    const row = el("div", "attack-target");
    row.append(el("span", "", isMuster ? `「${reg.name}」がいる場所を狙う（その国の全部隊が応戦）:` : `「${reg.name}」を選択:`));
    const go = el("button", "danger", isMuster ? "この場所へ攻め込む" : "この部隊を攻撃");
    go.type = "button";
    go.addEventListener("click", async () => {
      const war = findActiveWar(attackPick.stateId, stateId);
      const a = attackPick, target = { stateId, regId: reg.i };
      const result = isMuster
        ? simActions.musterAttack({ stateId: a.stateId, regIds: a.regIds }, target, war?.id)
        : simActions.attack({ stateId: a.stateId, regId: a.regIds[0] }, target, war?.id);
      attackPick = null;
      musterSelection.clear();
      render();
      if (result) await alertDialog(formatBattleResult(result), { okLabel: "閉じる" });
    });
    row.append(go);
    slot.append(row);
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

    const isPicking = attackPick && attackPick.stateId === stateId && attackPick.regIds.length === 1 && attackPick.regIds[0] === reg.i;
    const attackBtn = card.querySelector('[data-field="attack-btn"]');
    if (attackBtn) attackBtn.textContent = isPicking ? "対象を選択中…" : "単独で攻撃する";

    const targetSlot = card.querySelector('[data-field="attack-target-slot"]');
    if (targetSlot) fillAttackTarget(map, stateId, reg, targetSlot);
  }

  function formatBattleResult(r) {
    const winLabel = r.winner === "attacker" ? "攻撃側の勝利" : "防御側の勝利";
    const muster = r.attackerRegimentCount > 1 || r.defenderRegimentCount > 1
      ? `（攻撃側${r.attackerRegimentCount}部隊 vs 防御側${r.defenderRegimentCount}部隊）\n` : "";
    return `${winLabel}\n${muster}攻撃側 戦力${r.aPower} 被害${(r.attackerLossFraction * 100).toFixed(0)}%（${r.attackerCasualties}）\n防御側 戦力${r.dPower} 被害${(r.defenderLossFraction * 100).toFixed(0)}%（${r.defenderCasualties}）`;
  }

  store.subscribe((_s, change) => { if (["replace", "commit", "undo", "redo"].includes(change.type)) render(); });
  return {
    render,
    selectState(id) { selectedState = id; cardCache.clear(); render(); },
    get selectedState() { return selectedState; },
    cancelAttackPick() { if (attackPick || musterMode) { attackPick = null; musterMode = false; musterSelection.clear(); render(); } },
  };
}
