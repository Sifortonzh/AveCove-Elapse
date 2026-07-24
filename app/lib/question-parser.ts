export type QuizOption = { label: string; text: string };
export type Western306Format = "modern-165" | "legacy-c-type" | "unknown-306";
export type QuizQuestion = {
  id: string;
  sourceNumber: string;
  category: string;
  stem: string;
  options: QuizOption[];
  answer: string[];
  answerPending?: boolean;
  draftAnswer?: string[];
  multiple: boolean;
  examProfile?: "western-medicine-306";
  examYear?: number;
  examFormat?: Western306Format;
  questionType?: "A" | "B" | "C" | "X";
  points?: number;
  sharedOptionGroup?: string;
  explanation?: string;
  answerSource?: string;
};

const normalizeLabel = (value: string) => value.toUpperCase().replace(/[ＡＢＣＤＥＦＧ]/g, (letter) => "ABCDEFG"["ＡＢＣＤＥＦＧ".indexOf(letter)]);

function parseWestern306Header(body: string) {
  const header = body.slice(0, 420).match(/((?:19|20)\d{2})\s*N\s*(\d{1,3})\s*([ABCX])\s*[.．、]\s*/i);
  if (!header) return null;
  const examYear = Number.parseInt(header[1], 10);
  return {
    length: (header.index ?? 0) + header[0].length,
    sourceNumber: header[2],
    examYear,
    questionType: header[3].toUpperCase() as "A" | "B" | "C" | "X",
    examFormat: examYear >= 2017 ? "modern-165" as const : "legacy-c-type" as const,
  };
}

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

    const westernHeader = parseWestern306Header(body);
    const questionBody = westernHeader ? body.slice(westernHeader.length) : body;
    const optionPattern = /([A-GＡ-Ｇ])\s*[.．、]\s*/gi;
    const markers = [...questionBody.matchAll(optionPattern)];
    if (markers.length < 2 || !answer.length) continue;
    const first = markers[0].index ?? 0;
    const numberMatch = questionBody.slice(0, first).match(/^\s*(\d+)\s*[.．、]\s*/);
    const stem = questionBody.slice(numberMatch?.[0].length ?? 0, first).replace(/\n+/g, " ").trim();
    const options = markers.map((marker, optionIndex) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = optionIndex + 1 < markers.length ? markers[optionIndex + 1].index ?? questionBody.length : questionBody.length;
      return {
        label: marker[1].toUpperCase(),
        text: questionBody.slice(start, end).replace(/\n+/g, " ").trim(),
      };
    }).map((option) => ({ ...option, label: normalizeLabel(option.label) })).filter((option) => option.text);

    const labels = new Set(options.map((option) => option.label));
    const validAnswer = answer.filter((value) => labels.has(value));
    if (!stem || options.length < 2 || !validAnswer.length) continue;
    parsed.push({
      id: `imported-${Date.now()}-${parsed.length}`,
      sourceNumber: westernHeader?.sourceNumber ?? numberMatch?.[1] ?? String(parsed.length + 1),
      category,
      stem,
      options,
      answer: validAnswer,
      multiple: westernHeader?.questionType === "X" || validAnswer.length > 1,
      examProfile: westernHeader ? "western-medicine-306" : undefined,
      examYear: westernHeader?.examYear,
      examFormat: westernHeader?.examFormat,
      questionType: westernHeader?.questionType,
      points: westernHeader?.examFormat === "modern-165"
        ? Number(westernHeader.sourceNumber) <= 40 ? 1.5
          : Number(westernHeader.sourceNumber) <= 115 ? 2
            : Number(westernHeader.sourceNumber) <= 135 ? 1.5 : 2
        : undefined,
    });
  }
  return parsed;
}
