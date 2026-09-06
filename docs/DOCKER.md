# Docker Guide

This document covers building, running, verifying, and troubleshooting the `sun-backend` Docker image.

---

## Image Architecture

The Dockerfile uses a **multi-stage build**:

| Stage       | Base Image       | Purpose                                        | Kept in Final Image? |
| ----------- | ---------------- | ---------------------------------------------- | -------------------- |
| **Builder** | `node:24-alpine` | Install all deps, compile TypeScript via `tsc` | No                   |
| **Runtime** | `node:24-alpine` | Production deps only + compiled `dist/`        | Yes                  |

This ensures the final image contains **no TypeScript compiler, no test frameworks, no linting tools, and no source code** — only the compiled JavaScript and production `node_modules`.

Both stages use `--ignore-scripts` on `pnpm install` to skip lifecycle scripts (`husky`, esbuild native builds) that fail or are unnecessary inside containers.

---

## Prerequisites

- Docker Desktop installed and running
- A valid `.env` file in the repo root (see `.env.example`)

---

## Build

```bash
docker build -t sun-backend:latest .
```

Typical build time: ~60–90s on a fresh build (mostly npm registry download time). Subsequent builds with cached layers are much faster.

---

## Run

The `PORT` in your `.env` determines what port the app listens on **inside** the container. The default `.env.example` uses `PORT=3000`, but if your `.env` uses a different port (e.g., `PORT=30000`), adjust the mapping accordingly.

```bash
# If .env has PORT=3000
docker run -d -p 3000:3000 --env-file .env --name sun-backend sun-backend:latest

# If .env has PORT=30000
docker run -d -p 3000:30000 --env-file .env --name sun-backend sun-backend:latest
```

The left side of `-p` is the host port you access; the right side must match `PORT` from `.env`.

### Useful Commands

```bash
# View logs (follow mode)
docker logs -f sun-backend

# Stop the container
docker stop sun-backend

# Restart the container
docker restart sun-backend

# Stop and remove
docker stop sun-backend && docker rm sun-backend

# Force remove (even if running)
docker rm -f sun-backend
```

---

## Verification Checklist

After starting the container, run these checks to confirm everything works:

### 1. Health Check

```bash
curl http://localhost:3000/health
```

**Expected:** `200 OK` with `{"status":"ok","uptime":...,"timestamp":"..."}`

This proves all required env vars loaded and passed Zod validation at startup.

### 2. Live Google Calendar API

```bash
curl -H "x-api-key: <SUN_API_SECRET>" "http://localhost:3000/availability?date=2026-09-08"
```

**Expected:** `200 OK` with real slot data from Google Calendar.

This proves outbound network access and DNS resolution work from inside the container.

### 3. No Dev Dependencies in Runtime

```bash
docker exec sun-backend sh -c "ls node_modules | grep -i typescript"
```

**Expected:** Empty output. TypeScript and other dev deps should not be in the production image.

### 4. No `.env` Baked Into Image

```bash
docker exec sun-backend sh -c "test -f .env && echo FOUND || echo NOT-FOUND"
```

**Expected:** `NOT-FOUND`. Secrets are excluded by `.dockerignore` and injected at runtime via `--env-file`.

### 5. Image Size

```bash
docker images sun-backend
```

For reference only — no specific target. Expect ~120–140 MB content size.

---

## Troubleshooting

### `Invalid environment variables` on startup

**Symptom:** Container exits immediately with Zod validation errors like:

```
❌ Invalid environment variables:
  ✗ HOST_EMAIL: HOST_EMAIL must be a valid email
```

**Cause:** Docker's `--env-file` parser behaves differently from Node's `dotenv`:

- It does **not** strip surrounding quotes — `HOST_EMAIL="foo@bar.com"` passes the literal `"foo@bar.com"` (with quotes) as the value.
- On Windows, `.env` files often have CRLF (`\r\n`) line endings. Docker on Linux doesn't strip `\r`, so values get a trailing carriage return.

**Fix:** Ensure your `.env` file:

1. Uses **LF** line endings (not CRLF). In VS Code: click `CRLF` in the status bar → select `LF`.
2. Has **no surrounding quotes** on values:
   ```env
   # ✅ Correct for Docker
   HOST_EMAIL=foo@bar.com

   # ❌ Wrong — Docker will include the quotes in the value
   HOST_EMAIL="foo@bar.com"
   ```

> **Note:** `dotenv` (used in `pnpm dev`) handles both formats fine. This issue is specific to Docker's `--env-file` flag.

### Container name conflict

**Symptom:**

```
docker: Error response from daemon: Conflict. The container name "/sun-backend" is already in use
```

**Fix:** Remove the existing container first:

```bash
docker rm -f sun-backend
```

### `--env-file: open .env: The system cannot find the file specified`

**Fix:** Run the `docker run` command from the repo root directory where `.env` exists, or use an absolute path:

```bash
docker run -d -p 3000:30000 --env-file /full/path/to/.env --name sun-backend sun-backend:latest
```

### Build fails with `ERR_PNPM_IGNORED_BUILDS`

**Symptom:**

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
```

**Cause:** pnpm's strict build-script policy blocks unapproved native module postinstall scripts.

**Current fix:** The Dockerfile uses `--ignore-scripts` on both install steps. This is safe because `tsc` (the build tool) doesn't depend on any postinstall scripts.

### Build fails with `Invalid package manager specification`

**Symptom:**

```
Invalid package manager specification in package.json (pnpm@^11.22.0); expected a semver version
```

**Cause:** Corepack in Node 24 reads `devEngines.packageManager` and rejects semver ranges.

**Fix:** Ensure `package.json` has the `packageManager` field with an exact version:

```json
"packageManager": "pnpm@11.22.0"
```

---

## What `.dockerignore` Excludes

| Pattern        | Reason                                                       |
| -------------- | ------------------------------------------------------------ |
| `node_modules` | Rebuilt inside the container; host modules may be wrong arch |
| `dist`         | Rebuilt by `tsc` in the builder stage                        |
| `.env`         | Live credentials — injected at runtime, never baked in       |
| `.env.*`       | Same as above for variant env files                          |
| `.git`         | Git history is unnecessary and bloats the build context      |
| `.github`      | CI workflows are not needed inside the container             |
| `coverage`     | Test artifacts, not needed in production                     |
| `*.md`         | Documentation, not needed in production                      |
