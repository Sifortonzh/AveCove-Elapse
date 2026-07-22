import { query } from "@/app/lib/server/db";
import { decryptSecret } from "@/app/lib/server/secrets";
import { findProvider, type ProviderId } from "@/app/lib/ai-catalog";

export type StoredAiConfig = {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKeyCipher: string;
};

export type ActiveAiConfig = Omit<StoredAiConfig, "apiKeyCipher"> & { apiKey: string; source: "database" | "environment" | "personal" };

export function resolvePersonalAiConfig(input: unknown): ActiveAiConfig | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { provider?: unknown; baseUrl?: unknown; model?: unknown; apiKey?: unknown };
  const provider = findProvider(String(value.provider ?? ""));
  if (!provider || provider.id === "custom") return null;
  const baseUrl = cleanBaseUrl(String(value.baseUrl ?? ""));
  const model = String(value.model ?? "").trim();
  const apiKey = String(value.apiKey ?? "").trim();
  if (baseUrl !== cleanBaseUrl(provider.baseUrl) || !model || model.length > 160 || apiKey.length < 8 || apiKey.length > 1000) return null;
  return { provider: provider.id, baseUrl, model, apiKey, source: "personal" };
}

export async function readStoredAiConfig() {
  const rows = await query<{ value: StoredAiConfig }>("SELECT value FROM app_settings WHERE key = 'ai_config' LIMIT 1");
  return rows[0]?.value ?? null;
}

export async function loadActiveAiConfig(): Promise<ActiveAiConfig | null> {
  try {
    const stored = await readStoredAiConfig();
    if (stored?.apiKeyCipher) {
      return { provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, apiKey: decryptSecret(stored.apiKeyCipher), source: "database" };
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("Unable to load database AI config", error);
  }

  if (!process.env.OPENAI_API_KEY) return null;
  return {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    apiKey: process.env.OPENAI_API_KEY,
    source: "environment",
  };
}

function cleanBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

type ProviderPayload = {
  error?: { message?: string } | string;
  message?: string;
  choices?: Array<{ message?: { content?: string } }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  content?: Array<{ type?: string; text?: string }>;
};

async function readProviderPayload(response: Response) {
  const text = await response.text();
  if (!text) return {} as ProviderPayload;
  try {
    return JSON.parse(text) as ProviderPayload;
  } catch {
    if (!response.ok) throw new Error(`AI 厂商返回了无法识别的错误（HTTP ${response.status}）`);
    throw new Error("AI 厂商返回的内容不是有效 JSON");
  }
}

function providerError(payload: ProviderPayload, response: Response) {
  const detail = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message;
  return String(detail || `AI 厂商请求失败（HTTP ${response.status}）`).slice(0, 360);
}

export function publicAiErrorMessage(error: unknown, apiKey = "") {
  if (error instanceof DOMException && error.name === "AbortError") return "AI 厂商响应超时，请检查网络、模型名称与账户额度后重试。";
  const raw = error instanceof Error ? error.message : "AI 厂商没有返回有效响应。";
  const withoutKey = apiKey ? raw.split(apiKey).join("[已隐藏]") : raw;
  return withoutKey
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[已隐藏]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, "[已隐藏]")
    .slice(0, 300);
}

export async function generateAiText(config: ActiveAiConfig, prompt: string, options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}) {
  const preset = findProvider(config.provider);
  if (!preset) throw new Error("Unsupported AI provider");
  const baseUrl = cleanBaseUrl(config.baseUrl);
  const maxTokens = Math.max(200, Math.min(options.maxTokens ?? 900, 8000));
  const temperature = options.temperature ?? 0.2;

  if (preset.protocol === "gemini") {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      signal: options.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } }),
    });
    const data = await readProviderPayload(response);
    if (!response.ok) throw new Error(providerError(data, response));
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || "";
  }

  if (preset.protocol === "anthropic") {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      signal: options.signal,
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await readProviderPayload(response);
    if (!response.ok) throw new Error(providerError(data, response));
    return data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("").trim() || "";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens, stream: false }),
  });
  const data = await readProviderPayload(response);
  if (!response.ok) throw new Error(providerError(data, response));
  return data.choices?.[0]?.message?.content?.trim() || "";
}
