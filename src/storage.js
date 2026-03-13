import { sampleRecords } from './sampleData.js';

// NOTE: 本番版(index.html)はGoogle Drive保存のみを使用する。
// このモジュールは互換用途として最小限のメモリ実装にしている。
let memoryRecords = [...sampleRecords];

export function loadRecords() {
  return [...memoryRecords];
}

export function saveRecords(records) {
  memoryRecords = Array.isArray(records) ? [...records] : [];
}
