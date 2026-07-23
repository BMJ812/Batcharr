import {
  describe,
  expect,
  it,
} from "vitest";
import { parseExternalList } from "../external-lists";

describe("parseExternalList", () => {
  it("extracts ranked title rows and paired release dates", () => {
    const result = parseExternalList(`
      Popular Movies
      1. Alien (1979)
      Ridley Scott
      2. The Thing
      1982-06-25
      Overview
      A research team discovers something terrible in Antarctica.
    `);

    expect(result.items).toHaveLength(2);

    expect(result.items[0]).toMatchObject({
      query: "Alien",
      year: 1979,
      hint: "auto",
    });

    expect(result.items[1]).toMatchObject({
      query: "The Thing",
      year: 1982,
      hint: "auto",
    });

    expect(
      result.warnings.join(" "),
    ).toMatch(/Ignored/);
  });

  it("preserves explicit movie and TV hints", () => {
    const result = parseExternalList(`
      TV: Dark
      December 1, 2017
      movie | Arrival - 2016
    `);

    expect(result.items).toHaveLength(2);

    expect(result.items[0]).toMatchObject({
      query: "Dark",
      year: 2017,
      hint: "series",
    });

    expect(result.items[1]).toMatchObject({
      query: "Arrival",
      year: 2016,
      hint: "movie",
    });
  });

  it("ignores navigation, URLs, ratings, and descriptive text", () => {
    const result = parseExternalList(`
      https://example.com/list/123
      Search
      1. Home (2015)
      Rating
      8.4/10
      A family searches for a safe place after a major disaster.
    `);

    expect(result.items).toHaveLength(1);

    expect(result.items[0]).toMatchObject({
      query: "Home",
      year: 2015,
    });
  });

  it("collapses IMDb image captions into their matching list titles", () => {
    const result = parseExternalList(`
      Kevin Smith, Marilyn Ghigliotti, Jeff Anderson, Brian O'Halloran, and Lisa Spoonauer in Clerks (1994)
      1. Clerks
      1994
      Dan Aykroyd, Jack Lemmon, and James Garner in My Fellow Americans (1996)
      62. My Fellow Americans
      1996
    `);

    expect(result.items).toHaveLength(2);

    expect(
      result.items.map((item) => ({
        query: item.query,
        year: item.year,
      })),
    ).toEqual([
      {
        query: "Clerks",
        year: 1994,
      },
      {
        query: "My Fellow Americans",
        year: 1996,
      },
    ]);

    expect(result.warnings).toContain(
      "Skipped 2 duplicate titles.",
    );
  });

  it("keeps remakes with different explicit years separate", () => {
    const result = parseExternalList(`
      1. The Thing (1951)
      2. The Thing (1982)
    `);

    expect(result.items).toHaveLength(2);

    expect(
      result.items.map((item) => item.year),
    ).toEqual([1951, 1982]);
  });

  it("deduplicates repeated title and year rows", () => {
    const result = parseExternalList(`
      1. Alien (1979)
      2. Alien (1979)
    `);

    expect(result.items).toHaveLength(1);

    expect(result.warnings).toContain(
      "Skipped 1 duplicate title.",
    );
  });

  it("does not mistake numeric movie titles for release years", () => {
    const result = parseExternalList(`
      1. Blade Runner 2049
      2. 1917 (2019)
    `);

    expect(
      result.items.map((item) => item.query),
    ).toEqual([
      "Blade Runner 2049",
      "1917",
    ]);

    expect(result.items[0].year).toBeNull();
    expect(result.items[1].year).toBe(2019);
  });

  it("rejects copied page text without recognizable title rows", () => {
    expect(() =>
      parseExternalList(`
        Home
        Search
        Sign in
        This page contains information about popular entertainment.
      `),
    ).toThrow(/No clear title rows were found/);
  });
});