import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { parseImportFile } from "@/lib/imports";
import { MAX_IMPORT_REQUEST_BYTES } from "@/lib/limits";
import { resolveMediaItems } from "@/lib/requests";
import type { MediaHint } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


class PayloadTooLargeError extends Error {}

async function readLimitedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_REQUEST_BYTES) {
    throw new PayloadTooLargeError("The import request is too large.");
  }

  if (!request.body) return {};

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMPORT_REQUEST_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError("The import request is too large.");
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();

  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("The import request body is not valid JSON.");
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const body = (await readLimitedJson(request)) as {
      filename?: unknown;
      content?: unknown;
      defaultHint?: unknown;
    };

    const filename = typeof body.filename === "string" ? body.filename : "";
    const content = typeof body.content === "string" ? body.content : "";
    const defaultHint: MediaHint = ["movie", "series", "auto"].includes(
      String(body.defaultHint),
    )
      ? (body.defaultHint as MediaHint)
      : "auto";

    const imported = parseImportFile(filename, content, defaultHint);
    const results = await resolveMediaItems(imported.items);

    return NextResponse.json({
      source: imported.source,
      warnings: imported.warnings,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import media titles.",
      },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
}
