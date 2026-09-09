import { test, expect } from "@playwright/test";
import { createApprovalToken, createCancelToken } from "./helpers/token.js";

test.describe("Host HTML Actions (Approve, Reject, Cancel pages)", () => {
  const sampleApprovalPayload = {
    name: "Alex Johnson",
    email: "alex@example.com",
    date: "2026-09-15",
    time: "11:00",
    notes: "Consultation call",
  };

  const sampleCancelPayload = {
    eventId: "evt_playwright_test_001",
    name: "Alex Johnson",
    email: "alex@example.com",
    date: "2026-09-15",
    time: "11:00",
  };

  test.describe("Approve Page", () => {
    test("renders approval page with client details and confirm button", async ({ page }) => {
      const token = createApprovalToken(sampleApprovalPayload);
      const res = await page.goto(`/bookings/approve?token=${token}`);
      expect(res?.status()).toBe(200);

      await expect(page.locator("h2")).toHaveText("Approve Booking");
      await expect(page.locator("body")).toContainText("Alex Johnson");
      await expect(page.locator("body")).toContainText("2026-09-15");
      await expect(page.locator("body")).toContainText("11:00");
      await expect(page.locator("body")).toContainText("Consultation call");

      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toHaveText("Confirm Approval");
    });

    test("shows error page when token query param is missing", async ({ page }) => {
      const res = await page.goto("/bookings/approve");
      expect(res?.status()).toBe(400);

      await expect(page.locator("h2")).toHaveText("Error");
      await expect(page.locator("body")).toContainText("Missing or invalid token.");
    });

    test("shows error page when token has invalid signature", async ({ page }) => {
      const res = await page.goto("/bookings/approve?token=tampered.token.here");
      expect(res?.status()).toBe(400);

      await expect(page.locator("h2")).toHaveText("Error");
      await expect(page.locator("body")).toContainText("Invalid or expired token.");
    });

    test("shows error page when token has expired", async ({ page }) => {
      // Expired 60 seconds ago
      const expiredToken = createApprovalToken(sampleApprovalPayload, -60);
      const res = await page.goto(`/bookings/approve?token=${expiredToken}`);
      expect(res?.status()).toBe(400);

      await expect(page.locator("h2")).toHaveText("Error");
      await expect(page.locator("body")).toContainText("Invalid or expired token.");
    });
  });

  test.describe("Reject Page", () => {
    test("renders rejection page with client details and confirm button", async ({ page }) => {
      const token = createApprovalToken(sampleApprovalPayload);
      const res = await page.goto(`/bookings/reject?token=${token}`);
      expect(res?.status()).toBe(200);

      await expect(page.locator("h2")).toHaveText("Reject Booking");
      await expect(page.locator("body")).toContainText("Alex Johnson");
      await expect(page.locator("body")).toContainText("2026-09-15");
      await expect(page.locator("body")).toContainText("11:00");

      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toHaveText("Confirm Rejection");
    });

    test("shows error page when token is invalid", async ({ page }) => {
      const res = await page.goto("/bookings/reject?token=bad-token");
      expect(res?.status()).toBe(400);

      await expect(page.locator("h2")).toHaveText("Error");
      await expect(page.locator("body")).toContainText("Invalid or expired token.");
    });
  });

  test.describe("Cancel Page", () => {
    test("renders cancellation page with booking details and confirm button", async ({ page }) => {
      const token = createCancelToken(sampleCancelPayload);
      const res = await page.goto(`/bookings/cancel?token=${token}`);
      expect(res?.status()).toBe(200);

      await expect(page.locator("h2")).toHaveText("Cancel Booking");
      await expect(page.locator("body")).toContainText("Alex Johnson");
      await expect(page.locator("body")).toContainText("2026-09-15");
      await expect(page.locator("body")).toContainText("11:00");

      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toHaveText("Confirm Cancellation");
    });

    test("shows error page when token is missing", async ({ page }) => {
      const res = await page.goto("/bookings/cancel");
      expect(res?.status()).toBe(400);

      await expect(page.locator("h2")).toHaveText("Error");
      await expect(page.locator("body")).toContainText("Missing or invalid token.");
    });
  });
});
