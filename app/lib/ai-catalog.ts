export type ProviderId = "openai" | "deepseek" | "qwen" | "kimi" | "doubao" | "zhipu" | "gemini" | "anthropic" | "custom";

export type ProviderPreset = {
  id: ProviderId;
  name: string;
  region: "国内" | "海外" | "自定义";
  protocol: "openai-compatible" | "gemini" | "anthropic";
  baseUrl: string;
  model: string;
  note: string;
};

export const providerPresets: ProviderPreset[] = [
  { id: "deepseek", name: "DeepSeek", region: "国内", protocol: "openai-compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", note: "OpenAI 兼容接口" },
  { id: "qwen", name: "通义千问", region: "国内", protocol: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", note: "阿里云百炼兼容接口" },
  { id: "kimi", name: "Kimi", region: "国内", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", note: "Moonshot 兼容接口" },
  { id: "doubao", name: "豆包", region: "国内", protocol: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "请填写推理接入点 ID", note: "火山方舟；模型栏填写接入点 ID" },
  { id: "zhipu", name: "智谱 GLM", region: "国内", protocol: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", note: "智谱开放平台兼容接口" },
  { id: "openai", name: "OpenAI", region: "海外", protocol: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", note: "官方 Chat Completions 接口" },
  { id: "gemini", name: "Google Gemini", region: "海外", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash", note: "Google 原生接口" },
  { id: "anthropic", name: "Anthropic Claude", region: "海外", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-haiku-latest", note: "Anthropic 原生接口" },
  { id: "custom", name: "自定义兼容接口", region: "自定义", protocol: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "your-model", note: "支持私有网关与其他兼容厂商" },
];

export function findProvider(id: string) {
  return providerPresets.find((provider) => provider.id === id);
}
