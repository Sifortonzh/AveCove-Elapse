import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能点赞。" }, { status: 401 });
  const { id } = await params;
  await query("INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, session.userId]);
  const [row] = await query<{ likes: number }>("SELECT COUNT(*)::int AS likes FROM comment_likes WHERE comment_id = $1", [id]);
  return NextResponse.json({ ok: true, likes: row?.likes ?? 0 });
}
