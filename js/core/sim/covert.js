// 隠密作戦（サイバー攻撃など）。宣戦布告なしに、相手の国力を静かに削る。
//   ・作戦の種類: 指揮通信網への侵入（士気・兵力）／金融・産業システムへの攻撃（産業・国庫）／情報操作（民意）
//   ・成功率と効果は、攻撃側と標的国の技術水準の差で決まる。高技術の国ほど、成功しやすく、威力が大きい
//   ・発覚しやすさは、標的国の技術水準で決まる。発覚しても、攻撃元は必ず特定されるとは限らない
//     （約3割は別の国の仕業と誤認される）。ユーザーには、実際の攻撃元と「対外的にどう見られたか」の両方が記録される
// 純粋ロジック層：DOM に依存しない。乱数は注入する。
import { makeCommand, setProps } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { regimentsOf } from "./military.js";
import { officialName } from "../names.js";
import { getFinance } from "./trade.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const COVERT_KINDS = Object.freeze([
  { key: "command", label: "指揮通信網への侵入", icon: "📡", desc: "軍の指揮・通信を乱す。標的国の士気と兵力が下がる。戦争中の相手に特に効く。" },
  { key: "economy", label: "金融・産業システムへの攻撃", icon: "💹", desc: "工場の制御や決済網を止める。標的国の産業と国庫が減る。" },
  { key: "info", label: "情報操作・世論工作", icon: "📰", desc: "偽情報で世論を揺さぶる。標的国の民意が下がり、戦争を続けにくくなる。" },
]);
export const COVERT_BY_KEY = Object.fromEntries(COVERT_KINDS.map((k) => [k.key, k]));

export const listCovertOps = (map) => map.ext?.data?.covertOps ?? [];
const writeOps = (m, list) => { const e = ensureExt(m); e.data.covertOps = list; if (!list.length) delete e.data.covertOps; };
const nextId = (map) => { const l = listCovertOps(map); return l.length ? Math.max(...l.map((o) => o.id)) + 1 : 1; };

/** 作戦の見積もり（成功率・発覚率・効果の大きさ）。副作用なし */
export function covertOdds(map, attackerId, targetId, kind) {
  const A = map.pack.states[attackerId], T = map.pack.states[targetId];
  const ta = clamp(A?.techLevel ?? 3, 1, 10), tt = clamp(T?.techLevel ?? 3, 1, 10);
  const success = clamp(0.55 + 0.07 * (ta - tt), 0.25, 0.92);
  const detect = clamp(0.2 + 0.05 * tt - 0.02 * ta, 0.08, 0.7);
  const power = clamp(0.5 + 0.1 * ta - 0.03 * tt, 0.3, 1.4); // 効果の倍率
  return { success, detect, power, kind };
}

/**
 * 作戦を実行する。
 * @returns {{command, op}}  op: 記録（成功・発覚・誤認など）
 */
export function planCovertOp(map, { attackerId, targetId, kind, date, rnd }) {
  const A = map.pack.states[attackerId], T = map.pack.states[targetId];
  if (!isLive(A) || !isLive(T)) throw new Error("存在しない国家です");
  if (attackerId === targetId) throw new Error("自国を標的にはできません");
  const def = COVERT_BY_KEY[kind]; if (!def) throw new Error("作戦の種類が正しくありません");
  const odds = covertOdds(map, attackerId, targetId, kind);
  const ok = rnd.next() < odds.success;
  // 失敗すると発覚しやすい
  const detected = rnd.next() < clamp(odds.detect + (ok ? 0 : 0.3), 0, 0.95);
  let blamed = null;
  if (detected) {
    const others = map.pack.states.filter((s) => isLive(s) && s.i !== attackerId && s.i !== targetId);
    blamed = rnd.next() < 0.7 || !others.length ? attackerId : rnd.pick(others).i; // 約3割は別の国の仕業とされる
  }
  const effects = {}; const parts = []; const patchT = {}; // 標的国への変更は1回にまとめて書く（同じ国の値を複数回書き換えると食い違う）
  if (ok) {
    const p = odds.power, r = () => 0.7 + rnd.next() * 0.6; // 結果のばらつき(0.7〜1.3)
    if (kind === "command") {
      const morale = Math.round(-(4 + 8 * p) * r()), troops = clamp(0.015 + 0.02 * p, 0, 0.05) * r();
      effects.moraleDelta = morale; effects.troopLossShare = Math.round(troops * 1000) / 1000;
      for (const reg of regimentsOf(T)) { const u = { ...reg.u }; for (const k of Object.keys(u)) if (k !== "nuclear") u[k] = Math.max(0, Math.floor((u[k] ?? 0) * (1 - troops))); parts.push(setProps(reg, { u })); }
      patchT.morale = clamp((T.morale ?? 70) + morale, 0, 100);
    } else if (kind === "economy") {
      const ind = clamp(0.02 + 0.04 * p, 0, 0.12) * r(), tre = clamp(0.01 + 0.03 * p, 0, 0.1) * r(), t0 = Math.max(0, getFinance(T).treasury);
      effects.industryLossShare = Math.round(ind * 1000) / 1000; effects.treasuryLoss = Math.round(t0 * tre * 100) / 100;
      patchT.industry = Math.round((T.industry ?? 0) * (1 - ind) * 10) / 10; patchT.treasury = Math.round((t0 - effects.treasuryLoss) * 100) / 100;
    } else {
      effects.supportDelta = Math.round(-(5 + 9 * p) * r());
      patchT.support = clamp((T.support ?? 70) + effects.supportDelta, 0, 100);
    }
  }
  // 発覚して攻撃元が特定されれば、標的国の国民は結束する（民意 +2）
  if (detected && blamed === attackerId) patchT.support = clamp((patchT.support ?? T.support ?? 70) + 2, 0, 100);
  if (Object.keys(patchT).length) parts.push(setProps(T, patchT));
  const nm = (id) => officialName(map.pack.states[id]);
  const text = ok
    ? `${nm(attackerId)}は${nm(targetId)}に対し「${def.label}」を行い、成功した${detected ? `（発覚：${blamed === attackerId ? `${nm(attackerId)}の関与が特定された` : `${nm(blamed)}の仕業と誤認された`}）` : "（発覚せず）"}`
    : `${nm(attackerId)}の「${def.label}」は失敗に終わった${detected ? `。${blamed === attackerId ? `${nm(attackerId)}の関与が露見した` : `${nm(blamed)}の仕業と疑われた`}` : "（発覚せず）"}`;
  const op = { id: nextId(map), date: date ?? null, attackerId, targetId, kind, success: ok, detected, blamed, effects, text };
  const before = listCovertOps(map);
  parts.push({ apply: (m) => writeOps(m, [...before, op]), revert: (m) => writeOps(m, before) });
  return { command: makeCommand(`隠密作戦（${def.label}）`, ["places"], parts), op };
}
