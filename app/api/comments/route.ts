import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { moderateComment } from "@/app/lib/server/moderation";
import { allowRequest } from "@/app/lib/server/rate-limit";

type CommentRow = { id: string; nickname: string; body: string; created_at: Date; status: string; likes: number; own: boolean };

export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get("questionId")?.slice(0, 120);
  if (!questionId) return NextResponse.json({ error: "缺少题目标识。" }, { status: 400 });
  const session = readSession(request);
  const rows = await query<CommentRow>(
    `SELECT c.id, c.nickname, c.body, c.created_at, c.status,
       COUNT(cl.comment_id)::int AS likes,
       (c.user_id = $2) AS own
     FROM comments c
     LEFT JOIN comment_likes cl ON cl.comment_id = c.id
     WHERE c.question_id = $1 AND (c.status = 'published' OR c.user_id = $2)
     GROUP BY c.id
     ORDER BY c.created_at DESC LIMIT 50`,
    [questionId, session?.userId ?? ""],
  );
  return NextResponse.json({ comments: rows.map((row) => ({ id: row.id, nickname: row.nickname, text: row.body, createdAt: row.created_at, status: row.status, likes: row.likes, own: row.own })) });
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能参与讨论。" }, { status: 401 });
  if (!allowRequest(`comment:${session.userId}`, 8, 60_000)) return NextResponse.json({ error: "发布得有点快，休息一下再继续。" }, { status: 429 });
  const [user] = await query<{ nickname: string; muted_until: Date | null }>("SELECT nickname, muted_until FROM users WHERE id = $1", [session.userId]);
  if (!user) return NextResponse.json({ error: "账号状态异常，请重新登录。" }, { status: 401 });
  if (user.muted_until && new Date(user.muted_until).getTime() > Date.now()) return NextResponse.json({ error: "该账号暂时不能发布评论。" }, { status: 403 });
  const body = await request.json() as { questionId?: string; text?: string };
  const questionId = String(body.questionId ?? "").slice(0, 120);
  const text = String(body.text ?? "").trim().slice(0, 300);
  if (!questionId || text.length < 2) return NextResponse.json({ error: "评论至少需要 2 个字。" }, { status: 400 });
  const moderation = moderateComment(text);
  const id = randomUUID();
  await query(
    "INSERT INTO comments (id, user_id, question_id, nickname, body, status, moderation_reason) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, session.userId, questionId, user.nickname, text, moderation.status, moderation.reason],
  );
  return NextResponse.json({ ok: true, status: moderation.status, message: moderation.status === "pending" ? "评论已进入审核队列 🛡️" : "评论发布成功 ✨" });
}
