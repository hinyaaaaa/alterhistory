// 球面世界のアクション（v4.0.0）。世界の生成・保存・読み込み・初期集団の選択・地形編集の「意味」を実装する。
// UI（DOM）はここを呼ぶだけ。依存はすべて注入（テストで差し替え可能）。旧エディタ（Azgaar 系の地図）とは独立している。
import { normalizeWorldSpec } from "../core/world/spec.js";
import { LAND_WATER, BIOME_NAMES, RES_NAMES, placeInitialGroups, validateWorld } from "../core/world/worldgen.js";
import { encodeAhmap2, decodeAhmap2, readAhmap2Manifest, Ahmap2Error, AHMAP2_MAGIC } from "../core/world/ahmap2.js";
import { createWorldEditor } from "../core/world/edit.js";
import { SOIL_NAMES } from "../render/world-colors.js";

export const WORLD_EXT = ".ahmap";
const START_CHUNK = "entities.start";
const enc = new TextEncoder(), dec = new TextDecoder();

export function createWorldStore(initial) {
  let state = initial; const subs = new Set();
  return { getState: () => state, update(fn) { const next = { ...state }; fn(next); state = next; for (const s of subs) s(state); }, subscribe(fn) { subs.add(fn); return () => subs.delete(fn); } };
}

/** 先頭の 8 バイトが .ahmap v2 のマジックか */
export function isAhmap2Bytes(bytes) { return bytes.length >= 8 && new TextDecoder().decode(bytes.subarray(0, 8)) === AHMAP2_MAGIC; }

/**
 * @param deps.service   createWorldService() の戻り値
 * @param deps.download  (blob, fileName) => void
 * @param deps.appVersion string
 */
export function createWorldActions({ service, download, appVersion = "" }) {
  const store = createWorldStore({
    world: null, fileName: "", mode: "view", layer: "biome", layerOpt: {}, busy: null, error: null, notice: null, hover: -1, selectedCell: -1,
    startGroupId: null, brush: { mode: "raise", radiusKm: 600, deltaM: 400, target: 0 }, dirty: false, undoCount: 0, canUndo: false, canRedo: false, groupVariant: 0, placing: false,
  });
  let editor = null, extensions = {}, chunkCache = null, noticeTimer = 0, gen = 0;
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) l(e); };
  const notice = (text) => { store.update((s) => { s.notice = text; }); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => store.update((s) => { s.notice = null; }), 6000); };
  const fail = (msg) => store.update((s) => { s.busy = null; s.error = msg; });
  const syncHistory = () => store.update((s) => { s.undoCount = editor?.undoCount ?? 0; s.canUndo = !!editor?.canUndo; s.canRedo = !!editor?.canRedo; });

  function adopt(world, fileName, { start = null, variant = 0, dirty = false } = {}) {
    editor = createWorldEditor(world);
    store.update((s) => { s.world = world; s.fileName = fileName; s.error = null; s.busy = null; s.hover = -1; s.selectedCell = -1; s.startGroupId = start; s.dirty = dirty; s.groupVariant = variant; s.placing = false; s.mode = start ? "view" : "groups"; });
    syncHistory(); emit({ type: "world" });
  }

  const api = {
    store, on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** 新しい世界を作る。specInput: WorldSpec（worldSeed 必須） */
    async newWorld(specInput) {
      const { spec, errors } = normalizeWorldSpec(specInput);
      if (errors.length) { fail("設定が不正です: " + errors.join(" / ")); return { ok: false, errors }; }
      const my = ++gen;
      store.update((s) => { s.busy = { label: "世界を生成中…", fraction: 0, stage: "" }; s.error = null; });
      try {
        const world = await service.generate(spec, { onProgress: (p) => { if (my === gen) store.update((s) => { s.busy = { label: `世界を生成中: ${p.label ?? p.stage}`, fraction: p.fraction === 1 ? 0.99 : 0.5, stage: p.stage }; }); } });
        if (my !== gen) return { ok: false, cancelled: true };
        extensions = {}; chunkCache = null; world.entities.start = null;
        adopt(world, `${world.spec.worldSeed}${WORLD_EXT}`, { dirty: true });
        const g = world.generation; if (g?.rejected?.length) notice(`統計の許容帯に入るまで ${g.attempts} 回作り直しました（破棄したシード: ${g.rejected.map((r) => r.seed).join("、")}）。使ったシード: ${g.seedUsed}`);
        return { ok: true, world };
      } catch (e) {
        if (e.name === "Cancelled") { store.update((s) => { s.busy = null; }); return { ok: false, cancelled: true }; }
        fail(`世界の生成に失敗しました: ${e.message}`); return { ok: false, error: e.message };
      }
    },
    cancelGeneration() { gen++; service.cancel(); store.update((s) => { s.busy = null; }); },

    /** .ahmap v2 を開く */
    async openBytes(bytes, fileName) {
      store.update((s) => { s.busy = { label: `${fileName} を読み込み中…`, fraction: 0.3 }; s.error = null; });
      await new Promise((r) => setTimeout(r, 0));
      try {
        const { world, extensions: ext, chunkCache: cache, manifest } = await decodeAhmap2(bytes);
        extensions = Object.fromEntries(ext); chunkCache = cache;
        let start = null; if (ext.has(START_CHUNK)) { try { start = JSON.parse(dec.decode(ext.get(START_CHUNK))); } catch { notice("保存された開始集団の情報を読めなかったため、選び直してください"); } }
        world.entities.start = start; world.generation = null;
        adopt(world, fileName, { start: start?.groupId ?? null });
        notice(`${fileName} を開きました（${manifest.cellCount.toLocaleString()} セル）`);
        return { ok: true, world };
      } catch (e) {
        if (e instanceof Ahmap2Error) { fail(`${fileName} を開けませんでした: ${e.message}${e.problems.length ? "（" + e.problems.slice(0, 3).join("／") + (e.problems.length > 3 ? ` ほか${e.problems.length - 3}件` : "") + "）" : ""}。元のファイルは変更していません`); return { ok: false, error: e.message, problems: e.problems }; }
        fail(`${fileName} を開けませんでした: ${e.message}`); return { ok: false, error: e.message };
      }
    },
    async openFile(file) { return api.openBytes(new Uint8Array(await file.arrayBuffer()), file.name); },

    /** 保存（.ahmap v2 をダウンロード）。開始集団の選択も一緒に保存する */
    async save() {
      const { world, fileName } = store.getState(); if (!world) return { ok: false, reason: "世界がありません" };
      store.update((s) => { s.busy = { label: "保存中…", fraction: 0.5 }; s.error = null; });
      try {
        const ext = { ...extensions }; if (world.entities.start) ext[START_CHUNK] = enc.encode(JSON.stringify(world.entities.start)); else delete ext[START_CHUNK];
        const r = await encodeAhmap2(world, { appVersion, extensions: ext, reuse: chunkCache ?? undefined });
        chunkCache = r.chunkCache; extensions = ext;
        const name = fileName.endsWith(WORLD_EXT) ? fileName : `${fileName}${WORLD_EXT}`;
        download(new Blob([r.bytes], { type: "application/octet-stream" }), name);
        store.update((s) => { s.busy = null; s.dirty = false; });
        notice(`${name} を保存しました（${(r.bytes.length / 1048576).toFixed(1)} MB）`); return { ok: true, bytes: r.bytes };
      } catch (e) { fail(`保存に失敗しました: ${e.message}`); return { ok: false, error: e.message }; }
    },

    setLayer(layer, opt = {}) { store.update((s) => { s.layer = layer; s.layerOpt = opt; }); emit({ type: "layer" }); },
    setMode(mode) { store.update((s) => { s.mode = mode; s.placing = false; }); emit({ type: "mode" }); },
    setBrush(patch) { store.update((s) => { s.brush = { ...s.brush, ...patch }; }); emit({ type: "brush" }); },
    hover(cell) { store.update((s) => { s.hover = cell; }); },
    select(cell) { store.update((s) => { s.selectedCell = cell; }); emit({ type: "select" }); },

    // ---- 初期集団 ----
    selectGroup(id) { const { world } = store.getState(); if (!world?.entities.populations.some((p) => p.id === id)) return false; store.update((s) => { s.startGroupId = id; }); emit({ type: "groups" }); return true; },
    /** 別の候補を提案する（再生成せず、置き直す。開始集団の選択は解除） */
    proposeGroups() {
      const { world, groupVariant } = store.getState(); if (!world) return;
      const g = { mesh: world.mesh, landWater: world.cell.landWater, fertility: world.cell.fertility, temp: world.cell.temp, river: world.cell.river, coastDist: world.cell.coastDist, lat: world.cell.lat, lon: world.cell.lon };
      world.entities.populations = placeInitialGroups(g, world.spec, groupVariant + 1); world.entities.start = null; world.hash = world.hash; // 集団は地理の一部ではないので、世界のハッシュは変えない
      store.update((s) => { s.groupVariant = groupVariant + 1; s.startGroupId = null; s.dirty = true; }); emit({ type: "groups" });
    },
    /** 手動で集団を置く（居住できるセルだけ） */
    placeGroup(cell) {
      const { world } = store.getState(); if (!world) return { ok: false, reason: "世界がありません" };
      const c = world.cell;
      if (c.landWater[cell] !== LAND_WATER.LAND) return { ok: false, reason: c.landWater[cell] === LAND_WATER.LAKE ? "湖には置けません" : "海には置けません" };
      if (c.temp[cell] < -5 || c.temp[cell] > 34) return { ok: false, reason: `気温 ${c.temp[cell].toFixed(1)}℃ は、人が定住するには厳しすぎます（−5〜34℃）` };
      if (c.fertility[cell] < 0.1) return { ok: false, reason: `肥沃度 ${c.fertility[cell].toFixed(2)} は低すぎます（0.10 以上）` };
      const id = Math.max(0, ...world.entities.populations.map((p) => p.id)) + 1;
      world.entities.populations.push({ id, cell, lat: c.lat[cell] * 180 / Math.PI, lon: c.lon[cell] * 180 / Math.PI, size: 300, subsistence: "forage", species: "human", manual: true });
      store.update((s) => { s.startGroupId = id; s.placing = false; s.dirty = true; }); emit({ type: "groups" }); return { ok: true, id };
    },
    setPlacing(on) { store.update((s) => { s.placing = on; }); },
    removeGroup(id) { const { world, startGroupId } = store.getState(); if (!world) return; world.entities.populations = world.entities.populations.filter((p) => p.id !== id); if (startGroupId === id) { world.entities.start = null; store.update((s) => { s.startGroupId = null; }); } store.update((s) => { s.dirty = true; }); emit({ type: "groups" }); },
    /** この集団で始める（v5 のシミュレーションの起点として保存する） */
    confirmStart() {
      const { world, startGroupId } = store.getState(); if (!world || startGroupId == null) return { ok: false, reason: "集団を選んでください" };
      const p = world.entities.populations.find((x) => x.id === startGroupId); if (!p) return { ok: false, reason: "選んだ集団が見つかりません" };
      world.entities.start = { groupId: p.id, cell: p.cell, lat: p.lat, lon: p.lon, population: p.size, subsistence: p.subsistence, species: p.species };
      store.update((s) => { s.dirty = true; s.mode = "view"; }); emit({ type: "groups" }); notice(`集団 #${p.id} を開始集団に決めました。保存すると、続きから始められます`); return { ok: true };
    },

    // ---- 地形編集 ----
    editAt(cell) {
      const { world, brush } = store.getState(); if (!world || !editor) return { ok: false, reason: "世界がありません" };
      const r = editor.applyBrush({ center: cell, radiusKm: brush.radiusKm, deltaM: brush.deltaM, mode: brush.mode, target: brush.target });
      if (!r.ok) { notice(r.reason); return r; }
      if (r.unchanged) return r;
      if (world.entities.start && world.cell.landWater[world.entities.start.cell] !== LAND_WATER.LAND) { editor.undo(); notice("開始集団の居住地が失われるため、取り消しました"); return { ok: false, reason: "開始集団を守るため取り消し" }; }
      store.update((s) => { s.dirty = true; }); syncHistory(); emit({ type: "edit", dirty: r.dirty }); return r;
    },
    undo() { if (!editor) return { ok: false }; const r = editor.undo(); if (r.ok) { store.update((s) => { s.dirty = true; }); syncHistory(); emit({ type: "edit", dirty: r.dirty }); } return r; },
    redo() { if (!editor) return { ok: false }; const r = editor.redo(); if (r.ok) { store.update((s) => { s.dirty = true; }); syncHistory(); emit({ type: "edit", dirty: r.dirty }); } return r; },
    check() { const { world } = store.getState(); return world ? validateWorld(world) : []; },

    /** セルの説明（パネル・ステータス用） */
    describeCell(c) {
      const { world } = store.getState(); if (!world || c < 0) return null;
      const k = world.cell, res = Object.entries(RES_NAMES).filter(([b]) => k.resource[c] & Number(b)).map(([, n]) => n);
      const group = world.entities.populations.find((p) => p.cell === c);
      return {
        cell: c, lat: k.lat[c] * 180 / Math.PI, lon: k.lon[c] * 180 / Math.PI, elevation: k.elevation[c], kind: ["海", "陸", "湖"][k.landWater[c]], biome: BIOME_NAMES[k.biome[c]], temp: k.temp[c], precip: k.precip[c],
        fertility: k.fertility[c], soil: SOIL_NAMES[k.soil[c]], resources: res, river: k.river[c] === 1, riverFlow: k.riverFlow[c], coastDist: k.coastDist[c], areaKm2: k.areaKm2[c], capacity: k.capacity[c], group: group ? group.id : null,
      };
    },
    get editor() { return editor; },
  };
  return api;
}
