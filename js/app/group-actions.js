// 初期集団の選択（地図づくりの次の段）。世界を作ったあと、歴史を始める人口集団を選ぶ。
// すべて Undo できるコマンド（保存していない変更としても数えられる）。世界（map.world）の entities を書き換える。
import { makeCommand } from "../core/edit/commands.js";
import { LAND_WATER, placeInitialGroups } from "../core/world/worldgen.js";

/** 画面に出す初期集団の印。開始集団が決まっていない間は候補すべて、決まったあとは開始集団だけ */
export function visibleGroups(state) {
  const w = state.map?.world; if (!w) return [];
  const start = w.entities.start, sel = state.groups?.selected;
  return w.entities.populations.filter((p) => !start || p.id === start.groupId).map((p) => ({ id: p.id, cell: p.cell, selected: start ? true : p.id === sel }));
}

/** 初期集団を選ぶ段階か（世界があり、開始集団がまだ決まっていない） */
export const needsStartGroup = (state) => !!state.map?.world && !state.map.world.entities.start;

export function createGroupActions({ store, rerender, showNotice }) {
  const world = () => store.getState().map?.world ?? null;
  const setSel = (id) => { store.update((s) => { s.groups = { ...(s.groups ?? { variant: 0 }), selected: id }; }); rerender(); };
  /** 世界の entities を書き換える Undo 可能なコマンド */
  const commitEntities = (label, patch) => {
    const w = world(), before = { populations: w.entities.populations, start: w.entities.start }, after = { ...before, ...patch };
    const set = (m, v) => { m.world.entities.populations = v.populations; m.world.entities.start = v.start; };
    store.commit(makeCommand(label, ["places"], [{ apply: (m) => set(m, after), revert: (m) => set(m, before) }]));
    rerender();
  };
  return {
    selectGroup(id) { const w = world(); if (!w?.entities.populations.some((p) => p.id === id)) return false; setSel(id); return true; },
    /** 別の候補を提案する（世界は作り直さず、置き直す。選択は解除） */
    proposeGroups() {
      const w = world(); if (!w) return;
      const variant = (store.getState().groups?.variant ?? 0) + 1, c = w.cell;
      const g = { mesh: w.mesh, landWater: c.landWater, fertility: c.fertility, temp: c.temp, river: c.river, coastDist: c.coastDist, lat: c.lat, lon: c.lon };
      commitEntities("初期集団の候補を提案", { populations: placeInitialGroups(g, w.spec, variant), start: null });
      store.update((s) => { s.groups = { selected: null, variant }; });
    },
    /** 好きな場所に集団を置く（居住できる土地だけ）。置いた集団を選んだ状態にする */
    placeGroup(cell) {
      const w = world(); if (!w) return { ok: false, reason: "世界がありません" };
      const c = w.cell;
      if (c.landWater[cell] !== LAND_WATER.LAND) return { ok: false, reason: c.landWater[cell] === LAND_WATER.LAKE ? "湖には置けません" : "海には置けません" };
      if (c.temp[cell] < -5 || c.temp[cell] > 34) return { ok: false, reason: `気温 ${c.temp[cell].toFixed(1)}℃ は、人が定住するには厳しすぎます（−5〜34℃）` };
      if (c.fertility[cell] < 0.1) return { ok: false, reason: `肥沃度 ${c.fertility[cell].toFixed(2)} は低すぎます（0.10 以上）` };
      const id = Math.max(0, ...w.entities.populations.map((p) => p.id)) + 1;
      commitEntities("初期集団を置く", { populations: [...w.entities.populations, { id, cell, lat: c.lat[cell] * 180 / Math.PI, lon: c.lon[cell] * 180 / Math.PI, size: 300, subsistence: "forage", species: "human", manual: true }] });
      setSel(id); return { ok: true, id };
    },
    removeGroup(id) {
      const w = world(); if (!w) return;
      commitEntities("初期集団を外す", { populations: w.entities.populations.filter((p) => p.id !== id), start: w.entities.start?.groupId === id ? null : w.entities.start });
      if (store.getState().groups?.selected === id) setSel(null);
    },
    /** この集団で始める。歴史の起点として決める（次の段階で、ここから国家が成立していく） */
    confirmStart() {
      const w = world(), sel = store.getState().groups?.selected; if (!w || sel == null) return { ok: false, reason: "集団を選んでください" };
      const p = w.entities.populations.find((x) => x.id === sel); if (!p) return { ok: false, reason: "選んだ集団が見つかりません" };
      commitEntities("この集団で始める", { start: { groupId: p.id, cell: p.cell, lat: p.lat, lon: p.lon, population: p.size, subsistence: p.subsistence, species: p.species } });
      showNotice(`集団 #${p.id} から歴史を始めます`); return { ok: true };
    },
  };
}
