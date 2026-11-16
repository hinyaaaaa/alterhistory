// v6.2.0: 史実らしい命名。国号（語根＋政体の称号）・君主名（〇〇1世）・王朝（第n王朝）・戦争名・戦場名（地形つき）。
//   乱数は呼び出し側から決定的に作る（ctx.rng を消費しない）。名前の「語根」は言語の音から作り（language.js）、ここでは形を整える。
import { hashSeed, rngOf } from "../../civ/civ-state.js";

const KN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 1〜99 の漢数字 */
export const kanjiNum = (n) => (n < 10 ? KN[n] : n < 20 ? "十" + KN[n % 10] : n < 100 ? KN[Math.floor(n / 10)] + "十" + KN[n % 10] : String(n));

// ---- 国号 ----
// v6.7.0: 史実の国号のように。〇〇王国・〇〇帝国・〇〇共和国・〇〇連邦・〇〇公国・〇〇朝・〇〇汗国・〇〇教国など。「市国」「部族」は使わない。
//   同じ語根・同じ政体からは、いつも同じ称号になる（語根から決まる。改称しても揺れない）。
const FORMS = ["連邦共和国", "神聖王国", "連合王国", "部族連合", "共和国", "教団国", "神聖国", "首長国", "連邦", "連合", "同盟", "連盟", "帝国", "王国", "公国", "侯国", "汗国", "教国", "部族", "市国", "朝", "国"]; // 長いものから（古い保存の称号も剥がせるように残す）
const byBase = (base, arr) => arr[hashSeed(String(base), "form") % arr.length];
/** 時代の区切り（v6.11.0）。年 0 は紀元前 3100 年ごろ（エジプト第一王朝の頃）。初期の国は王国・首長国・同盟で、共和国・連邦・汗国は、それが史実で現れる時代から */
export const NAME_ERA = Object.freeze({ republicFrom: 2300, federationFrom: 4300, khanateFrom: 2900, leagueFrom: 1500 });
/** 政体（と成立の経路）に合う称号。base は国号の語根（称号を選ぶ手がかり）。year は世界の年（省略すると現代の称号。古い時代は下の置き換えが入る） */
export function stateForm(polity, via = null, base = "", year = null, { sfx = "", dep = null, small = false } = {}) {
  const f = rawForm(polity, via, base, sfx, dep, small);
  if (year == null) return f;
  if (year < NAME_ERA.leagueFrom && /連邦|連合|同盟|連盟|共和国|教団国|汗国/.test(f)) return polity === "republic" || polity === "federation" || via === "defense_league" ? "同盟" : byBase(base, ["王国", "首長国"]); // 紀元前 1600 年より前: 都市の同盟か、王国・首長国
  if (year < NAME_ERA.republicFrom && f === "共和国") return "同盟";
  if (year < NAME_ERA.federationFrom && (f === "連邦" || f === "連邦共和国" || f === "連合王国")) return f === "連合王国" ? "王国" : "同盟";
  if (year < NAME_ERA.khanateFrom && f === "汗国") return "部族連合";
  return f;
}
/** 称号（v6.15.0）。公国・侯国は、宗主に従属する国か、独立した小さな君主国のときだけ。称号のない国もある（"" を返す。言語固有の語尾 sfx があるときだけ） */
function rawForm(polity, via, base, sfx = "", dep = null, small = false) {
  if (dep === "vassal" && (polity === "kingdom" || polity === "chiefdom" || polity === "empire")) return byBase(base, ["公国", "公国", "王国"]);
  const none = sfx ? hashSeed(String(base), "notitle") % 100 < 38 : false;
  switch (polity) {
    case "kingdom": return none ? "" : small && hashSeed(String(base), "duchy") % 3 === 0 ? "公国" : byBase(base, ["王国", "王国", "王国", "朝", "国"]);
    case "empire": return none ? "" : byBase(base, ["帝国", "帝国", "帝国", "朝"]);
    case "republic": return none ? "" : byBase(base, ["共和国", "共和国", "国"]);
    case "federation": return "連邦";
    case "theocracy": return via === "religious_polity" ? "教国" : byBase(base, ["神聖王国", "教国", "国"]);
    case "chiefdom": return none ? "" : byBase(base, ["首長国", "国", "王国"]);
    default: return via === "nomad_confederation" ? "汗国" : via === "defense_league" ? "連盟" : none ? "" : byBase(base, ["部族連合", "国", "連合"]);
  }
}
/** 国号から称号を除いた語根（建国時に st.nameBase に残す。古いデータは称号を剥がして求める） */
export function baseOfState(st) {
  if (st.nameBase) return st.nameBase;
  const n = String(st.name ?? ""); for (const f of FORMS) if (n.length > f.length && n.endsWith(f)) return n.slice(0, -f.length);
  return n;
}
export const composeStateName = (base, polity, via, year = null, sfx = "", opt = {}) => { const f = stateForm(polity, via, base, year, { sfx, ...opt }); return f === "" ? base + sfx : base + f; };
/** 政体が変わったときの国号の改称。変わらなければ null */
export function retitle(st, polity, year = null) {
  if (!st.nameBase && !FORMS.some((f) => String(st.name).endsWith(f))) return null; // 創造主が付けた名前など、称号のない名前は改めない
  const base = baseOfState(st), next = composeStateName(base, polity, st.via, year, st.nameSfx ?? "", { dep: st.dependency?.kind ?? null, small: (st.pop ?? 0) > 0 && st.pop < 20000 });
  return next !== st.name ? (year == null ? { base, name: next } : { base, name: next, year }) : null;
}

// ---- 君主名（v6.15.0）----
//   本名（生まれたときの名）と即位名を分ける。文化（言語）ごとに名乗りの型が決まる:
//     own    : 本名のまま即位する（欧州の多数派）。同じ名の君主が続いたときだけ世数が付く
//     throne : 即位名に改名する（教皇・英国王のジョージ 6 世の型）。フィリップがアルベルト 1 世、ジョンがアルベルト 2 世として立つ
//     titled : 本名に称号・通称を添える（〇〇・ヴァーラ。インドなどの型）。世数は付けない
//   王朝が替わったとき、世数を数え直すか続けるかも文化で決まる。
const REGNAL = new Set(["chiefdom", "kingdom", "empire", "theocracy"]);
const stripOrd = (n) => String(n).replace(/[0-9０-９]+世$/, "");
export const baseOfLeader = (n) => stripOrd(n).replace(/・.+$/, "");
export const regnalTypeOf = (st) => { const k = hashSeed(String(st.nameLang ?? st.id), "regnal") % 100; return k < 55 ? "own" : k < 82 ? "throne" : "titled"; };
export const restartsOnDynasty = (st) => hashSeed(String(st.nameLang ?? st.id), "dynrestart") % 100 < 35;
/** 君主の名乗り。fresh は本名。gen は新しい名を作る関数（即位名・通称の素材。無ければ本名から）。返り値: { name（呼び名）, birth（本名）, type } */
export function regnalOf(st, fresh, rnd, gen = null) {
  const birth = baseOfLeader(fresh); if (!REGNAL.has(st.polity)) return { name: birth, birth, type: "none" };
  const type = regnalTypeOf(st), reg = (st.regnal ??= {});
  if (type === "titled") { const pool = (st.epithets ??= []); if (!pool.length && gen) for (let i = 0; i < 3; i++) { const e = gen(); if (e && !pool.includes(e)) pool.push(e); } const e = pool.length ? pool[Math.floor(rnd() * pool.length)] : ""; return { name: e && e !== birth ? `${birth}・${e}` : birth, birth, type }; }
  if (type === "throne") {
    const pool = (st.throneNames ??= []); if (pool.length < 4 && gen) for (let i = 0; i < 4 && pool.length < 4; i++) { const e = gen(); if (e && !pool.includes(e)) pool.push(e); } if (!pool.length) pool.push(birth);
    const used = Object.keys(reg), pick = used.length && rnd() < 0.6 ? used[Math.floor(rnd() * used.length)] : pool[Math.floor(rnd() * pool.length)];
    reg[pick] = (reg[pick] ?? 0) + 1; return { name: `${pick}${reg[pick]}世`, birth, type };
  }
  reg[birth] = (reg[birth] ?? 0) + 1; return { name: reg[birth] > 1 ? `${birth}${reg[birth]}世` : birth, birth, type };
}
/** 即位名・通称の素材を作る関数（その国の首都の言語から。決定的） */
export const epithetGen = (ctx, st, cap) => { if (!ctx.nameGen?.person || !cap) return null; const r = rngOf(hashSeed(ctx.civ.historySeed, "regnalpool", st.id, ctx.civ.monthIndex)); return () => ctx.nameGen.person(ctx.civ, cap, r); };
/** 互換: 呼び名だけを返す */
export const leaderName = (st, fresh, rnd, gen = null) => regnalOf(st, fresh, rnd, gen).name;
export const leaderRng = (civ, st, ...p) => rngOf(hashSeed(civ.historySeed, "leader", st.id, civ.monthIndex, ...p));

// ---- 王朝・家名 ----
/** 王政は「〇〇家」、部族は「〇〇氏」、共和制は「第n代」、独裁・軍政・一党制は「〇〇政権」。family は家名（言語から作る）。n は国ごとの通し番号（1 から） */
const DICTATOR = /junta|military|totalit|party|fascis|authoritarian/;
export function dynastyName(polity, n, founder = "", family = "", regime = "") {
  const fam = family || stripOrd(baseOfLeader(founder));
  if (polity === "tribal") return `${fam}氏`;
  if (DICTATOR.test(String(regime))) return `${fam}政権`;
  if (polity === "republic") return `第${kanjiNum(n)}代`;
  return REGNAL.has(polity) ? `${fam}家` : `${fam}政権`;
}

// ---- 戦争名 ----
/** 同じ組の戦争が 100 年以内に続くと「第二次〇〇戦争」 */
export function warNameFor(ctx, w, placeOf) {
  const { civ } = ctx, A = civ.states[w.aggressor], D = civ.states[w.defender]; if (!A || !D) return null;
  const a = baseOfState(A), d = baseOfState(D), r = rngOf(hashSeed(civ.historySeed, "warname", w.id));
  const pats = [`${a}・${d}戦争`, `${d}征討戦争`, `${d}戦争`];
  const p = placeOf?.(); if (p) pats.push(`${p}戦争`);
  const base = pats[Math.floor(r() * pats.length)];
  const n = Object.values(civ.wars).filter((x) => x.id !== w.id && x.name && x.startedAt >= w.startedAt - 1200 && ((x.aggressor === w.aggressor && x.defender === w.defender) || (x.aggressor === w.defender && x.defender === w.aggressor))).length;
  let name = n ? `第${kanjiNum(n + 1)}次${base}` : base, k = n; while (Object.values(civ.wars).some((x) => x.id !== w.id && x.name === name)) name = `第${kanjiNum(++k + 1)}次${base}`;
  return name;
}

// ---- 戦場名 ----
/** 地形から土地の呼び名を添える。同じ土地でも、川・峠・平原・湾など別の呼び方で区別する */
export function siteDescriptors(f) {
  const out = []; if (f.river) out.push("河畔", "渡河"); if (f.mountain) out.push("峠", "山麓"); if (f.coast) out.push("湾", "海岸");
  if (f.forest) out.push("森"); if (f.wet) out.push("沼沢"); if (f.dry) out.push("荒野"); if (f.plain) out.push("平原", "野");
  return out.length ? out : ["野"];
}

// ---- 宗教・文化の名 ----
/** 宗教の名から「〇〇教」までを取り出す（分派の名は「〇〇教〇〇派」。分派がさらに分かれても、元の教の名に付ける） */
export function religionRoot(name) { const n = String(name ?? ""), i = n.indexOf("教"); return i >= 0 ? n.slice(0, i + 1) : n; }
export const sectName = (parentName, sect) => `${religionRoot(parentName)}${sect}派`;
