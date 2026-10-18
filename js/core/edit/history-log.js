// 歴史ログ：ユーザーが行った「出来事」を、世界の年月つきで1本の時系列に残す。
//
// 国名の変化・宗教の誕生・都市の建設・領土の変動・ゾーンの発生など、アクションごとに1件。
// クロニクル（.md）の年表は、このログと、戦争・同盟・外交・主権のログを合わせて作る。
//
// 設計:
//   ・ログは編集コマンドの「部品」として積む（withEvent）。Undo/Redo でログも一緒に戻る。
//   ・同じ日に同じ対象への領土の塗り足しは、1件にまとめる（mergeKey）。ブラシで1回なぞるだけで
//     何十件も並ぶのを避けるため。まとめた件数は count に足し込む。
//   ・保存先: ext.data.historyLog = [{ year, month, type, title, detail?, count?, mergeKey?, ref? }]
//   ・ref = { kind, id, from?, to? }：その時点の名前の変化（改名・消滅）を、クロニクルが「当時の名前」で書くために残す
//   ・件数の上限は無い。記録は削らない。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";

export const listHistory = (map) => map?.ext?.data?.historyLog ?? [];

const nowOf = (map) => map?.worldTime ?? { year: 1, month: 1 };

function eventPart(entry) {
  let before = null;
  const write = (m, list) => {
    const ext = ensureExt(m);
    if (list.length) ext.data.historyLog = list; else delete ext.data.historyLog;
  };
  return {
    apply(m) {
      before = listHistory(m);
      const last = before[before.length - 1];
      let next;
      if (entry.mergeKey && last && last.mergeKey === entry.mergeKey && last.year === entry.year && last.month === entry.month) {
        next = [...before.slice(0, -1), { ...last, count: (last.count ?? 0) + (entry.count ?? 0) }];
      } else {
        next = [...before, entry]; // 古い記録を捨てたり要約したりしない（どんなに長くなっても全部残す）
      }
      write(m, next);
    },
    revert(m) { write(m, before ?? []); },
  };
}

/**
 * コマンドに「出来事の記録」を足す。command が null（変化なし）ならそのまま null。
 * @param {object} map
 * @param {object|null} command
 * @param {{type:string, title:string, detail?:string, count?:number, mergeKey?:string, date?:{year:number,month:number}, cell?:number, states?:number[], ref?:{kind:string,id:number,from?:string,to?:string}}} event
 */
export function withEvent(map, command, event) {
  if (!command || !event) return command;
  const { year, month } = event.date && Number.isFinite(event.date.year) && Number.isFinite(event.date.month) ? event.date : nowOf(map);
  const entry = { year, month, type: event.type, title: event.title };
  if (Number.isInteger(event.cell)) entry.cell = event.cell;       // 地図で場所へ移るための目印
  if (Array.isArray(event.states) && event.states.length) entry.states = [...new Set(event.states)]; // 関係する国（年表の絞り込み用）
  if (event.detail) entry.detail = event.detail;
  if (event.count != null) entry.count = event.count;
  if (event.mergeKey) entry.mergeKey = event.mergeKey;
  if (event.ref) entry.ref = event.ref;
  if (event.data) entry.data = event.data; // 出来事に付ける小さな構造データ（技術の機運の分野など）
  if (event.cause) entry.cause = event.cause; // きっかけとなった出来事のキー（lineage.js の eventKey）
  if (event.zoneId) entry.zoneId = event.zoneId; // この出来事に伴うゾーン（疫病・災害）の id。年表の項目から、ゾーンの輪郭を強調するために使う
  return makeCommand(command.label, command.layers, [...command.parts, eventPart(entry)]);
}

/** 出来事だけを記録するコマンド（他の変更を伴わないとき） */
export function planLogEvent(map, event) {
  return withEvent(map, makeCommand(event.title, [], []), event);
}
