import { sampleRecords } from './sampleData.js';

const STORAGE_KEY = 'keiei-soudan-records-v1';

export function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleRecords));
    return [...sampleRecords];
  }
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleRecords));
    return [...sampleRecords];
  }
}

export function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
