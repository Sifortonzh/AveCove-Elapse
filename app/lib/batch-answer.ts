import type { QuizQuestion } from "./question-parser";

export type BatchAnswerEntry = { questionId: string; answer: string[] };

export function pendingAnswerQuestions(questions: QuizQuestion[]) {
  return questions.filter((question) => !question.answer.length || question.answerPending);
}

export function applyBatchAnswers(questions: QuizQuestion[], entries: BatchAnswerEntry[]) {
  const answers = new Map(entries.map((entry) => [entry.questionId, [...new Set(entry.answer.map((label) => label.toUpperCase()))]]));
  let updatedCount = 0;
  const next = questions.map((question) => {
    const requested = answers.get(question.id);
    if (!requested?.length) return question;
    const optionLabels = new Set(question.options.map((option) => option.label.toUpperCase()));
    const answer = requested.filter((label) => optionLabels.has(label)).sort();
    if (!answer.length) return question;
    updatedCount += 1;
    return {
      ...question,
      answer,
      answerPending: false,
      multiple: question.questionType === "X" || answer.length > 1,
      answerSource: question.answerSource || "手动批量补录",
    };
  });
  return { questions: next, updatedCount };
}
