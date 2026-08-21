import { Resend } from "resend";
import { env } from "../config/env.js";

const resend = new Resend(env.RESEND_API_KEY);

export interface BookingDetails {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
}

/**
 * Notifies the host that a booking has been confirmed (instant-book).
 * Includes a cancel link for the host.
 */
export async function sendHostBookingNotification(
  details: BookingDetails & { cancelUrl: string },
): Promise<void> {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: env.HOST_EMAIL,
    subject: `New booking: ${details.name} on ${details.date} at ${details.time}`,
    html: `
      <h2>New Booking Confirmed</h2>
      <p><strong>Client:</strong> ${details.name} (${details.email})</p>
      <p><strong>Date:</strong> ${details.date}</p>
      <p><strong>Time:</strong> ${details.time}</p>
      ${details.notes ? `<p><strong>Notes:</strong> ${details.notes}</p>` : ""}
      <hr />
      <p><a href="${details.cancelUrl}">Cancel this booking</a></p>
    `,
  });
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
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: env.HOST_EMAIL,
    subject: `Booking request: ${details.name} on ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Request</h2>
      <p><strong>Client:</strong> ${details.name} (${details.email})</p>
      <p><strong>Date:</strong> ${details.date}</p>
      <p><strong>Time:</strong> ${details.time}</p>
      ${details.notes ? `<p><strong>Notes:</strong> ${details.notes}</p>` : ""}
      <hr />
      <p>
        <a href="${approveUrl}" style="margin-right: 16px;">✅ Approve</a>
        <a href="${rejectUrl}">❌ Reject</a>
      </p>
    `,
  });
}

/**
 * Notifies the client that their booking request was declined.
 */
export async function sendClientDeclineNotice(to: string, details: BookingDetails): Promise<void> {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking request declined: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Request Declined</h2>
      <p>Hi ${details.name},</p>
      <p>Unfortunately, your booking request for <strong>${details.date} at ${details.time}</strong> has been declined.</p>
      <p>Please feel free to request a different time.</p>
    `,
  });
}

/**
 * Notifies the client that their booking has been cancelled.
 */
export async function sendCancellationNotice(to: string, details: BookingDetails): Promise<void> {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Booking cancelled: ${details.date} at ${details.time}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>Hi ${details.name},</p>
      <p>Your booking for <strong>${details.date} at ${details.time}</strong> has been cancelled.</p>
    `,
  });
}
