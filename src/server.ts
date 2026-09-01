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
