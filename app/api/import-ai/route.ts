import { generateAiText, loadActiveAiConfig, publicAiErrorMessage, resolvePersonalAiConfig } from "@/app/lib/server/ai-providers";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";
import {
  buildMedicalImportPrompt,
  detectMedicalExamProfile,
  extractMedicalAnswerReference,
  parseMedicalAiResponse,
  splitMedicalSourceText,
  type MedicalExamProfile,
} from "@/app/lib/medical-ai-import";
import type { QuizQuestion } from "@/app/lib/question-parser";

function mergeQuestions(questions: QuizQuestion[]) {
  const selected = new Map<string, QuizQuestion>();
  for (const question of questions) {
    const key = `${question.sourceNumber}|${question.stem.replace(/\s+/g, "").slice(0, 120)}`;
    const current = selected.get(key);
    if (!current || (!current.explanation && question.explanation)) selected.set(key, question);
  }
  return [...selected.values()]
    .sort((left, right) => {
      const leftNumber = Number.parseInt(left.sourceNumber.match(/\d+/)?.[0] ?? "", 10);
      const rightNumber = Number.parseInt(right.sourceNumber.match(/\d+/)?.[0] ?? "", 10);
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? leftNumber - rightNumber : 0;
    })
    .map((question, index) => ({ ...question, id: `ai-imported-${Date.now()}-${index + 1}` }));
}

async function recognizeChunk(input: {
  aiConfig: NonNullable<Awaited<ReturnType<typeof loadActiveAiConfig>>>;
  fileName: string;
  category: string;
  profile: MedicalExamProfile;
  chunk: string;
  answerReference: string;
  chunkIndex: number;
  chunkCount: number;
  allowUnanswered: boolean;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const content = await generateAiText(input.aiConfig, buildMedicalImportPrompt(input), {
      maxTokens: input.profile === "western-medicine-306" ? 16_000 : 10_000,
      temperature: 0,
      signal: controller.signal,
    });
    return parseMedicalAiResponse(content, input.category, input.profile, { allowUnanswered: input.allowUnanswered });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  if (!allowRequest(`ai-import:${requestFingerprint(request)}`, 8, 60 * 60_000)) {
    return Response.json({ error: "AI 文件识别请求过于频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await request.json() as { fileName?: unknown; text?: unknown; personalAi?: unknown };
  const personalRequested = body.personalAi !== undefined;
  const personalConfig = resolvePersonalAiConfig(body.personalAi);
  if (personalRequested && !personalConfig) return Response.json({ error: "个人 AI 配置无效，请回到“自定义AI”重新保存。" }, { status: 400 });
  const aiConfig = personalConfig ?? await loadActiveAiConfig();
  if (!aiConfig) return Response.json({ error: "尚未配置 AI。你可以从首页左下角进入“自定义AI”，填写自己的 API Key，无需管理员批准。" }, { status: 503 });

  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 180) : "导入题库";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 480_000) : "";
  if (text.length < 20) return Response.json({ error: "文件中没有足够的可识别文字。" }, { status: 400 });
  const category = fileName.replace(/\.(doc|docx|pdf)$/i, "") || "AI 整理题库";
  const profile = detectMedicalExamProfile(fileName, text);
  const allowUnanswered = profile === "western-medicine-306";
  // 306 papers are dense: a short source fragment can expand to many JSON records.
  // Smaller overlapping fragments prevent a single model response from truncating after ~60 questions.
  const chunks = profile === "western-medicine-306"
    ? splitMedicalSourceText(text, 8_500, 42)
    : splitMedicalSourceText(text, 18_000, 24);
  const answerReference = extractMedicalAnswerReference(text);
  const questions: QuizQuestion[] = [];
  const warnings: string[] = [];
  let discarded = 0;

  // Two concurrent fragments keep long scanned books practical without flooding a personal API account.
  for (let offset = 0; offset < chunks.length; offset += 2) {
    const batch = chunks.slice(offset, offset + 2);
    const settled = await Promise.allSettled(batch.map((chunk, batchIndex) => recognizeChunk({
      aiConfig,
      fileName,
      category,
      profile,
      chunk,
      answerReference,
      chunkIndex: offset + batchIndex,
      chunkCount: chunks.length,
      allowUnanswered,
    })));
    settled.forEach((result, batchIndex) => {
      const part = offset + batchIndex + 1;
      if (result.status === "fulfilled") {
        questions.push(...result.value.questions);
        discarded += result.value.discarded;
      } else {
        warnings.push(`第 ${part}/${chunks.length} 段未完成：${publicAiErrorMessage(result.reason, aiConfig.apiKey)}`);
      }
    });
  }

  const merged = mergeQuestions(questions);
  if (!merged.length) {
    const detail = warnings[0] ? ` ${warnings[0]}` : "";
    return Response.json({ error: `AI 仍未找到带有明确答案的完整题目，请检查文件或 OCR 质量后重试。${detail}` }, { status: 422 });
  }
  return Response.json({
    questions: merged,
    report: {
      profile,
      chunks: chunks.length,
      successfulChunks: chunks.length - warnings.length,
      discarded,
      warnings,
      answerCoverage: merged.length,
      answeredCount: merged.filter((question) => question.answer.length).length,
      pendingAnswerCount: merged.filter((question) => !question.answer.length).length,
      expectedQuestionCount: profile === "western-medicine-306" ? 165 : undefined,
      missingSourceNumbers: profile === "western-medicine-306"
        ? Array.from({ length: 165 }, (_, index) => String(index + 1)).filter((number) => !merged.some((question) => question.sourceNumber === number))
        : [],
    },
  });
}
