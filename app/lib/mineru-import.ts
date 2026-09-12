import { parseQuestionText, type QuizQuestion } from "./question-parser";

type MinerUSpan = { content?: unknown; bbox?: unknown; type?: unknown };
type MinerULine = { spans?: unknown; bbox?: unknown };
type MinerUBlock = { lines?: unknown; bbox?: unknown; type?: unknown };
export type MinerUPage = { para_blocks?: unknown; page_idx?: unknown; [key: string]: unknown };

export type MinerUQuestionBank = {
  name: string;
  description: string;
  sourceTitle: string;
  edition: string;
  author: string;
  copyrightNotice: string;
  groupName: string;
  questions: QuizQuestion[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bboxCoordinate(value: unknown, index: number) {
  return Array.isArray(value) && typeof value[index] === "number" ? value[index] : 0;
}

export function isMineruHybridJson(value: unknown): value is { pdf_info: MinerUPage[] } {
  const body = record(value);
  return Boolean(body && Array.isArray(body.pdf_info) && body.pdf_info.length > 0);
}

function wrapMineruFormula(content: string, display: boolean) {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (/^(?:\$\$[\s\S]*\$\$|\$[^$]*\$|\\\([\s\S]*\\\)|\\\[[\s\S]*\\\])$/.test(trimmed)) return trimmed;
  return display ? `$$${trimmed}$$` : `$${trimmed}$`;
}

function mineruBlockText(value: unknown) {
  const block = record(value) as MinerUBlock | null;
  const blockType = typeof block?.type === "string" ? block.type.toLowerCase() : "";
  const lines = array(block?.lines)
    .map((line) => record(line) as MinerULine | null)
    .filter((line): line is MinerULine => Boolean(line))
    .sort((left, right) => bboxCoordinate(left.bbox, 1) - bboxCoordinate(right.bbox, 1));
  return lines.map((line) => array(line.spans)
    .map((span) => record(span) as MinerUSpan | null)
    .filter((span): span is MinerUSpan => Boolean(span))
    .sort((left, right) => bboxCoordinate(left.bbox, 0) - bboxCoordinate(right.bbox, 0))
    .map((span) => {
      if (typeof span.content !== "string") return "";
      const spanType = typeof span.type === "string" ? span.type.toLowerCase() : "";
      if (spanType.includes("equation") || blockType.includes("equation")) {
        return wrapMineruFormula(span.content, spanType.includes("interline") || blockType.includes("interline"));
      }
      return span.content;
    })
    .join("").trim())
    .filter(Boolean)
    .join("\n");
}

function pageFingerprint(page: MinerUPage) {
  return JSON.stringify(page.para_blocks ?? []);
}

export type MergedMinerUHybrid = {
  pdf_info: MinerUPage[];
  _elapse_merge: {
    sourceCount: number;
    inputPageCount: number;
    duplicatePageCount: number;
  };
};

export function mergeMineruHybridDocuments(values: unknown[]): MergedMinerUHybrid {
  if (!values.length) throw new Error("请至少选择一份 MinerU Hybrid JSON");
  const pages: MinerUPage[] = [];
  const fingerprints = new Set<string>();
  let inputPageCount = 0;
  let duplicatePageCount = 0;
  for (const value of values) {
    if (!isMineruHybridJson(value)) throw new Error("选中的文件中包含非 MinerU Hybrid JSON");
    for (const page of value.pdf_info) {
      inputPageCount += 1;
      const fingerprint = pageFingerprint(page);
      if (fingerprints.has(fingerprint)) {
        duplicatePageCount += 1;
        continue;
      }
      fingerprints.add(fingerprint);
      pages.push({ ...page, page_idx: pages.length });
    }
  }
  if (!pages.length) throw new Error("MinerU JSON 中没有可读取的页面");
  return {
    pdf_info: pages,
    _elapse_merge: { sourceCount: values.length, inputPageCount, duplicatePageCount },
  };
}

export function extractMineruHybridText(value: unknown) {
  if (!isMineruHybridJson(value)) throw new Error("这不是受支持的 MinerU Hybrid JSON");
  return mineruPages(value)
    .map((page, index) => `[[PAGE ${index + 1}]]\n${page}`)
    .join("\n");
}

function mineruPages(value: { pdf_info: MinerUPage[] }) {
  return value.pdf_info
    .map((page) => {
      const body = record(page);
      const blocks = array(body?.para_blocks).map(mineruBlockText).filter(Boolean);
      return blocks.join("\n");
    })
    .filter(Boolean);
}

const K_ANSWERS: Record<string, string> = { A: "ABC", B: "AC", C: "BD", D: "D", E: "ABCD" };
const OPTION_PATTERN = /(?<![A-Za-z])([A-EＡ-Ｅ])\s*[.．、]\s*/gi;
const INLINE_PATTERN = /^\s*((?:[（(]\s*[A-E√×对错]\s*[）)]\s*)+)(\d{1,4})\s*[.．、]\s*/gim;

type TextMatch = RegExpExecArray & { index: number };

function allMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].filter((match): match is TextMatch => typeof match.index === "number");
}

function normalizeLabel(value: string) {
  return value.replace(/[ＡＢＣＤＥ]/g, (label) => "ABCDE"["ＡＢＣＤＥ".indexOf(label)]).toUpperCase();
}

function cleanText(value: string) {
  return value.replace(/(?:^|\s)P\s*\d+(?:\s*[～~—-]\s*\d+)?(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim().replace(/^[：:；;。]+|[：:；;。]+$/g, "");
}

function splitOptions(value: string) {
  const markers = allMatches(value, OPTION_PATTERN);
  const start = markers.findIndex((marker) => normalizeLabel(marker[1]) === "A");
  if (start < 0) return { stem: cleanText(value), options: [] as QuizQuestion["options"] };
  const accepted: TextMatch[] = [];
  let expected = "A";
  for (const marker of markers.slice(start)) {
    const label = normalizeLabel(marker[1]);
    if (label !== expected) break;
    accepted.push(marker);
    expected = String.fromCharCode(expected.charCodeAt(0) + 1);
  }
  if (accepted.length < 2) return { stem: cleanText(value), options: [] as QuizQuestion["options"] };
  return {
    stem: cleanText(value.slice(0, accepted[0].index)),
    options: accepted.map((marker, index) => ({
      label: normalizeLabel(marker[1]),
      text: cleanText(value.slice(marker.index + marker[0].length, accepted[index + 1]?.index ?? value.length)),
    })).filter((option) => option.text),
  };
}

function splitStatements(value: string) {
  const markers = allMatches(value, /[（(]\s*([1-4])\s*[）)]\s*/g);
  const accepted: TextMatch[] = [];
  let expected = 1;
  for (const marker of markers) {
    if (Number(marker[1]) !== expected) {
      if (accepted.length) break;
      continue;
    }
    accepted.push(marker);
    expected += 1;
    if (expected > 4) break;
  }
  if (accepted.length < 2) return { stem: cleanText(value), options: [] as QuizQuestion["options"] };
  return {
    stem: cleanText(value.slice(0, accepted[0].index)),
    options: accepted.map((marker, index) => ({
      label: "ABCD"[Number(marker[1]) - 1],
      text: cleanText(value.slice(marker.index + marker[0].length, accepted[index + 1]?.index ?? value.length)),
    })).filter((option) => option.text),
  };
}

function ensureAnswerOptions(options: QuizQuestion["options"], answer: string[], required = "") {
  const existing = new Map(options.map((option) => [option.label, option]));
  const labels = [...new Set([...required, ...options.map((option) => option.label), ...answer])];
  return labels.map((label) => existing.get(label) ?? ({ label, text: "【原文此选项 OCR 缺失，可在纠错中补录】" }));
}

function chapterParts(value: string) {
  const matches = allMatches(value, /(第\s*[一二三四五六七八九十百〇零\d]+\s*章)[ \t]*(?:\n[ \t]*|[ \t]+)([^\n]{2,40})/g);
  return matches.map((match, index) => ({
    chapter: cleanText(`${match[1]} ${match[2]}`).replace("药 疹", "药疹"),
    body: value.slice(match.index + match[0].length, matches[index + 1]?.index ?? value.length),
  }));
}

function questionId(prefix: string, chapter: string, kind: string, number: string, index: number) {
  return `${prefix}-${chapter.replace(/\W/g, "").slice(0, 12)}-${kind}-${number}-${index}`;
}

function makeQuestion(input: {
  prefix: string; chapter: string; kind: string; number: string; stem: string;
  options: QuizQuestion["options"]; answer: string[]; index: number; sharedOptionGroup?: string;
}): QuizQuestion {
  const multiple = input.kind === "K" || input.kind === "M" || input.kind === "X";
  const questionType = input.kind === "B" ? "B" : input.kind === "C" ? "C" : multiple ? "X" : "A";
  return {
    id: questionId(input.prefix, input.chapter, input.kind, input.number, input.index),
    sourceNumber: input.number,
    category: input.chapter,
    stem: input.stem,
    options: input.options,
    answer: input.answer,
    answerPending: !input.answer.length,
    multiple,
    questionType,
    medicalQuestionType: input.kind === "B" ? "B1" : input.kind === "C" ? "C" : multiple ? "X" : "A1",
    sharedOptionGroup: input.sharedOptionGroup,
    answerSource: input.answer.length ? "原书参考答案" : undefined,
  };
}

function inlineAnswers(value: string) {
  return (value.match(/[A-EＡ-Ｅ]/gi) ?? []).map(normalizeLabel);
}

function parseEntStandard(section: string, chapter: string, kind: string, offset: number) {
  const matches = allMatches(section, INLINE_PATTERN);
  return matches.flatMap((match, index) => {
    const chunk = section.slice(match.index + match[0].length, matches[index + 1]?.index ?? section.length);
    let answer = inlineAnswers(match[1]);
    const parsed = kind === "K" ? splitStatements(chunk) : splitOptions(chunk);
    if (kind === "K") answer = [...(K_ANSWERS[answer[0]] ?? "")];
    const options = ensureAnswerOptions(parsed.options, answer, kind === "K" ? "ABCD" : "");
    const labels = new Set(options.map((option) => option.label));
    answer = answer.filter((label) => labels.has(label));
    if (parsed.stem.length < 2 || options.length < 2) return [];
    return [makeQuestion({ prefix: "ent-junyi", chapter, kind, number: match[2], stem: parsed.stem, options, answer, index: offset + index })];
  });
}

function parseEntShared(section: string, chapter: string, kind: "B" | "C", offset: number) {
  const matches = allMatches(section, INLINE_PATTERN);
  if (!matches.length) return [];
  let pool = splitOptions(section.slice(0, matches[0].index)).options;
  let poolIndex = 1;
  const questions: QuizQuestion[] = [];
  matches.forEach((match, index) => {
    const chunk = section.slice(match.index + match[0].length, matches[index + 1]?.index ?? section.length);
    const nextA = allMatches(chunk, OPTION_PATTERN).find((marker) => normalizeLabel(marker[1]) === "A");
    const stem = cleanText(nextA ? chunk.slice(0, nextA.index) : chunk);
    const nextPool = nextA ? splitOptions(chunk.slice(nextA.index)).options : [];
    let answer = inlineAnswers(match[1]);
    const options = ensureAnswerOptions(pool, answer);
    const labels = new Set(options.map((option) => option.label));
    answer = answer.filter((label) => labels.has(label));
    if (stem.length >= 2 && pool.length >= 2) questions.push(makeQuestion({
      prefix: "ent-junyi", chapter, kind, number: match[2], stem, options, answer,
      index: offset + index, sharedOptionGroup: `${chapter}-${kind}-${poolIndex}`,
    }));
    if (nextPool.length) { pool = nextPool; poolIndex += 1; }
  });
  return questions;
}

function parseEnt(pages: string[]) {
  const value = pages.slice(11).join("\n");
  const questions: QuizQuestion[] = [];
  for (const { chapter, body } of chapterParts(value)) {
    const sections = allMatches(body, /^\s*([ABCKM])型选择题\s*[:：]?\s*$|^\s*是非题\s*[:：]?\s*$/gm);
    sections.forEach((match, sectionIndex) => {
      const kind = match[1]?.toUpperCase() ?? "J";
      const section = body.slice(match.index + match[0].length, sections[sectionIndex + 1]?.index ?? body.length);
      if (kind === "B" || kind === "C") questions.push(...parseEntShared(section, chapter, kind, questions.length));
      else if (kind !== "J") questions.push(...parseEntStandard(section, chapter, kind, questions.length));
      else {
        const entries = allMatches(section, INLINE_PATTERN);
        entries.forEach((entry, index) => {
          const stem = cleanText(section.slice(entry.index + entry[0].length, entries[index + 1]?.index ?? section.length));
          const mark = entry[1].match(/[√×对错]/)?.[0];
          if (stem.length >= 2) questions.push(makeQuestion({
            prefix: "ent-junyi", chapter, kind: "J", number: entry[2], stem,
            options: [{ label: "A", text: "正确" }, { label: "B", text: "错误" }],
            answer: mark ? [/[√对]/.test(mark) ? "A" : "B"] : [], index: questions.length,
          }));
        });
      }
    });
  }
  return questions;
}

function answerMap(value: string) {
  const result = new Map<string, string[]>();
  for (const match of allMatches(value, /(?<!\d)(\d{1,4})\s*[.．、]\s*([A-EＡ-Ｅ]{1,5})(?=\s|$)/gi)) {
    result.set(match[1], [...new Set([...match[2]].map(normalizeLabel))]);
  }
  return result;
}

function parseDermSection(value: string, answers: Map<string, string[]>, chapter: string, kind: "single" | "multiple", offset: number) {
  const matches = allMatches(value, /^\s*(\d{1,4})\s*[.．、]\s*/gm);
  return matches.flatMap((match, index) => {
    const parsed = splitOptions(value.slice(match.index + match[0].length, matches[index + 1]?.index ?? value.length));
    if (parsed.stem.length < 2 || parsed.options.length < 2) return [];
    const sourceAnswer = answers.get(match[1]) ?? [];
    const options = ensureAnswerOptions(parsed.options, sourceAnswer);
    const answer = sourceAnswer.filter((label) => options.some((option) => option.label === label));
    return [makeQuestion({ prefix: "dermatology-renwei-2e", chapter, kind: kind === "multiple" ? "X" : "A", number: match[1], stem: parsed.stem, options, answer, index: offset + index })];
  });
}

function parseDermatology(value: string) {
  const questions: QuizQuestion[] = [];
  for (const { chapter, body } of chapterParts(value)) {
    const exerciseStart = body.indexOf("习题");
    const answerStart = body.indexOf("参考答案", Math.max(0, exerciseStart));
    if (exerciseStart < 0 || answerStart < 0) continue;
    const exercise = body.slice(exerciseStart, answerStart);
    const keys = body.slice(answerStart);
    const single = /[（(]\s*一\s*[）)]\s*单项选择题[^\n]*/.exec(exercise);
    const multi = /[（(]\s*二\s*[）)]\s*多项选择题[^\n]*/.exec(exercise);
    const stop = /^\s*二[、.．]\s*(?:名词解释|问答题)/m.exec(exercise);
    const keySingle = /[（(]\s*一\s*[）)]\s*单项选择题/.exec(keys);
    const keyMulti = /[（(]\s*二\s*[）)]\s*多项选择题/.exec(keys);
    if (single?.index !== undefined) {
      const end = multi?.index ?? stop?.index ?? exercise.length;
      const keyText = keySingle?.index !== undefined ? keys.slice(keySingle.index + keySingle[0].length, keyMulti?.index ?? keys.length) : "";
      questions.push(...parseDermSection(exercise.slice(single.index + single[0].length, end), answerMap(keyText), chapter, "single", questions.length));
    }
    if (multi?.index !== undefined) {
      const end = stop?.index ?? exercise.length;
      const keyText = keyMulti?.index !== undefined ? keys.slice(keyMulti.index + keyMulti[0].length) : "";
      questions.push(...parseDermSection(exercise.slice(multi.index + multi[0].length, end), answerMap(keyText), chapter, "multiple", questions.length));
    }
  }
  return questions;
}

function normalizeMineruMedicalText(raw: string) {
  const combinedChapters = raw.replace(
    /(第\s*[一二三四五六七八九十百〇零\d]+\s*章)\s*\n\s*([^\n]{2,40})(?=\n(?:学习目标|习题|[ABCKM]型选择题))/g,
    (_, chapter: string, title: string) => `${chapter.replace(/\s+/g, "")} ${title.trim()}`,
  );
  const lines = combinedChapters.replace(/\r/g, "").split("\n");
  let section = "";
  return lines.map((sourceLine) => {
    let line = sourceLine.trim();
    const sectionMatch = line.match(/^([ABCKM])型选择题\s*[:：]?$/i);
    if (sectionMatch) {
      section = sectionMatch[1].toUpperCase();
      return section === "K" || section === "M" ? "X型题" : `${section}型题`;
    }
    if (/^是非题\s*[:：]?$/.test(line)) {
      section = "J";
      return "判断题";
    }
    line = line
      .replace(/^[（(]\s*一\s*[）)]\s*单项选择题/, "一、单项选择题")
      .replace(/^[（(]\s*二\s*[）)]\s*多项选择题/, "二、多项选择题");
    const inline = line.match(/^((?:[（(]\s*[A-E√×对错]\s*[）)]\s*)+)(\d{1,4})\s*[.．、]\s*(.*)$/i);
    if (!inline) return line;
    const labels = (inline[1].match(/[A-E]/gi) ?? []).map((label) => label.toUpperCase()).join("");
    const mark = inline[1].match(/[√×对错]/)?.[0];
    if (section === "J") return `${inline[2]}. ${inline[3]} ${mark ?? ""}`.trim();
    const answer = section === "K" ? K_ANSWERS[labels[0]] ?? "" : labels;
    let stem = inline[3];
    if (section === "K") {
      stem = stem.replace(/[（(]\s*([1-4])\s*[）)]/g, (_, number: string) => `${"ABCD"[Number(number) - 1]}.`);
    }
    return `${inline[2]}. ${stem}${answer ? ` 答案：${answer}` : ""}`;
  }).join("\n");
}

function chapterSummary(questions: QuizQuestion[]) {
  const counts = new Map<string, number>();
  for (const question of questions) counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
  return [...counts].map(([chapter, count]) => `${chapter} ${count} 道`).join("；");
}

export function parseMineruHybridQuestionBank(value: unknown, fileName: string): MinerUQuestionBank {
  if (!isMineruHybridJson(value)) throw new Error("这不是受支持的 MinerU Hybrid JSON");
  const raw = extractMineruHybridText(value);
  const baseName = fileName.replace(/\.json$/i, "").replace(/^MinerU_/, "").replace(/__?\d{14,}$/, "");
  const isEntJunyi = /耳鼻咽喉科学习题集/.test(raw) && /人民军医出版社|PEOPLE'S MILITARY/.test(raw);
  const isDermatology = /皮肤性病/.test(baseName) || /病毒性皮肤病/.test(raw);
  const pages = mineruPages(value);
  const normalized = normalizeMineruMedicalText(raw);
  const questions = isEntJunyi
    ? parseEnt(pages)
    : isDermatology
      ? parseDermatology(pages.join("\n"))
      : parseQuestionText(normalized.replace(/^\[\[PAGE \d+\]\]$/gm, ""), baseName);
  if (!questions.length) throw new Error("已读取 MinerU JSON，但没有找到结构完整的客观题；可改用 Elapse Forge 审校");
  const answered = questions.filter((question) => question.answer.length).length;
  const sourceTitle = isEntJunyi ? "《耳鼻咽喉科学习题集》" : isDermatology ? "《皮肤性病学学习指导与习题集》" : baseName;
  const edition = isEntJunyi ? "2003年1月第1版 · 配套《耳鼻咽喉科学》第五版" : isDermatology ? "第2版" : "";
  const author = isEntJunyi ? "叶青、赵舒薇、廖建春 主编" : "";
  const groupName = isEntJunyi ? "耳鼻咽喉科学 · 军医" : isDermatology ? "皮肤性病学 · 人卫第2版" : "MinerU 导入";
  const publisher = isEntJunyi ? "人民军医出版社" : isDermatology ? "人民卫生出版社" : "原资料权利人";
  return {
    name: `${baseName} · MinerU导入`,
    description: [
      `直接读取 MinerU Hybrid JSON，共保留 ${questions.length} 道结构完整客观题；已关联答案 ${answered} 道，待核对 ${questions.length - answered} 道。`,
      `章节与题量：${chapterSummary(questions)}`,
      "无答案的题目不会被丢弃，可在刷题纠错中补录；OCR 文字与答案仍须对照原书抽查。",
    ].join("\n"),
    sourceTitle,
    edition,
    author,
    copyrightNotice: `${publisher}资料；仅供资料权利人个人学习，请勿未经授权传播。`,
    groupName,
    questions,
  };
}
