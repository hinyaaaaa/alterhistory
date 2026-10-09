// 外交関係の「正本」を1か所にまとめる。
//
// 国どうしの関係は、これまで 外交表（states[].diplomacy）・同盟（ext.data.alliances）・従属（states[].vassal）・
// 戦争（ext.data.wars）の4か所に散っていて、食い違うことがあった。ここでは次の順に決める:
//   1. 続いている戦争の相手どうし            → Enemy（敵対）
//   2. 従属・宗主の関係                       → Vassal / Suzerain
//   3. 続いている同盟の加盟国どうし           → Ally（同盟）
//   4. どれにも当たらなければ、外交表の値      → （Friendly・Rival など。Azgaar から読み込んだ Ally/Enemy も、ここで残る）
// 同盟・従属・戦争は、それぞれ他に無い情報（盟名・拘束力・従属の種類・戦争の経過）を持つ「事実」で、
// 外交表は、そこから導いた値を写して持つだけの表（Azgaar 互換の保存先）として扱う。
// ゲームの判断（貿易・年表など）は relationOf を読む。外交表を直接読まない。
//
// 純粋ロジック層：DOM に依存しない。

import { getRelation, inverseRelation } from "./diplomacy.js";
import { setProps, makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { VASSAL_BY_KEY } from "./vassals.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** facts を渡すと、その事実（{wars, alliances}）で判定する（統合の計画中に「統合後の事実」で判定したいとき） */
export function relationOf(map, a, b, facts = null) {
  if (a === b) return null;
  const wars = facts?.wars ?? map.ext?.data?.wars ?? [];
  const alliances = facts?.alliances ?? map.ext?.data?.alliances ?? [];
  const states = facts?.states ?? map.pack.states;
  if (!isLive(states[a]) || !isLive(states[b])) return null; // 消えた国との関係は無い
  for (const w of wars) {
    if (w.endedAt) continue;
    if ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))) return "Enemy";
  }
  const vOf = (x, y) => { const v = states[x]?.vassal; return !!v && v.overlord === y && isLive(states[x]) && isLive(states[y]) && !!VASSAL_BY_KEY[v.kind]; };
  if (vOf(a, b)) return "Vassal";
  if (vOf(b, a)) return "Suzerain";
  for (const al of alliances) if (!al.dissolvedAt && al.members.includes(a) && al.members.includes(b)) return "Ally";
  return getRelation(map, a, b);
}

/**
 * 外交表を、正本（relationOf）に合わせる部品を返す。食い違っている組だけを直す。
 * ids を渡すと、その国と他の国との組だけを調べる。
 */
export function reconcileParts(map, ids = null, facts = null) {
  const live = map.pack.states.filter(isLive).map((s) => s.i);
  const rows = new Map();
  const rowOf = (id) => { if (!rows.has(id)) rows.set(id, (map.pack.states[id].diplomacy ?? []).slice()); return rows.get(id); };
  const pairs = [];
  if (ids) { for (const a of ids) for (const b of live) if (a !== b) pairs.push([a, b]); }
  else for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) pairs.push([live[x], live[y]]);
  let changed = 0;
  for (const [a, b] of pairs) {
    const want = relationOf(map, a, b, facts);
    if (!want) continue;
    const ra = rowOf(a), rb = rowOf(b);
    if (ra[b] === want && rb[a] === inverseRelation(want)) continue;
    while (ra.length <= b) ra.push("x"); while (rb.length <= a) rb.push("x");
    ra[b] = want; rb[a] = inverseRelation(want); changed++;
  }
  if (!changed) return [];
  return [...rows].map(([id, row]) => setProps(map.pack.states[id], { diplomacy: row }));
}

/** 食い違っている組の一覧（読み込み時の警告用）。[{a, b, table, truth}] */
export function diplomacyMismatches(map) {
  const live = map.pack.states.filter(isLive).map((s) => s.i), out = [];
  for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
    const a = live[x], b = live[y], truth = relationOf(map, a, b);
    if (truth && getRelation(map, a, b) !== truth) out.push({ a, b, table: getRelation(map, a, b), truth });
  }
  return out;
}

/** 外交表の食い違いを直すコマンド（無ければ null） */
export function planReconcileDiplomacy(map) {
  const parts = reconcileParts(map);
  return parts.length ? makeCommand("外交表を、同盟・従属・戦争に合わせる", [], parts) : null;
}

// ---- 国家統合のときの付け替え ----

/**
 * from が to に統合されるとき、続いている同盟・従属・戦争を to に付け替える部品を返す。
 *   ・同盟: 加盟国の from を to に置き換える（to がすでに加盟していれば1つにまとめる）。2か国未満になれば解消する
 *   ・従属: from を宗主国にしていた国は to に従属する。to と from の間の従属は消える
 *   ・戦争: 続いている戦争の参戦国 from を to に置き換える。to が敵味方の両方になる戦争は、統合で終結とする
 * 終わった同盟・戦争は歴史なので書き換えない（当時の国名が記録に残っている）。
 * @returns {{parts:object[], facts:{wars:object[], alliances:object[], states:object[]}}} facts は付け替え後の事実
 */
export function retargetParts(map, from, to, date) {
  const parts = [];
  const data = map.ext?.data ?? {};
  const swap = (list) => { const out = []; for (const id of list ?? []) { const v = id === from ? to : id; if (!out.includes(v)) out.push(v); } return out; };
  const toName = map.pack.states[to]?.fullName ?? map.pack.states[to]?.name ?? `国家#${to}`;

  // 同盟
  const alliances = Array.isArray(data.alliances) ? data.alliances : [];
  const newAlliances = alliances.map((a) => {
    if (a.dissolvedAt || !a.members?.includes(from)) return a;
    const members = swap(a.members);
    const leader = a.leader === from ? to : a.leader;
    const next = { ...a, members, leader, memberNames: { ...(a.memberNames ?? {}), [to]: a.memberNames?.[to] ?? toName } };
    if (members.length < 2) next.dissolvedAt = date ?? null; // 2か国未満では同盟でなくなる
    return next;
  });
  if (alliances.some((a, i) => a !== newAlliances[i])) {
    parts.push({ apply: (m) => { ensureExt(m).data.alliances = newAlliances; }, revert: (m) => { ensureExt(m).data.alliances = alliances; } });
  }

  // 従属（from を宗主にしていた国は to へ。to 自身が from に従属していた場合、その関係は統合で消える）
  const newStates = map.pack.states.map((s) => s);
  const vassalPatch = new Map();
  for (const s of map.pack.states) {
    if (!isLive(s) || !s.vassal) continue;
    if (s.i === to && s.vassal.overlord === from) vassalPatch.set(s.i, null);
    else if (s.vassal.overlord === from && s.i !== from) vassalPatch.set(s.i, { ...s.vassal, overlord: to });
  }
  for (const [id, v] of vassalPatch) { parts.push(setProps(map.pack.states[id], { vassal: v })); newStates[id] = { ...map.pack.states[id], vassal: v }; }
  newStates[from] = { ...map.pack.states[from], removed: true };

  // 戦争（続いているものだけ）
  const wars = Array.isArray(data.wars) ? data.wars : [];
  const newWars = wars.map((w) => {
    if (w.endedAt || !(w.attackers.includes(from) || w.defenders.includes(from))) return w;
    const attackers = swap(w.attackers), defenders = swap(w.defenders);
    const next = { ...w, attackers, defenders };
    const move = (obj) => { if (!obj || !(from in obj)) return obj; const { [from]: moved, ...rest } = obj; return Array.isArray(moved) ? rest : { ...rest, [to]: (rest[to] ?? 0) + (typeof moved === "number" ? moved : 0) }; };
    next.advantage = move(w.advantage); next.withdrawn = move(w.withdrawn);
    if (w.muster) { const { [from]: _x, ...rest } = w.muster; next.muster = rest; }
    next.names = { ...(w.names ?? {}), [to]: w.names?.[to] ?? toName };
    if (attackers.includes(to) && defenders.includes(to)) { // 敵と味方が1つの国になる＝戦う相手がいない
      next.endedAt = date ?? null;
      next.terms = { kind: "white", treatyName: "国家統合による終結", venue: null, notes: `${w.names?.[from] ?? "統合された国"}が${toName}に統合され、敵対する相手が1つの国になったため、戦争は終結した`, signedAt: date ?? null, names: next.names, cessions: [], reparations: [], annex: [], vassalize: [] };
    }
    return next;
  });
  if (wars.some((w, i) => w !== newWars[i])) {
    parts.push({ apply: (m) => { ensureExt(m).data.wars = newWars; }, revert: (m) => { ensureExt(m).data.wars = wars; } });
  }
  return { parts, facts: { wars: newWars, alliances: newAlliances, states: newStates } };
}
