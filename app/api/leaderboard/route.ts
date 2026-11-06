import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query, withTransaction } from "@/app/lib/server/db";
import { ensureSyncStore } from "@/app/lib/server/sync-store";
import { monthlyRanks, type RankMetric } from "@/app/lib/leaderboard";

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录后查看华山论剑 🔐" }, { status: 401 });
  const metric = new URL(request.url).searchParams.get("metric") ?? "time";
  if (!["time", "answers", "average"].includes(metric)) return NextResponse.json({ error: "排序方式无效" }, { status: 400 });
  try {
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()).replace("/", "-");
    const own = await query<{ joined: boolean }>("SELECT COALESCE(payload->>'leaderboardOptIn','false')='true' AS joined FROM learning_sync_states WHERE user_id=$1", [session.userId]);
    const rows = await query<{ user_id: string; nickname: string; activity: unknown }>("SELECT user_id, payload->>'nickname' AS nickname, payload->'activity' AS activity FROM learning_sync_states WHERE payload->>'leaderboardOptIn'='true'");
    return NextResponse.json({ month, joined: own[0]?.joined ?? false, entries: monthlyRanks(rows, month, session.userId, metric as RankMetric) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "榜单暂时无法读取，请稍后重试" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录 🔐" }, { status: 401 });
  let body: { joined?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "格式无效" }, { status: 400 }); }
  if (typeof body.joined !== "boolean") return NextResponse.json({ error: "请选择是否加入" }, { status: 400 });
  try {
    await ensureSyncStore(session.userId);
    await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [session.userId]);
      await client.query("UPDATE learning_sync_states SET payload=jsonb_set(payload,'{leaderboardOptIn}',$2::jsonb),version=version+1,updated_at=now() WHERE user_id=$1", [session.userId, JSON.stringify(body.joined)]);
    });
    return NextResponse.json({ joined: body.joined });
  } catch { return NextResponse.json({ error: "加入状态未保存，请重试" }, { status: 503 }); }
}
