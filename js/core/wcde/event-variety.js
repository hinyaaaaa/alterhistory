// v6.21.0: 出来事の「舞台」と「事件名」。
//   同じ出来事でも、起きた場所（その国の集落）と関わった人物（その土地の言語の名前）が毎回ちがう。見出しは固有の事件名（「ヴァルナ港の乱」「〇〇暗殺事件」など）。
//   すべて決定的（同じ世界・同じ月・同じ国なら同じ名前）。担当国の決断には payload.v に入れて、選んだあとの年表でも同じ名前を使う。
import { hashSeed } from "../civ/civ-state.js";
import { byState } from "../civ/spatial.js";
import { placeName } from "./warfare.js";

const R = (civ, st, ev, ...k) => (hashSeed(civ.historySeed, "evv", st.id, ev.id, civ.monthIndex, ...k) % 1000003) / 1000003;
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** 出来事の型（arch）ごとの事件名。{place} 場所／{person} 人物／{L} 指導者／{s} 国名 */
const INCIDENT_BY_ARCH = {
  person: ["{person}の台頭", "{place}の{person}", "{person}の名声"],
  tragedy_royal: ["{person}事件", "{place}の悲劇", "{place}宮廷事件"],
  coup_threat: ["{place}の変", "{person}の変", "{place}政変"],
  succession_crisis: ["{place}継承問題", "{person}擁立事件", "{place}の後継争い"],
  crisis: ["{place}の危機", "{place}騒擾", "{place}の動揺"],
  diplomacy_chance: ["{place}会談", "{person}の使節団", "{place}の使節"],
  war_threat: ["{place}の危機", "{place}国境事件", "{place}の緊張"],
  border: ["{place}国境事件", "{place}の小競り合い", "{person}の越境"],
  opportunity_war: ["{place}の好機", "{place}の隙", "{place}問題"],
  reform: ["{place}の改革", "{person}の改革", "{place}の新法"],
  rebel_peasant: ["{place}の乱", "{person}の乱", "{place}一揆"],
  rebel_noble: ["{place}の叛乱", "{person}の陰謀", "{place}の謀反"],
  fiscal: ["{place}の財政難", "{place}の徴税問題", "{person}の帳簿"],
  omen: ["{place}の怪異", "{place}の兆し", "{place}の異変"],
  religion_move: ["{place}の宗教騒動", "{person}の説教", "{place}の教団問題"],
  trade_boom: ["{place}の交易", "{place}の富", "{place}市場"],
  culture_boom: ["{place}の栄え", "{person}の作品", "{place}の文化"],
  tech_boom: ["{person}の発明", "{place}の新技術", "{place}の工夫"],
  plague: ["{place}の疫病", "{place}の大疫", "{place}の熱病"],
  famine: ["{place}の飢饉", "{place}の凶作", "{place}の飢え"],
  disaster: ["{place}の大災", "{place}の災厄", "{place}の惨事"],
};
/** 個別の事件名（型より優先） */
const INCIDENT_BY_ID = {
  dictator_assassination: ["{L}暗殺事件", "{place}の凶行", "{person}の凶刃"],
  assassin_attempt: ["{L}暗殺未遂事件", "{place}毒殺未遂事件"],
  king_sudden_death: ["{L}急逝", "{place}の急報"],
  beloved_leader_dies: ["{L}の死", "{place}の喪"],
  gen_coup: ["{person}のクーデター", "{place}の変"],
  palace_coup: ["{place}宮廷の変", "{person}の宮廷クーデター"],
  acclaimed_emperor: ["{person}推戴事件", "{place}の推戴"],
  deposed_king: ["{L}廃位事件", "{place}の廃立"],
  dynasty_fall: ["{place}の易姓", "{person}への禅譲"],
  revolution_breaks: ["{place}革命", "{place}蜂起"],
  civil_war_outbreak: ["{place}内戦", "{person}の内乱"],
  peasant_revolt: ["{place}の乱", "{person}の乱"],
  noble_conspiracy: ["{place}の陰謀", "{person}の謀反"],
  hero_general: ["{person}の凱歌", "{place}の英雄"],
  gen_rise: ["{place}の防衛", "{person}の初陣"],
  traitor_general: ["{person}の内通", "{place}の内通事件"],
  border_clash: ["{place}国境事件", "{place}の小競り合い"],
  naval_incident: ["{place}沖事件", "{place}沖の衝突"],
  plague_wave: ["{place}の大疫", "{place}の黒い病"],
  great_famine: ["{place}の大飢饉", "{place}の飢えの年"],
  earthquake: ["{place}大地震", "{place}の揺れ"],
  flood_great: ["{place}大洪水", "{place}の濁流"],
  volcano_erupts: ["{place}の噴火", "{place}の灰"],
  religious_war: ["{place}の宗教戦争", "{person}の聖戦"],
  reformation_preacher: ["{person}の説教", "{place}の改革運動"],
  inquisitor_zeal: ["{person}の審問", "{place}の審問"],
  defeat_humiliation: ["{place}の敗北", "{place}の屈辱"],
  miracle_victory: ["{place}の奇跡", "{person}の寡兵"],
  great_general_dies: ["{person}戦死", "{place}の訃報"],
  new_sea_route: ["{person}の航海", "{place}航路"],
  strike_wave: ["{place}のストライキ", "{place}の大争議"],
  student_protest: ["{place}の抗議", "{person}の演説"],
  election_fraud: ["{place}の票", "{place}選挙事件"],
  hostage_incident: ["{place}人質事件", "{person}の拘束"],
  royal_marriage_love: ["{person}との恋", "{place}の婚礼"],
  fratricide: ["{place}の兄弟殺し", "{person}の凶事"],
  pretender_appears: ["{person}の偽王事件", "{place}の偽王"],
  king_mad: ["{L}の発狂", "{place}宮廷の闇"],
  omen_comet: ["{place}の彗星", "{place}の尾を引く星"],
  omen_eclipse: ["{place}の日食", "{place}の暗い昼"],
};
/** 場面の一文（本文の末尾に足す）。分野ごと */
const SCENE_BY_CAT = {
  ppl: ["舞台は{place}。関わったのは{person}という人物である。", "{place}の人々のあいだで、{person}の名が語られはじめた。", "{place}に住む{person}が、この件の中心にいた。"],
  dyn: ["{place}の宮廷で、{person}らが成り行きを見守っている。", "{person}をはじめ、{place}の重臣たちが動きを探っている。", "急報は{place}から{person}の手で届けられた。"],
  cou: ["火種は{place}にあった。{person}の名が取り沙汰されている。", "{place}では、{person}の周りに人が集まりはじめている。", "最初の知らせは{place}から届き、{person}の関わりがささやかれた。"],
  dip: ["使節の{person}が、{place}を通って知らせをもたらした。", "{place}で、{person}が相手方と顔を合わせている。", "窓口は{place}。{person}が取り次いでいる。"],
  war: ["前線の{place}では、{person}の名が噂されている。", "{place}の守りを預かる{person}が、報告を寄せた。", "知らせは{place}の{person}から届いた。"],
  rel: ["{place}の{person}が、人々の関心を集めている。", "この件は{place}の{person}を中心に広がった。", "{place}では、{person}を囲む人の輪ができている。"],
  eco: ["{place}の{person}が、その実情を訴えた。", "{place}の市場では、{person}の話でもちきりである。", "報告は{place}の役人、{person}から上がった。"],
  dis: ["被害がとくに大きかったのは{place}である。", "{place}の{person}が、惨状を伝えてきた。", "{place}では、{person}が人々を率いて対応にあたっている。"],
  cul: ["{place}の{person}が、その中心にいる。", "{place}で、{person}の名が知られるようになった。", "話は{place}の{person}から始まった。"],
  odd: ["最初に見たのは{place}の{person}だという。", "{place}では、{person}の証言が広まっている。", "噂の出どころは{place}、{person}の話である。"],
};
const COURT = new Set(["tragedy_royal", "succession_crisis", "coup_threat"]);

/** 出来事 1 回ぶんの「舞台」: { place, person, person2, incident（{L} {s} は未展開）, scene } */
export function varOf(ctx, st, ev) {
  const { civ } = ctx, gs = (byState(ctx).get(st.id) ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)), cap = civ.groups[st.capitalGroupId];
  const gAt = (k) => (COURT.has(ev.arch) || ev.cat === "dyn" ? cap ?? gs[0] : gs.length ? gs[Math.min(gs.length - 1, Math.floor(R(civ, st, ev, "g", k) * gs.length))] : cap);
  const g1 = gAt(1), g2 = R(civ, st, ev, "g2") < 0.5 ? g1 : gAt(2);
  const place0 = g1 ? placeName(ctx, g1) : st.name, place = place0 === "名もなき地" ? st.name : place0;
  const who = (g, k) => ctx.nameGen?.person(civ, g, rngOf(hashSeed(civ.historySeed, "evp", st.id, ev.id, civ.monthIndex, k))) ?? `${st.name}の人`;
  const person = who(g2 ?? g1, 1);
  let person2 = who(g1, 2), n = 0; while (person2 === person && n++ < 3) person2 = who(g1, 2 + n);
  const incidents = INCIDENT_BY_ID[ev.id] ?? INCIDENT_BY_ARCH[ev.arch] ?? ["{place}事件"];
  return { place, person, person2, incident: pick(incidents, R(civ, st, ev, "inc")), scene: pick(SCENE_BY_CAT[ev.cat] ?? SCENE_BY_CAT.ppl, R(civ, st, ev, "scene")) };
}
