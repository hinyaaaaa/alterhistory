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
    const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
    const u = clamp01(t);
    const c = (x, y) => Math.round(x + (y - x) * u).toString(16).padStart(2, "0");
    return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
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
  function drawTerrain(ctx, map, vp, mode = "biome") {
    const { cells, vertices, h } = map.geometry.pack;
    const biome = map.pack.cells.biome;
    const biomeColor = map.biomesData.map((b) => b?.color ?? "#999");
    const groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < cells.v.length; i++) {
      const hi = h[i];
      let color;
      if (hi < 20) color = waterColorOf(map, i);
      else if (mode === "height") color = landHeightColor(Math.round(hi / 4) * 4);
      else color = biomeColor[biome[i]] ?? "#999";
      let list = groups.get(color);
      if (!list) {
        list = [];
        groups.set(color, list);
      }
      list.push(i);
    }
    for (const [color, list] of groups) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const i of list) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
    }
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
        const sv = sharedVertices(cells.v, i, j);
        if (sv.length < 2) continue;
        const p = vertices.p[sv[0]], q = vertices.p[sv[1]];
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

  // js/render/layers/politics.js
  var SOURCES = {
    state: { cells: (m) => m.pack.cells.state, entities: (m) => m.pack.states },
    culture: { cells: (m) => m.pack.cells.culture, entities: (m) => m.pack.cultures },
    religion: { cells: (m) => m.pack.cells.religion, entities: (m) => m.pack.religions },
    province: { cells: (m) => m.pack.cells.province, entities: (m) => m.pack.provinces }
  };
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
  function drawPolitics(ctx, map, vp, kind, { alpha = 0.55 } = {}) {
    const src = SOURCES[kind];
    if (!src) return;
    const { cells, vertices } = map.geometry.pack;
    const ids = src.cells(map);
    const entities = src.entities(map);
    const biome = map.pack.cells.biome;
    const isLand = (i) => biome[i] !== 0;
    const groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < cells.v.length; i++) {
      if (!isLand(i)) continue;
      const id = ids[i];
      const e = entities[id];
      if (!id || !e || e.removed) continue;
      let list = groups.get(id);
      if (!list) {
        list = [];
        groups.set(id, list);
      }
      list.push(i);
    }
    ctx.globalAlpha = alpha;
    for (const [id, list] of groups) {
      ctx.fillStyle = entities[id].color ?? NEUTRAL_COLOR;
      ctx.beginPath();
      for (const i of list) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const segs = cachedBoundary(map.geometry, ids, isLand, "land:" + kind);
    ctx.strokeStyle = "rgba(40,30,20,0.75)";
    ctx.lineWidth = (kind === "state" ? 1.4 : 0.9) / vp.k;
    ctx.lineCap = "round";
    if (kind !== "state") ctx.setLineDash([3 / vp.k, 2 / vp.k]);
    strokeSegments(ctx, segs);
    ctx.setLineDash([]);
  }
  function drawCoast(ctx, map, vp) {
    const isWater = Uint8Array.from(map.pack.cells.biome, (b) => b === 0 ? 1 : 0);
    const segs = cachedBoundary(map.geometry, isWater, () => true, "coast");
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

  // js/render/layers/places.js
  function drawBurgs(ctx, map, vp, { minPopulation = 0 } = {}) {
    const vb = vp.visibleBounds(8);
    for (const b of map.pack.burgs) {
      if (!b || !b.i || b.removed) continue;
      if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue;
      if (!b.capital && (b.population ?? 0) < minPopulation) continue;
      const r = (b.capital ? 3.6 : 2.2) / vp.k;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.capital ? "#7a1f1f" : "#f4efe4";
      ctx.fill();
      ctx.lineWidth = 1 / vp.k;
      ctx.strokeStyle = "#2b2118";
      ctx.stroke();
    }
  }
  var FONT_STACK = '"Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans CJK JP",sans-serif';
  function drawLabels(ctx, map, vp, { states = true, burgs = true } = {}) {
    const placed = [];
    const k = vp.k;
    const vb = vp.visibleBounds(0);
    const inView = (x, y) => x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;
    const tryPlace = (text, wx, wy, sizePx, style) => {
      ctx.font = `${style.bold ? "bold " : ""}${sizePx / k}px ${FONT_STACK}`;
      const w = ctx.measureText(text).width * k;
      const [sx, sy] = vp.toScreen(wx, wy);
      const rect = [sx - w / 2 - 2, sy - sizePx / 2 - 1, sx + w / 2 + 2, sy + sizePx / 2 + 1];
      for (const r of placed) {
        if (rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) return false;
      }
      placed.push(rect);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = style.halo / k;
      ctx.strokeStyle = "rgba(255,252,240,0.9)";
      ctx.strokeText(text, wx, wy);
      ctx.fillStyle = style.color;
      ctx.fillText(text, wx, wy);
      return true;
    };
    if (states) {
      const list = map.pack.states.filter((s) => s && s.i && !s.removed && s.pole).sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
      for (const s of list) {
        if (!inView(s.pole[0], s.pole[1])) continue;
        const size = Math.max(11, Math.min(20, 9 + Math.sqrt(s.area ?? 0) * 0.02 * k));
        tryPlace(s.name ?? "", s.pole[0], s.pole[1], size, { color: "#2b2118", halo: 3.2, bold: true });
      }
    }
    if (burgs) {
      const list = map.pack.burgs.filter((b) => b && b.i && !b.removed).sort((a, b) => (b.capital ?? 0) - (a.capital ?? 0) || (b.population ?? 0) - (a.population ?? 0));
      for (const b of list) {
        if (!inView(b.x, b.y)) continue;
        const dy = (b.capital ? 6.5 : 5) / k;
        tryPlace(b.name ?? "", b.x, b.y + dy, b.capital ? 12 : 10, { color: "#1e1712", halo: 2.4, bold: !!b.capital });
      }
    }
  }

  // js/render/scene.js
  var DEFAULT_RENDER_OPTIONS = Object.freeze({
    base: "biome",
    // "biome" | "height"
    overlay: "state",
    // "none" | "state" | "culture" | "religion" | "province"
    coast: true,
    rivers: true,
    routes: { roads: true, trails: true, searoutes: true },
    burgs: true,
    labels: { states: true, burgs: true },
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
    drawTerrain(ctx, map, vp, o.base);
    if (o.overlay !== "none") drawPolitics(ctx, map, vp, o.overlay);
    if (o.coast) drawCoast(ctx, map, vp);
    if (o.rivers) drawRivers(ctx, map, vp);
    if (o.routes) drawRoutes(ctx, map, vp, o.routes);
    if (o.burgs) drawBurgs(ctx, map, vp);
    if (o.labels) drawLabels(ctx, map, vp, o.labels);
    ctx.restore();
  }

  // js/render/renderer.js
  var SETTLE_MS = 140;
  function createRenderer({ canvas, viewport, getMap, getOptions }) {
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    let rafId = 0;
    let settleTimer = 0;
    let interacting = false;
    let snapshot = null;
    let snapView = null;
    let needFull = true;
    const listeners = /* @__PURE__ */ new Set();
    const notify = () => listeners.forEach((fn) => fn());
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      viewport.resize(w, h);
      snapshot = null;
      interacting = false;
      requestRender();
    }
    function clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#2f4a72";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function drawFull() {
      const map = getMap();
      if (!map?.geometry) {
        clear();
        return;
      }
      drawScene(ctx, map, viewport, getOptions(), dpr);
    }
    function drawInteracting() {
      clear();
      if (!snapshot) return;
      const s = viewport.k / snapView.k;
      const dx = viewport.x - snapView.x * s;
      const dy = viewport.y - snapView.y * s;
      ctx.drawImage(snapshot, dx * dpr, dy * dpr, snapshot.width * s, snapshot.height * s);
    }
    function frame() {
      rafId = 0;
      if (interacting && snapshot && !needFull) drawInteracting();
      else {
        drawFull();
        needFull = false;
      }
      notify();
    }
    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(frame);
    };
    function requestRender() {
      needFull = true;
      interacting = false;
      snapshot = null;
      clearTimeout(settleTimer);
      schedule();
    }
    function interact() {
      if (!interacting) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d").drawImage(canvas, 0, 0);
        snapView = { x: viewport.x, y: viewport.y, k: viewport.k };
        interacting = true;
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(requestRender, SETTLE_MS);
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

  // js/render/options.js
  function viewToRenderOptions(view) {
    return {
      base: view.base,
      overlay: view.overlay,
      coast: view.coast,
      rivers: view.rivers,
      routes: view.routes ? { roads: true, trails: true, searoutes: true } : false,
      burgs: view.burgs,
      labels: view.labels ? { states: true, burgs: true } : false
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
  function parseAzgaarText(text) {
    if (typeof text !== "string" || text.length === 0) {
      throw new MapParseError("\u30D5\u30A1\u30A4\u30EB\u304C\u7A7A\u3067\u3059");
    }
    const lines = text.split(CRLF);
    if (lines.length < REQUIRED_MIN_LINES) {
      const hint = lines.length === 1 && text.includes("\n") ? "\uFF08\u6539\u884C\u304C LF \u306E\u307F\u3067\u3059\u3002\u30A8\u30C7\u30A3\u30BF\u7B49\u3067\u4FDD\u5B58\u3057\u76F4\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u304B\u3082\u3057\u308C\u307E\u305B\u3093\uFF09" : "";
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
    map.biomesData = json2(lines[LINE.BIOMES], [], "\u30D0\u30A4\u30AA\u30FC\u30E0");
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

  // js/core/query.js
  var nameOf = (list, id) => {
    const e = list?.[id];
    if (!e || e.removed) return null;
    return e.fullName ?? e.name ?? null;
  };
  function describeCell(map, i) {
    const c = map.pack.cells;
    if (!map.geometry || i < 0 || i >= c.biome.length) return null;
    const isWater = c.biome[i] === 0;
    const burgId = c.burg[i];
    return {
      cell: i,
      water: isWater,
      height: map.geometry.pack.h[i],
      biome: map.biomesData[c.biome[i]]?.name ?? null,
      state: isWater ? null : nameOf(map.pack.states, c.state[i]),
      culture: isWater ? null : nameOf(map.pack.cultures, c.culture[i]),
      religion: isWater ? null : nameOf(map.pack.religions, c.religion[i]),
      province: isWater ? null : nameOf(map.pack.provinces, c.province[i]),
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
    const ids = def.cells(map);
    const counts = /* @__PURE__ */ new Map();
    for (let i = 0; i < ids.length; i++) {
      if (map.pack.cells.biome[i] === 0) continue;
      counts.set(ids[i], (counts.get(ids[i]) ?? 0) + 1);
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
  function entityPosition(map, entity) {
    if (entity.pole) return [entity.pole[0], entity.pole[1]];
    const p = entity.center != null ? map.geometry?.pack.p[entity.center] : null;
    return p ? [p[0], p[1]] : null;
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
    L.set(LINE.BIOMES, json(map.biomesData));
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
  function parseColor(input) {
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
      const { color, alpha } = parseColor(st.fillStyle);
      const a = alpha * st.globalAlpha;
      return `fill="${color}"${a < 1 ? ` fill-opacity="${num(a * 1e3) / 1e3}"` : ""}`;
    };
    const strokeAttrs = () => {
      const { color, alpha } = parseColor(st.strokeStyle);
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
      return `x="${num(x)}" y="${num(y)}" font-size="${num(f.size * 1e3) / 1e3}" font-family="${esc(f.family)}"${f.bold ? ` font-weight="bold"` : ""} text-anchor="${anchor}"${base}`;
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
      fillText(text, x, y) {
        emit(`<text ${textAttrs(x, y)} ${fillAttrs()}>${esc(text)}</text>`);
      },
      strokeText(text, x, y) {
        emit(`<text ${textAttrs(x, y)} fill="none" ${strokeAttrs()}>${esc(text)}</text>`);
      },
      measureText(text) {
        const { size } = parseFont(st.font);
        let em = 0;
        for (const ch of String(text)) em += charEm(ch);
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
  function renderMapToCanvas(map, renderOptions, { scale = 2, createCanvas }) {
    const { vp, w, h } = wholeMapViewport(map);
    const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
    drawScene(canvas.getContext("2d"), map, vp, renderOptions, scale);
    return canvas;
  }
  function renderMapToSvg(map, renderOptions) {
    const { vp, w, h } = wholeMapViewport(map);
    const ctx = createSvgContext(w, h);
    drawScene(ctx, map, vp, renderOptions, 1);
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

  // js/app/actions.js
  var nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  var OVERLAYS = ["none", "state", "culture", "religion", "province"];
  var TOGGLES = ["coast", "rivers", "routes", "burgs", "labels"];
  var NOTICE_MS = 5e3;
  var PNG_SCALE = 2;
  function createActions({ store, viewport, renderer, load, Delaunator, download, createCanvas }) {
    const rerender = () => renderer.requestRender();
    let noticeTimer = 0;
    const showNotice = (text) => {
      store.update((s) => {
        s.notice = text;
      });
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => store.update((s) => {
        s.notice = null;
      }), NOTICE_MS);
    };
    async function runExport(label, produce) {
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
    const textBlob = (text, type) => new Blob([text], { type });
    const renderOpts = () => viewToRenderOptions(store.getState().view);
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
          const prev = store.getState();
          viewport.setMapSize(map.meta.width || 1280, map.meta.height || 774);
          store.replace({ ...prev, map, fileName: file.name, warnings, error: null, notice: null, busy: null, hover: null });
          viewport.fit();
          rerender();
        } catch (e) {
          store.update((s) => {
            s.busy = null;
            s.error = e.message;
          });
        }
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
      setOverlay(kind) {
        if (OVERLAYS.includes(kind)) this.setView({ overlay: kind });
      },
      toggle(name) {
        if (!TOGGLES.includes(name)) return;
        this.setView({ [name]: !store.getState().view[name] });
      },
      toggleBase() {
        this.setView({ base: store.getState().view.base === "biome" ? "height" : "biome" });
      },
      /** 凡例の項目を選んだとき、その場所へ移動する */
      locate(entity) {
        const map = store.getState().map;
        const pos = map && entityPosition(map, entity);
        if (!pos) return;
        viewport.centerOn(pos[0], pos[1], Math.max(viewport.k, viewport.fitK * 3));
        rerender();
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
        });
      },
      /** Azgaar 互換の .map（ALTERHISTORY の目印・拡張データを含めない） */
      saveAzgaar() {
        return runExport("Azgaar\u4E92\u63DB\u30D5\u30A1\u30A4\u30EB", (map, fileName) => ({
          blob: textBlob(serializeAzgaar(map, { native: false, exportedAt: todayString() }), "text/plain"),
          name: exportFileName(map, fileName, "map", "_azgaar")
        }));
      },
      exportPng() {
        return runExport("PNG\u753B\u50CF", async (map, fileName) => ({
          blob: await canvasToPngBlob(renderMapToCanvas(map, renderOpts(), { scale: PNG_SCALE, createCanvas })),
          name: exportFileName(map, fileName, "png")
        }));
      },
      exportSvg() {
        return runExport("SVG\u753B\u50CF", (map, fileName) => ({
          blob: textBlob(renderMapToSvg(map, renderOpts()), "image/svg+xml"),
          name: exportFileName(map, fileName, "svg")
        }));
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
    const el5 = document.getElementById(id);
    if (!el5) throw new Error(`\u8981\u7D20 #${id} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08index.html \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
    return el5;
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
        const r2 = r * r;
        const gx0 = Math.max(0, Math.floor((x - r) / bucket)), gx1 = Math.min(cols - 1, Math.floor((x + r) / bucket));
        const gy0 = Math.max(0, Math.floor((y - r) / bucket)), gy1 = Math.min(rows - 1, Math.floor((y + r) / bucket));
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            for (const id of buckets[gy * cols + gx]) {
              const dx = points[id][0] - x, dy = points[id][1] - y;
              if (dx * dx + dy * dy <= r2) out.push(id);
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

  // js/ui/toolbar.js
  var TOGGLE_IDS = { coast: "chk-coast", rivers: "chk-rivers", routes: "chk-routes", burgs: "chk-burgs", labels: "chk-labels" };
  function initToolbar({ store, actions, openFileDialog, openHelp }) {
    byId("btn-open").addEventListener("click", openFileDialog);
    byId("btn-open-empty").addEventListener("click", openFileDialog);
    byId("btn-fit").addEventListener("click", () => actions.fit());
    byId("btn-help").addEventListener("click", openHelp);
    const btnSave = byId("btn-save");
    const menu = byId("export-menu");
    btnSave.addEventListener("click", () => actions.saveNative());
    const exporters = { png: () => actions.exportPng(), svg: () => actions.exportSvg(), azgaar: () => actions.saveAzgaar() };
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
      if (e.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary").focus();
      }
    });
    const selOverlay = byId("sel-overlay");
    const selBase = byId("sel-base");
    selOverlay.addEventListener("change", () => actions.setOverlay(selOverlay.value));
    selBase.addEventListener("change", () => actions.setView({ base: selBase.value }));
    for (const [name, id] of Object.entries(TOGGLE_IDS)) {
      byId(id).addEventListener("change", (e) => actions.setView({ [name]: e.target.checked }));
    }
    const sync = (state) => {
      const v = state.view;
      if (selOverlay.value !== v.overlay) selOverlay.value = v.overlay;
      if (selBase.value !== v.base) selBase.value = v.base;
      const hasMap = !!state.map;
      btnSave.disabled = !hasMap;
      menu.classList.toggle("disabled", !hasMap);
      if (!hasMap) menu.open = false;
      for (const [name, id] of Object.entries(TOGGLE_IDS)) {
        const el5 = byId(id);
        if (el5.checked !== v[name]) el5.checked = v[name];
      }
    };
    store.subscribe(sync);
    sync(store.getState());
  }

  // js/ui/legend.js
  function initLegend({ store, actions, panels }) {
    const title = byId("legend-title");
    const list = byId("legend-list");
    let lastKey = null;
    function render(state) {
      const { map, view } = state;
      const key = map ? `${map.geometry?.pack.p.length}:${view.overlay}:${state.fileName}` : "none";
      if (key === lastKey) return;
      lastKey = key;
      list.replaceChildren();
      if (!map || view.overlay === "none") {
        title.textContent = "\u51E1\u4F8B";
        list.append(message(map ? "\u8272\u5206\u3051\u3092\u9078\u3076\u3068\u3001\u3053\u3053\u306B\u4E00\u89A7\u304C\u8868\u793A\u3055\u308C\u307E\u3059" : "\u5730\u56F3\u3092\u958B\u304F\u3068\u8868\u793A\u3055\u308C\u307E\u3059"));
        return;
      }
      const items = listEntities(map, view.overlay);
      title.textContent = `\u51E1\u4F8B\uFF1A${ENTITY_KINDS[view.overlay].label}\uFF08${items.length}\uFF09`;
      if (items.length === 0) {
        list.append(message("\u8A72\u5F53\u3059\u308B\u3082\u306E\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const frag = document.createDocumentFragment();
      for (const it of items) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = `${it.name}\uFF08${it.cells}\u30BB\u30EB\uFF09\u2014 \u30AF\u30EA\u30C3\u30AF\u3067\u79FB\u52D5\u3001\u53F3\u30AF\u30EA\u30C3\u30AF\u3067\u7DE8\u96C6`;
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.style.background = it.color;
        const name = document.createElement("span");
        name.className = "legend-name";
        name.textContent = it.name;
        const count = document.createElement("span");
        count.className = "legend-count";
        count.textContent = String(it.cells);
        btn.append(chip, name, count);
        btn.addEventListener("click", () => actions.locate(it));
        btn.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          panels?.openEntity(view.overlay, it.id);
        });
        li.append(btn);
        frag.append(li);
      }
      list.append(frag);
    }
    function message(text) {
      const li = document.createElement("li");
      li.className = "legend-empty";
      li.textContent = text;
      return li;
    }
    store.subscribe(render);
    render(store.getState());
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
  function initBanner({ store, actions }) {
    const banner = byId("banner");
    const body = byId("banner-body");
    const loading = byId("loading");
    const loadingText = byId("loading-text");
    const empty = byId("empty-state");
    byId("banner-close").addEventListener("click", () => actions.dismissMessage());
    store.subscribe((s) => {
      empty.hidden = !!s.map;
      loading.hidden = !s.busy;
      if (s.busy) loadingText.textContent = s.busy;
      banner.classList.remove("info");
      if (s.error) {
        banner.hidden = false;
        banner.classList.remove("warn");
        body.textContent = s.error;
      } else if (s.warnings?.length) {
        banner.hidden = false;
        banner.classList.add("warn");
        const shown = s.warnings.slice(0, 5).map((w) => `\u30FB${w}`).join("\n");
        const more = s.warnings.length > 5 ? `
\u2026\u307B\u304B ${s.warnings.length - 5} \u4EF6` : "";
        body.textContent = `\u8AAD\u307F\u8FBC\u307F\u306F\u5B8C\u4E86\u3057\u307E\u3057\u305F\u304C\u3001\u6CE8\u610F\u304C\u3042\u308A\u307E\u3059\uFF08${s.warnings.length}\u4EF6\uFF09
${shown}${more}`;
      } else if (s.notice) {
        banner.hidden = false;
        banner.classList.remove("warn");
        banner.classList.add("info");
        body.textContent = s.notice;
      } else {
        banner.hidden = true;
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

  // js/core/edit/paint.js
  var PAINT_KINDS = Object.freeze({
    state: { list: "states", label: "\u56FD\u5BB6" },
    culture: { list: "cultures", label: "\u6587\u5316" },
    religion: { list: "religions", label: "\u5B97\u6559" },
    province: { list: "provinces", label: "\u5C5E\u5DDE" }
  });
  var round6 = (v) => Math.round(v * 1e6) / 1e6;
  var isLive = (e) => !!e && typeof e === "object" && !e.removed;
  var liveBurg = (map, id) => {
    const b = id > 0 ? map.pack.burgs[id] : null;
    return isLive(b) && b.i ? b : null;
  };
  function protectedCells(map) {
    const capital = /* @__PURE__ */ new Set(), provinceCenter = /* @__PURE__ */ new Set();
    for (const s of map.pack.states) {
      if (!isLive(s) || !s.i) continue;
      const b = liveBurg(map, s.capital);
      if (b) capital.add(b.cell);
    }
    for (const pr of map.pack.provinces) {
      if (!isLive(pr) || !pr.i) continue;
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
    if (target > 0 && !isLive(entity)) throw new Error(`${def.label}#${target} \u306F\u5B58\u5728\u3057\u306A\u3044\u304B\u3001\u524A\u9664\u3055\u308C\u3066\u3044\u307E\u3059`);
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

  // js/ui/edit-mode.js
  var TOOLS = Object.freeze({
    SELECT: "select",
    PAINT_STATE: "paint:state",
    PAINT_CULTURE: "paint:culture",
    PAINT_RELIGION: "paint:religion",
    PAINT_PROVINCE: "paint:province",
    PAINT_BIOME: "paint:biome",
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
    let militaryDialog = null;
    let tool = TOOLS.SELECT;
    let target = 0;
    let radius = 40;
    let markerType = { type: "marker", icon: "\u{1F4CD}" };
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
    canvas.addEventListener("pointerdown", (e) => {
      const map = store.getState().map;
      if (!map || e.button !== 0 || tool === TOOLS.SELECT) return;
      const [wx, wy] = toWorld(e);
      if (!inMap(map, wx, wy)) return;
      const cell = editActions.findCell(wx, wy);
      if (cell < 0) return;
      if (tool === TOOLS.ADD_BURG) {
        panels.promptBurgName((name) => {
          if (name) {
            const id = editActions.addBurg(cell, name);
            if (id != null) panels.openBurg(id);
          }
        });
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
      if (militaryDialog?.pending && militaryDialog.consumeMapClick(cell)) return;
      if (tool !== TOOLS.SELECT) return;
      const picked = pickAt(map, cell, wx, wy, 6 / viewport.k);
      if (!picked) return;
      if (picked.type === "burg") panels.openBurg(picked.id);
      else if (picked.type === "marker") panels.openMarker(picked.id);
      else panels.openCell(picked.id);
    });
    return {
      setTool,
      setTarget,
      setRadius,
      setMarkerType,
      get tool() {
        return tool;
      },
      get target() {
        return target;
      },
      setMilitaryDialog(d) {
        militaryDialog = d;
      }
    };
  }

  // js/ui/shortcuts.js
  var PAN_STEP = 80;
  var OVERLAY_KEYS = { 1: "none", 2: "state", 3: "culture", 4: "religion", 5: "province" };
  var TOGGLE_KEYS = { c: "coast", r: "rivers", t: "routes", u: "burgs", l: "labels" };
  var TOOL_KEYS = { 1: TOOLS.PAINT_STATE, 2: TOOLS.PAINT_CULTURE, 3: TOOLS.PAINT_RELIGION, 4: TOOLS.PAINT_PROVINCE, 5: TOOLS.PAINT_BIOME, 6: TOOLS.ADD_BURG, 7: TOOLS.ADD_MARKER };
  function initShortcuts({ store, actions, openFileDialog, openHelp, editMode, editToolbar, timeActions, militaryDialog }) {
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
      if (key === "m") {
        if (hasMap) militaryDialog?.open();
        return;
      }
      if (key === "Escape") {
        militaryDialog?.cancelPending();
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
      } else if (key in OVERLAY_KEYS) actions.setOverlay(OVERLAY_KEYS[key]);
      else if (key === "b") actions.toggleBase();
      else if (key in TOGGLE_KEYS) actions.toggle(TOGGLE_KEYS[key]);
    });
  }
  function initHelpDialog() {
    const dialog = byId("help-dialog");
    return { open: () => {
      if (!dialog.open) dialog.showModal();
    } };
  }

  // js/core/edit/notes.js
  var NOTE_TYPES = ["state", "province", "culture", "religion", "burg", "marker"];
  var MAX_NOTE = 2e4;
  var isLive2 = (e) => !!e && typeof e === "object" && !e.removed;
  var isLegacy = (map) => map.settings.format === "legacy";
  function noteTarget(map, type, id) {
    if (type === "marker") return map.markers.find((m) => m.i === id) ?? null;
    if (type === "burg") {
      const b = map.pack.burgs[id];
      return isLive2(b) && b.i ? b : null;
    }
    const def = PAINT_KINDS[type];
    if (!def) return null;
    const e = map.pack[def.list][id];
    return isLive2(e) && e.i ? e : null;
  }
  var legacyIds = (type, id) => {
    const ids = [`${type}${id}`];
    if (type === "state" || type === "province" || type === "burg") ids.push(`${type}Label${id}`);
    return ids;
  };
  var findLegacy = (map, type, id) => {
    const ids = legacyIds(type, id);
    return map.notes.findIndex((n) => n && ids.includes(n.id));
  };
  function getNote(map, type, id) {
    const t = noteTarget(map, type, id);
    if (!t) return "";
    if (!isLegacy(map)) return typeof t.note === "string" ? t.note : "";
    const idx = findLegacy(map, type, id);
    return idx >= 0 ? map.notes[idx].legend ?? "" : "";
  }
  var titleOf = (type, t) => t.name ? String(t.name) : type;
  function planSetNote(map, type, id, text) {
    if (!NOTE_TYPES.includes(type)) throw new Error(`\u30CE\u30FC\u30C8\u3092\u4ED8\u3051\u3089\u308C\u306A\u3044\u7A2E\u985E\u3067\u3059: ${type}`);
    const t = noteTarget(map, type, id);
    if (!t) throw new Error("\u30CE\u30FC\u30C8\u3092\u4ED8\u3051\u308B\u5BFE\u8C61\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const value = String(text ?? "");
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
    const ids = legacyIds(type, id);
    if (!map.notes.some((n) => n && ids.includes(n.id))) return null;
    return setList((m) => m.notes, (m, v) => {
      m.notes = v;
    }, map.notes.filter((n) => !(n && ids.includes(n.id))));
  }
  var SIMPLE_TAGS = /<(?!\/?(?:br|p)\b)[a-z!][^>]*>/i;
  var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  function htmlToEditable(html) {
    const s = String(html ?? "");
    if (!s) return { text: "", rich: false };
    if (SIMPLE_TAGS.test(s)) return { text: s, rich: true };
    const text = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<\/?p[^>]*>/gi, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
    return { text, rich: false };
  }
  function editableToHtml(text, rich) {
    const s = String(text ?? "").replace(/\r\n?/g, "\n");
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
    { type: "caves", icon: "\u{1F573}\uFE0F", label: "\u6D1E\u7A9F" }
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

  // js/core/edit/attributes.js
  var ATTR_KINDS = ["state", "culture", "religion", "province"];
  var MAX_ATTRS = 40;
  var MAX_LEN = 200;
  function ensureExt(map) {
    var _a;
    if (!map.ext) map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
    (_a = map.ext).data ?? (_a.data = {});
    return map.ext;
  }
  var keyOf = (kind, id) => `${kind}:${id}`;
  function getAttributes(map, kind, id) {
    return Object.entries(map.ext?.data?.attributes?.[keyOf(kind, id)] ?? {});
  }
  function normalizeAttributes(entries) {
    const out = /* @__PURE__ */ new Map();
    for (const [k, v] of entries) {
      const key = String(k ?? "").trim();
      if (!key) continue;
      if (key.length > MAX_LEN) throw new Error(`\u5C5E\u6027\u306E\u540D\u524D\u304C\u9577\u3059\u304E\u307E\u3059\uFF08${MAX_LEN}\u6587\u5B57\u307E\u3067\uFF09`);
      const val = String(v ?? "").trim();
      if (val.length > MAX_LEN) throw new Error(`\u5C5E\u6027\u300C${key}\u300D\u306E\u5024\u304C\u9577\u3059\u304E\u307E\u3059\uFF08${MAX_LEN}\u6587\u5B57\u307E\u3067\uFF09`);
      out.set(key, val);
    }
    if (out.size > MAX_ATTRS) throw new Error(`\u5C5E\u6027\u306F ${MAX_ATTRS} \u500B\u307E\u3067\u3067\u3059`);
    return Object.fromEntries(out);
  }
  var sameObj = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  };
  function planSetAttributes(map, kind, id, entries) {
    if (!ATTR_KINDS.includes(kind)) throw new Error(`\u5C5E\u6027\u3092\u4ED8\u3051\u3089\u308C\u306A\u3044\u7A2E\u985E\u3067\u3059: ${kind}`);
    const after = normalizeAttributes(entries);
    const before = Object.fromEntries(getAttributes(map, kind, id));
    if (sameObj(before, after)) return null;
    const key = keyOf(kind, id);
    const write = (m, obj) => {
      var _a;
      const ext = ensureExt(m);
      (_a = ext.data).attributes ?? (_a.attributes = {});
      if (Object.keys(obj).length) ext.data.attributes[key] = { ...obj };
      else delete ext.data.attributes[key];
      if (!Object.keys(ext.data.attributes).length) delete ext.data.attributes;
    };
    return makeCommand("\u5C5E\u6027\u306E\u5909\u66F4", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function removeAttributesPart(map, kind, id) {
    const before = getAttributes(map, kind, id);
    if (!before.length) return null;
    const key = keyOf(kind, id);
    const obj = Object.fromEntries(before);
    return {
      apply: (m) => {
        const a = m.ext?.data?.attributes;
        if (a) {
          delete a[key];
          if (!Object.keys(a).length) delete m.ext.data.attributes;
        }
      },
      revert: (m) => {
        var _a;
        const ext = ensureExt(m);
        (_a = ext.data).attributes ?? (_a.attributes = {});
        ext.data.attributes[key] = { ...obj };
      }
    };
  }

  // js/core/edit/burgs.js
  var isLive3 = (b) => !!b && typeof b === "object" && !b.removed && b.i > 0;
  var round62 = (v) => Math.round(v * 1e6) / 1e6;
  function estimatePopulation(map, cell, rnd) {
    const idx = cellIndexOf(map);
    const near = idx.findWithin(map.geometry.pack.p[cell][0], map.geometry.pack.p[cell][1], map.grid.spacing * 6).map((i) => map.pack.cells.burg[i]).filter((id) => id > 0).map((id) => map.pack.burgs[id]).filter(isLive3);
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
      if (typeof state1.urban === "number") patch.urban = round62(state1.urban + burg.population);
      if (Object.keys(patch).length) parts.push(setProps(state1, patch));
    }
    const province1 = map.pack.provinces[c.province[cell]];
    if (province1 && typeof province1.urban === "number" && Array.isArray(province1.burgs)) {
      parts.push(setProps(province1, { urban: round62(province1.urban + burg.population), burgs: [...province1.burgs, id] }));
    }
    const religion1 = map.pack.religions[c.religion[cell]];
    if (religion1 && typeof religion1.urban === "number") parts.push(setProps(religion1, { urban: round62(religion1.urban + burg.population) }));
    if (capital && state1) {
      const oldCapital = map.pack.burgs[state1.capital];
      if (isLive3(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
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
    if (!isLive3(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
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
        if (typeof fromState.urban === "number") patch.urban = round62(Math.max(0, fromState.urban - burg.population));
        if (Object.keys(patch).length) parts.push(setProps(fromState, patch));
      }
      if (toState) {
        const patch = {};
        if (typeof toState.burgs === "number") patch.burgs = toState.burgs + 1;
        if (typeof toState.urban === "number") patch.urban = round62(toState.urban + burg.population);
        if (Object.keys(patch).length) parts.push(setProps(toState, patch));
      }
    }
    if (fromProvince !== toProvince) {
      if (fromProvince && typeof fromProvince.urban === "number") parts.push(setProps(fromProvince, { urban: round62(Math.max(0, fromProvince.urban - burg.population)), ...Array.isArray(fromProvince.burgs) ? { burgs: fromProvince.burgs.filter((b) => b !== id) } : {} }));
      if (toProvince && typeof toProvince.urban === "number") parts.push(setProps(toProvince, { urban: round62(toProvince.urban + burg.population), ...Array.isArray(toProvince.burgs) ? { burgs: [...toProvince.burgs, id] } : {} }));
    }
    if (fromReligion !== toReligion) {
      if (fromReligion && typeof fromReligion.urban === "number") parts.push(setProps(fromReligion, { urban: round62(Math.max(0, fromReligion.urban - burg.population)) }));
      if (toReligion && typeof toReligion.urban === "number") parts.push(setProps(toReligion, { urban: round62(toReligion.urban + burg.population) }));
    }
    const state = map.pack.states[burg.state];
    if (burg.capital && state && state.capital === id) parts.push(setProps(state, { center: cell }));
    return makeCommand("\u90FD\u5E02\u3092\u79FB\u52D5", ["places"], parts);
  }
  function planRenameBurg(map, id, name) {
    const burg = map.pack.burgs[id];
    if (!isLive3(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("\u90FD\u5E02\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (trimmed === burg.name) return null;
    return makeCommand("\u90FD\u5E02\u306E\u540D\u524D\u3092\u5909\u66F4", ["places"], [setProps(burg, { name: trimmed })]);
  }
  function whyCannotRemoveBurg(map, id) {
    const burg = map.pack.burgs[id];
    if (!isLive3(burg)) return "\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093";
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
      if (typeof state.urban === "number") patch.urban = round62(Math.max(0, state.urban - burg.population));
      if (Object.keys(patch).length) parts.push(setProps(state, patch));
    }
    const province = map.pack.provinces[c.province[burg.cell]];
    if (province && typeof province.urban === "number") {
      parts.push(setProps(province, {
        urban: round62(Math.max(0, province.urban - burg.population)),
        ...Array.isArray(province.burgs) ? { burgs: province.burgs.filter((b) => b !== id) } : {}
      }));
    }
    const religion = map.pack.religions[c.religion[burg.cell]];
    if (religion && typeof religion.urban === "number") parts.push(setProps(religion, { urban: round62(Math.max(0, religion.urban - burg.population)) }));
    const notePart = removeLegacyNotesPart(map, "burg", id);
    if (notePart) parts.push(notePart);
    const attrPart = removeAttributesPart(map, "burg", id);
    if (attrPart) parts.push(attrPart);
    return makeCommand("\u90FD\u5E02\u3092\u524A\u9664", ["places"], parts);
  }
  function planSetCapital(map, stateId, burgId) {
    const state = map.pack.states[stateId];
    if (!state || !state.i) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const burg = map.pack.burgs[burgId];
    if (!isLive3(burg)) throw new Error("\u305D\u306E\u90FD\u5E02\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (burg.state !== stateId) throw new Error("\u9996\u90FD\u306F\u81EA\u56FD\u5185\u306E\u90FD\u5E02\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
    if (state.capital === burgId) return null;
    const parts = [];
    const oldCapital = map.pack.burgs[state.capital];
    if (isLive3(oldCapital)) parts.push(setProps(oldCapital, { capital: 0 }));
    parts.push(setProps(burg, { capital: 1 }), setProps(state, { capital: burgId, center: burg.cell }));
    return makeCommand("\u9996\u90FD\u3092\u5909\u66F4", ["places"], parts);
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
  var isLive4 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function getRelation(map, a, b) {
    const r = map.pack.states[a]?.diplomacy?.[b];
    return typeof r === "string" && r !== "x" ? r : null;
  }
  function planSetDiplomacy(map, a, b, relation) {
    const states = map.pack.states;
    const A = states[a], B = states[b];
    if (a === b) throw new Error("\u540C\u3058\u56FD\u5BB6\u3069\u3046\u3057\u306E\u95A2\u4FC2\u306F\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093");
    if (!isLive4(A) || !isLive4(B)) throw new Error("\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6\u3067\u3059");
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
    return makeCommand(`\u5916\u4EA4\u95A2\u4FC2\u306E\u5909\u66F4\uFF08${A.name}\u3068${B.name}\uFF09`, [], parts);
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
    return {
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
      addBurg(cell, name, opts = {}) {
        return withMap((map) => {
          let out;
          safeRun("\u90FD\u5E02\u306E\u8FFD\u52A0", () => {
            const r = planAddBurg(map, { cell, name, rnd, ...opts });
            commitOrThrow(r.command);
            out = r.id;
          });
          return out;
        });
      },
      moveBurg(id, cell) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u79FB\u52D5", () => commitOrThrow(planMoveBurg(map, id, cell))));
      },
      renameBurg(id, name) {
        withMap((map) => safeRun("\u90FD\u5E02\u306E\u6539\u540D", () => commitOrThrow(planRenameBurg(map, id, name))));
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
      setNote(type, id, text) {
        withMap((map) => safeRun("\u6587\u7AE0\u306E\u4FDD\u5B58", () => commitOrThrow(planSetNote(map, type, id, text))));
      },
      noteTarget(type, id) {
        return withMap((map) => noteTarget(map, type, id)) ?? null;
      },
      getAttributes(kind, id) {
        return withMap((map) => getAttributes(map, kind, id)) ?? [];
      },
      setAttributes(kind, id, entries) {
        withMap((map) => safeRun("\u5C5E\u6027\u306E\u4FDD\u5B58", () => commitOrThrow(planSetAttributes(map, kind, id, entries))));
      },
      getRelation(a, b) {
        return withMap((map) => getRelation(map, a, b)) ?? null;
      },
      setDiplomacy(a, b, relation) {
        withMap((map) => safeRun("\u5916\u4EA4\u95A2\u4FC2\u306E\u5909\u66F4", () => commitOrThrow(planSetDiplomacy(map, a, b, relation))));
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
  var isLive5 = (e) => !!e && typeof e === "object" && !e.removed;
  function initEditToolbar({ store, editMode }) {
    const buttons = [...document.querySelectorAll("#edit-toolbar [data-tool]")];
    const targetGroup = byId("tool-target-group");
    const targetSel = byId("tool-target");
    const radiusGroup = byId("tool-radius-group");
    const radiusInput = byId("tool-radius");
    const hint = byId("tool-hint");
    const HINTS = {
      [TOOLS.SELECT]: "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u4E2D\u8EAB\u3092\u898B\u308B\u30FB\u7DE8\u96C6\u3059\u308B",
      [TOOLS.PAINT_STATE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u56FD\u5BB6\u3092\u5857\u308B\uFF08\u53F3\u306E\u300C\u5BFE\u8C61\u300D\u3067\u5857\u308B\u56FD\u5BB6\u3092\u9078\u3076\uFF09",
      [TOOLS.PAINT_CULTURE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u6587\u5316\u3092\u5857\u308B",
      [TOOLS.PAINT_RELIGION]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5B97\u6559\u3092\u5857\u308B",
      [TOOLS.PAINT_PROVINCE]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5C5E\u5DDE\u3092\u5857\u308B",
      [TOOLS.PAINT_BIOME]: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u5730\u5F62\u3092\u5857\u308B\uFF08\u6C34\u57DF\u306F\u5857\u308C\u307E\u305B\u3093\uFF09",
      [TOOLS.ADD_BURG]: "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u90FD\u5E02\u3092\u7F6E\u304F",
      [TOOLS.ADD_MARKER]: "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u30DE\u30FC\u30AB\u30FC\u3092\u7F6E\u304F"
    };
    function fillTargets(tool) {
      const map = store.getState().map;
      targetSel.replaceChildren();
      const kind = tool.startsWith("paint:") ? tool.slice(6) : null;
      if (!map || !kind) {
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
      const list = map.pack[TARGET_LIST[kind]].filter(isLive5);
      for (const e of list) {
        const o = document.createElement("option");
        o.value = e.i;
        o.textContent = e.fullName ?? e.name;
        targetSel.append(o);
      }
      if (list[0]) targetSel.value = String(list[0].i);
    }
    function sync() {
      const tool = editMode.tool;
      for (const b of buttons) b.classList.toggle("active", b.dataset.tool === tool);
      hint.textContent = store.getState().map ? HINTS[tool] ?? "" : "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044";
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
    targetSel.addEventListener("change", () => editMode.setTarget(Number(targetSel.value)));
    radiusInput.addEventListener("input", () => editMode.setRadius(Number(radiusInput.value)));
    store.subscribe((state, change) => {
      if (change.type === "replace") {
        fillTargets(editMode.tool);
        sync();
      }
    });
    sync();
    return { fillTargets, sync };
  }

  // js/ui/panels/editor-panel.js
  var el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var isLive6 = (e) => !!e && typeof e === "object" && !e.removed;
  function initEditorPanel({ store, editActions }) {
    const root = byId("editor-panel");
    let current = null;
    function open(kind, id) {
      current = { kind, id };
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
      const header = el("div", "editor-header");
      const title = el("h3");
      const closeBtn = el("button", "editor-close", "\xD7");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "\u9589\u3058\u308B");
      closeBtn.addEventListener("click", close);
      header.append(title, closeBtn);
      root.append(header);
      const body = el("div", "editor-body");
      root.append(body);
      if (current.kind === "cell") renderCell(map, title, body);
      else if (current.kind === "burg") renderBurg(map, title, body);
      else if (current.kind === "marker") renderMarker(map, title, body);
      else renderEntity(map, current.kind, title, body);
    }
    function renderCell(map, title, body) {
      const info = describeCell(map, current.id);
      title.textContent = `\u30BB\u30EB #${current.id}`;
      if (!info) {
        body.append(el("p", "muted", "\u60C5\u5831\u304C\u3042\u308A\u307E\u305B\u3093"));
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
        const b = el("button", "link", `\u90FD\u5E02\u300C${info.burg}\u300D\u3092\u958B\u304F`);
        b.addEventListener("click", () => open("burg", map.pack.cells.burg[current.id]));
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
      const form = el("div", "editor-form");
      const typeRow = el("label", "field");
      typeRow.append(el("span", "field-label", "\u7A2E\u985E"));
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
      form.append(textField("\u540D\u524D", m.name ?? defaultMarkerName(m.type), (v) => editActions.editMarker(m.i, { name: v })));
      form.append(noteField(map, "marker", m.i));
      const del = el("button", "danger", "\u3053\u306E\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664");
      del.type = "button";
      del.addEventListener("click", () => {
        if (confirm("\u3053\u306E\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) {
          editActions.removeMarker(m.i);
          close();
        }
      });
      form.append(del);
      body.append(form);
    }
    function renderBurg(map, title, body) {
      const b = map.pack.burgs[current.id];
      if (!isLive6(b)) {
        close();
        return;
      }
      title.textContent = `${b.capital ? "\u{1F3F0} " : "\u{1F3D8}\uFE0F "}${b.name}`;
      const form = el("div", "editor-form");
      form.append(table([
        ["\u56FD\u5BB6", isLive6(map.pack.states[b.state]) ? map.pack.states[b.state].name : "\u7121\u6240\u5C5E"],
        ["\u6587\u5316", map.pack.cultures[b.culture]?.name ?? ""],
        ["\u4EBA\u53E3(\u6982\u7B97)", (b.population ?? 0).toFixed(2)]
      ]));
      form.append(textField("\u540D\u524D", b.name, (v) => editActions.renameBurg(b.i, v)));
      if (!b.capital) {
        const cap = el("button", "", "\u3053\u306E\u90FD\u5E02\u3092\u9996\u90FD\u306B\u3059\u308B");
        cap.type = "button";
        cap.addEventListener("click", () => editActions.setCapital(b.state, b.i));
        form.append(cap);
      }
      form.append(noteField(map, "burg", b.i));
      const reason = editActions.whyCannotRemoveBurg(b.i);
      const del = el("button", "danger", "\u3053\u306E\u90FD\u5E02\u3092\u524A\u9664");
      del.type = "button";
      del.disabled = !!reason;
      if (reason) del.title = reason;
      del.addEventListener("click", () => {
        if (confirm("\u3053\u306E\u90FD\u5E02\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) {
          editActions.removeBurg(b.i);
          close();
        }
      });
      form.append(del);
      if (reason) form.append(el("p", "hint", reason));
      body.append(form);
    }
    function renderEntity(map, kind, title, body) {
      const list = { state: map.pack.states, culture: map.pack.cultures, religion: map.pack.religions, province: map.pack.provinces }[kind];
      const e = list?.[current.id];
      if (!isLive6(e)) {
        close();
        return;
      }
      const labelOf = { state: "\u56FD\u5BB6", culture: "\u6587\u5316", religion: "\u5B97\u6559", province: "\u5C5E\u5DDE" }[kind];
      title.textContent = `${labelOf}\u300C${e.fullName ?? e.name}\u300D`;
      const form = el("div", "editor-form");
      const stats = [["\u30BB\u30EB\u6570", e.cells], ["\u9762\u7A4D", e.area], ["\u90FD\u5E02\u6570", Array.isArray(e.burgs) ? e.burgs.length : e.burgs]].filter(([, v]) => v != null);
      form.append(table(stats));
      form.append(attributesField(kind, e.i));
      form.append(noteField(map, kind, e.i));
      if (kind === "state") form.append(diplomacySection(map, e.i));
      body.append(form);
    }
    function diplomacySection(map, stateId) {
      const wrap = el("div", "editor-section");
      wrap.append(el("h4", "", "\u5916\u4EA4\u95A2\u4FC2"));
      const others = map.pack.states.filter((s) => isLive6(s) && s.i !== stateId);
      for (const s of others) {
        const row = el("div", "diplomacy-row");
        row.append(el("span", "diplomacy-name", s.name));
        const sel = document.createElement("select");
        const current2 = editActions.getRelation(map, stateId, s.i) ?? "Neutral";
        for (const r of RELATIONS) {
          const o = document.createElement("option");
          o.value = r.id;
          o.textContent = r.label;
          if (r.id === current2) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", () => editActions.setDiplomacy(stateId, s.i, sel.value));
        row.append(sel);
        wrap.append(row);
      }
      return wrap;
    }
    function attributesField(kind, id) {
      const wrap = el("div", "editor-section");
      wrap.append(el("h4", "", "\u8FFD\u52A0\u306E\u5C5E\u6027"));
      const list = el("div", "attr-list");
      const entries = editActions.getAttributes(kind, id);
      const rowsState = entries.length ? entries.slice() : [["", ""]];
      const renderRows = () => {
        list.replaceChildren();
        rowsState.forEach((pair, i) => {
          const row = el("div", "attr-row");
          const k = document.createElement("input");
          k.placeholder = "\u9805\u76EE\u540D\uFF08\u4F8B\uFF1A\u6280\u8853\u6C34\u6E96\uFF09";
          k.value = pair[0];
          const v = document.createElement("input");
          v.placeholder = "\u5024\uFF08\u4F8B\uFF1A\u4E2D\u4E16\uFF09";
          v.value = pair[1];
          const commit = () => {
            rowsState[i] = [k.value, v.value];
            editActions.setAttributes(kind, id, rowsState.filter(([kk]) => kk.trim()));
          };
          k.addEventListener("change", commit);
          v.addEventListener("change", commit);
          const rm = el("button", "attr-remove", "\u2212");
          rm.type = "button";
          rm.addEventListener("click", () => {
            rowsState.splice(i, 1);
            editActions.setAttributes(kind, id, rowsState.filter(([kk]) => kk.trim()));
            renderRows();
          });
          row.append(k, v, rm);
          list.append(row);
        });
      };
      renderRows();
      const add = el("button", "", "\uFF0B \u9805\u76EE\u3092\u8FFD\u52A0");
      add.type = "button";
      add.addEventListener("click", () => {
        rowsState.push(["", ""]);
        renderRows();
      });
      wrap.append(list, add);
      return wrap;
    }
    function noteField(map, type, id) {
      const wrap = el("div", "editor-section");
      wrap.append(el("h4", "", "\u6587\u7AE0"));
      const { text, rich } = htmlToEditable(editActions.getNote(type, id));
      if (rich) {
        wrap.append(el("p", "hint", "\u66F8\u5F0F\uFF08HTML\uFF09\u3092\u542B\u3080\u6587\u7AE0\u306E\u305F\u3081\u3001\u66F8\u5F0F\u3092\u4FDD\u3063\u305F\u307E\u307E\u6B21\u306E\u3068\u304A\u308A\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002\u30D7\u30EC\u30FC\u30F3\u30C6\u30AD\u30B9\u30C8\u3068\u3057\u3066\u7DE8\u96C6\u3059\u308B\u3068\u66F8\u5F0F\u306F\u5931\u308F\u308C\u307E\u3059\u3002"));
      }
      const ta = document.createElement("textarea");
      ta.className = "note-field";
      ta.value = text;
      ta.rows = 4;
      ta.addEventListener("change", () => editActions.setNote(type, id, editableToHtml(ta.value, rich)));
      wrap.append(ta);
      return wrap;
    }
    function textField(label, value, onChange) {
      const row = el("label", "field");
      row.append(el("span", "field-label", label));
      const input = document.createElement("input");
      input.value = value ?? "";
      input.addEventListener("change", () => onChange(input.value));
      row.append(input);
      return row;
    }
    function table(rows) {
      const t = document.createElement("table");
      t.className = "editor-table";
      for (const [k, v] of rows) {
        const tr = document.createElement("tr");
        tr.append(el("th", "", k), el("td", "", String(v)));
        t.append(tr);
      }
      return t;
    }
    store.subscribe((state, change) => {
      if (current && change.type === "replace") close();
      else if (current) render();
    });
    return {
      openCell: (id) => open("cell", id),
      openBurg: (id) => open("burg", id),
      openMarker: (id) => open("marker", id),
      openEntity: (kind, id) => open(kind, id),
      close,
      promptBurgName(cb) {
        const name = prompt("\u65B0\u3057\u3044\u90FD\u5E02\u306E\u540D\u524D");
        cb(name);
      }
    };
  }

  // js/core/sim/units.js
  var UNIT_TYPES = Object.freeze([
    { key: "infantry", label: "\u6B69\u5175", unit: "\u4EBA", icon: "\u2694\uFE0F", power: 1, rural: 0.9, urban: 0.5, industryShare: 0 },
    { key: "armor", label: "\u6A5F\u7532", unit: "\u53F0", icon: "\u{1F6E1}\uFE0F", power: 8, rural: 0, urban: 0, industryShare: 0.35 },
    { key: "air", label: "\u822A\u7A7A", unit: "\u6A5F", icon: "\u2708\uFE0F", power: 15, rural: 0, urban: 0, industryShare: 0.25 },
    { key: "navy", label: "\u6D77\u8ECD", unit: "\u96BB", icon: "\u{1F6A2}", power: 40, rural: 0, urban: 0, industryShare: 0.2, naval: true },
    { key: "special", label: "\u7279\u6B8A\u90E8\u968A", unit: "\u4EBA", icon: "\u{1F396}\uFE0F", power: 4, rural: 0.02, urban: 0.03, industryShare: 0.05 },
    { key: "advanced", label: "\u5148\u7AEF\u6280\u8853", unit: "\u4EBA", icon: "\u{1F52C}", power: 6, rural: 0, urban: 0.02, industryShare: 0.15, minTech: 6 },
    { key: "nuclear", label: "\u6838", unit: "\u767A", icon: "\u2622\uFE0F", power: 500, rural: 0, urban: 0, industryShare: 0, minTech: 9 }
  ]);
  var UNIT_KEYS = UNIT_TYPES.map((u) => u.key);
  var UNIT_BY_KEY = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, u]));
  var DOCTRINES = Object.freeze([
    { key: "balanced", label: "\u5747\u8861", mult: { infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 } },
    { key: "mechanized", label: "\u6A5F\u7532\u91CD\u8996", mult: { infantry: 0.8, armor: 1.4, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 } },
    { key: "airpower", label: "\u822A\u7A7A\u91CD\u8996", mult: { infantry: 0.8, armor: 1, air: 1.5, navy: 1, special: 1, advanced: 1.1, nuclear: 1 } },
    { key: "attrition", label: "\u4EBA\u6D77\u6226\u8853", mult: { infantry: 1.4, armor: 0.9, air: 0.9, navy: 1, special: 1, advanced: 0.9, nuclear: 1 } }
  ]);
  var DOCTRINE_BY_KEY = Object.fromEntries(DOCTRINES.map((d) => [d.key, d]));
  function emptyForce() {
    return Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
  }
  function forcePower(units, doctrineKey = "balanced") {
    const mult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY.balanced.mult;
    let total = 0;
    for (const key of UNIT_KEYS) {
      const n = units?.[key] ?? 0;
      if (n > 0) total += n * UNIT_BY_KEY[key].power * (mult[key] ?? 1);
    }
    return total;
  }
  function forceHeadcount(units) {
    return UNIT_KEYS.reduce((sum, k) => sum + (units?.[k] ?? 0), 0);
  }

  // js/core/sim/economy.js
  var TECH_MIN = 1;
  var TECH_MAX = 10;
  var GROWTH_RATE_BY_TECH = (tech) => 6e-3 + (tech - 1) * 16e-4;
  var INDUSTRY_PER_CAPITA_BY_TECH = (tech) => 0.05 + (tech - 1) * 0.09;
  function ensureEconomy(state) {
    if (typeof state.techLevel !== "number") state.techLevel = 3;
    if (typeof state.industry !== "number") state.industry = 0;
    if (typeof state.popCarryCap !== "number") {
      state.popCarryCap = Math.max(1, (state.rural ?? 0) + (state.urban ?? 0)) * 3;
    }
    return state;
  }
  function computeAnnualUpdate(state) {
    const tech = clampTech(state.techLevel ?? 3);
    const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
    const cap = Math.max(1, state.popCarryCap ?? (pop * 3 || 1));
    const r = GROWTH_RATE_BY_TECH(tech);
    const growth = pop > 0 ? r * pop * (1 - pop / cap) : 0;
    const newPop = Math.max(0, pop + growth);
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
  var isLive7 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function regimentsOf(state) {
    return Array.isArray(state.military) ? state.military : [];
  }
  function nextRegimentId(state) {
    const list = regimentsOf(state);
    return list.length ? Math.max(...list.map((r) => r.i)) + 1 : 0;
  }
  function planCreateRegiment(map, stateId, cell, { name, icon = "\u{1F6E1}\uFE0F", doctrine = "balanced" } = {}) {
    const state = map.pack.states[stateId];
    if (!isLive7(state)) throw new Error("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("\u5730\u56F3\u306E\u5916\u306B\u306F\u914D\u7F6E\u3067\u304D\u307E\u305B\u3093");
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
      doctrine,
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
    if (patch.doctrine !== void 0 && patch.doctrine !== reg.doctrine) next.doctrine = patch.doctrine;
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
  function planAnnualConscription(map, stateId) {
    const state = map.pack.states[stateId];
    if (!isLive7(state)) return null;
    ensureEconomy(state);
    const capital = map.pack.burgs[state.capital];
    if (!capital) return null;
    const pop = (state.rural ?? 0) + (state.urban ?? 0);
    const industry = state.industry ?? 0;
    let list = regimentsOf(state);
    let home = list.find((r) => r.i === 0) ?? null;
    const delta = emptyForce();
    let any = false;
    for (const key of UNIT_KEYS) {
      const def = UNIT_BY_KEY[key];
      if (def.minTech && (state.techLevel ?? 3) < def.minTech) continue;
      const fromPop = pop / 1e3 * (def.rural + def.urban) * 0.15;
      const fromIndustry = def.industryShare > 0 ? industry * def.industryShare / (def.power / 4) : 0;
      const add = Math.round(fromPop + fromIndustry);
      if (add > 0) {
        delta[key] = add;
        any = true;
      }
    }
    if (!any) return null;
    const parts = [];
    if (home) {
      const u = { ...home.u };
      for (const k of UNIT_KEYS) u[k] = (u[k] ?? 0) + delta[k];
      parts.push(setProps(home, { u }));
    } else {
      const { p } = map.geometry.pack;
      const cell = capital.cell;
      const reg = { i: 0, name: `${state.name}\u56FD\u9632\u672C\u968A`, icon: "\u{1F6E1}\uFE0F", state: stateId, cell, x: p[cell][0], y: p[cell][1], bx: p[cell][0], by: p[cell][1], doctrine: "balanced", u: delta };
      parts.push(setList((m) => m.pack.states[stateId].military, (m, v) => {
        m.pack.states[stateId].military = v;
      }, [reg, ...list]));
    }
    return makeCommand("\u5E74\u6B21\u5FB4\u5175", [], parts);
  }

  // js/core/sim/battle.js
  function applyLosses(units, fraction) {
    const out = { ...units };
    for (const k of UNIT_KEYS) out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
    return out;
  }
  function simulateBattle(attacker, defender, rnd) {
    const aPower = forcePower(attacker.units, attacker.doctrine);
    const dPower = forcePower(defender.units, defender.doctrine);
    if (aPower <= 0 && dPower <= 0) throw new Error("\u4E21\u8ECD\u3068\u3082\u6226\u529B\u304C\u3042\u308A\u307E\u305B\u3093");
    const noise = () => rnd.float(0.85, 1.15);
    const aRoll = aPower * noise();
    const dRoll = dPower * noise();
    const winner = aRoll >= dRoll ? "attacker" : "defender";
    const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
    const winnerLoss = clamp(0.03 + 0.09 / ratio, 0.03, 0.12);
    const loserLoss = clamp(0.4 - 0.25 / ratio, 0.15, 0.4);
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
  function planResolveBattle(map, a, b, rnd) {
    const aState = map.pack.states[a.stateId], bState = map.pack.states[b.stateId];
    const aReg = regimentsOf(aState).find((r) => r.i === a.regId);
    const bReg = regimentsOf(bState).find((r) => r.i === b.regId);
    if (!aReg) throw new Error("\u653B\u6483\u5074\u306E\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (!bReg) throw new Error("\u9632\u5FA1\u5074\u306E\u90E8\u968A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (a.stateId === b.stateId) throw new Error("\u540C\u3058\u56FD\u5BB6\u306E\u90E8\u968A\u3069\u3046\u3057\u3067\u306F\u6226\u95D8\u3067\u304D\u307E\u305B\u3093");
    const result = simulateBattle(
      { units: aReg.u, doctrine: aReg.doctrine },
      { units: bReg.u, doctrine: bReg.doctrine },
      rnd
    );
    const parts = [
      setProps(aReg, { u: applyLosses(aReg.u, result.attackerLossFraction) }),
      setProps(bReg, { u: applyLosses(bReg.u, result.defenderLossFraction) })
    ];
    const command = makeCommand(`\u6226\u95D8\uFF08${aReg.name} vs ${bReg.name}\uFF09`, [], parts);
    return { command, result };
  }
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  function round(v) {
    return Math.round(v * 100) / 100;
  }

  // js/core/edit/alliances.js
  var isLive8 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function listAlliances(map) {
    return map.ext?.data?.alliances ?? [];
  }
  function nextAllianceId(map) {
    const list = listAlliances(map);
    return list.length ? Math.max(...list.map((a) => a.id)) + 1 : 1;
  }
  function planCreateAlliance(map, name, memberIds) {
    const uniq = [...new Set(memberIds)];
    if (uniq.length < 2) throw new Error("\u540C\u76DF\u306B\u306F2\u30AB\u56FD\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059");
    for (const id of uniq) if (!isLive8(map.pack.states[id])) throw new Error(`\u56FD\u5BB6#${id}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
    const alliance = { id: nextAllianceId(map), name: name || "\u65B0\u3057\u3044\u540C\u76DF", members: uniq };
    const before = listAlliances(map);
    const write = (m, list) => {
      const ext = ensureExt(m);
      ext.data.alliances = list;
      if (!list.length) delete ext.data.alliances;
    };
    return {
      command: makeCommand(`\u540C\u76DF\u3092\u7D50\u6210\uFF08${alliance.name}\uFF09`, [], [{ apply: (m) => write(m, [...before, alliance]), revert: (m) => write(m, before) }]),
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
    if (nextName === a.name && JSON.stringify(nextMembers) === JSON.stringify(a.members)) return null;
    const before = list;
    const after = list.map((x) => x.id === allianceId ? { ...x, name: nextName, members: nextMembers } : x);
    const write = (m, v) => {
      ensureExt(m).data.alliances = v;
    };
    return makeCommand("\u540C\u76DF\u3092\u7DE8\u96C6", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function planDissolveAlliance(map, allianceId) {
    const list = listAlliances(map);
    if (!list.some((a) => a.id === allianceId)) throw new Error("\u305D\u306E\u540C\u76DF\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const before = list;
    const after = list.filter((a) => a.id !== allianceId);
    const write = (m, v) => {
      const ext = ensureExt(m);
      ext.data.alliances = v;
      if (!v.length) delete ext.data.alliances;
    };
    return makeCommand("\u540C\u76DF\u3092\u89E3\u6D88", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
  }
  function alliancesOf(map, stateId) {
    return listAlliances(map).filter((a) => a.members.includes(stateId));
  }

  // js/core/edit/wars.js
  var isLive9 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
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
  function planDeclareWar(map, { name, attackers, defenders, date }) {
    const a = [...new Set(attackers)], d = [...new Set(defenders)];
    if (!a.length || !d.length) throw new Error("\u653B\u6483\u5074\u30FB\u9632\u5FA1\u5074\u3068\u30821\u30AB\u56FD\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059");
    for (const id of [...a, ...d]) if (!isLive9(map.pack.states[id])) throw new Error(`\u56FD\u5BB6#${id}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
    if (a.some((id) => d.includes(id))) throw new Error("\u540C\u3058\u56FD\u5BB6\u304C\u4E21\u9663\u55B6\u306B\u5165\u3063\u3066\u3044\u307E\u3059");
    const aNames = a.map((id) => map.pack.states[id].name), dNames = d.map((id) => map.pack.states[id].name);
    const war = {
      id: nextWarId(map),
      name: name || `${aNames[0]}\u5BFE${dNames[0]}\u6226\u4E89`,
      attackers: a,
      defenders: d,
      startedAt: date,
      endedAt: null,
      battles: [],
      advantage: {}
    };
    const before = listWars(map);
    return { command: makeCommand(`\u5BA3\u6226\u5E03\u544A\uFF08${war.name}\uFF09`, [], [{ apply: (m) => writeWars(m, [...before, war]), revert: (m) => writeWars(m, before) }]), id: war.id };
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
    return [...byProvince, ...byRegion].sort((a, b) => b.cells - a.cells);
  }
  function planSignPeace(map, warId, terms, date) {
    const list = listWars(map);
    const war = list.find((w) => w.id === warId);
    if (!war) throw new Error("\u305D\u306E\u6226\u4E89\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (war.endedAt) throw new Error("\u65E2\u306B\u7D42\u7D50\u3057\u3066\u3044\u307E\u3059");
    if (!isLive9(map.pack.states[terms.toStateId])) throw new Error("\u5272\u8B72\u5148\u306E\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u307E\u305B\u3093");
    const parts = [];
    const c = map.pack.cells;
    const moveCells = (cells) => {
      if (!cells.length) return;
      const changes = cells.map((i) => [i, c.state[i], terms.toStateId]);
      parts.push(setIndexed((m) => m.pack.cells.state, changes));
      for (const b of map.pack.burgs) {
        if (b && b.i && !b.removed && cells.includes(b.cell)) parts.push(setProps(b, { state: terms.toStateId }));
      }
    };
    for (const pid of terms.provinceIds ?? []) {
      const cells = [];
      for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i);
      moveCells(cells);
      const province = map.pack.provinces[pid];
      if (province) parts.push(setProps(province, { state: terms.toStateId }));
    }
    for (const cells of terms.regionCells ?? []) moveCells(cells);
    if (terms.reparations) {
      const from = map.pack.states[war.defenders.includes(terms.toStateId) ? war.attackers[0] : war.defenders[0]];
      if (from && typeof from.industry === "number") parts.push(setProps(from, { industry: Math.max(0, from.industry - terms.reparations) }));
    }
    const before = list;
    const after = list.map((w) => w.id !== warId ? w : { ...w, endedAt: date, terms });
    parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) });
    return makeCommand(`\u8B1B\u548C\u6761\u7D04\uFF08${war.name}\uFF09`, ["politics"], parts);
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
          store.beginBatch(`\u6226\u95D8\uFF08${map.pack.states[a.stateId].name} vs ${map.pack.states[b.stateId].name}\uFF09`);
          store.commit(command);
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
      createAlliance(name, memberIds) {
        return withMap((map) => safeRun("\u540C\u76DF\u306E\u7D50\u6210", () => {
          const r = planCreateAlliance(map, name, memberIds);
          commitOrThrow(r.command);
          return r.id;
        }));
      },
      editAlliance(id, patch) {
        withMap((map) => safeRun("\u540C\u76DF\u306E\u7DE8\u96C6", () => commitOrThrow(planEditAlliance(map, id, patch))));
      },
      dissolveAlliance(id) {
        withMap((map) => safeRun("\u540C\u76DF\u306E\u89E3\u6D88", () => commitOrThrow(planDissolveAlliance(map, id))));
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
          commitOrThrow(r.command);
          return r.id;
        }));
      },
      suggestCessions(attackerId, defenderId) {
        return withMap((map) => suggestCessions(map, attackerId, defenderId)) ?? [];
      },
      signPeace(warId, terms) {
        withMap((map) => safeRun("\u8B1B\u548C\u6761\u7D04", () => commitOrThrow(planSignPeace(map, warId, terms, currentDate()))));
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

  // js/core/sim/world.js
  var isLive10 = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
  function planAnnualUpdate(map) {
    const parts = [];
    for (const state of map.pack.states) {
      if (!isLive10(state)) continue;
      ensureEconomy(state);
      const { rural, urban, industry } = computeAnnualUpdate(state);
      if (rural !== state.rural || urban !== state.urban || industry !== state.industry) {
        parts.push(setProps(state, { rural, urban, industry }));
      }
      const conscription = planAnnualConscription(map, state.i);
      if (conscription) parts.push(...conscription.parts);
    }
    if (!parts.length) return null;
    return makeCommand("\u5E74\u6B21\u66F4\u65B0\uFF08\u4EBA\u53E3\u30FB\u7523\u696D\u30FB\u5FB4\u5175\uFF09", ["politics", "places"], parts);
  }

  // js/app/time-actions.js
  var DEFAULT_MS_PER_MONTH = 2 * 60 * 1e3 / 12;
  function createTimeActions({ store, renderer }) {
    let timer = null;
    let msPerMonth = DEFAULT_MS_PER_MONTH;
    function tick() {
      const map = store.getState().map;
      if (!map) return;
      const { time, yearChanged } = advanceMonth(map.worldTime);
      store.update((s) => {
        s.map.worldTime = time;
      });
      if (yearChanged) {
        const cmd = planAnnualUpdate(map);
        if (cmd) store.commit(cmd);
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
      /** 新しい地図を読み込んだときに時計をリセットし、進行中なら止める */
      resetForNewMap() {
        this.stop();
        store.update((s) => {
          if (s.map) s.map.worldTime = createWorldTime();
        });
      }
    };
  }

  // js/ui/time-bar.js
  function initTimeBar({ store, timeActions }) {
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
    function sync() {
      const state = store.getState();
      const hasMap = !!state.map;
      toggleBtn.disabled = !hasMap;
      stepBtn.disabled = !hasMap;
      speedSel.disabled = !hasMap;
      const running = !!state.timeRunning;
      toggleBtn.textContent = running ? "\u23F8 \u505C\u6B62" : "\u25B6 \u958B\u59CB";
      toggleBtn.classList.toggle("running", running);
      dateEl.textContent = hasMap ? formatWorldTime(state.map.worldTime) : "\u2014";
    }
    store.subscribe(sync);
    sync();
  }

  // js/ui/military-dialog.js
  function initMilitaryDialog({ store, editActions, panels }) {
    const dialog = byId("military-dialog");
    const openBtn = byId("btn-open-military");
    const closeBtn = byId("military-close");
    const tabs = [...document.querySelectorAll(".tab-btn")];
    const panelsEl = { regiments: byId("tab-regiments"), wars: byId("tab-wars"), alliances: byId("tab-alliances") };
    let pending = null;
    function open(tabName) {
      if (!store.getState().map) return;
      dialog.showModal();
      if (tabName) setTab(tabName);
      panels.military.render();
      panels.wars.render();
      panels.alliances.render();
    }
    function close() {
      dialog.close();
    }
    openBtn.addEventListener("click", () => open());
    closeBtn.addEventListener("click", close);
    dialog.addEventListener("cancel", () => {
      pending = null;
    });
    function setTab(name) {
      for (const t of tabs) t.classList.toggle("active", t.dataset.tab === name);
      for (const [k, el5] of Object.entries(panelsEl)) el5.hidden = k !== name;
    }
    for (const t of tabs) t.addEventListener("click", () => setTab(t.dataset.tab));
    byId("tab-regiments").addEventListener("request-place-regiment", (e) => {
      pending = { type: "place", stateId: e.detail.stateId };
      close();
      store.update((s) => {
        s.hint = "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u90E8\u968A\u3092\u914D\u7F6E\u3059\u308B\u5834\u6240\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044";
      });
    });
    byId("tab-regiments").addEventListener("request-move-regiment", (e) => {
      pending = { type: "move", stateId: e.detail.stateId, regId: e.detail.regId };
      close();
      store.update((s) => {
        s.hint = "\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u79FB\u52D5\u5148\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044";
      });
    });
    return {
      get pending() {
        return pending;
      },
      /** map-view から呼ばれる: クリックされたセルを、待ち受け中の配置/移動に使う */
      consumeMapClick(cell) {
        if (!pending) return false;
        if (pending.type === "place") {
          const simActions = panels.simActions;
          const id = simActions.createRegiment(pending.stateId, cell, {});
          if (id != null) {
            pending = null;
            store.update((s) => {
              s.hint = null;
            });
            open("regiments");
          }
        } else if (pending.type === "move") {
          panels.simActions.moveRegiment(pending.stateId, pending.regId, cell);
          pending = null;
          store.update((s) => {
            s.hint = null;
          });
          open("regiments");
        }
        return true;
      },
      cancelPending() {
        pending = null;
        store.update((s) => {
          s.hint = null;
        });
      },
      open,
      close,
      setTab
    };
  }

  // js/ui/panels/military-panel.js
  var el2 = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var isLive11 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initMilitaryPanel({ store, simActions, editActions }) {
    const root = byId("tab-regiments");
    let selectedState = null;
    let attackPick = null;
    function render() {
      root.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        root.append(el2("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive11);
      if (selectedState == null || !states.some((s) => s.i === selectedState)) selectedState = states[0]?.i ?? null;
      const picker = el2("div", "state-picker");
      picker.append(el2("span", "field-label", "\u56FD\u5BB6"));
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
        render();
      });
      picker.append(sel);
      const addBtn = el2("button", "", "\uFF0B \u65B0\u3057\u3044\u90E8\u968A\u3092\u7DE8\u6210\uFF08\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u914D\u7F6E\uFF09");
      addBtn.type = "button";
      addBtn.addEventListener("click", () => {
        root.dispatchEvent(new CustomEvent("request-place-regiment", { detail: { stateId: selectedState }, bubbles: true }));
      });
      picker.append(addBtn);
      root.append(picker);
      if (!states.length) {
        root.append(el2("p", "muted", "\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      const list = el2("div", "regiment-list");
      const regs = simActions.regimentsOf(selectedState);
      if (!regs.length) list.append(el2("p", "muted", "\u3053\u306E\u56FD\u306B\u306F\u307E\u3060\u90E8\u968A\u304C\u3042\u308A\u307E\u305B\u3093"));
      for (const r of regs) list.append(regimentCard(map, selectedState, r));
      root.append(list);
    }
    function regimentCard(map, stateId, reg) {
      const card = el2("div", "regiment-card");
      const head = el2("div", "regiment-card-head");
      const nameInput = document.createElement("input");
      nameInput.value = reg.name;
      nameInput.style.fontWeight = "600";
      nameInput.style.background = "transparent";
      nameInput.style.border = "0";
      nameInput.style.width = "auto";
      nameInput.style.flex = "1";
      nameInput.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { name: nameInput.value }));
      const disbandBtn = el2("button", "danger", "\u89E3\u6563");
      disbandBtn.type = "button";
      disbandBtn.addEventListener("click", () => {
        if (confirm(`\u300C${reg.name}\u300D\u3092\u89E3\u6563\u3057\u307E\u3059\u304B\uFF1F`)) simActions.disbandRegiment(stateId, reg.i);
      });
      head.append(nameInput, disbandBtn);
      card.append(head);
      const cellInfo = el2("p", "muted", `\u914D\u7F6E: \u30BB\u30EB#${reg.cell}`);
      card.append(cellInfo);
      const doctrineRow = el2("label", "field");
      doctrineRow.append(el2("span", "field-label", "\u30C9\u30AF\u30C8\u30EA\u30F3"));
      const dsel = document.createElement("select");
      for (const d of DOCTRINES) {
        const o = document.createElement("option");
        o.value = d.key;
        o.textContent = d.label;
        if (d.key === (reg.doctrine ?? "balanced")) o.selected = true;
        dsel.append(o);
      }
      dsel.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { doctrine: dsel.value }));
      doctrineRow.append(dsel);
      card.append(doctrineRow);
      const units = el2("div", "regiment-units");
      for (const u of UNIT_TYPES) {
        const field = el2("div", "unit-field");
        field.append(el2("span", "", `${u.icon} ${u.label}`));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.value = reg.u?.[u.key] ?? 0;
        input.addEventListener("change", () => simActions.editRegiment(stateId, reg.i, { u: { [u.key]: Number(input.value) || 0 } }));
        field.append(input);
        units.append(field);
      }
      card.append(units);
      card.append(el2("p", "regiment-power", `\u7DCF\u6226\u529B: ${Math.round(forcePower(reg.u, reg.doctrine)).toLocaleString()}\u3000\u7DCF\u5175\u54E1/\u6A5F\u6570: ${forceHeadcount(reg.u).toLocaleString()}`));
      const actions = el2("div", "regiment-actions");
      const moveBtn = el2("button", "", "\u79FB\u52D5\uFF08\u5730\u56F3\u3092\u30AF\u30EA\u30C3\u30AF\uFF09");
      moveBtn.type = "button";
      moveBtn.addEventListener("click", () => root.dispatchEvent(new CustomEvent("request-move-regiment", { detail: { stateId, regId: reg.i }, bubbles: true })));
      const attackBtn = el2("button", "", attackPick && attackPick.stateId === stateId && attackPick.regId === reg.i ? "\u5BFE\u8C61\u3092\u9078\u629E\u4E2D\u2026" : "\u653B\u6483\u3059\u308B");
      attackBtn.type = "button";
      attackBtn.addEventListener("click", () => {
        attackPick = { stateId, regId: reg.i };
        render();
      });
      actions.append(moveBtn, attackBtn);
      card.append(actions);
      if (attackPick && !(attackPick.stateId === stateId)) {
        const row = el2("div", "attack-target");
        row.append(el2("span", "", `${attackPick.regId != null ? "\u653B\u6483\u5BFE\u8C61\u3068\u3057\u3066" : ""} \u300C${reg.name}\u300D\u3092\u9078\u629E:`));
        const go = el2("button", "danger", "\u3053\u306E\u90E8\u968A\u3092\u653B\u6483");
        go.type = "button";
        go.addEventListener("click", () => {
          const result = simActions.attack(attackPick, { stateId, regId: reg.i });
          attackPick = null;
          if (result) alert(formatBattleResult(map, result));
          render();
        });
        row.append(go);
        card.append(row);
      }
      return card;
    }
    function formatBattleResult(map, r) {
      const winLabel = r.winner === "attacker" ? "\u653B\u6483\u5074\u306E\u52DD\u5229" : "\u9632\u5FA1\u5074\u306E\u52DD\u5229";
      return `${winLabel}
\u653B\u6483\u5074 \u6226\u529B${r.aPower} \u88AB\u5BB3${(r.attackerLossFraction * 100).toFixed(0)}%\uFF08${r.attackerCasualties}\uFF09
\u9632\u5FA1\u5074 \u6226\u529B${r.dPower} \u88AB\u5BB3${(r.defenderLossFraction * 100).toFixed(0)}%\uFF08${r.defenderCasualties}\uFF09`;
    }
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) render();
    });
    return {
      render,
      selectState(id) {
        selectedState = id;
        render();
      },
      get selectedState() {
        return selectedState;
      },
      cancelAttackPick() {
        attackPick = null;
        render();
      }
    };
  }

  // js/ui/panels/wars-panel.js
  var el3 = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var isLive12 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initWarsPanel({ store, simActions }) {
    const root = byId("tab-wars");
    function render() {
      root.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        root.append(el3("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive12);
      root.append(declareForm(map, states));
      const wars = simActions.listWars().slice().reverse();
      if (!wars.length) {
        root.append(el3("p", "muted", "\u6226\u4E89\u306E\u8A18\u9332\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      for (const w of wars) root.append(warCard(map, states, w));
    }
    function stateName(map, id) {
      return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    }
    function declareForm(map, states) {
      const wrap = el3("div", "editor-section");
      wrap.append(el3("h4", "", "\u5BA3\u6226\u5E03\u544A"));
      const row = el3("div", "member-picker");
      const aSel = document.createElement("select");
      const bSel = document.createElement("select");
      for (const s of states) {
        const o1 = document.createElement("option");
        o1.value = s.i;
        o1.textContent = s.name;
        aSel.append(o1);
      }
      for (const s of states) {
        const o2 = document.createElement("option");
        o2.value = s.i;
        o2.textContent = s.name;
        bSel.append(o2);
      }
      if (states[1]) bSel.value = String(states[1].i);
      const nameInput = document.createElement("input");
      nameInput.placeholder = "\u6226\u4E89\u306E\u540D\u524D\uFF08\u7701\u7565\u53EF\uFF09";
      const go = el3("button", "danger", "\u5BA3\u6226\u5E03\u544A\u3059\u308B");
      go.type = "button";
      go.addEventListener("click", () => {
        if (aSel.value === bSel.value) {
          alert("\u540C\u3058\u56FD\u5BB6\u3069\u3046\u3057\u3067\u306F\u6226\u4E89\u3067\u304D\u307E\u305B\u3093");
          return;
        }
        simActions.declareWar([Number(aSel.value)], [Number(bSel.value)], nameInput.value || void 0);
      });
      row.append(el3("span", "", "\u653B\u6483\u5074"), aSel, el3("span", "", "\u9632\u5FA1\u5074"), bSel);
      wrap.append(row, nameInput, go);
      return wrap;
    }
    function warCard(map, states, w) {
      const card = el3("div", `war-card${w.endedAt ? " ended" : ""}`);
      card.append(el3("div", "war-title", w.name));
      const aNames = w.attackers.map((id) => stateName(map, id)).join("\u30FB");
      const dNames = w.defenders.map((id) => stateName(map, id)).join("\u30FB");
      card.append(el3("div", "war-meta", `${aNames} \u5BFE ${dNames}\u3000\u958B\u6226: ${formatWorldTime(w.startedAt)}${w.endedAt ? `\u3000\u7D42\u7D50: ${formatWorldTime(w.endedAt)}` : ""}`));
      const log = el3("div", "battle-log");
      if (w.battles.length) {
        for (const b of w.battles.slice(-8).reverse()) {
          log.append(el3("div", "", `${b.year}\u5E74${b.month}\u6708 ${stateName(map, b.attackerState)} vs ${stateName(map, b.defenderState)} \u2192 ${b.winner === "attacker" ? "\u653B\u6483\u5074" : "\u9632\u5FA1\u5074"}\u306E\u52DD\u5229`));
        }
      } else log.append(el3("div", "", "\u307E\u3060\u6226\u95D8\u306E\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093"));
      card.append(log);
      if (!w.endedAt) {
        const adv = w.advantage[w.attackers[0]] ?? 0;
        card.append(el3("p", "muted", `\u512A\u52E2\u5EA6\uFF08\u653B\u6483\u5074\u57FA\u6E96\uFF09: ${adv > 0 ? "+" : ""}${adv}`));
        card.append(peaceForm(map, states, w));
      } else {
        card.append(el3("p", "muted", "\u3053\u306E\u6226\u4E89\u306F\u7D42\u7D50\u3057\u307E\u3057\u305F"));
      }
      return card;
    }
    function peaceForm(map, states, w) {
      const wrap = el3("div", "editor-section");
      wrap.append(el3("h4", "", "\u8B1B\u548C\u6761\u7D04"));
      const dirRow = el3("div", "member-picker");
      const aTo = el3("button", "", `${stateName(map, w.attackers[0])}\u306B\u5272\u8B72`);
      const dTo = el3("button", "", `${stateName(map, w.defenders[0])}\u306B\u5272\u8B72`);
      let direction = "attacker";
      const syncDir = () => {
        aTo.classList.toggle("active", direction === "attacker");
        dTo.classList.toggle("active", direction === "defender");
        refreshList();
      };
      aTo.type = "button";
      dTo.type = "button";
      aTo.addEventListener("click", () => {
        direction = "attacker";
        syncDir();
      });
      dTo.addEventListener("click", () => {
        direction = "defender";
        syncDir();
      });
      dirRow.append(aTo, dTo);
      wrap.append(dirRow);
      const listEl = el3("div", "cession-list");
      wrap.append(listEl);
      const checks = [];
      function refreshList() {
        listEl.replaceChildren();
        checks.length = 0;
        const from = direction === "attacker" ? w.defenders[0] : w.attackers[0];
        const to = direction === "attacker" ? w.attackers[0] : w.defenders[0];
        const candidates = simActions.suggestCessions(to, from);
        if (!candidates.length) {
          listEl.append(el3("p", "muted", "\u5272\u8B72\u3067\u304D\u305D\u3046\u306A\u5730\u57DF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u56FD\u5883\u304C\u63A5\u3057\u3066\u3044\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\uFF09"));
          return;
        }
        for (const c of candidates) {
          const row = el3("label", "cession-item");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.type = c.type;
          if (c.type === "province") cb.dataset.provinceId = c.provinceId;
          else cb.__regionCells = c.regionCells;
          row.append(cb, el3("span", "", `${c.name}\uFF08${c.cells}\u30BB\u30EB\uFF09`));
          listEl.append(row);
          checks.push(cb);
        }
      }
      refreshList();
      const repRow = el3("label", "field");
      repRow.append(el3("span", "field-label", "\u8CE0\u511F\u91D1\uFF08\u76F8\u624B\u306E\u7523\u696D\u529B\u304B\u3089\u5DEE\u3057\u5F15\u304F\u30FB\u4EFB\u610F\uFF09"));
      const repInput = document.createElement("input");
      repInput.type = "number";
      repInput.min = "0";
      repInput.value = "0";
      repRow.append(repInput);
      wrap.append(repRow);
      const signBtn = el3("button", "danger", "\u3053\u306E\u5185\u5BB9\u3067\u8B1B\u548C\u3059\u308B");
      signBtn.type = "button";
      signBtn.addEventListener("click", () => {
        const provinceIds = checks.filter((c) => c.checked && c.dataset.type === "province").map((c) => Number(c.dataset.provinceId));
        const regionCells = checks.filter((c) => c.checked && c.dataset.type === "region").map((c) => c.__regionCells);
        const toStateId = direction === "attacker" ? w.attackers[0] : w.defenders[0];
        simActions.signPeace(w.id, { provinceIds, regionCells, toStateId, reparations: Number(repInput.value) || 0 });
      });
      wrap.append(signBtn);
      return wrap;
    }
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) render();
    });
    return { render };
  }

  // js/ui/panels/alliances-panel.js
  var el4 = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var isLive13 = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
  function initAlliancesPanel({ store, simActions }) {
    const root = byId("tab-alliances");
    function render() {
      root.replaceChildren();
      const map = store.getState().map;
      if (!map) {
        root.append(el4("p", "muted", "\u5730\u56F3\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044"));
        return;
      }
      const states = map.pack.states.filter(isLive13);
      root.append(createForm(map, states));
      const list = simActions.listAlliances();
      if (!list.length) {
        root.append(el4("p", "muted", "\u540C\u76DF\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093"));
        return;
      }
      for (const a of list) root.append(allianceCard(map, states, a));
    }
    function stateName(map, id) {
      return map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
    }
    function memberPicker(states, checkedIds = []) {
      const wrap = el4("div", "member-picker");
      const boxes = [];
      for (const s of states) {
        const label = el4("label", "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = s.i;
        cb.checked = checkedIds.includes(s.i);
        label.append(cb, document.createTextNode(s.name));
        wrap.append(label);
        boxes.push(cb);
      }
      return { wrap, boxes };
    }
    function createForm(map, states) {
      const wrap = el4("div", "editor-section");
      wrap.append(el4("h4", "", "\u65B0\u3057\u3044\u540C\u76DF"));
      const nameInput = document.createElement("input");
      nameInput.placeholder = "\u540C\u76DF\u306E\u540D\u524D";
      wrap.append(nameInput);
      const { wrap: picker, boxes } = memberPicker(states);
      wrap.append(picker);
      const go = el4("button", "", "\u540C\u76DF\u3092\u7D50\u6210\uFF082\u30AB\u56FD\u4EE5\u4E0A\u3092\u9078\u629E\uFF09");
      go.type = "button";
      go.addEventListener("click", () => {
        const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
        if (ids.length < 2) {
          alert("2\u30AB\u56FD\u4EE5\u4E0A\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
          return;
        }
        simActions.createAlliance(nameInput.value, ids);
      });
      wrap.append(go);
      return wrap;
    }
    function allianceCard(map, states, a) {
      const card = el4("div", "alliance-card");
      const head = el4("div", "regiment-card-head");
      const nameInput = document.createElement("input");
      nameInput.value = a.name;
      nameInput.style.fontWeight = "600";
      nameInput.style.background = "transparent";
      nameInput.style.border = "0";
      nameInput.style.flex = "1";
      nameInput.addEventListener("change", () => simActions.editAlliance(a.id, { name: nameInput.value }));
      const delBtn = el4("button", "danger", "\u89E3\u6D88");
      delBtn.type = "button";
      delBtn.addEventListener("click", () => {
        if (confirm(`\u300C${a.name}\u300D\u3092\u89E3\u6D88\u3057\u307E\u3059\u304B\uFF1F`)) simActions.dissolveAlliance(a.id);
      });
      head.append(nameInput, delBtn);
      card.append(head);
      const chips = el4("div", "member-chip-list");
      for (const id of a.members) chips.append(el4("span", "member-chip", stateName(map, id)));
      card.append(chips);
      const { wrap: picker, boxes } = memberPicker(states, a.members);
      card.append(el4("p", "muted", "\u52A0\u76DF\u56FD\u306E\u5909\u66F4:"));
      card.append(picker);
      const update = el4("button", "", "\u30E1\u30F3\u30D0\u30FC\u3092\u66F4\u65B0");
      update.type = "button";
      update.addEventListener("click", () => {
        const ids = boxes.filter((b) => b.checked).map((b) => Number(b.value));
        if (ids.length < 2) {
          alert("2\u30AB\u56FD\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059");
          return;
        }
        simActions.editAlliance(a.id, { members: ids });
      });
      card.append(update);
      return card;
    }
    store.subscribe((_s, change) => {
      if (["replace", "commit", "undo", "redo"].includes(change.type)) render();
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
      view: { overlay: "state", base: "biome", coast: true, rivers: true, routes: true, burgs: true, labels: true },
      editTool: "select",
      brushRadius: 40,
      timeRunning: false,
      timeSpeed: 12e4,
      hint: null
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
    const timeActions = createTimeActions({ store, renderer });
    const editorPanel = initEditorPanel({ store, editActions });
    const militaryPanel = initMilitaryPanel({ store, simActions, editActions });
    const warsPanel = initWarsPanel({ store, simActions });
    const alliancesPanel = initAlliancesPanel({ store, simActions });
    const panels = { ...editorPanel, simActions, military: militaryPanel, wars: warsPanel, alliances: alliancesPanel };
    const deps = { store, viewport, renderer, actions, editActions, simActions, timeActions, panels, openFileDialog: files.open, openHelp: help.open };
    initBanner(deps);
    initToolbar(deps);
    initLegend(deps);
    initStatusBar(deps);
    initMapView(deps);
    const editMode = initEditMode(deps);
    const editToolbar = initEditToolbar({ store, editMode });
    const militaryDialog = initMilitaryDialog(deps);
    editMode.setMilitaryDialog(militaryDialog);
    initTimeBar({ store, timeActions });
    store.subscribe((_s, change) => {
      if (change.type === "replace") timeActions.stop();
    });
    initShortcuts({ ...deps, editMode, editToolbar, timeActions, militaryDialog });
    new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
    renderer.resize();
    globalThis.alterhistory = { store, viewport, renderer, actions, editActions, simActions, timeActions, militaryDialog };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
