import { google } from "googleapis";
import { env } from "../config/env.js";
import {
  SCHEDULE,
  SLOT_DURATION_MINUTES,
  MIN_NOTICE_HOURS,
  TIMEZONE_OFFSET,
} from "../config/availability.js";
import type { BookingType } from "../config/availability.js";

export interface Slot {
  /** ISO datetime string for the slot start */
  start: string;
  /** ISO datetime string for the slot end */
  end: string;
  /** Whether this slot books instantly or requires approval */
  type: BookingType;
}

/**
 * Create an OAuth2 client pre-loaded with the refresh token.
 * Google's client library handles access-token refresh automatically.
 */
function initCalendarClient() {
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

  return auth;
}

const auth = initCalendarClient();
const calendar = google.calendar({ version: "v3", auth });

/**
 * Returns busy intervals on the host's calendar for a given date.
 * The query window spans the full union of that day's availability windows.
 */
export async function getBusyIntervals(dateISO: string): Promise<{ start: string; end: string }[]> {
  const dayOfWeek = new Date(`${dateISO}T00:00:00${TIMEZONE_OFFSET}`).getDay();
  const schedule = SCHEDULE[dayOfWeek];

  if (!schedule || schedule.type === "closed" || schedule.windows.length === 0) {
    return [];
  }

  // Use the earliest window start and latest window end for the freebusy query
  const firstWindow = schedule.windows[0];
  const lastWindow = schedule.windows[schedule.windows.length - 1];

  if (!firstWindow || !lastWindow) return [];

  const timeMin = `${dateISO}T${firstWindow.start}:00${TIMEZONE_OFFSET}`;
  const timeMax = `${dateISO}T${lastWindow.end}:00${TIMEZONE_OFFSET}`;

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      items: [{ id: env.GOOGLE_CALENDAR_ID }],
    },
  });

  const calendarBusy = response.data.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy ?? [];

  return calendarBusy.filter(
    (interval): interval is { start: string; end: string } =>
      typeof interval.start === "string" && typeof interval.end === "string",
  );
}

/**
 * Generates all bookable time slots for a given date, subtracting
 * any intervals that are already busy on the calendar.
 */
export async function computeAvailableSlots(dateISO: string): Promise<Slot[]> {
  const dayOfWeek = new Date(`${dateISO}T00:00:00${TIMEZONE_OFFSET}`).getDay();
  const schedule = SCHEDULE[dayOfWeek];

  if (!schedule || schedule.type === "closed") {
    return [];
  }

  const busy = await getBusyIntervals(dateISO);
  const now = Date.now();
  const noticeThreshold = now + MIN_NOTICE_HOURS * 60 * 60 * 1000;
  const slots: Slot[] = [];

  for (const window of schedule.windows) {
    const windowStart = new Date(`${dateISO}T${window.start}:00${TIMEZONE_OFFSET}`);
    const windowEnd = new Date(`${dateISO}T${window.end}:00${TIMEZONE_OFFSET}`);
    let cursor = windowStart.getTime();

    while (cursor + SLOT_DURATION_MINUTES * 60 * 1000 <= windowEnd.getTime()) {
      const slotStart = cursor;
      const slotEnd = cursor + SLOT_DURATION_MINUTES * 60 * 1000;

      // Skip slots that don't meet minimum notice requirement
      if (slotStart < noticeThreshold) {
        cursor = slotEnd;
        continue;
      }

      // Check if this slot overlaps any busy interval
      const isOccupied = busy.some((b) => {
        const busyStart = new Date(b.start).getTime();
        const busyEnd = new Date(b.end).getTime();
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isOccupied) {
        slots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotEnd).toISOString(),
          type: schedule.type,
        });
      }

      cursor = slotEnd;
    }
  }

  return slots;
}

/**
 * Check whether a specific slot is still free on the calendar.
 * Used as a final guard right before booking.
 */
export async function isSlotFree(dateISO: string, time: string): Promise<boolean> {
  const slotStart = new Date(`${dateISO}T${time}:00${TIMEZONE_OFFSET}`).getTime();
  const slotEnd = slotStart + SLOT_DURATION_MINUTES * 60 * 1000;
  const busy = await getBusyIntervals(dateISO);

  return !busy.some((b) => {
    const busyStart = new Date(b.start).getTime();
    const busyEnd = new Date(b.end).getTime();
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

/**
 * Creates a Google Calendar event for the host.
 * Client details are stored in the description field, not as attendees —
 * all client notifications are handled via Resend instead.
 */
export async function createEvent(params: {
  summary: string;
  description: string;
  start: string;
  end: string;
}): Promise<{ eventId: string }> {
  const response = await calendar.events.insert({
    calendarId: env.GOOGLE_CALENDAR_ID,
    sendUpdates: "none",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start },
      end: { dateTime: params.end },
    },
  });

  const eventId = response.data.id;
  if (!eventId) {
    throw new Error("Google Calendar did not return an event ID");
  }

  return { eventId };
}

/**
 * Deletes a Google Calendar event.
 * Client cancellation notice is sent separately via Resend.
 */
export async function cancelEvent(eventId: string): Promise<void> {
  await calendar.events.delete({
    calendarId: env.GOOGLE_CALENDAR_ID,
    eventId,
    sendUpdates: "none",
  });
}
