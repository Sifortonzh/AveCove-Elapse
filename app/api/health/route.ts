import { NextResponse } from "next/server";
import { query } from "@/app/lib/server/db";

export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "ready", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", time: new Date().toISOString() }, { status: 503 });
  }
}
