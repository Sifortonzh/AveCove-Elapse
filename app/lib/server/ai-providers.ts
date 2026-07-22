import { query } from "@/app/lib/server/db";
import { decryptSecret } from "@/app/lib/server/secrets";
import { findProvider, type ProviderId } from "@/app/lib/ai-catalog";

export type StoredAiConfig = {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKeyCipher: string;
};

export type ActiveAiConfig = Omit<StoredAiConfig, "apiKeyCipher"> & { apiKey: string; source: "database" | "environment" };

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

export async function generateAiText(config: ActiveAiConfig, prompt: string) {
  const preset = findProvider(config.provider);
  if (!preset) throw new Error("Unsupported AI provider");
  const baseUrl = cleanBaseUrl(config.baseUrl);

  if (preset.protocol === "gemini") {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }),
    });
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Gemini request failed");
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || "";
  }

  if (preset.protocol === "anthropic") {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: 900, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Anthropic request failed");
    return data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("").trim() || "";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 900, stream: false }),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "AI provider request failed");
  return data.choices?.[0]?.message?.content?.trim() || "";
}
