// DOM ヘルパー。存在しない要素を黙って無視せず、すぐ気づけるようにする。
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素 #${id} が見つかりません（index.html を確認してください）`);
  return el;
}
