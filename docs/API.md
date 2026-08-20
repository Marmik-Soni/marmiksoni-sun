# API Reference

All requests and responses use `application/json`.
Trusted API endpoints require the `Authorization` header with a Bearer token matching the `SUN_API_SECRET` environment variable.

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

- **Auth**: `SUN_API_SECRET` header
- **Query Params**:
  - `date` (string, required): Format `YYYY-MM-DD`
- **Response**: `200 OK`
  ```json
  {
    "ok": true,
    "data": {
      "date": "2026-08-20",
      "slots": [
        "09:00",
        "09:30",
        "10:00"
      ]
    }
  }
  ```
- **Error**: `400 Bad Request` (Invalid date format)

---

## `POST /bookings`
Submits a booking request. Depending on the day of the week, this either instant-books the event or sends an approval request email to the host.

- **Auth**: `SUN_API_SECRET` header
- **Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "date": "2026-08-20",
    "time": "09:00",
    "durationMinutes": 30,
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
Approves a pending booking. This endpoint is hit directly from a link in the host's email client.

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page confirming success) or redirect.
- **Error**: `400 Bad Request` (Invalid/expired token), `409 Conflict` (Slot taken in the meantime)

---

## `GET /bookings/reject`
Rejects a pending booking. Hit directly from a link in the host's email client. Sends a decline notice to the requester.

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload
- **Response**: `200 OK` (HTML page confirming rejection).
- **Error**: `400 Bad Request` (Invalid token).

---

## `GET /bookings/cancel`
Cancels an existing, approved booking. Hit directly from a link in the client's or host's email. Deletes the Google Calendar event and notifies attendees.

- **Auth**: None (Relies on signed token)
- **Query Params**:
  - `token` (string, required): HMAC-signed state payload containing the calendar event ID
- **Response**: `200 OK` (HTML page confirming cancellation).
- **Error**: `400 Bad Request` (Invalid token).
