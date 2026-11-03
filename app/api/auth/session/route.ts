import { NextResponse } from "next/server";
import {
  SESSION_COOKIE, createSessionToken, deriveUserId, normalizeStudentId,
  publicSession, readSession, validateStudentId, type SessionUser,
} from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";
import { consumeEmailCode } from "@/app/lib/server/login-code";

type UserRow = { id: string; email: string | null; nickname: string };

function sessionResponse(user: UserRow, emailVerified = false) {
  const session: Omit<SessionUser, "expiresAt"> = { userId: user.id, nickname: user.nickname, ...(user.email ? { email: user.email, emailVerified } : {}) };
  const response = NextResponse.json({ ok: true, user: publicSession({ ...session, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 }) });
  response.cookies.set(SESSION_COOKIE, createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

export async function GET(request: Request) {
  const session = readSession(request);
  return NextResponse.json({ user: session ? publicSession(session) : null });
}

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`login:${fingerprint}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: "登录尝试过于频繁，请稍后再试。" }, { status: 429 });
  }
  try {
    const body = await request.json() as { studentId?: string; nickname?: string; email?: string; code?: string };
    const studentId = normalizeStudentId(String(body.studentId ?? ""));
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const nickname = String(body.nickname ?? "红豆同学").trim().slice(0, 20) || "红豆同学";

    if (!studentId && email) {
      if (!code || !(await consumeEmailCode(email, code))) return NextResponse.json({ error: "邮箱验证码无效或已过期。" }, { status: 401 });
      const users = await query<UserRow>("SELECT id, email, nickname FROM users WHERE email = $1", [email]);
      if (!users[0]) return NextResponse.json({ error: "该邮箱尚未绑定学号，请先使用学号建立同步身份。" }, { status: 404 });
      await query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [users[0].id]);
      return sessionResponse(users[0], true);
    }

    if (!validateStudentId(studentId)) {
      return NextResponse.json({ error: "学号需为 4–32 位数字、字母、短横线或下划线。" }, { status: 400 });
    }
    if (email && (!code || !(await consumeEmailCode(email, code)))) {
      return NextResponse.json({ error: "绑定邮箱前，请先获取并填写验证码。" }, { status: 401 });
    }

    const userId = deriveUserId(studentId);
    const users = await query<UserRow>(
      `INSERT INTO users (id, email, nickname, last_seen_at)
       VALUES ($1, NULLIF($2, ''), $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         email = COALESCE(users.email, EXCLUDED.email),
         nickname = EXCLUDED.nickname,
         last_seen_at = NOW()
       WHERE EXCLUDED.email IS NULL OR users.email IS NULL OR users.email = EXCLUDED.email
       RETURNING id, email, nickname`,
      [userId, email, nickname],
    );
    if (!users[0]) return NextResponse.json({ error: "该账号已有绑定邮箱，请用原邮箱验证码登录。" }, { status: 409 });
    return sessionResponse(users[0], Boolean(email));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "该邮箱已绑定另一同步身份。" }, { status: 409 });
    }
    return NextResponse.json({ error: "同步服务暂时不可用，请稍后再试。" }, { status: 503 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
