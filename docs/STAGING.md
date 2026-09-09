# Staging Environment & Deployment Guide

This document provides a comprehensive operational guide for the `sun-backend` staging environment, including hosting infrastructure, DNS routing, environment variables, and verification procedures.

---

## 1. Overview & Architecture

The staging environment mirrors production while providing an isolated sandbox for end-to-end testing, frontend integration, and live smoke tests without polluting production domains or calendars.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 DNS (Cloudflare)                        │
                  │   staging-sun.marmiksoni.co (CNAME, DNS-only)           │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │                 Render (Web Service)                    │
                  │   - Service: marmiksoni-sun-staging                     │
                  │   - Branch: staging (auto-deploy enabled)               │
                  │   - Container: Multi-stage Docker (Node 24 Alpine)      │
                  │   - Port: 3000                                          │
                  │   - Health Check: /health                               │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
     ┌──────────────────────────────┐                  ┌──────────────────────────────┐
     │      Google Calendar API     │                  │      Resend Email API        │
     │      (OAuth2 / FreeBusy)     │                  │      (Transaction Emails)    │
     └──────────────────────────────┘                  └──────────────────────────────┘
```

| Parameter                 | Value                                         |
| :------------------------ | :-------------------------------------------- |
| **Hosting Platform**      | Render (Docker Web Service)                   |
| **Service Name**          | `marmiksoni-sun-staging`                      |
| **Primary Live URL**      | `https://staging-sun.marmiksoni.co`           |
| **Render Fallback URL**   | `https://marmiksoni-sun-staging.onrender.com` |
| **Deployment Branch**     | `staging`                                     |
| **Auto-Deploy**           | Enabled on `push` to `staging`                |
| **Health Check Endpoint** | `/health`                                     |

---

## 2. Cloudflare DNS Configuration

The staging domain is managed under Cloudflare DNS for `marmiksoni.co`.

### DNS Record Details

- **Type:** `CNAME`
- **Name:** `staging-sun` (resolves to `staging-sun.marmiksoni.co`)
- **Target:** `marmiksoni-sun-staging.onrender.com`
- **Proxy Status:** **DNS Only (Gray Cloud)** ⚠️
- **TTL:** `Auto`

> [!IMPORTANT]
> **Why Proxy Status MUST be DNS Only (Gray Cloud):**
> Render automatically manages SSL/TLS certificates through Let's Encrypt / DigiCert using HTTP-01 and DNS ACME verification.
> If Cloudflare Proxy is enabled (Orange Cloud), Cloudflare terminates TLS at its edge, preventing Render from verifying domain ownership directly during issuance. This causes persistent `Certificate Error` states in the Render dashboard. Setting Cloudflare to **DNS Only** lets Render issue and renew certificates seamlessly.

---

## 3. Environment Variables

All secrets and environment variables are injected securely at runtime via the Render Dashboard (**Environment** tab). They are never baked into the Docker image.

| Key                     | Example / Value                             | Description                                                 |
| :---------------------- | :------------------------------------------ | :---------------------------------------------------------- |
| `PORT`                  | `3000`                                      | Port Fastify binds to (must match Docker `EXPOSE 3000`)     |
| `HOST`                  | `0.0.0.0`                                   | Bind address for container networking                       |
| `NODE_ENV`              | `production`                                | Enables production optimizations and security defaults      |
| `LOG_LEVEL`             | `info`                                      | Pino logging level (`info` in staging/prod, `debug` in dev) |
| `BASE_URL`              | `https://staging-sun.marmiksoni.co`         | Base URL used to construct HMAC email action links          |
| `PUBLIC_APP_URL`        | `https://staging.marmiksoni.co`             | Staging frontend application origin                         |
| `GOOGLE_CLIENT_ID`      | `932968032428-*.apps.googleusercontent.com` | Google Cloud OAuth2 client ID                               |
| `GOOGLE_CLIENT_SECRET`  | `GOCSPX-*`                                  | Google Cloud OAuth2 client secret                           |
| `GOOGLE_REFRESH_TOKEN`  | `1//04*`                                    | Google OAuth2 refresh token with calendar scope             |
| `GOOGLE_CALENDAR_ID`    | `primary`                                   | Target Google Calendar ID                                   |
| `RESEND_API_KEY`        | `re_*`                                      | Resend API key for outbound transaction emails              |
| `EMAIL_FROM`            | `Marmik Soni <bookings@marmiksoni.co>`      | Verified sender address                                     |
| `HOST_EMAIL`            | `hello@marmiksoni.co`                       | Host recipient for new booking notices                      |
| `SUN_API_SECRET`        | `dfa44c12*` (64-char hex)                   | Shared secret required in `x-api-key` header                |
| `APPROVAL_TOKEN_SECRET` | `815930cb*` (64-char hex)                   | Secret key for HMAC-SHA256 signed action tokens             |

---

## 4. Health Checks & Verification

Render uses Fastify's `/health` endpoint to monitor container health and zero-downtime rollouts.

### A. Health Check Query

```bash
curl -s "https://staging-sun.marmiksoni.co/health"
```

**Expected Response (HTTP 200):**

```json
{
  "status": "ok",
  "uptime": 248.12,
  "timestamp": "2026-09-09T09:40:00.000Z"
}
```

### B. Security & API Key Guard Check

```bash
# Missing API key (Expected HTTP 401)
curl -i -s "https://staging-sun.marmiksoni.co/availability?date=2026-09-15"

# Valid API key (Expected HTTP 200)
curl -s -H "x-api-key: <SUN_API_SECRET>" \
  "https://staging-sun.marmiksoni.co/availability?date=2026-09-15"
```

### C. Host Action Form Check

To preview the interactive HTML confirmation page without modifying calendar state:

```bash
# Generate a test HMAC token and open in browser:
https://staging-sun.marmiksoni.co/bookings/approve?token=<SIGNED_TOKEN>
```

---

## 5. Deployment Workflow

1. Developers branch off `staging` (`feat/*`).
2. Pull requests target `staging`.
3. GitHub Actions runs CI:
   - TypeScript check (`pnpm typecheck`)
   - ESLint (`pnpm lint`)
   - Prettier (`pnpm format:check`)
   - Vitest unit tests (`pnpm test`)
   - Playwright live staging smoke tests (`pnpm test:e2e:staging`)
4. When PR is merged to `staging`:
   - Render automatically initiates a new Docker build and deploys.
   - Zero-downtime deployment verifies `/health` before traffic cutover.
