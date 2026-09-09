import { test, expect } from "@playwright/test";
import { createCancelToken } from "./helpers/token.js";

const API_KEY =
  process.env.SUN_API_SECRET || "dfa44c12e5051e1634a9a63be5d3f6e1f4a51e0c5d65c5fd744edacc76c6a0e4";

test.describe("Staging Smoke Tests (API & Auth)", () => {
  test("GET /health returns 200 with status ok and uptime", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThan(0);
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  test("GET /availability rejects requests without x-api-key header", async ({ request }) => {
    const res = await request.get("/availability?date=2026-09-15");
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  test("GET /availability rejects requests with invalid x-api-key header", async ({ request }) => {
    const res = await request.get("/availability?date=2026-09-15", {
      headers: { "x-api-key": "invalid-secret-key" },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  test("GET /availability returns 200 and calculated slots with valid API key", async ({
    request,
  }) => {
    const res = await request.get("/availability?date=2026-09-15", {
      headers: { "x-api-key": API_KEY },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.date).toBe("2026-09-15");
    expect(Array.isArray(body.data.slots)).toBe(true);
    expect(body.data.slots.length).toBeGreaterThan(0);

    const firstSlot = body.data.slots[0];
    expect(firstSlot).toHaveProperty("start");
    expect(firstSlot).toHaveProperty("end");
    expect(firstSlot).toHaveProperty("type");
    expect(firstSlot.start).toMatch(/^\d{2}:\d{2}$/);
    expect(firstSlot.end).toMatch(/^\d{2}:\d{2}$/);
  });

  test("POST /bookings rejects requests without x-api-key", async ({ request }) => {
    const res = await request.post("/bookings", {
      data: { name: "Test User" },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  test("POST /bookings validates request payload", async ({ request }) => {
    const res = await request.post("/bookings", {
      headers: { "x-api-key": API_KEY },
      data: { name: "" }, // invalid: missing required fields
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("GET /bookings/cancel rejects missing token with 400", async ({ request }) => {
    const res = await request.get("/bookings/cancel");
    expect(res.status()).toBe(400);

    const body = await res.text();
    expect(body).toContain("Missing or invalid token");
  });

  test("GET /bookings/cancel returns 200 HTML for valid signed token", async ({ request }) => {
    const token = createCancelToken({
      eventId: "evt_smoke_test_123",
      name: "Staging Smoke Client",
      email: "smoke-client@example.com",
      date: "2026-09-15",
      time: "10:00",
    });

    const res = await request.get(`/bookings/cancel?token=${token}`);
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain("Cancel Booking");
    expect(body).toContain("Staging Smoke Client");
  });
});
