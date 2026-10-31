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
  var LAND_WATER2, BIOMES2;
  var init_world_consts = __esm({
    "js/core/civ/world-consts.js"() {
      LAND_WATER2 = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
      BIOMES2 = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
    }
  });

  // js/core/civ/ids.js
  function createIdGen(seq) {
    return {
      next(kind) {
        if (!ID_KINDS.includes(kind)) throw new Error(`\u672A\u77E5\u306EID\u7A2E\u5225: ${kind}`);
        const n = seq[kind] = (seq[kind] ?? 0) + 1;
        return `${kind}_${n.toString(36).padStart(5, "0")}${check(kind, n)}`;
      }
    };
  }
  var ID_KINDS, ALPHA, check;
  var init_ids = __esm({
    "js/core/civ/ids.js"() {
      ID_KINDS = Object.freeze(["state", "pop", "settle", "person", "event", "decision", "proposal", "tech", "culture", "lang", "religion", "species", "war", "treaty", "battle", "disaster", "work", "interp", "org", "house", "candidate", "unit", "intervention", "proposal"]);
      ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
      check = (kind, n) => {
        let h2 = n * 2654435761 >>> 0;
        for (let i = 0; i < kind.length; i++) h2 = h2 * 31 + kind.charCodeAt(i) >>> 0;
        return ALPHA[h2 % 36];
      };
    }
  });

  // js/core/civ/tick.js
  function createTicker() {
    const handlers = new Map(PHASE_KEYS.map((k) => [k, []]));
    return {
      /** @param {string} phase PHASE_KEYS のいずれか @param {(ctx:object)=>void} fn @param {string} [label] */
      register(phase, fn, label = fn.name || "anonymous") {
        if (!handlers.has(phase)) throw new Error(`\u672A\u77E5\u306E\u30D5\u30A7\u30FC\u30BA: ${phase}`);
        handlers.get(phase).push({ fn, label });
      },
      runMonth(ctx) {
        ctx.trace = [];
        for (const key of PHASE_KEYS) for (const h2 of handlers.get(key)) {
          ctx.phase = key;
          h2.fn(ctx);
          ctx.trace.push(`${key}:${h2.label}`);
        }
        ctx.phase = null;
        return ctx;
      }
    };
  }
  var PHASES, PHASE_KEYS, monthIndex, fromMonthIndex;
  var init_tick = __esm({
    "js/core/civ/tick.js"() {
      PHASES = Object.freeze([
        { key: "clock", name: "\u4E16\u754C\u6642\u8A08\u3092\u6B21\u306E\u6708\u3078" },
        { key: "climate", name: "\u5B63\u7BC0\u30FB\u5929\u5019\u30FB\u6C17\u5019\u306E\u6708\u6B21\u72B6\u614B" },
        { key: "disaster", name: "\u81EA\u7136\u707D\u5BB3\u30FB\u74B0\u5883\u30B7\u30E7\u30C3\u30AF" },
        { key: "economy_pop", name: "\u751F\u696D\u30FB\u751F\u7523\u30FB\u98DF\u6599\u30FB\u4EBA\u53E3\u30FB\u79FB\u4F4F" },
        { key: "culture", name: "\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u30FB\u601D\u60F3" },
        { key: "tech", name: "\u6280\u8853\u306E\u767A\u660E\u30FB\u4F1D\u64AD\u30FB\u55AA\u5931\u30FB\u9032\u6357" },
        { key: "economy", name: "\u751F\u7523\u30FB\u9700\u8981\u30FB\u7523\u696D\u30FB\u4EA4\u6613\u30FB\u56FD\u5BB6\u8CA1\u653F\uFF08v6\uFF09" },
        { key: "politics", name: "\u56FD\u5185\u653F\u6CBB\u30FB\u652F\u6301\u52E2\u529B\u30FB\u6307\u5C0E\u8005\u30FB\u5236\u5EA6\uFF08v6\uFF09" },
        { key: "military", name: "\u8ECD\u4E8B\u7D44\u7E54\u30FB\u90E8\u968A\u30FB\u30C9\u30AF\u30C8\u30EA\u30F3\u30FB\u8ECD\u4E8B\u80FD\u529B\uFF08v6\uFF09" },
        { key: "ai_plan", name: "\u56FD\u5BB6AI\u306E\u8A08\u753B\uFF08\u5730\u56F3\u3092\u5909\u3048\u306A\u3044\uFF09" },
        { key: "apply", name: "\u6C7A\u5B9A\u3068\u5165\u529B\u3092\u691C\u8A3C\u6E08\u307F\u30A2\u30AF\u30B7\u30E7\u30F3\u3068\u3057\u3066\u9069\u7528" },
        { key: "conflict", name: "\u6226\u4E89\u30FB\u5916\u4EA4\u30FB\u53CD\u4E71\u30FB\u56FD\u5BB6\u5F62\u6210\uFF0F\u5D29\u58CA" },
        { key: "integrity", name: "\u6574\u5408\u6027\u691C\u67FB\u30FBEvent/Decision/Snapshot\u78BA\u5B9A" },
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

  // js/core/civ/events.js
  function makeEvent(civ3, ids, { kind, title, participants = [], location = null, causes = [], effects = [], decisionId = null, provenance = "simulation" }) {
    for (const c of causes) {
      if (!RELATIONS.includes(c.relation)) throw new Error(`\u672A\u77E5\u306E\u95A2\u4FC2: ${c.relation}`);
      if (!BASES.includes(c.basis)) throw new Error(`\u672A\u77E5\u306E\u6839\u62E0: ${c.basis}`);
    }
    const ev = { eventId: ids.next("event"), date: { ...civ3.date }, kind, title, participants, location, causes, effects, decisionId, provenance };
    civ3.events.push(ev);
    return ev;
  }
  var RELATIONS, BASES;
  var init_events = __esm({
    "js/core/civ/events.js"() {
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
    const n = a.length;
    if (a[n - 2] === t) {
      if (n >= 4 && a[n - 3] === v) a.length = n - 2;
      else a[n - 1] = v;
      return;
    }
    if (a[n - 1] !== v) a.push(t, v);
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
  function extractState(st, groupCount) {
    const o = {
      alive: st.alive ? 1 : 0,
      player: st.player ? 1 : 0,
      name: st.name,
      via: st.via,
      polity: st.polity,
      cap: st.capitalGroupId ?? "",
      leader: st.leader.name,
      heir: st.leader.heir ? 1 : 0,
      pop: Math.round(st.pop),
      tr: Math.round(st.treasury * 100),
      stb: Math.round(st.stability * 1e4),
      army: Math.round(st.army),
      settle: st.settlements,
      ng: groupCount,
      def: Math.round(st.defense * 1e3),
      tax: Math.round(st.policy.tax * 1e3),
      mob: Math.round(st.policy.mobilization * 1e3),
      assim: Math.round(st.policy.assimilation * 1e3),
      tol: Math.round(st.policy.tolerance * 1e3),
      auto: Math.round(st.policy.autonomy * 1e3),
      goal: st.strategy?.goal ?? "",
      camp: st.campaign ? `${st.campaign.kind}:${st.campaign.stage}:${st.campaign.target}` : "",
      wars: st.warIds.join(",")
    };
    for (const k in st.techAdopted) o[pre("tech.", k)] = 1;
    for (const k in st.relations) o[pre("rel.", k)] = Math.round(st.relations[k] * 10);
    for (const k in st.sanctions) o[pre("sanct.", k)] = st.sanctions[k];
    o.res = Math.round((st.resilience ?? 0) * 1e3);
    if (st.magic) o.magic = Math.round((st.magic.power ?? 0) * 1e3);
    if (st.econ) {
      o.ind = Math.round((st.econ.industry ?? 0) * 10);
      o.trinc = Math.round((st.econ.tradeIncome ?? 0) * 100);
    }
    if (st.politics) {
      o.leg = Math.round(st.politics.legitimacy * 1e3);
      o.fat = Math.round(st.politics.fatigue * 1e3);
    }
    if (st.military) {
      o.milb = Math.round((st.milBonus ?? 0) * 1e3);
      o.doct = Object.keys(st.military.doctrine.taken).length;
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
      const st = g.settlementId ? civ3.settlements[g.settlementId]?.stage ?? "" : "", L = c.lastG.get(id);
      if (!dec2 && L && L.alive === 1 && L.cell === g.cell && L.st === (g.stateId ?? "") && L.sub === g.subsistence && L.stage === st) continue;
      const cur = { alive: 1, cell: g.cell, st: g.stateId ?? "", sub: g.subsistence, stage: st };
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
      const st = civ3.states[id];
      if (!st.alive && H.states[id] && c.lastS.get(id)?.alive === 0) continue;
      recordEntity(H, c, H.states, c.lastS, id, extractState(st, counts.get(id) ?? 0), t);
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
        const [cu, re, sp, sh] = part.split("|"), n = pop * (+sh / 1e3);
        out.total += n;
        out.culture[cu] = (out.culture[cu] ?? 0) + n;
        const r = re || "none";
        out.religion[r] = (out.religion[r] ?? 0) + n;
        out.species[sp] = (out.species[sp] ?? 0) + n;
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
    const D3 = civ3.decisions;
    for (; ix.decUpto < D3.length; ix.decUpto++) {
      const d = D3[ix.decUpto];
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
      evMonth = (ev) => ev.date.year * 12 + (ev.date.month - 1);
      idxCache = /* @__PURE__ */ new WeakMap();
      push = (m, k, v) => {
        const a = m.get(k);
        if (a) a.push(v);
        else m.set(k, [v]);
      };
      getEvent = (civ3, id) => {
        const ix = graphIndex(civ3), i = ix.pos.get(id);
        return i === void 0 ? null : civ3.events[i];
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
      const st = g.stateId ? civ3.states[g.stateId] : null, cap = st ? civ3.groups[st.capitalGroupId] : null, ref = dominant(cap && cap.cohorts.length ? cap : g);
      const assim = st ? st.policy.assimilation : 0;
      let changed = false;
      for (const c of g.cohorts) {
        if (!st && c === dominant(g)) continue;
        const { target, interest } = tensionTarget(c, ref, st);
        const was = c.tension;
        c.tension += (target + assim * 0.2 - c.tension) * 0.14;
        c.interest = interest;
        if (c.tension < 0.5) c.demandSpent = false;
        if (was < 0.7 && c.tension >= 0.7 && !c.demandSpent && (c.demandSpent = true)) makeEvent(civ3, ids, { kind: "demand_raised", title: `\u5C11\u6570\u306E\u4EBA\u3005\u304C\u300C${INTERESTS[interest] ?? "\u6539\u5584"}\u300D\u3092\u6C42\u3081\u308B`, participants: [{ entityId: g.id, role: "group" }, ...st ? [{ entityId: st.id, role: "state" }] : []], location: { cell: g.cell }, causes: [...asCauses(recentEventsFor(civ3, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), ...st ? asCauses(recentEventsFor(civ3, [st.id], ["war_ended", "leader_succession"], 36, 1), "contributed_to", "plausible") : []], effects: [{ targetId: g.id, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(c.tension * 100) / 100 }] });
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
      const st = g.settlementId ? civ3.settlements[g.settlementId] : null;
      if (!d.religionId && st && STAGE_OK.has(st.stage) && rng() < 2e-3) {
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
        const n = 2 + (rng() < 0.45 ? 1 : 0);
        let s = "";
        for (let i = 0; i < n; i++) s += SYL[Math.floor(rng() * SYL.length)];
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
        human: { id: "human", ja: "\u4EBA\u9593", lifespan: 960, growth: 1, techRate: 1, martial: 1, magic: 2e-3, env: [] },
        elf: { id: "elf", ja: "\u30A8\u30EB\u30D5", lifespan: 4800, growth: 0.55, techRate: 1.1, martial: 0.95, magic: 0.02, env: [BIOMES2.TEMPERATE_FOREST, BIOMES2.TAIGA, BIOMES2.RAINFOREST] },
        dwarf: { id: "dwarf", ja: "\u30C9\u30EF\u30FC\u30D5", lifespan: 2400, growth: 0.8, techRate: 1.12, martial: 1.15, magic: 4e-3, env: [BIOMES2.ALPINE, BIOMES2.COLD_DESERT, BIOMES2.TAIGA] },
        beastfolk: { id: "beastfolk", ja: "\u7363\u4EBA", lifespan: 600, growth: 1.05, techRate: 0.9, martial: 1.2, magic: 3e-3, env: [BIOMES2.SAVANNA, BIOMES2.GRASSLAND, BIOMES2.TROPICAL_SEASONAL] }
      });
      speciesOf = (id, civ3 = null) => civ3?.speciesDefs?.[id] ?? SPECIES[id] ?? SPECIES.human;
      lifeScale = (civ3, st) => {
        const g = civ3.groups[st.capitalGroupId];
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
    return { states: {}, cultures: {}, languages: {}, religions: {}, contacts: {}, techWorld: {}, wars: {}, treaties: {}, activeWarIds: [], activeTreatyIds: [], decisions: [], dict: { reasons: [] }, options: { aiInterval: 6 }, interpretations: [], works: [], interpCursor: 0, species: {}, persons: {}, magic: { orgs: {}, living: [] }, disasters: {}, climate: { index: 0, phase: "normal", since: 0 }, memory: {} };
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

  // js/core/civ/magic.js
  function supplyOf(civ3, st, groups) {
    if (st.policy.tolerance < 0.2) return { n: 0, power: 0, ids: [] };
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
      const st = g.stateId ? civ3.states[g.stateId] : null;
      if (rng() < 0.5) incident(ctx, g, p, ab, found);
      if (st && st.policy.tolerance < 0.35 && rng() < 0.4) {
        const was = d.tension;
        d.tension = Math.min(1, d.tension + 0.2);
        d.interest = "religious_freedom";
        makeEvent(civ3, ids, { kind: "magic_discrimination", title: `${ab.ja}\u306E\u7D20\u8CEA\u8005\u304C\u3001${st.name}\u3067\u8FEB\u5BB3\u3055\u308C\u305F`, participants: [{ entityId: pid, role: "victim" }, { entityId: st.id, role: "state" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "strong" }], effects: [{ targetId: gid, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(d.tension * 100) / 100 }] });
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
      const st = civ3.states[sid];
      if (!st.alive) continue;
      const sup = supplyOf(civ3, st, groups.get(sid) ?? []);
      let org = Object.values(civ3.magic.orgs).find((o) => o.stateId === sid && o.endedAt == null);
      if (!org && sup.n >= ORG_MIN) {
        const oid = ids.next("org"), kind = st.policy.tolerance < 0.4 ? "\u79D8\u5BC6\u7D50\u793E" : st.techAdopted.writing != null ? "\u5B66\u3073\u820E" : "\u8853\u8005\u306E\u96C6\u3044";
        org = civ3.magic.orgs[oid] = { id: oid, name: makeNameJa(rng) + (kind === "\u5B66\u3073\u820E" ? "\u306E\u5B66\u3073\u820E" : kind === "\u79D8\u5BC6\u7D50\u793E" ? "\u306E\u7D50\u793E" : "\u306E\u96C6\u3044"), kind, stateId: sid, foundedAt: mi, endedAt: null, members: sup.ids.slice() };
        for (const m of sup.ids) civ3.persons[m].orgId = oid;
        makeEvent(civ3, ids, { kind: "magic_org_founded", title: `${org.name}\uFF08${kind}\uFF09\u304C\u7D50\u3070\u308C\u305F`, participants: [{ entityId: oid, role: "organization" }, { entityId: sid, role: "state" }, ...sup.ids.slice(0, 3).map((m) => ({ entityId: m, role: "member" }))], location: null });
      } else if (org) {
        org.members = sup.ids.slice();
        for (const m of sup.ids) civ3.persons[m].orgId = org.id;
        if (!sup.n) org.endedAt = mi;
      }
      if (org && org.endedAt == null && st.stability < 0.4 && !st.magic && rng() < 0.15) {
        st.stability = Math.max(0, st.stability - 0.03);
        makeEvent(civ3, ids, { kind: "magic_power_struggle", title: `${org.name}\u304C\u653F\u6CBB\u3078\u306E\u767A\u8A00\u529B\u3092\u6C42\u3081\u305F`, participants: [{ entityId: org.id, role: "organization" }, { entityId: sid, role: "state" }], location: null, causes: asCauses(recentEventsFor(civ3, [sid], ["instability", "demand_raised"], 36, 1), "reaction_to", "plausible"), effects: [{ targetId: sid, property: "stability", before: null, after: Math.round(st.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutions(ctx) {
    const { civ: civ3, ids, rng } = ctx, groups = byState(ctx);
    for (const sid in civ3.states) {
      const st = civ3.states[sid];
      if (!st.alive || !st.magic) continue;
      const sup = supplyOf(civ3, st, groups.get(sid) ?? []);
      st.magic.power = Math.round(sup.power * 1e3) / 1e3;
      const risk = sup.ids.reduce((s, i) => s + ABILITIES[civ3.persons[i].ability].risk, 0) * 0.15 * (st.magic.kind === "military" ? 1.5 : 1);
      if (sup.n && rng() < Math.min(0.2, risk)) {
        const b = st.stability;
        st.stability = Math.max(0, st.stability - 0.05);
        const victim = civ3.persons[sup.ids[Math.floor(rng() * sup.ids.length)]];
        if (victim.power > 0.6) kill(civ3, victim, civ3.monthIndex);
        makeEvent(civ3, ids, { kind: "magic_backlash", title: `${st.name}\u306E${INSTITUTIONS[st.magic.kind].ja}\u3067\u9B54\u8853\u304C\u66B4\u767A\u3057\u305F`, participants: [{ entityId: sid, role: "state" }, { entityId: victim.id, role: "gifted" }], location: null, effects: [{ targetId: sid, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(st.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutionCandidates(ctx, st, e, cand3, bad3) {
    if (st.magic) return [bad3("magic_institution", "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B")];
    const sup = supplyOf(ctx.civ, st, e.gs);
    if (sup.n < CAPS.minPersons) return [bad3("magic_institution", `\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044\uFF08${CAPS.minPersons}\u4EBA\u4EE5\u4E0A\u3002\u73FE\u5728${sup.n}\u4EBA\uFF09`)];
    if (st.techAdopted.writing == null && st.techAdopted.administration == null) return [bad3("magic_institution", "\u6587\u5B57\u304B\u884C\u653F\u306E\u6280\u8853\u304C\u5FC5\u8981")];
    if (st.treasury < CAPS.instCost) return [bad3("magic_institution", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
    return Object.keys(INSTITUTIONS).map((k) => cand3("magic_institution", k === "academy" ? { tech: 0.5, prestige: 0.2 } : k === "military" ? { security: 0.45, expansion: 0.25, stability: -0.1 } : { stability: 0.4, culture: 0.3 }, { opt: k, label: INSTITUTIONS[k].ja }));
  }
  function institutionExecute(ctx, st, c) {
    const k = c.opt;
    if (!INSTITUTIONS[k]) return { ok: false, error: "\u672A\u77E5\u306E\u5236\u5EA6" };
    if (st.magic) return { ok: false, error: "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B" };
    const sup = supplyOf(ctx.civ, st, byState(ctx).get(st.id) ?? []);
    if (sup.n < CAPS.minPersons) return { ok: false, error: "\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044" };
    if (st.treasury < CAPS.instCost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
    st.treasury -= CAPS.instCost;
    const org = Object.values(ctx.civ.magic.orgs).find((o) => o.stateId === st.id && o.endedAt == null);
    st.magic = { kind: k, foundedAt: ctx.civ.monthIndex, orgId: org?.id ?? null, power: Math.round(sup.power * 1e3) / 1e3 };
    return { ok: true, effects: [{ targetId: st.id, property: "magic.institution", before: null, after: k }], title: `${INSTITUTIONS[k].ja}\u3092\u5275\u8A2D`, targetId: org?.id ?? null };
  }
  var ABILITIES, INSTITUTIONS, CAPS, BASE_RATE, ORG_MIN, living, kill, pickAbility, magicTech;
  var init_magic = __esm({
    "js/core/civ/magic.js"() {
      init_events();
      init_culture();
      init_species();
      init_cohorts();
      init_spatial();
      init_civ_state();
      init_graph();
      ABILITIES = Object.freeze({
        healing: { id: "healing", ja: "\u7652\u3057", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.01, weight: 3 },
        flame: { id: "flame", ja: "\u708E\u8853", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.05, weight: 2 },
        ward: { id: "ward", ja: "\u7D50\u754C", cost: "\u8853\u8005\u306E\u96C6\u4E2D\uFF08\u9577\u6642\u9593\uFF09", risk: 0.015, weight: 2 },
        farsight: { id: "farsight", ja: "\u9060\u898B", cost: "\u8853\u8005\u306E\u6B63\u6C17", risk: 0.03, weight: 2 },
        beastbond: { id: "beastbond", ja: "\u7363\u4F7F\u3044", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.02, weight: 1.5 },
        storm: { id: "storm", ja: "\u5929\u5019\u306E\u64CD\u4F5C", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.07, weight: 1 }
      });
      INSTITUTIONS = Object.freeze({ academy: { ja: "\u9B54\u8853\u5B66\u9662", effect: "\u6280\u8853\u306E\u9032\u6357 \u6700\u5927+10%" }, military: { ja: "\u9B54\u5C0E\u5175\u56E3", effect: "\u8ECD\u4E8B\u529B \u6700\u5927+15%" }, temple: { ja: "\u795E\u6BBF", effect: "\u5B89\u5B9A\u5EA6\u306E\u76EE\u6A19 \u6700\u5927+0.04" } });
      CAPS = Object.freeze({ mil: 0.15, tech: 0.1, stab: 0.04, supplyFull: 6, instCost: 60, minPersons: 2 });
      BASE_RATE = 12e-10;
      ORG_MIN = 3;
      living = (civ3) => {
        var _a;
        return (_a = civ3.magic).living ?? (_a.living = Object.keys(civ3.persons).filter((i) => civ3.persons[i].diedAt == null));
      };
      kill = (civ3, p, mi) => {
        p.diedAt = mi;
        civ3.magic.living = living(civ3).filter((i) => i !== p.id);
      };
      pickAbility = (rng) => {
        const l = Object.values(ABILITIES), t = l.reduce((s, a) => s + a.weight, 0);
        let r = rng() * t;
        for (const a of l) {
          r -= a.weight;
          if (r <= 0) return a;
        }
        return l[0];
      };
      magicTech = (st) => st.magic?.kind === "academy" ? CAPS.tech * st.magic.power : 0;
    }
  });

  // js/core/civ/tech.js
  var tech_exports = {};
  __export(tech_exports, {
    TECH: () => TECH,
    TECHS: () => TECHS,
    adoptable: () => adoptable,
    available: () => available,
    refreshCand: () => refreshCand,
    stepTech: () => stepTech
  });
  function stepTech(ctx) {
    var _a, _b;
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    for (const id in civ3.groups) {
      const g = civ3.groups[id], k = g.tech.known, d = dominant(g);
      const rate = (0.6 + 0.4 * Math.log10(Math.max(10, g.pop)) / 3) * (g.settlementId ? 1.3 : 1) * (g.stateId ? 1.2 : 1) * speciesOf(g.speciesId, civ3).techRate * (g.stateId && civ3.states[g.stateId] ? (1 + magicTech(civ3.states[g.stateId])) * (1 + (civ3.states[g.stateId].econ?.techBoost ?? 0)) : 1);
      if (!g.tech.cand) refreshCand(g);
      for (const key of [...g.tech.cand]) {
        const t = TECH[key];
        if (g.pop < t.minPop || t.settled && !g.settlementId || t.cond && !t.cond(world, g)) continue;
        const cost = t.cost * (g.tech.lost[t.key] ? REDISCOVER : 1), p = (g.tech.prog[t.key] ?? 0) + rate;
        if (p < cost) {
          g.tech.prog[t.key] = p;
          continue;
        }
        const rediscovered = !!g.tech.lost[t.key], prior = civ3.techWorld[t.key];
        learn(g, t.key, mi);
        delete g.tech.lost[t.key];
        const ev = makeEvent(civ3, ids, { kind: rediscovered ? "tech_rediscovered" : "tech_discovered", title: `${t.name}\u3092${rediscovered ? "\u518D\u767A\u898B" : prior ? "\u72EC\u81EA\u306B\u767A\u898B" : "\u521D\u3081\u3066\u767A\u898B"}`, participants: [{ entityId: g.id, role: "discoverer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
        ((_a = civ3.techWorld)[_b = t.key] ?? (_a[_b] = { discoveries: [] })).discoveries.push({ eventId: ev.eventId, groupId: g.id, month: mi, independent: !!prior });
      }
      if (rng() < 0.03) {
        const ns = [...neighborGroups(ctx, g)];
        if (ns.length) {
          const o = civ3.groups[ns[Math.floor(rng() * ns.length)]], cand3 = TECHS.filter((t) => o.tech.known[t.key] != null && k[t.key] == null && t.prereq.every((p) => k[p] != null) && g.pop >= t.minPop && (!t.settled || g.settlementId) && (t.key !== "seafaring" || world.cell.coastDist[g.cell] <= 1));
          if (cand3.length) {
            const t = cand3[Math.floor(rng() * cand3.length)], same = (dominant(o).cultureId === d.cultureId ? 0.15 : 0) + (o.stateId && o.stateId === g.stateId ? 0.2 : 0);
            if (rng() < 0.25 + same) {
              learn(g, t.key, mi);
              const wasLost = !!g.tech.lost[t.key];
              delete g.tech.lost[t.key];
              makeEvent(civ3, ids, { kind: "tech_transferred", title: `${t.name}\u304C\u4F1D\u308F\u3063\u305F${wasLost ? "\uFF08\u5931\u308F\u308C\u3066\u3044\u305F\u77E5\u8B58\u306E\u56DE\u5FA9\uFF09" : ""}`, participants: [{ entityId: g.id, role: "receiver" }, { entityId: o.id, role: "source" }], location: { cell: g.cell }, causes: asCauses(recentEventsFor(civ3, [o.id], ["tech_discovered", "tech_rediscovered", "tech_transferred"], 1e9, 12).filter((e) => e.effects.some((x) => x.property === `tech.${t.key}`)).slice(0, 1), "enabled_by", "strong"), effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
            }
          }
        }
      }
      if (rng() < 1e-3) {
        for (const t of TECHS) if (k[t.key] != null && t.minPop > 0 && g.pop < t.minPop * 0.5) {
          const dependants = TECHS.some((u) => k[u.key] != null && u.prereq.includes(t.key) && u.tier >= t.tier);
          if (dependants) continue;
          forget(g, t.key);
          makeEvent(civ3, ids, { kind: "tech_lost", title: `${t.name}\u306E\u77E5\u8B58\u304C\u5931\u308F\u308C\u305F`, participants: [{ entityId: g.id, role: "holder" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: mi, after: null }] });
          break;
        }
      }
    }
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
  var T, nearWater, TECHS, TECH, BASE_KNOWLEDGE, REDISCOVER, refreshCand, learn, forget, available;
  var init_tech = __esm({
    "js/core/civ/tech.js"() {
      init_events();
      init_cohorts();
      init_spatial();
      init_world_consts();
      init_graph();
      init_species();
      init_magic();
      T = (key, name, field, cost, prereq = [], extra = {}) => ({ key, name, field, cost, prereq, minPop: extra.minPop ?? 0, settled: !!extra.settled, cond: extra.cond ?? null, tier: cost < 600 ? 1 : cost < 1500 ? 2 : cost < 3e3 ? 3 : cost < 6e3 ? 4 : 5 });
      nearWater = (w, g) => w.cell.coastDist[g.cell] <= 2 || w.cell.river[g.cell];
      TECHS = Object.freeze([
        T("stone_tools", "\u77F3\u5668", "\u9053\u5177", 0),
        // 最初から持つ
        T("agriculture", "\u8FB2\u8015", "\u8FB2\u696D", 360, ["stone_tools"], { cond: (w, g) => w.cell.fertility[g.cell] > 0.45 && nearWater(w, g) && g.pressure > 0.6 }),
        T("pastoralism", "\u7267\u755C", "\u7267\u755C", 480, ["stone_tools"], { cond: (w, g) => (w.cell.biome[g.cell] === BIOMES2.GRASSLAND || w.cell.biome[g.cell] === BIOMES2.SAVANNA) && g.pressure > 0.7 }),
        T("seafaring", "\u822A\u6D77", "\u822A\u6D77", 480, ["stone_tools"], { minPop: 300, cond: (w, g) => w.cell.coastDist[g.cell] <= 1 }),
        T("pottery", "\u571F\u5668", "\u9053\u5177", 300, ["stone_tools"]),
        T("weaving", "\u7E54\u7269", "\u9053\u5177", 420, ["stone_tools"]),
        T("herbalism", "\u85AC\u8349", "\u533B\u7642", 600, ["stone_tools"]),
        T("construction", "\u5EFA\u7BC9", "\u9053\u5177", 800, ["stone_tools"], { minPop: 300 }),
        T("irrigation", "\u704C\u6F11", "\u8FB2\u696D", 900, ["agriculture", "construction"], { settled: true }),
        T("plow", "\u7282", "\u8FB2\u696D", 1500, ["irrigation"], { settled: true }),
        T("crop_rotation", "\u8F2A\u4F5C", "\u8FB2\u696D", 2400, ["plow"], { settled: true }),
        T("horse_riding", "\u9A0E\u4E57", "\u7267\u755C", 1200, ["pastoralism"]),
        T("bronze", "\u9752\u9285", "\u91D1\u5C5E", 1200, ["construction", "pottery"], { minPop: 400 }),
        T("iron", "\u9244", "\u91D1\u5C5E", 1800, ["bronze"], { minPop: 800 }),
        T("steel", "\u92FC", "\u91D1\u5C5E", 3e3, ["iron"], { minPop: 2e3 }),
        T("record_keeping", "\u8A18\u9332", "\u6587\u5B57", 900, ["pottery"], { minPop: 800, settled: true }),
        T("writing", "\u6587\u5B57", "\u6587\u5B57", 1500, ["record_keeping"], { minPop: 1e3, settled: true }),
        T("papermaking", "\u7D19", "\u6587\u5B57", 2400, ["writing"], { minPop: 3e3 }),
        T("printing", "\u5370\u5237", "\u6587\u5B57", 3e3, ["papermaking"], { minPop: 5e3 }),
        T("calendar", "\u66A6", "\u6E2C\u91CF", 1e3, ["record_keeping"], { settled: true }),
        T("mathematics", "\u6570\u5B66", "\u6E2C\u91CF", 1800, ["writing"]),
        T("astronomy", "\u5929\u6587", "\u6E2C\u91CF", 2400, ["calendar", "mathematics"]),
        T("shipbuilding", "\u9020\u8239", "\u822A\u6D77", 1500, ["seafaring", "construction"]),
        T("navigation", "\u822A\u6CD5", "\u822A\u6D77", 2400, ["astronomy", "shipbuilding"]),
        T("administration", "\u884C\u653F", "\u7D71\u6CBB", 1800, ["writing"], { minPop: 1500 }),
        T("law", "\u6CD5", "\u7D71\u6CBB", 2400, ["administration"]),
        T("bureaucracy", "\u5B98\u50DA\u5236", "\u7D71\u6CBB", 3600, ["law"], { minPop: 8e3 }),
        T("coinage", "\u8CA8\u5E63", "\u7D4C\u6E08", 1800, ["bronze", "administration"]),
        T("banking", "\u91D1\u878D", "\u7D4C\u6E08", 3600, ["coinage", "mathematics"], { minPop: 8e3 }),
        T("medicine", "\u533B\u5B66", "\u533B\u7642", 2400, ["herbalism", "writing"]),
        T("sanitation", "\u885B\u751F", "\u533B\u7642", 3600, ["medicine", "construction"], { minPop: 5e3 }),
        T("bronze_weapons", "\u9752\u9285\u6B66\u5668", "\u8ECD\u4E8B", 900, ["bronze"]),
        T("iron_weapons", "\u9244\u6B66\u5668", "\u8ECD\u4E8B", 1800, ["iron", "bronze_weapons"]),
        T("fortification", "\u57CE\u58C1", "\u8ECD\u4E8B", 1200, ["construction"], { minPop: 500 }),
        T("cavalry", "\u9A0E\u5175", "\u8ECD\u4E8B", 1800, ["horse_riding", "bronze_weapons"]),
        T("gunpowder", "\u706B\u85AC", "\u8ECD\u4E8B", 4800, ["steel", "mathematics"], { minPop: 8e3 }),
        T("industry", "\u6A5F\u68B0\u5DE5\u696D", "\u7523\u696D", 7200, ["steel", "mathematics", "banking"], { minPop: 2e4 }),
        T("electricity", "\u96FB\u6C17", "\u30A8\u30CD\u30EB\u30AE\u30FC", 9600, ["industry"], { minPop: 4e4 }),
        T("nuclear", "\u6838", "\u30A8\u30CD\u30EB\u30AE\u30FC", 18e3, ["electricity", "mathematics"], { minPop: 1e5 })
      ]);
      TECH = Object.freeze(Object.fromEntries(TECHS.map((t) => [t.key, t])));
      BASE_KNOWLEDGE = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
      REDISCOVER = 0.3;
      refreshCand = (g) => g.tech.cand = TECHS.filter((t) => g.tech.known[t.key] == null && t.prereq.every((p) => g.tech.known[p] != null)).map((t) => t.key);
      learn = (g, key, mi) => {
        g.tech.known[key] = mi;
        refreshCand(g);
        delete g.tech.prog[key];
        if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 1;
      };
      forget = (g, key) => {
        delete g.tech.known[key];
        refreshCand(g);
        g.tech.lost[key] = true;
        if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 0;
      };
      available = (w, g, t) => g.tech.known[t.key] == null && t.prereq.every((p) => g.tech.known[p] != null) && g.pop >= t.minPop && (!t.settled || g.settlementId) && (!t.cond || t.cond(w, g));
    }
  });

  // js/core/world/sphere-mesh.js
  var MESH_VERSION = "sphere-ico-1";
  var cellCountForFrequency = (n) => 10 * n * n + 2;
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
  function buildSphereMesh(n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("\u5468\u6CE2\u6570 n \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570");
    const { verts: bv, faces } = baseIcosahedron();
    const V = cellCountForFrequency(n), T3 = 20 * n * n;
    const centerXYZ = new Float32Array(3 * V);
    for (let i = 0; i < 12; i++) {
      centerXYZ[3 * i] = bv[i][0];
      centerXYZ[3 * i + 1] = bv[i][1];
      centerXYZ[3 * i + 2] = bv[i][2];
    }
    const edgeBase = /* @__PURE__ */ new Map();
    let nextEdge = 12;
    const interiorPerFace = (n - 1) * (n - 2) / 2, faceBase0 = 12 + 30 * (n - 1);
    const rowStart = new Int32Array(n + 1);
    for (let i = 1, acc = 0; i <= n - 2; i++) {
      rowStart[i] = acc;
      acc += n - 1 - i;
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
    const gid = new Int32Array((n + 1) * (n + 1));
    for (let f = 0; f < 20; f++) {
      const [fa, fb, fc] = faces[f], A2 = bv[fa], B = bv[fb], C = bv[fc], ids = [fa, fb, fc];
      for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
        const k = n - i - j, w = [k, i, j];
        let id;
        const zeros = (k === 0 ? 1 : 0) + (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0);
        if (zeros === 2) id = ids[k === n ? 0 : i === n ? 1 : 2];
        else if (zeros === 1) {
          const slots = [0, 1, 2].filter((s) => w[s] > 0), u = ids[slots[0]], v = ids[slots[1]];
          const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 12 + hi;
          let base = edgeBase.get(key);
          if (base === void 0) {
            base = nextEdge;
            nextEdge += n - 1;
            edgeBase.set(key, base);
          }
          const wLo = u === lo ? w[slots[0]] : w[slots[1]];
          id = base + (wLo - 1);
          if (!(centerXYZ[3 * id] || centerXYZ[3 * id + 1] || centerXYZ[3 * id + 2])) place(id, A2, B, C, k, i, j);
        } else {
          id = faceBase0 + f * interiorPerFace + rowStart[i] + (j - 1);
          place(id, A2, B, C, k, i, j);
        }
        gid[i * (n + 1) + j] = id;
      }
      for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
        const p = gid[i * (n + 1) + j], q2 = gid[(i + 1) * (n + 1) + j], r = gid[i * (n + 1) + j + 1];
        tri[tp++] = p;
        tri[tp++] = q2;
        tri[tp++] = r;
        if (i + j < n - 1) {
          const s = gid[(i + 1) * (n + 1) + j + 1];
          tri[tp++] = q2;
          tri[tp++] = s;
          tri[tp++] = r;
        }
      }
    }
    if (tp !== 3 * T3) throw new Error(`\u4E09\u89D2\u5F62\u306E\u6570\u304C\u5408\u308F\u306A\u3044: ${tp / 3} != ${T3}`);
    {
      const a = tri[0] * 3, b = tri[1] * 3, c = tri[2] * 3, P = [centerXYZ[a], centerXYZ[a + 1], centerXYZ[a + 2]];
      const Q = [centerXYZ[b], centerXYZ[b + 1], centerXYZ[b + 2]], R = [centerXYZ[c], centerXYZ[c + 1], centerXYZ[c + 2]];
      if (dot(cross(sub(Q, P), sub(R, P)), P) < 0) for (let t = 0; t < T3; t++) {
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
    return { meshVersion: MESH_VERSION, n, cellCount: V, triangleCount: T3, centerXYZ, neighborOffsets: offs, neighborIds, vertexXYZ, cellVertexOffsets: offs, cellVertexIds };
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
    landFraction: 0.5,
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
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
    const c000 = hash3(seed, xi, yi, zi), c100 = hash3(seed, xi + 1, yi, zi), c010 = hash3(seed, xi, yi + 1, zi), c110 = hash3(seed, xi + 1, yi + 1, zi);
    const c001 = hash3(seed, xi, yi, zi + 1), c101 = hash3(seed, xi + 1, yi, zi + 1), c011 = hash3(seed, xi, yi + 1, zi + 1), c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx, x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
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
        const fx = fade(X - xi), fy = fade(Y - yi), fz = fade(Z - zi);
        const x00 = cv[b] + (cv[b + 1] - cv[b]) * fx, x10 = cv[b + 2] + (cv[b + 3] - cv[b + 2]) * fx, x01 = cv[b + 4] + (cv[b + 5] - cv[b + 4]) * fx, x11 = cv[b + 6] + (cv[b + 7] - cv[b + 6]) * fx;
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
      const n = this.n;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
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
    const n = frequencyForCells(spec.resolution.targetCells);
    const mesh = stage("G1_mesh", "\u7403\u9762\u30E1\u30C3\u30B7\u30E5", () => buildSphereMesh(n));
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
      const rp = makeRng(seed, "plates"), P = spec.plateCount, seeds = [], omega = [];
      for (let p = 0; p < P; p++) {
        seeds.push(rp.unitVec());
        const w = rp.unitVec(), sp = rp.range(0.4, 1.6);
        omega.push([w[0] * sp, w[1] * sp, w[2] * sp]);
      }
      for (let c = 0; c < V; c++) {
        let best = -2, bp = 0;
        for (let p = 0; p < P; p++) {
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
  function computeHydrology(h2, members = null) {
    const { mesh, elevation, isSea, precip, areaKm2, parent, filled, flow, basin, landWater, biome } = h2;
    const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, EPS = 0.05;
    const heap = new MinHeap(V + 16), done2 = new Uint8Array(V), order = new Int32Array(V);
    let on = 0;
    for (let c = 0; c < V; c++) {
      if (members && !members[c]) continue;
      filled[c] = elevation[c];
      parent[c] = -1;
      basin[c] = -1;
    }
    for (let c = 0; c < V; c++) {
      if (isSea[c]) {
        done2[c] = 1;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea[j] && (!members || members[j])) {
            heap.push(filled[c], c);
            break;
          }
        }
      } else if (members && !members[c]) done2[c] = 1;
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
      if (members && !members[c]) continue;
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
      if (members && !members[c]) continue;
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
  function biomeOf(T3, P, e) {
    if (e > 4500 || e > 3500 && T3 < 0) return BIOMES.ALPINE;
    if (T3 < -8) return BIOMES.ICE;
    if (T3 < 0) return BIOMES.TUNDRA;
    if (T3 < 5) return P > 300 ? BIOMES.TAIGA : BIOMES.COLD_DESERT;
    if (T3 < 18) return P < 200 ? BIOMES.COLD_DESERT : P < 600 ? BIOMES.GRASSLAND : P > 2600 ? BIOMES.WETLAND : BIOMES.TEMPERATE_FOREST;
    if (P < 250) return BIOMES.HOT_DESERT;
    if (P < 900) return BIOMES.SAVANNA;
    if (P < 1800) return BIOMES.TROPICAL_SEASONAL;
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
    const { year, month } = split(mi), shown = year + cal.yearOffset, before = shown < 0, n = before ? -shown : shown;
    const era = before ? cal.beforeName : cal.epochName, name = cal.monthNames ? cal.monthNames[month - 1] : String(month);
    return cal.format.replace("{era}", era).replace("{year}", String(n)).replace("{month}", name).replace("{monthNum}", String(month));
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
  init_species();
  var WCDE_VERSION = "6.0.0-m5";
  var CONFIG_SCHEMA = 1;
  var DEFAULT_LAWS = Object.freeze({ disasterRate: 1, climateVolatility: 1, fertilityScale: 1 });
  var DEFAULT_MAGIC = Object.freeze({ enabled: false, rate: 1, name: "\u9B54\u6CD5" });
  var PREHISTORY_YEARS = 5e5;
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
  function normalizeSpecies(list, errors) {
    const out = [], seen = new Set(Object.keys(SPECIES));
    if (list === void 0) return out;
    if (!Array.isArray(list)) {
      errors.push("species \u306F\u914D\u5217");
      return out;
    }
    for (const [i, s] of list.entries()) {
      const p = `species[${i}]`;
      if (!isObj2(s)) {
        errors.push(`${p} \u306F\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8`);
        continue;
      }
      if (typeof s.id !== "string" || !/^[a-z][a-z0-9_]{1,23}$/.test(s.id)) {
        errors.push(`${p}.id \u306F\u82F1\u5C0F\u6587\u5B57\u3067\u59CB\u307E\u308B 2\u301C24 \u6587\u5B57\uFF08\u82F1\u6570\u5B57\u3068 _\uFF09`);
        continue;
      }
      if (seen.has(s.id)) {
        errors.push(`${p}.id\u300C${s.id}\u300D\u306F\u91CD\u8907\u3057\u3066\u3044\u307E\u3059\uFF08\u7D44\u307F\u8FBC\u307F\u306E\u4EBA\u9593\u30FB\u30A8\u30EB\u30D5\u30FB\u30C9\u30EF\u30FC\u30D5\u30FB\u7363\u4EBA\u3068\u91CD\u306A\u3089\u306A\u3044\u540D\u524D\u306B\uFF09`);
        continue;
      }
      seen.add(s.id);
      if (typeof s.ja !== "string" || !s.ja.trim()) {
        errors.push(`${p}.ja\uFF08\u8868\u793A\u540D\uFF09\u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217`);
        continue;
      }
      const env = s.env ?? [], envIds = [];
      if (!Array.isArray(env) || !env.length) {
        errors.push(`${p}.env\uFF08\u597D\u3080\u751F\u614B\u7CFB\uFF09\u306F1\u3064\u4EE5\u4E0A`);
        continue;
      }
      for (const b of env) {
        if (!(b in BIOMES2) || BIOMES2[b] === BIOMES2.OCEAN) {
          errors.push(`${p}.env \u306B\u672A\u77E5\u30FB\u4E0D\u53EF\u306E\u751F\u614B\u7CFB\u300C${b}\u300D\uFF08\u4F7F\u3048\u308B\u5024: ${BIOME_KEYS.filter((k) => k !== "OCEAN").join(", ")}\uFF09`);
          continue;
        }
        envIds.push(BIOMES2[b]);
      }
      if (envIds.length !== env.length) continue;
      out.push({
        id: s.id,
        ja: s.ja.trim(),
        env: envIds,
        envKeys: [...env],
        lifespan: num(errors, `${p}.lifespan\uFF08\u6708\uFF09`, s.lifespan, 960, 120, 12e4),
        growth: num(errors, `${p}.growth`, s.growth, 1, 0.1, 3),
        techRate: num(errors, `${p}.techRate`, s.techRate, 1, 0.3, 2.5),
        martial: num(errors, `${p}.martial`, s.martial, 1, 0.3, 2.5),
        magic: num(errors, `${p}.magic`, s.magic, 2e-3, 0, 0.1)
      });
    }
    return out;
  }
  function normalizeWorldConfig(input = {}) {
    const errors = [], i = isObj2(input) ? input : {};
    const name = typeof i.name === "string" && i.name.trim() ? i.name.trim() : "\u540D\u3082\u306A\u304D\u4E16\u754C";
    const sp = normalizeWorldSpec({ ...i.spec ?? {}, worldSeed: i.worldSeed ?? i.spec?.worldSeed });
    errors.push(...sp.errors);
    const laws = { disasterRate: num(errors, "laws.disasterRate", i.laws?.disasterRate, DEFAULT_LAWS.disasterRate, 0, 3), climateVolatility: num(errors, "laws.climateVolatility", i.laws?.climateVolatility, DEFAULT_LAWS.climateVolatility, 0, 3), fertilityScale: num(errors, "laws.fertilityScale", i.laws?.fertilityScale, DEFAULT_LAWS.fertilityScale, 0.3, 2) };
    const magic = { enabled: i.magic?.enabled === void 0 ? DEFAULT_MAGIC.enabled : i.magic.enabled === true, rate: num(errors, "magic.rate", i.magic?.rate, DEFAULT_MAGIC.rate, 0, 5), name: typeof i.magic?.name === "string" && i.magic.name.trim() ? i.magic.name.trim() : DEFAULT_MAGIC.name };
    if (i.magic?.enabled !== void 0 && typeof i.magic.enabled !== "boolean") errors.push("magic.enabled \u306F\u771F\u507D\u5024");
    const species = normalizeSpecies(i.species, errors);
    const cal = normalizeCalendar(i.calendar);
    errors.push(...cal.errors);
    const prehistoryYears = num(errors, "prehistory.years", i.prehistory?.years, PREHISTORY_YEARS, 2e4, 2e6);
    const config = { schema: CONFIG_SCHEMA, name, worldSeed: sp.spec.worldSeed, spec: sp.spec, laws, species, magic, calendar: cal.calendar, prehistory: { years: prehistoryYears }, detail: i.detail === "light" || i.detail === "fine" ? i.detail : "standard" };
    return { config, errors };
  }
  function derivedSeeds(config) {
    return { geography: config.worldSeed, prehistory: hashSeed(config.worldSeed, "prehistory", config.schema, config.prehistory.years, JSON.stringify(config.species.map((s) => s.id)), config.magic.enabled), species: hashSeed(config.worldSeed, "species") };
  }
  var speciesDefsOf = (config) => Object.fromEntries(config.species.map((s) => [s.id, { id: s.id, ja: s.ja, lifespan: s.lifespan, growth: s.growth, techRate: s.techRate, martial: s.martial, magic: s.magic, env: s.env }]));

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
  var densityMult = (g) => {
    const k = g.tech.known;
    return 1 + (k.irrigation != null ? 0.15 : 0) + (k.plow != null ? 0.2 : 0) + (k.crop_rotation != null ? 0.25 : 0) + (k.sanitation != null ? 0.1 : 0);
  };
  var milMult = (state) => {
    const a = state.techAdopted;
    return (state.martial ?? 1) * (1 + (a.bronze_weapons != null ? 0.2 : 0) + (a.iron_weapons != null ? 0.35 : 0) + (a.cavalry != null ? 0.3 : 0) + (a.fortification != null ? 0.1 : 0) + (a.gunpowder != null ? 0.8 : 0) + (state.magic?.kind === "military" ? 0.15 * state.magic.power : 0)) * (1 + (state.milBonus ?? 0));
  };
  var taxMult = (state) => {
    const a = state.techAdopted;
    return 1 + (a.administration != null ? 0.25 : 0) + (a.coinage != null ? 0.2 : 0) + (a.bureaucracy != null ? 0.3 : 0) + (a.banking != null ? 0.25 : 0);
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
    const N = world.mesh.cellCount;
    t = { move: new Float32Array(N).fill(-1) };
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
  var cellCapacity = (world, c, subsistence, knowledge) => cellDensity(world, c, subsistence, knowledge) * Math.min(world.cell.areaKm2[c], budgetKm2(subsistence));
  function territoryOf(world, c) {
    const m = world.mesh, out = [c];
    let area = world.cell.areaKm2[c];
    for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1] && area < POP.territoryKm2; k++) {
      const n = m.neighborIds[k];
      if (world.cell.landWater[n] === LAND_WATER2.LAND) {
        out.push(n);
        area += world.cell.areaKm2[n];
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
    let k = 0, left = budgetKm2(g.subsistence);
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
      const d0 = hd[0], c0 = hc[0], ld = hd.pop(), lc = hc.pop(), n = hd.length;
      if (n) {
        let i = 0;
        for (; ; ) {
          let k = 2 * i + 1;
          if (k >= n) break;
          if (k + 1 < n && hd[k + 1] < hd[k]) k++;
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
        const n = m.neighborIds[k], s = stepCost(world, n, seafaring);
        if (s == null) continue;
        const nd = d + s;
        if (nd <= budget && nd < (dist.get(n) ?? Infinity)) {
          dist.set(n, nd);
          push2(nd, n);
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
      const K = Math.max(1, groupCapacity(world, g, occ) * (g.capUntil > mi ? g.capMult : 1)), pressure = g.pop / K, gm = (ctx.growthMult ? ctx.growthMult(g.cell) : 1) * (ctx.stateMult ? ctx.stateMult(g) : 1) * speciesOf(g.speciesId, civ3).growth * (civ3.options.growthScale ?? 1);
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
      const st = g.settlementId ? civ3.settlements[g.settlementId] : null;
      if (st) {
        st.pop = Math.round(g.pop * POP.settledShare);
        const ns = stageOf(st.pop);
        if (ns !== st.stage) {
          const old = st.stage;
          st.stage = ns;
          makeEvent(civ3, ids, { kind: "settlement_stage", title: `${STAGE_JA[old]}\u304B\u3089${STAGE_JA[ns]}\u3078`, participants: [{ entityId: st.id, role: "settlement" }], location: { cell: st.cell }, causes: asCauses(recentEventsFor(civ3, [g.id], ["disaster_struck", "famine"], 24, 1), "contributed_to", "plausible") });
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
  init_species();
  init_world_consts();
  var PREHISTORY_STEP_YEARS = 2500;
  var TECH_CEILING = 900;
  var LEARN_EVERY = 4;
  var INNOVATION = 19e-5;
  var POP_REF = 15e4;
  var PRE_COST = Object.freeze({ seafaring: 0.12, pottery: 0.6, weaving: 0.8, herbalism: 0.5, construction: 0.9, agriculture: 5.1, pastoralism: 3.9 });
  var LOCAL_SCALE = 0.4;
  var SPREAD_P = 0.6;
  var SPREAD_HOPS = 12;
  var shapeAt = (f) => 0.1 + 4.5 * f * f * f;
  var EPOCHS = 20;
  var DEG = Math.PI / 180;
  function createWcdeCiv(world, config, { historySeed = null } = {}) {
    const seeds = derivedSeeds(config), start2 = -Math.round(config.prehistory.years);
    const civ3 = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(config.worldSeed, "history"), seq: {}, date: fromMonthIndex(monthIndex(start2, 1)), monthIndex: monthIndex(start2, 1), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
    civ3.options = { aiInterval: 6, wcde: true, magic: config.magic.enabled, magicRate: config.magic.rate, growthScale: config.laws.fertilityScale, disasterRate: config.laws.disasterRate, climateVolatility: config.laws.climateVolatility };
    civ3.speciesDefs = speciesDefsOf(config);
    civ3.wcde = { v: 1, phase: "prehistory", config, seeds, startMonth: civ3.monthIndex, prehistory: null, candidates: [], control: { stateId: null }, cmdIds: [], diagnostics: [], edits: [] };
    return civ3;
  }
  var clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;
  var glacialAt = (frac, years, phase, vol) => vol <= 0 ? 0 : clamp2(vol, 0, 3) / 3 * Math.max(0, Math.sin(frac * years / 1e5 * 2 * Math.PI + phase)) ** 2;
  var iceMult = (lat, ice) => 1 - ice * 0.65 * clamp2((Math.abs(lat) / DEG - 35) / 35, 0, 1);
  function landComponents(world, landCells) {
    const m = world.mesh, comp = new Int32Array(m.cellCount).fill(-1), sizes = [];
    for (const s of landCells) {
      if (comp[s] >= 0) continue;
      const id = sizes.length, q2 = [s];
      comp[s] = id;
      let n = 0;
      while (q2.length) {
        const c = q2.pop();
        n++;
        for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
          const o = m.neighborIds[k];
          if (comp[o] < 0 && world.cell.landWater[o] === LAND_WATER2.LAND) {
            comp[o] = id;
            q2.push(o);
          }
        }
      }
      sizes.push(n);
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
        const n = (occ.get(c) ?? 1) - 1;
        if (n <= 0) {
          occ.delete(c);
          home.delete(c);
        } else {
          occ.set(c, n);
          if (home.get(c) === g.id) home.delete(c);
        }
      }
    };
    const ce = world.cell, N = world.mesh.cellCount;
    const envFit = (sp, b) => !sp.env?.length ? 1 : sp.env.includes(b) ? 1 : 0.3;
    const speciesIn = (id) => speciesOf(id, civ3);
    const note3 = (kind, title, parts, g, causes = []) => makeEvent(civ3, ids, { kind, title, participants: parts, location: g ? { cell: g.cell } : null, causes, provenance: "simulation" });
    const KB = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
    let pending = [];
    const learn2 = (g, key, mi, independent) => {
      var _a;
      const t = TECH[key];
      g.tech.known[key] = mi;
      delete g.tech.prog[key];
      refreshCand(g);
      if (KB[key]) g.knowledge[KB[key]] = 1;
      const prior = civ3.techWorld[key];
      (_a = civ3.techWorld)[key] ?? (_a[key] = { discoveries: [] });
      let evId = null;
      if (!prior) {
        stats.firstTech[key] = mi;
        evId = note3("tech_discovered", `${t.name}\u3092\u521D\u3081\u3066\u767A\u898B`, [{ entityId: g.id, role: "discoverer" }], g).eventId;
      }
      if (independent) civ3.techWorld[key].discoveries.push({ eventId: evId, groupId: g.id, month: mi, independent: !!prior });
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
    for (let c = 0; c < N; c++) if (ce.landWater[c] === LAND_WATER2.LAND) landCells.push(c);
    if (!landCells.length) throw new Error("\u9678\u5730\u304C\u306A\u3044\u4E16\u754C\u3067\u306F\u5148\u53F2\u3092\u9032\u3081\u3089\u308C\u307E\u305B\u3093");
    const score = (c, sp) => {
      const b = ce.biome[c], base = ce.fertility[c] * 0.6 + (ce.coastDist[c] <= 3 || ce.river[c] ? 0.3 : 0) + Math.min(1, (ce.capacity[c] ?? 0) / (ce.areaKm2[c] || 1)) * 0.4;
      return base * envFit(sp, b);
    };
    const { comp, sizes } = landComponents(world, landCells), bigMin = Math.min(Math.max(...sizes), Math.max(20, landCells.length * 0.1));
    const human = SPECIES.human, hcands = landCells.filter((c) => sizes[comp[c]] >= bigMin && Math.abs(ce.lat[c]) < 35 * DEG && [BIOMES2.SAVANNA, BIOMES2.TROPICAL_SEASONAL, BIOMES2.GRASSLAND, BIOMES2.TEMPERATE_FOREST].includes(ce.biome[c])).sort((a, b) => score(b, human) - score(a, human) || a - b);
    const pool = (hcands.length ? hcands : landCells.filter((c) => sizes[comp[c]] >= bigMin).sort((a, b) => score(b, human) - score(a, human) || a - b)).slice(0, 10), origin = pool[Math.floor(ctxRng() * pool.length)];
    civ3.monthIndex = start2;
    civ3.date = fromMonthIndex(start2);
    const hg = mk(origin, 120, "human");
    civ3.species.human = { id: "human", name: "\u4EBA\u9593", bornAt: start2 };
    note3("species_emerged", "\u4EBA\u985E\u304C\u73FE\u308C\u305F", [{ entityId: "human", role: "species" }, { entityId: hg.id, role: "first_group" }], hg);
    stats.species.human = { at: start2, cell: origin };
    const others = [...(cfg.builtinSpecies ?? []).map((k) => SPECIES[k]).filter(Boolean), ...cfg.species.map((s) => civ3.speciesDefs[s.id])];
    const emergeAt = /* @__PURE__ */ new Map();
    for (const sp of others) emergeAt.set(sp.id, Math.floor(steps * (0.35 + 0.3 * (hashSeed(seed, "emerge", sp.id) % 1e3) / 1e3)));
    let areaSum = 0;
    for (const c of landCells) areaSum += ce.areaKm2[c];
    const res = clamp2(Math.sqrt(POP.territoryKm2 * 1.5 / (areaSum / landCells.length)), 1, 6);
    stats.moveScale = Math.round(res * 100) / 100;
    const baseRate = POP.growthPerMonth * 12;
    let Kworld = 0;
    for (const c of landCells) Kworld += 0.04 * (0.3 + ce.fertility[c]) * ce.areaKm2[c];
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
      for (const sp of others) if (emergeAt.get(sp.id) === step) {
        let best = -1, bc = -1;
        for (let k = 0; k < 400; k++) {
          const c = landCells[Math.floor(rng() * landCells.length)];
          if (occ.has(c)) continue;
          const s = score(c, sp);
          if (s > best) {
            best = s;
            bc = c;
          }
        }
        if (bc >= 0 && envFit(sp, ce.biome[bc]) >= 1) {
          const g = mk(bc, 90, sp.id);
          civ3.species[sp.id] = { id: sp.id, name: sp.ja, bornAt: mi };
          stats.species[sp.id] = { at: mi, cell: bc };
          note3("species_emerged", `${sp.ja}\u304C\u73FE\u308C\u305F`, [{ entityId: sp.id, role: "species" }, { entityId: g.id, role: "first_group" }], g);
        }
      }
      spread(mi, rng);
      let total = 0, n = 0;
      for (let oi = 0; oi < order.length; oi++) {
        const id = order[oi], g = civ3.groups[id];
        if (!g) continue;
        n++;
        const sp = speciesIn(g.speciesId), fit = envFit(sp, ce.biome[g.cell]);
        const K = Math.max(0.5, groupCapacity(world, g, occ) * fit * iceMult(ce.lat[g.cell], ice) * (g.capMult ?? 1));
        const r = baseRate * sp.growth * (civ3.options.growthScale ?? 1) * (0.85 + 0.3 * rng()), N0 = Math.max(1, g.pop);
        g.pop = K / (1 + (K / N0 - 1) * Math.exp(-r * (stepMonths / 12)));
        g.pressure = g.pop / K;
        total += g.pop;
        if (g.pop < 5) {
          subOcc(g);
          delete civ3.groups[id];
          stats.extinct++;
          n--;
          continue;
        }
        g.settledMonths = g.subsistence === "forage" || g.subsistence === "pastoral" ? 0 : g.settledMonths + stepMonths;
        if ((step + oi % LEARN_EVERY) % LEARN_EVERY === 0) {
          const acc = (0.6 + 0.4 * Math.log10(Math.max(10, g.pop)) / 3) * sp.techRate * INNOVATION * stepMonths * LEARN_EVERY * Math.min(1.5, worldPop / POP_REF) * shapeAt(frac);
          if (!g.tech.cand) refreshCand(g);
          for (const key of [...g.tech.cand]) {
            const t = TECH[key];
            if (t.cost > TECH_CEILING || !available(world, g, t)) continue;
            const u = hashSeed(g.id, key) % 1e3 / 1e3, p = (g.tech.prog[key] ?? 0) + acc, need = t.cost * (PRE_COST[key] ?? 2.5) * (1 + 4 * u * u);
            if (p < need) {
              g.tech.prog[key] = p;
              continue;
            }
            learn2(g, key, mi, true);
          }
        }
        if (g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 && (ce.fertility[g.cell] >= 0.25 || ce.river[g.cell] || ce.coastDist[g.cell] <= 2)) g.subsistence = "agriculture";
        else if (g.subsistence === "forage") {
          const b = ce.biome[g.cell];
          if (g.knowledge.herding >= 1 && (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA)) g.subsistence = "pastoral";
          else if (g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1 && rng() < 0.4) g.subsistence = "fishing";
        }
        if (g.pressure > POP.budPressure && g.pop >= POP.minBudPop * 2 && (g.noTargetUntil ?? -1) <= step) {
          stats.budSearches++;
          const pick2 = (ts) => ts.find((x) => envFit(sp, ce.biome[x.cell]) >= 1) ?? (sp.id === "human" ? ts[0] : null);
          let t = pick2(targetsFor(world, g, occ, res, 6, Math.max(1 / res, LOCAL_SCALE)));
          if (!t && g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1) {
            stats.farSearches++;
            t = pick2(targetsFor(world, g, occ, res, 6, 1));
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
      if (n > stats.peakGroups) stats.peakGroups = n;
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
          stats.epochs.push({ ep, groups: n, pop: Math.round(worldPop), x: Math.round(worldPop / Kworld * 100) / 100, ice: Math.round(ice * 100) / 100, sub: sub2 });
        }
        note3("prehistory_epoch", `\u5148\u53F2 \u7B2C${epochs}\u671F\u306E\u6982\u6CC1\uFF08\u96C6\u56E3 ${n}\u30FB\u4EBA\u53E3 \u7D04${Math.round(worldPop)}\uFF09`, [], null).effects.push({ targetId: "world", property: "prehistory.pop", before: null, after: Math.round(worldPop) });
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
  init_cohorts();
  init_spatial();
  init_civ_state();
  init_graph();
  init_species();
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
    const st = {
      id,
      name: name ?? ctx.nameGen?.state(civ3, cap, via, rng) ?? makeNameJa(rng) + VIA[via].suffix,
      via,
      formedAt: civ3.monthIndex,
      capitalGroupId: cap.id,
      nameLang: name ? null : ctx.nameLangOf?.(cap) ?? null,
      /* 国名の由来の言語（建国時。首都はのちに変わるので、現在の首都の言語とは別に残す） */
      alive: true,
      player,
      dissolvedAt: null,
      predecessor,
      polity: polity ?? (via === "religious_polity" ? "theocracy" : via === "city_state" ? "chiefdom" : "tribal"),
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
    civ3.states[id] = st;
    for (const g of gs) g.stateId = id;
    if (gs.some((g) => g.player)) st.player = true;
    const causes = [];
    if (cause) causes.push({ targetId: cause, relation: "caused_by", basis: "plausible" });
    if (threat) causes.push({ targetId: threat, relation: "reaction_to", basis: "strong" });
    if (predecessor) causes.push({ targetId: predecessor, relation: "succeeded_by", basis: "direct" });
    const ev = makeEvent(civ3, ids, { kind: "state_formed", title: `${st.name}\u304C\u6210\u7ACB\uFF08${VIA[via].ja}\uFF09`, participants: [{ entityId: id, role: "state" }, ...gs.map((g) => ({ entityId: g.id, role: g.id === cap.id ? "capital_group" : "member" }))], location: { cell: cap.cell }, causes, provenance: player ? "player" : "simulation" });
    st.formedEvent = ev.eventId;
    return st;
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
    const st = (g) => g.settlementId ? civ3.settlements[g.settlementId] : null, sum = (a) => a.reduce((s, g) => s + g.pop, 0);
    const s0 = st(seed);
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
  var dissolve = (ctx, st, why2) => {
    const { civ: civ3, ids } = ctx;
    st.alive = false;
    st.dissolvedAt = civ3.monthIndex;
    for (const gid in civ3.groups) if (civ3.groups[gid].stateId === st.id) civ3.groups[gid].stateId = null;
    for (const wid of [...st.warIds]) ctx.endWarHook?.(ctx, civ3.wars[wid], "state_dissolved");
    makeEvent(civ3, ids, { kind: "state_dissolved", title: `${st.name}\u304C${why2}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: civ3.groups[st.capitalGroupId]?.cell ?? null }, causes: [...st.lastCrisisEvent ? [{ targetId: st.lastCrisisEvent, relation: "caused_by", basis: "plausible" }] : [], ...asCauses(recentEventsFor(civ3, [st.id], ["war_ended"], 24, 1), "contributed_to", "plausible")] });
  };
  function stepStates(ctx) {
    const { world, civ: civ3, ids, rng } = ctx, mi = civ3.monthIndex;
    if (mi % 3 !== 0) return;
    const groupsByState = byState(ctx);
    for (const id in civ3.states) {
      const st = civ3.states[id];
      if (!st.alive) continue;
      const gs = groupsByState.get(id);
      if (!gs?.length) {
        dissolve(ctx, st, "\u6D88\u6EC5\u3057\u305F");
        continue;
      }
      let pop = 0, tens = 0, settle = 0, big = gs[0], mar = 0;
      for (const g of gs) {
        pop += g.pop;
        mar += g.pop * speciesOf(g.speciesId, civ3).martial;
        if (g.settlementId) settle++;
        if (g.pop > big.pop) big = g;
        let t = 0;
        for (const c of g.cohorts) if (c.tension > t) t = c.tension;
        tens += t * g.pop;
      }
      st.pop = pop;
      st.martial = pop ? Math.round(mar / pop * 1e3) / 1e3 : 1;
      st.settlements = settle;
      if (!civ3.groups[st.capitalGroupId] || civ3.groups[st.capitalGroupId].stateId !== id) st.capitalGroupId = big.id;
      const cap = civ3.groups[st.capitalGroupId];
      let far = 0, mx = 0;
      const dists = [];
      for (const g of gs) {
        const d = distKm(world, cap.cell, g.cell);
        dists.push([d, g]);
        if (d > mx) mx = d;
      }
      const adm = st.techAdopted.bureaucracy != null ? 0.6 : st.techAdopted.administration != null ? 0.35 : 0;
      const target = 0.8 - 0.5 * (tens / pop) - Math.min(1, mx / 15e3) * 0.3 * (1 - adm) - Math.max(0, st.policy.tax - 0.15) * 0.6 - (st.warIds.length ? 0.05 : 0) - st.policy.mobilization * 0.3 + (st.leader.heir ? 0.03 : 0) + (st.magic?.kind === "temple" ? 0.04 * st.magic.power : 0) + { chiefdom: 0.02, kingdom: 0.05, empire: 0.08, republic: 0.06, theocracy: 0.05, tribal: 0 }[st.polity];
      const before = st.stability;
      st.stability = Math.max(0, Math.min(1, st.stability + (target - st.stability) * 0.3));
      st.treasury += pop * st.policy.tax * 12e-4 * taxMult(st) * (ctx.taxFactor?.(st) ?? 1) * (1 - Math.min(0.5, Object.keys(st.sanctions).filter((k) => st.sanctions[k] > mi).length * 0.1));
      st.army = pop * (5e-3 + 0.12 * st.policy.mobilization) * (0.5 + st.stability);
      for (const k in st.sanctions) if (st.sanctions[k] <= mi) delete st.sanctions[k];
      const ls = lifeScale(civ3, st), age = mi - st.leader.bornAt;
      if (age > 480 * ls && rng() < Math.min(0.2, (age - 480 * ls) / (4e3 * ls))) {
        const heir = st.leader.heir;
        st.interpDirty = true;
        st.leader = { name: ctx.nameGen?.person(civ3, civ3.groups[st.capitalGroupId], rng) ?? makeNameJa(rng), bornAt: mi - Math.round((300 + Math.floor(rng() * 100)) * ls), heir: false };
        st.stability = Math.max(0, st.stability - (heir ? 0.03 : 0.12));
        makeEvent(civ3, ids, { kind: "leader_succession", title: `${st.name}\u306E\u6307\u5C0E\u8005\u304C\u4EE3\u308F\u3063\u305F${heir ? "\uFF08\u7D99\u627F\u8005\u304C\u6C7A\u307E\u3063\u3066\u3044\u305F\uFF09" : "\uFF08\u7D99\u627F\u306E\u6DF7\u4E71\uFF09"}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: cap.cell } });
      }
      if (st.stability < 0.08 && before < 0.2) {
        dissolve(ctx, st, "\u5D29\u58CA\u3057\u305F");
        continue;
      }
      if (st.stability < 0.3 && gs.length >= 3 && mi - st.lastCrisis > 60) {
        dists.sort((a, b) => b[0] - a[0]);
        const part = dists.slice(0, Math.max(1, Math.floor(gs.length / 2))).map((x) => x[1]).filter((g) => !g.player || st.player === false);
        if (part.length && part.length < gs.length) {
          st.lastCrisis = mi;
          const ev = makeEvent(civ3, ids, { kind: "instability", title: `${st.name}\u3067\u4E0D\u6E80\u304C\u9AD8\u307E\u308B`, participants: [{ entityId: st.id, role: "state" }], location: { cell: cap.cell }, causes: [...asCauses(recentEventsFor(civ3, [st.id, ...gs.map((g) => g.id)], ["famine", "disaster_struck", "demand_raised"], 48, 2), "contributed_to", "plausible"), ...asCauses(recentEventsFor(civ3, [st.id], ["war_declared", "war_ended", "leader_succession"], 36, 2), "contributed_to", "strong")] });
          st.lastCrisisEvent = ev.eventId;
          const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st.id, cause: ev.eventId });
          if (ns) {
            ns.relations[st.id] = -40;
            st.relations[ns.id] = -40;
            st.stability = Math.min(1, st.stability + 0.1);
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
          makeEvent(civ3, ids, { kind: "group_joined_state", title: `${civ3.states[best.stateId].name}\u306B\u52A0\u308F\u3063\u305F`, participants: [{ entityId: g.id, role: "group" }, { entityId: best.stateId, role: "state" }], location: { cell: g.cell } });
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
    const r = rngOf(hashSeed(id, "change")), p = { ...parent, c: [...parent.c], v: [...parent.v], endV: [...parent.endV], changes: [...parent.changes] }, n = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
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
  function word(rng, phon, n, endBias = 0.6) {
    const syl = syllablesOf(phon), parts = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
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
    if (phon.geminate && n >= 3 && rng() < 0.2) w = w.slice(0, 1) + "\u30C3" + w.slice(1);
    return w;
  }
  function nameFor(civ3, rng, langId, kind = "person") {
    const phon = ensureProfile(civ3, langId);
    if (!phon) return null;
    const n = kind === "person" ? 2 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    return word(rng, phon, n);
  }
  var languageOfGroup = (g) => g?.cohorts?.length ? g.cohorts.reduce((b, c) => c.share > b.share ? c : b).languageId : null;
  var nameLangOf = (g) => languageOfGroup(g);
  var nameGen = {
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
      const nid = createReligion(civ3, ids, ctx.rng, { parent: rid, kind: r.kind }), nr = civ3.religions[nid];
      nr.holyCell = far[0].cell;
      nr.founderId = null;
      nr.deity = r.deity;
      const lang = languageOfGroup(far[0]);
      if (lang && civ3.languages[lang]) {
        nr.name = `${nameFor(civ3, ctx.rng, lang, "person")}\u6D3E`;
      }
      for (const g of far) for (const c of g.cohorts) if (c.religionId === rid) c.religionId = nid;
      makeEvent(civ3, ids, { kind: "religion_schism", title: `${r.name}\u304B\u3089${nr.name}\u304C\u5206\u304B\u308C\u305F\uFF08\u4FE1\u8005\u306E\u96C6\u56E3 ${far.length}\uFF09`, participants: [{ entityId: rid, role: "parent_religion" }, { entityId: nid, role: "new_religion" }, ...far.slice(0, 3).map((g) => ({ entityId: g.id, role: "converted_group" }))], location: { cell: far[0].cell }, effects: [{ targetId: nid, property: "religion.parent", before: null, after: rid }], provenance: "simulation" });
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
  var strength = (civ3, st) => st.army * milMult(st) * (1 + (st.defense + (st.milDef ?? 0)) * 0.5);
  function neighborStates(ctx, st) {
    const cache = ctx._nbr && ctx._nbrMonth === ctx.civ.monthIndex ? ctx._nbr : (ctx._nbr = /* @__PURE__ */ new Map(), ctx._nbrMonth = ctx.civ.monthIndex, ctx._nbr);
    if (cache.has(st.id)) return cache.get(st.id);
    const out = /* @__PURE__ */ new Set();
    for (const g of byState(ctx).get(st.id) ?? []) for (const o of neighborGroups(ctx, g)) {
      const s = ctx.civ.groups[o]?.stateId;
      if (s && s !== st.id && ctx.civ.states[s].alive) out.add(s);
    }
    const r = [...out].sort();
    cache.set(st.id, r);
    return r;
  }
  function signTreaty(ctx, type, a, b, { decisionId = null, provenance = "simulation" } = {}) {
    const { civ: civ3, ids } = ctx, id = ids.next("treaty"), t = { id, type, a: a.id, b: b.id, signedAt: civ3.monthIndex, expiresAt: civ3.monthIndex + TREATY[type].months, active: true };
    civ3.treaties[id] = t;
    civ3.activeTreatyIds.push(id);
    adjustRel(a, b, type === "alliance" ? 25 : 15);
    makeEvent(civ3, ids, { kind: "treaty_signed", title: `${a.name}\u3068${b.name}\u304C${TREATY[type].ja}\u3092\u7D50\u3093\u3060`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }, { entityId: id, role: "treaty" }], location: null, decisionId, provenance });
    return t;
  }
  function endTreaty(ctx, t, why2, byId = null) {
    const { civ: civ3, ids } = ctx;
    t.active = false;
    t.endedAt = civ3.monthIndex;
    civ3.activeTreatyIds = civ3.activeTreatyIds.filter((i) => i !== t.id);
    makeEvent(civ3, ids, { kind: "treaty_ended", title: `${TREATY[t.type].ja}\u304C${why2}`, participants: [{ entityId: t.id, role: "treaty" }, { entityId: t.a, role: byId === t.a ? "breaker" : "party" }, { entityId: t.b, role: byId === t.b ? "breaker" : "party" }], location: null, effects: byId ? [{ targetId: t.id, property: "broken_by", before: null, after: byId }] : [] });
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
    const ev = makeEvent(civ3, ids, { kind: "war_declared", title: `${atk.name}\u304C${def.name}\u306B\u5BA3\u6226\u3057\u305F`, participants: [{ entityId: atk.id, role: "aggressor" }, { entityId: def.id, role: "defender" }, { entityId: id, role: "war" }], location: civ3.groups[def.capitalGroupId] ? { cell: civ3.groups[def.capitalGroupId].cell } : null, causes: revengeCauses(civ3, atk, def), decisionId, provenance });
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
    return w;
  }
  function endWar(ctx, w, outcome) {
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
    const gained = [];
    if (lead && atk?.alive) for (const gid of w.occupied) {
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
    makeEvent(civ3, ids, { kind: "war_ended", title: `${atk?.name ?? "?"}\u3068${def?.name ?? "?"}\u306E\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F\uFF08${{ aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" }[outcome] ?? outcome}\uFF09`, participants: [{ entityId: w.id, role: "war" }, ...all.map((s) => ({ entityId: s.id, role: "belligerent" }))], location: null, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: gained.map((gid) => ({ targetId: gid, property: "stateId", before: w.defender, after: atk.id })) });
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
    for (const wid of [...civ3.activeWarIds]) {
      const w = civ3.wars[wid], A2 = w.sides.a.map((i) => civ3.states[i]).filter((s) => s.alive), D3 = w.sides.d.map((i) => civ3.states[i]).filter((s) => s.alive);
      if (!civ3.states[w.aggressor].alive || !civ3.states[w.defender].alive || !A2.length || !D3.length) {
        endWar(ctx, w, "state_dissolved");
        continue;
      }
      const sA = A2.reduce((s, x) => s + strength(civ3, x), 0), sD = D3.reduce((s, x) => s + strength(civ3, x), 0);
      w.score = Math.max(-100, Math.min(100, w.score + (sA - sD) / (sA + sD + 1) * 6 + (rng() - 0.5) * 3));
      const lossA = 25e-4 * (sD / (sA + sD + 1)), lossD = 25e-4 * (sA / (sA + sD + 1));
      let dead = 0;
      for (const [side, loss] of [[A2, lossA], [D3, lossD]]) for (const s of side) {
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
        const cand3 = D3.flatMap((s) => groups.get(s.id) ?? []).filter((g) => !w.occupied.includes(g.id));
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
  var clamp3 = (v, a, b) => Math.max(a, Math.min(b, v));
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
  function grievance(civ3, st, targetId) {
    let s = 0;
    for (const id of st.interp ?? []) {
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
      const st = civ3.states[id];
      if (!st.alive || !st.interpDirty) continue;
      st.interpDirty = false;
      const k = st.polity === "republic" ? 0.4 : st.polity === "empire" || st.polity === "kingdom" ? 1.1 : 0.6;
      for (const iid of [...st.interp ?? []]) {
        const x = getInterp(civ3, iid);
        if (!x || x.until != null || x.valence >= 0) continue;
        const nv = clamp3(x.valence * k, -1, 0), ev = getEvent(civ3, x.eventId);
        x.until = civ3.monthIndex;
        st.interp = st.interp.filter((q2) => q2 !== iid);
        if (ev) addInterp(ctx, st, ev, Math.abs(nv) < 0.15 ? "reconciled" : x.stance, Math.abs(nv) < 0.15 ? 0 : nv, x.about, iid);
      }
    }
  }

  // js/core/civ/actions.js
  init_magic();

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
  var clamp4 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
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
  function disasterMemory(civ3, st) {
    const m = st.memory?.disaster;
    if (!m) return 0;
    let s = 0;
    for (const k in m) s += m[k].w * Math.pow(0.5, (civ3.monthIndex - m[k].at) / HALF_LIFE);
    return s;
  }
  function remember(civ3, st, kind, sev) {
    var _a;
    const m = (_a = st.memory ?? (st.memory = {})).disaster ?? (_a.disaster = {}), cur = m[kind] ? m[kind].w * Math.pow(0.5, (civ3.monthIndex - m[kind].at) / HALF_LIFE) : 0;
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
    const st = g.stateId ? civ3.states[g.stateId] : null;
    return 1 - 0.6 * (st?.resilience ?? 0);
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
        g.capMult = r3(clamp4(1 - (kind === "drought" ? 0.45 : 0.35) * sev * res, 0.3, 1));
        g.capUntil = mi + months + (kind === "volcano" ? 12 : 6);
      }
      dead += Math.max(0, before - g.pop);
      {
        const dc = g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
        dc.tension = clamp4(dc.tension + 0.05 * sev * res);
      }
      effects.push({ targetId: gid, property: "pop", before, after: Math.round(g.pop) });
      if (g.stateId) states.add(g.stateId);
    }
    d.deaths = Math.round(dead);
    for (const sid of states) {
      const st = civ3.states[sid];
      if (!st?.alive) continue;
      const b = st.stability;
      st.stability = Math.max(0, st.stability - 0.03 * sev * (1 - 0.6 * (st.resilience ?? 0)));
      remember(civ3, st, kind, sev);
      effects.push({ targetId: sid, property: "stability", before: r3(b), after: r3(st.stability) });
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
  function recentDisasterLoad(civ3, st, months = 24) {
    let s = 0;
    for (const id in civ3.disasters) {
      const d = civ3.disasters[id];
      if (civ3.monthIndex - d.endsAt > months) continue;
      for (const gid of d.groupIds) if (civ3.groups[gid]?.stateId === st.id) {
        s += d.severity;
        break;
      }
    }
    return Math.min(1, s);
  }

  // js/core/civ/actions.js
  var clamp5 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var cand = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad = (key, reason, o = {}) => cand(key, {}, { ...o, eligible: false, reason });
  var r32 = (x) => Math.round(x * 1e3) / 1e3;
  var eff = (list, st, property, before, after) => {
    list.push({ targetId: st.id, property, before: typeof before === "number" ? Math.round(before * 1e3) / 1e3 : before, after: typeof after === "number" ? Math.round(after * 1e3) / 1e3 : after });
  };
  var spend = (st, n) => st.treasury >= n ? (st.treasury -= n, true) : false;
  function observe(ctx, st) {
    const { civ: civ3 } = ctx, gs = byState(ctx).get(st.id) ?? [], nb = neighborStates(ctx, st).map((i) => civ3.states[i]).filter(Boolean);
    let tens = 0;
    for (const g of gs) {
      let t = 0;
      for (const c of g.cohorts) if (c.tension > t) t = c.tension;
      tens += t * g.pop;
    }
    const my = strength(civ3, st), nbs = nb.map((o) => ({ st: o, pop: o.pop, strength: strength(civ3, o), rel: st.relations[o.id] ?? 0, atWar: atWarWith(civ3, st, o), treaties: { na: !!treatyBetween(civ3, st, o, "nonaggression"), al: !!treatyBetween(civ3, st, o, "alliance"), tr: !!treatyBetween(civ3, st, o, "trade") } }));
    const techs = Object.keys(st.techAdopted).length, lag = nbs.length ? clamp5((nbs.reduce((s, n) => s + Object.keys(n.st.techAdopted).length, 0) / nbs.length - techs) / 6) : 0;
    const myBase = st.pop * 5e-3 * (0.5 + st.stability) * (my / (st.army + 1e-9) || 1) * (1 + st.defense * 0.5), maxThreat = nbs.reduce((m, n) => Math.max(m, n.strength / (myBase + 1)), 0);
    return { gs, nbs, pop: st.pop, my, tension: st.pop ? tens / st.pop : 0, treasuryNeed: clamp5(1 - st.treasury / (st.pop * 0.02 + 50)), techLag: lag, threat: clamp5((maxThreat - 0.8) / 2), atWar: st.warIds.length > 0, mi: civ3.monthIndex };
  }
  var free = (ctx, id) => ctx.civ.states[id];
  var ACTIONS = [
    {
      key: "set_tax",
      domain: "finance",
      label: "\u7A0E\u7387\u306E\u8ABF\u6574",
      enabled: true,
      candidates(ctx, st, e) {
        const t = st.policy.tax, out = [];
        if (t < Math.min(0.4, st.politics?.taxCeiling ?? 0.4)) out.push(cand("set_tax", { prosperity: 0.9 * e.treasuryNeed, stability: -0.4 - e.tension }, { opt: "up", label: "\u5897\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0A\u9650", { opt: "up" }));
        if (t > 0.03) out.push(cand("set_tax", { stability: 0.2 + 0.7 * e.tension, prosperity: -0.3 * e.treasuryNeed }, { opt: "down", label: "\u6E1B\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0B\u9650", { opt: "down" }));
        return out;
      },
      execute(ctx, st, c) {
        const ef = [], b = st.policy.tax, a = r32(clamp5(b + (c.opt === "up" ? 0.05 : -0.05), 0.02, 0.4));
        st.policy.tax = a;
        eff(ef, st, "policy.tax", b, a);
        return { ok: true, effects: ef, title: c.opt === "up" ? "\u5897\u7A0E" : "\u6E1B\u7A0E" };
      }
    },
    {
      key: "adopt_tech",
      domain: "tech",
      label: "\u6280\u8853\u306E\u63A1\u7528",
      enabled: true,
      candidates(ctx, st, e) {
        var _a;
        const cache = (_a = ctx.civ).adoptCache ?? (_a.adoptCache = {}), hit = cache[st.id];
        const keys = hit && e.mi - hit.mi < 12 ? hit.keys : (cache[st.id] = { mi: e.mi, keys: adoptable(ctx, st, e.gs).map((t) => t.key) }, cache[st.id].keys);
        const list = keys.map((k) => TECH[k]).filter(Boolean);
        return list.filter((t) => st.techAdopted[t.key] == null).slice(0, 3).map((t) => {
          const cost = t.tier * 15;
          return st.treasury >= cost ? cand("adopt_tech", { tech: 0.3 + 0.12 * t.tier + e.techLag * 0.4, prosperity: 0.15, prestige: 0.05 * t.tier }, { opt: t.key, label: `${t.name}\u3092\u63A1\u7528` }) : bad("adopt_tech", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044", { opt: t.key });
        });
      },
      execute(ctx, st, c) {
        const t = TECH[c.opt];
        if (!t || st.techAdopted[t.key] != null) return { ok: false, error: "\u63A1\u7528\u3067\u304D\u306A\u3044\u6280\u8853" };
        if (!spend(st, t.tier * 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st.techAdopted[t.key] = ctx.civ.monthIndex;
        return { ok: true, effects: [{ targetId: st.id, property: `techAdopted.${t.key}`, before: null, after: ctx.civ.monthIndex }], title: `${t.name}\u3092\u63A1\u7528` };
      }
    },
    {
      key: "change_polity",
      domain: "institution",
      label: "\u653F\u4F53\u306E\u5909\u66F4",
      enabled: true,
      candidates(ctx, st) {
        const a = st.techAdopted, out = [], p = st.polity, n = st.pop;
        if (p === "tribal") out.push(n >= 2e3 ? cand("change_polity", { stability: 0.3, prestige: 0.2 }, { opt: "chiefdom" }) : bad("change_polity", "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044", { opt: "chiefdom" }));
        if (p === "chiefdom" || p === "theocracy") {
          out.push(a.administration != null && n >= 15e3 ? cand("change_polity", { stability: 0.3, prestige: 0.4 }, { opt: "kingdom" }) : bad("change_polity", "\u884C\u653F\u306E\u6280\u8853\u3068\u4EBA\u53E3\u304C\u5FC5\u8981", { opt: "kingdom" }));
          if (p === "chiefdom") out.push(a.law != null && n >= 15e3 && st.policy.tolerance > 0.5 ? cand("change_polity", { stability: 0.25, culture: 0.2 }, { opt: "republic" }) : bad("change_polity", "\u6CD5\u306E\u6280\u8853\u30FB\u4EBA\u53E3\u30FB\u5BDB\u5BB9\u304C\u5FC5\u8981", { opt: "republic" }));
        }
        if (p === "kingdom") out.push(a.bureaucracy != null && n >= 15e4 ? cand("change_polity", { stability: 0.2, prestige: 0.6, expansion: 0.2 }, { opt: "empire" }) : bad("change_polity", "\u5B98\u50DA\u5236\u3068\u4EBA\u53E3\u304C\u5FC5\u8981", { opt: "empire" }));
        return out;
      },
      execute(ctx, st, c) {
        const ok2 = POLITY[c.opt];
        if (!ok2) return { ok: false, error: "\u672A\u77E5\u306E\u653F\u4F53" };
        const ef = [];
        eff(ef, st, "polity", st.polity, c.opt);
        st.polity = c.opt;
        st.interpDirty = true;
        return { ok: true, effects: ef, title: `\u653F\u4F53\u3092${POLITY[c.opt]}\u3078` };
      }
    },
    {
      key: "designate_heir",
      domain: "leader",
      label: "\u7D99\u627F\u8005\u306E\u6307\u540D",
      enabled: true,
      candidates(ctx, st) {
        return st.leader.heir ? [bad("designate_heir", "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F")] : [cand("designate_heir", { stability: 0.35 })];
      },
      execute(ctx, st) {
        if (st.leader.heir) return { ok: false, error: "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F" };
        st.leader.heir = true;
        return { ok: true, effects: [{ targetId: st.id, property: "leader.heir", before: false, after: true }] };
      }
    },
    {
      key: "encourage_settlement",
      domain: "population",
      label: "\u5B9A\u4F4F\u30FB\u5165\u690D\u306E\u5968\u52B1",
      enabled: true,
      candidates(ctx, st) {
        return st.boostUntil > ctx.civ.monthIndex ? [bad("encourage_settlement", "\u5968\u52B1\u4E2D")] : st.treasury >= 30 ? [cand("encourage_settlement", { prosperity: 0.3, expansion: 0.25 })] : [bad("encourage_settlement", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st) {
        if (!spend(st, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st.boostUntil = ctx.civ.monthIndex + 60;
        return { ok: true, effects: [{ targetId: st.id, property: "boostUntil", before: null, after: st.boostUntil }] };
      }
    },
    {
      key: "set_mobilization",
      domain: "mobilization",
      label: "\u52D5\u54E1",
      enabled: true,
      candidates(ctx, st, e) {
        const want = e.atWar || e.threat > 0.7 ? 0.15 : e.threat > 0.4 ? 0.05 : 0;
        return [0, 0.05, 0.15].filter((v) => v !== st.policy.mobilization).map((v) => cand("set_mobilization", v === want ? { security: 0.5, prosperity: v < st.policy.mobilization ? 0.2 : -0.1 } : { security: -0.3 }, { opt: String(v), label: `\u52D5\u54E1\u7387${v}` }));
      },
      execute(ctx, st, c) {
        const v = Number(c.opt);
        if (!(v >= 0 && v <= 0.15)) return { ok: false, error: "\u52D5\u54E1\u7387\u304C\u7BC4\u56F2\u5916" };
        const ef = [];
        eff(ef, st, "policy.mobilization", st.policy.mobilization, v);
        st.policy.mobilization = v;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "build_fortification",
      domain: "military",
      label: "\u8981\u585E\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st, e) {
        if (st.techAdopted.fortification == null) return [bad("build_fortification", "\u57CE\u58C1\u306E\u6280\u8853\u3092\u63A1\u7528\u3057\u3066\u3044\u306A\u3044")];
        if (st.defense >= 0.5) return [bad("build_fortification", "\u6574\u5099\u6E08\u307F")];
        return st.treasury >= 40 ? [cand("build_fortification", { security: 0.3 + e.threat * 0.6 })] : [bad("build_fortification", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st) {
        if (st.techAdopted.fortification == null) return { ok: false, error: "\u57CE\u58C1\u306E\u6280\u8853\u304C\u306A\u3044" };
        if (!spend(st, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        eff(ef, st, "defense", st.defense, Math.min(0.5, st.defense + 0.1));
        st.defense = Math.min(0.5, st.defense + 0.1);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "plan_conquest",
      domain: "war",
      label: "\u5F81\u670D\u306E\u8A08\u753B",
      enabled: true,
      candidates(ctx, st, e) {
        if (st.campaign) return [bad("plan_conquest", "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D")];
        if (e.mi - (st.lastWarEnd ?? -999) < 180) return [bad("plan_conquest", "\u6226\u4E89\u306E\u75B2\u5F0A\u304B\u3089\u56DE\u5FA9\u3057\u3066\u3044\u306A\u3044")];
        return e.nbs.filter((n) => !n.atWar && !n.treaties.na && !n.treaties.al).map((n) => {
          const ratio = (e.my + 1) / (n.strength + 1);
          const gr = grievance(ctx.civ, st, n.st.id);
          return ratio >= 1.3 ? cand("plan_conquest", { expansion: clamp5((ratio - 1) / 2) - 0.1 * st.warIds.length + 0.35 * gr, prestige: 0.1 + 0.3 * gr, stability: -0.2, prosperity: -0.3 }, { target: n.st.id, label: `${n.st.name}\u306E\u5F81\u670D` }) : bad("plan_conquest", "\u6226\u529B\u304C\u8DB3\u308A\u306A\u3044", { target: n.st.id });
        });
      },
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (st.campaign) return { ok: false, error: "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D" };
        st.campaign = { kind: "conquest", target: t.id, stage: "prepare", startedAt: ctx.civ.monthIndex, deadline: ctx.civ.monthIndex + 60, warId: null };
        return { ok: true, effects: [{ targetId: st.id, property: "campaign", before: null, after: `conquest:${t.id}` }], title: `${t.name}\u306E\u5F81\u670D\u3092\u8A08\u753B`, targetId: t.id };
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
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || t.id === st.id) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (atWarWith(ctx.civ, st, t)) return { ok: false, error: "\u3059\u3067\u306B\u4EA4\u6226\u4E2D" };
        if (treatyBetween(ctx.civ, st, t, "nonaggression") || treatyBetween(ctx.civ, st, t, "alliance")) return { ok: false, error: "\u6761\u7D04\u304C\u3042\u308B\u305F\u3081\u5BA3\u6226\u3067\u304D\u306A\u3044\uFF08\u5148\u306B\u7834\u68C4\u3059\u308B\uFF09" };
        if (!neighborStates(ctx, st).includes(t.id)) return { ok: false, error: "\u96A3\u63A5\u3057\u3066\u3044\u306A\u3044" };
        const w = declareWar(ctx, st, t, { decisionId: c.decisionId, provenance: c.provenance });
        if (st.campaign?.target === t.id) {
          st.campaign.stage = "war";
          st.campaign.warId = w.id;
        }
        return { ok: true, effects: [], warId: w.id, silent: true, targetId: t.id };
      }
    },
    {
      key: "sue_for_peace",
      domain: "war",
      label: "\u8B1B\u548C",
      enabled: true,
      candidates(ctx, st) {
        return st.warIds.map((i) => ctx.civ.wars[i]).map((w) => {
          const mine = w.sides.a.includes(st.id) ? w.score : -w.score;
          return cand("sue_for_peace", { security: clamp5(-mine / 50) + 0.1, stability: 0.2 }, { target: w.id, label: "\u8B1B\u548C" });
        });
      },
      execute(ctx, st, c) {
        const w = ctx.civ.wars[c.target];
        if (!w || w.status !== "active" || !st.warIds.includes(w.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
        {
          const r = ctx.negotiate?.peace(ctx, st, w, c);
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
      candidates(ctx, st, e) {
        const out = [];
        for (const n of e.nbs) {
          if (n.atWar) continue;
          for (const type of ["nonaggression", "alliance", "trade"]) {
            const have = type === "nonaggression" ? n.treaties.na : type === "alliance" ? n.treaties.al : n.treaties.tr;
            if (have) continue;
            if (grievance(ctx.civ, st, n.st.id) > 0.5) {
              out.push(bad("sign_treaty", "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", { target: n.st.id, opt: type }));
              continue;
            }
            if (n.rel < -20 || type === "alliance" && n.rel < 10) {
              out.push(bad("sign_treaty", "\u95A2\u4FC2\u304C\u826F\u304F\u306A\u3044", { target: n.st.id, opt: type }));
              continue;
            }
            const f = type === "trade" ? { prosperity: 0.35 } : type === "nonaggression" ? { security: 0.2 + clamp5(n.strength / (e.my + 1) - 0.8) * 0.5 } : { security: 0.3 + e.threat * 0.5, prestige: 0.15 };
            out.push(cand("sign_treaty", f, { target: n.st.id, opt: type, label: `${n.st.name}\u3068${TREATY[type].ja}` }));
          }
        }
        return out;
      },
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || !TREATY[c.opt]) return { ok: false, error: "\u76F8\u624B\u307E\u305F\u306F\u6761\u7D04\u306E\u7A2E\u985E\u304C\u4E0D\u6B63" };
        if (atWarWith(ctx.civ, st, t)) return { ok: false, error: "\u4EA4\u6226\u4E2D\u306E\u76F8\u624B\u3068\u306F\u7D50\u3079\u306A\u3044" };
        if (treatyBetween(ctx.civ, st, t, c.opt)) return { ok: false, error: "\u3059\u3067\u306B\u7D50\u3093\u3067\u3044\u308B" };
        {
          const r = ctx.negotiate?.treaty(ctx, st, t, c.opt, c);
          if (r) return r;
        }
        const rel = st.relations[t.id] ?? 0;
        if (rel < -20 || c.opt === "alliance" && rel < 10) return { ok: false, error: "\u76F8\u624B\u3068\u306E\u95A2\u4FC2\u304C\u5341\u5206\u3067\u306A\u304F\u3001\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", diplomacyFailure: true, targetId: t.id };
        signTreaty(ctx, c.opt, st, t, { decisionId: c.decisionId, provenance: c.provenance });
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "break_treaty",
      domain: "diplomacy",
      label: "\u6761\u7D04\u306E\u7834\u68C4",
      enabled: true,
      candidates(ctx, st) {
        const camp = st.campaign;
        if (!camp || camp.stage !== "prepare") return [];
        const t = treatyBetween(ctx.civ, st, free(ctx, camp.target), "nonaggression");
        return t ? [cand("break_treaty", { expansion: 0.3, prestige: -0.5 }, { target: t.id })] : [];
      },
      execute(ctx, st, c) {
        const t = ctx.civ.treaties[c.target];
        if (!t?.active || t.a !== st.id && t.b !== st.id) return { ok: false, error: "\u305D\u306E\u6761\u7D04\u306F\u6709\u52B9\u3067\u306F\u306A\u3044" };
        endTreaty(ctx, t, "\u7834\u68C4\u3055\u308C\u305F", st.id);
        adjustRel(st, ctx.civ.states[t.a === st.id ? t.b : t.a], -30);
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "impose_sanctions",
      domain: "sanctions",
      label: "\u7D4C\u6E08\u5236\u88C1",
      enabled: true,
      candidates(ctx, st, e) {
        return e.nbs.filter((n) => !n.atWar && n.rel < -10 && !(n.st.sanctions[st.id] > e.mi)).map((n) => cand("impose_sanctions", { security: 0.15, prestige: 0.2, prosperity: -0.15 }, { target: n.st.id, label: `${n.st.name}\u3078\u5236\u88C1` }));
      },
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        t.sanctions[st.id] = ctx.civ.monthIndex + 36;
        adjustRel(st, t, -15);
        return { ok: true, effects: [{ targetId: t.id, property: `sanctions.${st.id}`, before: null, after: t.sanctions[st.id] }], targetId: t.id };
      }
    },
    {
      key: "covert_op",
      domain: "covert",
      label: "\u79D8\u5BC6\u5DE5\u4F5C",
      enabled: true,
      candidates(ctx, st, e) {
        return e.nbs.filter((n) => !n.atWar && n.rel < 0 && st.treasury >= 25).map((n) => cand("covert_op", { expansion: 0.15, security: 0.15, prestige: -0.1 }, { target: n.st.id, label: `${n.st.name}\u3078\u306E\u5DE5\u4F5C` }));
      },
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st, 25)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const p = 0.35 + (st.techAdopted.writing != null ? 0.1 : 0) + (st.techAdopted.administration != null ? 0.1 : 0);
        if (ctx.rng() < p) {
          const b = t.stability;
          t.stability = Math.max(0, t.stability - 0.08);
          return { ok: true, effects: [{ targetId: t.id, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(t.stability * 1e3) / 1e3 }], targetId: t.id, title: "\u79D8\u5BC6\u5DE5\u4F5C\u304C\u6210\u529F" };
        }
        adjustRel(st, t, -20);
        return { ok: false, error: "\u5DE5\u4F5C\u304C\u767A\u899A\u3057\u305F", diplomacyFailure: true, targetId: t.id };
      }
    },
    {
      key: "suppress_unrest",
      domain: "rebellion",
      label: "\u4E0D\u6E80\u306E\u93AE\u5727",
      enabled: true,
      candidates(ctx, st, e) {
        return st.treasury >= 20 ? [cand("suppress_unrest", { stability: 0.5 * e.tension + (st.stability < 0.45 ? 0.4 : 0), culture: -0.1 })] : [bad("suppress_unrest", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st, c) {
        if (!spend(st, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        for (const g of byState(ctx).get(st.id) ?? []) for (const co of g.cohorts) co.tension *= 0.8;
        eff(ef, st, "stability", st.stability, Math.min(1, st.stability + 0.06));
        st.stability = Math.min(1, st.stability + 0.06);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "grant_autonomy",
      domain: "rebellion",
      label: "\u81EA\u6CBB\u306E\u5BB9\u8A8D",
      enabled: true,
      candidates(ctx, st, e) {
        return st.policy.autonomy >= 1 ? [bad("grant_autonomy", "\u6700\u5927")] : [cand("grant_autonomy", { stability: 0.6 * e.tension, culture: 0.2, prestige: -0.1 })];
      },
      execute(ctx, st) {
        const ef = [], b = st.policy.autonomy;
        st.policy.autonomy = r32(clamp5(b + 0.2));
        eff(ef, st, "policy.autonomy", b, st.policy.autonomy);
        for (const g of byState(ctx).get(st.id) ?? []) for (const c of g.cohorts) c.tension *= 0.85;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "promote_culture",
      domain: "culture",
      label: "\u540C\u5316\u653F\u7B56",
      enabled: true,
      candidates(ctx, st, e) {
        return st.policy.assimilation >= 1 ? [bad("promote_culture", "\u6700\u5927")] : [cand("promote_culture", { culture: 0.45, stability: -0.3 * e.tension })];
      },
      execute(ctx, st) {
        const ef = [], b = st.policy.assimilation;
        st.policy.assimilation = r32(clamp5(b + 0.2));
        eff(ef, st, "policy.assimilation", b, st.policy.assimilation);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "set_tolerance",
      domain: "religion",
      label: "\u5B97\u6559\u653F\u7B56",
      enabled: true,
      candidates(ctx, st, e) {
        const t = st.policy.tolerance;
        return [t < 1 ? cand("set_tolerance", { stability: 0.4 * e.tension, culture: -0.1 }, { opt: "up", label: "\u5BDB\u5BB9" }) : bad("set_tolerance", "\u6700\u5927", { opt: "up" }), t > 0 ? cand("set_tolerance", { culture: 0.3, stability: -0.3 * e.tension }, { opt: "down", label: "\u56FD\u6559\u306E\u5F37\u5316" }) : bad("set_tolerance", "\u6700\u5C0F", { opt: "down" })];
      },
      execute(ctx, st, c) {
        const ef = [], b = st.policy.tolerance, a = r32(clamp5(b + (c.opt === "up" ? 0.2 : -0.2)));
        st.policy.tolerance = a;
        eff(ef, st, "policy.tolerance", b, a);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "found_city",
      domain: "territory",
      label: "\u90FD\u5E02\u306E\u5EFA\u8A2D",
      enabled: true,
      candidates(ctx, st, e) {
        return e.gs.filter((g) => !g.settlementId && (g.subsistence === "agriculture" || g.subsistence === "fishing") && g.pop >= 250).sort((a, b) => b.pop - a.pop).slice(0, 2).map((g) => cand("found_city", { prosperity: 0.3, expansion: 0.25 }, { target: g.id }));
      },
      execute(ctx, st, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st.id || g.settlementId || g.pop < 250 || g.subsistence === "forage" || g.subsistence === "pastoral") return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u3067\u306F\u5EFA\u8A2D\u3067\u304D\u306A\u3044" };
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
      candidates(ctx, st, e) {
        const out = [];
        for (const g of e.gs) for (const o of neighborGroups(ctx, g)) {
          const t = ctx.civ.groups[o];
          if (t && !t.stateId && !t.player && t.pop < st.pop) out.push(cand("annex_group", { expansion: 0.45, prosperity: 0.1 }, { target: o }));
        }
        const seen = /* @__PURE__ */ new Set();
        return out.filter((c) => !seen.has(c.target) && seen.add(c.target)).slice(0, 3);
      },
      execute(ctx, st, c) {
        const t = ctx.civ.groups[c.target];
        if (!t || t.stateId || t.player) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u7DE8\u5165\u3067\u304D\u306A\u3044" };
        if (!spend(st, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        t.stateId = st.id;
        return { ok: true, effects: [{ targetId: t.id, property: "stateId", before: null, after: st.id }], targetId: t.id, title: "\u5468\u8FBA\u306E\u96C6\u56E3\u3092\u7DE8\u5165" };
      }
    },
    {
      key: "move_capital",
      domain: "city",
      label: "\u9077\u90FD",
      enabled: true,
      candidates(ctx, st, e) {
        const cap = ctx.civ.groups[st.capitalGroupId], big = e.gs.reduce((a, b) => b.pop > (a?.pop ?? 0) ? b : a, null);
        return big && cap && big.id !== cap.id && big.pop > cap.pop * 2 ? [cand("move_capital", { stability: 0.2, prestige: 0.15 }, { target: big.id })] : [];
      },
      execute(ctx, st, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st.id) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u56FD\u5185\u306B\u306A\u3044" };
        const ef = [];
        eff(ef, st, "capitalGroupId", st.capitalGroupId, g.id);
        st.capitalGroupId = g.id;
        return { ok: true, effects: ef, targetId: g.id };
      }
    },
    {
      key: "reconcile",
      domain: "peace",
      label: "\u548C\u89E3",
      enabled: true,
      candidates(ctx, st, e) {
        return e.nbs.filter((n) => !n.atWar && n.rel < -20 && st.treasury >= 15).map((n) => cand("reconcile", { security: 0.3 + 0.3 * grievance(ctx.civ, st, n.st.id), prestige: 0.1 }, { target: n.st.id }));
      },
      execute(ctx, st, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st, 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        adjustRel(st, t, 25);
        return { ok: true, effects: [], targetId: t.id, title: "\u548C\u89E3\u306E\u4F7F\u7BC0" };
      }
    },
    // 後続マイルストーンで有効にする行動（登録だけして、候補は出さない）
    {
      key: "disaster_relief",
      domain: "disaster",
      label: "\u707D\u5BB3\u6551\u6E08",
      enabled: true,
      candidates(ctx, st, e) {
        const load = recentDisasterLoad(ctx.civ, st, 18);
        if (load <= 0) return [];
        return st.treasury >= 30 ? [cand("disaster_relief", { stability: 0.6 * load + 0.2, prosperity: 0.3 * load, culture: 0.1 }, {})] : [bad("disaster_relief", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st) {
        if (!spend(st, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        let n = 0;
        for (const g of byState(ctx).get(st.id) ?? []) if (g.capUntil > ctx.civ.monthIndex && g.capMult < 1) {
          g.capMult = Math.min(1, Math.round((g.capMult + 0.2) * 1e3) / 1e3);
          for (const c of g.cohorts) c.tension *= 0.85;
          n++;
        }
        eff(ef, st, "stability", st.stability, Math.min(1, st.stability + 0.02 + 0.01 * Math.min(n, 3)));
        st.stability = Math.min(1, st.stability + 0.02 + 0.01 * Math.min(n, 3));
        return { ok: true, effects: ef, title: `\u707D\u5BB3\u306E\u6551\u6E08\uFF08${n}\u96C6\u56E3\uFF09` };
      }
    },
    {
      key: "build_granary",
      domain: "disaster",
      label: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st) {
        const mem = disasterMemory(ctx.civ, st);
        if ((st.resilience ?? 0) >= 0.5) return [bad("build_granary", "\u6574\u5099\u6E08\u307F")];
        if (st.treasury < 40) return [bad("build_granary", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        return [cand("build_granary", { stability: 0.9 * Math.min(1, mem), security: 0.4 * Math.min(1, mem), prosperity: 0.1 * Math.min(1, mem) }, {})];
      },
      // 過去の災害の記憶が強い国ほど備える
      execute(ctx, st) {
        if ((st.resilience ?? 0) >= 0.5) return { ok: false, error: "\u6574\u5099\u6E08\u307F" };
        if (!spend(st, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [], b = st.resilience ?? 0;
        st.resilience = Math.round(Math.min(0.5, b + 0.1) * 1e3) / 1e3;
        eff(ef, st, "resilience", b, st.resilience);
        return { ok: true, effects: ef, title: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099" };
      }
    },
    { key: "magic_institution", domain: "magic", label: "\u9B54\u6CD5\u5236\u5EA6", enabled: true, candidates: (ctx, st, e) => ctx.civ.options.magic === false ? [] : institutionCandidates(ctx, st, e, cand, bad), execute: (ctx, st, c) => institutionExecute(ctx, st, c) },
    { key: "nuclear_program", domain: "nuclear", label: "\u6838\u8A08\u753B", enabled: false, disabledReason: "\u6838\u306F\u6280\u8853\u300C\u6838\u300D\u306E\u63A1\u7528\u5F8C\uFF08\u5F8C\u7D9A\uFF09", candidates: () => [], execute: () => ({ ok: false, error: "\u672A\u5B9F\u88C5" }) }
  ];
  var ACTION = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));
  function registerAction(def) {
    if (ACTION[def.key]) return;
    ACTIONS.push(def);
    ACTION[def.key] = def;
  }
  function runAction(ctx, st, def, c, { decisionId = null, provenance = "ai" } = {}) {
    const cc = { ...c, decisionId, provenance }, r = def.execute(ctx, st, cc), { civ: civ3, ids } = ctx;
    if (!r.ok) {
      if (r.diplomacyFailure) {
        const ev = makeEvent(civ3, ids, { kind: "diplomacy_failed", title: `${st.name}\u306E\u300C${def.label}\u300D\u306F\u4E0D\u6210\u7ACB\uFF08${r.error}\uFF09`, participants: [{ entityId: st.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: null, effects: [], decisionId, provenance });
        return { ok: false, error: r.error, eventIds: [ev.eventId] };
      }
      return { ok: false, error: r.error, eventIds: [] };
    }
    let eventId = civ3.events.length ? civ3.events[civ3.events.length - 1].eventId : null;
    if (!r.silent) {
      const ev = makeEvent(civ3, ids, { kind: "state_action", title: `${st.name}: ${r.title ?? def.label}`, participants: [{ entityId: st.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: civ3.groups[st.capitalGroupId] ? { cell: civ3.groups[st.capitalGroupId].cell } : null, effects: r.effects ?? [], decisionId, provenance });
      eventId = ev.eventId;
    }
    return { ok: true, eventIds: [eventId], warId: r.warId ?? null };
  }
  function findCandidate(ctx, st, def, { target = null, opt = null }) {
    const e = observe(ctx, st), list = def.key === "declare_war" ? [cand("declare_war", {}, { target })] : def.candidates(ctx, st, e);
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
  var intern = (civ3, str) => {
    if (!str) return null;
    const r = civ3.dict.reasons;
    let i = r.indexOf(str);
    if (i < 0) {
      i = r.length;
      r.push(str);
    }
    return i;
  };
  var packCand = (civ3, c, total) => [c.key, c.target ?? null, c.opt ?? null, total === null || total === -Infinity ? null : total, intern(civ3, c.reason), c.eligible && Object.keys(c.factors ?? {}).length ? FACTORS.map((f) => Math.round((c.factors[f] ?? 0) * 100) / 100) : 0];
  var expandDecision = (civ3, d) => ({ ...d, candidates: d.candidates.map(([key, target, opt, total, r, f]) => ({ key, target, opt, total, eligible: total !== null, reason: r === null ? null : civ3.dict.reasons[r], factors: f ? Object.fromEntries(FACTORS.map((n, i) => [n, f[i]]).filter(([, v]) => v)) : {} })) });
  var clamp6 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var round = (x) => Math.round(x * 1e3) / 1e3;
  function record(ctx, st, d) {
    const { civ: civ3, ids } = ctx, id = ids.next("decision");
    civ3.decisions.push({ decisionId: id, date: { ...civ3.date }, actorId: st.id, provenance: d.provenance ?? "ai", layer: d.layer, type: d.type, observations: d.obs, strategy: st.strategy ? st.strategy.goal : null, candidates: d.candidates.map(([c, total]) => Array.isArray(c) ? c : packCand(civ3, c, total)), chosen: d.chosen, result: null });
    return civ3.decisions[civ3.decisions.length - 1];
  }
  var obsOf = (st, e) => ({ pop: Math.round(st.pop), treasury: Math.round(st.treasury), stability: round(st.stability), army: Math.round(st.army), strength: Math.round(e.my), atWar: e.atWar, neighbors: e.nbs.length, tension: round(e.tension), threat: round(e.threat), campaign: st.campaign ? `${st.campaign.kind}:${st.campaign.stage}` : null });
  function totalOf(st, c, crisis) {
    const goalF = st.strategy ? GOALS[st.strategy.goal] : null;
    let t = 0;
    for (const [f, v] of Object.entries(c.factors)) {
      let w = st.personality[f] ?? 1;
      if (f === goalF) w *= 1.5;
      if (crisis && (f === "stability" || f === "security")) w *= 2;
      t += w * v;
    }
    return round(t);
  }
  var view = (c, total) => [c, total];
  function chooseStrategy(ctx, st, e) {
    const needs = { expand: 0.25 + 0.4 * clamp6((e.my + 1) / (e.nbs.reduce((s, n) => s + n.strength, 0) / Math.max(1, e.nbs.length) + 1) - 1, 0, 2) * 0.5, prosper: e.treasuryNeed, secure: e.threat, advance: e.techLag, consolidate: 1 - st.stability };
    const list = Object.entries(needs).map(([goal, n]) => ({ goal, total: round(n * st.personality[GOALS[goal]]) })).sort((a, b) => b.total - a.total || (a.goal < b.goal ? -1 : 1));
    const d = record(ctx, st, { layer: "strategy", type: "set_strategy", obs: obsOf(st, e), candidates: list.map((x) => view({ key: x.goal, target: null, opt: null, eligible: true, reason: null, factors: {} }, x.total)), chosen: { key: list[0].goal, target: null, opt: null } });
    const changed = st.strategy?.goal !== list[0].goal;
    st.strategy = { goal: list[0].goal, since: ctx.civ.monthIndex };
    d.result = { ok: true, error: null, eventIds: [], changed };
  }
  function planCampaign(ctx, st, e) {
    const { civ: civ3 } = ctx, c = st.campaign, t = civ3.states[c.target];
    let key = "wait", why2 = null;
    if (!t?.alive) {
      key = "abandon";
      why2 = "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044";
    } else if (civ3.monthIndex > c.deadline && c.stage === "prepare") {
      key = "abandon";
      why2 = "\u671F\u9650\u5207\u308C";
    } else if (st.stability < 0.3) {
      key = "abandon";
      why2 = "\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A";
    } else if (c.stage === "prepare") {
      const fc = ctx.warForecast?.(st, t), ratio = fc ? fc.ratio : (e.my + 1) / (strength(civ3, t) + 1);
      if (st.policy.mobilization < 0.1) key = "mobilize";
      else if (ratio >= 1.2 || civ3.monthIndex - c.startedAt >= 12) {
        key = ratio >= 1 && (!fc || fc.pAWin >= 0.4) ? "declare_war" : "abandon";
        if (key === "abandon") why2 = "\u6226\u529B\u304C\u898B\u5408\u308F\u306A\u3044";
      }
    } else if (c.stage === "war" && !(c.warId && civ3.wars[c.warId]?.status === "active")) {
      key = "abandon";
      why2 = "\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F";
    }
    const cands = ["declare_war", "mobilize", "wait", "abandon"].map((k) => view({ key: k, target: c.target, opt: null, eligible: true, reason: k === key ? why2 : null, factors: {} }, k === key ? 1 : 0));
    return { layer: "campaign", type: `campaign_${key}`, obs: obsOf(st, e), candidates: cands, chosen: { key, target: c.target, opt: null }, reason: why2 };
  }
  function stepAIPlan(ctx) {
    const { civ: civ3 } = ctx, mi = civ3.monthIndex, every = civ3.options.aiInterval;
    ctx.plans = [];
    for (const id in civ3.states) {
      const st = civ3.states[id];
      if (!st.alive || st.player) continue;
      if ((hashSeed(id) + mi) % every !== 0) continue;
      const e = observe(ctx, st);
      if (!st.strategy || mi - st.strategy.since >= STRATEGY_EVERY) chooseStrategy(ctx, st, e);
      if (st.campaign) {
        const p = planCampaign(ctx, st, e), d2 = record(ctx, st, p);
        ctx.plans.push({ st, d: d2, campaign: p.chosen.key, why: p.reason });
        continue;
      }
      const crisis = st.stability < 0.35 || st.warIds.some((w) => {
        const wr = civ3.wars[w];
        return (wr.sides.a.includes(st.id) ? wr.score : -wr.score) < -40;
      }) || st.treasury < 0;
      const all = [];
      for (const def of ACTIONS) if (def.enabled) for (const c of def.candidates(ctx, st, e)) all.push({ def, c, total: c.eligible ? totalOf(st, c, crisis) : -Infinity });
      all.sort((a, b) => b.total - a.total || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : String(a.c.target) < String(b.c.target) ? -1 : 1));
      const best = all.find((x) => x.total > BASELINE), shown = all.slice(0, best ? SHOWN : SHOWN_IDLE).map((x) => view(x.c, x.total === -Infinity ? null : x.total));
      if (!best) shown.push(view({ key: "do_nothing", target: null, opt: null, eligible: true, reason: "\u57FA\u6E96\u5024\uFF080.15\uFF09\u3092\u8D85\u3048\u308B\u5019\u88DC\u304C\u306A\u3044", factors: {} }, BASELINE));
      const d = record(ctx, st, { layer: crisis ? "crisis" : "routine", type: best ? best.c.key : "do_nothing", obs: obsOf(st, e), candidates: shown, chosen: best ? { key: best.c.key, target: best.c.target, opt: best.c.opt } : { key: "do_nothing", target: null, opt: null } });
      if (best) ctx.plans.push({ st, d, def: best.def, c: best.c });
      else d.result = { ok: true, error: null, eventIds: [], idle: true };
    }
  }
  function stepAIApply(ctx) {
    const { civ: civ3 } = ctx;
    for (const p of ctx.plans ?? []) {
      const { st, d } = p;
      if (!st.alive) {
        d.result = { ok: false, error: "\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u306A\u3044", eventIds: [] };
        continue;
      }
      if (p.campaign) {
        const c = st.campaign;
        if (!c) {
          d.result = { ok: false, error: "\u8A08\u753B\u304C\u65E2\u306B\u7121\u3044", eventIds: [] };
          continue;
        }
        if (p.campaign === "mobilize") {
          const r4 = runAction(ctx, st, ACTION.set_mobilization, { key: "set_mobilization", opt: "0.15", target: null, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
        } else if (p.campaign === "declare_war") {
          const r4 = runAction(ctx, st, ACTION.declare_war, { key: "declare_war", target: c.target, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
          if (!r4.ok) st.campaign = null;
        } else if (p.campaign === "abandon") {
          st.campaign = null;
          const ev = makeEvent(civ3, ctx.ids, { kind: "campaign_abandoned", title: `${st.name}\u304C\u5F81\u670D\u8A08\u753B\u3092\u65AD\u5FF5\u3057\u305F\uFF08${p.why}\uFF09`, participants: [{ entityId: st.id, role: "state" }, { entityId: c.target, role: "target" }], location: null, decisionId: d.decisionId });
          d.result = { ok: true, error: null, eventIds: [ev.eventId] };
        } else d.result = { ok: true, error: null, eventIds: [], waited: true };
        continue;
      }
      const r = runAction(ctx, st, p.def, p.c, { decisionId: d.decisionId });
      d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    }
    ctx.plans = [];
  }
  function runPlayerAction(ctx, st, def, c) {
    const e = observe(ctx, st), d = record(ctx, st, { layer: "player", provenance: "player", type: c.key, obs: obsOf(st, e), candidates: [view(c, 0)], chosen: { key: c.key, target: c.target, opt: c.opt } });
    const r = runAction(ctx, st, def, c, { decisionId: d.decisionId, provenance: "player" });
    d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    return r;
  }

  // js/core/civ/civ-sim.js
  init_history();
  init_magic();
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
        const st = formState(ctx, { ...f, player: true });
        return st ? { ok: true, stateId: st.id } : fail("\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
      }
      case "stateAction": {
        const st = civ3.states[cmd.stateId];
        if (!st?.alive) return fail("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
        if (!st.player) return fail("\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u56FD\u5BB6\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
        const def = ACTION[cmd.action];
        if (!def) return fail("\u672A\u77E5\u306E\u884C\u52D5\u3067\u3059");
        if (!def.enabled) return fail(`\u3053\u306E\u884C\u52D5\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093\uFF08${def.disabledReason}\uFF09`);
        const c = findCandidate(ctx, st, def, { target: cmd.target ?? null, opt: cmd.opt ?? null });
        if (!c) return fail("\u305D\u306E\u5BFE\u8C61\u30FB\u5185\u5BB9\u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093");
        if (!c.eligible) return fail(c.reason ?? "\u6761\u4EF6\u3092\u6E80\u305F\u3057\u3066\u3044\u307E\u305B\u3093");
        const r = runPlayerAction(ctx, st, def, c);
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
    ticker.register("culture", stepMagic, "stepMagic");
    ticker.register("tech", stepTech, "stepTech");
    ticker.register("ai_plan", stepAIPlan, "stepAIPlan");
    ticker.register("apply", stepAIApply, "stepAIApply");
    ticker.register("conflict", stepStates, "stepStates");
    ticker.register("conflict", stepWars, "stepWars");
    ticker.register("conflict", stepInterpretation, "stepInterpretation");
    ticker.register("integrity", (ctx2) => {
      const full = ctx2.civ.monthIndex % 120 === 0, errs = checkCivIntegrity(ctx2.world, ctx2.civ, { sinceEvent: full ? 0 : ctx2.eventsChecked ?? 0, structure: full || ctx2.civ.monthIndex % 12 === 0 });
      ctx2.eventsChecked = ctx2.civ.events.length;
      if (errs.length) throw new Error("\u6587\u660E\u72B6\u614B\u306E\u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkIntegrity");
    ticker.register("integrity", (ctx2) => recordMonth(ctx2), "recordMonth");
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
        const st = g.stateId ? civ3.states[g.stateId] : null;
        return st ? (st.boostUntil > civ3.monthIndex ? 1.2 : 1) * (1 - 0.4 * st.policy.mobilization) : 1;
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
      advanceMonths(n, onProgress) {
        for (let i = 0; i < n; i++) {
          ticker.runMonth(ctx);
          if (onProgress && i % 120 === 119) onProgress(i + 1, n);
        }
        return civ3.date;
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
    const errs = [], N = world.mesh.cellCount;
    let players = 0;
    if (structure) for (const id of sortedGroupIds(civ3)) {
      const g = civ3.groups[id];
      if (g.id !== id) errs.push(`\u96C6\u56E3ID\u306E\u4E0D\u4E00\u81F4 ${id}`);
      if (!Number.isFinite(g.pop) || g.pop < 0) errs.push(`\u4EBA\u53E3\u304C\u4E0D\u6B63 ${id}`);
      if (!(g.cell >= 0 && g.cell < N) || world.cell.landWater[g.cell] !== 1) errs.push(`\u96C6\u56E3 ${id} \u304C\u9678\u306B\u3044\u306A\u3044`);
      if (g.player) players++;
      if (g.settlementId && civ3.settlements[g.settlementId]?.groupId !== id) errs.push(`\u96C6\u843D\u306E\u76F8\u4E92\u53C2\u7167\u304C\u58CA\u308C\u3066\u3044\u308B ${id}`);
    }
    if (players > 1) errs.push("\u30D7\u30EC\u30A4\u30E4\u30FC\u96C6\u56E3\u304C\u8907\u6570\u3042\u308B");
    let ps = 0;
    for (const id in civ3.states) {
      const st = civ3.states[id];
      if (!st.alive) continue;
      if (st.player) ps++;
      if (!civ3.groups[st.capitalGroupId] && civ3.monthIndex % 3 !== 1) errs.push(`\u56FD\u5BB6 ${id} \u306E\u9996\u90FD\u96C6\u56E3\u304C\u7121\u3044`);
      for (const w of st.warIds) if (civ3.wars[w]?.status !== "active") errs.push(`\u56FD\u5BB6 ${id} \u306E\u6226\u4E89\u53C2\u7167\u304C\u4E0D\u6B63 ${w}`);
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
      for (const g of Object.values(civ3.groups)) if (g.parent && !civ3.groups[g.parent] && !known.has(g.parent)) errs.push(`\u89AA\u306E\u96C6\u56E3 ${g.parent} \u304C\u5C65\u6B74\u306B\u306A\u3044`);
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
    fatigue: { ja: "\u75B2\u52B4\u5EA6", mode: "add", min: 0, max: 1, half: 12, eps: 2e-3, nominal: (c, s) => s.politics?.fatigue }
  });
  var FIELD_KEYS = Object.freeze(Object.keys(FIELDS));
  var nominalOf = (civ3, st, key) => {
    const f = FIELDS[key];
    return f ? f.nominal(civ3, st) : void 0;
  };
  function effective(civ3, st, key) {
    const f = FIELDS[key];
    if (!f) return 0;
    const base = f.nominal(civ3, st);
    if (base === void 0 || base === null) return 0;
    const A2 = civ3.wcde?.adjust?.[st.id];
    let b = base, touched = false;
    if (key === "perCapita" && A2?.industry) {
      const ni = st.econ?.industry;
      if (ni > 0) {
        b = base * (effective(civ3, st, "industry") / ni);
        touched = true;
      }
    }
    const adj = A2?.[key];
    if (adj == null && !touched) return base;
    const v = b * (1 + (adj?.mul ?? 0)) + (adj?.add ?? 0);
    return v < f.min ? f.min : v > f.max ? f.max : v;
  }

  // js/core/wcde/domains/economy.js
  var SUBS = { forage: 0.5, fishing: 0.85, pastoral: 0.8, agriculture: 1 };
  var STAGE = { village: 1, town: 1.4, city: 2 };
  var TECH_PROD = [["irrigation", 0.12], ["plow", 0.15], ["crop_rotation", 0.15], ["bronze", 0.06], ["iron", 0.08], ["steel", 0.1], ["coinage", 0.08], ["banking", 0.1], ["industry", 0.5], ["electricity", 0.5]];
  var TRADE_K = 8e-5;
  var ECON_PERIOD = 3;
  var adopted = (st, k) => st.techAdopted?.[k] != null;
  function computeProduction(ctx, st, groups) {
    const { world, civ: civ3 } = ctx, ce = world.cell;
    let pop = 0, output = 0, foodNum = 0, foodDen = 0;
    const techMult = 1 + TECH_PROD.reduce((s, [k, v]) => s + (adopted(st, k) ? v : 0), 0), invest = 1 + (st.econ?.investment ?? 0);
    for (const g of groups) {
      const stage = g.settlementId ? STAGE[civ3.settlements[g.settlementId]?.stage] ?? 1 : 1;
      let fert = 0;
      const cells = g.cells ?? [g.cell];
      for (const c of cells) fert += ce.fertility[c];
      fert /= cells.length;
      const out = g.pop * (SUBS[g.subsistence] ?? 0.5) * stage * (0.7 + 0.6 * fert) * techMult * invest;
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
    for (const st of alive) {
      const gs = by.get(st.id) ?? [], p = computeProduction(ctx, st, gs), e = st.econ ?? (st.econ = { investment: 0, routes: {}, trade: {}, tradeIncome: 0, techBoost: 0 });
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
        const open = war || sanc ? 0 : 1 + (treaty ? 1 : 0) + (adopted(a, "seafaring") && adopted(b, "seafaring") ? 0.3 : 0) + (adopted(a, "coinage") && adopted(b, "coinage") ? 0.4 : 0);
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
    for (const st of alive) {
      const e = st.econ, inc = gain.get(st.id) ?? 0;
      e.tradeIncome = inc;
      st.treasury += effective(civ3, st, "tradeIncome");
      e.techBoost = Math.min(0.3, 0.05 * Math.log1p(effective(civ3, st, "tradeIncome") * 4) + (adopted(st, "record_keeping") ? 0.04 : 0) + (adopted(st, "writing") ? 0.06 : 0) + (adopted(st, "administration") ? 0.05 : 0));
      if (e.foodBalance < 0.8) st.stability = Math.max(0, st.stability - (0.8 - e.foodBalance) * 0.05);
    }
  }

  // js/core/wcde/domains/politics.js
  init_spatial();
  init_events();
  init_civ_state();
  init_species();
  var FACTIONS = Object.freeze({ nobility: "\u8CB4\u65CF\u30FB\u6709\u529B\u8005", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846" });
  var POLITICS_PERIOD = 3;
  var INFLUENCE = Object.freeze({
    tribal: { nobility: 0.3, clergy: 0.15, merchants: 0.05, military: 0.3, commoners: 0.2 },
    chiefdom: { nobility: 0.3, clergy: 0.15, merchants: 0.1, military: 0.3, commoners: 0.15 },
    theocracy: { nobility: 0.15, clergy: 0.45, merchants: 0.1, military: 0.15, commoners: 0.15 },
    kingdom: { nobility: 0.35, clergy: 0.15, merchants: 0.1, military: 0.25, commoners: 0.15 },
    empire: { nobility: 0.3, clergy: 0.1, merchants: 0.1, military: 0.35, commoners: 0.15 },
    republic: { nobility: 0.15, clergy: 0.1, merchants: 0.3, military: 0.1, commoners: 0.35 }
  });
  var ASSEMBLY = Object.freeze({ tribal: "\u9577\u8001\u4F1A", chiefdom: null, theocracy: "\u8056\u8077\u8005\u4F1A\u8B70", kingdom: null, empire: null, republic: "\u5E02\u6C11\u8B70\u4F1A" });
  var infl = (polity) => INFLUENCE[polity] ?? INFLUENCE.tribal;
  var clamp7 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var adopted2 = (st, k) => st.techAdopted?.[k] != null;
  function recomputeLegitimacy(P) {
    let l = 0;
    for (const k of Object.keys(FACTIONS)) l += (P.factions[k].influence ?? 0) * P.factions[k].support;
    P.legitimacy = l;
    return l;
  }
  function initPolitics(st) {
    const f = {};
    for (const k of Object.keys(FACTIONS)) f[k] = { support: 0.55 };
    return { factions: f, assembly: ASSEMBLY[st.polity] ?? (adopted2(st, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null), legitimacy: 0.55, fatigue: 0, taxCeiling: 0.4, lastRegimeChange: -999 };
  }
  function supportTargets(ctx, st) {
    const { civ: civ3 } = ctx, e = st.econ ?? {}, p = st.policy, war = st.warIds.length > 0, trade = Object.values(e.trade ?? {}).reduce((a, b) => a + b, 0), perCap = e.perCapita ?? 0.6;
    const fat = effective(civ3, st, "fatigue");
    return {
      commoners: clamp7(0.35 + 0.5 * st.stability + 0.25 * (e.foodBalance ?? 1) - 0.8 * p.tax - 0.4 * fat - 0.25 * p.mobilization),
      merchants: clamp7(0.35 + 0.25 * Math.min(1, trade * 2) + 0.15 * (adopted2(st, "coinage") ? 1 : 0) + 0.15 * (1 - p.tax * 2) - (war ? 0.15 : 0)),
      clergy: clamp7(0.3 + (st.polity === "theocracy" ? 0.35 : 0) + 0.2 * (1 - p.assimilation) + 0.15 * p.tolerance + (st.magic ? 0.1 : 0)),
      military: clamp7(0.35 + 0.4 * p.mobilization + (war ? 0.15 : 0) + 0.15 * (st.treasury > 0 ? 1 : 0) - 0.3 * fat),
      nobility: clamp7(0.4 + 0.25 * (1 - p.tax) + 0.2 * st.stability + (adopted2(st, "bureaucracy") ? -0.2 : 0) + 0.1 * p.autonomy)
    };
  }
  function stepPolitics(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % POLITICS_PERIOD !== 0) return;
    for (const st of Object.values(civ3.states)) {
      if (!st.alive) continue;
      const P = st.politics ?? (st.politics = initPolitics(st));
      P.fatigue = clamp7(P.fatigue + (st.warIds.length ? 0.025 * st.warIds.length : -0.02));
      const tgt = supportTargets(ctx, st), w = infl(st.polity);
      let leg = 0;
      for (const k of Object.keys(FACTIONS)) {
        const f = P.factions[k];
        f.support = clamp7(f.support + (tgt[k] - f.support) * 0.25);
        f.influence = w[k];
        leg += f.influence * f.support;
      }
      P.legitimacy = leg;
      const legE = effective(civ3, st, "legitimacy");
      P.assembly = ASSEMBLY[st.polity] ?? (adopted2(st, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null);
      P.taxCeiling = Math.round((0.15 + 0.5 * legE) * 1e3) / 1e3;
      st.stability = clamp7(st.stability + (legE - 0.5) * 0.04);
      if (st.policy.tax > P.taxCeiling) st.policy.tax = Math.round(P.taxCeiling * 1e3) / 1e3;
      if (legE < 0.3 && mi - P.lastRegimeChange > 120 && hashSeed(st.id, mi) % 1e3 / 1e3 < 0.1 * (0.3 - legE) / 0.3 + 0.02) regimeChange(ctx, st);
    }
  }
  function regimeChange(ctx, st) {
    const { civ: civ3, ids } = ctx, P = st.politics, mi = civ3.monthIndex, f = P.factions, who = f.commoners.support <= f.military.support ? "commoners" : "military";
    const before = st.polity, to = who === "commoners" && (st.polity === "kingdom" || st.polity === "empire" || st.polity === "chiefdom") ? "republic" : st.polity;
    const causes = [];
    const war = civ3.events.slice(-60).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended") && e.participants.some((p) => p.entityId === st.id));
    if (war) causes.push({ targetId: war.id, relation: "caused_by", basis: "plausible" });
    st.polity = to;
    P.lastRegimeChange = mi;
    st.stability = clamp7(st.stability - 0.25);
    P.fatigue = Math.max(0, P.fatigue - 0.3);
    for (const k of Object.keys(f)) f[k].support = clamp7(f[k].support + 0.15);
    makeEvent(civ3, ids, { kind: "regime_change", title: `${st.name}\u3067\u653F\u5909\u304C\u8D77\u304D\u305F\uFF08${who === "commoners" ? "\u6C11\u8846\u306E\u96E2\u53CD" : "\u8ECD\u306E\u96E2\u53CD"}${before !== to ? "\u30FB\u653F\u4F53\u304C\u5909\u308F\u3063\u305F" : ""}\uFF09`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "polity", before, after: to }, { targetId: st.id, property: "stability", before: null, after: Math.round(st.stability * 100) / 100 }], causes, provenance: "simulation" });
    st.leader = { name: ctx.nameGen?.person(civ3, civ3.groups[st.capitalGroupId], ctx.rng) ?? `${st.name}\u306E\u65B0\u6307\u5C0E\u8005`, bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ3, { capitalGroupId: st.capitalGroupId })), heir: false, deposed: true };
  }

  // js/core/wcde/domains/military.js
  init_spatial();
  init_events();
  var clamp8 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var has = (st, k) => st.techAdopted?.[k] != null;
  var UNIT_KINDS = Object.freeze({
    infantry: { ja: "\u6B69\u5175", need: () => true },
    ranged: { ja: "\u5F13\u30FB\u6295\u5C04\u5175", need: (st) => has(st, "bronze_weapons") },
    cavalry: { ja: "\u9A0E\u5175", need: (st) => has(st, "horse_riding") || has(st, "cavalry") },
    navy: { ja: "\u6C34\u8ECD", need: (st, ctx) => has(st, "shipbuilding") && coastal(ctx, st) },
    garrison: { ja: "\u5B88\u5099\u5175", need: (st) => has(st, "fortification") },
    firearms: { ja: "\u9283\u5175", need: (st) => has(st, "gunpowder") }
  });
  var coastal = (ctx, st) => (byState(ctx).get(st.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);
  var shareOf = (ctx, st) => {
    const gs = byState(ctx).get(st.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, w = {};
    for (const [k, def] of Object.entries(UNIT_KINDS)) if (def.need(st, ctx)) w[k] = k === "infantry" ? 1 : k === "ranged" ? 0.25 : k === "cavalry" ? 0.2 + 0.5 * pastoral : k === "navy" ? 0.15 : k === "garrison" ? 0.1 : 0.4;
    if (w.firearms) {
      delete w.ranged;
    }
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) w[k] /= tot;
    return w;
  };
  var D2 = (id, ja, tier, prereq, tech, cost, off, def, polity = null) => ({ id, ja, tier, prereq, tech, cost, off, def, polity });
  var DOCTRINES = Object.freeze([
    D2("levy_drill", "\u5FB4\u96C6\u5175\u306E\u8A13\u7DF4", 1, [], [], 20, 0.03, 0.02),
    D2("shield_wall", "\u76FE\u306E\u58C1", 1, [], [], 25, 0, 0.06),
    D2("skirmish", "\u6563\u5175\u6226", 1, [], [], 25, 0.04, 0),
    D2("ranged_volley", "\u6589\u5C04", 2, ["skirmish"], ["bronze_weapons"], 50, 0.05, 0),
    D2("spear_phalanx", "\u5BC6\u96C6\u69CD\u9663", 2, ["shield_wall"], ["bronze_weapons"], 55, 0.04, 0.05),
    D2("scout_screen", "\u65A5\u5019\u7DB2", 1, [], [], 20, 0.02, 0.02),
    D2("fortified_camp", "\u91CE\u55B6\u7BC9\u57CE", 2, ["shield_wall"], ["fortification"], 60, 0, 0.08),
    D2("mounted_charge", "\u9A0E\u5175\u7A81\u6483", 2, ["skirmish"], ["horse_riding"], 70, 0.07, 0),
    D2("horse_archery", "\u9A0E\u5C04", 3, ["mounted_charge", "ranged_volley"], ["horse_riding"], 100, 0.06, 0),
    D2("heavy_infantry", "\u91CD\u88C5\u6B69\u5175", 3, ["spear_phalanx"], ["iron_weapons"], 110, 0.06, 0.04),
    D2("siege_craft", "\u653B\u57CE\u8853", 3, ["fortified_camp"], ["construction", "iron_weapons"], 120, 0.05, 0),
    D2("combined_arms", "\u8AF8\u5175\u79D1\u9023\u5408", 4, ["heavy_infantry", "mounted_charge"], [], 180, 0.07, 0.03),
    D2("supply_train", "\u88DC\u7D66\u7DDA\u306E\u6574\u5099", 2, ["scout_screen"], ["construction"], 70, 0.03, 0.03),
    D2("naval_marines", "\u6D77\u5175", 3, ["scout_screen"], ["shipbuilding"], 110, 0.05, 0.02),
    D2("coast_defense", "\u6CBF\u5CB8\u9632\u885B", 3, ["fortified_camp"], ["shipbuilding"], 100, 0, 0.07),
    D2("standing_army", "\u5E38\u5099\u8ECD", 4, ["levy_drill", "supply_train"], ["administration"], 200, 0.06, 0.04),
    D2("officer_corps", "\u5C06\u6821\u56E3", 4, ["standing_army"], ["writing"], 220, 0.05, 0.03),
    D2("gun_line", "\u7DDA\u5F62\u6226\u5217", 5, ["combined_arms"], ["gunpowder"], 300, 0.09, 0.03),
    D2("bastion_forts", "\u7A1C\u5821\u5F0F\u7BC9\u57CE", 5, ["siege_craft", "supply_train"], ["gunpowder"], 320, 0, 0.1),
    D2("general_staff", "\u53C2\u8B00\u7D44\u7E54", 5, ["officer_corps"], ["mathematics"], 350, 0.06, 0.04),
    // 政体固有
    D2("raid_tactics", "\u8972\u6483\u6226\u8853", 1, [], [], 25, 0.05, 0, "tribal"),
    D2("warband_bond", "\u6226\u58EB\u56E3\u306E\u7D46", 2, ["raid_tactics"], [], 45, 0.05, 0.02, "tribal"),
    D2("sworn_retinue", "\u8A93\u7D04\u306E\u8FD1\u4F8D", 2, [], [], 50, 0.04, 0.03, "chiefdom"),
    D2("holy_war", "\u8056\u6226\u306E\u6559\u3048", 2, [], [], 60, 0.07, 0, "theocracy"),
    D2("temple_guard", "\u795E\u6BBF\u5B88\u8B77", 3, ["holy_war"], ["construction"], 90, 0.02, 0.08, "theocracy"),
    D2("feudal_levy", "\u5C01\u5EFA\u8ECD\u5F79", 2, [], [], 55, 0.05, 0.03, "kingdom"),
    D2("knight_order", "\u9A0E\u58EB\u56E3", 3, ["feudal_levy"], ["horse_riding"], 120, 0.08, 0.02, "kingdom"),
    D2("legion_system", "\u8ECD\u56E3\u5236", 3, [], ["iron_weapons"], 130, 0.07, 0.05, "empire"),
    D2("citizen_militia", "\u5E02\u6C11\u7686\u5175", 2, [], [], 55, 0.02, 0.07, "republic"),
    D2("naval_league", "\u6D77\u4E0A\u540C\u76DF", 3, [], ["shipbuilding"], 110, 0.05, 0.05, "republic")
  ]);
  var DOCTRINE = Object.freeze(Object.fromEntries(DOCTRINES.map((d) => [d.id, d])));
  var OFF_CAP = 0.25;
  var DEF_CAP = 0.4;
  var initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, shares: null });
  function canAdopt(st, id) {
    const d = DOCTRINE[id];
    if (!d) return { ok: false, reason: "\u305D\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u306F\u3042\u308A\u307E\u305B\u3093" };
    const M = st.military;
    if (M?.doctrine.taken[id] != null) return { ok: false, reason: "\u3059\u3067\u306B\u53D6\u5F97\u6E08\u307F" };
    if (d.polity && d.polity !== st.polity) return { ok: false, reason: `${d.ja}\u306F\u653F\u4F53\u300C${d.polity}\u300D\u56FA\u6709` };
    for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `\u524D\u63D0\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u300C${DOCTRINE[p].ja}\u300D\u304C\u672A\u53D6\u5F97` };
    for (const t of d.tech) if (!has(st, t)) return { ok: false, reason: `\u6280\u8853\u300C${t}\u300D\u304C\u5FC5\u8981` };
    if (st.treasury < d.cost) return { ok: false, reason: `\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044\uFF08${d.cost}\uFF09` };
    return { ok: true };
  }
  function adoptDoctrine(ctx, st, id, { provenance = "simulation", decisionId = null } = {}) {
    const c = canAdopt(st, id);
    if (!c.ok) return c;
    const { civ: civ3, ids } = ctx, d = DOCTRINE[id];
    const M = st.military ?? (st.military = initMilitary());
    st.treasury -= d.cost;
    M.doctrine.taken[id] = civ3.monthIndex;
    const ev = makeEvent(civ3, ids, { kind: "doctrine_adopted", title: `${st.name}\u304C\u300C${d.ja}\u300D\u3092\u53D6\u308A\u5165\u308C\u305F`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId });
    recompute(ctx, st);
    return { ok: true, eventId: ev?.eventId ?? null };
  }
  var activeDoctrines = (st) => Object.keys(st.military?.doctrine.taken ?? {}).map((i) => DOCTRINE[i]).filter((d) => d && (!d.polity || d.polity === st.polity));
  function recompute(ctx, st) {
    const M = st.military, ind = effective(ctx.civ, st, "perCapita"), wTech = (has(st, "bronze_weapons") ? 0.08 : 0) + (has(st, "iron_weapons") ? 0.12 : 0) + (has(st, "steel") ? 0.05 : 0) + (has(st, "gunpowder") ? 0.1 : 0);
    M.equipLevel = clamp8(0.15 + 0.35 * clamp8(ind / 1.6) + wTech + (st.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st.econ?.investment ?? 0), 0, 1);
    M.readiness = clamp8(0.5 * st.stability + 0.3 * (st.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st.politics ? effective(ctx.civ, st, "fatigue") : 0)), 0, 1);
    const ds = activeDoctrines(st), off = clamp8(ds.reduce((s, d) => s + d.off, 0), 0, OFF_CAP), def = clamp8(ds.reduce((s, d) => s + d.def, 0), 0, DEF_CAP);
    const eqE = effective(ctx.civ, st, "equipLevel"), rdE = effective(ctx.civ, st, "readiness");
    st.milBonus = Math.round(clamp8(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off, -0.6, 0.6) * 1e3) / 1e3;
    st.milDef = Math.round(def * 1e3) / 1e3;
  }
  function stepMilitary(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde || mi % 3 !== 0) return;
    for (const st of Object.values(civ3.states)) {
      if (!st.alive) continue;
      const M = st.military ?? (st.military = initMilitary());
      recompute(ctx, st);
      const shares = M.shares && Object.keys(M.shares).every((k) => UNIT_KINDS[k]?.need(st, ctx)) ? M.shares : shareOf(ctx, st);
      if (M.shares && shares !== M.shares) M.shares = null;
      const old = new Map(M.units.map((u) => [u.kind, u])), next = [];
      for (const [k, sh] of Object.entries(shares)) {
        const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: `${st.name}\u306E${UNIT_KINDS[k].ja}`, since: mi };
        u.size = Math.round(st.army * sh * 10) / 10;
        u.equip = Math.round(clamp8(effective(ctx.civ, st, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : 0)) * 100) / 100;
        u.readiness = Math.round(effective(ctx.civ, st, "readiness") * 100) / 100;
        next.push(u);
      }
      M.units = next;
      M.armyBasis = st.army;
    }
  }
  function reorganize(ctx, st, shares) {
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "\u914D\u5206\u306E\u5408\u8A08\u306F 1" };
    for (const [k, v] of Object.entries(shares)) {
      if (!UNIT_KINDS[k]) return { ok: false, reason: `\u672A\u77E5\u306E\u90E8\u968A ${k}` };
      if (!(v >= 0)) return { ok: false, reason: "\u914D\u5206\u306F 0 \u4EE5\u4E0A" };
      if (v > 0 && !UNIT_KINDS[k].need(st, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}\u306F\u4ECA\u306E\u6280\u8853\u30FB\u5730\u7406\u3067\u306F\u7DE8\u5236\u3067\u304D\u306A\u3044` };
    }
    const cost = Math.round(st.army * 2e-3 * 10) / 10;
    if (st.treasury < cost) return { ok: false, reason: `\u518D\u7DE8\u306E\u8CBB\u7528 ${cost} \u304C\u8DB3\u308A\u306A\u3044` };
    st.treasury -= cost;
    (st.military ?? (st.military = initMilitary())).shares = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0));
    stepMilitaryNow(ctx, st);
    return { ok: true, cost };
  }
  function stepMilitaryNow(ctx, st) {
    const mi = ctx.civ.monthIndex;
    const prev = ctx.civ.monthIndex;
    ctx.civ.monthIndex = mi - mi % 3;
    const only = (s) => s;
    try {
      const states = ctx.civ.states;
      const keep = Object.values(states).filter((s) => s !== st).map((s) => [s, s.alive]);
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
  function createFigure(ctx, st, { name, bornAt, houseId, parents = null, role = "leader", cause = null }) {
    const { civ: civ3, ids } = ctx, id = ids.next("person"), f = { id, name, bornAt, diedAt: null, role, stateId: st.id, houseId, parents, children: [], speciesId: civ3.groups[st.capitalGroupId]?.speciesId ?? "human", history: [{ at: civ3.monthIndex, kind: "appeared", stateId: st.id }] };
    (civ3.figures ?? (civ3.figures = {}))[id] = f;
    return f;
  }
  var newHouse = (ctx, st, founder) => {
    const { civ: civ3, ids } = ctx;
    const id = ids.next("house");
    (civ3.houses ?? (civ3.houses = {}))[id] = { id, name: `${founder.name}\u5BB6`, foundedAt: civ3.monthIndex, stateId: st.id, founderId: founder.id };
    return id;
  };
  function stepPeople(ctx) {
    const { civ: civ3, ids } = ctx, mi = civ3.monthIndex;
    if (!civ3.options.wcde) return;
    civ3.figures ?? (civ3.figures = {});
    civ3.houses ?? (civ3.houses = {});
    for (const st of Object.values(civ3.states)) {
      if (!st.alive) continue;
      const L = st.leader;
      let cur = st.leaderFigureId ? civ3.figures[st.leaderFigureId] : null;
      const heirFig = st.heirFigureId ? civ3.figures[st.heirFigureId] : null;
      if (cur && (cur.name !== L.name || cur.bornAt !== L.bornAt || L.deposed)) {
        const succeeded = heirFig && heirFig.diedAt == null && L.heirTaken !== false && !L.deposed && cur.diedAt == null;
        cur.diedAt = mi;
        cur.history.push({ at: mi, kind: L.deposed ? "deposed" : "left_office" });
        if (heirFig && heirFig.diedAt == null && !L.deposed) {
          L.name = heirFig.name;
          L.bornAt = heirFig.bornAt;
          cur = heirFig;
          st.leaderFigureId = heirFig.id;
          cur.history.push({ at: mi, kind: "enthroned", stateId: st.id });
          st.heirFigureId = null;
          L.heir = false;
          makeEvent(civ3, ids, { kind: "succession_by_heir", title: `${st.name}\u3067\u3001${cur.name}\u304C\u7236\u7956${civ3.figures[cur.parents?.[0]]?.name ?? ""}\u306E\u8DE1\u3092\u7D99\u3044\u3060`, participants: [{ entityId: st.id, role: "state" }, { entityId: cur.id, role: "successor" }, ...cur.parents ? [{ entityId: cur.parents[0], role: "predecessor" }] : []], provenance: "simulation" });
          continue;
        }
        const old = cur;
        cur = null;
        L.deposed = false;
        const nf = createFigure(ctx, st, { name: L.name, bornAt: L.bornAt, houseId: null });
        nf.houseId = newHouse(ctx, st, nf);
        st.leaderFigureId = nf.id;
        st.heirFigureId = null;
        const ev = makeEvent(civ3, ids, { kind: "dynasty_changed", title: `${st.name}\u3067\u738B\u671D\uFF08\u5BB6\u7CFB\uFF09\u304C\u4EE3\u308F\u3063\u305F\uFF08${old.name}\u5BB6\u304B\u3089${nf.name}\u5BB6\u3078\uFF09`, participants: [{ entityId: st.id, role: "state" }, { entityId: old.id, role: "predecessor" }, { entityId: nf.id, role: "successor" }], effects: [{ targetId: st.id, property: "leader.houseId", before: old.houseId, after: nf.houseId }], provenance: "simulation" });
        continue;
      }
      if (!cur) {
        const f = createFigure(ctx, st, { name: L.name, bornAt: L.bornAt, houseId: null });
        f.houseId = newHouse(ctx, st, f);
        st.leaderFigureId = f.id;
        cur = f;
      }
      if (L.heir && !st.heirFigureId && cur.diedAt == null) {
        const grp = civ3.groups[st.capitalGroupId], lang = languageOfGroup(grp), r = ctx.rng, ageGap = Math.max(AGE_MIN, 20 * 12 + Math.floor(r() * 120)), born = Math.min(mi - 12, cur.bornAt + ageGap);
        const child = createFigure(ctx, st, { name: (lang && civ3.languages[lang] ? nameFor(civ3, r, lang, "person") : null) ?? `${L.name}\u306E\u5B50`, bornAt: born, houseId: cur.houseId, parents: [cur.id], role: "heir" });
        cur.children.push(child.id);
        st.heirFigureId = child.id;
        makeEvent(civ3, ids, { kind: "heir_named", title: `${st.name}\u306E${cur.name}\u304C\u7D99\u627F\u8005${child.name}\u3092\u5B9A\u3081\u305F`, participants: [{ entityId: st.id, role: "state" }, { entityId: cur.id, role: "parent" }, { entityId: child.id, role: "heir" }], provenance: "simulation" });
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

  // js/core/wcde/domains/actions.js
  var r33 = (x) => Math.round(x * 1e3) / 1e3;
  var clamp9 = (v, a, b) => Math.max(a, Math.min(b, v));
  var cand2 = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad2 = (key, reason, o = {}) => cand2(key, {}, { ...o, eligible: false, reason });
  var eff2 = (list, st, property, before, after) => {
    list.push({ targetId: st.id, property, before, after });
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
      candidates(ctx, st, e) {
        if (!ctx.civ.options.wcde) return [];
        const out = [];
        for (const d of DOCTRINES) {
          const c = canAdopt(st, d.id);
          if (!c.ok) continue;
          out.push(cand2("adopt_doctrine", { security: 0.15 + 2.2 * d.def + 0.8 * d.off + (st.warIds.length ? 0.2 : 0), expansion: 3 * d.off - d.cost / 2e3 }, { opt: d.id, label: `${d.ja}\u3092\u53D6\u308A\u5165\u308C\u308B` }));
        }
        return out.sort((a, b) => b.factors.security + b.factors.expansion - (a.factors.security + a.factors.expansion) || (a.opt < b.opt ? -1 : 1)).slice(0, 3);
      },
      execute(ctx, st, c) {
        const r = adoptDoctrine(ctx, st, c.opt, { provenance: c.provenance ?? "ai", decisionId: c.decisionId ?? null });
        return r.ok ? { ok: true, silent: true, effects: [] } : { ok: false, error: r.reason };
      }
    });
    registerAction({
      key: "invest_industry",
      domain: "economy",
      label: "\u7523\u696D\u3078\u306E\u6295\u8CC7",
      enabled: true,
      candidates(ctx, st, e) {
        if (!ctx.civ.options.wcde || !st.econ) return [];
        const inv = st.econ.investment ?? 0;
        if (st.treasury < INVEST_COST * 2) return [bad2("invest_industry", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        if (inv >= INVEST_CAP) return [bad2("invest_industry", "\u6295\u8CC7\u306E\u52B9\u679C\u304C\u4E0A\u9650")];
        return [cand2("invest_industry", { prosperity: 0.35 + 0.5 * (1 - clamp9(st.econ.perCapita / 1.5, 0, 1)), tech: 0.1 }, { label: "\u7523\u696D\u3078\u6295\u8CC7\u3059\u308B" })];
      },
      execute(ctx, st, c) {
        const ef = [], b = st.econ.investment ?? 0, a = r33(Math.min(INVEST_CAP, b + INVEST_GAIN));
        if (st.treasury < INVEST_COST) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st.treasury -= INVEST_COST;
        st.econ.investment = a;
        eff2(ef, st, "econ.investment", b, a);
        return { ok: true, effects: ef, title: "\u7523\u696D\u3078\u306E\u6295\u8CC7" };
      }
    });
    registerAction({
      key: "appease_faction",
      domain: "politics",
      label: "\u652F\u6301\u52E2\u529B\u3078\u306E\u914D\u616E",
      enabled: true,
      candidates(ctx, st, e) {
        if (!ctx.civ.options.wcde || !st.politics) return [];
        const P = st.politics, out = [];
        for (const [k, f] of Object.entries(P.factions)) {
          const weak = (f.influence ?? 0) * (0.6 - f.support);
          if (weak > 0.02) out.push(cand2("appease_faction", { stability: 0.5 + 4 * weak + (P.legitimacy < 0.4 ? 0.3 : 0) }, { opt: k, label: `${FACTIONS[k]}\u306B\u914D\u616E\u3059\u308B` }));
        }
        return out.sort((a, b) => b.factors.stability - a.factors.stability || (a.opt < b.opt ? -1 : 1)).slice(0, 2);
      },
      execute(ctx, st, c) {
        const f = st.politics?.factions[c.opt];
        if (!f) return { ok: false, error: "\u305D\u306E\u52E2\u529B\u306F\u306A\u3044" };
        const cost = 15;
        if (st.treasury < cost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st.treasury -= cost;
        const b = f.support, a = r33(clamp9(b + 0.15, 0, 1));
        f.support = a;
        recomputeLegitimacy(st.politics);
        const ef = [];
        eff2(ef, st, `politics.${c.opt}.support`, r33(b), a);
        return { ok: true, effects: ef, title: `${FACTIONS[c.opt]}\u3078\u306E\u914D\u616E` };
      }
    });
  }

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
    for (const r of ledger(civ3).records) if (r.status === "active") (adj[_b = r.targetId] ?? (adj[_b] = {}))[r.field] = { add: r.residual };
  }
  function planIntervention(w, { stateId, field, value, reason = "", halfLifeMonths = null }) {
    const { civ: civ3 } = w, fail3 = (error) => ({ ok: false, error }), f = FIELDS[field];
    if (!f) return fail3(`\u300C${field}\u300D\u306F\u4ECB\u5165\u3067\u304D\u308B\u9805\u76EE\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08${Object.keys(FIELDS).join("\u30FB")}\uFF09`);
    const st = civ3.states[stateId];
    if (!st?.alive) return fail3("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!fin(value)) return fail3("\u5024\u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08NaN\u30FBInfinity\u30FB\u578B\u306E\u4E0D\u4E00\u81F4\u306F\u4ECB\u5165\u3067\u304D\u307E\u305B\u3093\uFF09");
    if (value < f.min || value > f.max) return fail3(`${f.ja}\u306F ${f.min}\u301C${f.max} \u306E\u7BC4\u56F2\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
    if (typeof reason !== "string" || reason.length > MAX_REASON) return fail3(`\u7406\u7531\u306E\u6CE8\u91C8\u306F ${MAX_REASON} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    let half = f.half;
    if (halfLifeMonths != null) {
      if (!fin(halfLifeMonths) || halfLifeMonths < 1 || halfLifeMonths > 1200) return fail3("\u6E1B\u8870\u306E\u534A\u6E1B\u671F\u306F 1\u301C1200 \u304B\u6708");
      half = halfLifeMonths;
    }
    const nominal = nominalOf(civ3, st, field);
    if (!fin(nominal)) return fail3(`${f.ja}\u306F\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF08\u6B21\u306E\u6708\u6B21\u51E6\u7406\u306E\u3042\u3068\u3067\u4ECB\u5165\u3067\u304D\u307E\u3059\uFF09`);
    const residual0 = value - nominal;
    if (Math.abs(residual0) < f.eps) return fail3(`\u6307\u5B9A\u5024\u304C\u901A\u5E38\u8A08\u7B97\u5024\uFF08${Math.round(nominal * 1e3) / 1e3}\uFF09\u3068\u307B\u307C\u540C\u3058\u3067\u3059`);
    return { ok: true, plan: { st, f, nominal, residual0, half, reason: reason.trim() } };
  }
  function createIntervention(w, args, authority = "creator_intervention") {
    const p = planIntervention(w, args);
    if (!p.ok) return p;
    const { civ: civ3 } = w, { st, nominal, residual0, half, reason } = p.plan, L = ledger(civ3), mi = civ3.monthIndex, id = w.sim.ctx.ids.next("intervention");
    let supersedes = null;
    for (const r of L.records) if (r.status === "active" && r.targetId === st.id && r.field === args.field) {
      r.status = "superseded";
      r.endedAt = mi;
      r.supersededBy = id;
      supersedes = r.id;
    }
    L.records.push({ id, targetId: st.id, field: args.field, nominalAtStart: nominal, target: args.value, residual0, residual: residual0, startMonth: mi, halfLife: half, mode: "add", status: "active", authority, reason, supersedes, endedAt: null, changes: [{ at: mi, target: args.value }] });
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
        const k = r.targetId + "|" + r.field;
        if (seen.has(k)) errs.push(`\u540C\u3058\u9805\u76EE\u306B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u8907\u6570\u3042\u308B\uFF08${k}\uFF09`);
        seen.add(k);
        const a = civ3.wcde.adjust?.[r.targetId]?.[r.field];
        if (!a || Math.abs(a.add - r.residual) > 1e-9) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u88DC\u6B63\u306E\u8868\u304C\u8A18\u9332\u3068\u4E00\u81F4\u3057\u306A\u3044`);
      }
    }
    const adj = civ3.wcde.adjust ?? {};
    for (const sid of Object.keys(adj)) for (const f of Object.keys(adj[sid])) if (!seen.has(sid + "|" + f)) errs.push(`\u88DC\u6B63\u306E\u8868 ${sid}.${f} \u306B\u5BFE\u5FDC\u3059\u308B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u7121\u3044`);
    return errs;
  }

  // js/core/wcde/clock.js
  var SPEEDS = Object.freeze([{ id: 0, label: "\u505C\u6B62", mps: 0 }, { id: 1, label: "1\u304B\u6708/\u79D2", mps: 1 }, { id: 2, label: "3\u304B\u6708/\u79D2", mps: 3 }, { id: 3, label: "1\u5E74/\u79D2", mps: 12 }, { id: 4, label: "5\u5E74/\u79D2", mps: 60 }]);
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
  var CRITICAL_SCORE = 85;
  function newsContext(civ3) {
    const alive = Object.values(civ3.states).filter((s) => s.alive), total = alive.reduce((a, s) => a + s.pop, 0) || 1, n = Math.max(1, alive.length), rel = {};
    for (const s of Object.values(civ3.states)) rel[s.id] = s.pop / total * n;
    return { rel };
  }
  var KIND = { state_dissolved: 40, war_declared: 25, war_ended: 30, regime_change: 25, conquest: 35, state_formed: 20, religion_founded: 25, religion_schism: 20, famine: 15, disaster_struck: 15, climate_shift: 20, dynasty_changed: 15, culture_diverged: 10, language_diverged: 10, tech_lost: 20 };
  var SIZE_K = 15;
  function classifyEvent(civ3, ev, cx = newsContext(civ3)) {
    const base = KIND[ev.kind];
    if (base == null) return { level: "normal", score: 0 };
    const ids = ev.participants.map((p) => p.entityId).filter((i) => civ3.states[i]), sum = ids.reduce((a, i) => a + (cx.rel[i] ?? 0), 0), big = Math.max(0, ...ids.map((i) => cx.rel[i] ?? 0));
    let score = base + SIZE_K * Math.log2(1 + sum);
    if (ev.kind === "regime_change" || ev.kind === "dynasty_changed") score = base + SIZE_K * Math.log2(1 + big);
    if (ev.kind === "culture_diverged" || ev.kind === "language_diverged" || ev.kind === "famine" || ev.kind === "disaster_struck") score = Math.min(score, 69);
    score = Math.round(score);
    return { level: score >= CRITICAL_SCORE ? "critical" : score >= 40 ? "major" : "normal", score };
  }
  var newsItem = (civ3, ev, c) => ({ id: "news_" + ev.eventId, eventId: ev.eventId, date: ev.date, kind: ev.kind, title: ev.title, level: c.level, score: c.score, entityIds: [...new Set(ev.participants.map((p) => p.entityId))] });
  function scanNews(civ3) {
    const N = newsOf(civ3), T3 = timeOf(civ3);
    if (N.scanned > civ3.events.length) N.scanned = civ3.events.length;
    const cx = newsContext(civ3), fresh = [];
    for (let i = N.scanned; i < civ3.events.length; i++) {
      const ev = civ3.events[i], c = classifyEvent(civ3, ev, cx);
      if (c.level === "critical") {
        const keys = ev.participants.filter((p) => civ3.states[p.entityId]).map((p) => ev.kind + "|" + p.entityId), mi = civ3.monthIndex, last = N.lastCrit ?? (N.lastCrit = {});
        if (keys.some((k) => last[k] != null && mi - last[k] < COOLDOWN)) {
          c.level = "major";
        } else for (const k of keys) last[k] = mi;
      }
      if (c.level === "critical" && !N.acked.includes(ev.eventId) && !N.queue.some((q2) => q2.eventId === ev.eventId)) fresh.push(newsItem(civ3, ev, c));
    }
    N.scanned = civ3.events.length;
    fresh.sort((a, b) => b.score - a.score || (a.eventId < b.eventId ? -1 : 1));
    N.queue.push(...fresh);
    if (N.queue.length && !T3.hold) {
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
    const n = Math.max(1, Math.min(MAX_RUN, months | 0)), snap = checkpointFull(civ3);
    let done2 = 0, held = false;
    try {
      for (; done2 < n; done2++) {
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
    const { civ: civ3 } = w, N = newsOf(civ3), T3 = timeOf(civ3), head2 = N.queue[0];
    if (!head2) return { ok: false, error: "\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (id != null && id !== head2.id) return { ok: false, error: "\u6700\u521D\u306E\u30CB\u30E5\u30FC\u30B9\u304B\u3089\u9806\u306B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044" };
    N.queue.shift();
    N.acked.push(head2.eventId);
    if (N.acked.length > ACK_KEEP) N.acked.splice(0, N.acked.length - ACK_KEEP);
    if (!N.queue.length) {
      T3.hold = false;
      T3.speed = T3.resumeSpeed ?? DEFAULT_SPEED;
      T3.resumeSpeed = null;
      return { ok: true, resumed: true, speed: T3.speed, next: null };
    }
    return { ok: true, resumed: false, next: N.queue[0] };
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
    const errs = [], T3 = civ3.wcde.time, N = civ3.wcde.news;
    if (!T3 && !N) return errs;
    if (T3) {
      if (!SPEEDS.some((s) => s.id === T3.speed)) errs.push("\u6642\u9593\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
      if (T3.hold && !N?.queue.length) errs.push("\u505C\u6B62\u4E2D\u306A\u306E\u306B\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u306A\u3044\uFF08\u6642\u9593\u304C\u6B62\u307E\u3063\u305F\u307E\u307E\u306B\u306A\u308B\uFF09");
      if (!T3.hold && N?.queue.length) errs.push("\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u3042\u308B\u306E\u306B\u6642\u9593\u304C\u6B62\u307E\u3063\u3066\u3044\u306A\u3044");
      if (T3.hold && T3.resumeSpeed != null && !SPEEDS.some((s) => s.id === T3.resumeSpeed)) errs.push("\u5FA9\u5E30\u6642\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
    }
    if (N) {
      const seen = /* @__PURE__ */ new Set();
      for (const q2 of N.queue) {
        if (seen.has(q2.id)) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u91CD\u8907`);
        seen.add(q2.id);
        if (!civ3.events.some((e) => e.eventId === q2.eventId)) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u306E\u5143\u306E\u4E8B\u5B9F\u30A4\u30D9\u30F3\u30C8\u304C\u306A\u3044`);
        if (N.acked.includes(q2.eventId)) errs.push(`\u78BA\u8A8D\u6E08\u307F\u306E\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u30AD\u30E5\u30FC\u306B\u3042\u308B`);
      }
      if (N.scanned > civ3.events.length || !Number.isInteger(N.scanned) || N.scanned < 0) errs.push("\u30CB\u30E5\u30FC\u30B9\u306E\u8D70\u67FB\u4F4D\u7F6E\u304C\u4E0D\u6B63");
    }
    return errs;
  }

  // js/core/wcde/integrity.js
  var fin2 = (x) => typeof x === "number" && Number.isFinite(x);
  function checkWcdeIntegrity(world, civ3) {
    const errs = [], W = civ3.wcde;
    if (!civ3.options?.wcde) return errs;
    const players = Object.values(civ3.states).filter((s) => s.alive && s.player);
    if (players.length > 1) errs.push(`\u62C5\u5F53\u56FD\u5BB6\u304C\u8907\u6570\u3042\u308B\uFF08${players.map((s) => s.id).join(",")}\uFF09`);
    const cs = W?.control?.stateId ?? null;
    if (cs && !(civ3.states[cs]?.alive && civ3.states[cs].player)) errs.push(`\u62C5\u5F53\u56FD\u5BB6 ${cs} \u304C\u5B58\u5728\u3057\u306A\u3044\u30FB\u62C5\u5F53\u306E\u5370\u304C\u7121\u3044`);
    if (!cs && players.length) errs.push("\u62C5\u5F53\u304C\u7121\u3044\u306E\u306B\u3001\u62C5\u5F53\u306E\u5370\u304C\u4ED8\u3044\u305F\u56FD\u5BB6\u304C\u3042\u308B");
    if (civ3.player?.groupId != null) errs.push("WCDE \u306E\u4E16\u754C\u3067\u306F\u3001\u62C5\u5F53\u306F\u96C6\u56E3\u3067\u306F\u306A\u304F\u56FD\u5BB6\uFF08civ.player.groupId \u306F\u7A7A\uFF09");
    if (civ3.options.magic === false) {
      if (Object.keys(civ3.persons ?? {}).length || Object.keys(civ3.magic?.orgs ?? {}).length) errs.push("\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u306B\u3001\u9B54\u6CD5\u306E\u4EBA\u7269\u30FB\u7D44\u7E54\u304C\u3042\u308B");
      for (const s of Object.values(civ3.states)) if (s.magic) errs.push(`\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u3067\u56FD\u5BB6 ${s.id} \u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B`);
    }
    for (const st of Object.values(civ3.states)) {
      if (!st.alive) continue;
      const e = st.econ;
      if (e) {
        for (const k of ["output", "industry", "perCapita", "foodBalance", "tradeIncome"]) if (e[k] !== void 0 && !fin2(e[k])) errs.push(`${st.id}.econ.${k} \u304C\u6709\u9650\u3067\u306A\u3044`);
      }
      const P = st.politics;
      if (P) {
        for (const k of Object.keys(FACTIONS)) {
          const s = P.factions[k]?.support;
          if (!(s >= 0 && s <= 1)) errs.push(`${st.id} \u306E${FACTIONS[k]}\u306E\u652F\u6301\u304C\u7BC4\u56F2\u5916 ${s}`);
        }
        if (!(P.legitimacy >= 0 && P.legitimacy <= 1)) errs.push(`${st.id} \u306E\u6B63\u7D71\u6027\u304C\u7BC4\u56F2\u5916`);
      }
      const M = st.military;
      if (M) {
        for (const id of Object.keys(M.doctrine.taken)) {
          const d = DOCTRINE[id];
          if (!d) errs.push(`${st.id} \u306B\u672A\u77E5\u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id}`);
          else for (const p of d.prereq) if (M.doctrine.taken[p] == null) errs.push(`${st.id} \u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id} \u306E\u524D\u63D0 ${p} \u304C\u7121\u3044`);
        }
        if (!(st.milBonus >= -0.6 - 1e-9 && st.milBonus <= 0.6 + 1e-9)) errs.push(`${st.id} \u306E milBonus \u304C\u7BC4\u56F2\u5916 ${st.milBonus}`);
        if (!(st.milDef >= 0 && st.milDef <= 0.4 + 1e-9)) errs.push(`${st.id} \u306E milDef \u304C\u7BC4\u56F2\u5916`);
      }
      if (st.leaderFigureId) {
        const f = civ3.figures?.[st.leaderFigureId];
        if (!f) errs.push(`${st.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269 ${st.leaderFigureId} \u304C\u7121\u3044`);
        else if (f.diedAt != null) errs.push(`${st.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269\u304C\u6CA1\u3057\u3066\u3044\u308B`);
      }
    }
    errs.push(...checkInterventions(civ3));
    errs.push(...checkClock(civ3));
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
  function takeControl(w, stateId) {
    const { civ: civ3 } = w, st = civ3.states[stateId];
    if (!st?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    for (const s of Object.values(civ3.states)) if (s.player && s.id !== stateId) s.player = false;
    st.player = true;
    civ3.wcde.control.stateId = stateId;
    civ3.wcde.control.since = civ3.monthIndex;
    w.sim.ctx._byState = null;
    return { ok: true, stateId };
  }
  function releaseControl(w) {
    const { civ: civ3 } = w;
    for (const s of Object.values(civ3.states)) s.player = false;
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
    const { civ: civ3 } = w, st = civ3.states[stateId];
    if (!st?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
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
      const before = f.get(st);
      f.set(st, v);
      if (k === "leader.name") st.leader.name = v;
      done2.push({ targetId: stateId, property: k, before, after: v });
    }
    ((_a = civ3.wcde).edits ?? (_a.edits = [])).push(...done2.map((d) => ({ at: civ3.monthIndex, authority: "creator_intervention", ...d })));
    if (civ3.wcde.edits.length > 2e3) civ3.wcde.edits.splice(0, civ3.wcde.edits.length - 2e3);
    makeEvent(civ3, w.sim.ctx.ids, { kind: "creator_edit", title: `\u5275\u9020\u4E3B\u304C${st.name}\u3092\u76F4\u63A5\u7DE8\u96C6\u3057\u305F\uFF08${done2.map((d) => d.property).join("\u30FB")}\uFF09`, participants: [{ entityId: stateId, role: "target" }], effects: done2, provenance: "creator" });
    w.sim.ctx._byState = null;
    return { ok: true, edited: done2.map((d) => d.property) };
  }
  function creatorRename(w, { kind, id, name }) {
    var _a;
    const { civ: civ3 } = w, table3 = { culture: civ3.cultures, language: civ3.languages, religion: civ3.religions }[kind];
    if (!table3) return fail2("\u5BFE\u8C61\u306F culture / language / religion");
    const e = table3[id];
    if (!e) return fail2("\u305D\u306E\u5B9A\u7FA9\u304C\u3042\u308A\u307E\u305B\u3093");
    const n = typeof name === "string" ? name.trim() : "";
    if (!n || n.length > 30) return fail2("\u540D\u524D\u306F 1\u301C30 \u6587\u5B57");
    const before = e.name;
    e.name = n;
    if (kind === "culture") e.nameFixed = true;
    ((_a = civ3.wcde).edits ?? (_a.edits = [])).push({ at: civ3.monthIndex, authority: "creator_intervention", targetId: id, property: "name", before, after: n });
    return { ok: true };
  }

  // js/core/wcde/warlab.js
  var WARLAB_MODEL = "warlab-1";
  var clamp10 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r34 = (x) => Math.round(x * 1e3) / 1e3;
  function warInputs(civ3, st) {
    const equip = effective(civ3, st, "equipLevel"), readiness = effective(civ3, st, "readiness"), fatigue = effective(civ3, st, "fatigue"), industry = effective(civ3, st, "industry");
    const sustain = clamp10(st.treasury / (st.army * 0.05 + 10) / 24);
    const base = strength(civ3, st);
    return { army: st.army, equip: r34(equip), readiness: r34(readiness), fatigue: r34(fatigue), industry: Math.round(industry), stability: r34(st.stability), treasury: Math.round(st.treasury), sustain: r34(sustain), base: Math.round(base), power: Math.round(base * (1 - 0.3 * fatigue) * (0.85 + 0.15 * sustain)) };
  }
  var sig = (x) => [x.army, x.equip, x.readiness, x.fatigue, x.industry, x.stability, x.sustain, x.base].map((v) => Math.round(v * 100) / 100).join(",");
  var logistic = (x) => 1 / (1 + Math.exp(-x));
  function predictWar(civ3, aId, bId, cacheHost = null) {
    const a = civ3.states[aId], b = civ3.states[bId];
    if (!a?.alive || !b?.alive || a.id === b.id) return null;
    const ia = warInputs(civ3, a), ib = warInputs(civ3, b), key = `${WARLAB_MODEL}|${aId}|${bId}|${sig(ia)}|${sig(ib)}`, cache = cacheHost ? cacheHost._warlab ?? (cacheHost._warlab = /* @__PURE__ */ new Map()) : null;
    const hit = cache?.get(key);
    if (hit) return hit;
    const ratio = (ia.power + 1) / (ib.power + 1), lr = Math.log(ratio);
    const unc = clamp10(0.12 + 0.35 * (1 - (ia.readiness + ib.readiness) / 2) + 0.2 * (1 - (ia.stability + ib.stability) / 2) + 0.1 / (1 + Math.log10(1 + Math.min(ia.industry, ib.industry) / 1e3)), 0.05, 0.9);
    const win = (l) => {
      const raw = logistic(1.6 * l), stale = 0.35 * Math.exp(-(l * l) / 0.5);
      return { a: (1 - stale) * raw, b: (1 - stale) * (1 - raw), s: stale };
    };
    const mid = win(lr), lo = win(lr - unc), hi = win(lr + unc);
    const lossA = clamp10(0.08 + 0.25 / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6), lossB = clamp10(0.08 + 0.25 * ratio / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6);
    const months = Math.round(clamp10(6 + 30 * mid.s + 14 * (1 - Math.abs(mid.a - mid.b)), 4, 72));
    const factors = [["army", "\u5175\u529B"], ["equip", "\u88C5\u5099\u6C34\u6E96"], ["readiness", "\u7DF4\u5EA6\u30FB\u5373\u5FDC"], ["fatigue", "\u75B2\u52B4\u5EA6"], ["sustain", "\u56FD\u5EAB\u306E\u6301\u4E45\u529B"], ["power", "\u7DCF\u5408\u6226\u529B"]].map(([k, ja]) => ({ key: k, ja, a: ia[k], b: ib[k] }));
    const out = { model: WARLAB_MODEL, month: civ3.monthIndex, aId, bId, inputs: { a: ia, b: ib }, ratio: r34(ratio), pAWin: r34(mid.a), pBWin: r34(mid.b), pStalemate: r34(mid.s), pAWinRange: [r34(lo.a), r34(hi.a)], lossA: r34(lossA), lossB: r34(lossB), months, uncertainty: r34(unc), factors };
    if (cache) {
      if (cache.size > 4e3) cache.clear();
      cache.set(key, out);
    }
    return out;
  }

  // js/core/wcde/negotiation.js
  var clamp11 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r22 = (x) => Math.round(x * 100) / 100;
  var initDiplomacy = () => ({ proposals: [] });
  var ledger2 = (civ3) => {
    var _a;
    return (_a = civ3.wcde).diplomacy ?? (_a.diplomacy = initDiplomacy());
  };
  var proposalsOf = (civ3) => ledger2(civ3).proposals;
  var TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10 };
  function evaluateTreaty(civ3, from, to, type) {
    const f = [], add = (ja, v) => {
      f.push({ ja, v: r22(v) });
      return v;
    };
    const T3 = TREATY[type];
    if (!T3) return { accept: false, score: -9, factors: [{ ja: "\u305D\u306E\u7A2E\u985E\u306E\u6761\u7D04\u306F\u306A\u3044", v: -9 }], hard: true, counter: null };
    const rel = to.relations[from.id] ?? 0;
    let s = add("\u76F8\u624B\u304B\u3089\u898B\u305F\u95A2\u4FC2", (rel - TREATY_THRESHOLD[type]) / 20);
    const gr = grievance(civ3, to, from.id);
    if (gr > 0.5) return { accept: false, score: -9, factors: [{ ja: "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", v: -9 }], hard: true, counter: null };
    if (gr > 0) s += add("\u904E\u53BB\u306E\u6068\u307F", -3 * gr);
    const sf = strength(civ3, from), st = strength(civ3, to), rf = (sf + 1) / (st + 1);
    if (type === "nonaggression") s += add(rf > 1 ? "\u76F8\u624B\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u305F\u3044" : "\u3053\u3061\u3089\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u306B\u304F\u3044", clamp11(Math.log(rf), -1, 1) * 0.5);
    if (type === "alliance") {
      const hot = to.warIds.length > 0 ? 0.6 : 0;
      if (hot) s += add("\u4EA4\u6226\u4E2D\u3067\u5473\u65B9\u304C\u307B\u3057\u3044", hot);
      s += add("\u6226\u529B\u306E\u91E3\u308A\u5408\u3044", clamp11(Math.log(rf), -1, 1) * 0.3);
    }
    if (type === "trade") {
      const ratio = (from.econ?.industry ?? 1) / ((to.econ?.industry ?? 1) + 1);
      s += add("\u4EA4\u6613\u306E\u898B\u8FBC\u307F", clamp11(Math.log1p(Math.min(ratio, 1 / Math.max(ratio, 0.01))), 0, 1) * 0.5);
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
  function evaluatePeace(civ3, war, proposer, other, terms = { kind: "white" }) {
    const f = [], add = (ja, v) => {
      f.push({ ja, v: r22(v) });
      return v;
    };
    const otherIsAttacker = war.aggressor === other.id, otherLead = otherIsAttacker ? war.score : -war.score;
    let s = add("\u6226\u6CC1\uFF08\u52A3\u52E2\u306A\u3089\u8B1B\u548C\u3057\u305F\u3044\uFF09", -otherLead / 40);
    s += add("\u75B2\u52B4", (other.politics?.fatigue ?? 0) * 1);
    s += add("\u56FD\u5185\u306E\u4E0D\u5B89\u5B9A", (1 - other.stability) * 0.8);
    if (other.treasury < 0) s += add("\u56FD\u5EAB\u306E\u67AF\u6E07", 0.5);
    const age = Math.max(0, civ3.monthIndex - war.startedAt);
    s += add("\u6226\u4E89\u306E\u9577\u671F\u5316", clamp11(age / 60, 0, 1.5));
    let need = 0.2;
    if (terms.kind === "reparations") {
      const pay = clamp11((terms.amount ?? 0) / (Math.max(0, otherLead > 0 ? proposer.treasury : other.treasury) + 1), 0, 2);
      need += add("\u8CE0\u511F\u306E\u91CD\u3055", 1.5 * pay);
    }
    s -= need;
    f.push({ ja: "\u53D7\u3051\u5165\u308C\u306E\u57FA\u6E96", v: r22(-need) });
    return { accept: s >= 0, score: r22(s), factors: f };
  }
  var record2 = (ctx, rec) => {
    const id = ctx.ids.next("proposal");
    ledger2(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rec });
    return id;
  };
  var failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });
  function negotiateTreaty(ctx, from, to, type, c = {}) {
    const civ3 = ctx.civ, ev = evaluateTreaty(civ3, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, score: ev.score, factors: ev.factors, counter: ev.counter };
    if (!ev.accept) {
      record2(ctx, { ...base, status: ev.counter ? "countered" : "rejected" });
      return failure(ev.counter ? `\u5225\u306E\u6761\u4EF6\u306A\u3089\u3070\u53D7\u3051\u5165\u308C\u308B\uFF08${TREATY[ev.counter.type].ja}\uFF09` : "\u76F8\u624B\u306B\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: to.id, counter: ev.counter });
    }
    if (!from.alive || !to.alive || atWarWith(civ3, from, to) || treatyBetween(civ3, from, to, type)) {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u7DE0\u7D50\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: to.id });
    }
    signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance });
    record2(ctx, { ...base, status: "accepted" });
    return { ok: true, effects: [], silent: true, targetId: to.id };
  }
  function negotiatePeace(ctx, proposer, war, c = {}) {
    const civ3 = ctx.civ;
    if (!war || war.status !== "active" || !proposer.warIds.includes(war.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
    const otherId = war.sides.a.includes(proposer.id) ? war.defender : war.aggressor, other = civ3.states[otherId];
    if (!other?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
    const terms = c.terms?.kind === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : { kind: "white" };
    const ev = evaluatePeace(civ3, war, proposer, other, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, score: ev.score, factors: ev.factors };
    if (!ev.accept) {
      record2(ctx, { ...base, status: "rejected" });
      return failure("\u8B1B\u548C\u306F\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (war.status !== "active") {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u8B1B\u548C\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (terms.kind === "reparations") {
      const aheadId = war.score >= 0 ? war.aggressor : war.defender, payer = civ3.states[aheadId === war.aggressor ? war.defender : war.aggressor], getter = civ3.states[aheadId];
      const amt = Math.min(terms.amount, Math.max(0, payer.treasury));
      payer.treasury -= amt;
      getter.treasury += amt;
      base.terms = { ...terms, paid: Math.round(amt) };
    }
    endWar(ctx, war, "negotiated");
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
    ctx.taxFactor = (st) => ctx.civ.options.wcde ? effective(ctx.civ, st, "taxRevenue") : 1;
    ticker.register("clock", stepInterventions, "stepInterventions");
    ticker.register("culture", stepLanguage, "stepLanguage");
    ticker.register("culture", stepReligion, "stepReligion");
    ticker.register("economy", stepEconomy, "stepEconomy");
    ticker.register("politics", stepPolitics, "stepPolitics");
    ticker.register("military", stepMilitary, "stepMilitary");
    ticker.register("conflict", stepPeople, "stepPeople");
    ticker.register("conflict", stepCities, "stepCities");
    ticker.register("conflict", (c) => syncControl(c.civ), "syncControl");
    ticker.register("integrity", (c) => {
      const errs = checkWcdeIntegrity(c.world, c.civ);
      if (errs.length) throw new Error("WCDE \u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkWcdeIntegrity");
  }

  // js/core/wcde/contract.js
  var AUTHORITY = Object.freeze({ PLAYER: "player_order", CREATOR: "creator_intervention", AI: "ai_action", SIM: "simulation_transition", ADMIN: "administrative" });
  var A = AUTHORITY;
  var SNAP_KEYS = ["states", "groups", "settlements", "figures", "houses", "cultures", "languages", "religions", "treaties", "wars", "activeWarIds", "activeTreatyIds", "proposals", "persons", "orgs", "seq", "wcde", "options", "player", "techWorld", "species", "speciesDefs", "monthIndex", "date", "adoptCache"];
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
  function defineCommand(type, spec) {
    COMMANDS[type] = { mutates: true, phases: ["running"], control: false, checkpoint: true, ...spec, type };
  }
  var clonePart = (civ3) => {
    const o = {};
    for (const k of SNAP_KEYS) if (k in civ3) o[k] = structuredClone(civ3[k]);
    return o;
  };
  function checkpoint(civ3) {
    return { part: clonePart(civ3), ev: civ3.events.length, dec: civ3.decisions?.length ?? 0 };
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
    if (civ3.decisions) civ3.decisions.length = cp.dec;
    w.rebuild();
  }
  var checkpointFull = (civ3) => structuredClone(civ3);
  function restoreInto(w, snap) {
    const { civ: civ3 } = w;
    for (const k of Object.keys(civ3)) delete civ3[k];
    Object.assign(civ3, structuredClone(snap));
    w.rebuild();
  }
  function log(civ3, entry) {
    var _a;
    const L = (_a = civ3.wcde).log ?? (_a.log = []);
    L.push(entry);
    if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX);
  }
  function dispatch(w, cmd) {
    const { civ: civ3 } = w, W = civ3.wcde, spec = COMMANDS[cmd?.type];
    const fail3 = (error, code = "rejected") => {
      log(civ3, { at: civ3.monthIndex, type: cmd?.type, authority: cmd?.authority, ok: false, error, code });
      return { ok: false, error, code };
    };
    if (!spec) return fail3(`\u672A\u77E5\u306E\u547D\u4EE4: ${cmd?.type}`, "unknown");
    if (!Object.values(AUTHORITY).includes(cmd.authority)) return fail3(`\u672A\u77E5\u306E\u6A29\u9650: ${cmd.authority}`, "authority");
    if (!spec.authorities.includes(cmd.authority)) return fail3(`\u3053\u306E\u547D\u4EE4\u306F ${cmd.authority} \u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u8A31\u53EF: ${spec.authorities.join("\u30FB")}\uFF09`, "authority");
    if (cmd.commandId != null && W.cmdIds.includes(cmd.commandId)) return { ok: true, duplicate: true };
    if (spec.mutates && w.viewPast != null) return fail3("\u904E\u53BB\u306E\u95B2\u89A7\u4E2D\u306F\u3001\u4E16\u754C\u3092\u5909\u3048\u308B\u547D\u4EE4\u3092\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u73FE\u5728\u3078\u623B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "past_view");
    if (!spec.phases.includes(W.phase)) return fail3(`\u3053\u306E\u547D\u4EE4\u306F\u6BB5\u968E\u300C${spec.phases.join("\u30FB")}\u300D\u3067\u306E\u307F\u5B9F\u884C\u3067\u304D\u307E\u3059\uFF08\u73FE\u5728: ${W.phase}\uFF09`, "phase");
    if (spec.control && cmd.authority === A.PLAYER) {
      const cs = W.control.stateId;
      if (!cs) return fail3("\u62C5\u5F53\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u56FD\u5BB6\u3092\u62C5\u5F53\u3057\u3066\u304B\u3089\u547D\u4EE4\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "no_control");
      if (cmd.stateId == null) cmd = { ...cmd, stateId: cs };
      if (cmd.stateId !== cs) return fail3("\u62C5\u5F53\u56FD\u5BB6\u4EE5\u5916\u306B\u306F\u547D\u4EE4\u3067\u304D\u307E\u305B\u3093", "not_controlled");
    }
    const v = spec.validate?.(w, cmd);
    if (v && v.ok === false) return fail3(v.error);
    const cp = spec.mutates && spec.checkpoint !== false ? checkpoint(civ3) : null;
    let r;
    try {
      r = spec.apply(w, cmd);
    } catch (err) {
      if (cp) rollback(w, cp);
      log(civ3, { at: civ3.monthIndex, type: cmd.type, authority: cmd.authority, ok: false, error: String(err?.message ?? err), code: "exception" });
      return { ok: false, error: `\u547D\u4EE4\u306E\u9014\u4E2D\u3067\u5931\u6557\u3057\u305F\u305F\u3081\u3001\u3059\u3079\u3066\u53D6\u308A\u6D88\u3057\u307E\u3057\u305F: ${err?.message ?? err}`, code: "rolled_back" };
    }
    if (!r || r.ok === false) return fail3(r?.error ?? "\u5931\u6557", "rejected");
    if (cmd.commandId != null) {
      W.cmdIds.push(cmd.commandId);
      if (W.cmdIds.length > ID_MAX) W.cmdIds.splice(0, W.cmdIds.length - ID_MAX);
    }
    log(civ3, { at: civ3.monthIndex, type: cmd.type, authority: cmd.authority, ok: true, commandId: cmd.commandId ?? null });
    return { ok: true, result: r.result ?? r };
  }
  function safeAdvance(w, months, { chunk: chunk2 = 120, onProgress = null } = {}) {
    const { civ: civ3 } = w;
    let done2 = 0;
    while (done2 < months) {
      const n = Math.min(chunk2, months - done2), snap = checkpointFull(civ3);
      try {
        w.sim.advanceMonths(n);
        done2 += n;
        if (onProgress) onProgress(done2, months);
        continue;
      } catch (err) {
        restoreInto(w, snap);
        let ok2 = 0, msg = String(err?.message ?? err);
        try {
          for (; ok2 < n; ok2++) w.sim.advanceMonth();
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
      out.push({ via: f.via, viaJa: VIA[f.via].ja, groupIds: f.groupIds, seedGroupId: g.id, capitalGroupId: cap.id, cell: cap.cell, pop: Math.round(gs.reduce((s, x) => s + x.pop, 0)), cultureId: d.cultureId, languageId: languageOfGroup(cap), religionId: d.religionId, speciesId: cap.speciesId, polityOptions: POLITY_CHOICES[f.via] ?? ["tribal"] });
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
    const st = formState(ctx, { ...f, player: true, name: nm, polity });
    if (!st) return { ok: false, error: "\u56FD\u5BB6\u306E\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F" };
    invalidateMonthCaches(ctx);
    const r = takeControl(w, st.id);
    if (!r.ok) return r;
    civ3.wcde.phase = "running";
    civ3.wcde.foundedAt = civ3.monthIndex;
    civ3.wcde.candidates = [];
    return { ok: true, stateId: st.id };
  }
  function delegateToWorld(w) {
    const { civ: civ3 } = w;
    civ3.wcde.phase = "running";
    civ3.wcde.foundedAt = civ3.monthIndex;
    civ3.wcde.control.stateId = null;
    return { ok: true };
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
      const st = w.civ.states[c.stateId], war = w.civ.wars[c.warId];
      if (!st?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = negotiatePeace(w.sim.ctx, st, war, { terms: c.terms });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("state.reorganize", { authorities: [AUTHORITY.PLAYER, AUTHORITY.CREATOR], control: true, apply: (w, c) => {
      const st = w.civ.states[c.stateId];
      if (!st?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      return reorganize(w.sim.ctx, st, c.shares);
    } });
    defineCommand("state.adoptDoctrine", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st = w.civ.states[c.stateId];
      if (!st?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = adoptDoctrine(w.sim.ctx, st, c.id, { provenance: "player" });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.reason };
    } });
    defineCommand("creator.editState", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => creatorEditState(w, c) });
    defineCommand("creator.rename", { authorities: [AUTHORITY.CREATOR], phases: ["founding", "running"], apply: (w, c) => creatorRename(w, c) });
    defineCommand("creator.intervene", { authorities: [AUTHORITY.CREATOR], validate: (w, c) => {
      const p = planIntervention(w, c);
      return p.ok ? null : p;
    }, apply: (w, c) => createIntervention(w, c) });
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
    const stats = runPrehistory(world, civ3, { stepYears, onProgress: (s, n) => onProgress?.("\u5148\u53F2", s / n) });
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
  var colorOf = (id, l = 56) => `hsl(${hash(id) % 360} 48% ${l}%)`;
  var POLITY_JA = { tribal: "\u90E8\u65CF\u9023\u5408", chiefdom: "\u9996\u9577\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", federation: "\u9023\u90A6\u5236", confederation: "\u9023\u5408" };
  var polityJa = (p) => POLITY_JA[p] ?? p ?? "\u2014";
  var lb = (ja, en) => h("div", { class: "lb" }, ja, en ? h("em", {}, en) : null);
  var stat = (label, value, unit = "") => h("div", {}, h("small", {}, label), h("b", {}, value), unit ? h("i", {}, unit) : null);
  var btn = (label, onclick, cls = "", props = {}) => h("button", { class: "b " + cls, onclick, ...props }, label);
  var table = (head2, rows, cls = "") => h("table", { class: "tb " + cls, style: "width:100%;border-collapse:collapse;font-size:12px" }, h("thead", {}, h("tr", {}, ...head2.map((x) => h("th", { style: "text-align:left;font-weight:400;color:var(--dim);border-bottom:1px solid var(--line);padding:3px 4px" }, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { style: "border-bottom:1px solid #262a31;padding:3px 4px" }, c))))));
  function face(name, stateId) {
    const k = hash(name + stateId), sk = ["#e0b79a", "#c99a76", "#a87654", "#f0cfb5"][k % 4], hr = ["#2a2420", "#6b4a2f", "#9a9a9a", "#4a3020"][(k >> 3) % 4], st = (k >> 6) % 4, c = colorOf(stateId, 45);
    let g = `<rect width="64" height="64" fill="#1b1f26"/><path d="M6 64Q8 46 32 44Q56 46 58 64Z" fill="${c}" fill-opacity=".8"/><rect x="28" y="38" width="8" height="8" fill="${sk}"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="${sk}"/>`;
    if (st === 1) g += `<path d="M18 30Q14 10 32 10Q50 10 46 30L46 44L42 44L42 24Q32 14 22 24L22 44L18 44Z" fill="${hr}"/>`;
    else {
      g += `<path d="M19 26Q18 11 32 11Q46 11 45 26Q41 18 32 18Q23 18 19 26Z" fill="${hr}"/>`;
      if (st === 2) g += `<path d="M21 31Q32 48 43 31Q43 40 32 42Q21 40 21 31Z" fill="${hr}"/>`;
      if (st === 3) g += `<path d="M20 13L24 6L28 12L32 5L36 12L40 6L44 13Z" fill="#b59a74"/>`;
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
      const n = Math.round(f[1] / tot * pts.length);
      for (let k = 0; k < n && idx < pts.length; k++) {
        const p = pts[idx++];
        e.append(sv("circle", { cx: p[1].toFixed(1), cy: p[2].toFixed(1), r: 3.6, fill: cols[fi % cols.length] }));
      }
    });
    return e;
  }
  var FACTION_JA = { nobility: "\u8CB4\u65CF", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846" };
  var FACTION_COL = { nobility: "#a58bd0", clergy: "#d8b45a", merchants: "#6fa8c9", military: "#d0605a", commoners: "#9fbf8a" };
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

  // js/ui/v6/store.js
  var S = { w: null, hub: null, sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", tl: { type: "events", kind: "", text: "", entity: "", from: "", to: "" }, fileWarn: [], layerOpen: null, war: null, entity: { culture: null, language: null, religion: null }, tech: null, doc: null, fin: false, hooks: {} };
  var run = (c) => {
    const r = dispatch(S.w, { authority: AUTHORITY.ADMIN, ...c });
    S.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    return r;
  };
  var act = (c) => {
    const r = dispatch(S.w, { authority: AUTHORITY.PLAYER, ...c });
    S.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    S.hooks.render?.();
    return r;
  };
  var creator = (c) => {
    const r = dispatch(S.w, { authority: AUTHORITY.CREATOR, ...c });
    S.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    S.hooks.render?.();
    return r;
  };
  var stateName = (id) => S.w.civ.states[id]?.name ?? id;
  var aliveStates = () => Object.values(S.w.civ.states).filter((s) => s.alive);
  var controlled = () => S.w.civ.wcde.control.stateId;

  // js/ui/v6/map.js
  var TAU = Math.PI * 2;
  var FILLS = [["none", "\u5730\u5F62\u306E\u307F"], ["nation", "\u56FD\u5BB6"], ["culture", "\u6587\u5316"], ["language", "\u8A00\u8A9E"], ["religion", "\u5B97\u6559"], ["population", "\u4EBA\u53E3"], ["climate", "\u6C17\u5019\uFF08\u6C17\u6E29\uFF09"]];
  var OVERLAYS = [["borders", "\u56FD\u5883\u7DDA"], ["war", "\u6226\u4E89"], ["cities", "\u90FD\u5E02"]];
  function buildGeometry(world) {
    const m = world.mesh, N = m.cellCount, polys = new Array(N), cen = new Float32Array(N * 2);
    for (let c = 0; c < N; c++) {
      const a = m.cellVertexOffsets[c], b = m.cellVertexOffsets[c + 1], pts = [];
      let lo = 9, hi = -9;
      for (let k = a; k < b; k++) {
        const v = m.cellVertexIds[k] * 3, x2 = m.vertexXYZ[v], y2 = m.vertexXYZ[v + 1], z2 = m.vertexXYZ[v + 2], lon = Math.atan2(y2, x2), lat = Math.asin(Math.max(-1, Math.min(1, z2)));
        pts.push([lon, lat, m.cellVertexIds[k]]);
        if (lon < lo) lo = lon;
        if (lon > hi) hi = lon;
      }
      if (hi - lo > Math.PI) {
        for (const p of pts) if (p[0] < 0) p[0] += TAU;
      }
      polys[c] = pts;
      const x = m.centerXYZ[c * 3], y = m.centerXYZ[c * 3 + 1], z = m.centerXYZ[c * 3 + 2];
      cen[c * 2] = Math.atan2(y, x);
      cen[c * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, z)));
    }
    return { polys, cen, N };
  }
  var dominant3 = (g, key) => g.cohorts?.reduce?.((b, x) => x.share > b.share ? x : b, { share: -1 })?.[key] ?? null;
  var MapView = class {
    constructor(canvas, w) {
      this.cv = canvas;
      this.w = w;
      this.geo = buildGeometry(w.world);
      this.fillLayer = "nation";
      this.overlays = /* @__PURE__ */ new Set(["borders", "cities"]);
      this.onPick = null;
      this.sel = null;
      this.base = null;
      this.view = { x: 0, y: 0, k: 1 };
      this._own = null;
      this._ownAt = -1;
      canvas.addEventListener("click", (e) => {
        if (!this.moved) this.click(e);
      });
      this.pan();
      if (typeof ResizeObserver !== "undefined" && canvas.parentElement) new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
    }
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
          this.draw();
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
        const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = this.view.k, k1 = Math.max(1, Math.min(12, k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
        this.view.x = mx - (mx - this.view.x) / k0 * k1;
        this.view.y = my - (my - this.view.y) / k0 * k1;
        this.view.k = k1;
        this.clamp();
        this.draw();
      }, { passive: false });
    }
    clamp() {
      const v = this.view, W = this.cv.width, H = this.cv.height;
      v.x = Math.min(0, Math.max(W - W * v.k, v.x));
      v.y = Math.min(0, Math.max(H - H * v.k, v.y));
    }
    size() {
      const host = this.cv.parentElement, W = Math.max(480, Math.floor(host?.clientWidth || this.cv.getBoundingClientRect().width || 900)), H = Math.floor(W / 2);
      if (this.cv.width !== W || this.cv.height !== H) {
        this.cv.width = W;
        this.cv.height = H;
        this.base = null;
        this.clamp();
      }
      return [W, H];
    }
    proj(lon, lat, W, H) {
      return [(lon + Math.PI) / TAU * W, (Math.PI / 2 - lat) / Math.PI * H];
    }
    path(ctx, c, W, H, dx = 0) {
      const p = this.geo.polys[c];
      ctx.beginPath();
      for (let i = 0; i < p.length; i++) {
        const [x, y] = this.proj(p[i][0], p[i][1], W, H);
        i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y);
      }
      ctx.closePath();
    }
    fill(ctx, c, col, W, H) {
      ctx.fillStyle = col;
      this.path(ctx, c, W, H);
      ctx.fill();
      if (this.geo.polys[c].some((q2) => q2[0] > Math.PI)) {
        this.path(ctx, c, W, H, -W);
        ctx.fill();
      }
    }
    terrain(W, H) {
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      const ce = this.w.world.cell;
      let emax = 1e-6;
      for (let c = 0; c < this.geo.N; c++) if (ce.elevation[c] > emax) emax = ce.elevation[c];
      ctx.fillStyle = "#0f1114";
      ctx.fillRect(0, 0, W, H);
      for (let c = 0; c < this.geo.N; c++) {
        const land = ce.landWater[c] === 1 || ce.elevation[c] > 0, t = Math.max(0, Math.min(1, ce.elevation[c] / emax));
        this.fill(ctx, c, land ? `hsl(${Math.round(105 - 75 * t)} 24% ${24 + Math.round(20 * t)}%)` : "hsl(210 38% 14%)", W, H);
      }
      return cv;
    }
    owner() {
      const civ3 = this.w.civ;
      if (this._own && this._ownAt === civ3.monthIndex) return this._own;
      const o = /* @__PURE__ */ new Map();
      for (const g of Object.values(civ3.groups)) {
        const cells = g.cells?.length ? g.cells : [g.cell];
        for (const c of cells) o.set(c, g);
      }
      this._own = o;
      this._ownAt = civ3.monthIndex;
      return o;
    }
    fillColor(g, maxPop) {
      const civ3 = this.w.civ, L = this.fillLayer;
      if (L === "nation") return g.stateId ? colorOf(g.stateId) : null;
      if (L === "culture") {
        const id = dominant3(g, "cultureId");
        return id ? colorOf(id) : null;
      }
      if (L === "language") {
        const id = dominant3(g, "languageId");
        return id ? colorOf(id, 52) : null;
      }
      if (L === "religion") {
        const id = dominant3(g, "religionId");
        return id ? colorOf(id, 60) : null;
      }
      if (L === "population") {
        const t = Math.min(1, Math.log1p(g.pop) / Math.log1p(maxPop));
        return `hsl(${Math.round(210 - 190 * t)} 55% ${28 + Math.round(26 * t)}%)`;
      }
      return null;
    }
    /** 凡例: 選んだ層の実データから（上位のみ） */
    legend(key) {
      const civ3 = this.w.civ, own = this.owner(), cnt = /* @__PURE__ */ new Map(), add = (id, n) => id && cnt.set(id, (cnt.get(id) ?? 0) + n);
      if (key === "nation") for (const g of own.values()) add(g.stateId, 1);
      else if (key === "culture") for (const g of own.values()) add(dominant3(g, "cultureId"), 1);
      else if (key === "language") for (const g of own.values()) add(dominant3(g, "languageId"), 1);
      else if (key === "religion") for (const g of own.values()) add(dominant3(g, "religionId"), 1);
      if (["nation", "culture", "language", "religion"].includes(key)) {
        const tab = { nation: civ3.states, culture: civ3.cultures, language: civ3.languages, religion: civ3.religions }[key];
        return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ c: colorOf(id, key === "language" ? 52 : key === "religion" ? 60 : 56), t: `${tab[id]?.name ?? id}\uFF08${n} \u533A\u753B\uFF09` }));
      }
      if (key === "population") return [{ c: "hsl(210 55% 30%)", t: "\u5C11\u306A\u3044" }, { c: "hsl(115 55% 42%)", t: "\u4E2D\u7A0B\u5EA6" }, { c: "hsl(20 55% 54%)", t: "\u591A\u3044\uFF08\u5BFE\u6570\u306E\u968E\u8ABF\uFF09" }];
      if (key === "borders") return [{ line: "#e8e2d0", t: "\u56FD\u5883\uFF08\u5B9F\u7DDA\uFF09" }];
      if (key === "war") return [{ dash: "#d0605a", t: "\u4EA4\u6226\u56FD\u306E\u7E01\u53D6\u308A\uFF08\u8D64\u306E\u7834\u7DDA\uFF09" }];
      if (key === "cities") return [{ dot: "#f2d27a", t: "\u90FD\u5E02\u30FB\u96C6\u843D\uFF08\u70B9\uFF09" }];
      if (key === "none") return [{ c: "hsl(105 24% 24%)", t: "\u4F4E\u5730" }, { c: "hsl(30 24% 44%)", t: "\u9AD8\u5730" }, { c: "hsl(210 38% 14%)", t: "\u6D77" }];
      if (key === "climate") return [{ c: "hsl(220 60% 45%)", t: "\u5BD2\u51B7" }, { c: "hsl(120 50% 40%)", t: "\u6E29\u6696" }, { c: "hsl(10 65% 50%)", t: "\u9AD8\u6E29" }];
      return [];
    }
    draw() {
      const ctx = this.cv.getContext("2d");
      if (!ctx) return;
      const [W, H] = this.size();
      this.base ?? (this.base = this.terrain(W, H));
      const v = this.view;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      if (this.base) ctx.drawImage(this.base, 0, 0);
      const civ3 = this.w.civ, own = this.owner(), ce = this.w.world.cell;
      let maxPop = 1;
      for (const g of own.values()) if (g.pop > maxPop) maxPop = g.pop;
      if (this.fillLayer === "climate") {
        let lo = 1e9, hi = -1e9;
        for (let c = 0; c < this.geo.N; c++) {
          const t = ce.temp[c];
          if (t < lo) lo = t;
          if (t > hi) hi = t;
        }
        ctx.globalAlpha = 0.6;
        for (let c = 0; c < this.geo.N; c++) if (ce.landWater[c] === 1 || ce.elevation[c] > 0) {
          const t = (ce.temp[c] - lo) / (hi - lo || 1);
          this.fill(ctx, c, `hsl(${Math.round(220 - 220 * t)} 55% 45%)`, W, H);
        }
        ctx.globalAlpha = 1;
      } else if (this.fillLayer !== "none") {
        ctx.globalAlpha = 0.8;
        for (const [c, g] of own) {
          const col = this.fillColor(g, maxPop);
          if (col) this.fill(ctx, c, col, W, H);
        }
        ctx.globalAlpha = 1;
      }
      const warring = /* @__PURE__ */ new Set();
      for (const id of civ3.activeWarIds) {
        const x = civ3.wars[id];
        for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s);
      }
      const nb = this.w.world.mesh;
      ctx.lineJoin = "round";
      if (this.overlays.has("borders") || this.overlays.has("war")) {
        ctx.strokeStyle = "#e8e2d0";
        ctx.lineWidth = 1.4 / v.k;
        const edge = (c, n) => {
          const a = this.geo.polys[c], b = new Set(this.geo.polys[n].map((p) => p[2])), sh = a.filter((p) => b.has(p[2]));
          if (sh.length < 2) return;
          const [x1, y1] = this.proj(sh[0][0], sh[0][1], W, H), [x2, y2] = this.proj(sh[1][0], sh[1][1], W, H);
          if (Math.abs(x1 - x2) > W / 2) return;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        };
        if (this.overlays.has("borders")) for (const [c, g] of own) for (let k = nb.neighborOffsets[c]; k < nb.neighborOffsets[c + 1]; k++) {
          const n = nb.neighborIds[k], o = own.get(n);
          if (g.stateId && (!o || o.stateId !== g.stateId) && c < n + 1e9) edge(c, n);
        }
        if (this.overlays.has("war")) {
          ctx.strokeStyle = "#d0605a";
          ctx.lineWidth = 2.2 / v.k;
          ctx.setLineDash([5 / v.k, 3 / v.k]);
          for (const [c, g] of own) if (g.stateId && warring.has(g.stateId)) for (let k = nb.neighborOffsets[c]; k < nb.neighborOffsets[c + 1]; k++) {
            const n = nb.neighborIds[k], o = own.get(n);
            if (!o || o.stateId !== g.stateId) edge(c, n);
          }
          ctx.setLineDash([]);
        }
      }
      if (this.overlays.has("cities")) {
        ctx.fillStyle = "#f2d27a";
        ctx.strokeStyle = "#14161a";
        ctx.lineWidth = 1 / v.k;
        for (const s of Object.values(civ3.settlements)) {
          if (s.pop < 800) continue;
          const [x, y] = this.proj(this.geo.cen[s.cell * 2], this.geo.cen[s.cell * 2 + 1], W, H);
          ctx.beginPath();
          ctx.arc(x, y, (s.stage === "city" ? 3.2 : 2) / Math.sqrt(v.k), 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (this.sel) {
        ctx.strokeStyle = "#d8b45a";
        ctx.lineWidth = 2 / v.k;
        for (const [c, g] of own) if (g.stateId === this.sel) {
          this.path(ctx, c, W, H);
          ctx.stroke();
        }
      }
    }
    click(e) {
      const r = this.cv.getBoundingClientRect(), v = this.view, x = ((e.clientX - r.left) * (this.cv.width / r.width) - v.x) / v.k, y = ((e.clientY - r.top) * (this.cv.height / r.height) - v.y) / v.k, W = this.cv.width, H = this.cv.height, lon = x / W * TAU - Math.PI, lat = Math.PI / 2 - y / H * Math.PI;
      let best = -1, bd = 9;
      for (let c = 0; c < this.geo.N; c++) {
        let dl = Math.abs(this.geo.cen[c * 2] - lon);
        if (dl > Math.PI) dl = TAU - dl;
        const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const g = this.owner().get(best), st = Object.values(this.w.civ.settlements).find((s) => s.cell === best);
      this.onPick?.({ cell: best, stateId: g?.stateId ?? null, group: g ?? null, settlement: st ?? null, x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  // js/ui/v6/trees.js
  function panZoom(svg, W, H) {
    let vb = { x: 0, y: 0, w: W, h: H };
    const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
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
      vb = { x: 0, y: 0, w: W, h: H };
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
    const DX = 150, DY = 26, maxD = Math.max(0, ...[...pos.values()].map((p) => p.d)), W = 40 + (maxD + 1) * DX, H = Math.max(120, 30 + row * DY), svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMinYMin meet", style: "height:" + Math.min(380, Math.max(160, H)) + "px" });
    for (const x of items) {
      const p = pos.get(x.id), q2 = x.parent && pos.get(x.parent);
      if (p && q2) svg.append(sv("path", { d: `M${20 + q2.d * DX + 120} ${20 + q2.y * DY}C${20 + q2.d * DX + 135} ${20 + q2.y * DY} ${20 + p.d * DX - 15} ${20 + p.y * DY} ${20 + p.d * DX} ${20 + p.y * DY}`, fill: "none", stroke: "#4a515c", "stroke-width": 1.2 }));
    }
    const pz = panZoom(svg, W, H);
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
  function techTree({ techs, status, onPick, selected }) {
    const fields = [...new Set(techs.map((t) => t.field))], quad = (f) => fields.indexOf(f) % 4, ang = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2], R = 90, W = 1e3, H = 1e3, svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, style: "height:420px" });
    const byField = /* @__PURE__ */ new Map();
    for (const t of techs) (byField.get(t.field) ?? byField.set(t.field, []).get(t.field)).push(t);
    const pos = /* @__PURE__ */ new Map();
    fields.forEach((f, fi) => {
      const list = byField.get(f).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1)), q2 = quad(f), sub2 = Math.floor(fi / 4), base = ang[q2] + (sub2 % 2 ? 0.33 : -0.33) * (sub2 ? 1 : 0), tiers = /* @__PURE__ */ new Map();
      for (const t of list) (tiers.get(t.tier) ?? tiers.set(t.tier, []).get(t.tier)).push(t);
      for (const [tier, arr] of tiers) arr.forEach((t, i) => {
        const a = base + (i - (arr.length - 1) / 2) * 0.17, r = R + tier * 105;
        pos.set(t.key, { x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) });
      });
    });
    svg.append(sv("circle", { cx: 500, cy: 500, r: 38, fill: "#1a1d23", stroke: "#d8b45a" }), sv("text", { x: 500, y: 504, "text-anchor": "middle", "font-size": 12, fill: "#d9d6cc" }, "\u6280\u8853"));
    for (const t of techs) for (const p of t.prereq) {
      const a = pos.get(p), b = pos.get(t.key);
      if (a && b) svg.append(sv("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: status(t) === "locked" ? "#2f353e" : "#6fa8c9", "stroke-width": 1.2, opacity: 0.7 }));
      else if (b) svg.append(sv("line", { x1: 500, y1: 500, x2: b.x, y2: b.y, stroke: "#2f353e", opacity: 0.4 }));
    }
    const pz = panZoom(svg, W, H);
    pz.set({ x: 500 - 230, y: 500 - 230, w: 460, h: 460 });
    const COL = { adopted: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], known: ["#a58bd0", "#201a2e"], locked: ["#4a515c", "#14161a"] };
    for (const t of techs) {
      const p = pos.get(t.key), s = status(t), [stroke, fill] = COL[s];
      svg.append(sv("g", { class: "tnode", onclick: () => {
        if (!pz.moved) onPick(t);
      } }, sv("rect", { x: p.x - 42, y: p.y - 12, width: 84, height: 24, fill, stroke: selected === t.key ? "#fff" : stroke, "stroke-width": s === "adopted" ? 2.6 : 1.4, "stroke-dasharray": s === "locked" ? "4 3" : null }), sv("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", "font-size": 12, fill: s === "locked" ? "#838995" : "#d9d6cc" }, t.name.slice(0, 7))));
    }
    return { svg, fields, COL };
  }
  function doctrineTree({ list, status, onPick, selected }) {
    const groups = [list.filter((d) => !d.polity), list.filter((d) => d.polity)], tiers = Math.max(...list.map((d) => d.tier)), pos = /* @__PURE__ */ new Map(), DX = 150, DY = 30;
    let yOff = 20;
    for (const g of groups) {
      const cnt = /* @__PURE__ */ new Map();
      g.sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1)).forEach((d) => {
        const i = cnt.get(d.tier) ?? 0;
        cnt.set(d.tier, i + 1);
        pos.set(d.id, { x: 20 + (d.tier - 1) * DX, y: yOff + i * DY });
      });
      yOff += Math.max(0, ...cnt.values()) * DY + 28;
    }
    const W = 40 + tiers * DX, H = yOff, svg = sv("svg", { class: "tree", viewBox: `0 0 ${W} ${H}`, style: "height:" + Math.min(420, H) + "px" });
    for (const d of list) for (const p of d.prereq) {
      const a = pos.get(p), b = pos.get(d.id);
      if (a && b) svg.append(sv("path", { d: `M${a.x + 124} ${a.y + 10}L${b.x} ${b.y + 10}`, stroke: "#4a515c", fill: "none" }));
    }
    const pz = panZoom(svg, W, H), COL = { taken: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], blocked: ["#4a515c", "#14161a"] };
    svg.append(sv("text", { x: 20, y: 12, "font-size": 11, fill: "#a1a6b0" }, "\u5171\u901A\u306E\u7CFB\u7D71"));
    if (groups[1].length) svg.append(sv("text", { x: 20, y: pos.get(groups[1][0].id).y - 8, "font-size": 11, fill: "#a58bd0" }, "\u653F\u4F53\u56FA\u6709\u306E\u7CFB\u7D71"));
    for (const d of list) {
      const p = pos.get(d.id), s = status(d), [stroke, fill] = COL[s];
      svg.append(sv("g", { class: "tnode", onclick: () => {
        if (!pz.moved) onPick(d);
      } }, sv("rect", { x: p.x, y: p.y, width: 124, height: 22, fill, stroke: selected === d.id ? "#fff" : stroke, "stroke-width": s === "taken" ? 2.4 : 1.2, "stroke-dasharray": s === "blocked" ? "4 3" : null }), sv("text", { x: p.x + 6, y: p.y + 15, "font-size": 11, fill: s === "blocked" ? "#838995" : "#d9d6cc" }, d.ja.slice(0, 9))));
    }
    return { svg, COL };
  }

  // js/ui/v6/views-a.js
  init_tech();
  var civ = () => S.w.civ;
  var date = (mi) => formatWorldDate(S.w, mi);
  var link = (id) => civ().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => {
    e.preventDefault();
    S.hooks.select(id);
  } }, stateName(id)) : String(id);
  var note = (t) => h("p", { class: "n" }, t);
  var why = (t) => h("p", { class: "n err", id: "why" }, t);
  function pGeo() {
    const M = S.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "\u5730\u7406"), note("\u5857\u308A\u306F 1 \u3064\u3001\u91CD\u306D\u306F\u8907\u6570\u3092\u540C\u6642\u306B\u8868\u793A\u3067\u304D\u307E\u3059\u3002\u9805\u76EE\u540D\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u51E1\u4F8B\u304C\u958B\u304D\u307E\u3059\u3002\u5730\u56F3\u306F\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u3001\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u3002"), lb("\u5857\u308A", "FILL"));
    const legend = (key) => S.layerOpen === key ? h("div", { class: "lg", style: "flex-direction:column;gap:3px;margin:2px 0 8px 22px" }, ...M.legend(key).map((x) => h("span", {}, x.c ? h("i", { style: `background:${x.c}` }) : x.dot ? h("i", { style: `background:${x.dot};border-radius:50%` }) : h("i", { style: `border-top:2px ${x.dash ? "dashed" : "solid"} ${x.dash ?? x.line};height:0` }), x.t))) : null;
    for (const [k, ja] of FILLS) {
      box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "radio", name: "fill", id: "fill-" + k, checked: M.fillLayer === k, onchange: () => {
        M.fillLayer = k;
        S.hooks.mapOnly();
      } }), h("span", { class: "g", onclick: () => {
        S.layerOpen = S.layerOpen === k ? null : k;
        S.hooks.panel();
      } }, ja)), legend(k)));
    }
    box.append(lb("\u91CD\u306D", "OVERLAY"));
    for (const [k, ja] of OVERLAYS) {
      box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ov-" + k, checked: M.overlays.has(k), onchange: (e) => {
        e.target.checked ? M.overlays.add(k) : M.overlays.delete(k);
        S.hooks.mapOnly();
      } }), h("span", { class: "g", onclick: () => {
        S.layerOpen = S.layerOpen === k ? null : k;
        S.hooks.panel();
      } }, ja)), legend(k)));
    }
    return box.append(note("\u751F\u6210\u5F8C\u306E\u5730\u5F62\u30FB\u6C17\u5019\u30FB\u8CC7\u6E90\u3092\u624B\u3067\u7DE8\u96C6\u3059\u308B\u6A5F\u80FD\u306F\u8A2D\u3051\u3066\u3044\u307E\u305B\u3093\u3002"), h("div", { class: "rowb" }, btn("\u8868\u793A\u3092\u521D\u671F\u4F4D\u7F6E\u3078", () => {
      M.view = { x: 0, y: 0, k: 1 };
      M.draw();
    }))) || box;
  }
  function pNations() {
    const c = civ(), all = Object.values(c.states).filter((s) => S.showDead ? true : s.alive), list = all.sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "\u56FD\u5BB6"));
    if (S.sel && c.states[S.sel]) box.append(stateDetail(c.states[S.sel]));
    box.append(lb("\u56FD\u5BB6\u4E00\u89A7", "\u65B0\u3057\u3044\u9806"), h("div", { class: "rowb" }, h("label", {}, h("input", { type: "checkbox", id: "show-dead", checked: !!S.showDead, onchange: (e) => {
      S.showDead = e.target.checked;
      S.hooks.panel();
    } }), " \u6EC5\u4EA1\u3057\u305F\u56FD\u5BB6\u3082\u8868\u793A")), note(`${list.length} \u4EF6\u3002\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u958B\u304D\u307E\u3059\uFF08\u30AF\u30EA\u30C3\u30AF\u3060\u3051\u3067\u306F\u62C5\u5F53\u306F\u5909\u308F\u308A\u307E\u305B\u3093\uFF09\u3002`));
    box.append(vlist(list, 26, (s) => h("div", { class: "vrow" + (S.sel === s.id ? " on" : ""), onclick: () => S.hooks.select(s.id) }, h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", { style: "color:var(--dim)" }, ` ${s.alive ? "\u4EBA\u53E3 " + n0(s.pop) : "\u6EC5\u4EA1"}\u30FB\u6210\u7ACB ${date(s.formedAt).split("\u6708")[0]}\u6708`))));
    return box;
  }
  function stateDetail(st) {
    const c = civ(), mine = controlled() === st.id, tabs = [["politics", "\u5185\u653F"], ["military", "\u8ECD\u4E8B"], ["diplomacy", "\u5916\u4EA4"], ["tech", "\u6280\u8853\u30C4\u30EA\u30FC"], ["doctrine", "\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"]];
    const body = { politics: tPolitics, military: tMilitary, diplomacy: tDiplomacy, tech: tTech, doctrine: tDoctrine }[S.tab](st, mine);
    return h(
      "div",
      { class: "rs" },
      h("div", { class: "card br" }, h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st.id)}` }), st.name), h("div", { class: "sub" }, `${polityJa(st.polity)}${st.alive ? "" : "\u30FB\u6EC5\u4EA1"}\u30FB\u6210\u7ACB ${date(st.formedAt)}`), h("div", { class: "rowb" }, mine ? btn("\u62C5\u5F53\u3092\u89E3\u9664\u3059\u308B", () => {
        run({ type: "control.release" });
        S.hooks.render();
      }, "p", { id: "release" }) : btn("\u3053\u306E\u56FD\u3092\u62C5\u5F53\u3059\u308B", () => {
        run({ type: "control.take", stateId: st.id });
        S.hooks.render();
      }, "p", { id: "take", disabled: !st.alive }), mine ? h("small", { style: "color:var(--purple)" }, "\u62C5\u5F53\u4E2D\uFF08\u64CD\u4F5C\u306F\u62C5\u5F53\u56FD\u306E\u307F\uFF09") : h("small", { style: "color:var(--dim)" }, "\u95B2\u89A7\u4E2D\uFF08\u62C5\u5F53\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF09"))),
      h("div", { class: "tabs" }, ...tabs.map(([k, ja]) => h("b", { class: S.tab === k ? "on" : "", "data-tab": k, onclick: () => {
        S.tab = k;
        S.hooks.panel();
      } }, ja))),
      S.notice ? why(S.notice) : null,
      body
    );
  }
  var factionRows = (st) => Object.entries(st.politics?.factions ?? {});
  function tPolitics(st, mine) {
    const c = civ(), P = st.politics, L = st.leader, leg = P ? effective(c, st, "legitimacy") : 0, fat = P ? effective(c, st, "fatigue") : 0;
    const finBtn = stat("\u8CA1\u653F\uFF08\u8A73\u7D30\u3092\u958B\u304F\uFF09", n0(st.treasury));
    finBtn.id = "fin-open";
    finBtn.style.cursor = "pointer";
    finBtn.addEventListener("click", () => {
      S.fin = !S.fin;
      S.hooks.panel();
    });
    const out = h("div", {}, h("div", { class: "st", style: "grid-template-columns:repeat(3,1fr)" }, stat("\u4EBA\u53E3", n0(st.pop)), finBtn, stat("\u5B89\u5B9A\u5EA6", pct(st.stability)), stat("\u75B2\u52B4\u5EA6", pct(fat)), stat("\u7523\u696D\u529B", n0(effective(c, st, "industry"))), stat("\u6B63\u7D71\u6027", pct(leg))));
    if (S.fin) out.append(finance(st, mine));
    out.append(lb("\u70BA\u653F\u8005", "RULER"), h("div", { class: "row" }, face(L?.name ?? "\u2014", st.id), h("span", { class: "g" }, h("b", {}, L?.name ?? "\u2014"), h("br"), h("small", {}, `${polityJa(st.polity)}\u30FB${L?.heir ? "\u7D99\u627F\u8005\u3092\u6307\u540D\u6E08\u307F" : "\u7D99\u627F\u8005\u306F\u672A\u6307\u540D"}`))));
    const rl = h("div", { class: "rowb" }, btn("\u7D99\u627F\u8005\u3092\u6307\u540D", () => act({ type: "state.act", stateId: st.id, action: "designate_heir" }), "", { disabled: !mine || !!L?.heir, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }));
    const nm = h("input", { id: "leader-name", placeholder: "\u70BA\u653F\u8005\u306E\u540D\u524D\uFF08\u5275\u9020\u4E3B\u306E\u7DE8\u96C6\uFF09", value: L?.name ?? "" });
    rl.append(nm, btn("\u540D\u524D\u3092\u5909\u66F4", () => creator({ type: "creator.editState", stateId: st.id, changes: { "leader.name": nm.value } })));
    out.append(rl, note("\u70BA\u653F\u8005\u306E\u4EA4\u4EE3\u306F\u3001\u7D99\u627F\u30FB\u653F\u5909\u306A\u3069\u306E\u51FA\u6765\u4E8B\u3068\u3057\u3066\u8D77\u304D\u307E\u3059\u3002\u4EFB\u610F\u306E\u4EBA\u7269\u3078\u306E\u5DEE\u3057\u66FF\u3048\u547D\u4EE4\u306F\u3001\u6210\u7ACB\u6761\u4EF6\u306E\u691C\u8A3C\u304C\u30C9\u30E1\u30A4\u30F3\u306B\u7121\u3044\u305F\u3081\u8A2D\u3051\u3066\u3044\u307E\u305B\u3093\uFF08\u6307\u540D\u3068\u540D\u524D\u306E\u7DE8\u96C6\u306E\u307F\uFF09\u3002"));
    const sn = h("input", { id: "state-name", value: st.name }), pol = h("select", { id: "polity-sel" }, ...Object.entries(POLITY_JA).map(([k, ja]) => h("option", { value: k, selected: k === st.polity }, ja)));
    out.append(lb("\u540D\u79F0\u30FB\u653F\u4F53", "IDENTITY"), h("div", { class: "rowb" }, sn, btn("\u56FD\u540D\u3092\u5909\u66F4", () => creator({ type: "creator.editState", stateId: st.id, changes: { name: sn.value } }))), h("div", { class: "rowb" }, pol, btn("\u653F\u4F53\u3092\u5909\u66F4\uFF08\u5275\u9020\u4E3B\uFF09", () => creator({ type: "creator.editState", stateId: st.id, changes: { polity: pol.value } })), btn("\u653F\u4F53\u5909\u66F4\uFF08\u884C\u52D5\uFF09", () => act({ type: "state.act", stateId: st.id, action: "change_polity", opt: pol.value }), "", { disabled: !mine })), note("\u540D\u79F0\u306E\u5909\u66F4\u306F\u8868\u793A\u540D\u3060\u3051\u3092\u5909\u3048\u307E\u3059\u3002\u56FD\u5BB6\u306E\u5206\u88C2\u30FB\u7D99\u627F\u306A\u3069\u306E\u5B9F\u4F53\u306E\u5909\u66F4\u3068\u306F\u5225\u3067\u3059\u3002"));
    if (P) {
      const rows = factionRows(st);
      out.append(lb("\u652F\u6301\u52E2\u529B", "FACTIONS"), ...rows.map(([k, v]) => h("div", { class: "fr" }, h("div", { class: "t" }, h("span", {}, FACTION_JA[k] ?? k), h("span", {}, `\u652F\u6301 ${pct(v.support)}\u30FB\u5F71\u97FF\u529B ${pct(v.influence)}`)), h("div", { class: "bar" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })))), P.assembly ? h("div", {}, h("small", {}, "\u8B70\u4F1A\uFF08\u8B70\u5E2D\u306F\u5F71\u97FF\u529B\u306B\u6BD4\u4F8B\uFF09"), hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : note("\u3053\u306E\u653F\u4F53\u306B\u306F\u8B70\u4F1A\u304C\u3042\u308A\u307E\u305B\u3093\u3002"));
    }
    out.append(creatorBox(st));
    return out;
  }
  function finance(st, mine) {
    const c = civ(), tax = st.pop * st.policy.tax * 12e-4 * taxMult(st), trade = effective(c, st, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"], items = [["\u7A0E\u53CE\uFF08\u5E74\u306E\u76EE\u5B89\uFF09", tax], ["\u4EA4\u6613\u53CE\u5165\uFF08\u76F4\u8FD1\u306E\u671F\uFF09", trade]];
    return h("div", { class: "card", id: "fin" }, h("b", {}, "\u8CA1\u653F\u306E\u8A73\u7D30"), h("div", { class: "row" }, donut(items, cols), h("span", { class: "g" }, ...items.map((x, i) => h("div", {}, h("i", { style: `display:inline-block;width:10px;height:10px;background:${cols[i]};margin-right:5px` }), `${x[0]} ${n0(x[1])}`)), h("div", { class: "n" }, `\u7A0E\u7387 ${pct(st.policy.tax)}\uFF08\u4E0A\u9650 ${pct(st.politics?.taxCeiling ?? 0.4)}\uFF09\u30FB\u56FD\u5EAB ${n0(st.treasury)}`))), h("div", { class: "rowb" }, btn("\u5897\u7A0E\uFF08+5%\uFF09", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }), btn("\u6E1B\u7A0E\uFF08\u22125%\uFF09", () => act({ type: "state.act", stateId: st.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine })), note("\u7A0E\u7387\u306E\u5909\u66F4\u306F\u3001\u6B21\u306E\u7A0E\u53CE\u306E\u8A08\u7B97\u306B\u305D\u306E\u307E\u307E\u53CD\u6620\u3055\u308C\u307E\u3059\u3002\u5185\u8A33\u306F\u3001\u5B9F\u969B\u306E\u8A08\u7B97\u5F0F\uFF08\u4EBA\u53E3\xD7\u7A0E\u7387\xD7\u6280\u8853\u306E\u500D\u7387\uFF09\u304B\u3089\u6C42\u3081\u3066\u3044\u307E\u3059\u3002"));
  }
  function creatorBox(st) {
    const c = civ(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f]) => h("option", { value: k }, f.ja))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "\u534A\u6E1B\u671F(\u6708)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "\u7406\u7531\u306E\u6CE8\u91C8" }), info = h("p", { class: "n", id: "iv-info" });
    const upd = () => {
      const k = field.value, nm = nominalOf(c, st, k);
      info.textContent = nm == null ? "\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093" : `\u901A\u5E38\u8A08\u7B97\u5024 ${r23(nm)}\u30FB\u6709\u52B9\u5024 ${r23(effective(c, st, k))}\u30FB\u7BC4\u56F2 ${FIELDS[k].min}\u301C${FIELDS[k].max}\u30FB\u65E2\u5B9A\u306E\u534A\u6E1B\u671F ${FIELDS[k].half}\u304B\u6708`;
    };
    field.addEventListener("change", upd);
    setTimeout(upd, 0);
    const mineIv = interventionsOf(c).filter((r) => r.targetId === st.id).slice(-6).reverse();
    return h(
      "div",
      {},
      lb("\u5275\u9020\u4E3B\u306E\u4ECB\u5165", "INTERVENTION"),
      note("\u8A08\u7B97\u3055\u308C\u308B\u5024\u306B\u4E00\u6642\u7684\u306A\u88DC\u6B63\u3092\u5165\u308C\u307E\u3059\u3002\u88DC\u6B63\u306F\u6642\u9593\u3068\u3068\u3082\u306B\u901A\u5E38\u5024\u3078\u623B\u308A\u307E\u3059\u304C\u3001\u4ECB\u5165\u4E2D\u306B\u8D77\u304D\u305F\u7D50\u679C\u306F\u623B\u308A\u307E\u305B\u3093\u3002"),
      h("div", { class: "rowb" }, field, val, half),
      rsn,
      h("div", { class: "rowb" }, btn("\u4ECB\u5165\u3059\u308B", () => creator({ type: "creator.intervene", stateId: st.id, field: field.value, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })),
      info,
      ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field} \u2192 ${r23(r.target)}`, h("br"), h("small", {}, `${{ active: "\u6709\u52B9\uFF08\u6B8B\u308A " + r23(r.residual) + "\uFF09", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" }[r.status]}\u30FB${date(r.startMonth)}${r.reason ? "\u30FB" + r.reason : ""}`)), r.status === "active" ? btn("\u53D6\u308A\u6D88\u3059", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null))
    );
  }
  function tMilitary(st, mine) {
    const c = civ(), M = st.military;
    if (!M) return note("\u8ECD\u4E8B\u306E\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
    const foes = aliveStates().filter((x) => x.id !== st.id).sort((a, b) => b.pop - a.pop), sel = h("select", { id: "wl-target" }, ...foes.slice(0, 40).map((x) => h("option", { value: x.id }, x.name))), out = h("div", { id: "wl-out" });
    const show = () => {
      const p = predictWar(c, st.id, sel.value, S.w.sim.ctx);
      out.replaceChildren(p ? warlabView(p) : "\u4E88\u6E2C\u3067\u304D\u307E\u305B\u3093");
    };
    sel.addEventListener("change", show);
    setTimeout(() => sel.isConnected && show(), 0);
    const shares = M.shares ?? {}, inputs = Object.entries(UNIT_KINDS).map(([k, u]) => [k, h("input", { type: "number", step: "0.05", min: 0, max: 1, value: r23(shares[k] ?? 0), style: "width:62px", "data-kind": k })]);
    return h(
      "div",
      {},
      h("div", { class: "st", style: "grid-template-columns:repeat(2,1fr)" }, stat("\u5175\u529B", n0(st.army)), stat("\u8ECD\u4E8B\u80FD\u529B", (st.milBonus >= 0 ? "+" : "") + pct(st.milBonus)), stat("\u88C5\u5099\u6C34\u6E96\uFF08\u6709\u52B9\u5024\uFF09", pct(effective(c, st, "equipLevel"))), stat("\u7DF4\u5EA6\uFF08\u6709\u52B9\u5024\uFF09", pct(effective(c, st, "readiness")))),
      lb("\u90E8\u968A", "UNITS"),
      table(["\u90E8\u968A", "\u898F\u6A21", "\u88C5\u5099", "\u7DF4\u5EA6"], M.units.map((u) => [u.name, n0(u.size), pct(u.equip), pct(u.readiness)])),
      note(`\u5145\u8DB3\u306F\u7523\u696D\u529B\u30FB\u88C5\u5099\u6761\u4EF6\u304B\u3089\u7B97\u51FA\u3055\u308C\u3001\u4ECB\u5165\u304C\u3042\u308C\u3070\u6709\u52B9\u5024\u3092\u4F7F\u3044\u307E\u3059\uFF08\u7523\u696D\u529B ${n0(effective(c, st, "industry"))}\uFF09\u3002`),
      lb("\u7DE8\u5236", "ORGANIZATION"),
      h("div", { class: "rowb" }, ...inputs.map(([k, el]) => h("label", {}, UNIT_KINDS[k].ja + " ", el))),
      h("div", { class: "rowb" }, btn("\u7DE8\u5236\u3092\u5909\u66F4", () => {
        const s = {};
        for (const [k, el] of inputs) s[k] = Number(el.value) || 0;
        const r = (mine ? act : creator)({ type: "state.reorganize", stateId: st.id, shares: s });
      }, "", { id: "reorg" })),
      note("\u5408\u8A08\u306F 1\u3002\u6761\u4EF6\uFF08\u6280\u8853\u30FB\u5730\u7406\uFF09\u3068\u8CBB\u7528\u3092\u6E80\u305F\u3055\u306A\u3044\u7DE8\u5236\u306F\u7406\u7531\u3064\u304D\u3067\u62D2\u5426\u3055\u308C\u307E\u3059\u3002\u62C5\u5F53\u56FD\u307E\u305F\u306F\u5275\u9020\u4E3B\u304C\u5909\u66F4\u3067\u304D\u307E\u3059\u3002"),
      lb("\u5BA3\u6226", "WAR"),
      h("div", { class: "rowb" }, btn("\u9078\u3093\u3060\u56FD\u3078\u5BA3\u6226\u3059\u308B", () => act({ type: "state.act", stateId: st.id, action: "declare_war", target: sel.value }), "", { id: "declare", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }), !mine ? h("small", { style: "color:var(--dim)" }, "\u62C5\u5F53\u56FD\u306E\u307F\u5B9F\u884C\u3067\u304D\u307E\u3059") : null),
      sel,
      lb("\u6226\u4E89\u7814\u7A76\u6240\uFF08\u4E88\u6E2C\uFF09", "WAR LAB"),
      note("\u3053\u306E\u56FD\u304C\u653B\u3081\u308B\u5834\u5408\u306E\u898B\u901A\u3057\u3067\u3059\u3002\u78BA\u5B9A\u3057\u305F\u672A\u6765\u3067\u306F\u306A\u304F\u3001\u4E16\u754C\u306E\u72B6\u614B\u306F\u5909\u3048\u307E\u305B\u3093\u3002"),
      out
    );
  }
  function warlabView(p) {
    return h("div", {}, h("div", {}, `\u52DD\u5229 ${pct(p.pAWin)}\uFF08${pct(p.pAWinRange[0])}\u301C${pct(p.pAWinRange[1])}\uFF09\u30FB\u5F15\u304D\u5206\u3051 ${pct(p.pStalemate)}\u30FB\u6557\u5317 ${pct(p.pBWin)}`), h("div", { class: "bar" }, h("i", { style: `width:${p.pAWin * 100}%;background:var(--blue)` }), h("i", { style: `width:${p.pStalemate * 100}%;background:#6a6f78` }), h("i", { style: `width:${p.pBWin * 100}%;background:var(--red)` })), h("div", { class: "n" }, `\u898B\u8FBC\u307F\u306E\u640D\u8017: \u81EA\u8ECD ${pct(p.lossA)} / \u76F8\u624B ${pct(p.lossB)}\u30FB\u9577\u5F15\u304F\u76EE\u5B89 ${p.months}\u304B\u6708\u30FB\u4E0D\u78BA\u5B9F\u6027 ${pct(p.uncertainty)}`), table(["\u8981\u56E0", stateName(p.aId), stateName(p.bId)], p.factors.map((x) => [x.ja, x.a, x.b])));
  }
  function tDiplomacy(st, mine) {
    const c = civ(), others = aliveStates().filter((x) => x.id !== st.id).sort((a, b) => (st.relations[b.id] ?? 0) - (st.relations[a.id] ?? 0)), sel = h("select", { id: "dp-target" }, ...others.slice(0, 40).map((x) => h("option", { value: x.id }, `${x.name}\uFF08\u95A2\u4FC2 ${Math.round(st.relations[x.id] ?? 0)}\uFF09`))), type = h("select", { id: "dp-type" }, ...Object.entries(TREATY).map(([k, v]) => h("option", { value: k }, v.ja))), out = h("div", { id: "dp-out" });
    const prev = () => {
      const to = c.states[sel.value];
      if (!to) return;
      const e = evaluateTreaty(c, st, to, type.value);
      out.replaceChildren(h("div", {}, `\u76F8\u624B\u306E\u8A55\u4FA1: ${e.accept ? "\u53D7\u3051\u5165\u308C\u305D\u3046" : "\u65AD\u3089\u308C\u305D\u3046"}\uFF08${e.score}\uFF09${e.counter ? "\u30FB\u5225\u6761\u4EF6: " + TREATY[e.counter.type].ja : ""}`), ...e.factors.map((f) => h("small", { style: "display:block;color:var(--dim)" }, `${f.ja} ${f.v}`)));
    };
    sel.addEventListener("change", prev);
    type.addEventListener("change", prev);
    setTimeout(() => sel.isConnected && prev(), 0);
    const tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st.id || t.b === st.id), wars = st.warIds.map((i) => c.wars[i]).filter(Boolean), hist = proposalsOf(c).filter((p) => p.from === st.id || p.to === st.id).slice(-8).reverse();
    return h(
      "div",
      {},
      lb("\u95A2\u4FC2\u306E\u826F\u3044\u56FD", "RELATIONS"),
      table(["\u56FD", "\u95A2\u4FC2"], others.slice(0, 6).map((x) => [link(x.id), Math.round(st.relations[x.id] ?? 0)])),
      lb("\u7DE0\u7D50\u6E08\u307F\u306E\u6761\u7D04", "TREATIES"),
      tr.length ? table(["\u7A2E\u985E", "\u76F8\u624B", "\u7DE0\u7D50"], tr.map((t) => [TREATY[t.type]?.ja ?? t.type, link(t.a === st.id ? t.b : t.a), date(t.signedAt ?? t.at ?? 0)])) : note("\u306A\u3057"),
      lb("\u4EA4\u6226\u4E2D", "AT WAR"),
      wars.length ? h("div", {}, ...wars.map((x) => h("div", { class: "row" }, link(x.aggressor === st.id ? x.defender : x.aggressor), h("span", { class: "g" }), btn("\u6226\u4E89\u306E\u8A73\u7D30\u3078", () => {
        S.war = x.id;
        S.hub = "war";
        S.hooks.render();
      })))) : note("\u306A\u3057\u3002\u8B1B\u548C\u306F\u4E00\u822C\u6761\u7D04\u3067\u306F\u306A\u304F\u3001\u6226\u4E89\u306E\u8A73\u7D30\u304B\u3089\u884C\u3044\u307E\u3059\u3002"),
      lb("\u6761\u7D04\u3092\u63D0\u6848\u3059\u308B\uFF08\u8B1B\u548C\u3092\u9664\u304F\uFF09", "PROPOSE"),
      h("div", { class: "rowb" }, sel, type),
      h("div", { class: "rowb" }, btn("\u63D0\u6848\u3059\u308B", () => act({ type: "state.act", stateId: st.id, action: "sign_treaty", target: sel.value, opt: type.value }), "p", { id: "propose", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" })),
      out,
      note("\u6761\u7D04\u306F\u3001\u76F8\u624B\u56FD\u306E\u8A55\u4FA1\uFF08\u53D7\u8AFE\u30FB\u62D2\u5426\u30FB\u5225\u6761\u4EF6\uFF09\u3068\u3001\u76F4\u524D\u306E\u6761\u4EF6\u306E\u518D\u691C\u8A3C\u3092\u7D4C\u3066\u6210\u7ACB\u3057\u307E\u3059\u3002"),
      lb("\u4EA4\u6E09\u306E\u8A18\u9332", "NEGOTIATIONS"),
      ...hist.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "\u8B1B\u548C" : TREATY[p.type]?.ja} ${stateName(p.from)}\u2192${stateName(p.to)}`, h("br"), h("small", {}, date(p.at))), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status])))
    );
  }
  function techStatus(st) {
    const groups = Object.values(civ().groups).filter((g) => g.stateId === st.id), known = new Set(groups.flatMap((g) => Object.keys(g.tech?.known ?? {})));
    return (t) => st.techAdopted?.[t.key] != null ? "adopted" : t.prereq.every((p) => st.techAdopted?.[p] != null) && known.has(t.key) ? "available" : known.has(t.key) ? "known" : "locked";
  }
  function tTech(st, mine) {
    const status = techStatus(st), sel = TECH[S.tech] ?? null, { svg, COL } = techTree({ techs: TECHS, status, selected: S.tech, onPick: (t) => {
      S.tech = t.key;
      S.hooks.panel();
    } }), s = sel && status(sel), lab = { adopted: "\u63A1\u7528\u6E08\u307F", available: "\u63A1\u7528\u3067\u304D\u308B", known: "\u767A\u898B\u6E08\u307F\uFF08\u524D\u63D0\u304C\u672A\u63A1\u7528\u3067\u3001\u307E\u3060\u4F7F\u3048\u306A\u3044\uFF09", locked: "\u672A\u767A\u898B" };
    return h(
      "div",
      {},
      note(`\u5B9F\u30C7\u30FC\u30BF\u306E\u6280\u8853 ${TECHS.length} \u4EF6\u3092\u3001\u7CFB\u7D71\u3054\u3068\u306B\u56DB\u65B9\u4F4D\u3078\u3001\u968E\u5C64\u304C\u5916\u3078\u5E83\u304C\u308B\u5F62\u3067\u8868\u793A\u3057\u307E\u3059\u3002\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u3001\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u3002`),
      svg,
      h("div", { class: "rowb" }, btn("\u5168\u4F53\u3092\u8868\u793A", () => {
        svg.setAttribute("viewBox", "0 0 1000 1000");
      }), btn("\u4E2D\u5FC3\u3078\u623B\u308B", () => {
        svg.setAttribute("viewBox", "270 270 460 460");
      })),
      h("div", { class: "lg" }, ...Object.entries({ adopted: "\u63A1\u7528\u6E08\u307F", available: "\u63A1\u7528\u3067\u304D\u308B", known: "\u767A\u898B\u6E08\u307F\u30FB\u672A\u63A1\u7528", locked: "\u672A\u767A\u898B" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px solid ${COL[k][0]}` }), t))),
      sel ? h("div", { class: "dt" }, h("b", {}, sel.name), ` \uFF08${sel.field}\u30FB\u968E\u5C64 ${sel.tier}\uFF09`, h("br"), `\u72B6\u614B: ${lab[s]}`, h("br"), `\u524D\u63D0: ${sel.prereq.length ? sel.prereq.map((p) => TECH[p]?.name ?? p).join("\u30FB") : "\u306A\u3057"}\u30FB\u5FC5\u8981\u4EBA\u53E3 ${n0(sel.minPop)}\u30FB\u63A1\u7528\u8CBB\u7528 ${sel.tier * 15}`, h("div", { class: "rowb" }, btn("\u63A1\u7528\u3059\u308B", () => act({ type: "state.act", stateId: st.id, action: "adopt_tech", opt: sel.key }), "p", { id: "adopt-tech", disabled: !mine || s !== "available", title: mine ? s === "available" ? "" : "\u4ECA\u306F\u63A1\u7528\u3067\u304D\u307E\u305B\u3093" : "\u62C5\u5F53\u56FD\u306E\u307F" }))) : note("\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u524D\u63D0\u30FB\u72B6\u614B\u30FB\u63A1\u7528\u306E\u53EF\u5426\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002")
    );
  }
  function tDoctrine(st, mine) {
    const M = st.military, taken = M?.doctrine?.taken ?? {}, status = (d) => taken[d.id] != null ? "taken" : canAdopt(st, d.id).ok ? "available" : "blocked", sel = DOCTRINES.find((d) => d.id === S.doc) ?? null, { svg, COL } = doctrineTree({ list: DOCTRINES, status, selected: S.doc, onPick: (d) => {
      S.doc = d.id;
      S.hooks.panel();
    } });
    return h(
      "div",
      {},
      note(`\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3 ${DOCTRINES.length} \u4EF6\uFF08\u5171\u901A ${DOCTRINES.filter((d) => !d.polity).length}\u30FB\u653F\u4F53\u56FA\u6709 ${DOCTRINES.filter((d) => d.polity).length}\uFF09\u3002\u53D6\u5F97\u306F\u8ECD\u4E8B\u80FD\u529B\u30FB\u6226\u4E89\u7814\u7A76\u6240\u306E\u4E88\u6E2C\u30FB\u5B9F\u6226\u306B\u5F71\u97FF\u3057\u307E\u3059\u3002`),
      svg,
      h("div", { class: "lg" }, ...Object.entries({ taken: "\u53D6\u5F97\u6E08\u307F", available: "\u53D6\u5F97\u3067\u304D\u308B", blocked: "\u53D6\u5F97\u3067\u304D\u306A\u3044" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px solid ${COL[k][0]}` }), t))),
      sel ? (() => {
        const ca = canAdopt(st, sel.id);
        return h("div", { class: "dt" }, h("b", {}, sel.ja), `\uFF08\u968E\u5C64 ${sel.tier}${sel.polity ? "\u30FB" + polityJa(sel.polity) + "\u56FA\u6709" : "\u30FB\u5171\u901A"}\uFF09`, h("br"), `\u653B\u6483 +${pct(sel.off)}\u30FB\u9632\u5FA1 +${pct(sel.def)}\u30FB\u8CBB\u7528 ${sel.cost}`, h("br"), `\u524D\u63D0: ${sel.prereq.length ? sel.prereq.map((p) => DOCTRINES.find((x) => x.id === p)?.ja ?? p).join("\u30FB") : "\u306A\u3057"}${sel.tech.length ? "\uFF0F\u6280\u8853: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("\u30FB") : ""}`, h("br"), taken[sel.id] != null ? "\u53D6\u5F97\u6E08\u307F" : ca.ok ? "\u53D6\u5F97\u3067\u304D\u307E\u3059" : `\u53D6\u5F97\u3067\u304D\u306A\u3044\u7406\u7531: ${ca.reason}`, h("div", { class: "rowb" }, btn("\u53D6\u5F97\u3059\u308B", () => act({ type: "state.adoptDoctrine", stateId: st.id, doctrineId: sel.id }), "p", { id: "adopt-doc", disabled: !mine || !ca.ok, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" })));
      })() : note("\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u52B9\u679C\u30FB\u524D\u63D0\u30FB\u53D6\u5F97\u306E\u53EF\u5426\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002")
    );
  }

  // js/core/wcde/save-meta.js
  var APP_VERSION_FOR_SAVE = "6.0.0";

  // js/core/wcde/savefile.js
  var SAVE_FORMAT = "alterhistory-save";
  var SAVE_SCHEMA = 1;
  var MIN_SCHEMA = 1;
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
  var fin3 = (x) => typeof x === "number" && Number.isFinite(x);
  function packSave(w, { appVersion = APP_VERSION_FOR_SAVE, name = null } = {}) {
    const { civ: civ3 } = w, civText = JSON.stringify(civ3), meta = { name: name ?? civ3.wcde.config.name ?? null, monthIndex: civ3.monthIndex, date: { ...civ3.date }, states: Object.values(civ3.states).filter((s) => s.alive).length, events: civ3.events.length, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ3.wcde.config.worldSeed };
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
    if (d.format !== SAVE_FORMAT) return refuse(d.format === "alterhistory-wcde" ? "\u3053\u308C\u306F\u958B\u767A\u4E2D\u306E\u65E7\u5F62\u5F0F\uFF08alterhistory-wcde\uFF09\u3067\u3059\u3002v6.0.0 \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" : "AlterHistory \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08\u65E7 .ahmap\u30FB\u4ED6\u30A2\u30D7\u30EA\u306E\u5730\u56F3\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF09");
    if (!Number.isInteger(d.schema)) return refuse("\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\u304C\u3042\u308A\u307E\u305B\u3093");
    if (d.schema > SAVE_SCHEMA) return refuse(`\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u65B0\u3057\u3044\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059\u3002\u30A2\u30D7\u30EA\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u3053\u306E\u30A2\u30D7\u30EA\u306F\u7248 ${SAVE_SCHEMA} \u307E\u3067\uFF09`);
    if (d.schema < MIN_SCHEMA) return refuse(`\u53E4\u3059\u304E\u308B\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059`);
    const civ3 = d.civ;
    if (!civ3 || typeof civ3 !== "object") return refuse("\u4E16\u754C\u306E\u72B6\u614B\uFF08civ\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    const sum = checksum(JSON.stringify(civ3));
    if (d.checksum !== sum) {
      if (!allowChecksumMismatch) return refuse("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF08\u4FDD\u5B58\u5F8C\u306B\u5185\u5BB9\u304C\u5909\u308F\u3063\u305F\u304B\u3001\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF09\u3002\u8AAD\u307F\u8FBC\u307F\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F");
      warnings.push("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u304C\u3001\u5229\u7528\u8005\u306E\u6307\u793A\u3067\u3001\u691C\u8A3C\u3092\u901A\u308B\u5834\u5408\u306B\u9650\u3063\u3066\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F");
    }
    const need = [["monthIndex", fin3], ["date", (x) => x && typeof x === "object"], ["states", (x) => x && typeof x === "object" && !Array.isArray(x)], ["groups", (x) => x && typeof x === "object"], ["events", Array.isArray], ["wcde", (x) => x && typeof x === "object"], ["seq", (x) => x && typeof x === "object"], ["options", (x) => x && typeof x === "object"]];
    for (const [k, ok2] of need) if (!ok2(civ3[k])) return refuse(`\u5FC5\u9808\u9805\u76EE\u300C${k}\u300D\u304C\u306A\u3044\u304B\u3001\u578B\u304C\u9055\u3044\u307E\u3059`);
    if (!Number.isInteger(civ3.monthIndex) || civ3.monthIndex < 0) return refuse("\u6708\u306E\u756A\u53F7\uFF08monthIndex\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    if (!civ3.wcde.config?.spec || !civ3.wcde.config?.worldSeed) return refuse("\u4E16\u754C\u751F\u6210\u306E\u8A2D\u5B9A\uFF08config.spec / worldSeed\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    if (!["founding", "running"].includes(civ3.wcde.phase)) return refuse("\u6BB5\u968E\uFF08phase\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    for (const [id, s] of Object.entries(civ3.states)) {
      if (s.id !== id) return refuse(`\u56FD\u5BB6 ${id} \u306E ID \u304C\u4E00\u81F4\u3057\u307E\u305B\u3093`);
      for (const k of ["pop", "treasury", "stability", "army"]) if (!fin3(s[k])) return refuse(`\u56FD\u5BB6 ${id}.${k} \u304C\u6709\u9650\u306E\u6570\u3067\u306F\u3042\u308A\u307E\u305B\u3093`);
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

  // js/io/crc32.js
  var T2 = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
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
  var u16 = (n) => [n & 255, n >>> 8 & 255];
  var u32 = (n) => [n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255];
  function dosTime(d) {
    return [(d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1) & 65535, (d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()) & 65535];
  }
  async function zipFiles(files, { compress = true, date: date3 = /* @__PURE__ */ new Date(), onProgress = null } = {}) {
    const parts = [], central = [], [dt, dd] = dosTime(date3);
    let offset = 0, n = 0;
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
      n++;
      if (onProgress && n % 500 === 0) await onProgress(n);
    }
    let csize = 0;
    for (const c of central) csize += c.length;
    const big = n > 65534, tail2 = [];
    if (big) {
      const u64 = (x) => [...u32(x >>> 0), ...u32(Math.floor(x / 4294967296))];
      tail2.push(Uint8Array.from([80, 75, 6, 6, ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0), ...u64(n), ...u64(n), ...u64(csize), ...u64(offset)]), Uint8Array.from([80, 75, 6, 7, ...u32(0), ...u64(offset + csize), ...u32(1)]));
    }
    tail2.push(Uint8Array.from([80, 75, 5, 6, 0, 0, 0, 0, ...u16(big ? 65535 : n), ...u16(big ? 65535 : n), ...u32(csize), ...u32(offset), 0, 0]));
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
  var be32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
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
  init_history();
  init_tech();
  init_species();
  init_magic();
  init_world_consts();
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
  var r35 = (x) => Math.round(x * 1e3) / 1e3;
  var colorOf2 = (id) => {
    let h2 = 2166136261;
    for (const ch of String(id)) h2 = Math.imul(h2 ^ ch.charCodeAt(0), 16777619);
    const hue = (h2 >>> 0) % 360, s = 0.55 + (h2 >>> 9) % 30 / 100, l = 0.5 + (h2 >>> 17) % 20 / 100;
    const f = (n) => {
      const k = (n + hue / 30) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  function planPaths(world, civ3, opts = {}) {
    const P = /* @__PURE__ */ new Map(), add = (id, folder, name) => P.set(id, `${folder}/${safe(name)}__${id}`);
    for (const s of Object.values(civ3.states)) add(s.id, FOLDERS.state, s.name);
    for (const p of Object.values(civ3.persons)) add(p.id, FOLDERS.person, p.name);
    for (const w of Object.values(civ3.wars)) add(w.id, FOLDERS.war, `${civ3.states[w.aggressor]?.name ?? "?"}\u5BFE${civ3.states[w.defender]?.name ?? "?"}\u306E\u6226\u4E89`);
    for (const t of Object.values(civ3.treaties)) add(t.id, FOLDERS.treaty, `${civ3.states[t.a]?.name ?? "?"}\u3068${civ3.states[t.b]?.name ?? "?"}\u306E${TREATY_JA[t.type] ?? t.type}`);
    const lo = opts.fromMonth ?? -Infinity, hi = opts.toMonth ?? Infinity;
    for (const e of civ3.events) {
      const m = evMonth(e);
      if (m >= lo && m <= hi) add(e.eventId, e.kind === "battle_fought" ? FOLDERS.battle : FOLDERS.event, e.title);
    }
    if (opts.decisionNotes !== false) for (const d of civ3.decisions) {
      const m = d2mi(d.date);
      if (m >= lo && m <= hi) add(d.decisionId, FOLDERS.decision, `${civ3.states[d.actorId]?.name ?? d.actorId}\u306E\u5224\u65AD`);
    }
    for (const s of Object.values(civ3.settlements)) add(s.id, FOLDERS.settlement, `\u96C6\u843D ${STAGE_JA2[s.stage] ?? s.stage}`);
    for (const g of Object.values(civ3.groups)) add(g.id, FOLDERS.group, `\u96C6\u56E3 ${g.subsistence}`);
    for (const c of Object.values(civ3.cultures)) add(c.id, FOLDERS.culture, c.name);
    for (const l of Object.values(civ3.languages)) add(l.id, FOLDERS.language, l.name);
    for (const r of Object.values(civ3.religions)) add(r.id, FOLDERS.religion, r.name);
    for (const t of TECHS) P.set(`tech:${t.key}`, `${FOLDERS.tech}/${safe(t.name)}__${t.key}`);
    for (const s of Object.keys(civ3.species)) P.set(s, `${FOLDERS.species}/${safe(SPECIES[s]?.ja ?? s)}__${s}`);
    for (const a of Object.values(ABILITIES)) P.set(`ability:${a.id}`, `${FOLDERS.ability}/${safe(a.ja)}__${a.id}`);
    for (const o of Object.values(civ3.magic.orgs)) add(o.id, FOLDERS.org, o.name);
    for (const d of Object.values(civ3.disasters)) add(d.id, FOLDERS.disaster, `${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09`);
    for (const x of civ3.interpretations) add(x.interpId, FOLDERS.interp, `${civ3.states[x.ownerId]?.name ?? "?"}\u306E\u8A8D\u8B58 ${STANCE[x.stance] ?? x.stance}`);
    for (const w of civ3.works) add(w.workId, FOLDERS.work, `${civ3.states[w.authorId]?.name ?? "?"}\u306E\u5E74\u4EE3\u8A18`);
    for (const c of regionsOf(world)) P.set(`region:${c.id}`, `${FOLDERS.region}/${safe(c.name)}__region_${c.id}`);
    return P;
  }
  var TREATY_JA = { nonaggression: "\u4E0D\u53EF\u4FB5\u6761\u7D04", alliance: "\u540C\u76DF", trade: "\u901A\u5546\u6761\u7D04", defense: "\u9632\u885B\u5354\u5B9A", vassal: "\u5F93\u5C5E\u95A2\u4FC2", tribute: "\u671D\u8CA2" };
  var STAGE_JA2 = { camp: "\u91CE\u55B6\u5730", village: "\u6751", town: "\u753A", city: "\u90FD\u5E02", metropolis: "\u5927\u90FD\u5E02" };
  var OUTCOME_JA = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", negotiated: "\u8B1B\u548C", stalemate: "\u81A0\u7740" };
  var POLITY_JA2 = { tribal: "\u90E8\u65CF", chiefdom: "\u9996\u9577\u5236", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6" };
  function regionsOf(world) {
    const c = world.cell, n = c.continent.length, m = /* @__PURE__ */ new Map();
    for (let i = 0; i < n; i++) {
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
    const root2 = safe(worldName || "\u4E16\u754C"), P = planPaths(world, civ3, opts), ix = graphIndex(civ3), stats = { files: 0, unresolved: 0, outOfScope: 0, missing: [] }, counts = {};
    const from = opts.fromMonth ?? -Infinity, to = opts.toMonth ?? Infinity, inRange = (mi) => mi >= from && mi <= to, scoped = Number.isFinite(from) || Number.isFinite(to) || opts.decisionNotes === false;
    const link2 = (id, label) => {
      if (id === "world") return "\u4E16\u754C\u5168\u4F53";
      const p = P.get(id);
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
    const fin4 = (c) => c.replace(/\[\[/g, "\uFF3B\uFF3B").replace(/\]\]/g, "\uFF3D\uFF3D").replace(/\u0001/g, "[[").replace(/\u0002/g, "]]");
    const out = (kind, path, content) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}.md`, data: fin4(content), kind };
    };
    const outRaw = (kind, path, data) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}`, data, kind };
    };
    for (const s of Object.values(civ3.states)) {
      const evs = (ix.byEntity.get(s.id) ?? []).map((i) => civ3.events[i]).filter((e) => inRange(evMonth(e))), wars = Object.values(civ3.wars).filter((w) => w.sides.a.includes(s.id) || w.sides.d.includes(s.id)), trs = Object.values(civ3.treaties).filter((t) => t.a === s.id || t.b === s.id);
      const cap = civ3.groups[s.capitalGroupId], comp = s.alive ? compositionAt(civ3, s.id, civ3.monthIndex) : null;
      yield out("state", P.get(s.id), fm({ id: s.id, type: "\u56FD\u5BB6", name: s.name, \u6210\u7ACB: mi2s(s.formedAt), \u6EC5\u4EA1: s.alive ? null : mi2s(s.dissolvedAt), \u5B58\u7D9A\u4E2D: s.alive, \u6210\u7ACB\u7D4C\u8DEF: s.via, \u653F\u4F53: POLITY_JA2[s.polity] ?? s.polity, \u30D7\u30EC\u30A4\u30E4\u30FC\u56FD\u5BB6: !!s.player, \u524D\u8EAB: s.predecessor ?? null, tags: ["\u56FD\u5BB6"] }) + `# ${s.name}

- \u6210\u7ACB: ${mi2s(s.formedAt)}\uFF08${s.via}\uFF09${s.predecessor ? `\uFF0F\u524D\u8EAB: ${L(s.predecessor)}` : ""}
- ${s.alive ? "\u5B58\u7D9A\u4E2D" : `\u6EC5\u4EA1: ${mi2s(s.dissolvedAt)}`}
- \u653F\u4F53: ${POLITY_JA2[s.polity] ?? s.polity}\uFF0F\u6307\u5C0E\u8005: ${s.leader.name}\uFF08${s.leader.heir ? "\u5F8C\u7D99\u8005\u3042\u308A" : "\u5F8C\u7D99\u8005\u672A\u5B9A"}\uFF09
- \u9996\u90FD\uFF08\u96C6\u56E3\uFF09: ${cap ? link2(cap.id, "\u9996\u90FD\u306E\u96C6\u56E3") : "\u306A\u3057"}
- \u4EBA\u53E3 ${Math.round(s.pop)}\u30FB\u8CA1\u653F ${r1(s.treasury)}\u30FB\u5B89\u5B9A\u5EA6 ${r35(s.stability)}\u30FB\u5175\u529B ${Math.round(s.army)}\u30FB\u96C6\u843D ${s.settlements}
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
    for (const p of Object.values(civ3.persons)) yield out("person", P.get(p.id), fm({ id: p.id, type: "\u4EBA\u7269", name: p.name, \u7A2E\u65CF: p.speciesId, \u80FD\u529B: p.ability, \u5F37\u5EA6: p.power, \u51FA\u73FE: mi2s(p.emergedAt), \u6CA1: p.diedAt == null ? null : mi2s(p.diedAt), tags: ["\u4EBA\u7269", "\u9B54\u6CD5"] }) + `# ${p.name}

- \u7A2E\u65CF: ${link2(p.speciesId, SPECIES[p.speciesId]?.ja ?? p.speciesId)}
- \u80FD\u529B: ${link2(`ability:${p.ability}`, ABILITIES[p.ability].ja)}\uFF08\u5F37\u5EA6 ${p.power}\uFF09
- \u96C6\u56E3: ${civ3.groups[p.groupId] ? link2(p.groupId, "\u6240\u5C5E\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u7D44\u7E54: ${p.orgId ? L(p.orgId) : "\u306A\u3057"}
- ${p.diedAt == null ? "\u5B58\u547D" : `\u6CA1: ${mi2s(p.diedAt)}`}

## \u95A2\u308F\u3063\u305F\u51FA\u6765\u4E8B
${(ix.byEntity.get(p.id) ?? []).map((i) => civ3.events[i]).slice(0, 50).map((e) => `- ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const a of Object.values(ABILITIES)) yield out("ability", P.get(`ability:${a.id}`), fm({ id: a.id, type: "\u9B54\u6CD5\u306E\u80FD\u529B", name: a.ja, tags: ["\u9B54\u6CD5"] }) + `# ${a.ja}

- \u4EE3\u511F: ${a.cost}
- \u66B4\u767A\u306E\u5371\u967A: ${a.risk}
- \u7D20\u8CEA\u8005: ${Object.values(civ3.persons).filter((p) => p.ability === a.id).slice(0, 100).map((p) => L(p.id)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const o of Object.values(civ3.magic.orgs)) yield out("org", P.get(o.id), fm({ id: o.id, type: "\u9B54\u6CD5\u7D44\u7E54", name: o.name, \u7D50\u6210: mi2s(o.foundedAt), \u89E3\u6563: o.endedAt == null ? null : mi2s(o.endedAt), tags: ["\u9B54\u6CD5", "\u7D44\u7E54"] }) + `# ${o.name}

- \u7A2E\u5225: ${o.kind}
- \u56FD\u5BB6: ${L(o.stateId)}
- \u6210\u54E1: ${o.members.map((m) => L(m)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const [k, sp] of Object.entries(civ3.species)) yield out("species", P.get(k), fm({ id: k, type: "\u7A2E\u65CF", name: sp.name, tags: ["\u7A2E\u65CF"] }) + `# ${sp.name}

${SPECIES[k] ? `- \u5BFF\u547D ${Math.round(SPECIES[k].lifespan / 12)}\u5E74\uFF0F\u6210\u9577 \xD7${SPECIES[k].growth}\uFF0F\u6280\u8853 \xD7${SPECIES[k].techRate}\uFF0F\u8ECD\u4E8B \xD7${SPECIES[k].martial}\uFF0F\u9B54\u6CD5\u7D20\u8CEA \xD7${r1(SPECIES[k].magic / 2e-3)}
` : ""}- \u96C6\u56E3: ${Object.values(civ3.groups).filter((g) => g.speciesId === k).length}
`);
    for (const w of Object.values(civ3.wars)) yield out("war", P.get(w.id), fm({ id: w.id, type: "\u6226\u4E89", \u958B\u6226: mi2s(w.startedAt), \u7D42\u7D50: w.endedAt == null ? null : mi2s(w.endedAt), \u7D50\u679C: OUTCOME_JA[w.outcome] ?? w.outcome ?? null, tags: ["\u6226\u4E89"] }) + `# ${nameOf(w.aggressor)}\u5BFE${nameOf(w.defender)}\u306E\u6226\u4E89

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
    for (const t of Object.values(civ3.treaties)) yield out("treaty", P.get(t.id), fm({ id: t.id, type: "\u6761\u7D04", \u7A2E\u5225: TREATY_JA[t.type] ?? t.type, \u7DE0\u7D50: mi2s(t.signedAt), \u7D42\u4E86: t.endedAt == null ? null : mi2s(t.endedAt), tags: ["\u6761\u7D04"] }) + `# ${nameOf(t.a)}\u3068${nameOf(t.b)}\u306E${TREATY_JA[t.type] ?? t.type}

- \u5F53\u4E8B\u56FD: ${L(t.a)}\u3001${L(t.b)}
- \u7DE0\u7D50: ${mi2s(t.signedAt)}\uFF0F${t.active ? `\u671F\u9650: ${mi2s(t.expiresAt)}` : `\u7D42\u4E86: ${mi2s(t.endedAt)}`}
`);
    for (const e of civ3.events) {
      const m = evMonth(e);
      if (!inRange(m)) continue;
      const cons = consequencesOf(civ3, e.eventId);
      yield out(e.kind === "battle_fought" ? "battle" : "event", P.get(e.eventId), fm({ id: e.eventId, type: e.kind === "battle_fought" ? "\u6226\u95D8" : "\u51FA\u6765\u4E8B", kind: e.kind, \u65E5\u4ED8: d2s(e.date), \u767A\u751F\u6E90: e.provenance ?? "world", \u5224\u65AD: e.decisionId ?? null, tags: ["\u51FA\u6765\u4E8B", e.kind] }) + `# ${e.title}

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
    if (opts.decisionNotes !== false) for (const d of civ3.decisions) {
      if (!inRange(d2mi(d.date))) continue;
      const x = expandDecision(civ3, d);
      yield out("decision", P.get(d.decisionId), fm({ id: d.decisionId, type: "AI\u5224\u65AD", \u56FD\u5BB6: d.actorId, \u65E5\u4ED8: d2s(d.date), \u5C64: d.layer, \u884C\u52D5: d.chosen.key ?? null, \u6210\u5426: d.result?.ok ?? null, \u767A\u751F\u6E90: d.provenance, tags: ["\u5224\u65AD", d.layer] }) + `# ${nameOf(d.actorId)}\u306E\u5224\u65AD\uFF08${d2s(d.date)}\uFF09

- \u56FD\u5BB6: ${L(d.actorId)}\uFF0F\u5C64: ${d.layer}\uFF0F\u7A2E\u5225: ${d.type}\uFF0F\u767A\u751F\u6E90: ${d.provenance}
- \u9078\u629E: **${d.chosen.key ?? "\u4F55\u3082\u3057\u306A\u3044"}**${d.chosen.target ? `\uFF08\u5BFE\u8C61 ${L(d.chosen.target)}\uFF09` : ""}${d.chosen.opt ? `\uFF08${d.chosen.opt}\uFF09` : ""}
- \u7D50\u679C: ${d.result ? d.result.ok ? "\u6210\u529F" : `\u5931\u6557\uFF08${d.result.error}\uFF09` : "\u2014"}${(d.result?.eventIds ?? []).map((i) => ` ${link2(i, "\u7D50\u679C\u306E\u30A4\u30D9\u30F3\u30C8")}`).join("")}
- \u65B9\u91DD: ${d.strategy ?? "\u2014"}

## \u89B3\u6E2C
${Object.entries(d.observations).map(([k, v]) => `- ${k}: ${typeof v === "number" ? r35(v) : v}`).join("\n")}

## \u5019\u88DC
${table2(["\u884C\u52D5", "\u5BFE\u8C61", "\u9078\u629E\u80A2", "\u5F97\u70B9", "\u8CC7\u683C", "\u7406\u7531", "\u8981\u56E0"], x.candidates.map((c) => [c.key, c.target ? L(c.target) : "", c.opt ?? "", c.total, c.eligible ? "\u53EF" : "\u4E0D\u53EF", c.reason ?? "", Object.entries(c.factors ?? {}).map(([k, v]) => `${k} ${v}`).join("\u3001")]))}`);
    }
    for (const s of Object.values(civ3.settlements)) yield out("settlement", P.get(s.id), fm({ id: s.id, type: "\u96C6\u843D", \u6BB5\u968E: s.stage, \u5275\u8A2D: mi2s(s.foundedAt), tags: ["\u96C6\u843D"] }) + `# \u96C6\u843D\uFF08${STAGE_JA2[s.stage] ?? s.stage}\uFF09

- \u96C6\u56E3: ${civ3.groups[s.groupId] ? link2(s.groupId, "\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u5834\u6240: ${cellLoc(s.cell)}
- \u5275\u8A2D: ${mi2s(s.foundedAt)}\uFF0F\u4EBA\u53E3 ${Math.round(s.pop)}

## \u51FA\u6765\u4E8B
${(ix.byEntity.get(s.id) ?? []).map((i) => civ3.events[i]).slice(0, 50).map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const g of Object.values(civ3.groups)) yield out("group", P.get(g.id), fm({ id: g.id, type: "\u4EBA\u53E3\u96C6\u56E3", \u7A2E\u65CF: g.speciesId, \u751F\u696D: g.subsistence, \u56FD\u5BB6: g.stateId ?? null, tags: ["\u96C6\u56E3"] }) + `# \u96C6\u56E3 ${g.id}

- \u5834\u6240: ${cellLoc(g.cell)}\uFF0F\u751F\u696D: ${g.subsistence}\uFF0F\u4EBA\u53E3 ${Math.round(g.pop)}\uFF0F\u56FD\u5BB6: ${g.stateId ? L(g.stateId) : "\u306A\u3057"}\uFF0F\u7A2E\u65CF: ${link2(g.speciesId, SPECIES[g.speciesId]?.ja ?? g.speciesId)}
- \u7531\u6765: ${g.parent ? link2(g.parent, "\u89AA\u306E\u96C6\u56E3") : "\u6700\u521D\u304B\u3089"}

## \u69CB\u6210\uFF08\u30B3\u30DB\u30FC\u30C8\uFF09
${table2(["\u6587\u5316", "\u8A00\u8A9E", "\u5B97\u6559", "\u7A2E\u65CF", "\u5272\u5408", "\u7DCA\u5F35"], g.cohorts.map((c) => [L(c.cultureId), L(c.languageId), c.religionId ? L(c.religionId) : "\u306A\u3057", SPECIES[c.speciesId]?.ja ?? c.speciesId, r35(c.share), r35(c.tension)]))}
## \u77E5\u3063\u3066\u3044\u308B\u6280\u8853
${Object.entries(g.tech.known).map(([k, mi]) => `${link2(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}\uFF08${mi2s(mi)}\uFF09`).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const r of regionsOf(world)) {
      const inReg = Object.values(civ3.groups).filter((g) => world.cell.continent[g.cell] === r.id);
      yield out("region", P.get(`region:${r.id}`), fm({ id: `region_${r.id}`, type: "\u5730\u57DF", \u9678\u5730\u30BB\u30EB: r.cells, \u9762\u7A4Dkm2: Math.round(r.area), tags: ["\u5730\u57DF"] }) + `# ${r.name}

- \u9678\u5730\u30BB\u30EB ${r.cells}\u30FB\u9762\u7A4D ${Math.round(r.area).toLocaleString("en-US")} km\xB2
- \u91CD\u5FC3: \u7DEF\u5EA6 ${r1(r.sumLat / r.cells * 180 / Math.PI)}\xB0\u30FB\u7D4C\u5EA6 ${r1(r.sumLon / r.cells * 180 / Math.PI)}\xB0
- \u73FE\u5728\u306E\u96C6\u56E3 ${inReg.length}\u30FB\u4EBA\u53E3 ${Math.round(inReg.reduce((a, g) => a + g.pop, 0))}
- \u56FD\u5BB6: ${[...new Set(inReg.map((g) => g.stateId).filter(Boolean))].map(L).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const c of Object.values(civ3.cultures)) yield out("culture", P.get(c.id), fm({ id: c.id, type: "\u6587\u5316", name: c.name, \u8D77\u6E90: mi2s(c.bornAt), tags: ["\u6587\u5316"] }) + `# ${c.name}

- \u8D77\u6E90: ${mi2s(c.bornAt)}\uFF0F${cellLoc(c.cell)}
- \u89AA: ${c.parent ? L(c.parent) : "\u306A\u3057"}
- \u5B50: ${Object.values(civ3.cultures).filter((x) => x.parent === c.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
- \u8A00\u8A9E: ${Object.values(civ3.languages).filter((l) => l.cultureId === c.id).map((l) => L(l.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const l of Object.values(civ3.languages)) yield out("language", P.get(l.id), fm({ id: l.id, type: "\u8A00\u8A9E", name: l.name, \u8D77\u6E90: mi2s(l.bornAt), tags: ["\u8A00\u8A9E"] }) + `# ${l.name}

- \u8D77\u6E90: ${mi2s(l.bornAt)}\uFF0F\u6587\u5316: ${civ3.cultures[l.cultureId] ? L(l.cultureId) : "\u2014"}
- \u89AA: ${l.parent ? L(l.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ3.languages).filter((x) => x.parent === l.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const r of Object.values(civ3.religions)) yield out("religion", P.get(r.id), fm({ id: r.id, type: "\u5B97\u6559", name: r.name, \u7A2E\u985E: r.kind, \u8D77\u6E90: mi2s(r.bornAt), tags: ["\u5B97\u6559"] }) + `# ${r.name}

- \u7A2E\u985E: ${r.kind}\uFF0F\u8D77\u6E90: ${mi2s(r.bornAt)}
- \u89AA: ${r.parent ? L(r.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ3.religions).filter((x) => x.parent === r.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const t of TECHS) {
      const w = civ3.techWorld[t.key];
      const adopters = Object.values(civ3.states).filter((s) => s.techAdopted[t.key] != null);
      yield out("tech", P.get(`tech:${t.key}`), fm({ id: t.key, type: "\u6280\u8853", name: t.name, \u5206\u91CE: t.field, \u6BB5\u968E: t.tier, tags: ["\u6280\u8853"] }) + `# ${t.name}

- \u5206\u91CE: ${t.field}\uFF0F\u6BB5\u968E ${t.tier}\uFF0F\u524D\u63D0: ${t.prereq.map((p) => link2(`tech:${p}`, TECHS.find((x) => x.key === p)?.name ?? p)).join("\u3001") || "\u306A\u3057"}
- \u4E16\u754C\u3067\u6700\u521D\u306E\u767A\u898B: ${w?.discoveries?.[0] ? `${mi2s(w.discoveries[0].month)}\uFF08${link2(w.discoveries[0].eventId, "\u767A\u898B\u306E\u30A4\u30D9\u30F3\u30C8")}\uFF09` : "\u307E\u3060"}
- \u767A\u898B\u306E\u8A18\u9332 ${w?.discoveries?.length ?? 0} \u4EF6\uFF0F\u4FDD\u6709\u3059\u308B\u96C6\u56E3 ${Object.values(civ3.groups).filter((g) => g.tech.known[t.key] != null).length}
- \u63A1\u7528\u3057\u3066\u3044\u308B\u56FD\u5BB6: ${adopters.map((s) => L(s.id)).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const d of Object.values(civ3.disasters)) yield out("disaster", P.get(d.id), fm({ id: d.id, type: "\u707D\u5BB3", \u7A2E\u985E: KIND_JA[d.kind], \u898F\u6A21: d.severity, \u958B\u59CB: mi2s(d.startedAt), \u7D42\u4E86: mi2s(d.endsAt), tags: ["\u707D\u5BB3"] }) + `# ${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09

- \u898F\u6A21 ${d.severity}\u30FB${cellLoc(d.center)}\u30FB\u671F\u9593 ${mi2s(d.startedAt)}\u301C${mi2s(d.endsAt)}\u30FB${d.deaths} \u4EBA\u304C\u4EA1\u304F\u306A\u3063\u305F
- \u767A\u751F: ${link2(d.eventId, "\u707D\u5BB3\u306E\u30A4\u30D9\u30F3\u30C8")}
- \u5F71\u97FF\u3092\u53D7\u3051\u305F\u96C6\u56E3: ${d.groupIds.slice(0, 30).map((g) => civ3.groups[g] ? link2(g, "\u96C6\u56E3") : g).join("\u3001")}
`);
    for (const x of civ3.interpretations) yield out("interp", P.get(x.interpId), fm({ id: x.interpId, type: "\u6B74\u53F2\u8A8D\u8B58", \u56FD\u5BB6: x.ownerId, \u7ACB\u5834: STANCE[x.stance] ?? x.stance, \u8A55\u4FA1: x.valence, \u958B\u59CB: mi2s(x.since), \u7D42\u4E86: x.until == null ? null : mi2s(x.until), \u7F6E\u304D\u63DB\u3048\u5143: x.supersedes ?? null, tags: ["\u6B74\u53F2\u8A8D\u8B58"] }) + `# ${nameOf(x.ownerId)}\u306E\u8A8D\u8B58: ${STANCE[x.stance] ?? x.stance}

- \u4E8B\u4EF6: ${link2(x.eventId, getEvent(civ3, x.eventId)?.title)}\uFF08\u4E8B\u5B9F\u306E\u30A4\u30D9\u30F3\u30C8\u306F\u5909\u308F\u3089\u306A\u3044\u3002\u5909\u308F\u308B\u306E\u306F\u56FD\u5BB6\u306E\u53D7\u3051\u6B62\u3081\u65B9\uFF09
- \u8A55\u4FA1 ${x.valence}\uFF08\u22121 \u5426\u5B9A\u301C+1 \u80AF\u5B9A\uFF09\uFF0F\u76F8\u624B: ${x.about.map(L).join("\u3001") || "\u306A\u3057"}
- ${mi2s(x.since)}\u301C${x.until == null ? "\u73FE\u5728" : mi2s(x.until)}${x.supersedes ? `\uFF0F\u524D\u306E\u8A8D\u8B58: ${link2(x.supersedes, "\u7F6E\u304D\u63DB\u3048\u5143")}` : ""}
`);
    for (const w of civ3.works) yield out("work", P.get(w.workId), fm({ id: w.workId, type: "\u8868\u73FE\u7269", \u7A2E\u985E: w.kind, \u8457\u8005: w.authorId, \u4E8B\u5B9F\u3068\u306E\u4E00\u81F4: w.fidelity === "faithful", tags: ["\u8868\u73FE\u7269"] }) + `# ${nameOf(w.authorId)}\u306E\u5E74\u4EE3\u8A18

${w.text}

- \u5BFE\u8C61\u306E\u4E8B\u4EF6: ${link2(w.targetEventId, getEvent(civ3, w.targetEventId)?.title)}\uFF0F\u7ACB\u5834: ${STANCE[w.stance] ?? w.stance}\uFF0F${w.fidelity === "faithful" ? "\u4E8B\u5B9F\u306B\u5FE0\u5B9F" : "\u4E8B\u5B9F\u3068\u7570\u306A\u308B\u8A18\u8FF0\u3092\u542B\u3080"}

## \u4E8B\u5B9F\u3068\u306E\u5DEE
${table2(["\u9805\u76EE", "\u8A18\u8FF0", "\u4E8B\u5B9F"], w.claims.map((c) => [c.property, c.claimed, c.actual]))}`);
    const byCentury = /* @__PURE__ */ new Map();
    for (const e of civ3.events) {
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
    const ids = [...new Set(edges.flat())].slice(0, 200), set = new Set(ids), n = new Map(ids.map((id, i) => [id, `n${i}`])), es = edges.filter(([a, b]) => set.has(a) && set.has(b)).slice(0, 400);
    return fm({ type: "\u95A2\u4FC2\u30B0\u30E9\u30D5", tags: ["\u30B0\u30E9\u30D5"] }) + `# ${title}

${sub2}\u3002Mermaid \u3067\u63CF\u753B\u3055\u308C\u308B\uFF08\u30CE\u30FC\u30C9 ${ids.length}\u30FB\u8FBA ${es.length}${edges.length > es.length ? `\u3002\u4E0A\u9650\u306E\u305F\u3081 ${edges.length - es.length} \u672C\u3092\u7701\u7565` : ""}\uFF09\u3002

\`\`\`mermaid
graph LR
${ids.map((id) => `  ${n.get(id)}["${String(label(id)).replace(/"/g, "'")}"]`).join("\n")}
${es.map(([a, b]) => `  ${n.get(a)} --> ${n.get(b)}`).join("\n")}
\`\`\`
`;
  }
  async function mapImages(world, civ3, opts) {
    const W = 1024, H = 512, c = world.cell, cellAt = opts.cellRaster(world, W, H);
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
      const px = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
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
      files.push({ name, png: await encodePng(px, W, H) });
    };
    await render2("\u5730\u5F62.png", null);
    if (civ3.history && Object.keys(civ3.history.states).length) {
      const mi = civ3.monthIndex, marks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.floor(mi * f / 120) * 120))].filter((x) => x <= mi && x >= 0);
      for (const t of marks) await render2(`\u56FD\u5BB6\u9818\u57DF_${Math.floor(t / 12)}\u5E74.png`, ownerMapAt(civ3, territoryOf, world, t));
    }
    return files;
  }
  function readme(root2, world, civ3, counts, stats, opts) {
    const ja = { state: "\u56FD\u5BB6", person: "\u4EBA\u7269\uFF08\u9B54\u6CD5\u306E\u7D20\u8CEA\u8005\uFF09", war: "\u6226\u4E89", battle: "\u6226\u95D8", treaty: "\u6761\u7D04", event: "\u51FA\u6765\u4E8B", decision: "AI\u5224\u65AD", settlement: "\u90FD\u5E02\u30FB\u96C6\u843D", group: "\u4EBA\u53E3\u96C6\u56E3", region: "\u5730\u57DF", culture: "\u6587\u5316", language: "\u8A00\u8A9E", religion: "\u5B97\u6559", tech: "\u6280\u8853", species: "\u7A2E\u65CF", ability: "\u9B54\u6CD5\u306E\u80FD\u529B", org: "\u9B54\u6CD5\u7D44\u7E54", disaster: "\u707D\u5BB3", interp: "\u6B74\u53F2\u8A8D\u8B58", work: "\u8868\u73FE\u7269\uFF08\u5E74\u4EE3\u8A18\uFF09", chronicle: "\u5E74\u4EE3\u8A18\uFF08100\u5E74\u3054\u3068\uFF09", logState: "\u8A73\u7D30\u30ED\u30B0\u30FB\u56FD\u5BB6\u306E\u6708\u6B21\u72B6\u614B", logAi: "\u8A73\u7D30\u30ED\u30B0\u30FBAI\u5224\u65AD\u306E\u4E00\u89A7", graph: "\u95A2\u4FC2\u30B0\u30E9\u30D5", map: "\u5730\u56F3" };
    return fm({ type: "README", tags: ["README"] }) + `# ${root2} \u2014 AlterHistory \u306E\u66F8\u304D\u51FA\u3057

\u3053\u306E\u30D5\u30A9\u30EB\u30C0\u3092 Obsidian \u306E vault \u3068\u3057\u3066\u958B\u3044\u3066\u304F\u3060\u3055\u3044\uFF08\u89AA\u30D5\u30A9\u30EB\u30C0\u304B\u3089\u958B\u3044\u3066\u3082\u3001\u30EA\u30F3\u30AF\u306F\u89E3\u6C7A\u3057\u307E\u3059\uFF09\u3002

- \u66F8\u304D\u51FA\u3057\u305F\u6642\u70B9: ${mi2s(civ3.monthIndex)}\uFF08\u6B74\u53F2\u306E\u73FE\u5728\uFF09
- \u4E16\u754C: ${world.spec.worldSeed}\uFF08${world.mesh.cellCount ?? world.cell.biome.length} \u30BB\u30EB\uFF09
- \u30EA\u30F3\u30AF\u5207\u308C: ${stats.unresolved} \u4EF6\uFF080 \u304C\u6B63\u5E38\uFF09

## \u4E2D\u8EAB
${table2(["\u30D5\u30A9\u30EB\u30C0\u30FB\u7A2E\u985E", "\u30CE\u30FC\u30C8\u6570"], Object.entries(counts).filter(([k]) => ja[k]).map(([k, n]) => [ja[k], n]))}
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
  var civ2 = () => S.w.civ;
  var date2 = (mi) => formatWorldDate(S.w, mi);
  var note2 = (t) => h("p", { class: "n" }, t);
  var head = (code, ja) => [h("div", { class: "code" }, code), h("h2", {}, ja)];
  var OUT = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" };
  function pWar() {
    const c = civ2(), all = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, ...head("WAR", "\u6226\u4E89"));
    const sel = c.wars[S.war];
    if (sel) box.append(warDetail(sel));
    box.append(lb("\u6226\u4E89\u4E00\u89A7", "\u65B0\u3057\u3044\u9806"), note2(`\u9032\u884C\u4E2D ${c.activeWarIds.length}\u30FB\u5168\u4F53 ${all.length} \u4EF6`), vlist(all, 28, (x) => h("div", { class: "vrow", onclick: () => {
      S.war = x.id;
      S.hooks.panel();
    } }, h("small", { style: "color:var(--dim)" }, x.status === "active" ? "\u9032\u884C\u4E2D " : "\u7D42\u7D50 "), `${stateName(x.aggressor)} \u5BFE ${stateName(x.defender)}`, h("small", { style: "color:var(--dim)" }, ` ${date2(x.startedAt).split("\u6708")[0]}\u6708\u301C`))));
    return box;
  }
  function warDetail(x) {
    const c = civ2(), mine = controlled(), side = [...x.sides.a, ...x.sides.d].includes(mine), key = (e) => e.participants.some((p) => p.entityId === x.id), ev = c.events.filter((e) => key(e)).slice(-12), peace = proposalsOf(c).filter((p) => p.kind === "peace" && p.warId === x.id).slice(-4).reverse();
    const kind = h("select", { id: "peace-kind" }, h("option", { value: "white" }, "\u767D\u7D19\u8B1B\u548C"), h("option", { value: "reparations" }, "\u8CE0\u511F\u3064\u304D")), amt = h("input", { id: "peace-amt", type: "number", placeholder: "\u8CE0\u511F\u984D", style: "width:90px" });
    return h(
      "div",
      { class: "rs" },
      h("div", { class: "card br" }, h("h3", {}, `${stateName(x.aggressor)} \u5BFE ${stateName(x.defender)}`), h("div", { class: "sub" }, `${x.status === "active" ? "\u9032\u884C\u4E2D" : "\u7D42\u7D50\uFF08" + (OUT[x.outcome] ?? x.outcome) + "\uFF09"}\u30FB\u958B\u6226 ${date2(x.startedAt)}${x.endedAt != null ? "\u30FB\u7D42\u6226 " + date2(x.endedAt) : ""}\u30FB\u6226\u6CC1 ${x.score > 0 ? "\u653B\u6483\u5074\u304C\u512A\u52E2" : x.score < 0 ? "\u9632\u5FA1\u5074\u304C\u512A\u52E2" : "\u62EE\u6297"}\uFF08${r23(x.score)}\uFF09\u30FB\u5360\u9818 ${x.occupied.length} \u533A\u753B`)),
      lb("\u4E3B\u8981\u7D4C\u904E\uFF08\u4E8B\u5B9F\uFF09", "FACTS"),
      ...ev.length ? ev.map((e) => h("div", { class: "ev" }, h("time", {}, `${e.date.year}\u5E74${e.date.month}\u6708`), e.title)) : [note2("\u8A18\u9332\u3055\u308C\u305F\u51FA\u6765\u4E8B\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093")],
      lb("\u8B1B\u548C", "PEACE"),
      ...peace.length ? peace.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${stateName(p.from)}\u306E\u7533\u3057\u5165\u308C\uFF08${p.terms.kind === "reparations" ? "\u8CE0\u511F " + n0(p.terms.paid ?? p.terms.amount) : "\u767D\u7D19\u8B1B\u548C"}\uFF09`, h("br"), h("small", {}, date2(p.at))), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status]))) : [note2(x.status === "active" ? "\u307E\u3060\u7533\u3057\u5165\u308C\u306F\u3042\u308A\u307E\u305B\u3093" : "\u8B1B\u548C\u306E\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093")],
      x.status === "active" ? h("div", {}, h("div", { class: "rowb" }, kind, amt), h("div", { class: "rowb" }, btn("\u8B1B\u548C\u3092\u7533\u3057\u5165\u308C\u308B", () => {
        const st = [...x.sides.a, ...x.sides.d].includes(mine) ? mine : null;
        act({ type: "diplomacy.peace", stateId: st, warId: x.id, terms: { kind: kind.value, amount: Number(amt.value) || 0 } });
      }, "p", { id: "peace-go", disabled: !side, title: side ? "" : "\u62C5\u5F53\u56FD\u304C\u53C2\u6226\u3057\u3066\u3044\u308B\u6226\u4E89\u306E\u307F" })), note2("\u8B1B\u548C\u306F\u3001\u76F8\u624B\u306E\u6226\u6CC1\u30FB\u75B2\u52B4\u30FB\u56FD\u5EAB\u30FB\u9577\u671F\u5316\u306E\u8A55\u4FA1\u3092\u7D4C\u3066\u3001\u53D7\u8AFE\u3055\u308C\u305F\u3068\u304D\u3060\u3051\u6226\u4E89\u304C\u7D42\u308F\u308A\u307E\u3059\u3002")) : null,
      lb("\u6226\u4E89\u7814\u7A76\u6240\uFF08\u4E88\u6E2C\u3002\u4E8B\u5B9F\u3068\u306F\u5225\uFF09", "WAR LAB"),
      (() => {
        const p = x.status === "active" ? predictWar(c, x.aggressor, x.defender, S.w.sim.ctx) : null;
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
    const mx = h("table", { class: "mx" }, h("tr", {}, h("th", { class: "rh" }), ...top.map((s) => h("th", {}, s.name.slice(0, 3)))), ...top.map((a) => h("tr", {}, h("th", { class: "rh", onclick: () => S.hooks.select(a.id) }, h("span", { class: "dot", style: `background:${colorOf(a.id)};display:inline-block` }), a.name.slice(0, 3)), ...top.map((b) => {
      if (a === b) return h("td", { class: "dg" }, "\u2014");
      const v = Math.round(a.relations[b.id] ?? 0), w = at2(a, b), al = ally(a, b);
      return h("td", { class: "rc" + (w ? " war" : ""), style: `background-color:${relCol(v)}33`, title: `${a.name}\u2192${b.name}: \u95A2\u4FC2 ${v}${w ? "\u30FB\u4EA4\u6226\u4E2D" : ""}${al ? "\u30FB\u540C\u76DF" : ""}` }, w ? "\u6226" : al ? "\u76DF" : v);
    }))));
    const nodes = [...new Set(c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.type === "alliance").flatMap((t) => [t.a, t.b]))].filter((i) => c.states[i]?.alive).slice(0, 16), P = new Map(nodes.map((id, i) => [id, [250 + 120 * Math.cos(Math.PI * 2 * i / nodes.length - Math.PI / 2), 150 + 105 * Math.sin(Math.PI * 2 * i / nodes.length - Math.PI / 2)]]));
    const g = sv("svg", { viewBox: "0 0 500 310", width: "100%", class: "gr" });
    for (const i of c.activeTreatyIds) {
      const t = c.treaties[i];
      if (t.type !== "alliance" || !P.has(t.a) || !P.has(t.b)) continue;
      g.append(sv("line", { x1: P.get(t.a)[0], y1: P.get(t.a)[1], x2: P.get(t.b)[0], y2: P.get(t.b)[1], stroke: "#6fa8c9", "stroke-width": 3 }));
    }
    for (const [id, [x, y]] of P) g.append(sv("g", { class: "fn", onclick: () => S.hooks.select(id) }, sv("circle", { cx: x, cy: y, r: 14, fill: colorOf(id), stroke: "#14161a", "stroke-width": 2 }), sv("text", { x, y: y + 30, "text-anchor": "middle", "font-size": 11, fill: "#d9d6cc" }, stateName(id).slice(0, 5))));
    const tr = c.activeTreatyIds.map((i) => c.treaties[i]).sort((a, b) => b.signedAt - a.signedAt), recent = proposalsOf(c).slice(-12).reverse();
    return h("div", {}, ...head("DIPLOMACY", "\u4E16\u754C\u306E\u5916\u4EA4"), lb("\u95A2\u4FC2\u8868\uFF08\u4EBA\u53E3\u4E0A\u4F4D 10 \u304B\u56FD\uFF09", "RELATIONS"), note2("\u884C\u304C\u4E3B\u4F53\u3001\u5217\u304C\u76F8\u624B\u3002\u6570\u5024\u306F\u95A2\u4FC2\u5024\u3001\u300C\u6226\u300D\u306F\u4EA4\u6226\u4E2D\u3001\u300C\u76DF\u300D\u306F\u540C\u76DF\u3002\u8272\u306F\u95A2\u4FC2\u306E\u826F\u3057\u60AA\u3057\uFF08\u6570\u5024\u3068\u8A18\u53F7\u3082\u4F75\u8A18\uFF09\u3002"), mx, lb("\u540C\u76DF\u95A2\u4FC2", "ALLIANCES"), nodes.length ? g : note2("\u540C\u76DF\u306F\u3042\u308A\u307E\u305B\u3093"), lb("\u7DE0\u7D50\u6E08\u307F\u306E\u6761\u7D04\uFF08\u65B0\u3057\u3044\u9806\uFF09", "TREATIES"), note2(`${tr.length} \u4EF6`), vlist(tr, 26, (t) => h("div", { class: "vrow" }, h("small", { style: "color:var(--dim)" }, `${date2(t.signedAt).split("\u6708")[0]}\u6708 `), `${TREATY[t.type]?.ja ?? t.type}: ${stateName(t.a)}\u30FB${stateName(t.b)}`)), lb("\u6700\u8FD1\u306E\u4EA4\u6E09", "NEGOTIATIONS"), ...recent.map((p) => h("div", { class: "row" }, h("span", { class: "g" }, `${p.kind === "peace" ? "\u8B1B\u548C" : TREATY[p.type]?.ja} ${stateName(p.from)}\u2192${stateName(p.to)}`), h("small", {}, { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u4E0D\u6210\u7ACB" }[p.status]))));
  }
  var KINDS = { culture: ["cultures", "\u6587\u5316", "CULTURE"], language: ["languages", "\u8A00\u8A9E", "LANGUAGE"], religion: ["religions", "\u5B97\u6559", "RELIGION"] };
  function pEntity(kind) {
    const [key, ja, code] = KINDS[kind], c = civ2(), items = Object.values(c[key]), cur = c[key][S.entity[kind]], box = h("div", {}, ...head(code, ja));
    const use = /* @__PURE__ */ new Map(), idk = kind + "Id";
    for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) if (co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"]) {
      const id = co[kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"];
      use.set(id, (use.get(id) ?? 0) + g.pop * co.share);
    }
    box.append(note2(`${items.length} \u4EF6\u3002\u6A39\u5F62\u56F3\u306F\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u3002\u30CE\u30FC\u30C9\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u8A73\u7D30\u3092\u958B\u304D\u307E\u3059\u3002`), lineageTree(items, { selected: cur?.id, onPick: (x) => {
      S.entity[kind] = x.id;
      S.hooks.panel();
    } }));
    if (cur) box.append(entityDetail(kind, cur, use));
    box.append(lb("\u4EBA\u53E3\u306E\u591A\u3044\u9806", "BY POPULATION"), vlist([...items].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)), 26, (x) => h("div", { class: "vrow", onclick: () => {
      S.entity[kind] = x.id;
      S.hooks.panel();
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
    const c = civ2(), F = S.tl, types = [["events", "\u5BA2\u89B3\u30A4\u30D9\u30F3\u30C8"], ["decisions", "AI \u306E\u5224\u65AD"], ["creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165"], ["interp", "\u5F8C\u4E16\u306E\u6B74\u53F2\u8A8D\u8B58"]], box = h("div", {}, ...head("CHRONICLE", "\u5E74\u8868"), h("div", { class: "tabs" }, ...types.map(([k, ja]) => h("b", { class: F.type === k ? "on" : "", "data-ttype": k, onclick: () => {
      F.type = k;
      S.hooks.panel();
    } }, ja))));
    const kinds = [...new Set(c.events.slice(-4e3).map((e) => e.kind))].sort(), ks = h("select", { id: "tl-kind", onchange: (e) => {
      F.kind = e.target.value;
      S.hooks.panel();
    } }, h("option", { value: "" }, "\u3059\u3079\u3066\u306E\u7A2E\u5225"), ...kinds.map((k) => h("option", { value: k, selected: F.kind === k }, k))), tx = h("input", { id: "tl-text", value: F.text, placeholder: "\u8A9E\u3067\u7D5E\u308B", onchange: (e) => {
      F.text = e.target.value;
      S.hooks.panel();
    } }), y0 = h("input", { id: "tl-from", type: "number", placeholder: "\u5E74\u304B\u3089", value: F.from, style: "width:78px", onchange: (e) => {
      F.from = e.target.value;
      S.hooks.panel();
    } }), y1 = h("input", { id: "tl-to", type: "number", placeholder: "\u5E74\u307E\u3067", value: F.to, style: "width:78px", onchange: (e) => {
      F.to = e.target.value;
      S.hooks.panel();
    } });
    box.append(h("div", { class: "rowb" }, F.type === "events" ? ks : null, tx, y0, y1), F.entity ? h("div", { class: "rowb" }, `\u7D5E\u308A\u8FBC\u307F: ${stateName(F.entity)}`, btn("\u89E3\u9664", () => {
      F.entity = "";
      S.hooks.panel();
    })) : null);
    const inRange = (d) => (F.from === "" || d.year >= +F.from) && (F.to === "" || d.year <= +F.to), has2 = (s) => !F.text || String(s).includes(F.text);
    let rows = [], render2;
    if (F.type === "events") {
      for (let i = c.events.length - 1; i >= 0 && rows.length < 2e4; i--) {
        const e = c.events[i];
        if (F.kind && e.kind !== F.kind || !has2(e.title) || !inRange(e.date) || F.entity && !e.participants.some((p) => p.entityId === F.entity)) continue;
        rows.push(e);
      }
      render2 = (e) => h("div", { class: "vrow", onclick: () => showEvent(e) }, h("small", { style: "color:var(--dim)" }, `${e.date.year}\u5E74${e.date.month}\u6708 `), e.title);
    } else if (F.type === "decisions") {
      for (let i = c.decisions.length - 1; i >= 0 && rows.length < 2e4; i--) {
        const d = c.decisions[i];
        if (!inRange(d.date) || F.entity && d.actorId !== F.entity || !has2(stateName(d.actorId) + d.type)) continue;
        rows.push(d);
      }
      render2 = (d) => h("div", { class: "vrow", onclick: () => showDecision(d) }, h("small", { style: "color:var(--dim)" }, `${d.date.year}\u5E74${d.date.month}\u6708 `), `${stateName(d.actorId)}: ${d.type}\uFF08${d.provenance === "ai" ? "AI" : d.provenance}\uFF09`);
    } else if (F.type === "creator") {
      const ivs = interventionsOf(c).map((r) => ({ at: r.startMonth, t: `\u4ECB\u5165: ${stateName(r.targetId)} \u306E${FIELDS[r.field]?.ja ?? r.field} \u2192 ${r23(r.target)}\uFF08${{ active: "\u6709\u52B9", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" }[r.status]}\uFF09${r.reason ? "\u30FB" + r.reason : ""}` })), eds = (c.wcde.edits ?? []).map((e) => ({ at: e.at, t: `\u76F4\u63A5\u7DE8\u96C6: ${e.targetId} \u306E ${e.property}\uFF08${String(e.before).slice(0, 16)} \u2192 ${String(e.after).slice(0, 16)}\uFF09` }));
      rows = [...ivs, ...eds].filter((r) => has2(r.t)).sort((a, b) => b.at - a.at);
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
    box.append(note2(`${rows.length.toLocaleString("ja-JP")} \u4EF6\uFF08\u65B0\u3057\u3044\u9806\u3002\u898B\u3048\u308B\u7BC4\u56F2\u3060\u3051\u63CF\u753B\uFF09`), vlist(rows, 26, render2), h("div", { id: "evdetail", class: "dt" }, "\u9805\u76EE\u3092\u9078\u3076\u3068\u3001\u539F\u56E0\u30FB\u7D50\u679C\u30FB\u95A2\u4FC2\u3059\u308B\u5B9F\u4F53\u3092\u8868\u793A\u3057\u307E\u3059\u3002"));
    return box;
  }
  function showEvent(e) {
    const c = civ2(), d = document.getElementById("evdetail");
    if (!d) return;
    d.replaceChildren(h("b", {}, e.title), h("div", {}, `${e.date.year}\u5E74${e.date.month}\u6708\u30FB\u7A2E\u5225 ${e.kind}\u30FB\u51FA\u5178 ${e.provenance}`), h("div", {}, "\u95A2\u4FC2\u3059\u308B\u5B9F\u4F53: ", ...e.participants.filter((p) => c.states[p.entityId]).map((p) => [h("a", { class: "lk", href: "#", onclick: (ev) => {
      ev.preventDefault();
      S.hooks.select(p.entityId);
    } }, stateName(p.entityId)), " ", h("a", { class: "lk", href: "#", title: "\u3053\u306E\u56FD\u3067\u7D5E\u308A\u8FBC\u3080", onclick: (ev) => {
      ev.preventDefault();
      S.tl.entity = p.entityId;
      S.hooks.panel();
    } }, "\uFF08\u7D5E\u8FBC\uFF09"), " "]), ...e.participants.filter((p) => c.wars[p.entityId]).map((p) => btn("\u6226\u4E89\u306E\u8A73\u7D30", () => {
      S.war = p.entityId;
      S.hub = "war";
      S.hooks.render();
    }))), h("div", {}, "\u539F\u56E0: ", ...e.causes.length ? e.causes.map((x) => {
      const t = c.events.find((y) => y.eventId === x.targetId);
      return h("small", { style: "display:block;color:var(--dim)" }, `${x.relation}\uFF08${x.basis}\uFF09${t ? t.title : x.targetId}`);
    }) : ["\u7279\u5B9A\u3067\u304D\u3066\u3044\u306A\u3044"]), h("div", {}, "\u7D50\u679C: ", ...e.effects.length ? e.effects.slice(0, 5).map((x) => h("small", { style: "display:block;color:var(--dim)" }, `${x.property}: ${x.before} \u2192 ${x.after}`)) : ["\u2014"]));
  }
  function showDecision(x) {
    const d = document.getElementById("evdetail");
    if (!d) return;
    d.replaceChildren(h("b", {}, `${stateName(x.actorId)} \u306E\u5224\u65AD: ${x.type}`), h("div", {}, `\u6226\u7565 ${x.strategy ?? "\u2014"}\u30FB${x.date.year}\u5E74${x.date.month}\u6708\u30FB\u968E\u5C64 ${x.layer}`), h("div", { class: "n" }, "\u5224\u65AD\u6642\u306E\u89B3\u6E2C: " + Object.entries(x.observations ?? {}).map(([k, v]) => `${k}=${typeof v === "number" ? r23(v) : v}`).join("\u30FB")), h("div", { class: "n" }, `\u5019\u88DC ${x.candidates?.length ?? 0} \u4EF6\u304B\u3089\u9078\u629E\uFF08\u5224\u65AD\u306E\u8A18\u9332\u3067\u3042\u308A\u3001\u4E16\u754C\u306E\u4E8B\u5B9F\u306E\u30A4\u30D9\u30F3\u30C8\u3068\u306F\u5225\u3067\u3059\uFF09`));
  }
  function pStats() {
    const c = civ2(), A2 = aliveStates(), cells = /* @__PURE__ */ new Map();
    for (const g of Object.values(c.groups)) if (g.stateId) cells.set(g.stateId, (cells.get(g.stateId) ?? 0) + (g.cells?.length || 1));
    const area = (id) => {
      let k = 0;
      for (const g of Object.values(c.groups)) if (g.stateId === id) for (const ce of g.cells?.length ? g.cells : [g.cell]) k += S.w.world.cell.areaKm2[ce] ?? 0;
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
    return h("div", {}, ...head("STATISTICS", "\u7D71\u8A08"), note2(`\u73FE\u5728 ${formatWorldDate(S.w)}\u3002\u3059\u3079\u3066\u4E16\u754C\u306E\u72B6\u614B\u304B\u3089\u8A08\u7B97\u3057\u307E\u3059\u3002`), rank("\u8ECD\u4E8B\u529B", "MILITARY", A2.map((s) => ({ link: link(s.id), v: strength(c, s) })).sort((a, b) => b.v - a.v), n0, "\u5175\u529B \xD7 \u8ECD\u4E8B\u80FD\u529B\uFF08\u6709\u52B9\u5024\uFF09\xD7 \u9632\u5FA1\u306E\u500D\u7387\uFF08AI\u30FB\u6226\u4E89\u7814\u7A76\u6240\u3068\u540C\u3058\u6226\u529B\uFF09"), rank("\u56FD\u571F", "TERRITORY", A2.map((s) => ({ link: link(s.id), v: area(s.id) })).sort((a, b) => b.v - a.v), (v) => n0(v) + " km\xB2", "\u56FD\u5BB6\u306B\u5C5E\u3059\u308B\u96C6\u56E3\u306E\u533A\u753B\u306E\u9762\u7A4D\u306E\u5408\u8A08"), rank("\u4EBA\u53E3", "POPULATION", A2.map((s) => ({ link: link(s.id), v: s.pop })).sort((a, b) => b.v - a.v), n0, "\u56FD\u5BB6\u306B\u5C5E\u3059\u308B\u96C6\u56E3\u306E\u4EBA\u53E3\u306E\u5408\u8A08"), rank("\u6587\u5316", "CULTURE", named(pop("cultureId"), c.cultures), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u6587\u5316\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"), rank("\u5B97\u6559", "RELIGION", named(pop("religionId"), c.religions), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u5B97\u6559\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"), rank("\u8A00\u8A9E", "LANGUAGE", named(pop("languageId"), c.languages), n0, "\u96C6\u56E3\u306E\u4EBA\u53E3 \xD7 \u305D\u306E\u8A00\u8A9E\u306E\u69CB\u6210\u6BD4\u306E\u5408\u8A08\uFF08\u4E16\u754C\u5168\u4F53\uFF09"));
  }
  var IDX = /* @__PURE__ */ new WeakMap();
  function index(c) {
    let I = IDX.get(c);
    if (!I) IDX.set(c, I = { n: 0, ent: [], ev: [] });
    const ent = [], put2 = (kind, id, name, go) => name && ent.push({ kind, id, name, k: String(name), go });
    for (const s of Object.values(c.states)) put2("\u56FD\u5BB6", s.id, s.name, () => S.hooks.select(s.id));
    for (const f of Object.values(c.figures ?? {})) put2("\u4EBA\u7269", f.id, f.name, () => f.stateId && c.states[f.stateId] ? S.hooks.select(f.stateId) : null);
    for (const s of Object.values(c.settlements)) put2("\u90FD\u5E02", s.id, s.name, () => S.hooks.focusCell(s.cell));
    for (const [k, ja] of [["cultures", "\u6587\u5316"], ["languages", "\u8A00\u8A9E"], ["religions", "\u5B97\u6559"]]) for (const x of Object.values(c[k])) put2(ja, x.id, x.name, () => {
      const kind = k === "cultures" ? "culture" : k === "languages" ? "language" : "religion";
      S.entity[kind] = x.id;
      S.hub = kind;
      S.hooks.render();
    });
    Promise.resolve().then(() => (init_tech(), tech_exports)).then((m) => {
      for (const t of m.TECHS) put2("\u6280\u8853", t.key, t.name, () => {
        S.tech = t.key;
        S.tab = "tech";
        S.hub = "nations";
        S.hooks.render();
      });
    });
    for (const w of Object.values(c.wars)) put2("\u6226\u4E89", w.id, `${stateName(w.aggressor)}\u5BFE${stateName(w.defender)}`, () => {
      S.war = w.id;
      S.hub = "war";
      S.hooks.render();
    });
    for (const t of Object.values(c.treaties)) put2("\u6761\u7D04", t.id, `${TREATY[t.type]?.ja}:${stateName(t.a)}\u30FB${stateName(t.b)}`, () => {
      S.hub = "diplo";
      S.hooks.render();
    });
    I.ent = ent;
    for (; I.n < c.events.length; I.n++) I.ev.push(c.events[I.n].title);
    return I;
  }
  function pSearch() {
    const c = civ2(), I = index(c), q2 = S.q, inp = h("input", { id: "q", value: q2, placeholder: "\u56FD\u5BB6\u30FB\u4EBA\u7269\u30FB\u90FD\u5E02\u30FB\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u30FB\u6280\u8853\u30FB\u6226\u4E89\u30FB\u6761\u7D04\u30FB\u51FA\u6765\u4E8B", style: "width:100%", onchange: (e) => {
      S.q = e.target.value;
      S.hooks.panel();
    } }), res = [];
    if (q2) {
      for (const e of I.ent) if (e.k.includes(q2)) res.push([e.kind, e.name, e.go]);
      for (let i = I.ev.length - 1; i >= 0 && res.length < 400; i--) if (I.ev[i].includes(q2)) res.push(["\u51FA\u6765\u4E8B", I.ev[i], () => {
        S.tl = { ...S.tl, type: "events", text: q2, kind: "", entity: "" };
        S.hub = "chron";
        S.hooks.render();
      }]);
    }
    return h("div", {}, ...head("SEARCH", "\u691C\u7D22"), inp, note2(q2 ? `${res.length}${res.length >= 400 ? "+" : ""} \u4EF6\uFF08\u540D\u524D\u304C\u5909\u308F\u3063\u3066\u3082\u3001\u5B89\u5B9A\u3057\u305F ID \u3067\u305F\u3069\u308C\u307E\u3059\uFF09` : "\u8A9E\u3092\u5165\u529B\u3057\u3066 Enter\u3002"), vlist(res, 26, (r) => h("div", { class: "vrow", onclick: r[2] }, h("small", { style: "color:var(--dim);width:42px;flex:none" }, r[0]), r[1])));
  }
  function pSettings() {
    const c = civ2(), cf = c.wcde.config, T3 = timeOf(c), errs = checkWcdeIntegrity(S.w.world, c), msg = h("p", { class: "n", id: "exp-msg" }), cal = cf.calendar;
    const dl = (blob, name) => {
      const a = h("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
    };
    const save = () => {
      const p = packSave(S.w);
      dl(new Blob([p.text], { type: "application/json" }), `alterhistory-${cf.worldSeed}-${c.date.year}.ahw`);
      msg.textContent = `\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08${(p.bytes / 1048576).toFixed(1)} MB\uFF09`;
    };
    const obs = async () => {
      msg.textContent = "Obsidian \u7528\u306E ZIP \u3092\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026";
      try {
        const r = await exportObsidianZip(S.w.world, c, cf.name || cf.worldSeed);
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
      table(["\u9805\u76EE", "\u5024"], [["\u4E16\u754C\u306E\u7A2E", cf.worldSeed], ["\u89E3\u50CF\u5EA6\uFF08\u30BB\u30EB\uFF09", S.w.world.mesh.cellCount], ["\u9B54\u6CD5", cf.magic?.enabled ? "\u3042\u308A" : "\u306A\u3057"], ["\u7A2E\u65CF", (cf.species ?? []).map((s) => s.name ?? s.id ?? s).join("\u30FB") || "\u2014"], ["\u5148\u53F2\u306E\u9577\u3055", `${n0(cf.prehistory?.years ?? 0)} \u5E74`], ["\u73FE\u5728", formatWorldDate(S.w)], ["\u66A6\u306E\u8D77\u70B9\u540D", cal.epochName], ["\u6642\u4EE3\u533A\u5206", (cal.eras ?? []).map((e) => e.name).join(" \u2192 ")]]),
      lb("\u66A6\u306E\u8868\u793A\u540D\uFF08\u8868\u793A\u7528\u306E\u307F\uFF09", "CALENDAR"),
      h("div", { class: "rowb" }, en, btn("\u5909\u66F4", () => {
        const r = run({ type: "calendar.edit", edit: { epochName: en.value } });
        S.hooks.render();
      })),
      note2("\u751F\u6210\u5F8C\u306B\u5909\u3048\u3089\u308C\u308B\u306E\u306F\u8868\u793A\u7528\u306E\u540D\u79F0\u30FB\u533A\u5206\u3060\u3051\u3067\u3059\u3002\u904E\u53BB\u306E\u65E5\u4ED8\u30FB\u767A\u751F\u9806\u30FB\u5BA2\u89B3\u7684\u4E8B\u5B9F\u306F\u5909\u308F\u308A\u307E\u305B\u3093\u3002"),
      lb("\u4FDD\u5B58\u30FB\u8AAD\u307F\u8FBC\u307F\u30FB\u51FA\u529B", "SAVE / EXPORT"),
      h("div", { class: "rowb" }, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3059", save, "p", { id: "save" }), fileLoader(), btn("Obsidian \u7528 Markdown ZIP", obs, "", { id: "obs" })),
      msg,
      ...S.fileWarn.map((x) => h("p", { class: "warn" }, x)),
      lb("\u30D0\u30FC\u30B8\u30E7\u30F3\u60C5\u5831", "VERSION"),
      table(["\u9805\u76EE", "\u5024"], [["\u30A2\u30D7\u30EA\u306E\u7248", APP_VERSION_FOR_SAVE], ["\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\uFF08\u30A2\u30D7\u30EA\u306E\u7248\u3068\u306F\u5225\uFF09", SAVE_SCHEMA], ["\u6574\u5408\u6027\u306E\u691C\u67FB", errs.length ? `${errs.length} \u4EF6\u306E\u554F\u984C` : "\u554F\u984C\u306A\u3057"], ["\u6642\u9593\u306E\u901F\u5EA6", SPEEDS.find((s) => s.id === T3.speed)?.label]]),
      lb("\u904E\u53BB\u306E\u95B2\u89A7", "PAST VIEW"),
      note2("\u904E\u53BB\u306E\u56FD\u5BB6\u306E\u72B6\u614B\u3092\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u898B\u307E\u3059\u3002\u95B2\u89A7\u4E2D\u306F\u3001\u4E16\u754C\u3092\u5909\u3048\u308B\u64CD\u4F5C\u3068\u6642\u9593\u9032\u884C\u304C\u6B62\u307E\u308A\u307E\u3059\u3002"),
      h("div", { class: "rowb" }, past, btn("\u305D\u306E\u5E74\u3092\u898B\u308B", () => {
        const y = Number(past.value);
        if (Number.isFinite(y)) {
          run({ type: "view.past", month: Math.max(0, Math.min(c.monthIndex, c.monthIndex - (c.date.year - y) * 12)) });
          S.hooks.render();
        }
      }), btn("\u73FE\u5728\u3078\u623B\u308B", () => {
        run({ type: "view.past", month: null });
        S.hooks.render();
      }))
    );
  }
  function fileLoader(done2) {
    const inp = h("input", { type: "file", accept: ".ahw,.json,application/json", id: "loadfile", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = unpackSave(await f.text());
      if (!r.ok) {
        alert("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093:\n" + r.errors.join("\n"));
        return;
      }
      (done2 ?? S.hooks.loaded)(r.w, r.warnings);
    } });
    return h("span", {}, inp, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3080", () => inp.click(), "", { id: "load" }));
  }

  // js/ui/v6/main.js
  var $ = (s) => document.querySelector(s);
  var root = () => $("#v6-root");
  var HUB = [["geo", "\u5730\u7406", "GEO"], ["nations", "\u56FD\u5BB6", "NATION"], ["war", "\u6226\u4E89", "WAR"], ["diplo", "\u5916\u4EA4", "DIPLO"], ["culture", "\u6587\u5316", "CULT"], ["language", "\u8A00\u8A9E", "LANG"], ["religion", "\u5B97\u6559", "RELIG"], ["chron", "\u5E74\u8868", "CHRON"], ["stats", "\u7D71\u8A08", "STATS"], ["search", "\u691C\u7D22", "FIND"], ["settings", "\u4E16\u754C\u8A2D\u5B9A", "CONFIG"]];
  var PANELS = { geo: pGeo, nations: pNations, war: pWar, diplo: pDiplo, culture: () => pEntity("culture"), language: () => pEntity("language"), religion: () => pEntity("religion"), chron: pChron, stats: pStats, search: pSearch, settings: pSettings };
  function setup() {
    const seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3e3, 6e3, 2e4].map((n) => h("option", { value: n, selected: n === 6e3 }, n + " \u30BB\u30EB"))), magic = h("input", { type: "checkbox", id: "magic" }), msg = h("p", { class: "n", id: "setup-msg" });
    const go = () => {
      msg.textContent = "\u751F\u6210\u4E2D\u2026\uFF08\u5148\u53F2\u306E\u8A08\u7B97\u306B\u6570\u79D2\u304B\u304B\u308A\u307E\u3059\uFF09";
      setTimeout(() => {
        const r = createNewWorld({ worldSeed: seed.value, spec: { resolution: { targetCells: +cells.value } }, magic: { enabled: magic.checked } });
        if (!r.ok) {
          msg.textContent = r.errors.join(" / ");
          return;
        }
        S.w = r.w;
        founding();
      }, 30);
    };
    root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "ALTERHISTORY v6"), h("h1", {}, "\u4E16\u754C\u3092\u4F5C\u308B"), h("p", { class: "n" }, "\u7D0450\u4E07\u5E74\u306E\u5148\u53F2\u304B\u3089\u3001\u56FD\u5BB6\u304C\u751F\u307E\u308C\u308B\u6642\u4EE3\u3078\u3002"), h("label", {}, "\u4E16\u754C\u306E\u7A2E ", seed), h("label", {}, "\u89E3\u50CF\u5EA6 ", cells), h("label", {}, magic, " \u9B54\u6CD5\u3092\u6709\u52B9\u306B\u3059\u308B"), h("div", { class: "rowb" }, btn("\u4E16\u754C\u3092\u751F\u6210", go, "p", { id: "gen" }), fileLoader((w, warn) => {
      S.w = w;
      S.fileWarn = warn;
      start();
    })), msg));
  }
  function founding() {
    const c = S.w.civ.wcde.candidates ?? [], msg = h("p", { class: "n" }, c.length ? "\u56FD\u5BB6\u306B\u306A\u308B\u5019\u88DC\u3067\u3059\u3002\u62C5\u5F53\u3059\u308B\u56FD\u3092\u9078\u3076\u304B\u3001\u4E16\u754C\u306B\u4EFB\u305B\u3066\u898B\u5B88\u308A\u307E\u3059\u3002" : "\u307E\u3060\u56FD\u5BB6\u306E\u5019\u88DC\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u4E16\u754C\u306B\u4EFB\u305B\u3066\u9032\u3081\u307E\u3059\u3002"), list = h("div", {});
    for (const x of c.slice(0, 20)) list.append(h("div", { class: "row" }, h("span", { class: "g" }, h("b", {}, x.viaJa), h("br"), h("small", {}, `\u4EBA\u53E3 ${n0(x.pop)}\u30FB\u96C6\u56E3 ${x.groupIds.length}`)), btn("\u62C5\u5F53\u3057\u3066\u5EFA\u56FD", () => {
      const r = act({ type: "founding.found", candidateId: x.id });
      r.ok ? start() : msg.textContent = S.notice;
    })));
    root().replaceChildren(h("div", { class: "center" }, h("div", { class: "code" }, "FOUNDING"), h("h1", {}, "\u5EFA\u56FD"), msg, list, btn("\u4E16\u754C\u306B\u4EFB\u305B\u3066\u59CB\u3081\u308B\uFF08\u62C5\u5F53\u56FD\u306A\u3057\uFF09", () => {
      run({ type: "founding.delegate" });
      start();
    }, "", { id: "delegate" })));
  }
  function start() {
    S.hub = null;
    S.sel = controlled() ?? null;
    S.hooks = { render, panel: renderPanel, mapOnly: () => {
      S.map.draw();
      renderLegend();
    }, select, focusCell, loaded: (w, warn) => {
      S.w = w;
      S.fileWarn = warn;
      start();
    } };
    shell();
    render();
    clearInterval(S.timer);
    S.timer = setInterval(tick, 250);
  }
  function shell() {
    const cv = h("canvas", { id: "map", "aria-label": "\u4E16\u754C\u5730\u56F3" });
    root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }, h("div", { id: "pin" })), h("main", { id: "mapwrap" }, cv, h("div", { id: "hint" }, "\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u30FB\u30AF\u30EA\u30C3\u30AF\u3067\u56FD\u5BB6\u3092\u9078\u629E"), h("div", { id: "leg" }), h("div", { id: "callout" }), h("div", { id: "pops" })), h("aside", { id: "right", class: "open" }, h("div", { id: "rin" }, h("div", { id: "clock" }), h("h2", {}, "\u30CB\u30E5\u30FC\u30B9"), h("div", { id: "feed" })))), h("div", { id: "newsmodal", hidden: true }));
    S.map = new MapView(cv, S.w);
    S.map.sel = S.sel;
    S.map.onPick = callout;
    requestAnimationFrame(() => {
      S.map.draw();
      renderLegend();
    });
    window.addEventListener("resize", () => S.map?.draw());
  }
  function render() {
    if (!$("#hub")) return;
    renderHub();
    renderPanel();
    renderRight();
    renderNews();
    S.map.sel = S.sel;
    S.map.draw();
    renderLegend();
    const w = S.w;
    $("#hint").textContent = w.viewPast != null ? "\u904E\u53BB\u3092\u95B2\u89A7\u4E2D\u3002\u4E16\u754C\u3092\u5909\u3048\u308B\u64CD\u4F5C\u3068\u6642\u9593\u9032\u884C\u306F\u6B62\u307E\u3063\u3066\u3044\u307E\u3059\u3002" + (S.notice ? " " + S.notice : "") : S.notice || "\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u30FB\u30DB\u30A4\u30FC\u30EB\u3067\u62E1\u5927\u7E2E\u5C0F\u30FB\u30AF\u30EA\u30C3\u30AF\u3067\u56FD\u5BB6\u3092\u9078\u629E";
    $("#hint").style.color = S.notice || w.viewPast != null ? "var(--yellow)" : "";
  }
  function renderHub() {
    $("#hub").replaceChildren(...HUB.map(([k, ja, code]) => h("button", { class: S.hub === k ? "on" : "", "data-hub": k, onclick: () => {
      S.hub = S.hub === k ? null : k;
      render();
      setTimeout(() => S.map?.draw(), 220);
    } }, ja, h("small", {}, code))));
  }
  function renderPanel() {
    const p = $("#panel");
    if (!S.hub) {
      p.classList.remove("open");
      return;
    }
    p.classList.add("open");
    const keep = $("#pin").scrollTop;
    $("#pin").replaceChildren(PANELS[S.hub]());
    $("#pin").scrollTop = keep;
  }
  function renderLegend() {
    const M = S.map;
    if (!M) return;
    const L = M.legend(M.fillLayer);
    $("#leg").replaceChildren(h("b", {}, "\u51E1\u4F8B "), ...L.slice(0, 6).map((x) => h("span", { style: "margin-right:10px" }, x.c ? h("i", { style: `display:inline-block;width:10px;height:10px;background:${x.c};margin-right:4px` }) : "", x.t)));
    $("#leg").style.display = L.length ? "block" : "none";
  }
  function select(id) {
    S.sel = id;
    S.hub = "nations";
    if (!S.tab) S.tab = "politics";
    render();
    $("#callout").classList.remove("on");
  }
  function focusCell(cell) {
    const M = S.map, g = M.geo, W = M.cv.width, H = M.cv.height, [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W, H);
    M.view.k = 4;
    M.view.x = W / 2 - x * 4;
    M.view.y = H / 2 - y * 4;
    M.clamp();
    M.draw();
  }
  function callout(p) {
    const c = $("#callout"), civ3 = S.w.civ, st = p.stateId ? civ3.states[p.stateId] : null, ce = S.w.world.cell, mine = st && controlled() === st.id;
    const body = st ? [h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st.id)};display:inline-block;margin-right:6px` }), st.name), h("div", { class: "sub" }, `${polityJa(st.polity)}\u30FB\u4EBA\u53E3 ${n0(st.pop)}\u30FB\u5B89\u5B9A\u5EA6 ${pct(st.stability)}`), h("div", { class: "sub" }, `\u70BA\u653F\u8005: ${st.leader?.name ?? "\u2014"}`), p.settlement ? h("div", { class: "sub" }, `\u90FD\u5E02: ${p.settlement.name ?? "\u2014"}\uFF08\u4EBA\u53E3 ${n0(p.settlement.pop)}\uFF09`) : null, h("div", { class: "bt" }, btn("\u8A73\u7D30", () => select(st.id)), btn("\u5916\u4EA4", () => {
      S.tab = "diplomacy";
      select(st.id);
    }), mine ? null : btn("\u62C5\u5F53\u3059\u308B", () => {
      run({ type: "control.take", stateId: st.id });
      S.sel = st.id;
      render();
    }, "p"))] : [h("h3", {}, p.settlement?.name ?? "\u672A\u6240\u5C5E\u306E\u5730"), h("div", { class: "sub" }, `\u533A\u753B ${p.cell}\u30FB\u6A19\u9AD8 ${Math.round(ce.elevation[p.cell] * 100) / 100}\u30FB\u6C17\u6E29 ${Math.round(ce.temp[p.cell])}`), p.settlement ? h("div", { class: "sub" }, `\u4EBA\u53E3 ${n0(p.settlement.pop)}`) : h("div", { class: "sub" }, "\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u307E\u305B\u3093")];
    c.replaceChildren(...body);
    const W = $("#mapwrap").clientWidth;
    c.style.left = Math.min(Math.max(8, p.x + 10), W - 280) + "px";
    c.style.top = Math.max(8, p.y + 10) + "px";
    c.classList.add("on");
    if (st) {
      S.sel = st.id;
      S.map.sel = st.id;
      S.map.draw();
    }
  }
  function renderRight() {
    const w = S.w, T3 = timeOf(w.civ), feed = newsFeed(w.civ, { limit: 30, minLevel: "major" }), cs = controlled();
    $("#clock").replaceChildren(h("div", { class: "d", id: "date" }, formatWorldDate(w)), h("div", { class: "n" }, cs ? `\u62C5\u5F53: ${stateName(cs)}` : "\u62C5\u5F53\u56FD\u306A\u3057\uFF08\u898B\u5B88\u308A\uFF09"), h("div", { class: "c" }, ...SPEEDS.map((s) => h("button", { class: (T3.hold ? T3.resumeSpeed : T3.speed) === s.id ? "on" : "", "data-speed": s.id, onclick: () => {
      run({ type: "clock.setSpeed", speed: s.id });
      render();
    } }, s.label))), h("div", { class: "n", id: "runstate" }, T3.hold ? "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061\uFF08OK\u3067\u518D\u958B\uFF09" : T3.speed ? "\u9032\u884C\u4E2D" : "\u505C\u6B62\u4E2D"));
    $("#feed").replaceChildren(...feed.map((n) => h("div", { class: "ev" + (n.level === "critical" ? " y" : "") }, h("time", {}, `${n.date.year}\u5E74${n.date.month}\u6708`), n.title, " ", ...n.entityIds.filter((i) => w.civ.states[i]).slice(0, 2).map((i) => [link(i), " "]))));
  }
  function renderNews() {
    const m = $("#newsmodal"), q2 = newsOf(S.w.civ).queue;
    if (!q2.length) {
      m.hidden = true;
      m.replaceChildren();
      return;
    }
    const n = q2[0];
    m.hidden = false;
    m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "code", style: "justify-content:center" }, `\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\uFF08\u6B8B\u308A ${q2.length} \u4EF6\uFF09`), h("div", { class: "n" }, `${n.date.year}\u5E74${n.date.month}\u6708`), h("h2", {}, n.title), h("div", {}, ...n.entityIds.filter((i) => S.w.civ.states[i]).map((i) => [link(i), " "])), h("div", { class: "rowb", style: "justify-content:center;margin-top:16px" }, btn("OK", () => {
      run({ type: "news.ack", id: n.id });
      render();
    }, "p", { id: "ack" }))));
  }
  var liveN = 0;
  function tick() {
    const w = S.w;
    if (!w || w.viewPast != null || !isRunning(w.civ)) return;
    const T3 = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T3.speed)?.mps ?? 0, r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) });
    if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 });
    live();
  }
  function live() {
    if (!$("#hub")) return;
    renderRight();
    renderNews();
    S.map.draw();
    const a = document.activeElement;
    if (++liveN % 8 === 0 && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && ["nations", "war", "diplo", "stats"].includes(S.hub)) renderPanel();
    if (S.notice) $("#hint").textContent = S.notice;
  }
  function boot() {
    if (!document.getElementById("v6-root")) return;
    setup();
  }
  if (typeof window !== "undefined") {
    window.__v6 = { S, run, act, render: () => S.hooks.render?.(), start };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
