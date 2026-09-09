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

### Multi-Stage Build

The Dockerfile uses a two-stage approach:

1. **Builder stage** (`node:24-alpine`): Installs _all_ dependencies (including devDependencies like TypeScript), runs `tsc` to compile to `dist/`, then is discarded.
2. **Runtime stage** (`node:24-alpine`): Installs _only_ production dependencies, copies the compiled `dist/` from the builder. The final image contains no TypeScript compiler, no test frameworks, no linting tools.

Both stages use `--ignore-scripts` on `pnpm install` because:

- The `prepare` lifecycle script runs `husky`, which fails inside containers (no `.git` directory, and husky is a devDependency not present in prod installs).
- pnpm's strict build-script policy (`ERR_PNPM_IGNORED_BUILDS`) blocks unapproved native module builds (e.g., esbuild). Since `tsc` doesn't depend on any postinstall scripts, skipping them is safe.

### `.dockerignore`

The `.dockerignore` excludes `node_modules`, `dist`, `.env`, `.env.*`, `.git`, `.github`, `coverage`, and `*.md`. This serves two critical purposes:

- **Security:** Prevents live credentials (`.env`) from being baked into the image layer. Environment variables are injected at runtime via `--env-file`.
- **Performance:** Keeps the Docker build context small and prevents cache invalidation when only docs or git history change.

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
- **Client Notifications & Calendar**: Creating a booking creates a host-only Google Calendar event (`sendUpdates: none`, no attendees). Client notifications (pending, confirmation, decline, cancellation) are delivered entirely via custom Resend emails from our own domain. The confirmation email includes an in-house generated `.ics` attachment to seamlessly add the event to the client's calendar.
- **`BASE_URL` vs `PUBLIC_APP_URL`**: Two distinct URL variables serve different purposes:
  - `BASE_URL` — sun-backend's own address (e.g. `https://sun.marmiksoni.co`). Used exclusively for the host-facing HTML action links (approve/reject/cancel) that the host opens directly from email.
  - `PUBLIC_APP_URL` — the frontend application's public URL (e.g. `https://marmiksoni.co`). Used only in the client-facing cancel link embedded in confirmation emails. The frontend receives this link, presents a confirmation UI to the client, then calls `POST /api/bookings/cancel` server-to-server. These two must stay separate: the host's HTML flow and the client's JSON API flow live on different origins.

## 8. Module Layout Overview

- `src/lib/calendar.ts` — Google Calendar wrapper (free/busy, create, cancel).
- `src/lib/email.ts` — Resend wrapper (notifications, approvals, declines).
- `src/lib/ics.ts` — Generates `.ics` calendar attachments for client confirmation emails.
- `src/lib/html.ts` — Shared HTML-escaping utility used by both `email.ts` and the booking confirmation pages.
- `src/lib/approval-token.ts` — Signs and verifies HMAC tokens.
- `src/config/availability.ts` — Weekly working-hours ruleset.
- `src/schemas/` — Zod request/response schemas.
- `src/routes/` — Feature-based Fastify route handlers.
- `scripts/` — Standalone utility scripts (e.g., `generate-report.js` for full codebase reports).

## 9. CI/CD

GitHub Actions runs on every push to `main` and on pull requests. The workflow is split into two jobs:

1. **`ci` (Lint, typecheck, test)** — The full pipeline: `pnpm install --frozen-lockfile`, typecheck, ESLint, Prettier format check, and Vitest. This job detects whether source files (`src/`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, config files, workflows) actually changed and skips the heavy steps when only docs or scripts were touched.
2. **`docs-scripts` (Docs & scripts check)** — A lightweight job that runs when `docs/`, `scripts/`, or markdown files change. Verifies the changed files and logs them.

This split avoids wasting CI minutes on a full Node.js install + test run when you're only editing documentation or utility scripts.
