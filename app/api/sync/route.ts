import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";

type StateRow = { payload: Record<string, unknown>; version: number; updated_at: Date };

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rows = await query<StateRow>("SELECT payload, version, updated_at FROM learning_states WHERE user_id = $1", [session.userId]);
  return NextResponse.json({ state: rows[0] ?? null });
}

export async function PUT(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 12_000_000) return NextResponse.json({ error: "同步内容超过 12 MB，请拆分过大的题库后重试。" }, { status: 413 });
  let body: { state?: Record<string, unknown> };
  try {
    body = JSON.parse(raw) as { state?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "同步内容不是有效的 JSON。" }, { status: 400 });
  }
  const state = body.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return NextResponse.json({ error: "学习记录格式不正确。" }, { status: 400 });
  const bankBundle = state.questionBanks as { banks?: unknown[] } | undefined;
  const englishBundle = state.englishTests as { tests?: unknown[] } | undefined;
  if (bankBundle?.banks && (!Array.isArray(bankBundle.banks) || bankBundle.banks.length > 40)) return NextResponse.json({ error: "同步题库数量超出限制。" }, { status: 400 });
  if (englishBundle?.tests && (!Array.isArray(englishBundle.tests) || englishBundle.tests.length > 80)) return NextResponse.json({ error: "英文题库数量超出限制。" }, { status: 400 });
  const allowedKeys = ["progress", "favorites", "notes", "settings", "nickname", "bankName", "questionBanks", "englishTests", "englishPractice"];
  const allowed = Object.fromEntries(allowedKeys.filter((key) => key in state).map((key) => [key, state[key]]));
  const rows = await query<StateRow>(
    `INSERT INTO learning_states (user_id, payload, version, updated_at)
     VALUES ($1, $2::jsonb, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, version = learning_states.version + 1, updated_at = NOW()
     RETURNING payload, version, updated_at`,
    [session.userId, JSON.stringify(allowed)],
  );
  return NextResponse.json({ ok: true, state: rows[0] });
}
