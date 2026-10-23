// v5 M1: 文明シミュレーション（人口集団・集落）を、アプリの月送り・保存・画面につなぐ。
// 文明状態は map.civ（保存対象。.ahmap の拡張チャンク civ.state）、実行器は WeakMap（保存しない）。
import { createCivState } from "../core/civ/civ-state.js";
import { createCivSim } from "../core/civ/civ-sim.js";
import { bestTargets, SUBSISTENCE } from "../core/civ/population.js";
import { monthIndex } from "../core/civ/tick.js";
import { ACTIONS, observe } from "../core/civ/actions.js";

export function createCivActions({ store }) {
  const sims = new WeakMap();
  const mapOf = () => store.getState().map;
  const simOf = (map) => { const civ = map?.civ; if (!civ || !map.world) return null; let s = sims.get(civ); if (!s) { s = createCivSim(map.world, civ); sims.set(civ, s); } return s; };
  return {
    has: () => !!mapOf()?.civ,
    canStart: () => { const m = mapOf(); return !!(m?.world?.entities.start) && !m.civ; },
    /** 選んだ開始集団から、歴史を始める（月次の人口進行が動き出す） */
    start() {
      const map = mapOf(); if (!map?.world) return { ok: false, error: "世界がありません" };
      if (map.civ) return { ok: false, error: "すでに始まっています" };
      const st = map.world.entities.start; if (!st) return { ok: false, error: "先に、初期集団を選んでください" };
      const t = map.worldTime ?? { year: 0, month: 1 };
      let civ; try { civ = createCivState(map.world, { startGroupId: st.groupId, year: t.year, month: t.month }); } catch (e) { return { ok: false, error: e.message }; }
      store.update((s) => { s.map.civ = civ; }); return { ok: true };
    },
    /** 月次tick（time-actions から1か月ごとに呼ばれる）。失敗しても時間進行は止めない */
    advance() {
      const map = mapOf(), sim = simOf(map); if (!sim) return null;
      map.civ.monthIndex = monthIndex(map.worldTime.year, map.worldTime.month) - 1; // 世界時計が正。tick の clock フェーズが +1 して今月に一致する
      try { sim.advanceMonth(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    },
    command(cmd) { const sim = simOf(mapOf()); return sim ? sim.command(cmd) : { ok: false, error: "歴史がまだ始まっていません" }; },
    summary() {
      const civ = mapOf()?.civ; if (!civ) return null; let pop = 0, groups = 0; for (const g of Object.values(civ.groups)) { pop += g.pop; groups++; }
      return { groups, settlements: Object.keys(civ.settlements).length, pop: Math.round(pop), events: civ.events.length, proposals: civ.proposals.filter((p) => !p.resolved).length, states: Object.values(civ.states).filter((x) => x.alive).length, wars: civ.activeWarIds.length, date: civ.date };
    },
    /** 大量の集団でも固定サイズで返す（並び替え・絞り込み・ページ） */
    listGroups({ sort = "pop", query = "", page = 0, pageSize = 40 } = {}) {
      const map = mapOf(), civ = map?.civ; if (!civ) return { rows: [], total: 0, pages: 0 };
      const w = map.world, q = query.trim().toLowerCase();
      let rows = Object.values(civ.groups).filter((g) => !q || g.id.includes(q) || SUBSISTENCE[g.subsistence].includes(q) || (g.player && "プレイヤー".includes(q)));
      rows.sort(sort === "id" ? (a, b) => (a.id < b.id ? -1 : 1) : (a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1));
      const total = rows.length, pages = Math.max(1, Math.ceil(total / pageSize)), p = Math.min(Math.max(0, page), pages - 1);
      return { total, pages, page: p, rows: rows.slice(p * pageSize, (p + 1) * pageSize).map((g) => ({ id: g.id, pop: Math.round(g.pop), subsistence: g.subsistence, player: g.player, settlement: g.settlementId ? civ.settlements[g.settlementId].stage : null, lat: Math.round(w.cell.lat[g.cell] * 573) / 10, lon: Math.round(w.cell.lon[g.cell] * 573) / 10, moving: !!g.order })) };
    },
    /** 国家の一覧（固定サイズ。滅びた国家は含めない既定） */
    listStates({ query = "", page = 0, pageSize = 12, dead = false } = {}) {
      const civ = mapOf()?.civ; if (!civ) return { rows: [], total: 0, pages: 0, page: 0 }; const q = query.trim().toLowerCase();
      const rows = Object.values(civ.states).filter((s) => (dead || s.alive) && (!q || s.id.includes(q) || s.name.includes(query.trim()))).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1));
      const total = rows.length, pages = Math.max(1, Math.ceil(total / pageSize)), p = Math.min(Math.max(0, page), pages - 1);
      return { total, pages, page: p, rows: rows.slice(p * pageSize, (p + 1) * pageSize).map((s) => ({ id: s.id, name: s.name, polity: s.polity, via: s.via, pop: Math.round(s.pop), stability: Math.round(s.stability * 100), alive: s.alive, player: s.player, wars: s.warIds.length, goal: s.strategy?.goal ?? null })) };
    },
    /** 国家のAI判断記録（新しい順。候補・得点・結果つき） */
    recentDecisions(stateId, n = 5) { const civ = mapOf()?.civ; if (!civ) return []; const out = []; for (let i = civ.decisions.length - 1; i >= 0 && out.length < n; i--) if (civ.decisions[i].actorId === stateId) out.push(civ.decisions[i]); return out; },
    /** プレイヤー国家が今とれる行動（実行できるもの＋できない理由） */
    playerStateOptions() {
      const map = mapOf(), civ = map?.civ, sim = simOf(map), st = civ && Object.values(civ.states).find((x) => x.alive && x.player); if (!st || !sim) return null;
      const e = observe(sim.ctx, st), list = []; for (const def of ACTIONS) { if (!def.enabled) continue; for (const c of def.candidates(sim.ctx, st, e)) list.push({ action: def.key, domain: def.domain, label: c.label ?? def.label, target: c.target, opt: c.opt, eligible: c.eligible, reason: c.reason }); }
      return { state: st, options: list };
    },
    stateAction(stateId, action, target = null, opt = null) { return this.command({ type: "stateAction", stateId, action, target, opt }); },
    /** プレイヤー集団が今できること（移住先の候補・提案） */
    playerOptions() {
      const map = mapOf(), civ = map?.civ; if (!civ?.player.groupId) return null; const g = civ.groups[civ.player.groupId]; if (!g) return null;
      const occ = new Map(); for (const o of Object.values(civ.groups)) occ.set(o.cell, 1);
      return { group: g, targets: bestTargets(map.world, civ, g, occ, 5).map((t) => ({ ...t, lat: Math.round(map.world.cell.lat[t.cell] * 573) / 10, lon: Math.round(map.world.cell.lon[t.cell] * 573) / 10 })), proposals: civ.proposals.filter((p) => !p.resolved && p.groupId === g.id) };
    },
  };
}
