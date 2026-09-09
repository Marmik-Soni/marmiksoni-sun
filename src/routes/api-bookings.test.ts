/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../config/env.js", () => ({
  env: {
    PORT: 3000,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REFRESH_TOKEN: "test-refresh-token",
    GOOGLE_CALENDAR_ID: "test-calendar-id",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "Test <test@example.com>",
    HOST_EMAIL: "host@example.com",
    SUN_API_SECRET: "test-api-secret",
    APPROVAL_TOKEN_SECRET: "test-approval-secret",
    BASE_URL: "http://localhost:3000",
    PUBLIC_APP_URL: "https://marmiksoni.co",
  },
}));

vi.mock("../lib/calendar.js", () => ({
  computeAvailableSlots: vi.fn(),
  isSlotFree: vi.fn(),
  createEvent: vi.fn(),
  cancelEvent: vi.fn(),
  getBusyIntervals: vi.fn(),
}));

vi.mock("../lib/email.js", () => ({
  sendHostBookingNotification: vi.fn(),
  sendApprovalRequest: vi.fn(),
  sendClientPendingNotice: vi.fn(),
  sendClientBookingConfirmation: vi.fn(),
  sendClientDeclineNotice: vi.fn(),
  sendCancellationNotice: vi.fn(),
  sendHostCancellationNotice: vi.fn(),
}));

vi.mock("../lib/ics.js", () => ({
  generateIcs: vi.fn(),
}));

// Import mocked modules for assertion access
const { cancelEvent } = await import("../lib/calendar.js");
const { sendHostCancellationNotice, sendCancellationNotice } = await import("../lib/email.js");
const { signToken } = await import("../lib/approval-token.js");
const { buildServer } = await import("../server.js");

type CancelTokenPayload = {
  eventId: string;
  name: string;
  email: string;
  date: string;
  time: string;
};

// ─── Test setup ────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ─── Helpers ───────────────────────────────────────────────────────────

function makeValidToken(expiresInSeconds = 3600): string {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  return signToken<CancelTokenPayload>(
    {
      eventId: "evt_abc",
      name: "Alice",
      email: "alice@example.com",
      date: "2026-08-22",
      time: "10:00",
    },
    expiresInSeconds,
  );
}

// ─── GET /api/bookings/cancel ──────────────────────────────────────────

describe("GET /api/bookings/cancel", () => {
  it("returns 200 with booking preview for a valid token", async () => {
    const token = makeValidToken();

    const res = await app.inject({
      method: "GET",
      url: `/api/bookings/cancel?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      name: "Alice",
      date: "2026-08-22",
      time: "10:00",
    });

    // GET must never trigger side effects
    expect(cancelEvent).not.toHaveBeenCalled();
    expect(sendHostCancellationNotice).not.toHaveBeenCalled();
    expect(sendCancellationNotice).not.toHaveBeenCalled();
  });

  it("returns 400 for missing token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/bookings/cancel",
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 400 for an expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_abc",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      60, // 1 minute
    );

    // Advance past expiry
    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "GET",
      url: `/api/bookings/cancel?token=${token}`,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("expired");
  });
});

// ─── POST /api/bookings/cancel ─────────────────────────────────────────

describe("POST /api/bookings/cancel", () => {
  it("cancels event and notifies host when token is valid (client-initiated)", async () => {
    const token = makeValidToken();

    vi.mocked(cancelEvent).mockResolvedValue();
    vi.mocked(sendHostCancellationNotice).mockResolvedValue();

    const res = await app.inject({
      method: "POST",
      url: "/api/bookings/cancel",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      name: "Alice",
      date: "2026-08-22",
      time: "10:00",
    });

    expect(cancelEvent).toHaveBeenCalledWith("evt_abc");

    // Client cancellation must notify the HOST (not the client)
    expect(sendHostCancellationNotice).toHaveBeenCalledOnce();
    expect(sendCancellationNotice).not.toHaveBeenCalled();
  });

  it("returns 409 when the event is already cancelled (404/410 from Google)", async () => {
    const token = makeValidToken();

    const alreadyGoneError = Object.assign(new Error("Not found"), { code: 404 });
    vi.mocked(cancelEvent).mockRejectedValue(alreadyGoneError);

    const res = await app.inject({
      method: "POST",
      url: "/api/bookings/cancel",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token }),
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("already been cancelled");

    expect(sendHostCancellationNotice).not.toHaveBeenCalled();
    expect(sendCancellationNotice).not.toHaveBeenCalled();
  });

  it("returns 400 for missing token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bookings/cancel",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
  });

  it("returns 400 for an invalid/expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_abc",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      60,
    );

    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "POST",
      url: "/api/bookings/cancel",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
    expect(cancelEvent).not.toHaveBeenCalled();
  });
});
