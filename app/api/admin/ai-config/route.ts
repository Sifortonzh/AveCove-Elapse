import { NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/server/admin";
import { findProvider, providerPresets, type ProviderId } from "@/app/lib/ai-catalog";
import { loadActiveAiConfig, readStoredAiConfig, type StoredAiConfig } from "@/app/lib/server/ai-providers";
import { query } from "@/app/lib/server/db";
import { encryptSecret } from "@/app/lib/server/secrets";

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "无管理权限。" }, { status: 401 });
  try {
    const stored = await readStoredAiConfig();
    const active = await loadActiveAiConfig();
    return NextResponse.json({
      providers: providerPresets,
      config: stored ? {
        provider: stored.provider,
        baseUrl: stored.baseUrl,
        model: stored.model,
        hasApiKey: Boolean(stored.apiKeyCipher),
        source: "database",
      } : active ? {
        provider: active.provider,
        baseUrl: active.baseUrl,
        model: active.model,
        hasApiKey: true,
        source: active.source,
      } : null,
    });
  } catch {
    return NextResponse.json({ error: "AI 配置暂时无法读取，请确认数据库迁移已完成。" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "无管理权限。" }, { status: 401 });
  const body = await request.json() as { provider?: ProviderId; baseUrl?: string; model?: string; apiKey?: string };
  const provider = findProvider(String(body.provider ?? ""));
  const baseUrl = String(body.baseUrl ?? "").trim().replace(/\/+$/, "");
  const model = String(body.model ?? "").trim();
  const apiKey = String(body.apiKey ?? "").trim();

  if (!provider) return NextResponse.json({ error: "请选择受支持的 AI 厂商。" }, { status: 400 });
  if (!validEndpoint(baseUrl)) return NextResponse.json({ error: "接口地址必须是有效的 HTTPS 地址。" }, { status: 400 });
  if (!model || model.length > 160) return NextResponse.json({ error: "请填写有效的模型名称或接入点 ID。" }, { status: 400 });

  try {
    const previous = await readStoredAiConfig();
    const apiKeyCipher = apiKey ? encryptSecret(apiKey) : previous?.apiKeyCipher;
    if (!apiKeyCipher) return NextResponse.json({ error: "首次配置必须填写 API Key。" }, { status: 400 });
    const value: StoredAiConfig = { provider: provider.id, baseUrl, model, apiKeyCipher };
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('ai_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(value)],
    );
    return NextResponse.json({ ok: true, message: `${provider.name} 已接入，“知微”可以开始工作了 ✨` });
  } catch {
    return NextResponse.json({ error: "保存失败，请检查数据库与 CONFIG_ENCRYPTION_KEY。" }, { status: 503 });
  }
}
