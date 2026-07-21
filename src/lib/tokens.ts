import { safeEqual, signPayload } from "@/lib/crypto";
import type { MediaType } from "@/lib/types";

interface CandidateTokenPayload {
  type: MediaType;
  externalId: number;
  title: string;
  year: number | null;
}

export function makeCandidateToken(payload: CandidateTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(`candidate:${encoded}`)}`;
}

export function readCandidateToken(token: string): CandidateTokenPayload {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, signPayload(`candidate:${encoded}`))) {
    throw new Error("The selected match token is invalid or has been altered.");
  }

  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CandidateTokenPayload;
  if (!parsed.externalId || !["movie", "series"].includes(parsed.type)) {
    throw new Error("The selected match token is incomplete.");
  }
  return parsed;
}
