import { generateAiText, loadActiveAiConfig, publicAiErrorMessage, resolvePersonalAiConfig } from "@/app/lib/server/ai-providers";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";
import type { QuizQuestion } from "@/app/lib/question-parser";

type AiQuestion = {
  sourceNumber?: unknown;
  stem?: unknown;
  options?: unknown;
  answer?: unknown;
};

function parseAiQuestions(content: string, category: string): QuizQuestion[] {
  const fenced = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 没有返回完整 JSON");
  const payload = JSON.parse(fenced.slice(start, end + 1)) as { questions?: AiQuestion[] };
  if (!Array.isArray(payload.questions)) throw new Error("AI 返回的题库结构不完整");

  return payload.questions.slice(0, 300).flatMap((raw, index) => {
    const stem = typeof raw.stem === "string" ? raw.stem.trim() : "";
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    const options = rawOptions.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const option = value as { label?: unknown; text?: unknown };
      const label = String(option.label ?? "").trim().toUpperCase().match(/[A-G]/)?.[0] ?? "";
      const text = typeof option.text === "string" ? option.text.trim() : "";
      return label && text ? [{ label, text }] : [];
    });
    const labels = new Set(options.map((option) => option.label));
    const answerSource = Array.isArray(raw.answer) ? raw.answer.join("") : String(raw.answer ?? "");
    const answer = [...new Set((answerSource.toUpperCase().match(/[A-G]/g) ?? []).filter((label) => labels.has(label)))];
    if (!stem || options.length < 2 || !answer.length) return [];
    return [{
      id: `ai-imported-${Date.now()}-${index}`,
      sourceNumber: String(raw.sourceNumber ?? index + 1),
      category,
      stem,
      options,
      answer,
      multiple: answer.length > 1,
    }];
  });
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
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 100_000) : "";
  if (text.length < 20) return Response.json({ error: "文件中没有足够的可识别文字。" }, { status: 400 });
  const category = fileName.replace(/\.(doc|docx|pdf)$/i, "") || "AI 整理题库";

  const prompt = [
    "你是严谨的考试题库结构化助手。请整理下面从文件中提取的文字，并只返回合法 JSON，不要使用 Markdown 代码块。",
    "返回结构必须是：{\"questions\":[{\"sourceNumber\":\"1\",\"stem\":\"题干\",\"options\":[{\"label\":\"A\",\"text\":\"选项\"}],\"answer\":[\"A\"]}]}。",
    "重点识别文件末尾、章节末尾或单独答案表中的题号与答案，并与前文题目关联。兼容“1-A”“1.A”“1 A”“答案表：1A 2C”等非标准格式。",
    "只能采用文件明确提供的答案，不得自行推测、补写或根据医学常识改答案。无法确定答案的题目不要输出。",
    "保留题目原意与选项，不生成解析。单选 answer 只有一个字母，多选包含多个字母。最多输出 300 道题。",
    `文件名：${fileName}`,
    "文件文字开始：",
    text,
    "文件文字结束。",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const content = await generateAiText(aiConfig, prompt, { maxTokens: 7000, temperature: 0, signal: controller.signal });
    const questions = parseAiQuestions(content, category);
    if (!questions.length) return Response.json({ error: "AI 仍未找到带有明确答案的完整题目，请检查文件或拆分后重试。" }, { status: 422 });
    return Response.json({ questions });
  } catch (error) {
    return Response.json({ error: `AI 文件识别失败：${publicAiErrorMessage(error, aiConfig.apiKey)}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
