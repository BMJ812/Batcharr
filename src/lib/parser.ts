import crypto from "node:crypto";
import type { MediaHint, ParsedListItem } from "@/lib/types";

const PREFIX_PATTERN = /^(movie|film|tv|show|series)\s*(?:\||:|-)+\s*/i;
const YEAR_PATTERN = /(?:\s*[\[(]\s*((?:19|20)\d{2})\s*[\])]|\s+-\s+((?:19|20)\d{2}))\s*$/;

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseMediaList(text: string, defaultHint: MediaHint = "auto"): ParsedListItem[] {
  const seen = new Set<string>();
  const parsed: ParsedListItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine
      .trim()
      .replace(/^[-*•]+\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (!line) continue;

    let hint = defaultHint;
    const prefix = line.match(PREFIX_PATTERN);
    if (prefix) {
      hint = /^(movie|film)$/i.test(prefix[1]) ? "movie" : "series";
      line = line.slice(prefix[0].length).trim();
    }

    const yearMatch = line.match(YEAR_PATTERN);
    const yearText = yearMatch?.[1] ?? yearMatch?.[2] ?? null;
    const year = yearText ? Number(yearText) : null;
    const query = yearMatch ? line.slice(0, yearMatch.index).trim() : line;
    if (!query) continue;

    const key = `${hint}:${normalizedKey(query)}:${year ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    parsed.push({
      id: crypto.randomUUID(),
      original: rawLine.trim(),
      query,
      year,
      hint,
    });
  }

  return parsed;
}

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function scoreMatch(inputTitle: string, inputYear: number | null, title: string, year: number | null): number {
  const input = normalizeTitle(inputTitle);
  const candidate = normalizeTitle(title);
  if (!input || !candidate) return 0;

  const distance = levenshtein(input, candidate);
  const similarity = 1 - distance / Math.max(input.length, candidate.length);
  let score = Math.round(Math.max(0, similarity) * 80);

  if (input === candidate) score += 15;
  if (inputYear && year === inputYear) score += 10;
  if (inputYear && year && year !== inputYear) score -= Math.min(20, Math.abs(year - inputYear) * 3);
  if (candidate.startsWith(input) || input.startsWith(candidate)) score += 4;

  return Math.max(0, Math.min(100, score));
}

export function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 92) return "high";
  if (score >= 72) return "medium";
  return "low";
}
