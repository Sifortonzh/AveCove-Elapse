import type { QuizOption, QuizQuestion } from "./question-parser";

export type MedicalExamProfile = "general" | "western-medicine-306";
export type MedicalQuestionType = "A" | "B" | "X";

type AiQuestion = {
  sourceNumber?: unknown;
  stem?: unknown;
  options?: unknown;
  answer?: unknown;
  questionType?: unknown;
  sharedOptionGroup?: unknown;
  explanation?: unknown;
  answerSource?: unknown;
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

export function western306Metadata(sourceNumber: string): {
  questionType?: MedicalQuestionType;
  points?: number;
  multiple?: boolean;
} {
  const number = Number.parseInt(sourceNumber.match(/\d+/)?.[0] ?? "", 10);
  if (!Number.isFinite(number) || number < 1 || number > 165) return {};
  if (number <= 40) return { questionType: "A", points: 1.5, multiple: false };
  if (number <= 115) return { questionType: "A", points: 2, multiple: false };
  if (number <= 135) return { questionType: "B", points: 1.5, multiple: false };
  return { questionType: "X", points: 2, multiple: true };
}

export function western306Score(questions: QuizQuestion[], progress: Record<string, "correct" | "wrong">) {
  return questions.reduce((score, question) => {
    const points = question.points ?? western306Metadata(question.sourceNumber).points ?? 0;
    return {
      earned: score.earned + (progress[question.id] === "correct" ? points : 0),
      answeredMaximum: score.answeredMaximum + (progress[question.id] ? points : 0),
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
          else if ("stem" in parsed) found.push(parsed);
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
      else if (parsed.type === "question" || "stem" in parsed) candidates.push(parsed);
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
): QuizQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as AiQuestion;
  const stem = typeof raw.stem === "string" ? raw.stem.trim() : "";
  const options = normalizeOptions(raw.options);
  const labels = new Set(options.map((option) => option.label));
  const answerText = Array.isArray(raw.answer) ? raw.answer.join("") : String(raw.answer ?? "");
  const answer = [...new Set(answerText.toUpperCase().match(/[A-G]/g) ?? [])].filter((label) => labels.has(label));
  if (!stem || options.length < 2 || !answer.length) return null;

  const sourceNumber = String(raw.sourceNumber ?? index + 1).trim() || String(index + 1);
  const inferred = profile === "western-medicine-306" ? western306Metadata(sourceNumber) : {};
  const suppliedType = String(raw.questionType ?? "").toUpperCase().match(/[ABX]/)?.[0] as MedicalQuestionType | undefined;
  const questionType = inferred.questionType ?? suppliedType;
  const multiple = questionType === "X" || answer.length > 1;

  return {
    id: `ai-imported-${index + 1}`,
    sourceNumber,
    category,
    stem,
    options,
    answer,
    multiple,
    examProfile: profile === "western-medicine-306" ? profile : undefined,
    questionType,
    points: inferred.points,
    sharedOptionGroup: typeof raw.sharedOptionGroup === "string" ? raw.sharedOptionGroup.trim().slice(0, 120) || undefined : undefined,
    explanation: typeof raw.explanation === "string" ? raw.explanation.trim().slice(0, 2_000) || undefined : undefined,
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
): MedicalAiParseResult {
  const candidates = collectRawQuestions(content);
  const normalized = candidates.flatMap((candidate, index) => {
    const question = normalizeQuestion(candidate, category, profile, index);
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
}) {
  const profileRules = input.profile === "western-medicine-306" ? [
    "这是考研西医综合 306：1-115 为 A 型单选；116-135 为 B 型共用备选项单选；136-165 为 X 型多选。",
    "B 型题必须把共用的 A-D 备选项复制到每道关联题，并为同组题填写相同 sharedOptionGroup。",
    "X 型题仅记录文件明确给出的全部正确选项，不得按医学知识猜测。",
  ] : [
    "兼容章节末尾、全书末尾、题干后缀、答案表和解析标题内的答案。",
    "若多道题共用一组选项，把选项复制到每道题，并用 sharedOptionGroup 标记同组。",
  ];
  return [
    "你是严谨的医学考试题库结构化助手。只整理原文，不得根据医学常识猜答案、改答案或补题。",
    `文件：${input.fileName}；片段 ${input.chunkIndex + 1}/${input.chunkCount}。`,
    ...profileRules,
    "把题号与答案按原题号关联。答案可来自题目附近、章节答案、全书答案表或解析；answerSource 简短注明依据位置。",
    "只输出本片段中题干和至少两个选项完整、且能从原文明确定答案的题。",
    "输出 NDJSON：每行一个独立 JSON 对象，不要数组、不要 Markdown、不要行内换行。坏一行不能影响其他题。",
    "每行结构：{\"type\":\"question\",\"sourceNumber\":\"1\",\"questionType\":\"A\",\"sharedOptionGroup\":\"\",\"stem\":\"题干\",\"options\":[{\"label\":\"A\",\"text\":\"选项\"}],\"answer\":[\"A\"],\"explanation\":\"原文有则整理，无则空\",\"answerSource\":\"答案表 1-A\"}",
    "单选 answer 一个字母，多选为多个字母。保留原意，删除页眉页脚、公众号、水印和排版噪声。",
    "可供关联的答案参考区：",
    input.answerReference || "（没有单独提取到答案参考区，请只用片段内明确答案）",
    "当前题目片段：",
    input.chunk,
  ].join("\n");
}
