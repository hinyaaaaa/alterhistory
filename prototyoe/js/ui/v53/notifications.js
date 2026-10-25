// v5.3 UI: 通知の制御（DOM なし）。通常通知は件数が増えたら要約、重大イベントは時間を止めてキューに積む。
//   ・イベント正本は adapter 側にある。ここは「見せ方」だけ。要約しても、元の履歴は歴史研究の一覧からすべて辿れる
//   ・重大かどうかは impact.js の影響度で決める（種類だけでは止めない）
//   ・重大イベントが来たら adapter.time.stop()。確認（confirmMajor）するまで再開できない。複数はキューに順番に積む
import { evaluateImpact } from "./impact.js";
import { countByCategory } from "./categories.js";

export function createNotifier({ adapter, ui, schedule = (f, ms) => setTimeout(f, ms), cancel = (t) => clearTimeout(t), toastMs = 6000, summaryMs = 12000, maxToasts = 3, summaryThreshold = 4, pollMs = 500, threshold } = {}) {
  let seq = 0, pollTimer = null;
  const timers = new Map();
  const opts = threshold == null ? undefined : { threshold };

  const setToasts = (list) => ui.set({ toasts: list });
  function addToast(t, ms) {
    const toast = { ...t, key: `t${++seq}` };
    setToasts([toast, ...ui.get().toasts].slice(0, maxToasts + 1));
    timers.set(toast.key, schedule(() => dismissToast(toast.key), ms));
    return toast;
  }
  function dismissToast(key) {
    cancel(timers.get(key)); timers.delete(key);
    setToasts(ui.get().toasts.filter((t) => t.key !== key));
  }

  /** 新しい出来事の束を受け取る。戻り値は分類の結果（テスト・デバッグ用） */
  // 開始フロー（国家成立までの自動進行）の間は、通知で割り込まない。出来事は歴史に残り、フローを閉じたときに 1 枚の要約で知らせる
  const held = { events: [] };
  function release() {
    const list = held.events; held.events = []; if (!list.length || !ui.get().settings.showToasts) return;
    const months = list.map((e) => e.month);
    addToast({ type: "summary", total: list.length, majorCount: 0, categories: countByCategory(list), fromMonth: Math.min(...months), toMonth: Math.max(...months) }, summaryMs);
  }

  function ingest(events) {
    if (!events?.length) return { major: [], notable: [], minor: [] };
    if (ui.get().startFlow) { held.events.push(...events.map((e) => ({ month: e.month, kind: e.kind }))); if (held.events.length > 5000) held.events.splice(0, held.events.length - 5000); return { major: [], notable: [], minor: [], held: true }; }
    const scale = adapter.worldScale();
    const major = [], notable = [], minor = [];
    for (const e of events) {
      const r = evaluateImpact(e, scale, opts);
      const ev = { ...e, impactResult: r };
      (r.major ? major : r.notable ? notable : minor).push(ev);
    }
    if (major.length) {
      const known = new Set(ui.get().majorQueue.map((x) => x.id));
      const fresh = major.filter((e) => !known.has(e.id));
      if (fresh.length) {
        const wasEmpty = ui.get().majorQueue.length === 0;
        if (wasEmpty) ui.set({ resumeAfterMajor: adapter.time.isRunning() });
        if (adapter.time.isRunning()) adapter.time.stop(); // 確認するまで再開しない
        ui.set({ majorQueue: [...ui.get().majorQueue, ...fresh] });
      }
    }
    if (ui.get().settings.showToasts) {
      const rest = [...notable, ...minor], lo = Math.min(...rest.map((e) => e.month)), hi = Math.max(...rest.map((e) => e.month));
      if (notable.length > summaryThreshold || rest.length > summaryThreshold * 3) {
        // 要約: 件数と分類だけを見せる。出来事そのものは消えない（歴史研究で全件を辿れる）
        addToast({ type: "summary", total: rest.length + major.length, majorCount: major.length, categories: countByCategory([...rest, ...major]), fromMonth: lo, toMonth: hi }, summaryMs);
      } else {
        for (const e of notable) addToast({ type: "event", eventId: e.id, title: e.title, month: e.month, kind: e.kind, detail: e.detail ?? "", causeText: e.causeText ?? "" }, toastMs);
      }
    }
    return { major, notable, minor };
  }

  function poll() { return ingest(adapter.newEvents()); }
  function confirmMajor({ resume = false } = {}) {
    const q = ui.get().majorQueue; if (!q.length) return null;
    const done = q[0], rest = q.slice(1);
    ui.set({ majorQueue: rest });
    if (!rest.length && resume && ui.get().resumeAfterMajor && !adapter.meta().past) adapter.time.start();
    if (!rest.length) ui.set({ resumeAfterMajor: false });
    return done;
  }

  return {
    ingest, poll, dismissToast, confirmMajor, release,
    start() { if (pollTimer == null) pollTimer = setInterval(poll, pollMs); },
    stop() { if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; } },
    dispose() { this.stop(); for (const t of timers.values()) cancel(t); timers.clear(); },
  };
}
