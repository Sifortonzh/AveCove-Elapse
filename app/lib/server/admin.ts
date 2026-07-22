export function isAdminRequest(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
}
