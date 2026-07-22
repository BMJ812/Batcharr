import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { resolveMediaList } from "@/lib/requests";
import type { MediaHint } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    text?: unknown;
    defaultHint?: unknown;
  };

  const text = typeof body.text === "string" ? body.text : "";

  const defaultHint: MediaHint = [
    "movie",
    "series",
    "auto",
  ].includes(String(body.defaultHint))
    ? (body.defaultHint as MediaHint)
    : "auto";

  try {
    const results = await resolveMediaList(text, defaultHint);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to resolve media titles.",
      },
      { status: 400 },
    );
  }
}
