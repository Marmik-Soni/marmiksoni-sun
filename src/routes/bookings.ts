import type { FastifyPluginAsync } from "fastify";
import {
  CreateBookingSchema,
  TokenQuerySchema,
  type ApprovalTokenPayload,
  type CancelTokenPayload,
} from "../schemas/booking.js";
import { SCHEDULE, SLOT_DURATION_MINUTES, TIMEZONE_OFFSET } from "../config/availability.js";
import { isSlotFree, createEvent, cancelEvent } from "../lib/calendar.js";
import {
  sendHostBookingNotification,
  sendApprovalRequest,
  sendClientPendingNotice,
  sendClientBookingConfirmation,
  sendClientDeclineNotice,
  sendCancellationNotice,
} from "../lib/email.js";
import { signToken, verifyToken } from "../lib/approval-token.js";
import { generateIcs } from "../lib/ics.js";
import { escapeHtml } from "../lib/html.js";
import { env } from "../config/env.js";

/** 72 hours in seconds — expiry for approval tokens */
const APPROVAL_TOKEN_EXPIRY = 72 * 60 * 60;

/** 30 days in seconds — expiry for cancel tokens */
const CANCEL_TOKEN_EXPIRY = 30 * 24 * 60 * 60;

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#1a1a1a}
h2{margin-bottom:8px}button{background:#111;color:#fff;border:none;padding:10px 24px;border-radius:6px;
font-size:1rem;cursor:pointer;margin-top:12px}button:hover{background:#333}</style></head>
<body>${body}</body></html>`;
}

function errorPage(message: string): string {
  return htmlPage("Error", `<h2>Error</h2><p>${escapeHtml(message)}</p>`);
}

function computeSlotEnd(date: string, time: string): string {
  const start = new Date(`${date}T${time}:00${TIMEZONE_OFFSET}`);
  const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
  return end.toISOString();
}

function computeSlotStart(date: string, time: string): string {
  return new Date(`${date}T${time}:00${TIMEZONE_OFFSET}`).toISOString();
}

/**
 * Builds the Google Calendar event description with client details.
 * Used by both the instant-book and approve code paths so the format
 * can't drift between the two.
 */
function buildEventDescription(name: string, email: string, notes?: string): string {
  let desc = `Client: ${name} (${email})`;
  if (notes) desc += `\n\n${notes}`;
  return desc;
}

// eslint-disable-next-line @typescript-eslint/require-await
const bookingsRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /bookings ────────────────────────────────────────────────
  app.post("/bookings", async (request, reply) => {
    const parsed = CreateBookingSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { name, email, date, time, notes } = parsed.data;

    // Determine booking type from schedule
    const dayOfWeek = new Date(`${date}T00:00:00${TIMEZONE_OFFSET}`).getDay();
    const schedule = SCHEDULE[dayOfWeek];

    if (!schedule || schedule.type === "closed") {
      return reply.status(400).send({
        ok: false,
        error: "No availability on this day",
      });
    }

    // Final slot-free guard — don't trust the client's stale availability data
    const free = await isSlotFree(date, time);
    if (!free) {
      return reply.status(409).send({
        ok: false,
        error: "Slot is no longer available",
      });
    }

    const bookingDetails = { name, email, date, time, notes };

    if (schedule.type === "instant") {
      // Instant booking: create event immediately
      const startISO = computeSlotStart(date, time);
      const endISO = computeSlotEnd(date, time);

      const { eventId } = await createEvent({
        summary: `Booking: ${name}`,
        description: buildEventDescription(name, email, notes),
        start: startISO,
        end: endISO,
      });

      // Generate ICS and send client confirmation
      let clientNotified = true;
      try {
        const icsContent = generateIcs({ name, email, date, time, notes });
        await sendClientBookingConfirmation(email, bookingDetails, icsContent);
      } catch (err) {
        clientNotified = false;
        app.log.error({ err }, "Failed to send client booking confirmation");
      }

      // Sign a cancel token for the host
      const cancelToken = signToken<CancelTokenPayload>(
        { eventId, name, email, date, time },
        CANCEL_TOKEN_EXPIRY,
      );
      const cancelUrl = `${env.BASE_URL}/bookings/cancel?token=${cancelToken}`;

      // Host notification — failure is logged, not fatal
      try {
        await sendHostBookingNotification({ ...bookingDetails, cancelUrl, clientNotified });
      } catch (err) {
        app.log.error({ err }, "Failed to send host booking notification");
      }

      return { ok: true, data: { status: "booked" } };
    }

    // Request-type booking: send approval email
    const approvalToken = signToken<ApprovalTokenPayload>(
      { name, email, date, time, notes },
      APPROVAL_TOKEN_EXPIRY,
    );
    const approveUrl = `${env.BASE_URL}/bookings/approve?token=${approvalToken}`;
    const rejectUrl = `${env.BASE_URL}/bookings/reject?token=${approvalToken}`;

    try {
      await sendApprovalRequest(bookingDetails, approveUrl, rejectUrl);
    } catch (err) {
      app.log.error({ err }, "Failed to send approval request email");
      return reply.status(500).send({
        ok: false,
        error: "Failed to send approval request. Please try again.",
      });
    }

    // Client pending notice — courtesy only, failure is logged, not fatal
    try {
      await sendClientPendingNotice(email, bookingDetails);
    } catch (err) {
      app.log.error({ err }, "Failed to send client pending notice");
    }

    return { ok: true, data: { status: "pending_approval" } };
  });

  // ─── GET /bookings/approve ─────────────────────────────────────────
  app.get("/bookings/approve", async (request, reply) => {
    const parsed = TokenQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<ApprovalTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    const safeName = escapeHtml(payload.name);
    const safeNotes = payload.notes ? escapeHtml(payload.notes) : undefined;

    const html = htmlPage(
      "Approve Booking",
      `<h2>Approve Booking</h2>
       <p><strong>Client:</strong> ${safeName}</p>
       <p><strong>Date:</strong> ${payload.date}</p>
       <p><strong>Time:</strong> ${payload.time}</p>
       ${safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : ""}
       <form method="POST" action="/bookings/approve">
         <input type="hidden" name="token" value="${parsed.data.token}" />
         <button type="submit">Confirm Approval</button>
       </form>`,
    );

    return reply.type("text/html").send(html);
  });

  // ─── POST /bookings/approve ────────────────────────────────────────
  app.post("/bookings/approve", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const parsed = TokenQuerySchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<ApprovalTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    // Re-check slot availability — it may have been taken since the request
    const free = await isSlotFree(payload.date, payload.time);
    if (!free) {
      return reply
        .status(409)
        .type("text/html")
        .send(
          htmlPage(
            "Slot Unavailable",
            `<h2>Slot No Longer Available</h2>
             <p>The slot on <strong>${payload.date} at ${payload.time}</strong> has been taken in the meantime.</p>`,
          ),
        );
    }

    const startISO = computeSlotStart(payload.date, payload.time);
    const endISO = computeSlotEnd(payload.date, payload.time);

    const { eventId } = await createEvent({
      summary: `Booking: ${payload.name}`,
      description: buildEventDescription(payload.name, payload.email, payload.notes),
      start: startISO,
      end: endISO,
    });

    // Generate ICS and send client confirmation
    let clientNotified = true;
    try {
      const icsContent = generateIcs({
        name: payload.name,
        email: payload.email,
        date: payload.date,
        time: payload.time,
        notes: payload.notes,
      });
      await sendClientBookingConfirmation(
        payload.email,
        {
          name: payload.name,
          email: payload.email,
          date: payload.date,
          time: payload.time,
          notes: payload.notes,
        },
        icsContent,
      );
    } catch (err) {
      clientNotified = false;
      app.log.error({ err }, "Failed to send client booking confirmation after approval");
    }

    // Sign a cancel token for the host notification
    const cancelToken = signToken<CancelTokenPayload>(
      { eventId, name: payload.name, email: payload.email, date: payload.date, time: payload.time },
      CANCEL_TOKEN_EXPIRY,
    );
    const cancelUrl = `${env.BASE_URL}/bookings/cancel?token=${cancelToken}`;

    try {
      await sendHostBookingNotification({
        name: payload.name,
        email: payload.email,
        date: payload.date,
        time: payload.time,
        notes: payload.notes,
        cancelUrl,
        clientNotified,
      });
    } catch (err) {
      app.log.error({ err }, "Failed to send host booking notification after approval");
    }

    const safeName = escapeHtml(payload.name);
    const safeEmail = escapeHtml(payload.email);
    const notificationStatus = clientNotified
      ? `<p>A confirmation email has been sent to ${safeEmail}.</p>`
      : `<p style="color:#b91c1c;font-weight:bold">⚠️ The confirmation email to ${safeEmail} could not be sent. Please follow up manually.</p>`;

    return reply.type("text/html").send(
      htmlPage(
        "Booking Approved",
        `<h2>Booking Approved ✅</h2>
         <p>The booking for <strong>${safeName}</strong> on <strong>${payload.date} at ${payload.time}</strong> has been confirmed.</p>
         ${notificationStatus}`,
      ),
    );
  });

  // ─── GET /bookings/reject ──────────────────────────────────────────
  app.get("/bookings/reject", async (request, reply) => {
    const parsed = TokenQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<ApprovalTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    const safeName = escapeHtml(payload.name);

    const html = htmlPage(
      "Reject Booking",
      `<h2>Reject Booking</h2>
       <p><strong>Client:</strong> ${safeName}</p>
       <p><strong>Date:</strong> ${payload.date}</p>
       <p><strong>Time:</strong> ${payload.time}</p>
       <form method="POST" action="/bookings/reject">
         <input type="hidden" name="token" value="${parsed.data.token}" />
         <button type="submit">Confirm Rejection</button>
       </form>`,
    );

    return reply.type("text/html").send(html);
  });

  // ─── POST /bookings/reject ─────────────────────────────────────────
  app.post("/bookings/reject", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const parsed = TokenQuerySchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<ApprovalTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    try {
      await sendClientDeclineNotice(payload.email, {
        name: payload.name,
        email: payload.email,
        date: payload.date,
        time: payload.time,
        notes: payload.notes,
      });
    } catch (err) {
      app.log.error({ err }, "Failed to send client decline notice");
    }

    const safeName = escapeHtml(payload.name);
    const safeEmail = escapeHtml(payload.email);

    return reply.type("text/html").send(
      htmlPage(
        "Booking Rejected",
        `<h2>Booking Rejected</h2>
         <p>The booking request from <strong>${safeName}</strong> for <strong>${payload.date} at ${payload.time}</strong> has been declined.</p>
         <p>A decline notice has been sent to ${safeEmail}.</p>`,
      ),
    );
  });

  // ─── GET /bookings/cancel ──────────────────────────────────────────
  app.get("/bookings/cancel", async (request, reply) => {
    const parsed = TokenQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<CancelTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    const safeName = escapeHtml(payload.name);

    const html = htmlPage(
      "Cancel Booking",
      `<h2>Cancel Booking</h2>
       <p><strong>Client:</strong> ${safeName}</p>
       <p><strong>Date:</strong> ${payload.date}</p>
       <p><strong>Time:</strong> ${payload.time}</p>
       <form method="POST" action="/bookings/cancel">
         <input type="hidden" name="token" value="${parsed.data.token}" />
         <button type="submit">Confirm Cancellation</button>
       </form>`,
    );

    return reply.type("text/html").send(html);
  });

  // ─── POST /bookings/cancel ─────────────────────────────────────────
  app.post("/bookings/cancel", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const parsed = TokenQuerySchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).type("text/html").send(errorPage("Missing or invalid token."));
    }

    const payload = verifyToken<CancelTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).type("text/html").send(errorPage("Invalid or expired token."));
    }

    await cancelEvent(payload.eventId);

    // Send cancellation notice to the client — failure is logged, not fatal
    try {
      await sendCancellationNotice(payload.email, {
        name: payload.name,
        email: payload.email,
        date: payload.date,
        time: payload.time,
      });
    } catch (err) {
      app.log.error({ err }, "Failed to send client cancellation notice");
    }

    const safeName = escapeHtml(payload.name);
    const safeEmail = escapeHtml(payload.email);

    return reply.type("text/html").send(
      htmlPage(
        "Booking Cancelled",
        `<h2>Booking Cancelled</h2>
         <p>The booking for <strong>${safeName}</strong> on <strong>${payload.date} at ${payload.time}</strong> has been cancelled.</p>
         <p>A cancellation notice has been sent to ${safeEmail}.</p>`,
      ),
    );
  });
};

export default bookingsRoutes;
