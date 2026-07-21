import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  addMovie,
  addSeries,
  fetchExistingMovieIds,
  fetchExistingSeriesIds,
  humanizeArrError,
} from "@/lib/arr";
import { addHistory, readSettings } from "@/lib/db";
import { readCandidateToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { token?: unknown };
  if (typeof body.token !== "string") {
    return NextResponse.json({ error: "A selected match token is required." }, { status: 400 });
  }

  let selected: ReturnType<typeof readCandidateToken>;
  try {
    selected = readCandidateToken(body.token);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid match token." },
      { status: 400 },
    );
  }

  const settings = readSettings();

  try {
    const existing = selected.type === "movie"
      ? await fetchExistingMovieIds(settings)
      : (await fetchExistingSeriesIds(settings)).ids;

    if (existing.has(selected.externalId)) {
      addHistory({
        mediaType: selected.type,
        title: selected.title,
        year: selected.year,
        externalId: selected.externalId,
        status: "duplicate",
        message: "Already exists in the target Arr library.",
      });
      return NextResponse.json({ status: "duplicate", message: "Already exists in the target Arr library." });
    }

    if (selected.type === "movie") await addMovie(settings, selected.externalId);
    else await addSeries(settings, selected.externalId);

    addHistory({
      mediaType: selected.type,
      title: selected.title,
      year: selected.year,
      externalId: selected.externalId,
      status: "added",
      message: selected.type === "movie" ? "Added to Radarr." : "Added to Sonarr.",
    });

    return NextResponse.json({
      status: "added",
      message: selected.type === "movie" ? "Added to Radarr." : "Added to Sonarr.",
    });
  } catch (error) {
    const message = humanizeArrError(error);
    addHistory({
      mediaType: selected.type,
      title: selected.title,
      year: selected.year,
      externalId: selected.externalId,
      status: "failed",
      message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
