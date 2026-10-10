import type { QuizQuestion } from "./question-parser";

const key = (text: string) => text.replace(/\s+/g, "");
export const isSharedCase = (q: QuizQuestion) => q.medicalQuestionType === "A3" || q.medicalQuestionType === "A4";

export function removeSharedPrefix(stem: string, shared: string): string {
  const prefix = key(shared);
  if (!prefix || !key(stem).startsWith(prefix)) return stem.trim();
  let seen = "";
  for (let i = 0; i < stem.length; i++) {
    if (!/\s/.test(stem[i])) seen += stem[i];
    if (seen.length === prefix.length) return stem.slice(i + 1).trim();
  }
  return stem.trim();
}

export function sharedCaseDraft(question: QuizQuestion, bank: QuizQuestion[]) {
  let sharedStem = question.sharedStem?.trim() ?? "";
  // Only infer a repeated, sentence-complete prefix from nearby source questions.
  // Never use a semantic guess, and never discard an unanswered child question.
  if (!sharedStem) {
    const index = bank.findIndex(q => q.id === question.id);
    for (const other of bank.slice(Math.max(0, index - 3), index + 5)) {
      if (other.id === question.id || other.category !== question.category || other.multiple || other.sharedOptionGroup) continue;
      let length = 0;
      while (length < Math.min(question.stem.length, other.stem.length) && question.stem[length] === other.stem[length]) length++;
      const prefix = question.stem.slice(0, length);
      const boundary = Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("；"), prefix.lastIndexOf("\n"));
      const candidate = prefix.slice(0, boundary + 1).trim();
      if (key(candidate).length >= 40 && removeSharedPrefix(question.stem, candidate) && removeSharedPrefix(other.stem, candidate)) {
        if (candidate.length > sharedStem.length) sharedStem = candidate;
      }
    }
  }
  const children = bank.filter(q => q.category === question.category && (q.id === question.id
    || (question.sharedStemGroup && q.sharedStemGroup === question.sharedStemGroup)
    || (sharedStem && (key(q.sharedStem ?? "") === key(sharedStem)
      || (key(q.stem).startsWith(key(sharedStem)) && Boolean(removeSharedPrefix(q.stem, sharedStem)))))));
  return { sharedStem, children: children.map(q => ({ ...q, stem: sharedStem ? removeSharedPrefix(q.stem, sharedStem) : q.stem })) };
}

export function groupSharedCases(items: QuizQuestion[]): QuizQuestion[] {
  const groups = new Map<string, string>();
  const owners = new Map<string, string>();
  return items.map(q => {
    if (!isSharedCase(q) || !q.sharedStem?.trim()) return q;
    const identity = JSON.stringify([q.category, q.medicalQuestionType, key(q.sharedStem)]);
    const preferred = q.sharedStemGroup ?? `case-${q.id}`;
    const group = groups.get(identity) ?? (owners.has(preferred) && owners.get(preferred) !== identity ? `case-${q.id}` : preferred);
    groups.set(identity, group);
    owners.set(group, identity);
    return { ...q, sharedStem: q.sharedStem.trim(), sharedStemGroup: group };
  });
}

export function reviseSharedCase(items: QuizQuestion[], revision: QuizQuestion, children: QuizQuestion[] = []) {
  const changes = new Map([revision, ...children].map(q => [q.id, q]));
  const original = items.find(q => q.id === revision.id);
  const shared = revision.sharedStem?.trim();
  const updated = items.map(q => {
    const explicit = changes.get(q.id);
    if (!isSharedCase(revision) || !shared) return explicit ?? q;
    const sameOldGroup = original?.sharedStemGroup && q.sharedStemGroup === original.sharedStemGroup;
    const sameCase = key(q.sharedStem ?? "") === key(shared)
      || (key(q.stem).startsWith(key(shared)) && Boolean(removeSharedPrefix(q.stem, shared)));
    if (!explicit && (q.category !== revision.category || (!sameOldGroup && !sameCase) || q.multiple || q.sharedOptionGroup
      || q.medicalQuestionType === "X" || q.questionType === "X"
      || (isSharedCase(q) && q.medicalQuestionType !== revision.medicalQuestionType))) return q;
    const child = explicit ?? q;
    return { ...child, stem: explicit ? child.stem : removeSharedPrefix(child.stem, shared), sharedStem: shared,
      sharedStemGroup: revision.sharedStemGroup ?? original?.sharedStemGroup ?? `case-${revision.id}`,
      medicalQuestionType: revision.medicalQuestionType, questionType: "A" as const, multiple: false };
  });
  return groupSharedCases(updated);
}
