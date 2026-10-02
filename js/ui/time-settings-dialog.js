// 時間設定ダイアログ：現在の年月を直接指定して上書きする、および時代区分（江戸時代・近代など）の
// 一覧・追加・編集・削除を行う。上部バーの年月表示をクリックすると開く。
//
// 見た目は js/ui/dialogs.js と同じ流儀（<dialog> を都度生成して使う）。

import { formatWorldTime } from "../core/sim/time.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function openTimeSettingsDialog({ store, timeActions, editActions }) {
  const map = store.getState().map;
  if (!map) return;

  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog time-settings-dialog";
  dialog.append(el("h2", null, "時間の設定"));

  // --- 現在の年月を直接指定 ---
  dialog.append(el("h3", "dialog-subhead", "現在の年月"));
  dialog.append(el("p", "hint", "1ヶ月ずつ進める以外に、ここで年月を直接指定してその時点から始めることもできます。"));
  const dateRow = el("div", "time-settings-row");
  const yearInput = document.createElement("input");
  yearInput.type = "number"; yearInput.min = "1"; yearInput.step = "1";
  yearInput.value = String(map.worldTime.year);
  yearInput.setAttribute("aria-label", "年");
  const yearSuffix = el("span", "", "年");
  const monthInput = document.createElement("input");
  monthInput.type = "number"; monthInput.min = "1"; monthInput.max = "12"; monthInput.step = "1";
  monthInput.value = String(map.worldTime.month);
  monthInput.setAttribute("aria-label", "月");
  const monthSuffix = el("span", "", "月");
  dateRow.append(yearInput, yearSuffix, monthInput, monthSuffix);
  dialog.append(dateRow);
  const applyDateBtn = el("button", "primary", "この年月に設定する");
  applyDateBtn.type = "button";
  applyDateBtn.addEventListener("click", () => {
    timeActions.setWorldTime(yearInput.value, monthInput.value);
    renderEraList();
  });
  dialog.append(applyDateBtn);

  // --- 時代区分の管理 ---
  dialog.append(el("h3", "dialog-subhead", "時代区分"));
  dialog.append(el("p", "hint", "「◯年から△△時代」という形で、好きな数だけ時代を設定できます。年月の表示に、今が何時代かが添えられます。"));
  const eraList = el("div", "era-list");
  dialog.append(eraList);

  const newRow = el("div", "time-settings-row");
  const nameInput = document.createElement("input");
  nameInput.placeholder = "時代の名前（例: 江戸時代）";
  const fromInput = document.createElement("input");
  fromInput.type = "number"; fromInput.min = "1"; fromInput.step = "1";
  fromInput.placeholder = "開始年";
  const fromSuffix = el("span", "", "年から");
  newRow.append(nameInput, fromInput, fromSuffix);
  dialog.append(newRow);
  const addEraBtn = el("button", "", "時代を追加");
  addEraBtn.type = "button";
  addEraBtn.addEventListener("click", () => {
    if (!nameInput.value.trim() || !fromInput.value) return;
    editActions.setEra({ name: nameInput.value, fromYear: fromInput.value });
    nameInput.value = ""; fromInput.value = "";
    renderEraList();
  });
  dialog.append(addEraBtn);

  function renderEraList() {
    eraList.replaceChildren();
    const list = editActions.listEras();
    if (!list.length) { eraList.append(el("p", "muted", "まだ時代は設定されていません。")); return; }
    for (const e of list) {
      const row = el("div", "era-row");
      row.append(el("span", "era-row-name", `${e.name}（${e.fromYear}年〜）`));
      const editBtn = el("button", "", "編集");
      editBtn.type = "button";
      editBtn.addEventListener("click", () => {
        nameInput.value = e.name; fromInput.value = String(e.fromYear);
        addEraBtn.textContent = "この内容で更新";
        addEraBtn.onclick = () => {
          if (!nameInput.value.trim() || !fromInput.value) return;
          editActions.setEra({ id: e.id, name: nameInput.value, fromYear: fromInput.value });
          nameInput.value = ""; fromInput.value = "";
          addEraBtn.textContent = "時代を追加";
          addEraBtn.onclick = null;
          renderEraList();
        };
      });
      const delBtn = el("button", "danger", "削除");
      delBtn.type = "button";
      delBtn.addEventListener("click", () => { editActions.removeEra(e.id); renderEraList(); });
      row.append(editBtn, delBtn);
      eraList.append(row);
    }
  }
  renderEraList();

  const actions = el("div", "confirm-dialog-actions");
  const closeBtn = el("button", "primary", "閉じる");
  closeBtn.type = "button";
  actions.append(closeBtn);
  dialog.append(actions);

  document.body.append(dialog);
  const finish = () => { dialog.close(); dialog.remove(); };
  closeBtn.addEventListener("click", finish);
  dialog.addEventListener("cancel", finish);
  dialog.showModal();
}

/** 上部バーの年月表示に出す文字列（時代名があれば併記する） */
export function formatWorldTimeWithEra(map, editActions) {
  const base = formatWorldTime(map.worldTime);
  const era = editActions.eraAt(map.worldTime.year);
  return era ? `${base}\n${era.name}` : base;
}
