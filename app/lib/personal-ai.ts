import type { ProviderId } from "@/app/lib/ai-catalog";

export const PERSONAL_AI_STORAGE_KEY = "avecove-personal-ai";

export type PersonalAiConfig = {
  provider: Exclude<ProviderId, "custom">;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function readPersonalAiConfig(): PersonalAiConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(PERSONAL_AI_STORAGE_KEY) ?? "null") as Partial<PersonalAiConfig> | null;
    if (!value?.provider || !value.baseUrl || !value.model || !value.apiKey) return null;
    return value as PersonalAiConfig;
  } catch {
    return null;
  }
}

export function savePersonalAiConfig(config: PersonalAiConfig) {
  window.localStorage.setItem(PERSONAL_AI_STORAGE_KEY, JSON.stringify(config));
}

export function clearPersonalAiConfig() {
  window.localStorage.removeItem(PERSONAL_AI_STORAGE_KEY);
}
