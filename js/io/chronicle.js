// クロニクル（AI 向けセーブデータ）：AI（Claude 等）にアップロードして「歴史を構築してもらう」ための書き出し。
//
// 既存の .map / ALTERHISTORY 形式は「アプリが再開するための形式」で、セル配列(数値の羅列)と
// ID だけの拡張データで構成される。AI が読むと「2 番の国家」が誰なのか、何年に何が起きたのかを
// 復元できない。このファイルは逆に「AI が読んで理解する」ことだけを目的にした形式で、
//
//   ・ID を全て名前に解決する（"attackers":[2] ではなく {"id":2,"name":"ベルガ公国"}）
//   ・全ての出来事を 1 本の年表にまとめ、時代名も付ける
//   ・国家ごとに、領土・隣接・都市・軍事・外交・ノートを 1 か所に集約する
//   ・地理は「範囲・重心・地形内訳・隣接国」など、言葉で読める形にする
//   ・どうでもいい情報（全マーカー・全都市・ノート・河川・時代）も省略しない
//   ・冒頭に「AI への読み方ガイド」を同梱し、ファイル単体で意味が通るようにする
//
// 形式は JSON（AI が最も正確に読める）。Markdown 版（人間・AI 両用の読み物）も同じデータから作る。
// アプリへ戻すための完全データ（セル単位）は `cells` に RLE 圧縮で同梱するので、情報は失われない。
//
// 純粋ロジック層：DOM に依存しない。map を書き換えない。

import { cellAreas } from "../core/geometry.js";
import { listEras, eraAt } from "../core/edit/eras.js";
import { listWars } from "../core/edit/wars.js";
import { listAlliances } from "../core/edit/alliances.js";
import { listDiplomacyLog, relationLabel, getRelation } from "../core/edit/diplomacy.js";
import { listSovereigntyLog } from "../core/edit/sovereignty.js";
import { getNote, htmlToEditableText } from "./chronicle-text.js";
import { UNIT_TYPES, DOCTRINE_BY_KEY, DEFAULT_DOCTRINE, forcePower, forceHeadcount } from "../core/sim/units.js";
import { statePopulation } from "../core/query.js";

export const CHRONICLE_FORMAT = "alterhistory-chronicle";
export const CHRONICLE_VERSION = 1;

const live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
/** 年月が両方とも有限の数のときだけ有効な日付とみなす（undefined/NaN が "undefined年" と文字列化されて AI を誤解させないため） */
const validDate = (d) => !!d && Number.isFinite(d.year) && Number.isFinite(d.month);
const dateKey = (d) => (validDate(d) ? d.year * 12 + (d.month - 1) : Infinity);
const fmtDate = (d) => (validDate(d) ? `${d.year}年${d.month}月` : null);

/** 兵科の日本語名・単位 */
const UNIT_LABEL = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, { label: u.label, unit: u.unit }]));

/** 国家タイプ（Azgaar 由来）の説明。AI が意味を取れるように日本語で添える */
const STATE_TYPE_LABEL = {
  Generic: "標準型（特色なし）", Naval: "海洋国家（海軍が得意）", Nomadic: "遊牧国家（機動力・特殊部隊が得意）",
  Highland: "山岳国家（歩兵・特殊部隊が得意）", Hunting: "狩猟国家（特殊部隊が得意）", Lake: "湖沼国家（水軍がやや得意）", River: "河川国家（水軍がやや得意）",
};

/** 政体（Azgaar の form）の日本語。未知の値は原文のまま残す（情報を落とさない） */
const FORM_LABEL = {
  Monarchy: "君主制", Republic: "共和制", Theocracy: "神権政治", Union: "連合", Federation: "連邦", Empire: "帝国", Kingdom: "王国", Duchy: "公国",
  Principality: "侯国", March: "辺境伯領", Emirate: "首長国", Sultanate: "スルタン国", Caliphate: "カリフ国", Khaganate: "可汗国", Horde: "オルダ",
  Oligarchy: "寡頭制", Tribe: "部族", Commonwealth: "共和国", Confederation: "連合国", Custom: "独自",
};
const formLabel = (f) => (f ? (FORM_LABEL[f] ? `${FORM_LABEL[f]}（${f}）` : f) : null);

/** 外交関係の英語ID → 日本語 */
const rel = (r) => (r ? relationLabel(r) : null);

/** セルの重心・範囲を集計 */
/** 講和条約の記録（新しい形式の cessions / reparations / annex と、旧い形式の provinceIds / regionCells の両方に対応） */
function peaceTermsOfFactory(namer) {
  return (t) => ({
    name: t.treatyName ?? null, kind: t.kind ?? "standard", venue: t.venue?.place ?? null, signedAt: t.signedAt ? `${t.signedAt.year}年${t.signedAt.month}月` : null, notes: t.notes ?? "",
    cessions: (t.cessions ?? []).map((c) => ({ name: c.name ?? "", from: namer.state(c.fromStateId), to: namer.state(c.toStateId), cells: c.cells ?? 0, burgs: c.burgs ?? [] })),
    reparations: (t.reparations && Array.isArray(t.reparations) ? t.reparations : []).map((r) => ({ from: namer.state(r.fromStateId), to: namer.state(r.toStateId), amount: r.amount, currency: r.currency ?? null, received: r.received ?? null, receivedCurrency: r.receivedCurrency ?? null })),
    annex: (t.annex ?? []).map((x) => ({ from: namer.state(x.fromStateId), to: namer.state(x.toStateId) })),
    vassalize: (t.vassalize ?? []).map((x) => ({ from: namer.state(x.fromStateId), to: namer.state(x.toStateId), kind: { puppet: "傀儡", protectorate: "保護国", vassal: "属国" }[x.kind] ?? x.kind })),
    // 旧形式
    cededProvinces: (t.provinceIds ?? []).map((id) => namer.province(id)), cededUnaffiliatedRegions: (t.regionCells ?? []).length,
    cededTo: t.toStateId != null ? namer.state(t.toStateId) : null, legacyReparations: typeof t.reparations === "number" ? t.reparations : 0,
  });
}

function newAcc() { return { n: 0, sx: 0, sy: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; }
function addPt(a, x, y) { a.n++; a.sx += x; a.sy += y; if (x < a.x0) a.x0 = x; if (x > a.x1) a.x1 = x; if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y; }

/** 地図上の位置を「北西・中央・南東」のような言葉にする（AI が地理を掴むため） */
export function describePosition(x, y, w, h) {
  if (!w || !h) return "";
  const fx = x / w, fy = y / h;
  const col = fx < 0.33 ? "西" : fx > 0.67 ? "東" : "";
  const row = fy < 0.33 ? "北" : fy > 0.67 ? "南" : "";
  if (!col && !row) return "中央";
  return `${row}${col}`;
}

/** 連続する同じ値を [値, 長さ] にまとめる（セル配列の完全保存用。数万セルでも小さくなる） */
export function rle(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    let j = i + 1;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push([arr[i], j - i]);
    i = j;
  }
  return out;
}
export function unrle(pairs) {
  const out = [];
  for (const [v, n] of pairs) for (let k = 0; k < n; k++) out.push(v);
  return out;
}

/**
 * 名前引き。ID が壊れていても、必ず「読める形」を返す（AI が欠損で止まらないように）。
 */
function makeNamer(map) {
  const P = map.pack;
  const nm = (list, id, fallbackLabel) => {
    const e = list?.[id];
    if (!e || typeof e !== "object") return `${fallbackLabel}#${id}（存在しない）`;
    const base = e.fullName ?? e.name ?? `${fallbackLabel}#${id}`;
    // 名前にすでに「（消滅）」が付いている場合は二重に付けない（同一IDの表記ゆれ防止）
    const clean = String(base).replace(/[（(]消滅[）)]/g, "").trim();
    return e.removed ? `${clean}（消滅）` : clean;
  };
  return {
    state: (id) => (id === 0 ? "無所属" : nm(P.states, id, "国家")),
    culture: (id) => (id === 0 ? "なし" : nm(P.cultures, id, "文化")),
    religion: (id) => (id === 0 ? "なし" : nm(P.religions, id, "宗教")),
    province: (id) => (id === 0 ? "なし" : nm(P.provinces, id, "属州")),
    burg: (id) => (id === 0 ? "なし" : nm(P.burgs, id, "都市")),
  };
}
const ref = (namer, kind, id) => ({ id, name: namer[kind](id) });

// ----------------------------------------------------------------------------------------------
// 集計：セル配列から国家・文化・宗教・属州ごとの領域情報を出す
// ----------------------------------------------------------------------------------------------
function analyzeTerritory(map) {
  const c = map.pack.cells;
  const { p, cells: gc } = map.geometry.pack;
  const areas = cellAreas(map.geometry);
  const W = map.meta.width, H = map.meta.height;
  const N = c.biome.length;

  const bySt = new Map(); // stateId → {acc, land, cells, area, pop, biome:{}, neighbors:Map, coastal, provinces:Set}
  const ensure = (id) => {
    if (!bySt.has(id)) bySt.set(id, { acc: newAcc(), cells: 0, area: 0, pop: 0, biome: new Map(), neighbors: new Map(), coastCells: 0, rivers: new Set(), border: 0 });
    return bySt.get(id);
  };
  const cult = new Map(), relg = new Map(), prov = new Map();
  const bump = (m, id, cell) => { const o = m.get(id) ?? { acc: newAcc(), cells: 0, area: 0 }; addPt(o.acc, p[cell][0], p[cell][1]); o.cells++; o.area += areas[cell]; m.set(id, o); };

  let waterCells = 0, landCells = 0, totalArea = 0, totalPop = 0;
  for (let i = 0; i < N; i++) {
    if (c.biome[i] === 0) { waterCells++; continue; }
    landCells++; totalArea += areas[i]; totalPop += c.pop[i] ?? 0;
    const s = ensure(c.state[i]);
    addPt(s.acc, p[i][0], p[i][1]); s.cells++; s.area += areas[i]; s.pop += c.pop[i] ?? 0;
    s.biome.set(c.biome[i], (s.biome.get(c.biome[i]) ?? 0) + 1);
    if (c.river[i] > 0) s.rivers.add(c.river[i]);
    let coastal = false, frontier = false;
    for (const j of gc.c[i]) {
      if (c.biome[j] === 0) coastal = true;
      else if (c.state[j] !== c.state[i]) { frontier = true; s.neighbors.set(c.state[j], (s.neighbors.get(c.state[j]) ?? 0) + 1); }
    }
    if (coastal) s.coastCells++;
    if (frontier) s.border++;
    bump(cult, c.culture[i], i); bump(relg, c.religion[i], i); bump(prov, c.province[i], i);
  }
  return { bySt, cult, relg, prov, W, H, waterCells, landCells, totalArea, totalPop };
}

const summarizeAcc = (a, W, H) => a.n ? {
  centroid: [Math.round(a.sx / a.n), Math.round(a.sy / a.n)],
  bounds: { x: [Math.round(a.x0), Math.round(a.x1)], y: [Math.round(a.y0), Math.round(a.y1)] },
  position: describePosition(a.sx / a.n, a.sy / a.n, W, H),
} : null;

// ----------------------------------------------------------------------------------------------
// 本体
// ----------------------------------------------------------------------------------------------

/**
 * @param {object} map  MapData（書き換えない）
 * @param {object} [opts]
 * @param {boolean} [opts.includeCells=true]   セル単位の完全データ（RLE）を含める
 * @param {string}  [opts.fileName]
 * @param {string}  [opts.exportedAt]
 * @returns {object} クロニクル（JSON にできるプレーンなオブジェクト）
 */
export function buildChronicle(map, { includeCells = true, fileName = "", exportedAt = "" } = {}) {
  const P = map.pack, C = P.cells;
  const namer = makeNamer(map);
  const T = analyzeTerritory(map);
  const W = T.W, H = T.H;
  const now = map.worldTime ?? { year: 1, month: 1 };
  const eras = listEras(map);
  const eraName = (d) => (validDate(d) ? eraAt(map, d.year)?.name ?? null : null);
  const biomeName = (id) => map.biomesData[id]?.name ?? `バイオーム#${id}`;

  // ---- 国家 ----
  const liveStates = P.states.filter(live);
  const noteOf = (type, id) => { const t = getNote(map, type, id); return t ? htmlToEditableText(t) : null; };

  const states = liveStates.map((s) => {
    const t = T.bySt.get(s.i);
    const doctrineKey = DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
    const regs = Array.isArray(s.military) ? s.military : [];
    const cap = P.burgs[s.capital];
    const neighborList = t ? [...t.neighbors.entries()].filter(([id]) => id !== s.i).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ ...ref(namer, "state", id), borderCells: n })) : [];
    const biomeShare = t ? [...t.biome.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ biome: biomeName(id), cells: n, percent: Math.round((n / Math.max(1, t.cells)) * 100) })) : [];
    const diplomacy = [];
    for (const o of liveStates) {
      if (o.i === s.i) continue;
      const r = getRelation(map, s.i, o.i);
      if (r) diplomacy.push({ with: ref(namer, "state", o.i), relation: rel(r), relationId: r });
    }
    return {
      id: s.i,
      name: s.fullName ?? s.name,
      shortName: s.name,
      governmentForm: formLabel(s.form ?? s.formName),
      governmentFormName: s.formName ?? null,
      stateType: { id: s.type ?? "Generic", meaning: STATE_TYPE_LABEL[s.type ?? "Generic"] ?? "不明" },
      color: s.color ?? null,
      capital: cap && !cap.removed ? { id: cap.i, name: cap.name, cell: cap.cell } : null,
      dominantCulture: s.culture != null ? ref(namer, "culture", s.culture) : null,
      territory: {
        cells: t?.cells ?? 0,
        approxArea: t?.area ?? 0,
        landPercentOfWorld: t ? Math.round((t.cells / Math.max(1, T.landCells)) * 1000) / 10 : 0,
        coastalCells: t?.coastCells ?? 0,
        isLandlocked: !!t && t.coastCells === 0,
        borderCells: t?.border ?? 0,
        geography: t ? summarizeAcc(t.acc, W, H) : null,
        terrain: biomeShare,
        riverCount: t?.rivers.size ?? 0,
        neighbors: neighborList,
      },
      population: {
        total: r2(statePopulation(s)), rural: r2(s.rural), urban: r2(s.urban),
        unit: "千人（Azgaar の rural/urban と同じ単位）",
        note: "経済シミュレーションで年次更新される国家単位の集計値。セル単位の人口(cells.pop)とは一致しない。",
      },
      economy: { techLevel: typeof s.techLevel === "number" ? s.techLevel : 3, techLevelIsDefault: typeof s.techLevel !== "number", industry: r2(s.industry ?? 0), popCarryingCapacity: s.popCarryCap != null ? r2(s.popCarryCap) : null },
      military: {
        doctrine: { id: doctrineKey, label: DOCTRINE_BY_KEY[doctrineKey].label },
        regimentCount: regs.length,
        totalHeadcount: regs.reduce((a, r) => a + forceHeadcount(r.u), 0),
        totalPower: r2(regs.reduce((a, r) => a + forcePower(r.u, doctrineKey), 0)),
        regiments: regs.map((r) => ({
          id: r.i, name: r.name, icon: r.icon ?? null, cell: r.cell,
          position: describePosition(r.x ?? 0, r.y ?? 0, W, H),
          locatedIn: ref(namer, "state", C.state[r.cell] ?? 0),
          units: Object.fromEntries(Object.entries(r.u ?? {}).filter(([, n]) => n > 0).map(([k, n]) => [UNIT_LABEL[k]?.label ?? k, `${n}${UNIT_LABEL[k]?.unit ?? ""}`])),
          unitsRaw: r.u ?? {},
        })),
      },
      provinces: (s.provinces ?? []).map((id) => P.provinces[id]).filter(live).map((p) => ({ id: p.i, name: p.fullName ?? p.name })),
      diplomacy,
      alliances: listAlliances(map).filter((a) => a.members.includes(s.i)).map((a) => ({ id: a.id, name: a.name, active: !a.dissolvedAt, formed: fmtDate(a.formedAt), dissolved: fmtDate(a.dissolvedAt) })),
      note: noteOf("state", s.i),
    };
  });

  // ---- 消滅した国家（統合で解散したもの）。歴史では「滅んだ国」も重要な登場人物 ----
  const mergeLog = listSovereigntyLog(map).filter((x) => x.type === "merge");
  const extinctStates = P.states.filter((e) => e && typeof e === "object" && e.removed && e.i > 0).map((e) => {
    const m = mergeLog.find((x) => x.fromState === e.i);
    return {
      id: e.i, name: e.fullName ?? e.name, shortName: e.name, governmentForm: formLabel(e.form ?? e.formName), color: e.color ?? null,
      extinct: true, extinctAt: m ? fmtDate(m) : null, extinctEra: m ? eraName(m) : null,
      absorbedBy: m ? ref(namer, "state", m.toState) : null,
      // 統合すると capital は 0 に戻される。統合マーカー（旧首都のセルに立つ）から旧首都を復元する
      formerCapital: P.burgs[e.capital]?.name ?? recoverFormerCapital(map, e, m),
      note: noteOf("state", e.i),
      note2: "領土・都市・属州・部隊は全て併合先に移っている。過去の戦争・同盟・外交の記録には名前が残る。",
    };
  });

  // ---- 文化・宗教・属州 ----
  const mkEntity = (kind, list, tally, extra) => list.filter(live).map((e) => {
    const t = tally.get(e.i);
    return {
      id: e.i, name: e.fullName ?? e.name, color: e.color ?? null, type: e.type ?? null,
      cells: t?.cells ?? 0, geography: t ? summarizeAcc(t.acc, W, H) : null,
      note: noteOf(kind, e.i), ...extra(e),
    };
  });
  const cultures = mkEntity("culture", P.cultures, T.cult, (e) => ({ originCultures: (e.origins ?? []).filter((o) => o !== 0 || e.i === 0).map((o) => namer.culture(o)), homeCell: e.center ?? null }));
  const religions = mkEntity("religion", P.religions, T.relg, (e) => ({ form: e.form ?? null, deity: e.deity ?? null, originatedInCulture: e.culture != null ? namer.culture(e.culture) : null, originReligions: (e.origins ?? []).filter((o) => o !== 0).map((o) => namer.religion(o)) }));
  const provinces = mkEntity("province", P.provinces, T.prov, (e) => ({ state: ref(namer, "state", e.state), centerBurg: e.burg ? ref(namer, "burg", e.burg) : null }));

  // ---- 都市（全て。小さな都市も省略しない） ----
  const burgs = P.burgs.filter(live).map((b) => ({
    id: b.i, name: b.name, isCapital: !!b.capital, isPort: !!b.port,
    state: ref(namer, "state", b.state), culture: ref(namer, "culture", b.culture),
    province: ref(namer, "province", C.province[b.cell] ?? 0), religion: ref(namer, "religion", C.religion[b.cell] ?? 0),
    population: r2((b.population ?? 0) * 1000), populationUnit: "人（千人単位の保存値を×1000）",
    cell: b.cell, position: describePosition(b.x, b.y, W, H), xy: [Math.round(b.x), Math.round(b.y)],
    type: b.type ?? null, group: b.group ?? null,
    walls: !!b.walls, plaza: !!b.plaza, citadel: !!b.citadel, temple: !!b.temple, shanty: !!b.shanty,
    note: noteOf("burg", b.i),
  }));

  // ---- マーカー（全て） ----
  const markers = map.markers.map((m) => ({
    id: m.i, name: m.name ?? null, type: m.type ?? null, icon: m.icon ?? null, cell: m.cell ?? null,
    xy: [Math.round(m.x ?? 0), Math.round(m.y ?? 0)], position: describePosition(m.x ?? 0, m.y ?? 0, W, H),
    inState: ref(namer, "state", C.state[m.cell] ?? 0),
    note: noteOf("marker", m.i),
  }));

  // ---- 河川・ゾーンなど地理のその他 ----
  const rivers = (P.rivers ?? []).filter((r) => r && r.i).map((r) => ({ id: r.i, name: r.name ?? null, type: r.type ?? null, length: r.length ?? null, discharge: r.discharge ?? null, sourceCell: r.source ?? null, mouthCell: r.mouth ?? null }));
  const zones = (map.zones ?? []).filter(Boolean).map((z) => ({ name: z.name ?? null, type: z.type ?? null, cells: Array.isArray(z.cells) ? z.cells.length : null }));

  // ---- 戦争 ----
  const stateNames = (ids) => ids.map((id) => ref(namer, "state", id));
  const wars = listWars(map).map((w) => {
    const wins = { attacker: 0, defender: 0 };
    for (const b of w.battles ?? []) wins[b.winner] = (wins[b.winner] ?? 0) + 1;
    return {
      id: w.id, name: w.name, status: w.endedAt ? "終結" : "継続中",
      started: fmtDate(w.startedAt), startedEra: eraName(w.startedAt), ended: fmtDate(w.endedAt), endedEra: eraName(w.endedAt),
      attackers: stateNames(w.attackers), defenders: stateNames(w.defenders),
      battleCount: (w.battles ?? []).length, attackerWins: wins.attacker, defenderWins: wins.defender,
      type: w.type ?? null, warScore: w.result?.warScore ?? null,
      battles: (w.battles ?? []).map((b) => ({
        date: fmtDate(b.date ?? b), name: b.name ?? null, place: b.place ?? null, text: b.text ?? null,
        attacker: namer.state(b.attackerState), defender: namer.state(b.defenderState),
        winner: b.winner === "attacker" ? namer.state(b.attackerState) : namer.state(b.defenderState), winnerSide: b.winner,
        attackerPower: b.aPower ?? null, defenderPower: b.dPower ?? null,
      })),
      peaceTerms: w.terms ? peaceTermsOfFactory(namer)(w.terms) : null,
    };
  });

  // ---- 同盟 ----
  const alliances = listAlliances(map).map((a) => ({
    id: a.id, name: a.name, status: a.dissolvedAt ? "解消済み" : "存続中", members: stateNames(a.members),
    formed: fmtDate(a.formedAt), dissolved: fmtDate(a.dissolvedAt),
  }));

  // ---- 統合年表（全ての出来事を時系列に。AI が「歴史」を掴む最重要部分） ----
  const timeline = [];
  const push = (date, type, title, detail, involved = []) => timeline.push({
    date: fmtDate(date), year: validDate(date) ? date.year : null, month: validDate(date) ? date.month : null, era: eraName(date), type, title, detail: detail ?? null, involvedStates: involved,
    _k: dateKey(date),
  });
  for (const e of eras) push({ year: e.fromYear, month: 1 }, "era", `時代「${e.name}」の始まり`, `${e.fromYear}年から。`);
  for (const a of listAlliances(map)) {
    push(a.formedAt, "alliance-formed", `同盟「${a.name}」結成`, `加盟国: ${a.members.map(namer.state).join("、")}`, stateNames(a.members));
    if (a.dissolvedAt) push(a.dissolvedAt, "alliance-dissolved", `同盟「${a.name}」解消`, `加盟国だった: ${a.members.map(namer.state).join("、")}`, stateNames(a.members));
  }
  for (const d of listDiplomacyLog(map)) {
    push(d, "diplomacy", `外交: ${namer.state(d.a)} と ${namer.state(d.b)} の関係が変化`, `${d.from ? rel(d.from) : "未設定"} → ${rel(d.to)}（${namer.state(d.a)} から見た関係）`, [ref(namer, "state", d.a), ref(namer, "state", d.b)]);
  }
  for (const w of listWars(map)) {
    push(w.startedAt, "war-declared", `戦争「${w.name}」開戦`, `攻撃側: ${w.attackers.map(namer.state).join("、")} / 防御側: ${w.defenders.map(namer.state).join("、")}`, [...stateNames(w.attackers), ...stateNames(w.defenders)]);
    for (const b of w.battles ?? []) push(b, "battle", `戦闘（${w.name}）`, `${namer.state(b.attackerState)}（攻）対 ${namer.state(b.defenderState)}（防）→ ${b.winner === "attacker" ? namer.state(b.attackerState) : namer.state(b.defenderState)} の勝利（戦力 ${b.aPower} 対 ${b.dPower}）`, [ref(namer, "state", b.attackerState), ref(namer, "state", b.defenderState)]);
    if (w.endedAt) {
      const t = w.terms, nm = (id) => namer.state(id);
      const body = !t ? "条件の記録なし" : t.cessions || t.annex || Array.isArray(t.reparations)
        ? `${t.treatyName ?? "講和条約"}（${{ standard: "通常の講和", white: "白紙和平", annex: "全面降伏" }[t.kind ?? "standard"]}）${(t.cessions ?? []).length ? ` / 割譲 ${(t.cessions ?? []).map((c) => `${c.name || "区画"}→${nm(c.toStateId)}`).join("、")}` : ""}${(t.reparations ?? []).length ? ` / 賠償 ${(t.reparations ?? []).map((r) => `${nm(r.fromStateId)}→${nm(r.toStateId)} ${r.amount}`).join("、")}` : ""}${(t.annex ?? []).length ? ` / 併合 ${(t.annex ?? []).map((x) => `${nm(x.fromStateId)}→${nm(x.toStateId)}`).join("、")}` : ""}`
        : `割譲: ${(t.provinceIds ?? []).map(namer.province).join("、") || "属州なし"}${(t.regionCells ?? []).length ? ` ほか未編入地域${t.regionCells.length}か所` : ""} → ${namer.state(t.toStateId)}${t.reparations ? ` / 賠償(産業力) ${t.reparations}` : ""}`;
      push(w.endedAt, "war-ended", `戦争「${w.name}」講和`, body, [...stateNames(w.attackers), ...stateNames(w.defenders)]);
    }
  }
  for (const s of listSovereigntyLog(map)) {
    if (s.type === "merge") {
      push(s, "state-merged", `国家の統合: ${s.fromName ?? namer.state(s.fromState)} が ${s.toName ?? namer.state(s.toState)} に併合`,
        `${s.fromName ?? namer.state(s.fromState)} は解散し、全領土・都市・属州・部隊が ${s.toName ?? namer.state(s.toState)} に移った。`,
        [ref(namer, "state", s.fromState), ref(namer, "state", s.toState)]);
    } else if (s.type === "independence") {
      push(s, "independence", `属州の独立: ${s.provinceName ?? namer.province(s.provinceId)} が ${namer.state(s.fromState)} から独立し「${s.name ?? namer.state(s.newState)}」を建国`,
        `新国家「${s.name ?? namer.state(s.newState)}」は ${namer.state(s.fromState)} の ${s.provinceName ?? namer.province(s.provinceId)} の全領土を引き継いだ。`,
        [ref(namer, "state", s.fromState), ref(namer, "state", s.newState)]);
    } else {
      push(s, "sovereignty", `主権の変動（${s.type ?? "不明"}）`, JSON.stringify(s));
    }
  }
  timeline.sort((a, b) => a._k - b._k);
  for (const t of timeline) delete t._k;

  // ---- 完全なセル単位データ（アプリへ戻す・厳密な検証用。RLE で小さく） ----
  const cells = includeCells ? {
    note: "各配列は [値, 連続数] の列（ランレングス）。unrle で展開すると添字=セルID。値の意味は legend を参照。",
    count: C.biome.length,
    legend: { biome: "バイオームID→ biomes", state: "国家ID→ states[].id（0=無所属）", culture: "文化ID→ cultures[].id", religion: "宗教ID→ religions[].id", province: "属州ID→ provinces[].id", burg: "都市ID→ burgs[].id（0=なし）", river: "河川ID→ rivers[].id（0=なし）", pop: "セル人口（千人）" },
    biome: rle(C.biome), state: rle(C.state), culture: rle(C.culture), religion: rle(C.religion), province: rle(C.province), burg: rle(C.burg), river: rle(C.river), pop: rle(C.pop.map((v) => r2(v))),
    points: map.geometry.pack.p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
  } : null;

  return {
    format: CHRONICLE_FORMAT,
    formatVersion: CHRONICLE_VERSION,
    exportedAt: exportedAt || "",
    guideForAI: buildGuide(),
    world: {
      name: map.meta.name || fileName || "名称未設定の世界",
      sourceFile: fileName || null,
      mapSize: { width: W, height: H, note: "座標系: 左上が(0,0)、x は東へ、y は南へ増える。「北西」などの position はこの座標を3分割した言葉。" },
      currentDate: { year: now.year, month: now.month, text: fmtDate(now), era: eraName(now) },
      eras: eras.map((e, i) => ({ id: e.id, name: e.name, fromYear: e.fromYear, untilYear: eras[i + 1] ? eras[i + 1].fromYear - 1 : null })),
      totals: {
        states: liveStates.length, cultures: cultures.length, religions: religions.length, provinces: provinces.length, burgs: burgs.length, markers: markers.length,
        landCells: T.landCells, waterCells: T.waterCells, totalCells: T.landCells + T.waterCells,
        totalPopulationOnCells: r2(T.totalPop), totalStatePopulation: r2(liveStates.reduce((a, s) => a + statePopulation(s), 0)),
      },
      scale: map.settings.options?.units ? { distance: map.settings.options.units.distance, area: map.settings.options.units.area, height: map.settings.options.units.height } : null,
    },
    timeline,
    states, extinctStates, cultures, religions, provinces, burgs, markers, rivers, zones, wars, alliances,
    biomes: map.biomesData.map((b) => ({ id: b.i, name: b.name, habitability: b.habitability ?? null })),
    ranking: buildRanking(states),
    consistencyChecks: buildChecks(map, states, T),
    cells,
  };
}

/** 統合マーカー（名前に「<国名>が…に統合」を含む）のセルにある都市を、旧首都とみなす。復元できなければ null */
function recoverFormerCapital(map, extinct, mergeEntry) {
  if (!mergeEntry) return null;
  const name = extinct.fullName ?? extinct.name;
  const mk = map.markers.find((k) => k.type === "founding" && typeof k.name === "string" && k.name.startsWith(`${name}が`));
  const b = mk ? map.pack.burgs[map.pack.cells.burg[mk.cell]] : null;
  return b && !b.removed ? b.name : null;
}

function buildRanking(states) {
  const top = (key, fn) => [...states].sort((a, b) => fn(b) - fn(a)).map((s, i) => ({ rank: i + 1, name: s.name, value: fn(s) }));
  return {
    byTerritory: top("cells", (s) => s.territory.cells),
    byPopulation: top("pop", (s) => s.population.total),
    byMilitaryPower: top("mil", (s) => s.military.totalPower),
    byTechLevel: top("tech", (s) => s.economy.techLevel),
  };
}

/** AI が「このデータは信用できるか」を判断できるよう、整合性の検査結果も付ける */
function buildChecks(map, states, T) {
  const issues = [];
  const P = map.pack, C = P.cells;
  const cellSum = states.reduce((a, s) => a + s.territory.cells, 0);
  const neutral = T.bySt.get(0)?.cells ?? 0;
  if (cellSum + neutral !== T.landCells) issues.push(`国家の領土セル合計(${cellSum})+無所属(${neutral}) が陸セル数(${T.landCells})と一致しません`);
  for (const b of P.burgs.filter(live)) if (C.biome[b.cell] === 0) issues.push(`都市「${b.name}」が水域のセルにあります`);
  for (const s of P.states.filter(live)) if (s.capital && (!P.burgs[s.capital] || P.burgs[s.capital].removed)) issues.push(`国家「${s.name}」の首都が存在しない都市を指しています`);
  return { ok: issues.length === 0, issues };
}

function buildGuide() {
  return {
    purpose: "この JSON は架空世界『ALTERHISTORY』のセーブデータです。あなた（AI）はこれを読み、世界の歴史・地理・政治を理解して、続きの歴史を構築・分析・執筆してください。",
    howToRead: [
      "world: 世界の基本情報。currentDate が『今』の年月。eras は時代区分（年の範囲）。",
      "timeline: 全ての出来事（開戦・戦闘・講和・同盟・外交変化・独立・統合・時代の始まり）を時系列に並べた年表。歴史を掴むにはまずここを読む。",
      "extinctStates: 統合で消滅した国家。過去の記録（wars, alliances, timeline）に名前が出てくる国の素性はここで分かる。",
      "states: 国家ごとに領土・地理・隣接国・人口・経済・軍事(部隊の内訳)・外交・同盟・ノートを集約。id は他の場所（wars, alliances など）からの参照キー。",
      "cultures / religions / provinces: それぞれの分布と、ユーザーが書いたノート。",
      "burgs: 全ての都市（小さなものも含む）。markers: 地図上の目印（遺跡・古戦場など）。",
      "wars: 戦争ごとの経過（全戦闘の勝敗と戦力）と講和条件。status が『継続中』のものは今も戦争が続いている。",
      "ranking: 領土・人口・軍事力・技術水準の順位。",
      "cells: セル単位の完全データ（ランレングス圧縮）。地図を厳密に再現したいときだけ使う。通常は不要。",
    ],
    conventions: [
      "全ての参照は {id, name} の形。name を見れば意味が分かる。id は同じ種類の中で一意。",
      "position は地図を縦横3分割した言葉（北西・北・北東・西・中央・東・南西・南・南東）。geography.bounds は座標の範囲。",
      "人口の単位: 国家・属州の population は『千人』、都市の population は『人』（注記あり）。",
      "年月は『年』が世界の開始からの通し年、『月』は 1〜12。",
    ],
    designNotes: [
      "戦闘に勝っても国境は動かない。領土が動くのは講和条約（wars[].peaceTerms）・独立・統合のときだけ。",
      "同盟・戦争・外交・軍事・技術水準はユーザーが手動で決めた内容。AI による自律行動は元のアプリには無い。",
      "経済(人口・産業)は年次で自動更新される簡易モデル。数値バランスは仮置きで、史実に基づくものではない。",
      "ノート(note)はユーザーの自由記述。世界設定の一次情報として最優先で尊重すること。",
    ],
    doNot: [
      "存在しない id を作らない。新しい国家・都市を作るときは既存の最大 id + 1 を使う。",
      "『消滅』と付いた名前は既に滅びた実体。現存扱いしないこと。",
    ],
    suggestedTasks: [
      "年表を元に、時代ごとの歴史叙述（教科書風・年代記風）を書く。",
      "現在の勢力図・同盟・継続中の戦争から、次に起こりうる展開を提案する。",
      "ノートの記述と、実際の領土・戦績の矛盾を指摘する。",
    ],
  };
}

// ----------------------------------------------------------------------------------------------
// Markdown 版：人間にも AI にも読める物語形式の要約。同じデータから作る。
// ----------------------------------------------------------------------------------------------
export function chronicleToMarkdown(ch) {
  const L = [];
  const w = ch.world;
  L.push(`# ${w.name}（ALTERHISTORY クロニクル）`, "");
  L.push(`- 現在: **${w.currentDate.text}**${w.currentDate.era ? `（${w.currentDate.era}）` : ""}`);
  L.push(`- 地図: ${w.mapSize.width}×${w.mapSize.height} / 国家 ${w.totals.states}・都市 ${w.totals.burgs}・マーカー ${w.totals.markers}・文化 ${w.totals.cultures}・宗教 ${w.totals.religions}・属州 ${w.totals.provinces}`);
  if (w.eras.length) L.push(`- 時代区分: ${w.eras.map((e) => `${e.name}（${e.fromYear}年〜${e.untilYear ? e.untilYear + "年" : ""}）`).join(" → ")}`);
  L.push("", "> このファイルは AI に読ませて歴史を構築するための要約です。厳密なデータは同名の `.chronicle.json` にあります。", "");

  L.push("## 年表", "");
  let lastEra = null;
  for (const t of ch.timeline) {
    if (t.era !== lastEra) { L.push("", `### ${t.era ?? "（時代区分なし）"}`, ""); lastEra = t.era; }
    L.push(`- **${t.date ?? "日付不明"}** [${TYPE_JP[t.type] ?? t.type}] ${t.title}${t.detail ? ` — ${t.detail}` : ""}`);
  }
  if (!ch.timeline.length) L.push("（記録された出来事はありません）");

  L.push("", "## 国家", "");
  for (const s of ch.states) {
    L.push(`### ${s.name}（id ${s.id}）`, "");
    L.push(`- 政体: ${s.governmentForm ?? "不明"}${s.stateType.id === "Generic" ? "" : ` / タイプ: ${s.stateType.meaning}`}`);
    L.push(`- 首都: ${s.capital ? `${s.capital.name}(id${s.capital.id})` : "なし"} / 位置: ${s.territory.geography?.position ?? "不明"}${s.territory.isLandlocked ? "（内陸国）" : ""}`);
    L.push(`- 領土: ${s.territory.cells}セル（世界の陸地の${s.territory.landPercentOfWorld}%） / 隣接: ${s.territory.neighbors.map((n) => n.name).join("、") || "なし"}`);
    L.push(`- 主な地形: ${s.territory.terrain.slice(0, 3).map((t) => `${t.biome} ${t.percent}%`).join("、") || "不明"}`);
    L.push(`- 人口: ${s.population.total}（千人） / 技術水準 ${s.economy.techLevel}${s.economy.techLevelIsDefault ? "（未設定の既定値）" : ""} / 産業力 ${s.economy.industry}`);
    L.push(`- 軍事: ドクトリン「${s.military.doctrine.label}」 / 部隊 ${s.military.regimentCount} / 総兵員 ${s.military.totalHeadcount} / 戦力 ${s.military.totalPower}`);
    for (const r of s.military.regiments) L.push(`  - ${r.name}（${r.position}・${r.locatedIn.name}領内）: ${Object.entries(r.units).map(([k, v]) => `${k}${v}`).join("、") || "兵力なし"}`);
    if (s.diplomacy.length) L.push(`- 外交: ${s.diplomacy.map((d) => `${d.with.name}=${d.relation}`).join("、")}`);
    if (s.alliances.length) L.push(`- 同盟: ${s.alliances.map((a) => `${a.name}${a.active ? "" : "（解消済み）"}`).join("、")}`);
    if (s.note) L.push(`- 【ノート】${s.note.replace(/\n/g, " ")}`);
    L.push("");
  }

  if (ch.extinctStates.length) {
    L.push("## 消滅した国家", "");
    for (const e of ch.extinctStates) L.push(`- **${e.name}**（id ${e.id}・${e.governmentForm ?? "政体不明"}）: ${e.extinctAt ?? "時期不明"}に${e.absorbedBy ? e.absorbedBy.name + "へ併合" : "消滅"}。旧首都: ${e.formerCapital ?? "不明"}${e.note ? ` — ${e.note.replace(/\n/g, " ")}` : ""}`);
    L.push("");
  }

  L.push("## 戦争", "");
  for (const wr of ch.wars) {
    L.push(`### ${wr.name}（${wr.status}）`, `- 期間: ${wr.started} 〜 ${wr.ended ?? "継続中"} / 攻撃側: ${wr.attackers.map((x) => x.name).join("、")} / 防御側: ${wr.defenders.map((x) => x.name).join("、")}`);
    L.push(`- 戦闘 ${wr.battleCount} 回（攻撃側 ${wr.attackerWins} 勝・防御側 ${wr.defenderWins} 勝）`);
    for (const b of wr.battles) L.push(`  - ${b.date}: ${b.name ? `${b.name}　` : ""}${b.attacker} 対 ${b.defender} → ${b.winner} 勝利${b.attackerPower != null ? `（戦力 ${b.attackerPower} 対 ${b.defenderPower}）` : ""}`);
    const pt = wr.peaceTerms;
    if (pt) {
      if (pt.cessions?.length || pt.reparations?.length || pt.annex?.length || pt.name) {
        L.push(`- 講和条約: ${pt.name ?? "—"}（${{ standard: "通常の講和", white: "白紙和平", vassal: "従属化", annex: "全面降伏" }[pt.kind] ?? pt.kind}${pt.venue ? `・講和地 ${pt.venue}` : ""}）`);
        for (const c of pt.cessions) L.push(`  - 割譲: ${c.name || "区画"}（${c.cells}セル）${c.from} → ${c.to}`);
        for (const r of pt.reparations) L.push(`  - 賠償: ${r.from} が ${r.amount} ${r.currency ?? ""} → ${r.to} が ${r.received ?? "?"} ${r.receivedCurrency ?? ""}`);
        for (const x of pt.annex) L.push(`  - 併合: ${x.from} → ${x.to}`);
        for (const x of pt.vassalize ?? []) L.push(`  - 従属: ${x.from} は ${x.to} の${x.kind}`);
        if (pt.notes) L.push(`  - 条件: ${pt.notes}`);
      } else L.push(`- 講和: 割譲 ${pt.cededProvinces.join("、") || "なし"} → ${pt.cededTo}${pt.legacyReparations ? ` / 賠償 ${pt.legacyReparations}` : ""}`);
    }
    L.push("");
  }
  if (!ch.wars.length) L.push("（戦争の記録はありません）", "");

  L.push("## 同盟", "");
  for (const a of ch.alliances) L.push(`- **${a.name}**（${a.status}）: ${a.members.map((m) => m.name).join("、")} / 結成 ${a.formed ?? "不明"}${a.dissolved ? ` / 解消 ${a.dissolved}` : ""}`);
  if (!ch.alliances.length) L.push("（同盟はありません）");

  L.push("", "## 文化・宗教・属州", "");
  for (const [label, list] of [["文化", ch.cultures], ["宗教", ch.religions], ["属州", ch.provinces]]) {
    L.push(`### ${label}`);
    for (const e of list) L.push(`- ${e.name}（${e.cells}セル・${e.geography?.position ?? "位置不明"}）${e.note ? ` — ${e.note.replace(/\n/g, " ")}` : ""}`);
    L.push("");
  }

  L.push("## 都市（全て）", "");
  for (const b of ch.burgs) L.push(`- ${b.name}(id${b.id})${b.isCapital ? "【首都】" : ""}${b.isPort ? "【港】" : ""}: ${b.state.name}・${b.province.name}・人口${b.population}人・${b.position}${b.note ? ` — ${b.note.replace(/\n/g, " ")}` : ""}`);

  L.push("", "## マーカー（全て）", "");
  for (const m of ch.markers) L.push(`- ${m.icon ?? ""} ${m.name ?? m.type}（${m.position}・${m.inState.name}領内）${m.note ? ` — ${m.note.replace(/\n/g, " ")}` : ""}`);
  if (!ch.markers.length) L.push("（マーカーはありません）");

  L.push("", "## ランキング", "");
  for (const [label, key] of [["領土", "byTerritory"], ["人口", "byPopulation"], ["軍事力", "byMilitaryPower"], ["技術水準", "byTechLevel"]]) L.push(`- ${label}: ${ch.ranking[key].map((r) => `${r.rank}位 ${r.name}(${r.value})`).join(" / ")}`);

  L.push("", "## データの整合性", "", ch.consistencyChecks.ok ? "- 異常は検出されませんでした。" : ch.consistencyChecks.issues.map((i) => `- ⚠ ${i}`).join("\n"));
  return L.join("\n") + "\n";
}

const TYPE_JP = {
  era: "時代", "alliance-formed": "同盟結成", "alliance-dissolved": "同盟解消", diplomacy: "外交", "war-declared": "開戦", battle: "戦闘",
  "war-ended": "講和", independence: "独立", "state-merged": "統合", sovereignty: "主権",
};

/** クロニクルを JSON 文字列にする（人間も読めるよう整形。cells だけは巨大になるので1行にまとめる） */
export function serializeChronicle(ch, { pretty = true } = {}) {
  if (!pretty) return JSON.stringify(ch);
  const { cells, ...rest } = ch;
  let body = JSON.stringify(rest, null, 2);
  if (cells) {
    // cells の各配列は 1 行にして、構造の部分だけを整形する（数万行に膨れるのを避ける）
    const cellsBody = "{\n" + Object.entries(cells).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n  }";
    body = body.replace(/\n}$/, `,\n  "cells": ${cellsBody}\n}`);
  }
  return body + "\n";
}

/** cells を map へ戻すための読み出し（検証・将来の取り込み用） */
export function readChronicleCells(ch) {
  const c = ch.cells;
  if (!c) return null;
  return { biome: unrle(c.biome), state: unrle(c.state), culture: unrle(c.culture), religion: unrle(c.religion), province: unrle(c.province), burg: unrle(c.burg), river: unrle(c.river), pop: unrle(c.pop) };
}
