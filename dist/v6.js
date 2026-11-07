(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/core/civ/world-consts.js
  var LAND_WATER2, BIOMES2, RES2;
  var init_world_consts = __esm({
    "js/core/civ/world-consts.js"() {
      LAND_WATER2 = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
      BIOMES2 = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
      RES2 = Object.freeze({ IRON: 1, COPPER: 2, TIN: 4, GOLD: 8, COAL: 16, SALT: 32, TIMBER: 64, FISH: 128, STONE: 256, CLAY: 512, GEMS: 1024 });
    }
  });

  // js/core/civ/ids.js
  function createIdGen(seq) {
    return {
      next(kind) {
        if (!ID_KINDS.includes(kind)) throw new Error(`\u672A\u77E5\u306EID\u7A2E\u5225: ${kind}`);
        const n2 = seq[kind] = (seq[kind] ?? 0) + 1;
        return `${kind}_${n2.toString(36).padStart(5, "0")}${check(kind, n2)}`;
      }
    };
  }
  var ID_KINDS, ALPHA, check;
  var init_ids = __esm({
    "js/core/civ/ids.js"() {
      ID_KINDS = Object.freeze(["state", "pop", "settle", "person", "event", "decision", "proposal", "tech", "culture", "lang", "religion", "species", "war", "treaty", "battle", "disaster", "work", "interp", "org", "house", "candidate", "unit", "intervention", "proposal", "catastrophe"]);
      ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
      check = (kind, n2) => {
        let h2 = n2 * 2654435761 >>> 0;
        for (let i = 0; i < kind.length; i++) h2 = h2 * 31 + kind.charCodeAt(i) >>> 0;
        return ALPHA[h2 % 36];
      };
    }
  });

  // js/core/civ/tick.js
  function createTicker() {
    const handlers = new Map(PHASE_KEYS.map((k) => [k, []]));
    return {
      /** @param {string} phase PHASE_KEYS のいずれか @param {(ctx:object)=>void} fn @param {string} [label] @param {{every?:number, offset?:number}} [opt] */
      register(phase, fn, label = fn.name || "anonymous", { every = 1, offset = 0 } = {}) {
        if (!handlers.has(phase)) throw new Error(`\u672A\u77E5\u306E\u30D5\u30A7\u30FC\u30BA: ${phase}`);
        if (!(Number.isInteger(every) && every >= 1)) throw new Error(`every \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570: ${label}`);
        handlers.get(phase).push({ fn, label, every, offset });
      },
      runMonth(ctx) {
        ctx.trace = [];
        for (const key of PHASE_KEYS) for (const h2 of handlers.get(key)) {
          ctx.phase = key;
          if (h2.every > 1) {
            const mi = ctx.civ?.monthIndex ?? 0;
            if ((mi % h2.every + h2.every) % h2.every !== h2.offset) continue;
          }
          h2.fn(ctx);
          ctx.trace.push(`${key}:${h2.label}`);
        }
        ctx.phase = null;
        return ctx;
      },
      /** 登録済みの処理の一覧（台帳との突き合わせ・診断用）。月次の実行順そのまま */
      labels() {
        const out = [];
        for (const key of PHASE_KEYS) for (const h2 of handlers.get(key)) out.push({ phase: key, label: h2.label, every: h2.every });
        return out;
      }
    };
  }
  var PHASES, PHASE_KEYS, monthIndex, fromMonthIndex;
  var init_tick = __esm({
    "js/core/civ/tick.js"() {
      PHASES = Object.freeze([
        { key: "clock", name: "\u4E16\u754C\u6642\u8A08\u3092\u6B21\u306E\u6708\u3078" },
        { key: "interventions", name: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u6E1B\u8870\uFF08\u5F53\u6708\u306E\u6709\u52B9\u5024\u3092\u78BA\u5B9A\uFF09" },
        { key: "climate", name: "\u5B63\u7BC0\u30FB\u5929\u5019\u30FB\u6C17\u5019\u306E\u6708\u6B21\u72B6\u614B" },
        { key: "disaster", name: "\u81EA\u7136\u707D\u5BB3\u30FB\u74B0\u5883\u30B7\u30E7\u30C3\u30AF" },
        { key: "ecosystem", name: "\u751F\u614B\u7CFB\uFF08\u8CC7\u6E90\u91CF\u30FB\u74B0\u5883\u5BB9\u91CF\u306E\u96C6\u7D04\u30E2\u30C7\u30EB\uFF09" },
        { key: "economy_pop", name: "\u751F\u696D\u30FB\u751F\u7523\u30FB\u98DF\u6599\u30FB\u4EBA\u53E3\u30FB\u79FB\u4F4F" },
        { key: "culture", name: "\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u30FB\u601D\u60F3" },
        { key: "tech", name: "\u6280\u8853\u306E\u72EC\u7ACB\u767A\u751F\u30FB\u4F1D\u64AD\u30FB\u55AA\u5931\u30FB\u518D\u767A\u898B" },
        { key: "economy", name: "\u751F\u7523\u30FB\u9700\u8981\u30FB\u7523\u696D\u30FB\u4EA4\u6613\u30FB\u56FD\u5BB6\u8CA1\u653F" },
        { key: "politics", name: "\u56FD\u5185\u653F\u6CBB\u30FB\u652F\u6301\u52E2\u529B\u30FB\u6307\u5C0E\u8005\u30FB\u5236\u5EA6" },
        { key: "military", name: "\u8ECD\u4E8B\u7D44\u7E54\u30FB\u90E8\u968A\u30FB\u30C9\u30AF\u30C8\u30EA\u30F3\u30FB\u8ECD\u4E8B\u80FD\u529B" },
        { key: "ai_plan", name: "\u56FD\u5BB6AI\u306E\u8A08\u753B\uFF08\u5730\u56F3\u3092\u5909\u3048\u306A\u3044\u30FB\u5224\u65AD\u904E\u7A0B\u306F\u4FDD\u5B58\u3057\u306A\u3044\uFF09" },
        { key: "apply", name: "AI \u3068\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u884C\u52D5\u3092\u5171\u901A\u306E\u691C\u8A3C\u3067\u5B9F\u884C" },
        { key: "conflict", name: "\u5916\u4EA4\u30FB\u6226\u4E89\u30FB\u53CD\u4E71\u30FB\u56FD\u5BB6\u5F62\u6210\uFF0F\u5D29\u58CA" },
        { key: "people", name: "\u91CD\u8981\u4EBA\u7269\u30FB\u5BB6\u7CFB\u30FB\u6307\u5C0E\u8005\u7D99\u627F\u30FB\u90FD\u5E02" },
        { key: "archive", name: "\u7D50\u679C\u306E\u6B74\u53F2\u8CC7\u6599\u5316\uFF08\u4ECA\u6708\u8D77\u304D\u305F\u4E8B\u5B9F\u3060\u3051\uFF09" },
        { key: "integrity", name: "\u6574\u5408\u6027\u691C\u67FB\u30FB\u8A3A\u65AD\u30FB\u30CB\u30E5\u30FC\u30B9\u5224\u5B9A" },
        { key: "notify", name: "\u63CF\u753B\u30FB\u5E74\u8868\u30FB\u30D1\u30CD\u30EB\u3078\u306E\u5909\u66F4\u901A\u77E5" }
      ]);
      PHASE_KEYS = PHASES.map((p) => p.key);
      monthIndex = (year, month) => year * 12 + (month - 1);
      fromMonthIndex = (i) => {
        const year = Math.floor(i / 12);
        return { year, month: i - year * 12 + 1 };
      };
    }
  });

  // js/core/civ/archive.js
  function mediaOf(civ3, participants, kind) {
    if (kind === "prehistory_epoch" || kind === "species_emerged" || kind === "sea_crossed") return "trace";
    let best = 0;
    const rank = (k) => k.printing != null ? 4 : k.papermaking != null ? 3 : k.writing != null || k.record_keeping != null ? 2 : 1;
    for (let i = 0; i < participants.length && i < 4; i++) {
      const id = participants[i].entityId, st2 = civ3.states[id], g = st2 ? null : civ3.groups[id];
      const r = st2 ? rank(st2.techAdopted) : g ? rank(g.tech.known) : 1;
      if (r > best) best = r;
    }
    return best >= 4 ? "print" : best === 3 ? "paper" : best === 2 ? "tablet" : "oral";
  }
  function survivalP(rec, nowMonth) {
    const age = (nowMonth - rec.t) / 12;
    if (age <= GRACE_YEARS) return 1;
    const im = rec.im ?? 1, tau = (MEDIA[rec.m]?.tau ?? 120) * IMP_TAU[im], fl = IMP_FLOOR[im];
    return fl + (1 - fl) * Math.exp(-(age - GRACE_YEARS) / tau);
  }
  function toRecord(civ3, e) {
    const pol = policyOf(e.kind), r = { eventId: e.eventId, date: e.date, t: monthOfEvent(e), kind: e.kind, ty: pol.ty, im: e.imp ?? pol.im, m: e.media ?? "oral", title: e.title, participants: e.participants, location: e.location ?? null, causes: e.causes?.length ? e.causes : [], effects: pol.im >= 2 ? e.effects ?? [] : [], provenance: e.provenance ?? "simulation" };
    if (e.facts) r.facts = e.facts;
    return r;
  }
  function chunkRecords(a, key) {
    const c = a.chunks[key];
    if (!c) return [];
    if (c.rec) return c.rec;
    let h2 = hot.get(a);
    if (!h2) hot.set(a, h2 = /* @__PURE__ */ new Map());
    let arr = h2.get(key);
    if (!arr) {
      arr = JSON.parse(c.cold);
      h2.set(key, arr);
      if (h2.size > 4) h2.delete(h2.keys().next().value);
    }
    return arr;
  }
  function commitArchive(ctx) {
    var _a, _b;
    const { civ: civ3 } = ctx, a = archiveOf(civ3), now = civ3.monthIndex, cutoff = now - LIVE_MONTHS;
    let idx = 0;
    const pinned = /* @__PURE__ */ new Set();
    for (const q2 of civ3.wcde?.news?.queue ?? []) if (q2.eventId) pinned.add(q2.eventId);
    while (idx < civ3.events.length && monthOfEvent(civ3.events[idx]) < cutoff) idx++;
    if (idx) {
      const moved = civ3.events.splice(0, idx), touched = /* @__PURE__ */ new Set();
      for (const e of moved) {
        const pol = policyOf(e.kind), key = String(bucketOf(monthOfEvent(e))), c = (_a = a.chunks)[key] ?? (_a[key] = { y0: Number(key) * CHUNK_YEARS, n: 0, lost: 0, rec: [] });
        if (!pol.store && !pinned.has(e.eventId)) {
          const k = (_b = a.counts)[key] ?? (_b[key] = {});
          k[e.kind] = (k[e.kind] ?? 0) + 1;
          continue;
        }
        if (c.cold) {
          c.rec = chunkRecords(a, key).slice();
          delete c.cold;
          hot.get(a)?.delete(key);
        }
        c.rec.push(toRecord(civ3, e));
        c.n++;
        a.total++;
        touched.add(key);
      }
      a.evBase += idx;
      a.rev++;
      for (const k of ["eventsChecked"]) if (ctx[k] != null) ctx[k] = Math.max(0, ctx[k] - idx);
      const N2 = civ3.wcde?.news;
      if (N2 && N2.scanned != null) N2.scanned = Math.max(0, N2.scanned - idx);
      if (civ3.interpCursor != null) civ3.interpCursor = Math.max(0, civ3.interpCursor - idx);
    }
    compact(civ3);
    return { moved: idx };
  }
  function compact(civ3) {
    const a = archiveOf(civ3), now = civ3.monthIndex;
    let dropped = 0;
    for (const key in a.chunks) {
      const c = a.chunks[key], old = now / 12 - (c.y0 + CHUNK_YEARS) > COLD_AFTER_YEARS - CHUNK_YEARS;
      if (c.cold && !old) continue;
      const recs = chunkRecords(a, key), keep = recs.filter((r) => survives(civ3, r, now)), lost = recs.length - keep.length;
      if (lost > 0 || old && !c.cold) {
        dropped += lost;
        c.lost += lost;
        c.n = keep.length;
        if (old && now / 12 >= c.y0 + CHUNK_YEARS) {
          c.cold = JSON.stringify(keep);
          delete c.rec;
          hot.get(a)?.delete(key);
        } else {
          c.rec = keep;
          delete c.cold;
        }
      }
    }
    if (dropped) {
      a.rev++;
      a.total -= dropped;
    }
    return dropped;
  }
  function* iterRecords(civ3, { from = -Infinity, to = Infinity, kinds = null, types = null, includeLost = false } = {}) {
    const a = archiveOf(civ3), keys = Object.keys(a.chunks).map(Number).sort((x, y) => x - y), now = civ3.monthIndex;
    for (const k of keys) {
      const y0 = k * CHUNK_YEARS;
      if (y0 * 12 > to || (y0 + CHUNK_YEARS) * 12 < from) continue;
      for (const r of chunkRecords(a, String(k))) {
        if (r.t < from || r.t > to) continue;
        if (kinds && !kinds.includes(r.kind)) continue;
        if (types && !types.includes(r.ty)) continue;
        if (!includeLost && !survives(civ3, r, now)) continue;
        yield r;
      }
    }
    for (const e of civ3.events) {
      const t = monthOfEvent(e);
      if (t < from || t > to) continue;
      const pol = policyOf(e.kind);
      if (kinds && !kinds.includes(e.kind)) continue;
      if (types && !types.includes(pol.ty)) continue;
      if (!pol.store && !kinds) continue;
      yield evAsRecord(civ3, e);
    }
  }
  function findRecord(civ3, id) {
    const live2 = civ3.events.find((e) => e.eventId === id);
    if (live2) return evAsRecord(civ3, live2);
    const a = archiveOf(civ3);
    for (const k in a.chunks) for (const r of chunkRecords(a, k)) if (r.eventId === id) return survives(civ3, r) ? r : null;
    return null;
  }
  function recordsOf(civ3, entityId, { limit = 50 } = {}) {
    const out = [];
    for (const r of iterRecords(civ3)) if (r.participants.some((p) => p.entityId === entityId)) out.push(r);
    out.sort((x, y) => y.t - x.t);
    return out.slice(0, limit);
  }
  function causesOfRecord(civ3, rec) {
    return (rec.causes ?? []).map((c) => {
      const r = findRecord(civ3, c.targetId);
      return { ...c, record: r, lost: !r && !inLiveRange(civ3, c.targetId) };
    });
  }
  function coverage(civ3) {
    const a = archiveOf(civ3), out = [];
    for (const k of Object.keys(a.chunks).map(Number).sort((x, y) => x - y)) {
      const c = a.chunks[k], kept = c.n, lost = c.lost;
      out.push({ y0: c.y0, kept, lost, ratio: kept + lost ? kept / (kept + lost) : 1, minor: Object.values(a.counts[k] ?? {}).reduce((s, v) => s + v, 0) });
    }
    return out;
  }
  function pastView(civ3, month) {
    const states = /* @__PURE__ */ new Map(), cities = [], wars = /* @__PURE__ */ new Map();
    const ensure = (id) => states.get(id) ?? (states.set(id, { id, name: null, polity: null, capitalCell: null, cells: /* @__PURE__ */ new Set(), formedAt: null, endedAt: null, known: { formed: false, ended: false }, mentions: 0 }), states.get(id));
    for (const r of iterRecords(civ3, { to: month, types: ["state", "war", "treaty", "city", "tech"] })) {
      const f = r.facts ?? {}, sid = f.stateId ?? r.participants.find((p) => p.role === "state" || p.role === "actor")?.entityId;
      if (r.kind === "state_formed") {
        const s = ensure(f.stateId ?? sid);
        s.name = f.name ?? s.name;
        s.polity = f.polity ?? s.polity;
        s.capitalCell = f.capitalCell ?? s.capitalCell;
        s.formedAt = r.t;
        s.known.formed = true;
        for (const c of f.cells ?? []) s.cells.add(c);
        s.endedAt = null;
        s.known.ended = false;
      } else if (r.kind === "state_dissolved") {
        const s = ensure(sid);
        s.endedAt = r.t;
        s.known.ended = true;
        s.mentions++;
      } else if (r.kind === "regime_change" || r.kind === "state_action" && f.polity) {
        const s = ensure(sid);
        if (f.name) s.name = f.name;
        if (f.polity) s.polity = f.polity;
        s.mentions++;
      } else if (r.kind === "group_joined_state" || r.kind === "conquest" || r.kind === "territory_occupied") {
        const s = ensure(f.stateId ?? sid);
        for (const c of f.cells ?? (f.cell != null ? [f.cell] : [])) s.cells.add(c);
        s.mentions++;
      } else if (r.kind === "war_declared") wars.set(f.warId ?? r.eventId, { id: f.warId ?? r.eventId, a: f.aggressor ?? null, b: f.defender ?? null, since: r.t, until: null });
      else if (r.kind === "war_ended") {
        const w = wars.get(f.warId) ?? null;
        if (w) w.until = r.t;
        if (f.stateId) {
          const s = ensure(f.stateId);
          for (const c of f.cells ?? []) s.cells.add(c);
          s.mentions++;
        }
      } else if (r.kind === "settlement_founded") cities.push({ id: r.eventId, cell: r.location?.cell ?? f.cell ?? null, at: r.t });
    }
    const alive = [...states.values()].filter((s) => (s.formedAt != null || s.mentions > 0) && !s.known.ended);
    const owner = /* @__PURE__ */ new Map();
    for (const s of alive) for (const c of s.cells) owner.set(c, s.id);
    for (const s of alive) if (s.capitalCell != null) owner.set(s.capitalCell, s.id);
    return { month, states: alive.map((s) => ({ ...s, cells: [...s.cells], known: s.known, partial: !s.known.formed || s.name == null })), owner, cities, wars: [...wars.values()].filter((w) => w.until == null), note: "\u6B8B\u3063\u3066\u3044\u308B\u8CC7\u6599\u304B\u3089\u518D\u69CB\u6210\u3057\u305F\u59FF\u3067\u3059\u3002\u8CC7\u6599\u304C\u5931\u308F\u308C\u305F\u90E8\u5206\u306F\u4E0D\u660E\u3067\u3001\u305D\u3053\u306B\u4F55\u3082\u7121\u304B\u3063\u305F\u3068\u3044\u3046\u610F\u5473\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" };
  }
  function checkArchive(civ3) {
    const errs = [], a = civ3.archive;
    if (!a) return errs;
    const seen = /* @__PURE__ */ new Set();
    for (const k in a.chunks) {
      const c = a.chunks[k];
      if (!c.rec && typeof c.cold !== "string") {
        errs.push(`\u8CC7\u6599\u30C1\u30E3\u30F3\u30AF ${k} \u304C\u7A7A`);
        continue;
      }
      for (const r of c.rec ?? []) {
        if (seen.has(r.eventId)) errs.push(`\u8CC7\u6599\u306E ID \u91CD\u8907 ${r.eventId}`);
        seen.add(r.eventId);
        for (const x of r.causes ?? []) if (x.basis !== "direct") errs.push(`\u8CC7\u6599 ${r.eventId} \u306B direct \u4EE5\u5916\u306E\u56E0\u679C\u30EA\u30F3\u30AF\u304C\u3042\u308B`);
        if ("decisionId" in r) errs.push(`\u8CC7\u6599 ${r.eventId} \u304C\u5224\u65AD\u306E ID \u3092\u6301\u3064`);
      }
    }
    if (civ3.decisions && civ3.decisions.length) errs.push("AI \u306E\u5224\u65AD\u8A18\u9332\u304C\u4FDD\u5B58\u3055\u308C\u3066\u3044\u308B\uFF08v6.1.0 \u306F\u4FDD\u5B58\u3057\u306A\u3044\uFF09");
    return errs;
  }
  var ARCHIVE_VERSION, LIVE_MONTHS, CHUNK_YEARS, COLD_AFTER_YEARS, P, KIND_POLICY, policyOf, MEDIA, IMP_TAU, IMP_FLOOR, GRACE_YEARS, survives, emptyArchive, archiveOf, monthOfEvent, bucketOf, hot, evAsRecord, idNum, inLiveRange;
  var init_archive = __esm({
    "js/core/civ/archive.js"() {
      init_civ_state();
      ARCHIVE_VERSION = 1;
      LIVE_MONTHS = 36;
      CHUNK_YEARS = 100;
      COLD_AFTER_YEARS = 120;
      P = (ty, im, store = true) => ({ ty, im, store });
      KIND_POLICY = Object.freeze({
        state_formed: P("state", 3),
        state_dissolved: P("state", 3),
        regime_change: P("state", 2),
        leader_succession: P("state", 1),
        succession_by_heir: P("state", 1),
        dynasty_changed: P("state", 2),
        heir_named: P("state", 0, false),
        instability: P("state", 0, false),
        group_joined_state: P("state", 1),
        conquest: P("war", 3),
        territory_occupied: P("war", 2),
        campaign_abandoned: P("war", 0, false),
        war_declared: P("war", 3),
        war_epilogue: P("war", 2),
        ideology_emerged: P("culture", 2),
        war_ended: P("war", 3),
        battle_fought: P("war", 2),
        peace: P("war", 3),
        reparations: P("war", 2),
        ally_joined: P("war", 2),
        treaty_signed: P("treaty", 2),
        treaty_ended: P("treaty", 2),
        treaty: P("treaty", 2),
        diplomacy_failed: P("treaty", 1),
        tech_discovered: P("tech", 3),
        tech_institutionalized: P("tech", 1),
        tech_rediscovered: P("tech", 2),
        tech_lost: P("tech", 2),
        culture_diverged: P("culture", 2),
        language_diverged: P("culture", 1),
        religion_founded: P("culture", 3),
        religion_schism: P("culture", 2),
        religion_spread: P("culture", 0, false),
        culture_contact: P("culture", 0, false),
        cohort_formed: P("culture", 0, false),
        cohort_assimilated: P("culture", 0, false),
        settlement_founded: P("city", 1),
        settlement_stage: P("city", 1),
        disaster_struck: P("env", 2),
        catastrophe: P("env", 3),
        disaster_ended: P("env", 0, false),
        climate_shift: P("env", 2),
        famine: P("env", 1),
        ecosystem_shift: P("env", 1),
        group_split: P("pop", 0, false),
        group_moved: P("pop", 0, false),
        group_extinct: P("pop", 1),
        subsistence_changed: P("pop", 0, false),
        sea_crossed: P("pop", 3),
        species_emerged: P("pop", 3),
        prehistory_epoch: P("pop", 2),
        trade_route_opened: P("economy", 1),
        trade_cut: P("economy", 1),
        demand_raised: P("economy", 0, false),
        doctrine_adopted: P("military", 1),
        state_action: P("state", 1),
        creator_edit: P("creator", 2),
        chronicle: P("other", 1),
        magic_backlash: P("other", 0, false),
        magic_power_struggle: P("other", 0, false),
        magic_org_founded: P("other", 0, false),
        magic_gifted_died: P("other", 0, false),
        magic_incident: P("other", 0, false),
        magic_discrimination: P("other", 0, false),
        magic_gifted_found: P("other", 0, false)
      });
      policyOf = (kind) => KIND_POLICY[kind] ?? P("other", 1);
      MEDIA = Object.freeze({ trace: { ja: "\u907A\u8DE1\u30FB\u75D5\u8DE1", tau: 25e4 }, oral: { ja: "\u53E3\u627F", tau: 120 }, tablet: { ja: "\u523B\u307E\u308C\u305F\u8A18\u9332", tau: 900 }, paper: { ja: "\u7D19\u306E\u8A18\u9332", tau: 2800 }, print: { ja: "\u5370\u5237\u7269", tau: 14e3 } });
      IMP_TAU = [0.4, 1, 2.5, 8];
      IMP_FLOOR = [3e-3, 0.01, 0.05, 0.12];
      GRACE_YEARS = 20;
      survives = (civ3, rec, nowMonth = civ3.monthIndex) => hashSeed(civ3.historySeed, "archive", rec.eventId) / 4294967296 < survivalP(rec, nowMonth);
      emptyArchive = () => ({ v: ARCHIVE_VERSION, chunks: {}, counts: {}, evBase: 0, total: 0, rev: 0 });
      archiveOf = (civ3) => civ3.archive ?? (civ3.archive = emptyArchive());
      monthOfEvent = (e) => e.date.year * 12 + (e.date.month - 1);
      bucketOf = (m) => Math.floor(m / 12 / CHUNK_YEARS);
      hot = /* @__PURE__ */ new WeakMap();
      evAsRecord = (civ3, e) => toRecord(civ3, { ...e, media: e.media ?? mediaOf(civ3, e.participants, e.kind) });
      idNum = (id) => Number(String(id).split("_").pop());
      inLiveRange = (civ3, id) => !civ3.events.length || idNum(id) >= idNum(civ3.events[0].eventId);
    }
  });

  // js/core/civ/events.js
  function makeEvent(civ3, ids, { kind, title, participants = [], location = null, causes = [], effects = [], provenance = "simulation", facts = null, decisionId = null }) {
    void decisionId;
    for (const c of causes) {
      if (!RELATIONS.includes(c.relation)) throw new Error(`\u672A\u77E5\u306E\u95A2\u4FC2: ${c.relation}`);
      if (!BASES.includes(c.basis)) throw new Error(`\u672A\u77E5\u306E\u6839\u62E0: ${c.basis}`);
    }
    const direct = causes.filter((c) => c.basis === "direct");
    const ev = { eventId: ids.next("event"), date: { ...civ3.date }, kind, title, participants, location, causes: direct, effects, provenance, media: mediaOf(civ3, participants, kind) };
    if (facts) ev.facts = facts;
    civ3.events.push(ev);
    return ev;
  }
  var RELATIONS, BASES;
  var init_events = __esm({
    "js/core/civ/events.js"() {
      init_archive();
      RELATIONS = Object.freeze(["caused_by", "contributed_to", "reaction_to", "enabled_by", "part_of", "succeeded_by", "influenced_by", "related_to"]);
      BASES = Object.freeze(["direct", "strong", "plausible", "contested", "unknown"]);
    }
  });

  // js/core/civ/history.js
  function put(f, k, t, v) {
    const a = f[k];
    if (!a) {
      f[k] = [t, v];
      return;
    }
    const n2 = a.length;
    if (a[n2 - 2] === t) {
      if (n2 >= 4 && a[n2 - 3] === v) a.length = n2 - 2;
      else a[n2 - 1] = v;
      return;
    }
    if (a[n2 - 1] !== v) a.push(t, v);
  }
  function at(a, m) {
    if (!a || a[0] > m) return void 0;
    let lo = 0, hi = (a.length >> 1) - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (a[mid * 2] <= m) lo = mid;
      else hi = mid - 1;
    }
    return a[lo * 2 + 1];
  }
  function extractState(st2, groupCount) {
    const o = {
      alive: st2.alive ? 1 : 0,
      player: st2.player ? 1 : 0,
      name: st2.name,
      via: st2.via,
      polity: st2.polity,
      cap: st2.capitalGroupId ?? "",
      leader: st2.leader.name,
      heir: st2.leader.heir ? 1 : 0,
      pop: Math.round(st2.pop),
      tr: Math.round(st2.treasury * 100),
      stb: Math.round(st2.stability * 1e4),
      army: Math.round(st2.army),
      settle: st2.settlements,
      ng: groupCount,
      def: Math.round(st2.defense * 1e3),
      tax: Math.round(st2.policy.tax * 1e3),
      mob: Math.round(st2.policy.mobilization * 1e3),
      assim: Math.round(st2.policy.assimilation * 1e3),
      tol: Math.round(st2.policy.tolerance * 1e3),
      auto: Math.round(st2.policy.autonomy * 1e3),
      goal: st2.strategy?.goal ?? "",
      camp: st2.campaign ? `${st2.campaign.kind}:${st2.campaign.stage}:${st2.campaign.target}` : "",
      wars: st2.warIds.join(",")
    };
    for (const k in st2.techAdopted) o[pre("tech.", k)] = 1;
    for (const k in st2.relations) o[pre("rel.", k)] = Math.round(st2.relations[k] * 10);
    for (const k in st2.sanctions) o[pre("sanct.", k)] = st2.sanctions[k];
    o.res = Math.round((st2.resilience ?? 0) * 1e3);
    if (st2.magic) o.magic = Math.round((st2.magic.power ?? 0) * 1e3);
    if (st2.econ) {
      o.ind = Math.round((st2.econ.industry ?? 0) * 10);
      o.trinc = Math.round((st2.econ.tradeIncome ?? 0) * 100);
    }
    if (st2.politics) {
      o.leg = Math.round(st2.politics.legitimacy * 1e3);
      o.fat = Math.round(st2.politics.fatigue * 1e3);
    }
    if (st2.military) {
      o.milb = Math.round((st2.milBonus ?? 0) * 1e3);
      o.doct = Object.keys(st2.military.doctrine.taken).length;
    }
    return o;
  }
  function recordEntity(H, c, bag, lastMap, id, cur, t) {
    let ent = bag[id];
    if (!ent) {
      ent = bag[id] = { from: t, f: {} };
    }
    let last = lastMap.get(id);
    if (!last) {
      last = tail(H, ent.f);
      lastMap.set(id, last);
    }
    let dyn = c.dyn.get(id);
    if (!dyn) {
      dyn = /* @__PURE__ */ new Set();
      for (const k in last) if (DYN.some((p) => k.startsWith(p))) dyn.add(k);
      c.dyn.set(id, dyn);
    }
    for (const k in cur) {
      const v = cur[k];
      if (last[k] !== v) {
        put(ent.f, k, t, enc(H, c, k, v));
        if (!(k in last) && DYN.some((p) => k.startsWith(p))) dyn.add(k);
        last[k] = v;
      }
    }
    for (const k of dyn) if (!(k in cur) && last[k] !== 0) {
      put(ent.f, k, t, 0);
      last[k] = 0;
    }
  }
  function recordMonth(ctx, byStateMap) {
    const { civ: civ3 } = ctx, t = civ3.monthIndex, H = civ3.history ?? (civ3.history = newHistory()), c = cacheOf(H), counts = /* @__PURE__ */ new Map();
    if (!c.aliveG) {
      c.aliveG = /* @__PURE__ */ new Set();
      for (const id in H.groups) {
        const a = H.groups[id].f.alive;
        if (a && a[a.length - 1] === 1) c.aliveG.add(id);
      }
    }
    const dec2 = t % GROUP_DECADE === 0;
    for (const id in civ3.groups) {
      const g = civ3.groups[id];
      if (g.stateId) counts.set(g.stateId, (counts.get(g.stateId) ?? 0) + 1);
      const st2 = g.settlementId ? civ3.settlements[g.settlementId]?.stage ?? "" : "", L = c.lastG.get(id);
      if (!dec2 && L && L.alive === 1 && L.cell === g.cell && L.st === (g.stateId ?? "") && L.sub === g.subsistence && L.stage === st2) continue;
      const cur = { alive: 1, cell: g.cell, st: g.stateId ?? "", sub: g.subsistence, stage: st2 };
      if (dec2) {
        cur.pop = Math.round(g.pop);
        cur.coh = g.cohorts.map((x) => `${x.cultureId}|${x.religionId ?? ""}|${x.speciesId}|${Math.round(x.share * 1e3)}`).join(";");
      }
      recordEntity(H, c, H.groups, c.lastG, id, cur, t);
      c.aliveG.add(id);
    }
    for (const id of c.aliveG) if (!civ3.groups[id]) {
      recordEntity(H, c, H.groups, c.lastG, id, { alive: 0 }, t);
      c.aliveG.delete(id);
    }
    for (const id in civ3.states) {
      const st2 = civ3.states[id];
      if (!st2.alive && H.states[id] && c.lastS.get(id)?.alive === 0) continue;
      recordEntity(H, c, H.states, c.lastS, id, extractState(st2, counts.get(id) ?? 0), t);
    }
    H.last = t;
  }
  function stateAt(civ3, id, m) {
    const H = civ3.history, e = H?.states[id];
    if (!e || m < e.from) return null;
    const f = e.f, g = (k) => dget(H, f, k, m), o = {
      id,
      alive: g("alive") === 1,
      player: g("player") === 1,
      name: g("name"),
      via: g("via"),
      polity: g("polity"),
      capitalGroupId: g("cap") || null,
      leader: { name: g("leader"), heir: g("heir") === 1 },
      pop: g("pop"),
      treasury: g("tr") / 100,
      stability: g("stb") / 1e4,
      army: g("army"),
      settlements: g("settle"),
      groupCount: g("ng"),
      defense: g("def") / 1e3,
      policy: { tax: g("tax") / 1e3, mobilization: g("mob") / 1e3, assimilation: g("assim") / 1e3, tolerance: g("tol") / 1e3, autonomy: g("auto") / 1e3 },
      strategy: g("goal") || null,
      campaign: g("camp") || null,
      warIds: (g("wars") || "").split(",").filter(Boolean),
      techAdopted: [],
      relations: {},
      sanctions: {}
    };
    for (const k in f) {
      const v = at(f[k], m);
      if (k.startsWith("tech.")) {
        if (v === 1) o.techAdopted.push(k.slice(5));
      } else if (k.startsWith("rel.")) {
        if (v) o.relations[k.slice(4)] = v / 10;
      } else if (k.startsWith("sanct.")) {
        if (v) o.sanctions[k.slice(6)] = v;
      }
    }
    o.resilience = g("res") / 1e3;
    o.techAdopted.sort();
    if (f.ind) o.econ = { industry: g("ind") / 10, tradeIncome: g("trinc") / 100 };
    if (f.leg) o.politics = { legitimacy: g("leg") / 1e3, fatigue: g("fat") / 1e3 };
    if (f.milb) o.military = { bonus: g("milb") / 1e3, doctrines: g("doct") };
    if (f.magic) o.magicPower = (at(f.magic, m) ?? 0) / 1e3;
    return o;
  }
  function groupsAt(civ3, m) {
    const H = civ3.history, out = /* @__PURE__ */ new Map();
    for (const id in H?.groups ?? {}) {
      const e = H.groups[id];
      if (m < e.from) continue;
      const f = e.f;
      if (dget(H, f, "alive", m) !== 1) continue;
      const dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE;
      let pop = at(f.pop, m);
      out.set(id, { id, cell: at(f.cell, m), stateId: dget(H, f, "st", m) || null, subsistence: dget(H, f, "sub", m), stage: dget(H, f, "stage", m) || null, pop, popAsOf: dm });
    }
    return out;
  }
  function compositionAt(civ3, stateId, m) {
    const H = civ3.history, out = { culture: {}, religion: {}, species: {}, total: 0 }, dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE;
    for (const [id, g] of groupsAt(civ3, m)) {
      if (g.stateId !== stateId) continue;
      const coh = H.dict[at(H.groups[id].f.coh, dm) ?? 0] ?? "";
      const pop = at(H.groups[id].f.pop, dm) ?? g.pop ?? 0;
      for (const part of coh.split(";").filter(Boolean)) {
        const [cu, re, sp, sh] = part.split("|"), n2 = pop * (+sh / 1e3);
        out.total += n2;
        out.culture[cu] = (out.culture[cu] ?? 0) + n2;
        const r = re || "none";
        out.religion[r] = (out.religion[r] ?? 0) + n2;
        out.species[sp] = (out.species[sp] ?? 0) + n2;
      }
    }
    return out;
  }
  function ownerMapAt(civ3, territoryOf2, world, m) {
    const owner = /* @__PURE__ */ new Map();
    for (const g of groupsAt(civ3, m).values()) if (g.stateId) for (const c of territoryOf2(world, g.cell)) owner.set(c, g.stateId);
    return owner;
  }
  var HISTORY_VERSION, GROUP_DECADE, STR, DYN, caches, preC, pre, newHistory, cacheOf, D, enc, tail, dget;
  var init_history = __esm({
    "js/core/civ/history.js"() {
      HISTORY_VERSION = 1;
      GROUP_DECADE = 120;
      STR = /* @__PURE__ */ new Set(["name", "via", "polity", "cap", "leader", "goal", "camp", "wars", "st", "sub", "stage", "coh"]);
      DYN = ["rel.", "tech.", "sanct."];
      caches = /* @__PURE__ */ new WeakMap();
      preC = /* @__PURE__ */ new Map();
      pre = (p, k) => {
        let m = preC.get(p);
        if (!m) preC.set(p, m = /* @__PURE__ */ new Map());
        let v = m.get(k);
        if (v === void 0) m.set(k, v = p + k);
        return v;
      };
      newHistory = () => ({ v: HISTORY_VERSION, dict: [""], states: {}, groups: {}, last: -1 });
      cacheOf = (H) => {
        let c = caches.get(H);
        if (!c) {
          c = { dix: new Map(H.dict.map((s, i) => [s, i])), lastS: /* @__PURE__ */ new Map(), lastG: /* @__PURE__ */ new Map(), dyn: /* @__PURE__ */ new Map(), aliveG: null };
          caches.set(H, c);
        }
        return c;
      };
      D = (H, c, s) => {
        let i = c.dix.get(s);
        if (i === void 0) {
          i = H.dict.length;
          H.dict.push(s);
          c.dix.set(s, i);
        }
        return i;
      };
      enc = (H, c, k, v) => STR.has(k) ? D(H, c, v) : v;
      tail = (H, f) => {
        const o = {};
        for (const k in f) {
          const a = f[k], v = a[a.length - 1];
          o[k] = STR.has(k) ? H.dict[v] : v;
        }
        return o;
      };
      dget = (H, f, k, m) => {
        const v = at(f[k], m);
        return v === void 0 ? void 0 : STR.has(k) ? H.dict[v] : v;
      };
    }
  });

  // js/core/civ/civ-chunks.js
  var enc2, dec;
  var init_civ_chunks = __esm({
    "js/core/civ/civ-chunks.js"() {
      init_history();
      init_civ_state();
      enc2 = new TextEncoder();
      dec = new TextDecoder();
    }
  });

  // js/core/civ/graph.js
  function graphIndex(civ3) {
    let ix = idxCache.get(civ3);
    if (!ix || ix.eventsRef !== civ3.events || ix.upto > civ3.events.length) ix = { eventsRef: civ3.events, upto: 0, pos: /* @__PURE__ */ new Map(), effects: /* @__PURE__ */ new Map(), byEntity: /* @__PURE__ */ new Map(), byDecision: /* @__PURE__ */ new Map(), decUpto: 0, decPos: /* @__PURE__ */ new Map(), decByActor: /* @__PURE__ */ new Map(), decByMonth: /* @__PURE__ */ new Map() }, idxCache.set(civ3, ix);
    const E = civ3.events;
    for (; ix.upto < E.length; ix.upto++) {
      const ev = E[ix.upto], i = ix.upto;
      ix.pos.set(ev.eventId, i);
      for (const c of ev.causes) push(ix.effects, c.targetId, { from: ev.eventId, relation: c.relation, basis: c.basis, userEdited: !!c.userEdited });
      const seen = /* @__PURE__ */ new Set();
      for (const p of ev.participants) if (!seen.has(p.entityId)) {
        seen.add(p.entityId);
        push(ix.byEntity, p.entityId, i);
      }
      if (ev.decisionId) push(ix.byDecision, ev.decisionId, i);
    }
    const D2 = civ3.decisions ?? [];
    for (; ix.decUpto < D2.length; ix.decUpto++) {
      const d = D2[ix.decUpto];
      ix.decPos.set(d.decisionId, ix.decUpto);
      push(ix.decByActor, d.actorId, ix.decUpto);
      push(ix.decByMonth, d.date.year * 12 + d.date.month - 1, ix.decUpto);
    }
    return ix;
  }
  function consequencesOf(civ3, id) {
    const ix = graphIndex(civ3);
    return (ix.effects.get(id) ?? []).map((r) => ({ ...r, event: getEvent(civ3, r.from) }));
  }
  function recentEventsFor(civ3, entityIds, kinds, window2, limit = 2) {
    const ix = graphIndex(civ3), now = civ3.monthIndex, out = [], seen = /* @__PURE__ */ new Set();
    for (const e of entityIds) {
      const a = ix.byEntity.get(e);
      if (!a) continue;
      for (let i = a.length - 1; i >= 0; i--) {
        const ev = civ3.events[a[i]];
        if (now - evMonth(ev) > window2) break;
        if (kinds.includes(ev.kind) && !seen.has(ev.eventId)) {
          seen.add(ev.eventId);
          out.push(ev);
        }
      }
    }
    out.sort((x, y) => evMonth(y) - evMonth(x) || (x.eventId < y.eventId ? 1 : -1));
    return out.slice(0, limit);
  }
  var evMonth, idxCache, push, getEvent, asCauses;
  var init_graph = __esm({
    "js/core/civ/graph.js"() {
      init_events();
      init_civ_chunks();
      init_archive();
      evMonth = (ev) => ev.date.year * 12 + (ev.date.month - 1);
      idxCache = /* @__PURE__ */ new WeakMap();
      push = (m, k, v) => {
        const a = m.get(k);
        if (a) a.push(v);
        else m.set(k, [v]);
      };
      getEvent = (civ3, id) => {
        const ix = graphIndex(civ3), i = ix.pos.get(id);
        return i === void 0 ? civ3.archive ? findRecord(civ3, id) : null : civ3.events[i];
      };
      asCauses = (events, relation, basis) => events.map((e) => ({ targetId: e.eventId, relation, basis }));
    }
  });

  // js/core/civ/cohorts.js
  function addCohort(g, from, share) {
    let c = g.cohorts.find((x) => x.cultureId === from.cultureId && x.religionId === from.religionId && x.speciesId === from.speciesId);
    const made = !c;
    if (!c) {
      c = { cultureId: from.cultureId, languageId: from.languageId, religionId: from.religionId, speciesId: from.speciesId, share: 0, tension: 0.1, interest: null };
      g.cohorts.push(c);
    }
    const d = dominant(g);
    if (d === c) return made;
    const mv = Math.min(share, d.share * 0.5);
    d.share -= mv;
    c.share += mv;
    normalize(g);
    return made;
  }
  function tensionTarget(c, ref, state) {
    const parts = { religion: c.religionId !== ref.religionId && c.religionId ? 0.3 : 0, language: c.languageId !== ref.languageId ? 0.25 : 0, culture: c.cultureId !== ref.cultureId ? 0.15 : 0, tax: state ? Math.max(0, state.policy.tax - 0.12) * 1.5 : 0, species: c.speciesId !== ref.speciesId ? 0.2 : 0 };
    if (state) {
      parts.religion *= 1 - 0.6 * state.policy.tolerance;
      parts.language *= 1 - 0.5 * state.policy.autonomy;
    }
    let t = 0.05, best = null, bv = 0;
    for (const [k, v] of Object.entries(parts)) {
      t += v;
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    const interest = { religion: "religious_freedom", language: "language_rights", culture: "autonomy", tax: "tax_relief", species: "autonomy" }[best] ?? null;
    return { target: Math.min(1, t), interest };
  }
  function stepCohorts(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (mi % 3 !== 0) return;
    for (const id in civ3.groups) {
      const g = civ3.groups[id];
      if (g.cohorts.length < 2) continue;
      const st2 = g.stateId ? civ3.states[g.stateId] : null, cap = st2 ? civ3.groups[st2.capitalGroupId] : null, ref = dominant(cap && cap.cohorts.length ? cap : g);
      const assim = st2 ? st2.policy.assimilation : 0;
      let changed = false;
      for (const c of g.cohorts) {
        if (!st2 && c === dominant(g)) continue;
        const { target, interest } = tensionTarget(c, ref, st2);
        const was = c.tension;
        c.tension += (target + assim * 0.2 - c.tension) * 0.14;
        c.interest = interest;
        if (c.tension < 0.5) c.demandSpent = false;
        if (was < 0.7 && c.tension >= 0.7 && !c.demandSpent && (c.demandSpent = true)) makeEvent(civ3, ids, { kind: "demand_raised", title: `\u5C11\u6570\u306E\u4EBA\u3005\u304C\u300C${INTERESTS[interest] ?? "\u6539\u5584"}\u300D\u3092\u6C42\u3081\u308B`, participants: [{ entityId: g.id, role: "group" }, ...st2 ? [{ entityId: st2.id, role: "state" }] : []], location: { cell: g.cell }, causes: [...asCauses(recentEventsFor(civ3, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), ...st2 ? asCauses(recentEventsFor(civ3, [st2.id], ["war_ended", "leader_succession"], 36, 1), "contributed_to", "plausible") : []], effects: [{ targetId: g.id, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(c.tension * 100) / 100 }] });
        const d = dominant(g);
        if (c !== d && c.speciesId === d.speciesId) {
          const mv = c.share * 24e-4 * (1 + 3 * assim);
          c.share -= mv;
          d.share += mv;
          changed = true;
        }
      }
      if (changed) {
        const before = g.cohorts.length;
        g.cohorts = g.cohorts.filter((c) => c.share >= 0.01 || c === dominant(g));
        normalize(g);
        if (g.cohorts.length < before) makeEvent(civ3, ids, { kind: "cohort_assimilated", title: "\u5C11\u6570\u306E\u4EBA\u3005\u304C\u591A\u6570\u6D3E\u3078\u6EB6\u3051\u8FBC\u3093\u3060", participants: [{ entityId: g.id, role: "group" }], location: { cell: g.cell } });
      }
    }
  }
  var INTERESTS, dominant, normalize;
  var init_cohorts = __esm({
    "js/core/civ/cohorts.js"() {
      init_events();
      init_graph();
      INTERESTS = Object.freeze({ autonomy: "\u81EA\u6CBB", religious_freedom: "\u4FE1\u4EF0\u306E\u81EA\u7531", language_rights: "\u8A00\u8A9E\u306E\u6A29\u5229", tax_relief: "\u6E1B\u7A0E", land: "\u571F\u5730", security: "\u5B89\u5168" });
      dominant = (g) => {
        let b = g.cohorts[0];
        for (const c of g.cohorts) if (c.share > b.share) b = c;
        return b;
      };
      normalize = (g) => {
        let t = 0;
        for (const c of g.cohorts) t += c.share;
        for (const c of g.cohorts) c.share /= t || 1;
      };
    }
  });

  // js/core/civ/spatial.js
  function spatialOf(ctx) {
    if (ctx._spatial && ctx._spatialMonth === ctx.civ.monthIndex) return ctx._spatial;
    const { world, civ: civ3 } = ctx, home = /* @__PURE__ */ new Map(), terr = /* @__PURE__ */ new Map();
    for (const id in civ3.groups) {
      const g = civ3.groups[id];
      home.set(g.cell, id);
      for (const c of g.cells ?? [g.cell]) {
        const a = terr.get(c);
        if (a) a.push(id);
        else terr.set(c, [id]);
      }
    }
    ctx._spatial = { home, terr };
    ctx._spatialMonth = civ3.monthIndex;
    return ctx._spatial;
  }
  function neighborGroups(ctx, g) {
    const { world } = ctx, m = world.mesh, { terr } = spatialOf(ctx), out = /* @__PURE__ */ new Set();
    for (const c of g.cells ?? [g.cell]) {
      for (const o of terr.get(c) ?? []) if (o !== g.id) out.add(o);
      for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) for (const o of terr.get(m.neighborIds[k]) ?? []) if (o !== g.id) out.add(o);
    }
    return out;
  }
  function byState(ctx) {
    if (ctx._byState && ctx._byStateMonth === ctx.civ.monthIndex) return ctx._byState;
    const m = /* @__PURE__ */ new Map();
    for (const id in ctx.civ.groups) {
      const g = ctx.civ.groups[id];
      if (g.stateId) {
        const a = m.get(g.stateId);
        if (a) a.push(g);
        else m.set(g.stateId, [g]);
      }
    }
    ctx._byState = m;
    ctx._byStateMonth = ctx.civ.monthIndex;
    return m;
  }
  var invalidateMonthCaches;
  var init_spatial = __esm({
    "js/core/civ/spatial.js"() {
      invalidateMonthCaches = (ctx) => {
        ctx._spatial = ctx._byState = null;
      };
    }
  });

  // js/core/civ/culture.js
  function createCulture(civ3, ids, rng, { parent = null, cell = null } = {}) {
    const id = ids.next("culture");
    civ3.cultures[id] = { id, name: makeNameJa(rng) + (parent ? "\u7CFB" : "\u306E\u4EBA\u3005"), parent, bornAt: civ3.monthIndex, cell };
    return id;
  }
  function createLanguage(civ3, ids, rng, { parent = null, cultureId = null } = {}) {
    const id = ids.next("lang");
    civ3.languages[id] = { id, name: makeNameJa(rng) + "\u8A9E", parent, bornAt: civ3.monthIndex, cultureId };
    return id;
  }
  function createReligion(civ3, ids, rng, { parent = null, kind = null } = {}) {
    const id = ids.next("religion");
    civ3.religions[id] = { id, name: makeNameJa(rng) + "\u6559", kind: kind ?? RELIGION_KINDS[Math.floor(rng() * RELIGION_KINDS.length)], parent, bornAt: civ3.monthIndex };
    return id;
  }
  function stepCulture(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    for (const id in civ3.groups) {
      const g = civ3.groups[id], d = dominant(g), age = mi - g.bornAt;
      if (age > 360 && rng() < 3e-4) {
        const old = d.languageId, nl = createLanguage(civ3, ids, rng, { parent: old, cultureId: d.cultureId });
        d.languageId = nl;
        makeEvent(civ3, ids, { kind: "language_diverged", title: `${civ3.languages[old].name}\u304B\u3089\u65B0\u3057\u3044\u8A00\u8A9E\u304C\u5206\u304B\u308C\u305F`, participants: [{ entityId: g.id, role: "speakers" }, { entityId: nl, role: "language" }, { entityId: old, role: "parent_language" }], location: { cell: g.cell } });
      }
      if (age > 360 && g.pop > 400 && rng() < 2e-4) {
        const old = d.cultureId, nc = createCulture(civ3, ids, rng, { parent: old, cell: g.cell });
        d.cultureId = nc;
        makeEvent(civ3, ids, { kind: "culture_diverged", title: `${civ3.cultures[old].name}\u304B\u3089\u65B0\u3057\u3044\u6587\u5316\u304C\u5206\u304B\u308C\u305F`, participants: [{ entityId: g.id, role: "bearers" }, { entityId: nc, role: "culture" }, { entityId: old, role: "parent_culture" }], location: { cell: g.cell } });
      }
      const st2 = g.settlementId ? civ3.settlements[g.settlementId] : null;
      if (!d.religionId && st2 && STAGE_OK.has(st2.stage) && rng() < 2e-3) {
        const r = createReligion(civ3, ids, rng);
        d.religionId = r;
        makeEvent(civ3, ids, { kind: "religion_founded", title: `${civ3.religions[r].name}\uFF08${civ3.religions[r].kind}\uFF09\u304C\u751F\u307E\u308C\u305F`, participants: [{ entityId: g.id, role: "origin" }, { entityId: r, role: "religion" }], location: { cell: g.cell } });
      }
      if (rng() < 0.03) {
        const ns = [...neighborGroups(ctx, g)];
        if (!ns.length) continue;
        const o = civ3.groups[ns[Math.floor(rng() * ns.length)]], od = dominant(o);
        if (od.cultureId !== d.cultureId) {
          const key = [d.cultureId, od.cultureId].sort().join("|");
          if (!civ3.contacts[key]) {
            civ3.contacts[key] = mi;
            makeEvent(civ3, ids, { kind: "culture_contact", title: `${civ3.cultures[d.cultureId].name}\u3068${civ3.cultures[od.cultureId].name}\u304C\u51FA\u4F1A\u3063\u305F`, participants: [{ entityId: d.cultureId, role: "culture_a" }, { entityId: od.cultureId, role: "culture_b" }, { entityId: g.id, role: "place_a" }, { entityId: o.id, role: "place_b" }], location: { cell: g.cell } });
          }
          if (mi - (g.lastMixAt ?? -999) >= 240 && rng() < 0.06 && (g.lastMixAt = mi, addCohort(g, od, 0.06))) makeEvent(civ3, ids, { kind: "cohort_formed", title: "\u7570\u306A\u308B\u6587\u5316\u306E\u4EBA\u3005\u304C\u6DF7\u3056\u308A\u5408\u3044\u59CB\u3081\u305F", participants: [{ entityId: g.id, role: "group" }, { entityId: od.cultureId, role: "culture" }], location: { cell: g.cell } });
        }
        if (d.religionId && od.religionId !== d.religionId && !od.religionId && rng() < 0.2) {
          od.religionId = d.religionId;
          makeEvent(civ3, ids, { kind: "religion_spread", title: `${civ3.religions[d.religionId].name}\u304C\u5E83\u307E\u3063\u305F`, participants: [{ entityId: d.religionId, role: "religion" }, { entityId: o.id, role: "adopter" }, { entityId: g.id, role: "source" }], location: { cell: o.cell } });
        }
      }
    }
  }
  var SYL, makeNameJa, RELIGION_KINDS, STAGE_OK;
  var init_culture = __esm({
    "js/core/civ/culture.js"() {
      init_events();
      init_cohorts();
      init_spatial();
      SYL = ["\u30AB", "\u30ED", "\u30DF", "\u30BF", "\u30B9", "\u30CD", "\u30F4\u30A9", "\u30EA", "\u30A2\u30F3", "\u30CF", "\u30C9", "\u30EC", "\u30E6", "\u30B5", "\u30AD", "\u30CE", "\u30D9", "\u30B0", "\u30DE", "\u30B8", "\u30E9", "\u30AA", "\u30C8", "\u30B7\u30A7"];
      makeNameJa = (rng) => {
        const n2 = 2 + (rng() < 0.45 ? 1 : 0);
        let s = "";
        for (let i = 0; i < n2; i++) s += SYL[Math.floor(rng() * SYL.length)];
        return s;
      };
      RELIGION_KINDS = Object.freeze(["\u7CBE\u970A\u4FE1\u4EF0", "\u7956\u970A\u4FE1\u4EF0", "\u592A\u967D\u4FE1\u4EF0", "\u5927\u5730\u6BCD\u795E", "\u591A\u795E\u6559", "\u4E00\u795E\u6559"]);
      STAGE_OK = /* @__PURE__ */ new Set(["town", "city"]);
    }
  });

  // js/core/civ/species.js
  var SPECIES, speciesOf, lifeScale;
  var init_species = __esm({
    "js/core/civ/species.js"() {
      init_world_consts();
      SPECIES = Object.freeze({
        archaic: { id: "archaic", ja: "\u53E4\u4EE3\u578B\u4EBA\u985E", lifespan: 840, growth: 0.92, techRate: 0.72, martial: 1, magic: 0, env: [] },
        // v6.1.0: 人類の祖先系統（先史の初期。現生人類へ置き換わる・混血していく）
        human: { id: "human", ja: "\u4EBA\u9593", lifespan: 960, growth: 1, techRate: 1, martial: 1, magic: 2e-3, env: [] },
        elf: { id: "elf", ja: "\u30A8\u30EB\u30D5", lifespan: 4800, growth: 0.55, techRate: 1.1, martial: 0.95, magic: 0.02, env: [BIOMES2.TEMPERATE_FOREST, BIOMES2.TAIGA, BIOMES2.RAINFOREST] },
        dwarf: { id: "dwarf", ja: "\u30C9\u30EF\u30FC\u30D5", lifespan: 2400, growth: 0.8, techRate: 1.12, martial: 1.15, magic: 4e-3, env: [BIOMES2.ALPINE, BIOMES2.COLD_DESERT, BIOMES2.TAIGA] },
        beastfolk: { id: "beastfolk", ja: "\u7363\u4EBA", lifespan: 600, growth: 1.05, techRate: 0.9, martial: 1.2, magic: 3e-3, env: [BIOMES2.SAVANNA, BIOMES2.GRASSLAND, BIOMES2.TROPICAL_SEASONAL] }
      });
      speciesOf = (id, civ3 = null) => civ3?.speciesDefs?.[id] ?? SPECIES[id] ?? SPECIES.human;
      lifeScale = (civ3, st2) => {
        const g = civ3.groups[st2.capitalGroupId];
        const sp = g?.cohorts?.length ? speciesOf(g.cohorts.reduce((b, c) => c.share > b.share ? c : b).speciesId, civ3) : SPECIES.human;
        return sp.lifespan / SPECIES.human.lifespan;
      };
    }
  });

  // js/core/civ/civ-state.js
  function hashSeed(...parts) {
    let h2 = 2166136261 >>> 0;
    for (const p of parts) {
      const s = String(p);
      for (let i = 0; i < s.length; i++) {
        h2 ^= s.charCodeAt(i);
        h2 = Math.imul(h2, 16777619) >>> 0;
      }
      h2 ^= 255;
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    return h2 >>> 0;
  }
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function emptyLayers() {
    return { states: {}, cultures: {}, languages: {}, religions: {}, contacts: {}, techWorld: {}, wars: {}, treaties: {}, activeWarIds: [], activeTreatyIds: [], archive: null, options: { aiInterval: 6 }, interpretations: [], works: [], interpCursor: 0, species: {}, persons: {}, magic: { orgs: {}, living: [] }, disasters: {}, climate: { index: 0, phase: "normal", since: 0 }, memory: {} };
  }
  function newGroup(id, { cell, pop, subsistence = "forage", species = "human", origin = null, bornAt = 0, knowledge = null, parent = null }) {
    return { id, speciesId: species, cell, pop, subsistence, player: false, origin, parent, bornAt, settledMonths: 0, lastBudAt: bornAt, famineAt: -999, stateId: null, pressure: 0, cohorts: [], tech: { known: {}, prog: {}, lost: {} }, knowledge: knowledge ? { ...knowledge } : { agriculture: 0, seafaring: 0, herding: 0 }, order: null, settlementId: null, cells: null };
  }
  var CIV_STATE_VERSION, setDate, sortedGroupIds;
  var init_civ_state = __esm({
    "js/core/civ/civ-state.js"() {
      init_ids();
      init_tick();
      init_culture();
      init_species();
      CIV_STATE_VERSION = 3;
      setDate = (civ3, mi) => {
        civ3.monthIndex = mi;
        civ3.date = fromMonthIndex(mi);
      };
      sortedGroupIds = (civ3) => Object.keys(civ3.groups).sort();
    }
  });

  // js/core/civ/techtree.js
  function layoutGrid() {
    const slot = /* @__PURE__ */ new Map(), lanes = LANES.map((l) => l.id), count = /* @__PURE__ */ new Map(), pos = {};
    for (const t of TREE) {
      const k = t.lane + "|" + t.col, i = count.get(k) ?? 0;
      count.set(k, i + 1);
      slot.set(t.id, i);
    }
    const rows = {};
    for (const l of lanes) rows[l] = 1;
    for (const [k, c] of count) {
      const l = k.split("|")[0];
      rows[l] = Math.max(rows[l], c);
    }
    const y0 = {};
    let acc = 0;
    for (const l of lanes) {
      y0[l] = acc;
      acc += rows[l];
    }
    for (const t of TREE) pos[t.id] = { col: t.col, row: y0[t.lane] + slot.get(t.id), lane: t.lane };
    return { pos, rows, y0, totalRows: acc, cols: COLS };
  }
  function validateTree(tree = TREE) {
    const errs = [], by = /* @__PURE__ */ new Map();
    for (const t of tree) {
      if (by.has(t.id)) errs.push(`ID \u91CD\u8907 ${t.id}`);
      by.set(t.id, t);
    }
    const used = /* @__PURE__ */ new Set();
    for (const t of tree) for (const p of t.prereq) used.add(p);
    for (const t of tree) {
      if (!LANE[t.lane]) errs.push(`${t.id}: \u672A\u77E5\u306E\u30EC\u30FC\u30F3 ${t.lane}`);
      if (!(t.stage >= 0 && t.stage < STAGES.length)) errs.push(`${t.id}: stage \u304C\u7BC4\u56F2\u5916`);
      for (const p of t.prereq) {
        const q2 = by.get(p);
        if (!q2) errs.push(`${t.id}: \u524D\u63D0 ${p} \u304C\u7121\u3044`);
        else if (q2.col >= t.col) errs.push(`${t.id}: \u524D\u63D0 ${p} \u306E\u5217\u304C\u540C\u3058\u304B\u53F3\uFF08\u5DE6\u304B\u3089\u53F3\u3078\u9032\u307E\u306A\u3044\uFF09`);
      }
      if (t.id !== "stone_tools" && !t.prereq.length) errs.push(`${t.id}: \u524D\u63D0\u304C\u7121\u3044\uFF08\u6839\u306F\u77F3\u5668\u3060\u3051\uFF09`);
      if (!t.caps.length && !Object.keys(t.fx).length && !used.has(t.id)) errs.push(`${t.id}: \u89E3\u7981\u3082\u52B9\u679C\u3082\u5F8C\u7D9A\u3082\u7121\u3044\uFF08\u52B9\u679C\u306E\u306A\u3044\u30CE\u30FC\u30C9\uFF09`);
    }
    return errs;
  }
  var LANES, STAGES, POOL, E_BY_STAGE, nodes, n, TREE, COLS, NODE, LANE;
  var init_techtree = __esm({
    "js/core/civ/techtree.js"() {
      LANES = Object.freeze([
        { id: "mat", ja: "\u7D20\u6750\u30FB\u9053\u5177", glyph: "\u25C6" },
        { id: "agr", ja: "\u8FB2\u696D\u30FB\u7267\u755C", glyph: "\u2740" },
        { id: "bld", ja: "\u5EFA\u7BC9", glyph: "\u25A3" },
        { id: "trn", ja: "\u8F38\u9001\u30FB\u822A\u6D77", glyph: "\u27A4" },
        { id: "sci", ja: "\u6570\u5B66\u30FB\u6E2C\u91CF\u30FB\u5929\u6587", glyph: "\u2211" },
        { id: "rec", ja: "\u8A18\u9332\u30FB\u6587\u5B57\u30FB\u901A\u4FE1", glyph: "\u270E" },
        { id: "med", ja: "\u533B\u7642\u30FB\u885B\u751F", glyph: "\u271A" },
        { id: "gov", ja: "\u7D71\u6CBB\u30FB\u884C\u653F\u30FB\u6CD5", glyph: "\u2696" },
        { id: "eco", ja: "\u7D4C\u6E08\u30FB\u91D1\u878D", glyph: "\xA4" },
        { id: "mil", ja: "\u8ECD\u4E8B\u30FB\u5175\u7AD9", glyph: "\u2694" },
        { id: "ind", ja: "\u30A8\u30CD\u30EB\u30AE\u30FC\u30FB\u7523\u696D", glyph: "\u2699" }
      ]);
      STAGES = Object.freeze(["\u539F\u521D", "\u5F8C\u671F\u65E7\u77F3\u5668", "\u65B0\u77F3\u5668", "\u9752\u9285\u5668", "\u9244\u5668\u30FB\u53E4\u5178", "\u53E4\u5178\u5F8C\u671F", "\u4E2D\u4E16", "\u8FD1\u4E16\u521D\u671F", "\u8FD1\u4E16", "\u7523\u696D\u9769\u547D", "\u8FD1\u4EE3", "\u73FE\u4EE3"]);
      POOL = 6e3;
      E_BY_STAGE = [4e5, 12e5, 45e5, ...[110, 150, 190, 230, 250, 260, 220, 200, 170].map((y) => y * POOL)];
      nodes = [];
      n = (id, ja, lane, stage, prereq, o = {}) => nodes.push({ id, ja, lane, stage, pre: stage <= 2, prereq, E: o.E ?? E_BY_STAGE[stage], pop: o.pop ?? 0, s: !!o.s, cond: o.cond ?? null, caps: o.caps ?? [], fx: o.fx ?? {}, desc: o.d ?? "", why: o.why ?? "" });
      n("stone_tools", "\u77F3\u5668", "mat", 0, [], { E: 0, d: "\u6253\u3061\u6B20\u3044\u305F\u77F3\u306E\u5203\u3002\u3059\u3079\u3066\u306E\u96C6\u56E3\u304C\u6700\u521D\u304B\u3089\u6301\u3064\u3002" });
      n("fire_control", "\u706B\u306E\u5229\u7528", "mat", 0, ["stone_tools"], { caps: ["pop:cold"], fx: { cap: 0.04 }, d: "\u706B\u3092\u4FDD\u3061\u3001\u8ABF\u7406\u3068\u6696\u3092\u3068\u308B\u3002\u5BD2\u51B7\u306A\u571F\u5730\u3078\u4F4F\u3081\u308B\u3002", why: "\u77F3\u5668\u306E\u4F7F\u7528\u304C\u5E83\u304C\u3063\u305F\u96C6\u56E3\u3067\u3001\u706B\u304C\u65E5\u5E38\u7684\u306B\u4F7F\u308F\u308C\u308B" });
      n("hafted_tools", "\u7D44\u307F\u5408\u308F\u305B\u9053\u5177", "mat", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "\u67C4\u3092\u3064\u3051\u305F\u65A7\u30FB\u69CD\u3002\u72E9\u731F\u3068\u52A0\u5DE5\u304C\u52B9\u7387\u5316\u3059\u308B\u3002", why: "\u706B\u3067\u6A39\u8102\u3084\u81A0\u3092\u6271\u3048\u308B" });
      n("cordage", "\u7E04\u30FB\u7DB2", "mat", 1, ["stone_tools"], { fx: { cap: 0.03 }, d: "\u690D\u7269\u7E4A\u7DAD\u306E\u7E04\u3068\u7DB2\u3002\u6F01\u6488\u30FB\u7F60\u30FB\u7B4F\u306E\u57FA\u790E\u3002" });
      n("hide_working", "\u76AE\u306A\u3081\u3057\u30FB\u8863\u670D", "mat", 1, ["fire_control"], { caps: ["pop:cold"], fx: { cap: 0.05 }, d: "\u76AE\u3092\u52A0\u5DE5\u3057\u8863\u670D\u306B\u3059\u308B\u3002\u9AD8\u7DEF\u5EA6\u306E\u6C37\u671F\u3092\u8010\u3048\u308B\u3002" });
      n("pottery", "\u571F\u5668", "mat", 2, ["fire_control"], { E: 8e6, cond: "clay", caps: ["storage:pottery"], fx: { cap: 0.04 }, d: "\u7C98\u571F\u3092\u713C\u3044\u305F\u5BB9\u5668\u3002\u716E\u708A\u304D\u3068\u8CAF\u8535\u3002", why: "\u7C98\u571F\u306E\u3042\u308B\u571F\u5730\u3067\u3001\u706B\u3092\u4F7F\u3044\u6163\u308C\u305F\u96C6\u56E3" });
      n("weaving", "\u7E54\u7269", "mat", 2, ["cordage"], { fx: { cap: 0.03 }, d: "\u7CF8\u3092\u649A\u308A\u5E03\u3092\u7E54\u308B\u3002", why: "\u7E04\u30FB\u7DB2\u306E\u6280\u8853\u304C\u7E4A\u7DAD\u306E\u52A0\u5DE5\u3078\u5E83\u304C\u308B" });
      n("copper_working", "\u9285\u52A0\u5DE5", "mat", 3, ["pottery", "fire_control"], { cond: "cu_sn", pop: 300, d: "\u81EA\u7136\u9285\u3084\u9285\u9271\u3092\u71B1\u3057\u3066\u53E9\u304D\u3001\u5668\u5177\u306B\u3059\u308B\u3002", why: "\u9285\u30FB\u932B\u306E\u3042\u308B\u571F\u5730\u3067\u3001\u713C\u6210\u306E\u7D4C\u9A13\u304C\u3042\u308B" });
      n("bronze", "\u9752\u9285", "mat", 3, ["copper_working", "pottery"], { pop: 400, cond: "cu_sn", caps: ["unit:ranged"], fx: { ind: 0.1 }, d: "\u9285\u3068\u932B\u306E\u5408\u91D1\u3002\u9053\u5177\u3068\u6B66\u5177\u304C\u786C\u304F\u306A\u308B\u3002" });
      n("iron", "\u9244", "mat", 4, ["bronze"], { pop: 800, cond: "iron", fx: { ind: 0.15, cap: 0.05 }, d: "\u9244\u9271\u304B\u3089\u9244\u3092\u5F97\u308B\u3002\u8FB2\u5177\u3068\u6B66\u5177\u304C\u5E83\u304F\u666E\u53CA\u3059\u308B\u3002", why: "\u9244\u9271\u304C\u3042\u308A\u3001\u9752\u9285\u306E\u7089\u306E\u6280\u8853\u304C\u3042\u308B" });
      n("bellows", "\u9001\u98A8\u30FB\u9AD8\u7089", "mat", 5, ["iron"], { pop: 1200, fx: { ind: 0.1 }, d: "\u3075\u3044\u3054\u3068\u7089\u306E\u6539\u826F\u3002\u9AD8\u6E29\u3092\u5B89\u5B9A\u3057\u3066\u5F97\u308B\u3002" });
      n("glassmaking", "\u30AC\u30E9\u30B9", "mat", 5, ["pottery", "bellows"], { d: "\u7802\u3092\u9AD8\u6E29\u3067\u6EB6\u304B\u3059\u3002\u5668\u30FB\u7A93\u30FB\u306E\u3061\u306E\u30EC\u30F3\u30BA\u306E\u57FA\u790E\u3002" });
      n("steel", "\u92FC", "mat", 6, ["iron", "bellows"], { pop: 2e3, fx: { ind: 0.15 }, d: "\u70AD\u7D20\u3092\u5236\u5FA1\u3057\u305F\u9244\u3002\u5203\u7269\u3068\u69CB\u9020\u6750\u304C\u98DB\u8E8D\u3059\u308B\u3002" });
      n("precision_tools", "\u7CBE\u5BC6\u5DE5\u4F5C", "mat", 7, ["steel", "mathematics"], { pop: 6e3, fx: { ind: 0.12 }, d: "\u65CB\u76E4\u30FB\u6E2C\u5B9A\u5177\u3002\u90E8\u54C1\u306E\u7CBE\u5EA6\u304C\u4E0A\u304C\u308B\u3002" });
      n("chemistry", "\u5316\u5B66", "mat", 8, ["glassmaking", "natural_philosophy"], { pop: 8e3, fx: { ind: 0.1, health: 0.03 }, d: "\u7269\u8CEA\u306E\u5909\u5316\u3092\u4F53\u7CFB\u7684\u306B\u6271\u3046\u3002" });
      n("foraging_arts", "\u63A1\u96C6\u306E\u77E5\u8B58", "agr", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "\u98DF\u3079\u3089\u308C\u308B\u690D\u7269\u306E\u898B\u5206\u3051\u3068\u52A0\u5DE5\u3002" });
      n("fishing", "\u6F01\u6488", "agr", 1, ["cordage"], { cond: "water", fx: { cap: 0.05 }, caps: ["subsist:fishing"], d: "\u7DB2\u30FB\u7C17\u30FB\u91E3\u91DD\u3067\u9B5A\u4ECB\u3092\u7372\u308B\u3002" });
      n("agriculture", "\u8FB2\u8015", "agr", 2, ["foraging_arts"], { E: 8e6, cond: "fertile", caps: ["subsist:agriculture", "action:found_city"], fx: { cap: 0.2 }, d: "\u4F5C\u7269\u3092\u690D\u3048\u3066\u80B2\u3066\u308B\u3002\u5B9A\u4F4F\u304C\u53EF\u80FD\u306B\u306A\u308B\u3002", why: "\u80A5\u6C83\u3067\u6C34\u306B\u8FD1\u3044\u571F\u5730\u3067\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u304F\u3001\u63A1\u96C6\u306E\u77E5\u8B58\u304C\u84C4\u7A4D\u3057\u3066\u3044\u308B" });
      n("pastoralism", "\u7267\u755C", "agr", 2, ["foraging_arts"], { E: 8e6, cond: "grass", caps: ["subsist:pastoral"], fx: { cap: 0.1 }, d: "\u5BB6\u755C\u3092\u98FC\u3044\u3001\u7FA4\u308C\u3068\u3068\u3082\u306B\u79FB\u52D5\u3059\u308B\u3002", why: "\u8349\u539F\u30FB\u30B5\u30D0\u30F3\u30CA\u3067\u3001\u72E9\u731F\u306E\u5BFE\u8C61\u3068\u306A\u308B\u7FA4\u308C\u304C\u3042\u308A\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u3044" });
      n("food_preservation", "\u4FDD\u5B58\u98DF", "agr", 2, ["fire_control", "foraging_arts"], { fx: { cap: 0.04 }, d: "\u71FB\u88FD\u30FB\u4E7E\u71E5\u30FB\u5869\u6F2C\u3051\u3002\u51AC\u3068\u822A\u6D77\u3092\u8D8A\u3048\u308B\u3002" });
      n("horse_riding", "\u9A0E\u4E57", "agr", 3, ["pastoralism"], { pop: 200, caps: ["unit:cavalry", "pop:steppe"], d: "\u99AC\u3092\u98FC\u3044\u306A\u3089\u3057\u3066\u4E57\u308B\u3002\u79FB\u52D5\u3068\u6226\u3044\u304C\u5909\u308F\u308B\u3002", why: "\u99AC\u306E\u3044\u308B\u8349\u539F\u3067\u7267\u755C\u304C\u55B6\u307E\u308C\u3066\u3044\u308B" });
      n("irrigation", "\u704C\u6F11", "agr", 3, ["agriculture", "construction"], { s: true, fx: { cap: 0.15 }, d: "\u6C34\u8DEF\u3068\u5830\u3067\u7551\u3078\u6C34\u3092\u5F15\u304F\u3002" });
      n("plow", "\u7282", "agr", 4, ["irrigation", "pastoralism"], { s: true, fx: { cap: 0.2 }, d: "\u5BB6\u755C\u306B\u5F15\u304B\u305B\u308B\u7282\u3002\u8015\u4F5C\u306E\u898F\u6A21\u304C\u5E83\u304C\u308B\u3002" });
      n("terracing", "\u6BB5\u3005\u7551", "agr", 5, ["plow", "masonry"], { fx: { cap: 0.08 }, d: "\u659C\u9762\u3092\u8015\u5730\u306B\u3059\u308B\u3002" });
      n("crop_rotation", "\u8F2A\u4F5C", "agr", 6, ["plow", "terracing"], { s: true, fx: { cap: 0.25 }, d: "\u4F11\u9591\u3068\u4F5C\u7269\u306E\u5165\u308C\u66FF\u3048\u3067\u5730\u529B\u3092\u4FDD\u3064\u3002" });
      n("selective_breeding", "\u54C1\u7A2E\u6539\u826F", "agr", 7, ["crop_rotation", "natural_philosophy"], { fx: { cap: 0.1 }, d: "\u9078\u629C\u3067\u4F5C\u7269\u3068\u5BB6\u755C\u3092\u6539\u826F\u3059\u308B\u3002" });
      n("seed_drill", "\u6761\u64AD\u6A5F", "agr", 8, ["crop_rotation", "precision_tools"], { fx: { cap: 0.1 }, d: "\u64AD\u7A2E\u3092\u6A5F\u68B0\u5316\u3059\u308B\u3002" });
      n("fertilizer", "\u5316\u5B66\u80A5\u6599", "agr", 9, ["selective_breeding", "chemistry"], { fx: { cap: 0.3 }, d: "\u7A92\u7D20\u30FB\u30EA\u30F3\u9178\u3092\u5DE5\u696D\u7684\u306B\u4F9B\u7D66\u3059\u308B\u3002" });
      n("agri_mechanization", "\u8FB2\u696D\u6A5F\u68B0\u5316", "agr", 10, ["seed_drill", "internal_combustion"], { fx: { cap: 0.25 }, d: "\u52D5\u529B\u306B\u3088\u308B\u8015\u4F5C\u30FB\u53CE\u7A6B\u3002" });
      n("shelter", "\u4F4F\u5C45", "bld", 1, ["hafted_tools", "hide_working"], { caps: ["pop:cold"], fx: { cap: 0.03 }, d: "\u5C0F\u5C4B\u30FB\u30C6\u30F3\u30C8\u30FB\u7AEA\u7A74\u4F4F\u5C45\u3002" });
      n("construction", "\u5EFA\u7BC9", "bld", 2, ["shelter"], { E: 9e6, pop: 300, caps: ["action:found_city"], d: "\u7D99\u7D9A\u3057\u3066\u4F4F\u3081\u308B\u5BB6\u5C4B\u3068\u516C\u5171\u306E\u5EFA\u7269\u3002", why: "\u5171\u540C\u3067\u8CC7\u6750\u3092\u904B\u3079\u308B\u898F\u6A21\u306E\u96C6\u56E3" });
      n("masonry", "\u77F3\u9020", "bld", 3, ["construction"], { cond: "stone", pop: 600, d: "\u77F3\u6750\u3092\u7A4D\u3080\u3002\u5927\u304D\u304F\u9577\u6301\u3061\u3059\u308B\u5EFA\u9020\u7269\u3002" });
      n("brick", "\u7149\u74E6", "bld", 3, ["pottery", "construction"], { cond: "clay", fx: { cap: 0.03 }, d: "\u713C\u6210\u7149\u74E6\u3002\u77F3\u306E\u4E4F\u3057\u3044\u571F\u5730\u3067\u3082\u5927\u5EFA\u7BC9\u304C\u3067\u304D\u308B\u3002" });
      n("fortification", "\u57CE\u58C1", "bld", 4, ["masonry"], { pop: 500, caps: ["action:build_fortification", "unit:garrison"], fx: { def: 0.1 }, d: "\u90FD\u5E02\u3092\u56F2\u3080\u58C1\u3002" });
      n("roads", "\u9053\u8DEF", "bld", 4, ["construction", "wheel"], { pop: 1e3, caps: ["trade:land_long"], fx: { trade: 0.08 }, d: "\u56FA\u3081\u305F\u9053\u3068\u6A4B\u3002\u9060\u65B9\u3068\u306E\u5F80\u6765\u3068\u88DC\u7D66\u3002" });
      n("aqueduct", "\u6C34\u9053\u6A4B", "bld", 5, ["masonry", "irrigation"], { pop: 4e3, fx: { cap: 0.06, health: 0.04 }, d: "\u6C34\u3092\u9060\u304F\u304B\u3089\u90FD\u5E02\u3078\u904B\u3076\u3002" });
      n("city_planning", "\u90FD\u5E02\u8A08\u753B", "bld", 6, ["roads", "administration"], { pop: 6e3, fx: { cap: 0.05, tax: 0.05 }, d: "\u533A\u753B\u30FB\u8857\u8DEF\u30FB\u5E02\u5834\u306E\u914D\u7F6E\u3092\u7D71\u6CBB\u304C\u6C7A\u3081\u308B\u3002" });
      n("concrete", "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8", "bld", 7, ["masonry", "chemistry"], { d: "\u6C34\u786C\u6027\u306E\u6750\u6599\u3067\u5927\u69CB\u9020\u7269\u3092\u4F5C\u308B\u3002" });
      n("structural_steel", "\u9244\u9AA8\u69CB\u9020", "bld", 9, ["steel", "concrete", "industry"], { fx: { cap: 0.08 }, d: "\u9AD8\u5C64\u30FB\u9577\u5927\u6A4B\u6881\u3002" });
      n("seafaring", "\u822A\u6D77", "trn", 2, ["cordage"], { E: 5e6, cond: "coast", pop: 300, caps: ["move:sea", "subsist:fishing"], d: "\u7B4F\u30FB\u4E38\u6728\u821F\u3067\u6D77\u30FB\u6E56\u3078\u51FA\u308B\u3002", why: "\u6D77\u5CB8\u306B\u8FD1\u304F\u3001\u7E04\u30FB\u7DB2\u3092\u4F7F\u3044\u3001\u4E00\u5B9A\u306E\u898F\u6A21\u306E\u96C6\u56E3" });
      n("wheel", "\u8ECA\u8F2A", "trn", 3, ["pottery", "construction"], { pop: 600, d: "\u8ECA\u8F2A\u3068\u8F46\u8F64\u3002\u904B\u642C\u304C\u697D\u306B\u306A\u308B\u3002" });
      n("cart", "\u8377\u8ECA", "trn", 4, ["wheel", "pastoralism"], { fx: { trade: 0.05 }, d: "\u5BB6\u755C\u304C\u5F15\u304F\u8377\u8ECA\u3002" });
      n("shipbuilding", "\u9020\u8239", "trn", 4, ["seafaring", "construction"], { cond: "coast", caps: ["unit:navy"], fx: { trade: 0.05 }, d: "\u7ADC\u9AA8\u3068\u677F\u5F35\u308A\u306E\u8239\u3002" });
      n("harbor", "\u6E2F\u6E7E", "trn", 5, ["shipbuilding", "masonry"], { cond: "coast", pop: 3e3, caps: ["trade:sea_long"], fx: { trade: 0.12 }, d: "\u6E2F\u30FB\u685F\u6A4B\u30FB\u5009\u5EAB\u3002\u6D77\u4E0A\u4EA4\u6613\u306E\u62E0\u70B9\u3002" });
      n("navigation", "\u822A\u6CD5", "trn", 6, ["astronomy", "shipbuilding"], { caps: ["move:ocean"], d: "\u661F\u3068\u7F85\u91DD\u3067\u5916\u6D0B\u3092\u6E21\u308B\u3002" });
      n("ocean_sailing", "\u5916\u6D0B\u5E06\u8239", "trn", 7, ["navigation", "harbor"], { fx: { trade: 0.12 }, d: "\u5927\u6D0B\u3092\u6E21\u308B\u5E06\u8239\u3002" });
      n("steamship", "\u84B8\u6C17\u8239", "trn", 9, ["steam_engine", "shipbuilding"], { fx: { trade: 0.15 }, d: "\u98A8\u306B\u4F9D\u3089\u306A\u3044\u5927\u578B\u8239\u3002" });
      n("railway", "\u9244\u9053", "trn", 9, ["steam_engine", "steel"], { caps: ["trade:rail"], fx: { trade: 0.2, cap: 0.05 }, d: "\u9244\u306E\u9053\u3092\u84B8\u6C17\u6A5F\u95A2\u8ECA\u304C\u8D70\u308B\u3002" });
      n("motor_vehicle", "\u81EA\u52D5\u8ECA", "trn", 10, ["internal_combustion", "roads"], { fx: { trade: 0.1 }, d: "\u5185\u71C3\u6A5F\u95A2\u306E\u8ECA\u3002" });
      n("aviation", "\u822A\u7A7A", "trn", 11, ["internal_combustion", "precision_tools", "motor_vehicle"], { caps: ["unit:air"], d: "\u52D5\u529B\u306B\u3088\u308B\u98DB\u884C\u3002" });
      n("counting", "\u8A08\u6570", "sci", 2, ["stone_tools"], { fx: { learn: 0.05 }, d: "\u6570\u3092\u523B\u307F\u3001\u6570\u3048\u308B\u3002" });
      n("calendar", "\u66A6", "sci", 3, ["record_keeping", "counting"], { s: true, d: "\u5B63\u7BC0\u3068\u5929\u4F53\u304B\u3089\u5E74\u3092\u6570\u3048\u308B\u3002", why: "\u8A18\u9332\u306E\u7FD2\u6163\u304C\u3042\u308A\u3001\u5B63\u7BC0\u304C\u8FB2\u8015\u30FB\u796D\u7940\u306B\u7D50\u3073\u3064\u304F" });
      n("mathematics", "\u6570\u5B66", "sci", 4, ["writing", "counting"], { fx: { learn: 0.05 }, d: "\u7B97\u8853\u30FB\u5E7E\u4F55\u3002" });
      n("surveying", "\u6E2C\u91CF", "sci", 4, ["mathematics", "construction"], { d: "\u571F\u5730\u3068\u8DDD\u96E2\u3092\u6E2C\u308B\u3002", caps: ["admin:land_survey"] });
      n("astronomy", "\u5929\u6587", "sci", 5, ["calendar", "mathematics"], { d: "\u5929\u4F53\u306E\u904B\u884C\u3092\u89B3\u6E2C\u3057\u4E88\u6E2C\u3059\u308B\u3002" });
      n("optics", "\u5149\u5B66", "sci", 7, ["glassmaking", "mathematics"], { d: "\u30EC\u30F3\u30BA\u306B\u3088\u308B\u89B3\u6E2C\u3002" });
      n("natural_philosophy", "\u81EA\u7136\u54F2\u5B66", "sci", 7, ["mathematics", "writing", "astronomy"], { pop: 5e3, fx: { learn: 0.05 }, d: "\u81EA\u7136\u3092\u7406\u7531\u3065\u3051\u3066\u7406\u89E3\u3057\u3088\u3046\u3068\u3059\u308B\u4F1D\u7D71\u3002" });
      n("scientific_method", "\u5B9F\u9A13\u79D1\u5B66", "sci", 8, ["natural_philosophy", "printing"], { fx: { learn: 0.15 }, d: "\u89B3\u5BDF\u30FB\u5B9F\u9A13\u30FB\u516C\u8868\u3067\u77E5\u8B58\u3092\u7A4D\u307F\u4E0A\u3052\u308B\u3002" });
      n("calculus", "\u5FAE\u7A4D\u5206", "sci", 8, ["mathematics", "natural_philosophy"], { d: "\u5909\u5316\u3092\u6570\u5F0F\u3067\u6271\u3046\u3002" });
      n("statistics", "\u7D71\u8A08", "sci", 9, ["mathematics", "bureaucracy", "scientific_method"], { fx: { tax: 0.04 }, d: "\u96C6\u8A08\u304B\u3089\u5168\u4F53\u3092\u77E5\u308B\u3002" });
      n("oral_tradition", "\u53E3\u627F", "rec", 1, ["stone_tools"], { fx: { learn: 0.06 }, d: "\u8A00\u8449\u3068\u6B4C\u3067\u77E5\u8B58\u3092\u4E16\u4EE3\u3078\u6E21\u3059\u3002" });
      n("symbol_marks", "\u8A18\u53F7", "rec", 2, ["oral_tradition", "counting"], { d: "\u523B\u307F\u76EE\u30FB\u7D75\u30FB\u5370\u3067\u6570\u3084\u6240\u6709\u3092\u6B8B\u3059\u3002" });
      n("record_keeping", "\u8A18\u9332", "rec", 3, ["pottery", "symbol_marks"], { pop: 800, s: true, caps: ["admin:records"], fx: { learn: 0.05 }, d: "\u7C98\u571F\u677F\u30FB\u7D50\u7E04\u3067\u5728\u5EAB\u3068\u53D6\u5F15\u3092\u6B8B\u3059\u3002", why: "\u8CAF\u8535\u3068\u53D6\u5F15\u304C\u5897\u3048\u3066\u3001\u8A18\u61B6\u3060\u3051\u3067\u306F\u8DB3\u308A\u306A\u304F\u306A\u308B" });
      n("writing", "\u6587\u5B57", "rec", 4, ["record_keeping"], { pop: 1e3, s: true, caps: ["action:covert_op"], fx: { learn: 0.12 }, d: "\u8A00\u8449\u3092\u5199\u3059\u4F53\u7CFB\u3002" });
      n("alphabet", "\u8868\u97F3\u6587\u5B57", "rec", 5, ["writing"], { fx: { learn: 0.1 }, d: "\u97F3\u3092\u5C11\u6570\u306E\u6587\u5B57\u3067\u8868\u3059\u3002\u8AAD\u307F\u66F8\u304D\u304C\u5E83\u304C\u308B\u3002" });
      n("papermaking", "\u7D19", "rec", 6, ["writing"], { pop: 3e3, fx: { learn: 0.1 }, d: "\u8EFD\u304F\u5B89\u3044\u8A18\u9332\u5A92\u4F53\u3002" });
      n("postal_system", "\u99C5\u4F1D\u30FB\u90F5\u4FBF", "rec", 6, ["roads", "writing", "administration"], { caps: ["admin:courier"], d: "\u516C\u306E\u901A\u4FE1\u7DB2\u3002" });
      n("printing", "\u5370\u5237", "rec", 7, ["papermaking"], { pop: 5e3, fx: { learn: 0.2 }, d: "\u8907\u88FD\u304C\u5B89\u304F\u306A\u308A\u3001\u77E5\u8B58\u304C\u901F\u304F\u5E83\u304C\u308B\u3002" });
      n("newspapers", "\u65B0\u805E", "rec", 8, ["printing", "alphabet"], { fx: { learn: 0.06 }, d: "\u5B9A\u671F\u520A\u884C\u306E\u60C5\u5831\u3002" });
      n("telegraph", "\u96FB\u4FE1", "rec", 9, ["electricity"], { d: "\u96FB\u6C17\u4FE1\u53F7\u3067\u5373\u6642\u306B\u901A\u4FE1\u3059\u308B\u3002" });
      n("radio", "\u7121\u7DDA\u901A\u4FE1", "rec", 10, ["telegraph", "electric_grid"], { fx: { learn: 0.1, trade: 0.04 }, d: "\u96FB\u6CE2\u3067\u901A\u4FE1\u30FB\u653E\u9001\u3059\u308B\u3002" });
      n("computing", "\u8A08\u7B97\u6A5F", "rec", 11, ["electricity", "calculus", "precision_tools"], { fx: { learn: 0.15, ind: 0.1 }, d: "\u96FB\u5B50\u8A08\u7B97\u3002" });
      n("herbalism", "\u85AC\u8349", "med", 1, ["foraging_arts"], { fx: { health: 0.03 }, d: "\u85AC\u306B\u306A\u308B\u690D\u7269\u306E\u7D4C\u9A13\u77E5\u3002" });
      n("bone_setting", "\u5916\u50B7\u306E\u624B\u5F53", "med", 2, ["herbalism", "hafted_tools"], { fx: { health: 0.03 }, d: "\u9AA8\u6298\u30FB\u5916\u50B7\u306E\u51E6\u7F6E\u3002" });
      n("medicine", "\u533B\u5B66", "med", 4, ["herbalism", "writing"], { fx: { health: 0.05 }, d: "\u75C7\u72B6\u3068\u6CBB\u7642\u3092\u8A18\u9332\u3057\u4F53\u7CFB\u5316\u3059\u308B\u3002" });
      n("hygiene_practice", "\u516C\u8846\u885B\u751F\u306E\u7FD2\u6163", "med", 5, ["medicine", "aqueduct"], { pop: 4e3, fx: { health: 0.06, cap: 0.03 }, d: "\u6C34\u30FB\u6392\u6CC4\u30FB\u57CB\u846C\u306E\u7BA1\u7406\u3002" });
      n("sanitation", "\u885B\u751F", "med", 6, ["medicine", "hygiene_practice"], { pop: 5e3, fx: { cap: 0.1, health: 0.08 }, d: "\u4E0A\u4E0B\u6C34\u9053\u30FB\u3054\u307F\u306E\u7BA1\u7406\u3002\u90FD\u5E02\u304C\u5927\u304D\u304F\u306A\u308C\u308B\u3002" });
      n("quarantine", "\u691C\u75AB", "med", 6, ["medicine", "harbor"], { d: "\u75AB\u75C5\u306E\u6D41\u5165\u3092\u9694\u96E2\u3067\u9632\u3050\u3002", fx: { health: 0.04 } });
      n("anatomy", "\u89E3\u5256\u5B66", "med", 7, ["medicine", "natural_philosophy"], { d: "\u8EAB\u4F53\u306E\u69CB\u9020\u3092\u89B3\u5BDF\u3059\u308B\u3002" });
      n("germ_theory", "\u75C5\u539F\u4F53\u8AAC", "med", 9, ["optics", "chemistry", "anatomy"], { fx: { health: 0.12 }, d: "\u5FAE\u751F\u7269\u304C\u75C5\u6C17\u3092\u8D77\u3053\u3059\u3068\u3044\u3046\u7406\u89E3\u3002" });
      n("vaccination", "\u4E88\u9632\u63A5\u7A2E", "med", 9, ["germ_theory"], { fx: { health: 0.1, cap: 0.05 }, d: "\u611F\u67D3\u75C7\u3092\u4E88\u9632\u3059\u308B\u3002" });
      n("antibiotics", "\u6297\u751F\u7269\u8CEA", "med", 10, ["germ_theory", "chemistry", "industry"], { fx: { health: 0.12, cap: 0.05 }, d: "\u7D30\u83CC\u611F\u67D3\u306E\u6CBB\u7642\u3002" });
      n("kin_council", "\u9577\u8001\u4F1A\u8B70", "gov", 1, ["oral_tradition"], { caps: ["polity:chiefdom"], d: "\u5E74\u9577\u8005\u30FB\u6709\u529B\u8005\u304C\u96C6\u307E\u308A\u6C7A\u3081\u308B\u3002" });
      n("administration", "\u884C\u653F", "gov", 4, ["writing", "kin_council"], { pop: 1500, caps: ["polity:kingdom", "admin:officials"], fx: { tax: 0.25 }, d: "\u5B98\u8077\u3068\u8A18\u9332\u306B\u3088\u308B\u7D71\u6CBB\u3002", why: "\u6587\u5B57\u304C\u3042\u308A\u3001\u6570\u5343\u4EBA\u898F\u6A21\u306E\u96C6\u4F4F" });
      n("law", "\u6CD5", "gov", 5, ["administration"], { caps: ["polity:republic"], fx: { tax: 0.05 }, d: "\u6210\u6587\u306E\u898F\u5247\u3068\u88C1\u304D\u3002" });
      n("census", "\u6238\u7C4D\u30FB\u4EBA\u53E3\u8ABF\u67FB", "gov", 5, ["administration", "counting"], { fx: { tax: 0.06 }, d: "\u4EBA\u3068\u571F\u5730\u3092\u6570\u3048\u308B\u3002" });
      n("diplomacy", "\u5916\u4EA4\u6163\u884C", "gov", 5, ["writing", "kin_council"], { caps: ["treaty:alliance"], d: "\u4F7F\u7BC0\u30FB\u8A93\u7D04\u30FB\u6761\u7D04\u306E\u66F8\u5F0F\u3002" });
      n("tax_system", "\u79DF\u7A0E\u5236\u5EA6", "gov", 5, ["administration", "record_keeping"], { caps: ["policy:tax_high"], fx: { tax: 0.1 }, d: "\u5B9A\u307E\u3063\u305F\u7A0E\u76EE\u3068\u5FB4\u53CE\u3002" });
      n("bureaucracy", "\u5B98\u50DA\u5236", "gov", 6, ["law", "census", "tax_system"], { pop: 8e3, caps: ["polity:empire"], fx: { tax: 0.3 }, d: "\u968E\u5C64\u5316\u3055\u308C\u305F\u5B98\u540F\u7D44\u7E54\u3002" });
      n("civil_service", "\u5B98\u540F\u767B\u7528", "gov", 7, ["bureaucracy", "papermaking"], { fx: { tax: 0.08, learn: 0.05 }, d: "\u8A66\u9A13\u30FB\u8CC7\u683C\u306B\u3088\u308B\u767B\u7528\u3002" });
      n("constitutionalism", "\u7ACB\u61B2\u4E3B\u7FA9", "gov", 8, ["law", "printing"], { d: "\u6A29\u529B\u3092\u6CD5\u3067\u7E1B\u308B\u3002" });
      n("parliament", "\u8B70\u4F1A\u5236", "gov", 9, ["constitutionalism"], { caps: ["policy:parliament"], fx: { tax: 0.04 }, d: "\u4EE3\u8868\u304C\u96C6\u307E\u308A\u6C7A\u3081\u308B\u3002" });
      n("public_education", "\u516C\u6559\u80B2", "gov", 9, ["printing", "bureaucracy"], { fx: { learn: 0.15 }, d: "\u5E83\u304F\u8AAD\u307F\u66F8\u304D\u3092\u6559\u3048\u308B\u3002" });
      n("barter_networks", "\u4EA4\u63DB\u7DB2", "eco", 2, ["cordage", "oral_tradition"], { caps: ["treaty:nonaggression"], d: "\u96C6\u56E3\u3069\u3046\u3057\u304C\u7523\u7269\u3092\u4EA4\u63DB\u3059\u308B\u3002" });
      n("trade_routes", "\u9577\u8DDD\u96E2\u4EA4\u6613", "eco", 3, ["barter_networks"], { caps: ["treaty:trade", "action:impose_sanctions"], fx: { trade: 0.1 }, d: "\u9060\u65B9\u3068\u306E\u5B9A\u671F\u7684\u306A\u4EA4\u6613\u8DEF\u3002" });
      n("markets", "\u5E02\u5834", "eco", 4, ["trade_routes", "record_keeping"], { pop: 1500, s: true, fx: { trade: 0.08, tax: 0.05 }, d: "\u5B9A\u671F\u30FB\u5E38\u8A2D\u306E\u5E02\u3002" });
      n("weights_measures", "\u5EA6\u91CF\u8861", "eco", 4, ["counting", "administration"], { fx: { trade: 0.04 }, d: "\u8A08\u91CF\u306E\u7D71\u4E00\u3002" });
      n("coinage", "\u8CA8\u5E63", "eco", 5, ["bronze", "weights_measures"], { pop: 2e3, caps: ["econ:coinage"], fx: { tax: 0.2, trade: 0.1 }, d: "\u4FA1\u5024\u3092\u4FDD\u8A3C\u3057\u305F\u91D1\u5C5E\u8CA8\u5E63\u3002" });
      n("banking", "\u91D1\u878D", "eco", 7, ["coinage", "mathematics"], { pop: 8e3, caps: ["econ:credit"], fx: { tax: 0.25, ind: 0.05 }, d: "\u9810\u304B\u308A\u30FB\u8CB8\u4ED8\u30FB\u70BA\u66FF\u3002" });
      n("credit_notes", "\u624B\u5F62\u30FB\u4FE1\u7528", "eco", 7, ["banking", "writing"], { fx: { trade: 0.08 }, d: "\u9060\u9694\u306E\u6C7A\u6E08\u3002" });
      n("joint_stock", "\u682A\u5F0F\u4F1A\u793E", "eco", 8, ["banking", "law"], { fx: { ind: 0.1 }, d: "\u51FA\u8CC7\u8005\u304C\u6709\u9650\u306E\u8CAC\u4EFB\u3067\u4E8B\u696D\u3092\u5171\u6709\u3059\u308B\u3002" });
      n("insurance", "\u4FDD\u967A", "eco", 9, ["banking", "statistics"], { fx: { trade: 0.05 }, d: "\u5371\u967A\u3092\u5E83\u304F\u5206\u6563\u3059\u308B\u3002" });
      n("central_bank", "\u4E2D\u592E\u9280\u884C", "eco", 10, ["banking", "bureaucracy", "statistics"], { fx: { tax: 0.05 }, d: "\u901A\u8CA8\u3068\u4FE1\u7528\u306E\u7BA1\u7406\u3002" });
      n("hunting_weapons", "\u72E9\u731F\u5177", "mil", 1, ["hafted_tools"], { fx: { off: 0.02 }, d: "\u6295\u69CD\u30FB\u7F60\u3002" });
      n("bow", "\u5F13", "mil", 2, ["hafted_tools", "cordage"], { caps: ["unit:ranged"], fx: { off: 0.03 }, d: "\u5F13\u77E2\u3002" });
      n("bronze_weapons", "\u9752\u9285\u6B66\u5668", "mil", 3, ["bronze"], { caps: ["unit:ranged"], fx: { off: 0.2 }, d: "\u9752\u9285\u306E\u5263\u30FB\u69CD\u30FB\u93C3\u3002" });
      n("chariot", "\u6226\u8ECA", "mil", 4, ["wheel", "horse_riding", "bronze_weapons"], { fx: { off: 0.1 }, d: "\u99AC\u306B\u5F15\u304B\u305B\u308B\u6226\u95D8\u7528\u306E\u8ECA\u3002" });
      n("cavalry", "\u9A0E\u5175", "mil", 4, ["horse_riding", "bronze_weapons"], { caps: ["unit:cavalry"], fx: { off: 0.3 }, d: "\u9A0E\u4E57\u6226\u95D8\u90E8\u968A\u3002" });
      n("iron_weapons", "\u9244\u6B66\u5668", "mil", 5, ["iron", "bronze_weapons"], { fx: { off: 0.35 }, d: "\u9244\u306E\u5263\u30FB\u69CD\u30FB\u93A7\u3002" });
      n("siege_engines", "\u653B\u57CE\u5175\u5668", "mil", 5, ["iron_weapons", "construction"], { fx: { off: 0.05 }, d: "\u7834\u57CE\u69CC\u30FB\u6295\u77F3\u6A5F\u3002" });
      n("standing_army", "\u5E38\u5099\u8ECD", "mil", 6, ["administration", "iron_weapons", "tax_system"], { fx: { off: 0.08, def: 0.04 }, d: "\u5E73\u6642\u306B\u3082\u7DAD\u6301\u3055\u308C\u308B\u8077\u696D\u8ECD\u3002" });
      n("military_logistics", "\u5175\u7AD9", "mil", 6, ["roads", "administration"], { d: "\u88DC\u7D66\u306E\u7D44\u7E54\u5316\u3002\u9060\u3044\u6226\u5834\u3078\u8ECD\u3092\u9001\u308C\u308B\u3002", caps: ["war:far"] });
      n("naval_warfare", "\u6D77\u6226\u8853", "mil", 6, ["shipbuilding", "iron_weapons"], { caps: ["war:naval"], fx: { off: 0.05 }, d: "\u8266\u968A\u306E\u7DE8\u6210\u3068\u885D\u89D2\u30FB\u63A5\u8237\u6226\u3002" });
      n("gunpowder", "\u706B\u85AC", "mil", 7, ["steel", "mathematics", "chemistry"], { pop: 8e3, caps: ["unit:firearms"], fx: { off: 0.8 }, d: "\u9ED2\u8272\u706B\u85AC\u3002" });
      n("firearms", "\u9283", "mil", 8, ["gunpowder", "precision_tools"], { fx: { off: 0.1 }, d: "\u706B\u7E04\u9283\u304B\u3089\u71E7\u767A\u9283\u3078\u3002" });
      n("artillery", "\u706B\u7832", "mil", 8, ["gunpowder", "bellows"], { fx: { off: 0.1, def: 0.03 }, d: "\u5927\u7832\u306B\u3088\u308B\u57CE\u653B\u3081\u3068\u91CE\u6226\u3002" });
      n("rifled_arms", "\u65BD\u6761\u9283", "mil", 9, ["firearms", "precision_tools"], { fx: { off: 0.1 }, d: "\u547D\u4E2D\u7CBE\u5EA6\u306E\u9AD8\u3044\u5C0F\u9283\u3002" });
      n("mechanized_warfare", "\u6A5F\u68B0\u5316\u6226", "mil", 11, ["motor_vehicle", "steel", "standing_army"], { caps: ["unit:armor"], fx: { off: 0.2 }, d: "\u8ECA\u4E21\u30FB\u7121\u7DDA\u3092\u7528\u3044\u308B\u8ECD\u3002" });
      n("mining", "\u63A1\u9271", "ind", 3, ["bronze", "construction"], { pop: 500, d: "\u5751\u9053\u3092\u6398\u308A\u9271\u77F3\u3092\u5F97\u308B\u3002", fx: { ind: 0.05 } });
      n("waterwheel", "\u6C34\u8ECA", "ind", 4, ["construction", "wheel"], { cond: "water", fx: { ind: 0.1 }, d: "\u6C34\u306E\u529B\u3067\u633D\u304F\u30FB\u53E9\u304F\u3002" });
      n("windmill", "\u98A8\u8ECA", "ind", 6, ["waterwheel"], { fx: { ind: 0.06 }, d: "\u98A8\u306E\u529B\u3002" });
      n("coal_mining", "\u77F3\u70AD\u63A1\u6398", "ind", 7, ["mining", "bellows"], { cond: "coal", pop: 6e3, fx: { ind: 0.1 }, d: "\u77F3\u70AD\u3092\u71C3\u6599\u3068\u3059\u308B\u3002" });
      n("steam_engine", "\u84B8\u6C17\u6A5F\u95A2", "ind", 8, ["coal_mining", "precision_tools"], { pop: 15e3, fx: { ind: 0.25 }, d: "\u71B1\u3092\u52D5\u529B\u306B\u5909\u3048\u308B\u3002" });
      n("industry", "\u6A5F\u68B0\u5DE5\u696D", "ind", 9, ["steel", "steam_engine", "banking"], { pop: 2e4, fx: { ind: 0.5 }, d: "\u5DE5\u5834\u3068\u6A5F\u68B0\u306B\u3088\u308B\u5927\u91CF\u751F\u7523\u3002" });
      n("electricity", "\u96FB\u6C17", "ind", 10, ["industry"], { pop: 4e4, fx: { ind: 0.3 }, d: "\u767A\u96FB\u3068\u96FB\u52D5\u6A5F\u3002" });
      n("internal_combustion", "\u5185\u71C3\u6A5F\u95A2", "ind", 10, ["industry", "chemistry"], { fx: { ind: 0.15 }, d: "\u77F3\u6CB9\u3092\u71C3\u6599\u3068\u3059\u308B\u5C0F\u578B\u306E\u52D5\u529B\u3002" });
      n("petroleum", "\u77F3\u6CB9", "ind", 10, ["chemistry", "mining"], { cond: "coal", d: "\u77F3\u6CB9\u306E\u63A1\u6398\u3068\u7CBE\u88FD\u3002", fx: { ind: 0.1 } });
      n("electric_grid", "\u9001\u96FB\u7DB2", "ind", 11, ["electricity", "industry"], { fx: { ind: 0.2 }, d: "\u96FB\u529B\u3092\u5E83\u57DF\u306B\u914D\u308B\u3002" });
      n("nuclear", "\u6838", "ind", 11, ["electricity", "calculus"], { pop: 1e5, caps: ["action:nuclear_program"], fx: { ind: 0.1 }, d: "\u539F\u5B50\u6838\u306E\u30A8\u30CD\u30EB\u30AE\u30FC\u3002" });
      {
        const by = new Map(nodes.map((x) => [x.id, x])), memo2 = /* @__PURE__ */ new Map(), colOf = (id, seen = /* @__PURE__ */ new Set()) => {
          if (memo2.has(id)) return memo2.get(id);
          if (seen.has(id)) throw new Error("\u6280\u8853\u30C4\u30EA\u30FC\u306B\u5FAA\u74B0\u304C\u3042\u308B: " + id);
          seen.add(id);
          const t = by.get(id);
          let c = t.stage;
          for (const p of t.prereq) c = Math.max(c, colOf(p, seen) + 1);
          memo2.set(id, c);
          return c;
        };
        for (const t of nodes) t.col = colOf(t.id);
      }
      TREE = Object.freeze(nodes.map((x) => Object.freeze(x)));
      COLS = Math.max(...nodes.map((x) => x.col)) + 1;
      NODE = Object.freeze(Object.fromEntries(TREE.map((x) => [x.id, x])));
      LANE = Object.freeze(Object.fromEntries(LANES.map((l) => [l.id, l])));
    }
  });

  // js/core/civ/tech.js
  var tech_exports = {};
  __export(tech_exports, {
    ACTION_CAP: () => ACTION_CAP,
    COLS: () => COLS,
    COND: () => COND,
    LANES: () => LANES,
    POLITY_CAP: () => POLITY_CAP,
    TECH: () => TECH,
    TECHS: () => TECHS,
    TREATY_CAP: () => TREATY_CAP,
    accel: () => accel,
    adoptable: () => adoptable,
    available: () => available,
    capsOf: () => capsOf,
    capsOfTech: () => capsOfTech,
    conditionsMet: () => conditionsMet,
    emergenceRate: () => emergenceRate,
    fxOf: () => fxOf,
    fxSum: () => fxSum,
    fxSumGroup: () => fxSumGroup,
    gateReason: () => gateReason,
    groupCaps: () => groupCaps,
    impactOf: () => impactOf,
    knownStats: () => knownStats,
    layoutGrid: () => layoutGrid,
    learnBonus: () => learnBonus,
    learnByAnnexation: () => learnByAnnexation,
    missingPrereqs: () => missingPrereqs,
    pEmerge: () => pEmerge,
    prereqOf: () => prereqOf,
    refreshCand: () => refreshCand,
    resMaskOf: () => resMaskOf,
    stateCan: () => stateCan,
    stepTech: () => stepTech,
    techCoverage: () => techCoverage,
    techFunction: () => techFunction,
    techsFor: () => techsFor,
    u01: () => u01,
    validateTree: () => validateTree,
    worldDepth: () => worldDepth
  });
  function resMaskOf(w, g) {
    const cells = g.cells ?? [g.cell], c = maskCache.get(g);
    if (c && c.n === cells.length && c.c0 === cells[0]) return c.m;
    let m = 0;
    for (const x of cells) m |= w.cell.resource[x];
    maskCache.set(g, { n: cells.length, c0: cells[0], m });
    return m;
  }
  function knownStats(g, civ3 = null) {
    if (!g.tech.cand) refreshCand(g, civ3);
    const c = g.tech.cand;
    let m = memo.get(c);
    if (!m) {
      let n2 = 0, l = 0;
      for (const k in g.tech.known) {
        n2++;
        const t = TECH[k];
        if (t) l += fxOf(civ3, t).learn ?? 0;
      }
      m = { n: n2, l };
      memo.set(c, m);
    }
    return m;
  }
  function emergenceRate(world, civ3, g, t, env) {
    if (!conditionsMet(world, g, t)) return 0;
    const st2 = g.stateId ? civ3.states[g.stateId] : null, base = 1 / (t.E * (g.tech.lost[t.key] ? 1 / REDISCOVER : 1));
    const popF = Math.min(2.5, Math.sqrt(g.pop / Math.max(60, t.minPop || 60))), known = knownStats(g, civ3).n;
    const knowF = 0.7 + 0.5 * Math.min(1, known / 30), contactF = 1 + 0.2 * Math.min(4, env.contact ?? 0);
    const urbanF = g.settlementId ? stageMult[civ3.settlements[g.settlementId]?.stage] ?? 1 : 0.85, econF = (st2 ? 1.2 : 1) * (1 + (st2?.econ?.techBoost ?? 0)), learnF = 1 + learnFx(g, civ3, st2);
    const compF = 1 + (st2?.warIds?.length ? 0.12 : 0) + 0.06 * Math.min(3, env.rivals ?? 0);
    return base * popF * knowF * contactF * urbanF * econF * learnF * compF * env.accel * (env.norm ?? 1);
  }
  function stepTech(ctx) {
    const { world, civ: civ3, ids } = ctx, mi = civ3.monthIndex, period = Math.floor(mi / PERIOD), yrs = PERIOD / 12;
    let worldPop = 0, nG = 0;
    for (const id in civ3.groups) {
      worldPop += civ3.groups[id].pop;
      nG++;
    }
    const A2 = accel(civ3, worldPop), norm2 = Math.min(6, REF_GROUPS / Math.max(150, nG));
    for (const id in civ3.groups) {
      const g = civ3.groups[id];
      if ((hashSeed(id) + mi) % PERIOD !== 0) continue;
      const k = g.tech.known, d = dominant(g), st2 = g.stateId ? civ3.states[g.stateId] : null;
      if (!g.tech.cand) refreshCand(g, civ3);
      const ns = [...neighborGroups(ctx, g)], env = { accel: A2, norm: norm2, contact: (() => {
        const mine = knownStats(g, civ3).n;
        let c = 0;
        for (const o of ns) {
          const og = civ3.groups[o];
          if (og?.tech.known && knownStats(og, civ3).n >= mine) c++;
        }
        return c;
      })(), rivals: st2 ? new Set(ns.map((o) => civ3.groups[o]?.stateId).filter((s) => s && s !== st2.id)).size : 0 };
      for (const key of [...g.tech.cand]) {
        const t = TECH[key], rate = emergenceRate(world, civ3, g, t, env);
        if (rate <= 0 || u01(civ3, "tech", period, id, key) >= pEmerge(rate, yrs)) continue;
        const r = resolve(civ3, g, key, mi, "independent");
        if (r.first || r.wasLost) makeEvent(civ3, ids, { kind: r.wasLost ? "tech_rediscovered" : "tech_discovered", title: `${t.name}\u3092${r.wasLost ? "\u518D\u767A\u898B" : "\u521D\u3081\u3066\u767A\u898B"}`, participants: [{ entityId: g.id, role: "discoverer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
      }
      if (ns.length && u01(civ3, "contact", period, id) < 0.09) {
        const o = civ3.groups[ns[Math.floor(u01(civ3, "contactpick", period, id) * ns.length)]];
        if (o) {
          const cand3 = TECHS.filter((t) => o.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ3, t).every((p) => k[p] != null) && conditionsMet(world, g, t));
          if (cand3.length) {
            const t = cand3[Math.floor(u01(civ3, "contacttech", period, id) * cand3.length)], same = (dominant(o).cultureId === d.cultureId ? 0.15 : 0) + (o.stateId && o.stateId === g.stateId ? 0.2 : 0);
            if (u01(civ3, "contactacc", period, id) < 0.25 + same) resolve(civ3, g, t.key, mi, "contact");
          }
        }
      }
      if (st2 && mi % 12 === hashSeed(id) % 12 && st2.capitalGroupId !== id) {
        const cap = civ3.groups[st2.capitalGroupId], boost = learnBonus(civ3, st2);
        if (cap && boost > 0) {
          const cand3 = TECHS.filter((t) => cap.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ3, t).every((p) => k[p] != null) && conditionsMet(world, g, t));
          if (cand3.length && u01(civ3, "teach", mi, id) < Math.min(0.6, boost * 2)) resolve(civ3, g, cand3[Math.floor(u01(civ3, "teachpick", mi, id) * cand3.length)].key, mi, "teaching");
        }
      }
      if (u01(civ3, "loss", period, id) < 3e-3) {
        for (const t of TECHS) if (k[t.key] != null && t.minPop > 0 && g.pop < t.minPop * 0.5) {
          if (TECHS.some((u) => k[u.key] != null && prereqOf(civ3, u).includes(t.key) && u.col >= t.col)) continue;
          forget(g, t.key, civ3);
          if (g.id === st2?.capitalGroupId) makeEvent(civ3, ids, { kind: "tech_lost", title: `${t.name}\u306E\u77E5\u8B58\u304C\u5931\u308F\u308C\u305F`, participants: [{ entityId: g.id, role: "holder" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: mi, after: null }] });
          break;
        }
      }
    }
    if (mi % 12 === 6) tradeTransfer(ctx);
  }
  function tradeTransfer(ctx) {
    const { world, civ: civ3 } = ctx, mi = civ3.monthIndex;
    for (const tid of civ3.activeTreatyIds) {
      const tr = civ3.treaties[tid];
      if (!tr || tr.type !== "trade") continue;
      const a = civ3.states[tr.a], b = civ3.states[tr.b];
      if (!a?.alive || !b?.alive) continue;
      for (const [from, to, tag] of [[a, b, "ab"], [b, a, "ba"]]) {
        const gf = civ3.groups[from.capitalGroupId], gt = civ3.groups[to.capitalGroupId];
        if (!gf || !gt) continue;
        const cand3 = TECHS.filter((t) => gf.tech.known[t.key] != null && gt.tech.known[t.key] == null && prereqOf(civ3, t).every((p) => gt.tech.known[p] != null) && conditionsMet(world, gt, t));
        if (cand3.length && u01(civ3, "trade", mi, tid, tag) < 0.25) resolve(civ3, gt, cand3[Math.floor(u01(civ3, "tradepick", mi, tid, tag) * cand3.length)].key, mi, "trade");
      }
    }
  }
  function learnByAnnexation(ctx, state, group) {
    const { world, civ: civ3 } = ctx, cap = civ3.groups[state.capitalGroupId];
    if (!cap) return 0;
    let n2 = 0, mi = civ3.monthIndex;
    for (const t of TECHS) if (cap.tech.known[t.key] != null && group.tech.known[t.key] == null && prereqOf(civ3, t).every((p) => group.tech.known[p] != null) && conditionsMet(world, group, t) && u01(civ3, "annex", mi, group.id, t.key) < 0.35) {
      resolve(civ3, group, t.key, mi, "conquest");
      n2++;
    }
    return n2;
  }
  function techCoverage(groups, key) {
    let tot = 0, have = 0;
    for (const g of groups) {
      tot += g.pop;
      if (g.tech.known[key] != null) have += g.pop;
    }
    return tot ? have / tot : 0;
  }
  function adoptable(ctx, state, groups) {
    let total = 0;
    const have = {};
    for (const g of groups) {
      total += g.pop;
      for (const key in g.tech.known) have[key] = (have[key] ?? 0) + g.pop;
    }
    return TECHS.filter((t) => t.cost > 0 && state.techAdopted[t.key] == null && (have[t.key] ?? 0) >= total * 0.3).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1));
  }
  function capsOf(civ3, st2) {
    const n2 = Object.keys(st2.techAdopted).length, c = capCache.get(st2);
    if (c && c.n === n2 && c.o === (civ3?.techOverrides ? 1 : 0)) return c.set;
    const set = /* @__PURE__ */ new Set();
    for (const k in st2.techAdopted) {
      const t = TECH[k];
      if (t) for (const x of capsOfTech(civ3, t)) set.add(x);
    }
    capCache.set(st2, { n: n2, o: civ3?.techOverrides ? 1 : 0, set });
    return set;
  }
  function groupCaps(civ3, g) {
    const set = /* @__PURE__ */ new Set();
    for (const k in g.tech.known) {
      const t = TECH[k];
      if (t) for (const x of capsOfTech(civ3, t)) set.add(x);
    }
    return set;
  }
  function gateReason(civ3, st2, cap) {
    if (!cap || stateCan(civ3, st2, cap)) return null;
    const ts = techsFor(cap);
    return `\u6280\u8853\u300C${ts.map((t) => t.name).join("\u30FB")}\u300D\u3092\u5236\u5EA6\u5316\u3057\u3066\u3044\u306A\u3044`;
  }
  function techFunction(civ3, st2, key, groups = null) {
    const t = TECH[key];
    if (!t || !t.prereq.length) return 1;
    let f = 1;
    for (const p of prereqOf(civ3, t)) {
      if (st2.techAdopted[p] != null) continue;
      const cov = groups ? techCoverage(groups, p) : 0.5;
      f = Math.min(f, 0.35 + 0.65 * cov);
    }
    return f;
  }
  function fxSum(civ3, st2, field, groups = null) {
    let s = 0;
    for (const k in st2.techAdopted) {
      const t = TECH[k];
      if (!t) continue;
      const v = fxOf(civ3, t)[field];
      if (v) s += v * (groups ? techFunction(civ3, st2, k, groups) : 1);
    }
    return s;
  }
  function fxSumGroup(civ3, g, field) {
    let s = 0;
    for (const k in g.tech.known) {
      const t = TECH[k];
      if (!t) continue;
      const v = fxOf(civ3, t)[field];
      if (v) s += v;
    }
    return s;
  }
  function impactOf(civ3, key) {
    const deps = TECHS.filter((t) => prereqOf(civ3, t).includes(key)).map((t) => t.key);
    let holders = 0, adopters = 0;
    for (const id in civ3.groups) if (civ3.groups[id].tech.known[key] != null) holders++;
    for (const id in civ3.states) if (civ3.states[id].alive && civ3.states[id].techAdopted[key] != null) adopters++;
    return { dependents: deps, holders, adopters };
  }
  function missingPrereqs(civ3, g) {
    const out = [];
    for (const k in g.tech.known) {
      const t = TECH[k];
      if (!t) continue;
      for (const p of prereqOf(civ3, t)) if (g.tech.known[p] == null) out.push([k, p]);
    }
    return out;
  }
  var nearWater, maskCache, COND, tierOf, TECHS, TECH, BASE_KNOWLEDGE, REDISCOVER, POP_REF, REF_GROUPS, PERIOD, ovr, prereqOf, fxOf, capsOfTech, refreshCand, learn, forget, conditionsMet, available, worldDepth, accel, memo, lbCache, stateLearn, learnFx, stageMult, pEmerge, u01, resolve, learnBonus, capCache, stateCan, techsFor, ACTION_CAP, TREATY_CAP, POLITY_CAP;
  var init_tech = __esm({
    "js/core/civ/tech.js"() {
      init_events();
      init_cohorts();
      init_spatial();
      init_world_consts();
      init_civ_state();
      init_techtree();
      nearWater = (w, g) => w.cell.coastDist[g.cell] <= 2 || w.cell.river[g.cell];
      maskCache = /* @__PURE__ */ new WeakMap();
      COND = Object.freeze({
        water: { ja: "\u6C34\u8FBA\uFF08\u6D77\u30FB\u5DDD\u30FB\u6E56\uFF09", f: (w, g) => nearWater(w, g) },
        coast: { ja: "\u6D77\u5CB8", f: (w, g) => w.cell.coastDist[g.cell] <= 1 },
        fertile: { ja: "\u80A5\u6C83\u3067\u6C34\u306B\u8FD1\u304F\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u3044\u571F\u5730", f: (w, g) => w.cell.fertility[g.cell] > 0.45 && nearWater(w, g) && g.pressure > 0.6 },
        grass: { ja: "\u8349\u539F\u30FB\u30B5\u30D0\u30F3\u30CA\u3067\u4EBA\u53E3\u5727\u304C\u9AD8\u3044\u571F\u5730", f: (w, g) => (w.cell.biome[g.cell] === BIOMES2.GRASSLAND || w.cell.biome[g.cell] === BIOMES2.SAVANNA) && g.pressure > 0.7 },
        clay: { ja: "\u7C98\u571F\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.CLAY) !== 0 },
        cu_sn: { ja: "\u9285\u307E\u305F\u306F\u932B\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & (RES2.COPPER | RES2.TIN)) !== 0 },
        iron: { ja: "\u9244\u9271\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.IRON) !== 0 },
        coal: { ja: "\u77F3\u70AD\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.COAL) !== 0 },
        stone: { ja: "\u77F3\u6750\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.STONE) !== 0 }
      });
      tierOf = (col) => 1 + Math.floor(col / 3);
      TECHS = Object.freeze([...TREE].sort((a, b) => a.col - b.col).map((t) => Object.freeze({ key: t.id, name: t.ja, field: LANE[t.lane].ja, lane: t.lane, pre: t.pre, tier: tierOf(t.col), cost: t.id === "stone_tools" ? 0 : 1, prereq: t.prereq, minPop: t.pop, settled: t.s, condKey: t.cond, cond: t.cond ? COND[t.cond].f : null, E: t.E, caps: t.caps, fx: t.fx, col: t.col, desc: t.desc, why: t.why })));
      TECH = Object.freeze(Object.fromEntries(TECHS.map((t) => [t.key, t])));
      BASE_KNOWLEDGE = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
      REDISCOVER = 3.3;
      POP_REF = 6e5;
      REF_GROUPS = 1300;
      PERIOD = 3;
      ovr = (civ3, key) => civ3?.techOverrides?.[key] ?? null;
      prereqOf = (civ3, t) => ovr(civ3, t.key)?.prereq ?? t.prereq;
      fxOf = (civ3, t) => ovr(civ3, t.key)?.fx ?? t.fx;
      capsOfTech = (civ3, t) => ovr(civ3, t.key)?.caps ?? t.caps;
      refreshCand = (g, civ3 = null) => g.tech.cand = TECHS.filter((t) => g.tech.known[t.key] == null && prereqOf(civ3, t).every((p) => g.tech.known[p] != null)).map((t) => t.key);
      learn = (g, key, mi, civ3) => {
        g.tech.known[key] = mi;
        refreshCand(g, civ3);
        delete g.tech.prog[key];
        if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 1;
      };
      forget = (g, key, civ3) => {
        delete g.tech.known[key];
        refreshCand(g, civ3);
        g.tech.lost[key] = true;
        if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 0;
      };
      conditionsMet = (w, g, t) => g.pop >= t.minPop && (!t.settled || !!g.settlementId) && (!t.cond || t.cond(w, g));
      available = (w, g, t, civ3 = null) => g.tech.known[t.key] == null && prereqOf(civ3, t).every((p) => g.tech.known[p] != null) && conditionsMet(w, g, t);
      worldDepth = (civ3) => Math.min(1, Object.keys(civ3.techWorld).length / 45);
      accel = (civ3, worldPop) => Math.min(1.5, Math.max(0.2, worldPop / POP_REF)) * (0.35 + 1.65 * worldDepth(civ3));
      memo = /* @__PURE__ */ new WeakMap();
      lbCache = /* @__PURE__ */ new WeakMap();
      stateLearn = (civ3, st2) => {
        const c = lbCache.get(st2);
        if (c && civ3.monthIndex - c.mi < 6) return c.v;
        const v = learnBonus(civ3, st2);
        lbCache.set(st2, { mi: civ3.monthIndex, v });
        return v;
      };
      learnFx = (g, civ3, st2) => knownStats(g, civ3).l + (st2 ? stateLearn(civ3, st2) * 0.5 : 0);
      stageMult = { village: 1, town: 1.3, city: 1.8 };
      pEmerge = (rate, years) => 1 - Math.exp(-rate * years);
      u01 = (civ3, ...parts) => hashSeed(civ3.historySeed, ...parts) / 4294967296;
      resolve = (civ3, g, key, mi, how) => {
        var _a;
        const prior = civ3.techWorld[key], wasLost = !!g.tech.lost[key];
        learn(g, key, mi, civ3);
        delete g.tech.lost[key];
        const rec = (_a = civ3.techWorld)[key] ?? (_a[key] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} });
        if (!prior || !prior.discoveries) {
          rec.discoveries = rec.discoveries ?? [];
          rec.first = rec.first ?? mi;
          rec.independent = rec.independent ?? 0;
          rec.spread = rec.spread ?? 0;
          rec.byChannel = rec.byChannel ?? {};
        }
        if (how === "independent") rec.independent++;
        else {
          rec.spread++;
          rec.byChannel[how] = (rec.byChannel[how] ?? 0) + 1;
        }
        return { first: !prior, wasLost };
      };
      learnBonus = (civ3, st2) => {
        let s = 0;
        for (const k in st2.techAdopted) s += fxOf(civ3, TECH[k] ?? { key: k, fx: {} }).learn ?? 0;
        return s;
      };
      capCache = /* @__PURE__ */ new WeakMap();
      stateCan = (civ3, st2, cap) => capsOf(civ3, st2).has(cap);
      techsFor = (cap) => TECHS.filter((t) => t.caps.includes(cap));
      ACTION_CAP = Object.freeze({ found_city: "action:found_city", build_fortification: "action:build_fortification", impose_sanctions: "action:impose_sanctions", covert_op: "action:covert_op", nuclear_program: "action:nuclear_program" });
      TREATY_CAP = Object.freeze({ nonaggression: "treaty:nonaggression", alliance: "treaty:alliance", trade: "treaty:trade" });
      POLITY_CAP = Object.freeze({ tribal: null, chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" });
    }
  });

  // js/core/world/sphere-mesh.js
  var MESH_VERSION = "sphere-ico-1";
  var cellCountForFrequency = (n2) => 10 * n2 * n2 + 2;
  var frequencyForCells = (target) => Math.max(1, Math.round(Math.sqrt((target - 2) / 10)));
  var PHI = (1 + Math.sqrt(5)) / 2;
  function baseIcosahedron() {
    const raw = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const a = norm(raw[0]);
    let u = cross([0, 0, 1], a), s = Math.hypot(...u);
    const verts = raw.map(norm);
    if (s > 1e-12) {
      u = u.map((v) => v / s);
      const ang = Math.acos(Math.min(1, Math.max(-1, a[2]))), c = Math.cos(ang), sn = Math.sin(ang);
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i], k = cross(u, v), d = dot(u, v);
        verts[i] = [v[0] * c + k[0] * sn * -1 + u[0] * d * (1 - c), v[1] * c + k[1] * sn * -1 + u[1] * d * (1 - c), v[2] * c + k[2] * sn * -1 + u[2] * d * (1 - c)];
      }
    }
    const fixed = faces.map(([p, q2, r]) => {
      const A2 = verts[p], B = verts[q2], C = verts[r];
      return dot(cross(sub(B, A2), sub(C, A2)), A2) >= 0 ? [p, q2, r] : [p, r, q2];
    });
    return { verts, faces: fixed };
  }
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function buildSphereMesh(n2) {
    if (!Number.isInteger(n2) || n2 < 1) throw new Error("\u5468\u6CE2\u6570 n \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570");
    const { verts: bv, faces } = baseIcosahedron();
    const V = cellCountForFrequency(n2), T3 = 20 * n2 * n2;
    const centerXYZ = new Float32Array(3 * V);
    for (let i = 0; i < 12; i++) {
      centerXYZ[3 * i] = bv[i][0];
      centerXYZ[3 * i + 1] = bv[i][1];
      centerXYZ[3 * i + 2] = bv[i][2];
    }
    const edgeBase = /* @__PURE__ */ new Map();
    let nextEdge = 12;
    const interiorPerFace = (n2 - 1) * (n2 - 2) / 2, faceBase0 = 12 + 30 * (n2 - 1);
    const rowStart = new Int32Array(n2 + 1);
    for (let i = 1, acc = 0; i <= n2 - 2; i++) {
      rowStart[i] = acc;
      acc += n2 - 1 - i;
    }
    const tmp = [0, 0, 0];
    const place = (id, a, b, c, wa, wb, wc) => {
      tmp[0] = a[0] * wa + b[0] * wb + c[0] * wc;
      tmp[1] = a[1] * wa + b[1] * wb + c[1] * wc;
      tmp[2] = a[2] * wa + b[2] * wb + c[2] * wc;
      const l = Math.hypot(tmp[0], tmp[1], tmp[2]);
      centerXYZ[3 * id] = tmp[0] / l;
      centerXYZ[3 * id + 1] = tmp[1] / l;
      centerXYZ[3 * id + 2] = tmp[2] / l;
    };
    const tri = new Uint32Array(3 * T3);
    let tp = 0;
    const gid = new Int32Array((n2 + 1) * (n2 + 1));
    for (let f = 0; f < 20; f++) {
      const [fa, fb, fc] = faces[f], A2 = bv[fa], B = bv[fb], C = bv[fc], ids = [fa, fb, fc];
      for (let i = 0; i <= n2; i++) for (let j = 0; i + j <= n2; j++) {
        const k = n2 - i - j, w = [k, i, j];
        let id;
        const zeros = (k === 0 ? 1 : 0) + (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0);
        if (zeros === 2) id = ids[k === n2 ? 0 : i === n2 ? 1 : 2];
        else if (zeros === 1) {
          const slots = [0, 1, 2].filter((s) => w[s] > 0), u = ids[slots[0]], v = ids[slots[1]];
          const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 12 + hi;
          let base = edgeBase.get(key);
          if (base === void 0) {
            base = nextEdge;
            nextEdge += n2 - 1;
            edgeBase.set(key, base);
          }
          const wLo = u === lo ? w[slots[0]] : w[slots[1]];
          id = base + (wLo - 1);
          if (!(centerXYZ[3 * id] || centerXYZ[3 * id + 1] || centerXYZ[3 * id + 2])) place(id, A2, B, C, k, i, j);
        } else {
          id = faceBase0 + f * interiorPerFace + rowStart[i] + (j - 1);
          place(id, A2, B, C, k, i, j);
        }
        gid[i * (n2 + 1) + j] = id;
      }
      for (let i = 0; i < n2; i++) for (let j = 0; i + j < n2; j++) {
        const p = gid[i * (n2 + 1) + j], q2 = gid[(i + 1) * (n2 + 1) + j], r = gid[i * (n2 + 1) + j + 1];
        tri[tp++] = p;
        tri[tp++] = q2;
        tri[tp++] = r;
        if (i + j < n2 - 1) {
          const s = gid[(i + 1) * (n2 + 1) + j + 1];
          tri[tp++] = q2;
          tri[tp++] = s;
          tri[tp++] = r;
        }
      }
    }
    if (tp !== 3 * T3) throw new Error(`\u4E09\u89D2\u5F62\u306E\u6570\u304C\u5408\u308F\u306A\u3044: ${tp / 3} != ${T3}`);
    {
      const a = tri[0] * 3, b = tri[1] * 3, c = tri[2] * 3, P2 = [centerXYZ[a], centerXYZ[a + 1], centerXYZ[a + 2]];
      const Q = [centerXYZ[b], centerXYZ[b + 1], centerXYZ[b + 2]], R = [centerXYZ[c], centerXYZ[c + 1], centerXYZ[c + 2]];
      if (dot(cross(sub(Q, P2), sub(R, P2)), P2) < 0) for (let t = 0; t < T3; t++) {
        const x = tri[3 * t + 1];
        tri[3 * t + 1] = tri[3 * t + 2];
        tri[3 * t + 2] = x;
      }
    }
    const deg = new Uint32Array(V + 1);
    for (let t = 0; t < 3 * T3; t++) deg[tri[t] + 1]++;
    const offs = new Uint32Array(V + 1);
    for (let i = 0; i < V; i++) offs[i + 1] = offs[i] + deg[i + 1];
    const fill = new Uint32Array(V), sV = new Uint32Array(3 * T3), sW = new Uint32Array(3 * T3), sT = new Uint32Array(3 * T3);
    for (let t = 0; t < T3; t++) for (let r = 0; r < 3; r++) {
      const u = tri[3 * t + r], v = tri[3 * t + (r + 1) % 3], w = tri[3 * t + (r + 2) % 3], s = offs[u] + fill[u]++;
      sV[s] = v;
      sW[s] = w;
      sT[s] = t;
    }
    const neighborIds = new Uint32Array(3 * T3), cellVertexIds = new Uint32Array(3 * T3);
    for (let u = 0; u < V; u++) {
      const s0 = offs[u], e0 = offs[u + 1], d = e0 - s0;
      let cur = s0;
      for (let k = 0; k < d; k++) {
        neighborIds[s0 + k] = sV[cur];
        cellVertexIds[s0 + k] = sT[cur];
        const want = sW[cur];
        let nx = -1;
        for (let s = s0; s < e0; s++) if (sV[s] === want) {
          nx = s;
          break;
        }
        if (nx < 0) throw new Error(`\u9802\u70B9 ${u} \u306E\u5468\u308A\u304C\u9589\u3058\u3066\u3044\u306A\u3044`);
        cur = nx;
      }
    }
    const vertexXYZ = new Float32Array(3 * T3);
    for (let t = 0; t < T3; t++) {
      const a = tri[3 * t] * 3, b = tri[3 * t + 1] * 3, c = tri[3 * t + 2] * 3;
      const x = centerXYZ[a] + centerXYZ[b] + centerXYZ[c], y = centerXYZ[a + 1] + centerXYZ[b + 1] + centerXYZ[c + 1], z = centerXYZ[a + 2] + centerXYZ[b + 2] + centerXYZ[c + 2], l = Math.hypot(x, y, z);
      vertexXYZ[3 * t] = x / l;
      vertexXYZ[3 * t + 1] = y / l;
      vertexXYZ[3 * t + 2] = z / l;
    }
    return { meshVersion: MESH_VERSION, n: n2, cellCount: V, triangleCount: T3, centerXYZ, neighborOffsets: offs, neighborIds, vertexXYZ, cellVertexOffsets: offs, cellVertexIds };
  }
  function greatCircleRad(ax, ay, az, bx, by, bz) {
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
  }
  function sphericalTriangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const triple = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
    return 2 * Math.atan2(Math.abs(triple), den);
  }
  function cellArea(mesh, c) {
    const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1], cx = mesh.centerXYZ[3 * c], cy = mesh.centerXYZ[3 * c + 1], cz = mesh.centerXYZ[3 * c + 2];
    let a = 0;
    for (let k = s; k < e; k++) {
      const p = mesh.cellVertexIds[k], q2 = mesh.cellVertexIds[k + 1 < e ? k + 1 : s];
      a += sphericalTriangleArea(cx, cy, cz, mesh.vertexXYZ[3 * p], mesh.vertexXYZ[3 * p + 1], mesh.vertexXYZ[3 * p + 2], mesh.vertexXYZ[3 * q2], mesh.vertexXYZ[3 * q2 + 1], mesh.vertexXYZ[3 * q2 + 2]);
    }
    return a;
  }
  function meshHash(mesh) {
    let h2 = 2166136261;
    const mix = (v) => {
      h2 ^= v & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 8 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 16 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 24 & 255;
      h2 = Math.imul(h2, 16777619);
    };
    for (let i = 0; i < mesh.centerXYZ.length; i++) mix(Math.round(mesh.centerXYZ[i] * 1e6) | 0);
    for (let i = 0; i < mesh.neighborIds.length; i++) mix(mesh.neighborIds[i]);
    return (h2 >>> 0).toString(16).padStart(8, "0");
  }

  // js/core/world/spec.js
  var GENERATOR_VERSION = "4.0.0-alpha.1";
  var WORLD_SPEC_SCHEMA = 1;
  var ISLAND_MODES = Object.freeze({ few: 12, normal: 40, many: 90 });
  var DEFAULT_WORLD_SPEC = Object.freeze({
    schemaVersion: WORLD_SPEC_SCHEMA,
    generatorVersion: GENERATOR_VERSION,
    worldSeed: "",
    planet: Object.freeze({ radiusKm: 6371, displayProjection: "equirectangular" }),
    resolution: Object.freeze({ targetCells: 25e4 }),
    landFraction: 0.3,
    // v6.1.0: 0.5 → 0.3（地球の陸地率は約 29%）。海を渡る拡散を直したので、地球並みでも人類は全大陸に広がる
    continentCountTarget: 6,
    islandMode: "many",
    plateCount: 14,
    initialGroups: 12,
    climateModel: Object.freeze({ fantasyAdjustment: "default", lapseRateCPerKm: 6.5, windMoistureLengthKm: 4500 })
  });
  var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function normalizeWorldSpec(input = {}) {
    const errors = [], d = DEFAULT_WORLD_SPEC, i = isObj(input) ? input : {};
    const num2 = (v, def, lo, hi, name, int = false) => {
      if (v === void 0) return def;
      if (typeof v !== "number" || !Number.isFinite(v) || int && !Number.isInteger(v) || v < lo || v > hi) {
        errors.push(`${name} \u306F ${lo}\u301C${hi}${int ? " \u306E\u6574\u6570" : ""}\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(v)}\uFF09`);
        return def;
      }
      return v;
    };
    const spec = {
      schemaVersion: WORLD_SPEC_SCHEMA,
      generatorVersion: typeof i.generatorVersion === "string" ? i.generatorVersion : GENERATOR_VERSION,
      worldSeed: typeof i.worldSeed === "string" ? i.worldSeed : i.worldSeed === void 0 ? "" : String(i.worldSeed),
      planet: {
        radiusKm: num2(i.planet?.radiusKm, d.planet.radiusKm, 500, 1e5, "planet.radiusKm"),
        displayProjection: i.planet?.displayProjection ?? d.planet.displayProjection
      },
      resolution: { targetCells: num2(i.resolution?.targetCells, d.resolution.targetCells, 500, 1e6, "resolution.targetCells", true) },
      landFraction: num2(i.landFraction, d.landFraction, 0.1, 0.9, "landFraction"),
      continentCountTarget: num2(i.continentCountTarget, d.continentCountTarget, 1, 12, "continentCountTarget", true),
      islandMode: i.islandMode ?? d.islandMode,
      plateCount: num2(i.plateCount, d.plateCount, 4, 40, "plateCount", true),
      initialGroups: num2(i.initialGroups, d.initialGroups, 1, 64, "initialGroups", true),
      climateModel: {
        fantasyAdjustment: i.climateModel?.fantasyAdjustment ?? d.climateModel.fantasyAdjustment,
        lapseRateCPerKm: num2(i.climateModel?.lapseRateCPerKm, d.climateModel.lapseRateCPerKm, 0, 15, "climateModel.lapseRateCPerKm"),
        windMoistureLengthKm: num2(i.climateModel?.windMoistureLengthKm, d.climateModel.windMoistureLengthKm, 200, 1e4, "climateModel.windMoistureLengthKm")
      }
    };
    if (!spec.worldSeed) errors.push("worldSeed \u304C\u7A7A\uFF08\u30B7\u30FC\u30C9\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u751F\u6210\u3059\u308B\u5834\u5408\u306F makeWorldSeed \u3092\u4F7F\u3046\uFF09");
    if (!(spec.islandMode in ISLAND_MODES)) {
      errors.push(`islandMode \u306F ${Object.keys(ISLAND_MODES).join("/")} \u306E\u3044\u305A\u308C\u304B`);
      spec.islandMode = d.islandMode;
    }
    if (spec.planet.displayProjection !== "equirectangular") errors.push("displayProjection \u306F\u73FE\u5728 equirectangular \u306E\u307F");
    if (isObj(input) && input.schemaVersion !== void 0 && input.schemaVersion !== WORLD_SPEC_SCHEMA) errors.push(`schemaVersion ${input.schemaVersion} \u306F\u672A\u5BFE\u5FDC`);
    return { spec, errors };
  }

  // js/core/world/noise.js
  function hashString(str) {
    let h2 = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h2 = Math.imul(h2 ^ str.charCodeAt(i), 3432918353);
      h2 = h2 << 13 | h2 >>> 19;
    }
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
    h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909);
    return (h2 ^ h2 >>> 16) >>> 0;
  }
  function makeRng(seedStr, stage = "") {
    let a = hashString(`${seedStr}::${stage}`);
    const next = () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
    next.unitVec = () => {
      const z = next.range(-1, 1), t = next.range(0, 2 * Math.PI), r = Math.sqrt(1 - z * z);
      return [r * Math.cos(t), r * Math.sin(t), z];
    };
    return next;
  }
  function hash3(seed, x, y, z) {
    let h2 = seed ^ Math.imul(x, 668265261) ^ Math.imul(y, 374761393) ^ Math.imul(z, 2654435761);
    h2 = Math.imul(h2 ^ h2 >>> 15, 2246822507);
    h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909);
    return ((h2 ^ h2 >>> 16) >>> 0) / 4294967296;
  }
  var fade = (t) => t * t * (3 - 2 * t);
  function valueNoise3(seed, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx3 = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
    const c000 = hash3(seed, xi, yi, zi), c100 = hash3(seed, xi + 1, yi, zi), c010 = hash3(seed, xi, yi + 1, zi), c110 = hash3(seed, xi + 1, yi + 1, zi);
    const c001 = hash3(seed, xi, yi, zi + 1), c101 = hash3(seed, xi + 1, yi, zi + 1), c011 = hash3(seed, xi, yi + 1, zi + 1), c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * fx3, x10 = c010 + (c110 - c010) * fx3, x01 = c001 + (c101 - c001) * fx3, x11 = c011 + (c111 - c011) * fx3;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }
  function fbm3(seed, x, y, z, octaves = 4, freq = 1, gain = 0.5) {
    let sum = 0, amp = 1, norm2 = 0, f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise3(seed + o * 101, x * f, y * f, z * f);
      norm2 += amp;
      amp *= gain;
      f *= 2.03;
    }
    return sum / norm2;
  }
  function makeFbm3(seed, octaves = 4, freq = 1, gain = 0.5) {
    const O = octaves, kx = new Int32Array(O).fill(2147483647), ky = new Int32Array(O), kz = new Int32Array(O), cv = new Float64Array(O * 8), fs = new Float64Array(O), sd = new Int32Array(O);
    let f = freq, norm2 = 0, amp = 1;
    const amps = new Float64Array(O);
    for (let o = 0; o < O; o++) {
      fs[o] = f;
      sd[o] = seed + o * 101;
      amps[o] = amp;
      norm2 += amp;
      amp *= gain;
      f *= 2.03;
    }
    return (x, y, z) => {
      let sum = 0;
      for (let o = 0; o < O; o++) {
        const X = x * fs[o], Y = y * fs[o], Z = z * fs[o], xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z), b = o * 8;
        if (xi !== kx[o] || yi !== ky[o] || zi !== kz[o]) {
          const s0 = sd[o];
          kx[o] = xi;
          ky[o] = yi;
          kz[o] = zi;
          cv[b] = hash3(s0, xi, yi, zi);
          cv[b + 1] = hash3(s0, xi + 1, yi, zi);
          cv[b + 2] = hash3(s0, xi, yi + 1, zi);
          cv[b + 3] = hash3(s0, xi + 1, yi + 1, zi);
          cv[b + 4] = hash3(s0, xi, yi, zi + 1);
          cv[b + 5] = hash3(s0, xi + 1, yi, zi + 1);
          cv[b + 6] = hash3(s0, xi, yi + 1, zi + 1);
          cv[b + 7] = hash3(s0, xi + 1, yi + 1, zi + 1);
        }
        const fx3 = fade(X - xi), fy = fade(Y - yi), fz = fade(Z - zi);
        const x00 = cv[b] + (cv[b + 1] - cv[b]) * fx3, x10 = cv[b + 2] + (cv[b + 3] - cv[b + 2]) * fx3, x01 = cv[b + 4] + (cv[b + 5] - cv[b + 4]) * fx3, x11 = cv[b + 6] + (cv[b + 7] - cv[b + 6]) * fx3;
        const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
        sum += amps[o] * (y0 + (y1 - y0) * fz);
      }
      return sum / norm2;
    };
  }

  // js/core/world/worldgen.js
  var LAND_WATER = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
  var BIOMES = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
  var BIOME_NAMES = Object.freeze(["\u6D77", "\u6C37\u96EA", "\u30C4\u30F3\u30C9\u30E9", "\u30BF\u30A4\u30AC", "\u6E29\u5E2F\u6797", "\u8349\u539F", "\u71B1\u5E2F\u7802\u6F20", "\u5BD2\u51B7\u7802\u6F20", "\u30B5\u30D0\u30F3\u30CA", "\u71B1\u5E2F\u5B63\u7BC0\u6797", "\u71B1\u5E2F\u96E8\u6797", "\u9AD8\u5C71", "\u6E7F\u5730", "\u6E56"]);
  var SOILS = Object.freeze({ NONE: 0, ROCK: 1, SAND: 2, LOAM: 3, CLAY: 4, VOLCANIC: 5, PERMAFROST: 6, ALLUVIAL: 7, PODZOL: 8, BLACK_EARTH: 9 });
  var RES = Object.freeze({ IRON: 1, COPPER: 2, TIN: 4, GOLD: 8, COAL: 16, SALT: 32, TIMBER: 64, FISH: 128, STONE: 256, CLAY: 512, GEMS: 1024 });
  var RES_NAMES = Object.freeze({ 1: "\u9244", 2: "\u9285", 4: "\u932B", 8: "\u91D1", 16: "\u77F3\u70AD", 32: "\u5869", 64: "\u6728\u6750", 128: "\u6F01\u5834", 256: "\u77F3\u6750", 512: "\u7C98\u571F", 1024: "\u5B9D\u77F3" });
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  var D2R = Math.PI / 180;
  var MinHeap = class {
    constructor(cap) {
      this.k = new Float64Array(cap);
      this.v = new Int32Array(cap);
      this.n = 0;
    }
    push(key, val) {
      let i = this.n++;
      const k = this.k, v = this.v;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (k[p] <= key) break;
        k[i] = k[p];
        v[i] = v[p];
        i = p;
      }
      k[i] = key;
      v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0], key = k[--this.n], val = v[this.n];
      let i = 0;
      const n2 = this.n;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n2) break;
        if (c + 1 < n2 && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = key;
      v[i] = val;
      return top;
    }
  };
  var Cancelled = class extends Error {
  };
  var makeStager = (onProgress, signal, timings) => (name, label, fn) => {
    if (signal?.aborted) throw new Cancelled("\u30AD\u30E3\u30F3\u30BB\u30EB\u3055\u308C\u307E\u3057\u305F");
    onProgress?.({ stage: name, label, fraction: 0 });
    const t = performance.now(), r = fn();
    timings[name] = Math.round(performance.now() - t);
    onProgress?.({ stage: name, label, fraction: 1, ms: timings[name] });
    return r;
  };
  function generateWorld(specInput, options = {}) {
    const { spec, errors } = normalizeWorldSpec(specInput);
    if (errors.length) throw new Error("WorldSpec \u304C\u4E0D\u6B63: " + errors.join(" / "));
    const timings = {}, stage = makeStager(options.onProgress, options.signal, timings), seed = spec.worldSeed, tAll = performance.now();
    const n2 = frequencyForCells(spec.resolution.targetCells);
    const mesh = stage("G1_mesh", "\u7403\u9762\u30E1\u30C3\u30B7\u30E5", () => buildSphereMesh(n2));
    const V = mesh.cellCount, X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds, R = spec.planet.radiusKm;
    const lat = new Float32Array(V), lon = new Float32Array(V), areaKm2 = new Float32Array(V);
    stage("G1_derive", "\u7DEF\u5EA6\u7D4C\u5EA6\u30FB\u9762\u7A4D", () => {
      for (let c = 0; c < V; c++) {
        lat[c] = Math.asin(clamp(X[3 * c + 2], -1, 1));
        lon[c] = Math.atan2(X[3 * c + 1], X[3 * c]);
        areaKm2[c] = cellArea(mesh, c) * R * R;
      }
    });
    const spacingKm = Math.sqrt(4 * Math.PI * R * R / V), spacingRad = spacingKm / R;
    const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
    const nSeed = (name) => hashString(`${seed}::noise::${name}`);
    const plate = new Uint8Array(V), mountain = new Float32Array(V), rift = new Float32Array(V), continent = new Float32Array(V);
    const volcanic = new Float32Array(V);
    stage("G2_plates", "\u30D7\u30EC\u30FC\u30C8\u30FB\u5927\u9678\u306E\u6982\u5F62", () => {
      const warpSeed = [nSeed("warpx"), nSeed("warpy"), nSeed("warpz")];
      const wx = new Float32Array(V), wy = new Float32Array(V), wz = new Float32Array(V);
      const wlo = warpSeed.map((sd) => makeFbm3(sd, 3, 1.5)), whi = warpSeed.map((sd) => makeFbm3(sd + 7, 3, 5.5));
      for (let c = 0; c < V; c++) {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
        const ax = (wlo[0](x, y, z) - 0.5) * 0.32 + (whi[0](x, y, z) - 0.5) * 0.3, ay = (wlo[1](x, y, z) - 0.5) * 0.32 + (whi[1](x, y, z) - 0.5) * 0.3, az = (wlo[2](x, y, z) - 0.5) * 0.32 + (whi[2](x, y, z) - 0.5) * 0.3;
        const px = x + ax, py = y + ay, pz = z + az, l = Math.hypot(px, py, pz);
        wx[c] = px / l;
        wy[c] = py / l;
        wz[c] = pz / l;
      }
      const rp = makeRng(seed, "plates"), P2 = spec.plateCount, seeds = [], omega = [];
      for (let p = 0; p < P2; p++) {
        seeds.push(rp.unitVec());
        const w = rp.unitVec(), sp = rp.range(0.4, 1.6);
        omega.push([w[0] * sp, w[1] * sp, w[2] * sp]);
      }
      for (let c = 0; c < V; c++) {
        let best = -2, bp = 0;
        for (let p = 0; p < P2; p++) {
          const d = wx[c] * seeds[p][0] + wy[c] * seeds[p][1] + wz[c] * seeds[p][2];
          if (d > best) {
            best = d;
            bp = p;
          }
        }
        plate[c] = bp;
      }
      const vel = (p, c) => {
        const w = omega[p], x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
        return [w[1] * z - w[2] * y, w[2] * x - w[0] * z, w[0] * y - w[1] * x];
      };
      const srcStrength = new Float32Array(V), isSrc = new Uint8Array(V);
      for (let c = 0; c < V; c++) {
        let best = 0, bestAbs = 0;
        const vc = vel(plate[c], c);
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (plate[j] === plate[c]) continue;
          const vj = vel(plate[j], c);
          let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2];
          const dl = Math.hypot(dx, dy, dz) || 1;
          dx /= dl;
          dy /= dl;
          dz /= dl;
          const conv = (vc[0] - vj[0]) * dx + (vc[1] - vj[1]) * dy + (vc[2] - vj[2]) * dz;
          if (Math.abs(conv) > bestAbs) {
            bestAbs = Math.abs(conv);
            best = conv;
          }
        }
        if (bestAbs > 0) {
          isSrc[c] = 1;
          srcStrength[c] = best;
        }
      }
      const widthCells = Math.max(2, 5 * D2R / spacingRad), maxD = Math.ceil(widthCells * 3);
      const dist = new Int16Array(V).fill(-1), from = new Int32Array(V).fill(-1), q2 = new Int32Array(V);
      let qh = 0, qt = 0;
      for (let c = 0; c < V; c++) if (isSrc[c]) {
        dist[c] = 0;
        from[c] = c;
        q2[qt++] = c;
      }
      while (qh < qt) {
        const c = q2[qh++];
        if (dist[c] >= maxD) continue;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (dist[j] < 0) {
            dist[j] = dist[c] + 1;
            from[j] = from[c];
            q2[qt++] = j;
          }
        }
      }
      const ridgeF = makeFbm3(nSeed("ridge"), 3, 1.4);
      for (let c = 0; c < V; c++) {
        if (dist[c] < 0) continue;
        const s = srcStrength[from[c]], f = Math.exp(-((dist[c] / widthCells) ** 2));
        const mod = 0.55 + 0.9 * ridgeF(X[3 * c] * 3, X[3 * c + 1] * 3, X[3 * c + 2] * 3);
        if (s > 0) {
          mountain[c] = clamp(s / 1.2, 0, 1.3) * f * mod;
          volcanic[c] = mountain[c] > 0.7 ? 0.5 : 0;
        } else rift[c] = clamp(-s / 1.2, 0, 1) * f;
      }
      const rc = makeRng(seed, "continents"), K = spec.continentCountTarget;
      const thetaLand = Math.acos(clamp(1 - 2 * spec.landFraction / K, -1, 1));
      let bestSet = null, bestSep = -1;
      for (let trial = 0; trial < 3e3; trial++) {
        const pts = [];
        for (let i = 0; i < K; i++) pts.push(rc.unitVec());
        let sep = 9;
        for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) sep = Math.min(sep, Math.acos(clamp(pts[i][0] * pts[j][0] + pts[i][1] * pts[j][1] + pts[i][2] * pts[j][2], -1, 1)));
        if (sep > bestSep) {
          bestSep = sep;
          bestSet = pts;
        }
      }
      const cs = bestSet.map((v) => {
        const r = thetaLand * rc.range(0.8, 0.95);
        return { v, r, cosCut: Math.cos(Math.min(Math.PI, r * 1.1)) - 1e-9 };
      });
      const isl = [];
      const NI = ISLAND_MODES[spec.islandMode];
      for (let i = 0; i < NI; i++) {
        const v = rc.unitVec(), r = rc.range(1.2, 5.5) * D2R, w = rc.range(0.45, 0.95);
        isl.push({ v, r, w, cosCut: Math.cos(r * 1.5) - 1e-9 });
      }
      const dotp = (c, v) => wx[c] * v[0] + wy[c] * v[1] + wz[c] * v[2];
      for (let c = 0; c < V; c++) {
        let f = 0;
        for (const o of cs) {
          const dp = dotp(c, o.v);
          if (dp < o.cosCut) continue;
          const d = Math.acos(clamp(dp, -1, 1)), t = clamp((1 - d / (o.r * 1.1)) * 2.2, 0, 1);
          f = Math.max(f, t * t * (3 - 2 * t));
        }
        for (const o of isl) {
          const dp = dotp(c, o.v);
          if (dp < o.cosCut) continue;
          const d = Math.acos(clamp(dp, -1, 1));
          if (d < o.r * 1.5) {
            const t = clamp(1 - d / (o.r * 1.5), 0, 1);
            f = Math.max(f, o.w * t * t * (3 - 2 * t));
          }
        }
        continent[c] = f;
      }
      const rh = makeRng(seed, "hotspots");
      for (let h2 = 0; h2 < 6; h2++) {
        const start2 = rh.unitVec(), dirv = rh.unitVec(), count = rh.int(6, 14), step = rh.range(1.2, 2.2) * D2R;
        const dot2 = start2[0] * dirv[0] + start2[1] * dirv[1] + start2[2] * dirv[2];
        let t = [dirv[0] - dot2 * start2[0], dirv[1] - dot2 * start2[1], dirv[2] - dot2 * start2[2]];
        const tl = Math.hypot(...t) || 1;
        t = t.map((x) => x / tl);
        for (let i = 0; i < count; i++) {
          const a = i * step, p = [start2[0] * Math.cos(a) + t[0] * Math.sin(a), start2[1] * Math.cos(a) + t[1] * Math.sin(a), start2[2] * Math.cos(a) + t[2] * Math.sin(a)], rad = rh.range(0.7, 1.6) * D2R * (1 - i / (count * 1.6)), amp = 0.9 * (1 - i / (count * 1.4));
          for (let c = 0; c < V; c++) {
            const d = Math.acos(clamp(X[3 * c] * p[0] + X[3 * c + 1] * p[1] + X[3 * c + 2] * p[2], -1, 1));
            if (d < rad * 2) {
              const g = Math.exp(-((d / rad) ** 2));
              continent[c] = Math.max(continent[c], amp * g * 0.9);
              volcanic[c] = Math.max(volcanic[c], g);
            }
          }
        }
      }
    });
    const elevation = new Float32Array(V);
    let seaLevelRaw = 0;
    stage("G3_elevation", "\u6A19\u9AD8\u30FB\u6D77\u5CB8\u30FB\u5CF6", () => {
      const s1 = nSeed("hills"), s2 = nSeed("detail"), s3 = nSeed("micro"), raw = new Float32Array(V);
      for (let c = 0; c < V; c++) {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], cf = continent[c];
        const land = smooth((cf - 0.25) / 0.45);
        raw[c] = cf * 0.8 + (fbm3(s1, x, y, z, 5, 2.2) - 0.5) * (0.12 + 0.6 * land) + (fbm3(s2, x, y, z, 4, 9) - 0.5) * (0.06 + 0.16 * land) + (fbm3(s3, x, y, z, 3, 38) - 0.5) * (0.02 + 0.07 * land) + mountain[c] * (0.03 + 0.97 * land) * 1.5 - rift[c] * 0.22;
      }
      const sorted = Float32Array.from(raw).sort();
      seaLevelRaw = sorted[Math.min(V - 1, Math.max(0, Math.floor(V * (1 - spec.landFraction))))];
      const hi = sorted[Math.min(V - 1, Math.floor(V * 0.998))], lo = sorted[0];
      for (let c = 0; c < V; c++) {
        const e = raw[c] - seaLevelRaw;
        elevation[c] = e >= 0 ? Math.pow(Math.min(1.35, e / Math.max(1e-6, hi - seaLevelRaw)), 1.2) * 6500 : e / Math.max(1e-6, seaLevelRaw - lo) * 5500;
      }
    });
    const isSea = new Uint8Array(V);
    for (let c = 0; c < V; c++) isSea[c] = elevation[c] <= 0 ? 1 : 0;
    const coastDist = new Uint16Array(V);
    stage("G3_coast", "\u6D77\u5CB8\u304B\u3089\u306E\u8DDD\u96E2", () => {
      const q2 = new Int32Array(V);
      let qh = 0, qt = 0;
      const seen = new Uint8Array(V);
      for (let c = 0; c < V; c++) if (isSea[c]) {
        seen[c] = 1;
        q2[qt++] = c;
      }
      while (qh < qt) {
        const c = q2[qh++];
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!seen[j]) {
            seen[j] = 1;
            coastDist[j] = Math.min(65535, coastDist[c] + 1);
            q2[qt++] = j;
          }
        }
      }
    });
    const temp = new Float32Array(V), precip = new Float32Array(V), biome = new Uint8Array(V), moisture = new Float32Array(V);
    const cx = { mesh, lat, lon, elevation, isSea, moisture, precipNoise: nSeed("precip"), lapse: spec.climateModel.lapseRateCPerKm, decay: Math.exp(-spacingKm / spec.climateModel.windMoistureLengthKm) };
    stage("G4_climate", "\u6C17\u5019", () => {
      for (let c = 0; c < V; c++) temp[c] = tempAt(lat[c], elevation[c], cx.lapse);
      cx.up = new Int32Array(V);
      for (let c = 0; c < V; c++) cx.up[c] = upwindOf(mesh, lat, lon, c);
      for (let c = 0; c < V; c++) moisture[c] = isSea[c] ? 1 : 0.5;
      const passes = Math.min(200, Math.ceil(4e3 / spacingKm) + 4);
      for (let it = 0; it < passes; it++) for (let c = 0; c < V; c++) {
        if (!isSea[c]) moisture[c] = moistureStep(cx, c);
      }
      for (let c = 0; c < V; c++) precip[c] = precipAt(cx, c);
    });
    stage("G4_biome", "\u30D0\u30A4\u30AA\u30FC\u30E0", () => {
      for (let c = 0; c < V; c++) biome[c] = isSea[c] ? BIOMES.OCEAN : biomeOf(temp[c], precip[c], elevation[c]);
    });
    const parent = new Int32Array(V).fill(-1), filled = new Float32Array(V), flow = new Float32Array(V), basin = new Int32Array(V).fill(-1), landWater = new Uint8Array(V);
    let lakeCount = 0;
    const hyd = { mesh, elevation, isSea, precip, areaKm2, parent, filled, flow, basin, landWater, biome };
    stage("G5_rivers", "\u6C34\u7CFB", () => {
      lakeCount = computeHydrology(hyd, null).lakeCount;
    });
    let riverThreshold = 0;
    const river = new Uint8Array(V);
    stage("G5_riverset", "\u6CB3\u5DDD\u306E\u9078\u5B9A", () => {
      const f = [];
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND) f.push(flow[c]);
      f.sort((a, b) => a - b);
      riverThreshold = f.length ? f[Math.floor(f.length * 0.93)] : 0;
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && flow[c] >= riverThreshold && flow[c] > 0) river[c] = 1;
    });
    const soil = new Uint8Array(V), fertility = new Float32Array(V), resource = new Uint16Array(V), capacity = new Float32Array(V);
    const lu = { mesh, isSea, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, ...landUseNoise(seed) };
    stage("G6_soil", "\u571F\u58CC\u30FB\u80A5\u6C83\u5EA6\u30FB\u8CC7\u6E90", () => {
      for (let c = 0; c < V; c++) landUseAt(lu, c);
    });
    const gctx = { mesh, landWater, fertility, temp, river, coastDist, lat, lon };
    const populations = stage("G7_groups", "\u521D\u671F\u4EBA\u53E3\u96C6\u56E3", () => placeInitialGroups(gctx, spec, 0));
    const stats = stage("G8_stats", "\u7D71\u8A08", () => computeStats({ V, off, nb, landWater, isSea, elevation, temp, precip, biome, flow, riverThreshold, river, lakeCount, parent, lat, areaKm2, populations, spec }));
    const world = {
      spec: { ...spec, generatorVersion: GENERATOR_VERSION },
      mesh,
      cell: { elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo: parent, riverFlow: flow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain, moisture },
      entities: { populations },
      stats,
      timings
    };
    timings.total = Math.round(performance.now() - tAll);
    world.hash = worldHash(world);
    return world;
  }
  function tempAt(latRad, elevation, lapse) {
    const a = Math.abs(latRad) / (Math.PI / 2), h2 = Math.max(0, elevation) / 1e3;
    return 27.5 - 45 * Math.pow(a, 1.6) - lapse * h2;
  }
  function upwindOf(mesh, lat, lon, c) {
    const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    const la = Math.abs(lat[c]) / D2R, east = la < 30 ? -1 : la < 60 ? 1 : -1;
    const ex = -Math.sin(lon[c]), ey = Math.cos(lon[c]);
    const wx = -east * ex, wy = -east * ey;
    let best = -2, bj = -1;
    for (let k = off[c]; k < off[c + 1]; k++) {
      const j = nb[k], dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2], dl = Math.hypot(dx, dy, dz) || 1, s = (dx * wx + dy * wy) / dl;
      if (s > best) {
        best = s;
        bj = j;
      }
    }
    return bj;
  }
  var upOf = (cx, c) => cx.up ? cx.up[c] : upwindOf(cx.mesh, cx.lat, cx.lon, c);
  function liftRaw(cx, c) {
    const u = upOf(cx, c);
    return Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1e3;
  }
  function moistureStep(cx, c) {
    const u = upOf(cx, c);
    return clamp(cx.moisture[u] * cx.decay - 0.3 * (Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1e3), 0.42, 1);
  }
  function precipAt(cx, c) {
    const X = cx.mesh.centerXYZ, sea = cx.isSea[c], la = Math.abs(cx.lat[c]) / D2R, zonal = 250 + 1900 * Math.exp(-((la / 9) ** 2)) + 800 * Math.exp(-(((la - 55) / 12) ** 2));
    const lift = sea ? 0 : Math.fround(liftRaw(cx, c)), m = cx.moisture[c];
    let p = zonal * (0.35 + 0.85 * m) * (0.7 + 0.6 * fbm3(cx.precipNoise, X[3 * c], X[3 * c + 1], X[3 * c + 2], 3, 2.5)) + 900 * lift * m * (sea ? 0 : 1);
    if (!sea && cx.elevation[c] > 3500) p *= 0.6;
    return clamp(p, 0, 6e3);
  }
  function computeHydrology(h2, members2 = null) {
    const { mesh, elevation, isSea, precip, areaKm2, parent, filled, flow, basin, landWater, biome } = h2;
    const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, EPS = 0.05;
    const heap = new MinHeap(V + 16), done2 = new Uint8Array(V), order = new Int32Array(V);
    let on = 0;
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      filled[c] = elevation[c];
      parent[c] = -1;
      basin[c] = -1;
    }
    for (let c = 0; c < V; c++) {
      if (isSea[c]) {
        done2[c] = 1;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea[j] && (!members2 || members2[j])) {
            heap.push(filled[c], c);
            break;
          }
        }
      } else if (members2 && !members2[c]) done2[c] = 1;
    }
    while (heap.n > 0) {
      const c = heap.pop();
      order[on++] = c;
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k];
        if (done2[j]) continue;
        done2[j] = 1;
        parent[j] = c;
        filled[j] = Math.max(elevation[j], filled[c] + EPS);
        heap.push(filled[j], j);
      }
    }
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      flow[c] = isSea[c] ? 0 : precip[c] * areaKm2[c] * 95e-7;
    }
    for (let i = on - 1; i >= 0; i--) {
      const c = order[i], p = parent[c];
      if (p >= 0 && !isSea[c]) flow[p] += isSea[p] ? 0 : flow[c];
    }
    for (let i = 0; i < on; i++) {
      const c = order[i];
      if (isSea[c]) continue;
      const p = parent[c];
      basin[c] = isSea[p] ? c : basin[p];
    }
    let lakeCount = 0, unreached = 0;
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      if (isSea[c]) landWater[c] = LAND_WATER.OCEAN;
      else {
        if (parent[c] < 0) unreached++;
        if (filled[c] - elevation[c] >= 40) {
          landWater[c] = LAND_WATER.LAKE;
          lakeCount++;
          biome[c] = BIOMES.LAKE;
        } else landWater[c] = LAND_WATER.LAND;
      }
    }
    return { lakeCount, unreached };
  }
  function landUseNoise(seed) {
    const ns = (name) => hashString(`${seed}::noise::${name}`);
    return { rs: ["iron", "copper", "tin", "gold", "coal", "gems"].map(ns), sSalt: ns("salt") };
  }
  var SOIL_FERT = { [SOILS.NONE]: 0, [SOILS.ROCK]: 0.05, [SOILS.SAND]: 0.1, [SOILS.LOAM]: 0.85, [SOILS.CLAY]: 0.55, [SOILS.VOLCANIC]: 1.05, [SOILS.PERMAFROST]: 0.1, [SOILS.ALLUVIAL]: 1.2, [SOILS.PODZOL]: 0.5, [SOILS.BLACK_EARTH]: 1.15 };
  function seaToLand(mesh, isSea, c) {
    const off = mesh.neighborOffsets, nb = mesh.neighborIds;
    let fr = [c];
    const seen = /* @__PURE__ */ new Set([c]);
    for (let d = 0; d <= 6; d++) {
      const nx = [];
      for (const u of fr) for (let k = off[u]; k < off[u + 1]; k++) {
        const j = nb[k];
        if (!isSea[j]) return d + 1;
        if (!seen.has(j)) {
          seen.add(j);
          nx.push(j);
        }
      }
      fr = nx;
      if (!fr.length) break;
    }
    return 99;
  }
  function landUseAt(g, c) {
    const { mesh, isSea, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, rs, sSalt } = g;
    const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    const sea = isSea[c], land = !sea && landWater[c] === LAND_WATER.LAND, b = biome[c], e = elevation[c];
    let relief = 0, kn = 0;
    for (let k = off[c]; k < off[c + 1]; k++) {
      relief += Math.abs(elevation[nb[k]] - e);
      kn++;
    }
    relief /= Math.max(1, kn);
    const nearRiver = river[c] === 1;
    let res = 0;
    if (sea) {
      if (e > -300 && seaToLand(mesh, isSea, c) <= 6) res |= RES.FISH;
    } else {
      const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], q2 = (i, f) => fbm3(rs[i], x, y, z, 3, f);
      if (land) {
        if (q2(0, 7) > 0.6 && e > 300) res |= RES.IRON;
        if (q2(1, 8) > 0.66 && (e > 500 || volcanic[c] > 0.3)) res |= RES.COPPER;
        if (q2(2, 9) > 0.72 && e > 800) res |= RES.TIN;
        if (q2(3, 10) > 0.74 && (nearRiver || mountain[c] > 0.4)) res |= RES.GOLD;
        if (q2(4, 6) > 0.62 && e < 1500 && (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.WETLAND || b === BIOMES.TROPICAL_SEASONAL)) res |= RES.COAL;
        if (q2(5, 11) > 0.78 && mountain[c] > 0.5) res |= RES.GEMS;
        if (e > 200 && relief > 120) res |= RES.STONE;
        if ((b === BIOMES.HOT_DESERT || b === BIOMES.COLD_DESERT) && e < 600 && fbm3(sSalt, x, y, z, 3, 8) > 0.6) res |= RES.SALT;
        if (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.TROPICAL_SEASONAL || b === BIOMES.RAINFOREST) res |= RES.TIMBER;
        if (relief < 80 && (nearRiver || coastDist[c] <= 2) && b !== BIOMES.HOT_DESERT) res |= RES.CLAY;
        if (nearRiver) res |= RES.FISH;
      } else if (landWater[c] === LAND_WATER.LAKE) res |= RES.FISH;
    }
    resource[c] = res;
    let sl = SOILS.NONE;
    if (!sea) {
      if (landWater[c] === LAND_WATER.LAKE) sl = SOILS.NONE;
      else if (b === BIOMES.ICE || b === BIOMES.TUNDRA) sl = SOILS.PERMAFROST;
      else if (e > 3500 || b === BIOMES.ALPINE) sl = SOILS.ROCK;
      else if (volcanic[c] > 0.3) sl = SOILS.VOLCANIC;
      else if (b === BIOMES.HOT_DESERT) sl = SOILS.SAND;
      else if (nearRiver && relief < 150 && elevation[c] < 800) sl = SOILS.ALLUVIAL;
      else if (b === BIOMES.TAIGA) sl = SOILS.PODZOL;
      else if (b === BIOMES.GRASSLAND) sl = SOILS.BLACK_EARTH;
      else if (b === BIOMES.WETLAND) sl = SOILS.CLAY;
      else sl = SOILS.LOAM;
    }
    soil[c] = sl;
    if (land) {
      const t = temp[c], p = precip[c];
      const tf = t < -2 ? 0 : t < 8 ? (t + 2) / 10 * 0.6 : t <= 26 ? 1 : clamp(1 - (t - 26) / 12, 0.2, 1);
      const pf = p < 150 ? p / 150 * 0.15 : p < 600 ? 0.15 + (p - 150) / 450 * 0.85 : p <= 2200 ? 1 : clamp(1 - (p - 2200) / 3500, 0.5, 1);
      const slope = 1 - clamp(relief / 700, 0, 0.9), alt = 1 - clamp(Math.max(0, e - 1500) / 3e3, 0, 1);
      fertility[c] = clamp(tf * pf * SOIL_FERT[sl] * slope * alt, 0, 1);
      capacity[c] = fertility[c] * 12 * (1 + (nearRiver ? 0.5 : 0) + (coastDist[c] <= 1 ? 0.3 : 0)) * areaKm2[c];
    } else {
      fertility[c] = 0;
      capacity[c] = 0;
    }
  }
  function placeInitialGroups(g, spec, variant = 0) {
    const { mesh, landWater, fertility, temp, river, coastDist, lat, lon } = g, V = mesh.cellCount, X = mesh.centerXYZ, R = spec.planet.radiusKm;
    const rg = makeRng(spec.worldSeed, variant ? `groups#${variant}` : "groups"), cand3 = [];
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && fertility[c] > 0.35 && temp[c] > 4 && temp[c] < 30) cand3.push({ c, s: fertility[c] * (1 + (river[c] ? 0.3 : 0) + (coastDist[c] <= 2 ? 0.2 : 0)) * (0.7 + 0.6 * rg()) });
    cand3.sort((a, b) => b.s - a.s || a.c - b.c);
    const out = [], minSep = Math.min(0.25 * Math.PI, 2e3 / R);
    const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
    for (const { c } of cand3) {
      if (out.length >= spec.initialGroups) break;
      if (out.every((o) => ang(o.cell, c) >= minSep)) out.push({ id: out.length + 1, cell: c, lat: lat[c] / D2R, lon: lon[c] / D2R, size: Math.round(rg.range(150, 600)), subsistence: "forage", species: "human" });
    }
    return out;
  }
  function biomeOf(T3, P2, e) {
    if (e > 4500 || e > 3500 && T3 < 0) return BIOMES.ALPINE;
    if (T3 < -8) return BIOMES.ICE;
    if (T3 < 0) return BIOMES.TUNDRA;
    if (T3 < 5) return P2 > 300 ? BIOMES.TAIGA : BIOMES.COLD_DESERT;
    if (T3 < 18) return P2 < 200 ? BIOMES.COLD_DESERT : P2 < 600 ? BIOMES.GRASSLAND : P2 > 2600 ? BIOMES.WETLAND : BIOMES.TEMPERATE_FOREST;
    if (P2 < 250) return BIOMES.HOT_DESERT;
    if (P2 < 900) return BIOMES.SAVANNA;
    if (P2 < 1800) return BIOMES.TROPICAL_SEASONAL;
    return BIOMES.RAINFOREST;
  }
  function landmasses(V, off, nb, isSea) {
    const comp = new Int32Array(V).fill(-1), sizes = [];
    const q2 = new Int32Array(V);
    for (let s = 0; s < V; s++) {
      if (isSea[s] || comp[s] >= 0) continue;
      let qh = 0, qt = 0;
      q2[qt++] = s;
      comp[s] = sizes.length;
      let cnt = 0;
      while (qh < qt) {
        const c = q2[qh++];
        cnt++;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea[j] && comp[j] < 0) {
            comp[j] = comp[s];
            q2[qt++] = j;
          }
        }
      }
      sizes.push(cnt);
    }
    return { comp, sizes };
  }
  function computeStats(a) {
    const { V, off, nb, isSea, landWater, elevation, temp, biome, lat, riverThreshold, river, lakeCount, parent, populations } = a;
    let mouthCount = 0;
    for (let c = 0; c < V; c++) if (river[c] && parent[c] >= 0 && isSea[parent[c]]) mouthCount++;
    let sea = 0, lake = 0, mount = 0, rivers = 0, cold = 0;
    for (let c = 0; c < V; c++) {
      if (isSea[c]) sea++;
      else {
        if (landWater[c] === LAND_WATER.LAKE) lake++;
        if (elevation[c] > 2500) mount++;
        if (river[c]) rivers++;
      }
    }
    const landCells = V - sea, { sizes } = landmasses(V, off, nb, isSea), total = sizes.reduce((s, x) => s + x, 0);
    const continents = sizes.filter((s) => s >= total * 0.03), islands = sizes.filter((s) => s < total * 0.03);
    const biomeCounts = new Array(14).fill(0);
    for (let c = 0; c < V; c++) biomeCounts[biome[c]]++;
    let tl = 0, nl = 0, th = 0, nh = 0;
    for (let c = 0; c < V; c++) {
      if (isSea[c]) continue;
      const la = Math.abs(lat[c]) / D2R;
      if (la < 20) {
        tl += temp[c];
        nl++;
      } else if (la > 60) {
        th += temp[c];
        nh++;
      }
    }
    return {
      cells: V,
      landFraction: landCells / V,
      lakeFraction: lake / V,
      mountainFraction: mount / Math.max(1, landCells),
      riverCells: rivers,
      riverFlowThreshold: riverThreshold,
      riverMouths: mouthCount,
      lakeCells: lakeCount,
      continentCount: continents.length,
      continentShares: continents.map((s) => +(s / total).toFixed(3)).sort((x, y) => y - x),
      islandCount: islands.length,
      largestIslandCells: islands.length ? Math.max(...islands) : 0,
      meanTempLow: nl ? tl / nl : null,
      meanTempHigh: nh ? th / nh : null,
      biomeCounts,
      initialGroups: populations.length
    };
  }
  function worldHash(world) {
    let h2 = 2166136261;
    const { cell } = world;
    const mix = (v) => {
      h2 ^= v & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 8 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 16 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 24 & 255;
      h2 = Math.imul(h2, 16777619);
    };
    for (let i = 0; i < cell.elevation.length; i++) mix(Math.round(cell.elevation[i]) | 0);
    for (let i = 0; i < cell.landWater.length; i++) mix(cell.landWater[i] | cell.biome[i] << 8 | cell.soil[i] << 16);
    for (let i = 0; i < cell.riverTo.length; i++) mix(cell.riverTo[i] | 0);
    for (let i = 0; i < cell.resource.length; i++) mix(cell.resource[i]);
    mix(meshHash(world.mesh).length);
    return (h2 >>> 0).toString(16).padStart(8, "0");
  }

  // js/core/wcde/calendar.js
  var DEFAULT_CALENDAR = Object.freeze({
    epochName: "\u7D00\u5143",
    beforeName: "\u7D00\u5143\u524D",
    yearOffset: 0,
    // 表示年 = 内部の年 + yearOffset（内部の年が負なら beforeName の側で数える）
    format: "{era}{year}\u5E74{month}\u6708",
    monthNames: null,
    eras: Object.freeze([])
  });
  var isInt = (v) => Number.isInteger(v);
  function normalizeCalendar(input = {}) {
    const errors = [], c = { ...DEFAULT_CALENDAR, ...input ?? {} };
    for (const k of ["epochName", "beforeName", "format"]) if (typeof c[k] !== "string" || !c[k].trim()) errors.push(`calendar.${k} \u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217`);
    if (!isInt(c.yearOffset) || Math.abs(c.yearOffset) > 1e7) errors.push("calendar.yearOffset \u306F\u6574\u6570");
    if (typeof c.format === "string" && !c.format.includes("{year}")) errors.push("calendar.format \u306B\u306F {year} \u304C\u5FC5\u8981");
    const eras = [];
    if (!Array.isArray(c.eras)) errors.push("calendar.eras \u306F\u914D\u5217");
    else {
      let prev = -Infinity;
      for (const [i, e] of c.eras.entries()) {
        if (!e || typeof e.name !== "string" || !e.name.trim()) {
          errors.push(`calendar.eras[${i}].name \u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217`);
          continue;
        }
        if (!isInt(e.startYear)) {
          errors.push(`calendar.eras[${i}].startYear \u306F\u6574\u6570\uFF08\u5185\u90E8\u306E\u5E74\uFF09`);
          continue;
        }
        if (e.startYear <= prev) errors.push(`calendar.eras[${i}] \u306E\u5883\u754C\u306F\u524D\u3088\u308A\u5F8C\uFF08${e.startYear} \u2264 ${prev}\uFF09`);
        prev = e.startYear;
        eras.push({ id: e.id ?? `era${i}`, name: e.name.trim(), startYear: e.startYear });
      }
    }
    if (c.monthNames != null && !(Array.isArray(c.monthNames) && c.monthNames.length === 12 && c.monthNames.every((x) => typeof x === "string" && x))) errors.push("calendar.monthNames \u306F12\u500B\u306E\u6587\u5B57\u5217");
    return { calendar: { epochName: c.epochName, beforeName: c.beforeName, yearOffset: c.yearOffset, format: c.format, monthNames: c.monthNames ?? null, eras }, errors };
  }
  var split = (mi) => {
    const year = Math.floor(mi / 12);
    return { year, month: mi - year * 12 + 1 };
  };
  function formatDate(cal, mi) {
    const { year, month } = split(mi), shown = year + cal.yearOffset, before = shown < 0, n2 = before ? -shown : shown;
    const era = before ? cal.beforeName : cal.epochName, name = cal.monthNames ? cal.monthNames[month - 1] : String(month);
    return cal.format.replace("{era}", era).replace("{year}", String(n2)).replace("{month}", name).replace("{monthNum}", String(month));
  }
  function applyDisplayEdit(cal, edit) {
    const errors = [], next = { ...cal, eras: cal.eras.map((e) => ({ ...e })) };
    const allowed = /* @__PURE__ */ new Set(["epochName", "beforeName", "format", "monthNames", "eraNames"]);
    for (const k of Object.keys(edit)) if (!allowed.has(k)) errors.push(`${k} \u306F\u751F\u6210\u5F8C\u306B\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\uFF08\u8868\u793A\u7528\u306E\u8A2D\u5B9A\u3060\u3051\u5909\u3048\u3089\u308C\u307E\u3059\uFF09`);
    if (errors.length) return { calendar: cal, errors };
    for (const k of ["epochName", "beforeName", "format"]) if (edit[k] !== void 0) next[k] = edit[k];
    if (edit.monthNames !== void 0) next.monthNames = edit.monthNames;
    if (edit.eraNames) for (const [id, name] of Object.entries(edit.eraNames)) {
      const e = next.eras.find((x) => x.id === id);
      if (!e) errors.push(`\u6642\u4EE3\u533A\u5206 ${id} \u304C\u3042\u308A\u307E\u305B\u3093`);
      else e.name = name;
    }
    const v = normalizeCalendar(next);
    if (v.errors.length) return { calendar: cal, errors: v.errors };
    return { calendar: v.calendar, errors: [] };
  }

  // js/core/wcde/config.js
  init_world_consts();
  init_civ_state();
  var WCDE_VERSION = "6.1.0";
  var CONFIG_SCHEMA = 2;
  var DEFAULT_LAWS = Object.freeze({ disasterRate: 1, climateVolatility: 1, fertilityScale: 1, faunaRichness: 1, ecoResilience: 1 });
  var PREHISTORY_YEARS = 5e5;
  var NEOLITHIC_YEARS = 1e4;
  var RESOLUTION = Object.freeze({ standard: 3e3, extra: 6e3, max: 2e4, choices: Object.freeze([3e3, 6e3]) });
  var isObj2 = (v) => v && typeof v === "object" && !Array.isArray(v);
  var num = (errors, name, v, def, lo, hi) => {
    if (v === void 0) return def;
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      errors.push(`${name} \u306F ${lo}\u301C${hi}\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(v)}\uFF09`);
      return def;
    }
    return v;
  };
  var BIOME_KEYS = Object.freeze(Object.keys(BIOMES2));
  function normalizeWorldConfig(input = {}) {
    const errors = [], i = isObj2(input) ? input : {};
    const name = typeof i.name === "string" && i.name.trim() ? i.name.trim() : "\u540D\u3082\u306A\u304D\u4E16\u754C";
    const given = i.spec?.resolution?.targetCells, cells = given ?? RESOLUTION.standard;
    if (given !== void 0 && !(typeof given === "number" && given <= RESOLUTION.max)) errors.push(`resolution.targetCells \u306F ${RESOLUTION.max} \u4EE5\u4E0B\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(given)}\uFF09`);
    const sp = normalizeWorldSpec({ ...i.spec ?? {}, resolution: { ...i.spec?.resolution ?? {}, targetCells: Math.min(RESOLUTION.max, cells) }, worldSeed: i.worldSeed ?? i.spec?.worldSeed });
    errors.push(...sp.errors);
    const laws = { disasterRate: num(errors, "laws.disasterRate", i.laws?.disasterRate, DEFAULT_LAWS.disasterRate, 0, 3), climateVolatility: num(errors, "laws.climateVolatility", i.laws?.climateVolatility, DEFAULT_LAWS.climateVolatility, 0, 3), fertilityScale: num(errors, "laws.fertilityScale", i.laws?.fertilityScale, DEFAULT_LAWS.fertilityScale, 0.3, 2), faunaRichness: num(errors, "laws.faunaRichness", i.laws?.faunaRichness, DEFAULT_LAWS.faunaRichness, 0.2, 2), ecoResilience: num(errors, "laws.ecoResilience", i.laws?.ecoResilience, DEFAULT_LAWS.ecoResilience, 0.3, 2) };
    const cal = normalizeCalendar(i.calendar);
    errors.push(...cal.errors);
    const prehistoryYears = num(errors, "prehistory.years", i.prehistory?.years, PREHISTORY_YEARS, 2e4, 2e6);
    const neolithicYears = num(errors, "prehistory.neolithicYears", i.prehistory?.neolithicYears, NEOLITHIC_YEARS, 1e3, 6e4);
    const config = { schema: CONFIG_SCHEMA, name, worldSeed: sp.spec.worldSeed, spec: sp.spec, laws, calendar: cal.calendar, prehistory: { years: prehistoryYears, neolithicYears }, detail: i.detail === "light" || i.detail === "fine" ? i.detail : "standard" };
    return { config, errors };
  }
  function derivedSeeds(config) {
    return { geography: config.worldSeed, prehistory: hashSeed(config.worldSeed, "prehistory", config.schema, config.prehistory.years), lineage: hashSeed(config.worldSeed, "lineage"), ecosystem: hashSeed(config.worldSeed, "ecosystem") };
  }

  // js/core/wcde/prehistory.js
  init_ids();
  init_civ_state();
  init_tick();
  init_culture();
  init_events();

  // js/core/civ/population.js
  init_civ_state();
  init_events();

  // js/core/civ/techfx.js
  init_tech();
  var dmMemo = /* @__PURE__ */ new WeakMap();
  var densityMult = (g) => {
    const c = g.tech.cand;
    let v = c ? dmMemo.get(c) : void 0;
    if (v === void 0) {
      let s = 0;
      for (const k in g.tech.known) {
        const t = TECH[k];
        if (t && t.col >= 3 && t.fx.cap) s += t.fx.cap;
      }
      v = 1 + 1.4 * (1 - Math.exp(-s / 1.4));
      if (c) dmMemo.set(c, v);
    }
    return v;
  };
  var milMult = (state, civ3 = null) => {
    let s = 0;
    for (const k in state.techAdopted) {
      const t = TECH[k];
      if (t) s += fxOf(civ3, t).off ?? 0;
    }
    return (state.martial ?? 1) * (1 + s) * (1 + (state.milBonus ?? 0));
  };
  var taxMult = (state, civ3 = null) => {
    let s = 0;
    for (const k in state.techAdopted) {
      const t = TECH[k];
      if (t) s += fxOf(civ3, t).tax ?? 0;
    }
    return 1 + s;
  };

  // js/core/civ/population.js
  init_tech();
  init_world_consts();
  init_graph();
  init_species();
  var SUBSISTENCE = Object.freeze({ forage: "\u63A1\u96C6\u72E9\u731F", pastoral: "\u7267\u755C", agriculture: "\u8FB2\u8015", fishing: "\u6F01\u6488" });
  var POP = Object.freeze({
    growthPerMonth: 12e-4,
    minBudPop: 160,
    budShare: 0.35,
    budCooldown: 24,
    budPressure: 0.85,
    settleMinPop: 250,
    settleMinMonths: 24,
    villageMin: 100,
    townMin: 1500,
    cityMin: 1e4,
    settledShare: 0.7,
    moveRange: { forage: 9, pastoral: 14, agriculture: 7, fishing: 9 },
    waterCost: 6,
    famineRatio: 1.3,
    famineGap: 60,
    overshootDeath: 2e-3,
    noTargetBackoff: 60,
    territoryKm2: 14e3,
    agriTerritoryKm2: 6e3
    // 集団が使う領域の広さ（km²）。セルの大きさ（世界の解像度）に依存させない
  });
  var cacheOf2 = /* @__PURE__ */ new WeakMap();
  var terrain = (world) => {
    let t = cacheOf2.get(world);
    if (t) return t;
    const N2 = world.mesh.cellCount;
    t = { move: new Float32Array(N2).fill(-1) };
    cacheOf2.set(world, t);
    return t;
  };
  function stepCost(world, c, seafaring) {
    const w = world.cell.landWater[c];
    if (w !== LAND_WATER2.LAND) return seafaring >= 1 ? POP.waterCost : null;
    const t = terrain(world);
    if (t.move[c] >= 0) return t.move[c];
    const cell = world.cell, b = cell.biome[c];
    let k = 1;
    if (cell.mountain[c] > 0.5 || b === BIOMES2.ALPINE) k += 2.5;
    else if (cell.mountain[c] > 0.25) k += 1;
    if (b === BIOMES2.HOT_DESERT || b === BIOMES2.ICE) k += 2;
    else if (b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA || b === BIOMES2.RAINFOREST) k += 0.8;
    if (cell.river[c]) k += 0.3;
    t.move[c] = k;
    return k;
  }
  var budgetKm2 = (subsistence) => subsistence === "agriculture" ? POP.agriTerritoryKm2 : POP.territoryKm2;
  var COVER = 0.2;
  var cellBudgetKm2 = (world, c, subsistence) => Math.max(budgetKm2(subsistence), world.cell.areaKm2[c] * COVER);
  function cellDensity(world, c, subsistence, knowledge) {
    const cell = world.cell;
    if (cell.landWater[c] !== LAND_WATER2.LAND) return 0;
    const fert = cell.fertility[c], b = cell.biome[c], forage = 0.04 * (0.3 + fert);
    switch (subsistence) {
      case "agriculture":
        return Math.max(forage, (cell.capacity[c] ?? 0) / cell.areaKm2[c] * 0.6 * Math.min(1, 0.4 + 0.6 * (knowledge?.agriculture ?? 1)));
      case "fishing":
        return cell.coastDist[c] <= 1 || cell.river[c] ? 0.1 * (0.4 + 0.6 * fert) : forage * 0.5;
      case "pastoral":
        return b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA ? 0.1 * (0.5 + fert) : forage * 0.6;
      default:
        return forage;
    }
  }
  var cellCapacity = (world, c, subsistence, knowledge) => cellDensity(world, c, subsistence, knowledge) * Math.min(world.cell.areaKm2[c], cellBudgetKm2(world, c, subsistence));
  function territoryOf(world, c) {
    const m = world.mesh, out = [c];
    let area = world.cell.areaKm2[c];
    for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1] && area < POP.territoryKm2; k++) {
      const n2 = m.neighborIds[k];
      if (world.cell.landWater[n2] === LAND_WATER2.LAND) {
        out.push(n2);
        area += world.cell.areaKm2[n2];
      }
    }
    return out;
  }
  var ensureCells = (world, g) => g.cells ?? (g.cells = territoryOf(world, g.cell));
  function occupancy(world, civ3) {
    const occ = /* @__PURE__ */ new Map();
    for (const id in civ3.groups) for (const c of ensureCells(world, civ3.groups[id])) occ.set(c, (occ.get(c) ?? 0) + 1);
    return occ;
  }
  function groupCapacity(world, g, occ) {
    let k = 0, left = cellBudgetKm2(world, g.cell, g.subsistence);
    const tm = densityMult(g);
    for (const c of ensureCells(world, g)) {
      if (left <= 0) break;
      const a = Math.min(world.cell.areaKm2[c], left);
      k += cellDensity(world, c, g.subsistence, g.knowledge) * a / (occ.get(c) ?? 1);
      left -= a;
    }
    return k;
  }
  function reachable(world, from, budget, seafaring = 0) {
    const m = world.mesh, dist = /* @__PURE__ */ new Map([[from, 0]]), hd = [0], hc = [from];
    const push2 = (d, c) => {
      let i = hd.length;
      hd.push(d);
      hc.push(c);
      while (i > 0) {
        const p = i - 1 >> 1;
        if (hd[p] <= d) break;
        hd[i] = hd[p];
        hc[i] = hc[p];
        i = p;
      }
      hd[i] = d;
      hc[i] = c;
    };
    const pop = () => {
      const d0 = hd[0], c0 = hc[0], ld = hd.pop(), lc = hc.pop(), n2 = hd.length;
      if (n2) {
        let i = 0;
        for (; ; ) {
          let k = 2 * i + 1;
          if (k >= n2) break;
          if (k + 1 < n2 && hd[k + 1] < hd[k]) k++;
          if (hd[k] >= ld) break;
          hd[i] = hd[k];
          hc[i] = hc[k];
          i = k;
        }
        hd[i] = ld;
        hc[i] = lc;
      }
      return [d0, c0];
    };
    while (hd.length) {
      const [d, c] = pop();
      if (d > dist.get(c)) continue;
      for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
        const n2 = m.neighborIds[k], s = stepCost(world, n2, seafaring);
        if (s == null) continue;
        const nd = d + s;
        if (nd <= budget && nd < (dist.get(n2) ?? Infinity)) {
          dist.set(n2, nd);
          push2(nd, n2);
        }
      }
    }
    return dist;
  }
  function bestTargets(world, civ3, g, occ, limit = 3) {
    const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] ?? 9, g.knowledge.seafaring), out = [];
    for (const [c, d] of dist) {
      if (c === g.cell || world.cell.landWater[c] !== LAND_WATER2.LAND || occ.has(c)) continue;
      const cap = cellCapacity(world, c, g.subsistence, g.knowledge);
      if (cap <= 0) continue;
      out.push({ cell: c, cost: d, score: cap / (1 + d * 0.35) });
    }
    out.sort((a, b) => b.score - a.score || a.cell - b.cell);
    return out.slice(0, limit);
  }
  var stageOf = (p) => p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village";
  var STAGE_JA = { village: "\u6751", town: "\u753A", city: "\u90FD\u5E02" };
  function inheritTech(known, pop) {
    const out = {};
    for (const t of TECHS) if (known[t.key] != null && t.minPop * 0.5 <= pop && t.prereq.every((p) => out[p] != null)) out[t.key] = known[t.key];
    return out;
  }
  function spawnGroup(civ3, ids, parent, cell, pop) {
    const id = ids.next("pop");
    const g = newGroup(id, { cell, pop, subsistence: parent.subsistence, species: parent.speciesId, bornAt: civ3.monthIndex, knowledge: parent.knowledge, parent: parent.id });
    g.stateId = parent.stateId;
    g.cohorts = parent.cohorts.map((c) => ({ ...c, tension: 0 }));
    g.tech = { known: inheritTech(parent.tech.known, pop), prog: {}, lost: {} };
    refreshCand(g);
    for (const [k, v] of Object.entries({ agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" })) g.knowledge[v] = g.tech.known[k] != null ? 1 : 0;
    civ3.groups[id] = g;
    return g;
  }
  function foundSettlement(world, civ3, ids, g, cause = null) {
    let best = g.cell, bs = -1;
    for (const c of ensureCells(world, g)) {
      const s2 = world.cell.fertility[c] + (world.cell.river[c] ? 0.4 : 0) + (world.cell.coastDist[c] <= 1 ? 0.2 : 0);
      if (s2 > bs) {
        bs = s2;
        best = c;
      }
    }
    const id = ids.next("settle"), s = { id, groupId: g.id, cell: best, foundedAt: civ3.monthIndex, pop: Math.round(g.pop * POP.settledShare), stage: "village" };
    civ3.settlements[id] = s;
    g.settlementId = id;
    makeEvent(civ3, ids, { kind: "settlement_founded", title: "\u96C6\u843D\u306E\u6210\u7ACB", participants: [{ entityId: g.id, role: "founder" }, { entityId: id, role: "settlement" }], location: { cell: best }, causes: cause ? [{ targetId: cause, relation: "caused_by", basis: "direct" }] : [] });
    return s;
  }
  function stepPopulation(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, occ = occupancy(world, civ3), mi = civ3.monthIndex;
    for (const id of sortedGroupIds(civ3)) {
      const g = civ3.groups[id];
      if (!g) continue;
      const K = Math.max(1, groupCapacity(world, g, occ) * (g.capUntil > mi ? g.capMult : 1) * (ctx.ecoMult ? ctx.ecoMult(g) : 1)), pressure = g.pop / K, gm = (ctx.growthMult ? ctx.growthMult(g.cell) : 1) * (ctx.stateMult ? ctx.stateMult(g) : 1) * speciesOf(g.speciesId, civ3).growth * (civ3.options.growthScale ?? 1);
      const noise = 0.8 + 0.4 * rng();
      g.pop = Math.max(0, g.pop + g.pop * POP.growthPerMonth * (1 - pressure) * noise * gm - (pressure > 1 ? g.pop * POP.overshootDeath * (pressure - 1) : 0));
      if (pressure > POP.famineRatio && mi - g.famineAt >= POP.famineGap) {
        g.famineAt = mi;
        makeEvent(civ3, ids, { kind: "famine", title: "\u98E2\u3048", participants: [{ entityId: g.id, role: "sufferer" }], location: { cell: g.cell }, causes: asCauses(recentEventsFor(civ3, [g.id], ["disaster_struck"], 36, 1), "caused_by", "strong"), effects: [{ targetId: g.id, property: "pop", before: Math.round(g.pop), after: Math.round(g.pop) }] });
      }
      if (g.pop < 5) {
        delete civ3.groups[id];
        if (g.settlementId) delete civ3.settlements[g.settlementId];
        makeEvent(civ3, ids, { kind: "group_extinct", title: "\u96C6\u56E3\u306E\u6D88\u6EC5", participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell } });
        continue;
      }
      g.settledMonths = g.order ? 0 : g.settledMonths + 1;
      if (g.order?.type === "move" && mi >= g.order.arriveAt) {
        g.cell = g.order.to;
        g.cells = null;
        g.order = null;
        g.settledMonths = 0;
        g.settlementId = null;
        makeEvent(civ3, ids, { kind: "group_moved", title: "\u96C6\u56E3\u306E\u79FB\u52D5\u5B8C\u4E86", participants: [{ entityId: g.id, role: "mover" }], location: { cell: g.cell } });
      }
      g.pressure = pressure;
      const c = g.cell, ce = world.cell;
      const want = g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 ? "agriculture" : g.subsistence === "forage" && g.knowledge.herding >= 1 ? "pastoral" : null;
      if (want) {
        if (g.player) addProposal(civ3, ids, g, "change_subsistence", { subsistence: want });
        else {
          const before = g.subsistence;
          g.subsistence = want;
          makeEvent(civ3, ids, { kind: "subsistence_changed", title: `\u751F\u696D\u306E\u8EE2\u63DB\uFF08${SUBSISTENCE[before]}\u2192${SUBSISTENCE[want]}\uFF09`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: want }] });
        }
      }
      if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop && g.settledMonths >= POP.settleMinMonths) {
        if (g.player) addProposal(civ3, ids, g, "found_settlement", {});
        else foundSettlement(world, civ3, ids, g);
      }
      const st2 = g.settlementId ? civ3.settlements[g.settlementId] : null;
      if (st2) {
        st2.pop = Math.round(g.pop * POP.settledShare);
        const ns = stageOf(st2.pop);
        if (ns !== st2.stage) {
          const old = st2.stage;
          st2.stage = ns;
          makeEvent(civ3, ids, { kind: "settlement_stage", title: `${STAGE_JA[old]}\u304B\u3089${STAGE_JA[ns]}\u3078`, participants: [{ entityId: st2.id, role: "settlement" }], location: { cell: st2.cell }, causes: asCauses(recentEventsFor(civ3, [g.id], ["disaster_struck", "famine"], 24, 1), "contributed_to", "plausible") });
        }
      }
      if (pressure > POP.budPressure && g.pop >= POP.minBudPop * 2 && mi - g.lastBudAt >= POP.budCooldown && !g.order) {
        const targets = bestTargets(world, civ3, g, occ, 3);
        if (targets.length) {
          if (g.player) addProposal(civ3, ids, g, "split", { targets });
          else {
            const t = targets[0], moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            g.lastBudAt = mi;
            const child = spawnGroup(civ3, ids, g, t.cell, moved);
            occ.set(t.cell, 1);
            for (const x of ensureCells(world, child)) occ.set(x, (occ.get(x) ?? 0) + 1);
            makeEvent(civ3, ids, { kind: "group_split", title: "\u96C6\u56E3\u306E\u5206\u6D3E", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t.cell }, causes: asCauses(recentEventsFor(civ3, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible") });
          }
        } else g.lastBudAt = mi - POP.budCooldown + POP.noTargetBackoff;
      }
    }
  }
  function addProposal(civ3, ids, g, kind, payload) {
    if (civ3.proposals.some((p) => p.groupId === g.id && p.kind === kind && !p.resolved)) return;
    civ3.proposals.push({ proposalId: ids.next("proposal"), date: { ...civ3.date }, groupId: g.id, kind, payload, resolved: false });
  }

  // js/core/wcde/prehistory.js
  init_tech();

  // js/core/wcde/domains/ecosystem.js
  init_world_consts();
  var FAUNA_BIOME = { [BIOMES2.SAVANNA]: 1, [BIOMES2.GRASSLAND]: 0.9, [BIOMES2.TROPICAL_SEASONAL]: 0.85, [BIOMES2.TEMPERATE_FOREST]: 0.75, [BIOMES2.RAINFOREST]: 0.65, [BIOMES2.WETLAND]: 0.8, [BIOMES2.TAIGA]: 0.45, [BIOMES2.TUNDRA]: 0.4, [BIOMES2.ALPINE]: 0.3, [BIOMES2.COLD_DESERT]: 0.2, [BIOMES2.HOT_DESERT]: 0.12, [BIOMES2.ICE]: 0.05 };
  var FLORA_BIOME = { [BIOMES2.RAINFOREST]: 1, [BIOMES2.TROPICAL_SEASONAL]: 0.9, [BIOMES2.TEMPERATE_FOREST]: 0.85, [BIOMES2.SAVANNA]: 0.65, [BIOMES2.GRASSLAND]: 0.7, [BIOMES2.WETLAND]: 0.8, [BIOMES2.TAIGA]: 0.5, [BIOMES2.TUNDRA]: 0.25, [BIOMES2.ALPINE]: 0.2, [BIOMES2.COLD_DESERT]: 0.15, [BIOMES2.HOT_DESERT]: 0.08, [BIOMES2.ICE]: 0.02 };
  var TAU = { flora: 6, fauna: 30, deg: 400 };
  var q3 = (x) => Math.round(x * 1e3) / 1e3;
  var clamp2 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  function potentialAt(world, c, laws, ice = 0) {
    const ce = world.cell, b = ce.biome[c];
    if (ce.landWater[c] !== LAND_WATER2.LAND) return { flora: 0, fauna: 0 };
    const lat = Math.abs(ce.lat[c]) * 180 / Math.PI, ik = 1 - ice * 0.65 * clamp2((lat - 35) / 35), water = ce.river[c] || ce.coastDist[c] <= 2 ? 1.1 : 1, fert = 0.55 + 0.6 * ce.fertility[c];
    return { flora: clamp2((FLORA_BIOME[b] ?? 0.3) * fert * ik * (laws?.fertilityScale ?? 1)), fauna: clamp2((FAUNA_BIOME[b] ?? 0.3) * (0.6 + 0.5 * ce.fertility[c]) * water * ik * (laws?.faunaRichness ?? 1)) };
  }
  function initEco(world, laws, ice = 0) {
    const N2 = world.mesh.cellCount, flora = new Array(N2).fill(0), fauna = new Array(N2).fill(0), deg = new Array(N2).fill(0);
    for (let c = 0; c < N2; c++) {
      const p = potentialAt(world, c, laws, ice);
      flora[c] = q3(p.flora);
      fauna[c] = q3(p.fauna);
    }
    return { v: 1, flora, fauna, deg, last: null, stats: { hunted: 0, tilled: 0 } };
  }
  function stepEco(world, civ3, groups, dt, { ice = 0, laws = civ3.wcde.config.laws, cellsOf = (g) => g.cells ?? [g.cell] } = {}) {
    const eco = civ3.eco ?? (civ3.eco = initEco(world, laws, ice)), N2 = world.mesh.cellCount, res = laws.ecoResilience ?? 1;
    const hunt = new Float32Array(N2), till = new Float32Array(N2), graze = new Float32Array(N2);
    for (const g of groups) {
      const cells = cellsOf(g), n2 = Math.max(1, cells.length), p = clamp2(g.pressure ?? 0, 0, 2) / n2, k = g.knowledge ?? {};
      for (const c of cells) {
        if (g.subsistence === "agriculture" && (k.agriculture ?? 0) >= 1) till[c] += p;
        else if (g.subsistence === "pastoral" && (k.herding ?? 0) >= 1) graze[c] += p;
        else hunt[c] += p;
        if (g.subsistence !== "agriculture") hunt[c] += 0.25 * p;
      }
    }
    const kf = 1 - Math.exp(-dt * res / TAU.flora), kn = 1 - Math.exp(-dt * res / TAU.fauna), kd = 1 - Math.exp(-dt * res / TAU.deg);
    let hs = 0, ts = 0;
    for (let c = 0; c < N2; c++) {
      const pot = potentialAt(world, c, laws, ice);
      if (pot.flora === 0 && pot.fauna === 0) continue;
      let d = eco.deg[c];
      const dUp = (0.012 * till[c] + 0.02 * graze[c]) * dt;
      d = clamp2(d + dUp - kd * d * (till[c] + graze[c] > 0.05 ? 0.15 : 1));
      eco.deg[c] = q3(d);
      ts += till[c] + graze[c];
      const tf = pot.flora * (1 - 0.7 * d) * (1 - 0.35 * clamp2(graze[c])) * (1 - 0.15 * clamp2(till[c]));
      eco.flora[c] = q3(clamp2(eco.flora[c] + (tf - eco.flora[c]) * kf));
      const tn = pot.fauna * Math.pow(Math.max(0.05, eco.flora[c] / Math.max(0.05, pot.flora)), 0.6) * (1 - 0.8 * clamp2(hunt[c] * 1.4));
      eco.fauna[c] = q3(clamp2(eco.fauna[c] + (tn - eco.fauna[c]) * kn));
      hs += hunt[c];
    }
    eco.last = civ3.monthIndex;
    eco.stats.hunted = q3(hs);
    eco.stats.tilled = q3(ts);
    return eco;
  }
  function ecoHealth(world, civ3, g, cellsOf = (x) => x.cells ?? [x.cell]) {
    const eco = civ3.eco;
    if (!eco) return 1;
    const cells = cellsOf(g);
    let f = 0, a = 0, d = 0, n2 = 0;
    for (const c of cells) {
      const p = potentialAt(world, c, civ3.wcde?.config?.laws);
      if (p.flora === 0 && p.fauna === 0) continue;
      n2++;
      f += p.flora > 0 ? eco.flora[c] / p.flora : 1;
      a += p.fauna > 0 ? eco.fauna[c] / p.fauna : 1;
      d += eco.deg[c];
    }
    if (!n2) return 1;
    f = clamp2(f / n2);
    a = clamp2(a / n2);
    d /= n2;
    switch (g.subsistence) {
      case "agriculture":
        return clamp2(1 - d * 0.9);
      case "pastoral":
        return clamp2(0.2 + 0.8 * f);
      case "fishing":
        return clamp2(0.3 + 0.7 * a);
      default:
        return clamp2(0.15 + 0.45 * f + 0.4 * a);
    }
  }
  var ecoMult = (world, civ3, g) => 0.55 + 0.6 * ecoHealth(world, civ3, g);
  function stepEcosystem(ctx) {
    const { world, civ: civ3 } = ctx;
    if (!civ3.options.wcde) return;
    const mi = civ3.monthIndex, laws = civ3.wcde.config.laws, cl = civ3.climate?.index ?? 0, ice = clamp2(-cl * 0.4);
    const groups = Object.values(civ3.groups), before = civ3.eco ? civ3.eco.stats.hunted : 0;
    stepEco(world, civ3, groups, 1, { ice, laws });
    void before;
  }
  function ecoSummary(world, civ3) {
    const eco = civ3.eco;
    if (!eco) return null;
    const N2 = world.mesh.cellCount;
    let n2 = 0, f = 0, a = 0, bad3 = 0;
    for (let c = 0; c < N2; c++) {
      if (world.cell.landWater[c] !== LAND_WATER2.LAND) continue;
      n2++;
      f += eco.flora[c];
      a += eco.fauna[c];
      if (eco.deg[c] > 0.4) bad3++;
    }
    return n2 ? { cells: n2, flora: q3(f / n2), fauna: q3(a / n2), degraded: q3(bad3 / n2) } : null;
  }
  function checkEco(world, civ3) {
    const errs = [], e = civ3.eco;
    if (!e) return errs;
    const N2 = world.mesh.cellCount;
    for (const k of ["flora", "fauna", "deg"]) {
      if (!Array.isArray(e[k]) || e[k].length !== N2) {
        errs.push(`eco.${k} \u306E\u9577\u3055\u304C\u30BB\u30EB\u6570\u3068\u5408\u308F\u306A\u3044`);
        continue;
      }
      for (let i = 0; i < N2; i++) {
        const v = e[k][i];
        if (!(v >= 0 && v <= 1)) {
          errs.push(`eco.${k}[${i}] \u304C 0\u301C1 \u3067\u306A\u3044: ${v}`);
          break;
        }
      }
    }
    return errs;
  }

  // js/core/wcde/prehistory.js
  init_species();
  init_world_consts();
  var PREHISTORY_STEP_YEARS = 2500;
  var LEARN_EVERY = 4;
  var preBoost = (f) => 0.6 + 6 * f ** 3 + 3e3 * Math.max(0, f - 0.85) ** 2;
  var isPrehistoricTech = (t) => t.pre;
  var RIPEN_YEARS = 400;
  var FAR_SCALES = [1, 2, 3.5];
  var gateYears = (neo) => ({ seafaring: 6e4, pottery: 2e4, agriculture: neo, pastoralism: neo - 500, construction: neo - 500 });
  var LOCAL_SCALE = 0.4;
  var SPREAD_P = 0.6;
  var SPREAD_HOPS = 12;
  var EPOCHS = 20;
  var DEG = Math.PI / 180;
  function createWcdeCiv(world, config, { historySeed = null } = {}) {
    const seeds = derivedSeeds(config), start2 = -Math.round(config.prehistory.years);
    const civ3 = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(config.worldSeed, "history"), seq: {}, date: fromMonthIndex(monthIndex(start2, 1)), monthIndex: monthIndex(start2, 1), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
    civ3.options = { aiInterval: 6, wcde: true, magic: false, growthScale: config.laws.fertilityScale, disasterRate: config.laws.disasterRate, climateVolatility: config.laws.climateVolatility };
    civ3.wcde = { v: 1, phase: "prehistory", config, seeds, startMonth: civ3.monthIndex, prehistory: null, candidates: [], control: { stateId: null }, cmdIds: [], diagnostics: [], edits: [] };
    return civ3;
  }
  var clamp3 = (v, a, b) => v < a ? a : v > b ? b : v;
  var glacialAt = (frac, years, phase, vol) => vol <= 0 ? 0 : clamp3(vol, 0, 3) / 3 * Math.max(0, Math.sin(frac * years / 1e5 * 2 * Math.PI + phase)) ** 2;
  var iceMult = (lat, ice) => 1 - ice * 0.65 * clamp3((Math.abs(lat) / DEG - 35) / 35, 0, 1);
  function landComponents(world, landCells) {
    const m = world.mesh, comp = new Int32Array(m.cellCount).fill(-1), sizes = [];
    for (const s of landCells) {
      if (comp[s] >= 0) continue;
      const id = sizes.length, q2 = [s];
      comp[s] = id;
      let n2 = 0;
      while (q2.length) {
        const c = q2.pop();
        n2++;
        for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
          const o = m.neighborIds[k];
          if (comp[o] < 0 && world.cell.landWater[o] === LAND_WATER2.LAND) {
            comp[o] = id;
            q2.push(o);
          }
        }
      }
      sizes.push(n2);
    }
    return { comp, sizes };
  }
  function targetsFor(world, g, occ, res, limit, scale = 1) {
    const dist = reachable(world, g.cell, (POP.moveRange[g.subsistence] ?? 9) * res * scale, g.knowledge.seafaring), out = [];
    for (const [c, d] of dist) {
      if (c === g.cell || world.cell.landWater[c] !== LAND_WATER2.LAND || occ.has(c)) continue;
      const cap = cellCapacity(world, c, g.subsistence, g.knowledge);
      if (cap <= 0) continue;
      out.push({ cell: c, cost: d, score: cap / (1 + d / res * 0.35) });
    }
    out.sort((a, b) => b.score - a.score || a.cell - b.cell);
    return out.slice(0, limit);
  }
  var stageOf2 = (p) => p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village";
  function runPrehistory(world, civ3, { stepYears = PREHISTORY_STEP_YEARS, onProgress = null } = {}) {
    const cfg = civ3.wcde.config, ids = createIdGen(civ3.seq), seed = civ3.wcde.seeds.prehistory, years = cfg.prehistory.years;
    const steps = Math.max(1, Math.round(years / stepYears)), stepMonths = years * 12 / steps, start2 = civ3.wcde.startMonth;
    const phase0 = hashSeed(seed, "ice") % 1e3 / 1e3 * Math.PI * 2, vol = cfg.laws.climateVolatility;
    const stats = { steps, stepYears: years / steps, species: {}, firstTech: {}, peakGroups: 0, glacialMax: 0, seaCrossings: 0, settlements: 0, budSearches: 0, farSearches: 0, extinct: 0 };
    const order = [], occ = /* @__PURE__ */ new Map(), home = /* @__PURE__ */ new Map(), addOcc = (g) => {
      for (const c of g.cells) {
        occ.set(c, (occ.get(c) ?? 0) + 1);
        home.set(c, g.id);
      }
    }, subOcc = (g) => {
      for (const c of g.cells) {
        const n2 = (occ.get(c) ?? 1) - 1;
        if (n2 <= 0) {
          occ.delete(c);
          home.delete(c);
        } else {
          occ.set(c, n2);
          if (home.get(c) === g.id) home.delete(c);
        }
      }
    };
    const ce = world.cell, N2 = world.mesh.cellCount;
    const envFit = (sp, b) => !sp.env?.length ? 1 : sp.env.includes(b) ? 1 : 0.3;
    const speciesIn = (id) => speciesOf(id, civ3);
    const note3 = (kind, title, parts, g, causes = []) => makeEvent(civ3, ids, { kind, title, participants: parts, location: g ? { cell: g.cell } : null, causes, provenance: "simulation" });
    const KB = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
    let pending = [];
    const learn2 = (g, key, mi) => {
      var _a;
      const t = TECH[key];
      g.tech.known[key] = mi;
      delete g.tech.prog[key];
      refreshCand(g);
      if (KB[key]) g.knowledge[KB[key]] = 1;
      const prior = civ3.techWorld[key], rec = (_a = civ3.techWorld)[key] ?? (_a[key] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {}, firstGroupId: g.id });
      rec.independent++;
      if (!prior) {
        stats.firstTech[key] = mi;
        rec.firstEventId = note3("tech_discovered", `${t.name}\u3092\u521D\u3081\u3066\u767A\u898B`, [{ entityId: g.id, role: "discoverer" }], g).eventId;
      }
      pending.push({ g, key, d: 0 });
    };
    const neighborsOf = (g) => {
      const out = /* @__PURE__ */ new Set(), m = world.mesh;
      for (const c of g.cells) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
        const o = home.get(m.neighborIds[k]);
        if (o && o !== g.id) out.add(o);
      }
      return [...out].sort();
    };
    const spread = (mi, rng) => {
      let q2 = pending;
      pending = [];
      for (let qi = 0; qi < q2.length; qi++) {
        const { g, key, d } = q2[qi], t = TECH[key];
        if (!civ3.groups[g.id]) continue;
        const dom = g.cohorts[0];
        for (const oid of neighborsOf(g)) {
          const o = civ3.groups[oid];
          if (!o || o.tech.known[key] != null || !t.prereq.every((p) => o.tech.known[p] != null) || o.pop < t.minPop || key === "seafaring" && ce.coastDist[o.cell] > 1) continue;
          if (rng() >= SPREAD_P + (o.cohorts[0].cultureId === dom.cultureId ? 0.15 : 0)) continue;
          o.tech.known[key] = mi;
          delete o.tech.prog[key];
          refreshCand(o);
          if (KB[key]) o.knowledge[KB[key]] = 1;
          stats.transfers = (stats.transfers ?? 0) + 1;
          {
            const rec = civ3.techWorld[key];
            if (rec) {
              rec.spread++;
              rec.byChannel.contact = (rec.byChannel.contact ?? 0) + 1;
            }
          }
          if (d + 1 < SPREAD_HOPS) q2.push({ g: o, key, d: d + 1 });
          else pending.push({ g: o, key, d: 0 });
        }
      }
    };
    const mk = (cell, pop, speciesId, parentCulture = null) => {
      const id = ids.next("pop"), g = newGroup(id, { cell, pop, subsistence: "forage", species: speciesId, bornAt: civ3.monthIndex });
      const rng = ctxRng;
      const cu = createCulture(civ3, ids, rng, { parent: parentCulture, cell }), lg = createLanguage(civ3, ids, rng, { cultureId: cu });
      g.cohorts = [{ cultureId: cu, languageId: lg, religionId: null, speciesId, share: 1, tension: 0, interest: null }];
      g.tech.known.stone_tools = civ3.monthIndex;
      refreshCand(g);
      g.cells = territoryOf(world, cell);
      g.gen = 0;
      civ3.groups[id] = g;
      order.push(id);
      addOcc(g);
      return g;
    };
    let ctxRng = rngOf(hashSeed(seed, "init"));
    const landCells = [];
    for (let c = 0; c < N2; c++) if (ce.landWater[c] === LAND_WATER2.LAND) landCells.push(c);
    if (!landCells.length) throw new Error("\u9678\u5730\u304C\u306A\u3044\u4E16\u754C\u3067\u306F\u5148\u53F2\u3092\u9032\u3081\u3089\u308C\u307E\u305B\u3093");
    const score = (c, sp) => {
      const b = ce.biome[c], base = ce.fertility[c] * 0.6 + (ce.coastDist[c] <= 3 || ce.river[c] ? 0.3 : 0) + Math.min(1, (ce.capacity[c] ?? 0) / (ce.areaKm2[c] || 1)) * 0.4;
      return base * envFit(sp, b);
    };
    const { comp, sizes } = landComponents(world, landCells), bigMin = Math.min(Math.max(...sizes), Math.max(20, landCells.length * 0.1));
    const archaic = SPECIES.archaic, hcands = landCells.filter((c) => sizes[comp[c]] >= bigMin && Math.abs(ce.lat[c]) < 35 * DEG && [BIOMES2.SAVANNA, BIOMES2.TROPICAL_SEASONAL, BIOMES2.GRASSLAND, BIOMES2.TEMPERATE_FOREST].includes(ce.biome[c])).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b);
    const pool = (hcands.length ? hcands : landCells.filter((c) => sizes[comp[c]] >= bigMin).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b)).slice(0, 10), origin = pool[Math.floor(ctxRng() * pool.length)];
    civ3.monthIndex = start2;
    civ3.date = fromMonthIndex(start2);
    const hg = mk(origin, 120, "archaic");
    civ3.species.archaic = { id: "archaic", name: "\u53E4\u4EE3\u578B\u4EBA\u985E", bornAt: start2 };
    note3("species_emerged", "\u53E4\u4EE3\u578B\u4EBA\u985E\u306E\u96C6\u56E3\u304C\u73FE\u308C\u305F", [{ entityId: "archaic", role: "species" }, { entityId: hg.id, role: "first_group" }], hg);
    stats.species.archaic = { at: start2, cell: origin };
    const modernAt = Math.floor(steps * (0.3 + 0.25 * (hashSeed(civ3.wcde.seeds.lineage, "modern") % 1e3) / 1e3));
    let modernDone = false;
    stats.assimilated = 0;
    let areaSum = 0;
    for (const c of landCells) areaSum += ce.areaKm2[c];
    const res = clamp3(Math.sqrt(POP.territoryKm2 * 1.5 / (areaSum / landCells.length)), 1, 6);
    stats.moveScale = Math.round(res * 100) / 100;
    const baseRate = POP.growthPerMonth * 12, gate = gateYears(cfg.prehistory.neolithicYears ?? 1e4);
    let Kworld = 0;
    for (const c of landCells) Kworld += 0.04 * (0.3 + ce.fertility[c]) * ce.areaKm2[c];
    civ3.eco = initEco(world, cfg.laws, 0);
    let worldPop = 120, lastEpoch = -1, epochs = 0;
    const cultRel = /* @__PURE__ */ new Map();
    stats.epochs = [];
    for (let step = 0; step < steps; step++) {
      const mi = start2 + Math.round(step * stepMonths);
      civ3.monthIndex = mi;
      civ3.date = fromMonthIndex(mi);
      const frac = step / steps, ice = glacialAt(frac, years, phase0, vol);
      if (ice > stats.glacialMax) stats.glacialMax = ice;
      const rng = ctxRng = rngOf(hashSeed(seed, "step", step));
      if (!modernDone && step >= modernAt) {
        const cand3 = order.map((i) => civ3.groups[i]).filter((g) => g && g.speciesId === "archaic").sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1))[0];
        if (cand3) {
          modernDone = true;
          cand3.speciesId = "human";
          for (const c of cand3.cohorts) c.speciesId = "human";
          civ3.species.human = { id: "human", name: "\u4EBA\u9593", bornAt: mi };
          stats.species.human = { at: mi, cell: cand3.cell };
          note3("species_emerged", "\u73FE\u751F\u4EBA\u985E\u304C\u73FE\u308C\u305F", [{ entityId: "human", role: "species" }, { entityId: cand3.id, role: "first_group" }], cand3);
        }
      }
      if (modernDone) for (const id of order) {
        const g = civ3.groups[id];
        if (!g || g.speciesId !== "archaic") continue;
        const nearModern = neighborsOf(g).some((o) => civ3.groups[o]?.speciesId === "human"), u = hashSeed(seed, "assim", step, id) % 1e4 / 1e4;
        if (u < (nearModern ? 0.3 : 0.01)) {
          g.speciesId = "human";
          for (const c of g.cohorts) c.speciesId = "human";
          stats.assimilated++;
        }
      }
      spread(mi, rng);
      let total = 0, n2 = 0;
      for (let oi = 0; oi < order.length; oi++) {
        const id = order[oi], g = civ3.groups[id];
        if (!g) continue;
        n2++;
        const sp = speciesIn(g.speciesId), fit = envFit(sp, ce.biome[g.cell]);
        const K = Math.max(0.5, groupCapacity(world, g, occ) * fit * iceMult(ce.lat[g.cell], ice) * (g.capMult ?? 1) * ecoMult(world, civ3, g));
        const r = baseRate * sp.growth * (civ3.options.growthScale ?? 1) * (0.85 + 0.3 * rng()), N0 = Math.max(1, g.pop);
        g.pop = K / (1 + (K / N0 - 1) * Math.exp(-r * (stepMonths / 12)));
        g.pressure = g.pop / K;
        total += g.pop;
        if (g.pop < 5) {
          subOcc(g);
          delete civ3.groups[id];
          stats.extinct++;
          n2--;
          continue;
        }
        g.settledMonths = g.subsistence === "forage" || g.subsistence === "pastoral" ? 0 : g.settledMonths + stepMonths;
        if ((step + oi % LEARN_EVERY) % LEARN_EVERY === 0) {
          if (!g.tech.cand) refreshCand(g);
          const dt = stepMonths / 12 * LEARN_EVERY, env = { accel: accel(civ3, worldPop) * sp.techRate * preBoost(frac), contact: neighborsOf(g).length, rivals: 0 };
          for (const key of [...g.tech.cand]) {
            const t = TECH[key];
            if (!isPrehistoricTech(t) || gate[key] != null && mi < -gate[key] * 12) continue;
            let rate = emergenceRate(world, civ3, g, t, env);
            if (gate[key] != null) rate *= 1 + (mi + gate[key] * 12) / 12 / RIPEN_YEARS;
            if (rate <= 0 || u01(civ3, "pretech", step, g.id, key) >= pEmerge(rate, dt)) continue;
            learn2(g, key, mi);
          }
        }
        if (g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 && (ce.fertility[g.cell] >= 0.25 || ce.river[g.cell] || ce.coastDist[g.cell] <= 2)) g.subsistence = "agriculture";
        else if (g.subsistence === "forage") {
          const b = ce.biome[g.cell];
          if (g.knowledge.herding >= 1 && (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA)) g.subsistence = "pastoral";
          else if (g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1 && rng() < 0.4) g.subsistence = "fishing";
        }
        if (g.pressure > POP.budPressure && g.pop >= POP.minBudPop * 1.25 && (g.noTargetUntil ?? -1) <= step) {
          stats.budSearches++;
          const pick2 = (ts) => ts.find((x) => envFit(sp, ce.biome[x.cell]) >= 1) ?? ts[0];
          let t = pick2(targetsFor(world, g, occ, res, 6, Math.max(1 / res, LOCAL_SCALE)));
          if (!t && g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1) {
            stats.farSearches++;
            for (const sc of FAR_SCALES) {
              t = pick2(targetsFor(world, g, occ, res, 6, sc));
              if (t) break;
            }
          }
          if (!t) g.noTargetUntil = step + 6 + hashSeed(id) % 6;
          else {
            const moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            const child = spawnGroup(civ3, ids, g, t.cell, moved);
            child.cells = territoryOf(world, t.cell);
            child.gen = (g.gen ?? 0) + 1;
            child.settledMonths = 0;
            child.stateId = null;
            order.push(child.id);
            addOcc(child);
            if (ce.landWater[g.cell] === LAND_WATER2.LAND && g.knowledge.seafaring >= 1 && t.cost >= POP.waterCost * res * 0.5) {
              stats.seaCrossings++;
              if (stats.seaCrossings === 1) note3("sea_crossed", "\u6D77\u3092\u6E21\u3063\u3066\u65B0\u3057\u3044\u571F\u5730\u3078\u4EBA\u3005\u304C\u79FB\u3063\u305F", [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "settlers" }], child);
            }
            const co = child.cohorts[0];
            if (child.gen >= 8 && rng() < 0.5) {
              const nl = createLanguage(civ3, ids, rng, { parent: co.languageId, cultureId: co.cultureId });
              co.languageId = nl;
              if (child.gen >= 14 || rng() < 0.25) {
                const nc = createCulture(civ3, ids, rng, { parent: co.cultureId, cell: child.cell });
                co.cultureId = nc;
                child.gen = 0;
                if (co.religionId && rng() < 0.4) co.religionId = createReligion(civ3, ids, rng, { parent: co.religionId });
              }
            }
          }
        }
        {
          const co = g.cohorts[0];
          if (!co.religionId && frac > 0.15 && g.pop > 300) {
            const known = cultRel.get(co.cultureId);
            if (known) co.religionId = known;
            else if (rng() < 0.01) {
              co.religionId = createReligion(civ3, ids, rng);
              cultRel.set(co.cultureId, co.religionId);
            }
          } else if (co.religionId && !cultRel.has(co.cultureId)) cultRel.set(co.cultureId, co.religionId);
        }
      }
      worldPop = total;
      stepEco(world, civ3, order.map((i) => civ3.groups[i]).filter(Boolean), stepMonths / 12, { ice, laws: cfg.laws });
      if (n2 > stats.peakGroups) stats.peakGroups = n2;
      const ep = Math.floor(frac * EPOCHS);
      if (ep !== lastEpoch) {
        lastEpoch = ep;
        epochs++;
        {
          const sub2 = {};
          for (const id of order) {
            const g = civ3.groups[id];
            if (g) sub2[g.subsistence] = (sub2[g.subsistence] ?? 0) + 1;
          }
          stats.epochs.push({ ep, groups: n2, pop: Math.round(worldPop), x: Math.round(worldPop / Kworld * 100) / 100, ice: Math.round(ice * 100) / 100, sub: sub2 });
        }
        note3("prehistory_epoch", `\u5148\u53F2 \u7B2C${epochs}\u671F\u306E\u6982\u6CC1\uFF08\u96C6\u56E3 ${n2}\u30FB\u4EBA\u53E3 \u7D04${Math.round(worldPop)}\uFF09`, [], null).effects.push({ targetId: "world", property: "prehistory.pop", before: null, after: Math.round(worldPop) });
      }
      if (onProgress && step % 20 === 0) onProgress(step, steps);
    }
    civ3.monthIndex = monthIndex(0, 1);
    civ3.date = fromMonthIndex(civ3.monthIndex);
    for (const id of order) {
      const g = civ3.groups[id];
      if (!g) continue;
      g.lastBudAt = civ3.monthIndex - POP.budCooldown;
      g.noTargetUntil = void 0;
      g.famineAt = -999;
      g.cells = g.cells ?? territoryOf(world, g.cell);
      delete g.gen;
      delete g.noTargetUntil;
      delete g.capMult;
      if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop) {
        const sid = ids.next("settle");
        let best = g.cell, bs = -1;
        for (const c of g.cells) {
          const s = ce.fertility[c] + (ce.river[c] ? 0.4 : 0) + (ce.coastDist[c] <= 1 ? 0.2 : 0);
          if (s > bs) {
            bs = s;
            best = c;
          }
        }
        civ3.settlements[sid] = { id: sid, groupId: g.id, cell: best, foundedAt: civ3.monthIndex - 60, pop: Math.round(g.pop * POP.settledShare), stage: stageOf2(Math.round(g.pop * POP.settledShare)) };
        g.settlementId = sid;
        g.settledMonths = POP.settleMinMonths;
        stats.settlements++;
      }
      g.bornAt = Math.min(g.bornAt, civ3.monthIndex);
    }
    for (const id of order) {
      const g = civ3.groups[id];
      if (g && g.parent && !civ3.groups[g.parent]) g.parent = null;
    }
    stats.groups = Object.keys(civ3.groups).length;
    stats.pop = Math.round(Object.values(civ3.groups).reduce((s, g) => s + g.pop, 0));
    civ3.wcde.prehistory = stats;
    civ3.wcde.phase = "founding";
    return stats;
  }

  // js/core/wcde/domains/language.js
  init_civ_state();

  // js/core/civ/states.js
  init_events();
  init_culture();

  // js/core/wcde/domains/naming.js
  init_civ_state();
  var KN = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"];
  var kanjiNum = (n2) => n2 < 10 ? KN[n2] : n2 < 20 ? "\u5341" + KN[n2 % 10] : n2 < 100 ? KN[Math.floor(n2 / 10)] + "\u5341" + KN[n2 % 10] : String(n2);
  var FORMS = ["\u90E8\u65CF\u9023\u5408", "\u6559\u56E3\u56FD", "\u5E02\u56FD", "\u9996\u9577\u56FD", "\u5171\u548C\u56FD", "\u795E\u8056\u56FD", "\u738B\u56FD", "\u5E1D\u56FD", "\u9023\u5408", "\u540C\u76DF", "\u90E8\u65CF", "\u56FD"];
  function stateForm(polity, via = null) {
    switch (polity) {
      case "kingdom":
        return "\u738B\u56FD";
      case "empire":
        return "\u5E1D\u56FD";
      case "republic":
        return "\u5171\u548C\u56FD";
      case "theocracy":
        return "\u795E\u8056\u56FD";
      case "chiefdom":
        return via === "city_state" ? "\u5E02\u56FD" : "\u9996\u9577\u56FD";
      default:
        return via === "nomad_confederation" ? "\u90E8\u65CF\u9023\u5408" : via === "agri_union" ? "\u9023\u5408" : via === "defense_league" ? "\u540C\u76DF" : "\u90E8\u65CF";
    }
  }
  function baseOfState(st2) {
    if (st2.nameBase) return st2.nameBase;
    const n2 = String(st2.name ?? "");
    for (const f of FORMS) if (n2.length > f.length && n2.endsWith(f)) return n2.slice(0, -f.length);
    return n2;
  }
  var composeStateName = (base, polity, via) => base + stateForm(polity, via);
  function retitle(st2, polity) {
    if (!st2.nameBase && !FORMS.some((f) => String(st2.name).endsWith(f))) return null;
    const base = baseOfState(st2), next = composeStateName(base, polity, st2.via);
    return next !== st2.name ? { base, name: next } : null;
  }
  var REGNAL = /* @__PURE__ */ new Set(["chiefdom", "kingdom", "empire", "theocracy"]);
  var stripOrd = (n2) => String(n2).replace(/[0-9０-９]+世$/, "");
  var baseOfLeader = stripOrd;
  function leaderName(st2, fresh, rnd) {
    const raw = stripOrd(fresh);
    if (!REGNAL.has(st2.polity)) return raw;
    const reg = st2.regnal ?? (st2.regnal = {}), keys = Object.keys(reg);
    const base = keys.length && rnd() < 0.4 ? keys[Math.floor(rnd() * keys.length)] : raw;
    reg[base] = (reg[base] ?? 0) + 1;
    return `${base}${reg[base]}\u4E16`;
  }
  var leaderRng = (civ3, st2, ...p) => rngOf(hashSeed(civ3.historySeed, "leader", st2.id, civ3.monthIndex, ...p));
  var DYN2 = { kingdom: "\u738B\u671D", empire: "\u738B\u671D", chiefdom: "\u9996\u9577\u5BB6", theocracy: "\u6559\u7D71", republic: "\u653F\u6A29" };
  var dynastyName = (polity, n2, founder = "") => polity === "tribal" ? `${stripOrd(founder)}\u6C0F` : `\u7B2C${kanjiNum(n2)}${DYN2[polity] ?? "\u653F\u6A29"}`;
  function warNameFor(ctx, w, placeOf) {
    const { civ: civ3 } = ctx, A2 = civ3.states[w.aggressor], D2 = civ3.states[w.defender];
    if (!A2 || !D2) return null;
    const a = baseOfState(A2), d = baseOfState(D2), r = rngOf(hashSeed(civ3.historySeed, "warname", w.id));
    const pats = [`${a}\u30FB${d}\u6226\u4E89`, `${d}\u5F81\u8A0E\u6226\u4E89`, `${d}\u6226\u4E89`];
    const p = placeOf?.();
    if (p) pats.push(`${p}\u6226\u4E89`);
    const base = pats[Math.floor(r() * pats.length)];
    const n2 = Object.values(civ3.wars).filter((x) => x.id !== w.id && x.name && x.startedAt >= w.startedAt - 1200 && (x.aggressor === w.aggressor && x.defender === w.defender || x.aggressor === w.defender && x.defender === w.aggressor)).length;
    let name = n2 ? `\u7B2C${kanjiNum(n2 + 1)}\u6B21${base}` : base, k = n2;
    while (Object.values(civ3.wars).some((x) => x.id !== w.id && x.name === name)) name = `\u7B2C${kanjiNum(++k + 1)}\u6B21${base}`;
    return name;
  }
  function siteDescriptors(f) {
    const out = [];
    if (f.river) out.push("\u6CB3\u7554", "\u6E21\u6CB3");
    if (f.mountain) out.push("\u5CE0", "\u5C71\u9E93");
    if (f.coast) out.push("\u6E7E", "\u6D77\u5CB8");
    if (f.forest) out.push("\u68EE");
    if (f.wet) out.push("\u6CBC\u6CA2");
    if (f.dry) out.push("\u8352\u91CE");
    if (f.plain) out.push("\u5E73\u539F", "\u91CE");
    return out.length ? out : ["\u91CE"];
  }

  // js/core/civ/states.js
  init_cohorts();
  init_spatial();
  init_tech();
  init_civ_state();
  init_graph();
  init_species();
  var gatedPolity = (civ3, cap, p) => !POLITY_CAP[p] || groupCaps(civ3, cap).has(POLITY_CAP[p]) ? p : "tribal";
  var POLITY = Object.freeze({ tribal: "\u90E8\u65CF", chiefdom: "\u9996\u9577\u5236", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236" });
  var VIA = Object.freeze({ city_state: { ja: "\u90FD\u5E02\u56FD\u5BB6", suffix: "\u5E02\u56FD" }, agri_union: { ja: "\u8FB2\u8015\u96C6\u843D\u306E\u7D71\u5408", suffix: "\u9023\u5408" }, nomad_confederation: { ja: "\u904A\u7267\u9023\u5408", suffix: "\u90E8\u65CF\u9023\u5408" }, religious_polity: { ja: "\u5B97\u6559\u5171\u540C\u4F53", suffix: "\u6559\u56E3\u56FD" }, defense_league: { ja: "\u9632\u885B\u9023\u5408", suffix: "\u540C\u76DF" }, secession: { ja: "\u5206\u96E2", suffix: "\u56FD" } });
  var KM = 6371;
  var CLUSTER_BUDGET = 8;
  var CHECK_EVERY = 12;
  var distKm = (w, a, b) => {
    const c = w.cell;
    const x = Math.sin(c.lat[a]) * Math.sin(c.lat[b]) + Math.cos(c.lat[a]) * Math.cos(c.lat[b]) * Math.cos(c.lon[a] - c.lon[b]);
    return Math.acos(Math.max(-1, Math.min(1, x))) * KM;
  };
  function formState(ctx, { via, groupIds, predecessor = null, player = false, cause = null, threat = null, name = null, polity = null }) {
    const { world, civ: civ3, ids, rng } = ctx, gs = groupIds.map((i) => civ3.groups[i]).filter(Boolean);
    if (!gs.length) return null;
    const cap = gs.reduce((a, b) => b.pop > a.pop ? b : a), id = ids.next("state"), h2 = hashSeed(id);
    const pol = gatedPolity(civ3, cap, polity ?? (via === "religious_polity" ? "theocracy" : via === "city_state" ? "chiefdom" : "tribal")), np = name ? null : ctx.nameGen?.stateParts?.(civ3, cap, via, rng, pol) ?? null;
    const st2 = {
      id,
      name: name ?? np?.name ?? ctx.nameGen?.state(civ3, cap, via, rng) ?? makeNameJa(rng) + VIA[via].suffix,
      nameBase: np?.base ?? null,
      via,
      formedAt: civ3.monthIndex,
      capitalGroupId: cap.id,
      nameLang: name ? null : ctx.nameLangOf?.(cap) ?? null,
      /* 国名の由来の言語（建国時。首都はのちに変わるので、現在の首都の言語とは別に残す） */
      alive: true,
      player,
      dissolvedAt: null,
      predecessor,
      polity: pol,
      stability: 0.7,
      pop: 0,
      settlements: 0,
      treasury: 50,
      army: 0,
      policy: { tax: 0.1, mobilization: 0, assimilation: 0, tolerance: 0.5, autonomy: 0 },
      techAdopted: {},
      strategy: null,
      campaign: null,
      defense: 0,
      boostUntil: -1,
      sanctions: {},
      relations: {},
      warIds: [],
      leader: { name: ctx.nameGen?.person(civ3, cap, rng) ?? makeNameJa(rng), bornAt: civ3.monthIndex - Math.round((300 + Math.floor(rng() * 200)) * lifeScale(civ3, { capitalGroupId: cap.id })), heir: false },
      lastCrisis: -999,
      personality: { security: 0.6 + h2 % 100 / 125, prosperity: 0.6 + (h2 >> 7) % 100 / 125, expansion: 0.6 + (h2 >> 14) % 100 / 125, stability: 0.6 + (h2 >> 21) % 100 / 125, culture: 0.6 + (h2 >> 4) % 100 / 125, tech: 0.6 + (h2 >> 11) % 100 / 125, prestige: 0.6 + (h2 >> 18) % 100 / 125 }
    };
    st2.leader.name = leaderName(st2, st2.leader.name, leaderRng(civ3, st2, "found"));
    civ3.states[id] = st2;
    for (const g of gs) g.stateId = id;
    if (gs.some((g) => g.player)) st2.player = true;
    const causes = [];
    if (cause) causes.push({ targetId: cause, relation: "caused_by", basis: "plausible" });
    if (threat) causes.push({ targetId: threat, relation: "reaction_to", basis: "strong" });
    if (predecessor) causes.push({ targetId: predecessor, relation: "succeeded_by", basis: "direct" });
    const ev = makeEvent(civ3, ids, { kind: "state_formed", title: `${st2.name}\u304C\u6210\u7ACB\uFF08${VIA[via].ja}\uFF09`, participants: [{ entityId: id, role: "state" }, ...gs.map((g) => ({ entityId: g.id, role: g.id === cap.id ? "capital_group" : "member" }))], location: { cell: cap.cell }, causes, facts: { stateId: id, name: st2.name, polity: st2.polity, capitalCell: cap.cell, cells: gs.slice(0, 24).map((g) => g.cell), nGroups: gs.length }, provenance: player ? "player" : "simulation" });
    st2.formedEvent = ev.eventId;
    return st2;
  }
  function evaluateFormation(ctx, seed) {
    const { world, civ: civ3 } = ctx, { home } = spatialOf(ctx), dist = reachable(world, seed.cell, CLUSTER_BUDGET, 0), free2 = [seed];
    for (const [c, d] of dist) {
      const gid = home.get(c);
      if (gid && gid !== seed.id) {
        const o = civ3.groups[gid];
        if (o && !o.stateId && !o.player) free2.push(o);
      }
    }
    const st2 = (g) => g.settlementId ? civ3.settlements[g.settlementId] : null, sum = (a) => a.reduce((s, g) => s + g.pop, 0);
    const s0 = st2(seed);
    if (s0 && (s0.stage === "town" || s0.stage === "city") && (world.cell.coastDist[seed.cell] <= 2 || world.cell.river[seed.cell])) return { via: "city_state", groupIds: free2.filter((g) => dist.get(g.cell) <= 5).map((g) => g.id) };
    const ag = free2.filter((g) => g.subsistence === "agriculture" && g.settlementId);
    if (ag.length >= 3 && sum(ag) >= 3e3) return { via: "agri_union", groupIds: ag.map((g) => g.id) };
    const byRel = /* @__PURE__ */ new Map();
    for (const g of free2) if (g.settlementId) {
      const r = dominant(g).religionId;
      if (r) (byRel.get(r) ?? byRel.set(r, []).get(r)).push(g);
    }
    for (const [r, a] of byRel) if (a.length >= 2 && sum(a) >= 1500 && a.some((g) => g.id === seed.id)) return { via: "religious_polity", groupIds: a.map((g) => g.id) };
    const no = free2.filter((g) => g.subsistence === "pastoral");
    if (no.length >= 3 && sum(no) >= 1500) return { via: "nomad_confederation", groupIds: no.map((g) => g.id) };
    const cult = new Set(free2.filter((g) => g.pop >= 300).map((g) => dominant(g).cultureId));
    if (cult.size >= 2 && free2.length >= 2) {
      for (const s of Object.values(civ3.states)) {
        if (!s.alive || s.pop < sum(free2) * 3) continue;
        const cg = civ3.groups[s.capitalGroupId];
        if (cg && dist.has(cg.cell)) return { via: "defense_league", groupIds: free2.filter((g) => g.pop >= 300).map((g) => g.id), threat: s.formedEvent ?? s.id };
      }
    }
    return null;
  }
  var dissolve = (ctx, st2, why2) => {
    const { civ: civ3, ids } = ctx;
    st2.alive = false;
    st2.dissolvedAt = civ3.monthIndex;
    for (const gid in civ3.groups) if (civ3.groups[gid].stateId === st2.id) civ3.groups[gid].stateId = null;
    for (const wid of [...st2.warIds]) ctx.endWarHook?.(ctx, civ3.wars[wid], "state_dissolved");
    makeEvent(civ3, ids, { kind: "state_dissolved", title: `${st2.name}\u304C${why2}`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: civ3.groups[st2.capitalGroupId]?.cell ?? null }, facts: { stateId: st2.id }, causes: [...st2.lastCrisisEvent ? [{ targetId: st2.lastCrisisEvent, relation: "caused_by", basis: "plausible" }] : [], ...asCauses(recentEventsFor(civ3, [st2.id], ["war_ended"], 24, 1), "contributed_to", "plausible")] });
  };
  function stepStates(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    if (mi % 3 !== 0) return;
    const groupsByState = byState(ctx);
    for (const id in civ3.states) {
      const st2 = civ3.states[id];
      if (!st2.alive) continue;
      const gs = groupsByState.get(id);
      if (!gs?.length) {
        dissolve(ctx, st2, "\u6D88\u6EC5\u3057\u305F");
        continue;
      }
      let pop = 0, tens = 0, settle2 = 0, big = gs[0], mar = 0;
      for (const g of gs) {
        pop += g.pop;
        mar += g.pop * speciesOf(g.speciesId, civ3).martial;
        if (g.settlementId) settle2++;
        if (g.pop > big.pop) big = g;
        let t = 0;
        for (const c of g.cohorts) if (c.tension > t) t = c.tension;
        tens += t * g.pop;
      }
      st2.pop = pop;
      st2.martial = pop ? Math.round(mar / pop * 1e3) / 1e3 : 1;
      st2.settlements = settle2;
      if (!civ3.groups[st2.capitalGroupId] || civ3.groups[st2.capitalGroupId].stateId !== id) st2.capitalGroupId = big.id;
      const cap = civ3.groups[st2.capitalGroupId];
      let far = 0, mx = 0;
      const dists = [];
      for (const g of gs) {
        const d = distKm(world, cap.cell, g.cell);
        dists.push([d, g]);
        if (d > mx) mx = d;
      }
      const adm = stateCan(civ3, st2, "polity:empire") ? 0.6 : stateCan(civ3, st2, "polity:kingdom") ? 0.35 : 0;
      const target = 0.8 - 0.5 * (tens / pop) - Math.min(1, mx / 15e3) * 0.3 * (1 - adm) - Math.max(0, st2.policy.tax - 0.15) * 0.6 - (st2.warIds.length ? 0.05 : 0) - st2.policy.mobilization * 0.3 + (st2.leader.heir ? 0.03 : 0) + (st2.magic?.kind === "temple" ? 0.04 * st2.magic.power : 0) + { chiefdom: 0.02, kingdom: 0.05, empire: 0.08, republic: 0.06, theocracy: 0.05, tribal: 0 }[st2.polity];
      const before = st2.stability;
      st2.stability = Math.max(0, Math.min(1, st2.stability + (target - st2.stability) * 0.3));
      st2.treasury += pop * st2.policy.tax * 12e-4 * taxMult(st2) * (ctx.taxFactor?.(st2) ?? 1) * (1 - Math.min(0.5, Object.keys(st2.sanctions).filter((k) => st2.sanctions[k] > mi).length * 0.1));
      st2.army = pop * (5e-3 + 0.12 * st2.policy.mobilization) * (0.5 + st2.stability) * (1 - (st2.warLoss ?? 0));
      for (const k in st2.sanctions) if (st2.sanctions[k] <= mi) delete st2.sanctions[k];
      const ls = lifeScale(civ3, st2), age = mi - st2.leader.bornAt;
      if (age > 480 * ls && rng() < Math.min(0.2, (age - 480 * ls) / (4e3 * ls))) {
        const heir = st2.leader.heir;
        st2.interpDirty = true;
        st2.leader = { name: leaderName(st2, ctx.nameGen?.person(civ3, civ3.groups[st2.capitalGroupId], rng) ?? makeNameJa(rng), leaderRng(civ3, st2, "succ")), bornAt: mi - Math.round((300 + Math.floor(rng() * 100)) * ls), heir: false };
        st2.stability = Math.max(0, st2.stability - (heir ? 0.03 : 0.12));
        makeEvent(civ3, ids, { kind: "leader_succession", title: `${st2.name}\u306E\u6307\u5C0E\u8005\u304C\u4EE3\u308F\u3063\u305F${heir ? "\uFF08\u7D99\u627F\u8005\u304C\u6C7A\u307E\u3063\u3066\u3044\u305F\uFF09" : "\uFF08\u7D99\u627F\u306E\u6DF7\u4E71\uFF09"}`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: cap.cell } });
      }
      if (st2.stability < 0.08 && before < 0.2) {
        dissolve(ctx, st2, "\u5D29\u58CA\u3057\u305F");
        continue;
      }
      if (st2.stability < 0.3 && gs.length >= 3 && mi - st2.lastCrisis > 60) {
        dists.sort((a, b) => b[0] - a[0]);
        const part = dists.slice(0, Math.max(1, Math.floor(gs.length / 2))).map((x) => x[1]).filter((g) => !g.player || st2.player === false);
        if (part.length && part.length < gs.length) {
          st2.lastCrisis = mi;
          const ev = makeEvent(civ3, ids, { kind: "instability", title: `${st2.name}\u3067\u4E0D\u6E80\u304C\u9AD8\u307E\u308B`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: cap.cell }, causes: [...asCauses(recentEventsFor(civ3, [st2.id, ...gs.map((g) => g.id)], ["famine", "disaster_struck", "demand_raised"], 48, 2), "contributed_to", "plausible"), ...asCauses(recentEventsFor(civ3, [st2.id], ["war_declared", "war_ended", "leader_succession"], 36, 2), "contributed_to", "strong")] });
          st2.lastCrisisEvent = ev.eventId;
          const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st2.id, cause: ev.eventId });
          if (ns) {
            ns.relations[st2.id] = -40;
            st2.relations[ns.id] = -40;
            st2.stability = Math.min(1, st2.stability + 0.1);
          }
        }
      }
    }
    for (const id in civ3.groups) {
      const g = civ3.groups[id];
      if (g.stateId) continue;
      if (!(g.nextStateCheck <= mi) && g.nextStateCheck !== void 0) continue;
      g.nextStateCheck = mi + CHECK_EVERY + hashSeed(id) % 6;
      if (g.pop < 300 || g.subsistence === "forage") continue;
      if (!g.player) {
        const ns = [...neighborGroups(ctx, g)].map((o) => civ3.groups[o]).filter((o) => o?.stateId && civ3.states[o.stateId].alive), best = ns.reduce((a, o) => !a || civ3.states[o.stateId].pop > civ3.states[a.stateId].pop ? o : a, null);
        if (best && civ3.states[best.stateId].pop >= g.pop * 2 && rng() < 0.4) {
          g.stateId = best.stateId;
          makeEvent(civ3, ids, { kind: "group_joined_state", title: `${civ3.states[best.stateId].name}\u306B\u52A0\u308F\u3063\u305F`, participants: [{ entityId: g.id, role: "group" }, { entityId: best.stateId, role: "state" }], location: { cell: g.cell }, facts: { stateId: best.stateId, cell: g.cell } });
          continue;
        }
      }
      const f = evaluateFormation(ctx, g);
      if (!f) continue;
      if (g.player) addProposal(civ3, ids, g, "form_state", f);
      else formState(ctx, f);
    }
  }

  // js/core/wcde/domains/language.js
  var KANA = Object.freeze({ "": "\u30A2\u30A4\u30A6\u30A8\u30AA", k: "\u30AB\u30AD\u30AF\u30B1\u30B3", g: "\u30AC\u30AE\u30B0\u30B2\u30B4", s: "\u30B5\u30B7\u30B9\u30BB\u30BD", z: "\u30B6\u30B8\u30BA\u30BC\u30BE", t: "\u30BF\u30C1\u30C4\u30C6\u30C8", d: "\u30C0\u30C2\u30C5\u30C7\u30C9", n: "\u30CA\u30CB\u30CC\u30CD\u30CE", h: "\u30CF\u30D2\u30D5\u30D8\u30DB", b: "\u30D0\u30D3\u30D6\u30D9\u30DC", p: "\u30D1\u30D4\u30D7\u30DA\u30DD", m: "\u30DE\u30DF\u30E0\u30E1\u30E2", r: "\u30E9\u30EA\u30EB\u30EC\u30ED", y: "\u30E4\u30FB\u30E6\u30FB\u30E8", w: "\u30EF\xB7\xB7\xB7\xB7" });
  var VOWELS = ["a", "i", "u", "e", "o"];
  var CONS = ["k", "g", "s", "z", "t", "d", "n", "h", "b", "p", "m", "r", "w", "y"];
  var ok = (c, v) => {
    const k = KANA[c];
    if (!k) return false;
    const ch = k[VOWELS.indexOf(v)];
    return !!ch && ch !== "\u30FB" && ch !== "\xB7";
  };
  var kanaOf = (c, v) => KANA[c][VOWELS.indexOf(v)];
  var pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  var shuffle = (rng, a) => {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  function syllablesOf(phon) {
    const out = [];
    for (const v of phon.v) out.push({ c: "", v, kana: kanaOf("", v) });
    for (const c of phon.c) for (const v of phon.v) if (ok(c, v)) out.push({ c, v, kana: kanaOf(c, v) });
    return out;
  }
  var rootPhon = (id) => {
    const r = rngOf(hashSeed(id, "phon"));
    const c = shuffle(r, CONS).slice(0, 6 + Math.floor(r() * 5)), v = shuffle(r, VOWELS).slice(0, 3 + Math.floor(r() * 3));
    return { c, v, coda: r() < 0.5, geminate: r() < 0.3, endV: shuffle(r, v).slice(0, 1 + Math.floor(r() * 2)), vowelInitial: Math.round(r() * 25) / 100, changes: [] };
  };
  var childPhon = (id, parent) => {
    const r = rngOf(hashSeed(id, "change")), p = { ...parent, c: [...parent.c], v: [...parent.v], endV: [...parent.endV], changes: [...parent.changes] }, n2 = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n2; i++) {
      const k = Math.floor(r() * 4);
      if (k === 0 && p.c.length > 4) {
        const from = pick(r, p.c), pool = CONS.filter((x) => !p.c.includes(x));
        if (pool.length) {
          const to = pick(r, pool);
          p.c[p.c.indexOf(from)] = to;
          p.changes.push({ kind: "shift", from, to });
        }
      } else if (k === 1 && p.v.length > 3) {
        const from = pick(r, p.v), to = pick(r, p.v.filter((x) => x !== from));
        p.v = p.v.filter((x) => x !== from);
        p.endV = p.endV.map((x) => x === from ? to : x);
        p.changes.push({ kind: "merge", from, to });
      } else if (k === 2) {
        p.coda = !p.coda;
        p.changes.push({ kind: "coda", to: p.coda });
      } else {
        const pool = VOWELS.filter((x) => !p.v.includes(x));
        if (pool.length) {
          const to = pick(r, pool);
          p.v.push(to);
          p.changes.push({ kind: "vowel_gain", to });
        }
      }
    }
    p.endV = [...new Set(p.endV.filter((x) => p.v.includes(x)))];
    if (!p.endV.length) p.endV = [p.v[0]];
    return p;
  };
  function ensureProfile(civ3, langId) {
    const L = civ3.languages[langId];
    if (!L) return null;
    if (L.phon) return L.phon;
    const chain = [];
    let cur = L;
    while (cur && !cur.phon) {
      chain.push(cur);
      cur = cur.parent ? civ3.languages[cur.parent] : null;
    }
    let base = cur?.phon ?? null;
    for (const l of chain.reverse()) {
      l.phon = base ? childPhon(l.id, base) : rootPhon(l.id);
      base = l.phon;
      l.name = word(rngOf(hashSeed(l.id, "name")), l.phon, 2 + hashSeed(l.id) % 2, 0) + "\u8A9E";
    }
    return L.phon;
  }
  function word(rng, phon, n2, endBias = 0.6) {
    const syl = syllablesOf(phon), parts = [];
    let prev = null;
    for (let i = 0; i < n2; i++) {
      let s, tries = 0;
      do {
        s = i === 0 && rng() >= phon.vowelInitial ? pick(rng, syl.filter((x) => x.c)) : rng() < (i === 0 ? phon.vowelInitial : 0.06) ? pick(rng, syl.filter((x) => !x.c)) : pick(rng, syl);
      } while (prev && s.kana === prev.kana && ++tries < 6);
      parts.push(s);
      prev = s;
    }
    if (rng() < endBias) {
      const last = parts[parts.length - 1], v = pick(rng, phon.endV), c = last.c;
      if (ok(c, v)) parts[parts.length - 1] = { c, v, kana: kanaOf(c, v) };
    }
    let w = parts.map((p) => p.kana).join("");
    if (phon.coda && rng() < 0.25) w += "\u30F3";
    if (phon.geminate && n2 >= 3 && rng() < 0.2) w = w.slice(0, 1) + "\u30C3" + w.slice(1);
    return w;
  }
  function nameFor(civ3, rng, langId, kind = "person") {
    const phon = ensureProfile(civ3, langId);
    if (!phon) return null;
    const n2 = kind === "person" ? 2 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    return word(rng, phon, n2);
  }
  var languageOfGroup = (g) => g?.cohorts?.length ? g.cohorts.reduce((b, c) => c.share > b.share ? c : b).languageId : null;
  var nameLangOf = (g) => languageOfGroup(g);
  function landSuffix(civ3, langId) {
    const L = civ3.languages[langId];
    if (!L) return "";
    const h2 = hashSeed(L.id, "landsfx");
    if (h2 % 100 < 60) {
      const phon = ensureProfile(civ3, L.id);
      return phon ? word(rngOf(h2), phon, 1 + (h2 >>> 8) % 2, 0.7) : "";
    }
    return L.parent && civ3.languages[L.parent] ? landSuffix(civ3, L.parent) : "";
  }
  var nameGen = {
    /** 国号と語根。語根は言語の音から（＋系統の語尾）、称号は政体から（王国・帝国・共和国…） */
    stateParts: (civ3, cap, via, rng, polity = "tribal") => {
      const l = languageOfGroup(cap);
      if (!l) return null;
      const base = nameFor(civ3, rng, l, "state") + landSuffix(civ3, l);
      return { base, name: composeStateName(base, polity, via) };
    },
    state: (civ3, cap, via, rng) => {
      const l = languageOfGroup(cap);
      return l ? nameFor(civ3, rng, l, "state") + VIA[via].suffix : null;
    },
    person: (civ3, g, rng) => {
      const l = languageOfGroup(g);
      return l ? nameFor(civ3, rng, l, "person") : null;
    }
  };
  function stepLanguage(ctx) {
    const { civ: civ3 } = ctx;
    if (!civ3.options.wcde) return;
    let nl = 0, nc = 0;
    for (const _ in civ3.languages) nl++;
    for (const _ in civ3.cultures) nc++;
    if (ctx._langSig === nl + ":" + nc) return;
    ctx._langSig = nl + ":" + nc;
    for (const id in civ3.languages) if (!civ3.languages[id].phon) ensureProfile(civ3, id);
    const byCulture = /* @__PURE__ */ new Map();
    for (const id in civ3.languages) {
      const l = civ3.languages[id];
      if (l.cultureId && !byCulture.has(l.cultureId)) byCulture.set(l.cultureId, l);
    }
    for (const id in civ3.cultures) {
      const c = civ3.cultures[id];
      if (c.nameFixed) continue;
      const lang = byCulture.get(id);
      if (!lang?.phon) continue;
      c.name = word(rngOf(hashSeed(id, "cname")), lang.phon, 2 + hashSeed(id) % 2) + (c.parent ? "\u7CFB" : "\u306E\u4EBA\u3005");
      c.nameFixed = true;
    }
  }
  function finalizeLanguages(civ3) {
    const prev = civ3.options.wcde;
    civ3.options.wcde = true;
    stepLanguage({ civ: civ3 });
    civ3.options.wcde = prev;
  }

  // js/core/wcde/domains/religion.js
  init_civ_state();
  init_culture();
  init_events();
  var domRel = (g) => g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
  function defineReligions(ctx) {
    const { civ: civ3 } = ctx, need = Object.values(civ3.religions).filter((r) => r.deity == null);
    if (!need.length) return;
    const byRel = /* @__PURE__ */ new Map();
    for (const g of Object.values(civ3.groups)) {
      const c = domRel(g);
      if (c.religionId) {
        const a = byRel.get(c.religionId) ?? [];
        a.push(g);
        byRel.set(c.religionId, a);
      }
    }
    for (const r of need) {
      const gs = (byRel.get(r.id) ?? []).slice().sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)), top = gs[0];
      const lang = top ? languageOfGroup(top) : null, rr = { next: /* @__PURE__ */ ((s) => () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296)(hashSeed(r.id, "deity")) };
      r.deity = lang && civ3.languages[lang] ? nameFor(civ3, rr.next, lang, "person") : null;
      r.holyCell = top?.cell ?? null;
      r.founderId = null;
      if (r.deity) r.name = `${r.deity}\u4FE1\u4EF0`;
    }
  }
  function stepReligion(ctx) {
    const { civ: civ3, ids, world } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde) return;
    defineReligions(ctx);
    if (mi % 3 !== 0) return;
    const byRel = /* @__PURE__ */ new Map();
    for (const g of Object.values(civ3.groups)) {
      const c = domRel(g);
      if (c.religionId) {
        const a = byRel.get(c.religionId) ?? [];
        a.push(g);
        byRel.set(c.religionId, a);
      }
    }
    for (const [rid, gs] of [...byRel].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      const r = civ3.religions[rid];
      if (!r || gs.length < 4 || mi - r.bornAt < 600) continue;
      if (hashSeed(rid, mi) % 1e5 / 1e5 >= 8e-4 * Math.min(3, gs.length / 4)) continue;
      const hc = r.holyCell ?? gs[0].cell, d = (g) => Math.hypot(world.cell.lat[g.cell] - world.cell.lat[hc], world.cell.lon[g.cell] - world.cell.lon[hc]), far = gs.slice().sort((a, b) => d(b) - d(a) || (a.id < b.id ? -1 : 1)).slice(0, Math.ceil(gs.length / 3));
      const nid2 = createReligion(civ3, ids, ctx.rng, { parent: rid, kind: r.kind }), nr = civ3.religions[nid2];
      nr.holyCell = far[0].cell;
      nr.founderId = null;
      nr.deity = r.deity;
      const lang = languageOfGroup(far[0]);
      if (lang && civ3.languages[lang]) {
        nr.name = `${nameFor(civ3, ctx.rng, lang, "person")}\u6D3E`;
      }
      for (const g of far) for (const c of g.cohorts) if (c.religionId === rid) c.religionId = nid2;
      makeEvent(civ3, ids, { kind: "religion_schism", title: `${r.name}\u304B\u3089${nr.name}\u304C\u5206\u304B\u308C\u305F\uFF08\u4FE1\u8005\u306E\u96C6\u56E3 ${far.length}\uFF09`, participants: [{ entityId: rid, role: "parent_religion" }, { entityId: nid2, role: "new_religion" }, ...far.slice(0, 3).map((g) => ({ entityId: g.id, role: "converted_group" }))], location: { cell: far[0].cell }, effects: [{ targetId: nid2, property: "religion.parent", before: null, after: rid }], provenance: "simulation" });
    }
  }

  // js/core/civ/civ-sim.js
  init_tick();
  init_ids();
  init_civ_state();
  init_culture();
  init_cohorts();
  init_tech();

  // js/core/civ/diplomacy.js
  init_events();
  init_spatial();
  init_graph();
  var TREATY = Object.freeze({ nonaggression: { ja: "\u4E0D\u53EF\u4FB5\u6761\u7D04", months: 240 }, alliance: { ja: "\u540C\u76DF", months: 480 }, trade: { ja: "\u901A\u5546\u5354\u5B9A", months: 240 } });
  var adjustRel = (a, b, d) => {
    const c = (v) => Math.max(-100, Math.min(100, v));
    a.relations[b.id] = c((a.relations[b.id] ?? 0) + d);
    b.relations[a.id] = c((b.relations[a.id] ?? 0) + d);
  };
  var treatyBetween = (civ3, a, b, type) => civ3.activeTreatyIds.map((i) => civ3.treaties[i]).find((t) => t.active && (!type || t.type === type) && (t.a === a.id && t.b === b.id || t.a === b.id && t.b === a.id));
  var atWarWith = (civ3, a, b) => a.warIds.map((i) => civ3.wars[i]).some((w) => w.sides.a.includes(b.id) || w.sides.d.includes(b.id));
  var strength = (civ3, st2) => st2.army * milMult(st2) * (1 + (st2.defense + (st2.milDef ?? 0)) * 0.5);
  function neighborStates(ctx, st2) {
    const cache = ctx._nbr && ctx._nbrMonth === ctx.civ.monthIndex ? ctx._nbr : (ctx._nbr = /* @__PURE__ */ new Map(), ctx._nbrMonth = ctx.civ.monthIndex, ctx._nbr);
    if (cache.has(st2.id)) return cache.get(st2.id);
    const out = /* @__PURE__ */ new Set();
    for (const g of byState(ctx).get(st2.id) ?? []) for (const o of neighborGroups(ctx, g)) {
      const s = ctx.civ.groups[o]?.stateId;
      if (s && s !== st2.id && ctx.civ.states[s].alive) out.add(s);
    }
    const r = [...out].sort();
    cache.set(st2.id, r);
    return r;
  }
  function signTreaty(ctx, type, a, b, { decisionId = null, provenance = "simulation" } = {}) {
    const { civ: civ3, ids } = ctx, id = ids.next("treaty"), t = { id, type, a: a.id, b: b.id, signedAt: civ3.monthIndex, expiresAt: civ3.monthIndex + TREATY[type].months, active: true };
    civ3.treaties[id] = t;
    civ3.activeTreatyIds.push(id);
    adjustRel(a, b, type === "alliance" ? 25 : 15);
    makeEvent(civ3, ids, { kind: "treaty_signed", title: `${a.name}\u3068${b.name}\u304C${TREATY[type].ja}\u3092\u7D50\u3093\u3060`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }, { entityId: id, role: "treaty" }], location: null, facts: { type, a: a.id, b: b.id }, provenance });
    return t;
  }
  function endTreaty(ctx, t, why2, byId2 = null) {
    const { civ: civ3, ids } = ctx;
    t.active = false;
    t.endedAt = civ3.monthIndex;
    civ3.activeTreatyIds = civ3.activeTreatyIds.filter((i) => i !== t.id);
    makeEvent(civ3, ids, { kind: "treaty_ended", title: `${TREATY[t.type].ja}\u304C${why2}`, participants: [{ entityId: t.id, role: "treaty" }, { entityId: t.a, role: byId2 === t.a ? "breaker" : "party" }, { entityId: t.b, role: byId2 === t.b ? "breaker" : "party" }], location: null, effects: byId2 ? [{ targetId: t.id, property: "broken_by", before: null, after: byId2 }] : [] });
  }
  function revengeCauses(civ3, atk, def) {
    const out = [];
    for (const ev of recentEventsFor(civ3, [atk.id], ["war_ended"], 1200, 6)) {
      if (!ev.participants.some((p) => p.entityId === def.id)) continue;
      const w = civ3.wars[ev.participants.find((p) => p.role === "war")?.entityId];
      const lost = w && (w.sides.a.includes(atk.id) && w.outcome === "defender_victory" || w.sides.d.includes(atk.id) && w.outcome === "aggressor_victory");
      out.push({ targetId: ev.eventId, relation: "reaction_to", basis: lost ? "strong" : "plausible" });
      if (out.length >= 2) break;
    }
    return out;
  }
  function declareWar(ctx, atk, def, { reason = "conquest", decisionId = null, provenance = "simulation" } = {}) {
    const { civ: civ3, ids, rng } = ctx, id = ids.next("war"), w = { id, aggressor: atk.id, defender: def.id, sides: { a: [atk.id], d: [def.id] }, startedAt: civ3.monthIndex, status: "active", reason, score: 0, occupied: [], outcome: null, endedAt: null, casualties: 0 };
    civ3.wars[id] = w;
    civ3.activeWarIds.push(id);
    atk.warIds.push(id);
    def.warIds.push(id);
    adjustRel(atk, def, -40);
    const ev = makeEvent(civ3, ids, { kind: "war_declared", title: `${atk.name}\u304C${def.name}\u306B\u5BA3\u6226\u3057\u305F`, participants: [{ entityId: atk.id, role: "aggressor" }, { entityId: def.id, role: "defender" }, { entityId: id, role: "war" }], location: civ3.groups[def.capitalGroupId] ? { cell: civ3.groups[def.capitalGroupId].cell } : null, causes: revengeCauses(civ3, atk, def), facts: { warId: id, aggressor: atk.id, defender: def.id }, provenance });
    w.declaredEvent = ev.eventId;
    for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) for (const t of civ3.activeTreatyIds.map((i) => civ3.treaties[i])) {
      if (t.type !== "alliance" || t.a !== host.id && t.b !== host.id) continue;
      const ally = civ3.states[t.a === host.id ? t.b : t.a];
      if (!ally?.alive || ally.id === foe.id || w.sides.a.includes(ally.id) || w.sides.d.includes(ally.id)) continue;
      if (rng() < 0.6) {
        w.sides[side].push(ally.id);
        ally.warIds.push(id);
        adjustRel(ally, foe, -25);
        makeEvent(civ3, ids, { kind: "ally_joined", title: `${ally.name}\u304C${host.name}\u5074\u3067\u53C2\u6226\u3057\u305F`, participants: [{ entityId: ally.id, role: "ally" }, { entityId: id, role: "war" }], location: null, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] });
      }
    }
    ctx.warOps?.init(ctx, w);
    return w;
  }
  function endWar(ctx, w, outcome, terms = null) {
    const { civ: civ3, ids } = ctx;
    if (w.status !== "active") return;
    w.status = "ended";
    w.outcome = outcome;
    w.endedAt = civ3.monthIndex;
    civ3.activeWarIds = civ3.activeWarIds.filter((i) => i !== w.id);
    const all = [...w.sides.a, ...w.sides.d].map((i) => civ3.states[i]);
    for (const s of all) s.warIds = s.warIds.filter((i) => i !== w.id);
    const atk = civ3.states[w.aggressor], def = civ3.states[w.defender];
    const lead = outcome === "aggressor_victory" || outcome === "negotiated" && w.score > 0;
    const gained = [], moved = [];
    const settled = ctx.warOps?.settle ? ctx.warOps.settle(ctx, w, outcome, terms) : null;
    if (settled) for (const x of settled) {
      gained.push(x.gid);
      moved.push(x);
    }
    else if (lead && atk?.alive) for (const gid of w.occupied) {
      const g = civ3.groups[gid];
      if (g && g.stateId === w.defender) {
        g.stateId = atk.id;
        gained.push(gid);
      }
    }
    for (const s of all) {
      s.lastWarEnd = civ3.monthIndex;
      s.stability = Math.max(0, s.stability - 0.04);
      if (s.campaign?.warId === w.id) s.campaign = null;
    }
    if (atk && def) adjustRel(atk, def, -10);
    makeEvent(civ3, ids, { kind: "war_ended", title: `${atk?.name ?? "?"}\u3068${def?.name ?? "?"}\u306E\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F\uFF08${{ aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: terms?.kind === "cession" ? "\u8B1B\u548C\uFF08\u5360\u9818\u5730\u306E\u5272\u8B72\uFF09" : "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" }[outcome] ?? outcome}\uFF09`, participants: [{ entityId: w.id, role: "war" }, ...all.map((s) => ({ entityId: s.id, role: "belligerent" }))], location: null, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: gained.map((gid) => {
      const m = moved.find((x) => x.gid === gid);
      return { targetId: gid, property: "stateId", before: m?.from ?? w.defender, after: m?.to ?? atk.id };
    }), facts: { warId: w.id, outcome, terms: terms?.kind ?? null, stateId: gained.length ? moved[0]?.to ?? atk?.id ?? null : null, cells: gained.slice(0, 24).map((gid) => civ3.groups[gid]?.cell).filter(Number.isFinite) } });
    ctx.warOps?.finalize(ctx, w, outcome);
  }
  function stepWars(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    if (mi % 12 === 0) {
      for (const i of [...civ3.activeTreatyIds]) {
        const t = civ3.treaties[i];
        if (t.expiresAt <= mi || !civ3.states[t.a]?.alive || !civ3.states[t.b]?.alive) endTreaty(ctx, t, "\u671F\u9650\u3092\u8FCE\u3048\u305F");
      }
      for (const id in civ3.states) {
        const s = civ3.states[id];
        if (s.alive) for (const k in s.relations) {
          s.relations[k] = Math.round(s.relations[k] * 0.9 * 10) / 10;
          if (Math.abs(s.relations[k]) < 1) delete s.relations[k];
        }
      }
    }
    const groups = byState(ctx);
    ctx.warOps?.monthly(ctx);
    for (const wid of [...civ3.activeWarIds]) {
      const w = civ3.wars[wid], A2 = w.sides.a.map((i) => civ3.states[i]).filter((s) => s.alive), D2 = w.sides.d.map((i) => civ3.states[i]).filter((s) => s.alive);
      if (!civ3.states[w.aggressor].alive || !civ3.states[w.defender].alive || !A2.length || !D2.length) {
        endWar(ctx, w, "state_dissolved");
        continue;
      }
      if (ctx.warOps) {
        ctx.warOps.step(ctx, w);
        continue;
      }
      const sA = A2.reduce((s, x) => s + strength(civ3, x), 0), sD = D2.reduce((s, x) => s + strength(civ3, x), 0);
      w.score = Math.max(-100, Math.min(100, w.score + (sA - sD) / (sA + sD + 1) * 6 + (rng() - 0.5) * 3));
      const lossA = 25e-4 * (sD / (sA + sD + 1)), lossD = 25e-4 * (sA / (sA + sD + 1));
      let dead = 0;
      for (const [side, loss] of [[A2, lossA], [D2, lossD]]) for (const s of side) {
        const gs = groups.get(s.id);
        if (!gs?.length) continue;
        const g = gs[Math.floor(rng() * gs.length)], l = g.pop * loss * 4;
        g.pop -= l;
        dead += l;
      }
      w.casualties += dead;
      if (mi % 3 === 0 && rng() < 0.4) makeEvent(civ3, ids, { kind: "battle_fought", title: `${civ3.states[w.aggressor].name}\u3068${civ3.states[w.defender].name}\u306E\u6226\u95D8`, participants: [{ entityId: w.id, role: "war" }, { entityId: w.aggressor, role: "aggressor" }, { entityId: w.defender, role: "defender" }], location: { cell: civ3.groups[civ3.states[w.defender].capitalGroupId]?.cell ?? null }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }] });
      if (w.score >= 35 && w.occupied.length < 3 && rng() < 0.08) {
        const cap = civ3.groups[civ3.states[w.aggressor].capitalGroupId];
        const cand3 = D2.flatMap((s) => groups.get(s.id) ?? []).filter((g) => !w.occupied.includes(g.id));
        if (cap && cand3.length) {
          cand3.sort((a, b) => distKm(world, cap.cell, a.cell) - distKm(world, cap.cell, b.cell));
          const g = cand3[0];
          w.occupied.push(g.id);
          makeEvent(civ3, ids, { kind: "territory_occupied", title: "\u9818\u571F\u304C\u5360\u9818\u3055\u308C\u305F", participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }], location: { cell: g.cell }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] });
        }
      }
      const age = mi - w.startedAt;
      if (w.score >= 80) endWar(ctx, w, "aggressor_victory");
      else if (w.score <= -80) endWar(ctx, w, "defender_victory");
      else if (age > 120) endWar(ctx, w, "stalemate");
    }
  }

  // js/core/civ/actions.js
  init_events();
  init_tech();
  init_spatial();
  init_cohorts();

  // js/core/civ/interpret.js
  init_graph();
  var STANCE = Object.freeze({ victory: "\u52DD\u5229\u306E\u6804\u5149", humiliation: "\u5C48\u8FB1", lost_territory: "\u5931\u308F\u308C\u305F\u9818\u571F", betrayal: "\u88CF\u5207\u308A", reconciled: "\u548C\u89E3", founding: "\u5EFA\u56FD\u306E\u7269\u8A9E", inconclusive: "\u6C7A\u7740\u306E\u3064\u304B\u306A\u304B\u3063\u305F\u6226\u4E89" });
  var MAX_ACTIVE = 24;
  var clamp4 = (v, a, b) => Math.max(a, Math.min(b, v));
  var r2 = (x) => Math.round(x * 100) / 100;
  function addInterp(ctx, owner, ev, stance, valence, about, supersedes = null) {
    const { civ: civ3, ids } = ctx, id = ids.next("interp");
    civ3.interpretations.push({ interpId: id, ownerId: owner.id, eventId: ev.eventId, stance, valence: r2(valence), about, since: civ3.monthIndex, until: null, supersedes, basis: "rule" });
    (owner.interp ?? (owner.interp = [])).push(id);
    while (owner.interp.length > MAX_ACTIVE) {
      const old = getInterp(civ3, owner.interp.shift());
      if (old) old.until = civ3.monthIndex;
    }
    return id;
  }
  var interpPos = /* @__PURE__ */ new WeakMap();
  function getInterp(civ3, id) {
    let m = interpPos.get(civ3);
    if (!m || m.n > civ3.interpretations.length) {
      m = { n: 0, map: /* @__PURE__ */ new Map() };
      interpPos.set(civ3, m);
    }
    for (; m.n < civ3.interpretations.length; m.n++) m.map.set(civ3.interpretations[m.n].interpId, civ3.interpretations[m.n]);
    return m.map.get(id) ?? null;
  }
  function grievance(civ3, st2, targetId) {
    let s = 0;
    for (const id of st2.interp ?? []) {
      const x = getInterp(civ3, id);
      if (x && x.valence < 0 && x.about.includes(targetId)) s -= x.valence;
    }
    return Math.min(1, s);
  }
  var TEXT = {
    victory: (a, b, w) => `${a}\u306E\u5E74\u4EE3\u8A18\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u3092\u6804\u5149\u306E\u52DD\u5229\u3068\u3057\u3066\u8A18\u3057\u305F\u3002`,
    humiliation: (a, b, w) => `${a}\u3067\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u306F\u5C48\u8FB1\u306E\u8A18\u61B6\u3068\u3057\u3066\u8A9E\u3089\u308C\u305F\u3002`,
    inconclusive: (a, b, w) => `${a}\u306E\u8A18\u9332\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u3092\u3001\u6C7A\u7740\u306E\u3064\u304B\u306A\u304B\u3063\u305F\u3082\u306E\u3068\u3057\u3066\u8A18\u3057\u305F\u3002`,
    founding: (a) => `${a}\u306E\u5EFA\u56FD\u306E\u7269\u8A9E\u304C\u7DE8\u307E\u308C\u305F\u3002`
  };
  function addWork(ctx, author, ev, stance, text, claims) {
    const { civ: civ3, ids } = ctx, id = ids.next("work");
    civ3.works.push({ workId: id, kind: "chronicle", authorId: author.id, date: { ...civ3.date }, targetEventId: ev.eventId, stance, text, claims, fidelity: claims.some((c) => c.claimed !== c.actual) ? "distorted" : "faithful" });
  }
  var factionOf = (w, id) => w.sides.a.includes(id) ? "a" : "d";
  function stepInterpretation(ctx) {
    const { civ: civ3 } = ctx;
    const E = civ3.events;
    for (; civ3.interpCursor < E.length; civ3.interpCursor++) {
      const ev = E[civ3.interpCursor];
      if (ev.kind === "war_ended") {
        const wid = ev.participants.find((p) => p.role === "war")?.entityId, w = civ3.wars[wid];
        if (!w) continue;
        for (const bp of ev.participants.filter((p) => p.role === "belligerent")) {
          const s = civ3.states[bp.entityId];
          if (!s) continue;
          const side = factionOf(w, s.id), foe = civ3.states[side === "a" ? w.defender : w.aggressor];
          if (!foe || foe.id === s.id) continue;
          const lead = w.outcome === "aggressor_victory" ? "a" : w.outcome === "defender_victory" ? "d" : Math.abs(w.score) >= 25 ? w.score > 0 ? "a" : "d" : null;
          const won = lead === side, lost = lead !== null && lead !== side;
          const stance = won ? "victory" : lost ? "humiliation" : "inconclusive";
          addInterp(ctx, s, ev, stance, won ? 0.6 : lost ? -0.7 : -0.1, [foe.id]);
          if (lost && ev.effects.some((e) => e.before === s.id)) addInterp(ctx, s, ev, "lost_territory", -0.8, [foe.id]);
          const k = won ? 0.7 : lost ? 1.6 : 1, tribal = s.polity === "tribal" ? 1 : 0;
          const f = tribal ? 1 : k;
          addWork(ctx, s, ev, stance, TEXT[stance](s.name, foe.name, w), [{ property: "war.casualties", claimed: Math.round(w.casualties * f), actual: Math.round(w.casualties) }, { property: "war.outcome", claimed: lost && !tribal ? "stalemate" : stance === "inconclusive" && (s.polity === "kingdom" || s.polity === "empire") ? side === "a" ? "aggressor_victory" : "defender_victory" : w.outcome, actual: w.outcome }]);
        }
      } else if (ev.kind === "treaty_ended") {
        const br = ev.participants.find((p) => p.role === "breaker");
        if (!br) continue;
        for (const p of ev.participants.filter((x) => x.role === "party")) {
          const s = civ3.states[p.entityId];
          if (s?.alive) addInterp(ctx, s, ev, "betrayal", -0.6, [br.entityId]);
        }
      } else if (ev.kind === "state_formed") {
        const sp = ev.participants.find((p) => p.role === "state"), s = civ3.states[sp?.entityId];
        if (s) {
          addInterp(ctx, s, ev, "founding", 0.5, []);
          addWork(ctx, s, ev, "founding", TEXT.founding(s.name), []);
        }
      }
    }
    for (const id in civ3.states) {
      const st2 = civ3.states[id];
      if (!st2.alive || !st2.interpDirty) continue;
      st2.interpDirty = false;
      const k = st2.polity === "republic" ? 0.4 : st2.polity === "empire" || st2.polity === "kingdom" ? 1.1 : 0.6;
      for (const iid of [...st2.interp ?? []]) {
        const x = getInterp(civ3, iid);
        if (!x || x.until != null || x.valence >= 0) continue;
        const nv = clamp4(x.valence * k, -1, 0), ev = getEvent(civ3, x.eventId);
        x.until = civ3.monthIndex;
        st2.interp = st2.interp.filter((q2) => q2 !== iid);
        if (ev) addInterp(ctx, st2, ev, Math.abs(nv) < 0.15 ? "reconciled" : x.stance, Math.abs(nv) < 0.15 ? 0 : nv, x.about, iid);
      }
    }
  }

  // js/core/civ/magic.js
  init_events();
  init_culture();
  init_species();
  init_cohorts();
  init_spatial();
  init_civ_state();
  init_graph();
  var ABILITIES = Object.freeze({
    healing: { id: "healing", ja: "\u7652\u3057", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.01, weight: 3 },
    flame: { id: "flame", ja: "\u708E\u8853", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.05, weight: 2 },
    ward: { id: "ward", ja: "\u7D50\u754C", cost: "\u8853\u8005\u306E\u96C6\u4E2D\uFF08\u9577\u6642\u9593\uFF09", risk: 0.015, weight: 2 },
    farsight: { id: "farsight", ja: "\u9060\u898B", cost: "\u8853\u8005\u306E\u6B63\u6C17", risk: 0.03, weight: 2 },
    beastbond: { id: "beastbond", ja: "\u7363\u4F7F\u3044", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.02, weight: 1.5 },
    storm: { id: "storm", ja: "\u5929\u5019\u306E\u64CD\u4F5C", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.07, weight: 1 }
  });
  var INSTITUTIONS = Object.freeze({ academy: { ja: "\u9B54\u8853\u5B66\u9662", effect: "\u6280\u8853\u306E\u9032\u6357 \u6700\u5927+10%" }, military: { ja: "\u9B54\u5C0E\u5175\u56E3", effect: "\u8ECD\u4E8B\u529B \u6700\u5927+15%" }, temple: { ja: "\u795E\u6BBF", effect: "\u5B89\u5B9A\u5EA6\u306E\u76EE\u6A19 \u6700\u5927+0.04" } });
  var CAPS = Object.freeze({ mil: 0.15, tech: 0.1, stab: 0.04, supplyFull: 6, instCost: 60, minPersons: 2 });
  var BASE_RATE = 12e-10;
  var ORG_MIN = 3;
  var living = (civ3) => {
    var _a;
    return (_a = civ3.magic).living ?? (_a.living = Object.keys(civ3.persons).filter((i) => civ3.persons[i].diedAt == null));
  };
  var kill = (civ3, p, mi) => {
    p.diedAt = mi;
    civ3.magic.living = living(civ3).filter((i) => i !== p.id);
  };
  function supplyOf(civ3, st2, groups) {
    if (st2.policy.tolerance < 0.2) return { n: 0, power: 0, ids: [] };
    const gset = new Set(groups.map((g) => g.id)), ids = [];
    let sum = 0;
    for (const id of living(civ3)) {
      const p = civ3.persons[id];
      if (gset.has(p.groupId)) {
        ids.push(id);
        sum += p.power;
      }
    }
    return { n: ids.length, power: ids.length ? Math.min(1, ids.length / CAPS.supplyFull) * (sum / ids.length) : 0, ids };
  }
  var pickAbility = (rng) => {
    const l = Object.values(ABILITIES), t = l.reduce((s, a) => s + a.weight, 0);
    let r = rng() * t;
    for (const a of l) {
      r -= a.weight;
      if (r <= 0) return a;
    }
    return l[0];
  };
  function stepMagic(ctx) {
    const { civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    if (mi % 3 !== 0) return;
    if (civ3.options.magic === false) return;
    const rate = civ3.options.magicRate ?? 1;
    for (const gid in civ3.groups) {
      const g = civ3.groups[gid], d = dominant(g), sp = speciesOf(d.speciesId, civ3);
      if (rng() >= g.pop * 3 * BASE_RATE * (sp.magic / 2e-3) * rate) continue;
      const ab = pickAbility(rng), pid = ids.next("person"), age = (14 + Math.floor(rng() * 16)) * 12, p = { id: pid, name: ctx.nameGen?.person(civ3, g, rng) ?? makeNameJa(rng), speciesId: sp.id, groupId: gid, bornAt: mi - age, diedAt: null, ability: ab.id, power: Math.round(Math.pow(rng(), 1.5) * 100) / 100 + 0.05, emergedAt: mi, orgId: null };
      p.power = Math.min(1, p.power);
      civ3.persons[pid] = p;
      living(civ3).push(pid);
      const found = makeEvent(civ3, ids, { kind: "magic_gifted_found", title: `${ab.ja}\u306E\u7D20\u8CEA\u3092\u6301\u3064\u8005\u304C\u73FE\u308C\u305F`, participants: [{ entityId: pid, role: "gifted" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, effects: [{ targetId: pid, property: "magic.power", before: null, after: p.power }] });
      const st2 = g.stateId ? civ3.states[g.stateId] : null;
      if (rng() < 0.5) incident(ctx, g, p, ab, found);
      if (st2 && st2.policy.tolerance < 0.35 && rng() < 0.4) {
        const was = d.tension;
        d.tension = Math.min(1, d.tension + 0.2);
        d.interest = "religious_freedom";
        makeEvent(civ3, ids, { kind: "magic_discrimination", title: `${ab.ja}\u306E\u7D20\u8CEA\u8005\u304C\u3001${st2.name}\u3067\u8FEB\u5BB3\u3055\u308C\u305F`, participants: [{ entityId: pid, role: "victim" }, { entityId: st2.id, role: "state" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "strong" }], effects: [{ targetId: gid, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(d.tension * 100) / 100 }] });
      }
    }
    if (mi % 12 === 0) yearly(ctx);
    if (mi % 12 === 3) institutions(ctx);
  }
  function incident(ctx, g, p, ab, found) {
    const { civ: civ3, ids } = ctx, before = Math.round(g.pop);
    let delta = 0, title;
    if (ab.id === "healing") {
      delta = g.pop * 0.02;
      title = "\u7652\u3057\u624B\u304C\u75AB\u75C5\u3092\u93AE\u3081\u305F";
    } else if (ab.id === "flame") {
      delta = -g.pop * 0.01 * p.power;
      title = "\u708E\u8853\u304C\u66B4\u8D70\u3057\u3001\u96C6\u843D\u3092\u713C\u3044\u305F";
    } else if (ab.id === "storm") {
      delta = g.pop * 0.01;
      title = "\u96E8\u4E5E\u3044\u304C\u6210\u529F\u3057\u3001\u53CE\u7A6B\u304C\u6301\u3061\u76F4\u3057\u305F";
    } else if (ab.id === "farsight") {
      title = "\u9060\u898B\u306E\u8005\u304C\u707D\u3044\u3092\u4E88\u8A00\u3057\u305F";
    } else if (ab.id === "ward") {
      title = "\u7D50\u754C\u304C\u96C6\u843D\u3092\u5B88\u3063\u305F";
    } else {
      title = "\u7363\u4F7F\u3044\u304C\u91CE\u7363\u3092\u5F93\u3048\u305F";
    }
    g.pop = Math.max(5, g.pop + delta);
    makeEvent(civ3, ids, { kind: "magic_incident", title, participants: [{ entityId: p.id, role: "gifted" }, { entityId: g.id, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "direct" }], effects: delta ? [{ targetId: g.id, property: "pop", before, after: Math.round(g.pop) }] : [] });
  }
  function yearly(ctx) {
    const { civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex, groups = byState(ctx);
    for (const id of [...living(civ3)]) {
      const p = civ3.persons[id];
      const life = speciesOf(p.speciesId, civ3).lifespan * (0.8 + 0.4 * (hashSeed(id) % 100 / 100));
      if (mi - p.bornAt > life) {
        kill(civ3, p, mi);
        if (p.power > 0.8) makeEvent(civ3, ids, { kind: "magic_gifted_died", title: `\u5F37\u5927\u306A${ABILITIES[p.ability].ja}\u306E\u4F7F\u3044\u624B\u304C\u4E16\u3092\u53BB\u3063\u305F`, participants: [{ entityId: id, role: "gifted" }], location: null });
      }
    }
    for (const sid in civ3.states) {
      const st2 = civ3.states[sid];
      if (!st2.alive) continue;
      const sup = supplyOf(civ3, st2, groups.get(sid) ?? []);
      let org = Object.values(civ3.magic.orgs).find((o) => o.stateId === sid && o.endedAt == null);
      if (!org && sup.n >= ORG_MIN) {
        const oid = ids.next("org"), kind = st2.policy.tolerance < 0.4 ? "\u79D8\u5BC6\u7D50\u793E" : st2.techAdopted.writing != null ? "\u5B66\u3073\u820E" : "\u8853\u8005\u306E\u96C6\u3044";
        org = civ3.magic.orgs[oid] = { id: oid, name: makeNameJa(rng) + (kind === "\u5B66\u3073\u820E" ? "\u306E\u5B66\u3073\u820E" : kind === "\u79D8\u5BC6\u7D50\u793E" ? "\u306E\u7D50\u793E" : "\u306E\u96C6\u3044"), kind, stateId: sid, foundedAt: mi, endedAt: null, members: sup.ids.slice() };
        for (const m of sup.ids) civ3.persons[m].orgId = oid;
        makeEvent(civ3, ids, { kind: "magic_org_founded", title: `${org.name}\uFF08${kind}\uFF09\u304C\u7D50\u3070\u308C\u305F`, participants: [{ entityId: oid, role: "organization" }, { entityId: sid, role: "state" }, ...sup.ids.slice(0, 3).map((m) => ({ entityId: m, role: "member" }))], location: null });
      } else if (org) {
        org.members = sup.ids.slice();
        for (const m of sup.ids) civ3.persons[m].orgId = org.id;
        if (!sup.n) org.endedAt = mi;
      }
      if (org && org.endedAt == null && st2.stability < 0.4 && !st2.magic && rng() < 0.15) {
        st2.stability = Math.max(0, st2.stability - 0.03);
        makeEvent(civ3, ids, { kind: "magic_power_struggle", title: `${org.name}\u304C\u653F\u6CBB\u3078\u306E\u767A\u8A00\u529B\u3092\u6C42\u3081\u305F`, participants: [{ entityId: org.id, role: "organization" }, { entityId: sid, role: "state" }], location: null, causes: asCauses(recentEventsFor(civ3, [sid], ["instability", "demand_raised"], 36, 1), "reaction_to", "plausible"), effects: [{ targetId: sid, property: "stability", before: null, after: Math.round(st2.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutions(ctx) {
    const { civ: civ3, ids, rng } = ctx, groups = byState(ctx);
    for (const sid in civ3.states) {
      const st2 = civ3.states[sid];
      if (!st2.alive || !st2.magic) continue;
      const sup = supplyOf(civ3, st2, groups.get(sid) ?? []);
      st2.magic.power = Math.round(sup.power * 1e3) / 1e3;
      const risk = sup.ids.reduce((s, i) => s + ABILITIES[civ3.persons[i].ability].risk, 0) * 0.15 * (st2.magic.kind === "military" ? 1.5 : 1);
      if (sup.n && rng() < Math.min(0.2, risk)) {
        const b = st2.stability;
        st2.stability = Math.max(0, st2.stability - 0.05);
        const victim = civ3.persons[sup.ids[Math.floor(rng() * sup.ids.length)]];
        if (victim.power > 0.6) kill(civ3, victim, civ3.monthIndex);
        makeEvent(civ3, ids, { kind: "magic_backlash", title: `${st2.name}\u306E${INSTITUTIONS[st2.magic.kind].ja}\u3067\u9B54\u8853\u304C\u66B4\u767A\u3057\u305F`, participants: [{ entityId: sid, role: "state" }, { entityId: victim.id, role: "gifted" }], location: null, effects: [{ targetId: sid, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(st2.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutionCandidates(ctx, st2, e, cand3, bad3) {
    if (st2.magic) return [bad3("magic_institution", "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B")];
    const sup = supplyOf(ctx.civ, st2, e.gs);
    if (sup.n < CAPS.minPersons) return [bad3("magic_institution", `\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044\uFF08${CAPS.minPersons}\u4EBA\u4EE5\u4E0A\u3002\u73FE\u5728${sup.n}\u4EBA\uFF09`)];
    if (st2.techAdopted.writing == null && st2.techAdopted.administration == null) return [bad3("magic_institution", "\u6587\u5B57\u304B\u884C\u653F\u306E\u6280\u8853\u304C\u5FC5\u8981")];
    if (st2.treasury < CAPS.instCost) return [bad3("magic_institution", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
    return Object.keys(INSTITUTIONS).map((k) => cand3("magic_institution", k === "academy" ? { tech: 0.5, prestige: 0.2 } : k === "military" ? { security: 0.45, expansion: 0.25, stability: -0.1 } : { stability: 0.4, culture: 0.3 }, { opt: k, label: INSTITUTIONS[k].ja }));
  }
  function institutionExecute(ctx, st2, c) {
    const k = c.opt;
    if (!INSTITUTIONS[k]) return { ok: false, error: "\u672A\u77E5\u306E\u5236\u5EA6" };
    if (st2.magic) return { ok: false, error: "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B" };
    const sup = supplyOf(ctx.civ, st2, byState(ctx).get(st2.id) ?? []);
    if (sup.n < CAPS.minPersons) return { ok: false, error: "\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044" };
    if (st2.treasury < CAPS.instCost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
    st2.treasury -= CAPS.instCost;
    const org = Object.values(ctx.civ.magic.orgs).find((o) => o.stateId === st2.id && o.endedAt == null);
    st2.magic = { kind: k, foundedAt: ctx.civ.monthIndex, orgId: org?.id ?? null, power: Math.round(sup.power * 1e3) / 1e3 };
    return { ok: true, effects: [{ targetId: st2.id, property: "magic.institution", before: null, after: k }], title: `${INSTITUTIONS[k].ja}\u3092\u5275\u8A2D`, targetId: org?.id ?? null };
  }

  // js/core/civ/disaster.js
  init_events();
  init_civ_state();
  init_spatial();
  init_world_consts();
  init_graph();
  var KIND_JA = Object.freeze({ drought: "\u5E72\u3070\u3064", flood: "\u6D2A\u6C34", volcano: "\u5674\u706B" });
  var CLIMATE_JA = Object.freeze({ cool: "\u5BD2\u51B7\u671F", normal: "\u5E73\u5E38", warm: "\u6E29\u6696\u671F" });
  var HALF_LIFE = 1440;
  var RATE = 0.02;
  var clamp5 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var r3 = (x) => Math.round(x * 1e3) / 1e3;
  function climateIndex(civ3, mi) {
    const h2 = hashSeed(civ3.historySeed, "climate"), a = h2 % 1e3 / 1e3 * 2 * Math.PI;
    return 0.62 * Math.sin(2 * Math.PI * mi / 3600 + a) + 0.38 * Math.sin(2 * Math.PI * mi / 11e3 + 2 * a);
  }
  var phaseOf = (i) => i > 0.35 ? "warm" : i < -0.35 ? "cool" : "normal";
  var climateGrowth = (civ3) => civ3.climate.phase === "cool" ? 0.97 : civ3.climate.phase === "warm" ? 1.01 : 1;
  function stepClimate(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex, idx = climateIndex(civ3, mi), ph = phaseOf(idx);
    civ3.climate.index = r3(idx);
    if (ph !== civ3.climate.phase) {
      const old = civ3.climate.phase;
      civ3.climate.phase = ph;
      civ3.climate.since = mi;
      if (mi > 12) makeEvent(civ3, ids, { kind: "climate_shift", title: `\u6C17\u5019\u304C${CLIMATE_JA[old]}\u304B\u3089${CLIMATE_JA[ph]}\u3078\u79FB\u3063\u305F`, participants: [], location: null, effects: [{ targetId: "world", property: "climate.phase", before: old, after: ph }] });
    }
  }
  function disasterMemory(civ3, st2) {
    const m = st2.memory?.disaster;
    if (!m) return 0;
    let s = 0;
    for (const k in m) s += m[k].w * Math.pow(0.5, (civ3.monthIndex - m[k].at) / HALF_LIFE);
    return s;
  }
  function remember(civ3, st2, kind, sev) {
    var _a;
    const m = (_a = st2.memory ?? (st2.memory = {})).disaster ?? (_a.disaster = {}), cur = m[kind] ? m[kind].w * Math.pow(0.5, (civ3.monthIndex - m[kind].at) / HALF_LIFE) : 0;
    m[kind] = { w: r3(cur + sev), at: civ3.monthIndex };
  }
  var WEIGHT = {
    flood: (w, c) => w.cell.river[c] ? 2 : w.cell.coastDist[c] <= 1 ? 1 : 0.15,
    drought: (w, c, ph) => {
      const b = w.cell.biome[c];
      return (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.TROPICAL_SEASONAL || b === BIOMES2.COLD_DESERT ? 2 : 0.7) * (ph === "warm" ? 1.5 : ph === "cool" ? 0.8 : 1);
    },
    volcano: (w, c) => {
      const m = w.mesh;
      let v = w.cell.volcanic[c] > 0.3 ? 3 : 0;
      if (!v) {
        for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (w.cell.volcanic[m.neighborIds[k]] > 0.3) {
          v = 1;
          break;
        }
      }
      return v;
    }
  };
  var pickKind = (w, c, ph, rng) => {
    const ws = Object.keys(WEIGHT).map((k) => [k, WEIGHT[k](w, c, ph)]), t = ws.reduce((s, x) => s + x[1], 0);
    if (t <= 0) return null;
    let r = rng() * t;
    for (const [k, x] of ws) {
      r -= x;
      if (r <= 0) return k;
    }
    return ws[0][0];
  };
  var resist = (civ3, g) => {
    const st2 = g.stateId ? civ3.states[g.stateId] : null;
    return 1 - 0.6 * (st2?.resilience ?? 0);
  };
  function stepDisaster(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex, rate = (civ3.options.disasterRate ?? 1) * RATE;
    if (rng() < rate) {
      const gl = Object.keys(civ3.groups);
      if (gl.length) {
        const g = civ3.groups[gl[Math.floor(rng() * gl.length)]], kind = pickKind(world, g.cell, civ3.climate.phase, rng);
        if (kind) strike(ctx, g, kind);
      }
    }
    for (const id in civ3.disasters) {
      const d = civ3.disasters[id];
      if (d.ended) continue;
      if (d.kind === "drought" && mi > d.startedAt) for (const gid of d.groupIds) {
        const g = civ3.groups[gid];
        if (g) g.pop = Math.max(5, g.pop * (1 - 3e-3 * d.severity * resist(civ3, g)));
      }
      if (mi >= d.endsAt) {
        d.ended = true;
        makeEvent(civ3, ids, { kind: "disaster_ended", title: `${KIND_JA[d.kind]}\u304C\u53CE\u307E\u3063\u305F`, participants: [{ entityId: id, role: "disaster" }], location: { cell: d.center }, causes: [{ targetId: d.eventId, relation: "part_of", basis: "direct" }] });
      }
    }
    if (mi % 120 === 0) {
      for (const id in civ3.disasters) if (civ3.disasters[id].ended && mi - civ3.disasters[id].endsAt > 1200 && !civ3.disasters[id].archived) civ3.disasters[id].archived = true;
    }
  }
  function strike(ctx, g0, kind) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex, sev = r3(0.3 + 0.7 * rng()), { terr } = spatialOf(ctx);
    const cells = new Set(territoryOf(world, g0.cell));
    if (kind === "drought") {
      const m = world.mesh;
      for (const c of [...cells]) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (world.cell.landWater[m.neighborIds[k]] === LAND_WATER2.LAND) cells.add(m.neighborIds[k]);
    }
    const hit = /* @__PURE__ */ new Set();
    for (const c of cells) for (const gid of terr.get(c) ?? []) hit.add(gid);
    hit.add(g0.id);
    const months = kind === "drought" ? 12 + Math.floor(rng() * 36) : kind === "volcano" ? 12 + Math.floor(rng() * 24) : 1 + Math.floor(rng() * 2), id = ids.next("disaster");
    const d = civ3.disasters[id] = { id, kind, startedAt: mi, endsAt: mi + months, center: g0.cell, cells: [...cells].slice(0, 12), severity: sev, groupIds: [...hit].sort(), eventId: null, ended: false, deaths: 0 };
    const effects = [], states = /* @__PURE__ */ new Set();
    let dead = 0;
    for (const gid of d.groupIds) {
      const g = civ3.groups[gid];
      if (!g) continue;
      const res = resist(civ3, g), before = Math.round(g.pop);
      if (kind === "flood") g.pop = Math.max(5, g.pop * (1 - 0.08 * sev * res));
      else if (kind === "volcano") g.pop = Math.max(5, g.pop * (1 - 0.15 * sev * res));
      if (kind !== "flood") {
        g.capMult = r3(clamp5(1 - (kind === "drought" ? 0.45 : 0.35) * sev * res, 0.3, 1));
        g.capUntil = mi + months + (kind === "volcano" ? 12 : 6);
      }
      dead += Math.max(0, before - g.pop);
      {
        const dc = g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
        dc.tension = clamp5(dc.tension + 0.05 * sev * res);
      }
      effects.push({ targetId: gid, property: "pop", before, after: Math.round(g.pop) });
      if (g.stateId) states.add(g.stateId);
    }
    d.deaths = Math.round(dead);
    for (const sid of states) {
      const st2 = civ3.states[sid];
      if (!st2?.alive) continue;
      const b = st2.stability;
      st2.stability = Math.max(0, st2.stability - 0.03 * sev * (1 - 0.6 * (st2.resilience ?? 0)));
      remember(civ3, st2, kind, sev);
      effects.push({ targetId: sid, property: "stability", before: r3(b), after: r3(st2.stability) });
    }
    const ev = makeEvent(civ3, ids, { kind: "disaster_struck", title: `${KIND_JA[kind]}\uFF08\u898F\u6A21 ${Math.round(sev * 100)}\uFF09\u304C\u8D77\u304D\u305F`, participants: [{ entityId: id, role: "disaster" }, ...d.groupIds.slice(0, 8).map((x) => ({ entityId: x, role: "affected" })), ...[...states].slice(0, 4).map((x) => ({ entityId: x, role: "state" }))], location: { cell: g0.cell }, causes: [{ targetId: "world", relation: "enabled_by", basis: "plausible" }].filter(() => false).concat(civ3.climate.phase !== "normal" ? [] : []), effects });
    d.eventId = ev.eventId;
    if (sev >= 0.6) {
      const occ = spatialOf(ctx).terr, g = d.groupIds.map((x) => civ3.groups[x]).filter((x) => x && !x.order && x.pop >= POP.minBudPop * 3).sort((a, b) => b.pop - a.pop)[0];
      if (g) {
        const t = bestTargets(world, civ3, g, occ, 3);
        if (t.length) {
          if (g.player) addProposal(civ3, ids, g, "split", { targets: t });
          else if (rng() < 0.3) {
            const moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            g.lastBudAt = mi;
            const child = spawnGroup(civ3, ids, g, t[0].cell, moved);
            occ.set(t[0].cell, [child.id]);
            makeEvent(civ3, ids, { kind: "group_split", title: "\u707D\u5BB3\u3092\u9003\u308C\u3066\u96C6\u56E3\u304C\u5206\u304B\u308C\u305F", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t[0].cell }, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] });
          }
        }
      }
    }
    return d;
  }
  function recentDisasterLoad(civ3, st2, months = 24) {
    let s = 0;
    for (const id in civ3.disasters) {
      const d = civ3.disasters[id];
      if (civ3.monthIndex - d.endsAt > months) continue;
      for (const gid of d.groupIds) if (civ3.groups[gid]?.stateId === st2.id) {
        s += d.severity;
        break;
      }
    }
    return Math.min(1, s);
  }

  // js/core/civ/actions.js
  var clamp6 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var cand = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad = (key, reason, o = {}) => cand(key, {}, { ...o, eligible: false, reason });
  var r32 = (x) => Math.round(x * 1e3) / 1e3;
  var eff = (list, st2, property, before, after) => {
    list.push({ targetId: st2.id, property, before: typeof before === "number" ? Math.round(before * 1e3) / 1e3 : before, after: typeof after === "number" ? Math.round(after * 1e3) / 1e3 : after });
  };
  var spend = (st2, n2) => st2.treasury >= n2 ? (st2.treasury -= n2, true) : false;
  function observe(ctx, st2) {
    const { civ: civ3 } = ctx, gs = byState(ctx).get(st2.id) ?? [], nb = neighborStates(ctx, st2).map((i) => civ3.states[i]).filter(Boolean);
    let tens = 0;
    for (const g of gs) {
      let t = 0;
      for (const c of g.cohorts) if (c.tension > t) t = c.tension;
      tens += t * g.pop;
    }
    const my = strength(civ3, st2), nbs = nb.map((o) => ({ st: o, pop: o.pop, strength: strength(civ3, o), rel: st2.relations[o.id] ?? 0, atWar: atWarWith(civ3, st2, o), treaties: { na: !!treatyBetween(civ3, st2, o, "nonaggression"), al: !!treatyBetween(civ3, st2, o, "alliance"), tr: !!treatyBetween(civ3, st2, o, "trade") } }));
    const techs = Object.keys(st2.techAdopted).length, lag = nbs.length ? clamp6((nbs.reduce((s, n2) => s + Object.keys(n2.st.techAdopted).length, 0) / nbs.length - techs) / 6) : 0;
    const myBase = st2.pop * 5e-3 * (0.5 + st2.stability) * (my / (st2.army + 1e-9) || 1) * (1 + st2.defense * 0.5), maxThreat = nbs.reduce((m, n2) => Math.max(m, n2.strength / (myBase + 1)), 0);
    const seaNbs = ctx.warOps ? ctx.warOps.seaTargets(ctx, st2).map((o) => ({ st: o, pop: o.pop, strength: strength(civ3, o), rel: st2.relations[o.id] ?? 0, atWar: atWarWith(civ3, st2, o), sea: true, treaties: { na: !!treatyBetween(civ3, st2, o, "nonaggression"), al: !!treatyBetween(civ3, st2, o, "alliance"), tr: !!treatyBetween(civ3, st2, o, "trade") } })) : [];
    return { gs, nbs, seaNbs, pop: st2.pop, my, tension: st2.pop ? tens / st2.pop : 0, treasuryNeed: clamp6(1 - st2.treasury / (st2.pop * 0.02 + 50)), techLag: lag, threat: clamp6((maxThreat - 0.8) / 2), atWar: st2.warIds.length > 0, mi: civ3.monthIndex };
  }
  var free = (ctx, id) => ctx.civ.states[id];
  var ACTIONS = [
    {
      key: "set_tax",
      domain: "finance",
      label: "\u7A0E\u7387\u306E\u8ABF\u6574",
      enabled: true,
      candidates(ctx, st2, e) {
        const t = st2.policy.tax, out = [];
        if (t < Math.min(0.4, st2.politics?.taxCeiling ?? 0.4)) out.push(cand("set_tax", { prosperity: 0.9 * e.treasuryNeed, stability: -0.4 - e.tension }, { opt: "up", label: "\u5897\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0A\u9650", { opt: "up" }));
        if (t > 0.03) out.push(cand("set_tax", { stability: 0.2 + 0.7 * e.tension, prosperity: -0.3 * e.treasuryNeed }, { opt: "down", label: "\u6E1B\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0B\u9650", { opt: "down" }));
        return out;
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.policy.tax, a = r32(clamp6(b + (c.opt === "up" ? 0.05 : -0.05), 0.02, 0.4));
        st2.policy.tax = a;
        eff(ef, st2, "policy.tax", b, a);
        return { ok: true, effects: ef, title: c.opt === "up" ? "\u5897\u7A0E" : "\u6E1B\u7A0E" };
      }
    },
    {
      key: "adopt_tech",
      domain: "tech",
      label: "\u6280\u8853\u306E\u63A1\u7528",
      enabled: true,
      candidates(ctx, st2, e) {
        var _a;
        const cache = (_a = ctx.civ).adoptCache ?? (_a.adoptCache = {}), hit = cache[st2.id];
        const keys = hit && e.mi - hit.mi < 12 ? hit.keys : (cache[st2.id] = { mi: e.mi, keys: adoptable(ctx, st2, e.gs).map((t) => t.key) }, cache[st2.id].keys);
        const list = keys.map((k) => TECH[k]).filter(Boolean);
        return list.filter((t) => st2.techAdopted[t.key] == null).slice(0, 3).map((t) => {
          const cost = t.tier * 15;
          return st2.treasury >= cost ? cand("adopt_tech", { tech: 0.3 + 0.12 * t.tier + e.techLag * 0.4, prosperity: 0.15, prestige: 0.05 * t.tier }, { opt: t.key, label: `${t.name}\u3092\u5236\u5EA6\u5316` }) : bad("adopt_tech", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044", { opt: t.key });
        });
      },
      execute(ctx, st2, c) {
        const t = TECH[c.opt];
        if (!t || st2.techAdopted[t.key] != null) return { ok: false, error: "\u63A1\u7528\u3067\u304D\u306A\u3044\u6280\u8853" };
        if (!spend(st2, t.tier * 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.techAdopted[t.key] = ctx.civ.monthIndex;
        return { ok: true, kind: "tech_institutionalized", effects: [{ targetId: st2.id, property: `techAdopted.${t.key}`, before: null, after: ctx.civ.monthIndex }], title: `${t.name}\u3092\u5236\u5EA6\u5316` };
      }
    },
    {
      key: "change_polity",
      domain: "institution",
      label: "\u653F\u4F53\u306E\u5909\u66F4",
      enabled: true,
      candidates(ctx, st2) {
        const a = st2.techAdopted, out = [], p = st2.polity, n2 = st2.pop;
        if (p === "tribal") out.push(n2 >= 2e3 && stateCan(ctx.civ, st2, "polity:chiefdom") ? cand("change_polity", { stability: 0.3, prestige: 0.2 }, { opt: "chiefdom" }) : bad("change_polity", n2 < 2e3 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:chiefdom"), { opt: "chiefdom" }));
        if (p === "chiefdom" || p === "theocracy") {
          out.push(stateCan(ctx.civ, st2, "polity:kingdom") && n2 >= 15e3 ? cand("change_polity", { stability: 0.3, prestige: 0.4 }, { opt: "kingdom" }) : bad("change_polity", n2 < 15e3 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:kingdom"), { opt: "kingdom" }));
          if (p === "chiefdom") out.push(stateCan(ctx.civ, st2, "polity:republic") && n2 >= 15e3 && st2.policy.tolerance > 0.5 ? cand("change_polity", { stability: 0.25, culture: 0.2 }, { opt: "republic" }) : bad("change_polity", gateReason(ctx.civ, st2, "polity:republic") ?? "\u4EBA\u53E3\u3068\u5BDB\u5BB9\u304C\u8DB3\u308A\u306A\u3044", { opt: "republic" }));
        }
        if (p === "kingdom") out.push(stateCan(ctx.civ, st2, "polity:empire") && n2 >= 15e4 ? cand("change_polity", { stability: 0.2, prestige: 0.6, expansion: 0.2 }, { opt: "empire" }) : bad("change_polity", n2 < 15e4 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:empire"), { opt: "empire" }));
        return out;
      },
      execute(ctx, st2, c) {
        const ok2 = POLITY[c.opt];
        if (!ok2) return { ok: false, error: "\u672A\u77E5\u306E\u653F\u4F53" };
        {
          const gr = gateReason(ctx.civ, st2, POLITY_CAP[c.opt]);
          if (gr) return { ok: false, error: gr };
        }
        const ef = [];
        eff(ef, st2, "polity", st2.polity, c.opt);
        st2.polity = c.opt;
        st2.interpDirty = true;
        const rt = retitle(st2, c.opt);
        if (rt) {
          eff(ef, st2, "name", st2.name, rt.name);
          st2.name = rt.name;
          st2.nameBase = rt.base;
        }
        return { ok: true, facts: { stateId: st2.id, polity: c.opt, ...rt ? { name: rt.name } : {} }, effects: ef, title: `\u653F\u4F53\u3092${POLITY[c.opt]}\u3078${rt ? `\uFF08\u56FD\u53F7\u306F${rt.name}\uFF09` : ""}` };
      }
    },
    {
      key: "designate_heir",
      domain: "leader",
      label: "\u7D99\u627F\u8005\u306E\u6307\u540D",
      enabled: true,
      candidates(ctx, st2) {
        return st2.leader.heir ? [bad("designate_heir", "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F")] : [cand("designate_heir", { stability: 0.35 })];
      },
      execute(ctx, st2) {
        if (st2.leader.heir) return { ok: false, error: "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F" };
        st2.leader.heir = true;
        return { ok: true, effects: [{ targetId: st2.id, property: "leader.heir", before: false, after: true }] };
      }
    },
    {
      key: "encourage_settlement",
      domain: "population",
      label: "\u5B9A\u4F4F\u30FB\u5165\u690D\u306E\u5968\u52B1",
      enabled: true,
      candidates(ctx, st2) {
        return st2.boostUntil > ctx.civ.monthIndex ? [bad("encourage_settlement", "\u5968\u52B1\u4E2D")] : st2.treasury >= 30 ? [cand("encourage_settlement", { prosperity: 0.3, expansion: 0.25 })] : [bad("encourage_settlement", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (!spend(st2, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.boostUntil = ctx.civ.monthIndex + 60;
        return { ok: true, effects: [{ targetId: st2.id, property: "boostUntil", before: null, after: st2.boostUntil }] };
      }
    },
    {
      key: "set_mobilization",
      domain: "mobilization",
      label: "\u52D5\u54E1",
      enabled: true,
      candidates(ctx, st2, e) {
        const want = e.atWar || e.threat > 0.7 ? 0.15 : e.threat > 0.4 ? 0.05 : 0;
        return [0, 0.05, 0.15].filter((v) => v !== st2.policy.mobilization).map((v) => cand("set_mobilization", v === want ? { security: 0.5, prosperity: v < st2.policy.mobilization ? 0.2 : -0.1 } : { security: -0.3 }, { opt: String(v), label: `\u52D5\u54E1\u7387${v}` }));
      },
      execute(ctx, st2, c) {
        const v = Number(c.opt);
        if (!(v >= 0 && v <= 0.15)) return { ok: false, error: "\u52D5\u54E1\u7387\u304C\u7BC4\u56F2\u5916" };
        const ef = [];
        eff(ef, st2, "policy.mobilization", st2.policy.mobilization, v);
        st2.policy.mobilization = v;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "build_fortification",
      domain: "military",
      label: "\u8981\u585E\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st2, e) {
        if (st2.techAdopted.fortification == null) return [bad("build_fortification", "\u57CE\u58C1\u306E\u6280\u8853\u3092\u63A1\u7528\u3057\u3066\u3044\u306A\u3044")];
        if (st2.defense >= 0.5) return [bad("build_fortification", "\u6574\u5099\u6E08\u307F")];
        return st2.treasury >= 40 ? [cand("build_fortification", { security: 0.3 + e.threat * 0.6 })] : [bad("build_fortification", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (st2.techAdopted.fortification == null) return { ok: false, error: "\u57CE\u58C1\u306E\u6280\u8853\u304C\u306A\u3044" };
        if (!spend(st2, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        eff(ef, st2, "defense", st2.defense, Math.min(0.5, st2.defense + 0.1));
        st2.defense = Math.min(0.5, st2.defense + 0.1);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "plan_conquest",
      domain: "war",
      label: "\u5F81\u670D\u306E\u8A08\u753B",
      enabled: true,
      candidates(ctx, st2, e) {
        if (st2.campaign) return [bad("plan_conquest", "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D")];
        if (e.mi - (st2.lastWarEnd ?? -999) < 180) return [bad("plan_conquest", "\u6226\u4E89\u306E\u75B2\u5F0A\u304B\u3089\u56DE\u5FA9\u3057\u3066\u3044\u306A\u3044")];
        return [...e.nbs, ...e.seaNbs ?? []].filter((n2) => !n2.atWar && !n2.treaties.na && !n2.treaties.al).map((n2) => {
          const ratio = (e.my + 1) / (n2.strength + 1);
          const gr = grievance(ctx.civ, st2, n2.st.id);
          return ratio >= 1.3 ? cand("plan_conquest", { expansion: clamp6((ratio - 1) / 2) - 0.1 * st2.warIds.length + 0.35 * gr, prestige: 0.1 + 0.3 * gr, stability: -0.2, prosperity: -0.3 }, { target: n2.st.id, label: `${n2.st.name}\u306E\u5F81\u670D` }) : bad("plan_conquest", "\u6226\u529B\u304C\u8DB3\u308A\u306A\u3044", { target: n2.st.id });
        });
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (st2.campaign) return { ok: false, error: "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D" };
        st2.campaign = { kind: "conquest", target: t.id, stage: "prepare", startedAt: ctx.civ.monthIndex, deadline: ctx.civ.monthIndex + 60, warId: null };
        return { ok: true, effects: [{ targetId: st2.id, property: "campaign", before: null, after: `conquest:${t.id}` }], title: `${t.name}\u306E\u5F81\u670D\u3092\u8A08\u753B`, targetId: t.id };
      }
    },
    {
      key: "declare_war",
      domain: "war",
      label: "\u5BA3\u6226",
      enabled: true,
      candidates() {
        return [];
      },
      // AI は「征服の計画」の手順として行う。プレイヤーは対象を指定して実行できる
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || t.id === st2.id) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (atWarWith(ctx.civ, st2, t)) return { ok: false, error: "\u3059\u3067\u306B\u4EA4\u6226\u4E2D" };
        if (treatyBetween(ctx.civ, st2, t, "nonaggression") || treatyBetween(ctx.civ, st2, t, "alliance")) return { ok: false, error: "\u6761\u7D04\u304C\u3042\u308B\u305F\u3081\u5BA3\u6226\u3067\u304D\u306A\u3044\uFF08\u5148\u306B\u7834\u68C4\u3059\u308B\uFF09" };
        if (!(ctx.warOps ? ctx.warOps.canReach(ctx, st2, t) : neighborStates(ctx, st2).includes(t.id))) return { ok: false, error: ctx.warOps ? "\u9678\u3067\u63A5\u3057\u3066\u304A\u3089\u305A\u3001\u6D77\u304B\u3089\u3082\u5C4A\u304B\u306A\u3044" : "\u96A3\u63A5\u3057\u3066\u3044\u306A\u3044" };
        const w = declareWar(ctx, st2, t, { decisionId: c.decisionId, provenance: c.provenance });
        if (st2.campaign?.target === t.id) {
          st2.campaign.stage = "war";
          st2.campaign.warId = w.id;
        }
        return { ok: true, effects: [], warId: w.id, silent: true, targetId: t.id };
      }
    },
    {
      key: "sue_for_peace",
      domain: "war",
      label: "\u8B1B\u548C",
      enabled: true,
      candidates(ctx, st2) {
        return st2.warIds.map((i) => ctx.civ.wars[i]).map((w) => {
          const mine = w.sides.a.includes(st2.id) ? w.score : -w.score;
          return cand("sue_for_peace", { security: clamp6(-mine / 50) + 0.1, stability: 0.2 }, { target: w.id, label: "\u8B1B\u548C" });
        });
      },
      execute(ctx, st2, c) {
        const w = ctx.civ.wars[c.target];
        if (!w || w.status !== "active" || !st2.warIds.includes(w.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
        {
          const r = ctx.negotiate?.peace(ctx, st2, w, c);
          if (r) return r;
        }
        endWar(ctx, w, "negotiated");
        return { ok: true, effects: [], silent: true, targetId: w.id };
      }
    },
    {
      key: "sign_treaty",
      domain: "diplomacy",
      label: "\u6761\u7D04\u306E\u7DE0\u7D50",
      enabled: true,
      candidates(ctx, st2, e) {
        const out = [];
        for (const n2 of e.nbs) {
          if (n2.atWar) continue;
          for (const type of ["nonaggression", "alliance", "trade"]) {
            const have = type === "nonaggression" ? n2.treaties.na : type === "alliance" ? n2.treaties.al : n2.treaties.tr;
            if (have) continue;
            if (grievance(ctx.civ, st2, n2.st.id) > 0.5) {
              out.push(bad("sign_treaty", "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", { target: n2.st.id, opt: type }));
              continue;
            }
            if (n2.rel < -20 || type === "alliance" && n2.rel < 10) {
              out.push(bad("sign_treaty", "\u95A2\u4FC2\u304C\u826F\u304F\u306A\u3044", { target: n2.st.id, opt: type }));
              continue;
            }
            const f = type === "trade" ? { prosperity: 0.35 } : type === "nonaggression" ? { security: 0.2 + clamp6(n2.strength / (e.my + 1) - 0.8) * 0.5 } : { security: 0.3 + e.threat * 0.5, prestige: 0.15 };
            out.push(cand("sign_treaty", f, { target: n2.st.id, opt: type, label: `${n2.st.name}\u3068${TREATY[type].ja}` }));
          }
        }
        return out;
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || !TREATY[c.opt]) return { ok: false, error: "\u76F8\u624B\u307E\u305F\u306F\u6761\u7D04\u306E\u7A2E\u985E\u304C\u4E0D\u6B63" };
        if (atWarWith(ctx.civ, st2, t)) return { ok: false, error: "\u4EA4\u6226\u4E2D\u306E\u76F8\u624B\u3068\u306F\u7D50\u3079\u306A\u3044" };
        if (treatyBetween(ctx.civ, st2, t, c.opt)) return { ok: false, error: "\u3059\u3067\u306B\u7D50\u3093\u3067\u3044\u308B" };
        {
          const r = ctx.negotiate?.treaty(ctx, st2, t, c.opt, c);
          if (r) return r;
        }
        const rel = st2.relations[t.id] ?? 0;
        if (rel < -20 || c.opt === "alliance" && rel < 10) return { ok: false, error: "\u76F8\u624B\u3068\u306E\u95A2\u4FC2\u304C\u5341\u5206\u3067\u306A\u304F\u3001\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", diplomacyFailure: true, targetId: t.id };
        signTreaty(ctx, c.opt, st2, t, { decisionId: c.decisionId, provenance: c.provenance });
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "break_treaty",
      domain: "diplomacy",
      label: "\u6761\u7D04\u306E\u7834\u68C4",
      enabled: true,
      candidates(ctx, st2) {
        if (st2.player) return ctx.civ.activeTreatyIds.map((i) => ctx.civ.treaties[i]).filter((x) => x.active && (x.a === st2.id || x.b === st2.id)).map((x) => cand("break_treaty", { expansion: 0, prestige: -0.5 }, { target: x.id }));
        const camp = st2.campaign;
        if (!camp || camp.stage !== "prepare") return [];
        const t = treatyBetween(ctx.civ, st2, free(ctx, camp.target), "nonaggression");
        return t ? [cand("break_treaty", { expansion: 0.3, prestige: -0.5 }, { target: t.id })] : [];
      },
      execute(ctx, st2, c) {
        const t = ctx.civ.treaties[c.target];
        if (!t?.active || t.a !== st2.id && t.b !== st2.id) return { ok: false, error: "\u305D\u306E\u6761\u7D04\u306F\u6709\u52B9\u3067\u306F\u306A\u3044" };
        endTreaty(ctx, t, "\u7834\u68C4\u3055\u308C\u305F", st2.id);
        adjustRel(st2, ctx.civ.states[t.a === st2.id ? t.b : t.a], -30);
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "impose_sanctions",
      domain: "sanctions",
      label: "\u7D4C\u6E08\u5236\u88C1",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < -10 && !(n2.st.sanctions[st2.id] > e.mi)).map((n2) => cand("impose_sanctions", { security: 0.15, prestige: 0.2, prosperity: -0.15 }, { target: n2.st.id, label: `${n2.st.name}\u3078\u5236\u88C1` }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        t.sanctions[st2.id] = ctx.civ.monthIndex + 36;
        adjustRel(st2, t, -15);
        return { ok: true, effects: [{ targetId: t.id, property: `sanctions.${st2.id}`, before: null, after: t.sanctions[st2.id] }], targetId: t.id };
      }
    },
    {
      key: "covert_op",
      domain: "covert",
      label: "\u79D8\u5BC6\u5DE5\u4F5C",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < 0 && st2.treasury >= 25).map((n2) => cand("covert_op", { expansion: 0.15, security: 0.15, prestige: -0.1 }, { target: n2.st.id, label: `${n2.st.name}\u3078\u306E\u5DE5\u4F5C` }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st2, 25)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const p = 0.35 + (st2.techAdopted.writing != null ? 0.1 : 0) + (st2.techAdopted.administration != null ? 0.1 : 0);
        if (ctx.rng() < p) {
          const b = t.stability;
          t.stability = Math.max(0, t.stability - 0.08);
          return { ok: true, effects: [{ targetId: t.id, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(t.stability * 1e3) / 1e3 }], targetId: t.id, title: "\u79D8\u5BC6\u5DE5\u4F5C\u304C\u6210\u529F" };
        }
        adjustRel(st2, t, -20);
        return { ok: false, error: "\u5DE5\u4F5C\u304C\u767A\u899A\u3057\u305F", diplomacyFailure: true, targetId: t.id };
      }
    },
    {
      key: "suppress_unrest",
      domain: "rebellion",
      label: "\u4E0D\u6E80\u306E\u93AE\u5727",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.treasury >= 20 ? [cand("suppress_unrest", { stability: 0.5 * e.tension + (st2.stability < 0.45 ? 0.4 : 0), culture: -0.1 })] : [bad("suppress_unrest", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2, c) {
        if (!spend(st2, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        for (const g of byState(ctx).get(st2.id) ?? []) for (const co of g.cohorts) co.tension *= 0.8;
        eff(ef, st2, "stability", st2.stability, Math.min(1, st2.stability + 0.06));
        st2.stability = Math.min(1, st2.stability + 0.06);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "grant_autonomy",
      domain: "rebellion",
      label: "\u81EA\u6CBB\u306E\u5BB9\u8A8D",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.policy.autonomy >= 1 ? [bad("grant_autonomy", "\u6700\u5927")] : [cand("grant_autonomy", { stability: 0.6 * e.tension, culture: 0.2, prestige: -0.1 })];
      },
      execute(ctx, st2) {
        const ef = [], b = st2.policy.autonomy;
        st2.policy.autonomy = r32(clamp6(b + 0.2));
        eff(ef, st2, "policy.autonomy", b, st2.policy.autonomy);
        for (const g of byState(ctx).get(st2.id) ?? []) for (const c of g.cohorts) c.tension *= 0.85;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "promote_culture",
      domain: "culture",
      label: "\u540C\u5316\u653F\u7B56",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.policy.assimilation >= 1 ? [bad("promote_culture", "\u6700\u5927")] : [cand("promote_culture", { culture: 0.45, stability: -0.3 * e.tension })];
      },
      execute(ctx, st2) {
        const ef = [], b = st2.policy.assimilation;
        st2.policy.assimilation = r32(clamp6(b + 0.2));
        eff(ef, st2, "policy.assimilation", b, st2.policy.assimilation);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "set_tolerance",
      domain: "religion",
      label: "\u5B97\u6559\u653F\u7B56",
      enabled: true,
      candidates(ctx, st2, e) {
        const t = st2.policy.tolerance;
        return [t < 1 ? cand("set_tolerance", { stability: 0.4 * e.tension, culture: -0.1 }, { opt: "up", label: "\u5BDB\u5BB9" }) : bad("set_tolerance", "\u6700\u5927", { opt: "up" }), t > 0 ? cand("set_tolerance", { culture: 0.3, stability: -0.3 * e.tension }, { opt: "down", label: "\u56FD\u6559\u306E\u5F37\u5316" }) : bad("set_tolerance", "\u6700\u5C0F", { opt: "down" })];
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.policy.tolerance, a = r32(clamp6(b + (c.opt === "up" ? 0.2 : -0.2)));
        st2.policy.tolerance = a;
        eff(ef, st2, "policy.tolerance", b, a);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "found_city",
      domain: "territory",
      label: "\u90FD\u5E02\u306E\u5EFA\u8A2D",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.gs.filter((g) => !g.settlementId && (g.subsistence === "agriculture" || g.subsistence === "fishing") && g.pop >= 250).sort((a, b) => b.pop - a.pop).slice(0, 2).map((g) => cand("found_city", { prosperity: 0.3, expansion: 0.25 }, { target: g.id }));
      },
      execute(ctx, st2, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st2.id || g.settlementId || g.pop < 250 || g.subsistence === "forage" || g.subsistence === "pastoral") return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u3067\u306F\u5EFA\u8A2D\u3067\u304D\u306A\u3044" };
        const s = foundSettlement(ctx.world, ctx.civ, ctx.ids, g), ev = ctx.civ.events.at(-1);
        ev.provenance = c.provenance ?? "simulation";
        ev.decisionId = c.decisionId ?? null;
        return { ok: true, effects: [], silent: true, targetId: s.id };
      }
    },
    {
      key: "annex_group",
      domain: "territory",
      label: "\u5468\u8FBA\u96C6\u56E3\u306E\u7DE8\u5165",
      enabled: true,
      candidates(ctx, st2, e) {
        const out = [];
        for (const g of e.gs) for (const o of neighborGroups(ctx, g)) {
          const t = ctx.civ.groups[o];
          if (t && !t.stateId && !t.player && t.pop < st2.pop) out.push(cand("annex_group", { expansion: 0.45, prosperity: 0.1 }, { target: o }));
        }
        const seen = /* @__PURE__ */ new Set();
        return out.filter((c) => !seen.has(c.target) && seen.add(c.target)).slice(0, 3);
      },
      execute(ctx, st2, c) {
        const t = ctx.civ.groups[c.target];
        if (!t || t.stateId || t.player) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u7DE8\u5165\u3067\u304D\u306A\u3044" };
        if (!spend(st2, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        t.stateId = st2.id;
        learnByAnnexation(ctx, st2, t);
        return { ok: true, facts: { stateId: st2.id, cell: t.cell }, effects: [{ targetId: t.id, property: "stateId", before: null, after: st2.id }], targetId: t.id, title: "\u5468\u8FBA\u306E\u96C6\u56E3\u3092\u7DE8\u5165" };
      }
    },
    {
      key: "move_capital",
      domain: "city",
      label: "\u9077\u90FD",
      enabled: true,
      candidates(ctx, st2, e) {
        const cap = ctx.civ.groups[st2.capitalGroupId], big = e.gs.reduce((a, b) => b.pop > (a?.pop ?? 0) ? b : a, null);
        return big && cap && big.id !== cap.id && big.pop > cap.pop * 2 ? [cand("move_capital", { stability: 0.2, prestige: 0.15 }, { target: big.id })] : [];
      },
      execute(ctx, st2, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st2.id) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u56FD\u5185\u306B\u306A\u3044" };
        const ef = [];
        eff(ef, st2, "capitalGroupId", st2.capitalGroupId, g.id);
        st2.capitalGroupId = g.id;
        return { ok: true, effects: ef, targetId: g.id };
      }
    },
    {
      key: "reconcile",
      domain: "peace",
      label: "\u548C\u89E3",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < -20 && st2.treasury >= 15).map((n2) => cand("reconcile", { security: 0.3 + 0.3 * grievance(ctx.civ, st2, n2.st.id), prestige: 0.1 }, { target: n2.st.id }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st2, 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        adjustRel(st2, t, 25);
        return { ok: true, effects: [], targetId: t.id, title: "\u548C\u89E3\u306E\u4F7F\u7BC0" };
      }
    },
    // 後続マイルストーンで有効にする行動（登録だけして、候補は出さない）
    {
      key: "disaster_relief",
      domain: "disaster",
      label: "\u707D\u5BB3\u6551\u6E08",
      enabled: true,
      candidates(ctx, st2, e) {
        const load = recentDisasterLoad(ctx.civ, st2, 18);
        if (load <= 0) return [];
        return st2.treasury >= 30 ? [cand("disaster_relief", { stability: 0.6 * load + 0.2, prosperity: 0.3 * load, culture: 0.1 }, {})] : [bad("disaster_relief", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (!spend(st2, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        let n2 = 0;
        for (const g of byState(ctx).get(st2.id) ?? []) if (g.capUntil > ctx.civ.monthIndex && g.capMult < 1) {
          g.capMult = Math.min(1, Math.round((g.capMult + 0.2) * 1e3) / 1e3);
          for (const c of g.cohorts) c.tension *= 0.85;
          n2++;
        }
        eff(ef, st2, "stability", st2.stability, Math.min(1, st2.stability + 0.02 + 0.01 * Math.min(n2, 3)));
        st2.stability = Math.min(1, st2.stability + 0.02 + 0.01 * Math.min(n2, 3));
        return { ok: true, effects: ef, title: `\u707D\u5BB3\u306E\u6551\u6E08\uFF08${n2}\u96C6\u56E3\uFF09` };
      }
    },
    {
      key: "build_granary",
      domain: "disaster",
      label: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st2) {
        const mem = disasterMemory(ctx.civ, st2);
        if ((st2.resilience ?? 0) >= 0.5) return [bad("build_granary", "\u6574\u5099\u6E08\u307F")];
        if (st2.treasury < 40) return [bad("build_granary", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        return [cand("build_granary", { stability: 0.9 * Math.min(1, mem), security: 0.4 * Math.min(1, mem), prosperity: 0.1 * Math.min(1, mem) }, {})];
      },
      // 過去の災害の記憶が強い国ほど備える
      execute(ctx, st2) {
        if ((st2.resilience ?? 0) >= 0.5) return { ok: false, error: "\u6574\u5099\u6E08\u307F" };
        if (!spend(st2, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [], b = st2.resilience ?? 0;
        st2.resilience = Math.round(Math.min(0.5, b + 0.1) * 1e3) / 1e3;
        eff(ef, st2, "resilience", b, st2.resilience);
        return { ok: true, effects: ef, title: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099" };
      }
    },
    { key: "magic_institution", domain: "magic", label: "\u9B54\u6CD5\u5236\u5EA6", enabled: true, candidates: (ctx, st2, e) => ctx.civ.options.magic === false ? [] : institutionCandidates(ctx, st2, e, cand, bad), execute: (ctx, st2, c) => institutionExecute(ctx, st2, c) },
    { key: "nuclear_program", domain: "nuclear", label: "\u6838\u8A08\u753B", enabled: false, disabledReason: "\u6838\u306F\u6280\u8853\u300C\u6838\u300D\u306E\u63A1\u7528\u5F8C\uFF08\u5F8C\u7D9A\uFF09", candidates: () => [], execute: () => ({ ok: false, error: "\u672A\u5B9F\u88C5" }) }
  ];
  var ACTION = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));
  function registerAction(def) {
    if (ACTION[def.key]) return;
    ACTIONS.push(def);
    ACTION[def.key] = def;
  }
  for (const a of ACTIONS) {
    const cap = ACTION_CAP[a.key];
    if (!cap || a.enabled === false) continue;
    const c0 = a.candidates, x0 = a.execute;
    a.requires = cap;
    a.candidates = (ctx, st2, e) => {
      const r = gateReason(ctx.civ, st2, cap);
      return r ? [bad(a.key, r)] : c0(ctx, st2, e);
    };
    a.execute = (ctx, st2, c) => {
      const r = gateReason(ctx.civ, st2, cap);
      return r ? { ok: false, error: r } : x0(ctx, st2, c);
    };
  }
  {
    const sg = ACTION.sign_treaty, c0 = sg.candidates, x0 = sg.execute;
    sg.candidates = (ctx, st2, e) => c0(ctx, st2, e).map((c) => {
      const r = gateReason(ctx.civ, st2, TREATY_CAP[c.opt]);
      return r && !c.blocked ? bad("sign_treaty", r, { target: c.target, opt: c.opt }) : c;
    });
    sg.execute = (ctx, st2, c) => {
      const r = gateReason(ctx.civ, st2, TREATY_CAP[c.opt]);
      return r ? { ok: false, error: r } : x0(ctx, st2, c);
    };
  }
  var actionGate = (civ3, st2, key) => {
    const a = ACTION[key];
    if (!a) return { ok: false, reason: "\u672A\u77E5\u306E\u884C\u52D5" };
    const cap = ACTION_CAP[a.key];
    const r = cap ? gateReason(civ3, st2, cap) : null;
    return r ? { ok: false, reason: r } : { ok: true, reason: null };
  };
  var RECORDED = /* @__PURE__ */ new Set(["adopt_tech", "change_polity", "build_fortification", "plan_conquest", "declare_war", "sue_for_peace", "sign_treaty", "break_treaty", "impose_sanctions", "covert_op", "found_city", "annex_group", "move_capital", "reconcile", "grant_autonomy", "nuclear_program"]);
  function runAction(ctx, st2, def, c, { decisionId = null, provenance = "ai" } = {}) {
    const cc = { ...c, decisionId, provenance }, r = def.execute(ctx, st2, cc), { civ: civ3, ids } = ctx;
    if (!r.ok) {
      if (r.diplomacyFailure) {
        const ev = makeEvent(civ3, ids, { kind: "diplomacy_failed", title: `${st2.name}\u306E\u300C${def.label}\u300D\u306F\u4E0D\u6210\u7ACB\uFF08${r.error}\uFF09`, participants: [{ entityId: st2.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: null, effects: [], decisionId, provenance });
        return { ok: false, error: r.error, eventIds: [ev.eventId] };
      }
      return { ok: false, error: r.error, eventIds: [] };
    }
    let eventId = civ3.events.length ? civ3.events[civ3.events.length - 1].eventId : null;
    if (!r.silent && RECORDED.has(def.key)) {
      const ev = makeEvent(civ3, ids, { kind: r.kind ?? "state_action", title: `${st2.name}: ${r.title ?? def.label}`, participants: [{ entityId: st2.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: civ3.groups[st2.capitalGroupId] ? { cell: civ3.groups[st2.capitalGroupId].cell } : null, effects: r.effects ?? [], facts: r.facts ?? null, provenance });
      eventId = ev.eventId;
    }
    return { ok: true, eventIds: [eventId], warId: r.warId ?? null };
  }
  function findCandidate(ctx, st2, def, { target = null, opt = null }) {
    const e = observe(ctx, st2), list = def.key === "declare_war" ? [cand("declare_war", {}, { target })] : def.candidates(ctx, st2, e);
    return list.find((c) => (c.target ?? null) === (target ?? null) && (c.opt ?? null) === (opt ?? null)) ?? null;
  }

  // js/core/civ/ai.js
  init_civ_state();
  init_events();
  var GOALS = Object.freeze({ expand: "expansion", prosper: "prosperity", secure: "security", advance: "tech", consolidate: "stability" });
  var GOAL_JA = Object.freeze({ expand: "\u62E1\u5927", prosper: "\u7E41\u6804", secure: "\u5B89\u5168", advance: "\u6280\u8853\u306E\u9032\u6B69", consolidate: "\u5B89\u5B9A" });
  var BASELINE = 0.15;
  var STRATEGY_EVERY = 120;
  var FACTORS = Object.freeze(["security", "prosperity", "expansion", "stability", "culture", "tech", "prestige"]);
  var SHOWN = 6;
  var SHOWN_IDLE = 3;
  var expandDecision = (civ3, d) => ({ ...d, candidates: [] });
  var clamp7 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var round = (x) => Math.round(x * 1e3) / 1e3;
  function record(ctx, st2, d) {
    return { decisionId: null, actorId: st2.id, result: null };
  }
  var obsOf = (st2, e) => ({ pop: Math.round(st2.pop), treasury: Math.round(st2.treasury), stability: round(st2.stability), army: Math.round(st2.army), strength: Math.round(e.my), atWar: e.atWar, neighbors: e.nbs.length, tension: round(e.tension), threat: round(e.threat), campaign: st2.campaign ? `${st2.campaign.kind}:${st2.campaign.stage}` : null });
  function totalOf(st2, c, crisis) {
    const goalF = st2.strategy ? GOALS[st2.strategy.goal] : null;
    let t = 0;
    for (const [f, v] of Object.entries(c.factors)) {
      let w = st2.personality[f] ?? 1;
      if (f === goalF) w *= 1.5;
      if (crisis && (f === "stability" || f === "security")) w *= 2;
      t += w * v;
    }
    return round(t);
  }
  var view = (c, total) => [c, total];
  function chooseStrategy(ctx, st2, e) {
    const needs = { expand: 0.25 + 0.4 * clamp7((e.my + 1) / (e.nbs.reduce((s, n2) => s + n2.strength, 0) / Math.max(1, e.nbs.length) + 1) - 1, 0, 2) * 0.5, prosper: e.treasuryNeed, secure: e.threat, advance: e.techLag, consolidate: 1 - st2.stability };
    const list = Object.entries(needs).map(([goal, n2]) => ({ goal, total: round(n2 * st2.personality[GOALS[goal]]) })).sort((a, b) => b.total - a.total || (a.goal < b.goal ? -1 : 1));
    const d = record(ctx, st2, { layer: "strategy", type: "set_strategy", obs: obsOf(st2, e), candidates: list.map((x) => view({ key: x.goal, target: null, opt: null, eligible: true, reason: null, factors: {} }, x.total)), chosen: { key: list[0].goal, target: null, opt: null } });
    const changed = st2.strategy?.goal !== list[0].goal;
    st2.strategy = { goal: list[0].goal, since: ctx.civ.monthIndex };
    d.result = { ok: true, error: null, eventIds: [], changed };
  }
  function planCampaign(ctx, st2, e) {
    const { civ: civ3 } = ctx, c = st2.campaign, t = civ3.states[c.target];
    let key = "wait", why2 = null;
    if (!t?.alive) {
      key = "abandon";
      why2 = "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044";
    } else if (civ3.monthIndex > c.deadline && c.stage === "prepare") {
      key = "abandon";
      why2 = "\u671F\u9650\u5207\u308C";
    } else if (st2.stability < 0.3) {
      key = "abandon";
      why2 = "\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A";
    } else if (c.stage === "prepare") {
      const fc = ctx.warForecast?.(st2, t), ratio = fc ? fc.ratio : (e.my + 1) / (strength(civ3, t) + 1);
      if (st2.policy.mobilization < 0.1) key = "mobilize";
      else if (ratio >= 1.2 || civ3.monthIndex - c.startedAt >= 12) {
        key = ratio >= 1 && (!fc || fc.pAWin >= 0.4) ? "declare_war" : "abandon";
        if (key === "abandon") why2 = "\u6226\u529B\u304C\u898B\u5408\u308F\u306A\u3044";
      }
    } else if (c.stage === "war" && !(c.warId && civ3.wars[c.warId]?.status === "active")) {
      key = "abandon";
      why2 = "\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F";
    }
    const cands = ["declare_war", "mobilize", "wait", "abandon"].map((k) => view({ key: k, target: c.target, opt: null, eligible: true, reason: k === key ? why2 : null, factors: {} }, k === key ? 1 : 0));
    return { layer: "campaign", type: `campaign_${key}`, obs: obsOf(st2, e), candidates: cands, chosen: { key, target: c.target, opt: null }, reason: why2 };
  }
  function stepAIPlan(ctx) {
    const { civ: civ3 } = ctx, mi = civ3.monthIndex, every = civ3.options.aiInterval;
    ctx.plans = [];
    for (const id in civ3.states) {
      const st2 = civ3.states[id];
      if (!st2.alive || st2.player) continue;
      if ((hashSeed(id) + mi) % every !== 0) continue;
      const e = observe(ctx, st2);
      if (!st2.strategy || mi - st2.strategy.since >= STRATEGY_EVERY) chooseStrategy(ctx, st2, e);
      if (st2.campaign) {
        const p = planCampaign(ctx, st2, e), d2 = record(ctx, st2, p);
        ctx.plans.push({ st: st2, d: d2, campaign: p.chosen.key, why: p.reason });
        continue;
      }
      const crisis = st2.stability < 0.35 || st2.warIds.some((w) => {
        const wr = civ3.wars[w];
        return (wr.sides.a.includes(st2.id) ? wr.score : -wr.score) < -40;
      }) || st2.treasury < 0;
      const all = [];
      for (const def of ACTIONS) if (def.enabled) for (const c of def.candidates(ctx, st2, e)) all.push({ def, c, total: c.eligible ? totalOf(st2, c, crisis) : -Infinity });
      all.sort((a, b) => b.total - a.total || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : String(a.c.target) < String(b.c.target) ? -1 : 1));
      const best = all.find((x) => x.total > BASELINE), shown = all.slice(0, best ? SHOWN : SHOWN_IDLE).map((x) => view(x.c, x.total === -Infinity ? null : x.total));
      if (!best) shown.push(view({ key: "do_nothing", target: null, opt: null, eligible: true, reason: "\u57FA\u6E96\u5024\uFF080.15\uFF09\u3092\u8D85\u3048\u308B\u5019\u88DC\u304C\u306A\u3044", factors: {} }, BASELINE));
      const d = record(ctx, st2, { layer: crisis ? "crisis" : "routine", type: best ? best.c.key : "do_nothing", obs: obsOf(st2, e), candidates: shown, chosen: best ? { key: best.c.key, target: best.c.target, opt: best.c.opt } : { key: "do_nothing", target: null, opt: null } });
      if (best) ctx.plans.push({ st: st2, d, def: best.def, c: best.c });
      else d.result = { ok: true, error: null, eventIds: [], idle: true };
    }
  }
  function stepAIApply(ctx) {
    const { civ: civ3 } = ctx;
    for (const p of ctx.plans ?? []) {
      const { st: st2, d } = p;
      if (!st2.alive) {
        d.result = { ok: false, error: "\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u306A\u3044", eventIds: [] };
        continue;
      }
      if (p.campaign) {
        const c = st2.campaign;
        if (!c) {
          d.result = { ok: false, error: "\u8A08\u753B\u304C\u65E2\u306B\u7121\u3044", eventIds: [] };
          continue;
        }
        if (p.campaign === "mobilize") {
          const r4 = runAction(ctx, st2, ACTION.set_mobilization, { key: "set_mobilization", opt: "0.15", target: null, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
        } else if (p.campaign === "declare_war") {
          const r4 = runAction(ctx, st2, ACTION.declare_war, { key: "declare_war", target: c.target, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
          if (!r4.ok) st2.campaign = null;
        } else if (p.campaign === "abandon") {
          st2.campaign = null;
          const ev = makeEvent(civ3, ctx.ids, { kind: "campaign_abandoned", title: `${st2.name}\u304C\u5F81\u670D\u8A08\u753B\u3092\u65AD\u5FF5\u3057\u305F\uFF08${p.why}\uFF09`, participants: [{ entityId: st2.id, role: "state" }, { entityId: c.target, role: "target" }], location: null, decisionId: d.decisionId });
          d.result = { ok: true, error: null, eventIds: [ev.eventId] };
        } else d.result = { ok: true, error: null, eventIds: [], waited: true };
        continue;
      }
      const r = runAction(ctx, st2, p.def, p.c, { decisionId: d.decisionId });
      d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    }
    ctx.plans = [];
  }
  function runPlayerAction(ctx, st2, def, c) {
    const e = observe(ctx, st2), d = record(ctx, st2, { layer: "player", provenance: "player", type: c.key, obs: obsOf(st2, e), candidates: [view(c, 0)], chosen: { key: c.key, target: c.target, opt: c.opt } });
    const r = runAction(ctx, st2, def, c, { decisionId: d.decisionId, provenance: "player" });
    d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    return r;
  }

  // js/core/civ/civ-sim.js
  init_history();
  init_archive();
  init_spatial();

  // js/core/civ/commands.js
  init_events();
  init_world_consts();
  init_graph();
  var fail = (error) => ({ ok: false, error });
  function playerGroup(civ3, groupId) {
    const g = civ3.groups[groupId];
    if (!g) return [null, "\u305D\u306E\u96C6\u56E3\u306F\u5B58\u5728\u3057\u307E\u305B\u3093"];
    if (!g.player) return [null, "\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u96C6\u56E3\u3067\u306F\u3042\u308A\u307E\u305B\u3093"];
    return [g, null];
  }
  function applyCommand(ctx, cmd) {
    const { world, civ: civ3, ids } = ctx;
    switch (cmd.type) {
      case "moveGroup": {
        const [g, e] = playerGroup(civ3, cmd.groupId);
        if (e) return fail(e);
        if (g.order) return fail("\u3059\u3067\u306B\u79FB\u52D5\u4E2D\u3067\u3059");
        if (world.cell.landWater[cmd.to] !== LAND_WATER2.LAND) return fail("\u79FB\u52D5\u5148\u306F\u9678\u5730\u3067\u306A\u3051\u308C\u3070\u306A\u308A\u307E\u305B\u3093");
        const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] * 2, g.knowledge.seafaring), d = dist.get(cmd.to);
        if (d == null) return fail(g.knowledge.seafaring < 1 ? "\u5C4A\u304D\u307E\u305B\u3093\uFF08\u6D77\u3092\u6E21\u308B\u822A\u6D77\u306E\u77E5\u8B58\u304C\u306A\u3044\u304B\u3001\u9060\u3059\u304E\u307E\u3059\uFF09" : "\u9060\u3059\u304E\u3066\u5C4A\u304D\u307E\u305B\u3093");
        g.order = { type: "move", to: cmd.to, arriveAt: civ3.monthIndex + Math.max(1, Math.ceil(d / 2)) };
        g.pop = Math.round(g.pop * (1 - Math.min(0.2, d * 0.01)));
        return { ok: true, arriveAt: g.order.arriveAt };
      }
      case "setSubsistence": {
        const [g, e] = playerGroup(civ3, cmd.groupId);
        if (e) return fail(e);
        if (!SUBSISTENCE[cmd.subsistence]) return fail("\u672A\u77E5\u306E\u751F\u696D\u3067\u3059");
        if (cmd.subsistence === "agriculture" && g.knowledge.agriculture < 1) return fail("\u8FB2\u8015\u306E\u77E5\u8B58\u304C\u307E\u3060\u8DB3\u308A\u307E\u305B\u3093");
        if (cmd.subsistence === "pastoral" && g.knowledge.herding < 1) return fail("\u7267\u755C\u306E\u77E5\u8B58\u304C\u307E\u3060\u8DB3\u308A\u307E\u305B\u3093");
        if (cmd.subsistence === "fishing" && world.cell.coastDist[g.cell] > 2 && !world.cell.river[g.cell]) return fail("\u6C34\u8FBA\u3067\u306F\u306A\u3044\u306E\u3067\u6F01\u6488\u306F\u3067\u304D\u307E\u305B\u3093");
        const before = g.subsistence;
        if (before === cmd.subsistence) return fail("\u3059\u3067\u306B\u305D\u306E\u751F\u696D\u3067\u3059");
        g.subsistence = cmd.subsistence;
        makeEvent(civ3, ids, { kind: "subsistence_changed", title: `\u751F\u696D\u306E\u8EE2\u63DB\uFF08${SUBSISTENCE[before]}\u2192${SUBSISTENCE[cmd.subsistence]}\uFF09`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: cmd.subsistence }], provenance: "player" });
        return { ok: true };
      }
      case "foundSettlement": {
        const [g, e] = playerGroup(civ3, cmd.groupId);
        if (e) return fail(e);
        if (g.settlementId) return fail("\u3059\u3067\u306B\u5B9A\u4F4F\u3057\u3066\u3044\u307E\u3059");
        if (g.subsistence === "forage" || g.subsistence === "pastoral") return fail("\u63A1\u96C6\u72E9\u731F\u30FB\u7267\u755C\u306E\u307E\u307E\u3067\u306F\u5B9A\u4F4F\u3067\u304D\u307E\u305B\u3093\uFF08\u8FB2\u8015\u304B\u6F01\u6488\u3078\uFF09");
        if (g.pop < POP.settleMinPop) return fail(`\u4EBA\u53E3\u304C\u8DB3\u308A\u307E\u305B\u3093\uFF08${POP.settleMinPop}\u4EBA\u4EE5\u4E0A\uFF09`);
        const s = foundSettlement(world, civ3, ids, g);
        civ3.events[civ3.events.length - 1].provenance = "player";
        return { ok: true, settlementId: s.id };
      }
      case "splitGroup": {
        const [g, e] = playerGroup(civ3, cmd.groupId);
        if (e) return fail(e);
        if (g.order) return fail("\u79FB\u52D5\u4E2D\u306F\u5206\u6D3E\u3067\u304D\u307E\u305B\u3093");
        if (g.pop < POP.minBudPop * 2) return fail("\u4EBA\u53E3\u304C\u8DB3\u308A\u307E\u305B\u3093");
        const dist = reachable(world, g.cell, POP.moveRange[g.subsistence], g.knowledge.seafaring);
        if (!dist.has(cmd.to) || world.cell.landWater[cmd.to] !== LAND_WATER2.LAND || cmd.to === g.cell) return fail("\u305D\u3053\u3078\u306F\u5206\u6D3E\u3067\u304D\u307E\u305B\u3093");
        for (const o of Object.values(civ3.groups)) if (territoryOf(world, o.cell).includes(cmd.to) || o.cell === cmd.to) return fail("\u305D\u3053\u306F\u307B\u304B\u306E\u96C6\u56E3\u306E\u9818\u57DF\u3067\u3059");
        const moved = Math.round(g.pop * POP.budShare);
        g.pop -= moved;
        g.lastBudAt = civ3.monthIndex;
        const child = spawnGroup(civ3, ids, g, cmd.to, moved);
        child.player = false;
        makeEvent(civ3, ids, { kind: "group_split", title: "\u96C6\u56E3\u306E\u5206\u6D3E", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: cmd.to }, causes: asCauses(recentEventsFor(civ3, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), provenance: "player" });
        return { ok: true, childId: child.id };
      }
      case "formState": {
        const [g, e] = playerGroup(civ3, cmd.groupId);
        if (e) return fail(e);
        if (g.stateId) return fail("\u3059\u3067\u306B\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u307E\u3059");
        const f = evaluateFormation(ctx, g);
        if (!f) return fail("\u56FD\u5BB6\u3092\u5F62\u6210\u3059\u308B\u6761\u4EF6\u304C\u307E\u3060\u6574\u3063\u3066\u3044\u307E\u305B\u3093");
        if (cmd.via && cmd.via !== f.via) return fail(`\u305D\u306E\u7D4C\u8DEF\u3067\u306F\u6210\u7ACB\u3057\u307E\u305B\u3093\uFF08\u73FE\u5728\u306E\u6761\u4EF6\u306F\u300C${f.via}\u300D\uFF09`);
        const st2 = formState(ctx, { ...f, player: true });
        return st2 ? { ok: true, stateId: st2.id } : fail("\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
      }
      case "stateAction": {
        const st2 = civ3.states[cmd.stateId];
        if (!st2?.alive) return fail("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
        if (!st2.player) return fail("\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u56FD\u5BB6\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
        const def = ACTION[cmd.action];
        if (!def) return fail("\u672A\u77E5\u306E\u884C\u52D5\u3067\u3059");
        if (!def.enabled) return fail(`\u3053\u306E\u884C\u52D5\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093\uFF08${def.disabledReason}\uFF09`);
        const c = findCandidate(ctx, st2, def, { target: cmd.target ?? null, opt: cmd.opt ?? null });
        if (!c) return fail("\u305D\u306E\u5BFE\u8C61\u30FB\u5185\u5BB9\u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093");
        if (!c.eligible) return fail(c.reason ?? "\u6761\u4EF6\u3092\u6E80\u305F\u3057\u3066\u3044\u307E\u305B\u3093");
        const r = runPlayerAction(ctx, st2, def, c);
        return r.ok ? { ok: true, eventIds: r.eventIds, warId: r.warId } : fail(r.error);
      }
      case "acceptProposal": {
        const p = civ3.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved);
        if (!p) return fail("\u305D\u306E\u63D0\u6848\u306F\u3042\u308A\u307E\u305B\u3093");
        const map = { change_subsistence: () => ({ type: "setSubsistence", groupId: p.groupId, subsistence: p.payload.subsistence }), found_settlement: () => ({ type: "foundSettlement", groupId: p.groupId }), form_state: () => ({ type: "formState", groupId: p.groupId, via: p.payload.via }), split: () => ({ type: "splitGroup", groupId: p.groupId, to: cmd.to ?? p.payload.targets?.[0]?.cell }) };
        const r = applyCommand(ctx, map[p.kind]());
        if (r.ok) p.resolved = true;
        return r;
      }
      case "dismissProposal": {
        const p = civ3.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved);
        if (!p) return fail("\u305D\u306E\u63D0\u6848\u306F\u3042\u308A\u307E\u305B\u3093");
        p.resolved = true;
        return { ok: true };
      }
      default:
        return fail(`\u672A\u77E5\u306E\u547D\u4EE4: ${cmd.type}`);
    }
  }

  // js/core/civ/civ-sim.js
  function createCivSim(world, civ3, { extensions = [] } = {}) {
    const ids = createIdGen(civ3.seq), ticker = createTicker();
    ticker.register("clock", (ctx2) => {
      setDate(ctx2.civ, ctx2.civ.monthIndex + 1);
      ctx2.rng = rngOf(hashSeed(ctx2.civ.historySeed, ctx2.civ.monthIndex));
    }, "advanceClock");
    ticker.register("climate", stepClimate, "stepClimate");
    ticker.register("disaster", stepDisaster, "stepDisaster");
    ticker.register("economy_pop", stepPopulation, "stepPopulation");
    ticker.register("culture", stepCulture, "stepCulture");
    ticker.register("culture", stepCohorts, "stepCohorts");
    if (!civ3.options?.wcde) ticker.register("culture", stepMagic, "stepMagic");
    ticker.register("tech", stepTech, "stepTech");
    ticker.register("ai_plan", stepAIPlan, "stepAIPlan");
    ticker.register("apply", stepAIApply, "stepAIApply");
    ticker.register("conflict", stepStates, "stepStates", { every: 3 });
    ticker.register("conflict", stepWars, "stepWars");
    ticker.register("conflict", stepInterpretation, "stepInterpretation");
    ticker.register("integrity", (ctx2) => {
      const full = ctx2.civ.monthIndex % 120 === 0, errs = checkCivIntegrity(ctx2.world, ctx2.civ, { sinceEvent: full ? 0 : ctx2.eventsChecked ?? 0, structure: full || ctx2.civ.monthIndex % 12 === 0 });
      ctx2.eventsChecked = ctx2.civ.events.length;
      if (errs.length) throw new Error("\u6587\u660E\u72B6\u614B\u306E\u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkIntegrity");
    ticker.register("archive", (ctx2) => {
      if (!ctx2.civ.options.wcde) recordMonth(ctx2);
    }, "recordMonth");
    const ctx = {
      world,
      civ: civ3,
      ids,
      rng: rngOf(hashSeed(civ3.historySeed, civ3.monthIndex)),
      growthMult: () => climateGrowth(civ3),
      trace: [],
      eventsChecked: civ3.events.length,
      plans: [],
      endWarHook: endWar,
      stateMult: (g) => {
        const st2 = g.stateId ? civ3.states[g.stateId] : null;
        return st2 ? (st2.boostUntil > civ3.monthIndex ? 1.2 : 1) * (1 - 0.4 * st2.policy.mobilization) : 1;
      }
    };
    for (const ext of extensions) ext(ticker, ctx);
    return {
      ctx,
      ticker,
      advanceMonth() {
        ticker.runMonth(ctx);
        return civ3.date;
      },
      advanceMonths(n2, onProgress) {
        for (let i = 0; i < n2; i++) {
          ticker.runMonth(ctx);
          if (onProgress && i % 120 === 119) onProgress(i + 1, n2);
        }
        if (civ3.options.wcde) commitArchive(ctx);
        return civ3.date;
      },
      /** 作業バッファの出来事を歴史資料へ移して整理する（明示的に呼ぶ場合） */
      commit() {
        return commitArchive(ctx);
      },
      command: (cmd) => {
        const r = applyCommand(ctx, cmd);
        if (r.ok) {
          ctx._byState = null;
          recordMonth(ctx);
        }
        return r;
      }
      // 命令で変わった状態は、同じ月の記録を上書きする
    };
  }
  function checkCivIntegrity(world, civ3, { sinceEvent = 0, structure = true } = {}) {
    const errs = [], N2 = world.mesh.cellCount;
    let players = 0;
    if (structure) for (const id of sortedGroupIds(civ3)) {
      const g = civ3.groups[id];
      if (g.id !== id) errs.push(`\u96C6\u56E3ID\u306E\u4E0D\u4E00\u81F4 ${id}`);
      if (!Number.isFinite(g.pop) || g.pop < 0) errs.push(`\u4EBA\u53E3\u304C\u4E0D\u6B63 ${id}`);
      if (!(g.cell >= 0 && g.cell < N2) || world.cell.landWater[g.cell] !== 1) errs.push(`\u96C6\u56E3 ${id} \u304C\u9678\u306B\u3044\u306A\u3044`);
      if (g.player) players++;
      if (g.settlementId && civ3.settlements[g.settlementId]?.groupId !== id) errs.push(`\u96C6\u843D\u306E\u76F8\u4E92\u53C2\u7167\u304C\u58CA\u308C\u3066\u3044\u308B ${id}`);
      for (const k in g.tech.known) {
        if (!TECH[k]) errs.push(`\u96C6\u56E3 ${id} \u304C\u672A\u77E5\u306E\u6280\u8853 ${k} \u3092\u6301\u3064`);
        else if (!Number.isFinite(g.tech.known[k])) errs.push(`\u96C6\u56E3 ${id} \u306E\u6280\u8853 ${k} \u306E\u6642\u70B9\u304C\u4E0D\u6B63`);
      }
    }
    if (players > 1) errs.push("\u30D7\u30EC\u30A4\u30E4\u30FC\u96C6\u56E3\u304C\u8907\u6570\u3042\u308B");
    let ps = 0;
    for (const id in civ3.states) {
      const st2 = civ3.states[id];
      if (!st2.alive) continue;
      if (st2.player) ps++;
      for (const k in st2.techAdopted) if (!TECH[k]) errs.push(`\u56FD\u5BB6 ${id} \u304C\u672A\u77E5\u306E\u6280\u8853 ${k} \u3092\u63A1\u7528\u3057\u3066\u3044\u308B`);
      if (!civ3.groups[st2.capitalGroupId] && civ3.monthIndex % 3 !== 1) errs.push(`\u56FD\u5BB6 ${id} \u306E\u9996\u90FD\u96C6\u56E3\u304C\u7121\u3044`);
      for (const w of st2.warIds) if (civ3.wars[w]?.status !== "active") errs.push(`\u56FD\u5BB6 ${id} \u306E\u6226\u4E89\u53C2\u7167\u304C\u4E0D\u6B63 ${w}`);
    }
    if (ps > 1) errs.push("\u30D7\u30EC\u30A4\u30E4\u30FC\u56FD\u5BB6\u304C\u8907\u6570\u3042\u308B");
    if (structure) for (const id of sortedGroupIds(civ3)) {
      const g = civ3.groups[id];
      if (g.stateId && !civ3.states[g.stateId]?.alive) errs.push(`\u96C6\u56E3 ${id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${g.stateId} \u306B\u5C5E\u3057\u3066\u3044\u308B`);
      let sh = 0;
      for (const c of g.cohorts) sh += c.share;
      if (Math.abs(sh - 1) > 1e-6) errs.push(`\u96C6\u56E3 ${id} \u306E\u30B3\u30DB\u30FC\u30C8\u5272\u5408\u306E\u5408\u8A08\u304C1\u3067\u306A\u3044`);
    }
    for (const wid of civ3.activeWarIds) {
      const w = civ3.wars[wid];
      if (!w || w.status !== "active") errs.push(`\u9032\u884C\u4E2D\u306E\u6226\u4E89\u306E\u8A18\u9332\u304C\u4E0D\u6B63 ${wid}`);
    }
    for (const s of Object.values(civ3.settlements)) if (!civ3.groups[s.groupId]) errs.push(`\u96C6\u843D ${s.id} \u306E\u96C6\u56E3\u304C\u7121\u3044`);
    if (sinceEvent === 0) {
      const seen = /* @__PURE__ */ new Set(), known = /* @__PURE__ */ new Set();
      for (const e of civ3.events) {
        if (seen.has(e.eventId)) errs.push(`\u30A4\u30D9\u30F3\u30C8ID\u91CD\u8907 ${e.eventId}`);
        seen.add(e.eventId);
        for (const p of e.participants) known.add(p.entityId);
      }
    } else {
      const last = civ3.events.length > 0 ? civ3.events[civ3.events.length - 1].eventId : null;
      if (last && civ3.events.slice(sinceEvent).some((e, i, a) => a.findIndex((x) => x.eventId === e.eventId) !== i)) errs.push("\u4ECA\u6708\u306E\u30A4\u30D9\u30F3\u30C8ID\u91CD\u8907");
    }
    return errs;
  }

  // js/core/wcde/domains/economy.js
  init_spatial();
  init_events();

  // js/core/wcde/domains/effective.js
  var FIELDS = Object.freeze({
    industry: { ja: "\u7523\u696D\u529B", mode: "add", min: 0, max: 1e12, half: 36, eps: 1, nominal: (c, s) => s.econ?.industry },
    perCapita: { ja: "\u4E00\u4EBA\u3042\u305F\u308A\u7523\u696D\u529B", mode: "add", min: 0, max: 1e3, half: 36, eps: 2e-3, nominal: (c, s) => s.econ?.perCapita },
    tradeIncome: { ja: "\u4EA4\u6613\u53CE\u5165", mode: "add", min: 0, max: 1e9, half: 12, eps: 0.01, nominal: (c, s) => s.econ?.tradeIncome },
    foodBalance: { ja: "\u98DF\u6599\u306E\u9700\u7D66", mode: "add", min: 0, max: 1.5, half: 12, eps: 2e-3, nominal: (c, s) => s.econ?.foodBalance },
    taxRevenue: { ja: "\u8CA1\u653F\uFF08\u7A0E\u53CE\u306E\u500D\u7387\uFF09", mode: "add", min: 0, max: 3, half: 24, eps: 2e-3, nominal: () => 1 },
    equipLevel: { ja: "\u88C5\u5099\u6C34\u6E96", mode: "add", min: 0, max: 1, half: 24, eps: 2e-3, nominal: (c, s) => s.military?.equipLevel },
    readiness: { ja: "\u7DF4\u5EA6\u30FB\u5373\u5FDC", mode: "add", min: 0, max: 1, half: 12, eps: 2e-3, nominal: (c, s) => s.military?.readiness },
    legitimacy: { ja: "\u6B63\u7D71\u6027", mode: "add", min: 0, max: 1, half: 24, eps: 2e-3, nominal: (c, s) => s.politics?.legitimacy },
    fatigue: { ja: "\u75B2\u52B4\u5EA6", mode: "add", min: 0, max: 1, half: 12, eps: 2e-3, nominal: (c, s) => s.politics?.fatigue },
    // v6.1.0 M7: 複数ドメインへの拡張（国家・人口・外交）。domain は領域の台帳の ID
    stability: { ja: "\u5B89\u5B9A\u5EA6", mode: "add", min: 0, max: 1, half: 18, eps: 2e-3, domain: "states", nominal: (c, s) => s.stability },
    popCapacity: { ja: "\u4EBA\u53E3\u306E\u53CE\u5BB9\u529B\uFF08\u500D\u7387\uFF09", mode: "add", min: 0.2, max: 3, half: 24, eps: 2e-3, domain: "population", nominal: () => 1 },
    relation: { ja: "\u95A2\u4FC2\u5024\uFF08\u3053\u306E\u56FD\u304B\u3089\u76F8\u624B\u3078\u306E\uFF09", mode: "add", min: -100, max: 100, half: 18, eps: 0.5, domain: "war_diplomacy", pair: true, nominal: (c, s, o) => s.relations?.[o] ?? 0 }
  });
  var FIELD_KEYS = Object.freeze(Object.keys(FIELDS));
  var adjKey = (field, other2 = null) => other2 ? `${field}|${other2}` : field;
  var nominalOf = (civ3, st2, key, other2 = null) => {
    const f = FIELDS[key];
    return f ? f.nominal(civ3, st2, other2) : void 0;
  };
  function effective(civ3, st2, key, other2 = null) {
    const f = FIELDS[key];
    if (!f) return 0;
    const base = f.nominal(civ3, st2, other2);
    if (base === void 0 || base === null) return 0;
    const A2 = civ3.wcde?.adjust?.[st2.id];
    let b = base, touched = false;
    if (key === "perCapita" && A2?.industry) {
      const ni = st2.econ?.industry;
      if (ni > 0) {
        b = base * (effective(civ3, st2, "industry") / ni);
        touched = true;
      }
    }
    const adj = A2?.[adjKey(key, f.pair ? other2 : null)];
    if (adj == null && !touched) return base;
    const v = b * (1 + (adj?.mul ?? 0)) + (adj?.add ?? 0);
    return v < f.min ? f.min : v > f.max ? f.max : v;
  }

  // js/core/wcde/domains/economy.js
  init_tech();
  var SUBS = { forage: 0.5, fishing: 0.85, pastoral: 0.8, agriculture: 1 };
  var STAGE = { village: 1, town: 1.4, city: 2 };
  var TRADE_K = 8e-5;
  var ECON_PERIOD = 3;
  var adopted = (st2, k) => st2.techAdopted?.[k] != null;
  function computeProduction(ctx, st2, groups) {
    const { world, civ: civ3 } = ctx, ce = world.cell;
    let pop = 0, output = 0, foodNum = 0, foodDen = 0;
    const techMult = 1 + fxSum(civ3, st2, "ind", groups) + 0.4 * fxSum(civ3, st2, "cap", groups), invest = 1 + (st2.econ?.investment ?? 0);
    for (const g of groups) {
      const stage = g.settlementId ? STAGE[civ3.settlements[g.settlementId]?.stage] ?? 1 : 1;
      let fert = 0;
      const cells = g.cells ?? [g.cell];
      for (const c of cells) fert += ce.fertility[c];
      fert /= cells.length;
      const nat = (ctx.ecoMult ? ctx.ecoMult(g) : 1) * (g.capUntil > civ3.monthIndex ? g.capMult ?? 1 : 1);
      const out = g.pop * (SUBS[g.subsistence] ?? 0.5) * stage * (0.7 + 0.6 * fert) * techMult * invest * (0.4 + 0.6 * nat);
      pop += g.pop;
      output += out;
      foodNum += Math.min(1.3, 1 / Math.max(0.5, g.pressure ?? 1)) * g.pop;
      foodDen += g.pop;
    }
    return { pop, output, foodBalance: foodDen ? foodNum / foodDen : 1 };
  }
  function stepEconomy(ctx) {
    var _a;
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % ECON_PERIOD !== 0) return;
    const by = byState(ctx), alive = Object.values(civ3.states).filter((s) => s.alive);
    for (const st2 of alive) {
      const gs = by.get(st2.id) ?? [], p = computeProduction(ctx, st2, gs), e = st2.econ ?? (st2.econ = { investment: 0, routes: {}, trade: {}, tradeIncome: 0, techBoost: 0 });
      e.output = p.output;
      e.industry = p.output;
      e.perCapita = p.pop ? p.output / p.pop : 0;
      e.foodBalance = p.foodBalance;
      e.investment *= 0.985;
    }
    const gain = new Map(alive.map((s) => [s.id, 0]));
    const done2 = /* @__PURE__ */ new Set();
    for (const a of alive) {
      const prevTrade = a.econ.trade;
      a.econ.trade = {};
      for (const bid of neighborStates(ctx, a)) {
        const b = civ3.states[bid], key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
        if (done2.has(key)) {
          a.econ.trade[bid] = b.econ?.trade?.[a.id] ?? 0;
          continue;
        }
        done2.add(key);
        const war = atWarWith(civ3, a, b), sanc = (a.sanctions[b.id] ?? 0) > mi || (b.sanctions[a.id] ?? 0) > mi;
        const treaty = !!treatyBetween(civ3, a, b, "trade");
        const blockaded = (a.blockade ?? 0) > mi || (b.blockade ?? 0) > mi, open = war || sanc ? 0 : blockaded ? 0.3 : 1 + (treaty ? 1 : 0) + 1.2 * Math.min(fxSum(civ3, a, "trade"), fxSum(civ3, b, "trade"));
        const v = open ? TRADE_K * Math.sqrt(Math.max(0, effective(civ3, a, "industry") * effective(civ3, b, "industry"))) * open : 0;
        a.econ.trade[bid] = v;
        (_a = b.econ).trade ?? (_a.trade = {});
        b.econ.trade[a.id] = v;
        gain.set(a.id, gain.get(a.id) + v);
        gain.set(b.id, gain.get(b.id) + v);
        const was = a.econ.routes[bid];
        if (v > 0.05 && !was) {
          a.econ.routes[bid] = { since: mi };
          b.econ.routes[a.id] = { since: mi };
          makeEvent(civ3, ids, { kind: "trade_route_opened", title: `${a.name}\u3068${b.name}\u306E\u9593\u3067\u4EA4\u6613\u304C\u76DB\u3093\u306B\u306A\u3063\u305F`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], effects: [{ targetId: a.id, property: "econ.tradeIncome", before: null, after: Math.round(v * 100) / 100 }], provenance: "simulation" });
        } else if (v === 0 && was) {
          delete a.econ.routes[bid];
          delete b.econ.routes[a.id];
          const dep = Math.max(prevTrade?.[bid] ?? 0, 0);
          if (dep > 0.05) makeEvent(civ3, ids, { kind: "trade_cut", title: `${a.name}\u3068${b.name}\u306E\u4EA4\u6613\u304C\u9014\u7D76\u3048\u305F\uFF08${war ? "\u6226\u4E89" : "\u5236\u88C1"}\uFF09`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], provenance: "simulation" });
          else {
          }
        }
        if (v > 0) {
          const d = 0.4;
          a.relations[b.id] = Math.min(100, (a.relations[b.id] ?? 0) + d);
          b.relations[a.id] = Math.min(100, (b.relations[a.id] ?? 0) + d);
        }
      }
    }
    for (const st2 of alive) {
      const e = st2.econ, inc = gain.get(st2.id) ?? 0;
      e.tradeIncome = inc;
      st2.treasury += effective(civ3, st2, "tradeIncome");
      e.techBoost = Math.min(0.3, 0.05 * Math.log1p(effective(civ3, st2, "tradeIncome") * 4) + (adopted(st2, "record_keeping") ? 0.04 : 0) + (adopted(st2, "writing") ? 0.06 : 0) + (adopted(st2, "administration") ? 0.05 : 0));
      const tax = st2.pop * st2.policy.tax * 12e-4 * taxMult(st2) * (ctx.taxFactor?.(st2) ?? 1), upkeep = st2.army * 6e-4 * (1 + 0.6 * (st2.military?.equipLevel ?? 0.3)) * (st2.warIds.length ? 1.5 : 1);
      st2.treasury -= upkeep;
      e.fiscal = { tax: Math.round(tax * 100) / 100, trade: Math.round(effective(civ3, st2, "tradeIncome") * 100) / 100, upkeep: Math.round(upkeep * 100) / 100 };
      if (e.foodBalance < 0.8) {
        const al = civ3.activeTreatyIds.filter((i) => {
          const t = civ3.treaties[i];
          return t.type === "alliance" && (t.a === st2.id || t.b === st2.id);
        }).length;
        st2.stability = Math.max(0, st2.stability - (0.8 - e.foodBalance) * 0.05 * (1 - Math.min(0.6, 0.3 * al)));
      }
    }
  }

  // js/core/wcde/domains/politics.js
  init_spatial();
  init_tech();
  init_events();
  init_civ_state();
  init_species();
  var FACTIONS = Object.freeze({ nobility: "\u8CB4\u65CF\u30FB\u6709\u529B\u8005", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846", bureaucrats: "\u5B98\u50DA\u30FB\u66F8\u8A18", artisans: "\u8077\u4EBA\u30FB\u5DE5\u623F", clans: "\u904A\u7267\u6C0F\u65CF" });
  var CORE_FACTIONS = Object.freeze(["nobility", "military", "commoners"]);
  var POLITICS_PERIOD = 3;
  var INFLUENCE = Object.freeze({
    tribal: { nobility: 0.3, clergy: 0.15, merchants: 0.05, military: 0.3, commoners: 0.2, bureaucrats: 0.04, artisans: 0.04, clans: 0.25 },
    chiefdom: { nobility: 0.3, clergy: 0.15, merchants: 0.1, military: 0.3, commoners: 0.15, bureaucrats: 0.05, artisans: 0.05, clans: 0.2 },
    theocracy: { nobility: 0.15, clergy: 0.45, merchants: 0.1, military: 0.15, commoners: 0.15, bureaucrats: 0.1, artisans: 0.05, clans: 0.08 },
    kingdom: { nobility: 0.35, clergy: 0.15, merchants: 0.1, military: 0.25, commoners: 0.15, bureaucrats: 0.12, artisans: 0.05, clans: 0.08 },
    empire: { nobility: 0.3, clergy: 0.1, merchants: 0.1, military: 0.35, commoners: 0.15, bureaucrats: 0.2, artisans: 0.05, clans: 0.08 },
    republic: { nobility: 0.15, clergy: 0.1, merchants: 0.3, military: 0.1, commoners: 0.35, bureaucrats: 0.1, artisans: 0.1, clans: 0.05 }
  });
  var ASSEMBLY = Object.freeze({ tribal: "\u9577\u8001\u4F1A", chiefdom: null, theocracy: "\u8056\u8077\u8005\u4F1A\u8B70", kingdom: null, empire: null, republic: "\u5E02\u6C11\u8B70\u4F1A" });
  var infl = (polity) => INFLUENCE[polity] ?? INFLUENCE.tribal;
  var clamp8 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var sat = (x, k = 1) => clamp8(x / k);
  var adopted2 = (st2, k) => st2.techAdopted?.[k] != null;
  function socialOf(ctx, st2) {
    const { civ: civ3 } = ctx, gs = byState(ctx).get(st2.id) ?? [];
    let tot = 0, city = 0, past = 0;
    for (const g of gs) {
      tot += g.pop;
      if (g.subsistence === "pastoral") past += g.pop;
      const sg = g.settlementId ? civ3.settlements[g.settlementId]?.stage : null;
      if (sg === "town" || sg === "city") city += g.pop;
    }
    return { city: tot ? city / tot : 0, pastoral: tot ? past / tot : 0 };
  }
  function factionKeys(ctx, st2) {
    const so = socialOf(ctx, st2), trade = Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0), keys = [...CORE_FACTIONS];
    if (st2.polity === "theocracy" || st2.pop >= 2500 || st2.magic) keys.push("clergy");
    if (trade > 0 || adopted2(st2, "coinage") || so.city > 0) keys.push("merchants");
    if (adopted2(st2, "record_keeping") || adopted2(st2, "writing") || adopted2(st2, "administration")) keys.push("bureaucrats");
    if (so.city > 0.05 && fxSum(ctx.civ, st2, "ind") >= 0.1) keys.push("artisans");
    if (so.pastoral >= 0.3) keys.push("clans");
    return { keys, so };
  }
  var weightsOf = (polity, keys) => {
    const w = infl(polity);
    let t = 0;
    for (const k of keys) t += w[k] ?? 0.05;
    const o = {};
    for (const k of keys) o[k] = (w[k] ?? 0.05) / t;
    return o;
  };
  function recomputeLegitimacy(P2) {
    let l = 0;
    for (const k of Object.keys(P2.factions)) l += (P2.factions[k].influence ?? 0) * P2.factions[k].support;
    P2.legitimacy = l;
    return l;
  }
  function initPolitics(st2) {
    const f = {};
    for (const k of ["nobility", "clergy", "merchants", "military", "commoners"]) f[k] = { support: 0.55 };
    return { factions: f, ideas: {}, assembly: ASSEMBLY[st2.polity] ?? (adopted2(st2, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null), legitimacy: 0.55, fatigue: 0, taxCeiling: 0.4, lastRegimeChange: -999 };
  }
  var IDEAS = Object.freeze({
    mercantilism: { ja: "\u5546\u696D\u4E3B\u7FA9", pro: { merchants: 0.12, artisans: 0.06 }, con: { nobility: -0.04 } },
    martialism: { ja: "\u5C1A\u6B66\u306E\u6C17\u98A8", pro: { military: 0.12 }, con: { commoners: -0.05 } },
    egalitarianism: { ja: "\u5E73\u7B49\u4E3B\u7FA9", pro: { commoners: 0.12 }, con: { nobility: -0.08 } },
    piety: { ja: "\u656C\u8654\u4E3B\u7FA9", pro: { clergy: 0.12 }, con: { merchants: -0.04 } },
    legalism: { ja: "\u6CD5\u6CBB\u4E3B\u7FA9", pro: { bureaucrats: 0.12, merchants: 0.04 }, con: { clans: -0.05 } },
    traditionalism: { ja: "\u4F1D\u7D71\u4E3B\u7FA9", pro: { nobility: 0.12, clans: 0.05 }, con: { artisans: -0.04 } },
    reformism: { ja: "\u6539\u9769\u5FD7\u5411", pro: { artisans: 0.1, bureaucrats: 0.05 }, con: { nobility: -0.05 } }
  });
  function emergence(ctx, st2, id, inf, trade) {
    const P2 = st2.politics, x = st2.military?.exp ?? {}, tax = st2.policy.tax;
    switch (id) {
      case "mercantilism":
        return 0.9 * (inf.merchants ?? 0) + 0.4 * Math.min(1, trade) + (adopted2(st2, "coinage") ? 0.2 : 0);
      case "martialism":
        return 0.5 * sat(st2.warIds.length, 3) + 0.4 * sat((x.won ?? 0) + (x.sieges ?? 0), 10) + 0.3 * (inf.military ?? 0);
      case "egalitarianism":
        return (st2.polity === "republic" ? 0.55 : 0) + 0.4 * (1 - 2 * tax > 0 ? 1 - 2 * tax : 0) * effective(ctx.civ, st2, "stability") + 0.2 * (1 - (st2.policy.autonomy ?? 0));
      case "piety":
        return (st2.polity === "theocracy" ? 0.7 : 0) + 0.6 * (inf.clergy ?? 0);
      case "legalism":
        return (adopted2(st2, "administration") ? 0.5 : 0) + (adopted2(st2, "writing") ? 0.15 : 0) + 0.4 * (inf.bureaucrats ?? 0);
      case "traditionalism":
        return (st2.polity === "kingdom" ? 0.45 : 0) + 0.5 * (inf.nobility ?? 0) + 0.15 * (st2.leader?.heir ? 1 : 0);
      case "reformism":
        return 0.5 * (1 - effective(ctx.civ, st2, "stability")) * (1 - P2.legitimacy * 0.5) + 0.25 * Math.min(1, trade) + 0.2 * sat(Object.keys(st2.techAdopted ?? {}).length, 40);
    }
    return 0;
  }
  function stepIdeas(ctx, st2, wts, trade) {
    const { civ: civ3, ids } = ctx, P2 = st2.politics, W2 = civ3.wcde, inf = {};
    for (const k in P2.factions) inf[k] = wts[k] ?? 0;
    const ideas = P2.ideas ?? (P2.ideas = {}), accept = 0.5 + 0.5 * (st2.policy.tolerance ?? 0.5);
    const contacts = [.../* @__PURE__ */ new Set([...ctx.world?.mesh ? neighborStates(ctx, st2) : [], ...Object.keys(st2.econ?.trade ?? {})])].map((i) => civ3.states[i]).filter((o) => o?.alive && o.politics), ally = new Set(civ3.activeTreatyIds.map((i) => civ3.treaties[i]).filter((t) => t.type === "alliance" && (t.a === st2.id || t.b === st2.id)).map((t) => t.a === st2.id ? t.b : t.a));
    for (const id in IDEAS) {
      const cur = ideas[id] ?? 0, tgt = clamp8(emergence(ctx, st2, id, inf, trade));
      let net = 0;
      for (const o of contacts) net = Math.max(net, (o.politics.ideas?.[id] ?? 0) * (ally.has(o.id) ? 0.9 : o.econ?.trade?.[st2.id] ? 0.8 : 0.6));
      let nv = cur + 0.12 * (tgt - cur) + Math.max(0, net * accept - cur) * 0.2;
      if (tgt < cur) nv -= 0.015;
      nv = clamp8(nv);
      if (nv < 0.03) delete ideas[id];
      else ideas[id] = Math.round(nv * 1e3) / 1e3;
      const reg = W2.ideas ?? (W2.ideas = {});
      if (nv >= 0.35 && !reg[id]) {
        reg[id] = { at: civ3.monthIndex, stateId: st2.id };
        makeEvent(civ3, ids, { kind: "ideology_emerged", title: `${st2.name}\u3067\u300C${IDEAS[id].ja}\u300D\u304C\u5E83\u307E\u308A\u59CB\u3081\u305F`, participants: [{ entityId: st2.id, role: "state" }], facts: { idea: id, ja: IDEAS[id].ja, stateId: st2.id }, provenance: "simulation" });
      }
    }
  }
  var ideasOf = (st2) => Object.entries(st2.politics?.ideas ?? {}).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, ja: IDEAS[id]?.ja ?? id, v }));
  var treatiesOf = (civ3, st2) => {
    const o = { trade: 0, alliance: 0, nonaggression: 0 };
    for (const i of civ3.activeTreatyIds) {
      const t = civ3.treaties[i];
      if (t && (t.a === st2.id || t.b === st2.id) && t.type in o) o[t.type]++;
    }
    return o;
  };
  function supportTargets(ctx, st2) {
    const { civ: civ3 } = ctx, e = st2.econ ?? {}, p = st2.policy, war = st2.warIds.length > 0, trade = Object.values(e.trade ?? {}).reduce((a, b) => a + b, 0), perCap = e.perCapita ?? 0.6;
    const fat = effective(civ3, st2, "fatigue"), tr = treatiesOf(civ3, st2), mi = civ3.monthIndex, heir = st2.leader?.heir ? 1 : 0, hered = st2.polity === "kingdom" || st2.polity === "empire" || st2.polity === "chiefdom", blockaded = (st2.blockade ?? 0) > mi;
    const t = {
      commoners: clamp8(0.35 + 0.5 * effective(ctx.civ, st2, "stability") + 0.25 * (e.foodBalance ?? 1) - 0.8 * p.tax - 0.4 * fat - 0.25 * p.mobilization),
      merchants: clamp8(0.35 + 0.25 * Math.min(1, trade * 2) + 0.15 * (adopted2(st2, "coinage") ? 1 : 0) + 0.15 * (1 - p.tax * 2) - (war ? 0.15 : 0) + Math.min(0.12, 0.04 * tr.trade) - (blockaded ? 0.15 : 0) - (st2.sanctions?.length ? 0.08 : 0)),
      clergy: clamp8(0.3 + (st2.polity === "theocracy" ? 0.35 : 0) + 0.2 * (1 - p.assimilation) + 0.15 * p.tolerance + (st2.magic ? 0.1 : 0)),
      military: clamp8(0.35 + 0.4 * p.mobilization + (war ? 0.15 : 0) + 0.15 * (st2.treasury > 0 ? 1 : 0) - 0.3 * fat - Math.min(0.12, 0.04 * tr.nonaggression)),
      nobility: clamp8(0.4 + 0.25 * (1 - p.tax) + 0.2 * effective(ctx.civ, st2, "stability") + (adopted2(st2, "bureaucracy") ? -0.2 : 0) + 0.1 * p.autonomy + Math.min(0.09, 0.03 * tr.alliance) + (hered ? heir ? 0.06 : -0.04 : 0)),
      bureaucrats: clamp8(0.35 + 0.25 * (st2.treasury > 0 ? 1 : 0) + 0.3 * effective(ctx.civ, st2, "stability") + 0.2 * (adopted2(st2, "administration") ? 1 : 0) - 0.15 * (p.autonomy ?? 0)),
      artisans: clamp8(0.35 + 0.3 * Math.min(1, trade * 2) + 0.25 * (1 - p.tax * 2) + 0.2 * Math.min(1, perCap) - (war ? 0.08 : 0)),
      clans: clamp8(0.4 + 0.3 * (p.autonomy ?? 0) - 0.3 * (p.assimilation ?? 0) - 0.3 * p.tax + 0.1 * (war ? 1 : 0))
    };
    for (const id in st2.politics?.ideas ?? {}) {
      const s = st2.politics.ideas[id], d = IDEAS[id];
      if (!d) continue;
      for (const k in d.pro) if (k in t) t[k] = clamp8(t[k] + d.pro[k] * s);
      for (const k in d.con) if (k in t) t[k] = clamp8(t[k] + d.con[k] * s);
    }
    return t;
  }
  function stepPolitics(ctx) {
    var _a;
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % POLITICS_PERIOD !== 0) return;
    for (const st2 of Object.values(civ3.states)) {
      if (!st2.alive) continue;
      const P2 = st2.politics ?? (st2.politics = initPolitics(st2));
      P2.fatigue = clamp8(P2.fatigue + (st2.warIds.length ? 0.025 * st2.warIds.length : -0.02));
      const { keys } = factionKeys(ctx, st2), w = weightsOf(st2.polity, keys);
      for (const k of keys) (_a = P2.factions)[k] ?? (_a[k] = { support: 0.5 });
      for (const k of Object.keys(P2.factions)) if (!keys.includes(k)) delete P2.factions[k];
      const trade = Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0);
      stepIdeas(ctx, st2, w, trade);
      const tgt = supportTargets(ctx, st2);
      let leg = 0;
      for (const k of keys) {
        const f = P2.factions[k];
        f.support = clamp8(f.support + (tgt[k] - f.support) * 0.25);
        f.influence = Math.round(w[k] * 1e3) / 1e3;
        leg += f.influence * f.support;
      }
      P2.legitimacy = leg;
      const legE = effective(civ3, st2, "legitimacy");
      P2.assembly = ASSEMBLY[st2.polity] ?? (adopted2(st2, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null);
      P2.taxCeiling = Math.round((0.15 + 0.5 * legE) * 1e3) / 1e3;
      st2.stability = clamp8(st2.stability + (legE - 0.5) * 0.04);
      if (st2.policy.tax > P2.taxCeiling) st2.policy.tax = Math.round(P2.taxCeiling * 1e3) / 1e3;
      if (legE < 0.3 && mi - P2.lastRegimeChange > 120 && hashSeed(st2.id, mi) % 1e3 / 1e3 < 0.1 * (0.3 - legE) / 0.3 + 0.02) regimeChange(ctx, st2);
    }
  }
  function regimeChange(ctx, st2) {
    const { civ: civ3, ids } = ctx, P2 = st2.politics, mi = civ3.monthIndex, f = P2.factions, who = f.commoners.support <= f.military.support ? "commoners" : "military";
    const before = st2.polity, can2 = (pl) => pl === "tribal" || stateCan(civ3, st2, { chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" }[pl]);
    let to = st2.polity;
    if (who === "commoners" && (st2.polity === "kingdom" || st2.polity === "empire" || st2.polity === "chiefdom") && can2("republic")) to = "republic";
    else if (who === "military" && (st2.polity === "republic" || st2.polity === "theocracy")) to = can2("empire") && st2.pop > 2e4 ? "empire" : can2("kingdom") ? "kingdom" : st2.polity;
    const causes = [];
    const war = civ3.events.slice(-60).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended") && e.participants.some((p) => p.entityId === st2.id));
    if (war) causes.push({ targetId: war.id, relation: "caused_by", basis: "plausible" });
    st2.polity = to;
    P2.lastRegimeChange = mi;
    st2.stability = clamp8(st2.stability - 0.25);
    P2.fatigue = Math.max(0, P2.fatigue - 0.3);
    for (const k of Object.keys(f)) f[k].support = clamp8(f[k].support + 0.15);
    if (who === "commoners" && f.nobility) f.nobility.support = clamp8(f.nobility.support - 0.15);
    if (who === "military") f.military.support = clamp8(f.military.support + 0.1);
    const how = who === "commoners" ? before !== to ? "\u6C11\u8846\u306E\u8702\u8D77\u3067\u653F\u4F53\u304C\u5909\u308F\u3063\u305F" : "\u6C11\u8846\u306E\u8702\u8D77\u3067\u653F\u6A29\u304C\u5012\u308C\u305F" : before !== to ? "\u8ECD\u304C\u653F\u6A29\u3092\u63E1\u308A\u653F\u4F53\u304C\u5909\u308F\u3063\u305F" : "\u8ECD\u306B\u3088\u308B\u5BAE\u5EF7\u306E\u653F\u5909";
    const oldName = st2.name, rt = before !== to ? retitle(st2, to) : null;
    if (rt) {
      st2.name = rt.name;
      st2.nameBase = rt.base;
    }
    makeEvent(civ3, ids, { kind: "regime_change", title: `${oldName}\u3067\u653F\u5909\u304C\u8D77\u304D\u305F\uFF08${how}\uFF09${rt ? `\u3002\u56FD\u53F7\u306F${rt.name}\u3068\u6539\u307E\u3063\u305F` : ""}`, participants: [{ entityId: st2.id, role: "state" }], effects: [{ targetId: st2.id, property: "polity", before, after: to }, ...rt ? [{ targetId: st2.id, property: "name", before: oldName, after: rt.name }] : [], { targetId: st2.id, property: "stability", before: null, after: Math.round(st2.stability * 100) / 100 }], causes, facts: { stateId: st2.id, polity: to, name: st2.name, by: who }, provenance: "simulation" });
    st2.leader = { name: leaderName(st2, ctx.nameGen?.person(civ3, civ3.groups[st2.capitalGroupId], ctx.rng) ?? `${st2.name}\u306E\u65B0\u6307\u5C0E\u8005`, leaderRng(civ3, st2, "regime")), bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ3, { capitalGroupId: st2.capitalGroupId })), heir: false, deposed: true, origin: who };
  }

  // js/core/wcde/domains/military.js
  init_spatial();
  init_events();
  init_tech();

  // js/core/wcde/domains/doctrine.js
  init_world_consts();
  init_spatial();
  var FX_KEYS = Object.freeze(["off", "def", "logi", "attr", "naval", "siege", "adapt", "coh", "landing"]);
  var CAP = Object.freeze({ off: 0.25, def: 0.4, logi: 0.3, attr: 0.25, naval: 0.35, siege: 0.3, adapt: 0.2, coh: 0.25, landing: 0.25 });
  var BRANCH_SHARE = 0.6;
  var FX_JA = Object.freeze({ off: "\u653B\u6483", def: "\u9632\u5FA1", logi: "\u88DC\u7D66", attr: "\u640D\u8017\u8EFD\u6E1B", naval: "\u6D77\u8ECD\u904B\u7528", siege: "\u653B\u57CE", adapt: "\u6226\u5834\u9069\u5FDC", coh: "\u58EB\u6C17\u306E\u7D50\u675F", landing: "\u4E0A\u9678" });
  var N = (id, ja, branch, tier, prereq, tech, cost, fx3) => ({ id, ja, branch, tier, prereq, tech, cost, fx: fx3, special: false });
  var COMMON_BRANCHES = Object.freeze([
    { id: "infantry", ja: "\u9678\u6226" },
    { id: "mobility", ja: "\u6A5F\u52D5" },
    { id: "defense", ja: "\u9632\u885B\u30FB\u7BC9\u57CE" },
    { id: "logistics", ja: "\u5175\u7AD9\u30FB\u7D44\u7E54" },
    { id: "sea", ja: "\u6D77\u6D0B" }
  ]);
  var COMMON_NODES = Object.freeze([
    N("levy_drill", "\u5FB4\u96C6\u5175\u306E\u8A13\u7DF4", "infantry", 1, [], [], 20, { off: 0.03, def: 0.02 }),
    N("spear_phalanx", "\u5BC6\u96C6\u69CD\u9663", "infantry", 2, ["levy_drill"], ["bronze_weapons"], 55, { off: 0.04, def: 0.05 }),
    N("heavy_infantry", "\u91CD\u88C5\u6B69\u5175", "infantry", 3, ["spear_phalanx"], ["iron_weapons"], 110, { off: 0.06, def: 0.04, coh: 0.04 }),
    N("gun_line", "\u7DDA\u5F62\u6226\u5217", "infantry", 4, ["heavy_infantry"], ["gunpowder"], 300, { off: 0.09, def: 0.03, coh: 0.03 }),
    N("open_order", "\u6563\u958B\u6226\u8853", "infantry", 5, ["gun_line"], ["rifled_arms"], 520, { off: 0.08, def: 0.05, attr: 0.04 }),
    N("scout_screen", "\u65A5\u5019\u7DB2", "mobility", 1, [], [], 20, { adapt: 0.03, logi: 0.02 }),
    N("mounted_charge", "\u9A0E\u5175\u7A81\u6483", "mobility", 2, ["scout_screen"], ["horse_riding"], 70, { off: 0.07, adapt: 0.02 }),
    N("horse_archery", "\u9A0E\u5C04", "mobility", 3, ["mounted_charge"], ["horse_riding", "bow"], 100, { off: 0.06, adapt: 0.04 }),
    N("combined_arms", "\u8AF8\u5175\u79D1\u9023\u5408", "mobility", 4, ["horse_archery", "heavy_infantry"], ["cavalry"], 180, { off: 0.07, def: 0.03, coh: 0.03 }),
    N("mobile_warfare", "\u6A5F\u52D5\u6226", "mobility", 5, ["combined_arms"], ["mechanized_warfare"], 600, { off: 0.1, adapt: 0.06, logi: 0.05 }),
    N("shield_wall", "\u76FE\u306E\u58C1", "defense", 1, [], [], 25, { def: 0.06 }),
    N("fortified_camp", "\u91CE\u55B6\u7BC9\u57CE", "defense", 2, ["shield_wall"], ["fortification"], 60, { def: 0.08, attr: 0.02 }),
    N("siege_craft", "\u653B\u57CE\u8853", "defense", 3, ["fortified_camp"], ["siege_engines"], 120, { off: 0.04, siege: 0.12 }),
    N("bastion_forts", "\u7A1C\u5821\u5F0F\u7BC9\u57CE", "defense", 4, ["siege_craft"], ["gunpowder"], 320, { def: 0.1, siege: 0.1 }),
    N("depth_defense", "\u7E26\u6DF1\u9632\u5FA1", "defense", 5, ["bastion_forts"], ["artillery"], 560, { def: 0.1, attr: 0.04, coh: 0.03 }),
    N("supply_train", "\u88DC\u7D66\u7DDA\u306E\u6574\u5099", "logistics", 1, [], [], 25, { logi: 0.05 }),
    N("standing_army", "\u5E38\u5099\u8ECD", "logistics", 2, ["supply_train"], ["administration"], 200, { off: 0.06, def: 0.04, logi: 0.03 }),
    N("officer_corps", "\u5C06\u6821\u56E3", "logistics", 3, ["standing_army"], ["writing"], 220, { off: 0.05, def: 0.03, coh: 0.05 }),
    N("general_staff", "\u53C2\u8B00\u7D44\u7E54", "logistics", 4, ["officer_corps"], ["mathematics"], 350, { off: 0.06, def: 0.04, coh: 0.04 }),
    N("rear_services", "\u5F8C\u65B9\u652F\u63F4", "logistics", 5, ["general_staff"], ["military_logistics"], 420, { logi: 0.12, attr: 0.08 }),
    N("river_craft", "\u821F\u904B\u3068\u6E21\u6CB3", "sea", 1, [], ["seafaring"], 30, { naval: 0.05, logi: 0.02 }),
    N("naval_marines", "\u6D77\u5175", "sea", 2, ["river_craft"], ["shipbuilding"], 110, { off: 0.04, naval: 0.08, landing: 0.06 }),
    N("coast_defense", "\u6CBF\u5CB8\u9632\u885B", "sea", 3, ["naval_marines"], ["shipbuilding"], 100, { def: 0.06, naval: 0.05 }),
    N("fleet_doctrine", "\u8266\u968A\u904B\u7528", "sea", 4, ["coast_defense"], ["naval_warfare"], 240, { off: 0.03, naval: 0.15 }),
    N("blue_water", "\u5916\u6D0B\u9060\u5F81", "sea", 5, ["fleet_doctrine"], ["navigation"], 380, { naval: 0.1, logi: 0.05, landing: 0.12 })
  ]);
  var COMMON_BY_ID = Object.freeze(Object.fromEntries(COMMON_NODES.map((d) => [d.id, d])));
  var S = (id, ja, score, tiers) => ({ id, ja, score, tiers });
  var T = (ja, tier, tech, cost, fx3) => ({ ja, tier, tech, cost, fx: fx3 });
  var sat2 = (x, k = 1) => Math.max(0, Math.min(1, x / k));
  var SPECIAL_TEMPLATES = Object.freeze([
    S("steppe_riders", "\u8349\u539F\u306E\u9A0E\u5C04", (i) => 0.9 * i.pastoral + 0.5 * i.steppe, [T("\u9A0E\u99AC\u306E\u6C0F\u65CF\u8ECD", 1, [], 30, { off: 0.04, adapt: 0.03 }), T("\u79FB\u52D5\u3059\u308B\u672C\u55B6", 2, ["horse_riding"], 70, { logi: 0.07, adapt: 0.04 }), T("\u5305\u56F2\u3068\u507D\u88C5\u9000\u5374", 3, ["horse_riding"], 130, { off: 0.07, attr: 0.04 })]),
    S("mountain_war", "\u5C71\u5CB3\u6226", (i) => 1.1 * i.mountain, [T("\u5CE0\u306E\u5B88\u308A", 1, [], 30, { def: 0.06 }), T("\u5C71\u306E\u9698\u8DEF", 2, [], 70, { def: 0.05, adapt: 0.05 }), T("\u5C71\u306E\u904A\u6483", 3, ["bow"], 120, { off: 0.04, attr: 0.06, adapt: 0.04 })]),
    S("river_war", "\u6CB3\u5DDD\u30FB\u6E7F\u5730\u6226", (i) => 1 * i.river + 0.3 * i.wet, [T("\u6E21\u6CB3\u306E\u5099\u3048", 1, [], 30, { adapt: 0.04, def: 0.02 }), T("\u6CB3\u5DDD\u306E\u821F\u5175", 2, ["seafaring"], 70, { naval: 0.06, logi: 0.04 }), T("\u6C34\u9678\u306E\u6A5F\u52D5", 3, ["shipbuilding"], 120, { off: 0.04, landing: 0.06, adapt: 0.03 })]),
    S("warband", "\u6226\u58EB\u56E3\u306E\u7D46", (i) => (i.polity === "tribal" ? 0.7 : i.polity === "chiefdom" ? 0.55 : 0) + 0.3 * i.inf.military, [T("\u8972\u6483\u306E\u4F5C\u6CD5", 1, [], 25, { off: 0.05 }), T("\u6226\u58EB\u56E3\u306E\u8A93\u3044", 2, [], 50, { off: 0.04, coh: 0.05 }), T("\u9996\u9577\u306E\u89AA\u885B", 3, ["bronze_weapons"], 100, { def: 0.05, coh: 0.06 })]),
    S("feudal_knights", "\u5C01\u5EFA\u306E\u8ECD\u5F79", (i) => (i.polity === "kingdom" ? 0.6 : 0) + 0.8 * i.inf.nobility, [T("\u9818\u4E3B\u306E\u8ECD\u5F79", 1, [], 50, { off: 0.04, def: 0.03 }), T("\u9A0E\u58EB\u56E3", 2, ["horse_riding"], 120, { off: 0.08, coh: 0.03 }), T("\u57CE\u585E\u3068\u5C01\u571F", 3, ["fortification"], 150, { def: 0.08, attr: 0.03 })]),
    S("temple_host", "\u8056\u6226\u3068\u795E\u6BBF", (i) => (i.polity === "theocracy" ? 0.8 : 0) + 0.9 * i.inf.clergy, [T("\u8056\u6226\u306E\u6559\u3048", 1, [], 60, { off: 0.06, coh: 0.04 }), T("\u795E\u6BBF\u5B88\u8B77", 2, ["construction"], 90, { def: 0.07, coh: 0.04 }), T("\u6B89\u6559\u306E\u899A\u609F", 3, [], 130, { attr: 0.07, coh: 0.06 })]),
    S("citizen_army", "\u5E02\u6C11\u306E\u8ECD", (i) => (i.polity === "republic" ? 0.7 : 0) + 0.7 * i.inf.commoners, [T("\u5E02\u6C11\u7686\u5175", 1, [], 55, { def: 0.06, coh: 0.03 }), T("\u5E02\u6C11\u306E\u6226\u5217", 2, ["iron_weapons"], 110, { off: 0.04, def: 0.05, coh: 0.04 }), T("\u5FD7\u9858\u306E\u5C06\u6821", 3, ["writing"], 160, { off: 0.05, coh: 0.06 })]),
    S("imperial_legions", "\u8ECD\u56E3\u3068\u5B98\u50DA", (i) => (i.polity === "empire" ? 0.8 : 0) + (i.admin ? 0.4 : 0) + 0.3 * i.inf.military, [T("\u8ECD\u56E3\u5236", 1, ["iron_weapons"], 130, { off: 0.06, def: 0.04 }), T("\u8857\u9053\u3068\u99D0\u5C6F", 2, ["construction"], 150, { logi: 0.1, def: 0.03 }), T("\u5B98\u50DA\u306E\u5175\u7AD9", 3, ["administration"], 220, { logi: 0.08, attr: 0.05 })]),
    S("maritime_league", "\u6D77\u4E0A\u306E\u8B77\u308A", (i) => 0.9 * i.coast + 0.6 * i.inf.merchants + 0.4 * sat2(i.trade, 1), [T("\u6CBF\u5CB8\u306E\u8B77\u885B\u8239", 1, ["seafaring"], 50, { naval: 0.06 }), T("\u5546\u8239\u306E\u6B66\u88C5", 2, ["shipbuilding"], 110, { naval: 0.08, logi: 0.04 }), T("\u901A\u5546\u8DEF\u306E\u5236\u6D77", 3, ["naval_warfare"], 200, { naval: 0.1, landing: 0.05 })]),
    S("fortress_towns", "\u57CE\u5E02\u306E\u5B88\u308A", (i) => 0.9 * i.city + 0.5 * sat2(i.expDef, 6), [T("\u57CE\u9580\u3068\u5E02\u58C1", 1, [], 40, { def: 0.06 }), T("\u5E02\u6C11\u306E\u5B88\u5099\u968A", 2, ["fortification"], 100, { def: 0.07, coh: 0.04 }), T("\u7C60\u57CE\u306E\u5099\u84C4", 3, ["fortification"], 150, { attr: 0.07, def: 0.05 })]),
    S("expedition", "\u9060\u5F81\u306E\u8ECD", (i) => 0.8 * sat2(i.expOff, 8) + (i.polity === "empire" || i.polity === "kingdom" ? 0.25 : 0), [T("\u9060\u5F81\u306E\u968A\u5217", 1, [], 60, { logi: 0.05, off: 0.03 }), T("\u73FE\u5730\u8ABF\u9054", 2, [], 110, { logi: 0.08, attr: 0.03 }), T("\u96FB\u6483\u306E\u9032\u8ECD", 3, ["military_logistics"], 200, { off: 0.07, adapt: 0.05 })]),
    S("irregular_war", "\u7FA9\u52C7\u3068\u904A\u6483", (i) => 0.7 * sat2(i.expLost, 6) + 0.4 * (1 - i.stability), [T("\u5728\u5730\u306E\u7FA9\u52C7", 1, [], 25, { def: 0.04, adapt: 0.04 }), T("\u904A\u6483\u3068\u64B9\u4E71", 2, [], 60, { attr: 0.05, adapt: 0.05 }), T("\u4F4F\u6C11\u306E\u652F\u3048", 3, [], 100, { coh: 0.07, def: 0.04 })]),
    // 下の 2 つは、どの条件にも当てはまらない国家の受け皿
    S("levy_tradition", "\u6C11\u5175\u306E\u4F1D\u7D71", () => 0.1, [T("\u6751\u306E\u6C11\u5175", 1, [], 20, { def: 0.04 }), T("\u5B63\u7BC0\u306E\u52D5\u54E1", 2, [], 50, { logi: 0.04, off: 0.03 }), T("\u5728\u90F7\u306E\u5C06", 3, [], 90, { coh: 0.05, off: 0.03 })]),
    S("border_guard", "\u8FBA\u5883\u306E\u5B88\u308A", () => 0.09, [T("\u70FD\u706B\u3068\u7826", 1, [], 25, { def: 0.04, adapt: 0.02 }), T("\u8FBA\u5883\u306E\u5C6F\u7530", 2, [], 60, { logi: 0.05 }), T("\u56FD\u5883\u306E\u6A5F\u52D5", 3, [], 100, { adapt: 0.05, off: 0.03 })])
  ]);
  var TPL = Object.freeze(Object.fromEntries(SPECIAL_TEMPLATES.map((t) => [t.id, t])));
  function doctrineInfo(ctx, st2) {
    const { world, civ: civ3 } = ctx, ce = world.cell, gs = byState(ctx).get(st2.id) ?? [], P2 = st2.politics, inf = { nobility: 0, clergy: 0, merchants: 0, military: 0, commoners: 0 };
    if (P2) for (const k of Object.keys(inf)) inf[k] = P2.factions[k]?.influence ?? 0;
    let tot = 0, past = 0, mtn = 0, riv = 0, coast = 0, steppe = 0, wet = 0, city = 0;
    for (const g of gs) {
      tot += g.pop;
      const c = g.cell;
      if (g.subsistence === "pastoral") past += g.pop;
      if ((ce.mountain?.[c] ?? 0) > 0 || ce.biome[c] === BIOMES2.ALPINE) mtn += g.pop;
      if (ce.river[c]) riv += g.pop;
      if (ce.coastDist[c] <= 1) coast += g.pop;
      const b = ce.biome[c];
      if (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT) steppe += g.pop;
      if (b === BIOMES2.WETLAND) wet += g.pop;
      const s = g.settlementId ? civ3.settlements[g.settlementId]?.stage : null;
      if (s === "town" || s === "city") city += g.pop;
    }
    const f = (x2) => tot ? x2 / tot : 0, x = st2.military?.exp ?? {};
    return { polity: st2.polity, inf, pastoral: f(past), mountain: f(mtn), river: f(riv), coast: f(coast), steppe: f(steppe), wet: f(wet), city: f(city), trade: Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0), admin: st2.techAdopted?.administration != null, stability: st2.stability, expOff: (x.won ?? 0) + (x.sieges ?? 0), expDef: x.defended ?? 0, expLost: x.lost ?? 0 };
  }
  function chooseSpecial(info, prev = []) {
    const keep = new Set(prev.map((b) => b.key)), list = SPECIAL_TEMPLATES.map((t) => ({ t, s: t.score(info) + (keep.has(t.id) ? 0.12 : 0) })).sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1)).slice(0, 3);
    return list.map(({ t }, bi) => ({ key: t.id, ja: t.ja, lane: bi, nodes: t.tiers.map((x) => ({ id: `sp:${t.id}:${x.tier}`, ja: x.ja, branch: `sp:${t.id}`, tier: x.tier, prereq: x.tier > 1 ? [`sp:${t.id}:${x.tier - 1}`] : [], tech: x.tech, cost: x.cost, fx: x.fx, special: true })) }));
  }
  var nodesOf = (st2) => [...COMMON_NODES, ...(st2.military?.special ?? []).flatMap((b) => b.nodes)];
  var nodeOf = (st2, id) => COMMON_BY_ID[id] ?? (st2.military?.special ?? []).flatMap((b) => b.nodes).find((n2) => n2.id === id) ?? null;
  var branchesOf = (st2) => [...COMMON_BRANCHES.map((b) => ({ ...b, special: false })), ...(st2.military?.special ?? []).map((b) => ({ id: `sp:${b.key}`, ja: b.ja, special: true }))];
  function activeNodes(st2) {
    const taken = st2.military?.doctrine?.taken ?? {}, sp = new Set((st2.military?.special ?? []).map((b) => `sp:${b.key}`)), out = [];
    for (const id in taken) {
      const n2 = nodeOf(st2, id);
      if (n2 && (!n2.special || sp.has(n2.branch))) out.push(n2);
    }
    return out;
  }
  function doctrineFx(st2) {
    const by = /* @__PURE__ */ new Map();
    for (const n2 of activeNodes(st2)) {
      const m = by.get(n2.branch) ?? by.set(n2.branch, {}).get(n2.branch);
      for (const k in n2.fx) m[k] = (m[k] ?? 0) + n2.fx[k];
    }
    const out = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
    for (const m of by.values()) for (const k in m) out[k] += Math.min(m[k], CAP[k] * BRANCH_SHARE);
    for (const k of FX_KEYS) out[k] = Math.round(Math.min(out[k], CAP[k]) * 1e3) / 1e3;
    return out;
  }

  // js/core/wcde/domains/military.js
  var clamp9 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var has = (st2, k) => st2.techAdopted?.[k] != null;
  var can = (ctx, st2, cap) => stateCan(ctx.civ, st2, cap);
  var UNIT_KINDS = Object.freeze({
    infantry: { ja: "\u6B69\u5175", need: () => true },
    ranged: { ja: "\u5F13\u30FB\u6295\u5C04\u5175", need: (st2, ctx) => can(ctx, st2, "unit:ranged") },
    cavalry: { ja: "\u9A0E\u5175", need: (st2, ctx) => can(ctx, st2, "unit:cavalry") },
    navy: { ja: "\u6C34\u8ECD", need: (st2, ctx) => can(ctx, st2, "unit:navy") && coastal(ctx, st2) },
    garrison: { ja: "\u5B88\u5099\u5175", need: (st2, ctx) => can(ctx, st2, "unit:garrison") },
    firearms: { ja: "\u9283\u5175", need: (st2, ctx) => can(ctx, st2, "unit:firearms") }
  });
  var coastal = (ctx, st2) => (byState(ctx).get(st2.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);
  var shareOf = (ctx, st2) => {
    const gs = byState(ctx).get(st2.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, w = {};
    for (const [k, def] of Object.entries(UNIT_KINDS)) if (def.need(st2, ctx)) w[k] = k === "infantry" ? 1 : k === "ranged" ? 0.25 : k === "cavalry" ? 0.2 + 0.5 * pastoral : k === "navy" ? 0.15 : k === "garrison" ? 0.1 : 0.4;
    if (w.firearms) {
      delete w.ranged;
    }
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) w[k] /= tot;
    return w;
  };
  var OFF_CAP = CAP.off;
  var DEF_CAP = CAP.def;
  var initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, shares: null, special: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, 0])), exp: { won: 0, lost: 0, defended: 0, sieges: 0, sea: 0, wars: 0 } });
  function canAdopt(st2, id) {
    const d = nodeOf(st2, id);
    if (!d) return { ok: false, reason: "\u305D\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u306F\u3042\u308A\u307E\u305B\u3093" };
    const M = st2.military;
    if (M?.doctrine.taken[id] != null) return { ok: false, reason: "\u3059\u3067\u306B\u53D6\u5F97\u6E08\u307F" };
    if (d.special && !(M?.special ?? []).some((b) => `sp:${b.key}` === d.branch)) return { ok: false, reason: `${d.ja}\u306F\u3001\u4ECA\u306E\u3053\u306E\u56FD\u306E\u56FA\u6709\u306E\u7CFB\u7D71\u3067\u306F\u306A\u3044` };
    for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `\u524D\u63D0\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u300C${nodeOf(st2, p)?.ja ?? p}\u300D\u304C\u672A\u53D6\u5F97` };
    for (const t of d.tech) if (!has(st2, t)) return { ok: false, reason: `\u6280\u8853\u300C${t}\u300D\u304C\u5FC5\u8981` };
    if (st2.treasury < d.cost) return { ok: false, reason: `\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044\uFF08${d.cost}\uFF09` };
    return { ok: true };
  }
  function adoptDoctrine(ctx, st2, id, { provenance = "simulation", decisionId = null } = {}) {
    const c = canAdopt(st2, id);
    if (!c.ok) return c;
    const { civ: civ3, ids } = ctx, d = nodeOf(st2, id);
    const M = st2.military ?? (st2.military = initMilitary());
    st2.treasury -= d.cost;
    M.doctrine.taken[id] = civ3.monthIndex;
    const ev = makeEvent(civ3, ids, { kind: "doctrine_adopted", title: `${st2.name}\u304C\u300C${d.ja}\u300D\u3092\u53D6\u308A\u5165\u308C\u305F`, participants: [{ entityId: st2.id, role: "state" }], effects: [{ targetId: st2.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId });
    recompute(ctx, st2);
    return { ok: true, eventId: ev?.eventId ?? null };
  }
  function refreshSpecial(ctx, st2) {
    const M = st2.military, next = chooseSpecial(doctrineInfo(ctx, st2), M.special);
    const same = M.special.length === 3 && next.every((b, i) => M.special.some((o) => o.key === b.key));
    if (!same) M.special = next;
  }
  function recompute(ctx, st2) {
    const M = st2.military, ind = effective(ctx.civ, st2, "perCapita"), wTech = (has(st2, "bronze_weapons") ? 0.08 : 0) + (has(st2, "iron_weapons") ? 0.12 : 0) + (has(st2, "steel") ? 0.05 : 0) + (has(st2, "gunpowder") ? 0.1 : 0);
    M.equipLevel = clamp9(0.15 + 0.35 * clamp9(ind / 1.6) + wTech + (st2.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st2.econ?.investment ?? 0), 0, 1);
    M.readiness = clamp9(0.5 * effective(ctx.civ, st2, "stability") + 0.3 * (st2.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st2.politics ? effective(ctx.civ, st2, "fatigue") : 0)), 0, 1);
    const fx3 = doctrineFx(st2), off = fx3.off, def = fx3.def;
    M.fx = fx3;
    const eqE = effective(ctx.civ, st2, "equipLevel"), rdE = effective(ctx.civ, st2, "readiness");
    st2.milBonus = Math.round(clamp9(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off, -0.6, 0.6) * 1e3) / 1e3;
    st2.milDef = Math.round(def * 1e3) / 1e3;
  }
  function stepMilitary(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % 3 !== 0) return;
    for (const st2 of Object.values(civ3.states)) {
      if (!st2.alive) continue;
      const M = st2.military ?? (st2.military = initMilitary());
      if (!M.special?.length || mi % 12 === 0) refreshSpecial(ctx, st2);
      recompute(ctx, st2);
      const shares = M.shares && Object.keys(M.shares).every((k) => UNIT_KINDS[k]?.need(st2, ctx)) ? M.shares : shareOf(ctx, st2);
      if (M.shares && shares !== M.shares) M.shares = null;
      const old = new Map(M.units.map((u) => [u.kind, u])), next = [];
      for (const [k, sh] of Object.entries(shares)) {
        const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: `${st2.name}\u306E${UNIT_KINDS[k].ja}`, since: mi };
        u.size = Math.round(st2.army * sh * 10) / 10;
        u.equip = Math.round(clamp9(effective(ctx.civ, st2, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : 0)) * 100) / 100;
        u.readiness = Math.round(effective(ctx.civ, st2, "readiness") * 100) / 100;
        next.push(u);
      }
      M.units = next;
      M.armyBasis = st2.army;
    }
  }
  function reorganize(ctx, st2, shares) {
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "\u914D\u5206\u306E\u5408\u8A08\u306F 1" };
    for (const [k, v] of Object.entries(shares)) {
      if (!UNIT_KINDS[k]) return { ok: false, reason: `\u672A\u77E5\u306E\u90E8\u968A ${k}` };
      if (!(v >= 0)) return { ok: false, reason: "\u914D\u5206\u306F 0 \u4EE5\u4E0A" };
      if (v > 0 && !UNIT_KINDS[k].need(st2, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}\u306F\u4ECA\u306E\u6280\u8853\u30FB\u5730\u7406\u3067\u306F\u7DE8\u5236\u3067\u304D\u306A\u3044` };
    }
    const cost = Math.round(st2.army * 2e-3 * 10) / 10;
    if (st2.treasury < cost) return { ok: false, reason: `\u518D\u7DE8\u306E\u8CBB\u7528 ${cost} \u304C\u8DB3\u308A\u306A\u3044` };
    st2.treasury -= cost;
    (st2.military ?? (st2.military = initMilitary())).shares = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0));
    stepMilitaryNow(ctx, st2);
    return { ok: true, cost };
  }
  function stepMilitaryNow(ctx, st2) {
    const mi = ctx.civ.monthIndex;
    const prev = ctx.civ.monthIndex;
    ctx.civ.monthIndex = mi - mi % 3;
    const only = (s) => s;
    try {
      const states = ctx.civ.states;
      const keep = Object.values(states).filter((s) => s !== st2).map((s) => [s, s.alive]);
      for (const [s] of keep) s.alive = false;
      stepMilitary(ctx);
      for (const [s, a] of keep) s.alive = a;
    } finally {
      ctx.civ.monthIndex = prev;
    }
  }

  // js/core/wcde/domains/people.js
  init_civ_state();
  init_events();
  var AGE_MIN = 14 * 12;
  function createFigure(ctx, st2, { name, bornAt, houseId, parents = null, role = "leader", cause = null }) {
    const { civ: civ3, ids } = ctx, id = ids.next("person"), f = { id, name, bornAt, diedAt: null, role, stateId: st2.id, houseId, parents, children: [], speciesId: civ3.groups[st2.capitalGroupId]?.speciesId ?? "human", history: [{ at: civ3.monthIndex, kind: "appeared", stateId: st2.id }] };
    (civ3.figures ?? (civ3.figures = {}))[id] = f;
    return f;
  }
  var newHouse = (ctx, st2, founder) => {
    const { civ: civ3, ids } = ctx;
    const id = ids.next("house");
    (civ3.houses ?? (civ3.houses = {}))[id] = { id, name: dynastyName(st2.polity, Object.values(civ3.houses).filter((x) => x.stateId === st2.id).length + 1, founder.name), foundedAt: civ3.monthIndex, stateId: st2.id, founderId: founder.id };
    return id;
  };
  function stepPeople(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde) return;
    civ3.figures ?? (civ3.figures = {});
    civ3.houses ?? (civ3.houses = {});
    compactFigures(ctx);
    for (const st2 of Object.values(civ3.states)) {
      if (!st2.alive) continue;
      const L = st2.leader;
      let cur = st2.leaderFigureId ? civ3.figures[st2.leaderFigureId] : null;
      const heirFig = st2.heirFigureId ? civ3.figures[st2.heirFigureId] : null;
      if (cur && L.renamedByCreator) {
        if (cur.name !== L.name) {
          cur.history.push({ at: mi, kind: "renamed_by_creator", from: cur.name });
          cur.name = L.name;
        }
        delete L.renamedByCreator;
      }
      if (cur && (cur.name !== L.name || cur.bornAt !== L.bornAt || L.deposed)) {
        const succeeded = heirFig && heirFig.diedAt == null && L.heirTaken !== false && !L.deposed && cur.diedAt == null;
        cur.diedAt = mi;
        cur.history.push({ at: mi, kind: L.deposed ? "deposed" : "left_office" });
        if (heirFig && heirFig.diedAt == null && !L.deposed) {
          heirFig.name = leaderName(st2, heirFig.name, leaderRng(civ3, st2, "enthrone"));
          L.name = heirFig.name;
          L.bornAt = heirFig.bornAt;
          cur = heirFig;
          st2.leaderFigureId = heirFig.id;
          cur.history.push({ at: mi, kind: "enthroned", stateId: st2.id });
          st2.heirFigureId = null;
          L.heir = false;
          makeEvent(civ3, ids, { kind: "succession_by_heir", title: `${st2.name}\u3067\u3001${cur.name}\u304C\u7236\u7956${civ3.figures[cur.parents?.[0]]?.name ?? ""}\u306E\u8DE1\u3092\u7D99\u3044\u3060`, participants: [{ entityId: st2.id, role: "state" }, { entityId: cur.id, role: "successor" }, ...cur.parents ? [{ entityId: cur.parents[0], role: "predecessor" }] : []], provenance: "simulation" });
          continue;
        }
        const old = cur;
        cur = null;
        L.deposed = false;
        const nf = createFigure(ctx, st2, { name: L.name, bornAt: L.bornAt, houseId: null });
        nf.houseId = newHouse(ctx, st2, nf);
        st2.leaderFigureId = nf.id;
        st2.heirFigureId = null;
        const ev = makeEvent(civ3, ids, { kind: "dynasty_changed", title: `${st2.name}\u3067${civ3.houses[nf.houseId]?.name ?? "\u65B0\u738B\u671D"}\u304C\u6210\u7ACB\u3057\u305F\uFF08${civ3.houses[old.houseId]?.name ?? "\u5148\u306E\u738B\u671D"}\u306E${old.name}\u304C\u9000\u3044\u305F\uFF09`, participants: [{ entityId: st2.id, role: "state" }, { entityId: old.id, role: "predecessor" }, { entityId: nf.id, role: "successor" }], effects: [{ targetId: st2.id, property: "leader.houseId", before: old.houseId, after: nf.houseId }], provenance: "simulation" });
        continue;
      }
      if (!cur) {
        const f = createFigure(ctx, st2, { name: L.name, bornAt: L.bornAt, houseId: null });
        f.houseId = newHouse(ctx, st2, f);
        st2.leaderFigureId = f.id;
        cur = f;
      }
      if (L.heir && !st2.heirFigureId && cur.diedAt == null) {
        const grp = civ3.groups[st2.capitalGroupId], lang = languageOfGroup(grp), r = ctx.rng, ageGap = Math.max(AGE_MIN, 20 * 12 + Math.floor(r() * 120)), born = Math.min(mi - 12, cur.bornAt + ageGap);
        const fresh = (lang && civ3.languages[lang] ? nameFor(civ3, r, lang, "person") : null) ?? `${baseOfLeader(L.name)}\u306E\u5B50`, kin = leaderRng(civ3, st2, "heirname"), anc = kin() < 0.35 ? baseOfLeader(L.name) : fresh;
        const child = createFigure(ctx, st2, { name: anc, bornAt: born, houseId: cur.houseId, parents: [cur.id], role: "heir" });
        cur.children.push(child.id);
        st2.heirFigureId = child.id;
        makeEvent(civ3, ids, { kind: "heir_named", title: `${st2.name}\u306E${cur.name}\u304C\u7D99\u627F\u8005${child.name}\u3092\u5B9A\u3081\u305F`, participants: [{ entityId: st2.id, role: "state" }, { entityId: cur.id, role: "parent" }, { entityId: child.id, role: "heir" }], provenance: "simulation" });
      }
    }
  }
  function stepCities(ctx) {
    const { civ: civ3 } = ctx;
    if (!civ3.options.wcde || civ3.monthIndex % 12 !== 0) return;
    for (const s of Object.values(civ3.settlements)) {
      if (s.name || s.stage === "village") continue;
      const g = civ3.groups[s.groupId];
      const lang = languageOfGroup(g);
      if (!lang) continue;
      s.name = nameFor(civ3, ctx.rng, lang, "place") ?? null;
    }
  }
  function compactFigures(ctx) {
    const { civ: civ3 } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % 12 !== 5) return;
    for (const f of Object.values(civ3.figures ?? {})) if (f.diedAt != null && mi - f.diedAt > 720 && f.history.length > 2 && !f.compacted) {
      f.history = [f.history[0], f.history[f.history.length - 1]];
      f.compacted = true;
    }
  }

  // js/core/wcde/domains/actions.js
  init_spatial();
  var r33 = (x) => Math.round(x * 1e3) / 1e3;
  var clamp10 = (v, a, b) => Math.max(a, Math.min(b, v));
  var cand2 = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad2 = (key, reason, o = {}) => cand2(key, {}, { ...o, eligible: false, reason });
  var eff2 = (list, st2, property, before, after) => {
    list.push({ targetId: st2.id, property, before, after });
  };
  var INVEST_COST = 30;
  var INVEST_GAIN = 0.06;
  var INVEST_CAP = 0.4;
  var done = false;
  function registerWcdeActions() {
    if (done) return;
    done = true;
    registerAction({
      key: "adopt_doctrine",
      domain: "military",
      label: "\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u53D6\u5F97",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde) return [];
        const out = [];
        const coastal2 = (byState(ctx).get(st2.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1), at2 = st2.warIds.length > 0, f = (d) => d.fx;
        for (const d of nodesOf(st2)) {
          const c = canAdopt(st2, d.id);
          if (!c.ok) continue;
          const x = f(d), sec = 0.15 + 2.2 * (x.def ?? 0) + 0.8 * (x.off ?? 0) + (at2 ? 0.2 : 0) + 1.2 * (x.attr ?? 0) + 0.8 * (x.coh ?? 0) + (coastal2 ? 1.5 * (x.naval ?? 0) : -0.5 * (x.naval ?? 0)) + 0.6 * (x.logi ?? 0);
          out.push(cand2("adopt_doctrine", { security: sec, expansion: 3 * (x.off ?? 0) + 1.2 * (x.siege ?? 0) + 0.8 * (x.landing ?? 0) - d.cost / 2e3 }, { opt: d.id, label: `${d.ja}\u3092\u53D6\u308A\u5165\u308C\u308B` }));
        }
        return out.sort((a, b) => b.factors.security + b.factors.expansion - (a.factors.security + a.factors.expansion) || (a.opt < b.opt ? -1 : 1)).slice(0, 3);
      },
      execute(ctx, st2, c) {
        const r = adoptDoctrine(ctx, st2, c.opt, { provenance: c.provenance ?? "ai", decisionId: c.decisionId ?? null });
        return r.ok ? { ok: true, silent: true, effects: [] } : { ok: false, error: r.reason };
      }
    });
    registerAction({
      key: "invest_industry",
      domain: "economy",
      label: "\u7523\u696D\u3078\u306E\u6295\u8CC7",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde || !st2.econ) return [];
        const inv = st2.econ.investment ?? 0;
        if (st2.treasury < INVEST_COST * 2) return [bad2("invest_industry", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        if (inv >= INVEST_CAP) return [bad2("invest_industry", "\u6295\u8CC7\u306E\u52B9\u679C\u304C\u4E0A\u9650")];
        return [cand2("invest_industry", { prosperity: 0.35 + 0.5 * (1 - clamp10(st2.econ.perCapita / 1.5, 0, 1)), tech: 0.1 }, { label: "\u7523\u696D\u3078\u6295\u8CC7\u3059\u308B" })];
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.econ.investment ?? 0, a = r33(Math.min(INVEST_CAP, b + INVEST_GAIN));
        if (st2.treasury < INVEST_COST) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.treasury -= INVEST_COST;
        st2.econ.investment = a;
        eff2(ef, st2, "econ.investment", b, a);
        return { ok: true, effects: ef, title: "\u7523\u696D\u3078\u306E\u6295\u8CC7" };
      }
    });
    registerAction({
      key: "appease_faction",
      domain: "politics",
      label: "\u652F\u6301\u52E2\u529B\u3078\u306E\u914D\u616E",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde || !st2.politics) return [];
        const P2 = st2.politics, out = [];
        for (const [k, f] of Object.entries(P2.factions)) {
          const weak = (f.influence ?? 0) * (0.6 - f.support);
          if (weak > 0.02) out.push(cand2("appease_faction", { stability: 0.5 + 4 * weak + (P2.legitimacy < 0.4 ? 0.3 : 0) }, { opt: k, label: `${FACTIONS[k]}\u306B\u914D\u616E\u3059\u308B` }));
        }
        return out.sort((a, b) => b.factors.stability - a.factors.stability || (a.opt < b.opt ? -1 : 1)).slice(0, 2);
      },
      execute(ctx, st2, c) {
        const f = st2.politics?.factions[c.opt];
        if (!f) return { ok: false, error: "\u305D\u306E\u52E2\u529B\u306F\u306A\u3044" };
        const cost = 15;
        if (st2.treasury < cost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.treasury -= cost;
        const b = f.support, a = r33(clamp10(b + 0.15, 0, 1));
        f.support = a;
        recomputeLegitimacy(st2.politics);
        const ef = [];
        eff2(ef, st2, `politics.${c.opt}.support`, r33(b), a);
        return { ok: true, effects: ef, title: `${FACTIONS[c.opt]}\u3078\u306E\u914D\u616E` };
      }
    });
  }

  // js/core/wcde/integrity.js
  init_archive();

  // js/core/wcde/warfare.js
  init_events();
  init_spatial();
  init_civ_state();
  init_tech();
  init_world_consts();

  // js/core/wcde/power.js
  init_tech();
  var clamp11 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var navyShare = (st2) => {
    const u = (st2.military?.units ?? []).find((x) => x.kind === "navy");
    return u && st2.army > 0 ? clamp11(u.size / Math.max(1, st2.army)) : 0;
  };
  var landShare = (st2) => 1 - navyShare(st2);
  var fx = (st2) => st2.military?.fx ?? {};
  function landPower(civ3, st2, size = null, { defending = false } = {}) {
    const n2 = size ?? st2.army * landShare(st2);
    const attack = milMult(st2, civ3) * (0.85 + 0.3 * effective(civ3, st2, "readiness"));
    const guard = defending ? 1 + ((st2.defense ?? 0) + (st2.milDef ?? 0)) * 0.5 : 1;
    return n2 * attack * guard;
  }
  function navalPower(civ3, st2, size = null) {
    const n2 = size ?? st2.army * navyShare(st2);
    if (!(n2 > 0)) return 0;
    const tech = stateCan(civ3, st2, "war:naval") ? 1.3 : stateCan(civ3, st2, "unit:navy") ? 1 : 0.4;
    return n2 * milMult(st2, civ3) * (1 + 1.2 * (fx(st2).naval ?? 0)) * tech * (0.85 + 0.3 * effective(civ3, st2, "readiness"));
  }
  var supplyRange = (civ3, st2) => 650 * (1 + 2.2 * (fx(st2).logi ?? 0)) * (stateCan(civ3, st2, "war:far") ? 1.7 : 1) * (st2.polity === "empire" ? 1.15 : 1);
  var supplyAt = (civ3, st2, distKm2) => clamp11(1 - Math.max(0, distKm2 - supplyRange(civ3, st2)) / (supplyRange(civ3, st2) * 1.2));
  var totalPower = (civ3, st2) => landPower(civ3, st2) * 1 + navalPower(civ3, st2) * 0.35;

  // js/core/wcde/warfare.js
  var clamp12 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r34 = (x) => Math.round(x * 1e3) / 1e3;
  var POSTURES = Object.freeze({ offensive: "\u653B\u52E2", balanced: "\u5747\u8861", defensive: "\u5B88\u52E2" });
  var CAMPAIGN_KINDS = Object.freeze({ offensive: "\u9032\u653B", siege: "\u5305\u56F2", defense: "\u9632\u885B", naval_control: "\u5236\u6D77", blockade: "\u5C01\u9396", landing: "\u4E0A\u9678" });
  var initOps = () => ({ v: 1, theaters: {}, forces: {}, campaigns: {}, battles: [], stats: { battles: 0, big: 0, sieges: 0, naval: 0, landings: 0, dead: {}, won: {} }, direction: {}, occ: {}, occBy: {}, names: {}, seq: 0, broken: { a: 0, d: 0 } });
  var evBudget = (ops, mi) => {
    if (ops._evMonth !== mi) {
      ops._evMonth = mi;
      ops._evN = 0;
    }
    return ++ops._evN <= 2;
  };
  var nid = (ops, p) => `${p}${++ops.seq}`;
  var U = (civ3, ...p) => hashSeed(civ3.historySeed, "war", ...p) / 4294967296;
  var sideOf = (w, id) => w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null;
  var other = (s) => s === "a" ? "d" : "a";
  var members = (civ3, w, side) => w.sides[side].map((i) => civ3.states[i]).filter((s) => s?.alive);
  function placeName(ctx, g) {
    const { civ: civ3 } = ctx, s = g?.settlementId ? civ3.settlements[g.settlementId] : null;
    if (s?.name) return s.name;
    const lang = languageOfGroup(g);
    if (!lang || !civ3.languages?.[lang]) return "\u540D\u3082\u306A\u304D\u5730";
    return nameFor(civ3, rngOf(hashSeed(civ3.historySeed, "place", g.id)), lang, "place") ?? "\u540D\u3082\u306A\u304D\u5730";
  }
  function siteFeatures(ctx, g) {
    const ce = ctx.world.cell, c = g.cell, b = ce.biome[c];
    return { river: !!ce.river[c], mountain: (ce.mountain?.[c] ?? 0) > 0 || b === BIOMES2.ALPINE, coast: ce.coastDist[c] <= 1, forest: b === BIOMES2.TEMPERATE_FOREST || b === BIOMES2.RAINFOREST || b === BIOMES2.TAIGA, wet: b === BIOMES2.WETLAND, dry: b === BIOMES2.HOT_DESERT || b === BIOMES2.COLD_DESERT, plain: b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA };
  }
  function battleName(ctx, w, kind, g) {
    const { civ: civ3 } = ctx, p = placeName(ctx, g), used = civ3.battleNames ?? (civ3.battleNames = {}), ds = siteDescriptors(siteFeatures(ctx, g));
    const cands = kind === "siege" ? [`${p}\u5305\u56F2\u6226`, `${p}\u653B\u57CE\u6226`, `${p}\u306E\u9665\u843D`] : kind === "naval" ? [`${p}\u6C96\u6D77\u6226`, `${p}\u6E7E\u306E\u6D77\u6226`, `${p}\u6D77\u5CE1\u306E\u6226\u3044`] : kind === "landing" ? [`${p}\u4E0A\u9678\u6226`, `${p}\u4E0A\u9678\u4F5C\u6226`] : [`${p}\u306E\u6226\u3044`, ...ds.map((d) => `${p}${d}\u306E\u6226\u3044`), `${p}\u4F1A\u6226`];
    const r = U(civ3, w.id, civ3.monthIndex, g.id, kind, "bn"), start2 = cands.length > 1 && r >= 0.6 ? 1 + Math.floor((r - 0.6) / 0.4 * (cands.length - 1)) : 0;
    for (let i = 0; i < cands.length; i++) {
      const nm = cands[(start2 + i) % cands.length];
      if (!used[nm]) {
        used[nm] = 1;
        return nm;
      }
    }
    const base = cands[0], n2 = used[base] = (used[base] ?? 1) + 1;
    return n2 <= 3 ? `\u7B2C${kanjiNum(n2)}\u6B21${base}` : `${civ3.date.year}\u5E74\u306E${base}`;
  }
  function fieldSite(ctx, w, camp, g) {
    const { civ: civ3 } = ctx, ops = w.ops, recent = ops.sites ?? (ops.sites = []), cs = [g, ...[...neighborGroups(ctx, g)].map((o) => civ3.groups[o]).filter(Boolean)].sort((x, y) => x.id < y.id ? -1 : 1);
    const fresh = cs.filter((x) => !recent.includes(x.cell)), pool = fresh.length ? fresh : cs, site = pool[Math.floor(U(civ3, w.id, civ3.monthIndex, camp.id, "site") * pool.length)];
    recent.push(site.cell);
    if (recent.length > 8) recent.shift();
    return site;
  }
  var terrainBonus = (world, cell) => {
    const ce = world.cell, b = ce.biome[cell];
    return ((ce.mountain?.[cell] ?? 0) > 0 || b === BIOMES2.ALPINE ? 0.25 : 0) + (ce.river[cell] ? 0.1 : 0) + (b === BIOMES2.WETLAND || b === BIOMES2.TEMPERATE_FOREST || b === BIOMES2.RAINFOREST ? 0.1 : 0);
  };
  var stageOf3 = (civ3, g) => g?.settlementId ? civ3.settlements[g.settlementId]?.stage ?? "village" : null;
  function initWar(ctx, w) {
    w.ops = initOps();
    syncForces(ctx, w);
    ensureTheaters(ctx, w);
    w.name ?? (w.name = warNameFor(ctx, w, () => {
      const g = ctx.civ.groups[ctx.civ.states[w.defender]?.capitalGroupId], p = g ? placeName(ctx, g) : null;
      return p && p !== "\u540D\u3082\u306A\u304D\u5730" ? p : null;
    }));
  }
  var capCell = (civ3, st2) => civ3.groups[st2.capitalGroupId]?.cell ?? null;
  var commitOf = (w, st2) => clamp12(w.ops.direction[st2.id]?.commit ?? 0.75, 0.3, 1);
  function syncForces(ctx, w) {
    const { civ: civ3 } = ctx, ops = w.ops, live2 = /* @__PURE__ */ new Set();
    for (const side of ["a", "d"]) for (const st2 of members(civ3, w, side)) {
      const c = commitOf(w, st2), ns = navyShare(st2);
      for (const kind of ["army", "fleet"]) {
        const size = kind === "army" ? st2.army * landShare(st2) * c : st2.army * ns * c;
        const key = `${st2.id}|${kind}`;
        let f = Object.values(ops.forces).find((x) => x.key === key);
        if (!(size > 0.5) || kind === "fleet" && ns < 0.02) {
          if (f) {
            if (f.campaignId) delete ops.campaigns[f.campaignId];
            delete ops.forces[f.id];
          }
          continue;
        }
        if (!f) {
          f = { id: nid(ops, "f"), key, stateId: st2.id, kind, side, size: 0, morale: 0.8, supply: 1, cell: capCell(civ3, st2), campaignId: null, lastBattle: -99 };
          ops.forces[f.id] = f;
        }
        f.size = Math.round(size * 10) / 10;
        f.side = side;
        live2.add(f.id);
      }
    }
    for (const id of Object.keys(ops.forces)) if (!live2.has(id)) {
      const f = ops.forces[id];
      if (f.campaignId) delete ops.campaigns[f.campaignId];
      delete ops.forces[id];
    }
  }
  var forcesOf = (w, side, kind = null) => Object.values(w.ops.forces).filter((f) => f.side === side && (!kind || f.kind === kind)).sort((a, b) => a.id < b.id ? -1 : 1);
  function ensureTheaters(ctx, w) {
    const { civ: civ3 } = ctx, ops = w.ops, groups = byState(ctx);
    for (const a of members(civ3, w, "a")) for (const d of members(civ3, w, "d")) {
      const key = `L|${a.id}|${d.id}`;
      if (Object.values(ops.theaters).some((t) => t.key === key)) continue;
      if (!neighborStates(ctx, a).includes(d.id)) continue;
      const cap = civ3.groups[a.capitalGroupId], gs = groups.get(d.id) ?? [], g = cap && gs.length ? gs.reduce((b, x) => !b || distKm(ctx.world, cap.cell, x.cell) < distKm(ctx.world, cap.cell, b.cell) ? x : b, null) : null;
      if (!g) continue;
      const id = nid(ops, "t");
      ops.theaters[id] = { id, key, kind: "land", a: a.id, d: d.id, cell: g.cell, name: `${placeName(ctx, g)}\u65B9\u9762`, control: 0 };
    }
    const wantSea = Object.values(ops.theaters).length === 0 || forcesOf(w, "a", "fleet").length && forcesOf(w, "d", "fleet").length;
    if (wantSea && !Object.values(ops.theaters).some((t) => t.kind === "sea")) {
      const A2 = members(civ3, w, "a")[0], D2 = members(civ3, w, "d")[0];
      const gs = D2 ? groups.get(D2.id) ?? [] : [];
      const g = gs.find((x) => ctx.world.cell.coastDist[x.cell] <= 1) ?? gs[0];
      if (A2 && D2 && g) {
        const id = nid(ops, "t");
        ops.theaters[id] = { id, key: `S|${A2.id}|${D2.id}`, kind: "sea", a: A2.id, d: D2.id, cell: g.cell, name: `${placeName(ctx, g)}\u6D77\u57DF`, control: 0 };
      }
    }
  }
  var seaTheater = (w) => Object.values(w.ops.theaters).find((t) => t.kind === "sea") ?? null;
  var landTheaterFor = (w, a, d) => Object.values(w.ops.theaters).find((t) => t.kind === "land" && (t.a === a && t.d === d || t.a === d && t.d === a)) ?? null;
  function canReach(ctx, a, b) {
    if (neighborStates(ctx, a).includes(b.id)) return true;
    const { civ: civ3, world } = ctx;
    if (!stateCan(civ3, a, "unit:navy") || !stateCan(civ3, a, "war:naval") || navyShare(a) < 0.02) return false;
    const cs = (st2) => (byState(ctx).get(st2.id) ?? []).some((g) => world.cell.coastDist[g.cell] <= 1);
    if (!cs(a) || !cs(b)) return false;
    const ca = civ3.groups[a.capitalGroupId], cb = civ3.groups[b.capitalGroupId];
    return !!(ca && cb && distKm(world, ca.cell, cb.cell) <= 4500);
  }
  function seaTargets(ctx, st2) {
    const { civ: civ3, world } = ctx;
    if (!stateCan(civ3, st2, "war:naval") || navyShare(st2) < 0.02) return [];
    const land = new Set(neighborStates(ctx, st2)), ca = civ3.groups[st2.capitalGroupId];
    if (!ca) return [];
    return Object.values(civ3.states).filter((s) => s.alive && s.id !== st2.id && !land.has(s.id) && canReach(ctx, st2, s)).sort((x, y) => distKm(world, ca.cell, civ3.groups[x.capitalGroupId].cell) - distKm(world, ca.cell, civ3.groups[y.capitalGroupId].cell) || (x.id < y.id ? -1 : 1)).slice(0, 3);
  }
  function postureOf(ctx, w, st2) {
    const d = w.ops.direction[st2.id];
    if (d?.posture) return d.posture;
    const { civ: civ3 } = ctx, side = sideOf(w, st2.id), mine = side === "a" ? w.score : -w.score;
    const my = members(civ3, w, side).reduce((s, x) => s + landPower(civ3, x) + 0.35 * navalPower(civ3, x), 0), en = members(civ3, w, other(side)).reduce((s, x) => s + landPower(civ3, x) + 0.35 * navalPower(civ3, x), 0), ratio = (my + 1) / (en + 1);
    const fat = effective(civ3, st2, "fatigue");
    return ratio >= 1.15 && mine > -30 && fat < 0.7 ? "offensive" : ratio < 0.8 || mine < -40 ? "defensive" : "balanced";
  }
  function directWar(ctx, st2, w, { posture = null, commit = null, focus = null }) {
    var _a, _b;
    if (!w?.ops || w.status !== "active") return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
    if (sideOf(w, st2.id) == null) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306E\u53C2\u6226\u56FD\u3067\u306F\u306A\u3044" };
    if (posture != null && !POSTURES[posture]) return { ok: false, error: "\u65B9\u91DD\u306F offensive / balanced / defensive" };
    if (commit != null && !(commit >= 0.3 && commit <= 1)) return { ok: false, error: "\u6295\u5165\u5272\u5408\u306F 0.3\u301C1" };
    if (focus != null && !w.ops.theaters[focus]) return { ok: false, error: "\u305D\u306E\u6226\u57DF\u306F\u306A\u3044" };
    const d = (_a = w.ops.direction)[_b = st2.id] ?? (_a[_b] = {});
    if (posture != null) d.posture = posture;
    if (commit != null) d.commit = r34(commit);
    if (focus !== void 0) d.focus = focus;
    d.since = ctx.civ.monthIndex;
    syncForces(ctx, w);
    return { ok: true };
  }
  var holderSide = (w, g, civ3) => w.ops.occ[g.id] ?? (g.stateId ? sideOf(w, g.stateId) : null);
  function frontierTargets(ctx, w, side) {
    const { civ: civ3 } = ctx, groups = byState(ctx), mine = [], seen = /* @__PURE__ */ new Set(), out = [];
    for (const st2 of members(civ3, w, side)) for (const g of groups.get(st2.id) ?? []) if (holderSide(w, g, civ3) === side) mine.push(g);
    for (const gid of w.occupied) {
      const g = civ3.groups[gid];
      if (g && w.ops.occ[gid] === side) mine.push(g);
    }
    mine.sort((x, y) => x.id < y.id ? -1 : 1);
    const foe = other(side);
    for (const g of mine.slice(0, 90)) for (const o of neighborGroups(ctx, g)) {
      if (seen.has(o)) continue;
      seen.add(o);
      const t = civ3.groups[o];
      if (t && holderSide(w, t, civ3) === foe && t.stateId && civ3.states[t.stateId]?.alive) out.push(t);
    }
    return out.sort((x, y) => x.id < y.id ? -1 : 1);
  }
  var valueOf = (ctx, w, g, from) => {
    const civ3 = ctx.civ, st2 = civ3.states[g.stateId], stage = stageOf3(civ3, g), cap = st2?.capitalGroupId === g.id;
    return Math.sqrt(g.pop + 1) * (cap ? 1.9 : stage === "city" ? 1.6 : stage === "town" ? 1.25 : 1) / (1 + distKm(ctx.world, from, g.cell) / 900);
  };
  function planFor(ctx, w, f) {
    const { civ: civ3, world } = ctx, ops = w.ops, st2 = civ3.states[f.stateId], side = f.side, post = postureOf(ctx, w, st2), dir = ops.direction[st2.id] ?? {}, mi = civ3.monthIndex;
    const mk = (kind, o) => {
      const id = nid(ops, "c"), c = { id, kind, forceId: f.id, stateId: st2.id, side, theaterId: null, targetGroupId: null, targetStateId: null, startedAt: mi, phase: "active", progress: 0, result: null, ...o };
      ops.campaigns[id] = c;
      f.campaignId = id;
      return c;
    };
    const foeFleets = forcesOf(w, other(side), "fleet"), sea = seaTheater(w);
    if (f.kind === "fleet") {
      if (!sea) return mk("defense", {});
      const ctl = side === "a" ? sea.control : -sea.control;
      if (foeFleets.length) return mk("naval_control", { theaterId: sea.id });
      return ctl > 0.3 && post !== "defensive" ? mk("blockade", { theaterId: sea.id }) : mk("naval_control", { theaterId: sea.id });
    }
    if (post === "defensive") return mk("defense", { theaterId: (dir.focus && ops.theaters[dir.focus] ? dir.focus : Object.values(ops.theaters).find((t) => t.kind === "land")?.id) ?? null });
    const from = capCell(civ3, st2) ?? 0, cands = frontierTargets(ctx, w, side).filter((g) => !dir.focus || ops.theaters[dir.focus]?.kind !== "land" || [ops.theaters[dir.focus].a, ops.theaters[dir.focus].d].includes(g.stateId));
    if (cands.length) {
      let best = null, bs = -1;
      for (const g of cands) {
        const s = valueOf(ctx, w, g, from) * (1 + 0.25 * U(civ3, w.id, st2.id, mi, "tg", g.id));
        if (s > bs) {
          bs = s;
          best = g;
        }
      }
      const stage = stageOf3(civ3, best), tst = civ3.states[best.stateId], cap = tst?.capitalGroupId === best.id, th = landTheaterFor(w, st2.id, best.stateId) ?? Object.values(ops.theaters).find((t) => t.kind === "land");
      return mk(stage === "city" || stage === "town" || cap ? "siege" : "offensive", { theaterId: th?.id ?? null, targetGroupId: best.id, targetStateId: best.stateId });
    }
    const landing = (fx2(st2).landing ?? 0) > 0 || stateCan(civ3, st2, "war:naval");
    const foeGs = members(civ3, w, other(side)).flatMap((s) => byState(ctx).get(s.id) ?? []).filter((g) => world.cell.coastDist[g.cell] <= 1 && holderSide(w, g, civ3) === other(side));
    if (landing && sea && foeGs.length && forcesOf(w, side, "fleet").length) {
      const best = foeGs.reduce((b, g) => !b || valueOf(ctx, w, g, from) > valueOf(ctx, w, b, from) ? g : b, null);
      return mk("landing", { theaterId: sea.id, targetGroupId: best.id, targetStateId: best.stateId });
    }
    return mk("defense", { theaterId: Object.values(ops.theaters).find((t) => t.kind === "land")?.id ?? null });
  }
  var fx2 = (st2) => st2.military?.fx ?? {};
  function moraleF(f) {
    return 0.6 + 0.5 * f.morale;
  }
  function fight(ctx, w, { kind, A: A2, D: D2, camp, g, garrison = 0 }) {
    const { civ: civ3, world } = ctx, ops = w.ops, mi = civ3.monthIndex, sA = civ3.states[A2.stateId], sD = D2 ? civ3.states[D2.stateId] : civ3.states[g.stateId];
    const naval = kind === "naval", terr = naval ? 0 : terrainBonus(world, g.cell), stage = stageOf3(civ3, g), fort = naval ? 1 : 1 + (kind === "siege" || stage ? (sD.defense ?? 0) + (stage === "city" ? 0.3 : stage === "town" ? 0.15 : 0.05) : 0);
    const pA = (naval ? navalPower(civ3, sA, A2.size) : landPower(civ3, sA, A2.size)) * moraleF(A2) * (0.5 + 0.5 * A2.supply), adaptA = fx2(sA).adapt ?? 0;
    let pD;
    if (D2) {
      const base = naval ? navalPower(civ3, sD, D2.size) : landPower(civ3, sD, D2.size, { defending: true }), prep = ops.campaigns[D2.campaignId]?.kind === "defense" ? 1.12 : ops.campaigns[D2.campaignId]?.kind === "offensive" ? 0.75 : 0.9;
      pD = base * moraleF(D2) * prep * (D2.lastBattle >= mi - 2 ? 0.88 : 1);
    } else pD = garrison;
    pD *= (1 + Math.max(0, terr - adaptA)) * fort;
    const rnd = 0.75 + 0.5 * U(civ3, w.id, mi, camp.id, "r"), atk = pA * rnd, win = atk > pD ? "A" : "D", q2 = Math.max(1, win === "A" ? atk / (pD + 1e-9) : pD / (atk + 1e-9)), engaged = 0.5 + 0.5 * U(civ3, w.id, mi, camp.id, "e");
    const loserLoss = clamp12(0.06 + 0.07 * Math.min(q2, 3), 0.05, 0.3) * engaged, winnerLoss = clamp12(loserLoss * (0.35 + 0.35 / q2), 0.01, 0.2);
    const apply = (F, st2, frac, lost) => {
      const arm = st2.army, dead = Math.min(arm, F.size * frac * (1 - (fx2(st2).attr ?? 0)));
      st2.army = Math.max(0, arm - dead);
      st2.warLoss = clamp12((st2.warLoss ?? 0) + (arm ? dead / arm * 0.6 : 0), 0, 0.7);
      F.size = Math.max(0, F.size - dead);
      F.lastBattle = mi;
      F.morale = clamp12(F.morale + (lost ? -(0.1 + 0.9 * frac) * (1 - 0.8 * (fx2(st2).coh ?? 0)) : 0.05));
      const grs = byState(ctx).get(st2.id) ?? [];
      if (grs.length && dead > 0) {
        const gg = grs[Math.floor(U(civ3, w.id, mi, camp.id, st2.id, "g") * grs.length)];
        gg.pop = Math.max(1, gg.pop - dead * 0.8);
      }
      w.casualties += dead;
      ops.stats.dead[st2.id] = (ops.stats.dead[st2.id] ?? 0) + dead;
      return dead;
    };
    const deadA = apply(A2, sA, win === "A" ? winnerLoss : loserLoss, win !== "A"), deadD = D2 ? apply(D2, sD, win === "A" ? loserLoss : winnerLoss, win === "A") : (sD.army = Math.max(0, sD.army - garrison * 0.03), garrison * 0.03);
    const mx = (s) => s.military?.exp ?? null;
    {
      const eA = mx(sA);
      if (eA) {
        if (win === "A") eA.won = (eA.won ?? 0) + 1;
        else eA.lost = (eA.lost ?? 0) + 1;
      }
      if (D2) {
        const eD = mx(sD);
        if (eD) {
          if (win === "D") eD.defended = (eD.defended ?? 0) + 1;
          else eD.lost = (eD.lost ?? 0) + 1;
        }
      }
    }
    const winSt = win === "A" ? sA : sD, loseSt = win === "A" ? sD : sA, name = battleName(ctx, w, kind, g), sign = (win === "A" ? A2.side : other(A2.side)) === "a" ? 1 : -1;
    w.score = clamp12(w.score + sign * (2 + 14 * loserLoss), -100, 100);
    const rec = { id: nid(ops, "b"), at: mi, kind, name, theater: camp.theaterId, cell: g.cell, a: A2.stateId, d: sD.id, winner: winSt.id, deadA: Math.round(deadA), deadD: Math.round(deadD), win };
    ops.battles.push(rec);
    if (ops.battles.length > 60) ops.battles.splice(0, ops.battles.length - 60);
    ops.stats.battles++;
    ops.stats.won[winSt.id] = (ops.stats.won[winSt.id] ?? 0) + 1;
    if (kind === "naval") ops.stats.naval++;
    const total = deadA + deadD, notable = total >= Math.max(300, 0.02 * (sA.army + sD.army + total)) || kind === "siege" && (stage === "city" || sD.capitalGroupId === g.id) || kind === "landing";
    rec.notable = notable;
    if (notable) ops.stats.big++;
    if (notable && evBudget(ops, mi)) makeEvent(civ3, ctx.ids, { kind: "battle_fought", title: `${name}\uFF08${sA.name}\u5BFE${sD.name}\u3001${winSt.name}\u304C\u5236\u3057\u305F\uFF09`, participants: [{ entityId: w.id, role: "war" }, { entityId: sA.id, role: "attacker" }, { entityId: sD.id, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }], facts: { warId: w.id, name, kind, cell: g.cell, winnerStateId: winSt.id, loserStateId: loseSt.id, dead: Math.round(total) }, provenance: "simulation" });
    return { win, rec, loserLoss };
  }
  function occupy(ctx, w, g, side, camp) {
    const { civ: civ3 } = ctx, ops = w.ops;
    if (!w.occupied.includes(g.id)) w.occupied.push(g.id);
    ops.occ[g.id] = side;
    (ops.occBy ?? (ops.occBy = {}))[g.id] = camp.stateId;
    const owner = g.stateId ? civ3.states[g.stateId] : null, occ = civ3.states[camp.stateId];
    if (owner && owner.capitalGroupId === g.id) {
      w.score = clamp12(w.score + (side === "a" ? 1 : -1) * 35, -100, 100);
      for (const f of forcesOf(w, other(side))) if (f.stateId === owner.id) f.morale = clamp12(f.morale - 0.3);
    }
    w.score = clamp12(w.score + (side === "a" ? 1 : -1) * (3 + Math.min(10, Math.sqrt(g.pop) / 8)), -100, 100);
    makeEvent(civ3, ctx.ids, { kind: "territory_occupied", title: `${placeName(ctx, g)}\u304C${occ.name}\u306B\u5360\u9818\u3055\u308C\u305F`, participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }, { entityId: camp.stateId, role: "occupier" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, cell: g.cell, stateId: camp.stateId }, provenance: "simulation" });
  }
  function liberate(w, g) {
    w.occupied = w.occupied.filter((x) => x !== g.id);
    delete w.ops.occ[g.id];
    if (w.ops.occBy) delete w.ops.occBy[g.id];
  }
  var defenderForce = (ctx, w, side, targetStateId) => {
    const fs = forcesOf(w, side, "army").filter((f) => f.size > 1);
    const own = fs.filter((f) => f.stateId === targetStateId);
    const pool = own.length ? own : fs;
    return pool.reduce((b, f) => !b || f.size > b.size ? f : b, null);
  };
  function advance(ctx, w, camp) {
    const { civ: civ3, world } = ctx, ops = w.ops, mi = civ3.monthIndex, F = ops.forces[camp.forceId];
    if (!F || camp.phase !== "active") return;
    const st2 = civ3.states[F.stateId], side = F.side, foe = other(side);
    const age = mi - camp.startedAt;
    if (camp.kind === "defense") {
      F.morale = clamp12(F.morale + 0.03);
      F.supply = 1;
      if (age >= 6) camp.phase = "done";
      return;
    }
    if (camp.kind === "naval_control" || camp.kind === "blockade") {
      const th = ops.theaters[camp.theaterId];
      if (!th) {
        camp.phase = "done";
        return;
      }
      F.supply = 0.9;
      const D2 = forcesOf(w, foe, "fleet").find((f) => f.size > 1);
      if (camp.kind === "naval_control") {
        const site = (byState(ctx).get(D2?.stateId) ?? []).find((x) => world.cell.coastDist[x.cell] <= 1) ?? (byState(ctx).get(D2?.stateId) ?? [])[0];
        if (D2 && site && U(civ3, w.id, mi, camp.id, "eng") < 0.45) {
          const coast = site;
          const r = fight(ctx, w, { kind: "naval", A: F, D: D2, camp, g: coast });
          th.control = clamp12(th.control + (r.win === "A" ? 1 : -1) * (side === "a" ? 1 : -1) * 0.3, -1, 1);
          if (F.morale < 0.2) {
            camp.phase = "done";
            camp.result = "failed";
          }
        } else if (!D2) th.control = clamp12(th.control + (side === "a" ? 1 : -1) * 0.08, -1, 1);
        if (age >= 12) camp.phase = "done";
        return;
      }
      const ctl = side === "a" ? th.control : -th.control;
      if (ctl < 0.2 || age >= 12) {
        camp.phase = "done";
        return;
      }
      for (const e of members(civ3, w, foe)) if ((byState(ctx).get(e.id) ?? []).some((g2) => world.cell.coastDist[g2.cell] <= 1)) {
        e.blockade = mi + 3;
        e.treasury -= Math.max(0, e.pop * 3e-5);
      }
      return;
    }
    const g = civ3.groups[camp.targetGroupId];
    if (!g || holderSide(w, g, civ3) !== foe) {
      camp.phase = "done";
      camp.result = "moot";
      return;
    }
    if (F.size < 1 || F.morale < 0.15) {
      camp.phase = "done";
      camp.result = "failed";
      return;
    }
    const capc = capCell(civ3, st2) ?? g.cell, dist = distKm(world, capc, g.cell), own = g.stateId && sideOf(w, g.stateId) === side;
    F.cell = g.cell;
    F.supply = camp.kind === "landing" ? 0.7 : own ? 1 : supplyAt(civ3, st2, dist);
    if (F.supply < 0.4) {
      const lost = F.size * 0.01 * (1 - (fx2(st2).attr ?? 0));
      st2.army = Math.max(0, st2.army - lost);
      F.size -= lost;
      F.morale = clamp12(F.morale - 0.03);
    }
    if (camp.kind === "landing") {
      const sea = seaTheater(w), ctl = sea ? side === "a" ? sea.control : -sea.control : 0;
      if (ctl < -0.3) {
        camp.phase = "done";
        camp.result = "failed";
        return;
      }
      camp.progress += 0.18 + 0.4 * (fx2(st2).landing ?? 0);
      if (camp.progress < 1) return;
    }
    const Dn = defenderForce(ctx, w, foe, g.stateId), tst = civ3.states[g.stateId], stage = stageOf3(civ3, g);
    const garrison = (g.pop * 0.02 + 20) * (1 + (tst?.defense ?? 0) * 2 + (tst?.milDef ?? 0)) * (stage === "city" ? 2 : stage === "town" ? 1.4 : 1);
    if (camp.kind === "landing") {
      const r = fight(ctx, w, { kind: "landing", A: F, D: Dn && Dn.stateId === g.stateId ? Dn : null, camp, g, garrison });
      if (r.win === "A") {
        occupy(ctx, w, g, side, camp);
        ops.stats.landings++;
        camp.phase = "done";
        camp.result = "success";
      } else {
        camp.phase = "done";
        camp.result = "failed";
      }
      return;
    }
    if (Dn && U(civ3, w.id, mi, camp.id, "eng") < (camp.kind === "siege" ? 0.25 : 0.45)) {
      const r = fight(ctx, w, { kind: "field", A: F, D: Dn, camp, g: fieldSite(ctx, w, camp, g) });
      camp.progress = clamp12(camp.progress + (r.win === "A" ? 0.3 : -0.25), 0, 1.2);
      if (r.win !== "A" && F.morale < 0.2) {
        camp.phase = "done";
        camp.result = "failed";
        return;
      }
    } else {
      const atkP = landPower(civ3, st2, F.size) * moraleF(F) * (0.5 + 0.5 * F.supply), ratio = atkP / (garrison * (1 + terrainBonus(world, g.cell)) + 1);
      const rate = camp.kind === "siege" ? clamp12(0.035 * ratio * (1 + 2 * (fx2(st2).siege ?? 0)), 0.01, 0.22) : clamp12(0.06 * ratio, 0.02, 0.3);
      camp.progress = clamp12(camp.progress + rate * (0.6 + 0.4 * F.supply), 0, 1.2);
      if (camp.kind === "siege") {
        const l = F.size * 4e-3 * (1 - (fx2(st2).attr ?? 0));
        st2.army = Math.max(0, st2.army - l);
        F.size -= l;
        w.casualties += l;
        ops.stats.dead[st2.id] = (ops.stats.dead[st2.id] ?? 0) + l;
      }
    }
    if (camp.progress >= 1) {
      if (camp.kind === "siege") {
        ops.stats.sieges++;
        const rec = { id: nid(ops, "b"), at: mi, kind: "siege", name: battleName(ctx, w, "siege", g), theater: camp.theaterId, cell: g.cell, a: F.stateId, d: g.stateId, winner: F.stateId, deadA: 0, deadD: 0, win: "A", notable: stage === "city" || tst?.capitalGroupId === g.id };
        ops.battles.push(rec);
        if (rec.notable) {
          ops.stats.big++;
          if (evBudget(ops, mi)) makeEvent(civ3, ctx.ids, { kind: "battle_fought", title: `${rec.name}\uFF08${st2.name}\u304C${placeName(ctx, g)}\u3092\u843D\u3068\u3057\u305F\uFF09`, participants: [{ entityId: w.id, role: "war" }, { entityId: st2.id, role: "attacker" }, { entityId: g.stateId, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, name: rec.name, kind: "siege", cell: g.cell, winnerStateId: st2.id, loserStateId: g.stateId }, provenance: "simulation" });
        }
        ops.stats.battles++;
      }
      const wasOurs = g.stateId && sideOf(w, g.stateId) === side;
      if (wasOurs) {
        liberate(w, g);
        w.score = clamp12(w.score + (side === "a" ? 1 : -1) * 4, -100, 100);
      } else occupy(ctx, w, g, side, camp);
      camp.phase = "done";
      camp.result = "success";
      F.morale = clamp12(F.morale + 0.08);
    }
    if (age > 30) {
      camp.phase = "done";
      camp.result = "stalled";
    }
  }
  function monthly(ctx) {
    const { civ: civ3 } = ctx;
    for (const id in civ3.states) {
      const s = civ3.states[id];
      if (!s.alive) continue;
      if (s.warLoss > 0) {
        s.warLoss = s.warLoss < 4e-3 ? 0 : r34(s.warLoss * 0.97);
      }
      if (s.blockade != null && s.blockade <= civ3.monthIndex) delete s.blockade;
    }
  }
  function stepWar(ctx, w) {
    const { civ: civ3 } = ctx, mi = civ3.monthIndex;
    if (!w.ops) initWar(ctx, w);
    const ops = w.ops;
    syncForces(ctx, w);
    if (mi % 3 === 0 || !Object.keys(ops.theaters).length) ensureTheaters(ctx, w);
    for (const f of forcesOf(w, "a").concat(forcesOf(w, "d"))) {
      const c = f.campaignId ? ops.campaigns[f.campaignId] : null;
      if (!c || c.phase !== "active") {
        if (c) delete ops.campaigns[c.id];
        f.campaignId = null;
        planFor(ctx, w, f);
      }
    }
    for (const c of Object.values(ops.campaigns).sort((x, y) => x.id < y.id ? -1 : 1)) advance(ctx, w, c);
    for (const id of Object.keys(ops.campaigns)) if (ops.campaigns[id].phase === "done" && !ops.forces[ops.campaigns[id].forceId]) delete ops.campaigns[id];
    for (const f of Object.values(ops.forces)) {
      const st2 = civ3.states[f.stateId];
      if (f.lastBattle < mi - 1) f.morale = clamp12(f.morale + 0.015 + 0.02 * (fx2(st2).coh ?? 0) - 0.02 * (effective(civ3, st2, "fatigue") ?? 0));
    }
    const mor = (side) => {
      const fs = forcesOf(w, side);
      const tot = fs.reduce((s, f) => s + f.size, 0);
      return tot ? fs.reduce((s, f) => s + f.morale * f.size, 0) / tot : 0;
    };
    const mA = mor("a"), mD = mor("d");
    w.score = clamp12(w.score + (mA - mD) * 2.5, -100, 100);
    ops.broken.a = mA < 0.15 ? ops.broken.a + 1 : 0;
    ops.broken.d = mD < 0.15 ? ops.broken.d + 1 : 0;
    const age = mi - w.startedAt;
    if (w.score >= 80 || ops.broken.d >= 6) endWar(ctx, w, "aggressor_victory");
    else if (w.score <= -80 || ops.broken.a >= 6) endWar(ctx, w, "defender_victory");
    else if (age > 120) endWar(ctx, w, "stalemate");
  }
  function finalize(ctx, w, outcome) {
    const { civ: civ3 } = ctx, ops = w.ops;
    if (!ops) return;
    const notable = ops.battles.filter((b) => b.notable).sort((x, y) => y.deadA + y.deadD - (x.deadA + x.deadD) || (x.id < y.id ? -1 : 1)).slice(0, 3).sort((x, y) => x.at - y.at);
    w.summary = { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: Math.round(Object.values(ops.stats.dead).reduce((a, b) => a + b, 0)), notable: notable.map((b) => ({ name: b.name, at: b.at, kind: b.kind, winner: b.winner })) };
    if (notable.length) makeEvent(civ3, ctx.ids, { kind: "war_epilogue", title: `${civ3.states[w.aggressor]?.name ?? "?"}\u3068${civ3.states[w.defender]?.name ?? "?"}\u306E\u6226\u4E89\u306E\u4E3B\u306A\u6226\u3044: ${notable.map((b) => b.name).join("\u30FB")}`, participants: [{ entityId: w.id, role: "war" }], causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, battles: w.summary.battles, dead: w.summary.dead, notable: w.summary.notable.map((b) => b.name) }, provenance: "simulation" });
    for (const id of [...w.sides.a, ...w.sides.d]) {
      const s = civ3.states[id];
      if (s) {
        const arm = s.military?.exp;
        if (arm) arm.wars = (arm.wars ?? 0) + 1;
      }
    }
    w.ops = { v: 1, ended: true, battles: notable.map((b) => ({ ...b })), stats: { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: {}, won: ops.stats.won } };
    w.occupied = [];
  }
  function checkWars(civ3) {
    const errs = [];
    for (const wid of civ3.activeWarIds) {
      const w = civ3.wars[wid], ops = w?.ops;
      if (!ops || ops.ended) continue;
      const ids = /* @__PURE__ */ new Set([...w.sides.a, ...w.sides.d]);
      for (const f of Object.values(ops.forces)) {
        if (!ids.has(f.stateId)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f.id} \u306E\u56FD\u5BB6\u304C\u53C2\u6226\u3057\u3066\u3044\u306A\u3044`);
        if (!(f.size >= 0) || !Number.isFinite(f.size)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f.id} \u306E\u898F\u6A21\u304C\u4E0D\u6B63`);
        if (!(f.morale >= 0 && f.morale <= 1)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f.id} \u306E\u58EB\u6C17\u304C\u7BC4\u56F2\u5916`);
        if (f.campaignId && !ops.campaigns[f.campaignId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f.id} \u306E\u4F5C\u6226 ${f.campaignId} \u304C\u7121\u3044`);
      }
      for (const c of Object.values(ops.campaigns)) {
        if (!ops.forces[c.forceId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u90E8\u968A\u304C\u7121\u3044`);
        if (c.theaterId && !ops.theaters[c.theaterId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u6226\u57DF\u304C\u7121\u3044`);
        if (c.phase !== "done" && c.targetGroupId && !civ3.groups[c.targetGroupId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u76EE\u6A19\u306E\u96C6\u56E3\u304C\u7121\u3044`);
      }
      for (const gid of Object.keys(ops.occ)) if (!w.occupied.includes(gid)) errs.push(`\u6226\u4E89 ${wid} \u306E\u5360\u9818\u306E\u8A18\u9332 ${gid} \u304C\u5360\u9818\u306E\u4E00\u89A7\u306B\u7121\u3044`);
    }
    for (const w of Object.values(civ3.wars)) if (w.status === "ended" && w.ops && (w.ops.forces || w.ops.campaigns || w.ops.theaters)) errs.push(`\u7D42\u7D50\u3057\u305F\u6226\u4E89 ${w.id} \u306B\u90E8\u968A\u30FB\u4F5C\u6226\u30FB\u6226\u57DF\u304C\u6B8B\u3063\u3066\u3044\u308B`);
    return errs;
  }
  function settle(ctx, w, outcome, terms = null) {
    const { civ: civ3 } = ctx, ops = w.ops;
    if (!ops || ops.ended) return null;
    const won = outcome === "aggressor_victory" ? "a" : outcome === "defender_victory" ? "d" : null, keep = outcome === "negotiated" && terms?.kind === "cession", out = [];
    if (won || keep) for (const gid of [...w.occupied].sort()) {
      const g = civ3.groups[gid];
      if (!g || !g.stateId) continue;
      const side = ops.occ[gid];
      if (!keep && side !== won) continue;
      const to = civ3.states[ops.occBy?.[gid]];
      if (!to?.alive || to.id === g.stateId) continue;
      if (sideOf(w, g.stateId) === side) continue;
      out.push({ gid, from: g.stateId, to: to.id });
      g.stateId = to.id;
    }
    return out;
  }
  function leaveWar(ctx, w, st2) {
    const { civ: civ3 } = ctx, ops = w.ops;
    if (!ops || ops.ended) return;
    for (const side of ["a", "d"]) w.sides[side] = w.sides[side].filter((i) => i !== st2.id);
    st2.warIds = st2.warIds.filter((i) => i !== w.id);
    if (st2.campaign?.warId === w.id) st2.campaign = null;
    if (ops.direction) delete ops.direction[st2.id];
    for (const gid of Object.keys(ops.occBy ?? {})) if (ops.occBy[gid] === st2.id) {
      const g = civ3.groups[gid];
      if (g) liberate(w, g);
      else {
        w.occupied = w.occupied.filter((x) => x !== gid);
        delete ops.occ[gid];
        delete ops.occBy[gid];
      }
    }
    syncForces(ctx, w);
  }
  var warSide = (w, id) => sideOf(w, id);

  // js/core/wcde/intervention.js
  var MAX_REASON = 200;
  var initInterventions = () => ({ records: [] });
  var ledger = (civ3) => {
    var _a;
    return (_a = civ3.wcde).interventions ?? (_a.interventions = initInterventions());
  };
  var interventionsOf = (civ3) => ledger(civ3).records;
  var fin = (x) => typeof x === "number" && Number.isFinite(x);
  var residualAt = (rec, monthIndex2) => rec.residual0 * Math.pow(0.5, Math.max(0, monthIndex2 - rec.startMonth) / rec.halfLife);
  function rebuildAdjust(civ3) {
    var _a, _b;
    const adj = (_a = civ3.wcde).adjust ?? (_a.adjust = {});
    for (const k of Object.keys(adj)) delete adj[k];
    for (const r of ledger(civ3).records) if (r.status === "active") (adj[_b = r.targetId] ?? (adj[_b] = {}))[adjKey(r.field, r.otherId)] = { add: r.residual };
  }
  function planIntervention(w, { stateId, field, value, reason = "", halfLifeMonths = null, otherId = null }) {
    const { civ: civ3 } = w, fail4 = (error) => ({ ok: false, error }), f = FIELDS[field];
    if (!f) return fail4(`\u300C${field}\u300D\u306F\u4ECB\u5165\u3067\u304D\u308B\u9805\u76EE\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08${Object.keys(FIELDS).join("\u30FB")}\uFF09`);
    const st2 = civ3.states[stateId];
    if (!st2?.alive) return fail4("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (f.pair) {
      if (!otherId || otherId === stateId || !civ3.states[otherId]?.alive) return fail4("\u95A2\u4FC2\u5024\u306E\u4ECB\u5165\u306B\u306F\u3001\u76F8\u624B\u306E\u56FD\u5BB6\uFF08\u5B58\u547D\uFF09\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    } else if (otherId != null) return fail4(`${f.ja}\u306B\u306F\u76F8\u624B\u306E\u6307\u5B9A\u306F\u4E0D\u8981\u3067\u3059`);
    if (!fin(value)) return fail4("\u5024\u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08NaN\u30FBInfinity\u30FB\u578B\u306E\u4E0D\u4E00\u81F4\u306F\u4ECB\u5165\u3067\u304D\u307E\u305B\u3093\uFF09");
    if (value < f.min || value > f.max) return fail4(`${f.ja}\u306F ${f.min}\u301C${f.max} \u306E\u7BC4\u56F2\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
    if (typeof reason !== "string" || reason.length > MAX_REASON) return fail4(`\u7406\u7531\u306E\u6CE8\u91C8\u306F ${MAX_REASON} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    let half = f.half;
    if (halfLifeMonths != null) {
      if (!fin(halfLifeMonths) || halfLifeMonths < 1 || halfLifeMonths > 1200) return fail4("\u6E1B\u8870\u306E\u534A\u6E1B\u671F\u306F 1\u301C1200 \u304B\u6708");
      half = halfLifeMonths;
    }
    const nominal = nominalOf(civ3, st2, field, otherId);
    if (!fin(nominal)) return fail4(`${f.ja}\u306F\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF08\u6B21\u306E\u6708\u6B21\u51E6\u7406\u306E\u3042\u3068\u3067\u4ECB\u5165\u3067\u304D\u307E\u3059\uFF09`);
    const residual0 = value - nominal;
    if (Math.abs(residual0) < f.eps) return fail4(`\u6307\u5B9A\u5024\u304C\u901A\u5E38\u8A08\u7B97\u5024\uFF08${Math.round(nominal * 1e3) / 1e3}\uFF09\u3068\u307B\u307C\u540C\u3058\u3067\u3059`);
    return { ok: true, plan: { st: st2, f, nominal, residual0, half, reason: reason.trim(), otherId: f.pair ? otherId : null } };
  }
  function createIntervention(w, args, authority = "creator_intervention") {
    const p = planIntervention(w, args);
    if (!p.ok) return p;
    const { civ: civ3 } = w, { st: st2, nominal, residual0, half, reason, otherId } = p.plan, L = ledger(civ3), mi = civ3.monthIndex, id = w.sim.ctx.ids.next("intervention");
    let supersedes = null;
    for (const r of L.records) if (r.status === "active" && r.targetId === st2.id && r.field === args.field && (r.otherId ?? null) === (otherId ?? null)) {
      r.status = "superseded";
      r.endedAt = mi;
      r.supersededBy = id;
      supersedes = r.id;
    }
    L.records.push({ id, targetId: st2.id, field: args.field, otherId: otherId ?? null, domain: FIELDS[args.field].domain ?? null, nominalAtStart: nominal, target: args.value, residual0, residual: residual0, startMonth: mi, halfLife: half, mode: "add", status: "active", authority, reason, supersedes, endedAt: null, changes: [{ at: mi, target: args.value }] });
    rebuildAdjust(civ3);
    return { ok: true, id, nominal, residual0, supersedes };
  }
  function cancelIntervention(w, { id }) {
    const { civ: civ3 } = w, r = ledger(civ3).records.find((x) => x.id === id);
    if (!r) return { ok: false, error: "\u305D\u306E\u4ECB\u5165\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (r.status !== "active") return { ok: false, error: `\u305D\u306E\u4ECB\u5165\u306F\u3059\u3067\u306B\u7D42\u308F\u3063\u3066\u3044\u307E\u3059\uFF08${r.status}\uFF09` };
    r.status = "cancelled";
    r.endedAt = civ3.monthIndex;
    rebuildAdjust(civ3);
    return { ok: true, id };
  }
  function stepInterventions(ctx) {
    const { civ: civ3 } = ctx;
    if (!civ3.options.wcde) return;
    const L = civ3.wcde.interventions;
    if (!L) return;
    let changed = false;
    const mi = civ3.monthIndex;
    for (const r of L.records) {
      if (r.status !== "active") continue;
      changed = true;
      if (!civ3.states[r.targetId]?.alive) {
        r.status = "target_gone";
        r.endedAt = mi;
        continue;
      }
      const res = residualAt(r, mi);
      if (Math.abs(res) < Math.max(FIELDS[r.field].eps, 1e-3 * Math.abs(r.residual0))) {
        r.status = "converged";
        r.endedAt = mi;
        r.residual = 0;
      } else r.residual = res;
    }
    if (changed) rebuildAdjust(civ3);
  }
  function checkInterventions(civ3) {
    const errs = [], L = civ3.wcde?.interventions;
    if (!L) return errs;
    const seen = /* @__PURE__ */ new Set(), ids = /* @__PURE__ */ new Set();
    for (const r of L.records) {
      if (ids.has(r.id)) errs.push(`\u4ECB\u5165 ${r.id} \u304C\u91CD\u8907`);
      ids.add(r.id);
      if (!FIELDS[r.field]) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u9805\u76EE ${r.field} \u304C\u672A\u77E5`);
      for (const k of ["nominalAtStart", "target", "residual0", "residual", "halfLife"]) if (!fin(r[k])) errs.push(`\u4ECB\u5165 ${r.id}.${k} \u304C\u6709\u9650\u3067\u306A\u3044`);
      if (!["active", "converged", "superseded", "cancelled", "target_gone"].includes(r.status)) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u72B6\u614B ${r.status} \u304C\u4E0D\u6B63`);
      if (!civ3.states[r.targetId]) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u5BFE\u8C61 ${r.targetId} \u304C\u7121\u3044`);
      if (r.status === "active") {
        const k = r.targetId + "|" + adjKey(r.field, r.otherId);
        if (seen.has(k)) errs.push(`\u540C\u3058\u9805\u76EE\u306B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u8907\u6570\u3042\u308B\uFF08${k}\uFF09`);
        seen.add(k);
        const a = civ3.wcde.adjust?.[r.targetId]?.[adjKey(r.field, r.otherId)];
        if (!a || Math.abs(a.add - r.residual) > 1e-9) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u88DC\u6B63\u306E\u8868\u304C\u8A18\u9332\u3068\u4E00\u81F4\u3057\u306A\u3044`);
      }
    }
    const adj = civ3.wcde.adjust ?? {};
    for (const sid of Object.keys(adj)) for (const f of Object.keys(adj[sid])) if (!seen.has(sid + "|" + f)) errs.push(`\u88DC\u6B63\u306E\u8868 ${sid}.${f} \u306B\u5BFE\u5FDC\u3059\u308B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u7121\u3044`);
    return errs;
  }

  // js/core/wcde/clock.js
  init_archive();
  var SPEEDS = Object.freeze([{ id: 0, label: "\u505C\u6B62", mps: 0 }, { id: 1, label: "\u6708", mps: 1 }, { id: 2, label: "3\u6708", mps: 3 }, { id: 3, label: "\u5E74", mps: 12 }, { id: 4, label: "5\u5E74", mps: 60 }]);
  var DEFAULT_SPEED = 1;
  var ACK_KEEP = 400;
  var MAX_RUN = 240;
  var COOLDOWN = 60;
  var timeOf = (civ3) => {
    var _a;
    return (_a = civ3.wcde).time ?? (_a.time = { speed: DEFAULT_SPEED, hold: false, resumeSpeed: null });
  };
  var newsOf = (civ3) => {
    var _a;
    return (_a = civ3.wcde).news ?? (_a.news = { queue: [], acked: [], scanned: civ3.events.length });
  };
  var isRunning = (civ3) => {
    const t = timeOf(civ3);
    return !t.hold && t.speed > 0;
  };
  var MAJOR_SCORE = 40;
  var OWN_CRITICAL = /* @__PURE__ */ new Set(["state_dissolved", "war_declared", "war_ended", "ally_joined", "conquest", "regime_change", "state_formed"]);
  var WORLD_WAR = Object.freeze({ minStates: 6, minPerSide: 2, minPopShare: 0.35 });
  var SAME_KIND_COOLDOWN_EXEMPT = /* @__PURE__ */ new Set(["state_dissolved", "war_declared", "war_ended", "ally_joined"]);
  function ownIds(civ3) {
    const out = /* @__PURE__ */ new Set(), id = civ3.wcde.control?.stateId;
    if (id) out.add(id);
    const log3 = civ3.wcde.log ?? [];
    for (let i = log3.length - 1; i >= 0 && log3[i].at >= civ3.monthIndex - 2; i--) if (log3[i].type === "control.lost" && log3[i].stateId) out.add(log3[i].stateId);
    return out;
  }
  function isWorldWar(civ3, war) {
    if (!war) return false;
    const alive = (ids) => ids.filter((i) => civ3.states[i]?.alive), a = alive(war.sides.a), d = alive(war.sides.d);
    if (a.length < WORLD_WAR.minPerSide || d.length < WORLD_WAR.minPerSide || a.length + d.length < WORLD_WAR.minStates) return false;
    let total = 0, inWar = 0;
    for (const s of Object.values(civ3.states)) if (s.alive) total += s.pop;
    for (const i of [...a, ...d]) inWar += civ3.states[i].pop;
    return total > 0 && inWar / total >= WORLD_WAR.minPopShare;
  }
  var warIdOf = (ev) => ev.facts?.warId ?? ev.participants.find((p) => p.role === "war")?.entityId ?? null;
  var worldWarTitle = (civ3, war) => {
    const n2 = (x) => civ3.states[x]?.name ?? "?";
    return `\u4E16\u754C\u5927\u6226: ${n2(war.aggressor)}\u3068${n2(war.defender)}\u306E\u6226\u4E89\u306B ${war.sides.a.length + war.sides.d.length} \u304B\u56FD\u304C\u53C2\u6226\u3057\u305F`;
  };
  function newsContext(civ3) {
    const alive = Object.values(civ3.states).filter((s) => s.alive), total = alive.reduce((a, s) => a + s.pop, 0) || 1, n2 = Math.max(1, alive.length), rel = {};
    for (const s of Object.values(civ3.states)) rel[s.id] = s.pop / total * n2;
    return { rel, own: ownIds(civ3) };
  }
  var KIND = { state_dissolved: 40, war_declared: 25, war_ended: 30, regime_change: 25, conquest: 35, state_formed: 20, religion_founded: 25, religion_schism: 20, famine: 15, disaster_struck: 15, climate_shift: 20, dynasty_changed: 15, culture_diverged: 10, language_diverged: 10, tech_lost: 20 };
  var SIZE_K = 15;
  function classifyEvent(civ3, ev, cx = newsContext(civ3)) {
    const lv = (score2, extra = {}) => ({ level: score2 >= MAJOR_SCORE ? "major" : "normal", score: score2, ...extra });
    {
      const wid = ev.kind === "war_declared" ? warIdOf(ev) : null, war = wid ? civ3.wars[wid] : null;
      if (war && civ3.wcde.news?.worldWars?.[wid] === ev.eventId) return { level: "critical", score: 200, title: worldWarTitle(civ3, war), reason: "world_war" };
    }
    if (ev.kind === "catastrophe") {
      const m = ev.facts?.mortality ?? 0;
      return lv(Math.round(70 + 40 * m + (ev.facts?.scope === "world" ? 20 : 0)));
    }
    const own = cx.own?.size && OWN_CRITICAL.has(ev.kind) && ev.participants.some((p) => cx.own.has(p.entityId));
    const base = KIND[ev.kind];
    if (base == null || base === 0) return own ? { level: "critical", score: 100, reason: "own" } : { level: "normal", score: 0 };
    const ids = ev.participants.map((p) => p.entityId).filter((i) => civ3.states[i]), sum = ids.reduce((a, i) => a + (cx.rel[i] ?? 0), 0), big = Math.max(0, ...ids.map((i) => cx.rel[i] ?? 0));
    let score = base + SIZE_K * Math.log2(1 + sum);
    if (ev.kind === "regime_change" || ev.kind === "dynasty_changed") score = base + SIZE_K * Math.log2(1 + big);
    if (ev.kind === "culture_diverged" || ev.kind === "language_diverged" || ev.kind === "famine" || ev.kind === "disaster_struck") score = Math.min(score, 69);
    score = Math.round(score);
    if (own) return { level: "critical", score: Math.max(score, 100), reason: "own" };
    return lv(score);
  }
  var newsItem = (civ3, ev, c) => ({ id: "news_" + ev.eventId, eventId: ev.eventId, date: ev.date, kind: ev.kind, title: c.title ?? ev.title, level: c.level, score: c.score, entityIds: [...new Set(ev.participants.map((p) => p.entityId))] });
  function scanNews(civ3) {
    const N2 = newsOf(civ3), T3 = timeOf(civ3);
    if (N2.scanned > civ3.events.length) N2.scanned = civ3.events.length;
    delete N2.settings;
    const cx = newsContext(civ3), fresh = [];
    for (let i = N2.scanned; i < civ3.events.length; i++) {
      const ev = civ3.events[i];
      if (ev.kind === "war_declared") {
        const wid = warIdOf(ev), war = wid ? civ3.wars[wid] : null, ww = N2.worldWars ?? (N2.worldWars = {});
        if (war && !ww[wid] && isWorldWar(civ3, war)) ww[wid] = ev.eventId;
      }
      const c = classifyEvent(civ3, ev, cx);
      if (c.level === "critical" && c.reason === "own" && !SAME_KIND_COOLDOWN_EXEMPT.has(ev.kind)) {
        const keys = ev.participants.filter((p) => cx.own.has(p.entityId)).map((p) => ev.kind + "|" + p.entityId), mi = civ3.monthIndex, last = N2.lastCrit ?? (N2.lastCrit = {});
        if (keys.some((k) => last[k] != null && mi - last[k] < COOLDOWN)) c.level = "major";
        else for (const k of keys) last[k] = mi;
      }
      if (c.level === "critical" && !N2.acked.includes(ev.eventId) && !N2.queue.some((q2) => q2.eventId === ev.eventId)) fresh.push(newsItem(civ3, ev, c));
    }
    N2.scanned = civ3.events.length;
    fresh.sort((a, b) => b.score - a.score || (a.eventId < b.eventId ? -1 : 1));
    N2.queue.push(...fresh);
    if (N2.queue.length && !T3.hold) {
      T3.hold = true;
      T3.resumeSpeed = T3.speed;
    }
    return fresh.length;
  }
  var skipNews = (civ3) => {
    newsOf(civ3).scanned = civ3.events.length;
  };
  function clockRun(w, months) {
    const { civ: civ3 } = w, T3 = timeOf(civ3);
    if (T3.hold) return { ok: false, code: "news_hold", error: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061\u3067\u3059\uFF08OK \u3092\u62BC\u3059\u307E\u3067\u6642\u9593\u306F\u9032\u307F\u307E\u305B\u3093\uFF09" };
    const n2 = Math.max(1, Math.min(MAX_RUN, months | 0)), snap = checkpointFull(civ3);
    let done2 = 0, held = false;
    try {
      for (; done2 < n2; done2++) {
        w.sim.advanceMonth();
        if (scanNews(civ3) > 0 || timeOf(civ3).hold) {
          done2++;
          held = true;
          break;
        }
      }
    } catch (err) {
      restoreInto(w, snap);
      const msg = String(err?.message ?? err);
      for (let i = 0; i < done2; i++) w.sim.advanceMonth();
      const ok2 = done2;
      skipNews(civ3);
      timeOf(civ3).speed = 0;
      civ3.wcde.diagnostics.push({ at: civ3.monthIndex, failedMonth: civ3.monthIndex + 1, message: msg });
      if (civ3.wcde.diagnostics.length > 50) civ3.wcde.diagnostics.shift();
      return { ok: false, advanced: ok2, error: msg, haltedAt: { ...civ3.date } };
    }
    return { ok: true, advanced: done2, held, date: { ...civ3.date } };
  }
  function ackNews(w, { id = null } = {}) {
    const { civ: civ3 } = w, N2 = newsOf(civ3), T3 = timeOf(civ3), head2 = N2.queue[0];
    if (!head2) return { ok: false, error: "\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (id != null && id !== head2.id) return { ok: false, error: "\u6700\u521D\u306E\u30CB\u30E5\u30FC\u30B9\u304B\u3089\u9806\u306B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044" };
    N2.queue.shift();
    N2.acked.push(head2.eventId);
    if (N2.acked.length > ACK_KEEP) N2.acked.splice(0, N2.acked.length - ACK_KEEP);
    if (!N2.queue.length) {
      T3.hold = false;
      T3.speed = T3.resumeSpeed ?? DEFAULT_SPEED;
      T3.resumeSpeed = null;
      return { ok: true, resumed: true, speed: T3.speed, next: null };
    }
    return { ok: true, resumed: false, next: N2.queue[0] };
  }
  function setSpeed(w, { speed }) {
    const { civ: civ3 } = w, T3 = timeOf(civ3);
    if (!SPEEDS.some((s) => s.id === speed)) return { ok: false, error: "\u305D\u306E\u901F\u5EA6\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (T3.hold) {
      T3.resumeSpeed = speed;
      return { ok: true, held: true, willResume: speed };
    }
    T3.speed = speed;
    return { ok: true, speed };
  }
  function newsFeed(civ3, { limit = 40, minLevel = "major", before = null } = {}) {
    const cx = newsContext(civ3), out = [], rank = { normal: 0, major: 1, critical: 2 };
    for (let i = (before ?? civ3.events.length) - 1; i >= 0 && out.length < limit; i--) {
      const ev = civ3.events[i], c = classifyEvent(civ3, ev, cx);
      if (rank[c.level] >= rank[minLevel]) out.push(newsItem(civ3, ev, c));
    }
    return out;
  }
  function checkClock(civ3) {
    const errs = [], T3 = civ3.wcde.time, N2 = civ3.wcde.news;
    if (!T3 && !N2) return errs;
    if (T3) {
      if (!SPEEDS.some((s) => s.id === T3.speed)) errs.push("\u6642\u9593\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
      if (T3.hold && !N2?.queue.length) errs.push("\u505C\u6B62\u4E2D\u306A\u306E\u306B\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u306A\u3044\uFF08\u6642\u9593\u304C\u6B62\u307E\u3063\u305F\u307E\u307E\u306B\u306A\u308B\uFF09");
      if (!T3.hold && N2?.queue.length) errs.push("\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u3042\u308B\u306E\u306B\u6642\u9593\u304C\u6B62\u307E\u3063\u3066\u3044\u306A\u3044");
      if (T3.hold && T3.resumeSpeed != null && !SPEEDS.some((s) => s.id === T3.resumeSpeed)) errs.push("\u5FA9\u5E30\u6642\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
    }
    if (N2) {
      const seen = /* @__PURE__ */ new Set();
      for (const q2 of N2.queue) {
        if (seen.has(q2.id)) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u91CD\u8907`);
        seen.add(q2.id);
        if (!civ3.events.some((e) => e.eventId === q2.eventId) && (inLiveRange(civ3, q2.eventId) || !findRecord(civ3, q2.eventId))) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u306E\u5143\u306E\u4E8B\u5B9F\u30A4\u30D9\u30F3\u30C8\u304C\u306A\u3044`);
        if (N2.acked.includes(q2.eventId)) errs.push(`\u78BA\u8A8D\u6E08\u307F\u306E\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u30AD\u30E5\u30FC\u306B\u3042\u308B`);
      }
      if (N2.scanned > civ3.events.length || !Number.isInteger(N2.scanned) || N2.scanned < 0) errs.push("\u30CB\u30E5\u30FC\u30B9\u306E\u8D70\u67FB\u4F4D\u7F6E\u304C\u4E0D\u6B63");
    }
    return errs;
  }

  // js/core/wcde/catastrophe.js
  init_events();
  init_civ_state();
  var MAX_MORTALITY = 0.95;
  var MIN_MORTALITY = 0.01;
  var NAME_MAX = 40;
  var REASON_MAX = 200;
  var clamp13 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r35 = (x) => Math.round(x * 1e3) / 1e3;
  var fin2 = (x) => typeof x === "number" && Number.isFinite(x);
  var catastrophesOf = (civ3) => {
    var _a;
    return (_a = civ3.wcde).catastrophes ?? (_a.catastrophes = []);
  };
  var U2 = (civ3, ...p) => hashSeed(civ3.historySeed, "catastrophe", ...p) / 4294967296;
  function planCatastrophe(w, { name = "", reason = "", scope = "world", center = null, radiusKm = null, mortality, recoveryMonths = 60 }) {
    const fail4 = (error) => ({ ok: false, error }), { civ: civ3, world } = w;
    if (typeof name !== "string" || name.trim().length > NAME_MAX) return fail4(`\u707D\u5384\u306E\u540D\u524D\u306F ${NAME_MAX} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    if (typeof reason !== "string" || reason.length > REASON_MAX) return fail4(`\u7406\u7531\u306E\u6CE8\u91C8\u306F ${REASON_MAX} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    if (scope !== "world" && scope !== "region") return fail4("\u7BC4\u56F2\u306F world\uFF08\u4E16\u754C\u898F\u6A21\uFF09\u304B region\uFF08\u5730\u57DF\u898F\u6A21\uFF09");
    if (!fin2(mortality) || mortality < MIN_MORTALITY || mortality > MAX_MORTALITY) return fail4(`\u4EBA\u53E3\u306E\u640D\u5931\u306E\u5272\u5408\u306F ${MIN_MORTALITY * 100}\u301C${MAX_MORTALITY * 100}% \u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
    if (!fin2(recoveryMonths) || recoveryMonths < 6 || recoveryMonths > 480) return fail4("\u56DE\u5FA9\u307E\u3067\u306E\u76EE\u5B89\u306F 6\u301C480 \u304B\u6708");
    let cell = null, radius = null;
    if (scope === "region") {
      cell = center;
      if (!Number.isInteger(cell) || cell < 0 || cell >= world.mesh.cellCount) return fail4("\u5730\u57DF\u898F\u6A21\u306E\u707D\u5384\u306B\u306F\u3001\u4E2D\u5FC3\u306E\u533A\u753B\uFF080\u301C\u533A\u753B\u6570\u22121 \u306E\u6574\u6570\uFF09\u304C\u5FC5\u8981\u3067\u3059");
      radius = radiusKm ?? 1500;
      if (!fin2(radius) || radius < 100 || radius > 2e4) return fail4("\u534A\u5F84\u306F 100\u301C20000 km");
    }
    return { ok: true, plan: { name: name.trim(), reason: reason.trim(), scope, cell, radius, mortality: r35(mortality), recoveryMonths: Math.round(recoveryMonths) } };
  }
  function createCatastrophe(w, args) {
    const p = planCatastrophe(w, args);
    if (!p.ok) return p;
    const { civ: civ3, world } = w, pl = p.plan, ctx = w.sim.ctx, mi = civ3.monthIndex, id = ctx.ids.next("catastrophe"), name = pl.name || "\u540D\u3082\u306A\u304D\u707D\u5384";
    const hit = [], cs = pl.cell != null ? pl.cell : null;
    for (const gid of Object.keys(civ3.groups).sort()) {
      const g = civ3.groups[gid];
      let k = 1;
      if (pl.scope === "region") {
        const d = distKm(world, cs, g.cell);
        if (d > pl.radius) continue;
        k = 1 - 0.6 * (d / pl.radius);
      }
      hit.push([g, k]);
    }
    const before = Object.values(civ3.groups).reduce((a, g) => a + g.pop, 0);
    let dead = 0;
    const states = /* @__PURE__ */ new Map(), effects = [];
    for (const [g, k] of hit) {
      const jitter = 0.85 + 0.15 * U2(civ3, id, g.id, "j"), frac = clamp13(pl.mortality * k * jitter, 0, MAX_MORTALITY), b = g.pop, a = Math.max(Math.min(b, 5), b * (1 - frac));
      g.pop = a;
      dead += b - a;
      g.capMult = r35(Math.min(g.capUntil > mi ? g.capMult : 1, clamp13(1 - 0.7 * frac, 0.25, 1)));
      g.capUntil = Math.max(g.capUntil ?? 0, mi + pl.recoveryMonths);
      for (const c of g.cohorts ?? []) c.tension = clamp13((c.tension ?? 0) + 0.3 * frac);
      if (g.stateId) {
        const e = states.get(g.stateId) ?? { b: 0, a: 0, frac: 0, n: 0 };
        e.b += b;
        e.a += a;
        states.set(g.stateId, e);
      }
    }
    const touched = [];
    for (const [sid, e] of [...states].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
      const st2 = civ3.states[sid];
      if (!st2?.alive) continue;
      const f = e.b ? 1 - e.a / e.b : 0, sb = st2.stability;
      st2.pop = Math.max(0, st2.pop - (e.b - e.a));
      st2.army = Math.max(0, st2.army * (1 - f));
      st2.stability = clamp13(st2.stability - 0.3 * f);
      st2.treasury -= Math.max(0, st2.treasury) * 0.15 * f;
      touched.push(sid);
      effects.push({ targetId: sid, property: "pop", before: Math.round(e.b), after: Math.round(e.a) }, { targetId: sid, property: "stability", before: r35(sb), after: r35(st2.stability) });
    }
    const total = before > 0 ? dead / before : 0;
    catastrophesOf(civ3).push({ id, at: mi, name, reason: pl.reason, scope: pl.scope, center: cs, radiusKm: pl.radius, mortality: pl.mortality, recoveryMonths: pl.recoveryMonths, authority: "creator_intervention", result: { dead: Math.round(dead), share: r35(total), groups: hit.length, states: touched.length } });
    const label = pl.scope === "world" ? "\u4E16\u754C\u3092" : "\u3042\u308B\u5730\u57DF\u3092";
    makeEvent(civ3, ctx.ids, { kind: "catastrophe", title: `\u5927\u707D\u5384\u300C${name}\u300D\u304C${label}\u8972\u3063\u305F\uFF08\u4EBA\u53E3\u306E\u7D04 ${Math.round(total * 100)}% \u304C\u5931\u308F\u308C\u305F\uFF09`, participants: touched.slice(0, 8).map((s) => ({ entityId: s, role: "affected" })), location: cs != null ? { cell: cs } : null, effects: effects.slice(0, 16), facts: { catastropheId: id, scope: pl.scope, mortality: r35(total), dead: Math.round(dead) }, provenance: "creator" });
    ctx._byState = null;
    return { ok: true, id, dead: Math.round(dead), share: r35(total), groups: hit.length, states: touched.length };
  }
  function checkCatastrophes(civ3) {
    const errs = [], L = civ3.wcde?.catastrophes;
    if (!L) return errs;
    const ids = /* @__PURE__ */ new Set();
    for (const r of L) {
      if (ids.has(r.id)) errs.push(`\u707D\u5384 ${r.id} \u304C\u91CD\u8907`);
      ids.add(r.id);
      if (!fin2(r.mortality) || r.mortality > MAX_MORTALITY || r.mortality < 0) errs.push(`\u707D\u5384 ${r.id} \u306E\u640D\u5931\u306E\u5272\u5408\u304C\u7BC4\u56F2\u5916`);
      if (!fin2(r.result?.share) || r.result.share > MAX_MORTALITY + 1e-9) errs.push(`\u707D\u5384 ${r.id} \u306E\u7D50\u679C\u304C\u7BC4\u56F2\u5916`);
    }
    return errs;
  }

  // js/core/wcde/integrity.js
  var fin3 = (x) => typeof x === "number" && Number.isFinite(x);
  function checkWcdeIntegrity(world, civ3) {
    const errs = [], W2 = civ3.wcde;
    if (!civ3.options?.wcde) return errs;
    if (civ3.monthIndex % 12 === 0) errs.push(...checkArchive(civ3));
    const players = Object.values(civ3.states).filter((s) => s.alive && s.player);
    if (players.length > 1) errs.push(`\u62C5\u5F53\u56FD\u5BB6\u304C\u8907\u6570\u3042\u308B\uFF08${players.map((s) => s.id).join(",")}\uFF09`);
    const cs = W2?.control?.stateId ?? null;
    if (cs && !(civ3.states[cs]?.alive && civ3.states[cs].player)) errs.push(`\u62C5\u5F53\u56FD\u5BB6 ${cs} \u304C\u5B58\u5728\u3057\u306A\u3044\u30FB\u62C5\u5F53\u306E\u5370\u304C\u7121\u3044`);
    if (!cs && players.length) errs.push("\u62C5\u5F53\u304C\u7121\u3044\u306E\u306B\u3001\u62C5\u5F53\u306E\u5370\u304C\u4ED8\u3044\u305F\u56FD\u5BB6\u304C\u3042\u308B");
    if (civ3.player?.groupId != null) errs.push("WCDE \u306E\u4E16\u754C\u3067\u306F\u3001\u62C5\u5F53\u306F\u96C6\u56E3\u3067\u306F\u306A\u304F\u56FD\u5BB6\uFF08civ.player.groupId \u306F\u7A7A\uFF09");
    if (civ3.options.magic === false) {
      if (Object.keys(civ3.persons ?? {}).length || Object.keys(civ3.magic?.orgs ?? {}).length) errs.push("\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u306B\u3001\u9B54\u6CD5\u306E\u4EBA\u7269\u30FB\u7D44\u7E54\u304C\u3042\u308B");
      for (const s of Object.values(civ3.states)) if (s.magic) errs.push(`\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u3067\u56FD\u5BB6 ${s.id} \u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B`);
    }
    for (const st2 of Object.values(civ3.states)) {
      if (!st2.alive) continue;
      const e = st2.econ;
      if (e) {
        for (const k of ["output", "industry", "perCapita", "foodBalance", "tradeIncome"]) if (e[k] !== void 0 && !fin3(e[k])) errs.push(`${st2.id}.econ.${k} \u304C\u6709\u9650\u3067\u306A\u3044`);
      }
      const P2 = st2.politics;
      if (P2) {
        for (const k of Object.keys(P2.factions)) {
          const f = P2.factions[k], s = f?.support;
          if (!FACTIONS[k]) errs.push(`${st2.id} \u306B\u672A\u77E5\u306E\u52E2\u529B ${k}`);
          if (!(s >= 0 && s <= 1)) errs.push(`${st2.id} \u306E${FACTIONS[k] ?? k}\u306E\u652F\u6301\u304C\u7BC4\u56F2\u5916 ${s}`);
          if (!(f.influence == null || f.influence >= 0 && f.influence <= 1)) errs.push(`${st2.id} \u306E${FACTIONS[k] ?? k}\u306E\u5F71\u97FF\u529B\u304C\u7BC4\u56F2\u5916`);
        }
        for (const k of ["nobility", "military", "commoners"]) if (!P2.factions[k]) errs.push(`${st2.id} \u306B\u5E38\u306B\u5728\u308B\u306F\u305A\u306E\u52E2\u529B ${k} \u304C\u7121\u3044`);
        for (const [k, v] of Object.entries(P2.ideas ?? {})) if (!(v >= 0 && v <= 1)) errs.push(`${st2.id} \u306E\u601D\u60F3 ${k} \u304C\u7BC4\u56F2\u5916`);
        if (!(P2.legitimacy >= 0 && P2.legitimacy <= 1)) errs.push(`${st2.id} \u306E\u6B63\u7D71\u6027\u304C\u7BC4\u56F2\u5916`);
      }
      const M = st2.military;
      if (M) {
        for (const id of Object.keys(M.doctrine.taken)) {
          const d = nodeOf(st2, id);
          if (!d) {
            if (!id.startsWith("sp:")) errs.push(`${st2.id} \u306B\u672A\u77E5\u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id}`);
          } else for (const p of d.prereq) if (M.doctrine.taken[p] == null) errs.push(`${st2.id} \u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id} \u306E\u524D\u63D0 ${p} \u304C\u7121\u3044`);
        }
        if (!(st2.milBonus >= -0.6 - 1e-9 && st2.milBonus <= 0.6 + 1e-9)) errs.push(`${st2.id} \u306E milBonus \u304C\u7BC4\u56F2\u5916 ${st2.milBonus}`);
        if (!(st2.milDef >= 0 && st2.milDef <= 0.4 + 1e-9)) errs.push(`${st2.id} \u306E milDef \u304C\u7BC4\u56F2\u5916`);
      }
      if (st2.leaderFigureId) {
        const f = civ3.figures?.[st2.leaderFigureId];
        if (!f) errs.push(`${st2.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269 ${st2.leaderFigureId} \u304C\u7121\u3044`);
        else if (f.diedAt != null) errs.push(`${st2.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269\u304C\u6CA1\u3057\u3066\u3044\u308B`);
      }
    }
    errs.push(...checkInterventions(civ3));
    errs.push(...checkCatastrophes(civ3));
    errs.push(...checkClock(civ3));
    errs.push(...checkWars(civ3));
    for (const f of Object.values(civ3.figures ?? {})) {
      if (f.diedAt != null && f.diedAt < f.bornAt) errs.push(`\u4EBA\u7269 ${f.id} \u306E\u6CA1\u304C\u751F\u3088\u308A\u524D`);
      if (f.parents) for (const pid of f.parents) {
        const p = civ3.figures[pid];
        if (!p) errs.push(`\u4EBA\u7269 ${f.id} \u306E\u89AA ${pid} \u304C\u7121\u3044`);
        else {
          if (p.bornAt >= f.bornAt) errs.push(`\u4EBA\u7269 ${f.id} \u304C\u89AA\u3088\u308A\u5148\u306B\u751F\u307E\u308C\u3066\u3044\u308B`);
          if (!p.children.includes(f.id)) errs.push(`\u4EBA\u7269 ${f.id} \u304C\u89AA ${pid} \u306E\u5B50\u306B\u8F09\u3063\u3066\u3044\u306A\u3044`);
        }
      }
      for (const cid of f.children) if (!civ3.figures[cid]) errs.push(`\u4EBA\u7269 ${f.id} \u306E\u5B50 ${cid} \u304C\u7121\u3044`);
      if (f.houseId && !civ3.houses?.[f.houseId]) errs.push(`\u4EBA\u7269 ${f.id} \u306E\u5BB6 ${f.houseId} \u304C\u7121\u3044`);
    }
    return errs;
  }

  // js/core/wcde/control.js
  init_events();
  var fail2 = (error) => ({ ok: false, error });
  function dropPlayerPlans(civ3, st2) {
    st2.strategy = null;
    st2.campaign = null;
    for (const id of civ3.activeWarIds) {
      const o = civ3.wars[id]?.ops;
      if (o?.direction) delete o.direction[st2.id];
    }
  }
  function takeControl(w, stateId) {
    const { civ: civ3 } = w, st2 = civ3.states[stateId];
    if (!st2?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    for (const s of Object.values(civ3.states)) if (s.player && s.id !== stateId) {
      s.player = false;
      dropPlayerPlans(civ3, s);
    }
    dropPlayerPlans(civ3, st2);
    st2.player = true;
    civ3.wcde.control.stateId = stateId;
    civ3.wcde.control.since = civ3.monthIndex;
    w.sim.ctx._byState = null;
    return { ok: true, stateId };
  }
  function releaseControl(w) {
    const { civ: civ3 } = w;
    for (const s of Object.values(civ3.states)) {
      if (s.player) dropPlayerPlans(civ3, s);
      s.player = false;
    }
    civ3.wcde.control.stateId = null;
    civ3.wcde.control.since = null;
    return { ok: true };
  }
  function syncControl(civ3) {
    const id = civ3.wcde.control.stateId;
    if (id && !civ3.states[id]?.alive) {
      civ3.wcde.log = (civ3.wcde.log ?? []).concat([{ at: civ3.monthIndex, type: "control.lost", ok: true, stateId: id }]).slice(-500);
      civ3.wcde.control.stateId = null;
      civ3.wcde.control.since = null;
    }
  }
  var FIELDS2 = {
    name: { get: (s) => s.name, set: (s, v) => {
      s.name = v;
      s.nameBase = null;
    }, check: (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null },
    polity: { get: (s) => s.polity, set: (s, v) => {
      s.polity = v;
    }, check: (v) => v in POLITY ? v : null },
    "policy.tax": { get: (s) => s.policy.tax, set: (s, v) => {
      s.policy.tax = v;
    }, check: (v) => typeof v === "number" && v >= 0.02 && v <= 0.4 ? v : null },
    "policy.mobilization": { get: (s) => s.policy.mobilization, set: (s, v) => {
      s.policy.mobilization = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.tolerance": { get: (s) => s.policy.tolerance, set: (s, v) => {
      s.policy.tolerance = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.assimilation": { get: (s) => s.policy.assimilation, set: (s, v) => {
      s.policy.assimilation = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.autonomy": { get: (s) => s.policy.autonomy, set: (s, v) => {
      s.policy.autonomy = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    treasury: { get: (s) => s.treasury, set: (s, v) => {
      s.treasury = v;
    }, check: (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7 ? v : null },
    stability: { get: (s) => s.stability, set: (s, v) => {
      s.stability = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "leader.name": { get: (s) => s.leader.name, set: (s, v) => {
      s.leader.name = v;
    }, check: (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null }
  };
  var EDITABLE_STATE_FIELDS = Object.freeze(Object.keys(FIELDS2));
  function creatorEditState(w, { stateId, changes }) {
    var _a;
    const { civ: civ3 } = w, st2 = civ3.states[stateId];
    if (!st2?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) return fail2("\u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093");
    const plan = [];
    for (const [k, raw] of Object.entries(changes)) {
      const f = FIELDS2[k];
      if (!f) return fail2(`\u300C${k}\u300D\u306F\u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6\u306E\u5BFE\u8C61\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08\u7DE8\u96C6\u3067\u304D\u308B\u9805\u76EE: ${EDITABLE_STATE_FIELDS.join("\u30FB")}\uFF09`);
      const v = f.check(raw);
      if (v == null) return fail2(`\u300C${k}\u300D\u306E\u5024\u304C\u4E0D\u6B63\u3067\u3059`);
      plan.push([k, f, v]);
    }
    const done2 = [];
    for (const [k, f, v] of plan) {
      const before = f.get(st2);
      f.set(st2, v);
      if (k === "leader.name") {
        st2.leader.name = v;
        st2.leader.renamedByCreator = true;
      }
      done2.push({ targetId: stateId, property: k, before, after: v });
    }
    ((_a = civ3.wcde).edits ?? (_a.edits = [])).push(...done2.map((d) => ({ at: civ3.monthIndex, authority: "creator_intervention", ...d })));
    if (civ3.wcde.edits.length > 2e3) civ3.wcde.edits.splice(0, civ3.wcde.edits.length - 2e3);
    w.sim.ctx._byState = null;
    return { ok: true, edited: done2.map((d) => d.property) };
  }
  function creatorRename(w, { kind, id, name }) {
    var _a;
    const { civ: civ3 } = w, table3 = { culture: civ3.cultures, language: civ3.languages, religion: civ3.religions }[kind];
    if (!table3) return fail2("\u5BFE\u8C61\u306F culture / language / religion");
    const e = table3[id];
    if (!e) return fail2("\u305D\u306E\u5B9A\u7FA9\u304C\u3042\u308A\u307E\u305B\u3093");
    const n2 = typeof name === "string" ? name.trim() : "";
    if (!n2 || n2.length > 30) return fail2("\u540D\u524D\u306F 1\u301C30 \u6587\u5B57");
    const before = e.name;
    e.name = n2;
    if (kind === "culture") e.nameFixed = true;
    ((_a = civ3.wcde).edits ?? (_a.edits = [])).push({ at: civ3.monthIndex, authority: "creator_intervention", targetId: id, property: "name", before, after: n2 });
    return { ok: true };
  }

  // js/core/wcde/warlab.js
  var WARLAB_MODEL = "warlab-2";
  var clamp14 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r36 = (x) => Math.round(x * 1e3) / 1e3;
  function warInputs(civ3, st2, role = "attack") {
    const equip = effective(civ3, st2, "equipLevel"), readiness = effective(civ3, st2, "readiness"), fatigue = effective(civ3, st2, "fatigue"), industry = effective(civ3, st2, "industry");
    const sustain = clamp14(st2.treasury / (st2.army * 0.05 + 10) / 24);
    const land = landPower(civ3, st2, null, { defending: role === "defend" }), naval = navalPower(civ3, st2), base = land + 0.35 * naval;
    return { army: st2.army, equip: r36(equip), readiness: r36(readiness), fatigue: r36(fatigue), industry: Math.round(industry), stability: r36(st2.stability), treasury: Math.round(st2.treasury), sustain: r36(sustain), base: Math.round(base), land: Math.round(land), naval: Math.round(naval), navyShare: r36(navyShare(st2)), supply: Math.round(supplyRange(civ3, st2)), power: Math.round(base * (1 - 0.3 * fatigue) * (0.85 + 0.15 * sustain)) };
  }
  var sig = (x) => [x.army, x.equip, x.readiness, x.fatigue, x.industry, x.stability, x.sustain, x.base, x.naval, x.supply].map((v) => Math.round(v * 100) / 100).join(",");
  var logistic = (x) => 1 / (1 + Math.exp(-x));
  function predictWar(civ3, aId, bId, cacheHost = null) {
    const a = civ3.states[aId], b = civ3.states[bId];
    if (!a?.alive || !b?.alive || a.id === b.id) return null;
    const ia = warInputs(civ3, a, "attack"), ib = warInputs(civ3, b, "defend"), key = `${WARLAB_MODEL}|${aId}|${bId}|${sig(ia)}|${sig(ib)}`, cache = cacheHost ? cacheHost._warlab ?? (cacheHost._warlab = /* @__PURE__ */ new Map()) : null;
    const hit = cache?.get(key);
    if (hit) return hit;
    const ratio = (ia.power + 1) / (ib.power + 1), lr = Math.log(ratio);
    const unc = clamp14(0.12 + 0.35 * (1 - (ia.readiness + ib.readiness) / 2) + 0.2 * (1 - (ia.stability + ib.stability) / 2) + 0.1 / (1 + Math.log10(1 + Math.min(ia.industry, ib.industry) / 1e3)), 0.05, 0.9);
    const win = (l) => {
      const raw = logistic(1.6 * l), stale = 0.35 * Math.exp(-(l * l) / 0.5);
      return { a: (1 - stale) * raw, b: (1 - stale) * (1 - raw), s: stale };
    };
    const mid = win(lr), lo = win(lr - unc), hi = win(lr + unc);
    const lossA = clamp14(0.08 + 0.25 / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6), lossB = clamp14(0.08 + 0.25 * ratio / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6);
    const months = Math.round(clamp14(6 + 30 * mid.s + 14 * (1 - Math.abs(mid.a - mid.b)), 4, 72));
    const factors = [["army", "\u5175\u529B"], ["equip", "\u88C5\u5099\u6C34\u6E96"], ["readiness", "\u7DF4\u5EA6\u30FB\u5373\u5FDC"], ["fatigue", "\u75B2\u52B4\u5EA6"], ["sustain", "\u56FD\u5EAB\u306E\u6301\u4E45\u529B"], ["naval", "\u6D77\u8ECD\u529B"], ["supply", "\u88DC\u7D66\u306E\u5C4A\u304F\u7BC4\u56F2\uFF08km\uFF09"], ["power", "\u7DCF\u5408\u6226\u529B"]].map(([k, ja]) => ({ key: k, ja, a: ia[k], b: ib[k] }));
    const out = { model: WARLAB_MODEL, month: civ3.monthIndex, aId, bId, inputs: { a: ia, b: ib }, ratio: r36(ratio), pAWin: r36(mid.a), pBWin: r36(mid.b), pStalemate: r36(mid.s), pAWinRange: [r36(lo.a), r36(hi.a)], lossA: r36(lossA), lossB: r36(lossB), months, uncertainty: r36(unc), factors };
    if (cache) {
      if (cache.size > 4e3) cache.clear();
      cache.set(key, out);
    }
    return out;
  }

  // js/core/wcde/negotiation.js
  var clamp15 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r22 = (x) => Math.round(x * 100) / 100;
  var initDiplomacy = () => ({ proposals: [] });
  var ledger2 = (civ3) => {
    var _a;
    return (_a = civ3.wcde).diplomacy ?? (_a.diplomacy = initDiplomacy());
  };
  var proposalsOf = (civ3) => ledger2(civ3).proposals;
  var TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10 };
  function treatyFeasible(civ3, from, to, type) {
    const mi = civ3.monthIndex;
    if (!from.alive || !to.alive) return "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044";
    if (atWarWith(civ3, from, to)) return "\u4EA4\u6226\u4E2D\u306E\u76F8\u624B\u3068\u306F\u7D50\u3079\u306A\u3044";
    if (type === "trade") {
      if ((from.blockade ?? 0) > mi || (to.blockade ?? 0) > mi) return "\u5C01\u9396\u4E2D\u306F\u901A\u5546\u5354\u5B9A\u3092\u7D50\u3079\u306A\u3044";
      if ((to.sanctions?.[from.id] ?? 0) > mi || (from.sanctions?.[to.id] ?? 0) > mi) return "\u5236\u88C1\u4E2D\u306F\u901A\u5546\u5354\u5B9A\u3092\u7D50\u3079\u306A\u3044";
      if (!(from.econ && to.econ)) return "\u7D4C\u6E08\u306E\u7B97\u51FA\u304C\u6E08\u3093\u3067\u3044\u306A\u3044";
    }
    if (type === "alliance" && (from.polity === "tribal" || to.polity === "tribal") && !(from.techAdopted?.record_keeping != null || from.techAdopted?.writing != null)) return "\u90E8\u65CF\u306E\u9023\u5408\u306B\u306F\u3001\u7D04\u675F\u3092\u8A18\u3059\u4ED5\u7D44\u307F\uFF08\u8A18\u9332\uFF09\u304C\u8981\u308B";
    return null;
  }
  function evaluateTreaty(civ3, from, to, type) {
    const f = [], add = (ja, v) => {
      f.push({ ja, v: r22(v) });
      return v;
    };
    const T3 = TREATY[type];
    {
      const nf = T3 ? treatyFeasible(civ3, from, to, type) : null;
      if (nf) return { accept: false, score: -9, factors: [{ ja: nf, v: -9 }], hard: true, counter: null };
    }
    if (!T3) return { accept: false, score: -9, factors: [{ ja: "\u305D\u306E\u7A2E\u985E\u306E\u6761\u7D04\u306F\u306A\u3044", v: -9 }], hard: true, counter: null };
    const rel = effective(civ3, to, "relation", from.id);
    let s = add("\u76F8\u624B\u304B\u3089\u898B\u305F\u95A2\u4FC2", (rel - TREATY_THRESHOLD[type]) / 20);
    const gr = grievance(civ3, to, from.id);
    if (gr > 0.5) return { accept: false, score: -9, factors: [{ ja: "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", v: -9 }], hard: true, counter: null };
    if (gr > 0) s += add("\u904E\u53BB\u306E\u6068\u307F", -3 * gr);
    const sf = strength(civ3, from), st2 = strength(civ3, to), rf = (sf + 1) / (st2 + 1);
    if (type === "nonaggression") s += add(rf > 1 ? "\u76F8\u624B\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u305F\u3044" : "\u3053\u3061\u3089\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u306B\u304F\u3044", clamp15(Math.log(rf), -1, 1) * 0.5);
    if (type === "alliance") {
      const hot2 = to.warIds.length > 0 ? 0.6 : 0;
      if (hot2) s += add("\u4EA4\u6226\u4E2D\u3067\u5473\u65B9\u304C\u307B\u3057\u3044", hot2);
      s += add("\u6226\u529B\u306E\u91E3\u308A\u5408\u3044", clamp15(Math.log(rf), -1, 1) * 0.3);
    }
    if (type === "trade") {
      const ratio = (from.econ?.industry ?? 1) / ((to.econ?.industry ?? 1) + 1);
      s += add("\u4EA4\u6613\u306E\u898B\u8FBC\u307F", clamp15(Math.log1p(Math.min(ratio, 1 / Math.max(ratio, 0.01))), 0, 1) * 0.5);
    }
    if (to.stability < 0.3) s += add("\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A", -0.5);
    for (const t of civ3.activeTreatyIds.map((i) => civ3.treaties[i])) if (t.active && t.type === "alliance") {
      const ally = t.a === to.id ? t.b : t.b === to.id ? t.a : null;
      if (ally && civ3.states[ally]?.alive && atWarWith(civ3, from, civ3.states[ally])) return { accept: false, score: -9, factors: [{ ja: "\u76F8\u624B\u306E\u540C\u76DF\u56FD\u3068\u4EA4\u6226\u4E2D", v: -9 }], hard: true, counter: null };
    }
    const accept = s >= 0;
    let counter = null;
    if (!accept && type === "alliance" && s > -1) {
      const alt = evaluateTreaty(civ3, from, to, "nonaggression");
      if (alt.accept) counter = { type: "nonaggression", note: "\u540C\u76DF\u306F\u96E3\u3057\u3044\u304C\u3001\u4E0D\u53EF\u4FB5\u306A\u3089\u3070\u53D7\u3051\u5165\u308C\u308B" };
    }
    return { accept, score: r22(s), factors: f, counter, hard: false };
  }
  function occupationShares(civ3, war, side) {
    const ops = war.ops;
    if (!ops || ops.ended) return { lost: 0, held: 0, capitalLost: false };
    const mine = new Set(war.sides[side]), foeIds = new Set(war.sides[side === "a" ? "d" : "a"]);
    let lost = 0, held = 0, tot = 0, totFoe = 0, capLost = false;
    for (const g of Object.values(civ3.groups)) {
      if (!g.stateId) continue;
      if (mine.has(g.stateId)) tot++;
      else if (foeIds.has(g.stateId)) totFoe++;
    }
    for (const gid of war.occupied) {
      const g = civ3.groups[gid];
      if (!g?.stateId) continue;
      const s = ops.occ[gid];
      if (mine.has(g.stateId) && s !== side) {
        lost++;
        if (civ3.states[g.stateId]?.capitalGroupId === gid) capLost = true;
      } else if (foeIds.has(g.stateId) && s === side) held++;
    }
    return { lost: lost / (tot + 1), held: held / (totFoe + 1), capitalLost: capLost, lostN: lost, heldN: held };
  }
  function evaluatePeace(civ3, war, proposer, other2, terms = { kind: "white" }) {
    const f = [], add = (ja, v) => {
      f.push({ ja, v: r22(v) });
      return v;
    }, side = warSide(war, other2.id) ?? (war.aggressor === other2.id ? "a" : "d"), foe = side === "a" ? "d" : "a";
    const power = (ids) => ids.map((i) => civ3.states[i]).filter((s2) => s2?.alive).reduce((a, s2) => a + totalPower(civ3, s2), 0), adv = clamp15(Math.log((power(war.sides[side]) + 1) / (power(war.sides[foe]) + 1)), -2, 2);
    const lead = side === "a" ? war.score : -war.score, occ = occupationShares(civ3, war, side);
    let s = add("\u6226\u529B\u306E\u5DEE\uFF08\u52A3\u52E2\u306A\u3089\u8B1B\u548C\u3057\u305F\u3044\uFF09", -0.6 * adv);
    s += add("\u6226\u6CC1\uFF08\u52A3\u52E2\u306A\u3089\u8B1B\u548C\u3057\u305F\u3044\uFF09", -lead / 40);
    s += add("\u5360\u9818\u3055\u308C\u305F\u571F\u5730", 3 * occ.lost);
    if (occ.capitalLost) s += add("\u9996\u90FD\u306E\u9665\u843D", 1.2);
    s += add("\u5360\u9818\u3057\u3066\u3044\u308B\u571F\u5730\uFF08\u6709\u5229\u306A\u3046\u3061\u306F\u7D9A\u3051\u305F\u3044\uFF09", -2 * occ.held);
    if ((other2.blockade ?? 0) > civ3.monthIndex) s += add("\u6D77\u4E0A\u5C01\u9396", 0.4);
    s += add("\u75B2\u52B4", effective(civ3, other2, "fatigue") * 1);
    s += add("\u56FD\u5185\u306E\u4E0D\u5B89\u5B9A", (1 - effective(civ3, other2, "stability")) * 0.8);
    if (other2.treasury < 0) s += add("\u56FD\u5EAB\u306E\u67AF\u6E07", 0.5);
    s += add("\u6226\u4E89\u306E\u640D\u8017", (other2.warLoss ?? 0) * 1.5);
    s += add("\u6226\u4E89\u306E\u9577\u671F\u5316", clamp15(Math.max(0, civ3.monthIndex - war.startedAt) / 60, 0, 1.5));
    let need = 0.2;
    const otherPays = lead < 0 || lead === 0 && other2.treasury < proposer.treasury;
    if (terms.kind === "reparations") {
      const pay = clamp15((terms.amount ?? 0) / (Math.max(0, otherPays ? other2.treasury : proposer.treasury) + 1), 0, 2);
      need += otherPays ? add("\u8CE0\u511F\u306E\u91CD\u3055", 1.5 * pay) : -add("\u8CE0\u511F\u3092\u53D7\u3051\u53D6\u308C\u308B", 0.5 * pay);
    } else if (terms.kind === "cession") {
      need += add("\u571F\u5730\u3092\u5931\u3046\uFF08\u5272\u8B72\uFF09", 2.5 * occ.lost) - add("\u5360\u9818\u5730\u3092\u4FDD\u6301\u3067\u304D\u308B", 1.2 * occ.held);
    } else if (occ.held > 0) need += add("\u5360\u9818\u5730\u3092\u8FD4\u3059\uFF08\u767D\u7D19\u8B1B\u548C\uFF09", 1.5 * occ.held);
    s -= need;
    return { accept: s >= 0, score: r22(s), factors: f };
  }
  var record2 = (ctx, rec) => {
    const id = ctx.ids.next("proposal"), { factors, score, ...rest } = rec;
    ledger2(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rest });
    return id;
  };
  var failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });
  function negotiateTreaty(ctx, from, to, type, c = {}) {
    const civ3 = ctx.civ, ev = evaluateTreaty(civ3, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, counter: ev.counter ? { type: ev.counter.type } : null };
    if (!ev.accept) {
      record2(ctx, { ...base, status: ev.counter ? "countered" : "rejected" });
      return failure(ev.counter ? `\u5225\u306E\u6761\u4EF6\u306A\u3089\u3070\u53D7\u3051\u5165\u308C\u308B\uFF08${TREATY[ev.counter.type].ja}\uFF09` : "\u76F8\u624B\u306B\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: to.id, counter: ev.counter });
    }
    if (treatyFeasible(civ3, from, to, type) || treatyBetween(civ3, from, to, type)) {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u7DE0\u7D50\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: to.id });
    }
    signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance });
    record2(ctx, { ...base, status: "accepted" });
    return { ok: true, effects: [], silent: true, targetId: to.id };
  }
  function defaultTerms(civ3, war, proposer) {
    const side = warSide(war, proposer.id) ?? "a", o = occupationShares(civ3, war, side);
    if (o.heldN > o.lostN) return { kind: "cession" };
    return { kind: "white" };
  }
  function negotiatePeace(ctx, proposer, war, c = {}) {
    const civ3 = ctx.civ;
    if (!war || war.status !== "active" || !proposer.warIds.includes(war.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
    const mySide = warSide(war, proposer.id);
    if (!mySide) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306E\u53C2\u6226\u56FD\u3067\u306F\u306A\u3044" };
    const foe = mySide === "a" ? "d" : "a", foePrincipal = foe === "a" ? war.aggressor : war.defender, principal = proposer.id === war.aggressor || proposer.id === war.defender;
    const otherId = c.withId && war.sides[foe].includes(c.withId) ? c.withId : foePrincipal, other2 = civ3.states[otherId];
    if (!other2?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
    const k = c.terms?.kind, terms = k === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : k === "cession" ? { kind: "cession" } : k === "white" ? { kind: "white" } : defaultTerms(civ3, war, proposer);
    if (!principal && terms.kind === "cession") terms.kind = "white";
    const ev = evaluatePeace(civ3, war, proposer, other2, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, separate: !principal };
    if (!ev.accept) {
      record2(ctx, { ...base, status: "rejected" });
      return failure("\u8B1B\u548C\u306F\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (war.status !== "active") {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u8B1B\u548C\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (terms.kind === "reparations") {
      const ahead = war.score >= 0 ? "a" : "d", payerSide = ahead === "a" ? "d" : "a", payer = civ3.states[payerSide === mySide ? proposer.id : otherId], getter = civ3.states[payer.id === proposer.id ? otherId : proposer.id];
      const amt = Math.min(terms.amount, Math.max(0, payer.treasury));
      payer.treasury -= amt;
      getter.treasury += amt;
      base.terms = { ...terms, paid: Math.round(amt) };
    }
    if (!principal) {
      leaveWar(ctx, war, proposer);
      proposer.lastWarEnd = civ3.monthIndex;
      record2(ctx, { ...base, status: "accepted" });
      return { ok: true, effects: [], silent: true, targetId: war.id, separate: true };
    }
    endWar(ctx, war, "negotiated", terms);
    record2(ctx, { ...base, status: "accepted" });
    return { ok: true, effects: [], silent: true, targetId: war.id };
  }

  // js/core/wcde/domains/index.js
  function wcdeExtension(ticker, ctx) {
    registerWcdeActions();
    ctx.nameGen = nameGen;
    ctx.nameLangOf = nameLangOf;
    ctx.warForecast = (a, b) => ctx.civ.options.wcde ? predictWar(ctx.civ, a.id, b.id, ctx) : null;
    ctx.negotiate = { treaty: (c, a, b, t, x) => c.civ.options.wcde ? negotiateTreaty(c, a, b, t, x) : null, peace: (c, a, w, x) => c.civ.options.wcde ? negotiatePeace(c, a, w, x) : null };
    ctx.warOps = ctx.civ.options.wcde ? { init: initWar, step: stepWar, finalize, monthly, canReach, seaTargets, settle } : null;
    ctx.taxFactor = (st2) => ctx.civ.options.wcde ? effective(ctx.civ, st2, "taxRevenue") : 1;
    if (ctx.civ.options.wcde) {
      const sm0 = ctx.stateMult;
      ctx.stateMult = (g) => {
        const st2 = g.stateId ? ctx.civ.states[g.stateId] : null;
        return (sm0 ? sm0(g) : 1) * (st2 && ctx.civ.wcde?.adjust?.[st2.id]?.popCapacity ? effective(ctx.civ, st2, "popCapacity") : 1);
      };
    }
    ctx.ecoMult = (g) => ctx.civ.options.wcde ? ecoMult(ctx.world, ctx.civ, g) : 1;
    ticker.register("ecosystem", stepEcosystem, "stepEcosystem", { every: 12, offset: 5 });
    ticker.register("interventions", stepInterventions, "stepInterventions");
    ticker.register("culture", stepLanguage, "stepLanguage");
    ticker.register("culture", stepReligion, "stepReligion");
    ticker.register("economy", stepEconomy, "stepEconomy", { every: 3 });
    ticker.register("politics", stepPolitics, "stepPolitics", { every: 3 });
    ticker.register("military", stepMilitary, "stepMilitary", { every: 3 });
    ticker.register("people", stepPeople, "stepPeople");
    ticker.register("people", stepCities, "stepCities");
    ticker.register("integrity", (c) => syncControl(c.civ), "syncControl");
    ticker.register("integrity", (c) => {
      const errs = [...checkWcdeIntegrity(c.world, c.civ), ...c.civ.monthIndex % 120 === 0 ? checkEco(c.world, c.civ) : []];
      if (errs.length) throw new Error("WCDE \u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkWcdeIntegrity");
  }

  // js/core/wcde/contract.js
  var AUTHORITY = Object.freeze({ PLAYER: "player_order", CREATOR: "creator_intervention", AI: "ai_action", SIM: "simulation_transition", ADMIN: "administrative" });
  var A = AUTHORITY;
  var SNAP_KEYS = ["techOverrides", "states", "groups", "settlements", "figures", "houses", "cultures", "languages", "religions", "treaties", "wars", "activeWarIds", "activeTreatyIds", "proposals", "persons", "orgs", "seq", "wcde", "options", "player", "techWorld", "species", "speciesDefs", "monthIndex", "date", "adoptCache"];
  var LOG_MAX = 500;
  var ID_MAX = 2e3;
  function createWcde(world, civ3) {
    const w = { world, civ: civ3, viewPast: null, sim: null };
    w.rebuild = () => {
      w.sim = createCivSim(world, civ3, { extensions: [wcdeExtension] });
      return w.sim;
    };
    w.rebuild();
    return w;
  }
  var COMMANDS = {};
  var COMMAND_DOMAIN = { founding: "states", control: "states", time: "clock", clock: "clock", news: "integrity", view: "integrity", state: "states", diplomacy: "war_diplomacy", war: "war_diplomacy", creator: "interventions", calendar: "clock", tech: "tech" };
  var domainOfCommand = (type) => COMMAND_DOMAIN[String(type).split(".")[0]] ?? null;
  function defineCommand(type, spec) {
    COMMANDS[type] = { mutates: true, phases: ["running"], control: false, checkpoint: true, domain: domainOfCommand(type), ...spec, type };
  }
  var clonePart = (civ3) => {
    const o = {};
    for (const k of SNAP_KEYS) if (k in civ3) o[k] = structuredClone(civ3[k]);
    return o;
  };
  function checkpoint(civ3) {
    return { part: clonePart(civ3), ev: civ3.events.length };
  }
  function rollback(w, cp) {
    const { civ: civ3 } = w;
    for (const k of SNAP_KEYS) {
      if (!(k in cp.part)) {
        delete civ3[k];
        continue;
      }
      const src = structuredClone(cp.part[k]), cur = civ3[k];
      if (Array.isArray(cur) && Array.isArray(src)) {
        cur.length = 0;
        cur.push(...src);
      } else if (cur && src && typeof cur === "object" && typeof src === "object" && !Array.isArray(cur)) {
        for (const x of Object.keys(cur)) delete cur[x];
        Object.assign(cur, src);
      } else civ3[k] = src;
    }
    civ3.events.length = cp.ev;
    w.rebuild();
  }
  var APPEND_ONLY = ["events", "works"];
  var checkpointFull = (civ3) => {
    const part = {}, lens = {}, order = Object.keys(civ3);
    for (const k of order) if (APPEND_ONLY.includes(k) && Array.isArray(civ3[k])) lens[k] = civ3[k].length;
    else part[k] = structuredClone(civ3[k]);
    return { order, part, lens };
  };
  function restoreInto(w, snap) {
    const { civ: civ3 } = w, keep = {};
    for (const k of Object.keys(snap.lens)) {
      civ3[k].length = snap.lens[k];
      keep[k] = civ3[k];
    }
    for (const k of Object.keys(civ3)) delete civ3[k];
    for (const k of snap.order) civ3[k] = k in keep ? keep[k] : structuredClone(snap.part[k]);
    w.rebuild();
  }
  function log(civ3, entry) {
    var _a;
    const L = (_a = civ3.wcde).log ?? (_a.log = []);
    L.push(entry);
    if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX);
  }
  function dispatch(w, cmd) {
    const { civ: civ3 } = w, W2 = civ3.wcde, spec = COMMANDS[cmd?.type];
    const fail4 = (error, code = "rejected") => {
      log(civ3, { at: civ3.monthIndex, type: cmd?.type, authority: cmd?.authority, ok: false, error, code });
      return { ok: false, error, code };
    };
    if (!spec) return fail4(`\u672A\u77E5\u306E\u547D\u4EE4: ${cmd?.type}`, "unknown");
    if (!Object.values(AUTHORITY).includes(cmd.authority)) return fail4(`\u672A\u77E5\u306E\u6A29\u9650: ${cmd.authority}`, "authority");
    if (!spec.authorities.includes(cmd.authority)) return fail4(`\u3053\u306E\u547D\u4EE4\u306F ${cmd.authority} \u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u8A31\u53EF: ${spec.authorities.join("\u30FB")}\uFF09`, "authority");
    if (cmd.commandId != null && W2.cmdIds.includes(cmd.commandId)) return { ok: true, duplicate: true };
    if (spec.mutates && w.viewPast != null) return fail4("\u904E\u53BB\u306E\u95B2\u89A7\u4E2D\u306F\u3001\u4E16\u754C\u3092\u5909\u3048\u308B\u547D\u4EE4\u3092\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u73FE\u5728\u3078\u623B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "past_view");
    if (!spec.phases.includes(W2.phase)) return fail4(`\u3053\u306E\u547D\u4EE4\u306F\u6BB5\u968E\u300C${spec.phases.join("\u30FB")}\u300D\u3067\u306E\u307F\u5B9F\u884C\u3067\u304D\u307E\u3059\uFF08\u73FE\u5728: ${W2.phase}\uFF09`, "phase");
    if (spec.control && cmd.authority === A.PLAYER) {
      const cs = W2.control.stateId;
      if (!cs) return fail4("\u62C5\u5F53\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u56FD\u5BB6\u3092\u62C5\u5F53\u3057\u3066\u304B\u3089\u547D\u4EE4\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "no_control");
      if (cmd.stateId == null) cmd = { ...cmd, stateId: cs };
      if (cmd.stateId !== cs) return fail4("\u62C5\u5F53\u56FD\u5BB6\u4EE5\u5916\u306B\u306F\u547D\u4EE4\u3067\u304D\u307E\u305B\u3093", "not_controlled");
    }
    const v = spec.validate?.(w, cmd);
    if (v && v.ok === false) return fail4(v.error);
    const cp = spec.mutates && spec.checkpoint !== false ? checkpoint(civ3) : null;
    let r;
    try {
      r = spec.apply(w, cmd);
    } catch (err) {
      if (cp) rollback(w, cp);
      log(civ3, { at: civ3.monthIndex, type: cmd.type, authority: cmd.authority, ok: false, error: String(err?.message ?? err), code: "exception" });
      return { ok: false, error: `\u547D\u4EE4\u306E\u9014\u4E2D\u3067\u5931\u6557\u3057\u305F\u305F\u3081\u3001\u3059\u3079\u3066\u53D6\u308A\u6D88\u3057\u307E\u3057\u305F: ${err?.message ?? err}`, code: "rolled_back" };
    }
    if (!r || r.ok === false) return fail4(r?.error ?? "\u5931\u6557", "rejected");
    if (cmd.commandId != null) {
      W2.cmdIds.push(cmd.commandId);
      if (W2.cmdIds.length > ID_MAX) W2.cmdIds.splice(0, W2.cmdIds.length - ID_MAX);
    }
    log(civ3, { at: civ3.monthIndex, type: cmd.type, authority: cmd.authority, ok: true, commandId: cmd.commandId ?? null });
    return { ok: true, result: r.result ?? r };
  }
  function safeAdvance(w, months, { chunk: chunk2 = 120, onProgress = null } = {}) {
    const { civ: civ3 } = w;
    let done2 = 0;
    while (done2 < months) {
      const n2 = Math.min(chunk2, months - done2), snap = checkpointFull(civ3);
      try {
        w.sim.advanceMonths(n2);
        done2 += n2;
        if (onProgress) onProgress(done2, months);
        continue;
      } catch (err) {
        restoreInto(w, snap);
        let ok2 = 0, msg = String(err?.message ?? err);
        try {
          for (; ok2 < n2; ok2++) w.sim.advanceMonth();
        } catch (e2) {
          msg = String(e2?.message ?? e2);
        }
        restoreInto(w, snap);
        if (ok2 > 0) w.sim.advanceMonths(ok2);
        civ3.wcde.diagnostics.push({ at: civ3.monthIndex, failedMonth: civ3.monthIndex + 1, message: msg });
        if (civ3.wcde.diagnostics.length > 50) civ3.wcde.diagnostics.shift();
        return { ok: false, advanced: done2 + ok2, error: msg, haltedAt: { ...civ3.date } };
      }
    }
    return { ok: true, advanced: done2, date: { ...civ3.date } };
  }

  // js/core/wcde/founding.js
  init_tech();
  init_spatial();
  var POLITY_CHOICES = { city_state: ["chiefdom", "tribal"], religious_polity: ["theocracy", "tribal"], agri_union: ["tribal", "chiefdom"], nomad_confederation: ["tribal", "chiefdom"] };
  var dominant2 = (g) => g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
  var MAX_SEEDS = 600;
  function listCandidates(w) {
    const { civ: civ3, sim } = w, ctx = sim.ctx;
    ctx._spatial = null;
    spatialOf(ctx);
    const seeds = Object.values(civ3.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)).slice(0, MAX_SEEDS), used = /* @__PURE__ */ new Set(), out = [];
    for (const g of seeds) {
      if (used.has(g.id)) continue;
      const f = evaluateFormation(ctx, g);
      if (!f || f.groupIds.some((i) => used.has(i))) continue;
      for (const i of f.groupIds) used.add(i);
      const gs = f.groupIds.map((i) => civ3.groups[i]), cap = gs.reduce((a, b) => b.pop > a.pop ? b : a), d = dominant2(cap);
      out.push({ via: f.via, viaJa: VIA[f.via].ja, groupIds: f.groupIds, seedGroupId: g.id, capitalGroupId: cap.id, cell: cap.cell, pop: Math.round(gs.reduce((s, x) => s + x.pop, 0)), cultureId: d.cultureId, languageId: languageOfGroup(cap), religionId: d.religionId, speciesId: cap.speciesId, polityOptions: (() => {
        const caps = groupCaps(civ3, cap), o = (POLITY_CHOICES[f.via] ?? ["tribal"]).filter((p) => !POLITY_CAP[p] || caps.has(POLITY_CAP[p]));
        return o.length ? o : ["tribal"];
      })() });
    }
    return out;
  }
  function refreshCandidates(w) {
    const { civ: civ3, sim } = w, prev = new Map((civ3.wcde.candidates ?? []).map((c) => [c.seedGroupId + "|" + c.via, c.id])), list = listCandidates(w);
    civ3.wcde.candidates = list.map((c) => ({ id: prev.get(c.seedGroupId + "|" + c.via) ?? sim.ctx.ids.next("candidate"), ...c }));
    return civ3.wcde.candidates;
  }
  function foundAsPlayer(w, { candidateId, name = null, polity = null }) {
    const { civ: civ3, sim } = w, ctx = sim.ctx, c = (civ3.wcde.candidates ?? []).find((x) => x.id === candidateId);
    if (!c) return { ok: false, error: "\u305D\u306E\u5019\u88DC\u306F\u3042\u308A\u307E\u305B\u3093" };
    const cap = civ3.groups[c.seedGroupId];
    if (!cap || cap.stateId) return { ok: false, error: "\u305D\u306E\u5019\u88DC\u306F\u6210\u7ACB\u3067\u304D\u306A\u304F\u306A\u3063\u3066\u3044\u307E\u3059\uFF08\u96C6\u56E3\u304C\u7121\u3044\u30FB\u3059\u3067\u306B\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u308B\uFF09" };
    ctx._spatial = null;
    const f = evaluateFormation(ctx, cap);
    if (!f || f.via !== c.via) return { ok: false, error: "\u305D\u306E\u5019\u88DC\u306F\u3001\u6761\u4EF6\u304C\u5909\u308F\u3063\u3066\u6210\u7ACB\u3057\u307E\u305B\u3093" };
    let nm = null;
    if (name != null) {
      nm = String(name).trim();
      if (!nm || nm.length > 30) return { ok: false, error: "\u56FD\u540D\u306F 1\u301C30 \u6587\u5B57" };
      if (Object.values(civ3.states).some((s) => s.alive && s.name === nm)) return { ok: false, error: "\u540C\u3058\u540D\u524D\u306E\u56FD\u304C\u3059\u3067\u306B\u3042\u308A\u307E\u3059" };
    }
    if (polity != null && !c.polityOptions.includes(polity)) return { ok: false, error: `\u3053\u306E\u6210\u7ACB\u7D4C\u8DEF\u3067\u9078\u3079\u308B\u653F\u4F53: ${c.polityOptions.join("\u30FB")}` };
    const st2 = formState(ctx, { ...f, player: true, name: nm, polity });
    if (!st2) return { ok: false, error: "\u56FD\u5BB6\u306E\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F" };
    invalidateMonthCaches(ctx);
    const r = takeControl(w, st2.id);
    if (!r.ok) return r;
    civ3.wcde.phase = "running";
    civ3.wcde.foundedAt = civ3.monthIndex;
    civ3.wcde.candidates = [];
    return { ok: true, stateId: st2.id };
  }
  function delegateToWorld(w) {
    const { civ: civ3 } = w;
    civ3.wcde.phase = "running";
    civ3.wcde.foundedAt = civ3.monthIndex;
    civ3.wcde.control.stateId = null;
    return { ok: true };
  }

  // js/core/wcde/techedit.js
  init_tech();
  var fail3 = (error, extra = {}) => ({ ok: false, error, ...extra });
  var log2 = (civ3, e) => {
    var _a;
    return ((_a = civ3.wcde).edits ?? (_a.edits = [])).push({ at: civ3.monthIndex, authority: "creator_intervention", ...e });
  };
  var refreshAll = (civ3) => {
    for (const id in civ3.groups) refreshCand(civ3.groups[id], civ3);
  };
  function planTechEdit(w, c) {
    const { civ: civ3 } = w, t = TECH[c.key];
    if (!t) return fail3("\u672A\u77E5\u306E\u6280\u8853");
    if (c.prereq !== void 0) {
      if (!Array.isArray(c.prereq) || c.prereq.some((p) => !TECH[p])) return fail3("\u524D\u63D0\u306B\u672A\u77E5\u306E\u6280\u8853\u304C\u3042\u308B");
      if (c.prereq.includes(c.key)) return fail3("\u81EA\u5206\u81EA\u8EAB\u3092\u524D\u63D0\u306B\u3067\u304D\u306A\u3044");
      const seen = /* @__PURE__ */ new Set(), stack = [...c.prereq];
      while (stack.length) {
        const k = stack.pop();
        if (k === c.key) return fail3("\u524D\u63D0\u304C\u5FAA\u74B0\u3059\u308B");
        if (seen.has(k)) continue;
        seen.add(k);
        stack.push(...prereqOf(civ3, TECH[k]));
      }
    }
    if (c.fx !== void 0 && (typeof c.fx !== "object" || Object.values(c.fx).some((v) => !Number.isFinite(v) || v < -1 || v > 3))) return fail3("\u52B9\u679C\u306F -1\u301C3 \u306E\u6570");
    if (c.caps !== void 0 && (!Array.isArray(c.caps) || c.caps.some((x) => typeof x !== "string"))) return fail3("\u89E3\u7981\u306F\u6587\u5B57\u5217\u306E\u914D\u5217");
    return { ok: true, impact: impactOf(civ3, c.key) };
  }
  function techEdit(w, c) {
    var _a, _b;
    const { civ: civ3 } = w, p = planTechEdit(w, c);
    if (!p.ok) return p;
    const i = p.impact;
    if ((i.holders || i.adopters || i.dependents.length) && !c.acknowledge) return fail3(`\u3053\u306E\u7DE8\u96C6\u306F\u3001\u4F9D\u5B58\u3059\u308B\u6280\u8853 ${i.dependents.length} \u4EF6\u30FB\u4FDD\u6709\u3059\u308B\u96C6\u56E3 ${i.holders}\u30FB\u63A1\u7528\u3059\u308B\u56FD\u5BB6 ${i.adopters} \u306B\u5F71\u97FF\u3057\u307E\u3059\u3002\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044`, { needsAck: true, impact: i });
    const o = (_a = civ3.techOverrides ?? (civ3.techOverrides = {}))[_b = c.key] ?? (_a[_b] = {});
    const before = { prereq: o.prereq ?? t0(c.key).prereq, fx: o.fx ?? t0(c.key).fx, caps: o.caps ?? t0(c.key).caps };
    if (c.prereq !== void 0) o.prereq = [...c.prereq];
    if (c.fx !== void 0) o.fx = { ...c.fx };
    if (c.caps !== void 0) o.caps = [...c.caps];
    refreshAll(civ3);
    log2(civ3, { targetId: c.key, property: "techtree", before, after: { prereq: o.prereq ?? before.prereq, fx: o.fx ?? before.fx, caps: o.caps ?? before.caps } });
    return { ok: true, impact: i };
  }
  var t0 = (k) => TECH[k];
  function techEditReset(w, { key }) {
    const { civ: civ3 } = w;
    if (!civ3.techOverrides?.[key]) return fail3("\u7DE8\u96C6\u3055\u308C\u3066\u3044\u306A\u3044");
    delete civ3.techOverrides[key];
    if (!Object.keys(civ3.techOverrides).length) delete civ3.techOverrides;
    refreshAll(civ3);
    log2(civ3, { targetId: key, property: "techtree", before: "edited", after: "default" });
    return { ok: true };
  }
  function techGrant(w, c) {
    var _a, _b, _c, _d;
    const { civ: civ3 } = w, t = TECH[c.key];
    if (!t) return fail3("\u672A\u77E5\u306E\u6280\u8853");
    const mode = c.mode === "revoke" ? "revoke" : "grant";
    const groups = c.stateId ? Object.values(civ3.groups).filter((g) => g.stateId === c.stateId) : (c.groupIds ?? []).map((id) => civ3.groups[id]).filter(Boolean);
    if (!groups.length) return fail3("\u5BFE\u8C61\u306E\u96C6\u56E3\u304C\u306A\u3044");
    const mi = civ3.monthIndex;
    let n2 = 0;
    if (mode === "grant") {
      for (const g of groups) if (g.tech.known[t.key] == null) {
        const miss = prereqOf(civ3, t).filter((p) => g.tech.known[p] == null);
        if (miss.length) return fail3(`\u524D\u63D0\u306E\u6280\u8853\u304C\u8DB3\u308A\u306A\u3044\u96C6\u56E3\u304C\u3042\u308B: ${miss.map((p) => TECH[p].name).join("\u30FB")}\uFF08\u524D\u63D0\u304B\u3089\u4ED8\u4E0E\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
      }
    } else {
      const deps = TECHS.filter((u) => prereqOf(civ3, u).includes(t.key) && groups.some((g) => g.tech.known[u.key] != null));
      if (deps.length && !c.acknowledge) return fail3(`${deps.map((u) => u.name).join("\u30FB")}\u3092\u4FDD\u6709\u3059\u308B\u96C6\u56E3\u304C\u3042\u308B\u3002\u524D\u63D0\u3092\u5265\u596A\u3059\u308B\u3068\u3001\u305D\u308C\u3089\u306E\u6A5F\u80FD\u304C\u52A3\u5316\u3057\u307E\u3059\u3002\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044`, { needsAck: true, impact: { dependents: deps.map((u) => u.key) } });
    }
    for (const g of groups) {
      if (mode === "grant" && g.tech.known[t.key] == null) {
        g.tech.known[t.key] = mi;
        delete g.tech.lost[t.key];
        refreshCand(g, civ3);
        n2++;
      } else if (mode === "revoke" && g.tech.known[t.key] != null) {
        delete g.tech.known[t.key];
        g.tech.lost[t.key] = true;
        refreshCand(g, civ3);
        n2++;
      }
    }
    if (c.stateId && mode === "revoke") {
      const st2 = civ3.states[c.stateId];
      if (st2 && st2.techAdopted[t.key] != null) delete st2.techAdopted[t.key];
    }
    if (c.stateId && mode === "grant" && c.institutionalize) {
      const st2 = civ3.states[c.stateId];
      if (st2) (_a = st2.techAdopted)[_b = t.key] ?? (_a[_b] = mi);
    }
    const rec = (_c = civ3.techWorld)[_d = t.key] ?? (_c[_d] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} });
    if (mode === "grant") {
      rec.spread += n2;
      rec.byChannel.creator = (rec.byChannel.creator ?? 0) + n2;
    }
    log2(civ3, { targetId: c.stateId ?? groups.map((g) => g.id).slice(0, 5).join(","), property: `tech.${t.key}`, before: mode === "grant" ? null : "known", after: mode === "grant" ? "known" : null, count: n2 });
    return { ok: true, changed: n2 };
  }

  // js/core/wcde/commands.js
  var ALL = ["prehistory", "founding", "running"];
  var registered = false;
  function registerCommands() {
    if (registered) return;
    registered = true;
    defineCommand("founding.found", { authorities: [AUTHORITY.PLAYER], phases: ["founding"], apply: (w, c) => foundAsPlayer(w, c) });
    defineCommand("founding.delegate", { authorities: [AUTHORITY.ADMIN], phases: ["founding"], apply: (w) => delegateToWorld(w) });
    defineCommand("founding.refresh", { authorities: [AUTHORITY.ADMIN], phases: ["founding"], apply: (w) => ({ ok: true, candidates: refreshCandidates(w) }) });
    defineCommand("control.take", { authorities: [AUTHORITY.ADMIN], apply: (w, c) => takeControl(w, c.stateId) });
    defineCommand("control.release", { authorities: [AUTHORITY.ADMIN], apply: (w) => releaseControl(w) });
    defineCommand("time.advance", { authorities: [AUTHORITY.ADMIN], checkpoint: false, validate: (w, c) => timeOf(w.civ).hold ? { ok: false, error: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061\u3067\u3059\uFF08OK \u3092\u62BC\u3059\u307E\u3067\u6642\u9593\u306F\u9032\u307F\u307E\u305B\u3093\uFF09" } : Number.isInteger(c.months) && c.months >= 1 && c.months <= 12e4 ? null : { ok: false, error: "months \u306F 1\u301C120000 \u306E\u6574\u6570" }, apply: (w, c) => {
      const r = safeAdvance(w, c.months);
      skipNews(w.civ);
      return r.ok ? { ok: true, ...r } : { ok: false, error: `${r.error}\uFF08${r.haltedAt.year}\u5E74${r.haltedAt.month}\u6708\u3067\u505C\u6B62\uFF09`, ...r };
    } });
    defineCommand("clock.run", { authorities: [AUTHORITY.ADMIN], checkpoint: false, validate: (w, c) => Number.isInteger(c.months) && c.months >= 1 && c.months <= 240 ? null : { ok: false, error: "months \u306F 1\u301C240 \u306E\u6574\u6570" }, apply: (w, c) => {
      const r = clockRun(w, c.months);
      return r.ok ? r : { ...r, ok: false };
    } });
    defineCommand("clock.setSpeed", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, apply: (w, c) => setSpeed(w, c) });
    defineCommand("news.ack", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, apply: (w, c) => ackNews(w, c) });
    defineCommand("view.past", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, validate: (w, c) => c.month == null || Number.isInteger(c.month) && c.month <= w.civ.monthIndex ? null : { ok: false, error: "month \u306F\u73FE\u5728\u4EE5\u524D\u306E\u6574\u6570\u3001\u307E\u305F\u306F null\uFF08\u73FE\u5728\u3078\u623B\u308B\uFF09" }, apply: (w, c) => {
      w.viewPast = c.month ?? null;
      return { ok: true };
    } });
    defineCommand("state.act", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const r = w.sim.command({ type: "stateAction", stateId: c.stateId, action: c.action, target: c.target ?? null, opt: c.opt ?? null });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("diplomacy.peace", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId], war = w.civ.wars[c.warId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = negotiatePeace(w.sim.ctx, st2, war, { terms: c.terms });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("war.direct", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId], war = w.civ.wars[c.warId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      if (!war) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u3042\u308A\u307E\u305B\u3093" };
      const r = directWar(w.sim.ctx, st2, war, { posture: c.posture ?? null, commit: c.commit ?? null, focus: c.focus });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("state.reorganize", { authorities: [AUTHORITY.PLAYER, AUTHORITY.CREATOR], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      return reorganize(w.sim.ctx, st2, c.shares);
    } });
    defineCommand("state.adoptDoctrine", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = adoptDoctrine(w.sim.ctx, st2, c.doctrineId ?? c.id, { provenance: "player" });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.reason };
    } });
    defineCommand("creator.editState", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => creatorEditState(w, c) });
    defineCommand("creator.rename", { authorities: [AUTHORITY.CREATOR], phases: ["founding", "running"], apply: (w, c) => creatorRename(w, c) });
    defineCommand("creator.intervene", { authorities: [AUTHORITY.CREATOR], validate: (w, c) => {
      const p = planIntervention(w, c);
      return p.ok ? null : p;
    }, apply: (w, c) => createIntervention(w, c) });
    defineCommand("tech.preview", { authorities: [AUTHORITY.CREATOR], mutates: false, phases: ALL, apply: (w, c) => planTechEdit(w, c) });
    defineCommand("creator.techEdit", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techEdit(w, c) });
    defineCommand("creator.techEditReset", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techEditReset(w, c) });
    defineCommand("creator.techGrant", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techGrant(w, c) });
    defineCommand("creator.catastrophe", { authorities: [AUTHORITY.CREATOR], validate: (w, c) => {
      const p = planCatastrophe(w, c);
      return p.ok ? null : p;
    }, apply: (w, c) => createCatastrophe(w, c) });
    defineCommand("creator.cancelIntervention", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => cancelIntervention(w, c) });
    defineCommand("calendar.edit", { authorities: [AUTHORITY.ADMIN, AUTHORITY.CREATOR], phases: ALL, apply: (w, c) => {
      const r = applyDisplayEdit(w.civ.wcde.config.calendar, c.edit ?? {});
      if (r.errors.length) return { ok: false, error: r.errors.join(" / ") };
      w.civ.wcde.config.calendar = r.calendar;
      return { ok: true };
    } });
  }

  // js/core/wcde/world.js
  init_civ_state();
  function createNewWorld(input, { generate = generateWorld, historySeed = null, stepYears, onProgress = null } = {}) {
    registerCommands();
    const { config, errors } = normalizeWorldConfig(input);
    if (errors.length) return { ok: false, errors };
    onProgress?.("\u5730\u7406", 0);
    const world = generate(config.spec);
    onProgress?.("\u5730\u7406", 1);
    const civ3 = createWcdeCiv(world, config, { historySeed: historySeed ?? hashSeed(config.worldSeed, "history", config.schema) });
    onProgress?.("\u5148\u53F2", 0);
    const stats = runPrehistory(world, civ3, { stepYears, onProgress: (s, n2) => onProgress?.("\u5148\u53F2", s / n2) });
    onProgress?.("\u5148\u53F2", 1);
    finalizeLanguages(civ3);
    defineReligions({ civ: civ3 });
    const w = createWcde(world, civ3);
    const candidates = refreshCandidates(w);
    return { ok: true, w, errors: [], report: { prehistory: stats, candidates: candidates.length } };
  }
  var defaultGenerate = generateWorld;
  var formatWorldDate = (w, mi = w.civ.monthIndex) => formatDate(w.civ.wcde.config.calendar, mi);

  // js/ui/v6/common.js
  var SVG = "http://www.w3.org/2000/svg";
  var h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  var sv = (tag, props = {}, ...kids) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  var pct = (x) => Math.round(x * 100) + "%";
  var n0 = (x) => Math.round(x).toLocaleString("ja-JP");
  var r23 = (x) => Math.round(x * 100) / 100;
  var hash = (s) => {
    let x = 2166136261;
    for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    return x >>> 0;
  };
  var PALETTE = [[6, 64, 62], [176, 46, 48], [46, 78, 60], [268, 44, 66], [100, 42, 52], [212, 58, 62], [330, 52, 64], [28, 70, 58], [148, 40, 46], [240, 44, 70], [62, 56, 52], [290, 36, 60], [190, 52, 56], [14, 42, 48], [130, 34, 62], [52, 62, 70], [224, 40, 50], [350, 54, 54], [82, 50, 62], [258, 38, 56], [36, 46, 66], [168, 36, 62], [306, 44, 70], [200, 44, 40]];
  var REG = /* @__PURE__ */ new Map();
  var USE = new Array(PALETTE.length).fill(0);
  var pdist = (a, b) => {
    const A2 = PALETTE[a], B = PALETTE[b], dh = Math.abs(A2[0] - B[0]), h2 = Math.min(dh, 360 - dh) / 180;
    return h2 + 0.6 * Math.abs(A2[2] - B[2]) / 30 + 0.3 * Math.abs(A2[1] - B[1]) / 40;
  };
  var hasColor = (id) => REG.has(id);
  function resetColors() {
    REG.clear();
    USE.fill(0);
  }
  function assignColors(ids, adj) {
    for (const id of ids) {
      if (REG.has(id)) continue;
      const near = [...adj.get(id) ?? []].map((n2) => REG.get(n2)).filter((x) => x != null);
      let best = 0, bs = -1e9;
      for (let i = 0; i < PALETTE.length; i++) {
        const sep = near.length ? Math.min(...near.map((j) => pdist(i, j))) : 9, sc = Math.min(sep, 1.2) * 10 - USE[i] * 1.5;
        if (sc > bs + 1e-9) {
          bs = sc;
          best = i;
        }
      }
      REG.set(id, best);
      USE[best]++;
    }
  }
  var colorOf = (id, l) => {
    const i = REG.get(id);
    if (i != null) {
      const p = PALETTE[i];
      return `hsl(${p[0]} ${p[1]}% ${l ?? p[2]}%)`;
    }
    return `hsl(${hash(id) % 360} 48% ${l ?? 56}%)`;
  };
  var POLITY_JA = { tribal: "\u90E8\u65CF\u9023\u5408", chiefdom: "\u9996\u9577\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", federation: "\u9023\u90A6\u5236", confederation: "\u9023\u5408" };
  var polityJa = (p) => POLITY_JA[p] ?? p ?? "\u2014";
  var lb = (ja, en) => h("div", { class: "lb" }, ja, en ? h("em", {}, en) : null);
  var stat = (label, value, unit = "") => h("div", {}, h("small", {}, label), h("b", {}, value), unit ? h("i", {}, unit) : null);
  var btn = (label, onclick, cls = "", props = {}) => h("button", { class: "b " + cls, onclick, ...props }, label);
  var table = (head2, rows, cls = "") => h("table", { class: "tb " + cls, style: "width:100%;border-collapse:collapse;font-size:12px" }, h("thead", {}, h("tr", {}, ...head2.map((x) => h("th", { style: "text-align:left;font-weight:400;color:var(--dim);border-bottom:1px solid var(--line);padding:3px 4px" }, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { style: "border-bottom:1px solid #262a31;padding:3px 4px" }, c))))));
  function face(name, stateId) {
    const k = hash(name + stateId), sk = ["#e0b79a", "#c99a76", "#a87654", "#f0cfb5"][k % 4], hr = ["#2a2420", "#6b4a2f", "#9a9a9a", "#4a3020"][(k >> 3) % 4], st2 = (k >> 6) % 4, c = colorOf(stateId, 45);
    let g = `<rect width="64" height="64" fill="#1b1f26"/><path d="M6 64Q8 46 32 44Q56 46 58 64Z" fill="${c}" fill-opacity=".8"/><rect x="28" y="38" width="8" height="8" fill="${sk}"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="${sk}"/>`;
    if (st2 === 1) g += `<path d="M18 30Q14 10 32 10Q50 10 46 30L46 44L42 44L42 24Q32 14 22 24L22 44L18 44Z" fill="${hr}"/>`;
    else {
      g += `<path d="M19 26Q18 11 32 11Q46 11 45 26Q41 18 32 18Q23 18 19 26Z" fill="${hr}"/>`;
      if (st2 === 2) g += `<path d="M21 31Q32 48 43 31Q43 40 32 42Q21 40 21 31Z" fill="${hr}"/>`;
      if (st2 === 3) g += `<path d="M20 13L24 6L28 12L32 5L36 12L40 6L44 13Z" fill="#b59a74"/>`;
    }
    g += `<circle cx="27" cy="27" r="1.4" fill="#222"/><circle cx="37" cy="27" r="1.4" fill="#222"/><path d="M28 34Q32 36 36 34" stroke="#7a4a3a" fill="none"/>`;
    const e = sv("svg", { viewBox: "0 0 64 64", width: 64, height: 64 });
    e.innerHTML = g;
    return e;
  }
  function donut(items, cols) {
    const tot = items.reduce((a, x) => a + x[1], 0) || 1, r = 36, C = 2 * Math.PI * r;
    let o = 0;
    const e = sv("svg", { viewBox: "0 0 120 120", width: 116, height: 116 });
    items.forEach((v, i) => {
      const l = v[1] / tot * C;
      e.append(sv("circle", { cx: 60, cy: 60, r, fill: "none", stroke: cols[i % cols.length], "stroke-width": 20, "stroke-dasharray": `${l} ${C - l}`, "stroke-dashoffset": -o, transform: "rotate(-90 60 60)" }));
      o += l;
    });
    e.append(sv("text", { x: 60, y: 65, "text-anchor": "middle", "font-size": 14, fill: "#d9d6cc" }, n0(tot)));
    return e;
  }
  function hemi(factions, cols) {
    const rows = [8, 12, 16, 20, 24, 20], pts = [];
    rows.forEach((c, i) => {
      const r = 36 + i * 12;
      for (let k = 0; k < c; k++) {
        const a = Math.PI * (1 - (k + 0.5) / c);
        pts.push([a, 100 + r * Math.cos(a), 100 - r * Math.sin(a)]);
      }
    });
    pts.sort((a, b) => b[0] - a[0]);
    const tot = factions.reduce((a, f) => a + f[1], 0) || 1, e = sv("svg", { viewBox: "0 0 200 108", width: "100%" });
    let idx = 0;
    factions.forEach((f, fi) => {
      const n2 = Math.round(f[1] / tot * pts.length);
      for (let k = 0; k < n2 && idx < pts.length; k++) {
        const p = pts[idx++];
        e.append(sv("circle", { cx: p[1].toFixed(1), cy: p[2].toFixed(1), r: 3.6, fill: cols[fi % cols.length] }));
      }
    });
    return e;
  }
  var FACTION_JA = { nobility: "\u8CB4\u65CF", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846", bureaucrats: "\u5B98\u50DA", artisans: "\u8077\u4EBA", clans: "\u904A\u7267\u6C0F\u65CF" };
  var FACTION_COL = { nobility: "#a58bd0", clergy: "#d8b45a", merchants: "#6fa8c9", military: "#d0605a", commoners: "#9fbf8a", bureaucrats: "#8fb3b0", artisans: "#c99a6f", clans: "#b0a070" };
  function vlist(rows, rowH, renderRow) {
    const box = h("div", { class: "vlist" }), spacer = h("div", { style: `height:${rows.length * rowH}px` }), win = h("div", { style: "position:absolute;left:0;right:0;top:0" });
    box.append(spacer, win);
    const paint = () => {
      const a = Math.max(0, Math.floor(box.scrollTop / rowH) - 4), b = Math.min(rows.length, a + Math.ceil(box.clientHeight / rowH || 40) + 10);
      win.style.top = a * rowH + "px";
      win.replaceChildren(...rows.slice(a, b).map((r, i) => {
        const el = renderRow(r, a + i);
        el.style.height = rowH + "px";
        return el;
      }));
    };
    box.addEventListener("scroll", paint);
    setTimeout(paint, 0);
    box.__paint = paint;
    return box;
  }

  // js/ui/v6/main.js
  init_tech();

  // js/ui/dom.js
  function byId(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`\u8981\u7D20 #${id} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08index.html \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
    return el;
  }

  // js/ui/banner.js
  var AUTO_DISMISS_MS = 5e3;
  var LONG_ERROR = 120;
  function initBanner({ store, actions, persistLongError = false }) {
    const banner = byId("banner");
    const body = byId("banner-body");
    const loading = byId("loading");
    const loadingText = byId("loading-text");
    const empty = byId("empty-state");
    byId("banner-close").addEventListener("click", () => actions.dismissMessage());
    let dismissTimer = 0;
    let lastKey = null;
    store.subscribe((s) => {
      empty.hidden = !!s.map;
      loading.hidden = !s.busy;
      if (s.busy) loadingText.textContent = s.busy;
      banner.classList.remove("info");
      let key = null;
      if (s.error) {
        banner.hidden = false;
        banner.classList.remove("warn");
        body.textContent = s.error;
        key = `error:${s.error}`;
      } else if (s.warnings?.length) {
        banner.hidden = false;
        banner.classList.add("warn");
        const shown = s.warnings.slice(0, 5).map((w) => `\u30FB${w}`).join("\n");
        const more = s.warnings.length > 5 ? `
\u2026\u307B\u304B ${s.warnings.length - 5} \u4EF6` : "";
        body.textContent = `\u8AAD\u307F\u8FBC\u307F\u306F\u5B8C\u4E86\u3057\u307E\u3057\u305F\u304C\u3001\u6CE8\u610F\u304C\u3042\u308A\u307E\u3059\uFF08${s.warnings.length}\u4EF6\uFF09
${shown}${more}`;
        key = `warn:${s.warnings.length}`;
      } else if (s.notice) {
        banner.hidden = false;
        banner.classList.remove("warn");
        banner.classList.add("info");
        body.textContent = s.notice;
        key = `notice:${s.notice}`;
      } else {
        banner.hidden = true;
      }
      if (key !== lastKey) {
        lastKey = key;
        clearTimeout(dismissTimer);
        if (key && !(persistLongError && key.startsWith("error:") && key.length > LONG_ERROR)) dismissTimer = setTimeout(() => actions.dismissMessage(), AUTO_DISMISS_MS);
      }
    });
  }

  // js/ui/v6/notify.js
  var subs = [];
  var st = { error: null, warnings: [], notice: null, busy: null, map: true };
  var emit = () => subs.forEach((f) => f(st));
  var ready = false;
  function initNotify() {
    if (ready || typeof document === "undefined" || !document.getElementById("banner")) return;
    ready = true;
    initBanner({ store: { subscribe: (f) => {
      subs.push(f);
      f(st);
    } }, actions: { dismissMessage: () => {
      st.error = null;
      st.warnings = [];
      st.notice = null;
      emit();
    } }, persistLongError: true });
  }
  function notify(kind, message) {
    st.error = null;
    st.warnings = [];
    st.notice = null;
    if (kind === "error") st.error = String(message);
    else st.notice = (kind === "warn" ? "\u6CE8\u610F: " : "") + String(message);
    emit();
  }

  // js/ui/v6/store.js
  var S2 = { w: null, hub: null, sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", tl: { type: "events", kind: "", text: "", entity: "", from: "", to: "" }, fileWarn: [], layerOpen: null, war: null, entity: { culture: null, language: null, religion: null }, tech: null, doc: null, fin: false, hooks: {} };
  var LABEL = { "state.act": "\u56FD\u5BB6\u306E\u884C\u52D5", "state.reorganize": "\u7DE8\u5236\u306E\u5909\u66F4", "state.adoptDoctrine": "\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u53D6\u5F97", "diplomacy.peace": "\u8B1B\u548C\u306E\u7533\u3057\u5165\u308C", "war.direct": "\u6226\u4E89\u306E\u65B9\u91DD\u306E\u6307\u793A", "creator.intervene": "\u4ECB\u5165", "creator.catastrophe": "\u707D\u5384", "creator.editState": "\u56FD\u5BB6\u306E\u7DE8\u96C6", "creator.rename": "\u540D\u524D\u306E\u7DE8\u96C6", "creator.cancelIntervention": "\u4ECB\u5165\u306E\u53D6\u308A\u6D88\u3057", "control.take": "\u56FD\u5BB6\u306E\u62C5\u5F53", "control.release": "\u62C5\u5F53\u306E\u89E3\u9664", "calendar.edit": "\u66A6\u306E\u8868\u793A\u540D\u306E\u5909\u66F4", "creator.techGrant": "\u6280\u8853\u306E\u4ED8\u4E0E" };
  var tell = (c, r, quiet) => {
    const n2 = LABEL[c.type] ?? c.type;
    if (!r.ok) notify("error", `${n2}\u306B\u5931\u6557: ${r.error ?? "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`);
    else if (!quiet && LABEL[c.type]) notify("ok", `${n2}\u3092\u5B9F\u884C\u3057\u307E\u3057\u305F`);
  };
  var run = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.ADMIN, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    if (!r.ok && !["clock.run", "clock.setSpeed", "news.ack"].includes(c.type)) tell(c, r);
    else if (r.ok && LABEL[c.type]) tell(c, r);
    return r;
  };
  var act = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.PLAYER, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    tell(c, r);
    S2.hooks.render?.();
    return r;
  };
  var creator = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.CREATOR, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    tell(c, r);
    S2.hooks.render?.();
    return r;
  };
  var stateName = (id) => S2.w.civ.states[id]?.name ?? id;
  var aliveStates = () => Object.values(S2.w.civ.states).filter((s) => s.alive);
  var controlled = () => S2.w.civ.wcde.control.stateId;

  // js/ui/v6/map.js
  init_archive();

  // js/ui/v6/terrain.js
  var TAU2 = Math.PI * 2;
  var clamp16 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  var css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  function ramp(stops) {
    const S3 = stops.map(([t, c]) => [t, hex(c)]);
    return (t) => {
      if (!(t > S3[0][0])) return css(S3[0][1]);
      for (let i = 1; i < S3.length; i++) if (t <= S3[i][0]) {
        const [t02, a] = S3[i - 1], [t1, b] = S3[i], f = (t - t02) / (t1 - t02 || 1);
        return css([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      }
      return css(S3[S3.length - 1][1]);
    };
  }
  var RAMPS = {
    // 陸の標高（m）: 低地の緑 → 黄 → 茶 → 灰 → 雪
    land: ramp([[0, "#5a9a52"], [120, "#78a853"], [400, "#a9b95e"], [800, "#d3c46f"], [1400, "#cba867"], [2200, "#a98260"], [3300, "#8d7d72"], [4600, "#c7c4c0"], [6500, "#f7f6f3"]]),
    // 水深（m, 正の値）: 浅い青緑 → 深い藍
    sea: ramp([[0, "#6fbfd0"], [150, "#58a5c4"], [800, "#3f82b0"], [2200, "#2c5f93"], [4200, "#204878"], [6200, "#173560"]]),
    temp: ramp([[-30, "#6a4aa6"], [-15, "#4f7fcf"], [-3, "#86c9ea"], [7, "#93d6b0"], [15, "#d8e68e"], [22, "#f4d06c"], [28, "#ef9a4d"], [35, "#d4503d"]]),
    precip: ramp([[0, "#f4e8b8"], [250, "#e6d68c"], [700, "#a6d19b"], [1500, "#52a9a6"], [2500, "#3b82b8"], [4e3, "#2c509c"]]),
    pop: ramp([[0, "#fff1bf"], [0.22, "#ffd878"], [0.5, "#f7a84c"], [0.78, "#e2653b"], [1, "#a22f3b"]])
  };
  var BIOME_COLORS = ["#3f82b0", "#e9f2f5", "#aebb9f", "#4f7f5a", "#62ab5c", "#bcd67f", "#ebd291", "#c9c3a3", "#d6c670", "#8fc352", "#2f9c56", "#aaa69f", "#4ea594", "#5aa9c6"];
  var BIOME_JA = ["\u6D77", "\u6C37\u96EA", "\u30C4\u30F3\u30C9\u30E9", "\u30BF\u30A4\u30AC", "\u6E29\u5E2F\u6797", "\u8349\u539F", "\u71B1\u5E2F\u7802\u6F20", "\u5BD2\u51B7\u7802\u6F20", "\u30B5\u30D0\u30F3\u30CA", "\u71B1\u5E2F\u5B63\u7BC0\u6797", "\u71B1\u5E2F\u96E8\u6797", "\u9AD8\u5C71", "\u6E7F\u5730", "\u6E56"];
  var LAND_BASE = "#c9c3a6";
  var LAKE_COLOR = "#5aa9c6";
  function hash01(a, b = 0, c = 0) {
    let h2 = Math.imul(a ^ 2654435769, 2246822507) ^ Math.imul(b + 2135587861 | 0, 3266489909) ^ Math.imul(c + 374761393 | 0, 668265263);
    h2 ^= h2 >>> 15;
    h2 = Math.imul(h2, 739982445);
    h2 ^= h2 >>> 12;
    h2 = Math.imul(h2, 695872825);
    h2 ^= h2 >>> 15;
    return (h2 >>> 0) / 4294967296;
  }
  var LEVELS = 3;
  var JITTER = 0.17;
  var FRACT = 0.24;
  var Geo = class {
    constructor(mesh) {
      this.mesh = mesh;
      const N2 = mesh.cellCount, T3 = mesh.vertexXYZ.length / 3;
      this.N = N2;
      this.T = T3;
      const X = mesh.vertexXYZ, vlon = new Float32Array(T3), vlat = new Float32Array(T3);
      for (let v = 0; v < T3; v++) {
        vlon[v] = Math.atan2(X[3 * v + 1], X[3 * v]);
        vlat[v] = Math.asin(clamp16(X[3 * v + 2], -1, 1));
      }
      this.vlon = vlon;
      this.vlat = vlat;
      const C = mesh.centerXYZ, cen = new Float32Array(N2 * 2);
      for (let c = 0; c < N2; c++) {
        cen[2 * c] = Math.atan2(C[3 * c + 1], C[3 * c]);
        cen[2 * c + 1] = Math.asin(clamp16(C[3 * c + 2], -1, 1));
      }
      this.cen = cen;
      this.W = 0;
      this.H = 0;
      const off = mesh.neighborOffsets, nb = mesh.neighborIds, vo = mesh.cellVertexOffsets, vi = mesh.cellVertexIds, sv2 = new Int32Array(2 * nb.length).fill(-1);
      for (let c = 0; c < N2; c++) for (let k = off[c]; k < off[c + 1]; k++) {
        const n2 = nb[k];
        let f = 0;
        for (let a = vo[c]; a < vo[c + 1] && f < 2; a++) {
          const v = vi[a];
          for (let b = vo[n2]; b < vo[n2 + 1]; b++) if (vi[b] === v) {
            sv2[2 * k + f++] = v;
            break;
          }
        }
      }
      this.slotVerts = sv2;
    }
    /** 幅 W（高さは W/2）の画面に合わせて、頂点の位置と辺・区画の形を作り直す */
    build(W2, H) {
      if (this.W === W2 && this.H === H) return;
      this.W = W2;
      this.H = H;
      this.ec = /* @__PURE__ */ new Map();
      this.cp = null;
      this.land = null;
      const T3 = this.T, VX = new Float32Array(T3), VY = new Float32Array(T3), cellPx = Math.sqrt(W2 * H / this.N);
      for (let v = 0; v < T3; v++) {
        const a = hash01(v, 1) * TAU2, r = JITTER * cellPx * (0.4 + 0.6 * hash01(v, 2));
        VX[v] = (this.vlon[v] + Math.PI) / TAU2 * W2 + Math.cos(a) * r;
        VY[v] = (Math.PI / 2 - this.vlat[v]) / Math.PI * H + Math.sin(a) * r;
      }
      this.VX = VX;
      this.VY = VY;
      this.cellPx = cellPx;
    }
    proj(lon, lat) {
      return [(lon + Math.PI) / TAU2 * this.W, (Math.PI / 2 - lat) / Math.PI * this.H];
    }
    /** 辺 a→b の折れ線 [x0,y0,x1,y1,…]。x は a の位置を基準に、b を ±W だけずらしてつなげたもの */
    edge(a, b) {
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * this.T + hi;
      let p = this.ec.get(key);
      if (!p) {
        p = this._mk(lo, hi);
        this.ec.set(key, p);
      }
      if (a === lo) return p;
      const n2 = p.length / 2, q2 = new Float32Array(p.length);
      for (let i = 0; i < n2; i++) {
        q2[2 * i] = p[2 * (n2 - 1 - i)];
        q2[2 * i + 1] = p[2 * (n2 - 1 - i) + 1];
      }
      return q2;
    }
    _mk(lo, hi) {
      const W2 = this.W, n2 = 1 << LEVELS, pts = new Float32Array((n2 + 1) * 2), x1 = this.VX[lo], y1 = this.VY[lo];
      let x2 = this.VX[hi];
      const y2 = this.VY[hi];
      x2 += W2 * Math.round((x1 - x2) / W2);
      pts[0] = x1;
      pts[1] = y1;
      pts[2 * n2] = x2;
      pts[2 * n2 + 1] = y2;
      const sub2 = (i0, i1, lvl, node) => {
        if (lvl === LEVELS) return;
        const im = i0 + i1 >> 1, ax = pts[2 * i0], ay = pts[2 * i0 + 1], bx = pts[2 * i1], by = pts[2 * i1 + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, r = (hash01(lo, hi, node) - 0.5) * 2 * FRACT * len;
        pts[2 * im] = (ax + bx) / 2 - dy / len * r;
        pts[2 * im + 1] = (ay + by) / 2 + dx / len * r;
        sub2(i0, im, lvl + 1, node * 2);
        sub2(im, i1, lvl + 1, node * 2 + 1);
      };
      sub2(0, n2, 0, 1);
      return pts;
    }
    /** 折れ線 pts（x,y の並び）を path に加える。画面の左右端をまたぐものは ±W の写しも加える。close=true で閉じる */
    addPoly(path, pts, close) {
      const W2 = this.W, n2 = pts.length / 2;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < n2; i++) {
        const x = pts[2 * i];
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      for (const dx of [0, W2, -W2]) {
        if (hi + dx < 0 || lo + dx > W2) continue;
        path.moveTo(pts[0] + dx, pts[1]);
        for (let i = 1; i < n2; i++) path.lineTo(pts[2 * i] + dx, pts[2 * i + 1]);
        if (close) path.closePath();
      }
    }
    /** 区画 c の輪郭（共有する辺を使うので、隣と必ず一致する）。極を囲む区画は、画面の上端・下端まで伸ばして閉じる */
    ring(c) {
      const m = this.mesh, vo = m.cellVertexOffsets, vi = m.cellVertexIds, a0 = vo[c], cnt = vo[c + 1] - a0, W2 = this.W, H = this.H, out = [];
      let lastX = 0, lastY = 0, firstX = 0, latSum = 0;
      for (let i = 0; i < cnt; i++) {
        const va = vi[a0 + i], vb = vi[a0 + (i + 1) % cnt], e = this.edge(va, vb), n2 = e.length / 2;
        latSum += this.vlat[va];
        const shift = i === 0 ? 0 : Math.round((lastX - e[0]) / W2) * W2;
        for (let j = i === 0 ? 0 : 1; j < n2; j++) out.push(e[2 * j] + shift, e[2 * j + 1]);
        lastX = e[2 * (n2 - 1)] + shift;
        lastY = e[2 * (n2 - 1) + 1];
        if (i === 0) firstX = e[0];
      }
      const wraps = Math.round((lastX - firstX) / W2);
      if (wraps !== 0) {
        const yEdge = latSum > 0 ? -2 : H + 2;
        out.push(lastX, yEdge, firstX, yEdge);
      }
      return out;
    }
    /** 全区画の Path2D（初回に作り、W が変わるまで使い回す）と、陸（海でない区画）をまとめた Path2D */
    paths(isSea) {
      if (this.cp && this.cpSea === isSea) return this.cp;
      const N2 = this.N, cp = new Array(N2), land = new Path2D();
      for (let c = 0; c < N2; c++) {
        const p = new Path2D(), pts = this.ring(c);
        this.addPoly(p, pts, true);
        cp[c] = p;
        if (!isSea[c]) this.addPoly(land, pts, true);
      }
      this.cp = cp;
      this.cpSea = isSea;
      this.land = land;
      return cp;
    }
    /** 隣接スロット k の辺を path に加える（c 側から見た向き） */
    addSlot(path, k) {
      const v = this.slotVerts;
      if (v[2 * k] < 0 || v[2 * k + 1] < 0) return;
      this.addPoly(path, this.edge(v[2 * k], v[2 * k + 1]), false);
    }
    /** 条件 pred(c, n) を満たす隣接ペア（c の側から見る）の境界線を 1 つの Path2D にまとめる。cells: 見る区画（省略で全部） */
    edgesWhere(pred, cells) {
      const m = this.mesh, off = m.neighborOffsets, nb = m.neighborIds, p = new Path2D(), it = cells ?? { [Symbol.iterator]: function* () {
        for (let c = 0; c < m.cellCount; c++) yield c;
      } };
      for (const c of it) for (let k = off[c]; k < off[c + 1]; k++) if (pred(c, nb[k])) this.addSlot(p, k);
      return p;
    }
  };
  function hillshade(geo, elevation, isSea) {
    const m = geo.mesh, N2 = geo.N, off = m.neighborOffsets, nb = m.neighborIds, cen = geo.cen, sh = new Float32Array(N2), spacing = Math.sqrt(4 * Math.PI / N2);
    const Lx = -0.52, Ly = 0.52, Lz = 0.68;
    for (let c = 0; c < N2; c++) {
      if (isSea[c]) continue;
      const e = elevation[c], cl = Math.cos(cen[2 * c + 1]);
      let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k];
        let dl = cen[2 * j] - cen[2 * c];
        if (dl > Math.PI) dl -= TAU2;
        else if (dl < -Math.PI) dl += TAU2;
        const dx = dl * cl / spacing, dy = (cen[2 * j + 1] - cen[2 * c + 1]) / spacing, dz = ((isSea[j] ? Math.min(0, elevation[j]) * 0.3 : elevation[j]) - e) / 1e3;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
        sxz += dx * dz;
        syz += dy * dz;
      }
      const det = sxx * syy - sxy * sxy || 1, gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det, nx = -gx * 1.25, ny = -gy * 1.25, len = Math.hypot(nx, ny, 1);
      sh[c] = clamp16((nx * Lx + ny * Ly + Lz) / len - Lz, -1, 1);
    }
    const out = new Float32Array(N2);
    for (let c = 0; c < N2; c++) {
      if (isSea[c]) continue;
      let s = sh[c] * 2, n2 = 2;
      for (let k = off[c]; k < off[c + 1]; k++) if (!isSea[nb[k]]) {
        s += sh[nb[k]];
        n2++;
      }
      out[c] = s / n2;
    }
    return out;
  }
  function reliefMarks(geo, cell, isSea) {
    const { elevation, landWater } = cell, N2 = geo.N, marks = [], cp = geo.cellPx;
    for (let c = 0; c < N2; c++) {
      if (isSea[c] || landWater[c] === 2) continue;
      const e = elevation[c];
      if (e < 700) continue;
      const [px, py] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]), jx = (hash01(c, 7) - 0.5) * cp * 0.45, jy = (hash01(c, 8) - 0.5) * cp * 0.35;
      if (e >= 2200) marks.push([px + jx, py + jy, 1, cp * (0.5 + 0.28 * clamp16((e - 2200) / 3200, 0, 1))]);
      else marks.push([px + jx, py + jy, 0, cp * (0.3 + 0.16 * clamp16((e - 700) / 1500, 0, 1))]);
    }
    return marks.sort((a, b) => a[1] - b[1]);
  }
  function drawMarks(ctx, marks, k) {
    const s = 1 / Math.pow(k, 0.3);
    ctx.lineJoin = "round";
    for (const [x, y, kind, size] of marks) {
      const w = size * s;
      if (kind === 1) {
        const h2 = w * 0.95;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.55, y + h2 * 0.4);
        ctx.lineTo(x - w * 0.02, y - h2 * 0.6);
        ctx.lineTo(x + w * 0.1, y + h2 * 0.4);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,252,240,.62)";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - w * 0.02, y - h2 * 0.6);
        ctx.lineTo(x + w * 0.58, y + h2 * 0.4);
        ctx.lineTo(x + w * 0.1, y + h2 * 0.4);
        ctx.closePath();
        ctx.fillStyle = "rgba(40,34,30,.5)";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, y + w * 0.22);
        ctx.quadraticCurveTo(x, y - w * 0.46, x + w * 0.5, y + w * 0.22);
        ctx.lineWidth = Math.max(0.5, w * 0.12);
        ctx.strokeStyle = "rgba(70,56,40,.55)";
        ctx.stroke();
      }
    }
  }
  function riverPaths(geo, cell, isSea) {
    const { riverTo, riverFlow, river, landWater } = cell;
    if (!riverTo) return [];
    const N2 = geo.N, W2 = geo.W, buckets = [new Path2D(), new Path2D(), new Path2D()], cen = geo.cen, fl = [];
    for (let c = 0; c < N2; c++) if (riverTo[c] >= 0 && landWater[c] === 1 && (river?.[c] > 0 || riverFlow?.[c] > 0)) fl.push(riverFlow?.[c] ?? 0);
    fl.sort((a, b) => a - b);
    const q2 = (p) => fl[Math.floor(fl.length * p)] ?? 0, t1 = q2(0.55), t2 = q2(0.88);
    for (let c = 0; c < N2; c++) {
      const to = riverTo[c];
      if (to < 0 || landWater[c] !== 1 || !(river?.[c] > 0 || riverFlow?.[c] > 0)) continue;
      const f = riverFlow?.[c] ?? 0, b = f >= t2 ? 2 : f >= t1 ? 1 : 0, [x1, y1] = geo.proj(cen[2 * c], cen[2 * c + 1]);
      let [x2, y2] = geo.proj(cen[2 * to], cen[2 * to + 1]);
      x2 += W2 * Math.round((x1 - x2) / W2);
      if (isSea[to]) {
        x2 = (x1 + x2) / 2;
        y2 = (y1 + y2) / 2;
      }
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, r = (hash01(c, to, 3) - 0.5) * 0.7 * len, cx = mx - dy / len * r, cy = my + dx / len * r;
      for (const o of [0, W2, -W2]) {
        if (Math.max(x1, x2) + o < 0 || Math.min(x1, x2) + o > W2) continue;
        buckets[b].moveTo(x1 + o, y1);
        buckets[b].quadraticCurveTo(cx + o, cy, x2 + o, y2);
      }
    }
    return buckets;
  }
  function textureTile(createCanvas, size = 96) {
    const cv = createCanvas(size, size), ctx = cv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = hash01(x, y, 11) * 0.6 + hash01(x >> 2, y >> 2, 12) * 0.4, i = 4 * (y * size + x), dark = v < 0.5;
      d[i] = dark ? 40 : 255;
      d[i + 1] = dark ? 34 : 250;
      d[i + 2] = dark ? 28 : 240;
      d[i + 3] = Math.round(Math.abs(v - 0.5) * 70);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // js/ui/v6/map.js
  var TAU3 = Math.PI * 2;
  var LAYERS = [
    ["heightmap", "\u6A19\u9AD8", "ground"],
    ["biomes", "\u30D0\u30A4\u30AA\u30FC\u30E0", "ground"],
    ["temperature", "\u6C17\u6E29", "ground"],
    ["precipitation", "\u964D\u6C34", "ground"],
    ["population", "\u4EBA\u53E3", "social"],
    ["religions", "\u5B97\u6559", "social"],
    ["cultures", "\u6587\u5316", "social"],
    ["languages", "\u8A00\u8A9E", "social"],
    ["states", "\u56FD\u5BB6", "social"],
    ["relief", "\u9670\u5F71\u30FB\u5C71\u5CB3", "mark"],
    ["rivers", "\u6CB3\u5DDD", "line"],
    ["borders", "\u56FD\u5883\u7DDA", "line"],
    ["routes", "\u4EA4\u6613\u8DEF", "line"],
    ["war", "\u6226\u4E89\uFF08\u4EA4\u6226\u56FD\u306E\u7E01\uFF09", "line"],
    ["fronts", "\u6226\u7DDA\u30FB\u5360\u9818", "line"],
    ["cities", "\u90FD\u5E02", "mark"],
    ["labels", "\u56FD\u540D", "mark"],
    ["grid", "\u7D4C\u7DEF\u7DDA", "line"],
    ["cells", "\u533A\u753B\u7DDA", "line"]
  ];
  var GROUPS = [["ground", "\u5730\u5F62\u30FB\u6C17\u5019", "GROUND"], ["social", "\u793E\u4F1A", "SOCIETY"], ["mark", "\u8A18\u53F7\u30FB\u6587\u5B57", "MARK"], ["line", "\u7DDA", "LINE"]];
  var FILL_IDS = LAYERS.filter(([, , g]) => g === "ground" || g === "social").map(([id]) => id);
  var PRESETS = [
    ["politic", "\u653F\u6CBB", ["states", "relief", "rivers", "borders", "cities", "labels"]],
    ["culture", "\u6587\u5316", ["cultures", "relief", "rivers", "borders", "cities"]],
    ["language", "\u8A00\u8A9E", ["languages", "relief", "rivers", "borders", "cities"]],
    ["religion", "\u5B97\u6559", ["religions", "relief", "rivers", "borders", "cities"]],
    ["biome", "\u30D0\u30A4\u30AA\u30FC\u30E0", ["biomes", "relief", "rivers"]],
    ["height", "\u6A19\u9AD8", ["heightmap", "relief", "rivers"]],
    ["climate", "\u6C17\u6E29", ["temperature", "relief", "rivers"]],
    ["rain", "\u964D\u6C34", ["precipitation", "rivers"]],
    ["economy", "\u4EBA\u53E3\u30FB\u4EA4\u6613", ["population", "relief", "rivers", "routes", "cities"]],
    ["military", "\u8ECD\u4E8B", ["states", "relief", "borders", "war", "fronts", "cities"]],
    ["land", "\u9678\u5730\u306E\u307F", ["relief"]]
  ];
  var DEFAULT_ALPHA = { heightmap: 1, biomes: 1, temperature: 0.8, precipitation: 0.8, population: 0.85, religions: 0.66, cultures: 0.66, languages: 0.66, states: 0.66 };
  var SEA_DEEP = RAMPS.sea(5200);
  var mkCanvas = (w, h2) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h2;
    return c;
  };
  var dominant3 = (g, key) => g.cohorts?.reduce?.((b, x) => x.share > b.share ? x : b, { share: -1 })?.[key] ?? null;
  var idOf = { states: (g) => g.stateId ?? null, cultures: (g) => dominant3(g, "cultureId"), languages: (g) => dominant3(g, "languageId"), religions: (g) => dominant3(g, "religionId") };
  var MapView = class {
    constructor(canvas, w) {
      this.cv = canvas;
      this.w = w;
      this.geo = new Geo(w.world.mesh);
      this.layers = new Set(PRESETS[0][2]);
      this.alpha = { ...DEFAULT_ALPHA };
      this.preset = "politic";
      this.onPick = null;
      this.sel = null;
      this.view = { x: 0, y: 0, k: 1 };
      this._own = null;
      this._ownAt = -1;
      this._idc = {};
      this.gc = null;
      this.rc = null;
      this.frame = null;
      this.frameView = null;
      this.T = null;
      this.wKey = 0;
      resetColors();
      canvas.addEventListener("click", (e) => {
        if (!this.moved) this.click(e);
      });
      this.pan();
      if (typeof ResizeObserver !== "undefined" && canvas.parentElement) new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
    }
    /* ---------- レイヤーの操作 ---------- */
    isOn(id) {
      return this.layers.has(id);
    }
    toggle(id) {
      this.layers.has(id) ? this.layers.delete(id) : this.layers.add(id);
      this.preset = this.presetOf();
    }
    setPreset(id) {
      const p = PRESETS.find((x) => x[0] === id);
      if (!p) return;
      this.layers = new Set(p[2]);
      this.preset = id;
    }
    presetOf() {
      for (const [id, , ls] of PRESETS) if (ls.length === this.layers.size && ls.every((l) => this.layers.has(l))) return id;
      return null;
    }
    /** 凡例に出す層: 塗りのうち、いちばん上にあるもの（なければ陸地の凡例） */
    legendKey() {
      for (let i = FILL_IDS.length - 1; i >= 0; i--) if (this.layers.has(FILL_IDS[i])) return FILL_IDS[i];
      return "land";
    }
    /* ---------- 操作（ドラッグ・ズーム）: 動かす間は画像を動かすだけ。止まったら描き直す ---------- */
    pan() {
      const cv = this.cv;
      let drag = null;
      this.moved = false;
      cv.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
        this.moved = false;
      });
      cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
        if (this.moved) {
          this.view.x = drag.vx + dx;
          this.view.y = drag.vy + dy;
          this.clamp();
          this.interact();
        }
      });
      const up = () => {
        drag = null;
        setTimeout(() => this.moved = false, 0);
      };
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointerleave", up);
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = this.view.k, k1 = clamp16(k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 16);
        this.view.x = mx - (mx - this.view.x) / k0 * k1;
        this.view.y = my - (my - this.view.y) / k0 * k1;
        this.view.k = k1;
        this.clamp();
        this.interact();
      }, { passive: false });
    }
    clamp() {
      const v = this.view, W2 = this.cv.width, H = this.cv.height;
      v.x = Math.min(0, Math.max(W2 - W2 * v.k, v.x));
      v.y = Math.min(0, Math.max(H - H * v.k, v.y));
    }
    interact() {
      if (!this.fastDraw()) {
        this.draw();
        return;
      }
      clearTimeout(this._it);
      this._it = setTimeout(() => this.draw(), 110);
    }
    fastDraw() {
      const ctx = this.cv.getContext("2d");
      if (!ctx || !this.frame || !this.frameView) return false;
      const v = this.view, f = this.frameView, r = v.k / f.k, W2 = this.cv.width, H = this.cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = SEA_DEEP;
      ctx.fillRect(0, 0, W2, H);
      ctx.setTransform(r, 0, 0, r, v.x - f.x * r, v.y - f.y * r);
      ctx.drawImage(this.frame, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return true;
    }
    size() {
      const host = this.cv.parentElement, W2 = Math.max(480, Math.floor(host?.clientWidth || this.cv.getBoundingClientRect().width || 900)), H = Math.floor(W2 / 2);
      if (this.cv.width !== W2 || this.cv.height !== H) {
        this.cv.width = W2;
        this.cv.height = H;
        this.clamp();
      }
      return [W2, H];
    }
    proj(lon, lat, W2, H) {
      return [(lon + Math.PI) / TAU3 * W2, (Math.PI / 2 - lat) / Math.PI * H];
    }
    /* ---------- 世界の地形から 1 回だけ作るもの ---------- */
    terr() {
      if (this.T) return this.T;
      const ce = this.w.world.cell, N2 = this.geo.N, m = this.geo.mesh, off = m.neighborOffsets, nb = m.neighborIds, isSea = new Uint8Array(N2), el = ce.elevation;
      for (let c = 0; c < N2; c++) isSea[c] = ce.landWater[c] === 0 || el[c] <= 0 ? 1 : 0;
      const smooth2 = (want) => {
        const o = new Float32Array(N2);
        for (let c = 0; c < N2; c++) {
          if (!!isSea[c] !== want) continue;
          let s = el[c] * 2, n2 = 2;
          for (let k = off[c]; k < off[c + 1]; k++) if (!!isSea[nb[k]] === want) {
            s += el[nb[k]];
            n2++;
          }
          o[c] = s / n2;
        }
        return o;
      };
      let seaS = smooth2(true);
      for (let i = 0; i < 3; i++) {
        const prev = seaS;
        seaS = new Float32Array(N2);
        for (let c = 0; c < N2; c++) {
          if (!isSea[c]) continue;
          let s = prev[c] * 2, n2 = 2;
          for (let k = off[c]; k < off[c + 1]; k++) if (isSea[nb[k]]) {
            s += prev[nb[k]];
            n2++;
          }
          seaS[c] = s / n2;
        }
      }
      this.T = { isSea, elS: smooth2(false), seaS, shade: hillshade(this.geo, el, isSea), col: {} };
      return this.T;
    }
    /** 画面の幅が変わったときだけ、形状まわりのキャッシュを作り直す */
    ensureGeo(W2, H) {
      const T3 = this.terr();
      if (this.wKey === W2) return;
      this.wKey = W2;
      this.geo.build(W2, H);
      this.cp = this.geo.paths(T3.isSea);
      T3.marks = reliefMarks(this.geo, this.w.world.cell, T3.isSea);
      const ce = this.w.world.cell, g = this.geo;
      T3.coast = g.edgesWhere((c, n2) => !T3.isSea[c] && T3.isSea[n2]);
      T3.lakeEdge = g.edgesWhere((c, n2) => ce.landWater[c] !== 2 && !T3.isSea[c] && ce.landWater[n2] === 2);
      T3.cellsP = null;
      T3.rivers = riverPaths(g, ce, T3.isSea);
      T3.grid = null;
      this.gc = this.rc = this.frame = null;
      this._labelsAt = -1;
      T3.tex = null;
      try {
        const t = textureTile(mkCanvas);
        T3.tex = t && this.cv.getContext("2d")?.createPattern(t, "repeat");
      } catch {
        T3.tex = null;
      }
    }
    cellColors(id) {
      const T3 = this.T, ce = this.w.world.cell, N2 = this.geo.N;
      if (T3.col[id]) return T3.col[id];
      const a = new Array(N2).fill(null);
      for (let c = 0; c < N2; c++) {
        if (T3.isSea[c]) continue;
        if (ce.landWater[c] === 2) {
          a[c] = LAKE_COLOR;
          continue;
        }
        if (id === "heightmap") a[c] = RAMPS.land(T3.elS[c]);
        else if (id === "biomes") a[c] = BIOME_COLORS[ce.biome[c]] ?? LAND_BASE;
        else if (id === "temperature") a[c] = RAMPS.temp(ce.temp[c]);
        else if (id === "precipitation") a[c] = RAMPS.precip(ce.precip[c]);
      }
      return T3.col[id] = a;
    }
    /* ---------- 所有・色 ---------- */
    owner() {
      const civ3 = this.w.civ, pv = this.w.viewPast, key = pv ?? civ3.monthIndex;
      if (this._own && this._ownAt === key) return this._own;
      const o = /* @__PURE__ */ new Map();
      if (pv != null) {
        for (const [cell, stateId] of pastView(civ3, pv).owner) o.set(cell, { cell, cells: [cell], stateId, pop: 1, cohorts: [] });
      } else for (const g of Object.values(civ3.groups)) {
        const cells = g.cells?.length ? g.cells : [g.cell];
        for (const c of cells) o.set(c, g);
      }
      this._own = o;
      this._ownAt = key;
      this._idc = {};
      this._labelsAt = -1;
      this.assign(o);
      return o;
    }
    /** id（国家・文化・言語・宗教）の色を、隣り合うものが似ないように割り当てる（決めた色は変えない） */
    assign(own) {
      const civ3 = this.w.civ, tabs = { states: civ3.states, cultures: civ3.cultures, languages: civ3.languages, religions: civ3.religions }, nb = this.geo.mesh;
      for (const [type, tab] of Object.entries(tabs)) {
        const ids = Object.keys(tab ?? {}).filter((i) => !hasColor(i));
        if (!ids.length) continue;
        const adj = /* @__PURE__ */ new Map(), f = idOf[type], off = nb.neighborOffsets, ni = nb.neighborIds;
        for (const [c, g] of own) {
          const a = f(g);
          if (!a) continue;
          for (let k = off[c]; k < off[c + 1]; k++) {
            const o = own.get(ni[k]), b = o && f(o);
            if (b && b !== a) {
              let s = adj.get(a);
              if (!s) adj.set(a, s = /* @__PURE__ */ new Set());
              s.add(b);
            }
          }
        }
        assignColors(ids, adj);
      }
    }
    idColor(type, g, maxDen) {
      if (type === "population") {
        const n2 = g.cells?.length || 1, d = g.pop / n2, t = clamp16(Math.log1p(d) / Math.log1p(maxDen), 0, 1);
        return RAMPS.pop(t);
      }
      const id = idOf[type](g);
      return id ? colorOf(id) : null;
    }
    /* ---------- 描画 ---------- */
    /** layerPass: alpha が 1 未満の層は、別の紙に不透明で塗ってから重ねる（区画の継ぎ目が濃く出ないように） */
    pass(target, W2, H, alpha, paint) {
      const v = this.view;
      if (alpha >= 0.995) {
        target.lineWidth = 0.9 / v.k;
        paint(target);
        return;
      }
      this.tmp ?? (this.tmp = mkCanvas(W2, H));
      if (this.tmp.width !== W2 || this.tmp.height !== H) {
        this.tmp.width = W2;
        this.tmp.height = H;
      }
      const t = this.tmp.getContext("2d");
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, W2, H);
      t.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      t.lineJoin = "round";
      t.lineWidth = 0.9 / v.k;
      paint(t);
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = alpha;
      target.drawImage(this.tmp, 0, 0);
      target.restore();
    }
    paintCells(g, cells, colorAt) {
      const cp = this.cp;
      for (const c of cells) {
        const col = colorAt(c);
        if (!col) continue;
        g.fillStyle = col;
        g.strokeStyle = col;
        g.fill(cp[c]);
        g.stroke(cp[c]);
      }
    }
    /** 地形・気候（静的）: 海の深さ・海岸・陸・標高/バイオーム/気温/降水 */
    renderGround(g, W2, H) {
      const T3 = this.T, geo = this.geo, v = this.view, cp = this.cp, N2 = geo.N, cpx = geo.cellPx, seaIds = [], landIds = [];
      for (let c = 0; c < N2; c++) (T3.isSea[c] ? seaIds : landIds).push(c);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.fillStyle = SEA_DEEP;
      g.fillRect(0, 0, W2, H);
      g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      g.lineJoin = "round";
      g.lineWidth = 0.9 / v.k;
      if (!T3.seaCol) T3.seaCol = Array.from({ length: N2 }, (_, c) => T3.isSea[c] ? RAMPS.sea(-T3.seaS[c]) : null);
      this.paintCells(g, seaIds, (c) => T3.seaCol[c]);
      g.lineCap = "round";
      for (const [w, a] of [[0.95, 0.09], [0.6, 0.12], [0.3, 0.17]]) {
        g.lineWidth = cpx * w;
        g.strokeStyle = `rgba(200,238,246,${a})`;
        g.stroke(T3.coast);
      }
      g.lineWidth = 0.9 / v.k;
      g.fillStyle = LAND_BASE;
      g.fill(geo.land);
      for (const id of ["heightmap", "biomes", "temperature", "precipitation"]) if (this.layers.has(id)) {
        const col = this.cellColors(id);
        this.pass(g, W2, H, this.alpha[id], (t) => this.paintCells(t, landIds, (c) => col[c]));
      }
      if (!T3.lakes) {
        const ce = this.w.world.cell;
        T3.lakes = landIds.filter((c) => ce.landWater[c] === 2);
      }
      this.paintCells(g, T3.lakes, () => LAKE_COLOR);
      g.strokeStyle = "rgba(24,38,52,.7)";
      g.lineWidth = Math.max(0.5, 1.1 / Math.sqrt(v.k));
      g.stroke(T3.coast);
      g.strokeStyle = "rgba(24,38,52,.45)";
      g.stroke(T3.lakeEdge);
    }
    /** 陰影・山岳・紙の模様（静的）。透明な紙に描き、塗りの上に重ねる */
    renderRelief(g, W2, H) {
      const T3 = this.T, v = this.view, cp = this.cp, N2 = this.geo.N;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W2, H);
      g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      for (let c = 0; c < N2; c++) {
        if (T3.isSea[c]) continue;
        const s = T3.shade[c];
        if (s < -0.035) g.fillStyle = `rgba(22,18,40,${Math.min(0.28, -s * 0.8).toFixed(3)})`;
        else if (s > 0.035) g.fillStyle = `rgba(255,252,240,${Math.min(0.2, s * 0.65).toFixed(3)})`;
        else continue;
        g.fill(cp[c]);
      }
      if (T3.tex) {
        g.globalAlpha = 0.55;
        g.fillStyle = T3.tex;
        g.fill(this.geo.land);
        g.globalAlpha = 1;
      }
      drawMarks(g, T3.marks, v.k);
    }
    cached(slot, key, W2, H, fn) {
      const c = this[slot];
      if (c && c.key === key) return c.cv;
      const cv = c?.cv && c.cv.width === W2 && c.cv.height === H ? c.cv : mkCanvas(W2, H), g = cv.getContext("2d");
      fn(g, W2, H);
      this[slot] = { key, cv };
      return cv;
    }
    draw() {
      const ctx = this.cv.getContext("2d");
      if (!ctx) return;
      const [W2, H] = this.size();
      this.ensureGeo(W2, H);
      const T3 = this.T, geo = this.geo, v = this.view, civ3 = this.w.civ, own = this.owner(), cell = this.w.world.cell;
      const vk = `${W2}|${v.k.toFixed(4)}|${v.x.toFixed(1)}|${v.y.toFixed(1)}`, gsig = vk + FILL_IDS.slice(0, 4).map((i) => this.layers.has(i) ? i + this.alpha[i] : "").join(",");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W2, H);
      ctx.drawImage(this.cached("gc", gsig, W2, H, (g) => this.renderGround(g, W2, H)), 0, 0);
      ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      ctx.lineJoin = "round";
      let maxDen = 1;
      if (this.layers.has("population")) for (const g of own.values()) {
        const d = g.pop / (g.cells?.length || 1);
        if (d > maxDen) maxDen = d;
      }
      for (const [id, , grp] of LAYERS) if (grp === "social" && this.layers.has(id)) this.pass(ctx, W2, H, this.alpha[id], (t) => {
        const cp = this.cp;
        for (const [c, g] of own) {
          if (cell.landWater[c] === 2) continue;
          const col = this.idColor(id, g, maxDen);
          if (!col) continue;
          t.fillStyle = col;
          t.strokeStyle = col;
          t.fill(cp[c]);
          t.stroke(cp[c]);
        }
      });
      if (this.layers.has("relief")) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.cached("rc", vk, W2, H, (g) => this.renderRelief(g, W2, H)), 0, 0);
      }
      ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      this.lines(ctx, own, W2, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      this.frame ?? (this.frame = mkCanvas(W2, H));
      if (this.frame.width !== W2 || this.frame.height !== H) {
        this.frame.width = W2;
        this.frame.height = H;
      }
      const fx3 = this.frame.getContext("2d");
      fx3.setTransform(1, 0, 0, 1, 0, 0);
      fx3.clearRect(0, 0, W2, H);
      fx3.drawImage(this.cv, 0, 0);
      this.frameView = { x: v.x, y: v.y, k: v.k };
      void civ3;
      void geo;
    }
    /** 線・記号・文字（月ごとに変わるものを含む。毎回描く） */
    lines(ctx, own, W2, H) {
      const T3 = this.T, geo = this.geo, v = this.view, civ3 = this.w.civ, L = this.layers, k = v.k, sk = Math.sqrt(k), cen = geo.cen, ln = (a, b, p) => {
        const [x1, y1] = geo.proj(cen[2 * a], cen[2 * a + 1]);
        let [x2, y2] = geo.proj(cen[2 * b], cen[2 * b + 1]);
        x2 += W2 * Math.round((x1 - x2) / W2);
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
      };
      if (L.has("grid")) {
        if (!T3.grid) {
          const p = new Path2D();
          for (let lo = -150; lo <= 180; lo += 30) {
            const [x] = geo.proj(lo * Math.PI / 180, 0);
            p.moveTo(x, 0);
            p.lineTo(x, H);
          }
          for (let la = -60; la <= 60; la += 30) {
            const [, y] = geo.proj(0, la * Math.PI / 180);
            p.moveTo(0, y);
            p.lineTo(W2, y);
          }
          T3.grid = p;
        }
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.lineWidth = 0.8 / k;
        ctx.setLineDash([4 / k, 4 / k]);
        ctx.stroke(T3.grid);
        ctx.setLineDash([]);
      }
      if (L.has("cells")) {
        T3.cellsP ?? (T3.cellsP = geo.edgesWhere((c, n2) => c < n2));
        ctx.strokeStyle = "rgba(20,24,30,.28)";
        ctx.lineWidth = 0.6 / k;
        ctx.stroke(T3.cellsP);
      }
      if (L.has("rivers") && T3.rivers.length) {
        ctx.strokeStyle = "#4f97d4";
        [[0, 0.5, 3], [1, 0.75, 1.4], [2, 1.15, 0]].forEach(([b, w, kmin]) => {
          if (k < kmin) return;
          ctx.lineWidth = w * geo.cellPx * 0.11 / Math.pow(k, 0.55);
          ctx.globalAlpha = 0.95;
          ctx.stroke(T3.rivers[b]);
        });
        ctx.globalAlpha = 1;
      }
      const stateOf = (c) => own.get(c)?.stateId ?? null;
      if (L.has("borders")) {
        const p = geo.edgesWhere((c, n2) => {
          const a = stateOf(c), b = stateOf(n2);
          return a && a !== b && !T3.isSea[n2] && (b ? c < n2 : true);
        }, own.keys());
        ctx.strokeStyle = "rgba(24,22,30,.45)";
        ctx.lineWidth = 3.2 / sk;
        ctx.stroke(p);
        ctx.strokeStyle = "#f6f1e2";
        ctx.lineWidth = 1.5 / sk;
        ctx.stroke(p);
      }
      if (L.has("war")) {
        const warring = /* @__PURE__ */ new Set();
        for (const id of civ3.activeWarIds) {
          const x = civ3.wars[id];
          for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s);
        }
        const p = geo.edgesWhere((c, n2) => {
          const a = stateOf(c);
          return a && warring.has(a) && stateOf(n2) !== a && !T3.isSea[n2];
        }, own.keys());
        ctx.strokeStyle = "#e0463c";
        ctx.lineWidth = 2.4 / sk;
        ctx.setLineDash([5 / sk, 3 / sk]);
        ctx.stroke(p);
        ctx.setLineDash([]);
      }
      if (L.has("routes")) {
        ctx.strokeStyle = "#e8b64a";
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([6 / sk, 4 / sk]);
        const seen = /* @__PURE__ */ new Set();
        for (const s of Object.values(civ3.states)) {
          if (!s.alive) continue;
          const a = civ3.groups[s.capitalGroupId];
          for (const [oid, amt] of Object.entries(s.econ?.trade ?? {})) {
            const o = civ3.states[oid], key = s.id < oid ? s.id + oid : oid + s.id;
            if (!o?.alive || !(amt > 0) || seen.has(key)) continue;
            seen.add(key);
            const b = civ3.groups[o.capitalGroupId];
            if (!a || !b) continue;
            ctx.lineWidth = Math.min(3, 0.8 + amt * 0.02) / sk;
            const p = new Path2D();
            ln(a.cell, b.cell, p);
            ctx.stroke(p);
          }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (L.has("fronts")) {
        ctx.strokeStyle = "#e0463c";
        for (const wid of civ3.activeWarIds ?? []) {
          const wr = civ3.wars[wid];
          for (const gid of wr?.occupied ?? []) {
            const g = civ3.groups[gid];
            if (!g) continue;
            const [x, y] = geo.proj(cen[2 * g.cell], cen[2 * g.cell + 1]), r = 3.4 / sk;
            ctx.lineWidth = 1.6 / sk;
            ctx.beginPath();
            ctx.moveTo(x - r, y - r);
            ctx.lineTo(x + r, y + r);
            ctx.moveTo(x + r, y - r);
            ctx.lineTo(x - r, y + r);
            ctx.stroke();
          }
          ctx.setLineDash([3 / sk, 3 / sk]);
          ctx.lineWidth = 1.4 / sk;
          for (const f of Object.values(wr?.ops?.forces ?? {})) {
            const tg = f.target, g = civ3.groups[f.groupId ?? f.at];
            if (tg == null || !g || typeof tg !== "number") continue;
            const p = new Path2D();
            ln(g.cell, tg, p);
            ctx.stroke(p);
          }
          ctx.setLineDash([]);
        }
      }
      if (L.has("cities")) {
        ctx.lineWidth = 1.2 / sk;
        for (const s of Object.values(civ3.settlements)) {
          if (s.pop < 800) continue;
          const [x, y] = geo.proj(cen[2 * s.cell], cen[2 * s.cell + 1]), big = s.stage === "city", r = (big ? 3.4 : 2.1) / sk;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU3);
          ctx.fillStyle = "#fff4cf";
          ctx.fill();
          ctx.strokeStyle = "#2a2018";
          ctx.stroke();
          if (big) {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.38, 0, TAU3);
            ctx.fillStyle = "#2a2018";
            ctx.fill();
          }
        }
      }
      if (this.sel) {
        const p = geo.edgesWhere((c, n2) => stateOf(n2) !== this.sel, [...own].filter(([, g]) => g.stateId === this.sel).map(([c]) => c));
        ctx.strokeStyle = "rgba(20,16,8,.6)";
        ctx.lineWidth = 4.2 / sk;
        ctx.stroke(p);
        ctx.strokeStyle = "#f0c14d";
        ctx.lineWidth = 2.4 / sk;
        ctx.stroke(p);
      }
      if (L.has("labels")) this.drawLabels(ctx, own, W2);
    }
    drawLabels(ctx, own, W2) {
      const geo = this.geo, civ3 = this.w.civ, k = this.view.k;
      if (this._labelsAt !== this._ownAt || this._labelsW !== W2) {
        const m = /* @__PURE__ */ new Map();
        for (const [c, g] of own) {
          const id = g.stateId;
          if (!id) continue;
          const [x, y] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]);
          let e = m.get(id);
          if (!e) m.set(id, e = { x0: x, sx: 0, sy: 0, n: 0 });
          let dx = x - e.x0;
          dx -= W2 * Math.round(dx / W2);
          e.sx += dx;
          e.sy += y;
          e.n++;
        }
        this._labels = [...m].map(([id, e]) => ({ id, x: e.x0 + e.sx / e.n, y: e.sy / e.n, n: e.n })).sort((a, b) => b.n - a.n);
        this._labelsAt = this._ownAt;
        this._labelsW = W2;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      let shown = 0;
      for (const e of this._labels) {
        const name = civ3.states[e.id]?.name;
        if (!name || e.n < 2 && k < 3 || shown > 90) continue;
        shown++;
        const fs = clamp16(8 + 2.6 * Math.sqrt(e.n), 9, 28) / Math.pow(k, 0.55);
        ctx.font = `600 ${fs}px "Shippori Mincho","Noto Serif JP","Yu Mincho",serif`;
        ctx.lineWidth = fs * 0.24;
        ctx.strokeStyle = "rgba(16,18,24,.78)";
        ctx.fillStyle = "#f7f2e4";
        for (const o of [0, W2, -W2]) {
          if (e.x + o < -40 || e.x + o > W2 + 40) continue;
          ctx.strokeText(name, e.x + o, e.y);
          ctx.fillText(name, e.x + o, e.y);
        }
      }
    }
    /* ---------- 凡例: 選んだ層の実データから ---------- */
    legend(key) {
      const civ3 = this.w.civ, own = this.owner(), ce = this.w.world.cell;
      if (idOf[key]) {
        const cnt = /* @__PURE__ */ new Map();
        for (const g of own.values()) {
          const a = idOf[key](g);
          if (a) cnt.set(a, (cnt.get(a) ?? 0) + 1);
        }
        const tab = { states: civ3.states, cultures: civ3.cultures, languages: civ3.languages, religions: civ3.religions }[key];
        return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n2]) => ({ c: colorOf(id), t: `${tab[id]?.name ?? id} ${n2}` }));
      }
      if (key === "heightmap") return [{ c: RAMPS.land(60), t: "\u4F4E\u5730" }, { c: RAMPS.land(800), t: "\u53F0\u5730\u30FB\u4E18\u9675" }, { c: RAMPS.land(2200), t: "\u5C71\u5730" }, { c: RAMPS.land(4600), t: "\u9AD8\u5C71" }, { c: RAMPS.land(6400), t: "\u96EA" }, { c: RAMPS.sea(100), t: "\u6D45\u3044\u6D77" }, { c: RAMPS.sea(3500), t: "\u6DF1\u3044\u6D77" }];
      if (key === "biomes") {
        const n2 = new Array(14).fill(0);
        for (let c = 0; c < this.geo.N; c++) if (ce.landWater[c] !== 0) n2[ce.biome[c]]++;
        return n2.map((v, i) => [i, v]).filter(([i, v]) => i > 0 && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([i]) => ({ c: BIOME_COLORS[i], t: BIOME_JA[i] }));
      }
      if (key === "temperature") return [-20, 0, 10, 20, 30].map((t) => ({ c: RAMPS.temp(t), t: `${t}\u2103` }));
      if (key === "precipitation") return [0, 300, 900, 1800, 3e3].map((t) => ({ c: RAMPS.precip(t), t: `${t} mm` }));
      if (key === "population") return [0.05, 0.35, 0.65, 0.95].map((t, i) => ({ c: RAMPS.pop(t), t: ["\u5C11\u306A\u3044", "\u3084\u3084\u5C11\u306A\u3044", "\u3084\u3084\u591A\u3044", "\u591A\u3044\uFF08\u5BFE\u6570\u306E\u968E\u8ABF\uFF09"][i] }));
      if (key === "relief") return [{ c: "rgba(255,252,240,.8)", t: "\u5149\u304C\u5F53\u305F\u308B\u659C\u9762\uFF08\u5317\u897F\u304C\u5149\u6E90\uFF09" }, { c: "rgba(22,18,40,.6)", t: "\u5F71\u306B\u306A\u308B\u659C\u9762" }];
      if (key === "borders") return [{ line: "#f6f1e2", t: "\u56FD\u5883\uFF08\u5B9F\u7DDA\uFF09" }];
      if (key === "war") return [{ dash: "#e0463c", t: "\u4EA4\u6226\u56FD\u306E\u7E01\u53D6\u308A\uFF08\u8D64\u306E\u7834\u7DDA\uFF09" }];
      if (key === "cities") return [{ dot: "#fff4cf", t: "\u90FD\u5E02\u30FB\u96C6\u843D\uFF08\u70B9\uFF09" }];
      if (key === "rivers") return [{ line: "#4f97d4", t: "\u6CB3\u5DDD\uFF08\u592A\u3055\u306F\u6D41\u91CF\uFF09" }];
      if (key === "routes") return [{ dash: "#e8b64a", t: "\u4EA4\u6613\u8DEF\uFF08\u70B9\u7DDA\uFF09" }];
      if (key === "fronts") return [{ dash: "#e0463c", t: "\u6226\u7DDA\u30FB\u5360\u9818\uFF08\xD7\u5370\uFF09" }];
      if (key === "land") return [{ c: LAND_BASE, t: "\u9678" }, { c: RAMPS.sea(100), t: "\u6D45\u3044\u6D77" }, { c: RAMPS.sea(3500), t: "\u6DF1\u3044\u6D77" }, { c: LAKE_COLOR, t: "\u6E56" }];
      return [];
    }
    click(e) {
      const r = this.cv.getBoundingClientRect(), v = this.view, x = ((e.clientX - r.left) * (this.cv.width / r.width) - v.x) / v.k, y = ((e.clientY - r.top) * (this.cv.height / r.height) - v.y) / v.k, W2 = this.cv.width, H = this.cv.height, lon = x / W2 * TAU3 - Math.PI, lat = Math.PI / 2 - y / H * Math.PI;
      let best = -1, bd = 9;
      for (let c = 0; c < this.geo.N; c++) {
        let dl = Math.abs(this.geo.cen[c * 2] - lon);
        if (dl > Math.PI) dl = TAU3 - dl;
        const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const g = this.owner().get(best), st2 = Object.values(this.w.civ.settlements).find((s) => s.cell === best);
      this.onPick?.({ cell: best, stateId: g?.stateId ?? null, group: g ?? null, settlement: st2 ?? null, x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  // js/ui/v6/trees.js
  init_tech();
  init_techtree();
  var NODESTAGE = Object.fromEntries(TREE.map((t) => [t.id, t.stage]));
  function panZoom(svg, W2, H, { onChange = null } = {}) {
    let vb = { x: 0, y: 0, w: W2, h: H };
    const apply = () => {
      svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      onChange?.({ ...vb });
    };
    apply();
    let drag = null, moved = false;
    svg.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      moved = false;
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), dx = (e.clientX - drag.x) * vb.w / r.width, dy = (e.clientY - drag.y) * vb.h / r.height;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      vb.x = drag.vx - dx;
      vb.y = drag.vy - dy;
      apply();
    });
    const up = () => {
      drag = null;
    };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointerleave", up);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect(), k = e.deltaY < 0 ? 0.85 : 1 / 0.85, mx = vb.x + (e.clientX - r.left) / r.width * vb.w, my = vb.y + (e.clientY - r.top) / r.height * vb.h;
      vb = { x: mx - (mx - vb.x) * k, y: my - (my - vb.y) * k, w: vb.w * k, h: vb.h * k };
      apply();
    }, { passive: false });
    return { set: (v) => {
      vb = { ...v };
      apply();
    }, reset: () => {
      vb = { x: 0, y: 0, w: W2, h: H };
      apply();
    }, get moved() {
      return moved;
    }, get vb() {
      return vb;
    } };
  }
  function lineageTree(items, { selected, onPick, label = (x) => x.name, colorFn = (x) => colorOf(x.id) }) {
    const by = new Map(items.map((x) => [x.id, x])), kids = /* @__PURE__ */ new Map();
    for (const x of items) {
      const p = x.parent && by.has(x.parent) ? x.parent : null;
      (kids.get(p) ?? kids.set(p, []).get(p)).push(x);
    }
    for (const l of kids.values()) l.sort((a, b) => a.bornAt - b.bornAt || (a.id < b.id ? -1 : 1));
    const pos = /* @__PURE__ */ new Map();
    let row = 0;
    const place = (x, d) => {
      const c = kids.get(x.id) ?? [];
      if (!c.length) {
        pos.set(x.id, { d, y: row++ });
        return;
      }
      c.forEach((k) => place(k, d + 1));
      pos.set(x.id, { d, y: (pos.get(c[0].id).y + pos.get(c.at(-1).id).y) / 2 });
    };
    for (const r of kids.get(null) ?? []) place(r, 0);
    const DX = 150, DY = 26, maxD = Math.max(0, ...[...pos.values()].map((p) => p.d)), W2 = 40 + (maxD + 1) * DX, H = Math.max(120, 30 + row * DY), svg = sv("svg", { class: "tree", viewBox: `0 0 ${W2} ${H}`, preserveAspectRatio: "xMinYMin meet", style: "height:" + Math.min(380, Math.max(160, H)) + "px" });
    for (const x of items) {
      const p = pos.get(x.id), q2 = x.parent && pos.get(x.parent);
      if (p && q2) svg.append(sv("path", { d: `M${20 + q2.d * DX + 120} ${20 + q2.y * DY}C${20 + q2.d * DX + 135} ${20 + q2.y * DY} ${20 + p.d * DX - 15} ${20 + p.y * DY} ${20 + p.d * DX} ${20 + p.y * DY}`, fill: "none", stroke: "#4a515c", "stroke-width": 1.2 }));
    }
    const pz = panZoom(svg, W2, H);
    for (const x of items) {
      const p = pos.get(x.id);
      if (!p) continue;
      const g = sv("g", { class: "tnode", onclick: () => {
        if (!pz.moved) onPick(x);
      } }, sv("rect", { x: 20 + p.d * DX, y: 20 + p.y * DY - 10, width: 120, height: 20, fill: "#1a1d23", stroke: selected === x.id ? "#d8b45a" : colorFn(x), "stroke-width": selected === x.id ? 2.4 : 1.4 }), sv("text", { x: 26 + p.d * DX, y: 20 + p.y * DY + 4, "font-size": 11, fill: "#d9d6cc" }, label(x).slice(0, 10)));
      svg.append(g);
    }
    return svg;
  }
  function techTree({ techs, status, onPick, selected, lane = null, hit = null, vb0 = null, onView = null }) {
    const g = layoutGrid(), NW = 128, NH = 24, CW = 196, RH = 34, X0 = 120, Y0 = 34, W2 = X0 + g.cols * CW + 20, H = Y0 + g.totalRows * RH + 20, byKey = new Map(techs.map((t) => [t.key, t]));
    const svg = sv("svg", { class: "tree techgrid", viewBox: `0 0 ${W2} ${H}`, style: "height:460px;touch-action:none" }), P2 = (t) => ({ x: X0 + g.pos[t.key].col * CW, y: Y0 + g.pos[t.key].row * RH });
    const COL = { adopted: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], known: ["#a58bd0", "#201a2e"], lost: ["#c97a6f", "#2a1614"], locked: ["#4a515c", "#14161a"] }, SYM = { adopted: "\u25A0", available: "\u25C6", known: "\u25C7", lost: "\u2715", locked: "\u25CB" };
    const eraOfCol = (c) => {
      const st2 = techs.filter((t) => t.col === c).map((t) => t.tier);
      return null;
      void st2;
    };
    const stageOf4 = /* @__PURE__ */ new Map();
    for (const t of techs) {
      const a = stageOf4.get(t.col) ?? [];
      a.push(NODESTAGE[t.key] ?? 0);
      stageOf4.set(t.col, a);
    }
    for (let c = 0; c < g.cols; c++) {
      const a = (stageOf4.get(c) ?? []).sort((x, y) => x - y), m = a.length ? a[a.length >> 1] : 0;
      svg.append(sv("text", { x: X0 + c * CW + NW / 2, y: 18, "text-anchor": "middle", "font-size": 11, fill: "#838995" }, STAGES[m] ?? ""));
    }
    LANES.forEach((l, i) => {
      const y = Y0 + g.y0[l.id] * RH - 6, hgt = g.rows[l.id] * RH;
      svg.append(sv("rect", { x: 0, y, width: W2, height: hgt, fill: i % 2 ? "#15181d" : "#12151a", opacity: lane && lane !== l.id ? 0.4 : 1 }), sv("text", { x: 8, y: y + hgt / 2 + 4, "font-size": 12, fill: lane === l.id ? "#d8b45a" : "#a1a6b0" }, `${l.glyph} ${l.ja}`.slice(0, 9)));
    });
    const ek = /* @__PURE__ */ new Map();
    for (const t of techs) {
      const q2 = P2(t);
      t.prereq.forEach((pk, i) => {
        const pt = byKey.get(pk);
        if (!pt) return;
        const a = P2(pt), dim = lane && t.lane !== lane && pt.lane !== lane || status(t) === "locked", lane2 = ek.get(t.col) ?? 0;
        ek.set(t.col, lane2 + 1);
        const bx = q2.x - 26 + i * 7 % 20 - 6, ay = a.y + NH / 2, by = q2.y + NH / 2;
        svg.append(sv("path", { d: `M${a.x + NW} ${ay}H${bx}V${by}H${q2.x}`, fill: "none", stroke: dim ? "#2b3038" : status(pt) === "locked" ? "#3a414b" : "#6fa8c9", "stroke-width": selected && (selected === t.key || selected === pk) ? 2.2 : 1, opacity: dim ? 0.5 : 0.85 }));
      });
    }
    const pz = panZoom(svg, W2, H, { onChange: onView });
    for (const t of techs) {
      const p = P2(t), s = status(t), [stroke, fill] = COL[s], dim = lane && t.lane !== lane || hit && !hit.has(t.key);
      svg.append(sv("g", { class: "tnode", opacity: dim ? 0.3 : 1, onclick: () => {
        if (!pz.moved) onPick(t);
      } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === t.key ? "#fff" : stroke, "stroke-width": s === "adopted" ? 2.6 : selected === t.key ? 2.4 : 1.4, "stroke-dasharray": s === "locked" ? "4 3" : s === "lost" ? "2 2" : null }), sv("text", { x: p.x + 7, y: p.y + 16, "font-size": 12, fill: s === "locked" ? "#838995" : "#d9d6cc" }, `${SYM[s]} ${t.name}`.slice(0, 11))));
    }
    const frontier = Math.max(0, ...techs.filter((t) => status(t) === "adopted" || status(t) === "known" || status(t) === "available").map((t) => g.pos[t.key].col));
    const view2 = (col, w = 640) => pz.set({ x: Math.max(0, X0 + col * CW - 160), y: 0, w, h: Math.min(H, w * 460 / 380) });
    if (vb0) pz.set(vb0);
    else view2(Math.max(0, frontier - 3));
    const focus = (key) => {
      const t = byKey.get(key);
      if (!t) return;
      const p = P2(t), w = 560, h2 = Math.min(H, w * 460 / 380);
      pz.set({ x: Math.max(0, p.x - w / 2 + NW / 2), y: Math.max(0, Math.min(H - h2, p.y - h2 / 2)), w, h: h2 });
    };
    return { svg, COL, SYM, fit: () => pz.set({ x: 0, y: 0, w: W2, h: H }), left: () => view2(0), frontier: () => view2(Math.max(0, frontier - 3)), focus };
  }
  function doctrineTree({ nodes: nodes2, branches, status, onPick, selected, vb0 = null, onView = null }) {
    const CW = 136, NW = 124, NH = 28, RH = 46, GAP = 28, X0 = 14, ROOT_Y = 8, BUS_Y = 52, HEAD_Y = 66, HEAD_H = 22, Y1 = 108;
    const common = branches.filter((b) => !b.special), special = branches.filter((b) => b.special), order = [...common, ...special], tiers = Math.max(1, ...nodes2.map((d) => d.tier));
    const colX = /* @__PURE__ */ new Map();
    order.forEach((b, i) => colX.set(b.id, X0 + i * CW + (i >= common.length ? GAP : 0)));
    const W2 = X0 * 2 + order.length * CW + (special.length ? GAP : 0), H = Y1 + tiers * RH + 10, pos = /* @__PURE__ */ new Map(), cx = (b) => colX.get(b.id) + NW / 2;
    const svg = sv("svg", { class: "tree doctree", viewBox: `0 0 ${W2} ${H}`, style: "height:" + Math.min(480, H + 20) + "px;touch-action:none" });
    const midX = W2 / 2, line = (d, o = {}) => svg.append(sv("path", { d, fill: "none", stroke: "#4a515c", "stroke-width": 1.2, ...o }));
    svg.append(sv("rect", { x: midX - 70, y: ROOT_Y, width: 140, height: 28, rx: 3, fill: "#1a1d23", stroke: "#d8b45a", "stroke-width": 1.8 }), sv("text", { x: midX, y: ROOT_Y + 19, "text-anchor": "middle", "font-size": 12, fill: "#d9d6cc" }, "\u25C6 \u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"));
    if (order.length) {
      line(`M${midX} ${ROOT_Y + 28}V${BUS_Y}`);
      line(`M${cx(order[0])} ${BUS_Y}H${cx(order.at(-1))}`);
    }
    const grp = (list, label, col) => {
      if (!list.length) return;
      const a = colX.get(list[0].id), b = colX.get(list.at(-1).id) + NW;
      svg.append(sv("rect", { x: a - 6, y: BUS_Y + 4, width: b - a + 12, height: H - BUS_Y - 8, fill: col, opacity: 0.07 }), sv("text", { x: a, y: BUS_Y - 4, "font-size": 10, fill: "#838995" }, label));
    };
    grp(common, "\u5171\u901A 5 \u7CFB\u7D71", "#6fa8c9");
    grp(special, "\u56FD\u5BB6\u56FA\u6709 3 \u7CFB\u7D71 \u2605\uFF08\u653F\u4F53\u30FB\u652F\u6301\u52E2\u529B\u30FB\u5730\u5F62\u30FB\u6226\u4E89\u306E\u7D4C\u9A13\u3067\u6C7A\u307E\u308B\uFF09", "#a58bd0");
    for (const b of order) {
      line(`M${cx(b)} ${BUS_Y}V${HEAD_Y}`);
      svg.append(sv("rect", { x: colX.get(b.id), y: HEAD_Y, width: NW, height: HEAD_H, rx: 3, fill: "#14161a", stroke: b.special ? "#a58bd0" : "#6a7280", "stroke-width": 1.2 }), sv("text", { x: cx(b), y: HEAD_Y + 15, "text-anchor": "middle", "font-size": 11, fill: b.special ? "#c9b6e8" : "#c8c5bb" }, (b.special ? "\u2605 " : "") + b.ja.slice(0, 9)));
      line(`M${cx(b)} ${HEAD_Y + HEAD_H}V${Y1}`, { stroke: "#2f353e" });
    }
    for (const d of nodes2) {
      const x = colX.get(d.branch);
      if (x != null) pos.set(d.id, { x, y: Y1 + (d.tier - 1) * RH });
    }
    for (const d of nodes2) for (const p of d.prereq) {
      const a = pos.get(p), q2 = pos.get(d.id);
      if (!a || !q2) continue;
      const ax = a.x + NW / 2, qx = q2.x + NW / 2, my = q2.y - 10 - (d.tier + p.length) % 3 * 2;
      line(ax === qx ? `M${ax} ${a.y + NH}V${q2.y}` : `M${ax} ${a.y + NH}V${my}H${qx}V${q2.y}`, { stroke: "#5a626e" });
    }
    const pz = panZoom(svg, W2, H, { onChange: onView }), COL = { taken: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], blocked: ["#4a515c", "#14161a"] }, SY = { taken: "\u25A0", available: "\u25C6", blocked: "\u25CB" };
    for (const d of nodes2) {
      const p = pos.get(d.id);
      if (!p) continue;
      const s = status(d), [stroke, fill] = COL[s];
      svg.append(sv("g", { class: "tnode", "data-doc": d.id, onclick: () => {
        if (!pz.moved) onPick(d);
      } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === d.id ? "#fff" : stroke, "stroke-width": s === "taken" ? 2.6 : selected === d.id ? 2.4 : 1.4, "stroke-dasharray": s === "blocked" ? "4 3" : null }), sv("text", { x: p.x + 6, y: p.y + 18, "font-size": 11, fill: s === "blocked" ? "#838995" : "#d9d6cc" }, `${SY[s]} ${d.ja}`.slice(0, 11))));
    }
    if (vb0) pz.set(vb0);
    const focus = (id) => {
      const p = pos.get(id);
      if (!p) return;
      const w = Math.min(W2, 520), h2 = Math.min(H, w * 3 / 4);
      pz.set({ x: Math.max(0, Math.min(W2 - w, p.x + NW / 2 - w / 2)), y: Math.max(0, Math.min(H - h2, p.y - h2 / 3)), w, h: h2 });
    };
    return { svg, COL, SYM: SY, fit: () => pz.set({ x: 0, y: 0, w: W2, h: H }), focus, pos };
  }

  // js/ui/v6/views-a.js
  init_tech();
  init_archive();
  var DOMAIN_JA = { economy: "\u7D4C\u6E08", military: "\u8ECD\u4E8B", politics: "\u653F\u6CBB", states: "\u56FD\u5BB6", population: "\u4EBA\u53E3", war_diplomacy: "\u5916\u4EA4" };
  var TREATY_EFFECT = { nonaggression: "\u52B9\u679C: \u4E92\u3044\u306B\u5BA3\u6226\u3067\u304D\u306A\u3044\u3002\u8ECD\u306E\u652F\u6301\u304C\u3084\u3084\u4E0B\u304C\u308B\u3002", alliance: "\u52B9\u679C: \u98DF\u6599\u4E0D\u8DB3\u306E\u5B89\u5B9A\u4F4E\u4E0B\u3092\u548C\u3089\u3052\u3001\u8CB4\u65CF\u306E\u652F\u6301\u304C\u4E0A\u304C\u308B\u3002\u4E00\u65B9\u304C\u6226\u3046\u3068\u3001\u4ED6\u65B9\u304C\u53C2\u6226\u3059\u308B\u3053\u3068\u304C\u3042\u308B\u3002", trade: "\u52B9\u679C: \u96A3\u63A5\u3059\u308B\u56FD\u306E\u9593\u3067\u4EA4\u6613\u304C\u6210\u7ACB\u3057\u3001\u958B\u653E\u5EA6\u306B\u5FDC\u3058\u3066\u7523\u696D\u30FB\u4EA4\u6613\u53CE\u5165\u30FB\u5546\u4EBA\u306E\u652F\u6301\u304C\u4E0A\u304C\u308B\u3002\u5C01\u9396\u30FB\u5236\u88C1\u4E2D\u306F\u6210\u7ACB\u3057\u306A\u3044\u3002" };
  var civ = () => S2.w.civ;
  var date = (mi) => formatWorldDate(S2.w, mi);
  var link = (id) => civ().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => {
    e.preventDefault();
    S2.hooks.select(id);
  } }, stateName(id)) : String(id);
  var note = (t) => h("p", { class: "n" }, t);
  var why = (t) => h("p", { class: "n err", id: "why" }, t);
  function pGeo() {
    const M = S2.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "\u5730\u7406"), note("\u5404\u30EC\u30A4\u30E4\u30FC\u3092\u81EA\u7531\u306B\u91CD\u306D\u3089\u308C\u307E\u3059\u3002\u3088\u304F\u4F7F\u3046\u7D44\u307F\u5408\u308F\u305B\u306F\u30D7\u30EA\u30BB\u30C3\u30C8\u304B\u3089\u3002\u9805\u76EE\u540D\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u51E1\u4F8B\u3001\u5857\u308A\u306E\u5C64\u306F\u4E0D\u900F\u660E\u5EA6\u3082\u5909\u3048\u3089\u308C\u307E\u3059\u3002"), lb("\u30D7\u30EA\u30BB\u30C3\u30C8", "PRESET"));
    const done2 = () => {
      S2.hooks.mapOnly();
      S2.hooks.panel();
    };
    box.append(h("div", { class: "chips" }, ...PRESETS.map(([id, ja]) => h("b", { class: M.preset === id ? "on" : "", "data-preset": id, onclick: () => {
      M.setPreset(id);
      done2();
    } }, ja))));
    const legend = (key) => S2.layerOpen === key ? h("div", { class: "lg", style: "flex-direction:column;gap:3px;margin:2px 0 8px 22px" }, ...M.legend(key).map((x) => h("span", {}, x.c ? h("i", { style: `background:${x.c}` }) : x.dot ? h("i", { style: `background:${x.dot};border-radius:50%` }) : h("i", { style: `border-top:2px ${x.dash ? "dashed" : "solid"} ${x.dash ?? x.line};height:0` }), x.t))) : null;
    for (const [gid, ja, en] of GROUPS) {
      box.append(lb(ja, en));
      for (const [id, name] of LAYERS.filter((l) => l[2] === gid).reverse()) {
        const fill = FILL_IDS.includes(id), on = M.isOn(id);
        box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ly-" + id, checked: on, onchange: () => {
          M.toggle(id);
          done2();
        } }), h("span", { class: "g", onclick: () => {
          S2.layerOpen = S2.layerOpen === id ? null : id;
          S2.hooks.panel();
        } }, name), fill && on ? h("input", { type: "range", class: "opa", min: 20, max: 100, value: Math.round(M.alpha[id] * 100), title: "\u4E0D\u900F\u660E\u5EA6", oninput: (e) => {
          M.alpha[id] = e.target.value / 100;
          M.interact();
        } }) : null), legend(id)));
      }
    }
    return box.append(note("\u5730\u5F62\u30FB\u6C17\u5019\u30FB\u8CC7\u6E90\u3092\u751F\u6210\u5F8C\u306B\u624B\u3067\u7DE8\u96C6\u3059\u308B\u6A5F\u80FD\u306F\u8A2D\u3051\u3066\u3044\u307E\u305B\u3093\u3002"), h("div", { class: "rowb" }, btn("\u8868\u793A\u3092\u521D\u671F\u4F4D\u7F6E\u3078", () => {
      M.view = { x: 0, y: 0, k: 1 };
      M.draw();
    }))) || box;
  }
  function pNations() {
    const c = civ(), pv = S2.w.viewPast, all = pv != null ? pastView(c, pv).states.map((x) => ({ id: x.id, name: x.name ?? "\uFF08\u540D\u524D\u306E\u8CC7\u6599\u304C\u5931\u308F\u308C\u305F\u56FD\u5BB6\uFF09", polity: x.polity, formedAt: x.formedAt ?? -Infinity, alive: true, partial: x.partial })) : Object.values(c.states).filter((s) => S2.showDead ? true : s.alive), list = all.sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "\u56FD\u5BB6"), pv != null ? h("p", { class: "n err" }, `\u904E\u53BB\uFF08${date(pv)}\uFF09\u306E\u56FD\u5BB6\u3092\u3001\u6B8B\u3063\u3066\u3044\u308B\u6B74\u53F2\u8CC7\u6599\u304B\u3089\u518D\u69CB\u6210\u3057\u3066\u8868\u793A\u3057\u3066\u3044\u307E\u3059\uFF08\u8AAD\u307F\u53D6\u308A\u5C02\u7528\uFF09\u3002\u8CC7\u6599\u304C\u5931\u308F\u308C\u305F\u90E8\u5206\u306F\u4E0D\u660E\u3067\u3001\u4F55\u3082\u7121\u304B\u3063\u305F\u3068\u3044\u3046\u610F\u5473\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`) : null);
    if (pv == null && S2.sel && c.states[S2.sel]) box.append(stateDetail(c.states[S2.sel]));
    box.append(lb("\u56FD\u5BB6\u4E00\u89A7", "\u65B0\u3057\u3044\u9806"), h("div", { class: "rowb" }, h("label", {}, h("input", { type: "checkbox", id: "show-dead", checked: !!S2.showDead, onchange: (e) => {
      S2.showDead = e.target.checked;
      S2.hooks.panel();
    } }), " \u6EC5\u4EA1\u3057\u305F\u56FD\u5BB6\u3082\u8868\u793A")), note(`${list.length} \u4EF6\u3002\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u958B\u304D\u307E\u3059\uFF08\u30AF\u30EA\u30C3\u30AF\u3060\u3051\u3067\u306F\u62C5\u5F53\u306F\u5909\u308F\u308A\u307E\u305B\u3093\uFF09\u3002`));
    box.append(vlist(list, 40, (s) => h("div", { class: "vrow full" + (S2.sel === s.id ? " on" : ""), onclick: () => S2.hooks.select(s.id) }, h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", { style: "color:var(--dim)" }, ` ${s.alive ? "\u4EBA\u53E3 " + n0(s.pop) : "\u6EC5\u4EA1"}\u30FB\u6210\u7ACB ${date(s.formedAt).split("\u6708")[0]}\u6708`))));
    return box;
  }
  function stateDetail(st2) {
    const c = civ(), mine = controlled() === st2.id, tabs = [["politics", "\u5185\u653F"], ["military", "\u8ECD\u4E8B"], ["diplomacy", "\u5916\u4EA4"], ["tech", "\u6280\u8853\u30C4\u30EA\u30FC"], ["doctrine", "\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"]];
    const body = { politics: tPolitics, military: tMilitary, diplomacy: tDiplomacy, tech: tTech, doctrine: tDoctrine }[S2.tab](st2, mine);
    return h(
      "div",
      { class: "rs" },
      h("div", { class: "card br" }, h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st2.id)}` }), st2.name), h("div", { class: "sub" }, `${polityJa(st2.polity)}${st2.alive ? "" : "\u30FB\u6EC5\u4EA1"}\u30FB\u6210\u7ACB ${date(st2.formedAt)}`), h("div", { class: "rowb" }, mine ? btn("\u62C5\u5F53\u3092\u89E3\u9664\u3059\u308B", () => {
        run({ type: "control.release" });
        S2.hooks.render();
      }, "p", { id: "release" }) : btn("\u3053\u306E\u56FD\u3092\u62C5\u5F53\u3059\u308B", () => {
        run({ type: "control.take", stateId: st2.id });
        S2.hooks.render();
      }, "p", { id: "take", disabled: !st2.alive }), mine ? h("small", { style: "color:var(--purple)" }, "\u62C5\u5F53\u4E2D\uFF08\u64CD\u4F5C\u306F\u62C5\u5F53\u56FD\u306E\u307F\uFF09") : h("small", { style: "color:var(--dim)" }, "\u95B2\u89A7\u4E2D\uFF08\u62C5\u5F53\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF09"))),
      h("div", { class: "tabs" }, ...tabs.map(([k, ja]) => h("b", { class: S2.tab === k ? "on" : "", "data-tab": k, onclick: () => {
        S2.tab = k;
        S2.hooks.panel();
      } }, ja))),
      S2.notice ? why(S2.notice) : null,
      body
    );
  }
  var factionRows = (st2) => Object.entries(st2.politics?.factions ?? {});
  function tPolitics(st2, mine) {
    const c = civ(), P2 = st2.politics, L = st2.leader, leg = P2 ? effective(c, st2, "legitimacy") : 0, fat = P2 ? effective(c, st2, "fatigue") : 0;
    const finBtn = stat("\u8CA1\u653F \u25B8", n0(st2.treasury));
    finBtn.id = "fin-open";
    finBtn.title = "\u30AF\u30EA\u30C3\u30AF\u3067\u8CA1\u653F\u306E\u8A73\u7D30";
    finBtn.style.cursor = "pointer";
    finBtn.addEventListener("click", () => {
      S2.fin = !S2.fin;
      S2.hooks.panel();
    });
    const out = h("div", {}, h("div", { class: "st", style: "grid-template-columns:repeat(3,1fr)" }, stat("\u4EBA\u53E3", n0(st2.pop)), finBtn, stat("\u5B89\u5B9A\u5EA6", pct(st2.stability)), stat("\u75B2\u52B4\u5EA6", pct(fat)), stat("\u7523\u696D\u529B", n0(effective(c, st2, "industry"))), stat("\u6B63\u7D71\u6027", pct(leg))));
    if (S2.fin) out.append(finance(st2, mine));
    out.append(lb("\u70BA\u653F\u8005", "RULER"), h("div", { class: "row" }, face(L?.name ?? "\u2014", st2.id), h("span", { class: "g" }, h("b", {}, L?.name ?? "\u2014"), h("br"), h("small", {}, `${polityJa(st2.polity)}\u30FB${L?.heir ? "\u7D99\u627F\u8005\u3092\u6307\u540D\u6E08\u307F" : "\u7D99\u627F\u8005\u306F\u672A\u6307\u540D"}`))));
    const rl = h("div", { class: "rowb" }, btn("\u7D99\u627F\u8005\u3092\u6307\u540D", () => act({ type: "state.act", stateId: st2.id, action: "designate_heir" }), "", { disabled: !mine || !!L?.heir, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }));
    const nm = h("input", { id: "leader-name", placeholder: "\u70BA\u653F\u8005\u306E\u540D\u524D\uFF08\u5275\u9020\u4E3B\u306E\u7DE8\u96C6\uFF09", value: L?.name ?? "" });
    rl.append(nm, btn("\u5225\u306E\u5BB6\u7CFB\u306E\u70BA\u653F\u8005\u306B\u4EA4\u4EE3\u3055\u305B\u308B\uFF08\u5275\u9020\u4E3B\uFF09", () => creator({ type: "creator.editState", stateId: st2.id, changes: { "leader.name": nm.value } }), "", { id: "leader-replace" }));
    out.append(rl, note("\u540D\u524D\u3092\u5165\u308C\u3066\u4EA4\u4EE3\u3055\u305B\u308B\u3068\u3001\u300C\u738B\u671D\u306E\u4EA4\u4EE3\u300D\u3068\u3057\u3066\u8A18\u9332\u3055\u308C\u3001\u524D\u306E\u70BA\u653F\u8005\u306F\u9000\u4F4D\u3057\u307E\u3059\u3002"));
    const sn = h("input", { id: "state-name", value: st2.name }), pol = h("select", { id: "polity-sel" }, ...Object.entries(POLITY_JA).map(([k, ja]) => h("option", { value: k, selected: k === st2.polity }, ja)));
    out.append(lb("\u540D\u79F0\u30FB\u653F\u4F53", "IDENTITY"), h("div", { class: "rowb" }, sn, btn("\u56FD\u540D\u3092\u5909\u66F4", () => creator({ type: "creator.editState", stateId: st2.id, changes: { name: sn.value } }))), h("div", { class: "rowb" }, pol, btn("\u653F\u4F53\u3092\u5909\u66F4\uFF08\u5275\u9020\u4E3B\uFF09", () => creator({ type: "creator.editState", stateId: st2.id, changes: { polity: pol.value } })), btn("\u653F\u4F53\u5909\u66F4\uFF08\u884C\u52D5\uFF09", () => act({ type: "state.act", stateId: st2.id, action: "change_polity", opt: pol.value }), "", { disabled: !mine })), note("\u540D\u79F0\u306E\u5909\u66F4\u306F\u8868\u793A\u540D\u3060\u3051\u3067\u3059\u3002"));
    if (P2) {
      const rows = factionRows(st2);
      out.append(lb("\u652F\u6301\u52E2\u529B", "FACTIONS"), ...rows.map(([k, v]) => h("div", { class: "fr" }, h("div", { class: "t" }, h("span", {}, FACTION_JA[k] ?? k), h("span", {}, `\u652F\u6301 ${pct(v.support)}\u30FB\u5F71\u97FF\u529B ${pct(v.influence)}`)), h("div", { class: "bar" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })))), P2.assembly ? h("div", {}, h("small", {}, "\u8B70\u4F1A\uFF08\u8B70\u5E2D\u306F\u5F71\u97FF\u529B\u306B\u6BD4\u4F8B\uFF09"), hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : note("\u3053\u306E\u653F\u4F53\u306B\u306F\u8B70\u4F1A\u304C\u3042\u308A\u307E\u305B\u3093\u3002"));
    }
    const ideas = ideasOf(st2);
    if (ideas.length) out.append(lb("\u601D\u60F3", "IDEAS"), table(["\u601D\u60F3", "\u5E83\u304C\u308A"], ideas.slice(0, 6).map((x) => [x.ja, pct(x.v)])), note("\u601D\u60F3\u306F\u6761\u4EF6\u304B\u3089\u81EA\u7136\u306B\u751F\u307E\u308C\u3001\u63A5\u3059\u308B\u56FD\u30FB\u4EA4\u6613\u30FB\u540C\u76DF\u3092\u901A\u3058\u3066\u5E83\u304C\u308A\u307E\u3059\u3002\u7981\u6B62\u306F\u3067\u304D\u307E\u305B\u3093\u3002"));
    out.append(creatorBox(st2));
    return out;
  }
  function finance(st2, mine) {
    const c = civ(), tax = st2.pop * st2.policy.tax * 12e-4 * taxMult(st2), trade = effective(c, st2, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"], items = [["\u7A0E\u53CE\uFF08\u5E74\u306E\u76EE\u5B89\uFF09", tax], ["\u4EA4\u6613\u53CE\u5165\uFF08\u76F4\u8FD1\u306E\u671F\uFF09", trade]];
    return h("div", { class: "card", id: "fin" }, h("b", {}, "\u8CA1\u653F\u306E\u8A73\u7D30"), h("div", { class: "row" }, donut(items, cols), h("span", { class: "g" }, ...items.map((x, i) => h("div", {}, h("i", { style: `display:inline-block;width:10px;height:10px;background:${cols[i]};margin-right:5px` }), `${x[0]} ${n0(x[1])}`)), h("div", { class: "n" }, `\u7A0E\u7387 ${pct(st2.policy.tax)}\uFF08\u4E0A\u9650 ${pct(st2.politics?.taxCeiling ?? 0.4)}\uFF09\u30FB\u56FD\u5EAB ${n0(st2.treasury)}`))), h("div", { class: "rowb" }, btn("\u5897\u7A0E\uFF08+5%\uFF09", () => act({ type: "state.act", stateId: st2.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }), btn("\u6E1B\u7A0E\uFF08\u22125%\uFF09", () => act({ type: "state.act", stateId: st2.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine })), note("\u7A0E\u7387\u306E\u5909\u66F4\u306F\u3001\u6B21\u306E\u7A0E\u53CE\u306E\u8A08\u7B97\u306B\u305D\u306E\u307E\u307E\u53CD\u6620\u3055\u308C\u307E\u3059\u3002\u5185\u8A33\u306F\u3001\u5B9F\u969B\u306E\u8A08\u7B97\u5F0F\uFF08\u4EBA\u53E3\xD7\u7A0E\u7387\xD7\u6280\u8853\u306E\u500D\u7387\uFF09\u304B\u3089\u6C42\u3081\u3066\u3044\u307E\u3059\u3002"));
  }
  function creatorBox(st2) {
    const c = civ(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, `${DOMAIN_JA[f.domain ?? { industry: "economy", perCapita: "economy", tradeIncome: "economy", foodBalance: "economy", taxRevenue: "economy", equipLevel: "military", readiness: "military", legitimacy: "politics", fatigue: "politics" }[k]] ?? ""}\u30FB${f.ja}`))), other2 = h("select", { id: "iv-other", style: "display:none" }, ...aliveStates().filter((x) => x.id !== st2.id).sort((a, b) => b.pop - a.pop).slice(0, 60).map((x) => h("option", { value: x.id }, x.name))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "\u534A\u6E1B\u671F(\u6708)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "\u7406\u7531\u306E\u6CE8\u91C8" }), info = h("p", { class: "n", id: "iv-info" });
    const upd = () => {
      const k = field.value, pair = !!FIELDS[k].pair;
      other2.style.display = pair ? "" : "none";
      const o = pair ? other2.value : null, nm = nominalOf(c, st2, k, o);
      info.textContent = nm == null ? "\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093" : `\u901A\u5E38\u8A08\u7B97\u5024 ${r23(nm)}\u30FB\u6709\u52B9\u5024 ${r23(effective(c, st2, k, o))}\u30FB\u7BC4\u56F2 ${FIELDS[k].min}\u301C${FIELDS[k].max}\u30FB\u65E2\u5B9A\u306E\u534A\u6E1B\u671F ${FIELDS[k].half}\u304B\u6708`;
    };
    field.addEventListener("change", upd);
    other2.addEventListener("change", upd);
    setTimeout(upd, 0);
    const mineIv = interventionsOf(c).filter((r) => r.targetId === st2.id).slice(-6).reverse();
    return h(
      "div",
      {},
      lb("\u5275\u9020\u4E3B\u306E\u4ECB\u5165", "INTERVENTION"),
      note("\u8A08\u7B97\u3055\u308C\u308B\u5024\u306B\u4E00\u6642\u7684\u306A\u88DC\u6B63\u3092\u5165\u308C\u307E\u3059\u3002\u88DC\u6B63\u306F\u6642\u9593\u3068\u3068\u3082\u306B\u901A\u5E38\u5024\u3078\u623B\u308A\u307E\u3059\u304C\u3001\u4ECB\u5165\u4E2D\u306B\u8D77\u304D\u305F\u7D50\u679C\u306F\u623B\u308A\u307E\u305B\u3093\u3002"),
      h("div", { class: "rowb" }, field, other2, val, half),
      rsn,
      h("div", { class: "rowb" }, btn("\u4ECB\u5165\u3059\u308B", () => creator({ type: "creator.intervene", stateId: st2.id, field: field.value, otherId: FIELDS[field.value].pair ? other2.value : null, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })),
      info,
      ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field}${r.otherId ? "\uFF08\u2192" + stateName(r.otherId) + "\uFF09" : ""} \u2192 ${r23(r.target)}`, h("br"), h("small", {}, `${{ active: "\u6709\u52B9\uFF08\u6B8B\u308A " + r23(r.residual) + "\uFF09", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" }[r.status]}\u30FB${date(r.startMonth)}${r.reason ? "\u30FB" + r.reason : ""}`)), r.status === "active" ? btn("\u53D6\u308A\u6D88\u3059", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null))
    );
  }
  function tMilitary(st2, mine) {
    const c = civ(), M = st2.military;
    if (!M) return note("\u8ECD\u4E8B\u306E\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
    const foes = aliveStates().filter((x) => x.id !== st2.id).sort((a, b) => b.pop - a.pop), sel = h("select", { id: "wl-target" }, ...foes.slice(0, 40).map((x) => h("option", { value: x.id }, x.name))), out = h("div", { id: "wl-out" });
    const show = () => {
      const p = predictWar(c, st2.id, sel.value, S2.w.sim.ctx);
      out.replaceChildren(p ? warlabView(p) : "\u4E88\u6E2C\u3067\u304D\u307E\u305B\u3093");
    };
    sel.addEventListener("change", show);
    setTimeout(() => sel.isConnected && show(), 0);
    const shares = M.shares ?? {}, inputs = Object.entries(UNIT_KINDS).map(([k, u]) => [k, h("input", { type: "number", step: "0.05", min: 0, max: 1, value: r23(shares[k] ?? 0), style: "width:62px", "data-kind": k })]);
    return h(
      "div",
      {},
      h("div", { class: "st", style: "grid-template-columns:repeat(2,1fr)" }, stat("\u5175\u529B", n0(st2.army)), stat("\u8ECD\u4E8B\u80FD\u529B", (st2.milBonus >= 0 ? "+" : "") + pct(st2.milBonus)), stat("\u88C5\u5099\u6C34\u6E96\uFF08\u6709\u52B9\u5024\uFF09", pct(effective(c, st2, "equipLevel"))), stat("\u7DF4\u5EA6\uFF08\u6709\u52B9\u5024\uFF09", pct(effective(c, st2, "readiness")))),
      lb("\u90E8\u968A", "UNITS"),
      table(["\u90E8\u968A", "\u898F\u6A21", "\u88C5\u5099", "\u7DF4\u5EA6"], M.units.map((u) => [u.name, n0(u.size), pct(u.equip), pct(u.readiness)])),
      note(`\u5145\u8DB3\u306F\u7523\u696D\u529B\u30FB\u88C5\u5099\u6761\u4EF6\u304B\u3089\u7B97\u51FA\u3055\u308C\u3001\u4ECB\u5165\u304C\u3042\u308C\u3070\u6709\u52B9\u5024\u3092\u4F7F\u3044\u307E\u3059\uFF08\u7523\u696D\u529B ${n0(effective(c, st2, "industry"))}\uFF09\u3002`),
      lb("\u7DE8\u5236", "ORGANIZATION"),
      h("div", { class: "rowb" }, ...inputs.map(([k, el]) => h("label", {}, UNIT_KINDS[k].ja + " ", el))),
      h("div", { class: "rowb" }, btn("\u7DE8\u5236\u3092\u5909\u66F4", () => {
        const s = {};
        for (const [k, el] of inputs) s[k] = Number(el.value) || 0;
        const r = (mine ? act : creator)({ type: "state.reorganize", stateId: st2.id, shares: s });
      }, "", { id: "reorg" })),
      note("\u5408\u8A08\u306F 1\u3002\u6761\u4EF6\uFF08\u6280\u8853\u30FB\u5730\u7406\uFF09\u3068\u8CBB\u7528\u3092\u6E80\u305F\u3055\u306A\u3044\u7DE8\u5236\u306F\u7406\u7531\u3064\u304D\u3067\u62D2\u5426\u3055\u308C\u307E\u3059\u3002\u62C5\u5F53\u56FD\u307E\u305F\u306F\u5275\u9020\u4E3B\u304C\u5909\u66F4\u3067\u304D\u307E\u3059\u3002"),
      lb("\u5BA3\u6226", "WAR"),
      h("div", { class: "rowb" }, btn("\u9078\u3093\u3060\u56FD\u3078\u5BA3\u6226\u3059\u308B", () => act({ type: "state.act", stateId: st2.id, action: "declare_war", target: sel.value }), "", { id: "declare", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }), !mine ? h("small", { style: "color:var(--dim)" }, "\u62C5\u5F53\u56FD\u306E\u307F\u5B9F\u884C\u3067\u304D\u307E\u3059") : null),
      sel,
      lb("\u6226\u4E89\u7814\u7A76\u6240\uFF08\u4E88\u6E2C\uFF09", "WAR LAB"),
      note("\u3053\u306E\u56FD\u304C\u653B\u3081\u308B\u5834\u5408\u306E\u898B\u901A\u3057\u3067\u3059\u3002\u78BA\u5B9A\u3057\u305F\u672A\u6765\u3067\u306F\u306A\u304F\u3001\u4E16\u754C\u306E\u72B6\u614B\u306F\u5909\u3048\u307E\u305B\u3093\u3002"),
      out
    );
  }
  function warlabView(p) {
    return h("div", {}, h("div", {}, `\u52DD\u5229 ${pct(p.pAWin)}\uFF08${pct(p.pAWinRange[0])}\u301C${pct(p.pAWinRange[1])}\uFF09\u30FB\u5F15\u304D\u5206\u3051 ${pct(p.pStalemate)}\u30FB\u6557\u5317 ${pct(p.pBWin)}`), h("div", { class: "bar" }, h("i", { style: `width:${p.pAWin * 100}%;background:var(--blue)` }), h("i", { style: `width:${p.pStalemate * 100}%;background:#6a6f78` }), h("i", { style: `width:${p.pBWin * 100}%;background:var(--red)` })), h("div", { class: "n" }, `\u898B\u8FBC\u307F\u306E\u640D\u8017: \u81EA\u8ECD ${pct(p.lossA)} / \u76F8\u624B ${pct(p.lossB)}\u30FB\u9577\u5F15\u304F\u76EE\u5B89 ${p.months}\u304B\u6708\u30FB\u4E0D\u78BA\u5B9F\u6027 ${pct(p.uncertainty)}`), table(["\u8981\u56E0", stateName(p.aId), stateName(p.bId)], p.factors.map((x) => [x.ja, x.a, x.b])));
  }
  function tDiplomacy(st2, mine) {
    const c = civ(), others = aliveStates().filter((x) => x.id !== st2.id).sort((a, b) => (st2.relations[b.id] ?? 0) - (st2.relations[a.id] ?? 0)), sel = h("select", { id: "dp-target" }, ...others.slice(0, 40).map((x) => h("option", { value: x.id }, `${x.name}\uFF08\u95A2\u4FC2 ${Math.round(st2.relations[x.id] ?? 0)}\uFF09`))), type = h("select", { id: "dp-type" }, ...Object.entries(TREATY).map(([k, v]) => h("option", { value: k }, v.ja))), out = h("div", { id: "dp-out" });
    const prev = () => {
      const to = c.states[sel.value];
      if (!to) return;
      const fe = treatyFeasible(c, st2, to, type.value), e = evaluateTreaty(c, st2, to, type.value);
      out.replaceChildren(fe ? h("div", { class: "n err", id: "dp-infeasible" }, `\u7DE0\u7D50\u3067\u304D\u306A\u3044\u72B6\u6CC1: ${fe}`) : null, h("div", { class: "n" }, TREATY_EFFECT[type.value] ?? ""), h("div", {}, `\u76F8\u624B\u306E\u8A55\u4FA1: ${e.accept ? "\u53D7\u3051\u5165\u308C\u305D\u3046" : "\u65AD\u3089\u308C\u305D\u3046"}\uFF08${e.score}\uFF09${e.counter ? "\u30FB\u5225\u6761\u4EF6: " + TREATY[e.counter.type].ja : ""}`), ...e.factors.map((f) => h("small", { style: "display:block;color:var(--dim)" }, `${f.ja} ${f.v}`)));
    };
    sel.addEventListener("change", prev);
    type.addEventListener("change", prev);
    setTimeout(() => sel.isConnected && prev(), 0);
    const tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st2.id || t.b === st2.id), wars = st2.warIds.map((i) => c.wars[i]).filter(Boolean), hist = proposalsOf(c).filter((p) => p.from === st2.id || p.to === st2.id).slice(-8).reverse();
    return h(
      "div",
      {},
      lb("\u95A2\u4FC2\u306E\u826F\u3044\u56FD", "RELATIONS"),
      table(["\u56FD", "\u95A2\u4FC2"], others.slice(0, 6).map((x) => [link(x.id), Math.round(st2.relations[x.id] ?? 0)])),
      lb("\u7DE0\u7D50\u6E08\u307F\u306E\u6761\u7D04", "TREATIES"),
      tr.length ? table(["\u7A2E\u985E", "\u76F8\u624B", "\u7DE0\u7D50", ""], tr.map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a === st2.id ? t.b : t.a), date(t.signedAt ?? t.at ?? 0), btn("\u7834\u68C4", () => act({ type: "state.act", stateId: st2.id, action: "break_treaty", target: t.id }), "", { class: "b brk", disabled: !mine, title: mine ? "\u7834\u68C4\u3059\u308B\u3068\u76F8\u624B\u3068\u306E\u95A2\u4FC2\u304C\u60AA\u5316\u3059\u308B" : "\u62C5\u5F53\u56FD\u306E\u307F" })])) : note("\u306A\u3057"),
      lb("\u4EA4\u6226\u4E2D", "AT WAR"),
      wars.length ? h("div", {}, ...wars.map((x) => h("div", { class: "row" }, link(x.aggressor === st2.id ? x.defender : x.aggressor), h("span", { class: "g" }), btn("\u6226\u4E89\u306E\u8A73\u7D30\u3078", () => {
        S2.war = x.id;
        S2.hub = "war";
        S2.hooks.render();
      })))) : note("\u306A\u3057\u3002\u8B1B\u548C\u306F\u4E00\u822C\u6761\u7D04\u3067\u306F\u306A\u304F\u3001\u6226\u4E89\u306E\u8A73\u7D30\u304B\u3089\u884C\u3044\u307E\u3059\u3002"),
      lb("\u6761\u7D04\u3092\u63D0\u6848\u3059\u308B\uFF08\u8B1B\u548C\u3092\u9664\u304F\uFF09", "PROPOSE"),
      h("div", { class: "rowb" }, sel, type),
      h("div", { class: "rowb" }, btn("\u63D0\u6848\u3059\u308B", () => act({ type: "state.act", stateId: st2.id, action: "sign_treaty", target: sel.value, opt: type.value }), "p", { id: "propose", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" })),
      out,
      h("div", { class: "rowb" }, btn("\u5236\u88C1\u3092\u79D1\u3059", () => act({ type: "state.act", stateId: st2.id, action: "impose_sanctions", target: sel.value }), "", { id: "sanction", disabled: !mine }), btn("\u548C\u89E3\u306E\u4F7F\u7BC0", () => act({ type: "state.act", stateId: st2.id, action: "reconcile", target: sel.value }), "", { id: "reconcile", disabled: !mine })),
      note("\u6761\u7D04\u306F\u3001\u76F8\u624B\u56FD\u304C\u53D7\u3051\u5165\u308C\u305F\u3068\u304D\u3060\u3051\u6210\u7ACB\u3057\u307E\u3059\u3002\u6761\u4EF6\u3092\u6E80\u305F\u3055\u306A\u3044\u63D0\u6848\u306F\u3001\u7406\u7531\u3064\u304D\u3067\u65AD\u3089\u308C\u307E\u3059\u3002"),
      lb("\u4EA4\u6E09\u306E\u8A18\u9332", "NEGOTIATIONS"),
      ...hist.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "\u8B1B\u548C" : TREATY[p.type]?.ja} ${stateName(p.from)}\u2192${stateName(p.to)}`, h("br"), h("small", {}, date(p.at))), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status])))
    );
  }
  function techStatus(st2) {
    const c = civ(), groups = Object.values(c.groups).filter((g) => g.stateId === st2.id), total = groups.reduce((a, g) => a + g.pop, 0) || 1, have = {}, lostHere = /* @__PURE__ */ new Set();
    for (const g of groups) {
      for (const k in g.tech?.known ?? {}) have[k] = (have[k] ?? 0) + g.pop;
      for (const k in g.tech?.lost ?? {}) lostHere.add(k);
    }
    const cov = (k) => (have[k] ?? 0) / total, f = (t) => st2.techAdopted?.[t.key] != null ? "adopted" : cov(t.key) >= 0.3 ? "available" : cov(t.key) > 0 ? "known" : lostHere.has(t.key) ? "lost" : "locked";
    f.cov = cov;
    return f;
  }
  var CAP_JA = { "polity:chiefdom": "\u9996\u9577\u5236\u3078", "polity:kingdom": "\u738B\u56FD\u3078", "polity:republic": "\u5171\u548C\u653F\u3078", "polity:empire": "\u5E1D\u56FD\u3078", "action:found_city": "\u90FD\u5E02\u3092\u5EFA\u8A2D\u3067\u304D\u308B", "action:build_fortification": "\u8981\u585E\u3092\u6574\u5099\u3067\u304D\u308B", "action:covert_op": "\u79D8\u5BC6\u5DE5\u4F5C", "action:impose_sanctions": "\u7D4C\u6E08\u5236\u88C1", "action:nuclear_program": "\u6838\u8A08\u753B", "treaty:nonaggression": "\u4E0D\u53EF\u4FB5\u6761\u7D04", "treaty:alliance": "\u540C\u76DF", "treaty:trade": "\u4EA4\u6613\u6761\u7D04", "unit:ranged": "\u5F13\u30FB\u6295\u5C04\u5175", "unit:cavalry": "\u9A0E\u5175", "unit:navy": "\u6C34\u8ECD", "unit:garrison": "\u5B88\u5099\u5175", "unit:firearms": "\u9283\u5175", "unit:armor": "\u6A5F\u7532", "unit:air": "\u822A\u7A7A", "econ:coinage": "\u8CA8\u5E63\u7D4C\u6E08", "econ:credit": "\u4FE1\u7528\u30FB\u91D1\u878D", "subsist:agriculture": "\u8FB2\u8015", "subsist:pastoral": "\u7267\u755C", "subsist:fishing": "\u6F01\u6488", "move:sea": "\u6D77\u3092\u6E21\u308B", "move:ocean": "\u5916\u6D0B\u822A\u6D77", "trade:land_long": "\u9678\u306E\u9060\u8DDD\u96E2\u4EA4\u6613", "trade:sea_long": "\u6D77\u306E\u9060\u8DDD\u96E2\u4EA4\u6613", "trade:rail": "\u9244\u9053\u8F38\u9001", "admin:records": "\u8A18\u9332", "admin:officials": "\u5B98\u8077", "admin:courier": "\u516C\u306E\u901A\u4FE1\u7DB2", "admin:land_survey": "\u571F\u5730\u306E\u6E2C\u91CF", "war:far": "\u9060\u5F81\u306E\u88DC\u7D66", "war:naval": "\u6D77\u6226", "pop:cold": "\u5BD2\u51B7\u5730\u306B\u4F4F\u3081\u308B", "pop:steppe": "\u8349\u539F\u3067\u751F\u304D\u308B", "storage:pottery": "\u8CAF\u8535", "policy:tax_high": "\u9AD8\u3044\u7A0E\u7387", "policy:parliament": "\u8B70\u4F1A\u5236" };
  var FX_JA2 = { cap: "\u53CE\u5BB9\u529B", tax: "\u7A0E\u53CE", trade: "\u4EA4\u6613", ind: "\u7523\u696D\u529B", off: "\u653B\u6483", def: "\u9632\u5FA1", health: "\u885B\u751F", learn: "\u5B66\u7FD2\u30FB\u4F1D\u64AD" };
  var TECH_LANE = null;
  var TECH_Q = "";
  var TECH_FULL = false;
  var TECH_VB = null;
  var DOC_VB = null;
  function tTech(st2, mine) {
    const c = civ(), status = techStatus(st2), sel = TECH[S2.tech] ?? null, q2 = TECH_Q.trim(), hit = q2 ? new Set(TECHS.filter((t) => t.name.includes(q2) || t.key.includes(q2) || t.field.includes(q2)).map((t) => t.key)) : null;
    const tree = techTree({ techs: TECHS, status, selected: S2.tech, lane: TECH_LANE, hit, vb0: TECH_VB, onView: (v) => {
      TECH_VB = v;
    }, onPick: (t) => {
      S2.tech = t.key;
      S2.hooks.panel();
    } }), { svg, COL, SYM } = tree, s = sel && status(sel);
    const lab = { adopted: "\u5236\u5EA6\u5316\u6E08\u307F\uFF08\u3053\u306E\u56FD\u304C\u63A1\u7528\uFF09", available: "\u63A1\u7528\u3067\u304D\u308B\uFF08\u56FD\u5185\u306E\u4EBA\u53E3\u306E 3 \u5272\u4EE5\u4E0A\u304C\u77E5\u3063\u3066\u3044\u308B\uFF09", known: "\u4FDD\u6709\uFF08\u4E00\u90E8\u306E\u96C6\u56E3\u3060\u3051\u304C\u77E5\u308B\u3002\u56FD\u3068\u3057\u3066\u306F\u307E\u3060\u63A1\u7528\u3067\u304D\u306A\u3044\uFF09", lost: "\u5931\u308F\u308C\u305F\uFF08\u304B\u3064\u3066\u77E5\u3063\u3066\u3044\u305F\u304C\u3001\u4ECA\u306F\u8AB0\u3082\u77E5\u3089\u306A\u3044\uFF09", locked: "\u672A\u767A\u898B" };
    const laneBtns = [btn("\u3059\u3079\u3066", () => {
      TECH_LANE = null;
      S2.hooks.panel();
    }, TECH_LANE ? "" : "p"), ...LANES.map((l) => btn(l.ja.slice(0, 5), () => {
      TECH_LANE = l.id;
      S2.hooks.panel();
    }, TECH_LANE === l.id ? "p" : ""))];
    const search = h("input", { type: "search", placeholder: "\u6280\u8853\u540D\u30FB\u5206\u91CE\u3067\u63A2\u3059", value: TECH_Q, style: "width:100%", oninput: (e) => {
      TECH_Q = e.target.value;
      clearTimeout(search._t);
      search._t = setTimeout(() => {
        S2.hooks.panel();
        document.querySelector("#tech-q")?.focus();
      }, 250);
    }, id: "tech-q" });
    let detail = note("\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u524D\u63D0\u30FB\u6210\u7ACB\u306E\u6761\u4EF6\u30FB\u89E3\u7981\u3055\u308C\u308B\u3053\u3068\u30FB\u52B9\u679C\u30FB\u4E16\u754C\u3067\u306E\u5E83\u304C\u308A\u304C\u51FA\u307E\u3059\u3002");
    if (sel) {
      const gs = Object.values(c.groups).filter((g) => g.stateId === st2.id), cov = Math.round(status.cov(sel.key) * 100), w = c.techWorld[sel.key], deps = TECHS.filter((t) => t.prereq.includes(sel.key)), gate = actionGate(c, st2, "adopt_tech");
      const needs = sel.prereq.map((p) => {
        const t = TECH[p];
        return `${st2.techAdopted?.[p] != null ? "\u25A0" : status.cov(p) > 0 ? "\u25C7" : "\u25CB"} ${t?.name ?? p}`;
      }).join("\u3000");
      const unl = sel.caps.map((x) => CAP_JA[x] ?? x), fx3 = Object.entries(sel.fx).map(([k, v]) => `${FX_JA2[k] ?? k} +${Math.round(v * 100)}%`);
      detail = h(
        "div",
        { class: "dt" },
        h("b", {}, sel.name),
        `\u3000${sel.field}`,
        h("br"),
        `${SYM[s]} ${lab[s]}`,
        h("br"),
        `\u56FD\u5185\u306E\u666E\u53CA ${cov}%\uFF08\u63A1\u7528\u306B\u306F 30% \u4EE5\u4E0A\uFF09`,
        h("br"),
        `\u524D\u63D0: ${needs || "\u306A\u3057"}`,
        h("br"),
        sel.minPop || sel.settled || sel.condKey ? `\u6210\u7ACB\u306E\u6761\u4EF6: ${[sel.minPop ? `\u96C6\u56E3\u306E\u898F\u6A21 ${n0(sel.minPop)} \u4EBA\u4EE5\u4E0A` : null, sel.settled ? "\u5B9A\u4F4F" : null, sel.condKey ? COND_JA(sel.condKey) : null].filter(Boolean).join("\u30FB")}` : "\u6210\u7ACB\u306E\u6761\u4EF6: \u7279\u306B\u306A\u3057",
        h("br"),
        sel.why ? `\u80CC\u666F: ${sel.why}` : "",
        sel.why ? h("br") : "",
        unl.length ? `\u89E3\u7981: ${unl.join("\u30FB")}` : "",
        unl.length ? h("br") : "",
        fx3.length ? `\u52B9\u679C: ${fx3.join("\u30FB")}` : "",
        fx3.length ? h("br") : "",
        `\u8AAC\u660E: ${sel.desc}`,
        h("br"),
        w ? `\u4E16\u754C: ${w.first != null ? formatDate(civ().wcde.config.calendar, w.first) + "\u306B\u521D\u51FA" : ""}\u30FB\u72EC\u7ACB\u306E\u767A\u898B ${w.independent ?? 0} \u56DE\u30FB\u4F1D\u64AD ${w.spread ?? 0} \u4EF6${Object.keys(w.byChannel ?? {}).length ? "\uFF08" + Object.entries(w.byChannel).map(([k, v]) => `${{ contact: "\u63A5\u89E6", trade: "\u4EA4\u6613", teaching: "\u6559\u80B2", conquest: "\u4F75\u5408" }[k] ?? k} ${v}`).join("\u30FB") + "\uFF09" : ""}` : "\u4E16\u754C: \u307E\u3060\u8AB0\u3082\u767A\u898B\u3057\u3066\u3044\u306A\u3044",
        h("br"),
        deps.length ? `\u3053\u306E\u6280\u8853\u3092\u524D\u63D0\u3068\u3059\u308B: ${deps.map((t) => t.name).join("\u30FB")}` : "\u5F8C\u7D9A\u306E\u6280\u8853\u306F\u306A\u3044",
        h("br"),
        h("div", { class: "rowb" }, btn("\u5236\u5EA6\u5316\u3059\u308B", () => act({ type: "state.act", stateId: st2.id, action: "adopt_tech", opt: sel.key }), "p", { id: "adopt-tech", disabled: !mine || s !== "available" || !gate.ok, title: mine ? s === "available" ? "" : "\u4ECA\u306F\u63A1\u7528\u3067\u304D\u307E\u305B\u3093" : "\u62C5\u5F53\u56FD\u306E\u307F" })),
        `\u5236\u5EA6\u5316\u306E\u8CBB\u7528 ${sel.tier * 15}`
      );
    }
    document.querySelectorAll(".techwrap.full").forEach((e) => e.remove());
    const wrap = h("div", { class: "techwrap" + (TECH_FULL ? " full" : "") }), big = btn(TECH_FULL ? "\u9589\u3058\u308B" : "\u62E1\u5927\u8868\u793A", () => {
      TECH_FULL = !TECH_FULL;
      S2.hooks.panel();
    });
    wrap.append(svg, h("div", { class: "rowb" }, big, btn("\u5168\u4F53", tree.fit), btn("\u5DE6\u7AEF", tree.left), btn("\u6700\u524D\u7DDA", tree.frontier), btn("\u9078\u3093\u3060\u6280\u8853\u3078", () => S2.tech && tree.focus(S2.tech), "", { id: "tech-goto", disabled: !S2.tech }), q2 && hit?.size ? btn(`\u691C\u7D22\u7D50\u679C\u3078\uFF08${hit.size} \u4EF6\uFF09`, () => tree.focus([...hit][0]), "", { id: "tech-goto-hit" }) : null), detail);
    if (TECH_FULL) {
      document.body.append(wrap);
      tree.frontier();
    }
    return h(
      "div",
      {},
      note(`\u6280\u8853 ${TECHS.length} \u4EF6\u3002\u5DE6\u304B\u3089\u53F3\u3078\u6642\u4EE3\u304C\u9032\u307F\u3001\u884C\u306F\u5206\u91CE\u3002\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u3001\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u3002`),
      search,
      h("div", { class: "rowb", style: "flex-wrap:wrap" }, ...laneBtns),
      TECH_FULL ? note("\u62E1\u5927\u8868\u793A\u4E2D\u3067\u3059\uFF08\u753B\u9762\u3044\u3063\u3071\u3044\uFF09\u3002\u53F3\u306E\u300C\u9589\u3058\u308B\u300D\u3067\u623B\u308C\u307E\u3059\u3002") : wrap,
      h("div", { class: "lg" }, ...Object.entries({ adopted: "\u5236\u5EA6\u5316", available: "\u63A1\u7528\u3067\u304D\u308B", known: "\u4FDD\u6709", lost: "\u5931\u308F\u308C\u305F", locked: "\u672A\u767A\u898B" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "locked" ? "dashed" : "solid"} ${COL[k][0]}` }), `${SYM[k]} ${t}`)))
    );
  }
  var COND_JA = (k) => COND[k]?.ja ?? k;
  function tDoctrine(st2, mine) {
    const M = st2.military, taken = M?.doctrine?.taken ?? {}, nodes2 = nodesOf(st2), branches = branchesOf(st2), status = (d) => taken[d.id] != null ? "taken" : canAdopt(st2, d.id).ok ? "available" : "blocked", sel = nodeOf(st2, S2.doc) ?? null, dt = doctrineTree({ nodes: nodes2, branches, status, selected: S2.doc, vb0: DOC_VB, onView: (v) => {
      DOC_VB = v;
    }, onPick: (d) => {
      S2.doc = d.id;
      S2.hooks.panel();
    } }), { svg, COL } = dt;
    const fxText = (d) => Object.entries(d.fx).map(([k, v]) => `${FX_JA[k] ?? k} +${pct(v)}`).join("\u30FB");
    const fx3 = M?.fx ?? {}, now = Object.entries(fx3).filter(([, v]) => v > 0).map(([k, v]) => `${FX_JA[k] ?? k} +${pct(v)}`).join("\u30FB") || "\u306A\u3057";
    return h(
      "div",
      {},
      note(`\u30C9\u30AF\u30C8\u30EA\u30F3 ${nodes2.length} \u4EF6\u3002\u5171\u901A 5 \u7CFB\u7D71\u3068\u3001\u3053\u306E\u56FD\u56FA\u6709\u306E 3 \u7CFB\u7D71 \u2605\uFF08\u5E74 1 \u56DE\u898B\u76F4\u3057\uFF09\u3002\u53D6\u5F97\u306F\u6226\u4E89\u306E\u7D50\u679C\u306B\u52B9\u304D\u307E\u3059\u3002`),
      h("div", { class: "dt" }, `\u3044\u307E\u306E\u52B9\u679C: ${now}`),
      h("div", { class: "docwrap" }, svg, h("div", { class: "rowb" }, btn("\u5168\u4F53", dt.fit, "", { id: "doc-fit" }), btn("\u9078\u3093\u3060\u65B9\u91DD\u3078", () => S2.doc && dt.focus(S2.doc), "", { id: "doc-goto", disabled: !S2.doc }))),
      h("div", { class: "lg" }, ...Object.entries({ taken: "\u25A0 \u53D6\u5F97\u6E08\u307F", available: "\u25C6 \u53D6\u5F97\u3067\u304D\u308B", blocked: "\u25CB \u6761\u4EF6\u304C\u8DB3\u308A\u306A\u3044\uFF08\u70B9\u7DDA\uFF09" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "blocked" ? "dashed" : "solid"} ${COL[k][0]}` }), t))),
      sel ? (() => {
        const ca = canAdopt(st2, sel.id), br = branches.find((b) => b.id === sel.branch);
        return h("div", { class: "dt" }, h("b", {}, sel.ja), `\uFF08${br?.ja ?? ""}\u30FB\u6BB5\u968E ${sel.tier}${sel.special ? "\u30FB\u56FA\u6709" : "\u30FB\u5171\u901A"}\uFF09`, h("br"), `\u52B9\u679C: ${fxText(sel)}\u30FB\u8CBB\u7528 ${sel.cost}`, h("br"), `\u524D\u63D0: ${sel.prereq.length ? sel.prereq.map((p) => nodeOf(st2, p)?.ja ?? p).join("\u3001") : "\u306A\u3057"}${sel.tech.length ? "\u3000\u6280\u8853: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("\u3001") : ""}`, h("br"), taken[sel.id] != null ? "\u53D6\u5F97\u6E08\u307F" : ca.ok ? "\u53D6\u5F97\u3067\u304D\u307E\u3059" : `\u53D6\u5F97\u3067\u304D\u306A\u3044\u7406\u7531: ${ca.reason}`, h("div", { class: "rowb" }, btn("\u53D6\u308A\u5165\u308C\u308B", () => act({ type: "state.adoptDoctrine", stateId: st2.id, doctrineId: sel.id }), "p", { id: "adopt-doc", disabled: !mine || !ca.ok, title: mine ? "" : "\u62C5\u5F53\u56FD\u5BB6\u306E\u307F" })));
      })() : note("\u6728\u306E\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u52B9\u679C\u3068\u524D\u63D0\u304C\u51FA\u307E\u3059\u3002")
    );
  }

  // js/ui/v6/alliance.js
  var W = 392;
  var PH = 24;
  var GAPX = 8;
  var ROWGAP = 30;
  var TOP = 18;
  var MAX_MEMBERS = 24;
  var MAX_BLOCS = 12;
  var textWidth = (s) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) < 256 ? 7 : 12.5), 0);
  function allianceBlocs(civ3) {
    const adj = /* @__PURE__ */ new Map(), edges = [];
    const link2 = (a, b) => {
      (adj.get(a) ?? adj.set(a, /* @__PURE__ */ new Set()).get(a)).add(b);
    };
    for (const i of civ3.activeTreatyIds) {
      const t = civ3.treaties[i];
      if (!t || t.type !== "alliance" || !civ3.states[t.a]?.alive || !civ3.states[t.b]?.alive) continue;
      edges.push([t.a, t.b]);
      link2(t.a, t.b);
      link2(t.b, t.a);
    }
    const seen = /* @__PURE__ */ new Set(), blocs = [];
    for (const id of [...adj.keys()].sort()) {
      if (seen.has(id)) continue;
      const members2 = [], q2 = [id];
      seen.add(id);
      while (q2.length) {
        const x = q2.shift();
        members2.push(x);
        for (const y of [...adj.get(x)].sort()) if (!seen.has(y)) {
          seen.add(y);
          q2.push(y);
        }
      }
      const deg = (x) => adj.get(x).size, pop = (x) => civ3.states[x].pop;
      members2.sort((a, b) => deg(b) - deg(a) || pop(b) - pop(a) || (a < b ? -1 : 1));
      blocs.push({ members: members2, leader: members2[0], pop: members2.reduce((a, x) => a + pop(x), 0), edges: edges.filter(([a, b]) => members2.includes(a)), deg });
    }
    blocs.sort((a, b) => b.members.length - a.members.length || b.pop - a.pop);
    const of = /* @__PURE__ */ new Map();
    blocs.forEach((b, k) => b.members.forEach((m) => of.set(m, k)));
    const hostile = blocs.map(() => /* @__PURE__ */ new Map());
    for (const wid of civ3.activeWarIds) {
      const w = civ3.wars[wid];
      if (!w) continue;
      const ka = new Set(w.sides.a.map((x) => of.get(x)).filter((k) => k != null)), kd = new Set(w.sides.d.map((x) => of.get(x)).filter((k) => k != null));
      for (const a of ka) for (const d of kd) if (a !== d) {
        hostile[a].set(d, (hostile[a].get(d) ?? 0) + 1);
        hostile[d].set(a, (hostile[d].get(a) ?? 0) + 1);
      }
    }
    blocs.forEach((b, k) => {
      b.hostile = [...hostile[k].entries()].map(([o, n2]) => ({ bloc: o, wars: n2 }));
    });
    return blocs;
  }
  var blocName = (civ3, bloc) => `${civ3.states[bloc.leader].name}\u570F`;
  function layoutBloc(civ3, bloc) {
    var _a;
    const shown = bloc.members.slice(0, MAX_MEMBERS), set = new Set(shown), adj = new Map(shown.map((m) => [m, /* @__PURE__ */ new Set()]));
    for (const [a, b] of bloc.edges) if (set.has(a) && set.has(b)) {
      adj.get(a).add(b);
      adj.get(b).add(a);
    }
    const depth = /* @__PURE__ */ new Map([[bloc.leader, 0]]), q2 = [bloc.leader];
    while (q2.length) {
      const x = q2.shift();
      for (const y of adj.get(x)) if (!depth.has(y)) {
        depth.set(y, depth.get(x) + 1);
        q2.push(y);
      }
    }
    for (const m of shown) if (!depth.has(m)) depth.set(m, 1 + Math.max(...depth.values()));
    const layers = [];
    for (const m of shown) (layers[_a = depth.get(m)] ?? (layers[_a] = [])).push(m);
    const wOf = (id) => Math.min(W - 8, 24 + textWidth(civ3.states[id].name) + (id === bloc.leader ? 14 : 0)), pos = /* @__PURE__ */ new Map();
    let row = 0;
    for (const layer of layers.filter(Boolean)) {
      layer.sort((a, b) => bloc.deg(b) - bloc.deg(a) || civ3.states[b].pop - civ3.states[a].pop || (a < b ? -1 : 1));
      const rows = [];
      let cur = [], cw = 0;
      for (const id of layer) {
        const w = wOf(id);
        if (cur.length && cw + GAPX + w > W - 8) {
          rows.push(cur);
          cur = [];
          cw = 0;
        }
        cw += (cur.length ? GAPX : 0) + w;
        cur.push(id);
      }
      if (cur.length) rows.push(cur);
      for (const r of rows) {
        const tot = r.reduce((a, id, i) => a + wOf(id) + (i ? GAPX : 0), 0);
        let x = (W - tot) / 2;
        for (const id of r) {
          const w = wOf(id);
          pos.set(id, { x, y: TOP + row * (PH + ROWGAP), w, row });
          x += w + GAPX;
        }
        row++;
      }
    }
    return { pos, rows: row, height: TOP + row * (PH + ROWGAP) - ROWGAP + 8, hidden: bloc.members.length - shown.length, shown: set };
  }
  function drawBloc(civ3, bloc, L, onPick) {
    const g = sv("svg", { viewBox: `0 0 ${W} ${L.height}`, width: "100%", class: "gr bloc", role: "img", "aria-label": `${blocName(civ3, bloc)}\u306E\u540C\u76DF\u95A2\u4FC2` });
    for (const [a, b] of bloc.edges) {
      const pa = L.pos.get(a), pb = L.pos.get(b);
      if (!pa || !pb) continue;
      const ax = pa.x + pa.w / 2, bx = pb.x + pb.w / 2;
      let d;
      if (pa.row === pb.row) d = `M${ax} ${pa.y} C${ax} ${pa.y - 20} ${bx} ${pb.y - 20} ${bx} ${pb.y}`;
      else {
        const [u, l] = pa.row < pb.row ? [pa, pb] : [pb, pa], ux = u.x + u.w / 2, lx = l.x + l.w / 2, y1 = u.y + PH, y2 = l.y;
        d = `M${ux} ${y1} C${ux} ${y1 + ROWGAP * 0.65} ${lx} ${y2 - ROWGAP * 0.65} ${lx} ${y2}`;
      }
      g.append(sv("path", { d, fill: "none", stroke: "#6fa8c9", "stroke-width": 1.7, "stroke-opacity": 0.85 }));
    }
    for (const id of L.shown) {
      const p = L.pos.get(id), s = civ3.states[id], lead = id === bloc.leader, war = (s.warIds?.length ?? 0) > 0;
      g.append(sv(
        "g",
        { class: "fn", onclick: () => onPick(id) },
        sv("title", {}, `${s.name}${lead ? "\uFF08\u76DF\u4E3B\uFF09" : ""}\u30FB\u540C\u76DF ${bloc.deg(id)} \u304B\u56FD\u30FB\u4EBA\u53E3 ${n0(s.pop)}${war ? "\u30FB\u4EA4\u6226\u4E2D" : ""}`),
        sv("rect", { x: p.x, y: p.y, width: p.w, height: PH, rx: 3, fill: "#161a1f", stroke: war ? "#d0605a" : colorOf(id), "stroke-width": lead ? 2.4 : 1.5, "stroke-dasharray": war ? "4 2" : null }),
        sv("circle", { cx: p.x + 11, cy: p.y + PH / 2, r: 4.5, fill: colorOf(id) }),
        sv("text", { x: p.x + 21, y: p.y + PH / 2 + 4.2, "font-size": 12, fill: "#d9d6cc" }, lead ? sv("tspan", { fill: "#d8b45a" }, "\u2605 ") : null, s.name)
      ));
    }
    return g;
  }
  function allianceDiagram(civ3, onPick) {
    const blocs = allianceBlocs(civ3), box = h("div", { class: "blocs" });
    if (!blocs.length) {
      box.append(h("p", { class: "n" }, "\u540C\u76DF\u306F\u3042\u308A\u307E\u305B\u3093"));
      return box;
    }
    const members2 = blocs.reduce((a, b) => a + b.members.length, 0), clashes = blocs.reduce((a, b) => a + b.hostile.length, 0) / 2;
    box.append(h("p", { class: "n" }, `\u540C\u76DF\u3067\u3064\u306A\u304C\u3063\u305F\u56FD\u3092 1 \u3064\u306E\u9663\u55B6\uFF08\u570F\uFF09\u3068\u3057\u3066\u307E\u3068\u3081\u3066\u3044\u307E\u3059\u3002\u9663\u55B6 ${blocs.length} \u3064\u30FB\u52A0\u76DF ${members2} \u304B\u56FD${clashes ? `\u30FB\u9663\u55B6\u3069\u3046\u3057\u306E\u5BFE\u7ACB ${clashes} \u7D44` : ""}\u3002\u4E0A\u306E\u6BB5\u307B\u3069\u76DF\u4E3B\uFF08\u2605\uFF09\u306B\u8FD1\u304F\u3001\u9752\u3044\u7DDA\u304C\u540C\u76DF\u3001\u8D64\u3044\u7834\u7DDA\u306E\u672D\u306F\u4EA4\u6226\u4E2D\u306E\u56FD\u3067\u3059\u3002`));
    for (const bloc of blocs.slice(0, MAX_BLOCS)) {
      const L = layoutBloc(civ3, bloc), foes = bloc.hostile.map((x) => `${blocName(civ3, blocs[x.bloc])}\uFF08${x.wars} \u4EF6\uFF09`);
      box.append(h(
        "div",
        { class: "card bloc-card" },
        h("div", { class: "bh" }, h("b", {}, blocName(civ3, bloc)), h("small", {}, ` ${bloc.members.length}\u304B\u56FD\u30FB\u4EBA\u53E3 ${n0(bloc.pop)}`)),
        foes.length ? h("div", { class: "bw" }, `\u4EA4\u6226\u4E2D: ${foes.join("\u30FB")}`) : null,
        drawBloc(civ3, bloc, L, onPick),
        L.hidden > 0 ? h("small", { style: "color:var(--dim)" }, `\u307B\u304B ${L.hidden} \u304B\u56FD\uFF08\u540C\u76DF\u306E\u5C11\u306A\u3044\u56FD\u306F\u7701\u7565\uFF09`) : null
      ));
    }
    if (blocs.length > MAX_BLOCS) box.append(h("p", { class: "n" }, `\u307B\u304B ${blocs.length - MAX_BLOCS} \u3064\u306E\u9663\u55B6\uFF08\u5C0F\u3055\u3044\u9806\u306B\u7701\u7565\uFF09`));
    return box;
  }

  // js/ui/v6/views-b.js
  init_archive();

  // js/core/wcde/save-meta.js
  var APP_VERSION_FOR_SAVE = "6.1.0";

  // js/core/wcde/savefile.js
  var SAVE_FORMAT = "alterhistory-save";
  var SAVE_SCHEMA = 2;
  var MIN_SCHEMA = 2;
  function checksum(text) {
    let h1 = 3735928559, h2 = 1103547991;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  var fin4 = (x) => typeof x === "number" && Number.isFinite(x);
  function packSave(w, { appVersion = APP_VERSION_FOR_SAVE, name = null } = {}) {
    const { civ: civ3 } = w, civText = JSON.stringify(civ3), meta = { name: name ?? civ3.wcde.config.name ?? null, monthIndex: civ3.monthIndex, date: { ...civ3.date }, states: Object.values(civ3.states).filter((s) => s.alive).length, events: civ3.events.length, records: civ3.archive?.total ?? 0, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ3.wcde.config.worldSeed };
    const head2 = JSON.stringify({ format: SAVE_FORMAT, schema: SAVE_SCHEMA, appVersion, wcdeVersion: WCDE_VERSION, meta, checksum: checksum(civText), civBytes: civText.length });
    const text = head2.slice(0, -1) + ',"civ":' + civText + "}";
    return { text, bytes: text.length, meta };
  }
  function unpackSave(text, { generate = defaultGenerate, allowChecksumMismatch = false } = {}) {
    const refuse = (...errors) => ({ ok: false, errors }), warnings = [], repairs = [];
    if (typeof text !== "string" || !text.length) return refuse("\u30D5\u30A1\u30A4\u30EB\u304C\u7A7A\u3001\u307E\u305F\u306F\u6587\u5B57\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      return refuse("\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF08JSON \u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093\uFF09: " + String(e.message).slice(0, 120));
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) return refuse("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u306E\u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    if (d.format !== SAVE_FORMAT && (d.ahmap != null || d.format === "ahmap" || d.format === "alterhistory-map" || d.map != null || d.pack != null || d.info?.version != null || d.settings != null)) return refuse("v5 \u4EE5\u524D\u306E\u5730\u56F3\u30C7\u30FC\u30BF\uFF08.ahmap\uFF09\u3084 Azgaar \u306E\u5730\u56F3\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u4E16\u754C\u3092\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\uFF08\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u524A\u9664\u3055\u308C\u307E\u305B\u3093\uFF09");
    if (d.format !== SAVE_FORMAT) return refuse(d.format === "alterhistory-wcde" ? "\u3053\u308C\u306F\u958B\u767A\u4E2D\u306E\u65E7\u5F62\u5F0F\uFF08alterhistory-wcde\uFF09\u3067\u3059\u3002v6.1.0 \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" : "AlterHistory \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08\u65E7 .ahmap\u30FB\u4ED6\u30A2\u30D7\u30EA\u306E\u5730\u56F3\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF09");
    if (!Number.isInteger(d.schema)) return refuse("\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\u304C\u3042\u308A\u307E\u305B\u3093");
    if (d.schema > SAVE_SCHEMA) return refuse(`\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u65B0\u3057\u3044\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059\u3002\u30A2\u30D7\u30EA\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u3053\u306E\u30A2\u30D7\u30EA\u306F\u7248 ${SAVE_SCHEMA} \u307E\u3067\uFF09`);
    if (d.schema < MIN_SCHEMA) return refuse(d.schema === 1 ? "v6.0.0 \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\uFF08schema 1\uFF09\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u4E16\u754C\u3092\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\uFF08\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u524A\u9664\u3055\u308C\u307E\u305B\u3093\uFF09" : `\u53E4\u3059\u304E\u308B\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059`);
    const civ3 = d.civ;
    if (!civ3 || typeof civ3 !== "object") return refuse("\u4E16\u754C\u306E\u72B6\u614B\uFF08civ\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    const sum = checksum(JSON.stringify(civ3));
    if (d.checksum !== sum) {
      if (!allowChecksumMismatch) return refuse("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF08\u4FDD\u5B58\u5F8C\u306B\u5185\u5BB9\u304C\u5909\u308F\u3063\u305F\u304B\u3001\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF09\u3002\u8AAD\u307F\u8FBC\u307F\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F");
      warnings.push("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u304C\u3001\u5229\u7528\u8005\u306E\u6307\u793A\u3067\u3001\u691C\u8A3C\u3092\u901A\u308B\u5834\u5408\u306B\u9650\u3063\u3066\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F");
    }
    if (civ3.decisions != null && (!Array.isArray(civ3.decisions) || civ3.decisions.length)) return refuse("AI \u306E\u5224\u65AD\u8A18\u9332\u3092\u542B\u3080\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF08\u5224\u65AD\u306F\u4FDD\u5B58\u3057\u306A\u3044\u4ED5\u69D8\u3067\u3059\uFF09");
    const need = [["monthIndex", fin4], ["date", (x) => x && typeof x === "object"], ["states", (x) => x && typeof x === "object" && !Array.isArray(x)], ["groups", (x) => x && typeof x === "object"], ["events", Array.isArray], ["wcde", (x) => x && typeof x === "object"], ["seq", (x) => x && typeof x === "object"], ["options", (x) => x && typeof x === "object"]];
    for (const [k, ok2] of need) if (!ok2(civ3[k])) return refuse(`\u5FC5\u9808\u9805\u76EE\u300C${k}\u300D\u304C\u306A\u3044\u304B\u3001\u578B\u304C\u9055\u3044\u307E\u3059`);
    if (!Number.isInteger(civ3.monthIndex) || civ3.monthIndex < 0) return refuse("\u6708\u306E\u756A\u53F7\uFF08monthIndex\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    if (!civ3.wcde.config?.spec || !civ3.wcde.config?.worldSeed) return refuse("\u4E16\u754C\u751F\u6210\u306E\u8A2D\u5B9A\uFF08config.spec / worldSeed\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    if (!["founding", "running"].includes(civ3.wcde.phase)) return refuse("\u6BB5\u968E\uFF08phase\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    for (const [id, s] of Object.entries(civ3.states)) {
      if (s.id !== id) return refuse(`\u56FD\u5BB6 ${id} \u306E ID \u304C\u4E00\u81F4\u3057\u307E\u305B\u3093`);
      for (const k of ["pop", "treasury", "stability", "army"]) if (!fin4(s[k])) return refuse(`\u56FD\u5BB6 ${id}.${k} \u304C\u6709\u9650\u306E\u6570\u3067\u306F\u3042\u308A\u307E\u305B\u3093`);
    }
    for (const g of Object.values(civ3.groups)) if (g.stateId != null && !civ3.states[g.stateId]) return refuse(`\u96C6\u56E3 ${g.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${g.stateId} \u306B\u5C5E\u3057\u3066\u3044\u307E\u3059`);
    for (const t of Object.values(civ3.treaties ?? {})) for (const k of ["a", "b"]) if (!civ3.states[t[k]]) return refuse(`\u6761\u7D04 ${t.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${t[k]} \u3092\u6307\u3057\u3066\u3044\u307E\u3059`);
    for (const x of Object.values(civ3.wars ?? {})) for (const k of ["aggressor", "defender"]) if (!civ3.states[x[k]]) return refuse(`\u6226\u4E89 ${x.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${x[k]} \u3092\u6307\u3057\u3066\u3044\u307E\u3059`);
    if (!Array.isArray(civ3.activeWarIds) || civ3.activeWarIds.some((i) => !civ3.wars[i])) return refuse("\u9032\u884C\u4E2D\u306E\u6226\u4E89\u306E\u4E00\u89A7\u304C\u6226\u4E89\u306E\u8A18\u9332\u3068\u5408\u3044\u307E\u305B\u3093");
    const fix = (kind, before, after, reason, apply) => {
      apply();
      repairs.push({ kind, before, after, reason });
      warnings.push(`\u4FEE\u5FA9: ${reason}`);
    };
    if (civ3.wcde.adjust == null) fix("adjust", null, {}, "\u4ECB\u5165\u88DC\u6B63\u306E\u8868\u304C\u7121\u304B\u3063\u305F\u305F\u3081\u3001\u4ECB\u5165\u8A18\u9332\u304B\u3089\u4F5C\u308A\u76F4\u3057\u307E\u3057\u305F", () => {
      civ3.wcde.adjust = {};
    });
    if (civ3.wcde.diagnostics == null) fix("diagnostics", null, [], "\u8A3A\u65AD\u8A18\u9332\u304C\u7121\u304B\u3063\u305F\u305F\u3081\u3001\u7A7A\u3067\u4F5C\u308A\u307E\u3057\u305F", () => {
      civ3.wcde.diagnostics = [];
    });
    if (civ3.adoptCache == null) civ3.adoptCache = {};
    let world;
    try {
      world = generate(civ3.wcde.config.spec);
    } catch (e) {
      return refuse("\u4E16\u754C\u306E\u5730\u7406\u3092\u518D\u751F\u6210\u3067\u304D\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    const cells = world.mesh?.cellCount ?? null;
    if (d.meta?.cells != null && cells != null && d.meta.cells !== cells) return refuse(`\u5730\u56F3\u306E\u683C\u5B50\u306E\u6570\u304C\u4FDD\u5B58\u6642\uFF08${d.meta.cells}\uFF09\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF08${cells}\uFF09\u3002\u751F\u6210\u306E\u7248\u304C\u9055\u3046\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`);
    registerCommands();
    let w;
    try {
      w = createWcde(world, civ3);
    } catch (e) {
      return refuse("\u4E16\u754C\u3092\u7D44\u307F\u7ACB\u3066\u3089\u308C\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    try {
      const before = JSON.stringify(civ3.wcde.adjust);
      rebuildAdjust(civ3);
      if (JSON.stringify(civ3.wcde.adjust) !== before) fix("adjust", before.slice(0, 80), "\u518D\u69CB\u7BC9", "\u4ECB\u5165\u88DC\u6B63\u306E\u8868\u304C\u4ECB\u5165\u8A18\u9332\u3068\u98DF\u3044\u9055\u3063\u3066\u3044\u305F\u305F\u3081\u3001\u8A18\u9332\u304B\u3089\u4F5C\u308A\u76F4\u3057\u307E\u3057\u305F", () => {
      });
      timeOf(civ3);
      newsOf(civ3);
    } catch (e) {
      return refuse("\u6D3E\u751F\u30C7\u30FC\u30BF\u3092\u4F5C\u308A\u76F4\u305B\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    const errs = checkWcdeIntegrity(world, civ3);
    if (errs.length) return refuse(`\u6574\u5408\u6027\u306E\u691C\u67FB\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08${errs.length} \u4EF6\uFF09`, ...errs.slice(0, 12));
    if (repairs.length) for (const r of repairs) civ3.wcde.diagnostics.push({ at: civ3.monthIndex, repair: r.kind, reason: r.reason });
    return { ok: true, w, warnings, repairs, meta: d.meta ?? null, schema: d.schema };
  }
  var pipe = async (input, stream) => {
    const w = stream.writable.getWriter(), wr = (async () => {
      await w.write(input);
      await w.close();
    })();
    wr.catch(() => {
    });
    const chunks = [], r = stream.readable.getReader();
    for (; ; ) {
      const { done: done2, value } = await r.read();
      if (done2) break;
      chunks.push(value);
    }
    await wr;
    let n2 = 0;
    for (const c of chunks) n2 += c.length;
    const out = new Uint8Array(n2);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };
  var isGzip = (u8) => u8 instanceof Uint8Array && u8.length > 2 && u8[0] === 31 && u8[1] === 139;
  async function packSaveGz(w, opts) {
    const p = packSave(w, opts);
    return { bytes: await pipe(new TextEncoder().encode(p.text), new CompressionStream("gzip")), rawBytes: p.bytes, meta: p.meta };
  }
  async function unpackSaveAny(input, opts) {
    try {
      const text = typeof input === "string" ? input : isGzip(input) ? new TextDecoder().decode(await pipe(input, new DecompressionStream("gzip"))) : new TextDecoder().decode(input);
      return unpackSave(text, opts);
    } catch (e) {
      return { ok: false, errors: ["\u5727\u7E2E\u3092\u5C55\u958B\u3067\u304D\u307E\u305B\u3093\uFF08\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF09: " + String(e.message ?? e).slice(0, 100)] };
    }
  }

  // js/io/crc32.js
  var T2 = (() => {
    const t = new Uint32Array(256);
    for (let n2 = 0; n2 < 256; n2++) {
      let c = n2;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n2] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 4294967295;
    for (let i = 0; i < bytes.length; i++) c = T2[(c ^ bytes[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }

  // js/io/zip.js
  var enc3 = new TextEncoder();
  async function deflateRaw(bytes) {
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return new Uint8Array(out);
  }
  var u16 = (n2) => [n2 & 255, n2 >>> 8 & 255];
  var u32 = (n2) => [n2 & 255, n2 >>> 8 & 255, n2 >>> 16 & 255, n2 >>> 24 & 255];
  function dosTime(d) {
    return [(d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1) & 65535, (d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()) & 65535];
  }
  async function zipFiles(files, { compress = true, date: date3 = /* @__PURE__ */ new Date(), onProgress = null } = {}) {
    const parts = [], central = [], [dt, dd] = dosTime(date3);
    let offset = 0, n2 = 0;
    const names = /* @__PURE__ */ new Set();
    for await (const f of files) {
      if (names.has(f.path)) throw new Error(`ZIP \u306E\u30D1\u30B9\u304C\u91CD\u8907: ${f.path}`);
      names.add(f.path);
      const raw = typeof f.data === "string" ? enc3.encode(f.data) : f.data, name = enc3.encode(f.path), crc = crc32(raw);
      let method = 0, body = raw;
      if (compress && raw.length > 128) {
        const z = await deflateRaw(raw);
        if (z.length < raw.length) {
          method = 8;
          body = z;
        }
      }
      const head2 = Uint8Array.from([80, 75, 3, 4, ...u16(20), ...u16(2048), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0)]);
      if (offset + head2.length + name.length + body.length > 4294967280) throw new Error("ZIP \u304C 4GB \u3092\u8D85\u3048\u307E\u3059\uFF08\u5206\u5272\u3057\u3066\u66F8\u304D\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF09");
      central.push(Uint8Array.from([80, 75, 1, 2, ...u16(20), ...u16(20), ...u16(2048), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      parts.push(head2, name, body);
      offset += head2.length + name.length + body.length;
      n2++;
      if (onProgress && n2 % 500 === 0) await onProgress(n2);
    }
    let csize = 0;
    for (const c of central) csize += c.length;
    const big = n2 > 65534, tail2 = [];
    if (big) {
      const u64 = (x) => [...u32(x >>> 0), ...u32(Math.floor(x / 4294967296))];
      tail2.push(Uint8Array.from([80, 75, 6, 6, ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0), ...u64(n2), ...u64(n2), ...u64(csize), ...u64(offset)]), Uint8Array.from([80, 75, 6, 7, ...u32(0), ...u64(offset + csize), ...u32(1)]));
    }
    tail2.push(Uint8Array.from([80, 75, 5, 6, 0, 0, 0, 0, ...u16(big ? 65535 : n2), ...u16(big ? 65535 : n2), ...u32(csize), ...u32(offset), 0, 0]));
    let total = offset + csize;
    for (const t of tail2) total += t.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of [...parts, ...central, ...tail2]) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  // js/io/png.js
  var be32 = (n2) => [n2 >>> 24 & 255, n2 >>> 16 & 255, n2 >>> 8 & 255, n2 & 255];
  function chunk(type, data) {
    const t = new TextEncoder().encode(type), body = new Uint8Array(t.length + data.length);
    body.set(t);
    body.set(data, t.length);
    return [...be32(data.length), ...body, ...be32(crc32(body))];
  }
  async function encodePng(rgba, w, h2) {
    const raw = new Uint8Array(h2 * (w * 4 + 1));
    for (let y = 0; y < h2; y++) {
      raw[y * (w * 4 + 1)] = 0;
      raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    }
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", Uint8Array.from([...be32(w), ...be32(h2), 8, 6, 0, 0, 0])), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))]);
  }

  // js/io/obsidian.js
  init_graph();
  init_archive();
  init_history();
  init_tech();
  init_species();
  init_world_consts();
  var evList = (civ3) => [...iterRecords(civ3)];
  var OBSIDIAN_VERSION = 1;
  var FOLDERS = Object.freeze({ state: "\u56FD\u5BB6", person: "\u4EBA\u7269", war: "\u6226\u4E89", battle: "\u6226\u95D8", treaty: "\u6761\u7D04", event: "\u51FA\u6765\u4E8B", decision: "AI\u5224\u65AD", settlement: "\u90FD\u5E02\u30FB\u96C6\u843D", group: "\u96C6\u56E3", region: "\u5730\u57DF", culture: "\u6587\u5316", language: "\u8A00\u8A9E", religion: "\u5B97\u6559", tech: "\u6280\u8853", species: "\u7A2E\u65CF", ability: "\u9B54\u6CD5/\u80FD\u529B", org: "\u9B54\u6CD5/\u7D44\u7E54", disaster: "\u707D\u5BB3", interp: "\u6B74\u53F2\u8A8D\u8B58", work: "\u8868\u73FE\u7269", chronicle: "\u5E74\u4EE3\u8A18", graph: "\u95A2\u4FC2\u30B0\u30E9\u30D5", logState: "\u8A73\u7D30\u30ED\u30B0/\u56FD\u5BB6\u6708\u6B21\u72B6\u614B", logAi: "\u8A73\u7D30\u30ED\u30B0/AI\u5224\u65AD", map: "\u5730\u56F3" });
  var mi2s = (mi) => `${Math.floor(mi / 12)}\u5E74${(mi % 12 + 12) % 12 + 1}\u6708`;
  var d2s = (d) => `${d.year}\u5E74${d.month}\u6708`;
  var d2mi = (d) => d.year * 12 + d.month - 1;
  var safe = (s) => String(s ?? "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "_").replace(/\s+/g, " ").trim().slice(0, 48) || "\u7121\u984C";
  var q = (s) => JSON.stringify(String(s));
  var yamlVal = (v) => v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? `[${v.map(yamlVal).join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : q(v);
  var fm = (o) => `---
${Object.entries(o).map(([k, v]) => `${k}: ${yamlVal(v)}`).join("\n")}
---
`;
  var table2 = (head2, rows) => rows.length ? `| ${head2.join(" | ")} |
| ${head2.map(() => "---").join(" | ")} |
${rows.map((r) => `| ${r.map((x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`).join("\n")}
` : "\uFF08\u306A\u3057\uFF09\n";
  var r1 = (x) => Math.round(x * 10) / 10;
  var r37 = (x) => Math.round(x * 1e3) / 1e3;
  var colorOf2 = (id) => {
    let h2 = 2166136261;
    for (const ch of String(id)) h2 = Math.imul(h2 ^ ch.charCodeAt(0), 16777619);
    const hue = (h2 >>> 0) % 360, s = 0.55 + (h2 >>> 9) % 30 / 100, l = 0.5 + (h2 >>> 17) % 20 / 100;
    const f = (n2) => {
      const k = (n2 + hue / 30) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  function planPaths(world, civ3, opts = {}) {
    const P2 = /* @__PURE__ */ new Map(), add = (id, folder, name) => P2.set(id, `${folder}/${safe(name)}__${id}`);
    for (const s of Object.values(civ3.states)) add(s.id, FOLDERS.state, s.name);
    for (const p of Object.values(civ3.persons)) add(p.id, FOLDERS.person, p.name);
    for (const w of Object.values(civ3.wars)) add(w.id, FOLDERS.war, `${civ3.states[w.aggressor]?.name ?? "?"}\u5BFE${civ3.states[w.defender]?.name ?? "?"}\u306E\u6226\u4E89`);
    for (const t of Object.values(civ3.treaties)) add(t.id, FOLDERS.treaty, `${civ3.states[t.a]?.name ?? "?"}\u3068${civ3.states[t.b]?.name ?? "?"}\u306E${TREATY_JA[t.type] ?? t.type}`);
    const lo = opts.fromMonth ?? -Infinity, hi = opts.toMonth ?? Infinity;
    for (const e of evList(civ3)) {
      const m = evMonth(e);
      if (m >= lo && m <= hi) add(e.eventId, e.kind === "battle_fought" ? FOLDERS.battle : FOLDERS.event, e.title);
    }
    if (opts.decisionNotes !== false) for (const d of civ3.decisions ?? []) {
      const m = d2mi(d.date);
      if (m >= lo && m <= hi) add(d.decisionId, FOLDERS.decision, `${civ3.states[d.actorId]?.name ?? d.actorId}\u306E\u5224\u65AD`);
    }
    for (const s of Object.values(civ3.settlements)) add(s.id, FOLDERS.settlement, `\u96C6\u843D ${STAGE_JA2[s.stage] ?? s.stage}`);
    for (const g of Object.values(civ3.groups)) add(g.id, FOLDERS.group, `\u96C6\u56E3 ${g.subsistence}`);
    for (const c of Object.values(civ3.cultures)) add(c.id, FOLDERS.culture, c.name);
    for (const l of Object.values(civ3.languages)) add(l.id, FOLDERS.language, l.name);
    for (const r of Object.values(civ3.religions)) add(r.id, FOLDERS.religion, r.name);
    for (const t of TECHS) P2.set(`tech:${t.key}`, `${FOLDERS.tech}/${safe(t.name)}__${t.key}`);
    for (const s of Object.keys(civ3.species)) P2.set(s, `${FOLDERS.species}/${safe(SPECIES[s]?.ja ?? s)}__${s}`);
    for (const a of Object.values(ABILITIES)) P2.set(`ability:${a.id}`, `${FOLDERS.ability}/${safe(a.ja)}__${a.id}`);
    for (const o of Object.values(civ3.magic.orgs)) add(o.id, FOLDERS.org, o.name);
    for (const d of Object.values(civ3.disasters)) add(d.id, FOLDERS.disaster, `${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09`);
    for (const x of civ3.interpretations) add(x.interpId, FOLDERS.interp, `${civ3.states[x.ownerId]?.name ?? "?"}\u306E\u8A8D\u8B58 ${STANCE[x.stance] ?? x.stance}`);
    for (const w of civ3.works) add(w.workId, FOLDERS.work, `${civ3.states[w.authorId]?.name ?? "?"}\u306E\u5E74\u4EE3\u8A18`);
    for (const c of regionsOf(world)) P2.set(`region:${c.id}`, `${FOLDERS.region}/${safe(c.name)}__region_${c.id}`);
    return P2;
  }
  var TREATY_JA = { nonaggression: "\u4E0D\u53EF\u4FB5\u6761\u7D04", alliance: "\u540C\u76DF", trade: "\u901A\u5546\u6761\u7D04", defense: "\u9632\u885B\u5354\u5B9A", vassal: "\u5F93\u5C5E\u95A2\u4FC2", tribute: "\u671D\u8CA2" };
  var STAGE_JA2 = { camp: "\u91CE\u55B6\u5730", village: "\u6751", town: "\u753A", city: "\u90FD\u5E02", metropolis: "\u5927\u90FD\u5E02" };
  var OUTCOME_JA = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", negotiated: "\u8B1B\u548C", stalemate: "\u81A0\u7740" };
  var POLITY_JA2 = { tribal: "\u90E8\u65CF", chiefdom: "\u9996\u9577\u5236", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6" };
  function regionsOf(world) {
    const c = world.cell, n2 = c.continent.length, m = /* @__PURE__ */ new Map();
    for (let i = 0; i < n2; i++) {
      if (c.landWater[i] !== LAND_WATER2.LAND) continue;
      const k = c.continent[i];
      let r = m.get(k);
      if (!r) m.set(k, r = { id: k, cells: 0, area: 0, sumLat: 0, sumLon: 0 });
      r.cells++;
      r.area += c.areaKm2[i];
      r.sumLat += c.lat[i];
      r.sumLon += c.lon[i];
    }
    return [...m.values()].sort((a, b) => b.area - a.area).map((r, i) => ({ ...r, name: `\u5927\u9678${i + 1}`, order: i }));
  }
  async function* obsidianFiles(world, civ3, worldName, opts = {}) {
    const root2 = safe(worldName || "\u4E16\u754C"), P2 = planPaths(world, civ3, opts), ix = graphIndex(civ3), stats = { files: 0, unresolved: 0, outOfScope: 0, missing: [] }, counts = {};
    const from = opts.fromMonth ?? -Infinity, to = opts.toMonth ?? Infinity, inRange = (mi) => mi >= from && mi <= to, scoped = Number.isFinite(from) || Number.isFinite(to) || opts.decisionNotes === false;
    const link2 = (id, label) => {
      if (id === "world") return "\u4E16\u754C\u5168\u4F53";
      const p = P2.get(id);
      if (!p && scoped && /^(event|decision)_/.test(String(id))) {
        stats.outOfScope++;
        return String(label ?? id).replace(/[\]|\u0001\u0002]/g, " ");
      }
      if (!p) {
        stats.unresolved++;
        if (stats.missing.length < 10) stats.missing.push(String(id));
        return label ?? String(id);
      }
      return `${p}|${String(label ?? id).replace(/[\]|\u0001\u0002]/g, " ")}`;
    };
    const nameOf = (id) => civ3.states[id]?.name ?? civ3.persons[id]?.name ?? civ3.cultures[id]?.name ?? civ3.languages[id]?.name ?? civ3.religions[id]?.name ?? civ3.magic.orgs[id]?.name ?? id;
    const L = (id) => link2(id, nameOf(id)), cellLoc = (c) => c == null ? "\u4E0D\u660E" : `\u30BB\u30EB ${c}\uFF08\u7DEF\u5EA6 ${r1(world.cell.lat[c] * 180 / Math.PI)}\xB0\u30FB\u7D4C\u5EA6 ${r1(world.cell.lon[c] * 180 / Math.PI)}\xB0\uFF09`;
    const fin5 = (c) => c.replace(/\[\[/g, "\uFF3B\uFF3B").replace(/\]\]/g, "\uFF3D\uFF3D").replace(/\u0001/g, "[[").replace(/\u0002/g, "]]");
    const out = (kind, path, content) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}.md`, data: fin5(content), kind };
    };
    const outRaw = (kind, path, data) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}`, data, kind };
    };
    const W6 = civ3.wcde;
    if (W6) {
      const ivs = W6.interventions?.records ?? [], STATUS = { active: "\u6709\u52B9", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" };
      if (ivs.length) yield out("creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165/\u4ECB\u5165\u306E\u8A18\u9332", fm({ type: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165", \u4EF6\u6570: ivs.length, tags: ["\u5275\u9020\u4E3B\u306E\u4ECB\u5165"] }) + `# \u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u8A18\u9332

\u8A08\u7B97\u3055\u308C\u308B\u5024\u3078\u306E\u4E00\u6642\u7684\u306A\u88DC\u6B63\u306E\u8A18\u9332\u3067\u3059\u3002\u4E16\u754C\u306E\u4E8B\u5B9F\uFF08\u51FA\u6765\u4E8B\uFF09\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u88DC\u6B63\u306F\u534A\u6E1B\u671F\u3067\u901A\u5E38\u5024\u3078\u623B\u308A\u3001\u4ECB\u5165\u4E2D\u306B\u8D77\u304D\u305F\u7D50\u679C\u306F\u623B\u308A\u307E\u305B\u3093\u3002

` + table2(["\u958B\u59CB", "\u5BFE\u8C61", "\u9805\u76EE", "\u958B\u59CB\u6642\u306E\u901A\u5E38\u5024", "\u6307\u5B9A\u5024", "\u534A\u6E1B\u671F\uFF08\u6708\uFF09", "\u72B6\u614B", "\u7406\u7531"], ivs.map((r) => [mi2s(r.startMonth), L(r.targetId), r.field, r37(r.nominalAtStart), r37(r.target), r.halfLife, STATUS[r.status] ?? r.status, r.reason || "\u2014"])));
      const eds = W6.edits ?? [];
      if (eds.length) yield out("creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165/\u76F4\u63A5\u7DE8\u96C6\u306E\u8A18\u9332", fm({ type: "\u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6", \u4EF6\u6570: eds.length, tags: ["\u5275\u9020\u4E3B\u306E\u4ECB\u5165"] }) + `# \u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6\u306E\u8A18\u9332

` + table2(["\u6642\u671F", "\u5BFE\u8C61", "\u9805\u76EE", "\u5909\u66F4\u524D", "\u5909\u66F4\u5F8C"], eds.map((e) => [mi2s(e.at), L(e.targetId), e.property, String(e.before).slice(0, 40), String(e.after).slice(0, 40)])));
      const prs = W6.diplomacy?.proposals ?? [], lab = W6.diplomacy?.labels ?? [], TS = { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u518D\u691C\u8A3C\u3067\u4E0D\u6210\u7ACB" };
      for (let k = Math.floor((prs[0]?.at ?? 0) / 1200); prs.length && k <= Math.floor(civ3.monthIndex / 1200); k++) {
        const part = prs.filter((p) => Math.floor(p.at / 1200) === k);
        if (!part.length) continue;
        yield out("negotiation", `\u5916\u4EA4\u4EA4\u6E09/${k * 100}\u5E74\u4EE3\u306E\u4EA4\u6E09\u8A18\u9332`, fm({ type: "\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332", \u4EF6\u6570: part.length, tags: ["\u5916\u4EA4\u4EA4\u6E09"] }) + `# ${k * 100}\u5E74\u4EE3\u306E\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332

\u63D0\u6848 \u2192 \u76F8\u624B\u306E\u8A55\u4FA1 \u2192 \u518D\u691C\u8A3C \u2192 \u7DE0\u7D50\u306E\u8A18\u9332\u3067\u3059\uFF08\u62D2\u5426\u3082\u6B8B\u3057\u307E\u3059\uFF09\u3002

` + table2(["\u6642\u671F", "\u7A2E\u985E", "\u63D0\u6848", "\u76F8\u624B", "\u7D50\u679C", "\u8A55\u4FA1", "\u4E3B\u306A\u8981\u56E0"], part.map((p) => [mi2s(p.at), p.kind === "peace" ? `\u8B1B\u548C\uFF08${p.terms?.kind === "reparations" ? "\u8CE0\u511F" : "\u767D\u7D19"}\uFF09` : TREATY_JA[p.type] ?? p.type, L(p.from), L(p.to), TS[p.status] ?? p.status, p.score, (p.f ?? []).slice(0, 3).map(([i, v]) => `${lab[i] ?? i} ${v}`).join("\u30FB")])));
      }
      const N2 = W6.news;
      if (N2) yield out("news", "\u30CB\u30E5\u30FC\u30B9/\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u72B6\u6CC1", fm({ type: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9", \u672A\u78BA\u8A8D: N2.queue.length, \u78BA\u8A8D\u6E08\u307F: N2.acked.length, tags: ["\u30CB\u30E5\u30FC\u30B9"] }) + `# \u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u72B6\u6CC1

\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306F\u753B\u9762\u5411\u3051\u306E\u6295\u5F71\u3067\u3001\u4E16\u754C\u306E\u4E8B\u5B9F\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6B63\u672C\u306F\u5404\u51FA\u6765\u4E8B\u306E\u30CE\u30FC\u30C8\u3067\u3059\u3002

## \u672A\u78BA\u8A8D\uFF08\u78BA\u8A8D\u5F85\u3061\uFF09
${N2.queue.map((q2) => `- ${link2(q2.eventId, q2.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u78BA\u8A8D\u6E08\u307F\uFF08\u76F4\u8FD1 ${N2.acked.length} \u4EF6\uFF09
${N2.acked.slice(-100).map((id) => `- ${link2(id, id)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    }
    for (const s of Object.values(civ3.states)) {
      const evs = recordsOf(civ3, s.id, { limit: 1e6 }).reverse().filter((e) => inRange(evMonth(e))), wars = Object.values(civ3.wars).filter((w) => w.sides.a.includes(s.id) || w.sides.d.includes(s.id)), trs = Object.values(civ3.treaties).filter((t) => t.a === s.id || t.b === s.id);
      const cap = civ3.groups[s.capitalGroupId], comp = s.alive ? compositionAt(civ3, s.id, civ3.monthIndex) : null;
      yield out("state", P2.get(s.id), fm({ id: s.id, type: "\u56FD\u5BB6", name: s.name, \u6210\u7ACB: mi2s(s.formedAt), \u6EC5\u4EA1: s.alive ? null : mi2s(s.dissolvedAt), \u5B58\u7D9A\u4E2D: s.alive, \u6210\u7ACB\u7D4C\u8DEF: s.via, \u653F\u4F53: POLITY_JA2[s.polity] ?? s.polity, \u30D7\u30EC\u30A4\u30E4\u30FC\u56FD\u5BB6: !!s.player, \u524D\u8EAB: s.predecessor ?? null, tags: ["\u56FD\u5BB6"] }) + `# ${s.name}

- \u6210\u7ACB: ${mi2s(s.formedAt)}\uFF08${s.via}\uFF09${s.predecessor ? `\uFF0F\u524D\u8EAB: ${L(s.predecessor)}` : ""}
- ${s.alive ? "\u5B58\u7D9A\u4E2D" : `\u6EC5\u4EA1: ${mi2s(s.dissolvedAt)}`}
- \u653F\u4F53: ${POLITY_JA2[s.polity] ?? s.polity}\uFF0F\u6307\u5C0E\u8005: ${s.leader.name}\uFF08${s.leader.heir ? "\u5F8C\u7D99\u8005\u3042\u308A" : "\u5F8C\u7D99\u8005\u672A\u5B9A"}\uFF09
- \u9996\u90FD\uFF08\u96C6\u56E3\uFF09: ${cap ? link2(cap.id, "\u9996\u90FD\u306E\u96C6\u56E3") : "\u306A\u3057"}
- \u4EBA\u53E3 ${Math.round(s.pop)}\u30FB\u8CA1\u653F ${r1(s.treasury)}\u30FB\u5B89\u5B9A\u5EA6 ${r37(s.stability)}\u30FB\u5175\u529B ${Math.round(s.army)}\u30FB\u96C6\u843D ${s.settlements}
- \u65B9\u91DD: ${s.strategy?.goal ?? "\u2014"}
- \u653F\u7B56: \u7A0E ${s.policy.tax}\u30FB\u52D5\u54E1 ${s.policy.mobilization}\u30FB\u540C\u5316 ${s.policy.assimilation}\u30FB\u5BDB\u5BB9 ${s.policy.tolerance}\u30FB\u81EA\u6CBB ${s.policy.autonomy}
${s.magic ? `- \u9B54\u6CD5\u5236\u5EA6: ${INSTITUTIONS[s.magic.kind].ja}\uFF08\u56FD\u529B ${s.magic.power}\uFF09${s.magic.orgId ? `\uFF0F${L(s.magic.orgId)}` : ""}
` : ""}${s.resilience ? `- \u5099\u84C4\u30FB\u6CBB\u6C34: ${s.resilience}
` : ""}
## \u63A1\u7528\u3057\u305F\u6280\u8853
${Object.entries(s.techAdopted).map(([k, mi]) => `- ${link2(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}\uFF08${mi2s(mi)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u95A2\u4FC2
${table2(["\u76F8\u624B", "\u95A2\u4FC2\u5024"], Object.entries(s.relations).map(([k, v]) => [L(k), v]))}
## \u6226\u4E89
${wars.map((w) => `- ${link2(w.id, `${nameOf(w.aggressor)}\u5BFE${nameOf(w.defender)}`)}\uFF08${mi2s(w.startedAt)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u6761\u7D04
${trs.slice(0, 200).map((t) => `- ${link2(t.id, TREATY_JA[t.type] ?? t.type)}\uFF08${nameOf(t.a === s.id ? t.b : t.a)}\u30FB${mi2s(t.signedAt)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u4EBA\u53E3\u69CB\u6210\uFF08${mi2s(civ3.monthIndex)}\uFF09
${comp ? `\u6587\u5316: ${Object.entries(comp.culture).map(([k, v]) => `${link2(k, nameOf(k))} ${Math.round(v)}`).join("\u3001")}

\u7A2E\u65CF: ${Object.entries(comp.species).map(([k, v]) => `${link2(k, SPECIES[k]?.ja ?? k)} ${Math.round(v)}`).join("\u3001")}
` : "\uFF08\u6EC5\u4EA1\uFF09\n"}
## \u51FA\u6765\u4E8B\uFF08\u65B0\u3057\u3044\u9806\u306B\u6700\u5927200\u4EF6\uFF09
${evs.slice(-200).reverse().map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u6B74\u53F2\u8A8D\u8B58
${civ3.interpretations.filter((x) => x.ownerId === s.id).slice(-30).map((x) => `- ${link2(x.interpId, STANCE[x.stance] ?? x.stance)}\uFF08${mi2s(x.since)}${x.until != null ? `\u301C${mi2s(x.until)}` : ""}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

\u8A73\u7D30\u30ED\u30B0: ${logFiles(civ3, s).map((f) => `${f.p}|${f.label}`).join("\u3001")}
`);
    }
    for (const p of Object.values(civ3.persons)) yield out("person", P2.get(p.id), fm({ id: p.id, type: "\u4EBA\u7269", name: p.name, \u7A2E\u65CF: p.speciesId, \u80FD\u529B: p.ability, \u5F37\u5EA6: p.power, \u51FA\u73FE: mi2s(p.emergedAt), \u6CA1: p.diedAt == null ? null : mi2s(p.diedAt), tags: ["\u4EBA\u7269", "\u9B54\u6CD5"] }) + `# ${p.name}

- \u7A2E\u65CF: ${link2(p.speciesId, SPECIES[p.speciesId]?.ja ?? p.speciesId)}
- \u80FD\u529B: ${link2(`ability:${p.ability}`, ABILITIES[p.ability].ja)}\uFF08\u5F37\u5EA6 ${p.power}\uFF09
- \u96C6\u56E3: ${civ3.groups[p.groupId] ? link2(p.groupId, "\u6240\u5C5E\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u7D44\u7E54: ${p.orgId ? L(p.orgId) : "\u306A\u3057"}
- ${p.diedAt == null ? "\u5B58\u547D" : `\u6CA1: ${mi2s(p.diedAt)}`}

## \u95A2\u308F\u3063\u305F\u51FA\u6765\u4E8B
${(ix.byEntity.get(p.id) ?? []).map((i) => civ3.events[i]).slice(0, 50).map((e) => `- ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const a of Object.values(ABILITIES)) yield out("ability", P2.get(`ability:${a.id}`), fm({ id: a.id, type: "\u9B54\u6CD5\u306E\u80FD\u529B", name: a.ja, tags: ["\u9B54\u6CD5"] }) + `# ${a.ja}

- \u4EE3\u511F: ${a.cost}
- \u66B4\u767A\u306E\u5371\u967A: ${a.risk}
- \u7D20\u8CEA\u8005: ${Object.values(civ3.persons).filter((p) => p.ability === a.id).slice(0, 100).map((p) => L(p.id)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const o of Object.values(civ3.magic.orgs)) yield out("org", P2.get(o.id), fm({ id: o.id, type: "\u9B54\u6CD5\u7D44\u7E54", name: o.name, \u7D50\u6210: mi2s(o.foundedAt), \u89E3\u6563: o.endedAt == null ? null : mi2s(o.endedAt), tags: ["\u9B54\u6CD5", "\u7D44\u7E54"] }) + `# ${o.name}

- \u7A2E\u5225: ${o.kind}
- \u56FD\u5BB6: ${L(o.stateId)}
- \u6210\u54E1: ${o.members.map((m) => L(m)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const [k, sp] of Object.entries(civ3.species)) yield out("species", P2.get(k), fm({ id: k, type: "\u7A2E\u65CF", name: sp.name, tags: ["\u7A2E\u65CF"] }) + `# ${sp.name}

${SPECIES[k] ? `- \u5BFF\u547D ${Math.round(SPECIES[k].lifespan / 12)}\u5E74\uFF0F\u6210\u9577 \xD7${SPECIES[k].growth}\uFF0F\u6280\u8853 \xD7${SPECIES[k].techRate}\uFF0F\u8ECD\u4E8B \xD7${SPECIES[k].martial}\uFF0F\u9B54\u6CD5\u7D20\u8CEA \xD7${r1(SPECIES[k].magic / 2e-3)}
` : ""}- \u96C6\u56E3: ${Object.values(civ3.groups).filter((g) => g.speciesId === k).length}
`);
    for (const w of Object.values(civ3.wars)) yield out("war", P2.get(w.id), fm({ id: w.id, type: "\u6226\u4E89", \u958B\u6226: mi2s(w.startedAt), \u7D42\u7D50: w.endedAt == null ? null : mi2s(w.endedAt), \u7D50\u679C: OUTCOME_JA[w.outcome] ?? w.outcome ?? null, tags: ["\u6226\u4E89"] }) + `# ${nameOf(w.aggressor)}\u5BFE${nameOf(w.defender)}\u306E\u6226\u4E89

- \u653B\u6483\u5074: ${w.sides.a.map(L).join("\u3001")}
- \u9632\u885B\u5074: ${w.sides.d.map(L).join("\u3001")}
- \u7406\u7531: ${w.reason}
- \u958B\u6226: ${mi2s(w.startedAt)}\uFF0F${w.endedAt == null ? "\u7D99\u7D9A\u4E2D" : `\u7D42\u7D50: ${mi2s(w.endedAt)}\uFF08${OUTCOME_JA[w.outcome] ?? w.outcome}\uFF09`}
- \u6226\u6CC1\u70B9 ${r1(w.score)}\u30FB\u640D\u8017 ${Math.round(w.casualties)}
- \u5BA3\u6226: ${w.declaredEvent ? link2(w.declaredEvent, "\u5BA3\u6226\u306E\u30A4\u30D9\u30F3\u30C8") : "\u2014"}
- \u5360\u9818\u3055\u308C\u305F\u96C6\u56E3: ${w.occupied.map((g) => civ3.groups[g] ? link2(g, "\u96C6\u56E3") : g).join("\u3001") || "\u306A\u3057"}

## \u7D4C\u904E
${(ix.byEntity.get(w.id) ?? []).map((i) => civ3.events[i]).map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n")}
`);
    for (const t of Object.values(civ3.treaties)) yield out("treaty", P2.get(t.id), fm({ id: t.id, type: "\u6761\u7D04", \u7A2E\u5225: TREATY_JA[t.type] ?? t.type, \u7DE0\u7D50: mi2s(t.signedAt), \u7D42\u4E86: t.endedAt == null ? null : mi2s(t.endedAt), tags: ["\u6761\u7D04"] }) + `# ${nameOf(t.a)}\u3068${nameOf(t.b)}\u306E${TREATY_JA[t.type] ?? t.type}

- \u5F53\u4E8B\u56FD: ${L(t.a)}\u3001${L(t.b)}
- \u7DE0\u7D50: ${mi2s(t.signedAt)}\uFF0F${t.active ? `\u671F\u9650: ${mi2s(t.expiresAt)}` : `\u7D42\u4E86: ${mi2s(t.endedAt)}`}
`);
    for (const e of evList(civ3)) {
      const m = evMonth(e);
      if (!inRange(m)) continue;
      const cons = consequencesOf(civ3, e.eventId);
      yield out(e.kind === "battle_fought" ? "battle" : "event", P2.get(e.eventId), fm({ id: e.eventId, type: e.kind === "battle_fought" ? "\u6226\u95D8" : "\u51FA\u6765\u4E8B", kind: e.kind, \u65E5\u4ED8: d2s(e.date), \u767A\u751F\u6E90: e.provenance ?? "world", \u5224\u65AD: e.decisionId ?? null, tags: ["\u51FA\u6765\u4E8B", e.kind] }) + `# ${e.title}

- \u65E5\u4ED8: ${d2s(e.date)}\uFF0F\u7A2E\u985E: ${e.kind}\uFF0F\u5834\u6240: ${cellLoc(e.location?.cell)}
- \u95A2\u4E0E: ${e.participants.map((p) => `${p.role}: ${L(p.entityId)}`).join("\u3001") || "\u306A\u3057"}
${e.decisionId ? `- \u56FD\u5BB6AI\u30FB\u547D\u4EE4\u306E\u5224\u65AD: ${link2(e.decisionId, "\u5224\u65AD\u8A18\u9332")}
` : ""}
## \u539F\u56E0
${e.causes.map((c) => `- ${c.relation}\uFF08${c.basis}${c.userEdited ? "\u30FB\u624B\u52D5\u7DE8\u96C6" : ""}\uFF09: ${link2(c.targetId, nameOf(c.targetId) !== c.targetId ? nameOf(c.targetId) : getEvent(civ3, c.targetId)?.title ?? c.targetId)}`).join("\n") || "\uFF08\u8A18\u9332\u3055\u308C\u305F\u539F\u56E0\u306A\u3057\uFF09"}

## \u7D50\u679C\uFF08\u3053\u306E\u30A4\u30D9\u30F3\u30C8\u3092\u539F\u56E0\u306B\u6319\u3052\u305F\u3082\u306E\uFF09
${cons.slice(0, 100).map((c) => `- ${c.relation}\uFF08${c.basis}\uFF09: ${link2(c.from, c.event?.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u52B9\u679C
${table2(["\u5BFE\u8C61", "\u9805\u76EE", "\u5909\u66F4\u524D", "\u5909\u66F4\u5F8C"], e.effects.map((x) => [L(x.targetId), x.property, x.before, x.after]))}`);
    }
    if (opts.decisionNotes !== false) for (const d of civ3.decisions ?? []) {
      if (!inRange(d2mi(d.date))) continue;
      const x = expandDecision(civ3, d);
      yield out("decision", P2.get(d.decisionId), fm({ id: d.decisionId, type: "AI\u5224\u65AD", \u56FD\u5BB6: d.actorId, \u65E5\u4ED8: d2s(d.date), \u5C64: d.layer, \u884C\u52D5: d.chosen.key ?? null, \u6210\u5426: d.result?.ok ?? null, \u767A\u751F\u6E90: d.provenance, tags: ["\u5224\u65AD", d.layer] }) + `# ${nameOf(d.actorId)}\u306E\u5224\u65AD\uFF08${d2s(d.date)}\uFF09

- \u56FD\u5BB6: ${L(d.actorId)}\uFF0F\u5C64: ${d.layer}\uFF0F\u7A2E\u5225: ${d.type}\uFF0F\u767A\u751F\u6E90: ${d.provenance}
- \u9078\u629E: **${d.chosen.key ?? "\u4F55\u3082\u3057\u306A\u3044"}**${d.chosen.target ? `\uFF08\u5BFE\u8C61 ${L(d.chosen.target)}\uFF09` : ""}${d.chosen.opt ? `\uFF08${d.chosen.opt}\uFF09` : ""}
- \u7D50\u679C: ${d.result ? d.result.ok ? "\u6210\u529F" : `\u5931\u6557\uFF08${d.result.error}\uFF09` : "\u2014"}${(d.result?.eventIds ?? []).map((i) => ` ${link2(i, "\u7D50\u679C\u306E\u30A4\u30D9\u30F3\u30C8")}`).join("")}
- \u65B9\u91DD: ${d.strategy ?? "\u2014"}

## \u89B3\u6E2C
${Object.entries(d.observations).map(([k, v]) => `- ${k}: ${typeof v === "number" ? r37(v) : v}`).join("\n")}

## \u5019\u88DC
${table2(["\u884C\u52D5", "\u5BFE\u8C61", "\u9078\u629E\u80A2", "\u5F97\u70B9", "\u8CC7\u683C", "\u7406\u7531", "\u8981\u56E0"], x.candidates.map((c) => [c.key, c.target ? L(c.target) : "", c.opt ?? "", c.total, c.eligible ? "\u53EF" : "\u4E0D\u53EF", c.reason ?? "", Object.entries(c.factors ?? {}).map(([k, v]) => `${k} ${v}`).join("\u3001")]))}`);
    }
    for (const s of Object.values(civ3.settlements)) yield out("settlement", P2.get(s.id), fm({ id: s.id, type: "\u96C6\u843D", \u6BB5\u968E: s.stage, \u5275\u8A2D: mi2s(s.foundedAt), tags: ["\u96C6\u843D"] }) + `# \u96C6\u843D\uFF08${STAGE_JA2[s.stage] ?? s.stage}\uFF09

- \u96C6\u56E3: ${civ3.groups[s.groupId] ? link2(s.groupId, "\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u5834\u6240: ${cellLoc(s.cell)}
- \u5275\u8A2D: ${mi2s(s.foundedAt)}\uFF0F\u4EBA\u53E3 ${Math.round(s.pop)}

## \u51FA\u6765\u4E8B
${(ix.byEntity.get(s.id) ?? []).map((i) => civ3.events[i]).slice(0, 50).map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const g of Object.values(civ3.groups)) yield out("group", P2.get(g.id), fm({ id: g.id, type: "\u4EBA\u53E3\u96C6\u56E3", \u7A2E\u65CF: g.speciesId, \u751F\u696D: g.subsistence, \u56FD\u5BB6: g.stateId ?? null, tags: ["\u96C6\u56E3"] }) + `# \u96C6\u56E3 ${g.id}

- \u5834\u6240: ${cellLoc(g.cell)}\uFF0F\u751F\u696D: ${g.subsistence}\uFF0F\u4EBA\u53E3 ${Math.round(g.pop)}\uFF0F\u56FD\u5BB6: ${g.stateId ? L(g.stateId) : "\u306A\u3057"}\uFF0F\u7A2E\u65CF: ${link2(g.speciesId, SPECIES[g.speciesId]?.ja ?? g.speciesId)}
- \u7531\u6765: ${g.parent ? link2(g.parent, "\u89AA\u306E\u96C6\u56E3") : "\u6700\u521D\u304B\u3089"}

## \u69CB\u6210\uFF08\u30B3\u30DB\u30FC\u30C8\uFF09
${table2(["\u6587\u5316", "\u8A00\u8A9E", "\u5B97\u6559", "\u7A2E\u65CF", "\u5272\u5408", "\u7DCA\u5F35"], g.cohorts.map((c) => [L(c.cultureId), L(c.languageId), c.religionId ? L(c.religionId) : "\u306A\u3057", SPECIES[c.speciesId]?.ja ?? c.speciesId, r37(c.share), r37(c.tension)]))}
## \u77E5\u3063\u3066\u3044\u308B\u6280\u8853
${Object.entries(g.tech.known).map(([k, mi]) => `${link2(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}\uFF08${mi2s(mi)}\uFF09`).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const r of regionsOf(world)) {
      const inReg = Object.values(civ3.groups).filter((g) => world.cell.continent[g.cell] === r.id);
      yield out("region", P2.get(`region:${r.id}`), fm({ id: `region_${r.id}`, type: "\u5730\u57DF", \u9678\u5730\u30BB\u30EB: r.cells, \u9762\u7A4Dkm2: Math.round(r.area), tags: ["\u5730\u57DF"] }) + `# ${r.name}

- \u9678\u5730\u30BB\u30EB ${r.cells}\u30FB\u9762\u7A4D ${Math.round(r.area).toLocaleString("en-US")} km\xB2
- \u91CD\u5FC3: \u7DEF\u5EA6 ${r1(r.sumLat / r.cells * 180 / Math.PI)}\xB0\u30FB\u7D4C\u5EA6 ${r1(r.sumLon / r.cells * 180 / Math.PI)}\xB0
- \u73FE\u5728\u306E\u96C6\u56E3 ${inReg.length}\u30FB\u4EBA\u53E3 ${Math.round(inReg.reduce((a, g) => a + g.pop, 0))}
- \u56FD\u5BB6: ${[...new Set(inReg.map((g) => g.stateId).filter(Boolean))].map(L).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const c of Object.values(civ3.cultures)) yield out("culture", P2.get(c.id), fm({ id: c.id, type: "\u6587\u5316", name: c.name, \u8D77\u6E90: mi2s(c.bornAt), tags: ["\u6587\u5316"] }) + `# ${c.name}

- \u8D77\u6E90: ${mi2s(c.bornAt)}\uFF0F${cellLoc(c.cell)}
- \u89AA: ${c.parent ? L(c.parent) : "\u306A\u3057"}
- \u5B50: ${Object.values(civ3.cultures).filter((x) => x.parent === c.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
- \u8A00\u8A9E: ${Object.values(civ3.languages).filter((l) => l.cultureId === c.id).map((l) => L(l.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const l of Object.values(civ3.languages)) yield out("language", P2.get(l.id), fm({ id: l.id, type: "\u8A00\u8A9E", name: l.name, \u8D77\u6E90: mi2s(l.bornAt), tags: ["\u8A00\u8A9E"] }) + `# ${l.name}

- \u8D77\u6E90: ${mi2s(l.bornAt)}\uFF0F\u6587\u5316: ${civ3.cultures[l.cultureId] ? L(l.cultureId) : "\u2014"}
- \u89AA: ${l.parent ? L(l.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ3.languages).filter((x) => x.parent === l.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const r of Object.values(civ3.religions)) yield out("religion", P2.get(r.id), fm({ id: r.id, type: "\u5B97\u6559", name: r.name, \u7A2E\u985E: r.kind, \u8D77\u6E90: mi2s(r.bornAt), tags: ["\u5B97\u6559"] }) + `# ${r.name}

- \u7A2E\u985E: ${r.kind}\uFF0F\u8D77\u6E90: ${mi2s(r.bornAt)}
- \u89AA: ${r.parent ? L(r.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ3.religions).filter((x) => x.parent === r.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const t of TECHS) {
      const w = civ3.techWorld[t.key];
      const adopters = Object.values(civ3.states).filter((s) => s.techAdopted[t.key] != null);
      yield out("tech", P2.get(`tech:${t.key}`), fm({ id: t.key, type: "\u6280\u8853", name: t.name, \u5206\u91CE: t.field, \u6BB5\u968E: t.tier, tags: ["\u6280\u8853"] }) + `# ${t.name}

- \u5206\u91CE: ${t.field}\uFF0F\u6BB5\u968E ${t.tier}\uFF0F\u524D\u63D0: ${t.prereq.map((p) => link2(`tech:${p}`, TECHS.find((x) => x.key === p)?.name ?? p)).join("\u3001") || "\u306A\u3057"}
- \u4E16\u754C\u3067\u6700\u521D\u306E\u767A\u898B: ${w?.discoveries?.[0] ? `${mi2s(w.discoveries[0].month)}\uFF08${link2(w.discoveries[0].eventId, "\u767A\u898B\u306E\u30A4\u30D9\u30F3\u30C8")}\uFF09` : "\u307E\u3060"}
- \u767A\u898B\u306E\u8A18\u9332 ${w?.discoveries?.length ?? 0} \u4EF6\uFF0F\u4FDD\u6709\u3059\u308B\u96C6\u56E3 ${Object.values(civ3.groups).filter((g) => g.tech.known[t.key] != null).length}
- \u63A1\u7528\u3057\u3066\u3044\u308B\u56FD\u5BB6: ${adopters.map((s) => L(s.id)).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const d of Object.values(civ3.disasters)) yield out("disaster", P2.get(d.id), fm({ id: d.id, type: "\u707D\u5BB3", \u7A2E\u985E: KIND_JA[d.kind], \u898F\u6A21: d.severity, \u958B\u59CB: mi2s(d.startedAt), \u7D42\u4E86: mi2s(d.endsAt), tags: ["\u707D\u5BB3"] }) + `# ${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09

- \u898F\u6A21 ${d.severity}\u30FB${cellLoc(d.center)}\u30FB\u671F\u9593 ${mi2s(d.startedAt)}\u301C${mi2s(d.endsAt)}\u30FB${d.deaths} \u4EBA\u304C\u4EA1\u304F\u306A\u3063\u305F
- \u767A\u751F: ${link2(d.eventId, "\u707D\u5BB3\u306E\u30A4\u30D9\u30F3\u30C8")}
- \u5F71\u97FF\u3092\u53D7\u3051\u305F\u96C6\u56E3: ${d.groupIds.slice(0, 30).map((g) => civ3.groups[g] ? link2(g, "\u96C6\u56E3") : g).join("\u3001")}
`);
    for (const x of civ3.interpretations) yield out("interp", P2.get(x.interpId), fm({ id: x.interpId, type: "\u6B74\u53F2\u8A8D\u8B58", \u56FD\u5BB6: x.ownerId, \u7ACB\u5834: STANCE[x.stance] ?? x.stance, \u8A55\u4FA1: x.valence, \u958B\u59CB: mi2s(x.since), \u7D42\u4E86: x.until == null ? null : mi2s(x.until), \u7F6E\u304D\u63DB\u3048\u5143: x.supersedes ?? null, tags: ["\u6B74\u53F2\u8A8D\u8B58"] }) + `# ${nameOf(x.ownerId)}\u306E\u8A8D\u8B58: ${STANCE[x.stance] ?? x.stance}

- \u4E8B\u4EF6: ${link2(x.eventId, getEvent(civ3, x.eventId)?.title)}\uFF08\u4E8B\u5B9F\u306E\u30A4\u30D9\u30F3\u30C8\u306F\u5909\u308F\u3089\u306A\u3044\u3002\u5909\u308F\u308B\u306E\u306F\u56FD\u5BB6\u306E\u53D7\u3051\u6B62\u3081\u65B9\uFF09
- \u8A55\u4FA1 ${x.valence}\uFF08\u22121 \u5426\u5B9A\u301C+1 \u80AF\u5B9A\uFF09\uFF0F\u76F8\u624B: ${x.about.map(L).join("\u3001") || "\u306A\u3057"}
- ${mi2s(x.since)}\u301C${x.until == null ? "\u73FE\u5728" : mi2s(x.until)}${x.supersedes ? `\uFF0F\u524D\u306E\u8A8D\u8B58: ${link2(x.supersedes, "\u7F6E\u304D\u63DB\u3048\u5143")}` : ""}
`);
    for (const w of civ3.works) yield out("work", P2.get(w.workId), fm({ id: w.workId, type: "\u8868\u73FE\u7269", \u7A2E\u985E: w.kind, \u8457\u8005: w.authorId, \u4E8B\u5B9F\u3068\u306E\u4E00\u81F4: w.fidelity === "faithful", tags: ["\u8868\u73FE\u7269"] }) + `# ${nameOf(w.authorId)}\u306E\u5E74\u4EE3\u8A18

${w.text}

- \u5BFE\u8C61\u306E\u4E8B\u4EF6: ${link2(w.targetEventId, getEvent(civ3, w.targetEventId)?.title)}\uFF0F\u7ACB\u5834: ${STANCE[w.stance] ?? w.stance}\uFF0F${w.fidelity === "faithful" ? "\u4E8B\u5B9F\u306B\u5FE0\u5B9F" : "\u4E8B\u5B9F\u3068\u7570\u306A\u308B\u8A18\u8FF0\u3092\u542B\u3080"}

## \u4E8B\u5B9F\u3068\u306E\u5DEE
${table2(["\u9805\u76EE", "\u8A18\u8FF0", "\u4E8B\u5B9F"], w.claims.map((c) => [c.property, c.claimed, c.actual]))}`);
    const byCentury = /* @__PURE__ */ new Map();
    for (const e of evList(civ3)) {
      if (!inRange(evMonth(e)) || ["tech_transferred", "demand_raised", "cohort_formed", "cohort_assimilated", "culture_contact", "settlement_stage", "settlement_founded", "state_action", "group_split", "language_diverged"].includes(e.kind)) continue;
      const k = Math.floor(e.date.year / 100);
      (byCentury.get(k) ?? byCentury.set(k, []).get(k)).push(e);
    }
    for (const [k, es] of [...byCentury].sort((a, b) => a[0] - b[0])) yield out("chronicle", `${FOLDERS.chronicle}/${k * 100}\u5E74\u4EE3`, fm({ type: "\u5E74\u4EE3\u8A18", \u671F\u9593: `${k * 100}\u5E74\u301C${k * 100 + 99}\u5E74`, tags: ["\u5E74\u4EE3\u8A18"] }) + `# ${k * 100}\u5E74\u4EE3\u306E\u5E74\u4EE3\u8A18

\uFF08\u65E5\u5E38\u7684\u306A\u51FA\u6765\u4E8B \u2014 \u6280\u8853\u306E\u4F1D\u64AD\u30FB\u4E0D\u6E80\u30FB\u6587\u5316\u306E\u63A5\u89E6\u306A\u3069 \u2014 \u306F\u9664\u3044\u305F\u4E3B\u8981\u306A\u4E8B\u4EF6\u3002\u5168\u4EF6\u306F\u5404\u30CE\u30FC\u30C8\u3068\u51FA\u6765\u4E8B\u30D5\u30A9\u30EB\u30C0\u306B\u3042\u308B\uFF09

${es.map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n")}
`);
    for (const s of Object.values(civ3.states)) {
      for (const f of logFiles(civ3, s)) {
        if (f.kind === "state") yield out("logState", f.path, stateLog(civ3, s, f, link2));
        else yield out("logAi", f.path, aiLog(civ3, s, f, link2, d2mi));
      }
    }
    yield out("graph", `${FOLDERS.graph}/\u56FD\u5BB6\u306E\u7CFB\u8B5C`, graphNote("\u56FD\u5BB6\u306E\u7CFB\u8B5C", "\u524D\u8EAB\u306E\u56FD\u5BB6\u304B\u3089\u5206\u96E2\u30FB\u7D99\u627F\u3057\u305F\u95A2\u4FC2", Object.values(civ3.states).filter((s) => s.predecessor && civ3.states[s.predecessor]).map((s) => [s.predecessor, s.id]), (id) => civ3.states[id].name));
    yield out("graph", `${FOLDERS.graph}/\u6587\u5316\u306E\u7CFB\u7D71`, graphNote("\u6587\u5316\u306E\u7CFB\u7D71", "\u89AA\u306E\u6587\u5316\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ3.cultures).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ3.cultures[id].name));
    yield out("graph", `${FOLDERS.graph}/\u8A00\u8A9E\u306E\u7CFB\u7D71`, graphNote("\u8A00\u8A9E\u306E\u7CFB\u7D71", "\u89AA\u306E\u8A00\u8A9E\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ3.languages).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ3.languages[id].name));
    yield out("graph", `${FOLDERS.graph}/\u5B97\u6559\u306E\u7CFB\u7D71`, graphNote("\u5B97\u6559\u306E\u7CFB\u7D71", "\u89AA\u306E\u5B97\u6559\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ3.religions).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ3.religions[id].name));
    yield out("graph", `${FOLDERS.graph}/\u6226\u4E89\u306E\u95A2\u4FC2`, graphNote("\u6226\u4E89\u306E\u95A2\u4FC2", "\u653B\u6483\u5074 \u2192 \u9632\u885B\u5074", Object.values(civ3.wars).map((w) => [w.aggressor, w.defender]), (id) => civ3.states[id]?.name ?? id));
    if (opts.maps !== false && opts.cellRaster) for (const f of await mapImages(world, civ3, opts)) yield outRaw("map", `${FOLDERS.map}/${f.name}`, f.png);
    yield out("readme", "README", readme(root2, world, civ3, counts, stats, opts));
    yield { path: `${root2}/manifest.json`, data: JSON.stringify({ format: "alterhistory-obsidian", version: OBSIDIAN_VERSION, world: worldName, month: civ3.monthIndex, date: civ3.date, counts, unresolvedLinks: stats.unresolved, outOfScopeLinks: stats.outOfScope, unresolvedSamples: stats.missing, scope: { fromMonth: Number.isFinite(from) ? from : null, toMonth: Number.isFinite(to) ? to : null, decisionNotes: opts.decisionNotes !== false, maps: opts.maps !== false && !!opts.cellRaster } }, null, 1), kind: "manifest" };
  }
  function logFiles(civ3, s) {
    const a = s.formedAt, b = s.alive ? civ3.monthIndex : s.dissolvedAt, out = [];
    for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) {
      out.push({ kind: "state", k, path: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, p: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, label: `\u6708\u6B21\u72B6\u614B ${k * 100}\u5E74\u4EE3` });
    }
    for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) out.push({ kind: "ai", k, path: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, p: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, label: `AI\u5224\u65AD ${k * 100}\u5E74\u4EE3` });
    return out;
  }
  function stateLog(civ3, s, f, link2) {
    const lo = Math.max(s.formedAt, f.k * 1200), hi = Math.min(s.alive ? civ3.monthIndex : s.dissolvedAt, f.k * 1200 + 1199), H = civ3.history, e = H?.states[s.id], times = /* @__PURE__ */ new Set([lo]);
    if (e) for (const k in e.f) {
      const a = e.f[k];
      for (let i = 0; i < a.length; i += 2) if (a[i] >= lo && a[i] <= hi) times.add(a[i]);
    }
    const rows = [...times].sort((a, b) => a - b).map((t) => {
      const x = stateAt(civ3, s.id, t);
      return x ? [mi2s(t), x.alive ? "\u5B58\u7D9A" : "\u6EC5\u4EA1", POLITY_JA2[x.polity] ?? x.polity, x.leader.name, Math.round(x.pop), x.treasury.toFixed(2), x.stability.toFixed(4), Math.round(x.army), x.settlements, x.groupCount, x.strategy ?? "", x.campaign ?? "", x.warIds.length, x.techAdopted.length] : null;
    }).filter(Boolean);
    return fm({ type: "\u56FD\u5BB6\u306E\u6708\u6B21\u72B6\u614B", \u56FD\u5BB6: s.id, \u671F\u9593: `${mi2s(lo)}\u301C${mi2s(hi)}`, tags: ["\u8A73\u7D30\u30ED\u30B0"] }) + `# ${s.name} \u6708\u6B21\u72B6\u614B\uFF08${mi2s(lo)}\u301C${mi2s(hi)}\uFF09

\u72B6\u614B\u304C\u5909\u308F\u3063\u305F\u6708\u3060\u3051\u3092\u884C\u306B\u3059\u308B\u3002\u5909\u5316\u306E\u306A\u3044\u6708\u306F\u3001\u76F4\u524D\u306E\u884C\u304C\u305D\u306E\u307E\u307E\u7D9A\u304F\uFF08\u6B20\u843D\u3067\u306F\u306A\u3044\uFF09\u3002\u5024\u306F\u5F53\u6642\u306E\u89B3\u6E2C\u5024\uFF08\u4EBA\u53E3\u30FB\u5175\u529B\u306F\u4EBA\u3001\u8CA1\u653F\u306F 0.01\u3001\u5B89\u5B9A\u5EA6\u306F 0.0001 \u5358\u4F4D\uFF09\u3002

${(() => {
      const t = "| \u6708 | \u5B58\u7D9A | \u653F\u4F53 | \u6307\u5C0E\u8005 | \u4EBA\u53E3 | \u8CA1\u653F | \u5B89\u5B9A\u5EA6 | \u5175\u529B | \u96C6\u843D | \u96C6\u56E3 | \u65B9\u91DD | \u4F5C\u6226 | \u6226\u4E89\u6570 | \u6280\u8853\u6570 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
      return t + rows.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n";
    })()}
${link2(s.id, "\u2190 " + s.name)}
`;
  }
  function aiLog(civ3, s, f, link2, d2mi2) {
    const lo = f.k * 1200, hi = lo + 1199, ds = [];
    const ix = graphIndex(civ3);
    for (const i of ix.decByActor.get(s.id) ?? []) {
      const d = civ3.decisions[i], m = d2mi2(d.date);
      if (m >= lo && m <= hi) ds.push(d);
    }
    return fm({ type: "AI\u5224\u65AD\u306E\u4E00\u89A7", \u56FD\u5BB6: s.id, \u4EF6\u6570: ds.length, tags: ["\u8A73\u7D30\u30ED\u30B0"] }) + `# ${s.name} AI\u5224\u65AD\uFF08${f.k * 100}\u5E74\u4EE3\uFF09

| \u65E5\u4ED8 | \u5C64 | \u9078\u629E | \u6210\u5426 | \u30CE\u30FC\u30C8 |
| --- | --- | --- | --- | --- |
${ds.map((d) => `| ${d2s(d.date)} | ${d.layer} | ${d.chosen.key ?? "\u4F55\u3082\u3057\u306A\u3044"} | ${d.result ? d.result.ok ? "\u6210\u529F" : `\u5931\u6557 ${d.result.error ?? ""}` : "\u2014"} | ${link2(d.decisionId, "\u8A73\u7D30")} |`).join("\n")}

${link2(s.id, "\u2190 " + s.name)}
`;
  }
  function graphNote(title, sub2, edges, label) {
    const ids = [...new Set(edges.flat())].slice(0, 200), set = new Set(ids), n2 = new Map(ids.map((id, i) => [id, `n${i}`])), es = edges.filter(([a, b]) => set.has(a) && set.has(b)).slice(0, 400);
    return fm({ type: "\u95A2\u4FC2\u30B0\u30E9\u30D5", tags: ["\u30B0\u30E9\u30D5"] }) + `# ${title}

${sub2}\u3002Mermaid \u3067\u63CF\u753B\u3055\u308C\u308B\uFF08\u30CE\u30FC\u30C9 ${ids.length}\u30FB\u8FBA ${es.length}${edges.length > es.length ? `\u3002\u4E0A\u9650\u306E\u305F\u3081 ${edges.length - es.length} \u672C\u3092\u7701\u7565` : ""}\uFF09\u3002

\`\`\`mermaid
graph LR
${ids.map((id) => `  ${n2.get(id)}["${String(label(id)).replace(/"/g, "'")}"]`).join("\n")}
${es.map(([a, b]) => `  ${n2.get(a)} --> ${n2.get(b)}`).join("\n")}
\`\`\`
`;
  }
  async function mapImages(world, civ3, opts) {
    const W2 = 1024, H = 512, c = world.cell, cellAt = opts.cellRaster(world, W2, H);
    const BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
    const base = (ci) => {
      const b = c.biome[ci], e = c.elevation[ci];
      let col = (BC[b] ?? BC[0]).slice();
      if (b === 0) {
        const d = 0.55 + 0.45 * (1 + e / 5500);
        col = col.map((v) => v * d);
      } else if (b !== 13) {
        const s = 0.75 + 0.25 * Math.min(1, e / 4e3);
        col = col.map((v) => v * s);
      }
      return col;
    };
    const files = [], render2 = async (name, ownerMap) => {
      const px = new Uint8Array(W2 * H * 4);
      for (let i = 0; i < W2 * H; i++) {
        const ci = cellAt[i];
        let col = base(ci);
        const o = ownerMap?.get(ci);
        if (o) {
          const oc = colorOf2(o);
          col = col.map((v, k) => v * 0.45 + oc[k] * 0.55);
        }
        px[4 * i] = col[0];
        px[4 * i + 1] = col[1];
        px[4 * i + 2] = col[2];
        px[4 * i + 3] = 255;
      }
      files.push({ name, png: await encodePng(px, W2, H) });
    };
    await render2("\u5730\u5F62.png", null);
    if (civ3.history && Object.keys(civ3.history.states).length) {
      const mi = civ3.monthIndex, marks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.floor(mi * f / 120) * 120))].filter((x) => x <= mi && x >= 0);
      for (const t of marks) await render2(`\u56FD\u5BB6\u9818\u57DF_${Math.floor(t / 12)}\u5E74.png`, ownerMapAt(civ3, territoryOf, world, t));
    }
    return files;
  }
  function readme(root2, world, civ3, counts, stats, opts) {
    const ja = { creator: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u8A18\u9332", negotiation: "\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332", news: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9", state: "\u56FD\u5BB6", person: "\u4EBA\u7269\uFF08\u9B54\u6CD5\u306E\u7D20\u8CEA\u8005\uFF09", war: "\u6226\u4E89", battle: "\u6226\u95D8", treaty: "\u6761\u7D04", event: "\u51FA\u6765\u4E8B", decision: "AI\u5224\u65AD", settlement: "\u90FD\u5E02\u30FB\u96C6\u843D", group: "\u4EBA\u53E3\u96C6\u56E3", region: "\u5730\u57DF", culture: "\u6587\u5316", language: "\u8A00\u8A9E", religion: "\u5B97\u6559", tech: "\u6280\u8853", species: "\u7A2E\u65CF", ability: "\u9B54\u6CD5\u306E\u80FD\u529B", org: "\u9B54\u6CD5\u7D44\u7E54", disaster: "\u707D\u5BB3", interp: "\u6B74\u53F2\u8A8D\u8B58", work: "\u8868\u73FE\u7269\uFF08\u5E74\u4EE3\u8A18\uFF09", chronicle: "\u5E74\u4EE3\u8A18\uFF08100\u5E74\u3054\u3068\uFF09", logState: "\u8A73\u7D30\u30ED\u30B0\u30FB\u56FD\u5BB6\u306E\u6708\u6B21\u72B6\u614B", logAi: "\u8A73\u7D30\u30ED\u30B0\u30FBAI\u5224\u65AD\u306E\u4E00\u89A7", graph: "\u95A2\u4FC2\u30B0\u30E9\u30D5", map: "\u5730\u56F3" };
    return fm({ type: "README", tags: ["README"] }) + `# ${root2} \u2014 AlterHistory \u306E\u66F8\u304D\u51FA\u3057

\u3053\u306E\u30D5\u30A9\u30EB\u30C0\u3092 Obsidian \u306E vault \u3068\u3057\u3066\u958B\u3044\u3066\u304F\u3060\u3055\u3044\uFF08\u89AA\u30D5\u30A9\u30EB\u30C0\u304B\u3089\u958B\u3044\u3066\u3082\u3001\u30EA\u30F3\u30AF\u306F\u89E3\u6C7A\u3057\u307E\u3059\uFF09\u3002

- \u66F8\u304D\u51FA\u3057\u305F\u6642\u70B9: ${mi2s(civ3.monthIndex)}\uFF08\u6B74\u53F2\u306E\u73FE\u5728\uFF09
- \u4E16\u754C: ${world.spec.worldSeed}\uFF08${world.mesh.cellCount ?? world.cell.biome.length} \u30BB\u30EB\uFF09
- \u30EA\u30F3\u30AF\u5207\u308C: ${stats.unresolved} \u4EF6\uFF080 \u304C\u6B63\u5E38\uFF09

## \u4E2D\u8EAB
${table2(["\u30D5\u30A9\u30EB\u30C0\u30FB\u7A2E\u985E", "\u30CE\u30FC\u30C8\u6570"], Object.entries(counts).filter(([k]) => ja[k]).map(([k, n2]) => [ja[k], n2]))}
## \u66F8\u304D\u51FA\u3057\u306E\u7BC4\u56F2
- ${opts.decisionNotes === false ? "AI\u5224\u65AD\u306E\u500B\u5225\u30CE\u30FC\u30C8\u306F\u51FA\u3057\u3066\u3044\u307E\u305B\u3093\uFF08\u4E00\u89A7\u3068\u8A73\u7D30\u30ED\u30B0\u306E\u307F\uFF09" : "\u5168\u3066\u306EAI\u5224\u65AD\u3092\u500B\u5225\u30CE\u30FC\u30C8\u306B\u3057\u3066\u3044\u307E\u3059"}
- ${Number.isFinite(opts.fromMonth ?? -Infinity) || Number.isFinite(opts.toMonth ?? Infinity) ? `\u30A4\u30D9\u30F3\u30C8\u30FBAI\u5224\u65AD\u306F ${opts.fromMonth != null ? mi2s(opts.fromMonth) : "\u6700\u521D"}\u301C${opts.toMonth != null ? mi2s(opts.toMonth) : "\u73FE\u5728"} \u306B\u7D5E\u3063\u3066\u3044\u307E\u3059` : "\u5168\u671F\u9593\u306E\u30A4\u30D9\u30F3\u30C8\u3092\u500B\u5225\u30CE\u30FC\u30C8\u306B\u3057\u3066\u3044\u307E\u3059"}
- \u300C\u601D\u60F3\u300D\u306E\u30AB\u30C6\u30B4\u30EA\u306F\u3001v5.0.0 \u306E\u6587\u660E\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u306B\u8A72\u5F53\u3059\u308B\u30C7\u30FC\u30BF\u304C\u7121\u3044\u305F\u3081\u4F5C\u3063\u3066\u3044\u307E\u305B\u3093
- \u6708\u6B21\u72B6\u614B\u306F\u300E\u72B6\u614B\u304C\u5909\u308F\u3063\u305F\u6708\u300F\u3060\u3051\u3092\u884C\u306B\u3057\u3066\u3044\u307E\u3059\uFF08\u5909\u5316\u306E\u306A\u3044\u6708\u306F\u76F4\u524D\u306E\u884C\u304C\u7D9A\u304D\u307E\u3059\u3002\u6B20\u843D\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF09

## \u518D\u51FA\u529B\u30FB\u4E0A\u66F8\u304D
- \u51FA\u529B\u306F \`${root2}/\` \u306E\u4E2D\u3060\u3051\u3067\u3059\u3002\u518D\u51FA\u529B\u3059\u308B\u3068\u3001\u540C\u3058\u30D1\u30B9\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u4E0A\u66F8\u304D\u3055\u308C\u3001vault \u5185\u306E\u7121\u95A2\u4FC2\u306A\u30D5\u30A1\u30A4\u30EB\u306B\u306F\u89E6\u308C\u307E\u305B\u3093\u3002
- \u30CE\u30FC\u30C8\u540D\u306F \`\u540D\u524D__ID\` \u3067\u3059\u3002\u540D\u524D\u304C\u5909\u308F\u308B\u3068\u5225\u30D5\u30A1\u30A4\u30EB\u306B\u306A\u308B\u305F\u3081\u3001\u4E0D\u8981\u306B\u306A\u3063\u305F\u53E4\u3044\u30CE\u30FC\u30C8\u306F manifest.json \u3068\u898B\u6BD4\u3079\u3066\u624B\u3067\u6D88\u3057\u3066\u304F\u3060\u3055\u3044\u3002
- \u81EA\u5206\u3067\u66F8\u304D\u8DB3\u3057\u305F\u30CE\u30FC\u30C8\u306F\u3001\u5225\u306E\u30D5\u30A9\u30EB\u30C0\u306B\u7F6E\u304F\u3068\u4E0A\u66F8\u304D\u3055\u308C\u307E\u305B\u3093\u3002
`;
  }
  async function sha256(bytes) {
    const h2 = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...h2].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function exportObsidianZip(world, civ3, worldName, opts = {}) {
    const root2 = safe(worldName || "\u4E16\u754C"), enc4 = new TextEncoder(), index2 = [];
    let manifest = null;
    async function* gen() {
      for await (const f of obsidianFiles(world, civ3, worldName, opts)) {
        if (f.kind === "manifest") {
          manifest = JSON.parse(f.data);
          continue;
        }
        const raw = typeof f.data === "string" ? enc4.encode(f.data) : f.data;
        index2.push([f.path.slice(root2.length + 1), raw.length, opts.hash === false ? null : await sha256(raw)]);
        yield f;
      }
      manifest.files = index2;
      yield { path: `${root2}/manifest.json`, data: JSON.stringify(manifest, null, 1) };
    }
    const bytes = await zipFiles(gen(), { compress: opts.compress !== false, onProgress: opts.onProgress });
    return { bytes, root: root2, counts: manifest.counts, files: index2.length + 1, unresolvedLinks: manifest.unresolvedLinks };
  }

  // js/ui/v6/views-b.js
  var civ2 = () => S2.w.civ;
  var date2 = (mi) => formatWorldDate(S2.w, mi);
  var note2 = (t) => h("p", { class: "n" }, t);
  var head = (code, ja) => [h("div", { class: "code" }, code), h("h2", {}, ja)];
  var OUT = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" };
  function warOps(x, mine, side) {
    const c = civ2(), o = x.ops;
    if (!o) return null;
    const ctx = S2.w.sim.ctx;
    if (x.status !== "active" || o.ended) return h("div", {}, lb("\u4E3B\u306A\u6226\u3044", "BATTLES"), ...o.battles?.length ? o.battles.map((b) => h("div", { class: "ev" }, h("time", {}, date2(b.at)), `${b.name}\uFF08${stateName(b.winner)}\u304C\u5236\u3057\u305F\uFF09`)) : [note2("\u6B74\u53F2\u306B\u6B8B\u308B\u5927\u304D\u306A\u6226\u3044\u306F\u306A\u304B\u3063\u305F")], x.summary ? note2(`\u6226\u95D8 ${x.summary.battles} \u56DE\uFF08\u5305\u56F2 ${x.summary.sieges}\u30FB\u6D77\u6226 ${x.summary.naval}\u30FB\u4E0A\u9678 ${x.summary.landings}\uFF09\u30FB\u6226\u6B7B \u7D04 ${n0(x.summary.dead)} \u4EBA`) : null);
    const th = Object.values(o.theaters), fs = Object.values(o.forces).sort((a, b) => a.id < b.id ? -1 : 1), cs = Object.values(o.campaigns).filter((k) => k.phase === "active"), bs = o.battles.slice(-6).reverse(), kindJa = { field: "\u4F1A\u6226", siege: "\u5305\u56F2", naval: "\u6D77\u6226", landing: "\u4E0A\u9678\u6226" };
    const out = h("div", {}, lb("\u6226\u6CC1", "FRONTS"), table(["\u6226\u57DF", "\u7A2E\u985E", "\u4EA4\u6226"], th.map((t) => [t.name, t.kind === "sea" ? `\u6D77\u57DF\uFF08\u5236\u6D77 ${t.control > 0.2 ? stateName(x.aggressor) : t.control < -0.2 ? stateName(x.defender) : "\u62EE\u6297"}\uFF09` : "\u9678", `${stateName(t.a)} \u5BFE ${stateName(t.d)}`])));
    out.append(lb("\u90E8\u968A", "FORCES"), table(["\u56FD", "\u7A2E\u985E", "\u898F\u6A21", "\u58EB\u6C17", "\u88DC\u7D66"], fs.map((f) => [stateName(f.stateId), f.kind === "fleet" ? "\u8266\u968A" : "\u91CE\u6226\u8ECD", n0(f.size), pct(f.morale), pct(f.supply)])));
    out.append(lb("\u9032\u884C\u4E2D\u306E\u4F5C\u6226", "CAMPAIGNS"), cs.length ? table(["\u56FD", "\u4F5C\u6226", "\u76EE\u6A19", "\u9032\u307F"], cs.map((k) => [stateName(k.stateId), CAMPAIGN_KINDS[k.kind] ?? k.kind, k.targetGroupId && c.groups[k.targetGroupId] ? placeName(ctx, c.groups[k.targetGroupId]) : o.theaters[k.theaterId]?.name ?? "\u2014", k.kind === "defense" || k.kind === "naval_control" || k.kind === "blockade" ? "\u2014" : pct(Math.min(1, k.progress))])) : note2("\u9032\u884C\u4E2D\u306E\u4F5C\u6226\u306F\u3042\u308A\u307E\u305B\u3093"));
    out.append(lb("\u76F4\u8FD1\u306E\u6226\u3044", "BATTLES"), ...bs.length ? bs.map((b) => h("div", { class: "ev" }, h("time", {}, date2(b.at)), `${b.name}\uFF08${kindJa[b.kind] ?? b.kind}\u30FB${stateName(b.winner)}\u304C\u5236\u3057\u305F\uFF09`)) : [note2("\u307E\u3060\u5927\u304D\u306A\u6226\u95D8\u306F\u8D77\u304D\u3066\u3044\u307E\u305B\u3093")]);
    if (side && mine) {
      const d = o.direction[mine] ?? {}, cur = d.posture ?? postureOf(ctx, x, c.states[mine]), post = h("select", { id: "war-posture" }, ...Object.entries(POSTURES).map(([k, ja]) => h("option", { value: k, selected: k === cur }, ja))), com = h("input", { id: "war-commit", type: "range", min: 0.3, max: 1, step: 0.05, value: d.commit ?? 0.75, style: "width:120px" }), foc = h("select", { id: "war-focus" }, h("option", { value: "" }, "\u91CD\u70B9\u306E\u6226\u57DF: \u81EA\u52D5"), ...th.map((t) => h("option", { value: t.id, selected: d.focus === t.id }, t.name)));
      out.append(lb("\u65B9\u91DD\u306E\u6307\u793A", "DIRECTION"), h("div", { class: "rowb" }, post, foc), h("div", { class: "rowb" }, h("small", {}, "\u6295\u5165\u5272\u5408"), com), h("div", { class: "rowb" }, btn("\u65B9\u91DD\u3092\u4F1D\u3048\u308B", () => act({ type: "war.direct", stateId: mine, warId: x.id, posture: post.value, commit: Number(com.value), focus: foc.value || null }), "p", { id: "war-direct" })), note2("\u500B\u3005\u306E\u4F5C\u6226\uFF08\u3069\u3053\u3092\u653B\u3081\u3001\u3069\u3053\u3092\u5B88\u308B\u304B\uFF09\u306F\u3001AI \u306E\u56FD\u5BB6\u3068\u540C\u3058\u4ED5\u7D44\u307F\u3067\u7ACB\u6848\u30FB\u5B9F\u884C\u3055\u308C\u307E\u3059\u3002\u30D7\u30EC\u30A4\u30E4\u30FC\u306F\u65B9\u91DD\u3060\u3051\u3092\u6307\u793A\u3057\u307E\u3059\u3002"));
    }
    return out;
  }
  function pWar() {
    const c = civ2(), all = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, ...head("WAR", "\u6226\u4E89"));
    const sel = c.wars[S2.war];
    if (sel) box.append(warDetail(sel));
    box.append(lb("\u6226\u4E89\u4E00\u89A7", "\u65B0\u3057\u3044\u9806"), note2(`\u9032\u884C\u4E2D ${c.activeWarIds.length}\u30FB\u5168\u4F53 ${all.length} \u4EF6`), vlist(all, 40, (x) => h("div", { class: "vrow full", onclick: () => {
      S2.war = x.id;
      S2.hooks.panel();
    } }, h("small", { style: "color:var(--dim)" }, x.status === "active" ? "\u9032\u884C\u4E2D " : "\u7D42\u7D50 "), warTitle(x), h("small", { style: "color:var(--dim)" }, ` ${date2(x.startedAt).split("\u6708")[0]}\u6708\u301C`))));
    return box;
  }
  var warTitle = (x) => {
    const s = `${stateName(x.aggressor)} \u5BFE ${stateName(x.defender)}`;
    return x.name ? `${x.name}\uFF08${s}\uFF09` : s;
  };
  function warDetail(x) {
    const c = civ2(), mine = controlled(), side = [...x.sides.a, ...x.sides.d].includes(mine), key = (e) => e.participants.some((p) => p.entityId === x.id), ev = c.events.filter((e) => key(e)).slice(-12), peace = proposalsOf(c).filter((p) => p.kind === "peace" && p.warId === x.id).slice(-4).reverse();
    const kind = h("select", { id: "peace-kind" }, h("option", { value: "white" }, "\u767D\u7D19\u8B1B\u548C"), h("option", { value: "reparations" }, "\u8CE0\u511F\u3064\u304D")), amt = h("input", { id: "peace-amt", type: "number", placeholder: "\u8CE0\u511F\u984D", style: "width:90px" });
    return h(
      "div",
      { class: "rs" },
      h("div", { class: "card br" }, h("h3", {}, warTitle(x)), h("div", { class: "sub" }, `${x.status === "active" ? "\u9032\u884C\u4E2D" : "\u7D42\u7D50\uFF08" + (OUT[x.outcome] ?? x.outcome) + "\uFF09"}\u30FB\u958B\u6226 ${date2(x.startedAt)}${x.endedAt != null ? "\u30FB\u7D42\u6226 " + date2(x.endedAt) : ""}\u30FB\u6226\u6CC1 ${x.score > 0 ? "\u653B\u6483\u5074\u304C\u512A\u52E2" : x.score < 0 ? "\u9632\u5FA1\u5074\u304C\u512A\u52E2" : "\u62EE\u6297"}\uFF08${r23(x.score)}\uFF09\u30FB\u5360\u9818 ${x.occupied.length} \u533A\u753B`)),
      lb("\u4E3B\u8981\u7D4C\u904E\uFF08\u4E8B\u5B9F\uFF09", "FACTS"),
      ...ev.length ? ev.map((e) => h("div", { class: "ev" }, h("time", {}, `${e.date.year}\u5E74${e.date.month}\u6708`), e.title)) : [note2("\u8A18\u9332\u3055\u308C\u305F\u51FA\u6765\u4E8B\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093")],
      warOps(x, mine, side),
      lb("\u5360\u9818", "OCCUPATION"),
      note2(x.status === "active" ? `\u5360\u9818\u3055\u308C\u3066\u3044\u308B\u533A\u753B ${x.occupied.length}\uFF08\u7D42\u6226\u306E\u3068\u304D\u3001\u52DD\u3063\u305F\u5074\u30FB\u300C\u5360\u9818\u5730\u306E\u5272\u8B72\u300D\u306E\u8B1B\u548C\u3067\u306F\u3001\u5360\u9818\u3057\u305F\u56FD\u306E\u3082\u306E\u306B\u306A\u308A\u307E\u3059\u3002\u767D\u7D19\u8B1B\u548C\u30FB\u5F15\u304D\u5206\u3051\u3067\u306F\u8FD4\u3055\u308C\u307E\u3059\uFF09` : "\u7D42\u6226\u6E08\u307F"),
      lb("\u8B1B\u548C", "PEACE"),
      ...peace.length ? peace.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${stateName(p.from)}\u306E\u7533\u3057\u5165\u308C\uFF08${p.terms.kind === "reparations" ? "\u8CE0\u511F " + n0(p.terms.paid ?? p.terms.amount) : p.terms.kind === "cession" ? "\u5360\u9818\u5730\u306E\u5272\u8B72" : "\u767D\u7D19\u8B1B\u548C"}${p.separate ? "\u30FB\u5358\u72EC\u8B1B\u548C" : ""}\uFF09`, h("br"), h("small", {}, date2(p.at))), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status]))) : [note2(x.status === "active" ? "\u307E\u3060\u7533\u3057\u5165\u308C\u306F\u3042\u308A\u307E\u305B\u3093" : "\u8B1B\u548C\u306E\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093")],
      x.status === "active" ? h("div", {}, h("div", { class: "rowb" }, kind, amt), h("div", { class: "rowb" }, btn("\u8B1B\u548C\u3092\u7533\u3057\u5165\u308C\u308B", () => {
        const st2 = [...x.sides.a, ...x.sides.d].includes(mine) ? mine : null;
        act({ type: "diplomacy.peace", stateId: st2, warId: x.id, terms: { kind: kind.value, amount: Number(amt.value) || 0 } });
      }, "p", { id: "peace-go", disabled: !side, title: side ? "" : "\u62C5\u5F53\u56FD\u304C\u53C2\u6226\u3057\u3066\u3044\u308B\u6226\u4E89\u306E\u307F" })), note2("\u8B1B\u548C\u306F\u3001\u76F8\u624B\u304C\u53D7\u3051\u5165\u308C\u305F\u3068\u304D\u3060\u3051\u6210\u7ACB\u3057\u307E\u3059\u3002\u4E3B\u305F\u308B\u4EA4\u6226\u56FD\u306E\u8B1B\u548C\u306F\u6226\u4E89\u3092\u7D42\u3048\u3001\u540C\u76DF\u5074\u306E\u8B1B\u548C\u306F\u305D\u306E\u56FD\u3060\u3051\u304C\u629C\u3051\u307E\u3059\u3002")) : null,
      lb("\u6226\u4E89\u7814\u7A76\u6240\uFF08\u4E88\u6E2C\u3002\u4E8B\u5B9F\u3068\u306F\u5225\uFF09", "WAR LAB"),
      (() => {
        const p = x.status === "active" ? predictWar(c, x.aggressor, x.defender, S2.w.sim.ctx) : null;
        return p ? warlabView(p) : note2("\u7D42\u7D50\u3057\u305F\u6226\u4E89\u306E\u4E88\u6E2C\u306F\u3042\u308A\u307E\u305B\u3093");
      })()
    );
  }
  function pDiplo() {
    const c = civ2(), top = aliveStates().sort((a, b) => b.pop - a.pop).slice(0, 10), at2 = (a, b) => c.activeWarIds.some((i) => {
      const w = c.wars[i];
      return w.sides.a.includes(a.id) && w.sides.d.includes(b.id) || w.sides.a.includes(b.id) && w.sides.d.includes(a.id);
    }), ally = (a, b) => c.activeTreatyIds.some((i) => {
      const t = c.treaties[i];
      return t.type === "alliance" && (t.a === a.id && t.b === b.id || t.a === b.id && t.b === a.id);
    });
    const relCol = (v) => v >= 40 ? "#6fa8c9" : v >= 10 ? "#9fbf8a" : v > -10 ? "#6a6f78" : v > -40 ? "#d8b45a" : "#d0605a";
    const mx = h("table", { class: "mx" }, h("tr", {}, h("th", { class: "rh" }), ...top.map((s) => h("th", { class: "colh", title: s.name }, s.name))), ...top.map((a) => h("tr", {}, h("th", { class: "rh", onclick: () => S2.hooks.select(a.id) }, h("span", { class: "dot", style: `background:${colorOf(a.id)};display:inline-block` }), a.name), ...top.map((b) => {
      if (a === b) return h("td", { class: "dg" }, "\u2014");
      const v = Math.round(a.relations[b.id] ?? 0), w = at2(a, b), al = ally(a, b);
      return h("td", { class: "rc" + (w ? " war" : ""), style: `background-color:${relCol(v)}33`, title: `${a.name}\u2192${b.name}: \u95A2\u4FC2 ${v}${w ? "\u30FB\u4EA4\u6226\u4E2D" : ""}${al ? "\u30FB\u540C\u76DF" : ""}` }, w ? "\u6226" : al ? "\u76DF" : v);
    }))));
    const g = allianceDiagram(c, (id) => S2.hooks.select(id));
    const tr = c.activeTreatyIds.map((i) => c.treaties[i]).sort((a, b) => b.signedAt - a.signedAt), recent = proposalsOf(c).slice(-12).reverse();
    return h("div", {}, ...head("DIPLOMACY", "\u4E16\u754C\u306E\u5916\u4EA4"), lb("\u95A2\u4FC2\u8868\uFF08\u4EBA\u53E3\u4E0A\u4F4D 10 \u304B\u56FD\uFF09", "RELATIONS"), note2("\u884C\u304C\u4E3B\u4F53\u3001\u5217\u304C\u76F8\u624B\u3002\u6570\u5024\u306F\u95A2\u4FC2\u5024\u3001\u300C\u6226\u300D\u306F\u4EA4\u6226\u4E2D\u3001\u300C\u76DF\u300D\u306F\u540C\u76DF\u3002\u8272\u306F\u95A2\u4FC2\u306E\u826F\u3057\u60AA\u3057\uFF08\u6570\u5024\u3068\u8A18\u53F7\u3082\u4F75\u8A18\uFF09\u3002"), mx, lb("\u540C\u76DF\u95A2\u4FC2", "ALLIANCES"), g, lb("\u7DE0\u7D50\u6E08\u307F\u306E\u6761\u7D04\uFF08\u65B0\u3057\u3044\u9806\uFF09", "TREATIES"), note2(`${tr.length} \u4EF6`), vlist(tr, 40, (t) => h("div", { class: "vrow full" }, h("small", { style: "color:var(--dim);flex:none" }, `${date2(t.signedAt).split("\u6708")[0]}\u6708 `), h("span", {}, `${TREATY[t.type]?.ja ?? t.type}: ${stateName(t.a)}\u30FB${stateName(t.b)}`))), lb("\u6700\u8FD1\u306E\u4EA4\u6E09", "NEGOTIATIONS"), ...recent.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "\u8B1B\u548C" : TREATY[p.type]?.ja} ${stateName(p.from)}\u2192${stateName(p.to)}`), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status]))));
  }
  var KINDS = { culture: ["cultures", "\u6587\u5316", "CULTURE"], language: ["languages", "\u8A00\u8A9E", "LANGUAGE"], religion: ["religions", "\u5B97\u6559", "RELIGION"] };
  function pEntity(kind) {
    const [key, ja, code] = KINDS[kind], c = civ2(), items = Object.values(c[key]), cur = c[key][S2.entity[kind]], box = h("div", {}, ...head(code, ja));
    const use = /* @__PURE__ */ new Map(), idk = kind + "Id";
    for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) if (co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"]) {
      const id = co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"];
      use.set(id, (use.get(id) ?? 0) + g.pop * co.share);
    }
    box.append(note2(`${items.length} \u4EF6\u3002\u6A39\u5F62\u56F3\u306F\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u3002\u30CE\u30FC\u30C9\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u8A73\u7D30\u3092\u958B\u304D\u307E\u3059\u3002`), lineageTree(items, { selected: cur?.id, onPick: (x) => {
      S2.entity[kind] = x.id;
      S2.hooks.panel();
    } }));
    if (cur) box.append(entityDetail(kind, cur, use));
    box.append(lb("\u4EBA\u53E3\u306E\u591A\u3044\u9806", "BY POPULATION"), vlist([...items].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)), 26, (x) => h("div", { class: "vrow", onclick: () => {
      S2.entity[kind] = x.id;
      S2.hooks.panel();
    } }, h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), x.name, h("small", { style: "color:var(--dim)" }, ` ${n0(use.get(x.id) ?? 0)}\u4EBA`))));
    return box;
  }
  function entityDetail(kind, x, use) {
    const c = civ2(), nm = h("input", { id: "ent-name", value: x.name }), par = x.parent ? c[KINDS[kind][0]][x.parent]?.name : "\uFF08\u8D77\u6E90\uFF09", kids = Object.values(c[KINDS[kind][0]]).filter((y) => y.parent === x.id), rows = [["\u540D\u524D", x.name], ["\u7CFB\u7D71\uFF08\u89AA\uFF09", par], ["\u6D3E\u751F\u3057\u305F\u5148", kids.length ? kids.map((k) => k.name).join("\u30FB") : "\u306A\u3057"], ["\u6210\u7ACB", date2(Math.max(0, x.bornAt))], ["\u73FE\u5728\u306E\u4EBA\u53E3", n0(use.get(x.id) ?? 0)]];
    if (kind === "religion") rows.push(["\u6700\u9AD8\u795E", x.deity ?? "\u2014"], ["\u4FE1\u4EF0\u5F62\u614B", x.kind ?? "\u2014"], ["\u8056\u5730", x.holyCell != null ? `\u533A\u753B ${x.holyCell}` : "\u2014"], ["\u5275\u59CB\u8005", x.founderId ? c.figures?.[x.founderId]?.name ?? x.founderId : "\u2014"]);
    if (kind === "language" && x.phon) rows.push(["\u5B50\u97F3", x.phon.c.join(" ")], ["\u6BCD\u97F3", x.phon.v.join(" ")], ["\u97F3\u7BC0\u672B\u306E\u5B50\u97F3", x.phon.coda ? "\u3042\u308A" : "\u306A\u3057"], ["\u4FC3\u97F3", x.phon.geminate ? "\u3042\u308A" : "\u306A\u3057"], ["\u97F3\u306E\u5909\u5316", `${x.phon.changes.length} \u4EF6`]);
    if (kind === "culture") rows.push(["\u767A\u7965\u306E\u533A\u753B", x.cell != null ? `\u533A\u753B ${x.cell}` : "\u2014"], ["\u540D\u524D\u306E\u56FA\u5B9A", x.nameFixed ? "\u56FA\u5B9A\uFF08\u5275\u9020\u4E3B\u306E\u7DE8\u96C6\uFF09" : "\u81EA\u52D5"]);
    return h("div", { class: "dt rs" }, h("b", {}, x.name), table(["\u9805\u76EE", "\u5185\u5BB9"], rows), h("div", { class: "rowb" }, nm, btn("\u540D\u524D\u3092\u7DE8\u96C6\uFF08\u5275\u9020\u4E3B\uFF09", () => creator({ type: "creator.rename", kind, id: x.id, name: nm.value }), "", { id: "ent-rename" })), note2("\u5B9A\u7FA9\u306E\u7DE8\u96C6\u306F\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u3068\u3057\u3066\u8A18\u9332\u3055\u308C\u3001\u904E\u53BB\u306E\u5BA2\u89B3\u30A4\u30D9\u30F3\u30C8\u306F\u66F8\u304D\u63DB\u3048\u307E\u305B\u3093\u3002\u5B9A\u7FA9\u3068\u3001\u96C6\u56E3\u3067\u5B9F\u969B\u306B\u4F7F\u308F\u308C\u3066\u3044\u308B\u72B6\u614B\u306F\u5225\u3067\u3059\u3002"));
  }
  function pChron() {
    const c = civ2(), F = S2.tl, types = [["events", "\u5BA2\u89B3\u30A4\u30D9\u30F3\u30C8"], ["creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165"], ["interp", "\u5F8C\u4E16\u306E\u6B74\u53F2\u8A8D\u8B58"]], box = h("div", {}, ...head("CHRONICLE", "\u5E74\u8868"), h("div", { class: "tabs" }, ...types.map(([k, ja]) => h("b", { class: F.type === k ? "on" : "", "data-ttype": k, onclick: () => {
      F.type = k;
      S2.hooks.panel();
    } }, ja))));
    const kinds = [...new Set([...iterRecords(c, { from: c.monthIndex - 12 * 400 })].map((e) => e.kind))].sort(), ks = h("select", { id: "tl-kind", onchange: (e) => {
      F.kind = e.target.value;
      S2.hooks.panel();
    } }, h("option", { value: "" }, "\u3059\u3079\u3066\u306E\u7A2E\u5225"), ...kinds.map((k) => h("option", { value: k, selected: F.kind === k }, k))), tx = h("input", { id: "tl-text", value: F.text, placeholder: "\u8A9E\u3067\u7D5E\u308B", onchange: (e) => {
      F.text = e.target.value;
      S2.hooks.panel();
    } }), y0 = h("input", { id: "tl-from", type: "number", placeholder: "\u5E74\u304B\u3089", value: F.from, style: "width:78px", onchange: (e) => {
      F.from = e.target.value;
      S2.hooks.panel();
    } }), y1 = h("input", { id: "tl-to", type: "number", placeholder: "\u5E74\u307E\u3067", value: F.to, style: "width:78px", onchange: (e) => {
      F.to = e.target.value;
      S2.hooks.panel();
    } });
    box.append(h("div", { class: "rowb" }, F.type === "events" ? ks : null, tx, y0, y1), ...F.entity ? [h("div", { class: "rowb" }, `\u7D5E\u308A\u8FBC\u307F: ${stateName(F.entity)}`, btn("\u89E3\u9664", () => {
      F.entity = "";
      S2.hooks.panel();
    }))] : []);
    const inRange = (d) => (F.from === "" || d.year >= +F.from) && (F.to === "" || d.year <= +F.to), has2 = (s) => !F.text || String(s).includes(F.text);
    let rows = [], render2;
    if (F.type === "events") {
      const all = [...iterRecords(c, { kinds: F.kind ? [F.kind] : null })];
      for (let i = all.length - 1; i >= 0 && rows.length < 2e4; i--) {
        const e = all[i];
        if (F.kind && e.kind !== F.kind || !has2(e.title) || !inRange(e.date) || F.entity && !e.participants.some((p) => p.entityId === F.entity)) continue;
        rows.push(e);
      }
      render2 = (e) => h("div", { class: "vrow", onclick: () => showEvent(e) }, h("small", { style: "color:var(--dim)" }, `${e.date.year}\u5E74${e.date.month}\u6708 `), e.title);
    } else if (F.type === "creator") {
      const ivs = interventionsOf(c).map((r) => ({ at: r.startMonth, t: `\u4ECB\u5165: ${stateName(r.targetId)} \u306E${FIELDS[r.field]?.ja ?? r.field}${r.otherId ? "\uFF08\u2192" + stateName(r.otherId) + "\uFF09" : ""} \u2192 ${r23(r.target)}\uFF08${{ active: "\u6709\u52B9", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" }[r.status]}\uFF09${r.reason ? "\u30FB" + r.reason : ""}` })), eds = (c.wcde.edits ?? []).map((e) => ({ at: e.at, t: `\u76F4\u63A5\u7DE8\u96C6: ${e.targetId} \u306E ${e.property}\uFF08${String(e.before).slice(0, 16)} \u2192 ${String(e.after).slice(0, 16)}\uFF09` }));
      const cats = (c.wcde.catastrophes ?? []).map((r) => ({ at: r.at, t: `\u707D\u5384\u300C${r.name}\u300D\uFF08${r.scope === "world" ? "\u4E16\u754C\u898F\u6A21" : "\u5730\u57DF\u898F\u6A21"}\u30FB\u6307\u5B9A ${Math.round(r.mortality * 100)}%\u30FB\u5B9F\u969B ${Math.round(r.result.share * 100)}%\u30FB\u7D04 ${n0(r.result.dead)} \u4EBA\uFF09${r.reason ? "\u30FB" + r.reason : ""}` }));
      rows = [...ivs, ...eds, ...cats].filter((r) => has2(r.t)).sort((a, b) => b.at - a.at);
      render2 = (r) => h("div", { class: "vrow" }, h("small", { style: "color:var(--purple)" }, `${date2(r.at)} `), r.t);
    } else {
      for (let i = c.interpretations.length - 1; i >= 0 && rows.length < 2e4; i--) {
        const r = c.interpretations[i];
        if (F.entity && r.ownerId !== F.entity || !has2(stateName(r.ownerId) + r.stance)) continue;
        rows.push(r);
      }
      render2 = (r) => {
        const ev = c.events.find((e) => e.eventId === r.eventId);
        return h("div", { class: "vrow" }, h("small", { style: "color:var(--dim)" }, `${date2(r.since)} `), `${stateName(r.ownerId)}\u306E\u8A8D\u8B58\u300C${r.stance}\u300D: ${ev?.title ?? r.eventId}`);
      };
    }
    box.append(note2(`${rows.length.toLocaleString("ja-JP")} \u4EF6\uFF08\u65B0\u3057\u3044\u9806\uFF09\u3002\u53E4\u3044\u6642\u4EE3\u307B\u3069\u8CC7\u6599\u306F\u5931\u308F\u308C\u307E\u3059\u3002`), covBar(c), vlist(rows, 26, render2), h("div", { id: "evdetail", class: "dt" }, "\u9805\u76EE\u3092\u9078\u3076\u3068\u3001\u539F\u56E0\u30FB\u7D50\u679C\u30FB\u95A2\u4FC2\u3059\u308B\u5B9F\u4F53\u3092\u8868\u793A\u3057\u307E\u3059\u3002"));
    return box;
  }
  function covBar(c) {
    const cv = coverage(c).filter((x) => x.kept + x.lost > 0), pre2 = cv.filter((x) => x.y0 < -1e4), hist = cv.filter((x) => x.y0 >= -1e4).slice(-8), sum = (a) => a.reduce((t, x) => [t[0] + x.kept, t[1] + x.lost], [0, 0]), fmt = (k, l) => `${k + l ? Math.round(100 * k / (k + l)) : 100}%`;
    const items = [...pre2.length ? [["\u5148\u53F2", fmt(...sum(pre2))]] : [], ...hist.map((x) => [`${x.y0}\u5E74\u301C`, fmt(x.kept, x.lost)])];
    return h("div", { class: "n", id: "tl-cov" }, "\u6B8B\u3063\u3066\u3044\u308B\u8CC7\u6599\u306E\u5272\u5408\uFF08\u4E16\u7D00\u3054\u3068\uFF09: " + (items.map(([k, v]) => `${k} ${v}`).join("\u3000") || "\u307E\u3060\u6574\u7406\u3055\u308C\u305F\u8CC7\u6599\u306F\u3042\u308A\u307E\u305B\u3093"));
  }
  function showEvent(e) {
    const c = civ2(), d = document.getElementById("evdetail");
    if (!d) return;
    const MEDIA_JA = { trace: "\u907A\u8DE1\u30FB\u75D5\u8DE1", oral: "\u53E3\u627F", tablet: "\u523B\u307E\u308C\u305F\u8A18\u9332", paper: "\u7D19\u306E\u8A18\u9332", print: "\u5370\u5237\u7269" };
    const ents = e.participants.filter((p) => c.states[p.entityId]).map((p) => [h("a", { class: "lk", href: "#", onclick: (ev) => {
      ev.preventDefault();
      S2.hooks.select(p.entityId);
    } }, stateName(p.entityId)), " "]).flat();
    const causes = causesOfRecord(c, e).map((x) => x.record ? h("div", { class: "n" }, `\u539F\u56E0\uFF08\u76F4\u63A5\uFF09: ${x.record.title}\uFF08${x.record.date.year}\u5E74\uFF09`) : h("div", { class: "n" }, x.lost ? "\u539F\u56E0\uFF08\u76F4\u63A5\uFF09: \u8CC7\u6599\u304C\u5931\u308F\u308C\u3066\u3044\u307E\u3059\u3002\u8D77\u304D\u306A\u304B\u3063\u305F\u3068\u3044\u3046\u610F\u5473\u3067\u306F\u3042\u308A\u307E\u305B\u3093" : "\u539F\u56E0\uFF08\u76F4\u63A5\uFF09: \u8A18\u9332\u306E\u7BC4\u56F2\u5916"));
    d.replaceChildren(h("b", {}, e.title), h("div", {}, `${e.date.year}\u5E74${e.date.month}\u6708\u30FB\u7A2E\u5225 ${e.kind}\u30FB\u51FA\u5178 ${e.provenance}\u30FB\u8A18\u9332 ${MEDIA_JA[e.m] ?? "\u4E0D\u660E"}`), h("div", {}, "\u95A2\u4FC2\u3059\u308B\u5B9F\u4F53: ", ...ents), ...causes, ...(e.effects ?? []).slice(0, 8).map((f) => h("div", { class: "n" }, `\u7D50\u679C: ${f.property} ${f.before ?? "\u2014"} \u2192 ${f.after ?? "\u2014"}`)));
  }
  function pStats() {
    const c = civ2(), A2 = aliveStates(), cells = /* @__PURE__ */ new Map();
    for (const g of Object.values(c.groups)) if (g.stateId) cells.set(g.stateId, (cells.get(g.stateId) ?? 0) + (g.cells?.length || 1));
    const area = (id) => {
      let k = 0;
      for (const g of Object.values(c.groups)) if (g.stateId === id) for (const ce of g.cells?.length ? g.cells : [g.cell]) k += S2.w.world.cell.areaKm2[ce] ?? 0;
      return k;
    };
    const rank = (title, code, items, fmt, crit) => h("div", {}, lb(title, code), h("p", { class: "n" }, "\u57FA\u6E96: " + crit), ...items.slice(0, 10).map((x, i) => h("div", { class: "row" }, h("small", { style: "width:18px" }, i + 1), x.link ?? x.name, h("span", { class: "g" }), h("small", {}, fmt(x.v)))));
    const pop = (key) => {
      const m = /* @__PURE__ */ new Map();
      for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) {
        const id = co[key];
        if (id) m.set(id, (m.get(id) ?? 0) + g.pop * co.share);
      }
      return m;
    };
    const named = (m, tab) => [...m].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ name: tab[id]?.name ?? id, v }));
    return h("div", {}, ...head("STATISTICS", "\u7D71\u8A08"), note2(`\u73FE\u5728 ${formatWorldDate(S2.w)}\u3002\u3059\u3079\u3066\u4E16\u754C\u306E\u72B6\u614B\u304B\u3089\u8A08\u7B97\u3057\u307E\u3059\u3002`), rank("\u8ECD\u4E8B\u529B", "MILITARY", A2.map((s) => ({ link: link(s.id), v: strength(c, s) })).sort((a, b) => b.v - a.v), n0, "\u5175\u529B \xD7 \u8ECD\u4E8B\u80FD\u529B\uFF08\u6709\u52B9\u5024\uFF09\xD7 \u9632\u5FA1\u306E\u500D\u7387\uFF08AI\u30FB\u6226\u4E89\u7814\u7A76\u6240\u3068\u540C\u3058\u6226\u529B\uFF09"), rank("\u56FD\u571F", "TERRITORY", A2.map((s) => ({ link: link(s.id), v: area(s.id) })).sort((a, b) => b.v - a.v), (v) => n0(v) + " km\xB2", "\u56FD\u5BB6\u306B\u5C5E\u3059\u308B\u96C6\u56E3\u306E\u533A\u753B\u306E\u9762\u7A4D\u306E\u5408\u8A08"), rank("\u4EBA\u53E3", "POPULATION", A2.map((s) => ({ link: link(s.id), v: s.pop })).sort((a, b) => b.v - a.v), n0, "\u56FD\u5BB6\u306B\u5C5E\u3059\u308B\u96C6\u56E3\u306E\u4EBA\u53E3\u306E\u5408\u8A08"), rank("\u6587\u5316", "CULTURE", named(pop("cultureId"), c.cultures), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u6587\u5316\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"), rank("\u5B97\u6559", "RELIGION", named(pop("religionId"), c.religions), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u5B97\u6559\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"), rank("\u8A00\u8A9E", "LANGUAGE", named(pop("languageId"), c.languages), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u8A00\u8A9E\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"));
  }
  var IDX = /* @__PURE__ */ new WeakMap();
  function index(c) {
    let I = IDX.get(c);
    if (!I) IDX.set(c, I = { n: 0, ent: [], ev: [] });
    const ent = [], put2 = (kind, id, name, go) => name && ent.push({ kind, id, name, k: String(name), go });
    for (const s of Object.values(c.states)) put2("\u56FD\u5BB6", s.id, s.name, () => S2.hooks.select(s.id));
    for (const f of Object.values(c.figures ?? {})) put2("\u4EBA\u7269", f.id, f.name, () => f.stateId && c.states[f.stateId] ? S2.hooks.select(f.stateId) : null);
    for (const s of Object.values(c.settlements)) put2("\u90FD\u5E02", s.id, s.name, () => S2.hooks.focusCell(s.cell));
    for (const [k, ja] of [["cultures", "\u6587\u5316"], ["languages", "\u8A00\u8A9E"], ["religions", "\u5B97\u6559"]]) for (const x of Object.values(c[k])) put2(ja, x.id, x.name, () => {
      const kind = k === "cultures" ? "culture" : k === "languages" ? "language" : "religion";
      S2.entity[kind] = x.id;
      S2.hub = kind;
      S2.hooks.render();
    });
    Promise.resolve().then(() => (init_tech(), tech_exports)).then((m) => {
      for (const t of m.TECHS) put2("\u6280\u8853", t.key, t.name, () => {
        S2.tech = t.key;
        S2.tab = "tech";
        S2.hub = "nations";
        S2.hooks.render();
      });
    });
    for (const w of Object.values(c.wars)) put2("\u6226\u4E89", w.id, warTitle(w), () => {
      S2.war = w.id;
      S2.hub = "war";
      S2.hooks.render();
    });
    for (const t of Object.values(c.treaties)) put2("\u6761\u7D04", t.id, `${TREATY[t.type]?.ja}:${stateName(t.a)}\u30FB${stateName(t.b)}`, () => {
      S2.hub = "diplo";
      S2.hooks.render();
    });
    I.ent = ent;
    for (; I.n < c.events.length; I.n++) I.ev.push(c.events[I.n].title);
    return I;
  }
  function pSearch() {
    const c = civ2(), I = index(c), q2 = S2.q, inp = h("input", { id: "q", value: q2, placeholder: "\u56FD\u5BB6\u30FB\u4EBA\u7269\u30FB\u90FD\u5E02\u30FB\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u30FB\u6280\u8853\u30FB\u6226\u4E89\u30FB\u6761\u7D04\u30FB\u51FA\u6765\u4E8B", style: "width:100%", onchange: (e) => {
      S2.q = e.target.value;
      S2.hooks.panel();
    } }), res = [];
    if (q2) {
      for (const e of I.ent) if (e.k.includes(q2)) res.push([e.kind, e.name, e.go]);
      for (let i = I.ev.length - 1; i >= 0 && res.length < 400; i--) if (I.ev[i].includes(q2)) res.push(["\u51FA\u6765\u4E8B", I.ev[i], () => {
        S2.tl = { ...S2.tl, type: "events", text: q2, kind: "", entity: "" };
        S2.hub = "chron";
        S2.hooks.render();
      }]);
    }
    return h("div", {}, ...head("SEARCH", "\u691C\u7D22"), inp, note2(q2 ? `${res.length}${res.length >= 400 ? "+" : ""} \u4EF6\uFF08\u540D\u524D\u304C\u5909\u308F\u3063\u3066\u3082\u3001\u5B89\u5B9A\u3057\u305F ID \u3067\u305F\u3069\u308C\u307E\u3059\uFF09` : "\u8A9E\u3092\u5165\u529B\u3057\u3066 Enter\u3002"), vlist(res, 26, (r) => h("div", { class: "vrow", onclick: r[2] }, h("small", { style: "color:var(--dim);width:42px;flex:none" }, r[0]), r[1])));
  }
  function catastropheBox() {
    const c = civ2(), nm = h("input", { id: "cat-name", placeholder: "\u707D\u5384\u306E\u540D\u524D\uFF08\u4EFB\u610F\uFF09", style: "width:100%" }), why2 = h("input", { id: "cat-why", placeholder: "\u7406\u7531\u306E\u6CE8\u91C8\uFF08\u4EFB\u610F\u30FB\u539F\u56E0\u3092\u8AAC\u660E\u3057\u306A\u304F\u3066\u3088\u3044\uFF09", style: "width:100%" });
    const scope = h("select", { id: "cat-scope" }, h("option", { value: "world" }, "\u4E16\u754C\u898F\u6A21"), h("option", { value: "region" }, "\u5730\u57DF\u898F\u6A21\uFF08\u56FD\u306E\u9996\u90FD\u3092\u4E2D\u5FC3\u306B\uFF09")), at2 = h("select", { id: "cat-at", style: "display:none" }, ...aliveStates().sort((a, b) => b.pop - a.pop).slice(0, 80).map((s) => h("option", { value: s.id }, s.name)));
    const rad = h("input", { id: "cat-radius", type: "number", value: 1500, min: 100, max: 2e4, style: "width:80px;display:none" }), mor = h("input", { id: "cat-mort", type: "number", value: 30, min: 1, max: 95, step: 1, style: "width:70px" }), rec = h("input", { id: "cat-rec", type: "number", value: 60, min: 6, max: 480, style: "width:70px" }), ok2 = h("input", { type: "checkbox", id: "cat-ok" });
    scope.addEventListener("change", () => {
      const r = scope.value === "region";
      at2.style.display = rad.style.display = r ? "" : "none";
    });
    const go = () => {
      if (!ok2.checked) {
        S2.notice = "\u53D6\u308A\u6D88\u305B\u306A\u3044\u64CD\u4F5C\u3067\u3059\u3002\u78BA\u8A8D\u306E\u6B04\u306B\u30C1\u30A7\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044";
        S2.hooks.render();
        return;
      }
      const cell = scope.value === "region" ? c.groups[c.states[at2.value]?.capitalGroupId]?.cell : null;
      creator({ type: "creator.catastrophe", name: nm.value, reason: why2.value, scope: scope.value, center: cell ?? null, radiusKm: Number(rad.value), mortality: Number(mor.value) / 100, recoveryMonths: Number(rec.value) });
    };
    const log3 = (c.wcde.catastrophes ?? []).slice(-4).reverse();
    return h("div", {}, lb("\u5275\u9020\u4E3B\u306E\u707D\u5384", "CATASTROPHE"), note2("\u5927\u304D\u306A\u707D\u5384\u3092\u8D77\u3053\u3057\u307E\u3059\u3002\u4EBA\u53E3\u30FB\u8ECD\u30FB\u5B89\u5B9A\u306B\u3059\u3050\u53CD\u6620\u3055\u308C\u3001\u767A\u751F\u524D\u3078\u306F\u623B\u308A\u307E\u305B\u3093\u3002"), nm, why2, h("div", { class: "rowb" }, scope, at2), h("div", { class: "rowb" }, h("small", {}, "\u534A\u5F84(km)"), rad, h("small", {}, "\u4EBA\u53E3\u306E\u640D\u5931 %\uFF08\u6700\u5927 95\uFF09"), mor, h("small", {}, "\u56DE\u5FA9\u306E\u76EE\u5B89(\u6708)"), rec), h("div", { class: "rowb" }, h("label", {}, ok2, " \u53D6\u308A\u6D88\u305B\u306A\u3044\u3053\u3068\u3092\u7406\u89E3\u3057\u305F"), btn("\u707D\u5384\u3092\u8D77\u3053\u3059", go, "p", { id: "cat-go" })), ...log3.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `\u300C${r.name}\u300D${r.scope === "world" ? "\u4E16\u754C\u898F\u6A21" : "\u5730\u57DF\u898F\u6A21"}`, h("br"), h("small", {}, `${date2(r.at)}\u30FB\u5B9F\u969B\u306E\u640D\u5931 ${Math.round(r.result.share * 100)}%\uFF08\u7D04 ${n0(r.result.dead)} \u4EBA\uFF09`)))));
  }
  function pSettings() {
    const c = civ2(), cf = c.wcde.config, T3 = timeOf(c), errs = checkWcdeIntegrity(S2.w.world, c), msg = h("p", { class: "n", id: "exp-msg" }), cal = cf.calendar;
    const dl = (blob, name) => {
      const a = h("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
    };
    const save = async () => {
      msg.textContent = "\u5727\u7E2E\u3057\u3066\u66F8\u304D\u51FA\u3057\u3066\u3044\u307E\u3059\u2026";
      const p = await packSaveGz(S2.w);
      dl(new Blob([p.bytes], { type: "application/gzip" }), `alterhistory-${cf.worldSeed}-${c.date.year}.ahw.gz`);
      msg.textContent = `\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08\u5727\u7E2E ${(p.bytes.length / 1048576).toFixed(1)} MB\uFF0F\u5143 ${(p.rawBytes / 1048576).toFixed(1)} MB\uFF09`;
    };
    const obs = async () => {
      msg.textContent = "Obsidian \u7528\u306E ZIP \u3092\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026";
      try {
        const r = await exportObsidianZip(S2.w.world, c, cf.name || cf.worldSeed);
        dl(new Blob([r.bytes], { type: "application/zip" }), `${r.root}.zip`);
        msg.textContent = `ZIP \u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08${r.files} \u30D5\u30A1\u30A4\u30EB\uFF09`;
      } catch (e) {
        msg.textContent = "\u66F8\u304D\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F: " + e.message;
      }
    };
    const en = h("input", { id: "epoch-name", value: cal.epochName ?? "", style: "width:120px" });
    const past = h("input", { id: "past-year", type: "number", placeholder: "\u5E74", style: "width:90px" });
    return h(
      "div",
      {},
      ...head("SETTINGS", "\u4E16\u754C\u8A2D\u5B9A\u30FB\u51FA\u529B"),
      table(["\u9805\u76EE", "\u5024"], [["\u4E16\u754C\u306E\u7A2E", cf.worldSeed], ["\u89E3\u50CF\u5EA6\uFF08\u30BB\u30EB\uFF09", S2.w.world.mesh.cellCount], ["\u7A2E\u65CF", (cf.species ?? []).map((s) => s.name ?? s.id ?? s).join("\u30FB") || "\u2014"], ["\u5148\u53F2\u306E\u9577\u3055", `${n0(cf.prehistory?.years ?? 0)} \u5E74`], ["\u73FE\u5728", formatWorldDate(S2.w)], ["\u66A6\u306E\u8D77\u70B9\u540D", cal.epochName], ["\u6642\u4EE3\u533A\u5206", (cal.eras ?? []).map((e) => e.name).join(" \u2192 ")]]),
      lb("\u66A6\u306E\u8868\u793A\u540D\uFF08\u8868\u793A\u7528\u306E\u307F\uFF09", "CALENDAR"),
      h("div", { class: "rowb" }, en, btn("\u5909\u66F4", () => {
        const r = run({ type: "calendar.edit", edit: { epochName: en.value } });
        S2.hooks.render();
      })),
      note2("\u751F\u6210\u5F8C\u306B\u5909\u3048\u3089\u308C\u308B\u306E\u306F\u8868\u793A\u7528\u306E\u540D\u79F0\u30FB\u533A\u5206\u3060\u3051\u3067\u3059\u3002\u904E\u53BB\u306E\u65E5\u4ED8\u30FB\u767A\u751F\u9806\u30FB\u5BA2\u89B3\u7684\u4E8B\u5B9F\u306F\u5909\u308F\u308A\u307E\u305B\u3093\u3002"),
      lb("\u91CD\u5927\u30CB\u30E5\u30FC\u30B9", "NEWS"),
      note2("\u6642\u9593\u304C\u6B62\u307E\u3063\u3066\u4E2D\u592E\u3067\u78BA\u8A8D\u3059\u308B\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306F\u3001\u81EA\u56FD\uFF08\u62C5\u5F53\u56FD\uFF09\u306B\u95A2\u3059\u308B\u91CD\u5927\u306A\u51FA\u6765\u4E8B\u3068\u3001\u4E16\u754C\u5927\u6226\u3060\u3051\u3067\u3059\u3002\u62C5\u5F53\u56FD\u304C\u306A\u3044\u3068\u304D\u306F\u4E16\u754C\u5927\u6226\u3060\u3051\u3067\u3059\u3002\u305D\u308C\u4EE5\u5916\u306F\u53F3\u306E\u30CB\u30E5\u30FC\u30B9\u6B04\u306B\u51FA\u307E\u3059\u3002"),
      catastropheBox(),
      lb("\u4FDD\u5B58\u30FB\u8AAD\u307F\u8FBC\u307F\u30FB\u51FA\u529B", "SAVE / EXPORT"),
      h("div", { class: "rowb" }, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3059", save, "p", { id: "save" }), fileLoader(), btn("Obsidian \u7528 Markdown ZIP", obs, "", { id: "obs" })),
      msg,
      ...S2.fileWarn.map((x) => h("p", { class: "warn" }, x)),
      lb("\u30D0\u30FC\u30B8\u30E7\u30F3\u60C5\u5831", "VERSION"),
      table(["\u9805\u76EE", "\u5024"], [["\u30A2\u30D7\u30EA\u306E\u7248", APP_VERSION_FOR_SAVE], ["\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\uFF08\u30A2\u30D7\u30EA\u306E\u7248\u3068\u306F\u5225\uFF09", SAVE_SCHEMA], ["\u6574\u5408\u6027\u306E\u691C\u67FB", errs.length ? `${errs.length} \u4EF6\u306E\u554F\u984C` : "\u554F\u984C\u306A\u3057"], ["\u6642\u9593\u306E\u901F\u5EA6", SPEEDS.find((s) => s.id === T3.speed)?.label]]),
      lb("\u904E\u53BB\u306E\u95B2\u89A7", "PAST VIEW"),
      note2("\u904E\u53BB\u306E\u56FD\u5BB6\u306E\u72B6\u614B\u3092\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u898B\u307E\u3059\u3002\u95B2\u89A7\u4E2D\u306F\u3001\u4E16\u754C\u3092\u5909\u3048\u308B\u64CD\u4F5C\u3068\u6642\u9593\u9032\u884C\u304C\u6B62\u307E\u308A\u307E\u3059\u3002"),
      h("div", { class: "rowb" }, past, btn("\u305D\u306E\u5E74\u3092\u898B\u308B", () => {
        const y = Number(past.value);
        if (Number.isFinite(y)) {
          run({ type: "view.past", month: Math.max(0, Math.min(c.monthIndex, c.monthIndex - (c.date.year - y) * 12)) });
          S2.hooks.render();
        }
      }), btn("\u73FE\u5728\u3078\u623B\u308B", () => {
        run({ type: "view.past", month: null });
        S2.hooks.render();
      }))
    );
  }
  function fileLoader(done2) {
    const inp = h("input", { type: "file", accept: ".ahw,.gz,.json,application/json,application/gzip", id: "loadfile", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = await unpackSaveAny(new Uint8Array(await f.arrayBuffer()));
      if (!r.ok) {
        alert("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093:\n" + r.errors.join("\n"));
        return;
      }
      (done2 ?? S2.hooks.loaded)(r.w, r.warnings);
    } });
    return h("span", {}, inp, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3080", () => inp.click(), "", { id: "load" }));
  }

  // js/ui/v6/main.js
  var $ = (s) => document.querySelector(s);
  var root = () => $("#v6-root");
  var HUB = [["geo", "\u5730\u7406", "GEO"], ["nations", "\u56FD\u5BB6", "NATION"], ["war", "\u6226\u4E89", "WAR"], ["diplo", "\u5916\u4EA4", "DIPLO"], ["culture", "\u6587\u5316", "CULT"], ["language", "\u8A00\u8A9E", "LANG"], ["religion", "\u5B97\u6559", "RELIG"], ["chron", "\u5E74\u8868", "CHRON"], ["stats", "\u7D71\u8A08", "STATS"], ["search", "\u691C\u7D22", "FIND"], ["settings", "\u4E16\u754C\u8A2D\u5B9A", "CONFIG"]];
  var PANELS = { geo: pGeo, nations: pNations, war: pWar, diplo: pDiplo, culture: () => pEntity("culture"), language: () => pEntity("language"), religion: () => pEntity("religion"), chron: pChron, stats: pStats, search: pSearch, settings: pSettings };
  function setup() {
    const seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3e3, 6e3].map((n2) => h("option", { value: n2, selected: n2 === 3e3 }, n2 === 3e3 ? "3,000 \u30BB\u30EB\uFF08\u6A19\u6E96\uFF09" : "6,000 \u30BB\u30EB\uFF08\u7D30\u304B\u3044\u30FB\u9045\u3044\uFF09"))), msg = h("p", { class: "n", id: "setup-msg" });
    const go = () => {
      msg.textContent = "\u751F\u6210\u4E2D\u2026\uFF08\u5148\u53F2\u306E\u8A08\u7B97\u306B\u6570\u79D2\u304B\u304B\u308A\u307E\u3059\uFF09";
      setTimeout(() => {
        const r = createNewWorld({ worldSeed: seed.value, spec: { resolution: { targetCells: +cells.value } } });
        if (!r.ok) {
          msg.textContent = r.errors.join(" / ");
          return;
        }
        S2.w = r.w;
        founding();
      }, 30);
    };
    root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "ALTERHISTORY v6"), h("h1", {}, "\u4E16\u754C\u3092\u4F5C\u308B"), h("p", { class: "n" }, "\u7D0450\u4E07\u5E74\u306E\u5148\u53F2\u304B\u3089\u3001\u56FD\u5BB6\u304C\u751F\u307E\u308C\u308B\u6642\u4EE3\u3078\u3002"), h("label", {}, "\u4E16\u754C\u306E\u7A2E ", seed), h("label", {}, "\u89E3\u50CF\u5EA6 ", cells), h("div", { class: "rowb" }, btn("\u4E16\u754C\u3092\u751F\u6210", go, "p", { id: "gen" }), fileLoader((w, warn) => {
      S2.w = w;
      S2.fileWarn = warn;
      start();
    })), msg));
  }
  function founding() {
    const c = listCandidates(S2.w), civ3 = S2.w.civ, pre2 = civ3.wcde.prehistory ?? {}, ce = S2.w.world.cell, ja = new Proxy({}, { get: (_, k) => polityJa(k) });
    const msg = h("p", { class: "n" }, c.length ? "\u56FD\u3092\u9078\u3093\u3067\u62C5\u5F53\u3059\u308B\u304B\u3001\u4E16\u754C\u306B\u4EFB\u305B\u3066\u898B\u5B88\u308A\u307E\u3059\u3002" : "\u307E\u3060\u56FD\u5BB6\u306E\u5019\u88DC\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u4E16\u754C\u306B\u4EFB\u305B\u3066\u9032\u3081\u307E\u3059\u3002"), list = h("div", {});
    const yrsAgo = (m) => Math.round(((civ3.wcde.foundedAt ?? civ3.monthIndex) - m) / 12);
    const fmtYears = (y) => y >= 1e4 ? `\u7D04 ${Math.round(y / 1e3) / 10} \u4E07\u5E74\u524D` : `\u7D04 ${n0(y)} \u5E74\u524D`;
    const techTl = Object.entries(pre2.firstTech ?? {}).sort((x, y) => x[1] - y[1]).map(([k, m]) => `${fmtYears(yrsAgo(m))}\u3000${TECH[k]?.name ?? k}`);
    const ep = pre2.epochs ?? [], mx = Math.max(1, ...ep.map((e) => Math.log10(Math.max(10, e.pop)))), spark = sv("svg", { viewBox: "0 0 300 60", style: "width:100%;height:60px" }, sv("polyline", { points: ep.map((e, i) => `${i / Math.max(1, ep.length - 1) * 300},${58 - Math.log10(Math.max(10, e.pop)) / mx * 54}`).join(" "), fill: "none", stroke: "#6fa8c9", "stroke-width": 1.6 }), sv("polyline", { points: ep.map((e, i) => `${i / Math.max(1, ep.length - 1) * 300},${58 - (e.ice ?? 0) * 54}`).join(" "), fill: "none", stroke: "#c97a6f", "stroke-width": 1, "stroke-dasharray": "3 3" }));
    const eco = ecoSummary(S2.w.world, civ3), sp = pre2.species ?? {};
    const obs = h(
      "details",
      { class: "dt" },
      h("summary", {}, "\u5148\u53F2\u306E\u89B3\u5BDF\uFF08\u8AAD\u307F\u53D6\u308A\u5C02\u7528\uFF09"),
      sp.archaic ? `\u53E4\u4EE3\u578B\u4EBA\u985E\u306E\u96C6\u56E3\u304C\u73FE\u308C\u308B: ${fmtYears(yrsAgo(sp.archaic.at))}` : "",
      h("br"),
      sp.human ? `\u73FE\u751F\u4EBA\u985E\u304C\u73FE\u308C\u308B: ${fmtYears(yrsAgo(sp.human.at))}\uFF08\u7F6E\u304D\u63DB\u308F\u308A\u30FB\u6DF7\u8840: ${n0(pre2.assimilated ?? 0)} \u96C6\u56E3\uFF09` : "",
      h("br"),
      `\u96C6\u56E3 ${n0(pre2.groups ?? Object.keys(civ3.groups).length)}\u30FB\u4EBA\u53E3 ${n0(Math.round(Object.values(civ3.groups).reduce((a, g) => a + g.pop, 0)))}\u30FB\u5B9A\u4F4F ${n0(pre2.settlements ?? 0)}\u30FB\u6C37\u671F\u306E\u6700\u5927 ${Math.round((pre2.glacialMax ?? 0) * 100)}%\u30FB\u6D77\u3092\u6E21\u3063\u305F ${n0(pre2.seaCrossings ?? 0)} \u56DE`,
      h("br"),
      eco ? `\u751F\u614B\u7CFB: \u690D\u7269 ${Math.round(eco.flora * 100)}%\u30FB\u52D5\u7269 ${Math.round(eco.fauna * 100)}%\u30FB\u8352\u5EC3\u3057\u305F\u571F\u5730 ${Math.round(eco.degraded * 100)}%` : "",
      h("br"),
      "\u4EBA\u53E3\uFF08\u9752\u30FB\u5BFE\u6570\uFF09\u3068\u6C37\u671F\uFF08\u8D64\u306E\u7834\u7DDA\uFF09\u306E\u63A8\u79FB",
      spark,
      h("b", {}, "\u6280\u8853\u306E\u51FA\u73FE"),
      h("br"),
      ...techTl.flatMap((t) => [t, h("br")])
    );
    for (const x of c.slice(0, 20)) {
      const cu = civ3.cultures[x.cultureId]?.name, lg = civ3.languages[x.languageId]?.name, rl = civ3.religions[x.religionId]?.name, lat = Math.round(ce.lat[x.cell] * 180 / Math.PI);
      const sel = x.polityOptions.length > 1 ? h("select", { class: "pol" }, ...x.polityOptions.map((p) => h("option", { value: p }, ja[p] ?? p))) : null;
      list.append(h("div", { class: "row" }, h("span", { class: "g" }, h("b", {}, x.viaJa), h("br"), h("small", {}, `\u4EBA\u53E3 ${n0(x.pop)}\u30FB\u96C6\u56E3 ${x.groupIds.length}\u30FB${lat >= 0 ? "\u5317\u7DEF" : "\u5357\u7DEF"} ${Math.abs(lat)}\xB0`), h("br"), h("small", {}, [cu && `\u6587\u5316 ${cu}`, lg && `\u8A00\u8A9E ${lg}`, rl && `\u5B97\u6559 ${rl}`].filter(Boolean).join("\u30FB") || "\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u306F\u6210\u7ACB\u5F8C\u306B\u5B9A\u307E\u308B")), sel, btn("\u62C5\u5F53\u3057\u3066\u5EFA\u56FD", () => {
        const r = act({ type: "founding.found", candidateId: x.id, polity: sel?.value ?? null });
        r.ok ? start() : msg.textContent = S2.notice;
      })));
    }
    root().replaceChildren(h("div", { class: "center", style: "max-width:760px" }, h("div", { class: "code" }, "FOUNDING"), h("h1", {}, "\u5EFA\u56FD"), msg, btn("\u4E16\u754C\u306B\u4EFB\u305B\u3066\u59CB\u3081\u308B\uFF08\u62C5\u5F53\u56FD\u306A\u3057\uFF09", () => {
      run({ type: "founding.delegate" });
      start();
    }, "", { id: "delegate" }), list, obs));
  }
  function start() {
    S2.hub = null;
    S2.sel = controlled() ?? null;
    S2.hooks = { render, panel: renderPanel, mapOnly: () => {
      S2.map.draw();
      renderLegend();
    }, select, focusCell, loaded: (w, warn) => {
      S2.w = w;
      S2.fileWarn = warn;
      start();
    } };
    shell();
    render();
    clearInterval(S2.timer);
    S2.timer = setInterval(tick, 250);
  }
  function shell() {
    const cv = h("canvas", { id: "map", "aria-label": "\u4E16\u754C\u5730\u56F3" });
    root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }, h("button", { id: "prefresh", title: "\u4E16\u754C\u304C\u9032\u3093\u3060\u306E\u3067\u3001\u3053\u306E\u30DA\u30FC\u30B8\u306E\u5185\u5BB9\u306F\u53E4\u304F\u306A\u3063\u3066\u3044\u307E\u3059", onclick: () => renderPanel() }, "\u21BB \u6700\u65B0\u306E\u72B6\u614B\u306B\u66F4\u65B0"), h("div", { id: "pin" })), h("main", { id: "mapwrap" }, cv, h("div", { id: "hint" }, "\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u30FB\u30AF\u30EA\u30C3\u30AF\u3067\u56FD\u5BB6\u3092\u9078\u629E"), h("div", { id: "leg" }), h("div", { id: "callout" }), h("div", { id: "pops" })), h("aside", { id: "right", class: "open" }, h("div", { id: "rin" }, h("div", { id: "clock" }), h("h2", {}, "\u30CB\u30E5\u30FC\u30B9"), h("div", { id: "feed" })))), h("div", { id: "newsmodal", hidden: true }));
    S2.map = new MapView(cv, S2.w);
    S2.map.sel = S2.sel;
    S2.map.onPick = callout;
    requestAnimationFrame(() => {
      S2.map.draw();
      renderLegend();
    });
    window.addEventListener("resize", () => S2.map?.draw());
  }
  function render() {
    if (!$("#hub")) return;
    renderHub();
    renderPanel();
    renderRight();
    renderNews();
    S2.map.sel = S2.sel;
    S2.map.draw();
    renderLegend();
    const w = S2.w;
    $("#hint").textContent = w.viewPast != null ? "\u904E\u53BB\u3092\u95B2\u89A7\u4E2D\u3002\u4E16\u754C\u3092\u5909\u3048\u308B\u64CD\u4F5C\u3068\u6642\u9593\u9032\u884C\u306F\u6B62\u307E\u3063\u3066\u3044\u307E\u3059\u3002" + (S2.notice ? " " + S2.notice : "") : S2.notice || "\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u30FB\u30AF\u30EA\u30C3\u30AF\u3067\u56FD\u5BB6\u3092\u9078\u629E";
    $("#hint").style.color = S2.notice || w.viewPast != null ? "var(--yellow)" : "";
  }
  function renderHub() {
    $("#hub").replaceChildren(...HUB.map(([k, ja, code]) => h("button", { class: S2.hub === k ? "on" : "", "data-hub": k, onclick: () => {
      S2.hub = S2.hub === k ? null : k;
      render();
      setTimeout(() => S2.map?.draw(), 220);
    } }, ja, h("small", {}, code))));
  }
  function renderPanel() {
    const p = $("#panel");
    S2.paintedMonth = S2.w?.civ.monthIndex ?? null;
    $("#prefresh")?.classList.remove("stale");
    if (!S2.hub) {
      p.classList.remove("open");
      return;
    }
    p.classList.add("open");
    const wide = S2.hub === "nations" && (S2.tab === "tech" || S2.tab === "doctrine") && S2.sel;
    p.style.setProperty("--pw", wide ? "min(760px, 62vw)" : "");
    const keep = $("#pin").scrollTop;
    $("#pin").replaceChildren(PANELS[S2.hub]());
    $("#pin").scrollTop = keep;
  }
  function renderLegend() {
    const M = S2.map;
    if (!M) return;
    const L = M.legend(M.legendKey());
    $("#leg").replaceChildren(h("b", {}, "\u51E1\u4F8B "), ...L.slice(0, 6).map((x) => h("span", { style: "margin-right:10px" }, x.c ? h("i", { style: `display:inline-block;width:10px;height:10px;background:${x.c};margin-right:4px` }) : "", x.t)));
    $("#leg").style.display = L.length ? "block" : "none";
  }
  function select(id) {
    S2.sel = id;
    S2.hub = "nations";
    if (!S2.tab) S2.tab = "politics";
    render();
    $("#callout").classList.remove("on");
  }
  function focusCell(cell) {
    const M = S2.map, g = M.geo, W2 = M.cv.width, H = M.cv.height, [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W2, H);
    M.view.k = 4;
    M.view.x = W2 / 2 - x * 4;
    M.view.y = H / 2 - y * 4;
    M.clamp();
    M.draw();
  }
  function callout(p) {
    const c = $("#callout"), civ3 = S2.w.civ, st2 = p.stateId ? civ3.states[p.stateId] : null, ce = S2.w.world.cell, mine = st2 && controlled() === st2.id;
    const body = st2 ? [h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st2.id)};display:inline-block;margin-right:6px` }), st2.name), h("div", { class: "sub" }, `${polityJa(st2.polity)}\u30FB\u4EBA\u53E3 ${n0(st2.pop)}\u30FB\u5B89\u5B9A\u5EA6 ${pct(st2.stability)}`), h("div", { class: "sub" }, `\u70BA\u653F\u8005: ${st2.leader?.name ?? "\u2014"}`), p.settlement ? h("div", { class: "sub" }, `\u90FD\u5E02: ${p.settlement.name ?? "\u2014"}\uFF08\u4EBA\u53E3 ${n0(p.settlement.pop)}\uFF09`) : null, h("div", { class: "bt" }, btn("\u8A73\u7D30", () => select(st2.id)), btn("\u5916\u4EA4", () => {
      S2.tab = "diplomacy";
      select(st2.id);
    }), mine ? null : btn("\u62C5\u5F53\u3059\u308B", () => {
      run({ type: "control.take", stateId: st2.id });
      S2.sel = st2.id;
      render();
    }, "p"))] : [h("h3", {}, p.settlement?.name ?? "\u672A\u6240\u5C5E\u306E\u5730"), h("div", { class: "sub" }, `\u533A\u753B ${p.cell}\u30FB\u6A19\u9AD8 ${Math.round(ce.elevation[p.cell] * 100) / 100}\u30FB\u6C17\u6E29 ${Math.round(ce.temp[p.cell])}`), p.settlement ? h("div", { class: "sub" }, `\u4EBA\u53E3 ${n0(p.settlement.pop)}`) : h("div", { class: "sub" }, "\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u307E\u305B\u3093")];
    c.replaceChildren(...body);
    const W2 = $("#mapwrap").clientWidth;
    c.style.left = Math.min(Math.max(8, p.x + 10), W2 - 280) + "px";
    c.style.top = Math.max(8, p.y + 10) + "px";
    c.classList.add("on");
    if (st2) {
      S2.sel = st2.id;
      S2.map.sel = st2.id;
      S2.map.draw();
    }
  }
  function renderRight() {
    const w = S2.w, T3 = timeOf(w.civ), feed = newsFeed(w.civ, { limit: 30, minLevel: "major" }), cs = controlled();
    $("#clock").replaceChildren(h("div", { class: "d", id: "date" }, formatWorldDate(w)), h("div", { class: "n" }, cs ? `\u62C5\u5F53: ${stateName(cs)}` : "\u62C5\u5F53\u56FD\u306A\u3057\uFF08\u898B\u5B88\u308A\uFF09"), h("div", { class: "c" }, ...SPEEDS.map((s) => h("button", { class: (T3.hold ? T3.resumeSpeed : T3.speed) === s.id ? "on" : "", "data-speed": s.id, title: s.id ? `${s.mps} \u304B\u6708\uFF0F\u79D2` : "\u505C\u6B62", onclick: () => {
      run({ type: "clock.setSpeed", speed: s.id });
      renderRight();
    } }, s.label))), h("div", { class: "n", id: "runstate" }, T3.hold ? "\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061" : T3.speed ? "\u9032\u884C\u4E2D\uFF081\u79D2\u3042\u305F\u308A\uFF09" : "\u505C\u6B62\u4E2D"));
    $("#feed").replaceChildren(...feed.map((n2) => h("div", { class: "ev" + (n2.level === "critical" ? " y" : "") }, h("time", {}, `${n2.date.year}\u5E74${n2.date.month}\u6708`), n2.title, " ", ...n2.entityIds.filter((i) => w.civ.states[i]).slice(0, 2).map((i) => [link(i), " "]))));
  }
  function renderNews() {
    const m = $("#newsmodal"), q2 = newsOf(S2.w.civ).queue;
    if (!q2.length) {
      m.hidden = true;
      m.replaceChildren();
      return;
    }
    const n2 = q2[0];
    m.hidden = false;
    m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "code", style: "justify-content:center" }, `\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\uFF08\u6B8B\u308A ${q2.length} \u4EF6\uFF09`), h("div", { class: "n" }, `${n2.date.year}\u5E74${n2.date.month}\u6708`), h("h2", {}, n2.title), h("div", {}, ...n2.entityIds.filter((i) => S2.w.civ.states[i]).map((i) => [link(i), " "])), h("div", { class: "rowb", style: "justify-content:center;margin-top:16px" }, btn("OK", () => {
      run({ type: "news.ack", id: n2.id });
      renderRight();
      renderNews();
      S2.map.draw();
    }, "p", { id: "ack" }))));
  }
  function tick() {
    const w = S2.w;
    if (!w || w.viewPast != null || !isRunning(w.civ)) return;
    const T3 = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T3.speed)?.mps ?? 0, r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) });
    if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 });
    live();
  }
  function live() {
    if (!$("#hub")) return;
    renderRight();
    renderNews();
    S2.map.draw();
    if (S2.hub && S2.w.civ.monthIndex !== S2.paintedMonth) $("#prefresh")?.classList.add("stale");
    if (S2.notice) $("#hint").textContent = S2.notice;
  }
  function dismissSplash() {
    const el = document.getElementById("splash");
    if (!el) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, since = performance.now() - (window.__splashAt ?? 0), wait = reduce ? 0 : Math.max(0, 900 - since);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), reduce ? 0 : 340);
    }, wait);
  }
  function boot() {
    if (!document.getElementById("v6-root")) return;
    initNotify();
    setup();
    dismissSplash();
  }
  if (typeof window !== "undefined") {
    window.__v6 = { S: S2, run, act, render: () => S2.hooks.render?.(), start };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
