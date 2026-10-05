(() => {
  // js/core/store.js
  var DEFAULT_HISTORY_LIMIT = 200;
  var LOST = Symbol("saved-state-dropped-from-history");
  function createStore(initialState, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
    let state = initialState;
    let savedTop = null;
    const listeners = /* @__PURE__ */ new Set();
    const undoStack = [];
    const redoStack = [];
    let batch = null;
    const notify = (change) => {
      for (const fn of listeners) fn(state, change);
    };
    const pushHistory = (command) => {
      undoStack.push(command);
      if (undoStack.length > historyLimit) {
        const dropped = undoStack.shift();
        if (dropped === savedTop || savedTop === null) savedTop = LOST;
      }
      redoStack.length = 0;
    };
    return {
      getState: () => state,
      /** 状態変更を伴わない購読解除関数を返す */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** 変更を実行。履歴に積まれ、購読者に通知される */
      commit(command) {
        command.apply(state);
        if (batch) {
          batch.commands.push(command);
          notify({ type: "batch", label: command.label });
          return;
        }
        pushHistory(command);
        notify({ type: "commit", label: command.label });
      },
      /**
       * 複数の commit を1つのUndo単位にまとめる。
       * 例: ブラシで1回なぞる間の全セル変更を、Undo 1回で戻せるようにする。
       */
      beginBatch(label) {
        if (batch) throw new Error("\u30D0\u30C3\u30C1\u306F\u5165\u308C\u5B50\u306B\u3067\u304D\u307E\u305B\u3093");
        batch = { label, commands: [] };
      },
      endBatch() {
        if (!batch) return;
        const { label, commands } = batch;
        batch = null;
        if (commands.length === 0) return;
        pushHistory({
          label,
          apply: (s) => commands.forEach((c) => c.apply(s)),
          revert: (s) => [...commands].reverse().forEach((c) => c.revert(s))
        });
        notify({ type: "commit", label });
      },
      /** 未保存の変更があるか（ブラシ操作の途中も含む） */
      isDirty: () => (batch?.commands.length ?? 0) > 0 || (undoStack.at(-1) ?? null) !== savedTop,
      /** 今の状態を「保存済み」とする。保存が成功した直後に呼ぶ */
      markSaved() {
        savedTop = undoStack.at(-1) ?? null;
      },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      /** UIのボタンに「〇〇を元に戻す」と出すためのラベル */
      peekUndoLabel: () => undoStack.at(-1)?.label ?? null,
      peekRedoLabel: () => redoStack.at(-1)?.label ?? null,
      undo() {
        const cmd = undoStack.pop();
        if (!cmd) return false;
        cmd.revert(state);
        redoStack.push(cmd);
        notify({ type: "undo", label: cmd.label });
        return true;
      },
      redo() {
        const cmd = redoStack.pop();
        if (!cmd) return false;
        cmd.apply(state);
        undoStack.push(cmd);
        notify({ type: "redo", label: cmd.label });
        return true;
      },
      /**
       * 別のマップを読み込んだとき等、状態を丸ごと置き換える。
       * 履歴は破棄する（前のマップへの Undo は意味を持たないため）。
       */
      replace(newState) {
        state = newState;
        undoStack.length = 0;
        redoStack.length = 0;
        batch = null;
        savedTop = null;
        notify({ type: "replace" });
      },
      /** 履歴に載せない軽い状態変更（ツール選択・ズーム等）用 */
      update(mutator, label = "update") {
        mutator(state);
        notify({ type: "update", label });
      }
    };
  }

  // js/render/viewport.js
  function createViewport(mapWidth, mapHeight) {
    const vp = {
      mapWidth,
      mapHeight,
      screenWidth: 0,
      screenHeight: 0,
      x: 0,
      y: 0,
      k: 1,
      // 画面座標 = ワールド座標 * k + (x, y)
      fitK: 1,
      // 「全体表示」時の倍率（ズーム表示の基準）
      minK: 0.2,
      maxK: 60
    };
    vp.setMapSize = (w, h) => {
      vp.mapWidth = w;
      vp.mapHeight = h;
    };
    vp.fit = (margin = 16) => {
      const kx = (vp.screenWidth - margin * 2) / vp.mapWidth;
      const ky = (vp.screenHeight - margin * 2) / vp.mapHeight;
      vp.k = Math.max(0.01, Math.min(kx, ky));
      vp.fitK = vp.k;
      vp.minK = Math.min(vp.minK, vp.k * 0.5);
      vp.x = (vp.screenWidth - vp.mapWidth * vp.k) / 2;
      vp.y = (vp.screenHeight - vp.mapHeight * vp.k) / 2;
    };
    vp.centerOn = (wx, wy, k = vp.k) => {
      vp.k = Math.max(vp.minK, Math.min(vp.maxK, k));
      vp.x = vp.screenWidth / 2 - wx * vp.k;
      vp.y = vp.screenHeight / 2 - wy * vp.k;
    };
    vp.resize = (w, h) => {
      vp.screenWidth = w;
      vp.screenHeight = h;
    };
    vp.toWorld = (sx, sy) => [(sx - vp.x) / vp.k, (sy - vp.y) / vp.k];
    vp.toScreen = (wx, wy) => [wx * vp.k + vp.x, wy * vp.k + vp.y];
    vp.zoomAt = (sx, sy, factor) => {
      const k = Math.max(vp.minK, Math.min(vp.maxK, vp.k * factor));
      const [wx, wy] = vp.toWorld(sx, sy);
      vp.k = k;
      vp.x = sx - wx * k;
      vp.y = sy - wy * k;
    };
    vp.pan = (dx, dy) => {
      vp.x += dx;
      vp.y += dy;
    };
    vp.visibleBounds = (pad = 0) => {
      const [x0, y0] = vp.toWorld(-pad, -pad);
      const [x1, y1] = vp.toWorld(vp.screenWidth + pad, vp.screenHeight + pad);
      return { x0, y0, x1, y1 };
    };
    vp.apply = (ctx, dpr = 1) => ctx.setTransform(vp.k * dpr, 0, 0, vp.k * dpr, vp.x * dpr, vp.y * dpr);
    return vp;
  }

  // js/render/palette.js
  var NEUTRAL_COLOR = "#d8d2c0";
  var clamp01 = (v) => Math.min(1, Math.max(0, v));
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    const [r1, g1, b1] = hexToRgb(a), [r22, g2, b2] = hexToRgb(b);
    const u = clamp01(t);
    const c = (x, y) => Math.round(x + (y - x) * u).toString(16).padStart(2, "0");
    return `#${c(r1, r22)}${c(g1, g2)}${c(b1, b2)}`;
  }
  function landHeightColor(h) {
    const t = clamp01((h - 20) / 80);
    if (t < 0.25) return mix("#8fbf7a", "#d9d27a", t / 0.25);
    if (t < 0.6) return mix("#d9d27a", "#b58a5c", (t - 0.25) / 0.35);
    return mix("#b58a5c", "#f4f1ec", (t - 0.6) / 0.4);
  }

  // js/render/layers/terrain.js
  var OCEAN_NEAR = "#86aed0";
  var OCEAN_MID = "#6f97c0";
  var OCEAN_FAR = "#5a82ad";
  var LAKE = "#8bbbe0";
  function addCellPath(ctx, cells, vertices, i) {
    const poly = cells.v[i];
    for (let k = 0; k < poly.length; k++) {
      const p = vertices.p[poly[k]];
      if (k === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  }
  function waterColorOf(map, i) {
    const gi = map.geometry.pack.g[i];
    if (map.grid.features[map.grid.f[gi]]?.type === "lake") return LAKE;
    const t = map.grid.t[gi];
    return t === -1 ? OCEAN_NEAR : t === -2 ? OCEAN_MID : OCEAN_FAR;
  }
  var pathCache = /* @__PURE__ */ new WeakMap();
  var PLAIN_LAND = "#d8d2b4";
  function drawTerrain(ctx, map, vp, mode = "biome") {
    const { cells, vertices, h } = map.geometry.pack;
    const biome = map.pack.cells.biome;
    const biomeColor = map.biomesData.map((b) => b?.color ?? "#999");
    let cache = pathCache.get(map.geometry);
    const stamp = `${map.rev?.terrain ?? 0}`;
    if (!cache || cache.stamp !== stamp) {
      cache = { stamp, byKey: /* @__PURE__ */ new Map() };
      pathCache.set(map.geometry, cache);
    }
    const hasPath2D = typeof Path2D !== "undefined";
    function paint(landColor, { water = true, alpha = 1, key = "" } = {}) {
      let entries = cache.byKey.get(key);
      if (!entries) {
        const groups = /* @__PURE__ */ new Map();
        for (let i = 0; i < cells.v.length; i++) {
          const hi = h[i];
          let color;
          if (hi < 20) color = water ? waterColorOf(map, i) : null;
          else color = landColor(i, hi);
          if (color == null) continue;
          let list = groups.get(color);
          if (!list) {
            list = [];
            groups.set(color, list);
          }
          list.push(i);
        }
        entries = [];
        for (const [color, list] of groups) {
          if (hasPath2D) {
            const path = new Path2D();
            for (const i of list) addCellPath(path, cells, vertices, i);
            entries.push({ color, path });
          } else entries.push({ color, list });
        }
        cache.byKey.set(key, entries);
      }
      ctx.globalAlpha = alpha;
      for (const e of entries) {
        ctx.fillStyle = e.color;
        if (e.path) ctx.fill(e.path);
        else {
          ctx.beginPath();
          for (const i of e.list) addCellPath(ctx, cells, vertices, i);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    const byHeight = (_i, hi) => landHeightColor(Math.round(hi / 4) * 4);
    const byBiome = (i) => biomeColor[biome[i]] ?? "#999";
    if (mode === "none") paint(() => PLAIN_LAND, { key: "none" });
    else if (mode === "height") paint(byHeight, { key: "height" });
    else if (mode === "both") {
      paint(byBiome, { key: "biome" });
      paint(byHeight, { water: false, alpha: 0.5, key: "height-land" });
    } else paint(byBiome, { key: "biome" });
  }

  // js/render/edges.js
  function sharedVertices(v, i, j) {
    const a = v[i], b = v[j], out = [];
    for (let x = 0; x < a.length; x++) if (b.includes(a[x])) out.push(a[x]);
    return out;
  }
  function buildBoundarySegments(geometry, values, include = () => true, differs = (a, b) => a !== b) {
    const { cells, vertices } = geometry.pack;
    const out = [];
    for (let i = 0; i < cells.c.length; i++) {
      if (!include(i)) continue;
      for (const j of cells.c[i]) {
        if (j < i || !include(j)) continue;
        if (!differs(values[i], values[j])) continue;
        const sv2 = sharedVertices(cells.v, i, j);
        if (sv2.length < 2) continue;
        const p = vertices.p[sv2[0]], q = vertices.p[sv2[1]];
        out.push(p[0], p[1], q[0], q[1]);
      }
    }
    return Float32Array.from(out);
  }
  function strokeSegments(ctx, segs) {
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(segs[i], segs[i + 1]);
      ctx.lineTo(segs[i + 2], segs[i + 3]);
    }
    ctx.stroke();
  }
  function entityOutlineSegments(geometry, ids2, id, biome) {
    const inside = new Uint8Array(ids2.length);
    let any = false;
    for (let i = 0; i < ids2.length; i++) {
      if (ids2[i] === id && (!biome || biome[i] !== 0)) {
        inside[i] = 1;
        any = true;
      }
    }
    if (!any) return new Float32Array(0);
    return buildBoundarySegments(geometry, inside);
  }

  // js/render/layers/politics.js
  var SOURCES = {
    state: { cells: (m) => m.pack.cells.state, entities: (m) => m.pack.states },
    culture: { cells: (m) => m.pack.cells.culture, entities: (m) => m.pack.cultures },
    religion: { cells: (m) => m.pack.cells.religion, entities: (m) => m.pack.religions },
    province: { cells: (m) => m.pack.cells.province, entities: (m) => m.pack.provinces }
  };
  function parseColor(c) {
    if (typeof c !== "string") return null;
    let m = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    m = /^#([0-9a-f]{3})$/i.exec(c.trim());
    if (m) return [...m[1]].map((x) => parseInt(x + x, 16));
    m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(c);
    if (m) {
      const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100, q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
      const f = (t) => {
        t = (t + 1) % 1;
        return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      };
      return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }
    return null;
  }
  function shadeOf(color, step) {
    const rgb = parseColor(color);
    if (!rgb) return color;
    const k = [0, 0.14, -0.14, 0.26, -0.24, 0.07, -0.07][step % 7];
    const mix2 = k >= 0 ? 255 : 0, a = Math.abs(k);
    return `rgb(${rgb.map((v) => Math.round(v + (mix2 - v) * a)).join(",")})`;
  }
  var edgeCache = /* @__PURE__ */ new WeakMap();
  function cachedBoundary(geometry, values, include, tag) {
    let byTag = edgeCache.get(values);
    if (!byTag) {
      byTag = /* @__PURE__ */ new Map();
      edgeCache.set(values, byTag);
    }
    const hit = byTag.get(tag);
    if (hit && hit.geometry === geometry) return hit.segs;
    const segs = buildBoundarySegments(geometry, values, include);
    byTag.set(tag, { geometry, segs });
    return segs;
  }
  function drawPolitics(ctx, map, vp, kind, { alpha = 0.55, fill = true, lines = true } = {}) {
    const src = SOURCES[kind];
    if (!src) return;
    const { cells, vertices } = map.geometry.pack;
    const ids2 = src.cells(map);
    const entities = src.entities(map);
    const biome = map.pack.cells.biome;
    const isLand2 = (i) => biome[i] !== 0;
    const groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < cells.v.length; i++) {
      if (!isLand2(i)) continue;
      const id = ids2[i];
      const e = entities[id];
      if (!id || !e || e.removed) continue;
      let list = groups.get(id);
      if (!list) {
        list = [];
        groups.set(id, list);
      }
      list.push(i);
    }
    const provOf = kind === "state" ? map.pack.cells.province : null;
    const provinces = kind === "state" ? map.pack.provinces : null;
    const shadeGroups = /* @__PURE__ */ new Map();
    if (provOf) {
      for (const [id, list] of groups) {
        for (const i of list) {
          const pid = provOf[i], p = provinces?.[pid];
          if (!pid || !p || p.removed || p.state !== id) continue;
          const key = `${id}:${pid}`;
          let g = shadeGroups.get(key);
          if (!g) {
            g = { id, pid, list: [] };
            shadeGroups.set(key, g);
          }
          g.list.push(i);
        }
      }
    }
    if (fill) {
      ctx.globalAlpha = alpha;
      for (const [id, list] of groups) {
        ctx.fillStyle = entities[id].color ?? NEUTRAL_COLOR;
        ctx.beginPath();
        for (const i of list) addCellPath(ctx, cells, vertices, i);
        ctx.fill();
      }
      const byState = /* @__PURE__ */ new Map();
      for (const g of shadeGroups.values()) {
        const n = byState.get(g.id) ?? 0;
        byState.set(g.id, n + 1);
        g.step = n + 1;
      }
      for (const g of shadeGroups.values()) {
        if ((byState.get(g.id) ?? 0) < 1) continue;
        ctx.fillStyle = shadeOf(entities[g.id].color ?? NEUTRAL_COLOR, g.step);
        ctx.beginPath();
        for (const i of g.list) addCellPath(ctx, cells, vertices, i);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (!lines) return;
    if (provOf && shadeGroups.size) {
      const psegs = cachedBoundary(map.geometry, provOf, isLand2, "land:province");
      ctx.strokeStyle = "rgba(40,30,20,0.35)";
      ctx.lineWidth = 0.6 / vp.k;
      ctx.lineCap = "round";
      ctx.setLineDash([2 / vp.k, 2 / vp.k]);
      strokeSegments(ctx, psegs);
      ctx.setLineDash([]);
    }
    const segs = cachedBoundary(map.geometry, ids2, isLand2, "land:" + kind);
    ctx.strokeStyle = "rgba(40,30,20,0.75)";
    ctx.lineWidth = (kind === "state" ? 1.4 : 0.9) / vp.k;
    ctx.lineCap = "round";
    if (kind !== "state") ctx.setLineDash([3 / vp.k, 2 / vp.k]);
    strokeSegments(ctx, segs);
    ctx.setLineDash([]);
  }
  function drawCoast(ctx, map, vp) {
    const isWater2 = Uint8Array.from(map.pack.cells.biome, (b) => b === 0 ? 1 : 0);
    const segs = cachedBoundary(map.geometry, isWater2, () => true, "coast");
    ctx.strokeStyle = "rgba(45,50,60,0.85)";
    ctx.lineWidth = 0.9 / vp.k;
    ctx.lineCap = "round";
    strokeSegments(ctx, segs);
  }

  // js/render/layers/lines.js
  function drawRivers(ctx, map, vp) {
    const { p } = map.geometry.pack;
    ctx.strokeStyle = "#5f8fbf";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const r of map.pack.rivers) {
      if (!r || !r.cells || r.cells.length < 2) continue;
      ctx.lineWidth = Math.max(0.35, 0.25 + Math.sqrt(r.discharge ?? 1) * 0.045);
      ctx.beginPath();
      let started = false;
      for (const c of r.cells) {
        const pt = p[c];
        if (!pt) continue;
        if (!started) {
          ctx.moveTo(pt[0], pt[1]);
          started = true;
        } else ctx.lineTo(pt[0], pt[1]);
      }
      ctx.stroke();
    }
  }
  var ROUTE_STYLE = {
    roads: { color: "#7a4b25", width: 1, dash: null },
    trails: { color: "#8a6a45", width: 0.7, dash: [2, 1.5] },
    searoutes: { color: "#3f5f8f", width: 0.8, dash: [0.8, 2.2] }
  };
  function drawRoutes(ctx, map, vp, groups = { roads: true, trails: true, searoutes: true }) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const r of map.routes) {
      if (!r || !groups[r.group] || !r.points || r.points.length < 2) continue;
      const st = ROUTE_STYLE[r.group] ?? ROUTE_STYLE.roads;
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = st.width;
      ctx.setLineDash(st.dash ?? []);
      ctx.beginPath();
      ctx.moveTo(r.points[0][0], r.points[0][1]);
      for (let i = 1; i < r.points.length; i++) ctx.lineTo(r.points[i][0], r.points[i][1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // js/render/fonts.js
  var FONT_PLACE = '"Shippori Mincho","Noto Serif JP","Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif CJK JP","MS PMincho",serif';
  var FACES = ['500 16px "Shippori Mincho"', '700 16px "Shippori Mincho"', '800 16px "Shippori Mincho"'];
  function loadMapFonts(text2, onReady) {
    if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve(false);
    const sample = [...new Set(String(text2))].join("") || "\u3042\u30A2\u4E9C";
    return Promise.all(FACES.map((f) => document.fonts.load(f, sample))).then((r) => {
      const got = r.some((x) => x.length);
      if (got) onReady?.();
      return got;
    }).catch(() => false);
  }

  // js/core/sim/units.js
  var UNIT_TYPES = Object.freeze([
    {
      key: "infantry",
      label: "\u6B69\u5175",
      unit: "\u4EBA",
      icon: "\u2694\uFE0F",
      soft: 1,
      hard: 0.1,
      hardness: 0,
      rural: 0.9,
      urban: 0.5,
      industryShare: 0,
      desc: "\u8ECD\u306E\u4E3B\u529B\u3002\u5B89\u4FA1\u3067\u6570\u304C\u51FA\u305B\u308B\u304C\u3001\u6226\u8ECA\u306B\u306F\u5F31\u3044\u3002"
    },
    {
      key: "cavalry",
      label: "\u9A0E\u5175",
      unit: "\u9A0E",
      icon: "\u{1F40E}",
      soft: 1.6,
      hard: 0.3,
      hardness: 0,
      rural: 0.2,
      urban: 0.05,
      industryShare: 0,
      maxTech: 6,
      desc: "\u99AC\u306B\u4E57\u3063\u305F\u6A5F\u52D5\u5175\u3002\u53E4\u3044\u6642\u4EE3\u306E\u4E3B\u529B\u3067\u3001\u6A5F\u95A2\u9283\u3084\u6226\u8ECA\u306E\u6642\u4EE3\u306B\u306F\u8870\u3048\u308B\u3002"
    },
    {
      key: "archers",
      label: "\u5F13\u5175",
      unit: "\u4EBA",
      icon: "\u{1F3F9}",
      soft: 0.8,
      hard: 0.05,
      hardness: 0,
      rural: 0.4,
      urban: 0.1,
      industryShare: 0,
      maxTech: 4,
      desc: "\u5F13\u30FB\u5F29\u306E\u9060\u8DDD\u96E2\u5175\u3002\u706B\u5668\u306E\u6642\u4EE3\u306B\u306F\u4F7F\u308F\u308C\u306A\u304F\u306A\u308B\u3002"
    },
    {
      key: "artillery",
      label: "\u7832\u5175",
      unit: "\u9580",
      icon: "\u{1F4A5}",
      soft: 4,
      hard: 1.5,
      hardness: 0.05,
      rural: 0.05,
      urban: 0.04,
      industryShare: 0.08,
      minTech: 2,
      desc: "\u6B69\u5175\u306E\u652F\u63F4\u706B\u529B\u3002\u4EBA\u306B\u5BFE\u3057\u3066\u5F37\u304F\u3001\u6B69\u5175\u304C\u591A\u3044\u8ECD\u307B\u3069\u52B9\u679C\u304C\u51FA\u308B\u3002"
    },
    {
      key: "armor",
      label: "\u6A5F\u7532",
      unit: "\u53F0",
      icon: "\u{1F6E1}\uFE0F",
      soft: 3,
      hard: 10,
      hardness: 0.9,
      rural: 0,
      urban: 0,
      industryShare: 0.35,
      minTech: 4,
      desc: "\u6226\u8ECA\u30FB\u88C5\u7532\u8ECA\u3002\u7A81\u7834\u529B\u304C\u9AD8\u3044\u304C\u9AD8\u4FA1\u3067\u3001\u6574\u5099\u3067\u304D\u308B\u7523\u696D\u304C\u8981\u308B\u3002"
    },
    {
      key: "air",
      label: "\u822A\u7A7A",
      unit: "\u6A5F",
      icon: "\u2708\uFE0F",
      soft: 5,
      hard: 6,
      hardness: 0,
      rural: 0,
      urban: 0,
      industryShare: 0.25,
      minTech: 4,
      desc: "\u6226\u95D8\u6A5F\u30FB\u7206\u6483\u6A5F\u3002\u5236\u7A7A\u6A29\u3092\u53D6\u308B\u3068\u9678\u8ECD\u306E\u640D\u5BB3\u304C\u6E1B\u308B\u3002"
    },
    {
      key: "navy",
      label: "\u6D77\u8ECD",
      unit: "\u96BB",
      icon: "\u{1F6A2}",
      soft: 8,
      hard: 14,
      hardness: 0.6,
      rural: 0,
      urban: 0,
      industryShare: 0.2,
      naval: true,
      minTech: 2,
      needsCoast: true,
      desc: "\u8266\u8247\u3002\u5236\u6D77\u6A29\u3092\u53D6\u308C\u308B\u3002\u6D77\u306B\u9762\u3057\u3066\u3044\u306A\u3044\u56FD\u306F\u6301\u3066\u306A\u3044\u3002"
    },
    {
      key: "special",
      label: "\u7279\u6B8A\u90E8\u968A",
      unit: "\u4EBA",
      icon: "\u{1F396}\uFE0F",
      soft: 1.5,
      hard: 0.5,
      hardness: 0.1,
      rural: 0.02,
      urban: 0.03,
      industryShare: 0.05,
      minTech: 3,
      desc: "\u7A7A\u633A\u30FB\u5C71\u5CB3\u30FB\u7279\u6B8A\u4F5C\u6226\u3002\u5C11\u6570\u7CBE\u92ED\u3067\u3001\u5730\u5F62\u306E\u60AA\u3044\u6240\u306B\u5F37\u3044\u3002"
    },
    {
      key: "advanced",
      label: "\u5148\u7AEF\u6280\u8853",
      unit: "\u57FA",
      icon: "\u{1F52C}",
      soft: 2,
      hard: 6,
      hardness: 0.5,
      rural: 0,
      urban: 0.02,
      industryShare: 0.15,
      minTech: 6,
      desc: "\u30DF\u30B5\u30A4\u30EB\u30FB\u96FB\u5B50\u6226\u30FB\u7121\u4EBA\u6A5F\u3002\u6280\u8853\u6C34\u6E96\u304C\u9AD8\u3044\u56FD\u3060\u3051\u304C\u6301\u3066\u308B\u3002"
    },
    {
      key: "nuclear",
      label: "\u6838",
      unit: "\u767A",
      icon: "\u2622\uFE0F",
      soft: 500,
      hard: 500,
      hardness: 0,
      rural: 0,
      urban: 0,
      industryShare: 0,
      minTech: 9,
      desc: "\u901A\u5E38\u306E\u6226\u4E89\u3067\u306F\u4F7F\u308F\u308C\u306A\u3044\u3002\u4F5C\u6226\u3068\u3057\u3066\u7ACB\u6848\u30FB\u5B9F\u884C\u3059\u308B\u3002\u5E74\u6B21\u3067\u306F\u5897\u3048\u306A\u3044\u3002"
    }
  ]);
  var UNIT_KEYS = UNIT_TYPES.map((u) => u.key);
  var UNIT_BY_KEY = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, u]));
  var DOCTRINES = Object.freeze([
    {
      key: "balanced",
      label: "\u5747\u8861",
      mult: { infantry: 1, cavalry: 1, archers: 1, artillery: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 },
      moraleLoss: 1,
      war: { attack: 0.02, defense: 0.02, noise: 0.5, ownLoss: 1, enemyLoss: 1, speed: 1, moraleHit: 1 },
      desc: "\u504F\u308A\u306E\u306A\u3044\u6A19\u6E96\u7684\u306A\u8ECD\u3002\u5F97\u610F\u3082\u82E6\u624B\u3082\u306A\u3044\u3002",
      merit: "\u5224\u5B9A\u306E\u30D6\u30EC\u304C\u5C0F\u3055\u304F\u3001\u5B89\u5B9A\u3057\u3066\u5B9F\u529B\u3069\u304A\u308A\u306E\u7D50\u679C\u306B\u306A\u308B\u3002\u653B\u3081\u3082\u5B88\u308A\u3082\u5C11\u3057\u6709\u5229\u3002"
    },
    {
      key: "mobile",
      label: "\u6A5F\u52D5\u6226",
      mult: { infantry: 0.9, cavalry: 1.2, archers: 1, artillery: 0.9, armor: 1.3, air: 1.15, navy: 1, special: 1, advanced: 1, nuclear: 1 },
      moraleLoss: 0.85,
      war: { attack: 0.08, defense: -0.03, noise: 1.2, ownLoss: 1, enemyLoss: 1.1, speed: 0.7, moraleHit: 0.85 },
      desc: "\u6226\u8ECA\u30FB\u9A0E\u5175\u30FB\u822A\u7A7A\u6A5F\u3067\u6575\u306E\u5F8C\u65B9\u3078\u7A81\u7834\u3059\u308B\u3002\u6A5F\u7532\u30FB\u822A\u7A7A\u304C\u5F37\u304F\u3001\u58EB\u6C17\u304C\u5D29\u308C\u306B\u304F\u3044\u3002\u6B69\u5175\u30FB\u7832\u5175\u306F\u5C11\u3057\u5F31\u3044\u3002",
      merit: "\u77ED\u671F\u6C7A\u6226\u306B\u5F37\u3044\uFF08\u6226\u4E89\u304C\u77ED\u304F\u7D42\u308F\u308B\uFF09\u3002\u653B\u3081\u308B\u5074\u3067\u7279\u306B\u5F37\u304F\u3001\u6575\u306E\u58EB\u6C17\u3092\u5927\u304D\u304F\u524A\u308B\u3002"
    },
    {
      key: "firepower",
      label: "\u706B\u529B\u4E3B\u7FA9",
      mult: { infantry: 1.15, cavalry: 1, archers: 1.1, artillery: 1.3, armor: 1, air: 1, navy: 1, special: 1.15, advanced: 1, nuclear: 1 },
      moraleLoss: 1,
      war: { attack: 0.03, defense: 0.03, noise: 0.8, ownLoss: 0.8, enemyLoss: 1.2, speed: 1.1, moraleHit: 1 },
      desc: "\u5927\u91CF\u306E\u7832\u6483\u3067\u62BC\u3057\u3064\u3076\u3059\u3002\u6B69\u5175\u3068\u7832\u5175\u304C\u5F37\u3044\u3002\u7A81\u7834\u529B\u306F\u306A\u3044\u3002",
      merit: "\u81EA\u8ECD\u306E\u640D\u5BB3\u304C\u5C11\u306A\u304F\u3001\u76F8\u624B\u306B\u5927\u304D\u306A\u640D\u5BB3\u3092\u4E0E\u3048\u308B\u6D88\u8017\u6226\u306B\u5F37\u3044\u3002"
    },
    {
      key: "battleplan",
      label: "\u8A08\u753B\u9632\u5FA1",
      mult: { infantry: 1, cavalry: 0.95, archers: 1.1, artillery: 1.1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 },
      moraleLoss: 1,
      war: { attack: -0.02, defense: 0.15, noise: 0.7, ownLoss: 0.9, enemyLoss: 1, speed: 1.3, moraleHit: 0.9 },
      desc: "\u9663\u5730\u3092\u56FA\u3081\u3066\u5B88\u308B\u3002\u5B88\u308B\u5074\u306E\u3068\u304D\u6226\u529B\u304C15%\u4E0A\u304C\u308B\u3002\u653B\u3081\u306F\u666E\u901A\u3002",
      merit: "\u5B88\u308A\u3067\u975E\u5E38\u306B\u5F37\u304F\u3001\u640D\u5BB3\u3082\u5C11\u306A\u3044\u3002\u6226\u4E89\u306F\u9577\u5F15\u304F\u304C\u3001\u7C21\u5358\u306B\u306F\u8CA0\u3051\u306A\u3044\u3002"
    },
    {
      key: "massassault",
      label: "\u4EBA\u6D77\u6226\u8853",
      mult: { infantry: 1.3, cavalry: 1.1, archers: 1.1, artillery: 1, armor: 0.85, air: 0.85, navy: 1, special: 1, advanced: 0.85, nuclear: 1 },
      moraleLoss: 1.25,
      conscriptBonus: 0.3,
      war: { attack: 0.05, defense: 0, noise: 1.1, ownLoss: 1.25, enemyLoss: 1, speed: 0.9, moraleHit: 1.25 },
      desc: "\u6570\u3067\u62BC\u3059\u3002\u6B69\u5175\u304C\u5F37\u304F\u5FB4\u5175\u3082\u591A\u3044\u3002\u640D\u5BB3\u304C\u51FA\u308B\u3068\u58EB\u6C17\u304C\u5D29\u308C\u3084\u3059\u3044\u3002\u6A5F\u7532\u30FB\u822A\u7A7A\u306F\u5F31\u3044\u3002",
      merit: "\u5175\u304C\u591A\u3044\u56FD\u307B\u3069\u5727\u5012\u3067\u304D\u308B\u3002\u640D\u5BB3\u306F\u5927\u304D\u3044\u304C\u3001\u5FB4\u5175\u306E\u88DC\u5145\u304C\u901F\u304F\u7ACB\u3066\u76F4\u305B\u308B\u3002"
    }
  ]);
  var DOCTRINE_BY_KEY = Object.fromEntries(DOCTRINES.map((d) => [d.key, d]));
  var DEFAULT_DOCTRINE = "balanced";
  var STATE_TYPE_MULT = Object.freeze({
    Generic: { artillery: 1, infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1 },
    Naval: { artillery: 1, infantry: 0.85, armor: 0.9, air: 1.05, navy: 1.8, special: 1.05, advanced: 1 },
    Nomadic: { artillery: 1, infantry: 0.75, armor: 1.15, air: 0.6, navy: 0.3, special: 1.25, advanced: 0.9 },
    Highland: { artillery: 1, infantry: 1.15, armor: 0.6, air: 0.6, navy: 0.3, special: 1.35, advanced: 1 },
    Hunting: { artillery: 1, infantry: 1.1, armor: 0.5, air: 0.5, navy: 0.6, special: 1.4, advanced: 0.9 },
    Lake: { artillery: 1, infantry: 1, armor: 1, air: 1, navy: 1.2, special: 1, advanced: 1 },
    River: { artillery: 1, infantry: 1.05, armor: 1, air: 1, navy: 1.15, special: 1, advanced: 1 }
  });
  function stateTypeMult(type) {
    return STATE_TYPE_MULT[type] ?? STATE_TYPE_MULT.Generic;
  }
  function emptyForce() {
    return Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
  }
  function forcePower(units, doctrineKey = DEFAULT_DOCTRINE) {
    const mult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE].mult;
    let total = 0;
    for (const key of UNIT_KEYS) {
      const n = units?.[key] ?? 0;
      if (n > 0) total += n * ((UNIT_BY_KEY[key].soft + UNIT_BY_KEY[key].hard) / 2) * (mult[key] ?? 1);
    }
    return total;
  }
  function forceHeadcount(units) {
    return UNIT_KEYS.reduce((sum, k) => sum + (units?.[k] ?? 0), 0);
  }
  function forceHardness(units) {
    let weight = 0, sum = 0;
    for (const key of UNIT_KEYS) {
      const n = units?.[key] ?? 0;
      if (n <= 0) continue;
      weight += n;
      sum += n * UNIT_BY_KEY[key].hardness;
    }
    return weight > 0 ? sum / weight : 0;
  }
  function attackDamage(units, defenderHardness, doctrineKey = DEFAULT_DOCTRINE, stateType = "Generic") {
    const dmult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE].mult;
    const tmult = stateTypeMult(stateType);
    let total = 0;
    for (const key of UNIT_KEYS) {
      const n = units?.[key] ?? 0;
      if (n <= 0) continue;
      const def = UNIT_BY_KEY[key];
      const effective = def.soft * (1 - defenderHardness) + def.hard * defenderHardness;
      total += n * effective * (dmult[key] ?? 1) * (tmult[key] ?? 1);
    }
    return total;
  }

  // js/core/query.js
  var nameOf = (list, id) => {
    const e = list?.[id];
    if (!e || e.removed) return null;
    return e.fullName ?? e.name ?? null;
  };
  function describeCell(map, i) {
    const c = map.pack.cells;
    if (!map.geometry || i < 0 || i >= c.biome.length) return null;
    const isWater2 = c.biome[i] === 0;
    const burgId = c.burg[i];
    return {
      cell: i,
      water: isWater2,
      height: map.geometry.pack.h[i],
      biome: map.biomesData[c.biome[i]]?.name ?? null,
      state: isWater2 ? null : nameOf(map.pack.states, c.state[i]),
      culture: isWater2 ? null : nameOf(map.pack.cultures, c.culture[i]),
      religion: isWater2 ? null : nameOf(map.pack.religions, c.religion[i]),
      province: isWater2 ? null : nameOf(map.pack.provinces, c.province[i]),
      burg: burgId ? map.pack.burgs[burgId]?.name ?? null : null,
      hasRiver: c.river[i] > 0
    };
  }
  var ENTITY_KINDS = Object.freeze({
    state: { label: "\u56FD\u5BB6", entities: (m) => m.pack.states, cells: (m) => m.pack.cells.state },
    culture: { label: "\u6587\u5316", entities: (m) => m.pack.cultures, cells: (m) => m.pack.cells.culture },
    religion: { label: "\u5B97\u6559", entities: (m) => m.pack.religions, cells: (m) => m.pack.cells.religion },
    province: { label: "\u5C5E\u5DDE", entities: (m) => m.pack.provinces, cells: (m) => m.pack.cells.province }
  });
  function listEntities(map, kind) {
    const def = ENTITY_KINDS[kind];
    if (!def) return [];
    const ids2 = def.cells(map);
    const counts = /* @__PURE__ */ new Map();
    for (let i = 0; i < ids2.length; i++) {
      if (map.pack.cells.biome[i] === 0) continue;
      counts.set(ids2[i], (counts.get(ids2[i]) ?? 0) + 1);
    }
    return def.entities(map).filter((e) => e && e.i && !e.removed && counts.has(e.i)).map((e) => ({
      id: e.i,
      name: e.fullName ?? e.name ?? `#${e.i}`,
      color: e.color ?? "#ccc",
      cells: counts.get(e.i),
      center: e.center ?? null,
      pole: e.pole ?? null
    })).sort((a, b) => b.cells - a.cells);
  }
  function burgNearCell(map, cell, hops = 2) {
    const { burg } = map.pack.cells;
    const adj = map.geometry.pack.cells.c;
    const seen = /* @__PURE__ */ new Set([cell]);
    let layer = [cell];
    for (let h = 0; h <= hops; h++) {
      for (const i of layer) {
        const b = map.pack.burgs[burg[i]];
        if (burg[i] > 0 && b && !b.removed && b.i) return b;
      }
      const next = [];
      for (const i of layer) for (const j of adj[i]) if (!seen.has(j)) {
        seen.add(j);
        next.push(j);
      }
      layer = next;
    }
    return null;
  }
  function placeLabel(map, cell) {
    const b = burgNearCell(map, cell, 2);
    if (b) return b.name;
    if (map.pack.cells.biome[cell] === 0) return "\u6D77\u4E0A";
    const s = map.pack.states[map.pack.cells.state[cell]];
    return s && s.i && !s.removed ? `${s.name}\u9818\u5185` : "\u7121\u4EBA\u306E\u5730";
  }
  function entityPosition(map, entity) {
    if (entity.pole) return [entity.pole[0], entity.pole[1]];
    const p = entity.center != null ? map.geometry?.pack.p[entity.center] : null;
    return p ? [p[0], p[1]] : null;
  }
  var isLiveState = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function statePopulation(state) {
    return (state.rural ?? 0) + (state.urban ?? 0);
  }
  function stateMilitaryPower(state) {
    const list = Array.isArray(state.military) ? state.military : [];
    const doctrine = state.doctrine ?? "balanced";
    return list.reduce((sum, r) => sum + forcePower(r.u, doctrine), 0);
  }
  function stateHeadcount(state) {
    const list = Array.isArray(state.military) ? state.military : [];
    return list.reduce((sum, r) => sum + forceHeadcount(r.u), 0);
  }
  function rankStates(map, metric) {
    const states = map.pack.states.filter(isLiveState);
    const valueOf = {
      population: statePopulation,
      military: stateMilitaryPower,
      cells: (s) => s.cells ?? 0,
      area: (s) => s.area ?? 0
    }[metric];
    if (!valueOf) return [];
    return states.map((s) => ({ id: s.i, name: s.fullName ?? s.name ?? `#${s.i}`, value: valueOf(s) })).sort((a, b) => b.value - a.value).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  function stateRank(map, stateId, metric) {
    const ranked = rankStates(map, metric);
    const total = ranked.length;
    const entry = ranked.find((r) => r.id === stateId);
    return entry ? { rank: entry.rank, total, value: entry.value } : null;
  }

  // js/render/layers/places.js
  var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  var ramp = (z, z0, z1) => clamp((z - z0) / (z1 - z0), 0, 1);
  var zoomOf = (vp) => vp.fitK > 0 ? vp.k / vp.fitK : 1;
  function rankBurgs(map) {
    const live3 = map.pack.burgs.filter((b) => b && b.i && !b.removed);
    const towns = live3.filter((b) => !b.capital).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    const p = /* @__PURE__ */ new Map();
    towns.forEach((b, i) => p.set(b, towns.length > 1 ? i / (towns.length - 1) : 0));
    const capitals = live3.filter((b) => b.capital).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    return { capitals, towns, percentile: (b) => b.capital ? -1 : p.get(b) ?? 1 };
  }
  var labelZoom = (pc) => pc < 0 ? 0 : 1.15 + 5.2 * Math.pow(pc, 0.85);
  var iconZoom = (pc) => pc < 0 ? 0 : labelZoom(pc) * 0.72;
  function drawBurgs(ctx, map, vp, { minPopulation = 0, auto = false } = {}) {
    const vb = vp.visibleBounds(8);
    const z = zoomOf(vp);
    const rank = auto ? rankBurgs(map) : null;
    for (const b of map.pack.burgs) {
      if (!b || !b.i || b.removed) continue;
      if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue;
      if (!b.capital && (b.population ?? 0) < minPopulation) continue;
      let alpha = 1, big = false;
      if (auto) {
        const pc = rank.percentile(b);
        alpha = b.capital ? 1 : ramp(z, iconZoom(pc), iconZoom(pc) + 0.4);
        big = pc >= 0 && pc < 0.12;
        if (alpha <= 0) continue;
      }
      const r = (b.capital ? 4 : big ? 2.8 : 2.1) / vp.k;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.capital ? "#8a2323" : "#f6f1e5";
      ctx.fill();
      ctx.lineWidth = (b.capital ? 1.4 : 1) / vp.k;
      ctx.strokeStyle = "#2b2118";
      ctx.stroke();
      if (b.capital) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = "#f6f1e5";
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawLabels(ctx, map, vp, { states = true, burgs = "auto" } = {}) {
    const placed = [];
    const k = vp.k;
    const z = zoomOf(vp);
    const vb = vp.visibleBounds(0);
    const inView = (x, y) => x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;
    const hasSpacing = "letterSpacing" in ctx;
    const tryPlace = (text2, wx, wy0, sizePx, style) => {
      if (!text2) return false;
      for (const dyPx of style.shifts ?? [0]) if (placeOnce(text2, wx, wy0 + dyPx / k, sizePx, style)) return true;
      return false;
    };
    const placeOnce = (text2, wx, wy, sizePx, style) => {
      const sp = style.spacing ?? 0;
      ctx.font = `${style.weight >= 700 ? "bold " : ""}${sizePx / k}px ${FONT_PLACE}`;
      if (hasSpacing) ctx.letterSpacing = `${sp / k}px`;
      const w = ctx.measureText(text2).width * k;
      const [sx, sy] = vp.toScreen(wx, wy);
      const pad = 3;
      const rect = [sx - w / 2 - pad, sy - sizePx / 2 - 2, sx + w / 2 + pad, sy + sizePx / 2 + 2];
      for (const r of placed) {
        if (rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) {
          if (hasSpacing) ctx.letterSpacing = "0px";
          return false;
        }
      }
      placed.push(rect);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.globalAlpha = style.alpha ?? 1;
      ctx.lineWidth = style.halo / k;
      ctx.strokeStyle = "rgba(250,246,232,0.93)";
      ctx.strokeText(text2, wx, wy);
      ctx.fillStyle = style.color;
      ctx.fillText(text2, wx, wy);
      ctx.globalAlpha = 1;
      if (hasSpacing) ctx.letterSpacing = "0px";
      return true;
    };
    const rank = burgs === false ? null : rankBurgs(map);
    const auto = burgs === "auto";
    const capitalsOnly = burgs === "capitals";
    const sizeOf = (b, pc) => {
      const base = pc < 0 ? 14.5 : pc < 0.12 ? 12.5 : pc < 0.4 ? 11.5 : 10.5;
      return base * (auto ? 1 + 0.05 * clamp(z - 2, 0, 6) : 1);
    };
    const placeBurg = (b) => {
      if (!inView(b.x, b.y)) return;
      const pc = rank.percentile(b);
      let alpha = 1;
      if (auto) {
        const z0 = labelZoom(pc);
        alpha = b.capital ? 1 : ramp(z, z0, z0 + 0.5);
        if (alpha <= 0) return;
      }
      const size = sizeOf(b, pc);
      const dy = (b.capital ? 7.5 : 6) / k;
      tryPlace(b.name ?? "", b.x, b.y + dy, size, { color: b.capital ? "#1c120b" : "#241a12", halo: 2.8, weight: b.capital ? 800 : 500, spacing: b.capital ? 0.6 : 0.2, alpha });
    };
    if (rank) for (const b of rank.capitals) placeBurg(b);
    if (states) {
      const list = map.pack.states.filter((s) => s && s.i && !s.removed && s.pole).sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
      const fade = burgs === "auto" ? 1 - 0.8 * ramp(z, 4.5, 8) : 1;
      for (const s of list) {
        if (!inView(s.pole[0], s.pole[1])) continue;
        const size = clamp(12 + Math.sqrt(s.area ?? 0) * 0.012 * Math.min(k, 3), 14, 24);
        const draw = fade > 0.5 ? tryPlace : (...a) => placedSoft(...a);
        draw(s.name ?? "", s.pole[0], s.pole[1], size, { color: "#2a1d12", halo: 3.6, weight: 800, spacing: size * 0.18, alpha: fade, shifts: [0, -22, 22, -40, 40] });
      }
    }
    function placedSoft(text2, wx, wy, sizePx, style) {
      const before = placed.length;
      const ok = tryPlace(text2, wx, wy, sizePx, style);
      if (ok) placed.length = before;
      return ok;
    }
    if (!rank || capitalsOnly) return;
    const topN = Math.max(1, Math.round(rank.towns.length * 0.15));
    for (const b of rank.towns.slice(0, topN)) placeBurg(b);
    if (auto) {
      const a = ramp(z, 1.7, 2.3) * (1 - ramp(z, 7.5, 10));
      if (a > 0) {
        for (const p of map.pack.provinces ?? []) {
          if (!p || !p.i || p.removed || !p.name) continue;
          const pos = entityPosition(map, p);
          if (!pos || !inView(pos[0], pos[1])) continue;
          tryPlace(p.name, pos[0], pos[1] - 11 / k, 11.5, { color: "#4a3826", halo: 2.6, weight: 500, spacing: 3.2, alpha: a * 0.9, shifts: [0, 16, -16] });
        }
      }
    }
    for (const b of rank.towns.slice(topN)) placeBurg(b);
  }

  // js/render/layers/trade-lines.js
  function drawTradeLines(ctx, vp, lines) {
    if (!lines?.length) return;
    const k = vp.k;
    ctx.save();
    ctx.lineCap = "round";
    for (const l of lines) {
      const mx = (l.x0 + l.x1) / 2, my = (l.y0 + l.y1) / 2;
      const dx = l.x1 - l.x0, dy = l.y1 - l.y0;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - dy / len * len * 0.12, cy = my + dx / len * len * 0.12;
      const color = l.kind === "export" ? "#f2c14e" : "#4fd1c5";
      for (const [style, width] of [["rgba(10,12,16,0.65)", l.w + 2.5], [color, l.w]]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width / k;
        ctx.beginPath();
        ctx.moveTo(l.x0, l.y0);
        for (let t = 1; t <= 16; t++) {
          const u = t / 16, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
          ctx.lineTo(a * l.x0 + b * cx + c * l.x1, a * l.y0 + b * cy + c * l.y1);
        }
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(l.x1, l.y1, (l.w + 2) / k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // js/core/edit/commands.js
  function makeCommand(label, layers, parts) {
    const bump = (state) => {
      const r = state.map.rev;
      for (const l of layers) r[l]++;
    };
    return {
      label,
      layers,
      parts,
      apply(state) {
        for (const p of parts) p.apply(state.map);
        bump(state);
      },
      revert(state) {
        for (let i = parts.length - 1; i >= 0; i--) parts[i].revert(state.map);
        bump(state);
      }
    };
  }
  function setIndexed(getArray, changes) {
    return {
      apply(map) {
        const a = getArray(map);
        for (const [i, , after] of changes) a[i] = after;
      },
      revert(map) {
        const a = getArray(map);
        for (const [i, before] of changes) a[i] = before;
      }
    };
  }
  function setProps(target, patch) {
    const before = {};
    for (const k of Object.keys(patch)) before[k] = Object.prototype.hasOwnProperty.call(target, k) ? { v: target[k] } : null;
    return {
      apply() {
        for (const [k, v] of Object.entries(patch)) {
          if (v === void 0) delete target[k];
          else target[k] = v;
        }
      },
      revert() {
        for (const [k, b] of Object.entries(before)) {
          if (b === null) delete target[k];
          else target[k] = b.v;
        }
      }
    };
  }
  function setList(get, set, after) {
    let before = null;
    return {
      apply(map) {
        if (before === null) before = get(map);
        set(map, after);
      },
      revert(map) {
        set(map, before);
      }
    };
  }

  // js/core/edit/zones.js
  var ZONE_TYPES = Object.freeze([
    { id: "Invasion", label: "\u4FB5\u653B", color: "#d6453d" },
    { id: "Rebels", label: "\u53CD\u4E71", color: "#e8913a" },
    { id: "Proselytism", label: "\u5E03\u6559", color: "#5aa9d6" },
    { id: "Crusade", label: "\u8056\u6226", color: "#a3243b" },
    { id: "Disease", label: "\u75AB\u75C5", color: "#7cb342" },
    { id: "Disaster", label: "\u707D\u5BB3", color: "#8d6e63" },
    { id: "Eruption", label: "\u5674\u706B", color: "#ff5722" },
    { id: "Avalanche", label: "\u96EA\u5D29", color: "#90a4ae" },
    { id: "Fault", label: "\u65AD\u5C64", color: "#6d4c41" },
    { id: "Flood", label: "\u6D2A\u6C34", color: "#1e88e5" },
    { id: "Tsunami", label: "\u6D25\u6CE2", color: "#00acc1" },
    { id: "Fire", label: "\u5927\u706B", color: "#ef6c00" },
    { id: "Custom", label: "\u305D\u306E\u4ED6", color: "#ab47bc" }
  ]);
  var ZONE_TYPE_BY_ID = Object.freeze(Object.fromEntries(ZONE_TYPES.map((t) => [t.id, t])));
  var MAX_ZONES = 300;
  function zoneColor(zone) {
    if (typeof zone?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(zone.color)) return zone.color;
    return ZONE_TYPE_BY_ID[zone?.type]?.color ?? "#ab47bc";
  }
  function zoneLabel(zone) {
    return ZONE_TYPE_BY_ID[zone?.type]?.label ?? zone?.type ?? "\u30BE\u30FC\u30F3";
  }
  function replace(map, label, after) {
    const before = map.zones ?? [];
    return makeCommand(label, [], [{ apply: (m) => {
      m.zones = after;
    }, revert: (m) => {
      m.zones = before;
    } }]);
  }
  function planAddZone(map, { name, type = "Custom", cells = [] } = {}) {
    const list = map.zones ?? [];
    if (list.length >= MAX_ZONES) throw new Error(`\u30BE\u30FC\u30F3\u306F${MAX_ZONES}\u4EF6\u307E\u3067\u3067\u3059`);
    const t = ZONE_TYPE_BY_ID[type] ?? ZONE_TYPE_BY_ID.Custom;
    const zone = { name: (name ?? "").trim() || `${t.label}${list.length + 1}`, type: t.id, cells: [...new Set(cells)], color: t.color };
    return { command: replace(map, `\u30BE\u30FC\u30F3\u300C${zone.name}\u300D\u3092\u4F5C\u6210`, [...list, zone]), index: list.length };
  }
  function planEditZone(map, index, patch) {
    const list = map.zones ?? [];
    const z = list[index];
    if (!z) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u30BE\u30FC\u30F3\u3067\u3059");
    const next = { ...z };
    if (patch.name !== void 0) {
      const n = String(patch.name).trim();
      if (!n) throw new Error("\u30BE\u30FC\u30F3\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
      next.name = n;
    }
    if (patch.type !== void 0) {
      if (!ZONE_TYPE_BY_ID[patch.type]) throw new Error("\u672A\u77E5\u306E\u30BE\u30FC\u30F3\u306E\u7A2E\u985E\u3067\u3059");
      next.type = patch.type;
      if (patch.color === void 0) next.color = ZONE_TYPE_BY_ID[patch.type].color;
    }
    if (patch.color !== void 0) next.color = String(patch.color);
    if (patch.hidden !== void 0) {
      if (patch.hidden) next.hidden = true;
      else delete next.hidden;
    }
    if (JSON.stringify(next) === JSON.stringify(z)) return null;
    return replace(map, `\u30BE\u30FC\u30F3\u300C${next.name}\u300D\u3092\u7DE8\u96C6`, list.map((x, i) => i === index ? next : x));
  }
  function planRemoveZone(map, index) {
    const list = map.zones ?? [];
    const z = list[index];
    if (!z) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u30BE\u30FC\u30F3\u3067\u3059");
    return replace(map, `\u30BE\u30FC\u30F3\u300C${z.name}\u300D\u3092\u524A\u9664`, list.filter((_, i) => i !== index));
  }
  function planPaintZone(map, index, cells, mode = "add") {
    const list = map.zones ?? [];
    const z = list[index];
    if (!z) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u30BE\u30FC\u30F3\u3067\u3059");
    const n = map.pack.cells.biome.length;
    const valid = cells.filter((c) => Number.isInteger(c) && c >= 0 && c < n);
    const cur = new Set(z.cells);
    let changed = false;
    for (const c of valid) {
      if (mode === "erase") {
        if (cur.delete(c)) changed = true;
      } else if (!cur.has(c)) {
        cur.add(c);
        changed = true;
      }
    }
    if (!changed) return null;
    const next = { ...z, cells: [...cur] };
    return replace(map, `\u30BE\u30FC\u30F3\u300C${z.name}\u300D\u3092${mode === "erase" ? "\u6D88\u3059" : "\u5857\u308B"}`, list.map((x, i) => i === index ? next : x));
  }
  function growZoneCells(map, seed, size, rnd, { landOnly = true } = {}) {
    const { biome } = map.pack.cells;
    const { c: adj } = map.geometry.pack.cells;
    const p = map.geometry.pack.p;
    const ok = (i) => landOnly ? biome[i] !== 0 : true;
    if (seed == null || seed < 0 || !ok(seed)) return [];
    const want = Math.max(1, Math.round(size));
    const inSet = /* @__PURE__ */ new Set([seed]);
    const frontier = new Set(adj[seed].filter(ok));
    const [sx, sy] = p[seed];
    while (inSet.size < want && frontier.size) {
      let best = -1, bestKey = Infinity;
      for (const j of frontier) {
        const key = Math.hypot(p[j][0] - sx, p[j][1] - sy) * (0.75 + 0.5 * rnd.next());
        if (key < bestKey) {
          bestKey = key;
          best = j;
        }
      }
      frontier.delete(best);
      if (inSet.has(best)) continue;
      inSet.add(best);
      for (const j of adj[best]) if (ok(j) && !inSet.has(j)) frontier.add(j);
    }
    return [...inSet];
  }

  // js/core/edit/ext.js
  function ensureExt(map) {
    var _a;
    if (!map.ext) map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
    (_a = map.ext).data ?? (_a.data = {});
    return map.ext;
  }

  // js/core/edit/eras.js
  function listEras(map) {
    const list = map.ext?.data?.eras ?? [];
    return list.slice().sort((a, b) => a.fromYear - b.fromYear);
  }
  function nextEraId(map) {
    const list = listEras(map);
    return list.length ? Math.max(...list.map((e) => e.id)) + 1 : 1;
  }
  function eraAt(map, year) {
    const list = listEras(map);
    let current = null;
    for (const e of list) {
      if (e.fromYear <= year) current = e;
      else break;
    }
    return current;
  }
  function planSetEra(map, { id, name, fromYear }) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u6642\u4EE3\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    const year = Math.max(1, Math.round(Number(fromYear) || 1));
    const before = listEras(map);
    const existing = id != null ? before.find((e) => e.id === id) : null;
    let after;
    if (existing) {
      after = before.map((e) => e.id === existing.id ? { ...e, name: trimmed, fromYear: year } : e);
    } else {
      after = [...before, { id: nextEraId(map), name: trimmed, fromYear: year }];
    }
    const write = (m, v) => {
      ensureExt(m).data.eras = v;
    };
    return makeCommand(existing ? `\u6642\u4EE3\u3092\u7DE8\u96C6\uFF08${trimmed}\uFF09` : `\u6642\u4EE3\u3092\u8FFD\u52A0\uFF08${trimmed}\uFF09`, [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function planRemoveEra(map, id) {
    const before = listEras(map);
    if (!before.some((e) => e.id === id)) throw new Error("\u305D\u306E\u6642\u4EE3\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const after = before.filter((e) => e.id !== id);
    const write = (m, v) => {
      const ext = ensureExt(m);
      ext.data.eras = v;
      if (!v.length) delete ext.data.eras;
    };
    return makeCommand("\u6642\u4EE3\u3092\u524A\u9664", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }

  // js/render/layers/annotations.js
  var FONT = FONT_PLACE;
  var PANEL_BG = "rgba(20,22,28,0.80)";
  var PANEL_LINE = "rgba(201,162,75,0.9)";
  var TEXT = "#f1ecdc";
  var MAX_LEGEND = 14;
  var DEFAULT_ANNOTATIONS = Object.freeze({ title: true, legend: true, scaleBar: true });
  function getScale(map) {
    const d = map?.settings?.options?.units?.distance;
    const perPixel = Number(d?.scale);
    if (!d || !Number.isFinite(perPixel) || perPixel <= 0) return null;
    return { unit: String(d.unit || "km"), perPixel };
  }
  function niceDistance(perPixel, targetPx) {
    const raw = perPixel * targetPx;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    let best = pow, bestErr = Infinity;
    for (const m of [1, 2, 5, 10]) {
      const v = m * pow, err = Math.abs(v - raw);
      if (err < bestErr) {
        bestErr = err;
        best = v;
      }
    }
    return { distance: best, px: best / perPixel };
  }
  var fmt = (v) => Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = PANEL_LINE;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = PANEL_BG;
    ctx.fillRect(x, y, w, h);
  }
  function text(ctx, s, x, y, size, { bold = false, align = "left", color = TEXT } = {}) {
    ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  function drawTitle(ctx, map, w, u) {
    const name = (map.meta?.name || "").trim();
    const t = map.worldTime;
    const era = t ? eraAt(map, t.year) : null;
    const dateText = t ? `${t.year}\u5E74${t.month}\u6708${era ? `\uFF08${era.name}\uFF09` : ""}` : "";
    if (!name && !dateText) return null;
    const pad = 8 * u, big = 17 * u, small = 12 * u, m = 12 * u;
    ctx.font = `bold ${big}px ${FONT}`;
    const wName = name ? ctx.measureText(name).width : 0;
    ctx.font = `${small}px ${FONT}`;
    const wDate = dateText ? ctx.measureText(dateText).width : 0;
    const bw = Math.max(wName, wDate) + pad * 2;
    const bh = (name ? big : 0) + (dateText ? small : 0) + pad * 2 + (name && dateText ? 3 * u : 0);
    panel(ctx, m, m, bw, bh);
    let y = m + pad;
    if (name) {
      text(ctx, name, m + pad, y + big / 2, big, { bold: true });
      y += big + 3 * u;
    }
    if (dateText) text(ctx, dateText, m + pad, y + small / 2, small, { color: "#d9c58a" });
    return { x: m, y: m, w: bw, h: bh };
  }
  function drawLegend(ctx, map, overlay, h, u) {
    if (!overlay || overlay === "none" || !ENTITY_KINDS[overlay]) return null;
    const all = listEntities(map, overlay);
    if (!all.length) return null;
    const shown = all.slice(0, MAX_LEGEND);
    const rest = all.length - shown.length;
    const title = `\u51E1\u4F8B\uFF1A${ENTITY_KINDS[overlay].label}`;
    const row = 15 * u, chip = 10 * u, pad = 8 * u, size = 11.5 * u, m = 12 * u;
    ctx.font = `bold ${12 * u}px ${FONT}`;
    let maxW = ctx.measureText(title).width;
    ctx.font = `${size}px ${FONT}`;
    for (const e of shown) maxW = Math.max(maxW, ctx.measureText(e.name).width + chip + 6 * u);
    if (rest > 0) maxW = Math.max(maxW, ctx.measureText(`\u307B\u304B ${rest} \u4EF6`).width);
    const bw = maxW + pad * 2;
    const bh = pad * 2 + 16 * u + shown.length * row + (rest > 0 ? row : 0);
    const x = m, y = h - m - bh;
    panel(ctx, x, y, bw, bh);
    text(ctx, title, x + pad, y + pad + 6 * u, 12 * u, { bold: true, color: "#e6c877" });
    let cy = y + pad + 16 * u;
    for (const e of shown) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x + pad - 1, cy + (row - chip) / 2 - 1, chip + 2, chip + 2);
      ctx.fillStyle = e.color;
      ctx.fillRect(x + pad, cy + (row - chip) / 2, chip, chip);
      text(ctx, e.name, x + pad + chip + 6 * u, cy + row / 2, size);
      cy += row;
    }
    if (rest > 0) text(ctx, `\u307B\u304B ${rest} \u4EF6`, x + pad, cy + row / 2, size, { color: "#a9a493" });
    return { x, y, w: bw, h: bh };
  }
  function drawScaleBar(ctx, map, w, h, u) {
    const sc = getScale(map);
    if (!sc) return null;
    const { distance, px } = niceDistance(sc.perPixel, w * 0.13);
    const segs = 4, segW = px / segs, barH = 5 * u, pad = 8 * u, m = 12 * u;
    const label = `${fmt(distance)} ${sc.unit}`;
    ctx.font = `${11 * u}px ${FONT}`;
    const lw = ctx.measureText(label).width;
    const bw = Math.max(px, lw / 2 + px) + pad * 2 + 4 * u;
    const bh = pad * 2 + barH + 14 * u;
    const x = w - m - bw, y = h - m - bh;
    panel(ctx, x, y, bw, bh);
    const bx = x + pad + 2 * u, by = y + pad + 12 * u;
    ctx.fillStyle = "#000";
    ctx.fillRect(bx - 1, by - 1, px + 2, barH + 2);
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i % 2 ? "#222" : "#f1ecdc";
      ctx.fillRect(bx + i * segW, by, segW, barH);
    }
    text(ctx, "0", bx, y + pad + 5 * u, 11 * u, { align: "center" });
    text(ctx, label, bx + px, y + pad + 5 * u, 11 * u, { align: "center" });
    return { x, y, w: bw, h: bh, distance, unit: sc.unit };
  }
  function drawAnnotations(ctx, map, { w, h, dpr = 1, overlay, options = DEFAULT_ANNOTATIONS }) {
    const u = Math.max(0.6, w / 1280);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const done = {};
    if (options.title) done.title = drawTitle(ctx, map, w, u);
    if (options.legend) done.legend = drawLegend(ctx, map, overlay, h, u);
    if (options.scaleBar) done.scaleBar = drawScaleBar(ctx, map, w, h, u);
    ctx.restore();
    return done;
  }

  // js/core/sim/travel.js
  var TRANSPORTS = Object.freeze([
    { id: "foot", label: "\u5F92\u6B69\uFF08\u8377\u3042\u308A\uFF09", speed: 3.5, hoursPerDay: 8, domain: "land", icon: "\u{1F6B6}" },
    { id: "march", label: "\u884C\u8ECD", speed: 4.5, hoursPerDay: 8, domain: "land", icon: "\u{1FA96}" },
    { id: "caravan", label: "\u968A\u5546\uFF08\u8377\u8ECA\uFF09", speed: 3, hoursPerDay: 8, domain: "land", icon: "\u{1F6D2}" },
    { id: "horse", label: "\u9A0E\u99AC", speed: 8, hoursPerDay: 8, domain: "land", icon: "\u{1F40E}" },
    { id: "galley", label: "\u30AC\u30EC\u30FC\u8239", speed: 5, hoursPerDay: 12, domain: "water", icon: "\u{1F6F6}" },
    { id: "sail", label: "\u5E06\u8239", speed: 8, hoursPerDay: 24, domain: "water", icon: "\u26F5" },
    { id: "air", label: "\u98DB\u884C\uFF08\u9B54\u6CD5\u30FB\u7ADC\uFF09", speed: 40, hoursPerDay: 12, domain: "air", icon: "\u{1F409}" },
    { id: "stay", label: "\u6EDE\u5728", speed: 0, hoursPerDay: 24, domain: "stay", icon: "\u26FA" }
  ]);
  var TRANSPORT_BY_ID = Object.freeze(Object.fromEntries(TRANSPORTS.map((t) => [t.id, t])));
  var LAND_COST = { 1: 1.7, 2: 1.5, 3: 1, 4: 1, 5: 1.2, 6: 1.2, 7: 1.8, 8: 1.4, 9: 1.3, 10: 1.5, 11: 3, 12: 2.2 };
  function travelScale(map) {
    const s = getScale(map);
    return s ? { ...s, usedDefault: false } : { unit: "km", perPixel: 3, usedDefault: true };
  }
  var MinHeap = class {
    constructor() {
      this.a = [];
    }
    push(k, v) {
      const a = this.a;
      a.push([k, v]);
      let i = a.length - 1;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (; ; ) {
          let l = 2 * i + 1, r = l + 1, m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
    get size() {
      return this.a.length;
    }
  };
  function routeGroups(map) {
    const g = /* @__PURE__ */ new Map();
    for (const r of map.routes ?? []) if (r && r.i != null) g.set(r.i, r.group);
    return g;
  }
  var isWater = (map, i) => map.pack.cells.biome[i] === 0;
  var isShore = (map, i) => !isWater(map, i) && map.geometry.pack.cells.c[i].some((j) => isWater(map, j));
  function canEndAt(map, cell, transport) {
    if (cell == null || cell < 0 || cell >= map.pack.cells.biome.length) return { ok: false, reason: "\u5730\u56F3\u306E\u5916\u3067\u3059" };
    if (transport.domain === "land") return isWater(map, cell) ? { ok: false, reason: `${transport.label}\u306F\u6C34\u306E\u4E0A\u3092\u9032\u3081\u307E\u305B\u3093` } : { ok: true };
    if (transport.domain === "water") return isWater(map, cell) || isShore(map, cell) ? { ok: true } : { ok: false, reason: `${transport.label}\u306F\u3001\u6C34\u304B\u3001\u6C34\u306B\u63A5\u3057\u305F\u5CB8\u306E\u30BB\u30EB\u304B\u3089\u3057\u304B\u4E57\u308A\u964D\u308A\u3067\u304D\u307E\u305B\u3093` };
    return { ok: true };
  }
  function findPath(map, from, to, transport) {
    const pa = map.geometry.pack.p;
    const ends = [canEndAt(map, from, transport), canEndAt(map, to, transport)];
    const bad = ends.find((e) => !e.ok);
    if (bad) return { ok: false, reason: bad.reason };
    if (transport.domain === "stay") return { ok: true, path: [from], distancePx: 0 };
    const px = (a, b) => Math.hypot(pa[a][0] - pa[b][0], pa[a][1] - pa[b][1]);
    if (transport.domain === "air") return { ok: true, path: from === to ? [from] : [from, to], distancePx: px(from, to) };
    if (from === to) return { ok: true, path: [from], distancePx: 0 };
    const adj = map.geometry.pack.cells.c, biome = map.pack.cells.biome;
    const groups = routeGroups(map), cr = map.cellRoutes ?? {};
    const water = transport.domain === "water";
    const allowed = (i) => water ? isWater(map, i) || i === from || i === to : !isWater(map, i);
    const edgeFactor = (i, j) => {
      const rid = cr[i]?.[j];
      const grp = rid != null ? groups.get(rid) : null;
      if (water) return grp === "searoutes" ? 0.6 : 1;
      if (grp === "roads") return 0.5;
      if (grp === "trails") return 0.7;
      return LAND_COST[biome[j]] ?? 1.3;
    };
    const n = biome.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    dist[from] = 0;
    heap.push(0, from);
    while (heap.size) {
      const [d, i] = heap.pop();
      if (d > dist[i]) continue;
      if (i === to) break;
      for (const j of adj[i]) {
        if (!allowed(j)) continue;
        const nd = d + px(i, j) * edgeFactor(i, j);
        if (nd < dist[j]) {
          dist[j] = nd;
          prev[j] = i;
          heap.push(nd, j);
        }
      }
    }
    if (!Number.isFinite(dist[to])) {
      return { ok: false, reason: water ? "2\u70B9\u306F\u540C\u3058\u6D77\u3067\u3064\u306A\u304C\u3063\u3066\u3044\u307E\u305B\u3093\uFF08\u5225\u306E\u6D77\u30FB\u6E56\u3001\u307E\u305F\u306F\u9678\u3067\u3055\u3048\u304E\u3089\u308C\u3066\u3044\u307E\u3059\uFF09" : "2\u70B9\u306F\u9678\u3067\u3064\u306A\u304C\u3063\u3066\u3044\u307E\u305B\u3093\uFF08\u6D77\u3092\u306F\u3055\u3093\u3067\u3044\u307E\u3059\uFF09" };
    }
    const path = [];
    for (let c = to; c !== -1; c = prev[c]) path.push(c);
    path.reverse();
    let distancePx = 0;
    for (let k = 1; k < path.length; k++) distancePx += px(path[k - 1], path[k]);
    return { ok: true, path, distancePx };
  }
  function legStats(map, leg, transport) {
    const sc = travelScale(map);
    const distance = (leg.distancePx ?? 0) * sc.perPixel;
    const hours = transport.domain === "stay" ? leg.stayHours ?? 24 : transport.speed > 0 ? distance / transport.speed : 0;
    return { distance, hours, days: hours / transport.hoursPerDay, unit: sc.unit };
  }
  function journeyTotals(map, journey) {
    let distance = 0, days = 0, hours = 0;
    for (const leg of journey.legs ?? []) {
      const t = TRANSPORT_BY_ID[leg.transport];
      if (!t) continue;
      const s = legStats(map, leg, t);
      distance += s.distance;
      hours += s.hours;
      days += s.days;
    }
    return { distance, hours, days, unit: travelScale(map).unit };
  }
  function formatDuration(days) {
    if (days < 1 / 24) return "\u307B\u307C\u5373\u6642";
    if (days < 1) return `${Math.round(days * 24)}\u6642\u9593`;
    const d = Math.floor(days + 1e-9), h = Math.round((days - d) * 24);
    return h > 0 && d < 30 ? `${d}\u65E5${h}\u6642\u9593` : `${Math.round(days)}\u65E5`;
  }

  // js/core/edit/journeys.js
  var MAX_JOURNEYS = 200;
  var COLORS = ["#e4572e", "#29b6a6", "#f3a712", "#7e57c2", "#43a047", "#d81b60", "#1e88e5", "#8d6e63"];
  function listJourneys(map) {
    return map.ext?.data?.journeys ?? [];
  }
  function writeJourneys(m, list) {
    const ext = ensureExt(m);
    ext.data.journeys = list;
    if (!list.length) delete ext.data.journeys;
  }
  var nextId = (map) => {
    const l = listJourneys(map);
    return l.length ? Math.max(...l.map((j) => j.id)) + 1 : 1;
  };
  function replaceCommand(map, label, after) {
    const before = listJourneys(map);
    return makeCommand(label, [], [{ apply: (m) => writeJourneys(m, after), revert: (m) => writeJourneys(m, before) }]);
  }
  function planAddJourney(map, { name, type = "\u65C5" } = {}) {
    const list = listJourneys(map);
    if (list.length >= MAX_JOURNEYS) throw new Error(`\u65C5\u306F${MAX_JOURNEYS}\u4EF6\u307E\u3067\u3067\u3059`);
    const id = nextId(map);
    const j = { id, name: (name ?? "").trim() || `\u65C5${id}`, type: (type ?? "").trim() || "\u65C5", color: COLORS[(id - 1) % COLORS.length], legs: [] };
    return { command: replaceCommand(map, `\u65C5\u300C${j.name}\u300D\u3092\u4F5C\u6210`, [...list, j]), id };
  }
  function planEditJourney(map, id, patch) {
    const list = listJourneys(map);
    const j = list.find((x) => x.id === id);
    if (!j) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u65C5\u3067\u3059");
    const next = { ...j };
    if (patch.name !== void 0) {
      const n = String(patch.name).trim();
      if (!n) throw new Error("\u65C5\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
      next.name = n;
    }
    if (patch.type !== void 0) next.type = String(patch.type).trim() || "\u65C5";
    if (patch.color !== void 0) next.color = String(patch.color);
    if (JSON.stringify(next) === JSON.stringify(j)) return null;
    return replaceCommand(map, `\u65C5\u300C${next.name}\u300D\u3092\u7DE8\u96C6`, list.map((x) => x.id === id ? next : x));
  }
  function planRemoveJourney(map, id) {
    const list = listJourneys(map);
    const j = list.find((x) => x.id === id);
    if (!j) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u65C5\u3067\u3059");
    return replaceCommand(map, `\u65C5\u300C${j.name}\u300D\u3092\u524A\u9664`, list.filter((x) => x.id !== id));
  }
  function planAddLeg(map, journeyId, { transport, from, to, stayHours }) {
    const list = listJourneys(map);
    const j = list.find((x) => x.id === journeyId);
    if (!j) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u65C5\u3067\u3059");
    const t = TRANSPORT_BY_ID[transport];
    if (!t) throw new Error("\u672A\u77E5\u306E\u79FB\u52D5\u624B\u6BB5\u3067\u3059");
    const start2 = from ?? j.legs.at(-1)?.to;
    if (start2 == null) throw new Error("\u51FA\u767A\u70B9\u304C\u3042\u308A\u307E\u305B\u3093");
    const end = t.domain === "stay" ? start2 : to;
    const r = findPath(map, start2, end, t);
    if (!r.ok) throw new Error(r.reason);
    const leg = { transport, from: start2, to: end, path: r.path, distancePx: Math.round(r.distancePx * 100) / 100 };
    if (t.domain === "stay") leg.stayHours = Math.max(1, Math.round(Number(stayHours) || 24));
    const next = { ...j, legs: [...j.legs, leg] };
    return replaceCommand(map, `\u65C5\u300C${j.name}\u300D\u306B\u533A\u9593\u3092\u8FFD\u52A0`, list.map((x) => x.id === journeyId ? next : x));
  }
  function planRemoveLeg(map, journeyId, index) {
    const list = listJourneys(map);
    const j = list.find((x) => x.id === journeyId);
    if (!j || !j.legs[index]) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u533A\u9593\u3067\u3059");
    const next = { ...j, legs: j.legs.filter((_, i) => i !== index) };
    return replaceCommand(map, `\u65C5\u300C${j.name}\u300D\u306E\u533A\u9593\u3092\u524A\u9664`, list.map((x) => x.id === journeyId ? next : x));
  }
  function planChangeLegTransport(map, journeyId, index, transport) {
    const list = listJourneys(map);
    const j = list.find((x) => x.id === journeyId);
    const leg = j?.legs[index];
    if (!leg) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u533A\u9593\u3067\u3059");
    const t = TRANSPORT_BY_ID[transport];
    if (!t) throw new Error("\u672A\u77E5\u306E\u79FB\u52D5\u624B\u6BB5\u3067\u3059");
    if (leg.transport === transport) return null;
    const end = t.domain === "stay" ? leg.from : leg.to;
    const r = findPath(map, leg.from, end, t);
    if (!r.ok) throw new Error(r.reason);
    const nl = { ...leg, transport, to: end, path: r.path, distancePx: Math.round(r.distancePx * 100) / 100 };
    if (t.domain === "stay") nl.stayHours = leg.stayHours ?? 24;
    else delete nl.stayHours;
    const next = { ...j, legs: j.legs.map((l, i) => i === index ? nl : l) };
    return replaceCommand(map, `\u65C5\u300C${j.name}\u300D\u306E\u79FB\u52D5\u624B\u6BB5\u3092\u5909\u66F4`, list.map((x) => x.id === journeyId ? next : x));
  }

  // js/render/layers/journeys-zones.js
  var edgeCache2 = /* @__PURE__ */ new WeakMap();
  function zoneEdges(map, z) {
    const hit = edgeCache2.get(z);
    if (hit && hit.geometry === map.geometry) return hit.segs;
    const n = map.pack.cells.biome.length;
    const inside = new Uint8Array(n);
    for (const i of z.cells) if (i >= 0 && i < n) inside[i] = 1;
    const segs = buildBoundarySegments(map.geometry, inside, () => true);
    edgeCache2.set(z, { geometry: map.geometry, segs });
    return segs;
  }
  function drawZones(ctx, map, vp, { selected = null } = {}) {
    const zones = map.zones ?? [];
    if (!zones.length) return;
    const { cells, vertices } = map.geometry.pack;
    const n = map.pack.cells.biome.length;
    zones.forEach((z, index) => {
      if (!z || z.hidden || !Array.isArray(z.cells) || !z.cells.length) return;
      const color = zoneColor(z);
      ctx.globalAlpha = index === selected ? 0.6 : 0.42;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const i of z.cells) if (i >= 0 && i < n) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
      ctx.globalAlpha = 1;
      const segs = zoneEdges(map, z);
      ctx.strokeStyle = color;
      ctx.lineWidth = (index === selected ? 2.6 : 1.4) / vp.k;
      ctx.lineJoin = "round";
      strokeSegments(ctx, segs);
    });
    ctx.globalAlpha = 1;
  }
  function drawJourneys(ctx, map, vp, { selected = null } = {}) {
    const journeys = listJourneys(map);
    if (!journeys.length) return;
    const p = map.geometry.pack.p;
    const k = vp.k;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const j of journeys) {
      const sel = j.id === selected;
      const w = (sel ? 3.2 : 2) / k;
      for (const leg of j.legs ?? []) {
        const pts = (leg.path ?? []).map((c) => p[c]).filter(Boolean);
        if (leg.transport === "stay") {
          if (pts[0]) {
            ctx.fillStyle = j.color;
            ctx.beginPath();
            ctx.arc(pts[0][0], pts[0][1], 4 / k, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        if (pts.length < 2) continue;
        const dash = leg.transport === "air" ? [1, 5] : leg.transport === "sail" || leg.transport === "galley" ? [6, 4] : [];
        for (const [style, width] of [["rgba(10,12,16,0.7)", w + 2 / k], [j.color, w]]) {
          ctx.strokeStyle = style;
          ctx.lineWidth = width;
          ctx.setLineDash(dash.map((d) => d / k));
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let t = 1; t < pts.length; t++) ctx.lineTo(pts[t][0], pts[t][1]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const first = j.legs?.[0], last = j.legs?.at(-1);
      const a = first && p[first.from], z = last && p[last.to];
      if (a) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = j.color;
        ctx.lineWidth = 2 / k;
        ctx.beginPath();
        ctx.arc(a[0], a[1], 4.2 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (z) {
        ctx.fillStyle = j.color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.6 / k;
        ctx.beginPath();
        ctx.arc(z[0], z[1], 4.6 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // js/render/scene.js
  var DEFAULT_RENDER_OPTIONS = Object.freeze({
    terrain: "biome",
    // "biome" | "height" | "both" | "none"（旧オプション base も受け付ける）
    fills: null,
    // 色分けの種類の配列（描く順）。null のときは旧オプション overlay（1種類）を使う
    borders: true,
    // 国家の色分けを消していても国境だけ引く
    coast: true,
    rivers: true,
    routes: { roads: true, trails: true, searoutes: true },
    burgs: true,
    zones: false,
    // ゾーン（侵攻・疫病など）。画面では既定で表示する（options.js）
    journeys: false,
    // 旅の線。同上
    labels: { states: true, burgs: "auto" },
    background: "#2f4a72"
  });
  function drawScene(ctx, map, vp, options = {}, dpr = 1) {
    const o = { ...DEFAULT_RENDER_OPTIONS, ...options };
    if (!map?.geometry) throw new Error("\u5F62\u72B6\u304C\u672A\u69CB\u7BC9\u3067\u3059\uFF08buildGeometry \u3092\u5148\u306B\u547C\u3093\u3067\u304F\u3060\u3055\u3044\uFF09");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, vp.screenWidth * dpr, vp.screenHeight * dpr);
    ctx.save();
    vp.apply(ctx, dpr);
    const terrain = options.terrain ?? (options.base === "height" ? "height" : "biome");
    const fills = Array.isArray(options.fills) ? options.fills : options.overlay === void 0 ? ["state"] : options.overlay === "none" ? [] : [options.overlay];
    drawTerrain(ctx, map, vp, terrain);
    const alpha = fills.length > 1 ? 0.4 : 0.55;
    for (const kind of fills) {
      drawPolitics(ctx, map, vp, kind, { alpha, lines: kind === "state" || kind === "province" || fills.length === 1 });
    }
    if (o.borders && !fills.includes("state")) drawPolitics(ctx, map, vp, "state", { fill: false });
    if (o.coast) drawCoast(ctx, map, vp);
    if (o.rivers) drawRivers(ctx, map, vp);
    if (o.routes) drawRoutes(ctx, map, vp, o.routes);
    if (o.zones) drawZones(ctx, map, vp, { selected: o.zoneSelected ?? null });
    if (o.tradeLines) drawTradeLines(ctx, vp, o.tradeLines);
    if (o.journeys) drawJourneys(ctx, map, vp, { selected: o.journeySelected ?? null });
    if (o.burgs) drawBurgs(ctx, map, vp, { auto: o.labels?.burgs === "auto" });
    if (o.labels) drawLabels(ctx, map, vp, o.labels);
    ctx.restore();
  }

  // js/render/renderer.js
  var SETTLE_MS = 120;
  var OVERSCAN = 0.4;
  var MAX_TILE_PIXELS = 14e6;
  function createRenderer({ canvas, viewport, getMap, getOptions }) {
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    let rafId = 0;
    let settleTimer = 0;
    let interacting = false;
    let needFull = true;
    let tile = null;
    const listeners = /* @__PURE__ */ new Set();
    const notify = () => listeners.forEach((fn) => fn());
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (canvas.width === pw && canvas.height === ph && viewport.screenWidth === w && viewport.screenHeight === h) return;
      canvas.width = pw;
      canvas.height = ph;
      viewport.resize(w, h);
      tile = null;
      interacting = false;
      needFull = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      frame();
    }
    function clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#2f4a72";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function drawTile() {
      const map = getMap();
      if (!map?.geometry) {
        tile = null;
        clear();
        return;
      }
      const mx = Math.round(viewport.screenWidth * OVERSCAN), my = Math.round(viewport.screenHeight * OVERSCAN);
      const cssW = viewport.screenWidth + mx * 2, cssH = viewport.screenHeight + my * 2;
      const tdpr = Math.min(dpr, Math.sqrt(MAX_TILE_PIXELS / (cssW * cssH)));
      const pw = Math.max(1, Math.round(cssW * tdpr)), ph = Math.max(1, Math.round(cssH * tdpr));
      const cv = tile?.canvas ?? document.createElement("canvas");
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
      const tvp = createViewport(viewport.mapWidth, viewport.mapHeight);
      tvp.resize(cssW, cssH);
      tvp.k = viewport.k;
      tvp.fitK = viewport.fitK;
      tvp.minK = viewport.minK;
      tvp.maxK = viewport.maxK;
      tvp.x = viewport.x + mx;
      tvp.y = viewport.y + my;
      drawScene(cv.getContext("2d"), map, tvp, getOptions(), tdpr);
      tile = { canvas: cv, x: viewport.x, y: viewport.y, k: viewport.k, mx, my, cssW, cssH };
    }
    function blit() {
      clear();
      if (!tile) return;
      const s = viewport.k / tile.k;
      const dx = viewport.x - (tile.x + tile.mx) * s;
      const dy = viewport.y - (tile.y + tile.my) * s;
      ctx.drawImage(tile.canvas, dx * dpr, dy * dpr, tile.cssW * s * dpr, tile.cssH * s * dpr);
    }
    function tileCovers() {
      if (!tile) return false;
      const s = viewport.k / tile.k;
      const dx = viewport.x - (tile.x + tile.mx) * s, dy = viewport.y - (tile.y + tile.my) * s;
      return dx <= 0 && dy <= 0 && dx + tile.cssW * s >= viewport.screenWidth && dy + tile.cssH * s >= viewport.screenHeight;
    }
    function frame() {
      rafId = 0;
      if (needFull || !tile) {
        drawTile();
        needFull = false;
      }
      blit();
      notify();
    }
    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(frame);
    };
    function requestRender() {
      needFull = true;
      interacting = false;
      clearTimeout(settleTimer);
      schedule();
    }
    function interact() {
      interacting = true;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        interacting = false;
        const k = tile ? viewport.k / tile.k : 0;
        if (!tileCovers() || k > 1.25 || k < 0.8) {
          needFull = true;
          schedule();
        }
      }, SETTLE_MS);
      schedule();
    }
    return {
      resize,
      requestRender,
      interact,
      /** 描画のたびに呼ばれるコールバック（ズーム表示の更新用）。解除関数を返す */
      onFrame(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      dispose() {
        cancelAnimationFrame(rafId);
        clearTimeout(settleTimer);
        listeners.clear();
      }
    };
  }

  // js/app/layers.js
  var FILL_KINDS = Object.freeze(["culture", "religion", "province", "state"]);
  var FILL_KEY = Object.freeze({ state: "states", culture: "cultures", religion: "religions", province: "provinces" });
  var FILL_LABEL = Object.freeze({ state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" });
  var LAYERS = Object.freeze([
    { key: "biomes", label: "\u5730\u5F62\u30FB\u690D\u751F", group: "base", on: true, title: "\u30D0\u30A4\u30AA\u30FC\u30E0\uFF08\u68EE\u30FB\u7802\u6F20\u306A\u3069\uFF09\u3067\u9678\u3092\u5857\u308B" },
    { key: "heights", label: "\u6A19\u9AD8", group: "base", on: false, title: "\u6A19\u9AD8\u3067\u9678\u3092\u5857\u308B\uFF08\u5730\u5F62\u30FB\u690D\u751F\u3068\u91CD\u306D\u308B\u3068\u534A\u900F\u660E\u3067\u91CD\u306A\u308B\uFF09" },
    { key: "states", label: "\u56FD\u5BB6", group: "fill", on: true, title: "\u56FD\u5BB6\u306E\u8272\u5206\u3051" },
    { key: "cultures", label: "\u6587\u5316", group: "fill", on: false, title: "\u6587\u5316\u306E\u8272\u5206\u3051" },
    { key: "religions", label: "\u5B97\u6559", group: "fill", on: false, title: "\u5B97\u6559\u306E\u8272\u5206\u3051" },
    { key: "provinces", label: "\u5C5E\u5DDE", group: "fill", on: false, title: "\u5C5E\u5DDE\u306E\u8272\u5206\u3051" },
    { key: "borders", label: "\u56FD\u5883", group: "line", on: true, title: "\u56FD\u5BB6\u306E\u5883\u754C\u7DDA\uFF08\u56FD\u5BB6\u306E\u8272\u5206\u3051\u3092\u6D88\u3057\u3066\u3044\u3066\u3082\u5F15\u304F\uFF09" },
    { key: "coast", label: "\u6D77\u5CB8\u7DDA", group: "line", on: true },
    { key: "rivers", label: "\u6CB3\u5DDD", group: "line", on: true },
    { key: "routes", label: "\u9053\u8DEF", group: "line", on: true },
    { key: "burgs", label: "\u90FD\u5E02", group: "mark", on: true, title: "\u90FD\u5E02\u306E\u8A18\u53F7" },
    { key: "zones", label: "\u30BE\u30FC\u30F3", group: "mark", on: true },
    { key: "journeys", label: "\u65C5\u306E\u7DDA", group: "mark", on: true },
    { key: "labels", label: "\u540D\u524D", group: "mark", on: true, title: "\u56FD\u30FB\u5C5E\u5DDE\u30FB\u90FD\u5E02\u306E\u540D\u524D" }
  ]);
  var DEFAULT_ON = new Map(LAYERS.map((l) => [l.key, l.on]));
  var isLayerOn = (view, key) => view?.[key] ?? DEFAULT_ON.get(key) ?? false;
  var activeFills = (view) => FILL_KINDS.filter((k) => isLayerOn(view, FILL_KEY[k]));
  function terrainMode(view) {
    const b = isLayerOn(view, "biomes"), h = isLayerOn(view, "heights");
    return b && h ? "both" : b ? "biome" : h ? "height" : "none";
  }
  function legendKindOf(view) {
    const on = activeFills(view);
    if (!on.length) return null;
    return on.includes(view?.legendKind) ? view.legendKind : on[on.length - 1];
  }
  var ALL_FILLS_OFF = { states: false, cultures: false, religions: false, provinces: false };
  var fillsOnly = (kind) => ({ ...ALL_FILLS_OFF, [FILL_KEY[kind]]: true });
  var exclusiveFillPatch = (kind) => kind && FILL_KEY[kind] ? { ...fillsOnly(kind), legendKind: kind } : { ...ALL_FILLS_OFF };
  var snapshotFills = (view) => ({ ...Object.fromEntries(FILL_KINDS.map((k) => [FILL_KEY[k], isLayerOn(view, FILL_KEY[k])])), legendKind: view?.legendKind });

  // js/render/options.js
  function viewToRenderOptions(view) {
    return {
      terrain: terrainMode(view),
      // "biome" | "height" | "both" | "none"
      fills: activeFills(view),
      // 色分けの種類（描く順）
      legendKind: legendKindOf(view),
      // 凡例（書き出し画像）に出す種類
      borders: isLayerOn(view, "borders"),
      coast: isLayerOn(view, "coast"),
      rivers: isLayerOn(view, "rivers"),
      routes: isLayerOn(view, "routes") ? { roads: true, trails: true, searoutes: true } : false,
      burgs: isLayerOn(view, "burgs"),
      tradeLines: view.tradeLines ?? null,
      zones: isLayerOn(view, "zones"),
      zoneSelected: view.zoneSelected ?? null,
      journeys: isLayerOn(view, "journeys"),
      journeySelected: view.journeySelected ?? null,
      labels: isLayerOn(view, "labels") ? { states: true, burgs: view.burgLabels === "none" ? false : view.burgLabels === "capitals" ? "capitals" : view.burgLabels === "auto" ? "auto" : true } : false
    };
  }

  // js/core/model.js
  var FORMAT_VERSION = "1.151.1";
  var CELL_ARRAYS = Object.freeze({
    biome: "biome",
    // L16: バイオームID (0-12)
    burg: "burg",
    // L17: 都市ID (0=なし)
    culture: "culture",
    // L19: 文化ID
    pop: "pop",
    // L21: 人口（小数）
    river: "river",
    // L22: 河川ID (0=なし)
    state: "state",
    // L25: 国家ID
    religion: "religion",
    // L26: 宗教ID
    province: "province"
    // L27: 属州ID
  });
  function createEmptyMap() {
    return {
      meta: {
        version: FORMAT_VERSION,
        description: "",
        exportedAt: "",
        seed: "",
        width: 0,
        height: 0,
        mapId: "",
        // ヘッダー行の7番目以降の項目（ALTERHISTORY の目印など）。書き戻し時にそのまま戻す
        extraHeader: [],
        // 読み込んだファイルの行数。書き出し時に「元に無かった行を勝手に足さない」ための基準。
        // 新規作成の地図は、現行の全行を持つ 53 行構成として扱う。
        lineCount: 53,
        name: "",
        source: "alterhistory"
        // "azgaar" | "alterhistory"
      },
      // settings.format: "json"(v1.152.0以降) | "legacy"(パイプ区切り)。raw は元の行の原文。
      // options は新旧どちらから読んでも同じ形（公式の options.map と同じ構造）に正規化する。
      settings: { format: "json", raw: "", options: null },
      coordinates: null,
      biomesData: [],
      notes: [],
      grid: {
        spacing: 0,
        cellsX: 0,
        cellsY: 0,
        boundary: [],
        points: [],
        features: [],
        cellsDesired: void 0,
        // 旧版のみ保存される項目。無い場合は undefined のまま扱う
        // grid側セル配列
        h: [],
        prec: [],
        f: [],
        t: [],
        temp: []
      },
      pack: {
        features: [],
        cultures: [],
        states: [],
        burgs: [],
        religions: [],
        provinces: [],
        rivers: [],
        // pack.cells：確定した配列のみ
        cells: {
          biome: [],
          burg: [],
          culture: [],
          pop: [],
          river: [],
          state: [],
          religion: [],
          province: []
        }
      },
      namesbase: [],
      routes: [],
      cellRoutes: {},
      zones: [],
      ice: [],
      goods: [],
      markets: [],
      deals: [],
      // 交易（L43）
      markers: [],
      // マーカー（L35）。文章（ノート）の付与先
      relief: [],
      // 地形アイコン（L49）
      measurers: [],
      // 計測線（L46）
      // 今回のアプリで解釈しない行。位置をキーに原文を保持し、書き出し時にそのまま戻す
      // （情報を失わないための仕組み）。詳細は docs/MAP_FORMAT_SPEC.md
      passthrough: {},
      // SVG等、読み込みをスキップした巨大な行の原文
      rawLines: {},
      // ALTERHISTORY 固有の拡張データ（io/native-format.js）。Azgaar 形式で読んだ場合は空の既定値
      ext: null,
      // セル形状の手動編集（頂点の移動）。L51 の読み取り専用コピー。書き出しでは passthrough の原文を戻す
      graphOverride: {},
      // 世界の時刻（年月）。core/sim/time.js が扱う。ファイルには保存せず、
      // ALTERHISTORY拡張データ(ext.data.worldTime)に保存する（io層で読み書き）。
      worldTime: { year: 1, month: 1 },
      // 実行時のみ使う「版数」。編集のたびに、影響する層の数字を進める。
      // 描画の層キャッシュや凡例が「作り直す必要があるか」を判断するために使う（ファイルには保存しない）。
      //   terrain: 地形（バイオーム・水陸）/ politics: 国家・文化・宗教・属州 / places: 都市・マーカー等
      rev: { terrain: 0, politics: 0, places: 0 },
      // 実行時のみ使う派生データ（セル形状）。ファイルには保存しない。
      // { gridVoronoi, pack:{p,g,h,cells,vertices} } — core/derive.js の buildGeometry で作る
      geometry: null
    };
  }

  // js/io/azgaar-reader.js
  var LINE = Object.freeze({
    PARAMS: 0,
    SETTINGS: 1,
    COORDINATES: 2,
    BIOMES: 3,
    NOTES: 4,
    SVG: 5,
    GRID: 6,
    GRID_H: 7,
    GRID_PREC: 8,
    GRID_F: 9,
    GRID_T: 10,
    GRID_TEMP: 11,
    FEATURES: 12,
    CULTURES: 13,
    STATES: 14,
    BURGS: 15,
    CELL_BIOME: 16,
    CELL_BURG: 17,
    CELL_CONF: 18,
    CELL_CULTURE: 19,
    CELL_FL: 20,
    CELL_POP: 21,
    CELL_RIVER: 22,
    CELL_ROAD_DEPRECATED: 23,
    CELL_SUITABILITY: 24,
    CELL_STATE: 25,
    CELL_RELIGION: 26,
    CELL_PROVINCE: 27,
    CELL_CROSSROAD_DEPRECATED: 28,
    RELIGIONS: 29,
    PROVINCES: 30,
    NAMESBASE: 31,
    RIVERS: 32,
    RULERS_DEPRECATED: 33,
    FONTS: 34,
    MARKERS: 35,
    CELL_ROUTES: 36,
    ROUTES: 37,
    ZONES: 38,
    ICE: 39,
    CELL_GOOD: 40,
    GOODS: 41,
    MARKETS: 42,
    DEALS: 43,
    CELL_MARKET: 44,
    CUSTOM_GOOD_ICONS: 45,
    MEASURERS: 46,
    LABELS: 47,
    STYLE: 48,
    RELIEF: 49,
    LAYERS: 50,
    GRAPH_OVERRIDE: 51,
    JOURNEYS: 52
  });
  var REQUIRED_MIN_LINES = LINE.RIVERS + 1;
  var CRLF = "\r\n";
  var PASSTHROUGH_LINES = [
    LINE.CELL_CONF,
    LINE.CELL_FL,
    LINE.CELL_ROAD_DEPRECATED,
    LINE.CELL_SUITABILITY,
    LINE.CELL_CROSSROAD_DEPRECATED,
    LINE.RULERS_DEPRECATED,
    LINE.FONTS,
    LINE.CELL_GOOD,
    LINE.CELL_MARKET,
    LINE.CUSTOM_GOOD_ICONS,
    LINE.LABELS,
    LINE.STYLE,
    LINE.LAYERS,
    LINE.GRAPH_OVERRIDE,
    LINE.JOURNEYS
  ];
  var KNOWN_LINE_COUNT = LINE.JOURNEYS + 1;
  var MapParseError = class extends Error {
    constructor(message, detail) {
      super(message);
      this.name = "MapParseError";
      this.detail = detail;
    }
  };
  function parseAzgaarText(text2) {
    if (typeof text2 !== "string" || text2.length === 0) {
      throw new MapParseError("\u30D5\u30A1\u30A4\u30EB\u304C\u7A7A\u3067\u3059");
    }
    const lines = text2.split(CRLF);
    if (lines.length < REQUIRED_MIN_LINES) {
      const hint = lines.length === 1 && text2.includes("\n") ? "\uFF08\u6539\u884C\u304C LF \u306E\u307F\u3067\u3059\u3002\u30A8\u30C7\u30A3\u30BF\u7B49\u3067\u4FDD\u5B58\u3057\u76F4\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u304B\u3082\u3057\u308C\u307E\u305B\u3093\uFF09" : "";
      throw new MapParseError(
        `Azgaar\u5F62\u5F0F\u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093: \u884C\u6570\u304C${lines.length}\u884C\u3057\u304B\u3042\u308A\u307E\u305B\u3093${hint}`,
        { lines: lines.length }
      );
    }
    const warnings = [];
    const json2 = (line, fallback, label) => tryJson(line, fallback, label, warnings);
    const map = createEmptyMap();
    map.meta.source = "azgaar";
    map.meta.lineCount = lines.length;
    parseParams(lines[LINE.PARAMS], map);
    parseSettings(lines, map, warnings);
    const biomeLine = lines[LINE.BIOMES] ?? "";
    if (!biomeLine.trimStart().startsWith("[") && biomeLine.includes("|")) {
      const [colors, habitability, names] = biomeLine.split("|").map((part) => part.split(","));
      map.biomesData = colors.map((color, i) => ({
        i,
        name: names?.[i] ?? `\u30D0\u30A4\u30AA\u30FC\u30E0${i}`,
        color,
        habitability: Number(habitability?.[i]) || 0,
        iconsDensity: 0,
        icons: []
      }));
      map.meta.biomesLegacy = true;
    } else {
      map.biomesData = json2(biomeLine, [], "\u30D0\u30A4\u30AA\u30FC\u30E0");
    }
    map.notes = json2(lines[LINE.NOTES], [], "\u30CE\u30FC\u30C8");
    map.rawLines[LINE.SVG] = lines[LINE.SVG] ?? "";
    parseGrid(lines, map, json2);
    const p = map.pack;
    p.features = json2(lines[LINE.FEATURES], [], "\u5730\u5F62\u30D5\u30A3\u30FC\u30C1\u30E3");
    p.cultures = json2(lines[LINE.CULTURES], [], "\u6587\u5316");
    p.states = json2(lines[LINE.STATES], [], "\u56FD\u5BB6");
    p.burgs = json2(lines[LINE.BURGS], [], "\u90FD\u5E02");
    p.religions = json2(lines[LINE.RELIGIONS], [], "\u5B97\u6559");
    p.provinces = json2(lines[LINE.PROVINCES], [], "\u5C5E\u5DDE");
    p.rivers = json2(lines[LINE.RIVERS], [], "\u6CB3\u5DDD");
    const c = p.cells;
    c.biome = parseNumbers(lines[LINE.CELL_BIOME]);
    c.burg = parseNumbers(lines[LINE.CELL_BURG]);
    c.culture = parseNumbers(lines[LINE.CELL_CULTURE]);
    c.pop = parseNumbers(lines[LINE.CELL_POP], true);
    c.river = parseNumbers(lines[LINE.CELL_RIVER]);
    c.state = parseNumbers(lines[LINE.CELL_STATE]);
    const n = c.biome.length;
    c.religion = lines[LINE.CELL_RELIGION] ? parseNumbers(lines[LINE.CELL_RELIGION]) : new Array(n).fill(0);
    c.province = lines[LINE.CELL_PROVINCE] ? parseNumbers(lines[LINE.CELL_PROVINCE]) : new Array(n).fill(0);
    map.namesbase = parseNamesbase(lines[LINE.NAMESBASE]);
    map.markers = json2(lines[LINE.MARKERS], [], "\u30DE\u30FC\u30AB\u30FC");
    map.cellRoutes = json2(lines[LINE.CELL_ROUTES], {}, "\u30BB\u30EB\u5225\u30EB\u30FC\u30C8");
    map.routes = json2(lines[LINE.ROUTES], [], "\u30EB\u30FC\u30C8");
    map.zones = json2(lines[LINE.ZONES], [], "\u30BE\u30FC\u30F3");
    map.ice = json2(lines[LINE.ICE], [], "\u6C37");
    map.goods = json2(lines[LINE.GOODS], [], "\u4EA4\u6613\u54C1");
    map.markets = json2(lines[LINE.MARKETS], [], "\u5E02\u5834");
    map.deals = json2(lines[LINE.DEALS], [], "\u4EA4\u6613");
    map.measurers = json2(lines[LINE.MEASURERS], [], "\u8A08\u6E2C\u7DDA");
    map.relief = json2(lines[LINE.RELIEF], [], "\u5730\u5F62\u30A2\u30A4\u30B3\u30F3");
    map.graphOverride = json2(lines[LINE.GRAPH_OVERRIDE], {}, "\u5F62\u72B6\u306E\u624B\u52D5\u7DE8\u96C6");
    for (const i of PASSTHROUGH_LINES) if (i < lines.length) map.passthrough[i] = lines[i];
    for (let i = KNOWN_LINE_COUNT; i < lines.length; i++) map.passthrough[i] = lines[i];
    return { map, warnings };
  }
  function parseAzgaarBytes(bytes) {
    return parseAzgaarText(new TextDecoder("utf-8").decode(bytes));
  }
  function parseParams(line, map) {
    const f = (line ?? "").split("|");
    map.meta.version = f[0] || "";
    map.meta.description = f[1] || "";
    map.meta.exportedAt = f[2] || "";
    map.meta.seed = f[3] || "";
    map.meta.width = toInt(f[4]);
    map.meta.height = toInt(f[5]);
    map.meta.mapId = f[6] || "";
    map.meta.extraHeader = f.slice(7);
  }
  function compareVersions(a, b) {
    const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  }
  function isLegacySettings(version, line) {
    return compareVersions(version, "1.152.0") < 0 && !(line ?? "").trimStart().startsWith("{");
  }
  function parseSettings(lines, map, warnings) {
    const line = lines[LINE.SETTINGS] ?? "";
    map.settings.raw = line;
    if (!isLegacySettings(map.meta.version, line)) {
      map.settings.format = "json";
      const o = tryJson(line, null, "\u8A2D\u5B9A", warnings);
      map.settings.options = o;
      if (o) {
        map.meta.name = o.lore?.name ?? "";
        map.coordinates = o.geography?.coordinates ?? null;
      }
      return;
    }
    map.settings.format = "legacy";
    const f = line.split("|");
    const num2 = (v, d) => v !== void 0 && v !== "" && !Number.isNaN(+v) ? +v : d;
    const legacyOptions = tryJson(f[19], null, "\u65E7\u30AA\u30D7\u30B7\u30E7\u30F3", warnings, true);
    const opt = Array.isArray(legacyOptions) ? {} : legacyOptions ?? {};
    map.coordinates = tryJson(lines[LINE.COORDINATES], null, "\u5EA7\u6A19", warnings);
    map.meta.name = f[20] || "";
    map.settings.options = {
      seed: map.meta.seed,
      graph: { width: map.meta.width || 1280, height: map.meta.height || 800 },
      geography: {
        mapSize: num2(f[14], 100),
        latitude: num2(f[15], 50),
        longitude: num2(f[25], 50),
        coordinates: map.coordinates
      },
      climate: {
        temperature: { equator: num2(f[16], 27), northPole: num2(f[17], -30), southPole: num2(f[17], -15) },
        precipitation: num2(f[18], 100),
        winds: Array.isArray(legacyOptions) ? legacyOptions : opt.winds ?? [225, 45, 225, 315, 135, 315]
      },
      lore: { name: map.meta.name },
      units: {
        distance: { unit: f[0] || "km", scale: num2(f[1], 3) },
        area: { unit: f[2] || "square" },
        height: { unit: f[3] || "m", exponent: num2(f[4], 2) },
        temperature: { unit: f[5] || "\xB0C" },
        population: { scale: num2(f[12], 1e3), urbanization: { rate: num2(f[13], 1), density: num2(f[24], 10) } }
      },
      labels: opt.labels,
      military: opt.military,
      transports: opt.transports,
      coastline: opt.coastline,
      burgs: opt.burgs
    };
  }
  function parseGrid(lines, map, json2) {
    const g = json2(lines[LINE.GRID], {}, "\u30B0\u30EA\u30C3\u30C9");
    map.grid.spacing = g.spacing ?? 0;
    map.grid.cellsX = g.cellsX ?? 0;
    map.grid.cellsY = g.cellsY ?? 0;
    map.grid.boundary = g.boundary ?? [];
    map.grid.points = g.points ?? [];
    map.grid.features = g.features ?? [];
    map.grid.cellsDesired = g.cellsDesired;
    map.grid.h = parseNumbers(lines[LINE.GRID_H]);
    map.grid.prec = parseNumbers(lines[LINE.GRID_PREC]);
    map.grid.f = parseNumbers(lines[LINE.GRID_F]);
    map.grid.t = parseNumbers(lines[LINE.GRID_T]);
    map.grid.temp = parseNumbers(lines[LINE.GRID_TEMP]);
  }
  function parseNamesbase(line) {
    if (!line) return [];
    return line.split("/").map((seg) => {
      const f = seg.split("|");
      return {
        name: f[0] ?? "",
        min: toInt(f[1]),
        max: toInt(f[2]),
        d: f[3] ?? "",
        m: Number(f[4]) || 0,
        words: (f[5] ?? "").split(",").filter((w) => w.length > 0)
      };
    });
  }
  function parseNumbers(line, allowFloat = false) {
    const s = (line ?? "").trim();
    if (!s) return [];
    const parts = s.split(",");
    const out = new Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const v = Number(parts[i]);
      out[i] = Number.isNaN(v) ? 0 : allowFloat ? v : Math.trunc(v);
    }
    return out;
  }
  function tryJson(line, fallback, label, warnings, silent = false) {
    if (line === void 0 || line === "") return fallback;
    try {
      return JSON.parse(line);
    } catch (e) {
      if (!silent) warnings.push(`${label}\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${e.message}`);
      return fallback;
    }
  }
  function toInt(v) {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // js/core/geometry.js
  var SEA_LEVEL = 20;
  var rn = (v, d = 0) => {
    const m = 10 ** d;
    return Math.round(v * m) / m;
  };
  var nextHalfedge = (e) => e % 3 === 2 ? e - 2 : e + 1;
  var triangleOfEdge = (e) => Math.floor(e / 3);
  function circumcenter(a, b, c) {
    const [ax, ay] = a, [bx, by] = b, [cx, cy] = c;
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    return [
      1 / D * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
      1 / D * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
    ];
  }
  function buildVoronoi(points, boundary, Delaunator) {
    const pointsN = points.length;
    const allPoints = points.concat(boundary);
    const { triangles, halfedges } = Delaunator.from(allPoints);
    const cells = { v: [], c: [], b: [] };
    const vertices = { p: [], v: [], c: [] };
    const edgesAroundPoint = (start2) => {
      const result = [];
      let incoming = start2;
      do {
        result.push(incoming);
        const outgoing = nextHalfedge(incoming);
        incoming = halfedges[outgoing];
      } while (incoming !== -1 && incoming !== start2 && result.length < 20);
      return result;
    };
    const pointsOfTriangle = (t) => [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    for (let e = 0; e < triangles.length; e++) {
      const p = triangles[nextHalfedge(e)];
      if (p < pointsN && !cells.c[p]) {
        const edges = edgesAroundPoint(e);
        cells.v[p] = edges.map(triangleOfEdge);
        cells.c[p] = edges.map((x) => triangles[x]).filter((c) => c < pointsN);
        cells.b[p] = edges.length > cells.c[p].length ? 1 : 0;
      }
      const t = triangleOfEdge(e);
      if (!vertices.p[t]) {
        const pts = pointsOfTriangle(t);
        vertices.p[t] = circumcenter(allPoints[pts[0]], allPoints[pts[1]], allPoints[pts[2]]);
        vertices.v[t] = [0, 1, 2].map((k) => triangleOfEdge(halfedges[3 * t + k]));
        vertices.c[t] = pts;
      }
    }
    return { cells, vertices };
  }
  function rebuildPack(grid, gridVoronoi, Delaunator) {
    const { points, boundary, spacing, features, h, f, t } = grid;
    const { c: gridC, b: gridB } = gridVoronoi.cells;
    const spacing2 = spacing ** 2;
    const p = [], g = [], height = [];
    const add = (gridId, x, y, hh) => {
      p.push([x, y]);
      g.push(gridId);
      height.push(hh);
    };
    for (let i = 0; i < points.length; i++) {
      const hi = h[i];
      const ti = t[i];
      if (hi < SEA_LEVEL && ti !== -1 && ti !== -2) continue;
      if (ti === -2 && (i % 4 === 0 || features[f[i]]?.type === "lake")) continue;
      const [x, y] = points[i];
      add(i, x, y, hi);
      if (ti === 1 || ti === -1) {
        if (gridB[i]) continue;
        for (const e of gridC[i]) {
          if (i > e) continue;
          if (t[e] !== ti) continue;
          const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
          if (dist2 < spacing2) continue;
          add(i, rn((x + points[e][0]) / 2, 1), rn((y + points[e][1]) / 2, 1), hi);
        }
      }
    }
    const { cells, vertices } = buildVoronoi(p, boundary, Delaunator);
    return { p, g, h: height, cells, vertices };
  }
  function applyVertexOverrides(vertices, state) {
    let applied = 0, skipped = 0;
    for (const [id, pair] of Object.entries(state?.pack?.vertices?.p ?? {})) {
      const [from, to] = Array.isArray(pair) ? pair : [];
      const current = vertices.p[Number(id)];
      const valid = current && Array.isArray(from) && Array.isArray(to) && to.length === 2 && to.every(Number.isFinite);
      if (!valid || String(current) !== String(from)) {
        skipped++;
        continue;
      }
      vertices.p[Number(id)] = to;
      applied++;
    }
    const has = (o) => !!o && Object.keys(o).length > 0;
    const unsupported = has(state?.grid) || has(state?.pack?.cells) || Object.keys(state?.pack?.vertices ?? {}).some((k) => k !== "p");
    return { applied, skipped, unsupported };
  }
  function cellAreas(geometry) {
    if (geometry.cellArea) return geometry.cellArea;
    const { cells, vertices } = geometry.pack;
    const out = new Uint16Array(cells.v.length);
    for (let i = 0; i < out.length; i++) {
      const pts = cells.v[i].map((v) => vertices.p[v]);
      let a = 0;
      for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) a += (pts[j][0] + pts[k][0]) * (pts[j][1] - pts[k][1]);
      out[i] = Math.min(Math.round(Math.abs(a / 2)), 65535);
    }
    geometry.cellArea = out;
    return out;
  }

  // js/core/derive.js
  var GeometryError = class extends Error {
    constructor(message, detail) {
      super(message);
      this.name = "GeometryError";
      this.detail = detail;
    }
  };
  function buildGeometry(map, Delaunator) {
    const g = map.grid;
    if (!g.points.length || !g.boundary.length) {
      throw new GeometryError("grid\u306B\u70B9\u307E\u305F\u306F\u5883\u754C\u304C\u7121\u3044\u305F\u3081\u3001\u30BB\u30EB\u5F62\u72B6\u3092\u4F5C\u308C\u307E\u305B\u3093");
    }
    if (g.h.length !== g.points.length || g.t.length !== g.points.length || g.f.length !== g.points.length) {
      throw new GeometryError("grid\u306E\u9AD8\u3055\u30FB\u6D77\u5CB8\u8DDD\u96E2\u30FB\u5730\u5F62ID\u306E\u9577\u3055\u304C\u70B9\u306E\u6570\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093", {
        points: g.points.length,
        h: g.h.length,
        t: g.t.length,
        f: g.f.length
      });
    }
    const gridVoronoi = buildVoronoi(g.points, g.boundary, Delaunator);
    const pack = rebuildPack(
      { points: g.points, boundary: g.boundary, spacing: g.spacing, features: g.features, h: g.h, f: g.f, t: g.t },
      gridVoronoi,
      Delaunator
    );
    const saved = map.pack.cells.state.length || map.pack.cells.biome.length;
    if (saved && pack.p.length !== saved) {
      throw new GeometryError(
        `\u518D\u69CB\u7BC9\u3057\u305F\u30BB\u30EB\u6570(${pack.p.length})\u304C\u4FDD\u5B58\u6E08\u307F\u306E\u30BB\u30EB\u6570(${saved})\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u672A\u5BFE\u5FDC\u306E\u751F\u6210\u65B9\u5F0F\u304B\u3001\u7834\u640D\u3057\u3066\u3044\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`,
        { rebuilt: pack.p.length, saved }
      );
    }
    const overrideReport = applyVertexOverrides(pack.vertices, map.graphOverride);
    map.geometry = { gridVoronoi, pack, overrideReport };
    return map.geometry;
  }

  // js/io/native-format.js
  var NATIVE_MARKER = "ALTERHISTORY/1";
  var APP_NAME = "ALTERHISTORY";
  var EXT_FORMAT = 1;
  var MIN_EXT_INDEX = 53;
  function createExtension() {
    return {
      app: APP_NAME,
      format: EXT_FORMAT,
      savedAt: "",
      // Azgaar 形式部分の行数（拡張行と、それを置くための空行パディングを含まない）。
      // 読み込み時に元の行数を復元し、再保存で行が増えないようにする。
      lineCount: 0,
      // ALTERHISTORY 独自データの置き場（世界設定・ノート等。機能ごとに追加していく）
      data: {}
    };
  }
  var isNativeHeader = (extraHeader) => (extraHeader?.[0] ?? "").startsWith("ALTERHISTORY");
  function attachExtension(map) {
    const warnings = [];
    map.ext = createExtension();
    if (!isNativeHeader(map.meta.extraHeader)) return warnings;
    map.meta.source = "alterhistory";
    const indexes = Object.keys(map.passthrough).map(Number).filter((i) => i >= MIN_EXT_INDEX);
    if (indexes.length === 0) {
      warnings.push("ALTERHISTORY \u306E\u62E1\u5F35\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08Azgaar \u5F62\u5F0F\u3068\u3057\u3066\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\uFF09");
      return warnings;
    }
    const last = Math.max(...indexes);
    try {
      const ext = JSON.parse(map.passthrough[last]);
      if (ext?.app !== APP_NAME) throw new Error("app \u304C ALTERHISTORY \u3067\u306F\u3042\u308A\u307E\u305B\u3093");
      if (typeof ext.format === "number" && ext.format > EXT_FORMAT) {
        warnings.push(`\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u65B0\u3057\u3044\u7248\u306E ALTERHISTORY (\u5F62\u5F0F${ext.format}) \u3067\u4FDD\u5B58\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u4E00\u90E8\u306E\u60C5\u5831\u304C\u5931\u308F\u308C\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`);
      }
      map.ext = { ...createExtension(), ...ext, data: ext.data ?? {} };
      delete map.passthrough[last];
      if (map.ext.data.worldTime && Number.isInteger(map.ext.data.worldTime.year) && Number.isInteger(map.ext.data.worldTime.month)) {
        map.worldTime = { year: map.ext.data.worldTime.year, month: map.ext.data.worldTime.month };
      }
      const n = ext.lineCount;
      map.meta.lineCount = Number.isInteger(n) && n > 0 && n <= last ? n : last;
    } catch (e) {
      warnings.push(`ALTERHISTORY \u306E\u62E1\u5F35\u30C7\u30FC\u30BF\u304C\u58CA\u308C\u3066\u3044\u308B\u305F\u3081\u7121\u8996\u3057\u307E\u3057\u305F: ${e.message}`);
    }
    return warnings;
  }

  // js/io/loader.js
  var LoadError = class extends Error {
    constructor(message, cause) {
      super(message);
      this.name = "LoadError";
      this.cause = cause;
    }
  };
  var isGzip = (b) => b.length > 2 && b[0] === 31 && b[1] === 139;
  async function gunzip(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new LoadError("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F .gz \u306E\u5C55\u958B\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u5C55\u958B\u3057\u3066\u304B\u3089\u958B\u3044\u3066\u304F\u3060\u3055\u3044");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function loadFromBytes(bytes, Delaunator) {
    let data = bytes;
    if (isGzip(data)) data = await gunzip(data);
    if (data.length === 0) throw new LoadError("\u30D5\u30A1\u30A4\u30EB\u304C\u7A7A\u3067\u3059");
    let parsed;
    try {
      parsed = parseAzgaarBytes(data);
    } catch (e) {
      throw new LoadError(`\u5730\u56F3\u3068\u3057\u3066\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F: ${e.message}`, e);
    }
    try {
      buildGeometry(parsed.map, Delaunator);
    } catch (e) {
      throw new LoadError(`\u5730\u56F3\u306E\u5F62\u72B6\u3092\u4F5C\u308C\u307E\u305B\u3093\u3067\u3057\u305F: ${e.message}`, e);
    }
    const ov = parsed.map.geometry.overrideReport;
    if (ov.skipped > 0) parsed.warnings.push(`\u30BB\u30EB\u5F62\u72B6\u306E\u624B\u52D5\u7DE8\u96C6\uFF08\u9802\u70B9\u306E\u79FB\u52D5\uFF09\u306E\u3046\u3061 ${ov.skipped} \u4EF6\u306F\u3001\u518D\u69CB\u7BC9\u3057\u305F\u5F62\u72B6\u3068\u4E00\u81F4\u3057\u306A\u3044\u305F\u3081\u9069\u7528\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5883\u754C\u7DDA\u306E\u5F62\u304C Azgaar \u306E\u8868\u793A\u3068\u5C11\u3057\u7570\u306A\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059`);
    if (ov.unsupported) parsed.warnings.push("\u672A\u5BFE\u5FDC\u306E\u5F62\u72B6\u7DE8\u96C6\uFF08\u30B0\u30EA\u30C3\u30C9\u3084\u30BB\u30EB\u306E\u4E0A\u66F8\u304D\uFF09\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059\u3002\u3053\u306E\u90E8\u5206\u306F\u53CD\u6620\u3055\u308C\u307E\u305B\u3093");
    parsed.warnings.push(...attachExtension(parsed.map));
    return parsed;
  }
  async function loadFromFile(file, Delaunator) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return loadFromBytes(bytes, Delaunator);
  }

  // js/core/names/katakana.js
  var NAME_STYLES = Object.freeze({
    western: {
      label: "\u897F\u6B27\u98A8",
      heads: ["\u30A2\u30EB", "\u30A8\u30EB", "\u30AA\u30EB", "\u30AB\u30EB", "\u30B1\u30EB", "\u30C0\u30EB", "\u30C6\u30EB", "\u30CE\u30EB", "\u30D0\u30EB", "\u30D9\u30EB", "\u30DE\u30EB", "\u30E1\u30EB", "\u30B5\u30EB", "\u30CF\u30EB", "\u30D6\u30E9\u30F3", "\u30B0\u30EC\u30F3", "\u30A6\u30A3\u30F3", "\u30F4\u30A1\u30EB", "\u30D5\u30A7\u30EB", "\u30ED\u30B9", "\u30B2\u30EB", "\u30AB\u30F3"],
      mids: ["\u30C9", "\u30E9", "\u30CD", "\u30BF", "\u30BB", "\u30EC", "\u30AC", "\u30DF"],
      tails: ["\u30F3", "\u30B9", "\u30C8", "\u30CB\u30A2", "\u30E9\u30F3\u30C9", "\u30D6\u30EB\u30AF", "\u30CF\u30A4\u30E0", "\u30D5\u30A9\u30FC\u30C9", "\u30C8\u30F3", "\u30F4\u30A3\u30EB", "\u30C7\u30A3\u30A2", "\u30DF\u30A2", "\u30C9\u30FC\u30EB", "\u30B7\u30A2", "\u30A6\u30A7\u30A4", "\u30DD\u30FC\u30C8"],
      midChance: 0.35
    },
    nordic: {
      label: "\u5317\u6B27\u98A8",
      heads: ["\u30BD\u30EB", "\u30E8\u30EB", "\u30CF\u30EB", "\u30F4\u30A1\u30EB", "\u30B0\u30F3", "\u30B9\u30AB\u30EB", "\u30D3\u30E7\u30EB", "\u30C8\u30EB", "\u30A6\u30EB", "\u30D5\u30ED", "\u30B9\u30F4\u30A7", "\u30D8\u30EB", "\u30ED\u30AF", "\u30A2\u30B9", "\u30C0\u30B0"],
      mids: ["\u30AC", "\u30F4\u30A3", "\u30EB", "\u30CA", "\u30C8", "\u30C0"],
      tails: ["\u30D8\u30A4\u30E0", "\u30AC\u30EB\u30C9", "\u30F4\u30A3\u30FC\u30AF", "\u30DB\u30EB\u30E0", "\u30CD\u30B9", "\u30DC\u30EB\u30B0", "\u30E9\u30F3\u30C9", "\u30D5\u30A3\u30E8\u30EB\u30C9", "\u30B9\u30BF\u30C3\u30C9", "\u30C0\u30FC\u30EB", "\u30F4\u30A1", "\u30EB"],
      midChance: 0.25
    },
    latin: {
      label: "\u30E9\u30C6\u30F3\u98A8",
      heads: ["\u30ED", "\u30AB", "\u30A6\u30A1", "\u30C6\u30A3", "\u30DD", "\u30BB", "\u30A2\u30A6", "\u30EB", "\u30F4\u30A7", "\u30DF", "\u30AF", "\u30CE", "\u30A2", "\u30F4\u30A3", "\u30B3\u30EB"],
      mids: ["\u30EB", "\u30DF", "\u30CA", "\u30C8", "\u30DD", "\u30AF", "\u30EC", "\u30BB", "\u30E9", "\u30EA"],
      tails: ["\u30A6\u30E0", "\u30CB\u30A6\u30E0", "\u30C6\u30A3\u30A2", "\u30CA", "\u30CB\u30A2", "\u30DD\u30EA\u30B9", "\u30A6\u30B9", "\u30E9", "\u30B1\u30A2", "\u30C7\u30A3\u30A2", "\u30DF\u30A2"],
      midChance: 0.7
    },
    arabic: {
      label: "\u4E2D\u6771\u98A8",
      heads: ["\u30A2\u30EB", "\u30C0", "\u30CF", "\u30AB", "\u30DF", "\u30B5", "\u30E9", "\u30D0", "\u30B8\u30E3", "\u30D5\u30A1", "\u30E0\u30CF", "\u30B6", "\u30BF", "\u30A4\u30B9"],
      mids: ["\u30EB", "\u30E9", "\u30DF", "\u30D5", "\u30CF", "\u30B7", "\u30AF", "\u30BA", "\u30CA"],
      tails: ["\u30D0\u30FC\u30C9", "\u30C0\u30FC\u30C9", "\u30CF\u30F3", "\u30E9\u30FC\u30F3", "\u30B9\u30BF\u30F3", "\u30CF\u30FC\u30E9", "\u30B8\u30FC\u30EB", "\u30FC\u30EB", "\u30FC\u30F3", "\u30DF\u30FC\u30EB", "\u30AB\u30F3\u30C9", "\u30FC\u30D5", "\u30E9"],
      midChance: 0.6
    },
    slavic: {
      label: "\u30B9\u30E9\u30F4\u98A8",
      heads: ["\u30F4\u30A9", "\u30BA", "\u30D6", "\u30AF", "\u30CE", "\u30DD", "\u30B9", "\u30C8", "\u30DF", "\u30DA", "\u30B4", "\u30C9\u30D6", "\u30F4\u30E9", "\u30DC", "\u30F4\u30A7"],
      mids: ["\u30ED", "\u30EA", "\u30E9", "\u30B9", "\u30F4", "\u30C0", "\u30DF", "\u30C8", "\u30AC", "\u30B6"],
      tails: ["\u30B0\u30E9\u30FC\u30C9", "\u30B9\u30AF", "\u30F4\u30A3\u30C1", "\u30CB\u30AF", "\u30DD\u30EA", "\u30F4\u30A1", "\u30B4\u30ED\u30C9", "\u30B9\u30E9\u30D5", "\u30CB\u30C4\u30A1", "\u30F4\u30A9", "\u30CE\u30D5", "\u30D3\u30EB"],
      midChance: 0.6
    },
    elvish: {
      label: "\u30A8\u30EB\u30D5\u98A8",
      heads: ["\u30E9", "\u30EA", "\u30A8", "\u30A2", "\u30B7", "\u30CA", "\u30A4", "\u30DF", "\u30D5", "\u30EB", "\u30BB", "\u30C6\u30A3"],
      mids: ["\u30EA", "\u30CA", "\u30A8", "\u30E9", "\u30DF", "\u30BD", "\u30F4\u30A3", "\u30EC", "\u30A2", "\u30A4", "\u30EB"],
      tails: ["\u30A8\u30EB", "\u30CB\u30A8\u30EB", "\u30BD\u30EA\u30A2", "\u30EA\u30A8\u30EB", "\u30CA\u30C7\u30A3\u30A2", "\u30DF\u30E9", "\u30ED\u30FC\u30F3", "\u30A6\u30A7\u30F3", "\u30C9\u30EA\u30EB", "\u30EA\u30B9", "\u30C7\u30A3\u30EB", "\u30B7\u30A2", "\u30FC\u30EB"],
      midChance: 0.9
    },
    yamato: {
      label: "\u548C\u98A8\uFF08\u30AB\u30CA\uFF09",
      heads: ["\u30E4\u30DE", "\u30AB\u30EF", "\u30DF\u30BA", "\u30BF\u30B1", "\u30B7\u30E9", "\u30AF\u30ED", "\u30A2\u30AA", "\u30CF\u30CA", "\u30C8\u30E8", "\u30A2\u30B5", "\u30CA\u30E9", "\u30DF\u30CA", "\u30B5\u30AF", "\u30DB\u30BF", "\u30A4\u30BA", "\u30C4\u30AD"],
      mids: ["\u30CE", "\u30DF", "\u30AB", "\u30B7", "\u30CF", "\u30C8"],
      tails: ["\u30B7\u30DE", "\u30AC\u30EF", "\u30B6\u30AD", "\u30E4\u30DE", "\u30CE\u30DF\u30E4", "\u30C0", "\u30CF\u30E9", "\u30A6\u30E9", "\u30DF\u30E4", "\u30AE", "\u30B5\u30C8", "\u30B4\u30AF", "\u30BF\u30CB"],
      midChance: 0.2
    }
  });
  var STYLE_KEYS = Object.freeze(Object.keys(NAME_STYLES));
  var DEFAULT_STYLE = "western";
  var isStyle = (k) => Object.prototype.hasOwnProperty.call(NAME_STYLES, k);
  var KATAKANA_ONLY = /^[ァ-ヴー]+$/;
  var SMALL_START = /^[ァィゥェォャュョッンー]/;
  function validate(name, { min = 2, max = 9 } = {}) {
    if (typeof name !== "string" || !KATAKANA_ONLY.test(name)) return false;
    if (name.length < min || name.length > max) return false;
    if (SMALL_START.test(name)) return false;
    if (/ンー|ッー|ーッ/.test(name)) return false;
    if (/(.)\1/.test(name)) return false;
    if (/^(.{1,3})\1/.test(name)) return false;
    return true;
  }
  function cfg(style) {
    return NAME_STYLES[isStyle(style) ? style : DEFAULT_STYLE];
  }
  function assemble(rnd, style, { shortTail = false, noTail = false } = {}) {
    const s = cfg(style);
    let prefix = rnd.pick(s.heads);
    if (rnd.chance(s.midChance)) prefix += rnd.pick(s.mids);
    if (noTail) return prefix;
    const tails = shortTail ? s.tails.filter((t) => t.length <= 2) : s.tails;
    const tail = rnd.pick(tails);
    if (prefix.at(-1) === tail[0]) return null;
    return prefix + tail;
  }
  function make(rnd, style, opts = {}) {
    for (let i = 0; i < 60; i++) {
      const n = assemble(rnd, style, opts);
      if (n && validate(n, { max: opts.max ?? 9 })) return n;
    }
    const heads = cfg(style).heads.filter((h) => validate(h) && h.length <= (opts.max ?? 9));
    return rnd.pick(heads.length ? heads : cfg(style).heads);
  }
  function generatePlaceName(rnd, style) {
    return make(rnd, style);
  }
  function generateShortName(rnd, style) {
    return make(rnd, style, { shortTail: rnd.chance(0.6), max: 6 });
  }
  var COMMON_FORMS = [
    { w: 30, suffix: "\u738B\u56FD", form: "Monarchy", formName: "Kingdom" },
    { w: 12, suffix: "\u5E1D\u56FD", form: "Monarchy", formName: "Empire" },
    { w: 10, suffix: "\u516C\u56FD", form: "Monarchy", formName: "Duchy" },
    { w: 14, suffix: "\u5171\u548C\u56FD", form: "Republic", formName: "Republic" },
    { w: 6, suffix: "\u9023\u90A6", form: "Federation", formName: "Federation" },
    { w: 5, suffix: "\u795E\u8056\u56FD", form: "Theocracy", formName: "Theocracy" },
    { w: 6, suffix: "\u4FAF\u56FD", form: "Monarchy", formName: "Principality" },
    { w: 5, suffix: "\u8FBA\u5883\u4F2F\u9818", form: "Monarchy", formName: "March" }
  ];
  var EXTRA_FORMS = {
    arabic: [
      { w: 14, suffix: "\u9996\u9577\u56FD", form: "Monarchy", formName: "Emirate" },
      { w: 12, suffix: "\u30B9\u30EB\u30BF\u30F3\u56FD", form: "Monarchy", formName: "Sultanate" },
      { w: 8, suffix: "\u30AB\u30EA\u30D5\u56FD", form: "Theocracy", formName: "Caliphate" }
    ],
    yamato: [{ w: 10, suffix: "\u7687\u56FD", form: "Monarchy", formName: "Empire" }]
  };
  function stateForms(style) {
    return [...COMMON_FORMS, ...EXTRA_FORMS[style] ?? []];
  }
  function generateStateName(rnd, style, form) {
    const stem = rnd.chance(0.5) ? make(rnd, style, { shortTail: true, max: 6 }) : make(rnd, style, { max: 6 });
    const forms = stateForms(style);
    const chosen = (form && forms.find((f) => f.suffix === form || f.formName === form)) ?? rnd.weighted(forms, forms.map((f) => f.w));
    return { short: stem, name: stem + chosen.suffix, form: chosen.form, formName: chosen.formName };
  }
  var RELIGION_KINDS = [
    { w: 40, type: "Organized", make: (d, r) => r.chance(0.65) ? { name: d + "\u6559", form: "Church" } : { name: d + "\u6559\u4F1A", form: "Church" } },
    { w: 30, type: "Folk", make: (d, r) => r.chance(0.6) ? { name: d + "\u4FE1\u4EF0", form: "Animism" } : { name: d + "\u5D07\u62DD", form: "Shamanism" } },
    { w: 20, type: "Cult", make: (d) => ({ name: d + "\u6559\u56E3", form: "Cult" }) },
    { w: 10, type: "Heresy", make: (d) => ({ name: d + "\u6D3E", form: "Sect" }) }
  ];
  function generateReligionName(rnd, style) {
    const deity = generateShortName(rnd, style);
    const kind = rnd.weighted(RELIGION_KINDS, RELIGION_KINDS.map((k) => k.w));
    const { name, form } = kind.make(deity, rnd);
    return { name, deity, type: kind.type, form };
  }
  function generateCultureName(rnd, style) {
    return generateShortName(rnd, style) + "\u4EBA";
  }
  var PROVINCE_SUFFIX = [["\u5DDE", 4], ["\u5730\u65B9", 3], ["\u9818", 3]];
  function generateProvinceName(rnd, style) {
    const stem = make(rnd, style, { shortTail: true, max: 6 });
    return stem + rnd.weighted(PROVINCE_SUFFIX.map((p) => p[0]), PROVINCE_SUFFIX.map((p) => p[1]));
  }

  // js/core/edit/naming.js
  var NAME_KINDS = ["burg", "state", "culture", "religion", "province"];
  var isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  var LIST = { burg: "burgs", state: "states", culture: "cultures", religion: "religions", province: "provinces" };
  function takenNames(map) {
    const s = /* @__PURE__ */ new Set();
    for (const kind of NAME_KINDS) {
      for (const e of map.pack[LIST[kind]] ?? []) {
        if (!isLive(e)) continue;
        if (e.name) s.add(e.name);
        if (e.fullName) s.add(e.fullName);
      }
    }
    return s;
  }
  var styleKey = (cultureId) => `culture:${cultureId}`;
  function getNameStyle(map, cultureId) {
    const v = map.ext?.data?.nameStyles?.[styleKey(cultureId)];
    return isStyle(v) ? v : null;
  }
  function styleOfCulture(map, cultureId) {
    const explicit = getNameStyle(map, cultureId);
    if (explicit) return explicit;
    if (!cultureId || cultureId < 0) return DEFAULT_STYLE;
    return STYLE_KEYS[(cultureId * 3 + 1) % STYLE_KEYS.length];
  }
  function planSetNameStyle(map, cultureId, style) {
    const culture = map.pack.cultures?.[cultureId];
    if (!isLive(culture)) throw new Error("\u305D\u306E\u6587\u5316\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const after = style ? String(style) : null;
    if (after && !isStyle(after)) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u540D\u524D\u306E\u7CFB\u7D71\u3067\u3059: ${after}`);
    const before = getNameStyle(map, cultureId);
    if (before === after) return null;
    const key = styleKey(cultureId);
    const write = (m, v) => {
      var _a;
      const ext = ensureExt(m);
      (_a = ext.data).nameStyles ?? (_a.nameStyles = {});
      if (v) ext.data.nameStyles[key] = v;
      else delete ext.data.nameStyles[key];
      if (!Object.keys(ext.data.nameStyles).length) delete ext.data.nameStyles;
    };
    return makeCommand("\u540D\u524D\u306E\u7CFB\u7D71\u3092\u5909\u66F4", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function cultureIdFor(map, { kind, id, cell, cultureId, stateId }) {
    if (cultureId != null) return cultureId;
    const c = map.pack.cells;
    if (cell != null && c?.culture?.[cell] != null) return c.culture[cell];
    const stateCulture = (sid) => {
      const s = map.pack.states[sid];
      if (!isLive(s)) return 0;
      if (s.culture != null) return s.culture;
      const cap = map.pack.burgs[s.capital];
      return isLive(cap) ? cap.culture ?? 0 : 0;
    };
    if (stateId != null) return stateCulture(stateId);
    if (id != null) {
      const e = map.pack[LIST[kind]]?.[id];
      if (!isLive(e)) return 0;
      if (kind === "culture") return id;
      if (kind === "burg") return e.culture ?? 0;
      if (kind === "state") return stateCulture(id);
      if (kind === "province") return stateCulture(e.state);
      if (kind === "religion") return e.culture ?? 0;
    }
    return 0;
  }
  function suggestName(map, opts) {
    const { kind, rnd } = opts;
    if (!NAME_KINDS.includes(kind)) throw new Error(`\u540D\u524D\u3092\u751F\u6210\u3067\u304D\u306A\u3044\u7A2E\u985E\u3067\u3059: ${kind}`);
    if (!rnd) throw new Error("\u4E71\u6570(rnd)\u304C\u5FC5\u8981\u3067\u3059");
    let style = opts.style;
    if (!isStyle(style)) {
      const cid = cultureIdFor(map, opts);
      style = cid ? styleOfCulture(map, cid) : rnd.pick(STYLE_KEYS);
    }
    const taken = takenNames(map);
    if (opts.avoid) for (const n of opts.avoid) taken.add(n);
    const gen = () => {
      switch (kind) {
        case "burg":
          return { name: generatePlaceName(rnd, style), extra: {} };
        case "province":
          return { name: generateProvinceName(rnd, style), extra: {} };
        case "culture":
          return { name: generateCultureName(rnd, style), extra: {} };
        case "religion": {
          const r = generateReligionName(rnd, style);
          return { name: r.name, extra: { deity: r.deity, type: r.type, form: r.form } };
        }
        case "state": {
          const r = generateStateName(rnd, style, opts.form);
          return { name: r.name, extra: { name: r.short, form: r.form, formName: r.formName } };
        }
        default:
          throw new Error(kind);
      }
    };
    let last = gen();
    for (let i = 0; i < 60 && taken.has(last.name); i++) last = gen();
    if (taken.has(last.name)) {
      let n = 2;
      while (taken.has(`${last.name}${n}`)) n++;
      last = { ...last, name: `${last.name}${n}` };
    }
    return { ...last, style };
  }
  var provKey = (kind, id) => `${kind}:${id}`;
  function isProvisional(map, kind, id) {
    return !!map.ext?.data?.provisionalNames?.[provKey(kind, id)];
  }
  function listProvisional(map) {
    return Object.keys(map.ext?.data?.provisionalNames ?? {}).map((k) => {
      const [kind, id] = k.split(":");
      return { kind, id: Number(id) };
    });
  }
  function provisionalPart(map, kind, id, flag) {
    const before = isProvisional(map, kind, id);
    const key = provKey(kind, id);
    const write = (m, v) => {
      var _a;
      const ext = ensureExt(m);
      (_a = ext.data).provisionalNames ?? (_a.provisionalNames = {});
      if (v) ext.data.provisionalNames[key] = 1;
      else delete ext.data.provisionalNames[key];
      if (!Object.keys(ext.data.provisionalNames).length) delete ext.data.provisionalNames;
    };
    return { apply: (m) => write(m, flag), revert: (m) => write(m, before) };
  }
  function planSetProvisional(map, kind, id, flag) {
    if (!NAME_KINDS.includes(kind)) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u7A2E\u985E\u3067\u3059: ${kind}`);
    if (!isLive(map.pack[LIST[kind]]?.[id])) throw new Error("\u305D\u306E\u5BFE\u8C61\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (isProvisional(map, kind, id) === !!flag) return null;
    return makeCommand(flag ? "\u540D\u524D\u3092\u4EEE\u306B\u623B\u3059" : "\u540D\u524D\u3092\u78BA\u5B9A", [], [provisionalPart(map, kind, id, !!flag)]);
  }
  function withProvisional(map, command, kind, id, flag) {
    if (!command) return command;
    if (isProvisional(map, kind, id) === !!flag) return command;
    return makeCommand(command.label, command.layers, [...command.parts, provisionalPart(map, kind, id, !!flag)]);
  }

  // js/core/edit/katakana.js
  var KANA_OR_KANJI = /[\u3040-\u30FF\u4E00-\u9FFF]/;
  var isLatinName = (name) => typeof name === "string" && /[A-Za-z]/.test(name) && !KANA_OR_KANJI.test(name);
  function latinBurgIds(map) {
    const out = [];
    (map.pack.burgs ?? []).forEach((b, i) => {
      if (b && i > 0 && !b.removed && isLatinName(b.name)) out.push(i);
    });
    return out;
  }
  function planKatakanaBurgs(map, rnd) {
    const ids2 = latinBurgIds(map);
    if (!ids2.length) return null;
    const avoid = /* @__PURE__ */ new Set();
    const parts = [];
    for (const id of ids2) {
      const b = map.pack.burgs[id];
      const s = suggestName(map, { kind: "burg", rnd, cell: b.cell, avoid });
      avoid.add(s.name);
      parts.push(setProps(b, { name: s.name }));
    }
    return makeCommand(`\u82F1\u8A9E\u306E\u90FD\u5E02\u540D\u3092\u30AB\u30BF\u30AB\u30CA\u306B\uFF08${ids2.length}\u4EF6\uFF09`, ["places"], parts);
  }

  // js/core/random.js
  function createRandom(seed) {
    let s = normalizeSeed(seed);
    const next = () => {
      s = s + 1831565813 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    return {
      /** [0, 1) の実数 */
      next,
      /** [min, max] の整数 */
      int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
      /** [min, max) の実数 */
      float: (min, max) => next() * (max - min) + min,
      /** 確率 p で true */
      chance: (p) => next() < p,
      /** 配列から1つ選ぶ */
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      /** 重み付き選択。weights は arr と同じ長さ */
      weighted(arr, weights) {
        let total = 0;
        for (const w of weights) total += w;
        let r = next() * total;
        for (let i = 0; i < arr.length; i++) {
          r -= weights[i];
          if (r <= 0) return arr[i];
        }
        return arr[arr.length - 1];
      },
      /** 新しい配列を返すシャッフル（入力は変更しない） */
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }
    };
  }
  function normalizeSeed(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    const str = String(seed ?? Date.now());
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // js/core/sim/economy.js
  var TECH_MIN = 1;
  var TECH_MAX = 10;
  var GROWTH_RATE_BY_TECH = (tech) => 6e-3 + (tech - 1) * 16e-4;
  var INDUSTRY_PER_CAPITA_BY_TECH = (tech) => 0.05 + (tech - 1) * 0.09;
  function carryingCapacity(state) {
    const tech = clampTech(state.techLevel ?? 3);
    const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
    const techFactor = 1 + (tech - 1) * 0.18;
    const cells = Number(state.cells) || 0;
    if (cells > 0) {
      const density = state.carryDensity ?? (pop > 0 ? pop / cells / 0.8 / techFactor : 1);
      return Math.max(1, cells * density * techFactor);
    }
    return Math.max(1, pop * 1.5);
  }
  function ensureEconomy(state) {
    if (typeof state.techLevel !== "number") state.techLevel = 3;
    if (typeof state.industry !== "number") state.industry = 0;
    if (typeof state.carryDensity !== "number" && Number(state.cells) > 0) {
      const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
      const techFactor = 1 + (clampTech(state.techLevel ?? 3) - 1) * 0.18;
      state.carryDensity = pop > 0 ? pop / state.cells / 0.8 / techFactor : 1;
    }
    state.popCarryCap = carryingCapacity(state);
    return state;
  }
  function computeAnnualUpdate(state) {
    const tech = clampTech(state.techLevel ?? 3);
    const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
    const cap = carryingCapacity(state);
    const r = GROWTH_RATE_BY_TECH(tech);
    const growth = pop > 0 ? r * pop * (1 - pop / cap) : 0;
    const newPop = Math.max(0, Math.min(pop + growth, cap));
    const ratio = pop > 0 ? (state.urban ?? 0) / pop : 0.3;
    const newUrban = round2((state.urban ?? 0) + growth * ratio);
    const newRural = round2(newPop - newUrban);
    const industry = round2(newPop / 1e3 * INDUSTRY_PER_CAPITA_BY_TECH(tech));
    return { rural: newRural, urban: newUrban, industry };
  }
  function clampTech(v) {
    return Math.min(TECH_MAX, Math.max(TECH_MIN, Math.round(v)));
  }
  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  // js/core/sim/military.js
  var isLive2 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function regimentsOf(state) {
    return Array.isArray(state.military) ? state.military : [];
  }
  function nextRegimentId(state) {
    const list = regimentsOf(state);
    return list.length ? Math.max(...list.map((r) => r.i)) + 1 : 0;
  }
  function planCreateRegiment(map, stateId, cell, { name, icon = "\u{1F6E1}\uFE0F" } = {}) {
    const state = map.pack.states[stateId];
    if (!isLive2(state)) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u914D\u7F6E\u3067\u304D\u307E\u305B\u3093");
    if (map.pack.cells.state[cell] !== stateId) throw new Error("\u90E8\u968A\u306F\u81EA\u56FD\u306E\u9818\u571F\u5185\u306B\u3057\u304B\u8A2D\u7F6E\u3067\u304D\u307E\u305B\u3093");
    const { p } = map.geometry.pack;
    const reg = {
      i: nextRegimentId(state),
      name: name || `${state.name}\u8ECD`,
      icon,
      state: stateId,
      cell,
      x: p[cell][0],
      y: p[cell][1],
      bx: p[cell][0],
      by: p[cell][1],
      u: emptyForce()
    };
    const next = [...regimentsOf(state), reg];
    return { command: makeCommand("\u90E8\u968A\u3092\u7DE8\u6210", ["places"], [setList((m) => m.pack.states[stateId].military, (m, v) => {
      m.pack.states[stateId].military = v;
    }, next)]), id: reg.i };
  }
  function planMoveRegiment(map, stateId, regId, cell) {
    const state = map.pack.states[stateId];
    const reg = regimentsOf(state).find((r) => r.i === regId);
    if (!reg) throw new Error("\u305D\u306E\u90E8\u968A\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u79FB\u52D5\u3067\u304D\u307E\u305B\u3093");
    if (map.pack.cells.state[cell] !== stateId) throw new Error("\u90E8\u968A\u306F\u81EA\u56FD\u306E\u9818\u571F\u5185\u306B\u3057\u304B\u79FB\u52D5\u3067\u304D\u307E\u305B\u3093");
    if (reg.cell === cell) return null;
    const { p } = map.geometry.pack;
    return makeCommand("\u90E8\u968A\u3092\u79FB\u52D5", ["places"], [setProps(reg, { cell, x: p[cell][0], y: p[cell][1] })]);
  }
  function planEditRegiment(map, stateId, regId, patch) {
    const state = map.pack.states[stateId];
    const reg = regimentsOf(state).find((r) => r.i === regId);
    if (!reg) throw new Error("\u305D\u306E\u90E8\u968A\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const next = {};
    if (patch.name !== void 0 && patch.name !== reg.name) next.name = patch.name;
    if (patch.icon !== void 0 && patch.icon !== reg.icon) next.icon = patch.icon;
    if (patch.u) {
      const u = { ...reg.u };
      for (const k of UNIT_KEYS) if (patch.u[k] !== void 0) u[k] = Math.max(0, Math.round(patch.u[k]));
      if (JSON.stringify(u) !== JSON.stringify(reg.u)) next.u = u;
    }
    if (!Object.keys(next).length) return null;
    return makeCommand("\u90E8\u968A\u3092\u7DE8\u96C6", ["places"], [setProps(reg, next)]);
  }
  function planDisbandRegiment(map, stateId, regId) {
    const state = map.pack.states[stateId];
    const list = regimentsOf(state);
    if (!list.some((r) => r.i === regId)) throw new Error("\u305D\u306E\u90E8\u968A\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const next = list.filter((r) => r.i !== regId);
    return makeCommand("\u90E8\u968A\u3092\u89E3\u6563", ["places"], [setList((m) => m.pack.states[stateId].military, (m, v) => {
      m.pack.states[stateId].military = v;
    }, next)]);
  }
  function isCoastalState(map, stateId) {
    const c = map.pack.cells, nb = map.geometry?.pack?.cells?.c;
    if (!nb) return true;
    for (let i = 0; i < c.state.length; i++) {
      if (c.state[i] !== stateId) continue;
      for (const j of nb[i] ?? []) if (c.biome[j] === 0) return true;
    }
    return false;
  }
  var CREW = { infantry: 1, cavalry: 1, archers: 1, artillery: 6, armor: 20, air: 25, navy: 150, special: 1, advanced: 30 };
  var BASE_SHARE = { infantry: 1, cavalry: 0.25, archers: 0.3, artillery: 0.14, armor: 0.1, air: 0.06, navy: 0.05, special: 0.02, advanced: 0.02 };
  function planAnnualConscription(map, stateId) {
    const state = map.pack.states[stateId];
    if (!isLive2(state)) return null;
    ensureEconomy(state);
    const capital = map.pack.burgs[state.capital];
    if (!capital) return null;
    const pop = (state.rural ?? 0) + (state.urban ?? 0);
    const tech = state.techLevel ?? 3;
    const industry = state.industry ?? 0;
    const doctrine = DOCTRINE_BY_KEY[state.doctrine] ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE];
    const tmult = stateTypeMult(state.type);
    const coastal = isCoastalState(map, stateId);
    const list = regimentsOf(state);
    const home = list.find((r) => r.i === 0) ?? null;
    const cur = emptyForce();
    for (const r of list) for (const k of UNIT_KEYS) cur[k] += r.u?.[k] ?? 0;
    const industrial = Math.min(1, industry / 300);
    const shares = {};
    let sum = 0;
    for (const k of Object.keys(BASE_SHARE)) {
      const def = UNIT_BY_KEY[k];
      const allowed = tech >= (def.minTech ?? 1) && tech <= (def.maxTech ?? 99) && !(def.needsCoast && !coastal);
      let v = allowed ? BASE_SHARE[k] * (doctrine.mult[k] ?? 1) * (tmult[k] ?? 1) : 0;
      if (def.industryShare > 0) v *= 0.2 + 0.8 * industrial;
      shares[k] = v;
      sum += v;
    }
    const totalTarget = pop * 6;
    const delta = emptyForce();
    let any = false;
    for (const k of Object.keys(BASE_SHARE)) {
      const target = sum > 0 ? totalTarget * shares[k] / sum / CREW[k] : 0;
      const have = cur[k];
      let d;
      if (shares[k] === 0) d = -Math.ceil(have * 0.05);
      else if (have === 0) d = target >= 1 ? Math.max(1, Math.round(target * 0.03)) : 0;
      else d = Math.max(-0.04 * have, Math.min(0.08 * have, (target - have) * 0.12));
      d = Math.round(d);
      if (d !== 0) {
        delta[k] = d;
        any = true;
      }
    }
    if (!any) return null;
    if (!list.length) return null;
    const parts = [];
    const totalBy = (k) => list.reduce((n, r) => n + (r.u?.[k] ?? 0), 0);
    const u2 = list.map((r) => ({ ...r.u }));
    for (const k of UNIT_KEYS) {
      const d = delta[k];
      if (!d) continue;
      const tot = totalBy(k);
      if (tot > 0) {
        let left = d;
        list.forEach((r, idx) => {
          const have = r.u?.[k] ?? 0;
          if (!have) return;
          const share = Math.round(d * have / tot);
          const v = Math.max(0, have + share);
          u2[idx][k] = v;
          left -= v - have;
        });
        if (left !== 0) {
          const big = list.reduce((bi, r, idx) => (r.u?.[k] ?? 0) > (list[bi].u?.[k] ?? 0) ? idx : bi, 0);
          u2[big][k] = Math.max(0, (u2[big][k] ?? 0) + left);
        }
      } else if (d > 0) {
        u2[list.reduce((bi, r, idx) => forceHeadcount(r.u) > forceHeadcount(list[bi].u) ? idx : bi, 0)][k] = d;
      }
    }
    list.forEach((r, idx) => {
      if (UNIT_KEYS.some((k) => (u2[idx][k] ?? 0) !== (r.u?.[k] ?? 0))) parts.push(setProps(r, { u: u2[idx] }));
    });
    if (!parts.length) return null;
    return makeCommand("\u5E74\u6B21\u306E\u5175\u529B\u5909\u52D5", [], parts);
  }
  var AZ_ALIAS = { fleet: "navy", ships: "navy", navy: "navy", cavalry: "cavalry", archers: "archers", artillery: "artillery", infantry: "infantry" };
  var AZ_BY_TYPE = { melee: "infantry", ranged: "archers", mounted: "cavalry", machinery: "artillery", naval: "navy", armored: "armor", aviation: "air", magical: "special" };
  function importAzgaarMilitary(map) {
    const defs = Array.isArray(map.settings?.military) ? map.settings.military : [];
    const typeOf = new Map(defs.map((d) => [String(d.name).toLowerCase(), d.type]));
    let changed = 0;
    for (const st of map.pack.states) {
      if (!st || !Array.isArray(st.military)) continue;
      for (const r of st.military) {
        if (!r || !r.u || r.azU) continue;
        const keys = Object.keys(r.u);
        if (keys.every((k) => UNIT_KEYS.includes(k))) continue;
        const out = emptyForce();
        for (const [k, v] of Object.entries(r.u)) {
          const n = Number(v) || 0;
          const key = UNIT_KEYS.includes(k) ? k : AZ_ALIAS[String(k).toLowerCase()] ?? AZ_BY_TYPE[typeOf.get(String(k).toLowerCase())] ?? "infantry";
          out[key] += n;
        }
        r.azU = { ...r.u };
        r.u = out;
        changed++;
      }
    }
    return changed;
  }

  // js/io/azgaar-writer.js
  var CRLF2 = "\r\n";
  var json = (v) => JSON.stringify(v);
  var nums = (arr) => Array.from(arr).join(",");
  function serializeAzgaar(map, { native = false, exportedAt } = {}) {
    const m = map.meta;
    const limit = m.lineCount;
    const isLegacy2 = map.settings.format === "legacy";
    const g = map.grid, p = map.pack, c = p.cells;
    const pt = (i) => map.passthrough[i] ?? "";
    const header = [m.version, m.description, exportedAt ?? m.exportedAt, m.seed, m.width, m.height, m.mapId];
    let extra = m.extraHeader.slice();
    if (native) extra[0] = NATIVE_MARKER;
    else if ((extra[0] ?? "").startsWith("ALTERHISTORY")) extra = extra.slice(1);
    header.push(...extra);
    const gridGeneral = {
      spacing: g.spacing,
      cellsX: g.cellsX,
      cellsY: g.cellsY,
      boundary: g.boundary,
      points: g.points,
      features: g.features
    };
    if (g.cellsDesired !== void 0) gridGeneral.cellsDesired = g.cellsDesired;
    const L = /* @__PURE__ */ new Map();
    L.set(LINE.PARAMS, header.join("|"));
    L.set(LINE.SETTINGS, isLegacy2 ? map.settings.raw : json(map.settings.options));
    L.set(LINE.COORDINATES, isLegacy2 ? json(map.coordinates) : "");
    L.set(LINE.BIOMES, map.meta.biomesLegacy ? [map.biomesData.map((b) => b.color), map.biomesData.map((b) => b.habitability ?? 0), map.biomesData.map((b) => b.name)].map((col) => col.join(",")).join("|") : json(map.biomesData));
    L.set(LINE.NOTES, isLegacy2 ? json(map.notes) : "");
    L.set(LINE.SVG, map.rawLines[LINE.SVG] ?? "");
    L.set(LINE.GRID, json(gridGeneral));
    L.set(LINE.GRID_H, nums(g.h));
    L.set(LINE.GRID_PREC, nums(g.prec));
    L.set(LINE.GRID_F, nums(g.f));
    L.set(LINE.GRID_T, nums(g.t));
    L.set(LINE.GRID_TEMP, nums(g.temp));
    L.set(LINE.FEATURES, json(p.features));
    L.set(LINE.CULTURES, json(p.cultures));
    L.set(LINE.STATES, json(p.states));
    L.set(LINE.BURGS, json(p.burgs));
    L.set(LINE.CELL_BIOME, nums(c.biome));
    L.set(LINE.CELL_BURG, nums(c.burg));
    L.set(LINE.CELL_CULTURE, nums(c.culture));
    L.set(LINE.CELL_POP, nums(c.pop));
    L.set(LINE.CELL_RIVER, nums(c.river));
    L.set(LINE.CELL_STATE, nums(c.state));
    L.set(LINE.CELL_RELIGION, nums(c.religion));
    L.set(LINE.CELL_PROVINCE, nums(c.province));
    L.set(LINE.RELIGIONS, json(p.religions));
    L.set(LINE.PROVINCES, json(p.provinces));
    L.set(LINE.NAMESBASE, serializeNamesbase(map.namesbase));
    L.set(LINE.RIVERS, json(p.rivers));
    L.set(LINE.MARKERS, json(map.markers));
    L.set(LINE.CELL_ROUTES, json(map.cellRoutes));
    L.set(LINE.ROUTES, json(map.routes));
    L.set(LINE.ZONES, json(map.zones));
    L.set(LINE.ICE, json(map.ice));
    L.set(LINE.GOODS, json(map.goods));
    L.set(LINE.MARKETS, json(map.markets));
    L.set(LINE.DEALS, json(map.deals));
    L.set(LINE.MEASURERS, json(map.measurers));
    L.set(LINE.RELIEF, json(map.relief));
    const ext = native ? createExtension() : null;
    const known = LINE.JOURNEYS + 1;
    const nonEmptyMax = Math.max(-1, ...Object.entries(map.passthrough).filter(([, v]) => v !== "").map(([k]) => Number(k)));
    const bodyCount = Math.max(limit, nonEmptyMax + 1);
    const lines = new Array(bodyCount);
    for (let i = 0; i < bodyCount; i++) {
      if (i >= limit && !map.passthrough[i] && !L.has(i)) {
        lines[i] = "";
        continue;
      }
      if (i >= limit && i < known) {
        lines[i] = "";
        continue;
      }
      lines[i] = L.has(i) ? L.get(i) : pt(i);
    }
    if (ext) {
      ext.savedAt = exportedAt ?? m.exportedAt;
      ext.data = map.ext?.data ?? {};
      ext.lineCount = bodyCount;
      const extIndex = Math.max(MIN_EXT_INDEX, bodyCount);
      while (lines.length < extIndex) lines.push("");
      lines.push(json(ext));
    }
    return lines.join(CRLF2);
  }
  function serializeNamesbase(list) {
    return list.map((b) => `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${b.words.join(",")}`).join("/");
  }

  // js/render/svg-context.js
  var num = (v) => (Math.round(v * 100) / 100).toString();
  var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function parseColor2(input) {
    const s = String(input).trim();
    let m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
    if (m) {
      const h = (x) => Math.round(Number(x)).toString(16).padStart(2, "0");
      return { color: `#${h(m[1])}${h(m[2])}${h(m[3])}`, alpha: m[4] === void 0 ? 1 : Number(m[4]) };
    }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return { color: "#" + m[1].split("").map((c) => c + c).join(""), alpha: 1 };
    if (/^#[0-9a-f]{6}$/i.test(s)) return { color: s.toLowerCase(), alpha: 1 };
    throw new Error(`SVG \u51FA\u529B: \u672A\u5BFE\u5FDC\u306E\u8272\u6307\u5B9A\u3067\u3059: ${input}`);
  }
  var charEm = (ch) => ch.charCodeAt(0) >= 11904 ? 1 : 0.55;
  function parseFont(font) {
    const m = /^(bold\s+)?([\d.]+)px\s+(.+)$/.exec(font);
    if (!m) throw new Error(`SVG \u51FA\u529B: \u672A\u5BFE\u5FDC\u306E font \u6307\u5B9A\u3067\u3059: ${font}`);
    return { bold: !!m[1], size: Number(m[2]), family: m[3] };
  }
  function createSvgContext(width, height) {
    const body = [];
    let open = false;
    const stack = [];
    let path = [];
    const st = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      globalAlpha: 1,
      font: "10px sans-serif",
      letterSpacing: "0px",
      textAlign: "start",
      textBaseline: "alphabetic",
      dash: []
    };
    const closeGroup = () => {
      if (open) {
        body.push("</g>");
        open = false;
      }
    };
    const emit = (s) => {
      if (!open) {
        body.push("<g>");
        open = true;
      }
      body.push(s);
    };
    const fillAttrs = () => {
      const { color, alpha } = parseColor2(st.fillStyle);
      const a = alpha * st.globalAlpha;
      return `fill="${color}"${a < 1 ? ` fill-opacity="${num(a * 1e3) / 1e3}"` : ""}`;
    };
    const strokeAttrs = () => {
      const { color, alpha } = parseColor2(st.strokeStyle);
      const a = alpha * st.globalAlpha;
      let s = `stroke="${color}" stroke-width="${num(st.lineWidth * 1e3) / 1e3}"`;
      if (a < 1) s += ` stroke-opacity="${num(a * 1e3) / 1e3}"`;
      if (st.lineCap !== "butt") s += ` stroke-linecap="${st.lineCap}"`;
      if (st.lineJoin !== "miter") s += ` stroke-linejoin="${st.lineJoin}"`;
      if (st.dash.length) s += ` stroke-dasharray="${st.dash.map((d) => num(d * 1e3) / 1e3).join(" ")}"`;
      return s;
    };
    const textAttrs = (x, y) => {
      const f = parseFont(st.font);
      const anchor = st.textAlign === "center" ? "middle" : st.textAlign === "right" || st.textAlign === "end" ? "end" : "start";
      const base = st.textBaseline === "middle" ? ` dominant-baseline="central"` : "";
      return `x="${num(x)}" y="${num(y)}" font-size="${num(f.size * 1e3) / 1e3}" font-family="${esc(f.family)}"${f.bold ? ` font-weight="bold"` : ""}${st.letterSpacing && st.letterSpacing !== "0px" ? ` letter-spacing="${esc(st.letterSpacing)}"` : ""} text-anchor="${anchor}"${base}`;
    };
    const ctx = {
      get fillStyle() {
        return st.fillStyle;
      },
      set fillStyle(v) {
        st.fillStyle = v;
      },
      get strokeStyle() {
        return st.strokeStyle;
      },
      set strokeStyle(v) {
        st.strokeStyle = v;
      },
      get lineWidth() {
        return st.lineWidth;
      },
      set lineWidth(v) {
        st.lineWidth = v;
      },
      get lineCap() {
        return st.lineCap;
      },
      set lineCap(v) {
        st.lineCap = v;
      },
      get lineJoin() {
        return st.lineJoin;
      },
      set lineJoin(v) {
        st.lineJoin = v;
      },
      get globalAlpha() {
        return st.globalAlpha;
      },
      set globalAlpha(v) {
        st.globalAlpha = v;
      },
      get font() {
        return st.font;
      },
      set font(v) {
        st.font = v;
      },
      get textAlign() {
        return st.textAlign;
      },
      set textAlign(v) {
        st.textAlign = v;
      },
      get letterSpacing() {
        return st.letterSpacing;
      },
      set letterSpacing(v) {
        st.letterSpacing = v;
      },
      get textBaseline() {
        return st.textBaseline;
      },
      set textBaseline(v) {
        st.textBaseline = v;
      },
      save() {
        stack.push({ ...st, dash: st.dash.slice() });
      },
      restore() {
        const s = stack.pop();
        if (s) Object.assign(st, s);
      },
      // 変換が変わるたびに新しい <g> を始める（描画層は変換を入れ子にしない）
      setTransform(a, b, c, d, e, f) {
        closeGroup();
        body.push(`<g transform="matrix(${num(a * 1e4) / 1e4} ${b} ${c} ${num(d * 1e4) / 1e4} ${num(e)} ${num(f)})">`);
        open = true;
      },
      fillRect(x, y, w, h) {
        emit(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${fillAttrs()}/>`);
      },
      beginPath() {
        path = [];
      },
      moveTo(x, y) {
        path.push(`M${num(x)} ${num(y)}`);
      },
      lineTo(x, y) {
        path.push(`L${num(x)} ${num(y)}`);
      },
      closePath() {
        path.push("Z");
      },
      arc(x, y, r, a0, a1) {
        if (Math.abs(a1 - a0) < Math.PI * 2 - 1e-6) throw new Error("SVG \u51FA\u529B: \u5186\u5F27\uFF08\u5186\u4EE5\u5916\uFF09\u306F\u672A\u5BFE\u5FDC\u3067\u3059");
        path.push(`M${num(x - r)} ${num(y)}A${num(r)} ${num(r)} 0 1 0 ${num(x + r)} ${num(y)}A${num(r)} ${num(r)} 0 1 0 ${num(x - r)} ${num(y)}Z`);
      },
      setLineDash(d) {
        st.dash = Array.from(d);
      },
      fill() {
        if (path.length) emit(`<path d="${path.join("")}" ${fillAttrs()}/>`);
      },
      stroke() {
        if (path.length) emit(`<path d="${path.join("")}" fill="none" ${strokeAttrs()}/>`);
      },
      fillText(text2, x, y) {
        emit(`<text ${textAttrs(x, y)} ${fillAttrs()}>${esc(text2)}</text>`);
      },
      strokeText(text2, x, y) {
        emit(`<text ${textAttrs(x, y)} fill="none" ${strokeAttrs()}>${esc(text2)}</text>`);
      },
      measureText(text2) {
        const { size } = parseFont(st.font);
        let em = 0;
        for (const ch of String(text2)) em += charEm(ch);
        return { width: em * size };
      },
      drawImage() {
        throw new Error("SVG \u51FA\u529B: drawImage \u306F\u672A\u5BFE\u5FDC\u3067\u3059");
      },
      /** 完成した SVG 文書 */
      toString() {
        closeGroup();
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
` + body.join("\n") + `
</svg>
`;
      }
    };
    return ctx;
  }

  // js/io/exporter.js
  function wholeMapViewport(map) {
    const w = map.meta.width || 1280;
    const h = map.meta.height || 774;
    const vp = createViewport(w, h);
    vp.resize(w, h);
    vp.fit(0);
    return { vp, w, h };
  }
  function renderMapToCanvas(map, renderOptions, { scale = 2, createCanvas, annotations = DEFAULT_ANNOTATIONS }) {
    const { vp, w, h } = wholeMapViewport(map);
    const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    drawScene(ctx, map, vp, renderOptions, scale);
    drawAnnotations(ctx, map, { w, h, dpr: scale, overlay: renderOptions?.legendKind ?? renderOptions?.overlay, options: annotations });
    return canvas;
  }
  function renderMapToSvg(map, renderOptions, { annotations = DEFAULT_ANNOTATIONS } = {}) {
    const { vp, w, h } = wholeMapViewport(map);
    const ctx = createSvgContext(w, h);
    drawScene(ctx, map, vp, renderOptions, 1);
    drawAnnotations(ctx, map, { w, h, dpr: 1, overlay: renderOptions?.legendKind ?? renderOptions?.overlay, options: annotations });
    return ctx.toString();
  }
  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== "function") {
        reject(new Error("\u3053\u306E\u74B0\u5883\u3067\u306F PNG \u3092\u4F5C\u308C\u307E\u305B\u3093"));
        return;
      }
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("PNG \u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u753B\u50CF\u304C\u5927\u304D\u3059\u304E\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\uFF09")), "image/png");
    });
  }
  function sanitizeFileName(name) {
    const s = String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
    return s.slice(0, 80);
  }
  function exportFileName(map, openedFileName, ext, suffix = "") {
    const fromFile = String(openedFileName ?? "").replace(/\.gz$/i, "").replace(/\.(map|png|svg)$/i, "");
    const base = sanitizeFileName(map?.meta?.name) || sanitizeFileName(fromFile) || "map";
    return `${base}${suffix}.${ext}`;
  }
  function todayString(d = /* @__PURE__ */ new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // js/core/names.js
  var FORM_WORDS = ["\u795E\u8056\u5E1D\u56FD", "\u795E\u8056\u56FD", "\u5E1D\u56FD", "\u738B\u56FD", "\u516C\u56FD", "\u5927\u516C\u56FD", "\u9023\u90A6", "\u5171\u548C\u56FD", "\u9023\u5408", "\u9996\u9577\u56FD", "\u8FBA\u5883\u4F2F\u9818", "\u4F2F\u9818", "\u4FAF\u56FD", "\u795E\u6A29\u56FD", "\u81EA\u6CBB\u9818", "\u9818"];
  var FORM_RE = new RegExp(`(${FORM_WORDS.join("|")})$`);
  function officialName(e, fallback = "") {
    if (!e) return fallback;
    return e.fullName && String(e.fullName).trim() || e.name || fallback;
  }
  function shortNameFrom(fullName) {
    const t = String(fullName ?? "").trim();
    const s = t.replace(FORM_RE, "").trim();
    return s || t;
  }

  // js/core/sim/war-engine.js
  var clamp2 = (v, a, b) => Math.min(b, Math.max(a, v));
  var isLive3 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var LAND = ["infantry", "cavalry", "archers", "artillery", "armor", "special", "advanced"];
  var AIR = ["air"];
  var SEA = ["navy"];
  var BASE_MORALE = 70;
  var BASE_SUPPORT = 70;
  var supportOf = (state) => clamp2(state?.support ?? BASE_SUPPORT, 0, 100);
  var WAR_TYPES = Object.freeze({
    limited: {
      key: "limited",
      label: "\u9650\u5B9A\u6226\uFF08\u56FD\u5883\u7D1B\u4E89\uFF09",
      weary: 0.3,
      capitalFall: 0.2,
      lossScale: 0.3,
      popScale: 0.35,
      duration: 0.25,
      scoreScale: 0.4,
      allMuster: false,
      desc: "\u56FD\u5883\u4ED8\u8FD1\u306E\u5C0F\u898F\u6A21\u306A\u885D\u7A81\u3002\u640D\u5BB3\u3082\u671F\u9593\u3082\u5C0F\u3055\u304F\u3001\u8981\u6C42\u3067\u304D\u308B\u3082\u306E\u3082\u5C0F\u3055\u3044\u3002"
    },
    conventional: {
      key: "conventional",
      label: "\u901A\u5E38\u6226",
      weary: 1,
      capitalFall: 1,
      lossScale: 0.75,
      popScale: 1,
      duration: 0.8,
      scoreScale: 0.8,
      allMuster: false,
      desc: "\u62DB\u96C6\u3057\u305F\u90E8\u968A\u3069\u3046\u3057\u306E\u6B63\u898F\u6226\u3002\u6A19\u6E96\u7684\u306A\u640D\u5BB3\u3068\u671F\u9593\u3002"
    },
    total: {
      key: "total",
      label: "\u7DCF\u529B\u6226",
      weary: 0.8,
      capitalFall: 1.3,
      lossScale: 1.2,
      popScale: 1.6,
      duration: 1.3,
      scoreScale: 1,
      allMuster: true,
      desc: "\u56FD\u306E\u3059\u3079\u3066\u3092\u6CE8\u304E\u8FBC\u3080\u3002\u5168\u90E8\u968A\u304C\u53C2\u6226\u3057\u3001\u640D\u5BB3\u3082\u6C11\u9593\u306E\u88AB\u5BB3\u3082\u5927\u304D\u3044\u3002\u5168\u9762\u964D\u4F0F\u307E\u3067\u8981\u6C42\u3067\u304D\u308B\u3002"
    },
    asymmetric: {
      key: "asymmetric",
      label: "\u975E\u5BFE\u79F0\u6226\uFF08\u30B2\u30EA\u30E9\u30FB\u5360\u9818\u6226\uFF09",
      weary: 1.4,
      capitalFall: 0,
      lossScale: 0.9,
      popScale: 1.3,
      duration: 2.2,
      scoreScale: 0.5,
      allMuster: false,
      desc: "\u5F31\u3044\u5074\u304C\u5730\u5F62\u3068\u6C11\u8846\u3092\u76FE\u306B\u30B2\u30EA\u30E9\u6226\u3092\u884C\u3046\u3002\u5F37\u3044\u5074\u306F\u5236\u7A7A\u30FB\u5236\u6D77\u304C\u52B9\u304D\u306B\u304F\u304F\u3001\u58EB\u6C17\u304C\u9577\u671F\u3067\u524A\u3089\u308C\u308B\u3002\u6C7A\u7740\u304C\u3064\u304D\u306B\u304F\u304F\u3001\u9577\u5F15\u304F\u3002"
    }
  });
  var warTypeOf = (key) => WAR_TYPES[key] ?? WAR_TYPES.conventional;
  var doctrineOf = (state) => DOCTRINE_BY_KEY[state?.doctrine] ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE];
  var moraleOf = (state) => clamp2(state?.morale ?? BASE_MORALE, 0, 100);
  function mobilized(state, muster) {
    const all = regimentsOf(state);
    const sel = muster?.[state.i];
    return Array.isArray(sel) ? all.filter((r) => sel.includes(r.i)) : all;
  }
  function sumUnits(state, keys, regs) {
    const dm = doctrineOf(state).mult, tm = stateTypeMult(state.type);
    let n = 0;
    for (const r of regs) for (const k of keys) {
      const def = UNIT_BY_KEY[k];
      if (!def) continue;
      n += (r.u?.[k] ?? 0) * ((def.soft + def.hard) / 2) * (dm[k] ?? 1) * (tm[k] ?? 1);
    }
    return n;
  }
  function nationStrength(state, muster = null) {
    const regs = mobilized(state, muster);
    const tech = clamp2(state.techLevel ?? 3, 1, 10);
    const m = (0.7 + tech * 0.08) * (0.8 + Math.min(1.2, (state.industry ?? 0) / 500));
    return {
      land: sumUnits(state, LAND, regs) * m,
      sea: sumUnits(state, SEA, regs) * m,
      air: sumUnits(state, AIR, regs) * m,
      manpower: regs.reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0),
      morale: moraleOf(state) * (0.8 + 0.2 * supportOf(state) / 100),
      // 民意が低いほど、士気は実際には振るわない
      support: supportOf(state)
    };
  }
  function sideStrength(map, ids2, muster = null) {
    const out = { land: 0, sea: 0, air: 0, manpower: 0, morale: 0, support: 0 };
    let wm = 0;
    for (const id of ids2) {
      const st = map.pack.states[id];
      if (!isLive3(st)) continue;
      const s = nationStrength(st, muster);
      out.land += s.land;
      out.sea += s.sea;
      out.air += s.air;
      out.manpower += s.manpower;
      out.morale += s.morale * Math.max(1, s.manpower);
      out.support += s.support * Math.max(1, s.manpower);
      wm += Math.max(1, s.manpower);
    }
    out.morale = wm ? out.morale / wm : BASE_MORALE;
    out.support = wm ? out.support / wm : BASE_SUPPORT;
    return out;
  }
  function compareSides(a, b) {
    const share = (x, y) => x + y <= 0 ? 0.5 : x / (x + y);
    return { land: share(a.land, b.land), sea: share(a.sea, b.sea), air: share(a.air, b.air), morale: share(a.morale, b.morale), support: share(a.support ?? BASE_SUPPORT, b.support ?? BASE_SUPPORT) };
  }
  function sideDoctrine(map, ids2) {
    const acc = { attack: 0, defense: 0, noise: 0, ownLoss: 0, enemyLoss: 0, speed: 0, moraleHit: 0 };
    let w = 0;
    for (const id of ids2) {
      const st = map.pack.states[id];
      if (!isLive3(st)) continue;
      const wt = Math.max(1, regimentsOf(st).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0)), d = doctrineOf(st).war ?? {};
      for (const k of Object.keys(acc)) acc[k] += (d[k] ?? (k === "noise" || k === "ownLoss" || k === "enemyLoss" || k === "speed" || k === "moraleHit" ? 1 : 0)) * wt;
      w += wt;
    }
    if (!w) return { attack: 0, defense: 0, noise: 1, ownLoss: 1, enemyLoss: 1, speed: 1, moraleHit: 1 };
    for (const k of Object.keys(acc)) acc[k] /= w;
    return acc;
  }
  function edgeOf(cmp, atk, def) {
    const score = 0.5 * cmp.land + 0.2 * cmp.air + 0.15 * cmp.sea + 0.15 * cmp.morale;
    return 0.6 * (score - 0.5 + (cmp.air - 0.5) * 0.1) + (atk.attack - def.defense) * 0.5;
  }
  function verdictOf(edge, band = 0.03) {
    const winner = Math.abs(edge) < band ? "stalemate" : edge > 0 ? "attacker" : "defender";
    return { winner, decisiveness: clamp2(Math.abs(edge) * 2, 0, 1) };
  }
  function previewWar(map, attackers, defenders, muster = null) {
    const A = sideStrength(map, attackers, muster), D = sideStrength(map, defenders, muster);
    return { aStrength: A, dStrength: D, compare: compareSides(A, D) };
  }
  function resolveWar(map, attackers, defenders, rnd, muster = null, type = "conventional") {
    const T = warTypeOf(type);
    const m = T.allMuster ? null : muster;
    const { aStrength: A, dStrength: D, compare: cmp } = previewWar(map, attackers, defenders, m);
    const da = sideDoctrine(map, attackers), dd = sideDoctrine(map, defenders);
    const noiseAmp = 0.24 * ((da.noise + dd.noise) / 2) * (T.key === "asymmetric" ? 1.5 : 1);
    const lopsided = 1 - 0.7 * Math.pow(2 * cmp.land - 1, 2);
    const noise = rnd.float(-noiseAmp * lopsided, noiseAmp * lopsided);
    let edge = edgeOf(cmp, da, dd) + noise;
    let strongIsAttacker = A.land >= D.land;
    if (T.key === "asymmetric") {
      const weakIds = strongIsAttacker ? defenders : attackers;
      const h = map.geometry?.pack?.h, st = map.pack.cells.state;
      let tot = 0, rough = 0;
      if (h) {
        for (let i = 0; i < st.length; i++) if (weakIds.includes(st[i])) {
          tot++;
          if (h[i] >= 55) rough++;
        }
      }
      const guerrilla = 0.012 + 0.05 * (tot ? rough / tot : 0);
      const gap = Math.min(1, Math.abs(2 * cmp.land - 1) * 3);
      edge = edge * 0.7 + (strongIsAttacker ? -guerrilla : guerrilla) * gap;
    }
    const verdict = verdictOf(edge, T.key === "asymmetric" ? 0.05 : 0.015);
    const { winner, decisiveness } = verdict;
    const base = (0.12 + (1 - decisiveness) * 0.12) * T.lossScale;
    const lossFor = (isWinner) => clamp2(isWinner ? base * 0.5 : base * (1 + decisiveness), 0.02, 0.6);
    const aBase = winner === "stalemate" ? base : lossFor(winner === "attacker");
    const dBase = winner === "stalemate" ? base : lossFor(winner === "defender");
    const asym = T.key === "asymmetric";
    const aMul = asym ? strongIsAttacker ? 1.2 : 0.6 : 1, dMul = asym ? strongIsAttacker ? 0.6 : 1.2 : 1;
    const aLoss = clamp2(aBase * da.ownLoss * dd.enemyLoss * aMul, 0.02, 0.6), dLoss = clamp2(dBase * dd.ownLoss * da.enemyLoss * dMul, 0.02, 0.6);
    const losses = {}, casualties = {}, moraleDelta = {}, popLossShare = {};
    const apply = (ids2, frac, won, side) => {
      const isStrong = side === "attacker" === strongIsAttacker;
      for (const id of ids2) {
        const st = map.pack.states[id];
        if (!isLive3(st)) continue;
        const before = mobilized(st, m).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0);
        losses[id] = frac;
        casualties[id] = { before, lost: Math.round(before * frac) };
        const hit = doctrineOf(st).war?.moraleHit ?? 1;
        let md = winner === "stalemate" ? -Math.round(6 * hit) : won ? Math.round(4 + 6 * decisiveness) : -Math.round((8 + 24 * decisiveness) * hit);
        if (asym && isStrong) md -= 10;
        moraleDelta[id] = md;
        popLossShare[id] = clamp2((frac * 0.15 + (won ? 0 : decisiveness * 0.04) + (side === "defender" ? 0.01 : 0)) * T.popScale * (asym && !isStrong ? 1.4 : 1), 0, 0.35);
      }
    };
    apply(attackers, aLoss, winner === "attacker", "attacker");
    apply(defenders, dLoss, winner === "defender", "defender");
    const dominance = clamp2(Math.abs(edge) * 6, 0, 1);
    const warScore = winner === "stalemate" ? 0 : Math.round(clamp2(100 * (0.15 + 0.85 * dominance) * T.scoreScale, 5, 100));
    return { winner, decisiveness, dominance, warScore, type: T.key, compare: cmp, aStrength: A, dStrength: D, noise, losses, casualties, moraleDelta, popLossShare, doctrine: { attacker: da, defender: dd } };
  }
  function applyVictoryConditions(map, result, { attackers, defenders, type, supportDelta, rnd }) {
    const T = warTypeOf(type);
    let { winner, warScore } = result;
    const moraleDelta = { ...result.moraleDelta };
    const winners = winner === "defender" ? defenders : attackers, losers = winner === "defender" ? attackers : defenders;
    let victory = { type: winner === "stalemate" ? "stalemate" : "superiority", text: winner === "stalemate" ? "\u6C7A\u7740\u3064\u304B\u305A\uFF08\u81A0\u7740\uFF09" : "\u6226\u529B\u30FB\u58EB\u6C17\u306E\u512A\u4F4D\u306B\u3088\u308B\u52DD\u5229" };
    let capitalFall = null, durationFactor = 1;
    const finalSupport = (id) => supportOf(map.pack.states[id]) + (supportDelta?.[id] ?? 0);
    if (winner !== "stalemate") {
      const dom = result.dominance ?? result.decisiveness;
      const dist = distanceFrom(map, losers, winners);
      const maxD = Math.max(1, ...dist.values());
      let best = null;
      for (const L of losers) {
        const cap = map.pack.burgs[map.pack.states[L]?.capital];
        if (!cap || cap.removed) continue;
        const d = dist.get(cap.cell);
        if (d == null) continue;
        const p = clamp2((0.05 + dom * 0.75 - 0.45 * (d / maxD)) * T.capitalFall, 0, 0.85);
        if (rnd.next() < p && (!best || d < best.d)) best = { d, stateId: L, burgId: cap.i, place: cap.name };
      }
      if (best) {
        capitalFall = { stateId: best.stateId, burgId: best.burgId, place: best.place };
        victory = { type: "capital", text: `\u9996\u90FD${best.place}\u306E\u9665\u843D\u306B\u3088\u308B\u6C7A\u5B9A\u7684\u52DD\u5229`, stateId: best.stateId, burgId: best.burgId };
        warScore = clamp2(warScore + 25, 5, 100);
        moraleDelta[best.stateId] = (moraleDelta[best.stateId] ?? 0) - 20;
        durationFactor = 0.75;
      } else {
        const frac = Math.max(...losers.map((L) => result.casualties?.[L] && result.casualties[L].before > 0 ? result.casualties[L].lost / result.casualties[L].before : 0));
        if (frac >= 0.3 && result.decisiveness >= 0.4) {
          victory = { type: "attrition", text: "\u6557\u8005\u306E\u5175\u529B\u304C\u58CA\u6EC5\u3057\u305F\uFF08\u52D5\u54E1\u5175\u529B\u306E3\u5272\u4EE5\u4E0A\u3092\u55AA\u5931\uFF09" };
          warScore = clamp2(warScore + 10, 5, 100);
        }
      }
    } else {
      const weary = (ids2) => ids2.filter((id) => finalSupport(id) <= 15);
      const aw = weary(attackers).length > 0, dw = weary(defenders).length > 0;
      if (aw !== dw) {
        winner = aw ? "defender" : "attacker";
        victory = { type: "exhaustion", text: `${aw ? "\u653B\u6483\u5074" : "\u9632\u885B\u5074"}\u306E\u6C11\u610F\u304C\u5C3D\u304D\u3001\u6226\u4E89\u3092\u7D9A\u3051\u3089\u308C\u306A\u304F\u306A\u3063\u305F` };
        warScore = Math.round(25 * T.scoreScale + 5);
      }
    }
    return { victory, capitalFall, winner, warScore, moraleDelta, durationFactor };
  }
  function planSupportDeltas(result, { attackers, defenders, months, type }) {
    const T = warTypeOf(type), out = {};
    const strongIsAttacker = (result.aStrength?.land ?? 0) >= (result.dStrength?.land ?? 0);
    for (const [ids2, side] of [[attackers, "attacker"], [defenders, "defender"]]) {
      for (const id of ids2) {
        const lost = result.losses?.[id] ?? 0;
        let d = -(lost * (side === "attacker" ? 55 : 50) + months * (side === "attacker" ? 0.3 : 0.18) * T.weary);
        if (side === "defender") d += 6;
        if (T.key === "asymmetric" && side === "attacker" === strongIsAttacker) d -= months * 0.35;
        if (result.winner === side) d += 8;
        out[id] = Math.round(d);
      }
    }
    return out;
  }
  function reevaluateWar(map, war) {
    const r = war.result;
    if (!r) return null;
    const { aStrength: A, dStrength: D, compare } = previewWar(map, war.attackers, war.defenders, war.muster && Object.keys(war.muster).length ? war.muster : null);
    const edge = edgeOf(compare, r.doctrine?.attacker ?? sideDoctrine(map, war.attackers), r.doctrine?.defender ?? sideDoctrine(map, war.defenders)) + (r.noise ?? 0);
    return { ...r, ...verdictOf(edge, r.type === "asymmetric" ? 0.05 : 0.015), compare, aStrength: A, dStrength: D };
  }
  function applyLossFraction(units, fraction) {
    const out = { ...units };
    for (const k of UNIT_KEYS) if (k !== "nuclear") out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
    return out;
  }
  function distanceFrom(map, ownerIds, targetIds, maxDepth = 40) {
    const nb = map.geometry?.pack?.cells?.c, st = map.pack.cells.state;
    const dist = /* @__PURE__ */ new Map(), q = [];
    if (!nb) return dist;
    const enemy = new Set(targetIds);
    for (let i = 0; i < st.length; i++) if (enemy.has(st[i])) {
      dist.set(i, 0);
      q.push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], d = dist.get(k);
      if (d >= maxDepth) continue;
      for (const j of nb[k] ?? []) if (!dist.has(j)) {
        dist.set(j, d + 1);
        q.push(j);
      }
    }
    const out = /* @__PURE__ */ new Map();
    for (let i = 0; i < st.length; i++) if (ownerIds.includes(st[i]) && dist.has(i)) out.set(i, dist.get(i));
    return out;
  }
  function frontBurgs(map, stateIds, enemyIds) {
    const dist = distanceFrom(map, stateIds, enemyIds);
    const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && stateIds.includes(b.state));
    return burgs.map((b) => ({ b, d: dist.get(b.cell) ?? 999 })).sort((x, y) => x.d - y.d || x.b.i - y.b.i).map((x) => x.b);
  }
  function burgIsCoastal(map, b) {
    const nb = map.geometry?.pack?.cells?.c, bio = map.pack.cells.biome;
    return !!nb && (nb[b.cell] ?? []).some((j) => bio[j] === 0);
  }
  var ROMAN = ["", "\u7B2C\u4E00\u6B21", "\u7B2C\u4E8C\u6B21", "\u7B2C\u4E09\u6B21", "\u7B2C\u56DB\u6B21", "\u7B2C\u4E94\u6B21", "\u7B2C\u516D\u6B21", "\u7B2C\u4E03\u6B21", "\u7B2C\u516B\u6B21", "\u7B2C\u4E5D\u6B21"];
  function nameWar(map, { attackers, defenders, rnd, existingNames = [], battles = [], type = "conventional" }) {
    const total = attackers.length + defenders.length;
    const liveCount = map.pack.states.filter(isLive3).length;
    const worldScale = total >= 5 || total >= 4 && total >= Math.ceil(liveCount * 0.6);
    let base;
    if (worldScale) {
      const used = existingNames.filter((n) => /^第.+次世界大戦/.test(n)).length;
      base = `${ROMAN[Math.min(used + 1, 9)]}\u4E16\u754C\u5927\u6226`;
    } else {
      const key = battles.length ? battles[battles.length - 1] : null;
      const burg = key?.burgId ? map.pack.burgs[key.burgId] : null;
      const place = key?.place ?? pickPlace(map, defenders[0], rnd) ?? officialName(map.pack.states[defenders[0]], "\u56FD\u5883");
      const isCapital = burg && [...attackers, ...defenders].some((id) => map.pack.states[id]?.capital === burg.i);
      const kinds = [];
      if (type === "asymmetric") kinds.push(`${place}\u7D1B\u4E89`, `${place}\u6383\u8A0E\u6226`);
      else if (type === "limited") kinds.push(`${place}\u56FD\u5883\u7D1B\u4E89`, `${place}\u306E\u6226\u3044`);
      else {
        kinds.push(`${place}\u6226\u4E89`, `${place}\u306E\u6226\u3044`);
        if (isCapital) kinds.push(`${place}\u5305\u56F2\u6226`, `${place}\u653B\u7565\u6226`);
        if (burg && burgIsCoastal(map, burg)) kinds.push(`${place}\u4E0A\u9678\u4F5C\u6226`);
      }
      base = isCapital && type !== "asymmetric" && type !== "limited" ? rnd.pick([`${place}\u5305\u56F2\u6226`, `${place}\u6226\u4E89`]) : rnd.pick(kinds);
    }
    let name = base, k = 2;
    while (existingNames.includes(name)) name = `${base}\uFF08${k++}\uFF09`;
    return name;
  }
  function pickPlace(map, stateId, rnd) {
    const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && b.state === stateId);
    return burgs.length ? rnd.pick(burgs).name : null;
  }
  var DOCTRINE_STORY = {
    mobile: { win: ["\u6A5F\u7532\u90E8\u968A\u304C\u524D\u7DDA\u3092\u7A81\u7834\u3057\u3001\u5F8C\u65B9\u306E\u62E0\u70B9\u3092\u62BC\u3055\u3048\u305F", "\u822A\u7A7A\u652F\u63F4\u306E\u3082\u3068\u5FEB\u901F\u90E8\u968A\u304C\u6575\u306E\u5074\u9762\u3092\u56DE\u308A\u8FBC\u3093\u3060"], lose: ["\u7A81\u51FA\u3057\u305F\u6A5F\u52D5\u90E8\u968A\u304C\u88DC\u8DB3\u3055\u308C\u3001\u62BC\u3057\u623B\u3055\u308C\u305F"] },
    firepower: { win: ["\u96C6\u4E2D\u7832\u6483\u3067\u9632\u5FA1\u7DDA\u3092\u7C89\u7815\u3057\u3001\u524D\u9032\u3057\u305F", "\u7832\u5175\u306E\u5727\u5012\u7684\u306A\u706B\u529B\u3067\u6575\u9663\u5730\u3092\u5236\u5727\u3057\u305F"], lose: ["\u7832\u6483\u306F\u6C7A\u5B9A\u6253\u306B\u306A\u3089\u305A\u3001\u524D\u9032\u3092\u963B\u307E\u308C\u305F"] },
    battleplan: { win: ["\u69CB\u7BC9\u3057\u305F\u9663\u5730\u3067\u6575\u306E\u653B\u52E2\u3092\u98DF\u3044\u6B62\u3081\u3001\u53CD\u6483\u306B\u8EE2\u3058\u305F", "\u7E26\u6DF1\u9632\u5FA1\u3067\u653B\u3081\u624B\u3092\u6D88\u8017\u3055\u305B\u305F"], lose: ["\u56FA\u3081\u305F\u9663\u5730\u3092\u8FC2\u56DE\u3055\u308C\u3001\u5F8C\u9000\u3092\u5F37\u3044\u3089\u308C\u305F"] },
    massassault: { win: ["\u5927\u5175\u529B\u3092\u6CE2\u72B6\u306B\u6295\u5165\u3057\u3001\u640D\u5BB3\u3092\u3044\u3068\u308F\u305A\u7A81\u7834\u3057\u305F", "\u6570\u306E\u512A\u4F4D\u3067\u6575\u3092\u62BC\u3057\u5207\u3063\u305F"], lose: ["\u5927\u91CF\u306E\u640D\u8017\u3092\u51FA\u3057\u3001\u653B\u52E2\u306F\u9813\u632B\u3057\u305F"] },
    balanced: { win: ["\u5404\u5175\u79D1\u3092\u9023\u643A\u3055\u305B\u3001\u5805\u5B9F\u306B\u52DD\u5229\u3057\u305F", "\u5747\u8861\u306E\u53D6\u308C\u305F\u904B\u7528\u3067\u512A\u4F4D\u3092\u4FDD\u3063\u305F"], lose: ["\u6C7A\u3081\u624B\u3092\u6B20\u304D\u3001\u5F8C\u9000\u3057\u305F"] }
  };
  function generateBattleLog(map, { attackers, defenders, result, startedAt, durationMonths, capitalFall = null }, rnd, addMonths2) {
    const n = clamp2(Math.round(2 + Math.log10(1 + (result.aStrength.manpower + result.dStrength.manpower)) * 1.1 + durationMonths / 8), 2, 9);
    const winnerSide = result.winner === "defender" ? "defender" : "attacker";
    const pWin = result.winner === "stalemate" ? 0.5 : clamp2(0.55 + result.decisiveness * 0.35, 0.55, 0.9);
    const defenderFront = frontBurgs(map, defenders, attackers), attackerFront = frontBurgs(map, attackers, defenders);
    const depthReach = result.winner === "attacker" ? clamp2(0.35 + result.decisiveness * 0.65, 0.3, 1) : 0.3;
    const log = [];
    const used = /* @__PURE__ */ new Set();
    for (let i = 0; i < n; i++) {
      const prog = n === 1 ? 1 : i / (n - 1);
      const side = rnd.next() < pWin ? winnerSide : winnerSide === "attacker" ? "defender" : "attacker";
      const wId = rnd.pick(side === "attacker" ? attackers : defenders), lId = rnd.pick(side === "attacker" ? defenders : attackers);
      const counter = result.winner === "defender" && prog > 0.65;
      const pool = counter ? attackerFront : defenderFront;
      const maxIdx = Math.max(0, Math.floor((pool.length - 1) * (counter ? 0.4 : depthReach) * (0.15 + 0.85 * prog)));
      let burg = null;
      for (let t2 = 0; t2 < 6 && !burg; t2++) {
        const c = pool[Math.min(maxIdx, Math.floor(rnd.next() * (maxIdx + 1)))];
        if (c && !used.has(c.i)) burg = c;
      }
      if (!burg) burg = pool.find((c) => !used.has(c.i)) ?? null;
      if (!burg && pool.length) burg = pool[Math.min(maxIdx, Math.floor(rnd.next() * (maxIdx + 1)))];
      if (burg) used.add(burg.i);
      const place = burg?.name ?? officialName(map.pack.states[counter ? attackers[0] : defenders[0]], "\u56FD\u5883\u5730\u5E2F");
      const dk = doctrineOf(map.pack.states[wId]).key;
      const story = DOCTRINE_STORY[dk] ?? DOCTRINE_STORY.balanced;
      let kind = rnd.pick([`${place}\u306E\u6226\u3044`, `${place}\u4F1A\u6226`, `${place}\u653B\u9632\u6226`]);
      for (let k = 2; log.some((x) => x.name === kind); k++) kind = `\u7B2C${k}\u6B21${place}\u306E\u6226\u3044`;
      const t = Math.min(durationMonths, Math.max(0, Math.round((i + 1) / (n + 1) * durationMonths)));
      log.push({
        date: addMonths2(startedAt, t),
        name: kind,
        place,
        burgId: burg?.i ?? null,
        winner: side,
        attackerState: attackers[0],
        defenderState: defenders[0],
        winnerState: wId,
        loserState: lId,
        text: `${officialName(map.pack.states[wId])}\u8ECD\uFF1A${rnd.pick(story.win)}\uFF08${officialName(map.pack.states[lId])}\u8ECD\uFF1A${rnd.pick((DOCTRINE_STORY[doctrineOf(map.pack.states[lId]).key] ?? DOCTRINE_STORY.balanced).lose)}\uFF09`
      });
    }
    if (capitalFall) {
      const w = result.winner === "defender" ? defenders : attackers, l = capitalFall.stateId;
      log.push({
        date: addMonths2(startedAt, durationMonths),
        name: `${capitalFall.place}\u306E\u9665\u843D`,
        place: capitalFall.place,
        burgId: capitalFall.burgId,
        winner: result.winner,
        attackerState: attackers[0],
        defenderState: defenders[0],
        winnerState: w[0],
        loserState: l,
        text: `${officialName(map.pack.states[w[0]])}\u8ECD\u304C${officialName(map.pack.states[l])}\u306E\u9996\u90FD${capitalFall.place}\u3092\u653B\u7565\u3057\u3001${officialName(map.pack.states[l])}\u306F\u964D\u4F0F\u3092\u8FEB\u3089\u308C\u305F`
      });
    }
    return log;
  }

  // js/core/sim/currency.js
  var isLive4 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var clamp3 = (v, a, b) => Math.min(b, Math.max(a, v));
  function defaultCurrency(state) {
    return { name: `${state.name}\u901A\u8CA8`, code: String(state.name ?? "XXX").slice(0, 3).toUpperCase(), regime: "floating", pegTo: null, rate: 1 };
  }
  function fundamentalValue(state) {
    const pop = (state.rural ?? 0) + (state.urban ?? 0);
    const ind = state.industry ?? 0;
    const tech = clamp3(state.techLevel ?? 3, 1, 10);
    return Math.max(0.01, Math.log10(10 + ind) * (0.6 + tech * 0.08) * (1 + Math.log10(10 + pop) / 20));
  }
  function getCurrency(state) {
    return state.currency ?? defaultCurrency(state);
  }
  function convert(map, fromId, toId, amount) {
    const f = getCurrency(map.pack.states[fromId]), t = getCurrency(map.pack.states[toId]);
    return amount * f.rate / Math.max(1e-9, t.rate);
  }
  function exchangeRate(map, fromId, toId) {
    return convert(map, fromId, toId, 1);
  }
  function planSetCurrency(map, stateId, patch) {
    const st = map.pack.states[stateId];
    if (!isLive4(st)) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const cur = { ...getCurrency(st), ...patch };
    if (!["floating", "pegged"].includes(cur.regime)) throw new Error("\u76F8\u5834\u5236\u306F floating \u304B pegged \u3067\u3059");
    if (cur.regime === "pegged") {
      if (cur.pegTo == null || cur.pegTo === stateId || !isLive4(map.pack.states[cur.pegTo])) throw new Error("\u56FA\u5B9A\u76F8\u5834\u306B\u3059\u308B\u306B\u306F\u3001\u57FA\u6E96\u306B\u3059\u308B\u5225\u306E\u56FD\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
      if (getCurrency(map.pack.states[cur.pegTo]).pegTo === stateId) throw new Error("\u304A\u4E92\u3044\u3092\u57FA\u6E96\u306B\u3059\u308B\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093");
      cur.rate = getCurrency(map.pack.states[cur.pegTo]).rate;
    } else cur.pegTo = null;
    return makeCommand(`\u901A\u8CA8\u306E\u8A2D\u5B9A\uFF08${st.name}\uFF09`, [], [setProps(st, { currency: cur })]);
  }
  function ratesParts(map, rnd) {
    const parts = [];
    const live3 = map.pack.states.filter(isLive4);
    const fund = new Map(live3.map((s) => [s.i, fundamentalValue(s)]));
    const mean = [...fund.values()].reduce((a, b) => a + b, 0) / Math.max(1, fund.size);
    const next = /* @__PURE__ */ new Map();
    for (const s of live3) {
      const c = getCurrency(s);
      if (c.regime === "floating") {
        const target = fund.get(s.i) / mean;
        const pull = (target - c.rate) * 0.25;
        const shock = c.rate * rnd.float(-0.06, 0.06);
        next.set(s.i, Math.max(0.01, Math.round((c.rate + pull + shock) * 1e4) / 1e4));
      }
    }
    for (const s of live3) {
      const c = getCurrency(s);
      let rate = next.get(s.i);
      if (c.regime === "pegged") rate = next.get(c.pegTo) ?? getCurrency(map.pack.states[c.pegTo] ?? s).rate;
      if (rate != null) {
        const hist = [...c.hist ?? [c.rate], rate].slice(-24);
        parts.push(setProps(s, { currency: { ...c, rate, prev: c.rate, hist } }));
      }
    }
    return parts;
  }

  // js/core/edit/diplomacy.js
  var RELATIONS = Object.freeze([
    { id: "Ally", label: "\u540C\u76DF" },
    { id: "Friendly", label: "\u53CB\u597D" },
    { id: "Neutral", label: "\u4E2D\u7ACB" },
    { id: "Suspicion", label: "\u4E0D\u4FE1" },
    { id: "Rival", label: "\u5BFE\u6297" },
    { id: "Enemy", label: "\u6575\u5BFE\uFF08\u6226\u4E89\uFF09" },
    { id: "Unknown", label: "\u4E0D\u660E" },
    { id: "Vassal", label: "\u5F93\u5C5E\u56FD" },
    { id: "Suzerain", label: "\u5B97\u4E3B\u56FD" }
  ]);
  var LABEL = Object.fromEntries(RELATIONS.map((r) => [r.id, r.label]));
  var INVERSE = { Vassal: "Suzerain", Suzerain: "Vassal" };
  var inverseRelation = (r) => INVERSE[r] ?? r;
  var relationLabel = (r) => LABEL[r] ?? r ?? "";
  var isLive5 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function getRelation(map, a, b) {
    const r = map.pack.states[a]?.diplomacy?.[b];
    return typeof r === "string" && r !== "x" ? r : null;
  }
  function listDiplomacyLog(map) {
    return map.ext?.data?.diplomacyLog ?? [];
  }
  function planSetDiplomacy(map, a, b, relation, date) {
    const states = map.pack.states;
    const A = states[a], B = states[b];
    if (a === b) throw new Error("\u540C\u3058\u56FD\u5BB6\u3069\u3046\u3057\u306E\u95A2\u4FC2\u306F\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093");
    if (!isLive5(A) || !isLive5(B)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    if (!LABEL[relation]) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u95A2\u4FC2\u3067\u3059: ${relation}`);
    const old = getRelation(map, a, b);
    if (old === relation && getRelation(map, b, a) === inverseRelation(relation)) return null;
    const rowA = (A.diplomacy ?? []).slice();
    const rowB = (B.diplomacy ?? []).slice();
    while (rowA.length <= b) rowA.push("x");
    while (rowB.length <= a) rowB.push("x");
    rowA[b] = relation;
    rowB[a] = inverseRelation(relation);
    const parts = [setProps(A, { diplomacy: rowA }), setProps(B, { diplomacy: rowB })];
    const log = states[0]?.diplomacy;
    if (Array.isArray(log)) {
      const from = old ? relationLabel(old) : "\u672A\u8A2D\u5B9A";
      parts.push(setProps(states[0], { diplomacy: [...log, [`\u95A2\u4FC2\u306E\u5909\u66F4\uFF1A${relationLabel(relation)}`, `${A.name}\u3068${B.name}\u306E\u95A2\u4FC2\u304C\u300C${from}\u300D\u304B\u3089\u300C${relationLabel(relation)}\u300D\u306B\u5909\u308F\u3063\u305F`]] }));
    }
    if (date) {
      const before = listDiplomacyLog(map);
      const entry = { year: date.year, month: date.month, a, b, from: old, to: relation };
      parts.push({
        apply: (m) => {
          ensureExt(m).data.diplomacyLog = [...before, entry];
        },
        revert: (m) => {
          const ext = ensureExt(m);
          if (before.length) ext.data.diplomacyLog = before;
          else delete ext.data.diplomacyLog;
        }
      });
    }
    return makeCommand(`\u5916\u4EA4\u95A2\u4FC2\u306E\u5909\u66F4\uFF08${A.name}\u3068${B.name}\uFF09`, [], parts);
  }
  function diplomacyParts(map, pairs, relation) {
    const rows = /* @__PURE__ */ new Map();
    const rowOf = (id) => {
      if (!rows.has(id)) rows.set(id, (map.pack.states[id].diplomacy ?? []).slice());
      return rows.get(id);
    };
    for (const [a, b] of pairs) {
      if (a === b || !isLive5(map.pack.states[a]) || !isLive5(map.pack.states[b])) continue;
      const ra = rowOf(a), rb = rowOf(b);
      while (ra.length <= b) ra.push("x");
      while (rb.length <= a) rb.push("x");
      ra[b] = relation;
      rb[a] = relation;
    }
    return [...rows].map(([id, row]) => setProps(map.pack.states[id], { diplomacy: row }));
  }
  function crossPairs(listA, listB) {
    const out = [];
    for (const a of listA) for (const b of listB) out.push([a, b]);
    return out;
  }
  function simpleRelation(map, a, b) {
    const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
    if (wars.some((w) => w.attackers.includes(a) && w.defenders.includes(b) || w.attackers.includes(b) && w.defenders.includes(a))) return "hostile";
    const va = map.pack.states[a]?.vassal, vb = map.pack.states[b]?.vassal;
    if (va && va.overlord === b && map.pack.states[a] && !map.pack.states[a].removed) return "vassal";
    if (vb && vb.overlord === a && map.pack.states[b] && !map.pack.states[b].removed) return "overlord";
    if ((map.ext?.data?.alliances ?? []).some((al) => !al.dissolvedAt && al.members.includes(a) && al.members.includes(b))) return "alliance";
    return "none";
  }
  var SIMPLE_LABEL = Object.freeze({ alliance: "\u540C\u76DF", hostile: "\u6575\u5BFE", none: "\u4E2D\u7ACB", vassal: "\u5F93\u5C5E", overlord: "\u5B97\u4E3B" });

  // js/core/edit/vassals.js
  var isLive6 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var VASSAL_KINDS = Object.freeze([
    { key: "puppet", label: "\u5080\u5121", tribute: 0.2, joinsOffensive: true, desc: "\u5B97\u4E3B\u56FD\u306E\u6226\u4E89\u306B\u5FC5\u305A\u5F93\u3046\u3002\u8CA2\u7D0D\u304C\u91CD\u3044\u3002" },
    { key: "protectorate", label: "\u4FDD\u8B77\u56FD", tribute: 0.08, joinsOffensive: false, desc: "\u5B97\u4E3B\u56FD\u304C\u5B88\u308B\u3002\u5B97\u4E3B\u56FD\u304C\u653B\u3081\u308B\u6226\u4E89\u306B\u306F\u52A0\u308F\u3089\u305A\u3001\u5B88\u308B\u6226\u4E89\u306B\u306F\u53C2\u6226\u3059\u308B\u3002" },
    { key: "vassal", label: "\u5C5E\u56FD", tribute: 0.12, joinsOffensive: true, desc: "\u5185\u653F\u306F\u4FDD\u3064\u304C\u3001\u5B97\u4E3B\u56FD\u306E\u6226\u4E89\u306B\u5F93\u3044\u3001\u8CA2\u7D0D\u3092\u7D0D\u3081\u308B\u3002" }
  ]);
  var VASSAL_BY_KEY = Object.fromEntries(VASSAL_KINDS.map((k) => [k.key, k]));
  function vassalInfo(map, id) {
    const st = map.pack.states[id], v = st?.vassal;
    if (!v || !isLive6(st) || !isLive6(map.pack.states[v.overlord]) || !VASSAL_BY_KEY[v.kind]) return null;
    return { overlord: v.overlord, kind: v.kind };
  }
  function vassalsOf(map, overlordId) {
    return map.pack.states.filter((s) => isLive6(s) && vassalInfo(map, s.i)?.overlord === overlordId).map((s) => ({ stateId: s.i, kind: s.vassal.kind }));
  }
  function topOverlord(map, id) {
    let cur = id;
    const seen = /* @__PURE__ */ new Set();
    while (!seen.has(cur)) {
      seen.add(cur);
      const v = vassalInfo(map, cur);
      if (!v) break;
      cur = v.overlord;
    }
    return cur;
  }
  function planSetVassal(map, vassalId, overlordId, kind, date) {
    const V = map.pack.states[vassalId], O = map.pack.states[overlordId];
    if (!isLive6(V) || !isLive6(O)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    if (vassalId === overlordId) throw new Error("\u81EA\u56FD\u3092\u5F93\u5C5E\u3055\u305B\u308B\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093");
    if (!VASSAL_BY_KEY[kind]) throw new Error("\u5F93\u5C5E\u306E\u7A2E\u985E\u306F \u5080\u5121\u30FB\u4FDD\u8B77\u56FD\u30FB\u5C5E\u56FD \u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    if (topOverlord(map, overlordId) === vassalId) throw new Error("\u5B97\u4E3B\u56FD\u304C\u3059\u3067\u306B\u76F8\u624B\u306B\u5F93\u5C5E\u3057\u3066\u3044\u307E\u3059\uFF08\u5F93\u5C5E\u95A2\u4FC2\u304C\u8F2A\u306B\u306A\u308A\u307E\u3059\uFF09");
    const cur = vassalInfo(map, vassalId);
    if (cur && cur.overlord === overlordId && cur.kind === kind) return null;
    const label = VASSAL_BY_KEY[kind].label;
    return makeCommand(`${label}\u306B\u3059\u308B\uFF08${officialName(V)} \u2192 ${officialName(O)}\uFF09`, [], [setProps(V, { vassal: { overlord: overlordId, kind, since: date ?? null } })]);
  }
  function planReleaseVassal(map, vassalId) {
    const V = map.pack.states[vassalId];
    if (!isLive6(V) || !vassalInfo(map, vassalId)) throw new Error("\u5F93\u5C5E\u3057\u3066\u3044\u306A\u3044\u56FD\u3067\u3059");
    return makeCommand(`\u72EC\u7ACB\u3055\u305B\u308B\uFF08${officialName(V)}\uFF09`, [], [setProps(V, { vassal: null })]);
  }
  function tributeParts(map, getTreasury, convert2) {
    const parts = [];
    for (const s of map.pack.states) {
      const v = s && isLive6(s) ? vassalInfo(map, s.i) : null;
      if (!v) continue;
      const rate = VASSAL_BY_KEY[v.kind].tribute, t = Math.max(0, getTreasury(s)), amount = Math.round(t * rate * 100) / 100;
      if (amount <= 0) continue;
      parts.push({ from: s.i, to: v.overlord, amount, received: Math.round(convert2(map, s.i, v.overlord, amount) * 100) / 100 });
    }
    return parts;
  }
  function planTribute(map, getTreasury, convert2) {
    const list = tributeParts(map, getTreasury, convert2);
    if (!list.length) return null;
    const delta = /* @__PURE__ */ new Map();
    for (const t of list) {
      delta.set(t.from, (delta.get(t.from) ?? 0) - t.amount);
      delta.set(t.to, (delta.get(t.to) ?? 0) + t.received);
    }
    const parts = [...delta].map(([id, d]) => setProps(map.pack.states[id], { treasury: Math.round((getTreasury(map.pack.states[id]) + d) * 100) / 100 }));
    return makeCommand("\u5F93\u5C5E\u56FD\u306E\u8CA2\u7D0D", [], parts);
  }

  // js/core/sim/war-flow.js
  var isLive7 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var clamp4 = (v, a, b) => Math.min(b, Math.max(a, v));
  var BONDS = Object.freeze([
    { key: "loose", label: "\u7DE9\u3084\u304B", desc: "\u6226\u4E89\u306B\u5DFB\u304D\u8FBC\u307E\u308C\u306A\u3044\u3002\u8CBF\u6613\u306E\u5C01\u9396\u3082\u5404\u56FD\u306E\u81EA\u7531\u3002" },
    { key: "standard", label: "\u6A19\u6E96", desc: "\u540C\u76DF\u56FD\u304C\u653B\u3081\u3089\u308C\u305F\u3089\u53C2\u6226\u3059\u308B\uFF08\u9632\u885B\u7FA9\u52D9\uFF09\u3002\u653B\u3081\u308B\u6226\u4E89\u306B\u306F\u52A0\u308F\u3089\u306A\u3044\u3002\u76DF\u4E3B\u306E\u6575\u56FD\u3068\u306E\u8CBF\u6613\u3092\u5C01\u9396\u3059\u308B\u3002" },
    { key: "strict", label: "\u5F37\u56FA", desc: "\u653B\u3081\u308B\u6226\u4E89\u306B\u3082\u5B88\u308B\u6226\u4E89\u306B\u3082\u3001\u540C\u76DF\u56FD\u306F\u5FC5\u305A\u53C2\u6226\u3059\u308B\u3002\u8CBF\u6613\u306E\u5C01\u9396\u306B\u3082\u540C\u8ABF\u3059\u308B\u3002" }
  ]);
  var BOND_BY_KEY = Object.fromEntries(BONDS.map((b) => [b.key, b]));
  var bondOf = (a) => BOND_BY_KEY[a?.bond] ? a.bond : "standard";
  var liveAlliances = (map) => (map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt);
  function expandWithAllies(map, attackers, defenders) {
    const A = new Set(attackers), D = new Set(defenders), joined = [];
    for (let round3 = 0; round3 < 4; round3++) {
      let changed = false;
      for (const al of liveAlliances(map)) {
        const bond = bondOf(al);
        if (bond === "loose") continue;
        const members = al.members.filter((m) => isLive7(map.pack.states[m]));
        const inA = members.some((m) => A.has(m)), inD = members.some((m) => D.has(m));
        if (inA && inD) continue;
        const join = (set, side) => {
          for (const m of members) if (!A.has(m) && !D.has(m)) {
            set.add(m);
            joined.push({ id: m, side, alliance: al.name });
            changed = true;
          }
        };
        if (inD) join(D, "defender");
        if (inA && bond === "strict") join(A, "attacker");
      }
      if (!changed) break;
    }
    for (let round3 = 0; round3 < 3; round3++) {
      let changed = false;
      for (const [mine, side, label, offensive] of [[A, "attacker", "\u653B\u6483\u5074", true], [D, "defender", "\u9632\u885B\u5074", false]]) {
        for (const o of [...mine]) for (const v of vassalsOf(map, o)) {
          if (A.has(v.stateId) || D.has(v.stateId)) continue;
          if (offensive && !VASSAL_BY_KEY[v.kind].joinsOffensive) continue;
          mine.add(v.stateId);
          joined.push({ id: v.stateId, side, alliance: `${VASSAL_BY_KEY[v.kind].label}\uFF08\u5B97\u4E3B\u56FD\u306B\u5F93\u3046\uFF09` });
          changed = true;
        }
        if (!offensive) for (const v of [...mine]) {
          const info = vassalInfo(map, v);
          if (info && !A.has(info.overlord) && !D.has(info.overlord)) {
            D.add(info.overlord);
            joined.push({ id: info.overlord, side: "defender", alliance: "\u5B97\u4E3B\u56FD\u3068\u3057\u3066\u5F93\u5C5E\u56FD\u3092\u5B88\u308B" });
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { attackers: [...A], defenders: [...D], joined };
  }
  function addMonths(date, n) {
    const t = date.year * 12 + (date.month - 1) + n;
    return { year: Math.floor(t / 12), month: t % 12 + 1 };
  }
  function estimateDurationMonths(map, attackers, defenders, result, rnd) {
    const ids2 = [...attackers, ...defenders];
    let men = 0;
    for (const id of ids2) for (const r of regimentsOf(map.pack.states[id])) men += forceHeadcount({ ...r.u, nuclear: 0 });
    const scale = Math.log10(1 + men);
    const c = map.pack.cells, h = map.geometry?.pack?.h;
    let total = 0, rough = 0;
    if (h) {
      for (let i = 0; i < c.state.length; i++) if (defenders.includes(c.state[i])) {
        total++;
        if (h[i] >= 55) rough++;
      }
    }
    const terrain = 1 + (total ? rough / total : 0) * 0.8;
    const closeness = 1 + (1 - clamp4(result.decisiveness ?? 0.5, 0, 1)) * 1.2;
    const world = ids2.length >= 5 ? 1.6 : 1;
    const base = (2 + scale * 2.5) * terrain * closeness * world;
    return clamp4(Math.round(base * rnd.float(0.75, 1.25)), 1, 120);
  }
  function stateRelationNone(map, a, b) {
    if (liveAlliances(map).some((al) => al.members.includes(a) && al.members.includes(b))) return false;
    const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
    return !wars.some((w) => w.attackers.includes(a) && w.defenders.includes(b) || w.attackers.includes(b) && w.defenders.includes(a));
  }
  function proposePeaceVenue(map, war, rnd) {
    const belligerents = [...war.attackers, ...war.defenders];
    const stalemate = war.result?.winner === "stalemate";
    const burgs = map.pack.burgs.filter((b2) => b2 && b2.i && !b2.removed && isLive7(map.pack.states[b2.state]));
    let pool = [], role = "winner";
    if (!stalemate && war.result) {
      const winners = war.result.winner === "defender" ? war.defenders : war.attackers;
      pool = burgs.filter((b2) => winners.includes(b2.state));
    } else {
      const neutralStates = new Set(map.pack.states.filter((s) => isLive7(s) && !belligerents.includes(s.i) && belligerents.every((x) => stateRelationNone(map, s.i, x))).map((s) => s.i));
      pool = burgs.filter((b2) => neutralStates.has(b2.state));
      role = "mediator";
    }
    if (!pool.length) {
      pool = burgs.filter((b2) => belligerents.includes(b2.state));
      role = "belligerent";
    }
    if (!pool.length) return null;
    const b = rnd.pick(pool);
    return { burgId: b.i, place: b.name, stateId: b.state, neutral: role === "mediator", role, treatyName: `${b.name}\u6761\u7D04` };
  }
  function peaceImpact(map, loserId, cellGroups, reparations = 0, payerTreasury = null) {
    const loser = map.pack.states[loserId];
    const cells = new Set(cellGroups.flat());
    const total = Math.max(1, loser?.cells ?? 1);
    const share = clamp4(cells.size / total, 0, 1);
    const pop = ((loser?.rural ?? 0) + (loser?.urban ?? 0)) * share;
    const industry = (loser?.industry ?? 0) * share;
    const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && b.state === loserId && cells.has(b.cell)).length;
    return {
      cells: cells.size,
      share,
      population: pop,
      industry,
      burgs,
      reparations,
      reparationsShare: payerTreasury > 0 ? reparations / payerTreasury : null
    };
  }

  // js/core/sim/sanctions.js
  var isLive8 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function blockedPairs(map) {
    const set = /* @__PURE__ */ new Set();
    const add = (x, y) => set.add(x < y ? `${x}-${y}` : `${y}-${x}`);
    const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt);
    const alliances = (map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt && bondOf(a) !== "loose");
    for (const w of wars) {
      for (const x of w.attackers) for (const y of w.defenders) add(x, y);
      for (const al of alliances) {
        const M = al.members.filter((m) => isLive8(map.pack.states[m]));
        for (const [mine, theirs] of [[w.attackers, w.defenders], [w.defenders, w.attackers]]) {
          if (!M.some((m) => mine.includes(m))) continue;
          for (const m of M) if (!w.attackers.includes(m) && !w.defenders.includes(m)) for (const y of theirs) add(m, y);
        }
      }
    }
    return set;
  }
  function isBlockaded(map, a, b, cache = null) {
    const set = cache ?? blockedPairs(map);
    return set.has(a < b ? `${a}-${b}` : `${b}-${a}`);
  }

  // js/core/sim/trade.js
  var GOODS = Object.freeze([
    { id: "grain", label: "\u7A40\u7269", icon: "\u{1F33E}", value: 1, need: 0.55, out: { 4: 0.9, 6: 0.8, 5: 0.6, 3: 0.5, 7: 0.4, 8: 0.1, 12: 0.2 } },
    { id: "livestock", label: "\u5BB6\u755C\u30FB\u8089", icon: "\u{1F411}", value: 1.4, need: 0.25, out: { 4: 0.5, 3: 0.8, 2: 0.2, 10: 0.2, 1: 0.1, 6: 0.2 } },
    { id: "fish", label: "\u9B5A", icon: "\u{1F41F}", value: 1.1, need: 0.12, out: { 12: 0.3 }, coast: 0.8 },
    { id: "timber", label: "\u6728\u6750", icon: "\u{1FAB5}", value: 1.2, need: 0.2, out: { 9: 0.8, 6: 0.7, 7: 0.9, 8: 0.9, 5: 0.5 } },
    { id: "fur", label: "\u6BDB\u76AE", icon: "\u{1F98A}", value: 3, need: 0.05, out: { 9: 0.5, 10: 0.6, 11: 0.1 } },
    { id: "salt", label: "\u5869", icon: "\u{1F9C2}", value: 1.6, need: 0.07, out: { 1: 0.5, 2: 0.3 }, coast: 0.4 },
    { id: "metal", label: "\u9271\u7523\u7269", icon: "\u26CF", value: 2.5, need: 0.1, out: { 1: 0.15, 2: 0.25, 10: 0.2, 9: 0.15, 11: 0.2 } },
    { id: "spice", label: "\u9999\u8F9B\u6599\u30FB\u679C\u5B9F", icon: "\u{1F336}", value: 4, need: 0.03, out: { 5: 0.4, 7: 0.5, 3: 0.1 } },
    { id: "crafts", label: "\u5DE5\u82B8\u54C1", icon: "\u{1F3FA}", value: 4, need: 0.13, craft: true, out: {} }
  ]);
  var GOOD_BY_ID = Object.freeze(Object.fromEntries(GOODS.map((g) => [g.id, g])));
  var TAX_BASE = Object.freeze({
    Monarchy: { salesTax: 0.15, pollTax: 0.2 },
    Theocracy: { salesTax: 0.25, pollTax: 0.1 },
    Union: { salesTax: 0.07, pollTax: 0.13 },
    Republic: { salesTax: 0.05, pollTax: 0.15 },
    Anarchy: { salesTax: 0, pollTax: 0 }
  });
  var FALLBACK_TAX = TAX_BASE.Monarchy;
  var isLive9 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var round22 = (v) => Math.round(v * 100) / 100;
  var clamp012 = (v) => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0));
  function getFinance(state) {
    const base = TAX_BASE[state.form] ?? FALLBACK_TAX;
    return {
      salesTax: typeof state.salesTax === "number" ? clamp012(state.salesTax) : base.salesTax,
      pollTax: typeof state.pollTax === "number" ? clamp012(state.pollTax) : base.pollTax,
      treasury: typeof state.treasury === "number" ? state.treasury : 0
    };
  }
  var clampRate = clamp012;
  function coastalTest(map) {
    const { biome } = map.pack.cells;
    const adj = map.geometry.pack.cells.c;
    return (i) => {
      for (const j of adj[i]) if (biome[j] === 0) return true;
      return false;
    };
  }
  function computeProduction(map) {
    const { biome, state, pop } = map.pack.cells;
    const isCoast = coastalTest(map);
    const sums = /* @__PURE__ */ new Map(), prod = /* @__PURE__ */ new Map();
    for (const s of map.pack.states) if (isLive9(s)) {
      prod.set(s.i, Object.fromEntries(GOODS.map((g) => [g.id, 0])));
      sums.set(s.i, 0);
    }
    for (let i = 0; i < state.length; i++) {
      const sid = state[i];
      if (!prod.has(sid) || biome[i] === 0) continue;
      const p = pop[i] ?? 0;
      if (p <= 0) continue;
      sums.set(sid, sums.get(sid) + p);
      const out = prod.get(sid);
      const coast = isCoast(i);
      for (const g of GOODS) {
        const per = (g.out[biome[i]] ?? 0) + (coast && g.coast ? g.coast : 0);
        if (per) out[g.id] += per * p;
      }
    }
    for (const s of map.pack.states) {
      if (!prod.has(s.i)) continue;
      const out = prod.get(s.i);
      const cellPop = sums.get(s.i);
      const k = cellPop > 0 && typeof s.rural === "number" ? s.rural / cellPop : 1;
      for (const g of GOODS) out[g.id] = round22(out[g.id] * k);
      const tech = typeof s.techLevel === "number" ? s.techLevel : 3;
      out.crafts = round22((s.urban ?? 0) * (0.3 + 0.08 * (tech - 1)));
    }
    return prod;
  }
  function computeDemand(state) {
    const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
    const tech = typeof state.techLevel === "number" ? state.techLevel : 3;
    const d = {};
    for (const g of GOODS) {
      let per = g.need;
      if (g.id === "crafts" || g.id === "metal") per *= 1 + (tech - 3) * 0.12;
      d[g.id] = round22(pop * Math.max(0, per));
    }
    return d;
  }
  var RELATION_FACTOR = { Ally: 1.25, Friendly: 1.1, Neutral: 1, Unknown: 0.8, Suspicion: 0.65, Rival: 0.45, Enemy: 0.15, Vassal: 1.2, Suzerain: 1.2 };
  function stateAdjacency(map) {
    const { state, biome } = map.pack.cells;
    const adj = map.geometry.pack.cells.c;
    const pairs = /* @__PURE__ */ new Set();
    for (let i = 0; i < state.length; i++) {
      if (biome[i] === 0 || !state[i]) continue;
      for (const j of adj[i]) {
        if (biome[j] === 0 || !state[j] || state[j] === state[i]) continue;
        pairs.add(state[i] < state[j] ? `${state[i]}:${state[j]}` : `${state[j]}:${state[i]}`);
      }
    }
    return pairs;
  }
  function atWar(wars, a, b) {
    return wars.some((w) => w.attackers.includes(a) && w.defenders.includes(b) || w.attackers.includes(b) && w.defenders.includes(a));
  }
  function tradeAffinity(map, a, b, ctx) {
    if (atWar(ctx.wars, a, b) || isBlockaded(map, a, b, ctx.blocked)) return 0;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const near = ctx.adjacent.has(key);
    const pa = map.pack.states[a].pole ?? [0, 0], pb = map.pack.states[b].pole ?? [0, 0];
    const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    const base = near ? 1 : 0.2 + 0.5 * Math.exp(-dist / (0.3 * ctx.diag));
    const rel2 = RELATION_FACTOR[getRelation(map, a, b)] ?? 1;
    return Math.min(1.3, base * rel2);
  }
  function computeTrade(map) {
    const wars = activeWars(map);
    const blocked = blockedPairs(map);
    const adjacent = stateAdjacency(map);
    const diag = Math.hypot(map.meta.width || 1280, map.meta.height || 774);
    const ctx = { wars, adjacent, diag, blocked };
    const live3 = map.pack.states.filter(isLive9);
    const production = computeProduction(map);
    const info = /* @__PURE__ */ new Map();
    for (const s of live3) {
      const demand = computeDemand(s);
      const prod = production.get(s.i);
      const net = Object.fromEntries(GOODS.map((g) => [g.id, round22(prod[g.id] - demand[g.id])]));
      info.set(s.i, { production: prod, demand, net, exports: 0, imports: 0, exportValue: 0, importValue: 0, salesTaxRevenue: 0, pollTaxRevenue: 0 });
    }
    const deals = [];
    for (const g of GOODS) {
      const remaining = new Map(live3.filter((s) => info.get(s.i).net[g.id] > 0.01).map((s) => [s.i, info.get(s.i).net[g.id]]));
      const importers = live3.filter((s) => info.get(s.i).net[g.id] < -0.01).sort((a, b) => info.get(a.i).net[g.id] - info.get(b.i).net[g.id]);
      for (const imp of importers) {
        let need = -info.get(imp.i).net[g.id];
        const cands = [...remaining.keys()].map((e) => ({ e, aff: tradeAffinity(map, imp.i, e, ctx), tax: getFinance(map.pack.states[e]).salesTax })).filter((c) => c.aff > 0.05).map((c) => ({ ...c, score: c.aff * (1 - 0.8 * c.tax) })).sort((a, b) => b.score - a.score);
        for (const c of cands) {
          if (need < 0.01) break;
          const left = remaining.get(c.e);
          if (left < 0.01) continue;
          const units = round22(Math.min(left, need * Math.min(1, c.score * 1.1)));
          if (units < 0.01) continue;
          const price = round22(g.value * (1 + 0.15 * (1 - Math.min(1, c.aff))));
          const value = round22(units * price);
          const tax = round22(value * c.tax);
          deals.push({ from: c.e, to: imp.i, good: g.id, units, price, value, tax });
          remaining.set(c.e, round22(left - units));
          need = round22(need - units);
        }
      }
    }
    for (const d of deals) {
      const a = info.get(d.from), b = info.get(d.to);
      a.exports += d.units;
      a.exportValue = round22(a.exportValue + d.value);
      a.salesTaxRevenue = round22(a.salesTaxRevenue + d.tax);
      b.imports += d.units;
      b.importValue = round22(b.importValue + d.value);
    }
    for (const s of live3) {
      const f = getFinance(s);
      info.get(s.i).pollTaxRevenue = round22(f.pollTax * ((s.rural ?? 0) + (s.urban ?? 0)));
    }
    return { states: info, deals };
  }
  function annualRevenue(tradeInfo) {
    return round22(tradeInfo.pollTaxRevenue + tradeInfo.salesTaxRevenue);
  }
  function tradePartners(trade, stateId) {
    const by = /* @__PURE__ */ new Map();
    for (const d of trade.deals) {
      if (d.from !== stateId && d.to !== stateId) continue;
      const p = d.from === stateId ? d.to : d.from;
      const e = by.get(p) ?? { partner: p, exportValue: 0, importValue: 0, goods: /* @__PURE__ */ new Set() };
      if (d.from === stateId) e.exportValue = round22(e.exportValue + d.value);
      else e.importValue = round22(e.importValue + d.value);
      e.goods.add(d.good);
      by.set(p, e);
    }
    return [...by.values()].map((e) => ({ ...e, goods: [...e.goods] })).sort((a, b) => b.exportValue + b.importValue - (a.exportValue + a.importValue));
  }

  // js/core/edit/alliances.js
  var isLive10 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var leaderOf = (a) => a?.members?.includes(a.leader) ? a.leader : a?.members?.[0] ?? null;
  var bondKey = (a) => BOND_BY_KEY[a?.bond] ? a.bond : "standard";
  function listAlliances(map) {
    return map.ext?.data?.alliances ?? [];
  }
  function nextAllianceId(map) {
    const list = listAlliances(map);
    return list.length ? Math.max(...list.map((a) => a.id)) + 1 : 1;
  }
  function planCreateAlliance(map, name, memberIds, date, bond = "standard", leader = null) {
    const uniq = [...new Set(memberIds)];
    if (uniq.length < 2) throw new Error("\u540C\u76DF\u306B\u306F2\u30AB\u56FD\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059");
    for (const id of uniq) if (!isLive10(map.pack.states[id])) throw new Error(`\u56FD\u5BB6#${id}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
    if (!BOND_BY_KEY[bond]) throw new Error("\u540C\u76DF\u306E\u62D8\u675F\u529B\u306F \u7DE9\u3084\u304B\u30FB\u6A19\u6E96\u30FB\u5F37\u56FA \u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    if (leader != null && !uniq.includes(leader)) throw new Error("\u76DF\u4E3B\u306F\u52A0\u76DF\u56FD\u306E\u4E2D\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    const alliance = { id: nextAllianceId(map), name: name || "\u65B0\u3057\u3044\u540C\u76DF", members: uniq, bond, leader: leader ?? uniq[0], formedAt: date ?? null, dissolvedAt: null };
    const pairs = [];
    for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) pairs.push([uniq[i], uniq[j]]);
    const before = listAlliances(map);
    const write = (m, list) => {
      const ext = ensureExt(m);
      ext.data.alliances = list;
      if (!list.length) delete ext.data.alliances;
    };
    return {
      command: makeCommand(`\u540C\u76DF\u3092\u7D50\u6210\uFF08${alliance.name}\uFF09`, [], [{ apply: (m) => write(m, [...before, alliance]), revert: (m) => write(m, before) }, ...diplomacyParts(map, pairs, "Ally")]),
      id: alliance.id
    };
  }
  function planEditAlliance(map, allianceId, patch) {
    const list = listAlliances(map);
    const a = list.find((x) => x.id === allianceId);
    if (!a) throw new Error("\u305D\u306E\u540C\u76DF\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const nextMembers = patch.members ? [...new Set(patch.members)] : a.members;
    if (nextMembers.length < 2) throw new Error("\u540C\u76DF\u306B\u306F2\u30AB\u56FD\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059");
    const nextName = patch.name !== void 0 ? patch.name : a.name;
    const nextBond = patch.bond ?? bondKey(a);
    const nextLeader = nextMembers.includes(patch.leader) ? patch.leader : nextMembers.includes(leaderOf(a)) ? leaderOf(a) : nextMembers[0];
    if (patch.leader != null && !nextMembers.includes(patch.leader)) throw new Error("\u76DF\u4E3B\u306F\u52A0\u76DF\u56FD\u306E\u4E2D\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    if (!BOND_BY_KEY[nextBond]) throw new Error("\u540C\u76DF\u306E\u62D8\u675F\u529B\u306F \u7DE9\u3084\u304B\u30FB\u6A19\u6E96\u30FB\u5F37\u56FA \u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    if (nextName === a.name && nextBond === bondKey(a) && nextLeader === leaderOf(a) && JSON.stringify(nextMembers) === JSON.stringify(a.members)) return null;
    const before = list;
    const after = list.map((x) => x.id === allianceId ? { ...x, name: nextName, members: nextMembers, bond: nextBond, leader: nextLeader } : x);
    const write = (m, v) => {
      ensureExt(m).data.alliances = v;
    };
    return makeCommand("\u540C\u76DF\u3092\u7DE8\u96C6", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function planDissolveAlliance(map, allianceId, date) {
    const list = listAlliances(map);
    const a = list.find((x) => x.id === allianceId);
    if (!a) throw new Error("\u305D\u306E\u540C\u76DF\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (a.dissolvedAt) throw new Error("\u65E2\u306B\u89E3\u6D88\u3055\u308C\u3066\u3044\u307E\u3059");
    const before = list;
    const after = list.map((x) => x.id === allianceId ? { ...x, dissolvedAt: date ?? null } : x);
    const write = (m, v) => {
      ensureExt(m).data.alliances = v;
    };
    return makeCommand("\u540C\u76DF\u3092\u89E3\u6D88", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function alliancesOf(map, stateId) {
    return listAlliances(map).filter((a) => a.members.includes(stateId));
  }

  // js/core/edit/wars.js
  var isLive11 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function listWars(map) {
    return map.ext?.data?.wars ?? [];
  }
  function nextWarId(map) {
    const list = listWars(map);
    return list.length ? Math.max(...list.map((w) => w.id)) + 1 : 1;
  }
  function writeWars(m, list) {
    const ext = ensureExt(m);
    ext.data.wars = list;
    if (!list.length) delete ext.data.wars;
  }
  function activeWars(map) {
    return listWars(map).filter((w) => !w.endedAt);
  }
  function warsOf(map, stateId) {
    return listWars(map).filter((w) => w.attackers.includes(stateId) || w.defenders.includes(stateId));
  }
  function warNameTaken(map, name, exceptId = null) {
    const n = String(name ?? "").trim();
    return !!n && listWars(map).some((w) => w.id !== exceptId && w.name === n);
  }
  function uniqueDefaultName(map, base) {
    if (!warNameTaken(map, base)) return base;
    for (let k = 2; ; k++) {
      const n = `${base}\uFF08\u7B2C${k}\u6B21\uFF09`;
      if (!warNameTaken(map, n)) return n;
    }
  }
  function planDeclareWar(map, { name, attackers, defenders, date }) {
    const a = [...new Set(attackers)], d = [...new Set(defenders)];
    if (!a.length || !d.length) throw new Error("\u653B\u6483\u5074\u30FB\u9632\u5FA1\u5074\u3068\u30821\u30AB\u56FD\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059");
    for (const id of [...a, ...d]) if (!isLive11(map.pack.states[id])) throw new Error(`\u56FD\u5BB6#${id}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
    if (a.some((id) => d.includes(id))) throw new Error("\u540C\u3058\u56FD\u5BB6\u304C\u4E21\u9663\u55B6\u306B\u5165\u3063\u3066\u3044\u307E\u3059");
    const aNames = a.map((id) => map.pack.states[id].name), dNames = d.map((id) => map.pack.states[id].name);
    const explicit = String(name ?? "").trim();
    if (explicit && warNameTaken(map, explicit)) throw new Error(`\u300C${explicit}\u300D\u3068\u3044\u3046\u6226\u4E89\u540D\u306F\u65E2\u306B\u4F7F\u308F\u308C\u3066\u3044\u307E\u3059`);
    const war = {
      id: nextWarId(map),
      name: explicit || uniqueDefaultName(map, `${aNames[0]}\u5BFE${dNames[0]}\u6226\u4E89`),
      attackers: a,
      defenders: d,
      startedAt: date,
      endedAt: null,
      battles: [],
      advantage: {},
      muster: {}
      // 召集する部隊: { [国家ID]: [部隊ID, ...] }（チェックを付けた部隊がこの戦争の戦力）
    };
    const before = listWars(map);
    return { command: makeCommand(`\u5BA3\u6226\u5E03\u544A\uFF08${war.name}\uFF09`, [], [{ apply: (m) => writeWars(m, [...before, war]), revert: (m) => writeWars(m, before) }]), id: war.id };
  }
  function planDeclareAndResolveWar(map, { attackers, defenders, date, rnd, muster = null, type = "conventional" }) {
    const a0 = [...new Set(attackers)], d0 = [...new Set(defenders)];
    if (!a0.length || !d0.length) throw new Error("\u653B\u6483\u5074\u30FB\u9632\u5FA1\u5074\u3068\u30821\u30AB\u56FD\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059");
    for (const id of [...a0, ...d0]) if (!isLive11(map.pack.states[id])) throw new Error(`\u56FD\u5BB6#${id}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
    if (a0.some((id) => d0.includes(id))) throw new Error("\u540C\u3058\u56FD\u5BB6\u304C\u4E21\u9663\u55B6\u306B\u5165\u3063\u3066\u3044\u307E\u3059");
    const T = warTypeOf(type);
    const { attackers: a, defenders: d, joined } = expandWithAllies(map, a0, d0);
    const cleanMuster = {};
    if (!T.allMuster) for (const [sid, ids2] of Object.entries(muster ?? {})) {
      const id = Number(sid);
      if (![...a, ...d].includes(id) || !Array.isArray(ids2)) continue;
      const have = new Set(regimentsOf(map.pack.states[id]).map((r) => r.i));
      cleanMuster[id] = ids2.filter((x) => have.has(x));
    }
    const m = Object.keys(cleanMuster).length ? cleanMuster : null;
    const result = resolveWar(map, a, d, rnd, m, T.key);
    const speed = (result.doctrine.attacker.speed + result.doctrine.defender.speed) / 2;
    let months = Math.max(1, Math.round(estimateDurationMonths(map, a, d, result, rnd) * speed * T.duration));
    const supportDelta = planSupportDeltas(result, { attackers: a, defenders: d, months, type: T.key });
    const vic = applyVictoryConditions(map, result, { attackers: a, defenders: d, type: T.key, supportDelta, rnd });
    if (vic.durationFactor !== 1) months = Math.max(1, Math.round(months * vic.durationFactor));
    result.winner = vic.winner;
    result.warScore = vic.warScore;
    result.moraleDelta = vic.moraleDelta;
    if (vic.winner !== "stalemate" && vic.victory.type === "exhaustion") result.decisiveness = Math.max(result.decisiveness, 0.2);
    const supportDelta2 = planSupportDeltas(result, { attackers: a, defenders: d, months, type: T.key });
    const endsAt = addMonths(date, months);
    const battles = generateBattleLog(map, { attackers: a, defenders: d, result, startedAt: date, durationMonths: months, capitalFall: vic.capitalFall }, rnd, addMonths);
    const name = nameWar(map, { attackers: a, defenders: d, rnd, existingNames: listWars(map).map((w) => w.name), battles, type: T.key });
    const war = {
      id: nextWarId(map),
      name,
      type: T.key,
      attackers: a,
      defenders: d,
      startedAt: date,
      endsAt,
      durationMonths: months,
      endedAt: null,
      progress: 0,
      // 0〜1。月が進むごとに損害が積み重なり、1で戦闘が終わって講和できる
      joinedAllies: joined,
      battles,
      advantage: {},
      muster: cleanMuster,
      result: {
        winner: result.winner,
        decisiveness: result.decisiveness,
        warScore: result.warScore,
        type: T.key,
        compare: result.compare,
        aStrength: result.aStrength,
        dStrength: result.dStrength,
        noise: result.noise,
        doctrine: result.doctrine,
        casualties: result.casualties,
        moraleDelta: result.moraleDelta,
        popLossShare: result.popLossShare,
        losses: result.losses,
        supportDelta: supportDelta2,
        victory: vic.victory,
        capitalFall: vic.capitalFall
      }
    };
    const parts = [];
    parts.push(...diplomacyParts(map, crossPairs(a, d), "Enemy"));
    const before = listWars(map);
    parts.push({ apply: (mm) => writeWars(mm, [...before, war]), revert: (mm) => writeWars(mm, before) });
    return { command: makeCommand(`\u6226\u4E89\u958B\u59CB\uFF08${war.name}\uFF09`, ["places"], parts), id: war.id, result: war.result, name, joined, endsAt, battles, type: T.key };
  }
  var monthsBetween = (from, to) => (to.year - from.year) * 12 + (to.month - from.month);
  function progressParts(map, war, q0, q1) {
    const parts = [];
    const r = war.result;
    if (!r || q1 <= q0) return parts;
    const dq = q1 - q0;
    const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
    for (const sidStr of Object.keys(r.losses ?? {})) {
      const id = Number(sidStr), st = map.pack.states[id];
      if (!isLive11(st)) continue;
      const f = r.losses[id] ?? 0;
      const step = 1 - Math.pow(1 - f, dq);
      for (const reg of mobilized(st, m)) parts.push(setProps(reg, { u: applyLossFraction(reg.u, step) }));
      const pl = r.popLossShare?.[id] ?? 0, pstep = 1 - Math.pow(1 - pl, dq);
      const pop0 = (st.rural ?? 0) + (st.urban ?? 0);
      parts.push(setProps(st, {
        morale: Math.max(0, Math.min(100, (st.morale ?? 70) + (r.moraleDelta?.[id] ?? 0) * dq)),
        support: Math.max(0, Math.min(100, supportOf(st) + (r.supportDelta?.[id] ?? 0) * dq)),
        // 民意も、期間に均等に動く
        popPeak: Math.max(st.popPeak ?? 0, pop0),
        rural: Math.round((st.rural ?? 0) * (1 - pstep) * 100) / 100,
        urban: Math.round((st.urban ?? 0) * (1 - pstep) * 100) / 100
      }));
    }
    return parts;
  }
  function planAdvanceWars(map, date) {
    const list = listWars(map);
    const parts = [];
    let changed = false;
    const after = list.map((w) => {
      if (w.endedAt || !w.result || w.progress == null || w.progress >= 1) return w;
      const p = Math.min(1, monthsBetween(w.startedAt, date) / Math.max(1, w.durationMonths));
      if (p <= w.progress) return w;
      parts.push(...progressParts(map, w, w.progress, p));
      changed = true;
      return { ...w, progress: p };
    });
    if (!changed) return null;
    parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
    return makeCommand("\u6226\u4E89\u306E\u9032\u884C\uFF08\u6708\u3054\u3068\u306E\u640D\u5BB3\uFF09", ["places"], parts);
  }
  function planFinishWar(map, warId) {
    const list = listWars(map), w = list.find((x) => x.id === warId);
    if (!w || !w.result) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (w.endedAt) throw new Error("\u3059\u3067\u306B\u7D42\u7D50\u3057\u3066\u3044\u307E\u3059");
    if (w.progress == null || w.progress >= 1) return null;
    const parts = progressParts(map, w, w.progress, 1);
    const after = list.map((x) => x.id === warId ? { ...x, progress: 1 } : x);
    parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
    return makeCommand(`\u6226\u95D8\u3092\u6700\u5F8C\u307E\u3067\u9032\u3081\u308B\uFF08${w.name}\uFF09`, ["places"], parts);
  }
  var warFought = (w) => !!w.result && !w.endedAt && (w.progress == null || w.progress >= 1);
  var warOngoing = (w) => !!w.result && !w.endedAt && w.progress != null && w.progress < 1;
  function planWarPreview(map, { attackers, defenders, muster = null, type = "conventional" }) {
    const { attackers: a, defenders: d, joined } = expandWithAllies(map, [...new Set(attackers)], [...new Set(defenders)]);
    return { ...previewWar(map, a, d, warTypeOf(type).allMuster ? null : muster), attackers: a, defenders: d, joined };
  }
  function planReevaluateWars(map, stateIds, note) {
    const list = listWars(map);
    let changed = false;
    const after = list.map((w) => {
      if (w.endedAt || !w.result || ![...w.attackers, ...w.defenders].some((id) => stateIds.includes(id))) return w;
      const r = reevaluateWar(map, w);
      if (!r) return w;
      changed = true;
      return { ...w, result: { ...w.result, ...r }, battles: note ? [...w.battles, { date: null, name: note, place: "", winner: r.winner === "defender" ? "defender" : "attacker", text: note, attackerState: w.attackers[0], defenderState: w.defenders[0] }] : w.battles };
    });
    return changed ? { apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) } : null;
  }
  function planRenameWar(map, warId, name) {
    const list = listWars(map);
    const w = list.find((x) => x.id === warId);
    if (!w) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const n = (name ?? "").trim();
    if (!n) throw new Error("\u6226\u4E89\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (n === w.name) return null;
    if (warNameTaken(map, n, warId)) throw new Error(`\u300C${n}\u300D\u3068\u3044\u3046\u6226\u4E89\u306F\u3059\u3067\u306B\u3042\u308A\u307E\u3059`);
    const after = list.map((x) => x.id === warId ? { ...x, name: n } : x);
    return makeCommand("\u6226\u4E89\u540D\u306E\u5909\u66F4", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) }]);
  }
  function warsAwaitingTreaty(map) {
    return listWars(map).filter(warFought);
  }
  function warsOngoing(map) {
    return listWars(map).filter(warOngoing);
  }
  function planPeaceVenue(map, warId, rnd) {
    const w = listWars(map).find((x) => x.id === warId);
    if (!w) return null;
    const usedPlaces = new Set(listWars(map).map((x) => x.treatyVenue).filter(Boolean));
    let v = null;
    for (let i = 0; i < 8; i++) {
      const c = proposePeaceVenue(map, w, rnd);
      if (!c) break;
      v = c;
      if (!usedPlaces.has(c.place)) break;
    }
    return v ? { ...v, treatyName: uniqueTreatyName(map, v.treatyName) } : null;
  }
  function peaceSides(war) {
    const winnerSide = war.result?.winner === "defender" ? "defenders" : "attackers";
    return { winners: war[winnerSide], losers: war[winnerSide === "attackers" ? "defenders" : "attackers"], stalemate: war.result?.winner === "stalemate" };
  }
  function estimatePeace(map, warId, { loserId, cellGroups, reparations = 0 }) {
    const loser = map.pack.states[loserId];
    return peaceImpact(map, loserId, cellGroups, reparations, loser ? wealthOf(loser) : null);
  }
  function planSetMuster(map, warId, muster) {
    const list = listWars(map);
    const war = list.find((w) => w.id === warId);
    if (!war) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (war.endedAt) throw new Error("\u7D42\u7D50\u3057\u305F\u6226\u4E89\u306E\u53EC\u96C6\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093");
    const sides = /* @__PURE__ */ new Set([...war.attackers, ...war.defenders]);
    const clean = {};
    for (const [sid, ids2] of Object.entries(muster ?? {})) {
      const st = map.pack.states[Number(sid)];
      if (!sides.has(Number(sid)) || !Array.isArray(st?.military)) continue;
      const have = new Set(st.military.map((r) => r.i));
      const keep = [...new Set(ids2)].filter((i) => have.has(i));
      if (keep.length) clean[sid] = keep;
    }
    const after = list.map((x) => x.id !== warId ? x : { ...x, muster: clean });
    return makeCommand("\u90E8\u968A\u306E\u53EC\u96C6", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) }]);
  }
  function planRecordBattle(map, warId, { attackerState, defenderState, result, date }) {
    const list = listWars(map);
    const war = list.find((w) => w.id === warId);
    if (!war) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (war.endedAt) throw new Error("\u7D42\u7D50\u3057\u305F\u6226\u4E89\u306B\u306F\u8A18\u9332\u3067\u304D\u307E\u305B\u3093");
    const entry = { year: date.year, month: date.month, attackerState, defenderState, winner: result.winner, aPower: result.aPower, dPower: result.dPower };
    const advGain = result.winner === "attacker" ? 1 : -1;
    const before = list;
    const after = list.map((w) => w.id !== warId ? w : {
      ...w,
      battles: [...w.battles, entry],
      advantage: { ...w.advantage, [attackerState]: (w.advantage[attackerState] ?? 0) + advGain, [defenderState]: (w.advantage[defenderState] ?? 0) - advGain }
    });
    return makeCommand("\u6226\u7E3E\u3092\u8A18\u9332", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) }]);
  }
  function suggestCessions(map, attackerId, defenderId, { maxDepth = 3 } = {}) {
    const c = map.pack.cells;
    const { cells: geomCells } = map.geometry.pack;
    const n = c.state.length;
    const depth = new Int16Array(n).fill(-1);
    const queue = [];
    for (let i = 0; i < n; i++) {
      if (c.state[i] !== defenderId || c.biome[i] === 0) continue;
      if (geomCells.c[i].some((j) => c.state[j] === attackerId)) {
        depth[i] = 0;
        queue.push(i);
      }
    }
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      if (depth[i] >= maxDepth) continue;
      for (const j of geomCells.c[i]) {
        if (c.state[j] === defenderId && c.biome[j] !== 0 && depth[j] < 0) {
          depth[j] = depth[i] + 1;
          queue.push(j);
        }
      }
    }
    const frontierCells = queue;
    const provinceCandidates = /* @__PURE__ */ new Map();
    for (const i of frontierCells) {
      const pid = c.province[i];
      if (pid > 0) provinceCandidates.set(pid, (provinceCandidates.get(pid) ?? 0) + 1);
    }
    const byProvince = [...provinceCandidates.keys()].map((pid) => {
      const p = map.pack.provinces[pid];
      return { type: "province", provinceId: pid, name: p?.fullName ?? p?.name ?? `\u5C5E\u5DDE#${pid}`, cells: p?.cells ?? provinceCandidates.get(pid) };
    });
    const noProvince = new Set(frontierCells.filter((i) => c.province[i] === 0));
    const regions = [];
    const visited = /* @__PURE__ */ new Set();
    for (const start2 of noProvince) {
      if (visited.has(start2)) continue;
      const comp = [start2];
      visited.add(start2);
      for (let h = 0; h < comp.length; h++) {
        for (const j of geomCells.c[comp[h]]) {
          if (noProvince.has(j) && !visited.has(j)) {
            visited.add(j);
            comp.push(j);
          }
        }
      }
      regions.push(comp);
    }
    const byRegion = regions.map((cells, idx) => ({ type: "region", regionCells: cells, name: `\u672A\u7DE8\u5165\u5730\u57DF${idx + 1}\uFF08${cells.length}\u30BB\u30EB\uFF09`, cells: cells.length }));
    const capCells = /* @__PURE__ */ new Set();
    for (const st of map.pack.states) {
      const cap = isLive11(st) ? map.pack.burgs[st.capital] : null;
      if (cap && !cap.removed) capCells.add(cap.cell);
    }
    const provHasCapital = (pid) => {
      for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid && capCells.has(i)) return true;
      return false;
    };
    return [...byProvince.filter((x) => !provHasCapital(x.provinceId)), ...byRegion.filter((x) => !x.regionCells.some((i) => capCells.has(i)))].sort((a, b) => b.cells - a.cells);
  }
  var COST = { cellBase: 1, burg: 6, reparPer2pct: 1, annex: 100, vassal: { puppet: 60, protectorate: 45, vassal: 50 } };
  var capitalCellsOf = (map, ids2) => {
    const set = /* @__PURE__ */ new Set();
    for (const sid of ids2) {
      const cap = map.pack.burgs[map.pack.states[sid]?.capital];
      if (cap && !cap.removed) set.add(cap.cell);
    }
    return set;
  };
  function cessionCost(map, fromId, cells) {
    const from = map.pack.states[fromId];
    if (!from || !cells.length) return 0;
    const dens = Math.max(0, Math.min(2, (from.industry ?? 0) / Math.max(1, from.cells ?? 1) / 20));
    const set = new Set(cells);
    const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).length;
    return cells.length * (COST.cellBase + dens) + burgs * COST.burg;
  }
  function wealthOf(state) {
    const pop = (state?.rural ?? 0) + (state?.urban ?? 0);
    return Math.max(getFinance(state).treasury, (state?.industry ?? 0) * 5 + pop * 0.2, 1);
  }
  function reparationCost(map, fromId, amount) {
    const t = wealthOf(map.pack.states[fromId]);
    return amount / t * 100 * 0.5 * COST.reparPer2pct;
  }
  function winnerShares(map, war) {
    const { winners } = peaceSides(war);
    const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
    const w = {};
    let tot = 0;
    const leaders = new Set((map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt && a.members.filter((x) => winners.includes(x)).length >= 2).map((a) => leaderOf(a)));
    for (const id of winners) {
      const st = map.pack.states[id];
      const x = isLive11(st) ? previewWar(map, [id], [id], m).aStrength : null;
      w[id] = (x ? Math.max(1, x.land + x.sea + x.air) : 1) * (leaders.has(id) ? 1.4 : 1);
      tot += w[id];
    }
    for (const id of winners) w[id] = tot ? w[id] / tot : 1 / winners.length;
    return w;
  }
  function treatyBudget(map, war, terms) {
    const { winners } = peaceSides(war);
    const score = war.result?.warScore ?? 0, shares = winnerShares(map, war);
    const spent = Object.fromEntries(winners.map((id) => [id, 0]));
    for (const c of terms.cessions ?? []) if (spent[c.toStateId] != null) spent[c.toStateId] += cessionCost(map, c.fromStateId, c.cells);
    for (const r of terms.reparations ?? []) if (spent[r.toStateId] != null && r.amount > 0) spent[r.toStateId] += reparationCost(map, r.fromStateId, r.amount);
    for (const x of terms.annex ?? []) if (spent[x.toStateId] != null) spent[x.toStateId] += COST.annex;
    for (const x of terms.vassalize ?? []) if (spent[x.toStateId] != null) spent[x.toStateId] += COST.vassal[x.kind] ?? 50;
    return winners.map((id) => ({ stateId: id, share: shares[id], budget: Math.round(score * shares[id] * 10) / 10, spent: Math.round(spent[id] * 10) / 10 }));
  }
  function planSignTreaty(map, warId, terms, date, { enforceBudget = true, allowOngoing = false } = {}) {
    const list = listWars(map);
    const war = list.find((w) => w.id === warId);
    if (!war) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (war.endedAt) throw new Error("\u65E2\u306B\u7D42\u7D50\u3057\u3066\u3044\u307E\u3059");
    if (!allowOngoing && warOngoing(war)) throw new Error("\u6226\u95D8\u304C\u307E\u3060\u7D9A\u3044\u3066\u3044\u307E\u3059\u3002\u6700\u5F8C\u307E\u3067\u9032\u3081\u3066\u304B\u3089\u8B1B\u548C\u3057\u3066\u304F\u3060\u3055\u3044");
    const { winners, losers } = peaceSides(war);
    const all = [...war.attackers, ...war.defenders];
    const kind = terms.kind ?? "standard";
    const cessions = kind === "standard" ? (terms.cessions ?? []).filter((c2) => c2.cells?.length) : [];
    const reparations = kind === "standard" ? (terms.reparations ?? []).filter((r) => r.amount > 0) : [];
    const annex = kind === "annex" ? terms.annex ?? [] : [];
    const vassalize = kind === "vassal" ? terms.vassalize ?? [] : [];
    for (const x of vassalize) if (!VASSAL_BY_KEY[x.kind]) throw new Error("\u5F93\u5C5E\u306E\u7A2E\u985E\u306F \u5080\u5121\u30FB\u4FDD\u8B77\u56FD\u30FB\u5C5E\u56FD \u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    for (const x of [...cessions, ...reparations, ...annex, ...vassalize]) {
      if (!all.includes(x.fromStateId) || !all.includes(x.toStateId)) throw new Error("\u6761\u7D04\u306E\u5F53\u4E8B\u56FD\u306F\u4EA4\u6226\u56FD\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
      if (!isLive11(map.pack.states[x.fromStateId]) || !isLive11(map.pack.states[x.toStateId])) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059");
      if (x.fromStateId === x.toStateId) throw new Error("\u540C\u3058\u56FD\u3069\u3046\u3057\u3067\u306F\u8981\u6C42\u3067\u304D\u307E\u305B\u3093");
    }
    const caps = capitalCellsOf(map, all);
    for (const c2 of cessions) if (c2.cells.some((i) => caps.has(i))) throw new Error("\u9996\u90FD\u3092\u542B\u3080\u5730\u57DF\u306F\u5272\u8B72\u3067\u304D\u307E\u305B\u3093");
    if (enforceBudget && war.result && winners.length) {
      const rows = treatyBudget(map, war, { cessions, reparations, annex, vassalize });
      const over = rows.find((r) => r.spent > r.budget + 0.05);
      if (over) throw new Error(`${officialName(map.pack.states[over.stateId])}\u306E\u8981\u6C42\u304C\u6226\u4E89\u30B9\u30B3\u30A2\u3092\u8D85\u3048\u3066\u3044\u307E\u3059\uFF08\u4F7F\u7528 ${over.spent} / \u4E0A\u9650 ${over.budget}\uFF09`);
      if (annex.length && (war.result.warScore ?? 0) < 85) throw new Error("\u5168\u9762\u964D\u4F0F\uFF08\u4F75\u5408\uFF09\u3092\u6C42\u3081\u308B\u306B\u306F\u3001\u6226\u4E89\u30B9\u30B3\u30A2\u304C85\u4EE5\u4E0A\u306E\u6C7A\u5B9A\u7684\u306A\u52DD\u5229\u304C\u5FC5\u8981\u3067\u3059");
    }
    const c = map.pack.cells, parts = [], record = { cessions: [], reparations: [], annex: [] };
    for (const cs of cessions) {
      const changes = cs.cells.map((i) => [i, c.state[i], cs.toStateId]);
      parts.push(setIndexed((m) => m.pack.cells.state, changes));
      const set = new Set(cs.cells);
      for (const b of map.pack.burgs) if (b && b.i && !b.removed && set.has(b.cell)) parts.push(setProps(b, { state: cs.toStateId }));
      record.cessions.push({ name: cs.name ?? "", fromStateId: cs.fromStateId, toStateId: cs.toStateId, cells: cs.cells.length, burgs: map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).map((b) => b.name) });
    }
    const delta = /* @__PURE__ */ new Map();
    const fin = (id) => getFinance(map.pack.states[id]).treasury;
    for (const r of reparations) {
      const received = convert(map, r.fromStateId, r.toStateId, r.amount);
      delta.set(r.fromStateId, (delta.get(r.fromStateId) ?? 0) - r.amount);
      delta.set(r.toStateId, (delta.get(r.toStateId) ?? 0) + received);
      record.reparations.push({ fromStateId: r.fromStateId, toStateId: r.toStateId, amount: r.amount, currency: getCurrency(map.pack.states[r.fromStateId]).name, received: Math.round(received * 100) / 100, receivedCurrency: getCurrency(map.pack.states[r.toStateId]).name });
    }
    for (const [id, d] of delta) parts.push(setProps(map.pack.states[id], { treasury: Math.round((fin(id) + d) * 100) / 100 }));
    for (const x of annex) record.annex.push({ fromStateId: x.fromStateId, toStateId: x.toStateId });
    record.vassalize = [];
    for (const x of vassalize) {
      parts.push(setProps(map.pack.states[x.fromStateId], { vassal: { overlord: x.toStateId, kind: x.kind, since: date } }));
      record.vassalize.push({ fromStateId: x.fromStateId, toStateId: x.toStateId, kind: x.kind });
    }
    const treatyName = uniqueTreatyName(map, terms.treatyName || `${war.name}\u306E\u8B1B\u548C\u6761\u7D04`);
    const full = { kind, treatyName, venue: terms.venue ?? null, notes: terms.notes ?? "", signedAt: date, ...record, score: { total: war.result?.warScore ?? 0, byWinner: war.result ? treatyBudget(map, war, { cessions, reparations, annex, vassalize }) : [] } };
    const endDate = war.endsAt ?? date;
    const after = list.map((w) => w.id !== warId ? w : { ...w, endedAt: endDate, terms: full, treatyName, treatyVenue: terms.venue?.place ?? null });
    parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
    const stillHostile = /* @__PURE__ */ new Set();
    for (const w of list) if (w.id !== warId && !w.endedAt) for (const x of w.attackers) for (const y of w.defenders) stillHostile.add(x < y ? `${x}-${y}` : `${y}-${x}`);
    const toNeutral = crossPairs(war.attackers, war.defenders).filter(([x, y]) => !stillHostile.has(x < y ? `${x}-${y}` : `${y}-${x}`));
    parts.push(...diplomacyParts(map, toNeutral, "Neutral"));
    return makeCommand(`\u8B1B\u548C\u6761\u7D04\uFF08${war.name}\uFF09`, ["politics"], parts);
  }
  function planSignPeace(map, warId, terms, date) {
    const war = listWars(map).find((w) => w.id === warId);
    if (!war) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!isLive11(map.pack.states[terms.toStateId])) throw new Error("\u5272\u8B72\u5148\u306E\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const { winners, losers } = peaceSides(war);
    if (!winners.includes(terms.toStateId) && !losers.includes(terms.toStateId)) throw new Error("\u53D7\u3051\u53D6\u308B\u56FD\u306F\u4EA4\u6226\u56FD\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    const c = map.pack.cells;
    const groups = [...terms.regionCells ?? []];
    for (const pid of terms.provinceIds ?? []) {
      const cells = [];
      for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i);
      groups.push(cells);
    }
    const payerId = terms.fromStateId ?? (winners.includes(terms.toStateId) ? losers[0] : winners[0]);
    const cessions = groups.map((cells) => ({ cells, fromStateId: c.state[cells[0]] || payerId, toStateId: terms.toStateId }));
    const reparations = terms.reparations ? [{ fromStateId: payerId, toStateId: terms.toStateId, amount: terms.reparations }] : [];
    return planSignTreaty(map, warId, { kind: "standard", cessions, reparations, treatyName: terms.treatyName, venue: terms.venue, notes: terms.notes }, date, { enforceBudget: false, allowOngoing: true });
  }
  var cellsOfState = (map, id) => {
    const out = [];
    const c = map.pack.cells.state;
    for (let i = 0; i < c.length; i++) if (c[i] === id) out.push(i);
    return out;
  };
  var capitalCellOf = (map, id) => {
    const b = map.pack.burgs[map.pack.states[id]?.capital];
    return b && !b.removed ? b.cell : -1;
  };
  function suggestTreaty(map, war) {
    const r = war.result;
    if (!r) return null;
    const { winners, losers, stalemate } = peaceSides(war);
    const cas = r.casualties ?? {};
    const shares = winnerShares(map, war);
    const lossFracOf = (id) => {
      const c = cas[id];
      return c && c.before > 0 ? c.lost / c.before : 0;
    };
    const cellsOf = (id) => map.pack.states[id]?.cells ?? cellsOfState(map, id).length;
    const demand = stalemate ? 0 : Math.max(0, Math.min(0.5, 0.02 + 0.3 * r.decisiveness * 1.2));
    const reparations = [], cessionByLoser = {};
    for (const L of losers) {
      const st = map.pack.states[L];
      if (!isLive11(st)) continue;
      const treasury = wealthOf(st);
      const share = stalemate ? 0 : Math.max(0, Math.min(0.6, 0.05 + 0.5 * r.decisiveness * lossFracOf(L)));
      cessionByLoser[L] = Math.round(cellsOf(L) * demand * (lossFracOf(L) + 0.5));
      for (const W of winners) {
        const amount = Math.round(treasury * share * shares[W] * 100) / 100;
        if (amount > 0) reparations.push({ fromStateId: L, toStateId: W, amount });
      }
    }
    return {
      kind: stalemate ? "white" : "standard",
      warScore: r.warScore ?? 0,
      shares,
      cessionByLoser,
      reparations,
      cessionCells: Object.values(cessionByLoser).reduce((n, x) => n + x, 0),
      exhaustion: [...winners, ...losers].map((id) => ({ stateId: id, side: winners.includes(id) ? "winner" : "loser", lost: cas[id]?.lost ?? 0, before: cas[id]?.before ?? 0, moraleDelta: r.moraleDelta?.[id] ?? 0, supportDelta: r.supportDelta?.[id] ?? 0, support: supportOf(map.pack.states[id]) }))
    };
  }
  function suggestCessionChunks(map, toIds, fromId, { size = "m", maxChunks = 10 } = {}) {
    const winners = Array.isArray(toIds) ? toIds : [toIds];
    const nb = map.geometry?.pack?.cells?.c;
    if (!nb) return [];
    const st = map.pack.cells.state, cap = capitalCellOf(map, fromId);
    const mine = cellsOfState(map, fromId);
    if (!mine.length) return [];
    const pct2 = { s: 0.015, m: 0.04, l: 0.09 }[size] ?? 0.04;
    const target = Math.max(2, Math.round(mine.length * pct2));
    const used = /* @__PURE__ */ new Set();
    const chunks = [];
    const adjWinner = (i) => {
      const cnt = /* @__PURE__ */ new Map();
      for (const j of nb[i]) if (winners.includes(st[j])) cnt.set(st[j], (cnt.get(st[j]) ?? 0) + 1);
      return [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    let seeds = mine.filter((i) => i !== cap && adjWinner(i) != null);
    if (!seeds.length) seeds = mine.filter((i) => i !== cap && nb[i].some((j) => st[j] !== fromId));
    const burgAt = /* @__PURE__ */ new Map();
    for (const b of map.pack.burgs) if (b && b.i && !b.removed) burgAt.set(b.cell, b);
    const provName = (cell) => {
      const p = map.pack.provinces[map.pack.cells.province[cell]];
      return p && !p.removed && p.i ? p.fullName ?? p.name : null;
    };
    for (const seed of seeds) {
      if (chunks.length >= maxChunks) break;
      if (used.has(seed)) continue;
      const cells = [seed], seen = /* @__PURE__ */ new Set([seed]), q = [seed];
      while (q.length && cells.length < target) {
        const k = q.shift();
        for (const j of nb[k]) if (!seen.has(j) && st[j] === fromId && j !== cap && !used.has(j)) {
          seen.add(j);
          cells.push(j);
          q.push(j);
          if (cells.length >= target) break;
        }
      }
      for (const i of cells) used.add(i);
      const burg = cells.map((i) => burgAt.get(i)).find(Boolean);
      const base = burg?.name ?? provName(seed) ?? `\u533A\u753B${chunks.length + 1}`;
      const tally = /* @__PURE__ */ new Map();
      for (const i of cells) {
        const w = adjWinner(i);
        if (w != null) tally.set(w, (tally.get(w) ?? 0) + 1);
      }
      const to = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? winners[0];
      chunks.push({ type: "region", name: `${base}\u5468\u8FBA`, cells: cells.length, regionCells: cells, fromStateId: fromId, toStateId: to, burgs: cells.filter((i) => burgAt.has(i)).length });
    }
    return chunks;
  }
  function uniqueTreatyName(map, base) {
    const taken = new Set(listWars(map).map((w) => w.treatyName).filter(Boolean));
    if (!taken.has(base)) return base;
    const place = base.replace(/(講和)?条約$/, "");
    for (const cand of [`${place}\u548C\u7D04`, `${place}\u5E73\u548C\u6761\u7D04`, `${place}\u8B1B\u548C\u6761\u7D04`, `${place}\u5354\u5B9A`]) if (!taken.has(cand)) return cand;
    let k = 2;
    while (taken.has(`${place}\u6761\u7D04\uFF08${k}\uFF09`)) k++;
    return `${place}\u6761\u7D04\uFF08${k}\uFF09`;
  }

  // js/core/edit/pole.js
  function computePole(map, ownerOf, id) {
    const { cells, p } = map.geometry.pack;
    const biome = map.pack.cells.biome;
    const n = cells.c.length;
    const member = new Uint8Array(n);
    let count = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      if (biome[i] !== 0 && ownerOf(i) === id) {
        member[i] = 1;
        count++;
        sx += p[i][0];
        sy += p[i][1];
      }
    }
    if (!count) return null;
    const dist = new Int32Array(n).fill(-1);
    const queue = [];
    for (let i = 0; i < n; i++) {
      if (!member[i]) continue;
      if (cells.b[i] || cells.c[i].some((j) => !member[j])) {
        dist[i] = 0;
        queue.push(i);
      }
    }
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      for (const j of cells.c[i]) if (member[j] && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
    const cx = sx / count, cy = sy / count;
    let best = -1, bestD = -1, bestC = Infinity;
    for (let i = 0; i < n; i++) {
      if (!member[i]) continue;
      const d = dist[i] < 0 ? 0 : dist[i];
      const c = (p[i][0] - cx) ** 2 + (p[i][1] - cy) ** 2;
      if (d > bestD || d === bestD && c < bestC) {
        best = i;
        bestD = d;
        bestC = c;
      }
    }
    return [Math.round(p[best][0]), Math.round(p[best][1])];
  }

  // js/core/spatial.js
  function createCellIndex(points, bucket = 16) {
    let maxX = 0, maxY = 0;
    for (const [x, y] of points) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const cols = Math.floor(maxX / bucket) + 1;
    const rows = Math.floor(maxY / bucket) + 1;
    const buckets = Array.from({ length: cols * rows }, () => []);
    points.forEach(([x, y], id) => buckets[Math.floor(y / bucket) * cols + Math.floor(x / bucket)].push(id));
    return {
      /** 中心が (x, y) から半径 r 以内にあるセルの ID の配列（ブラシ用） */
      findWithin(x, y, r) {
        const out = [];
        const r22 = r * r;
        const gx0 = Math.max(0, Math.floor((x - r) / bucket)), gx1 = Math.min(cols - 1, Math.floor((x + r) / bucket));
        const gy0 = Math.max(0, Math.floor((y - r) / bucket)), gy1 = Math.min(rows - 1, Math.floor((y + r) / bucket));
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            for (const id of buckets[gy * cols + gx]) {
              const dx = points[id][0] - x, dy = points[id][1] - y;
              if (dx * dx + dy * dy <= r22) out.push(id);
            }
          }
        }
        return out;
      },
      /** 最も近いセルの ID。点が1つも無ければ -1 */
      find(x, y) {
        if (!points.length) return -1;
        const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / bucket)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / bucket)));
        let best = -1, bestD = Infinity;
        const maxR = Math.max(cols, rows);
        for (let r = 0; r <= maxR; r++) {
          if (best !== -1 && (r - 1) * bucket > Math.sqrt(bestD)) break;
          for (let gy = cy - r; gy <= cy + r; gy++) {
            for (let gx = cx - r; gx <= cx + r; gx++) {
              if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
              if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
              for (const id of buckets[gy * cols + gx]) {
                const dx = points[id][0] - x, dy = points[id][1] - y;
                const d = dx * dx + dy * dy;
                if (d < bestD) {
                  bestD = d;
                  best = id;
                }
              }
            }
          }
        }
        return best;
      }
    };
  }
  var indexCache = /* @__PURE__ */ new WeakMap();
  function cellIndexOf(map) {
    let idx = indexCache.get(map.geometry);
    if (!idx) {
      idx = createCellIndex(map.geometry.pack.p);
      indexCache.set(map.geometry, idx);
    }
    return idx;
  }

  // js/core/edit/paint.js
  var PAINT_KINDS = Object.freeze({
    state: { list: "states", label: "\u56FD\u5BB6" },
    culture: { list: "cultures", label: "\u6587\u5316" },
    religion: { list: "religions", label: "\u5B97\u6559" },
    province: { list: "provinces", label: "\u5C5E\u5DDE" }
  });
  var round6 = (v) => Math.round(v * 1e6) / 1e6;
  var isLive12 = (e) => !!e && typeof e === "object" && !e.removed;
  var liveBurg = (map, id) => {
    const b = id > 0 ? map.pack.burgs[id] : null;
    return isLive12(b) && b.i ? b : null;
  };
  function protectedCells(map) {
    const capital = /* @__PURE__ */ new Set(), provinceCenter = /* @__PURE__ */ new Set();
    for (const s of map.pack.states) {
      if (!isLive12(s) || !s.i) continue;
      const b = liveBurg(map, s.capital);
      if (b) capital.add(b.cell);
    }
    for (const pr of map.pack.provinces) {
      if (!isLive12(pr) || !pr.i) continue;
      const b = liveBurg(map, pr.burg);
      if (b) provinceCenter.add(b.cell);
    }
    return { capital, provinceCenter };
  }
  function createTally() {
    const t = /* @__PURE__ */ new Map();
    const get = (kind, id) => {
      const key = `${kind}:${id}`;
      let e = t.get(key);
      if (!e) {
        e = { kind, id, cells: 0, rural: 0, area: 0, urban: 0, burgs: 0, burgAdd: [], burgRemove: [] };
        t.set(key, e);
      }
      return e;
    };
    return { get, all: () => [...t.values()] };
  }
  function planPaint(map, { kind, target, cells, force = false }) {
    const def = PAINT_KINDS[kind];
    if (!def) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u7A2E\u985E\u3067\u3059: ${kind}`);
    const list = map.pack[def.list];
    const entity = target > 0 ? list[target] : null;
    if (target > 0 && !isLive12(entity)) throw new Error(`${def.label}#${target} \u306F\u5B58\u5728\u3057\u306A\u3044\u304B\u3001\u524A\u9664\u3055\u308C\u3066\u3044\u307E\u3059`);
    const c = map.pack.cells;
    const arr = c[kind];
    const burgs = map.pack.burgs;
    const areas = cellAreas(map.geometry);
    const { capital, provinceCenter } = force ? { capital: /* @__PURE__ */ new Set(), provinceCenter: /* @__PURE__ */ new Set() } : protectedCells(map);
    const report = { requested: 0, changed: 0, skippedWater: 0, skippedProtected: 0, skippedForeign: 0 };
    const changes = [];
    const provinceChanges = [];
    const burgPatches = [];
    const tally = createTally();
    const seen = /* @__PURE__ */ new Set();
    const move = (k, from, to, cell, pop, area, burg) => {
      const a = tally.get(k, from), b = tally.get(k, to);
      a.cells--;
      b.cells++;
      a.rural -= pop;
      b.rural += pop;
      a.area -= area;
      b.area += area;
      if (burg) {
        a.urban -= burg.population;
        b.urban += burg.population;
        a.burgs--;
        b.burgs++;
        a.burgRemove.push(burg.i);
        b.burgAdd.push(burg.i);
      }
    };
    for (const cell of cells) {
      if (seen.has(cell)) continue;
      seen.add(cell);
      report.requested++;
      if (cell < 0 || cell >= arr.length) continue;
      if (c.biome[cell] === 0) {
        report.skippedWater++;
        continue;
      }
      const old = arr[cell];
      if (old === target) continue;
      if (kind === "province" && target > 0 && c.state[cell] !== entity.state) {
        report.skippedForeign++;
        continue;
      }
      if (!force && (kind === "state" && capital.has(cell) || (kind === "state" || kind === "province") && provinceCenter.has(cell))) {
        report.skippedProtected++;
        continue;
      }
      const pop = c.pop[cell], area = areas[cell];
      const burg = liveBurg(map, c.burg[cell]);
      if (!force && kind === "state" && target === 0 && burg) {
        report.skippedProtected++;
        continue;
      }
      changes.push([cell, old, target]);
      move(kind, old, target, cell, pop, area, burg && (kind === "state" || kind === "religion" || kind === "province") ? burg : null);
      if (burg && kind === "state") burgPatches.push([burg, { state: target }]);
      if (burg && kind === "culture") burgPatches.push([burg, { culture: target }]);
      if (kind === "state") {
        const p = c.province[cell];
        if (p > 0 && map.pack.provinces[p]?.state !== target) {
          provinceChanges.push([cell, p, 0]);
          move("province", p, 0, cell, pop, area, burg);
        }
      }
      report.changed++;
    }
    if (!changes.length) return { command: null, report };
    const parts = [setIndexed((m) => m.pack.cells[kind], changes)];
    if (provinceChanges.length) parts.push(setIndexed((m) => m.pack.cells.province, provinceChanges));
    for (const [burg, patch] of burgPatches) parts.push(setProps(burg, patch));
    const entityOf = (k, id) => {
      const e = map.pack[PAINT_KINDS[k].list][id];
      return e && typeof e === "object" ? e : null;
    };
    for (const d of tally.all()) {
      if (d.id === 0 && d.kind !== "state" && d.kind !== "religion") continue;
      const e = entityOf(d.kind, d.id);
      if (!e) continue;
      const patch = {};
      for (const f of ["cells", "rural", "area", "urban"]) if (typeof e[f] === "number" && d[f] !== 0) patch[f] = round6(e[f] + d[f]);
      if (typeof e.burgs === "number" && d.burgs !== 0) patch.burgs = e.burgs + d.burgs;
      else if (Array.isArray(e.burgs) && (d.burgAdd.length || d.burgRemove.length)) {
        const rm = new Set(d.burgRemove);
        patch.burgs = e.burgs.filter((b) => !rm.has(b)).concat(d.burgAdd.filter((b) => !e.burgs.includes(b)));
      }
      if (Object.keys(patch).length) parts.push(setProps(e, patch));
    }
    const after = new Map(changes.map(([i, , to]) => [i, to]));
    const ownerAfter = (cell) => after.has(cell) ? after.get(cell) : arr[cell];
    const provAfter = new Map(provinceChanges.map(([i, , to]) => [i, to]));
    const provOwnerAfter = (cell) => provAfter.has(cell) ? provAfter.get(cell) : c.province[cell];
    const index = cellIndexOf(map);
    const fixPole = (k, id, owner) => {
      const e = entityOf(k, id);
      if (!e || !id || !Array.isArray(e.pole)) return;
      const at = index.find(e.pole[0], e.pole[1]);
      if (at >= 0 && owner(at) === id && c.biome[at] !== 0) return;
      const pole = computePole(map, owner, id);
      if (pole) parts.push(setProps(e, { pole }));
    };
    for (const d of tally.all()) {
      if (d.kind === kind && d.cells !== 0) fixPole(kind, d.id, ownerAfter);
      if (d.kind === "province" && kind === "state" && d.cells !== 0) fixPole("province", d.id, provOwnerAfter);
    }
    const label = target > 0 ? `${def.label}\u3092\u5857\u308B` : `${def.label}\u3092\u6D88\u3059`;
    return { command: makeCommand(label, ["politics"], parts), report };
  }
  function planBiomePaint(map, { target, cells }) {
    const b = map.biomesData[target];
    if (!b || target === 0) throw new Error("\u5857\u308C\u306A\u3044\u5730\u5F62\u3067\u3059\uFF08\u6D77\u306B\u306F\u3067\u304D\u307E\u305B\u3093\uFF09");
    const arr = map.pack.cells.biome;
    const report = { requested: 0, changed: 0, skippedWater: 0 };
    const changes = [];
    const seen = /* @__PURE__ */ new Set();
    for (const cell of cells) {
      if (seen.has(cell)) continue;
      seen.add(cell);
      report.requested++;
      if (cell < 0 || cell >= arr.length) continue;
      if (arr[cell] === 0) {
        report.skippedWater++;
        continue;
      }
      if (arr[cell] === target) continue;
      changes.push([cell, arr[cell], target]);
      report.changed++;
    }
    if (!changes.length) return { command: null, report };
    return { command: makeCommand("\u5730\u5F62\u3092\u5857\u308B", ["terrain"], [setIndexed((m) => m.pack.cells.biome, changes)]), report };
  }

  // js/core/edit/notes.js
  var NOTE_TYPES = ["state", "province", "culture", "religion", "burg", "marker"];
  var MAX_NOTE = 2e4;
  var isLive13 = (e) => !!e && typeof e === "object" && !e.removed;
  var isLegacy = (map) => map.settings.format === "legacy";
  function noteTarget(map, type, id) {
    if (type === "marker") return map.markers.find((m) => m.i === id) ?? null;
    if (type === "burg") {
      const b = map.pack.burgs[id];
      return isLive13(b) && b.i ? b : null;
    }
    const def = PAINT_KINDS[type];
    if (!def) return null;
    const e = map.pack[def.list][id];
    return isLive13(e) && e.i ? e : null;
  }
  var legacyIds = (type, id) => {
    const ids2 = [`${type}${id}`];
    if (type === "state" || type === "province" || type === "burg") ids2.push(`${type}Label${id}`);
    return ids2;
  };
  var findLegacy = (map, type, id) => {
    const ids2 = legacyIds(type, id);
    return map.notes.findIndex((n) => n && ids2.includes(n.id));
  };
  function getNote(map, type, id) {
    const t = noteTarget(map, type, id);
    if (!t) return "";
    if (!isLegacy(map)) return typeof t.note === "string" ? t.note : "";
    const idx = findLegacy(map, type, id);
    return idx >= 0 ? map.notes[idx].legend ?? "" : "";
  }
  var titleOf = (type, t) => t.name ? String(t.name) : type;
  function planSetNote(map, type, id, text2) {
    if (!NOTE_TYPES.includes(type)) throw new Error(`\u30CE\u30FC\u30C8\u3092\u4ED8\u3051\u3089\u308C\u306A\u3044\u7A2E\u985E\u3067\u3059: ${type}`);
    const t = noteTarget(map, type, id);
    if (!t) throw new Error("\u30CE\u30FC\u30C8\u3092\u4ED8\u3051\u308B\u5BFE\u8C61\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const value = String(text2 ?? "");
    if (value.length > MAX_NOTE) throw new Error(`\u6587\u7AE0\u304C\u9577\u3059\u304E\u307E\u3059\uFF08${MAX_NOTE}\u6587\u5B57\u307E\u3067\uFF09`);
    if (value === getNote(map, type, id)) return null;
    if (!isLegacy(map)) {
      return makeCommand("\u6587\u7AE0\u306E\u5909\u66F4", [], [setProps(t, { note: value === "" ? void 0 : value })]);
    }
    const idx = findLegacy(map, type, id);
    const next = map.notes.slice();
    if (idx >= 0) {
      if (value === "" && type !== "marker") next.splice(idx, 1);
      else next[idx] = { ...next[idx], legend: value };
    } else if (value !== "") {
      next.push({ id: `${type}${id}`, name: titleOf(type, t), legend: value });
    }
    return makeCommand("\u6587\u7AE0\u306E\u5909\u66F4", [], [setList((m) => m.notes, (m, v) => {
      m.notes = v;
    }, next)]);
  }
  function removeLegacyNotesPart(map, type, id) {
    if (!isLegacy(map)) return null;
    const ids2 = legacyIds(type, id);
    if (!map.notes.some((n) => n && ids2.includes(n.id))) return null;
    return setList((m) => m.notes, (m, v) => {
      m.notes = v;
    }, map.notes.filter((n) => !(n && ids2.includes(n.id))));
  }
  var SIMPLE_TAGS = /<(?!\/?(?:br|p)\b)[a-z!][^>]*>/i;
  var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  function htmlToEditable(html) {
    const s = String(html ?? "");
    if (!s) return { text: "", rich: false };
    if (SIMPLE_TAGS.test(s)) return { text: s, rich: true };
    const text2 = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<\/?p[^>]*>/gi, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
    return { text: text2, rich: false };
  }
  function editableToHtml(text2, rich) {
    const s = String(text2 ?? "").replace(/\r\n?/g, "\n");
    if (rich) return s;
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  }

  // js/core/edit/markers.js
  var DEFAULT_MARKER_TYPES = Object.freeze([
    { type: "volcanoes", icon: "\u{1F30B}", label: "\u706B\u5C71" },
    { type: "hot-springs", icon: "\u2668\uFE0F", label: "\u6E29\u6CC9" },
    { type: "water-sources", icon: "\u{1F4A7}", label: "\u6C34\u6E90" },
    { type: "mines", icon: "\u26CF\uFE0F", label: "\u9271\u5C71" },
    { type: "bridges", icon: "\u{1F309}", label: "\u6A4B" },
    { type: "lighthouses", icon: "\u{1F6A8}", label: "\u706F\u53F0" },
    { type: "battlefields", icon: "\u2694\uFE0F", label: "\u53E4\u6226\u5834" },
    { type: "ruins", icon: "\u{1F3DB}\uFE0F", label: "\u907A\u8DE1" },
    { type: "statues", icon: "\u{1F5FF}", label: "\u50CF" },
    { type: "caves", icon: "\u{1F573}\uFE0F", label: "\u6D1E\u7A9F" },
    { type: "independence", icon: "\u{1F3F3}\uFE0F", label: "\u72EC\u7ACB\u5BA3\u8A00" },
    { type: "founding", icon: "\u{1F451}", label: "\u5EFA\u56FD" },
    { type: "war", icon: "\u2694\uFE0F", label: "\u958B\u6226" },
    { type: "peace", icon: "\u{1F54A}\uFE0F", label: "\u8B1B\u548C" }
  ]);
  function defaultMarkerName(type) {
    if (!type) return "Marker";
    const s = type.replaceAll("-", " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function planAddMarker(map, { cell, type, icon, name }) {
    if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u30DE\u30FC\u30AB\u30FC\u3092\u7F6E\u3051\u307E\u305B\u3093");
    const { p } = map.geometry.pack;
    const id = Math.max(-1, ...map.markers.map((m) => m.i)) + 1;
    const marker = { i: id, type: type || "marker", icon: icon || "\u{1F4CD}", x: p[cell][0], y: p[cell][1], cell, name: name || defaultMarkerName(type) };
    const parts = [setList((m) => m.markers, (m, v) => {
      m.markers = v;
    }, [...map.markers, marker])];
    return { command: makeCommand("\u30DE\u30FC\u30AB\u30FC\u3092\u8FFD\u52A0", ["places"], parts), id };
  }
  function planMoveMarker(map, id, cell) {
    const marker = map.markers.find((m) => m.i === id);
    if (!marker) throw new Error("\u305D\u306E\u30DE\u30FC\u30AB\u30FC\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u79FB\u52D5\u3067\u304D\u307E\u305B\u3093");
    if (marker.cell === cell) return null;
    const { p } = map.geometry.pack;
    return makeCommand("\u30DE\u30FC\u30AB\u30FC\u3092\u79FB\u52D5", ["places"], [setProps(marker, { cell, x: p[cell][0], y: p[cell][1] })]);
  }
  function planEditMarker(map, id, patch) {
    const marker = map.markers.find((m) => m.i === id);
    if (!marker) throw new Error("\u305D\u306E\u30DE\u30FC\u30AB\u30FC\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const next = {};
    if (patch.type !== void 0 && patch.type !== marker.type) next.type = patch.type;
    if (patch.icon !== void 0 && patch.icon !== marker.icon) next.icon = patch.icon;
    if (patch.name !== void 0 && patch.name !== marker.name) next.name = patch.name || defaultMarkerName(patch.type ?? marker.type);
    if (!Object.keys(next).length) return null;
    return makeCommand("\u30DE\u30FC\u30AB\u30FC\u3092\u7DE8\u96C6", ["places"], [setProps(marker, next)]);
  }
  function planRemoveMarker(map, id) {
    const marker = map.markers.find((m) => m.i === id);
    if (!marker) throw new Error("\u305D\u306E\u30DE\u30FC\u30AB\u30FC\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const parts = [setList((m) => m.markers, (m, v) => {
      m.markers = v;
    }, map.markers.filter((mk) => mk.i !== id))];
    const notePart = removeLegacyNotesPart(map, "marker", id);
    if (notePart) parts.push(notePart);
    return makeCommand("\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664", ["places"], parts);
  }

  // js/core/edit/sovereignty.js
  var round62 = (v) => Math.round(v * 1e6) / 1e6;
  var isLive14 = (e) => !!e && typeof e === "object" && !e.removed;
  var isLiveState2 = (s) => isLive14(s) && s.i > 0;
  var liveBurg2 = (map, id) => {
    const b = id > 0 ? map.pack.burgs[id] : null;
    return isLive14(b) && b.i ? b : null;
  };
  function pickColor(existingCount, rnd) {
    const golden = 137.508;
    const hue = Math.round((existingCount * golden + (rnd ? rnd.float(0, 360) : 0)) % 360);
    const sat = 55 + (rnd ? Math.round(rnd.float(0, 15)) : 10);
    const light = 45 + (rnd ? Math.round(rnd.float(-10, 10)) : 0);
    const s = sat / 100, l = light / 100;
    const k = (n) => (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
    return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
  }
  function nearestCell(map, pole) {
    const { p } = map.geometry.pack;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < p.length; i++) {
      const d = (p[i][0] - pole[0]) ** 2 + (p[i][1] - pole[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  function logEntry(map, entry) {
    const before = map.ext?.data?.sovereigntyLog ?? [];
    return {
      apply: (m) => {
        ensureExt(m).data.sovereigntyLog = [...before, entry];
      },
      revert: (m) => {
        const ext = ensureExt(m);
        if (before.length) ext.data.sovereigntyLog = before;
        else delete ext.data.sovereigntyLog;
      }
    };
  }
  function addEventMarker(map, { cell, type, name }) {
    if (cell == null || cell < 0) return null;
    const { p } = map.geometry.pack;
    const id = Math.max(-1, ...map.markers.map((m) => m.i)) + 1;
    const icon = type === "founding" ? "\u{1F451}" : "\u{1F3F3}\uFE0F";
    const marker = { i: id, type, icon, x: p[cell][0], y: p[cell][1], cell, name: name || defaultMarkerName(type) };
    return setList((m) => m.markers, (m, v) => {
      m.markers = v;
    }, [...map.markers, marker]);
  }
  function listSovereigntyLog(map) {
    return map.ext?.data?.sovereigntyLog ?? [];
  }
  function planDeclareIndependence(map, { provinceId, name, rnd, date }) {
    const province = map.pack.provinces[provinceId];
    if (!isLive14(province) || !province.i) throw new Error("\u305D\u306E\u5C5E\u5DDE\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const fromState = map.pack.states[province.state];
    if (!isLiveState2(fromState)) throw new Error("\u5C5E\u5DDE\u306E\u6240\u5C5E\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u65B0\u3057\u3044\u56FD\u5BB6\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    const c = map.pack.cells;
    const cells = [];
    for (let i = 0; i < c.province.length; i++) if (c.province[i] === provinceId) cells.push(i);
    if (!cells.length) throw new Error("\u305D\u306E\u5C5E\u5DDE\u306B\u306F\u30BB\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u72EC\u7ACB\u3055\u305B\u308B\u9818\u571F\u304C\u3042\u308A\u307E\u305B\u3093\uFF09");
    const areas = cellAreas(map.geometry);
    const newId = map.pack.states.length || 1;
    const liveCount = map.pack.states.filter(isLiveState2).length;
    let rural = 0, area = 0, urban = 0;
    const burgIds = [];
    for (const i of cells) {
      rural += c.pop[i] ?? 0;
      area += areas[i];
      const b = liveBurg2(map, c.burg[i]);
      if (b) {
        urban += b.population ?? 0;
        burgIds.push(b.i);
      }
    }
    const memberSet = new Set(cells);
    let remaining = 0;
    for (let i = 0; i < c.state.length; i++) if (c.state[i] === fromState.i && !memberSet.has(i)) remaining++;
    if (!remaining) throw new Error("\u3053\u306E\u5C5E\u5DDE\u306F\u56FD\u5BB6\u306E\u5168\u9818\u571F\u306A\u306E\u3067\u72EC\u7ACB\u3055\u305B\u3089\u308C\u307E\u305B\u3093\uFF08\u56FD\u5BB6\u540D\u3092\u5909\u3048\u308B\u304B\u3001\u7D71\u5408\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\uFF09");
    const byPop = (a, b) => (b.population ?? 0) - (a.population ?? 0);
    const inProvince = burgIds.map((id) => map.pack.burgs[id]);
    const centerBurg = liveBurg2(map, province.burg);
    const capitalBurg = centerBurg && burgIds.includes(centerBurg.i) ? centerBurg : inProvince.slice().sort(byPop)[0];
    if (!capitalBurg) throw new Error("\u3053\u306E\u5C5E\u5DDE\u306B\u306F\u90FD\u5E02\u304C1\u3064\u3082\u7121\u3044\u305F\u3081\u72EC\u7ACB\u3055\u305B\u3089\u308C\u307E\u305B\u3093\u3002\u5148\u306B\u90FD\u5E02\u3092\u7F6E\u3044\u3066\u304F\u3060\u3055\u3044");
    let newFromCapital = null;
    if (burgIds.includes(fromState.capital)) {
      newFromCapital = map.pack.burgs.filter((b) => liveBurg2(map, b?.i) && b.state === fromState.i && !burgIds.includes(b.i)).sort(byPop)[0];
      if (!newFromCapital) throw new Error("\u72EC\u7ACB\u3055\u305B\u308B\u3068\u5143\u306E\u56FD\u5BB6\u306B\u90FD\u5E02\u304C1\u3064\u3082\u6B8B\u3089\u306A\u3044\u305F\u3081\u3001\u72EC\u7ACB\u3055\u305B\u3089\u308C\u307E\u305B\u3093");
    }
    const newState = {
      i: newId,
      name: trimmed,
      fullName: trimmed,
      color: pickColor(liveCount, rnd),
      cells: cells.length,
      area: round62(area),
      rural: round62(rural),
      urban: round62(urban),
      burgs: burgIds.length,
      capital: capitalBurg.i,
      neighbors: []
    };
    const statesList = map.pack.states.length ? map.pack.states.slice() : [null];
    statesList[newId] = newState;
    const parts = [
      setList((m) => m.pack.states, (m, v) => {
        m.pack.states = v;
      }, statesList),
      setIndexed((m) => m.pack.cells.state, cells.map((i) => [i, c.state[i], newId])),
      // 属州はそのまま新国家に付け替える（独立した属州は、新国家の中心的な属州として引き継ぐ）
      setProps(province, { state: newId })
    ];
    for (const bid of burgIds) parts.push(setProps(map.pack.burgs[bid], { state: newId, capital: bid === capitalBurg.i ? 1 : 0 }));
    if (newFromCapital) parts.push(setProps(newFromCapital, { capital: 1 }));
    const patch = {};
    if (typeof fromState.cells === "number") patch.cells = Math.max(0, fromState.cells - cells.length);
    if (typeof fromState.area === "number") patch.area = round62(Math.max(0, fromState.area - area));
    if (typeof fromState.rural === "number") patch.rural = round62(Math.max(0, fromState.rural - rural));
    if (typeof fromState.urban === "number") patch.urban = round62(Math.max(0, fromState.urban - urban));
    if (typeof fromState.burgs === "number") patch.burgs = Math.max(0, fromState.burgs - burgIds.length);
    else if (Array.isArray(fromState.burgs)) patch.burgs = fromState.burgs.filter((b) => !burgIds.includes(b));
    if (newFromCapital) patch.capital = newFromCapital.i;
    parts.push(setProps(fromState, patch));
    const newPole = computePole(map, (cell) => memberSet.has(cell) ? newId : -1, newId);
    if (newPole) parts.push(setProps(newState, { pole: newPole }));
    if (fromState.pole) {
      const poleCell = nearestCell(map, fromState.pole);
      const stillInside = c.state[poleCell] === fromState.i && !memberSet.has(poleCell);
      if (!stillInside) {
        const remainPole = computePole(map, (cell) => c.state[cell] === fromState.i && !memberSet.has(cell) ? fromState.i : -1, fromState.i);
        if (remainPole) parts.push(setProps(fromState, { pole: remainPole }));
      }
    }
    if (date) {
      parts.push(logEntry(map, {
        type: "independence",
        year: date.year,
        month: date.month,
        fromState: fromState.i,
        newState: newId,
        provinceId,
        provinceName: province.fullName ?? province.name,
        name: trimmed
      }));
    }
    const markerCell = capitalBurg.cell;
    const markerPart = addEventMarker(map, { cell: markerCell, type: "independence", name: `${trimmed}\u72EC\u7ACB\u5BA3\u8A00${date ? `\uFF08${date.year}\u5E74${date.month}\u6708\uFF09` : ""}` });
    if (markerPart) parts.push(markerPart);
    return { command: makeCommand(`\u5C5E\u5DDE\u300C${province.fullName ?? province.name}\u300D\u306E\u72EC\u7ACB`, ["politics"], parts), id: newId };
  }
  function planMergeStates(map, { from, to, date }) {
    if (from === to) throw new Error("\u540C\u3058\u56FD\u5BB6\u306F\u7D71\u5408\u3067\u304D\u307E\u305B\u3093");
    const fromState = map.pack.states[from], toState = map.pack.states[to];
    if (!isLiveState2(fromState)) throw new Error("\u7D71\u5408\u5143\u306E\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!isLiveState2(toState)) throw new Error("\u7D71\u5408\u5148\u306E\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const c = map.pack.cells;
    const cells = [];
    for (let i = 0; i < c.state.length; i++) if (c.state[i] === from) cells.push(i);
    const parts = [];
    if (cells.length) {
      parts.push(setIndexed((m) => m.pack.cells.state, cells.map((i) => [i, from, to])));
    }
    const movedBurgIds = [];
    for (const b of map.pack.burgs) {
      if (!isLive14(b) || !b.i || b.state !== from) continue;
      const patch = { state: to };
      if (b.capital) patch.capital = 0;
      parts.push(setProps(b, patch));
      movedBurgIds.push(b.i);
    }
    for (const pr of map.pack.provinces) {
      if (isLive14(pr) && pr.i && pr.state === from) parts.push(setProps(pr, { state: to }));
    }
    const toPatch = {};
    if (typeof toState.cells === "number" && typeof fromState.cells === "number") toPatch.cells = toState.cells + fromState.cells;
    if (typeof toState.area === "number" && typeof fromState.area === "number") toPatch.area = round62(toState.area + fromState.area);
    if (typeof toState.rural === "number" && typeof fromState.rural === "number") toPatch.rural = round62(toState.rural + fromState.rural);
    if (typeof toState.urban === "number" && typeof fromState.urban === "number") toPatch.urban = round62(toState.urban + fromState.urban);
    if (typeof toState.burgs === "number") toPatch.burgs = toState.burgs + movedBurgIds.length;
    else if (Array.isArray(toState.burgs)) toPatch.burgs = [...toState.burgs, ...movedBurgIds];
    if (Array.isArray(fromState.military) && fromState.military.length) {
      toPatch.military = [...Array.isArray(toState.military) ? toState.military : [], ...fromState.military];
    }
    if (Object.keys(toPatch).length) parts.push(setProps(toState, toPatch));
    parts.push(setProps(fromState, { removed: true, cells: 0, area: 0, rural: 0, urban: 0, burgs: 0, capital: 0, military: [] }));
    if (date) {
      parts.push(logEntry(map, {
        type: "merge",
        year: date.year,
        month: date.month,
        fromState: from,
        fromName: fromState.fullName ?? fromState.name,
        toState: to,
        toName: toState.fullName ?? toState.name
      }));
    }
    const oldCapital = map.pack.burgs[fromState.capital];
    const markerCell = oldCapital ? oldCapital.cell : cells[0];
    const markerPart = addEventMarker(map, {
      cell: markerCell,
      type: "founding",
      name: `${fromState.fullName ?? fromState.name}\u304C${toState.fullName ?? toState.name}\u306B\u7D71\u5408${date ? `\uFF08${date.year}\u5E74${date.month}\u6708\uFF09` : ""}`
    });
    if (markerPart) parts.push(markerPart);
    return makeCommand(`\u300C${fromState.fullName ?? fromState.name}\u300D\u3092\u300C${toState.fullName ?? toState.name}\u300D\u306B\u7D71\u5408`, ["politics"], parts);
  }

  // js/io/chronicle-text.js
  var getNote2 = getNote;
  var ENTITIES2 = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  function htmlToEditableText(html) {
    return String(html ?? "").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n").replace(/<\s*li[^>]*>/gi, "\u30FB").replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2\uFF08$1\uFF09").replace(/<[^>]+>/g, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES2[m]).replace(/\n{3,}/g, "\n\n").trim();
  }

  // js/io/chronicle.js
  var CHRONICLE_FORMAT = "alterhistory-chronicle";
  var CHRONICLE_VERSION = 1;
  var live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  var r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  var validDate = (d) => !!d && Number.isFinite(d.year) && Number.isFinite(d.month);
  var dateKey = (d) => validDate(d) ? d.year * 12 + (d.month - 1) : Infinity;
  var fmtDate = (d) => validDate(d) ? `${d.year}\u5E74${d.month}\u6708` : null;
  var UNIT_LABEL = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, { label: u.label, unit: u.unit }]));
  var STATE_TYPE_LABEL = {
    Generic: "\u6A19\u6E96\u578B\uFF08\u7279\u8272\u306A\u3057\uFF09",
    Naval: "\u6D77\u6D0B\u56FD\u5BB6\uFF08\u6D77\u8ECD\u304C\u5F97\u610F\uFF09",
    Nomadic: "\u904A\u7267\u56FD\u5BB6\uFF08\u6A5F\u52D5\u529B\u30FB\u7279\u6B8A\u90E8\u968A\u304C\u5F97\u610F\uFF09",
    Highland: "\u5C71\u5CB3\u56FD\u5BB6\uFF08\u6B69\u5175\u30FB\u7279\u6B8A\u90E8\u968A\u304C\u5F97\u610F\uFF09",
    Hunting: "\u72E9\u731F\u56FD\u5BB6\uFF08\u7279\u6B8A\u90E8\u968A\u304C\u5F97\u610F\uFF09",
    Lake: "\u6E56\u6CBC\u56FD\u5BB6\uFF08\u6C34\u8ECD\u304C\u3084\u3084\u5F97\u610F\uFF09",
    River: "\u6CB3\u5DDD\u56FD\u5BB6\uFF08\u6C34\u8ECD\u304C\u3084\u3084\u5F97\u610F\uFF09"
  };
  var FORM_LABEL = {
    Monarchy: "\u541B\u4E3B\u5236",
    Republic: "\u5171\u548C\u5236",
    Theocracy: "\u795E\u6A29\u653F\u6CBB",
    Union: "\u9023\u5408",
    Federation: "\u9023\u90A6",
    Empire: "\u5E1D\u56FD",
    Kingdom: "\u738B\u56FD",
    Duchy: "\u516C\u56FD",
    Principality: "\u4FAF\u56FD",
    March: "\u8FBA\u5883\u4F2F\u9818",
    Emirate: "\u9996\u9577\u56FD",
    Sultanate: "\u30B9\u30EB\u30BF\u30F3\u56FD",
    Caliphate: "\u30AB\u30EA\u30D5\u56FD",
    Khaganate: "\u53EF\u6C57\u56FD",
    Horde: "\u30AA\u30EB\u30C0",
    Oligarchy: "\u5BE1\u982D\u5236",
    Tribe: "\u90E8\u65CF",
    Commonwealth: "\u5171\u548C\u56FD",
    Confederation: "\u9023\u5408\u56FD",
    Custom: "\u72EC\u81EA"
  };
  var formLabel = (f) => f ? FORM_LABEL[f] ? `${FORM_LABEL[f]}\uFF08${f}\uFF09` : f : null;
  var rel = (r) => r ? relationLabel(r) : null;
  function peaceTermsOfFactory(namer) {
    return (t) => ({
      name: t.treatyName ?? null,
      kind: t.kind ?? "standard",
      venue: t.venue?.place ?? null,
      signedAt: t.signedAt ? `${t.signedAt.year}\u5E74${t.signedAt.month}\u6708` : null,
      notes: t.notes ?? "",
      cessions: (t.cessions ?? []).map((c) => ({ name: c.name ?? "", from: namer.state(c.fromStateId), to: namer.state(c.toStateId), cells: c.cells ?? 0, burgs: c.burgs ?? [] })),
      reparations: (t.reparations && Array.isArray(t.reparations) ? t.reparations : []).map((r) => ({ from: namer.state(r.fromStateId), to: namer.state(r.toStateId), amount: r.amount, currency: r.currency ?? null, received: r.received ?? null, receivedCurrency: r.receivedCurrency ?? null })),
      annex: (t.annex ?? []).map((x) => ({ from: namer.state(x.fromStateId), to: namer.state(x.toStateId) })),
      vassalize: (t.vassalize ?? []).map((x) => ({ from: namer.state(x.fromStateId), to: namer.state(x.toStateId), kind: { puppet: "\u5080\u5121", protectorate: "\u4FDD\u8B77\u56FD", vassal: "\u5C5E\u56FD" }[x.kind] ?? x.kind })),
      // 旧形式
      cededProvinces: (t.provinceIds ?? []).map((id) => namer.province(id)),
      cededUnaffiliatedRegions: (t.regionCells ?? []).length,
      cededTo: t.toStateId != null ? namer.state(t.toStateId) : null,
      legacyReparations: typeof t.reparations === "number" ? t.reparations : 0
    });
  }
  function newAcc() {
    return { n: 0, sx: 0, sy: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  }
  function addPt(a, x, y) {
    a.n++;
    a.sx += x;
    a.sy += y;
    if (x < a.x0) a.x0 = x;
    if (x > a.x1) a.x1 = x;
    if (y < a.y0) a.y0 = y;
    if (y > a.y1) a.y1 = y;
  }
  function describePosition(x, y, w, h) {
    if (!w || !h) return "";
    const fx = x / w, fy = y / h;
    const col = fx < 0.33 ? "\u897F" : fx > 0.67 ? "\u6771" : "";
    const row = fy < 0.33 ? "\u5317" : fy > 0.67 ? "\u5357" : "";
    if (!col && !row) return "\u4E2D\u592E";
    return `${row}${col}`;
  }
  function rle(arr) {
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
  function makeNamer(map) {
    const P = map.pack;
    const nm = (list, id, fallbackLabel) => {
      const e = list?.[id];
      if (!e || typeof e !== "object") return `${fallbackLabel}#${id}\uFF08\u5B58\u5728\u3057\u306A\u3044\uFF09`;
      const base = e.fullName ?? e.name ?? `${fallbackLabel}#${id}`;
      const clean = String(base).replace(/[（(]消滅[）)]/g, "").trim();
      return e.removed ? `${clean}\uFF08\u6D88\u6EC5\uFF09` : clean;
    };
    return {
      state: (id) => id === 0 ? "\u7121\u6240\u5C5E" : nm(P.states, id, "\u56FD\u5BB6"),
      culture: (id) => id === 0 ? "\u306A\u3057" : nm(P.cultures, id, "\u6587\u5316"),
      religion: (id) => id === 0 ? "\u306A\u3057" : nm(P.religions, id, "\u5B97\u6559"),
      province: (id) => id === 0 ? "\u306A\u3057" : nm(P.provinces, id, "\u5C5E\u5DDE"),
      burg: (id) => id === 0 ? "\u306A\u3057" : nm(P.burgs, id, "\u90FD\u5E02")
    };
  }
  var ref = (namer, kind, id) => ({ id, name: namer[kind](id) });
  function analyzeTerritory(map) {
    const c = map.pack.cells;
    const { p, cells: gc } = map.geometry.pack;
    const areas = cellAreas(map.geometry);
    const W = map.meta.width, H = map.meta.height;
    const N = c.biome.length;
    const bySt = /* @__PURE__ */ new Map();
    const ensure = (id) => {
      if (!bySt.has(id)) bySt.set(id, { acc: newAcc(), cells: 0, area: 0, pop: 0, biome: /* @__PURE__ */ new Map(), neighbors: /* @__PURE__ */ new Map(), coastCells: 0, rivers: /* @__PURE__ */ new Set(), border: 0 });
      return bySt.get(id);
    };
    const cult = /* @__PURE__ */ new Map(), relg = /* @__PURE__ */ new Map(), prov = /* @__PURE__ */ new Map();
    const bump = (m, id, cell) => {
      const o = m.get(id) ?? { acc: newAcc(), cells: 0, area: 0 };
      addPt(o.acc, p[cell][0], p[cell][1]);
      o.cells++;
      o.area += areas[cell];
      m.set(id, o);
    };
    let waterCells = 0, landCells = 0, totalArea = 0, totalPop = 0;
    for (let i = 0; i < N; i++) {
      if (c.biome[i] === 0) {
        waterCells++;
        continue;
      }
      landCells++;
      totalArea += areas[i];
      totalPop += c.pop[i] ?? 0;
      const s = ensure(c.state[i]);
      addPt(s.acc, p[i][0], p[i][1]);
      s.cells++;
      s.area += areas[i];
      s.pop += c.pop[i] ?? 0;
      s.biome.set(c.biome[i], (s.biome.get(c.biome[i]) ?? 0) + 1);
      if (c.river[i] > 0) s.rivers.add(c.river[i]);
      let coastal = false, frontier = false;
      for (const j of gc.c[i]) {
        if (c.biome[j] === 0) coastal = true;
        else if (c.state[j] !== c.state[i]) {
          frontier = true;
          s.neighbors.set(c.state[j], (s.neighbors.get(c.state[j]) ?? 0) + 1);
        }
      }
      if (coastal) s.coastCells++;
      if (frontier) s.border++;
      bump(cult, c.culture[i], i);
      bump(relg, c.religion[i], i);
      bump(prov, c.province[i], i);
    }
    return { bySt, cult, relg, prov, W, H, waterCells, landCells, totalArea, totalPop };
  }
  var summarizeAcc = (a, W, H) => a.n ? {
    centroid: [Math.round(a.sx / a.n), Math.round(a.sy / a.n)],
    bounds: { x: [Math.round(a.x0), Math.round(a.x1)], y: [Math.round(a.y0), Math.round(a.y1)] },
    position: describePosition(a.sx / a.n, a.sy / a.n, W, H)
  } : null;
  function buildChronicle(map, { includeCells = true, fileName = "", exportedAt = "" } = {}) {
    const P = map.pack, C = P.cells;
    const namer = makeNamer(map);
    const T = analyzeTerritory(map);
    const W = T.W, H = T.H;
    const now = map.worldTime ?? { year: 1, month: 1 };
    const eras = listEras(map);
    const eraName = (d) => validDate(d) ? eraAt(map, d.year)?.name ?? null : null;
    const biomeName = (id) => map.biomesData[id]?.name ?? `\u30D0\u30A4\u30AA\u30FC\u30E0#${id}`;
    const liveStates = P.states.filter(live);
    const noteOf = (type, id) => {
      const t = getNote2(map, type, id);
      return t ? htmlToEditableText(t) : null;
    };
    const states = liveStates.map((s) => {
      const t = T.bySt.get(s.i);
      const doctrineKey = DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
      const regs = Array.isArray(s.military) ? s.military : [];
      const cap = P.burgs[s.capital];
      const neighborList = t ? [...t.neighbors.entries()].filter(([id]) => id !== s.i).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ ...ref(namer, "state", id), borderCells: n })) : [];
      const biomeShare = t ? [...t.biome.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ biome: biomeName(id), cells: n, percent: Math.round(n / Math.max(1, t.cells) * 100) })) : [];
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
        stateType: { id: s.type ?? "Generic", meaning: STATE_TYPE_LABEL[s.type ?? "Generic"] ?? "\u4E0D\u660E" },
        color: s.color ?? null,
        capital: cap && !cap.removed ? { id: cap.i, name: cap.name, cell: cap.cell } : null,
        dominantCulture: s.culture != null ? ref(namer, "culture", s.culture) : null,
        territory: {
          cells: t?.cells ?? 0,
          approxArea: t?.area ?? 0,
          landPercentOfWorld: t ? Math.round(t.cells / Math.max(1, T.landCells) * 1e3) / 10 : 0,
          coastalCells: t?.coastCells ?? 0,
          isLandlocked: !!t && t.coastCells === 0,
          borderCells: t?.border ?? 0,
          geography: t ? summarizeAcc(t.acc, W, H) : null,
          terrain: biomeShare,
          riverCount: t?.rivers.size ?? 0,
          neighbors: neighborList
        },
        population: {
          total: r2(statePopulation(s)),
          rural: r2(s.rural),
          urban: r2(s.urban),
          unit: "\u5343\u4EBA\uFF08Azgaar \u306E rural/urban \u3068\u540C\u3058\u5358\u4F4D\uFF09",
          note: "\u7D4C\u6E08\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u3067\u5E74\u6B21\u66F4\u65B0\u3055\u308C\u308B\u56FD\u5BB6\u5358\u4F4D\u306E\u96C6\u8A08\u5024\u3002\u30BB\u30EB\u5358\u4F4D\u306E\u4EBA\u53E3(cells.pop)\u3068\u306F\u4E00\u81F4\u3057\u306A\u3044\u3002"
        },
        economy: { techLevel: typeof s.techLevel === "number" ? s.techLevel : 3, techLevelIsDefault: typeof s.techLevel !== "number", industry: r2(s.industry ?? 0), popCarryingCapacity: s.popCarryCap != null ? r2(s.popCarryCap) : null },
        military: {
          doctrine: { id: doctrineKey, label: DOCTRINE_BY_KEY[doctrineKey].label },
          regimentCount: regs.length,
          totalHeadcount: regs.reduce((a, r) => a + forceHeadcount(r.u), 0),
          totalPower: r2(regs.reduce((a, r) => a + forcePower(r.u, doctrineKey), 0)),
          regiments: regs.map((r) => ({
            id: r.i,
            name: r.name,
            icon: r.icon ?? null,
            cell: r.cell,
            position: describePosition(r.x ?? 0, r.y ?? 0, W, H),
            locatedIn: ref(namer, "state", C.state[r.cell] ?? 0),
            units: Object.fromEntries(Object.entries(r.u ?? {}).filter(([, n]) => n > 0).map(([k, n]) => [UNIT_LABEL[k]?.label ?? k, `${n}${UNIT_LABEL[k]?.unit ?? ""}`])),
            unitsRaw: r.u ?? {}
          }))
        },
        provinces: (s.provinces ?? []).map((id) => P.provinces[id]).filter(live).map((p) => ({ id: p.i, name: p.fullName ?? p.name })),
        diplomacy,
        alliances: listAlliances(map).filter((a) => a.members.includes(s.i)).map((a) => ({ id: a.id, name: a.name, active: !a.dissolvedAt, formed: fmtDate(a.formedAt), dissolved: fmtDate(a.dissolvedAt) })),
        note: noteOf("state", s.i)
      };
    });
    const mergeLog = listSovereigntyLog(map).filter((x) => x.type === "merge");
    const extinctStates = P.states.filter((e) => e && typeof e === "object" && e.removed && e.i > 0).map((e) => {
      const m = mergeLog.find((x) => x.fromState === e.i);
      return {
        id: e.i,
        name: e.fullName ?? e.name,
        shortName: e.name,
        governmentForm: formLabel(e.form ?? e.formName),
        color: e.color ?? null,
        extinct: true,
        extinctAt: m ? fmtDate(m) : null,
        extinctEra: m ? eraName(m) : null,
        absorbedBy: m ? ref(namer, "state", m.toState) : null,
        // 統合すると capital は 0 に戻される。統合マーカー（旧首都のセルに立つ）から旧首都を復元する
        formerCapital: P.burgs[e.capital]?.name ?? recoverFormerCapital(map, e, m),
        note: noteOf("state", e.i),
        note2: "\u9818\u571F\u30FB\u90FD\u5E02\u30FB\u5C5E\u5DDE\u30FB\u90E8\u968A\u306F\u5168\u3066\u4F75\u5408\u5148\u306B\u79FB\u3063\u3066\u3044\u308B\u3002\u904E\u53BB\u306E\u6226\u4E89\u30FB\u540C\u76DF\u30FB\u5916\u4EA4\u306E\u8A18\u9332\u306B\u306F\u540D\u524D\u304C\u6B8B\u308B\u3002"
      };
    });
    const mkEntity = (kind, list, tally, extra) => list.filter(live).map((e) => {
      const t = tally.get(e.i);
      return {
        id: e.i,
        name: e.fullName ?? e.name,
        color: e.color ?? null,
        type: e.type ?? null,
        cells: t?.cells ?? 0,
        geography: t ? summarizeAcc(t.acc, W, H) : null,
        note: noteOf(kind, e.i),
        ...extra(e)
      };
    });
    const cultures = mkEntity("culture", P.cultures, T.cult, (e) => ({ originCultures: (e.origins ?? []).filter((o) => o !== 0 || e.i === 0).map((o) => namer.culture(o)), homeCell: e.center ?? null }));
    const religions = mkEntity("religion", P.religions, T.relg, (e) => ({ form: e.form ?? null, deity: e.deity ?? null, originatedInCulture: e.culture != null ? namer.culture(e.culture) : null, originReligions: (e.origins ?? []).filter((o) => o !== 0).map((o) => namer.religion(o)) }));
    const provinces = mkEntity("province", P.provinces, T.prov, (e) => ({ state: ref(namer, "state", e.state), centerBurg: e.burg ? ref(namer, "burg", e.burg) : null }));
    const burgs = P.burgs.filter(live).map((b) => ({
      id: b.i,
      name: b.name,
      isCapital: !!b.capital,
      isPort: !!b.port,
      state: ref(namer, "state", b.state),
      culture: ref(namer, "culture", b.culture),
      province: ref(namer, "province", C.province[b.cell] ?? 0),
      religion: ref(namer, "religion", C.religion[b.cell] ?? 0),
      population: r2((b.population ?? 0) * 1e3),
      populationUnit: "\u4EBA\uFF08\u5343\u4EBA\u5358\u4F4D\u306E\u4FDD\u5B58\u5024\u3092\xD71000\uFF09",
      cell: b.cell,
      position: describePosition(b.x, b.y, W, H),
      xy: [Math.round(b.x), Math.round(b.y)],
      type: b.type ?? null,
      group: b.group ?? null,
      walls: !!b.walls,
      plaza: !!b.plaza,
      citadel: !!b.citadel,
      temple: !!b.temple,
      shanty: !!b.shanty,
      note: noteOf("burg", b.i)
    }));
    const markers = map.markers.map((m) => ({
      id: m.i,
      name: m.name ?? null,
      type: m.type ?? null,
      icon: m.icon ?? null,
      cell: m.cell ?? null,
      xy: [Math.round(m.x ?? 0), Math.round(m.y ?? 0)],
      position: describePosition(m.x ?? 0, m.y ?? 0, W, H),
      inState: ref(namer, "state", C.state[m.cell] ?? 0),
      note: noteOf("marker", m.i)
    }));
    const rivers = (P.rivers ?? []).filter((r) => r && r.i).map((r) => ({ id: r.i, name: r.name ?? null, type: r.type ?? null, length: r.length ?? null, discharge: r.discharge ?? null, sourceCell: r.source ?? null, mouthCell: r.mouth ?? null }));
    const zones = (map.zones ?? []).filter(Boolean).map((z) => ({ name: z.name ?? null, type: z.type ?? null, cells: Array.isArray(z.cells) ? z.cells.length : null }));
    const stateNames = (ids2) => ids2.map((id) => ref(namer, "state", id));
    const wars = listWars(map).map((w) => {
      const wins = { attacker: 0, defender: 0 };
      for (const b of w.battles ?? []) wins[b.winner] = (wins[b.winner] ?? 0) + 1;
      return {
        id: w.id,
        name: w.name,
        status: w.endedAt ? "\u7D42\u7D50" : "\u7D99\u7D9A\u4E2D",
        started: fmtDate(w.startedAt),
        startedEra: eraName(w.startedAt),
        ended: fmtDate(w.endedAt),
        endedEra: eraName(w.endedAt),
        attackers: stateNames(w.attackers),
        defenders: stateNames(w.defenders),
        battleCount: (w.battles ?? []).length,
        attackerWins: wins.attacker,
        defenderWins: wins.defender,
        type: w.type ?? null,
        warScore: w.result?.warScore ?? null,
        battles: (w.battles ?? []).map((b) => ({
          date: fmtDate(b.date ?? b),
          name: b.name ?? null,
          place: b.place ?? null,
          text: b.text ?? null,
          attacker: namer.state(b.attackerState),
          defender: namer.state(b.defenderState),
          winner: b.winner === "attacker" ? namer.state(b.attackerState) : namer.state(b.defenderState),
          winnerSide: b.winner,
          attackerPower: b.aPower ?? null,
          defenderPower: b.dPower ?? null
        })),
        peaceTerms: w.terms ? peaceTermsOfFactory(namer)(w.terms) : null
      };
    });
    const alliances = listAlliances(map).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.dissolvedAt ? "\u89E3\u6D88\u6E08\u307F" : "\u5B58\u7D9A\u4E2D",
      members: stateNames(a.members),
      formed: fmtDate(a.formedAt),
      dissolved: fmtDate(a.dissolvedAt)
    }));
    const timeline = [];
    const push = (date, type, title, detail, involved = []) => timeline.push({
      date: fmtDate(date),
      year: validDate(date) ? date.year : null,
      month: validDate(date) ? date.month : null,
      era: eraName(date),
      type,
      title,
      detail: detail ?? null,
      involvedStates: involved,
      _k: dateKey(date)
    });
    for (const e of eras) push({ year: e.fromYear, month: 1 }, "era", `\u6642\u4EE3\u300C${e.name}\u300D\u306E\u59CB\u307E\u308A`, `${e.fromYear}\u5E74\u304B\u3089\u3002`);
    for (const a of listAlliances(map)) {
      push(a.formedAt, "alliance-formed", `\u540C\u76DF\u300C${a.name}\u300D\u7D50\u6210`, `\u52A0\u76DF\u56FD: ${a.members.map(namer.state).join("\u3001")}`, stateNames(a.members));
      if (a.dissolvedAt) push(a.dissolvedAt, "alliance-dissolved", `\u540C\u76DF\u300C${a.name}\u300D\u89E3\u6D88`, `\u52A0\u76DF\u56FD\u3060\u3063\u305F: ${a.members.map(namer.state).join("\u3001")}`, stateNames(a.members));
    }
    for (const d of listDiplomacyLog(map)) {
      push(d, "diplomacy", `\u5916\u4EA4: ${namer.state(d.a)} \u3068 ${namer.state(d.b)} \u306E\u95A2\u4FC2\u304C\u5909\u5316`, `${d.from ? rel(d.from) : "\u672A\u8A2D\u5B9A"} \u2192 ${rel(d.to)}\uFF08${namer.state(d.a)} \u304B\u3089\u898B\u305F\u95A2\u4FC2\uFF09`, [ref(namer, "state", d.a), ref(namer, "state", d.b)]);
    }
    for (const w of listWars(map)) {
      push(w.startedAt, "war-declared", `\u6226\u4E89\u300C${w.name}\u300D\u958B\u6226`, `\u653B\u6483\u5074: ${w.attackers.map(namer.state).join("\u3001")} / \u9632\u5FA1\u5074: ${w.defenders.map(namer.state).join("\u3001")}`, [...stateNames(w.attackers), ...stateNames(w.defenders)]);
      for (const b of w.battles ?? []) push(b, "battle", `\u6226\u95D8\uFF08${w.name}\uFF09`, `${namer.state(b.attackerState)}\uFF08\u653B\uFF09\u5BFE ${namer.state(b.defenderState)}\uFF08\u9632\uFF09\u2192 ${b.winner === "attacker" ? namer.state(b.attackerState) : namer.state(b.defenderState)} \u306E\u52DD\u5229\uFF08\u6226\u529B ${b.aPower} \u5BFE ${b.dPower}\uFF09`, [ref(namer, "state", b.attackerState), ref(namer, "state", b.defenderState)]);
      if (w.endedAt) {
        const t = w.terms, nm = (id) => namer.state(id);
        const body = !t ? "\u6761\u4EF6\u306E\u8A18\u9332\u306A\u3057" : t.cessions || t.annex || Array.isArray(t.reparations) ? `${t.treatyName ?? "\u8B1B\u548C\u6761\u7D04"}\uFF08${{ standard: "\u901A\u5E38\u306E\u8B1B\u548C", white: "\u767D\u7D19\u548C\u5E73", annex: "\u5168\u9762\u964D\u4F0F" }[t.kind ?? "standard"]}\uFF09${(t.cessions ?? []).length ? ` / \u5272\u8B72 ${(t.cessions ?? []).map((c) => `${c.name || "\u533A\u753B"}\u2192${nm(c.toStateId)}`).join("\u3001")}` : ""}${(t.reparations ?? []).length ? ` / \u8CE0\u511F ${(t.reparations ?? []).map((r) => `${nm(r.fromStateId)}\u2192${nm(r.toStateId)} ${r.amount}`).join("\u3001")}` : ""}${(t.annex ?? []).length ? ` / \u4F75\u5408 ${(t.annex ?? []).map((x) => `${nm(x.fromStateId)}\u2192${nm(x.toStateId)}`).join("\u3001")}` : ""}` : `\u5272\u8B72: ${(t.provinceIds ?? []).map(namer.province).join("\u3001") || "\u5C5E\u5DDE\u306A\u3057"}${(t.regionCells ?? []).length ? ` \u307B\u304B\u672A\u7DE8\u5165\u5730\u57DF${t.regionCells.length}\u304B\u6240` : ""} \u2192 ${namer.state(t.toStateId)}${t.reparations ? ` / \u8CE0\u511F(\u7523\u696D\u529B) ${t.reparations}` : ""}`;
        push(w.endedAt, "war-ended", `\u6226\u4E89\u300C${w.name}\u300D\u8B1B\u548C`, body, [...stateNames(w.attackers), ...stateNames(w.defenders)]);
      }
    }
    for (const s of listSovereigntyLog(map)) {
      if (s.type === "merge") {
        push(
          s,
          "state-merged",
          `\u56FD\u5BB6\u306E\u7D71\u5408: ${s.fromName ?? namer.state(s.fromState)} \u304C ${s.toName ?? namer.state(s.toState)} \u306B\u4F75\u5408`,
          `${s.fromName ?? namer.state(s.fromState)} \u306F\u89E3\u6563\u3057\u3001\u5168\u9818\u571F\u30FB\u90FD\u5E02\u30FB\u5C5E\u5DDE\u30FB\u90E8\u968A\u304C ${s.toName ?? namer.state(s.toState)} \u306B\u79FB\u3063\u305F\u3002`,
          [ref(namer, "state", s.fromState), ref(namer, "state", s.toState)]
        );
      } else if (s.type === "independence") {
        push(
          s,
          "independence",
          `\u5C5E\u5DDE\u306E\u72EC\u7ACB: ${s.provinceName ?? namer.province(s.provinceId)} \u304C ${namer.state(s.fromState)} \u304B\u3089\u72EC\u7ACB\u3057\u300C${s.name ?? namer.state(s.newState)}\u300D\u3092\u5EFA\u56FD`,
          `\u65B0\u56FD\u5BB6\u300C${s.name ?? namer.state(s.newState)}\u300D\u306F ${namer.state(s.fromState)} \u306E ${s.provinceName ?? namer.province(s.provinceId)} \u306E\u5168\u9818\u571F\u3092\u5F15\u304D\u7D99\u3044\u3060\u3002`,
          [ref(namer, "state", s.fromState), ref(namer, "state", s.newState)]
        );
      } else {
        push(s, "sovereignty", `\u4E3B\u6A29\u306E\u5909\u52D5\uFF08${s.type ?? "\u4E0D\u660E"}\uFF09`, JSON.stringify(s));
      }
    }
    timeline.sort((a, b) => a._k - b._k);
    for (const t of timeline) delete t._k;
    const cells = includeCells ? {
      note: "\u5404\u914D\u5217\u306F [\u5024, \u9023\u7D9A\u6570] \u306E\u5217\uFF08\u30E9\u30F3\u30EC\u30F3\u30B0\u30B9\uFF09\u3002unrle \u3067\u5C55\u958B\u3059\u308B\u3068\u6DFB\u5B57=\u30BB\u30EBID\u3002\u5024\u306E\u610F\u5473\u306F legend \u3092\u53C2\u7167\u3002",
      count: C.biome.length,
      legend: { biome: "\u30D0\u30A4\u30AA\u30FC\u30E0ID\u2192 biomes", state: "\u56FD\u5BB6ID\u2192 states[].id\uFF080=\u7121\u6240\u5C5E\uFF09", culture: "\u6587\u5316ID\u2192 cultures[].id", religion: "\u5B97\u6559ID\u2192 religions[].id", province: "\u5C5E\u5DDEID\u2192 provinces[].id", burg: "\u90FD\u5E02ID\u2192 burgs[].id\uFF080=\u306A\u3057\uFF09", river: "\u6CB3\u5DDDID\u2192 rivers[].id\uFF080=\u306A\u3057\uFF09", pop: "\u30BB\u30EB\u4EBA\u53E3\uFF08\u5343\u4EBA\uFF09" },
      biome: rle(C.biome),
      state: rle(C.state),
      culture: rle(C.culture),
      religion: rle(C.religion),
      province: rle(C.province),
      burg: rle(C.burg),
      river: rle(C.river),
      pop: rle(C.pop.map((v) => r2(v))),
      points: map.geometry.pack.p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
    } : null;
    return {
      format: CHRONICLE_FORMAT,
      formatVersion: CHRONICLE_VERSION,
      exportedAt: exportedAt || "",
      guideForAI: buildGuide(),
      world: {
        name: map.meta.name || fileName || "\u540D\u79F0\u672A\u8A2D\u5B9A\u306E\u4E16\u754C",
        sourceFile: fileName || null,
        mapSize: { width: W, height: H, note: "\u5EA7\u6A19\u7CFB: \u5DE6\u4E0A\u304C(0,0)\u3001x \u306F\u6771\u3078\u3001y \u306F\u5357\u3078\u5897\u3048\u308B\u3002\u300C\u5317\u897F\u300D\u306A\u3069\u306E position \u306F\u3053\u306E\u5EA7\u6A19\u30923\u5206\u5272\u3057\u305F\u8A00\u8449\u3002" },
        currentDate: { year: now.year, month: now.month, text: fmtDate(now), era: eraName(now) },
        eras: eras.map((e, i) => ({ id: e.id, name: e.name, fromYear: e.fromYear, untilYear: eras[i + 1] ? eras[i + 1].fromYear - 1 : null })),
        totals: {
          states: liveStates.length,
          cultures: cultures.length,
          religions: religions.length,
          provinces: provinces.length,
          burgs: burgs.length,
          markers: markers.length,
          landCells: T.landCells,
          waterCells: T.waterCells,
          totalCells: T.landCells + T.waterCells,
          totalPopulationOnCells: r2(T.totalPop),
          totalStatePopulation: r2(liveStates.reduce((a, s) => a + statePopulation(s), 0))
        },
        scale: map.settings.options?.units ? { distance: map.settings.options.units.distance, area: map.settings.options.units.area, height: map.settings.options.units.height } : null
      },
      timeline,
      states,
      extinctStates,
      cultures,
      religions,
      provinces,
      burgs,
      markers,
      rivers,
      zones,
      wars,
      alliances,
      biomes: map.biomesData.map((b) => ({ id: b.i, name: b.name, habitability: b.habitability ?? null })),
      ranking: buildRanking(states),
      consistencyChecks: buildChecks(map, states, T),
      cells
    };
  }
  function recoverFormerCapital(map, extinct, mergeEntry) {
    if (!mergeEntry) return null;
    const name = extinct.fullName ?? extinct.name;
    const mk = map.markers.find((k) => k.type === "founding" && typeof k.name === "string" && k.name.startsWith(`${name}\u304C`));
    const b = mk ? map.pack.burgs[map.pack.cells.burg[mk.cell]] : null;
    return b && !b.removed ? b.name : null;
  }
  function buildRanking(states) {
    const top = (key, fn) => [...states].sort((a, b) => fn(b) - fn(a)).map((s, i) => ({ rank: i + 1, name: s.name, value: fn(s) }));
    return {
      byTerritory: top("cells", (s) => s.territory.cells),
      byPopulation: top("pop", (s) => s.population.total),
      byMilitaryPower: top("mil", (s) => s.military.totalPower),
      byTechLevel: top("tech", (s) => s.economy.techLevel)
    };
  }
  function buildChecks(map, states, T) {
    const issues = [];
    const P = map.pack, C = P.cells;
    const cellSum = states.reduce((a, s) => a + s.territory.cells, 0);
    const neutral = T.bySt.get(0)?.cells ?? 0;
    if (cellSum + neutral !== T.landCells) issues.push(`\u56FD\u5BB6\u306E\u9818\u571F\u30BB\u30EB\u5408\u8A08(${cellSum})+\u7121\u6240\u5C5E(${neutral}) \u304C\u9678\u30BB\u30EB\u6570(${T.landCells})\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093`);
    for (const b of P.burgs.filter(live)) if (C.biome[b.cell] === 0) issues.push(`\u90FD\u5E02\u300C${b.name}\u300D\u304C\u6C34\u57DF\u306E\u30BB\u30EB\u306B\u3042\u308A\u307E\u3059`);
    for (const s of P.states.filter(live)) if (s.capital && (!P.burgs[s.capital] || P.burgs[s.capital].removed)) issues.push(`\u56FD\u5BB6\u300C${s.name}\u300D\u306E\u9996\u90FD\u304C\u5B58\u5728\u3057\u306A\u3044\u90FD\u5E02\u3092\u6307\u3057\u3066\u3044\u307E\u3059`);
    return { ok: issues.length === 0, issues };
  }
  function buildGuide() {
    return {
      purpose: "\u3053\u306E JSON \u306F\u67B6\u7A7A\u4E16\u754C\u300EALTERHISTORY\u300F\u306E\u30BB\u30FC\u30D6\u30C7\u30FC\u30BF\u3067\u3059\u3002\u3042\u306A\u305F\uFF08AI\uFF09\u306F\u3053\u308C\u3092\u8AAD\u307F\u3001\u4E16\u754C\u306E\u6B74\u53F2\u30FB\u5730\u7406\u30FB\u653F\u6CBB\u3092\u7406\u89E3\u3057\u3066\u3001\u7D9A\u304D\u306E\u6B74\u53F2\u3092\u69CB\u7BC9\u30FB\u5206\u6790\u30FB\u57F7\u7B46\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      howToRead: [
        "world: \u4E16\u754C\u306E\u57FA\u672C\u60C5\u5831\u3002currentDate \u304C\u300E\u4ECA\u300F\u306E\u5E74\u6708\u3002eras \u306F\u6642\u4EE3\u533A\u5206\uFF08\u5E74\u306E\u7BC4\u56F2\uFF09\u3002",
        "timeline: \u5168\u3066\u306E\u51FA\u6765\u4E8B\uFF08\u958B\u6226\u30FB\u6226\u95D8\u30FB\u8B1B\u548C\u30FB\u540C\u76DF\u30FB\u5916\u4EA4\u5909\u5316\u30FB\u72EC\u7ACB\u30FB\u7D71\u5408\u30FB\u6642\u4EE3\u306E\u59CB\u307E\u308A\uFF09\u3092\u6642\u7CFB\u5217\u306B\u4E26\u3079\u305F\u5E74\u8868\u3002\u6B74\u53F2\u3092\u63B4\u3080\u306B\u306F\u307E\u305A\u3053\u3053\u3092\u8AAD\u3080\u3002",
        "extinctStates: \u7D71\u5408\u3067\u6D88\u6EC5\u3057\u305F\u56FD\u5BB6\u3002\u904E\u53BB\u306E\u8A18\u9332\uFF08wars, alliances, timeline\uFF09\u306B\u540D\u524D\u304C\u51FA\u3066\u304F\u308B\u56FD\u306E\u7D20\u6027\u306F\u3053\u3053\u3067\u5206\u304B\u308B\u3002",
        "states: \u56FD\u5BB6\u3054\u3068\u306B\u9818\u571F\u30FB\u5730\u7406\u30FB\u96A3\u63A5\u56FD\u30FB\u4EBA\u53E3\u30FB\u7D4C\u6E08\u30FB\u8ECD\u4E8B(\u90E8\u968A\u306E\u5185\u8A33)\u30FB\u5916\u4EA4\u30FB\u540C\u76DF\u30FB\u30CE\u30FC\u30C8\u3092\u96C6\u7D04\u3002id \u306F\u4ED6\u306E\u5834\u6240\uFF08wars, alliances \u306A\u3069\uFF09\u304B\u3089\u306E\u53C2\u7167\u30AD\u30FC\u3002",
        "cultures / religions / provinces: \u305D\u308C\u305E\u308C\u306E\u5206\u5E03\u3068\u3001\u30E6\u30FC\u30B6\u30FC\u304C\u66F8\u3044\u305F\u30CE\u30FC\u30C8\u3002",
        "burgs: \u5168\u3066\u306E\u90FD\u5E02\uFF08\u5C0F\u3055\u306A\u3082\u306E\u3082\u542B\u3080\uFF09\u3002markers: \u5730\u56F3\u4E0A\u306E\u76EE\u5370\uFF08\u907A\u8DE1\u30FB\u53E4\u6226\u5834\u306A\u3069\uFF09\u3002",
        "wars: \u6226\u4E89\u3054\u3068\u306E\u7D4C\u904E\uFF08\u5168\u6226\u95D8\u306E\u52DD\u6557\u3068\u6226\u529B\uFF09\u3068\u8B1B\u548C\u6761\u4EF6\u3002status \u304C\u300E\u7D99\u7D9A\u4E2D\u300F\u306E\u3082\u306E\u306F\u4ECA\u3082\u6226\u4E89\u304C\u7D9A\u3044\u3066\u3044\u308B\u3002",
        "ranking: \u9818\u571F\u30FB\u4EBA\u53E3\u30FB\u8ECD\u4E8B\u529B\u30FB\u6280\u8853\u6C34\u6E96\u306E\u9806\u4F4D\u3002",
        "cells: \u30BB\u30EB\u5358\u4F4D\u306E\u5B8C\u5168\u30C7\u30FC\u30BF\uFF08\u30E9\u30F3\u30EC\u30F3\u30B0\u30B9\u5727\u7E2E\uFF09\u3002\u5730\u56F3\u3092\u53B3\u5BC6\u306B\u518D\u73FE\u3057\u305F\u3044\u3068\u304D\u3060\u3051\u4F7F\u3046\u3002\u901A\u5E38\u306F\u4E0D\u8981\u3002"
      ],
      conventions: [
        "\u5168\u3066\u306E\u53C2\u7167\u306F {id, name} \u306E\u5F62\u3002name \u3092\u898B\u308C\u3070\u610F\u5473\u304C\u5206\u304B\u308B\u3002id \u306F\u540C\u3058\u7A2E\u985E\u306E\u4E2D\u3067\u4E00\u610F\u3002",
        "position \u306F\u5730\u56F3\u3092\u7E26\u6A2A3\u5206\u5272\u3057\u305F\u8A00\u8449\uFF08\u5317\u897F\u30FB\u5317\u30FB\u5317\u6771\u30FB\u897F\u30FB\u4E2D\u592E\u30FB\u6771\u30FB\u5357\u897F\u30FB\u5357\u30FB\u5357\u6771\uFF09\u3002geography.bounds \u306F\u5EA7\u6A19\u306E\u7BC4\u56F2\u3002",
        "\u4EBA\u53E3\u306E\u5358\u4F4D: \u56FD\u5BB6\u30FB\u5C5E\u5DDE\u306E population \u306F\u300E\u5343\u4EBA\u300F\u3001\u90FD\u5E02\u306E population \u306F\u300E\u4EBA\u300F\uFF08\u6CE8\u8A18\u3042\u308A\uFF09\u3002",
        "\u5E74\u6708\u306F\u300E\u5E74\u300F\u304C\u4E16\u754C\u306E\u958B\u59CB\u304B\u3089\u306E\u901A\u3057\u5E74\u3001\u300E\u6708\u300F\u306F 1\u301C12\u3002"
      ],
      designNotes: [
        "\u6226\u95D8\u306B\u52DD\u3063\u3066\u3082\u56FD\u5883\u306F\u52D5\u304B\u306A\u3044\u3002\u9818\u571F\u304C\u52D5\u304F\u306E\u306F\u8B1B\u548C\u6761\u7D04\uFF08wars[].peaceTerms\uFF09\u30FB\u72EC\u7ACB\u30FB\u7D71\u5408\u306E\u3068\u304D\u3060\u3051\u3002",
        "\u540C\u76DF\u30FB\u6226\u4E89\u30FB\u5916\u4EA4\u30FB\u8ECD\u4E8B\u30FB\u6280\u8853\u6C34\u6E96\u306F\u30E6\u30FC\u30B6\u30FC\u304C\u624B\u52D5\u3067\u6C7A\u3081\u305F\u5185\u5BB9\u3002AI \u306B\u3088\u308B\u81EA\u5F8B\u884C\u52D5\u306F\u5143\u306E\u30A2\u30D7\u30EA\u306B\u306F\u7121\u3044\u3002",
        "\u7D4C\u6E08(\u4EBA\u53E3\u30FB\u7523\u696D)\u306F\u5E74\u6B21\u3067\u81EA\u52D5\u66F4\u65B0\u3055\u308C\u308B\u7C21\u6613\u30E2\u30C7\u30EB\u3002\u6570\u5024\u30D0\u30E9\u30F3\u30B9\u306F\u4EEE\u7F6E\u304D\u3067\u3001\u53F2\u5B9F\u306B\u57FA\u3065\u304F\u3082\u306E\u3067\u306F\u306A\u3044\u3002",
        "\u30CE\u30FC\u30C8(note)\u306F\u30E6\u30FC\u30B6\u30FC\u306E\u81EA\u7531\u8A18\u8FF0\u3002\u4E16\u754C\u8A2D\u5B9A\u306E\u4E00\u6B21\u60C5\u5831\u3068\u3057\u3066\u6700\u512A\u5148\u3067\u5C0A\u91CD\u3059\u308B\u3053\u3068\u3002"
      ],
      doNot: [
        "\u5B58\u5728\u3057\u306A\u3044 id \u3092\u4F5C\u3089\u306A\u3044\u3002\u65B0\u3057\u3044\u56FD\u5BB6\u30FB\u90FD\u5E02\u3092\u4F5C\u308B\u3068\u304D\u306F\u65E2\u5B58\u306E\u6700\u5927 id + 1 \u3092\u4F7F\u3046\u3002",
        "\u300E\u6D88\u6EC5\u300F\u3068\u4ED8\u3044\u305F\u540D\u524D\u306F\u65E2\u306B\u6EC5\u3073\u305F\u5B9F\u4F53\u3002\u73FE\u5B58\u6271\u3044\u3057\u306A\u3044\u3053\u3068\u3002"
      ],
      suggestedTasks: [
        "\u5E74\u8868\u3092\u5143\u306B\u3001\u6642\u4EE3\u3054\u3068\u306E\u6B74\u53F2\u53D9\u8FF0\uFF08\u6559\u79D1\u66F8\u98A8\u30FB\u5E74\u4EE3\u8A18\u98A8\uFF09\u3092\u66F8\u304F\u3002",
        "\u73FE\u5728\u306E\u52E2\u529B\u56F3\u30FB\u540C\u76DF\u30FB\u7D99\u7D9A\u4E2D\u306E\u6226\u4E89\u304B\u3089\u3001\u6B21\u306B\u8D77\u3053\u308A\u3046\u308B\u5C55\u958B\u3092\u63D0\u6848\u3059\u308B\u3002",
        "\u30CE\u30FC\u30C8\u306E\u8A18\u8FF0\u3068\u3001\u5B9F\u969B\u306E\u9818\u571F\u30FB\u6226\u7E3E\u306E\u77DB\u76FE\u3092\u6307\u6458\u3059\u308B\u3002"
      ]
    };
  }
  function chronicleToMarkdown(ch) {
    const L = [];
    const w = ch.world;
    L.push(`# ${w.name}\uFF08ALTERHISTORY \u30AF\u30ED\u30CB\u30AF\u30EB\uFF09`, "");
    L.push(`- \u73FE\u5728: **${w.currentDate.text}**${w.currentDate.era ? `\uFF08${w.currentDate.era}\uFF09` : ""}`);
    L.push(`- \u5730\u56F3: ${w.mapSize.width}\xD7${w.mapSize.height} / \u56FD\u5BB6 ${w.totals.states}\u30FB\u90FD\u5E02 ${w.totals.burgs}\u30FB\u30DE\u30FC\u30AB\u30FC ${w.totals.markers}\u30FB\u6587\u5316 ${w.totals.cultures}\u30FB\u5B97\u6559 ${w.totals.religions}\u30FB\u5C5E\u5DDE ${w.totals.provinces}`);
    if (w.eras.length) L.push(`- \u6642\u4EE3\u533A\u5206: ${w.eras.map((e) => `${e.name}\uFF08${e.fromYear}\u5E74\u301C${e.untilYear ? e.untilYear + "\u5E74" : ""}\uFF09`).join(" \u2192 ")}`);
    L.push("", "> \u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F AI \u306B\u8AAD\u307E\u305B\u3066\u6B74\u53F2\u3092\u69CB\u7BC9\u3059\u308B\u305F\u3081\u306E\u8981\u7D04\u3067\u3059\u3002\u53B3\u5BC6\u306A\u30C7\u30FC\u30BF\u306F\u540C\u540D\u306E `.chronicle.json` \u306B\u3042\u308A\u307E\u3059\u3002", "");
    L.push("## \u5E74\u8868", "");
    let lastEra = null;
    for (const t of ch.timeline) {
      if (t.era !== lastEra) {
        L.push("", `### ${t.era ?? "\uFF08\u6642\u4EE3\u533A\u5206\u306A\u3057\uFF09"}`, "");
        lastEra = t.era;
      }
      L.push(`- **${t.date ?? "\u65E5\u4ED8\u4E0D\u660E"}** [${TYPE_JP[t.type] ?? t.type}] ${t.title}${t.detail ? ` \u2014 ${t.detail}` : ""}`);
    }
    if (!ch.timeline.length) L.push("\uFF08\u8A18\u9332\u3055\u308C\u305F\u51FA\u6765\u4E8B\u306F\u3042\u308A\u307E\u305B\u3093\uFF09");
    L.push("", "## \u56FD\u5BB6", "");
    for (const s of ch.states) {
      L.push(`### ${s.name}\uFF08id ${s.id}\uFF09`, "");
      L.push(`- \u653F\u4F53: ${s.governmentForm ?? "\u4E0D\u660E"}${s.stateType.id === "Generic" ? "" : ` / \u30BF\u30A4\u30D7: ${s.stateType.meaning}`}`);
      L.push(`- \u9996\u90FD: ${s.capital ? `${s.capital.name}(id${s.capital.id})` : "\u306A\u3057"} / \u4F4D\u7F6E: ${s.territory.geography?.position ?? "\u4E0D\u660E"}${s.territory.isLandlocked ? "\uFF08\u5185\u9678\u56FD\uFF09" : ""}`);
      L.push(`- \u9818\u571F: ${s.territory.cells}\u30BB\u30EB\uFF08\u4E16\u754C\u306E\u9678\u5730\u306E${s.territory.landPercentOfWorld}%\uFF09 / \u96A3\u63A5: ${s.territory.neighbors.map((n) => n.name).join("\u3001") || "\u306A\u3057"}`);
      L.push(`- \u4E3B\u306A\u5730\u5F62: ${s.territory.terrain.slice(0, 3).map((t) => `${t.biome} ${t.percent}%`).join("\u3001") || "\u4E0D\u660E"}`);
      L.push(`- \u4EBA\u53E3: ${s.population.total}\uFF08\u5343\u4EBA\uFF09 / \u6280\u8853\u6C34\u6E96 ${s.economy.techLevel}${s.economy.techLevelIsDefault ? "\uFF08\u672A\u8A2D\u5B9A\u306E\u65E2\u5B9A\u5024\uFF09" : ""} / \u7523\u696D\u529B ${s.economy.industry}`);
      L.push(`- \u8ECD\u4E8B: \u30C9\u30AF\u30C8\u30EA\u30F3\u300C${s.military.doctrine.label}\u300D / \u90E8\u968A ${s.military.regimentCount} / \u7DCF\u5175\u54E1 ${s.military.totalHeadcount} / \u6226\u529B ${s.military.totalPower}`);
      for (const r of s.military.regiments) L.push(`  - ${r.name}\uFF08${r.position}\u30FB${r.locatedIn.name}\u9818\u5185\uFF09: ${Object.entries(r.units).map(([k, v]) => `${k}${v}`).join("\u3001") || "\u5175\u529B\u306A\u3057"}`);
      if (s.diplomacy.length) L.push(`- \u5916\u4EA4: ${s.diplomacy.map((d) => `${d.with.name}=${d.relation}`).join("\u3001")}`);
      if (s.alliances.length) L.push(`- \u540C\u76DF: ${s.alliances.map((a) => `${a.name}${a.active ? "" : "\uFF08\u89E3\u6D88\u6E08\u307F\uFF09"}`).join("\u3001")}`);
      if (s.note) L.push(`- \u3010\u30CE\u30FC\u30C8\u3011${s.note.replace(/\n/g, " ")}`);
      L.push("");
    }
    if (ch.extinctStates.length) {
      L.push("## \u6D88\u6EC5\u3057\u305F\u56FD\u5BB6", "");
      for (const e of ch.extinctStates) L.push(`- **${e.name}**\uFF08id ${e.id}\u30FB${e.governmentForm ?? "\u653F\u4F53\u4E0D\u660E"}\uFF09: ${e.extinctAt ?? "\u6642\u671F\u4E0D\u660E"}\u306B${e.absorbedBy ? e.absorbedBy.name + "\u3078\u4F75\u5408" : "\u6D88\u6EC5"}\u3002\u65E7\u9996\u90FD: ${e.formerCapital ?? "\u4E0D\u660E"}${e.note ? ` \u2014 ${e.note.replace(/\n/g, " ")}` : ""}`);
      L.push("");
    }
    L.push("## \u6226\u4E89", "");
    for (const wr of ch.wars) {
      L.push(`### ${wr.name}\uFF08${wr.status}\uFF09`, `- \u671F\u9593: ${wr.started} \u301C ${wr.ended ?? "\u7D99\u7D9A\u4E2D"} / \u653B\u6483\u5074: ${wr.attackers.map((x) => x.name).join("\u3001")} / \u9632\u5FA1\u5074: ${wr.defenders.map((x) => x.name).join("\u3001")}`);
      L.push(`- \u6226\u95D8 ${wr.battleCount} \u56DE\uFF08\u653B\u6483\u5074 ${wr.attackerWins} \u52DD\u30FB\u9632\u5FA1\u5074 ${wr.defenderWins} \u52DD\uFF09`);
      for (const b of wr.battles) L.push(`  - ${b.date}: ${b.name ? `${b.name}\u3000` : ""}${b.attacker} \u5BFE ${b.defender} \u2192 ${b.winner} \u52DD\u5229${b.attackerPower != null ? `\uFF08\u6226\u529B ${b.attackerPower} \u5BFE ${b.defenderPower}\uFF09` : ""}`);
      const pt = wr.peaceTerms;
      if (pt) {
        if (pt.cessions?.length || pt.reparations?.length || pt.annex?.length || pt.name) {
          L.push(`- \u8B1B\u548C\u6761\u7D04: ${pt.name ?? "\u2014"}\uFF08${{ standard: "\u901A\u5E38\u306E\u8B1B\u548C", white: "\u767D\u7D19\u548C\u5E73", vassal: "\u5F93\u5C5E\u5316", annex: "\u5168\u9762\u964D\u4F0F" }[pt.kind] ?? pt.kind}${pt.venue ? `\u30FB\u8B1B\u548C\u5730 ${pt.venue}` : ""}\uFF09`);
          for (const c of pt.cessions) L.push(`  - \u5272\u8B72: ${c.name || "\u533A\u753B"}\uFF08${c.cells}\u30BB\u30EB\uFF09${c.from} \u2192 ${c.to}`);
          for (const r of pt.reparations) L.push(`  - \u8CE0\u511F: ${r.from} \u304C ${r.amount} ${r.currency ?? ""} \u2192 ${r.to} \u304C ${r.received ?? "?"} ${r.receivedCurrency ?? ""}`);
          for (const x of pt.annex) L.push(`  - \u4F75\u5408: ${x.from} \u2192 ${x.to}`);
          for (const x of pt.vassalize ?? []) L.push(`  - \u5F93\u5C5E: ${x.from} \u306F ${x.to} \u306E${x.kind}`);
          if (pt.notes) L.push(`  - \u6761\u4EF6: ${pt.notes}`);
        } else L.push(`- \u8B1B\u548C: \u5272\u8B72 ${pt.cededProvinces.join("\u3001") || "\u306A\u3057"} \u2192 ${pt.cededTo}${pt.legacyReparations ? ` / \u8CE0\u511F ${pt.legacyReparations}` : ""}`);
      }
      L.push("");
    }
    if (!ch.wars.length) L.push("\uFF08\u6226\u4E89\u306E\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093\uFF09", "");
    L.push("## \u540C\u76DF", "");
    for (const a of ch.alliances) L.push(`- **${a.name}**\uFF08${a.status}\uFF09: ${a.members.map((m) => m.name).join("\u3001")} / \u7D50\u6210 ${a.formed ?? "\u4E0D\u660E"}${a.dissolved ? ` / \u89E3\u6D88 ${a.dissolved}` : ""}`);
    if (!ch.alliances.length) L.push("\uFF08\u540C\u76DF\u306F\u3042\u308A\u307E\u305B\u3093\uFF09");
    L.push("", "## \u6587\u5316\u30FB\u5B97\u6559\u30FB\u5C5E\u5DDE", "");
    for (const [label, list] of [["\u6587\u5316", ch.cultures], ["\u5B97\u6559", ch.religions], ["\u5C5E\u5DDE", ch.provinces]]) {
      L.push(`### ${label}`);
      for (const e of list) L.push(`- ${e.name}\uFF08${e.cells}\u30BB\u30EB\u30FB${e.geography?.position ?? "\u4F4D\u7F6E\u4E0D\u660E"}\uFF09${e.note ? ` \u2014 ${e.note.replace(/\n/g, " ")}` : ""}`);
      L.push("");
    }
    L.push("## \u90FD\u5E02\uFF08\u5168\u3066\uFF09", "");
    for (const b of ch.burgs) L.push(`- ${b.name}(id${b.id})${b.isCapital ? "\u3010\u9996\u90FD\u3011" : ""}${b.isPort ? "\u3010\u6E2F\u3011" : ""}: ${b.state.name}\u30FB${b.province.name}\u30FB\u4EBA\u53E3${b.population}\u4EBA\u30FB${b.position}${b.note ? ` \u2014 ${b.note.replace(/\n/g, " ")}` : ""}`);
    L.push("", "## \u30DE\u30FC\u30AB\u30FC\uFF08\u5168\u3066\uFF09", "");
    for (const m of ch.markers) L.push(`- ${m.icon ?? ""} ${m.name ?? m.type}\uFF08${m.position}\u30FB${m.inState.name}\u9818\u5185\uFF09${m.note ? ` \u2014 ${m.note.replace(/\n/g, " ")}` : ""}`);
    if (!ch.markers.length) L.push("\uFF08\u30DE\u30FC\u30AB\u30FC\u306F\u3042\u308A\u307E\u305B\u3093\uFF09");
    L.push("", "## \u30E9\u30F3\u30AD\u30F3\u30B0", "");
    for (const [label, key] of [["\u9818\u571F", "byTerritory"], ["\u4EBA\u53E3", "byPopulation"], ["\u8ECD\u4E8B\u529B", "byMilitaryPower"], ["\u6280\u8853\u6C34\u6E96", "byTechLevel"]]) L.push(`- ${label}: ${ch.ranking[key].map((r) => `${r.rank}\u4F4D ${r.name}(${r.value})`).join(" / ")}`);
    L.push("", "## \u30C7\u30FC\u30BF\u306E\u6574\u5408\u6027", "", ch.consistencyChecks.ok ? "- \u7570\u5E38\u306F\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" : ch.consistencyChecks.issues.map((i) => `- \u26A0 ${i}`).join("\n"));
    return L.join("\n") + "\n";
  }
  var TYPE_JP = {
    era: "\u6642\u4EE3",
    "alliance-formed": "\u540C\u76DF\u7D50\u6210",
    "alliance-dissolved": "\u540C\u76DF\u89E3\u6D88",
    diplomacy: "\u5916\u4EA4",
    "war-declared": "\u958B\u6226",
    battle: "\u6226\u95D8",
    "war-ended": "\u8B1B\u548C",
    independence: "\u72EC\u7ACB",
    "state-merged": "\u7D71\u5408",
    sovereignty: "\u4E3B\u6A29"
  };
  function serializeChronicle(ch, { pretty = true } = {}) {
    if (!pretty) return JSON.stringify(ch);
    const { cells, ...rest } = ch;
    let body = JSON.stringify(rest, null, 2);
    if (cells) {
      const cellsBody = "{\n" + Object.entries(cells).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n  }";
      body = body.replace(/\n}$/, `,
  "cells": ${cellsBody}
}`);
    }
    return body + "\n";
  }

  // js/app/actions.js
  var nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  var OVERLAYS = ["none", ...FILL_KINDS];
  var LAYER_KEYS = new Set(LAYERS.map((l) => l.key));
  var NOTICE_MS = 5e3;
  var PNG_SCALE = 2;
  function createActions({ store, viewport, renderer, load, Delaunator, download, createCanvas }) {
    const rerender = () => renderer.requestRender();
    let noticeTimer = 0;
    const showNotice = (text2) => {
      store.update((s) => {
        s.notice = text2;
      });
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => store.update((s) => {
        s.notice = null;
      }), NOTICE_MS);
    };
    async function runExport(label, produce, onDone) {
      const { map, fileName } = store.getState();
      if (!map) return;
      store.update((s) => {
        s.busy = `${label}\u3092\u4F5C\u6210\u4E2D\u2026`;
        s.error = null;
      });
      await nextPaint();
      try {
        const { blob, name } = await produce(map, fileName);
        download(blob, name);
        onDone?.();
        store.update((s) => {
          s.busy = null;
        });
        showNotice(`${name} \u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08${(blob.size / 1024 / 1024).toFixed(1)} MB\uFF09`);
      } catch (e) {
        store.update((s) => {
          s.busy = null;
          s.error = `${label}\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${e.message}`;
        });
      }
    }
    const textBlob = (text2, type) => new Blob([text2], { type });
    const renderOpts = () => viewToRenderOptions(store.getState().view);
    const annotationOpts = () => ({ ...DEFAULT_ANNOTATIONS, ...store.getState().exportOpts ?? {} });
    return {
      /** ファイルを開く。失敗しても前の地図は残す */
      async openFile(file) {
        store.update((s) => {
          s.busy = `${file.name} \u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026`;
          s.error = null;
        });
        await nextPaint();
        try {
          const { map, warnings } = await load(file, Delaunator);
          const nMil = importAzgaarMilitary(map);
          if (nMil) warnings.push(`Azgaar \u306E\u90E8\u968A ${nMil} \u968A\u3092\u3001\u4EBA\u6570\u305D\u306E\u307E\u307E\u3067\u53D6\u308A\u8FBC\u307F\u307E\u3057\u305F`);
          const prev = store.getState();
          viewport.setMapSize(map.meta.width || 1280, map.meta.height || 774);
          store.replace({ ...prev, map, fileName: file.name, warnings, error: null, notice: null, busy: null, hover: null });
          viewport.fit();
          rerender();
          const n = this.katakanaBurgs(file.name);
          if (n) showNotice(`\u82F1\u8A9E\u540D\u306E\u90FD\u5E02 ${n} \u4EF6\u3092\u30AB\u30BF\u30AB\u30CA\u306B\u3057\u307E\u3057\u305F\uFF08\u300C\u5143\u306B\u623B\u3059\u300D\u3067\u82F1\u8A9E\u540D\u306B\u623B\u305B\u307E\u3059\uFF09`);
        } catch (e) {
          store.update((s) => {
            s.busy = null;
            s.error = e.message;
          });
        }
      },
      /** 英語名の都市をカタカナにする（地図を開くたびに自動で呼ばれる）。付け替えた件数を返す（Undo 1回で戻る） */
      katakanaBurgs(seedText = "katakana") {
        const map = store.getState().map;
        if (!map) return 0;
        const cmd = planKatakanaBurgs(map, createRandom(`${seedText}:${map.pack.burgs.length}`));
        if (!cmd) return 0;
        store.commit(cmd);
        rerender();
        return cmd.parts.length;
      },
      fit() {
        viewport.fit();
        rerender();
      },
      zoomBy(factor) {
        viewport.zoomAt(viewport.screenWidth / 2, viewport.screenHeight / 2, factor);
        renderer.interact();
      },
      zoomAt(sx, sy, factor) {
        viewport.zoomAt(sx, sy, factor);
        renderer.interact();
      },
      pan(dx, dy) {
        viewport.pan(dx, dy);
        renderer.interact();
      },
      setView(patch) {
        store.update((s) => Object.assign(s.view, patch));
        rerender();
      },
      /** 色分けを1種類だけにする（"none" なら全部消す）。絵を塗る間の切り替えなどに使う */
      setOverlay(kind) {
        if (OVERLAYS.includes(kind)) this.setView(exclusiveFillPatch(kind === "none" ? null : kind));
      },
      /** 色分けの on/off と凡例の種類をまとめて取り出す／戻す */
      getFills() {
        return snapshotFills(store.getState().view);
      },
      restoreFills(snap) {
        if (snap) this.setView({ ...snap });
      },
      /** レイヤー（地形・標高・国家・文化・宗教・属州・国境・海岸線・河川・道路・都市・ゾーン・旅の線・名前）を1つ切り替える。独立なので、他は変わらない */
      toggle(name) {
        if (!LAYER_KEYS.has(name)) return;
        const view = store.getState().view;
        const on = !isLayerOn(view, name);
        const patch = { [name]: on };
        const kind = FILL_KINDS.find((k) => FILL_KEY[k] === name);
        if (kind && on) patch.legendKind = kind;
        this.setView(patch);
      },
      /** 凡例に出す色分けの種類を選ぶ（オンの色分けの中から） */
      setLegendKind(kind) {
        if (FILL_KINDS.includes(kind)) this.setView({ legendKind: kind });
      },
      /** 凡例の項目を選んだとき、その場所へ移動する */
      locate(entity) {
        const map = store.getState().map;
        const pos = map && entityPosition(map, entity);
        if (!pos) return;
        viewport.centerOn(pos[0], pos[1], Math.max(viewport.k, viewport.fitK * 3));
        rerender();
      },
      /**
       * 凡例の項目を選んだとき、その実体の外周がちょうど画面に収まるように移動・拡大縮小する。
       * （固定倍率で中心へ寄せるだけだと、大きな国では境界線が画面の外に出てしまい、強調が見えない）
       * 小さな実体は、見失わない程度（全体表示の8倍まで）に拡大する。外周が求まらなければ locate と同じ動き。
       * @returns {boolean} 外周に合わせて動かせたか
       */
      /** 国・州・文化・宗教を選んだとき。ズームや移動はせず、今の地図の状態のまま強調だけする
       *  （強調は ui/highlight.js が行うので、ここでは対象が存在するかだけ返す） */
      focusEntity(kind, entity) {
        const map = store.getState().map;
        return !!(map?.geometry && ENTITY_KINDS[kind] && entity);
      },
      /** ALTERHISTORY 形式で保存（Azgaar 形式の上位互換。Azgaar でも開ける） */
      saveNative() {
        return runExport("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB", (map, fileName) => {
          var _a;
          map.ext ?? (map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} });
          (_a = map.ext).data ?? (_a.data = {});
          map.ext.data.worldTime = { ...map.worldTime };
          return {
            blob: textBlob(serializeAzgaar(map, { native: true, exportedAt: todayString() }), "text/plain"),
            name: exportFileName(map, fileName, "map")
          };
        }, () => store.markSaved());
      },
      /** Azgaar 互換の .map（ALTERHISTORY の目印・拡張データを含めない） */
      saveAzgaar() {
        return runExport("Azgaar\u4E92\u63DB\u30D5\u30A1\u30A4\u30EB", (map, fileName) => ({
          blob: textBlob(serializeAzgaar(map, { native: false, exportedAt: todayString() }), "text/plain"),
          name: exportFileName(map, fileName, "map", "_azgaar")
        }));
      },
      /**
       * AI 向けセーブデータ（クロニクル）。Claude 等にアップロードして歴史を構築してもらうための書き出し。
       *   .chronicle.json … 全情報（ID を名前に解決済み・年表・国家別集約・セル単位の完全データ）
       *   .chronicle.md   … 同じ内容の読み物版（AI にも人間にも読みやすい要約）
       * 2 ファイルを 1 回の操作でダウンロードする。
       */
      exportChronicle() {
        return runExport("AI\u7528\u30AF\u30ED\u30CB\u30AF\u30EB", (map, fileName) => {
          map.ext ?? (map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} });
          const ch = buildChronicle(map, { fileName, exportedAt: todayString() });
          const base = exportFileName(map, fileName, "x").replace(/\.x$/, "");
          download(textBlob(chronicleToMarkdown(ch), "text/markdown"), `${base}.chronicle.md`);
          return { blob: textBlob(serializeChronicle(ch), "application/json"), name: `${base}.chronicle.json` };
        });
      },
      exportPng() {
        return runExport("PNG\u753B\u50CF", async (map, fileName) => ({
          blob: await canvasToPngBlob(renderMapToCanvas(map, renderOpts(), { scale: PNG_SCALE, createCanvas, annotations: annotationOpts() })),
          name: exportFileName(map, fileName, "png")
        }));
      },
      exportSvg() {
        return runExport("SVG\u753B\u50CF", (map, fileName) => ({
          blob: textBlob(renderMapToSvg(map, renderOpts(), { annotations: annotationOpts() }), "image/svg+xml"),
          name: exportFileName(map, fileName, "svg")
        }));
      },
      /** 書き出し画像に入れるもの（題名・凡例・スケールバー）の切替 */
      setExportOption(name, on) {
        if (!(name in DEFAULT_ANNOTATIONS)) return;
        store.update((s) => {
          s.exportOpts = { ...DEFAULT_ANNOTATIONS, ...s.exportOpts ?? {}, [name]: !!on };
        });
      },
      setHover(cellInfo) {
        store.update((s) => {
          s.hover = cellInfo;
        });
      },
      dismissMessage() {
        store.update((s) => {
          s.error = null;
          s.warnings = [];
          s.notice = null;
        });
      }
    };
  }

  // js/ui/dom.js
  function byId(id) {
    const el15 = document.getElementById(id);
    if (!el15) throw new Error(`\u8981\u7D20 #${id} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08index.html \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
    return el15;
  }

  // js/ui/download.js
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3e4);
  }
  function createBrowserCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // js/ui/map-view.js
  var DRAG_THRESHOLD = 3;
  function initMapView({ store, viewport, actions }) {
    const canvas = byId("map-canvas");
    const localPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    let drag = null;
    canvas.addEventListener("wheel", (e) => {
      if (!store.getState().map) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const [sx, sy] = localPos(e);
      actions.zoomAt(sx, sy, Math.exp(-e.deltaY * unit * 16e-4));
    }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 0 && (store.getState().editTool ?? "").startsWith("paint:")) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.focus();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!drag.moved) canvas.classList.add("dragging");
        drag.moved = true;
        drag.x = e.clientX;
        drag.y = e.clientY;
        actions.pan(dx, dy);
        return;
      }
      updateHover(e);
    });
    const endDrag = (e) => {
      if (!drag) return;
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      drag = null;
      canvas.classList.remove("dragging");
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", () => {
      if (!drag) actions.setHover(null);
    });
    canvas.addEventListener("dblclick", (e) => {
      if (!store.getState().map) return;
      if (store.getState().editTool === "select") return;
      const [sx, sy] = localPos(e);
      actions.zoomAt(sx, sy, 2);
    });
    let hoverEvent = null, hoverRaf = 0;
    function updateHover(e) {
      hoverEvent = e;
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const map = store.getState().map;
        if (!map || !hoverEvent) return;
        const [sx, sy] = localPos(hoverEvent);
        const [wx, wy] = viewport.toWorld(sx, sy);
        const inside = wx >= 0 && wy >= 0 && wx <= viewport.mapWidth && wy <= viewport.mapHeight;
        if (!inside) {
          actions.setHover(null);
          return;
        }
        const cell = cellIndexOf(map).find(wx, wy);
        const prev = store.getState().hover;
        if (prev && prev.cell === cell) return;
        actions.setHover(describeCell(map, cell));
      });
    }
  }

  // js/ui/legend.js
  function initLegend({ store, actions, panels, highlight }) {
    const title = byId("legend-title");
    const list = byId("legend-list");
    const wrap = byId("legend");
    const tabs = byId("legend-tabs");
    let lastKey = null;
    let rev = 0;
    function render(state, change) {
      if (change && ["commit", "undo", "redo", "replace"].includes(change.type)) rev++;
      const { map, view } = state;
      wrap.classList.toggle("has-map", !!map);
      const kind = legendKindOf(view);
      const fills = activeFills(view);
      const key = map ? `${map.geometry?.pack.p.length}:${kind}:${fills.join(",")}:${state.fileName}:${rev}` : "none";
      if (key === lastKey) return;
      lastKey = key;
      list.replaceChildren();
      renderTabs(fills, kind);
      if (!map || !kind) {
        title.textContent = "\u51E1\u4F8B";
        list.append(message(map ? "\u8272\u5206\u3051\u306E\u30EC\u30A4\u30E4\u30FC\uFF08\u56FD\u5BB6\u30FB\u6587\u5316\u30FB\u5B97\u6559\u30FB\u5C5E\u5DDE\uFF09\u3092\u30AA\u30F3\u306B\u3059\u308B\u3068\u3001\u3053\u3053\u306B\u4E00\u89A7\u304C\u8868\u793A\u3055\u308C\u307E\u3059" : "\u5730\u56F3\u3092\u958B\u304F\u3068\u8868\u793A\u3055\u308C\u307E\u3059"));
        return;
      }
      const items = listEntities(map, kind);
      title.textContent = `\u51E1\u4F8B\uFF1A${ENTITY_KINDS[kind].label}\uFF08${items.length}\uFF09`;
      if (items.length === 0) {
        list.append(message("\u8A72\u5F53\u3059\u308B\u3082\u306E\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const frag = document.createDocumentFragment();
      for (const it of items) {
        const li = document.createElement("li");
        const btn3 = document.createElement("button");
        btn3.type = "button";
        btn3.title = `${it.name}\uFF08${it.cells}\u30BB\u30EB\uFF09\u2014 \u30AF\u30EA\u30C3\u30AF\u3067\u79FB\u52D5\u3057\u3066\u5883\u754C\u7DDA\u3092\u5149\u3089\u305B\u308B\u3001\u53F3\u30AF\u30EA\u30C3\u30AF\u3067\u7DE8\u96C6`;
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.style.background = it.color;
        const name = document.createElement("span");
        name.className = "legend-name";
        name.textContent = it.name;
        const count = document.createElement("span");
        count.className = "legend-count";
        count.textContent = String(it.cells);
        btn3.append(chip, name);
        if (false) {
          const tag = document.createElement("span");
          tag.className = "legend-prov";
          tag.textContent = "\u4EEE";
          tag.title = "\u4EEE\u306E\u540D\u524D\uFF08\u7DE8\u96C6\u30D1\u30CD\u30EB\u3067\u78BA\u5B9A\u3067\u304D\u307E\u3059\uFF09";
          btn3.append(tag);
        }
        btn3.append(count);
        btn3.addEventListener("click", () => {
          actions.focusEntity(kind, it);
          highlight?.show(kind, it.id);
        });
        btn3.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          panels?.openEntity(kind, it.id);
        });
        li.append(btn3);
        frag.append(li);
      }
      list.append(frag);
    }
    function renderTabs(fills, current) {
      tabs.replaceChildren();
      tabs.hidden = fills.length < 2;
      if (tabs.hidden) return;
      for (const k of fills) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.kind = k;
        b.textContent = FILL_LABEL[k];
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(k === current));
        b.classList.toggle("active", k === current);
        b.addEventListener("click", () => actions.setLegendKind(k));
        tabs.append(b);
      }
    }
    function message(text2) {
      const li = document.createElement("li");
      li.className = "legend-empty";
      li.textContent = text2;
      return li;
    }
    store.subscribe(render);
    render(store.getState());
  }

  // js/ui/fonts-sync.js
  function initFontsSync({ store, renderer }) {
    let lastMap = null, lastSig = "", timer = 0, loadedChars = /* @__PURE__ */ new Set();
    const namesOf = (map) => {
      let t = "";
      for (const key of ["burgs", "states", "provinces"]) for (const e of map.pack[key] ?? []) if (e && !e.removed && e.name) t += e.name;
      return t;
    };
    function check(state) {
      const map = state.map;
      if (!map) return;
      const sig = `${map.rev?.places ?? 0}:${map.rev?.politics ?? 0}`;
      if (map === lastMap && sig === lastSig) return;
      lastMap = map;
      lastSig = sig;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const fresh = [...new Set(namesOf(map))].filter((c) => !loadedChars.has(c));
        if (!fresh.length) return;
        fresh.forEach((c) => loadedChars.add(c));
        loadMapFonts(fresh.join(""), () => renderer.requestRender());
      }, 250);
    }
    store.subscribe(check);
    check(store.getState());
  }

  // js/ui/chrome.js
  function initChrome({ store }) {
    const menus = [...document.querySelectorAll("details.menu")];
    document.addEventListener("pointerdown", (e) => {
      for (const m of menus) if (m.open && !m.contains(e.target)) m.open = false;
    });
    for (const m of menus) m.addEventListener("toggle", () => {
      if (m.open) {
        for (const o of menus) if (o !== m) o.open = false;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") for (const m of menus) m.open = false;
    });
    const undo = byId("btn-undo"), redo = byId("btn-redo"), save = byId("btn-save");
    undo.addEventListener("click", () => store.undo());
    redo.addEventListener("click", () => store.redo());
    function sync() {
      const u = store.peekUndoLabel(), r = store.peekRedoLabel();
      undo.disabled = !store.canUndo();
      redo.disabled = !store.canRedo();
      undo.title = u ? `\u5143\u306B\u623B\u3059\uFF1A${u} (Ctrl+Z)` : "\u5143\u306B\u623B\u3059 (Ctrl+Z)";
      redo.title = r ? `\u3084\u308A\u76F4\u3059\uFF1A${r} (Ctrl+Y)` : "\u3084\u308A\u76F4\u3059 (Ctrl+Y)";
      const dirty = !!store.getState().map && store.isDirty();
      save.textContent = dirty ? "\u4FDD\u5B58 \u25CF" : "\u4FDD\u5B58";
      save.title = dirty ? "\u672A\u4FDD\u5B58\u306E\u5909\u66F4\u304C\u3042\u308A\u307E\u3059 \u2014 ALTERHISTORY \u5F62\u5F0F\u3067\u4FDD\u5B58 (Ctrl+S)" : "ALTERHISTORY \u5F62\u5F0F\u3067\u4FDD\u5B58 (Ctrl+S)";
    }
    store.subscribe(sync);
    sync();
    window.addEventListener("beforeunload", (e) => {
      if (store.getState().map && store.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // js/ui/windows.js
  var el = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  function makeDraggable(root, handle, stage, only = null) {
    handle.style.cursor = "move";
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("button, input, select, textarea")) return;
      if (only && !(e.target instanceof HTMLElement && e.target.closest(only))) return;
      const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      root.style.right = "auto";
      root.style.bottom = "auto";
      handle.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        root.style.left = `${Math.min(Math.max(0, ev.clientX - dx - sr.left), Math.max(0, sr.width - 80))}px`;
        root.style.top = `${Math.min(Math.max(0, ev.clientY - dy - sr.top), Math.max(0, sr.height - 40))}px`;
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }
  function initWindows() {
    const stage = byId("stage");
    const wins = /* @__PURE__ */ new Map();
    let z = 20;
    function front(w) {
      w.root.style.zIndex = String(++z);
    }
    function build(id, def) {
      const root = el("section", "float-win");
      root.dataset.win = id;
      root.hidden = true;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", def.title);
      const bar = el("header", "float-win-bar");
      const title = el("h3", "", def.title);
      const close = el("button", "panel-close", "\xD7");
      close.type = "button";
      close.setAttribute("aria-label", `${def.title}\u3092\u9589\u3058\u308B`);
      bar.append(title, close);
      const body = el("div", "float-win-body");
      body.append(def.body);
      root.append(bar, body);
      stage.append(root);
      const w = { root, def };
      close.addEventListener("click", () => closeWin(id));
      root.addEventListener("pointerdown", () => front(w));
      bar.addEventListener("pointerdown", (e) => {
        if (e.target === close) return;
        const sr = stage.getBoundingClientRect(), r = root.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        bar.setPointerCapture?.(e.pointerId);
        const move = (ev) => {
          const x = Math.min(Math.max(0, ev.clientX - dx - sr.left), Math.max(0, sr.width - 80));
          const y = Math.min(Math.max(0, ev.clientY - dy - sr.top), Math.max(0, sr.height - 40));
          root.style.left = `${x}px`;
          root.style.top = `${y}px`;
          fit(root);
        };
        const up = () => {
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", up);
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
      });
      return w;
    }
    function fit(root) {
      const parent = root.offsetParent ?? root.parentElement;
      if (!parent) return;
      const top = parseFloat(root.style.top) || 0;
      root.style.maxHeight = `${Math.max(240, parent.clientHeight - top - 12)}px`;
    }
    window.addEventListener("resize", () => {
      for (const w of wins.values()) if (!w.root.hidden) fit(w.root);
    });
    function register(id, def) {
      wins.set(id, build(id, def));
      wins.get(id).root.style.width = `min(${def.width ?? 760}px, calc(100% - 24px))`;
    }
    function open(id) {
      const w = wins.get(id);
      if (!w) return;
      if (w.root.hidden) {
        w.root.hidden = false;
        if (!w.root.style.left) {
          const n = [...wins.values()].filter((x) => x !== w && !x.root.hidden).length % 5;
          w.root.style.left = `${24 + n * 28}px`;
          w.root.style.top = `${16 + n * 28}px`;
        }
        fit(w.root);
      }
      w.def.onOpen?.();
      front(w);
    }
    function closeWin(id) {
      const w = wins.get(id);
      if (w) w.root.hidden = true;
    }
    const isOpen = (id) => !!wins.get(id) && !wins.get(id).root.hidden;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const top = [...wins.values()].filter((w) => !w.root.hidden).sort((a, b) => Number(b.root.style.zIndex) - Number(a.root.style.zIndex))[0];
      if (top && !(document.activeElement instanceof HTMLInputElement) && !document.querySelector("details.menu[open]")) top.root.hidden = true;
    });
    return { register, open, close: closeWin, isOpen };
  }

  // js/ui/settings-windows.js
  var el2 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive15 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initSettingsWindows({ store, panels, editorPanel, editActions, actions, warOutcome }) {
    const wins = initWindows();
    const noMap = () => el2("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044");
    wins.register("war", { title: "\u2694 \u6226\u4E89", width: 820, body: byId("tab-wars"), onOpen: () => panels.wars.render() });
    const dipBody = el2("div", "dip-body");
    const dipHost = el2("div", "dip-host");
    const allyHost = el2("div", "editor-section");
    allyHost.append(el2("h4", "", "\u540C\u76DF"), byId("tab-alliances"));
    dipBody.append(dipHost, allyHost);
    let focus = null;
    function renderDip() {
      dipHost.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        dipHost.append(noMap());
        return;
      }
      const states = map.pack.states.filter(isLive15);
      if (focus == null || !states.some((s) => s.i === focus)) focus = states[0]?.i ?? null;
      if (focus == null) {
        dipHost.append(el2("p", "muted", "\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const row = el2("div", "state-picker");
      row.append(el2("span", "field-label", "\u95A2\u4FC2\u3092\u8A2D\u5B9A\u3059\u308B\u56FD"));
      const sel = document.createElement("select");
      for (const s of states) {
        const o = document.createElement("option");
        o.value = s.i;
        o.textContent = s.fullName ?? s.name;
        o.selected = s.i === focus;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        focus = Number(sel.value);
        renderDip();
      });
      row.append(sel);
      dipHost.append(row, editorPanel.buildDiplomacy(map, focus));
    }
    wins.register("diplomacy", { title: "\u{1F91D} \u5916\u4EA4\u30FB\u540C\u76DF", width: 860, body: dipBody, onOpen: () => {
      renderDip();
      panels.alliances.render();
    } });
    const milBody = el2("div", "mil-body");
    const overview = el2("div", "mil-overview");
    milBody.append(overview, byId("tab-regiments"));
    function renderMil() {
      overview.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        overview.append(noMap());
        return;
      }
      const states = map.pack.states.filter(isLive15);
      const t = el2("table", "win-table");
      const head = el2("tr");
      head.append(el2("th", "", "\u56FD\u5BB6"), el2("th", "", "\u90E8\u968A"));
      for (const u of UNIT_TYPES) head.append(el2("th", "", `${u.icon} ${u.label}`));
      head.append(el2("th", "", "\u7DCF\u5175\u54E1"), el2("th", "", "\u7DCF\u6226\u529B"));
      t.append(head);
      for (const s of states) {
        const regs = regimentsOf(s), doc = editActions.getDoctrine(s.i);
        const tr = el2("tr", `clickable${panels.military.selectedState === s.i ? " active" : ""}`);
        tr.title = "\u62BC\u3059\u3068\u3001\u3053\u306E\u56FD\u306E\u90E8\u968A\u3092\u4E0B\u3067\u7DE8\u6210\u3067\u304D\u307E\u3059";
        tr.append(el2("td", "", s.fullName ?? s.name), el2("td", "", String(regs.length)));
        let head2 = 0, power = 0;
        for (const u of UNIT_TYPES) tr.append(el2("td", "", regs.reduce((n, r) => n + (r.u?.[u.key] ?? 0), 0).toLocaleString()));
        for (const r of regs) {
          head2 += forceHeadcount(r.u);
          power += forcePower(r.u, doc);
        }
        tr.append(el2("td", "", Math.round(head2).toLocaleString()), el2("td", "", Math.round(power).toLocaleString()));
        tr.addEventListener("click", () => {
          panels.military.selectState(s.i);
          renderMil();
        });
        t.append(tr);
      }
      overview.append(t);
    }
    wins.register("military", { title: "\u{1F6E1} \u8ECD\u4E8B", width: 900, body: milBody, onOpen: () => {
      renderMil();
      panels.military.render();
    } });
    if (warOutcome) wins.register("treaty", { title: "\u{1F4DC} \u8B1B\u548C\u6761\u7D04", width: 860, body: warOutcome.treatyBody, onOpen: () => warOutcome.renderTreaty() });
    if (warOutcome) wins.register("currency", { title: "\u{1F4B1} \u901A\u8CA8\u30FB\u70BA\u66FF", width: 900, body: warOutcome.currencyBody, onOpen: () => warOutcome.renderCurrency() });
    store.subscribe((_s, change) => {
      if (!["replace", "commit", "undo", "redo"].includes(change.type)) return;
      if (wins.isOpen("diplomacy")) renderDip();
      if (wins.isOpen("military")) renderMil();
    });
    const menu = byId("settings-menu");
    menu.addEventListener("click", (e) => {
      const b = e.target instanceof HTMLElement ? e.target.closest("button") : null;
      if (!b) return;
      if (b.dataset.openWin) wins.open(b.dataset.openWin);
      else if (b.dataset.click) byId(b.dataset.click)?.click();
      menu.open = false;
    });
    const sync = (s) => menu.classList.toggle("disabled", !s.map);
    store.subscribe(sync);
    sync(store.getState());
    return wins;
  }

  // js/ui/entity-list-window.js
  var el3 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var LIST_KEY = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
  var CELL_KEY = { state: "state", culture: "culture", religion: "religion", province: "province" };
  var KIND_LABEL = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" };
  var KIND_ICON = { state: "\u{1F3F3}", culture: "\u{1F3AD}", religion: "\u2726", province: "\u25A6" };
  function initEntityLists({ store, wins, panels, editActions, highlight }) {
    function onMerge(fromId) {
      const map = store.getState().map;
      if (!map) return;
      const others = map.pack.states.filter((s) => s && s.i > 0 && !s.removed && s.i !== fromId);
      if (!others.length) {
        window.alert("\u7D71\u5408\u5148\u306B\u306A\u308B\u56FD\u304C\u3042\u308A\u307E\u305B\u3093");
        return;
      }
      const from = map.pack.states[fromId];
      const sel = document.createElement("select");
      for (const s of others) {
        const o = document.createElement("option");
        o.value = s.i;
        o.textContent = s.fullName ?? s.name;
        sel.append(o);
      }
      const body = el3("div", "merge-body");
      body.append(el3("p", "", `\u300C${from.fullName ?? from.name}\u300D\u3092\u3001\u3069\u306E\u56FD\u306B\u7D71\u5408\u3057\u307E\u3059\u304B\uFF1F`), sel, el3("p", "hint", "\u9818\u571F\u30FB\u90FD\u5E02\u30FB\u5C5E\u5DDE\u306F\u7D71\u5408\u5148\u3078\u79FB\u308A\u3001\u3053\u306E\u56FD\u306F\u6D88\u6EC5\u3057\u307E\u3059\uFF08\u5143\u306B\u623B\u305B\u307E\u3059\uFF09\u3002"));
      const go = el3("button", "primary", "\u7D71\u5408\u3059\u308B");
      go.type = "button";
      go.addEventListener("click", () => {
        editActions.mergeStates(fromId, Number(sel.value));
        wins.close("merge");
        render("state");
      });
      body.append(go);
      mergeHost.replaceChildren(body);
      wins.open("merge");
    }
    const mergeHost = el3("div", "merge-host");
    wins.register("merge", { title: "\u{1F3F3} \u56FD\u5BB6\u306E\u7D71\u5408", width: 420, body: mergeHost });
    const bodies = {};
    function render(kind) {
      const body = bodies[kind];
      body.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        body.append(el3("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const arr = map.pack.cells[CELL_KEY[kind]], counts = /* @__PURE__ */ new Map();
      for (let i = 0; i < arr.length; i++) if (map.pack.cells.biome[i] !== 0) counts.set(arr[i], (counts.get(arr[i]) ?? 0) + 1);
      const items = map.pack[LIST_KEY[kind]].filter((e) => e && e.i > 0 && !e.removed).map((e) => ({ e, cells: counts.get(e.i) ?? 0 })).sort((a, b) => b.cells - a.cells);
      body.append(el3("p", "hint", `${KIND_LABEL[kind]}\u306F ${items.length} \u4EF6\u3002\u540D\u524D\u3092\u62BC\u3059\u3068\u8A73\u7D30\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u3059\u3002`));
      if (!items.length) {
        body.append(el3("p", "muted", "\u307E\u3060\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const ul = el3("div", "ent-list");
      for (const { e, cells } of items) {
        const row = el3("div", "ent-row");
        const chip = el3("span", "chip");
        chip.style.background = e.color ?? "#888";
        const main = el3("button", "ent-main", e.fullName ?? e.name);
        main.type = "button";
        main.title = "\u8A73\u7D30\u3092\u8A2D\u5B9A\u3059\u308B";
        main.addEventListener("click", () => panels.openEntity(kind, e.i));
        const meta = el3("span", "ent-meta", `${cells}\u30BB\u30EB`);
        const look = el3("button", "ent-btn", "\u{1F50D}");
        look.type = "button";
        look.title = "\u5730\u56F3\u4E0A\u3067\u5F37\u8ABF\u3059\u308B\uFF08\u30BA\u30FC\u30E0\u3057\u307E\u305B\u3093\uFF09";
        look.addEventListener("click", () => highlight?.show(kind, e.i));
        row.append(chip, main, meta, look);
        if (kind === "state" && onMerge) {
          const mg = el3("button", "ent-btn", "\u7D71\u5408");
          mg.type = "button";
          mg.title = "\u4ED6\u306E\u56FD\u306B\u7D71\u5408\u3059\u308B";
          mg.addEventListener("click", () => onMerge(e.i));
          row.append(mg);
        }
        const del = el3("button", "ent-btn danger", "\u{1F5D1}");
        del.type = "button";
        del.title = "\u524A\u9664\u3059\u308B\uFF08\u5143\u306B\u623B\u305B\u307E\u3059\uFF09";
        del.addEventListener("click", async () => {
          if (!window.confirm(`${KIND_LABEL[kind]}\u300C${e.fullName ?? e.name}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u3002\u5C5E\u3057\u3066\u3044\u305F\u571F\u5730\u306F\u7121\u6240\u5C5E\u306B\u306A\u308A\u307E\u3059\u3002
\uFF08\u5143\u306B\u623B\u305B\u307E\u3059\uFF09`)) return;
          if (editActions.removeEntity(kind, e.i)) render(kind);
        });
        row.append(del);
        ul.append(row);
      }
      body.append(ul);
    }
    for (const kind of Object.keys(LIST_KEY)) {
      bodies[kind] = el3("div", "ent-body");
      wins.register(`list-${kind}`, { title: `${KIND_ICON[kind]} ${KIND_LABEL[kind]}\u4E00\u89A7`, width: 520, body: bodies[kind], onOpen: () => render(kind) });
    }
    store.subscribe((_s, ch) => {
      if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
      for (const kind of Object.keys(LIST_KEY)) if (wins.isOpen(`list-${kind}`)) render(kind);
    });
    return { render };
  }

  // js/ui/dialogs.js
  function buildDialog({ title, bodyText, showInput, inputValue, okLabel, cancelLabel, danger, suggest, hint }) {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    if (title) dialog.append(el4("h2", null, title));
    if (bodyText) dialog.append(el4("p", null, bodyText));
    let input = null;
    if (showInput) {
      input = document.createElement("input");
      input.type = "text";
      input.className = "confirm-dialog-input";
      input.value = inputValue ?? "";
      dialog.append(input);
    }
    let suggestBtn = null;
    if (input && suggest) {
      suggestBtn = el4("button", "suggest-btn", "\u{1F3B2} \u4EEE\u306E\u540D\u524D\u3092\u751F\u6210");
      suggestBtn.type = "button";
      suggestBtn.addEventListener("click", () => {
        const v = suggest();
        if (v) {
          input.value = v;
          input.focus();
          input.select();
        }
      });
      dialog.append(suggestBtn);
    }
    if (hint) dialog.append(el4("p", "hint", hint));
    const actions = el4("div", "confirm-dialog-actions");
    let cancelBtn = null;
    if (cancelLabel !== null) {
      cancelBtn = el4("button", "", cancelLabel ?? "\u30AD\u30E3\u30F3\u30BB\u30EB");
      cancelBtn.type = "button";
      cancelBtn.value = "cancel";
      actions.append(cancelBtn);
    }
    const okBtn = el4("button", danger ? "danger" : "primary", okLabel ?? "OK");
    okBtn.type = "button";
    actions.append(okBtn);
    dialog.append(actions);
    document.body.append(dialog);
    return { dialog, input, okBtn, cancelBtn, suggestBtn };
  }
  function el4(tag, cls, text2) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  }
  function confirmDialog(message, opts = {}) {
    return new Promise((resolve) => {
      const { dialog, okBtn, cancelBtn } = buildDialog({ bodyText: message, okLabel: opts.okLabel, cancelLabel: opts.cancelLabel, danger: opts.danger });
      const finish = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      okBtn.addEventListener("click", () => finish(true));
      cancelBtn.addEventListener("click", () => finish(false));
      dialog.addEventListener("cancel", () => finish(false));
      dialog.showModal();
      okBtn.focus();
    });
  }
  function alertDialog(message, opts = {}) {
    return new Promise((resolve) => {
      const { dialog, okBtn } = buildDialog({ bodyText: message, okLabel: opts.okLabel ?? "OK", cancelLabel: null });
      const finish = () => {
        dialog.close();
        dialog.remove();
        resolve();
      };
      okBtn.addEventListener("click", finish);
      dialog.addEventListener("cancel", finish);
      dialog.showModal();
      okBtn.focus();
    });
  }
  function promptDialog(message, defaultValue = "", opts = {}) {
    return new Promise((resolve) => {
      const { dialog, input, okBtn, cancelBtn } = buildDialog({
        bodyText: message,
        showInput: true,
        inputValue: defaultValue,
        okLabel: opts.okLabel,
        cancelLabel: opts.cancelLabel,
        suggest: opts.suggest,
        hint: opts.hint
      });
      const finish = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      okBtn.addEventListener("click", () => finish(input.value));
      cancelBtn.addEventListener("click", () => finish(null));
      dialog.addEventListener("cancel", () => finish(null));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(input.value);
        }
      });
      dialog.showModal();
      input.focus();
      input.select();
    });
  }

  // js/ui/genealogy-window.js
  var NS = "http://www.w3.org/2000/svg";
  var el5 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var sv = (tag, attrs = {}, text2) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var LIST_KEY2 = { religion: "religions", culture: "cultures" };
  var LABEL2 = { religion: "\u5B97\u6559", culture: "\u6587\u5316" };
  var ROOT_LABEL = { religion: "\u5171\u901A\u306E\u7956\uFF08\u539F\u59CB\u4FE1\u4EF0\uFF09", culture: "\u5171\u901A\u306E\u7956" };
  var isLive16 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initGenealogy({ store, wins, editActions }) {
    const bodies = {}, selected = {};
    const NODE_W = 150, NODE_H = 28, GAP_X = 50, GAP_Y = 14;
    function layout(map, kind) {
      const list = map.pack[LIST_KEY2[kind]];
      const live3 = list.filter(isLive16);
      const parentsOf2 = (e) => {
        const ps = [...new Set((Array.isArray(e.origins) ? e.origins : []).filter((o) => Number.isInteger(o) && (o === 0 || isLive16(list[o]))))];
        return ps.length ? ps : [0];
      };
      const children = /* @__PURE__ */ new Map([[0, []]]);
      for (const e of live3) children.set(e.i, []);
      const extra = [];
      for (const e of live3) {
        const ps = parentsOf2(e);
        children.get(ps[0]).push(e.i);
        for (const p of ps.slice(1)) if (p !== 0) extra.push([p, e.i]);
      }
      const pos = /* @__PURE__ */ new Map();
      let row = 0;
      const visit = (id, depth, seen) => {
        if (seen.has(id)) return;
        seen.add(id);
        const kids = children.get(id) ?? [];
        if (!kids.length) {
          pos.set(id, { depth, y: row++ });
          return;
        }
        const start2 = row;
        for (const k of kids) visit(k, depth + 1, seen);
        pos.set(id, { depth, y: (start2 + row - 1) / 2 });
      };
      visit(0, 0, /* @__PURE__ */ new Set());
      for (let pass = 0; pass < 6; pass++) for (const [p, k] of extra) {
        const a = pos.get(p), c = pos.get(k);
        if (a && c && c.depth <= a.depth) c.depth = a.depth + 1;
      }
      const edges = [];
      for (const [p, kids] of children) for (const k of kids) if (pos.has(p) && pos.has(k)) edges.push([p, k, false]);
      for (const [p, k] of extra) if (pos.has(p) && pos.has(k)) edges.push([p, k, true]);
      return { pos, edges, rows: Math.max(1, row), depth: Math.max(...[...pos.values()].map((v) => v.depth)) };
    }
    function render(kind) {
      const body = bodies[kind];
      body.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        body.append(el5("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const list = map.pack[LIST_KEY2[kind]];
      const { pos, edges, rows, depth } = layout(map, kind);
      body.append(el5("p", "hint", `${LABEL2[kind]}\u306E\u7CFB\u8B5C\u56F3\u3002\u30CE\u30FC\u30C9\u3092\u5225\u306E\u30CE\u30FC\u30C9\u3078\u30C9\u30E9\u30C3\u30B0\u3059\u308B\u3068\u3001\u305D\u306E\u5B50\uFF08\u5206\u6D3E\uFF09\u306B\u306A\u308A\u307E\u3059\uFF08\u89AA\u306F1\u3064\u306B\u7F6E\u304D\u63DB\u308F\u308A\u307E\u3059\uFF09\u3002\u89AA\u306F\u4E0B\u306E\u6B04\u3067\u8907\u6570\u9078\u3079\u307E\u3059\uFF08\u91D1\u8272\u306E\u70B9\u7DDA\u304C2\u3064\u76EE\u4EE5\u964D\u306E\u89AA\uFF09\u3002`));
      const W = (depth + 1) * (NODE_W + GAP_X) + 10, H = rows * (NODE_H + GAP_Y) + 10;
      const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "gen-svg" });
      const X = (d) => 5 + d * (NODE_W + GAP_X), Y = (y) => 5 + y * (NODE_H + GAP_Y);
      for (const [p, k, isExtra] of edges) {
        const a = pos.get(p), b = pos.get(k);
        const x1 = X(a.depth) + NODE_W, y1 = Y(a.y) + NODE_H / 2, x2 = X(b.depth), y2 = Y(b.y) + NODE_H / 2, mx = (x1 + x2) / 2;
        svg.append(sv("path", { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: "none", stroke: isExtra ? "var(--brass, #c9a24a)" : "var(--line, #555)", "stroke-width": 1.5, ...isExtra ? { "stroke-dasharray": "5 3" } : {} }));
      }
      const nodeG = /* @__PURE__ */ new Map();
      for (const [id, p] of pos) {
        const e = id === 0 ? null : list[id];
        const g = sv("g", { "data-id": id, class: `gen-node${selected[kind] === id ? " sel" : ""}${id === 0 ? " root" : ""}`, transform: `translate(${X(p.depth)},${Y(p.y)})`, style: "cursor:grab" });
        g.append(sv("rect", { width: NODE_W, height: NODE_H, rx: 6, fill: "var(--panel-2, #2a2a2a)", stroke: selected[kind] === id ? "var(--brass-bright, #d9b45a)" : "var(--brass-dim, #7a6a3a)", "stroke-width": selected[kind] === id ? 2 : 1 }));
        if (e) g.append(sv("rect", { x: 6, y: 8, width: 12, height: 12, rx: 2, fill: e.color ?? "#888" }));
        const label = id === 0 ? ROOT_LABEL[kind] : e.fullName ?? e.name;
        g.append(sv("text", { x: e ? 24 : 8, y: 19, fill: "var(--text, #eee)", "font-size": 12 }, label.length > 11 ? `${label.slice(0, 10)}\u2026` : label));
        g.append(sv("title", {}, label));
        nodeG.set(id, g);
        svg.append(g);
        g.addEventListener("click", () => {
          selected[kind] = id;
          render(kind);
        });
        if (id !== 0) enableDrag(kind, g, svg, id);
      }
      const scroller = el5("div", "gen-scroll");
      scroller.append(svg);
      body.append(scroller, editPanel(map, kind, list));
    }
    function enableDrag(kind, g, svg, id) {
      g.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        const start2 = { x: ev.clientX, y: ev.clientY };
        let moved = false;
        const ghost = g.cloneNode(true);
        ghost.setAttribute("opacity", "0.6");
        ghost.style.pointerEvents = "none";
        const onMove = (e2) => {
          if (!moved && Math.hypot(e2.clientX - start2.x, e2.clientY - start2.y) < 5) return;
          if (!moved) {
            moved = true;
            svg.append(ghost);
          }
          const r = svg.getBoundingClientRect();
          ghost.setAttribute("transform", `translate(${e2.clientX - r.left - NODE_W / 2},${e2.clientY - r.top - NODE_H / 2})`);
        };
        const onUp = (e2) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (!moved) return;
          ghost.remove();
          const target = document.elementFromPoint(e2.clientX, e2.clientY)?.closest?.("[data-id]");
          if (target) {
            const pid = Number(target.getAttribute("data-id"));
            if (pid !== id) {
              editActions.setOrigin(kind, id, pid);
              selected[kind] = id;
            }
          }
          render(kind);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
    function editPanel(map, kind, list) {
      const box = el5("div", "gen-edit");
      const id = selected[kind];
      if (!id || !isLive16(list[id])) {
        box.append(el5("p", "muted", "\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u89AA\u306E\u5909\u66F4\u30FB\u540D\u524D\u306E\u5909\u66F4\u30FB\u524A\u9664\u304C\u3067\u304D\u307E\u3059"));
        return box;
      }
      const e = list[id];
      box.append(el5("h4", "", `\u300C${e.fullName ?? e.name}\u300D`));
      const banned = /* @__PURE__ */ new Set([id, ...editActions.descendantsOf(kind, id)]);
      const cur = new Set(editActions.originsOf(kind, id));
      box.append(el5("p", "hint", "\u3069\u3053\u304B\u3089\u5206\u304B\u308C\u305F\u304B\uFF08\u8907\u6570\u9078\u3079\u307E\u3059\u3002\u4F55\u3082\u9078\u3070\u306A\u3051\u308C\u3070\u5171\u901A\u306E\u7956\uFF09"));
      const grid = el5("div", "gen-parents");
      const boxes = [];
      for (const o of list) {
        if (!isLive16(o) || banned.has(o.i)) continue;
        const l = el5("label", "gen-parent");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = o.i;
        cb.checked = cur.has(o.i);
        cb.addEventListener("change", () => {
          editActions.setOrigins(kind, id, boxes.filter((x) => x.checked).map((x) => Number(x.value)));
          render(kind);
        });
        boxes.push(cb);
        l.append(cb, document.createTextNode(` ${o.fullName ?? o.name}`));
        grid.append(l);
      }
      box.append(grid);
      const rename = el5("button", "", "\u540D\u524D\u3092\u5909\u3048\u308B");
      rename.type = "button";
      rename.addEventListener("click", async () => {
        const n = await promptDialog(`${LABEL2[kind]}\u306E\u65B0\u3057\u3044\u540D\u524D`, e.fullName ?? e.name);
        if (n) {
          editActions.renameEntity(kind, id, n);
          render(kind);
        }
      });
      const del = el5("button", "danger", "\u524A\u9664");
      del.type = "button";
      del.addEventListener("click", () => {
        if (!window.confirm(`${LABEL2[kind]}\u300C${e.fullName ?? e.name}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u3002\uFF08\u5143\u306B\u623B\u305B\u307E\u3059\uFF09`)) return;
        if (editActions.removeEntity(kind, id)) {
          selected[kind] = null;
          render(kind);
        }
      });
      box.append(rename, del);
      return box;
    }
    for (const kind of Object.keys(LIST_KEY2)) {
      bodies[kind] = el5("div", "gen-body");
      wins.register(`genealogy-${kind}`, { title: `\u{1F333} ${LABEL2[kind]}\u306E\u7CFB\u8B5C\u56F3`, width: 760, body: bodies[kind], onOpen: () => render(kind) });
    }
    store.subscribe((_s, ch) => {
      if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
      for (const kind of Object.keys(LIST_KEY2)) if (wins.isOpen(`genealogy-${kind}`)) render(kind);
    });
  }

  // js/ui/safe-render.js
  var TYPING = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT"]);
  var isTyping = (el15) => !!el15 && TYPING.has(el15.tagName) && !["checkbox", "radio", "button", "range"].includes(el15.type);
  function guardRender(root, renderFn) {
    let pending = false;
    root.addEventListener("focusout", () => {
      if (!pending) return;
      setTimeout(() => {
        if (!pending) return;
        if (!isTyping(document.activeElement) || !root.contains(document.activeElement)) {
          pending = false;
          renderFn();
        }
      }, 0);
    });
    return function safeRender(...args) {
      const a = document.activeElement;
      if (isTyping(a) && root.contains(a)) {
        pending = true;
        return;
      }
      pending = false;
      renderFn(...args);
    };
  }

  // js/ui/nuclear-window.js
  var el6 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive17 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function initNuclearWindow({ store, simActions, wins }) {
    const body = el6("div", "nuc-body");
    let atk = null, tgt = null, heads = 1;
    const nm = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    function render() {
      body.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        body.append(el6("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive17);
      body.append(el6("p", "hint", "\u6838\u5175\u5668\u306F\u901A\u5E38\u306E\u6226\u4E89\u3067\u306F\u4F7F\u308F\u308C\u307E\u305B\u3093\u3002\u6838\u3092\u4FDD\u6709\u3057\u3066\u3044\u308C\u3070\u3001\u3069\u306E\u56FD\u306B\u5BFE\u3057\u3066\u3082\u4F5C\u6226\u3092\u7ACB\u6848\u3057\u3001\u78BA\u8A8D\u3057\u305F\u3046\u3048\u3067\u5B9F\u884C\u3067\u304D\u307E\u3059\uFF08\u6226\u4E89\u4E2D\u3067\u306A\u304F\u3066\u3082\u53EF\uFF09\u3002\u7CBE\u5EA6\u3068\u5A01\u529B\u306F\u4F7F\u3046\u56FD\u306E\u6280\u8853\u6C34\u6E96\u3067\u6C7A\u307E\u308A\u3001\u6A19\u7684\u56FD\u306E\u4EBA\u53E3\u30FB\u7523\u696D\u30FB\u8ECD\u968A\u30FB\u58EB\u6C17\u306B\u6253\u6483\u3092\u4E0E\u3048\u307E\u3059\u3002\u58EB\u6C17\u3068\u8ECD\u968A\u306F\u6226\u4E89\u306E\u5224\u5B9A\u306B\u305D\u306E\u307E\u307E\u97FF\u304D\u3001\u307E\u3060\u8B1B\u548C\u3057\u3066\u3044\u306A\u3044\u6226\u4E89\u306F\u5224\u5B9A\u3057\u76F4\u3055\u308C\u307E\u3059\u3002\u5143\u306B\u623B\u305B\u307E\u3059\u3002"));
      const holders = states.filter((s) => simActions.nuclearStock(s.i) > 0);
      if (!holders.length) body.append(el6("p", "muted", "\u6838\u3092\u4FDD\u6709\u3059\u308B\u56FD\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u8ECD\u4E8B\u30A6\u30A3\u30F3\u30C9\u30A6\u3067\u3001\u90E8\u968A\u306E\u5175\u529B\u306B\u6838\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u3059\uFF09"));
      else {
        if (!holders.some((s) => s.i === atk)) atk = holders[0].i;
        const targets = states.filter((s) => s.i !== atk);
        if (!targets.some((s) => s.i === tgt)) tgt = targets[0]?.i ?? null;
        const mk = (list, cur, on) => {
          const s = document.createElement("select");
          for (const x of list) {
            const o = document.createElement("option");
            o.value = x.i;
            o.textContent = nm(map, x.i);
            o.selected = x.i === cur;
            s.append(o);
          }
          s.addEventListener("change", () => {
            on(Number(s.value));
            render();
          });
          return s;
        };
        const form = el6("div", "member-picker");
        const n = document.createElement("input");
        n.type = "number";
        n.min = "1";
        n.value = String(heads);
        n.addEventListener("input", () => {
          heads = Math.max(1, Math.floor(Number(n.value) || 1));
        });
        form.append(el6("span", "", "\u4F7F\u3046\u56FD"), mk(holders, atk, (x) => {
          atk = x;
        }), el6("span", "", `\uFF08\u4FDD\u6709 ${simActions.nuclearStock(atk)} \u767A\uFF09\u3000\u6A19\u7684\u306E\u56FD`), mk(targets, tgt, (x) => {
          tgt = x;
        }), el6("span", "", "\u767A\u6570"), n);
        const go = el6("button", "primary", "\u4F5C\u6226\u3092\u7ACB\u6848\u3059\u308B");
        go.type = "button";
        go.addEventListener("click", () => {
          simActions.draftNuclearOp(atk, tgt, heads);
        });
        const fx = simActions.strikeEstimate(atk, heads);
        const est = el6("p", "hint", `\u3053\u306E\u56FD\u306E\u6280\u8853\u6C34\u6E96\u3067\u306E\u6027\u80FD\uFF08${heads}\u767A\uFF09: \u7CBE\u5EA6 ${Math.round(fx.accuracy * 100)}% \uFF0F \u6A19\u7684\u56FD\u306E\u4EBA\u53E3 \u2212${Math.round(fx.popLossShare * 100)}% \u30FB\u7523\u696D \u2212${Math.round(fx.industryLossShare * 100)}% \u30FB\u8ECD\u968A \u2212${Math.round(fx.troopLossShare * 100)}% \u30FB\u58EB\u6C17 \u2212${fx.moraleDropTotal}`);
        body.append(form, est, go);
      }
      body.append(el6("h4", "", "\u4F5C\u6226\u306E\u4E00\u89A7"));
      const ops = simActions.nuclearOps().slice().reverse();
      if (!ops.length) body.append(el6("p", "muted", "\u7ACB\u6848\u3055\u308C\u305F\u4F5C\u6226\u306F\u3042\u308A\u307E\u305B\u3093"));
      for (const o of ops) {
        const row = el6("div", "ent-row");
        row.append(el6("span", "ent-main", `${o.status === "executed" ? "\u2622 \u5B9F\u884C\u6E08\u307F" : "\u{1F4DD} \u7ACB\u6848\u4E2D"}\u3000${o.name}\u3000${nm(map, o.attackerId)} \u2192 ${nm(map, o.targetId)}\u3000${o.warheads}\u767A`));
        if (o.status === "planned") {
          const run = el6("button", "danger", "\u5B9F\u884C\u3059\u308B");
          run.type = "button";
          run.addEventListener("click", () => {
            if (window.confirm(`\u300C${o.name}\u300D\u3092\u5B9F\u884C\u3057\u307E\u3059\u3002${nm(map, o.targetId)}\u306F\u58CA\u6EC5\u7684\u306A\u88AB\u5BB3\u3092\u53D7\u3051\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F\uFF08\u5143\u306B\u623B\u305B\u307E\u3059\uFF09`)) simActions.executeNuclearOp(o.id);
          });
          const cancel = el6("button", "ent-btn", "\u53D6\u308A\u6D88\u3057");
          cancel.type = "button";
          cancel.addEventListener("click", () => simActions.cancelNuclearOp(o.id));
          row.append(run, cancel);
        } else if (o.result) row.append(el6("span", "ent-meta", `\u4EBA\u53E3 \u2212${o.result.populationLoss.toLocaleString()}\u5343\u4EBA / \u7523\u696D \u2212${Math.round(o.result.industryLossShare * 100)}%`));
        body.append(row);
      }
    }
    wins.register("nuclear", { title: "\u2622 \u6838\u4F5C\u6226", width: 720, body, onOpen: render });
    const safe = guardRender(body, () => render());
    store.subscribe((_s, ch) => {
      if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("nuclear")) safe();
    });
  }

  // js/ui/highlight.js
  var HIGHLIGHT_MS = 2600;
  var FADE_MS = 800;
  var PULSE_MS = 650;
  var COLOR = "255, 38, 38";
  function highlightAlpha(elapsed, total = HIGHLIGHT_MS) {
    if (elapsed >= total) return 0;
    if (elapsed < 0) elapsed = 0;
    const rise = Math.min(1, elapsed / 120);
    const fade = Math.min(1, (total - elapsed) / FADE_MS);
    const pulse = 0.8 + 0.2 * Math.cos(elapsed / PULSE_MS * Math.PI * 2);
    return rise * fade * pulse;
  }
  function initHighlight({ store, viewport, renderer }) {
    const canvas = byId("highlight-canvas");
    const mapCanvas = byId("map-canvas");
    const ctx = canvas.getContext("2d");
    let segs = null, t0 = 0, raf = 0;
    function syncSize() {
      if (canvas.width !== mapCanvas.width) canvas.width = mapCanvas.width;
      if (canvas.height !== mapCanvas.height) canvas.height = mapCanvas.height;
    }
    const dprNow = () => window.devicePixelRatio || 1;
    function draw(now = performance.now()) {
      syncSize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!segs) return false;
      if (now - t0 >= HIGHLIGHT_MS) {
        segs = null;
        return false;
      }
      const a = highlightAlpha(now - t0);
      const dpr = dprNow();
      ctx.save();
      viewport.apply(ctx, dpr);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${COLOR}, ${0.9 * a})`;
      ctx.shadowBlur = 14 * dpr;
      ctx.strokeStyle = `rgba(${COLOR}, ${0.35 * a})`;
      ctx.lineWidth = 8 / viewport.k;
      strokeSegments(ctx, segs);
      ctx.shadowBlur = 6 * dpr;
      ctx.strokeStyle = `rgba(255, 70, 60, ${a})`;
      ctx.lineWidth = 3 / viewport.k;
      strokeSegments(ctx, segs);
      ctx.restore();
      return true;
    }
    function tick() {
      raf = 0;
      if (draw()) raf = requestAnimationFrame(tick);
    }
    function clear() {
      segs = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      draw();
    }
    function show(kind, id) {
      const map = store.getState().map;
      const def = ENTITY_KINDS[kind];
      if (!map?.geometry || !def) return false;
      const s = entityOutlineSegments(map.geometry, def.cells(map), id, map.pack.cells.biome);
      if (!s.length) return false;
      segs = s;
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
      return true;
    }
    renderer.onFrame(() => {
      if (segs) draw();
    });
    store.subscribe((_s, change) => {
      if (change.type === "replace") clear();
    });
    return { show, clear, isActive: () => !!segs };
  }

  // js/ui/toolbar.js
  var GROUP_TITLE = { base: "\u4E0B\u5730", fill: "\u8272\u5206\u3051", line: "\u7DDA", mark: "\u8A18\u53F7\u30FB\u6587\u5B57" };
  function initToolbar({ store, actions, openFileDialog, openHelp }) {
    byId("btn-open").addEventListener("click", openFileDialog);
    byId("btn-open-empty").addEventListener("click", openFileDialog);
    byId("btn-fit").addEventListener("click", () => actions.fit());
    byId("btn-help").addEventListener("click", openHelp);
    const btnSave = byId("btn-save");
    const menu = byId("export-menu");
    btnSave.addEventListener("click", () => actions.saveNative());
    const exporters = { chronicle: () => actions.exportChronicle(), png: () => actions.exportPng(), svg: () => actions.exportSvg(), azgaar: () => actions.saveAzgaar() };
    menu.addEventListener("click", (e) => {
      const item = e.target instanceof HTMLElement ? e.target.closest("[data-export]") : null;
      if (!item) return;
      menu.open = false;
      exporters[item.dataset.export]?.();
    });
    document.addEventListener("pointerdown", (e) => {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (menu.open) {
        menu.open = false;
        menu.querySelector("summary").focus();
      }
    });
    const annotBoxes = [...menu.querySelectorAll("[data-annot]")];
    for (const box of annotBoxes) box.addEventListener("change", () => actions.setExportOption(box.dataset.annot, box.checked));
    const toggleBox = byId("layer-toggles");
    const layerBtns = /* @__PURE__ */ new Map();
    let lastGroup = null;
    for (const l of LAYERS) {
      if (l.group !== lastGroup) {
        const t = document.createElement("span");
        t.className = "lp-group";
        t.textContent = GROUP_TITLE[l.group];
        toggleBox.append(t);
        lastGroup = l.group;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "layer-btn";
      b.dataset.layer = l.key;
      b.textContent = l.label;
      b.title = l.title ?? `${l.label}\u306E\u8868\u793A\u3092\u5207\u308A\u66FF\u3048\u308B`;
      b.addEventListener("click", () => actions.toggle(l.key));
      toggleBox.append(b);
      layerBtns.set(l.key, b);
    }
    const selBurgLabels = byId("sel-burg-labels");
    selBurgLabels.addEventListener("change", () => actions.setView({ burgLabels: selBurgLabels.value }));
    const segs = [...document.querySelectorAll("[data-seg-for]")];
    for (const seg of segs) {
      seg.addEventListener("click", (e) => {
        const b = e.target instanceof HTMLElement ? e.target.closest("button[data-value]") : null;
        if (!b) return;
        const sel = byId(seg.dataset.segFor);
        sel.value = b.dataset.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    const sync = (state) => {
      const v = state.view;
      if (v.burgLabels && selBurgLabels.value !== v.burgLabels) selBurgLabels.value = v.burgLabels;
      const hasMap = !!state.map;
      btnSave.disabled = !hasMap;
      menu.classList.toggle("disabled", !hasMap);
      if (!hasMap) menu.open = false;
      for (const [key, btn3] of layerBtns) {
        const on = isLayerOn(v, key);
        btn3.classList.toggle("active", on);
        btn3.setAttribute("aria-pressed", String(on));
      }
      for (const seg of segs) {
        const cur = byId(seg.dataset.segFor).value;
        for (const b of seg.querySelectorAll("button[data-value]")) {
          const on = b.dataset.value === cur;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        }
      }
      byId("layers-menu").classList.toggle("disabled", !hasMap);
      const eo = state.exportOpts ?? {};
      for (const box of annotBoxes) {
        const name = box.dataset.annot;
        let reason = "";
        if (name === "legend" && !legendKindOf(v)) reason = "\u8272\u5206\u3051\u306E\u30EC\u30A4\u30E4\u30FC\u304C\u3059\u3079\u3066\u30AA\u30D5\u306E\u305F\u3081\u3001\u51E1\u4F8B\u306F\u51FA\u307E\u305B\u3093";
        if (name === "scaleBar" && hasMap && !getScale(state.map)) reason = "\u3053\u306E\u5730\u56F3\u306B\u306F\u7E2E\u5C3A\u306E\u60C5\u5831\u304C\u306A\u3044\u305F\u3081\u3001\u30B9\u30B1\u30FC\u30EB\u30D0\u30FC\u306F\u51FA\u307E\u305B\u3093";
        box.disabled = !!reason;
        box.title = reason;
        box.parentElement.classList.toggle("is-disabled", !!reason);
        if (box.checked !== (eo[name] !== false)) box.checked = eo[name] !== false;
      }
    };
    store.subscribe(sync);
    sync(store.getState());
  }

  // js/ui/status-bar.js
  function formatCell(info) {
    if (!info) return "";
    if (info.water) return `\u6C34\u57DF \uFF5C \u6A19\u9AD8 ${info.height}`;
    const parts = [`\u56FD\u5BB6: ${info.state ?? "\u306A\u3057"}`];
    if (info.province) parts.push(`\u5C5E\u5DDE: ${info.province}`);
    if (info.culture) parts.push(`\u6587\u5316: ${info.culture}`);
    if (info.religion) parts.push(`\u5B97\u6559: ${info.religion}`);
    if (info.burg) parts.push(`\u90FD\u5E02: ${info.burg}`);
    if (info.biome) parts.push(`\u5730\u5F62: ${info.biome}`);
    parts.push(`\u6A19\u9AD8 ${info.height}`);
    return parts.join(" \uFF5C ");
  }
  function initStatusBar({ store, viewport, renderer }) {
    const mapEl = byId("status-map");
    const hoverEl = byId("status-hover");
    const zoomEl = byId("status-zoom");
    const update = (state) => {
      mapEl.textContent = state.map ? `${state.map.meta.name || state.fileName} \uFF5C ${state.map.geometry.pack.p.length}\u30BB\u30EB` : "\u672A\u8AAD\u307F\u8FBC\u307F";
      hoverEl.textContent = formatCell(state.hover);
    };
    store.subscribe(update);
    update(store.getState());
    const updateZoom = () => {
      zoomEl.textContent = store.getState().map ? `\u62E1\u5927\u7387 ${Math.round(viewport.k / viewport.fitK * 100)}%` : "";
    };
    renderer.onFrame(updateZoom);
  }

  // js/ui/banner.js
  var AUTO_DISMISS_MS = 5e3;
  function initBanner({ store, actions }) {
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
        if (key) dismissTimer = setTimeout(() => actions.dismissMessage(), AUTO_DISMISS_MS);
      }
    });
  }

  // js/ui/file-input.js
  function initFileInput({ actions }) {
    const input = byId("file-input");
    const hint = byId("drop-hint");
    const open = () => input.click();
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) actions.openFile(file);
      input.value = "";
    });
    let depth = 0;
    const hasFiles = (e) => [...e.dataTransfer?.types ?? []].includes("Files");
    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      hint.hidden = false;
    });
    window.addEventListener("dragover", (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) hint.hidden = true;
    });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      hint.hidden = true;
      const file = e.dataTransfer.files?.[0];
      if (file) actions.openFile(file);
    });
    return { open };
  }

  // js/ui/tools/selection.js
  function pickAt(map, cell, worldX, worldY, pixelRadius) {
    if (cell < 0) return null;
    const nearMarker = map.markers.find((m) => Math.hypot(m.x - worldX, m.y - worldY) <= pixelRadius);
    if (nearMarker) return { type: "marker", id: nearMarker.i };
    const burgId = map.pack.cells.burg[cell];
    if (burgId) return { type: "burg", id: burgId };
    return { type: "cell", id: cell };
  }

  // js/ui/tools/brush.js
  function createBrushController({ getRadius, onStroke }) {
    let painting = false;
    let painted = /* @__PURE__ */ new Set();
    return {
      get isPainting() {
        return painting;
      },
      begin(cell, radiusCells) {
        painting = true;
        painted = /* @__PURE__ */ new Set();
        this.continue(cell, radiusCells);
      },
      continue(cell, radiusCells) {
        if (!painting) return;
        onStroke(cell, radiusCells ?? getRadius(), painted);
      },
      end() {
        painting = false;
        const had = painted.size > 0;
        painted = /* @__PURE__ */ new Set();
        return had;
      }
    };
  }

  // js/ui/edit-mode.js
  var TOOLS = Object.freeze({
    SELECT: "select",
    PAINT_STATE: "paint:state",
    PAINT_CULTURE: "paint:culture",
    PAINT_RELIGION: "paint:religion",
    PAINT_PROVINCE: "paint:province",
    PAINT_BIOME: "paint:biome",
    PAINT_ZONE: "paint:zone",
    ADD_BURG: "add:burg",
    ADD_MARKER: "add:marker"
  });
  var PAINT_TOOL_KIND = {
    [TOOLS.PAINT_STATE]: "state",
    [TOOLS.PAINT_CULTURE]: "culture",
    [TOOLS.PAINT_RELIGION]: "religion",
    [TOOLS.PAINT_PROVINCE]: "province"
  };
  function initEditMode({ store, viewport, editActions, panels }) {
    const canvas = byId("map-canvas");
    let tool = TOOLS.SELECT;
    let target = 0;
    let radius = 40;
    let markerType = { type: "marker", icon: "\u{1F4CD}" };
    let zoneMode = "add";
    let picker = null;
    const localPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toWorld = (e) => {
      const [sx, sy] = localPos(e);
      return viewport.toWorld(sx, sy);
    };
    const inMap = (map, wx, wy) => wx >= 0 && wy >= 0 && wx <= map.meta.width && wy <= map.meta.height;
    const brush = createBrushController({
      getRadius: () => radius,
      onStroke(cell, r, painted) {
        const map = store.getState().map;
        const [wx, wy] = [map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1]];
        const cells = editActions.cellsWithin(wx, wy, r).filter((c) => !painted.has(c));
        if (!cells.length) return;
        cells.forEach((c) => painted.add(c));
        if (tool === TOOLS.PAINT_BIOME) editActions.paintBiome(target, cells);
        else if (tool === TOOLS.PAINT_ZONE) editActions.paintZone(target, cells, zoneMode);
        else editActions.paintCells(PAINT_TOOL_KIND[tool], target, cells);
      }
    });
    function setTool(next) {
      tool = next;
      store.update((s) => {
        s.editTool = tool;
      });
      canvas.classList.toggle("tool-paint", tool.startsWith("paint:"));
      canvas.classList.toggle("tool-place", tool.startsWith("add:"));
    }
    function setTarget(id) {
      target = id;
    }
    function setRadius(r) {
      radius = Math.max(6, Math.min(300, r));
      store.update((s) => {
        s.brushRadius = radius;
      });
    }
    function setMarkerType(t) {
      markerType = t;
    }
    function setZoneMode(m) {
      zoneMode = m === "erase" ? "erase" : "add";
    }
    function pickCell(cb) {
      cancelPick();
      picker = cb;
      canvas.classList.add("tool-place");
      store.update((s) => {
        s.pickingCell = true;
      });
    }
    function cancelPick() {
      if (!picker) return;
      const cb = picker;
      picker = null;
      canvas.classList.remove("tool-place");
      store.update((s) => {
        s.pickingCell = false;
      });
      cb(null);
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && picker) cancelPick();
    });
    canvas.addEventListener("pointerdown", (e) => {
      const map = store.getState().map;
      if (!map || e.button !== 0 || tool === TOOLS.SELECT || picker) return;
      const [wx, wy] = toWorld(e);
      if (!inMap(map, wx, wy)) return;
      const cell = editActions.findCell(wx, wy);
      if (cell < 0) return;
      if (tool === TOOLS.ADD_BURG) {
        panels.promptBurgName((name) => {
          if (name != null) {
            const id = editActions.addBurg(cell, name);
            if (id != null) panels.openBurg(id);
          }
        }, cell);
        return;
      }
      if (tool === TOOLS.ADD_MARKER) {
        const id = editActions.addMarker(cell, markerType);
        if (id != null) panels.openMarker(id);
        return;
      }
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      store.beginBatch(`${PAINT_KINDS[PAINT_TOOL_KIND[tool]]?.label ?? "\u5730\u5F62"}\u3092\u5857\u308B`);
      brush.begin(cell, radius);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!brush.isPainting) return;
      const map = store.getState().map;
      const [wx, wy] = toWorld(e);
      if (!inMap(map, wx, wy)) return;
      const cell = editActions.findCell(wx, wy);
      if (cell >= 0) brush.continue(cell, radius);
    });
    const endStroke = () => {
      if (brush.isPainting) {
        brush.end();
        store.endBatch();
      }
    };
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("click", (e) => {
      const map = store.getState().map;
      if (!map) return;
      const [wx, wy] = toWorld(e);
      if (!inMap(map, wx, wy)) return;
      const cell = editActions.findCell(wx, wy);
      if (picker && cell >= 0) {
        const cb = picker;
        picker = null;
        canvas.classList.remove("tool-place");
        store.update((s) => {
          s.pickingCell = false;
        });
        cb(cell);
        return;
      }
      if (panels.regimentPending?.() && panels.consumeRegimentPlacement?.(cell)) return;
      if (tool !== TOOLS.SELECT) return;
      const picked = pickAt(map, cell, wx, wy, 6 / viewport.k);
      if (!picked || picked.type === "cell") return;
      if (picked.type === "burg") panels.openBurg(picked.id);
      else if (picked.type === "marker") panels.openMarker(picked.id);
    });
    canvas.addEventListener("dblclick", (e) => {
      const map = store.getState().map;
      if (!map || tool !== TOOLS.SELECT) return;
      const [wx, wy] = toWorld(e);
      if (!inMap(map, wx, wy)) return;
      const cell = editActions.findCell(wx, wy);
      if (cell < 0) return;
      const picked = pickAt(map, cell, wx, wy, 6 / viewport.k);
      if (picked && picked.type !== "cell") return;
      const stateId = map.pack.cells.state[cell];
      if (stateId) panels.openEntity("state", stateId);
    });
    return {
      setTool,
      setTarget,
      setRadius,
      setMarkerType,
      setZoneMode,
      pickCell,
      cancelPick,
      get tool() {
        return tool;
      },
      get target() {
        return target;
      }
    };
  }

  // js/ui/shortcuts.js
  var PAN_STEP = 80;
  var LAYER_KEYS2 = { 1: "states", 2: "cultures", 3: "religions", 4: "provinces", 5: "heights", b: "biomes", c: "coast", r: "rivers", t: "routes", u: "burgs", l: "labels" };
  var TOOL_KEYS = { 1: TOOLS.PAINT_STATE, 2: TOOLS.PAINT_CULTURE, 3: TOOLS.PAINT_RELIGION, 4: TOOLS.PAINT_PROVINCE, 5: TOOLS.PAINT_BIOME, 6: TOOLS.ADD_BURG, 7: TOOLS.ADD_MARKER };
  function initShortcuts({ store, actions, openFileDialog, openHelp, editMode, editToolbar, timeActions, panels }) {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === "z" && !e.shiftKey) {
            e.preventDefault();
            store.undo();
          } else if (k === "y" || k === "z" && e.shiftKey) {
            e.preventDefault();
            store.redo();
          } else if (k === "s" && !e.shiftKey && store.getState().map) {
            e.preventDefault();
            actions.saveNative();
          }
        }
        return;
      }
      const t = e.target;
      const inFormField = t instanceof HTMLElement && (t.closest("select, input, textarea") || t.isContentEditable);
      const inDialog = t instanceof HTMLElement && t.closest("dialog[open]");
      if (inFormField) return;
      if (inDialog && e.key !== " " && e.key !== "Spacebar" && e.key !== "Escape") return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const hasMap = !!store.getState().map;
      if (key === "o") {
        e.preventDefault();
        openFileDialog();
        return;
      }
      if (key === " " || key === "Spacebar") {
        e.preventDefault();
        if (!hasMap || !timeActions) return;
        if (timeActions.isRunning()) timeActions.stop();
        else timeActions.start();
        return;
      }
      if (key === "Escape") {
        panels?.military?.cancelPending();
      }
      if (key === "?") {
        e.preventDefault();
        openHelp();
        return;
      }
      if (!hasMap) return;
      if (key === "v") {
        editMode?.setTool(TOOLS.SELECT);
        editToolbar?.sync();
        return;
      }
      if (key === "[" || key === "]") {
        const cur = Number(byId("tool-radius").value);
        const next = cur + (key === "]" ? 10 : -10);
        editMode?.setRadius(next);
        byId("tool-radius").value = String(Math.max(10, Math.min(200, next)));
        return;
      }
      if (editMode && editMode.tool !== TOOLS.SELECT && key in TOOL_KEYS) {
        editMode.setTool(TOOL_KEYS[key]);
        editToolbar?.fillTargets(TOOL_KEYS[key]);
        editToolbar?.sync();
        return;
      }
      if (editMode && editMode.tool === TOOLS.SELECT && (key === "6" || key === "7")) {
        editMode.setTool(TOOL_KEYS[key]);
        editToolbar?.fillTargets(TOOL_KEYS[key]);
        editToolbar?.sync();
        return;
      }
      if (key === "f" || key === "0") actions.fit();
      else if (key === "+" || key === "=") actions.zoomBy(1.25);
      else if (key === "-" || key === "_") actions.zoomBy(1 / 1.25);
      else if (key === "ArrowLeft") {
        e.preventDefault();
        actions.pan(PAN_STEP, 0);
      } else if (key === "ArrowRight") {
        e.preventDefault();
        actions.pan(-PAN_STEP, 0);
      } else if (key === "ArrowUp") {
        e.preventDefault();
        actions.pan(0, PAN_STEP);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        actions.pan(0, -PAN_STEP);
      } else if (key in LAYER_KEYS2) actions.toggle(LAYER_KEYS2[key]);
    });
  }
  function initHelpDialog() {
    const dialog = byId("help-dialog");
    return { open: () => {
      if (!dialog.open) dialog.showModal();
    } };
  }

  // js/core/edit/burgs.js
  var isLive18 = (b) => !!b && typeof b === "object" && !b.removed && b.i > 0;
  var round63 = (v) => Math.round(v * 1e6) / 1e6;
  function estimatePopulation(map, cell, rnd) {
    const idx = cellIndexOf(map);
    const near = idx.findWithin(map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1], map.grid.spacing * 6).map((i) => map.pack.cells.burg[i]).filter((id) => id > 0).map((id) => map.pack.burgs[id]).filter(isLive18);
    const base = near.length ? near.map((b) => b.population).sort((a, b) => a - b)[near.length >> 1] : Math.max(0.05, (map.pack.cells.pop[cell] ?? 1) * 0.25);
    const jitter = rnd ? rnd.float(0.6, 1.4) : 1;
    return Math.max(0.01, Math.round(base * jitter * 1e3) / 1e3);
  }
  function planAddBurg(map, { cell, name, capital = false, rnd }) {
    const c = map.pack.cells;
    if (cell < 0 || cell >= c.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u90FD\u5E02\u3092\u7F6E\u3051\u307E\u305B\u3093");
    if (c.biome[cell] === 0) throw new Error("\u6C34\u57DF\u306B\u306F\u90FD\u5E02\u3092\u7F6E\u3051\u307E\u305B\u3093");
    if (c.burg[cell]) throw new Error("\u3053\u306E\u30BB\u30EB\u306B\u306F\u65E2\u306B\u90FD\u5E02\u304C\u3042\u308A\u307E\u3059");
    if (!name || !name.trim()) throw new Error("\u90FD\u5E02\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    const { p } = map.geometry.pack;
    const id = map.pack.burgs.length || 1;
    const state = c.state[cell], culture = c.culture[cell];
    const burg = {
      cell,
      x: p[cell][0],
      y: p[cell][1],
      i: id,
      state,
      culture,
      name: name.trim(),
      feature: c.biome[cell] === 0 ? 0 : map.grid.f[map.geometry.pack.g[cell]],
      capital: 0,
      population: estimatePopulation(map, cell, rnd),
      type: "Generic",
      group: "town"
    };
    const burgs = map.pack.burgs.length ? map.pack.burgs.slice() : [null];
    burgs[id] = burg;
    const parts = [
      setList((m) => m.pack.burgs, (m, v) => {
        m.pack.burgs = v;
      }, burgs),
      setIndexed((m) => m.pack.cells.burg, [[cell, 0, id]])
    ];
    const state1 = map.pack.states[state];
    if (state1) {
      const patch = {};
      if (typeof state1.burgs === "number") patch.burgs = state1.burgs + 1;
      if (typeof state1.urban === "number") patch.urban = round63(state1.urban + burg.population);
      if (Object.keys(patch).length) parts.push(setProps(state1, patch));
    }
    const province1 = map.pack.provinces[c.province[cell]];
    if (province1 && typeof province1.urban === "number" && Array.isArray(province1.burgs)) {
      parts.push(setProps(province1, { urban: round63(province1.urban + burg.population), burgs: [...province1.burgs, id] }));
    }
    const religion1 = map.pack.religions[c.religion[cell]];
    if (religion1 && typeof religion1.urban === "number") parts.push(setProps(religion1, { urban: round63(religion1.urban + burg.population) }));
    if (capital && state1) {
      const oldCapital = map.pack.burgs[state1.capital];
      if (isLive18(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
      parts.push({ apply: (m) => {
        m.pack.burgs[id].capital = 1;
      }, revert: (m) => {
        m.pack.burgs[id].capital = 0;
      } });
      parts.push(setProps(state1, { capital: id, center: cell }));
    }
    return { command: makeCommand("\u90FD\u5E02\u3092\u8FFD\u52A0", ["places"], parts), id };
  }
  function planMoveBurg(map, id, cell) {
    const burg = map.pack.burgs[id];
    if (!isLive18(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const c = map.pack.cells;
    if (burg.cell === cell) return null;
    if (cell < 0 || cell >= c.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u79FB\u52D5\u3067\u304D\u307E\u305B\u3093");
    if (c.biome[cell] === 0) throw new Error("\u6C34\u57DF\u306B\u306F\u79FB\u52D5\u3067\u304D\u307E\u305B\u3093");
    if (c.burg[cell]) throw new Error("\u79FB\u52D5\u5148\u306B\u306F\u65E2\u306B\u90FD\u5E02\u304C\u3042\u308A\u307E\u3059");
    const state0 = map.pack.states[burg.state];
    if (burg.capital && state0 && c.state[cell] !== burg.state) throw new Error("\u9996\u90FD\u306F\u81EA\u56FD\u306E\u571F\u5730\u306E\u4E2D\u3067\u306E\u307F\u79FB\u52D5\u3067\u304D\u307E\u3059");
    const { p } = map.geometry.pack;
    const fromState = map.pack.states[burg.state], toState = map.pack.states[c.state[cell]];
    const fromProvince = map.pack.provinces[c.province[burg.cell]], toProvince = map.pack.provinces[c.province[cell]];
    const fromReligion = map.pack.religions[c.religion[burg.cell]], toReligion = map.pack.religions[c.religion[cell]];
    const parts = [
      setIndexed((m) => m.pack.cells.burg, [[burg.cell, id, 0], [cell, 0, id]]),
      setProps(burg, { cell, x: p[cell][0], y: p[cell][1], state: c.state[cell], culture: c.culture[cell] })
    ];
    if (fromState !== toState) {
      if (fromState) {
        const patch = {};
        if (typeof fromState.burgs === "number") patch.burgs = Math.max(0, fromState.burgs - 1);
        if (typeof fromState.urban === "number") patch.urban = round63(Math.max(0, fromState.urban - burg.population));
        if (Object.keys(patch).length) parts.push(setProps(fromState, patch));
      }
      if (toState) {
        const patch = {};
        if (typeof toState.burgs === "number") patch.burgs = toState.burgs + 1;
        if (typeof toState.urban === "number") patch.urban = round63(toState.urban + burg.population);
        if (Object.keys(patch).length) parts.push(setProps(toState, patch));
      }
    }
    if (fromProvince !== toProvince) {
      if (fromProvince && typeof fromProvince.urban === "number") parts.push(setProps(fromProvince, { urban: round63(Math.max(0, fromProvince.urban - burg.population)), ...Array.isArray(fromProvince.burgs) ? { burgs: fromProvince.burgs.filter((b) => b !== id) } : {} }));
      if (toProvince && typeof toProvince.urban === "number") parts.push(setProps(toProvince, { urban: round63(toProvince.urban + burg.population), ...Array.isArray(toProvince.burgs) ? { burgs: [...toProvince.burgs, id] } : {} }));
    }
    if (fromReligion !== toReligion) {
      if (fromReligion && typeof fromReligion.urban === "number") parts.push(setProps(fromReligion, { urban: round63(Math.max(0, fromReligion.urban - burg.population)) }));
      if (toReligion && typeof toReligion.urban === "number") parts.push(setProps(toReligion, { urban: round63(toReligion.urban + burg.population) }));
    }
    const state = map.pack.states[burg.state];
    if (burg.capital && state && state.capital === id) parts.push(setProps(state, { center: cell }));
    return makeCommand("\u90FD\u5E02\u3092\u79FB\u52D5", ["places"], parts);
  }
  function planRenameBurg(map, id, name) {
    const burg = map.pack.burgs[id];
    if (!isLive18(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u90FD\u5E02\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (trimmed === burg.name) return null;
    return makeCommand("\u90FD\u5E02\u306E\u540D\u524D\u3092\u5909\u66F4", ["places"], [setProps(burg, { name: trimmed })]);
  }
  function whyCannotRemoveBurg(map, id) {
    const burg = map.pack.burgs[id];
    if (!isLive18(burg)) return "\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093";
    if (burg.capital) return "\u9996\u90FD\u306F\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3002\u5148\u306B\u5225\u306E\u90FD\u5E02\u3092\u9996\u90FD\u306B\u3057\u3066\u304F\u3060\u3055\u3044";
    if (map.markets?.some((m) => m.centerBurgId === id)) return "\u5E02\u5834\u306E\u4E2D\u5FC3\u90FD\u5E02\u306F\u524A\u9664\u3067\u304D\u307E\u305B\u3093";
    return null;
  }
  function planRemoveBurg(map, id) {
    const reason = whyCannotRemoveBurg(map, id);
    if (reason) throw new Error(reason);
    const burg = map.pack.burgs[id];
    const c = map.pack.cells;
    const parts = [setIndexed((m) => m.pack.cells.burg, [[burg.cell, id, 0]]), setProps(burg, { removed: true })];
    const state = map.pack.states[burg.state];
    if (state) {
      const patch = {};
      if (typeof state.burgs === "number") patch.burgs = Math.max(0, state.burgs - 1);
      if (typeof state.urban === "number") patch.urban = round63(Math.max(0, state.urban - burg.population));
      if (Object.keys(patch).length) parts.push(setProps(state, patch));
    }
    const province = map.pack.provinces[c.province[burg.cell]];
    if (province && typeof province.urban === "number") {
      parts.push(setProps(province, {
        urban: round63(Math.max(0, province.urban - burg.population)),
        ...Array.isArray(province.burgs) ? { burgs: province.burgs.filter((b) => b !== id) } : {}
      }));
    }
    const religion = map.pack.religions[c.religion[burg.cell]];
    if (religion && typeof religion.urban === "number") parts.push(setProps(religion, { urban: round63(Math.max(0, religion.urban - burg.population)) }));
    const notePart = removeLegacyNotesPart(map, "burg", id);
    if (notePart) parts.push(notePart);
    return makeCommand("\u90FD\u5E02\u3092\u524A\u9664", ["places"], parts);
  }
  function planSetCapital(map, stateId, burgId) {
    const state = map.pack.states[stateId];
    if (!state || !state.i) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const burg = map.pack.burgs[burgId];
    if (!isLive18(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (burg.state !== stateId) throw new Error("\u9996\u90FD\u306F\u81EA\u56FD\u5185\u306E\u90FD\u5E02\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (state.capital === burgId) return null;
    const parts = [];
    const oldCapital = map.pack.burgs[state.capital];
    if (isLive18(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
    parts.push(setProps(burg, { capital: 1 }), setProps(state, { capital: burgId, center: burg.cell }));
    return makeCommand("\u9996\u90FD\u3092\u5909\u66F4", ["places"], parts);
  }

  // js/core/edit/entities.js
  var LIST_KEY3 = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
  var isLive19 = (e) => !!e && typeof e === "object" && !e.removed;
  function planRenameEntity(map, kind, id, name) {
    const listKey = LIST_KEY3[kind];
    if (!listKey) throw new Error("\u3053\u306E\u7A2E\u985E\u306E\u540D\u524D\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093");
    const e = map.pack[listKey]?.[id];
    if (!isLive19(e)) throw new Error("\u305D\u306E\u5BFE\u8C61\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    const field = "fullName" in e ? "fullName" : "name";
    if (trimmed === e[field]) return null;
    const label = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" }[kind];
    const patch = { [field]: trimmed };
    if (kind === "state" && field === "fullName") patch.name = shortNameFrom(trimmed);
    return makeCommand(`${label}\u306E\u540D\u524D\u3092\u5909\u66F4`, ["places"], [setProps(e, patch)]);
  }
  var EXTRA_KEYS = ["name", "form", "formName", "deity", "type"];
  function pickColor2(existingCount, rnd) {
    const golden = 137.508;
    const hue = Math.round((existingCount * golden + (rnd ? rnd.float(0, 360) : 0)) % 360);
    const sat = 55 + (rnd ? Math.round(rnd.float(0, 15)) : 10);
    const light = 45 + (rnd ? Math.round(rnd.float(-10, 10)) : 0);
    return hslToHex(hue, sat, light);
  }
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
    return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
  }
  var LABEL_OF = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" };
  function planAddEntity(map, { kind, name, rnd, extra }) {
    if (kind === "province") throw new Error("\u5C5E\u5DDE\u306F\u6240\u5C5E\u3059\u308B\u56FD\u5BB6\u304C\u5FC5\u8981\u3067\u3059\u3002planAddProvince \u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044");
    const listKey = LIST_KEY3[kind];
    if (!listKey) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u7A2E\u985E\u3067\u3059: ${kind}`);
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error(`${LABEL_OF[kind]}\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044`);
    const existing = map.pack[listKey];
    const id = existing.length || 1;
    const liveCount = existing.filter(isLive19).length;
    const entity = {
      i: id,
      name: trimmed,
      fullName: trimmed,
      color: pickColor2(liveCount, rnd),
      cells: 0,
      area: 0,
      rural: 0,
      urban: 0,
      burgs: 0
    };
    if (kind === "state") {
      entity.capital = 0;
      entity.neighbors = [];
    }
    for (const k of EXTRA_KEYS) if (typeof extra?.[k] === "string" && extra[k].trim()) entity[k] = extra[k].trim();
    const list = existing.length ? existing.slice() : [null];
    list[id] = entity;
    const parts = [setList((m) => m.pack[listKey], (m, v) => {
      m.pack[listKey] = v;
    }, list)];
    return { command: makeCommand(`${LABEL_OF[kind]}\u3092\u65B0\u898F\u4F5C\u6210`, ["politics"], parts), id };
  }
  function planAddProvince(map, { state, name, rnd }) {
    const owner = map.pack.states[state];
    if (!isLive19(owner) || !owner.i) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u5C5E\u5DDE\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    const existing = map.pack.provinces;
    const id = existing.length || 1;
    const liveCount = existing.filter(isLive19).length;
    const entity = {
      i: id,
      state,
      name: trimmed,
      fullName: trimmed,
      color: pickColor2(liveCount, rnd),
      cells: 0,
      area: 0,
      rural: 0,
      urban: 0,
      burgs: []
    };
    const list = existing.length ? existing.slice() : [null];
    list[id] = entity;
    const parts = [setList((m) => m.pack.provinces, (m, v) => {
      m.pack.provinces = v;
    }, list)];
    return { command: makeCommand("\u5C5E\u5DDE\u3092\u65B0\u898F\u4F5C\u6210", ["politics"], parts), id };
  }
  function planRemoveEntity(map, kind, id, { force = false } = {}) {
    const listKey = LIST_KEY3[kind];
    if (!listKey) throw new Error("\u3053\u306E\u7A2E\u985E\u306F\u524A\u9664\u3067\u304D\u307E\u305B\u3093");
    const e = map.pack[listKey]?.[id];
    if (!isLive19(e) || !e.i) throw new Error("\u305D\u306E\u5BFE\u8C61\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const label = LABEL_OF[kind], nm = e.fullName ?? e.name;
    const c = map.pack.cells;
    const parts = [];
    const clearCells = (field, ids2) => {
      const arr = c[field], changes = [];
      for (let i = 0; i < arr.length; i++) if (ids2.has(arr[i])) changes.push([i, arr[i], 0]);
      if (changes.length) parts.push(setIndexed((m) => m.pack.cells[field], changes));
    };
    const zero = { cells: 0, area: 0, rural: 0, urban: 0 };
    if (kind === "state") {
      const wars = map.ext?.data?.wars ?? [];
      if (!force && wars.some((w) => !w.endedAt && (w.attackers.includes(id) || w.defenders.includes(id)))) throw new Error(`\u300C${nm}\u300D\u306F\u6226\u4E89\u4E2D\u306E\u305F\u3081\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3002\u5148\u306B\u8B1B\u548C\u3057\u3066\u304F\u3060\u3055\u3044`);
      const provIds = new Set(map.pack.provinces.filter((p) => isLive19(p) && p.i && p.state === id).map((p) => p.i));
      clearCells("state", /* @__PURE__ */ new Set([id]));
      if (provIds.size) clearCells("province", provIds);
      for (const p of map.pack.provinces) if (provIds.has(p.i)) parts.push(setProps(p, { removed: true, ...zero }));
      for (const b of map.pack.burgs) if (isLive19(b) && b.i && b.state === id) parts.push(setProps(b, { state: 0, ...b.capital ? { capital: 0 } : {} }));
      parts.push(setProps(e, { removed: true, ...zero, burgs: 0, capital: 0, military: [] }));
    } else if (kind === "culture") {
      clearCells("culture", /* @__PURE__ */ new Set([id]));
      for (const b of map.pack.burgs) if (isLive19(b) && b.i && b.culture === id) parts.push(setProps(b, { culture: 0 }));
      parts.push(setProps(e, { removed: true, ...zero }));
    } else if (kind === "religion") {
      clearCells("religion", /* @__PURE__ */ new Set([id]));
      parts.push(setProps(e, { removed: true, ...zero }));
    } else {
      clearCells("province", /* @__PURE__ */ new Set([id]));
      for (const b of map.pack.burgs) if (isLive19(b) && b.i && b.province === id) parts.push(setProps(b, { province: 0 }));
      parts.push(setProps(e, { removed: true, ...zero }));
    }
    return makeCommand(`${label}\u300C${nm}\u300D\u3092\u524A\u9664`, ["politics", "places"], parts);
  }

  // js/core/edit/finance.js
  var isLive20 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function planSetFinance(map, stateId, patch) {
    const s = map.pack.states[stateId];
    if (!isLive20(s)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    const before = getFinance(s);
    const after = {};
    if (patch.salesTax !== void 0) after.salesTax = Math.round(clampRate(patch.salesTax) * 100) / 100;
    if (patch.pollTax !== void 0) after.pollTax = Math.round(clampRate(patch.pollTax) * 100) / 100;
    if (patch.treasury !== void 0) {
      const t = Number(patch.treasury);
      if (!Number.isFinite(t)) throw new Error("\u56FD\u5EAB\u306F\u6570\u5024\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
      after.treasury = Math.max(0, Math.round(t * 100) / 100);
    }
    const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== before[k] || typeof s[k] !== "number"));
    const real = Object.fromEntries(Object.entries(changed).filter(([k, v]) => v !== before[k]));
    if (!Object.keys(real).length) return null;
    return makeCommand(`\u8CA1\u653F\u306E\u5909\u66F4\uFF08${s.name}\uFF09`, [], [setProps(s, real)]);
  }

  // js/core/edit/profile.js
  var round64 = (v) => Math.round(v * 1e6) / 1e6;
  var isLive21 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  var CULTURE_TYPES = Object.freeze([
    { id: "Generic", label: "\u6A19\u6E96" },
    { id: "River", label: "\u6CB3\u5DDD" },
    { id: "Lake", label: "\u6E56\u7554" },
    { id: "Naval", label: "\u6D77\u6D0B" },
    { id: "Nomadic", label: "\u904A\u7267" },
    { id: "Hunting", label: "\u72E9\u731F" },
    { id: "Highland", label: "\u9AD8\u5730" }
  ]);
  var RELIGION_TYPES = Object.freeze([
    { id: "Folk", label: "\u6C11\u9593\u4FE1\u4EF0" },
    { id: "Organized", label: "\u7D44\u7E54\u5B97\u6559" },
    { id: "Cult", label: "\u30AB\u30EB\u30C8" },
    { id: "Heresy", label: "\u7570\u7AEF" }
  ]);
  var STATE_FORMS = Object.freeze([
    { id: "Monarchy", label: "\u541B\u4E3B\u5236" },
    { id: "Republic", label: "\u5171\u548C\u5236" },
    { id: "Theocracy", label: "\u795E\u6A29\u5236" },
    { id: "Union", label: "\u9023\u5408" },
    { id: "Anarchy", label: "\u7121\u653F\u5E9C" }
  ]);
  var BURG_GROUPS = Object.freeze([
    { id: "capital", label: "\u9996\u90FD" },
    { id: "city", label: "\u90FD\u5E02" },
    { id: "town", label: "\u753A" },
    { id: "village", label: "\u6751" },
    { id: "hamlet", label: "\u96C6\u843D" },
    { id: "fort", label: "\u7826" },
    { id: "monastery", label: "\u4FEE\u9053\u9662" },
    { id: "caravanserai", label: "\u968A\u5546\u5BBF" },
    { id: "trading_post", label: "\u4EA4\u6613\u6240" }
  ]);
  var BURG_FEATURES = Object.freeze([
    { id: "citadel", label: "\u57CE\u585E", icon: "\u{1F3F0}" },
    { id: "walls", label: "\u57CE\u58C1", icon: "\u{1F9F1}" },
    { id: "plaza", label: "\u5E83\u5834", icon: "\u26F2" },
    { id: "temple", label: "\u795E\u6BBF", icon: "\u26EA" },
    { id: "shanty", label: "\u30B9\u30E9\u30E0", icon: "\u{1F3DA}" }
  ]);
  var ENTITY_LIST = { state: "states", culture: "cultures", religion: "religions" };
  var KIND_LABEL2 = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559" };
  var ids = (list) => list.map((x) => x.id);
  function planSetEntityProfile(map, kind, id, patch) {
    const list = map.pack[ENTITY_LIST[kind]];
    if (!list) throw new Error("\u3053\u306E\u7A2E\u985E\u306F\u7DE8\u96C6\u3067\u304D\u307E\u305B\u3093");
    const e = list[id];
    if (!isLive21(e)) throw new Error("\u305D\u306E\u5BFE\u8C61\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const next = {};
    const text2 = (k, v, max = 60) => {
      const t = String(v ?? "").trim();
      if (!t) throw new Error("\u7A7A\u306B\u306F\u3067\u304D\u307E\u305B\u3093");
      if (t.length > max) throw new Error(`${max}\u6587\u5B57\u307E\u3067\u3067\u3059`);
      next[k] = t;
    };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "type") {
        const ok = kind === "religion" ? ids(RELIGION_TYPES) : ids(CULTURE_TYPES);
        if (!ok.includes(v)) throw new Error(`\u672A\u77E5\u306E\u7A2E\u985E\u3067\u3059: ${v}`);
        next.type = v;
      } else if (k === "form" && kind === "state") {
        if (!ids(STATE_FORMS).includes(v)) throw new Error(`\u672A\u77E5\u306E\u653F\u4F53\u3067\u3059: ${v}`);
        next.form = v;
      } else if (k === "formName" && kind === "state") text2("formName", v);
      else if ((k === "deity" || k === "form") && kind === "religion") text2(k, v);
      else throw new Error(`${KIND_LABEL2[kind]}\u3067\u306F\u300C${k}\u300D\u3092\u5909\u66F4\u3067\u304D\u307E\u305B\u3093`);
    }
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => e[k] !== v));
    if (!Object.keys(changed).length) return null;
    return makeCommand(`${KIND_LABEL2[kind]}\u306E\u8A2D\u5B9A\u3092\u5909\u66F4\uFF08${e.name}\uFF09`, ["politics"], [setProps(e, changed)]);
  }
  var parentsOf = (e) => {
    const ps = Array.isArray(e?.origins) ? [...new Set(e.origins.filter((o) => Number.isInteger(o)))] : [];
    return ps.length ? ps : [0];
  };
  function originTree(map, kind) {
    const list = map.pack[ENTITY_LIST[kind]] ?? [];
    const parent = /* @__PURE__ */ new Map(), parents = /* @__PURE__ */ new Map(), children = /* @__PURE__ */ new Map();
    for (const e of list) {
      if (!isLive21(e)) continue;
      const ps = parentsOf(e).filter((p) => p === 0 || isLive21(list[p]));
      const use = ps.length ? ps : [0];
      parent.set(e.i, use[0]);
      parents.set(e.i, use);
      for (const p of use) {
        if (!children.has(p)) children.set(p, []);
        children.get(p).push(e.i);
      }
    }
    return { parent, parents, children };
  }
  function descendantsOf(map, kind, id) {
    const { children } = originTree(map, kind);
    const out = /* @__PURE__ */ new Set(), stack = [...children.get(id) ?? []];
    while (stack.length) {
      const c = stack.pop();
      if (out.has(c)) continue;
      out.add(c);
      stack.push(...children.get(c) ?? []);
    }
    return [...out];
  }
  function planSetOrigins(map, kind, id, parentIds) {
    if (kind !== "culture" && kind !== "religion") throw new Error("\u8D77\u6E90\u3092\u6301\u3064\u306E\u306F\u6587\u5316\u3068\u5B97\u6559\u3060\u3051\u3067\u3059");
    const list = map.pack[ENTITY_LIST[kind]];
    const e = list[id];
    if (!isLive21(e)) throw new Error("\u305D\u306E\u5BFE\u8C61\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    let ps = [...new Set((parentIds ?? []).map(Number))];
    const banned = new Set(descendantsOf(map, kind, id));
    for (const p of ps) {
      if (p !== 0 && !isLive21(list[p])) throw new Error("\u8D77\u6E90\u306B\u6307\u5B9A\u3057\u305F\u5BFE\u8C61\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
      if (p === id) throw new Error("\u81EA\u5206\u81EA\u8EAB\u3092\u8D77\u6E90\u306B\u306F\u3067\u304D\u307E\u305B\u3093");
      if (banned.has(p)) throw new Error("\u81EA\u5206\u306E\u5B50\u5B6B\u3092\u8D77\u6E90\u306B\u306F\u3067\u304D\u307E\u305B\u3093\uFF08\u7CFB\u7D71\u304C\u8F2A\u306B\u306A\u308A\u307E\u3059\uFF09");
    }
    if (ps.length > 1) ps = ps.filter((p) => p !== 0);
    if (!ps.length) ps = [0];
    const cur = parentsOf(e);
    if (JSON.stringify(cur) === JSON.stringify(ps) && Array.isArray(e.origins) && e.origins.length === ps.length) return null;
    return makeCommand(`${KIND_LABEL2[kind]}\u306E\u8D77\u6E90\u3092\u5909\u66F4\uFF08${e.name}\uFF09`, ["politics"], [setProps(e, { origins: ps })]);
  }
  function planSetOrigin(map, kind, id, parentId) {
    return planSetOrigins(map, kind, id, [parentId]);
  }
  function planSetBurgProfile(map, burgId, patch) {
    const b = map.pack.burgs[burgId];
    if (!b || b.removed || !b.i) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u90FD\u5E02\u3067\u3059");
    const next = {}, parts = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === "group") {
        if (!ids(BURG_GROUPS).includes(v)) throw new Error(`\u672A\u77E5\u306E\u90FD\u5E02\u306E\u533A\u5206\u3067\u3059: ${v}`);
        if (b.capital && v !== "capital") throw new Error("\u9996\u90FD\u306E\u533A\u5206\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\uFF08\u5148\u306B\u5225\u306E\u9996\u90FD\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\uFF09");
        if (!b.capital && v === "capital") throw new Error("\u300C\u9996\u90FD\u300D\u306B\u3059\u308B\u306B\u306F\u3001\u56FD\u306E\u9996\u90FD\u3068\u3057\u3066\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
        next.group = v;
      } else if (k === "type") {
        if (!ids(CULTURE_TYPES).includes(v)) throw new Error(`\u672A\u77E5\u306E\u7A2E\u985E\u3067\u3059: ${v}`);
        next.type = v;
      } else if (BURG_FEATURES.some((f) => f.id === k)) next[k] = v ? 1 : 0;
      else if (k === "population") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error("\u4EBA\u53E3\u306F 0 \u4EE5\u4E0A\u306E\u6570\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
        next.population = round64(n);
      } else throw new Error(`\u90FD\u5E02\u3067\u306F\u300C${k}\u300D\u3092\u5909\u66F4\u3067\u304D\u307E\u305B\u3093`);
    }
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => (b[k] ?? (BURG_FEATURES.some((f) => f.id === k) ? 0 : void 0)) !== v));
    if (!Object.keys(changed).length) return null;
    parts.push(setProps(b, changed));
    if ("population" in changed) {
      const delta = changed.population - (b.population ?? 0);
      const bump = (e) => {
        if (e && typeof e.urban === "number") parts.push(setProps(e, { urban: Math.max(0, round64(e.urban + delta)) }));
      };
      bump(map.pack.states[b.state]);
      bump(map.pack.provinces[map.pack.cells.province[b.cell]]);
      bump(map.pack.religions[map.pack.cells.religion[b.cell]]);
    }
    return makeCommand(`\u90FD\u5E02\u306E\u8A2D\u5B9A\u3092\u5909\u66F4\uFF08${b.name}\uFF09`, ["places"], parts);
  }

  // js/core/edit/economy.js
  var isLive22 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function getTechLevel(map, stateId) {
    const s = map.pack.states[stateId];
    if (!isLive22(s)) return null;
    return typeof s.techLevel === "number" ? clampTech(s.techLevel) : 3;
  }
  function planSetTechLevel(map, stateId, value) {
    const s = map.pack.states[stateId];
    if (!isLive22(s)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    const after = clampTech(value);
    const before = typeof s.techLevel === "number" ? clampTech(s.techLevel) : 3;
    if (before === after) return null;
    return makeCommand(`\u6280\u8853\u6C34\u6E96\u306E\u5909\u66F4\uFF08${s.name}\uFF09`, [], [setProps(s, { techLevel: after })]);
  }

  // js/core/edit/military-doctrine.js
  var isLive23 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function getDoctrine(map, stateId) {
    const s = map.pack.states[stateId];
    if (!isLive23(s)) return null;
    return DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
  }
  function planSetDoctrine(map, stateId, doctrineKey) {
    const s = map.pack.states[stateId];
    if (!isLive23(s)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    if (!DOCTRINE_BY_KEY[doctrineKey]) throw new Error("\u4E0D\u660E\u306A\u30C9\u30AF\u30C8\u30EA\u30F3\u3067\u3059");
    const before = DOCTRINE_BY_KEY[s.doctrine] ? s.doctrine : DEFAULT_DOCTRINE;
    if (before === doctrineKey) return null;
    const label = DOCTRINE_BY_KEY[doctrineKey].label;
    return makeCommand(`\u6226\u4E89\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u5909\u66F4\uFF08${s.name}: ${label}\uFF09`, [], [setProps(s, { doctrine: doctrineKey })]);
  }

  // js/app/edit-actions.js
  function createEditActions({ store, renderer }) {
    const rnd = createRandom(Date.now());
    const rerender = () => renderer.requestRender();
    const withMap = (fn) => {
      const m = store.getState().map;
      return m ? fn(m) : void 0;
    };
    const commitOrThrow = (plan) => {
      if (plan) {
        store.commit(plan);
        rerender();
      }
    };
    const safeRun = (label, fn) => {
      try {
        fn();
      } catch (e) {
        store.update((s) => {
          s.error = `${label}: ${e.message}`;
        });
      }
    };
    const currentDate = () => store.getState().map?.worldTime ?? { year: 1, month: 1 };
    const suggested = /* @__PURE__ */ new Map();
    const MAX_REMEMBERED = 200;
    function suggestName2(kind, ctx = {}) {
      return withMap((map) => {
        const r = suggestName(map, { kind, rnd, ...ctx });
        if (suggested.size >= MAX_REMEMBERED) suggested.delete(suggested.keys().next().value);
        suggested.set(r.name, { kind, extra: r.extra });
        return r.name;
      }) ?? "";
    }
    const takeSuggested = (name, kind) => {
      const s = suggested.get((name ?? "").trim());
      return s && s.kind === kind ? s : null;
    };
    function resolveName(kind, name, ctx) {
      const trimmed = (name ?? "").trim();
      if (!trimmed) {
        const gen = suggestName2(kind, ctx);
        return { name: gen, provisional: !!gen, extra: suggested.get(gen)?.extra };
      }
      const s = takeSuggested(trimmed, kind);
      return { name: trimmed, provisional: !!s, extra: s?.extra };
    }
    return {
      suggestName: suggestName2,
      NAME_STYLES,
      STYLE_KEYS,
      isProvisional(kind, id) {
        return withMap((map) => isProvisional(map, kind, id)) ?? false;
      },
      /** 仮の名前を確定する（名前は変えず、「仮」の印だけ外す） */
      confirmName(kind, id) {
        withMap((map) => safeRun("\u540D\u524D\u306E\u78BA\u5B9A", () => commitOrThrow(planSetProvisional(map, kind, id, false))));
      },
      /** 文化の名前の系統（明示されたもの。無ければ null）と、実際に使われる系統 */
      getNameStyle(cultureId) {
        return withMap((map) => getNameStyle(map, cultureId)) ?? null;
      },
      effectiveNameStyle(cultureId) {
        return withMap((map) => styleOfCulture(map, cultureId)) ?? "western";
      },
      setNameStyle(cultureId, style) {
        withMap((map) => safeRun("\u540D\u524D\u306E\u7CFB\u7D71\u306E\u5909\u66F4", () => commitOrThrow(planSetNameStyle(map, cultureId, style))));
      },
      /** 塗りブラシの1ストローク分のセルをまとめて塗る（Undo 1回にする） */
      paintCells(kind, target, cells, opts = {}) {
        withMap((map) => safeRun("\u5857\u308A\u66FF\u3048", () => {
          const { command, report } = planPaint(map, { kind, target, cells, force: opts.force });
          if (command) commitOrThrow(command);
          return report;
        }));
      },
      paintBiome(target, cells) {
        withMap((map) => safeRun("\u5730\u5F62\u306E\u5909\u66F4", () => {
          const { command } = planBiomePaint(map, { target, cells });
          if (command) commitOrThrow(command);
        }));
      },
      addMarker(cell, opts) {
        return withMap((map) => {
          let out;
          safeRun("\u30DE\u30FC\u30AB\u30FC\u306E\u8FFD\u52A0", () => {
            const r = planAddMarker(map, { cell, ...opts });
            commitOrThrow(r.command);
            out = r.id;
          });
          return out;
        });
      },
      moveMarker(id, cell) {
        withMap((map) => safeRun("\u30DE\u30FC\u30AB\u30FC\u306E\u79FB\u52D5", () => commitOrThrow(planMoveMarker(map, id, cell))));
      },
      editMarker(id, patch) {
        withMap((map) => safeRun("\u30DE\u30FC\u30AB\u30FC\u306E\u7DE8\u96C6", () => commitOrThrow(planEditMarker(map, id, patch))));
      },
      removeMarker(id) {
        withMap((map) => safeRun("\u30DE\u30FC\u30AB\u30FC\u306E\u524A\u9664", () => commitOrThrow(planRemoveMarker(map, id))));
      },
      /** name が空なら、その土地の文化に合わせた仮の名前を付ける */
      addBurg(cell, name, opts = {}) {
        return withMap((map) => {
          let out;
          safeRun("\u90FD\u5E02\u306E\u8FFD\u52A0", () => {
            const n = resolveName("burg", name, { cell });
            const r = planAddBurg(map, { cell, name: n.name, rnd, ...opts });
            commitOrThrow(n.provisional ? withProvisional(map, r.command, "burg", r.id, true) : r.command);
            out = r.id;
          });
          return out;
        });
      },
      moveBurg(id, cell) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u79FB\u52D5", () => commitOrThrow(planMoveBurg(map, id, cell))));
      },
      renameBurg(id, name) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u6539\u540D", () => {
          const plan = planRenameBurg(map, id, name);
          commitOrThrow(withProvisional(map, plan, "burg", id, !!takeSuggested(name, "burg")));
        }));
      },
      removeBurg(id) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u524A\u9664", () => commitOrThrow(planRemoveBurg(map, id))));
      },
      setCapital(stateId, burgId) {
        withMap((map) => safeRun("\u9996\u90FD\u306E\u5909\u66F4", () => commitOrThrow(planSetCapital(map, stateId, burgId))));
      },
      whyCannotRemoveBurg(id) {
        return withMap((map) => whyCannotRemoveBurg(map, id)) ?? "\u5730\u56F3\u304C\u8AAD\u307F\u8FBC\u307E\u308C\u3066\u3044\u307E\u305B\u3093";
      },
      getNote(type, id) {
        return withMap((map) => getNote(map, type, id)) ?? "";
      },
      setNote(type, id, text2) {
        withMap((map) => safeRun("\u6587\u7AE0\u306E\u4FDD\u5B58", () => commitOrThrow(planSetNote(map, type, id, text2))));
      },
      noteTarget(type, id) {
        return withMap((map) => noteTarget(map, type, id)) ?? null;
      },
      getRelation(a, b) {
        return withMap((map) => getRelation(map, a, b)) ?? null;
      },
      setDiplomacy(a, b, relation) {
        withMap((map) => safeRun("\u5916\u4EA4\u95A2\u4FC2\u306E\u5909\u66F4", () => commitOrThrow(planSetDiplomacy(map, a, b, relation, currentDate()))));
      },
      /** 国家・文化・宗教・属州の名前を変える（都市は renameBurg を使う） */
      renameEntity(kind, id, name) {
        withMap((map) => safeRun("\u540D\u524D\u306E\u5909\u66F4", () => {
          const plan = planRenameEntity(map, kind, id, name);
          commitOrThrow(withProvisional(map, plan, kind, id, !!takeSuggested(name, kind)));
        }));
      },
      /** 国家・文化・宗教・属州を削除する（Undo で戻せる）。成功したら true */
      removeEntity(kind, id) {
        return withMap((map) => {
          let ok = false;
          safeRun("\u524A\u9664", () => {
            commitOrThrow(planRemoveEntity(map, kind, id));
            ok = true;
          });
          return ok;
        }) ?? false;
      },
      /** 国家・文化・宗教を新規作成する。まだどのセルも持たない状態で作られるので、
       *  続けて「塗る」ツールでセルに塗って地図上に反映する必要がある */
      addEntity(kind, name) {
        return withMap((map) => {
          let out;
          safeRun(`${{ state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559" }[kind] ?? "\u5B9F\u4F53"}\u306E\u65B0\u898F\u4F5C\u6210`, () => {
            const n = resolveName(kind, name, {});
            const r = planAddEntity(map, { kind, name: n.name, rnd, extra: n.extra });
            commitOrThrow(n.provisional ? withProvisional(map, r.command, kind, r.id, true) : r.command);
            out = r.id;
          });
          return out;
        });
      },
      /** 属州を新規作成する（所属する国家を指定する） */
      addProvince(stateId, name) {
        return withMap((map) => {
          let out;
          safeRun("\u5C5E\u5DDE\u306E\u65B0\u898F\u4F5C\u6210", () => {
            const n = resolveName("province", name, { stateId });
            const r = planAddProvince(map, { state: stateId, name: n.name, rnd });
            commitOrThrow(n.provisional ? withProvisional(map, r.command, "province", r.id, true) : r.command);
            out = r.id;
          });
          return out;
        });
      },
      /** 属州を独立させ、新しい国家として切り出す */
      declareIndependence(provinceId, name) {
        return withMap((map) => {
          let out;
          safeRun("\u5C5E\u5DDE\u306E\u72EC\u7ACB", () => {
            const stateId = map.pack.provinces[provinceId]?.state;
            const n = resolveName("state", name, { stateId });
            const r = planDeclareIndependence(map, { provinceId, name: n.name, rnd, date: currentDate() });
            commitOrThrow(n.provisional ? withProvisional(map, r.command, "state", r.id, true) : r.command);
            out = r.id;
          });
          return out;
        });
      },
      /** 国家を統合する（from を to に併合し、from は解散する） */
      mergeStates(from, to) {
        withMap((map) => safeRun("\u56FD\u5BB6\u306E\u7D71\u5408", () => commitOrThrow(planMergeStates(map, { from, to, date: currentDate() }))));
      },
      /** 時代区分（江戸時代・近代など）の一覧・追加・編集・削除 */
      listEras() {
        return withMap((map) => listEras(map)) ?? [];
      },
      eraAt(year) {
        return withMap((map) => eraAt(map, year)) ?? null;
      },
      setEra(opts) {
        withMap((map) => safeRun("\u6642\u4EE3\u306E\u8A2D\u5B9A", () => commitOrThrow(planSetEra(map, opts))));
      },
      removeEra(id) {
        withMap((map) => safeRun("\u6642\u4EE3\u306E\u524A\u9664", () => commitOrThrow(planRemoveEra(map, id))));
      },
      TECH_MIN,
      TECH_MAX,
      // ---- 政治・文化の深さ（種類・政体・起源・都市の設備） ----
      setEntityProfile(kind, id, patch) {
        withMap((map) => safeRun("\u8A2D\u5B9A\u306E\u5909\u66F4", () => commitOrThrow(planSetEntityProfile(map, kind, id, patch))));
      },
      setOrigin(kind, id, parentId) {
        withMap((map) => safeRun("\u8D77\u6E90\u306E\u5909\u66F4", () => commitOrThrow(planSetOrigin(map, kind, id, parentId))));
      },
      setOrigins(kind, id, parentIds) {
        withMap((map) => safeRun("\u8D77\u6E90\u306E\u5909\u66F4", () => commitOrThrow(planSetOrigins(map, kind, id, parentIds))));
      },
      originsOf(kind, id) {
        return withMap((map) => originTree(map, kind).parents.get(id) ?? [0]) ?? [0];
      },
      originOf(kind, id) {
        return withMap((map) => originTree(map, kind).parent.get(id) ?? 0) ?? 0;
      },
      descendantsOf(kind, id) {
        return withMap((map) => descendantsOf(map, kind, id)) ?? [];
      },
      setBurgProfile(id, patch) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u8A2D\u5B9A", () => commitOrThrow(planSetBurgProfile(map, id, patch))));
      },
      // ---- 旅 ----
      addJourney(opts) {
        return withMap((map) => {
          let id = null;
          safeRun("\u65C5\u306E\u4F5C\u6210", () => {
            const r = planAddJourney(map, opts);
            store.commit(r.command);
            rerender();
            id = r.id;
          });
          return id;
        }) ?? null;
      },
      editJourney(id, patch) {
        withMap((map) => safeRun("\u65C5\u306E\u7DE8\u96C6", () => commitOrThrow(planEditJourney(map, id, patch))));
      },
      removeJourney(id) {
        withMap((map) => safeRun("\u65C5\u306E\u524A\u9664", () => commitOrThrow(planRemoveJourney(map, id))));
      },
      /** 区間を足す。成功なら true。経路が無いときは理由を画面に出して false */
      addLeg(id, leg) {
        return withMap((map) => {
          let ok = false;
          safeRun("\u533A\u9593\u306E\u8FFD\u52A0", () => {
            commitOrThrow(planAddLeg(map, id, leg));
            ok = true;
          });
          return ok;
        }) ?? false;
      },
      removeLeg(id, index) {
        withMap((map) => safeRun("\u533A\u9593\u306E\u524A\u9664", () => commitOrThrow(planRemoveLeg(map, id, index))));
      },
      changeLegTransport(id, index, transport) {
        withMap((map) => safeRun("\u79FB\u52D5\u624B\u6BB5\u306E\u5909\u66F4", () => commitOrThrow(planChangeLegTransport(map, id, index, transport))));
      },
      // ---- ゾーン ----
      addZone(opts) {
        return withMap((map) => {
          let idx = null;
          safeRun("\u30BE\u30FC\u30F3\u306E\u4F5C\u6210", () => {
            const r = planAddZone(map, opts);
            store.commit(r.command);
            rerender();
            idx = r.index;
          });
          return idx;
        }) ?? null;
      },
      /** 種のセルから範囲を自動で決めて、新しいゾーンを作る（おまかせ） */
      addZoneAround(cell, { type, size = 24, name } = {}) {
        return withMap((map) => {
          const cells = growZoneCells(map, cell, size, rnd);
          if (!cells.length) {
            store.update((s) => {
              s.error = "\u30BE\u30FC\u30F3\u3092\u4F5C\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u305D\u3053\u306F\u6C34\u306E\u4E0A\u304B\u3001\u5730\u56F3\u306E\u5916\u3067\u3059\uFF09";
            });
            return null;
          }
          let idx = null;
          safeRun("\u30BE\u30FC\u30F3\u306E\u4F5C\u6210", () => {
            const r = planAddZone(map, { name, type, cells });
            store.commit(r.command);
            rerender();
            idx = r.index;
          });
          return idx;
        }) ?? null;
      },
      editZone(index, patch) {
        withMap((map) => safeRun("\u30BE\u30FC\u30F3\u306E\u7DE8\u96C6", () => commitOrThrow(planEditZone(map, index, patch))));
      },
      removeZone(index) {
        withMap((map) => safeRun("\u30BE\u30FC\u30F3\u306E\u524A\u9664", () => commitOrThrow(planRemoveZone(map, index))));
      },
      paintZone(index, cells, mode) {
        withMap((map) => safeRun("\u30BE\u30FC\u30F3\u3092\u5857\u308B", () => commitOrThrow(planPaintZone(map, index, cells, mode))));
      },
      /** 国の税率・国庫（未設定なら政体から補った値） */
      getFinance(stateId) {
        return withMap((map) => {
          const s = map.pack.states[stateId];
          return s ? getFinance(s) : null;
        }) ?? null;
      },
      /** patch: { salesTax?, pollTax?, treasury? }（Undo可能） */
      setFinance(stateId, patch) {
        withMap((map) => safeRun("\u8CA1\u653F\u306E\u5909\u66F4", () => commitOrThrow(planSetFinance(map, stateId, patch))));
      },
      getTechLevel(stateId) {
        return withMap((map) => getTechLevel(map, stateId)) ?? null;
      },
      setTechLevel(stateId, value) {
        withMap((map) => safeRun("\u6280\u8853\u6C34\u6E96\u306E\u5909\u66F4", () => commitOrThrow(planSetTechLevel(map, stateId, value))));
      },
      DOCTRINES,
      getDoctrine(stateId) {
        return withMap((map) => getDoctrine(map, stateId)) ?? DEFAULT_DOCTRINE;
      },
      setDoctrine(stateId, doctrineKey) {
        withMap((map) => safeRun("\u6226\u4E89\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u5909\u66F4", () => commitOrThrow(planSetDoctrine(map, stateId, doctrineKey))));
      },
      /** ブラシの半径(ワールド座標)内にあるセルIDを返す */
      cellsWithin(x, y, radius) {
        return withMap((map) => cellIndexOf(map).findWithin(x, y, radius)) ?? [];
      },
      /** (x, y) に最も近いセルID。地図が無ければ -1 */
      findCell(x, y) {
        return withMap((map) => cellIndexOf(map).find(x, y)) ?? -1;
      }
    };
  }

  // js/ui/edit-toolbar.js
  var TARGET_LIST = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
  var isLive24 = (e) => !!e && typeof e === "object" && !e.removed;
  var NEW_VALUE = "__new__";
  function initEditToolbar({ store, editMode, editActions }) {
    const buttons = [...document.querySelectorAll("#edit-panel [data-tool]")];
    const targetGroup = byId("tool-target-group");
    const targetSel = byId("tool-target");
    const radiusGroup = byId("tool-radius-group");
    const radiusInput = byId("tool-radius");
    const hint = byId("tool-hint");
    const HINTS = {
      [TOOLS.SELECT]: "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u4E2D\u8EAB\u3092\u898B\u308B\u30FB\u7DE8\u96C6\u3059\u308B",
      [TOOLS.PAINT_STATE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u56FD\u5BB6\u3092\u5857\u308B\uFF08\u4E0B\u306E\u300C\u5BFE\u8C61\u300D\u3067\u5857\u308B\u56FD\u5BB6\u3092\u9078\u3076\u3002\u4E00\u89A7\u306E\u300C\uFF0B \u65B0\u3057\u3044\u56FD\u5BB6\u3092\u4F5C\u308B\u300D\u3067\u65B0\u898F\u4F5C\u6210\u3082\u3067\u304D\u308B\uFF09",
      [TOOLS.PAINT_CULTURE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u6587\u5316\u3092\u5857\u308B\uFF08\u300C\uFF0B \u65B0\u3057\u3044\u6587\u5316\u3092\u4F5C\u308B\u300D\u3067\u65B0\u898F\u4F5C\u6210\u3082\u3067\u304D\u308B\uFF09",
      [TOOLS.PAINT_RELIGION]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5B97\u6559\u3092\u5857\u308B\uFF08\u300C\uFF0B \u65B0\u3057\u3044\u5B97\u6559\u3092\u4F5C\u308B\u300D\u3067\u65B0\u898F\u4F5C\u6210\u3082\u3067\u304D\u308B\uFF09",
      [TOOLS.PAINT_PROVINCE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5C5E\u5DDE\u3092\u5857\u308B\uFF08\u65B0\u3057\u3044\u5C5E\u5DDE\u306F\u3001\u56FD\u5BB6\u30BF\u30D6\u306E\u300C\u5C5E\u5DDE\u300D\u304B\u3089\u4F5C\u308C\u307E\u3059\u3002\u5C5E\u5DDE\u306F\u305D\u306E\u56FD\u5BB6\u306E\u571F\u5730\u306B\u3057\u304B\u5857\u308C\u307E\u305B\u3093\uFF09",
      [TOOLS.PAINT_BIOME]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5730\u5F62\u3092\u5857\u308B\uFF08\u6C34\u57DF\u306F\u5857\u308C\u307E\u305B\u3093\uFF09",
      [TOOLS.ADD_BURG]: "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u90FD\u5E02\u3092\u7F6E\u304F",
      [TOOLS.ADD_MARKER]: "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u30DE\u30FC\u30AB\u30FC\u3092\u7F6E\u304F"
    };
    const CAN_CREATE_HERE = /* @__PURE__ */ new Set(["state", "culture", "religion"]);
    function fillTargets(tool) {
      const map = store.getState().map;
      targetSel.replaceChildren();
      const kind = tool.startsWith("paint:") ? tool.slice(6) : null;
      if (!map || !kind || kind !== "biome" && !PAINT_KINDS[kind]) {
        targetGroup.hidden = true;
        return;
      }
      targetGroup.hidden = false;
      if (kind === "biome") {
        for (const b of map.biomesData) {
          if (!b || b.i === 0) continue;
          const o = document.createElement("option");
          o.value = b.i;
          o.textContent = b.name;
          targetSel.append(o);
        }
        return;
      }
      const erase = document.createElement("option");
      erase.value = "0";
      erase.textContent = `\uFF08${PAINT_KINDS[kind].label}\u306A\u3057\u306B\u3059\u308B\uFF09`;
      targetSel.append(erase);
      const list = map.pack[TARGET_LIST[kind]].filter(isLive24);
      for (const e of list) {
        const o = document.createElement("option");
        o.value = e.i;
        o.textContent = e.fullName ?? e.name;
        targetSel.append(o);
      }
      if (CAN_CREATE_HERE.has(kind)) {
        const newOpt = document.createElement("option");
        newOpt.value = NEW_VALUE;
        newOpt.textContent = `\uFF0B \u65B0\u3057\u3044${PAINT_KINDS[kind].label}\u3092\u4F5C\u308B\u2026`;
        targetSel.append(newOpt);
      }
      if (list[0]) targetSel.value = String(list[0].i);
    }
    async function createNewTarget(kind) {
      const label = PAINT_KINDS[kind].label;
      const name = await promptDialog(`\u65B0\u3057\u3044${label}\u306E\u540D\u524D`, "", {
        suggest: () => editActions.suggestName(kind),
        hint: "\u7A7A\u6B04\u306E\u307E\u307E OK \u3092\u62BC\u3059\u3068\u3001\u4EEE\u306E\u540D\u524D\u304C\u81EA\u52D5\u3067\u4ED8\u304D\u307E\u3059\uFF08\u3042\u3068\u304B\u3089\u5909\u66F4\u30FB\u78BA\u5B9A\u3067\u304D\u307E\u3059\uFF09"
      });
      if (name == null) return null;
      return editActions.addEntity(kind, name);
    }
    function sync() {
      const tool = editMode.tool;
      const hasMap = !!store.getState().map;
      for (const b of buttons) {
        b.classList.toggle("active", b.dataset.tool === tool);
        b.disabled = !hasMap;
      }
      hint.textContent = hasMap ? HINTS[tool] ?? "" : "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044";
      radiusGroup.hidden = !tool.startsWith("paint:");
    }
    for (const b of buttons) {
      b.addEventListener("click", () => {
        const map = store.getState().map;
        if (!map) return;
        editMode.setTool(b.dataset.tool);
        fillTargets(b.dataset.tool);
        sync();
      });
    }
    targetSel.addEventListener("change", async () => {
      if (targetSel.value !== NEW_VALUE) {
        editMode.setTarget(Number(targetSel.value));
        return;
      }
      const kind = editMode.tool.startsWith("paint:") ? editMode.tool.slice(6) : null;
      if (!kind || !CAN_CREATE_HERE.has(kind)) return;
      const newId = await createNewTarget(kind);
      fillTargets(editMode.tool);
      if (newId != null) {
        targetSel.value = String(newId);
        editMode.setTarget(newId);
      } else if (targetSel.options.length) {
        targetSel.selectedIndex = 0;
        editMode.setTarget(Number(targetSel.value));
      }
    });
    radiusInput.addEventListener("input", () => editMode.setRadius(Number(radiusInput.value)));
    store.subscribe((state, change) => {
      if (change.type === "replace") {
        fillTargets(editMode.tool);
        sync();
      }
    });
    sync();
    return {
      fillTargets,
      sync,
      /** 外部（属州タブの「塗り直す」ボタン等）からツールと対象をまとめて合わせる */
      setTargetValue(id) {
        targetSel.value = String(id);
        editMode.setTarget(id);
      }
    };
  }

  // js/ui/edit-panel.js
  function initEditPanel() {
    const panel2 = byId("edit-panel");
    const openBtn = byId("btn-edit-mode");
    function isOpen() {
      return !panel2.hidden;
    }
    function open() {
      panel2.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
    }
    function close() {
      panel2.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
    }
    function toggle() {
      if (isOpen()) close();
      else open();
    }
    openBtn.addEventListener("click", toggle);
    byId("edit-panel-close").addEventListener("click", close);
    return { open, close, toggle, get isOpen() {
      return isOpen();
    } };
  }

  // js/core/edit/territory.js
  var TERRITORY_SIZES = Object.freeze({
    s: { label: "\u5C0F", ratio: 0.04 },
    m: { label: "\u4E2D", ratio: 0.1 },
    l: { label: "\u5927", ratio: 0.2 }
  });
  var MIN_CELLS = 6;
  var isLand = (map, i) => map.pack.cells.biome[i] !== 0;
  var KINDS = ["state", "culture", "religion"];
  function countFreeLand(map, kind = "state") {
    const owner = map.pack.cells[kind], { biome } = map.pack.cells;
    let n = 0;
    for (let i = 0; i < owner.length; i++) if (biome[i] !== 0 && owner[i] === 0) n++;
    return n;
  }
  function pickAutoTerritory(map, { kind = "state", size = "m", rnd, seedCell = -1, ownCells = null }) {
    if (!KINDS.includes(kind)) throw new Error(`\u304A\u307E\u304B\u305B\u9818\u571F\u306B\u672A\u5BFE\u5FDC\u306E\u7A2E\u985E\u3067\u3059: ${kind}`);
    const owner = map.pack.cells[kind], { biome } = map.pack.cells;
    const { cells: geom, p } = map.geometry.pack;
    const n = owner.length;
    const free = (i) => biome[i] !== 0 && owner[i] === 0;
    let freeCount = 0, landCount = 0;
    for (let i = 0; i < n; i++) {
      if (biome[i] !== 0) landCount++;
      if (free(i)) freeCount++;
    }
    if (!freeCount) return { cells: [], seed: -1, reason: "no-free-land" };
    const ratio = (TERRITORY_SIZES[size] ?? TERRITORY_SIZES.m).ratio;
    const want = Math.max(MIN_CELLS, Math.round(landCount * ratio));
    let seed = seedCell >= 0 && free(seedCell) ? seedCell : -1;
    let want_override = 0;
    if (seed < 0 && !(Array.isArray(ownCells) && ownCells.length)) {
      const comp = new Int32Array(n).fill(-1);
      const sizes = [];
      for (let i = 0; i < n; i++) {
        if (!free(i) || comp[i] >= 0) continue;
        const id = sizes.length;
        let count = 0;
        const stack = [i];
        comp[i] = id;
        while (stack.length) {
          const k = stack.pop();
          count++;
          for (const j of geom.c[k]) if (free(j) && comp[j] < 0) {
            comp[j] = id;
            stack.push(j);
          }
        }
        sizes.push(count);
      }
      const biggest = Math.max(...sizes);
      const threshold = Math.min(want, biggest);
      const candidates = [];
      for (let i = 0; i < n; i++) if (free(i) && sizes[comp[i]] >= threshold) candidates.push(i);
      let bestScore = -1;
      for (let t = 0; t < 8; t++) {
        const cand = candidates[Math.floor(rnd.next() * candidates.length)];
        const score = geom.c[cand].filter(free).length;
        if (score > bestScore) {
          bestScore = score;
          seed = cand;
        }
      }
    }
    const H = map.geometry.pack.h;
    const stepCost = (j) => 1 + (H ? Math.max(0, H[j] - 45) / 25 : 0);
    const expanding = Array.isArray(ownCells) && ownCells.length > 0;
    const inSet = new Uint8Array(n);
    const cells = [];
    const dist = /* @__PURE__ */ new Map();
    const frontier = /* @__PURE__ */ new Set();
    const offer = (from, fromDist) => {
      for (const j of geom.c[from]) {
        if (!free(j) || inSet[j]) continue;
        const d = fromDist + stepCost(j);
        if (!dist.has(j) || d < dist.get(j)) dist.set(j, d);
        frontier.add(j);
      }
    };
    if (expanding) {
      const mine = new Uint8Array(n);
      for (const i of ownCells) mine[i] = 1;
      for (const i of ownCells) offer(i, 0);
      if (!frontier.size) return { cells: [], seed: -1, reason: "no-adjacent-free-land" };
      seed = ownCells[0];
      const grow = Math.max(MIN_CELLS, Math.round(Math.max(ownCells.length * ratio * 2, landCount * ratio * 0.5)));
      want_override = grow;
    } else {
      inSet[seed] = 1;
      cells.push(seed);
      dist.set(seed, 0);
      offer(seed, 0);
    }
    const target = expanding ? want_override : want;
    const near = (j) => {
      let c = 0;
      for (const k of geom.c[j]) if (inSet[k] || expanding && ownMask(k)) c++;
      return c;
    };
    const ownSet = expanding ? new Set(ownCells) : null;
    const ownMask = (k) => ownSet.has(k);
    while (cells.length < target && frontier.size) {
      let best = -1, bestKey = Infinity;
      for (const j of frontier) {
        const compact = 1 - 0.07 * Math.min(4, Math.max(0, near(j) - 1));
        const key = (dist.get(j) ?? 1) * (0.85 + 0.3 * rnd.next()) * compact;
        if (key < bestKey) {
          bestKey = key;
          best = j;
        }
      }
      frontier.delete(best);
      if (inSet[best]) continue;
      inSet[best] = 1;
      cells.push(best);
      offer(best, dist.get(best) ?? 0);
    }
    return { cells, seed };
  }
  function pickCapitalCell(map, stateId) {
    const { state, burg } = map.pack.cells;
    const { p } = map.geometry.pack;
    const members = [];
    let sx = 0, sy = 0;
    for (let i = 0; i < state.length; i++) {
      if (state[i] === stateId && isLand(map, i)) {
        members.push(i);
        sx += p[i][0];
        sy += p[i][1];
      }
    }
    if (!members.length) return -1;
    const cx = sx / members.length, cy = sy / members.length;
    let best = -1, bestD = Infinity;
    for (const i of members) {
      if (burg[i]) continue;
      const d = Math.hypot(p[i][0] - cx, p[i][1] - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // js/app/builder-actions.js
  var KIND_LABEL3 = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559" };
  var BUILDABLE = Object.freeze(["state", "religion", "culture"]);
  function createBuilderActions({ store, editActions, editMode, actions }) {
    const rnd = createRandom((Date.now() ^ 1540483477) >>> 0);
    const withMap = (fn) => {
      const m = store.getState().map;
      return m ? fn(m) : void 0;
    };
    let savedFills = null;
    function showOverlay(kind) {
      if (savedFills == null) savedFills = actions.getFills();
      actions.setOverlay(kind);
    }
    function restoreOverlay() {
      if (savedFills != null) actions.restoreFills(savedFills);
      savedFills = null;
    }
    function beginPaint(kind, id) {
      showOverlay(kind);
      const tool = `paint:${kind}`;
      editMode.setTool(tool);
      editMode.setTarget(id);
      window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool, target: id } }));
    }
    function endPaint() {
      restoreOverlay();
      editMode.setTool("select");
      window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "select" } }));
    }
    return {
      KIND_LABEL: KIND_LABEL3,
      BUILDABLE,
      TERRITORY_SIZES,
      beginPaint,
      endPaint,
      /** 仮の名前で新規作成する。style を渡すと名前の雰囲気を指定できる（省略=おまかせ） */
      create(kind, { style } = {}) {
        const name = editActions.suggestName(kind, style ? { style } : {});
        const id = editActions.addEntity(kind, name);
        return id ?? null;
      },
      /** 名前を引き直す（仮の名前になる。Undo で戻せる） */
      rerollName(kind, id, { style } = {}) {
        const v = editActions.suggestName(kind, style ? { style, id } : { id });
        if (v) editActions.renameEntity(kind, id, v);
        return v;
      },
      /** 空き地があるか（おまかせ領土が使えるかの判定用） */
      freeLand(kind) {
        return withMap((m) => countFreeLand(m, kind)) ?? 0;
      },
      /** 空き地から領土を自動で決めて塗る。{ok, count, reason} */
      autoClaim(kind, id, size = "m") {
        return withMap((map) => {
          const arr = map.pack.cells[kind], own = [];
          if (id) {
            for (let i = 0; i < arr.length; i++) if (arr[i] === id) own.push(i);
          }
          const r = pickAutoTerritory(map, { kind, size, rnd, ownCells: own });
          if (!r.cells.length) return { ok: false, count: 0, reason: r.reason ?? "no-free-land" };
          editActions.paintCells(kind, id, r.cells);
          return { ok: true, count: r.cells.length, reason: null };
        }) ?? { ok: false, count: 0, reason: "no-map" };
      },
      /** 首都がまだ無い国家に、領土の中央付近へ仮の名前で首都を置く。置けたら都市ID */
      autoCapital(stateId) {
        return withMap((map) => {
          const s = map.pack.states[stateId];
          if (!s || s.removed || !s.i) return null;
          const hasCapital = s.capital && map.pack.burgs[s.capital] && !map.pack.burgs[s.capital].removed;
          if (hasCapital) return null;
          const cell = pickCapitalCell(map, stateId);
          if (cell < 0) return null;
          return editActions.addBurg(cell, "", { capital: true }) ?? null;
        }) ?? null;
      },
      /** 世界の取引と、国ごとの収支（その時点の地図から毎回計算する） */
      economy() {
        return withMap((map) => {
          const trade = computeTrade(map);
          return { trade, revenue: (id) => annualRevenue(trade.states.get(id)), partners: (id) => tradePartners(trade, id), goods: GOODS };
        }) ?? null;
      },
      /** 貿易の線を地図に出す（stateId=null で消す）。国の中心どうしを結ぶ */
      showTradeLines(stateId, eco = null) {
        const map = store.getState().map;
        if (!map || stateId == null) {
          actions.setView({ tradeLines: null });
          return 0;
        }
        const { partners } = eco ?? this.economy();
        const pos = (id) => map.pack.states[id]?.pole ?? null;
        const from = pos(stateId);
        const lines = [];
        if (from) for (const p of partners(stateId)) {
          const to = pos(p.partner);
          if (!to) continue;
          const total = p.exportValue + p.importValue;
          lines.push({ x0: from[0], y0: from[1], x1: to[0], y1: to[1], w: Math.min(8, 1.5 + Math.sqrt(total) * 0.35), kind: p.exportValue >= p.importValue ? "export" : "import" });
        }
        actions.setView({ tradeLines: lines.length ? lines : null });
        return lines.length;
      },
      /** 仮の名前の一覧 */
      provisional() {
        return withMap((m) => listProvisional(m)) ?? [];
      },
      /** 仮の名前をすべて確定する（Undo は1回で戻る） */
      confirmAll() {
        const list = withMap((m) => listProvisional(m)) ?? [];
        if (!list.length) return 0;
        store.beginBatch("\u4EEE\u306E\u540D\u524D\u3092\u3059\u3079\u3066\u78BA\u5B9A");
        try {
          for (const { kind, id } of list) editActions.confirmName(kind, id);
        } finally {
          store.endBatch();
        }
        return list.length;
      }
    };
  }

  // js/ui/kit.js
  function el7(tag, cls, text2) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  }
  function btn(cls, text2, title, onClick) {
    const b = el7("button", cls, text2);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }
  function swatch(color, tall = true) {
    const s = el7("span", "b-swatch");
    s.style.background = color ?? "#888";
    if (!tall) s.style.height = "14px";
    return s;
  }
  function slider({ label, min, max, step, value, format, onCommit }) {
    const wrap = el7("label", "b-field");
    const val = el7("span", "b-mini", `${label} ${format(value)}`);
    const r = document.createElement("input");
    r.type = "range";
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.value = String(value);
    r.addEventListener("input", () => {
      val.textContent = `${label} ${format(Number(r.value))}`;
    });
    r.addEventListener("change", () => onCommit(Number(r.value)));
    wrap.append(val, r);
    return wrap;
  }
  var isLive25 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

  // js/ui/profile-fields.js
  var LIST_KEY4 = { state: "states", culture: "cultures", religion: "religions" };
  var live2 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function selectField(label, options, value, onChange, hint) {
    const f = el7("label", "b-field");
    f.append(el7("span", "b-mini", label));
    const sel = document.createElement("select");
    for (const o of options) sel.append(new Option(o.label, String(o.id)));
    if (!options.some((o) => String(o.id) === String(value))) sel.append(new Option(String(value ?? "\uFF08\u672A\u8A2D\u5B9A\uFF09"), String(value ?? "")));
    sel.value = String(value ?? "");
    sel.addEventListener("change", () => onChange(sel.value));
    f.append(sel);
    if (hint) f.title = hint;
    return f;
  }
  function textField(label, value, onChange) {
    const f = el7("label", "b-field");
    f.append(el7("span", "b-mini", label));
    const inp = document.createElement("input");
    inp.value = value ?? "";
    inp.addEventListener("change", () => {
      if (inp.value.trim()) onChange(inp.value);
    });
    f.append(inp);
    return f;
  }
  function appendEntityProfile(d, kind, e, { editActions, map, openEntity }) {
    if (kind === "state") {
      d.append(
        selectField("\u653F\u4F53", STATE_FORMS, e.form, (v) => editActions.setEntityProfile("state", e.i, { form: v }), "\u653F\u4F53\u3092\u5909\u3048\u308B\u3068\u3001\u56FD\u306E\u57FA\u6E96\u306E\u7A0E\u7387\u306E\u76EE\u5B89\u3082\u5909\u308F\u308A\u307E\u3059\uFF08\u7A0E\u7387\u305D\u306E\u3082\u306E\u306F\u7D4C\u6E08\u30BF\u30D6\u3067\u8ABF\u6574\uFF09"),
        textField("\u653F\u4F53\u540D\uFF08\u56FD\u540D\u306B\u3064\u304F\u8A9E\uFF09", e.formName, (v) => editActions.setEntityProfile("state", e.i, { formName: v })),
        selectField("\u56FD\u306E\u7A2E\u985E", CULTURE_TYPES, e.type, (v) => editActions.setEntityProfile("state", e.i, { type: v }))
      );
      return;
    }
    d.append(selectField(kind === "religion" ? "\u5B97\u6559\u306E\u7A2E\u985E" : "\u6587\u5316\u306E\u7A2E\u985E", kind === "religion" ? RELIGION_TYPES : CULTURE_TYPES, e.type, (v) => editActions.setEntityProfile(kind, e.i, { type: v })));
    if (kind === "religion") d.append(textField("\u795E\u30FB\u4FE1\u4EF0\u306E\u5BFE\u8C61", e.deity, (v) => editActions.setEntityProfile("religion", e.i, { deity: v })));
    const banned = /* @__PURE__ */ new Set([e.i, ...editActions.descendantsOf(kind, e.i)]);
    const opts = [{ id: 0, label: kind === "religion" ? "\u306A\u3057\uFF08\u5171\u901A\u306E\u7956\u30FB\u539F\u59CB\u4FE1\u4EF0\uFF09" : "\u306A\u3057\uFF08\u5171\u901A\u306E\u7956\uFF09" }];
    for (const x of map.pack[LIST_KEY4[kind]]) if (live2(x) && !banned.has(x.i)) opts.push({ id: x.i, label: x.name });
    d.append(selectField("\u8D77\u6E90\uFF08\u3069\u3053\u304B\u3089\u5206\u304B\u308C\u305F\u304B\uFF09", opts, editActions.originOf(kind, e.i), (v) => editActions.setOrigin(kind, e.i, Number(v))));
    const kids = editActions.descendantsOf(kind, e.i).map((i) => map.pack[LIST_KEY4[kind]][i]).filter(live2);
    if (kids.length) {
      const row = el7("div", "b-kids");
      row.append(el7("span", "b-mini", "\u3053\u3053\u304B\u3089\u5206\u304B\u308C\u305F"));
      for (const k of kids.slice(0, 8)) row.append(btn("b-chip", k.name, "\u3053\u306E\u9805\u76EE\u3092\u958B\u304F", () => openEntity?.(kind, k.i)));
      if (kids.length > 8) row.append(el7("span", "b-mini", `\u307B\u304B${kids.length - 8}`));
      d.append(row);
    }
  }
  function burgDetails(b, { editActions, map }) {
    const d = el7("div", "b-details");
    const pop = el7("label", "b-field");
    pop.append(el7("span", "b-mini", "\u4EBA\u53E3\uFF08\u5343\u4EBA\u3002\u56FD\u306E\u90FD\u5E02\u4EBA\u53E3\u306B\u3082\u53CD\u6620\uFF09"));
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "0.1";
    inp.value = String(Math.round((b.population ?? 0) * 100) / 100);
    inp.addEventListener("change", () => editActions.setBurgProfile(b.i, { population: inp.value }));
    pop.append(inp);
    d.append(pop);
    d.append(selectField("\u533A\u5206", BURG_GROUPS, b.group, (v) => editActions.setBurgProfile(b.i, { group: v }), b.capital ? "\u9996\u90FD\u306E\u533A\u5206\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093" : ""));
    d.querySelector("select:last-of-type")?.toggleAttribute("disabled", !!b.capital);
    d.append(selectField("\u7A2E\u985E", CULTURE_TYPES, b.type ?? "Generic", (v) => editActions.setBurgProfile(b.i, { type: v })));
    const feats = el7("div", "b-feats");
    feats.append(el7("span", "b-mini", "\u8A2D\u5099"));
    for (const f of BURG_FEATURES) {
      const lab = el7("label", "b-feat");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!b[f.id];
      cb.addEventListener("change", () => editActions.setBurgProfile(b.i, { [f.id]: cb.checked }));
      lab.append(cb, el7("span", "", `${f.icon} ${f.label}`));
      feats.append(lab);
    }
    d.append(feats);
    if (b.port) d.append(el7("p", "b-hint", "\u2693 \u6E2F\u304C\u3042\u308A\u307E\u3059\uFF08\u6E2F\u306E\u6709\u7121\u306F\u3001\u3053\u3053\u3067\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\uFF09"));
    const foot = el7("div", "b-actions");
    const st = map.pack.states[b.state];
    if (!b.capital && st && st.i) foot.append(btn("", "\u9996\u90FD\u306B\u3059\u308B", `${st.name}\u306E\u9996\u90FD\u3092\u3053\u306E\u90FD\u5E02\u306B\u3059\u308B`, () => editActions.setCapital(b.state, b.i)));
    d.append(foot);
    return d;
  }
  var featureIcons = (b) => BURG_FEATURES.filter((f) => b[f.id]).map((f) => f.icon).join("") + (b.port ? "\u2693" : "");

  // js/ui/history-builder.js
  var LIST_KEY5 = { state: "states", culture: "cultures", religion: "religions" };
  var ICON = { state: "\u{1F3F3}", religion: "\u2628", culture: "\u2616" };
  var isLive26 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function el8(tag, cls, text2) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  }
  function btn2(cls, text2, title, onClick) {
    const b = el8("button", cls, text2);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }
  function initHistoryBuilder({ store, viewport, renderer, editActions, builderActions, editMode, panels, views = {} }) {
    const panel2 = byId("builder-panel");
    const fab = byId("btn-builder");
    const body = byId("builder-body");
    const editFab = byId("btn-edit-mode");
    let task = null;
    let tab = "state";
    let nameStyle = "";
    const openCards = /* @__PURE__ */ new Set();
    let scheduled = false;
    let mode = "build";
    let cellCounts = /* @__PURE__ */ new Map();
    const getMap = () => store.getState().map;
    const ent = (kind, id) => getMap()?.pack[LIST_KEY5[kind]]?.[id];
    const nameOf2 = (e) => e.fullName ?? e.name;
    const styleOpt = () => nameStyle ? { style: nameStyle } : {};
    const MODES = [["build", "\u3064\u304F\u308B"], ["economy", "\u7D4C\u6E08\u30FB\u4EA4\u6613"], ["travel", "\u65C5\u30FB\u30BE\u30FC\u30F3"]];
    function setMode(next) {
      if (next === mode) return;
      views[mode]?.leave?.();
      if (mode === "build" && task) finishTask();
      mode = next;
      render();
    }
    function modeTabs() {
      const bar = el8("div", "b-modes");
      for (const [key, label] of MODES) {
        if (key !== "build" && !views[key]) continue;
        bar.append(btn2(`b-mode${mode === key ? " on" : ""}`, label, "", () => setMode(key)));
      }
      return bar;
    }
    function isOpen() {
      return !panel2.hidden;
    }
    function refitIfWasFit(wasFit) {
      if (!wasFit) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        renderer.resize();
        viewport.fit();
        renderer.requestRender();
      }));
    }
    const isFit = () => Math.abs(viewport.k - viewport.fitK) < 1e-6;
    function open() {
      if (editFab.getAttribute("aria-expanded") === "true") editFab.click();
      const wasFit = isFit();
      panel2.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      render();
      refitIfWasFit(wasFit);
    }
    function close() {
      views[mode]?.leave?.();
      mode = "build";
      const wasFit = isFit();
      panel2.hidden = true;
      fab.setAttribute("aria-expanded", "false");
      refitIfWasFit(wasFit);
    }
    fab.addEventListener("click", () => isOpen() ? close() : open());
    byId("builder-close").addEventListener("click", close);
    editFab.addEventListener("click", () => {
      if (isOpen() && editFab.getAttribute("aria-expanded") !== "true") close();
    }, true);
    function swatch2(e) {
      const s = el8("span", "b-swatch");
      s.style.background = e.color ?? "#888";
      return s;
    }
    function provBadge() {
      return null;
    }
    function startPaint(kind, id) {
      task = { kind, id, size: task?.size ?? "m", autoCapital: task?.autoCapital ?? true, status: "\u5730\u56F3\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u3001\u9818\u571F\u3092\u5857\u3063\u3066\u304F\u3060\u3055\u3044" };
      builderActions.beginPaint(kind, id);
      render();
    }
    function runAuto(kind, id, size) {
      const r = builderActions.autoClaim(kind, id, size);
      if (!task || task.id !== id) task = { kind, id, size, autoCapital: true, status: "" };
      task.size = size;
      task.mode = r.ok ? "auto" : "drag";
      if (r.ok) task.status = `\u304A\u307E\u304B\u305B\u3067 ${r.count} \u30BB\u30EB\u3092\u9818\u571F\u306B\u3057\u307E\u3057\u305F\uFF08Ctrl+Z \u3067\u53D6\u308A\u6D88\u3057\uFF09`;
      else if (r.reason === "no-adjacent-free-land") task.status = "\u96A3\u308A\u5408\u3046\u7A7A\u304D\u5730\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u5730\u56F3\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5857\u308A\u8DB3\u3057\u3066\u304F\u3060\u3055\u3044";
      else if (r.reason === "no-free-land") task.status = "\u7A7A\u304D\u5730\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u5730\u56F3\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5857\u3063\u3066\u304F\u3060\u3055\u3044";
      else task.status = "\u9818\u571F\u3092\u6C7A\u3081\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F";
      if (!r.ok) builderActions.beginPaint(kind, id);
      render();
    }
    function finishTask() {
      if (!task) return;
      const { kind, id, autoCapital } = task;
      if (kind === "state" && autoCapital) builderActions.autoCapital(id);
      builderActions.endPaint();
      task = null;
      render();
    }
    function cancelFresh() {
      store.undo();
      builderActions.endPaint();
      task = null;
      render();
    }
    function quickSection() {
      const sec = el8("section", "b-sec");
      sec.append(el8("h4", "b-title", "\u304B\u3093\u305F\u3093\u4F5C\u6210"));
      const grid = el8("div", "b-quick");
      const defs = [
        ["state", "\u56FD\u3092\u5EFA\u3066\u308B", "\u4EEE\u306E\u540D\u524D\u3067\u56FD\u3092\u4F5C\u308A\u3001\u9818\u571F\u3092\u6C7A\u3081\u308B"],
        ["religion", "\u5B97\u6559\u3092\u8208\u3059", "\u4EEE\u306E\u540D\u524D\u3067\u5B97\u6559\u3092\u4F5C\u308A\u3001\u4FE1\u8005\u306E\u571F\u5730\u3092\u6C7A\u3081\u308B"],
        ["culture", "\u6587\u5316\u3092\u52A0\u3048\u308B", "\u4EEE\u306E\u540D\u524D\u3067\u6587\u5316\u3092\u4F5C\u308A\u3001\u305D\u306E\u571F\u5730\u3092\u6C7A\u3081\u308B"]
      ];
      for (const [kind, label, tip] of defs) {
        const b = el8("button", "b-quick-btn");
        b.type = "button";
        b.title = tip;
        b.append(el8("span", "b-quick-icon", ICON[kind]), el8("span", "b-quick-label", label));
        b.addEventListener("click", () => {
          const id = builderActions.create(kind, styleOpt());
          if (id == null) return;
          tab = kind;
          startPaint(kind, id);
        });
        grid.append(b);
      }
      sec.append(grid);
      const more = el8("details", "b-more");
      if (nameStyle) more.open = true;
      more.append(el8("summary", "", nameStyle ? `\u540D\u524D\u306E\u96F0\u56F2\u6C17\uFF1A${NAME_STYLES[nameStyle].label}` : "\u540D\u524D\u306E\u96F0\u56F2\u6C17\u3092\u6307\u5B9A\u3059\u308B\uFF08\u4EFB\u610F\uFF09"));
      const sel = document.createElement("select");
      sel.append(new Option("\u304A\u307E\u304B\u305B\uFF08\u6BCE\u56DE\u3070\u3089\u3070\u3089\uFF09", ""));
      for (const k of STYLE_KEYS) sel.append(new Option(NAME_STYLES[k].label, k));
      sel.value = nameStyle;
      sel.addEventListener("change", () => {
        nameStyle = sel.value;
        render();
      });
      more.append(sel, el8("p", "b-hint", "\u6307\u5B9A\u3059\u308B\u3068\u3001\u3053\u308C\u304B\u3089\u4F5C\u308B\u540D\u524D\u3068\u{1F3B2}\u304C\u305D\u306E\u96F0\u56F2\u6C17\u306B\u306A\u308A\u307E\u3059\u3002"));
      sec.append(more);
      return sec;
    }
    function taskSection() {
      if (!task) return null;
      const e = ent(task.kind, task.id);
      if (!isLive26(e)) {
        task = null;
        return null;
      }
      const label = builderActions.KIND_LABEL[task.kind];
      const sec = el8("section", "b-task");
      const head = el8("div", "b-task-head");
      head.append(swatch2(e), el8("span", "b-task-kind", `${label}\u3092\u4F5C\u6210\u4E2D`));
      sec.append(head);
      const nameRow = el8("div", "b-namerow");
      const input = document.createElement("input");
      input.value = nameOf2(e);
      input.setAttribute("aria-label", `${label}\u306E\u540D\u524D`);
      input.addEventListener("change", () => {
        if (input.value.trim()) editActions.renameEntity(task.kind, task.id, input.value);
      });
      nameRow.append(input, btn2("suggest-mini", "\u{1F3B2}", "\u540D\u524D\u3092\u5F15\u304D\u76F4\u3059", () => {
        builderActions.rerollName(task.kind, task.id, styleOpt());
      }));
      const badge = provBadge(task.kind, task.id);
      if (badge) nameRow.append(badge);
      sec.append(nameRow);
      sec.append(el8("p", "b-status", task.status));
      const free = builderActions.freeLand(task.kind);
      const how = el8("div", "b-how");
      const drag = btn2(`b-seg${task.mode === "auto" ? "" : " active"}`, "\u270B \u30C9\u30E9\u30C3\u30B0\u3067\u5857\u308B", "\u5730\u56F3\u3092\u306A\u305E\u3063\u3066\u9818\u571F\u3092\u6C7A\u3081\u308B", () => {
        task.mode = "drag";
        task.status = "\u5730\u56F3\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u3001\u9818\u571F\u3092\u5857\u3063\u3066\u304F\u3060\u3055\u3044";
        builderActions.beginPaint(task.kind, task.id);
        render();
      });
      const auto = btn2(`b-seg${task.mode === "auto" ? " active" : ""}`, "\u{1F3B2} \u304A\u307E\u304B\u305B\u3067\u6C7A\u3081\u308B", free ? `\u7A7A\u304D\u5730\uFF08${free}\u30BB\u30EB\uFF09\u304B\u3089\u81EA\u52D5\u3067\u6C7A\u3081\u308B` : "\u7A7A\u304D\u5730\u304C\u3042\u308A\u307E\u305B\u3093", () => runAuto(task.kind, task.id, task.size));
      auto.disabled = !free;
      how.append(drag, auto);
      sec.append(how);
      const sizeRow = el8("div", "b-sizes");
      sizeRow.append(el8("span", "b-mini", "\u304A\u307E\u304B\u305B\u306E\u5927\u304D\u3055"));
      for (const [k, v] of Object.entries(builderActions.TERRITORY_SIZES)) {
        sizeRow.append(btn2(`b-chip${task.size === k ? " on" : ""}`, v.label, "", () => {
          task.size = k;
          render();
        }));
      }
      sec.append(sizeRow);
      const brush = el8("label", "b-brush");
      brush.append(el8("span", "b-mini", "\u30D6\u30E9\u30B7"));
      const rng = document.createElement("input");
      rng.type = "range";
      rng.min = "10";
      rng.max = "200";
      rng.value = String(store.getState().brushRadius ?? 40);
      rng.addEventListener("input", () => editMode.setRadius(Number(rng.value)));
      brush.append(rng);
      sec.append(brush);
      if (task.kind === "state") {
        const lab = el8("label", "b-check");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = task.autoCapital;
        cb.addEventListener("change", () => {
          task.autoCapital = cb.checked;
        });
        lab.append(cb, el8("span", "", "\u5B8C\u4E86\u3057\u305F\u3089\u9996\u90FD\u3092\u81EA\u52D5\u3067\u7F6E\u304F\uFF08\u4EEE\u306E\u540D\u524D\uFF09"));
        sec.append(lab);
      }
      const actions = el8("div", "b-actions");
      const fresh = e.cells === 0 && store.peekUndoLabel() === `${label}\u3092\u65B0\u898F\u4F5C\u6210`;
      if (fresh) actions.append(btn2("", "\u3084\u3081\u308B", "\u4F5C\u6210\u3092\u53D6\u308A\u6D88\u3059", cancelFresh));
      actions.append(btn2("primary", "\u5B8C\u4E86", "\u3053\u306E\u5185\u5BB9\u3067\u78BA\u5B9A\u3057\u3066\u3001\u30C4\u30FC\u30EB\u3092\u7D42\u3048\u308B", finishTask));
      sec.append(actions);
      return sec;
    }
    function listSection() {
      const map = getMap();
      const sec = el8("section", "b-sec");
      sec.append(el8("h4", "b-title", "\u3064\u304F\u3063\u305F\u6B74\u53F2"));
      const kindSel = document.createElement("select");
      kindSel.className = "b-kind-select";
      for (const k of ["state", "religion", "culture"]) {
        const n = map.pack[LIST_KEY5[k]].filter(isLive26).length;
        const o = document.createElement("option");
        o.value = k;
        o.textContent = `${builderActions.KIND_LABEL[k]}\uFF08${n}\uFF09`;
        kindSel.append(o);
      }
      const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed);
      {
        const o = document.createElement("option");
        o.value = "burg";
        o.textContent = `\u90FD\u5E02\uFF08${burgs.length}\uFF09`;
        kindSel.append(o);
      }
      kindSel.value = tab;
      kindSel.addEventListener("change", () => {
        tab = kindSel.value;
        render();
      });
      sec.append(kindSel);
      if (tab === "burg") {
        const list2 = el8("div", "b-cards");
        for (const b of burgs.sort((a, c) => (c.population ?? 0) - (a.population ?? 0)).slice(0, 80)) list2.append(burgCard(b));
        if (!burgs.length) sec.append(el8("p", "b-hint", "\u307E\u3060\u90FD\u5E02\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u5730\u56F3\u7DE8\u96C6\u306E\u300C\u90FD\u5E02\u300D\u3067\u7F6E\u3051\u307E\u3059\u3002"));
        sec.append(list2);
        if (burgs.length > 80) sec.append(el8("p", "b-hint", `\u4EBA\u53E3\u306E\u591A\u304480\u4EF6\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\uFF08\u5168${burgs.length}\u4EF6\uFF09\u3002`));
        return sec;
      }
      cellCounts = new Map(listEntities(map, tab).map((x) => [x.id, x.cells]));
      const items = map.pack[LIST_KEY5[tab]].filter(isLive26).sort((a, b) => b.i - a.i);
      if (!items.length) sec.append(el8("p", "b-hint", "\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u4E0A\u306E\u30DC\u30BF\u30F3\u3067\u4F5C\u308C\u307E\u3059\u3002"));
      const list = el8("div", "b-cards");
      for (const e of items) list.append(card(tab, e));
      sec.append(list);
      return sec;
    }
    function burgCard(b) {
      const key = `burg:${b.i}`;
      const wrap = el8("div", "b-card");
      const row = el8("div", "b-row b-click");
      const st = getMap().pack.states[b.state];
      row.append(swatch2({ color: st?.color ?? "#888" }));
      const main = el8("div", "b-row-main");
      const nm = el8("div", "b-row-name");
      nm.append(el8("span", "", `${b.capital ? "\u{1F3F0} " : ""}${b.name}`));
      const badge = provBadge("burg", b.i);
      if (badge) nm.append(badge);
      main.append(nm, el8("div", "b-row-meta", `${st?.name ?? "\u7121\u6240\u5C5E"}\u30FB\u4EBA\u53E3 ${Math.round((b.population ?? 0) * 10) / 10}${featureIcons(b) ? "\u30FB" + featureIcons(b) : ""}`));
      const open2 = openCards.has(key);
      row.append(main, el8("span", "b-chev", open2 ? "\u25B4" : "\u25BE"));
      row.addEventListener("click", () => {
        if (open2) openCards.delete(key);
        else openCards.add(key);
        render();
      });
      wrap.append(row);
      if (open2) wrap.append(burgDetails(b, { editActions, map: getMap() }));
      return wrap;
    }
    function card(kind, e) {
      const key = `${kind}:${e.i}`;
      const wrap = el8("div", "b-card");
      const active = task && task.kind === kind && task.id === e.i;
      if (active) wrap.classList.add("active");
      const row = el8("div", "b-row");
      row.append(swatch2(e));
      const main = el8("div", "b-row-main");
      const nm = el8("div", "b-row-name");
      nm.append(el8("span", "", nameOf2(e)));
      const badge = provBadge(kind, e.i);
      if (badge) nm.append(badge);
      main.append(nm, el8("div", "b-row-meta", metaText(kind, e)));
      row.append(main);
      const ops = el8("div", "b-row-ops");
      if (badge) ops.append(btn2("suggest-mini", "\u2713", "\u3053\u306E\u540D\u524D\u3067\u78BA\u5B9A", () => editActions.confirmName(kind, e.i)));
      const isOpenCard = openCards.has(key);
      ops.append(btn2("suggest-mini b-more-btn", isOpenCard ? "\u25B4" : "\u25BE", "\u8A73\u3057\u304F\u8A2D\u5B9A", () => {
        if (openCards.has(key)) openCards.delete(key);
        else openCards.add(key);
        render();
      }));
      row.append(ops);
      wrap.append(row);
      if (isOpenCard) wrap.append(details(kind, e));
      return wrap;
    }
    function metaText(kind, e) {
      const parts = [`${cellCounts.get(e.i) ?? 0}\u30BB\u30EB`];
      if (kind === "state") {
        const cap = getMap().pack.burgs[e.capital];
        parts.push(cap && cap.i && !cap.removed ? `\u9996\u90FD ${cap.name}` : "\u9996\u90FD\u306A\u3057");
      }
      return parts.join("\u30FB");
    }
    function details(kind, e) {
      const d = el8("div", "b-details");
      const nameF = el8("label", "b-field");
      nameF.append(el8("span", "b-mini", "\u540D\u524D"));
      const input = document.createElement("input");
      input.value = nameOf2(e);
      input.addEventListener("change", () => {
        if (input.value.trim()) editActions.renameEntity(kind, e.i, input.value);
      });
      nameF.append(input);
      d.append(nameF);
      if (kind === "state") {
        const tech = el8("label", "b-field");
        const val = el8("span", "b-mini", `\u6280\u8853\u6C34\u6E96 ${editActions.getTechLevel(e.i) ?? 3}`);
        const r = document.createElement("input");
        r.type = "range";
        r.min = String(editActions.TECH_MIN);
        r.max = String(editActions.TECH_MAX);
        r.value = String(editActions.getTechLevel(e.i) ?? 3);
        r.addEventListener("input", () => {
          val.textContent = `\u6280\u8853\u6C34\u6E96 ${r.value}`;
        });
        r.addEventListener("change", () => editActions.setTechLevel(e.i, Number(r.value)));
        tech.append(val, r);
        d.append(tech);
        const doc = el8("label", "b-field");
        doc.append(el8("span", "b-mini", "\u6226\u4E89\u30C9\u30AF\u30C8\u30EA\u30F3"));
        const sel = document.createElement("select");
        for (const x of editActions.DOCTRINES) sel.append(new Option(x.label, x.key));
        sel.value = editActions.getDoctrine(e.i);
        sel.addEventListener("change", () => editActions.setDoctrine(e.i, sel.value));
        doc.append(sel);
        d.append(doc);
        const burgs = getMap().pack.burgs.filter((b) => b && b.i && !b.removed && b.state === e.i);
        if (burgs.length) {
          const cap = el8("label", "b-field");
          cap.append(el8("span", "b-mini", "\u9996\u90FD"));
          const cs = document.createElement("select");
          for (const b of burgs) cs.append(new Option(b.name, String(b.i)));
          cs.value = String(e.capital);
          cs.addEventListener("change", () => editActions.setCapital(e.i, Number(cs.value)));
          cap.append(cs);
          d.append(cap);
        }
      }
      if (kind === "culture") {
        const f = el8("label", "b-field");
        f.append(el8("span", "b-mini", "\u540D\u524D\u306E\u7CFB\u7D71\uFF08\u3053\u306E\u6587\u5316\u306E\u5730\u540D\u306E\u96F0\u56F2\u6C17\uFF09"));
        const sel = document.createElement("select");
        for (const k of STYLE_KEYS) sel.append(new Option(NAME_STYLES[k].label, k));
        sel.value = editActions.effectiveNameStyle(e.i);
        sel.addEventListener("change", () => editActions.setNameStyle(e.i, sel.value));
        f.append(sel);
        d.append(f);
      }
      appendEntityProfile(d, kind, e, { editActions, map: getMap(), openEntity: (k, i) => {
        tab = k;
        openCards.add(`${k}:${i}`);
        render();
      } });
      const terr = el8("div", "b-how");
      terr.append(btn2("b-seg", "\u270B \u5857\u308A\u8DB3\u3059", "\u3053\u306E\u571F\u5730\u3092\u5730\u56F3\u3067\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5E83\u3052\u308B\u30FB\u76F4\u3059", () => startPaint(kind, e.i)));
      d.append(terr);
      const rnd = document.createElement("details");
      rnd.className = "b-random";
      rnd.append(el8("summary", "", "\u{1F3B2} \u30E9\u30F3\u30C0\u30E0\u8A2D\u5B9A"));
      const rndRow = el8("div", "b-how");
      rndRow.append(
        btn2("b-seg", "\u{1F3B2} \u540D\u524D\u3092\u5F15\u304D\u76F4\u3059", "\u540D\u524D\u3092\u65B0\u3057\u304F\u30E9\u30F3\u30C0\u30E0\u306B\u6C7A\u3081\u308B\uFF08\u4ECA\u306E\u540D\u524D\u306F\u7F6E\u304D\u63DB\u308F\u308A\u307E\u3059\uFF09", () => builderActions.rerollName(kind, e.i, styleOpt())),
        btn2("b-seg", "\u{1F3B2} \u96A3\u306E\u7A7A\u304D\u5730\u3078\u5E83\u3052\u308B", "\u3053\u306E\u571F\u5730\u306B\u63A5\u3057\u305F\u7A7A\u304D\u5730\u3078\u3001\u5730\u5F62\u306B\u6CBF\u3063\u3066\u81EA\u52D5\u3067\u5E83\u3052\u308B", () => runAuto(kind, e.i, task?.size ?? "m"))
      );
      rnd.append(rndRow);
      d.append(rnd);
      const foot = el8("div", "b-actions");
      foot.append(btn2("", "\u5168\u8A2D\u5B9A\u3092\u958B\u304F \u2197", "\u6587\u7AE0\u30FB\u5916\u4EA4\u306A\u3069\u3001\u3059\u3079\u3066\u306E\u8A2D\u5B9A\u3092\u5DE6\u306E\u30D1\u30CD\u30EB\u3067\u958B\u304F", () => panels.openEntity(kind, e.i)));
      d.append(foot);
      return d;
    }
    const PROV_KINDS = { state: ["states", "\u56FD\u5BB6"], culture: ["cultures", "\u6587\u5316"], religion: ["religions", "\u5B97\u6559"], province: ["provinces", "\u5C5E\u5DDE"], burg: ["burgs", "\u90FD\u5E02"] };
    let provOpen = false;
    function provisionalSection() {
      return null;
      const list = builderActions.provisional();
      if (!list.length) return null;
      const box = el8("section", "b-tray b-tray-col");
      const head = el8("div", "b-tray-head");
      head.append(el8("span", "b-tray-text", `\u{1F3B2} \u4EEE\u306E\u540D\u524D\u304C ${list.length} \u4EF6\u3042\u308A\u307E\u3059`));
      head.append(btn2("", provOpen ? "\u4E00\u89A7\u3092\u9589\u3058\u308B" : "\u4E00\u89A7\u3092\u898B\u308B", "\u3069\u308C\u304C\u4EEE\u306E\u540D\u524D\u304B\u78BA\u8A8D\u3059\u308B", () => {
        provOpen = !provOpen;
        schedule();
      }));
      head.append(btn2("primary", "\u3059\u3079\u3066\u78BA\u5B9A", "\u540D\u524D\u306F\u305D\u306E\u307E\u307E\u3001\u300C\u4EEE\u300D\u306E\u5370\u3060\u3051\u5916\u3059\uFF08Undo 1\u56DE\u3067\u623B\u305B\u307E\u3059\uFF09", () => {
        builderActions.confirmAll();
      }));
      box.append(head);
      if (provOpen) {
        const map = getMap();
        const ul = el8("ul", "b-prov-list");
        for (const { kind, id } of list) {
          const [key, label] = PROV_KINDS[kind] ?? [null, kind];
          const name = key && map?.pack?.[key]?.[id]?.name || `#${id}`;
          const li = el8("li", "b-prov-item");
          li.append(el8("span", "b-prov-kind", label), el8("span", "b-prov-name", name));
          li.append(btn2("", "\u2713 \u78BA\u5B9A", `${name} \u306E\u300C\u4EEE\u300D\u306E\u5370\u3092\u5916\u3059`, () => {
            editActions.confirmName(kind, id);
          }));
          ul.append(li);
        }
        box.append(ul);
      }
      return box;
    }
    function render() {
      scheduled = false;
      if (!isOpen()) return;
      const map = getMap();
      const scrollTop = panel2.scrollTop;
      body.replaceChildren();
      if (!map) {
        body.append(el8("p", "b-hint", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002"));
        return;
      }
      body.append(modeTabs());
      if (mode !== "build" && views[mode]) {
        const c = el8("div", "b-modebody");
        body.append(c);
        views[mode].render(c);
        panel2.scrollTop = scrollTop;
        return;
      }
      body.append(el8("p", "b-lead", "\u30DC\u30BF\u30F31\u3064\u3067\u3001\u307E\u305A\u5F62\u306B\u306A\u308A\u307E\u3059\u3002\u540D\u524D\u30FB\u9818\u571F\u30FB\u8A2D\u5B9A\u306F\u3001\u3044\u3064\u3067\u3082\u81EA\u7531\u306B\u76F4\u305B\u307E\u3059\u3002"));
      body.append(quickSection());
      const t = taskSection();
      if (t) body.append(t);
      body.append(listSection());
      const p = provisionalSection();
      if (p) body.append(p);
      panel2.scrollTop = scrollTop;
    }
    const safeBuilderRender = guardRender(panel2, () => render());
    function schedule() {
      if (scheduled || !isOpen()) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        safeBuilderRender();
      });
    }
    store.subscribe((_s, change) => {
      if (change.type === "replace") {
        task = null;
        openCards.clear();
        for (const v of Object.values(views)) v.leave?.();
        mode = "build";
      }
      if (change.type === "batch" || change.type === "update") return;
      schedule();
    });
    return { open, close, toggle: () => isOpen() ? close() : open(), get isOpen() {
      return isOpen();
    }, _state: () => ({ task, tab, nameStyle }) };
  }

  // js/core/sim/world.js
  var UPKEEP_WEIGHT = { infantry: 1, armor: 8, air: 15, navy: 25, special: 3, advanced: 6, nuclear: 100 };
  var UPKEEP_FACTOR = 0.2;
  var UPKEEP_MAX = 0.8;
  function militaryBurden(state) {
    let weighted = 0;
    for (const reg of regimentsOf(state)) for (const [k, n] of Object.entries(reg.u ?? {})) if (UNIT_BY_KEY[k] && n > 0) weighted += n * (UPKEEP_WEIGHT[k] ?? 1);
    if (!weighted) return 0;
    const popK = Math.max(1, ((state.rural ?? 0) + (state.urban ?? 0)) / 1e3);
    return Math.min(UPKEEP_MAX, weighted / popK * UPKEEP_FACTOR);
  }
  var isLive27 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function planAnnualUpdate(map, rnd = null) {
    const parts = [];
    const trade = computeTrade(map);
    for (const state of map.pack.states) {
      if (!isLive27(state)) continue;
      ensureEconomy(state);
      const revenue = annualRevenue(trade.states.get(state.i));
      if (revenue > 0) {
        const net = revenue * (1 - militaryBurden(state));
        parts.push(setProps(state, { treasury: Math.round((getFinance(state).treasury + net) * 100) / 100 }));
      }
      const { rural, urban, industry } = computeAnnualUpdate(state);
      const peak = Math.max(state.popPeak ?? 0, rural + urban);
      const atWar2 = (map.ext?.data?.wars ?? []).some((w) => !w.endedAt && (w.attackers.includes(state.i) || w.defenders.includes(state.i)));
      const support = state.support == null || atWar2 ? null : Math.max(0, Math.min(100, state.support + Math.max(-4, Math.min(6, 70 - state.support))));
      const morale = state.morale == null ? null : Math.max(0, Math.min(100, state.morale + Math.max(-5, Math.min(5, 70 - state.morale))));
      if (rural !== state.rural || urban !== state.urban || industry !== state.industry || peak !== state.popPeak || morale != null && morale !== state.morale || support != null && support !== state.support) {
        parts.push(setProps(state, { rural, urban, industry, popPeak: peak, ...morale != null ? { morale } : {}, ...support != null ? { support } : {} }));
      }
      const conscription = planAnnualConscription(map, state.i);
      if (conscription) parts.push(...conscription.parts);
    }
    if (rnd) parts.push(...ratesParts(map, rnd));
    if (!parts.length) return null;
    return makeCommand("\u5E74\u6B21\u66F4\u65B0\uFF08\u4EBA\u53E3\u30FB\u7523\u696D\u30FB\u5FB4\u5175\u30FB\u7A0E\u53CE\u30FB\u70BA\u66FF\uFF09", ["politics", "places"], parts);
  }

  // js/ui/economy-view.js
  var fmt2 = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ja-JP");
  var signed = (v) => v > 0.05 ? `+${fmt2(v)}` : v < -0.05 ? `${fmt2(v)}` : "\xB10";
  function createEconomyView({ store, editActions, builderActions }) {
    let selected = null;
    function summary(eco, states) {
      const total = eco.trade.deals.reduce((a, d) => a + d.value, 0);
      const box = el7("div", "b-eco-sum");
      box.append(
        stat("\u53D6\u5F15", `${eco.trade.deals.length}\u4EF6`),
        stat("\u53D6\u5F15\u984D", fmt2(total)),
        stat("\u56FD\u306E\u6570", `${states.length}`)
      );
      return box;
    }
    const stat = (k, v) => {
      const d = el7("div", "b-stat");
      d.append(el7("div", "b-stat-v", v), el7("div", "b-mini", k));
      return d;
    };
    function stateRow(map, eco, s) {
      const f = editActions.getFinance(s.i);
      const info = eco.trade.states.get(s.i);
      const card = el7("div", `b-card${selected === s.i ? " active" : ""}`);
      const row = el7("div", "b-row b-click");
      row.append(swatch(s.color));
      const main = el7("div", "b-row-main");
      main.append(el7("div", "b-row-name", s.fullName ?? s.name));
      const rev = eco.revenue(s.i);
      const burden = militaryBurden(s);
      const upkeep = burden > 0 ? `\uFF08\u8ECD\u4E8B\u8CBB ${Math.round(burden * 100)}% \u2192 \u624B\u53D6\u308A +${fmt2(rev * (1 - burden))}\uFF09` : "";
      main.append(el7("div", "b-row-meta", `\u56FD\u5EAB ${fmt2(f.treasury)}\u30FB\u5E74\u53CE +${fmt2(rev)}${upkeep}\u30FB\u8CBF\u6613 ${signed(info.exportValue - info.importValue)}`));
      row.append(main, el7("span", "b-chev", selected === s.i ? "\u25B4" : "\u25BE"));
      row.addEventListener("click", () => {
        selected = selected === s.i ? null : s.i;
        if (selected == null) builderActions.showTradeLines(null);
        render();
      });
      card.append(row);
      if (selected === s.i) card.append(detail(map, eco, s, f, info));
      return card;
    }
    function detail(map, eco, s, f, info) {
      const d = el7("div", "b-details");
      const rates = el7("div", "b-tax");
      rates.append(
        slider({ label: "\u58F2\u4E0A\u7A0E\uFF08\u8F38\u51FA\u306B\u304B\u304B\u308B\uFF09", min: 0, max: 0.6, step: 0.01, value: f.salesTax, format: (v) => `${Math.round(v * 100)}%`, onCommit: (v) => editActions.setFinance(s.i, { salesTax: v }) }),
        slider({ label: "\u4EBA\u982D\u7A0E\uFF08\u4EBA\u53E3\u306B\u304B\u304B\u308B\uFF09", min: 0, max: 0.5, step: 0.01, value: f.pollTax, format: (v) => `${Math.round(v * 100)}%`, onCommit: (v) => editActions.setFinance(s.i, { pollTax: v }) })
      );
      d.append(rates);
      d.append(el7("p", "b-hint", `\u5E74\u53CE\u306E\u898B\u8FBC\u307F: \u4EBA\u982D\u7A0E ${fmt2(info.pollTaxRevenue)} + \u8F38\u51FA\u306E\u58F2\u4E0A\u7A0E ${fmt2(info.salesTaxRevenue)} = ${fmt2(eco.revenue(s.i))}`));
      const tre = el7("label", "b-field");
      tre.append(el7("span", "b-mini", "\u56FD\u5EAB\uFF08\u76F4\u63A5\u66F8\u304D\u63DB\u3048\u3089\u308C\u307E\u3059\uFF09"));
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.value = String(Math.round(f.treasury * 100) / 100);
      inp.addEventListener("change", () => editActions.setFinance(s.i, { treasury: inp.value }));
      tre.append(inp);
      d.append(tre);
      const tbl = el7("div", "b-goods");
      const head = el7("div", "b-goods-row b-goods-head");
      head.append(el7("span", "", "\u7523\u7269"), el7("span", "", "\u7523"), el7("span", "", "\u9700"), el7("span", "", "\u5DEE"));
      tbl.append(head);
      for (const g of eco.goods) {
        const p = info.production[g.id], dm = info.demand[g.id], net = info.net[g.id];
        if (p < 0.05 && dm < 0.05) continue;
        const r = el7("div", "b-goods-row");
        const diff = el7("span", net >= 0 ? "pos" : "neg", signed(net));
        r.append(el7("span", "", `${g.icon} ${g.label}`), el7("span", "", fmt2(p)), el7("span", "", fmt2(dm)), diff);
        tbl.append(r);
      }
      d.append(tbl);
      const partners = eco.partners(s.i);
      d.append(el7("h5", "b-sub", "\u8CBF\u6613\u76F8\u624B"));
      if (!partners.length) d.append(el7("p", "b-hint", "\u53D6\u5F15\u76F8\u624B\u304C\u3044\u307E\u305B\u3093\uFF08\u6226\u4E89\u4E2D\u30FB\u5B64\u7ACB\u30FB\u4F59\u5270\u306A\u3057\uFF09\u3002"));
      for (const p of partners.slice(0, 5)) {
        const ps = map.pack.states[p.partner];
        const r = el7("div", "b-partner");
        r.append(
          swatch(ps.color, false),
          el7("span", "b-partner-name", ps.name),
          el7("span", "b-mini", `\u8F38\u51FA ${fmt2(p.exportValue)} / \u8F38\u5165 ${fmt2(p.importValue)}`),
          el7("span", "b-partner-goods", p.goods.map((id) => eco.goods.find((g) => g.id === id)?.icon ?? "").join(""))
        );
        d.append(r);
      }
      d.append(el7("p", "b-hint", "\u5730\u56F3\u306E\u91D1\u306E\u7DDA\u306F\u8F38\u51FA\u8D85\u904E\u3001\u9752\u7DD1\u306E\u7DDA\u306F\u8F38\u5165\u8D85\u904E\u306E\u76F8\u624B\u3067\u3059\u3002"));
      return d;
    }
    function render(container) {
      if (container) render.container = container;
      const c = render.container;
      if (!c) return;
      c.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        c.append(el7("p", "b-hint", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002"));
        return;
      }
      const eco = builderActions.economy();
      const states = map.pack.states.filter(isLive25).sort((a, b) => eco.revenue(b.i) - eco.revenue(a.i));
      if (selected != null && !states.some((s) => s.i === selected)) selected = null;
      if (selected != null) builderActions.showTradeLines(selected, eco);
      c.append(el7("p", "b-lead", "\u56FD\u306E\u8CA1\u653F\u3068\u4EA4\u6613\u3092\u898B\u307E\u3059\u3002\u5E74\u304C\u5909\u308F\u308B\u305F\u3073\u306B\u3001\u4EBA\u982D\u7A0E\u3068\u8F38\u51FA\u306E\u58F2\u4E0A\u7A0E\u304B\u3089\u8ECD\u306E\u7DAD\u6301\u8CBB\u3092\u5F15\u3044\u305F\u5206\u304C\u56FD\u5EAB\u306B\u305F\u307E\u308A\u307E\u3059\u3002"));
      c.append(summary(eco, states));
      const list = el7("div", "b-cards");
      for (const s of states) list.append(stateRow(map, eco, s));
      c.append(list);
      c.append(el7("p", "b-hint", "\u7523\u7269\u306F\u5730\u56F3\uFF08\u30D0\u30A4\u30AA\u30FC\u30E0\u30FB\u4EBA\u53E3\u30FB\u6D77\u5CB8\uFF09\u304B\u3089\u8A08\u7B97\u3057\u305F\u7C21\u6613\u30E2\u30C7\u30EB\u3067\u3059\u3002\u6226\u4E89\u4E2D\u306E\u56FD\u3069\u3046\u3057\u306F\u53D6\u5F15\u3057\u307E\u305B\u3093\u3002"));
    }
    return { render, leave() {
      selected = null;
      builderActions.showTradeLines(null);
    } };
  }

  // js/ui/travel-view.js
  var fmt3 = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ja-JP");
  function createTravelView({ store, editActions, editMode, viewport, actions }) {
    let section = "journey";
    let selJourney = null;
    let selZone = null;
    let transport = "foot";
    let picking = null;
    let paintingZone = null;
    let zoneSize = 24;
    let zoneType = "Invasion";
    let rerender = () => {
    };
    let renderOnce = () => {
    };
    const getMap = () => store.getState().map;
    const placeName = (map, cell) => placeLabel(map, cell);
    function setHighlight() {
      actions.setView({ journeySelected: selJourney, zoneSelected: selZone });
    }
    function journeySection(map) {
      const sec = el7("section", "b-sec");
      sec.append(btn("b-quick-btn b-wide", "\uFF0B \u65C5\u3092\u3064\u304F\u308B", "\u7A7A\u306E\u65C5\u3092\u4F5C\u308B\u3002\u305D\u306E\u3042\u3068\u533A\u9593\u3092\u8DB3\u3059", () => {
        const id = editActions.addJourney({});
        if (id != null) {
          selJourney = id;
          setHighlight();
          renderOnce();
        }
      }));
      const sc = travelScale(map);
      if (sc.usedDefault) sec.append(el7("p", "b-hint", "\u3053\u306E\u5730\u56F3\u306B\u306F\u7E2E\u5C3A\u306E\u60C5\u5831\u304C\u306A\u3044\u305F\u3081\u3001\u6A19\u6E96\uFF081\u753B\u7D20\uFF1D3km\uFF09\u3067\u8A08\u7B97\u3057\u307E\u3059\u3002"));
      const list = listJourneys(map);
      if (!list.length) sec.append(el7("p", "b-hint", "\u307E\u3060\u65C5\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u8ECD\u306E\u9060\u5F81\u3001\u5546\u4EBA\u306E\u884C\u304D\u6765\u3001\u5192\u967A\u8005\u306E\u9053\u306E\u308A\u306A\u3069\u3092\u8A18\u9332\u3067\u304D\u307E\u3059\u3002"));
      const cards = el7("div", "b-cards");
      for (const j of list.slice().reverse()) cards.append(journeyCard(map, j));
      sec.append(cards);
      return sec;
    }
    function journeyCard(map, j) {
      const open = selJourney === j.id;
      const card = el7("div", `b-card${open ? " active" : ""}`);
      const row = el7("div", "b-row b-click");
      const sw = swatch(j.color);
      const main = el7("div", "b-row-main");
      const tot = journeyTotals(map, j);
      main.append(
        el7("div", "b-row-name", j.name),
        el7("div", "b-row-meta", j.legs.length ? `${j.type}\u30FB${fmt3(tot.distance)}${tot.unit}\u30FB${formatDuration(tot.days)}` : `${j.type}\u30FB\u533A\u9593\u306A\u3057`)
      );
      row.append(sw, main, el7("span", "b-chev", open ? "\u25B4" : "\u25BE"));
      row.addEventListener("click", () => {
        selJourney = open ? null : j.id;
        setHighlight();
        renderOnce();
      });
      card.append(row);
      if (open) card.append(journeyDetail(map, j));
      return card;
    }
    function journeyDetail(map, j) {
      const d = el7("div", "b-details");
      const nameF = el7("label", "b-field");
      nameF.append(el7("span", "b-mini", "\u540D\u524D"));
      const input = document.createElement("input");
      input.value = j.name;
      input.addEventListener("change", () => {
        if (input.value.trim()) editActions.editJourney(j.id, { name: input.value });
      });
      nameF.append(input);
      d.append(nameF);
      d.append(el7("h5", "b-sub", "\u533A\u9593"));
      if (!j.legs.length) d.append(el7("p", "b-hint", "\u307E\u3060\u533A\u9593\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u4E0B\u3067\u624B\u6BB5\u3092\u9078\u3093\u3067\u300C\u533A\u9593\u3092\u8DB3\u3059\u300D\u3092\u62BC\u3057\u3001\u5730\u56F3\u3067\u5834\u6240\u3092\u9078\u3073\u307E\u3059\u3002"));
      j.legs.forEach((leg, idx) => {
        const t = TRANSPORT_BY_ID[leg.transport];
        const st = t ? legStats(map, leg, t) : { distance: 0, days: 0, unit: "" };
        const row = el7("div", "b-leg");
        const head = el7("div", "b-leg-head");
        head.append(
          el7("span", "b-leg-ico", t?.icon ?? "?"),
          el7("span", "b-leg-route", t?.domain === "stay" ? `${placeName(map, leg.from)}\u3067\u6EDE\u5728` : `${placeName(map, leg.from)} \u2192 ${placeName(map, leg.to)}`),
          btn("suggest-mini", "\xD7", "\u3053\u306E\u533A\u9593\u3092\u524A\u9664", () => editActions.removeLeg(j.id, idx))
        );
        row.append(head);
        const meta = el7("div", "b-row-meta", t?.domain === "stay" ? formatDuration(st.days) : `${fmt3(st.distance)}${st.unit}\u30FB${formatDuration(st.days)}`);
        const sel = document.createElement("select");
        sel.title = "\u79FB\u52D5\u624B\u6BB5\u3092\u5909\u3048\u308B\u3068\u3001\u7D4C\u8DEF\u3092\u5F15\u304D\u76F4\u3057\u307E\u3059";
        for (const x of TRANSPORTS) sel.append(new Option(`${x.icon} ${x.label}`, x.id));
        sel.value = leg.transport;
        sel.addEventListener("change", () => editActions.changeLegTransport(j.id, idx, sel.value));
        row.append(meta, sel);
        d.append(row);
      });
      const add = el7("div", "b-addleg");
      const tsel = document.createElement("select");
      for (const x of TRANSPORTS) tsel.append(new Option(`${x.icon} ${x.label}`, x.id));
      tsel.value = transport;
      tsel.addEventListener("change", () => {
        transport = tsel.value;
      });
      add.append(tsel, btn("b-seg", picking ? "\u9078\u629E\u4E2D\u2026\uFF08Esc \u3067\u53D6\u6D88\uFF09" : "\uFF0B \u533A\u9593\u3092\u8DB3\u3059", "\u5730\u56F3\u3067\u5834\u6240\u3092\u9078\u3076", () => startPick(map, j)));
      d.append(add);
      if (picking) d.append(el7("p", "b-status", picking.text));
      const tot = journeyTotals(map, j);
      if (j.legs.length) d.append(el7("p", "b-hint", `\u5408\u8A08 ${fmt3(tot.distance)}${tot.unit}\u30FB${formatDuration(tot.days)}`));
      const foot = el7("div", "b-actions");
      foot.append(btn("", "\u65C5\u3092\u524A\u9664", "\u3053\u306E\u65C5\u3092\u3059\u3079\u3066\u6D88\u3059\uFF08Undo\u3067\u623B\u305B\u307E\u3059\uFF09", () => {
        selJourney = null;
        editActions.removeJourney(j.id);
        setHighlight();
      }));
      d.append(foot);
      return d;
    }
    function startPick(map, j) {
      if (picking) {
        editMode.cancelPick();
        return;
      }
      const t = TRANSPORT_BY_ID[transport];
      const last = j.legs.at(-1);
      const finish = (from, to) => {
        editActions.addLeg(j.id, { transport, from, to });
        picking = null;
        renderOnce();
      };
      if (t.domain === "stay") {
        if (!last) {
          picking = { text: "\u6700\u521D\u306E\u533A\u9593\u304C\u300C\u6EDE\u5728\u300D\u306E\u3068\u304D\u306F\u3001\u5834\u6240\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" };
        } else {
          finish(last.to, last.to);
          return;
        }
      }
      const askTo = (from) => {
        picking = { text: `${placeName(map, from)}\u304B\u3089\u3001\u3069\u3053\u3078\u884C\u304D\u307E\u3059\u304B\uFF1F \u5730\u56F3\u3067\u76EE\u7684\u5730\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044` };
        editMode.pickCell((cell) => {
          if (cell == null) {
            picking = null;
            renderOnce();
            return;
          }
          finish(from, cell);
        });
        renderOnce();
      };
      if (last) {
        askTo(last.to);
        return;
      }
      picking = { text: "\u51FA\u767A\u70B9\u3092\u3001\u5730\u56F3\u3067\u9078\u3093\u3067\u304F\u3060\u3055\u3044" };
      editMode.pickCell((cell) => {
        if (cell == null) {
          picking = null;
          renderOnce();
          return;
        }
        if (t.domain === "stay") {
          finish(cell, cell);
          return;
        }
        askTo(cell);
      });
      renderOnce();
    }
    function zoneSection(map) {
      const sec = el7("section", "b-sec");
      const row = el7("div", "b-addleg");
      const tsel = document.createElement("select");
      for (const t of ZONE_TYPES) tsel.append(new Option(t.label, t.id));
      tsel.value = zoneType;
      tsel.addEventListener("change", () => {
        zoneType = tsel.value;
      });
      row.append(tsel);
      sec.append(row);
      const how = el7("div", "b-how");
      how.append(
        btn("b-seg", "\u270B \u5857\u3063\u3066\u4F5C\u308B", "\u7A7A\u306E\u30BE\u30FC\u30F3\u3092\u4F5C\u308A\u3001\u5730\u56F3\u3092\u306A\u305E\u3063\u3066\u7BC4\u56F2\u3092\u6C7A\u3081\u308B", () => {
          const idx = editActions.addZone({ type: zoneType });
          if (idx != null) {
            selZone = idx;
            startPaint(idx, "add");
          }
        }),
        btn("b-seg", picking ? "\u9078\u629E\u4E2D\u2026" : "\u{1F3B2} 1\u70B9\u304B\u3089\u5E83\u3052\u308B", "\u5730\u56F3\u3067\u4E2D\u5FC3\u3092\u9078\u3076\u3068\u3001\u307E\u308F\u308A\u306B\u81EA\u52D5\u3067\u5E83\u304C\u308B", () => {
          if (picking) {
            editMode.cancelPick();
            return;
          }
          picking = { text: "\u30BE\u30FC\u30F3\u306E\u4E2D\u5FC3\u3092\u3001\u5730\u56F3\u3067\u9078\u3093\u3067\u304F\u3060\u3055\u3044" };
          editMode.pickCell((cell) => {
            picking = null;
            if (cell != null) {
              const idx = editActions.addZoneAround(cell, { type: zoneType, size: zoneSize });
              if (idx != null) {
                selZone = idx;
                setHighlight();
              }
            }
            renderOnce();
          });
          renderOnce();
        })
      );
      sec.append(how);
      if (picking) sec.append(el7("p", "b-status", picking.text));
      const sizeRow = el7("div", "b-sizes");
      sizeRow.append(el7("span", "b-mini", "\u304A\u307E\u304B\u305B\u306E\u5E83\u3055"));
      for (const [n, label] of [[10, "\u5C0F"], [24, "\u4E2D"], [60, "\u5927"]]) sizeRow.append(btn(`b-chip${zoneSize === n ? " on" : ""}`, label, `${n}\u30BB\u30EB`, () => {
        zoneSize = n;
        renderOnce();
      }));
      sec.append(sizeRow);
      const zones = (map.zones ?? []).map((z, index) => ({ z, index })).filter((x) => x.z && Array.isArray(x.z.cells));
      if (!zones.length) sec.append(el7("p", "b-hint", "\u307E\u3060\u30BE\u30FC\u30F3\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u4FB5\u653B\u30FB\u53CD\u4E71\u30FB\u75AB\u75C5\u30FB\u707D\u5BB3\u306A\u3069\u306E\u7BC4\u56F2\u3092\u8A18\u9332\u3067\u304D\u307E\u3059\u3002"));
      const cards = el7("div", "b-cards");
      for (const { z, index } of zones.slice().reverse()) cards.append(zoneCard(map, z, index));
      sec.append(cards);
      return sec;
    }
    function startPaint(index, mode) {
      paintingZone = index;
      editMode.setZoneMode(mode);
      editMode.setTool("paint:zone");
      editMode.setTarget(index);
      window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:zone", target: index } }));
      setHighlight();
      renderOnce();
    }
    function endPaint() {
      if (paintingZone == null) return;
      paintingZone = null;
      editMode.setTool("select");
      window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "select" } }));
    }
    function zoneCard(map, z, index) {
      const open = selZone === index;
      const card = el7("div", `b-card${open ? " active" : ""}`);
      const row = el7("div", "b-row b-click");
      const main = el7("div", "b-row-main");
      main.append(el7("div", "b-row-name", z.name), el7("div", "b-row-meta", `${zoneLabel(z)}\u30FB${z.cells.length}\u30BB\u30EB${z.hidden ? "\u30FB\u975E\u8868\u793A" : ""}`));
      row.append(swatch(zoneColor(z)), main, el7("span", "b-chev", open ? "\u25B4" : "\u25BE"));
      row.addEventListener("click", () => {
        if (open) endPaint();
        selZone = open ? null : index;
        setHighlight();
        renderOnce();
      });
      card.append(row);
      if (open) {
        const d = el7("div", "b-details");
        const nameF = el7("label", "b-field");
        nameF.append(el7("span", "b-mini", "\u540D\u524D"));
        const input = document.createElement("input");
        input.value = z.name;
        input.addEventListener("change", () => {
          if (input.value.trim()) editActions.editZone(index, { name: input.value });
        });
        nameF.append(input);
        d.append(nameF);
        const tf = el7("label", "b-field");
        tf.append(el7("span", "b-mini", "\u7A2E\u985E"));
        const tsel = document.createElement("select");
        for (const t of ZONE_TYPES) tsel.append(new Option(t.label, t.id));
        if (!ZONE_TYPES.some((t) => t.id === z.type)) tsel.append(new Option(z.type, z.type));
        tsel.value = z.type;
        tsel.addEventListener("change", () => editActions.editZone(index, { type: tsel.value }));
        tf.append(tsel);
        d.append(tf);
        const ops = el7("div", "b-how");
        const painting = paintingZone === index;
        ops.append(
          btn(`b-seg${painting ? " active" : ""}`, painting ? "\u270B \u5857\u3063\u3066\u3044\u307E\u3059\uFF08\u5B8C\u4E86\u3067\u7D42\u4E86\uFF09" : "\u270B \u5857\u308A\u8DB3\u3059", "\u5730\u56F3\u3092\u306A\u305E\u3063\u3066\u7BC4\u56F2\u3092\u5E83\u3052\u308B", () => painting ? (endPaint(), renderOnce()) : startPaint(index, "add")),
          btn("b-seg", "\u{1F9FD} \u6D88\u3059", "\u5730\u56F3\u3092\u306A\u305E\u3063\u3066\u7BC4\u56F2\u3092\u6E1B\u3089\u3059", () => startPaint(index, "erase"))
        );
        d.append(ops);
        const foot = el7("div", "b-actions");
        foot.append(
          btn("", z.hidden ? "\u8868\u793A\u3059\u308B" : "\u96A0\u3059", "\u5730\u56F3\u306B\u51FA\u3059\u304B\u3069\u3046\u304B", () => editActions.editZone(index, { hidden: !z.hidden })),
          btn("", "\u524A\u9664", "\u3053\u306E\u30BE\u30FC\u30F3\u3092\u6D88\u3059\uFF08Undo\u3067\u623B\u305B\u307E\u3059\uFF09", () => {
            endPaint();
            selZone = null;
            editActions.removeZone(index);
            setHighlight();
          })
        );
        d.append(foot);
        card.append(d);
      }
      return card;
    }
    function render(container) {
      if (container) {
        render.container = container;
        renderOnce = () => render();
      }
      const c = render.container;
      if (!c) return;
      c.replaceChildren();
      const map = getMap();
      if (!map) {
        c.append(el7("p", "b-hint", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002"));
        return;
      }
      c.append(el7("p", "b-lead", "\u65C5\u306E\u9053\u306E\u308A\u3068\u3001\u30BE\u30FC\u30F3\uFF08\u4FB5\u653B\u30FB\u75AB\u75C5\u30FB\u707D\u5BB3\u306A\u3069\uFF09\u3092\u8A18\u9332\u3057\u307E\u3059\u3002"));
      const tabs = el7("div", "b-tabs");
      for (const [k, label] of [["journey", "\u65C5"], ["zone", "\u30BE\u30FC\u30F3"]]) {
        tabs.append(btn(`b-tab${section === k ? " on" : ""}`, label, "", () => {
          if (section !== k) {
            endPaint();
            section = k;
            renderOnce();
          }
        }));
      }
      c.append(tabs);
      c.append(section === "journey" ? journeySection(map) : zoneSection(map));
    }
    return {
      render,
      leave() {
        editMode.cancelPick();
        picking = null;
        endPaint();
        selJourney = null;
        selZone = null;
        actions.setView({ journeySelected: null, zoneSelected: null });
      }
    };
  }

  // js/ui/panels/editor-panel.js
  var el9 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive28 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initEditorPanel({ store, editActions, editMode, panels: initialPanels }) {
    const root = byId("editor-panel");
    const sidebar = byId("sidebar");
    let current = null;
    let stateSubtab = "info";
    let panels = initialPanels ?? null;
    function open(kind, id) {
      current = { kind, id };
      if (kind === "state") stateSubtab = "info";
      render();
    }
    function close() {
      current = null;
      render();
    }
    function render() {
      root.replaceChildren();
      if (!current) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      const map = store.getState().map;
      if (!map) {
        close();
        return;
      }
      const header = el9("div", "editor-header");
      const title = el9("h3");
      const closeBtn = el9("button", "editor-close", "\xD7");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "\u9589\u3058\u308B");
      closeBtn.addEventListener("click", close);
      header.append(title, closeBtn);
      root.append(header);
      if (current.kind === "cell") {
        const body2 = el9("div", "editor-body");
        root.append(body2);
        renderCell(map, title, body2);
        return;
      }
      if (current.kind === "burg") {
        const body2 = el9("div", "editor-body");
        root.append(body2);
        renderBurg(map, title, body2);
        return;
      }
      if (current.kind === "marker") {
        const body2 = el9("div", "editor-body");
        root.append(body2);
        renderMarker(map, title, body2);
        return;
      }
      if (current.kind === "state") {
        renderStateTabs(map, title, root);
        return;
      }
      const body = el9("div", "editor-body");
      root.append(body);
      renderEntity(map, current.kind, title, body);
    }
    function renderStateTabs(map, title, root2) {
      const e = map.pack.states[current.id];
      if (!isLive28(e)) {
        close();
        return;
      }
      title.textContent = `\u{1F3F3} ${e.fullName ?? e.name}`;
      const body = el9("div", "editor-body");
      root2.append(body);
      renderStateInfo(map, e, body);
      const prov = document.createElement("details");
      prov.className = "state-prov-fold";
      prov.open = stateSubtab === "provinces";
      prov.addEventListener("toggle", () => {
        stateSubtab = prov.open ? "provinces" : "info";
      });
      prov.append(el9("summary", "", "\u25A6 \u5C5E\u5DDE"));
      const provBody = el9("div", "state-prov-body");
      prov.append(provBody);
      renderStateProvinces(map, e, provBody);
      body.append(prov);
    }
    function renderStateInfo(map, e, body) {
      const form = el9("div", "editor-form");
      form.append(basicStatsSection(map, e));
      form.append(textField2("\u56FD\u5BB6\u540D", e.fullName ?? e.name, (v) => editActions.renameEntity("state", e.i, v), () => editActions.suggestName("state", { id: e.i })));
      form.append(...provisionalNote("state", e.i));
      form.append(techLevelSection(e.i));
      form.append(doctrineSection(e.i));
      form.append(noteField(map, "state", e.i));
      body.append(form);
    }
    function basicStatsSection(map, e) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u56FD\u529B"));
      const pop = statePopulation(e);
      const power = stateMilitaryPower(e);
      const headcount = stateHeadcount(e);
      const popRank = stateRank(map, e.i, "population");
      const powerRank = stateRank(map, e.i, "military");
      const cellsRank = stateRank(map, e.i, "cells");
      const burgCount = Array.isArray(e.burgs) ? e.burgs.length : e.burgs ?? 0;
      const rows = [
        ["\u4EBA\u53E3", `${pop.toFixed(2)}\uFF08\u5343\u4EBA\uFF09${popRank ? `\u3000\u9806\u4F4D ${popRank.rank}/${popRank.total}` : ""}`],
        ["\u8ECD\u4E8B\u529B", `${power.toFixed(0)}${powerRank ? `\u3000\u9806\u4F4D ${powerRank.rank}/${powerRank.total}` : ""}`],
        ["\u5175\u54E1\u6570\uFF08\u57FA\u6570\uFF09", headcount.toFixed(0)],
        ["\u9818\u571F\uFF08\u30BB\u30EB\u6570\uFF09", `${e.cells ?? 0}${cellsRank ? `\u3000\u9806\u4F4D ${cellsRank.rank}/${cellsRank.total}` : ""}`],
        ["\u9762\u7A4D", e.area ?? 0],
        ["\u90FD\u5E02\u6570", burgCount]
      ];
      wrap.append(table(rows));
      return wrap;
    }
    function buildDiplomacy(map, focusId) {
      const form = el9("div", "editor-form");
      form.append(diplomacyMatrix(map, focusId));
      return form;
    }
    function diplomacyMatrix(map, focusId) {
      const wrap = el9("div", "editor-section diplomacy-matrix-wrap");
      wrap.append(el9("h4", "", "\u5916\u4EA4\u4E00\u89A7\uFF08\u5168\u56FD\u5BB6\uFF09"), el9("p", "hint", "\u540C\u76DF\u3092\u7D50\u3076\u3068\u300C\u540C\u76DF\u300D\u3001\u6226\u4E89\u3092\u3059\u308B\u3068\u300C\u6575\u5BFE\u300D\u306B\u306A\u308A\u3001\u8B1B\u548C\u3059\u308B\u3068\u4E2D\u7ACB\u306B\u623B\u308A\u307E\u3059\u3002\u3053\u3053\u3067\u306F\u8A2D\u5B9A\u3057\u307E\u305B\u3093\u3002"));
      const states = map.pack.states.filter(isLive28).sort((a, b) => a.i - b.i);
      if (states.length < 2) {
        wrap.append(el9("p", "hint", "\u56FD\u5BB6\u304C2\u3064\u4EE5\u4E0A\u306A\u3044\u3068\u8868\u306B\u306A\u308A\u307E\u305B\u3093\u3002"));
        return wrap;
      }
      const table2 = document.createElement("table");
      table2.className = "diplomacy-matrix";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      headRow.append(document.createElement("th"));
      for (const s of states) {
        const th = document.createElement("th");
        th.textContent = s.fullName ?? s.name;
        th.title = s.fullName ?? s.name;
        if (s.i === focusId) th.classList.add("focus");
        headRow.append(th);
      }
      thead.append(headRow);
      table2.append(thead);
      const tbody = document.createElement("tbody");
      for (const rowState of states) {
        const tr = document.createElement("tr");
        const rowHead = document.createElement("th");
        rowHead.textContent = rowState.fullName ?? rowState.name;
        rowHead.scope = "row";
        if (rowState.i === focusId) rowHead.classList.add("focus");
        tr.append(rowHead);
        for (const colState of states) {
          const td = document.createElement("td");
          if (rowState.i === colState.i) {
            td.className = "self";
            tr.append(td);
            continue;
          }
          const rel2 = simpleRelation(map, rowState.i, colState.i);
          td.className = `rel-${rel2 === "alliance" ? "Ally" : rel2 === "hostile" ? "Enemy" : "Neutral"}`;
          td.textContent = SIMPLE_LABEL[rel2];
          td.title = `${rowState.fullName ?? rowState.name} \u3068 ${colState.fullName ?? colState.name}: ${SIMPLE_LABEL[rel2]}`;
          if (rowState.i === focusId || colState.i === focusId) td.classList.add("focus-row-col");
          tr.append(td);
        }
        tbody.append(tr);
      }
      table2.append(tbody);
      const scroller = el9("div", "diplomacy-matrix-scroll");
      scroller.append(table2);
      wrap.append(scroller);
      return wrap;
    }
    function renderStateProvinces(map, e, body) {
      const form = el9("div", "editor-form");
      form.append(newProvinceSection(e));
      const provinces = map.pack.provinces.filter((p) => isLive28(p) && p.state === e.i);
      if (!provinces.length) {
        form.append(el9("p", "muted", "\u3053\u306E\u56FD\u5BB6\u306B\u306F\u307E\u3060\u5C5E\u5DDE\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u4E0A\u306E\u300C\u4F5C\u308B\u300D\u3067\u65B0\u898F\u4F5C\u6210\u3057\u3001\u300C\u5857\u308B\u300D\u30C4\u30FC\u30EB\u3067\u5730\u56F3\u4E0A\u306B\u9818\u571F\u3092\u5272\u308A\u5F53\u3066\u3089\u308C\u307E\u3059\u3002"));
      } else {
        const list = el9("div", "attr-list");
        for (const p of provinces) {
          const row = el9("div", "diplomacy-row");
          row.append(el9("span", "diplomacy-name", `${p.fullName ?? p.name}\uFF08${p.cells ?? 0}\u30BB\u30EB\uFF09`));
          const repaint = el9("button", "", "\u3053\u306E\u5C5E\u5DDE\u3092\u5857\u308A\u76F4\u3059");
          repaint.type = "button";
          repaint.title = "\u5730\u56F3\u7DE8\u96C6\u30D1\u30CD\u30EB\u306E\u300C\u5C5E\u5DDE\u3092\u5857\u308B\u300D\u30C4\u30FC\u30EB\u306B\u5207\u308A\u66FF\u3048\u3066\u3001\u3053\u306E\u5C5E\u5DDE\u3092\u5BFE\u8C61\u306B\u3057\u307E\u3059";
          repaint.addEventListener("click", () => {
            editMode?.setTool?.("paint:province");
            window.dispatchEvent(new CustomEvent("request-edit-panel-open"));
            window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:province", target: p.i } }));
          });
          row.append(repaint);
          const independence = el9("button", "", "\u72EC\u7ACB\u3055\u305B\u308B");
          independence.type = "button";
          independence.title = "\u3053\u306E\u5C5E\u5DDE\u306E\u9818\u571F\u3092\u5207\u308A\u96E2\u3057\u3001\u65B0\u3057\u3044\u72EC\u7ACB\u56FD\u5BB6\u306B\u3057\u307E\u3059";
          independence.addEventListener("click", async () => {
            const name = await promptDialog(`\u72EC\u7ACB\u3055\u305B\u3066\u4F5C\u308B\u65B0\u56FD\u5BB6\u306E\u540D\u524D`, `${p.fullName ?? p.name}`, {
              suggest: () => editActions.suggestName("state", { stateId: e.i }),
              hint: "\u7A7A\u6B04\u306B\u3059\u308B\u3068\u3001\u4EEE\u306E\u540D\u524D\u304C\u81EA\u52D5\u3067\u4ED8\u304D\u307E\u3059"
            });
            if (name == null) return;
            if (!await confirmDialog(`\u5C5E\u5DDE\u300C${p.fullName ?? p.name}\u300D\u3092\u72EC\u7ACB\u3055\u305B\u3001\u65B0\u56FD\u5BB6${name.trim() ? `\u300C${name}\u300D` : "\uFF08\u4EEE\u306E\u540D\u524D\uFF09"}\u3092\u4F5C\u308A\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F`)) return;
            editActions.declareIndependence(p.i, name);
          });
          row.append(independence);
          list.append(row);
        }
        form.append(list);
      }
      form.append(mergeSection(map, e));
      body.append(form);
    }
    function newProvinceSection(e) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u65B0\u3057\u3044\u5C5E\u5DDE"));
      const row = el9("div", "diplomacy-row");
      const input = document.createElement("input");
      input.placeholder = "\u5C5E\u5DDE\u306E\u540D\u524D\uFF08\u7A7A\u6B04\u306A\u3089\u4EEE\u306E\u540D\u524D\uFF09";
      row.append(input);
      const dice = el9("button", "suggest-mini", "\u{1F3B2}");
      dice.type = "button";
      dice.title = "\u4EEE\u306E\u540D\u524D\u3092\u751F\u6210";
      dice.addEventListener("click", () => {
        input.value = editActions.suggestName("province", { stateId: e.i });
      });
      row.append(dice);
      const btn3 = el9("button", "", "\u4F5C\u308B");
      btn3.type = "button";
      btn3.addEventListener("click", () => {
        const newId = editActions.addProvince(e.i, input.value);
        input.value = "";
        if (newId != null) {
          editMode?.setTool?.("paint:province");
          window.dispatchEvent(new CustomEvent("request-edit-panel-open"));
          window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "paint:province", target: newId } }));
        }
      });
      row.append(btn3);
      wrap.append(row);
      return wrap;
    }
    function mergeSection(map, e) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u56FD\u5BB6\u306E\u7D71\u5408"));
      const others = map.pack.states.filter((s) => isLive28(s) && s.i !== e.i && s.i > 0);
      if (!others.length) {
        wrap.append(el9("p", "hint", "\u7D71\u5408\u3067\u304D\u308B\u4ED6\u306E\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093\u3002"));
        return wrap;
      }
      const row = el9("div", "diplomacy-row");
      const sel = document.createElement("select");
      for (const s of others) {
        const o = document.createElement("option");
        o.value = s.i;
        o.textContent = s.fullName ?? s.name;
        sel.append(o);
      }
      row.append(sel);
      const btn3 = el9("button", "danger", "\u3053\u306E\u56FD\u5BB6\u3092\u7D71\u5408\u3055\u305B\u308B\uFF08\u89E3\u6563\uFF09");
      btn3.type = "button";
      btn3.addEventListener("click", async () => {
        const target = map.pack.states[Number(sel.value)];
        const ok = await confirmDialog(
          `\u300C${e.fullName ?? e.name}\u300D\u3092\u300C${target?.fullName ?? target?.name}\u300D\u306B\u7D71\u5408\u3057\u307E\u3059\u3002\u300C${e.fullName ?? e.name}\u300D\u306F\u89E3\u6563\u3057\u3001\u6D88\u6EC5\u3057\u307E\u3059\u3002\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u3059\uFF08Undo\uFF09\u304C\u3001\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F`,
          { danger: true, okLabel: "\u7D71\u5408\u3059\u308B" }
        );
        if (!ok) return;
        editActions.mergeStates(e.i, Number(sel.value));
      });
      row.append(btn3);
      wrap.append(row);
      wrap.append(el9("p", "hint", "\u3053\u306E\u56FD\u5BB6\u306E\u5168\u9818\u571F\u30FB\u90FD\u5E02\u30FB\u5C5E\u5DDE\u30FB\u90E8\u968A\u3092\u9078\u3093\u3060\u56FD\u5BB6\u306B\u7D71\u5408\u3057\u3001\u3053\u306E\u56FD\u5BB6\u81EA\u4F53\u306F\u89E3\u6563\u3057\u307E\u3059\u3002"));
      return wrap;
    }
    function renderCell(map, title, body) {
      const info = describeCell(map, current.id);
      title.textContent = `\u30BB\u30EB #${current.id}`;
      if (!info) {
        body.append(el9("p", "muted", "\u60C5\u5831\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const rows = [
        ["\u5730\u5F62", info.biome],
        ["\u6A19\u9AD8", info.height],
        ["\u56FD\u5BB6", info.state],
        ["\u6587\u5316", info.culture],
        ["\u5B97\u6559", info.religion],
        ["\u5C5E\u5DDE", info.province],
        ["\u90FD\u5E02", info.burg]
      ];
      body.append(table(rows.filter(([, v]) => v != null)));
      if (info.burg) {
        const b = el9("button", "link", `\u90FD\u5E02\u300C${info.burg}\u300D\u3092\u958B\u304F`);
        b.addEventListener("click", () => open("burg", map.pack.cells.burg[current.id]));
        body.append(b);
      }
      const stateId = map.pack.cells.state[current.id];
      if (stateId) {
        const b = el9("button", "link", `\u56FD\u5BB6\u300C${info.state}\u300D\u3092\u958B\u304F`);
        b.addEventListener("click", () => open("state", stateId));
        body.append(b);
      }
    }
    function renderMarker(map, title, body) {
      const m = map.markers.find((x) => x.i === current.id);
      if (!m) {
        close();
        return;
      }
      title.textContent = `${m.icon} ${m.name ?? defaultMarkerName(m.type)}`;
      const form = el9("div", "editor-form");
      const typeRow = el9("label", "field");
      typeRow.append(el9("span", "field-label", "\u7A2E\u985E"));
      const sel = document.createElement("select");
      for (const t of DEFAULT_MARKER_TYPES) {
        const o = document.createElement("option");
        o.value = t.type;
        o.textContent = `${t.icon} ${t.label}`;
        if (t.type === m.type) o.selected = true;
        sel.append(o);
      }
      if (!DEFAULT_MARKER_TYPES.some((t) => t.type === m.type)) {
        const o = document.createElement("option");
        o.value = m.type;
        o.textContent = `${m.icon} ${m.type}`;
        o.selected = true;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        const t = DEFAULT_MARKER_TYPES.find((x) => x.type === sel.value);
        editActions.editMarker(m.i, { type: sel.value, icon: t?.icon ?? m.icon });
      });
      typeRow.append(sel);
      form.append(typeRow);
      form.append(textField2("\u540D\u524D", m.name ?? defaultMarkerName(m.type), (v) => editActions.editMarker(m.i, { name: v })));
      form.append(noteField(map, "marker", m.i));
      const del = el9("button", "danger", "\u3053\u306E\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664");
      del.type = "button";
      del.addEventListener("click", async () => {
        if (await confirmDialog("\u3053\u306E\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F", { danger: true, okLabel: "\u524A\u9664" })) {
          editActions.removeMarker(m.i);
          close();
        }
      });
      form.append(del);
      body.append(form);
    }
    function renderBurg(map, title, body) {
      const b = map.pack.burgs[current.id];
      if (!isLive28(b)) {
        close();
        return;
      }
      title.textContent = `${b.capital ? "\u{1F3F0} " : "\u{1F3D8}\uFE0F "}${b.name}`;
      const form = el9("div", "editor-form");
      form.append(table([
        ["\u56FD\u5BB6", isLive28(map.pack.states[b.state]) ? map.pack.states[b.state].name : "\u7121\u6240\u5C5E"],
        ["\u6587\u5316", map.pack.cultures[b.culture]?.name ?? ""],
        ["\u4EBA\u53E3(\u6982\u7B97)", (b.population ?? 0).toFixed(2)]
      ]));
      form.append(textField2("\u540D\u524D", b.name, (v) => editActions.renameBurg(b.i, v), () => editActions.suggestName("burg", { id: b.i })));
      form.append(...provisionalNote("burg", b.i));
      if (!b.capital) {
        const cap = el9("button", "", "\u3053\u306E\u90FD\u5E02\u3092\u9996\u90FD\u306B\u3059\u308B");
        cap.type = "button";
        cap.addEventListener("click", () => editActions.setCapital(b.state, b.i));
        form.append(cap);
      }
      form.append(noteField(map, "burg", b.i));
      const reason = editActions.whyCannotRemoveBurg(b.i);
      const del = el9("button", "danger", "\u3053\u306E\u90FD\u5E02\u3092\u524A\u9664");
      del.type = "button";
      del.disabled = !!reason;
      if (reason) del.title = reason;
      del.addEventListener("click", async () => {
        if (await confirmDialog("\u3053\u306E\u90FD\u5E02\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F", { danger: true, okLabel: "\u524A\u9664" })) {
          editActions.removeBurg(b.i);
          close();
        }
      });
      form.append(del);
      if (reason) form.append(el9("p", "hint", reason));
      body.append(form);
    }
    function renderEntity(map, kind, title, body) {
      const list = { culture: map.pack.cultures, religion: map.pack.religions, province: map.pack.provinces }[kind];
      const e = list?.[current.id];
      if (!isLive28(e)) {
        close();
        return;
      }
      const labelOf = { culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" }[kind];
      title.textContent = `${labelOf}\u300C${e.fullName ?? e.name}\u300D`;
      const form = el9("div", "editor-form");
      const stats = [["\u30BB\u30EB\u6570", e.cells], ["\u9762\u7A4D", e.area], ["\u90FD\u5E02\u6570", Array.isArray(e.burgs) ? e.burgs.length : e.burgs]].filter(([, v]) => v != null);
      form.append(table(stats));
      form.append(textField2("\u540D\u524D", e.fullName ?? e.name, (v) => editActions.renameEntity(kind, e.i, v), () => editActions.suggestName(kind, { id: e.i })));
      form.append(...provisionalNote(kind, e.i));
      if (kind === "culture") form.append(nameStyleSection(e.i));
      form.append(noteField(map, kind, e.i));
      body.append(form);
    }
    function techLevelSection(stateId) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u6280\u8853\u6C34\u6E96"));
      const row = el9("div", "tech-level-row");
      const slider2 = document.createElement("input");
      slider2.type = "range";
      slider2.min = String(editActions.TECH_MIN);
      slider2.max = String(editActions.TECH_MAX);
      slider2.step = "1";
      slider2.value = String(editActions.getTechLevel(stateId) ?? 3);
      const value = el9("span", "tech-level-value", slider2.value);
      slider2.addEventListener("input", () => {
        value.textContent = slider2.value;
      });
      slider2.addEventListener("change", () => editActions.setTechLevel(stateId, Number(slider2.value)));
      row.append(slider2, value);
      wrap.append(row);
      wrap.append(el9("p", "hint", "1\uFF08\u4F4E\u3044\uFF09\u301C10\uFF08\u9AD8\u3044\uFF09\u3002\u4EBA\u53E3\u6210\u9577\u7387\u30FB\u7523\u696D\u529B\u306E\u8A08\u7B97\u306B\u4F7F\u308F\u308C\u307E\u3059\u3002"));
      return wrap;
    }
    const UNIT_LABEL2 = { infantry: "\u6B69\u5175", artillery: "\u7832\u5175", armor: "\u6A5F\u7532", air: "\u822A\u7A7A", navy: "\u6D77\u8ECD", special: "\u7279\u6B8A\u90E8\u968A", advanced: "\u5148\u7AEF\u6280\u8853" };
    function doctrineEffects(d) {
      const out = [];
      for (const [k, label] of Object.entries(UNIT_LABEL2)) {
        const m = d.mult?.[k] ?? 1;
        if (Math.abs(m - 1) > 1e-3) out.push({ text: `${label} \xD7${m}`, up: m > 1 });
      }
      if (d.defenseBonus) out.push({ text: `\u5B88\u308B\u3068\u304D\u6226\u529B +${Math.round(d.defenseBonus * 100)}%`, up: true });
      if (d.moraleLoss && d.moraleLoss < 1) out.push({ text: "\u58EB\u6C17\u304C\u5D29\u308C\u306B\u304F\u3044", up: true });
      if (d.moraleLoss && d.moraleLoss > 1) out.push({ text: "\u58EB\u6C17\u304C\u5D29\u308C\u3084\u3059\u3044", up: false });
      if (d.conscriptBonus) out.push({ text: `\u5FB4\u5175 +${Math.round(d.conscriptBonus * 100)}%`, up: true });
      return out;
    }
    function doctrineSection(stateId) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u6226\u8853\u30C9\u30AF\u30C8\u30EA\u30F3"));
      wrap.append(el9("p", "hint", "\u56FD\u5168\u4F53\u306E\u6226\u3044\u65B9\u306E\u65B9\u91DD\uFF08\u90E8\u968A\u3054\u3068\u3067\u306F\u306A\u304F\u56FD\u3054\u3068\u306B1\u3064\uFF09\u3002\u5F97\u610F\u306A\u5175\u79D1\u304C\u5F37\u304F\u306A\u308B\u4EE3\u308F\u308A\u306B\u3001\u5225\u306E\u5175\u79D1\u304C\u5C11\u3057\u5F31\u304F\u306A\u308A\u307E\u3059\u3002"));
      const current2 = editActions.getDoctrine(stateId);
      const list = el9("div", "doctrine-list");
      for (const d of editActions.DOCTRINES) {
        const card = el9("label", `doctrine-card${d.key === current2 ? " on" : ""}`);
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `doctrine-${stateId}`;
        radio.checked = d.key === current2;
        radio.addEventListener("change", () => editActions.setDoctrine(stateId, d.key));
        const body = el9("div", "doctrine-body");
        body.append(el9("strong", "", d.label), el9("p", "hint", d.desc ?? ""), el9("p", "doctrine-merit", `\u{1F44D} \u826F\u3055: ${d.merit ?? ""}`));
        const chips = el9("div", "doctrine-chips");
        for (const e of doctrineEffects(d)) chips.append(el9("span", `doctrine-chip ${e.up ? "up" : "down"}`, e.text));
        if (!chips.children.length) chips.append(el9("span", "doctrine-chip", "\u52B9\u679C\u306E\u504F\u308A\u306A\u3057"));
        body.append(chips);
        card.append(radio, body);
        list.append(card);
      }
      wrap.append(list);
      return wrap;
    }
    function noteField(map, type, id) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u6587\u7AE0"));
      const { text: text2, rich } = htmlToEditable(editActions.getNote(type, id));
      if (rich) {
        wrap.append(el9("p", "hint", "\u66F8\u5F0F\uFF08HTML\uFF09\u3092\u542B\u3080\u6587\u7AE0\u306E\u305F\u3081\u3001\u66F8\u5F0F\u3092\u4FDD\u3063\u305F\u307E\u307E\u6B21\u306E\u3068\u304A\u308A\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002\u30D7\u30EC\u30FC\u30F3\u30C6\u30AD\u30B9\u30C8\u3068\u3057\u3066\u7DE8\u96C6\u3059\u308B\u3068\u66F8\u5F0F\u306F\u5931\u308F\u308C\u307E\u3059\u3002"));
      }
      const ta = document.createElement("textarea");
      ta.className = "note-field";
      ta.value = text2;
      ta.rows = 4;
      ta.addEventListener("change", () => editActions.setNote(type, id, editableToHtml(ta.value, rich)));
      wrap.append(ta);
      return wrap;
    }
    function textField2(label, value, onChange, suggest) {
      const row = el9("label", "field");
      row.append(el9("span", "field-label", label));
      const input = document.createElement("input");
      input.value = value ?? "";
      input.addEventListener("change", () => onChange(input.value));
      if (!suggest) {
        row.append(input);
        return row;
      }
      const box = el9("span", "name-row");
      const dice = el9("button", "suggest-mini", "\u{1F3B2}");
      dice.type = "button";
      dice.title = "\u4EEE\u306E\u540D\u524D\u3092\u751F\u6210\uFF08\u62BC\u3059\u305F\u3073\u306B\u5909\u308F\u308A\u307E\u3059\u3002Undo \u3067\u623B\u305B\u307E\u3059\uFF09";
      dice.addEventListener("click", (ev) => {
        ev.preventDefault();
        const v = suggest();
        if (v) {
          input.value = v;
          onChange(v);
        }
      });
      box.append(input, dice);
      row.append(box);
      return row;
    }
    function provisionalNote(kind, id) {
      return [];
      if (!editActions.isProvisional(kind, id)) return [];
      const box = el9("div", "provisional-note");
      box.append(el9("span", "", "\u{1F3B2} \u4EEE\u306E\u540D\u524D\u3067\u3059\u3002"));
      const ok = el9("button", "", "\u3053\u306E\u540D\u524D\u3067\u78BA\u5B9A");
      ok.type = "button";
      ok.addEventListener("click", () => editActions.confirmName(kind, id));
      box.append(ok);
      return [box];
    }
    function nameStyleSection(cultureId) {
      const wrap = el9("div", "editor-section");
      wrap.append(el9("h4", "", "\u540D\u524D\u306E\u7CFB\u7D71\uFF08\u4EEE\u751F\u6210\u7528\uFF09"));
      const sel = document.createElement("select");
      const explicit = editActions.getNameStyle(cultureId);
      const auto = editActions.effectiveNameStyle(cultureId);
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = `\u81EA\u52D5\uFF08${editActions.NAME_STYLES[auto].label}\uFF09`;
      sel.append(o0);
      for (const k of editActions.STYLE_KEYS) {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = editActions.NAME_STYLES[k].label;
        sel.append(o);
      }
      sel.value = explicit ?? "";
      sel.addEventListener("change", () => editActions.setNameStyle(cultureId, sel.value || null));
      wrap.append(sel);
      wrap.append(el9("p", "hint", "\u3053\u306E\u6587\u5316\u306E\u9818\u57DF\u306B\u4F5C\u308B\u90FD\u5E02\u30FB\u5C5E\u5DDE\u306E\u4EEE\u306E\u540D\u524D\u304C\u3001\u3053\u306E\u7CFB\u7D71\u306E\u97FF\u304D\u306B\u306A\u308A\u307E\u3059\u3002"));
      return wrap;
    }
    function table(rows) {
      const t = document.createElement("table");
      t.className = "editor-table";
      for (const [k, v] of rows) {
        const tr = document.createElement("tr");
        tr.append(el9("th", "", k), el9("td", "", String(v)));
        t.append(tr);
      }
      return t;
    }
    const safeRender = guardRender(root, () => render());
    store.subscribe((state, change) => {
      if (current && change.type === "replace") close();
      else if (current && change.type !== "update" && change.type !== "batch") safeRender();
    });
    return {
      openCell: (id) => open("cell", id),
      openBurg: (id) => open("burg", id),
      openMarker: (id) => open("marker", id),
      openEntity: (kind, id) => open(kind, id),
      close,
      buildDiplomacy,
      promptBurgName(cb, cell) {
        promptDialog("\u65B0\u3057\u3044\u90FD\u5E02\u306E\u540D\u524D", "", {
          suggest: () => editActions.suggestName("burg", { cell }),
          hint: "\u7A7A\u6B04\u306E\u307E\u307E OK \u3092\u62BC\u3059\u3068\u3001\u305D\u306E\u571F\u5730\u306E\u6587\u5316\u306B\u5408\u308F\u305B\u305F\u4EEE\u306E\u540D\u524D\u304C\u4ED8\u304D\u307E\u3059"
        }).then(cb);
      },
      /** wars/alliances/military パネルを後から差し込む（main.js の組み立て順の都合） */
      setPanels(p) {
        panels = p;
      }
    };
  }

  // js/core/sim/battle.js
  function applyLosses(units, fraction) {
    const out = { ...units };
    for (const k of UNIT_KEYS) out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
    return out;
  }
  function clamp5(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  function round(v) {
    return Math.round(v * 100) / 100;
  }
  function simulateBattle(attacker, defender, rnd) {
    const aHardness = forceHardness(attacker.units), dHardness = forceHardness(defender.units);
    const aPower = attackDamage(attacker.units, dHardness, attacker.doctrine, attacker.stateType);
    const dPower = attackDamage(defender.units, aHardness, defender.doctrine, defender.stateType);
    if (aPower <= 0 && dPower <= 0) throw new Error("\u4E21\u8ECD\u3068\u3082\u6226\u529B\u304C\u3042\u308A\u307E\u305B\u3093");
    const noise = () => rnd.float(0.85, 1.15);
    const aRoll = aPower * noise();
    const dRoll = dPower * noise();
    const winner = aRoll >= dRoll ? "attacker" : "defender";
    const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
    let winnerLoss = clamp5(0.03 + 0.09 / ratio, 0.03, 0.12);
    let loserLoss = clamp5(0.4 - 0.25 / ratio, 0.15, 0.4);
    const defBonusOf = (doctrineKey) => DOCTRINE_BY_KEY[doctrineKey]?.defenseBonus ?? 0;
    const defenderBonus = defBonusOf(defender.doctrine);
    if (winner === "attacker") loserLoss *= 1 - defenderBonus;
    else winnerLoss *= 1 - defenderBonus;
    const attackerLoss = winner === "attacker" ? winnerLoss : loserLoss;
    const defenderLoss = winner === "defender" ? winnerLoss : loserLoss;
    return {
      winner,
      aPower: round(aPower),
      dPower: round(dPower),
      attackerLossFraction: attackerLoss,
      defenderLossFraction: defenderLoss,
      attackerCasualties: Math.round(forceHeadcount(attacker.units) * attackerLoss),
      defenderCasualties: Math.round(forceHeadcount(defender.units) * defenderLoss)
    };
  }
  function stateProfile(state) {
    return { doctrine: state.doctrine ?? DEFAULT_DOCTRINE, stateType: state.type ?? "Generic" };
  }
  function planResolveBattle(map, a, b, rnd) {
    const aState = map.pack.states[a.stateId], bState = map.pack.states[b.stateId];
    const aReg = regimentsOf(aState).find((r) => r.i === a.regId);
    const bReg = regimentsOf(bState).find((r) => r.i === b.regId);
    if (!aReg) throw new Error("\u653B\u6483\u5074\u306E\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (!bReg) throw new Error("\u9632\u5FA1\u5074\u306E\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (a.stateId === b.stateId) throw new Error("\u540C\u3058\u56FD\u5BB6\u306E\u90E8\u968A\u3069\u3046\u3057\u3067\u306F\u6226\u95D8\u3067\u304D\u307E\u305B\u3093");
    const result = simulateBattle(
      { units: aReg.u, ...stateProfile(aState) },
      { units: bReg.u, ...stateProfile(bState) },
      rnd
    );
    const parts = [
      setProps(aReg, { u: applyLosses(aReg.u, result.attackerLossFraction) }),
      setProps(bReg, { u: applyLosses(bReg.u, result.defenderLossFraction) })
    ];
    const command = makeCommand(`\u6226\u95D8\uFF08${aReg.name} vs ${bReg.name}\uFF09`, [], parts);
    return { command, result };
  }
  function musterUnits(regiments) {
    const out = Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
    for (const r of regiments) for (const k of UNIT_KEYS) out[k] += r.u?.[k] ?? 0;
    return out;
  }
  function musterHeadcount(regiments) {
    return regiments.reduce((sum, r) => sum + forceHeadcount(r.u), 0);
  }
  function simulateMuster(attackerRegs, defenderRegs, attackerProfile, defenderProfile, rnd) {
    const aUnits = musterUnits(attackerRegs), dUnits = musterUnits(defenderRegs);
    const aHardness = forceHardness(aUnits), dHardness = forceHardness(dUnits);
    const aPower = attackDamage(aUnits, dHardness, attackerProfile.doctrine, attackerProfile.stateType);
    const dPower = attackDamage(dUnits, aHardness, defenderProfile.doctrine, defenderProfile.stateType);
    if (aPower <= 0) throw new Error("\u52D5\u54E1\u3057\u305F\u90E8\u968A\u306B\u6226\u529B\u304C\u3042\u308A\u307E\u305B\u3093");
    if (dPower <= 0) throw new Error("\u9632\u5FA1\u5074\u306B\u6226\u529B\u304C\u3042\u308A\u307E\u305B\u3093");
    const noise = () => rnd.float(0.85, 1.15);
    const aRoll = aPower * noise();
    const dRoll = dPower * noise();
    const winner = aRoll >= dRoll ? "attacker" : "defender";
    const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
    let winnerLoss = clamp5(0.03 + 0.09 / ratio, 0.03, 0.12);
    let loserLoss = clamp5(0.4 - 0.25 / ratio, 0.15, 0.4);
    const defenderBonus = DOCTRINE_BY_KEY[defenderProfile.doctrine]?.defenseBonus ?? 0;
    if (winner === "attacker") loserLoss *= 1 - defenderBonus;
    else winnerLoss *= 1 - defenderBonus;
    const attackerLoss = winner === "attacker" ? winnerLoss : loserLoss;
    const defenderLoss = winner === "defender" ? winnerLoss : loserLoss;
    return {
      winner,
      aPower: round(aPower),
      dPower: round(dPower),
      attackerLossFraction: attackerLoss,
      defenderLossFraction: defenderLoss,
      attackerCasualties: Math.round(musterHeadcount(attackerRegs) * attackerLoss),
      defenderCasualties: Math.round(musterHeadcount(defenderRegs) * defenderLoss),
      attackerRegimentCount: attackerRegs.length,
      defenderRegimentCount: defenderRegs.length
    };
  }
  function planResolveMuster(map, a, b, rnd) {
    const aState = map.pack.states[a.stateId], bState = map.pack.states[b.stateId];
    if (a.stateId === b.stateId) throw new Error("\u540C\u3058\u56FD\u5BB6\u306E\u90E8\u968A\u3069\u3046\u3057\u3067\u306F\u6226\u95D8\u3067\u304D\u307E\u305B\u3093");
    if (!aState || !bState) throw new Error("\u56FD\u5BB6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    const aAll = regimentsOf(aState);
    const attackerRegs = a.regIds.map((id) => aAll.find((r) => r.i === id)).filter(Boolean);
    if (!attackerRegs.length) throw new Error("\u52D5\u54E1\u3059\u308B\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    const firstCell = attackerRegs[0].cell;
    if (attackerRegs.some((r) => r.cell !== firstCell)) throw new Error("\u540C\u3058\u5834\u6240\u306B\u3044\u308B\u90E8\u968A\u3057\u304B\u3001\u307E\u3068\u3081\u3066\u52D5\u54E1\u3067\u304D\u307E\u305B\u3093");
    const bAll = regimentsOf(bState);
    const targetReg = bAll.find((r) => r.i === b.regId);
    if (!targetReg) throw new Error("\u9632\u5FA1\u5074\u306E\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    const defenderRegs = bAll.filter((r) => r.cell === targetReg.cell);
    const result = simulateMuster(attackerRegs, defenderRegs, stateProfile(aState), stateProfile(bState), rnd);
    const parts = [
      ...attackerRegs.map((r) => setProps(r, { u: applyLosses(r.u, result.attackerLossFraction) })),
      ...defenderRegs.map((r) => setProps(r, { u: applyLosses(r.u, result.defenderLossFraction) }))
    ];
    const label = `\u4F1A\u6226\uFF08${aState.name}\u8ECD ${attackerRegs.length}\u90E8\u968A vs ${bState.name}\u8ECD ${defenderRegs.length}\u90E8\u968A\uFF09`;
    const command = makeCommand(label, [], parts);
    return { command, result };
  }

  // js/core/sim/collapse.js
  var isLive29 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var COLLAPSE_RATIO = 0.25;
  var popOf = (s) => (s.rural ?? 0) + (s.urban ?? 0);
  function findCollapse(map) {
    for (const s of map.pack.states) {
      if (!isLive29(s)) continue;
      const peak = s.popPeak ?? 0;
      if (peak > 0 && popOf(s) < peak * COLLAPSE_RATIO) {
        const wars = (map.ext?.data?.wars ?? []).filter((w) => !w.endedAt && (w.attackers.includes(s.i) || w.defenders.includes(s.i)));
        const enemies = /* @__PURE__ */ new Set();
        for (const w of wars) for (const e of w.attackers.includes(s.i) ? w.defenders : w.attackers) if (isLive29(map.pack.states[e])) enemies.add(e);
        const strength = (id) => regimentsOf(map.pack.states[id]).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0);
        const annexer = [...enemies].sort((a, b) => strength(b) - strength(a))[0] ?? null;
        return { stateId: s.i, annexer };
      }
    }
    return null;
  }
  function planNextCollapse(map, date) {
    const c = findCollapse(map);
    if (!c) return null;
    const st = map.pack.states[c.stateId];
    const command = c.annexer != null ? planMergeStates(map, { from: c.stateId, to: c.annexer, date }) : planRemoveEntity(map, "state", c.stateId, { force: true });
    return { command, stateId: c.stateId, annexer: c.annexer, name: st.fullName ?? st.name };
  }

  // js/core/sim/nuclear.js
  var isLive30 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function warheadSpec(tech) {
    const t = Math.max(1, Math.min(10, tech ?? 3));
    const yieldK = 0.06 + 0.012 * t;
    const accuracy = Math.max(0.35, Math.min(0.95, 0.35 + 0.06 * t));
    return {
      yieldK,
      accuracy,
      popLoss: yieldK * (1 - 0.5 * accuracy),
      // 人口の被害（精度が高いほど民間に当たりにくい）
      industryLoss: Math.min(0.5, 0.08 + 0.15 * accuracy + yieldK * 0.5),
      // 産業の被害
      troopLoss: Math.min(0.5, 0.04 + 0.2 * accuracy),
      // 軍隊の被害
      moraleDrop: Math.round(8 + 40 * yieldK)
      // 士気の低下
    };
  }
  function strikeEffects(tech, warheads) {
    const w = warheadSpec(tech), f = (x) => 1 - Math.pow(1 - x, warheads);
    return { ...w, popLossShare: f(w.popLoss), industryLossShare: f(w.industryLoss), troopLossShare: f(w.troopLoss), moraleDropTotal: w.moraleDrop * warheads };
  }
  var listNuclearOps = (map) => map.ext?.data?.nuclearOps ?? [];
  var writeOps = (m, list) => {
    const ext = ensureExt(m);
    ext.data.nuclearOps = list;
    if (!list.length) delete ext.data.nuclearOps;
  };
  var nextId2 = (map) => {
    const l = listNuclearOps(map);
    return l.length ? Math.max(...l.map((o) => o.id)) + 1 : 1;
  };
  function nuclearStock(state) {
    return regimentsOf(state).reduce((n, r) => n + (r.u?.nuclear ?? 0), 0);
  }
  function planDraftNuclearOp(map, { attackerId, targetId, warheads = 1 }) {
    const A = map.pack.states[attackerId], T = map.pack.states[targetId];
    if (!isLive30(A) || !isLive30(T)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
    if (attackerId === targetId) throw new Error("\u81EA\u56FD\u3092\u6A19\u7684\u306B\u306F\u3067\u304D\u307E\u305B\u3093");
    if (!Number.isInteger(warheads) || warheads < 1) throw new Error("\u767A\u6570\u306F1\u4EE5\u4E0A\u306E\u6574\u6570\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (nuclearStock(A) < warheads) throw new Error(`\u4FDD\u6709\u3059\u308B\u6838\u304C\u8DB3\u308A\u307E\u305B\u3093\uFF08\u4FDD\u6709 ${nuclearStock(A)} \u767A\uFF09`);
    const op = { id: nextId2(map), attackerId, targetId, warheads, status: "planned", name: `${officialName(T)}\u653B\u6483\u4F5C\u6226`, executedAt: null, result: null };
    const before = listNuclearOps(map);
    return { command: makeCommand(`\u6838\u4F5C\u6226\u3092\u7ACB\u6848\uFF08${op.name}\uFF09`, [], [{ apply: (m) => writeOps(m, [...before, op]), revert: (m) => writeOps(m, before) }]), id: op.id };
  }
  function planCancelNuclearOp(map, opId) {
    const list = listNuclearOps(map), op = list.find((o) => o.id === opId);
    if (!op) throw new Error("\u305D\u306E\u4F5C\u6226\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (op.status !== "planned") throw new Error("\u5B9F\u884C\u6E08\u307F\u306E\u4F5C\u6226\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093");
    return makeCommand("\u6838\u4F5C\u6226\u3092\u53D6\u308A\u6D88\u3057", [], [{ apply: (m) => writeOps(m, list.filter((o) => o.id !== opId)), revert: (m) => writeOps(m, list) }]);
  }
  function planExecuteNuclearOp(map, opId, date) {
    const list = listNuclearOps(map), op = list.find((o) => o.id === opId);
    if (!op) throw new Error("\u305D\u306E\u4F5C\u6226\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (op.status !== "planned") throw new Error("\u3059\u3067\u306B\u5B9F\u884C\u3055\u308C\u305F\u4F5C\u6226\u3067\u3059");
    const A = map.pack.states[op.attackerId], T = map.pack.states[op.targetId];
    if (!isLive30(A) || !isLive30(T)) throw new Error("\u95A2\u4FC2\u3059\u308B\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (nuclearStock(A) < op.warheads) throw new Error("\u4FDD\u6709\u3059\u308B\u6838\u304C\u8DB3\u308A\u307E\u305B\u3093");
    const parts = [];
    let left = op.warheads;
    for (const r of regimentsOf(A)) {
      if (left <= 0) break;
      const have = r.u?.nuclear ?? 0, use = Math.min(have, left);
      if (use > 0) {
        parts.push(setProps(r, { u: { ...r.u, nuclear: have - use } }));
        left -= use;
      }
    }
    const fx = strikeEffects(A.techLevel ?? 3, op.warheads);
    const pop0 = (T.rural ?? 0) + (T.urban ?? 0);
    let troopsLost = 0;
    for (const r of regimentsOf(T)) {
      const u = { ...r.u };
      for (const k of Object.keys(u)) if (k !== "nuclear") {
        const n = u[k] ?? 0, nn = Math.floor(n * (1 - fx.troopLossShare));
        troopsLost += n - nn;
        u[k] = nn;
      }
      parts.push(setProps(r, { u }));
    }
    const result = {
      populationLoss: Math.round(pop0 * fx.popLossShare * 10) / 10,
      industryLossShare: Math.round(fx.industryLossShare * 100) / 100,
      troopLossShare: Math.round(fx.troopLossShare * 100) / 100,
      troopsLost,
      moraleDrop: fx.moraleDropTotal,
      accuracy: Math.round(fx.accuracy * 100) / 100
    };
    parts.push(setProps(T, {
      popPeak: Math.max(T.popPeak ?? 0, pop0),
      rural: Math.round((T.rural ?? 0) * (1 - fx.popLossShare) * 10) / 10,
      urban: Math.round((T.urban ?? 0) * (1 - fx.popLossShare) * 10) / 10,
      industry: Math.round((T.industry ?? 0) * (1 - fx.industryLossShare) * 10) / 10,
      morale: Math.max(0, (T.morale ?? 70) - fx.moraleDropTotal)
    }));
    const after = list.map((o) => o.id === opId ? { ...o, status: "executed", executedAt: date ?? null, result } : o);
    parts.push({ apply: (m) => writeOps(m, after), revert: (m) => writeOps(m, list) });
    return makeCommand(`\u6838\u4F5C\u6226\u3092\u5B9F\u884C\uFF08${op.name}\uFF09`, ["places"], parts);
  }

  // js/app/sim-actions.js
  function createSimActions({ store, renderer }) {
    const rnd = createRandom(Date.now());
    const rerender = () => renderer.requestRender();
    const withMap = (fn) => {
      const m = store.getState().map;
      return m ? fn(m) : void 0;
    };
    const commitOrThrow = (plan) => {
      if (plan) {
        store.commit(plan);
        rerender();
      }
    };
    const safeRun = (label, fn) => {
      try {
        return fn();
      } catch (e) {
        store.update((s) => {
          s.error = `${label}: ${e.message}`;
        });
        return void 0;
      }
    };
    const currentDate = () => store.getState().map?.worldTime ?? { year: 1, month: 1 };
    const dateLabel = () => {
      const d = currentDate();
      return `${d.year}\u5E74${d.month}\u6708`;
    };
    const capitalCell = (map, stateId) => {
      const b = map.pack.burgs[map.pack.states[stateId]?.capital];
      return b && !b.removed ? b.cell : null;
    };
    const putMarker = (type, icon, cell, name) => {
      const map = store.getState().map;
      if (cell == null || !map || cell < 0 || cell >= map.pack.cells.biome.length) return;
      store.commit(planAddMarker(map, { cell, type, icon, name }).command);
    };
    const regimentCell = (map, ref2) => (map.pack.states[ref2.stateId]?.military ?? []).find((r) => r.i === (ref2.regId ?? ref2.regIds?.[0]))?.cell ?? null;
    const battleName = (map, a, b) => `${dateLabel()} ${map.pack.states[a.stateId].name}\u5BFE${map.pack.states[b.stateId].name}\u306E\u6226\u3044`;
    const runCollapses = () => {
      const names = [];
      for (let guard = 0; guard < 8; guard++) {
        const c = planNextCollapse(store.getState().map, currentDate());
        if (!c) break;
        try {
          store.commit(c.command);
          names.push(c.annexer != null ? `${c.name}\uFF08${store.getState().map.pack.states[c.annexer]?.name}\u3078\u4F75\u5408\uFF09` : `${c.name}\uFF08\u89E3\u4F53\uFF09`);
        } catch {
          break;
        }
      }
      return names;
    };
    return {
      // --- 部隊 ---
      createRegiment(stateId, cell, opts) {
        return withMap((map) => safeRun("\u90E8\u968A\u306E\u7DE8\u6210", () => {
          const r = planCreateRegiment(map, stateId, cell, opts);
          commitOrThrow(r.command);
          return r.id;
        }));
      },
      moveRegiment(stateId, regId, cell) {
        withMap((map) => safeRun("\u90E8\u968A\u306E\u79FB\u52D5", () => commitOrThrow(planMoveRegiment(map, stateId, regId, cell))));
      },
      editRegiment(stateId, regId, patch) {
        withMap((map) => safeRun("\u90E8\u968A\u306E\u7DE8\u96C6", () => commitOrThrow(planEditRegiment(map, stateId, regId, patch))));
      },
      disbandRegiment(stateId, regId) {
        withMap((map) => safeRun("\u90E8\u968A\u306E\u89E3\u6563", () => commitOrThrow(planDisbandRegiment(map, stateId, regId))));
      },
      regimentsOf(stateId) {
        return withMap((map) => regimentsOf(map.pack.states[stateId] ?? {})) ?? [];
      },
      // --- 戦闘 ---
      /** 攻撃を実行し、関連する戦争があれば戦績も記録する。戻り値は戦闘結果（表示用） */
      attack(a, b, warId) {
        return withMap((map) => safeRun("\u6226\u95D8", () => {
          const { command, result } = planResolveBattle(map, a, b, rnd);
          const spot = regimentCell(map, b), title = battleName(map, a, b);
          store.beginBatch(`\u6226\u95D8\uFF08${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}\uFF09`);
          store.commit(command);
          if (warId != null) putMarker("battlefields", "\u2694\uFE0F", spot, title);
          if (warId != null) {
            const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
            if (recCmd) store.commit(recCmd);
          }
          store.endBatch();
          rerender();
          return result;
        }));
      },
      /**
       * 動員会戦：同じ場所にいる複数部隊をまとめて攻撃側として動員し、
       * 狙った部隊がいる場所の防御側全部隊と合算戦力で戦う。
       * @param {{stateId:number, regIds:number[]}} a 動員する自国部隊のID一覧
       * @param {{stateId:number, regId:number}} b 攻撃対象の部隊
       */
      musterAttack(a, b, warId) {
        return withMap((map) => safeRun("\u4F1A\u6226", () => {
          const { command, result } = planResolveMuster(map, a, b, rnd);
          const spot = regimentCell(map, b), title = battleName(map, a, b);
          store.beginBatch(`\u4F1A\u6226\uFF08${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}\uFF09`);
          store.commit(command);
          if (warId != null) putMarker("battlefields", "\u2694\uFE0F", spot, title);
          if (warId != null) {
            const recCmd = planRecordBattle(map, warId, { attackerState: a.stateId, defenderState: b.stateId, result, date: currentDate() });
            if (recCmd) store.commit(recCmd);
          }
          store.endBatch();
          rerender();
          return result;
        }));
      },
      // --- 同盟 ---
      listAlliances() {
        return withMap((map) => listAlliances(map)) ?? [];
      },
      alliancesOf(stateId) {
        return withMap((map) => alliancesOf(map, stateId)) ?? [];
      },
      createAlliance(name, memberIds, bond = "standard", leader = null) {
        return withMap((map) => safeRun("\u540C\u76DF\u306E\u7D50\u6210", () => {
          const r = planCreateAlliance(map, name, memberIds, currentDate(), bond, leader);
          commitOrThrow(r.command);
          return r.id;
        }));
      },
      editAlliance(id, patch) {
        withMap((map) => safeRun("\u540C\u76DF\u306E\u7DE8\u96C6", () => commitOrThrow(planEditAlliance(map, id, patch))));
      },
      dissolveAlliance(id) {
        withMap((map) => safeRun("\u540C\u76DF\u306E\u89E3\u6D88", () => commitOrThrow(planDissolveAlliance(map, id, currentDate()))));
      },
      // --- 戦争・講和 ---
      listWars() {
        return withMap((map) => listWars(map)) ?? [];
      },
      activeWars() {
        return withMap((map) => activeWars(map)) ?? [];
      },
      warsOf(stateId) {
        return withMap((map) => warsOf(map, stateId)) ?? [];
      },
      declareWar(attackers, defenders, name) {
        return withMap((map) => safeRun("\u5BA3\u6226\u5E03\u544A", () => {
          const r = planDeclareWar(map, { name, attackers, defenders, date: currentDate() });
          const war = r.command.label ?? "\u5BA3\u6226\u5E03\u544A";
          store.beginBatch(war);
          try {
            store.commit(r.command);
            const m = store.getState().map;
            putMarker("war", "\u2694\uFE0F", capitalCell(m, attackers[0]), `${dateLabel()} ${listWars(m).find((w) => w.id === r.id)?.name ?? "\u958B\u6226"}\uFF08\u958B\u6226\uFF09`);
          } finally {
            store.endBatch();
          }
          rerender();
          return r.id;
        }));
      },
      /** 戦争開始前の見積もり（招集した部隊でのバー用）。副作用なし */
      previewWar(attackers, defenders, muster, type) {
        return withMap((map) => planWarPreview(map, { attackers, defenders, muster, type }));
      },
      /** 「戦争開始」：招集した部隊で即判定し、戦闘の記録を自動生成する。結果 { id, name, result, joined, endsAt, battles, collapsed } */
      declareWarInstant(attackers, defenders, muster = null, type = "conventional") {
        return withMap((map) => {
          let out;
          safeRun("\u6226\u4E89\u958B\u59CB", () => {
            const r = planDeclareAndResolveWar(map, { attackers, defenders, date: currentDate(), rnd, muster, type });
            store.beginBatch(r.command.label ?? "\u6226\u4E89\u958B\u59CB");
            let collapsed = [];
            try {
              store.commit(r.command);
              putMarker("war", "\u2694\uFE0F", capitalCell(store.getState().map, attackers[0]), `${dateLabel()} ${r.name}`);
              collapsed = runCollapses();
            } finally {
              store.endBatch();
            }
            rerender();
            out = { id: r.id, name: r.name, result: r.result, joined: r.joined, endsAt: r.endsAt, battles: r.battles, collapsed };
          });
          return out;
        });
      },
      suggestTreaty(warId) {
        return withMap((map) => {
          const w = listWars(map).find((x) => x.id === warId);
          return w ? suggestTreaty(map, w) : null;
        });
      },
      suggestCessionChunks(toIds, fromId, opts) {
        return withMap((map) => suggestCessionChunks(map, toIds, fromId, opts)) ?? [];
      },
      treatyBudget(warId, terms) {
        return withMap((map) => {
          const w = listWars(map).find((x) => x.id === warId);
          return w ? treatyBudget(map, w, terms) : [];
        }) ?? [];
      },
      warsOngoing() {
        return withMap((map) => warsOngoing(map)) ?? [];
      },
      /** 戦闘を最後まで進める */
      finishWar(warId) {
        withMap((map) => safeRun("\u6226\u95D8\u3092\u9032\u3081\u308B", () => {
          commitOrThrow(planFinishWar(map, warId));
          runCollapses();
        }));
      },
      /** 月が進むたびの、戦争の損害の展開（時間経過）。崩壊した国名を返す */
      advanceWars(date) {
        return withMap((map) => {
          const c = planAdvanceWars(map, date);
          if (c) store.commit(c);
          return c ? runCollapses() : [];
        }) ?? [];
      },
      runCollapses,
      allianceLeader(a) {
        return leaderOf(a);
      },
      // --- 従属関係（傀儡・保護国・属国） ---
      vassalInfo(stateId) {
        return withMap((map) => vassalInfo(map, stateId)) ?? null;
      },
      setVassal(vassalId, overlordId, kind) {
        withMap((map) => safeRun("\u5F93\u5C5E\u95A2\u4FC2", () => commitOrThrow(planSetVassal(map, vassalId, overlordId, kind, currentDate()))));
      },
      releaseVassal(vassalId) {
        withMap((map) => safeRun("\u72EC\u7ACB", () => commitOrThrow(planReleaseVassal(map, vassalId))));
      },
      // --- 核作戦（立案→実行。通常の戦争では使われない） ---
      nuclearOps() {
        return withMap((map) => listNuclearOps(map)) ?? [];
      },
      strikeEstimate(stateId, warheads) {
        return withMap((map) => strikeEffects(map.pack.states[stateId]?.techLevel ?? 3, warheads));
      },
      nuclearStock(stateId) {
        return withMap((map) => nuclearStock(map.pack.states[stateId])) ?? 0;
      },
      draftNuclearOp(attackerId, targetId, warheads) {
        return withMap((map) => {
          let id;
          safeRun("\u6838\u4F5C\u6226\u306E\u7ACB\u6848", () => {
            const r = planDraftNuclearOp(map, { attackerId, targetId, warheads });
            commitOrThrow(r.command);
            id = r.id;
          });
          return id;
        });
      },
      cancelNuclearOp(id) {
        withMap((map) => safeRun("\u6838\u4F5C\u6226\u306E\u53D6\u308A\u6D88\u3057", () => commitOrThrow(planCancelNuclearOp(map, id))));
      },
      executeNuclearOp(id) {
        withMap((map) => safeRun("\u6838\u4F5C\u6226\u306E\u5B9F\u884C", () => {
          const cmd = planExecuteNuclearOp(map, id, currentDate());
          store.beginBatch(cmd.label ?? "\u6838\u4F5C\u6226\u306E\u5B9F\u884C");
          try {
            store.commit(cmd);
            const op = listNuclearOps(store.getState().map).find((o) => o.id === id);
            putMarker("nuclear", "\u2622\uFE0F", capitalCell(store.getState().map, op.targetId), `${dateLabel()} ${op.name}`);
            const re = planReevaluateWars(store.getState().map, [op.targetId, op.attackerId], `\u2622 ${op.name}\uFF1A${op.warheads}\u767A\u304C\u4F7F\u7528\u3055\u308C\u305F`);
            if (re) store.commit(makeCommand("\u6838\u4F5C\u6226\u306B\u3088\u308B\u6226\u6CC1\u306E\u5909\u5316", [], [re]));
            runCollapses();
          } finally {
            store.endBatch();
          }
          rerender();
        }));
      },
      getCurrency(stateId) {
        return withMap((map) => getCurrency(map.pack.states[stateId]));
      },
      /** 1 from通貨 = ? to通貨 */
      exchangeRate(fromId, toId) {
        return withMap((map) => exchangeRate(map, fromId, toId)) ?? 1;
      },
      setCurrency(stateId, patch) {
        withMap((map) => safeRun("\u901A\u8CA8\u306E\u8A2D\u5B9A", () => {
          store.commit(planSetCurrency(map, stateId, patch));
          rerender();
        }));
      },
      warNameTaken(name, exceptId) {
        return withMap((map) => warNameTaken(map, name, exceptId)) ?? false;
      },
      /** 召集する部隊（{ [国家ID]: [部隊ID...] }）を保存する */
      setMuster(warId, muster) {
        withMap((map) => safeRun("\u90E8\u968A\u306E\u53EC\u96C6", () => {
          store.commit(planSetMuster(map, warId, muster));
          rerender();
        }));
      },
      /** ある国の、その戦争に召集された部隊の合計戦力 */
      musterPower(war, stateId) {
        return withMap((map) => {
          const ids2 = new Set(war.muster?.[stateId] ?? []);
          return Math.round(regimentsOf(map.pack.states[stateId] ?? {}).filter((r) => ids2.has(r.i)).reduce((n, r) => n + forcePower(r.u), 0));
        }) ?? 0;
      },
      /** 戦闘を戦争に記録する（勝敗は利用者が決める。戦力は召集した部隊の合計を一緒に残す） */
      recordBattle(warId, { attackerState, defenderState, winner }) {
        withMap((map) => safeRun("\u6226\u95D8\u306E\u8A18\u9332", () => {
          const war = listWars(map).find((w) => w.id === warId);
          const result = { winner, aPower: this.musterPower(war, attackerState), dPower: this.musterPower(war, defenderState) };
          store.commit(planRecordBattle(map, warId, { attackerState, defenderState, result, date: currentDate() }));
          rerender();
        }));
      },
      renameWar(warId, name) {
        withMap((map) => safeRun("\u6226\u4E89\u540D\u306E\u5909\u66F4", () => commitOrThrow(planRenameWar(map, warId, name))));
      },
      warsAwaitingTreaty() {
        return withMap((map) => warsAwaitingTreaty(map)) ?? [];
      },
      peaceVenue(warId) {
        return withMap((map) => planPeaceVenue(map, warId, rnd));
      },
      peaceSides(war) {
        return peaceSides(war);
      },
      estimatePeace(warId, args) {
        return withMap((map) => estimatePeace(map, warId, args));
      },
      suggestCessions(attackerId, defenderId) {
        return withMap((map) => suggestCessions(map, attackerId, defenderId)) ?? [];
      },
      /** 講和条約を締結する。新しい形式 { kind, cessions, reparations, annex, treatyName, venue, notes } */
      signTreaty(warId, terms) {
        return withMap((map) => {
          let ok = false;
          safeRun("\u8B1B\u548C\u6761\u7D04", () => {
            const war = listWars(map).find((w) => w.id === warId);
            const cmd = planSignTreaty(map, warId, terms, currentDate());
            store.beginBatch(cmd.label ?? "\u8B1B\u548C\u6761\u7D04");
            try {
              store.commit(cmd);
              const to = terms.cessions?.[0]?.toStateId ?? terms.annex?.[0]?.toStateId ?? terms.reparations?.[0]?.toStateId ?? war?.attackers?.[0];
              putMarker("peace", "\u{1F54A}\uFE0F", capitalCell(store.getState().map, to), `${dateLabel()} ${war?.name ?? "\u6226\u4E89"}\u306E\u8B1B\u548C`);
              for (const x of terms.annex ?? []) {
                try {
                  store.commit(planMergeStates(store.getState().map, { from: x.fromStateId, to: x.toStateId, date: currentDate() }));
                } catch (e) {
                }
              }
              runCollapses();
            } finally {
              store.endBatch();
            }
            rerender();
            ok = true;
          });
          return ok;
        }) ?? false;
      },
      /** 旧形式（互換用）：1つの受取国・領域・賠償金 */
      signPeace(warId, terms) {
        withMap((map) => safeRun("\u8B1B\u548C\u6761\u7D04", () => {
          const war = listWars(map).find((w) => w.id === warId);
          const cmd = planSignPeace(map, warId, terms, currentDate());
          store.beginBatch(cmd.label ?? "\u8B1B\u548C\u6761\u7D04");
          try {
            store.commit(cmd);
            putMarker("peace", "\u{1F54A}\uFE0F", capitalCell(store.getState().map, terms.toStateId), `${dateLabel()} ${war?.name ?? "\u6226\u4E89"}\u306E\u8B1B\u548C`);
            runCollapses();
          } finally {
            store.endBatch();
          }
          rerender();
        }));
      }
    };
  }

  // js/core/sim/time.js
  function createWorldTime(year = 1, month = 1) {
    return { year, month };
  }
  function advanceMonth(time) {
    let { year, month } = time;
    month += 1;
    let yearChanged = false;
    if (month > 12) {
      month = 1;
      year += 1;
      yearChanged = true;
    }
    return { time: { year, month }, yearChanged };
  }
  function formatWorldTime(time) {
    return `${time.year}\u5E74 ${time.month}\u6708`;
  }

  // js/app/time-actions.js
  var DEFAULT_MS_PER_MONTH = 2 * 60 * 1e3 / 12;
  function createTimeActions({ store, renderer, simActions = null }) {
    const rates = createRandom(Date.now() ^ 24301);
    let timer = null;
    let msPerMonth = DEFAULT_MS_PER_MONTH;
    function tick() {
      const map = store.getState().map;
      if (!map) return;
      const { time, yearChanged } = advanceMonth(map.worldTime);
      store.update((s) => {
        s.map.worldTime = time;
      });
      simActions?.advanceWars?.(time);
      if (yearChanged) {
        const cmd = planAnnualUpdate(map, rates);
        if (cmd) store.commit(cmd);
        {
          const tc = planTribute(store.getState().map, (st) => getFinance(st).treasury, convert);
          if (tc) store.commit(tc);
        }
        for (let guard = 0; guard < 8; guard++) {
          const m = store.getState().map;
          const c = planNextCollapse(m, time);
          if (!c) break;
          try {
            store.commit(c.command);
          } catch {
            break;
          }
        }
      }
      renderer.requestRender();
    }
    return {
      isRunning: () => timer !== null,
      getSpeed: () => msPerMonth,
      /** 1年あたりのミリ秒で速度を設定する */
      setSpeedPerYear(msPerYear) {
        msPerMonth = Math.max(200, msPerYear / 12);
        if (timer) {
          this.stop();
          this.start();
        }
        store.update((s) => {
          s.timeSpeed = msPerMonth;
        });
      },
      start() {
        if (timer || !store.getState().map) return;
        timer = setInterval(tick, msPerMonth);
        store.update((s) => {
          s.timeRunning = true;
        });
      },
      stop() {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
        store.update((s) => {
          s.timeRunning = false;
        });
      },
      /** 手動で1ヶ月分だけ進める（停止中でも使える） */
      stepMonth() {
        tick();
      },
      /** 現在の年月を直接指定し、そこから始める（進行の巻き戻し・早送りではなく「上書き」）。
       *  年次更新（人口・産業など）は行わない＝単に時計の針をその年月に合わせるだけ。
       *  「江戸時代の1800年から始めたい」のような、シナリオの起点を決める用途を想定。 */
      setWorldTime(year, month = 1) {
        const map = store.getState().map;
        if (!map) return;
        const y = Math.max(1, Math.round(Number(year) || 1));
        const m = Math.min(12, Math.max(1, Math.round(Number(month) || 1)));
        store.update((s) => {
          s.map.worldTime = { year: y, month: m };
        });
        renderer.requestRender();
      },
      /** 新しい地図を読み込んだときに時計をリセットし、進行中なら止める */
      resetForNewMap() {
        this.stop();
        store.update((s) => {
          if (s.map) s.map.worldTime = createWorldTime();
        });
      }
    };
  }

  // js/ui/time-settings-dialog.js
  var el10 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  function openTimeSettingsDialog({ store, timeActions, editActions }) {
    const map = store.getState().map;
    if (!map) return;
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog time-settings-dialog";
    dialog.append(el10("h2", null, "\u6642\u9593\u306E\u8A2D\u5B9A"));
    dialog.append(el10("h3", "dialog-subhead", "\u73FE\u5728\u306E\u5E74\u6708"));
    dialog.append(el10("p", "hint", "1\u30F6\u6708\u305A\u3064\u9032\u3081\u308B\u4EE5\u5916\u306B\u3001\u3053\u3053\u3067\u5E74\u6708\u3092\u76F4\u63A5\u6307\u5B9A\u3057\u3066\u305D\u306E\u6642\u70B9\u304B\u3089\u59CB\u3081\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\u3002"));
    const dateRow = el10("div", "time-settings-row");
    const yearInput = document.createElement("input");
    yearInput.type = "number";
    yearInput.min = "1";
    yearInput.step = "1";
    yearInput.value = String(map.worldTime.year);
    yearInput.setAttribute("aria-label", "\u5E74");
    const yearSuffix = el10("span", "", "\u5E74");
    const monthInput = document.createElement("input");
    monthInput.type = "number";
    monthInput.min = "1";
    monthInput.max = "12";
    monthInput.step = "1";
    monthInput.value = String(map.worldTime.month);
    monthInput.setAttribute("aria-label", "\u6708");
    const monthSuffix = el10("span", "", "\u6708");
    dateRow.append(yearInput, yearSuffix, monthInput, monthSuffix);
    dialog.append(dateRow);
    const applyDateBtn = el10("button", "primary", "\u3053\u306E\u5E74\u6708\u306B\u8A2D\u5B9A\u3059\u308B");
    applyDateBtn.type = "button";
    applyDateBtn.addEventListener("click", () => {
      timeActions.setWorldTime(yearInput.value, monthInput.value);
      renderEraList();
    });
    dialog.append(applyDateBtn);
    dialog.append(el10("h3", "dialog-subhead", "\u6642\u4EE3\u533A\u5206"));
    dialog.append(el10("p", "hint", "\u300C\u25EF\u5E74\u304B\u3089\u25B3\u25B3\u6642\u4EE3\u300D\u3068\u3044\u3046\u5F62\u3067\u3001\u597D\u304D\u306A\u6570\u3060\u3051\u6642\u4EE3\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u3059\u3002\u5E74\u6708\u306E\u8868\u793A\u306B\u3001\u4ECA\u304C\u4F55\u6642\u4EE3\u304B\u304C\u6DFB\u3048\u3089\u308C\u307E\u3059\u3002"));
    const eraList = el10("div", "era-list");
    dialog.append(eraList);
    const newRow = el10("div", "time-settings-row");
    const nameInput = document.createElement("input");
    nameInput.placeholder = "\u6642\u4EE3\u306E\u540D\u524D\uFF08\u4F8B: \u6C5F\u6238\u6642\u4EE3\uFF09";
    const fromInput = document.createElement("input");
    fromInput.type = "number";
    fromInput.min = "1";
    fromInput.step = "1";
    fromInput.placeholder = "\u958B\u59CB\u5E74";
    const fromSuffix = el10("span", "", "\u5E74\u304B\u3089");
    newRow.append(nameInput, fromInput, fromSuffix);
    dialog.append(newRow);
    const eraMsg = el10("p", "hint era-msg", "");
    let editingId = null;
    const addEraBtn = el10("button", "primary", "\u6642\u4EE3\u3092\u8FFD\u52A0");
    addEraBtn.type = "button";
    addEraBtn.addEventListener("click", () => {
      if (!nameInput.value.trim()) {
        eraMsg.textContent = "\u6642\u4EE3\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044";
        nameInput.focus();
        return;
      }
      if (!fromInput.value || Number(fromInput.value) < 1) {
        eraMsg.textContent = "\u958B\u59CB\u5E74\u30921\u4EE5\u4E0A\u306E\u6570\u5B57\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044";
        fromInput.focus();
        return;
      }
      editActions.setEra({ id: editingId ?? void 0, name: nameInput.value, fromYear: fromInput.value });
      nameInput.value = "";
      fromInput.value = "";
      eraMsg.textContent = "";
      editingId = null;
      addEraBtn.textContent = "\u6642\u4EE3\u3092\u8FFD\u52A0";
      renderEraList();
    });
    dialog.append(addEraBtn, eraMsg);
    function renderEraList() {
      eraList.replaceChildren();
      const list = editActions.listEras();
      if (!list.length) {
        eraList.append(el10("p", "muted", "\u307E\u3060\u6642\u4EE3\u306F\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002"));
        return;
      }
      for (const e of list) {
        const row = el10("div", "era-row");
        row.append(el10("span", "era-row-name", `${e.name}\uFF08${e.fromYear}\u5E74\u301C\uFF09`));
        const editBtn = el10("button", "", "\u7DE8\u96C6");
        editBtn.type = "button";
        editBtn.addEventListener("click", () => {
          nameInput.value = e.name;
          fromInput.value = String(e.fromYear);
          editingId = e.id;
          addEraBtn.textContent = "\u3053\u306E\u5185\u5BB9\u3067\u66F4\u65B0";
          eraMsg.textContent = "";
        });
        const delBtn = el10("button", "danger", "\u524A\u9664");
        delBtn.type = "button";
        delBtn.addEventListener("click", () => {
          editActions.removeEra(e.id);
          renderEraList();
        });
        row.append(editBtn, delBtn);
        eraList.append(row);
      }
    }
    renderEraList();
    const actions = el10("div", "confirm-dialog-actions");
    const closeBtn = el10("button", "primary", "\u9589\u3058\u308B");
    closeBtn.type = "button";
    actions.append(closeBtn);
    dialog.append(actions);
    document.body.append(dialog);
    const finish = () => {
      dialog.close();
      dialog.remove();
    };
    closeBtn.addEventListener("click", finish);
    dialog.addEventListener("cancel", finish);
    dialog.showModal();
  }

  // js/ui/time-bar.js
  function initTimeBar({ store, timeActions, editActions }) {
    const toggleBtn = byId("btn-time-toggle");
    const stepBtn = byId("btn-time-step");
    const dateEl = byId("world-date");
    const speedSel = byId("sel-time-speed");
    toggleBtn.addEventListener("click", () => {
      if (timeActions.isRunning()) timeActions.stop();
      else timeActions.start();
    });
    stepBtn.addEventListener("click", () => timeActions.stepMonth());
    speedSel.addEventListener("change", () => timeActions.setSpeedPerYear(Number(speedSel.value)));
    dateEl.addEventListener("click", () => {
      if (store.getState().map) openTimeSettingsDialog({ store, timeActions, editActions });
    });
    function sync() {
      const state = store.getState();
      const hasMap = !!state.map;
      toggleBtn.disabled = !hasMap;
      stepBtn.disabled = !hasMap;
      speedSel.disabled = !hasMap;
      dateEl.disabled = !hasMap;
      const running = !!state.timeRunning;
      toggleBtn.textContent = running ? "\u23F8" : "\u25B6";
      toggleBtn.title = running ? "\u505C\u6B62 (Space)" : "\u958B\u59CB (Space)";
      toggleBtn.classList.toggle("running", running);
      dateEl.replaceChildren();
      if (hasMap) {
        dateEl.append(document.createTextNode(formatWorldTime(state.map.worldTime)));
        const era = editActions?.eraAt ? editActions.eraAt(state.map.worldTime.year) : null;
        if (era) {
          const span = document.createElement("span");
          span.className = "era-name";
          span.textContent = era.name;
          dateEl.append(span);
        }
      } else {
        dateEl.append(document.createTextNode("\u2014"));
      }
    }
    store.subscribe(sync);
    sync();
  }

  // js/ui/panels/military-panel.js
  var el11 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive31 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initMilitaryPanel({ store, simActions, editActions }) {
    const root = byId("tab-regiments");
    let selectedState = null;
    let lockedToState = false;
    const cardCache = /* @__PURE__ */ new Map();
    let pending = null;
    function doctrineOf2(stateId) {
      return editActions.getDoctrine(stateId);
    }
    function doctrineLabelOf(stateId) {
      const key = doctrineOf2(stateId);
      return editActions.DOCTRINES.find((d) => d.key === key)?.label ?? key;
    }
    function hasFocusWithin(card) {
      const a = document.activeElement;
      return !!a && card.contains(a);
    }
    function render() {
      const map = store.getState().map;
      if (!map) {
        root.replaceChildren();
        root.append(el11("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        cardCache.clear();
        return;
      }
      const states = map.pack.states.filter(isLive31);
      if (selectedState == null || !states.some((s) => s.i === selectedState)) selectedState = states[0]?.i ?? null;
      root.replaceChildren();
      const picker = el11("div", "state-picker");
      if (!lockedToState) {
        picker.append(el11("span", "field-label", "\u56FD\u5BB6"));
        const sel = document.createElement("select");
        for (const s of states) {
          const o = document.createElement("option");
          o.value = s.i;
          o.textContent = s.fullName ?? s.name;
          if (s.i === selectedState) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", () => {
          selectedState = Number(sel.value);
          cardCache.clear();
          render();
        });
        picker.append(sel);
      }
      const addBtn = el11("button", pending?.type === "place" ? "primary" : "", pending?.type === "place" ? "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u914D\u7F6E\u2026\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u53D6\u6D88\uFF09" : "\uFF0B \u90E8\u968A\u3092\u7DE8\u6210\uFF08\u81EA\u56FD\u306E\u9818\u571F\u3092\u30AF\u30EA\u30C3\u30AF\uFF09");
      addBtn.type = "button";
      addBtn.addEventListener("click", () => {
        if (pending?.type === "place") {
          pending = null;
          store.update((s) => {
            s.hint = null;
          });
          render();
          return;
        }
        pending = { type: "place", stateId: selectedState };
        store.update((s) => {
          s.hint = "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u90E8\u968A\u3092\u914D\u7F6E\u3059\u308B\u5834\u6240\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044";
        });
        render();
      });
      picker.append(addBtn);
      root.append(picker);
      if (!states.length) {
        root.append(el11("p", "muted", "\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093"));
        cardCache.clear();
        return;
      }
      const list = el11("div", "regiment-list");
      const regs = simActions.regimentsOf(selectedState);
      if (!regs.length) list.append(el11("p", "muted", "\u3053\u306E\u56FD\u306B\u306F\u307E\u3060\u90E8\u968A\u304C\u3042\u308A\u307E\u305B\u3093"));
      const liveIds = new Set(regs.map((r) => r.i));
      for (const id of [...cardCache.keys()]) if (!liveIds.has(id)) cardCache.delete(id);
      for (const r of regs) list.append(getOrBuildCard(map, selectedState, r));
      root.append(list);
    }
    function getOrBuildCard(map, stateId, reg) {
      const cached = cardCache.get(reg.i);
      if (cached && cached.stateId === stateId && hasFocusWithin(cached.el)) {
        patchRegimentCard(map, stateId, reg, cached);
        cached.reg = reg;
        return cached.el;
      }
      const built = buildRegimentCard(map, stateId, reg);
      cardCache.set(reg.i, { el: built, reg, stateId });
      return built;
    }
    function buildRegimentCard(map, stateId, reg) {
      const card = el11("div", "regiment-card mini");
      const head = el11("div", "regiment-card-head");
      const nameInput = document.createElement("input");
      nameInput.value = reg.name;
      nameInput.dataset.field = "name";
      nameInput.className = "mini-name";
      nameInput.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { name: nameInput.value }));
      const isMovePicking = pending && pending.type === "move" && pending.stateId === stateId && pending.regId === reg.i;
      const moveBtn = el11("button", "mini-btn", isMovePicking ? "\u{1F4CD}\u2026" : "\u{1F4CD}");
      moveBtn.dataset.field = "move-btn";
      moveBtn.type = "button";
      moveBtn.title = "\u79FB\u52D5\uFF1A\u62BC\u3057\u3066\u304B\u3089\u3001\u81EA\u56FD\u306E\u9818\u571F\u5185\u306E\u79FB\u52D5\u5148\u3092\u5730\u56F3\u3067\u30AF\u30EA\u30C3\u30AF";
      moveBtn.addEventListener("click", () => {
        pending = { type: "move", stateId, regId: reg.i };
        store.update((s) => {
          s.hint = "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u79FB\u52D5\u5148\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\uFF08\u81EA\u56FD\u306E\u9818\u571F\u5185\uFF09";
        });
        render();
      });
      const disbandBtn = el11("button", "mini-btn danger", "\u89E3\u6563");
      disbandBtn.type = "button";
      disbandBtn.addEventListener("click", async () => {
        if (await confirmDialog(`\u300C${reg.name}\u300D\u3092\u89E3\u6563\u3057\u307E\u3059\u304B\uFF1F`, { danger: true, okLabel: "\u89E3\u6563" })) simActions.disbandRegiment(stateId, reg.i);
      });
      head.append(nameInput, moveBtn, disbandBtn);
      card.append(head);
      const power = el11("p", "regiment-power", `\u6226\u529B ${Math.round(forcePower(reg.u, doctrineOf2(stateId))).toLocaleString()}\u3000\u5175\u54E1 ${forceHeadcount(reg.u).toLocaleString()}`);
      power.dataset.field = "power";
      card.append(power);
      const more = document.createElement("details");
      more.className = "mini-more";
      more.append(el11("summary", "", "\u5175\u529B\u3092\u7DE8\u96C6"));
      const units = el11("div", "regiment-units");
      for (const u of UNIT_TYPES) {
        const field = el11("label", "unit-field");
        field.title = u.desc ?? "";
        field.append(el11("span", "", `${u.icon} ${u.label}\uFF08${u.unit}\uFF09`));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.value = reg.u?.[u.key] ?? 0;
        input.dataset.field = `unit:${u.key}`;
        input.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { u: { [u.key]: Number(input.value) || 0 } }));
        field.append(input);
        units.append(field);
      }
      more.append(units);
      card.append(more);
      return card;
    }
    function patchRegimentCard(map, stateId, reg, cached) {
      const card = cached.el;
      const active = document.activeElement;
      const isActive = (elm) => elm === active;
      const nameInput = card.querySelector('[data-field="name"]');
      if (nameInput && !isActive(nameInput)) nameInput.value = reg.name;
      for (const u of UNIT_TYPES) {
        const input = card.querySelector(`[data-field="unit:${u.key}"]`);
        if (input && !isActive(input)) input.value = reg.u?.[u.key] ?? 0;
      }
      const power = card.querySelector('[data-field="power"]');
      if (power) power.textContent = `\u6226\u529B ${Math.round(forcePower(reg.u, doctrineOf2(stateId))).toLocaleString()}\u3000\u5175\u54E1 ${forceHeadcount(reg.u).toLocaleString()}`;
      const isMovePicking = pending && pending.type === "move" && pending.stateId === stateId && pending.regId === reg.i;
      const moveBtn = card.querySelector('[data-field="move-btn"]');
      if (moveBtn) moveBtn.textContent = isMovePicking ? "\u{1F4CD}\u2026" : "\u{1F4CD}";
    }
    const safeRender = guardRender(root, () => render());
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender();
    });
    return {
      render,
      selectState(id) {
        selectedState = id;
        cardCache.clear();
        render();
      },
      /** 国家タブのサブタブとして開くとき: その国家に固定し、国家セレクタを隠す */
      lockToState(id) {
        lockedToState = true;
        selectedState = id;
        cardCache.clear();
        render();
      },
      unlock() {
        lockedToState = false;
        root.hidden = true;
      },
      get selectedState() {
        return selectedState;
      },
      /** 地図クリックで部隊の配置/移動を待っているか（edit-mode.js から参照） */
      regimentPending() {
        return pending != null;
      },
      /** edit-mode.js から: クリックされたセルを、待ち受け中の配置/移動に使う */
      consumeRegimentPlacement(cell) {
        if (!pending) return false;
        if (pending.type === "place") {
          const id = simActions.createRegiment(pending.stateId, cell, {});
          if (id != null) {
            pending = null;
            store.update((s) => {
              s.hint = null;
            });
            render();
          }
        } else if (pending.type === "move") {
          simActions.moveRegiment(pending.stateId, pending.regId, cell);
          pending = null;
          store.update((s) => {
            s.hint = null;
          });
          render();
        }
        return true;
      },
      cancelPending() {
        if (pending) {
          pending = null;
          store.update((s) => {
            s.hint = null;
          });
          render();
        }
      }
    };
  }

  // js/ui/panels/wars-panel.js
  var el12 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive32 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initWarsPanel({ store, simActions, getOutcome = () => null, getWins = () => null }) {
    const root = byId("tab-wars");
    let selected = null;
    let creating = false;
    let draft = { name: "", attackers: /* @__PURE__ */ new Set(), defenders: /* @__PURE__ */ new Set(), muster: {}, type: "conventional" };
    const stateName = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    function render() {
      root.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        root.append(el12("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive32);
      const wars = simActions.listWars().slice().reverse();
      if (selected != null && !wars.some((w) => w.id === selected)) selected = null;
      const split = el12("div", "win-split");
      const list = el12("div", "win-list");
      const add = el12("button", creating ? "primary" : "", "\uFF0B \u65B0\u3057\u3044\u6226\u4E89\uFF08\u5BA3\u6226\u5E03\u544A\uFF09");
      add.type = "button";
      add.addEventListener("click", () => {
        creating = true;
        selected = null;
        render();
      });
      list.append(add);
      for (const w of wars) {
        const b = el12("button", `${w.id === selected ? "active" : ""}${w.endedAt ? " ended" : ""}`, `${w.endedAt ? "\u{1F54A} " : "\u2694 "}${w.name}`);
        b.type = "button";
        b.addEventListener("click", () => {
          selected = w.id;
          creating = false;
          render();
        });
        list.append(b);
      }
      if (!wars.length) list.append(el12("p", "muted", "\u6226\u4E89\u306E\u8A18\u9332\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093"));
      const detail = el12("div", "win-detail");
      if (creating) detail.append(declareForm(map, states));
      else if (selected != null) detail.append(warDetail(map, states, wars.find((w) => w.id === selected)));
      else detail.append(el12("p", "muted", "\u5DE6\u306E\u4E00\u89A7\u304B\u3089\u6226\u4E89\u3092\u9078\u3076\u304B\u3001\u300C\u65B0\u3057\u3044\u6226\u4E89\u300D\u3067\u5BA3\u6226\u5E03\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002"));
      split.append(list, detail);
      root.append(split);
    }
    const fmt5 = (n) => Math.round(n).toLocaleString("ja-JP");
    function declareForm(map, states) {
      const wrap = el12("div", "editor-section");
      wrap.append(el12("h4", "", "\u6226\u4E89\u306E\u6E96\u5099"));
      wrap.append(el12("p", "hint", "\u2460 \u6226\u4E89\u306E\u5F62\u614B\u3092\u9078\u3073\u3001\u2461 \u653B\u6483\u5074\u30FB\u9632\u5FA1\u5074\u306E\u56FD\u3068\u62DB\u96C6\u3059\u308B\u90E8\u968A\u3092\u9078\u3076\u3068\u3001\u2462 \u4E0B\u306E\u30D0\u30FC\u306B\u6226\u529B\u306E\u6BD4\u8F03\u304C\u51FA\u307E\u3059\u3002\u300C\u6226\u4E89\u958B\u59CB\u300D\u3092\u62BC\u3059\u3068\u3001\u30C9\u30AF\u30C8\u30EA\u30F3\u306B\u57FA\u3065\u304F\u6226\u95D8\u306E\u8A18\u9332\u304C\u4F5C\u3089\u308C\u3001\u6642\u9593\u304C\u9032\u3080\u306B\u3064\u308C\u3066\u640D\u5BB3\u304C\u7A4D\u307F\u91CD\u306A\u308A\u307E\u3059\u3002\u6226\u95D8\u304C\u7D42\u308F\u308B\u3068\u3001\u8B1B\u548C\u6761\u7D04\u3092\u7D50\u3079\u307E\u3059\u3002"));
      const go = el12("button", "danger", "\u2694 \u6226\u4E89\u958B\u59CB");
      go.type = "button";
      const sideBox = (label, key, other) => {
        const box = el12("div", "member-picker");
        box.append(el12("span", "field-label", label));
        for (const s of states) {
          const l = el12("label", "");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = draft[key].has(s.i);
          cb.disabled = draft[other].has(s.i);
          cb.addEventListener("change", () => {
            if (cb.checked) draft[key].add(s.i);
            else draft[key].delete(s.i);
            draft.muster = {};
            render();
          });
          l.append(cb, document.createTextNode(s.fullName ?? s.name));
          box.append(l);
        }
        return box;
      };
      const typeBox = el12("div", "war-type-list");
      for (const T of Object.values(WAR_TYPES)) {
        const l = el12("label", `doctrine-card${draft.type === T.key ? " on" : ""}`);
        const rb = document.createElement("input");
        rb.type = "radio";
        rb.name = "war-type";
        rb.checked = draft.type === T.key;
        rb.addEventListener("change", () => {
          draft.type = T.key;
          render();
        });
        const body = el12("div", "doctrine-body");
        body.append(el12("strong", "", T.label), el12("p", "hint", T.desc));
        l.append(rb, body);
        typeBox.append(l);
      }
      wrap.append(el12("h4", "", "\u6226\u4E89\u306E\u5F62\u614B"), typeBox);
      wrap.append(sideBox("\u653B\u6483\u5074", "attackers", "defenders"), sideBox("\u9632\u5FA1\u5074", "defenders", "attackers"));
      const ids2 = [...draft.attackers, ...draft.defenders];
      const musterBox = el12("div", "muster-box");
      for (const id of ids2) {
        const st = map.pack.states[id];
        const regs = Array.isArray(st.military) ? st.military : [];
        if (!draft.muster[id]) draft.muster[id] = regs.map((r) => r.i);
        const row = el12("div", "muster-state");
        row.append(el12("strong", "", `${st.fullName ?? st.name}\uFF08${draft.attackers.has(id) ? "\u653B\u6483\u5074" : "\u9632\u5FA1\u5074"}\uFF09`));
        if (!regs.length) row.append(el12("span", "muted", "\u3000\u90E8\u968A\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u6226\u529B0\uFF09"));
        for (const r of regs) {
          const l = el12("label", "muster-reg");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = draft.muster[id].includes(r.i);
          cb.addEventListener("change", () => {
            const set = new Set(draft.muster[id]);
            if (cb.checked) set.add(r.i);
            else set.delete(r.i);
            draft.muster[id] = [...set];
            render();
          });
          const men = Object.entries(r.u ?? {}).filter(([k]) => k !== "nuclear").reduce((n, [, v]) => n + (Number(v) || 0), 0);
          l.append(cb, document.createTextNode(` ${r.name}\uFF08\u5175\u529B ${fmt5(men)}\uFF09`));
          row.append(l);
        }
        musterBox.append(row);
      }
      if (ids2.length) wrap.append(el12("h4", "", "\u62DB\u96C6\u3059\u308B\u90E8\u968A"), draft.type === "total" ? el12("p", "hint", "\u7DCF\u529B\u6226\u3067\u306F\u3001\u53C2\u6226\u3059\u308B\u56FD\u306E\u3059\u3079\u3066\u306E\u90E8\u968A\u304C\u6226\u3044\u307E\u3059\u3002") : musterBox);
      const preview = draft.attackers.size && draft.defenders.size ? simActions.previewWar([...draft.attackers], [...draft.defenders], draft.muster, draft.type) : null;
      if (preview) {
        const o = getOutcome();
        if (preview.joined?.length) wrap.append(el12("p", "hint", `\u540C\u76DF\u306E\u62D8\u675F\u306B\u3088\u308A\u53C2\u6226: ${preview.joined.map((j) => `${stateName(map, j.id)}\uFF08${j.alliance}\uFF09`).join("\u3001")}`));
        wrap.append(o?.bars(preview) ?? el12("p", "muted", ""));
      }
      go.disabled = !draft.attackers.size || !draft.defenders.size;
      go.addEventListener("click", () => {
        const out = simActions.declareWarInstant([...draft.attackers], [...draft.defenders], draft.muster, draft.type);
        if (!out) return;
        selected = out.id;
        creating = false;
        draft = { name: "", attackers: /* @__PURE__ */ new Set(), defenders: /* @__PURE__ */ new Set(), muster: {}, type: "conventional" };
        render();
        if (out.collapsed?.length) alertDialog?.(`\u4EBA\u53E3\u306E\u5927\u90E8\u5206\u3092\u5931\u3044\u3001\u56FD\u5BB6\u304C\u5D29\u58CA\u3057\u307E\u3057\u305F\uFF1A${out.collapsed.join("\u3001")}`);
        getWins()?.open("war");
      });
      wrap.append(go);
      return wrap;
    }
    function warDetail(map, states, w) {
      const box = el12("div", `war-card${w.endedAt ? " ended" : ""}`);
      const nameIn = document.createElement("input");
      nameIn.value = w.name;
      nameIn.className = "war-name-input";
      nameIn.addEventListener("change", () => simActions.renameWar(w.id, nameIn.value));
      box.append(el12("label", "field-label", "\u6226\u4E89\u306E\u540D\u524D"), nameIn);
      const sit = getOutcome()?.situation(map, w);
      if (sit) box.append(sit);
      const typeName = WAR_TYPES[w.type]?.label ?? "\u901A\u5E38\u6226";
      box.append(el12("p", "hint", `\u5F62\u614B\uFF1A${typeName}`));
      if (w.progress != null && !w.endedAt) {
        const bar = el12("div", "wo-bar");
        const f = el12("div", "wo-bar-a");
        f.style.width = `${Math.round(w.progress * 100)}%`;
        bar.append(f);
        box.append(el12("label", "field-label", `\u6226\u95D8\u306E\u9032\u884C ${Math.round(w.progress * 100)}%\uFF08\u6642\u9593\u304C\u9032\u3080\u3068\u640D\u5BB3\u304C\u7A4D\u307F\u91CD\u306A\u308A\u307E\u3059\uFF09`), bar);
      }
      const now = map.worldTime ?? { year: 0, month: 0 };
      const reached = (d) => !d || w.progress != null && w.progress >= 1 || w.endedAt || d.year * 12 + d.month <= now.year * 12 + now.month;
      const shown = (w.battles ?? []).filter((b) => reached(b.date));
      if (shown.length) {
        box.append(el12("h4", "", "\u6226\u95D8\u306E\u8A18\u9332"));
        const log = el12("ol", "battle-log");
        for (const b of shown) log.append(el12("li", "", `${b.date ? `${b.date.year}\u5E74${b.date.month}\u6708\u3000` : ""}${b.name}\u3000${b.text}`));
        box.append(log);
      }
      if (w.endedAt) {
        box.append(el12("p", "muted", `\u3053\u306E\u6226\u4E89\u306F\u7D42\u7D50\u3057\u307E\u3057\u305F\u3002${w.treatyName ? `\u8B1B\u548C\u6761\u7D04\uFF1A${w.treatyName}` : ""}`));
      } else if (w.progress != null && w.progress < 1) {
        const fin = el12("button", "", "\u6226\u95D8\u3092\u6700\u5F8C\u307E\u3067\u9032\u3081\u308B");
        fin.type = "button";
        fin.addEventListener("click", () => simActions.finishWar(w.id));
        box.append(fin);
      } else {
        const go = el12("button", "primary", "\u8B1B\u548C\u6761\u7D04\u3092\u6C7A\u3081\u308B");
        go.type = "button";
        go.addEventListener("click", () => getWins()?.open("treaty"));
        box.append(go);
      }
      return box;
    }
    const safeRender = guardRender(root, () => render());
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender();
    });
    return { render };
  }

  // js/ui/war-outcome-window.js
  var el13 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive33 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  var pct = (v) => `${Math.round(v * 100)}%`;
  var fmt4 = (n, d = 0) => Number(n).toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d });
  var fmtDate2 = (d) => d ? `${d.year}\u5E74${d.month}\u6708` : "\u2014";
  function initWarOutcome({ store, simActions }) {
    const sname = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    const names = (map, ids2) => ids2.map((i) => sname(map, i)).join("\u30FB");
    function bar(label, aShare, aText, dText) {
      const wrap = el13("div", "wo-bar-wrap");
      const row = el13("div", "wo-bar-row");
      const none = aText === "0" && dText === "0";
      row.append(el13("span", "wo-bar-val a", none ? "\u2014" : aText), el13("span", "wo-bar-label", label), el13("span", "wo-bar-val d", none ? "\u2014" : dText));
      const track = el13("div", "wo-bar");
      const a = el13("div", "wo-bar-a");
      a.style.width = pct(aShare);
      const d = el13("div", "wo-bar-d");
      d.style.width = pct(1 - aShare);
      track.append(a, d);
      wrap.append(row, track);
      return wrap;
    }
    function bars(r) {
      const A = r.aStrength, D = r.dStrength, c = r.compare, n = (v) => fmt4(v);
      const box = el13("div", "wo-bars");
      box.append(bar("\u9678\u8ECD\u529B", c.land, n(A.land), n(D.land)), bar("\u5236\u6D77\u6A29", c.sea, n(A.sea), n(D.sea)), bar("\u5236\u7A7A\u6A29", c.air, n(A.air), n(D.air)), bar("\u58EB\u6C17", c.morale, fmt4(A.morale), fmt4(D.morale)));
      if (A.support != null && c.support != null) box.append(bar("\u6C11\u610F", c.support, fmt4(A.support), fmt4(D.support)));
      return box;
    }
    function situation(map, war) {
      const box = el13("div", "wo-situation");
      const sides = el13("div", "wo-sides");
      sides.append(el13("div", "wo-side a", names(map, war.attackers)), el13("div", "wo-vs", "VS"), el13("div", "wo-side d", names(map, war.defenders)));
      box.append(sides);
      const ongoing = war.progress != null && war.progress < 1 && !war.endedAt;
      const r0 = war.result;
      if (!r0) {
        box.append(el13("p", "muted", "\u6226\u6CC1\u306E\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u65E7\u30C7\u30FC\u30BF\u306E\u6226\u4E89\u3067\u3059\uFF09"));
        return box;
      }
      const r = ongoing ? { ...r0, ...simActions.previewWar(war.attackers, war.defenders, war.muster && Object.keys(war.muster).length ? war.muster : null, war.type) ?? {} } : r0;
      box.append(bars(r));
      if (ongoing) box.append(el13("p", "hint", "\u6226\u95D8\u306E\u3055\u306A\u304B\u3067\u3059\u3002\u52DD\u6557\u306F\u3001\u6226\u95D8\u304C\u7D42\u308F\u308B\u3068\u660E\u3089\u304B\u306B\u306A\u308A\u307E\u3059\u3002"));
      else {
        if (r.victory) box.append(el13("p", "hint", `\u52DD\u5229\u6761\u4EF6\uFF1A${r.victory.text}`));
        box.append(el13("div", `wo-verdict ${r.winner}`, r.winner === "attacker" ? `\u653B\u6483\u5074\u306E\u52DD\u5229\uFF08${names(map, war.attackers)}\uFF09` : r.winner === "defender" ? `\u9632\u885B\u5074\u306E\u52DD\u5229\uFF08${names(map, war.defenders)}\uFF09` : "\u6C7A\u7740\u3064\u304B\u305A\uFF08\u81A0\u7740\uFF09"));
      }
      const dates = ongoing ? `\u958B\u6226 ${fmtDate2(war.startedAt)}\u3000\u7D42\u6226\u4E88\u5B9A ${fmtDate2(war.endsAt)}\uFF08\u7D04${war.durationMonths ?? "?"}\u30F6\u6708\uFF09` : `\u958B\u6226 ${fmtDate2(war.startedAt)}\u3000\u7D42\u6226 ${fmtDate2(war.endedAt ?? war.endsAt)}${r.warScore != null ? `\u3000\u6226\u4E89\u30B9\u30B3\u30A2 ${r.warScore}` : ""}`;
      box.append(el13("p", "hint", dates));
      if (war.joinedAllies?.length) box.append(el13("p", "hint", `\u540C\u76DF\u306E\u62D8\u675F\u306B\u3088\u308A\u53C2\u6226: ${war.joinedAllies.map((j) => `${sname(map, j.id)}\uFF08${j.alliance}\u30FB${j.side === "attacker" ? "\u653B\u6483\u5074" : "\u9632\u885B\u5074"}\uFF09`).join("\u3001")}`));
      return box;
    }
    const treatyBody = el13("div", "treaty-body");
    let sel = null;
    let draft = null;
    function renderTreaty() {
      treatyBody.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        treatyBody.append(el13("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const all = simActions.listWars().slice().reverse().filter((w) => w.result);
      if (!all.length) {
        treatyBody.append(el13("p", "muted", "\u8B1B\u548C\u6761\u7D04\u3092\u7D50\u3079\u308B\u6226\u4E89\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u6226\u4E89\u30A6\u30A3\u30F3\u30C9\u30A6\u3067\u6226\u4E89\u3092\u59CB\u3081\u308B\u3068\u3001\u6226\u95D8\u304C\u7D42\u308F\u3063\u305F\u3042\u3068\u306B\u3053\u3053\u3067\u8B1B\u548C\u6761\u7D04\u3092\u6C7A\u3081\u3089\u308C\u307E\u3059\u3002"));
        sel = null;
        draft = null;
        return;
      }
      if (!all.some((w) => w.id === sel)) {
        sel = (all.find((w) => !w.endedAt) ?? all[0]).id;
        draft = null;
      }
      const split = el13("div", "win-split"), list = el13("div", "win-list");
      for (const w of all) {
        const icon = w.endedAt ? "\u2705" : w.progress != null && w.progress < 1 ? "\u23F3" : "\u{1F4DC}";
        const b = el13("button", w.id === sel ? "active" : "", `${icon} ${w.endedAt && w.treatyName ? w.treatyName : w.name}`);
        b.type = "button";
        b.title = w.endedAt ? "\u7DE0\u7D50\u6E08\u307F\u306E\u6761\u7D04\uFF08\u4E2D\u8EAB\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\uFF09" : w.progress != null && w.progress < 1 ? "\u6226\u95D8\u4E2D" : "\u8B1B\u548C\u5F85\u3061";
        b.addEventListener("click", () => {
          sel = w.id;
          draft = null;
          renderTreaty();
        });
        list.append(b);
      }
      const detail = el13("div", "win-detail");
      const war = all.find((w) => w.id === sel);
      if (war.endedAt) detail.append(treatyRecord(map, war));
      else if (war.progress != null && war.progress < 1) {
        detail.append(el13("h4", "", war.name), situation(map, war));
        detail.append(el13("p", "hint", `\u6226\u95D8\u304C\u7D9A\u3044\u3066\u3044\u307E\u3059\uFF08\u9032\u884C ${pct(war.progress)}\uFF09\u3002\u6642\u9593\u304C\u9032\u3080\u3068\u640D\u5BB3\u304C\u7A4D\u307F\u91CD\u306A\u308A\u3001\u7D42\u308F\u308B\u3068\u8B1B\u548C\u6761\u7D04\u3092\u7D50\u3079\u307E\u3059\u3002`));
        const go = el13("button", "primary", "\u6226\u95D8\u3092\u6700\u5F8C\u307E\u3067\u9032\u3081\u308B");
        go.type = "button";
        go.addEventListener("click", () => simActions.finishWar(war.id));
        detail.append(go);
      } else detail.append(treatyForm(map, war));
      split.append(list, detail);
      treatyBody.append(split);
    }
    function treatyRecord(map, war) {
      const t = war.terms ?? {}, box = el13("div", "treaty-record");
      box.append(el13("h3", "", war.treatyName ?? t.treatyName ?? "\u8B1B\u548C\u6761\u7D04"));
      const kindLabel = { standard: "\u901A\u5E38\u306E\u8B1B\u548C", white: "\u767D\u7D19\u548C\u5E73", vassal: "\u5F93\u5C5E\u5316", annex: "\u5168\u9762\u964D\u4F0F\uFF08\u4F75\u5408\uFF09" }[t.kind ?? "standard"];
      const lines = [
        ["\u6226\u4E89", `${war.name}\uFF08${warTypeLabel(war.type)}\uFF09`],
        ["\u7A2E\u985E", kindLabel],
        ["\u7DE0\u7D50", `${fmtDate2(t.signedAt ?? war.endedAt)}`],
        ["\u8B1B\u548C\u5730", t.venue ? `${t.venue.place}\uFF08${t.venue.stateId ? sname(map, t.venue.stateId) : ""}\uFF09` : "\u2014"],
        ["\u4EA4\u6226\u56FD", `${names(map, war.attackers)} \uFF0F ${names(map, war.defenders)}`],
        ["\u6226\u4E89\u30B9\u30B3\u30A2", t.score ? `${t.score.total}` : "\u2014"]
      ];
      const tb = el13("table", "win-table");
      for (const [k, v] of lines) {
        const tr = el13("tr");
        tr.append(el13("th", "", k), el13("td", "", v));
        tb.append(tr);
      }
      box.append(tb);
      box.append(el13("h4", "", "\u5272\u8B72"));
      if (t.cessions?.length) {
        const ul = el13("ul");
        for (const c of t.cessions) ul.append(el13("li", "", `${c.name || "\u533A\u753B"}\uFF08${c.cells}\u30BB\u30EB${c.burgs?.length ? `\u30FB\u90FD\u5E02: ${c.burgs.join("\u3001")}` : ""}\uFF09\uFF1A${sname(map, c.fromStateId)} \u2192 ${sname(map, c.toStateId)}`));
        box.append(ul);
      } else box.append(el13("p", "muted", "\u306A\u3057"));
      box.append(el13("h4", "", "\u8CE0\u511F\u91D1"));
      if (t.reparations?.length) {
        const ul = el13("ul");
        for (const r of t.reparations) ul.append(el13("li", "", `${sname(map, r.fromStateId)} \u304C ${fmt4(r.amount, 2)} ${r.currency} \u3092\u652F\u6255\u3044 \u2192 ${sname(map, r.toStateId)} \u304C ${fmt4(r.received, 2)} ${r.receivedCurrency} \u3092\u53D7\u3051\u53D6\u308A`));
        box.append(ul);
      } else box.append(el13("p", "muted", "\u306A\u3057"));
      if (t.vassalize?.length) {
        box.append(el13("h4", "", "\u5F93\u5C5E\u5316"));
        const ul = el13("ul");
        for (const x of t.vassalize) ul.append(el13("li", "", `${sname(map, x.fromStateId)} \u306F ${sname(map, x.toStateId)} \u306E${VASSAL_BY_KEY[x.kind]?.label ?? x.kind}\u306B\u306A\u308B`));
        box.append(ul);
      }
      if (t.annex?.length) {
        box.append(el13("h4", "", "\u4F75\u5408"));
        const ul = el13("ul");
        for (const x of t.annex) ul.append(el13("li", "", `${sname(map, x.fromStateId)} \u306F ${sname(map, x.toStateId)} \u306B\u4F75\u5408`));
        box.append(ul);
      }
      if (t.notes) box.append(el13("h4", "", "\u305D\u306E\u4ED6\u306E\u6761\u4EF6"), el13("p", "", t.notes));
      box.append(el13("h4", "", "\u6226\u4E89\u306E\u7D4C\u904E"), situation(map, war));
      return box;
    }
    const warTypeLabel = (k) => ({ limited: "\u9650\u5B9A\u6226", conventional: "\u901A\u5E38\u6226", total: "\u7DCF\u529B\u6226", asymmetric: "\u975E\u5BFE\u79F0\u6226" })[k] ?? "\u901A\u5E38\u6226";
    const isLeader = (id) => simActions.listAlliances().some((a) => !a.dissolvedAt && a.members.includes(id) && simActions.allianceLeader(a) === id);
    function treatyForm(map, war) {
      const { winners, losers, stalemate } = simActions.peaceSides(war);
      if (!draft || draft.warId !== war.id) {
        const venue = simActions.peaceVenue(war.id), sug2 = simActions.suggestTreaty(war.id);
        draft = { warId: war.id, venue, treatyName: venue?.treatyName ?? `${war.name}\u306E\u8B1B\u548C\u6761\u7D04`, kind: sug2?.kind ?? "standard", size: "m", sug: sug2, cessions: null, reparations: null, notes: "" };
      }
      const wrap = el13("div", "treaty-form");
      const wn = document.createElement("input");
      wn.value = war.name;
      wn.addEventListener("change", () => {
        simActions.renameWar(war.id, wn.value);
      });
      wrap.append(el13("label", "field-label", "\u6226\u4E89\u306E\u540D\u524D"), wn, situation(map, war));
      const sug = draft.sug;
      if (sug) {
        const t = el13("table", "win-table");
        const h = el13("tr");
        for (const x of ["\u56FD", "\u7ACB\u5834", "\u5175\u529B\u306E\u640D\u5931", "\u640D\u5931\u306E\u5272\u5408", "\u58EB\u6C17\u306E\u5909\u52D5", "\u6C11\u610F\u306E\u5909\u52D5"]) h.append(el13("th", "", x));
        t.append(h);
        for (const e of sug.exhaustion) {
          const tr = el13("tr");
          const frac = e.before > 0 ? e.lost / e.before : 0;
          tr.append(el13("td", "", sname(map, e.stateId)), el13("td", "", e.side === "winner" ? "\u52DD\u8005\u5074" : "\u6557\u8005\u5074"), el13("td", "", `${fmt4(e.lost)} \u4EBA`), el13("td", "", pct(frac)), el13("td", e.moraleDelta >= 0 ? "cur-chg up" : "cur-chg down", `${e.moraleDelta >= 0 ? "+" : ""}${e.moraleDelta}`), el13("td", (e.supportDelta ?? 0) >= 0 ? "cur-chg up" : "cur-chg down", `${(e.supportDelta ?? 0) >= 0 ? "+" : ""}${e.supportDelta ?? 0}`));
          t.append(tr);
        }
        wrap.append(el13("h4", "", "\u5404\u56FD\u306E\u6D88\u8017"), t);
        wrap.append(el13("p", "hint", `\u6226\u4E89\u30B9\u30B3\u30A2 ${sug.warScore}\uFF08\u52DD\u8005\u306F\u3053\u306E\u7BC4\u56F2\u3067\u3057\u304B\u8981\u6C42\u3067\u304D\u307E\u305B\u3093\u3002\u52DD\u8005\u304C\u8907\u6570\u306A\u3089\u3001\u6226\u529B\u3078\u306E\u8CA2\u732E\u306B\u5FDC\u3058\u3066\u5206\u3051\u5408\u3044\u307E\u3059\uFF09`));
      }
      const kinds = [["standard", "\u901A\u5E38\u306E\u8B1B\u548C\uFF08\u5272\u8B72\u30FB\u8CE0\u511F\uFF09"], ["white", "\u767D\u7D19\u548C\u5E73\uFF08\u6761\u4EF6\u306A\u3057\uFF09"], ["vassal", "\u5F93\u5C5E\u5316\uFF08\u5080\u5121\u30FB\u4FDD\u8B77\u56FD\u30FB\u5C5E\u56FD\u306B\u3059\u308B\uFF09"], ["annex", "\u5168\u9762\u964D\u4F0F\uFF08\u6557\u8005\u3092\u4F75\u5408\u3002\u6226\u4E89\u30B9\u30B3\u30A285\u4EE5\u4E0A\uFF09"]];
      const kindRow = el13("div", "member-picker");
      for (const [k, label] of kinds) {
        const l = el13("label", "");
        const rb = document.createElement("input");
        rb.type = "radio";
        rb.name = "treaty-kind";
        rb.checked = draft.kind === k;
        rb.addEventListener("change", () => {
          draft.kind = k;
          renderTreaty();
        });
        l.append(rb, document.createTextNode(` ${label}`));
        kindRow.append(l);
      }
      wrap.append(el13("h4", "", "\u8B1B\u548C\u306E\u7A2E\u985E"), kindRow);
      const v = draft.venue;
      const roleLabel = v?.role === "winner" ? "\u6226\u52DD\u56FD" : v?.role === "mediator" ? "\u4EF2\u4ECB\u56FD\uFF08\u4E2D\u7ACB\uFF09" : "\u4EA4\u6226\u56FD";
      const venueLine = el13("p", "hint", v ? `\u8B1B\u548C\u5730\uFF1A${v.place}\uFF08${sname(map, v.stateId)}\u30FB${roleLabel}\uFF09` : "\u8B1B\u548C\u5730\u3092\u6C7A\u3081\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u90FD\u5E02\u304C\u3042\u308A\u307E\u305B\u3093\uFF09");
      const again = el13("button", "", "\u5225\u306E\u5730\u3067\u958B\u304F");
      again.type = "button";
      again.addEventListener("click", () => {
        const nv = simActions.peaceVenue(war.id);
        if (nv) {
          draft.venue = nv;
          draft.treatyName = nv.treatyName;
          renderTreaty();
        }
      });
      const tn = document.createElement("input");
      tn.value = draft.treatyName;
      tn.addEventListener("input", () => {
        draft.treatyName = tn.value;
      });
      wrap.append(el13("label", "field-label", "\u8B1B\u548C\u6761\u7D04\u306E\u540D\u524D\uFF08\u8B1B\u548C\u5730\u306E\u5730\u540D\u304B\u3089\uFF09"), tn, venueLine, again);
      const detail = el13("div", "treaty-detail");
      wrap.append(detail);
      const meter = el13("div", "wo-impact");
      const impact = el13("div", "wo-impact");
      const annexTargets = () => losers.map((L) => ({ fromStateId: L, toStateId: winners[0] }));
      draft.vkind ?? (draft.vkind = "vassal");
      const vassalTargets = () => losers.map((L) => ({ fromStateId: L, toStateId: winners[0], kind: draft.vkind }));
      function ensureCessions() {
        if (draft.cessions) return;
        draft.cessions = [];
        for (const L of losers) {
          const chunks = simActions.suggestCessionChunks(winners, L, { size: draft.size });
          let sum = 0;
          const want = draft.sug?.cessionByLoser?.[L] ?? 0;
          for (const c of chunks) {
            const on = sum < want;
            if (on) sum += c.cells;
            draft.cessions.push({ ...c, key: `${L}:${c.regionCells[0]}`, on });
          }
        }
      }
      function ensureRepar() {
        if (draft.reparations) return;
        draft.reparations = {};
        for (const r of draft.sug?.reparations ?? []) draft.reparations[`${r.fromStateId}-${r.toStateId}`] = r.amount;
      }
      const currentTerms = () => ({
        kind: draft.kind,
        cessions: draft.kind === "standard" ? (draft.cessions ?? []).filter((c) => c.on).map((c) => ({ cells: c.regionCells, fromStateId: c.fromStateId, toStateId: c.toStateId, name: c.name })) : [],
        reparations: draft.kind === "standard" ? Object.entries(draft.reparations ?? {}).filter(([, a]) => a > 0).map(([k, amount]) => {
          const [f, t] = k.split("-").map(Number);
          return { fromStateId: f, toStateId: t, amount };
        }) : [],
        annex: draft.kind === "annex" ? annexTargets() : [],
        vassalize: draft.kind === "vassal" ? vassalTargets() : []
      });
      function renderMeter() {
        meter.replaceChildren();
        const terms = currentTerms();
        const rows = simActions.treatyBudget(war.id, terms);
        const t = el13("table", "win-table");
        const h = el13("tr");
        for (const x of ["\u52DD\u8005", "\u53D6\u308A\u5206", "\u8981\u6C42\u306E\u8CBB\u7528 / \u4E0A\u9650\uFF08\u6226\u4E89\u30B9\u30B3\u30A2\uFF09"]) h.append(el13("th", "", x));
        t.append(h);
        for (const r of rows) {
          const tr = el13("tr");
          const over = r.spent > r.budget + 0.05;
          tr.append(el13("td", "", `${isLeader(r.stateId) ? "\u2605 " : ""}${sname(map, r.stateId)}`), el13("td", "", pct(r.share)), el13("td", over ? "cur-chg down" : "", `${fmt4(r.spent, 1)} / ${fmt4(r.budget, 1)}${over ? "\u3000\u26A0 \u8D85\u904E" : ""}`));
          t.append(tr);
        }
        meter.append(el13("h4", "", "\u6226\u4E89\u30B9\u30B3\u30A2\u306E\u4F7F\u3044\u9053"), t);
        impact.replaceChildren();
        const lines = [];
        for (const L of losers) {
          const mine = terms.cessions.filter((c) => c.fromStateId === L);
          const r = simActions.estimatePeace(war.id, { loserId: L, cellGroups: mine.map((c) => c.cells), reparations: terms.reparations.filter((x) => x.fromStateId === L).reduce((n, x) => n + x.amount, 0) });
          if (!r) continue;
          lines.push([`${sname(map, L)}\u304B\u3089`, `${fmt4(r.cells)}\u30BB\u30EB\uFF08\u9818\u571F\u306E ${pct(r.share)}\uFF09\u30FB\u4EBA\u53E3 \u7D04${fmt4(r.population, 1)}\u5343\u4EBA\u30FB\u7523\u696D ${fmt4(r.industry, 1)}\u30FB\u90FD\u5E02 ${fmt4(r.burgs)}\u4EF6${r.reparations ? `\u30FB\u8CE0\u511F ${fmt4(r.reparations, 2)}${r.reparationsShare != null ? `\uFF08\u56FD\u5EAB\u306E ${pct(r.reparationsShare)}\uFF09` : ""}` : ""}`]);
        }
        for (const x of terms.reparations) {
          const rate = simActions.exchangeRate(x.fromStateId, x.toStateId);
          lines.push([`${sname(map, x.fromStateId)} \u2192 ${sname(map, x.toStateId)}`, `${fmt4(x.amount, 2)} ${simActions.getCurrency(x.fromStateId).name} \uFF1D ${fmt4(x.amount * rate, 2)} ${simActions.getCurrency(x.toStateId).name}\uFF081 ${simActions.getCurrency(x.fromStateId).name} = ${rate.toFixed(4)}\uFF09`]);
        }
        if (lines.length) {
          const tb = el13("table", "win-table");
          for (const [k, val] of lines) {
            const tr = el13("tr");
            tr.append(el13("th", "", k), el13("td", "", val));
            tb.append(tr);
          }
          impact.append(el13("h4", "", "\u3053\u306E\u6761\u7D04\u3067\u76F8\u624B\u304B\u3089\u6E21\u308B\u3082\u306E"), tb);
        }
      }
      if (draft.kind === "white") detail.append(el13("p", "hint", "\u3069\u3061\u3089\u3082\u4F55\u3082\u53D7\u3051\u53D6\u308A\u307E\u305B\u3093\u3002\u6226\u4E89\u306F\u7D42\u308F\u308A\u3001\u95A2\u4FC2\u306F\u4E2D\u7ACB\u306B\u623B\u308A\u307E\u3059\u3002"));
      else if (draft.kind === "vassal") {
        const sel2 = document.createElement("select");
        for (const k of VASSAL_KINDS) {
          const o = document.createElement("option");
          o.value = k.key;
          o.textContent = `${k.label}\uFF08\u8CA2\u7D0D ${Math.round(k.tribute * 100)}%/\u5E74\uFF09`;
          o.selected = draft.vkind === k.key;
          sel2.append(o);
        }
        const desc = el13("p", "hint", VASSAL_BY_KEY[draft.vkind].desc);
        sel2.addEventListener("change", () => {
          draft.vkind = sel2.value;
          renderTreaty();
        });
        detail.append(el13("p", "hint", `${losers.map((L) => sname(map, L)).join("\u30FB")}\u306F\u4F75\u5408\u3055\u308C\u305A\u3001${sname(map, winners[0])}\u306B\u5F93\u5C5E\u3057\u307E\u3059\u3002\u9818\u571F\u306F\u5909\u308F\u308A\u307E\u305B\u3093\u3002`), sel2, desc, meter);
      } else if (draft.kind === "annex") detail.append(el13("p", "hint", `${losers.map((L) => sname(map, L)).join("\u30FB")}\u306F\u964D\u4F0F\u3057\u3001\u5168\u571F\u304C${sname(map, winners[0])}\u306B\u4F75\u5408\u3055\u308C\u307E\u3059\u3002`), meter);
      else {
        ensureCessions();
        ensureRepar();
        const sizeRow = el13("div", "member-picker");
        sizeRow.append(el13("span", "field-label", "\u533A\u753B\u306E\u5927\u304D\u3055"));
        for (const [k, label] of [["s", "\u5C0F"], ["m", "\u4E2D"], ["l", "\u5927"]]) {
          const l = el13("label", "");
          const rb = document.createElement("input");
          rb.type = "radio";
          rb.name = "treaty-size";
          rb.checked = draft.size === k;
          rb.addEventListener("change", () => {
            draft.size = k;
            draft.cessions = null;
            renderTreaty();
          });
          l.append(rb, document.createTextNode(` ${label}`));
          sizeRow.append(l);
        }
        detail.append(el13("h4", "", "\u5272\u8B72\u3059\u308B\u5730\u57DF"), sizeRow, el13("p", "hint", `\u6D88\u8017\u306B\u6BD4\u4F8B\u3057\u305F\u76EE\u5B89: \u7D04${fmt4(draft.sug?.cessionCells ?? 0)}\u30BB\u30EB\u3002\u533A\u753B\u3054\u3068\u306B\u53D7\u3051\u53D6\u308B\u52DD\u8005\u3092\u9078\u3079\u307E\u3059\uFF08\u9996\u90FD\u306F\u5272\u8B72\u3067\u304D\u307E\u305B\u3093\uFF09`));
        const cessBox = el13("div", "wo-cess");
        if (!draft.cessions.length) cessBox.append(el13("p", "muted", "\u5272\u8B72\u3067\u304D\u308B\u533A\u753B\u304C\u3042\u308A\u307E\u305B\u3093"));
        for (const c of draft.cessions) {
          const l = el13("label", "wo-cess-row");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = c.on;
          cb.addEventListener("change", () => {
            c.on = cb.checked;
            renderMeter();
          });
          l.append(cb, document.createTextNode(`${c.name}\uFF08${c.cells}\u30BB\u30EB\u30FB${sname(map, c.fromStateId)}\uFF09\u2192 `));
          if (winners.length > 1) {
            const s2 = document.createElement("select");
            for (const wId of winners) {
              const o = document.createElement("option");
              o.value = wId;
              o.textContent = sname(map, wId);
              o.selected = wId === c.toStateId;
              s2.append(o);
            }
            s2.addEventListener("change", () => {
              c.toStateId = Number(s2.value);
              renderMeter();
            });
            l.append(s2);
          } else l.append(document.createTextNode(sname(map, c.toStateId)));
          cessBox.append(l);
        }
        detail.append(cessBox);
        detail.append(el13("h4", "", "\u8CE0\u511F\u91D1\uFF08\u6D88\u8017\u304B\u3089\u81EA\u52D5\u3067\u4EEE\u8A2D\u5B9A\u3002\u5909\u66F4\u3067\u304D\u307E\u3059\uFF09"));
        for (const L of losers) for (const W of winners) {
          const key = `${L}-${W}`;
          const row = el13("div", "member-picker");
          const amount = document.createElement("input");
          amount.type = "number";
          amount.min = "0";
          amount.value = String(draft.reparations[key] ?? 0);
          amount.addEventListener("input", () => {
            draft.reparations[key] = Number(amount.value) || 0;
            renderMeter();
          });
          row.append(el13("span", "", `${sname(map, L)} \u2192 ${sname(map, W)}`), amount, el13("span", "muted", simActions.getCurrency(L).name));
          detail.append(row);
        }
        detail.append(meter, impact);
      }
      renderMeter();
      const notes = document.createElement("textarea");
      notes.rows = 3;
      notes.placeholder = "\u305D\u306E\u4ED6\u306E\u6761\u4EF6\uFF08\u975E\u6B66\u88C5\u5316\u30FB\u901A\u5546\u30FB\u99D0\u7559\u306A\u3069\u81EA\u7531\u8A18\u8FF0\uFF09";
      notes.value = draft.notes;
      notes.addEventListener("input", () => {
        draft.notes = notes.value;
      });
      wrap.append(el13("h4", "", "\u305D\u306E\u4ED6\u306E\u6761\u4EF6"), notes);
      const sign = el13("button", "primary", "\u8B1B\u548C\u6761\u7D04\u3092\u7DE0\u7D50\u3059\u308B");
      sign.type = "button";
      sign.addEventListener("click", () => {
        const ok = simActions.signTreaty(war.id, { ...currentTerms(), treatyName: draft.treatyName.trim(), notes: draft.notes.trim(), venue: draft.venue ? { place: draft.venue.place, stateId: draft.venue.stateId } : null });
        if (ok) {
          draft = null;
          renderTreaty();
        }
      });
      wrap.append(sign);
      return wrap;
    }
    const currencyBody = el13("div", "cur-body");
    let baseId = null, convFrom = null, convTo = null, convAmt = 100;
    function spark(hist, up) {
      const W = 90, H = 26;
      if (!hist || hist.length < 2) return el13("span", "muted", "\u2014");
      const mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
      const pts = hist.map((v, i) => `${(i / (hist.length - 1) * W).toFixed(1)},${(H - 2 - (v - mn) / span * (H - 4)).toFixed(1)}`).join(" ");
      const NS2 = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS2, "svg");
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const pl = document.createElementNS(NS2, "polyline");
      pl.setAttribute("points", pts);
      pl.setAttribute("fill", "none");
      pl.setAttribute("stroke-width", "1.6");
      pl.setAttribute("stroke", up ? "#4fb477" : "#d9594c");
      svg.append(pl);
      return svg;
    }
    function renderCurrency() {
      currencyBody.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        currencyBody.append(el13("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive33);
      if (!states.length) {
        currencyBody.append(el13("p", "muted", "\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      if (!states.some((s) => s.i === baseId)) baseId = states[0].i;
      const base = simActions.getCurrency(baseId);
      const top = el13("div", "cur-top");
      const baseSel = document.createElement("select");
      for (const s of states) {
        const o = document.createElement("option");
        o.value = s.i;
        o.textContent = `${simActions.getCurrency(s.i).name}\uFF08${sname(map, s.i)}\uFF09`;
        o.selected = s.i === baseId;
        baseSel.append(o);
      }
      baseSel.addEventListener("change", () => {
        baseId = Number(baseSel.value);
        renderCurrency();
      });
      top.append(el13("span", "", "\u57FA\u6E96\u901A\u8CA8"), baseSel);
      currencyBody.append(top, el13("p", "hint", "\u30EC\u30FC\u30C8\u306E\u5024\u306F\u30B7\u30B9\u30C6\u30E0\u304C\u7D4C\u6E08\u529B\u304B\u3089\u6C7A\u3081\u3001\u5E74\u3054\u3068\u306B\u5909\u52D5\u3057\u307E\u3059\u3002\u3053\u3053\u3067\u9078\u3079\u308B\u306E\u306F\u3001\u5909\u52D5\u76F8\u5834\u304B\u56FA\u5B9A\u76F8\u5834\u304B\u3060\u3051\u3067\u3059\u3002"));
      const rows = states.map((s) => {
        const c = simActions.getCurrency(s.i);
        const vsBase = simActions.exchangeRate(s.i, baseId);
        const histBase = (c.hist ?? [c.rate]).map((r) => r / Math.max(1e-9, base.rate));
        const prev = histBase.length > 1 ? histBase[histBase.length - 2] : vsBase;
        return { s, c, vsBase, change: prev ? (vsBase - prev) / prev : 0, hist: histBase };
      }).sort((a, b) => b.vsBase - a.vsBase);
      const t = el13("table", "win-table cur-board");
      const h = el13("tr");
      for (const x of ["\u30B3\u30FC\u30C9", "\u901A\u8CA8", "\u56FD", `1\u901A\u8CA8 = ${base.name}`, "\u524D\u5E74\u6BD4", "\u63A8\u79FB", "\u76F8\u5834\u5236", "\u56FA\u5B9A\u306E\u57FA\u6E96\u56FD"]) h.append(el13("th", "", x));
      t.append(h);
      for (const { s, c, vsBase, change, hist } of rows) {
        const tr = el13("tr");
        const code = el13("td", "cur-code", c.code ?? String(s.name).slice(0, 3).toUpperCase());
        const nameIn = document.createElement("input");
        nameIn.value = c.name;
        nameIn.size = 10;
        nameIn.addEventListener("change", () => simActions.setCurrency(s.i, { name: nameIn.value.trim() || c.name }));
        const rate = el13("td", "cur-rate", vsBase.toFixed(4));
        const chg = el13("td", `cur-chg ${change > 5e-5 ? "up" : change < -5e-5 ? "down" : ""}`, `${change > 5e-5 ? "\u25B2" : change < -5e-5 ? "\u25BC" : "\uFF0D"} ${(Math.abs(change) * 100).toFixed(2)}%`);
        const sp = el13("td");
        sp.append(spark(hist, change >= 0));
        const reg = document.createElement("select");
        for (const [v, l] of [["floating", "\u5909\u52D5"], ["pegged", "\u56FA\u5B9A"]]) {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = l;
          o.selected = c.regime === v;
          reg.append(o);
        }
        const peg = document.createElement("select");
        for (const o2 of states.filter((x) => x.i !== s.i)) {
          const o = document.createElement("option");
          o.value = o2.i;
          o.textContent = sname(map, o2.i);
          o.selected = c.pegTo === o2.i;
          peg.append(o);
        }
        peg.disabled = c.regime !== "pegged";
        const apply = () => simActions.setCurrency(s.i, reg.value === "pegged" ? { regime: "pegged", pegTo: Number(peg.value) } : { regime: "floating" });
        reg.addEventListener("change", () => {
          apply();
          renderCurrency();
        });
        peg.addEventListener("change", apply);
        const cell = (n) => {
          const td = el13("td");
          td.append(n);
          return td;
        };
        tr.append(code, cell(nameIn), el13("td", "", sname(map, s.i)), rate, chg, sp, cell(reg), cell(peg));
        t.append(tr);
      }
      currencyBody.append(t);
      if (!states.some((s) => s.i === convFrom)) convFrom = states[0].i;
      if (!states.some((s) => s.i === convTo)) convTo = (states[1] ?? states[0]).i;
      const conv = el13("div", "cur-conv");
      const amt = document.createElement("input");
      amt.type = "number";
      amt.value = String(convAmt);
      amt.min = "0";
      const sel2 = (cur, on) => {
        const s = document.createElement("select");
        for (const st of states) {
          const o = document.createElement("option");
          o.value = st.i;
          o.textContent = simActions.getCurrency(st.i).name;
          o.selected = st.i === cur;
          s.append(o);
        }
        s.addEventListener("change", () => {
          on(Number(s.value));
          renderCurrency();
        });
        return s;
      };
      const out = el13("strong", "", `${fmt4((Number(amt.value) || 0) * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`);
      amt.addEventListener("input", () => {
        convAmt = Number(amt.value) || 0;
        out.textContent = `${fmt4(convAmt * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`;
      });
      conv.append(el13("h4", "", "\u4E21\u66FF"), amt, sel2(convFrom, (x) => {
        convFrom = x;
      }), el13("span", "", "\uFF1D"), out, el13("span", "", "\uFF08"), sel2(convTo, (x) => {
        convTo = x;
      }), el13("span", "", "\u306B\uFF09"));
      currencyBody.append(conv);
    }
    const safeTreaty = guardRender(treatyBody, () => renderTreaty()), safeCurrency = guardRender(currencyBody, () => renderCurrency());
    store.subscribe((_s, ch) => {
      if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
      if (currencyBody.offsetParent) safeCurrency();
      if (treatyBody.offsetParent) safeTreaty();
    });
    return { situation, bars, treatyBody, renderTreaty, currencyBody, renderCurrency };
  }

  // js/ui/panels/alliances-panel.js
  var el14 = (tag, cls, text2) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text2 != null) e.textContent = text2;
    return e;
  };
  var isLive34 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initAlliancesPanel({ store, simActions }) {
    const root = byId("tab-alliances");
    function render() {
      root.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        root.append(el14("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive34);
      root.append(createForm(map, states));
      const list = simActions.listAlliances();
      const active = list.filter((a) => !a.dissolvedAt);
      const dissolved = list.filter((a) => a.dissolvedAt);
      if (!active.length) root.append(el14("p", "muted", "\u540C\u76DF\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093"));
      else for (const a of active) root.append(allianceCard(map, states, a));
      root.append(vassalSection(map, states));
      if (dissolved.length) {
        root.append(el14("h4", "", "\u89E3\u6D88\u6E08\u307F\u306E\u540C\u76DF\uFF08\u5C65\u6B74\uFF09"));
        for (const a of dissolved) root.append(allianceCard(map, states, a));
      }
    }
    function vassalSection(map, states) {
      const box = el14("div", "editor-section");
      box.append(el14("h4", "", "\u5F93\u5C5E\u95A2\u4FC2\uFF08\u5080\u5121\u30FB\u4FDD\u8B77\u56FD\u30FB\u5C5E\u56FD\uFF09"));
      box.append(el14("p", "hint", VASSAL_KINDS.map((k) => `${k.label}: ${k.desc}`).join(" \uFF0F ")));
      const rows = states.filter((s) => simActions.vassalInfo(s.i));
      if (!rows.length) box.append(el14("p", "muted", "\u5F93\u5C5E\u3057\u3066\u3044\u308B\u56FD\u306F\u3042\u308A\u307E\u305B\u3093"));
      for (const s of rows) {
        const v = simActions.vassalInfo(s.i);
        const row = el14("div", "ent-row");
        row.append(el14("span", "ent-main", `${stateName(map, s.i)} \u306F ${stateName(map, v.overlord)} \u306E${VASSAL_BY_KEY[v.kind].label}\uFF08\u8CA2\u7D0D ${Math.round(VASSAL_BY_KEY[v.kind].tribute * 100)}%/\u5E74\uFF09`));
        const rel2 = el14("button", "ent-btn", "\u72EC\u7ACB\u3055\u305B\u308B");
        rel2.type = "button";
        rel2.addEventListener("click", () => simActions.releaseVassal(s.i));
        row.append(rel2);
        box.append(row);
      }
      const add = el14("div", "member-picker");
      const mk = (cur) => {
        const sel = document.createElement("select");
        for (const s of states) {
          const o = document.createElement("option");
          o.value = s.i;
          o.textContent = stateName(map, s.i);
          sel.append(o);
        }
        if (cur != null) sel.value = cur;
        return sel;
      };
      const a = mk(), b = mk(states[1]?.i), kind = document.createElement("select");
      for (const k of VASSAL_KINDS) {
        const o = document.createElement("option");
        o.value = k.key;
        o.textContent = k.label;
        kind.append(o);
      }
      const go = el14("button", "", "\u5F93\u5C5E\u3055\u305B\u308B");
      go.type = "button";
      go.addEventListener("click", () => {
        if (a.value !== b.value) simActions.setVassal(Number(a.value), Number(b.value), kind.value);
      });
      add.append(a, el14("span", "", "\u3092"), b, el14("span", "", "\u306E"), kind, go);
      box.append(add);
      return box;
    }
    function stateName(map, id) {
      return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    }
    function memberPicker(states, checkedIds = []) {
      const wrap = el14("div", "member-picker");
      const boxes = [];
      for (const s of states) {
        const label = el14("label", "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = s.i;
        cb.checked = checkedIds.includes(s.i);
        label.append(cb, document.createTextNode(s.fullName ?? s.name));
        wrap.append(label);
        boxes.push(cb);
      }
      return { wrap, boxes };
    }
    function bondPicker(current, onChange) {
      const wrap = el14("div", "bond-picker");
      wrap.append(el14("label", "field-label", "\u540C\u76DF\u306E\u62D8\u675F\u529B"));
      const desc = el14("p", "hint", BOND_BY_KEY[current].desc);
      const sel = document.createElement("select");
      for (const b of BONDS) {
        const o = document.createElement("option");
        o.value = b.key;
        o.textContent = b.label;
        o.selected = b.key === current;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        desc.textContent = BOND_BY_KEY[sel.value].desc;
        onChange(sel.value);
      });
      wrap.append(sel, desc);
      return { wrap, get value() {
        return sel.value;
      } };
    }
    function createForm(map, states) {
      const wrap = el14("div", "editor-section");
      wrap.append(el14("h4", "", "\u65B0\u3057\u3044\u540C\u76DF"));
      const nameInput = document.createElement("input");
      nameInput.placeholder = "\u540C\u76DF\u306E\u540D\u524D";
      wrap.append(nameInput);
      const { wrap: picker, boxes } = memberPicker(states);
      wrap.append(picker);
      const bp = bondPicker("standard", () => {
      });
      wrap.append(bp.wrap);
      const leaderSel = document.createElement("select");
      const syncLeader = () => {
        const chosen = boxes.filter((b) => b.checked).map((b) => Number(b.value));
        const cur = leaderSel.value;
        leaderSel.replaceChildren();
        for (const id of chosen) {
          const o = document.createElement("option");
          o.value = id;
          o.textContent = stateName(map, id);
          o.selected = String(id) === cur;
          leaderSel.append(o);
        }
      };
      for (const b of boxes) b.addEventListener("change", syncLeader);
      wrap.append(el14("label", "field-label", "\u76DF\u4E3B\uFF08\u9078\u3093\u3060\u52A0\u76DF\u56FD\u304B\u3089\uFF09"), leaderSel);
      const go = el14("button", "", "\u540C\u76DF\u3092\u7D50\u6210\uFF082\u30AB\u56FD\u4EE5\u4E0A\u3092\u9078\u629E\uFF09");
      go.type = "button";
      go.addEventListener("click", async () => {
        const ids2 = boxes.filter((b) => b.checked).map((b) => Number(b.value));
        if (ids2.length < 2) {
          await alertDialog("2\u30AB\u56FD\u4EE5\u4E0A\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
          return;
        }
        simActions.createAlliance(nameInput.value, ids2, bp.value, leaderSel.value ? Number(leaderSel.value) : ids2[0]);
      });
      wrap.append(go);
      return wrap;
    }
    function allianceCard(map, states, a) {
      const dissolved = !!a.dissolvedAt;
      const card = el14("div", `alliance-card${dissolved ? " dissolved" : ""}`);
      const head = el14("div", "regiment-card-head");
      const nameInput = document.createElement("input");
      nameInput.value = a.name;
      nameInput.style.fontWeight = "600";
      nameInput.style.background = "transparent";
      nameInput.style.border = "0";
      nameInput.style.flex = "1";
      nameInput.disabled = dissolved;
      nameInput.addEventListener("change", () => simActions.editAlliance(a.id, { name: nameInput.value }));
      head.append(nameInput);
      if (!dissolved) {
        const delBtn = el14("button", "danger", "\u89E3\u6D88");
        delBtn.type = "button";
        delBtn.addEventListener("click", async () => {
          if (await confirmDialog(`\u300C${a.name}\u300D\u3092\u89E3\u6D88\u3057\u307E\u3059\u304B\uFF1F`, { danger: true, okLabel: "\u89E3\u6D88" })) simActions.dissolveAlliance(a.id);
        });
        head.append(delBtn);
      }
      card.append(head);
      const dateLine = a.formedAt ? `\u7D50\u6210: ${formatWorldTime(a.formedAt)}${dissolved ? `\u3000\u89E3\u6D88: ${formatWorldTime(a.dissolvedAt)}` : ""}` : dissolved ? "\u89E3\u6D88\u6E08\u307F" : "";
      if (dateLine) card.append(el14("p", "hint", dateLine));
      if (!dissolved) card.append(bondPicker(bondOf(a), (v) => simActions.editAlliance(a.id, { bond: v })).wrap);
      else card.append(el14("p", "hint", `\u62D8\u675F\u529B\uFF1A${BOND_BY_KEY[bondOf(a)].label}`));
      if (!dissolved) {
        const ls = document.createElement("select");
        for (const id of a.members) {
          const o = document.createElement("option");
          o.value = id;
          o.textContent = stateName(map, id);
          o.selected = id === leaderOf(a);
          ls.append(o);
        }
        ls.addEventListener("change", () => simActions.editAlliance(a.id, { leader: Number(ls.value) }));
        card.append(el14("label", "field-label", "\u76DF\u4E3B\uFF08\u8B1B\u548C\u3092\u4E3B\u5C0E\u3057\u3001\u53D6\u308A\u5206\u304C\u591A\u3044\uFF09"), ls);
      } else card.append(el14("p", "hint", `\u76DF\u4E3B\uFF1A${stateName(map, leaderOf(a))}`));
      const chips = el14("div", "member-chip-list");
      for (const id of a.members) chips.append(el14("span", "member-chip", `${id === leaderOf(a) ? "\u2605 " : ""}${stateName(map, id)}`));
      card.append(chips);
      if (!dissolved) {
        const { wrap: picker, boxes } = memberPicker(states, a.members);
        card.append(el14("p", "muted", "\u52A0\u76DF\u56FD\u306E\u5909\u66F4:"));
        card.append(picker);
        const update = el14("button", "", "\u30E1\u30F3\u30D0\u30FC\u3092\u66F4\u65B0");
        update.type = "button";
        update.addEventListener("click", async () => {
          const ids2 = boxes.filter((b) => b.checked).map((b) => Number(b.value));
          if (ids2.length < 2) {
            await alertDialog("2\u30AB\u56FD\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059");
            return;
          }
          simActions.editAlliance(a.id, { members: ids2 });
        });
        card.append(update);
      }
      return card;
    }
    const safeRender = guardRender(root, () => render());
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) safeRender();
    });
    return { render };
  }

  // js/main.js
  function start() {
    const Delaunator = globalThis.Delaunator;
    if (!Delaunator) {
      document.body.textContent = "\u5185\u90E8\u30A8\u30E9\u30FC: js/vendor/delaunator.min.js \u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30D5\u30A9\u30EB\u30C0\u69CB\u6210\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      return;
    }
    const store = createStore({
      map: null,
      fileName: "",
      warnings: [],
      error: null,
      notice: null,
      busy: null,
      hover: null,
      view: { biomes: true, heights: false, states: true, cultures: false, religions: false, provinces: false, borders: true, coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "auto", legendKind: "state" },
      editTool: "select",
      brushRadius: 40,
      timeRunning: false,
      timeSpeed: 12e4,
      hint: null,
      exportOpts: { title: true, legend: true, scaleBar: true }
    });
    const viewport = createViewport(1280, 774);
    const renderer = createRenderer({
      canvas: byId("map-canvas"),
      viewport,
      getMap: () => store.getState().map,
      getOptions: () => viewToRenderOptions(store.getState().view)
    });
    const actions = createActions({
      store,
      viewport,
      renderer,
      load: loadFromFile,
      Delaunator,
      download: downloadBlob,
      createCanvas: createBrowserCanvas
    });
    const help = initHelpDialog();
    const files = initFileInput({ actions });
    const editActions = createEditActions({ store, renderer });
    const simActions = createSimActions({ store, renderer });
    const timeActions = createTimeActions({ store, renderer, simActions });
    const militaryPanel = initMilitaryPanel({ store, simActions, editActions });
    const warOutcome = initWarOutcome({ store, simActions });
    let winsRef = null;
    const warsPanel = initWarsPanel({ store, simActions, getOutcome: () => warOutcome, getWins: () => winsRef });
    const alliancesPanel = initAlliancesPanel({ store, simActions });
    let editModeRef = null;
    const editorPanel = initEditorPanel({
      store,
      editActions,
      panels: null,
      editMode: { setTool: (t) => editModeRef?.setTool(t) }
    });
    const panels = {
      ...editorPanel,
      simActions,
      military: militaryPanel,
      wars: warsPanel,
      alliances: alliancesPanel,
      // edit-mode.js が地図クリックを「部隊の配置/移動」として消費するために使う
      regimentPending: () => militaryPanel.regimentPending(),
      consumeRegimentPlacement: (cell) => militaryPanel.consumeRegimentPlacement(cell)
    };
    editorPanel.setPanels?.(panels);
    const highlight = initHighlight({ store, viewport, renderer });
    const wins = initSettingsWindows({ store, panels, editorPanel, editActions, actions, warOutcome });
    winsRef = wins;
    initEntityLists({ store, wins, panels, editActions, highlight });
    initGenealogy({ store, wins, editActions });
    initNuclearWindow({ store, simActions, wins });
    const rawOpen = panels.openEntity;
    panels.openEntity = (kind, id) => {
      if (["state", "culture", "religion", "province"].includes(kind)) highlight.show(kind, id);
      return rawOpen(kind, id);
    };
    for (const [id, head] of [["sidebar", "#editor-panel"], ["edit-panel", ".editor-header"], ["builder-panel", ".editor-header"]]) {
      const root = byId(id);
      makeDraggable(root, id === "sidebar" ? root : root.querySelector(head), byId("stage"), id === "sidebar" ? ".editor-header" : null);
    }
    const deps = { store, viewport, renderer, actions, editActions, simActions, timeActions, panels, openFileDialog: files.open, openHelp: help.open };
    deps.highlight = highlight;
    initBanner(deps);
    initToolbar(deps);
    initStatusBar(deps);
    initMapView(deps);
    initLegend(deps);
    initChrome(deps);
    initFontsSync(deps);
    const editMode = initEditMode(deps);
    editModeRef = editMode;
    const editToolbar = initEditToolbar({ store, editMode, editActions });
    const editPanel = initEditPanel();
    const builderActions = createBuilderActions({ store, editActions, editMode, actions });
    const economyView = createEconomyView({ store, editActions, builderActions });
    const travelView = createTravelView({ store, editActions, editMode, viewport, actions });
    const historyBuilder = initHistoryBuilder({ store, viewport, renderer, editActions, builderActions, editMode, panels, views: { economy: economyView, travel: travelView } });
    window.addEventListener("request-edit-panel-open", () => editPanel.open());
    window.addEventListener("request-edit-panel-sync", (e) => {
      editToolbar.fillTargets(e.detail?.tool ?? editMode.tool);
      editToolbar.sync();
      if (e.detail?.target != null) editToolbar.setTargetValue(e.detail.target);
    });
    initTimeBar({ store, timeActions, editActions });
    store.subscribe((_s, change) => {
      if (change.type === "replace") timeActions.stop();
    });
    initShortcuts({ ...deps, editMode, editToolbar, timeActions });
    new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
    renderer.resize();
    globalThis.alterhistory = { store, viewport, renderer, actions, highlight: deps.highlight, editActions, simActions, timeActions, editorPanel, builderActions, historyBuilder };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
