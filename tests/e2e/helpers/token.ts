import { createHmac } from "node:crypto";
import type { ApprovalTokenPayload, CancelTokenPayload } from "../../../src/schemas/booking.js";

const getSecret = (): string =>
  process.env.APPROVAL_TOKEN_SECRET ||
  "815930cbdf7a1fb6f1215f89734817a1dd545a89971053f4159254ecac0464ea";

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createApprovalToken(
  payload: ApprovalTokenPayload,
  expiresInSeconds = 3600,
  secret = getSecret(),
): string {
  const envelope = {
    data: payload,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(envelope)));
  const hmac = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${toBase64Url(hmac)}`;
}

export function createCancelToken(
  payload: CancelTokenPayload,
  expiresInSeconds = 3600,
  secret = getSecret(),
): string {
  const envelope = {
    data: payload,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(envelope)));
  const hmac = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${toBase64Url(hmac)}`;
}
