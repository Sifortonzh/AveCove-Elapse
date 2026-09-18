import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { inferPavilionStudyStage, parseSharedQuestionBankPackage, type SharedQuestionBankPackage } from "@/app/lib/local-bank";
import { readSession } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { allowRequest } from "@/app/lib/server/rate-limit";

type PavilionRow = {
  id: string;
  source_bank_id: string;
  name: string;
  group_name: string;
  study_stage: string;
  question_count: number;
  uploader_nickname: string;
  updated_at: Date;
  own: boolean;
};

declare global {
  var __avecovePavilionTableReady: Promise<void> | undefined;
}

function ensurePavilionTable() {
  if (!globalThis.__avecovePavilionTableReady) {
    globalThis.__avecovePavilionTableReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS pavilion_question_banks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_bank_id VARCHAR(160) NOT NULL,
          name VARCHAR(160) NOT NULL,
          group_name VARCHAR(60) NOT NULL DEFAULT '',
          study_stage VARCHAR(20) NOT NULL DEFAULT '其他',
          question_count INTEGER NOT NULL,
          payload JSONB NOT NULL,
          uploader_nickname VARCHAR(30) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, source_bank_id)
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS pavilion_question_banks_stage_idx ON pavilion_question_banks(study_stage, updated_at DESC)");
    })().catch((error) => {
      globalThis.__avecovePavilionTableReady = undefined;
      throw error;
    });
  }
  return globalThis.__avecovePavilionTableReady;
}

function publicEntry(row: PavilionRow) {
  return {
    id: row.id,
    sourceBankId: row.source_bank_id,
    name: row.name,
    groupName: row.group_name,
    studyStage: row.study_stage,
    questionCount: row.question_count,
    uploaderNickname: row.uploader_nickname,
    uploadedAt: row.updated_at.toISOString(),
    own: row.own,
  };
}

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能查看公共藏经阁。" }, { status: 401 });
  if (!allowRequest(`pavilion:list:${session.userId}`, 120, 60 * 60_000)) return NextResponse.json({ error: "刷新得有点频繁，请稍后再试。" }, { status: 429 });
  try {
    await ensurePavilionTable();
    const id = new URL(request.url).searchParams.get("id")?.slice(0, 100) ?? "";
    if (id) {
      const rows = await query<{ payload: SharedQuestionBankPackage }>("SELECT payload FROM pavilion_question_banks WHERE id = $1", [id]);
      if (!rows[0]) return NextResponse.json({ error: "这份题库已被移出藏经阁。" }, { status: 404 });
      return NextResponse.json({ package: rows[0].payload }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const rows = await query<PavilionRow>(
      `SELECT id, source_bank_id, name, group_name, study_stage, question_count, uploader_nickname, updated_at,
        (user_id = $1) AS own
       FROM pavilion_question_banks
       ORDER BY updated_at DESC LIMIT 500`,
      [session.userId],
    );
    return NextResponse.json({ entries: rows.map(publicEntry) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "公共藏经阁暂时无法读取，请稍后重试。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能上传题库。" }, { status: 401 });
  if (!allowRequest(`pavilion:upload:${session.userId}`, 30, 60 * 60_000)) return NextResponse.json({ error: "上传得有点频繁，请稍后再试。" }, { status: 429 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 10_000_000) return NextResponse.json({ error: "单份题库不能超过 10 MB。" }, { status: 413 });
  let body: { sourceBankId?: unknown; package?: unknown };
  try { body = JSON.parse(raw) as typeof body; } catch { return NextResponse.json({ error: "题库内容不是有效 JSON。" }, { status: 400 }); }
  let parsed;
  try { parsed = parseSharedQuestionBankPackage(body.package); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法识别题库。" }, { status: 400 }); }
  const sourceBankId = String(body.sourceBankId ?? parsed.id ?? "").trim().slice(0, 160);
  if (!sourceBankId) return NextResponse.json({ error: "题库缺少稳定主键。" }, { status: 400 });
  const payload = body.package as SharedQuestionBankPackage;
  const groupName = parsed.groupName?.trim().slice(0, 60) ?? "";
  const stage = inferPavilionStudyStage(parsed.name, groupName);
  try {
    await ensurePavilionTable();
    const rows = await query<PavilionRow>(
      `INSERT INTO pavilion_question_banks
        (id, user_id, source_bank_id, name, group_name, study_stage, question_count, payload, uploader_nickname)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (user_id, source_bank_id) DO UPDATE SET
        name = EXCLUDED.name, group_name = EXCLUDED.group_name, study_stage = EXCLUDED.study_stage,
        question_count = EXCLUDED.question_count, payload = EXCLUDED.payload,
        uploader_nickname = EXCLUDED.uploader_nickname, updated_at = NOW()
       RETURNING id, source_bank_id, name, group_name, study_stage, question_count, uploader_nickname, updated_at, true AS own`,
      [randomUUID(), session.userId, sourceBankId, parsed.name.slice(0, 160), groupName, stage, parsed.questions.length, JSON.stringify(payload), session.nickname.slice(0, 30)],
    );
    return NextResponse.json({ entry: publicEntry(rows[0]) });
  } catch {
    return NextResponse.json({ error: "题库暂时无法收入公共藏经阁。" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "登录后才能管理题库。" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.slice(0, 100) ?? "";
  if (!id) return NextResponse.json({ error: "缺少藏经阁题库标识。" }, { status: 400 });
  await ensurePavilionTable();
  const rows = await query<{ id: string }>("DELETE FROM pavilion_question_banks WHERE id = $1 AND user_id = $2 RETURNING id", [id, session.userId]);
  if (!rows[0]) return NextResponse.json({ error: "只能移除自己上传的题库。" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
