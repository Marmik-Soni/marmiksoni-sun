import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing the module under test
vi.mock("../config/env.js", () => ({
  env: {
    APPROVAL_TOKEN_SECRET: "test-secret-for-unit-tests-only",
  },
}));

// Import after mocking
const { signToken, verifyToken } = await import("../lib/approval-token.js");

describe("approval-token", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });

  it("round-trips a payload through sign and verify", () => {
    const payload = { name: "Alice", email: "alice@test.com" };
    const token = signToken(payload, 3600);
    const result = verifyToken<typeof payload>(token);
    expect(result).toEqual(payload);
  });

  it("works with different payload shapes", () => {
    const payload = { eventId: "evt_123", date: "2026-08-23" };
    const token = signToken(payload, 3600);
    const result = verifyToken<typeof payload>(token);
    expect(result).toEqual(payload);
  });

  it("rejects a token with tampered payload", () => {
    const token = signToken({ name: "Alice" }, 3600);
    const [_payload, sig] = token.split(".");

    // Tamper with the payload
    const tampered = Buffer.from(
      JSON.stringify({ data: { name: "Eve" }, expiresAt: 9999999999 }),
    ).toString("base64url");

    const result = verifyToken(`${tampered}.${sig}`);
    expect(result).toBeNull();
  });

  it("rejects a token with tampered signature", () => {
    const token = signToken({ name: "Alice" }, 3600);
    const [payload] = token.split(".");

    const result = verifyToken(`${payload}.dGFtcGVyZWQ`);
    expect(result).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken({ name: "Alice" }, 60); // 60 seconds

    // Advance time past expiry
    vi.advanceTimersByTime(61 * 1000);

    const result = verifyToken(token);
    expect(result).toBeNull();
  });

  it("accepts a token that has not expired yet", () => {
    const token = signToken({ name: "Alice" }, 3600);

    // Advance time, but not past expiry
    vi.advanceTimersByTime(1800 * 1000);

    const result = verifyToken<{ name: string }>(token);
    expect(result).toEqual({ name: "Alice" });
  });

  it("rejects a completely malformed token", () => {
    expect(verifyToken("not-a-real-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("a.b.c")).toBeNull();
  });
});
