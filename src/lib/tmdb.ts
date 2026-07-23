import crypto from "node:crypto";
import { MAX_BATCH_ITEMS } from "./limits";
import type { ParsedListItem } from "./types";

const TMDB_API_BASE = "https://api.themoviedb.org/4";
const TMDB_V3_API_BASE = "https://api.themoviedb.org/3";
const TMDB_WEB_HOSTS = new Set([
  "themoviedb.org",
  "www.themoviedb.org",
]);
const MAX_TMDB_PAGES = 20;
const TMDB_REQUEST_TIMEOUT_MS = 10_000;
const YEAR_PATTERN = /^(?:19|20)\d{2}/;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface TmdbListPagePayload {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  page?: unknown;
  total_pages?: unknown;
  total_results?: unknown;
  results?: unknown;
}

interface NormalizedTmdbItem {
  key: string;
  item: ParsedListItem;
}

export interface TmdbNormalizedItems {
  items: ParsedListItem[];
  skippedCount: number;
  duplicateCount: number;
}

export interface TmdbListImportResult {
  source: {
    type: "tmdb";
    id: number;
    name: string;
    description: string;
    canonicalUrl: string;
    attribution: string;
  };
  items: ParsedListItem[];
  warnings: string[];
  truncated: boolean;
  totalAvailable: number;
}

export interface TmdbConnectionTestResult {
  service: "tmdb";
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function yearFromDate(value: unknown): number | null {
  const text = stringValue(value);
  const match = text.match(YEAR_PATTERN);

  return match ? Number(match[0]) : null;
}

function parsePositiveListId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("The TMDb list ID must contain only digits.");
  }

  const listId = Number(value);

  if (!Number.isSafeInteger(listId) || listId <= 0) {
    throw new Error("The TMDb list ID is invalid.");
  }

  return listId;
}

/**
 * Accepts either a numeric TMDb list ID or a public TMDb list URL.
 *
 * The returned ID is later used with Batcharr's fixed TMDb API base URL.
 * Batcharr never sends an HTTP request to the user-provided URL.
 */
export function parseTmdbListInput(input: string): number {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Enter a TMDb list URL or numeric list ID.");
  }

  if (/^\d+$/.test(trimmed)) {
    return parsePositiveListId(trimmed);
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid TMDb list URL or numeric list ID.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("TMDb list URLs must use HTTPS.");
  }

  if (!TMDB_WEB_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Only public themoviedb.org list URLs are supported.");
  }

  if (parsed.username || parsed.password || parsed.port) {
    throw new Error("The TMDb list URL contains unsupported connection details.");
  }

  const match = parsed.pathname.match(/^\/list\/(\d+)(?:-[^/]+)?\/?$/i);

  if (!match) {
    throw new Error("The URL is not a recognized TMDb list URL.");
  }

  return parsePositiveListId(match[1]);
}

function normalizeTmdbItem(value: unknown): NormalizedTmdbItem | null {
  if (!isRecord(value)) return null;

  const externalId = positiveInteger(value.id);
  const mediaType = stringValue(value.media_type).toLowerCase();

  if (!externalId || (mediaType !== "movie" && mediaType !== "tv")) {
    return null;
  }

  const title =
    mediaType === "movie"
      ? stringValue(value.title) || stringValue(value.original_title)
      : stringValue(value.name) || stringValue(value.original_name);

  if (!title) return null;

  const year =
    mediaType === "movie"
      ? yearFromDate(value.release_date)
      : yearFromDate(value.first_air_date);

  const original = year ? `${title} (${year})` : title;

  return {
    key: `${mediaType}:${externalId}`,
    item: {
      id: crypto.randomUUID(),
      original,
      query: title,
      year,
      hint: mediaType === "movie" ? "movie" : "series",
      ...(mediaType === "movie"
        ? {
            exactMatch: {
              type: "movie" as const,
              externalId,
            },
          }
        : {}),
    },
  };
}

export function normalizeTmdbListItems(
  values: unknown[],
): TmdbNormalizedItems {
  const items: ParsedListItem[] = [];
  const seen = new Set<string>();
  let skippedCount = 0;
  let duplicateCount = 0;

  for (const value of values) {
    const normalized = normalizeTmdbItem(value);

    if (!normalized) {
      skippedCount += 1;
      continue;
    }

    if (seen.has(normalized.key)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(normalized.key);
    items.push(normalized.item);
  }

  return {
    items,
    skippedCount,
    duplicateCount,
  };
}

async function fetchTmdbListPage(
  listId: number,
  page: number,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<TmdbListPagePayload> {
  const target = new URL(`${TMDB_API_BASE}/list/${listId}`);
  target.searchParams.set("page", String(page));

  const response = await fetchImpl(target, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "TMDb rejected the API Read Access Token.",
      );
    }

    if (response.status === 404) {
      throw new Error(
        "The TMDb list was not found or is not publicly accessible.",
      );
    }

    throw new Error(
      `TMDb list lookup failed with HTTP ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("TMDb returned an invalid JSON response.");
  }

  if (!isRecord(payload)) {
    throw new Error("TMDb returned an invalid list response.");
  }

  return payload as TmdbListPagePayload;
}

export async function testTmdbAccessToken(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TmdbConnectionTestResult> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error("A TMDb API Read Access Token is required.");
  }

  const target = new URL(
    `${TMDB_V3_API_BASE}/configuration/countries`,
  );
  target.searchParams.set("language", "en-US");

  const response = await fetchImpl(target, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "TMDb rejected the API Read Access Token.",
      );
    }

    throw new Error(
      `TMDb connection test failed with HTTP ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "TMDb returned an invalid connection-test response.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error(
      "TMDb returned an unexpected connection-test response.",
    );
  }

  return {
    service: "tmdb",
    message: "TMDb API Read Access Token connected.",
  };
}

export async function importTmdbList(
  input: string,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TmdbListImportResult> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error("A TMDb API Read Access Token is required.");
  }

  const listId = parseTmdbListInput(input);
  const rawItems: unknown[] = [];

  let name = `TMDb list ${listId}`;
  let description = "";
  let totalPages = 1;
  let totalAvailable = 0;
  let lastPageFetched = 0;

  for (
    let page = 1;
    page <= totalPages &&
    page <= MAX_TMDB_PAGES &&
    rawItems.length < MAX_BATCH_ITEMS;
    page += 1
  ) {
    const payload = await fetchTmdbListPage(
      listId,
      page,
      token,
      fetchImpl,
    );

    lastPageFetched = page;

    if (page === 1) {
      name = stringValue(payload.name) || name;
      description = stringValue(payload.description);
    }

    const reportedTotalPages = positiveInteger(payload.total_pages);
    const reportedTotalResults = positiveInteger(payload.total_results);

    totalPages = reportedTotalPages ?? totalPages;
    totalAvailable = reportedTotalResults ?? totalAvailable;

    if (!Array.isArray(payload.results)) {
      throw new Error("TMDb returned a list without a results array.");
    }

    rawItems.push(...payload.results);
  }

  const truncated =
    rawItems.length > MAX_BATCH_ITEMS ||
    lastPageFetched < totalPages;

  const limitedItems = rawItems.slice(0, MAX_BATCH_ITEMS);
  const normalized = normalizeTmdbListItems(limitedItems);
  const warnings: string[] = [];

  if (normalized.skippedCount > 0) {
    warnings.push(
      `Skipped ${normalized.skippedCount} unsupported or incomplete ${
        normalized.skippedCount === 1 ? "entry" : "entries"
      }.`,
    );
  }

  if (normalized.duplicateCount > 0) {
    warnings.push(
      `Skipped ${normalized.duplicateCount} duplicate ${
        normalized.duplicateCount === 1 ? "entry" : "entries"
      }.`,
    );
  }

  if (truncated) {
    warnings.push(
      `Only the first ${MAX_BATCH_ITEMS} TMDb entries were loaded.`,
    );
  }

  if (!normalized.items.length) {
    throw new Error("The TMDb list did not contain any usable movie or TV entries.");
  }

  return {
    source: {
      type: "tmdb",
      id: listId,
      name,
      description,
      canonicalUrl: `https://www.themoviedb.org/list/${listId}`,
      attribution:
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    },
    items: normalized.items,
    warnings,
    truncated,
    totalAvailable: totalAvailable || rawItems.length,
  };
}