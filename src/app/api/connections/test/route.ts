import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { humanizeArrError, testRadarrConnection, testSonarrConnection } from "@/lib/arr";
import { readSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { service?: unknown; url?: unknown; apiKey?: unknown };
  const service = body.service === "sonarr" ? "sonarr" : body.service === "radarr" ? "radarr" : null;
  if (!service) return NextResponse.json({ error: "Service must be radarr or sonarr." }, { status: 400 });

  const stored = readSettings();
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const submittedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = submittedKey || (service === "radarr" ? stored.radarrApiKey : stored.sonarrApiKey);

  try {
    const result = service === "radarr"
      ? await testRadarrConnection(url, apiKey)
      : await testSonarrConnection(url, apiKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: humanizeArrError(error) }, { status: 502 });
  }
}
