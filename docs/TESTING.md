# Testing Strategy & E2E Testing Guide

This document outlines the testing philosophy, test suite organization, and execution procedures for `sun-backend`.

---

## 1. Testing Philosophy & Architecture

`sun-backend` uses a dual-layer testing strategy designed to balance **speed** in local iteration with **real-world confidence** against live infrastructure.

```
       ▲
      / \
     /   \     Layer 2: Playwright E2E & Smoke Tests
    /  ▲  \    (Headless Chromium, Live Staging API & Browser Actions)
   /   │   \
  /────┼────\  Layer 1: Vitest Unit & Integration Tests
 /     ▼     \ (In-Memory Fastify .inject(), Mocked Calendar/Email, ~2s)
/─────────────\
```

| Layer                  | Framework       | Target Environment | Speed     | Network Calls       | Purpose                                                                                      |
| :--------------------- | :-------------- | :----------------- | :-------- | :------------------ | :------------------------------------------------------------------------------------------- |
| **Unit & Integration** | Vitest 4        | Local / CI         | ~2 sec    | None (Mocked)       | Schema validation, token cryptography, ICS generation, Fastify route logic                   |
| **End-to-End & Smoke** | Playwright 1.63 | Staging / Local    | ~6–12 sec | Real HTTP & Browser | Live `/health`, API authentication guards, Google Calendar freebusy queries, host HTML forms |

---

## 2. Layer 1: Unit & Integration Tests (Vitest)

Vitest runs in-memory without binding a network socket, using Fastify's `.inject()` API.

### Test Suites (32 Tests Total)

1. **Token Cryptography (`src/lib/approval-token.test.ts` — 7 tests)**:
   - Verifies HMAC-SHA256 URL-safe signature generation (`payload.signature`).
   - Validates timing-safe comparison (`crypto.timingSafeEqual`) against timing attacks.
   - Tests expiration enforcement (`expiresAt` timestamp verification).
   - Tests rejection of tampered payloads and malformed tokens.

2. **ICS Calendar Generation (`src/lib/ics.test.ts` — 5 tests)**:
   - Validates RFC 5545 iCalendar generation using `ics`.
   - Confirms `METHOD:PUBLISH` attribute (prevents Google/Outlook RSVP bounce loops).
   - Verifies timezone offsets, start/end formatting, and event description formatting.

3. **Fastify Route Integration (`src/routes/routes.test.ts` — 20 tests)**:
   - Uses `vi.mock` to isolate external dependencies (`calendar.js`, `email.js`, `ics.js`).
   - Tests `x-api-key` authorization hook across protected and unprotected routes.
   - Tests `POST /bookings` instant vs. request scheduling branches.
   - Tests slot availability race conditions (slot taken prior to approval).
   - Tests `GET` and `POST` handlers for `/bookings/approve`, `/bookings/reject`, and `/bookings/cancel`.

### Running Vitest:

```bash
# Run all unit and integration tests once
pnpm test

# Run in watch mode during development
pnpm test:watch

# Run with test coverage report
pnpm test:coverage
```

---

## 3. Layer 2: Playwright End-to-End Tests

Playwright automates Chromium browser interactions and tests live HTTP endpoints against `https://staging-sun.marmiksoni.co`.

### Test Suites (16 Tests Total)

#### A. Host HTML Action Pages (`tests/e2e/bookings-html.spec.ts` — 8 tests)

Verifies the real interactive HTML pages that hosts open when clicking links in emails:

- **Approve Page (`GET /bookings/approve`)**:
  - Navigates to page with valid token.
  - Verifies `<h2>Approve Booking</h2>` header, client name, booking date, time, and notes.
  - Verifies presence and state of the `<form>` and `button[type="submit"]` ("Confirm Approval").
- **Reject Page (`GET /bookings/reject`)**:
  - Verifies client metadata rendering and "Confirm Rejection" button.
- **Cancel Page (`GET /bookings/cancel`)**:
  - Verifies booking metadata rendering and "Confirm Cancellation" button.
- **Negative & Security Cases**:
  - Missing token query param (`400 Bad Request` with "Missing or invalid token." HTML).
  - Tampered token signature (`400 Bad Request` with "Invalid or expired token." HTML).
  - Expired token (`400 Bad Request` with "Invalid or expired token." HTML).

#### B. Staging Smoke Tests (`tests/e2e/staging-smoke.spec.ts` — 8 tests)

Performs live HTTP verification against staging:

- **`GET /health`**: Confirms HTTP 200, positive uptime counter, and valid ISO timestamp.
- **`GET /availability` Auth Guards**:
  - Missing `x-api-key` → HTTP 401 (`{"ok":false,"error":"Unauthorized"}`).
  - Invalid `x-api-key` → HTTP 401.
  - Valid `x-api-key` → HTTP 200, verifies array of available slots calculated from Google Calendar.
- **`POST /bookings` Guards**:
  - Missing `x-api-key` → HTTP 401.
  - Valid `x-api-key` with malformed body → HTTP 400 with Zod validation errors.
- **Cancellation Token Verification**:
  - `GET /bookings/cancel` without token → HTTP 400.
  - `GET /bookings/cancel` with valid token → HTTP 200 HTML.

---

## 4. Playwright Configuration & Projects

Configured in `playwright.config.ts`:

```typescript
projects: [
  {
    name: "e2e-staging",
    use: {
      ...devices["Desktop Chrome"],
      baseURL: process.env.STAGING_URL || "https://staging-sun.marmiksoni.co",
    },
  },
  {
    name: "e2e-local",
    use: {
      ...devices["Desktop Chrome"],
      baseURL: process.env.LOCAL_URL || "http://localhost:30000",
    },
  },
];
```

### Running Playwright:

```bash
# Run against live staging URL (default E2E command)
pnpm test:e2e

# Run explicitly against staging
pnpm test:e2e:staging

# Run against local development server
pnpm test:e2e:local
```

---

## 5. Test Helper Utilities

### HMAC Token Generator (`tests/e2e/helpers/token.ts`)

Generates cryptographically valid tokens in tests using the shared `APPROVAL_TOKEN_SECRET`:

```typescript
import { createApprovalToken, createCancelToken } from "./helpers/token.js";

// Generates valid token expiring in 1 hour
const token = createApprovalToken({
  name: "Alex Johnson",
  email: "alex@example.com",
  date: "2026-09-15",
  time: "11:00",
});

// Generates token that expired 60 seconds ago (for testing rejection)
const expiredToken = createApprovalToken(payload, -60);
```

---

## 6. Continuous Integration (GitHub Actions)

On every Pull Request and Push to `main` and `staging`, the `.github/workflows/ci.yml` pipeline executes:

1. **Source Detection**: Checks if `src/`, `tests/`, or config files changed.
2. **Typecheck & Lint**: Runs `tsc --noEmit`, ESLint, and Prettier check.
3. **Vitest**: Executes all 32 unit/integration tests.
4. **Playwright Installation**: Runs `pnpm exec playwright install --with-deps chromium`.
5. **Playwright E2E**: Executes live staging smoke tests (`pnpm test:e2e:staging`).
6. **Artifact Upload**: If tests fail, uploads `playwright-report/` artifact for debugging.
