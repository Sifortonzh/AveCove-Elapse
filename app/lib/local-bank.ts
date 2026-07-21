import type { QuizQuestion } from "./question-parser";

export type SavedQuestionBank = {
  name: string;
  questions: QuizQuestion[];
  importedAt: string;
};

const DB_NAME = "hongdou-local-data";
const STORE_NAME = "question-banks";
const ACTIVE_KEY = "active-bank";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地题库"));
  });
}

export async function loadActiveBank(): Promise<SavedQuestionBank | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_KEY);
    request.onsuccess = () => resolve((request.result as SavedQuestionBank | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("读取本地题库失败"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveActiveBank(bank: SavedQuestionBank): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(bank, ACTIVE_KEY);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error("保存本地题库失败"));
  });
}

export async function clearActiveBank(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error("恢复演示题库失败"));
  });
}
