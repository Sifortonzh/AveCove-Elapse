import type { QuizQuestion } from "./question-parser";

export function insertQuestionAfter(
  items: QuizQuestion[],
  afterQuestionId: string,
  draft: QuizQuestion,
  createId = () => `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
) {
  const afterIndex = items.findIndex((question) => question.id === afterQuestionId);
  if (afterIndex < 0) throw new Error("没有找到插入位置，请返回题库后重新打开这道题");

  const currentSourceNumber = items[afterIndex].sourceNumber.trim();
  const currentNumber = Number.parseInt(currentSourceNumber, 10);
  const nextItems = items.map((question) => ({ ...question }));
  let sourceNumber = `${currentSourceNumber}+1`;

  if (/^\d+$/.test(currentSourceNumber)) {
    sourceNumber = String(currentNumber + 1);
    let previousOriginalNumber = currentNumber;
    for (let index = afterIndex + 1; index < nextItems.length; index += 1) {
      const original = nextItems[index].sourceNumber.trim();
      if (!/^\d+$/.test(original) || Number(original) !== previousOriginalNumber + 1) break;
      previousOriginalNumber = Number(original);
      nextItems[index] = { ...nextItems[index], sourceNumber: String(previousOriginalNumber + 1) };
    }
  }

  const answer = [...new Set(draft.answer.map((label) => label.toUpperCase()))]
    .filter((label) => draft.options.some((option) => option.label === label));
  const inserted: QuizQuestion = {
    ...draft,
    id: createId(),
    sourceNumber,
    category: items[afterIndex].category,
    stem: draft.stem.trim(),
    options: draft.options.map((option) => ({ ...option, text: option.text.trim() })),
    answer,
    answerPending: answer.length === 0,
    multiple: draft.questionType === "X",
    explanation: draft.explanation?.trim() || undefined,
    answerSource: answer.length ? "manual" : undefined,
  };
  nextItems.splice(afterIndex + 1, 0, inserted);
  return { questions: nextItems, inserted };
}
