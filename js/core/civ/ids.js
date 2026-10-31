// v5 M0: 不変ID（指示書 §1.1）。IDは作成時に連番から発行し、年月・タイトルからは決して作らない。
// 形式: <種別>_<連番を36進・検査文字つき>。連番は文明状態（civ.seq）に保存され、保存・読み込みをまたいで続く。
export const ID_KINDS = Object.freeze(["state", "pop", "settle", "person", "event", "decision", "proposal", "tech", "culture", "lang", "religion", "species", "war", "treaty", "battle", "disaster", "work", "interp", "org", "house", "candidate", "unit", "intervention", "proposal"]);
const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
const check = (kind, n) => { let h = n * 2654435761 >>> 0; for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0; return ALPHA[h % 36]; };
/** @param {Record<string,number>} seq 種別ごとの発行済み数（この関数が書き換える。保存対象） */
export function createIdGen(seq) {
  return {
    next(kind) {
      if (!ID_KINDS.includes(kind)) throw new Error(`未知のID種別: ${kind}`);
      const n = (seq[kind] = (seq[kind] ?? 0) + 1);
      return `${kind}_${n.toString(36).padStart(5, "0")}${check(kind, n)}`;
    },
  };
}
export function parseId(id) {
  const m = /^([a-z]+)_([0-9a-z]{5,})([0-9a-z])$/.exec(String(id)); if (!m) return null;
  const n = parseInt(m[2], 36); return m[3] === check(m[1], n) ? { kind: m[1], n } : null;
}
