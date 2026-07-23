export type ImportedResponse = { choice: string; submitted: boolean };

export type EnglishPracticeRecord = {
  responses: Record<string, ImportedResponse>;
  drafts: Record<string, string>;
  updatedAt: string;
};

export type EnglishPracticeSyncBundle = {
  version: 1;
  records: Record<string, EnglishPracticeRecord>;
};

export const englishPracticeStoragePrefix = "avecove-english-practice-v1:";

const emptyPractice = (): EnglishPracticeRecord => ({ responses: {}, drafts: {}, updatedAt: "" });

function notifySyncChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("avecove-sync-change"));
}

function normalizePractice(value: unknown): EnglishPracticeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyPractice();
  const candidate = value as Partial<EnglishPracticeRecord>;
  return {
    responses: candidate.responses && typeof candidate.responses === "object" && !Array.isArray(candidate.responses)
      ? candidate.responses as Record<string, ImportedResponse>
      : {},
    drafts: candidate.drafts && typeof candidate.drafts === "object" && !Array.isArray(candidate.drafts)
      ? Object.fromEntries(Object.entries(candidate.drafts).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {},
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

export function readEnglishPractice(testId: string): EnglishPracticeRecord {
  if (typeof window === "undefined") return emptyPractice();
  try {
    return normalizePractice(JSON.parse(window.localStorage.getItem(`${englishPracticeStoragePrefix}${testId}`) || "null"));
  } catch {
    return emptyPractice();
  }
}

export function saveEnglishPractice(testId: string, record: Pick<EnglishPracticeRecord, "responses" | "drafts">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${englishPracticeStoragePrefix}${testId}`, JSON.stringify({ ...record, updatedAt: new Date().toISOString() }));
  notifySyncChange();
}

export function clearEnglishPractice(testId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${englishPracticeStoragePrefix}${testId}`);
  notifySyncChange();
}

export function hasEnglishPractice(testId: string) {
  const record = readEnglishPractice(testId);
  return Object.values(record.responses).some((response) => Boolean(response.choice)) || Object.values(record.drafts).some((draft) => Boolean(draft.trim()));
}

export function exportEnglishPracticeSyncBundle(): EnglishPracticeSyncBundle {
  const records: Record<string, EnglishPracticeRecord> = {};
  if (typeof window === "undefined") return { version: 1, records };
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(englishPracticeStoragePrefix)) continue;
    const testId = key.slice(englishPracticeStoragePrefix.length);
    if (testId) records[testId] = readEnglishPractice(testId);
  }
  return { version: 1, records };
}

export function mergeEnglishPracticeSyncBundle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof window === "undefined") return 0;
  const bundle = value as Partial<EnglishPracticeSyncBundle>;
  if (bundle.version !== 1 || !bundle.records || typeof bundle.records !== "object" || Array.isArray(bundle.records)) return 0;
  let merged = 0;
  Object.entries(bundle.records).slice(0, 80).forEach(([testId, raw]) => {
    if (!testId || testId.length > 160) return;
    const remote = normalizePractice(raw);
    const local = readEnglishPractice(testId);
    if (local.updatedAt && (!remote.updatedAt || local.updatedAt > remote.updatedAt)) return;
    window.localStorage.setItem(`${englishPracticeStoragePrefix}${testId}`, JSON.stringify(remote));
    merged += 1;
  });
  return merged;
}
