import { deriveVisitorId, readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { requestFingerprint } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI 解析尚未启用。配置 OpenAI API 密钥后即可按需生成解析。" }, { status: 503 });
  }

  const dailyLimit = Math.max(1, Number(process.env.AI_DAILY_LIMIT || 20));
  const session = readSession(request);
  const quotaId = session?.userId ?? deriveVisitorId(requestFingerprint(request));
  try {
    const usage = await query<{ request_count: number }>(
      `INSERT INTO ai_usage (user_id, usage_day, request_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, usage_day) DO UPDATE
       SET request_count = ai_usage.request_count + 1
       WHERE ai_usage.request_count < $2
       RETURNING request_count`,
      [quotaId, dailyLimit],
    );
    if (!usage[0]) return Response.json({ error: `今天的 AI 伴学额度已用完（${dailyLimit} 次），明天再继续吧 🌙` }, { status: 429 });
  } catch {
    return Response.json({ error: "AI 额度服务暂时不可用，请稍后重试。" }, { status: 503 });
  }

  const body = await request.json() as {
    question?: { stem?: string; options?: Array<{ label: string; text: string }>; answer?: string[] };
    mode?: "summary" | "pitfall" | "companion";
    followUp?: string;
    history?: Array<{ role?: "user" | "assistant"; text?: string }>;
  };
  const question = body.question;
  if (!question?.stem || !question.options?.length || !question.answer?.length) {
    return Response.json({ error: "题目信息不完整。" }, { status: 400 });
  }

  const modeInstruction = {
    summary: "以“大神总结”的风格：先用一句话给出核心判断，再分点解释正确答案与关键鉴别，最后给一个便于记忆的短句。",
    pitfall: "以“易错提示”的风格：定位题干中的陷阱词、最相似的干扰项和做错的常见原因，并给出下一次识别方法。",
    companion: "以“AI我在”的风格：像耐心的学习搭档一样换一种通俗方式讲解，用一个简短类比帮助理解，并邀请学习者继续追问。",
  }[body.mode ?? "summary"];

  const prompt = [
    "你是一名谨慎、清晰的医学考试辅导老师。请用简体中文解析下面的医学题目。",
    modeInstruction,
    "以题库答案为起点核对逻辑。若题目或答案可能陈旧、有歧义或与现行指南不一致，必须明确指出，不要把题库答案说成绝对正确。",
    "内容仅用于学习，不给出针对个人的诊断或治疗建议。回答控制在 500 字以内，结构清楚。",
    `题目：${question.stem}`,
    ...question.options.map((option) => `${option.label}. ${option.text}`),
    `题库答案：${question.answer.join("、")}`,
    ...(body.history ?? []).slice(-6).map((message) => `${message.role === "assistant" ? "学习助理" : "学习者"}：${String(message.text ?? "").slice(0, 500)}`),
    body.followUp ? `学习者继续追问：${String(body.followUp).slice(0, 500)}` : "",
    body.followUp ? "请直接回应这次追问，并与前文保持一致；不需要重复整道题的完整解析。" : "",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        input: prompt,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
        store: false,
      }),
    });
    const data = await response.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
    const explanation = data.output_text || data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    return Response.json({ explanation: explanation || "AI 未返回可显示的解析。" });
  } catch {
    return Response.json({ error: "AI 解析暂时生成失败，请稍后重试。" }, { status: 502 });
  }
}
