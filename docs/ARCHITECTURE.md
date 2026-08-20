# Architecture & Design Decisions

This document outlines the core design philosophy and technical decisions behind `sun-backend`.

## 1. No Database

**Decision:** Google Calendar is the sole source of truth for what's booked. We do not use PostgreSQL, MongoDB, or any other database.

**Reasoning:**
Availability is computed live via a free/busy query against the real calendar rather than cached in a table. This prevents double-booking and ensures that any personal event already added directly to Google Calendar naturally blocks that slot for booking.

## 2. No Stored "Pending Approval" State

**Decision:** Weekday bookings require manual host approval, but we do not persist a "pending" row in a database.

**Reasoning:**
The booking details are HMAC-signed directly into the approve/reject links sent to the host via email. There is nothing to persist between a request being made and a decision being made — the email link itself carries the required state securely.

**Cancellation** works the exact same way — a signed link, not a stored record, that deletes the calendar event when opened.

## 3. Fastify Over Express

**Decision:** The API is built on Fastify instead of Express.

**Reasoning:**
Fastify provides first-class TypeScript support and a robust, scalable plugin encapsulation model. This service is meant to be a long-lived, foundational piece of infrastructure, not a throwaway script. The built-in schema validation (via Zod/TypeBox) and Pino logging are significant DX wins.

## 4. Self-Managed VPS & Docker (Not PaaS)

**Decision:** The service is deployed via Docker on a self-managed Linux VPS, behind a Caddy reverse proxy, rather than on a PaaS like Fly.io or Railway.

**Reasoning:**
This is a deliberate educational and operational choice. A primary goal of this ecosystem is gaining real hands-on infrastructure practice — encompassing containerization, CI/CD with GHCR, reverse proxies, and raw server ownership.

## 5. Deliberately Narrow Scope

**Decision:** `sun-backend` handles email and calendar operations, and absolutely nothing else.

**Reasoning:**
Authentication, payments, client records, and business-specific data explicitly do not belong here. For example, the upcoming client portal will keep its own authentication and business logic in its own backend, and will only call this service for the email/calendar pieces it shares with other apps.

### Explicitly Out of Scope:
- User authentication or accounts.
- Payments processing.
- File storage.
- Generic "send any email to anyone" endpoints (we only expose purpose-built functions).
- Business logic belonging to consumer apps (e.g., invoice generation).

## 6. Security Model

We use two independently generated secrets, never reused for both purposes:

1. `SUN_API_SECRET`: A shared-secret header authenticating trusted server-to-server callers (like the Next.js booking site).
2. `APPROVAL_TOKEN_SECRET`: Used to HMAC-sign the approve/reject/cancel links opened directly from an email client.

Trusted consumers (like Next.js apps) must call this service **server-side only**. The `SUN_API_SECRET` must never reach the browser.

## 7. Booking Business Logic

- **Modes**: Saturday (all day) and Sunday evening are instant-book. Weekdays are request-only and require host manual approval.
- **Availability**: Slot availability is a combination of a configured weekly-hours ruleset and a live free/busy check.
- **Calendar Invites**: Creating a booking adds the client as an attendee on the Google Calendar event with `sendUpdates` enabled. Google naturally handles delivering the ICS invite; we do not manually generate ICS files.

## 8. Module Layout Overview

- `src/lib/calendar.ts` — Google Calendar wrapper (free/busy, create, cancel).
- `src/lib/email.ts` — Resend wrapper (notifications, approvals, declines).
- `src/lib/approval-token.ts` — Signs and verifies HMAC tokens.
- `src/config/availability.ts` — Weekly working-hours ruleset.
- `src/schemas/` — Zod request/response schemas.
- `src/routes/` — Feature-based Fastify route handlers.
