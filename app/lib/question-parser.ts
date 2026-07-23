export type QuizOption = { label: string; text: string };
export type QuizQuestion = {
  id: string;
  sourceNumber: string;
  category: string;
  stem: string;
  options: QuizOption[];
  answer: string[];
  multiple: boolean;
  examProfile?: "western-medicine-306";
  questionType?: "A" | "B" | "X";
  points?: number;
  sharedOptionGroup?: string;
  explanation?: string;
  answerSource?: string;
};

const normalizeLabel = (value: string) => value.toUpperCase().replace(/[ＡＢＣＤＥＦＧ]/g, (letter) => "ABCDEFG"["ＡＢＣＤＥＦＧ".indexOf(letter)]);

export function parseQuestionText(text: string, category = "导入题库"): QuizQuestion[] {
  const chunks = text.replace(/\r/g, "").split(/答案\s*[:：]/);
  const parsed: QuizQuestion[] = [];
  let prefix = chunks.shift() ?? "";

  for (const answerChunk of chunks) {
    const answerMatch = answerChunk.match(/^\s*([A-GＡ-Ｇ、，,\s]+)/i);
    if (!answerMatch) {
      prefix = answerChunk;
      continue;
    }
    const answer = [...new Set((answerMatch[1].match(/[A-GＡ-Ｇ]/gi) ?? []).map(normalizeLabel))];
    const nextBody = answerChunk.slice(answerMatch[0].length);
    const nextQuestion = nextBody.search(/(?:^|\n)\s*\d+\s*[.．、]/);
    const body = `${prefix}\n${nextQuestion >= 0 ? nextBody.slice(0, nextQuestion) : ""}`.replace(/[ \t]+/g, " ").trim();
    prefix = nextQuestion >= 0 ? nextBody.slice(nextQuestion).trim() : nextBody.trim();

    const optionPattern = /([A-GＡ-Ｇ])\s*[.．、]\s*/gi;
    const markers = [...body.matchAll(optionPattern)];
    if (markers.length < 2 || !answer.length) continue;
    const first = markers[0].index ?? 0;
    const numberMatch = body.slice(0, first).match(/^\s*(\d+)\s*[.．、]\s*/);
    const stem = body.slice(numberMatch?.[0].length ?? 0, first).replace(/\n+/g, " ").trim();
    const options = markers.map((marker, optionIndex) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = optionIndex + 1 < markers.length ? markers[optionIndex + 1].index ?? body.length : body.length;
      return {
        label: marker[1].toUpperCase(),
        text: body.slice(start, end).replace(/\n+/g, " ").trim(),
      };
    }).map((option) => ({ ...option, label: normalizeLabel(option.label) })).filter((option) => option.text);

    const labels = new Set(options.map((option) => option.label));
    const validAnswer = answer.filter((value) => labels.has(value));
    if (!stem || options.length < 2 || !validAnswer.length) continue;
    parsed.push({
      id: `imported-${Date.now()}-${parsed.length}`,
      sourceNumber: numberMatch?.[1] ?? String(parsed.length + 1),
      category,
      stem,
      options,
      answer: validAnswer,
      multiple: validAnswer.length > 1,
    });
  }
  return parsed;
}
