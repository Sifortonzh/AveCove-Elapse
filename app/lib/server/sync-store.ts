import { query, withTransaction } from "./db";
import type { PoolClient } from "pg";

export type SyncStateRow = { payload: Record<string, unknown>; version: number; updated_at: Date };

// One-time, lossless migration. The legacy snapshot is deliberately retained.
// Subsequent progress writes never read or rewrite the large bank bodies.
export async function ensureSyncStore(userId: string) {
  if ((await query("SELECT 1 FROM learning_sync_states WHERE user_id=$1", [userId])).length) return;
  await withTransaction(async (client) => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [userId]);
    if ((await client.query("SELECT 1 FROM learning_sync_states WHERE user_id=$1", [userId])).rowCount) return;
    await client.query(`INSERT INTO learning_sync_banks (user_id,bank_id,payload,content_bytes)
      SELECT user_id, bank->>'id', bank, octet_length(bank::text)
      FROM learning_states, LATERAL jsonb_array_elements(COALESCE(payload#>'{questionBanks,banks}', '[]'::jsonb)) bank
      WHERE user_id=$1 AND bank ? 'id' ON CONFLICT DO NOTHING`, [userId]);
    await client.query(`INSERT INTO learning_sync_states (user_id,payload,version,updated_at)
      SELECT user_id, jsonb_set(payload, '{questionBanks}',
        (COALESCE(payload->'questionBanks','{}'::jsonb)-'banks') || jsonb_build_object('banks',
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',bank->'id','updatedAt',bank->'updatedAt'))
          FROM jsonb_array_elements(COALESCE(payload#>'{questionBanks,banks}','[]'::jsonb)) bank),'[]'::jsonb))), version, updated_at
      FROM learning_states WHERE user_id=$1 ON CONFLICT DO NOTHING`, [userId]);
    await client.query("INSERT INTO learning_sync_states (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
  });
}

export async function readSyncSnapshot(userId: string, compact: boolean) {
  const rows = await query<SyncStateRow>("SELECT payload,version,updated_at FROM learning_sync_states WHERE user_id=$1", [userId]);
  const row = rows[0];
  if (!row || compact) return row ?? null;
  const bundle = row.payload.questionBanks as { banks?: { id: string }[] } | undefined;
  const ids = bundle?.banks?.map((bank) => bank.id) ?? [];
  const banks = await query<{ bank_id: string; payload: unknown }>("SELECT bank_id,payload FROM learning_sync_banks WHERE user_id=$1 AND bank_id=ANY($2::text[])", [userId, ids]);
  const map = new Map(banks.map((bank) => [bank.bank_id, bank.payload]));
  return { ...row, payload: { ...row.payload, questionBanks: { ...bundle, banks: ids.map((id) => map.get(id)).filter(Boolean) } } };
}

export async function readSyncBank(userId: string, bankId: string) {
  const rows = await query<{ payload: unknown }>(`SELECT b.payload FROM learning_sync_banks b
    JOIN learning_sync_states s USING(user_id) WHERE b.user_id=$1 AND b.bank_id=$2
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.payload#>'{questionBanks,banks}','[]'::jsonb)) r WHERE r->>'id'=b.bank_id)`, [userId, bankId]);
  return rows[0]?.payload ?? null;
}

export async function saveChangedSyncBanks(client: PoolClient, userId: string, banks: Record<string, unknown>[]) {
  for (const bank of banks) {
    const serialized = JSON.stringify(bank);
    await client.query(`INSERT INTO learning_sync_banks (user_id,bank_id,payload,content_bytes) VALUES ($1,$2,$3::jsonb,$4)
      ON CONFLICT (user_id,bank_id) DO UPDATE SET payload=EXCLUDED.payload,content_bytes=EXCLUDED.content_bytes`,
    [userId, bank.id, serialized, Buffer.byteLength(serialized, "utf8")]);
  }
}
