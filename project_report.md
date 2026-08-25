# sun-backend Comprehensive Project Report

Generated on: 2026-08-25T12:00:05.951Z

This document contains a complete overview of the `sun-backend` project, including all configuration files, documentation, and source code.

---

## `README.md`

````markdown
# sun-backend

`sun-backend` is a personal, centralized backend service — internally called "the Sun" — that owns two core capabilities for the Marmik ecosystem of projects: sending emails and reading/writing to Google Calendar.

It is a small internal platform designed to be called by other trusted backends (like a booking site or client portal), ensuring credentials and logic for email and calendar integration exist in exactly one place.

## Tech Stack

- **Language**: TypeScript, Node.js 24, ESM (`"type": "module"`)
- **Framework**: Fastify 5
- **Package Manager**: pnpm
- **Validation**: Zod
- **Logging**: Pino
- **Integrations**: Google Calendar (`googleapis`), Resend
- **Dev Runner**: `tsx`
- **Testing**: Vitest
- **Containerization**: Docker (multi-stage, `node:24-alpine`)
- **CI/CD**: GitHub Actions, GHCR
- **Hosting**: Self-managed Linux VPS behind a Caddy reverse proxy

## Prerequisites

- Node.js 24+
- pnpm 11+
- Google Cloud Console account (for Calendar API credentials)
- Resend account (for email API key)

## Local Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repo-url>
   cd sun-backend
   pnpm install
   ```
````

2. **Environment Variables**:
   Copy the example config:

   ```bash
   cp .env.example .env
   ```

   Fill in the missing values in `.env`. See `.env.example` for the required structure. Notably, you must generate two independent secure random strings for `SUN_API_SECRET` and `APPROVAL_TOKEN_SECRET`.

3. **Start the development server**:
   ```bash
   pnpm dev
   ```
   The server will start on `http://localhost:3000` (or whatever `PORT` is configured).

## Commands

- `pnpm dev` - Start dev server with hot reload
- `pnpm build` - Compile TypeScript to `dist/`
- `pnpm start` - Run compiled output
- `pnpm lint` / `pnpm format:check` - Code quality checks
- `pnpm test` - Run Vitest suite
- `pnpm check` - Full pipeline verify (typecheck, lint, format)

## Docker Build & Run

To build the production container locally:

```bash
docker build -t sun-backend:latest .
```

To run it:

```bash
docker run -p 3000:3000 --env-file .env sun-backend:latest
```

## API Summary

| Method | Path                            | Auth                    | Purpose                             |
| ------ | ------------------------------- | ----------------------- | ----------------------------------- |
| GET    | `/health`                       | none                    | Liveness probe                      |
| GET    | `/availability?date=YYYY-MM-DD` | `SUN_API_SECRET` header | Check host free/busy                |
| POST   | `/bookings`                     | `SUN_API_SECRET` header | Request a new booking               |
| GET    | `/bookings/approve?token=...`   | Signed token in URL     | Show approval confirmation page     |
| POST   | `/bookings/approve`             | Signed token in body    | Approve a pending booking           |
| GET    | `/bookings/reject?token=...`    | Signed token in URL     | Show rejection confirmation page    |
| POST   | `/bookings/reject`              | Signed token in body    | Reject a pending booking            |
| GET    | `/bookings/cancel?token=...`    | Signed token in URL     | Show cancellation confirmation page |
| POST   | `/bookings/cancel`              | Signed token in body    | Cancel an existing booking          |

## Detailed Documentation

- [Architecture & Design Decisions](docs/ARCHITECTURE.md) - Explains _why_ the system is built this way (no database, no state, narrow scope).
- [API Reference](docs/API.md) - Full endpoint specifications.

````

## `docs/ARCHITECTURE.md`

```markdown
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
- **Client Notifications & Calendar**: Creating a booking creates a host-only Google Calendar event (`sendUpdates: none`, no attendees). Client notifications (pending, confirmation, decline, cancellation) are delivered entirely via custom Resend emails from our own domain. The confirmation email includes an in-house generated `.ics` attachment to seamlessly add the event to the client's calendar.

## 8. Module Layout Overview

- `src/lib/calendar.ts` — Google Calendar wrapper (free/busy, create, cancel).
- `src/lib/email.ts` — Resend wrapper (notifications, approvals, declines).
- `src/lib/approval-token.ts` — Signs and verifies HMAC tokens.
- `src/config/availability.ts` — Weekly working-hours ruleset.
- `src/schemas/` — Zod request/response schemas.
- `src/routes/` — Feature-based Fastify route handlers.
````

## `docs/API.md`

````markdown
# API Reference

All requests and responses use `application/json` unless otherwise noted.
Trusted API endpoints require the `x-api-key` header set to the `SUN_API_SECRET` environment variable.

---

## `GET /health`

Liveness probe for infrastructure checks.

- **Auth**: None
- **Query Params**: None
- **Response**: `200 OK`
  ```json
  {
    "status": "ok",
    "uptime": 123.45,
    "timestamp": "2026-08-20T12:00:00.000Z"
  }
  ```
````

---

## `GET /availability`

Fetches available booking slots for a specific date, combining the ruleset with live Google Calendar free/busy data.

- **Auth**: `x-api-key` header
- **Query Params**:
  - `date` (string, required): Format `YYYY-MM-DD`
- **Response**: `200 OK`
  ```json
  {
    "ok": true,
    "data": {
      "date": "2026-08-20",
      "slots": [
        { "start": "09:00", "end": "09:30", "type": "instant" },
        { "start": "18:00", "end": "18:30", "type": "request" }
      ]
    }
  }
  ```
  Each slot includes a `type` field: `"instant"` (auto-booked) or `"request"` (requires host approval). The consuming booking site uses this to decide which flow to present.
- **Error**: `400 Bad Request` (Invalid date format)

---

## `POST /bookings`

Submits a booking request. Depending on the day of the week, this either instant-books the event or sends an approval request email to the host.

- **Auth**: `x-api-key` header
- **Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "date": "2026-08-20",
    "time": "09:00",
    "notes": "Optional context for the meeting"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "ok": true,
    "data": {
      "status": "pending_approval" // or "booked"
    }
  }
  ```
- **Error**: `400 Bad Request` (Validation error), `409 Conflict` (Slot no longer available)

---

## `GET /bookings/approve`

Displays a confirmation page for approving a pending booking. **Does not perform any action** — the actual approval happens via the `POST` variant below.

This two-step pattern prevents corporate email security scanners (Outlook Safe Links, etc.) and chat-app link-preview bots from accidentally triggering the action by fetching the URL.

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page with booking details and a "Confirm Approval" button)
- **Error**: `400 Bad Request` (Invalid/expired token)

## `POST /bookings/approve`

Approves a pending booking. Creates a Google Calendar event and notifies the host.

- **Auth**: None (Relies on signed token in form body)
- **Body** (`application/x-www-form-urlencoded`):
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page confirming the booking was approved)
- **Error**: `400 Bad Request` (Invalid/expired token), `409 Conflict` (Slot taken in the meantime)

---

## `GET /bookings/reject`

Displays a confirmation page for rejecting a pending booking. **Does not perform any action.**

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page with booking details and a "Confirm Rejection" button)
- **Error**: `400 Bad Request` (Invalid token)

## `POST /bookings/reject`

Rejects a pending booking. Sends a decline notice to the requester.

- **Auth**: None (Relies on signed token in form body)
- **Body** (`application/x-www-form-urlencoded`):
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page confirming the rejection)
- **Error**: `400 Bad Request` (Invalid token)

---

## `GET /bookings/cancel`

Displays a confirmation page for cancelling an existing booking. **Does not perform any action.**

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload containing the calendar event ID
- **Response**: `200 OK` (HTML page with booking details and a "Confirm Cancellation" button)
- **Error**: `400 Bad Request` (Invalid token)

## `POST /bookings/cancel`

Cancels an existing, approved booking. Deletes the Google Calendar event; attendees are notified via calendar.

- **Auth**: None (Relies on signed token in form body)
- **Body** (`application/x-www-form-urlencoded`):
  - `token` (string, required): HMAC-signed state payload containing the calendar event ID
- **Response**: `200 OK` (HTML page confirming the cancellation)
- **Error**: `400 Bad Request` (Invalid token)

````

## `package.json`

```json
{
  "name": "marmiksoni-sun",
  "version": "1.0.0",
  "description": "",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check",
    "prepare": "husky"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "engines": {
    "node": ">=24"
  },
  "devEngines": {
    "packageManager": {
      "name": "pnpm",
      "version": "^11.22.0",
      "onFail": "download"
    }
  },
  "type": "module",
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml}": [
      "prettier --write"
    ]
  },
  "dependencies": {
    "@fastify/formbody": "^9.0.0",
    "dotenv": "^17.4.2",
    "fastify": "^5.12.1",
    "googleapis": "^176.0.0",
    "ics": "^3.12.0",
    "resend": "^6.20.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@commitlint/cli": "^21.2.2",
    "@commitlint/config-conventional": "^21.2.2",
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.9.0",
    "eslint": "^10.8.1",
    "eslint-config-prettier": "^10.1.8",
    "husky": "^9.1.7",
    "lint-staged": "^17.3.0",
    "prettier": "^3.9.6",
    "tsx": "^4.23.12",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.67.0",
    "vitest": "^4.1.11"
  }
}
````

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});
```

## `eslint.config.ts`

```typescript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  { ignores: ["dist/", "node_modules/", "coverage/"] },

  // Base JS recommended
  js.configs.recommended,

  // TS recommended (type-aware)
  ...tseslint.configs.recommendedTypeChecked,

  // TS project config
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Custom rules
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Prettier last — disables conflicting formatting rules
  eslintConfigPrettier,
);
```

## `commitlint.config.ts`

```typescript
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation
        "style", // Formatting (no logic change)
        "refactor", // Code change (no feature/fix)
        "perf", // Performance improvement
        "test", // Adding/updating tests
        "build", // Build system or dependencies
        "ci", // CI configuration
        "chore", // Maintenance
        "revert", // Revert a commit
      ],
    ],
    "subject-case": [2, "never", ["upper-case"]],
    "header-max-length": [2, "always", 100],
  },
};
```

## `.env.example`

```example
# ── Environment ──────────────────────────────
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug

# ── Google APIs ──────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=

# ── Resend (Email) ───────────────────────────
RESEND_API_KEY=
EMAIL_FROM=Marmik Soni <bookings@marmiksoni.co>

# ── Host ─────────────────────────────────────
HOST_EMAIL=

# ── Security ─────────────────────────────────
# Shared secret for trusted server-to-server callers (e.g. Next.js backend)
SUN_API_SECRET=
# Secret used to HMAC-sign approve/reject/cancel links in emails
APPROVAL_TOKEN_SECRET=

# ── URLs ─────────────────────────────────────
BASE_URL=http://localhost:3000
```

## `src/index.ts`

```typescript
import { env } from "./config/env.js";
import { buildServer } from "./server.js";

const server = await buildServer();

try {
  await server.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
```

## `src/server.ts`

```typescript
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { env } from "./config/env.js";
import healthRoute from "./routes/health.js";
import availabilityRoute from "./routes/availability.js";
import bookingsRoutes from "./routes/bookings.js";

/** Routes that require the x-api-key header */
const API_KEY_ROUTES = new Set(["GET /availability", "POST /bookings"]);

/**
 * Builds and returns a configured Fastify instance (not started).
 * Separating this from `listen()` enables in-process testing with `.inject()`.
 */
export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // Parse application/x-www-form-urlencoded for HTML form POST submissions
  await server.register(formbody);

  // ── API key auth hook (applied only to specific routes) ─────────────
  server.addHook("onRequest", async (request, reply) => {
    const routeKey = `${request.method} ${request.url.split("?")[0]}`;
    if (!API_KEY_ROUTES.has(routeKey)) return;

    const apiKey = request.headers["x-api-key"];
    if (apiKey !== env.SUN_API_SECRET) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  // ── Routes ──────────────────────────────────────────────────────────
  await server.register(healthRoute);
  await server.register(availabilityRoute);
  await server.register(bookingsRoutes);

  return server;
}
```

## `src/config/env.ts`

```typescript
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Google Calendar OAuth2
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REFRESH_TOKEN: z.string().min(1, "GOOGLE_REFRESH_TOKEN is required"),
  GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID is required"),

  // Resend
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  EMAIL_FROM: z.string().min(1, "EMAIL_FROM is required (e.g. 'Name <email@domain>')"),

  // Host
  HOST_EMAIL: z.string().email("HOST_EMAIL must be a valid email"),

  // Security
  SUN_API_SECRET: z.string().min(1, "SUN_API_SECRET is required"),
  APPROVAL_TOKEN_SECRET: z.string().min(1, "APPROVAL_TOKEN_SECRET is required"),

  // URLs
  BASE_URL: z.string().url("BASE_URL must be a valid URL"),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(`\n❌ Invalid environment variables:\n${formatted}\n`);
    process.exit(1);
  }

  return Object.freeze(result.data);
}

export const env = loadEnv();

export type Env = z.infer<typeof envSchema>;
```

## `src/config/availability.ts`

```typescript
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

/** Fixed IST offset — India does not observe DST, so no timezone library needed. */
export const TIMEZONE_OFFSET = "+05:30";
```

## `src/lib/calendar.ts`

```typescript
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
```

## `src/lib/email.ts`

```typescript
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
```

## `src/lib/html.ts`

```typescript
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
```

## `src/lib/ics.ts`

```typescript
/**
 * Generates an ICS (iCalendar) file string for email attachments.
 *
 * Uses METHOD:REQUEST so mail clients render it as an actionable invite
 * with an "Add to Calendar" affordance, not a static event.
 *
 * The client is listed as an attendee *inside the ICS file* (separate from
 * Google Calendar's own attendees array, which is now empty). This is what
 * gives the client's mail app a proper RSVP experience.
 */
import { createEvent, type EventAttributes } from "ics";
import { SLOT_DURATION_MINUTES, TIMEZONE_OFFSET } from "../config/availability.js";
import { env } from "../config/env.js";

/**
 * Extract the raw email address from an EMAIL_FROM string like
 * "Marmik Soni <bookings@marmiksoni.co>" → "bookings@marmiksoni.co"
 */
function extractEmail(fromString: string): string {
  const match = fromString.match(/<(.+)>/);
  return match?.[1] ?? fromString;
}

export function generateIcs(params: {
  name: string;
  email: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  notes?: string | undefined;
}): string {
  // Parse the local IST time into a UTC Date object
  const startDate = new Date(`${params.date}T${params.time}:00${TIMEZONE_OFFSET}`);

  // ics package DateArray uses 1-based months.
  // We convert through UTC methods since we already have a proper UTC Date.
  const start: [number, number, number, number, number] = [
    startDate.getUTCFullYear(),
    startDate.getUTCMonth() + 1, // getUTCMonth() is 0-based → ics wants 1-based
    startDate.getUTCDate(),
    startDate.getUTCHours(),
    startDate.getUTCMinutes(),
  ];

  const event: EventAttributes = {
    start,
    startInputType: "utc",
    duration: { minutes: SLOT_DURATION_MINUTES },
    title: `Booking with ${params.name}`,
    description: params.notes ?? "",
    method: "REQUEST",
    organizer: { name: "Marmik Soni", email: extractEmail(env.EMAIL_FROM) },
    attendees: [
      {
        name: params.name,
        email: params.email,
        rsvp: true,
        partstat: "NEEDS-ACTION",
        role: "REQ-PARTICIPANT",
      },
    ],
  };

  const { error, value } = createEvent(event);
  if (error) {
    throw new Error(`ICS generation failed: ${error.message}`);
  }
  return value!;
}
```

## `src/lib/approval-token.ts`

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

interface TokenEnvelope<T> {
  data: T;
  expiresAt: number;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

/**
 * Signs a payload with HMAC-SHA256 and returns a URL-safe token string.
 *
 * Format: `base64url(json_payload).base64url(hmac_signature)`
 *
 * The payload is wrapped with an `expiresAt` timestamp. Generic —
 * works for both approval tokens and cancellation tokens.
 */
export function signToken<T>(payload: T, expiresInSeconds: number): string {
  const envelope: TokenEnvelope<T> = {
    data: payload,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(envelope)));
  const hmac = createHmac("sha256", env.APPROVAL_TOKEN_SECRET).update(payloadB64).digest();
  const sigB64 = toBase64Url(hmac);

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies a signed token. Returns the original payload if valid,
 * or `null` if tampered, malformed, or expired.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyToken<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  // Recompute HMAC
  const expectedHmac = createHmac("sha256", env.APPROVAL_TOKEN_SECRET).update(payloadB64).digest();

  const providedHmac = fromBase64Url(sigB64);

  // Timing-safe comparison
  if (expectedHmac.length !== providedHmac.length) return null;
  if (!timingSafeEqual(expectedHmac, providedHmac)) return null;

  // Decode and parse
  let envelope: TokenEnvelope<T>;
  try {
    const json = fromBase64Url(payloadB64).toString("utf-8");
    envelope = JSON.parse(json) as TokenEnvelope<T>;
  } catch {
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (now > envelope.expiresAt) return null;

  return envelope.data;
}
```

## `src/lib/approval-token.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing the module under test
vi.mock("../config/env.js", () => ({
  env: {
    APPROVAL_TOKEN_SECRET: "test-secret-for-unit-tests-only",
  },
}));

// Import after mocking
const { signToken, verifyToken } = await import("../lib/approval-token.js");

describe("approval-token", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });

  it("round-trips a payload through sign and verify", () => {
    const payload = { name: "Alice", email: "alice@test.com" };
    const token = signToken(payload, 3600);
    const result = verifyToken<typeof payload>(token);
    expect(result).toEqual(payload);
  });

  it("works with different payload shapes", () => {
    const payload = { eventId: "evt_123", date: "2026-08-23" };
    const token = signToken(payload, 3600);
    const result = verifyToken<typeof payload>(token);
    expect(result).toEqual(payload);
  });

  it("rejects a token with tampered payload", () => {
    const token = signToken({ name: "Alice" }, 3600);
    const [_payload, sig] = token.split(".");

    // Tamper with the payload
    const tampered = Buffer.from(
      JSON.stringify({ data: { name: "Eve" }, expiresAt: 9999999999 }),
    ).toString("base64url");

    const result = verifyToken(`${tampered}.${sig}`);
    expect(result).toBeNull();
  });

  it("rejects a token with tampered signature", () => {
    const token = signToken({ name: "Alice" }, 3600);
    const [payload] = token.split(".");

    const result = verifyToken(`${payload}.dGFtcGVyZWQ`);
    expect(result).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken({ name: "Alice" }, 60); // 60 seconds

    // Advance time past expiry
    vi.advanceTimersByTime(61 * 1000);

    const result = verifyToken(token);
    expect(result).toBeNull();
  });

  it("accepts a token that has not expired yet", () => {
    const token = signToken({ name: "Alice" }, 3600);

    // Advance time, but not past expiry
    vi.advanceTimersByTime(1800 * 1000);

    const result = verifyToken<{ name: string }>(token);
    expect(result).toEqual({ name: "Alice" });
  });

  it("rejects a completely malformed token", () => {
    expect(verifyToken("not-a-real-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("a.b.c")).toBeNull();
  });
});
```

## `src/schemas/booking.ts`

```typescript
import { z } from "zod";

/** Query params for GET /availability */
export const AvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

/** Request body for POST /bookings */
export const CreateBookingSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("email must be valid"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:mm"),
  notes: z.string().max(500, "notes must be 500 characters or fewer").optional(),
});

export type CreateBooking = z.infer<typeof CreateBookingSchema>;

/** Query params for approve/reject/cancel token routes */
export const TokenQuerySchema = z.object({
  token: z.string().min(1, "token is required"),
});

export type TokenQuery = z.infer<typeof TokenQuerySchema>;

/** Shape of the approval token payload (pending booking, no event yet) */
export interface ApprovalTokenPayload {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
}

/** Shape of the cancel token payload (event already created) */
export interface CancelTokenPayload {
  eventId: string;
  name: string;
  email: string;
  date: string;
  time: string;
}
```

## `src/routes/health.ts`

```typescript
import type { FastifyPluginAsync } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoute;
```

## `src/routes/availability.ts`

```typescript
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
```

## `src/routes/bookings.ts`

```typescript
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
```

## `src/routes/routes.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../config/env.js", () => ({
  env: {
    PORT: 3000,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REFRESH_TOKEN: "test-refresh-token",
    GOOGLE_CALENDAR_ID: "test-calendar-id",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "Test <test@example.com>",
    HOST_EMAIL: "host@example.com",
    SUN_API_SECRET: "test-api-secret",
    APPROVAL_TOKEN_SECRET: "test-approval-secret",
    BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("../lib/calendar.js", () => ({
  computeAvailableSlots: vi.fn(),
  isSlotFree: vi.fn(),
  createEvent: vi.fn(),
  cancelEvent: vi.fn(),
  getBusyIntervals: vi.fn(),
}));

vi.mock("../lib/email.js", () => ({
  sendHostBookingNotification: vi.fn(),
  sendApprovalRequest: vi.fn(),
  sendClientPendingNotice: vi.fn(),
  sendClientBookingConfirmation: vi.fn(),
  sendClientDeclineNotice: vi.fn(),
  sendCancellationNotice: vi.fn(),
}));

vi.mock("../lib/ics.js", () => ({
  generateIcs: vi.fn(),
}));

// Import mocked modules for assertion access
const { computeAvailableSlots, isSlotFree, createEvent, cancelEvent } =
  await import("../lib/calendar.js");
const {
  sendHostBookingNotification,
  sendApprovalRequest,
  sendClientPendingNotice,
  sendClientBookingConfirmation,
  sendClientDeclineNotice,
  sendCancellationNotice,
} = await import("../lib/email.js");
const { generateIcs } = await import("../lib/ics.js");
const { signToken } = await import("../lib/approval-token.js");
const { buildServer } = await import("../server.js");

type ApprovalTokenPayload = {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
};

type CancelTokenPayload = {
  eventId: string;
  name: string;
  email: string;
  date: string;
  time: string;
};

// ─── Test setup ────────────────────────────────────────────────────────

const API_KEY = "test-api-secret";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ─── GET /health ───────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status, uptime, and timestamp", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ─── GET /availability ─────────────────────────────────────────────────

describe("GET /availability", () => {
  it("returns 401 without API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/availability?date=2026-08-22",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid date format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/availability?date=not-a-date",
      headers: { "x-api-key": API_KEY },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with slots for a valid date", async () => {
    vi.mocked(computeAvailableSlots).mockResolvedValue([
      { start: "2026-08-22T03:30:00.000Z", end: "2026-08-22T04:00:00.000Z", type: "instant" },
      { start: "2026-08-22T04:00:00.000Z", end: "2026-08-22T04:30:00.000Z", type: "instant" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/availability?date=2026-08-22",
      headers: { "x-api-key": API_KEY },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.date).toBe("2026-08-22");
    expect(body.data.slots).toHaveLength(2);
    expect(body.data.slots[0]).toEqual({ start: "09:00", end: "09:30", type: "instant" });
    expect(body.data.slots[1]).toEqual({ start: "09:30", end: "10:00", type: "instant" });
  });
});

// ─── POST /bookings ────────────────────────────────────────────────────

describe("POST /bookings", () => {
  const validBooking = {
    name: "Alice",
    email: "alice@example.com",
    date: "2026-08-23", // Saturday → instant
    time: "10:00",
    notes: "Test booking",
  };

  it("returns 401 without API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: validBooking,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when slot is taken", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(false);

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(409);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("instant-books and returns 'booked' for Saturday", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_123" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics-content");
    vi.mocked(sendClientBookingConfirmation).mockResolvedValue();
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("booked");

    // Ensure createEvent does not receive attendeeEmail
    expect(createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ attendeeEmail: expect.anything() }),
    );

    expect(generateIcs).toHaveBeenCalledOnce();
    expect(sendClientBookingConfirmation).toHaveBeenCalledWith(
      "alice@example.com",
      expect.any(Object),
      "mock-ics-content",
    );
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: true }),
    );
  });

  it("instant-books even if client email fails, and flags clientNotified: false", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_123" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics-content");
    vi.mocked(sendClientBookingConfirmation).mockRejectedValue(new Error("Email error"));
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(200); // Booking still succeeds

    expect(sendClientBookingConfirmation).toHaveBeenCalledOnce();
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: false }),
    );
  });

  it("sends approval request for request-type days (weekday)", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(sendApprovalRequest).mockResolvedValue();
    vi.mocked(sendClientPendingNotice).mockResolvedValue();

    const weekdayBooking = {
      ...validBooking,
      date: "2026-08-25", // Tuesday → request
    };

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: weekdayBooking,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("pending_approval");

    expect(createEvent).not.toHaveBeenCalled();
    expect(sendApprovalRequest).toHaveBeenCalledOnce();
    expect(sendClientPendingNotice).toHaveBeenCalledOnce();
  });

  it("returns 500 when host approval email send fails", async () => {
    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(sendApprovalRequest).mockRejectedValue(new Error("Email send failed"));

    const weekdayBooking = {
      ...validBooking,
      date: "2026-08-25", // Tuesday → request
    };

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": API_KEY },
      payload: weekdayBooking,
    });

    expect(res.statusCode).toBe(500);
    // If approval request to host fails, the client pending notice shouldn't be sent
    expect(sendClientPendingNotice).not.toHaveBeenCalled();
  });
});

// ─── Approve routes ────────────────────────────────────────────────────

describe("GET /bookings/approve", () => {
  it("shows confirmation page and does NOT call createEvent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/approve?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Confirm Approval");
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendHostBookingNotification).not.toHaveBeenCalled();
  });

  it("returns error for expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      60, // 1 minute
    );

    // Advance past expiry
    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "GET",
      url: `/bookings/approve?token=${token}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("Invalid or expired token");
  });
});

describe("POST /bookings/approve", () => {
  it("creates event and sends emails when token is valid and slot is free", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(isSlotFree).mockResolvedValue(true);
    vi.mocked(createEvent).mockResolvedValue({ eventId: "evt_456" });
    vi.mocked(generateIcs).mockReturnValue("mock-ics");
    vi.mocked(sendClientBookingConfirmation).mockResolvedValue();
    vi.mocked(sendHostBookingNotification).mockResolvedValue();

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Approved");
    expect(res.body).toContain("A confirmation email has been sent");

    // Ensure createEvent does not receive attendeeEmail
    expect(createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ attendeeEmail: expect.anything() }),
    );

    expect(sendClientBookingConfirmation).toHaveBeenCalledOnce();
    expect(sendHostBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientNotified: true }),
    );
  });

  it("returns 400 for expired token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      60,
    );

    vi.advanceTimersByTime(120 * 1000);

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("returns 409 when slot is taken", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(isSlotFree).mockResolvedValue(false);

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/approve",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain("No Longer Available");
    expect(createEvent).not.toHaveBeenCalled();
  });
});

// ─── Reject routes ─────────────────────────────────────────────────────

describe("GET /bookings/reject", () => {
  it("shows confirmation page and does NOT send email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/reject?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Confirm Rejection");
    expect(sendClientDeclineNotice).not.toHaveBeenCalled();
  });
});

describe("POST /bookings/reject", () => {
  it("sends decline notice when token is valid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(sendClientDeclineNotice).mockResolvedValue();

    const token = signToken<ApprovalTokenPayload>(
      { name: "Alice", email: "alice@example.com", date: "2026-08-22", time: "10:00" },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/reject",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Rejected");
    expect(sendClientDeclineNotice).toHaveBeenCalledOnce();
  });
});

// ─── Cancel routes ─────────────────────────────────────────────────────

describe("GET /bookings/cancel", () => {
  it("shows confirmation page and does NOT call cancelEvent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_789",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      3600,
    );

    const res = await app.inject({
      method: "GET",
      url: `/bookings/cancel?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Confirm Cancellation");
    expect(cancelEvent).not.toHaveBeenCalled();
  });
});

describe("POST /bookings/cancel", () => {
  it("cancels event and notifies client when token is valid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));

    vi.mocked(cancelEvent).mockResolvedValue();
    vi.mocked(sendCancellationNotice).mockResolvedValue();

    const token = signToken<CancelTokenPayload>(
      {
        eventId: "evt_789",
        name: "Alice",
        email: "alice@example.com",
        date: "2026-08-22",
        time: "10:00",
      },
      3600,
    );

    const res = await app.inject({
      method: "POST",
      url: "/bookings/cancel",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `token=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Booking Cancelled");
    expect(res.body).toContain("cancellation notice has been sent");

    expect(cancelEvent).toHaveBeenCalledWith("evt_789");
    expect(sendCancellationNotice).toHaveBeenCalledOnce();
  });
});
```
