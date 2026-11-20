import type { QuizQuestion } from "./question-parser";

export type OptionLabelMap = ReadonlyMap<string, string>;

export function moveQuestionChapter(items: QuizQuestion[], questionId: string, category: string) {
  const current = items.find(q => q.id === questionId);
  const target = category.trim();
  if (!current || current.category === target || !target) return items;
  const remaining = items.filter(q => q.id !== questionId);
  const first = remaining.findIndex(q => q.category === target);
  const destination = [...remaining.filter(q => q.category === target), { ...current, category: target }]
    .sort((a, b) => String(a.sourceNumber).localeCompare(String(b.sourceNumber), "zh-CN", { numeric: true }));
  if (first < 0) return [...remaining, ...destination];
  return [...remaining.slice(0, first), ...destination, ...remaining.slice(first).filter(q => q.category !== target)];
}

export function orderEditedSession(session: QuizQuestion[], bank: QuizQuestion[], reorder: boolean) {
  const lookup = new Map(bank.map(q => [q.id, q]));
  if (!reorder) return session.map(q => {
    const updated = lookup.get(q.id);
    if (!updated) return q;
    const options = new Map(updated.options.map(option => [option.label, option]));
    const labels = q.options.map(option => option.label).filter(label => options.has(label));
    const kept = new Set(labels);
    return { ...updated, options: [...labels.map(label => options.get(label)!), ...updated.options.filter(option => !kept.has(option.label))] };
  });
  const ids = new Set(session.map(q => q.id));
  return bank.filter(q => ids.has(q.id));
}

export function relabelOptions<T extends { label: string }>(options: T[]) {
  const labels = new Map<string, string>();
  const items = options.map((option, index) => {
    const label = "ABCDEFG"[index];
    labels.set(option.label, label);
    return { ...option, label };
  });
  return { items, labels };
}

export function remapOptionLabels(labels: string[], map: OptionLabelMap) {
  return labels.flatMap(label => {
    const next = map.get(label);
    return next ? [next] : [];
  });
}

export function removeMarkedQuestions(items: QuizQuestion[], ids: string[]) {
  const marked = new Set(ids);
  const remaining = items.filter(question => !marked.has(question.id));
  if (!remaining.length) throw new Error("全部题目都已斩，请在题库页备份后删除整份题库；这里至少保留一道题。");
  return { questions: remaining, deleted: items.filter(question => marked.has(question.id)) };
}

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

export function deleteQuestionAndRenumber(items: QuizQuestion[], questionId: string) {
  if (items.length <= 1) throw new Error("题库至少需要保留一道题，无法删除最后一题");
  const deleteIndex = items.findIndex((question) => question.id === questionId);
  if (deleteIndex < 0) throw new Error("没有找到要删除的题目，请返回题库后重试");

  const deleted = items[deleteIndex];
  const deletedSourceNumber = deleted.sourceNumber.trim();
  const deletedNumber = Number.parseInt(deletedSourceNumber, 10);
  const nextItems = items.filter((question) => question.id !== questionId).map((question) => ({ ...question }));

  if (/^\d+$/.test(deletedSourceNumber)) {
    let expectedOriginalNumber = deletedNumber + 1;
    for (let index = deleteIndex; index < nextItems.length; index += 1) {
      const original = nextItems[index].sourceNumber.trim();
      if (!/^\d+$/.test(original) || Number(original) !== expectedOriginalNumber) break;
      nextItems[index] = { ...nextItems[index], sourceNumber: String(expectedOriginalNumber - 1) };
      expectedOriginalNumber += 1;
    }
  }

  return { questions: nextItems, deleted };
}
