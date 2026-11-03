import { randomInt } from "node:crypto";
import { hashLoginCode } from "@/app/lib/server/auth";
import { query } from "@/app/lib/server/db";
import { sendLoginCode } from "@/app/lib/server/email";

export async function issueEmailCode(email: string) {
  const code = String(randomInt(100000, 1000000));
  await query(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, NOW())
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = NOW()`,
    [email, hashLoginCode(email, code)],
  );
  return sendLoginCode(email, code);
}

export async function consumeEmailCode(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  // Atomically count attempts. Only one request can delete a valid code.
  const rows = await query<{ code_hash: string }>(
    `UPDATE login_codes SET attempts = attempts + 1
     WHERE email = $1 AND expires_at > NOW() AND attempts < 5 RETURNING code_hash`,
    [email],
  );
  const hash = hashLoginCode(email, code);
  if (rows[0]?.code_hash !== hash) return false;
  const consumed = await query("DELETE FROM login_codes WHERE email = $1 AND code_hash = $2 AND expires_at > NOW() RETURNING email", [email, hash]);
  return consumed.length === 1;
}
