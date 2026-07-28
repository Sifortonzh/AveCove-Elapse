import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseSharedQuestionBankPackage, type SharedQuestionBankPackage } from "@/app/lib/local-bank";
import { query } from "@/app/lib/server/db";
import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

type ShareRow = {
  payload: SharedQuestionBankPackage;
  expires_at: Date;
};

declare global {
  var __avecoveShareTableReady: Promise<void> | undefined;
}

function ensureShareTable() {
  if (!globalThis.__avecoveShareTableReady) {
    globalThis.__avecoveShareTableReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS shared_question_banks (
          token VARCHAR(64) PRIMARY KEY,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS shared_question_banks_expiry_idx ON shared_question_banks(expires_at)");
    })().catch((error) => {
      globalThis.__avecoveShareTableReady = undefined;
      throw error;
    });
  }
  return globalThis.__avecoveShareTableReady;
}

export async function POST(request: Request) {
  if (!allowRequest(`share-bank:create:${requestFingerprint(request)}`, 20, 60 * 60_000)) {
    return NextResponse.json({ error: "生成链接有点频繁，请稍后再试。" }, { status: 429 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 10_000_000) {
    return NextResponse.json({ error: "这份题库超过链接分享上限，请继续使用分享文件。" }, { status: 413 });
  }

  let body: { package?: unknown };
  try {
    body = JSON.parse(raw) as { package?: unknown };
  } catch {
    return NextResponse.json({ error: "题库分享内容不是有效的 JSON。" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseSharedQuestionBankPackage(body.package);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法识别这份题库。" }, { status: 400 });
  }
  if (parsed.questions.length > 25_000) {
    return NextResponse.json({ error: "单个分享链接最多包含 25000 道题。" }, { status: 400 });
  }

  const payload: SharedQuestionBankPackage = {
    format: "hongdou-question-bank",
    version: 1,
    exportedAt: new Date().toISOString(),
    bank: {
      name: parsed.name.slice(0, 160),
      description: parsed.description?.slice(0, 4_000),
      groupName: parsed.groupName?.slice(0, 60),
      questions: parsed.questions,
    },
  };
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  try {
    await ensureShareTable();
    await query("DELETE FROM shared_question_banks WHERE expires_at <= NOW()");
    await query(
      "INSERT INTO shared_question_banks (token, payload, expires_at) VALUES ($1, $2::jsonb, $3)",
      [token, JSON.stringify(payload), expiresAt],
    );
    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
  } catch {
    return NextResponse.json({ error: "分享链接暂时无法生成，请使用分享文件或稍后重试。" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  if (!allowRequest(`share-bank:open:${requestFingerprint(request)}`, 120, 60 * 60_000)) {
    return NextResponse.json({ error: "打开链接有点频繁，请稍后再试。" }, { status: 429 });
  }
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return NextResponse.json({ error: "题库导入链接无效。" }, { status: 400 });
  }

  try {
    await ensureShareTable();
    const rows = await query<ShareRow>(
      "SELECT payload, expires_at FROM shared_question_banks WHERE token = $1 AND expires_at > NOW()",
      [token],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "链接不存在或已过期，请让分享者重新生成。" }, { status: 404 });
    }
    return NextResponse.json(
      { package: rows[0].payload, expiresAt: rows[0].expires_at.toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "暂时无法读取分享链接，请稍后重试。" }, { status: 503 });
  }
}
