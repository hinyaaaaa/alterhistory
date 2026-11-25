// AlterHistory v6 UI。モック（alterhistory-v6-ui-mock.html）の意匠と構成（左ハブ・開閉パネル・地図・コールアウト・右のニュースと時間）に、実データと実コマンドを接続したもの。
//   ・左: ハブ（地理・国家・戦争・外交・文化・言語・宗教・統計・創造主・世界設定）／中央: 地図（上部中央に時計）。ニュースはコールアウトとトーストで出す（v6.3.0 で右のニュース欄・年表・検索・凡例を廃止）。
//   ・UI は WorldState を直接変えない。成功した Command の結果を、読み取りモデルへ反映するだけ。
//   ・パネルの開閉・切替で、地図の位置・拡大・選択・検索条件をリセットしない。
import "./domsafe.js";
import { createNewWorld, formatWorldDate } from "../../core/wcde/world.js";
import { SPEEDS, timeOf, newsOf, newsFeed, isRunning } from "../../core/wcde/clock.js";
import { h, btn, polityJa, n0, pct, colorOf, face, sv } from "./common.js";
import { buildFrame, openFull, closeFull, closeDialog } from "../v7/frame.js";
import { renderTop, renderRail, renderLayers, wireTools, showCard, modeOf, entryOf, toCreator, toPlayer } from "../v7/chrome.js";
import { PANEL } from "../v7/panels.js";
import { screenSpec, openGear } from "../v7/screens.js";
import { sample } from "../v7/series.js";
import { TECH } from "../../core/civ/tech.js";
import { ecoSummary } from "../../core/wcde/domains/ecosystem.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { MapView } from "./map.js";
import { openWizard } from "./wizard.js";
import { showTitle, showWorldConfig, runLoading, runSplash } from "./title.js";
import { eraLabel, eraOf } from "../../core/wcde/calendar.js";
import { initNotify, notify } from "./notify.js";
import { link, uprisingFull } from "./views-a.js";
import { renderDecision } from "./decision.js";
import { corpsMarkers } from "./military.js";
import { linkHistory, scheduleFlush } from "./history-link.js";
import { perf } from "../../core/perf/perf-monitor.js";
import { fileLoader } from "./views-b.js";
export { h };
const $ = (s) => document.querySelector(s),
  root = () => $("#v6-root");
/* ---------- 起動: スタート画面 → 世界の設定 → 生成（ロード画面）→ 建国 ---------- */
function setup() {
  const loader = fileLoader((w, warn) => {
    S.w = w;
    S.fileWarn = warn;
    start();
  });
  showTitle(root(), {
    loader,
    onNew: () =>
      showWorldConfig(root(), {
        onBack: setup,
        onStart: (cfg) =>
          runLoading(
            root(),
            cfg,
            (w) => {
              S.w = w;
              founding();
            },
            (err) => {
              setup();
              notify("error", err);
            },
          ),
      }),
  });
}
function founding() {
  const c = run({ type: "founding.refresh" }).candidates ?? S.w.civ.wcde.candidates ?? [],
    civ = S.w.civ,
    pre = civ.wcde.prehistory ?? {},
    ce = S.w.world.cell,
    ja = new Proxy({}, { get: (_, k) => polityJa(k) });
  const nowTxt = formatWorldDate(S.w),
    era = eraLabel(civ.wcde.config.calendar, civ.monthIndex),
    msg = h("div", {}, h("p", { class: "n" }, `${civ.wcde.config.name}　${nowTxt}`)),
    list = h("div", {});
  void list;
  void c;
  const yrsAgo = (m) => Math.round(((civ.wcde.foundedAt ?? civ.monthIndex) - m) / 12);
  const fmtYears = (y) => (y >= 10000 ? `約 ${Math.round(y / 1000) / 10} 万年前` : `約 ${n0(y)} 年前`);
  // 先史の観察: 系統の移行・技術の出現・人口の推移（読み取り専用）
  const techTl = Object.entries(pre.firstTech ?? {})
    .sort((x, y) => x[1] - y[1])
    .map(([k, m]) => `${fmtYears(yrsAgo(m))}　${TECH[k]?.name ?? k}`);
  const ep = pre.epochs ?? [],
    mx = Math.max(1, ...ep.map((e) => Math.log10(Math.max(10, e.pop)))),
    spark = sv(
      "svg",
      { viewBox: "0 0 300 60", style: "width:100%;height:60px" },
      sv("polyline", {
        points: ep
          .map(
            (e, i) => `${(i / Math.max(1, ep.length - 1)) * 300},${58 - (Math.log10(Math.max(10, e.pop)) / mx) * 54}`,
          )
          .join(" "),
        fill: "none",
        stroke: "#6fa8c9",
        "stroke-width": 1.6,
      }),
      sv("polyline", {
        points: ep.map((e, i) => `${(i / Math.max(1, ep.length - 1)) * 300},${58 - (e.ice ?? 0) * 54}`).join(" "),
        fill: "none",
        stroke: "#c97a6f",
        "stroke-width": 1,
        "stroke-dasharray": "3 3",
      }),
    );
  const eco = ecoSummary(S.w.world, civ),
    sp = pre.species ?? {};
  const obs = h(
    "details",
    { class: "dt" },
    h("summary", {}, "先史の観察"),
    sp.archaic ? `古代型人類の集団が現れる: ${fmtYears(yrsAgo(sp.archaic.at))}` : "",
    h("br"),
    sp.human
      ? `現生人類が現れる: ${fmtYears(yrsAgo(sp.human.at))}（置き換わり・混血: ${n0(pre.assimilated ?? 0)} 集団）`
      : "",
    h("br"),
    `集団 ${n0(pre.groups ?? Object.keys(civ.groups).length)}・人口 ${n0(Math.round(Object.values(civ.groups).reduce((a, g) => a + g.pop, 0)))}・定住 ${n0(pre.settlements ?? 0)}・氷期の最大 ${Math.round((pre.glacialMax ?? 0) * 100)}%・海を渡った ${n0(pre.seaCrossings ?? 0)} 回`,
    h("br"),
    eco
      ? `生態系: 植物 ${Math.round(eco.flora * 100)}%・動物 ${Math.round(eco.fauna * 100)}%・荒廃した土地 ${Math.round(eco.degraded * 100)}%`
      : "",
    h("br"),
    "人口（青・対数）と氷期（赤の破線）の推移",
    spark,
    h("b", {}, "技術の出現"),
    h("br"),
    ...techTl.flatMap((t) => [t, h("br")]),
  );
  const found = btn(
    "建国して、その国を担当する",
    () => openWizard({ mode: "player", onDone: () => start(), onCancel: () => {} }),
    "p",
    { id: "found" },
  );
  root().replaceChildren(
    h(
      "div",
      { class: "center", style: "max-width:760px" },
      h("div", { class: "code" }, "FOUNDING"),
      h("h1", {}, "建国"),
      msg,
      h(
        "div",
        { class: "rowb" },
        found,
        btn(
          "世界に任せて始める（担当国なし・創造主）",
          () => {
            run({ type: "founding.delegate" });
            start();
          },
          "",
          { id: "delegate" },
        ),
      ),
      obs,
    ),
  ); // v6.4.0: 国名→政体→役職→為政者→首都→技術・ドクトリンの流れ（ウィザード）
}

/* ---------- 画面の骨格（モックと同じ構成） ---------- */
function start() {
  S.newsSeen = null;
  S.dirty = null;
  linkHistory(S.w);
  S.hub = null;
  S.screen = null;
  S.sel = controlled() ?? null;
  S.hooks = {
    founding,
    render,
    panel: renderPanel,
    mapOnly: () => {
      S.map.draw();
    },
    select,
    focusCell,
    clock: () => renderTop(),
    gear: (k) => openGear(k),
    loaded: (w, warn) => {
      S.w = w;
      S.fileWarn = warn;
      start();
    },
  };
  shell();
  render();
  clearInterval(S.timer);
  S.timer = setInterval(tick, 250);
}
/** 画面の中から開く全面画面（編集・軍団の詳細・反乱）。閉じると下の画面へ戻る */
const CHILD_FULL = ["nedit", "corps", "corpsnew", "upr"];
function shell() {
  const cv = h("canvas", { id: "map", "aria-label": "世界地図" });
  buildFrame(root(), cv);
  $("#prefresh").onclick = () => renderPanel();
  $("#full-close").onclick = () => closeAny();
  $("#dg-close").onclick = () => closeDialog();
  wireTools();
  S.map = new MapView(cv, S.w);
  S.map.sel = S.sel;
  S.map.onPick = callout;
  requestAnimationFrame(() => {
    S.map.draw();
  });
  window.addEventListener("resize", () => S.map?.draw());
}
/** 全面画面を閉じる（開いている画面の onClose を呼び、地図の強調を戻す） */
function closeAny() {
  const f = S.full;
  f?.onClose?.();
  S.full = null;
  if (!CHILD_FULL.includes(f?.key)) S.screen = null; /* 編集・軍団の詳細は、下の画面（国の詳細など）へ戻る */
  render();
}
function render() {
  if (!$("#v7")) return;
  renderTop();
  renderRail();
  renderPanel();
  renderNews();
  renderDecision();
  if (S.cardId && S.w.civ.states[S.cardId]) showCard(S.cardId);
  S.map.sel = S.sel;
  S.map.corps = corpsMarkers();
  S.map.draw();
  if (!S.newsSeen) announce();
}
function renderPanel() {
  S.full = null;
  S.paintedMonth = S.w?.civ.monthIndex ?? null;
  $("#prefresh")?.classList.remove("on");
  S.hub = entryOf();
  const keep = $("#lp").scrollTop;
  sample(S.w.civ, S.w.civ.states[controlled()]);
  $("#lpin").replaceChildren(PANEL[modeOf()][S.hub]());
  $("#lp").scrollTop = keep;
  if (S.upr?.open && S.upr.stateId && S.w.civ.states[S.upr.stateId])
    S.full = {
      key: "upr",
      title: "反乱・革命を起こす",
      build: () => uprisingFull(S.w.civ.states[S.upr.stateId]),
      onClose: () => {
        S.upr = null;
      },
    };
  /* 開いている画面（宣戦・講和・技術ツリーなど）は、戦争の詳細などの上に重ねる。画面の中から開く編集・軍団の詳細は、その画面の上に出す */
  if (S.screen && !CHILD_FULL.includes(S.full?.key)) S.full = screenSpec() ?? S.full;
  renderFull();
}
/** 全面画面（地図の上に重なる）。建国フロー・戦争の詳細・反乱の作成・技術ツリーなど。値を変えるだけの操作は左パネルの滑り棒 */
function renderFull(depth = 0) {
  const f = S.full;
  if (!f || S.upr?.picking) {
    closeFull();
    return;
  }
  openFull({ key: f.key, title: f.title, build: f.build, side: f.side, bare: f.bare, footer: f.footer?.() ?? [] });
  /* 画面の中身を作る途中で、旧部品が別の全面画面（編集・軍団の詳細）を S.full に指定することがある。その場合は、そちらを重ねて出し直す */
  if (S.full !== f && S.full && depth < 3) renderFull(depth + 1);
}
function select(id) {
  S.sel = id;
  S.map.sel = id;
  S.map.draw();
  showCard(id);
  $("#callout").classList.remove("on");
}
function focusCell(cell) {
  const M = S.map,
    g = M.geo,
    W = M.cv.width,
    H = M.cv.height,
    [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W, H);
  M.view.k = 4;
  M.view.x = W / 2 - x * 4;
  M.view.y = H / 2 - y * 4;
  M.clamp();
  M.draw();
}
/** 地図上の選択: コールアウトが基本の情報提示。詳細パネルや他領域への入口も置く */
function callout(p) {
  if (S.upr?.picking) {
    // v6.4.0: 反乱の中心地を地図から選ぶ
    const r = run({
        type: "uprising.plan",
        authority: "player_order",
        stateId: S.upr.stateId,
        kind: S.upr.kind,
        cell: p.cell,
      }),
      res = r.result ?? r;
    if (!r.ok || res.ok === false) {
      notify("error", res.error ?? r.error ?? "その場所は選べません");
      return;
    }
    S.upr.plan = res;
    S.upr.picking = false;
    S.upr.open = true;
    S.map.pins = [{ cell: res.center.cell, big: true, color: "#ff8a5c" }];
    S.map.draw();
    renderPanel();
    return;
  }
  const c = $("#callout"),
    civ = S.w.civ,
    st = p.stateId ? civ.states[p.stateId] : null,
    ce = S.w.world.cell,
    mine = st && controlled() === st.id;
  if (st && !p.settlement) {
    select(st.id);
    return;
  }
  const body = st
    ? [
        h(
          "h3",
          {},
          h("span", { class: "sw", style: `background:${colorOf(st.id)};display:inline-block;margin-right:6px` }),
          st.name,
        ),
        h("div", { class: "sub" }, `${polityJa(st.polity)}・人口 ${n0(st.pop)}・安定度 ${pct(st.stability)}`),
        h("div", { class: "sub" }, `為政者: ${st.leader?.name ?? "—"}`),
        p.settlement
          ? h("div", { class: "sub" }, `都市: ${p.settlement.name ?? "—"}（人口 ${n0(p.settlement.pop)}）`)
          : null,
        p.settlement && (mine || !controlled()) ? renameRow(p.settlement) : null,
        h(
          "div",
          { class: "bt" },
          btn("国のカード", () => select(st.id)),
          mine
            ? null
            : btn(
                "担当する",
                () => {
                  run({ type: "control.take", stateId: st.id });
                  S.sel = st.id;
                  render();
                },
                "p",
              ),
        ),
      ]
    : [
        h("h3", {}, p.settlement?.name ?? "未所属の地"),
        h(
          "div",
          { class: "sub" },
          `区画 ${p.cell}・標高 ${Math.round(ce.elevation[p.cell] * 100) / 100}・気温 ${Math.round(ce.temp[p.cell])}`,
        ),
        p.settlement
          ? h("div", { class: "sub" }, `人口 ${n0(p.settlement.pop)}`)
          : h("div", { class: "sub" }, "国家に属していません"),
      ];
  c.replaceChildren(...body);
  const W = $("#stage").clientWidth;
  c.style.left = Math.min(Math.max(8, p.x + 10), W - 280) + "px";
  c.style.top = Math.max(8, p.y + 10) + "px";
  c.classList.add("on");
  if (st) {
    S.sel = st.id;
    S.map.sel = st.id;
    S.map.draw();
  }
}

/** 吹き出しでの集落の改名（自国の集落。創造主はどの集落でも）。履歴は nameHistory に残る（settlement.rename） */
function renameRow(set) {
  const inp = h("input", { type: "text", value: set.name ?? "", id: "rename-in", style: "width:100%;margin-top:8px", "aria-label": "都市の名前" });
  const go = () => {
    const name = inp.value.trim();
    if (!name || name === set.name) return;
    const cmd = { type: "settlement.rename", settlementId: set.id, name };
    const r = controlled() ? act({ ...cmd, stateId: controlled() }) : creator(cmd);
    if (r.ok) {
      notify("ok", `${set.name} を ${name} に改めました`);
      $("#callout").classList.remove("on");
    }
  };
  inp.addEventListener("keydown", (e) => e.key === "Enter" && go());
  return h("div", {}, inp, h("div", { class: "bt" }, btn("名前を改める", go, "p", { id: "rename-go" })));
}
/* ---------- 時間・ニュース（時計は上部バー） ---------- */
function renderRight() {
  renderTop();
  if (S.dirtyNews !== false) announce(); // v6.20.0: ニュースは、新しい出来事があったときだけ見る（毎回の再検索をしない）
}
/** v6.3.0: 右のニュース欄は廃止。重大でない大きな出来事は、地図のコールアウトとトースト通知で知らせる（重大ニュースは中央の確認画面） */
function announce() {
  const c = S.w.civ,
    key = (n) => n.eventId ?? n.id,
    feed = newsFeed(c, { limit: 16, minLevel: "major" });
  if (!S.newsSeen) {
    S.newsSeen = new Set(feed.map(key));
    return;
  }
  const fresh = feed.filter((n) => n.level !== "critical" && !S.newsSeen.has(key(n))).reverse();
  feed.forEach((n) => S.newsSeen.add(key(n)));
  if (S.newsSeen.size > 400)
    S.newsSeen = new Set(feed.map(key)); /* 重複防止に要る範囲だけ持つ（過去のIDをすべて持たない） */
  if (!fresh.length) return;
  const shown = fresh.slice(-3);
  const last = shown[shown.length - 1],
    sid = (last.entityIds ?? []).find((i) => c.states[i]),
    g = sid ? c.groups[c.states[sid].capitalGroupId] : null,
    el = $("#newscall"),
    M = S.map;
  if (!g || !el || !M) return;
  const [x, y] = M.proj(M.geo.cen[g.cell * 2], M.geo.cen[g.cell * 2 + 1], M.cv.width, M.cv.height),
    r = M.cv.clientWidth / (M.cv.width || 1),
    px = (x * M.view.k + M.view.x) * r,
    py = (y * M.view.k + M.view.y) * r;
  el.replaceChildren(h("b", {}, c.states[sid].name), h("div", {}, last.title));
  el.style.left = Math.min(Math.max(8, px + 12), M.cv.clientWidth - 260) + "px";
  el.style.top = Math.min(Math.max(48, py + 12), M.cv.clientHeight - 80) + "px";
  el.classList.add("on");
  clearTimeout(S.newsT);
  S.newsT = setTimeout(() => el.classList.remove("on"), 6000);
}
function renderNews() {
  const m = $("#newsmodal"),
    q = newsOf(S.w.civ).queue;
  if (!q.length) {
    m.hidden = true;
    m.replaceChildren();
    return;
  }
  const n = q[0];
  m.hidden = false;
  m.replaceChildren(
    h(
      "div",
      { class: "modalbox" },
      h("div", { class: "code", style: "justify-content:center" }, `重大ニュース（残り ${q.length} 件）`),
      h("div", { class: "n" }, `${n.date.year}年${n.date.month}月`),
      h("h2", {}, n.title),
      h("div", {}, ...n.entityIds.filter((i) => S.w.civ.states[i]).map((i) => [link(i), " "])),
      h(
        "div",
        { class: "rowb", style: "justify-content:center;margin-top:16px" },
        btn(
          "OK",
          () => {
            run({ type: "news.ack", id: n.id });
            renderRight();
            renderNews();
            S.map.draw();
          },
          "p",
          { id: "ack" },
        ),
      ),
    ),
  );
}
/** 全画面・確認画面・建国の画面が開いている間は進行を止め、閉じたら自動で再開する（速度の設定は変えない） */
const overlayOpen = () => {
  const on = (id) => {
    const e = document.getElementById(id);
    return !!e && !e.hidden;
  };
  return !!document.querySelector("#fs.on, #dg.on, .wiz, .fullmodal") || on("decmodal") || on("newsmodal");
};
function tick() {
  const w = S.w;
  if (!w || w.viewPast != null || !isRunning(w.civ) || overlayOpen()) return;
  const T = timeOf(w.civ),
    mps = SPEEDS.find((s) => s.id === T.speed)?.mps ?? 0,
    r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) });
  if (!r.ok && r.code !== "news_hold" && r.code !== "decision_hold") run({ type: "clock.setSpeed", speed: 0 });
  if (r.ok) afterRun();
  live();
}
/** 進行のあと: 履歴の外部保存を進め、12 か月ごとに診断のサンプルを残す */
function afterRun() {
  const c = S.w.civ;
  scheduleFlush();
  if (c.monthIndex - (S.perfAt ?? -1e9) >= 12) {
    S.perfAt = c.monthIndex;
    import("../../core/civ/history-store.js").then((m) => {
      const hs = m.historyStatus(c);
      perf.sample({
        year: c.date.year,
        monthIndex: c.monthIndex,
        events: c.events.length,
        resident: hs.resident,
        external: hs.records,
        cached: hs.cached,
      });
    });
  }
}
/** 再生中の更新: 時計・ニュース・地図だけを毎回更新する。左のパネルは勝手に描き直さない（読んでいる最中・入力中・スクロール中の内容が変わらないように）。
 *  世界が進んでパネルの内容が古くなったときは、パネルの右上に「最新の状態に更新」を出し、押したときだけ描き直す */
/** 変更のあった部分だけ更新する（Dirty Rendering）。時間だけが進んだときは時計だけ。新しい出来事があればニュース。戦争中・年の区切りは地図も */
const dirtySig = (c) =>
  `${c.events.length}|${c.archive?.evBase ?? 0}|${c.activeWarIds.length}|${newsOf(c).queue.length}`;
function live() {
  if (!$("#v7")) return;
  const c = S.w.civ,
    sig = dirtySig(c),
    fresh = sig !== S.dirty;
  S.dirty = sig;
  S.dirtyNews = fresh;
  renderRight();
  if (fresh) renderNews();
  renderDecision();
  if (fresh || c.activeWarIds.length > 0 || c.monthIndex % 12 === 0 || S.mapForce) {
    S.mapForce = false;
    S.map.corps = corpsMarkers();
    S.map.draw();
  }
  if (S.w.civ.monthIndex !== S.paintedMonth) $("#prefresh")?.classList.add("on");
}
/** ショートカット（入力欄・選択欄にいるときは効かせない）。一覧は歯車メニューの「ショートカット」 */
function keys(e) {
  if (!$("#v7") || !S.w || e.ctrlKey && e.key.toLowerCase() !== "k" || e.altKey || e.metaKey) return;
  const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  if (e.key === "Escape") {
    if (!$("#dg").classList.contains("on") && $("#fs").classList.contains("on")) return closeAny();
    if ($("#dg").classList.contains("on")) return closeDialog();
    $("#gearmenu").classList.remove("on");
    for (const id of ["#lay", "#srch", "#cc"]) $(id).classList.remove("on");
    S.cardId = null;
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#bs").click();
    return;
  }
  if (typing || overlayOpen()) return;
  if (e.key === " ") {
    e.preventDefault();
    const T = timeOf(S.w.civ);
    if (T.speed) S.lastSpeed = T.speed;
    run({ type: "clock.setSpeed", speed: T.speed ? 0 : S.lastSpeed || 1 });
    renderTop();
  } else if (/^[1-4]$/.test(e.key)) {
    run({ type: "clock.setSpeed", speed: Number(e.key) });
    renderTop();
  } else if (e.key === "[" || e.key === "]") $("#ph").click();
}
export function boot() {
  if (!document.getElementById("v6-root")) return;
  initNotify();
  document.addEventListener("keydown", keys);
  setup();
  runSplash();
}
if (typeof window !== "undefined") {
  window.__v6 = { S, run, act, render: () => S.hooks.render?.(), start };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
