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
  const effectiveMaximum = Math.min(maximumCharacters, 4_200);
  const pageBlocks = normalized.split(/(?=\[\[PAGE\s+\d+\]\])/i).filter((block) => block.trim());
  if (pageBlocks.length > 1) {
    const chunks: string[] = [];
    let current = "";
    for (const page of pageBlocks) {
      if (current && current.length + page.length > effectiveMaximum) {
        chunks.push(current.trim());
        current = "";
      }
      current += `${current ? "\n" : ""}${page}`;
      if (chunks.length >= maximumChunks - 1) break;
    }
    if (current.trim()) chunks.push(current.trim());
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
