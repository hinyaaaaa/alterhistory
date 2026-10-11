// 細線 SVG アイコン（1.5px・角丸端・22px 格子）。絵文字をアイコンに使わない（v2.0.0「静かな戦略卓」）。
// 使い方: el("button", "", "@dice") や el("button", "", "@dice 名前を引き直す") のように、
//   文字列の先頭を「@名前」にすると kit.js の el() がアイコン付きで描く。
const P = {
  open: '<path d="M3 7.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1h-7l-2-2.5H4a1 1 0 0 0-1 1.5z"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  export: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 14v5h14v-5"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
  state: '<path d="M6 21V4"/><path d="M6 5h12l-3 4 3 4H6"/>',
  culture: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
  religion: '<path d="M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z"/>',
  province: '<path d="M4 7l8-3 8 3v10l-8 3-8-3z"/><path d="M4 7l8 3 8-3M12 10v10"/>',
  diplomacy: '<path d="M3 12l5-4 4 2 4-2 5 4"/><path d="M8 8l-1 7 3 2M16 8l1 7-3 2"/>',
  war: '<path d="M5 19L18 6M15 5h4v4"/><path d="M19 19L6 6M9 5H5v4"/>',
  military: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
  economy: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.6-2.5 2-2.5 1-2.5 2 1 1.8 2.5 1.8 2.5-.8 2.5-1.8"/>',
  timeline: '<path d="M4 12h16"/><circle cx="7" cy="12" r="1.6"/><circle cx="13" cy="12" r="1.6"/><path d="M7 12V7M13 12v5M18 12V8"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="15" r=".8"/><circle cx="12" cy="12" r=".8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  nuclear: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2L8 3.6a9 9 0 0 1 8 0zM13.6 13l4.2 6.6a9 9 0 0 1-3.6-6.2zM10.4 13l-4.2 6.6a9 9 0 0 0 3.6-6.2z" transform="rotate(0)"/>',
  covert: '<path d="M3 11h18M6 11l1.5-5h9L18 11"/><circle cx="8" cy="15.5" r="2.5"/><circle cx="16" cy="15.5" r="2.5"/>',
  tree: '<path d="M12 20V10M12 10l-5-3M12 10l5-3M12 14l-4 2M12 14l4 2"/><circle cx="7" cy="6" r="1.5"/><circle cx="17" cy="6" r="1.5"/><circle cx="12" cy="4" r="1.5"/>',
  pin: '<path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2 6-5 6-2.5 0-4-1.5-5-3.5l-2-3.5a1.4 1.4 0 0 1 2.3-1.5L8 13"/>',
  select: '<path d="M6 4l12 7-5 1.5L11 18z"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.5v.5"/>',
  capital: '<path d="M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5"/>',
  town: '<path d="M5 20v-8l7-5 7 5v8z"/><path d="M10 20v-4h4v4"/>',
  peace: '<path d="M4 15c3-1 4-5 8-5s5 4 8 5"/><path d="M12 10V5M10 7l2-2 2 2"/>',
  eraser: '<path d="M7 17l-3-3 9-9 6 6-6 6z"/><path d="M11 19h9"/>',
  note: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h6"/>',
  terrain: '<path d="M3 19l6-10 4 6 3-4 5 8z"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.5"/>',
};

export const ICON_NAMES = Object.keys(P);

/** SVG 文字列。currentColor で描くので、文字色にそろう。 */
export function icon(name, size = 18) {
  const body = P[name];
  if (!body) throw new Error(`未定義のアイコン: ${name}`);
  return `<svg class="ico ico-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** 「@dice」「@dice ラベル」形式の文字列を解釈する。アイコン指定でなければ null。 */
export function parseIconText(text) {
  if (typeof text !== "string" || text[0] !== "@") return null;
  const m = /^@([a-z-]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!m || !P[m[1]]) return null;
  return { name: m[1], label: m[2] ?? "" };
}
