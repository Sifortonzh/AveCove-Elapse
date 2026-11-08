import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSession, createSessionToken, publicSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

export async function PATCH(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  let body: { nickname?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "昵称格式不正确。" }, { status: 400 }); }
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!nickname || nickname.length > 20 || /[\r\n\u0000-\u001f]/.test(nickname)) return NextResponse.json({ error: "公开昵称需为 1–20 个字符。" }, { status: 400 });
  try {
    const rows = await query<{ avatar_slot: number }>("UPDATE users SET nickname = $2 WHERE id = $1 RETURNING avatar_slot", [session.userId, nickname]);
    if (!rows[0]) return NextResponse.json({ error: "该同步身份已不存在。" }, { status: 401 });
    const user = { ...session, nickname, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 };
    const response = NextResponse.json({ ok: true, user: publicSession(user, rows[0].avatar_slot) });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch { return NextResponse.json({ error: "昵称暂时无法保存，请稍后重试。" }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  await query("DELETE FROM users WHERE id = $1", [session.userId]);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
