import assert from "node:assert/strict";

// All writes are to transaction-local shadow tables, including a copy of the
// largest real snapshot. No user records are edited by this regression test.
export async function verifySplitStore(client, schema, migrationSource) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("CREATE TEMP TABLE users (id text PRIMARY KEY) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE learning_states ON COMMIT DROP AS SELECT * FROM public.learning_states ORDER BY pg_column_size(payload) DESC LIMIT 1");
    await client.query("INSERT INTO users SELECT user_id FROM learning_states");
    // CREATE TEMP shadows real tables; schema stays additive in production.
    await client.query(schema.replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"));
    const legacy = (await client.query("SELECT user_id,md5(payload::text) AS checksum,jsonb_array_length(payload#>'{questionBanks,banks}') AS banks FROM learning_states")).rows[0];
    if (!legacy) throw new Error("No snapshot available for the large migration test");
    const migrationQueries = [...migrationSource.matchAll(/await client\.query\(`(INSERT INTO learning_sync_(?:banks|states)[\s\S]*?)`, \[userId\]\)/g)].map((match) => match[1]);
    assert.equal(migrationQueries.length, 2);
    const start = Date.now();
    for (const sql of migrationQueries) await client.query(sql, [legacy.user_id]);
    const migrated = (await client.query("SELECT count(*)::int AS banks FROM learning_sync_banks")).rows[0];
    assert.equal(migrated.banks, legacy.banks);
    const mismatches = (await client.query(`SELECT count(*)::int AS count FROM learning_states s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload#>'{questionBanks,banks}') original
      LEFT JOIN learning_sync_banks b ON b.bank_id=original->>'id' AND b.user_id=s.user_id
      WHERE b.payload IS DISTINCT FROM original`)).rows[0];
    assert.equal(mismatches.count, 0);
    console.log(`Largest snapshot migration: ${Date.now()-start} ms, ${migrated.banks} banks, exact payloads preserved`);
    const fingerprint = (await client.query("SELECT md5(string_agg(md5(payload::text),',' ORDER BY bank_id)) AS checksum FROM learning_sync_banks")).rows[0].checksum;
    const writeStart = Date.now();
    for (let i=0;i<10;i++) await client.query("UPDATE learning_sync_states SET payload=jsonb_set(payload,'{syncRegression}',to_jsonb($2::int)),version=version+1 WHERE user_id=$1", [legacy.user_id,i]);
    assert.equal((await client.query("SELECT md5(string_agg(md5(payload::text),',' ORDER BY bank_id)) AS checksum FROM learning_sync_banks")).rows[0].checksum, fingerprint);
    assert.equal((await client.query("SELECT md5(payload::text) AS checksum FROM learning_states")).rows[0].checksum, legacy.checksum);
    console.log(`10 record writes: ${Date.now()-writeStart} ms; bank bodies and legacy recovery snapshot unchanged`);
  } finally { await client.query("ROLLBACK"); }
}
