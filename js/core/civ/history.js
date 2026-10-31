// V5-M7: 全国家の月次状態（ロスレスな「変化の時系列」）と、任意の月への復元。
//   方式: 実体（国家・集団）ごとに、項目ごとの [t0,v0,t1,v1,…]（変化した月 t と、その月からの値 v）を持つ。月ごとに全項目を複製しない（変化した項目だけ書く）。
//   値はすべて整数に量子化して持つ（文字列は辞書）。ある月 m の値 = t ≤ m の最後の v。変化の無い月は前の値が続く＝全ての月の状態が欠落・推定なしに再構築できる。
//   量子化: 人口・兵力=人（整数）、財政=0.01、安定度=0.0001、政策・防衛=0.001、関係値=0.1。これらは当時の観測値として保存する（後の式で再計算しない）。
//   集団（人口集団）は、居住地・所属国家・生業・集落段階を毎月（変化時に）、人口とコホート構成を10年ごとに保存する（集団単位の月次人口は保存しない。国家の人口は毎月の値を持つ）。
//   記録は tick の integrity フェーズ（整合性検査のあと）。同じ月にプレイヤーの命令で変わったときは、同じ月の記録を上書きする（recordNow）。
export const HISTORY_VERSION = 1, GROUP_DECADE = 120;
const STR = new Set(["name", "via", "polity", "cap", "leader", "goal", "camp", "wars", "st", "sub", "stage", "coh"]);
const DYN = ["rel.", "tech.", "sanct."]; // 消えることがある項目（消えたら 0 を記録）
const caches = new WeakMap(), preC = new Map();
const pre = (p, k) => { let m = preC.get(p); if (!m) preC.set(p, (m = new Map())); let v = m.get(k); if (v === undefined) m.set(k, (v = p + k)); return v; }; // 項目名の文字列を毎月作らない
export const newHistory = () => ({ v: HISTORY_VERSION, dict: [""], states: {}, groups: {}, last: -1 });
const cacheOf = (H) => { let c = caches.get(H); if (!c) { c = { dix: new Map(H.dict.map((s, i) => [s, i])), lastS: new Map(), lastG: new Map(), dyn: new Map(), aliveG: null }; caches.set(H, c); } return c; };
const D = (H, c, s) => { let i = c.dix.get(s); if (i === undefined) { i = H.dict.length; H.dict.push(s); c.dix.set(s, i); } return i; };
const enc = (H, c, k, v) => (STR.has(k) ? D(H, c, v) : v);
function put(f, k, t, v) { // 同じ月なら上書き。前の値に戻るなら変化を消す
  const a = f[k]; if (!a) { f[k] = [t, v]; return; }
  const n = a.length; if (a[n - 2] === t) { if (n >= 4 && a[n - 3] === v) a.length = n - 2; else a[n - 1] = v; return; }
  if (a[n - 1] !== v) a.push(t, v);
}
export function at(a, m) { if (!a || a[0] > m) return undefined; let lo = 0, hi = (a.length >> 1) - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a[mid * 2] <= m) lo = mid; else hi = mid - 1; } return a[lo * 2 + 1]; }
const tail = (H, f) => { const o = {}; for (const k in f) { const a = f[k], v = a[a.length - 1]; o[k] = STR.has(k) ? H.dict[v] : v; } return o; };

/** 国家の、記録する項目（量子化した値）。動的項目（関係値・採用技術・制裁）は rel./tech./sanct. */
export function extractState(st, groupCount) {
  const o = { alive: st.alive ? 1 : 0, player: st.player ? 1 : 0, name: st.name, via: st.via, polity: st.polity, cap: st.capitalGroupId ?? "", leader: st.leader.name, heir: st.leader.heir ? 1 : 0, pop: Math.round(st.pop), tr: Math.round(st.treasury * 100), stb: Math.round(st.stability * 10000), army: Math.round(st.army), settle: st.settlements, ng: groupCount, def: Math.round(st.defense * 1000),
    tax: Math.round(st.policy.tax * 1000), mob: Math.round(st.policy.mobilization * 1000), assim: Math.round(st.policy.assimilation * 1000), tol: Math.round(st.policy.tolerance * 1000), auto: Math.round(st.policy.autonomy * 1000),
    goal: st.strategy?.goal ?? "", camp: st.campaign ? `${st.campaign.kind}:${st.campaign.stage}:${st.campaign.target}` : "", wars: st.warIds.join(",") };
  for (const k in st.techAdopted) o[pre("tech.", k)] = 1; for (const k in st.relations) o[pre("rel.", k)] = Math.round(st.relations[k] * 10); for (const k in st.sanctions) o[pre("sanct.", k)] = st.sanctions[k]; o.res = Math.round((st.resilience ?? 0) * 1000); if (st.magic) o.magic = Math.round((st.magic.power ?? 0) * 1000);
  // v6: 経済・政治・軍事の当時の値（WCDE の世界でだけ。後の式で再計算せず、その月の観測値として残す）
  if (st.econ) { o.ind = Math.round((st.econ.industry ?? 0) * 10); o.trinc = Math.round((st.econ.tradeIncome ?? 0) * 100); }
  if (st.politics) { o.leg = Math.round(st.politics.legitimacy * 1000); o.fat = Math.round(st.politics.fatigue * 1000); }
  if (st.military) { o.milb = Math.round((st.milBonus ?? 0) * 1000); o.doct = Object.keys(st.military.doctrine.taken).length; }
  return o;
}
function recordEntity(H, c, bag, lastMap, id, cur, t) {
  let ent = bag[id]; if (!ent) { ent = bag[id] = { from: t, f: {} }; }
  let last = lastMap.get(id); if (!last) { last = tail(H, ent.f); lastMap.set(id, last); }
  let dyn = c.dyn.get(id); if (!dyn) { dyn = new Set(); for (const k in last) if (DYN.some((p) => k.startsWith(p))) dyn.add(k); c.dyn.set(id, dyn); }
  for (const k in cur) { const v = cur[k]; if (last[k] !== v) { put(ent.f, k, t, enc(H, c, k, v)); if (!(k in last) && DYN.some((p) => k.startsWith(p))) dyn.add(k); last[k] = v; } }
  for (const k of dyn) if (!(k in cur) && last[k] !== 0) { put(ent.f, k, t, 0); last[k] = 0; } // 消えた項目（関係の消滅・制裁の解除）は 0 を記録
}
/** 今月の状態を記録する（tick の integrity フェーズ。ctx.byState は月ごとの索引） */
export function recordMonth(ctx, byStateMap) {
  const { civ } = ctx, t = civ.monthIndex, H = (civ.history ??= newHistory()), c = cacheOf(H), counts = new Map();
  if (!c.aliveG) { c.aliveG = new Set(); for (const id in H.groups) { const a = H.groups[id].f.alive; if (a && a[a.length - 1] === 1) c.aliveG.add(id); } }
  const dec = t % GROUP_DECADE === 0;
  for (const id in civ.groups) {
    const g = civ.groups[id]; if (g.stateId) counts.set(g.stateId, (counts.get(g.stateId) ?? 0) + 1);
    const st = g.settlementId ? civ.settlements[g.settlementId]?.stage ?? "" : "", L = c.lastG.get(id);
    if (!dec && L && L.alive === 1 && L.cell === g.cell && L.st === (g.stateId ?? "") && L.sub === g.subsistence && L.stage === st) continue; // 変化なし（大半の集団・月）は何も作らない
    const cur = { alive: 1, cell: g.cell, st: g.stateId ?? "", sub: g.subsistence, stage: st }; if (dec) { cur.pop = Math.round(g.pop); cur.coh = g.cohorts.map((x) => `${x.cultureId}|${x.religionId ?? ""}|${x.speciesId}|${Math.round(x.share * 1000)}`).join(";"); }
    recordEntity(H, c, H.groups, c.lastG, id, cur, t); c.aliveG.add(id);
  }
  for (const id of c.aliveG) if (!civ.groups[id]) { recordEntity(H, c, H.groups, c.lastG, id, { alive: 0 }, t); c.aliveG.delete(id); }
  for (const id in civ.states) { const st = civ.states[id]; if (!st.alive && H.states[id] && c.lastS.get(id)?.alive === 0) continue; recordEntity(H, c, H.states, c.lastS, id, extractState(st, counts.get(id) ?? 0), t); }
  H.last = t;
}

// ---- 復元 ----
const dget = (H, f, k, m) => { const v = at(f[k], m); return v === undefined ? undefined : STR.has(k) ? H.dict[v] : v; };
/** 月 m の国家の状態（まだ成立していない月は null。滅亡後は alive=false で、最後の状態が残る） */
export function stateAt(civ, id, m) {
  const H = civ.history, e = H?.states[id]; if (!e || m < e.from) return null; const f = e.f, g = (k) => dget(H, f, k, m), o = { id, alive: g("alive") === 1, player: g("player") === 1, name: g("name"), via: g("via"), polity: g("polity"), capitalGroupId: g("cap") || null, leader: { name: g("leader"), heir: g("heir") === 1 },
    pop: g("pop"), treasury: g("tr") / 100, stability: g("stb") / 10000, army: g("army"), settlements: g("settle"), groupCount: g("ng"), defense: g("def") / 1000, policy: { tax: g("tax") / 1000, mobilization: g("mob") / 1000, assimilation: g("assim") / 1000, tolerance: g("tol") / 1000, autonomy: g("auto") / 1000 },
    strategy: g("goal") || null, campaign: g("camp") || null, warIds: (g("wars") || "").split(",").filter(Boolean), techAdopted: [], relations: {}, sanctions: {} };
  for (const k in f) { const v = at(f[k], m); if (k.startsWith("tech.")) { if (v === 1) o.techAdopted.push(k.slice(5)); } else if (k.startsWith("rel.")) { if (v) o.relations[k.slice(4)] = v / 10; } else if (k.startsWith("sanct.")) { if (v) o.sanctions[k.slice(6)] = v; } }
  o.resilience = g("res") / 1000; o.techAdopted.sort();
  if (f.ind) o.econ = { industry: g("ind") / 10, tradeIncome: g("trinc") / 100 }; if (f.leg) o.politics = { legitimacy: g("leg") / 1000, fatigue: g("fat") / 1000 }; if (f.milb) o.military = { bonus: g("milb") / 1000, doctrines: g("doct") }; // v6: 当時の経済・政治・軍事の観測値
  if (f.magic) o.magicPower = (at(f.magic, m) ?? 0) / 1000; return o;
}
/** 月 m に存在した（成立済みの）全国家。滅亡した国家も alive:false で含める（existsOnly なら存在中のみ） */
export function statesAt(civ, m, { aliveOnly = false } = {}) { const out = []; for (const id in civ.history?.states ?? {}) { const s = stateAt(civ, id, m); if (s && (!aliveOnly || s.alive)) out.push(s); } return out; }
/** 月 m の集団（居住地・所属・生業・集落段階。人口は直近の10年の記録） */
export function groupsAt(civ, m) {
  const H = civ.history, out = new Map(); for (const id in H?.groups ?? {}) { const e = H.groups[id]; if (m < e.from) continue; const f = e.f; if (dget(H, f, "alive", m) !== 1) continue; const dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE; let pop = at(f.pop, m); out.set(id, { id, cell: at(f.cell, m), stateId: dget(H, f, "st", m) || null, subsistence: dget(H, f, "sub", m), stage: dget(H, f, "stage", m) || null, pop, popAsOf: dm }); } return out;
}
/** 月 m の人口構成（国家。10年単位の記録から） */
export function compositionAt(civ, stateId, m) {
  const H = civ.history, out = { culture: {}, religion: {}, species: {}, total: 0 }, dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE;
  for (const [id, g] of groupsAt(civ, m)) { if (g.stateId !== stateId) continue; const coh = H.dict[at(H.groups[id].f.coh, dm) ?? 0] ?? ""; const pop = at(H.groups[id].f.pop, dm) ?? g.pop ?? 0; for (const part of coh.split(";").filter(Boolean)) { const [cu, re, sp, sh] = part.split("|"), n = pop * (+sh / 1000); out.total += n; out.culture[cu] = (out.culture[cu] ?? 0) + n; const r = re || "none"; out.religion[r] = (out.religion[r] ?? 0) + n; out.species[sp] = (out.species[sp] ?? 0) + n; } }
  return out;
}
/** 月 m のセルの持ち主（国家ID）。territory(cell)→cells は世界から求める（地図の過去表示用） */
export function ownerMapAt(civ, territoryOf, world, m) { const owner = new Map(); for (const g of groupsAt(civ, m).values()) if (g.stateId) for (const c of territoryOf(world, g.cell)) owner.set(c, g.stateId); return owner; }
/** 履歴の規模（国家数・項目数・変化の点数・辞書） */
export function historyStats(civ) { const H = civ.history; if (!H) return { states: 0, groups: 0, points: 0, dict: 0 }; let p = 0; for (const b of [H.states, H.groups]) for (const id in b) for (const k in b[id].f) p += b[id].f[k].length >> 1; return { states: Object.keys(H.states).length, groups: Object.keys(H.groups).length, points: p, dict: H.dict.length, last: H.last }; }
/** 構造の検査: 時刻が単調増加・辞書の参照が範囲内・最新の記録が現在の状態と一致（現在の月の復元） */
export function checkHistory(civ) {
  const H = civ.history, errs = []; if (!H) return errs;
  for (const bag of [H.states, H.groups]) for (const id in bag) for (const k in bag[id].f) { const a = bag[id].f[k]; if (a.length % 2) errs.push(`系列が奇数長 ${id}.${k}`); for (let i = 2; i < a.length; i += 2) if (!(a[i] > a[i - 2])) { errs.push(`時刻が単調でない ${id}.${k}`); break; } if (STR.has(k)) for (let i = 1; i < a.length; i += 2) if (!(a[i] >= 0 && a[i] < H.dict.length)) { errs.push(`辞書の参照が範囲外 ${id}.${k}`); break; } }
  if (H.last === civ.monthIndex) for (const id in civ.states) { const st = civ.states[id], s = stateAt(civ, id, H.last); if (!s) { errs.push(`国家 ${id} の履歴が無い`); continue; } if (s.pop !== Math.round(st.pop) || s.polity !== st.polity || s.alive !== st.alive) errs.push(`国家 ${id} の最新の履歴が現在と不一致`); }
  return errs;
}
// ---- バイナリ化（.ahmap の拡張チャンク。系列は Float64 の連続領域）----
export function encodeHistory(H) {
  const ents = [], arrays = []; let total = 0;
  for (const [kind, bag] of [["s", H.states], ["g", H.groups]]) for (const id in bag) { const e = bag[id], fields = []; for (const k in e.f) { fields.push([k, e.f[k].length]); total += e.f[k].length; arrays.push(e.f[k]); } ents.push([kind, id, e.from, fields]); }
  const data = new Float64Array(total); let o = 0; for (const a of arrays) { data.set(a, o); o += a.length; }
  return { index: new TextEncoder().encode(JSON.stringify({ v: H.v, dict: H.dict, last: H.last, ents })), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}
export function decodeHistory(indexBytes, dataBytes) {
  const ix = JSON.parse(new TextDecoder().decode(indexBytes)); if (ix.v > HISTORY_VERSION) throw new Error("新しすぎる履歴の版です");
  const buf = dataBytes.byteOffset % 8 === 0 ? dataBytes : dataBytes.slice(), data = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8), H = { v: ix.v, dict: ix.dict, states: {}, groups: {}, last: ix.last }; let o = 0;
  for (const [kind, id, from, fields] of ix.ents) { const f = {}; for (const [k, n] of fields) { f[k] = Array.from(data.subarray(o, o + n)); o += n; } (kind === "s" ? H.states : H.groups)[id] = { from, f }; }
  if (o !== data.length) throw new Error("履歴データの長さが合いません");
  return H;
}
