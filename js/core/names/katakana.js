// カタカナ名の仮生成器（地名・国家名・宗教名・文化名・属州名）。
//
// 方式: 系統（style）ごとに「頭(head)・中(mid)・尾(tail)」の音節片を持ち、組み合わせて名前を作る。
//   例) western: アル + ド + ブルク → アルドブルク
// 音節片はすべて手で書いた有効なカタカナなので、組み合わせても不正な仮名は生じない。
// そのうえで validate() が「同じ音の連続」「撥音の直後の長音」等の不自然な並びを弾く。
//
// これは「仮」の名前を出すための道具であり、実在の言語の正確な再現ではない。
// 出てきた名前はユーザーが自由に直す前提（core/edit/naming.js が「仮」フラグを管理する）。
//
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を渡す。

/** 名前の系統。key は保存データ(ext.data.nameStyles)にも使うので、変えない */
export const NAME_STYLES = Object.freeze({
  western: {
    label: "西欧風",
    heads: ["アル", "エル", "オル", "カル", "ケル", "ダル", "テル", "ノル", "バル", "ベル", "マル", "メル", "サル", "ハル", "ブラン", "グレン", "ウィン", "ヴァル", "フェル", "ロス", "ゲル", "カン"],
    mids: ["ド", "ラ", "ネ", "タ", "セ", "レ", "ガ", "ミ"],
    tails: ["ン", "ス", "ト", "ニア", "ランド", "ブルク", "ハイム", "フォード", "トン", "ヴィル", "ディア", "ミア", "ドール", "シア", "ウェイ", "ポート"],
    midChance: 0.35,
  },
  nordic: {
    label: "北欧風",
    heads: ["ソル", "ヨル", "ハル", "ヴァル", "グン", "スカル", "ビョル", "トル", "ウル", "フロ", "スヴェ", "ヘル", "ロク", "アス", "ダグ"],
    mids: ["ガ", "ヴィ", "ル", "ナ", "ト", "ダ"],
    tails: ["ヘイム", "ガルド", "ヴィーク", "ホルム", "ネス", "ボルグ", "ランド", "フィヨルド", "スタッド", "ダール", "ヴァ", "ル"],
    midChance: 0.25,
  },
  latin: {
    label: "ラテン風",
    heads: ["ロ", "カ", "ウァ", "ティ", "ポ", "セ", "アウ", "ル", "ヴェ", "ミ", "ク", "ノ", "ア", "ヴィ", "コル"],
    mids: ["ル", "ミ", "ナ", "ト", "ポ", "ク", "レ", "セ", "ラ", "リ"],
    tails: ["ウム", "ニウム", "ティア", "ナ", "ニア", "ポリス", "ウス", "ラ", "ケア", "ディア", "ミア"],
    midChance: 0.7,
  },
  arabic: {
    label: "中東風",
    heads: ["アル", "ダ", "ハ", "カ", "ミ", "サ", "ラ", "バ", "ジャ", "ファ", "ムハ", "ザ", "タ", "イス"],
    mids: ["ル", "ラ", "ミ", "フ", "ハ", "シ", "ク", "ズ", "ナ"],
    tails: ["バード", "ダード", "ハン", "ラーン", "スタン", "ハーラ", "ジール", "ール", "ーン", "ミール", "カンド", "ーフ", "ラ"],
    midChance: 0.6,
  },
  slavic: {
    label: "スラヴ風",
    heads: ["ヴォ", "ズ", "ブ", "ク", "ノ", "ポ", "ス", "ト", "ミ", "ペ", "ゴ", "ドブ", "ヴラ", "ボ", "ヴェ"],
    mids: ["ロ", "リ", "ラ", "ス", "ヴ", "ダ", "ミ", "ト", "ガ", "ザ"],
    tails: ["グラード", "スク", "ヴィチ", "ニク", "ポリ", "ヴァ", "ゴロド", "スラフ", "ニツァ", "ヴォ", "ノフ", "ビル"],
    midChance: 0.6,
  },
  elvish: {
    label: "エルフ風",
    heads: ["ラ", "リ", "エ", "ア", "シ", "ナ", "イ", "ミ", "フ", "ル", "セ", "ティ"],
    mids: ["リ", "ナ", "エ", "ラ", "ミ", "ソ", "ヴィ", "レ", "ア", "イ", "ル"],
    tails: ["エル", "ニエル", "ソリア", "リエル", "ナディア", "ミラ", "ローン", "ウェン", "ドリル", "リス", "ディル", "シア", "ール"],
    midChance: 0.9,
  },
  yamato: {
    label: "和風（カナ）",
    heads: ["ヤマ", "カワ", "ミズ", "タケ", "シラ", "クロ", "アオ", "ハナ", "トヨ", "アサ", "ナラ", "ミナ", "サク", "ホタ", "イズ", "ツキ"],
    mids: ["ノ", "ミ", "カ", "シ", "ハ", "ト"],
    tails: ["シマ", "ガワ", "ザキ", "ヤマ", "ノミヤ", "ダ", "ハラ", "ウラ", "ミヤ", "ギ", "サト", "ゴク", "タニ"],
    midChance: 0.2,
  },
});

export const STYLE_KEYS = Object.freeze(Object.keys(NAME_STYLES));
export const DEFAULT_STYLE = "western";
export const isStyle = (k) => Object.prototype.hasOwnProperty.call(NAME_STYLES, k);

// ---------- 検証 ----------

const KATAKANA_ONLY = /^[ァ-ヴー]+$/;
const SMALL_START = /^[ァィゥェォャュョッンー]/;

/** 仮名として不自然な名前を弾く（trueなら採用可） */
export function validate(name, { min = 2, max = 9 } = {}) {
  if (typeof name !== "string" || !KATAKANA_ONLY.test(name)) return false;
  if (name.length < min || name.length > max) return false;
  if (SMALL_START.test(name)) return false;
  if (/ンー|ッー|ーッ/.test(name)) return false;
  if (/(.)\1/.test(name)) return false; // 同じ字の連続（アア・ンン・ーー等）
  if (/^(.{1,3})\1/.test(name)) return false; // 冒頭の繰り返し（ヴォヴォ等）
  return true;
}

// ---------- 生成の本体 ----------

function cfg(style) {
  return NAME_STYLES[isStyle(style) ? style : DEFAULT_STYLE];
}

/** 頭 + (中) + 尾 を1回組み立てる。妥当でなければ null */
function assemble(rnd, style, { shortTail = false, noTail = false } = {}) {
  const s = cfg(style);
  let prefix = rnd.pick(s.heads);
  if (rnd.chance(s.midChance)) prefix += rnd.pick(s.mids);
  if (noTail) return prefix;
  const tails = shortTail ? s.tails.filter((t) => t.length <= 2) : s.tails;
  const tail = rnd.pick(tails);
  // 接ぎ目で同じ音が重なる（…ル + ル…）のは不自然なので避ける
  if (prefix.at(-1) === tail[0]) return null;
  return prefix + tail;
}

/** 有効な名前が出るまで繰り返す（上限あり）。最後まで出なければ頭だけの名前 */
function make(rnd, style, opts = {}) {
  for (let i = 0; i < 60; i++) {
    const n = assemble(rnd, style, opts);
    if (n && validate(n, { max: opts.max ?? 9 })) return n;
  }
  // 出なければ、その系統の頭だけを使う（頭は必ず有効）
  const heads = cfg(style).heads.filter((h) => validate(h) && h.length <= (opts.max ?? 9));
  return rnd.pick(heads.length ? heads : cfg(style).heads);
}

/** 地名（都市・地方名のもと） */
export function generatePlaceName(rnd, style) {
  return make(rnd, style);
}

/** 神名など、短めの固有名 */
export function generateShortName(rnd, style) {
  return make(rnd, style, { shortTail: rnd.chance(0.6), max: 6 });
}

// 国家の政体: label = 名前に付く語, form/formName = Azgaar形式の項目
const COMMON_FORMS = [
  { w: 30, suffix: "王国", form: "Monarchy", formName: "Kingdom" },
  { w: 12, suffix: "帝国", form: "Monarchy", formName: "Empire" },
  { w: 10, suffix: "公国", form: "Monarchy", formName: "Duchy" },
  { w: 14, suffix: "共和国", form: "Republic", formName: "Republic" },
  { w: 6, suffix: "連邦", form: "Federation", formName: "Federation" },
  { w: 5, suffix: "神聖国", form: "Theocracy", formName: "Theocracy" },
  { w: 6, suffix: "侯国", form: "Monarchy", formName: "Principality" },
  { w: 5, suffix: "辺境伯領", form: "Monarchy", formName: "March" },
];
const EXTRA_FORMS = {
  arabic: [
    { w: 14, suffix: "首長国", form: "Monarchy", formName: "Emirate" },
    { w: 12, suffix: "スルタン国", form: "Monarchy", formName: "Sultanate" },
    { w: 8, suffix: "カリフ国", form: "Theocracy", formName: "Caliphate" },
  ],
  yamato: [{ w: 10, suffix: "皇国", form: "Monarchy", formName: "Empire" }],
};

/** 選べる政体の一覧（UI・テスト用） */
export function stateForms(style) {
  return [...COMMON_FORMS, ...(EXTRA_FORMS[style] ?? [])];
}

/**
 * 国家名。short は「アルビオン」、name は「アルビオン王国」。
 * form を指定すると（stateForms の suffix か formName）その政体にする。
 */
export function generateStateName(rnd, style, form) {
  // 国名は地名より少し短い方が収まりがよいので、尾は短いものを優先する
  const stem = rnd.chance(0.5) ? make(rnd, style, { shortTail: true, max: 6 }) : make(rnd, style, { max: 6 });
  const forms = stateForms(style);
  const chosen = (form && forms.find((f) => f.suffix === form || f.formName === form)) ?? rnd.weighted(forms, forms.map((f) => f.w));
  return { short: stem, name: stem + chosen.suffix, form: chosen.form, formName: chosen.formName };
}

const RELIGION_KINDS = [
  { w: 40, type: "Organized", make: (d, r) => (r.chance(0.65) ? { name: d + "教", form: "Church" } : { name: d + "教会", form: "Church" }) },
  { w: 30, type: "Folk", make: (d, r) => (r.chance(0.6) ? { name: d + "信仰", form: "Animism" } : { name: d + "崇拝", form: "Shamanism" }) },
  { w: 20, type: "Cult", make: (d) => ({ name: d + "教団", form: "Cult" }) },
  { w: 10, type: "Heresy", make: (d) => ({ name: d + "派", form: "Sect" }) },
];

/** 宗教名。deity（神名）を核に「◯◯教」「◯◯信仰」などを作る */
export function generateReligionName(rnd, style) {
  const deity = generateShortName(rnd, style);
  const kind = rnd.weighted(RELIGION_KINDS, RELIGION_KINDS.map((k) => k.w));
  const { name, form } = kind.make(deity, rnd);
  return { name, deity, type: kind.type, form };
}

/** 文化名（◯◯人） */
export function generateCultureName(rnd, style) {
  return generateShortName(rnd, style) + "人";
}

const PROVINCE_SUFFIX = [["州", 4], ["地方", 3], ["領", 3]];

/** 属州名（◯◯州・◯◯地方・◯◯領） */
export function generateProvinceName(rnd, style) {
  const stem = make(rnd, style, { shortTail: true, max: 6 });
  return stem + rnd.weighted(PROVINCE_SUFFIX.map((p) => p[0]), PROVINCE_SUFFIX.map((p) => p[1]));
}

// ---------- 最高神・同盟・ゾーン・時代 ----------

const DEITY_EPITHETS = ["天空神", "太陽神", "月神", "大地母神", "海神", "戦神", "創造神", "運命神", "豊穣神", "冥府神", "風神", "炎神", "知恵の神", "光の神", "星神"];

/** 宗教の最高神の名前。「アルヴァ」のような固有名か、「太陽神ソルディア」のように称号つき */
export function generateDeityName(rnd, style) {
  const name = generateShortName(rnd, style);
  return rnd.chance(0.4) ? rnd.pick(DEITY_EPITHETS) + name : name;
}

const ALLIANCE_SUFFIX = [["同盟", 10], ["連合", 8], ["協商", 4], ["盟約", 4], ["条約機構", 3], ["共栄圏", 2], ["協約", 3], ["連盟", 5]];

/** 同盟の名前（◯◯同盟・◯◯連合・◯◯条約機構 など） */
export function generateAllianceName(rnd, style) {
  const stem = make(rnd, style, { shortTail: true, max: 6 });
  return stem + rnd.weighted(ALLIANCE_SUFFIX.map((x) => x[0]), ALLIANCE_SUFFIX.map((x) => x[1]));
}

// ゾーンの種類 → 名前の付け方（zones.js の ZONE_TYPES と同じ id）
const ZONE_PATTERNS = {
  Invasion: ["{s}侵攻", "{s}遠征", "{s}大侵攻"],
  Rebels: ["{s}の乱", "{s}反乱", "{s}蜂起"],
  Proselytism: ["{s}布教", "{s}の教え", "{s}改宗運動"],
  Crusade: ["{s}聖戦", "{s}十字軍", "{s}の聖戦"],
  Disease: ["{s}疫病", "{s}熱", "{s}の疫"],
  Disaster: ["{s}大災害", "{s}の災厄", "{s}の惨禍"],
  Eruption: ["{s}山噴火", "{s}の大噴火"],
  Avalanche: ["{s}雪崩", "{s}大雪崩"],
  Fault: ["{s}断層帯", "{s}大地溝"],
  Flood: ["{s}大洪水", "{s}の氾濫"],
  Tsunami: ["{s}大津波", "{s}沖津波"],
  Fire: ["{s}大火", "{s}の業火"],
  Custom: ["{s}地域", "{s}の地", "{s}圏"],
};

/** ゾーンの名前。種類に合わせた語尾が付く（疫病なら「◯◯疫病」、反乱なら「◯◯の乱」） */
export function generateZoneName(rnd, style, type = "Custom") {
  const stem = make(rnd, style, { shortTail: true, max: 6 });
  return rnd.pick(ZONE_PATTERNS[type] ?? ZONE_PATTERNS.Custom).replace("{s}", stem);
}

const ERA_PATTERNS = ["{s}時代", "{s}の世", "{s}朝", "{s}期", "{s}紀"];

/** 時代区分の名前（◯◯時代・◯◯紀 など） */
export function generateEraName(rnd, style) {
  return rnd.pick(ERA_PATTERNS).replace("{s}", make(rnd, style, { shortTail: true, max: 6 }));
}
