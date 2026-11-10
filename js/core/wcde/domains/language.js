// v6 M3: 言語・命名。言語ごとに音素（子音・母音）・音節・語末の傾向を持ち、人名・地名・国名はその言語の音から作る。
//   系統: 子言語は親の音素を受け継ぎ、音変化（子音の置換・母音の合流・語末の変化）が起こる。変化は lang.phon.changes に残る（事実）。
//   同じ言語・同じ乱数列からは同じ名前（決定的）。名前の音節は、その言語の音節表に必ず収まる（検査できる）。
import { hashSeed, rngOf } from "../../civ/civ-state.js";
import { VIA } from "../../civ/states.js";
import { composeStateName } from "./naming.js";

// 子音ごとの仮名（ア行〜）。母音は a i u e o の順。w・y は使えない母音がある
const KANA = Object.freeze({ "": "アイウエオ", k: "カキクケコ", g: "ガギグゲゴ", s: "サシスセソ", z: "ザジズゼゾ", t: "タチツテト", d: "ダヂヅデド", n: "ナニヌネノ", h: "ハヒフヘホ", b: "バビブベボ", p: "パピプペポ", m: "マミムメモ", r: "ラリルレロ", y: "ヤ・ユ・ヨ", w: "ワ····" });
const VOWELS = ["a", "i", "u", "e", "o"], CONS = ["k", "g", "s", "z", "t", "d", "n", "h", "b", "p", "m", "r", "w", "y"];
const ok = (c, v) => { const k = KANA[c]; if (!k) return false; const ch = k[VOWELS.indexOf(v)]; return !!ch && ch !== "・" && ch !== "·"; };
const kanaOf = (c, v) => KANA[c][VOWELS.indexOf(v)];
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** 言語の音素の枠。音節表は子音×母音（使える仮名のみ）に、母音のみの音節を加えたもの */
export function syllablesOf(phon) {
  const out = []; for (const v of phon.v) out.push({ c: "", v, kana: kanaOf("", v) });
  for (const c of phon.c) for (const v of phon.v) if (ok(c, v)) out.push({ c, v, kana: kanaOf(c, v) });
  return out;
}
const rootPhon = (id) => { const r = rngOf(hashSeed(id, "phon")); const c = shuffle(r, CONS).slice(0, 6 + Math.floor(r() * 5)), v = shuffle(r, VOWELS).slice(0, 3 + Math.floor(r() * 3)); return { c, v, coda: r() < 0.5, geminate: r() < 0.3, endV: shuffle(r, v).slice(0, 1 + Math.floor(r() * 2)), vowelInitial: Math.round(r() * 25) / 100, changes: [] }; };
/** 子言語: 親を受け継ぎ、音変化を1〜2回 */
const childPhon = (id, parent) => {
  const r = rngOf(hashSeed(id, "change")), p = { ...parent, c: [...parent.c], v: [...parent.v], endV: [...parent.endV], changes: [...parent.changes] }, n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * 4);
    if (k === 0 && p.c.length > 4) { const from = pick(r, p.c), pool = CONS.filter((x) => !p.c.includes(x)); if (pool.length) { const to = pick(r, pool); p.c[p.c.indexOf(from)] = to; p.changes.push({ kind: "shift", from, to }); } }
    else if (k === 1 && p.v.length > 3) { const from = pick(r, p.v), to = pick(r, p.v.filter((x) => x !== from)); p.v = p.v.filter((x) => x !== from); p.endV = p.endV.map((x) => (x === from ? to : x)); p.changes.push({ kind: "merge", from, to }); }
    else if (k === 2) { p.coda = !p.coda; p.changes.push({ kind: "coda", to: p.coda }); }
    else { const pool = VOWELS.filter((x) => !p.v.includes(x)); if (pool.length) { const to = pick(r, pool); p.v.push(to); p.changes.push({ kind: "vowel_gain", to }); } }
  }
  p.endV = [...new Set(p.endV.filter((x) => p.v.includes(x)))]; if (!p.endV.length) p.endV = [p.v[0]];
  return p;
};
/** 言語の音素表（なければ作る。親があれば親から）。決定的で、呼ばれた順序に依らない */
export function ensureProfile(civ, langId) {
  const L = civ.languages[langId]; if (!L) return null; if (L.phon) return L.phon;
  const chain = []; let cur = L; while (cur && !cur.phon) { chain.push(cur); cur = cur.parent ? civ.languages[cur.parent] : null; }
  let base = cur?.phon ?? null;
  for (const l of chain.reverse()) { l.phon = base ? childPhon(l.id, base) : rootPhon(l.id); base = l.phon; l.name = word(rngOf(hashSeed(l.id, "name")), l.phon, 3 + (hashSeed(l.id) % 2), 0) + "語"; }
  return L.phon;
}
/** 音節列から語を作る。同じ音節の連続は避ける。語末に母音の傾向・撥音・促音 */
function word(rng, phon, n, endBias = 0.6) {
  const syl = syllablesOf(phon), parts = []; let prev = null;
  for (let i = 0; i < n; i++) {
    let s, tries = 0; do { s = (i === 0 && rng() >= phon.vowelInitial) ? pick(rng, syl.filter((x) => x.c)) : (rng() < (i === 0 ? phon.vowelInitial : 0.06) ? pick(rng, syl.filter((x) => !x.c)) : pick(rng, syl)); } while (prev && s.kana === prev.kana && ++tries < 6);
    parts.push(s); prev = s;
  }
  if (rng() < endBias) { const last = parts[parts.length - 1], v = pick(rng, phon.endV), c = last.c; if (ok(c, v)) parts[parts.length - 1] = { c, v, kana: kanaOf(c, v) }; }
  let w = parts.map((p) => p.kana).join(""); if (phon.coda && rng() < 0.25) w += "ン"; if (phon.geminate && n >= 3 && rng() < 0.2) w = w.slice(0, 1) + "ッ" + w.slice(1);
  return w;
}
/** 名前を作る。v6.7.0: 長めに。person（3〜4 音節、まれに 5）/ place・state（3〜4 音節、まれに 5）。2〜3 文字の短い名は出さない */
export function nameFor(civ, rng, langId, kind = "person") {
  const phon = ensureProfile(civ, langId); if (!phon) return null;
  const n = 3 + (rng() < (kind === "person" ? 0.4 : 0.45) ? 1 : 0) + (rng() < 0.08 ? 1 : 0);
  return word(rng, phon, n);
}
/** 集団の主な言語（共有の最大の層） */
export const languageOfGroup = (g) => g?.cohorts?.length ? g.cohorts.reduce((b, c) => (c.share > b.share ? c : b)).languageId : null;

/** formState・継承などが使う命名（言語に整合した国名・人名）。言語が無い集団は従来どおり */
export const nameLangOf = (g) => languageOfGroup(g);
/** 言語の国名の語尾（-ニア・-ラン のような）。6割の言語は固有の語尾を持ち、持たない言語は親言語の語尾を受け継ぐ（同じ系統でも枝ごとに分かれ、近縁の国は似た語尾になる） */
function landSuffix(civ, langId) {
  const L = civ.languages[langId]; if (!L) return "";
  const h = hashSeed(L.id, "landsfx");
  if (h % 100 < 60) { const phon = ensureProfile(civ, L.id); return phon ? word(rngOf(h), phon, 1 + ((h >>> 8) % 2), 0.7) : ""; }
  return L.parent && civ.languages[L.parent] ? landSuffix(civ, L.parent) : "";
}
export const nameGen = {
  /** 国号と語根。語根は言語の音から（＋系統の語尾）、称号は政体から（王国・帝国・共和国…） */
  stateParts: (civ, cap, via, rng, polity = "tribal") => { const l = languageOfGroup(cap); if (!l) return null; const nm = nameFor(civ, rng, l, "state"), sfx = landSuffix(civ, l), base = nm.length + sfx.length <= 8 ? nm + sfx : nm; return { base, name: composeStateName(base, polity, via) }; },
  state: (civ, cap, via, rng) => { const l = languageOfGroup(cap); return l ? nameFor(civ, rng, l, "state") + VIA[via].suffix : null; },
  person: (civ, g, rng) => { const l = languageOfGroup(g); return l ? nameFor(civ, rng, l, "person") : null; },
};

/** 月次（culture フェーズ）: 新しい言語に音素表を与え、文化に言語由来の名前を付ける。言語・文化の数が変わった月だけ作業する（毎月の全走査はしない） */
export function stepLanguage(ctx) {
  const { civ } = ctx; if (!civ.options.wcde) return;
  let nl = 0, nc = 0; for (const _ in civ.languages) nl++; for (const _ in civ.cultures) nc++;
  if (ctx._langSig === nl + ":" + nc) return; ctx._langSig = nl + ":" + nc;
  for (const id in civ.languages) if (!civ.languages[id].phon && !civ.languages[id].phonDropped) ensureProfile(civ, id); // v6.9.0: 整理で音素表を落とした言語は作り直さない（必要なとき ensureProfile が作る）
  const byCulture = new Map(); for (const id in civ.languages) { const l = civ.languages[id]; if (l.cultureId && !byCulture.has(l.cultureId)) byCulture.set(l.cultureId, l); }
  for (const id in civ.cultures) { const c = civ.cultures[id]; if (c.nameFixed) continue; const lang = byCulture.get(id); if (!lang?.phon) continue; { const taken = new Set(Object.values(civ.cultures).map((x) => x.name)); let nm = "", k = 0; do { nm = word(rngOf(hashSeed(id, "cname", k)), lang.phon, 3 + (hashSeed(id, k) % 2)) + "人"; } while (taken.has(nm) && ++k < 12); c.name = nm; c.nameFixed = true; } /* v6.7.0: 文化は「〇〇人」に統一（重ならない名前） */ }
}
/** 全体に一度だけ（先史の終わりなど）。名前のない言語・文化を整える */
export function finalizeLanguages(civ) { const prev = civ.options.wcde; civ.options.wcde = true; stepLanguage({ civ }); civ.options.wcde = prev; }
