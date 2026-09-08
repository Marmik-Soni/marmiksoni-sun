/**
 * Generates an ICS (iCalendar) file string for email attachments.
 *
 * Uses METHOD:PUBLISH — an informational calendar entry the client can add
 * to their calendar, with no RSVP expected. Earlier versions used
 * METHOD:REQUEST with an RSVP-enabled attendee, which caused RSVP-aware
 * mail clients to auto-generate an iTIP REPLY back to the organizer
 * address. Since bookings@marmiksoni.co is send-only with no inbound mail
 * handling, those replies bounced. PUBLISH carries no such expectation.
 */
import { createEvent, type EventAttributes } from "ics";
import { SLOT_DURATION_MINUTES, TIMEZONE_OFFSET } from "../config/availability.js";
import { env } from "../config/env.js";

/**
 * Extract the raw email address from an EMAIL_FROM string like
 * "Marmik Soni <bookings@marmiksoni.co>" → "bookings@marmiksoni.co"
 */
function extractEmail(fromString: string): string {
  const match = fromString.match(/<(.+)>/);
  return match?.[1] ?? fromString;
}

export function generateIcs(params: {
  name: string;
  email: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  notes?: string | undefined;
}): string {
  // Parse the local IST time into a UTC Date object
  const startDate = new Date(`${params.date}T${params.time}:00${TIMEZONE_OFFSET}`);

  // ics package DateArray uses 1-based months.
  // We convert through UTC methods since we already have a proper UTC Date.
  const start: [number, number, number, number, number] = [
    startDate.getUTCFullYear(),
    startDate.getUTCMonth() + 1, // getUTCMonth() is 0-based → ics wants 1-based
    startDate.getUTCDate(),
    startDate.getUTCHours(),
    startDate.getUTCMinutes(),
  ];

  const event: EventAttributes = {
    start,
    startInputType: "utc",
    duration: { minutes: SLOT_DURATION_MINUTES },
    title: `Booking with ${params.name}`,
    description: params.notes ?? "",
    method: "PUBLISH",
    organizer: { name: "Marmik Soni", email: extractEmail(env.EMAIL_FROM) },
  };

  const { error, value } = createEvent(event);
  if (error) {
    throw new Error(`ICS generation failed: ${error.message}`);
  }
  return value!;
}
