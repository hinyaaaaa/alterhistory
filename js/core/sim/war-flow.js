// 戦争の周辺ルール：同盟の連動、終戦日の自動算出、講和地の選定、講和で相手へ渡る量の計算。
// 純粋ロジック層：DOM に依存しない。
import { regimentsOf } from "./military.js";
import { forceHeadcount } from "./units.js";
import { vassalInfo, vassalsOf, VASSAL_BY_KEY } from "../edit/vassals.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 同盟の拘束力。ユーザーが同盟ごとに選ぶ */
export const BONDS = Object.freeze([
  { key: "loose", label: "緩やか", desc: "戦争に巻き込まれない。貿易の封鎖も各国の自由。" },
  { key: "standard", label: "標準", desc: "同盟国が攻められたら参戦する（防衛義務）。攻める戦争には加わらない。盟主の敵国との貿易を封鎖する。" },
  { key: "strict", label: "強固", desc: "攻める戦争にも守る戦争にも、同盟国は必ず参戦する。貿易の封鎖にも同調する。" },
]);
export const BOND_BY_KEY = Object.fromEntries(BONDS.map((b) => [b.key, b]));
export const bondOf = (a) => (BOND_BY_KEY[a?.bond] ? a.bond : "standard");

const liveAlliances = (map) => (map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt);

/**
 * 宣戦布告の両陣営を、同盟の拘束力に従って広げる。
 *   緩やか: 広がらない / 標準: 攻められた側の同盟国が防衛参戦 / 強固: 両陣営とも同盟国が全員参戦
 * 同盟の中に両陣営の国が混ざっている場合は、その同盟は動かない。
 * @returns {{attackers:number[], defenders:number[], joined:{id:number, side:"attacker"|"defender", alliance:string}[]}}
 */
export function expandWithAllies(map, attackers, defenders) {
  const A = new Set(attackers), D = new Set(defenders), joined = [];
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const al of liveAlliances(map)) {
      const bond = bondOf(al);
      if (bond === "loose") continue;
      const members = al.members.filter((m) => isLive(map.pack.states[m]));
      const inA = members.some((m) => A.has(m)), inD = members.some((m) => D.has(m));
      if (inA && inD) continue;
      const join = (set, side) => { for (const m of members) if (!A.has(m) && !D.has(m)) { set.add(m); joined.push({ id: m, side, alliance: al.name }); changed = true; } };
      if (inD) join(D, "defender");                     // 標準・強固: 攻められた側の同盟国は守る
      if (inA && bond === "strict") join(A, "attacker"); // 強固のみ: 攻める側の同盟国も加わる
    }
    if (!changed) break;
  }
  // 従属国：宗主国が戦えば、傀儡と属国は従って参戦する。保護国は、宗主国が守る戦争にだけ参戦する。宗主国が攻められれば従属国も守る
  for (let round = 0; round < 3; round++) {
    let changed = false;
    for (const [mine, side, label, offensive] of [[A, "attacker", "攻撃側", true], [D, "defender", "防衛側", false]]) {
      for (const o of [...mine]) for (const v of vassalsOf(map, o)) {
        if (A.has(v.stateId) || D.has(v.stateId)) continue;
        if (offensive && !VASSAL_BY_KEY[v.kind].joinsOffensive) continue;
        mine.add(v.stateId); joined.push({ id: v.stateId, side, alliance: `${VASSAL_BY_KEY[v.kind].label}（宗主国に従う）` }); changed = true;
      }
      // 従属国が攻められたら、宗主国も守る（防衛側にいる従属国の宗主国が、まだ参戦していなければ）
      if (!offensive) for (const v of [...mine]) { const info = vassalInfo(map, v); if (info && !A.has(info.overlord) && !D.has(info.overlord)) { D.add(info.overlord); joined.push({ id: info.overlord, side: "defender", alliance: "宗主国として従属国を守る" }); changed = true; } }
    }
    if (!changed) break;
  }
  return { attackers: [...A], defenders: [...D], joined };
}

/** { year, month } に n ヶ月足す */
export function addMonths(date, n) {
  const t = date.year * 12 + (date.month - 1) + n;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}

/**
 * 終戦日（開戦から何ヶ月で決着するか）を自動で決める。
 * 動員規模が大きいほど、地形が険しいほど、決着が僅差なほど（膠着ならなおさら）長引く。世界大戦規模は特に長い。乱数のばらつきは対数正規（短期決着も長期戦もまれに出る）。
 */
export function estimateDurationMonths(map, attackers, defenders, result, rnd) {
  const ids = [...attackers, ...defenders];
  let men = 0;
  for (const id of ids) for (const r of regimentsOf(map.pack.states[id])) men += forceHeadcount({ ...r.u, nuclear: 0 });
  const scale = Math.log10(1 + men);                          // 0〜7 くらい
  // 地形: 防衛側の領土のうち標高の高いセルの割合（山がちなほど長引く）
  const c = map.pack.cells, h = map.geometry?.pack?.h;
  let total = 0, rough = 0;
  if (h) for (let i = 0; i < c.state.length; i++) if (defenders.includes(c.state[i])) { total++; if (h[i] >= 55) rough++; }
  const terrain = 1 + (total ? rough / total : 0) * 0.8;
  // 決着が僅差なほど長引く（圧勝は短く、接戦は長い）。決着つかず（膠着）は、さらに長引く
  const closeness = 1 + (1 - clamp(result.decisiveness ?? 0.5, 0, 1)) * 2.2;
  const stalemate = result.winner === "stalemate" ? 1.5 : 1;
  const world = ids.length >= 5 ? 1.6 : 1;
  const base = (2 + scale * 2.5) * 0.68 * terrain * closeness * stalemate * world; // 0.68: 平均の長さを、これまでの手触り（互角で1年半ほど）に保つ係数
  // 長さのばらつき：対数正規（平均1）。たいていは目安の近くで終わるが、まれに短期で決着し、まれに長期戦になる
  const z = Math.sqrt(-2 * Math.log(1 - rnd.next() * 0.999999)) * Math.cos(2 * Math.PI * rnd.next());
  const SIGMA = 0.45;
  return clamp(Math.round(base * Math.exp(SIGMA * z - (SIGMA * SIGMA) / 2)), 1, 120);
}

// ---- 講和地 ----
/** 2国が「中立」か（同盟でも敵対でもない）。同盟は拘束力を問わず、敵対は活動中の戦争で判定 */
function stateRelationNone(map, a, b) {
  if (liveAlliances(map).some((al) => al.members.includes(a) && al.members.includes(b))) return false;
  const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
  return !wars.some((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
}

/**
 * 講和が行われる地（都市）を選ぶ。
 *   ・勝敗がついた戦争は、基本的に戦勝国の都市で行う（勝者が会議の主導権を持つ）
 *   ・膠着（決着つかず）の戦争は、仲介国として、交戦国のすべてと中立な国の都市で行う。仲介できる国が無ければ交戦国の都市
 * 条約名は「その地名 + 条約」になる。
 * @returns {{burgId:number, place:string, stateId:number, neutral:boolean, role:"winner"|"mediator"|"belligerent", treatyName:string}|null}
 */
export function proposePeaceVenue(map, war, rnd) {
  const belligerents = [...war.attackers, ...war.defenders];
  const stalemate = war.result?.winner === "stalemate";
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && isLive(map.pack.states[b.state]));
  let pool = [], role = "winner";
  if (!stalemate && war.result) {
    const winners = war.result.winner === "defender" ? war.defenders : war.attackers;
    pool = burgs.filter((b) => winners.includes(b.state));
  } else {
    const neutralStates = new Set(map.pack.states.filter((s) => isLive(s) && !belligerents.includes(s.i) && belligerents.every((x) => stateRelationNone(map, s.i, x))).map((s) => s.i));
    pool = burgs.filter((b) => neutralStates.has(b.state)); role = "mediator";
  }
  if (!pool.length) { pool = burgs.filter((b) => belligerents.includes(b.state)); role = "belligerent"; }
  if (!pool.length) return null;
  const b = rnd.pick(pool);
  return { burgId: b.i, place: b.name, stateId: b.state, neutral: role === "mediator", role, treatyName: `${b.name}条約` };
}

// ---- 講和で相手へ渡る量 ----
/**
 * 割譲・賠償で、敗者から勝者へ何がどれだけ移るかを見積もる（表示用。実際の移動は planSignPeace が行う）。
 * @param {number[][]} cellGroups 割譲するセルの塊（属州1つ・領域1つ＝1塊）
 */
export function peaceImpact(map, loserId, cellGroups, reparations = 0, payerTreasury = null) {
  const loser = map.pack.states[loserId];
  const cells = new Set(cellGroups.flat());
  const total = Math.max(1, loser?.cells ?? 1);
  const share = clamp(cells.size / total, 0, 1);
  const pop = ((loser?.rural ?? 0) + (loser?.urban ?? 0)) * share;       // 千人
  const industry = (loser?.industry ?? 0) * share;
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && b.state === loserId && cells.has(b.cell)).length;
  return {
    cells: cells.size, share, population: pop, industry, burgs,
    reparations, reparationsShare: payerTreasury > 0 ? reparations / payerTreasury : null,
  };
}
