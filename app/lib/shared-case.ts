import type { QuizQuestion } from "./question-parser";

const key = (text: string) => text.replace(/\s+/g, "");
export const isSharedCase = (q: QuizQuestion) => q.medicalQuestionType === "A3" || q.medicalQuestionType === "A4";

// Compare writing variants only; numbers, units, negation and clinical words stay significant.
const caseText = (text: string) => text.normalize("NFC")
  .replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, "")
  .replace(/[｡。]/g, ".").replace(/査/g, "查").replace(/徴/g, "征").replace(/瞼/g, "睑");
const nearCaseKey = (text: string) => text.length >= 65 ? text.replace(/[的了]/g, "") : text;
const similarCase = (left: string, right: string) => {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 65 || Math.abs(left.length - right.length) !== 1) return false;
  const [long, short] = left.length > right.length ? [left, right] : [right, left];
  let index = 0;
  while (index < short.length && long[index] === short[index]) index++;
  return /[的了]/.test(long[index]) && long.slice(index + 1) === short.slice(index);
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_name, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item);
}

const a3Scope = (q: QuizQuestion) => JSON.stringify([q.category ?? "", q.examYear ?? null]);
const hasA3Type = (q: QuizQuestion) => /^A3(?:型题?)?$/i.test(String(q.medicalQuestionType ?? "").trim())
  || /^A3(?:型题?)?$/i.test(String(q.questionType ?? "").trim());

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
  const nearGroups = new Map<string, Array<{ text: string; group: string }>>();
  const owners = new Set<string>();
  const reserved = new Set(items.flatMap(q => q.sharedOptionGroup ? [q.sharedOptionGroup] : []));
  return items.map((q, index) => {
    if (!isSharedCase(q) || typeof q.sharedStem !== "string" || !q.sharedStem.trim()) return q;
    const a3 = q.medicalQuestionType === "A3";
    const text = a3 ? caseText(q.sharedStem) : key(q.sharedStem);
    const scope = a3 ? JSON.stringify([a3Scope(q), stableJson(q.sharedStemImages ?? [])]) : q.category;
    const identity = JSON.stringify([scope, q.medicalQuestionType, text]);
    const nearIdentity = JSON.stringify([scope, nearCaseKey(text)]);
    const candidates = a3 ? nearGroups.get(nearIdentity) ?? [] : [];
    let group = groups.get(identity) ?? candidates.find(candidate => similarCase(candidate.text, text))?.group;
    if (!group) {
      group = q.sharedStemGroup ?? `case-${q.id}`;
      while (owners.has(group) || reserved.has(group)) group = `case-${index}-${group}`;
      owners.add(group);
      if (a3) nearGroups.set(nearIdentity, [...candidates, { text, group }]);
    }
    groups.set(identity, group);
    return { ...q, sharedStem: q.sharedStem.trim(), sharedStemGroup: group };
  });
}

export function prepareImportedA3Cases(items: QuizQuestion[]): QuizQuestion[] {
  if (!items.some(hasA3Type)) return items;
  const prefixCounts = new Map<string, { count: number; explicit: boolean }>();
  const prefixes = items.map(q => {
    if (!hasA3Type(q) || typeof q.stem !== "string") return [];
    // Only derive complete sentence prefixes, and only if corroborated by another A3.
    const candidates = new Map<string, { prefix: string; rest: string }>();
    const scope = a3Scope(q);
    for (const boundary of q.stem.slice(0, 1800).matchAll(/[。！？；?!;\n]|\.(?=\s)/g)) {
      const end = boundary.index + 1;
      const prefix = q.stem.slice(0, end).trim();
      const rest = q.stem.slice(end).trim();
      const normalized = caseText(prefix);
      if (normalized.length >= 24 && rest && !candidates.has(normalized)) candidates.set(normalized, { prefix, rest });
    }
    for (const normalized of candidates.keys()) {
      const id = JSON.stringify([scope, normalized]);
      const current = prefixCounts.get(id);
      prefixCounts.set(id, { count: (current?.count ?? 0) + 1, explicit: current?.explicit ?? false });
    }
    if (typeof q.sharedStem === "string" && q.sharedStem.trim()) {
      const id = JSON.stringify([scope, caseText(q.sharedStem)]);
      prefixCounts.set(id, { count: prefixCounts.get(id)?.count ?? 0, explicit: true });
    }
    return [...candidates.values()];
  });
  const prepared = items.map((q, index): QuizQuestion => {
    if (!hasA3Type(q) || q.examProfile === "western-medicine-306" || q.answer.length > 1 || q.questionType === "X") return q;
    const base = { ...q, medicalQuestionType: "A3" as const, questionType: "A" as const, multiple: false };
    const explicit = typeof q.sharedStem === "string" && q.sharedStem.trim();
    if (explicit) {
      const repeated = prefixes[index].find(candidate => caseText(candidate.prefix) === caseText(explicit));
      return { ...base, stem: repeated?.rest || removeSharedPrefix(q.stem, explicit) || q.stem };
    }
    const inferred = prefixes[index].findLast(candidate => {
      const evidence = prefixCounts.get(JSON.stringify([a3Scope(q), caseText(candidate.prefix)]));
      return Boolean(evidence && (evidence.explicit || evidence.count >= 2));
    });
    return inferred ? { ...base, sharedStem: inferred.prefix, stem: inferred.rest } : base;
  });
  const seen = new Set<string>();
  return groupSharedCases(prepared).filter(q => {
    if (q.medicalQuestionType !== "A3" || !q.sharedStemGroup || !q.sharedStem) return true;
    // Never discard different answers, source metadata, explanation or images.
    const content: Partial<QuizQuestion> = { ...q, sharedStem: caseText(q.sharedStem) };
    delete content.id;
    delete content.sourceNumber;
    const signature = stableJson(content);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
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
