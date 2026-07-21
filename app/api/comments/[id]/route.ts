import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await params;
  const rows = await query<{ id: string }>("DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id", [id, session.userId]);
  return rows[0] ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "只能删除自己的评论。" }, { status: 403 });
}
