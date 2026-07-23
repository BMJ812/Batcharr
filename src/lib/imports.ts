import crypto from "node:crypto";
import { MAX_BATCH_ITEMS, MAX_IMPORT_FILE_BYTES } from "@/lib/limits";
import { normalizeTitle, parseMediaList } from "@/lib/parser";
import type {
  MediaHint,
  MediaType,
  ParsedListItem,
} from "@/lib/types";

const YEAR_PATTERN = /^(?:19|20)\d{2}$/;

type ImportFileType = "txt" | "csv" | "json";

export interface ImportFileResult {
  source: {
    type: ImportFileType;
    name: string;
  };
  items: ParsedListItem[];
  warnings: string[];
}

interface StructuredImportRow {
  title?: unknown;
  year?: unknown;
  type?: unknown;
  tmdbId?: unknown;
  tvdbId?: unknown;
}

function extensionFromFilename(filename: string): ImportFileType {
  const extension = filename.trim().toLowerCase().split(".").pop();

  if (extension === "txt" || extension === "csv" || extension === "json") {
    return extension;
  }

  throw new Error("Batcharr accepts TXT, CSV, or JSON import files.");
}

function parseYear(value: unknown, rowLabel: string): number | null {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();
  if (!YEAR_PATTERN.test(text)) {
    throw new Error(`${rowLabel} has an invalid year: ${text}.`);
  }

  return Number(text);
}

function parseHint(value: unknown, defaultHint: MediaHint): MediaHint {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) return defaultHint;
  if (normalized === "movie" || normalized === "film") return "movie";
  if (["tv", "show", "series", "television"].includes(normalized)) {
    return "series";
  }
  if (normalized === "auto") return "auto";

  throw new Error(`Unsupported media type: ${String(value)}.`);
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
  rowLabel: string,
): number | null {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) <= 0) {
    throw new Error(`${rowLabel} has an invalid ${fieldName}: ${text}.`);
  }

  return Number(text);
}

function structuredRowToItem(
  row: StructuredImportRow,
  defaultHint: MediaHint,
  rowLabel: string,
): ParsedListItem {
  const query = String(row.title ?? "").trim();
  if (!query) throw new Error(`${rowLabel} is missing a title.`);

  const year = parseYear(row.year, rowLabel);
  const hint = parseHint(row.type, defaultHint);
  const tmdbId = parsePositiveInteger(row.tmdbId, "TMDb ID", rowLabel);
  const tvdbId = parsePositiveInteger(row.tvdbId, "TVDb ID", rowLabel);

  if (tmdbId && tvdbId) {
    throw new Error(`${rowLabel} cannot contain both a TMDb ID and a TVDb ID.`);
  }

  if (tmdbId && hint === "series") {
    throw new Error(
      `${rowLabel} supplies a TMDb ID for a TV series. Sonarr requires a TVDb ID for exact matching.`,
    );
  }

  if (tvdbId && hint === "movie") {
    throw new Error(
      `${rowLabel} supplies a TVDb ID for a movie. Radarr requires a TMDb ID for exact matching.`,
    );
  }

  const exactMatch = tmdbId
    ? { type: "movie" as MediaType, externalId: tmdbId }
    : tvdbId
      ? { type: "series" as MediaType, externalId: tvdbId }
      : undefined;

  const resolvedHint = exactMatch?.type ?? hint;
  const original = year ? `${query} (${year})` : query;

  return {
    id: crypto.randomUUID(),
    original,
    query,
    year,
    hint: resolvedHint,
    ...(exactMatch ? { exactMatch } : {}),
  };
}

function deduplicateItems(items: ParsedListItem[]): {
  items: ParsedListItem[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const unique: ParsedListItem[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    const key = item.exactMatch
      ? `${item.exactMatch.type}:id:${item.exactMatch.externalId}`
      : `${item.hint}:title:${normalizeTitle(item.query)}:${item.year ?? ""}`;

    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return { items: unique, duplicateCount };
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";

      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += character;
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);

  return rows;
}

function canonicalHeader(value: string): keyof StructuredImportRow | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "title" || normalized === "name") return "title";
  if (normalized === "year" || normalized === "release_year") return "year";
  if (normalized === "type" || normalized === "media_type") return "type";
  if (normalized === "tmdb" || normalized === "tmdb_id") return "tmdbId";
  if (normalized === "tvdb" || normalized === "tvdb_id") return "tvdbId";
  return null;
}

function parseCsvImport(
  content: string,
  defaultHint: MediaHint,
): ParsedListItem[] {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new Error("The CSV file must contain a header row and at least one title row.");
  }

  const headers = rows[0].map(canonicalHeader);
  if (!headers.includes("title")) {
    throw new Error("The CSV header must include a title column.");
  }

  return rows.slice(1).map((values, index) => {
    const record: StructuredImportRow = {};

    headers.forEach((header, columnIndex) => {
      if (header) record[header] = values[columnIndex] ?? "";
    });

    return structuredRowToItem(record, defaultHint, `CSV row ${index + 2}`);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonField(
  record: Record<string, unknown>,
  names: string[],
): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  }
  return undefined;
}

function parseJsonImport(
  content: string,
  defaultHint: MediaHint,
): ParsedListItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("The JSON file is not valid JSON.");
  }

  const values = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : null;

  if (!values) {
    throw new Error('JSON imports must be an array or an object with an "items" array.');
  }

  return values.map((value, index) => {
    if (!isRecord(value)) {
      throw new Error(`JSON item ${index + 1} must be an object.`);
    }

    return structuredRowToItem(
      {
        title: readJsonField(value, ["title", "name"]),
        year: readJsonField(value, ["year", "releaseYear", "release_year"]),
        type: readJsonField(value, ["type", "mediaType", "media_type"]),
        tmdbId: readJsonField(value, ["tmdbId", "tmdb_id", "tmdb"]),
        tvdbId: readJsonField(value, ["tvdbId", "tvdb_id", "tvdb"]),
      },
      defaultHint,
      `JSON item ${index + 1}`,
    );
  });
}

export function parseImportFile(
  filename: string,
  content: string,
  defaultHint: MediaHint = "auto",
): ImportFileResult {
  const name = filename.trim();
  if (!name) throw new Error("An import filename is required.");

  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new Error("Import files are limited to 2 MiB.");
  }

  const type = extensionFromFilename(name);
  const parsed =
    type === "txt"
      ? parseMediaList(content, defaultHint)
      : type === "csv"
        ? parseCsvImport(content, defaultHint)
        : parseJsonImport(content, defaultHint);

  const { items, duplicateCount } = deduplicateItems(parsed);

  if (!items.length) {
    throw new Error("No usable titles were found in the import file.");
  }

  if (items.length > MAX_BATCH_ITEMS) {
    throw new Error(
      `Batcharr is limited to ${MAX_BATCH_ITEMS} unique titles per batch.`,
    );
  }

  const warnings = duplicateCount
    ? [`Skipped ${duplicateCount} duplicate ${duplicateCount === 1 ? "entry" : "entries"}.`]
    : [];

  return {
    source: { type, name },
    items,
    warnings,
  };
}
