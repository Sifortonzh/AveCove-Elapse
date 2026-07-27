import type { QuizOption, QuizQuestion, Western306Format } from "./question-parser";

export type MedicalExamProfile = "general" | "western-medicine-306";
export type MedicalQuestionType = "A" | "B" | "C" | "X";
export type Western306Section = {
  questionType: MedicalQuestionType;
  start: number;
  end: number;
  points?: number;
};
export type Western306Blueprint = {
  year?: number;
  format: Western306Format;
  expectedQuestionCount?: number;
  totalPoints?: number;
  sections: Western306Section[];
};

type AiQuestion = {
  sourceNumber?: unknown;
  stem?: unknown;
  options?: unknown;
  answer?: unknown;
  questionType?: unknown;
  sharedOptionGroup?: unknown;
  explanation?: unknown;
  answerSource?: unknown;
  answerPending?: unknown;
};

export type MedicalAnswerPatch = {
  sourceNumber: string;
  answer: string[];
  explanation?: string;
  answerSource?: string;
};

export type MedicalAiParseResult = {
  questions: QuizQuestion[];
  discarded: number;
  profile: MedicalExamProfile;
};

export type MedicalAnswerReconciliation = {
  questions: QuizQuestion[];
  reconciledCount: number;
  oneToOneVerified: boolean;
};

export type Western306LocalStandardization = {
  usable: boolean;
  questions: QuizQuestion[];
  report: {
    profile: "western-medicine-306";
    recognitionMode: "deterministic";
    examYear?: number;
    examFormat: Western306Format;
    expectedQuestionCount?: number;
    totalPoints?: number;
    typeCounts: Record<string, number>;
    answeredCount: number;
    pendingAnswerCount: number;
    missingSourceNumbers: string[];
    duplicateSourceNumbers: string[];
    reconciledAnswerCount: number;
    oneToOneVerified: boolean;
    suggestedGroupName: string;
    warnings: string[];
  };
};

const WESTERN_306_PATTERN = /(?:西医综合|西综|临床医学综合能力\s*[（(]?西医[）)]?|(?:^|\D)306(?:\D|$))/i;

export function detectMedicalExamProfile(fileName: string, text = ""): MedicalExamProfile {
  return WESTERN_306_PATTERN.test(`${fileName}\n${text.slice(0, 8_000)}`) ? "western-medicine-306" : "general";
}

function detectSectionRanges(text: string): Western306Section[] {
  const normalized = text.replace(/\r/g, "").replace(/[—–~～至]/g, "-");
  const sections: Western306Section[] = [];
  const pattern = /([ABCX])\s*型题[\s\S]{0,180}?(\d{1,3})\s*[-]\s*(\d{1,3})/gi;
  for (const match of normalized.matchAll(pattern)) {
    const start = Number.parseInt(match[2], 10);
    const end = Number.parseInt(match[3], 10);
    const questionType = match[1].toUpperCase() as MedicalQuestionType;
    if (start >= 1 && end >= start && end <= 300 && !sections.some((section) => section.questionType === questionType)) {
      sections.push({ questionType, start, end });
    }
  }
  return sections.sort((left, right) => left.start - right.start);
}

export function detectWestern306Blueprint(fileName: string, text = ""): Western306Blueprint {
  const sample = `${fileName}\n${text.slice(0, 120_000)}`;
  const yearMatch = sample.match(/(?:19|20)\d{2}/);
  const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined;
  const detectedSections = detectSectionRanges(sample);
  const hasLegacyC = detectedSections.some((section) => section.questionType === "C") || /C\s*型题/i.test(sample);
  const modern = !hasLegacyC && ((year ?? 0) >= 2017 || /(?:136\s*[-—~～至]\s*165|共\s*165\s*题|满分\s*300)/i.test(sample));
  if (modern) {
    return {
      year,
      format: "modern-165",
      expectedQuestionCount: 165,
      totalPoints: 300,
      sections: [
        { questionType: "A", start: 1, end: 40, points: 1.5 },
        { questionType: "A", start: 41, end: 115, points: 2 },
        { questionType: "B", start: 116, end: 135, points: 1.5 },
        { questionType: "X", start: 136, end: 165, points: 2 },
      ],
    };
  }
  if (hasLegacyC || detectedSections.length) {
    const known1994Sections: Western306Section[] = [
      { questionType: "A" as const, start: 1, end: 92 },
      { questionType: "B" as const, start: 93, end: 118 },
      { questionType: "C" as const, start: 119, end: 138 },
      { questionType: "X" as const, start: 139, end: 160 },
    ];
    const sections = year === 1994 || (hasLegacyC && detectedSections.length < 3) ? known1994Sections : detectedSections;
    return {
      year,
      format: "legacy-c-type",
      expectedQuestionCount: Math.max(...sections.map((section) => section.end)),
      sections,
    };
  }
  return { year, format: "unknown-306", sections: [] };
}

export function western306Metadata(sourceNumber: string, blueprint: Western306Blueprint = detectWestern306Blueprint("2025西综306")): {
  questionType?: MedicalQuestionType;
  points?: number;
  multiple?: boolean;
} {
  const number = Number.parseInt(sourceNumber.match(/\d+/)?.[0] ?? "", 10);
  if (!Number.isFinite(number) || number < 1) return {};
  const section = blueprint.sections.find((candidate) => number >= candidate.start && number <= candidate.end);
  if (!section) return {};
  return { questionType: section.questionType, points: section.points, multiple: section.questionType === "X" };
}

export function standardizeParsedWestern306Questions(
  fileName: string,
  text: string,
  parsedQuestions: QuizQuestion[],
): Western306LocalStandardization {
  const blueprint = detectWestern306Blueprint(fileName, text);
  const selected = new Map<string, QuizQuestion>();
  const duplicateSourceNumbers = new Set<string>();

  for (const question of parsedQuestions) {
    const sourceNumber = String(Number.parseInt(question.sourceNumber.match(/\d+/)?.[0] ?? "", 10));
    if (sourceNumber === "NaN") continue;
    const numericSourceNumber = Number(sourceNumber);
    if (numericSourceNumber < 1 || (blueprint.expectedQuestionCount && numericSourceNumber > blueprint.expectedQuestionCount)) continue;
    const metadata = western306Metadata(sourceNumber, blueprint);
    const optionLabels = new Set(question.options.map((option) => option.label));
    const answer = [...new Set(question.answer)].filter((label) => optionLabels.has(label));
    const normalized: QuizQuestion = {
      ...question,
      sourceNumber,
      examProfile: "western-medicine-306",
      examYear: blueprint.year,
      examFormat: blueprint.format,
      questionType: metadata.questionType,
      points: metadata.points,
      multiple: metadata.questionType === "X",
      answer,
      answerPending: answer.length === 0,
      answerSource: question.answerSource || (answer.length ? "原卷题后参考答案" : undefined),
    };
    const current = selected.get(sourceNumber);
    if (current) duplicateSourceNumbers.add(sourceNumber);
    const currentQuality = current
      ? current.stem.length + current.options.reduce((sum, option) => sum + option.text.length, 0) + (current.answer.length ? 500 : 0)
      : -1;
    const nextQuality = normalized.stem.length + normalized.options.reduce((sum, option) => sum + option.text.length, 0) + (normalized.answer.length ? 500 : 0);
    if (!current || nextQuality > currentQuality) selected.set(sourceNumber, normalized);
  }

  const questions = [...selected.values()]
    .sort((left, right) => Number(left.sourceNumber) - Number(right.sourceNumber))
    .map((question, index) => ({ ...question, id: `local-306-${Date.now()}-${index + 1}` }));
  const knownNumbers = new Set(questions.map((question) => question.sourceNumber));
  const missingSourceNumbers = blueprint.expectedQuestionCount
    ? Array.from({ length: blueprint.expectedQuestionCount }, (_, index) => String(index + 1)).filter((number) => !knownNumbers.has(number))
    : [];
  const structurallyComplete = questions.every((question) => {
    if (!question.stem.trim() || question.options.length < 2 || !question.answer.length) return false;
    if (question.questionType !== "X" && question.answer.length !== 1) return false;
    const labels = new Set(question.options.map((option) => option.label));
    return question.answer.every((label) => labels.has(label));
  });
  const minimumFastPathCount = blueprint.expectedQuestionCount
    ? Math.max(40, blueprint.expectedQuestionCount - 20)
    : 80;
  const typeCounts = Object.fromEntries(["A", "B", "C", "X"].map((type) => [
    type,
    questions.filter((question) => question.questionType === type).length,
  ]));

  return {
    usable: questions.length >= minimumFastPathCount && structurallyComplete,
    questions,
    report: {
      profile: "western-medicine-306",
      recognitionMode: "deterministic",
      examYear: blueprint.year,
      examFormat: blueprint.format,
      expectedQuestionCount: blueprint.expectedQuestionCount,
      totalPoints: blueprint.totalPoints,
      typeCounts,
      answeredCount: questions.filter((question) => question.answer.length).length,
      pendingAnswerCount: questions.filter((question) => !question.answer.length).length,
      missingSourceNumbers,
      duplicateSourceNumbers: [...duplicateSourceNumbers],
      reconciledAnswerCount: 0,
      oneToOneVerified: missingSourceNumbers.length < 10 && structurallyComplete,
      suggestedGroupName: "考研西综306",
      warnings: [],
    },
  };
}

export function western306Score(
  questions: QuizQuestion[],
  progress: Record<string, "correct" | "wrong">,
  firstProgress: Record<string, "correct" | "wrong"> = progress,
) {
  return questions.reduce((score, question) => {
    const blueprint = question.examProfile === "western-medicine-306"
      ? detectWestern306Blueprint(String(question.examYear ?? ""), question.examFormat === "legacy-c-type" ? "C型题" : "")
      : undefined;
    const points = question.points ?? western306Metadata(question.sourceNumber, blueprint).points ?? 0;
    return {
      earned: score.earned + (firstProgress[question.id] === "correct" ? points : 0),
      answeredMaximum: score.answeredMaximum + (firstProgress[question.id] ? points : 0),
      total: score.total + points,
    };
  }, { earned: 0, answeredMaximum: 0, total: 0 });
}

function stripFences(content: string) {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/```(?:json|jsonl|ndjson)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function collectQuestionObjectsFromArray(content: string): unknown[] {
  const marker = /"questions"\s*:\s*\[/g;
  const found: unknown[] = [];
  let match: RegExpExecArray | null;

  while ((match = marker.exec(content))) {
    const arrayStart = match.index + match[0].length - 1;
    let inString = false;
    let escaped = false;
    let arrayDepth = 0;
    let objectDepth = 0;
    let objectStart = -1;

    for (let index = arrayStart; index < content.length; index += 1) {
      const character = content[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }
      if (character === "\"") {
        inString = true;
        continue;
      }
      if (character === "[") arrayDepth += 1;
      else if (character === "]") {
        arrayDepth -= 1;
        if (arrayDepth === 0) break;
      } else if (character === "{" && arrayDepth === 1) {
        if (objectDepth === 0) objectStart = index;
        objectDepth += 1;
      } else if (character === "}" && objectDepth > 0) {
        objectDepth -= 1;
        if (objectDepth === 0 && objectStart >= 0) {
          try {
            found.push(JSON.parse(content.slice(objectStart, index + 1)));
          } catch {
            // One damaged item must not invalidate every complete item around it.
          }
          objectStart = -1;
        }
      }
    }
  }
  return found;
}

function collectTopLevelObjects(content: string): unknown[] {
  const found: unknown[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(content.slice(start, index + 1)) as Record<string, unknown>;
          if (Array.isArray(parsed.questions)) found.push(...parsed.questions);
          else if ("stem" in parsed || ("sourceNumber" in parsed && "answer" in parsed)) found.push(parsed);
        } catch {
          // The array-level recovery can still rescue valid children from a damaged wrapper.
        }
        start = -1;
      }
    }
  }
  return found;
}

function collectRawQuestions(content: string): unknown[] {
  const cleaned = stripFences(content);
  const candidates: unknown[] = [];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  for (const value of [cleaned, start >= 0 && end > start ? cleaned.slice(start, end + 1) : ""]) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value) as { questions?: unknown } | unknown[];
      if (Array.isArray(parsed)) candidates.push(...parsed);
      else if (parsed && typeof parsed === "object" && Array.isArray(parsed.questions)) candidates.push(...parsed.questions);
    } catch {
      // Continue with loss-tolerant JSONL/array recovery below.
    }
  }

  for (const line of cleaned.split(/\n+/)) {
    const candidate = line.trim().replace(/^[,\s]+|[,\s]+$/g, "");
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(candidate) as { type?: unknown; questions?: unknown };
      if (Array.isArray(parsed.questions)) candidates.push(...parsed.questions);
      else if (parsed.type === "question" || "stem" in parsed || ("sourceNumber" in parsed && "answer" in parsed)) candidates.push(parsed);
    } catch {
      // Keep scanning other independently valid lines.
    }
  }

  candidates.push(...collectQuestionObjectsFromArray(cleaned));
  candidates.push(...collectTopLevelObjects(cleaned));
  return candidates;
}

function normalizeOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const option = candidate as { label?: unknown; text?: unknown };
    const label = String(option.label ?? "").toUpperCase().match(/[A-G]/)?.[0] ?? "";
    const text = typeof option.text === "string" ? option.text.trim() : "";
    if (!label || !text || seen.has(label)) return [];
    seen.add(label);
    return [{ label, text }];
  });
}

function normalizeQuestion(
  value: unknown,
  category: string,
  profile: MedicalExamProfile,
  index: number,
  allowUnanswered = false,
  blueprint?: Western306Blueprint,
): QuizQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as AiQuestion;
  const stem = typeof raw.stem === "string" ? raw.stem.trim() : "";
  const options = normalizeOptions(raw.options);
  const labels = new Set(options.map((option) => option.label));
  const answerText = Array.isArray(raw.answer) ? raw.answer.join("") : String(raw.answer ?? "");
  const answer = [...new Set(answerText.toUpperCase().match(/[A-G]/g) ?? [])].filter((label) => labels.has(label));
  if (!stem || options.length < 2 || (!answer.length && !allowUnanswered)) return null;

  const sourceNumber = String(raw.sourceNumber ?? index + 1).trim() || String(index + 1);
  const inferred = profile === "western-medicine-306" ? western306Metadata(sourceNumber, blueprint) : {};
  const suppliedType = String(raw.questionType ?? "").toUpperCase().match(/[ABCX]/)?.[0] as MedicalQuestionType | undefined;
  const questionType = blueprint?.format === "modern-165"
    ? inferred.questionType ?? suppliedType
    : suppliedType ?? inferred.questionType;
  const multiple = questionType === "X" || answer.length > 1;

  return {
    id: `ai-imported-${index + 1}`,
    sourceNumber,
    category,
    stem,
    options,
    answer,
    answerPending: !answer.length,
    multiple,
    examProfile: profile === "western-medicine-306" ? profile : undefined,
    examYear: profile === "western-medicine-306" ? blueprint?.year : undefined,
    examFormat: profile === "western-medicine-306" ? blueprint?.format : undefined,
    questionType,
    points: inferred.points,
    sharedOptionGroup: typeof raw.sharedOptionGroup === "string" ? raw.sharedOptionGroup.trim().slice(0, 120) || undefined : undefined,
    explanation: typeof raw.explanation === "string" ? raw.explanation.trim().slice(0, 6_000) || undefined : undefined,
    answerSource: typeof raw.answerSource === "string" ? raw.answerSource.trim().slice(0, 160) || undefined : undefined,
  };
}

function deduplicateQuestions(questions: QuizQuestion[]) {
  const selected = new Map<string, QuizQuestion>();
  for (const question of questions) {
    const key = `${question.sourceNumber}|${question.stem.replace(/\s+/g, "").slice(0, 120)}`;
    const current = selected.get(key);
    if (!current || (!current.explanation && question.explanation)) selected.set(key, question);
  }
  return [...selected.values()].sort((left, right) => {
    const leftNumber = Number.parseInt(left.sourceNumber.match(/\d+/)?.[0] ?? "", 10);
    const rightNumber = Number.parseInt(right.sourceNumber.match(/\d+/)?.[0] ?? "", 10);
    return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? leftNumber - rightNumber : 0;
  });
}

export function parseMedicalAiResponse(
  content: string,
  category: string,
  profile: MedicalExamProfile,
  options: { allowUnanswered?: boolean; blueprint?: Western306Blueprint } = {},
): MedicalAiParseResult {
  const candidates = collectRawQuestions(content);
  const normalized = candidates.flatMap((candidate, index) => {
    const question = normalizeQuestion(candidate, category, profile, index, options.allowUnanswered, options.blueprint);
    return question ? [question] : [];
  });
  const questions = deduplicateQuestions(normalized).map((question, index) => ({
    ...question,
    id: `ai-imported-${Date.now()}-${index + 1}`,
  }));
  return { questions, discarded: Math.max(0, candidates.length - normalized.length), profile };
}

export function splitMedicalSourceText(text: string, maximumCharacters = 24_000, maximumChunks = 18) {
  const normalized = text.replace(/\r/g, "").trim();
  if (normalized.length <= maximumCharacters) return [normalized];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length && chunks.length < maximumChunks) {
    let end = Math.min(normalized.length, cursor + maximumCharacters);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf("\n[[PAGE ", end),
        normalized.lastIndexOf("\n\n", end),
        normalized.lastIndexOf("\n", end),
      );
      if (boundary > cursor + maximumCharacters * 0.65) end = boundary;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end < normalized.length ? Math.max(cursor + 1, end - 1_000) : end;
  }
  return chunks.filter(Boolean);
}

export function splitWestern306SourceText(text: string, maximumCharacters = 7_200, maximumChunks = 80) {
  const normalized = text.replace(/\r/g, "").trim();
  const effectiveMaximum = Math.max(4_800, Math.min(maximumCharacters, 8_000));
  const pageBlocks = normalized.split(/(?=\[\[PAGE\s+\d+\]\])/i).filter((block) => block.trim());
  if (pageBlocks.length > 1) {
    const chunks: string[] = [];
    const seamBoundaries: number[] = [];
    let current = "";
    for (let index = 0; index < pageBlocks.length; index += 1) {
      const page = pageBlocks[index];
      if (current && current.length + page.length > effectiveMaximum) {
        chunks.push(current.trim());
        seamBoundaries.push(index);
        current = "";
      }
      current += `${current ? "\n" : ""}${page}`;
      if (chunks.length >= maximumChunks - 1) break;
    }
    if (current.trim()) chunks.push(current.trim());

    // A question may start at the foot of one PDF page while its options and
    // explicit answer continue on the next page. Add a compact seam fragment
    // only at chunk boundaries; the merge step removes the harmless duplicate.
    for (const boundary of seamBoundaries) {
      if (chunks.length >= maximumChunks) break;
      const left = pageBlocks[boundary - 1] ?? "";
      const right = pageBlocks[boundary] ?? "";
      const starts = [...left.matchAll(/(?:^|\n)\s*(?:(?:19|20)\d{2}\s*N\s*)?(\d{1,3})\s*(?:[ABCX]\s*)?[.．、]/g)];
      const lastStart = starts.at(-1)?.index ?? -1;
      if (lastStart < 0) continue;
      const leftTail = left.slice(lastStart).trim();
      const rightStarts = [...right.matchAll(/(?:^|\n)\s*(?:(?:19|20)\d{2}\s*N\s*)?(\d{1,3})\s*(?:[ABCX]\s*)?[.．、]/g)];
      const nextQuestionStart = rightStarts.find((match) => (match.index ?? 0) > 20)?.index;
      const rightHead = right.slice(0, nextQuestionStart && nextQuestionStart > 0 ? nextQuestionStart : Math.min(right.length, 3_600)).trim();
      const optionCount = (leftTail + "\n" + rightHead).match(/(?:^|\n)\s*[A-G]\s*[.．、]/g)?.length ?? 0;
      const looksIncomplete = (leftTail.match(/(?:^|\n)\s*[A-G]\s*[.．、]/g)?.length ?? 0) < 2;
      if (!looksIncomplete || optionCount < 2) continue;
      chunks.push(`[[CROSS_PAGE_SEAM ${boundary}-${boundary + 1}]]\n${leftTail}\n${rightHead}`.trim());
    }
    return chunks.slice(0, maximumChunks);
  }

  const anchors = [...normalized.matchAll(/(?:^|\n)\s*(?:(?:19|20)\d{2}\s*N\s*)?\d{1,3}\s*(?:[ABCX]\s*)?[.．、]/g)]
    .map((match) => match.index ?? 0);
  if (anchors.length >= 8) {
    const units = anchors.map((start, index) => normalized.slice(start, anchors[index + 1] ?? normalized.length).trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = "";
    let questionCount = 0;
    for (const unit of units) {
      if (current && (current.length + unit.length > effectiveMaximum || questionCount >= 14)) {
        chunks.push(current.trim());
        current = "";
        questionCount = 0;
      }
      current += `${current ? "\n" : ""}${unit}`;
      questionCount += 1;
      if (chunks.length >= maximumChunks - 1) break;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.slice(0, maximumChunks);
  }
  return splitMedicalSourceText(normalized, Math.min(effectiveMaximum, 3_600), maximumChunks);
}

function explicitAnswersByNumber(text: string) {
  const normalized = text.replace(/\r/g, "");
  const answers = new Map<string, string[]>();
  const anchors = [...normalized.matchAll(/(?:^|\n)\s*(?:(?:19|20)\d{2}\s*N\s*)?(\d{1,3})\s*(?:[ABCX]\s*)?[.．、]/g)];
  for (let index = 0; index < anchors.length; index += 1) {
    const sourceNumber = String(Number.parseInt(anchors[index][1], 10));
    const start = anchors[index].index ?? 0;
    const end = anchors[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end);
    const match = block.match(/(?:【|\[)?\s*(?:参考)?答案\s*(?:】|\])?\s*[:：]?\s*([A-G]{1,7})(?![A-Za-z])/i);
    if (match) answers.set(sourceNumber, [...new Set(match[1].toUpperCase().split(""))]);
  }

  // Also accept compact answer tables such as "1.A 2.B 3.ACD".
  for (const match of normalized.matchAll(/(?:^|[\s,，;；])(\d{1,3})\s*[.、:：\-]?\s*([A-G]{1,7})(?=$|[\s,，;；])/gi)) {
    const sourceNumber = String(Number.parseInt(match[1], 10));
    if (!answers.has(sourceNumber)) answers.set(sourceNumber, [...new Set(match[2].toUpperCase().split(""))]);
  }
  return answers;
}

export function reconcileMedicalQuestionsWithSourceAnswers(
  questions: QuizQuestion[],
  sourceText: string,
  expectedQuestionCount?: number,
): MedicalAnswerReconciliation {
  const explicit = explicitAnswersByNumber(sourceText);
  let reconciledCount = 0;
  let next = questions.map((question) => {
    if (question.answer.length) return question;
    const sourceNumber = String(Number.parseInt(question.sourceNumber.match(/\d+/)?.[0] ?? "", 10));
    const candidate = explicit.get(sourceNumber);
    const labels = new Set(question.options.map((option) => option.label));
    const answer = candidate?.filter((label) => labels.has(label)) ?? [];
    if (!answer.length) return question;
    reconciledCount += 1;
    return {
      ...question,
      answer,
      answerPending: false,
      multiple: question.questionType === "X" || answer.length > 1,
      answerSource: question.answerSource || "原卷明确答案 · 题号二次校验",
    };
  });

  const missingCount = expectedQuestionCount ? Math.max(0, expectedQuestionCount - next.length) : 0;
  const orderedQuestions = [...next].sort((left, right) =>
    Number.parseInt(left.sourceNumber.match(/\d+/)?.[0] ?? "", 10)
    - Number.parseInt(right.sourceNumber.match(/\d+/)?.[0] ?? "", 10));
  const orderedAnswers = [...explicit.entries()].sort((left, right) => Number(left[0]) - Number(right[0]));
  const canUsePositionalPairing = missingCount < 10
    && orderedAnswers.length === orderedQuestions.length
    && orderedQuestions.every((question, index) => {
      const answer = orderedAnswers[index]?.[1] ?? [];
      const labels = new Set(question.options.map((option) => option.label));
      return answer.length > 0 && answer.every((label) => labels.has(label));
    });
  if (canUsePositionalPairing) {
    const paired = new Map(orderedQuestions.map((question, index) => [question.id, orderedAnswers[index][1]]));
    next = next.map((question) => {
      if (question.answer.length) return question;
      const answer = paired.get(question.id) ?? [];
      if (!answer.length) return question;
      reconciledCount += 1;
      return {
        ...question,
        answer,
        answerPending: false,
        multiple: question.questionType === "X" || answer.length > 1,
        answerSource: question.answerSource || "原卷答案顺序 · 一一对应校验",
      };
    });
  }

  return {
    questions: next,
    reconciledCount,
    oneToOneVerified: missingCount < 10 && next.every((question) => question.answer.length > 0),
  };
}

export function extractMedicalAnswerReference(text: string, maximumCharacters = 18_000) {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const collected: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/(?:参考)?答案|答案表|正确答案|解析/i.test(lines[index])) continue;
    collected.push(lines.slice(index, index + 90).join("\n"));
    if (collected.join("\n").length >= maximumCharacters) break;
  }
  if (!collected.length) return normalized.slice(-maximumCharacters);
  return collected.join("\n---\n").slice(0, maximumCharacters);
}

export function buildMedicalImportPrompt(input: {
  fileName: string;
  chunk: string;
  answerReference: string;
  profile: MedicalExamProfile;
  chunkIndex: number;
  chunkCount: number;
  allowUnanswered?: boolean;
  blueprint?: Western306Blueprint;
}) {
  const blueprint = input.blueprint ?? detectWestern306Blueprint(input.fileName, input.chunk);
  const sectionSummary = blueprint.sections.map((section) =>
    `${section.start}-${section.end} 为 ${section.questionType} 型${section.points ? `，每题 ${section.points} 分` : ""}`,
  ).join("；");
  const profileRules = input.profile === "western-medicine-306" ? [
    `这是考研西医综合 306，年份：${blueprint.year ?? "未确定"}，版式：${blueprint.format}。${sectionSummary || "必须依据原文标题识别 A/B/C/X 分区，不可套用错误年份的题号范围。"}。`,
    blueprint.format === "modern-165"
      ? "现代卷共 165 题、满分 300 分：A 型 1-115，B 型 116-135，X 型 136-165。"
      : "旧卷可能含 C 型题。C 型题的 A/B 是两条来源陈述，答案编码为：A=仅 A 正确，B=仅 B 正确，C=两者均正确，D=两者均不正确；C 型不是多选题。",
    "B 型题必须把共用的 A-D 备选项复制到每道关联题，并为同组题填写相同 sharedOptionGroup。",
    "C 型题必须保留两条来源陈述和 A/B/C/D 判定选项，并为同组题填写相同 sharedOptionGroup。",
    "X 型题仅记录文件明确给出的全部正确选项，不得按医学知识猜测。",
  ] : [
    "只整理单选题、多选题和判断题；跳过填空题、名词解释、简答题、问答题及病例论述题。",
    "兼容章节末尾、全书末尾、题干后缀、答案表和解析标题内的答案。若题干末尾形如“……：A”，冒号后的字母就是该题原文答案。",
    "章节型资料可能在每章重新从第 1 题编号。必须用“章节标题＋单选/多选/判断分区＋原题号”关联答案，禁止把不同章节的同号题串在一起。",
    "判断题统一输出 A=正确、B=错误两个选项；原文 √ 对应 A，× 对应 B。",
    "若多道题共用一组选项，把选项复制到每道题，并用 sharedOptionGroup 标记同组。",
  ];
  return [
    "你是严谨的医学考试题库结构化助手。只整理原文，不得根据医学常识猜答案、改答案或补题。",
    `文件：${input.fileName}；片段 ${input.chunkIndex + 1}/${input.chunkCount}。`,
    ...profileRules,
    "把题号与答案按原题号关联。答案可来自题目附近、章节答案、全书答案表或解析；answerSource 简短注明依据位置。",
    "若原文件带有“解析、详解、答案说明”等内容，explanation 必须忠实提取并整理该题对应的原文解析，不得用模型自己的医学知识替换、补写或更新；原文没有解析则留空。",
    input.allowUnanswered
      ? "输出本片段中题干和至少两个选项完整的全部题目。原文没有明确答案时 answer 必须为空数组，并设置 answerPending=true；不得因此丢弃题目。"
      : "只输出本片段中题干和至少两个选项完整、且能从原文明确定答案的题。",
    "若 OCR 丢失少数题号，只有在相邻题号与题目顺序能唯一确定时才补回；无法唯一确定时保留可见题号，不得随意编号。",
    "若片段带有 CROSS_PAGE_SEAM 标记，表示题干在上一页、选项或答案在下一页；必须把接缝两侧合并为同一道完整题，标记本身不是题目内容。",
    "输出 NDJSON：每行一个独立 JSON 对象，不要数组、不要 Markdown、不要行内换行。坏一行不能影响其他题。",
    `每行结构：{"type":"question","sourceNumber":"1","questionType":"A","sharedOptionGroup":"","stem":"题干","options":[{"label":"A","text":"选项"}],"answer":["A"],"answerPending":false,"explanation":"原文有则整理，无则空","answerSource":"总论 · 单选题答案表"}。questionType 只能是 A、B、C、X。`,
    "单选 answer 一个字母，多选为多个字母。保留原意，删除页眉页脚、公众号、水印和排版噪声。",
    "可供关联的答案参考区：",
    input.answerReference || "（没有单独提取到答案参考区，请只用片段内明确答案）",
    "当前题目片段：",
    input.chunk,
  ].join("\n");
}

export function parseMedicalAnswerResponse(content: string, questions: QuizQuestion[]): MedicalAnswerPatch[] {
  const targets = new Map(questions.map((question) => [String(question.sourceNumber).trim(), question]));
  const selected = new Map<string, MedicalAnswerPatch>();
  for (const candidate of collectRawQuestions(content)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as AiQuestion;
    const sourceNumber = String(raw.sourceNumber ?? "").trim();
    const target = targets.get(sourceNumber);
    if (!target) continue;
    const labels = new Set(target.options.map((option) => option.label));
    const answerText = Array.isArray(raw.answer) ? raw.answer.join("") : String(raw.answer ?? "");
    const answer = [...new Set(answerText.toUpperCase().match(/[A-G]/g) ?? [])].filter((label) => labels.has(label));
    if (!answer.length) continue;
    selected.set(sourceNumber, {
      sourceNumber,
      answer,
      explanation: typeof raw.explanation === "string" ? raw.explanation.trim().slice(0, 6_000) || undefined : undefined,
      answerSource: typeof raw.answerSource === "string" ? raw.answerSource.trim().slice(0, 160) || undefined : undefined,
    });
  }
  return [...selected.values()];
}

export function buildMedicalAnswerPrompt(input: {
  fileName: string;
  answerText: string;
  questions: Array<Pick<QuizQuestion, "sourceNumber" | "stem" | "options">>;
}) {
  return [
    "你是医学试卷答案关联助手。只能从答案文件原文中提取明确给出的答案与解析，不得用医学常识猜答案。",
    `答案文件：${input.fileName}。`,
    "按原题号把答案关联到下面的目标题目。若原文有解析，忠实提取到 explanation；answerSource 简短注明答案表、解析页或章节位置。",
    "只输出 NDJSON，每行一个 JSON 对象，不要数组、Markdown 或额外说明。",
    "每行结构：{\"sourceNumber\":\"1\",\"answer\":[\"A\"],\"explanation\":\"原文解析，无则空\",\"answerSource\":\"答案表\"}",
    "找不到明确答案的题不要输出。多选答案必须保留原文给出的全部字母。",
    "目标题目索引：",
    ...input.questions.map((question) => `${question.sourceNumber}\t${question.stem.slice(0, 160)}\t选项:${question.options.map((option) => option.label).join("")}`),
    "答案文件原文：",
    input.answerText,
  ].join("\n");
}
