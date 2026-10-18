// 簡易言語（v2.7.0）。文化ごとに、音の体系・語順・語根辞書（約60語）を持たせ、地名・人名・神名・宗教名・国名などをそこから作る。
//   ・音節は「子音＋母音＋（語末の子音）」の記号（例: "ka" "shi" "raN"）で持ち、カタカナに描く。音変化は、この記号に規則をかけて行う
//   ・地名は「地形・施設の語根」の組み合わせ（川＋町 など）。語順（修飾語が先／後）と連結の音は、言語ごとに違う
//   ・文化が分かれるとき（親の文化がある）は、親の言語に音変化（濁音化・口蓋化・母音の推移など）をかけ、一部の語を入れ替えて、子の言語にする
//   ・本物の言語の再現ではない。「同じ文化の名前は同じ響きになる」ことと、「近い文化は似た響きになる」ことを出すための道具
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を渡す。
import { validate } from "./katakana.js";

export const CONSONANTS = Object.freeze(["k", "g", "s", "z", "t", "d", "n", "h", "b", "p", "m", "r", "y", "w", "f", "v", "j", "sh", "ch"]);
export const VOWELS = Object.freeze(["a", "i", "u", "e", "o"]);
export const CODAS = Object.freeze(["N", "S", "K", "T", "L", "M"]);
const CODA_KANA = { N: "ン", S: "ス", K: "ク", T: "ト", L: "ル", M: "ム" };
const KANA = {
  "": ["ア", "イ", "ウ", "エ", "オ"], k: ["カ", "キ", "ク", "ケ", "コ"], g: ["ガ", "ギ", "グ", "ゲ", "ゴ"], s: ["サ", "シ", "ス", "セ", "ソ"], z: ["ザ", "ジ", "ズ", "ゼ", "ゾ"],
  t: ["タ", "チ", "ツ", "テ", "ト"], d: ["ダ", "ディ", "ドゥ", "デ", "ド"], n: ["ナ", "ニ", "ヌ", "ネ", "ノ"], h: ["ハ", "ヒ", "フ", "ヘ", "ホ"], b: ["バ", "ビ", "ブ", "ベ", "ボ"],
  p: ["パ", "ピ", "プ", "ペ", "ポ"], m: ["マ", "ミ", "ム", "メ", "モ"], r: ["ラ", "リ", "ル", "レ", "ロ"], y: ["ヤ", "イ", "ユ", "エ", "ヨ"], w: ["ワ", "ウィ", "ウ", "ウェ", "ウォ"],
  f: ["ファ", "フィ", "フ", "フェ", "フォ"], v: ["ヴァ", "ヴィ", "ヴ", "ヴェ", "ヴォ"], j: ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"], sh: ["シャ", "シ", "シュ", "シェ", "ショ"], ch: ["チャ", "チ", "チュ", "チェ", "チョ"],
};
const TOKEN = /^(sh|ch|[kgsztdnhbpmrywfvj])?([aiueo])([NSKTLM])?$/;

/** 概念（語根辞書の見出し）。cat: geo=地形 / place=居住地・施設 / qual=性質 / nat=自然・物 / soc=人・社会 */
export const CONCEPTS = Object.freeze([
  ["river", "川", "geo"], ["mountain", "山", "geo"], ["hill", "丘", "geo"], ["sea", "海", "geo"], ["lake", "湖", "geo"], ["forest", "森", "geo"], ["plain", "野", "geo"], ["island", "島", "geo"],
  ["coast", "浜", "geo"], ["bay", "湾", "geo"], ["cape", "岬", "geo"], ["valley", "谷", "geo"], ["desert", "砂漠", "geo"], ["swamp", "沼", "geo"], ["spring", "泉", "geo"], ["cliff", "崖", "geo"],
  ["town", "町", "place"], ["fort", "城", "place"], ["port", "港", "place"], ["bridge", "橋", "place"], ["market", "市場", "place"], ["village", "村", "place"], ["land", "地・国", "place"], ["holy", "聖地", "place"],
  ["new", "新しい", "qual"], ["old", "古い", "qual"], ["great", "大きな", "qual"], ["small", "小さな", "qual"], ["white", "白", "qual"], ["black", "黒", "qual"], ["red", "赤", "qual"], ["blue", "青", "qual"],
  ["sun", "太陽", "nat"], ["moon", "月", "nat"], ["star", "星", "nat"], ["fire", "火", "nat"], ["water", "水", "nat"], ["stone", "石", "nat"], ["iron", "鉄", "nat"], ["gold", "金", "nat"],
  ["salt", "塩", "nat"], ["wind", "風", "nat"], ["snow", "雪", "nat"], ["tree", "木", "nat"], ["grain", "穀物", "nat"], ["horse", "馬", "nat"], ["wolf", "狼", "nat"], ["bird", "鳥", "nat"],
  ["people", "民", "soc"], ["king", "王", "soc"], ["god", "神", "soc"], ["war", "戦い", "soc"], ["peace", "平和", "soc"], ["house", "家", "soc"], ["child", "子", "soc"], ["north", "北", "soc"],
  ["south", "南", "soc"], ["east", "東", "soc"], ["west", "西", "soc"], ["priest", "祭司", "soc"],
].map(([key, label, cat]) => Object.freeze({ key, label, cat })));
export const CONCEPT_BY_KEY = Object.freeze(Object.fromEntries(CONCEPTS.map((c) => [c.key, c])));
const SHORT = new Set(["river", "sea", "hill", "town", "fort", "port", "land", "fire", "water", "stone", "wind", "tree", "sun", "moon", "god", "king", "war", "house", "child", "spring"]);

// ---------- 音節と語 ----------
export const parseToken = (t) => { const m = TOKEN.exec(t); return m ? { c: m[1] ?? "", v: m[2], coda: m[3] ?? "" } : null; };
export const formatToken = ({ c, v, coda }) => `${c}${v}${coda ?? ""}`;
export const renderToken = (t) => { const p = parseToken(t); return p ? KANA[p.c][VOWELS.indexOf(p.v)] + (p.coda ? CODA_KANA[p.coda] : "") : ""; };
/** 語の保存形（"ka.raN" / 手で直した語は "~カナ"）→ トークンの配列（手で直した語は null） */
export const tokensOf = (w) => (typeof w === "string" && !w.startsWith("~") && w ? w.split(".") : null);
/** 語 → カタカナ */
export const renderWord = (w) => (typeof w !== "string" ? "" : w.startsWith("~") ? w.slice(1) : w.split(".").map(renderToken).join(""));
export const isRaw = (w) => typeof w === "string" && w.startsWith("~");

const pickSome = (rnd, arr, n) => rnd.shuffle(arr).slice(0, n);

/** 音の体系を作る: 子音 6〜11・母音 3〜5・語末の子音 0〜3 */
export function makePhonology(rnd) {
  const cons = pickSome(rnd, CONSONANTS, rnd.int(6, 11));
  const vows = ["a", ...pickSome(rnd, ["i", "u", "e", "o"], rnd.int(2, 4))];
  const codas = rnd.chance(0.75) ? pickSome(rnd, CODAS, rnd.int(1, 3)) : [];
  return { cons, vows, codas };
}

function syllable(phon, rnd, { allowV = true, coda = false } = {}) {
  const c = allowV && rnd.chance(0.12) ? "" : rnd.pick(phon.cons);
  const v = rnd.pick(phon.vows);
  const cd = coda && phon.codas.length && rnd.chance(0.45) ? rnd.pick(phon.codas) : "";
  return formatToken({ c, v, coda: cd });
}

/** 語を1つ作る（syl 音節）。同じ音節の連続や、不自然な仮名の並びは避ける */
export function makeWord(phon, rnd, syl = 2) {
  for (let i = 0; i < 40; i++) {
    const toks = [];
    for (let k = 0; k < syl; k++) toks.push(syllable(phon, rnd, { allowV: k === 0, coda: k === syl - 1 }));
    if (toks.some((t, k) => k && t === toks[k - 1])) continue;
    const kana = toks.map(renderToken).join("");
    if (validate(kana, { min: 1, max: 8 })) return toks.join(".");
  }
  return `${rnd.pick(phon.cons)}${rnd.pick(phon.vows)}`;
}

// ---------- 言語を作る ----------
/** 新しい言語。id は文化の番号 */
export function createLanguage(rnd, id) {
  const phon = makePhonology(rnd), lex = {}, used = new Set();
  for (const c of CONCEPTS) {
    let w = ""; for (let i = 0; i < 30; i++) { w = makeWord(phon, rnd, SHORT.has(c.key) ? rnd.int(1, 2) : rnd.int(2, 2)); if (!used.has(w)) break; }
    used.add(w); lex[c.key] = w;
  }
  const proper = Array.from({ length: 16 }, () => makeWord(phon, rnd, rnd.chance(0.65) ? 2 : 3));
  const ends = (n) => Array.from({ length: n }, () => makeWord(phon, rnd, 1));
  const lang = {
    v: 1, id, parent: null, order: rnd.chance(0.7) ? "MH" : "HM", link: rnd.pick(["", "", "", "no", "a", "i", "u"]),
    lex, proper, male: ends(3), female: ends(3), clan: ends(2), changes: [], edited: {},
  };
  lang.phon = phonOf(lang);
  return lang;
}

/** 言語で実際に使われている子音・母音・語末の子音（表示用） */
export function phonOf(lang) {
  const cons = new Set(), vows = new Set(), codas = new Set();
  const take = (w) => { for (const t of tokensOf(w) ?? []) { const p = parseToken(t); if (!p) continue; if (p.c) cons.add(p.c); vows.add(p.v); if (p.coda) codas.add(p.coda); } };
  for (const w of Object.values(lang.lex ?? {})) take(w);
  for (const w of [...(lang.proper ?? []), ...(lang.male ?? []), ...(lang.female ?? []), ...(lang.clan ?? [])]) take(w);
  const ord = (set, all) => all.filter((x) => set.has(x));
  return { cons: ord(cons, CONSONANTS), vows: ord(vows, VOWELS), codas: ord(codas, CODAS) };
}

// ---------- 音変化 ----------
const mapToken = (t, fn) => { const p = parseToken(t); if (!p) return t; return formatToken(fn({ ...p })); };
/** 音変化の規則。fn は {c, v, coda, next} を受けて変えたものを返す（next = 次の音節の子音。語中の環境に使う） */
export const SOUND_CHANGES = Object.freeze([
  { key: "voicing", label: "k・t・p が濁って g・d・b になる", fn: (p) => ({ ...p, c: { k: "g", t: "d", p: "b" }[p.c] ?? p.c }) },
  { key: "devoicing", label: "g・d・b が澄んで k・t・p になる", fn: (p) => ({ ...p, c: { g: "k", d: "t", b: "p" }[p.c] ?? p.c }) },
  { key: "lenition", label: "s が h に弱まる", fn: (p) => ({ ...p, c: p.c === "s" ? "h" : p.c === "sh" ? "h" : p.c }) },
  { key: "palatal", label: "i・e の前で k が ch に、g が j になる（口蓋化）", fn: (p) => (["i", "e"].includes(p.v) ? { ...p, c: { k: "ch", g: "j" }[p.c] ?? p.c } : p) },
  { key: "raise", pos: "final", label: "語末の母音で、o が u に、e が i に高くなる", fn: (p) => ({ ...p, v: { o: "u", e: "i" }[p.v] ?? p.v }) },
  { key: "lower", pos: "final", label: "語末の母音で、a が o に、u が o に変わる", fn: (p) => ({ ...p, v: { a: "o", u: "o" }[p.v] ?? p.v }) },
  { key: "front", pos: "final", label: "語末の母音で、a が e に、o が e に変わる", fn: (p) => ({ ...p, v: { a: "e", o: "e" }[p.v] ?? p.v }) },
  { key: "codaloss", label: "語末の子音が落ちる（n は残る）", fn: (p) => ({ ...p, coda: p.coda === "N" ? "N" : "" }) },
  { key: "wv", label: "w が v になる", fn: (p) => ({ ...p, c: p.c === "w" ? "v" : p.c }) },
  { key: "hf", label: "h が f になる", fn: (p) => ({ ...p, c: p.c === "h" ? "f" : p.c }) },
  { key: "rd", label: "r が d になる", fn: (p) => ({ ...p, c: p.c === "r" ? "d" : p.c }) },
  { key: "ny", label: "n が m になる", fn: (p) => ({ ...p, c: p.c === "n" ? "m" : p.c }) },
]);
const OPPOSED = [["voicing", "devoicing"], ["raise", "lower"], ["lower", "front"], ["raise", "front"]];

const applyChange = (word, rule) => { const toks = tokensOf(word); if (!toks) return word; return toks.map((t, i) => (rule.pos === "final" && i !== toks.length - 1 ? t : mapToken(t, rule.fn))).join("."); };

/**
 * 親の言語から、子の言語を作る。音変化を 3つ（互いに打ち消さないもの）かけ、一部の語を新しい語に入れ替える。
 * 手で直した語（"~カナ"）はそのまま。系統は parent に、かけた規則は changes に残る。
 */
export function deriveLanguage(parent, rnd, id) {
  const picked = [], VOWEL_RULES = ["raise", "lower", "front"];
  for (const r of rnd.shuffle(SOUND_CHANGES)) {
    if (picked.length >= 3) break;
    if (VOWEL_RULES.includes(r.key) && picked.some((q) => VOWEL_RULES.includes(q.key))) continue; // 母音の変化は多くの語に及ぶので、1つまで（親子の語が似たままになる）
    if (picked.some((q) => OPPOSED.some(([a, b]) => (a === q.key && b === r.key) || (a === r.key && b === q.key)))) continue;
    picked.push(r);
  }
  const apply = (w) => picked.reduce((x, r) => applyChange(x, r), w);
  const lang = JSON.parse(JSON.stringify(parent));
  lang.id = id; lang.parent = parent.id; lang.v = 1;
  lang.changes = [...(parent.changes ?? []).map((c) => ({ ...c, from: c.from ?? parent.id })), ...picked.map((r) => ({ key: r.key, label: r.label, from: id }))];
  for (const k of Object.keys(lang.lex)) lang.lex[k] = apply(lang.lex[k]);
  for (const f of ["proper", "male", "female", "clan"]) lang[f] = lang[f].map(apply);
  // 語の入れ替え（借用・新語）。約15%
  const phon = phonOf(lang), keys = Object.keys(lang.lex);
  for (const k of keys) if (!isRaw(lang.lex[k]) && rnd.chance(0.12)) lang.lex[k] = makeWord({ cons: phon.cons.length ? phon.cons : ["k", "r", "s"], vows: phon.vows.length ? phon.vows : ["a", "i", "u"], codas: phon.codas }, rnd, SHORT.has(k) ? rnd.int(1, 2) : 2);
  lang.edited = Object.fromEntries(keys.filter((k) => isRaw(lang.lex[k])).map((k) => [k, 1])); // 手で直した語は、そのまま引き継ぐ
  if (rnd.chance(0.12)) lang.order = lang.order === "MH" ? "HM" : "MH";
  if (rnd.chance(0.2)) lang.link = rnd.pick(["", "no", "a", "i", "u"]);
  lang.phon = phonOf(lang);
  return lang;
}

// ---------- 語と名前 ----------
export const wordOf = (lang, key) => renderWord(lang?.lex?.[key]);
const link = (lang) => (lang?.link ? renderToken(lang.link === "no" ? "no" : lang.link) : "");
const joinWords = (lang, mod, head) => (lang.order === "HM" ? head + link(lang) + mod : mod + link(lang) + head);
const okName = (n, max = 9) => validate(n, { min: 2, max });

/**
 * 地名。features は地形の概念（river・coast・mountain・hill・forest・plain・island・valley・desert・swamp・lake など）。
 *   地形があれば、「その地形の語 ＋ 居住地の語」（川の町・山の砦）にする。無ければ、固有の語根 ＋ 居住地の語。
 */
export function placeName(lang, rnd, features = [], { size = "town" } = {}) {
  const heads = ["town", "fort", "village", "market", ...(features.includes("coast") || features.includes("bay") || features.includes("island") ? ["port", "port"] : []), ...(features.includes("river") ? ["bridge"] : [])];
  const head = size === "village" ? "village" : size === "capital" ? rnd.pick(["town", "holy", "fort"]) : rnd.pick(heads);
  const geo = features.filter((f) => CONCEPT_BY_KEY[f]?.cat === "geo");
  for (let i = 0; i < 30; i++) {
    let n;
    const roll = rnd.next();
    if (geo.length && roll < 0.55) n = joinWords(lang, wordOf(lang, rnd.pick(geo)), wordOf(lang, head));
    else if (roll < 0.85) n = joinWords(lang, renderWord(rnd.pick(lang.proper)), wordOf(lang, head));
    else n = renderWord(rnd.pick(lang.proper)) + (rnd.chance(0.5) ? renderWord(rnd.pick(lang.male)) : "");
    if (okName(n)) return n;
  }
  return renderWord(rnd.pick(lang.proper));
}

/** 人名: 名＋性別の語尾、姓＝語根＋氏族の語尾 */
export function personName(lang, rnd, gender = "m") {
  const ends = gender === "f" ? lang.female : lang.male;
  let g = "", f = "";
  for (let i = 0; i < 40; i++) { g = renderWord(rnd.pick(lang.proper)).slice(0, rnd.int(2, 3)) + renderWord(rnd.pick(ends)); if (okName(g, 8)) break; g = ""; }
  for (let i = 0; i < 40; i++) { f = renderWord(rnd.pick(lang.proper)) + (rnd.chance(0.6) ? renderWord(rnd.pick(lang.clan)) : ""); if (okName(f, 8)) break; f = ""; }
  if (!g) g = renderWord(rnd.pick(lang.proper)); if (!f) f = renderWord(rnd.pick(lang.proper));
  return { given: g, family: f, full: `${g}・${f}`, style: "language" };
}

/** 神名: 自然の語＋語尾（太陽の語＝ソル、など）か、固有の語根 */
export function deityName(lang, rnd) {
  const nat = ["sun", "moon", "star", "fire", "water", "wind", "stone", "wolf", "bird", "snow"];
  for (let i = 0; i < 30; i++) { const n = rnd.chance(0.5) ? wordOf(lang, rnd.pick(nat)) + renderWord(rnd.pick(lang.female.concat(lang.male))) : renderWord(rnd.pick(lang.proper)); if (okName(n, 7)) return n; }
  return renderWord(rnd.pick(lang.proper));
}

/** katakana.js の生成器（国名・宗教名・属州名・同盟名など）に渡せる「系統」。言語の語根・居住地の語から作る */
export function languageStyle(lang, label = "") {
  const heads = [...new Set([...lang.proper, ...["sun", "moon", "star", "fire", "water", "stone", "wind", "wolf", "horse", "salt"].map((k) => lang.lex[k])].map(renderWord))].filter((w) => validate(w, { min: 2, max: 5 }));
  const sylls = [...new Set(lang.proper.flatMap((w) => (tokensOf(w) ?? []).filter((t) => !parseToken(t)?.coda).map(renderToken)))].filter((s) => s.length <= 2).slice(0, 10);
  const tails = [...new Set(["town", "fort", "port", "village", "market", "land", "hill", "valley", "bridge", "holy"].map((k) => wordOf(lang, k)))].filter((w) => w && w.length <= 4);
  return { label: label || "言語", heads: heads.length ? heads : ["アル", "カル"], mids: sylls.length ? sylls : ["ラ", "ネ"], tails: tails.length ? tails : ["ン", "ス"], midChance: 0.3, fromLanguage: true };
}

/** 語根辞書の表（表示・編集画面用）。parent を渡すと、親の語と並べる */
export function lexiconRows(lang, parent = null) {
  return CONCEPTS.map((c) => ({ key: c.key, label: c.label, cat: c.cat, word: renderWord(lang.lex[c.key]), raw: isRaw(lang.lex[c.key]), parentWord: parent ? renderWord(parent.lex[c.key]) : null, edited: !!lang.edited?.[c.key] }));
}

/** 手で直した語を検証する（カタカナ 1〜8 文字） */
export const validWord = (kana) => typeof kana === "string" && validate(kana, { min: 1, max: 8 });
