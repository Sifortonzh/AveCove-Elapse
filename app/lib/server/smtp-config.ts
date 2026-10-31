export function smtpConfig(env: Record<string, string | undefined>) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass?.trim()) throw new Error("邮箱验证码服务尚未配置：请管理员填写 SMTP_HOST、SMTP_USER 和 SMTP_PASS（邮箱授权码）");
  const port = Number(env.SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("邮箱验证码服务配置错误：SMTP_PORT 必须是有效端口");
  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase();
  if (secureSetting && !["true", "false"].includes(secureSetting)) throw new Error("邮箱验证码服务配置错误：SMTP_SECURE 只能为 true 或 false");
  const secure = secureSetting ? secureSetting === "true" : port === 465;
  return { host, port, secure, requireTLS: !secure, auth: { user, pass },
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" as const, servername: host } };
}
