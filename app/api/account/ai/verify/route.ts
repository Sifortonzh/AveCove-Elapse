import { NextResponse } from "next/server";
import { aiAccountError } from "@/app/lib/server/account-ai";
import { createSessionToken, readSession, SESSION_COOKIE } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { consumeEmailCode, issueEmailCode } from "@/app/lib/server/login-code";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return aiAccountError(401, "请先登录 Elapse。");
  const body = await request.json().catch(() => null) as { action?: unknown; code?: unknown } | null;
  if (body?.action !== "send" && body?.action !== "verify") return aiAccountError(400, "验证码请求格式不正确。");
  try {
    const [user] = await query<{ email: string | null }>("SELECT email FROM users WHERE id = $1", [session.userId]);
    if (!user?.email) return aiAccountError(412, "当前账号尚未绑定邮箱，请从首页的同步身份窗口重新登录并绑定邮箱。");
    const email = user.email;
    if (body.action === "send") {
      if (!allowRequest(`ai-verify-send:${session.userId}`, 3, 15 * 60_000) ||
          !allowRequest(`ai-verify-ip:${requestFingerprint(request)}`, 5, 15 * 60_000)) {
        return aiAccountError(429, "验证码请求过于频繁，请稍后再试。");
      }
      const delivery = await issueEmailCode(email);
      return NextResponse.json({ message: "验证码已发送至当前账号绑定的邮箱，请查收。📮", ...("debugCode" in delivery ? { debugCode: delivery.debugCode } : {}) });
    }
    if (typeof body.code !== "string" || !await consumeEmailCode(email, body.code.trim())) return aiAccountError(401, "验证码不正确或已过期。");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken({ ...session, email, emailVerified: true }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return aiAccountError(503, "邮箱验证暂时不可用，请稍后再试。");
  }
}
