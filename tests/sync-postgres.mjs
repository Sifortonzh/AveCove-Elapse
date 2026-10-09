import assert from "node:assert/strict";

// Run against PostgreSQL with a connection-local shadow table, never real rows.
export async function verifySyncSnapshot(client, compactSql, restoreSql) {
  await client.query("BEGIN");
  try {
    await client.query("CREATE TEMP TABLE learning_states (user_id text PRIMARY KEY, payload jsonb, version integer, updated_at timestamptz) ON COMMIT DROP");
    const oldBank = { id: "image-bank", updatedAt: "2026-10-01", questions: [{ stem: "unchanged", sourceImages: [{ dataUrl: "data:image/png;base64,original" }], answer: ["D"], explanation: "exact source explanation" }] };
    const deleted = { id: "deleted", updatedAt: "2026-09-01", questions: [] };
    await client.query("INSERT INTO learning_states VALUES ('test', $1, 1, NOW())", [JSON.stringify({ questionBanks: { version: 2, banks: [oldBank, deleted] }, notes: { a: "note" } })]);
    const compact = (await client.query(`SELECT ${compactSql} AS payload FROM learning_states`)).rows[0].payload;
    assert.deepEqual(compact.questionBanks.banks, [{ id: oldBank.id, updatedAt: oldBank.updatedAt }, { id: deleted.id, updatedAt: deleted.updatedAt }]);
    assert.deepEqual(compact.notes, { a: "note" });
    const newBank = { id: "new", updatedAt: "2026-10-09", questions: [{ stem: "new question" }] };
    const merged = { ...compact, questionBanks: { ...compact.questionBanks, banks: [compact.questionBanks.banks[0], newBank], deletedBanks: { deleted: "2026-10-09" } } };
    const sql = `INSERT INTO learning_states VALUES ($1, $2, 1, NOW()) ON CONFLICT (user_id) DO UPDATE SET payload = ${restoreSql}, version = learning_states.version + 1`;
    await client.query(sql, ["test", JSON.stringify(merged)]);
    const saved = (await client.query("SELECT payload FROM learning_states")).rows[0].payload;
    assert.deepEqual(saved.questionBanks.banks, [oldBank, newBank]);
    const edited = { ...oldBank, updatedAt: "2026-10-10", questions: [{ stem: "corrected", answer: ["A"] }] };
    await client.query(sql, ["test", JSON.stringify({ ...merged, questionBanks: { ...merged.questionBanks, banks: [edited] } })]);
    assert.deepEqual((await client.query("SELECT payload FROM learning_states")).rows[0].payload.questionBanks.banks, [edited]);
    console.log("PostgreSQL sync: compact revisions, exact unchanged images/answers, edits and deletions passed");
  } finally {
    await client.query("ROLLBACK");
  }
}
