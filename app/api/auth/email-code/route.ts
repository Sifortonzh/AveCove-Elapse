import { NextResponse } from "next/server";
import { issueEmailCode } from "@/app/lib/server/login-code";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`email-code:${fingerprint}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "验证码请求过于频繁，请稍后再试。" }, { status: 429 });
  }
  try {
    const { email: rawEmail } = await request.json() as { email?: string };
    const email = String(rawEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      return NextResponse.json({ error: "请输入有效邮箱地址。" }, { status: 400 });
    }
    const delivery = await issueEmailCode(email);
    return NextResponse.json({ ok: true, message: "验证码已发送，10 分钟内有效。如未收到，请检查垃圾邮件 / Spam 文件夹。📮", ...("debugCode" in delivery ? { debugCode: delivery.debugCode } : {}) });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("邮箱验证码") ? error.message : "暂时无法发送验证码，请稍后再试。";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
