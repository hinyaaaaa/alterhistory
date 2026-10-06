// 戦争中のハプニング。ありきたりな戦闘だけにならないよう、月ごとにたまに出来事が起きる。
//   ・すぐ起きる出来事（豪雨・疫病・将軍の戦死・義勇兵・反戦デモ・奇襲・調停の申し出など）
//   ・「兆し」から始まる出来事：まず曖昧な噂・予兆だけが記録され、数か月後に本当に起きるか、杞憂に終わる（含みを持たせる）
// 効果は国家の士気・民意・兵力・人口・産業と、戦況の傾き(edgeShift)に反映される。乱数は注入する（再現できる）。
// 純粋ロジック層：DOM に依存しない。
import { mobilized } from "./war-engine.js";
import { officialName } from "../names.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 効果の入れ物（国ごとの増減）。1つのコマンドにまとめて反映するので、同じ国への複数の効果が食い違わない */
export function newFx() { return { morale: new Map(), support: new Map(), popSurv: new Map(), indSurv: new Map(), troops: new Map() }; }
const add = (m, k, d) => m.set(k, (m.get(k) ?? 0) + d);
const mul = (m, k, f) => m.set(k, (m.get(k) ?? 1) * f);

export const addMorale = (fx, id, d) => add(fx.morale, id, d);
export const addSupport = (fx, id, d) => add(fx.support, id, d);
export const mulPop = (fx, id, f) => mul(fx.popSurv, id, f);
export const mulIndustry = (fx, id, f) => mul(fx.indSurv, id, f);
/** 戦争に出ている部隊の兵力を一律に減らす（生き残る割合 f） */
export function mulTroops(fx, map, war, id, f) {
  const st = map.pack.states[id]; if (!isLive(st)) return;
  const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
  for (const r of mobilized(st, m)) mul(fx.troops, `${id}:${r.i}`, f);
}

const sideIds = (war, side) => (side === "attacker" ? war.attackers : war.defenders);
const fighting = (war, ids) => ids.filter((id) => !war.withdrawn?.[id]);

const EVENTS = [
  { id: "storm", w: 3, title: "悪天候",
    run: (c) => { c.edge(-0.015); for (const id of c.fightingOf("attacker")) c.fx.morale.set(id, (c.fx.morale.get(id) ?? 0) - 2); return "豪雨と泥濘で、攻撃側の進軍が滞った"; } },
  { id: "volunteers", w: 2, title: "義勇兵",
    run: (c) => { const side = c.weakerSide(); const id = c.rnd.pick(c.fightingOf(side)); if (id == null) return null; c.moraleOf(id, 6); c.supportOf(id, 3); c.edge(side === "attacker" ? 0.02 : -0.02); return `${c.name(id)}に義勇兵が集まり、士気が上がった`; } },
  { id: "plague", w: 2, title: "疫病",
    run: (c) => { const id = c.pickFighting(); if (id == null) return null; c.troops(id, 0.96); c.pop(id, 0.992); c.moraleOf(id, -4); return `${c.name(id)}の陣中で疫病が広がり、兵力が落ちた`; } },
  { id: "general", w: 2, title: "将軍の戦死",
    run: (c) => { const id = c.pickFighting(); if (id == null) return null; c.moraleOf(id, -8); c.edge(c.sideOfState(id) === "attacker" ? -0.01 : 0.01); return `${c.name(id)}軍の司令官が戦死し、指揮系統が乱れた`; } },
  { id: "ambush", w: 2, title: "奇襲",
    run: (c) => { const side = c.rnd.next() < 0.5 ? "attacker" : "defender"; const foe = side === "attacker" ? "defender" : "attacker"; const id = c.rnd.pick(c.fightingOf(foe)); const hero = c.rnd.pick(c.fightingOf(side)); if (id == null || hero == null) return null; c.troops(id, 0.97); c.moraleOf(id, -5); c.edge(side === "attacker" ? 0.02 : -0.02); return `${c.name(hero)}軍が奇襲に成功し、${c.name(id)}軍は後退した`; } },
  { id: "famine", w: 2, title: "物資の逼迫",
    run: (c) => { const id = c.pickFighting(); if (id == null) return null; c.supportOf(id, -3); c.moraleOf(id, -3); c.pop(id, 0.995); return `${c.name(id)}で前線への物資が滞り、不満が高まった`; } },
  { id: "mediation", w: 1, title: "調停の申し出",
    run: (c) => { const n = c.neutral(); if (n == null) return null; for (const id of c.fightingAll()) c.supportOf(id, 2); c.setMediator(n); return `${c.name(n)}が調停を申し出た。講和の機運が高まっている`; } },
  { id: "protest", w: 2, title: "反戦運動",
    run: (c) => { const id = c.pickFighting(); if (id == null) return null; c.supportOf(id, -7); return `${c.name(id)}の首都で反戦デモが起き、政府が動揺した`; } },
  { id: "breakthrough", w: 1, title: "技術的突破",
    run: (c) => { const id = c.bestTech(); if (id == null) return null; c.moraleOf(id, 4); c.edge(c.sideOfState(id) === "attacker" ? 0.02 : -0.02); return `${c.name(id)}が新型兵器を実戦投入し、戦況が動いた`; } },
  { id: "hero", w: 1, title: "奇跡の防戦",
    run: (c) => { const side = c.weakerSide(); const id = c.rnd.pick(c.fightingOf(side)); if (id == null) return null; c.moraleOf(id, 7); return `${c.name(id)}軍の無名の将校が奇跡的な防戦を指揮し、士気が上がった`; } },
];

// 兆し：まず曖昧な予兆だけが出る。will が true のものだけが、due の月に実際に起きる
const OMENS = [
  { id: "unrest", w: 3, title: "不穏な空気", delay: [2, 4], fulfill: 0.6,
    omen: (c, id) => `${c.name(id)}軍の兵営で、不穏な空気が流れているという`,
    resolve: (c, o) => { c.moraleOf(o.stateId, -14); c.troops(o.stateId, 0.94); c.supportOf(o.stateId, -5); return `${c.name(o.stateId)}軍で反乱が起き、部隊の一部が脱走した`; },
    fade: (c, o) => `${c.name(o.stateId)}軍の不穏な噂は、杞憂に終わった` },
  { id: "envoys", w: 2, title: "使節の往来", delay: [2, 5], fulfill: 0.5, global: true,
    omen: () => "中立国の使節が、交戦国の間を行き来しているらしい",
    resolve: (c) => { for (const id of c.fightingAll()) c.supportOf(id, 5); c.setMediator(c.neutral()); return "水面下の交渉が実を結びつつあり、両国で講和を望む声が強まった"; },
    fade: () => "使節の往来は、実を結ばなかった" },
  { id: "sabotage", w: 2, title: "原因不明の停電", delay: [1, 3], fulfill: 0.5,
    omen: (c, id) => `${c.name(id)}の工業地帯で、原因不明の停電が続いている`,
    resolve: (c, o) => { c.industry(o.stateId, 0.95); c.moraleOf(o.stateId, -3); return `${c.name(o.stateId)}で大規模な破壊工作が発覚した（実行者は不明）`; },
    fade: (c, o) => `${c.name(o.stateId)}の停電は、設備の老朽化が原因と分かった` },
  { id: "weapon", w: 2, title: "新兵器の噂", delay: [2, 5], fulfill: 0.4,
    omen: (c, id) => `${c.name(id)}が新兵器を試験しているとの噂が広がっている`,
    resolve: (c, o) => { const foe = c.foeOf(o.stateId); if (foe != null) c.moraleOf(foe, -5); c.edge(c.sideOfState(o.stateId) === "attacker" ? 0.03 : -0.03); return `${c.name(o.stateId)}が新兵器を実戦に投入し、敵軍に動揺が走った`; },
    fade: (c, o) => `${c.name(o.stateId)}の新兵器の噂は、誇張だった` },
  { id: "border", w: 2, title: "第三国の動き", delay: [2, 4], fulfill: 0.4, global: true,
    omen: () => "第三国が国境付近で兵を動かしているとの報せが入った",
    resolve: (c) => { const id = c.strongerId(); if (id != null) { c.supportOf(id, -4); c.moraleOf(id, -3); } return "第三国の動員を受け、優位な側が二正面を警戒し始めた"; },
    fade: () => "第三国の動きは、演習に過ぎなかった" },
];

const pickWeighted = (list, rnd) => { const tot = list.reduce((n, x) => n + x.w, 0); let r = rnd.next() * tot; for (const x of list) { r -= x.w; if (r <= 0) return x; } return list[list.length - 1]; };

/** 戦争の形態ごとの、月ごとの出来事の起きやすさ */
const RATE = { limited: 0.06, conventional: 0.1, total: 0.13, asymmetric: 0.13 };
const MAX_EVENTS = 40;

/**
 * 戦争1つの、ある月の出来事を決める。効果は fx に足し込み、記録と傾きを返す。
 * @returns {{events:object[], omens:object[], edgeShift:number, mediator:number|null}}
 */
export function rollWarMonth(map, war, date, rnd, fx) {
  const events = [], omens = [...(war.omens ?? [])];
  let edgeShift = 0, mediator = war.mediator ?? null;
  const all = [...war.attackers, ...war.defenders].filter((id) => isLive(map.pack.states[id]));
  const strongA = (war.result?.aStrength?.land ?? 0) >= (war.result?.dStrength?.land ?? 0);
  const c = {
    map, war, rnd, fx,
    name: (id) => officialName(map.pack.states[id], `国家${id}`),
    fightingOf: (side) => fighting(war, sideIds(war, side)).filter((id) => isLive(map.pack.states[id])),
    fightingAll: () => fighting(war, all),
    pickFighting: () => { const l = fighting(war, all); return l.length ? rnd.pick(l) : null; },
    sideOfState: (id) => (war.attackers.includes(id) ? "attacker" : "defender"),
    foeOf: (id) => { const l = fighting(war, war.attackers.includes(id) ? war.defenders : war.attackers).filter((x) => isLive(map.pack.states[x])); return l.length ? rnd.pick(l) : null; },
    weakerSide: () => (strongA ? "defender" : "attacker"),
    strongerId: () => { const l = fighting(war, strongA ? war.attackers : war.defenders); return l.length ? l[0] : null; },
    bestTech: () => all.filter((id) => !war.withdrawn?.[id]).sort((a, b) => (map.pack.states[b].techLevel ?? 3) - (map.pack.states[a].techLevel ?? 3))[0] ?? null,
    neutral: () => { const n = map.pack.states.filter((s) => isLive(s) && !all.includes(s.i)); return n.length ? rnd.pick(n).i : null; },
    edge: (d) => { edgeShift += d; },
    moraleOf: (id, d) => addMorale(fx, id, d), supportOf: (id, d) => addSupport(fx, id, d),
    pop: (id, f) => mulPop(fx, id, f), industry: (id, f) => mulIndustry(fx, id, f),
    troops: (id, f) => mulTroops(fx, map, war, id, f),
    setMediator: (id) => { if (id != null) mediator = id; },
  };
  const log = (kind, title, text, oid = null) => events.push({ date, kind, title, text, ...(oid ? { oid } : {}) });
  const nowIdx = date.year * 12 + date.month;
  // 同じ種類の兆しは、続けて起きない（直近8か月以内に出た種類は除く）。同じ噂が何度も繰り返されるのを防ぐ
  const recentOmen = new Set((war.events ?? []).filter((e) => e.oid && e.date && nowIdx - (e.date.year * 12 + e.date.month) <= 8).map((e) => e.oid));
  for (const o of omens) recentOmen.add(o.id);

  // 1) 予兆の期限が来たものを、実現させるか杞憂にする
  for (let k = omens.length - 1; k >= 0; k--) {
    const o = omens[k];
    if (o.due.year * 12 + o.due.month > date.year * 12 + date.month) continue;
    const def = OMENS.find((x) => x.id === o.id); omens.splice(k, 1); if (!def) continue;
    if (o.will) log("omen-fulfilled", def.title, def.resolve(c, o), def.id); else log("omen-faded", def.title, def.fade(c, o), def.id);
  }
  // 2) 新しい出来事 / 予兆
  const total = (war.events ?? []).length;
  if (total < MAX_EVENTS) {
    const rate = RATE[war.type] ?? 0.2;
    if (rnd.next() < rate) {
      for (let tries = 0; tries < 4; tries++) { const ev = pickWeighted(EVENTS, rnd); const text = ev.run(c); if (text) { log("event", ev.title, text); break; } }
    } else if (omens.length < 2 && rnd.next() < 0.07) {
      const pool = OMENS.filter((x) => !recentOmen.has(x.id)); const def = pool.length ? pickWeighted(pool, rnd) : null;
      if (!def) return { events, omens, edgeShift, mediator };
      const stateId = def.global ? null : rnd.pick(fighting(war, all).filter((id) => isLive(map.pack.states[id])));
      if (def.global || stateId != null) {
        const [d0, d1] = def.delay, delay = d0 + Math.floor(rnd.next() * (d1 - d0 + 1));
        const t = date.year * 12 + (date.month - 1) + delay;
        omens.push({ id: def.id, stateId, due: { year: Math.floor(t / 12), month: (t % 12) + 1 }, will: rnd.next() < def.fulfill });
        log("omen", def.title, def.omen(c, stateId), def.id);
      }
    }
  }
  return { events, omens, edgeShift, mediator };
}

/** 国家に効果を反映する部品を作る。国ごとにまとめて1回だけ書き換える。troops は部隊ごと */
export function fxParts(map, fx, setProps) {
  const parts = [];
  for (const key of fx.troops.keys()) {
    const [sid, rid] = key.split(":").map(Number), st = map.pack.states[sid], reg = (st?.military ?? []).find((r) => r.i === rid);
    if (!reg) continue; const f = fx.troops.get(key), u = { ...reg.u };
    for (const k of Object.keys(u)) if (k !== "nuclear") u[k] = Math.max(0, Math.floor((u[k] ?? 0) * f));
    parts.push(setProps(reg, { u }));
  }
  const ids = new Set([...fx.morale.keys(), ...fx.support.keys(), ...fx.popSurv.keys(), ...fx.indSurv.keys()]);
  for (const id of ids) {
    const st = map.pack.states[id]; if (!isLive(st)) continue;
    const pop0 = (st.rural ?? 0) + (st.urban ?? 0), ps = fx.popSurv.get(id) ?? 1, is = fx.indSurv.get(id) ?? 1;
    const patch = {};
    if (fx.morale.has(id)) patch.morale = clamp((st.morale ?? 70) + fx.morale.get(id), 0, 100);
    if (fx.support.has(id)) patch.support = clamp((st.support ?? 70) + fx.support.get(id), 0, 100);
    if (ps !== 1) { patch.popPeak = Math.max(st.popPeak ?? 0, pop0); patch.rural = Math.round((st.rural ?? 0) * ps * 100) / 100; patch.urban = Math.round((st.urban ?? 0) * ps * 100) / 100; }
    if (is !== 1) patch.industry = Math.round((st.industry ?? 0) * is * 10) / 10;
    parts.push(setProps(st, patch));
  }
  return parts;
}
