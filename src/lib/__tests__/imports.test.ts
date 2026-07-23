import { describe, expect, it } from "vitest";
import { parseImportFile } from "../imports";

describe("parseImportFile", () => {
  it("reuses the existing text-list grammar for TXT files", () => {
    const result = parseImportFile(
      "horror.txt",
      "movie: Alien (1979)\ntv: Dark (2017)",
    );

    expect(result.source).toEqual({ type: "txt", name: "horror.txt" });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      query: "Alien",
      year: 1979,
      hint: "movie",
    });
    expect(result.items[1]).toMatchObject({
      query: "Dark",
      year: 2017,
      hint: "series",
    });
  });

  it("parses quoted CSV titles and exact Arr identifiers", () => {
    const result = parseImportFile(
      "requests.csv",
      [
        "title,year,type,tmdb_id,tvdb_id",
        '"Dude, Where\'s My Car?",2000,movie,8859,',
        "Dark,2017,series,,334824",
      ].join("\n"),
    );

    expect(result.items[0]).toMatchObject({
      query: "Dude, Where's My Car?",
      year: 2000,
      hint: "movie",
      exactMatch: { type: "movie", externalId: 8859 },
    });
    expect(result.items[1]).toMatchObject({
      query: "Dark",
      hint: "series",
      exactMatch: { type: "series", externalId: 334824 },
    });
  });

  it("accepts a top-level JSON array and removes exact-ID duplicates", () => {
    const result = parseImportFile(
      "requests.json",
      JSON.stringify([
        { title: "Alien", year: 1979, type: "movie", tmdbId: 348 },
        { title: "Alien duplicate", year: 1979, type: "movie", tmdbId: 348 },
      ]),
    );

    expect(result.items).toHaveLength(1);
    expect(result.warnings).toEqual(["Skipped 1 duplicate entry."]);
  });

  it("rejects TMDb identifiers used as exact Sonarr identifiers", () => {
    expect(() =>
      parseImportFile(
        "requests.json",
        JSON.stringify({
          items: [
            { title: "Dark", type: "series", tmdbId: 70523 },
          ],
        }),
      ),
    ).toThrow(/Sonarr requires a TVDb ID/);
  });

  it("enforces the shared 200-title batch limit", () => {
    const items = Array.from({ length: 201 }, (_, index) => ({
      title: `Movie ${index + 1}`,
      type: "movie",
    }));

    expect(() =>
      parseImportFile("requests.json", JSON.stringify(items)),
    ).toThrow(/limited to 200 unique titles/);
  });

  it("rejects unsupported file types", () => {
    expect(() => parseImportFile("requests.xlsx", "data")).toThrow(
      /accepts TXT, CSV, or JSON/,
    );
  });
});
