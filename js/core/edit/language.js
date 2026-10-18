// 簡易言語の、地図との結び付け（v2.7.0）。言語そのものの作り方は core/names/language.js。
//   ・保存先: ext.data.languages = { [文化ID]: 言語 }。保存されていない文化は、シード（地図のシード＋文化番号）から同じものを作り直せる
//     （同じ地図なら、いつ作っても同じ言語になる。手で直したときと、月送りのときに保存する）
//   ・文化に起源（origins: 親の文化）があれば、親の言語に音変化をかけて子の言語にする（文化が分かれるときの音変化）
//   ・地名・人名・神名・宗教名・国名などは、その文化の言語から作る（naming.js・person.js が使う）
// 純粋ロジック層：DOM に依存しない。
import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { withEvent } from "./history-log.js";
import { createRandom } from "../random.js";
import { createLanguage, deriveLanguage, languageStyle, placeName, personName, deityName, renderWord, validWord, makeWord, CONCEPT_BY_KEY, phonOf } from "../names/language.js";

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export const listLanguages = (map) => map?.ext?.data?.languages ?? {};
const writeLanguages = (m, t) => { const x = ensureExt(m); if (Object.keys(t).length) x.data.languages = t; else delete x.data.languages; };

const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seedOf = (map, id, salt = "") => hash(`lang|${map.meta?.seed ?? ""}|${id}|${salt}`);

/** 文化の親（起源の最初の、生きている文化）。無ければ null */
export function parentCultureOf(map, cultureId) {
  const c = map.pack.cultures?.[cultureId];
  for (const o of c?.origins ?? []) if (o > 0 && o !== cultureId && isLive(map.pack.cultures[o])) return o;
  return null;
}

const memo = new WeakMap();
/**
 * 文化の言語。保存されていればそれ、無ければシードから作る（保存はしない）。文化 0（無人の地）や存在しない文化は null。
 */
export function getLanguage(map, cultureId, depth = 0) {
  if (!(cultureId > 0) || !isLive(map.pack.cultures?.[cultureId])) return null;
  const saved = listLanguages(map)[cultureId]; if (saved) return saved;
  const parent = depth < 12 ? parentCultureOf(map, cultureId) : null;
  const key = `${cultureId}:${parent ?? 0}`;
  let m = memo.get(map); if (!m || m.ref !== map.ext?.data?.languages) { m = { ref: map.ext?.data?.languages, t: new Map() }; memo.set(map, m); }
  if (m.t.has(key)) return m.t.get(key);
  const pl = parent ? getLanguage(map, parent, depth + 1) : null;
  const lang = pl ? deriveLanguage(pl, createRandom(seedOf(map, cultureId, "derive")), cultureId) : createLanguage(createRandom(seedOf(map, cultureId)), cultureId);
  m.t.set(key, lang);
  return lang;
}

/** 国の言語（国の文化。無ければ首都の文化） */
export function languageOfState(map, st) {
  const sid = typeof st === "number" ? st : st?.i, s = map.pack.states[sid]; if (!isLive(s)) return null;
  let cid = s.culture; if (!(cid > 0)) { const cap = map.pack.burgs?.[s.capital]; cid = cap?.culture ?? map.pack.cells?.culture?.[cap?.cell] ?? 0; }
  return getLanguage(map, cid);
}
export const languageAtCell = (map, cell) => getLanguage(map, map.pack.cells?.culture?.[cell] ?? 0);

/** その実体（都市・国・属州・宗教・文化）の文化の番号。辿れなければ 0 */
export function cultureOfEntity(map, kind, id) {
  const P = map.pack;
  if (kind === "culture") return id;
  if (kind === "burg") { const b = P.burgs?.[id]; return b?.culture ?? P.cells?.culture?.[b?.cell] ?? 0; }
  if (kind === "state") return P.states?.[id]?.culture ?? 0;
  if (kind === "province") return P.states?.[P.provinces?.[id]?.state]?.culture ?? 0;
  if (kind === "religion") return P.religions?.[id]?.culture ?? 0;
  return 0;
}

// Azgaar の標高・バイオームから、その場所の地形（言語の語根の見出し）を求める
const BIOME_FEATURE = { 1: "desert", 2: "desert", 3: "plain", 4: "plain", 5: "forest", 6: "forest", 7: "forest", 8: "forest", 9: "forest", 12: "swamp" };
export function featuresAt(map, cell) {
  const C = map.pack.cells, out = [];
  if (!C || !(cell >= 0)) return out;
  if ((C.r?.[cell] ?? 0) > 0) out.push("river");
  if (C.t?.[cell] === 1) out.push("coast");
  const h = C.h?.[cell] ?? 0; if (h >= 70) out.push("mountain"); else if (h >= 50) out.push("hill");
  const b = BIOME_FEATURE[C.biome?.[cell]]; if (b) out.push(b);
  return out;
}

/** 言語から、種類に合う名前を1つ作る。言語が無ければ null。kind: burg・state・culture・religion・province */
export function languageName(map, { kind, id, cell, cultureId, rnd }) {
  const cid = cultureId ?? (id != null ? cultureOfEntity(map, kind, id) : cell != null ? map.pack.cells?.culture?.[cell] ?? 0 : 0);
  const lang = getLanguage(map, cid); if (!lang) return null;
  if (kind === "burg") { const c = cell ?? map.pack.burgs?.[id]?.cell; return { lang, name: placeName(lang, rnd, featuresAt(map, c)) }; }
  return { lang, style: languageStyle(lang, `${map.pack.cultures[cid].name}語`) };
}
export { languageStyle, personName, deityName, renderWord };

// ---------- 保存・編集 ----------
const clone = (o) => JSON.parse(JSON.stringify(o));
const part = (before, after) => ({ apply: (m) => writeLanguages(m, after), revert: (m) => writeLanguages(m, before) });

/** 読み込んだとき、保存されていない文化の言語を、保存形式に書き足す（年表には残さない）。書き足した数 */
export function ensureLanguagesDirect(map) {
  const data = ensureExt(map).data; let n = 0;
  for (const c of map.pack.cultures ?? []) {
    if (!isLive(c) || data.languages?.[c.i]) continue;
    const lang = getLanguage(map, c.i); if (!lang) continue;
    data.languages = data.languages ?? {}; data.languages[c.i] = lang; n++;
  }
  return n;
}

/**
 * 保存されていない文化に言語を作る（月ごとの更新で、新しくできた文化のため）。親がある文化は「分かれた」として年表に残る。
 * @returns {{command:object, created:number[]}|null}
 */
export function planEnsureLanguages(map, date = null) {
  const before = listLanguages(map), after = { ...before }, created = [];
  const when = date ?? map.worldTime ?? { year: 1, month: 1 };
  const initial = !Object.keys(before).length; // 最初の一括の保存では、年表に残さない（既存の地図の文化が一斉に「分かれた」ことになるのを避ける）
  let cmd = null;
  const order = (map.pack.cultures ?? []).filter((c) => isLive(c) && !before[c.i]);
  for (const c of order) { const l = getLanguage({ ...map, ext: { ...map.ext, data: { ...map.ext?.data, languages: after } } }, c.i); if (l) { after[c.i] = clone(l); created.push(c.i); } }
  if (!created.length) return null;
  cmd = makeCommand("言語の誕生", [], [part(before, after)]);
  for (const id of created) {
    const l = after[id], parent = l.parent ? map.pack.cultures[l.parent] : null, c = map.pack.cultures[id];
    if (!parent || initial) continue;
    cmd = withEvent(map, cmd, { type: "language", title: `${c.fullName ?? c.name}の言葉が、${parent.fullName ?? parent.name}の言葉から分かれた`, detail: (l.changes ?? []).filter((x) => x.from === id).map((x) => x.label).join(" / "), date: when, data: { culture: id, parent: l.parent } });
  }
  return { command: cmd, created };
}

function edit(map, cultureId, fn, label) {
  const lang = getLanguage(map, cultureId); if (!lang) throw new Error("その文化の言語がありません");
  const before = listLanguages(map), next = clone(lang); fn(next); next.phon = phonOf(next);
  return makeCommand(label, [], [part(before, { ...before, [cultureId]: next })]);
}

/** 語根辞書の語を、手で直す（カタカナ 1〜8 文字）。語が変わらなければ null */
export function planSetLanguageWord(map, cultureId, key, kana) {
  if (!CONCEPT_BY_KEY[key]) throw new Error(`未知の見出しです: ${key}`);
  const k = String(kana ?? "").trim(); if (!validWord(k)) throw new Error("カタカナ 1〜8 文字で入力してください（同じ字の連続は使えません）");
  const lang = getLanguage(map, cultureId); if (!lang) throw new Error("その文化の言語がありません");
  if (renderWord(lang.lex[key]) === k && lang.edited?.[key]) return null;
  return edit(map, cultureId, (l) => { l.lex[key] = `~${k}`; l.edited = { ...l.edited, [key]: 1 }; }, `語の変更（${CONCEPT_BY_KEY[key].label}）`);
}

/** 語を、その言語の音の体系で作り直す（手で直した印は外れる） */
export function planRerollLanguageWord(map, cultureId, key, rnd) {
  if (!CONCEPT_BY_KEY[key]) throw new Error(`未知の見出しです: ${key}`);
  const lang = getLanguage(map, cultureId); if (!lang) throw new Error("その文化の言語がありません");
  const ph = phonOf(lang);
  return edit(map, cultureId, (l) => { const used = new Set(Object.values(l.lex)); let w = ""; for (let i = 0; i < 20; i++) { w = fresh(ph, rnd, key); if (!used.has(w)) break; } l.lex[key] = w; const e = { ...l.edited }; delete e[key]; l.edited = e; }, `語の作り直し（${CONCEPT_BY_KEY[key].label}）`);
}
const fresh = (ph, rnd, key) => makeWord({ cons: ph.cons.length ? ph.cons : ["k", "r", "s", "t"], vows: ph.vows.length ? ph.vows : ["a", "i", "u"], codas: ph.codas }, rnd, ["river", "sea", "hill", "town", "fort", "port", "land", "fire", "water", "stone"].includes(key) ? rnd.int(1, 2) : 2);

/** 言語を丸ごと作り直す（親があれば親から音変化、無ければ新規）。手で直した語は失われる */
export function planRegenerateLanguage(map, cultureId, rnd) {
  if (!isLive(map.pack.cultures?.[cultureId])) throw new Error("その文化がありません");
  const before = listLanguages(map), parent = parentCultureOf(map, cultureId), pl = parent ? getLanguage(map, parent) : null;
  const lang = pl ? deriveLanguage(pl, rnd, cultureId) : createLanguage(rnd, cultureId);
  return makeCommand("言語の作り直し", [], [part(before, { ...before, [cultureId]: lang })]);
}
