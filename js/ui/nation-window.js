// 国家タブ：国家に関する操作のハブ。左のバーで「国家」を押すと、最初に国家一覧が開く（新しいタブは作らない）。
//   一覧 → 国を選ぶと同じ窓の中で詳細に切り替わる（「◀ 国家一覧」で戻る）。「新規作成」「統合」は一覧に置く。国家の削除機能は無い。
//   詳細：左上に指導者の顔、その横に国家情報（人口・支持・安定度・国庫）、政体。
//         サブタブ：概要 / 軍事 / 技術ドクトリン / 傀儡・属州 / 内政・税 / 工作
import { el, btn, swatch, isLive } from "./kit.js";
import { faceSvg } from "./face-svg.js";
import { guardRender } from "./safe-render.js";
import { militaryPicker, techPicker } from "./nation-pickers.js";
import { conditionPane, progressBlock } from "./condition-view.js";
import { createCovertView } from "./covert-window.js";
import { leaderRecord, faceOf, leaderAge, leaderCandidates, titleFor, REASONS, STABILITY, heirOf, familyOf, MAJORITY } from "../core/edit/leaders.js";
import { REGIMES, regimeOf, supportBars } from "../core/edit/regimes.js";
import { getTechDoctrine, TECH_TRACKS } from "../core/edit/doctrines.js";
import { effectiveDoctrineKey } from "../core/edit/doctrines.js";
import { VASSAL_KINDS, vassalsOf, vassalInfo } from "../core/edit/vassals.js";
import { REBEL_TYPES, REBEL_TYPE_BY_KEY, REBEL_SCALES, canRebel } from "../core/edit/rebellion.js";
import { supportOf } from "../core/sim/war-engine.js";
import { nationStability } from "../core/edit/stability.js";
import { UNIT_BY_KEY, DOCTRINE_BY_KEY, forceHeadcount } from "../core/sim/units.js";
import { statePopulation } from "../core/query.js";
import { nuclearStock } from "../core/sim/nuclear.js";
import { STATE_TAGS } from "../core/edit/world-info.js";
import { htmlToEditable, editableToHtml } from "../core/edit/notes.js";
import { appendEntityProfile } from "./profile-fields.js";
import { generatePersonName } from "../core/names/person.js";
import { faceSpec } from "../core/edit/face.js";
import { suggestName } from "../core/edit/naming.js";
import { createRandom } from "../core/random.js";

const fmt = (n) => Math.round(n ?? 0).toLocaleString("ja-JP");
const TABS = [["overview", "概要"], ["condition", "国勢"], ["military", "軍事"], ["tech", "技術ドクトリン"], ["vassal", "傀儡・属州"], ["finance", "内政・税"], ["covert", "工作"]];
const STEPS = ["領土", "指導者", "政体", "ドクトリン", "技術ドクトリン"];
const newRnd = () => createRandom(Math.floor(Math.random() * 2 ** 31));
const sname = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;

export function initNationWindow({ store, wins, editActions, simActions, setupActions, economyView, openSetup, getWarsPanel, openRebellion, getHighlight = () => null }) {
  const body = el("div", "nation-body");
  let hoverTimer = 0, view = "list", sel = null, tab = "overview", step = 0, draft = null, mergeFrom = null, mergeTo = null, mergeArmed = false, candidates = null, succReason = "death", succStab = "stable", rebel = { type: "independence", scale: "medium", armed: false }, warTarget = null, sortBy = "default", sortDesc = false;
  const covert = createCovertView({ store, simActions, getAttacker: () => sel });
  const clearHl = () => { clearInterval(hoverTimer); hoverTimer = 0; getHighlight?.()?.clear(); };
  wins.register("nation", { title: "国家", width: 940, body, onOpen: () => { editActions.ensureLeaders(); render(); }, onClose: clearHl });
  const mapOf = () => store.getState().map;
  const fail = (e) => store.update((s) => { s.error = e?.message ?? String(e); });

  // ---------- 一覧 ----------
  function listView(map) {
    const box = el("div", "nation-list");
    const bar = el("div", "nation-bar");
    bar.append(el("h3", "", "国家一覧"), btn("primary", "＋ 新規作成", "新しい国家をつくる", () => startCreate()));
    const states = map.pack.states.filter(isLive);
    const mg = el("span", "nation-merge");
    const mk = (cur, on) => { const s = document.createElement("select"); s.append(new Option("—", "")); for (const x of states) s.append(new Option(sname(map, x.i), x.i, false, x.i === cur)); s.addEventListener("change", () => { on(s.value ? Number(s.value) : null); mergeArmed = false; render(); }); return s; };
    mg.append(el("span", "np-k", "統合"), mk(mergeFrom, (v) => { mergeFrom = v; }), el("span", "", "を"), mk(mergeTo, (v) => { mergeTo = v; }), el("span", "", "へ"));
    const go = btn(mergeArmed ? "danger" : "", mergeArmed ? "本当に統合する" : "統合", "左の国を右の国に併合する（Undoで戻せる）", () => {
      if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return fail(new Error("統合する国を2つ選んでください"));
      if (!mergeArmed) { mergeArmed = true; return render(); }
      editActions.mergeStates(mergeFrom, mergeTo); mergeFrom = mergeTo = null; mergeArmed = false; render();
    });
    mg.append(go); bar.append(mg);
    const SORTS = [["default", "登録順"], ["name", "名前"], ["pop", "人口"], ["regime", "政体"]];
    const sortRow = el("div", "np-row nation-sort"), ss = document.createElement("select"); ss.dataset.field = "nation-sort";
    for (const [k, t] of SORTS) ss.append(new Option(t, k, false, k === sortBy));
    ss.addEventListener("change", () => { sortBy = ss.value; render(); });
    sortRow.append(el("span", "np-k", "並べ替え"), ss, btn("", sortDesc ? "▼ 降順" : "▲ 昇順", "並びの向きを切り替える", () => { sortDesc = !sortDesc; render(); }));
    const keyOf = { name: (x) => sname(map, x.i), pop: (x) => statePopulation(x), regime: (x) => regimeOf(x).label, default: (x) => x.i }[sortBy];
    states.sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); const c = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb), "ja"); return (sortDesc ? -c : c) || a.i - b.i; });
    const table = el("div", "nation-table");
    const head = el("div", "nation-row nation-head"); for (const h of ["", "国家", "政体", "指導者", "人口", "属州"]) head.append(el("span", "", h)); table.append(head);
    for (const s of states) {
      const l = leaderRecord(map, s.i).current, r = el("div", "nation-row b-click");
      const provs = map.pack.provinces.filter((p) => isLive(p) && p.state === s.i).length;
      r.append(swatch(s.color, false), el("span", "nn", sname(map, s.i)), el("span", "", regimeOf(s).label), el("span", "", l ? `${l.title}${l.name}` : "—"), el("span", "num", fmt(statePopulation(s))), el("span", "num", String(provs)));
      r.addEventListener("click", () => openState(s.i)); table.append(r);
    }
    if (!states.length) table.append(el("p", "muted", "国家がまだありません。「＋ 新規作成」から建国できます。"));
    box.append(bar, sortRow, table); return box;
  }

  // ---------- 新規作成（領土 → 指導者 → 政体 → ドクトリン → 技術ドクトリン） ----------
  function startCreate() {
    const map = mapOf(), rnd = newRnd();
    draft = { size: "m", name: suggestName(map, { kind: "state", rnd }).name, gender: "m", leaderName: "", regime: "absolute", doctrine: "balanced", doctrineNodes: [], techDoctrine: Object.fromEntries(TECH_TRACKS.map((t) => [t.key, 3])), i: 0 };
    draft.leaderName = generatePersonName(rnd, "m").full; view = "create"; step = 0; render();
  }
  function createView(map) {
    const box = el("div", "nation-create");
    const bar = el("div", "nation-bar"); bar.append(btn("", "◀ 国家一覧", "", () => { clearHl(); view = "list"; render(); }), el("h3", "", "国家の新規作成"));
    const crumbs = el("div", "np-crumbs"); STEPS.forEach((t, i) => { const c = el("span", `np-crumb${i === step ? " on" : i < step ? " done" : ""}`, `${i + 1}. ${t}`); c.addEventListener("click", () => { if (i <= step) { step = i; render(); } }); crumbs.append(c); });
    const pane = el("div", "np-pane");
    const field = (label, node) => { const l = el("label", "np-row"); l.append(el("span", "np-k", label), node); return l; };
    const text = (k, ph) => { const i = document.createElement("input"); i.value = draft[k]; i.placeholder = ph ?? ""; i.addEventListener("input", () => { draft[k] = i.value; }); return i; };
    if (step === 0) {
      pane.append(field("国名", text("name", "（空欄なら自動）")), btn("", "🎲 名前をつくり直す", "", () => { draft.name = suggestName(map, { kind: "state", rnd: newRnd() }).name; render(); }));
      const g = el("div", "np-seg"); for (const [k, t] of [["s", "小さめ"], ["m", "ふつう"], ["l", "大きめ"], ["later", "あとで決める"]]) g.append(btn(draft.size === k ? "on" : "", t, "", () => { draft.size = k; render(); }));
      pane.append(field("領土", g), el("p", "hint", "空いている土地から、連なった領域を自動で選びます。「あとで決める」は領土なしで建国します。"));
    } else if (step === 1) {
      const g = el("div", "np-seg"); for (const [k, t] of [["m", "男性"], ["f", "女性"]]) g.append(btn(draft.gender === k ? "on" : "", t, "", () => { draft.gender = k; draft.leaderName = generatePersonName(newRnd(), k).full; render(); }));
      const seq = (map.ext?.data?.leaderSeq ?? 0) + 1;
      const preview = el("div", "np-face"); preview.innerHTML = faceSvg(faceSpec({ id: seq, gen: 1, gender: draft.gender, age: 40 }), 110);
      pane.append(preview, field("性別", g), field("名前", text("leaderName")), btn("", "🎲 名前をつくり直す", "", () => { draft.leaderName = generatePersonName(newRnd(), draft.gender).full; render(); }), el("p", "hint", "顔は指導者ごとに自動で決まります。性別と名前・称号は揃えて作られます。"));
    } else if (step === 2) {
      pane.append(regimeGrid(draft.regime, (k) => { draft.regime = k; draft.doctrineNodes = []; render(); }));
    } else if (step === 3) {
      pane.append(militaryPicker({ get: () => draft, onChange: (p) => { if (p.base) draft.doctrine = p.base; if (p.nodes) draft.doctrineNodes = p.nodes; } }).box);
    } else {
      pane.append(techPicker({ get: () => draft, onChange: (p) => Object.assign(draft.techDoctrine, p) }).box);
    }
    const nav = el("div", "np-nav");
    if (step > 0) nav.append(btn("", "◀ 戻る", "", () => { step--; render(); }));
    nav.append(step < STEPS.length - 1 ? btn("primary", "次へ ▶", "", () => { step++; render(); }) : btn("primary", "建国する", "", () => finishCreate()));
    box.append(bar, crumbs, pane, nav); return box;
  }
  function finishCreate() {
    try {
      const d = draft, r = setupActions.create("state", { name: d.name, ...(d.size === "later" ? {} : { territory: d.size, capital: true }) });
      if (!r) return;
      editActions.setRegime(r.id, d.regime);
      editActions.changeLeader(r.id, { reason: "founding", name: d.leaderName, gender: d.gender });
      editActions.setMilitaryDoctrine(r.id, { base: d.doctrine, nodes: d.doctrineNodes });
      editActions.setTechDoctrine(r.id, d.techDoctrine);
      simActions.autoArmy(r.id); // 軍隊は、国家ができるときに自動で生成される
      if (d.size === "later") window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:state", target: r.id } })); // 領土は、地図に塗って決める
      openState(r.id);
    } catch (e) { fail(e); }
  }
  function regimeGrid(cur, on) {
    const g = el("div", "np-regimes");
    for (const r of REGIMES) { const c = el("button", `np-regime${r.key === cur ? " on" : ""}`); c.type = "button"; c.append(el("strong", "", r.label), el("span", "hint", r.desc)); c.addEventListener("click", () => on(r.key)); g.append(c); }
    return g;
  }

  // ---------- 詳細 ----------
  function openState(id) { sel = id; view = "detail"; tab = "overview"; candidates = null; rebel.armed = false; editActions.ensureLeaders(); wins.open("nation"); render(); }
  function detailView(map) {
    const s = map.pack.states[sel];
    if (!isLive(s)) { view = "list"; return listView(map); }
    const box = el("div", "nation-detail");
    const bar = el("div", "nation-bar"); bar.append(btn("", "◀ 国家一覧", "", () => { view = "list"; render(); }), swatch(s.color, false), el("h3", "", sname(map, s.i))); box.append(bar);
    const top = el("div", "nation-top"); top.append(leaderBlock(map, s), infoBlock(map, s)); box.append(top);
    const tabs = el("div", "b-tabs nation-tabs"); for (const [k, t] of TABS) tabs.append(btn(tab === k ? "active" : "", t, "", () => { tab = k; render(); })); box.append(tabs);
    const pane = el("div", "nation-pane");
    ({ overview: overviewPane, condition: (p, m, st) => conditionPane(p, simActions.nationCondition(st.i)), military: militaryPane, tech: techPane, vassal: vassalPane, finance: financePane, covert: covertPane })[tab](pane, map, s);
    box.append(pane);
    // 詳細設定の欄にカーソルを当てている間だけ、その国の領土を地図で光らせる（虫眼鏡のボタンは廃止）
    const hl = () => getHighlight?.();
    const on = () => { hl()?.show("state", s.i); clearInterval(hoverTimer); hoverTimer = setInterval(() => hl()?.show("state", s.i), 2000); }; // 光り方は数秒で薄れるので、乗せている間は繰り返す
    const off = () => { clearInterval(hoverTimer); hoverTimer = 0; hl()?.clear(); };
    for (const f of box.querySelectorAll(".nation-leader, .nation-info, .nation-regime, .nation-sec, .nation-tabs")) { f.addEventListener("mouseenter", on); f.addEventListener("mouseleave", off); }
    box.addEventListener("mouseleave", off);
    return box;
  }
  function leaderBlock(map, s) {
    const box = el("div", "nation-leader"), now = map.worldTime ?? { year: 1, month: 1 };
    const l = leaderRecord(map, s.i).current;
    const face = el("div", "np-face"); face.innerHTML = l ? faceSvg(faceOf(l, now), 120) : "";
    box.append(face);
    const t = el("div", "nation-leader-t");
    if (!l) { t.append(el("p", "muted", "指導者がいません")); box.append(t); return box; }
    t.append(el("strong", "", `${l.title}　${l.name}`), el("div", "hint", `${leaderAge(l, now)}歳・${l.gender === "f" ? "女性" : "男性"}・第${l.gen}代・${l.since.year}年に就任`));
    if (familyOf(l) && heirOf(map, s.i) !== undefined && regimeOf(s).succession === "hereditary") t.append(el("div", "hint", `王朝: ${familyOf(l)}家`));
    if (l.regentFor) { const q = el("div", "hint nation-regent", `摂政: 幼い${l.regentFor.title}${l.regentFor.name}（${leaderAge(l.regentFor, now)}歳）に代わって政務をとる。${l.regentFor.birthYear + MAJORITY}年に親政へ`); q.dataset.field = "regent"; t.append(q); }
    const hr = regimeOf(s).succession === "hereditary" ? heirOf(map, s.i) : null;
    if (hr) { const q = el("div", "hint nation-heir", `次の指導者: ${titleFor(s, hr.gender)}　${hr.name}（${leaderAge(hr, now)}歳・${hr.gender === "f" ? "女" : "男"}）`); q.dataset.field = "heir"; t.append(q); }
    t.append(btn("", candidates ? "候補を閉じる" : "世代交代…", "指導者を、候補の中から選んで交代させる", () => { candidates = candidates ? null : leaderCandidates(map, s.i, { n: 3, seed: Math.floor(Math.random() * 1e9) }); render(); }));
    box.append(t);
    if (candidates) {
      // 交代の理由を選ぶ（建国は除く）。理由は年表と指導者の履歴に残る
      const why = el("div", "nation-succ-why");
      const rs = document.createElement("select"); rs.dataset.field = "succ-reason";
      for (const r of REASONS.filter((x) => x.key !== "founding")) rs.append(new Option(r.label, r.key));
      rs.value = succReason; rs.addEventListener("change", () => { succReason = rs.value; });
      const ss = document.createElement("select"); ss.dataset.field = "succ-stability";
      for (const x of STABILITY) ss.append(new Option(`継承: ${x.label}`, x.key));
      ss.value = succStab; ss.addEventListener("change", () => { succStab = ss.value; });
      why.append(el("span", "field-label", "交代の理由"), rs, ss);
      box.append(why);
      const c = el("div", "nation-cands");
      for (const x of candidates) c.append(btn("b-card", `${x.heir ? "【後継者】" : ""}${x.title}　${x.name}（${x.age}歳・${x.gender === "f" ? "女" : "男"}）`, x.heir ? "後継者がそのまま即位する" : "この人物に交代する", () => { editActions.changeLeader(s.i, { reason: succReason, stability: succStab, name: x.name, gender: x.gender, title: x.title, age: x.age }); candidates = null; render(); }));
      box.append(c);
    }
    return box;
  }
  function infoBlock(map, s) {
    const box = el("div", "nation-info"), l = leaderRecord(map, s.i).current, f = editActions.getFinance(s.i) ?? { treasury: 0 };
    const stat = (k, v) => { const d = el("div", "b-stat"); d.append(el("div", "b-stat-v", v), el("div", "b-mini", k)); return d; };
    const stab = nationStability(map, s), stats = el("div", "nation-stats");
    stats.append(stat("人口", fmt(statePopulation(s))), stat("支持", `${Math.round(supportOf(s))}%`), stat("安定度", stab.label), stat("国庫", fmt(f.treasury)));
    const r = regimeOf(s), reg = el("div", "nation-regime");
    const sl = document.createElement("select"); for (const x of REGIMES) sl.append(new Option(x.label, x.key, false, x.key === r.key));
    sl.addEventListener("change", () => { editActions.setRegime(s.i, sl.value); render(); });
    reg.append(el("span", "np-k", "政体"), sl, el("p", "hint", r.desc));
    const bars = el("div", "nation-support");
    for (const b of supportBars(s)) { const row = el("div", "np-bar"); const fill = el("span", "np-bar-f"); fill.style.width = `${b.value}%`; row.append(el("span", "np-bar-k", b.label), (() => { const w = el("span", "np-bar-w"); w.append(fill); return w; })(), el("span", "np-bar-v", `${b.value}%`)); bars.append(row); }
    reg.append(bars);
    const why = el("p", "hint nation-stab-why", `安定度の内訳（${stab.score}点）: ${stab.factors.map((f) => `${f.label} ${f.delta}`).join(" ／ ")}`); why.dataset.field = "stability-why";
    box.append(stats, why, reg); return box;
  }

  function overviewPane(pane, map, s) {
    const others = map.pack.states.filter((x) => isLive(x) && x.i !== s.i);
    const war = el("section", "nation-sec"); war.append(el("h4", "", "宣戦布告"));
    if (!others.length) war.append(el("p", "muted", "相手になる国がありません"));
    else {
      if (!others.some((x) => x.i === warTarget)) warTarget = others[0].i;
      const t = document.createElement("select"); for (const x of others) t.append(new Option(sname(map, x.i), x.i, false, x.i === warTarget));
      t.addEventListener("change", () => { warTarget = Number(t.value); });
      war.append(t, btn("primary", "宣戦布告", "戦争タブの「新しい戦争」準備画面を開く", () => { getWarsPanel()?.prepare(s.i, warTarget); wins.open("war"); }));
    }
    const reb = el("section", "nation-sec"); reb.append(el("h4", "", "反乱"));
    const seg = (items, cur, on) => { const g = el("div", "np-seg"); for (const x of items) g.append(btn(cur === x.key ? "on" : "", x.label, x.desc ?? "", () => { on(x.key); rebel.armed = false; render(); })); return g; };
    const row = (k, n) => { const r = el("div", "np-row"); r.append(el("span", "np-k", k), n); return r; };
    const rt = REBEL_TYPE_BY_KEY[rebel.type];
    reb.append(row("種類", seg(REBEL_TYPES, rebel.type, (k) => { rebel.type = k; })), el("p", "hint nation-reb-type", `${rt.desc}（歴史上の例: ${rt.examples}）`), row("規模", seg(REBEL_SCALES, rebel.scale, (k) => { rebel.scale = k; })));
    const spark = simActions.rebellionSpark(s.i);
    if (spark) { const sp = el("p", "hint nation-spark", `反乱の火種: ${spark.level}（民意 ${Math.round(spark.support)}）${spark.causes.length ? `。最近の出来事: ${spark.causes.join(" / ")}` : ""}。州が勝手に反乱を起こすことはありません。起こすなら、下のボタンで。`); sp.dataset.field = "rebellion-spark"; reb.append(sp); }
    const rebWhy = !canRebel(map, s.i) ? "反乱の拠点になる都市（首都のほか）のある領土がありません" : "";
    const rebRow = el("div", "np-row nation-reb-row");
    const rebBtn = btn(rebel.armed ? "danger" : "", rebel.armed ? "本当に反乱を起こす" : "反乱を起こす", "種類と規模に応じた領域が離反し、軍が割れて内戦になる（州の単位には縛られない）", () => {
      if (!rebel.armed) { rebel.armed = true; return render(); }
      rebel.armed = false;
      try { simActions.startRebellion(s.i, { type: rebel.type, scale: rebel.scale }); wins.open("war"); } catch (e) { fail(e); }
      render();
    });
    rebRow.append(rebBtn);
    if (rebWhy) { rebBtn.disabled = true; const why = el("span", "hint nation-reb-why", rebWhy); why.dataset.field = "rebel-why"; rebRow.append(why); }
    reb.append(rebRow);
    const land = el("section", "nation-sec"); land.append(el("h4", "", "領土と都市"), el("p", "hint", "地図に塗って領土を広げる・都市を置く（地図編集は、気候帯・標高・マーカーだけになりました）。"));
    const go = (tool, target) => () => window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool, target } }));
    const row2 = el("div", "np-seg"); row2.append(btn("", "領土を塗る", "地図をドラッグして、この国の領土を塗る", go("paint:state", s.i)), btn("", "都市を置く", "地図をクリックして、都市を置く", go("add:burg", s.i)));
    land.append(row2);
    // 基本設定（旧・国家詳細にあった、国名の変更・国の種類・特色・文章。v2.4.1 で国家タブへ移した。政体は上の専用リストが担当）
    const basic = document.createElement("details"); basic.className = "nation-sec nation-basic"; basic.dataset.field = "basic";
    basic.append(el("summary", "", "基本設定（国名・国の種類・特色・文章）"));
    const nameLab = el("label", "b-field"), nameBox = el("span", "name-row"), nameIn = document.createElement("input");
    nameIn.value = s.fullName ?? s.name; nameIn.dataset.field = "state-name";
    nameIn.addEventListener("change", () => { editActions.renameEntity("state", s.i, nameIn.value); render(); });
    const dice = btn("", "🎲", "仮の名前を生成（押すたびに変わります。Undo で戻せます）", () => { const v = editActions.suggestName("state", { id: s.i }); if (v) { nameIn.value = v; editActions.renameEntity("state", s.i, v); render(); } });
    nameBox.append(nameIn, dice); nameLab.append(el("span", "b-mini", "国家名"), nameBox);
    const prof = el("div", "b-details"); appendEntityProfile(prof, "state", s, { stateFields: ["type"], editActions, map, openEntity: (k, id) => window.alterhistory?.panels?.openEntity?.(k, id) });
    const tags = el("div", "tl-rec-provs");
    for (const o of STATE_TAGS) { const lab = el("label"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = (s.tags ?? []).includes(o.key); cb.addEventListener("change", () => { const cur = new Set(s.tags ?? []); if (cb.checked) cur.add(o.key); else cur.delete(o.key); editActions.setWorldInfo("state", s.i, { tags: [...cur] }); }); lab.append(cb, document.createTextNode(" " + o.label)); tags.append(lab); }
    const { text: noteText, rich } = htmlToEditable(editActions.getNote("state", s.i));
    const note = document.createElement("textarea"); note.className = "note-field"; note.rows = 4; note.value = noteText; note.dataset.field = "state-note";
    note.addEventListener("change", () => editActions.setNote("state", s.i, editableToHtml(note.value, rich)));
    basic.append(nameLab, prof, el("h4", "", "特色"), tags, el("h4", "", "文章"), ...(rich ? [el("p", "hint", "書式（HTML）を含む文章です。プレーンテキストとして編集すると書式は失われます。")] : []), note);
    pane.append(war, reb, land, basic);
    const l = leaderRecord(map, s.i);
    if (l.history.length) { const h = el("section", "nation-sec"); h.append(el("h4", "", "歴代の指導者")); for (const x of l.history.slice().reverse().slice(0, 8)) h.append(el("div", "hint", `${x.since.year}–${x.until?.year ?? ""}　${x.title}${x.name}`)); pane.append(h); }
  }
  function militaryPane(pane, map, s) {
    const regs = Array.isArray(s.military) ? s.military : [], by = new Map();
    for (const r of regs) for (const [k, n] of Object.entries(r.u ?? {})) if (n > 0) by.set(k, (by.get(k) ?? 0) + n);
    const army = el("section", "nation-sec"); army.append(el("h4", "", `軍の編成（表示のみ。技術ドクトリンに応じて更新されます）　部隊 ${regs.length}・兵員 ${fmt(regs.reduce((a, r) => a + forceHeadcount(r.u), 0))}`));
    if (!by.size) army.append(el("p", "muted", "部隊はまだありません"));
    for (const [u, n] of by) army.append(el("div", "nation-army-row", `${UNIT_BY_KEY[u]?.label ?? u}　${fmt(n)}${UNIT_BY_KEY[u]?.unit ?? ""}`));
    const doc = el("section", "nation-sec"); doc.append(el("h4", "", `軍事ドクトリン（現在: ${DOCTRINE_BY_KEY[effectiveDoctrineKey(s)]?.label ?? "均衡"}）`));
    doc.append(militaryPicker({ get: () => mapOf().pack.states[s.i], onChange: (p) => { editActions.setMilitaryDoctrine(s.i, p); } }).box);
    // 核の保有数（旧「軍事」窓にあった設定をここへ移した。使うのは戦争ウィンドウの核作戦。通常の戦争では使われない）
    const nuke = el("section", "nation-sec"); nuke.append(el("h4", "", "核の保有数"));
    const nrow = el("div", "np-row"), ninp = document.createElement("input");
    ninp.type = "number"; ninp.min = "0"; ninp.step = "1"; ninp.value = String(nuclearStock(s)); ninp.dataset.field = "nuclear-stock";
    ninp.addEventListener("change", () => { simActions.setNuclearStock(s.i, Math.max(0, Math.round(Number(ninp.value) || 0))); render(); });
    nrow.append(el("span", "np-k", "保有数"), ninp, el("span", "", UNIT_BY_KEY.nuclear?.unit ?? "発"));
    const nb = el("button", "", "@nuclear 核作戦を立案・実行する"); nb.type = "button"; nb.addEventListener("click", () => wins.open("nuclear"));
    nuke.append(nrow, el("p", "hint", "核を保有する国だけが実行できます。通常の戦争では使われません。部隊の編成そのものは、ここでは表示のみです。"), nb);
    pane.append(army, nuke, doc);
  }
  function techPane(pane, map, s) {
    const sec = el("section", "nation-sec"); sec.append(el("h4", "", `技術ドクトリン（技術水準 Lv${editActions.getTechLevel(s.i)}）`), el("p", "hint", "どの段でも、条件なしで選べます。自動では進みません。"));
    const pend = simActions.techMomentum(s.i);
    sec.append(techPicker({ get: () => mapOf().pack.states[s.i], onChange: (p) => { editActions.setTechDoctrine(s.i, p); }, marks: () => simActions.techMomentum(s.i) }).box);
    if (pend.length) {
      const m = el("div", "np-row"); m.append(el("span", "np-k", "機運のある分野"));
      for (const p of pend) m.append(btn("", `${p.label}「${p.step}」を採用`, "", () => { simActions.adoptTechMomentum(s.i, p.field); render(); }));
      sec.append(m, el("p", "hint", "◆は、時代の流れで機運が出ている分野です。採用すると +1 段になります（押さなければ変わりません）。"));
    }
    pane.append(sec, progressBlock(simActions.nationCondition(s.i)));
  }
  function vassalPane(pane, map, s) {
    const kindSelect = (cur, on) => { const sel = document.createElement("select"); sel.dataset.field = "vassal-kind"; for (const x of VASSAL_KINDS) sel.append(new Option(x.label, x.key, false, x.key === cur)); sel.title = VASSAL_KINDS.find((x) => x.key === cur)?.desc ?? ""; sel.addEventListener("change", () => on(sel.value)); return sel; };
    const kindRow = (label, cur, on) => { const r = el("div", "np-row"); r.append(el("span", "np-k", label), kindSelect(cur, on), el("span", "hint", VASSAL_KINDS.find((x) => x.key === cur)?.desc ?? "")); return r; };
    const vs = el("section", "nation-sec"); vs.append(el("h4", "", "傀儡・従属国"));
    const info = vassalInfo(map, s.i);
    if (info) vs.append(el("p", "hint", `この国は ${sname(map, info.overlord)} に従属しています。`), kindRow("種類", info.kind, (k) => { simActions.setVassal(s.i, info.overlord, k); render(); }), btn("", "独立させる", "", () => { simActions.releaseVassal(s.i); render(); }));
    const mine = vassalsOf(map, s.i);
    if (!mine.length) vs.append(el("p", "muted", "従える国はありません"));
    for (const v of mine) { const r = el("div", "nation-army-row"); r.append(el("span", "", sname(map, v.stateId)), kindSelect(v.kind, (k) => { simActions.setVassal(v.stateId, s.i, k); render(); }), btn("", "解放", "", () => { simActions.releaseVassal(v.stateId); render(); })); vs.append(r); }
    const others = map.pack.states.filter((x) => isLive(x) && x.i !== s.i && !vassalInfo(map, x.i));
    if (others.length) {
      const add = el("div", "np-row"), t = document.createElement("select"), k = document.createElement("select");
      for (const x of others) t.append(new Option(sname(map, x.i), x.i)); for (const x of VASSAL_KINDS) k.append(new Option(x.label, x.key));
      add.append(el("span", "np-k", "従える"), t, k, btn("", "従属させる", "", () => { simActions.setVassal(Number(t.value), s.i, k.value); render(); })); vs.append(add);
    }
    const ps = el("section", "nation-sec"); ps.append(el("h4", "", "属州"));
    const provs = map.pack.provinces.filter((p) => isLive(p) && p.state === s.i);
    for (const p of provs) { const r = el("div", "nation-army-row b-click", p.fullName ?? p.name); r.addEventListener("click", () => window.alterhistory?.editorPanel?.openEntity?.("province", p.i)); ps.append(r); }
    if (!provs.length) ps.append(el("p", "muted", "属州はありません"));
    ps.append(btn("", "＋ 属州を足す", "", async () => { await openSetup?.("province", { stateId: s.i }); render(); }));
    pane.append(vs, ps);
  }
  function financePane(pane, map, s) {
    const sec = el("section", "nation-sec"); sec.append(el("h4", "", "財政・税")); sec.append(economyView.stateFinance(s.i));
    sec.append(btn("", "世界全体の交易を見る", "", () => wins.open("economy"))); pane.append(sec);
  }
  function covertPane(pane) { covert.render(); pane.append(covert.body); }

  function render() {
    clearInterval(hoverTimer); hoverTimer = 0;
    const map = mapOf(); body.replaceChildren();
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    body.append(view === "create" ? createView(map) : view === "detail" ? detailView(map) : listView(map));
  }
  const safe = guardRender(body, render);
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("nation") && view !== "create") safe(); });
  return { open() { view = "list"; wins.open("nation"); }, openState, render };
}
