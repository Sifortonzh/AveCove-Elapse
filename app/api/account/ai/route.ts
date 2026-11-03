import { aiAccountError, deleteAccountAi, readAccountAi, requireAiAccount, resolveAccountAiInput, writeAccountAi } from "@/app/lib/server/account-ai";

function reply(value: object) {
  return Response.json(value, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const account = requireAiAccount(request);
  if (account instanceof Response) return account;
  try {
    const saved = await readAccountAi(account);
    return reply({
      scope: account.scope,
      config: saved ? { provider: saved.provider, model: saved.model, hasKey: true } : null,
    });
  } catch {
    return aiAccountError(503, "暂时无法读取个人 AI 配置。");
  }
}

export async function PUT(request: Request) {
  const account = requireAiAccount(request, true);
  if (account instanceof Response) return account;
  try {
    const config = await resolveAccountAiInput(account, await request.json().catch(() => null));
    if (!config) return aiAccountError(400, "请检查厂商、模型和个人 API Key；更换厂商时须填新 Key。");
    if (!await writeAccountAi(account, config)) return aiAccountError(409, "邮箱绑定已变化，请重新验证邮箱。");
    return reply({ config: { provider: config.provider, model: config.model, hasKey: true } });
  } catch {
    return aiAccountError(503, "暂时无法保存个人 AI 配置。");
  }
}

export async function DELETE(request: Request) {
  const account = requireAiAccount(request, true);
  if (account instanceof Response) return account;
  try {
    await deleteAccountAi(account);
    return reply({ ok: true });
  } catch {
    return aiAccountError(503, "暂时无法清除个人 AI 配置。");
  }
}
