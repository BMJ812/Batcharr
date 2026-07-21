import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  fetchExistingMovieIds,
  fetchExistingSeriesIds,
  humanizeArrError,
  lookupMovies,
  lookupSeries,
} from "@/lib/arr";
import { readSettings } from "@/lib/db";
import { parseMediaList } from "@/lib/parser";
import type { LookupItemResult, MediaHint, ParsedListItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      output[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { text?: unknown; defaultHint?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  const defaultHint: MediaHint = ["movie", "series", "auto"].includes(String(body.defaultHint))
    ? (body.defaultHint as MediaHint)
    : "auto";
  const items = parseMediaList(text, defaultHint);

  if (!items.length) {
    return NextResponse.json({ error: "No usable titles were found in the list." }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "The first release is limited to 200 unique titles per batch." }, { status: 400 });
  }

  const settings = readSettings();
  const radarrConfigured = Boolean(settings.radarrUrl && settings.radarrApiKey);
  const sonarrConfigured = Boolean(settings.sonarrUrl && settings.sonarrApiKey);
  if (!radarrConfigured && !sonarrConfigured) {
    return NextResponse.json({ error: "Configure Radarr, Sonarr, or both before resolving titles." }, { status: 400 });
  }

  let movieIds = new Set<number>();
  let seriesIds = new Set<number>();
  let sonarrApiVersion: "v3" | "v5" = "v3";
  let radarrError: string | null = null;
  let sonarrError: string | null = null;

  await Promise.all([
    radarrConfigured
      ? fetchExistingMovieIds(settings)
          .then((ids) => { movieIds = ids; })
          .catch((error) => { radarrError = humanizeArrError(error); })
      : Promise.resolve(),
    sonarrConfigured
      ? fetchExistingSeriesIds(settings)
          .then((result) => {
            seriesIds = result.ids;
            sonarrApiVersion = result.apiVersion;
          })
          .catch((error) => { sonarrError = humanizeArrError(error); })
      : Promise.resolve(),
  ]);

  const results = await mapWithConcurrency<ParsedListItem, LookupItemResult>(items, 3, async (item) => {
    const jobs: Array<Promise<ReturnType<typeof lookupMovies> extends Promise<infer U> ? U : never>> = [];
    const errors: string[] = [];

    if ((item.hint === "movie" || item.hint === "auto") && radarrConfigured) {
      if (radarrError) errors.push(`Radarr: ${radarrError}`);
      else jobs.push(lookupMovies(settings, item, movieIds).catch((error) => {
        errors.push(`Radarr: ${humanizeArrError(error)}`);
        return [];
      }));
    }

    if ((item.hint === "series" || item.hint === "auto") && sonarrConfigured) {
      if (sonarrError) errors.push(`Sonarr: ${sonarrError}`);
      else jobs.push(lookupSeries(settings, item, seriesIds, sonarrApiVersion).catch((error) => {
        errors.push(`Sonarr: ${humanizeArrError(error)}`);
        return [];
      }));
    }

    const candidates = (await Promise.all(jobs))
      .flat()
      .sort((left, right) => right.score - left.score)
      .slice(0, item.hint === "auto" ? 8 : 5);

    return {
      item,
      candidates,
      error: candidates.length ? null : errors.join(" | ") || "No matches found.",
    };
  });

  return NextResponse.json({ results });
}
