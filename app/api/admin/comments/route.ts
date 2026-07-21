import { NextResponse } from "next/server";
import { query } from "@/app/lib/server/db";

function authorized(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "无管理权限。" }, { status: 401 });
  const rows = await query(
    `SELECT c.id, c.question_id, c.nickname, c.body, c.status, c.moderation_reason, c.created_at,
      COUNT(r.comment_id)::int AS reports
     FROM comments c LEFT JOIN comment_reports r ON r.comment_id = c.id
     GROUP BY c.id ORDER BY (c.status = 'pending') DESC, c.created_at DESC LIMIT 200`,
  );
  return NextResponse.json({ comments: rows });
}

export async function PATCH(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "无管理权限。" }, { status: 401 });
  const body = await request.json() as { commentId?: string; action?: "publish" | "hide" | "mute"; days?: number };
  const commentId = String(body.commentId ?? "");
  if (!commentId || !["publish", "hide", "mute"].includes(String(body.action))) return NextResponse.json({ error: "管理操作无效。" }, { status: 400 });
  if (body.action === "mute") {
    const days = Math.min(365, Math.max(1, Number(body.days || 7)));
    await query("UPDATE users SET muted_until = NOW() + ($2 || ' days')::interval WHERE id = (SELECT user_id FROM comments WHERE id = $1)", [commentId, days]);
  } else {
    await query("UPDATE comments SET status = $2, updated_at = NOW() WHERE id = $1", [commentId, body.action === "publish" ? "published" : "hidden"]);
  }
  await query("INSERT INTO moderation_actions (comment_id, action, detail) VALUES ($1, $2, $3)", [commentId, body.action, body.action === "mute" ? `${body.days || 7} days` : null]);
  return NextResponse.json({ ok: true });
}
