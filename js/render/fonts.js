// フォントの一元管理。
//   地図の文字 … 明朝系（古地図・地図帳の雰囲気。国名・地名は太め、属州名は字間を広げて細め）
//   画面の操作部品 … 角ゴシック系（小さくても読みやすい）
// どちらも「Web フォント → 端末に入っている日本語フォント → 汎用」の順に探す。
// Web フォントが読めない環境（オフライン）では、Windows なら游明朝・游ゴシックに自動で切り替わる。

export const FONT_PLACE = '"Shippori Mincho","Noto Serif JP","Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif CJK JP","MS PMincho",serif';
export const FONT_UI = '"Noto Sans JP","Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans CJK JP",sans-serif';

const FACES = ['500 16px "Shippori Mincho"', '700 16px "Shippori Mincho"', '800 16px "Shippori Mincho"'];

/**
 * 地図に出てくる文字を、Web フォントで使える状態にしてから onReady を呼ぶ。
 * 日本語の Web フォントは文字の範囲ごとに分割して配信されるため、実際に使う文字を指定して読み込む。
 * （canvas の文字描画は、足りない範囲のフォントを自動では読み込まないため）
 */
export function loadMapFonts(text, onReady) {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve(false);
  const sample = [...new Set(String(text))].join("") || "あア亜";
  return Promise.all(FACES.map((f) => document.fonts.load(f, sample)))
    .then((r) => { const got = r.some((x) => x.length); if (got) onReady?.(); return got; })
    .catch(() => false);
}
