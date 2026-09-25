// ブラウザ標準の alert()/confirm()/prompt() の代替。
// 見た目がアプリのスタイルから浮くのを避けるため、既存の <dialog> スタイル
// （css/components.css の `dialog` / `.wide-dialog` まわり）に乗る形で、
// <dialog> 要素を都度生成して使う。使い終わったら DOM から取り除く。
//
// 呼び出し側は Promise を await する形になる（標準関数と違って同期では返らない）。

function buildDialog({ title, bodyText, showInput, inputValue, okLabel, cancelLabel, danger }) {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";

  if (title) dialog.append(el("h2", null, title));
  if (bodyText) dialog.append(el("p", null, bodyText));

  let input = null;
  if (showInput) {
    input = document.createElement("input");
    input.type = "text";
    input.className = "confirm-dialog-input";
    input.value = inputValue ?? "";
    dialog.append(input);
  }

  const actions = el("div", "confirm-dialog-actions");
  let cancelBtn = null;
  if (cancelLabel !== null) {
    cancelBtn = el("button", "", cancelLabel ?? "キャンセル");
    cancelBtn.type = "button";
    cancelBtn.value = "cancel";
    actions.append(cancelBtn);
  }
  const okBtn = el("button", danger ? "danger" : "primary", okLabel ?? "OK");
  okBtn.type = "button";
  actions.append(okBtn);
  dialog.append(actions);

  document.body.append(dialog);
  return { dialog, input, okBtn, cancelBtn };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** confirm() の代替。OK なら true、キャンセル/Escなら false を解決する Promise を返す */
export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const { dialog, okBtn, cancelBtn } = buildDialog({ bodyText: message, okLabel: opts.okLabel, cancelLabel: opts.cancelLabel, danger: opts.danger });
    const finish = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    okBtn.addEventListener("click", () => finish(true));
    cancelBtn.addEventListener("click", () => finish(false));
    dialog.addEventListener("cancel", () => finish(false)); // Esc
    dialog.showModal();
    okBtn.focus();
  });
}

/** alert() の代替。閉じられたら解決する Promise を返す */
export function alertDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const { dialog, okBtn } = buildDialog({ bodyText: message, okLabel: opts.okLabel ?? "OK", cancelLabel: null });
    const finish = () => { dialog.close(); dialog.remove(); resolve(); };
    okBtn.addEventListener("click", finish);
    dialog.addEventListener("cancel", finish); // Esc
    dialog.showModal();
    okBtn.focus();
  });
}

/** prompt() の代替。OK なら入力文字列、キャンセル/Escなら null を解決する Promise を返す */
export function promptDialog(message, defaultValue = "", opts = {}) {
  return new Promise((resolve) => {
    const { dialog, input, okBtn, cancelBtn } = buildDialog({
      bodyText: message, showInput: true, inputValue: defaultValue,
      okLabel: opts.okLabel, cancelLabel: opts.cancelLabel,
    });
    const finish = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    okBtn.addEventListener("click", () => finish(input.value));
    cancelBtn.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", () => finish(null)); // Esc
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(input.value); } });
    dialog.showModal();
    input.focus();
    input.select();
  });
}
