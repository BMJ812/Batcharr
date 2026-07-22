import { describe, expect, it } from "vitest";
import {
  discordCancelId,
  isDiscordCancelId,
  makeDiscordRequestId,
  readDiscordRequestId,
} from "../discord-actions";

describe("Discord action identifiers", () => {
  it("round-trips a movie request", () => {
    const customId = makeDiscordRequestId(
      "movie",
      348,
    );

    expect(customId.length).toBeLessThanOrEqual(100);
    expect(readDiscordRequestId(customId)).toEqual({
      type: "movie",
      externalId: 348,
    });
  });

  it("round-trips a series request", () => {
    const customId = makeDiscordRequestId(
      "series",
      81189,
    );

    expect(customId.length).toBeLessThanOrEqual(100);
    expect(readDiscordRequestId(customId)).toEqual({
      type: "series",
      externalId: 81189,
    });
  });

  it("rejects a modified external ID", () => {
    const customId = makeDiscordRequestId(
      "movie",
      348,
    );

    const altered = customId.replace(
      ":348.",
      ":349.",
    );

    expect(() =>
      readDiscordRequestId(altered),
    ).toThrow(
      "The Discord request button has been altered.",
    );
  });

  it("rejects malformed identifiers", () => {
    expect(() =>
      readDiscordRequestId("batcharr:request:m:348"),
    ).toThrow(
      "The Discord request button is invalid.",
    );
  });

  it("recognizes the cancel action", () => {
    expect(discordCancelId()).toBe(
      "batcharr:cancel",
    );

    expect(
      isDiscordCancelId("batcharr:cancel"),
    ).toBe(true);

    expect(
      isDiscordCancelId("batcharr:request"),
    ).toBe(false);
  });
});

