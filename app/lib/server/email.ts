import nodemailer from "nodemailer";

type SmtpDeliveryError = Error & {
  code?: string;
  command?: string;
  responseCode?: number;
};

export async function sendLoginCode(email: string, code: string) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    if (process.env.NODE_ENV !== "production") return { delivered: false, debugCode: code };
    throw new Error("邮箱验证码服务尚未配置");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      minVersion: "TLSv1.2",
      servername: host,
    },
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `红豆生南国 <${user}>`,
      to: email,
      subject: "红豆生南国登录验证码",
      text: `你的登录验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略本邮件。`,
    });
    return { delivered: true };
  } catch (error) {
    const smtpError = error as SmtpDeliveryError;
    console.error("[smtp] delivery failed", {
      code: smtpError.code,
      command: smtpError.command,
      responseCode: smtpError.responseCode,
    });
    throw new Error("邮箱验证码发送失败，请稍后重试或联系管理员检查 SMTP 配置");
  } finally {
    transporter.close();
  }
}
