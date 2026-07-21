import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能举报。" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { reason?: string };
  await query("INSERT INTO comment_reports (comment_id, user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, session.userId, String(body.reason ?? "内容不当").slice(0, 120)]);
  const [row] = await query<{ reports: number }>("SELECT COUNT(*)::int AS reports FROM comment_reports WHERE comment_id = $1", [id]);
  if ((row?.reports ?? 0) >= 3) await query("UPDATE comments SET status = 'pending', moderation_reason = '收到 3 次以上举报', updated_at = NOW() WHERE id = $1", [id]);
  return NextResponse.json({ ok: true, message: "已收到举报，感谢一起维护讨论区 🛡️" });
}
