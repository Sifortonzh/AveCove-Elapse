import nodemailer from "nodemailer";

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
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `红豆生南国 <${user}>`,
    to: email,
    subject: "红豆生南国登录验证码",
    text: `你的登录验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略本邮件。`,
  });
  return { delivered: true };
}
