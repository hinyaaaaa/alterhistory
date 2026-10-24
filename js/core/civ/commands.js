// v5 M1: プレイヤー集団への命令（初期の「何もできない時間」を作らないための入口）。
// NPC の行動と同じ検証を通す。失敗は { ok:false, error } で返し、状態は変えない。
import { SUBSISTENCE, reachable, POP, foundSettlement, spawnGroup, territoryOf } from "./population.js";
import { makeEvent } from "./events.js";
import { LAND_WATER } from "./world-consts.js";
import { formState, evaluateFormation } from "./states.js";
import { ACTION, findCandidate } from "./actions.js";
import { runPlayerAction } from "./ai.js";
import { recentEventsFor, asCauses } from "./graph.js";

const fail = (error) => ({ ok: false, error });
function playerGroup(civ, groupId) { const g = civ.groups[groupId]; if (!g) return [null, "その集団は存在しません"]; if (!g.player) return [null, "プレイヤーの集団ではありません"]; return [g, null]; }

/** 命令: moveGroup / setSubsistence / foundSettlement / splitGroup / acceptProposal / dismissProposal */
export function applyCommand(ctx, cmd) {
  const { world, civ, ids } = ctx;
  switch (cmd.type) {
    case "moveGroup": {
      const [g, e] = playerGroup(civ, cmd.groupId); if (e) return fail(e);
      if (g.order) return fail("すでに移動中です");
      if (world.cell.landWater[cmd.to] !== LAND_WATER.LAND) return fail("移動先は陸地でなければなりません");
      const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] * 2, g.knowledge.seafaring), d = dist.get(cmd.to);
      if (d == null) return fail(g.knowledge.seafaring < 1 ? "届きません（海を渡る航海の知識がないか、遠すぎます）" : "遠すぎて届きません");
      g.order = { type: "move", to: cmd.to, arriveAt: civ.monthIndex + Math.max(1, Math.ceil(d / 2)) }; g.pop = Math.round(g.pop * (1 - Math.min(0.2, d * 0.01)));
      return { ok: true, arriveAt: g.order.arriveAt };
    }
    case "setSubsistence": {
      const [g, e] = playerGroup(civ, cmd.groupId); if (e) return fail(e);
      if (!SUBSISTENCE[cmd.subsistence]) return fail("未知の生業です");
      if (cmd.subsistence === "agriculture" && g.knowledge.agriculture < 1) return fail("農耕の知識がまだ足りません");
      if (cmd.subsistence === "pastoral" && g.knowledge.herding < 1) return fail("牧畜の知識がまだ足りません");
      if (cmd.subsistence === "fishing" && world.cell.coastDist[g.cell] > 2 && !world.cell.river[g.cell]) return fail("水辺ではないので漁撈はできません");
      const before = g.subsistence; if (before === cmd.subsistence) return fail("すでにその生業です");
      g.subsistence = cmd.subsistence;
      makeEvent(civ, ids, { kind: "subsistence_changed", title: `生業の転換（${SUBSISTENCE[before]}→${SUBSISTENCE[cmd.subsistence]}）`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: cmd.subsistence }], provenance: "player" });
      return { ok: true };
    }
    case "foundSettlement": {
      const [g, e] = playerGroup(civ, cmd.groupId); if (e) return fail(e);
      if (g.settlementId) return fail("すでに定住しています");
      if (g.subsistence === "forage" || g.subsistence === "pastoral") return fail("採集狩猟・牧畜のままでは定住できません（農耕か漁撈へ）");
      if (g.pop < POP.settleMinPop) return fail(`人口が足りません（${POP.settleMinPop}人以上）`);
      const s = foundSettlement(world, civ, ids, g); civ.events[civ.events.length - 1].provenance = "player"; return { ok: true, settlementId: s.id };
    }
    case "splitGroup": {
      const [g, e] = playerGroup(civ, cmd.groupId); if (e) return fail(e);
      if (g.order) return fail("移動中は分派できません");
      if (g.pop < POP.minBudPop * 2) return fail("人口が足りません");
      const dist = reachable(world, g.cell, POP.moveRange[g.subsistence], g.knowledge.seafaring);
      if (!dist.has(cmd.to) || world.cell.landWater[cmd.to] !== LAND_WATER.LAND || cmd.to === g.cell) return fail("そこへは分派できません");
      for (const o of Object.values(civ.groups)) if (territoryOf(world, o.cell).includes(cmd.to) || o.cell === cmd.to) return fail("そこはほかの集団の領域です");
      const moved = Math.round(g.pop * POP.budShare); g.pop -= moved; g.lastBudAt = civ.monthIndex;
      const child = spawnGroup(civ, ids, g, cmd.to, moved); child.player = false; // 分派した集団は NPC として動く（プレイヤーは本隊のみ）
      makeEvent(civ, ids, { kind: "group_split", title: "集団の分派", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: cmd.to }, causes: asCauses(recentEventsFor(civ, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), provenance: "player" });
      return { ok: true, childId: child.id };
    }
    case "formState": { // プレイヤー集団が、国家をつくる（経路は条件を満たしたものから選ぶ）
      const [g, e] = playerGroup(civ, cmd.groupId); if (e) return fail(e); if (g.stateId) return fail("すでに国家に属しています");
      const f = evaluateFormation(ctx, g); if (!f) return fail("国家を形成する条件がまだ整っていません"); if (cmd.via && cmd.via !== f.via) return fail(`その経路では成立しません（現在の条件は「${f.via}」）`);
      const st = formState(ctx, { ...f, player: true }); return st ? { ok: true, stateId: st.id } : fail("形成に失敗しました");
    }
    case "stateAction": { // 国家の行動（プレイヤー国家のみ。AI と同じ候補生成・同じ実行）
      const st = civ.states[cmd.stateId]; if (!st?.alive) return fail("その国家は存在しません"); if (!st.player) return fail("プレイヤーの国家ではありません");
      const def = ACTION[cmd.action]; if (!def) return fail("未知の行動です"); if (!def.enabled) return fail(`この行動はまだ使えません（${def.disabledReason}）`);
      const c = findCandidate(ctx, st, def, { target: cmd.target ?? null, opt: cmd.opt ?? null }); if (!c) return fail("その対象・内容では実行できません"); if (!c.eligible) return fail(c.reason ?? "条件を満たしていません");
      const r = runPlayerAction(ctx, st, def, c); return r.ok ? { ok: true, eventIds: r.eventIds, warId: r.warId } : fail(r.error);
    }
    case "acceptProposal": {
      const p = civ.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved); if (!p) return fail("その提案はありません");
      const map = { change_subsistence: () => ({ type: "setSubsistence", groupId: p.groupId, subsistence: p.payload.subsistence }), found_settlement: () => ({ type: "foundSettlement", groupId: p.groupId }), form_state: () => ({ type: "formState", groupId: p.groupId, via: p.payload.via }), split: () => ({ type: "splitGroup", groupId: p.groupId, to: cmd.to ?? p.payload.targets?.[0]?.cell }) };
      const r = applyCommand(ctx, map[p.kind]()); if (r.ok) p.resolved = true; return r;
    }
    case "dismissProposal": { const p = civ.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved); if (!p) return fail("その提案はありません"); p.resolved = true; return { ok: true }; }
    default: return fail(`未知の命令: ${cmd.type}`);
  }
}
