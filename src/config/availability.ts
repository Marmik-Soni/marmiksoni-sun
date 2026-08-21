/**
 * Weekly availability ruleset.
 *
 * Each day maps to a booking type and available time windows.
 * Slot duration and minimum notice are also configured here.
 *
 * ⚠️  All times and durations are PLACEHOLDERS — replace with real values
 *     before going live.
 */

export type BookingType = "instant" | "request" | "closed";

export interface TimeWindow {
  /** Start time in HH:mm (24h) */
  start: string;
  /** End time in HH:mm (24h) */
  end: string;
}

export interface DaySchedule {
  type: BookingType;
  windows: TimeWindow[];
}

/**
 * 0 = Sunday, 1 = Monday, …, 6 = Saturday
 *
 * Per ARCHITECTURE.md:
 *  - Saturday (6): instant, all day
 *  - Sunday (0): instant, evening only
 *  - Mon–Fri (1–5): request (manual approval required)
 */
export const SCHEDULE: Record<number, DaySchedule> = {
  0: {
    type: "instant",
    windows: [{ start: "17:00", end: "21:00" }], // ⚠️ placeholder — Sunday evening
  },
  1: {
    type: "request",
    windows: [{ start: "10:00", end: "18:00" }], // ⚠️ placeholder
  },
  2: {
    type: "request",
    windows: [{ start: "10:00", end: "18:00" }], // ⚠️ placeholder
  },
  3: {
    type: "request",
    windows: [{ start: "10:00", end: "18:00" }], // ⚠️ placeholder
  },
  4: {
    type: "request",
    windows: [{ start: "10:00", end: "18:00" }], // ⚠️ placeholder
  },
  5: {
    type: "request",
    windows: [{ start: "10:00", end: "18:00" }], // ⚠️ placeholder
  },
  6: {
    type: "instant",
    windows: [{ start: "09:00", end: "21:00" }], // ⚠️ placeholder — Saturday all day
  },
};

/** Duration of each bookable slot in minutes. ⚠️ placeholder */
export const SLOT_DURATION_MINUTES = 30;

/** Minimum hours of notice required before a slot can be booked. ⚠️ placeholder */
export const MIN_NOTICE_HOURS = 24;
