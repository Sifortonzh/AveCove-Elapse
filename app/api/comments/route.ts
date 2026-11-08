import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { moderateComment } from "@/app/lib/server/moderation";
import { allowRequest } from "@/app/lib/server/rate-limit";

type CommentRow = { id: string; nickname: string; body: string; created_at: Date; status: string; likes: number; own: boolean; reply_to: string | null };

export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get("questionId")?.slice(0, 120);
  if (!questionId) return NextResponse.json({ error: "缺少题目标识。" }, { status: 400 });
  const session = readSession(request);
  const rows = await query<CommentRow>(
    `SELECT c.id, c.nickname, c.body, c.created_at, c.status, parent.nickname AS reply_to,
       COUNT(cl.comment_id)::int AS likes,
       (c.user_id = $2) AS own
     FROM comments c
     LEFT JOIN comments parent ON parent.id = c.parent_id AND parent.question_id = c.question_id AND parent.status = 'published'
     LEFT JOIN comment_likes cl ON cl.comment_id = c.id
     WHERE c.question_id = $1 AND (c.status = 'published' OR c.user_id = $2)
     GROUP BY c.id, parent.nickname
     ORDER BY c.created_at DESC LIMIT 50`,
    [questionId, session?.userId ?? ""],
  );
  return NextResponse.json({ comments: rows.map((row) => ({ id: row.id, nickname: row.nickname, text: row.body, createdAt: row.created_at, status: row.status, likes: row.likes, own: row.own, replyTo: row.reply_to })) });
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能参与讨论。" }, { status: 401 });
  if (!allowRequest(`comment:${session.userId}`, 8, 60_000)) return NextResponse.json({ error: "发布得有点快，休息一下再继续。" }, { status: 429 });
  const [user] = await query<{ nickname: string; muted_until: Date | null }>("SELECT nickname, muted_until FROM users WHERE id = $1", [session.userId]);
  if (!user) return NextResponse.json({ error: "账号状态异常，请重新登录。" }, { status: 401 });
  if (user.muted_until && new Date(user.muted_until).getTime() > Date.now()) return NextResponse.json({ error: "该账号暂时不能发布评论。" }, { status: 403 });
  const body = await request.json() as { questionId?: string; text?: string; parentId?: string };
  const questionId = String(body.questionId ?? "").slice(0, 120);
  const text = String(body.text ?? "").trim().slice(0, 300);
  if (!questionId || text.length < 2) return NextResponse.json({ error: "评论至少需要 2 个字。" }, { status: 400 });
  const parentId = typeof body.parentId === "string" ? body.parentId.slice(0, 120) : null;
  const moderation = moderateComment(text);
  const id = randomUUID();
  const inserted = await query(
    `INSERT INTO comments (id, user_id, question_id, nickname, body, status, moderation_reason, parent_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8 WHERE $8::text IS NULL OR EXISTS (
       SELECT 1 FROM comments WHERE id = $8 AND question_id = $3 AND status = 'published'
     ) RETURNING id`,
    [id, session.userId, questionId, user.nickname, text, moderation.status, moderation.reason, parentId || null],
  );
  if (!inserted.length) return NextResponse.json({ error: "这条评论已不可回复。" }, { status: 404 });
  return NextResponse.json({ ok: true, status: moderation.status, message: moderation.status === "pending" ? "评论已进入审核队列 🛡️" : "评论发布成功 ✨" });
}
