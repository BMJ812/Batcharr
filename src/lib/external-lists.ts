import crypto from "node:crypto";
import {
  MAX_BATCH_ITEMS,
  MAX_IMPORT_FILE_BYTES,
} from "./limits";
import { normalizeTitle } from "./parser";
import type {
  MediaHint,
  ParsedListItem,
} from "./types";

const TYPE_PREFIX_PATTERN =
  /^(movie|film|tv|show|series)\s*(?:\||:|-)+\s*/i;
const RANK_PREFIX_PATTERN =
  /^(?:[-*•▪◦]+\s+|\d{1,4}[.)]\s+)/;
const URL_PATTERN = /^(?:https?:\/\/|www\.)/i;
const YEAR_PATTERN = /\b((?:19|20)\d{2})\b/;
const MAX_REASONABLE_YEAR =
  new Date().getUTCFullYear() + 2;

const NOISE_LINES = new Set([
  "add to list",
  "back to top",
  "cast",
  "crew",
  "discover",
  "filter",
  "genres",
  "home",
  "join tmdb",
  "language",
  "load more",
  "movies",
  "next",
  "overview",
  "play trailer",
  "popular",
  "previous",
  "recommendations",
  "release date",
  "reviews",
  "runtime",
  "search",
  "sign in",
  "sort by",
  "status",
  "trailer",
  "tv shows",
  "watchlist",
  "where to watch",
]);

export interface ExternalListImportResult {
  source: {
    type: "external";
    name: string;
  };
  items: ParsedListItem[];
  warnings: string[];
}

interface CandidateLine {
  item: ParsedListItem;
  structured: boolean;
  hasYear: boolean;
}

function cleanLine(value: string): string {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function reasonableYear(
  value: string | undefined,
): number | null {
  if (!value) return null;

  const year = Number(value);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > MAX_REASONABLE_YEAR
  ) {
    return null;
  }

  return year;
}

function metadataYear(value: string): number | null {
  const line = cleanLine(value);
  const match = line.match(YEAR_PATTERN);

  if (!match) return null;

  const year = reasonableYear(match[1]);

  if (!year) return null;

  const pureYear =
    /^(?:19|20)\d{2}$/.test(line);

  const isoDate =
    /^(?:19|20)\d{2}-\d{1,2}-\d{1,2}$/.test(line);

  const numericDate =
    /^\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}$/.test(
      line,
    );

  const namedDate =
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b.*\b(?:19|20)\d{2}$/i.test(
      line,
    );

  return pureYear ||
    isoDate ||
    numericDate ||
    namedDate
    ? year
    : null;
}

function trailingYear(value: string): {
  title: string;
  year: number | null;
} {
  const bracketed = value.match(
    /^(.*?)\s*[\[(]\s*((?:19|20)\d{2})\s*[\])]\s*$/,
  );

  if (bracketed) {
    const year = reasonableYear(bracketed[2]);

    if (year) {
      return {
        title: bracketed[1].trim(),
        year,
      };
    }
  }

  const delimited = value.match(
    /^(.*?)\s+[-–—|•·]\s*((?:19|20)\d{2})\s*$/,
  );

  if (delimited) {
    const year = reasonableYear(delimited[2]);

    if (year) {
      return {
        title: delimited[1].trim(),
        year,
      };
    }
  }

  const plain = value.match(
    /^(.*?)\s+((?:19|20)\d{2})\s*$/,
  );

  if (plain) {
    const year = reasonableYear(plain[2]);

    if (year) {
      return {
        title: plain[1].trim(),
        year,
      };
    }
  }

  return {
    title: value.trim(),
    year: null,
  };
}

function isNoiseLine(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return (
    NOISE_LINES.has(normalized) ||
    /^(?:page|results?|showing|rating|ratings|average rating)\b/i.test(
      normalized,
    ) ||
    /^(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\/10|\d+\s*(?:min|mins|minutes))$/i.test(
      normalized,
    )
  );
}

function isPlausibleTitle(
  value: string,
  structured: boolean,
): boolean {
  const title = cleanLine(value);

  if (!title || title.length > 160) return false;

  if (
    URL_PATTERN.test(title) ||
    /^\S+@\S+\.\S+$/.test(title)
  ) {
    return false;
  }

  if (/^[\d\W]+$/.test(title) && !structured) {
    return false;
  }

  if (!structured && isNoiseLine(title)) {
    return false;
  }

  const words = title
    .split(/\s+/)
    .filter(Boolean);

  if (words.length > 18) return false;

  if (
    words.length > 8 &&
    /[.!?]$/.test(title)
  ) {
    return false;
  }

  return true;
}

function parseCandidateLine(
  rawLine: string,
  defaultHint: MediaHint,
  forcedYear: number | null = null,
  allowUnstructured = false,
): CandidateLine | null {
  let line = cleanLine(rawLine);
  const ranked = RANK_PREFIX_PATTERN.test(line);

  if (ranked) {
    line = line
      .replace(RANK_PREFIX_PATTERN, "")
      .trim();
  }

  let hint = defaultHint;
  const prefix = line.match(TYPE_PREFIX_PATTERN);

  if (prefix) {
    hint = /^(movie|film)$/i.test(prefix[1])
      ? "movie"
      : "series";

    line = line
      .slice(prefix[0].length)
      .trim();
  }

  const extracted = trailingYear(line);
  const year = forcedYear ?? extracted.year;

  const structured =
    ranked ||
    Boolean(prefix) ||
    Boolean(extracted.year);

  if (!structured && !allowUnstructured) {
    return null;
  }

  if (
    !isPlausibleTitle(
      extracted.title,
      structured || allowUnstructured,
    )
  ) {
    return null;
  }

  const original = year
    ? `${extracted.title} (${year})`
    : extracted.title;

  return {
    structured,
    hasYear: Boolean(year),
    item: {
      id: crypto.randomUUID(),
      original,
      query: extracted.title,
      year,
      hint,
    },
  };
}

export function parseExternalList(
  text: string,
  defaultHint: MediaHint = "auto",
): ExternalListImportResult {
  if (
    Buffer.byteLength(text, "utf8") >
    MAX_IMPORT_FILE_BYTES
  ) {
    throw new Error(
      "Copied list text is limited to 2 MiB.",
    );
  }

  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const seen = new Set<string>();
  const items: ParsedListItem[] = [];

  let ignoredCount = 0;
  let duplicateCount = 0;

  function add(candidate: CandidateLine): void {
    const item = candidate.item;

    const key =
      `${item.hint}:` +
      `${normalizeTitle(item.query)}:` +
      `${item.year ?? ""}`;

    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }

    seen.add(key);
    items.push(item);
  }

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const line = lines[index];

    const direct = parseCandidateLine(
      line,
      defaultHint,
    );

    const nextYear =
      index + 1 < lines.length
        ? metadataYear(lines[index + 1])
        : null;

    if (
      nextYear &&
      (!direct || !direct.hasYear)
    ) {
      const paired = parseCandidateLine(
        line,
        defaultHint,
        nextYear,
        true,
      );

      if (paired) {
        add(paired);
        index += 1;
        continue;
      }
    }

    if (direct) {
      add(direct);
      continue;
    }

    ignoredCount += 1;
  }

  if (!items.length) {
    throw new Error(
      "No clear title rows were found. Copy the visible list entries with their years, or use Paste list for a clean title-only list.",
    );
  }

  const truncated =
    items.length > MAX_BATCH_ITEMS;

  const limitedItems =
    items.slice(0, MAX_BATCH_ITEMS);

  const warnings: string[] = [];

  if (ignoredCount > 0) {
    warnings.push(
      `Ignored ${ignoredCount} page-navigation or metadata ${
        ignoredCount === 1 ? "line" : "lines"
      }.`,
    );
  }

  if (duplicateCount > 0) {
    warnings.push(
      `Skipped ${duplicateCount} duplicate ${
        duplicateCount === 1 ? "title" : "titles"
      }.`,
    );
  }

  if (truncated) {
    warnings.push(
      `Only the first ${MAX_BATCH_ITEMS} unique titles were loaded.`,
    );
  }

  return {
    source: {
      type: "external",
      name: "Copied external list",
    },
    items: limitedItems,
    warnings,
  };
}