import { NextResponse } from "next/server";
import { query } from "@/app/lib/server/db";
import manifest from "@/package.json";

export async function GET() {
  const build = { version: manifest.version, commit: process.env.ELAPSE_BUILD_SHA || "unknown" };
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "ready", ...build, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", ...build, time: new Date().toISOString() }, { status: 503 });
  }
}
