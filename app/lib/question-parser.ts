export type QuizOption = { label: string; text: string };
export type Western306Format = "modern-165" | "legacy-c-type" | "unknown-306";
export type MedicalQuestionType = "A1" | "A2" | "A3" | "A4" | "B1" | "C" | "X";
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
  medicalQuestionType?: MedicalQuestionType;
  points?: number;
  sharedStem?: string;
  sharedStemGroup?: string;
  sharedOptionGroup?: string;
  explanation?: string;
  answerSource?: string;
};

const normalizeLabel = (value: string) => value.toUpperCase().replace(/[ＡＢＣＤＥＦＧ]/g, (letter) => "ABCDEFG"["ＡＢＣＤＥＦＧ".indexOf(letter)]);

type GeneralQuestionKind = "single" | "multiple" | "judgement";
type GeneralAnswer = { answer: string[]; source: string };
type GeneralDraft = {
  chapter: string;
  kind: GeneralQuestionKind;
  questionType?: "A" | "B" | "C" | "X";
  number: string;
  body: string;
  inlineAnswer?: string[];
  sharedOptionGroup?: string;
};

type GeneralSection = {
  kind: GeneralQuestionKind | "skip";
  questionType?: "A" | "B" | "C" | "X";
};

const GENERAL_SECTION_LABELS: Record<GeneralQuestionKind, string> = {
  single: "单选题",
  multiple: "多选题",
  judgement: "判断题",
};

function restoreLegacyWordLists(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const sectionCount = lines.filter((line) => /^(?:[【\[])?[ABCX](?:1)?型题(?:[】\]])?\s*[:：]?$/.test(line)).length;
  const inlineAnswerCount = lines.filter((line) => inlineAnswerFromBody(line).length > 0 && /[_＿]/.test(line)).length;
  const numberedCount = lines.filter((line) => /^\d{1,3}\s*[、.．]\s*\S/.test(line)).length;
  if (sectionCount < 2 || inlineAnswerCount < 5 || numberedCount >= inlineAnswerCount / 2) return text;

  const output: string[] = [];
  let questionType: "A" | "B" | "C" | "X" | null = null;
  let chapterQuestion = 0;
  let pending: { number: number; stem: string; options: string[] } | null = null;

  const flush = () => {
    if (!pending) return;
    output.push(`${pending.number}. ${pending.stem.replace(/^\d{1,3}\s*[、.．]\s*/, "")}`);
    pending.options.slice(0, 7).forEach((option, index) => {
      output.push(/^[A-GＡ-Ｇ]\s*[.．、)）]/i.test(option) ? option : `${"ABCDEFG"[index]}. ${option}`);
    });
    pending = null;
  };

  for (const line of lines) {
    if (/^第[一二三四五六七八九十百0-9]+章/.test(line)) {
      flush();
      chapterQuestion = 0;
      questionType = null;
      output.push(line);
      continue;
    }
    const typeHeading = line.replace(/[【】\[\]]/g, "").trim().match(/^([ABCX])(?:1)?型题\s*[:：]?$/);
    if (typeHeading) {
      flush();
      questionType = typeHeading[1] as "A" | "B" | "C" | "X";
      output.push(line);
      continue;
    }
    if (/^(?:参考答案|[一二三四五六七八九十]+(?:[、.．]|\s)+\s*(?:填空|名词解释|问答|简答|病例分析))/.test(line)) {
      flush();
      questionType = null;
      output.push(line);
      continue;
    }
    if (!questionType) {
      output.push(line);
      continue;
    }

    const inlineAnswer = inlineAnswerFromBody(line);
    if (inlineAnswer.length && /[_＿]/.test(line)) {
      flush();
      chapterQuestion += 1;
      pending = { number: chapterQuestion, stem: line, options: [] };
      if (questionType === "B" || questionType === "C") {
        flush();
      }
      continue;
    }
    if ((questionType === "B" || questionType === "C") && optionMarkers(line).length >= 2) {
      flush();
      output.push(line);
      continue;
    }
    if (pending) {
      pending.options.push(line);
    } else {
      output.push(line);
    }
  }
  flush();
  return output.join("\n");
}

function normalizeGeneralImportLines(text: string) {
  return restoreLegacyWordLists(text).replace(/\r/g, "").split("\n").map((rawLine) => {
    const line = rawLine.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    if (!line || /https?:\/\//i.test(line) || /^\d{1,4}$/.test(line)) return "";
    // Old web-to-PDF banks repeat the first question of every page as a browser header.
    // The same question is present in the page body, so keeping this line creates duplicates.
    if (/页码[，,]\s*\d+\s*\/\s*\d+/i.test(line)) return "";
    return line;
  });
}

function canonicalChapter(line: string) {
  const chapter = line.match(/^第[一二三四五六七八九十百0-9]+章\s*[：:]?\s*(.+?)(?:\s+答案)?$/);
  if (chapter) return chapter[1].replace(/\s+答案$/, "").trim();
  const answerHeading = line.match(/^(.{1,40}?)\s+答案$/);
  return answerHeading?.[1].trim() ?? "";
}

function generalSectionKind(line: string): GeneralSection | null {
  const compact = line.replace(/[【】\[\]]/g, "").trim();
  if (/^(?:A|A1|A2)型题\s*[:：]?$/.test(compact)) return { kind: "single", questionType: "A" };
  if (/^(?:B|B1)型题\s*[:：]?$/.test(compact)) return { kind: "single", questionType: "B" };
  if (/^C型题\s*[:：]?$/.test(compact)) return { kind: "single", questionType: "C" };
  if (/^X型题\s*[:：]?$/.test(compact)) return { kind: "multiple", questionType: "X" };
  if (/^[一二三四五六七八九十]+(?:[、.．]|\s)+\s*(?:单项|单选)/.test(line)) return { kind: "single" };
  if (/^[一二三四五六七八九十]+(?:[、.．]|\s)+\s*(?:多项|多选)/.test(line)) return { kind: "multiple" };
  if (/^[一二三四五六七八九十]+(?:[、.．]|\s)+\s*判断/.test(line) || /^判断题\s*[:：]?$/.test(compact)) return { kind: "judgement" };
  if (/^[一二三四五六七八九十]+(?:[、.．]|\s)+\s*(?:填空|名词解释|问答|简答|病例分析)/.test(line)) return { kind: "skip" };
  return null;
}

function answerPairs(line: string, kind: GeneralQuestionKind) {
  const normalized = line.replace(/\b1\s+0\s*([、.．])/g, "10$1");
  const markerPattern = kind === "judgement"
    ? /(?:^|\s)(\d{1,3})\s*(?:[、.．]\s*)?(?=[√×])/g
    : /(?:^|\s)(\d{1,3})\s*[、.．]\s*/g;
  const markers = [...normalized.matchAll(markerPattern)];
  if (!markers.length) return [] as Array<{ number: string; answer: string[] }>;
  return markers.flatMap((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? normalized.length;
    const value = normalized.slice(start, end);
    const compact = value.replace(/\s+/g, "").replace(/[.。]+$/, "");
    const labels = kind === "judgement"
      ? /^√$/.test(compact) ? ["A"] : /^×$/.test(compact) ? ["B"] : []
      : /^[A-GＡ-Ｇ]{1,7}$/i.test(compact)
        ? [...new Set(compact.match(/[A-GＡ-Ｇ]/gi)!.map(normalizeLabel))]
        : [];
    return labels.length ? [{ number: marker[1], answer: labels }] : [];
  });
}

function denseAnswerLine(line: string, kind: GeneralQuestionKind) {
  return answerPairs(line, kind).length >= 2;
}

function optionMarkers(body: string) {
  const markers: Array<{ index: number; end: number; label: string }> = [];
  const pattern = /(^|\n)\s*([A-GＡ-Ｇ])(?:\s*[.．、)）]\s*|\s+)|([A-GＡ-Ｇ])\s*[.．、]\s*/g;
  for (const match of body.matchAll(pattern)) {
    const label = normalizeLabel(match[2] || match[3]);
    const leading = match[1]?.length ?? 0;
    const index = (match.index ?? 0) + leading;
    markers.push({ index, end: (match.index ?? 0) + match[0].length, label });
  }
  return markers;
}

function removeAnswerNotation(value: string) {
  return value
    .replace(/(?:正确)?答案\s*[:：]\s*[A-GＡ-Ｇ、，,\s]+/gi, " ")
    .replace(/[（(]\s*[A-GＡ-Ｇ]\s*[）)]\s*$/i, " ")
    .replace(/[:：]\s*[A-GＡ-Ｇ]{1,7}\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineAnswerFromBody(body: string) {
  const explicit = body.match(/(?:正确)?答案\s*[:：]\s*([A-GＡ-Ｇ、，,\s]+)/i);
  const stemArea = body.slice(0, optionMarkers(body)[0]?.index ?? body.length);
  const trailing = stemArea.match(/(?:[:：]|[（(])\s*([A-GＡ-Ｇ]{1,7})\s*[）)]?\s*$/i);
  const underlined = stemArea.match(/(?:[_＿]{2,}\s*[。．.]?\s*([A-GＡ-Ｇ]{1,7})|[_＿]\s*([A-GＡ-Ｇ]{1,7})\s*[_＿]\s*[。．.]?)\s*$/i);
  const value = explicit?.[1] ?? trailing?.[1] ?? underlined?.[1] ?? underlined?.[2] ?? "";
  return [...new Set((value.match(/[A-GＡ-Ｇ]/gi) ?? []).map(normalizeLabel))];
}

function answerKey(chapter: string, kind: GeneralQuestionKind, number: string) {
  return `${chapter || "未分章"}|${kind}|${number}`;
}

function parseGeneralMedicalQuestions(text: string, category: string): QuizQuestion[] {
  const lines = normalizeGeneralImportLines(text);
  const drafts: GeneralDraft[] = [];
  const answers = new Map<string, GeneralAnswer>();
  let chapter = "未分章";
  let kind: GeneralQuestionKind | "skip" | null = null;
  let questionType: "A" | "B" | "C" | "X" | undefined;
  let answerMode = false;
  let current: { number: string; lines: string[] } | null = null;
  let sharedOptionLines: string[] = [];
  const looseAnswers = new Map<string, GeneralAnswer | null>();

  const rememberLooseAnswer = (number: string, answer: string[], source: string) => {
    const key = `${chapter}|${number}`;
    const existing = looseAnswers.get(key);
    if (existing === null) return;
    if (existing && existing.answer.join("") !== answer.join("")) {
      looseAnswers.set(key, null);
      return;
    }
    looseAnswers.set(key, { answer, source });
  };

  const flush = () => {
    if (!current || !kind || kind === "skip") {
      current = null;
      return;
    }
    const body = current.lines.join("\n").trim();
    if (body) drafts.push({
      chapter,
      kind,
      questionType,
      number: current.number,
      body,
      inlineAnswer: inlineAnswerFromBody(body),
      sharedOptionGroup: questionType === "B" || questionType === "C" ? `${chapter}-${questionType}` : undefined,
    });
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const chapterName = canonicalChapter(line);
    if (chapterName) {
      flush();
      chapter = chapterName;
      answerMode = /\s答案$/.test(line);
      kind = null;
      questionType = undefined;
      sharedOptionLines = [];
      continue;
    }

    const nextKind = generalSectionKind(line);
    if (nextKind) {
      flush();
      kind = nextKind.kind;
      questionType = nextKind.questionType;
      sharedOptionLines = [];
      if (kind === "skip") {
        answerMode = false;
        continue;
      }
      const lookahead = lines.slice(index + 1, index + 5).filter(Boolean);
      answerMode = lookahead.some((candidate) => denseAnswerLine(candidate, kind as GeneralQuestionKind));
      continue;
    }

    const judgementPairs = /[√×]/.test(line) ? answerPairs(line, "judgement") : [];
    const choicePairs = judgementPairs.length ? [] : answerPairs(line, "multiple");
    if (judgementPairs.length >= 2 || choicePairs.length >= 2) {
      flush();
      const inferredKind: GeneralQuestionKind = judgementPairs.length
        ? "judgement"
        : choicePairs.some((pair) => pair.answer.length > 1) ? "multiple" : "single";
      for (const pair of judgementPairs.length ? judgementPairs : choicePairs) {
        const source = `${chapter} · ${GENERAL_SECTION_LABELS[inferredKind]}答案表`;
        answers.set(answerKey(chapter, inferredKind, pair.number), {
          answer: pair.answer,
          source,
        });
        rememberLooseAnswer(pair.number, pair.answer, source);
      }
      answerMode = true;
      kind = inferredKind;
      continue;
    }
    const singletonChoiceAnswer = line.match(/^(\d{1,3})\s*[、.．]\s*([A-GＡ-Ｇ](?:\s*[A-GＡ-Ｇ]){0,6})\s*$/i);
    const singletonJudgementAnswer = line.match(/^(\d{1,3})\s*[、.．]?\s*([√×])\s*$/);
    if (kind && kind !== "skip" && (singletonChoiceAnswer || singletonJudgementAnswer)) {
      const pair = singletonJudgementAnswer
        ? { number: singletonJudgementAnswer[1], answer: [singletonJudgementAnswer[2] === "√" ? "A" : "B"] }
        : { number: singletonChoiceAnswer![1], answer: [...new Set(singletonChoiceAnswer![2].match(/[A-GＡ-Ｇ]/gi)!.map(normalizeLabel))] };
      answers.set(answerKey(chapter, kind, pair.number), {
        answer: pair.answer,
        source: `${chapter} · ${GENERAL_SECTION_LABELS[kind]}答案表`,
      });
      rememberLooseAnswer(pair.number, pair.answer, `${chapter} · ${GENERAL_SECTION_LABELS[kind]}答案表`);
      answerMode = true;
      continue;
    }

    if (!kind || kind === "skip") continue;
    if (answerMode) {
      for (const pair of answerPairs(line, kind)) {
        const source = `${chapter} · ${GENERAL_SECTION_LABELS[kind]}答案表`;
        answers.set(answerKey(chapter, kind, pair.number), {
          answer: pair.answer,
          source,
        });
        rememberLooseAnswer(pair.number, pair.answer, source);
      }
      continue;
    }

    if ((questionType === "B" || questionType === "C") && optionMarkers(line).length >= 2) {
      flush();
      sharedOptionLines = [line];
      continue;
    }

    const questionStart = line.match(/^(\d{1,3})\s*[、.．]\s*(.*)$/);
    if (questionStart) {
      flush();
      current = {
        number: questionStart[1],
        lines: [questionStart[2], ...sharedOptionLines],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  return drafts.flatMap<QuizQuestion>((draft, index) => {
    const linkedAnswer = answers.get(answerKey(draft.chapter, draft.kind, draft.number))
      ?? looseAnswers.get(`${draft.chapter}|${draft.number}`)
      ?? undefined;
    const answer = linkedAnswer?.answer.length ? linkedAnswer.answer : draft.inlineAnswer ?? [];
    if (draft.kind === "judgement") {
      const stem = draft.body.replace(/[（(]\s*[）)]/g, " ").replace(/[√×]\s*$/, "").replace(/\s+/g, " ").trim();
      const inlineJudgement = draft.body.match(/([√×])\s*$/)?.[1];
      const judgementAnswer = answer.length ? answer : inlineJudgement ? [inlineJudgement === "√" ? "A" : "B"] : [];
      if (!stem) return [];
      return [{
        id: `imported-${Date.now()}-${index}`,
        sourceNumber: draft.number,
        category: draft.chapter !== "未分章" ? draft.chapter : category,
        stem,
        options: [{ label: "A", text: "正确" }, { label: "B", text: "错误" }],
        answer: judgementAnswer,
        answerPending: !judgementAnswer.length,
        multiple: false,
        answerSource: linkedAnswer?.source || (judgementAnswer.length ? "题干内标注" : undefined),
      }];
    }

    const bodyWithoutAnswer = draft.body
      .replace(/(?:正确)?答案\s*[:：]\s*[A-GＡ-Ｇ、，,\s]+/gi, " ")
      .replace(/[_＿]{2,}\s*[。．.]?\s*[A-GＡ-Ｇ]{1,7}\s*(?=\n|$)/gi, " ")
      .replace(/[_＿]\s*[A-GＡ-Ｇ]{1,7}\s*[_＿]\s*[。．.]?\s*(?=\n|$)/gi, " ");
    const markers = optionMarkers(bodyWithoutAnswer);
    if (markers.length < 2) return [];
    const stem = removeAnswerNotation(bodyWithoutAnswer.slice(0, markers[0].index));
    const options = markers.map((marker, optionIndex) => {
      const end = markers[optionIndex + 1]?.index ?? bodyWithoutAnswer.length;
      return {
        label: marker.label,
        text: bodyWithoutAnswer.slice(marker.end, end).replace(/\n+/g, " ").replace(/\s+/g, " ").trim(),
      };
    }).filter((option) => option.text);
    const uniqueOptions = [...new Map(options.map((option) => [option.label, option])).values()];
    const labels = new Set(uniqueOptions.map((option) => option.label));
    const validAnswer = answer.filter((label) => labels.has(label));
    if (!stem || uniqueOptions.length < 2) return [];
    return [{
      id: `imported-${Date.now()}-${index}`,
      sourceNumber: draft.number,
      category: draft.chapter !== "未分章" ? draft.chapter : category,
      stem,
      options: uniqueOptions,
      answer: validAnswer,
      answerPending: !validAnswer.length,
      multiple: draft.questionType === "X" || draft.kind === "multiple" || validAnswer.length > 1,
      questionType: draft.questionType,
      medicalQuestionType: draft.questionType === "B" ? "B1" : draft.questionType === "C" ? "C" : draft.questionType === "X" ? "X" : undefined,
      sharedOptionGroup: draft.sharedOptionGroup,
      answerSource: linkedAnswer?.source || (validAnswer.length ? "题干末尾标注" : undefined),
    }];
  });
}

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

function parseAnswerDelimitedQuestions(text: string, category = "导入题库"): QuizQuestion[] {
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

export function parseQuestionText(text: string, category = "导入题库"): QuizQuestion[] {
  const candidates = [
    ...parseAnswerDelimitedQuestions(text, category),
    ...parseGeneralMedicalQuestions(text, category),
  ];
  const selected = new Map<string, QuizQuestion>();
  for (const question of candidates) {
    const key = `${question.sourceNumber}|${question.stem.replace(/\s+/g, "").slice(0, 180)}`;
    const current = selected.get(key);
    if (!current || (!current.answer.length && question.answer.length) || (!current.explanation && question.explanation)) {
      selected.set(key, question);
    }
  }
  return [...selected.values()].map((question, index) => ({
    ...question,
    id: `imported-${Date.now()}-${index}`,
  }));
}
