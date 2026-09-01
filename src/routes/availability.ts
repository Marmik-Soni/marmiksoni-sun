import type { FastifyPluginAsync } from "fastify";
import { AvailabilityQuerySchema } from "../schemas/booking.js";
import { computeAvailableSlots } from "../lib/calendar.js";
import { TIMEZONE_OFFSET } from "../config/availability.js";

// eslint-disable-next-line @typescript-eslint/require-await
const availabilityRoute: FastifyPluginAsync = async (app) => {
  app.get("/availability", async (request, reply) => {
    const parsed = AvailabilityQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { date } = parsed.data;
    const slots = await computeAvailableSlots(date);

    return {
      ok: true,
      data: {
        date,
        slots: slots.map((slot) => ({
          start: formatTime(slot.start),
          end: formatTime(slot.end),
          type: slot.type,
        })),
      },
    };
  });
};

/**
 * Extract HH:mm from an ISO datetime string, converted to IST.
 * `computeAvailableSlots` returns UTC ISO strings, so we parse and
 * extract the time portion in the configured timezone offset.
 */
function formatTime(isoString: string): string {
  // Parse the ISO string and add the offset to get local IST time
  const date = new Date(isoString);
  const offsetMatch = TIMEZONE_OFFSET.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!offsetMatch?.[1] || !offsetMatch[2] || !offsetMatch[3]) {
    throw new Error(`Invalid TIMEZONE_OFFSET: ${TIMEZONE_OFFSET}`);
  }

  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const offsetMinutes = sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3], 10));

  // UTC time + offset = local time
  const localMs = date.getTime() + offsetMinutes * 60 * 1000;
  const localDate = new Date(localMs);

  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default availabilityRoute;
