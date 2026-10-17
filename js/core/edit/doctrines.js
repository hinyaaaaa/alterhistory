// 軍事ドクトリン（陸・海・空の共通ツリー）と技術ドクトリン（6分野のツリー）。
//   どちらも「解禁条件なし」で、ユーザーが自由に選ぶ。
//   軍事ドクトリン: 総合方針（units.js の DOCTRINES から1つ）＋ 陸・海・空の各段から1つずつ ＋ 政体固有。
//     選んだ節（state.doctrineNodes）は、総合方針の効果に重ねて合成し、既存の戦闘計算にそのまま渡す。
//   技術ドクトリン: 農業・工業・交通・通信・医療・エネルギーの各分野で到達段（1〜10）を選ぶ（state.techDoctrine）。
//     従来の「技術水準」の後継。techLevel は技術ドクトリンから導いた値を同時に書く（戦闘・経済・軍の計算がそのまま使える）。
//     技術水準の自動進行は無い。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "./commands.js";
import { DOCTRINE_BY_KEY, DEFAULT_DOCTRINE } from "../sim/units.js";
import { REGIME_BY_KEY, regimeOf } from "./regimes.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

// ---------- 軍事ドクトリンの節 ----------
// 効果の略記: inf 歩兵 / cav 騎兵 / arc 弓兵 / art 砲兵 / arm 機甲 / air 航空 / nav 海軍 / spc 特殊 / adv 先端（倍率の増減）、atk 攻め / def 守り（戦力ボーナス）、mor 士気の崩れやすさ（<0で崩れにくい）、con 徴兵
const FX = { inf: "infantry", cav: "cavalry", arc: "archers", art: "artillery", arm: "armor", air: "air", nav: "navy", spc: "special", adv: "advanced" };
export const BRANCHES = Object.freeze([{ key: "land", label: "陸" }, { key: "sea", label: "海" }, { key: "air", label: "空" }]);
export const TIER_LABEL = Object.freeze(["古代・中世", "火器の登場", "近世", "近代", "機械化", "現代"]);
const T = (branch, tier, a, b, c) => [a, b, c].map(([label, desc, fx], i) => ({ key: `${branch}.${tier}.${"abc"[i]}`, branch, tier, label, desc, fx }));
export const TREE_NODES = Object.freeze([
  ...T("land", 1, ["密集戦列", "槍と盾で隊列を組む。", { inf: .1, def: .03 }], ["騎馬突撃", "騎兵の衝撃力に頼る。", { cav: .15, atk: .03 }], ["籠城と山城", "拠点に拠って守る。", { def: .08, inf: .05 }]),
  ...T("land", 2, ["火縄銃隊", "火器を持った歩兵の斉射。", { inf: .12, art: .05 }], ["要塞線", "稜堡式の要塞で国境を固める。", { def: .1 }], ["軽装機動", "身軽に動いて敵の後ろを突く。", { cav: .08, inf: .04, mor: -.05 }]),
  ...T("land", 3, ["線形戦術", "射撃を整然と重ねる。", { inf: .1, art: .08 }], ["国民皆兵", "国民全体を兵にする。", { con: .15, mor: .05 }], ["砲兵集中", "大砲を一点に集める。", { art: .18, inf: -.03 }]),
  ...T("land", 4, ["塹壕戦", "掘り固めて消耗戦に持ち込む。", { def: .12, inf: .06 }], ["浸透戦術", "小部隊が隙間から入り込む。", { spc: .15, atk: .04 }], ["総動員", "産業と人口を戦争に振り向ける。", { con: .2, art: .05, mor: .05 }]),
  ...T("land", 5, ["機甲突破", "戦車と航空で防衛線を割る。", { arm: .2, atk: .06 }], ["縦深防御", "層を重ねて受け止める。", { def: .12, arm: .06 }], ["機械化歩兵", "歩兵を車両で運ぶ。", { inf: .1, arm: .1 }]),
  ...T("land", 6, ["統合火力", "砲・航空・電子戦を一体で動かす。", { adv: .15, art: .1 }], ["非対称戦", "ゲリラと特殊部隊で粘る。", { spc: .2, mor: -.1 }], ["精密打撃", "遠くから正確に叩く。", { adv: .2, air: .08 }]),
  ...T("sea", 1, ["ガレー船団", "漕ぎ手の船で沿岸を押さえる。", { nav: .08 }], ["沿岸防衛", "港と砲台で海を守る。", { def: .05, nav: .04 }], ["商船武装", "商船に武器を積む。", { nav: .06, con: .05 }]),
  ...T("sea", 2, ["大砲搭載艦", "舷側砲を並べた帆走艦。", { nav: .12 }], ["私掠", "民間船に敵を襲わせる。", { nav: .06, atk: .02 }], ["港湾要塞", "要塞化した軍港。", { def: .08, nav: .05 }]),
  ...T("sea", 3, ["戦列艦", "艦隊が一列に並んで撃ち合う。", { nav: .15 }], ["封鎖戦", "海上交通を断つ。", { nav: .1, atk: .02 }], ["海兵隊", "艦から上陸して戦う。", { nav: .05, spc: .1 }]),
  ...T("sea", 4, ["装甲艦", "鉄で覆った艦。", { nav: .15, def: .02 }], ["潜水艦戦", "水中から通商を襲う。", { nav: .1, spc: .05 }], ["巡洋艦通商破壊", "足の速い艦で海上交通を襲う。", { nav: .12, atk: .03 }]),
  ...T("sea", 5, ["大艦巨砲", "巨大な戦艦の砲戦で勝負する。", { nav: .2 }], ["空母機動部隊", "空母の航空力で海を支配する。", { nav: .15, air: .1 }], ["護衛と対潜", "船団を守り潜水艦を狩る。", { nav: .1, def: .04 }]),
  ...T("sea", 6, ["ミサイル艦隊", "長射程の誘導兵器で戦う。", { nav: .15, adv: .15 }], ["原子力潜水艦", "長く潜れる戦略潜水艦。", { nav: .12, adv: .1 }], ["沿岸拒否", "敵艦を近づけない。", { def: .08, adv: .1 }]),
  ...T("air", 1, ["飛脚と狼煙", "空はまだ使えないが、情報で先んじる。", { spc: .04 }], ["弓の斉射", "矢の雨で空を覆う。", { arc: .1 }], ["気球観測", "高所からの観測で戦場を読む。", { art: .04, spc: .03 }]),
  ...T("air", 2, ["気球偵察", "観測が砲撃を導く。", { art: .05 }], ["対空砲の萌芽", "上を向く大砲。", { def: .03, art: .03 }], ["飛行船", "空に浮かぶ船。", { air: .05 }]),
  ...T("air", 3, ["軽飛行機", "初期の偵察機。", { air: .08 }], ["防空網", "見張りと砲で空を守る。", { def: .05, air: .04 }], ["飛行船艦隊", "大型飛行船で遠くを叩く。", { air: .08, atk: .02 }]),
  ...T("air", 4, ["制空戦闘機", "空を取ることを最優先にする。", { air: .15, def: .02 }], ["戦略爆撃", "敵の産業と都市を空から叩く。", { air: .12, atk: .04 }], ["近接航空支援", "地上部隊の頭上を飛ぶ。", { air: .1, inf: .04 }]),
  ...T("air", 5, ["ジェット戦闘機", "音速に近い戦闘機。", { air: .2 }], ["空挺作戦", "空から部隊を降ろす。", { air: .08, spc: .12 }], ["防空ミサイル", "地対空ミサイルの傘。", { def: .08, adv: .08 }]),
  ...T("air", 6, ["ステルスと精密誘導", "見えない機体と誘導兵器。", { air: .18, adv: .12 }], ["無人機", "人が乗らない機体で戦う。", { air: .1, adv: .15 }], ["宇宙・電子戦", "衛星と電波を押さえる。", { adv: .2 }]),
]);

// 政体ごとの固有ドクトリン（各政体に3つ）
const U = (regime, a, b, c) => [a, b, c].map(([label, desc, fx], i) => ({ key: `u.${regime}.${i + 1}`, branch: "unique", regime, tier: 0, label, desc, fx }));
export const UNIQUE_NODES = Object.freeze([
  ...U("absolute", ["王権の常備軍", "王直属の常備兵。", { inf: .08, mor: -.05 }], ["宮廷砲兵", "王の砲兵工房。", { art: .1 }], ["近衛騎士団", "精鋭の近衛。", { cav: .1, spc: .05 }]),
  ...U("constitutional", ["議会の統制", "予算を議会が握り、無謀な戦争を避ける。", { def: .05, mor: -.05 }], ["志願兵制", "志願兵の士気は高い。", { inf: .06, mor: -.05 }], ["海軍重視", "島国型の軍備。", { nav: .1 }]),
  ...U("empire", ["属州軍の徴募", "領内の諸民族から兵を集める。", { con: .15, inf: .04 }], ["街道と駐屯軍", "道で結んだ駐屯網。", { def: .06, cav: .05 }], ["皇帝の親征", "皇帝自らが前に出る。", { atk: .05, mor: -.05 }]),
  ...U("elective", ["貴族連合軍", "有力者の私兵をまとめる。", { con: .1, cav: .06 }], ["傭兵団", "金で雇った兵。", { inf: .05, spc: .04 }], ["選挙のたびの動員", "危機に際して一斉に集まる。", { con: .12 }]),
  ...U("theocracy", ["聖戦", "信仰で兵の士気を支える。", { mor: -.12, atk: .03 }], ["修道騎士団", "信仰に殉じる精鋭。", { spc: .1, cav: .06 }], ["聖域の守り", "聖地を守る戦いに強い。", { def: .1 }]),
  ...U("aristocratic", ["市民兵", "市民が武器を取る。", { inf: .06, def: .04 }], ["海上商業の護衛", "貿易路を守る艦隊。", { nav: .1 }], ["傭兵の指揮", "雇った兵を巧みに使う。", { spc: .06, atk: .02 }]),
  ...U("democracy", ["職業軍と文民統制", "訓練された軍を議会が統制する。", { inf: .05, def: .03 }], ["技術優先", "装備の質で勝つ。", { adv: .08, art: .04 }], ["世論の戦争", "世論が味方すれば強いが、離れると脆い。", { mor: .05, atk: .04 }]),
  ...U("presidential", ["強い統帥権", "大統領が軍を直接動かす。", { atk: .04, def: .02 }], ["予備役制度", "予備役が素早く戻る。", { con: .1 }], ["産業の軍転用", "民需工場を軍需に切り替える。", { arm: .06, air: .04 }]),
  ...U("party", ["人民軍", "党と軍を一体にする。", { inf: .1, con: .1, mor: -.05 }], ["計画動員", "計画経済で兵と物資を集める。", { con: .15, art: .05 }], ["政治将校", "士気を党が監視する。", { mor: -.1, atk: -.02 }]),
  ...U("nationalist", ["総力戦体制", "国民を戦争に結びつける。", { con: .18, mor: -.05, atk: .04 }], ["親衛隊", "忠誠を誓う精鋭。", { spc: .12, inf: .04 }], ["電撃戦", "一気に突破して終わらせる。", { arm: .1, air: .06, atk: .05 }]),
  ...U("junta", ["軍の専横", "軍が優先して兵と装備を取る。", { con: .12, art: .05 }], ["クーデターへの備え", "反乱に強く、外には弱い。", { def: .06, atk: -.03 }], ["空挺と特殊部隊", "少数精鋭を重んじる。", { spc: .14 }]),
  ...U("tribal", ["氏族の戦士", "氏族が一団となって戦う。", { inf: .08, cav: .06 }], ["遊撃", "地の利を使った奇襲。", { spc: .1, mor: -.05 }], ["合議の動員", "長老の合議で全員が動く。", { con: .12 }]),
  ...U("federation", ["邦軍の連合", "邦ごとの軍を合わせる。", { con: .1, def: .03 }], ["共同防衛", "互いに守り合う。", { def: .08 }], ["多様な部隊", "邦ごとの得意を生かす。", { spc: .06, art: .04 }]),
  ...U("anarchy", ["民兵", "武器を持った住民たち。", { con: .1, inf: .03 }], ["略奪と徴発", "現地で補給する。", { atk: .03, mor: .08 }], ["山賊の機動", "奇襲と逃走。", { spc: .08, cav: .05 }]),
]);
export const NODE_BY_KEY = Object.fromEntries([...TREE_NODES, ...UNIQUE_NODES].map((n) => [n.key, n]));
/** 固有ドクトリンは、同時に選べる数に上限がある */
export const MAX_UNIQUE = 2;

/** 選んだ節を、重複の無い正しい組合せに整える（同じ分野・段は1つ。固有は政体のものだけ、最大 MAX_UNIQUE） */
export function normalizeNodes(state, keys) {
  const regime = regimeOf(state).key, seen = new Set(), out = [];
  let uniq = 0;
  for (const k of keys ?? []) {
    const n = NODE_BY_KEY[k]; if (!n) continue;
    if (n.branch === "unique") { if (n.regime !== regime || uniq >= MAX_UNIQUE || out.includes(k)) continue; uniq++; out.push(k); continue; }
    const slot = `${n.branch}.${n.tier}`; if (seen.has(slot)) continue; seen.add(slot); out.push(k);
  }
  return out.sort();
}

/**
 * 効果の上限（v2.4.1 A7。ユーザー回答で確定）。節を重ねても、極端な強さにならないようにする。
 *   unit: 兵科の倍率は、総合方針の基本値の ±60% 以内（基本が1.0なら 0.4〜1.6）
 *   war : 攻め・守りは、それぞれの合計（総合方針＋全部の節）が ±25% 以内
 */
export const DOCTRINE_CAPS = Object.freeze({ unit: 0.6, war: 0.25 });
/** 節の効果の記号（fx のキー）が影響する先（兵科のキー、または attack / defense） */
export const fxDimension = (k) => (k === "atk" ? "attack" : k === "def" ? "defense" : FX[k] ?? null);
/** 実効ドクトリンのうち、上限に達している効果 [{ dim, raw, cap }]（raw: 上限が無ければこうなる増減率。cap: 上限の増減率） */
export const doctrineCapped = (state) => DOCTRINE_BY_KEY[effectiveDoctrineKey(state)]?.capped ?? [];

/** 総合方針＋選んだ節の効果を合成した「実効ドクトリン」のキーを返す。選んだ節が無ければ総合方針のキーのまま。合成には上限（DOCTRINE_CAPS）がかかる */
export function effectiveDoctrineKey(state) {
  const baseKey = DOCTRINE_BY_KEY[state?.doctrine] ? state.doctrine : DEFAULT_DOCTRINE;
  const nodes = normalizeNodes(state, state?.doctrineNodes);
  if (!nodes.length) return baseKey;
  const key = `${baseKey}|${nodes.join(",")}`;
  if (DOCTRINE_BY_KEY[key]) return key;
  const base = DOCTRINE_BY_KEY[baseKey];
  const mult = { ...base.mult }, war = { ...base.war };
  let moraleLoss = base.moraleLoss ?? 1, defenseBonus = base.defenseBonus ?? 0, conscriptBonus = base.conscriptBonus ?? 0;
  for (const k of nodes) {
    const fx = NODE_BY_KEY[k].fx;
    for (const [a, unit] of Object.entries(FX)) if (fx[a]) mult[unit] = Math.round((mult[unit] ?? 1) * (1 + fx[a]) * 1000) / 1000;
    if (fx.atk) war.attack = (war.attack ?? 0) + fx.atk;
    if (fx.def) { war.defense = (war.defense ?? 0) + fx.def; defenseBonus += fx.def; }
    if (fx.mor) { moraleLoss *= 1 + fx.mor; war.moraleHit = (war.moraleHit ?? 1) * (1 + fx.mor); }
    if (fx.con) conscriptBonus += fx.con;
  }
  // 上限をかける（上限に達した効果は、capped に残して、画面に「上限に達している」と出す）
  const capped = [], r3 = (v) => Math.round(v * 1000) / 1000;
  for (const u of Object.keys(mult)) {
    const b0 = base.mult[u] ?? 1, hi = r3(b0 * (1 + DOCTRINE_CAPS.unit)), lo = r3(b0 * (1 - DOCTRINE_CAPS.unit));
    if (mult[u] > hi || mult[u] < lo) { capped.push({ dim: u, raw: r3(mult[u] / b0 - 1), cap: mult[u] > hi ? DOCTRINE_CAPS.unit : -DOCTRINE_CAPS.unit }); mult[u] = mult[u] > hi ? hi : lo; }
  }
  const capWar = (v) => Math.max(-DOCTRINE_CAPS.war, Math.min(DOCTRINE_CAPS.war, v));
  if (war.attack !== undefined && Math.abs(war.attack) > DOCTRINE_CAPS.war) { capped.push({ dim: "attack", raw: r3(war.attack), cap: capWar(war.attack) }); war.attack = capWar(war.attack); }
  if ((war.defense !== undefined && Math.abs(war.defense) > DOCTRINE_CAPS.war) || Math.abs(defenseBonus) > DOCTRINE_CAPS.war) {
    capped.push({ dim: "defense", raw: r3(Math.max(Math.abs(war.defense ?? 0), Math.abs(defenseBonus)) * Math.sign(war.defense ?? defenseBonus)), cap: capWar(war.defense ?? defenseBonus) });
    if (war.defense !== undefined) war.defense = capWar(war.defense); defenseBonus = capWar(defenseBonus);
  }
  DOCTRINE_BY_KEY[key] = { ...base, key, baseKey, capped, label: `${base.label}＋${nodes.length}`, mult, war, moraleLoss: Math.round(moraleLoss * 1000) / 1000, defenseBonus: Math.round(defenseBonus * 1000) / 1000, conscriptBonus: Math.round(conscriptBonus * 1000) / 1000 };
  return key;
}

/** 軍事ドクトリンの変更（総合方針と節をまとめて）。変化が無ければ null */
export function planSetMilitaryDoctrine(map, stateId, { base, nodes } = {}) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) throw new Error("存在しない国家です");
  const patch = {};
  if (base !== undefined) { if (!DOCTRINE_BY_KEY[base]) throw new Error("不明なドクトリンです"); if ((s.doctrine ?? DEFAULT_DOCTRINE) !== base) patch.doctrine = base; }
  if (nodes !== undefined) {
    const next = normalizeNodes(s, nodes), cur = normalizeNodes(s, s.doctrineNodes);
    if (next.join() !== cur.join()) patch.doctrineNodes = next.length ? next : undefined;
  }
  if (!Object.keys(patch).length) return null;
  return makeCommand(`軍事ドクトリンの変更（${s.name}）`, [], [setProps(s, patch)]);
}

// ---------- 技術ドクトリン ----------
export const TECH_MIN = 1, TECH_MAX = 10;
const clampT = (v) => Math.min(TECH_MAX, Math.max(TECH_MIN, Math.round(Number(v) || TECH_MIN)));
export const TECH_TRACKS = Object.freeze([
  { key: "agri", label: "農業", weight: 0.1, steps: ["採集と焼畑", "鍬と鋤", "犂と輪作", "灌漑と水車", "三圃制", "改良農法", "農業機械", "化学肥料", "機械化農業", "精密農業"] },
  { key: "ind", label: "工業", weight: 0.3, steps: ["手工業", "工房", "マニュファクチュア", "蒸気機関", "重工業", "電化", "大量生産", "自動化", "電子工業", "先端製造"] },
  { key: "transport", label: "交通", weight: 0.15, steps: ["踏み分け道", "街道と舟", "運河", "大航海の帆船", "鉄道", "蒸気船", "自動車", "航空輸送", "高速鉄道", "大量高速輸送"] },
  { key: "comms", label: "通信", weight: 0.15, steps: ["伝令", "狼煙と書状", "郵便", "印刷", "電信", "電話", "無線", "放送", "計算機網", "情報通信網"] },
  { key: "medicine", label: "医療", weight: 0.1, steps: ["薬草と呪い", "経験医術", "解剖学", "種痘", "細菌学", "麻酔と消毒", "抗生物質", "公衆衛生", "先端外科", "遺伝子医療"] },
  { key: "energy", label: "エネルギー", weight: 0.2, steps: ["薪と人力", "水車と風車", "石炭", "蒸気", "石油", "電力網", "水力・火力発電", "原子力", "送電網", "再生可能・核融合"] },
]);
/** 国家の技術ドクトリン（未設定なら、従来の techLevel（無ければ3）を全分野に当てはめる） */
export function getTechDoctrine(state) {
  const base = clampT(typeof state?.techLevel === "number" ? state.techLevel : 3);
  return Object.fromEntries(TECH_TRACKS.map((t) => [t.key, typeof state?.techDoctrine?.[t.key] === "number" ? clampT(state.techDoctrine[t.key]) : base]));
}
/** 技術ドクトリンから、戦闘・経済・軍の計算が使う技術水準（1〜10）を導く */
export function techLevelFrom(levels) {
  return clampT(TECH_TRACKS.reduce((n, t) => n + (levels[t.key] ?? TECH_MIN) * t.weight, 0));
}
export function planSetTechDoctrine(map, stateId, patch) {
  const s = map.pack.states[stateId];
  if (!isLive(s)) throw new Error("存在しない国家です");
  const cur = getTechDoctrine(s), next = { ...cur };
  for (const [k, v] of Object.entries(patch ?? {})) { if (!TECH_TRACKS.some((t) => t.key === k)) throw new Error(`未知の分野です: ${k}`); next[k] = clampT(v); }
  const same = TECH_TRACKS.every((t) => next[t.key] === cur[t.key]) && s.techDoctrine;
  if (same) return null;
  const level = techLevelFrom(next);
  return makeCommand(`技術ドクトリンの変更（${s.name}）`, [], [setProps(s, { techDoctrine: next, techLevel: level })]);
}
export const regimeUniqueNodes = (regimeKey) => UNIQUE_NODES.filter((n) => n.regime === regimeKey);
export { REGIME_BY_KEY };
