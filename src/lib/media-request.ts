import {
  addMovie,
  addSeries,
  fetchExistingMovieIds,
  fetchExistingSeriesIds,
  humanizeArrError,
} from "@/lib/arr";
import { addHistory, readSettings } from "@/lib/db";
import { readCandidateToken } from "@/lib/tokens";
import type { MediaType } from "@/lib/types";

export interface MediaRequestSelection {
  type: MediaType;
  externalId: number;
  title: string;
  year: number | null;
}

export interface MediaRequestResult {
  status: "added" | "duplicate";
  message: string;
  title: string;
  year: number | null;
  type: MediaType;
}

export async function submitMediaSelection(
  selected: MediaRequestSelection,
): Promise<MediaRequestResult> {
  const settings = readSettings();

  try {
    const existing =
      selected.type === "movie"
        ? await fetchExistingMovieIds(settings)
        : (await fetchExistingSeriesIds(settings)).ids;

    if (existing.has(selected.externalId)) {
      const message =
        "Already exists in the target Arr library.";

      addHistory({
        mediaType: selected.type,
        title: selected.title,
        year: selected.year,
        externalId: selected.externalId,
        status: "duplicate",
        message,
      });

      return {
        status: "duplicate",
        message,
        title: selected.title,
        year: selected.year,
        type: selected.type,
      };
    }

    if (selected.type === "movie") {
      await addMovie(settings, selected.externalId);
    } else {
      await addSeries(settings, selected.externalId);
    }

    const message =
      selected.type === "movie"
        ? "Added to Radarr."
        : "Added to Sonarr.";

    addHistory({
      mediaType: selected.type,
      title: selected.title,
      year: selected.year,
      externalId: selected.externalId,
      status: "added",
      message,
    });

    return {
      status: "added",
      message,
      title: selected.title,
      year: selected.year,
      type: selected.type,
    };
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

    throw new Error(message);
  }
}

export async function submitMediaRequest(
  token: string,
): Promise<MediaRequestResult> {
  return submitMediaSelection(
    readCandidateToken(token),
  );
}
