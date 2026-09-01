import { Resend } from "resend";
import { env } from "../config/env.js";
import { escapeHtml } from "./html.js";

const resend = new Resend(env.RESEND_API_KEY);

export interface BookingDetails {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
}

/**
 * Notifies the host that a booking has been confirmed (instant-book or approved).
 * Includes a cancel link for the host and a flag indicating whether the client
 * was successfully notified — if false, the host should follow up manually.
 */
export async function sendHostBookingNotification(
  details: BookingDetails & { cancelUrl: string; clientNotified: boolean },
): Promise<void> {
  const safeName = escapeHtml(details.name);
  const safeEmail = escapeHtml(details.email);
  const safeNotes = details.notes ? escapeHtml(details.notes) : undefined;

  const clientWarning = details.clientNotified
    ? ""
    : `<p style="color:#b91c1c;font-weight:bold">⚠️ The client could not be notified — please follow up manually.</p>`;

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: env.HOST_EMAIL,
    subject: `New booking: ${details.name} on ${details.date} at ${details.time}`,
    html: `
      <h2>New Booking Confirmed</h2>
      <p><strong>Client:</strong> ${safeName} (${safeEmail})</p>
      <p><strong>Date:</strong> ${details.date}</p>
      <p><strong>Time:</strong> ${details.time}</p>
      ${safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : ""}
      ${clientWarning}
      <hr />
      <p><a href="${details.cancelUrl}">Cancel this booking</a></p>
    `,
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}

/**
 * Sends the host an approval request for a weekday booking.
 * Contains approve and reject links.
 */
export async function sendApprovalRequest(
  details: BookingDetails,
  approveUrl: string,
  rejectUrl: string,
): Promise<void> {
  const safeName = escapeHtml(details.name);
  const safeEmail = escapeHtml(details.email);
  const safeNotes = details.notes ? escapeHtml(details.notes) : undefined;

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: env.HOST_EMAIL,
    subject: `Booking request: ${details.name} on ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Request</h2>
      <p><strong>Client:</strong> ${safeName} (${safeEmail})</p>
      <p><strong>Date:</strong> ${details.date}</p>
      <p><strong>Time:</strong> ${details.time}</p>
      ${safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : ""}
      <hr />
      <p>
        <a href="${approveUrl}" style="margin-right: 16px;">✅ Approve</a>
        <a href="${rejectUrl}">❌ Reject</a>
      </p>
    `,
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}

/**
 * Notifies the client that their booking request has been received
 * and is awaiting the host's approval. Courtesy notice only.
 */
export async function sendClientPendingNotice(to: string, details: BookingDetails): Promise<void> {
  const safeName = escapeHtml(details.name);

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking request received: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Request Received</h2>
      <p>Hi ${safeName},</p>
      <p>Your booking request for <strong>${details.date} at ${details.time}</strong> has been received and is awaiting approval.</p>
      <p>You'll receive a confirmation email once it's been reviewed.</p>
    `,
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}

/**
 * Sends the client a booking confirmation email with an .ics attachment.
 * Replaces the native Google Calendar invite that was previously sent
 * by adding the client as an attendee.
 */
export async function sendClientBookingConfirmation(
  to: string,
  details: BookingDetails,
  icsContent: string,
): Promise<void> {
  const safeName = escapeHtml(details.name);

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking confirmed: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Confirmed ✅</h2>
      <p>Hi ${safeName},</p>
      <p>Your booking for <strong>${details.date} at ${details.time}</strong> has been confirmed.</p>
      <p>An .ics calendar invite is attached to this email — open it to add the event to your calendar.</p>
    `,
    attachments: [
      {
        filename: "booking.ics",
        content: Buffer.from(icsContent).toString("base64"),
      },
    ],
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}

/**
 * Notifies the client that their booking request was declined.
 */
export async function sendClientDeclineNotice(to: string, details: BookingDetails): Promise<void> {
  const safeName = escapeHtml(details.name);

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking request declined: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Request Declined</h2>
      <p>Hi ${safeName},</p>
      <p>Unfortunately, your booking request for <strong>${details.date} at ${details.time}</strong> has been declined.</p>
      <p>Please feel free to request a different time.</p>
    `,
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}

/**
 * Notifies the client that their booking has been cancelled.
 */
export async function sendCancellationNotice(to: string, details: BookingDetails): Promise<void> {
  const safeName = escapeHtml(details.name);

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking cancelled: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>Hi ${safeName},</p>
      <p>Your booking for <strong>${details.date} at ${details.time}</strong> has been cancelled.</p>
    `,
  });

  if (error) {
    throw new Error(`Resend API Error: ${error.message}`);
  }
}
