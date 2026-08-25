import { describe, it, expect, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    EMAIL_FROM: "Marmik Soni <bookings@marmiksoni.co>",
  },
}));

const { generateIcs } = await import("../lib/ics.js");

describe("ics generation", () => {
  it("produces the correct UTC DTSTART for an IST date/time", () => {
    // 2026-08-25 18:00 IST = 2026-08-25 12:30 UTC
    const ics = generateIcs({
      name: "Alice",
      email: "alice@example.com",
      date: "2026-08-25",
      time: "18:00",
    });
    expect(ics).toContain("DTSTART:20260825T123000Z");
  });

  it("rolls over to the previous UTC day and year near midnight IST", () => {
    // 2026-01-01 02:00 IST = 2025-12-31 20:30 UTC
    const ics = generateIcs({
      name: "Bob",
      email: "bob@example.com",
      date: "2026-01-01",
      time: "02:00",
    });
    expect(ics).toContain("DTSTART:20251231T203000Z");
  });

  it("sets METHOD:REQUEST so mail clients render an actionable invite", () => {
    const ics = generateIcs({
      name: "Alice",
      email: "alice@example.com",
      date: "2026-08-25",
      time: "18:00",
    });
    expect(ics).toContain("METHOD:REQUEST");
  });
});
