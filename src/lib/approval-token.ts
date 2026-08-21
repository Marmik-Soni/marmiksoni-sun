import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

interface TokenEnvelope<T> {
  data: T;
  expiresAt: number;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

/**
 * Signs a payload with HMAC-SHA256 and returns a URL-safe token string.
 *
 * Format: `base64url(json_payload).base64url(hmac_signature)`
 *
 * The payload is wrapped with an `expiresAt` timestamp. Generic —
 * works for both approval tokens and cancellation tokens.
 */
export function signToken<T>(payload: T, expiresInSeconds: number): string {
  const envelope: TokenEnvelope<T> = {
    data: payload,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(envelope)));
  const hmac = createHmac("sha256", env.APPROVAL_TOKEN_SECRET).update(payloadB64).digest();
  const sigB64 = toBase64Url(hmac);

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies a signed token. Returns the original payload if valid,
 * or `null` if tampered, malformed, or expired.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyToken<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  // Recompute HMAC
  const expectedHmac = createHmac("sha256", env.APPROVAL_TOKEN_SECRET).update(payloadB64).digest();

  const providedHmac = fromBase64Url(sigB64);

  // Timing-safe comparison
  if (expectedHmac.length !== providedHmac.length) return null;
  if (!timingSafeEqual(expectedHmac, providedHmac)) return null;

  // Decode and parse
  let envelope: TokenEnvelope<T>;
  try {
    const json = fromBase64Url(payloadB64).toString("utf-8");
    envelope = JSON.parse(json) as TokenEnvelope<T>;
  } catch {
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (now > envelope.expiresAt) return null;

  return envelope.data;
}
