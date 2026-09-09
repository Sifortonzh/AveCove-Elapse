import type { QuizQuestion } from "./question-parser";
import { normalizeQuestionBankGroup, suggestQuestionBankGroup } from "./bank-grouping";

export type SavedQuestionBank = {
  id: string;
  name: string;
  description: string;
  sourceTitle: string;
  edition: string;
  author: string;
  copyrightNotice: string;
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
  sourceTitle?: string;
  edition?: string;
  author?: string;
  copyrightNotice?: string;
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
    sourceTitle?: string;
    edition?: string;
    author?: string;
    copyrightNotice?: string;
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
    sourceTitle?: string;
    edition?: string;
    author?: string;
    copyrightNotice?: string;
    groupName?: string;
    questions: QuizQuestion[];
  };
};

export type QuestionBankSyncBundle = {
  version: 1 | 2;
  activeBankId: string | null;
  banks: SavedQuestionBank[];
  groupOrder?: string[];
  bankOrder?: string[];
  sortMode?: QuestionBankSortMode;
  deletedBanks?: Record<string, string>;
  preferencesUpdatedAt?: string;
};

export type QuestionBankSortMode = "custom" | "imported-desc" | "imported-asc" | "name-asc";

const DB_NAME = "hongdou-local-data";
const STORE_NAME = "question-banks";
const LEGACY_ACTIVE_KEY = "active-bank";
const ACTIVE_ID_KEY = "active-bank-id";
const GROUP_ORDER_KEY = "question-bank-group-order";
const BANK_ORDER_KEY = "question-bank-order";
const SORT_MODE_KEY = "question-bank-sort-mode";
const DELETED_BANKS_KEY = "question-bank-deletions";
const PREFERENCES_UPDATED_AT_KEY = "question-bank-preferences-updated-at";
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
    sourceTitle: typeof input.sourceTitle === "string" ? input.sourceTitle.trim().slice(0, 160) : "",
    edition: typeof input.edition === "string" ? input.edition.trim().slice(0, 80) : "",
    author: typeof input.author === "string" ? input.author.trim().slice(0, 120) : "",
    copyrightNotice: typeof input.copyrightNotice === "string" ? input.copyrightNotice.trim().slice(0, 500) : "",
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

async function writeValues(entries: Array<[IDBValidKey, unknown]>, notify = true): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const [key, value] of entries) store.put(value, key);
    transaction.oncomplete = () => {
      database.close();
      if (notify) notifySyncChange();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("保存题库设置失败"));
  });
}

function normalizeBankOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 160))].slice(0, 200);
}

function normalizeSortMode(value: unknown): QuestionBankSortMode {
  return value === "custom" || value === "imported-asc" || value === "name-asc" ? value : "imported-desc";
}

function normalizeDeletedBanks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [id, deletedAt] of Object.entries(value)) {
    if (!id || id.length > 160 || typeof deletedAt !== "string" || Number.isNaN(Date.parse(deletedAt))) continue;
    result[id] = deletedAt;
    if (Object.keys(result).length >= 200) break;
  }
  return result;
}

async function touchQuestionBankPreferences(entries: Array<[IDBValidKey, unknown]>) {
  await writeValues([...entries, [PREFERENCES_UPDATED_AT_KEY, new Date().toISOString()]]);
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
  await touchQuestionBankPreferences([[GROUP_ORDER_KEY, normalized]]);
  return normalized;
}

export async function loadQuestionBankOrder(): Promise<string[]> {
  return normalizeBankOrder(await readValue<unknown>(BANK_ORDER_KEY));
}

export async function saveQuestionBankOrder(order: string[]): Promise<string[]> {
  const normalized = normalizeBankOrder(order);
  await touchQuestionBankPreferences([[BANK_ORDER_KEY, normalized]]);
  return normalized;
}

export async function loadQuestionBankSortMode(): Promise<QuestionBankSortMode> {
  return normalizeSortMode(await readValue<unknown>(SORT_MODE_KEY));
}

export async function saveQuestionBankSortMode(mode: QuestionBankSortMode): Promise<QuestionBankSortMode> {
  const normalized = normalizeSortMode(mode);
  await touchQuestionBankPreferences([[SORT_MODE_KEY, normalized]]);
  return normalized;
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
  const deletions = normalizeDeletedBanks(await readValue<unknown>(DELETED_BANKS_KEY));
  if (deletions[bank.id] && bank.updatedAt > deletions[bank.id]) delete deletions[bank.id];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(bank, bankKey(bank.id));
    store.put(deletions, DELETED_BANKS_KEY);
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
  details: { name?: string; description?: string; sourceTitle?: string; edition?: string; author?: string; copyrightNotice?: string; groupName?: string; featured?: boolean },
): Promise<SavedQuestionBank> {
  const bank = await loadQuestionBank(id);
  if (!bank) throw new Error("找不到要编辑的题库");
  return saveQuestionBank({
    ...bank,
    name: details.name ?? bank.name,
    description: details.description ?? bank.description,
    sourceTitle: details.sourceTitle ?? bank.sourceTitle,
    edition: details.edition ?? bank.edition,
    author: details.author ?? bank.author,
    copyrightNotice: details.copyrightNotice ?? bank.copyrightNotice,
    groupName: details.groupName ?? bank.groupName,
    featured: details.featured ?? bank.featured,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteQuestionBank(id: string): Promise<void> {
  const deletions = normalizeDeletedBanks(await readValue<unknown>(DELETED_BANKS_KEY));
  deletions[id] = new Date().toISOString();
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(bankKey(id));
    store.put(deletions, DELETED_BANKS_KEY);
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
    version: 2,
    activeBankId: await readValue<string>(ACTIVE_ID_KEY) ?? null,
    banks: await listQuestionBanks(),
    groupOrder: await loadQuestionBankGroupOrder(),
    bankOrder: await loadQuestionBankOrder(),
    sortMode: await loadQuestionBankSortMode(),
    deletedBanks: normalizeDeletedBanks(await readValue<unknown>(DELETED_BANKS_KEY)),
    preferencesUpdatedAt: await readValue<string>(PREFERENCES_UPDATED_AT_KEY) ?? new Date(0).toISOString(),
  };
}

export async function mergeQuestionBankSyncBundle(value: unknown): Promise<{ merged: number; activeBankId: string | null }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { merged: 0, activeBankId: null };
  const bundle = value as Partial<QuestionBankSyncBundle>;
  if ((bundle.version !== 1 && bundle.version !== 2) || !Array.isArray(bundle.banks)) return { merged: 0, activeBankId: null };
  const local = new Map((await listQuestionBanks()).map((bank) => [bank.id, bank]));
  const localDeletions = normalizeDeletedBanks(await readValue<unknown>(DELETED_BANKS_KEY));
  const remoteDeletions = normalizeDeletedBanks(bundle.deletedBanks);
  const mergedDeletions = { ...localDeletions };
  for (const [id, deletedAt] of Object.entries(remoteDeletions)) {
    if (!mergedDeletions[id] || deletedAt > mergedDeletions[id]) mergedDeletions[id] = deletedAt;
  }
  let merged = 0;
  for (const [id, deletedAt] of Object.entries(mergedDeletions)) {
    const current = local.get(id);
    if (current && deletedAt >= current.updatedAt) {
      await deleteQuestionBank(id);
      // Keep the newest local tombstone. deleteQuestionBank intentionally
      // refreshes it so a device that has just learned about the deletion can
      // never upload the removed bank again with an older timestamp.
      mergedDeletions[id] = new Date().toISOString();
      local.delete(id);
      merged += 1;
    }
  }
  for (const candidate of bundle.banks.slice(0, 40)) {
    if (!candidate || typeof candidate.id !== "string" || candidate.id.length > 160 || !Array.isArray(candidate.questions) || !candidate.questions.length) continue;
    if (candidate.questions.length > 25_000) continue;
    const current = local.get(candidate.id);
    const candidateUpdatedAt = typeof candidate.updatedAt === "string" && !Number.isNaN(Date.parse(candidate.updatedAt))
      ? candidate.updatedAt
      : new Date(0).toISOString();
    if (mergedDeletions[candidate.id] && mergedDeletions[candidate.id] >= candidateUpdatedAt) continue;
    if (current?.updatedAt && (!candidate.updatedAt || current.updatedAt >= candidate.updatedAt)) continue;
    await saveQuestionBank({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name.slice(0, 160) : "同步题库",
      description: typeof candidate.description === "string" ? candidate.description.slice(0, 4_000) : "",
      sourceTitle: typeof candidate.sourceTitle === "string" ? candidate.sourceTitle.slice(0, 160) : "",
      edition: typeof candidate.edition === "string" ? candidate.edition.slice(0, 80) : "",
      author: typeof candidate.author === "string" ? candidate.author.slice(0, 120) : "",
      copyrightNotice: typeof candidate.copyrightNotice === "string" ? candidate.copyrightNotice.slice(0, 500) : "",
      groupName: typeof candidate.groupName === "string" ? candidate.groupName : "",
      featured: candidate.featured === true,
      questions: candidate.questions,
      importedAt: typeof candidate.importedAt === "string" ? candidate.importedAt : new Date().toISOString(),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    });
    merged += 1;
  }
  await writeValues([[DELETED_BANKS_KEY, mergedDeletions]], false);
  const activeBankId = typeof bundle.activeBankId === "string" && (await loadQuestionBank(bundle.activeBankId)) ? bundle.activeBankId : null;
  const localActiveBankId = await readValue<string>(ACTIVE_ID_KEY) ?? null;
  if (activeBankId && activeBankId !== localActiveBankId) await activateQuestionBank(activeBankId);
  const localPreferencesUpdatedAt = await readValue<string>(PREFERENCES_UPDATED_AT_KEY) ?? new Date(0).toISOString();
  const remotePreferencesUpdatedAt = typeof bundle.preferencesUpdatedAt === "string" ? bundle.preferencesUpdatedAt : new Date(0).toISOString();
  if (remotePreferencesUpdatedAt > localPreferencesUpdatedAt) {
    await writeValues([
      [GROUP_ORDER_KEY, normalizeGroupOrder(bundle.groupOrder)],
      [BANK_ORDER_KEY, normalizeBankOrder(bundle.bankOrder)],
      [SORT_MODE_KEY, normalizeSortMode(bundle.sortMode)],
      [PREFERENCES_UPDATED_AT_KEY, remotePreferencesUpdatedAt],
    ]);
  }
  return { merged, activeBankId };
}

export function createSharedQuestionBankPackage(bank: SavedQuestionBank): SharedQuestionBankPackage {
  return {
    format: "hongdou-question-bank",
    version: 1,
    exportedAt: new Date().toISOString(),
    bank: {
      name: bank.name,
      description: bank.description,
      sourceTitle: bank.sourceTitle,
      edition: bank.edition,
      author: bank.author,
      copyrightNotice: bank.copyrightNotice,
      groupName: bank.groupName,
      questions: bank.questions,
    },
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
    sourceTitle: typeof payload.bank.sourceTitle === "string" ? payload.bank.sourceTitle.slice(0, 160) : "",
    edition: typeof payload.bank.edition === "string" ? payload.bank.edition.slice(0, 80) : "",
    author: typeof payload.bank.author === "string" ? payload.bank.author.slice(0, 120) : "",
    copyrightNotice: typeof payload.bank.copyrightNotice === "string" ? payload.bank.copyrightNotice.slice(0, 500) : "",
    groupName: typeof payload.bank.groupName === "string" ? payload.bank.groupName : "",
    questions,
    importedAt: new Date().toISOString(),
  };
}
