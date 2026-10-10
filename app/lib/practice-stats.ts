import type { QuizQuestion } from "./question-parser";

export function isXQuestion(question: QuizQuestion): boolean {
  const type = String(question.questionType ?? "").trim().toUpperCase();
  return question.multiple || type === "X" || type === "多" || type === "多选"
    || question.medicalQuestionType === "X" || question.answer.length > 1;
}

export function practiceStats(questions: QuizQuestion[], progress: Record<string, "correct" | "wrong">, singleOnly = false, killed: readonly string[] = []) {
  const excluded = new Set(killed);
  const available = questions.filter((q) => !excluded.has(q.id) && (!singleOnly || !isXQuestion(q)));
  const answered = available.filter((q) => Boolean(progress[q.id])).length;
  const correct = available.filter((q) => progress[q.id] === "correct").length;
  return { available, total: available.length, answered, correct, wrong: answered - correct,
    percent: available.length ? answered / available.length * 100 : 0 };
}

export function newerPreferences<T extends { updatedAt?: number }>(local: T, remote: T): T {
  return (remote.updatedAt ?? 0) > (local.updatedAt ?? 0) ? remote : local;
}
