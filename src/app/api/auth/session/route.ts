import { NextResponse } from "next/server";
import { authEnabled, isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    authEnabled: authEnabled(),
    authenticated: await isAuthenticated(),
  });
}
