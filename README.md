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
