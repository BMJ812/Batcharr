import crypto from "node:crypto";

function getSecret(): string {
  return (
    process.env.BATCHARR_SECRET?.trim() ||
    process.env.BATCHARR_PASSWORD?.trim() ||
    "batcharr-development-secret-change-me"
  );
}

function getKey(): Buffer {
  return crypto.scryptSync(getSecret(), "batcharr-credentials-v1", 32);
}

export function encryptSecret(value: string): string {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string): string {
  if (!value) return "";
  if (!value.startsWith("v1:")) return value;

  const [, ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Stored credential is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
