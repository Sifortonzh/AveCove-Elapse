import type { QuizQuestion } from "./question-parser";

export function isXQuestion(question: QuizQuestion): boolean {
  const type = String(question.questionType ?? "").normalize("NFKC").trim().toUpperCase();
  const medical = String(question.medicalQuestionType ?? "").normalize("NFKC").trim().toUpperCase();
  return question.multiple === true || /^(?:X(?:型(?:题)?)?|多(?:选(?:题)?)?|不定项(?:选择)?(?:题)?|MULTIPLE(?:[-_ ]CHOICE)?)$/.test(type)
    || question.medicalQuestionType === "X" || /^(?:X型(?:题)?|X)$/.test(medical)
    || question.answer.length > 1;
}

export function filterPracticeQuestionTypes(questions: QuizQuestion[], nonXOnly: boolean) {
  return nonXOnly ? questions.filter(question => !isXQuestion(question)) : questions;
}

export function practiceStats(questions: QuizQuestion[], progress: Record<string, "correct" | "wrong">, singleOnly = false, killed: readonly string[] = []) {
  const excluded = new Set(killed);
  const available = filterPracticeQuestionTypes(questions, singleOnly);
  const answered = available.filter((q) => excluded.has(q.id) || Boolean(progress[q.id])).length;
  const graded = available.filter((q) => !excluded.has(q.id) && Boolean(progress[q.id]));
  const correct = graded.filter((q) => progress[q.id] === "correct").length;
  return { available, total: available.length, answered, graded: graded.length, correct, wrong: graded.length - correct,
    percent: available.length ? answered / available.length * 100 : 0 };
}

export function newerPreferences<T extends { updatedAt?: number }>(local: T, remote: T): T {
  return (remote.updatedAt ?? 0) > (local.updatedAt ?? 0) ? remote : local;
}
