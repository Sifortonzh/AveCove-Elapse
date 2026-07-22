import { extractQuestionFileText, type ImportUpdate } from "./file-import";

export type EnglishStage = "cet" | "postgraduate" | "ielts" | "toefl";
export type EnglishSectionKind = "cloze" | "word-bank" | "reading" | "matching" | "long-reading" | "listening" | "writing" | "translation";
export type EnglishTestOption = { label: string; text: string };
export type EnglishTestQuestion = {
  id: string;
  number: string;
  stem: string;
  options: EnglishTestOption[];
  answer?: string;
  explanation?: string;
};
export type EnglishTestSection = {
  id: string;
  kind: EnglishSectionKind;
  title: string;
  part?: string;
  passage: string;
  questions: EnglishTestQuestion[];
};
export type SavedEnglishTest = {
  id: string;
  name: string;
  stage: EnglishStage;
  examVariant?: string;
  importedAt: string;
  updatedAt: string;
  sourceFormat: string;
  usedOcr: boolean;
  sections: EnglishTestSection[];
};

const DB_NAME = "avecove-english-tests";
const STORE_NAME = "tests";
const sectionNames: Record<EnglishSectionKind, string> = {
  cloze: "Cloze",
  "word-bank": "Word Bank",
  reading: "Reading",
  matching: "Paragraph Matching",
  "long-reading": "Long Reading",
  listening: "Listening",
  writing: "Writing",
  translation: "Translation",
};

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ＡＢＣＤ]/g, (value) => "ABCD"["ＡＢＣＤ".indexOf(value)])
    .replace(/[．]/g, ".")
    .replace(/[ 	]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function sanitizeEnglishPassage(text: string) {
  let cleaned = text
    .replace(/^\s*(?:\[\[PAGE\s+\d+\]\]\s*)?/i, "")
    .replace(/^\s*(?:Section\s+[IVX\dA-D]+\s*)?(?:Part\s+[IVX\dA-D]+\s*)?(?:writing|listening(?: comprehension)?|reading(?: comprehension)?|cloze(?: test)?|use of english|translation|写作|听力|阅读|完形填空|翻译)[^\n]*\n?/i, "")
    .replace(/^\s*Part\s+[A-DIVX\d]+\s*\n?/i, "")
    .replace(/^\s*(?:Text|Passage)\s+(?:[1-4]|One|Two|Three|Four)\s*\n?/i, "");

  const answerSheetDirections = cleaned.match(/^\s*Directions?\s*:\s*[\s\S]{0,3000}?ANSWER\s+SHEET(?:\s+\d+)?[.!]?\s*(?:\([^)]*\))?\s*/i);
  if (answerSheetDirections) cleaned = cleaned.slice(answerSheetDirections[0].length);
  else if (/^\s*Directions?\s*:/i.test(cleaned)) {
    cleaned = cleaned.replace(/^\s*Directions?\s*:\s*/i, "");
    for (let index = 0; index < 5; index += 1) {
      const instruction = cleaned.match(/^\s*(?:(?:Read|Choose|Answer|Mark|Translate|Write|Complete|Fill|Match)\b|For\s+Questions?\b|In\s+this\s+(?:section|part)\b|You\s+(?:are|should|must|will)\b|Paragraphs?\s+[A-G]\b)[^.!?\n]*(?:[.!?]\s*|\n+|$)/i);
      if (!instruction) break;
      cleaned = cleaned.slice(instruction[0].length);
    }
    cleaned = cleaned.replace(/^\s*\(\s*\d+\s+points?\s*\)\s*/i, "");
  }

  return cleaned.trim();
}

function inferStage(text: string, fileName: string): EnglishStage {
  const sample = `${fileName}\n${text.slice(0, 2500)}`.toLocaleLowerCase();
  if (/ielts|雅思/.test(sample)) return "ielts";
  if (/toefl|托福/.test(sample)) return "toefl";
  if (/考研|硕士研究生|研究生招生|postgraduate|graduate entrance|national entrance/.test(sample)) return "postgraduate";
  return "cet";
}

function inferExamVariant(text: string, fileName: string) {
  const sample = `${fileName}\n${text.slice(0, 3500)}`;
  if (/(?:CET\s*[- ]?6|六级)/i.test(sample)) return "CET-6";
  if (/(?:CET\s*[- ]?4|四级)/i.test(sample)) return "CET-4";
  if (/英语\s*[（(]?一[）)]?|English\s+I/i.test(sample) && /(?:考研|硕士研究生|研究生招生)/.test(sample)) return "Postgraduate English I";
  return undefined;
}

function inferKind(value: string): EnglishSectionKind {
  const sample = value.toLocaleLowerCase();
  if (/writing|essay|作文|写作/.test(sample)) return "writing";
  if (/translation|translate|翻译/.test(sample)) return "translation";
  if (/listening|听力/.test(sample)) return "listening";
  if (/cloze|use of english|完形/.test(sample)) return "cloze";
  if (/part\s*b|41\s*[-–]\s*45|paragraph matching|段落匹配/.test(sample)) return "matching";
  return "reading";
}

type ParsedAnswer = { answer: string; explanation?: string };

function explicitAnswerMarkers(text: string) {
  return [...text.matchAll(/(?:^|\n)\s*([1-9]\d{0,2})\s*[.、]?[ \t]*[【\[]\s*(?:答案|answer)\s*[】\]][ \t]*([A-G])\b/gi)];
}

function parseAnswerMap(text: string) {
  const answerMap = new Map<string, ParsedAnswer>();
  const explicit = explicitAnswerMarkers(text);
  explicit.forEach((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < explicit.length ? explicit[index + 1].index ?? text.length : text.length;
    const detail = text.slice(start, end);
    const explanationMatch = detail.match(/[【\[]\s*(?:解析|详解|analysis|explanation)\s*[】\]]\s*([\s\S]*)/i);
    const explanation = explanationMatch?.[1]
      .replace(/(?:^|\n)\s*\d{1,3}\s*(?:\n|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1800);
    answerMap.set(marker[1], { answer: marker[2].toUpperCase(), explanation: explanation || undefined });
  });

  const headings = [...text.matchAll(/(?:^|\n)\s*(?:answers?|answer key|参考答案|答案)\s*[:：]?/gi)];
  const heading = headings.at(-1);
  if (typeof heading?.index === "number") {
    const answerText = text.slice(heading.index + heading[0].length);
    for (const match of answerText.matchAll(/(?:^|[\s,，;；])([1-9]\d{0,2})\s*[.)、:：-]?\s*([A-G])(?=$|[\s,，;；])/g)) {
      if (!answerMap.has(match[1])) answerMap.set(match[1], { answer: match[2].toUpperCase() });
    }
  }
  return answerMap;
}

function stripAnswerArea(text: string) {
  const explicit = explicitAnswerMarkers(text);
  const firstQuestionAnswer = explicit.find((marker) => marker[1] === "1") ?? explicit[0];
  if (typeof firstQuestionAnswer?.index === "number") {
    const prefix = text.slice(0, firstQuestionAnswer.index);
    const explanationStart = Math.max(prefix.lastIndexOf("真题解析"), prefix.lastIndexOf("答案解析"), prefix.toLocaleLowerCase().lastIndexOf("answer explanations"));
    return text.slice(0, explanationStart >= 0 ? explanationStart : firstQuestionAnswer.index);
  }
  const headings = [...text.matchAll(/(?:^|\n)\s*(?:answers?|answer key|参考答案|答案)\s*[:：]?/gi)];
  const heading = headings.at(-1);
  return typeof heading?.index === "number" ? text.slice(0, heading.index) : text;
}

function parseOptions(body: string) {
  const markers = [...body.matchAll(/[【\[]\s*([A-G])\s*[】\]]\s*|(?:^|\n|\s{2,})([A-G])\s*[.)、:] ?\s*/g)];
  return markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? body.length : body.length;
    return { label: (marker[1] || marker[2]).toUpperCase(), text: body.slice(start, end).replace(/\s+/g, " ").trim() };
  }).filter((option) => option.text);
}

function withAnswer(question: Omit<EnglishTestQuestion, "answer" | "explanation">, answers: Map<string, ParsedAnswer>): EnglishTestQuestion {
  const resolved = answers.get(question.number);
  return { ...question, answer: resolved?.answer, explanation: resolved?.explanation };
}

function parseQuestions(text: string, answers: Map<string, ParsedAnswer>, sectionId: string): EnglishTestQuestion[] {
  const questionMarkers = [...text.matchAll(/(?:^|\n)\s*([1-9]\d{0,2})\s*[.)、]\s*/g)];
  const questions: EnglishTestQuestion[] = [];

  for (let index = 0; index < questionMarkers.length; index += 1) {
    const marker = questionMarkers[index];
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < questionMarkers.length ? questionMarkers[index + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).trim();
    const firstOptionMatch = body.match(/[【\[]\s*[A-G]\s*[】\]]|(?:^|\n|\s{2,})[A-G]\s*[.)、:] ?\s*/);
    if (!firstOptionMatch || typeof firstOptionMatch.index !== "number") continue;
    const firstOption = firstOptionMatch.index;
    const stem = body.slice(0, firstOption).replace(/\s+/g, " ").trim();
    const options = parseOptions(body.slice(firstOption));
    if (!stem || options.length < 2) continue;
    const number = marker[1];
    questions.push(withAnswer({ id: `${sectionId}:${number}`, number, stem, options }, answers));
  }
  return questions;
}

function parseClozeQuestions(text: string, answers: Map<string, ParsedAnswer>, sectionId: string) {
  const rowMarkers = [...text.matchAll(/(?:^|\n)\s*([1-9]|1\d|20)\s+(?=[【\[]\s*A\s*[】\]])/g)];
  return rowMarkers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < rowMarkers.length ? rowMarkers[index + 1].index ?? text.length : text.length;
    const number = marker[1];
    const options = parseOptions(text.slice(start, end)).filter((option) => /^[A-D]$/.test(option.label));
    return withAnswer({ id: `${sectionId}:${number}`, number, stem: `Blank ${number}`, options }, answers);
  }).filter((question) => question.options.length >= 2);
}

function parseMatchingSection(text: string, answers: Map<string, ParsedAnswer>, sectionId: string): EnglishTestSection {
  const optionAreaStart = text.search(/[【\[]\s*A\s*[】\]]/);
  const optionArea = optionAreaStart >= 0 ? text.slice(optionAreaStart) : text;
  const options = parseOptions(optionArea).filter((option) => /^[A-G]$/.test(option.label));
  const selectable = options.filter((option) => !["F", "G"].includes(option.label));
  const questions = [41, 42, 43, 44, 45].map((number) => withAnswer({
    id: `${sectionId}:${number}`,
    number: String(number),
    stem: `Choose the paragraph for gap ${number}.`,
    options: selectable.length >= 5 ? selectable : options,
  }, answers));
  const directionsEnd = text.search(/[【\[]\s*A\s*[】\]]/);
  const directions = sanitizeEnglishPassage(directionsEnd >= 0 ? text.slice(0, directionsEnd) : text);
  return { id: sectionId, kind: "matching", title: "Reading Part B · Paragraph Matching", part: "Part B", passage: directions.slice(0, 6000), questions };
}

function parseTranslationSection(text: string, sectionId: string): EnglishTestSection {
  const markers = [...text.matchAll(/\((4[6-9]|50)\)\s*/g)];
  const questions = markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length;
    return { id: `${sectionId}:${marker[1]}`, number: marker[1], stem: text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 1800), options: [] };
  });
  return { id: sectionId, kind: "translation", title: "Section III · Translation", passage: passageBeforeQuestions(text), questions };
}

function passageBeforeQuestions(text: string) {
  const firstQuestion = text.search(/(?:^|\n)\s*[1-9]\d{0,2}\s*[.)、]\s+/);
  const candidate = (firstQuestion >= 0 ? text.slice(0, firstQuestion) : text)
    .replace(/^\s*(?:part\s+[ivx\d]+\s*)?(?:writing|listening(?: comprehension)?|reading(?: comprehension)?|cloze(?: test)?|use of english|translation|写作|听力|阅读|完形填空|翻译)[^\n]*\n?/i, "")
    .trim();
  return sanitizeEnglishPassage(candidate).slice(0, 12_000);
}

function splitPartSections(text: string) {
  const markers = [...text.matchAll(/(?:^|\n)\s*Part\s+([A-D])\s*(?=\n|$)/gi)];
  if (!markers.length) return [{ part: undefined, text }];
  return markers.map((marker, index) => ({
    part: `Part ${marker[1].toUpperCase()}`,
    text: text.slice(marker.index ?? 0, index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length),
  }));
}

function splitReadingTexts(text: string) {
  const markers = [...text.matchAll(/(?:^|\n)\s*Text\s+([1-4])\s*(?=\n|$)/gi)];
  if (!markers.length) return [{ label: "Text Comprehension", text }];
  return markers.map((marker, index) => ({
    label: `Text ${marker[1]}`,
    text: text.slice(marker.index ?? 0, index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length),
  }));
}

function isCetPaper(text: string) {
  return /(?:CET\s*[- ]?6|六级|Part\s+III\s+Reading\s+Comprehension)/i.test(text);
}

function topLevelParts(text: string) {
  const markers = [...text.matchAll(/(?:^|\n)\s*Part\s+([IVX]+)[^A-Za-z\n]{0,12}(Writing|Listening\s+Comprehension|Reading\s+Comprehension|Translation)\b/gi)];
  const result = new Map<string, string>();
  markers.forEach((marker, index) => {
    const start = marker.index ?? 0;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length;
    result.set(marker[1].toUpperCase(), text.slice(start, end));
  });
  return result;
}

function splitNamedBlocks(text: string, pattern: RegExp) {
  const markers = [...text.matchAll(pattern)];
  if (!markers.length) return [{ label: "Practice", text }];
  return markers.map((marker, index) => ({
    label: marker[0].replace(/\s+/g, " ").trim(),
    text: text.slice(marker.index ?? 0, index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length),
  }));
}

function parseCetAnswers(text: string, base: Map<string, ParsedAnswer>) {
  const answers = new Map(base);
  for (const match of text.matchAll(/(?:^|\n)\s*(2[6-9]|3[0-5])\s*[.、]\s*([A-O])\s*[).]\s*([A-Za-z][A-Za-z'\-]*)/g)) {
    answers.set(match[1], { answer: match[2].toUpperCase(), explanation: `The source explanation identifies ${match[3]} as the word for blank ${match[1]}.` });
  }

  const markers = [...text.matchAll(/(?:^|\n)\s*([1-9]|[1-4]\d|5[0-5])\s*[.、]\s*/g)];
  markers.forEach((marker, index) => {
    const number = marker[1];
    if (answers.has(number)) return;
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length;
    const block = text.slice(start, end);
    const answerMatch = block.match(/(?:正确答案(?:为|是)?|故选) ?\s*([A-O])\b|([A-O])项(?:正确|符合)/i)
      ?? block.match(/(?:答案解析|答案) ?\s*([A-O])\s*[.。]/i);
    const answer = (answerMatch?.[1] || answerMatch?.[2])?.toUpperCase();
    if (!answer) return;
    const explanationStart = block.search(/(?:解析|答案解析|analysis)/i);
    const explanation = (explanationStart >= 0 ? block.slice(explanationStart) : block).replace(/\s+/g, " ").trim().slice(0, 1800);
    answers.set(number, { answer, explanation: explanation || undefined });
  });
  return answers;
}

function parseCetWordBank(text: string, answers: Map<string, ParsedAnswer>, sectionId: string): EnglishTestSection {
  const answerStart = text.search(/(?:答案详解|答案解析|26\s*[.、]\s*[A-O]\s*[).])/i);
  const questionArea = answerStart >= 0 ? text.slice(0, answerStart) : text;
  const optionMap = new Map<string, string>();
  for (const match of questionArea.matchAll(/(?:^|\s)([A-O])\s*[).]\s*([A-Za-z][A-Za-z'\-]*)/g)) {
    if (!optionMap.has(match[1])) optionMap.set(match[1], match[2]);
  }
  const options = [...optionMap].map(([label, value]) => ({ label, text: value }));
  const questions = Array.from({ length: 10 }, (_, index) => {
    const number = String(26 + index);
    return withAnswer({ id: `${sectionId}:${number}`, number, stem: `Blank ${number}`, options }, answers);
  });
  return { id: sectionId, kind: "word-bank", title: "Reading Section A · Word Bank", part: "Section A", passage: sanitizeEnglishPassage(questionArea).slice(0, 12_000), questions };
}

function parseCetParagraphOptions(text: string) {
  const markers = [...text.matchAll(/(?:^|\n)\s*([A-O])\s*[).] ?\s*/g)];
  return markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length;
    return { label: marker[1], text: text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 2400) };
  }).filter((option) => option.text);
}

function parseCetLongReading(text: string, answers: Map<string, ParsedAnswer>, sectionId: string): EnglishTestSection {
  const detailStart = text.search(/(?:答案详解|答案解析)\s*[:：]?/i);
  const options = parseCetParagraphOptions(detailStart >= 0 ? text.slice(0, detailStart) : text);
  const located = new Map<string, string>();
  options.forEach((option) => {
    for (const match of option.text.matchAll(/[【\[(](3[6-9]|4[0-5])[】\])]/g)) located.set(match[1], option.label);
  });
  const detail = detailStart >= 0 ? text.slice(detailStart) : "";
  const statementMarkers = [...detail.matchAll(/(?:^|\n)\s*(3[6-9]|4[0-5])\s*[.、]\s*/g)];
  const statements = new Map<string, string>();
  statementMarkers.forEach((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < statementMarkers.length ? statementMarkers[index + 1].index ?? detail.length : detail.length;
    const candidate = detail.slice(start, end).split(/(?:答案解析|解析)/i)[0].replace(/^\s*题干译文\s*/, "").replace(/\s+/g, " ").trim();
    if (candidate) statements.set(marker[1], candidate.slice(0, 1000));
  });
  const questions = Array.from({ length: 10 }, (_, index) => {
    const number = String(36 + index);
    const resolved = answers.get(number);
    return {
      id: `${sectionId}:${number}`,
      number,
      stem: statements.get(number) || `Statement ${number} — choose the paragraph containing the matching information.`,
      options,
      answer: resolved?.answer || located.get(number),
      explanation: resolved?.explanation,
    };
  });
  const passageEnd = detailStart >= 0 ? detailStart : text.length;
  return { id: sectionId, kind: "long-reading", title: "Reading Section B · Long Reading", part: "Section B", passage: sanitizeEnglishPassage(text.slice(0, passageEnd)).slice(0, 18_000), questions };
}

function splitCetReadingSections(text: string, answers: Map<string, ParsedAnswer>, baseId: string) {
  const markers = [...text.matchAll(/(?:^|\n)\s*Section[^A-Za-z\n]{0,10}([ABC])?\b[^\n]*/gi)];
  if (!markers.length) return [];
  const slices = markers.map((marker, index) => ({
    label: (marker[1]?.toUpperCase() || ["A", "B", "C"][index] || "C"),
    text: text.slice(marker.index ?? 0, index + 1 < markers.length ? markers[index + 1].index ?? text.length : text.length),
  }));
  const sections: EnglishTestSection[] = [];
  slices.forEach((slice) => {
    const id = `${baseId}-section-${slice.label.toLocaleLowerCase()}`;
    if (slice.label === "A") sections.push(parseCetWordBank(slice.text, answers, id));
    else if (slice.label === "B") sections.push(parseCetLongReading(slice.text, answers, id));
    else {
      splitNamedBlocks(slice.text, /(?:^|\n)\s*Passage\s+(?:One|Two|1|2)\b/gi).forEach((block, blockIndex) => {
        const blockId = `${id}-passage-${blockIndex + 1}`;
        const questions = parseQuestions(block.text, answers, blockId).filter((question) => Number(question.number) >= 46 && Number(question.number) <= 55);
        sections.push({ id: blockId, kind: "reading", title: `Reading Section C · ${block.label}`, part: "Section C", passage: passageBeforeQuestions(block.text), questions });
      });
    }
  });
  return sections;
}

function splitCetSections(text: string, answers: Map<string, ParsedAnswer>) {
  const parts = topLevelParts(text);
  if (!parts.size) return [];
  const sections: EnglishTestSection[] = [];
  const writing = parts.get("I");
  if (writing) sections.push({ id: "cet-writing", kind: "writing", title: "CET-6 Writing", part: "Part I", passage: writing.replace(/^[\s\S]*?Writing\s*/i, "").trim().slice(0, 9000), questions: [] });

  const listening = parts.get("II");
  if (listening) {
    splitNamedBlocks(listening, /(?:^|\n)\s*(?:Conversation|Passage|Recording)\s+(?:One|Two|Three|1|2|3)\b/gi).forEach((block, index) => {
      const id = `cet-listening-${index + 1}`;
      const questions = parseQuestions(block.text, answers, id).filter((question) => Number(question.number) >= 1 && Number(question.number) <= 25);
      sections.push({ id, kind: "listening", title: `Listening · ${block.label}`, part: "Part II", passage: passageBeforeQuestions(block.text), questions });
    });
  }

  let reading = parts.get("III");
  if (!reading) {
    const firstWordBankAnswer = text.search(/(?:^|\n)\s*26\s*[.、]\s*[A-O]\s*[).]/);
    if (firstWordBankAnswer >= 0) {
      const beforeAnswers = text.slice(0, firstWordBankAnswer);
      const sectionStart = beforeAnswers.lastIndexOf("Section");
      const translationCue = text.search(/(?:Part\s+IV[^A-Za-z\n]{0,12}Translation|cubic\s+meter|The\s+Tiangong\s+Space\s+Station)/i);
      reading = text.slice(sectionStart >= 0 ? sectionStart : firstWordBankAnswer, translationCue > firstWordBankAnswer ? translationCue : text.length);
    }
  }
  if (reading) sections.push(...splitCetReadingSections(reading, answers, "cet-reading"));

  let translation = parts.get("IV");
  if (!translation) {
    const cue = text.search(/(?:cubic\s+meter|The\s+Tiangong\s+Space\s+Station)/i);
    if (cue >= 0) {
      const pageStart = text.slice(0, cue).lastIndexOf("[[PAGE ");
      translation = text.slice(pageStart >= 0 ? pageStart : cue);
    }
  }
  if (translation) {
    const referenceStart = translation.search(/(?:参考译文|reference translation)/i);
    sections.push({ id: "cet-translation", kind: "translation", title: "CET-6 Translation · Chinese to English", part: "Part IV", passage: (referenceStart >= 0 ? translation.slice(0, referenceStart) : translation).trim().slice(0, 9000), questions: [] });
  }
  return sections.filter((section) => section.passage || section.questions.length);
}

function splitSections(text: string, answers: Map<string, ParsedAnswer>) {
  const body = stripAnswerArea(text);
  const headingPattern = /(?:^|\n)\s*((?:Section\s+[IVX]+\s*)?(?:writing|listening(?: comprehension)?|reading(?: comprehension)?|cloze(?: test)?|use of english|translation|写作|听力|阅读|完形填空|翻译)[^\n]*)/gi;
  const headings = [...body.matchAll(headingPattern)];
  const slices = headings.length ? headings.map((heading, index) => ({
    heading: heading[1].trim(),
    text: body.slice(heading.index ?? 0, index + 1 < headings.length ? headings[index + 1].index ?? body.length : body.length),
  })) : [{ heading: "Imported Practice", text: body }];

  const sections: EnglishTestSection[] = [];
  slices.forEach((slice, index) => {
    const kind = inferKind(slice.heading || slice.text.slice(0, 400));
    const baseId = `section-${index + 1}`;
    if (kind === "translation") {
      sections.push(parseTranslationSection(slice.text, baseId));
      return;
    }
    if (kind === "reading" && /Part\s+[AB]/i.test(slice.text)) {
      splitPartSections(slice.text).forEach((partSlice, partIndex) => {
        const id = `${baseId}-${partSlice.part?.toLocaleLowerCase().replace(/\s/g, "-") || partIndex + 1}`;
        if (partSlice.part === "Part B") sections.push(parseMatchingSection(partSlice.text, answers, id));
        else {
          splitReadingTexts(partSlice.text).forEach((textSlice, textIndex) => {
            const textId = `${id}-text-${textIndex + 1}`;
            const questions = parseQuestions(textSlice.text, answers, textId).filter((question) => Number(question.number) >= 21 && Number(question.number) <= 40);
            sections.push({ id: textId, kind: "reading", title: `Reading Part A · ${textSlice.label}`, part: partSlice.part, passage: passageBeforeQuestions(textSlice.text), questions });
          });
        }
      });
      return;
    }
    if (kind === "writing" && /Part\s+[AB]/i.test(slice.text)) {
      splitPartSections(slice.text).forEach((partSlice, partIndex) => {
        const number = partSlice.part === "Part B" ? "52" : "51";
        const id = `${baseId}-part-${partIndex + 1}`;
        const promptStart = partSlice.text.search(new RegExp(`(?:^|\\n)\\s*${number}\\s*[.、]\\s*`, "i"));
        const prompt = (promptStart >= 0 ? partSlice.text.slice(promptStart) : partSlice.text).replace(/\s+/g, " ").trim();
        sections.push({ id, kind: "writing", title: `${partSlice.part || "Writing"} · Question ${number}`, part: partSlice.part, passage: prompt.slice(0, 8000), questions: [] });
      });
      return;
    }
    const id = baseId;
    const questions = kind === "cloze" ? parseClozeQuestions(slice.text, answers, id) : kind === "writing" ? [] : parseQuestions(slice.text, answers, id);
    const clozeOptionStart = slice.text.search(/(?:^|\n)\s*(?:[1-9]|1\d|20)\s+(?=[【\[]\s*A\s*[】\]])/);
    const passage = kind === "cloze"
      ? sanitizeEnglishPassage(clozeOptionStart >= 0 ? slice.text.slice(0, clozeOptionStart) : slice.text)
      : passageBeforeQuestions(slice.text);
    if (!questions.length && !passage) return;
    sections.push({ id, kind, title: slice.heading || sectionNames[kind], passage: passage.slice(0, 12_000), questions });
  });

  if (!sections.some((section) => section.questions.length)) {
    const questions = parseQuestions(body, answers, "section-fallback");
    if (questions.length) sections.push({ id: "section-fallback", kind: "reading", title: "Imported Questions", passage: passageBeforeQuestions(body), questions });
  }
  return sections;
}

export function parseEnglishTestText(text: string, fileName: string, usedOcr = false): Omit<SavedEnglishTest, "id" | "importedAt" | "updatedAt"> {
  const normalized = normalizeText(text);
  if (normalized.replace(/\s/g, "").length < 30) throw new Error("The file does not contain enough readable English text.");
  const baseAnswers = parseAnswerMap(normalized);
  const answers = isCetPaper(normalized) ? parseCetAnswers(normalized, baseAnswers) : baseAnswers;
  const cetSections = isCetPaper(normalized) ? splitCetSections(normalized, answers) : [];
  const sections = cetSections.length ? cetSections : splitSections(normalized, answers);
  if (!sections.length) throw new Error("No practiceable English section was detected. Try a clearer Word or PDF file.");
  const sourceFormat = fileName.split(".").pop()?.toLocaleLowerCase() || "file";
  return {
    name: fileName.replace(/\.[^.]+$/, "").trim() || "Imported English Test",
    stage: inferStage(normalized, fileName),
    examVariant: inferExamVariant(normalized, fileName),
    sourceFormat,
    usedOcr,
    sections,
  };
}

export async function extractEnglishTestFile(file: File, onUpdate: (update: ImportUpdate) => void, signal?: AbortSignal) {
  const ensureActive = () => {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
  };
  ensureActive();
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  let text = "";
  let usedOcr = false;

  if (extension === "json") {
    onUpdate({ phase: "Reading shared test", progress: 45, detail: "Validating the AveCove English Test file" });
    const payload = JSON.parse(await file.text()) as { format?: string; test?: Partial<SavedEnglishTest> };
    ensureActive();
    const shared = payload.format === "avecove-english-test-v1" ? payload.test : undefined;
    if (!shared?.name || !Array.isArray(shared.sections) || !shared.sections.length) throw new Error("This is not a valid AveCove English Test share file.");
    const stage: EnglishStage = ["cet", "postgraduate", "ielts", "toefl"].includes(shared.stage || "") ? shared.stage as EnglishStage : "cet";
    onUpdate({ phase: "Shared test ready", progress: 90, detail: "The paper can be added to your Test Library" });
    return {
      name: shared.name,
      stage,
      examVariant: shared.examVariant,
      sourceFormat: "json",
      usedOcr: Boolean(shared.usedOcr),
      sections: shared.sections,
    };
  }

  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension || "")) {
    onUpdate({ phase: "Reading image", progress: 18, detail: "Loading English OCR" });
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") onUpdate({ phase: "English OCR", progress: 25 + Math.round((message.progress ?? 0) * 55), detail: "Recognizing the exam page" });
      },
    });
    let workerClosed = false;
    const closeWorker = async () => {
      if (workerClosed) return;
      workerClosed = true;
      await worker.terminate();
    };
    const cancelOcr = () => { void closeWorker(); };
    signal?.addEventListener("abort", cancelOcr, { once: true });
    try {
      ensureActive();
      const result = await worker.recognize(file);
      ensureActive();
      text = result.data.text;
      usedOcr = true;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancelOcr);
      await closeWorker();
    }
  } else {
    const extracted = await extractQuestionFileText(file, onUpdate, signal);
    text = extracted.text;
    usedOcr = extracted.usedOcr;
  }

  ensureActive();
  onUpdate({ phase: "Classifying sections", progress: 90, detail: "Finding reading, cloze, listening and writing tasks" });
  return parseEnglishTestText(text, file.name, usedOcr);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the English Test Library."));
  });
}

export async function listEnglishTests(): Promise<SavedEnglishTest[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as SavedEnglishTest[]).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    request.onerror = () => reject(request.error ?? new Error("Unable to read the English Test Library."));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveEnglishTest(input: Omit<SavedEnglishTest, "id" | "importedAt" | "updatedAt">): Promise<SavedEnglishTest> {
  const now = new Date().toISOString();
  const test: SavedEnglishTest = { ...input, id: createId("test"), importedAt: now, updatedAt: now };
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(test);
    transaction.oncomplete = () => { database.close(); resolve(test); };
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save this English test."));
  });
}

export async function renameEnglishTest(id: string, name: string): Promise<SavedEnglishTest> {
  const nextName = name.trim();
  if (!nextName) throw new Error("The test name cannot be empty.");
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    let updated: SavedEnglishTest | null = null;
    request.onsuccess = () => {
      const current = request.result as SavedEnglishTest | undefined;
      if (!current) {
        transaction.abort();
        return;
      }
      updated = { ...current, name: nextName.slice(0, 120), updatedAt: new Date().toISOString() };
      store.put(updated);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to read this English test."));
    transaction.oncomplete = () => {
      database.close();
      if (updated) resolve(updated);
      else reject(new Error("This English test no longer exists."));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error("This English test no longer exists."));
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to rename this English test."));
  });
}

export async function deleteEnglishTest(id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete this English test."));
  });
}

export function englishSectionLabel(kind: EnglishSectionKind) {
  return sectionNames[kind];
}
