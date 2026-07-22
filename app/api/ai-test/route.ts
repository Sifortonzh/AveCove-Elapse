import { NextResponse } from "next/server";
import { findProvider } from "@/app/lib/ai-catalog";
import { generateAiText, publicAiErrorMessage, resolvePersonalAiConfig } from "@/app/lib/server/ai-providers";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { personalAi?: unknown } | null;
  const config = resolvePersonalAiConfig(body?.personalAi);
  if (!config) return NextResponse.json({ error: "个人 AI 配置不完整，请检查厂商、模型与 API Key。" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    await generateAiText(config, "这是一次连接测试。请只回复：连接成功", { maxTokens: 200, temperature: 0, signal: controller.signal });
    const provider = findProvider(config.provider);
    return NextResponse.json({ ok: true, message: `${provider?.name ?? config.provider} · ${config.model} 连接成功，可以开始使用。✅` });
  } catch (error) {
    const detail = error instanceof DOMException && error.name === "AbortError"
      ? "连接测试超过 20 秒，已自动停止。请检查网络、接口地址或模型权限。"
      : publicAiErrorMessage(error, config.apiKey);
    return NextResponse.json({ error: `连接失败：${detail}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
