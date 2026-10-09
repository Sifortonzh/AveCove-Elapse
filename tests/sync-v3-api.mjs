import assert from "node:assert/strict";

// Isolated disposable identity, never an existing learner. Run from the app
// container after release. Cleanup is limited to the exact newly created user.
export async function verifySyncApi(pool, base = "http://127.0.0.1:3000") {
  const login = await fetch(`${base}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: `SYNCQA_${Date.now()}`, nickname: "同步回归测试" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const userId = JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[0], "base64url").toString()).userId;
  const headers = { Cookie: cookie, "Content-Type": "application/json", "X-Elapse-Sync-Protocol": "2" };
  const put = async (state) => {
    const response = await fetch(`${base}/api/sync`, { method: "PUT", headers, body: JSON.stringify({ state }) });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  const get = async (path = "", compact = true) => {
    const response = await fetch(`${base}/api/sync${path}`, { headers: { Cookie: cookie, ...(compact ? { "X-Elapse-Sync-Protocol": "2" } : {}) } });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const bank = { id: "sync-regression-bank", updatedAt: "2026-10-09T15:00:00.000Z", questions: [{ id: "q1", answer: ["D"], explanation: "**原解析**", sourceImages: [{ dataUrl: "data:image/png;base64,original" }] }] };
    await put({ questionBanks: { banks: [bank] } });
    assert.equal((await get()).state.payload.questionBanks.banks[0].questions, undefined);
    assert.deepEqual((await get("?bank=sync-regression-bank")).bank, bank);
    assert.deepEqual((await get("", false)).state.payload.questionBanks.banks[0], bank);
    const ledger = (id, value, timestamp) => ({ [id]: { progress: { value, updatedAt: timestamp } } });
    const started = Date.now();
    await Promise.all([
      put({ progress: { mac: "correct" }, recordLedger: ledger("mac", "correct", 100), questionBanks: { banks: [] } }),
      put({ progress: { ipad: "wrong" }, recordLedger: ledger("ipad", "wrong", 101), questionBanks: { banks: [] } }),
    ]);
    let snapshot = (await get()).state.payload;
    assert.equal(snapshot.progress.mac, "correct");
    assert.equal(snapshot.progress.ipad, "wrong");
    assert.deepEqual((await get("?bank=sync-regression-bank")).bank, bank);
    await put({ progress: { mac: "wrong" }, recordLedger: ledger("mac", "wrong", 1), questionBanks: { banks: [{ ...bank, updatedAt: "2026-01-01", questions: [] }] } });
    snapshot = (await get()).state.payload;
    assert.equal(snapshot.progress.mac, "correct");
    assert.deepEqual((await get("?bank=sync-regression-bank")).bank, bank);
    await put({ questionBanks: { banks: [], deletedBanks: { [bank.id]: "2026-10-10T00:00:00.000Z" } } });
    await put({ questionBanks: { banks: [bank] } });
    assert.equal((await get()).state.payload.questionBanks.banks.length, 0);
    assert.equal((await get("?bank=sync-regression-bank")).bank, null);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM learning_sync_banks WHERE user_id=$1", [userId])).rows[0].n, 1);
    console.log(`Sync API passed: compact/full reads, exact images/explanations, concurrent Mac+iPad records, stale-write protection and deletion tombstones (${Date.now()-started} ms)`);
  } finally {
    await pool.query("DELETE FROM users WHERE id=$1 AND nickname='同步回归测试'", [userId]);
  }
}
