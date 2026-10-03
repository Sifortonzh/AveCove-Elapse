import type { QuizQuestion } from "./question-parser";

/** Display-only labels: never rewrite source numbers used to match answers. */
export function compactQuestionNumbers(questions: QuizQuestion[], bankName = "") {
  const entries = questions.map((question, index) => {
    const raw = String(question.sourceNumber ?? "").trim();
    const match = raw.match(/(?:第\s*)?(\d+(?:\+\d+)?)\s*(?:题)?$/);
    const number = match?.[1] ?? String(index + 1);
    const source = match ? raw.slice(0, match.index).replace(/[\s:：/\\·_\-—]+$/, "").trim() : raw;
    const metadata = question as QuizQuestion & { sourceFile?: string; sourceTitle?: string; fileName?: string };
    const origin = source || metadata.sourceFile || metadata.fileName || metadata.sourceTitle || "";
    const yearSource = origin || (question.examProfile ? "" : bankName);
    const year = yearSource.match(/(?:^|[^\d])((?:19|20)?\d{2})\s*年?\s*(?:考题|试题|真题|考卷|试卷)/)?.[1];
    return { question, raw, number, origin, year: year?.slice(-2) };
  });
  const origins = [...new Set(entries.map((entry) => entry.origin).filter(Boolean))];
  const numberOrigins = new Map<string, Set<string>>();
  for (const entry of entries) {
    const scopes = numberOrigins.get(entry.number) ?? new Set<string>();
    scopes.add(entry.origin);
    numberOrigins.set(entry.number, scopes);
  }
  return new Map(entries.map(({ question, raw, number, origin, year }) => {
    const prefix = year || (origin && (numberOrigins.get(number)?.size ?? 0) > 1 ? String(origins.indexOf(origin) + 1) : "");
    return [question.id, { label: prefix ? `${prefix}-${number}` : number,
      details: [origin, `原题号 ${raw || number}`, question.points ? `${question.points} 分` : ""].filter(Boolean).join(" · ") }];
  }));
}
