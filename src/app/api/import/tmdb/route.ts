import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readSettings } from "@/lib/db";
import { resolveMediaItems } from "@/lib/requests";
import { importTmdbList } from "@/lib/tmdb";

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
    const body = (await request.json()) as {
      input?: unknown;
    };

    const input =
      typeof body.input === "string"
        ? body.input.trim()
        : "";

    if (!input) {
      throw new Error(
        "Enter a TMDb list URL or numeric list ID.",
      );
    }

    const imported = await importTmdbList(
      input,
      configuredAccessToken(),
    );

    const results = await resolveMediaItems(imported.items);

    return NextResponse.json({
      source: imported.source,
      warnings: imported.warnings,
      truncated: imported.truncated,
      totalAvailable: imported.totalAvailable,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import the TMDb list.",
      },
      { status: 400 },
    );
  }
}