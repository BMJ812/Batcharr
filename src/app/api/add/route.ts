import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { submitMediaRequest } from "@/lib/media-request";

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
    token?: unknown;
  };

  if (typeof body.token !== "string") {
    return NextResponse.json(
      { error: "A selected match token is required." },
      { status: 400 },
    );
  }

  try {
    const result = await submitMediaRequest(body.token);

    return NextResponse.json({
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit the media request.",
      },
      { status: 502 },
    );
  }
}
