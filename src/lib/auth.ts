import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "novel-crafter-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthConfig = {
  accessPassword: string;
  sessionSecret: string;
};

export function getAuthConfig(): AuthConfig | null {
  const accessPassword = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (
    !accessPassword ||
    accessPassword.length < 12 ||
    !sessionSecret ||
    Buffer.byteLength(sessionSecret) < 32
  ) {
    return null;
  }

  return { accessPassword, sessionSecret };
}

export function verifyAccessPassword(
  candidate: string,
  expected: string,
): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export function createSessionToken(
  secret: string,
  now = Date.now(),
): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("base64url");

  return `${expiresAt}.${signature}`;
}

export function isValidSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  const [expiresAtValue, signature, extra] = token.split(".");
  const expiresAt = Number(expiresAtValue);
  const nowInSeconds = Math.floor(now / 1000);

  if (
    extra !== undefined ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowInSeconds ||
    expiresAt > nowInSeconds + SESSION_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(expiresAtValue)
    .digest("base64url");

  const provided = Buffer.from(signature ?? "");
  const expected = Buffer.from(expectedSignature);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
