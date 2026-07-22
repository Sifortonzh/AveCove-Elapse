import type { SavedQuestionBank } from "./local-bank";
import type { QuizQuestion } from "./question-parser";

export type QuestionSearchMatch = {
  bank: SavedQuestionBank;
  question: QuizQuestion;
  score: number;
  matchedFields: Array<"题库" | "分类" | "题干" | "选项" | "题号">;
  matchedOption?: string;
};

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function getSearchTerms(query: string) {
  return [...new Set(normalize(query).split(" ").filter(Boolean))].slice(0, 8);
}

export function searchQuestionBanks(banks: SavedQuestionBank[], query: string, limit = 100): QuestionSearchMatch[] {
  const terms = getSearchTerms(query);
  if (!terms.length) return [];
  const fullQuery = normalize(query);
  const matches: QuestionSearchMatch[] = [];

  for (const bank of banks) {
    const bankName = normalize(bank.name);
    for (const question of bank.questions) {
      const category = normalize(question.category);
      const stem = normalize(question.stem);
      const sourceNumber = normalize(String(question.sourceNumber));
      const options = question.options.map((option) => ({ label: option.label, text: normalize(option.text), raw: option.text }));
      const matchedFields = new Set<QuestionSearchMatch["matchedFields"][number]>();
      let score = 0;
      let rejected = false;

      for (const term of terms) {
        let best = 0;
        if (bankName.includes(term)) { best = bankName === term ? 220 : 130; matchedFields.add("题库"); }
        if (category.includes(term) && best < 105) { best = category === term ? 125 : 105; matchedFields.add("分类"); }
        if (stem.includes(term) && best < 95) { best = stem === term ? 130 : stem.startsWith(term) ? 115 : 95; matchedFields.add("题干"); }
        if (options.some((option) => option.text.includes(term)) && best < 55) { best = 55; matchedFields.add("选项"); }
        if (sourceNumber === term && best < 80) { best = 80; matchedFields.add("题号"); }
        if (!best) { rejected = true; break; }
        score += best;
      }
      if (rejected) continue;

      if (fullQuery && bankName === fullQuery) score += 180;
      else if (fullQuery && stem.includes(fullQuery)) score += 90;
      else if (fullQuery && category.includes(fullQuery)) score += 70;

      const optionHit = options.find((option) => terms.some((term) => option.text.includes(term)));
      matches.push({
        bank,
        question,
        score,
        matchedFields: [...matchedFields],
        matchedOption: optionHit ? `${optionHit.label}. ${optionHit.raw}` : undefined,
      });
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.bank.name.localeCompare(right.bank.name, "zh-CN") || String(left.question.sourceNumber).localeCompare(String(right.question.sourceNumber), "zh-CN", { numeric: true }))
    .slice(0, limit);
}
