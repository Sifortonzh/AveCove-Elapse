import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { hashLoginCode } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { sendLoginCode } from "@/app/lib/server/email";
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
    const code = String(randomInt(100000, 1000000));
    await query(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, NOW())
       ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = NOW()`,
      [email, hashLoginCode(email, code)],
    );
    const delivery = await sendLoginCode(email, code);
    return NextResponse.json({ ok: true, message: "验证码已发送，10 分钟内有效。", ...("debugCode" in delivery ? { debugCode: delivery.debugCode } : {}) });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("邮箱验证码") ? error.message : "暂时无法发送验证码，请稍后再试。";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
