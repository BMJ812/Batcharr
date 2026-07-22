import { safeEqual, signPayload } from "@/lib/crypto";
import type { MediaType } from "@/lib/types";

const REQUEST_PREFIX = "batcharr:request";
const CANCEL_ID = "batcharr:cancel";

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

export function discordCancelId(): string {
  return CANCEL_ID;
}

export function isDiscordCancelId(
  customId: string,
): boolean {
  return customId === CANCEL_ID;
}
