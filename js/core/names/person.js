// 人名の生成（指導者用）。名前の系統は毎回ランダム（「〇〇風」の指定はしない）。性別で語尾を変え、名前と性別が食い違わないようにする。
// 純粋ロジック層：DOM に依存しない。
import { NAME_STYLES, STYLE_KEYS, validate } from "./katakana.js";
import { personName } from "./language.js";

const MALE_TAILS = ["ス", "ル", "ン", "ト", "ド", "オ", "ク", "ム", "ノ", "ロ"];
const FEMALE_TAILS = ["ア", "ナ", "ラ", "ミ", "ネ", "リア", "ティ", "ヌ", "ーナ", "レ"];

function given(rnd, style, gender) {
  const s = NAME_STYLES[style];
  const tails = gender === "f" ? FEMALE_TAILS : MALE_TAILS;
  for (let i = 0; i < 80; i++) {
    let n = rnd.pick(s.heads);
    if (rnd.chance(s.midChance)) n += rnd.pick(s.mids);
    const t = rnd.pick(tails);
    if (n.at(-1) === t[0]) continue;
    n += t;
    if (validate(n, { max: 8 })) return n;
  }
  return rnd.pick(s.heads);
}
function family(rnd, style) {
  const s = NAME_STYLES[style];
  for (let i = 0; i < 80; i++) {
    let n = rnd.pick(s.heads) + (rnd.chance(0.6) ? rnd.pick(s.mids) : "") + rnd.pick(["ン", "ス", "ル", "ト", "ー", "ド", "ク", "ニ"]);
    if (validate(n, { max: 8 })) return n;
  }
  return rnd.pick(s.heads);
}

/** @returns {{given:string, family:string, full:string, style:string}} 「名・姓」 */
export function generatePersonName(rnd, gender = "m", style = null, lang = null) {
  if (lang) return personName(lang, rnd, gender); // 文化の言語があれば、その言語の響きで作る（v2.7.0）
  const st = style && NAME_STYLES[style] ? style : rnd.pick(STYLE_KEYS);
  const g = given(rnd, st, gender), f = family(rnd, st);
  return { given: g, family: f, full: `${g}・${f}`, style: st };
}
