import { describe, expect, it } from "vitest";
import { parseMediaList, scoreMatch } from "../parser";

describe("parseMediaList", () => {
  it("parses prefixes, years, numbering, and duplicates", () => {
    const result = parseMediaList(`
      1. The Thing (1982)
      movie: Alien
      TV | The Expanse - 2015
      - The Thing (1982)
    `);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ query: "The Thing", year: 1982, hint: "auto" });
    expect(result[1]).toMatchObject({ query: "Alien", year: null, hint: "movie" });
    expect(result[2]).toMatchObject({ query: "The Expanse", year: 2015, hint: "series" });
  });
});

describe("scoreMatch", () => {
  it("rates exact title and year matches highly", () => {
    expect(scoreMatch("The Thing", 1982, "The Thing", 1982)).toBeGreaterThanOrEqual(95);
  });

  it("penalizes an incorrect year", () => {
    expect(scoreMatch("The Thing", 1982, "The Thing", 2011)).toBeLessThan(
      scoreMatch("The Thing", 1982, "The Thing", 1982),
    );
  });
});
