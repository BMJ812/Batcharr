import { cookies } from "next/headers";
import { safeEqual, signPayload } from "@/lib/crypto";

const COOKIE_NAME = "batcharr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return Boolean(process.env.BATCHARR_PASSWORD?.trim());
}

export function passwordMatches(password: string): boolean {
  const expected = process.env.BATCHARR_PASSWORD?.trim() ?? "";
  return Boolean(expected) && safeEqual(password, expected);
}

export function makeSessionToken(): string {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = String(expires);
  return `${payload}.${signPayload(`session:${payload}`)}`;
}

function validSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!expiresText || !signature || !Number.isFinite(expires)) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, signPayload(`session:${expiresText}`));
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authEnabled()) return true;
  const cookieStore = await cookies();
  return validSessionToken(cookieStore.get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, makeSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.BATCHARR_COOKIE_SECURE === "true",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.BATCHARR_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 0,
  });
}
