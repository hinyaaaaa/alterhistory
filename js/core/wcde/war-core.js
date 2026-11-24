// v7.0.0 W1: 戦争の中核。戦争目的・勝利点（VP）・戦争支持（民意）・国ごとの降伏。
//   従来は「戦況の 1 本のスコア」が ±80・軍の壊滅 6 か月・最大期間のどれかで自動終戦した。v7 では国ごとに降伏する。
//     ・各国の降伏ゲージ = 敵に占領された勝利点の割合（vpPct）。限度（既定 80%）に達すると、その国は降伏する。
//     ・戦争支持（0〜100）が低いと限度が下がる（支持 0 で 20%）。首都が落ちると限度がさらに下がる。支持 0 が続けば、占領が少なくても降伏する。
//     ・降伏した国は戦わない（部隊は引き上げる）。首都を取り戻し、ゲージが限度を下回れば降伏から戻れる。
//     ・片側の主たる交戦国が降伏する（または全員が降伏する）と、戦争は講和会議（phase: "conference"）へ進む（war-peace.js）。
//   データ: war.goals[]／war.surrender[stateId]／war.phase／war.log[]（すべて JSON で保存できる値だけ）。
//   決定性: 乱数を使わない（国家・戦争・月から決まる）。月次の費用は、戦争に関わる国だけ・占領された集団だけを数える。
import { byState } from "../civ/spatial.js";
import { groupStage } from "../civ/settlements.js";
import { makeEvent } from "../civ/events.js";
import { effective } from "./domains/effective.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r1 = (x) => Math.round(x * 10) / 10;

export const DEFAULT_LIMIT = 80; // 降伏の限度（%）
export const WAR_PHASE = Object.freeze({ active: "active", conference: "conference", ended: "ended" });

/** 戦争目的の種類（宣戦前に選ぶ。講和で取れる範囲の枠になる） */
export const GOAL_KINDS = Object.freeze({
  annex: { ja: "併合", needsTarget: true, unlocks: ["annex", "cede"], note: "相手の国を丸ごと自国に組み込む" },
  territory: { ja: "領土", needsTarget: true, unlocks: ["cede"], note: "国境の土地を割譲させる" },
  subjugate: { ja: "従属化", needsTarget: true, unlocks: ["vassalize"], note: "相手を従属国（封臣・保護国）にする" },
  liberate: { ja: "解放", needsTarget: true, unlocks: ["liberate"], note: "占領されている土地を解放し、独立国として建てる" },
  throne: { ja: "王位", needsTarget: true, unlocks: ["regime"], note: "相手国の君主・体制を替える（継承権の主張）" },
  religion: { ja: "宗教", needsTarget: true, unlocks: ["regime"], note: "相手国に自分の信仰を認めさせる" },
  reparations: { ja: "賠償", needsTarget: true, unlocks: ["reparations"], note: "戦費を相手に払わせる" },
});
/** 講和会議で買える要求の種類。cost: 戦争スコアの基準額（100 = 敵国 1 国の全体の価値）／free: 戦争目的がなくても買える（小さな要求） */
export const DEMAND_KINDS = Object.freeze({
  annex: { ja: "併合", cost: 100 }, cede: { ja: "割譲", cost: 100 }, vassalize: { ja: "従属国化", cost: 70 }, liberate: { ja: "解放", cost: 55 },
  regime: { ja: "政体・君主の変更", cost: 35 }, reparations: { ja: "賠償", cost: 20 },
  dmz: { ja: "非武装地帯", cost: 15, free: true }, resource: { ja: "資源権", cost: 25, free: true }, fleet: { ja: "艦隊の接収", cost: 20, free: true },
  hostage: { ja: "人質", cost: 10, free: true }, amnesty: { ja: "恩赦", cost: 5, free: true },
});

export const sideOf = (w, id) => (w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null);
export const otherSide = (s) => (s === "a" ? "d" : "a");
export const leaderOf = (w, side) => (side === "a" ? w.aggressor : w.defender);

/** 戦争の記録（最大 60 件）。講和・降伏の経緯を、あとから「なぜ」として辿れるようにする */
export function wlog(ctx, w, kind, text, extra = null) {
  const L = (w.log ??= []); L.push({ at: ctx.civ.monthIndex, kind, text, ...(extra ?? {}) }); if (L.length > 60) L.splice(0, L.length - 60);
}

/** 戦争に v7 の入れ物を整える（旧セーブの戦争にも使う） */
export function ensureWarV7(w) {
  w.phase ??= w.status === "ended" ? "ended" : "active"; w.goals ??= []; w.surrender ??= {}; w.log ??= []; w.fronts ??= [];
  return w;
}

// ---- 戦争目的
/** 理由（開戦の分類）から、既定の戦争目的を決める（アルゴリズム国家が宣戦するとき） */
export function defaultGoals(reason, atkId, defId) {
  const g = (kind, by = atkId, target = defId) => ({ by, kind, target });
  switch (reason) {
    case "conquest": case "plunder": return [g("territory")];
    case "subjugation": return [g("subjugate")];
    case "unification": return [g("annex")];
    case "religion": return [g("religion")];
    case "succession": return [g("throne")];
    case "independence": case "civil_war": return [g("liberate", atkId, atkId)];
    case "revenge": return [g("territory"), g("reparations")];
    case "trade_route": case "maritime": case "resource": case "ideology": return [g("reparations")];
    default: return []; // 防衛・同盟・予防戦争は、守ることが目的（賠償だけは取れる）
  }
}
/** 戦争目的を確かめる。{ ok, goals } か { ok:false, error } */
export function validateGoals(civ, atk, def, goals) {
  if (!Array.isArray(goals)) return { ok: false, error: "戦争目的は一覧で渡す" }; const out = [];
  for (const x of goals) {
    const K = GOAL_KINDS[x?.kind]; if (!K) return { ok: false, error: `未知の戦争目的: ${x?.kind}` };
    const target = x.target ?? def.id, t = civ.states[target]; if (!t?.alive) return { ok: false, error: "戦争目的の対象の国が存在しない" };
    if (x.kind === "liberate" ? false : target === atk.id) return { ok: false, error: "自国を対象にできない目的" };
    if (out.some((y) => y.kind === x.kind && y.target === target)) continue; out.push({ by: atk.id, kind: x.kind, target });
  }
  if (out.length > 4) return { ok: false, error: "戦争目的は 4 つまで" };
  return { ok: true, goals: out };
}
/** 国 id が、この戦争で持つ目的（講和で取れる範囲） */
export const goalsOf = (w, id) => (w.goals ?? []).filter((g) => g.by === id);
/** 国がこの種類の要求を買ってよいか（戦争目的の枠。free の要求は枠の外） */
export function demandAllowed(w, byId, kind, targetId) {
  const D = DEMAND_KINDS[kind]; if (!D) return false; if (D.free) return true;
  return goalsOf(w, byId).some((g) => GOAL_KINDS[g.kind].unlocks.includes(kind) && (g.target === targetId || kind === "liberate"));
}

// ---- 勝利点（VP）
const STAGE_W = { city: 6, town: 2.5, village: 1 };
/** 集団 1 つの勝利点の重み。都市の段階・集落の数・人口で決まる（首都の加算は国ごと） */
export function vpWeight(civ, g) {
  if (!g) return 0; const stg = groupStage(civ, g) ?? "village";
  return STAGE_W[stg] + Math.max(0, (g.settlementIds?.length ?? 1) - 1) * 0.4 + Math.sqrt(Math.max(0, g.pop)) / 200;
}
const capitalExtra = (nonCapSum) => Math.max(6, 0.35 * nonCapSum);
/** 国の勝利点の合計（首都の重みを含む）。6 か月ごとに数え直して持つ（毎月は数えない） */
function totalVp(ctx, w, st, rec) {
  const mi = ctx.civ.monthIndex; if (rec.totAt != null && mi - rec.totAt < 6 && rec.tot > 0) return rec.tot;
  let sum = 0; const gs = byState(ctx).get(st.id) ?? []; for (const g of gs) sum += g.id === st.capitalGroupId ? 0 : vpWeight(ctx.civ, g);
  const cap = ctx.civ.groups[st.capitalGroupId]; rec.capW = (cap ? vpWeight(ctx.civ, cap) : 0) + capitalExtra(sum); rec.tot = Math.max(1, sum + rec.capW); rec.totAt = mi; return rec.tot;
}
/** 占領された勝利点（この戦争の占領の一覧だけを数える）。{ lost, capLost } */
export function occupiedVp(ctx, w, st, rec) {
  const { civ } = ctx, ops = w.ops, mySide = sideOf(w, st.id); let lost = 0, capLost = false; if (!ops || !mySide) return { lost, capLost };
  for (const gid of w.occupied) { const g = civ.groups[gid]; if (!g || g.stateId !== st.id) continue; const occ = ops.occ?.[gid]; if (!occ || occ === mySide) continue; if (gid === st.capitalGroupId) { capLost = true; lost += rec.capW ?? 6; } else lost += vpWeight(civ, g); }
  return { lost, capLost };
}

// ---- 戦争支持（民意）
/** 戦争支持 0〜100。疲労・損耗・国内の不安定・劣勢・抗戦の長さで下がる */
export function warSupport(ctx, w, st) {
  const civ = ctx.civ, fat = effective(civ, st, "fatigue") ?? 0, stab = effective(civ, st, "stability") ?? st.stability ?? 0.5, side = sideOf(w, st.id);
  const lead = side === "a" ? w.score : -w.score, rec = w.surrender?.[st.id];
  const s = 0.92 - 0.5 * fat - 0.8 * (st.warLoss ?? 0) - 0.25 * (1 - stab) - Math.max(0, -lead) / 200 + Math.max(0, lead) / 500 - 0.02 * Math.min(12, rec?.resist ?? 0) - Math.min(0.2, (civ.monthIndex - w.startedAt) / 1200);
  return Math.round(clamp(s) * 100);
}
/** 降伏の限度（%）。支持が 60 を下回るほど下がり、首都が落ちるとさらに下がる */
export const surrenderLimit = (support, capLost, base = DEFAULT_LIMIT) => Math.max(10, Math.round(base - 60 * clamp((60 - support) / 60) - (capLost ? 10 : 0)));

/** 降伏の記録（国ごと）。なければ作る */
export const surrenderRec = (w, id) => ((w.surrender ??= {})[id] ??= { vpPct: 0, limit: DEFAULT_LIMIT, support: 80, capitulated: false, capLost: false, resist: 0, zero: 0 });
/** 国 1 つの降伏の状況を計算する（記録を更新して返す。何も終わらせない） */
export function measure(ctx, w, st) {
  const rec = surrenderRec(w, st.id), tot = totalVp(ctx, w, st, rec), oc = occupiedVp(ctx, w, st, rec);
  rec.support = warSupport(ctx, w, st); rec.capLost = oc.capLost; rec.limit = surrenderLimit(rec.support, oc.capLost, rec.baseLimit ?? DEFAULT_LIMIT); const sd = sideOf(w, st.id); if ((w.ops?.broken?.[sd] ?? 0) >= 6) rec.limit = Math.max(10, rec.limit - 15); /* 軍が壊滅して長いと、降伏しやすい */ rec.vpPct = r1(clamp(oc.lost / tot, 0, 1) * 100);
  rec.zero = rec.support <= 0 ? rec.zero + 1 : 0; return rec;
}

/** 降伏の月次。戦争に関わる国だけを見る。新しく降伏した国の一覧を返す。担当国には決断を出す（抗戦／受諾／逆提案） */
export function stepSurrender(ctx, w) {
  const { civ } = ctx, out = [], mi = civ.monthIndex; ensureWarV7(w);
  for (const side of ["a", "d"]) for (const id of w.sides[side]) {
    const st = civ.states[id]; if (!st?.alive) continue; const rec = measure(ctx, w, st);
    if (rec.capitulated) { // 戻る: 首都を取り戻し、ゲージが限度を十分に下回る
      if (!rec.capLost && rec.vpPct < rec.limit - 5 && mi - (rec.since ?? 0) >= 3) { rec.capitulated = false; rec.resist = 0; wlog(ctx, w, "returned", `${st.name}は首都を取り戻し、降伏から戻った`); makeEvent(civ, ctx.ids, { kind: "capitulation_reversed", title: `${st.name}が降伏から戻り、戦いを続ける`, participants: [{ entityId: st.id, role: "state" }, { entityId: w.id, role: "war" }], location: null, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, stateId: st.id }, provenance: "simulation", why: "首都を取り戻し、占領された勝利点が限度を下回った" }); }
      continue;
    }
    if (rec.resist > 0) { rec.resist++; const lose = (st.army ?? 0) * 0.01; st.army = Math.max(0, (st.army ?? 0) - lose); } // 抗戦: 降伏ゲージは維持され、毎月、民意と兵力が削られる
    const collapse = rec.zero >= 12; // 支持 0 が 1 年続けば、占領が少なくても国は持たない（民意が 0 でも降伏しない、を防ぐ）
    if (rec.vpPct >= rec.limit || collapse) { if (askOrCapitulate(ctx, w, st, rec, collapse)) out.push(st); }
  }
  return out;
}
/** 降伏する。担当国なら決断を出し（回答まで降伏しない）、決断が出せなければ降伏する。降伏したら true */
function askOrCapitulate(ctx, w, st, rec, collapse) {
  const { civ } = ctx, mi = civ.monthIndex;
  if (st.player && ctx.decisions?.raise) {
    if (rec.pending) { const open = (civ.wcde?.decisions?.queue ?? []).some((d) => d.id === rec.pending); if (open) return false; rec.pending = null; }
    if ((rec.askedAt ?? -99) + 3 > mi) return false; // 抗戦の直後は、3 か月は降伏を迫られない
    const foes = w.sides[otherSide(sideOf(w, st.id))].map((i) => civ.states[i]?.name).filter(Boolean).slice(0, 3).join("・");
    const d = ctx.decisions.raise(ctx, { kind: "surrender_call", key: `sc|${w.id}|${st.id}`, stateId: st.id, title: `${st.name}に降伏の打診が来ている`, body: `${foes}との戦争。占領された勝利点は ${rec.vpPct}%（限度 ${rec.limit}%、戦争支持 ${rec.support}）。${rec.capLost ? "首都が陥落している。" : ""}${collapse ? "民意が尽き、国内が持たない。" : ""}`, options: [{ id: "accept", ja: "降伏を受け入れる", hint: "講和会議が開かれ、勝者が要求を出す" }, { id: "resist", ja: "抗戦する", hint: "戦いを続ける。民意と兵力が毎月削られ、さらに追い込まれる" }, { id: "counter", ja: "逆提案（白紙講和）を申し入れる", hint: "相手が受ければ戦争は終わる。拒まれれば降伏か抗戦" }], payload: { warId: w.id, state: st.id } });
    if (d) { rec.pending = d.id; rec.askedAt = mi; return false; }
  }
  capitulate(ctx, w, st, rec, collapse); return true;
}
/** 降伏を確定する（担当国の「受け入れる」・AI の降伏から） */
export function capitulate(ctx, w, st, rec = null, collapse = false) {
  const { civ } = ctx; rec ??= surrenderRec(w, st.id); rec.capitulated = true; rec.since = civ.monthIndex; rec.pending = null; rec.resist = 0;
  const why = collapse ? "民意が尽きた" : rec.capLost ? `首都が陥落し、占領された勝利点が ${rec.vpPct}%（限度 ${rec.limit}%）に達した` : `占領された勝利点が ${rec.vpPct}%（限度 ${rec.limit}%）に達した`;
  wlog(ctx, w, "capitulated", `${st.name}が降伏した（${why}）`, { stateId: st.id });
  makeEvent(civ, ctx.ids, { kind: "capitulated", title: `${st.name}が降伏した`, participants: [{ entityId: st.id, role: "state" }, { entityId: w.id, role: "war" }, ...w.sides[otherSide(sideOf(w, st.id))].map((i) => ({ entityId: i, role: "victor_side" }))], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, stateId: st.id, vpPct: rec.vpPct, limit: rec.limit, capLost: rec.capLost }, provenance: "simulation", why });
  const ops = w.ops; if (ops) for (const f of Object.values(ops.forces ?? {})) if (f.stateId === st.id) { if (f.campaignId) delete ops.campaigns[f.campaignId]; delete ops.forces[f.id]; }
  st.stability = clamp((st.stability ?? 0.5) - 0.05);
}
export const isCapitulated = (w, id) => !!w.surrender?.[id]?.capitulated;
/** 片側が崩れたか: 主たる交戦国が降伏した、または参戦国の全員が降伏した */
export function sideCollapsed(w, side) { const cap = (id) => isCapitulated(w, id); return cap(leaderOf(w, side)) || w.sides[side].every(cap); }

/** 画面・外部向けの戦争の要約（WAR_API の形）。保存している形（sides.a/d）は変えず、ここで整形する */
export function warView(civ, w) {
  ensureWarV7(w); const nm = (id) => civ.states[id]?.name ?? id;
  return { id: w.id, name: w.name ?? null, goals: w.goals.map((g) => ({ ...g })), phase: w.phase, sides: ["a", "d"].map((s) => ({ side: s, nations: [...w.sides[s]], leader: leaderOf(w, s), leaderName: nm(leaderOf(w, s)) })), surrender: Object.fromEntries(Object.entries(w.surrender).map(([k, r]) => [k, { vpPct: r.vpPct, limit: r.limit, support: r.support, capitulated: r.capitulated, capLost: r.capLost, resist: r.resist }])), fronts: w.fronts, log: w.log.slice(-20) };
}
