import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

export async function DELETE(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  await query("DELETE FROM users WHERE id = $1", [session.userId]);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
