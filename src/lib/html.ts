/**
 * Shared HTML escaping utility.
 *
 * Used by both email.ts (Resend HTML emails) and bookings.ts
 * (HTML confirmation/success pages rendered in the browser).
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
