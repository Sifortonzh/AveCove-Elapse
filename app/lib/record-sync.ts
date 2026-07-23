export type ProgressValue = "correct" | "wrong";

export type TimedValue<T> = {
  value: T;
  updatedAt: number;
};

export type RecordLedgerEntry = {
  progress?: TimedValue<ProgressValue | null>;
  favorite?: TimedValue<boolean>;
  note?: TimedValue<string | null>;
};

export type RecordLedger = Record<string, RecordLedgerEntry>;

export type LearningRecords = {
  progress: Record<string, ProgressValue>;
  favorites: string[];
  notes: Record<string, string>;
  ledger: RecordLedger;
};

export type LearningRecordsInput = {
  progress?: unknown;
  favorites?: unknown;
  notes?: unknown;
  ledger?: unknown;
};

const LEGACY_TIMESTAMP = 1;

function validTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : LEGACY_TIMESTAMP;
}

function normalizeTimedValue<T>(
  value: unknown,
  validate: (candidate: unknown) => candidate is T,
): TimedValue<T> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { value?: unknown; updatedAt?: unknown };
  if (!validate(candidate.value)) return undefined;
  return { value: candidate.value, updatedAt: validTimestamp(candidate.updatedAt) };
}

function normalizeLedger(value: unknown): RecordLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: RecordLedger = {};
  for (const [questionId, rawEntry] of Object.entries(value)) {
    if (!questionId || questionId.length > 240 || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    const progress = normalizeTimedValue(entry.progress, (candidate): candidate is ProgressValue | null =>
      candidate === "correct" || candidate === "wrong" || candidate === null);
    const favorite = normalizeTimedValue(entry.favorite, (candidate): candidate is boolean => typeof candidate === "boolean");
    const note = normalizeTimedValue(entry.note, (candidate): candidate is string | null =>
      candidate === null || typeof candidate === "string");
    if (progress || favorite || note) result[questionId] = { progress, favorite, note };
  }
  return result;
}

function normalizeLegacyRecords(input: LearningRecordsInput) {
  const progress: Record<string, ProgressValue> = {};
  if (input.progress && typeof input.progress === "object" && !Array.isArray(input.progress)) {
    for (const [questionId, value] of Object.entries(input.progress)) {
      if (value === "correct" || value === "wrong") progress[questionId] = value;
    }
  }
  const favorites = Array.isArray(input.favorites)
    ? [...new Set(input.favorites.filter((item): item is string => typeof item === "string" && Boolean(item)))]
    : [];
  const notes: Record<string, string> = {};
  if (input.notes && typeof input.notes === "object" && !Array.isArray(input.notes)) {
    for (const [questionId, value] of Object.entries(input.notes)) {
      if (typeof value === "string" && value) notes[questionId] = value;
    }
  }
  return { progress, favorites, notes };
}

function chooseTimedValue<T>(
  left: TimedValue<T> | undefined,
  right: TimedValue<T> | undefined,
  tieBreaker: (leftValue: T, rightValue: T) => T,
): TimedValue<T> | undefined {
  if (!left) return right;
  if (!right) return left;
  if (left.updatedAt > right.updatedAt) return left;
  if (right.updatedAt > left.updatedAt) return right;
  return { value: tieBreaker(left.value, right.value), updatedAt: left.updatedAt };
}

function materializeLedger(ledger: RecordLedger): LearningRecords {
  const progress: Record<string, ProgressValue> = {};
  const favorites: string[] = [];
  const notes: Record<string, string> = {};
  for (const [questionId, entry] of Object.entries(ledger)) {
    if (entry.progress?.value === "correct" || entry.progress?.value === "wrong") progress[questionId] = entry.progress.value;
    if (entry.favorite?.value) favorites.push(questionId);
    if (typeof entry.note?.value === "string" && entry.note.value) notes[questionId] = entry.note.value;
  }
  return { progress, favorites, notes, ledger };
}

export function normalizeLearningRecords(input: LearningRecordsInput): LearningRecords {
  const legacy = normalizeLegacyRecords(input);
  const ledger = normalizeLedger(input.ledger);
  for (const [questionId, value] of Object.entries(legacy.progress)) {
    ledger[questionId] = {
      ...ledger[questionId],
      progress: ledger[questionId]?.progress ?? { value, updatedAt: LEGACY_TIMESTAMP },
    };
  }
  for (const questionId of legacy.favorites) {
    ledger[questionId] = {
      ...ledger[questionId],
      favorite: ledger[questionId]?.favorite ?? { value: true, updatedAt: LEGACY_TIMESTAMP },
    };
  }
  for (const [questionId, value] of Object.entries(legacy.notes)) {
    ledger[questionId] = {
      ...ledger[questionId],
      note: ledger[questionId]?.note ?? { value, updatedAt: LEGACY_TIMESTAMP },
    };
  }
  return materializeLedger(ledger);
}

export function mergeLearningRecords(leftInput: LearningRecordsInput, rightInput: LearningRecordsInput): LearningRecords {
  const left = normalizeLearningRecords(leftInput);
  const right = normalizeLearningRecords(rightInput);
  const ids = new Set([...Object.keys(left.ledger), ...Object.keys(right.ledger)]);
  const ledger: RecordLedger = {};
  for (const questionId of ids) {
    const leftEntry = left.ledger[questionId];
    const rightEntry = right.ledger[questionId];
    const progress = chooseTimedValue(leftEntry?.progress, rightEntry?.progress, (leftValue, rightValue) =>
      rightValue ?? leftValue);
    const favorite = chooseTimedValue(leftEntry?.favorite, rightEntry?.favorite, (leftValue, rightValue) =>
      leftValue || rightValue);
    const note = chooseTimedValue(leftEntry?.note, rightEntry?.note, (leftValue, rightValue) => {
      if (leftValue === null) return rightValue;
      if (rightValue === null) return leftValue;
      return rightValue.length >= leftValue.length ? rightValue : leftValue;
    });
    ledger[questionId] = { progress, favorite, note };
  }
  return materializeLedger(ledger);
}

export function learningRecordsEqual(leftInput: LearningRecordsInput, rightInput: LearningRecordsInput) {
  const left = normalizeLearningRecords(leftInput).ledger;
  const right = normalizeLearningRecords(rightInput).ledger;
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  if (leftIds.length !== rightIds.length) return false;
  return leftIds.every((questionId) => {
    const leftEntry = left[questionId];
    const rightEntry = right[questionId];
    if (!rightEntry) return false;
    return (["progress", "favorite", "note"] as const).every((field) => {
      const leftValue = leftEntry[field];
      const rightValue = rightEntry[field];
      return leftValue?.value === rightValue?.value && leftValue?.updatedAt === rightValue?.updatedAt;
    });
  });
}

export function stampLearningRecord(
  ledger: RecordLedger,
  questionId: string,
  patch: { progress?: ProgressValue | null; favorite?: boolean; note?: string | null },
  updatedAt = Date.now(),
): RecordLedger {
  const next = { ...ledger };
  const entry = { ...next[questionId] };
  if (Object.prototype.hasOwnProperty.call(patch, "progress")) entry.progress = { value: patch.progress ?? null, updatedAt };
  if (Object.prototype.hasOwnProperty.call(patch, "favorite")) entry.favorite = { value: Boolean(patch.favorite), updatedAt };
  if (Object.prototype.hasOwnProperty.call(patch, "note")) entry.note = { value: patch.note ?? null, updatedAt };
  next[questionId] = entry;
  return next;
}
