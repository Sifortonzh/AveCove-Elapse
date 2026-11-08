import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { allowRequest } from "@/app/lib/server/rate-limit";

type Activity = { id: string; kind: "reply" | "like"; title: string; detail: string | null; at: Date };
type Upload = { id: string; title: string; detail: string; at: Date };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后查看消息。" }, { status: 401, headers });
  if (!allowRequest(`notifications:${session.userId}`, 60, 60_000)) return NextResponse.json({ error: "请稍后重试。" }, { status: 429, headers });
  const now = Date.now();
  const requested = Number(new URL(request.url).searchParams.get("dayStart"));
  const dayStart = new Date(Number.isFinite(requested) && requested >= now - 26 * 3_600_000 && requested <= now ? requested : now - 24 * 3_600_000);
  try {
    const [uploads, responses] = await Promise.all([
      query<Upload>(`SELECT id, name AS title, uploader_nickname AS detail, created_at AS at
        FROM pavilion_question_banks WHERE created_at >= $1 ORDER BY created_at DESC, id LIMIT 30`, [dayStart]),
      query<Activity>(`SELECT * FROM (
        SELECT 'reply:' || r.id AS id, 'reply' AS kind, r.nickname AS title, r.body AS detail, r.created_at AS at
          FROM comments c JOIN comments r ON r.parent_id = c.id
          WHERE c.user_id = $1 AND r.user_id <> $1 AND c.status = 'published' AND r.status = 'published'
            AND r.created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT 'like:' || md5(c.id || ':' || l.user_id) AS id, 'like' AS kind, u.nickname AS title, NULL AS detail, l.created_at AS at
          FROM comments c JOIN comment_likes l ON l.comment_id = c.id JOIN users u ON u.id = l.user_id
          WHERE c.user_id = $1 AND l.user_id <> $1 AND c.status = 'published'
            AND l.created_at >= NOW() - INTERVAL '30 days'
      ) events ORDER BY at DESC, id LIMIT 30`, [session.userId]),
    ]);
    return NextResponse.json({ uploads, responses }, { headers });
  } catch {
    return NextResponse.json({ error: "暂时无法读取消息。" }, { status: 503, headers });
  }
}
