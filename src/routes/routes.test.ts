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
}));

vi.mock("../lib/ics.js", () => ({
  generateIcs: vi.fn(),
}));

// Import mocked modules for assertion access
const { computeAvailableSlots, isSlotFree, createEvent, cancelEvent } =
  await import("../lib/calendar.js");
const {
  sendHostBookingNotification,
  sendApprovalRequest,
  sendClientPendingNotice,
  sendClientBookingConfirmation,
  sendClientDeclineNotice,
  sendCancellationNotice,
} = await import("../lib/email.js");
const { generateIcs } = await import("../lib/ics.js");
const { signToken } = await import("../lib/approval-token.js");
const { buildServer } = await import("../server.js");

type ApprovalTokenPayload = {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
};

type CancelTokenPayload = {
  eventId: string;
  name: string;
  email: string;
  date: string;
  time: string;
};

// ─── Test setup ────────────────────────────────────────────────────────

const API_KEY = "test-api-secret";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ─── GET /health ───────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status, uptime, and timestamp", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ─── GET /availability ─────────────────────────────────────────────────

describe("GET /availability", () => {
  it("returns 401 without API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/availability?date=2026-08-22",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid date format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/availability?date=not-a-date",
      headers: { "x-api-key": API_KEY },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with slots for a valid date", async () => {
    vi.mocked(computeAvailableSlots).mockResolvedValue([
      { start: "2026-08-22T03:30:00.000Z", end: "2026-08-22T04:00:00.000Z", type: "instant" },
      { start: "2026-08-22T04:00:00.000Z", end: "2026-08-22T04:30:00.000Z", type: "instant" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/availability?date=2026-08-22",
      headers: { "x-api-key": API_KEY },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.date).toBe("2026-08-22");
    expect(body.data.slots).toHaveLength(2);
    expect(body.data.slots[0]).toEqual({ start: "09:00", end: "09:30", type: "instant" });
    expect(body.data.slots[1]).toEqual({ start: "09:30", end: "10:00", type: "instant" });
  });
});

// ─── POST /bookings ────────────────────────────────────────────────────

describe("POST /bookings", () => {
  const validBooking = {
    name: "Alice",
    email: "alice@example.com",
    date: "2026-08-23", // Saturday → instant
    time: "10:00",
    notes: "Test booking",
  };

  it("returns 401 without API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: validBooking,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when slot is taken", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(false);

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(409);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("instant-books and returns 'booked' for Saturday", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_123" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics-content");
    vi.mocked(sendClientBookingConfirmation).mockResolvedValue();
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("booked");

    // Ensure createEvent does not receive attendeeEmail
    expect(createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ attendeeEmail: expect.anything() }),
    );

    expect(generateIcs).toHaveBeenCalledOnce();
    expect(sendClientBookingConfirmation).toHaveBeenCalledWith(
      "alice@example.com",
      expect.any(Object),
      "mock-ics-content",
    );
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: true }),
    );
  });

  it("instant-books even if client email fails, and flags clientNotified: false", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_123" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics-content");
    vi.mocked(sendClientBookingConfirmation).mockRejectedValue(new Error("Email error"));
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(200); // Booking still succeeds

    expect(sendClientBookingConfirmation).toHaveBeenCalledOnce();
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: false }),
    );
  });

  it("sends approval request for request-type days (weekday)", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(sendApprovalRequest).mockResolvedValue();
    vi.mocked(sendClientPendingNotice).mockResolvedValue();

    const weekdayBooking = {
      ...validBooking,
      date: "2026-08-25", // Tuesday → request
    };

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: weekdayBooking,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("pending_approval");

    expect(createEvent).not.toHaveBeenCalled();
    expect(sendApprovalRequest).toHaveBeenCalledOnce();
    expect(sendClientPendingNotice).toHaveBeenCalledOnce();
  });

  it("returns 500 when host approval email send fails", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(sendApprovalRequest).mockRejectedValue(new Error("Email send failed"));

    const weekdayBooking = {
      ...validBooking,
      date: "2026-08-25", // Tuesday → request
    };

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: weekdayBooking,
    });

    expect(res.statusCode).toBe(500);
    // If approval request to host fails, the client pending notice shouldn't be sent
    expect(sendClientPendingNotice).not.toHaveBeenCalled();
  });
});

// ─── Approve routes ────────────────────────────────────────────────────

describe("GET /bookings/approve", () => {
  it("shows confirmation page and does NOT call createEvent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/approve?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Confirm Approval");
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendHostBookingNotification).not.toHaveBeenCalled();
  });

  it("returns error for expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      60, // 1 minute
    );

    // Advance past expiry
    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "GET",
      url: `/bookings/approve?token=${token}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("Invalid or expired token");
  });
});

describe("POST /bookings/approve", () => {
  it("creates event and sends emails when token is valid and slot is free", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_456" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics");
    vi.mocked(sendClientBookingConfirmation).mockResolvedValue();
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Approved");
    expect(res.body).toContain("A confirmation email has been sent");

    // Ensure createEvent does not receive attendeeEmail
    expect(createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ attendeeEmail: expect.anything() }),
    );

    expect(sendClientBookingConfirmation).toHaveBeenCalledOnce();
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: true }),
    );
  });

  it("returns 400 for expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      60,
    );

    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("returns 409 when slot is taken", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(isSlotFree).mockResolvedValue(false);

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain("No Longer Available");
    expect(createEvent).not.toHaveBeenCalled();
  });
});

// ─── Reject routes ─────────────────────────────────────────────────────

describe("GET /bookings/reject", () => {
  it("shows confirmation page and does NOT send email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/reject?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Confirm Rejection");
    expect(sendClientDeclineNotice).not.toHaveBeenCalled();
  });
});

describe("POST /bookings/reject", () => {
  it("sends decline notice when token is valid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(sendClientDeclineNotice).mockResolvedValue();

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/reject",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Rejected");
    expect(sendClientDeclineNotice).toHaveBeenCalledOnce();
  });
});

// ─── Cancel routes ─────────────────────────────────────────────────────

describe("GET /bookings/cancel", () => {
  it("shows confirmation page and does NOT call cancelEvent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_789",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/cancel?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Confirm Cancellation");
    expect(cancelEvent).not.toHaveBeenCalled();
  });
});

describe("POST /bookings/cancel", () => {
  it("cancels event and notifies client when token is valid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(cancelEvent).mockResolvedValue();
    vi.mocked(sendCancellationNotice).mockResolvedValue();

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_789",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/cancel",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Cancelled");
    expect(res.body).toContain("cancellation notice has been sent");

    expect(cancelEvent).toHaveBeenCalledWith("evt_789");
    expect(sendCancellationNotice).toHaveBeenCalledOnce();
  });
});
