// v5.3 UI の入口。mountV53({ root, adapter, map }) でレイアウト全体を root に作る。
//   adapter … contract.js の形。開発中は mock-adapter、統合後は live-adapter
//   map     … 地図ポート { el, onPick(fn), highlight(sel), refresh(), dispose() }
//   download(blob, name) … ファイルの受け渡し（本体では ui/download.js の downloadBlob）
import { createUiState } from "./ui-state.js";
import { createNotifier } from "./notifications.js";
import { createShell } from "./shell.js";
import { validateAdapter } from "./adapters/contract.js";
import { KIND_DOMAIN } from "./domains.js";

function defaultDownload(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function mountV53({ root, adapter, map, download = defaultDownload, pollMs = 500, notifierOptions = {}, keyboard = true }) {
  const missing = validateAdapter(adapter);
  if (missing.length) throw new Error(`v5.3 UI: アダプターに不足があります: ${missing.join(", ")}`);
  const ui = createUiState({ startFlow: !adapter.meta().hasCiv });
  const notifier = createNotifier({ adapter, ui, pollMs, ...notifierOptions });
  // 重大イベントの確認待ちの間は、時間を再開させない（アダプター側でも止める）
  adapter.setRunGuard?.(() => ui.get().majorQueue.length === 0);
  map.onPick((sel) => ui.select(sel, { domain: KIND_DOMAIN[sel.kind] }));
  ui.subscribe((s, p) => { if (s.selection !== p.selection) map.highlight(s.selection); if (p.startFlow && !s.startFlow) notifier.release(); });
  const shell = createShell({ adapter, ui, map, notifier, download });
  root.replaceChildren(shell.el);
  notifier.start();

  const onKey = (e) => {
    const t = e.target, typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== "range" && t.type !== "checkbox" && t.type !== "radio");
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui.get().majorQueue.length) return; // 重大イベントの確認中は、他の操作をさせない
    if (e.key === " " && !(t instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (adapter.time.isRunning()) adapter.time.stop(); else adapter.time.start();
    } else if (e.key === "Escape") { if (!ui.back()) { if (ui.get().selection) ui.select(null); } }
  };
  if (keyboard) document.addEventListener("keydown", onKey);
  return {
    ui, notifier, shell, adapter,
    dispose() { document.removeEventListener("keydown", onKey); notifier.dispose(); shell.dispose(); map.dispose?.(); root.replaceChildren(); },
  };
}
