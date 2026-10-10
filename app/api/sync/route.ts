import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/server/auth";
import { withTransaction } from "@/app/lib/server/db";
import { mergeLearningRecords } from "@/app/lib/record-sync";
import { readSyncRequest, syncJsonResponse, SyncTransferError } from "@/app/lib/server/sync-transfer";
import { MAX_SYNC_CONTENT_BYTES } from "@/app/lib/sync-transfer";
import { ensureSyncStore, readSyncBank, readSyncSnapshot, saveChangedSyncBanks } from "@/app/lib/server/sync-store";
import { newerPreferences } from "@/app/lib/practice-stats";

type StateRow = { payload: Record<string, unknown>; version: number; updated_at: Date };
// Compressed transport stays below Nginx's 25 MB limit; decoded data is bounded.

type SyncBank = { id: string; updatedAt?: string; [key: string]: unknown };
type BankBundle = {
  version?: number;
  activeBankId?: string | null;
  banks?: unknown[];
  groupOrder?: unknown;
  bankOrder?: unknown;
  sortMode?: unknown;
  deletedBanks?: unknown;
  preferencesUpdatedAt?: unknown;
};

function validTimestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : new Date(0).toISOString();
}

function normalizeDeletions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(value)
    .filter(([id, timestamp]) => id.length > 0 && id.length <= 160 && validTimestamp(timestamp) !== new Date(0).toISOString())
    .sort(([, left], [, right]) => validTimestamp(right).localeCompare(validTimestamp(left)))
    .slice(0, 200)
    .map(([id, timestamp]) => [id, validTimestamp(timestamp)])) as Record<string, string>;
}

function mergeQuestionBankBundles(currentValue: unknown, incomingValue: unknown) {
  const current = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) ? currentValue as BankBundle : {};
  const incoming = incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue) ? incomingValue as BankBundle : {};
  const banks = new Map<string, SyncBank>();
  for (const candidate of [...(Array.isArray(current.banks) ? current.banks : []), ...(Array.isArray(incoming.banks) ? incoming.banks : [])]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const bank = candidate as SyncBank;
    if (typeof bank.id !== "string" || bank.id.length > 160) continue;
    const existing = banks.get(bank.id);
    if (!existing || validTimestamp(bank.updatedAt) > validTimestamp(existing.updatedAt)) banks.set(bank.id, bank);
  }
  const deletedBanks = normalizeDeletions(current.deletedBanks);
  for (const [id, deletedAt] of Object.entries(normalizeDeletions(incoming.deletedBanks))) {
    if (!deletedBanks[id] || deletedAt > deletedBanks[id]) deletedBanks[id] = deletedAt;
  }
  for (const [id, bank] of banks) {
    if (deletedBanks[id] && deletedBanks[id] >= validTimestamp(bank.updatedAt)) banks.delete(id);
  }
  const preferenceSource = validTimestamp(incoming.preferencesUpdatedAt) >= validTimestamp(current.preferencesUpdatedAt) ? incoming : current;
  const activeCandidates = [incoming.activeBankId, current.activeBankId];
  const activeBankId = activeCandidates.find((id): id is string => typeof id === "string" && banks.has(id)) ?? null;
  return {
    version: 2,
    activeBankId,
    banks: [...banks.values()].sort((left, right) => validTimestamp(right.updatedAt).localeCompare(validTimestamp(left.updatedAt))).slice(0, 40),
    deletedBanks,
    groupOrder: Array.isArray(preferenceSource.groupOrder) ? preferenceSource.groupOrder : [],
    bankOrder: Array.isArray(preferenceSource.bankOrder) ? preferenceSource.bankOrder : [],
    sortMode: typeof preferenceSource.sortMode === "string" ? preferenceSource.sortMode : "imported-desc",
    preferencesUpdatedAt: validTimestamp(preferenceSource.preferencesUpdatedAt),
  };
}

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
  await ensureSyncStore(session.userId);
  const bankId = new URL(request.url).searchParams.get("bank");
  if (bankId) {
    if (bankId.length > 160) return NextResponse.json({ error: "题库标识无效。" }, { status: 400 });
    return syncJsonResponse({ bank: await readSyncBank(session.userId, bankId) }, request);
  }
  const compact = request.headers.get("x-elapse-sync-protocol") === "2";
  return syncJsonResponse({ state: await readSyncSnapshot(session.userId, compact) }, request);
  } catch (error) { return syncFailure(error); }
}

export async function PUT(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  let raw: string;
  try { raw = await readSyncRequest(request); }
  catch (error) {
    if (error instanceof SyncTransferError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
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
  const allowedKeys = ["progress", "firstProgress", "favorites", "favoriteStars", "killedQuestions", "notes", "recordLedger", "settings", "nickname", "bankName", "questionBanks", "englishTests", "englishPractice"];
  const allowed = Object.fromEntries(allowedKeys.filter((key) => key in state).map((key) => [key, state[key]])) as Record<string, unknown>;
  try {
  await ensureSyncStore(session.userId);
  const rows = await withTransaction(async (client) => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // Serialise writes for one learner so simultaneous iPad/Mac uploads cannot
    // both merge against the same stale snapshot and lose the other update.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [session.userId]);
    const currentResult = await client.query<StateRow>(
      "SELECT payload, version, updated_at FROM learning_sync_states WHERE user_id = $1 FOR UPDATE",
      [session.userId],
    );
    const currentPayload = currentResult.rows[0]?.payload ?? {};
    allowed.questionBanks = mergeQuestionBankBundles(currentPayload.questionBanks, allowed.questionBanks);
    const records = mergeLearningRecords(
      {
        progress: currentPayload.progress,
        firstProgress: currentPayload.firstProgress,
        favorites: currentPayload.favorites,
        favoriteStars: currentPayload.favoriteStars,
        killed: currentPayload.killedQuestions,
        notes: currentPayload.notes,
        ledger: currentPayload.recordLedger,
      },
      {
        progress: allowed.progress,
        firstProgress: allowed.firstProgress,
        favorites: allowed.favorites,
        favoriteStars: allowed.favoriteStars,
        killed: allowed.killedQuestions,
        notes: allowed.notes,
        ledger: allowed.recordLedger,
      },
    );
    const mergedPayload = {
      ...currentPayload,
      ...allowed,
      settings: newerPreferences(
        (currentPayload.settings ?? {}) as { updatedAt?: number },
        (allowed.settings ?? {}) as { updatedAt?: number },
      ),
      progress: records.progress,
      firstProgress: records.firstProgress,
      favorites: records.favorites,
      favoriteStars: records.favoriteStars,
      killedQuestions: records.killed,
      notes: records.notes,
      recordLedger: records.ledger,
    };
    const mergedBundle = allowed.questionBanks as BankBundle;
    const mergedBanks = (mergedBundle.banks ?? []) as SyncBank[];
    const changedBanks = mergedBanks.filter((bank) => Array.isArray(bank.questions));
    mergedBundle.banks = mergedBanks.map((bank) => ({ id: bank.id, updatedAt: bank.updatedAt }));
    const serialized = JSON.stringify(mergedPayload);
    if (Buffer.byteLength(serialized, "utf8") > MAX_SYNC_CONTENT_BYTES) return { capacityExceeded: true as const };
    if (!changedBanks.length && serialized === JSON.stringify(currentPayload)) return currentResult.rows;
    await saveChangedSyncBanks(client, session.userId, changedBanks);
    const ids = mergedBanks.map((bank) => bank.id);
    const size = await client.query<{ bytes: string }>("SELECT COALESCE(sum(content_bytes),0) AS bytes FROM learning_sync_banks WHERE user_id=$1 AND bank_id=ANY($2::text[])", [session.userId, ids]);
    if (Number(size.rows[0].bytes) + Buffer.byteLength(serialized, "utf8") > MAX_SYNC_CONTENT_BYTES) throw new SyncTransferError("合并后的云端数据超过 96 MB，本次写入已撤回，原云端数据保留。");
    await client.query(
      `INSERT INTO learning_sync_states (user_id, payload, version, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, version = learning_sync_states.version + 1, updated_at = NOW()`,
      [session.userId, serialized],
    );
    const result = await client.query<StateRow>("SELECT payload, version, updated_at FROM learning_sync_states WHERE user_id = $1", [session.userId]);
    return result.rows;
  });
  if ("capacityExceeded" in rows) return NextResponse.json({ error: "合并后的云端同步数据超过 96 MB，原云端数据未覆盖；请导出备份后联系管理员扩容。" }, { status: 413 });
  const stateRow = request.headers.get("x-elapse-sync-protocol") === "2" ? rows[0] : await readSyncSnapshot(session.userId, false);
  return syncJsonResponse({ ok: true, state: stateRow }, request);
  } catch (error) {
    return syncFailure(error);
  }
}

function syncFailure(error: unknown) {
  if (error instanceof SyncTransferError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code = (error as { code?: string }).code;
  console.error("[sync] request failed", { code, message: error instanceof Error ? error.message.slice(0, 180) : "unknown" });
  return NextResponse.json({ error: code === "55P03" || code === "57014" ? "云端同步繁忙，正在等待重试；本机数据保留。" : "云端同步未完成，本机数据保留，请稍后重试。" }, { status: 503, headers: { "Retry-After": "3" } });
}
