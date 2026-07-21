import { NextResponse } from "next/server";
import {
  SESSION_COOKIE, createSessionToken, deriveUserId, hashLoginCode, normalizeStudentId,
  publicSession, readSession, validateStudentId, type SessionUser,
} from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

type UserRow = { id: string; email: string | null; nickname: string };

async function verifyEmailCode(email: string, code: string) {
  const rows = await query<{ code_hash: string; expires_at: Date; attempts: number }>(
    "SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = $1",
    [email],
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) return false;
  await query("UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1", [email]);
  if (row.code_hash !== hashLoginCode(email, code)) return false;
  await query("DELETE FROM login_codes WHERE email = $1", [email]);
  return true;
}

function sessionResponse(user: UserRow) {
  const session: Omit<SessionUser, "expiresAt"> = { userId: user.id, nickname: user.nickname, ...(user.email ? { email: user.email } : {}) };
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
      if (!code || !(await verifyEmailCode(email, code))) return NextResponse.json({ error: "邮箱验证码无效或已过期。" }, { status: 401 });
      const users = await query<UserRow>("SELECT id, email, nickname FROM users WHERE email = $1", [email]);
      if (!users[0]) return NextResponse.json({ error: "该邮箱尚未绑定学号，请先使用学号建立同步身份。" }, { status: 404 });
      await query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [users[0].id]);
      return sessionResponse(users[0]);
    }

    if (!validateStudentId(studentId)) {
      return NextResponse.json({ error: "学号需为 4–32 位数字、字母、短横线或下划线。" }, { status: 400 });
    }
    if (email && (!code || !(await verifyEmailCode(email, code)))) {
      return NextResponse.json({ error: "绑定邮箱前，请先获取并填写验证码。" }, { status: 401 });
    }

    const userId = deriveUserId(studentId);
    const users = await query<UserRow>(
      `INSERT INTO users (id, email, nickname, last_seen_at)
       VALUES ($1, NULLIF($2, ''), $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
         nickname = EXCLUDED.nickname,
         last_seen_at = NOW()
       RETURNING id, email, nickname`,
      [userId, email, nickname],
    );
    return sessionResponse(users[0]);
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
