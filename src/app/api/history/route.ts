import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listHistory } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  return NextResponse.json({ history: listHistory(Number.isFinite(limit) ? limit : 100) });
}
