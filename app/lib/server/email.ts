import nodemailer from "nodemailer";
import { smtpConfig } from "./smtp-config";

type SmtpDeliveryError = Error & {
  code?: string;
  command?: string;
  responseCode?: number;
};

export async function sendLoginCode(email: string, code: string) {
  if (process.env.NODE_ENV !== "production" && (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)) return { delivered: false, debugCode: code };
  const config = smtpConfig(process.env);
  const transporter = nodemailer.createTransport(config);
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `红豆生南国 <${config.auth.user}>`,
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
