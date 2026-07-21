import { NextResponse } from "next/server";
import { authEnabled, passwordMatches, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
