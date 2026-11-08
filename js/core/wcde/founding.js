// v6 M2 → v6.4.0: 建国。担当（プレイヤー）・創造主・反乱の 3 つが、同じ流れ（foundNation）を通る。自然発生する国家は、同じ項目を AI（シミュレーション）が自動で埋める。
//   流れ: 国名 → 政体（15 種）→ 役職（政体ごとに複数選択。あとでいつでも変更可）→ 為政者の顔と名前 → 首都（国家のない都市／新しい都市）→ 技術・軍事ドクトリン（WCDE の制限の範囲）。
//   領域は首都の周りの「国家のない集団」から WCDE が決める（ユーザーは決めない）。
//   先史が終わると phase=founding で止まり、担当して始める（フローA）か、世界に任せて始める（フローB・創造主）。
import { groupCaps, adoptable, TECH } from "../civ/tech.js";
import { evaluateFormation, formState, VIA } from "../civ/states.js";
import { spatialOf, invalidateMonthCaches } from "../civ/spatial.js";
import { reachable, spawnGroup, foundSettlement } from "../civ/population.js";
import { makeEvent } from "../civ/events.js";
import { leaderRng } from "./domains/naming.js";
import { languageOfGroup } from "./domains/language.js";
import { takeControl } from "./control.js";
import { initMilitary, nodesOf, canAdopt, adoptDoctrine } from "./domains/military.js";
import { REGIMES, DEFAULT_REGIME, regimeGate, checkOffices, defaultOffices, officeJa, OFFICES, regimeOf } from "./regimes.js";

const POLITY_CHOICES = { city_state: ["chiefdom", "tribal"], religious_polity: ["theocracy", "tribal"], agri_union: ["tribal", "chiefdom"], nomad_confederation: ["tribal", "chiefdom"] };
const dominant = (g) => g.cohorts.reduce((b, c) => (c.share > b.share ? c : b));
const MAX_SEEDS = 600, REALM_REACH = 8, REALM_MAX_GROUPS = 16, LOOKS = 12, NEW_CITY_REACH = 4;
const fail = (error) => ({ ok: false, error });
const isSea = (w, c) => w.cell.landWater[c] === 0 || w.cell.elevation[c] <= 0, isLake = (w, c) => w.cell.landWater[c] === 2;

/** 今、成立できる文明候補（計算のみ。ID を消費しない）。人口の多い定住集団から順に、重ならないように */
export function listCandidates(w) {
  const { civ, sim } = w, ctx = sim.ctx; ctx._spatial = null; spatialOf(ctx); // 索引を今の月で作り直す
  const seeds = Object.values(civ.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)).slice(0, MAX_SEEDS), used = new Set(), out = [];
  for (const g of seeds) {
    if (used.has(g.id)) continue; const f = evaluateFormation(ctx, g); if (!f || f.groupIds.some((i) => used.has(i))) continue;
    for (const i of f.groupIds) used.add(i);
    const gs = f.groupIds.map((i) => civ.groups[i]), cap = gs.reduce((a, b) => (b.pop > a.pop ? b : a)), d = dominant(cap);
    out.push({ via: f.via, viaJa: VIA[f.via].ja, groupIds: f.groupIds, seedGroupId: g.id, capitalGroupId: cap.id, cell: cap.cell, pop: Math.round(gs.reduce((s, x) => s + x.pop, 0)), cultureId: d.cultureId, languageId: languageOfGroup(cap), religionId: d.religionId, speciesId: cap.speciesId, polityOptions: (() => { const caps = groupCaps(civ, cap), o = (POLITY_CHOICES[f.via] ?? ["tribal"]).filter((p) => p === "tribal" || caps.has("polity:chiefdom")); return o.length ? o : ["tribal"]; })() });
  }
  return out;
}
/** 候補を保存する（ID は首都集団＋経路で安定させる。再計算しても同じ候補は同じ ID） */
export function refreshCandidates(w) {
  const { civ, sim } = w, prev = new Map((civ.wcde.candidates ?? []).map((c) => [c.seedGroupId + "|" + c.via, c.id])), list = listCandidates(w);
  civ.wcde.candidates = list.map((c) => ({ id: prev.get(c.seedGroupId + "|" + c.via) ?? sim.ctx.ids.next("candidate"), ...c }));
  return civ.wcde.candidates;
}

/* ---------- 首都の選択: 国家のない都市／新しい都市 ---------- */
/** 首都にできる場所（国家のない定住集団。人口の多い順）。regime を渡すと、その政体を選べるか（技術）も付ける */
export function capitalSites(w, regime = null, limit = 400) {
  const { civ } = w; const out = [];
  for (const g of Object.values(civ.groups)) {
    if (!g.settlementId || g.stateId || g.pop < 150) continue; const s = civ.settlements[g.settlementId]; if (!s) continue;
    const reason = regime ? regimeGate(civ, g, regime) : null;
    out.push({ groupId: g.id, cell: s.cell ?? g.cell, pop: Math.round(g.pop), stage: s.stage ?? "village", name: s.name ?? null, ok: !reason, reason });
  }
  return out.sort((a, b) => b.pop - a.pop || (a.groupId < b.groupId ? -1 : 1)).slice(0, limit);
}
/** 首都の計画（何も変えない）。groupId か cell で指す。kind: existing（国家のない都市）／settle（集落のない集団に都市を築く）／new（何もない土地に新しい都市を建てる） */
export function planCapital(w, { groupId = null, cell = null }) {
  const { civ, sim } = w, ctx = sim.ctx, world = w.world; ctx._spatial = null; const { home } = spatialOf(ctx);
  let g = groupId ? civ.groups[groupId] : null;
  if (!g && cell != null) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= world.cell.landWater.length) return fail("その場所は地図にありません");
    if (isSea(world, cell) || isLake(world, cell)) return fail("海や湖には都市を築けません");
    const gid = home.get(cell) ?? Object.values(civ.groups).find((x) => (x.cells ?? [x.cell]).includes(cell))?.id; g = gid ? civ.groups[gid] : null;
    if (!g) { // 何もない土地: 近くの国家のない集団から人が移り住んで、新しい都市になる
      const near = reachable(world, cell, NEW_CITY_REACH, 0); let best = null, bd = 1e9;
      for (const [c, d] of near) { const gid2 = home.get(c); const o = gid2 && civ.groups[gid2]; if (!o || o.stateId || o.pop < 800) continue; if (d < bd || (d === bd && o.pop > best.pop)) { bd = d; best = o; } }
      if (!best) return fail("その場所の近くには、都市を築けるだけの人がいません（国家のない集団が必要です）");
      return { ok: true, kind: "new", parentId: best.id, cell, pop: Math.round(Math.min(2000, Math.max(300, best.pop * 0.25))), group: null };
    }
  }
  if (!g) return fail("その場所の集団が見つかりません");
  if (g.stateId) return fail("すでに国家の領土です（既存の国家の都市は選べません）");
  if (g.pop < 150) return fail("人が少なすぎます");
  // 国家のない集団の領土の中で、都市（集落）の場所とは別の場所を選んだら、そこに新しい都市を建てる（人が移り住む）
  if (groupId == null && cell != null && g.pop >= 800) { const sCell = g.settlementId ? civ.settlements[g.settlementId]?.cell ?? g.cell : g.cell; if (cell !== sCell) return { ok: true, kind: "new", parentId: g.id, cell, pop: Math.round(Math.min(2000, Math.max(300, g.pop * 0.25))), group: null }; }
  if (g.settlementId) return { ok: true, kind: "existing", groupId: g.id, cell: civ.settlements[g.settlementId]?.cell ?? g.cell, pop: Math.round(g.pop), group: g };
  return { ok: true, kind: "settle", groupId: g.id, cell: g.cell, pop: Math.round(g.pop), group: g };
}
/** 計画を実行して、首都の集団を返す（ここで初めて世界を変える） */
function commitCapital(ctx, plan) {
  const { world, civ, ids } = ctx;
  if (plan.kind === "existing") return plan.group;
  if (plan.kind === "settle") { foundSettlement(world, civ, ids, plan.group); return plan.group; }
  const parent = civ.groups[plan.parentId]; parent.pop = Math.max(1, parent.pop - plan.pop);
  const g = spawnGroup(civ, ids, parent, plan.cell, plan.pop); g.stateId = null; foundSettlement(world, civ, ids, g); return g;
}

/* ---------- 領域: 首都の周りの国家のない集団を、WCDE が決める ---------- */
export function planRealm(w, capGroupId) {
  const { civ, sim } = w, ctx = sim.ctx, world = w.world, cap = civ.groups[capGroupId]; if (!cap) return { groupIds: [], pop: 0, cells: 0 };
  ctx._spatial = null; const { home } = spatialOf(ctx), dist = reachable(world, cap.cell, REALM_REACH, 0), cand = [];
  for (const [c, d] of dist) { const gid = home.get(c); if (!gid || gid === cap.id) continue; const o = civ.groups[gid]; if (!o || o.stateId || o.player || o.pop < 30) continue; cand.push([d, o]); }
  cand.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || (a[1].id < b[1].id ? -1 : 1));
  const groups = [cap, ...cand.slice(0, REALM_MAX_GROUPS - 1).map((x) => x[1])];
  return { groupIds: groups.map((g) => g.id), pop: Math.round(groups.reduce((s, g) => s + g.pop, 0)), cells: groups.reduce((s, g) => s + (g.cells?.length || 1), 0) };
}
const viaFallback = (civ, cap) => { const s = cap.settlementId ? civ.settlements[cap.settlementId] : null; if (s && (s.stage === "town" || s.stage === "city")) return "city_state"; if (cap.subsistence === "pastoral") return "nomad_confederation"; if (cap.subsistence === "agriculture") return "agri_union"; return "city_state"; };

/* ---------- 技術・軍事ドクトリンの選択肢（WCDE の制限の範囲） ---------- */
const MAX_START_TECH = 3, TECH_TIER_MAX = 3;
export function techChoices(w, groupIds) {
  const { civ, sim } = w, gs = groupIds.map((i) => civ.groups[i]).filter(Boolean);
  return adoptable(sim.ctx, { techAdopted: {} }, gs).filter((t) => t.tier <= TECH_TIER_MAX).slice(0, 60).map((t) => ({ key: t.key, name: t.name, field: t.field, tier: t.tier }));
}
export function doctrineChoices(w, techKeys = []) {
  const stub = { id: "stub", techAdopted: Object.fromEntries(techKeys.map((k) => [k, 0])), military: initMilitary(), treasury: 1e9 };
  return nodesOf(stub).filter((d) => !d.special && canAdopt(stub, d.id).ok && !(d.prereq?.length)).map((d) => ({ id: d.id, ja: d.ja, branch: d.branch ?? null, cost: d.cost }));
}

/* ---------- 為政者・役職の担当者 ---------- */
const personName = (ctx, civ, cap, rng) => ctx.nameGen?.person?.(civ, cap, rng) ?? "名もなき人";
/** 役職の担当者を決める（元首は為政者）。決定的（シミュレーションの乱数を使わない） */
export function assignOffices(ctx, st, ids, { keep = null } = {}) {
  const { civ } = ctx, cap = civ.groups[st.capitalGroupId] ?? Object.values(civ.groups).find((g) => g.stateId === st.id), r = REGIMES[regimeOf(st)], old = new Map((keep ?? st.offices ?? []).map((o) => [o.id, o]));
  st.offices = ids.map((id) => { if (id === r.ruler) return { id, holder: { name: st.leader.name, look: st.leader.look ?? 0 }, since: old.get(id)?.since ?? civ.monthIndex }; const o = old.get(id); if (o) return o; const rng = leaderRng(civ, st, "office", id); return { id, holder: { name: personName(ctx, civ, cap, rng), look: Math.floor(rng() * LOOKS) }, since: civ.monthIndex }; });
  st.interpDirty = true; return st.offices;
}
/** AI の国家など、役職を持たない国家に、標準の役職を置く（読み取りのたびに呼んでよい） */
export function ensureOffices(ctx, st) { if (!st.offices?.length) assignOffices(ctx, st, defaultOffices(regimeOf(st))); return st.offices; }

/* ---------- 検証と共通の建国 ---------- */
function checkSpec(w, s) {
  const { civ } = w;
  const auto = !!s.auto, nm = String(s.name ?? "").trim(); if ((!nm && !auto) || nm.length > 30) return fail("国名は 1〜30 文字で決めてください"); if (nm && Object.values(civ.states).some((x) => x.alive && x.name === nm)) return fail("同じ名前の国がすでにあります");
  if (!REGIMES[s.regime]) return fail("政体を選んでください");
  const oe = checkOffices(s.regime, s.offices); if (oe) return fail(oe);
  const ln = String(s.leader?.name ?? "").trim(); if ((!ln && !auto) || ln.length > 30) return fail("為政者の名前は 1〜30 文字で決めてください");
  if (s.leader?.look != null && !(Number.isInteger(s.leader.look) && s.leader.look >= 0 && s.leader.look < 1000)) return fail("顔の指定が不正です");
  return { ok: true, name: nm, leaderName: ln };
}
/** 3 つの経路（担当・創造主・反乱）に共通の建国。spec: { name, regime, offices[], leader:{name,look}, capital:{groupId|cell}, techs[], doctrine, groupIds?（領域の指定。反乱のとき） }
 *  mode: "player"（担当して始める）／"creator"（担当しない）／"rebel"（反乱。predecessor・cause を渡す） */
export function foundNation(w, spec, { mode = "player", predecessor = null, cause = null, via: viaIn = null } = {}) {
  const { civ, sim } = w, ctx = sim.ctx, c = checkSpec(w, spec); if (!c.ok) return c;
  const plan = planCapital(w, spec.capital ?? {}); if (!plan.ok) return plan;
  const capG = plan.group ?? civ.groups[plan.parentId]; const gate = regimeGate(civ, capG, spec.regime); if (gate) return fail(`この首都では「${REGIMES[spec.regime].ja}」を選べません（${gate}）`);
  const techs = [...new Set(spec.techs ?? [])]; if (techs.length > MAX_START_TECH) return fail(`最初に取れる技術は ${MAX_START_TECH} つまで`);
  // 技術・ドクトリンの検証は、首都を確定する前に（失敗したら世界を変えない）
  const realm0 = spec.groupIds ?? planRealm(w, plan.groupId ?? plan.parentId).groupIds, allowed = new Set(techChoices(w, realm0).map((t) => t.key));
  for (const k of techs) if (!allowed.has(k)) return fail(`技術「${TECH[k]?.name ?? k}」は、この領域ではまだ選べません`);
  if (spec.doctrine != null && !doctrineChoices(w, techs).some((d) => d.id === spec.doctrine)) return fail("そのドクトリンは、選んだ技術では取れません");
  const cap = commitCapital(ctx, plan); const realm = (spec.groupIds ?? planRealm(w, cap.id).groupIds).slice(); if (!realm.includes(cap.id)) realm.unshift(cap.id);
  ctx._spatial = null; const f = evaluateFormation(ctx, cap), via = viaIn ?? (f?.via ?? viaFallback(civ, cap));
  const st = formState(ctx, { via, groupIds: realm, player: mode === "player", name: c.name || null, polity: REGIMES[spec.regime].core, predecessor, cause, capitalGroupId: cap.id }); if (!st) return fail("国家の形成に失敗しました");
  st.regime = spec.regime; if (c.leaderName) st.leader.name = c.leaderName; st.leader.look = spec.leader?.look ?? Math.floor(leaderRng(civ, st, "look")() * LOOKS); st.leader.title = officeJa(REGIMES[spec.regime].ruler);
  assignOffices(ctx, st, spec.offices);
  st.techAdopted = st.techAdopted ?? {}; for (const k of techs) st.techAdopted[k] = civ.monthIndex;
  if (spec.doctrine != null) { const pay = (nodesOf(st).find((d) => d.id === spec.doctrine)?.cost ?? 0); st.treasury += pay; const r = adoptDoctrine(ctx, st, spec.doctrine, { provenance: mode === "creator" ? "creator" : "player" }); if (!r.ok) st.treasury -= pay; }
  makeEvent(civ, ctx.ids, { kind: "state_constituted", title: `${st.name}が「${REGIMES[spec.regime].ja}」として国の形を定めた（${st.leader.title} ${st.leader.name}）`, participants: [{ entityId: st.id, role: "state" }], location: { cell: cap.cell }, facts: { stateId: st.id, regime: spec.regime, offices: spec.offices.slice(), capitalCell: cap.cell, techs }, causes: st.formedEvent ? [{ targetId: st.formedEvent, relation: "caused_by", basis: "direct" }] : [], provenance: mode === "creator" ? "creator" : "player" });
  invalidateMonthCaches(ctx); ctx._byState = null;
  if (mode === "player") { const r = takeControl(w, st.id); if (!r.ok) return r; civ.wcde.phase = "running"; civ.wcde.foundedAt = civ.monthIndex; civ.wcde.candidates = []; }
  return { ok: true, stateId: st.id, capitalKind: plan.kind, realmGroups: realm.length };
}

/** フローA: 建国して、その国家を担当する。新しい流れ（regime・capital を含む spec）と、古い呼び方（candidateId・name・polity）の両方を受ける */
export function foundAsPlayer(w, c) {
  const { civ } = w;
  if (c.regime || c.capital) return foundNation(w, c, { mode: "player" });
  const cand = (civ.wcde.candidates ?? []).find((x) => x.id === c.candidateId); if (!cand) return fail("その候補はありません");
  const regime = c.polity && DEFAULT_REGIME[c.polity] ? DEFAULT_REGIME[c.polity] : DEFAULT_REGIME[cand.polityOptions?.[0] ?? "tribal"];
  return foundNation(w, { auto: true, name: c.name ?? "", regime, offices: defaultOffices(regime), leader: { name: c.leaderName ?? "" }, capital: { groupId: cand.capitalGroupId }, groupIds: cand.groupIds }, { mode: "player", via: cand.via });
}
/** 創造主が国家を新しく作る（担当しない。建国の流れは同じ） */
export function foundAsCreator(w, spec) { return foundNation(w, spec, { mode: "creator" }); }
/** フローB: 国家を担当せず、世界を AI に任せて始める */
export function delegateToWorld(w) { const { civ } = w; civ.wcde.phase = "running"; civ.wcde.foundedAt = civ.monthIndex; civ.wcde.control.stateId = null; return { ok: true }; }

/** 建国の画面に渡す情報（何も変えない）。regime・capital を渡すと、その先の選択肢も返す */
export function foundingOptions(w, { regime = null, capital = null, techs = [] } = {}) {
  const { civ } = w, out = { ok: true, regimes: [], sites: [], looks: LOOKS, maxTech: MAX_START_TECH };
  const anyG = Object.values(civ.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop).slice(0, 80);
  out.regimes = Object.keys(REGIMES).map((id) => { const reasons = anyG.map((g) => regimeGate(civ, g, id)); const ok = reasons.some((r) => !r); return { id, ja: REGIMES[id].ja, blurb: REGIMES[id].blurb, ruler: officeJa(REGIMES[id].ruler), heredity: REGIMES[id].heredity, offices: REGIMES[id].offices.map((o) => ({ id: o, ja: officeJa(o), dom: OFFICES[o][1] })), defaultOffices: defaultOffices(id), ok, reason: ok ? null : (reasons[0] ?? "この世界の誰もまだ条件を満たしていない") }; });
  out.sites = regime ? capitalSites(w, regime) : [];
  if (capital) {
    const p = planCapital(w, capital); if (!p.ok) return { ...out, capitalError: p.error };
    const gid = p.groupId ?? p.parentId, realm = planRealm(w, gid), g = civ.groups[gid];
    out.capital = { kind: p.kind, cell: p.cell, pop: p.pop, groupId: p.groupId ?? null }; out.realm = realm; out.techChoices = techChoices(w, realm.groupIds); out.doctrineChoices = doctrineChoices(w, techs);
    out.capitalInfo = { cultureId: dominant(g).cultureId, languageId: languageOfGroup(g), religionId: dominant(g).religionId }; if (regime) out.gate = regimeGate(civ, g, regime);
  }
  return out;
}
