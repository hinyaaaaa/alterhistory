// v7.0.0 (担当A): 都市（集落）の序列・名前・改称・時間変化・首都の保証。
//   settlement = { id, name, cell, groupId, stage, rank, nameHistory:[{at,name,cause}], pop, foundedAt, weight, score, capitalOf? }
//   ・序列 rank: 1=大都市 2=都市 3=町 4=村。人口の段階（rankOfPop）から決まる。stage（village/town/city）は rank から導く（旧フィールドを残す）。
//   ・1 つの集団（group）は複数の集落を持てる。group.settlementId は「中心の集落」（旧来どおり）、group.settlementIds が全部。
//   ・集団の都市人口（pop × settledShare）を、集落の重み（weight）で配分する。重みは順位規模則（1/k）で初期化され、年ごとに少しずつゆらぐ。
//   ・首都は必ず「都市」＝集落（settlement。序列 rank 1〜4 のどれでもよい。村も含む）。国家には capitalSettlementId が必ずあり、capitalGroupId はその集落の集団と一致する。
//     人口が足りない首都を、人口の段階だけ格上げすることはしない（stage は人口で決まる）。
//   ・決定的: 乱数は civ.historySeed と集落ID・年月から導く（Math.random は使わない）。
import { makeEvent } from "./events.js";
import { hashSeed, rngOf } from "./civ-state.js";

export const SETTLED_SHARE = 0.7; // 集団人口のうち、集落に住む割合（POP.settledShare と同じ値）
export const RANK = Object.freeze({ bigMin: 25000, midMin: 10000, smallMin: 1500 });
export const RANK_JA = Object.freeze({ 1: "大都市", 2: "都市", 3: "町", 4: "村" });
export const STAGE_JA = Object.freeze({ village: "村", town: "町", city: "都市" });
export const rankOfPop = (p) => (p >= RANK.bigMin ? 1 : p >= RANK.midMin ? 2 : p >= RANK.smallMin ? 3 : 4);
export const stageOfRank = (r) => (r <= 2 ? "city" : r === 3 ? "town" : "village");
/** 実際の序列（人口で決まる。首都でも格上げしない） */
export const effectiveRank = (s) => rankOfPop(s.pop);
/** 集団ごとの都市人口（集団の人口 × 定住の割合 × 集団ごとの集中度（0.35〜2.95。平均 1.0）。集中度は集団IDから決まる＝都市の大きさに差が出る） */
export const urbanPop = (g) => { const h = (hashSeed(g.id, "urb") % 1000) / 1000; return g.pop * SETTLED_SHARE * (0.35 + 2.6 * h * h * h); }; // 集中度 0.35〜2.95（重い裾野。平均 1.0）: 少数の大都市が突き出る
/** 集団の段階（経済・技術・政治・国家形成が使う）。従来どおり「集団の都市人口＝人口×定住の割合」で決める。個々の集落の段階（settlement.stage）とは別。
 *  集団に集落が無ければ undefined（従来の `civ.settlements[g.settlementId]?.stage` と同じ）。 */
export const groupStage = (civ, g) => { if (!g?.settlementId || !civ.settlements[g.settlementId]) return undefined; const u = g.pop * SETTLED_SHARE; return u >= RANK.midMin ? "city" : u >= RANK.smallMin ? "town" : "village"; };
/** 集団の人口から、持てる集落の数の上限（大きな集団ほど多い。1〜10） */
export const maxSitesFor = (pop) => Math.max(1, Math.min(10, Math.floor(Math.sqrt(Math.max(0, pop) / 300))));
const ABANDON_POP = 40, ABANDON_YEARS = 5, FOUND_COOLDOWN = 96;

/** 集団の集落ID（存在するものだけ）。旧セーブ（settlementIds が無い）は settlementId から補う */
export function siteIdsOf(civ, g) {
  if (!g) return [];
  if (!Array.isArray(g.settlementIds)) g.settlementIds = g.settlementId ? [g.settlementId] : [];
  const ok = g.settlementIds.filter((id) => civ.settlements[id]);
  if (ok.length !== g.settlementIds.length) g.settlementIds = ok;
  if (g.settlementId && civ.settlements[g.settlementId] && !ok.includes(g.settlementId)) { ok.unshift(g.settlementId); g.settlementIds = ok; }
  return ok;
}

/** 旧セーブの集落に、新しいフィールドを決定的に補う（都市の配置は作り直さない） */
export function upgradeSettlement(civ, s) {
  if (s.weight == null) s.weight = 1;
  if (s.score == null) s.score = 0;
  if (!Array.isArray(s.nameHistory)) s.nameHistory = s.name ? [{ at: s.foundedAt ?? 0, name: s.name, cause: "founding" }] : [];
  const r = effectiveRank(s); if (s.rank !== r) s.rank = r;
  const st = stageOfRank(r); if (s.stage !== st) s.stage = st;
  return s;
}
export function upgradeAllSettlements(civ) { for (const s of Object.values(civ.settlements)) upgradeSettlement(civ, s); for (const g of Object.values(civ.groups)) siteIdsOf(civ, g); return civ; }

/** 新しい集落の記録を作る（foundSettlement・先史の終わり・衛星の新設が共通で使う） */
export function makeSettlement(civ, ids, { groupId, cell, pop, foundedAt, weight = 1, score = 0 }) {
  const id = ids.next("settle"), s = { id, groupId, cell, foundedAt, pop: Math.round(pop), stage: "village", rank: 4, weight, score, nameHistory: [] };
  s.rank = effectiveRank(s); s.stage = stageOfRank(s.rank); civ.settlements[id] = s; return s;
}

/** 名前を付ける（集団の言語から。同じ名前が重ならないよう数回引き直す）。言語がまだ無ければ付けない（あとで refreshSettlements が補う） */
export function nameSettlement(ctx, s, g) {
  const { civ } = ctx; if (s.name || !ctx.nameGen?.place || !g) return false;
  const used = ctx._usedPlaceNames ?? (ctx._usedPlaceNames = new Set()); if (!used.size || ctx._usedPlaceNamesAt !== civ.monthIndex) { used.clear(); ctx._usedPlaceNamesAt = civ.monthIndex; for (const x of Object.values(civ.settlements)) if (x.name) used.add(x.name); }
  let nm = null;
  for (let k = 0; k < 10 && !nm; k++) { const w = ctx.nameGen.place(civ, g, rngOf(hashSeed(civ.historySeed, "sname", s.id, k))); if (w && !used.has(w)) nm = w; else if (w && k === 9) nm = w + ["ポリス", "ブルグ", "ヘイム", "ヴィル"][hashSeed(civ.historySeed, s.id) % 4];
  }
  if (!nm) return false;
  s.name = nm; used.add(nm); s.nameHistory = [{ at: s.foundedAt ?? civ.monthIndex, name: nm, cause: "founding" }]; return true;
}

/**
 * 改称する。nameHistory に追記し、歴史イベント settlement_renamed を「当時の名前」つきで記録する（commands.js から呼ぶ）。
 * ctx: { civ, ids }。戻り値: { ok, unchanged?, event?, error? }
 */
export function renameSettlement(ctx, id, name, cause = "rename") {
  const { civ, ids } = ctx, s = civ.settlements[id]; if (!s) return { ok: false, error: "その集落は存在しない" };
  const nm = String(name ?? "").trim(); if (!nm) return { ok: false, error: "名前が空" };
  if (nm === s.name) return { ok: true, unchanged: true };
  const old = s.name ?? null; if (!Array.isArray(s.nameHistory)) s.nameHistory = old ? [{ at: s.foundedAt ?? 0, name: old, cause: "founding" }] : [];
  s.nameHistory.push({ at: civ.monthIndex, name: nm, cause: String(cause ?? "rename") }); s.name = nm;
  const g = civ.groups[s.groupId], stId = g?.stateId ?? null;
  const ev = makeEvent(civ, ids, { kind: "settlement_renamed", title: old ? `${old}が${nm}と改称された` : `${nm}と命名された`, participants: [{ entityId: id, role: "settlement" }, ...(stId ? [{ entityId: stId, role: "state" }] : [])], location: { cell: s.cell }, why: `改称の理由: ${cause ?? "rename"}`, facts: { settlementId: id, from: old, to: nm, cause: String(cause ?? "rename"), rank: s.rank ?? null } });
  return { ok: true, event: ev };
}

/** 序列・段階を更新する。変わったら出来事（村→町→都市）を残す。変わったら true */
function applyRank(ctx, s) {
  const { civ, ids } = ctx, r = effectiveRank(s), st = stageOfRank(r), oldStage = s.stage, oldRank = s.rank;
  if (r === oldRank && st === oldStage) return false;
  s.rank = r; s.stage = st;
  if (st !== oldStage) makeEvent(civ, ids, { kind: "settlement_stage", title: `${s.name ?? "集落"}が${STAGE_JA[oldStage] ?? oldStage}から${STAGE_JA[st]}へ`, participants: [{ entityId: s.id, role: "settlement" }], location: { cell: s.cell }, why: "集落の人口が、次の段階の基準を超えた（または下回った）", facts: { settlementId: s.id, from: oldStage, to: st, rank: r } });
  return true;
}

/** 集団 g の集落を月次で更新: 人口の配分・序列・名前・年ごとの重みのゆらぎ・放棄。新設は population.js 側（立地選びがあるため） */
export function refreshSettlements(ctx, g) {
  const { civ, ids } = ctx, sites = siteIdsOf(civ, g); if (!sites.length) return;
  const list = sites.map((id) => civ.settlements[id]); const mi = civ.monthIndex;
  for (const s of list) if (s.rank == null || !Array.isArray(s.nameHistory)) upgradeSettlement(civ, s);
  // 年ごとの重みのゆらぎ（集落ごとに月をずらす）。大きい所はやや伸びやすい（集積）
  for (const s of list) {
    if ((mi + (hashSeed(s.id) % 12)) % 12 !== 0) continue;
    const r = rngOf(hashSeed(civ.historySeed, "sdrift", s.id, mi))(); s.weight = Math.min(30, Math.max(0.03, s.weight * Math.exp((r - 0.5) * 0.12 + Math.max(-0.5, Math.min(0.5, s.score ?? 0)) * 0.004)));
  }
  // 人口の配分（集団の都市人口を、重みの比で分ける）
  const U = urbanPop(g); let W = 0; for (const s of list) W += s.weight; if (!(W > 0)) W = 1;
  for (const s of list) { s.pop = Math.round((U * s.weight) / W); if (!s.name) nameSettlement(ctx, s, g); applyRank(ctx, s); }
  // 放棄（中心でも首都でもない小さな集落が、長く衰えたまま）
  if (list.length > 1 && mi % 12 === (hashSeed(g.id) % 12)) {
    for (const s of list) {
      if (s.id === g.settlementId || s.capitalOf) continue;
      if (s.pop < ABANDON_POP) s.lowYears = (s.lowYears ?? 0) + 1; else s.lowYears = 0;
      if (s.lowYears >= ABANDON_YEARS) abandonSettlement(ctx, g, s, "人口が長く減り続け、住む人がいなくなった");
    }
  }
}

export function abandonSettlement(ctx, g, s, why) {
  const { civ, ids } = ctx; delete civ.settlements[s.id]; if (g) g.settlementIds = siteIdsOf(civ, g).filter((x) => x !== s.id);
  if (Array.isArray(civ.roads)) civ.roads = civ.roads.filter((r) => r.a !== s.id && r.b !== s.id);
  makeEvent(civ, ids, { kind: "settlement_abandoned", title: `${s.name ?? "集落"}が放棄された`, participants: [{ entityId: s.id, role: "settlement" }], location: { cell: s.cell }, why, facts: { settlementId: s.id, name: s.name ?? null, rank: s.rank ?? null } });
}

/** 衛星の集落を新設してよい時期か（集団の人口が増えたとき。年 1 回の確認・冷却つき） */
export function wantsNewSite(civ, g) {
  const n = siteIdsOf(civ, g).length, mi = civ.monthIndex; if (!g.settlementId || n >= maxSitesFor(g.pop)) return false;
  if (mi % 12 !== (hashSeed(g.id, "found") % 12)) return false;
  return mi - (g.lastSiteAt ?? -9999) >= FOUND_COOLDOWN;
}

// ---- 首都（不変条件）: 生存するすべての国家の首都は都市。capitalSettlementId と capitalGroupId は常に一致 ----
function clearMark(civ, st) { for (const s of Object.values(civ.settlements)) if (s.capitalOf === st.id) delete s.capitalOf; }
/** 国家 st の首都（集落）を、必要なら選び直して確定する。gs は国家の集団。戻り値: 集落（国に集落が無ければ首都の集団の位置に建てる） */
export function ensureCapital(ctx, st, gs, { force = false } = {}) {
  const { civ, ids } = ctx;
  const cur = st.capitalSettlementId ? civ.settlements[st.capitalSettlementId] : null, curG = cur ? civ.groups[cur.groupId] : null;
  if (!force && cur && curG && curG.stateId === st.id && st.capitalGroupId === cur.groupId && cur.capitalOf === st.id) return cur;
  const pool = gs ?? Object.values(civ.groups).filter((g) => g.stateId === st.id);
  // 候補: まず現在の首都の集団の最大の集落（無用な遷都を避ける）。無ければ国内の最大の集落
  const capG = st.capitalGroupId ? pool.find((x) => x.id === st.capitalGroupId) : null; let best = null;
  const scan = (arr) => { for (const g of arr) for (const id of siteIdsOf(civ, g)) { const s = civ.settlements[id]; if (!s) continue; const key = s.pop + (s.id === st.capitalSettlementId ? 1e-3 : 0); if (!best || key > best.key || (key === best.key && s.id < best.s.id)) best = { s, g, key }; } };
  if (capG) scan([capG]); if (!best) scan(pool);
  if (!best) { // 国内に集落が一つも無い: 首都の集団（無ければ最大の集団）の位置に、首都となる集落を必ず建てる
    const g = (st.capitalGroupId && pool.find((x) => x.id === st.capitalGroupId)) || pool.reduce((a, b) => (!a || b.pop > a.pop ? b : a), null);
    if (!g) return null;
    const s = makeSettlement(civ, ids, { groupId: g.id, cell: g.cell, pop: urbanPop(g), foundedAt: civ.monthIndex });
    g.settlementIds = [...siteIdsOf(civ, g), s.id]; if (!g.settlementId) g.settlementId = s.id; nameSettlement(ctx, s, g);
    makeEvent(civ, ids, { kind: "settlement_founded", title: "首都の成立", participants: [{ entityId: g.id, role: "founder" }, { entityId: s.id, role: "settlement" }, { entityId: st.id, role: "state" }], location: { cell: s.cell }, why: "国家には、首都となる都市が必要だった", facts: { settlementId: s.id, capitalOf: st.id } });
    best = { s, g, key: s.pop };
  }
  const { s, g } = best, prev = st.capitalSettlementId ?? null, changed = prev !== s.id;
  clearMark(civ, st); s.capitalOf = st.id; st.capitalSettlementId = s.id; st.capitalGroupId = g.id;
  upgradeSettlement(civ, s); applyRank(ctx, s);
  if (changed && prev && st.formedAt != null && st.formedAt < civ.monthIndex) makeEvent(civ, ids, { kind: "capital_changed", title: `${st.name}の首都が${s.name ?? "別の都市"}になった`, participants: [{ entityId: st.id, role: "state" }, { entityId: s.id, role: "settlement" }], location: { cell: s.cell }, why: "首都だった都市を失った、または首都が移された", facts: { stateId: st.id, settlementId: s.id } });
  return s;
}
/** 首都を指定の集団へ移す（命令用）。その集団の最大の集落が首都になる */
export function moveCapitalTo(ctx, st, g) {
  const ids2 = siteIdsOf(ctx.civ, g); let big = null; for (const id of ids2) { const s = ctx.civ.settlements[id]; if (s && (!big || s.pop > big.pop)) big = s; }
  st.capitalGroupId = g.id; st.capitalSettlementId = big?.id ?? null; return ensureCapital(ctx, st, null, { force: true });
}
/** 検査用: 首都の不変条件が破れていれば、説明の配列 */
export function capitalProblems(civ) {
  const out = [];
  for (const st of Object.values(civ.states)) {
    if (!st.alive || st.capitalSettlementId === undefined) continue; /* 旧セーブは、最初の月次で補われる */ const s = civ.settlements[st.capitalSettlementId];
    if (!s) { out.push(`国家 ${st.id} の首都の集落が無い`); continue; }
    if (s.groupId !== st.capitalGroupId) out.push(`国家 ${st.id} の首都の集団（${st.capitalGroupId}）と首都の集落の集団（${s.groupId}）が食い違う`);
  }
  return out;
}
