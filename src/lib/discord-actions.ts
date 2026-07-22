import { safeEqual, signPayload } from "./crypto";
import type { MediaType } from "./types";

const REQUEST_PREFIX = "batcharr:request";
const CANCEL_ID = "batcharr:cancel";
const LIST_SELECT_ID = "batcharr:list-select";
const LIST_VALUE_PREFIX = "batcharr:list";

export interface DiscordRequestAction {
  type: MediaType;
  externalId: number;
}

export function makeDiscordRequestId(
  type: MediaType,
  externalId: number,
): string {
  const typeCode = type === "movie" ? "m" : "s";
  const unsignedId =
    `${REQUEST_PREFIX}:${typeCode}:${externalId}`;

  const signature = signPayload(
    `discord-request:${typeCode}:${externalId}`,
  ).slice(0, 24);

  return `${unsignedId}.${signature}`;
}

export function readDiscordRequestId(
  customId: string,
): DiscordRequestAction {
  const [unsignedId, signature, ...extraParts] =
    customId.split(".");

  if (
    !unsignedId ||
    !signature ||
    extraParts.length > 0
  ) {
    throw new Error(
      "The Discord request button is invalid.",
    );
  }

  const parts = unsignedId.split(":");

  if (
    parts.length !== 4 ||
    parts[0] !== "batcharr" ||
    parts[1] !== "request"
  ) {
    throw new Error(
      "The Discord request button is invalid.",
    );
  }

  const typeCode = parts[2];
  const externalId = Number(parts[3]);

  if (
    !["m", "s"].includes(typeCode) ||
    !Number.isInteger(externalId) ||
    externalId <= 0
  ) {
    throw new Error(
      "The Discord request button is incomplete.",
    );
  }

  const expectedSignature = signPayload(
    `discord-request:${typeCode}:${externalId}`,
  ).slice(0, 24);

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error(
      "The Discord request button has been altered.",
    );
  }

  return {
    type: typeCode === "m" ? "movie" : "series",
    externalId,
  };
}

export interface DiscordListSelection {
  type: MediaType;
  externalId: number;
  title: string;
  year: number | null;
}

export function discordListSelectId(): string {
  return LIST_SELECT_ID;
}

export function isDiscordListSelectId(
  customId: string,
): boolean {
  return customId === LIST_SELECT_ID;
}

export function makeDiscordListValue(
  type: MediaType,
  externalId: number,
  title: string,
  year: number | null,
): string {
  const typeCode = type === "movie" ? "m" : "s";

  let compactTitle = title.trim();

  while (compactTitle.length > 1) {
    const encodedTitle = Buffer.from(
      compactTitle,
      "utf8",
    ).toString("base64url");

    const unsignedValue =
      `${LIST_VALUE_PREFIX}:${typeCode}:` +
      `${externalId}:${year ?? 0}:${encodedTitle}`;

    const signature = signPayload(
      `discord-list:${typeCode}:${externalId}:` +
      `${year ?? 0}:${encodedTitle}`,
    ).slice(0, 16);

    const value = `${unsignedValue}.${signature}`;

    if (value.length <= 100) {
      return value;
    }

    compactTitle = compactTitle.slice(0, -1);
  }

  throw new Error(
    "The Discord list title could not be encoded.",
  );
}

export function readDiscordListValue(
  value: string,
): DiscordListSelection {
  const [unsignedValue, signature, ...extraParts] =
    value.split(".");

  if (
    !unsignedValue ||
    !signature ||
    extraParts.length > 0
  ) {
    throw new Error(
      "The Discord list selection is invalid.",
    );
  }

  const parts = unsignedValue.split(":");

  if (
    parts.length !== 6 ||
    parts[0] !== "batcharr" ||
    parts[1] !== "list"
  ) {
    throw new Error(
      "The Discord list selection is invalid.",
    );
  }

  const typeCode = parts[2];
  const externalId = Number(parts[3]);
  const yearNumber = Number(parts[4]);
  const encodedTitle = parts[5];

  if (
    !["m", "s"].includes(typeCode) ||
    !Number.isInteger(externalId) ||
    externalId <= 0 ||
    !Number.isInteger(yearNumber) ||
    yearNumber < 0 ||
    !encodedTitle
  ) {
    throw new Error(
      "The Discord list selection is incomplete.",
    );
  }

  const expectedSignature = signPayload(
    `discord-list:${typeCode}:${externalId}:` +
    `${yearNumber}:${encodedTitle}`,
  ).slice(0, 16);

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error(
      "The Discord list selection has been altered.",
    );
  }

  const title = Buffer.from(
    encodedTitle,
    "base64url",
  ).toString("utf8").trim();

  if (!title) {
    throw new Error(
      "The Discord list selection is missing its title.",
    );
  }

  return {
    type: typeCode === "m" ? "movie" : "series",
    externalId,
    title,
    year: yearNumber > 0 ? yearNumber : null,
  };
}
export function discordCancelId(): string {
  return CANCEL_ID;
}

export function isDiscordCancelId(
  customId: string,
): boolean {
  return customId === CANCEL_ID;
}

