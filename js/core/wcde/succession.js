// v6.19.0: 継承法（史実から 13 型）と、継承候補のバリエーション。要件 §10。
//   ・国ごとの継承法は、政体と文化（国の履歴の種）から決まる。政体が変わったら、その政体にふさわしい継承法へ引き直す（継承法だけを単独で変える操作はない）。
//   ・候補は「全員が王の子」にならない: 嫡出・庶子・王の兄弟・甥・将軍・宰相・養子・外国から迎えた婿・聖職者・摂政の傀儡・簒奪者・選挙で推された貴族・部族長。
//   ・candidates の形は decisions.js の継承の決断（enthrone に渡す形）と同じ: { id, relation, name, bornAt, ageYears, skill, legit, backer, kin, risk, minor }
import { hashSeed } from "../civ/civ-state.js";
import { lifeScale } from "../civ/species.js";
import { regimeOf, REGIMES } from "./regimes.js";
import { leaderRng } from "./domains/naming.js";

const r3 = (x) => Math.round(x * 1000) / 1000, clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/** 候補の続柄: [表示名, 正統性, 支持する勢力, 同じ家系か, 年齢の下限, 年齢の上限, 能力の下限, 能力の幅] */
export const RELATIONS = Object.freeze({
  son: ["嫡出の長男", 0.75, "nobility", true, 8, 34, 0.3, 0.55],
  daughter: ["嫡出の長女", 0.62, "nobility", true, 10, 34, 0.3, 0.55],
  youngest: ["末子", 0.7, "nobility", true, 6, 24, 0.3, 0.55],
  bastard: ["庶子", 0.4, "military", true, 14, 38, 0.3, 0.55],
  brother: ["王の弟", 0.55, "nobility", true, 24, 45, 0.3, 0.55],
  nephew: ["甥（兄弟の子）", 0.5, "nobility", true, 12, 30, 0.3, 0.55],
  uterine: ["母方の甥", 0.58, "nobility", true, 14, 34, 0.3, 0.55],
  adopted: ["養子", 0.55, "bureaucrats", true, 16, 40, 0.35, 0.5],
  son_in_law: ["外国から迎えた婿", 0.42, "merchants", false, 20, 40, 0.35, 0.5],
  general: ["軍が推す将軍", 0.3, "military", false, 35, 50, 0.5, 0.4],
  vizier: ["宰相", 0.3, "bureaucrats", false, 38, 58, 0.45, 0.45],
  cleric: ["聖職者", 0.35, "clergy", false, 35, 60, 0.4, 0.45],
  usurper: ["野心ある有力者", 0.2, "military", false, 30, 50, 0.55, 0.4],
  noble: ["貴族の推す人物", 0.55, "nobility", false, 28, 55, 0.35, 0.5],
  khan: ["有力な部族長", 0.6, "clans", true, 24, 50, 0.4, 0.5],
  council: ["評議員", 0.5, "bureaucrats", false, 35, 60, 0.4, 0.45],
  merchant: ["有力な商人", 0.45, "merchants", false, 32, 58, 0.4, 0.45],
  secretary: ["党の幹部", 0.4, "bureaucrats", false, 36, 60, 0.45, 0.45],
});

/** 継承法: 型ごとの、現れやすい続柄の重み。risk＝選ばれなかった者が争いを起こす火種の強さ */
export const SUCCESSION_LAWS = Object.freeze({
  primogeniture: { ja: "長子相続", blurb: "最年長の嫡出の子が継ぐ。子がなければ兄弟・甥へ。", rels: { son: 3, daughter: 0.8, bastard: 0.5, brother: 1.2, nephew: 0.8, adopted: 0.3 }, risk: 0.05 },
  salic: { ja: "男系限定（サリカ法）", blurb: "男系の男子だけが継ぐ。娘と、女系は継げない。", rels: { son: 3, bastard: 0.6, brother: 1.6, nephew: 1.2, adopted: 0.2 }, risk: 0.08 },
  cognatic: { ja: "女性継承を認める相続", blurb: "性別に関わらず、最年長の子が継ぐ。", rels: { son: 2, daughter: 2.4, bastard: 0.3, brother: 0.8, nephew: 0.6, son_in_law: 0.6 }, risk: 0.07 },
  ultimogeniture: { ja: "末子相続", blurb: "家を守る末の子が継ぎ、年長の子は独立する。", rels: { youngest: 3, son: 1, brother: 0.6, nephew: 0.5 }, risk: 0.1 },
  partible: { ja: "分割相続", blurb: "子らで領土を分ける。国は割れやすい。", rels: { son: 2.4, youngest: 1.6, brother: 0.8, bastard: 0.5 }, risk: 0.18, partition: true },
  tanistry: { ja: "兄弟相続（タニストリー）", blurb: "一族の中で最も力ある成年者が継ぐ。兄弟が先に継ぎ、子は後になる。", rels: { brother: 3, nephew: 1.6, son: 1, khan: 0.6 }, risk: 0.14 },
  fratricidal: { ja: "兄弟殺しを伴う継承", blurb: "決まりがなく、継承者を決めるのは勝者。敗れた兄弟は生き残れない。", rels: { son: 2, brother: 2, bastard: 1.2, usurper: 0.8, general: 0.6 }, risk: 0.35 },
  elective: { ja: "選挙君主制", blurb: "有力者が集まり、王を選ぶ。", rels: { noble: 3, son: 1, brother: 0.8, cleric: 0.8, general: 0.8, merchant: 0.6 }, risk: 0.1 },
  kurultai: { ja: "クリルタイ（部族会議）", blurb: "部族の長たちが集まって、可汗を推戴する。", rels: { khan: 3, brother: 1.2, son: 1.4, general: 0.8 }, risk: 0.15 },
  designation: { ja: "指名・養子による継承", blurb: "王が生前に、血筋を問わず後継を指名し、養子に迎える。", rels: { adopted: 3, son: 1.4, vizier: 1, general: 0.8, nephew: 0.8, cleric: 0.5 }, risk: 0.08 },
  uterine: { ja: "母方の甥への継承", blurb: "姉妹の子（母系）が継ぐ。", rels: { uterine: 3, brother: 1.2, nephew: 1, son: 0.6 }, risk: 0.08 },
  usurpation: { ja: "力による継承（簒奪）", blurb: "決まりがなく、権力を握った者が立つ。", rels: { general: 2.4, usurper: 2, vizier: 1.2, noble: 1, cleric: 0.6 }, risk: 0.3 },
  election: { ja: "選挙・合議による選出", blurb: "議会・評議会が代表を選ぶ。世襲ではない。", rels: { council: 2.4, general: 1, merchant: 1.4, vizier: 1.2, cleric: 0.6, noble: 1 }, risk: 0.04 },
  party: { ja: "党・幹部会による選出", blurb: "党の幹部会が指導者を決める。", rels: { secretary: 3, general: 1.2, vizier: 1, usurper: 0.5 }, risk: 0.14 },
});
export const LAW_IDS = Object.freeze(Object.keys(SUCCESSION_LAWS));

/** 政体ごとの継承法の候補（重み）。文化（国の履歴の種）で 1 つに決まる */
const BY_REGIME = {
  tribal: { kurultai: 3, tanistry: 2, elective: 1 }, chiefdom: { tanistry: 3, primogeniture: 1.4, elective: 1, kurultai: 1 }, city_state: { elective: 2, primogeniture: 1.5, election: 1.4 },
  theocracy: { designation: 2.4, uterine: 1.4, primogeniture: 1 }, clerical_state: { election: 2, designation: 1.6 }, kingdom: { primogeniture: 3, salic: 2, cognatic: 1, ultimogeniture: 0.5, partible: 1, fratricidal: 0.7, tanistry: 0.5 },
  empire: { primogeniture: 2, fratricidal: 1.6, designation: 1.6, salic: 1.2, cognatic: 0.8 }, feudal: { partible: 2, salic: 2, primogeniture: 2 }, elective_monarchy: { elective: 4 },
  despotism: { fratricidal: 2.4, designation: 1.4, primogeniture: 1.4, usurpation: 1 }, constitutional_monarchy: { cognatic: 3, primogeniture: 3 },
  oligarchic_republic: { election: 4 }, direct_democracy: { election: 4 }, merchant_republic: { election: 4 }, confederation: { election: 4 }, parliamentary: { election: 4 }, presidential: { election: 4 }, adv_direct_democracy: { election: 4 }, technocracy: { election: 3, party: 1 },
  anarchist: { election: 4 }, junta: { usurpation: 3, party: 1 }, one_party: { party: 4 }, socialist: { party: 4 }, totalitarian: { party: 3, usurpation: 1.4 },
};
const pickWeighted = (table, u) => { const ents = Object.entries(table), tot = ents.reduce((a, [, w]) => a + w, 0); let x = u * tot; for (const [k, w] of ents) { x -= w; if (x <= 0) return k; } return ents[ents.length - 1][0]; };

/** 国の継承法。政体が変わったら引き直す（st.succLaw = { regime, law }。政体変更に付随して変わる） */
export function lawOf(civ, st) {
  const rg = regimeOf(st), cur = st.succLaw; if (cur && cur.regime === rg && SUCCESSION_LAWS[cur.law]) return cur.law;
  const tab = BY_REGIME[rg] ?? (REGIMES[rg]?.heredity ? { primogeniture: 1 } : { election: 1 }), u = (hashSeed(civ.historySeed, "slaw", st.id, rg) % 100000) / 100000;
  st.succLaw = { regime: rg, law: pickWeighted(tab, u), since: civ.monthIndex }; return st.succLaw.law;
}
export const lawJa = (civ, st) => SUCCESSION_LAWS[lawOf(civ, st)].ja;

/** 継承候補（決定的。同じ月・同じ国なら同じ顔ぶれ）。{ law, list } を返す。list は継承者（指名）→法に沿った続柄の順 */
export function successionList(ctx, st, n = 4) {
  const { civ } = ctx, mi = civ.monthIndex, ls = lifeScale(civ, st), law = lawOf(civ, st), L = SUCCESSION_LAWS[law], fkeys = Object.keys(st.politics?.factions ?? {}), has = (k) => fkeys.includes(k);
  const u = (...k) => (hashSeed(civ.historySeed, "sl", st.id, mi, ...k) % 1000003) / 1000003, person = (k) => ctx.nameGen?.person(civ, civ.groups[st.capitalGroupId], leaderRng(civ, st, `sc${k}${mi}`)) ?? `${st.name}の人${k}`;
  const ageM = (y) => Math.round(y * 12 * ls), heirFig = st.heirFigureId ? civ.figures?.[st.heirFigureId] : null, list = [], used = new Set();
  const make = (rel, k) => {
    const [ja, legit0, backer0, kin, a0, a1, s0, s1] = RELATIONS[rel], age = Math.round(a0 + (a1 - a0) * u("age", rel, k)), fav = (L.rels[rel] ?? 0) >= 2 ? 0.12 : 0, backer = backer0 === "clergy" && !has("clergy") ? "nobility" : backer0 === "clans" && !has("clans") ? "nobility" : backer0 === "bureaucrats" && !has("bureaucrats") ? "nobility" : backer0 === "merchants" && !has("merchants") ? "nobility" : backer0;
    const legit = r3(clamp(legit0 + fav + (kin ? 0 : -0.02) + (u("lg", rel) - 0.5) * 0.12)), risk = r3(clamp(L.risk + (["brother", "nephew", "uterine", "bastard", "usurper"].includes(rel) ? 0.1 : 0) + (legit < 0.4 ? 0.12 : 0) - 0.04 * (legit > 0.65 ? 1 : 0), 0, 0.8));
    return { id: rel, relation: ja, name: person(k), bornAt: mi - ageM(age), ageYears: age, skill: r3(s0 + s1 * u("sk", rel, k)), legit, backer, kin, risk, minor: age < 16 && ["son", "daughter", "youngest", "nephew", "uterine"].includes(rel), foreign: rel === "son_in_law" };
  };
  if (heirFig && !["elective", "election", "party", "usurpation", "kurultai"].includes(law)) { const age = Math.max(1, Math.round((mi - heirFig.bornAt) / 12 / ls)); list.push({ id: "heir", relation: "指名された継承者", name: heirFig.name, bornAt: heirFig.bornAt, ageYears: age, skill: r3(0.35 + 0.5 * u("heir")), legit: 0.9, backer: "nobility", kin: true, risk: 0.02, minor: age < 16 }); used.add("heir"); }
  const rels = Object.entries(L.rels).filter(([r]) => !(r === "bastard" && u("bs") < 0.3)); let k = 0;
  while (list.length < n && rels.length) { const tot = rels.reduce((a, [, w]) => a + w, 0); let x = u("pk", k) * tot, i = 0; for (; i < rels.length; i++) { x -= rels[i][1]; if (x <= 0) break; } const [rel] = rels.splice(Math.min(i, rels.length - 1), 1)[0]; list.push(make(rel, ++k)); }
  if (!list.some((c) => !c.minor)) list.push(make(L.rels.general ? "general" : "brother", 9)); // 成人の候補がいなければ、摂政の傀儡にならない者を 1 人加える
  return { law, lawJa: L.ja, blurb: L.blurb, partition: !!L.partition, list: list.slice(0, 5) };
}

/** 国の出来事の待ち行列（連鎖・継承の火種）。events.js が毎月見る */
export function queueEvent(st, id, delayMonths, mi, extra = null) { (st.evq ??= []).push({ id, at: mi + Math.max(1, Math.round(delayMonths)), ...(extra ? { x: extra } : {}) }); if (st.evq.length > 24) st.evq.shift(); }
