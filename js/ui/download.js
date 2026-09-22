// ブラウザのダウンロード（保存ダイアログ）。DOM に触れるので UI 層に置く。
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // すぐ解放すると、環境によってダウンロードが始まる前に無効になる
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** ブラウザ用の Canvas 作成 */
export function createBrowserCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
