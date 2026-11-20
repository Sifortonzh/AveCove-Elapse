import type { PavilionQuestionBank, SavedQuestionBank } from "./local-bank";
import type { QuizQuestion } from "./question-parser";

export type PavilionRevision = { id: string; revision: string };

export function normalizePavilionRevision(value: unknown): PavilionRevision | undefined {
  const item = value as Partial<PavilionRevision> | null;
  if (typeof item?.id !== "string" || !/^[\w-]{1,100}$/.test(item.id) || typeof item.revision !== "string") return;
  const time = Date.parse(item.revision);
  if (Number.isFinite(time)) return { id: item.id, revision: new Date(time).toISOString() };
}

export function latestPavilionEntry(bank: SavedQuestionBank, entries: PavilionQuestionBank[]) {
  if (bank.pavilion) return entries.find(entry => entry.id === bank.pavilion!.id);
  // Only adopt an untracked legacy bank when there is one matching publication.
  const candidates = entries.filter(entry => entry.sourceBankId === bank.id && entry.name === bank.name);
  if (candidates.length === 1) return candidates[0];
}

export function newerPavilionEntry(bank: SavedQuestionBank, entries: PavilionQuestionBank[]) {
  const entry = latestPavilionEntry(bank, entries);
  if (!entry || (!bank.pavilion && entry.own)) return;
  const importedRevision = bank.pavilion?.revision ?? bank.importedAt;
  if (Date.parse(entry.uploadedAt) > Date.parse(importedRevision)) return entry;
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, "").normalize("NFKC");
const choices = (question: QuizQuestion) => question.options.map(o => JSON.stringify([o.label, clean(o.text)])).sort();
const contentKey = (question: QuizQuestion) => JSON.stringify([clean(question.sharedStem), clean(question.stem), choices(question)]);

export function preservePavilionRecordIds(existing: QuizQuestion[], incoming: QuizQuestion[], newId: () => string) {
  const bucket = (items: QuizQuestion[]) => {
    const map = new Map<string, QuizQuestion[]>();
    for (const q of items) { const k = contentKey(q); const values = map.get(k); if (values) values.push(q); else map.set(k, [q]); }
    return map;
  };
  const oldContent = bucket(existing), newContent = bucket(incoming);
  const byId = new Map(existing.map(q => [q.id, q]));
  const matched = new Map<number, string>();
  const used = new Set<string>();
  // Reserve unambiguous content matches first, independent of chapters and numbering.
  incoming.forEach((q, index) => {
    const key = contentKey(q), old = oldContent.get(key);
    if (old?.length === 1 && newContent.get(key)?.length === 1 && !used.has(old[0].id)) { matched.set(index, old[0].id); used.add(old[0].id); }
  });
  incoming.forEach((q, index) => {
    const candidate = byId.get(q.id);
    if (!matched.has(index) && candidate && !used.has(candidate.id) && contentKey(candidate) === contentKey(q)) {
      matched.set(index, candidate.id); used.add(candidate.id);
    }
  });
  return incoming.map((q, index) => ({ ...q, id: matched.get(index) ?? newId() }));
}
