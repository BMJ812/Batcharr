import { describe, expect, it, vi } from "vitest";
import {
  importTmdbList,
  normalizeTmdbListItems,
  parseTmdbListInput,
  testTmdbAccessToken,
} from "../tmdb";

describe("parseTmdbListInput", () => {
  it("accepts a numeric list ID", () => {
    expect(parseTmdbListInput("123456")).toBe(123456);
  });

  it("accepts recognized public TMDb list URLs", () => {
    expect(
      parseTmdbListInput(
        "https://www.themoviedb.org/list/123456-essential-horror",
      ),
    ).toBe(123456);

    expect(
      parseTmdbListInput(
        "https://themoviedb.org/list/98765",
      ),
    ).toBe(98765);
  });

  it("rejects lookalike hosts and unrelated TMDb paths", () => {
    expect(() =>
      parseTmdbListInput(
        "https://www.themoviedb.org.evil.example/list/123",
      ),
    ).toThrow(/Only public themoviedb\.org/);

    expect(() =>
      parseTmdbListInput(
        "https://www.themoviedb.org/movie/123",
      ),
    ).toThrow(/not a recognized TMDb list URL/);
  });
});

describe("normalizeTmdbListItems", () => {
  it("creates exact Radarr IDs for movies and title lookups for TV", () => {
    const result = normalizeTmdbListItems([
      {
        id: 348,
        media_type: "movie",
        title: "Alien",
        release_date: "1979-05-25",
      },
      {
        id: 70523,
        media_type: "tv",
        name: "Dark",
        first_air_date: "2017-12-01",
      },
    ]);

    expect(result.items).toHaveLength(2);

    expect(result.items[0]).toMatchObject({
      query: "Alien",
      year: 1979,
      hint: "movie",
      exactMatch: {
        type: "movie",
        externalId: 348,
      },
    });

    expect(result.items[1]).toMatchObject({
      query: "Dark",
      year: 2017,
      hint: "series",
    });

    expect(result.items[1].exactMatch).toBeUndefined();
  });

  it("skips unsupported entries and duplicate TMDb IDs", () => {
    const result = normalizeTmdbListItems([
      {
        id: 348,
        media_type: "movie",
        title: "Alien",
      },
      {
        id: 348,
        media_type: "movie",
        title: "Alien duplicate",
      },
      {
        id: 10,
        media_type: "person",
        name: "Unsupported person",
      },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });
});

describe("importTmdbList", () => {
  it("uses only the fixed TMDb v4 API endpoint and bearer authentication", async () => {
    const fetchImpl = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const target = new URL(String(input));
        const page = target.searchParams.get("page");

        expect(target.origin).toBe("https://api.themoviedb.org");
        expect(target.pathname).toBe("/4/list/123");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer test-token",
        );

        if (page === "1") {
          return new Response(
            JSON.stringify({
              id: 123,
              name: "Horror Essentials",
              description: "A public list.",
              page: 1,
              total_pages: 2,
              total_results: 2,
              results: [
                {
                  id: 348,
                  media_type: "movie",
                  title: "Alien",
                  release_date: "1979-05-25",
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({
            id: 123,
            name: "Horror Essentials",
            page: 2,
            total_pages: 2,
            total_results: 2,
            results: [
              {
                id: 70523,
                media_type: "tv",
                name: "Dark",
                first_air_date: "2017-12-01",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );

    const result = await importTmdbList(
      "https://www.themoviedb.org/list/123-horror-essentials",
      "test-token",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.source).toMatchObject({
      type: "tmdb",
      id: 123,
      name: "Horror Essentials",
    });
    expect(result.items).toHaveLength(2);
    expect(result.totalAvailable).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("reports authentication failures without exposing the token", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("Unauthorized", { status: 401 });

    await expect(
      importTmdbList("123", "secret-token", fetchImpl),
    ).rejects.toThrow("TMDb rejected the API Read Access Token");
  });
});
describe("testTmdbAccessToken", () => {
  it("validates a token against a fixed TMDb v3 endpoint", async () => {
    const fetchImpl = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const target = new URL(String(input));

        expect(target.origin).toBe("https://api.themoviedb.org");
        expect(target.pathname).toBe(
          "/3/configuration/countries",
        );
        expect(target.searchParams.get("language")).toBe("en-US");
        expect(
          new Headers(init?.headers).get("Authorization"),
        ).toBe("Bearer test-token");

        return new Response(
          JSON.stringify([
            {
              iso_3166_1: "US",
              english_name: "United States of America",
              native_name: "United States",
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );

    await expect(
      testTmdbAccessToken("test-token", fetchImpl),
    ).resolves.toEqual({
      service: "tmdb",
      message: "TMDb API Read Access Token connected.",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid tokens without returning the token", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("Unauthorized", { status: 401 });

    await expect(
      testTmdbAccessToken("secret-token", fetchImpl),
    ).rejects.toThrow("TMDb rejected the API Read Access Token");
  });
});