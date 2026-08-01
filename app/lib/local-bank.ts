import type { QuizQuestion } from "./question-parser";
import { normalizeQuestionBankGroup, suggestQuestionBankGroup } from "./bank-grouping";

export type SavedQuestionBank = {
  id: string;
  name: string;
  description: string;
  groupName: string;
  featured: boolean;
  questions: QuizQuestion[];
  importedAt: string;
  updatedAt: string;
};

export type QuestionBankInput = {
  id?: string;
  name: string;
  description?: string;
  groupName?: string;
  featured?: boolean;
  questions: QuizQuestion[];
  importedAt: string;
  updatedAt?: string;
};

export type SharedQuestionBankPackage = {
  format: "hongdou-question-bank";
  version: 1;
  exportedAt: string;
  bank: {
    name: string;
    description?: string;
    groupName?: string;
    questions: QuizQuestion[];
  };
};

export type Western306StandardPackage = {
  format: "avecove-western-306";
  version: 1;
  generatedAt: string;
  source?: string;
  report?: Record<string, unknown>;
  bank: {
    name: string;
    description?: string;
    groupName?: string;
    questions: QuizQuestion[];
  };
};

export type QuestionBankSyncBundle = {
  version: 1;
  activeBankId: string | null;
  banks: SavedQuestionBank[];
  groupOrder?: string[];
};

const DB_NAME = "hongdou-local-data";
const STORE_NAME = "question-banks";
const LEGACY_ACTIVE_KEY = "active-bank";
const ACTIVE_ID_KEY = "active-bank-id";
const GROUP_ORDER_KEY = "question-bank-group-order";
const BANK_KEY_PREFIX = "bank:";

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

function createBankId() {
  return globalThis.crypto?.randomUUID?.() ?? `bank-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function bankKey(id: string) {
  return `${BANK_KEY_PREFIX}${id}`;
}

function notifySyncChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("avecove-sync-change"));
}

function normalizeQuestion(question: QuizQuestion, fallbackId: string): QuizQuestion {
  const answer = [...new Set((question.answer ?? []).map((item) => String(item).toUpperCase()))];
  return {
    ...question,
    id: question.id || fallbackId,
    answer,
    multiple: question.questionType === "X" || answer.length > 1,
  };
}

function normalizeBank(input: QuestionBankInput): SavedQuestionBank {
  const isNew = !input.id;
  const id = input.id ?? createBankId();
  const now = new Date().toISOString();
  const name = input.name.trim() || "未命名题库";
  const questions = input.questions.map((question, index) => normalizeQuestion({
    ...question,
    id: isNew ? `${id}:${index + 1}` : question.id,
  }, `${id}:${index + 1}`));
  const storedGroupName = normalizeQuestionBankGroup(input.groupName);
  return {
    id,
    name,
    description: typeof input.description === "string" ? input.description.trim().slice(0, 4_000) : "",
    groupName: storedGroupName || (input.groupName === undefined ? suggestQuestionBankGroup(name, questions) : ""),
    featured: input.featured === true,
    questions,
    importedAt: input.importedAt || now,
    updatedAt: input.updatedAt || now,
  };
}

async function readValue<T>(key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("读取本地题库失败"));
    transaction.oncomplete = () => database.close();
  });
}

function normalizeGroupOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry === "未分组题库" ? entry : normalizeQuestionBankGroup(entry);
    if (!normalized || result.includes(normalized)) continue;
    result.push(normalized.slice(0, 60));
    if (result.length >= 80) break;
  }
  return result;
}

export async function loadQuestionBankGroupOrder(): Promise<string[]> {
  return normalizeGroupOrder(await readValue<unknown>(GROUP_ORDER_KEY));
}

export async function saveQuestionBankGroupOrder(order: string[]): Promise<string[]> {
  const normalized = normalizeGroupOrder(order);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(normalized, GROUP_ORDER_KEY);
    transaction.oncomplete = () => {
      database.close();
      notifySyncChange();
      resolve(normalized);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("保存题库分组顺序失败"));
  });
}

export async function listQuestionBanks(): Promise<SavedQuestionBank[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const banks: SavedQuestionBank[] = [];
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (typeof cursor.key === "string" && cursor.key.startsWith(BANK_KEY_PREFIX)) {
        const raw = cursor.value as QuestionBankInput;
        banks.push(normalizeBank({ ...raw, id: raw.id ?? cursor.key.slice(BANK_KEY_PREFIX.length) }));
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("读取题库列表失败"));
    transaction.oncomplete = () => {
      database.close();
      resolve(banks.sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    };
  });
}

export async function loadQuestionBank(id: string): Promise<SavedQuestionBank | null> {
  const value = await readValue<QuestionBankInput>(bankKey(id));
  return value ? normalizeBank({ ...value, id }) : null;
}

export async function loadActiveBank(): Promise<SavedQuestionBank | null> {
  const activeId = await readValue<string>(ACTIVE_ID_KEY);
  if (activeId) return loadQuestionBank(activeId);

  // Transparently migrate the single-bank format used by earlier versions.
  const legacy = await readValue<Omit<QuestionBankInput, "id">>(LEGACY_ACTIVE_KEY);
  if (!legacy?.questions?.length) return null;
  return saveActiveBank({ ...legacy, id: createBankId() });
}

export async function saveQuestionBank(input: QuestionBankInput, makeActive = false): Promise<SavedQuestionBank> {
  const bank = normalizeBank(input);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(bank, bankKey(bank.id));
    if (makeActive) store.put(bank.id, ACTIVE_ID_KEY);
    store.delete(LEGACY_ACTIVE_KEY);
    transaction.oncomplete = () => { database.close(); notifySyncChange(); resolve(bank); };
    transaction.onerror = () => reject(transaction.error ?? new Error("保存本地题库失败"));
  });
}

export async function saveActiveBank(bank: QuestionBankInput): Promise<SavedQuestionBank> {
  return saveQuestionBank(bank, true);
}

export async function activateQuestionBank(id: string): Promise<SavedQuestionBank> {
  const bank = await loadQuestionBank(id);
  if (!bank) throw new Error("找不到这份题库，它可能已被删除");
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(id, ACTIVE_ID_KEY);
    transaction.oncomplete = () => { database.close(); notifySyncChange(); resolve(bank); };
    transaction.onerror = () => reject(transaction.error ?? new Error("切换题库失败"));
  });
}

export async function renameQuestionBank(id: string, name: string): Promise<SavedQuestionBank> {
  return updateQuestionBankDetails(id, { name });
}

export async function updateQuestionBankDetails(
  id: string,
  details: { name?: string; description?: string; groupName?: string; featured?: boolean },
): Promise<SavedQuestionBank> {
  const bank = await loadQuestionBank(id);
  if (!bank) throw new Error("找不到要编辑的题库");
  return saveQuestionBank({
    ...bank,
    name: details.name ?? bank.name,
    description: details.description ?? bank.description,
    groupName: details.groupName ?? bank.groupName,
    featured: details.featured ?? bank.featured,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteQuestionBank(id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(bankKey(id));
    const activeRequest = store.get(ACTIVE_ID_KEY);
    activeRequest.onsuccess = () => {
      if (activeRequest.result === id) store.delete(ACTIVE_ID_KEY);
    };
    transaction.oncomplete = () => { database.close(); notifySyncChange(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error("删除题库失败"));
  });
}

export async function clearActiveBank(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(ACTIVE_ID_KEY);
    store.delete(LEGACY_ACTIVE_KEY);
    transaction.oncomplete = () => { database.close(); notifySyncChange(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error("恢复演示题库失败"));
  });
}

export async function exportQuestionBankSyncBundle(): Promise<QuestionBankSyncBundle> {
  return {
    version: 1,
    activeBankId: await readValue<string>(ACTIVE_ID_KEY) ?? null,
    banks: await listQuestionBanks(),
    groupOrder: await loadQuestionBankGroupOrder(),
  };
}

export async function mergeQuestionBankSyncBundle(value: unknown): Promise<{ merged: number; activeBankId: string | null }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { merged: 0, activeBankId: null };
  const bundle = value as Partial<QuestionBankSyncBundle>;
  if (bundle.version !== 1 || !Array.isArray(bundle.banks)) return { merged: 0, activeBankId: null };
  const local = new Map((await listQuestionBanks()).map((bank) => [bank.id, bank]));
  let merged = 0;
  for (const candidate of bundle.banks.slice(0, 40)) {
    if (!candidate || typeof candidate.id !== "string" || candidate.id.length > 160 || !Array.isArray(candidate.questions) || !candidate.questions.length) continue;
    if (candidate.questions.length > 25_000) continue;
    const current = local.get(candidate.id);
    if (current?.updatedAt && (!candidate.updatedAt || current.updatedAt >= candidate.updatedAt)) continue;
    await saveQuestionBank({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name.slice(0, 160) : "同步题库",
      description: typeof candidate.description === "string" ? candidate.description.slice(0, 4_000) : "",
      groupName: typeof candidate.groupName === "string" ? candidate.groupName : "",
      featured: candidate.featured === true,
      questions: candidate.questions,
      importedAt: typeof candidate.importedAt === "string" ? candidate.importedAt : new Date().toISOString(),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    });
    merged += 1;
  }
  const activeBankId = typeof bundle.activeBankId === "string" && (await loadQuestionBank(bundle.activeBankId)) ? bundle.activeBankId : null;
  const localActiveBankId = await readValue<string>(ACTIVE_ID_KEY) ?? null;
  if (activeBankId && activeBankId !== localActiveBankId) await activateQuestionBank(activeBankId);
  if (Array.isArray(bundle.groupOrder)) await saveQuestionBankGroupOrder(bundle.groupOrder);
  return { merged, activeBankId };
}

export function createSharedQuestionBankPackage(bank: SavedQuestionBank): SharedQuestionBankPackage {
  return {
    format: "hongdou-question-bank",
    version: 1,
    exportedAt: new Date().toISOString(),
    bank: { name: bank.name, description: bank.description, groupName: bank.groupName, questions: bank.questions },
  };
}

export function parseSharedQuestionBankPackage(value: unknown): QuestionBankInput {
  const payload = value as Partial<SharedQuestionBankPackage | Western306StandardPackage>;
  if ((payload?.format !== "hongdou-question-bank" && payload?.format !== "avecove-western-306") || payload.version !== 1 || !payload.bank || !Array.isArray(payload.bank.questions)) {
    throw new Error("这不是可识别的红豆题库分享文件");
  }
  const questions = payload.bank.questions.filter((question): question is QuizQuestion => Boolean(
    question && typeof question.stem === "string" && Array.isArray(question.options) && Array.isArray(question.answer),
  ));
  if (!questions.length) throw new Error("分享文件中没有可用题目");
  return {
    name: typeof payload.bank.name === "string" ? payload.bank.name : "分享题库",
    description: typeof payload.bank.description === "string" ? payload.bank.description.slice(0, 4_000) : "",
    groupName: typeof payload.bank.groupName === "string" ? payload.bank.groupName : "",
    questions,
    importedAt: new Date().toISOString(),
  };
}
