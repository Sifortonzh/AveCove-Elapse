import { buildEnglishImportPrompt, parseEnglishAiResponse } from "@/app/lib/english-ai-import";
import { generateAiText, loadActiveAiConfig, publicAiErrorMessage, resolvePersonalAiConfig } from "@/app/lib/server/ai-providers";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

export const maxDuration = 240;

export async function POST(request: Request) {
  if (!allowRequest(`english-ai-import:${requestFingerprint(request)}`, 12, 60 * 60_000)) {
    return Response.json({ error: "English AI import requests are temporarily limited. Please try again later." }, { status: 429 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 450_000) {
    return Response.json({ error: "The extracted exam text is too large. Split the paper or analysis file and try again." }, { status: 413 });
  }
  let body: {
    sourceFileName?: unknown;
    sourceText?: unknown;
    answerFileName?: unknown;
    answerText?: unknown;
    usedOcr?: unknown;
    personalAi?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "The English import request is not valid JSON." }, { status: 400 });
  }

  const personalRequested = body.personalAi !== undefined;
  const personalConfig = resolvePersonalAiConfig(body.personalAi);
  if (personalRequested && !personalConfig) {
    return Response.json({ error: "Your personal AI configuration is invalid. Open Custom AI, test it, and save it again." }, { status: 400 });
  }
  const aiConfig = personalConfig ?? await loadActiveAiConfig();
  if (!aiConfig) {
    return Response.json({
      error: "English imports require AI. Configure a personal provider in Custom AI (no administrator approval needed), then retry.",
    }, { status: 503 });
  }

  const sourceFileName = typeof body.sourceFileName === "string" ? body.sourceFileName.trim().slice(0, 180) : "";
  const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim().slice(0, 90_000) : "";
  const answerFileName = typeof body.answerFileName === "string" ? body.answerFileName.trim().slice(0, 180) : undefined;
  const answerText = typeof body.answerText === "string" ? body.answerText.trim().slice(0, 90_000) : undefined;
  if (!sourceFileName || sourceText.replace(/\s/g, "").length < 30) {
    return Response.json({ error: "The source paper does not contain enough readable text." }, { status: 400 });
  }

  const input = { sourceFileName, sourceText, answerFileName, answerText, usedOcr: Boolean(body.usedOcr) };
  const prompt = buildEnglishImportPrompt(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 210_000);
  try {
    const content = await generateAiText(aiConfig, prompt, {
      maxTokens: 16_000,
      temperature: 0,
      signal: controller.signal,
    });
    const test = parseEnglishAiResponse(content, input);
    const totalQuestions = test.sections.reduce((total, section) => total + section.questions.length, 0);
    const answeredQuestions = test.sections.reduce(
      (total, section) => total + section.questions.filter((question) => Boolean(question.answer)).length,
      0,
    );
    return Response.json({
      test,
      report: {
        sections: test.sections.length,
        totalQuestions,
        answeredQuestions,
        answerCoverage: totalQuestions ? Math.round(answeredQuestions / totalQuestions * 100) : 0,
        warnings: test.aiWarnings ?? [],
      },
    });
  } catch (error) {
    const detail = error instanceof SyntaxError ? "AI returned malformed structured data." : publicAiErrorMessage(error, aiConfig.apiKey);
    return Response.json({ error: `English AI import failed: ${detail}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
