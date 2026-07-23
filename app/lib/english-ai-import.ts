import type {
  EnglishSectionKind,
  EnglishStage,
  EnglishTestOption,
  EnglishTestQuestion,
  EnglishTestSection,
  SavedEnglishTest,
} from "./english-test";

export type EnglishAiImportInput = {
  sourceFileName: string;
  sourceText: string;
  answerFileName?: string;
  answerText?: string;
  usedOcr?: boolean;
};

type RawQuestion = {
  number?: unknown;
  stem?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
};

type RawSection = {
  kind?: unknown;
  title?: unknown;
  part?: unknown;
  directions?: unknown;
  passage?: unknown;
  questions?: unknown;
};

type RawPayload = {
  name?: unknown;
  stage?: unknown;
  examVariant?: unknown;
  warnings?: unknown;
  sections?: unknown;
};

const sectionKinds: EnglishSectionKind[] = [
  "cloze", "word-bank", "reading", "matching", "long-reading", "listening", "writing", "translation",
];

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, maxLength)
    : "";
}

function fallbackStage(fileName: string): EnglishStage {
  if (/考研|研究生|postgraduate|english\s*i\b/i.test(fileName)) return "postgraduate";
  if (/ielts|雅思/i.test(fileName)) return "ielts";
  if (/toefl|托福/i.test(fileName)) return "toefl";
  return "cet";
}

function fallbackVariant(fileName: string) {
  if (/六级|cet\s*[- ]?6/i.test(fileName)) return "CET-6";
  if (/四级|cet\s*[- ]?4/i.test(fileName)) return "CET-4";
  if (/考研|研究生|postgraduate/i.test(fileName) && /英语\s*[（(]?一|english\s*i\b/i.test(fileName)) return "Postgraduate English I";
  return undefined;
}

function parseJsonObject(content: string) {
  const plain = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = plain.indexOf("{");
  const end = plain.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return a complete JSON object.");
  return JSON.parse(plain.slice(start, end + 1)) as RawPayload;
}

function normalizeOptions(value: unknown): EnglishTestOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as { label?: unknown; text?: unknown };
    const label = String(raw.label ?? "").trim().toUpperCase().match(/[A-O]/)?.[0] ?? "";
    const text = cleanText(raw.text, 1_500);
    if (!label || !text || seen.has(label)) return [];
    seen.add(label);
    return [{ label, text }];
  });
}

function normalizeQuestion(value: unknown, sectionId: string, index: number): EnglishTestQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawQuestion;
  const number = cleanText(raw.number, 12) || String(index + 1);
  const stem = cleanText(raw.stem, 4_000);
  const options = normalizeOptions(raw.options);
  const answerCandidate = cleanText(raw.answer, 12).toUpperCase().match(/[A-O]/)?.[0];
  const answer = answerCandidate && options.some((option) => option.label === answerCandidate) ? answerCandidate : undefined;
  const explanation = cleanText(raw.explanation, 4_000) || undefined;
  if (!stem && !options.length) return null;
  return {
    id: `${sectionId}:${number.replace(/[^\w-]/g, "-") || index + 1}`,
    number,
    stem: stem || `Blank ${number}`,
    options,
    answer,
    explanation,
  };
}

function splitLeakedDirections(directionsValue: unknown, passageValue: unknown) {
  let directions = cleanText(directionsValue, 4_000);
  let passage = cleanText(passageValue, 40_000);
  if (!directions && /^\s*Directions?\s*:/i.test(passage)) {
    const separated = passage.match(/^\s*(Directions?\s*:[\s\S]*?)(?:\n\s*\n+)([\s\S]+)$/i);
    if (separated) {
      directions = cleanText(separated[1], 4_000);
      passage = cleanText(separated[2], 40_000);
    }
  }
  if (directions && passage.startsWith(directions)) passage = passage.slice(directions.length).trim();
  return { directions: directions || undefined, passage };
}

function normalizeSection(value: unknown, index: number): EnglishTestSection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawSection;
  const kindValue = cleanText(raw.kind, 40) as EnglishSectionKind;
  if (!sectionKinds.includes(kindValue)) return null;
  const id = `ai-${index + 1}-${kindValue}`;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.slice(0, 100).flatMap((question, questionIndex) => {
        const normalized = normalizeQuestion(question, id, questionIndex);
        return normalized ? [normalized] : [];
      })
    : [];
  const { directions, passage } = splitLeakedDirections(raw.directions, raw.passage);
  const title = cleanText(raw.title, 180) || `${kindValue[0].toUpperCase()}${kindValue.slice(1)} Practice`;
  const part = cleanText(raw.part, 80) || undefined;
  if (!passage && !questions.length && kindValue !== "writing" && kindValue !== "translation") return null;
  return { id, kind: kindValue, title, part, directions, passage, questions };
}

export function parseEnglishAiResponse(
  content: string,
  input: EnglishAiImportInput,
): Omit<SavedEnglishTest, "id" | "importedAt" | "updatedAt"> {
  const payload = parseJsonObject(content);
  const stageValue = cleanText(payload.stage, 30);
  const stage: EnglishStage = ["cet", "postgraduate", "ielts", "toefl"].includes(stageValue)
    ? stageValue as EnglishStage
    : fallbackStage(input.sourceFileName);
  const sections = Array.isArray(payload.sections)
    ? payload.sections.slice(0, 40).flatMap((section, index) => {
        const normalized = normalizeSection(section, index);
        return normalized ? [normalized] : [];
      })
    : [];
  if (!sections.length) throw new Error("AI did not return any practiceable English section.");
  const sourceFormat = input.sourceFileName.split(".").pop()?.toLocaleLowerCase() || "file";
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.map((warning) => cleanText(warning, 500)).filter(Boolean).slice(0, 20)
    : [];
  return {
    name: cleanText(payload.name, 160) || input.sourceFileName.replace(/\.[^.]+$/, "") || "Imported English Test",
    stage,
    examVariant: cleanText(payload.examVariant, 100) || fallbackVariant(input.sourceFileName),
    sourceFormat,
    usedOcr: Boolean(input.usedOcr),
    aiImported: true,
    answerSourceName: input.answerFileName,
    aiWarnings: warnings,
    sections,
  };
}

export function buildEnglishImportPrompt(input: EnglishAiImportInput) {
  const hasAnswerFile = Boolean(input.answerText?.trim());
  const isCombinedAnalysisFile = hasAnswerFile
    && input.answerFileName === input.sourceFileName
    && input.answerText?.trim() === input.sourceText.trim();
  return [
    "You are AveCove Elapse's senior English-exam archivist and assessment-data engineer.",
    "Convert the supplied exam material into a faithful practice system. Return ONE valid JSON object only. Do not use Markdown.",
    "",
    "NON-NEGOTIABLE ACCURACY RULES",
    "1. Preserve the original question numbers, passages, stems, option labels and option wording. Repair only obvious OCR spacing or character noise.",
    "2. Never infer or guess an answer. Populate answer only when the answer/analysis material explicitly identifies it. Otherwise omit answer.",
    "3. Explanations must be grounded in the supplied analysis. Condense each objective-question explanation to at most 80 words, but do not invent evidence or teaching points.",
    "4. Put all Directions/Instructions in the section.directions field. Never include Directions in passage, stem, title, or the first question.",
    "5. Remove page numbers, running headers/footers, watermarks, QR marketing copy, Answer Sheet instructions and duplicated OCR lines.",
    "6. Preserve continuous passage paragraphs. A page break is not a section break.",
    "7. In cloze and word-bank passages, replace every actual blank with the canonical token [[questionNumber]], for example [[26]]. Do not leave a bare number in place of a blank.",
    "",
    "CET-4 / CET-6 BLUEPRINT (apply when relevant)",
    "- Part I Writing: one writing prompt; no multiple-choice question.",
    "- Part II Listening: Section A questions 1-8, Section B 9-15, Section C 16-25. Pair answer-analysis transcripts and explanations by question number.",
    "- Part III Reading Section A is kind=word-bank, questions 26-35, one continuous passage and one shared A-O word bank. Copy the same complete A-O option bank to each blank question so the UI can enforce single use.",
    "- Part III Reading Section B is kind=long-reading, questions 36-45. Preserve paragraphs A-N (or the letters actually present), preserve the ten statements as stems, and use paragraph letters as options/answers. Paragraph letters may be reused.",
    "- Part III Reading Section C contains two independent reading sections: Passage A/One questions 46-50 and Passage B/Two questions 51-55. Never merge the two passages.",
    "- Part IV Translation: preserve the Chinese source prompt as passage; a reference translation belongs in explanation material, not in the source passage.",
    "- OCR may misread Part III as 'Part ID', letter O as zero, 'for' as 'fbr', or split a passage across pages. Correct these only when context is unambiguous.",
    "",
    "POSTGRADUATE ENGLISH BLUEPRINT (apply when relevant)",
    "- Use of English/Cloze: questions 1-20, one continuous passage, four A-D choices for each blank, and canonical markers [[1]] through [[20]].",
    "- Reading Part A: four separate passages, normally questions 21-25, 26-30, 31-35 and 36-40.",
    "- Reading Part B/paragraph matching: questions 41-45; keep answer-order items separate from malformed OCR source text.",
    "- Translation and Writing are open-response sections, not multiple-choice questions.",
    "",
    "OUTPUT SCHEMA",
    '{"name":"paper name","stage":"cet|postgraduate|ielts|toefl","examVariant":"CET-6","warnings":["only factual import warnings"],"sections":[{"kind":"cloze|word-bank|reading|matching|long-reading|listening|writing|translation","title":"human-readable title","part":"Part/Section label","directions":"instructions only","passage":"source passage with [[number]] blank tokens","questions":[{"number":"26","stem":"question or Blank 26","options":[{"label":"A","text":"option"}],"answer":"J","explanation":"source-grounded explanation"}]}]}',
    "",
    isCombinedAnalysisFile
      ? "This is one combined answer/analysis document. It may contain the original questions, answer key, transcripts, translations and explanations. Treat explicit answer labels as authoritative, but never infer a missing answer."
      : hasAnswerFile
      ? "This import contains both a blank/source paper and a companion answer/analysis file. Use the source paper as the authority for question text and the companion file as the authority for answers, transcripts, reference answers and explanations."
      : "This import contains only one file. Build every practiceable section, but leave answer absent whenever the file does not explicitly provide it. Add a warning that a companion answer/analysis file is recommended when answer coverage is incomplete.",
    `SOURCE FILE: ${input.sourceFileName}`,
    "<<<SOURCE_TEXT",
    input.sourceText.slice(0, 90_000),
    "SOURCE_TEXT",
    ...(hasAnswerFile && !isCombinedAnalysisFile ? [
      `ANSWER / ANALYSIS FILE: ${input.answerFileName || "companion file"}`,
      "<<<ANSWER_TEXT",
      input.answerText!.slice(0, 90_000),
      "ANSWER_TEXT",
    ] : []),
    "Before returning JSON, silently verify section boundaries, number ranges, blank markers, option labels, answer provenance, and that no Directions leaked into passage.",
  ].join("\n");
}
