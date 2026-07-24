import { buildMedicalAnswerPrompt, parseMedicalAnswerResponse } from "@/app/lib/medical-ai-import";
import type { QuizQuestion } from "@/app/lib/question-parser";
import { generateAiText, loadActiveAiConfig, publicAiErrorMessage, resolvePersonalAiConfig } from "@/app/lib/server/ai-providers";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  if (!allowRequest(`ai-answer-import:${requestFingerprint(request)}`, 12, 60 * 60_000)) {
    return Response.json({ error: "答案关联请求过于频繁，请稍后再试。" }, { status: 429 });
  }
  const body = await request.json() as {
    fileName?: unknown;
    text?: unknown;
    questions?: unknown;
    personalAi?: unknown;
  };
  const personalRequested = body.personalAi !== undefined;
  const personalConfig = resolvePersonalAiConfig(body.personalAi);
  if (personalRequested && !personalConfig) return Response.json({ error: "个人 AI 配置无效，请重新保存。" }, { status: 400 });
  const aiConfig = personalConfig ?? await loadActiveAiConfig();
  if (!aiConfig) return Response.json({ error: "请先在“自定义AI”中配置可用的模型。" }, { status: 503 });

  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 180) : "答案文件";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 480_000) : "";
  const rawQuestions = Array.isArray(body.questions) ? body.questions.slice(0, 500) : [];
  const questions: QuizQuestion[] = rawQuestions.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as Partial<QuizQuestion>;
    if (!candidate.sourceNumber || !candidate.stem || !Array.isArray(candidate.options) || candidate.options.length < 2) return [];
    return [{
      id: String(candidate.id || `target-${index}`),
      sourceNumber: String(candidate.sourceNumber),
      category: String(candidate.category || "待关联题库"),
      stem: String(candidate.stem).slice(0, 1_500),
      options: candidate.options.slice(0, 8).flatMap((option) =>
        option && typeof option.label === "string" && typeof option.text === "string"
          ? [{ label: option.label.slice(0, 1), text: option.text.slice(0, 800) }]
          : []),
      answer: [],
      answerPending: true,
      multiple: candidate.questionType === "X",
      questionType: candidate.questionType,
    } satisfies QuizQuestion];
  });
  if (text.length < 10 || !questions.length) return Response.json({ error: "答案文件或目标题库信息不完整。" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const content = await generateAiText(aiConfig, buildMedicalAnswerPrompt({
      fileName,
      answerText: text,
      questions,
    }), { maxTokens: 16_000, temperature: 0, signal: controller.signal });
    const answers = parseMedicalAnswerResponse(content, questions);
    if (!answers.length) return Response.json({ error: "没有从答案文件中找到可与当前题号对应的明确答案。" }, { status: 422 });
    return Response.json({ answers, matched: answers.length, pending: Math.max(0, questions.length - answers.length) });
  } catch (error) {
    return Response.json({ error: `答案关联失败：${publicAiErrorMessage(error, aiConfig.apiKey)}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
