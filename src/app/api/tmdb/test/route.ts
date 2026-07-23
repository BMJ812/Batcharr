import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readSettings } from "@/lib/db";
import { testTmdbAccessToken } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredAccessToken(): string {
  return (
    process.env.TMDB_ACCESS_TOKEN?.trim() ||
    readSettings().tmdbAccessToken
  );
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: unknown;
    };

    const submittedToken =
      typeof body.accessToken === "string"
        ? body.accessToken.trim()
        : "";

    const accessToken =
      submittedToken || configuredAccessToken();

    const result = await testTmdbAccessToken(accessToken);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "TMDb connection test failed.",
      },
      { status: 400 },
    );
  }
}