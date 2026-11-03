import { verifiedAiAccount } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { decryptSecret, encryptSecret } from "@/app/lib/server/secrets";
import { resolvePersonalAiConfig, type ActiveAiConfig, type StoredAiConfig } from "@/app/lib/server/ai-providers";

type Account = NonNullable<ReturnType<typeof verifiedAiAccount>>;

export function aiAccountError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function requireAiAccount(request: Request, checkScope = false) {
  const account = verifiedAiAccount(request);
  if (!account) return aiAccountError(401, "请先通过邮箱验证码登录，再使用个人 AI。");
  if (checkScope && request.headers.get("x-elapse-ai-scope") !== account.scope) {
    return aiAccountError(409, "登录身份已变化，请刷新自定义 AI 页面后重试。");
  }
  return account;
}

export async function readAccountAi(account: Account) {
  const rows = await query<{ value: StoredAiConfig }>(
    `SELECT settings.value FROM user_ai_settings AS settings
     JOIN users ON users.id = settings.user_id AND users.email = settings.verified_email
     WHERE settings.user_id = $1 AND settings.verified_email = $2`,
    [account.userId, account.email],
  );
  return rows[0]?.value ?? null;
}

export async function loadRequestAiConfig(request: Request): Promise<ActiveAiConfig | Response> {
  const account = requireAiAccount(request);
  if (account instanceof Response) return account;
  if (request.headers.get("x-elapse-account-id") !== account.userId) {
    return aiAccountError(409, "登录身份已变化，请刷新当前页面后再使用 AI。");
  }
  try {
    const stored = await readAccountAi(account);
    if (!stored) return aiAccountError(412, "当前账号没有配置 AI，请到“自定义 AI”保存自己的 API Key。");
    return { provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, apiKey: decryptSecret(stored.apiKeyCipher), source: "personal" };
  } catch {
    return aiAccountError(503, "暂时无法读取个人 AI 配置，请稍后重试。");
  }
}

export async function resolveAccountAiInput(account: Account, input: unknown) {
  if (!input || typeof input !== "object") return null;
  const data = input as { provider?: unknown; baseUrl?: unknown; model?: unknown; apiKey?: unknown };
  if (typeof data.apiKey === "string" && data.apiKey.trim()) return resolvePersonalAiConfig(data);
  const saved = await readAccountAi(account);
  if (!saved || saved.provider !== data.provider) return null;
  return resolvePersonalAiConfig({ ...data, apiKey: decryptSecret(saved.apiKeyCipher) });
}

export async function writeAccountAi(account: Account, config: ActiveAiConfig) {
  const stored: StoredAiConfig = {
    provider: config.provider, baseUrl: config.baseUrl, model: config.model, apiKeyCipher: encryptSecret(config.apiKey),
  };
  const rows = await query(
    `INSERT INTO user_ai_settings (user_id, verified_email, value)
     SELECT id, email, $3::jsonb FROM users WHERE id = $1 AND email = $2
     ON CONFLICT (user_id, verified_email) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING user_id`,
    [account.userId, account.email, JSON.stringify(stored)],
  );
  return rows.length > 0;
}

export async function deleteAccountAi(account: Account) {
  await query("DELETE FROM user_ai_settings WHERE user_id = $1 AND verified_email = $2", [account.userId, account.email]);
}
