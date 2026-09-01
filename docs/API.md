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

Cancels an existing, approved booking. Deletes the Google Calendar event and sends a cancellation notice to the client via Resend.

- **Auth**: None (Relies on signed token in form body)
- **Body** (`application/x-www-form-urlencoded`):
  - `token` (string, required): HMAC-signed state payload containing the calendar event ID
- **Response**: `200 OK` (HTML page confirming the cancellation)
- **Error**: `400 Bad Request` (Invalid token)
