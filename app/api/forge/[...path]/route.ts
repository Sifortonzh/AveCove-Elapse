// Forge is optional. Forward the operator's token; never expose a server secret.
export const runtime = "nodejs";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const base = process.env.FORGE_API_URL;
  if (!base) return Response.json({ detail: "Forge backend is not configured (FORGE_API_URL)." }, { status: 503 });
  const { path } = await context.params;
  if (path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) return new Response(null, { status: 400 });
  const headers = new Headers();
  for (const name of ["authorization", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/${path.join("/")}`, {
      method: request.method, headers, cache: "no-store", signal: request.signal,
      ...(request.method === "POST" ? { body: request.body, duplex: "half" } : {}),
    } as RequestInit);
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ detail: "Forge backend is unavailable." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
