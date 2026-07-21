import { confidenceFromScore, scoreMatch } from "@/lib/parser";
import { makeCandidateToken } from "@/lib/tokens";
import type {
  ConnectionTestResult,
  LookupCandidate,
  MediaType,
  ParsedListItem,
  StoredSettings,
} from "@/lib/types";

type JsonRecord = Record<string, unknown>;
type ApiVersion = "v3" | "v5";

export class ArrHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = "ArrHttpError";
  }
}

function normalizeUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL must begin with http:// or https://.");
  }
  return url;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object")
    : [];
}

async function parseErrorResponse(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) return response.statusText || `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") return String(item);
          const itemRecord = item as JsonRecord;
          return text(itemRecord.errorMessage) || text(itemRecord.message) || JSON.stringify(itemRecord);
        })
        .join("; ");
    }
    if (parsed && typeof parsed === "object") {
      const parsedRecord = parsed as JsonRecord;
      return text(parsedRecord.message) || text(parsedRecord.error) || body;
    }
  } catch {
    // Preserve the raw body when it is not JSON.
  }
  return body.slice(0, 1000);
}

async function arrFetch<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!apiKey.trim()) throw new Error("API key is required.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${normalizeUrl(baseUrl)}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": apiKey.trim(),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const details = await parseErrorResponse(response);
      throw new ArrHttpError(`Arr request failed with HTTP ${response.status}.`, response.status, details);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ArrHttpError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The Arr server did not respond within 20 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function systemName(status: JsonRecord): string {
  return text(status.instanceName) || text(status.appName) || "Arr instance";
}

function mapOptions(input: unknown): Array<{ id: number; name: string }> {
  return recordArray(input)
    .map((entry) => ({ id: numberValue(entry.id), name: text(entry.name) }))
    .filter((entry): entry is { id: number; name: string } => entry.id !== null && Boolean(entry.name));
}

function mapRootFolders(input: unknown): Array<{ id: number; path: string; freeSpace?: number }> {
  return recordArray(input)
    .map((entry) => {
      const id = numberValue(entry.id);
      const path = text(entry.path);
      const freeSpace = numberValue(entry.freeSpace);
      return { id, path, ...(freeSpace === null ? {} : { freeSpace }) };
    })
    .filter((entry): entry is { id: number; path: string; freeSpace?: number } => entry.id !== null && Boolean(entry.path));
}

export async function detectSonarrApiVersion(baseUrl: string, apiKey: string): Promise<ApiVersion> {
  try {
    await arrFetch<JsonRecord>(baseUrl, apiKey, "/api/v5/system/status");
    return "v5";
  } catch (error) {
    if (!(error instanceof ArrHttpError) || error.status !== 404) throw error;
    await arrFetch<JsonRecord>(baseUrl, apiKey, "/api/v3/system/status");
    return "v3";
  }
}

export async function testRadarrConnection(baseUrl: string, apiKey: string): Promise<ConnectionTestResult> {
  const [status, profiles, rootFolders] = await Promise.all([
    arrFetch<JsonRecord>(baseUrl, apiKey, "/api/v3/system/status"),
    arrFetch<unknown>(baseUrl, apiKey, "/api/v3/qualityprofile"),
    arrFetch<unknown>(baseUrl, apiKey, "/api/v3/rootfolder"),
  ]);

  return {
    service: "radarr",
    version: text(status.version) || "Unknown",
    apiVersion: "v3",
    instanceName: systemName(status),
    qualityProfiles: mapOptions(profiles),
    rootFolders: mapRootFolders(rootFolders),
  };
}

export async function testSonarrConnection(baseUrl: string, apiKey: string): Promise<ConnectionTestResult> {
  const apiVersion = await detectSonarrApiVersion(baseUrl, apiKey);
  const [status, profiles, rootFolders] = await Promise.all([
    arrFetch<JsonRecord>(baseUrl, apiKey, `/api/${apiVersion}/system/status`),
    arrFetch<unknown>(baseUrl, apiKey, `/api/${apiVersion}/qualityprofile`),
    arrFetch<unknown>(baseUrl, apiKey, `/api/${apiVersion}/rootfolder`),
  ]);

  return {
    service: "sonarr",
    version: text(status.version) || "Unknown",
    apiVersion,
    instanceName: systemName(status),
    qualityProfiles: mapOptions(profiles),
    rootFolders: mapRootFolders(rootFolders),
  };
}

function posterFromRecord(record: JsonRecord, baseUrl: string): string | null {
  const image = recordArray(record.images).find((entry) => text(entry.coverType).toLowerCase() === "poster");
  if (!image) return null;
  const remoteUrl = text(image.remoteUrl);
  if (remoteUrl) return remoteUrl;
  const url = text(image.url);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${normalizeUrl(baseUrl)}${url.startsWith("/") ? "" : "/"}${url}`;
}

function candidateFromRecord(
  type: MediaType,
  item: ParsedListItem,
  record: JsonRecord,
  baseUrl: string,
  existingIds: Set<number>,
): LookupCandidate | null {
  const externalId = numberValue(type === "movie" ? record.tmdbId : record.tvdbId);
  if (externalId === null) return null;
  const title = text(record.title);
  if (!title) return null;
  const year = numberValue(record.year);
  const score = scoreMatch(item.query, item.year, title, year);

  return {
    token: makeCandidateToken({ type, externalId, title, year }),
    type,
    title,
    year,
    overview: text(record.overview),
    posterUrl: posterFromRecord(record, baseUrl),
    externalId,
    score,
    confidence: confidenceFromScore(score),
    alreadyExists: existingIds.has(externalId),
  };
}

export async function fetchExistingMovieIds(settings: StoredSettings): Promise<Set<number>> {
  if (!settings.radarrUrl || !settings.radarrApiKey) return new Set();
  const movies = await arrFetch<unknown>(settings.radarrUrl, settings.radarrApiKey, "/api/v3/movie");
  return new Set(
    recordArray(movies)
      .map((movie) => numberValue(movie.tmdbId))
      .filter((id): id is number => id !== null),
  );
}

export async function fetchExistingSeriesIds(settings: StoredSettings): Promise<{ ids: Set<number>; apiVersion: ApiVersion }> {
  if (!settings.sonarrUrl || !settings.sonarrApiKey) return { ids: new Set(), apiVersion: "v3" };
  const apiVersion = await detectSonarrApiVersion(settings.sonarrUrl, settings.sonarrApiKey);
  const series = await arrFetch<unknown>(settings.sonarrUrl, settings.sonarrApiKey, `/api/${apiVersion}/series`);
  return {
    ids: new Set(
      recordArray(series)
        .map((entry) => numberValue(entry.tvdbId))
        .filter((id): id is number => id !== null),
    ),
    apiVersion,
  };
}

export async function lookupMovies(
  settings: StoredSettings,
  item: ParsedListItem,
  existingIds: Set<number>,
): Promise<LookupCandidate[]> {
  if (!settings.radarrUrl || !settings.radarrApiKey) return [];
  const term = item.year ? `${item.query} ${item.year}` : item.query;
  const results = await arrFetch<unknown>(
    settings.radarrUrl,
    settings.radarrApiKey,
    `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`,
  );

  return recordArray(results)
    .map((record) => candidateFromRecord("movie", item, record, settings.radarrUrl, existingIds))
    .filter((candidate): candidate is LookupCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

export async function lookupSeries(
  settings: StoredSettings,
  item: ParsedListItem,
  existingIds: Set<number>,
  apiVersion: ApiVersion,
): Promise<LookupCandidate[]> {
  if (!settings.sonarrUrl || !settings.sonarrApiKey) return [];
  const term = item.year ? `${item.query} ${item.year}` : item.query;
  const results = await arrFetch<unknown>(
    settings.sonarrUrl,
    settings.sonarrApiKey,
    `/api/${apiVersion}/series/lookup?term=${encodeURIComponent(term)}`,
  );

  return recordArray(results)
    .map((record) => candidateFromRecord("series", item, record, settings.sonarrUrl, existingIds))
    .filter((candidate): candidate is LookupCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function firstRecord(value: unknown): JsonRecord {
  const first = recordArray(value)[0];
  if (!first) throw new Error("The selected title could not be resolved again before adding.");
  return first;
}

export async function addMovie(settings: StoredSettings, externalId: number): Promise<JsonRecord> {
  if (!settings.radarrUrl || !settings.radarrApiKey) throw new Error("Radarr is not configured.");
  if (!settings.radarrRootFolderPath || !settings.radarrQualityProfileId) {
    throw new Error("Select a Radarr root folder and quality profile in Settings.");
  }

  const lookup = await arrFetch<unknown>(
    settings.radarrUrl,
    settings.radarrApiKey,
    `/api/v3/movie/lookup?term=${encodeURIComponent(`tmdb:${externalId}`)}`,
  );
  const movie = firstRecord(lookup);
  const payload = {
    ...movie,
    id: 0,
    rootFolderPath: settings.radarrRootFolderPath,
    qualityProfileId: settings.radarrQualityProfileId,
    minimumAvailability: settings.radarrMinimumAvailability,
    monitored: settings.radarrMonitored,
    addOptions: {
      searchForMovie: settings.radarrSearchOnAdd,
    },
  };

  return arrFetch<JsonRecord>(settings.radarrUrl, settings.radarrApiKey, "/api/v3/movie", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function addSeries(settings: StoredSettings, externalId: number): Promise<JsonRecord> {
  if (!settings.sonarrUrl || !settings.sonarrApiKey) throw new Error("Sonarr is not configured.");
  if (!settings.sonarrRootFolderPath || !settings.sonarrQualityProfileId) {
    throw new Error("Select a Sonarr root folder and quality profile in Settings.");
  }

  const apiVersion = await detectSonarrApiVersion(settings.sonarrUrl, settings.sonarrApiKey);
  const lookup = await arrFetch<unknown>(
    settings.sonarrUrl,
    settings.sonarrApiKey,
    `/api/${apiVersion}/series/lookup?term=${encodeURIComponent(`tvdb:${externalId}`)}`,
  );
  const series = firstRecord(lookup);
  const payload = {
    ...series,
    id: 0,
    rootFolderPath: settings.sonarrRootFolderPath,
    qualityProfileId: settings.sonarrQualityProfileId,
    monitored: true,
    seasonFolder: settings.sonarrSeasonFolder,
    seriesType: settings.sonarrSeriesType,
    addOptions: {
      monitor: settings.sonarrMonitor,
      searchForMissingEpisodes: settings.sonarrSearchOnAdd,
      searchForCutoffUnmetEpisodes: false,
    },
  };

  return arrFetch<JsonRecord>(settings.sonarrUrl, settings.sonarrApiKey, `/api/${apiVersion}/series`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function humanizeArrError(error: unknown): string {
  if (error instanceof ArrHttpError) return error.details || error.message;
  if (error instanceof Error) return error.message;
  return "Unknown Arr error.";
}
