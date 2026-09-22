// ファイルを開く：ボタン、ファイル選択ダイアログ、ドラッグ＆ドロップ。
import { byId } from "./dom.js";

export function initFileInput({ actions }) {
  const input = byId("file-input");
  const hint = byId("drop-hint");

  const open = () => input.click();
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) actions.openFile(file);
    input.value = ""; // 同じファイルをもう一度選んでも change が発火するように
  });

  // ドラッグ中の表示。子要素を出入りするたびに dragleave が来るため、カウンタで管理する
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; hint.hidden = false; });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; hint.hidden = true;
    const file = e.dataTransfer.files?.[0];
    if (file) actions.openFile(file);
  });

  return { open };
}
