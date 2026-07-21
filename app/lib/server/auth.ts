import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "avecove_elapse_session";

export type SessionUser = {
  userId: string;
  nickname: string;
  email?: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.SYNC_SECRET;
  if (!value || value.length < 32) throw new Error("SYNC_SECRET must contain at least 32 characters");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function normalizeStudentId(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateStudentId(value: string) {
  return /^[A-Z0-9_-]{4,32}$/.test(value);
}

export function deriveUserId(studentId: string) {
  return createHmac("sha256", secret()).update(`student:${normalizeStudentId(studentId)}`).digest("hex");
}

export function deriveVisitorId(value: string) {
  return createHmac("sha256", secret()).update(`visitor:${value}`).digest("hex");
}

export function hashLoginCode(email: string, code: string) {
  return createHmac("sha256", secret()).update(`email-code:${email}:${code}`).digest("hex");
}

export function createSessionToken(user: Omit<SessionUser, "expiresAt">) {
  const payload: SessionUser = { ...user, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readSession(request: Request): SessionUser | null {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionUser;
    return payload.expiresAt > Date.now() && payload.userId ? payload : null;
  } catch {
    return null;
  }
}

export function publicSession(user: SessionUser) {
  const email = user.email;
  const maskedEmail = email ? email.replace(/^(.{1,2}).*(@.*)$/, "$1•••$2") : undefined;
  return { nickname: user.nickname, email: maskedEmail, expiresAt: user.expiresAt };
}
