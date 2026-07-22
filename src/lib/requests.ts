import {
  fetchExistingMovieIds,
  fetchExistingSeriesIds,
  humanizeArrError,
  lookupMovies,
  lookupSeries,
} from "@/lib/arr";
import { readSettings } from "@/lib/db";
import { parseMediaList } from "@/lib/parser";
import type {
  LookupItemResult,
  MediaHint,
  ParsedListItem,
} from "@/lib/types";

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) return;

      output[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, values.length) },
      () => worker(),
    ),
  );

  return output;
}

export async function resolveMediaList(
  text: string,
  defaultHint: MediaHint = "auto",
): Promise<LookupItemResult[]> {
  const items = parseMediaList(text, defaultHint);

  if (!items.length) {
    throw new Error("No usable titles were found in the list.");
  }

  if (items.length > 200) {
    throw new Error(
      "Batcharr is limited to 200 unique titles per batch.",
    );
  }

  const settings = readSettings();

  const radarrConfigured = Boolean(
    settings.radarrUrl && settings.radarrApiKey,
  );

  const sonarrConfigured = Boolean(
    settings.sonarrUrl && settings.sonarrApiKey,
  );

  if (!radarrConfigured && !sonarrConfigured) {
    throw new Error(
      "Configure Radarr, Sonarr, or both before resolving titles.",
    );
  }

  let movieIds = new Set<number>();
  let seriesIds = new Set<number>();
  let sonarrApiVersion: "v3" | "v5" = "v3";
  let radarrError: string | null = null;
  let sonarrError: string | null = null;

  await Promise.all([
    radarrConfigured
      ? fetchExistingMovieIds(settings)
          .then((ids) => {
            movieIds = ids;
          })
          .catch((error: unknown) => {
            radarrError = humanizeArrError(error);
          })
      : Promise.resolve(),

    sonarrConfigured
      ? fetchExistingSeriesIds(settings)
          .then((result) => {
            seriesIds = result.ids;
            sonarrApiVersion = result.apiVersion;
          })
          .catch((error: unknown) => {
            sonarrError = humanizeArrError(error);
          })
      : Promise.resolve(),
  ]);

  return mapWithConcurrency<ParsedListItem, LookupItemResult>(
    items,
    3,
    async (item) => {
      const jobs: Array<
        Promise<
          Awaited<ReturnType<typeof lookupMovies>>
        >
      > = [];

      const errors: string[] = [];

      if (
        (item.hint === "movie" || item.hint === "auto") &&
        radarrConfigured
      ) {
        if (radarrError) {
          errors.push(`Radarr: ${radarrError}`);
        } else {
          jobs.push(
            lookupMovies(settings, item, movieIds).catch(
              (error: unknown) => {
                errors.push(
                  `Radarr: ${humanizeArrError(error)}`,
                );
                return [];
              },
            ),
          );
        }
      }

      if (
        (item.hint === "series" || item.hint === "auto") &&
        sonarrConfigured
      ) {
        if (sonarrError) {
          errors.push(`Sonarr: ${sonarrError}`);
        } else {
          jobs.push(
            lookupSeries(
              settings,
              item,
              seriesIds,
              sonarrApiVersion,
            ).catch((error: unknown) => {
              errors.push(
                `Sonarr: ${humanizeArrError(error)}`,
              );
              return [];
            }),
          );
        }
      }

      const candidates = (await Promise.all(jobs))
        .flat()
        .sort((left, right) => right.score - left.score)
        .slice(0, item.hint === "auto" ? 8 : 5);

      return {
        item,
        candidates,
        error:
          candidates.length > 0
            ? null
            : errors.join(" | ") || "No matches found.",
      };
    },
  );
}
