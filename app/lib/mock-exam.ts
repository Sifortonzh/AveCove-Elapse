import type { QuizQuestion } from "./question-parser";

export function gradeMockExam(questions: readonly QuizQuestion[], selections: Record<string, string[]>) {
  const progress: Record<string, "correct" | "wrong"> = {};
  let correct = 0, unanswered = 0, pending = 0, earned = 0, maximum = 0;
  for (const question of questions) {
    const chosen = selections[question.id] ?? [];
    if (!question.answer.length || question.answerPending) { pending++; continue; }
    const points = question.points ?? 1;
    maximum += points;
    if (!chosen.length) { unanswered++; continue; }
    const right = [...chosen].sort().join("|") === [...question.answer].sort().join("|");
    progress[question.id] = right ? "correct" : "wrong";
    if (right) { correct++; earned += points; }
  }
  return { progress, correct, wrong: Object.values(progress).filter(value => value === "wrong").length, unanswered, pending, earned, maximum };
}
