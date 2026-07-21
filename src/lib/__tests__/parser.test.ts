import { describe, expect, it } from "vitest";
import {
  parseMediaList,
  scoreMatch,
  splitMediaInput,
} from "../parser";

describe("splitMediaInput", () => {
  it("splits newline-separated titles", () => {
    expect(
      splitMediaInput(`
        Alien
        Predator
        Event Horizon
      `),
    ).toEqual(["Alien", "Predator", "Event Horizon"]);
  });

  it("splits a comma-separated pasted list", () => {
    expect(
      splitMediaInput("Alien, Predator, Event Horizon"),
    ).toEqual(["Alien", "Predator", "Event Horizon"]);
  });

  it("splits semicolon and tab separated titles", () => {
    expect(
      splitMediaInput("Alien; Predator\tEvent Horizon"),
    ).toEqual(["Alien", "Predator", "Event Horizon"]);
  });

  it("preserves commas inside quoted titles", () => {
    expect(
      splitMediaInput(
        "\"Dude, Where's My Car?\", Alien, \"Good Night, and Good Luck.\"",
      ),
    ).toEqual([
      "Dude, Where's My Car?",
      "Alien",
      "Good Night, and Good Luck.",
    ]);
  });

  it("preserves commas in a year-qualified single title", () => {
    expect(
      splitMediaInput("Planes, Trains and Automobiles (1987)"),
    ).toEqual(["Planes, Trains and Automobiles (1987)"]);
  });
});

describe("parseMediaList", () => {
  it("parses prefixes, years, numbering, and duplicates", () => {
    const result = parseMediaList(`
      1. The Thing (1982)
      movie: Alien
      TV | The Expanse - 2015
      - The Thing (1982)
    `);

    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({
      query: "The Thing",
      year: 1982,
      hint: "auto",
    });

    expect(result[1]).toMatchObject({
      query: "Alien",
      year: null,
      hint: "movie",
    });

    expect(result[2]).toMatchObject({
      query: "The Expanse",
      year: 2015,
      hint: "series",
    });
  });

  it("parses a comma-separated list as separate titles", () => {
    const result = parseMediaList(
      "Alien, Predator, Event Horizon",
    );

    expect(result.map((item) => item.query)).toEqual([
      "Alien",
      "Predator",
      "Event Horizon",
    ]);
  });

  it("parses quoted comma-containing titles", () => {
    const result = parseMediaList(
      "\"Dude, Where's My Car?\", Alien",
    );

    expect(result.map((item) => item.query)).toEqual([
      "Dude, Where's My Car?",
      "Alien",
    ]);
  });
});

describe("scoreMatch", () => {
  it("rates exact title and year matches highly", () => {
    expect(
      scoreMatch("The Thing", 1982, "The Thing", 1982),
    ).toBeGreaterThanOrEqual(95);
  });

  it("penalizes an incorrect year", () => {
    expect(
      scoreMatch("The Thing", 1982, "The Thing", 2011),
    ).toBeLessThan(
      scoreMatch("The Thing", 1982, "The Thing", 1982),
    );
  });
});


