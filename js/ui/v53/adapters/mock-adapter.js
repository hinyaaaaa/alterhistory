// v5.3 UI 単体確認用の模擬世界。本体（store / civ / history-actions）には一切つながらない。
//   ・契約（contract.js）をすべて実装する。UI テストとプレビュー、live-adapter との差し替え確認に使う
//   ・乱数は seed で決まる（テストが安定する）。時間は step() で進める（自動再生は scheduler を差し替えられる）
import { monthOf, fmtMonth } from "../format.js";
import { categoryOf } from "../categories.js";
import { splitIntoParts } from "../export/obsidian-split.js";
import { civChronicleChunks } from "../export/civ-chronicle.js";
import { PNG_KINDS, describePng } from "../export/png-meta.js";

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SYL = ["ア", "カ", "サ", "タ", "ナ", "ハ", "マ", "ヤ", "ラ", "ワ", "イ", "キ", "シ", "チ", "ニ", "ミ", "リ", "ウ", "ク", "ス", "ツ", "ヌ", "ム", "ル", "エ", "ケ", "セ", "テ", "ネ", "メ", "レ", "オ", "コ", "ソ", "ト", "ノ", "モ", "ロ", "ン"];
const SUFFIX = ["王国", "連合", "帝国", "共和国", "市国", "公国"];
const POLITY = ["部族", "首長制", "王国", "帝国", "共和制", "神権制"];
const TECHS = ["灌漑", "青銅", "鉄器", "文字", "貨幣", "帆走", "暦", "車輪", "築城", "印刷", "火薬", "羅針盤"];
const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

export function createMockAdapter({ seed = 7, states = 14, years = 400, phase = "playing", scheduler = null } = {}) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const mkName = () => Array.from({ length: 2 + Math.floor(rnd() * 2) }, () => pick(SYL)).join("") + pick(SUFFIX);
  const sched = scheduler ?? { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t) };
  let runGuard = null;
  const subs = new Set(); const emit = () => { for (const f of subs) f(); };

  const S = {
    hasWorld: phase !== "empty", hasCiv: phase === "playing", name: "模擬世界", cells: 25000,
    first: monthOf(0, 1), now: monthOf(0, 1), view: null, running: false, timer: null, msPerYear: 120000,
    states: [], wars: [], events: [], cursor: 0, nextId: 1, treaties: [],
    layers: [{ key: "states", label: "国家", on: true }, { key: "terrain", label: "地形", on: true }, { key: "borders", label: "国境", on: true }, { key: "labels", label: "地名", on: true }, { key: "rivers", label: "河川", on: false }],
    start: { phase: phase === "empty" ? "none" : phase === "playing" ? "founded" : phase, groupId: null, months: 0, readyAt: 0, aborted: false },
  };
  const id = (p) => `${p}_${S.nextId++}`;
  const alive = (m = S.view ?? S.now) => S.states.filter((s) => s.formedAt <= m && (s.dissolvedAt == null || s.dissolvedAt > m));
  const totalPop = (m) => alive(m).reduce((a, s) => a + popAt(s, m), 0) || 1;
  function popAt(s, m) { let p = s.pop; for (let i = s.hist.length - 1; i >= 0; i--) if (s.hist[i][0] <= m) { p = s.hist[i][1]; break; } return p; }
  function stabAt(s, m) { let p = s.stability; for (let i = s.hist.length - 1; i >= 0; i--) if (s.hist[i][0] <= m) { p = s.hist[i][2]; break; } return p; }

  function addState(m, { player = false } = {}) {
    const s = { id: id("state"), name: mkName(), polity: pick(POLITY), formedAt: m, dissolvedAt: null, pop: 2000 + Math.floor(rnd() * 60000), stability: 0.4 + rnd() * 0.5, treasury: Math.floor(rnd() * 5000), army: 200 + Math.floor(rnd() * 3000), player, hist: [], relations: {} };
    s.hist.push([m, s.pop, s.stability]); S.states.push(s); return s;
  }
  function addEvent(m, kind, title, { detail = "", causeText = "", actors = [], impact = {}, causes = [] } = {}) {
    const ev = { id: id("event"), month: m, kind, title, detail, causeText, actors, causes, impact: { popLossShare: 0, territoryShare: 0, actorPopShare: 0, actorCount: actors.length, ripple: 0, player: false, ...impact } };
    S.events.push(ev); return ev;
  }
  const actorOf = (s) => ({ kind: "state", id: s.id, name: s.name });
  const popShare = (list, m) => list.reduce((a, s) => a + popAt(s, m), 0) / totalPop(m);

  function advance(quiet = false) {
    const m = ++S.now, al = alive(m);
    for (const s of al) { s.pop = Math.max(100, Math.round(s.pop * (1 + (rnd() - 0.46) * 0.004))); s.stability = Math.min(1, Math.max(0, s.stability + (rnd() - 0.5) * 0.02)); if (m % 12 === 0) s.hist.push([m, s.pop, s.stability]); }
    if (!S.hasCiv) return;
    if (rnd() < 0.004) { const s = addState(m); addEvent(m, "state_formed", `${s.name}が成立`, { detail: `${s.name}が${s.polity}として成立した。`, actors: [actorOf(s)], impact: { actorPopShare: popShare([s], m), ripple: 1 } }); }
    if (al.length >= 2 && rnd() < 0.018 && S.wars.filter((w) => w.status === "active").length < Math.max(1, al.length / 4)) {
      const a = pick(al); let d = pick(al); if (d === a) d = al[(al.indexOf(a) + 1) % al.length];
      const allies = al.filter((x) => x !== a && x !== d && rnd() < 0.12);
      const w = { id: id("war"), aggressor: a.id, defender: d.id, sides: { a: [a.id], d: [d.id, ...allies.map((x) => x.id)] }, startedAt: m, endedAt: null, status: "active", casualties: 0, outcome: null };
      S.wars.push(w);
      const parts = [a, d, ...allies];
      addEvent(m, "war_declared", `${a.name}が${d.name}に宣戦`, { detail: `${a.name}は${d.name}への侵攻を開始した。`, causeText: "国境の緊張と資源をめぐる対立を受けて", actors: parts.map(actorOf), impact: { actorPopShare: popShare(parts, m), actorCount: parts.length, ripple: 3, player: parts.some((x) => x.player) } });
    }
    for (const w of S.wars.filter((x) => x.status === "active")) {
      if (rnd() < 0.25) { const loss = Math.round(50 + rnd() * 800); w.casualties += loss; if (!quiet && rnd() < 0.4) addEvent(m, "battle_fought", `${S.states.find((s) => s.id === w.aggressor)?.name}の軍が交戦`, { actors: [w.aggressor, w.defender].map((x) => actorOf(S.states.find((s) => s.id === x))), impact: { popLossShare: loss / totalPop(m) } }); }
      if (m - w.startedAt > 6 && rnd() < 0.07) {
        w.status = "ended"; w.endedAt = m; w.outcome = pick(["攻撃側の勝利", "防衛側の勝利", "講和", "膠着"]);
        const a = S.states.find((s) => s.id === w.aggressor), d = S.states.find((s) => s.id === w.defender);
        addEvent(m, "war_ended", `${a.name}と${d.name}の戦争が終結（${w.outcome}）`, { detail: `損害は約${w.casualties}人。`, actors: [a, d].map(actorOf), impact: { actorPopShare: popShare([a, d], m), territoryShare: rnd() * 0.04, popLossShare: w.casualties / totalPop(m), ripple: 2, player: a.player || d.player } });
      }
    }
    if (al.length > 3 && rnd() < 0.003) {
      const s = al.slice().sort((x, y) => popAt(x, m) - popAt(y, m))[Math.floor(rnd() * 2)]; s.dissolvedAt = m;
      for (const w of S.wars.filter((x) => x.status === "active" && (x.aggressor === s.id || x.defender === s.id))) { w.status = "ended"; w.endedAt = m; w.outcome = "国家の消滅"; }
      addEvent(m, "state_dissolved", `${s.name}が滅亡`, { detail: `${s.name}は他国に吸収され、独立を失った。`, causeText: "長い戦争による疲弊を受けて", actors: [actorOf(s)], impact: { actorPopShare: popShare([s], m), territoryShare: 0.01 + rnd() * 0.03, ripple: 2, player: s.player } });
    }
    if (rnd() < 0.012) {
      const big = rnd() < 0.08, share = big ? 0.04 + rnd() * 0.1 : rnd() * 0.004;
      addEvent(m, "disaster_struck", `${pick(["大地震", "洪水", "飢饉", "疫病", "噴火"])}が${pick(al).name}を襲う`, { detail: `被害は人口の${(share * 100).toFixed(1)}%に及んだ。`, causeText: "気候の変動を受けて", impact: { popLossShare: share, ripple: big ? 3 : 0 } });
    }
    if (rnd() < 0.01) { const s = pick(al), t = pick(TECHS); addEvent(m, "tech_discovered", `${s.name}で「${t}」が発見される`, { actors: [actorOf(s)], impact: { actorPopShare: popShare([s], m) * 0.3 } }); }
    if (!quiet && al.length >= 2 && rnd() < 0.012) { const a = pick(al), b = pick(al.filter((x) => x !== a)); addEvent(m, "treaty_signed", `${a.name}と${b.name}が条約を結ぶ`, { actors: [a, b].map(actorOf), impact: { actorPopShare: popShare([a, b], m) * 0.4 } }); }
  }

  // 初期の歴史を黙って生成する
  if (S.hasCiv) {
    const n0 = states; for (let i = 0; i < n0; i++) addState(S.now - 12 * (3 + Math.floor(rnd() * 40)));
    S.states[0].player = true; S.first = S.now;
    for (let i = 0; i < years * 12; i++) advance(false);
    S.cursor = S.events.length;
  }

  const A = {
    meta() {
      const al = alive(S.now);
      return { hasWorld: S.hasWorld, hasCiv: S.hasCiv, name: S.name, cells: S.cells, first: S.first, now: S.now, view: S.view, past: S.view != null, states: al.length, wars: S.wars.filter((w) => w.status === "active").length, events: S.events.length, population: totalPop(S.now), land: 1 };
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    setView(mi) { S.view = mi == null || mi >= S.now ? null : Math.max(S.first, Math.floor(mi)); if (S.view != null) A.time.stop(); emit(); },
    worldScale() { const al = alive(S.now); return { states: al.length, population: totalPop(S.now) }; },

    list(kind, { query = "", filter = "", sort = "", offset = 0, limit = 40, entity = "", range = "" } = {}) {
      const m = S.view ?? S.now, q = query.trim(), since = Number(range) > 0 ? m - Number(range) * 12 : null;
      let rows;
      if (kind === "state") {
        rows = S.states.filter((s) => s.formedAt <= m && (filter === "dead" ? s.dissolvedAt != null && s.dissolvedAt <= m : s.dissolvedAt == null || s.dissolvedAt > m)).map((s) => ({ id: s.id, title: s.name, sub: `${s.polity}・人口 ${popAt(s, m).toLocaleString("ja-JP")}`, tag: s.player ? "プレイヤー" : "", tone: s.player ? "accent" : "", pop: popAt(s, m) }));
        rows.sort(sort === "name" ? (a, b) => a.title.localeCompare(b.title, "ja") : (a, b) => b.pop - a.pop);
      } else if (kind === "war") {
        rows = S.wars.filter((w) => w.startedAt <= m && (filter === "ended" ? w.endedAt != null && w.endedAt <= m : filter === "active" ? w.endedAt == null || w.endedAt > m : true)).map((w) => ({ id: w.id, title: warTitle(w), sub: `${fmtMonth(w.startedAt)}〜${w.endedAt != null && w.endedAt <= m ? fmtMonth(w.endedAt) : "継続中"}`, tag: w.endedAt != null && w.endedAt <= m ? "終結" : "戦争中", tone: w.endedAt != null && w.endedAt <= m ? "" : "danger", at: w.startedAt })).reverse();
      } else if (kind === "event") {
        const all = S.events; const out = [];
        for (let i = all.length - 1; i >= 0; i--) { const e = all[i]; if (e.month > m || (since != null && e.month < since)) continue; if (entity && !(e.actors ?? []).some((a) => a.id === entity)) continue; if (filter && categoryOf(e.kind).id !== filter) continue; if (q && !e.title.includes(q)) continue; out.push({ id: e.id, title: e.title, sub: fmtMonth(e.month), tag: categoryOf(e.kind).label, tone: categoryOf(e.kind).tone }); }
        rows = out;
      } else if (kind === "treaty") {
        rows = alive(m).slice(0, 8).map((s, i, a) => ({ id: `treaty_${s.id}`, title: `${s.name}と${a[(i + 1) % a.length].name}の条約`, sub: "不可侵・通商", tag: "条約" }));
      } else if (kind === "economy") {
        rows = alive(m).map((s) => ({ id: `eco_${s.id}`, title: s.name, sub: `国庫 ${s.treasury.toLocaleString("ja-JP")}`, tag: "財政" }));
      } else if (kind === "tech") {
        rows = TECHS.map((t, i) => ({ id: `tech_${i}`, title: t, sub: `${alive(m).filter((_, k) => (k + i) % 3 === 0).length} 国が実用化`, tag: "技術" }));
      } else if (kind === "culture") {
        rows = ["東方文化", "山岳文化", "海洋文化", "草原文化", "古代信仰", "太陽の教え"].map((n, i) => ({ id: `culture_${i}`, title: n, sub: i < 4 ? "文化" : "宗教", tag: i < 4 ? "文化" : "宗教" }));
      } else if (kind === "magic") {
        rows = ["星読みの結社", "石の盟約"].map((n, i) => ({ id: `magic_${i}`, title: n, sub: "魔法組織", tag: "魔法" }));
      } else return { total: 0, rows: [], unsupported: true };
      if (q && kind !== "event") rows = rows.filter((r) => r.title.includes(q));
      return { total: rows.length, rows: rows.slice(offset, offset + limit) };
    },

    detail(kind, rid) {
      const m = S.view ?? S.now, past = S.view != null;
      if (kind === "state") {
        const s = S.states.find((x) => x.id === rid); if (!s) return null;
        const dead = s.dissolvedAt != null && s.dissolvedAt <= m, wars = S.wars.filter((w) => w.startedAt <= m && (w.aggressor === s.id || w.defender === s.id || w.sides.d.includes(s.id)) && (w.endedAt == null || w.endedAt > m));
        return {
          kind, id: rid, title: s.name, subtitle: `${s.polity}・成立 ${fmtMonth(s.formedAt)}`, tag: dead ? "滅亡" : s.player ? "プレイヤー国家" : "存続中", tone: dead ? "danger" : "accent",
          summary: dead ? `${fmtMonth(s.dissolvedAt)}に滅亡した。` : `${s.name}は${s.polity}。${wars.length ? `現在 ${wars.length} 件の戦争に関わっている。` : "現在、戦争には関わっていない。"}`,
          stats: [{ label: "人口", value: popAt(s, m).toLocaleString("ja-JP") }, { label: "安定度", value: `${Math.round(stabAt(s, m) * 100)}%`, tone: stabAt(s, m) < 0.3 ? "danger" : "" }, { label: "国庫", value: s.treasury.toLocaleString("ja-JP") }, { label: "兵力", value: s.army.toLocaleString("ja-JP") }, { label: "戦争", value: String(wars.length), tone: wars.length ? "danger" : "" }],
          related: wars.map((w) => ({ kind: "war", id: w.id, label: warTitle(w), relation: "戦争中" })),
          events: S.events.filter((e) => e.month <= m && e.actors.some((a) => a.id === s.id)).slice(-6).reverse().map((e) => ({ id: e.id, month: e.month, title: e.title, kind: e.kind })),
          notice: past ? `${fmtMonth(m)}の状態（読み取り専用）` : null,
        };
      }
      if (kind === "war") {
        const w = S.wars.find((x) => x.id === rid); if (!w) return null; const ended = w.endedAt != null && w.endedAt <= m;
        const nm = (ids) => ids.map((i) => S.states.find((s) => s.id === i)?.name ?? i).join("・");
        return {
          kind, id: rid, title: warTitle(w), subtitle: `${fmtMonth(w.startedAt)}〜${ended ? fmtMonth(w.endedAt) : "継続中"}`, tag: ended ? "終結" : "戦争中", tone: ended ? "" : "danger",
          summary: ended ? `結果: ${w.outcome}` : "戦争は続いている。",
          progress: [{ label: "準備", state: "done" }, { label: "戦況", state: ended ? "done" : "now" }, { label: "講和", state: ended ? "done" : "todo" }],
          stats: [{ label: "攻撃側", value: nm(w.sides.a) }, { label: "防衛側", value: nm(w.sides.d) }, { label: "損害", value: `${w.casualties.toLocaleString("ja-JP")} 人` }, { label: "経過", value: `${Math.max(0, (ended ? w.endedAt : m) - w.startedAt)} か月` }],
          related: [...w.sides.a.map((i) => ({ kind: "state", id: i, label: nm([i]), relation: "攻撃側" })), ...w.sides.d.map((i) => ({ kind: "state", id: i, label: nm([i]), relation: "防衛側" }))],
          events: S.events.filter((e) => e.month <= m && e.month >= w.startedAt && e.actors.some((a) => a.id === w.aggressor) && e.actors.some((a) => a.id === w.defender)).slice(-8).reverse().map((e) => ({ id: e.id, month: e.month, title: e.title, kind: e.kind })),
          notice: past ? `${fmtMonth(m)}の状態（読み取り専用）` : null,
        };
      }
      if (kind === "event") {
        const e = S.events.find((x) => x.id === rid); if (!e) return null; const c = categoryOf(e.kind);
        const idx = S.events.indexOf(e), prev = S.events.slice(Math.max(0, idx - 40), idx).filter((p) => p.actors.some((a) => e.actors.some((b) => b.id === a.id))).slice(-2);
        const next = S.events.slice(idx + 1, idx + 80).filter((p) => p.actors.some((a) => e.actors.some((b) => b.id === a.id))).slice(0, 2);
        return {
          kind, id: rid, title: e.title, subtitle: fmtMonth(e.month), tag: c.label, tone: c.tone, summary: [e.detail, e.causeText].filter(Boolean).join("　") || "この出来事に付いた説明はありません。",
          stats: [{ label: "種類", value: e.kind }, { label: "関与国", value: String(e.actors.length) }],
          related: [...e.actors.map((a) => ({ kind: "state", id: a.id, label: a.name, relation: "関与" })), ...prev.map((p) => ({ kind: "event", id: p.id, label: p.title, relation: "原因の候補" })), ...next.map((p) => ({ kind: "event", id: p.id, label: p.title, relation: "後続" }))],
          events: [],
        };
      }
      const row = A.list(kind, { limit: 1e6 }).rows.find((r) => r.id === rid);
      return row ? { kind, id: rid, title: row.title, subtitle: row.sub, tag: row.tag, summary: "この領域の詳細は、v5.4 の文明モデルに接続されます。", stats: [], related: [], events: [] } : null;
    },

    actions(kind, rid) {
      const past = S.view != null, reason = "過去を閲覧中は操作できません（読み取り専用）。現在へ戻してください";
      if (kind === "state") { const s = S.states.find((x) => x.id === rid); const ok = !!s?.player && s.dissolvedAt == null; return [{ id: "tax", label: "税を上げる", enabled: ok && !past, reason: past ? reason : ok ? "" : "プレイヤー国家だけが操作できます" }, { id: "arm", label: "軍備を整える", enabled: ok && !past, reason: past ? reason : ok ? "" : "プレイヤー国家だけが操作できます" }]; }
      if (kind === "war") { const w = S.wars.find((x) => x.id === rid); const mine = w && [...w.sides.a, ...w.sides.d].some((i) => S.states.find((s) => s.id === i)?.player); const on = !!w && w.status === "active" && mine; return [{ id: "peace", label: "講和を申し入れる", enabled: on && !past, reason: past ? reason : on ? "" : "プレイヤー国家が当事者の、継続中の戦争だけです" }]; }
      return [];
    },
    runAction(kind, rid, actionId) {
      if (S.view != null) return { ok: false, error: "過去を閲覧中は操作できません（読み取り専用）" };
      const s = kind === "state" ? S.states.find((x) => x.id === rid) : null;
      if (kind === "state" && s?.player) {
        if (actionId === "tax") { s.treasury += 500; s.stability = Math.max(0, s.stability - 0.05); addEvent(S.now, "state_action", `${s.name}が税を引き上げた`, { actors: [actorOf(s)], impact: { player: true } }); emit(); return { ok: true }; }
        if (actionId === "arm") { s.army += 300; s.treasury = Math.max(0, s.treasury - 400); addEvent(S.now, "state_action", `${s.name}が軍備を整えた`, { actors: [actorOf(s)], impact: { player: true } }); emit(); return { ok: true }; }
      }
      if (kind === "war" && actionId === "peace") { const w = S.wars.find((x) => x.id === rid); if (w?.status === "active") { w.status = "ended"; w.endedAt = S.now; w.outcome = "講和"; addEvent(S.now, "war_ended", `${warTitle(w)}が講和で終結`, { actors: [w.aggressor, w.defender].map((i) => actorOf(S.states.find((x) => x.id === i))), impact: { player: true, ripple: 1 } }); emit(); return { ok: true }; } }
      return { ok: false, error: "実行できません" };
    },

    band({ from, to, limit = 400 }) { const KEY = new Set(["state_formed", "state_dissolved", "war_declared", "war_ended", "disaster_struck", "tech_discovered", "climate_shift"]); const out = []; for (const e of S.events) { if (e.month > to) break; if (e.month >= from && KEY.has(e.kind)) { out.push({ id: e.id, month: e.month, kind: e.kind, title: e.title }); if (out.length >= limit) break; } } return out; },
    bandBuckets({ from, to, buckets = 160 }) {
      const span = Math.max(1, to - from), n = Math.max(1, Math.min(buckets, span)), out = new Map();
      for (const e of A.band({ from, to, limit: 1e9 })) { const i = Math.min(n - 1, Math.floor(((e.month - from) / span) * n)), b = out.get(i) ?? { index: i, n: 0, danger: false, month: e.month, title: e.title }; b.n++; if (categoryOf(e.kind).tone === "danger") b.danger = true; if (e.month < b.month) { b.month = e.month; b.title = e.title; } out.set(i, b); }
      return [...out.values()].sort((a, b) => a.index - b.index);
    },
    search(text) {
      const q = String(text ?? "").trim(); if (!q) return { groups: [], pending: false };
      const g = (kind, label, rows) => (rows.length ? [{ kind, label, total: rows.length, rows: rows.slice(0, 6) }] : []);
      return { pending: false, groups: [...g("state", "国家", A.list("state", { query: q, limit: 1e6 }).rows.map((r) => ({ id: r.id, title: r.title, sub: r.sub }))), ...g("war", "戦争", A.list("war", { query: q, limit: 1e6 }).rows.map((r) => ({ id: r.id, title: r.title, sub: r.sub }))), ...g("event", "出来事", A.list("event", { query: q, limit: 1e6 }).rows.map((r) => ({ id: r.id, title: r.title, sub: r.sub })))] };
    },
    newEvents() { const fresh = S.events.slice(S.cursor); S.cursor = S.events.length; return S.view != null ? [] : fresh.map((e) => ({ ...e })); },

    layers: () => S.layers.map((l) => ({ ...l })),
    toggleLayer(key) { const l = S.layers.find((x) => x.key === key); if (l) { l.on = !l.on; emit(); } },

    time: {
      isRunning: () => S.running,
      start() { if (S.running || S.view != null || !S.hasCiv || (runGuard && !runGuard())) return; S.running = true; S.timer = sched.setInterval(() => { advance(); emit(); }, Math.max(200, S.msPerYear / 12)); emit(); },
      stop() { if (!S.running) return; S.running = false; sched.clearInterval(S.timer); S.timer = null; emit(); },
      step() { if (S.view != null || !S.hasCiv || (runGuard && !runGuard())) return false; advance(); emit(); return true; },
      speedPerYear: () => S.msPerYear,
      setSpeedPerYear(ms) { S.msPerYear = ms; if (S.running) { A.time.stop(); A.time.start(); } emit(); },
    },

    world: {
      openFile: async () => ({ ok: true }), newWorld: async () => { S.hasWorld = true; S.name = "新しい世界"; S.start.phase = "group"; S.start.groupId = null; emit(); return { ok: true }; }, fitView: () => {}, editMap: () => {},
    },

    start: {
      state: () => ({ phase: S.start.phase, hasWorld: S.hasWorld, groupId: S.start.groupId, months: S.start.months }),
      initialGroups: () => Array.from({ length: 6 }, (_, i) => ({ id: i + 1, title: `集団 #${i + 1}`, sub: ["農耕", "牧畜", "採集", "漁労", "農耕", "採集"][i], stats: [{ label: "人口", value: String(300 + i * 40) }, { label: "環境", value: ["河川沿い", "草原", "森林", "海岸", "盆地", "山麓"][i] }], selected: S.start.groupId === i + 1 })),
      chooseGroup(gid) { S.start.groupId = gid; S.start.phase = "group"; emit(); return { ok: true }; },
      begin() { if (S.start.groupId == null) return { ok: false, error: "先に初期集団を選んでください" }; S.hasCiv = true; S.start.phase = "running"; S.start.months = 0; S.start.readyAt = 120 + Math.floor(rnd() * 400); S.start.aborted = false; addState(S.now - 12, { player: false }); emit(); return { ok: true }; },
      readiness: () => ({ ready: S.start.phase === "ready", via: "agri_union", label: "農耕集落の統合", conditions: [{ label: "農耕集落が3つ以上", met: S.start.phase === "ready" }, { label: "合計人口 3,000 以上", met: S.start.phase === "ready" }], proposalId: "proposal_1" }),
      async run({ onProgress = null, signal = null, batch = 24 } = {}) {
        while (S.start.months < S.start.readyAt) {
          if (signal?.aborted) { S.start.phase = "running"; return { stopped: "aborted", months: S.start.months }; }
          for (let i = 0; i < batch && S.start.months < S.start.readyAt; i++) { advance(true); S.start.months++; }
          onProgress?.({ months: S.start.months, year: Math.floor(S.now / 12), states: alive(S.now).length, stalled: false, warning: null });
          await new Promise((r) => setTimeout(r, 0));
        }
        S.start.phase = "ready"; emit(); return { stopped: "ready", months: S.start.months };
      },
      found() { if (S.start.phase !== "ready") return { ok: false, error: "まだ成立の段階ではありません" }; const s = addState(S.now, { player: true }); S.first = Math.min(S.first, S.now); S.start.phase = "founded"; S.cursor = S.events.length; addEvent(S.now, "state_formed", `${s.name}が成立`, { actors: [actorOf(s)], impact: { player: true, actorPopShare: 0.2 } }); emit(); return { ok: true }; },
    },

    exports: {
      describe: () => ({ chronicle: { available: S.hasCiv }, ahmap: { available: S.hasWorld }, obsidian: { available: S.hasCiv }, png: { kinds: PNG_KINDS.map((k) => k.id), available: S.hasWorld } }),
      async chronicle() { const civ = { states: Object.fromEntries(S.states.map((s) => [s.id, { id: s.id, name: s.name, formedAt: s.formedAt, dissolvedAt: s.dissolvedAt, alive: s.dissolvedAt == null, via: "agri_union", player: s.player }])), wars: Object.fromEntries(S.wars.map((w) => [w.id, w])), events: S.events.map((e) => ({ eventId: e.id, date: { year: Math.floor(e.month / 12), month: (e.month % 12) + 1 }, kind: e.kind, title: e.title, participants: e.actors.map((a) => ({ entityId: a.id, role: "state" })), causes: [] })), decisions: [] }; return { blob: new Blob(civChronicleChunks(civ, { worldName: S.name }), { type: "text/markdown" }), name: "mock.chronicle.md" }; },
      async ahmap() { return { blob: new Blob([JSON.stringify({ mock: true, now: S.now })], { type: "application/octet-stream" }), name: "mock.ahmap" }; },
      obsidianEstimate: ({ fromMonth = -Infinity, toMonth = Infinity } = {}) => ({ files: S.events.filter((e) => e.month >= fromMonth && e.month <= toMonth).length + S.states.length + 12, events: S.events.length, decisions: 0 }),
      async *obsidian({ maxPartBytes, maxPartFiles, signal, onProgress } = {}) {
        const files = (function* () { for (let i = 0; i < 40; i++) yield { path: `${S.name}/出来事/${i}.md`, data: `# 出来事 ${i}\n`.repeat(30 + i) }; })();
        yield* splitIntoParts(files, { root: S.name, maxPartBytes, maxPartFiles, signal, onProgress, zip: async (fs) => Uint8Array.from(fs.flatMap((f) => [...new TextEncoder().encode(f.path)].slice(0, 8))) });
      },
      async png({ kind, month }) { const meta = describePng({ kind, month: month ?? S.view ?? S.now, worldName: S.name, layers: S.layers, legendCount: alive(S.view ?? S.now).length }); return { blob: new Blob([PNG_1PX], { type: "image/png" }), name: `mock_${kind}.png`, meta }; },
    },
  };
  function warTitle(w) { return `${S.states.find((s) => s.id === w.aggressor)?.name ?? "?"}対${S.states.find((s) => s.id === w.defender)?.name ?? "?"}`; }
  A.setRunGuard = (fn) => { runGuard = fn; };
  A._debug = { S, advance, addEvent, alive };
  return A;
}
