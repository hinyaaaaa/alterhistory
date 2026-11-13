// v6.12.0: 国策（National Focus）。経済・軍事・内政・外交・文化の 5 分野ごとに「枠」があり、枠に国策を入れる。枠は時代（制度化した技術の数）で増える。
//   国策は小さなバフ・デバフ（税収・軍事・安定度・外交・偵察・技術と、勢力の支持）。取り入れるには費用がかかり、同じ枠は 24 か月は替えられない。
//   既存の政策（税率・徴兵率・寛容など）はそのまま使う。国策は、それを補う「国の方針」。
import { makeEvent } from "../civ/events.js";
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r4 = (x) => Math.round(x * 10000) / 10000;
export const POLICY_CATS = Object.freeze({ econ: "経済", mil: "軍事", home: "内政", dipl: "外交", cult: "文化" });
export const SLOT_COOLDOWN = 24;
/** 国策: id → { cat, ja, desc, need（制度化した技術。なければ null）, cost（費用の係数）, fx（stab/tax/mil/def/dipl/scout/tech/cult）, fac（勢力の支持の目標への加減） } */
const P = (cat, ja, desc, need, cost, fx = {}, fac = {}) => ({ cat, ja, desc, need, cost, fx, fac });
export const POLICIES = Object.freeze({
  agrarian: P("econ", "重農政策", "農を国の本とし、民の暮らしを支える", "agriculture", 1, { tax: 0.03 }, { commoners: 0.02, merchants: -0.01 }),
  mercantile: P("econ", "重商主義", "交易と商人を保護し、関税で稼ぐ", "markets", 1.2, { tax: 0.04, dipl: -0.02 }, { merchants: 0.03 }),
  monopoly: P("econ", "専売制", "塩・鉄などを国が握る", "tax_system", 1.2, { tax: 0.05 }, { merchants: -0.03 }),
  public_works: P("econ", "公共事業", "道・水路・城壁を築く", "roads", 1.3, { stab: 0.01, tax: 0.01 }, { artisans: 0.02 }),
  free_market: P("econ", "自由市場", "規制を緩め、商いを自由にする", "banking", 1.3, { tax: 0.03 }, { merchants: 0.03, nobility: -0.015 }),
  planned: P("econ", "計画経済", "国が生産と分配を決める", "industry", 1.6, { tax: 0.06 }, { merchants: -0.04 }),
  currency: P("econ", "通貨の統一", "貨幣を統一し、取引を円滑にする", "coinage", 1, { tax: 0.03, stab: 0.005 }),
  thrift: P("econ", "倹約令", "宮廷と官の出費を切り詰める", "record_keeping", 0.8, { tax: 0.02, stab: -0.005 }, { nobility: -0.01 }),
  standing_army: P("mil", "常備軍の整備", "平時から軍を養う", "standing_army", 1.4, { mil: 0.04, tax: -0.02 }, { military: 0.03 }),
  conscription: P("mil", "徴兵制", "広く兵を集める", "military_logistics", 1.2, { mil: 0.05 }, { commoners: -0.03 }),
  elite_corps: P("mil", "精鋭主義", "少数の精鋭を重んじる", "cavalry", 1.1, { mil: 0.03, tax: -0.01 }, { nobility: 0.02 }),
  fortress: P("mil", "要塞網", "国境に城塞を連ねる", "fortification", 1.3, { def: 0.04, tax: -0.01 }),
  logistics: P("mil", "兵站の整備", "道と倉を整え、軍を養う", "military_logistics", 1.1, { mil: 0.02, def: 0.02 }),
  naval: P("mil", "海軍の拡張", "港と艦隊を整える", "naval_warfare", 1.3, { mil: 0.025, dipl: 0.02, tax: -0.01 }),
  gun_reform: P("mil", "火器の導入", "銃と砲を軍の中心に据える", "gunpowder", 1.5, { mil: 0.045, tax: -0.02 }),
  veterans: P("mil", "退役兵の優遇", "戦った者に報いる", "standing_army", 1, { stab: 0.008, tax: -0.01 }, { military: 0.03 }),
  centralize: P("home", "中央集権", "地方の権限を王のもとへ集める", "bureaucracy", 1.4, { tax: 0.04, stab: 0.01 }, { nobility: -0.04, bureaucrats: 0.03 }),
  autonomy: P("home", "地方自治", "地方の自治を認める", null, 0.8, { stab: 0.01, tax: -0.02 }, { nobility: 0.03, clans: 0.03 }),
  tolerance: P("home", "宗教的寛容", "異なる信仰を認める", null, 0.8, { stab: 0.01 }, { clergy: -0.02, merchants: 0.01 }),
  state_religion: P("home", "国教化", "一つの信仰を国の柱にする", "writing", 1, { stab: 0.01 }, { clergy: 0.04, merchants: -0.01 }),
  martial_law: P("home", "治安の強化", "取り締まりと監視を強める", "law", 1.1, { stab: 0.02, scout: 0.05 }, { commoners: -0.03 }),
  relief: P("home", "救貧と福祉", "困窮した民を助ける", "census", 1.2, { stab: 0.015, tax: -0.02 }, { commoners: 0.03 }),
  admin_reform: P("home", "行政改革", "役所の仕組みを整える", "administration", 1.2, { tax: 0.02 }, { bureaucrats: 0.03 }),
  exam: P("home", "官僚の登用試験", "家柄でなく才で官を選ぶ", "civil_service", 1.4, { tax: 0.025, stab: 0.005 }, { nobility: -0.02, bureaucrats: 0.03 }),
  marriage: P("dipl", "婚姻外交", "縁組で結びつきを作る", null, 0.8, { dipl: 0.1 }, { nobility: 0.01 }),
  trade_diplomacy: P("dipl", "通商外交", "交易で関係を深める", "trade_routes", 1, { dipl: 0.06, tax: 0.01 }, { merchants: 0.02 }),
  isolation: P("dipl", "孤立主義", "他国と深く関わらない", null, 0.6, { stab: 0.01, dipl: -0.1, mil: -0.01 }),
  balance: P("dipl", "勢力均衡", "強い国を牽制し合う", "diplomacy", 1.1, { dipl: 0.08 }),
  espionage: P("dipl", "諜報網の整備", "各地に目と耳を置く", "writing", 1.2, { scout: 0.12, stab: -0.003 }),
  coercion: P("dipl", "威圧外交", "力を背景に迫る", "standing_army", 0.9, { dipl: -0.05, mil: 0.015 }),
  embassies: P("dipl", "使節の常駐", "主な国に使節を置く", "diplomacy", 1.2, { dipl: 0.1, tax: -0.005 }),
  courier: P("dipl", "駅伝と郵便", "知らせを速く運ぶ", "postal_system", 1.2, { scout: 0.06, dipl: 0.03, stab: 0.004 }),
  scholarship: P("cult", "学問の奨励", "学者を招き、学びを支える", "writing", 1.2, { tech: 0.04, tax: 0.005 }),
  libraries: P("cult", "図書館の整備", "書を集め、写し、守る", "record_keeping", 1.1, { tech: 0.03 }, { clergy: 0.01 }),
  arts: P("cult", "芸術の保護", "詩・音楽・造形を支える", null, 0.8, { stab: 0.008 }, { artisans: 0.03 }),
  festivals: P("cult", "祭礼の保護", "祭りと儀礼を盛んにする", null, 0.7, { stab: 0.01 }, { clergy: 0.02 }),
  national_myth: P("cult", "民族の物語", "共通の由来と物語を語り継ぐ", "oral_tradition", 0.8, { stab: 0.012 }, { clans: 0.02 }),
  language: P("cult", "言語の統一", "公の言葉を一つにそろえる", "writing", 1, { stab: 0.008 }, { clans: -0.03 }),
  printing: P("cult", "印刷の奨励", "書物を広く行き渡らせる", "printing", 1.3, { tech: 0.05, tax: 0.01 }, { clergy: -0.01 }),
  public_ed: P("cult", "公教育", "学びを広く民に開く", "public_education", 1.4, { tech: 0.05, stab: 0.005, tax: -0.01 }),
  medicine: P("cult", "医療の整備", "医と衛生を整える", "medicine", 1.1, { stab: 0.008, tax: 0.005 }),
});
export const POLICY_IDS = Object.freeze(Object.keys(POLICIES));
/** 枠の数（分野ごと）: 制度化した技術の数で 1〜4 */
export const slotCount = (st) => { const n = Object.keys(st.techAdopted ?? {}).length; return 1 + (n >= 12) + (n >= 30) + (n >= 55); };
export const initFocus = () => ({ econ: [], mil: [], home: [], dipl: [], cult: [] });
export function focusOf(st) { const F = (st.focus ??= initFocus()), n = slotCount(st); for (const c of Object.keys(POLICY_CATS)) { F[c] ??= []; while (F[c].length < n) F[c].push(null); } return F; }
/** 取り入れる費用: 国の規模に比例（小国は安く、大国は高い） */
export const policyCost = (st, id) => Math.round((POLICIES[id]?.cost ?? 1) * (15 + (st.pop ?? 0) * 0.0003));
/** 取り入れられない理由（取れるなら null） */
export function policyGate(st, id, cat = null) {
  const p = POLICIES[id]; if (!p) return "その国策はありません"; if (cat && p.cat !== cat) return "その分野の国策ではありません"; if (p.need && st.techAdopted?.[p.need] == null) return `技術「${p.need}」を制度化していない`; return null;
}
export function setPolicy(ctx, st, { category, slot, policyId }) {
  const { civ } = ctx, F = focusOf(st), mi = civ.monthIndex; if (!POLICY_CATS[category]) return { ok: false, error: "分野は econ / mil / home / dipl / cult" };
  if (!Number.isInteger(slot) || slot < 0 || slot >= F[category].length) return { ok: false, error: "その枠はまだありません（時代が進むと増える）" };
  const cur = F[category][slot]; if (cur && mi - cur.since < SLOT_COOLDOWN) return { ok: false, error: `この枠は、あと ${SLOT_COOLDOWN - (mi - cur.since)} か月は替えられない` };
  if (policyId == null) { if (!cur) return { ok: true, changed: false }; F[category][slot] = null; return { ok: true, changed: true, removed: POLICIES[cur.id]?.ja ?? cur.id }; }
  const why = policyGate(st, policyId, category); if (why) return { ok: false, error: why }; if (Object.values(F).some((a) => a.some((x) => x?.id === policyId))) return { ok: false, error: "その国策はすでに取り入れている" };
  const cost = policyCost(st, policyId); if (st.treasury < cost) return { ok: false, error: `費用 ${cost} が足りない` };
  st.treasury -= cost; F[category][slot] = { id: policyId, since: mi };
  makeEvent(civ, ctx.ids, { kind: "state_action", title: `${st.name}が国策「${POLICIES[policyId].ja}」を取り入れた`, participants: [{ entityId: st.id, role: "state" }], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, facts: { stateId: st.id, policy: policyId, category }, provenance: "player" });
  return { ok: true, changed: true, cost, replaced: cur ? POLICIES[cur.id]?.ja : null };
}
/** 取り入れている国策すべての効果（合計。軽いバフ・デバフなので上限あり） */
export function policyEffects(st) {
  const o = { stab: 0, tax: 0, mil: 0, def: 0, cult: 0, tech: 0, dipl: 0, scout: 0, fac: {}, count: 0 }; const F = st.focus; if (!F) return o;
  for (const c of Object.keys(POLICY_CATS)) for (const x of F[c] ?? []) { const p = x && POLICIES[x.id]; if (!p) continue; o.count++; for (const [k, v] of Object.entries(p.fx)) o[k] = (o[k] ?? 0) + v; for (const [k, v] of Object.entries(p.fac)) o.fac[k] = (o.fac[k] ?? 0) + v; }
  const cap = { stab: 0.05, tax: 0.12, mil: 0.1, def: 0.1, cult: 0.1, tech: 0.1, dipl: 0.3, scout: 0.25 }; for (const k of Object.keys(cap)) o[k] = r4(clamp(o[k], -cap[k], cap[k])); for (const k of Object.keys(o.fac)) o.fac[k] = r4(clamp(o.fac[k], -0.12, 0.12)); return o;
}
