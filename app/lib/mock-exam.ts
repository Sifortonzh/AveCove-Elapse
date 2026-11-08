import type { QuizQuestion } from "./question-parser";

export function mockExamClock(startedAt: number, now: number, minutes: number) {
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return { elapsed, remaining: Math.max(0, minutes * 60 - elapsed) };
}

export function formatMockExamTime(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(part => String(part).padStart(2, "0")).join(":");
}

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
