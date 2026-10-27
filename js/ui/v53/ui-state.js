// v5.3 UI 状態: 画面の「どこを見ているか」だけを持つ小さなストア。
// 世界・歴史のデータは持たない（それは adapter が正本）。ここは選択・開閉・通知キューなど、UI 固有の状態。
export function createUiState(initial = {}) {
  let s = {
    domain: "world",        // 左ハブの領域 id（domains.js）
    selection: null,        // { kind, id } 右パネルに出す対象
    trail: [],              // 右パネルの「戻る」用の履歴
    panelOpen: true,
    hubOpen: false,
    startFlow: false,       // 開始フローを表示中か
    toasts: [],             // 通常通知（通知カード）
    majorQueue: [],         // 確認待ちの重大イベント（先頭が表示中）
    resumeAfterMajor: false, // 重大イベントで止める前に時間が動いていたか
    listFilter: {},         // 領域ごとの検索語・絞り込み { [domain]: { query, filter, sort } }
    settings: { showToasts: true, reduceMotion: false },
    ...initial,
  };
  const subs = new Set();
  const emit = (prev) => { for (const f of subs) f(s, prev); };
  return {
    get: () => s,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    set(patch) { const prev = s; s = { ...s, ...patch }; emit(prev); },
    /** 右パネルの対象を変える。同じ対象は積まない */
    select(sel, { domain = null } = {}) {
      const prev = s, cur = s.selection;
      const same = cur && sel && cur.kind === sel.kind && cur.id === sel.id;
      const trail = cur && !same && sel ? [...s.trail, cur].slice(-30) : sel ? s.trail : [];
      s = { ...s, selection: sel, trail, panelOpen: sel ? true : s.panelOpen, ...(domain ? { domain } : {}) };
      emit(prev);
    },
    back() {
      if (!s.trail.length) return false;
      const prev = s, trail = s.trail.slice(0, -1), selection = s.trail.at(-1);
      s = { ...s, selection, trail }; emit(prev); return true;
    },
    setFilter(domain, patch) { this.set({ listFilter: { ...s.listFilter, [domain]: { ...(s.listFilter[domain] ?? {}), ...patch } } }); },
  };
}
