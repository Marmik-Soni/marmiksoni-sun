import type { FastifyPluginAsync } from "fastify";
import { TokenQuerySchema, type CancelTokenPayload } from "../schemas/booking.js";
import { verifyToken } from "../lib/approval-token.js";
import { performCancellation } from "./bookings.js";

// eslint-disable-next-line @typescript-eslint/require-await
const apiBookingsRoutes: FastifyPluginAsync = async (app) => {
  // GET — preview only, no side effects. Mirrors why the HTML flow
  // splits GET/POST: page load must never trigger the real cancellation.
  app.get("/api/bookings/cancel", async (request, reply) => {
    const parsed = TokenQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Missing or invalid token." });
    }

    const payload = verifyToken<CancelTokenPayload>(parsed.data.token);
    if (!payload) {
      return reply.status(400).send({ ok: false, error: "Invalid or expired token." });
    }

    return { ok: true, data: { name: payload.name, date: payload.date, time: payload.time } };
  });

  // POST — executes the cancellation. Body is JSON (server-to-server
  // call from the frontend's backend), not form-urlencoded.
  app.post("/api/bookings/cancel", async (request, reply) => {
    const parsed = TokenQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Missing or invalid token." });
    }

    // notify: "host" — a *client* cancelling means the *host* needs to know.
    // Symmetric to the existing HTML route where the host cancelling notifies the client.
    const result = await performCancellation(parsed.data.token, "host", app.log);
    if (!result.ok) {
      return reply.status(result.status).send({ ok: false, error: result.error });
    }

    return {
      ok: true,
      data: { name: result.payload.name, date: result.payload.date, time: result.payload.time },
    };
  });
};

export default apiBookingsRoutes;
